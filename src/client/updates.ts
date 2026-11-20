import { CURRENT_VERSION, hasUpdate, type UpdateSnapshot } from '../core/updates';

interface Api {request<T>(path: string, body?: unknown): Promise<T>}
export interface UpdateState extends UpdateSnapshot {dismissedVersion: string | null}
const DISMISSED_KEY = 'dsh-followup:dismissed-update';
function dismissedVersion() {try {return localStorage.getItem(DISMISSED_KEY);} catch {return null;}}
export class UpdateStore {
  private value: UpdateState = {currentVersion: CURRENT_VERSION, status: 'idle', latest: null, checkedAt: null, error: null, dismissedVersion: dismissedVersion()};
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private active = false;
  private pending?: Promise<void>;
  constructor(private api: Api) {}
  getSnapshot = () => this.value;
  subscribe = (fn: () => void) => {this.listeners.add(fn); return () => {this.listeners.delete(fn);};};
  private publish(value: UpdateState) {this.value = value; for (const fn of this.listeners) fn();}
  private refresh(manual = false): Promise<void> {
    if (this.pending) return this.pending;
    const generation = this.generation;
    if (manual) this.publish({...this.value, status: 'checking', error: null});
    this.pending = this.api.request<UpdateSnapshot>(manual ? 'updates/check' : 'updates', manual ? {} : undefined).then(value => {
      if (generation === this.generation) this.publish({...value, dismissedVersion: this.value.dismissedVersion});
    }).catch(() => {
      if (generation === this.generation) this.publish({...this.value, status: 'error', error: '暂时无法检查更新，请稍后重试'});
    }).finally(() => {if (generation === this.generation) this.pending = undefined;});
    return this.pending;
  }
  check = () => this.refresh(true);
  dismiss = () => {
    if (!hasUpdate(this.value)) return;
    const version = this.value.latest!.version;
    try {localStorage.setItem(DISMISSED_KEY, version);} catch {}
    this.publish({...this.value, dismissedVersion: version});
  };
  start() {
    if (this.active) return; this.active = true;
    const generation = this.generation;
    const poll = async () => {
      await this.refresh();
      if (this.active && generation === this.generation) this.timer = setTimeout(() => void poll(), this.value.status === 'checking' ? 1500 : 60_000);
    };
    void poll();
  }
  reset() {
    this.generation++; this.active = false; if (this.timer) clearTimeout(this.timer); this.pending = undefined;
    this.publish({...this.value, currentVersion: CURRENT_VERSION, status: 'idle', latest: null, checkedAt: null, error: null});
    this.start();
  }
  dispose() {this.generation++; this.active = false; if (this.timer) clearTimeout(this.timer); this.pending = undefined; this.listeners.clear();}
}
