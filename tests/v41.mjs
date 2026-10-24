import {boot,newBrowser} from './harness.mjs';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fs from 'node:fs';
import {t} from './lib.mjs';
const add=(p,o={})=>p.ev(`addItem(${JSON.stringify({type:'task',title:'x',body:'',url:'',tags:[],project:null,due:null,promise:false,...o})}).id`);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pre=w=>{w.DecompressionStream=DecompressionStream};
const boot2=async(o={})=>boot(newBrowser(),{pre,...o});

console.log('Nexus 4.1 features');
await t('4.1 loads with no errors and is listed for offline use',async()=>{
  const errors=[],p=await boot2({errors});assert.equal(p.ev('typeof NXV41'),'object');assert.equal(p.ev('typeof NXIO.unzip'),'function');assert.deepEqual(errors,[]);
  const sw=fs.readFileSync('sw.js','utf8');for(const f of['v41.js','import2.js','vendor/pdf.min.mjs','vendor/pdf.worker.min.mjs'])assert.ok(sw.includes("'"+f+"'"),f+' in sw.js');
  assert.ok(fs.existsSync('vendor/pdf.min.mjs')&&fs.existsSync('vendor/pdf.worker.min.mjs'));p.close()});
await t('Focus: long-break settings are saved and read back',async()=>{
  const p=await boot2();assert.deepEqual(JSON.parse(JSON.stringify(p.ev('NXV41.cycle()'))),{n:0,t:0,every:4,short:5,long:15});
  p.ev('A.settings()');const s=p.w.document.querySelector('#nx41fe');assert.ok(s,'sessions setting');s.value='2';s.onchange({target:s});
  assert.equal(p.ev('NXV41.cycle().every'),2);p.close()});
await t('Monthly recap counts finished tasks, captures and focus minutes for a month',async()=>{
  const p=await boot2(),id=add(p,{title:'A'});p.ev(`const i=get('${id}');i.done=true;i.doneAt=new Date().toISOString();D.log.push({k:'focus',t:new Date().toISOString(),m:25})`);
  const m=p.ev('JSON.parse(JSON.stringify(NXV41.monthData(0)))');assert.equal(m.done,1);assert.equal(m.cap,1);assert.equal(m.foc,25);assert.equal(m.act,1);
  p.ev('A.recapm(0)');assert.match(p.w.document.body.textContent,/Monthly recap/);p.close()});
await t('Study has its own question bank, kept apart from the flashcards',async()=>{
  const p=await boot2();p.ev(`D.study.push({id:'s1',name:'Physics',cards:[]});NXV41.qb(D.study[0]).push({id:'q1',r:0,w:0,q:'Unit of force?',t:'mc',a:'newton',o:['newton','joule','watt']});save()`);
  assert.equal(p.ev('D.study[0].cards.length'),0);p.ev('A.qbk("s1")');assert.match(p.w.document.body.textContent,/Unit of force\?/);p.close()});
await t('Week view with times places a timed task in its day and hour',async()=>{
  const p=await boot2();add(p,{title:'Lab',due:p.ev('dk()'),tm:'10:00',dur:90});add(p,{title:'Loose',due:p.ev('dk()')});
  p.ev("S.tab='week';A.wkt();render()");const d=p.w.document;assert.ok(d.querySelector('#nx41w'),'grid');
  assert.match(d.querySelector('.nx41b').textContent,/Lab/);assert.match(d.querySelector('.un').parentElement.textContent,/Loose/);p.close()});
await t('Graph of connections links by project, tag and explicit link',async()=>{
  const p=await boot2();p.ev(`D.projects.push({id:'p1',name:'Thesis'})`);const a=add(p,{type:'note',title:'One',project:'p1'}),b=add(p,{type:'note',title:'Two',project:'p1'}),c=add(p,{type:'note',title:'Three',tags:['zz']}),d=add(p,{type:'note',title:'Four',tags:['zz']});
  const g=p.ev('JSON.parse(JSON.stringify(NXV41.graphData("all")))');assert.ok(g.N.length>=5);assert.ok(g.E.some(e=>e.k==='p'));assert.ok(g.E.some(e=>e.k==='r'));
  p.ev('A.graph("all")');assert.ok(p.w.document.querySelector('svg.nx41gr line'));p.close()});
await t('Wallpaper, layout and navigation options apply and survive a reload',async()=>{
  const br=newBrowser(),p=await boot(br,{pre});p.ev(`NXV41.setLook({wp:'dusk',nav:'rail'})`);const l=p.ev('JSON.parse(JSON.stringify(NXV41.look()))');assert.equal(l.wp,'dusk');assert.equal(l.nav,'rail');
  const keys=Object.keys(p.w.localStorage);Object.assign(br.ls,Object.fromEntries(keys.map(k=>[k,p.w.localStorage.getItem(k)])));p.close();
  const q=await boot(br,{pre});assert.equal(q.ev('NXV41.look().wp'),'dusk');q.close()});
await t('PDF text becomes searchable without AI, using a stand-in reader',async()=>{
  const p=await boot2();p.ev(`NXV41.setReader(async()=>'Newton   second law\\nforce equals mass times acceleration')`);
  await p.ev(`bput('m1',new Blob(['%PDF'],{type:'application/pdf'}))`);const id=add(p,{type:'note',title:'Notes pdf',media:{id:'m1',kind:'file',name:'n.pdf',mime:'application/pdf'}});
  await sleep(300);const it=p.ev(`JSON.parse(JSON.stringify(get('${id}')))`);assert.match(it.ocr,/force equals mass/);assert.equal(it.ocrBy,'pdf');
  p.ev(`NXV41.setReader(async()=>'')`);const n=await p.ev(`NXV41.pdfIndex('${id}',{force:true,quiet:true})`);assert.equal(n,0);p.close()});
await t('AI card button and auto-filing work against a fake provider, and send nothing without a key',async()=>{
  const p=await boot2(),calls=[];await assert.rejects(()=>p.ev('NXV41.aiCall("s","u")'),/key|provider/i);assert.equal(calls.length,0);
  p.w.getKey=()=>'fake-key';
  p.w.fetch=async(u,i)=>{calls.push([u,i]);const b=JSON.parse(i.body),s=JSON.stringify(b.system||'');
    const text=/flashcards/.test(s)?JSON.stringify([{q:'Capital of France?',a:'Paris'},{q:'2+2?',a:'4'}]):JSON.stringify({project:'Thesis',subject:null});
    return{ok:true,status:200,json:async()=>({content:[{type:'text',text}]})}};
  p.ev(`D.projects.push({id:'p1',name:'Thesis'});D.study.push({id:'s1',name:'Geo',cards:[]});save()`);
  p.ev('A.aicards("s1")');const d=p.w.document;d.querySelector('#aiv').value='France facts';d.querySelector('#aig').click();await sleep(100);
  assert.equal(calls.length,1);assert.equal(calls[0][0],'https://api.anthropic.com/v1/messages');assert.equal(p.ev('D.study[0].cards.length'),0,'nothing added before review');
  d.querySelector('#aiy').click();assert.equal(p.ev('D.study[0].cards.length'),2);
  p.w.localStorage.setItem(p.ev("'nexus.aifile'+NS"),'1');const id=add(p,{type:'note',title:'Chapter outline'});await sleep(200);
  assert.equal(p.ev(`get('${id}').project`),'p1');p.close()});

console.log('Import: zip files and attachments');
const crcT=[...Array(256)].map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0});
const crc=b=>{let c=~0;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return~c>>>0};
function mkZip(ents,deflate){const L=[],C=[];let off=0;
  for(const [name,data] of ents){const raw=Buffer.from(data),body=deflate?zlib.deflateRawSync(raw):raw,nm=Buffer.from(name),m=deflate?8:0;
    const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(m,8);lh.writeUInt32LE(crc(raw),14);lh.writeUInt32LE(body.length,18);lh.writeUInt32LE(raw.length,22);lh.writeUInt16LE(nm.length,26);
    const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(m,10);ch.writeUInt32LE(crc(raw),16);ch.writeUInt32LE(body.length,20);ch.writeUInt32LE(raw.length,24);ch.writeUInt16LE(nm.length,28);ch.writeUInt32LE(off,42);
    L.push(lh,nm,body);C.push(ch,nm);off+=30+nm.length+body.length}
  const cd=Buffer.concat(C),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(ents.length,8);e.writeUInt16LE(ents.length,10);e.writeUInt32LE(cd.length,12);e.writeUInt32LE(off,16);return Buffer.concat([...L,cd,e])}
const File_=(name,buf,type='')=>{const b=Buffer.from(buf);return{name,type,size:b.length,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length),text:async()=>b.toString('utf8')}};
const PNG=Buffer.from('89504e470d0a1a0a0000000d49484452','hex');
const media=async(p,id)=>{const m=p.ev(`JSON.parse(JSON.stringify(get('${id}').media))`);const b=m&&await p.ev(`bget('${m.id}')`);return{m,size:b&&b.size}};
const imp=(p,fs_)=>{p.w.__f=fs_;return p.ev('NXIO.importFiles(__f)')};

await t('Obsidian vault zip (deflated): notes import and ![[picture]] is attached',async()=>{
  const p=await boot2(),z=mkZip([['Vault/Notes/Idea.md','# Idea\nSee ![[pic.png|300]] #study'],['Vault/Notes/pic.png',PNG],['Vault/.obsidian/app.json','{}'],['__MACOSX/x','x']],true);
  const r=await imp(p,[File_('vault.zip',z,'application/zip')]);assert.equal(r.added,1);assert.equal(r.files,1);
  const it=p.ev(`JSON.parse(JSON.stringify(D.items.find(i=>i.title==='Idea')))`),a=await media(p,it.id);assert.equal(a.m.kind,'photo');assert.equal(a.m.mime,'image/png');assert.equal(a.size,PNG.length);p.close()});
await t('Notion export zip (stored, nested zip): page and its picture import',async()=>{
  const p=await boot2(),inner=mkZip([['Export/My Page 0123456789abcdef0123456789abcdef.md','# My Page\n![shot](My%20Page%200123456789abcdef0123456789abcdef/shot.png)\nbody'],['Export/My Page 0123456789abcdef0123456789abcdef/shot.png',PNG]],false);
  const r=await imp(p,[File_('Export-Part-1.zip',mkZip([['Export-Part-1.zip',inner]],false))]);assert.equal(r.added,1);assert.equal(r.files,1);
  const it=p.ev(`JSON.parse(JSON.stringify(D.items[D.items.length-1]))`);assert.equal(it.title,'My Page');assert.equal((await media(p,it.id)).size,PNG.length);p.close()});
await t('Evernote .enex attachments are kept; extra ones become their own notes',async()=>{
  const p=await boot2(),b64=PNG.toString('base64'),res=(n,m)=>`<resource><data encoding="base64">${b64}</data><mime>${m}</mime><resource-attributes><file-name>${n}</file-name></resource-attributes></resource>`;
  const enex=`<?xml version="1.0"?><en-export><note><title>Trip</title><content><![CDATA[<en-note><div>Plan <en-media hash="a" type="image/png"/></div></en-note>]]></content>${res('a.png','image/png')}${res('b.pdf','application/pdf')}</note></en-export>`;
  const r=await imp(p,[File_('Trip.enex',enex)]);assert.equal(r.added,2);assert.equal(r.files,2);
  const a=p.ev(`JSON.parse(JSON.stringify(D.items.find(i=>i.title==='Trip')))`),b=p.ev(`JSON.parse(JSON.stringify(D.items.find(i=>i.title==='Trip - b.pdf')))`);
  assert.equal((await media(p,a.id)).m.kind,'photo');assert.equal((await media(p,b.id)).m.kind,'file');p.close()});
await t('Google Keep note with a picture next to its .json (loose files and a Takeout zip)',async()=>{
  const j=JSON.stringify({title:'Receipt',textContent:'Lunch',attachments:[{filePath:'abc.png',mimetype:'image/png'}],createdTimestampUsec:1700000000000000});
  for(const files of[[File_('Receipt.json',j),File_('abc.png',PNG)],[File_('takeout.zip',mkZip([['Takeout/Keep/Receipt.json',j],['Takeout/Keep/abc.png',PNG]],true))]]){
    const p=await boot2(),r=await imp(p,files);assert.equal(r.added,1);assert.equal(r.files,1);const it=p.ev(`JSON.parse(JSON.stringify(D.items[D.items.length-1]))`);assert.equal(it.title,'Receipt');assert.equal((await media(p,it.id)).size,PNG.length);p.close()}});
await t('Settings import button accepts zip, a bad zip changes nothing, plain .md still works',async()=>{
  const p=await boot2();p.ev('A.settings()');await sleep(30);assert.match(p.w.document.querySelector('#impf').accept,/\.zip/);
  const n=p.ev('D.items.length'),r=await imp(p,[File_('bad.zip',Buffer.from('not a zip'),'application/zip')]);assert.ok(r.none);assert.equal(p.ev('D.items.length'),n);
  const r2=await imp(p,[File_('Plain.md','# Plain\nhello')]);assert.equal(r2.added,1);assert.equal(r2.files,0);p.close()});
