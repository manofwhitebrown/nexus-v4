/* Nexus safety net (Phase 0). MUST load in <head>, before the main inline script.
   What it does, without changing how the app saves:
   1. Guards the load: if stored data is damaged, it keeps a copy and restores the newest good restore point.
   2. Mirrors every save to IndexedDB, so a full or cleared localStorage does not lose your data.
   3. Trash: anything that disappears from your data (items, projects, subjects, cards, or a whole
      restore or delete-all) is kept for 30 days and can be put back.
   4. Restore points: automatic snapshots (every 15 min while you work, and just before big deletions),
      one-tap restore.
   It works by watching writes to the app's storage key, so it needs no changes to save(). */
(()=>{
'use strict';
const V=window.NXVault||{K:null,rec:{seal:async(a,r)=>r,open:async(a,r)=>r},open:async s=>s,addMigrator(){},sealing:()=>false};
const NS=location.pathname.replace(/[^\/]*$/,''),K=V.K||'nexus.data'+NS,DBN='nexus-safety'+NS;
let stopped=false;
const DAY=864e5,TRASH_DAYS=30,SNAP_GAP=15*60e3,SNAP_KEEP=10,SNAP_DAYS=14,BATCH_AT=25;
let S;try{S=localStorage}catch(e){return}
const proto=Object.getPrototypeOf(S),rawSet=proto.setItem,rawGet=proto.getItem,rawRem=proto.removeItem;
const STALE=K+'.stale';
const get=k=>{try{return rawGet.call(S,k)}catch(e){return null}};
const put=(k,v)=>{try{rawSet.call(S,k,v);return true}catch(e){return false}};

/* ---------- tiny IndexedDB helper ---------- */
let dbp=null;
const db=()=>dbp||(dbp=new Promise((res,rej)=>{try{const r=indexedDB.open(DBN,1);
  r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('kv');d.createObjectStore('trash',{keyPath:'id'});d.createObjectStore('snap',{keyPath:'id'});d.createObjectStore('blobs')};
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}}));
const tx=async(store,mode,fn)=>{const d=await db();return new Promise((res,rej)=>{const t=d.transaction(store,mode),s=t.objectStore(store);let out;try{out=fn(s)}catch(e){rej(e);return}
  t.oncomplete=()=>res(out&&'result' in out?out.result:out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})};
const all=store=>tx(store,'readonly',s=>s.getAll());
const kvGet=async k=>{const r=await tx('kv','readonly',s=>s.get(k));return k==='mirror'&&r?V.rec.open('kv',r):r};
let kvq=Promise.resolve();   /* one at a time, so a slow seal can never let an older safe copy overwrite a newer one */
const kvSet=(k,v)=>{const run=async()=>{if(stopped)return;if(k==='mirror'&&v)v=await V.rec.seal('kv',v);return tx('kv','readwrite',s=>s.put(v,k))};const p=kvq.then(run,run);kvq=p.catch(()=>{});return p};
const allOpen=async store=>Promise.all((await all(store)).map(r=>V.rec.open(store,r)));
const sid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

/* ---------- state ---------- */
let last=get(K),lastObj=null,hold=false,pending=null,snapT=0,corrupt=false,recovered=false;
try{if(last!==null)lastObj=JSON.parse(last)}catch(e){corrupt=true}
const shape=o=>({items:Array.isArray(o&&o.items)?o.items:[],projects:Array.isArray(o&&o.projects)?o.projects:[],study:Array.isArray(o&&o.study)?o.study:[]});
const count=raw=>{try{const o=JSON.parse(raw);return{items:(o.items||[]).length,projects:(o.projects||[]).length,cards:(o.study||[]).reduce((n,s)=>n+((s.cards||[]).length),0)}}catch(e){return{items:0,projects:0,cards:0}}};

/* ---------- 1. guard the load, before the app reads storage ---------- */
let startupNote='';
const needMirror=last===null||corrupt||!!get(STALE);
const pDamaged=corrupt?snapAdd(last,'damaged data found at start',true):null;
if(needMirror){hold=true;(async()=>{
  try{
    if(pDamaged)await pDamaged;
    let src=null,why='';
    const m=await kvGet('mirror');
    if(!corrupt&&last===null&&m&&m.raw){src=m.raw;why='restored from the safe copy'}
    else if(get(STALE)&&m&&m.raw){src=m.raw;why='restored from the safe copy (storage had been full)'}
    else if(corrupt){
      if(m&&m.raw&&valid(m.raw)){src=m.raw;why='restored from the safe copy'}
      else{const sn=(await allOpen('snap')).filter(x=>x.reason.indexOf('damaged')!==0&&valid(x.raw)).sort((a,b)=>b.t-a.t)[0];if(sn){src=sn.raw;why='restored from the restore point of '+new Date(sn.t).toLocaleString()}}
    }
    if(src&&!sessionStorage.getItem('nx.rec')){
      if(put(K,src)){last=src;try{lastObj=JSON.parse(src)}catch(e){}try{rawRem.call(S,STALE)}catch(e){}sessionStorage.setItem('nx.rec','1');
        put('nexus.safety.note'+NS,'Your data was damaged or missing. It was '+why+'.');if(V.flush)await V.flush();location.reload();return}
    }
    if(corrupt)startupNote='Your saved data looks damaged and no restore point was found. A copy was kept so it can still be recovered.';
  }catch(e){}
  hold=false;if(pending!==null){const p=pending;pending=null;onWrite(p)}
})()}else{try{sessionStorage.removeItem('nx.rec')}catch(e){}}
function valid(raw){try{const o=JSON.parse(raw);return !!o&&typeof o==='object'&&Array.isArray(o.items)}catch(e){return false}}

/* ---------- 2. watch writes to the app's key ---------- */
function onWrite(v){
  if(stopped)return;
  if(hold){pending=v;return}
  const prev=last,prevObj=lastObj;
  try{rawSet.call(S,K,v)}catch(e){
    /* storage full: keep a safe copy in IndexedDB and flag it, then let the app show its own error */
    mirror(v,true);put(STALE,String(Date.now()));note('Storage is full. A safe copy was kept, but export a backup soon.');throw e}
  last=v;try{rawRem.call(S,STALE)}catch(e){}
  schedule(prev,prevObj,v);
}
proto.setItem=function(k,v){if(this===S&&k===K)return onWrite(String(v));return rawSet.apply(this,arguments)};
proto.removeItem=function(k){if(this===S&&k===K){const p=last;if(p&&valid(p))snapAdd(p,'before storage was cleared',true);kvSet('mirror',null).catch(()=>{});last=null;lastObj=null}return rawRem.apply(this,arguments)};

let timer=0,queuedPrev=undefined,queuedPrevObj=null,queuedNew=null;
function schedule(prev,prevObj,v){
  if(queuedPrev===undefined){queuedPrev=prev;queuedPrevObj=prevObj}   /* keep the OLDEST state in this burst */
  queuedNew=v;clearTimeout(timer);timer=setTimeout(flush,400)}
async function flush(){
  const prev=queuedPrev,prevObj=queuedPrevObj,v=queuedNew;queuedPrev=undefined;queuedPrevObj=null;queuedNew=null;if(v===null)return;
  let cur;try{cur=JSON.parse(v)}catch(e){return}
  lastObj=cur;
  try{
    await mirror(v);
    if(prevObj)await diff(prevObj,cur,prev);
    if(Date.now()-snapT>SNAP_GAP)await snapAdd(v,'automatic');
  }catch(e){}
}
const mirror=(v,lsFailed)=>kvSet('mirror',{t:Date.now(),raw:v,lsFailed:!!lsFailed}).catch(()=>{});

/* ---------- 3. trash ---------- */
const byId=a=>{const m=new Map();(a||[]).forEach(x=>{if(x&&x.id)m.set(x.id,x)});return m};
async function blobCopy(it){try{if(it&&it.media&&it.media.id&&typeof bget==='function'){const b=await bget(it.media.id);if(b){const sb=await V.rec.seal('blobs',b);await tx('blobs','readwrite',s=>s.put(sb,it.media.id))}}}catch(e){}}
async function diff(a,b,prevRaw){
  const A=shape(a),B=shape(b),out=[],t=Date.now();
  const bi=byId(B.items),bp=byId(B.projects),bs=byId(B.study);
  const gone={items:A.items.filter(x=>x&&x.id&&!bi.has(x.id)),projects:A.projects.filter(x=>x&&x.id&&!bp.has(x.id)),subjects:A.study.filter(x=>x&&x.id&&!bs.has(x.id)),cards:[]};
  A.study.forEach(s=>{const n=bs.get(s&&s.id);if(!n)return;const nc=byId(n.cards);(s.cards||[]).forEach(c=>{if(c&&c.id&&!nc.has(c.id))gone.cards.push({sid:s.id,sname:s.name,card:c})})});
  /* things that came back (Undo) are no longer in the trash */
  try{const tr=await all('trash'),ids=new Set(B.items.filter(x=>x&&x.id).map(x=>x.id));for(const e of tr){const rid=e.rid||(e.data&&e.data.id);if(e.kind==='item'&&rid&&ids.has(rid))await tx('trash','readwrite',s=>s.delete(e.id))}}catch(e){}
  const total=gone.items.length+gone.projects.length+gone.subjects.length+gone.cards.length;if(!total)return;
  const risky=gone.items.length>=3||(A.items.length>=5&&gone.items.length/A.items.length>=.2)||gone.subjects.length>0&&gone.subjects.some(s=>(s.cards||[]).length>=10);
  if(risky&&prevRaw)await snapAdd(prevRaw,'before a big deletion',true);
  const items=gone.items.slice();for(const it of items)await blobCopy(it);
  if(total>=BATCH_AT){out.push({id:sid(),t,kind:'batch',label:total+' things removed at once',data:{items:gone.items,projects:gone.projects,subjects:gone.subjects,cards:gone.cards}})}
  else{
    gone.items.forEach(x=>out.push({id:sid(),t,kind:'item',label:x.title||'Untitled '+x.type,data:x}));
    gone.projects.forEach(x=>out.push({id:sid(),t,kind:'project',label:'Project: '+x.name,data:x}));
    gone.subjects.forEach(x=>out.push({id:sid(),t,kind:'subject',label:'Subject: '+x.name+' ('+(x.cards||[]).length+' cards)',data:x}));
    gone.cards.forEach(x=>out.push({id:sid(),t,kind:'card',label:'Card: '+String(x.card.q||'').slice(0,60),data:x}))}
  const sealed=await Promise.all(out.map(e=>V.rec.seal('trash',e)));
  if(stopped)return;
  await tx('trash','readwrite',s=>sealed.forEach(e=>s.put(e)));
  await purge();
  const big=out.find(e=>e.kind!=='item');
  if(big)announce(out);
}
async function purge(){try{const cut=Date.now()-TRASH_DAYS*DAY,tr=await all('trash'),dead=tr.filter(e=>e.t<cut);if(!dead.length)return;
  await tx('trash','readwrite',s=>dead.forEach(e=>s.delete(e.id)));
  const live=new Set((await all('trash')).flatMap(e=>mediaIds(e)));const keys=await tx('blobs','readonly',s=>s.getAllKeys());
  await tx('blobs','readwrite',s=>keys.forEach(k=>{if(!live.has(k))s.delete(k)}))}catch(e){}}
const mediaIds=e=>{if(e.mids)return e.mids;const d=e.data;if(!d)return[];const l=e.kind==='item'?[d]:e.kind==='batch'?d.items:[];return l.filter(x=>x&&x.media&&x.media.id).map(x=>x.media.id)};

async function restoreEntry(e){
  const items=e.kind==='item'?[e.data]:e.kind==='batch'?e.data.items:[],projects=e.kind==='project'?[e.data]:e.kind==='batch'?e.data.projects:[],
    subjects=e.kind==='subject'?[e.data]:e.kind==='batch'?e.data.subjects:[],cards=e.kind==='card'?[e.data]:e.kind==='batch'?e.data.cards:[];
  for(const it of items){if(it.media&&it.media.id&&typeof bget==='function'&&typeof bput==='function'){try{if(!(await bget(it.media.id))){const b=await tx('blobs','readonly',s=>s.get(it.media.id));if(b)await bput(it.media.id,await V.rec.open('blobs',b))}}catch(x){}}}
  const have=new Set(D.items.map(x=>x.id));items.forEach(x=>{if(!have.has(x.id))D.items.push(x)});
  projects.forEach(p=>{if(!D.projects.some(x=>x.id===p.id))D.projects.push(p)});
  subjects.forEach(s=>{if(!D.study.some(x=>x.id===s.id))D.study.push(s)});
  cards.forEach(c=>{const s=D.study.find(x=>x.id===c.sid);if(s&&!s.cards.some(k=>k.id===c.card.id))s.cards.push(c.card)});
  save();await tx('trash','readwrite',s=>s.delete(e.id));
}

/* ---------- 4. restore points ---------- */
async function snapAdd(raw,reason,force){
  try{if(!raw||(!/^damaged/.test(reason)&&!valid(raw)))return;snapT=Date.now();const c=count(raw);
    const r=await V.rec.seal('snap',{id:sid(),t:Date.now(),reason,raw,n:c.items,p:c.projects,c:c.cards,sz:raw.length});if(stopped)return;
    await tx('snap','readwrite',s=>s.put(r));prune()}catch(e){}}
async function prune(){try{const sn=(await all('snap')).sort((a,b)=>b.t-a.t),keep=new Set(sn.slice(0,SNAP_KEEP).map(x=>x.id)),days=new Set();
  sn.slice(SNAP_KEEP).forEach(x=>{const d=new Date(x.t).toDateString();if(Date.now()-x.t<SNAP_DAYS*DAY&&!days.has(d)){days.add(d);keep.add(x.id)}});
  /* never throw away the newest damaged-data copy or a pre-deletion point younger than the trash period */
  sn.forEach(x=>{if(/before a big deletion|damaged|cleared/.test(x.reason)&&Date.now()-x.t<TRASH_DAYS*DAY)keep.add(x.id)});
  const dead=sn.filter(x=>!keep.has(x.id));if(dead.length)await tx('snap','readwrite',s=>dead.forEach(x=>s.delete(x.id)))}catch(e){}}
async function restoreSnap(sn){
  sn={...sn,raw:await V.open(sn.raw,'snap')};
  const cur=last;if(cur&&valid(cur))await snapAdd(cur,'before restoring a restore point',true);
  /* put back attachments that were deleted since, if the trash still holds them */
  try{const o=JSON.parse(sn.raw);for(const it of(o.items||[])){if(it&&it.media&&it.media.id&&typeof bget==='function'&&typeof bput==='function'){if(!(await bget(it.media.id))){const b=await tx('blobs','readonly',s=>s.get(it.media.id));if(b)await bput(it.media.id,await V.rec.open('blobs',b))}}}}catch(e){}
  hold=true;if(!put(K,sn.raw)){hold=false;return false}last=sn.raw;
  try{sessionStorage.removeItem('nx.rec')}catch(e){}
  put('nexus.safety.note'+NS,'Restored the restore point from '+new Date(sn.t).toLocaleString()+'.');if(V.flush)await V.flush();location.reload();return true}

/* ---------- messages ---------- */
function note(msg){const f=()=>{if(typeof toast==='function')toast(msg);else setTimeout(f,300)};f()}
function announce(entries){const e=entries[0],n=entries.length;
  const msg=e.kind==='batch'?e.label+'. Kept in the trash for 30 days.':n>1?n+' things removed. Kept in the trash for 30 days.':e.label.replace(/^(Project|Subject|Card): /,'')+' deleted.';
  const f=()=>{if(typeof toast==='function')toast(msg,'Undo',async()=>{for(const x of entries)await restoreEntry(x);if(typeof render==='function')render()});else setTimeout(f,300)};f()}

/* ---------- Settings UI: appears inside Settings, whatever the other scripts do to it ---------- */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rel=t=>{const d=Math.floor((Date.now()-t)/DAY);if(d<1){const m=Math.round((Date.now()-t)/6e4);return m<60?Math.max(1,m)+' min ago':Math.floor(m/60)+' h ago'}return d+(d===1?' day':' days')+' ago'};
const left=t=>{const d=Math.max(0,Math.ceil(TRASH_DAYS-(Date.now()-t)/DAY));return d+(d===1?' day':' days')+' left'};
function injectSettings(dlg){
  const wp=dlg.querySelector('#wp');if(!wp||dlg.querySelector('#nx-safe'))return;
  const row=wp.closest('.row2'),h=row&&row.previousElementSibling,sec=document.createElement('div');sec.id='nx-safe';
  sec.innerHTML='<h2>Safety net</h2><p class="mu">Deleted things stay in the trash for 30 days. Restore points are saved automatically while you work.</p><div class="row2"><button class="btn" id="nx-tr">Trash</button><button class="btn" id="nx-sp">Restore points</button></div><small id="nx-sc" role="status"></small>';
  (h&&h.tagName==='H2'?h:row).before(sec);
  sec.querySelector('#nx-tr').onclick=openTrash;sec.querySelector('#nx-sp').onclick=openSnaps;
  Promise.all([all('trash'),all('snap')]).then(([t,s])=>{const c=dlg.querySelector('#nx-sc');if(c)c.textContent=t.length+' in the trash, '+s.length+' restore points.'}).catch(()=>{const c=dlg.querySelector('#nx-sc');if(c)c.textContent='Safe storage is not available in this browser.'})}
async function openTrash(){
  const tr=(await allOpen('trash')).sort((a,b)=>b.t-a.t),shown=tr.slice(0,60);
  sheet(`<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">Trash</h2><button class="btn" id="nx-b">Back</button></div><p class="mu">Kept for 30 days, then removed for good.</p>${shown.length?'<ul>'+shown.map(e=>`<li class="row"><span class="rm"><b>${esc(e.label)}</b><small>${rel(e.t)}, ${left(e.t)}</small></span><button class="btn" data-r="${e.id}">Restore</button></li>`).join('')+'</ul>':'<p class="mu">The trash is empty.</p>'}${tr.length>shown.length?`<p class="mu">${tr.length-shown.length} older entries not shown.</p>`:''}${tr.length?'<div class="row2"><button class="btn d" id="nx-e">Empty trash</button></div>':''}`);
  $('#nx-b').onclick=()=>{dlg.close();setTimeout(()=>settings(),80)};
  dlg.querySelectorAll('[data-r]').forEach(b=>b.onclick=async()=>{const e=tr.find(x=>x.id===b.dataset.r);if(!e)return;b.disabled=true;await restoreEntry(e);toast('Restored');openTrash()});
  const em=$('#nx-e');if(em)em.onclick=async()=>{if(!confirm('Empty the trash? These cannot be brought back.'))return;await tx('trash','readwrite',s=>s.clear());await tx('blobs','readwrite',s=>s.clear());openTrash()}}
async function openSnaps(){
  const sn=(await all('snap')).sort((a,b)=>b.t-a.t);
  sheet(`<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">Restore points</h2><button class="btn" id="nx-b">Back</button></div><p class="mu">Restoring replaces what you have now. Nexus saves a restore point of the current data first, so you can undo it.</p><div class="row2"><button class="btn p" id="nx-n">Save one now</button></div>${sn.length?'<ul>'+sn.map(x=>`<li class="row"><span class="rm"><b>${new Date(x.t).toLocaleString(undefined,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</b><small>${pl(x.n,'item')}, ${pl(x.p,'project')}, ${pl(x.c,'card')}. ${esc(x.reason)}.</small></span><button class="btn" data-s="${x.id}">Restore</button></li>`).join('')+'</ul>':'<p class="mu">None yet. One is saved automatically as you work.</p>'}<small>Attachments are not stored in restore points. Ones deleted within the last 30 days can still be brought back.</small>`);
  $('#nx-b').onclick=()=>{dlg.close();setTimeout(()=>settings(),80)};
  $('#nx-n').onclick=async()=>{if(last)await snapAdd(last,'saved by you',true);toast('Restore point saved');openSnaps()};
  dlg.querySelectorAll('[data-s]').forEach(b=>b.onclick=async()=>{const x=sn.find(y=>y.id===b.dataset.s);if(!x)return;if(!confirm('Go back to '+new Date(x.t).toLocaleString()+'? Anything newer is replaced (a restore point of now is saved first).'))return;b.disabled=true;if(!(await restoreSnap(x)))toast('Could not restore. Storage may be full.')})}

const onReady=()=>{
  const d=document.getElementById('dlg');if(d)new MutationObserver(()=>injectSettings(d)).observe(d,{childList:true});
  const n=get('nexus.safety.note'+NS);if(n){try{rawRem.call(S,'nexus.safety.note'+NS)}catch(e){}setTimeout(()=>note(n),900)}
  else if(startupNote)setTimeout(()=>note(startupNote),900);
  /* if storage filled up and even the small flag could not be saved, the safe copy is newer: offer it */
  setTimeout(async()=>{try{const m=await kvGet('mirror');if(m&&m.lsFailed&&m.raw&&m.raw!==last&&valid(m.raw)&&typeof toast==='function')toast('A newer safe copy of your data was found.','Restore it',()=>restoreSnap({raw:m.raw,t:m.t}))}catch(e){}},2000);
  /* first run on an existing install: take a starting restore point and trim old trash */
  setTimeout(async()=>{try{const sn=await all('snap');if(last&&valid(last)&&!sn.some(x=>Date.now()-x.t<DAY))await snapAdd(last,'daily start');purge()}catch(e){}},4000)};
document.readyState==='loading'?addEventListener('DOMContentLoaded',onReady):onReady();

/* for tests and debugging */
/* encryption: the vault tells this file when to seal or open what it keeps in IndexedDB */
async function rewrite(store,fn){
  const keys=await tx(store,'readonly',s=>s.getAllKeys()),inline=store==='kv'||store==='blobs';
  for(const k of keys){const r=await tx(store,'readonly',s=>s.get(k)),n=await fn(r);if(n!==r)await tx(store,'readwrite',s=>inline?s.put(n,k):s.put(n))}}
V.addMigrator('the safe copy, trash and restore points',async dir=>{
  const f=(st)=>r=>dir==='seal'?V.rec.seal(st,r):V.rec.open(st,r);
  for(const st of['kv','trash','snap','blobs'])await rewrite(st,f(st))});
V.onFail=(k,e)=>{if(k!==K){if(typeof toast==='function')toast('Could not save a setting. Export a backup soon.');return}
  mirror(last,true);put(STALE,String(Date.now()));note('Storage is full. A safe copy was kept, but export a backup soon.')};
/* Delete all data: stop watching and close the database so it can be removed */
function stop(){stopped=true;clearTimeout(timer);hold=true;try{if(dbp)dbp.then(d=>d.close()).catch(()=>{})}catch(e){}}
window.NXSafe={flush:()=>{clearTimeout(timer);return flush()},trash:()=>allOpen('trash'),snaps:()=>allOpen('snap'),restoreEntry,restoreSnap,mirror:()=>kvGet('mirror'),snapAdd:(r,why)=>snapAdd(r,why,true),stop};
})();
