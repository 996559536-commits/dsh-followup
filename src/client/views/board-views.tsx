import { Plus } from 'lucide-react';
import type { Priority, Source, Todo } from '../../core/model';
import { priorityLabels } from '../../core/model';
import { addDays, dateKey, dueDay, monthDays, ordered, statistics, weekStart } from '../../core/selectors';
import { TodoCard } from '../components/todo-card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

export interface ViewProps {todos:Todo[];day:string;onOpen:(todo:Todo)=>void;onToggle:(todo:Todo)=>void;onSource:(source:Source)=>void;onNew:(priority?:Priority,day?:string)=>void;busyIds:Set<string>}
const quadrants=[['urgent','尽快处理 / 可委派'],['urgent-important','优先完成'],['neither','有空再做'],['important','安排时间推进']] as const;
export function Cards({todos,...props}:ViewProps){return <div className="card-list">{ordered(todos).map(todo=><TodoCard key={todo.id} todo={todo} onOpen={props.onOpen} onToggle={props.onToggle} onSource={props.onSource} busy={props.busyIds.has(todo.id)}/>)}</div>;}
export function Inbox(props:ViewProps){return <section className="inbox-view"><div className="view-section-head"><h2>收集箱 <span>{props.todos.length}</span></h2><Button size="sm" variant="outline" onClick={()=>props.onNew('inbox')}><Plus size={14}/>记录想法</Button></div><p className="section-description">先记下来，需要时再安排轻重缓急和日期。</p>{props.todos.length?<Cards {...props}/>:<div className="empty-inbox">这里放还没安排的想法和后续要跟进的事项</div>}</section>;}
export function Quadrants(props:ViewProps){
  const inbox=props.todos.filter(t=>t.priority==='inbox');
  return <>{inbox.length>0&&<div className="compact-inbox"><h2>未分类 <span>{inbox.length}</span></h2><Cards {...props} todos={inbox}/></div>}<div className="quadrant-grid">{quadrants.map(([priority,description])=>{
    const todos=props.todos.filter(t=>t.priority===priority);
    return <section key={priority} className={`quadrant priority-${priority}`}><div className="quadrant-head"><h2><i/>{priorityLabels[priority]}<span>{todos.length}</span></h2><Button variant="outline" size="icon" className="quadrant-add" aria-label={`在${priorityLabels[priority]}中新建待办`} onClick={()=>props.onNew(priority)}><Plus size={16}/></Button></div><p className="section-description">{description}</p><Cards {...props} todos={todos}/></section>;
  })}</div></>;
}
function Unscheduled(props:ViewProps){const todos=props.todos.filter(t=>!t.due);return todos.length?<section className="unscheduled"><h3>未安排日期 <span>{todos.length}</span></h3><div className="unscheduled-items">{todos.map(todo=><Button key={todo.id} variant="outline" size="sm" onClick={()=>props.onOpen(todo)}>{todo.title}</Button>)}</div></section>:null;}
function CalendarChip({todo,onOpen}:{todo:Todo;onOpen:(todo:Todo)=>void}){return <button type="button" className={`calendar-chip priority-${todo.priority} ${todo.status==='done'?'is-done':''}`} onClick={event=>{event.stopPropagation();onOpen(todo);}}>{todo.status==='done'?'✓ ':todo.due?.kind==='time'?new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(new Date(todo.due.at))+' ':''}{todo.title}</button>;}
export function MonthView(props:ViewProps){
  const today=dateKey(new Date());const days=monthDays(props.day);
  return <><div className="month-calendar"><div className="calendar-weekdays">{['一','二','三','四','五','六','日'].map(day=><div key={day}>{day}</div>)}</div><div className="month-grid">{days.map(day=>{
    const todos=ordered(props.todos.filter(t=>dueDay(t.due)===day));
    return <div key={day} className={`month-cell ${day.slice(0,7)!==props.day.slice(0,7)?'is-outside':''}`}><Button variant="ghost" className={`day-number ${day===today?'is-today':''}`} aria-label={`${day} 新增待办`} onClick={()=>props.onNew(undefined,day)}>{Number(day.slice(8))}</Button><div className="month-cell-tasks">{todos.map(todo=><CalendarChip key={todo.id} todo={todo} onOpen={props.onOpen}/>)}</div></div>;
  })}</div></div><Unscheduled {...props}/><p className="calendar-hint">点击日期新增 · 点击待办查看详情</p></>;
}
export function WeekView(props:ViewProps){
  const days=Array.from({length:7},(_,i)=>addDays(weekStart(props.day),i));
  const timed=props.todos.filter(t=>t.due?.kind==='time'&&days.includes(dueDay(t.due)!));
  const hours=timed.map(t=>new Date(t.due!.kind==='time'?t.due!.at:'').getHours());
  const start=Math.min(9,...hours),end=Math.max(21,...hours.map(h=>h+1));
  const slots=Array.from({length:end-start+1},(_,i)=>start+i);
  return <><div className="week-calendar"><div className="week-head"><div/>{days.map((day,i)=><div key={day} className={day===dateKey(new Date())?'is-today':''}><span>周{'一二三四五六日'[i]}</span><Button variant="ghost" onClick={()=>props.onNew(undefined,day)} aria-label={`${day} 新增待办`}>{Number(day.slice(5,7))}/{Number(day.slice(8))}</Button></div>)}</div>
    <div className="week-allday"><span>全天</span>{days.map(day=><div key={day}>{ordered(props.todos.filter(t=>t.due?.kind==='date'&&t.due.date===day)).map(todo=><CalendarChip key={todo.id} todo={todo} onOpen={props.onOpen}/>)}</div>)}</div>
    <div className="week-timeline">{slots.map(hour=><div key={hour} className="week-hour"><time>{String(hour).padStart(2,'0')}:00</time>{days.map(day=><div key={day} className="week-hour-cell">{ordered(timed.filter(t=>dueDay(t.due)===day&&new Date(t.due!.kind==='time'?t.due!.at:'').getHours()===hour)).map(todo=><CalendarChip key={todo.id} todo={todo} onOpen={props.onOpen}/>)}</div>)}</div>)}</div></div><Unscheduled {...props}/></>;
}
export function StatisticsView(props:ViewProps&{allInRange:Todo[]}){
  const stats=statistics(props.allInRange);
  return <><div className="stat-cards">{[['全部待办',stats.total],['待办',stats.open],['已完成',stats.done],['完成率',`${stats.percent}%`]].map(([label,value])=><div className="stat-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="stats-table" role="region" aria-label="待办统计表" tabIndex={0}><Table><TableHeader><TableRow><TableHead>待办</TableHead><TableHead>来源</TableHead><TableHead>紧急程度</TableHead><TableHead>截止时间</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>{ordered(props.todos).map(todo=><TableRow key={todo.id} className="stats-row"><TableCell><button className="table-title" onClick={()=>props.onOpen(todo)}>{todo.title}</button></TableCell><TableCell><Badge variant="secondary">{todo.source?'会话转发':'手动添加'}</Badge></TableCell><TableCell><span className={`priority-dot priority-${todo.priority}`}/>{priorityLabels[todo.priority]}</TableCell><TableCell>{todo.due?`${dueDay(todo.due)}${todo.due.kind==='time'?' '+new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(new Date(todo.due.at)):''}`:'未设置'}</TableCell><TableCell><Badge variant={todo.status==='done'?'secondary':'outline'}>{todo.status==='done'?'已完成':'待办'}</Badge></TableCell></TableRow>)}{!props.todos.length&&<TableRow><TableCell colSpan={5} className="table-empty">当前范围没有待办</TableCell></TableRow>}</TableBody></Table></div><p className="calendar-hint">统计所选日期范围内的当前状态，含未安排日期；状态筛选只影响列表。</p></>;
}
