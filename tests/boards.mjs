/* Boards, drag between days, custom rules and folders. */
import {boot,newBrowser} from './harness.mjs';
import assert from 'node:assert/strict';
import {t} from './lib.mjs';
const add=(p,o={})=>p.ev(`addItem(${JSON.stringify({type:'task',title:'x',body:'',url:'',tags:[],project:null,due:null,promise:false,...o})}).id`);

console.log('Boards, rules and folders');
await t('the board has three columns and cards move with the arrows and by A.bmv',async()=>{
  const errors=[],p=await boot(newBrowser(),{errors}),a=add(p,{title:'Alpha'}),b=add(p,{title:'Beta'});
  p.ev('A.boardview()');const d=p.w.document,col=k=>[...d.querySelectorAll(`[data-col="${k}"] li.row b`)].map(x=>x.textContent);
  assert.deepEqual(col('todo').sort(),['Alpha','Beta']);
  d.querySelector(`[data-a="bstep"][data-i="${a}|1"]`).click();assert.deepEqual(col('doing'),['Alpha']);assert.equal(p.ev(`get('${a}').done`),false);
  p.ev(`A.bmv('${a}','done')`);assert.deepEqual(col('done'),['Alpha']);assert.equal(p.ev(`get('${a}').done`),true);
  p.ev(`A.bmv('${a}','todo')`);assert.deepEqual(col('todo').sort(),['Alpha','Beta']);assert.equal(p.ev(`get('${a}').st`),null);
  assert.deepEqual(errors,[]);p.close()});

await t('the board can be limited to one project',async()=>{
  const p=await boot(newBrowser());p.ev(`D.projects.push({id:'p1',name:'Thesis'})`);add(p,{title:'In thesis',project:'p1'});add(p,{title:'Elsewhere'});
  p.ev(`A.boardview('p1')`);const d=p.w.document;assert.match(d.querySelector('#m').textContent,/In thesis/);assert.doesNotMatch(d.querySelector('#m').textContent,/Elsewhere/);p.close()});

await t('a task moves to another day in the week view, by A.moveDay and by the Move sheet',async()=>{
  const p=await boot(newBrowser()),id=add(p,{title:'Shift me',due:p.ev('dk()')}),d=p.w.document;
  p.ev('A.weekview()');const tomorrow=p.ev('addD(1)'),wk=p.ev('nxMon(0)'),days=[...Array(7)].map((_,k)=>p.ev(`(()=>{const d=new Date(nxMon(0));d.setDate(d.getDate()+${k});return dk(d)})()`));
  assert.ok(d.querySelector(`[data-day="${p.ev('dk()')}"] li.row`));
  p.ev(`A.nxmv('${id}')`);const target=days.find(x=>x!==p.ev('dk()'));d.querySelector(`[data-day-pick="${target}"]`).click();
  assert.equal(p.ev(`get('${id}').due`),target);assert.ok(d.querySelector(`[data-day="${target}"] li.row`));
  p.ev(`A.moveDay('${id}','not-a-date')`);assert.equal(p.ev(`get('${id}').due`),target);p.close()});

await t('a custom rule becomes a smart collection, can be edited and deleted, and survives a reload',async()=>{
  const br=newBrowser(),errors=[],p=await boot(br,{errors});
  const hi=add(p,{title:'Urgent thing',tags:['work']});p.ev(`upd('${hi}',{pri:1})`);add(p,{title:'Calm thing',tags:['work']});add(p,{title:'Other'});
  p.ev(`nxRules.set([{id:'r1',name:'Urgent work',type:'task',status:'open',pri:'1',tag:'work',project:'any',due:'any',text:''}])`);
  assert.equal(p.ev(`D.items.filter(cols()['Urgent work']).length`),1);
  p.ev(`S.tab='browse';render()`);const d=p.w.document;assert.ok(d.querySelector('#nxrl'));assert.match(d.querySelector('#nxrl').textContent,/Urgent work/);
  p.ev(`A.rule('')`);d.querySelector('#nr-n').value='Words';d.querySelector('#nr-w').value='calm';d.querySelector('#nr-ok').click();
  assert.equal(p.ev('nxRules.list().length'),2);assert.equal(p.ev(`D.items.filter(cols()['Words']).length`),1);
  p.ev(`A.rule('r1')`);d.querySelector('#nr-del').click();assert.equal(p.ev('nxRules.list().length'),1);
  p.ev(`A.rule('')`);d.querySelector('#nr-ok').click();assert.match(d.querySelector('#nr-e').textContent,/name/i);assert.equal(p.ev('nxRules.list().length'),1);
  assert.deepEqual(errors,[]);p.close();
  const p2=await boot(br);assert.equal(p2.ev('nxRules.list().length'),1);p2.close()});

await t('rule matching covers due dates, projects and no-project',async()=>{
  const p=await boot(newBrowser());p.ev(`D.projects.push({id:'p1',name:'P'})`);
  add(p,{title:'late',due:p.ev('addD(-2)')});add(p,{title:'soon',due:p.ev('addD(3)')});add(p,{title:'inp',project:'p1'});
  const n=r=>p.ev(`D.items.filter(nxRules.pred(${JSON.stringify(r)})).length`);
  assert.equal(n({due:'overdue'}),1);assert.equal(n({due:'week'}),1);assert.equal(n({due:'none'}),1);assert.equal(n({project:'p1'}),1);assert.equal(n({project:'none'}),2);p.close()});

await t('files can be put in folders, filtered by folder, and the folder shows on the row',async()=>{
  const errors=[],p=await boot(newBrowser(),{errors}),d=p.w.document;
  const a=add(p,{type:'note',title:'Receipt'}),b=add(p,{type:'note',title:'Photo'});
  p.ev(`upd('${a}',{media:{id:'m1',kind:'file',name:'r.pdf',mime:'application/pdf'},folder:'Money'});upd('${b}',{media:{id:'m2',kind:'photo',name:'p.jpg',mime:'image/jpeg'}})`);
  p.ev(`S.tab='notes';S.nf='file';render()`);assert.ok(d.querySelector('#nxfd'));
  const vis=()=>[...d.querySelectorAll('#m ul li.row:not([hidden]) b')].map(x=>x.textContent);
  assert.deepEqual(vis().sort(),['Photo','Receipt']);
  d.querySelector('[data-a="ff"][data-i="Money"]').click();assert.deepEqual(vis(),['Receipt']);
  d.querySelector('[data-a="ff"][data-i="__none"]').click();assert.deepEqual(vis(),['Photo']);
  p.ev(`edit('${b}')`);const f=d.querySelector('#nxfo');assert.ok(f);f.value='Pics';f.onchange({target:f});assert.equal(p.ev(`get('${b}').folder`),'Pics');
  p.ev(`dlg.close();S.ff='';render()`);assert.match(d.querySelector('#m').textContent,/Folder: Money/);assert.deepEqual(errors,[]);p.close()});

console.log('Backups and sync carry the new fields');
await t('restoring a backup keeps priority, steps, board status, folder and rules',async()=>{
  const errors=[],a=await boot(newBrowser()),id=add(a,{title:'Keep me'});
  a.ev(`upd('${id}',{pri:2,st:'doing',folder:'F1',subs:[{id:'s1',t:'one',d:true},{id:'s2',t:'two',d:false}]});nxRules.set([{id:'r9',name:'My rule',type:'task',status:'open',pri:'any',due:'any',project:'any',tag:'x',text:''}])`);
  const json=a.ev('JSON.stringify({app:"nexus",v:3,...D,media:{}})');a.close();
  const b=await boot(newBrowser(),{errors});b.w.confirm=()=>true;b.ev('A.settings()');await b.sleep(30);
  b.w.document.querySelector('#fi').onchange({target:{files:[{size:json.length,text:async()=>json}]}});await b.sleep(300);
  const it=JSON.parse(b.ev(`JSON.stringify(D.items[0])`));assert.equal(it.pri,2);assert.equal(it.st,'doing');assert.equal(it.folder,'F1');assert.equal(it.subs.length,2);assert.equal(it.subs[0].d,true);
  assert.equal(b.ev('nxRules.list().length'),1);assert.equal(b.ev('nxRules.list()[0].tag'),'x');assert.deepEqual(errors,[]);b.close()});

await t('rules written before this version (in the old local key) move into the data once',async()=>{
  const p=await boot(newBrowser(),{pre:w=>w.localStorage.setItem('nexus.rules/',JSON.stringify([{id:'old1',name:'Old rule',type:'task'}]))});
  assert.equal(p.ev('nxRules.list().length'),1);assert.equal(p.ev('D.rules[0].id'),'old1');assert.equal(p.w.localStorage.getItem('nexus.rules/'),null);p.close()});

await t('sync merges rules from two devices and keeps both',async()=>{
  const p=await boot(newBrowser()),J=x=>JSON.parse(JSON.stringify(x));
  const L={items:[],projects:[],study:[],log:[],rules:[{id:'a',name:'A'}]},R={items:[],projects:[],study:[],log:[],rules:[{id:'b',name:'B'}]};
  const m=J(p.w.NXSync.merge(J(L),J(R),null));assert.deepEqual(m.rules.map(r=>r.id).sort(),['a','b']);
  const c=J(p.w.NXSync.clean({rules:[{id:'r',name:'ok'},{id:'bad'},null]}));assert.equal(c.rules.length,1);p.close()});

console.log('Page titles');
await t('a saved link gets its page title in the Android app, user titles are kept, and the switch turns it off',async()=>{
  const calls=[],pre=w=>{w.NexusNative={fetchTitle:(id,url)=>calls.push([id,url])}};
  const p=await boot(newBrowser(),{pre});const a=add(p,{type:'link',title:'example.com',url:'https://example.com/a'}),b=add(p,{type:'link',title:'My own name',url:'https://example.org/b'});
  p.ev('nxTitleQueue()');assert.deepEqual(calls.map(c=>c[0]),[a]);
  p.ev(`nxTitle('${a}','Example Domain')`);assert.equal(p.ev(`get('${a}').title`),'Example Domain');
  p.ev(`nxTitle('${b}','Something else')`);assert.equal(p.ev(`get('${b}').title`),'My own name');
  p.ev(`localStorage.setItem('nexus.titles'+NS,'off')`);add(p,{type:'link',title:'x.com',url:'https://x.com'});p.ev('nxTitleQueue()');assert.equal(calls.length,1);p.close()});
