import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {ListTodo, MessageSquare, PanelsTopLeft} from 'lucide-react';
import {TodoStore} from './client/store';
import {UIController} from './client/controller';
import {installIntegration} from './client/dsh/integration';
import {installStyles} from './client/styles';

installStyles();
const store=new TodoStore();const controller=new UIController();store.start();
type Entry={options:{name:string;id?:string;key?:string;order?:number;label?:string|(()=>string)};component:React.ComponentType<any>};
const entries:Entry[]=[];const listeners=new Set<()=>void>();const disposers:(()=>void)[]=[];
let panel='dsh-followup';let version=0;
const notify=()=>{version++;for(const listener of listeners)listener();};
const slots={
  register(options:Entry['options'],component:Entry['component']){const entry={options,component};entries.push(entry);notify();return()=>{const index=entries.indexOf(entry);if(index>=0)entries.splice(index,1);notify();};},
  inject(_name:string,fn:()=>unknown){const off=fn();return typeof off==='function'?off as ()=>void:()=>{};},
  entriesOfSlot(name:string){return entries.filter(entry=>entry.options.name===name);},
  subscribe(_name:string,listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
};
slots.register({name:'sidebar.panellist',id:'works',order:10,label:'作品'},()=> <PanelsTopLeft size={16}/>);
const quote='确认一个简洁的想法收集和跟进流程。\n把讨论中还没完成的事项记下来，之后由我安排时间推进。';
const closing={finalNode:{messageId:'preview-assistant-message',seq:12},blocks:[{kind:'text',text:quote}]};
const chat={timeline:{turns:new Map([[1,{data:new Map([['turn-tail',{closing}]])}]])}};
const fakeSession={title:'开发演示：会话里的后续事项',workspaceId:'preview-workspace'};
const context={slots,
  sessions:{list:{getSnapshot:()=>({byId:{'preview-session':fakeSession}})},refresh:async()=>{}},
  uiWorkspace:{openSession(_id:string){panel='chat';notify();}},
  effect(fn:()=>void|(()=>void)){const off=fn();if(off)disposers.push(off);},
  on(_event:string,_listener:()=>void){return()=>{};},
};
installIntegration(context,store,controller);
function Shell(){
  React.useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},()=>version);
  const boardOnly=new URL(location.href).searchParams.has('board');
  const Panel=entries.find(e=>e.options.name==='main'&&e.options.key===panel)?.component;
  const Global=entries.find(e=>e.options.name==='shell.overlay')?.component;
  const Forward=entries.find(e=>e.options.name==='conversation.chat.assistant-actions')?.component;
  return <div className={`preview-shell ${boardOnly?'board-only':''}`}>
    {!boardOnly&&<aside className="preview-sidebar"><strong>DeepSeek Harness</strong><button onClick={()=>{panel='chat';notify();}}><MessageSquare size={16}/>开发演示会话</button>{entries.filter(e=>e.options.name==='sidebar.panellist').sort((a,b)=>(a.options.order??0)-(b.options.order??0)).map(entry=>{const Icon=entry.component;return <button key={entry.options.id} className={panel===entry.options.id?'active':''} onClick={()=>{panel=entry.options.id!;notify();}}><Icon size={16}/>{typeof entry.options.label==='function'?entry.options.label():entry.options.label}</button>;})}<small>隔离开发预览<br/>使用独立待办数据</small></aside>}
    <div className="preview-main">{Panel?<Panel/>:panel==='chat'?<div className="preview-chat"><header>开发演示：会话里的后续事项</header><div className="preview-chat-body"><div className="preview-user">帮我把讨论中没有完成的事记录下来，方便之后推进。</div><h3>DeepSeek</h3><p>{quote}</p><div data-turn-tail="1" data-actions-reveal="always"><div data-clock="end" className="preview-message-actions"><button>复制</button>{Forward&&<Forward sessionId="preview-session" messageId="preview-assistant-message" useChat={(select:(snapshot:typeof chat)=>unknown)=>select(chat)}/>}<button>分支</button><span className="preview_endInfo"><button>用量 1M tok</button><span className="preview_timeEnd">18:57</span></span></div></div><small>此会话是验证转发流程的测试夹具，不是你的真实会话。</small></div></div>:<div className="preview-works"><ListTodo/><p>作品占位，用于验证待办入口顺序。</p></div>}</div>{Global&&<Global/>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<Shell/>);
window.addEventListener('pagehide',()=>{store.dispose();controller.dispose();for(const off of disposers.reverse())off();});
