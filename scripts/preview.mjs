import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Repository} from '../output/test/host/repository.js';
import {TodoService} from '../output/test/host/service.js';
import {createRoutes,json} from '../output/test/host/routes.js';
import {UpdateChecker} from '../output/test/host/updates.js';
const dataDir=resolve(process.env.FOLLOWUP_PREVIEW_DATA??'.preview-data');
await mkdir(dataDir,{recursive:true});const repository=new Repository(dataDir);await repository.load();
const service=new TodoService(repository);service.start();
const updates=new UpdateChecker();updates.start();
const routes=createRoutes(service,req=>{
  const remote=req.socket.remoteAddress;
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))return false;
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return false;
  return !req.headers['sec-fetch-site']||req.headers['sec-fetch-site']!=='cross-site';
},updates);
const style=`html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}.preview-shell{display:flex;height:100%;background:#fafafa}.preview-sidebar{width:232px;flex-shrink:0;box-sizing:border-box;border-right:1px solid #e4e4e7;padding:28px 14px;display:flex;gap:8px;flex-direction:column;background:#f7f7f8;color:#27272a;font-size:13px}.preview-sidebar>strong{font-size:16px;margin:0 12px 24px}.preview-sidebar button{display:flex;align-items:center;gap:10px;border:0;background:none;padding:12px;border-radius:7px;cursor:pointer;text-align:left;font:inherit}.preview-sidebar button.active{background:#eaeaec}.preview-sidebar small{margin:auto 12px 0;color:#a1a1aa;line-height:20px;font-size:11px}.preview-main{flex:1;min-width:0;min-height:0}.preview-chat{height:100%;background:#fff;color:#27272a}.preview-chat header{height:72px;box-sizing:border-box;border-bottom:1px solid #e4e4e7;padding:24px 36px;font-size:16px}.preview-chat-body{max-width:750px;margin:60px auto;font-size:15px;line-height:2}.preview-user{margin:20px 0 60px auto;background:#f4f4f5;border-radius:14px;padding:12px 20px;width:max-content;max-width:80%}.preview-chat-body h3{font-size:16px}.preview-chat-body p{white-space:pre-wrap}.preview-chat-body small{display:block;color:#a1a1aa;margin-top:80px;font-size:11px}.preview-message-actions{display:flex;align-items:center;gap:10px}.preview-message-actions>button,.preview_endInfo>button{background:none;border:0;padding:5px 8px;color:#71717a;font-size:12px;cursor:pointer}.preview_endInfo{display:inline-flex;align-items:center;gap:10px}.preview_timeEnd{color:#a1a1aa;font-size:12px}.preview-works{padding:80px}`;
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DSH 待办 · 隔离开发预览</title><style>${style}</style></head><body><div id="root"></div><script src="preview.js"></script></body></html>`;
const server=createServer(async(req,res)=>{
  const path=new URL(req.url??'/',`http://${req.headers.host}`).pathname;
  if(path.startsWith('/dsh-followup/api'))return routes.route.handler(req,res);
  if(path==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html);}
  if(path==='/preview.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(await readFile(join('output','preview.js')));}
  if(path==='/favicon.ico'){res.writeHead(204);return res.end();}
  return json(res,404,{error:'not-found'});
});
const port=Number(process.env.PORT??4178);server.listen(port,'127.0.0.1',()=>console.log(`Preview http://127.0.0.1:${port} (data: ${dataDir})`));
async function close(){updates.close();routes.close();await new Promise(resolve=>server.close(resolve));await service.close();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
