import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {compareVersions, parseRelease, hasUpdate, UPDATE_MANIFEST_URL, REPOSITORY_URL} from '../output/test/core/updates.js';
import {UpdateChecker, CHECK_INTERVAL, MANUAL_CHECK_INTERVAL, ERROR_RETRY_INTERVAL} from '../output/test/host/updates.js';
import {createRoutes} from '../output/test/host/routes.js';
import {UpdateStore} from '../output/test/client/updates.js';

const manifest=(version='0.1.5')=>({schemaVersion:1,version,releaseUrl:`${REPOSITORY_URL}/releases/tag/v${version}`,downloadUrl:`${REPOSITORY_URL}/releases/download/v${version}/dsh-followup-${version}.tgz`,sha256:'a'.repeat(64),publishedAt:'2026-11-20T00:00:00.000Z',notes:'新增版本检测'});
const response=(value=manifest())=>new Response(JSON.stringify(value));
const snapshot=(version='0.1.5')=>({currentVersion:'0.1.4',status:'available',latest:parseRelease(manifest(version)),checkedAt:'2026-11-20T00:00:00.000Z',error:null});

test('release versions compare numerically and reject prereleases or malformed versions',()=>{
  assert.equal(compareVersions('0.1.10','0.1.9'),1);assert.equal(compareVersions('1.0.0','0.99.99'),1);
  assert.equal(compareVersions('0.1.4','0.1.4'),0);assert.equal(compareVersions('0.1.3','0.1.4'),-1);
  for(const value of ['v0.1.4','0.1.4-beta.1','0.01.4','0.1','1.2.999999999999999999999'])assert.throws(()=>compareVersions(value,'0.1.4'));
});
test('release metadata cannot point to another project or arbitrary download',()=>{
  for(const extra of [{schemaVersion:2},{downloadUrl:'https://example.com/a.tgz'},{releaseUrl:`${REPOSITORY_URL}/releases/tag/v9.0.0`},{version:'0.1.5-beta'},{sha256:'not-a-checksum'},{publishedAt:'unknown'},{notes:'a'.repeat(2001)}])assert.throws(()=>parseRelease({...manifest(),...extra}));
  assert.equal(parseRelease(manifest()).version,'0.1.5');
});
test('checks fetch only the public feed without credentials and detect newer versions',async t=>{
  let request;
  const checker=new UpdateChecker({version:'0.1.4',fetch:async(...args)=>{request=args;return response();}});t.after(()=>checker.close());
  const value=await checker.check();assert.equal(value.status,'available');assert.ok(hasUpdate(value));
  assert.equal(request[0],UPDATE_MANIFEST_URL);assert.equal(request[1].credentials,'omit');assert.equal(request[1].body,undefined);assert.equal(request[1].headers.authorization,undefined);
});
test('equal or older published versions never trigger an update',async t=>{
  for(const version of ['0.1.4','0.1.3']){
    const checker=new UpdateChecker({version:'0.1.4',fetch:async()=>response(manifest(version))});t.after(()=>checker.close());
    const value=await checker.check();assert.equal(value.status,'up-to-date');assert.equal(hasUpdate(value),false);
  }
});
test('concurrent and repeated checks share one request; manual and automatic cooldowns differ',async t=>{
  const ready=Promise.withResolvers();let now=0,calls=0;
  const checker=new UpdateChecker({version:'0.1.4',now:()=>now,fetch:async()=>{calls++;await ready.promise;return response();}});t.after(()=>checker.close());
  const first=checker.check();assert.equal(checker.check(true),first);ready.resolve();await first;
  await checker.check(true);assert.equal(calls,1);
  now=MANUAL_CHECK_INTERVAL;await checker.check(true);assert.equal(calls,2);
  now=CHECK_INTERVAL;await checker.check();assert.equal(calls,2);
  now+=MANUAL_CHECK_INTERVAL;await checker.check();assert.equal(calls,3);
});
test('offline errors preserve a known update and recover after retry interval',async t=>{
  let now=0,offline=false,calls=0;
  const checker=new UpdateChecker({version:'0.1.4',now:()=>now,fetch:async()=>{calls++;if(offline)throw new TypeError('offline');return response();}});t.after(()=>checker.close());
  const first=await checker.check();offline=true;now=MANUAL_CHECK_INTERVAL;
  const failed=await checker.check(true);assert.equal(failed.status,'error');assert.equal(failed.latest.version,'0.1.5');assert.equal(failed.checkedAt,first.checkedAt);assert.ok(hasUpdate(failed));
  offline=false;now+=ERROR_RETRY_INTERVAL-1;await checker.check();assert.equal(calls,2);
  now++;assert.equal((await checker.check()).status,'available');assert.equal(calls,3);
});
test('invalid or oversized feed responses are errors and do not create update links',async t=>{
  for(const make of [()=>new Response('not json'),()=>new Response('x'.repeat(33*1024)),()=>new Response('{}',{status:404}),()=>response({...manifest(),downloadUrl:'javascript:alert(1)'})]){
    const checker=new UpdateChecker({fetch:async()=>make()});t.after(()=>checker.close());const value=await checker.check();assert.equal(value.status,'error');assert.equal(value.latest,null);
  }
});
test('unloading cancels pending version requests and ignores late results',async()=>{
  let signal;const ready=Promise.withResolvers();
  const checker=new UpdateChecker({fetch:async(_url,options)=>{signal=options.signal;await ready.promise;return response();}});
  const pending=checker.check();checker.close();assert.equal(signal.aborted,true);ready.resolve();await pending;assert.equal(checker.snapshot().latest,null);
});
test('update routes require host authorization and JSON for manual checks',async()=>{
  let calls=0;
  const updates={snapshot:()=>snapshot(),check:async()=>{calls++;return snapshot();}};
  async function request(allowed,path,method,headers={}){
    const routes=createRoutes({},()=>allowed,updates);const req=Readable.from(['{}']);Object.assign(req,{url:'/dsh-followup/api/'+path,method,headers});
    let status,body;await routes.route.handler(req,{writeHead:value=>{status=value;},end:value=>{body=JSON.parse(value);}});routes.close();return {status,body};
  }
  assert.equal((await request(false,'updates/check','POST',{'content-type':'application/json'})).status,403);assert.equal(calls,0);
  assert.equal((await request(true,'updates/check','POST')).status,415);assert.equal(calls,0);
  assert.equal((await request(true,'updates','GET')).body.result.latest.version,'0.1.5');
  assert.equal((await request(true,'updates/check','POST',{'content-type':'application/json'})).status,200);assert.equal(calls,1);
});
function mockStorage(t){
  const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}});
  t.after(()=>{if(old)Object.defineProperty(globalThis,'localStorage',old);else delete globalThis.localStorage;});return values;
}
test('dismissing an update is per version and survives a new client instance',async t=>{
  mockStorage(t);let version='0.1.5';const api={request:async()=>snapshot(version)};
  const store=new UpdateStore(api);t.after(()=>store.dispose());await store.check();store.dismiss();assert.equal(store.getSnapshot().dismissedVersion,'0.1.5');
  const next=new UpdateStore(api);t.after(()=>next.dispose());await next.check();assert.equal(next.getSnapshot().dismissedVersion,next.getSnapshot().latest.version);
  version='0.1.6';await next.check();assert.notEqual(next.getSnapshot().dismissedVersion,next.getSnapshot().latest.version);
});
test('late responses after a profile reset cannot overwrite the new client state',async t=>{
  mockStorage(t);const old=Promise.withResolvers();let calls=0;
  const store=new UpdateStore({request:async()=>++calls===1?old.promise:snapshot('0.1.6')});t.after(()=>store.dispose());
  const pending=store.check();store.reset();await new Promise(resolve=>setImmediate(resolve));old.resolve(snapshot('0.1.5'));await pending;
  assert.equal(store.getSnapshot().latest.version,'0.1.6');
});
