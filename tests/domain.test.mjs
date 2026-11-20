import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Repository} from '../output/test/host/repository.js';
import {TodoService} from '../output/test/host/service.js';
import {parseDraft} from '../output/test/core/model.js';
import {dateKey,dueDay,weekStart,monthDays,moveMonth,statistics,rangeTodos,overdue} from '../output/test/core/selectors.js';

const draft=(extra={})=>({title:'跟进一个想法',note:'',priority:'inbox',due:null,reminder:'none',source:null,...extra});
async function fixture(t){
  const dir=await mkdtemp(join(tmpdir(),'dsh-followup-test-'));let now=new Date('2026-11-19T08:00:00Z');
  const repo=new Repository(dir);await repo.load();const service=new TodoService(repo,()=>now);
  t.after(async()=>{await service.close();await rm(dir,{recursive:true,force:true});});
  return {dir,repo,service,advance:(ms)=>{now=new Date(now.getTime()+ms);},create:(extra={},requestId=crypto.randomUUID())=>service.command({requestId,kind:'create',draft:draft(extra)})};
}
test('only title is required for an idea, defaults remain explicit',()=>{
  const value=parseDraft(draft({title:'  新想法  '}),'scope');assert.equal(value.title,'新想法');assert.equal(value.due,null);assert.equal(value.reminder,'none');assert.equal(value.priority,'inbox');
});
test('invalid input and impossible calendar dates are rejected',()=>{
  for(const value of [draft({title:''}),draft({title:'x'.repeat(201)}),draft({due:{kind:'date',date:'2026-02-30'}}),draft({due:{kind:'date',date:'2026-13-01'}}),draft({reminder:'at-due'}),draft({priority:'running'}),draft({due:{kind:'time',at:'invalid',timeZone:'Asia/Shanghai'}}),draft({due:{kind:'time',at:'2026-11-19T10:00:00Z',timeZone:'fake'}})])assert.throws(()=>parseDraft(value,'scope'));
});
test('inbox, priority, completion and scheduling remain independent',async t=>{
  const f=await fixture(t);const result=await f.create({due:{kind:'date',date:'2026-11-20'}});
  const todo=f.repo.snapshot().todos[0];assert.equal(todo.priority,'inbox');
  await f.service.command({requestId:crypto.randomUUID(),kind:'complete',id:result.id,expectedVersion:1});
  const done=f.repo.snapshot().todos[0];assert.equal(done.status,'done');assert.equal(done.priority,'inbox');assert.equal(done.due.date,'2026-11-20');assert.ok(done.completedAt);
});
test('manual save retry is durable and request payload cannot change',async t=>{
  const f=await fixture(t);const id=crypto.randomUUID();const first=await f.create({},id);
  assert.deepEqual(await f.create({},id),first);assert.equal(f.repo.snapshot().todos.length,1);
  await assert.rejects(f.create({title:'不同内容'},id),e=>e.code==='request-conflict');
  await f.service.close();const second=new Repository(f.dir);await second.load();const s=new TodoService(second);t.after(()=>s.close());
  assert.deepEqual(await s.command({requestId:id,kind:'create',draft:draft()}),first);assert.equal(second.snapshot().todos.length,1);
});
test('the same reply is captured once; deletion permits collecting it again',async t=>{
  const f=await fixture(t);const source={scopeId:f.repo.snapshot().scopeId,sessionId:'s1',messageId:'m1',sessionTitle:'会话',excerpt:'尚需跟进'};
  const a=await f.create({source});const b=await f.create({source,title:'改标题'});assert.equal(a.id,b.id);assert.equal(b.duplicate,true);
  await f.service.command({requestId:crypto.randomUUID(),kind:'delete',id:a.id,expectedVersion:1});
  const c=await f.create({source});assert.notEqual(c.id,a.id);
});
test('sources from another data scope are rejected',async t=>{
  const f=await fixture(t);await assert.rejects(f.create({source:{scopeId:'another',sessionId:'s',messageId:'m',sessionTitle:'x',excerpt:''}}),e=>e.code==='scope-mismatch');
});
test('two windows cannot silently overwrite the same todo',async t=>{
  const f=await fixture(t);const {id}=await f.create();
  const results=await Promise.allSettled(['first','second'].map(title=>f.service.command({requestId:crypto.randomUUID(),kind:'update',id,expectedVersion:1,draft:draft({title})})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'version-conflict');assert.equal(f.repo.snapshot().todos[0].version,2);
});
test('failed disk write does not publish a saved record or a receipt',async t=>{
  const f=await fixture(t);const original=f.repo.write.bind(f.repo);f.repo.write=async()=>{throw new Error('disk full');};
  const before=f.repo.snapshot();await assert.rejects(f.create(),/disk full/);assert.deepEqual(f.repo.snapshot(),before);
  f.repo.write=original;await f.create();assert.equal(f.repo.snapshot().todos.length,1);
});
test('snapshots cannot mutate the Host state',async t=>{
  const f=await fixture(t);await f.create();const snapshot=f.repo.snapshot();snapshot.todos[0].title='外部篡改';assert.equal(f.repo.snapshot().todos[0].title,'跟进一个想法');
});
test('active writer lock prevents a second Host',async t=>{
  const f=await fixture(t);const second=new Repository(f.dir);await assert.rejects(second.load(),/另一个 DSH Host/);
});
test('corrupt data is preserved and restored from a verified backup',async t=>{
  const f=await fixture(t);await f.create();await f.service.close();
  await writeFile(join(f.dir,'state.json'),'{broken');
  const recovered=new Repository(f.dir);await recovered.load();t.after(()=>recovered.close());
  assert.ok(recovered.recoveryNotice);assert.ok((await readdir(f.dir)).some(name=>name.includes('.corrupt-')));assert.equal(JSON.parse(await readFile(join(f.dir,'state.json'),'utf8')).schemaVersion,1);
});
test('corruption without a usable backup never clears existing data',async t=>{
  const f=await fixture(t);await f.service.close();await writeFile(join(f.dir,'state.json'),'corrupt');
  const broken=new Repository(f.dir);await assert.rejects(broken.load(),/停止写入/);assert.equal(await readFile(join(f.dir,'state.json'),'utf8'),'corrupt');
});
test('local date projection, leap months and Monday weeks are correct',()=>{
  assert.equal(dateKey('2026-11-18T18:30:00Z','Asia/Shanghai'),'2026-11-19');
  assert.equal(dateKey('2026-11-18T18:30:00Z','America/Los_Angeles'),'2026-11-18');
  assert.equal(dueDay({kind:'date',date:'2026-11-18'},'Asia/Shanghai'),'2026-11-18');
  assert.equal(weekStart('2026-11-22'),'2026-11-16');assert.equal(moveMonth('2028-01-31',1),'2028-02-29');
  assert.equal(monthDays('2026-11-19').length,42);assert.equal(monthDays('2026-11-19')[0],'2026-10-26');
});
test('statistics use one denominator and unscheduled ideas stay visible',async t=>{
  const f=await fixture(t);await f.create();await f.create({due:{kind:'date',date:'2026-12-01'}});const r=await f.create({due:{kind:'date',date:'2026-11-21'}});
  await f.service.command({requestId:crypto.randomUUID(),kind:'complete',id:r.id,expectedVersion:1});
  const rows=rangeTodos(f.repo.snapshot().todos,{from:'2026-11-01',to:'2026-11-30'});assert.equal(rows.length,2);assert.deepEqual(statistics(rows),{total:2,done:1,open:1,percent:50});assert.equal(statistics([]).percent,0);
});
test('date-only due is overdue after that date, timed due at the instant',()=>{
  const base={status:'open',due:{kind:'date',date:'2026-11-19'}};
  assert.equal(overdue(base,new Date('2026-11-19T10:00:00Z'),'Asia/Shanghai'),false);assert.equal(overdue(base,new Date('2026-11-19T17:00:00Z'),'Asia/Shanghai'),true);
});
test('due reminder is durable and scanning does not duplicate it',async t=>{
  const f=await fixture(t);await f.create({due:{kind:'time',at:'2026-11-19T08:01:00Z',timeZone:'Asia/Shanghai'},reminder:'at-due'});
  await f.service.tick();assert.equal(f.repo.snapshot().reminders.length,0);f.advance(60000);await f.service.tick();await f.service.tick();assert.equal(f.repo.snapshot().reminders.length,1);
  await f.service.close();const r=new Repository(f.dir);await r.load();const s=new TodoService(r,()=>new Date('2026-11-19T08:02:00Z'));t.after(()=>s.close());await s.tick();assert.equal(r.snapshot().reminders.length,1);
});
test('editing notes does not suppress an upcoming reminder',async t=>{
  const f=await fixture(t);const due={kind:'time',at:'2026-11-19T08:01:00Z',timeZone:'Asia/Shanghai'};const r=await f.create({due,reminder:'at-due'});
  f.advance(30000);await f.service.command({requestId:crypto.randomUUID(),kind:'update',id:r.id,expectedVersion:1,draft:draft({due,reminder:'at-due',note:'补充'})});
  f.advance(30000);await f.service.tick();assert.equal(f.repo.snapshot().reminders.length,1);
});
test('complete, delete and reschedule cancel the old notification',async t=>{
  for(const kind of ['complete','delete','update']){
    const f=await fixture(t);const r=await f.create({due:{kind:'time',at:'2026-11-19T08:01:00Z',timeZone:'Asia/Shanghai'},reminder:'at-due'});f.advance(60000);await f.service.tick();
    await f.service.command({requestId:crypto.randomUUID(),kind,id:r.id,expectedVersion:1,...kind==='update'?{draft:draft({due:{kind:'time',at:'2026-11-19T09:01:00Z',timeZone:'Asia/Shanghai'},reminder:'at-due'})}:{}});
    assert.ok(f.repo.snapshot().reminders[0].cancelledAt);assert.equal(await f.service.claim({id:f.repo.snapshot().reminders[0].id,clientId:'window'}),null);
  }
});
test('multiwindow notification claims are exclusive; failed delivery can release',async t=>{
  const f=await fixture(t);await f.create({due:{kind:'time',at:'2026-11-19T08:01:00Z',timeZone:'Asia/Shanghai'},reminder:'at-due'});f.advance(60000);await f.service.tick();const id=f.repo.snapshot().reminders[0].id;
  const [a,b]=await Promise.all([f.service.claim({id,clientId:'a'}),f.service.claim({id,clientId:'b'})]);assert.ok(a.token);assert.equal(b,null);
  await f.service.claim({id,clientId:'a',action:'release',token:a.token});const c=await f.service.claim({id,clientId:'b'});assert.ok(c.token);
  await f.service.claim({id,clientId:'b',action:'ack',token:c.token});assert.equal(await f.service.claim({id,clientId:'a'}),null);assert.ok(f.repo.snapshot().reminders[0].deliveredAt);
});
test('missed alerts are kept in app but not re-popped after 15 minutes',async t=>{
  const f=await fixture(t);await f.create({due:{kind:'time',at:'2026-11-19T08:01:00Z',timeZone:'Asia/Shanghai'},reminder:'at-due'});f.advance(3600000);await f.service.tick();const event=f.repo.snapshot().reminders[0];assert.ok(event);assert.equal(await f.service.claim({id:event.id,clientId:'a'}),null);
});
test('old reminders beyond the 24 hour catch-up window are not generated',async t=>{
  const f=await fixture(t);await f.create({due:{kind:'time',at:'2026-11-19T08:01:00Z',timeZone:'Asia/Shanghai'},reminder:'at-due'});f.advance(2*86400000);await f.service.tick();assert.equal(f.repo.snapshot().reminders.length,0);
});
