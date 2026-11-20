import * as React from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { zhCN } from 'react-day-picker/locale';
import { addDays, dateKey, localDate } from '../../core/selectors';
import { Button } from './ui/button';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export interface DateTimeValue { day: string; time: string }
function TimeColumn({label,unit,count,value,disabled,onChange}:{label:string;unit:string;count:number;value:number|null;disabled:boolean;onChange:(value:number)=>void}){
  const list=React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(()=>{
    if(list.current&&value!==null)list.current.scrollTop=value*32-(list.current.clientHeight-32)/2;
  },[value]);
  return <div className="time-column"><span>{unit}</span><div ref={list} role="listbox" aria-label={label} className="time-options" aria-disabled={disabled}>
    {Array.from({length:count},(_,i)=><button key={i} type="button" role="option" aria-label={`${String(i).padStart(2,'0')} ${unit}`} aria-selected={i===value} disabled={disabled} tabIndex={i===(value??0)?0:-1} onClick={()=>onChange(i)} onKeyDown={event=>{
      const next=event.key==='ArrowDown'?Math.min(count-1,i+1):event.key==='ArrowUp'?Math.max(0,i-1):event.key==='Home'?0:event.key==='End'?count-1:null;
      if(next===null)return;event.preventDefault();onChange(next);(list.current?.children[next] as HTMLButtonElement|undefined)?.focus();
    }}>{String(i).padStart(2,'0')}</button>)}
  </div></div>;
}
export function DateTimeField({value,onChange}:{value:DateTimeValue;onChange:(value:DateTimeValue)=>void}){
  const [open,setOpen]=React.useState(false);
  const [draft,setDraft]=React.useState(value);
  const [month,setMonth]=React.useState(()=>value.day?localDate(value.day):new Date());
  const text=value.day?`${value.day.replaceAll('-',' / ')}${value.time?' '+value.time:''}`:'选择日期和时间';
  const commit=(next:DateTimeValue)=>{onChange(next);setOpen(false);};
  const setTime=(index:number,part:number)=>setDraft(previous=>{const parts=(previous.time||'00:00').split(':');parts[index]=String(part).padStart(2,'0');return {...previous,time:parts.join(':')};});
  const selectDay=(day:string)=>{setDraft(previous=>({...previous,day}));setMonth(localDate(day));};
  return <Popover open={open} onOpenChange={next=>{if(next){setDraft(value);setMonth(value.day?localDate(value.day):new Date());}setOpen(next);}}>
    <PopoverTrigger asChild><Button type="button" variant="outline" className={`date-time-field ${value.day?'':'is-placeholder'}`} aria-label="选择截止日期和时间"><CalendarDays size={16}/><span>{text}</span><ChevronDown size={14}/></Button></PopoverTrigger>
    <PopoverContent align="start" sideOffset={8} collisionPadding={16} className="date-time-popover" aria-label="截止日期和时间">
      <div className="date-time-panels"><div className="date-panel"><Calendar locale={zhCN} weekStartsOn={1} mode="single" required selected={draft.day?localDate(draft.day):undefined} month={month} onMonthChange={setMonth} onSelect={date=>{if(date)selectDay(dateKey(date));}}/>
        <div className="date-shortcuts">{[['今天',0],['明天',1],['一周后',7]].map(([label,days])=><Button key={label} type="button" variant="ghost" size="sm" onClick={()=>selectDay(addDays(dateKey(new Date()),Number(days)))}>{label}</Button>)}</div>
      </div><div className="time-panel"><div className="time-panel-heading"><strong>{draft.time||'选择时间'}</strong><Button type="button" variant="ghost" size="sm" disabled={!draft.time} onClick={()=>setDraft(previous=>({...previous,time:''}))}>仅日期</Button></div>
        <div className="time-columns"><TimeColumn label="小时" unit="时" count={24} value={draft.time?Number(draft.time.slice(0,2)):null} disabled={!draft.day} onChange={hour=>setTime(0,hour)}/><TimeColumn label="分钟" unit="分" count={60} value={draft.time?Number(draft.time.slice(3)):null} disabled={!draft.day} onChange={minute=>setTime(1,minute)}/></div>
      </div></div>
      <div className="date-time-footer"><div><Button type="button" variant="ghost" size="sm" onClick={()=>commit({day:'',time:''})}>不设截止时间</Button><Button type="button" variant="ghost" size="sm" onClick={()=>{const now=new Date();setDraft({day:dateKey(now),time:`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`});setMonth(now);}}>此刻</Button></div><Button type="button" size="sm" disabled={!draft.day} onClick={()=>commit(draft)}>确定</Button></div>
    </PopoverContent>
  </Popover>;
}
