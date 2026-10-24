import {boot,newBrowser} from './harness.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {t} from './lib.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fakeCaches=()=>{const st=new Map();const mk=n=>{if(!st.has(n))st.set(n,new Map());const m=st.get(n);return{keys:async()=>[...m.keys()].map(u=>({url:u})),match:async k=>{const r=m.get(k.url||k);return r?r.clone():undefined},delete:async k=>m.delete(k.url||k),put:async(k,r)=>{m.set(typeof k==='string'?k:k.url,r)}}};return{open:async n=>mk(n),_s:st}};
console.log('Nexus 4.2: shared files and voice');

await t('manifest accepts shared files (POST) and the service worker lists v42.js',async()=>{
  const m=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8')).share_target;assert.equal(m.method,'POST');assert.equal(m.enctype,'multipart/form-data');assert.equal(m.params.files[0].name,'files');assert.ok(m.params.text&&m.params.url&&m.params.title);
  assert.ok(fs.readFileSync('sw.js','utf8').includes("'v42.js'"))});
await t('service worker: a shared file is parked, shared text is passed on, and a failure still opens the app',async()=>{
  let handler;const caches=fakeCaches(),SC='https://x.test/app/';
  vm.runInNewContext(fs.readFileSync('sw.js','utf8'),{self:{registration:{scope:SC},addEventListener:(n,f)=>{if(n==='fetch')handler=f}},location:new URL(SC),URL,Request,Response,caches,Promise,encodeURIComponent,URLSearchParams,Set});
  const go=async fd=>{let p;handler({request:{method:'POST',url:SC,formData:async()=>fd},respondWith:x=>{p=x}});return p};
  const fd=new FormData();fd.set('title','T');fd.set('text','hello');fd.append('files',new File(['abc'],'a b.pdf',{type:'application/pdf'}));
  const r=await go(fd);assert.equal(r.status,303);assert.equal(r.headers.get('location'),SC+'?title=T&text=hello');
  const c=await caches.open('share-inbox'),ks=await c.keys();assert.equal(ks.length,1);assert.match(ks[0].url,/share\/0\?n=a%20b\.pdf$/);assert.equal(await(await c.match(ks[0])).text(),'abc');
  const bad=await go({get:()=>{throw new Error('x')},getAll:()=>[]});assert.equal(bad.headers.get('location'),SC)});
await t('files waiting in the share inbox are saved as notes with the file attached',async()=>{
  const br=newBrowser(),ca=fakeCaches(),p=await boot(br,{pre:w=>{w.caches=ca}}),c=await ca.open('share-inbox');
  await c.put('https://localhost/share/0?n=Menu%20card.pdf',new Response(new Blob(['%PDF'],{type:'application/pdf'}),{headers:{'content-type':'application/pdf'}}));
  await c.put('https://localhost/share/1?n=pic.png',new Response(new Blob(['png'],{type:'image/png'})));
  const n=await p.w.NXV42.takeShared();assert.equal(n,2);
  const its=p.ev('JSON.parse(JSON.stringify(D.items))');const a=its.find(i=>i.title==='Menu card');assert.equal(a.media.kind,'file');assert.equal(a.media.name,'Menu card.pdf');assert.ok(a.tags.includes('shared'));
  assert.equal(its.find(i=>i.title==='pic').media.kind,'photo');assert.equal((await p.ev(`bget('${a.media.id}')`)).size,4);assert.equal((await c.keys()).length,0);
  assert.equal(await p.w.NXV42.takeShared(),0);p.close()});
await t('voice phrases do the right thing',async()=>{
  const p=await boot(newBrowser()),say=s=>JSON.parse(JSON.stringify(p.w.NXV42.say(s))),items=()=>p.ev('JSON.parse(JSON.stringify(D.items))');
  assert.ok(say('Add task buy milk.').ok);let it=items().find(i=>/buy milk/i.test(i.title));assert.equal(it.type,'task');assert.ok(it.tags.includes('voice'));
  assert.ok(say('remind me to call mom').ok);assert.ok(items().some(i=>i.type==='task'&&/call mom/i.test(i.title)));
  assert.ok(say('note that the lab is on friday').ok);assert.ok(items().some(i=>i.type!=='task'&&/lab is on friday/i.test(i.title+i.body)));
  say('go to tasks');assert.equal(p.ev('S.tab'),'tasks');say('show me the library');assert.equal(p.ev('S.tab'),'notes');say('open study');assert.equal(p.ev('S.tab'),'study');
  say('search milk');assert.equal(p.w.document.querySelector('#q').value,'milk');
  const r=say('mark buy milk done');assert.ok(r.ok);assert.equal(items().find(i=>/buy milk/i.test(i.title)).done,true);
  assert.equal(say('mark unicorn done').ok,false);assert.equal(say('blah blah').ok,false);assert.equal(say('').ok,false);
  assert.ok(say('focus on call mom').ok);p.ev('clearInterval(F.h)');p.close()});
await t('command palette shows a mic button when speech exists, and a spoken command runs',async()=>{
  let rec;const SR=function(){rec=this;this.start=()=>{};this.stop=()=>{}};
  const p=await boot(newBrowser(),{pre:w=>{w.SpeechRecognition=SR}});p.ev('nxPalette()');await sleep(30);const d=p.w.document,b=d.querySelector('#nx42m');assert.ok(b,'mic button');
  b.click();rec.onresult({results:[[{transcript:'add task water plants'}]]});await sleep(20);assert.ok(p.ev('D.items.some(i=>/water plants/.test(i.title))'));
  const q=await boot(newBrowser());q.ev('nxPalette()');await sleep(30);assert.equal(q.w.document.querySelector('#nx42m'),null,'no mic without speech support');p.close();q.close()});
