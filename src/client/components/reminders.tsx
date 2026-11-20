import * as React from 'react';
import { Bell, Check, ExternalLink } from 'lucide-react';
import type { Source } from '../../core/model';
import type { TodoStore } from '../store';
import type { UIController } from '../controller';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Editor } from './editor';

export function ReminderButton({store,controller}:{store:TodoStore;controller:UIController}){
  const {data}=React.useSyncExternalStore(store.subscribe,store.getSnapshot);
  const [permission,setPermission]=React.useState(typeof Notification==='undefined'?'unsupported':Notification.permission);
  const events=data?.reminders.filter(e=>!e.cancelledAt&&!e.dismissedAt)??[];
  return <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label={`提醒 ${events.length} 条`} className="reminder-trigger"><Bell size={17}/>{events.length>0&&<span className="reminder-count">{events.length}</span>}</Button></PopoverTrigger><PopoverContent align="end" className="reminder-popover"><div className="reminder-popover-head"><strong>提醒</strong><span>{events.length}</span></div>
    <div className="reminder-list">{events.length?events.map(event=>{
      const todo=data!.todos.find(t=>t.id===event.todoId);if(!todo)return null;
      return <div key={event.id} className="reminder-row"><button onClick={()=>controller.open({todo})}><strong>{todo.title}</strong><span>{new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(event.triggerAt))}{Date.parse(event.triggerAt)<Date.now()-900000?' · 错过的提醒':''}</span></button><Button variant="ghost" size="icon" aria-label={`已读：${todo.title}`} onClick={()=>void store.command({requestId:crypto.randomUUID(),kind:'dismiss-reminder',id:event.id}).catch(e=>controller.toast(e.message))}><Check size={14}/></Button></div>;
    }):<p className="empty-reminders">暂无提醒</p>}</div>
    <div className="notification-settings">{permission==='default'?<Button variant="outline" size="sm" onClick={()=>void Notification.requestPermission().then(setPermission)}>开启系统通知<ExternalLink size={12}/></Button>:<span>{permission==='granted'?'系统通知已开启':'应用内保留提醒'}</span>}</div>
  </PopoverContent></Popover>;
}
export function GlobalUI({store,controller,onSource}:{store:TodoStore;controller:UIController;onSource:(source:Source)=>Promise<void>}){
  const ui=React.useSyncExternalStore(controller.subscribe,controller.getSnapshot);
  const {data}=React.useSyncExternalStore(store.subscribe,store.getSnapshot);
  const clientId=React.useRef(crypto.randomUUID());const inFlight=React.useRef(new Set<string>());
  const lastScope=React.useRef<string|null>(null);
  React.useEffect(()=>{
    if(!data)return;
    if(lastScope.current&&lastScope.current!==data.scopeId){controller.reset();inFlight.current.clear();}
    lastScope.current=data.scopeId;
    if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
    for(const event of data.reminders){
      if(event.cancelledAt||event.dismissedAt||event.deliveredAt||Date.parse(event.triggerAt)<Date.now()-900000||inFlight.current.has(event.id))continue;
      const todo=data.todos.find(t=>t.id===event.todoId&&t.status==='open'&&!t.deletedAt);if(!todo)continue;
      inFlight.current.add(event.id);
      void(async()=>{
        let token:string|undefined;
        try{
          const claim=await store.request<{token?:string}|null>('notification-claim',{id:event.id,clientId:clientId.current});token=claim?.token;if(!token)return;
          const notification=new Notification('待办提醒',{body:todo.title,tag:`dsh-followup:${data.scopeId}:${event.id}`});
          notification.onclick=()=>{window.focus();controller.open({todo});notification.close();};
          await store.request('notification-claim',{action:'ack',id:event.id,clientId:clientId.current,token});
        }catch{
          if(token)await store.request('notification-claim',{action:'release',id:event.id,clientId:clientId.current,token}).catch(()=>{});
        }finally{inFlight.current.delete(event.id);}
      })();
    }
  },[data,store,controller]);
  return <div className="dsh-followup global-ui">{ui.editor&&<Editor key={ui.editor.todo?.id??JSON.stringify(ui.editor.source)??'new'} seed={ui.editor} store={store} onClose={controller.close} onSource={onSource} onSaved={controller.toast}/>} {ui.toast&&<div role="status" className="followup-toast"><Check size={15}/>{ui.toast}</div>}</div>;
}
