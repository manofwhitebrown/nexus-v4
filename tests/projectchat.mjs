/* Ask about one project. */
import {boot,newBrowser} from './harness.mjs';
import assert from 'node:assert/strict';
import {t} from './lib.mjs';
const add=(p,o={})=>p.ev(`addItem(${JSON.stringify({type:'task',title:'x',body:'',url:'',tags:[],project:null,due:null,promise:false,...o})}).id`);

console.log('Project chat');
await t('the project screen has the button, and without AI set up it points to Ask Nexus and sends nothing',async()=>{
  const errors=[];let calls=0;const p=await boot(newBrowser(),{errors,pre:w=>{}});p.w.fetch=()=>{calls++;return Promise.reject(new Error('no'))};
  p.ev(`D.projects.push({id:'p1',name:'Thesis'});S.tab='browse';S.pj='p1';render()`);const d=p.w.document;assert.ok(d.querySelector('#nxpc'));
  p.ev(`A.pchat('p1')`);d.querySelector('#pcq').value='What is left?';d.querySelector('#pca').click();await p.sleep(20);
  assert.ok(d.querySelector('#pco'));assert.equal(calls,0);assert.deepEqual(errors,[]);p.close()});

await t('a question sends only this project\'s items plus earlier turns, and the answer is stored in the project',async()=>{
  const p=await boot(newBrowser()),bodies=[];
  p.w.fetch=(u,o)=>{bodies.push(JSON.parse(o.body));return Promise.resolve({ok:true,status:200,json:async()=>({content:[{type:'text',text:'Answer '+bodies.length}]})})};
  p.ev(`D.projects.push({id:'p1',name:'Thesis'});setSK('sk-test')`);add(p,{title:'Chapter one',project:'p1'});add(p,{title:'Secret grocery list'});
  const d=p.w.document;p.ev(`A.pchat('p1')`);
  d.querySelector('#pcq').value='First?';d.querySelector('#pca').click();await p.sleep(60);
  assert.match(bodies[0].messages[0].content,/Chapter one/);assert.doesNotMatch(bodies[0].messages[0].content,/grocery/);
  assert.equal(p.ev(`D.projects[0].chat.length`),2);assert.match(d.querySelector('#pcl').textContent,/Answer 1/);
  d.querySelector('#pcq').value='Second?';d.querySelector('#pca').click();await p.sleep(60);
  assert.equal(bodies[1].messages.length,3);assert.equal(bodies[1].messages[0].role,'user');assert.equal(bodies[1].messages[1].role,'assistant');
  assert.equal(p.ev(`D.projects[0].chat.length`),4);
  d.querySelector('#pcc').click();assert.equal(p.ev(`D.projects[0].chat.length`),0);p.close()});

await t('a failed request keeps the history clean and shows the error',async()=>{
  const p=await boot(newBrowser());p.w.fetch=()=>Promise.resolve({ok:false,status:500,json:async()=>({error:{message:'Boom'}})});
  p.ev(`D.projects.push({id:'p1',name:'T'});setSK('sk-test');A.pchat('p1')`);const d=p.w.document;d.querySelector('#pcq').value='Hi?';d.querySelector('#pca').click();await p.sleep(40);
  assert.match(d.querySelector('#pce').textContent,/Boom/);assert.equal(p.ev(`(D.projects[0].chat||[]).length`),0);p.close()});

await t('project chats survive backup restore and are merged by sync',async()=>{
  const a=await boot(newBrowser());a.ev(`D.projects.push({id:'p1',name:'T',chat:[{r:'u',t:'q'},{r:'a',t:'a'},{r:'x',t:'bad'}]})`);
  const json=a.ev('JSON.stringify({app:"nexus",v:3,...D,media:{}})');a.close();
  const b=await boot(newBrowser());b.w.confirm=()=>true;b.ev('A.settings()');await b.sleep(30);
  b.w.document.querySelector('#fi').onchange({target:{files:[{size:json.length,text:async()=>json}]}});await b.sleep(300);
  assert.equal(b.ev(`D.projects[0].chat.length`),2);b.close()});
