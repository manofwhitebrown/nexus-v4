/* Nexus 4.1. Loaded after the other layers; nothing in index.html is rewritten.
   Focus long-break cycles, monthly recap, a question bank for Study, a Week view with times,
   a graph of connections, wallpaper / layout / navigation options, PDF text search (bundled pdf.js,
   no AI), an AI card-making button and optional AI auto-filing of captures. */
(()=>{
const L=s=>window.NXI18N?window.NXI18N.t(s):s;
const LS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){return null}};
const J=(k,d)=>{try{const v=JSON.parse(LS(k));return v&&typeof v==='object'?v:d}catch(e){return d}};
const norm=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/g,' ').trim();
const MON=d=>d.toLocaleDateString(undefined,{month:'long',year:'numeric'});

/* ---------- styles ---------- */
const st=document.createElement('style');st.textContent=`
.nx41wk{overflow-x:auto;margin-top:10px}.nx41g{min-width:600px;display:grid;grid-template-columns:36px repeat(7,1fr);gap:0 2px;font-size:12px}
.nx41g .h{text-align:center;padding:4px 0;color:var(--mu)}.nx41g .h b{display:block;color:var(--ink);font-size:15px}.nx41g .h.t b{color:var(--ac)}
.nx41g .un{padding:2px;display:flex;flex-direction:column;gap:2px;min-height:6px}.nx41g .un button,.nx41b{font:inherit;font-size:11px;line-height:1.2;text-align:left;border:0;border-radius:5px;background:var(--tr2);color:var(--ink);padding:3px 5px;overflow:hidden}
.nx41g .gt{position:relative}.nx41g .gt i{position:absolute;right:4px;font-style:normal;font-size:10px;color:var(--mu);transform:translateY(-50%)}
.nx41g .col{position:relative;border-left:1px solid var(--ln);background:repeating-linear-gradient(to bottom,transparent 0,transparent calc(var(--hh) - 1px),var(--ln) calc(var(--hh) - 1px),var(--ln) var(--hh))}
.nx41b{position:absolute;border-left:3px solid var(--ac);box-sizing:border-box}.nx41b.dn{opacity:.5;text-decoration:line-through}.nx41b small{display:block;font-size:10px;color:var(--mu)}
.nx41now{position:absolute;left:0;right:0;height:2px;background:var(--ac);z-index:1}
.nx41gr{width:100%;height:auto;max-height:70vh;background:var(--s);border-radius:10px}.nx41gr g[data-a]{cursor:pointer}.nx41gr text{font-size:9px;fill:var(--ink);pointer-events:none}
.nx41gr g:focus-visible{outline:2px solid var(--ac)}.nx41gr .ed{stroke:var(--mu);opacity:.45}.nx41gr .ed.l{stroke:var(--ac);opacity:.9}.nx41gr .ed.p{stroke-dasharray:3 3}
.nx41opt{display:block;width:100%;margin:6px 0;text-align:left}.nx41ok{outline:2px solid var(--ac)}
.nx41set label{display:block;margin-top:10px}.nx41set select,.nx41set input[type=file]{width:100%}
`;document.head.append(st);

/* ---------- 1. Look: wallpaper, layout, navigation ---------- */
const LK='nexus.look'+NS;
const look=()=>({wp:'none',nav:'auto',den:'comfy',wid:'std',img:'',...J(LK,{})});
const BGS={
  mist:'radial-gradient(circle at 15% 10%,color-mix(in srgb,var(--ac) 22%,transparent),transparent 55%),radial-gradient(circle at 85% 90%,color-mix(in srgb,var(--ink) 9%,transparent),transparent 55%)',
  dots:'radial-gradient(color-mix(in srgb,var(--ink) 14%,transparent) 1.2px,transparent 1.4px) 0 0/22px 22px',
  grid:'linear-gradient(color-mix(in srgb,var(--ink) 7%,transparent) 1px,transparent 1px) 0 0/28px 28px,linear-gradient(90deg,color-mix(in srgb,var(--ink) 7%,transparent) 1px,transparent 1px) 0 0/28px 28px',
  dusk:'linear-gradient(170deg,color-mix(in srgb,var(--ac) 20%,transparent),transparent 70%)'};
const NAVCSS=`
@media(min-width:900px){
html[data-nav=bottom] body{padding-left:0}
html[data-nav=bottom] nav{top:auto;right:0;width:auto;border-right:0;border-top:1px solid var(--ln);padding:0 0 env(safe-area-inset-bottom,0px)}
html[data-nav=bottom] nav div{display:grid;grid-template-columns:repeat(5,1fr);max-width:560px;margin:0 auto;height:60px;gap:0}
html[data-nav=bottom] nav button{margin:8px 3px;height:44px;padding:0;text-align:center;font-size:14px}
html[data-nav=bottom] .fab{right:18px;bottom:76px}html[data-nav=bottom] #toast{left:16px;bottom:80px}
html[data-nav=top] body{padding-left:0}
html[data-nav=top] nav{top:0;bottom:auto;right:0;width:auto;border-right:0;border-bottom:1px solid var(--ln);padding:0}
html[data-nav=top] nav div{display:grid;grid-template-columns:repeat(5,1fr);max-width:780px;margin:0 auto;height:44px;gap:0}
html[data-nav=top] nav button{margin:0;height:44px;padding:0;text-align:center;font-size:14px}
html[data-nav=top] header{top:44px}html[data-nav=top] #toast{left:16px}}
@media(max-width:899px){
html[data-nav=side] body{padding-left:76px}
html[data-nav=side] nav{top:0;right:auto;width:76px;border-top:0;border-right:1px solid var(--ln);padding-bottom:0}
html[data-nav=side] nav div{display:flex;flex-direction:column;height:auto;gap:4px;padding:12px 4px;max-width:none}
html[data-nav=side] nav button{margin:0;height:46px;font-size:12px;box-shadow:none!important;border-radius:8px}
html[data-nav=side] .fab{bottom:20px}html[data-nav=side] main{padding-bottom:90px}
html[data-nav=top] body{padding-top:44px}html[data-nav=top] nav{top:env(safe-area-inset-top,0px);bottom:auto;border-top:0;border-bottom:1px solid var(--ln);padding-bottom:0}
html[data-nav=top] nav div{height:44px}html[data-nav=top] nav button{margin:0;height:44px;font-size:13px}
html[data-nav=top] header{top:calc(44px + env(safe-area-inset-top,0px))}html[data-nav=top] .fab{bottom:20px}html[data-nav=top] main{padding-bottom:90px}}
html[data-den=compact] body{font-size:15px;line-height:1.4}html[data-den=compact] li.row{padding-top:2px;padding-bottom:2px}
html[data-wid=narrow] header,html[data-wid=narrow] main{max-width:520px}
html[data-wid=wide] header,html[data-wid=wide] main{max-width:1000px}`;
const ws=document.createElement('style');ws.id='nx41look';document.head.append(ws);
function applyLook(){const c=look(),h=document.documentElement;
  ['nav','den','wid'].forEach(k=>{const v=c[k];if(v&&!['auto','comfy','std'].includes(v))h.setAttribute('data-'+k,v);else h.removeAttribute('data-'+k)});
  let bg='';if(c.wp==='custom'&&/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(c.img||''))bg='linear-gradient(color-mix(in srgb,var(--bg) 78%,transparent),color-mix(in srgb,var(--bg) 78%,transparent)),url("'+c.img+'") center/cover';
  else if(BGS[c.wp])bg=BGS[c.wp];
  if(bg)h.setAttribute('data-wp',c.wp);else h.removeAttribute('data-wp');
  ws.textContent=NAVCSS+(bg?`html[data-wp]{background:var(--bg)}html[data-wp] body{background:transparent!important}body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:${bg}}`:'')}
const setLook=p=>{LS(LK,JSON.stringify({...look(),...p}));applyLook()};
applyLook();
async function pickWallpaper(f){
  if(!f||!/^image\//.test(f.type)){toast(L('Pick a picture.'));return}
  try{const bm=await createImageBitmap(f),k=Math.min(1,1280/Math.max(bm.width,bm.height)),cv=document.createElement('canvas');cv.width=Math.round(bm.width*k);cv.height=Math.round(bm.height*k);
    cv.getContext('2d').drawImage(bm,0,0,cv.width,cv.height);let q=.6,u=cv.toDataURL('image/jpeg',q);while(u.length>350000&&q>.2){q-=.1;u=cv.toDataURL('image/jpeg',q)}
    if(u.length>350000){toast(L('That picture is too detailed. Try a smaller one.'));return}setLook({wp:'custom',img:u});toast(L('Wallpaper set'))}catch(e){toast(L('Could not read that picture.'))}}

/* ---------- 2. Focus: long-break cycles ---------- */
const CK='nexus.cyc'+NS,FK='nexus.focuscfg'+NS;
const fcfg=()=>({every:4,short:5,long:15,...J(FK,{})});
const cyc=()=>{const c=J(CK,{n:0,t:0});return Date.now()-(c.t||0)>4*36e5?{n:0,t:0}:c};
const setc=n=>LS(CK,JSON.stringify({n,t:Date.now()}));
const oFx=fx;
fx=function(){oFx.apply(this,arguments);try{if(!F||!$('#fx'))return;const n=cyc().n-(F.nx41?1:0),e=fcfg().every,tm=$('#fx .tm');
  if(tm&&!$('#nx41c'))tm.insertAdjacentHTML('afterend',`<p id="nx41c" class="mu" style="margin:4px 0 0">${E(L('Session'))} ${(Math.max(0,n)%e)+1} ${E(L('of'))} ${e}</p>`)}catch(x){}};
function cycleTick(){try{
  if(F&&F.left===0&&!F.run){
    if(!F.nx41){F.nx41=1;setc(cyc().n+1)}
    const b=$('#nxbk');if(b){const n=cyc().n,c=fcfg(),lg=n>0&&n%c.every===0;b.dataset.i=lg?c.long:c.short;b.dataset.nx41=lg?'long':'short';
      b.textContent=lg?`${L('Take a long break')} (${c.long} ${L('min')}). ${n} ${L('sessions done')}`:`${L('Take a break')} (${c.short} ${L('min')}). ${n} ${L('of')} ${c.every}`}}}catch(e){}}
setInterval(cycleTick,400);
const oBrk=A.nxbrk;A.nxbrk=m=>{if(+m===fcfg().long&&cyc().n>0&&cyc().n%fcfg().every===0)setc(0);oBrk(m)};

/* ---------- 3. Monthly recap ---------- */
function monthData(off){const t=new Date(),y=new Date(t.getFullYear(),t.getMonth()+off,1),n=new Date(y.getFullYear(),y.getMonth()+1,0).getDate(),pre=dk(y).slice(0,7);
  const days=[...Array(n)].map((_,i)=>({k:pre+'-'+String(i+1).padStart(2,'0'),done:0,cap:0,foc:0}));const by=Object.fromEntries(days.map(d=>[d.k,d])),pj={};
  D.items.forEach(i=>{if(i.done&&i.doneAt){const k=dk(new Date(i.doneAt));if(by[k]){by[k].done++;if(i.project)pj[i.project]=(pj[i.project]||0)+1}}const c=dk(new Date(i.created));if(by[c])by[c].cap++});
  D.log.forEach(l=>{if(l.k==='focus'){const k=dk(new Date(l.t));if(by[k])by[k].foc+=l.m||0}});
  const sum=k=>days.reduce((a,d)=>a+d[k],0),act=days.filter(d=>d.done||d.cap||d.foc).length,best=days.reduce((a,d)=>d.done>a.done?d:a,days[0]);
  return{y,days,done:sum('done'),cap:sum('cap'),foc:sum('foc'),act,best,pj:Object.entries(pj).sort((a,b)=>b[1]-a[1]).slice(0,3)}}
A.recapm=i=>{S.mo=Math.min(0,(+i===0?0:(S.mo||0)+(+i)));const m=monthData(S.mo),p=monthData(S.mo-1),mx=Math.max(1,...m.days.map(d=>d.done)),df=m.done-p.done;
  sheet(`<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">${E(L('Monthly recap'))}</h2><button class="btn" id="rx">${E(L('Close'))}</button></div>
<div class="chips" role="group" aria-label="${E(L('Month'))}"><button class="chip" type="button" data-a="recapm" data-i="-1">${E(L('Previous month'))}</button><button class="chip" type="button" data-a="recapm" data-i="0" aria-pressed="${S.mo===0}">${E(L('This month'))}</button>${S.mo<0?`<button class="chip" type="button" data-a="recapm" data-i="1">${E(L('Next month'))}</button>`:''}</div>
<p style="margin:8px 0 0"><b>${E(MON(m.y))}</b></p><p class="mu" id="nx41mt" style="margin:4px 0">${m.done} ${E(L('finished'))}, ${m.cap} ${E(L('captured'))}, ${m.foc} ${E(L('min focused'))}. ${m.act} ${E(L('active days'))}.</p>
<div class="bars" style="gap:2px" role="img" aria-label="${E(L('Tasks finished per day'))}">${m.days.map(d=>`<div title="${E(d.k)}: ${d.done}"><i style="height:${Math.max(3,Math.round(80*d.done/mx))}px"></i></div>`).join('')}</div>
<p class="mu" style="margin:6px 0">${m.best&&m.best.done?E(L('Best day'))+': '+E(new Date(m.best.k+'T12:00').toLocaleDateString(undefined,{day:'numeric',month:'short'}))+' ('+m.best.done+'). ':''}${df?(df>0?'+':'')+df+' '+E(L('compared with the month before'))+'.':''}</p>
${m.pj.length?`<h2>${E(L('Most finished in'))}</h2><ul>${m.pj.map(([id,n])=>`<li class="row"><button class="rm" data-a="proj" data-i="${E(id)}"><b>${E(pname(id)||'?')}</b><small>${n}</small></button></li>`).join('')}</ul>`:''}
<p class="mu"><small>${E(L('Focus minutes come from the timeline, which keeps the latest 400 events.'))}</small></p>`);$('#rx').onclick=()=>dlg.close()};
const oRecap=A.recap;A.recap=function(){oRecap.apply(this,arguments);const r=$('#rx');if(r&&!$('#nx41m'))r.insertAdjacentHTML('beforebegin',`<button class="btn" id="nx41m" data-a="recapm" data-i="0">${E(L('Monthly recap'))}</button> `)};

/* ---------- 4. Study: question bank ---------- */
const qb=s=>Array.isArray(s.qb)?s.qb:(s.qb=[]);
const shuf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const oStudy=study;
study=function(){let h=oStudy.apply(this,arguments);
  if(S.sj){const s=subj(S.sj);if(s)h=h.replace(/(<button class="btn" data-a="bulk"[^>]*>[^<]*<\/button>)/,`$1<button class="btn" data-a="aicards" data-i="${E(s.id)}">${E(L('Make cards with AI'))}</button><button class="btn" data-a="qbk" data-i="${E(s.id)}">${E(L('Question bank'))} (${qb(s).length})</button>`)}return h};
A.qbk=sid=>{const s=subj(sid);if(!s)return;const Q=qb(s);
  sheet(`<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">${E(s.name)}: ${E(L('Question bank'))}</h2><button class="btn" id="qx">${E(L('Close'))}</button></div>
<p class="mu">${E(L('Questions kept apart from flashcards. Practice mixes multiple choice and written answers; the ones you miss come back first.'))}</p>
<div class="row2"><button class="btn p" data-a="qbp" data-i="${E(sid)}" ${Q.length?'':'disabled'}>${E(L('Practice'))}</button><button class="btn" data-a="qbe" data-i="${E(sid)}:">${E(L('Add question'))}</button><button class="btn" data-a="aiqs" data-i="${E(sid)}">${E(L('Make questions with AI'))}</button></div>
${Q.length?'<ul>'+Q.map(q=>`<li class="row"><button class="rm" data-a="qbe" data-i="${E(sid)}:${E(q.id)}"><b>${E(q.q)}</b><small>${q.t==='mc'?E(L('Multiple choice')):E(L('Written answer'))}, ${q.r|0} ${E(L('right'))}, ${q.w|0} ${E(L('missed'))}</small></button></li>`).join('')+'</ul>':`<p class="mu">${E(L('No questions yet.'))}</p>`}`);$('#qx').onclick=()=>dlg.close()};
A.qbe=x=>{const[sid,qid]=String(x).split(':'),s=subj(sid);if(!s)return;const q=qid&&qb(s).find(z=>z.id===qid);
  sheet(`<h2 style="margin:0">${E(q?L('Edit question'):L('New question'))}</h2><label><span>${E(L('Question'))}</span><textarea id="qq" rows="3" maxlength="500">${E(q?q.q:'')}</textarea></label>
<label><span>${E(L('Type'))}</span><select id="qt"><option value="mc" ${q&&q.t!=='mc'?'':'selected'}>${E(L('Multiple choice'))}</option><option value="sa" ${q&&q.t!=='mc'?'selected':''}>${E(L('Written answer'))}</option></select></label>
<label><span>${E(L('Correct answer'))}</span><input id="qa" maxlength="500" value="${E(q?q.a:'')}"></label>
<label id="qwl"><span>${E(L('Wrong options, one per line (2 to 5)'))}</span><textarea id="qw" rows="3">${E(q&&q.t==='mc'?q.o.filter(o=>o!==q.a).join('\n'):'')}</textarea></label>
<label><span>${E(L('Why (optional)'))}</span><input id="qe" maxlength="500" value="${E(q?q.e||'':'')}"></label>
<div class="row2"><button class="btn p" id="qs">${E(L('Save'))}</button>${q?`<button class="btn d" id="qd">${E(L('Delete'))}</button>`:''}<button class="btn" id="qz">${E(L('Cancel'))}</button></div>`);
  const sync=()=>{$('#qwl').hidden=$('#qt').value!=='mc'};sync();$('#qt').onchange=sync;$('#qz').onclick=()=>A.qbk(sid);
  $('#qs').onclick=()=>{const t=$('#qt').value,a=$('#qa').value.trim(),qq=$('#qq').value.trim(),w=[...new Set($('#qw').value.split('\n').map(v=>v.trim().slice(0,200)).filter(v=>v&&v!==a))].slice(0,5);
    if(!qq||!a){toast(L('Fill in the question and the answer.'));return}if(t==='mc'&&w.length<2){toast(L('Multiple choice needs at least 2 wrong options.'));return}
    const rec={q:qq,t,a,o:t==='mc'?[a,...w]:[],e:$('#qe').value.trim()};if(q)Object.assign(q,rec);else{if(qb(s).length>=2000){toast(L('Up to 2,000 questions per subject.'));return}qb(s).push({id:uid(),r:0,w:0,...rec})}save();A.qbk(sid)};
  if(q)$('#qd').onclick=()=>{s.qb=qb(s).filter(z=>z!==q);save();A.qbk(sid)}};
A.qbp=sid=>{const s=subj(sid);if(!s||!qb(s).length)return;
  const Q=shuf(qb(s)).sort((a,b)=>((b.w|0)-(b.r|0))-((a.w|0)-(a.r|0))).slice(0,10);const n=Q.length,miss=[];let right=0;
  const done=()=>{sheet(`<h2 style="margin:0">${E(L('Done'))}</h2><p>${right} ${E(L('of'))} ${n} ${E(L('right'))}.</p>${miss.length?`<h2>${E(L('To revisit'))}</h2><ul>${miss.map(q=>`<li class="row"><b>${E(q.q)}</b><small>${E(q.a)}${q.e?' - '+E(q.e):''}</small></li>`).join('')}</ul>`:''}<div class="row2"><button class="btn p" data-a="qbk" data-i="${E(sid)}">${E(L('Back to the bank'))}</button></div>`)};
  const mark=(q,ok)=>{q.r=(q.r|0)+(ok?1:0);q.w=(q.w|0)+(ok?0:1);if(ok)right++;else miss.push(q);save()};
  const step=()=>{if(!Q.length)return done();const q=Q[0],left=Q.length;
    if(q.t==='mc'){const opts=shuf(q.o);sheet(`<small>${left} ${E(L('left'))}</small><p style="font-size:22px;font-weight:600;margin:10px 0">${E(q.q)}</p><div>${opts.map((o,i)=>`<button class="btn nx41opt" data-o="${i}">${E(o)}</button>`).join('')}</div><div class="row2" id="qfb"></div>`);
      dlg.querySelectorAll('[data-o]').forEach(b=>b.onclick=()=>{const ok=opts[+b.dataset.o]===q.a;dlg.querySelectorAll('[data-o]').forEach(x=>{x.disabled=true;if(opts[+x.dataset.o]===q.a)x.classList.add('nx41ok')});mark(q,ok);Q.shift();
        $('#qfb').innerHTML=`<p style="width:100%;margin:6px 0">${E(ok?L('Correct.'):L('Not quite.'))} ${q.e?E(q.e):''}</p><button class="btn p" id="qn">${E(L('Next'))}</button>`;$('#qn').onclick=step})}
    else{sheet(`<small>${left} ${E(L('left'))}</small><p style="font-size:22px;font-weight:600;margin:10px 0">${E(q.q)}</p><div id="qsa"><div class="row2"><button class="btn p" id="qsh">${E(L('Show answer'))}</button></div></div>`);
      $('#qsh').onclick=()=>{$('#qsa').innerHTML=`<p style="font-size:19px">${E(q.a)}</p>${q.e?`<p class="mu">${E(q.e)}</p>`:''}<div class="row2"><button class="btn d" id="qno">${E(L('I missed it'))}</button><button class="btn p" id="qyes">${E(L('I knew it'))}</button></div>`;
        $('#qyes').onclick=()=>{mark(q,true);Q.shift();step()};$('#qno').onclick=()=>{mark(q,false);Q.shift();step()}}}};step()};

/* ---------- 5. Week view with times ---------- */
const WT='nexus.wkt'+NS,HH=44;
const tmin=t=>{const m=/^(\d{1,2}):(\d{2})$/.exec(t||'');return m&&+m[1]<24&&+m[2]<60?+m[1]*60+ +m[2]:null};
const hhmm=n=>String(Math.floor(n/60)%24).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
function weekGrid(){const o=S.wo||0,t=new Date(),dow=(t.getDay()+6)%7,s=new Date(t.getFullYear(),t.getMonth(),t.getDate()-dow+o*7),days=[...Array(7)].map((_,k)=>dk(new Date(s.getFullYear(),s.getMonth(),s.getDate()+k))),td=dk();
  const T=D.items.filter(i=>i.type==='task'&&days.includes(i.due)),len=i=>i.dur>=5?Math.min(i.dur,720):30,tm=T.filter(i=>tmin(i.tm)!==null),un=T.filter(i=>tmin(i.tm)===null);
  let a=8*60,b=18*60;tm.forEach(i=>{a=Math.min(a,Math.floor(tmin(i.tm)/60)*60);b=Math.max(b,Math.ceil(Math.min(1440,tmin(i.tm)+len(i))/60)*60)});const H=(b-a)/60;
  let h=`<div class="nx41g" style="--hh:${HH}px"><div></div>${days.map(k=>{const d=new Date(k+'T12:00');return`<div class="h ${k===td?'t':''}">${E(d.toLocaleDateString(undefined,{weekday:'short'}))}<b>${d.getDate()}</b></div>`}).join('')}`;
  h+=`<div class="gt"></div>${days.map(k=>`<div class="un">${un.filter(i=>i.due===k).map(i=>`<button type="button" data-a="open" data-i="${E(i.id)}" class="${i.done?'dn':''}">${E(i.title.slice(0,40))}</button>`).join('')}</div>`).join('')}`;
  h+=`<div class="gt" style="height:${H*HH}px">${[...Array(H)].map((_,x)=>`<i style="top:${x*HH}px">${String(a/60+x).padStart(2,'0')}</i>`).join('')}</div>`;
  days.forEach(k=>{const E1=tm.filter(i=>i.due===k).sort((x,y)=>tmin(x.tm)-tmin(y.tm)),lanes=[],pos=new Map();
    E1.forEach(i=>{const s0=tmin(i.tm),e0=s0+len(i);let l=lanes.findIndex(x=>x<=s0);if(l<0){l=lanes.length;lanes.push(0)}lanes[l]=e0;pos.set(i.id,l)});const nl=Math.max(1,lanes.length);
    h+=`<div class="col" style="height:${H*HH}px">${E1.map(i=>{const s0=tmin(i.tm),l=pos.get(i.id);return`<button type="button" class="nx41b ${i.done?'dn':''}" data-a="open" data-i="${E(i.id)}" style="top:${(s0-a)/60*HH}px;height:${Math.max(20,len(i)/60*HH-2)}px;left:${l*100/nl}%;width:calc(${100/nl}% - 2px)">${E(i.title.slice(0,50))}<small>${hhmm(s0)}</small></button>`}).join('')}${k===td&&(()=>{const n=t.getHours()*60+t.getMinutes();return n>=a&&n<=b?`<div class="nx41now" style="top:${(n-a)/60*HH}px"></div>`:''})()}</div>`});
  return h+'</div>'}
A.wkt=()=>{LS(WT,LS(WT)==='1'?'0':'1');render()};
const oRender=render;
render=function(){oRender.apply(this,arguments);try{
  if(S.tab!=='week'||($('#q')&&$('#q').value.trim()))return;const ch=$('#m .chips');if(!ch||$('#nx41t'))return;const on=LS(WT)==='1';
  ch.insertAdjacentHTML('beforeend',`<button class="chip" id="nx41t" type="button" data-a="wkt" aria-pressed="${on}">${E(L('Times'))}</button>`);
  if(on){document.querySelectorAll('#m section[data-day]').forEach(x=>x.hidden=true);const p=ch.nextElementSibling;(p||ch).insertAdjacentHTML('afterend',`<div class="nx41wk" id="nx41w">${weekGrid()}</div>`)}}catch(e){}};

/* ---------- 6. Graph of connections ---------- */
function graphData(f){const cap=150,its=D.items.filter(i=>f==='all'||i.type===f).sort((a,b)=>b.updated.localeCompare(a.updated)).slice(0,cap),ids=new Set(its.map(i=>i.id)),E2=[],seen=new Set();
  const add=(a,b,k)=>{if(a===b)return;const key=a<b?a+'|'+b:b+'|'+a;if(seen.has(key))return;seen.add(key);E2.push({a,b,k})};
  its.forEach(i=>{(i.links||[]).forEach(o=>{if(ids.has(o))add(i.id,o,'l')});if(i.project&&D.projects.some(p=>p.id===i.project))add(i.id,'p:'+i.project,'p')});
  const tg={};its.forEach(i=>(i.tags||[]).forEach(t=>(tg[t]=tg[t]||[]).push(i.id)));Object.values(tg).forEach(a=>a.forEach((x,k)=>{for(let j=1;j<=2&&k+j<a.length;j++)add(x,a[k+j],'r')}));
  for(let x=0;x<its.length;x++)for(let y=x+1;y<its.length;y++)if(rel(its[x],its[y]).s>=3)add(its[x].id,its[y].id,'r');
  const deg={};E2.forEach(e=>{deg[e.a]=(deg[e.a]||0)+1;deg[e.b]=(deg[e.b]||0)+1});
  const N=[...its.filter(i=>deg[i.id]).map(i=>({id:i.id,it:i,t:i.type,l:i.title})),...D.projects.filter(p=>deg['p:'+p.id]).map(p=>({id:'p:'+p.id,t:'project',l:p.name}))];
  N.forEach(n=>n.d=deg[n.id]||0);return{N,E:E2.filter(e=>N.some(n=>n.id===e.a)&&N.some(n=>n.id===e.b))}}
function layout(N,E2,W,Hh){const n=N.length,k=Math.sqrt(W*Hh/Math.max(1,n))*.75,ix=new Map();
  N.forEach((v,i)=>{const r=18*Math.sqrt(i+1),th=i*2.399963;v.x=W/2+r*Math.cos(th);v.y=Hh/2+r*Math.sin(th);v.dx=v.dy=0;ix.set(v.id,v)});
  let T=W/8;for(let it=0;it<220;it++){N.forEach(v=>{v.dx=v.dy=0});
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const a=N[i],b=N[j];let x=a.x-b.x,y=a.y-b.y,d=Math.hypot(x,y)||.1;const f=k*k/d;x=x/d*f;y=y/d*f;a.dx+=x;a.dy+=y;b.dx-=x;b.dy-=y}
    E2.forEach(e=>{const a=ix.get(e.a),b=ix.get(e.b);let x=a.x-b.x,y=a.y-b.y,d=Math.hypot(x,y)||.1;const f=d*d/k;x=x/d*f;y=y/d*f;a.dx-=x;a.dy-=y;b.dx+=x;b.dy+=y});
    N.forEach(v=>{v.dx+=(W/2-v.x)*.02;v.dy+=(Hh/2-v.y)*.02;const d=Math.hypot(v.dx,v.dy)||.1,m=Math.min(d,T);v.x=Math.min(W-14,Math.max(14,v.x+v.dx/d*m));v.y=Math.min(Hh-14,Math.max(14,v.y+v.dy/d*m))});T*=.975}return ix}
A.graph=f=>{f=['all','task','note','link','idea'].includes(f)?f:'all';const W=640,Hh=460,g=graphData(f),ix=layout(g.N,g.E,W,Hh);
  const shape=n=>{const r=n.t==='project'?9:4+Math.min(6,n.d),c=n.t==='project'?'var(--ink)':'var(--ac)',o=n.it&&n.it.done?.45:1;
    if(n.t==='note')return`<rect x="${n.x-r}" y="${n.y-r}" width="${2*r}" height="${2*r}" rx="2" fill="${c}" opacity="${o}"/>`;
    if(n.t==='link')return`<path d="M${n.x} ${n.y-r-1}L${n.x+r+1} ${n.y}L${n.x} ${n.y+r+1}L${n.x-r-1} ${n.y}Z" fill="${c}" opacity="${o}"/>`;
    if(n.t==='idea')return`<path d="M${n.x} ${n.y-r-1}L${n.x+r+1} ${n.y+r}L${n.x-r-1} ${n.y+r}Z" fill="${c}" opacity="${o}"/>`;
    if(n.t==='project')return`<rect x="${n.x-r}" y="${n.y-r}" width="${2*r}" height="${2*r}" rx="5" fill="none" stroke="${c}" stroke-width="2.5"/>`;
    return`<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${c}" opacity="${o}"/>`};
  const top=[...g.N].sort((a,b)=>b.d-a.d).slice(0,5);
  sheet(`<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">${E(L('Graph of connections'))}</h2><button class="btn" id="gx">${E(L('Close'))}</button></div>
<div class="chips" role="group" aria-label="${E(L('Show'))}">${[['all','Everything'],['task','Tasks'],['note','Notes'],['link','Saved'],['idea','Ideas']].map(([k,l])=>`<button class="chip" type="button" data-a="graph" data-i="${k}" aria-pressed="${f===k}">${E(L(l))}</button>`).join('')}</div>
${g.N.length?`<svg class="nx41gr" viewBox="0 0 ${W} ${Hh}" role="group" aria-label="${E(L('Graph of connections'))}">${g.E.map(e=>{const a=ix.get(e.a),b=ix.get(e.b);return`<line class="ed ${e.k}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`}).join('')}${g.N.map(n=>`<g ${n.it?`data-a="open" data-i="${E(n.id)}"`:`data-a="proj" data-i="${E(n.id.slice(2))}"`} tabindex="0" role="button" aria-label="${E(n.l)}"><title>${E(n.l)}</title>${shape(n)}${n.d>=3||n.t==='project'?`<text x="${n.x+9}" y="${n.y+3}">${E(n.l.slice(0,22))}</text>`:''}</g>`).join('')}</svg>
<p class="mu"><small>${E(L('Solid lines: links you made. Dashed: project. Faint: shared tags or words. Circle task, square note, diamond saved, triangle idea, outlined square project.'))}</small></p>
<p class="mu" id="nx41gs">${g.N.length} ${E(L('connected items'))}, ${g.E.length} ${E(L('connections'))}.</p><ul>${top.map(n=>`<li class="row"><button class="rm" ${n.it?`data-a="open" data-i="${E(n.id)}"`:`data-a="proj" data-i="${E(n.id.slice(2))}"`}><b>${E(n.l)}</b><small>${n.d} ${E(L('connections'))}</small></button></li>`).join('')}</ul>`:`<p class="mu">${E(L('Nothing is connected yet. Link items in the editor, give them the same tag or put them in a project.'))}</p>`}`);
  $('#gx').onclick=()=>dlg.close()};
const oBrowse=browse;browse=function(){let h=oBrowse.apply(this,arguments);if(!S.pj&&!S.col)h=h.replace(/(<p><button class="btn" data-a="tab" data-i="time">)/,`<p><button class="btn" data-a="graph" data-i="all" id="nx41gb">${E(L('Graph of connections'))}</button></p>$1`);return h};

/* ---------- 7. AI: card-making button and auto-filing (your own key; nothing is sent until you press or turn it on) ---------- */
async function aiCall(system,user,max=1200){
  const k=window.getKey&&window.getKey();if(!k)throw new Error(L('Add an API key or a free AI provider in Ask Nexus or Settings first.'));
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':k,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-sonnet-5-5',max_tokens:max,system,messages:[{role:'user',content:String(user).slice(0,8000)}]})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error((d.error&&d.error.message)||L('The AI service did not answer.')+' ('+r.status+')');
  return(d.content||[]).filter(b=>b&&b.type==='text').map(b=>b.text).join('\n')}
const jx=(t,o)=>{const m=String(t).match(o?/\{[\s\S]*\}/:/\[[\s\S]*\]/);try{return m?JSON.parse(m[0]):null}catch(e){return null}};
const cs=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
function aiMake(sid,mode){const s=subj(sid);if(!s)return;const nm=norm(s.name);
  const src=D.items.filter(i=>i.type!=='task'&&(norm(i.title).includes(nm)||(i.tags||[]).some(t=>norm(t)===nm))).slice(0,8).map(i=>i.title+'\n'+i.body).join('\n\n').slice(0,3000);
  const cards=mode==='cards';
  sheet(`<h2 style="margin:0">${E(cards?L('Make cards with AI'):L('Make questions with AI'))}</h2><p class="mu">${E(L('The text below is sent to your AI provider only when you press Make. You review everything before it is saved.'))}</p>
<label><span>${E(L('Text or topic'))}</span><textarea id="aiv" rows="7" maxlength="6000">${E(src)}</textarea></label><div class="row2"><button class="btn p" id="aig">${E(L('Make'))}</button><button class="btn" id="aic">${E(L('Cancel'))}</button></div><p class="mu" id="aie" role="status"></p><div id="aio"></div>`);
  $('#aic').onclick=()=>dlg.close();
  $('#aig').onclick=async()=>{const txt=$('#aiv').value.trim();if(!txt){$('#aie').textContent=L('Add some text or a topic first.');return}
    $('#aie').textContent=L('Working...');$('#aig').disabled=true;
    try{const sys=cards?'You write study flashcards from the text the user gives. Reply with only a JSON array of at most 12 objects {"q":"question","a":"answer"}. Use only facts in the text, or common knowledge if it is only a topic. q under 200 characters, a under 300.'
        :'You write exam questions from the text the user gives. Reply with only a JSON array of at most 8 objects {"q":"question","a":"correct answer","o":["wrong 1","wrong 2","wrong 3"],"e":"one-line reason"}. Use only facts in the text, or common knowledge if it is only a topic.';
      const arr=jx(await aiCall(sys,txt));if(!Array.isArray(arr))throw new Error(L('The answer was not in the expected form. Try again.'));
      const have=new Set((cards?s.cards:qb(s)).map(c=>norm(c.q)));
      const out=arr.map(x=>x&&typeof x==='object'?(cards?{q:cs(x.q,500),a:cs(x.a,1000)}:{q:cs(x.q,500),a:cs(x.a,500),o:(Array.isArray(x.o)?x.o:[]).map(v=>cs(v,200)).filter(v=>v&&v!==cs(x.a,500)).slice(0,4),e:cs(x.e,500)}):null)
        .filter(x=>x&&x.q&&x.a&&(cards||x.o.length>=2)&&!have.has(norm(x.q))).slice(0,cards?12:8);
      if(!out.length){$('#aie').textContent=L('Nothing new came back.');$('#aig').disabled=false;return}
      $('#aie').textContent='';$('#aio').innerHTML=`<h2>${E(L('Review'))}</h2><ul>${out.map((x,i)=>`<li class="row"><label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" data-k="${i}" checked><span><b>${E(x.q)}</b><br><small>${E(x.a)}</small></span></label></li>`).join('')}</ul><div class="row2"><button class="btn p" id="aiy">${E(L('Add selected'))}</button></div>`;
      $('#aiy').onclick=()=>{const pick=[...dlg.querySelectorAll('[data-k]')].filter(c=>c.checked).map(c=>out[+c.dataset.k]);
        if(cards)pick.forEach(x=>{if(s.cards.length<2000)s.cards.push({id:uid(),q:x.q,a:x.a,box:0,due:dk()})});
        else pick.forEach(x=>{if(qb(s).length<2000)qb(s).push({id:uid(),r:0,w:0,q:x.q,t:'mc',a:x.a,o:[x.a,...x.o],e:x.e})});
        save();dlg.close();render();toast(pick.length+' '+L(cards?'cards added':'questions added'))}}
    catch(e){$('#aie').textContent=String(e&&e.message||e);$('#aig').disabled=false}}}
A.aicards=sid=>aiMake(sid,'cards');A.aiqs=sid=>aiMake(sid,'qs');
const AF='nexus.aifile'+NS,oAdd=addItem;let afq=Promise.resolve();
async function autoFile(it){
  const P=D.projects.map(p=>p.name),Sb=D.study.map(s=>s.name);if(!P.length&&!Sb.length)return;
  const r=jx(await aiCall('You file a new note into one existing project and/or study subject. Reply with only JSON {"project":"exact name or null","subject":"exact name or null"}. Use null when nothing fits clearly.',`Projects: ${JSON.stringify(P)}\nSubjects: ${JSON.stringify(Sb)}\nItem: ${it.title}\n${it.body.slice(0,600)}`,200),1);
  if(!r||!get(it.id))return;const cur=get(it.id),pn=typeof r.project==='string'?D.projects.find(p=>norm(p.name)===norm(r.project)):null,sn=typeof r.subject==='string'?D.study.find(s=>norm(s.name)===norm(r.subject)):null,patch={};
  if(pn&&!cur.project)patch.project=pn.id;if(sn&&!(cur.tags||[]).some(t=>norm(t)===norm(sn.name)))patch.tags=[...(cur.tags||[]),sn.name.toLowerCase().slice(0,30)].slice(0,10);
  if(!Object.keys(patch).length)return;const before={project:cur.project,tags:(cur.tags||[]).slice()};upd(it.id,patch);cur.aiFiled=1;save();
  toast(L('Filed into')+' '+[pn&&pn.name,sn&&sn.name].filter(Boolean).join(' and '),L('Undo'),()=>{upd(it.id,before);render()})}
addItem=function(p){const it=oAdd.apply(this,arguments);try{
  if(it&&p&&!p.noai&&it.type!=='task'&&!it.media&&!it.project&&LS(AF)==='1'&&window.getKey&&window.getKey())afq=afq.then(()=>autoFile(it)).catch(()=>{});
  if(it&&it.media&&/pdf/i.test((it.media.mime||'')+it.media.name)&&LS('nexus.pdfidx'+NS)!=='0')setTimeout(()=>pdfIndex(it.id,{quiet:true}).catch(()=>{}),50)}catch(e){}return it};

/* ---------- 8. PDF text search with the bundled pdf.js (no AI, nothing leaves the device) ---------- */
let reader=async blob=>{const base=document.baseURI,lib=await import(new URL('vendor/pdf.min.mjs',base).href);lib.GlobalWorkerOptions.workerSrc=new URL('vendor/pdf.worker.min.mjs',base).href;
  const doc=await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,enableXfa:false}).promise;let out='';
  try{for(let n=1;n<=Math.min(doc.numPages,300)&&out.length<20000;n++){const pg=await doc.getPage(n),tc=await pg.getTextContent();out+=tc.items.map(x=>x.str).join(' ')+'\n'}}finally{try{await doc.destroy()}catch(e){}}return out};
const isPdf=it=>it&&it.media&&/pdf/i.test((it.media.mime||'')+(it.media.name||''));
async function pdfIndex(id,{force=false,quiet=false}={}){const it=get(id);if(!isPdf(it))return 0;if(it.ocr&&it.ocrBy!=='pdf'&&!force)return 0;
  const b=await bget(it.media.id);if(!b)return 0;let t='';try{t=await reader(b)}catch(e){if(!quiet)toast(L('Could not read this PDF here.'));return 0}
  t=t.replace(/\s+/g,' ').trim().slice(0,20000);if(!t){if(!quiet)toast(L('No text found. It may be a scan. "Read with AI" can try.'));return 0}
  if(JSON.stringify(D).length>4.2e6){if(!quiet)toast(L('Storage is nearly full. Free some space first.'));return-1}
  upd(id,{ocr:t,ocrBy:'pdf'});if(!quiet)toast(L('PDF is searchable now'));return t.length}
const oEdit=edit;edit=function(i){oEdit.apply(this,arguments);try{const it=get(i);if(!isPdf(it)||!$('#med')||$('#nx41px'))return;
  const at=$('#nxpv')?$('#nxpv').closest('p'):$('#med');at.insertAdjacentHTML('afterend',`<p><button class="btn" id="nx41px" type="button">${E(it.ocr?L('Index this PDF again'):L('Make this PDF searchable'))}</button></p>`);
  $('#nx41px').onclick=async()=>{$('#nx41px').disabled=true;await pdfIndex(i,{force:true});edit(i)}}catch(e){}};

/* ---------- 9. Settings ---------- */
const oSet=settings;
settings=function(){const r=oSet.apply(this,arguments);try{if(!dlg.open||$('#nx41s'))return r;
  const c=look(),f=fcfg(),sel=(id,lab,val,opts)=>`<label><span>${E(L(lab))}</span><select id="${id}">${opts.map(([k,l])=>`<option value="${k}" ${String(val)===String(k)?'selected':''}>${E(typeof l==='number'?l:L(l))}</option>`).join('')}</select></label>`;
  const nP=D.items.filter(i=>isPdf(i)&&(!i.ocr||i.ocrBy==='pdf'&&false)).length;
  dlg.insertAdjacentHTML('beforeend',`<div id="nx41s" class="nx41set"><h2>${E(L('Look and layout'))}</h2>
${sel('nx41wp','Wallpaper',c.wp,[['none','None'],['mist','Mist'],['dusk','Dusk'],['dots','Dots'],['grid','Grid'],['custom','My picture']])}
<label><span>${E(L('Choose a picture for the wallpaper'))}</span><input type="file" id="nx41wf" accept="image/*"></label>
${sel('nx41nv','Navigation style',c.nav,[['auto','Automatic (tabs on phones, side rail on laptops)'],['bottom','Tabs at the bottom'],['side','Side rail'],['top','Tabs at the top']])}
${sel('nx41dn','Layout density',c.den,[['comfy','Comfortable'],['compact','Compact']])}
${sel('nx41wd','Reading width',c.wid,[['narrow','Narrow'],['std','Standard'],['wide','Wide']])}
<h2>${E(L('Focus cycles'))}</h2>${sel('nx41fe','Sessions before a long break',f.every,[2,3,4,5,6,8].map(n=>[n,n]))}${sel('nx41fs','Short break (minutes)',f.short,[3,5,10].map(n=>[n,n]))}${sel('nx41fl','Long break (minutes)',f.long,[10,15,20,30].map(n=>[n,n]))}
<h2>${E(L('Search inside PDFs'))}</h2><p class="mu">${E(L('Nexus reads the text of PDFs on this device with a bundled reader. No AI, nothing is sent anywhere.'))}</p>
<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="nx41pa" ${LS('nexus.pdfidx'+NS)!=='0'?'checked':''}><span>${E(L('Index new PDFs automatically'))}</span></label><div class="row2"><button class="btn" id="nx41pi" type="button">${E(L('Index my PDFs now'))}${nP?' ('+nP+')':''}</button></div>
<h2>${E(L('AI filing'))}</h2><label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" id="nx41af" ${LS(AF)==='1'?'checked':''}><span>${E(L('File new captures into a project or subject with AI'))}<br><small class="mu">${E(L('When on, the text of each new note, idea or link and your project and subject names go to your AI provider. Off by default. Needs your own key.'))}</small></span></label></div>`);
  const on=(id,fn,ev='onchange')=>{const e=$('#'+id);if(e)e[ev]=fn};
  on('nx41wp',e=>setLook({wp:e.target.value}));on('nx41wf',e=>pickWallpaper(e.target.files[0]));on('nx41nv',e=>setLook({nav:e.target.value}));on('nx41dn',e=>setLook({den:e.target.value}));on('nx41wd',e=>setLook({wid:e.target.value}));
  const sv=()=>LS(FK,JSON.stringify({every:+$('#nx41fe').value,short:+$('#nx41fs').value,long:+$('#nx41fl').value}));['nx41fe','nx41fs','nx41fl'].forEach(i=>on(i,sv));
  on('nx41pa',e=>LS('nexus.pdfidx'+NS,e.target.checked?'1':'0'));on('nx41af',e=>LS(AF,e.target.checked?'1':'0'));
  on('nx41pi',async()=>{const b=$('#nx41pi');b.disabled=true;let n=0;for(const it of D.items.filter(i=>isPdf(i)&&!i.ocr)){if(await pdfIndex(it.id,{quiet:true})>0)n++}toast(n+' '+L('PDFs indexed'));b.disabled=false},'onclick')}catch(e){}return r};
A.settings=settings;

window.NXV41={look,setLook,applyLook,cycle:()=>({...cyc(),...fcfg()}),monthData,weekGrid,graphData,pdfIndex,setReader:f=>{reader=f},aiCall,autoFile,qb,aiMake};
})();
