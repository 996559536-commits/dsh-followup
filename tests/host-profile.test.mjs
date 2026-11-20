import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {apply} from '../lib/index.js';

for (const explicit of [false,true]) {
  test(explicit?'explicit data directory overrides profile storage':'Desktop Host starts with the launcher profileContext contract', {timeout:5000}, async t=>{
    t.mock.method(globalThis,'fetch',async()=>{throw new Error('isolated test: no network');});
    const root=await mkdtemp(join(tmpdir(),'dsh-followup-profile-'));
    const ready=Promise.withResolvers();let stop;
    const expected=explicit?join(root,'configured'):join(root,'data','dsh-followup');
    t.after(async()=>{await stop?.();await rm(root,{recursive:true,force:true});});
    apply({
      get:name=>name==='profileContext'?{dir:root}:undefined,
      effect:fn=>{stop=fn();},
      webServer:{register:route=>{ready.resolve(route);return()=>{};}},
      connection:{requestRejection:()=>undefined},
    },explicit?{dataDir:expected}:{});
    const route=await ready.promise;
    assert.equal(route.path,'/dsh-followup/api');
    const state=JSON.parse(await readFile(join(expected,'state.json'),'utf8'));
    assert.equal(state.schemaVersion,1);assert.deepEqual(state.todos,[]);
    let response;
    await route.handler({url:'/dsh-followup/api/state',method:'GET'}, {
      writeHead:status=>assert.equal(status,200),end:body=>{response=JSON.parse(body);},
    });
    assert.equal(response.result.scopeId,state.scopeId);
  });
}
