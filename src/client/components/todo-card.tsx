import { ExternalLink } from 'lucide-react';
import type { Source, Todo } from '../../core/model';
import { addDays, dateKey, dueDay, overdue } from '../../core/selectors';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';

export function dueLabel(todo:Todo){
  const day=dueDay(todo.due);if(!day)return '';
  const today=dateKey(new Date());
  const label=day===today?'今天':day===addDays(today,1)?'明天':`${Number(day.slice(5,7))} 月 ${Number(day.slice(8))} 日`;
  return `${label}${todo.due?.kind==='time'?' '+new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(new Date(todo.due.at)):''}`;
}
export function TodoCard({todo,onOpen,onToggle,onSource,busy}:{todo:Todo;onOpen:(todo:Todo)=>void;onToggle:(todo:Todo)=>void;onSource:(source:Source)=>void;busy?:boolean}){
  return <article className={`todo-card ${todo.status==='done'?'is-done':''}`} onClick={()=>onOpen(todo)}>
    <div onClick={event=>event.stopPropagation()} className="card-check"><Checkbox aria-label={`${todo.status==='done'?'撤销完成':'完成'}：${todo.title}`} checked={todo.status==='done'} disabled={busy} onCheckedChange={()=>onToggle(todo)}/></div>
    <div className="card-body"><div className="card-title-row"><button type="button" className="card-title" onClick={event=>{event.stopPropagation();onOpen(todo);}}>{todo.title}</button><Badge variant="secondary" className="source-badge">{todo.source?'会话转发':'手动添加'}</Badge><time className={`card-due ${overdue(todo)?'is-overdue':''}`}>{dueLabel(todo)}</time></div>
      {todo.note&&<p className="card-note">{todo.note}</p>}
      {todo.source&&<button type="button" className="source-link" onClick={event=>{event.stopPropagation();onSource(todo.source!);}}>查看来源会话<ExternalLink size={12}/></button>}
    </div>
  </article>;
}
