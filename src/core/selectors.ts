import type { Due, Todo } from './model';

export function dateKey(value: Date | string | number, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function dueDay(due: Due, timeZone?: string): string | null {
  return due === null ? null : due.kind === 'date' ? due.date : dateKey(due.at, timeZone);
}
export function localDate(day: string): Date { return new Date(`${day}T12:00:00`); }
export function addDays(day: string, amount: number): string {
  const d = localDate(day); d.setDate(d.getDate() + amount); return dateKey(d);
}
export function weekStart(day: string): string { const d = localDate(day); return addDays(day, -((d.getDay() + 6) % 7)); }
export function monthDays(day: string): string[] {
  const first = `${day.slice(0, 7)}-01`; const start = weekStart(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function moveMonth(day: string, amount: number): string {
  const d = localDate(day); const date = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + amount);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(date, end)); return dateKey(d);
}
export function visibleTodos(todos: Todo[]): Todo[] { return todos.filter(t => t.deletedAt === null); }
export function ordered(todos: Todo[]): Todo[] {
  return [...todos].sort((a,b) => Number(a.status === 'done') - Number(b.status === 'done') ||
    (a.due === null ? '9999' : a.due.kind === 'date' ? `${a.due.date}T00` : a.due.at).localeCompare(b.due === null ? '9999' : b.due.kind === 'date' ? `${b.due.date}T00` : b.due.at) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function statistics(todos: Todo[]) {
  const total = todos.length, done = todos.filter(t=>t.status==='done').length;
  return { total, done, open: total - done, percent: total ? Math.round(done / total * 100) : 0 };
}
export function overdue(todo: Todo, now = new Date(), timeZone?: string): boolean {
  return todo.status === 'open' && todo.due !== null && (todo.due.kind === 'date' ? todo.due.date < dateKey(now, timeZone) : Date.parse(todo.due.at) < now.getTime());
}
export function rangeTodos(todos: Todo[], range: { from: string; to: string } | null, timeZone?: string): Todo[] {
  if (!range) return todos;
  return todos.filter(todo => { const day = dueDay(todo.due, timeZone); return day === null || day >= range.from && day <= range.to; });
}
