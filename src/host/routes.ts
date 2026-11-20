import type { IncomingMessage, ServerResponse } from 'node:http';
import { DomainError } from '../core/model';
import type { TodoService } from './service';
import type { UpdateChecker } from './updates';

export const API = '/dsh-followup/api';
export interface Route { kind: 'prefix'; path: string; handler(req: IncomingMessage, res: ServerResponse): void | Promise<void> }
export function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff' });
  res.end(JSON.stringify(value));
}
async function readBody(req: IncomingMessage): Promise<unknown> {
  if (!(req.headers['content-type']??'').toLowerCase().startsWith('application/json')) throw new DomainError('json-required','需要 JSON 请求',415);
  const chunks: Buffer[]=[]; let size=0;
  for await(const chunk of req) { const b=Buffer.from(chunk); size+=b.length; if(size>64*1024) throw new DomainError('too-large','内容过长',413); chunks.push(b); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new DomainError('invalid-json','JSON 格式错误'); }
}
export function createRoutes(service: TodoService, allowed: (req: IncomingMessage)=>boolean, updates?: Pick<UpdateChecker,'snapshot'|'check'>) {
  const clients=new Set<ServerResponse>();
  const route: Route={kind:'prefix',path:API,handler:async(req,res)=>{
    if(!allowed(req)) return json(res,403,{error:{code:'forbidden',message:'当前请求没有访问权限'}});
    const path=new URL(req.url??'/', 'http://dsh.internal').pathname;
    try {
      if(path===`${API}/updates` && req.method==='GET' && updates) return json(res,200,{result:updates.snapshot()});
      if(path===`${API}/updates/check` && req.method==='POST' && updates) {await readBody(req);return json(res,200,{result:await updates.check(true)});}
      if(path===`${API}/state` && req.method==='GET') return json(res,200,{result:service.snapshot()});
      if(path===`${API}/command` && req.method==='POST') return json(res,200,{result:await service.command(await readBody(req))});
      if(path===`${API}/notification-claim` && req.method==='POST') return json(res,200,{result:await service.claim(await readBody(req))});
      if(path===`${API}/events` && req.method==='GET') {
        res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive','x-accel-buffering':'no'});
        clients.add(res);
        const push=()=>{ if(!res.destroyed) res.write(`data: ${JSON.stringify({scopeId:service.snapshot().scopeId,revision:service.snapshot().revision})}\n\n`); };
        const off=service.subscribe(push); const timer=setInterval(()=>{ if(!res.destroyed) res.write(': heartbeat\n\n'); },20_000);
        push();
        res.on('close',()=>{off(); clearInterval(timer); clients.delete(res);});
        return;
      }
      return json(res,404,{error:{code:'not-found',message:'接口不存在'}});
    } catch(error) {
      const e=error instanceof DomainError ? error : new DomainError('storage-error','保存失败，请检查磁盘和插件日志',500);
      if(!(error instanceof DomainError)) console.error('[dsh-followup]',error);
      return json(res,e.status,{error:{code:e.code,message:e.message}});
    }
  }};
  return {route,close(){for(const client of clients) client.end(); clients.clear();}};
}
