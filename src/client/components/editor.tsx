import * as React from 'react';
import { Bell, Check, ExternalLink, MessageSquare, Trash2 } from 'lucide-react';
import { priorities, priorityLabels, type Draft, type Priority, type ReminderMode, type Source, type Todo } from '../../core/model';
import { dateKey, dueDay } from '../../core/selectors';
import { TodoStore } from '../store';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { DateTimeField } from './date-time-field';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Checkbox } from './ui/checkbox';

export interface EditorSeed { todo?: Todo; title?: string; priority?: Priority; day?: string; source?: Source; forwarding?: boolean }
export function Editor({seed,store,onClose,onSource,onSaved}:{seed:EditorSeed;store:TodoStore;onClose:()=>void;onSource:(source:Source)=>Promise<void>;onSaved:(message:string)=>void}){
  const original=seed.todo;
  const [title,setTitle]=React.useState(original?.title??seed.title??'');
  const [note,setNote]=React.useState(original?.note??'');
  const [priority,setPriority]=React.useState<Priority>(original?.priority??seed.priority??'inbox');
  const [day,setDay]=React.useState(original?dueDay(original.due)??'':seed.day??'');
  const [time,setTime]=React.useState(original?.due?.kind==='time'?new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(original.due.at)):'');
  const [reminder,setReminder]=React.useState<ReminderMode>(original?.reminder??'none');
  const [busy,setBusy]=React.useState(false);const [error,setError]=React.useState('');
  const [confirmDelete,setConfirmDelete]=React.useState(false);
  const request=React.useRef<{fingerprint:string;id:string}|null>(null);
  const titleRef=React.useRef<HTMLTextAreaElement>(null);
  const noteRef=React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(()=>{
    for(const [element,min,max] of [[titleRef.current,26,104],[noteRef.current,22,132]] as const){
      if(element){element.style.height='auto';element.style.height=`${Math.min(max,Math.max(min,element.scrollHeight))}px`;}
    }
  },[title,note]);
  const source=original?.source??seed.source??null;
  function getDraft():Draft{
    if(!title.trim())throw new Error('请填写待办标题');
    let due:Draft['due']=day?{kind:'date',date:day}:null;
    if(day&&time){
      const date=new Date(`${day}T${time}:00`);
      if(!Number.isFinite(date.getTime())||dateKey(date)!==day||new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date)!==time)throw new Error('该日期的时间无效，请重新选择');
      due={kind:'time',at:date.toISOString(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};
    }
    if(reminder!=='none'&&due?.kind!=='time')throw new Error('请先设置日期和时间，再开启提醒');
    return {title:title.trim(),note,priority,due,reminder,source};
  }
  async function perform(kind:'save'|'complete'|'reopen'|'delete'){
    if(busy)return;setBusy(true);setError('');
    try{
      const command=kind==='save'?{kind:original?'update' as const:'create' as const,...original?{id:original.id,expectedVersion:original.version}:{},draft:getDraft()}:{kind,id:original!.id,expectedVersion:original!.version};
      const fingerprint=JSON.stringify(command);
      if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,id:crypto.randomUUID()};
      const result=await store.command({...command,requestId:request.current.id});
      onSaved(result.duplicate?'这条回复已在待办中，可从看板继续跟进':kind==='complete'?'已标记完成':kind==='reopen'?'已恢复待办':kind==='delete'?'已删除待办':'已保存');onClose();
    }catch(e){setError(e instanceof Error?e.message:'保存失败，请重试');}finally{setBusy(false);}
  }
  const sourcePanel=source&&<div className="source-panel"><div className="source-panel-head"><span><MessageSquare size={15}/>来源会话{seed.forwarding?' · 自动保留':''}</span><Button type="button" size="sm" variant="ghost" onClick={()=>void onSource(source).catch(e=>setError(e.message))}>返回会话<ExternalLink size={12}/></Button></div><strong>{source.sessionTitle||'未命名会话'}</strong>{source.excerpt&&<blockquote>{source.excerpt}</blockquote>}</div>;
  const body=<form className="editor-form" onSubmit={event=>{event.preventDefault();void perform('save');}}>
    {seed.forwarding?<div className="field-stack"><Label htmlFor="forward-todo-title">待办标题</Label><Input id="forward-todo-title" autoFocus className="forward-title" aria-label="待办标题" placeholder="记下一个想法或需要跟进的事项" value={title} maxLength={200} onChange={event=>setTitle(event.target.value)}/></div>:<div className="editor-title-row">{original&&<Checkbox className="editor-completion" aria-label={original.status==='done'?'撤销完成':'标记完成'} checked={original.status==='done'} disabled={busy} onCheckedChange={()=>void perform(original.status==='done'?'reopen':'complete')}/>}
      <Textarea ref={titleRef} variant="plain" rows={1} autoFocus aria-label="待办标题" placeholder="记下一个想法或需要跟进的事项" value={title} maxLength={200} onChange={event=>setTitle(event.target.value.replace(/[\r\n]+/g,' '))} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form?.requestSubmit();}}} className="editor-title"/></div>}
    {seed.forwarding&&sourcePanel}
    <Textarea ref={noteRef} variant="plain" rows={1} aria-label="备注" placeholder="补充接下来要推进的内容…" value={note} maxLength={10000} onChange={event=>setNote(event.target.value)} className="editor-note"/>
    <div className="field-stack"><Label htmlFor="todo-priority">紧急程度</Label><Select value={priority} onValueChange={value=>setPriority(value as Priority)}><SelectTrigger id="todo-priority"><SelectValue/></SelectTrigger><SelectContent>{priorities.map(value=><SelectItem key={value} value={value}><span className={`priority-dot priority-${value}`}/>{priorityLabels[value]}</SelectItem>)}</SelectContent></Select></div>
    <div className="field-stack"><Label>截止时间</Label><DateTimeField value={{day,time}} onChange={value=>{setDay(value.day);setTime(value.time);if(!value.day||!value.time)setReminder('none');}}/></div>
    <div className="field-stack"><Label className="icon-label"><Bell size={15}/>定时提醒</Label><div className="reminder-options">{([['none','不提醒'],['at-due','到期时'],['before-10m','提前 10 分钟']] as const).map(([value,label])=><Button key={value} type="button" variant={reminder===value?'default':'outline'} aria-pressed={reminder===value} disabled={value!=='none'&&(!day||!time)} onClick={()=>setReminder(value)}>{label}</Button>)}</div>{(!day||!time)&&<p className="field-hint">设置具体时间后可开启提醒</p>}</div>
    {!seed.forwarding&&sourcePanel}
    {error&&<p role="alert" className="form-error">{error}</p>}
    <div className="editor-footer">
      {original?<><Button type="button" variant="outline" className={confirmDelete?'text-destructive':''} disabled={busy} onClick={()=>{if(confirmDelete)void perform('delete');else setConfirmDelete(true);}}><Trash2 size={14}/>{confirmDelete?'确认删除':'删除待办'}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>void perform(original.status==='done'?'reopen':'complete')}><Check size={14}/>{original.status==='done'?'撤销完成':'标记完成'}</Button></>:<Button type="button" variant="outline" disabled={busy} onClick={onClose}>取消</Button>}
      <Button type="submit" disabled={busy}>{busy?'正在保存…':original?'保存':priority==='inbox'?'保存到收集箱':'保存待办'}</Button>
    </div>
  </form>;
  if(seed.forwarding)return <Sheet open onOpenChange={open=>{if(!open&&!busy)onClose();}}><SheetContent className="forward-sheet"><SheetHeader><SheetTitle>转发到待办</SheetTitle><SheetDescription>确认标题即可保存，稍后再安排时间。</SheetDescription></SheetHeader>{body}</SheetContent></Sheet>;
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="todo-dialog"><DialogHeader><DialogTitle>{original?'待办详情':'新建待办'}</DialogTitle><DialogDescription className="sr-only">编辑想法与跟进事项</DialogDescription></DialogHeader>{body}</DialogContent></Dialog>;
}
