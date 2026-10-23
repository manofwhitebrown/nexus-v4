/* Nexus vault (Phase 4a: encryption at rest). A plain script, first in <head>. Nothing else runs before it.

   What it does
   1. Optional passphrase encryption of everything Nexus keeps on this device: your data, the IndexedDB
      safe copy, restore points, the trash, attachments, API keys and the sync settings.
   2. An unlock screen. Every other script is loaded only after unlock, so the app never sees locked data.
   3. Keys: a random data key (AES-GCM 256) is wrapped twice, once by your passphrase (PBKDF2-SHA256,
      600,000 rounds) and once by a recovery key shown a single time. Changing the passphrase re-wraps the
      small key, it does not re-encrypt your data.
   4. Moves existing data into and out of encryption safely: every record says whether it is sealed, so an
      interrupted move simply resumes at the next unlock.
   Protected localStorage keys are kept in memory as plain text while unlocked and written sealed.
   Forget the passphrase and lose the recovery key and nothing can bring the data back. */
(()=>{
'use strict';
const NS=location.pathname.replace(/[^\/]*$/,''),K='nexus.data'+NS,META='nexus.vault'+NS;
let S=null;try{S=window.localStorage}catch(e){}
const P=S?Object.getPrototypeOf(S):null;
const rawGet=P&&P.getItem,rawSet=P&&P.setItem,rawRem=P&&P.removeItem;
const g=k=>{try{return rawGet.call(S,k)}catch(e){return null}};
const put=(k,v)=>{try{rawSet.call(S,k,v);return true}catch(e){return false}};
const del=k=>{try{rawRem.call(S,k)}catch(e){}};

/* ---------- 0. this app was called "v2" in its storage key; it is Nexus 3.3. Move the data across once ---------- */
if(S){
  const mv=(a,b)=>{const v=g(a);if(v===null)return;if(g(b)===null)put(b,v);if(g(b)===v)del(a)};
  mv('nexus.v2'+NS,K);mv('nexus.v2'+NS+'.stale',K+'.stale');
  /* AI keys used to be shared by every copy of Nexus on a site; give each copy its own */
  const ai='nexus.ai.v1';if(g(ai)!==null&&g(ai+NS)===null)put(ai+NS,g(ai));
}

/* ---------- 1. state ---------- */
const meta=()=>{try{const m=JSON.parse(g(META));return m&&typeof m==='object'&&m.v===1?m:null}catch(e){return null}};
let M=S?meta():null,dek=null,unlocked=false;
const isOn=()=>!!(M&&M.on),active=()=>isOn()&&unlocked&&!!dek,sealing=()=>active()&&M.mig!==2;
const PROT=new Set([K,'nexus.ai.v1'+NS,'nexus.key'+NS,'nexus.key','nexus.sync'+NS]);
const mem=Object.create(null),pend=new Map();
const KDF_N=600000,RK_N=100000;

/* ---------- 2. byte helpers ---------- */
const te=new TextEncoder(),td=new TextDecoder(),sub=()=>crypto.subtle,rnd=n=>crypto.getRandomValues(new Uint8Array(n));
const toB64=u=>{u=u instanceof Uint8Array?u:new Uint8Array(u);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)};
const fromB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const bytesOf=async b=>b.arrayBuffer?new Uint8Array(await b.arrayBuffer()):new Uint8Array(await new Promise((res,rej)=>{const f=new FileReader();f.onload=()=>res(f.result);f.onerror=()=>rej(f.error);f.readAsArrayBuffer(b)}));
const norm=s=>String(s).normalize('NFKC');

/* ---------- 3. crypto ---------- */
const kdf=async(secret,salt,n)=>sub().deriveKey({name:'PBKDF2',salt,iterations:n,hash:'SHA-256'},await sub().importKey('raw',te.encode(norm(secret)),'PBKDF2',false,['deriveKey']),{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
const aes=async(key,bytes,ctx)=>{const iv=rnd(12);return{iv,ct:new Uint8Array(await sub().encrypt({name:'AES-GCM',iv,additionalData:te.encode(ctx)},key,bytes))}};
const unaes=async(key,iv,ct,ctx)=>new Uint8Array(await sub().decrypt({name:'AES-GCM',iv,additionalData:te.encode(ctx)},key,ct));
const wrap=async(kek,raw,ctx)=>{const o=await aes(kek,raw,ctx);return{i:toB64(o.iv),c:toB64(o.ct)}};
const unwrap=(kek,w,ctx)=>unaes(kek,fromB64(w.i),fromB64(w.c),ctx);
const importDek=raw=>sub().importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
const SEAL='NXE1.';
const isSealed=v=>typeof v==='string'&&v.startsWith(SEAL);
async function seal(str,ctx){const o=await aes(dek,te.encode(str),ctx),b=new Uint8Array(12+o.ct.length);b.set(o.iv);b.set(o.ct,12);return SEAL+toB64(b)}
async function open(str,ctx){if(!isSealed(str))return str;if(!dek)throw new Error('locked');const b=fromB64(str.slice(SEAL.length));return td.decode(await unaes(dek,b.slice(0,12),b.slice(12),ctx))}
const isBlobSealed=o=>!!o&&typeof o==='object'&&o.nxe===1&&!!o.c;
async function sealBlob(blob,ctx){const o=await aes(dek,await bytesOf(blob),ctx);return{nxe:1,i:o.iv,c:o.ct.buffer.slice(o.ct.byteOffset,o.ct.byteOffset+o.ct.byteLength),ty:blob.type||''}}
async function openBlob(o,ctx){const b=await unaes(dek,new Uint8Array(o.i),new Uint8Array(o.c),ctx);return new Blob([b],{type:o.ty||''})}

/* Recovery key: 20 random bytes as 32 Crockford base32 characters, shown in groups of four. */
const B32='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function newRecovery(){const b=rnd(20);let bits=0,v=0,out='';for(const x of b){v=(v<<8)|x;bits+=8;while(bits>=5){out+=B32[(v>>>(bits-5))&31];bits-=5}}return out}
const showKey=k=>k.match(/.{4}/g).join('-');
const cleanKey=s=>String(s).toUpperCase().replace(/[^0-9A-Z]/g,'').replace(/O/g,'0').replace(/[IL]/g,'1');

/* ---------- 4. protected keys: plain in memory, sealed on disk ---------- */
let busy=false,idleWaiters=[];
function fail(k,e){try{if(V.onFail)V.onFail(k,e);else if(typeof toast==='function')toast('Could not save. Export a backup now.')}catch(x){}}
async function pump(){
  if(busy)return;busy=true;
  try{while(pend.size){
    const [k,v]=pend.entries().next().value;pend.delete(k);
    try{if(!sealing()){rawSet.call(S,k,v);continue}
      const s=await seal(v,'ls:'+k);
      if(pend.has(k)||!(k in mem))continue;           /* a newer value arrived, or the key was removed, while sealing */
      rawSet.call(S,k,s)}
    catch(e){fail(k,e)}}}
  finally{busy=false;const w=idleWaiters;idleWaiters=[];w.forEach(f=>f())}}
const flush=()=>pend.size||busy?new Promise(r=>{idleWaiters.push(r);pump()}):Promise.resolve();
if(P){
  P.getItem=function(k){if(this===S&&active()&&PROT.has(String(k)))return String(k) in mem?mem[String(k)]:null;return rawGet.apply(this,arguments)};
  P.setItem=function(k,v){if(this===S&&active()&&PROT.has(String(k))){k=String(k);v=String(v);if(mem[k]===v)return;mem[k]=v;
      if(M.mig===2){rawSet.call(S,k,v);return}
      pend.set(k,v);pump();if(k===K)try{window.dispatchEvent(new Event('nx-saved'))}catch(e){}return}
    return rawSet.apply(this,arguments)};
  P.removeItem=function(k){if(this===S&&PROT.has(String(k))){delete mem[String(k)];pend.delete(String(k))}return rawRem.apply(this,arguments)}}
const corrupt=[];
async function loadProtected(){
  corrupt.length=0;
  for(const k of PROT){const raw=g(k);if(raw===null){delete mem[k];continue}
    if(isSealed(raw)){
      /* a value that cannot be opened must never stop you unlocking: treat it as missing so the safe copy can step in */
      try{mem[k]=await open(raw,'ls:'+k)}catch(e){delete mem[k];corrupt.push(k)}}
    else{mem[k]=raw;pend.set(k,raw)}}      /* leftover plain value from an interrupted move: seal it */
  pump()}

/* ---------- 5. records kept in IndexedDB by other scripts ---------- */
const mediaIdsOf=r=>{const d=r&&r.data;if(!d)return[];const l=r.kind==='item'?[d]:r.kind==='batch'?(d.items||[]):[];return l.filter(x=>x&&x.media&&x.media.id).map(x=>x.media.id)};
const rec={
  async seal(store,r){
    if(!sealing()||r==null)return r;
    if(store==='snap')return isSealed(r.raw)||typeof r.raw!=='string'?r:{...r,raw:await seal(r.raw,'snap')};
    if(store==='kv')return r&&typeof r.raw==='string'&&!isSealed(r.raw)?{...r,raw:await seal(r.raw,'mirror')}:r;
    if(store==='trash'){if(r.e)return r;const{label,data,...rest}=r;return{...rest,rid:r.kind==='item'&&data?data.id:undefined,mids:mediaIdsOf(r),e:await seal(JSON.stringify({label,data}),'trash')}}
    if(store==='blobs'||store==='media')return isBlobSealed(r)?r:sealBlob(r,store);
    return r},
  async open(store,r){
    if(r==null)return r;
    if(store==='snap')return isSealed(r.raw)?{...r,raw:await open(r.raw,'snap')}:r;
    if(store==='kv')return r&&isSealed(r.raw)?{...r,raw:await open(r.raw,'mirror')}:r;
    if(store==='trash'){if(!r.e)return r;const{e,rid,mids,...rest}=r;return{...rest,...JSON.parse(await open(e,'trash'))}}
    if(store==='blobs'||store==='media')return isBlobSealed(r)?openBlob(r,store):r;
    return r}};
const migrators=[];

/* ---------- 6. creating, unlocking and changing the vault ---------- */
async function unwrapWith(pw){
  const m=meta();if(!m||!m.on||!m.kdf||m.kdf.n<100000)throw new Error('bad vault');
  return unwrap(await kdf(pw,fromB64(m.kdf.s),m.kdf.n),m.wk,'wk')}
async function unwrapRecovery(code){
  const m=meta();if(!m||!m.rk)throw new Error('no recovery key');
  return unwrap(await kdf(cleanKey(code),fromB64(m.rk.s),m.rk.n),m.rk,'rk')}
const saveMeta=m=>{if(!put(META,JSON.stringify(m)))throw new Error('Could not save the encryption settings. Storage may be full.');M=m};
async function sealedMeta(raw,pw,recovery){
  const salt=rnd(16),rs=rnd(16),rk=await wrap(await kdf(recovery,rs,RK_N),raw,'rk');
  return{wk:await wrap(await kdf(pw,salt,KDF_N),raw,'wk'),kdf:{h:'SHA-256',n:KDF_N,s:toB64(salt)},rk:{s:toB64(rs),n:RK_N,...rk}}}
const goodPass=pw=>typeof pw==='string'&&norm(pw).length>=8;

async function enable(pw){
  if(!window.crypto||!crypto.subtle)throw new Error('Encryption needs a secure connection (https). Open Nexus from its https address.');
  if(isOn())throw new Error('Encryption is already on.');if(!goodPass(pw))throw new Error('Use at least 8 characters.');
  await flush();
  const raw=rnd(32),recovery=newRecovery(),parts=await sealedMeta(raw,pw,recovery);
  dek=await importDek(raw);
  /* unscoped copies of the AI and API keys would stay readable on disk: fold them into this copy and drop them */
  for(const [k,to] of [['nexus.ai.v1','nexus.ai.v1'+NS],['nexus.key','nexus.key'+NS]]){const v=g(k);if(v===null)continue;if(g(to)===null)put(to,v);if(to!==k)del(k)}
  try{saveMeta({v:1,on:true,mig:1,lock:5,t:Date.now(),...parts})}catch(e){dek=null;throw e}
  unlocked=true;await loadProtected();await migrate('seal');
  return showKey(recovery)}
async function migrate(dir){
  await flush();
  if(dir==='open'){for(const k of PROT)if(k in mem)rawSet.call(S,k,mem[k])}
  else{for(const k of PROT)if(k in mem)pend.set(k,mem[k]);await flush()}
  for(const m of migrators){try{await m.run(dir)}catch(e){throw new Error('Could not finish moving '+m.name+': '+(e&&e.message||e))}}
  if(dir==='seal'){saveMeta({...M,mig:0})}}
async function disable(pw){
  if(!active())throw new Error('Encryption is off.');
  try{await unwrapWith(pw)}catch(e){throw new Error('Wrong passphrase.')}
  await flush();saveMeta({...M,mig:2});
  for(const k of PROT)if(k in mem)rawSet.call(S,k,mem[k]);
  await migrate('open');
  del(META);M=null;dek=null;unlocked=false;for(const k of Object.keys(mem))delete mem[k]}
async function unlock(pw){
  let raw;try{raw=await unwrapWith(pw)}catch(e){return false}
  dek=await importDek(raw);unlocked=true;await loadProtected();return true}
async function unlockRecovery(code,newPw){
  let raw;try{raw=await unwrapRecovery(code)}catch(e){return false}
  if(!goodPass(newPw))throw new Error('Use at least 8 characters for the new passphrase.');
  const salt=rnd(16);saveMeta({...M,kdf:{h:'SHA-256',n:KDF_N,s:toB64(salt)},wk:await wrap(await kdf(newPw,salt,KDF_N),raw,'wk')});
  dek=await importDek(raw);unlocked=true;await loadProtected();return true}
async function changePass(oldPw,newPw){
  if(!goodPass(newPw))throw new Error('Use at least 8 characters.');
  let raw;try{raw=await unwrapWith(oldPw)}catch(e){throw new Error('Wrong passphrase.')}
  const salt=rnd(16);saveMeta({...M,kdf:{h:'SHA-256',n:KDF_N,s:toB64(salt)},wk:await wrap(await kdf(newPw,salt,KDF_N),raw,'wk')})}
async function renewRecovery(pw){
  let raw;try{raw=await unwrapWith(pw)}catch(e){throw new Error('Wrong passphrase.')}
  const recovery=newRecovery(),rs=rnd(16),rk=await wrap(await kdf(recovery,rs,RK_N),raw,'rk');
  saveMeta({...M,rk:{s:toB64(rs),n:RK_N,...rk}});return showKey(recovery)}
function setLock(min){if(active())saveMeta({...M,lock:min})}
async function lockNow(){try{await flush();if(window.NXSafe)await window.NXSafe.flush()}catch(e){}location.reload()}

/* ---------- 7. delete everything this copy of Nexus keeps ---------- */
const ALLKEYS=()=>['data','vault','sync','pin','pref','bk','keyenc','key','hi','theme','remseen','vlang','safety.note','ai.v1','data.stale','v2','v2.stale'].map(b=>'nexus.'+b+NS)
  .concat(['nexus.v2','nexus.theme','nexus.notif','nexus.key','nexus.keyenc','nexus.ai.v1','nexus.ai.cool','nexus.qn']);
async function wipeAll(){
  pend.clear();try{if(window.NXSafe&&window.NXSafe.stop)window.NXSafe.stop()}catch(e){}
  for(const k of ALLKEYS())del(k);
  for(const k of Object.keys(mem))delete mem[k];
  try{sessionStorage.clear()}catch(e){}
  await Promise.all(['nexus-media','nexus-safety','nexus-sync'].map(n=>new Promise(res=>{try{const r=indexedDB.deleteDatabase(n+NS);r.onsuccess=r.onerror=r.onblocked=()=>res()}catch(e){res()}})));
  M=null;dek=null;unlocked=false}

/* ---------- 8. the loader: app scripts wait until the data is readable ---------- */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let readyRes;const ready=new Promise(r=>readyRes=r);
async function runDeferred(){
  for(const old of [...document.querySelectorAll('script[type="text/nx-defer"]')]){
    await new Promise(res=>{
      const s=document.createElement('script'),src=old.getAttribute('data-src');
      if(src){s.src=src;s.onload=s.onerror=()=>res()}else s.textContent=old.textContent;
      old.parentNode.insertBefore(s,old);old.remove();if(!src)res()})}
  try{initUI()}catch(e){}
  if(M&&M.mig&&unlocked){try{await migrate(M.mig===2?'open':'seal');if(M&&M.mig===2){del(META);M=null;dek=null;unlocked=false}}catch(e){setTimeout(()=>{if(typeof toast==='function')toast(String(e.message||e))},800)}}
  window.__nxReady=true;readyRes(true);document.dispatchEvent(new Event('nx-ready'))}

const th=()=>{const t=g('nexus.theme'+NS);return t==='light'||(t==='auto'&&matchMedia&&matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark'};
function gateCSS(){const l=th()==='light';return `#nxv{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:${l?'#F4F4F2':'#0D0D0E'};color:${l?'#161616':'#ECECEC'};font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#nxv *{box-sizing:border-box}#nxv .b{width:100%;max-width:380px}#nxv h1{font-size:22px;margin:0 0 6px}#nxv p{margin:0 0 14px;opacity:.75;font-size:14px}
#nxv input{width:100%;padding:13px 14px;font:inherit;border-radius:10px;border:1px solid ${l?'#B9B9B4':'#3A3A3D'};background:${l?'#fff':'#17171A'};color:inherit;margin-bottom:10px}
#nxv button{font:inherit;padding:13px 16px;border-radius:10px;border:1px solid ${l?'#B9B9B4':'#3A3A3D'};background:transparent;color:inherit;cursor:pointer;width:100%;margin-bottom:8px}
#nxv button.p{background:${l?'#161616':'#ECECEC'};color:${l?'#F4F4F2':'#0D0D0E'};border-color:transparent}#nxv button:disabled{opacity:.5;cursor:default}
#nxv .e{min-height:22px;color:${l?'#9A2D1B':'#FF8E7B'};font-size:14px;margin:0 0 8px;opacity:1}#nxv .l{font-size:14px;opacity:.8;border:0;text-decoration:underline;padding:8px;margin:0}`}
function gate(){
  return new Promise(resolve=>{
    const st=document.createElement('style');st.textContent=gateCSS();
    const d=document.createElement('div');d.id='nxv';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-labelledby','nxv-t');
    document.head.appendChild(st);(document.body||document.documentElement).appendChild(d);
    let fails=0,mode='pass';
    const done=()=>{d.remove();st.remove();resolve()};
    const lockWait=()=>fails>=3?Math.min(30,Math.pow(2,fails-3)):0;
    const draw=()=>{
      if(mode==='pass')d.innerHTML=`<form class="b" id="nxv-f" autocomplete="off"><h1 id="nxv-t">Nexus is locked</h1><p>Enter your passphrase to open your data. It never leaves this device.</p><input id="nxv-p" type="password" autocomplete="current-password" aria-label="Passphrase" placeholder="Passphrase" autofocus><p class="e" id="nxv-e" role="alert"></p><button class="p" id="nxv-g" type="submit">Unlock</button><button class="l" id="nxv-r" type="button">I forgot it. Use my recovery key</button><button class="l" id="nxv-x" type="button">Erase everything on this device</button></form>`;
      else if(mode==='rec')d.innerHTML=`<form class="b" id="nxv-f" autocomplete="off"><h1 id="nxv-t">Use your recovery key</h1><p>Type the recovery key you saved, then choose a new passphrase.</p><input id="nxv-k" aria-label="Recovery key" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autocapitalize="characters" spellcheck="false" autocomplete="off"><input id="nxv-n" type="password" autocomplete="new-password" aria-label="New passphrase" placeholder="New passphrase (8 or more characters)"><p class="e" id="nxv-e" role="alert"></p><button class="p" id="nxv-g" type="submit">Unlock and set passphrase</button><button class="l" id="nxv-b" type="button">Back</button></form>`;
      const f=d.querySelector('#nxv-f'),e=d.querySelector('#nxv-e'),b=d.querySelector('#nxv-g'),say=t=>{e.textContent=t};
      const first=d.querySelector('input');if(first)setTimeout(()=>first.focus(),30);
      const bk=d.querySelector('#nxv-b');if(bk)bk.onclick=()=>{mode='pass';draw()};
      const rb=d.querySelector('#nxv-r');if(rb)rb.onclick=()=>{mode='rec';draw()};
      const xb=d.querySelector('#nxv-x');if(xb)xb.onclick=async()=>{
        if(!confirm('This permanently erases every note, task and file Nexus keeps on this device. Without your passphrase or recovery key it cannot be recovered. Erase everything?'))return;
        await wipeAll();location.reload()};
      f.onsubmit=async ev=>{ev.preventDefault();if(b.disabled)return;
        const w=lockWait();b.disabled=true;
        if(w){for(let i=w;i>0;i--){say('Too many tries. Wait '+i+' s.');await new Promise(r=>setTimeout(r,1000))}}
        say('Unlocking...');let ok=false;
        try{ok=mode==='pass'?await unlock(d.querySelector('#nxv-p').value):await unlockRecovery(d.querySelector('#nxv-k').value,d.querySelector('#nxv-n').value)}
        catch(x){say(String(x.message||x));b.disabled=false;return}
        if(ok){done();return}
        fails++;say(mode==='pass'?'That is not the right passphrase.':'That recovery key does not match.');b.disabled=false;
        const pi=d.querySelector('#nxv-p');if(pi){pi.value='';pi.focus()}}};
    draw()})}

async function start(){
  if(!S){await runDeferred();return}
  if(isOn()&&!unlocked)await gate();
  await runDeferred()}
const go=()=>start().catch(e=>{console.error(e);runDeferred()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();

/* auto-lock after time away */
let away=0;
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){away=Date.now();pump();return}
  if(active()&&M.lock>0&&away&&Date.now()-away>=M.lock*60000)lockNow();away=0});

/* ---------- 9. Settings screens ---------- */
function initUI(){
  const d=document.getElementById('dlg');if(!d)return;
  new MutationObserver(()=>inject(d)).observe(d,{childList:true});
  document.addEventListener('keydown',e=>{if(e.shiftKey&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='l'&&active()){e.preventDefault();lockNow()}})}
const LOCKS=[[1,'1 minute'],[5,'5 minutes'],[15,'15 minutes'],[60,'1 hour'],[0,'Only when I close Nexus']];
function inject(d){
  const wp=d.querySelector('#wp');if(!wp||d.querySelector('#nx-vault'))return;
  const row=wp.closest('.row2'),h=row&&row.previousElementSibling,sec=document.createElement('div');sec.id='nx-vault';
  const on=active();
  sec.innerHTML=`<h2>Encryption</h2>`+(on
    ?`<p class="mu">On. Your data, attachments, restore points, trash and saved keys are encrypted on this device and unlock with your passphrase.</p><label><span>Lock after time away</span><select id="nxv-lk" aria-label="Lock after time away">${LOCKS.map(([m,l])=>`<option value="${m}"${M.lock===m?' selected':''}>${l}</option>`).join('')}</select></label><div class="row2"><button class="btn p" id="nxv-now">Lock now</button><button class="btn" id="nxv-cp">Change passphrase</button></div><div class="row2"><button class="btn" id="nxv-nr">New recovery key</button><button class="btn d" id="nxv-off">Turn off</button></div><small class="mu">The Android widget, reminders and quick-add inbox hand task text to Android outside this lock.</small>`
    :`<p class="mu">Off. Turn it on to lock Nexus with a passphrase and encrypt everything stored on this device. Sync needs it on. A forgotten passphrase cannot be reset without your recovery key.</p><div class="row2"><button class="btn p" id="nxv-on">Turn on encryption</button></div>`);
  (h&&h.tagName==='H2'?h:row).before(sec);
  const q=s=>sec.querySelector(s);
  if(on){
    q('#nxv-lk').onchange=e=>{setLock(+e.target.value);toast('Saved')};
    q('#nxv-now').onclick=()=>lockNow();
    q('#nxv-cp').onclick=()=>pwFlow('change');q('#nxv-nr').onclick=()=>pwFlow('renew');q('#nxv-off').onclick=()=>pwFlow('off')}
  else q('#nxv-on').onclick=()=>pwFlow('on')}
const back=()=>{dlg.close();setTimeout(()=>settings(),80)};
function pwFlow(kind){
  const T={on:['Turn on encryption','Choose a passphrase. You will type it every time Nexus locks, so make it something you can remember but others cannot guess.'],
    change:['Change passphrase','Enter your current passphrase, then a new one.'],renew:['New recovery key','This replaces your old recovery key. Enter your passphrase to continue.'],off:['Turn off encryption','Your data will be stored without a passphrase again. Enter your passphrase to confirm.']}[kind];
  const cur=kind!=='on',nw=kind==='on'||kind==='change';
  sheet(`<form id="nxv-ff" autocomplete="off"><h2 style="margin:0">${T[0]}</h2><p class="mu">${T[1]}</p>${cur?'<label><span>Current passphrase</span><input id="nxv-c" type="password" autocomplete="current-password"></label>':''}${nw?`<label><span>${kind==='on'?'Passphrase':'New passphrase'} (8 or more characters)</span><input id="nxv-1" type="password" autocomplete="new-password"></label><label><span>Type it again</span><input id="nxv-2" type="password" autocomplete="new-password"></label>`:''}<p class="late" id="nxv-m" role="alert"></p><div class="row2"><button class="btn p" type="submit" id="nxv-go">Continue</button><button class="btn" type="button" id="nxv-bk">Cancel</button></div></form>`);
  const $$=s=>dlg.querySelector(s),say=t=>{$$('#nxv-m').textContent=t};
  $$('#nxv-bk').onclick=back;
  $$('#nxv-ff').onsubmit=async ev=>{ev.preventDefault();const b=$$('#nxv-go');
    const c=cur?$$('#nxv-c').value:'',p1=nw?$$('#nxv-1').value:'';
    if(nw){if(!goodPass(p1)){say('Use at least 8 characters.');return}if(p1!==$$('#nxv-2').value){say('The two passphrases are not the same.');return}}
    b.disabled=true;say(kind==='on'?'Encrypting. Keep this window open...':kind==='off'?'Decrypting. Keep this window open...':'Working...');
    try{
      if(kind==='on')showRecovery(await enable(p1),true);
      else if(kind==='change'){await changePass(c,p1);toast('Passphrase changed');back()}
      else if(kind==='renew')showRecovery(await renewRecovery(c),false);
      else{await disable(c);toast('Encryption is off');back()}
    }catch(e){say(String(e&&e.message||e));b.disabled=false}}}
function showRecovery(key,first){
  sheet(`<h2 style="margin:0">${first?'Encryption is on':'New recovery key'}</h2><p class="mu">Save this recovery key somewhere safe, away from this device (a password manager, or printed). It is the only way back in if you forget your passphrase. It is shown once.</p><p id="nxv-key" style="font:600 17px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.04em;word-break:break-all;padding:14px;border:1px solid var(--bd,#888);border-radius:10px;user-select:all">${esc(key)}</p><div class="row2"><button class="btn" id="nxv-cpy">Copy</button><button class="btn" id="nxv-dl">Download as file</button></div><label class="row" style="gap:10px;align-items:flex-start"><input type="checkbox" id="nxv-ok" style="width:auto"><span>I saved my recovery key.</span></label><div class="row2"><button class="btn p" id="nxv-done" disabled>Done</button></div>`);
  const $$=s=>dlg.querySelector(s);
  $$('#nxv-ok').onchange=e=>{$$('#nxv-done').disabled=!e.target.checked};
  $$('#nxv-cpy').onclick=async()=>{try{await navigator.clipboard.writeText(key);toast('Copied')}catch(e){toast('Select the key and copy it by hand.')}};
  $$('#nxv-dl').onclick=()=>{const u=URL.createObjectURL(new Blob(['Nexus recovery key\n'+key+'\n\nKeep this file private and away from your phone.\n'],{type:'text/plain'})),a=document.createElement('a');a.href=u;a.download='nexus-recovery-key.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)};
  $$('#nxv-done').onclick=back}

/* ---------- 10. what other scripts use ---------- */
const V=window.NXVault={version:'3.4.0',K,NS,ready,isOn,active,sealing,isSealed,rec,flush,migrators,
  addMigrator:(name,run)=>migrators.push({name,run}),
  seal:(s,c)=>seal(String(s),c),open:(s,c)=>open(s,c),sealBlob,openBlob,
  enable,disable,unlock,unlockRecovery,changePass,renewRecovery,setLock,lockNow,wipeAll,
  onFail:null,corrupt,esc};
})();
