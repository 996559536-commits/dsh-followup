import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, copyFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { hostname } from 'node:os';
import { DomainError, parseDraft, type State } from '../core/model';

function validate(value: unknown): State {
  const v = value as State;
  if (!v || v.schemaVersion !== 1 || typeof v.scopeId !== 'string' || !Number.isSafeInteger(v.revision) || v.revision < 0 || !Array.isArray(v.todos) || !Array.isArray(v.reminders) || !Array.isArray(v.receipts)) throw new Error('待办数据格式或版本无效');
  const ids = new Set<string>();
  for (const todo of v.todos) {
    parseDraft(todo, v.scopeId);
    if (typeof todo.id !== 'string' || ids.has(todo.id) || !['open','done'].includes(todo.status) || !Number.isSafeInteger(todo.version) || todo.version < 1 || !Number.isSafeInteger(todo.scheduleVersion)) throw new Error('待办记录无效');
    ids.add(todo.id);
    for (const key of ['createdAt','updatedAt','completedAt','deletedAt'] as const) if (todo[key] !== null && !Number.isFinite(Date.parse(todo[key]!))) throw new Error('待办时间字段无效');
  }
  for (const e of v.reminders) if (typeof e.id !== 'string' || typeof e.todoId !== 'string' || !Number.isFinite(Date.parse(e.triggerAt))) throw new Error('提醒记录无效');
  return v;
}
export class Repository {
  private state!: State;
  private queue: Promise<unknown> = Promise.resolve();
  private lockToken = randomUUID();
  private locked = false;
  private closed = false;
  readonly file: string;
  recoveryNotice: string | null = null;
  constructor(readonly dataDir: string) { this.file = join(dataDir, 'state.json'); }
  async load(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await this.acquire();
    try {
      try { this.state = validate(JSON.parse(await readFile(this.file, 'utf8'))); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          this.state = { schemaVersion: 1, scopeId: randomUUID(), revision: 0, todos: [], reminders: [], receipts: [] };
          await this.write(this.state, false);
        } else {
          const corrupt = `${this.file}.corrupt-${Date.now()}`;
          await copyFile(this.file, corrupt);
          try {
            this.state = validate(JSON.parse(await readFile(`${this.file}.bak`, 'utf8')));
            await this.write(this.state, false);
            this.recoveryNotice = `已从上次有效备份恢复，原数据保留在 ${corrupt}`;
          } catch { throw new Error(`待办数据无法读取。已保留原件 ${corrupt}，为防止覆盖，插件停止写入。`); }
        }
      }
    } catch (error) { await this.release(); throw error; }
  }
  snapshot(): State { return structuredClone(this.state); }
  transact<T>(fn: (draft: State) => T | Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new DomainError('closed', '待办服务已关闭', 503));
    const task = this.queue.then(async () => {
      const draft = this.snapshot(); const result = await fn(draft);
      if (JSON.stringify(draft) !== JSON.stringify(this.state)) {
        draft.revision = this.state.revision + 1;
        await this.write(validate(draft), true);
        this.state = draft;
      }
      return result;
    });
    this.queue = task.catch(() => {}); return task;
  }
  async close() { this.closed = true; await this.queue; await this.release(); }
  private async acquire() {
    const path = `${this.file}.lock`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const h = await open(path, 'wx', 0o600);
        try { await h.writeFile(JSON.stringify({ pid: process.pid, host: hostname(), token: this.lockToken })); await h.sync(); } finally { await h.close(); }
        this.locked = true; return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const before = await stat(path);
        let owner: { pid: number; host: string; token: string };
        try { owner = JSON.parse(await readFile(path, 'utf8')); } catch { throw new Error('待办存储锁无效，请检查是否有另一个 Host 正在启动'); }
        let alive = true;
        if (owner.host === hostname() && Number.isSafeInteger(owner.pid) && owner.pid > 0) {
          try { process.kill(owner.pid, 0); } catch (e) { alive = (e as NodeJS.ErrnoException).code !== 'ESRCH'; }
        }
        if (alive || attempt > 0) throw new Error('另一个 DSH Host 正在使用这个待办目录');
        const current = await stat(path);
        if (before.ino !== current.ino) throw new Error('待办存储正在被另一个 Host 接管，请稍后重试');
        await unlink(path);
      }
    }
  }
  private async release() {
    if (!this.locked) return;
    const path = `${this.file}.lock`;
    try { const owner = JSON.parse(await readFile(path,'utf8')); if (owner.token === this.lockToken) await unlink(path); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    this.locked = false;
  }
  private async write(state: State, backup: boolean) {
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      const h = await open(temp, 'wx', 0o600);
      try { await h.writeFile(JSON.stringify(state, null, 2)); await h.sync(); } finally { await h.close(); }
      if (backup) {
        const backupTemp = `${this.file}.bak.tmp`;
        await copyFile(this.file, backupTemp); await rename(backupTemp, `${this.file}.bak`);
      }
      await rename(temp, this.file);
      const directory = await open(dirname(this.file), 'r');
      try { await directory.sync(); } catch (e) { if (!['EINVAL','ENOTSUP','EISDIR'].includes((e as NodeJS.ErrnoException).code ?? '')) throw e; } finally { await directory.close(); }
    } catch (error) { await unlink(temp).catch(() => {}); throw error; }
  }
}
