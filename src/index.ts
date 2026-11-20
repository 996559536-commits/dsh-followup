import { isAbsolute, join } from 'node:path';
import { Repository } from './host/repository';
import { TodoService } from './host/service';
import { createRoutes, type Route } from './host/routes';
import type { IncomingMessage } from 'node:http';

interface HostContext {
  get(name: string): unknown;
  effect(callback: ()=>void | (()=>void | Promise<void>), label?: string): void;
  webServer: { register(route: Route): ()=>void };
  connection: { requestRejection(req: IncomingMessage): unknown };
}
export const name='dsh-followup';
export const inject=['webServer','connection'];
export function apply(ctx: HostContext, config: {dataDir?: string}={}) {
  const profile=ctx.get('profileContext') as {dir:string} | undefined;
  const dataDir=config.dataDir ?? (profile ? join(profile.dir,'data','dsh-followup') : process.env.DSH_FOLLOWUP_DATA_DIR);
  if(!dataDir || !isAbsolute(dataDir)) throw new Error('dsh-followup: 普通 Web Host 需要配置绝对路径 dataDir');
  ctx.effect(()=>{
    const repository=new Repository(dataDir); const service=new TodoService(repository);
    let disposed=false; let unregister: (()=>void)|undefined; let routes: ReturnType<typeof createRoutes>|undefined;
    const ready=repository.load().then(async()=>{
      if(disposed) return;
      routes=createRoutes(service,req=>ctx.connection.requestRejection(req)===undefined);
      unregister=ctx.webServer.register(routes.route); service.start();
    });
    void ready.catch(error=>console.error('[dsh-followup] 初始化失败',error));
    return async()=>{disposed=true; await ready.catch(()=>{}); unregister?.(); routes?.close(); await service.close();};
  },'dsh-followup: storage, API and reminders');
}
