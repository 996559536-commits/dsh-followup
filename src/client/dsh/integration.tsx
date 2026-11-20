import * as React from 'react';
import {createPortal} from 'react-dom';
import {ListTodo, ListPlus, ListChecks} from 'lucide-react';
import type {Source} from '../../core/model';
import {App} from '../app';
import {TodoStore} from '../store';
import {UIController} from '../controller';
import {GlobalUI} from '../components/reminders';
import {placeAssistantAction} from './placement';

interface Closing {finalNode:{messageId?:string;seq:number};blocks:{kind:string;text?:string}[]}
interface Chat {timeline:{turns:Map<unknown,{data:Map<string,{closing?:Closing|null}>}>}}
interface SessionRow {title?:string;workspaceId?:string}
interface SlotOptions {name:string;id?:string;key?:string;order?:number;label?:string|(()=>string)}
interface ClientContext {
  slots:{
    inject(name:string,fn:()=>unknown):()=>void;
    register(options:SlotOptions,component:React.ComponentType<any>):()=>void;
    entriesOfSlot(name:string):{options:SlotOptions}[];
    subscribe(name:string,listener:()=>void):()=>void;
  };
  effect(callback:()=>void|(()=>void),label?:string):void;
  on(name:string,listener:()=>void):()=>void;
  sessions:{list:{getSnapshot():{byId:Record<string,SessionRow>}};refresh():Promise<void>};
  uiWorkspace:{openSession(id:string):void};
}
export function installIntegration(ctx:ClientContext,store:TodoStore,controller:UIController){
  const openSource=async(source:Source)=>{
    const scope=store.getSnapshot().data?.scopeId;
    if(scope!==source.scopeId)throw new Error('这项来源属于另一个数据空间');
    let row=ctx.sessions.list.getSnapshot().byId[source.sessionId];
    if(!row){await ctx.sessions.refresh();row=ctx.sessions.list.getSnapshot().byId[source.sessionId];}
    if(!row)throw new Error('来源会话已不可用，保存的引用仍在待办中');
    ctx.uiWorkspace.openSession(source.sessionId);controller.close();
  };
  ctx.effect(()=>ctx.slots.inject('sidebar.panellist',()=>{
    let order:number|undefined;let off:(()=>void)|undefined;let scheduled=false;let disposed=false;
    const sync=()=>{
      const entries=ctx.slots.entriesOfSlot('sidebar.panellist').map(e=>e.options).filter(e=>e.id!=='dsh-followup');
      const works=entries.find(e=>/^(works|artifacts|deliverables|forge)$/.test(e.id??''))??entries.find(e=>{try{return(typeof e.label==='function'?e.label():e.label)==='作品';}catch{return false;}});
      const worksOrder=works?.order??19;
      const next=entries.filter(e=>(e.order??0)>worksOrder).sort((a,b)=>(a.order??0)-(b.order??0))[0];
      const target=next?worksOrder+((next.order??0)-worksOrder)/2:worksOrder+1;
      if(order===target)return;order=target;off?.();
      off=ctx.slots.register({name:'sidebar.panellist',id:'dsh-followup',order:target,label:()=> '待办'},({size=16}:{size?:number})=><ListTodo size={size}/>);
    };
    const unsub=ctx.slots.subscribe('sidebar.panellist',()=>{if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;if(!disposed)sync();});}});sync();
    return()=>{disposed=true;unsub();off?.();};
  }),'dsh-followup: navigation entry');
  ctx.effect(()=>ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'dsh-followup'},()=> <App store={store} controller={controller} onSource={openSource}/>)),'dsh-followup: main panel');
  ctx.effect(()=>ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'dsh-followup'},()=> <GlobalUI store={store} controller={controller} onSource={openSource}/>)),'dsh-followup: editor and reminders');
  function AssistantAction({sessionId,messageId,useChat}:{sessionId:string;messageId:string;useChat:<T>(select:(chat:Chat)=>T)=>T}){
    const anchor=React.useRef<HTMLSpanElement>(null);const [target,setTarget]=React.useState<HTMLElement|null>(null);
    const snapshot=React.useSyncExternalStore(store.subscribe,store.getSnapshot);
    const closing=useChat(chat=>{
      for(const turn of chat.timeline.turns.values()){
        const closing=turn.data.get('turn-tail')?.closing;
        if(closing?.finalNode.messageId===messageId)return closing;
      }
      return null;
    });
    React.useLayoutEffect(()=>anchor.current?placeAssistantAction(anchor.current,setTarget):undefined,[]);
    const saved=snapshot.data?.todos.some(t=>!t.deletedAt&&t.source?.sessionId===sessionId&&t.source.messageId===messageId);
    const ActionIcon=saved?ListChecks:ListPlus;
    const action=<button type="button" className="forward-action" aria-label={saved?'已加入待办':'转发到待办'} title={saved?'已加入待办，点击查看':'转发到待办'} disabled={!closing||!snapshot.data} onClick={()=>{
      if(!closing||!snapshot.data)return;
      const existing=snapshot.data.todos.find(t=>!t.deletedAt&&t.source?.sessionId===sessionId&&t.source.messageId===messageId);
      if(existing){controller.open({todo:existing});return;}
      const row=ctx.sessions.list.getSnapshot().byId[sessionId];
      const excerpt=closing.blocks.filter(b=>b.kind==='text').map(b=>b.text??'').join('').trim().slice(0,2000);
      const title=excerpt.split('\n').map(line=>line.replace(/^\s*[#>*-]+\s*/, '').trim()).find(Boolean)?.slice(0,200)??'';
      const source:Source={scopeId:snapshot.data.scopeId,sessionId,messageId,seq:closing.finalNode.seq,sessionTitle:row?.title??'未命名会话',excerpt,...row?.workspaceId?{workspaceId:row.workspaceId}:{}};
      controller.open({forwarding:true,title,source});
    }}><ActionIcon size={15} aria-hidden="true"/>{saved?'已加入待办':'加入待办'}</button>;
    return <><span ref={anchor} className="dsh-followup" style={{display:target?'none':'inline-flex'}}>{target?null:action}</span>{target&&createPortal(action,target)}</>;
  }
  ctx.effect(()=>ctx.slots.inject('conversation.chat.assistant-actions',()=>ctx.slots.register({name:'conversation.chat.assistant-actions',id:'dsh-followup',order:100},AssistantAction)),'dsh-followup: forward action');
  ctx.effect(()=>ctx.on('connection/reset',()=>{controller.reset();store.reset();}),'dsh-followup: scope reset');
}
