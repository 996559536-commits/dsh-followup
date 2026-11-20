export const priorities = ['inbox', 'urgent', 'urgent-important', 'neither', 'important'] as const;
export type Priority = typeof priorities[number];
export type Status = 'open' | 'done';
export type ReminderMode = 'none' | 'at-due' | 'before-10m';
export type Due = null | { kind: 'date'; date: string } | { kind: 'time'; at: string; timeZone: string };
export interface Source {
  scopeId: string; workspaceId?: string; sessionId: string; messageId: string;
  seq?: number; sessionTitle: string; excerpt: string;
}
export interface Todo {
  id: string; title: string; note: string; priority: Priority; status: Status;
  due: Due; reminder: ReminderMode; source: Source | null;
  createdAt: string; updatedAt: string; completedAt: string | null;
  deletedAt: string | null; version: number; scheduleVersion: number;
  scheduleUpdatedAt: string;
}
export interface ReminderEvent {
  id: string; todoId: string; scheduleVersion: number; triggerAt: string;
  createdAt: string; dismissedAt: string | null; cancelledAt: string | null;
  claim: null | { clientId: string; token: string; expiresAt: string };
  deliveredAt: string | null;
}
export interface Receipt { requestId: string; fingerprint: string; result: CommandResult }
export interface State {
  schemaVersion: 1; scopeId: string; revision: number; todos: Todo[];
  reminders: ReminderEvent[]; receipts: Receipt[];
}
export type Draft = Pick<Todo, 'title' | 'note' | 'priority' | 'due' | 'reminder' | 'source'>;
export interface Command {
  requestId: string; kind: 'create' | 'update' | 'complete' | 'reopen' | 'delete' | 'dismiss-reminder';
  id?: string; expectedVersion?: number; draft?: unknown;
}
export interface CommandResult { id: string; version: number; revision: number; duplicate?: boolean }
export const priorityLabels: Record<Priority, string> = {
  inbox: '收集箱', urgent: '紧急不重要', 'urgent-important': '重要且紧急', neither: '不重要不紧急', important: '重要不紧急',
};
export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DomainError('invalid-input', '输入格式无效');
  return value as Record<string, unknown>;
}
export function text(value: unknown, name: string, max: number, required = false): string {
  if (typeof value !== 'string') throw new DomainError('invalid-input', `${name}格式无效`);
  const result = value.trim();
  if ((required && !result) || result.length > max) throw new DomainError('invalid-input', `${name}${required && !result ? '不能为空' : `不能超过 ${max} 字`}`);
  return result;
}
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function parseDraft(value: unknown, scopeId: string): Draft {
  const v = object(value);
  const title = text(v.title, '标题', 200, true);
  const note = text(v.note ?? '', '备注', 10_000);
  if (!priorities.includes(v.priority as Priority)) throw new DomainError('invalid-input', '请选择紧急程度');
  let due: Due = null;
  if (v.due !== null && v.due !== undefined) {
    const d = object(v.due);
    if (d.kind === 'date' && typeof d.date === 'string' && validDate(d.date)) due = { kind: 'date', date: d.date };
    else if (d.kind === 'time' && typeof d.at === 'string' && Number.isFinite(Date.parse(d.at)) && typeof d.timeZone === 'string') {
      try { new Intl.DateTimeFormat('en', { timeZone: d.timeZone }).format(); } catch { throw new DomainError('invalid-input', '时区无效'); }
      due = { kind: 'time', at: new Date(d.at).toISOString(), timeZone: d.timeZone };
    } else throw new DomainError('invalid-input', '日期或时间无效');
  }
  if (!['none', 'at-due', 'before-10m'].includes(v.reminder as string)) throw new DomainError('invalid-input', '提醒选项无效');
  if (v.reminder !== 'none' && due?.kind !== 'time') throw new DomainError('invalid-input', '请先设置明确的提醒时间');
  let source: Source | null = null;
  if (v.source !== null && v.source !== undefined) {
    const s = object(v.source);
    if (s.scopeId !== scopeId) throw new DomainError('scope-mismatch', '来源属于另一个待办数据空间', 409);
    source = {
      scopeId, sessionId: text(s.sessionId, '会话 ID', 256, true), messageId: text(s.messageId, '消息 ID', 256, true),
      sessionTitle: text(s.sessionTitle, '会话标题', 500), excerpt: text(s.excerpt, '引用内容', 2_000),
      ...(s.workspaceId === undefined ? {} : { workspaceId: text(s.workspaceId, '工作区 ID', 256, true) }),
      ...(typeof s.seq === 'number' && Number.isSafeInteger(s.seq) && s.seq >= 0 ? { seq: s.seq } : {}),
    };
  }
  return { title, note, priority: v.priority as Priority, due, reminder: v.reminder as ReminderMode, source };
}
export function reminderAt(todo: Pick<Todo, 'due' | 'reminder'>): number | null {
  if (todo.reminder === 'none' || todo.due?.kind !== 'time') return null;
  return Date.parse(todo.due.at) - (todo.reminder === 'before-10m' ? 600_000 : 0);
}
export function sourceKey(source: Source | null): string | null {
  return source ? JSON.stringify([source.scopeId, source.sessionId, source.messageId]) : null;
}
