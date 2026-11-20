import { createHash, randomUUID } from 'node:crypto';
import { DomainError, object, parseDraft, reminderAt, sourceKey, text, type Command, type CommandResult, type State, type Todo } from '../core/model';
import { Repository } from './repository';

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};
export class TodoService {
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;
  constructor(readonly repository: Repository, private now = () => new Date()) {}
  snapshot() { return { ...this.repository.snapshot(), receipts: undefined, recoveryNotice: this.repository.recoveryNotice }; }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit() { for (const listener of this.listeners) { try { listener(); } catch { /* One client must not block the others. */ } } }
  async command(input: unknown): Promise<CommandResult> {
    const c = object(input) as unknown as Command;
    text(c.requestId, '请求 ID', 128, true);
    if (!['create','update','complete','reopen','delete','dismiss-reminder'].includes(c.kind)) throw new DomainError('invalid-input','未知操作');
    const fingerprint = createHash('sha256').update(canonical(c)).digest('hex');
    const previousRevision = this.repository.snapshot().revision;
    const result = await this.repository.transact(state => {
      const receipt = state.receipts.find(r=>r.requestId===c.requestId);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) throw new DomainError('request-conflict','请求 ID 已用于不同内容',409);
        return receipt.result;
      }
      const now = this.now().toISOString();
      let id: string, version: number, duplicate = false;
      if (c.kind === 'create') {
        const draft = parseDraft(c.draft, state.scopeId);
        const key = sourceKey(draft.source);
        const existing = key === null ? undefined : state.todos.find(t=>t.deletedAt===null && sourceKey(t.source)===key);
        if (existing) { id=existing.id; version=existing.version; duplicate=true; }
        else {
          const todo: Todo = { ...draft, id: randomUUID(), status:'open', createdAt:now, updatedAt:now, scheduleUpdatedAt:now, completedAt:null, deletedAt:null, version:1, scheduleVersion:1 };
          state.todos.push(todo); id=todo.id; version=1;
        }
      } else if (c.kind === 'dismiss-reminder') {
        const event = state.reminders.find(e=>e.id===c.id);
        if (!event) throw new DomainError('not-found','提醒不存在',404);
        event.dismissedAt=now; id=event.id; version=1;
      } else {
        const todo = state.todos.find(t=>t.id===c.id && t.deletedAt===null);
        if (!todo) throw new DomainError('not-found','这项待办已删除或不存在',404);
        if (!Number.isSafeInteger(c.expectedVersion) || c.expectedVersion!==todo.version) throw new DomainError('version-conflict','另一窗口已修改这项待办，请重新打开后保存',409);
        const oldAt = reminderAt(todo); const oldMode = todo.reminder;
        if (c.kind === 'update') {
          const draft = parseDraft(c.draft,state.scopeId);
          if (sourceKey(draft.source)!==sourceKey(todo.source)) throw new DomainError('invalid-source','已有待办的来源不能被替换');
          Object.assign(todo,draft);
        } else if (c.kind === 'complete') { todo.status='done'; todo.completedAt=now; }
        else if (c.kind === 'reopen') { todo.status='open'; todo.completedAt=null; if ((reminderAt(todo)??Infinity)<=Date.parse(now)) todo.reminder='none'; }
        else todo.deletedAt=now;
        const scheduleChanged = oldAt!==reminderAt(todo) || oldMode!==todo.reminder || c.kind!=='update';
        if (scheduleChanged) { todo.scheduleVersion++; todo.scheduleUpdatedAt=now; this.cancelReminders(state,todo.id,now); }
        todo.updatedAt=now; todo.version++; id=todo.id; version=todo.version;
      }
      const result: CommandResult = {id,version,revision:state.revision+1,...duplicate?{duplicate:true}:{}};
      state.receipts.push({requestId:c.requestId,fingerprint,result}); state.receipts=state.receipts.slice(-512);
      return result;
    });
    if (this.repository.snapshot().revision!==previousRevision) this.emit();
    await this.tick(); return result;
  }
  private cancelReminders(state: State, todoId: string, now: string) {
    for (const event of state.reminders) if (event.todoId===todoId && event.cancelledAt===null) event.cancelledAt=now;
  }
  async tick() {
    if (this.ticking) return;
    this.ticking=true;
    const before=this.repository.snapshot().revision;
    try {
      await this.repository.transact(state=>{
        const now=this.now();
        for (const todo of state.todos) {
          const at=reminderAt(todo);
          if (todo.deletedAt!==null || todo.status!=='open' || at===null || at>now.getTime() || at<now.getTime()-86_400_000) continue;
          // Setting a past reminder does not create an unexpected immediate alert.
          if (at<Date.parse(todo.scheduleUpdatedAt)) continue;
          const key=`${todo.id}:${todo.scheduleVersion}:${new Date(at).toISOString()}`;
          if (!state.reminders.some(e=>e.id===key)) state.reminders.push({id:key,todoId:todo.id,scheduleVersion:todo.scheduleVersion,triggerAt:new Date(at).toISOString(),createdAt:now.toISOString(),dismissedAt:null,cancelledAt:null,claim:null,deliveredAt:null});
        }
        // Cancelled/dismissed records older than 30 days are bounded; active records remain discoverable.
        state.reminders=state.reminders.filter(e=>!(e.cancelledAt||e.dismissedAt) || Date.parse(e.cancelledAt??e.dismissedAt!)>now.getTime()-30*86_400_000);
      });
      if (this.repository.snapshot().revision!==before) this.emit();
    } finally { this.ticking=false; }
  }
  async claim(input: unknown) {
    const p=object(input); const clientId=text(p.clientId,'窗口 ID',128,true); const id=text(p.id,'提醒 ID',512,true);
    const result=await this.repository.transact(state=>{
      const e=state.reminders.find(x=>x.id===id);
      const todo=state.todos.find(t=>t.id===e?.todoId);
      const now=this.now();
      if (!e || !todo || todo.status!=='open' || todo.deletedAt!==null || e.cancelledAt || e.dismissedAt || e.deliveredAt || Date.parse(e.triggerAt)<now.getTime()-900_000) return null;
      if (p.action==='ack' || p.action==='release') {
        if (e.claim?.clientId!==clientId || e.claim?.token!==p.token) return null;
        if (p.action==='ack') e.deliveredAt=now.toISOString();
        e.claim=null; return {ack:true};
      }
      if (e.claim && Date.parse(e.claim.expiresAt)>now.getTime()) return null;
      const token=randomUUID(); e.claim={clientId,token,expiresAt:new Date(now.getTime()+30_000).toISOString()}; return {token};
    });
    this.emit(); return result;
  }
  start() { this.timer=setInterval(()=>void this.tick().catch(console.error),15_000); this.timer.unref?.(); void this.tick().catch(console.error); }
  async close() { if(this.timer) clearInterval(this.timer); this.listeners.clear(); await this.repository.close(); }
}
