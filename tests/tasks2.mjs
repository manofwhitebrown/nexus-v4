/* Task layer tests: priorities, steps, filter and sort, week view, streak, break, reminder time, PDF viewer. */
import {boot,newBrowser} from './harness.mjs';
import assert from 'node:assert/strict';
import {t} from './lib.mjs';
const add=(p,o={})=>p.ev(`addItem(${JSON.stringify({type:'task',title:'x',body:'',url:'',tags:[],project:null,due:null,promise:false,...o})}).id`);

console.log('Task layer');
await t('the task layer loads with no errors',async()=>{
  const errors=[],p=await boot(newBrowser(),{errors});assert.equal(p.ev('typeof nxStreak'),'function');assert.deepEqual(errors,[]);p.close()});

await t('priority and steps appear in the editor, save, and show on the row',async()=>{
  const errors=[],p=await boot(newBrowser(),{errors}),id=add(p,{title:'Write report'});
  p.ev(`edit('${id}')`);const d=p.w.document;
  assert.ok(d.querySelector('#npri'),'priority select');assert.ok(d.querySelector('#nxsb'),'steps box');
  d.querySelector('#npri').value='1';d.querySelector('#npri').onchange({target:d.querySelector('#npri')});
  d.querySelector('#nxsi').value='Outline';d.querySelector('#nxsa').click();
  d.querySelector('#nxsi').value='Draft';d.querySelector('#nxsa').click();
  const c=d.querySelector('[data-s]');c.checked=true;c.onchange();
  assert.equal(p.ev(`get('${id}').pri`),1);assert.equal(p.ev(`get('${id}').subs.length`),2);assert.equal(p.ev(`get('${id}').subs.filter(s=>s.d).length`),1);
  d.querySelector('#nxsi').value='x'.repeat(300);d.querySelector('#nxsa').click();assert.equal(p.ev(`get('${id}').subs[2].t.length`),200);
  p.ev(`dlg.close();S.tab='tasks';render()`);
  const sm=d.querySelector('#m li.row small').textContent;assert.match(sm,/High priority/);assert.match(sm,/1\/3 steps/);
  assert.deepEqual(errors,[]);p.close()});

await t('the priority filter hides other tasks and sort by priority reorders',async()=>{
  const p=await boot(newBrowser());p.ev(`upd('${add(p,{title:'Low one'})}',{pri:3});upd('${add(p,{title:'High one'})}',{pri:1})`);add(p,{title:'Plain'});
  p.ev(`S.tab='tasks';render()`);const d=p.w.document,titles=()=>[...d.querySelectorAll('#m li.row:not([hidden]) b')].map(b=>b.textContent);
  assert.equal(titles().length,3);
  d.querySelector('[data-nf="1"]').click();assert.deepEqual(titles(),['High one']);
  d.querySelector('[data-nf="all"]').click();d.querySelector('[data-ns]').click();assert.deepEqual(titles(),['High one','Low one','Plain']);p.close()});

await t('week view lists tasks on their day and moves between weeks',async()=>{
  const errors=[],p=await boot(newBrowser(),{errors});add(p,{title:'Today thing',due:p.ev('dk()')});add(p,{title:'Next week thing',due:p.ev('addD(7)')});
  p.ev('A.weekview()');const d=p.w.document,txt=()=>d.querySelector('#m').textContent;
  assert.match(txt(),/Today thing/);assert.doesNotMatch(txt(),/Next week thing/);
  p.ev(`A.wkgo('1')`);assert.match(txt(),/Next week thing/);assert.doesNotMatch(txt(),/Today thing/);
  p.ev(`A.wkgo('0')`);assert.match(txt(),/Today thing/);assert.deepEqual(errors,[]);p.close()});

await t('streak counts consecutive days with a finished task',async()=>{
  const p=await boot(newBrowser()),day=n=>new Date(Date.now()-n*864e5).toISOString();
  p.ev(`D.log.push({t:'${day(0)}',k:'done',id:'a',ti:'a',ty:'task'},{t:'${day(1)}',k:'done',id:'b',ti:'b',ty:'task'},{t:'${day(3)}',k:'done',id:'c',ti:'c',ty:'task'})`);
  assert.equal(p.ev('nxStreak()'),2);p.close()});

await t('a break starts after focus and can be ended',async()=>{
  const p=await boot(newBrowser()),id=add(p);p.ev(`A.nxbrk('5')`);const o=p.w.document.querySelector('#fx');
  assert.match(o.textContent,/Break/);assert.match(o.textContent,/5:00|4:59/);p.ev(`A.nxbe()`);assert.equal(o.style.display,'none');p.close()});

await t('reminders include dated tasks with no time at the chosen hour, and Off removes them',async()=>{
  const p=await boot(newBrowser());add(p,{title:'Dated',due:p.ev('addD(2)')});
  const r=p.ev('JSON.stringify(window.nxReminders())'),a=JSON.parse(r);assert.equal(a.length,1);assert.equal(new Date(a[0].at).getHours(),9);
  p.w.localStorage.setItem('nexus.remdef/','18:00');assert.equal(new Date(JSON.parse(p.ev('JSON.stringify(window.nxReminders())'))[0].at).getHours(),18);
  p.w.localStorage.setItem('nexus.remdef/','');assert.equal(JSON.parse(p.ev('JSON.stringify(window.nxReminders())')).length,0);p.close()});

await t('the reminder setting shows in Settings and the new collections exist',async()=>{
  const errors=[],p=await boot(newBrowser(),{errors});p.ev('A.settings()');assert.ok(p.w.document.querySelector('#nxrd'));
  assert.ok('High priority' in p.ev('cols()')&&'Tasks with open steps' in p.ev('cols()'));assert.deepEqual(errors,[]);p.close()});

await t('a PDF attachment gets a View here button',async()=>{
  const p=await boot(newBrowser()),id=add(p,{title:'Paper'});p.ev(`upd('${id}',{media:{id:'m1',kind:'file',name:'a.pdf',mime:'application/pdf'}});edit('${id}')`);
  assert.ok(p.w.document.querySelector('#nxpv'));p.close()});
