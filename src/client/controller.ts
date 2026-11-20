import type { EditorSeed } from './components/editor';
export class UIController {
  private value:{editor:EditorSeed|null;toast:string|null}={editor:null,toast:null};
  private listeners=new Set<()=>void>();private timer?:ReturnType<typeof setTimeout>;
  getSnapshot=()=>this.value;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private publish(){for(const listener of this.listeners)listener();}
  open=(editor:EditorSeed)=>{this.value={...this.value,editor};this.publish();};
  close=()=>{this.value={...this.value,editor:null};this.publish();};
  toast=(message:string)=>{if(this.timer)clearTimeout(this.timer);this.value={...this.value,toast:message};this.publish();this.timer=setTimeout(()=>{this.value={...this.value,toast:null};this.publish();},4500);};
  reset=()=>{this.value={editor:null,toast:null};this.publish();};
  dispose(){if(this.timer)clearTimeout(this.timer);this.listeners.clear();}
}
