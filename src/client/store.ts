import type { Command, CommandResult, State } from '../core/model';
export type Snapshot = Omit<State,'receipts'> & {recoveryNotice?: string | null};
export interface ClientState { data: Snapshot | null; error: string | null; connected: boolean }
export class ApiError extends Error { constructor(public code:string,message:string){super(message);} }
export function hostUrl(path: string, base = document.baseURI): string {
  const url=new URL(base);url.search='';url.hash='';if(!url.pathname.endsWith('/'))url.pathname+='/';
  return new URL(path.replace(/^\/+/,''),url).href;
}
export class TodoStore {
  private value:ClientState={data:null,error:null,connected:false};
  private listeners=new Set<()=>void>(); private events?:EventSource; private generation=0;
  private abort=new AbortController(); private poll?:ReturnType<typeof setInterval>; private active=false;
  private refreshing=false; private refreshAgain=false;
  constructor(private base:()=>string=()=>document.baseURI){}
  getSnapshot=()=>this.value;
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  private publish(value:ClientState){this.value=value;for(const fn of this.listeners)fn();}
  async request<T>(path:string,body?:unknown):Promise<T>{
    const response=await fetch(hostUrl(`dsh-followup/api/${path}`,this.base()),{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:this.abort.signal,...body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)}});
    let data;
    try{data=await response.json();}catch{throw new ApiError('service-unavailable','待办服务暂不可用，请稍后重试');}
    if(!response.ok||data.error)throw new ApiError(data.error?.code??'network',data.error?.message??`请求失败 (${response.status})`);return data.result;
  }
  async refresh(){
    if(this.refreshing){this.refreshAgain=true;return;}
    const generation=this.generation;this.refreshing=true;
    try{
      const data=await this.request<Snapshot>('state');if(generation!==this.generation)return;
      const previous=this.value.data;
      if(previous&&previous.scopeId===data.scopeId&&previous.revision>data.revision)return;
      this.publish({data,error:null,connected:true});
    }catch(error){if(generation===this.generation&&!this.abort.signal.aborted)this.publish({...this.value,connected:false,error:error instanceof Error?error.message:'无法连接待办服务'});}
    finally{this.refreshing=false;if(this.refreshAgain){this.refreshAgain=false;void this.refresh();}}
  }
  start(){
    if(this.active)return;this.active=true;
    this.events=new EventSource(hostUrl('dsh-followup/api/events',this.base()),{withCredentials:true});
    this.events.onopen=()=>void this.refresh();this.events.onmessage=()=>void this.refresh();
    this.events.onerror=()=>{this.publish({...this.value,connected:false});};
    // Polling is also a fallback for Desktop custom schemes that cannot stream SSE.
    this.poll=setInterval(()=>void this.refresh(),10_000);void this.refresh();
  }
  async command(command:Command){
    let result:CommandResult;
    try{result=await this.request<CommandResult>('command',command);}
    catch(error){if(!(error instanceof TypeError))throw error;result=await this.request<CommandResult>('command',command);}
    await this.refresh();return result;
  }
  reset(){this.generation++;this.events?.close();if(this.poll)clearInterval(this.poll);this.abort.abort();this.abort=new AbortController();this.active=false;this.publish({data:null,error:null,connected:false});this.start();}
  dispose(){this.generation++;this.events?.close();if(this.poll)clearInterval(this.poll);this.abort.abort();this.active=false;this.listeners.clear();}
}
