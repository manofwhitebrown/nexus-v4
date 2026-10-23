import {boot,newBrowser} from './harness.mjs';
import assert from 'node:assert/strict';
import {t} from './lib.mjs';

const PW='correct horse battery',SP='shared sync passphrase';
const J=x=>JSON.parse(JSON.stringify(x));
const iso=n=>new Date(Date.UTC(2026,0,1,0,0,n)).toISOString();
const it=(id,o={})=>({id,type:'note',title:id,body:'',url:'',project:null,tags:[],done:false,doneAt:null,due:null,promise:false,media:null,created:iso(0),updated:iso(0),...o});
const card=(id,o={})=>({id,q:'q'+id,a:'a'+id,box:0,due:'2026-01-01',...o});
const norm=d=>({items:[...d.items].sort((a,b)=>a.id<b.id?-1:1),projects:[...d.projects].sort((a,b)=>a.id<b.id?-1:1),
  study:[...d.study].map(s=>({...s,cards:[...s.cards].sort((a,b)=>a.id<b.id?-1:1)})).sort((a,b)=>a.id<b.id?-1:1),log:d.log});
const D0=(o={})=>({items:[],projects:[],study:[],log:[],...o});

const boot0=await boot(newBrowser());
const M=(a,b,c)=>J(boot0.w.NXSync.merge(J(a),J(b),c===null||c===undefined?null:J(c)));

console.log('Sync: the merge');
await t('edits to different fields on two devices both survive',()=>{
  const base=D0({items:[it('a',{title:'old',body:'old'})]});
  const A=D0({items:[it('a',{title:'new title',body:'old',updated:iso(5)})]}),B=D0({items:[it('a',{title:'old',body:'new body',updated:iso(6)})]});
  const m=M(A,B,base).items[0];assert.equal(m.title,'new title');assert.equal(m.body,'new body')});
await t('the same field edited twice: the later edit wins, whichever side runs the merge',()=>{
  const base=D0({items:[it('a',{title:'old'})]});
  const A=D0({items:[it('a',{title:'from A',updated:iso(5)})]}),B=D0({items:[it('a',{title:'from B',updated:iso(9)})]});
  assert.equal(M(A,B,base).items[0].title,'from B');assert.equal(M(B,A,base).items[0].title,'from B')});
await t('new things on each side are all kept',()=>{
  const m=M(D0({items:[it('a')],projects:[{id:'p1',name:'One'}]}),D0({items:[it('b')],projects:[{id:'p2',name:'Two'}]}),null);
  assert.deepEqual(m.items.map(i=>i.id).sort(),['a','b']);assert.equal(m.projects.length,2)});
await t('a deletion travels only when the other side did not touch the item',()=>{
  const base=D0({items:[it('a'),it('b')]});
  const A=D0({items:[it('b')]}),B=D0({items:[it('a'),it('b',{title:'edited',updated:iso(3)})]});
  const m=M(A,B,base);assert.deepEqual(m.items.map(i=>i.id),['b']);assert.equal(m.items[0].title,'edited');
  const m2=M(D0({items:[it('b')]}),D0({items:[it('a',{title:'edited elsewhere',updated:iso(4)}),it('b')]}),base);
  assert.ok(m2.items.some(i=>i.id==='a'),'an edit beats a delete')});
await t('without an agreed starting point nothing is ever deleted',()=>{
  const m=M(D0({items:[it('a')]}),D0({items:[]}),null);assert.equal(m.items.length,1);
  const m2=M(D0({items:[]}),D0({items:[it('a')]}),null);assert.equal(m2.items.length,1)});
await t('a card review on one device and a text edit on another both survive',()=>{
  const base=D0({study:[{id:'s',name:'Bio',cards:[card('c1')]}]});
  const A=D0({study:[{id:'s',name:'Bio',cards:[card('c1',{box:2,due:'2026-02-01',fs:{s:5,d:5,l:'2026-01-20',n:2,x:0}})]}]});
  const B=D0({study:[{id:'s',name:'Bio',cards:[card('c1',{q:'better question'})]}]});
  const c=M(A,B,base).study[0].cards[0];assert.equal(c.q,'better question');assert.equal(c.box,2);assert.equal(c.fs.n,2);
  const c2=M(B,A,base).study[0].cards[0];assert.deepEqual(c,c2)});
await t('two reviews of the same card: the one with the later review wins as a whole',()=>{
  const base=D0({study:[{id:'s',name:'Bio',cards:[card('c1')]}]});
  const mk=(l,n,due)=>D0({study:[{id:'s',name:'Bio',cards:[card('c1',{box:1,due,fs:{s:3,d:5,l,n,x:0}})]}]});
  const c=M(mk('2026-01-10',1,'2026-01-13'),mk('2026-01-12',2,'2026-01-20'),base).study[0].cards[0];
  assert.equal(c.due,'2026-01-20');assert.equal(c.fs.n,2)});
await t('cards added to the same subject on two devices are both kept; subject rename and new cards combine',()=>{
  const base=D0({study:[{id:'s',name:'Bio',cards:[card('c1')]}]});
  const A=D0({study:[{id:'s',name:'Biology',cards:[card('c1')]}]}),B=D0({study:[{id:'s',name:'Bio',cards:[card('c1'),card('c2')]}]});
  const s=M(A,B,base).study[0];assert.equal(s.name,'Biology');assert.deepEqual(s.cards.map(c=>c.id).sort(),['c1','c2'])});
await t('a card deleted on one device is removed on the other when untouched',()=>{
  const base=D0({study:[{id:'s',name:'Bio',cards:[card('c1'),card('c2')]}]});
  const A=D0({study:[{id:'s',name:'Bio',cards:[card('c2')]}]}),B=D0({study:[{id:'s',name:'Bio',cards:[card('c1'),card('c2')]}]});
  assert.deepEqual(M(A,B,base).study[0].cards.map(c=>c.id),['c2'])});
await t('the timeline is combined without repeats and capped at 400',()=>{
  const l=Array.from({length:300},(_,i)=>({t:iso(i),k:'add',id:'x'+i,ti:'t',ty:'note'})),r=Array.from({length:300},(_,i)=>({t:iso(i+150),k:'add',id:'x'+(i+150),ti:'t',ty:'note'}));
  const m=M(D0({log:l}),D0({log:r}),null);assert.equal(m.log.length,400);assert.equal(new Set(m.log.map(x=>x.id)).size,400)});
await t('more than 5,000 items together is refused with a clear message',()=>{
  const big=n=>D0({items:Array.from({length:n},(_,i)=>it('i'+n+'_'+i))});
  assert.throws(()=>M(big(3000),big(3001),null),/5,000/)});
await t('bad records from a sync file are dropped instead of breaking the app',()=>{
  const c=J(boot0.w.NXSync.clean({items:[it('ok'),{id:5},null,{id:'x',type:'bogus'},'str'],projects:[{id:'p',name:'ok'},{id:'q'}],study:[{id:'s',name:'S',cards:[card('c1'),{id:'bad'}]},{id:'t',name:'no cards'}],log:[{t:'x',k:'a'},{}]}));
  assert.equal(c.items.length,1);assert.equal(c.projects.length,1);assert.equal(c.study.length,1);assert.equal(c.study[0].cards.length,1);assert.equal(c.log.length,1)});
await t('property: merging in either order gives the same result (400 random cases)',()=>{
  let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff,pick=a=>a[Math.floor(rnd()*a.length)];
  for(let n=0;n<400;n++){
    const ids=['a','b','c','d','e'],base=D0({items:ids.filter(()=>rnd()<.7).map(i=>it(i,{title:'t'+i,body:'b'+i})),study:[{id:'s',name:'S',cards:['c1','c2','c3'].filter(()=>rnd()<.8).map(i=>card(i))}]});
    const mut=(d,tag)=>{const x=J(d);x.items=x.items.filter(()=>rnd()<.85);x.items.forEach(i=>{if(rnd()<.4){i[pick(['title','body','done'])]=tag+rnd();i.updated=iso(Math.floor(rnd()*20))}});
      if(rnd()<.5)x.items.push(it(tag+'new'+Math.floor(rnd()*3),{title:tag}));
      x.study[0].cards=x.study[0].cards.filter(()=>rnd()<.85);x.study[0].cards.forEach(c=>{if(rnd()<.4){c.q=tag+rnd()}if(rnd()<.4){c.box=Math.floor(rnd()*4);c.due='2026-01-'+String(10+Math.floor(rnd()*9));c.fs={s:2,d:5,l:'2026-01-0'+(1+Math.floor(rnd()*8)),n:Math.floor(rnd()*5),x:0}}});
      if(rnd()<.3)x.study[0].name=tag+'name';return x};
    const A=mut(base,'A'),B=mut(base,'B');
    assert.deepEqual(norm(M(A,B,base)),norm(M(B,A,base)),'case '+n)}});

/* ----- two simulated devices sharing one cloud ----- */
function cloud(){const files=new Map();let n=0;const hooks={get:null,failPut:0};
  const T={name:'mock',
    async get(name){if(hooks.get)await hooks.get(name);const f=files.get(name);return f?{data:Uint8Array.from(f.data),rev:String(f.rev)}:null},
    async put(name,bytes,expect){const f=files.get(name);
      if(hooks.failPut>0&&name==='nexus-sync.json'){hooks.failPut--;const o=files.get(name);files.set(name,{data:o?o.data:Uint8Array.from(bytes),rev:++n});const e=new Error('changed');e.code='conflict';throw e}
      if(expect!==undefined&&((expect===null)!==!f||(f&&String(f.rev)!==expect))){const e=new Error('changed');e.code='conflict';throw e}
      files.set(name,{data:Uint8Array.from(bytes),rev:++n});return String(n)},
    async list(){return new Set(files.keys())}};
  return{T,files,hooks}}
const addTo=(p,title,o={})=>p.ev(`addItem(${JSON.stringify({type:'note',title,body:'',url:'',tags:[],project:null,due:null,promise:false,...o})}).id`);
async function device(c,connectNow=true,pass=PW){
  const br=newBrowser(),p=await boot(br);await p.w.NXVault.enable(pass);p.w.NXSync.setTransport(c.T);
  if(connectNow){await p.w.NXSync.connect(c.T,SP,'folder',{})}return{br,p}}
const titles=p=>[...p.ev('D.items.map(i=>i.title)')].sort();

console.log('Sync: two devices');
await t('a second device joins with the sync passphrase and receives everything; the cloud holds no plain text',async()=>{
  const c=cloud(),a=await device(c,false);addTo(a.p,'Tax return');addTo(a.p,'Passport scan');await a.p.flush();
  const r=await a.p.w.NXSync.connect(c.T,SP,'folder',{});assert.ok(r.ok&&r.pushed);
  const raw=Buffer.from(c.files.get('nexus-sync.json').data).toString();assert.ok(!raw.includes('Tax return'));assert.equal(JSON.parse(raw).app,'nexus-sync');
  const b=await device(c);assert.deepEqual(titles(b.p),['Passport scan','Tax return']);a.p.close();b.p.close()});
await t('a wrong sync passphrase is refused and nothing changes',async()=>{
  const c=cloud(),a=await device(c);addTo(a.p,'Secret');await a.p.flush();await a.p.w.NXSync.syncNow();
  const br=newBrowser(),p=await boot(br);await p.w.NXVault.enable(PW);addTo(p,'Mine');
  await assert.rejects(()=>p.w.NXSync.connect(c.T,'not the passphrase',"folder",{}),/Wrong sync passphrase/);
  assert.deepEqual(titles(p),['Mine']);assert.equal(p.w.NXSync.loadCfg(),null);a.p.close();p.close()});
await t('edits, new items and deletions flow both ways',async()=>{
  const c=cloud(),a=await device(c);addTo(a.p,'Shared');addTo(a.p,'Will be deleted');await a.p.flush();await a.p.w.NXSync.syncNow();
  const b=await device(c);assert.equal(b.p.ev('D.items.length'),2);
  b.p.ev(`{const x=D.items.find(i=>i.title==='Shared');x.title='Shared, edited on B';x.updated=new Date().toISOString();save()}`);addTo(b.p,'Only on B');await b.p.flush();await b.p.w.NXSync.syncNow();
  a.p.ev(`D.items=D.items.filter(i=>i.title!=='Will be deleted');save()`);await a.p.flush();await a.p.w.NXSync.syncNow();
  assert.deepEqual(titles(a.p),['Only on B','Shared, edited on B']);
  await b.p.w.NXSync.syncNow();assert.deepEqual(titles(b.p),['Only on B','Shared, edited on B']);
  await b.p.flush();const tr=await b.p.w.NXSafe.trash();assert.ok(tr.some(e=>e.label==='Will be deleted'),'deleted by sync, still recoverable from the trash');a.p.close();b.p.close()});
await t('both devices edit the same note offline: they end up identical',async()=>{
  const c=cloud(),a=await device(c);addTo(a.p,'Plan');await a.p.flush();await a.p.w.NXSync.syncNow();const b=await device(c);
  a.p.ev(`D.items[0].title='Plan A';D.items[0].updated='2026-05-01T10:00:00.000Z';save()`);b.p.ev(`D.items[0].title='Plan B';D.items[0].updated='2026-05-01T11:00:00.000Z';save()`);
  await a.p.flush();await b.p.flush();await a.p.w.NXSync.syncNow();await b.p.w.NXSync.syncNow();await a.p.w.NXSync.syncNow();
  assert.deepEqual(titles(a.p),titles(b.p));assert.deepEqual(titles(a.p),['Plan B']);a.p.close();b.p.close()});
await t('a file that changed while syncing is retried, not lost',async()=>{
  const c=cloud(),a=await device(c);addTo(a.p,'One');await a.p.flush();c.hooks.failPut=2;const r=await a.p.w.NXSync.syncNow();assert.ok(r.ok);
  const b=await device(c);assert.deepEqual(titles(b.p),['One']);a.p.close();b.p.close()});
await t('edits made on screen while a sync is talking to the network are kept',async()=>{
  const c=cloud(),a=await device(c);addTo(a.p,'Base');await a.p.flush();await a.p.w.NXSync.syncNow();
  const b=await device(c);addTo(b.p,'From B');await b.p.flush();await b.p.w.NXSync.syncNow();
  c.hooks.get=async()=>{c.hooks.get=null;a.p.ev(`{const x=D.items.find(i=>i.title==='Base');x.title='Edited mid-sync';x.updated=new Date().toISOString();save()}`)};
  await a.p.w.NXSync.syncNow();assert.deepEqual(titles(a.p),['Edited mid-sync','From B']);
  await a.p.w.NXSync.syncNow();await b.p.w.NXSync.syncNow();assert.deepEqual(titles(b.p),['Edited mid-sync','From B']);a.p.close();b.p.close()});
await t('attachments travel sealed and arrive intact',async()=>{
  const c=cloud(),a=await device(c);addTo(a.p,'Photo note');
  await a.p.ev(`bput('pic1',new Blob([new Uint8Array([5,4,3,2,1])],{type:'image/jpeg'}))`);
  a.p.ev(`D.items[0].media={id:'pic1',kind:'photo',name:'p.jpg',mime:'image/jpeg'};save()`);await a.p.flush();
  const r=await a.p.w.NXSync.syncNow();assert.equal(r.media.up,1);
  assert.ok(c.files.has('m-pic1.bin'));assert.notDeepEqual([...c.files.get('m-pic1.bin').data.slice(12,17)],[5,4,3,2,1]);
  const b=await device(c);const blob=await b.p.ev(`bget('pic1')`);assert.ok(blob);assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())],[5,4,3,2,1]);a.p.close();b.p.close()});
await t('sync is refused unless encryption is on, and the sync key is sealed on disk',async()=>{
  const p=await boot(newBrowser());await assert.rejects(()=>p.w.NXSync.syncNow(),/encryption/i);p.close();
  const c=cloud(),a=await device(c);await a.p.flush();const cfgKey=a.p.w.NXSync.loadCfg().key;a.p.close();
  assert.ok(a.br.ls['nexus.sync/'].startsWith('NXE1.'));assert.ok(!JSON.stringify(a.br.ls).includes(cfgKey))});
await t('the sync setup is remembered across a lock and unlock',async()=>{
  const c=cloud(),a=await device(c);addTo(a.p,'Kept');await a.p.flush();await a.p.w.NXSync.syncNow();a.p.close();
  const q=await boot(a.br,{locked:true}),d=q.w.document;d.querySelector('#nxv-p').value=PW;d.querySelector('#nxv-f').dispatchEvent(new q.w.Event('submit',{cancelable:true,bubbles:true}));
  for(let i=0;i<300&&!q.w.__nxReady;i++)await q.sleep(20);q.w.NXSync.setTransport(c.T);
  assert.equal(q.w.NXSync.loadCfg().provider,'folder');addTo(q,'After unlock');await q.flush();const r=await q.w.NXSync.syncNow();assert.ok(r.ok&&r.pushed);
  const b=await device(c);assert.deepEqual(titles(b.p),['After unlock','Kept']);q.close();b.p.close()});
await t('Settings shows Sync according to the state, once',async()=>{
  const p=await boot(newBrowser());p.ev('A.settings()');await p.sleep(30);const d=p.w.document;
  assert.equal(d.querySelectorAll('#nx-sync').length,1);assert.ok(!d.querySelector('#nx-sy-set'));assert.ok(d.querySelector('#nx-sy-mb'));
  await p.w.NXVault.enable(PW);p.ev('A.settings()');await p.sleep(30);assert.ok(d.querySelector('#nx-sy-set'));
  const c=cloud();p.w.NXSync.setTransport(c.T);await p.w.NXSync.connect(c.T,SP,'folder',{});p.ev('A.settings()');await p.sleep(30);
  assert.equal(d.querySelectorAll('#nx-sync').length,1);assert.ok(d.querySelector('#nx-sy-now'));assert.match(d.querySelector('#nx-sy-st').textContent,/Folder\. Last synced/);p.close()});

/* ----- the folder transport, against a pretend folder ----- */
function pretendDir(){const files=new Map();let clock=1000,perm='granted';
  const notFound=()=>{const e=new Error('nf');e.name='NotFoundError';return e};
  const dir={files,
    queryPermission:async()=>perm,requestPermission:async()=>{perm='granted';return perm},setPerm:p=>{perm=p},
    async getFileHandle(name,o){if(!files.has(name)){if(!(o&&o.create))throw notFound();files.set(name,{bytes:new Uint8Array(),mod:++clock})}
      return{async getFile(){const f=files.get(name);return{lastModified:f.mod,size:f.bytes.length,async arrayBuffer(){return f.bytes.buffer.slice(f.bytes.byteOffset,f.bytes.byteOffset+f.bytes.length)}}},
        async createWritable(){let buf;return{async write(b){buf=Uint8Array.from(b)},async close(){files.set(name,{bytes:buf,mod:++clock})}}}}},
    async*entries(){for(const k of files.keys())yield[k,{}]}};
  return dir}
await t('folder transport: read, create-only, conflict detection, listing, and the permission prompt',async()=>{
  const dir=pretendDir(),T=boot0.w.NXSync.folderTransport(dir);
  assert.equal(await T.get('a'),null);const r1=await T.put('a',Uint8Array.from([1,2,3]),null);
  await assert.rejects(()=>T.put('a',Uint8Array.from([9]),null),e=>e.code==='conflict');
  const g=await T.get('a');assert.deepEqual([...g.data],[1,2,3]);assert.equal(g.rev,r1);
  const r2=await T.put('a',Uint8Array.from([4]),r1);await assert.rejects(()=>T.put('a',Uint8Array.from([5]),r1),e=>e.code==='conflict');
  assert.notEqual(r2,r1);assert.deepEqual([...(await T.list())],['a']);
  dir.setPerm('prompt');assert.deepEqual([...(await T.get('a')).data],[4]);
  dir.requestPermission=async()=>'denied';dir.setPerm('prompt');await assert.rejects(()=>T.get('a'),e=>e.code==='perm')});
await t('a full sync round trip through the folder transport',async()=>{
  const dir=pretendDir(),T=boot0.w.NXSync.folderTransport(dir),c={T};const a=await device(c);addTo(a.p,'Via folder');await a.p.flush();await a.p.w.NXSync.syncNow();
  assert.ok(dir.files.has('nexus-sync.json'));const b=await device(c);assert.deepEqual(titles(b.p),['Via folder']);a.p.close();b.p.close()});

/* ----- Dropbox, against a pretend Dropbox ----- */
function fakeDropbox(){const files=new Map();let n=0,tok=1,valid='access-1',expired=false;const log=[];
  const res=(status,body,hdr={})=>({ok:status<300,status,headers:{get:k=>hdr[k.toLowerCase()]||null},json:async()=>body,arrayBuffer:async()=>body instanceof Uint8Array?body.buffer.slice(body.byteOffset,body.byteOffset+body.length):new ArrayBuffer(0)});
  const dbx={files,log,expire(){expired=true},
    fetch:async(url,init={})=>{const h=init.headers||{};log.push(url.replace('https://',''));
      if(url.endsWith('/oauth2/token')){const p=new URLSearchParams(init.body);
        if(p.get('grant_type')==='authorization_code'){if(p.get('code')!=='GOODCODE'||!p.get('code_verifier'))return res(400,{});return res(200,{access_token:valid,refresh_token:'refresh-1',expires_in:14400})}
        if(p.get('grant_type')==='refresh_token'){if(p.get('refresh_token')!=='refresh-1')return res(400,{});valid='access-'+(++tok);expired=false;return res(200,{access_token:valid,expires_in:14400})}}
      if(expired||h.Authorization!=='Bearer '+valid)return res(401,{error_summary:'expired_access_token/'});
      const arg=h['Dropbox-API-Arg']?JSON.parse(h['Dropbox-API-Arg']):null;
      if(url.endsWith('/files/download')){const f=files.get(arg.path);if(!f)return res(409,{error_summary:'path/not_found/..'});return res(200,Uint8Array.from(f.data),{'dropbox-api-result':JSON.stringify({rev:f.rev})})}
      if(url.endsWith('/files/upload')){const f=files.get(arg.path),m=arg.mode;
        if(m==='add'&&f)return res(409,{error_summary:'path/conflict/file/..'});if(m['.tag']==='update'&&(!f||f.rev!==m.update))return res(409,{error_summary:'path/conflict/file/..'});
        const rev='r'+(++n);files.set(arg.path,{data:Uint8Array.from(init.body),rev});return res(200,{rev})}
      if(url.endsWith('/files/list_folder'))return res(200,{entries:[...files.keys()].slice(0,1).map(p=>({'.tag':'file',name:p.slice(1)})),has_more:files.size>1,cursor:'c1'});
      if(url.endsWith('/files/list_folder/continue'))return res(200,{entries:[...files.keys()].slice(1).map(p=>({'.tag':'file',name:p.slice(1)})),has_more:false});
      return res(404,{})}};return dbx}
console.log('Sync: Dropbox (against a pretend Dropbox)');
await t('Dropbox sign-in: the link carries PKCE, the code is exchanged, the address bar is cleaned',async()=>{
  const dbx=fakeDropbox(),br=newBrowser(),p0=await boot(br);p0.w.NXSync.fetch=dbx.fetch;
  const url=new URL(await p0.w.NXSync.dropboxStart('abcd1234efgh'));
  assert.equal(url.origin+url.pathname,'https://www.dropbox.com/oauth2/authorize');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('token_access_type'),'offline');
  assert.equal(url.searchParams.get('redirect_uri'),'http://localhost/');assert.equal(url.searchParams.get('client_id'),'abcd1234efgh');assert.ok(url.searchParams.get('code_challenge').length>=43);
  const st=url.searchParams.get('state'),pend=p0.w.sessionStorage.getItem('nexus.dbx/');p0.close();
  const q=await boot(br,{query:'?code=GOODCODE&state='+st,pre:w=>w.sessionStorage.setItem('nexus.dbx/',pend)});q.w.NXSync.fetch=dbx.fetch;
  const creds=await q.w.NXSync.dropboxFinish();assert.equal(creds.refresh,'refresh-1');assert.equal(creds.appKey,'abcd1234efgh');
  assert.equal(q.w.location.search,'');assert.equal(q.w.sessionStorage.getItem('nexus.dbx/'),null);
  assert.equal(await q.w.NXSync.dropboxFinish(),null);q.close()});
await t('Dropbox sign-in ignores a return with the wrong state',async()=>{
  const dbx=fakeDropbox(),br=newBrowser();const q=await boot(br,{query:'?code=GOODCODE&state=forged',pre:w=>w.sessionStorage.setItem('nexus.dbx/',JSON.stringify({state:'real',verifier:'v',appKey:'abcd1234efgh'}))});
  q.w.NXSync.fetch=dbx.fetch;assert.equal(await q.w.NXSync.dropboxFinish(),null);assert.equal(dbx.log.length,0);q.close()});
await t('Dropbox transport: download, create-only, update with the right revision, conflicts, listing with pages',async()=>{
  const dbx=fakeDropbox();boot0.w.NXSync.fetch=dbx.fetch;const cfg={dbx:{appKey:'abcd1234efgh',access:'access-1',refresh:'refresh-1',exp:Date.now()+3e6}};
  const T=boot0.w.NXSync.dropboxTransport(cfg,()=>{});
  assert.equal(await T.get('nexus-sync.json'),null);const r1=await T.put('nexus-sync.json',Uint8Array.from([1,2]),null);
  await assert.rejects(()=>T.put('nexus-sync.json',Uint8Array.from([3]),null),e=>e.code==='conflict');
  const g=await T.get('nexus-sync.json');assert.deepEqual([...g.data],[1,2]);assert.equal(g.rev,r1);
  const r2=await T.put('nexus-sync.json',Uint8Array.from([7]),r1);await assert.rejects(()=>T.put('nexus-sync.json',Uint8Array.from([8]),r1),e=>e.code==='conflict');
  await T.put('m-a.bin',Uint8Array.from([1]));assert.deepEqual([...(await T.list())].sort(),['m-a.bin','nexus-sync.json']);assert.notEqual(r1,r2)});
await t('Dropbox transport: an expired token is refreshed once and the call is retried',async()=>{
  const dbx=fakeDropbox();boot0.w.NXSync.fetch=dbx.fetch;let saved=0;const cfg={dbx:{appKey:'abcd1234efgh',access:'access-1',refresh:'refresh-1',exp:Date.now()+3e6}};
  const T=boot0.w.NXSync.dropboxTransport(cfg,()=>saved++);await T.put('x',Uint8Array.from([1]));dbx.expire();
  assert.deepEqual([...(await T.get('x')).data],[1]);assert.ok(dbx.log.some(l=>l.endsWith('/oauth2/token')));assert.ok(saved>=1);assert.equal(cfg.dbx.access,'access-2')});
await t('a full two-device sync through the pretend Dropbox',async()=>{
  const dbx=fakeDropbox(),mk=async()=>{const br=newBrowser(),p=await boot(br);await p.w.NXVault.enable(PW);p.w.NXSync.fetch=dbx.fetch;
    const cfg={dbx:{appKey:'abcd1234efgh',access:'access-1',refresh:'refresh-1',exp:Date.now()+3e6}};await p.w.NXSync.connect(p.w.NXSync.dropboxTransport(cfg,()=>{}),SP,'dropbox',{dbx:cfg.dbx});return p};
  const a=await mk();addTo(a,'Cloud note');await a.flush();await a.w.NXSync.syncNow();assert.ok(dbx.files.has('/nexus-sync.json'));
  assert.ok(!Buffer.from(dbx.files.get('/nexus-sync.json').data).toString().includes('Cloud note'));
  const b=await mk();assert.deepEqual(titles(b),['Cloud note']);addTo(b,'From B');await b.flush();await b.w.NXSync.syncNow();await a.w.NXSync.syncNow();assert.deepEqual(titles(a),['Cloud note','From B']);a.close();b.close()});

/* ----- merge a backup file ----- */
console.log('Sync: merge a backup file');
async function backupOf(items,extra={}){const br=newBrowser(),p=await boot(br);items.forEach(x=>addTo(p,x));await p.flush();
  const txt=JSON.stringify({app:'nexus',v:3,...J({items:p.ev('D.items'),projects:p.ev('D.projects'),log:[],study:[]}),media:{},...extra});p.close();return txt}
await t('merging a backup adds what is missing and never replaces what is here',async()=>{
  const txt=await backupOf(['From backup 1','From backup 2']);const p=await boot(newBrowser());addTo(p,'Already here');
  const r=await p.w.NXSync.mergeBackup(txt,()=>null);assert.equal(r.added,2);assert.deepEqual(titles(p),['Already here','From backup 1','From backup 2']);
  const again=await p.w.NXSync.mergeBackup(txt,()=>null);assert.equal(again.added,0);assert.equal(p.ev('D.items.length'),3);
  await p.flush();assert.ok((await p.w.NXSafe.snaps()).some(s=>/before merging a backup/.test(s.reason)));p.close()});
await t('an encrypted backup asks for its passphrase and a wrong one is refused',async()=>{
  const src=await boot(newBrowser());addTo(src,'Encrypted one');await src.flush();
  const plain=JSON.stringify({app:'nexus',v:3,items:J(src.ev('D.items')),projects:[],log:[],study:[],media:{}});src.close();
  const nodeCrypto=(await import('node:crypto')).webcrypto,te=new TextEncoder(),salt=nodeCrypto.getRandomValues(new Uint8Array(16)),iv=nodeCrypto.getRandomValues(new Uint8Array(12));
  const k=await nodeCrypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},await nodeCrypto.subtle.importKey('raw',te.encode('backup pass'),'PBKDF2',false,['deriveKey']),{name:'AES-GCM',length:256},false,['encrypt']);
  const enc=JSON.stringify({app:'nexus-enc',v:1,s:Buffer.from(salt).toString('base64'),i:Buffer.from(iv).toString('base64'),c:Buffer.from(await nodeCrypto.subtle.encrypt({name:'AES-GCM',iv},k,te.encode(plain))).toString('base64')});
  const p=await boot(newBrowser());await assert.rejects(()=>p.w.NXSync.mergeBackup(enc,async()=>'wrong'),/Wrong passphrase/);assert.equal(p.ev('D.items.length'),0);
  assert.equal(await p.w.NXSync.mergeBackup(enc,async()=>null),null);
  const r=await p.w.NXSync.mergeBackup(enc,async()=>'backup pass');assert.equal(r.added,1);p.close()});
await t('a file that is not a Nexus backup is refused and nothing changes',async()=>{
  const p=await boot(newBrowser());addTo(p,'Safe');for(const bad of['not json','{"app":"other"}','{"app":"nexus","items":5}'])await assert.rejects(()=>p.w.NXSync.mergeBackup(bad,()=>null),/not a Nexus backup/);
  assert.deepEqual(titles(p),['Safe']);p.close()});
await t('attachments in a backup come along when merged',async()=>{
  const txt=JSON.stringify({app:'nexus',v:3,items:[it('m',{title:'With file',media:{id:'f1',kind:'file',name:'a.bin',mime:'application/octet-stream'}})],projects:[],log:[],study:[],media:{f1:{t:'application/octet-stream',d:Buffer.from([7,7,7]).toString('base64')}}});
  const p=await boot(newBrowser());const r=await p.w.NXSync.mergeBackup(txt,()=>null);assert.equal(r.files,1);
  const b=await p.ev(`bget('f1')`);assert.deepEqual([...new Uint8Array(await b.arrayBuffer())],[7,7,7]);p.close()});
await t('the Merge a backup file button is in Settings with or without encryption',async()=>{
  const p=await boot(newBrowser());p.ev('A.settings()');await p.sleep(30);assert.ok(p.w.document.querySelector('#nx-sy-mb'));assert.ok(p.w.document.querySelector('#nx-sy-fi'));p.close()});
boot0.close();
