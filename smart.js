/* Nexus smart helpers (Phase 3). All of it runs on the device, with no model download and no network.
   1. Search that understands word forms, close synonyms and typos (not a neural model: honest limits below).
   2. Flashcards made from your notes by plain rules.
   3. Auto-tags from tags you already use, shorter titles, and a gentle "looks similar" warning.
   4. A daily study plan that spreads new cards over the days left before an exam.
   Loaded after study.js. */
(()=>{
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const slug=s=>String(s).toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,'').slice(0,30);
const wordsOf=s=>String(s||'').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu)||[];
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const STOP=new Set('the and for are but not you your with that this from have has had was were will would can could should about into over under then than them they their there here what when where which who whom how why also just very more most some any all out off one two our its his her him she let get got use used using'.split(' '));
const pref=k=>{try{return localStorage.getItem('nexus.'+k)}catch(e){return null}};
const setPref=(k,v)=>{try{localStorage.setItem('nexus.'+k,v)}catch(e){}};

/* ---------- 1. Search ---------- */
function stem(w){
  if(w.length<4||/[^\x00-\x7f]/.test(w))return w;
  let s=w;
  if(/ies$/.test(s)&&s.length>4)s=s.slice(0,-3)+'y';
  else{for(const x of['ations','ation','ings','ing','ers','er','ed','ly']){if(s.endsWith(x)&&s.length-x.length>=3){s=s.slice(0,-x.length);break}}
    if(s===w&&/s$/.test(s)&&!/(ss|us|is)$/.test(s))s=s.slice(0,-1)}
  if(s.length>3&&s.endsWith('e'))s=s.slice(0,-1);
  return s.replace(/(.)\1$/,'$1')}
/* Small hand-made groups of words that mean nearly the same thing in everyday notes */
const GROUPS=['buy purchase shop order groceries grocery shopping','exam test quiz assessment midterm final revision revise','money cash payment pay bill invoice rent salary fee expense budget','doctor physician clinic hospital dentist appointment medical medicine checkup','meeting call sync standup catchup interview','email mail message inbox reply','idea concept thought brainstorm plan','homework assignment coursework essay','trip travel flight journey holiday vacation ticket','car vehicle bike scooter drive driving','fix repair mend solve debug','clean tidy wash laundry chores','study learn revise read reading','run running jog jogging exercise workout gym fitness','deadline due submit submission','movie film cinema show series','recipe cook cooking food meal dinner lunch breakfast','house home flat apartment','job work career office','password login account credentials'].map(g=>g.split(' ').map(stem));
const SYN=new Map();GROUPS.forEach((g,i)=>g.forEach(w=>SYN.set(w,[...(SYN.get(w)||[]),i])));
const synOf=st=>{const o=new Set();for(const gi of SYN.get(st)||[])for(const w of GROUPS[gi])if(w!==st)o.add(w);return[...o]};
function dist(a,b,max){ /* edit distance where swapping two neighbours costs one */
  if(Math.abs(a.length-b.length)>max)return max+1;
  let p2=null,p1=Array.from({length:b.length+1},(_,j)=>j);
  for(let i=1;i<=a.length;i++){const c=[i];let min=i;
    for(let j=1;j<=b.length;j++){let v=Math.min(p1[j]+1,c[j-1]+1,p1[j-1]+(a[i-1]===b[j-1]?0:1));
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])v=Math.min(v,p2[j-2]+1);
      c[j]=v;if(v<min)min=v}
    if(min>max)return max+1;p2=p1;p1=c}
  return p1[b.length]}
const cache=new Map();let df=new Map(),dirty=true,N=0;
function entry(i){
  const sig=i.updated+'|'+i.title.length+'|'+i.body.length+'|'+i.tags.join(',')+'|'+i.project;let e=cache.get(i.id);
  if(e&&e.sig===sig)return e;
  const st=x=>new Set(wordsOf(x).filter(w=>w.length>=3).map(stem));
  e={sig,text:(i.title+' '+i.body+' '+i.tags.join(' ')+' '+pname(i.project)+' '+i.url).toLowerCase(),ti:st(i.title),tg:st(i.tags.join(' ')+' '+pname(i.project)),bo:st(i.body)};
  cache.set(i.id,e);dirty=true;return e}
function reindex(){
  const live=new Set(),all=[];for(const i of D.items){live.add(i.id);all.push(entry(i))}
  for(const k of cache.keys())if(!live.has(k)){cache.delete(k);dirty=true}
  if(dirty){df=new Map();for(const e of all){const u=new Set([...e.ti,...e.tg,...e.bo]);for(const w of u)df.set(w,(df.get(w)||0)+1)}dirty=false}
  N=all.length}
const oSearch=search;
function smartSearch(q){
  const base=oSearch(q);
  const tk=wordsOf(q).slice(0,6);if(!tk.length)return base;
  reindex();
  const idf=w=>Math.log(1+N/(1+(df.get(w)||0)));
  /* for each word: the forms it can match, and how much each form is worth */
  const vars=tk.map(t=>{const st=stem(t),m=new Map([[st,.8]]);
    for(const s of synOf(st))if(!m.has(s))m.set(s,.55);
    if(t.length>=5){const max=t.length>=7?2:1;for(const w of df.keys())if(!m.has(w)&&w.length>=4&&dist(st,w,max)<=max)m.set(w,.5)}
    return{t,m}});
  const hit=[];
  for(const i of D.items){const e=entry(i);let sc=0,got=0;
    for(const v of vars){let best=0;
      if(e.text.includes(v.t))best=(e.ti.has(stem(v.t))?4:e.tg.has(stem(v.t))?3:1)*1.2;
      for(const [w,m] of v.m){const f=e.ti.has(w)?4:e.tg.has(w)?3:e.bo.has(w)?1:0;if(f)best=Math.max(best,f*m*idf(w)/2)}
      if(best){sc+=best;got++}}
    if(got)hit.push({i,sc,got})}
  const all=hit.filter(h=>h.got===vars.length),use=all.length?all:hit.filter(h=>h.got>=Math.ceil(vars.length/2));
  if(!use.length)return base;
  use.sort((a,b)=>b.sc-a.sc||b.i.updated.localeCompare(a.i.updated));
  /* exact matches from the old search keep their place at the top */
  const first=new Set(base.it.map(x=>x.id)),items=[...base.it,...use.map(h=>h.i).filter(i=>!first.has(i.id))].slice(0,60);
  return{pr:base.pr,it:items}}
search=smartSearch;

/* ---------- 2. Flashcards from notes ---------- */
const PRON=/^(it|this|that|these|those|he|she|they|there|which|what|who|we|i|you|here|its|his|her|their)\b/i;
const NOTTERM=new Set('note notes todo idea tip summary example date time url link remember reminder warning important step steps item items part chapter page lesson'.split(' '));
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const trimEnd=s=>s.replace(/[\s.;,]+$/,'');
function cardsFrom(text){
  const out=[],seen=new Set();
  const add=(q,a,raw)=>{q=q.trim().replace(/\s+/g,' ');a=trimEnd(a.trim().replace(/\s+/g,' '));if(q.length<4||a.length<2||q.length>300||a.length>600)return;const k=q.toLowerCase();if(seen.has(k))return;seen.add(k);out.push({q,a:raw?a:cap(a)})};
  const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n').map(l=>l.replace(/^[\s>*•\-–]+\s*/,'').replace(/^\d+[.)]\s+/,'').replace(/^#+\s+/,'').trim()).filter(Boolean);
  for(const l of lines){
    let m;
    if((m=l.match(/^(?:q|question)\s*[:.)-]\s*(.+?)\s+(?:a|ans|answer)\s*[:.)-]\s*(.+)$/i))){add(m[1],m[2]);continue}
    if(l.split('|').length===2&&(m=l.match(/^(.{3,200}?)\s*\|\s*(.{2,})$/))){add(m[1],m[2]);continue}
    if((m=l.match(/^([\p{L}][^:–—]{1,50}?)\s*(?::|—|–|-)\s+(.{12,})$/u))){
      const term=m[1].trim(),n=term.split(/\s+/).length;
      if(n<=5&&!NOTTERM.has(term.toLowerCase())&&!/^\d/.test(term)&&!/https?:|www\./i.test(l)&&m[2].split(/\s+/).length>=3&&!/\d{1,2}:\d{2}/.test(term)){add(n<=2?'What is '+term+'?':term+'?',m[2]);continue}}
    for(const s0 of l.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)){
      const s=s0.trim();if(s.length<25||s.length>300||s.split(/\s+/).length<5)continue;
      let made=false;
      const d=s.match(/^(?:An?|The)?\s*([A-Z][\p{L}\p{N}'’\- ]{2,40}?)\s+(is|are|means|refers to|consists of)\s+(.{12,})$/u);
      if(d&&!PRON.test(d[1])&&d[1].trim().split(/\s+/).length<=5&&!/\b(not|never|also|often|usually|sometimes|very)$/i.test(d[1].trim())){
        const subj=d[1].trim(),v=d[2],a=d[3];
        add(v==='means'?'What does '+subj+' mean?':v==='refers to'?'What does '+subj+' refer to?':v==='consists of'?'What does '+subj+' consist of?':'What '+v+' '+subj+'?',a);made=true}
      const b=[...s.matchAll(/\*\*([^*]{2,60})\*\*|__([^_]{2,60})__/g)];
      if(!made&&b.length===1){const w=b[0][1]||b[0][2];add('Fill in the blank: '+s.replace(b[0][0],'\u0001').replace(/\*\*|__/g,'').replace('\u0001','_____'),w,true);made=true}
      if(!made){const y=s.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);if(y&&s.split(/\s+/).length>=6){add('Fill in the blank: '+s.replace(/\*\*|__/g,'').replace(y[0],'_____'),y[0],true)}}}
    if(out.length>=40)break}
  return out.slice(0,40)}
const material=s=>{const sg=slug(s.name);return D.items.filter(i=>i.type!=='task'&&i.tags.some(t=>slug(t)===sg)&&!i.media)};
function cardsSheet(sid){
  const s=subj(sid);if(!s)return;
  const have=new Set(s.cards.map(c=>c.q.toLowerCase())),mat=material(s),cand=[];
  for(const i of mat)for(const c of cardsFrom(i.title+'\n'+i.body))if(!have.has(c.q.toLowerCase())&&!cand.some(x=>x.q.toLowerCase()===c.q.toLowerCase()))cand.push({...c,from:i.title});
  const cs=cand.slice(0,40);
  if(!cs.length){sheet(`<h2 style="margin:0">Cards from notes</h2><p class="mu">${mat.length?'No new cards could be made from your '+pl(mat.length,'note')+' on this subject. Lines like <b>Term: meaning</b>, <b>X is …</b>, <b>Q: … A: …</b> or a **bold** word work best.':'Tag notes with <b>#'+E(slug(s.name))+'</b> to use them here.'}</p><div class="row2"><button class="btn" id="mcz">Close</button></div>`);$('#mcz').onclick=()=>dlg.close();return}
  sheet(`<h2 style="margin:0">Cards from notes</h2><p class="mu" id="mcn"></p><ul style="max-height:46vh;overflow:auto">${cs.map((c,k)=>`<li class="row"><label style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" data-k="${k}" checked><span><b>${E(c.q)}</b><br><small>${E(c.a)}</small></span></label></li>`).join('')}</ul><div class="row2"><button class="btn p" id="mcg">Add cards</button><button class="btn" id="mcz">Cancel</button></div>`);
  const upd=()=>{const n=dlg.querySelectorAll('input[data-k]:checked').length;$('#mcn').textContent='Review these before adding. '+n+' of '+cs.length+' selected.';$('#mcg').disabled=!n;$('#mcg').textContent='Add '+pl(n,'card')};
  dlg.querySelectorAll('input[data-k]').forEach(x=>x.onchange=upd);upd();$('#mcz').onclick=()=>dlg.close();
  $('#mcg').onclick=()=>{let n=0;dlg.querySelectorAll('input[data-k]:checked').forEach(x=>{const c=cs[+x.dataset.k];if(s.cards.length<2000){s.cards.push({id:uid(),q:c.q.slice(0,500),a:c.a.slice(0,1000),box:0,due:dk()});n++}});save();dlg.close();render();toast('Added '+pl(n,'card'))}}
A.mkcards=sid=>cardsSheet(sid);

/* ---------- 3. Auto-tags, shorter titles, similar warning ---------- */
const autoOn=()=>pref('auto')!=='0';
function knownTags(){const m=new Map();for(const i of D.items)for(const t of i.tags){const k=t.toLowerCase();m.set(k,(m.get(k)||0)+1)}return m}
function tagsFor(it){
  const text=(it.title+' '+it.body).toLowerCase(),st=new Set(wordsOf(text).filter(w=>w.length>=3).map(stem)),out=[];
  for(const s of D.study){const sg=slug(s.name);if(sg.length>=3&&slug(text).includes(sg)&&!it.tags.some(t=>slug(t)===sg))out.push([s.name.toLowerCase().replace(/[^\p{L}\p{M}\p{N}_-]+/gu,''),99])}
  for(const [t,n] of knownTags()){if(t.length<3||it.tags.includes(t))continue;const parts=wordsOf(t);if(parts.length&&parts.every(p=>st.has(stem(p))))out.push([t,n])}
  return out.sort((a,b)=>b[1]-a[1]).map(x=>x[0]).filter((t,i,a)=>t&&a.indexOf(t)===i).slice(0,2)}
function shortTitle(t){
  if(t.length<=70)return null;
  const m=t.match(/^(.{20,70}?[.!?:])\s/);if(m)return m[1].replace(/[.:]$/,'');
  let c=t.slice(0,60);const k=c.lastIndexOf(' ');if(k>30)c=c.slice(0,k);return c.replace(/[,;:\s]+$/,'')+'…'}
const jac=(a,b)=>{let n=0;for(const x of a)if(b.has(x))n++;return n/(a.size+b.size-n||1)};
const norm=u=>String(u||'').toLowerCase().replace(/^https?:\/\/(www\.)?/,'').replace(/[#?].*$/,'').replace(/\/+$/,'');
function similarTo(p){
  if(!p||p.type==='task')return null;
  const ws=x=>new Set(wordsOf(x).filter(w=>w.length>=3&&!STOP.has(w)).map(stem)),a=ws((p.title||'')+' '+(p.body||''));
  for(const i of D.items){if(i.type==='task'||i.type!==p.type&&!(p.url&&i.url))continue;
    if(p.url&&i.url&&norm(p.url)===norm(i.url))return i;
    if(!p.url&&a.size>=4){const b=ws(i.title+' '+i.body);if(b.size>=4&&jac(a,b)>=.8)return i}}
  return null}
const oAdd=addItem;
addItem=function(p){
  const dup=similarTo(p),it=oAdd(p);
  if(!it)return it;
  if(autoOn()&&it.type!=='task'){
    let ch=false;
    if(!it.body&&it.type!=='link'){const st=shortTitle(it.title);if(st){it.body=it.title;it.title=st;ch=true}}
    if(!(p.tags&&p.tags.length)){const t=tagsFor(it);if(t.length){it.tags=[...it.tags,...t];ch=true}}
    if(ch)save()}
  if(dup&&dup.id!==it.id)setTimeout(()=>{try{toast('Looks similar to “'+dup.title.slice(0,40)+'”','Open',()=>edit(dup.id))}catch(e){}},500);
  return it};

/* ---------- 4. Daily study plan ---------- */
const FS=()=>window.NXFSRS;
const isNew=c=>!FS().state(c);
const introducedToday=(s,t)=>s.cards.filter(c=>{const p=FS().state(c);return p&&(p.f||'')===t}).length;
function newQuota(s,t=dk()){
  const nw=s.cards.filter(isNew).length,intro=introducedToday(s,t),total=nw+intro;let q=20;
  if(s.exam&&s.exam>=t)q=clamp(Math.ceil(total/Math.max(1,FS().gap(t,s.exam)-2)),1,60);
  return Math.max(0,q-intro)}
dueC=s=>{const t=dk(),due=s.cards.filter(c=>c.due<=t),old=due.filter(c=>!isNew(c)),nw=due.filter(isNew);return[...old,...nw.slice(0,newQuota(s,t))]};
function plan(){
  const rows=[];
  for(const s of D.study){if(!s.cards.length&&!s.exam)continue;
    const d=dueC(s),nw=d.filter(isNew).length,rv=d.length-nw,left=(s.ch||[]).filter(c=>!c.d).length,dl=s.exam&&s.exam>=dk()?FS().gap(dk(),s.exam):null;
    if(!d.length&&dl===null)continue;
    const bits=[];if(dl!==null)bits.push(dl===0?'Exam today':'Exam in '+pl(dl,'day'));
    bits.push(d.length?(rv?'review '+rv:'')+(rv&&nw?', ':'')+(nw?'learn '+pl(nw,'new card'):''):'nothing due');
    if(dl!==null&&left)bits.push(pl(left,'chapter')+' left');
    if(d.length)bits.push('about '+Math.max(1,Math.round(rv*.4+nw*.8))+' min');
    rows.push({s,t:bits.join(' · '),dl})}
  rows.sort((a,b)=>(a.dl===null)-(b.dl===null)||a.dl-b.dl);
  return rows}
const oStudy2=study;
study=function(){
  const h=oStudy2();
  if(S.sj){const s=subj(S.sj);if(!s)return h;
    const mk='<div class="row2" style="margin-top:32px"><button class="btn d" data-a="delsub"',btn=`<div class="row2"><button class="btn" data-a="mkcards" data-i="${s.id}">Cards from notes</button></div>`;
    return h.includes(mk)?h.replace(mk,btn+mk):h+btn}
  const rows=plan();if(!rows.length)return h;
  const html=`<h2>Today's plan</h2><ul>${rows.map(r=>`<li class="row"><button class="rm" data-a="sub" data-i="${r.s.id}"><b>${E(r.s.name)}</b><small>${E(r.t)}</small></button></li>`).join('')}</ul>`;
  const i=h.indexOf('</p>');return i<0?h+html:h.slice(0,i+4)+html+h.slice(i+4)};

/* ---------- Settings switch ---------- */
const oSet=settings;
settings=function(){oSet.apply(this,arguments);try{
  const x=document.querySelector('#xp');if(!x||document.querySelector('#auto'))return;
  const b=document.createElement('button');b.className='btn';b.id='auto';
  const lab=()=>'Smart tags and titles: '+(autoOn()?'on':'off');b.textContent=lab();
  b.onclick=()=>{setPref('auto',autoOn()?'0':'1');b.textContent=lab();toast(autoOn()?'New notes get tags and shorter titles.':'Smart tags and titles turned off.')};
  const row=x.closest('.row2');(document.querySelector('#impn')||row).after(b)}catch(e){}};
A.settings=settings;

window.NXSmart={cardsFrom,cardsSheet,stem,dist,tagsFor,shortTitle,similarTo,newQuota,plan,smartSearch};
})();
