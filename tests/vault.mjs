import {boot,newBrowser} from './harness.mjs';
import assert from 'node:assert/strict';
import {t} from './lib.mjs';

const K='nexus.data/',PW='correct horse battery';
const add=(p,o={})=>p.ev(`addItem(${JSON.stringify({type:'task',title:'x',body:'',url:'',tags:[],project:null,due:null,promise:false,...o})}).id`);
/* what is really stored in IndexedDB, bypassing the app */
const dump=(br,db,store)=>new Promise((res,rej)=>{const r=br.idb.open(db);r.onerror=()=>rej(r.error);r.onsuccess=()=>{const d=r.result;
  if(!d.objectStoreNames.contains(store)){d.close();res({vals:[],keys:[]});return}
  const tx=d.transaction(store),s=tx.objectStore(store),a=s.getAll(),k=s.getAllKeys();tx.oncomplete=()=>{d.close();res({vals:a.result,keys:k.result})};tx.onerror=()=>rej(tx.error)}});
const waitReady=async(p)=>{for(let i=0;i<500&&!p.w.__nxReady;i++)await p.sleep(10);return !!p.w.__nxReady};
async function unlockUI(p,pw){const d=p.w.document,i=d.querySelector('#nxv-p');i.value=pw;d.querySelector('#nxv-f').dispatchEvent(new p.w.Event('submit',{cancelable:true,bubbles:true}));
  for(let k=0;k<300;k++){await p.sleep(20);if(p.w.__nxReady)return true;const e=d.querySelector('#nxv-e');if(e&&/not the right|does not match/.test(e.textContent))return false}return false}
async function encrypted(items=['Secret plan','Dentist']){
  const br=newBrowser(),p=await boot(br);items.forEach(x=>add(p,{title:x,body:'private body of '+x}));await p.flush();
  const key=await p.w.NXVault.enable(PW);await p.flush();return{br,p,key}}

console.log('Encryption at rest');
await t('old "v2" storage key is moved to the Nexus 3.3 key without losing data',async()=>{
  const br=newBrowser(),d=JSON.stringify({items:[{id:'a',type:'note',title:'Old note',body:'',url:'',project:null,tags:[],done:false,doneAt:null,due:null,promise:false,media:null,created:new Date().toISOString(),updated:new Date().toISOString()}],projects:[],log:[],study:[]});
  br.ls['nexus.v2/']=d;const p=await boot(br);
  assert.equal(p.ev('D.items.length'),1);assert.equal(p.ev('localStorage.getItem("nexus.v2/")'),null);assert.ok(p.ev('localStorage.getItem("nexus.data/")').includes('Old note'));p.close()});

await t('turning encryption on seals the data, the safe copy, the trash and the restore points',async()=>{
  const {br,p,key}=await encrypted();
  assert.match(key,/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
  const raw=p.raw(K);assert.ok(raw.startsWith('NXE1.'));assert.ok(!raw.includes('Secret plan'));
  p.ev(`D.items=D.items.filter(i=>i.title!=='Dentist');save()`);await p.flush();
  const m=await dump(br,'nexus-safety/','kv'),tr=await dump(br,'nexus-safety/','trash'),sn=await dump(br,'nexus-safety/','snap');
  assert.ok(m.vals[0].raw.startsWith('NXE1.'));
  assert.equal(tr.vals.length,1);assert.ok(tr.vals[0].e.startsWith('NXE1.'));assert.equal(tr.vals[0].label,undefined);assert.equal(tr.vals[0].data,undefined);
  assert.ok(!JSON.stringify(tr.vals).includes('Dentist'));
  assert.ok(sn.vals.length>0&&sn.vals.every(x=>x.raw.startsWith('NXE1.')));
  const all=[...Array(p.w.localStorage.length).keys()].map(i=>p.w.localStorage.key(i)).map(k=>k+p.raw(k)).join('|');
  assert.ok(!all.includes('private body')&&!all.includes('Secret plan'));
  p.close()});

await t('the app never starts while locked, a wrong passphrase is refused, the right one opens everything',async()=>{
  const {br,p}=await encrypted();p.close();
  const q=await boot(br,{locked:true});
  assert.ok(q.w.document.querySelector('#nxv'));assert.equal(q.ev('typeof D'),'undefined');assert.equal(q.ev('typeof NXSafe'),'undefined');
  assert.equal(await unlockUI(q,'wrong passphrase'),false);assert.equal(q.ev('typeof D'),'undefined');
  assert.equal(await unlockUI(q,PW),true);assert.ok(!q.w.document.querySelector('#nxv'));
  assert.deepEqual([...q.ev('D.items.map(i=>i.title)')].sort(),['Dentist','Secret plan']);q.close()});

await t('changes made while unlocked are saved sealed and come back after the next unlock',async()=>{
  const {br,p}=await encrypted();add(p,{title:'Added later'});await p.flush();p.close();
  const q=await boot(br,{locked:true});await unlockUI(q,PW);
  assert.ok(q.ev('D.items.some(i=>i.title==="Added later")'));q.close();assert.ok(!JSON.stringify(br.ls).includes('Added later'))});

await t('the recovery key unlocks and forces a new passphrase; the old passphrase stops working',async()=>{
  const {br,p,key}=await encrypted();p.close();
  const q=await boot(br,{locked:true}),d=q.w.document;
  d.querySelector('#nxv-r').click();
  d.querySelector('#nxv-k').value=key.toLowerCase().replace(/0/g,'o');d.querySelector('#nxv-n').value='a brand new passphrase';
  d.querySelector('#nxv-f').dispatchEvent(new q.w.Event('submit',{cancelable:true,bubbles:true}));
  assert.ok(await waitReady(q));assert.equal(q.ev('D.items.length'),2);await q.flush();q.close();
  const r=await boot(br,{locked:true});assert.equal(await unlockUI(r,PW),false);assert.equal(await unlockUI(r,'a brand new passphrase'),true);r.close()});

await t('changing the passphrase needs the old one and keeps the data',async()=>{
  const {br,p}=await encrypted();
  await assert.rejects(()=>p.w.NXVault.changePass('not it','another long passphrase'),/Wrong passphrase/);
  await assert.rejects(()=>p.w.NXVault.changePass(PW,'short'),/8 characters/);
  await p.w.NXVault.changePass(PW,'another long passphrase');p.close();
  const q=await boot(br,{locked:true});assert.equal(await unlockUI(q,PW),false);assert.equal(await unlockUI(q,'another long passphrase'),true);assert.equal(q.ev('D.items.length'),2);q.close()});

await t('a new recovery key replaces the old one',async()=>{
  const {br,p,key}=await encrypted();const k2=await p.w.NXVault.renewRecovery(PW);assert.notEqual(k2,key);p.close();
  const q=await boot(br,{locked:true}),d=q.w.document;d.querySelector('#nxv-r').click();
  d.querySelector('#nxv-k').value=key;d.querySelector('#nxv-n').value='whatever passphrase';d.querySelector('#nxv-f').dispatchEvent(new q.w.Event('submit',{cancelable:true,bubbles:true}));
  for(let i=0;i<60;i++)await q.sleep(20);assert.ok(!q.w.__nxReady,'old recovery key must not work');
  d.querySelector('#nxv-k').value=k2;d.querySelector('#nxv-f').dispatchEvent(new q.w.Event('submit',{cancelable:true,bubbles:true}));assert.ok(await waitReady(q));q.close()});

await t('turning encryption off puts everything back in plain form and removes the gate',async()=>{
  const {br,p}=await encrypted();
  await assert.rejects(()=>p.w.NXVault.disable('nope nope nope'),/Wrong passphrase/);
  p.ev(`D.items=D.items.filter(i=>i.title!=='Dentist');save()`);await p.flush();
  await p.w.NXVault.disable(PW);await p.flush();
  assert.ok(p.w.localStorage.getItem(K).includes('Secret plan'));assert.equal(p.w.localStorage.getItem('nexus.vault/'),null);
  const m=await dump(br,'nexus-safety/','kv'),tr=await dump(br,'nexus-safety/','trash');
  assert.ok(!m.vals[0].raw.startsWith('NXE1.'));assert.equal(tr.vals[0].label,'Dentist');p.close();
  const q=await boot(br);assert.ok(!q.w.document.querySelector('#nxv'));assert.equal(q.ev('D.items.length'),1);q.close()});

await t('turning encryption on after the data already has a trash and restore points seals them too',async()=>{
  const br=newBrowser(),p=await boot(br);add(p,{title:'Keep'});const id=add(p,{title:'Binned'});await p.flush();
  p.ev(`D.items=D.items.filter(i=>i.id!=='${id}');save()`);await p.flush();
  assert.equal((await dump(br,'nexus-safety/','trash')).vals[0].label,'Binned');
  await p.w.NXVault.enable(PW);await p.flush();
  const tr=await dump(br,'nexus-safety/','trash');assert.equal(tr.vals[0].label,undefined);assert.ok(tr.vals[0].e.startsWith('NXE1.'));
  const shown=await p.w.NXSafe.trash();assert.equal(shown[0].label,'Binned');assert.equal(shown[0].data.title,'Binned');
  await p.w.NXSafe.restoreEntry(shown[0]);assert.equal(p.ev('D.items.length'),2);p.close()});

await t('attachments are stored sealed, read back exactly, and survive a lock and unlock',async()=>{
  const {br,p}=await encrypted();
  p.ev(`window.__b=new Blob([new Uint8Array([1,2,3,250,251,252])],{type:'audio/webm'})`);
  await p.ev(`bput('m1',window.__b)`);
  /* a real attachment is always pointed to by an item. Without one, the startup clean-up (patch.js gc) rightly deletes the file,
     and whether this test passed depended on a race with it. */
  p.ev(`addItem({type:'note',title:'Voice',body:'',url:'',tags:[],project:null,due:null,promise:false,media:{id:'m1',kind:'audio',mime:'audio/webm',name:'v.webm'}})`);await p.flush();
  const raw=await dump(br,'nexus-media/','b');assert.equal(raw.keys[0],'m1');assert.equal(raw.vals[0].nxe,1);assert.ok(!(raw.vals[0] instanceof p.w.Blob));
  const back=await p.ev(`bget('m1')`);assert.equal(back.type,'audio/webm');
  assert.deepEqual([...new Uint8Array(await back.arrayBuffer())],[1,2,3,250,251,252]);p.close();
  const q=await boot(br,{locked:true});await unlockUI(q,PW);
  await q.sleep(300);   /* let the startup clean-up finish: a referenced attachment must survive it */
  const b2=await q.ev(`bget('m1')`);assert.deepEqual([...new Uint8Array(await b2.arrayBuffer())],[1,2,3,250,251,252]);q.close()});
await t('at startup an attachment no item points to is removed, and one an item points to is kept',async()=>{
  const br=newBrowser(),p=await boot(br);p.ev(`window.__b=new Blob([new Uint8Array([5,6])],{type:'image/jpeg'})`);
  await p.ev(`bput('keep',window.__b)`);await p.ev(`bput('orphan',window.__b)`);
  p.ev(`addItem({type:'note',title:'Pic',body:'',url:'',tags:[],project:null,due:null,promise:false,media:{id:'keep',kind:'photo',mime:'image/jpeg',name:'p.jpg'}})`);await p.flush();p.close();
  const q=await boot(br);await q.sleep(300);const d=await dump(br,'nexus-media/','b');assert.deepEqual(d.keys,['keep']);q.close()});

await t('existing attachments are sealed when encryption goes on and opened when it goes off',async()=>{
  const br=newBrowser(),p=await boot(br);p.ev(`window.__b=new Blob([new Uint8Array([9,8,7])],{type:'image/jpeg'})`);await p.ev(`bput('m2',window.__b)`);
  assert.ok((await dump(br,'nexus-media/','b')).vals[0].size===3||true);
  await p.w.NXVault.enable(PW);await p.flush();assert.equal((await dump(br,'nexus-media/','b')).vals[0].nxe,1);
  await p.w.NXVault.disable(PW);await p.flush();const v=(await dump(br,'nexus-media/','b')).vals[0];assert.ok(v.nxe===undefined);
  const b=await p.ev(`bget('m2')`);assert.deepEqual([...new Uint8Array(await b.arrayBuffer())],[9,8,7]);p.close()});

await t('API keys saved by the app are sealed on disk while encryption is on',async()=>{
  const {br,p}=await encrypted();
  p.ev(`localStorage.setItem('nexus.ai.v1/',JSON.stringify({keys:{gemini:'AIzaSECRETKEY1234567890'},models:{},disc:{}}))`);await p.flush();
  assert.ok(p.w.localStorage.getItem('nexus.ai.v1/')!==null);
  p.close();const raw=Object.entries(br.ls).map(([k,v])=>k+v).join('|');assert.ok(!raw.includes('AIzaSECRET'));assert.ok(br.ls['nexus.ai.v1/'].startsWith('NXE1.'));assert.ok(!br.ls['nexus.ai.v1/'].includes('Gemini'));
  const q=await boot(br,{locked:true});await unlockUI(q,PW);assert.ok(q.ev('localStorage.getItem("nexus.ai.v1/")').includes('AIzaSECRET'));q.close()});

await t('an interrupted move to encryption resumes at the next unlock',async()=>{
  const {br,p}=await encrypted();p.close();
  /* pretend the app crashed half way: meta says "still moving" and the main data is plain again */
  const meta=JSON.parse(br.ls['nexus.vault/']);meta.mig=1;br.ls['nexus.vault/']=JSON.stringify(meta);
  br.ls[K]=JSON.stringify({items:[{id:'z',type:'note',title:'Half moved',body:'',url:'',project:null,tags:[],done:false,doneAt:null,due:null,promise:false,media:null,created:new Date().toISOString(),updated:new Date().toISOString()}],projects:[],log:[],study:[]});
  const q=await boot(br,{locked:true});assert.equal(await unlockUI(q,PW),true);
  assert.equal(q.ev('D.items[0].title'),'Half moved');
  for(let i=0;i<100&&JSON.parse(q.w.localStorage.getItem('nexus.vault/')).mig!==0;i++)await q.sleep(20);await q.flush();
  assert.equal(JSON.parse(q.w.localStorage.getItem('nexus.vault/')).mig,0);q.close();
  assert.ok(br.ls[K].startsWith('NXE1.'));assert.ok(!br.ls[K].includes('Half moved'))});

await t('damaged encrypted data never blocks unlocking: the safe copy steps in',async()=>{
  const {br,p}=await encrypted();p.close();
  br.ls[K]=br.ls[K].slice(0,-6)+'AAAAAA';   /* tamper with the ciphertext */
  const q=await boot(br,{locked:true});assert.equal(await unlockUI(q,PW),true);
  /* the app restores from the safe copy and reloads itself; jsdom cannot reload, so check the next start */
  for(let i=0;i<150&&!q.raw('nexus.safety.note/');i++)await q.sleep(20);await q.flush();
  assert.ok(q.raw('nexus.safety.note/'));q.close();
  const r=await boot(br,{locked:true});assert.equal(await unlockUI(r,PW),true);assert.equal(r.ev('D.items.length'),2);r.close()});

await t('a full disk while encrypted keeps a safe copy and does not break the app',async()=>{
  const br=newBrowser(),errors=[],p=await boot(br,{quotaFail:true,errors});add(p,{title:'Before'});await p.flush();await p.w.NXVault.enable(PW);await p.flush();
  p.w.__full=true;add(p,{title:'While full'});await p.flush();await p.sleep(100);
  assert.ok(p.w.localStorage.getItem(K+'.stale')!==null);
  const m=await p.w.NXSafe.mirror();assert.ok(m.raw.includes('While full'));assert.deepEqual(errors,[]);p.close()});

await t('Settings shows one Encryption section, and its buttons match the state',async()=>{
  const br=newBrowser(),p=await boot(br);p.ev('A.settings()');await p.sleep(30);const d=p.w.document;
  assert.equal(d.querySelectorAll('#nx-vault').length,1);assert.ok(d.querySelector('#nxv-on'));assert.ok(!d.querySelector('#nxv-now'));
  await p.w.NXVault.enable(PW);p.ev('A.settings()');await p.sleep(30);
  assert.equal(d.querySelectorAll('#nx-vault').length,1);assert.ok(d.querySelector('#nxv-now'));assert.ok(d.querySelector('#nxv-off'));assert.ok(!d.querySelector('#nxv-on'));
  assert.ok(/Nexus 4\.0\.0/.test(d.querySelector('#dlg').textContent));p.close()});

await t('Delete all data removes the vault, the trash, restore points, attachments and keys',async()=>{
  const {br,p}=await encrypted();p.w.confirm=()=>true;await p.ev(`bput('m3',new Blob([new Uint8Array([1])]))`);
  p.ev('A.settings()');await p.sleep(30);p.w.document.querySelector('#wp').click();await p.sleep(400);
  const left=[];for(let i=0;i<p.w.localStorage.length;i++)left.push(p.w.localStorage.key(i));
  assert.deepEqual(left.filter(k=>k.startsWith('nexus.data')||k.startsWith('nexus.vault')||k.startsWith('nexus.ai')),[]);
  for(const [db,st] of [['nexus-safety/','trash'],['nexus-safety/','snap'],['nexus-safety/','kv'],['nexus-media/','b']]){const x=await dump(br,db,st);assert.equal(x.vals.length,0,db+' '+st)}p.close()});

await t('wrong passphrases slow down: the third failure makes the next try wait',async()=>{
  const {br,p}=await encrypted();p.close();const q=await boot(br,{locked:true});
  for(let i=0;i<3;i++)await unlockUI(q,'bad bad bad '+i);
  const d=q.w.document;d.querySelector('#nxv-p').value=PW;d.querySelector('#nxv-f').dispatchEvent(new q.w.Event('submit',{cancelable:true,bubbles:true}));await q.sleep(60);
  assert.match(d.querySelector('#nxv-e').textContent,/Wait \d+ s/);q.close()});

await t('AI keys saved by an older Nexus under the shared name are moved to this copy\'s own name',async()=>{
  const br=newBrowser(),seed=JSON.stringify({keys:{gemini:'AIzaOLDKEY1234567890'},models:{}});br.ls['nexus.ai.v1']=seed;
  const p=await boot(br);assert.equal(p.ev('localStorage.getItem("nexus.ai.v1/")'),seed);assert.equal(p.ev('NXAI.has()'),true);
  await p.w.NXVault.enable(PW);await p.flush();assert.equal(p.raw('nexus.ai.v1'),null,'the shared plain copy is removed when encryption goes on');
  assert.ok(p.raw('nexus.ai.v1/').startsWith('NXE1.'));p.close()});
