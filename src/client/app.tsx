import * as React from 'react';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Inbox as InboxIcon, LayoutGrid, ListChecks, ListTodo, Plus, RefreshCw } from 'lucide-react';
import type { Priority, Source, Todo } from '../core/model';
import { addDays, dateKey, localDate, moveMonth, rangeTodos, visibleTodos, weekStart } from '../core/selectors';
import type { TodoStore } from './store';
import type { UIController } from './controller';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
import { Calendar } from './components/ui/calendar';
import { zhCN } from 'react-day-picker/locale';
import { ReminderButton } from './components/reminders';
import { Inbox, MonthView, Quadrants, StatisticsView, WeekView } from './views/board-views';
import type { UpdateStore } from './updates';
import { UpdateButton } from './components/updates';

type View='urgency'|'month'|'week'|'stats';type Filter='inbox'|'all'|'open'|'done';
const views=[['urgency','紧急程度',LayoutGrid],['month','月视图',CalendarDays],['week','周视图',CalendarRange],['stats','统计列表',ListChecks]] as const;
export function App({store,controller,updates,onSource}:{store:TodoStore;controller:UIController;updates:UpdateStore;onSource:(source:Source)=>Promise<void>}){
  const state=React.useSyncExternalStore(store.subscribe,store.getSnapshot);
  const [view,setView]=React.useState<View>('urgency');const [filter,setFilter]=React.useState<Filter>('open');
  const [day,setDay]=React.useState(dateKey(new Date()));const [allDates,setAllDates]=React.useState(true);
  const [statsAllDates,setStatsAllDates]=React.useState(false);const [datePickerOpen,setDatePickerOpen]=React.useState(false);
  const [quick,setQuick]=React.useState('');const [saving,setSaving]=React.useState(false);const [busyIds,setBusyIds]=React.useState(new Set<string>());
  const lastQuick=React.useRef<{title:string;id:string}|null>(null);
  const todos=visibleTodos(state.data?.todos??[]);
  const showingAllDates=view==='urgency'&&allDates||view==='stats'&&statsAllDates;
  const range=showingAllDates?null:view==='urgency'?{from:day,to:day}:view==='week'?{from:weekStart(day),to:addDays(weekStart(day),6)}:{from:`${day.slice(0,7)}-01`,to:addDays(`${moveMonth(`${day.slice(0,7)}-01`,1)}`,-1)};
  const inRange=rangeTodos(todos,range);
  const shown=inRange.filter(todo=>filter==='inbox'?todo.priority==='inbox':filter==='all'||todo.status===filter);
  const onNew=(priority:Priority='inbox',onDay?:string)=>controller.open({priority,day:onDay});
  const openSource=(source:Source)=>{void onSource(source).catch(e=>controller.toast(e.message));};
  async function quickAdd(event:React.FormEvent){
    event.preventDefault();if(!quick.trim()||saving)return;setSaving(true);
    const title=quick.trim();if(lastQuick.current?.title!==title)lastQuick.current={title,id:crypto.randomUUID()};
    try{await store.command({requestId:lastQuick.current.id,kind:'create',draft:{title,note:'',priority:'inbox',due:null,reminder:'none',source:null}});setQuick('');lastQuick.current=null;controller.toast('已保存到收集箱');}
    catch(e){controller.toast(e instanceof Error?e.message:'保存失败');}finally{setSaving(false);}
  }
  async function toggle(todo:Todo){
    if(busyIds.has(todo.id))return;setBusyIds(previous=>new Set(previous).add(todo.id));
    try{await store.command({requestId:crypto.randomUUID(),kind:todo.status==='open'?'complete':'reopen',id:todo.id,expectedVersion:todo.version});}
    catch(e){controller.toast(e instanceof Error?e.message:'操作失败');}finally{setBusyIds(previous=>{const next=new Set(previous);next.delete(todo.id);return next;});}
  }
  const dateLabel=showingAllDates?'全部日期':view==='week'?`${Number(weekStart(day).slice(5,7))} 月 ${Number(weekStart(day).slice(8))} 日 — ${Number(addDays(weekStart(day),6).slice(5,7))} 月 ${Number(addDays(weekStart(day),6).slice(8))} 日`:view==='urgency'?`${Number(day.slice(5,7))} 月 ${Number(day.slice(8))} 日`:`${day.slice(0,4)} 年 ${Number(day.slice(5,7))} 月`;
  const selectDate=(next:string)=>{setDay(next);if(view==='stats')setStatsAllDates(false);else setAllDates(false);setDatePickerOpen(false);};
  const navigate=(amount:number)=>selectDate(view==='urgency'?addDays(day,amount):view==='week'?addDays(day,amount*7):moveMonth(day,amount));
  const props={todos:shown,day,onOpen:(todo:Todo)=>controller.open({todo}),onToggle:(todo:Todo)=>void toggle(todo),onSource:openSource,onNew,busyIds};
  return <div className="dsh-followup followup-app"><header className="board-header"><h1><ListTodo size={22}/>待办看板</h1><form className="quick-add" onSubmit={event=>void quickAdd(event)}><Plus size={16}/><Input variant="plain" aria-label="快速添加待办" placeholder="添加一项待办，按 Enter 保存" value={quick} maxLength={200} disabled={saving||!state.data} onChange={event=>setQuick(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&event.nativeEvent.isComposing)event.preventDefault();}}/><span>Enter</span></form><div className="header-actions"><UpdateButton updates={updates}/><ReminderButton store={store} controller={controller}/><Button onClick={()=>onNew()} disabled={!state.data}><Plus size={16}/>新建待办</Button></div></header>
    <main className="board-main"><div className="board-toolbar"><Tabs value={view} onValueChange={value=>{setView(value as View);if(filter==='inbox')setFilter('open');}}><TabsList className="view-tabs" aria-label="待办视图">{views.map(([value,label,Icon])=><TabsTrigger key={value} value={value}><Icon size={16}/>{label}</TabsTrigger>)}</TabsList></Tabs>
      <div className="date-navigation"><Button size="icon" variant="outline" aria-label="上一个日期范围" onClick={()=>navigate(-1)}><ChevronLeft size={16}/></Button><Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}><PopoverTrigger asChild><Button variant="ghost" className="date-range"><CalendarDays size={16}/>{dateLabel}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar locale={zhCN} weekStartsOn={1} mode="single" selected={showingAllDates?undefined:localDate(day)} defaultMonth={localDate(day)} onSelect={date=>{if(date)selectDate(dateKey(date));}}/>{(view==='urgency'||view==='stats')&&<Button variant="ghost" className="w-full" onClick={()=>{if(view==='stats')setStatsAllDates(true);else setAllDates(true);setDatePickerOpen(false);}}>全部日期</Button>}</PopoverContent></Popover><Button size="icon" variant="outline" aria-label="下一个日期范围" onClick={()=>navigate(1)}><ChevronRight size={16}/></Button><Button variant="outline" onClick={()=>selectDate(dateKey(new Date()))}>今天</Button></div>
    </div>
    <div className="filter-row">{([['inbox','收集箱',inRange.filter(t=>t.priority==='inbox').length],['all','全部',inRange.length],['open','待办',inRange.filter(t=>t.status==='open').length],['done','已完成',inRange.filter(t=>t.status==='done').length]] as const).map(([value,label,count])=><Button key={value} variant="outline" size="sm" className={`filter-pill ${filter===value?'is-active':''}`} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{value==='inbox'&&<InboxIcon size={14}/>} {label} {count}</Button>)}</div>
    {state.error&&<div role="alert" className="connection-error">{state.error}<Button variant="ghost" size="sm" onClick={()=>void store.refresh()}><RefreshCw size={14}/>重试</Button></div>}
    {state.data?.recoveryNotice&&<p role="alert" className="connection-error">{state.data.recoveryNotice}</p>}
    {!state.data?<div className="loading-state">{state.error?'等待待办服务恢复':'正在读取待办…'}</div>:filter==='inbox'?<Inbox {...props}/>:view==='urgency'?<Quadrants {...props}/>:view==='month'?<MonthView {...props}/>:view==='week'?<WeekView {...props}/>:<StatisticsView {...props} allInRange={inRange}/>}
    </main>
  </div>;
}
