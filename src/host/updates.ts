import { CURRENT_VERSION, UPDATE_MANIFEST_URL, compareVersions, parseRelease, type UpdateSnapshot } from '../core/updates';

export const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
export const ERROR_RETRY_INTERVAL = 30 * 60 * 1000;
export const MANUAL_CHECK_INTERVAL = 60 * 1000;

/** Checks public release metadata only; never sends todos, session data or credentials. */
export class UpdateChecker {
  private value: UpdateSnapshot;
  private pending?: Promise<UpdateSnapshot>;
  private attemptedAt: number | null = null;
  private controller?: AbortController;
  private timer?: ReturnType<typeof setInterval>;
  private closed = false;
  constructor(private options: {version?: string; fetch?: typeof fetch; now?: () => number} = {}) {
    this.value = {currentVersion: options.version ?? CURRENT_VERSION, status: 'idle', latest: null, checkedAt: null, error: null};
  }
  snapshot = (): UpdateSnapshot => structuredClone(this.value);
  check(force = false): Promise<UpdateSnapshot> {
    if (this.pending) return this.pending;
    if (this.closed) return Promise.resolve(this.snapshot());
    const now = (this.options.now ?? Date.now)();
    const interval = force ? MANUAL_CHECK_INTERVAL : this.value.error ? ERROR_RETRY_INTERVAL : CHECK_INTERVAL;
    if (this.attemptedAt !== null && now - this.attemptedAt < interval) return Promise.resolve(this.snapshot());
    this.attemptedAt = now;
    this.value = {...this.value, status: 'checking', error: null};
    const controller = this.controller = new AbortController();
    this.pending = this.load(controller).then(latest => {
      if (!this.closed) this.value = {...this.value, latest, status: compareVersions(latest.version, this.value.currentVersion) > 0 ? 'available' : 'up-to-date', checkedAt: new Date((this.options.now ?? Date.now)()).toISOString(), error: null};
      return this.snapshot();
    }).catch(() => {
      if (!this.closed) this.value = {...this.value, status: 'error', error: '暂时无法检查更新，请检查网络后重试'};
      return this.snapshot();
    }).finally(() => {this.pending = undefined;});
    return this.pending;
  }
  private async load(controller: AbortController) {
    const response = await (this.options.fetch ?? fetch)(UPDATE_MANIFEST_URL, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      headers: {'accept': 'application/json', 'user-agent': `dsh-followup/${this.value.currentVersion}`},
      credentials: 'omit',
    });
    if (!response.ok || !response.body) throw new Error('更新服务不可用');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 32 * 1024) {await reader.cancel(); throw new Error('版本信息过大');}
        chunks.push(value);
      }
    } finally {reader.releaseLock();}
    return parseRelease(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  }
  start() {
    if (this.timer || this.closed) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), 15 * 60 * 1000);
    this.timer.unref?.();
  }
  close() {this.closed = true; if (this.timer) clearInterval(this.timer); this.controller?.abort();}
}
