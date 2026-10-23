import {boot,newBrowser} from './harness.mjs';
import assert from 'node:assert/strict';
import {t,state} from './lib.mjs';

const add=(p,o={})=>p.ev(`addItem(${JSON.stringify({type:'task',title:'x',body:'',url:'',tags:[],project:null,due:null,promise:false,...o})}).id`);
const K='nexus.data/';

console.log('Boot');
await t('app starts with every script and no script errors',async()=>{
  const br=newBrowser(),errors=[],p=await boot(br,{errors});
  assert.equal(p.ev('typeof NXSafe'),'object');assert.equal(p.ev('typeof nxPalette'),'function');assert.equal(p.ev('typeof nxWhen'),'function');
  assert.deepEqual(errors,[]);p.close()});

console.log('Trash');
await t('deleted item lands in trash and can be restored',async()=>{
  const br=newBrowser(),p=await boot(br),id=add(p,{title:'Buy milk'});await p.flush();
  p.ev(`D.items=D.items.filter(x=>x.id==='${id}');D.items=[];save()`);await p.flush();
  const tr=await p.w.NXSafe.trash();assert.equal(tr.length,1);assert.equal(tr[0].kind,'item');assert.equal(tr[0].data.title,'Buy milk');
  await p.w.NXSafe.restoreEntry(tr[0]);assert.equal(p.ev('D.items.length'),1);assert.equal((await p.w.NXSafe.trash()).length,0);p.close()});
await t('the app\'s own Undo removes the item from the trash again',async()=>{
  const br=newBrowser(),p=await boot(br),id=add(p);await p.flush();
  p.ev(`window.__c=D.items[0];D.items=[];save()`);await p.flush();assert.equal((await p.w.NXSafe.trash()).length,1);
  p.ev(`D.items.push(window.__c);save()`);await p.flush();assert.equal((await p.w.NXSafe.trash()).length,0);p.close()});
await t('deleting a project, a subject and a single card are all recoverable',async()=>{
  const br=newBrowser(),p=await boot(br);
  p.ev(`D.projects.push({id:'p1',name:'Thesis'});D.study.push({id:'s1',name:'Physics',cards:[{id:'c1',q:'F?',a:'ma',box:0,due:'2026-01-01'},{id:'c2',q:'E?',a:'mc2',box:0,due:'2026-01-01'}]});D.study.push({id:'s2',name:'Maths',cards:[]});save()`);await p.flush();
  p.ev(`D.projects=[];D.study[0].cards=D.study[0].cards.filter(c=>c.id!=='c1');D.study=D.study.filter(s=>s.id!=='s2');save()`);await p.flush();
  const tr=await p.w.NXSafe.trash();assert.deepEqual([...tr.map(e=>e.kind)].sort(),['card','project','subject']);
  for(const e of tr)await p.w.NXSafe.restoreEntry(e);
  assert.equal(p.ev('D.projects.length'),1);assert.equal(p.ev('D.study.length'),2);assert.equal(p.ev('D.study.find(s=>s.id==="s1").cards.length'),2);p.close()});
await t('delete-all collapses into one batch entry and a restore point is saved first',async()=>{
  const br=newBrowser(),p=await boot(br);
  p.ev(`for(let i=0;i<40;i++)addItem({type:'note',title:'n'+i,body:'',url:'',tags:[],project:null,due:null,promise:false})`);await p.flush();
  p.ev(`D={items:[],projects:[],log:[],study:[]};save()`);await p.flush();
  const tr=await p.w.NXSafe.trash();assert.equal(tr.length,1);assert.equal(tr[0].kind,'batch');
  const sn=await p.w.NXSafe.snaps();assert.ok(sn.some(s=>/big deletion/.test(s.reason)&&s.n===40));
  await p.w.NXSafe.restoreEntry(tr[0]);assert.equal(p.ev('D.items.length'),40);p.close()});
await t('entries older than 30 days are purged',async()=>{
  const br=newBrowser(),p=await boot(br);add(p);await p.flush();p.ev('D.items=[];save()');await p.flush();
  const idb=p.w.indexedDB;const db=await new Promise(r=>{const q=idb.open('nexus-safety/');q.onsuccess=()=>r(q.result)});
  await new Promise(r=>{const x=db.transaction('trash','readwrite'),s=x.objectStore('trash');s.getAll().onsuccess=e=>{e.target.result.forEach(o=>{o.t=Date.now()-31*864e5;s.put(o)})};x.oncomplete=r});
  add(p,{title:'b'});await p.flush();p.ev('D.items=[];save()');await p.flush();
  const tr=await p.w.NXSafe.trash();assert.equal(tr.length,1);assert.equal(tr[0].data.title,'b');p.close()});

console.log('Restore points');
await t('automatic restore point exists and restoring one brings data back',async()=>{
  const br=newBrowser(),p=await boot(br);add(p,{title:'keep me'});await p.flush();
  let sn=await p.w.NXSafe.snaps();assert.ok(sn.length>=1);const target=sn[0];
  add(p,{title:'newer'});await p.flush();
  assert.equal(await p.w.NXSafe.restoreSnap(target),true);
  assert.equal(JSON.parse(p.w.localStorage.getItem(K)).items.length,1);
  sn=await p.w.NXSafe.snaps();assert.ok(sn.some(s=>/before restoring/.test(s.reason)));p.close()});
await t('snapshots are pruned to a sensible number',async()=>{
  const br=newBrowser(),p=await boot(br);add(p);await p.flush();
  for(let i=0;i<25;i++)await p.w.NXSafe.snapAdd(p.w.localStorage.getItem(K),'saved by you');
  const sn=await p.w.NXSafe.snaps();assert.ok(sn.length<=12,'kept '+sn.length);p.close()});

console.log('Damaged or missing data');
await t('damaged storage is recovered from the safe copy, never overwritten with empty',async()=>{
  const br=newBrowser();let p=await boot(br);add(p,{title:'precious'});await p.flush();p.close();
  br.ls[K]='{"items":[{"id":"a"';                       /* damaged */
  p=await boot(br);await p.sleep(300);
  assert.equal(JSON.parse(p.w.localStorage.getItem(K)).items[0].title,'precious');
  assert.equal(p.w.sessionStorage.getItem('nx.rec'),'1');p.close();
  p=await boot(br);assert.equal(p.ev('D.items.length'),1);                 /* after the reload the app sees it */
  p.close()});
await t('damaged data with no copy anywhere is kept in a restore point, not lost',async()=>{
  const br=newBrowser();br.ls[K]='{oops';const p=await boot(br);await p.sleep(300);
  p.ev(`addItem({type:'note',title:'fresh',body:'',url:'',tags:[],project:null,due:null,promise:false})`);await p.flush();
  const sn=await p.w.NXSafe.snaps();assert.ok(sn.some(s=>/damaged/.test(s.reason)&&s.raw==='{oops'));p.close()});
await t('localStorage wiped but IndexedDB intact: data comes back',async()=>{
  const br=newBrowser();let p=await boot(br);add(p,{title:'still here'});await p.flush();p.close();
  br.ls={};p=await boot(br);await p.sleep(300);
  assert.equal(JSON.parse(p.w.localStorage.getItem(K)||'{}').items[0].title,'still here');p.close()});
await t('a brand-new user is not affected (no phantom recovery)',async()=>{
  const br=newBrowser(),p=await boot(br);await p.sleep(200);assert.equal(p.w.sessionStorage.getItem('nx.rec'),null);assert.equal(p.ev('D.items.length'),0);
  add(p);assert.ok(p.w.localStorage.getItem(K));p.close()});
await t('storage full: app is told, and a safe copy is still kept',async()=>{
  const br=newBrowser();let p=await boot(br,{quotaFail:true});add(p,{title:'one'});await p.flush();
  p.w.__full=true;const id=add(p,{title:'two'});await p.sleep(450);        /* app's save() swallows the error and toasts */
  const m=await p.w.NXSafe.mirror();assert.equal(JSON.parse(m.raw).items.length,2);
  p.close();p=await boot(br);await p.sleep(300);
  assert.equal(JSON.parse(p.w.localStorage.getItem(K)).items.length,2);p.close()});
await t('clearing storage deliberately still leaves a restore point',async()=>{
  const br=newBrowser(),p=await boot(br);add(p,{title:'a'});await p.flush();p.w.localStorage.removeItem(K);await p.sleep(100);
  const sn=await p.w.NXSafe.snaps();assert.ok(sn.some(s=>/cleared/.test(s.reason)));p.close()});

console.log('Settings screen');
await t('Safety net section appears in Settings with trash and restore points',async()=>{
  const br=newBrowser(),p=await boot(br);p.ev('settings()');await p.sleep(100);
  assert.ok(p.w.document.querySelector('#nx-safe'));assert.ok(p.w.document.querySelector('#nx-tr'));
  p.w.document.querySelector('#nx-tr').click();await p.sleep(100);assert.match(p.w.document.querySelector('#dlg').textContent,/trash is empty/i);p.close()});

console.log('Calm overdue');
await t('overdue label is neutral and not red',async()=>{
  const br=newBrowser(),p=await boot(br);const l=p.ev(`dueL(addD(-3))`);assert.match(l,/^from /);assert.doesNotMatch(l,/overdue/i);
  const css=await import('node:fs').then(f=>f.readFileSync(new URL('../theme.css',import.meta.url),'utf8'));assert.match(css,/small\.late\{color:var\(--mu\)\}/);p.close()});

console.log('Smarter dates');
await t('weekday, relative and recurring phrases',async()=>{
  const br=newBrowser(),p=await boot(br);const W=s=>JSON.parse(p.ev(`JSON.stringify(nxWhen(${JSON.stringify(s)}))`));
  const wd=d=>new Date(d+'T12:00').getDay(),days=d=>Math.round((new Date(d+'T12:00')-new Date(p.ev('dk()')+'T12:00'))/864e5);
  assert.equal(wd(W('call mom friday').due),5);assert.ok(days(W('call mom friday').due)>=1);
  assert.equal(wd(W('gym every monday').due),1);assert.equal(W('gym every monday').rep,'weekly');
  assert.equal(days(W('pay rent in 3 days').due),3);assert.equal(days(W('review in 2 weeks').due),14);assert.equal(days(W('plan next week').due),7);
  assert.equal(W('water plants every day').rep,'daily');assert.equal(W('bills monthly').rep,'monthly');
  assert.equal(days(W('rent repu').due),1);assert.equal(days(W('పని రేపు').due),1);assert.equal(days(W('kaam परसों').due),2);
  assert.equal(W('just a note about monday morning light').due!==undefined,true);   /* parse() only applies it to tasks */
  p.close()});
await t('parse and addItem carry the date and repeat into a real task',async()=>{
  const br=newBrowser(),p=await boot(br);
  const r=JSON.parse(p.ev(`(()=>{const it=addItem(parse('task submit report every friday'));return JSON.stringify({rep:it.rep,due:it.due})})()`));
  assert.equal(r.rep,'weekly');assert.equal(new Date(r.due+'T12:00').getDay(),5);
  const n=JSON.parse(p.ev(`JSON.stringify(parse('idea something about friday'))`));assert.equal(n.due,null);p.close()});

console.log('Command palette');
await t('Ctrl+K opens it, filters, and runs a command',async()=>{
  const br=newBrowser(),p=await boot(br);add(p,{title:'Write essay'});
  p.w.document.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));await p.sleep(50);
  const inp=p.w.document.querySelector('#nxp');assert.ok(inp);
  inp.value='essay';inp.dispatchEvent(new p.w.Event('input'));assert.match(p.w.document.querySelector('#nxl').textContent,/Write essay/);
  inp.value='settings';inp.dispatchEvent(new p.w.Event('input'));
  inp.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await p.sleep(300);
  assert.ok(p.w.document.querySelector('#nx-safe'),'settings should open from the palette');p.close()});
await t('"c" opens Capture when not typing, but not while typing',async()=>{
  const br=newBrowser(),p=await boot(br);
  p.w.document.querySelector('#q').dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'c',bubbles:true}));await p.sleep(30);assert.equal(p.w.document.querySelector('#dlg').open,false);
  p.w.document.body.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'c',bubbles:true}));await p.sleep(30);assert.equal(p.w.document.querySelector('#dlg').open,true);p.close()});


console.log('Time blocks (Phase 2)');
const stamp=(day,hm)=>new Date(day+'T'+hm+':00').getTime();
await t('clock phrases: at 5pm, 17:30, noon, in 2 hours, for 45 min',async()=>{
  const br=newBrowser(),p=await boot(br);const C=s=>JSON.parse(p.ev(`JSON.stringify(nxClock(${JSON.stringify(s)}))`));
  assert.equal(C('call Sam at 5pm').tm,'17:00');assert.equal(C('call at 5:30 pm').tm,'17:30');assert.equal(C('standup at 17:30').tm,'17:30');
  assert.equal(C('lunch at noon').tm,'12:00');assert.equal(C('gym at 9am').tm,'09:00');assert.equal(C('late at 12am').tm,'00:00');
  assert.equal(C('call at 3').tm,'15:00');assert.equal(C('wake at 8').tm,'08:00');assert.equal(C('standup 09:15').tm,'09:15');
  assert.equal(C('write report for 45 min').dur,45);assert.equal(C('study for 2 hours').dur,120);
  assert.equal(C('read chapter 5').tm,null);assert.equal(C('buy 2 apples').tm,null);assert.equal(C('in 3 months').tm,null);
  const r=C('stretch in 2 hours'),diff=stamp(r.due,r.tm)-Date.now();
  assert.ok(diff>2*36e5-6e4&&diff<2*36e5+3e5+6e4,'in 2 hours was '+diff);p.close()});
await t('typed tasks get a date and time; notes do not',async()=>{
  const br=newBrowser(),p=await boot(br);
  const r=JSON.parse(p.ev(`(()=>{const a=addItem(parse('task call Sam tomorrow at 5pm for 20 min')),b=addItem(parse('note call Sam at 5pm'));return JSON.stringify({a:{due:a.due,tm:a.tm,dur:a.dur,type:a.type},b:{type:b.type,tm:b.tm||null},t:addD(1)})})()`));
  assert.equal(r.a.type,'task');assert.equal(r.a.tm,'17:00');assert.equal(r.a.dur,20);assert.equal(r.a.due,r.t);assert.equal(r.b.type,'note');assert.equal(r.b.tm,null);
  const f=JSON.parse(p.ev(`(()=>{const x=addItem(parse('task pay bill at 5pm'));return JSON.stringify({due:x.due,tm:x.tm})})()`));
  assert.ok(f.due&&f.tm==='17:00');p.close()});
await t('place, clamp at midnight, and take off the plan',async()=>{
  const br=newBrowser(),p=await boot(br),id=add(p,{title:'Draft'}),td=p.ev('dk()');
  p.ev(`nxPlace('${id}','${td}',555,45)`);let it=JSON.parse(p.ev(`JSON.stringify(get('${id}'))`));
  assert.equal(it.tm,'09:15');assert.equal(it.dur,45);assert.equal(it.due,td);
  const s=JSON.parse(p.ev(`JSON.stringify(nxT.slot(get('${id}')))`));assert.deepEqual(s,{s:555,e:600,d:45});
  p.ev(`nxPlace('${id}','${td}',1430,45)`);assert.equal(p.ev(`get('${id}').tm`),'23:15');
  p.ev(`nxUnplace('${id}')`);assert.equal(p.ev(`nxT.slot(get('${id}'))`),null);assert.equal(p.ev(`get('${id}').due`),td);p.close()});
await t('the task editor has start time and length, and a time sets today when there is no date',async()=>{
  const br=newBrowser(),p=await boot(br),id=add(p,{title:'Call dentist'});
  p.ev(`edit('${id}')`);const d=p.w.document,tm=d.querySelector('#etm');assert.ok(tm&&d.querySelector('#edu'));
  tm.value='14:30';tm.dispatchEvent(new p.w.Event('change'));
  assert.equal(p.ev(`get('${id}').tm`),'14:30');assert.equal(p.ev(`get('${id}').due`),p.ev('dk()'));assert.equal(d.querySelector('#ed').value,p.ev('dk()'));
  tm.value='';tm.dispatchEvent(new p.w.Event('change'));assert.equal(p.ev(`get('${id}').tm`),null);p.close()});
await t('a repeating task keeps its time when the next one is made',async()=>{
  const br=newBrowser(),p=await boot(br),id=add(p,{title:'Take pills',due:p.ev('dk()')});
  p.ev(`const x=get('${id}');x.rep='daily';x.tm='08:00';x.dur=10;save()`);p.ev(`upd('${id}',{done:true})`);
  const n=JSON.parse(p.ev(`JSON.stringify(D.items.filter(i=>!i.done&&i.title==='Take pills'))`));
  assert.equal(n.length,1);assert.equal(n[0].tm,'08:00');assert.equal(n[0].dur,10);p.close()});
await t('start time and length survive Export and Restore backup',async()=>{
  const br=newBrowser(),p=await boot(br),td=p.ev('dk()');
  const json=JSON.stringify({app:'nexus',v:3,items:[{id:'a1',type:'task',title:'Timed',body:'',url:'',project:null,tags:[],done:false,doneAt:null,due:td,tm:'10:45',dur:90,promise:false,created:new Date().toISOString(),updated:new Date().toISOString()},
    {id:'a2',type:'task',title:'Bad',body:'',url:'',project:null,tags:[],done:false,doneAt:null,due:td,tm:'25:99',dur:99999,promise:false,created:new Date().toISOString(),updated:new Date().toISOString()}],projects:[],log:[],study:[],media:{}});
  p.w.confirm=()=>true;p.ev('settings()');const fi=p.w.document.querySelector('#fi');assert.ok(fi);
  Object.defineProperty(fi,'files',{value:[{size:json.length,text:async()=>json}]});fi.dispatchEvent(new p.w.Event('change'));await p.sleep(300);
  const a=JSON.parse(p.ev(`JSON.stringify(D.items.map(i=>[i.id,i.tm||null,i.dur||null]))`));
  assert.deepEqual(a.find(x=>x[0]==='a1'),['a1','10:45',90]);assert.deepEqual(a.find(x=>x[0]==='a2'),['a2',null,null]);p.close()});

console.log('Plan screen');
await t('the plan lays tasks out by time, side by side when they overlap, with unplaced ones to drag',async()=>{
  const br=newBrowser(),p=await boot(br),td=p.ev('dk()'),d=p.w.document;
  const a=add(p,{title:'Alpha'}),b=add(p,{title:'Beta'}),c=add(p,{title:'Gamma'}),z=add(p,{title:'Loose end'});
  p.ev(`nxPlace('${a}','${td}',600,60);nxPlace('${b}','${td}',630,60);nxPlace('${c}','${td}',840,30)`);
  p.ev('A.planview()');assert.equal(p.ev('S.tab'),'plan');
  assert.equal(d.querySelectorAll('#nxz .nxb').length,3);
  const w=[...d.querySelectorAll('#nxz .nxb')].map(e=>[e.textContent.slice(0,5),e.getAttribute('style')]);
  assert.match(w.find(x=>x[0]==='Alpha')[1],/width:calc\(50%/);assert.match(w.find(x=>x[0]==='Gamma')[1],/width:calc\(100%/);
  assert.ok(d.querySelector('#nxt .nxc')&&/Loose end/.test(d.querySelector('#nxt').textContent));
  assert.ok(d.querySelector('#nv [aria-current=page]').textContent==='Tasks');
  assert.equal(d.querySelector('#nxday').textContent,'Today');p.ev('A.nxnext()');assert.equal(d.querySelector('#nxday').textContent,'Tomorrow');
  assert.equal(d.querySelectorAll('#nxz .nxb').length,0);p.ev('A.nxtoday()');assert.equal(d.querySelectorAll('#nxz .nxb').length,3);
  p.ev('A.tab("tasks")');assert.equal(p.ev('S.tab'),'tasks');assert.ok(d.querySelector('[data-a=planview]'));p.close()});
await t('tap a task, then tap a time, to schedule it (no dragging needed)',async()=>{
  const br=newBrowser(),p=await boot(br),d=p.w.document,id=add(p,{title:'Email Priya'});
  p.ev('A.planview()');d.querySelector('[data-a=nxsel]').click();assert.equal(d.querySelector('.nxc').getAttribute('aria-pressed'),'true');
  const g=d.querySelector('#nxg'),h0=+g.dataset.h0;g.dispatchEvent(new p.w.MouseEvent('click',{bubbles:true,clientY:60}));
  const want=Math.floor((60/56*60+h0*60)/15)*15;assert.equal(p.ev(`nxT.mins(get('${id}').tm)`),want);assert.equal(p.ev(`get('${id}').due`),p.ev('dk()'));p.close()});
await t('dragging a chip onto the day, a block\'s edge, and a block back to the tray all work',async()=>{
  const br=newBrowser(),p=await boot(br),d=p.w.document,id=add(p,{title:'Write intro'});
  const fire=(el,type,x,y)=>{const e=new p.w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperty(e,'pointerType',{value:'mouse'});el.dispatchEvent(e)};
  p.ev('A.planview()');const h0=+d.querySelector('#nxg').dataset.h0;
  p.ev(`document.querySelector('#nxg').getBoundingClientRect=()=>({top:0,bottom:2000,left:0,right:400,width:400,height:2000})`);
  fire(d.querySelector('.nxc'),'pointerdown',0,300);fire(d,'pointermove',0,200);fire(d,'pointermove',0,30.5333);await p.sleep(40);
  assert.ok(d.querySelector('.nxgh'),'a ghost follows the pointer');assert.ok(d.querySelector('#nxp'),'a preview shows where it will land');
  fire(d,'pointerup',0,30.5333);assert.equal(p.ev(`get('${id}').tm`),p.ev(`nxT.hm(${h0*60+15})`),'22 minutes past the hour snaps to the quarter hour');assert.equal(d.querySelector('.nxgh'),null);
  /* resize: pull the bottom edge to 10:00 (or 1 hour after a 09:00 start) */
  p.ev(`nxPlace('${id}',dk(),540,30)`);p.ev('A.planview()');const g=d.querySelector('#nxg'),H=+g.dataset.h0;
  const y=(600-H*60)*56/60;fire(d.querySelector('.nxr'),'pointerdown',0,5);fire(d,'pointermove',0,y);fire(d,'pointerup',0,y);
  assert.equal(p.ev(`get('${id}').dur`),60);assert.equal(p.ev(`get('${id}').tm`),'09:00');
  /* drag the block onto the tray to take it off the plan: jsdom has no layout, so the tray sits at y=0 */
  fire(d.querySelector('.nxb'),'pointerdown',0,300);fire(d,'pointermove',0,-5);fire(d,'pointermove',0,-5);
  p.ev(`document.querySelector('#nxg').getBoundingClientRect=()=>({top:500,bottom:900,left:0,right:0,width:0,height:400})`);
  fire(d,'pointerup',0,-5);assert.equal(p.ev(`nxT.slot(get('${id}'))`),null);p.close()});
await t('a touch drag needs a press and hold, and a swipe just scrolls',async()=>{
  const br=newBrowser(),p=await boot(br),d=p.w.document;add(p,{title:'Scroll me'});p.ev('A.planview()');
  const fire=(el,type,x,y)=>{const e=new p.w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperty(e,'pointerType',{value:'touch'});el.dispatchEvent(e)};
  fire(d.querySelector('.nxc'),'pointerdown',0,300);fire(d,'pointermove',0,240);await p.sleep(420);assert.equal(d.querySelector('.nxgh'),null,'a swipe must not start a drag');fire(d,'pointerup',0,240);
  fire(d.querySelector('.nxc'),'pointerdown',0,300);await p.sleep(420);assert.ok(d.querySelector('.nxgh'),'holding starts the drag');fire(d,'pointercancel',0,300);assert.equal(d.querySelector('.nxgh'),null);p.close()});
await t('the block sheet changes time and length and takes a task off the plan',async()=>{
  const br=newBrowser(),p=await boot(br),d=p.w.document,id=add(p,{title:'Review PR'});
  p.ev(`nxPlace('${id}',dk(),600,30)`);p.ev('A.planview()');d.querySelector('[data-nb]').click();assert.ok(d.querySelector('#nxs'));
  const s=d.querySelector('#nxs');s.value='11:15';s.dispatchEvent(new p.w.Event('change'));assert.equal(p.ev(`get('${id}').tm`),'11:15');
  const l=d.querySelector('#nxl');l.value='90';l.dispatchEvent(new p.w.Event('change'));assert.equal(p.ev(`get('${id}').dur`),90);
  d.querySelector('#nxu').click();assert.equal(p.ev(`nxT.slot(get('${id}'))`),null);p.close()});
await t('Plan day opens from the ?a=plan shortcut and from the command palette',async()=>{
  const br=newBrowser(),p=await boot(br,{query:'?a=plan'});await p.sleep(700);assert.equal(p.ev('S.tab'),'plan');p.close();
  const q=await boot(newBrowser());q.w.document.dispatchEvent(new q.w.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));await q.sleep(50);
  const inp=q.w.document.querySelector('#nxp');inp.value='plan';inp.dispatchEvent(new q.w.Event('input'));inp.dispatchEvent(new q.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await q.sleep(300);assert.equal(q.ev('S.tab'),'plan');q.close()});
await t('Focus shows a disc that shrinks with the time left',async()=>{
  const br=newBrowser(),p=await boot(br),id=add(p,{title:'Deep work'}),d=p.w.document;
  p.ev(`focus('${id}',10)`);let i=d.querySelector('#fx .nxd i');assert.ok(i);assert.match(i.getAttribute('style'),/scale\(1\.000\)/);
  p.ev('F.end=Date.now()+150000;tick()');i=d.querySelector('#fx .nxd i');assert.match(i.getAttribute('style'),/scale\(0\.5\d\d\)/);
  p.ev('F.end=Date.now()+1000;tick()');assert.match(d.querySelector('#fx .nxd i').getAttribute('style'),/scale\(0\.0\d\d\)/);p.ev('stopF()');p.close()});

console.log('Phone bridge (Android app and browser)');
const stub=(over={})=>w=>{w.__inbox=[];w.__calls=[];w.NexusNative={
  inboxPeek:()=>JSON.stringify(w.__inbox),inboxAck:n=>{w.__inbox.splice(0,n)},inboxMedia:()=>'',
  setSnapshot:j=>w.__calls.push(['snap',j]),setReminders:j=>w.__calls.push(['rem',j]),
  listen:l=>{w.__lang=l},calendarState:()=>'on',calendarAllow:()=>{},calendarEvents:()=>'[]',bubbleState:()=>'off',...over}};
await t('a tick from the widget or a reminder completes the task, and widget quick-add understands times',async()=>{
  const br=newBrowser(),p=await boot(br,{pre:stub()}),id=add(p,{title:'Water plants',due:p.ev('dk()')});
  p.w.__inbox=[{k:'done',id,t:'',ts:1},{k:'done',id:'does-not-exist',t:'',ts:2},{k:'task',t:'call Sam tomorrow at 5pm',ts:3}];
  await p.w.nxInbox();assert.equal(p.ev(`get('${id}').done`),true);
  const n=JSON.parse(p.ev(`JSON.stringify(D.items.filter(i=>i.title.startsWith('call Sam')))`));assert.equal(n.length,1);assert.equal(n[0].tm,'17:00');assert.equal(p.w.__inbox.length,0,'the inbox is acknowledged');p.close()});
await t('the widget list and the reminders are sent to Android and kept current',async()=>{
  const br=newBrowser(),p=await boot(br,{pre:stub()}),td=p.ev('dk()'),tmr=p.ev('addD(1)');
  add(p,{title:'Overdue thing',due:p.ev('addD(-3)')});const a=add(p,{title:'Tomorrow 9',due:tmr}),b=add(p,{title:'Tomorrow 8',due:tmr}),done=add(p,{title:'Done one',due:tmr});
  p.ev(`nxPlace('${a}','${tmr}',540,30);nxPlace('${b}','${tmr}',480,30);nxPlace('${done}','${tmr}',420,30);upd('${done}',{done:true})`);
  p.w.nxSync();const calls=p.w.__calls,snap=JSON.parse(calls.find(c=>c[0]==='snap')[1]),rem=JSON.parse(calls.find(c=>c[0]==='rem')[1]);
  assert.equal(snap[0].t,'Overdue thing');assert.equal(snap[0].d,'','overdue items carry no warning label');
  assert.deepEqual(rem.map(r=>r.title),['Tomorrow 8','Tomorrow 9']);assert.equal(rem[0].at,stamp(tmr,'08:00'));assert.match(rem[0].body,/8:00/);
  const n0=calls.length;p.w.nxSync();assert.equal(calls.length,n0,'nothing is re-sent when nothing changed');
  p.ev(`upd('${a}',{done:true})`);p.w.nxSync();assert.deepEqual(JSON.parse(calls.filter(c=>c[0]==='rem').pop()[1]).map(r=>r.title),['Tomorrow 8']);p.close()});
await t('dictation: the Dictate button asks Android to listen and puts the words in the capture box',async()=>{
  const br=newBrowser(),p=await boot(br,{pre:stub()}),d=p.w.document;
  p.ev('capture()');assert.ok(d.querySelector('#nxm'));d.querySelector('#nxlg').value='te-IN';d.querySelector('#nxlg').dispatchEvent(new p.w.Event('change'));
  d.querySelector('#nxm').click();assert.equal(p.w.__lang,'te-IN');
  p.w.nxSpeech('buy milk',0);assert.equal(d.querySelector('#ct').value,'buy milk');
  d.querySelector('#nxm').click();p.w.nxSpeech('and eggs tomorrow',0);assert.equal(d.querySelector('#ct').value,'buy milk and eggs tomorrow');
  d.querySelector('#nxm').click();p.w.nxSpeech('',1);assert.match(d.querySelector('#ch').textContent,/not available/);p.close()});
await t('no Dictate button in a browser that cannot do speech',async()=>{
  const p=await boot(newBrowser());p.ev('capture()');assert.equal(p.w.document.querySelector('#nxm'),null);p.close()});
await t('the plan shows phone calendar events beside tasks, and asks first when it has no permission',async()=>{
  const td=new Date(),day=td.getFullYear()+'-'+String(td.getMonth()+1).padStart(2,'0')+'-'+String(td.getDate()).padStart(2,'0'),nx=new Date(td.getTime()+864e5),nd=nx.getFullYear()+'-'+String(nx.getMonth()+1).padStart(2,'0')+'-'+String(nx.getDate()).padStart(2,'0');
  const ev=JSON.stringify([{t:'Team sync',b:stamp(day,'10:00'),e:stamp(day,'11:00')},{t:'Holiday',ad:1,d:day,e:nd},{t:'Other day',ad:1,d:nd,e:nd}]);
  const p=await boot(newBrowser(),{pre:stub({calendarEvents:()=>ev})}),d=p.w.document;p.ev('A.planview()');
  assert.equal(d.querySelectorAll('.nxe').length,1);assert.match(d.querySelector('#m').textContent,/All day: Holiday/);assert.doesNotMatch(d.querySelector('#m').textContent,/Other day/);
  d.querySelector('[data-a=nxcalhide]').click();assert.equal(d.querySelectorAll('.nxe').length,0);p.close();
  const q=await boot(newBrowser(),{pre:stub({calendarState:()=>'off'})});q.ev('A.planview()');assert.ok(q.w.document.querySelector('[data-a=nxcal]'));assert.equal(q.w.document.querySelectorAll('.nxe').length,0);q.close()});
await t('in a browser, a timed task shows a notification when its time arrives',async()=>{
  const p=await boot(newBrowser(),{pre:w=>{w.__n=[];w.Notification=function(t,o){w.__n.push([t,o])};w.Notification.permission='granted'}});
  const id=add(p,{title:'Stand up',due:p.ev('dk()')});const m=new Date(Date.now()-60e3);
  if(m.getDate()!==new Date().getDate()){p.close();return}
  p.ev(`nxPlace('${id}',dk(),${m.getHours()*60+m.getMinutes()},15)`);p.ev('window.__nn=[];notify=(t,b)=>window.__nn.push([t,b])');
  p.w.nxRemCheck();assert.equal(p.w.__nn.length,1);assert.equal(p.w.__nn[0][0],'Stand up');p.w.nxRemCheck();assert.equal(p.w.__nn.length,1,'only once');p.close()});

console.log('Study (FSRS)');
const card=(o={})=>({id:'c'+Math.random().toString(36).slice(2,6),q:'Q',a:'A',box:0,due:'2026-01-01',...o});
await t('first answer sets stability from the FSRS defaults and a sensible first gap',async()=>{
  const br=newBrowser(),p=await boot(br),F=p.w.NXFSRS;
  const a=g=>F.answer(card(),g,'2026-10-21');
  const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-3,x+' vs '+y);near(a(3).fs.s,3.173);near(a(4).fs.s,15.69105);near(a(1).fs.s,0.40255);
  assert.equal(a(3).days,3);assert.equal(a(4).days,16);assert.equal(a(1).days,0);assert.equal(a(2).days,1);
  assert.equal(a(3).due,'2026-10-24');assert.ok(a(1).fs.d>a(4).fs.d,'Again is harder than Easy');p.close()});
await t('retention at one stability of elapsed time is 90 percent, and the interval inverts it',async()=>{
  const br=newBrowser(),p=await boot(br),F=p.w.NXFSRS;
  assert.ok(Math.abs(F.R(10,10)-0.9)<1e-9);assert.equal(F.ivl(10,0.9),10);assert.ok(F.ivl(10,0.8)>10);p.close()});
await t('success grows stability, Again shrinks it, and harder answers give shorter gaps',async()=>{
  const br=newBrowser(),p=await boot(br),F=p.w.NXFSRS,c=card();
  F.apply(c,3);const s0=c.fs.s;c.due='2026-10-24';
  const at='2026-10-24',g=x=>{const k={...c,fs:{...c.fs}};return F.answer(k,x,at)};
  assert.ok(g(3).fs.s>s0,'Good grows');assert.ok(g(1).fs.s<s0,'Again shrinks');
  assert.ok(g(2).days<=g(3).days&&g(3).days<=g(4).days&&g(2).days<g(4).days);assert.ok(g(4).fs.d<g(1).fs.d);
  for(const x of[1,2,3,4]){const d=g(x).fs.d;assert.ok(d>=1&&d<=10)}p.close()});
await t('answering many times keeps numbers sane and the gap grows with steady Good answers',async()=>{
  const br=newBrowser(),p=await boot(br),F=p.w.NXFSRS,c=card();let day='2026-10-21',prev=0;
  for(let i=0;i<12;i++){const a=F.answer(c,3,day);c.fs=a.fs;assert.ok(Number.isFinite(a.fs.s)&&Number.isFinite(a.fs.d));assert.ok(a.days>=prev,'gap never shrinks on Good');prev=a.days;day=a.due}
  assert.ok(prev>60&&prev<=3650,'after 12 good reviews the gap is long: '+prev);p.close()});
await t('old box cards are converted, not reset',async()=>{
  const br=newBrowser(),p=await boot(br),F=p.w.NXFSRS;
  const old=card({box:3,due:'2026-10-21'}),s=F.state(old);assert.equal(s.s,7);assert.equal(s.l,'2026-10-14');assert.equal(F.state(card({box:0})),null);
  const a=F.answer(old,3,'2026-10-21');assert.ok(a.fs.s>7);p.close()});
await t('reviewing: four buttons with next gaps, answers are saved, Again comes back this session',async()=>{
  const br=newBrowser(),p=await boot(br);
  p.ev(`D.study.push({id:'s1',name:'Bio',cards:[{id:'c1',q:'Cell?',a:'Unit',box:0,due:'2020-01-01'}]});save();review('s1')`);
  p.w.document.querySelector('#sa').click();
  const btns=[...p.w.document.querySelectorAll('[data-g]')];assert.deepEqual(btns.map(b=>b.firstChild.textContent),['Again','Hard','Good','Easy']);
  assert.match(btns[2].textContent,/3d/);btns[0].click();
  assert.ok(p.w.document.querySelector('#sa'),'the card is shown again');assert.equal(p.ev('D.study[0].cards[0].fs.x'),1);
  p.w.document.querySelector('#sa').click();p.w.document.querySelectorAll('[data-g]')[2].click();
  assert.match(p.w.document.body.textContent,/You reviewed 1 card/);
  const c=p.ev('JSON.parse(JSON.stringify(D.study[0].cards[0]))');assert.ok(c.fs.s>0);assert.ok(c.due>p.ev('dk()')||c.due===p.ev('dk()'));assert.ok(c.fs.n>=2);p.close()});
await t('FSRS memory survives Export backup and Restore, and reloading',async()=>{
  const br=newBrowser(),p=await boot(br);
  p.ev(`D.study.push({id:'s1',name:'Bio',cards:[{id:'c1',q:'Q',a:'A',box:0,due:'2020-01-01'}]});NXFSRS.apply(D.study[0].cards[0],4);save()`);await p.flush();
  const fs0=JSON.stringify(p.ev('D.study[0].cards[0].fs')),raw=JSON.stringify({app:'nexus',v:2,...JSON.parse(p.ev('JSON.stringify(D)'))});
  p.w.confirm=()=>true;p.ev('A.settings()');await p.w.document.querySelector('#fi').onchange({target:{files:[{name:'b.json',size:raw.length,type:'application/json',text:async()=>raw}]}});await p.sleep(100);await p.flush();
  assert.equal(JSON.stringify(p.ev('D.study[0].cards[0].fs')),fs0);p.close();
  const q=await boot(br);assert.equal(JSON.stringify(q.ev('D.study[0].cards[0].fs')),fs0);q.close()});
await t('mastered means remembered for a week or more',async()=>{
  const br=newBrowser(),p=await boot(br);
  p.ev(`D.study.push({id:'s1',name:'X',cards:[{id:'a',q:'1',a:'1',box:0,due:'2020-01-01',fs:{s:20,d:5,l:'2026-10-01',n:3,x:0}},{id:'b',q:'2',a:'2',box:0,due:'2020-01-01'}]})`);
  assert.equal(p.ev('mast(D.study[0])'),50);p.close()});

console.log('Smart helpers (search, cards from notes, auto-tags, plan)');
const note=(p,o)=>p.ev(`(()=>{const it=addItem(${JSON.stringify({type:'note',title:'x',body:'',url:'',tags:[],project:null,due:null,promise:false,...o})});return it&&it.id})()`);
await t('search understands word forms, synonyms and typos, and still finds exact text',async()=>{
  const br=newBrowser(),p=await boot(br);p.ev("localStorage.setItem('nexus.auto','0')");
  const a=note(p,{title:'Buy groceries for dinner',body:'milk and eggs'}),b=note(p,{title:'Physics meeting notes',body:'discuss the syllabus'}),c=note(p,{title:'Exam timetable',body:'dates for finals'});
  const f=q=>p.ev(`search(${JSON.stringify(q)}).it.map(i=>i.id)`);
  assert.ok(f('purchase').includes(a),'synonym: purchase finds buy');
  assert.ok(f('meetings').includes(b),'word form: meetings finds meeting');
  assert.ok(f('phyics').includes(b),'typo: phyics finds physics');
  assert.ok(f('physcis').includes(b),'swapped letters');
  assert.ok(f('quiz').includes(c),'synonym: quiz finds exam');
  assert.ok(f('groc').includes(a),'plain substring still works');
  assert.deepEqual([...f('zzzzqqq')],[]);
  const both=f('physics exam');assert.ok(both.includes(b)&&both.includes(c),'partial matches appear when no note has every word');p.close()});
await t('search stays fast with 5,000 notes',async()=>{
  const br=newBrowser(),p=await boot(br);
  p.ev(`for(let i=0;i<5000;i++)D.items.push({id:'n'+i,type:'note',title:'Item '+i+' about topic'+(i%50),body:'lorem ipsum dolor sit amet '.repeat(8)+' word'+(i%300),url:'',project:null,tags:['t'+(i%7)],done:false,doneAt:null,due:null,promise:false,created:now(),updated:now()})`);
  p.ev("search('topic7')");const t0=Date.now();p.ev("search('toipc12 dolr')");p.ev("search('topic3 word5')");const ms=(Date.now()-t0)/2;
  console.log('       search '+Math.round(ms)+' ms each');assert.ok(ms<800,'search took '+ms);p.close()});
await t('cards from notes: definitions, Q/A, bold and year blanks; skips vague lines',async()=>{
  const br=newBrowser(),p=await boot(br);
  const txt='Mitochondria: the organelle that makes most of the cell\'s energy\nQ: What is osmosis? A: Movement of water across a membrane\nPhotosynthesis is the process plants use to turn light into chemical energy.\nThe **ribosome** builds proteins inside every living cell.\nThe printing press was invented around 1440 by Gutenberg.\nIt is a very important topic for the exam.\nTime: 10:30 meeting with the team\nnote: remember to bring the book tomorrow\nCapital of France - Paris is the capital city';
  const c=JSON.parse(p.ev(`JSON.stringify(NXSmart.cardsFrom(${JSON.stringify(txt)}))`)),qs=c.map(x=>x.q);
  assert.ok(qs.includes('What is Mitochondria?'));assert.equal(c.find(x=>x.q==='What is Mitochondria?').a.startsWith('The organelle'),true);
  assert.ok(qs.includes('What is osmosis?'));assert.ok(qs.includes('What is Photosynthesis?'));
  assert.ok(c.some(x=>/^Fill in the blank: The _____ builds proteins/.test(x.q)&&x.a==='ribosome'));
  assert.ok(c.some(x=>/invented around _____ by Gutenberg/.test(x.q)&&x.a==='1440'));
  assert.ok(qs.includes('Capital of France?'));
  assert.ok(!qs.some(q=>/important topic|10:30|bring the book/i.test(q)),'vague lines make no cards: '+qs.join(' | '));
  assert.equal(new Set(qs.map(q=>q.toLowerCase())).size,qs.length);p.close()});
await t('Cards from notes button: shows a review list, adds only what is ticked, skips cards you already have',async()=>{
  const br=newBrowser(),p=await boot(br);
  p.ev(`D.study.push({id:'s1',name:'Biology',cards:[{id:'c0',q:'What is osmosis?',a:'x',box:0,due:'2099-01-01'}]});save()`);
  note(p,{title:'Cell notes',body:'Mitochondria: the organelle that makes energy for the cell\nQ: What is osmosis? A: Water moving across a membrane\nDNA: the molecule that stores genetic information in cells',tags:['biology']});
  p.ev("S.tab='study';S.sj='s1';render()");
  const btn=p.w.document.querySelector('[data-a="mkcards"]');assert.ok(btn,'button is on the subject screen');btn.click();
  const boxes=[...p.w.document.querySelectorAll('input[data-k]')];assert.equal(boxes.length,2,'osmosis already exists, so 2 new');
  boxes[1].click();boxes[1].dispatchEvent(new p.w.Event('change'));assert.match(p.w.document.querySelector('#mcn').textContent,/1 of 2/);
  p.w.document.querySelector('#mcg').click();assert.equal(p.ev('D.study[0].cards.length'),2);assert.ok(p.ev("D.study[0].cards.some(c=>c.q==='What is Mitochondria?')"));
  p.ev("S.tab='study';S.sj=null;render()");p.close()});
await t('cards from notes explains itself when no notes are tagged',async()=>{
  const br=newBrowser(),p=await boot(br);
  p.ev(`D.study.push({id:'s1',name:'Chemistry',cards:[]});save();NXSmart.cardsSheet('s1')`);
  assert.match(p.w.document.querySelector('#dlg').textContent,/Tag notes with #chemistry/);p.close()});
await t('auto-tags use tags you already have and subject names; long titles are shortened without losing text',async()=>{
  const br=newBrowser(),p=await boot(br);
  p.ev(`D.study.push({id:'s1',name:'Physics',cards:[]});save()`);
  note(p,{title:'old',tags:['recipes']});
  const id=note(p,{title:'Test pasta recipes for the weekend',body:'try three recipes'});
  assert.ok(p.ev(`get('${id}').tags.includes('recipes')`),'existing tag reused');
  const id2=note(p,{title:'Revise the physics chapter on motion before Friday'});
  assert.ok(p.ev(`get('${id2}').tags.includes('physics')`),'subject name tag added so it counts as study material');
  const long='Remember that the electricity bill needs to be paid before the end of the month because of the late fee that they charge';
  const id3=note(p,{title:long});
  const n=JSON.parse(p.ev(`JSON.stringify(get('${id3}'))`));assert.ok(n.title.length<=62&&n.title.endsWith('…'));assert.equal(n.body,long);
  const tk=p.ev(`addItem({type:'task',title:'Pay recipes bill and more things for physics today',body:'',url:'',tags:[],project:null,due:null,promise:false}).tags.length`);assert.equal(tk,0,'tasks are left alone');
  p.ev("localStorage.setItem('nexus.auto','0')");const id4=note(p,{title:'Another recipes idea for later'});assert.equal(p.ev(`get('${id4}').tags.length`),0,'off switch works');p.close()});
await t('similar notes and repeated links show a gentle warning but are still saved; repeated tasks do not',async()=>{
  const br=newBrowser(),p=await boot(br);p.ev("localStorage.setItem('nexus.auto','0')");
  p.ev(`addItem({type:'link',title:'Great article',body:'',url:'https://example.com/post/',tags:[],project:null,due:null,promise:false})`);
  p.ev(`addItem({type:'link',title:'Same again',body:'',url:'https://www.example.com/post#top',tags:[],project:null,due:null,promise:false})`);
  await p.sleep(700);assert.match(p.w.document.querySelector('#toast').textContent,/Looks similar to/);assert.equal(p.ev('D.items.length'),2);
  p.w.document.querySelector('#toast').style.display='none';
  p.ev(`addItem({type:'task',title:'Buy milk',body:'',url:'',tags:[],project:null,due:null,promise:false});addItem({type:'task',title:'Buy milk',body:'',url:'',tags:[],project:null,due:null,promise:false})`);
  await p.sleep(700);assert.notEqual(p.w.document.querySelector('#toast').style.display,'flex');p.close()});
await t('daily plan: new cards are spread over the days before the exam, with a default of 20 a day',async()=>{
  const br=newBrowser(),p=await boot(br);
  const cards=n=>Array.from({length:n},(_,i)=>({id:'c'+i,q:'q'+i,a:'a'+i,box:0,due:'2020-01-01'}));
  p.ev(`D.study.push({id:'s1',name:'Maths',exam:addD(10),cards:${JSON.stringify(cards(32))}});D.study.push({id:'s2',name:'History',cards:${JSON.stringify(cards(50))}});save()`);
  assert.equal(p.ev('dueC(D.study[0]).length'),4,'32 cards over 10-2 days');assert.equal(p.ev('dueC(D.study[1]).length'),20);
  p.ev("review('s1')");p.w.document.querySelector('#sa').click();p.w.document.querySelectorAll('[data-g]')[2].click();
  assert.equal(p.ev('dueC(D.study[0]).length'),3,'one learned today, so one fewer left in today\'s share');
  p.ev("D.study[0].ch=[{id:'a',n:'One',d:false},{id:'b',n:'Two',d:true}];S.tab='study';S.sj=null;render()");
  const txt=p.w.document.querySelector('#m').textContent;assert.match(txt,/Today's plan/);assert.match(txt,/Exam in 10 days/);assert.match(txt,/learn 3 new cards/);assert.match(txt,/1 chapter left/);
  p.ev(`D.study[0].cards.forEach(c=>c.due='2999-01-01')`);assert.equal(p.ev('dueC(D.study[0]).length'),0);p.close()});
await t('already-learned cards always come before new ones and are never capped',async()=>{
  const br=newBrowser(),p=await boot(br);
  const learned=Array.from({length:30},(_,i)=>({id:'l'+i,q:'l'+i,a:'a',box:2,due:'2020-01-01'})),fresh=Array.from({length:30},(_,i)=>({id:'n'+i,q:'n'+i,a:'a',box:0,due:'2020-01-01'}));
  p.ev(`D.study.push({id:'s1',name:'Mix',cards:${JSON.stringify([...fresh,...learned])}});save()`);
  const d=JSON.parse(p.ev('JSON.stringify(dueC(D.study[0]).map(c=>c.id))'));assert.equal(d.length,50);assert.ok(d.slice(0,30).every(x=>x[0]==='l'));p.close()});
await t('the first-seen date survives backup and restore, so the daily share stays right',async()=>{
  const br=newBrowser(),p=await boot(br);
  p.ev(`D.study.push({id:'s1',name:'Bio',cards:[{id:'c1',q:'Q',a:'A',box:0,due:'2020-01-01'}]});NXFSRS.apply(D.study[0].cards[0],3);save()`);await p.flush();
  const f0=p.ev('D.study[0].cards[0].fs.f'),raw=JSON.stringify({app:'nexus',v:2,...JSON.parse(p.ev('JSON.stringify(D)'))});
  p.w.confirm=()=>true;p.ev('A.settings()');await p.w.document.querySelector('#fi').onchange({target:{files:[{name:'b.json',size:raw.length,type:'application/json',text:async()=>raw}]}});await p.sleep(100);
  assert.equal(p.ev('D.study[0].cards[0].fs.f'),f0);assert.ok(/^\d{4}-/.test(f0));p.close()});
await t('Settings shows the smart tags switch once and it toggles',async()=>{
  const br=newBrowser(),errors=[],p=await boot(br,{errors});
  p.ev('A.settings()');p.ev('A.settings()');const b=p.w.document.querySelectorAll('#auto');assert.equal(b.length,1);assert.match(b[0].textContent,/on/);b[0].click();assert.match(b[0].textContent,/off/);assert.deepEqual(errors,[]);p.close()});

console.log('Scale');
await t('5,000 items: loads, deletes one, and restores it quickly',async()=>{
  const br=newBrowser(),items=Array.from({length:5000},(_,i)=>({id:'i'+i,type:i%3?'note':'task',title:'Item '+i,body:'lorem ipsum '.repeat(10),url:'',project:null,tags:['t'+(i%7)],done:false,doneAt:null,due:null,promise:false,created:new Date().toISOString(),updated:new Date().toISOString()}));
  br.ls[K]=JSON.stringify({items,projects:[],log:[],study:[]});
  const t0=Date.now(),p=await boot(br);const boottime=Date.now()-t0;
  p.ev(`D.items=D.items.filter(x=>x.id!=='i42');save()`);const t1=Date.now();await p.flush();const ft=Date.now()-t1;
  const tr=await p.w.NXSafe.trash();assert.equal(tr.length,1);
  console.log(`       boot ${boottime} ms, diff+mirror ${ft} ms`);assert.ok(ft<3000,'flush took '+ft);p.close()});

console.log('Portability (Markdown export and importers)');
const F=(name,text)=>({name,size:text.length,text:async()=>text});
async function unzipNames(p,blob){
  const buf=blob.arrayBuffer?new Uint8Array(await blob.arrayBuffer()):await new Promise(r=>{const fr=new p.w.FileReader();fr.onload=()=>r(new Uint8Array(fr.result));fr.readAsArrayBuffer(blob)});
  const dv=new DataView(buf.buffer),dec=new TextDecoder(),out={};
  let e=buf.length-22;assert.equal(dv.getUint32(e,true),0x06054b50,'end of zip record');
  const n=dv.getUint16(e+10,true);let o=dv.getUint32(e+16,true);
  for(let i=0;i<n;i++){assert.equal(dv.getUint32(o,true),0x02014b50);
    const sz=dv.getUint32(o+24,true),nl=dv.getUint16(o+28,true),lo=dv.getUint32(o+42,true),name=dec.decode(buf.slice(o+46,o+46+nl));
    const ln=dv.getUint16(lo+26,true),le=dv.getUint16(lo+28,true),ds=lo+30+ln+le;
    out[name]=dec.decode(buf.slice(ds,ds+sz));o+=46+nl+dv.getUint16(o+30,true)+dv.getUint16(o+32,true)}
  return out}
await t('Markdown export is a real zip with Tasks, Notes and Study files',async()=>{
  const br=newBrowser(),p=await boot(br);
  p.ev(`D.projects.push({id:'p1',name:'Thesis'});
    addItem({type:'task',title:'Email supervisor',body:'about chapter 2',url:'',tags:['work'],project:'p1',due:'2026-11-02',promise:false});
    addItem({type:'task',title:'Buy milk',body:'',url:'',tags:[],project:null,due:null,promise:false});D.items[1].done=true;D.items[1].doneAt='2026-10-20T10:00:00Z';
    addItem({type:'note',title:'Ideas: a/b?',body:'Line one\\n\\nLine two',url:'',tags:['x'],project:'p1',due:null,promise:false});
    addItem({type:'note',title:'Ideas: a/b?',body:'second with same title',url:'',tags:[],project:null,due:null,promise:false});
    addItem({type:'link',title:'Site',body:'',url:'https://example.com/a',tags:[],project:null,due:null,promise:false});
    D.study.push({id:'s1',name:'Physics',cards:[{id:'c1',q:'F?',a:'ma',box:0,due:'2026-01-01'}]})`);
  const z=await unzipNames(p,p.w.NXIO.zip(p.w.NXIO.toFiles(p.ev('D'))));
  assert.deepEqual(Object.keys(z).sort(),['Notes/Ideas a b.md','Notes/Ideas a b 2.md','Notes/Site.md','README.md','Study/Physics.md','Tasks.md'].sort());
  assert.match(z['Tasks.md'],/- \[ \] Email supervisor.*📅 2026-11-02 #work/);assert.match(z['Tasks.md'],/- \[x\] Buy milk ✅ 2026-10-20/);assert.match(z['Tasks.md'],/## Thesis/);
  assert.match(z['Notes/Ideas a b.md'],/^---\ntype: note/);assert.match(z['Notes/Ideas a b.md'],/project: "Thesis"/);assert.match(z['Notes/Ideas a b.md'],/Line two/);
  assert.match(z['Notes/Site.md'],/url: "https:\/\/example.com\/a"/);assert.match(z['Study/Physics.md'],/F\?::ma/);p.close()});
await t('Todoist CSV: quoted commas and newlines, sections skipped, notes attach, dates read',async()=>{
  const br=newBrowser(),p=await boot(br);
  const csv='TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE\nsection,Errands,,,,,,,,\ntask,"Buy eggs, bread",,4,1,Me,,2026-11-05,en,\ntask,[Read this](https://example.com/x),"Line 1\nLine 2",1,1,Me,,every monday,en,\nnote,A comment,,,,,,,,\n';
  const r=p.w.NXIO.todoist(csv,'Home (3).csv');
  assert.equal(r.length,2);assert.equal(r[0].title,'Buy eggs, bread');assert.equal(r[0].due,'2026-11-05');assert.equal(r[0].project,'Home');
  assert.equal(r[1].title,'Read this');assert.equal(r[1].url,'https://example.com/x');assert.match(r[1].body,/Line 1\nLine 2/);assert.match(r[1].body,/Due: every monday/);assert.match(r[1].body,/P1/);assert.match(r[1].body,/A comment/);p.close()});
await t('Google Keep: text note, checklist becomes tasks, trashed notes are skipped',async()=>{
  const br=newBrowser(),p=await boot(br),K_=p.w.NXIO.keep;
  const n=K_(JSON.stringify({title:'Wifi',textContent:'pass 1234',labels:[{name:'Home Stuff'}],createdTimestampUsec:1760000000000000}));
  assert.equal(n.length,1);assert.equal(n[0].type,'note');assert.equal(n[0].title,'Wifi');assert.deepEqual([...n[0].tags],['home-stuff']);assert.ok(n[0].created.startsWith('2025-10'));
  const l=K_(JSON.stringify({title:'Groceries',listContent:[{text:'milk',isChecked:true},{text:'eggs',isChecked:false},{text:'',isChecked:false}]}));
  assert.equal(l.length,2);assert.equal(l[0].type,'task');assert.equal(l[0].done,true);assert.deepEqual([...l[1].tags],['groceries']);
  assert.equal(K_(JSON.stringify({title:'x',textContent:'y',isTrashed:true})).length,0);assert.equal(K_('not json').length,0);p.close()});
await t('Evernote ENEX: title, text, checkboxes, tags and created date',async()=>{
  const br=newBrowser(),p=await boot(br);
  const x='<?xml version="1.0" encoding="UTF-8"?><en-export><note><title>Trip plan</title><content><![CDATA[<?xml version="1.0"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note><div>Book hotel</div><div><en-todo checked="true"/>Passport</div><div><en-todo/>Visa</div><en-media hash="abc" type="image/png"/></en-note>]]></content><created>20240305T101500Z</created><tag>travel</tag><tag>Big Plans</tag></note><note><title></title><content><![CDATA[<en-note></en-note>]]></content></note></en-export>';
  const r=p.w.NXIO.enex(x);assert.equal(r.length,1);assert.equal(r[0].title,'Trip plan');
  assert.match(r[0].body,/Book hotel/);assert.match(r[0].body,/\[x\] Passport/);assert.match(r[0].body,/\[ \] Visa/);assert.deepEqual([...r[0].tags],['travel','big-plans']);assert.equal(r[0].created,'2024-03-05T10:15:00.000Z');
  assert.equal(p.w.NXIO.enex('<broken').length,0);p.close()});
await t('Obsidian and Notion markdown: front matter, hex id suffix, inline tags',async()=>{
  const br=newBrowser(),p=await boot(br),M=p.w.NXIO.markdown;
  const a=M('---\ntags: [project, "ideas"]\ncreated: 2025-01-02\n---\n# Heading\nBody with #inline tag and [[Link]]','Plan 0123456789abcdef0123456789abcdef.md');
  assert.equal(a[0].title,'Plan');assert.deepEqual([...a[0].tags],['project','ideas','inline']);assert.ok(a[0].created.startsWith('2025-01-02'));assert.match(a[0].body,/\[\[Link\]\]/);assert.ok(!/^---/.test(a[0].body));
  assert.equal(M('','empty.md').length,1);assert.equal(M('   ','').length,0);p.close()});
await t('importing adds items and projects, saves a restore point, and skips repeats',async()=>{
  const br=newBrowser(),p=await boot(br);
  const files=[F('Home.csv','TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE\ntask,Fix tap,,4,1,,,2026-11-01,en,\n'),F('n.md','# Hello\nworld'),F('k.json',JSON.stringify({title:'K',textContent:'kk'})),F('ignore.pdf','x')];
  const r=await p.w.NXIO.importFiles(files);await p.flush();
  assert.equal(r.added,3);assert.equal(p.ev('D.items.length'),3);assert.equal(p.ev('D.projects.map(x=>x.name).join()'),'Home');
  assert.equal(p.ev(`D.items.find(i=>i.title==='Fix tap').project===D.projects[0].id`),true);assert.equal(p.ev(`D.items.find(i=>i.title==='Fix tap').due`),'2026-11-01');
  assert.ok((await p.w.NXSafe.snaps()).some(s=>/before import/.test(s.reason)));
  const r2=await p.w.NXIO.importFiles(files);assert.equal(r2.added,0);assert.equal(r2.skipped,3);assert.equal(p.ev('D.items.length'),3);
  const r3=await p.w.NXIO.importFiles([F('x.pdf','x')]);assert.equal(r3.none,true);p.close()});
await t('import respects the 5,000 item limit and survives a reload',async()=>{
  const br=newBrowser(),p=await boot(br);
  p.ev(`for(let i=0;i<4999;i++)D.items.push({id:'a'+i,type:'note',title:'n'+i,body:'',url:'',project:null,tags:[],done:false,doneAt:null,due:null,promise:false,created:now(),updated:now()});save()`);
  const r=await p.w.NXIO.importFiles([F('a.md','# One\nx'),F('b.md','# Two\ny')]);await p.flush();
  assert.equal(r.added,1);assert.equal(r.over,1);assert.equal(p.ev('D.items.length'),5000);p.close();
  const q=await boot(br);assert.equal(q.ev('D.items.length'),5000);q.close()});
await t('Settings shows the Markdown export and import buttons once',async()=>{
  const br=newBrowser(),errors=[],p=await boot(br,{errors});
  p.ev('A.settings()');assert.ok(p.w.document.querySelector('#xmd'));assert.ok(p.w.document.querySelector('#imp'));
  p.ev('A.settings()');assert.equal(p.w.document.querySelectorAll('#xmd').length,1);assert.deepEqual(errors,[]);p.close()});

await import('./vault.mjs');
await import('./sync.mjs');
await import('./phase5.mjs');
await import('./tasks2.mjs');
await import('./boards.mjs');
await import('./projectchat.mjs');
await import('./sound.mjs');

console.log(`\n${state.pass} passed, ${state.fail} failed`);
if(state.fail){console.log('Failed: '+state.failed.join('; '));process.exit(1)}
