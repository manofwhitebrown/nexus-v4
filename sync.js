/* Nexus sync (Phase 4b and 4c). Loaded last. No server and no Nexus account.
   1. A merge that combines two copies of your data record by record (and field by field), so edits made on two
      devices both survive, and deletions travel only when nothing else changed.
   2. One encrypted sync file, plus one encrypted file per attachment, kept in a place you choose:
        - a folder on this device (any synced folder works: Dropbox, Drive, Syncthing, a USB stick), or
        - your own Dropbox, through its App folder.
      Files are sealed with a key made from a sync passphrase before they leave the device.
   3. "Merge a backup file": combine a Nexus backup (plain or encrypted) into what is here, without replacing it.
   Sync needs encryption at rest to be on, because the sync key is stored inside the vault. */
(()=>{
'use strict';
const V=window.NXVault;if(!V)return;
const NS=V.NS,CFG='nexus.sync'+NS,MAIN='nexus-sync.json',DBN='nexus-sync'+NS,KDF_N=600000,AAD='nexus-sync-v1',MAAD='nexus-sync-media';

/* ================= 1. the merge ================= */
const sj=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().reduce((o,n)=>(o[n]=x[n],o),{}):x);
const eq=(a,b)=>sj(a)===sj(b);
const isRec=e=>!!e&&typeof e==='object'&&!Array.isArray(e)&&typeof e.id==='string';
const collLike=x=>Array.isArray(x)&&x.length>0&&x.every(isRec);
const emptyArr=x=>Array.isArray(x)&&x.length===0;
const bigger=(a,b)=>sj(a)>sj(b);
const PLAIN={newer:bigger};
const ITEM={newer:(a,b)=>{const x=String(a.updated||''),y=String(b.updated||'');return x!==y?x>y:bigger(a,b)}};
const sched=c=>{const f=c.fs||{};return String(f.l||'')+'|'+String(f.n||0).padStart(6,'0')+'|'+String(c.due||'')};
const CARD={newer:bigger,groups:{box:'s',due:'s',fs:'s'},groupWin:(a,b)=>{const x=sched(a),y=sched(b);return x!==y?x>y:bigger(a,b)}};
const SUBJ={newer:bigger,child:{cards:CARD}};

/* l = this device, r = the other copy, b = the state both agreed on last time (or null) */
function mergeRec(l,r,b,o){
  if(!l&&!r)return null;
  if(l&&!r)return b&&eq(l,b)?null:l;          /* gone on the other side and untouched here: deleted. Edited here: keep it */
  if(!l&&r)return b&&eq(r,b)?null:r;
  if(eq(l,r))return l;
  if(b){if(eq(l,b))return r;if(eq(r,b))return l}
  return mergeFields(l,r,b,o)}
function mergeColl(l,r,b,o){
  const L=l||[],R=r||[],B=b||[],idx=a=>{const m=new Map();a.forEach(e=>{if(isRec(e)&&!m.has(e.id))m.set(e.id,e)});return m};
  const lm=idx(L),rm=idx(R),bm=idx(B),out=[],seen=new Set();
  for(const e of L.concat(R)){if(!isRec(e)||seen.has(e.id))continue;seen.add(e.id);const m=mergeRec(lm.get(e.id),rm.get(e.id),bm.get(e.id),o);if(m)out.push(m)}
  return out}
function mergeFields(l,r,b,o){
  const keys=new Set(Object.keys(l).concat(Object.keys(r))),out={},win=o.newer(l,r)?l:r,G=o.groups||{},gk={},done=new Set();
  Object.keys(G).forEach(k=>(gk[G[k]]=gk[G[k]]||[]).push(k));
  for(const k of keys){
    if(G[k]){if(done.has(G[k]))continue;done.add(G[k]);
      const ks=gk[G[k]],chL=!b||ks.some(x=>!eq(l[x],b[x])),chR=!b||ks.some(x=>!eq(r[x],b[x]));
      const from=ks.every(x=>eq(l[x],r[x]))?l:chL&&!chR?l:chR&&!chL?r:o.groupWin(l,r)?l:r;
      ks.forEach(x=>{if(x in from)out[x]=from[x]});continue}
    const vl=l[k],vr=r[k],vb=b?b[k]:undefined;let v;
    if(eq(vl,vr))v=vl;
    else if(b&&eq(vl,vb))v=vr;
    else if(b&&eq(vr,vb))v=vl;
    else if((collLike(vl)&&(collLike(vr)||vr===undefined||emptyArr(vr)))||(collLike(vr)&&(vl===undefined||emptyArr(vl))))v=mergeColl(vl,vr,vb,(o.child&&o.child[k])||PLAIN);
    else v=win===l?vl:vr;
    if(v!==undefined)out[k]=v}
  return out}
function mergeLog(l,r){const m=new Map();(l||[]).concat(r||[]).forEach(e=>{if(e&&typeof e==='object')m.set(sj(e),e)});return[...m.values()].sort((a,b)=>String(a.t).localeCompare(String(b.t))||(sj(a)<sj(b)?-1:1)).slice(-400)}
const arr=x=>Array.isArray(x)?x:[];
function merge(L,R,B){
  const out={items:mergeColl(arr(L.items),arr(R.items),B&&arr(B.items),ITEM),projects:mergeColl(arr(L.projects),arr(R.projects),B&&arr(B.projects),PLAIN),
    study:mergeColl(arr(L.study),arr(R.study),B&&arr(B.study),SUBJ),rules:mergeColl(arr(L.rules),arr(R.rules),B&&arr(B.rules),PLAIN),log:mergeLog(L.log,R.log)};
  if(out.items.length>5000)throw new Error('Together these hold more than 5,000 items, which is Nexus\'s limit. Delete some items on one device and try again.');
  return out}
/* anything that is not an object with an id is dropped, so one bad record can never break the app */
const TYPES=['note','task','link','idea'];
function clean(d){d=d&&typeof d==='object'?d:{};
  return{items:arr(d.items).filter(x=>isRec(x)&&TYPES.includes(x.type)),projects:arr(d.projects).filter(x=>isRec(x)&&typeof x.name==='string'),
    study:arr(d.study).filter(x=>isRec(x)&&typeof x.name==='string'&&Array.isArray(x.cards)).map(s=>({...s,cards:s.cards.filter(c=>isRec(c)&&typeof c.q==='string'&&typeof c.a==='string')})),
    rules:arr(d.rules).filter(x=>isRec(x)&&typeof x.name==='string'),
    log:arr(d.log).filter(x=>x&&typeof x==='object'&&x.t&&x.k)}}
const snapshot=()=>JSON.parse(JSON.stringify({items:D.items,projects:D.projects,study:D.study,rules:D.rules||[],log:D.log}));

/* ================= 2. bytes and crypto ================= */
const te=new TextEncoder(),td=new TextDecoder(),rnd=n=>crypto.getRandomValues(new Uint8Array(n));
const b64=u=>{u=u instanceof Uint8Array?u:new Uint8Array(u);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)};
const ub64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const fail=(m,code)=>{const e=new Error(m);if(code)e.code=code;return e};
const deriveRaw=async(pass,salt,n)=>new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:n,hash:'SHA-256'},await crypto.subtle.importKey('raw',te.encode(String(pass).normalize('NFKC')),'PBKDF2',false,['deriveBits']),256));
const keyOf=raw=>crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
async function seal(key,bytes,aad){const iv=rnd(12);return{iv,ct:new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:te.encode(aad)},key,bytes))}}
const open=(key,iv,ct,aad)=>crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:te.encode(aad)},key,ct).then(b=>new Uint8Array(b));
async function packMain(cfg,data,rev){
  const o=await seal(await keyOf(ub64(cfg.key)),te.encode(JSON.stringify({D:data})),AAD);
  return te.encode(JSON.stringify({app:'nexus-sync',v:1,kdf:{h:'SHA-256',n:KDF_N,s:cfg.salt},rev,t:new Date().toISOString(),by:cfg.dev,i:b64(o.iv),c:b64(o.ct)}))}
function header(bytes){let h;try{h=JSON.parse(td.decode(bytes))}catch(e){throw fail('That is not a Nexus sync file.')}
  if(!h||h.app!=='nexus-sync'||!h.kdf||typeof h.c!=='string')throw fail('That is not a Nexus sync file.');
  if(h.v>1)throw fail('This sync file was made by a newer Nexus. Update Nexus first.');return h}
async function unpackMain(cfg,bytes){
  const h=header(bytes);if(cfg.salt&&h.kdf.s!==cfg.salt)throw fail('The synced copy was started with a different sync passphrase. Set up sync again and enter that passphrase.','rekey');
  let plain;try{plain=await open(await keyOf(ub64(cfg.key)),ub64(h.i),ub64(h.c),AAD)}catch(e){throw fail('Wrong sync passphrase, or the synced file is damaged.','badkey')}
  return{h,D:clean(JSON.parse(td.decode(plain)).D)}}
const mediaName=id=>'m-'+String(id).replace(/[^\w-]/g,'')+'.bin';

/* ================= 3. config and the agreed state (both stay sealed) ================= */
const loadCfg=()=>{try{const r=localStorage.getItem(CFG);return r?JSON.parse(r):null}catch(e){return null}};
const saveCfg=c=>{localStorage.setItem(CFG,JSON.stringify(c))};
const idb=()=>new Promise((res,rej)=>{const r=indexedDB.open(DBN,1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
async function kv(op,k,v){const d=await idb();try{return await new Promise((res,rej)=>{const t=d.transaction('kv',op==='get'?'readonly':'readwrite'),s=t.objectStore('kv'),q=op==='get'?s.get(k):op==='set'?s.put(v,k):s.delete(k);t.oncomplete=()=>res(q.result);t.onerror=()=>rej(t.error)})}finally{d.close()}}
const loadBase=async()=>{try{const r=await kv('get','base');return r?JSON.parse(await V.open(r,'syncbase')):null}catch(e){return null}};
const saveBase=async d=>{await kv('set','base',await V.seal(JSON.stringify(d),'syncbase'))};
const clearBase=()=>kv('del','base').catch(()=>{});

/* ================= 4. places to keep the files ================= */
/* every transport: get(name)->{data,rev}|null, put(name,bytes,expectedRev)->rev (expectedRev null = must not exist,
   undefined = overwrite), list()->Set of names. A changed file throws an error with code 'conflict'. */
function folderTransport(dir){
  const missing=e=>e&&(e.name==='NotFoundError'||e.code===8);
  const revOf=f=>f.lastModified+':'+f.size;
  const perm=async()=>{if(dir.queryPermission&&(await dir.queryPermission({mode:'readwrite'}))==='granted')return;
    if(dir.requestPermission&&(await dir.requestPermission({mode:'readwrite'}))==='granted')return;throw fail('Nexus needs permission to use the sync folder. Tap Sync now to allow it.','perm')};
  const cur=async name=>{try{const h=await dir.getFileHandle(name),f=await h.getFile();return{h,f}}catch(e){if(missing(e))return null;throw e}};
  return{name:'folder',
    async get(name){await perm();const c=await cur(name);return c?{data:new Uint8Array(await c.f.arrayBuffer()),rev:revOf(c.f)}:null},
    async put(name,bytes,expect){await perm();const c=await cur(name);
      if(expect!==undefined){if((expect===null)!==!c||(c&&revOf(c.f)!==expect))throw fail('The synced file changed while syncing.','conflict')}
      const h=c?c.h:await dir.getFileHandle(name,{create:true}),w=await h.createWritable();await w.write(bytes);await w.close();return revOf(await h.getFile())},
    async list(){await perm();const s=new Set();for await(const [n] of dir.entries())s.add(n);return s}}}

function dropboxTransport(cfg,save){
  const F=()=>(NXSync.fetch||window.fetch).bind(window);
  async function token(force){
    const d=cfg.dbx;if(!d||!d.refresh)throw fail('Dropbox is not connected. Set up sync again.','auth');
    if(!force&&d.access&&d.exp>Date.now()+60000)return d.access;
    const r=await F()('https://api.dropboxapi.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:d.refresh,client_id:d.appKey}).toString()});
    if(!r.ok)throw fail('Dropbox sign-in expired. Set up sync again.','auth');
    const j=await r.json();d.access=j.access_token;d.exp=Date.now()+(j.expires_in||14400)*1000;save();return d.access}
  async function call(url,init,retry){
    const r=await F()(url,{...init,headers:{...init.headers,Authorization:'Bearer '+await token(retry)}});
    if(r.status===401&&!retry)return call(url,init,true);
    if(r.status===429)throw fail('Dropbox asked Nexus to slow down. Try again in a minute.','busy');
    return r}
  const arg=o=>JSON.stringify(o).replace(/[\u007f-\uffff]/g,c=>'\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4));
  const sum=async r=>{try{return(await r.json()).error_summary||''}catch(e){return''}};
  return{name:'dropbox',
    async get(name){const r=await call('https://content.dropboxapi.com/2/files/download',{method:'POST',headers:{'Dropbox-API-Arg':arg({path:'/'+name})}});
      if(r.status===409){const s=await sum(r);if(/not_found/.test(s))return null;throw fail('Dropbox said: '+s)}
      if(!r.ok)throw fail('Dropbox error '+r.status+'.');
      let rev='';try{rev=JSON.parse(r.headers.get('dropbox-api-result')).rev}catch(e){}
      return{data:new Uint8Array(await r.arrayBuffer()),rev}},
    async put(name,bytes,expect){const mode=expect===undefined?'overwrite':expect===null?'add':{'.tag':'update',update:expect};
      const r=await call('https://content.dropboxapi.com/2/files/upload',{method:'POST',headers:{'Dropbox-API-Arg':arg({path:'/'+name,mode,autorename:false,mute:true}),'Content-Type':'application/octet-stream'},body:bytes});
      if(r.status===409){const s=await sum(r);if(/conflict/.test(s))throw fail('The synced file changed while syncing.','conflict');throw fail('Dropbox said: '+s)}
      if(!r.ok)throw fail('Dropbox error '+r.status+'.');return(await r.json()).rev},
    async list(){const s=new Set();let r=await call('https://api.dropboxapi.com/2/files/list_folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'',limit:2000})});
      for(;;){if(r.status===409){const t=await sum(r);if(/not_found/.test(t))return s;throw fail('Dropbox said: '+t)}if(!r.ok)throw fail('Dropbox error '+r.status+'.');
        const j=await r.json();(j.entries||[]).forEach(e=>{if(e['.tag']==='file')s.add(e.name)});if(!j.has_more)return s;
        r=await call('https://api.dropboxapi.com/2/files/list_folder/continue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cursor:j.cursor})})}}}}

/* signing in to Dropbox: authorization code with PKCE, no secret, no server */
const b64u=u=>b64(u).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const redirectUri=()=>location.origin+location.pathname;
async function dropboxStart(appKey){
  appKey=String(appKey||'').trim();if(!/^[a-z0-9]{8,30}$/i.test(appKey))throw fail('That does not look like a Dropbox app key.');
  const verifier=b64u(rnd(48)),state=b64u(rnd(16)),chal=b64u(new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(verifier))));
  sessionStorage.setItem('nexus.dbx'+NS,JSON.stringify({state,verifier,appKey}));
  return'https://www.dropbox.com/oauth2/authorize?'+new URLSearchParams({client_id:appKey,response_type:'code',code_challenge:chal,code_challenge_method:'S256',redirect_uri:redirectUri(),state,token_access_type:'offline'})}
async function dropboxFinish(){
  const q=new URLSearchParams(location.search),code=q.get('code'),st=q.get('state');if(!code||!st)return null;
  let p;try{p=JSON.parse(sessionStorage.getItem('nexus.dbx'+NS))}catch(e){}
  if(!p||p.state!==st)return null;
  sessionStorage.removeItem('nexus.dbx'+NS);try{history.replaceState(null,'',location.pathname+location.hash)}catch(e){}
  const r=await(NXSync.fetch||window.fetch).call(window,'https://api.dropboxapi.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,client_id:p.appKey,code_verifier:p.verifier,redirect_uri:redirectUri()}).toString()});
  if(!r.ok)throw fail('Dropbox did not accept the sign-in. Try again.');
  const j=await r.json();if(!j.refresh_token)throw fail('Dropbox did not give long-term access. In the Dropbox app console, allow offline access.');
  return{appKey:p.appKey,access:j.access_token,refresh:j.refresh_token,exp:Date.now()+(j.expires_in||14400)*1000}}

/* ================= 5. sync ================= */
let T_OVERRIDE=null,running=false,again=false,lastErr='';
async function transportFor(cfg){
  if(T_OVERRIDE)return T_OVERRIDE;
  if(cfg.provider==='folder'){const h=await kv('get','folder');if(!h)throw fail('The sync folder is not set. Set up sync again.');return folderTransport(h)}
  if(cfg.provider==='dropbox')return dropboxTransport(cfg,()=>{try{saveCfg(cfg)}catch(e){}});
  throw fail('Sync is not set up.')}
const readBlob=async b=>b.arrayBuffer?new Uint8Array(await b.arrayBuffer()):new Uint8Array(await new Promise((res,rej)=>{const f=new FileReader();f.onload=()=>res(f.result);f.onerror=()=>rej(f.error);f.readAsArrayBuffer(b)}));
async function syncMedia(T,M,key){
  const refs=M.items.filter(i=>i.media&&i.media.id).map(i=>i.media);
  if(!refs.length)return{up:0,down:0,missing:0};
  const names=await T.list();let up=0,down=0,missing=0;
  for(const m of refs){
    try{const local=await bget(m.id),n=mediaName(m.id),has=names.has(n);
      if(local&&!has){const o=await seal(key,await readBlob(local),MAAD),b=new Uint8Array(12+o.ct.length);b.set(o.iv);b.set(o.ct,12);await T.put(n,b);up++}
      else if(!local&&has){const r=await T.get(n);if(!r){missing++;continue}const bytes=await open(key,r.data.slice(0,12),r.data.slice(12),MAAD);await bput(m.id,new Blob([bytes],{type:m.mime||''}));down++}
      else if(!local)missing++}
    catch(e){missing++}}
  return{up,down,missing}}
function apply(next){D=next;save();try{render()}catch(e){}}
async function syncNow(){
  if(!V.active())throw fail('Turn on encryption first. Sync keeps its key inside the encrypted vault.');
  const cfg=loadCfg();if(!cfg||!cfg.key)throw fail('Sync is not set up.');
  if(running){again=true;return{busy:true}}
  running=true;
  try{
    const T=await transportFor(cfg),key=await keyOf(ub64(cfg.key));
    for(let attempt=0;attempt<5;attempt++){
      const rem=await T.get(MAIN);let R=null,rev=0;
      if(rem){const u=await unpackMain(cfg,rem.data);R=u.D;rev=u.h.rev||0}
      const L=snapshot(),B=await loadBase(),M=R?merge(L,R,B):L;
      const mstat=await syncMedia(T,M,key);
      const changed=!R||!eq(M,R);
      if(changed){
        try{await T.put(MAIN,await packMain(cfg,M,rev+1),rem?rem.rev:null)}
        catch(e){if(e.code==='conflict')continue;throw e}}
      /* what is on screen may have changed while we were talking to the network: keep those edits */
      const now=snapshot(),final=merge(now,M,L);
      let pulled=false;if(!eq(final,now)){pulled=true;apply(final)}
      await saveBase(M);cfg.last=new Date().toISOString();saveCfg(cfg);await V.flush();lastErr='';
      return{ok:true,pulled,pushed:changed,media:mstat}}
    throw fail('Another device kept changing the synced file. Try again in a moment.')}
  finally{running=false;if(again){again=false;schedule(1500)}}}
async function connect(T,pass,provider,extra){
  if(!V.active())throw fail('Turn on encryption first.');
  if(String(pass||'').normalize('NFKC').length<8)throw fail('Use at least 8 characters for the sync passphrase.');
  const old=loadCfg()||{},rem=await T.get(MAIN);let salt,raw;
  if(rem){const h=header(rem.data);raw=await deriveRaw(pass,ub64(h.kdf.s),h.kdf.n);salt=h.kdf.s;await unpackMain({key:b64(raw),salt},rem.data)}
  else{const s=rnd(16);salt=b64(s);raw=await deriveRaw(pass,s,KDF_N)}
  const cfg={...extra,dev:old.dev||b64(rnd(6)).replace(/[^\w]/g,''),salt,key:b64(raw),provider,auto:old.auto!==false,last:null};
  saveCfg(cfg);await V.flush();await clearBase();return syncNow()}
async function disconnect(){try{await kv('del','folder')}catch(e){}await clearBase();try{localStorage.removeItem(CFG)}catch(e){}await V.flush()}

/* ================= 6. merge a backup file ================= */
async function decBackup(o,pw){
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:ub64(o.s),iterations:210000,hash:'SHA-256'},await crypto.subtle.importKey('raw',te.encode(pw),'PBKDF2',false,['deriveKey']),{name:'AES-GCM',length:256},false,['decrypt']);
  return td.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:ub64(o.i)},key,ub64(o.c)))}
async function mergeBackup(text,askPass){
  let r;try{r=JSON.parse(text)}catch(e){throw fail('That is not a Nexus backup file.')}
  if(r&&r.app==='nexus-enc'){const pw=await askPass();if(!pw)return null;try{r=JSON.parse(await decBackup(r,pw))}catch(e){throw fail('Wrong passphrase or damaged file.')}}
  if(!r||r.app!=='nexus'||!Array.isArray(r.items))throw fail('That is not a Nexus backup file.');
  const R=clean(r),L=snapshot(),M=merge(L,R,null);
  const have=new Set(L.items.map(i=>i.id)),addedItems=M.items.filter(i=>!have.has(i.id)).length;
  const mm=r.media&&typeof r.media==='object'?r.media:{};let files=0;
  for(const i of M.items){const id=i.media&&i.media.id,x=id&&mm[id];if(!x||typeof x.d!=='string')continue;
    try{if(!(await bget(id))){await bput(id,new Blob([ub64(x.d)],{type:String(x.t||'')}));files++}}catch(e){i.media=null}}
  try{if(window.NXSafe)await window.NXSafe.snapAdd(JSON.stringify(L),'before merging a backup')}catch(e){}
  apply(M);return{added:addedItems,total:M.items.length,files}}

/* ================= 7. automatic sync ================= */
let timer=0;
function schedule(ms){clearTimeout(timer);timer=setTimeout(()=>run(true),ms)}
async function run(silent){
  try{const r=await syncNow();if(!silent&&r&&!r.busy)say(r.pulled?'Synced. New changes arrived.':r.pushed?'Synced. Your changes were sent.':'Already up to date.');return r}
  catch(e){lastErr=String(e&&e.message||e);if(!silent)say(lastErr);else if(typeof toast==='function'&&e.code!=='perm'&&!run.warned){run.warned=1;toast('Sync problem: '+lastErr)}refresh()}}
const say=m=>{if(typeof toast==='function')toast(m);refresh()};
window.addEventListener('nx-saved',()=>{const c=loadCfg();if(c&&c.auto&&!running)schedule(20000)});
let hiddenAt=0;
document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenAt=Date.now();return}
  const c=loadCfg();if(c&&c.auto&&Date.now()-Math.max(hiddenAt,Date.parse(c.last||0)||0)>120000)schedule(1500)});

/* ================= 8. Settings ================= */
const esc=V.esc,fmt=t=>t?new Date(t).toLocaleString([], {dateStyle:'medium',timeStyle:'short'}):'never';
const dlgEl=()=>document.getElementById('dlg');
function refresh(){const d=dlgEl(),s=d&&d.querySelector('#nx-sy-st');if(s)s.textContent=statusText()}
function statusText(){const c=loadCfg();if(!c||!c.key)return'';return(c.provider==='dropbox'?'Dropbox':'Folder')+'. Last synced '+fmt(c.last)+'.'+(lastErr?' Problem: '+lastErr:'')}
function inject(d){
  const wp=d.querySelector('#wp');if(!wp||d.querySelector('#nx-sync'))return;
  const row=wp.closest('.row2'),h=row&&row.previousElementSibling,sec=document.createElement('div');sec.id='nx-sync';
  const on=V.active(),c=on?loadCfg():null;
  sec.innerHTML='<h2>Sync</h2>'+(!on?'<p class="mu">Sync keeps your devices in step through a place you choose, using a key kept inside the encrypted vault. Turn on Encryption first.</p>'
    :!c||!c.key?'<p class="mu">Keep this device and others in step through a folder or your own Dropbox. Everything is encrypted on the device before it leaves. Nexus has no server and no account.</p><div class="row2"><button class="btn p" id="nx-sy-set">Set up sync</button></div>'
    :`<p class="mu" id="nx-sy-st">${esc(statusText())}</p><div class="row2"><button class="btn p" id="nx-sy-now">Sync now</button><button class="btn" id="nx-sy-auto" aria-pressed="${c.auto!==false}">Auto: ${c.auto!==false?'on':'off'}</button></div><div class="row2"><button class="btn d" id="nx-sy-off">Turn off sync</button></div>`)
    +'<div class="row2"><button class="btn" id="nx-sy-mb">Merge a backup file</button></div><small class="mu">Merging adds what a backup has to what is here. It never replaces your data.</small><input type="file" id="nx-sy-fi" accept=".json,application/json" hidden>';
  (h&&h.tagName==='H2'?h:row).before(sec);
  const q=s=>sec.querySelector(s);
  if(q('#nx-sy-set'))q('#nx-sy-set').onclick=setupSheet;
  if(q('#nx-sy-now'))q('#nx-sy-now').onclick=async e=>{e.target.disabled=true;await run(false);e.target.disabled=false};
  if(q('#nx-sy-auto'))q('#nx-sy-auto').onclick=()=>{const x=loadCfg();x.auto=x.auto===false;saveCfg(x);const b=q('#nx-sy-auto');b.setAttribute('aria-pressed',x.auto);b.textContent='Auto: '+(x.auto?'on':'off')};
  if(q('#nx-sy-off'))q('#nx-sy-off').onclick=async()=>{if(!confirm('Stop syncing on this device? Your data here stays. Files already in your folder or Dropbox are not deleted.'))return;await disconnect();toast('Sync is off');settings()};
  q('#nx-sy-mb').onclick=()=>q('#nx-sy-fi').click();
  q('#nx-sy-fi').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(f.size>120e6){toast('That file is too large.');return}
    try{const r=await mergeBackup(await f.text(),()=>askPass('Backup passphrase'));if(r)toast(r.added?'Merged. '+r.added+' new item'+(r.added===1?'':'s')+' added.':'Merged. Nothing new to add.')}catch(x){toast(String(x.message||x))}}}
function askPass(title){return new Promise(res=>{
  sheet(`<form id="nx-ap" autocomplete="off"><h2 style="margin:0">${esc(title)}</h2><label><span>Passphrase</span><input id="nx-ap1" type="password" autocomplete="off"></label><div class="row2"><button class="btn p" type="submit">Continue</button><button class="btn" type="button" id="nx-apx">Cancel</button></div></form>`);
  dlg.querySelector('#nx-ap').onsubmit=e=>{e.preventDefault();const v=dlg.querySelector('#nx-ap1').value;dlg.close();res(v)};dlg.querySelector('#nx-apx').onclick=()=>{dlg.close();res(null)}})}
const canFolder=()=>typeof window.showDirectoryPicker==='function',canDropbox=()=>!window.NexusNative;
function setupSheet(){
  const opts=[canFolder()?['folder','A folder on this device']:null,canDropbox()?['dropbox','Dropbox']:null].filter(Boolean);
  if(!opts.length){toast('Cloud sync is not available in this app. Use Merge a backup file to combine devices.');return}
  let prov=opts[0][0];
  const draw=()=>{sheet(`<form id="nx-su" autocomplete="off"><h2 style="margin:0">Set up sync</h2><p class="mu">Choose where the encrypted files live.</p><div class="chips" id="nx-pv">${opts.map(([k,l])=>`<button type="button" class="chip" data-v="${k}" aria-pressed="${k===prov}">${l}</button>`).join('')}</div>
    ${prov==='dropbox'?`<p class="mu">Create a free app at dropbox.com/developers/apps with "App folder" access and the files.content.read and files.content.write permissions. Add <b>${esc(redirectUri())}</b> as a redirect URI, then paste its App key here.</p><label><span>Dropbox app key</span><input id="nx-key" autocomplete="off" spellcheck="false"></label>`
      :'<p class="mu">Pick a folder. If it is inside Dropbox, Drive, OneDrive or Syncthing, that service carries the encrypted files between your devices.</p>'}
    <label><span>Sync passphrase (8 or more characters)</span><input id="nx-p1" type="password" autocomplete="new-password"></label><label><span>Type it again</span><input id="nx-p2" type="password" autocomplete="new-password"></label><p class="mu">Use the same sync passphrase on every device. It is not stored; a key made from it is kept inside the vault.</p><p class="late" id="nx-m" role="alert"></p>
    <div class="row2"><button class="btn p" type="submit" id="nx-go">${prov==='dropbox'?'Continue to Dropbox':'Choose folder'}</button><button class="btn" type="button" id="nx-x">Cancel</button></div></form>`);
    const $$=s=>dlg.querySelector(s),m=t=>{$$('#nx-m').textContent=t};
    $$('#nx-pv').onclick=e=>{const b=e.target.closest('[data-v]');if(b){prov=b.dataset.v;draw()}};
    $$('#nx-x').onclick=()=>{dlg.close();setTimeout(()=>settings(),80)};
    $$('#nx-su').onsubmit=async e=>{e.preventDefault();const p1=$$('#nx-p1').value;
      if(p1.normalize('NFKC').length<8){m('Use at least 8 characters.');return}if(p1!==$$('#nx-p2').value){m('The two passphrases are not the same.');return}
      const b=$$('#nx-go');b.disabled=true;
      try{
        if(prov==='folder'){const h=await window.showDirectoryPicker({mode:'readwrite'});await kv('set','folder',h);m('Connecting...');const r=await connect(folderTransport(h),p1,'folder',{});done(r)}
        else{const url=await dropboxStart($$('#nx-key').value);sessionStorage.setItem('nexus.dbxp'+NS,p1);location.assign(url)}}
      catch(x){if(x&&x.name==='AbortError'){b.disabled=false;return}m(String(x.message||x));b.disabled=false}}};
  draw()}
function done(r){dlg.close();toast(r&&r.pulled?'Sync is on. Data from your other device arrived.':'Sync is on.');setTimeout(()=>settings(),80)}
/* back from Dropbox: finish signing in, then connect with the passphrase typed before leaving */
async function afterDropbox(){
  let creds;try{creds=await dropboxFinish()}catch(e){toast(String(e.message||e));return}
  if(!creds){try{sessionStorage.removeItem('nexus.dbxp'+NS)}catch(e){}return}
  const pass=sessionStorage.getItem('nexus.dbxp'+NS);sessionStorage.removeItem('nexus.dbxp'+NS);
  try{const p=pass||await askPass('Sync passphrase');if(!p)return;const cfg={dbx:creds};
    const r=await connect(dropboxTransport(cfg,()=>{}),p,'dropbox',{dbx:creds});toast(r&&r.pulled?'Sync is on. Data from your other device arrived.':'Sync is on.')}
  catch(e){toast(String(e.message||e))}}

/* ================= start ================= */
const NXSync=window.NXSync={merge,clean,sj,syncNow,connect,disconnect,loadCfg,mergeBackup,folderTransport,dropboxTransport,dropboxStart,dropboxFinish,
  setTransport:t=>{T_OVERRIDE=t},fetch:null,status:()=>({running,lastErr}),redirectUri};
const d0=dlgEl();if(d0)new MutationObserver(()=>inject(d0)).observe(d0,{childList:true});
setTimeout(()=>{if(!V.active())return;afterDropbox().then(()=>{const c=loadCfg();if(c&&c.auto)schedule(1500)})},300);
})();
