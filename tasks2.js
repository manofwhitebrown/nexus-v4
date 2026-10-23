/* Nexus task layer. Loaded after plan.js.
   Priorities (high, medium, low), steps inside a task, a priority filter and sort, a week view,
   a streak line, a break after Focus and a screen wake lock while a session runs,
   an inline PDF viewer, two more smart collections and the reminder time for tasks that have a date but no time.
   Everything is added on top of the app; nothing in index.html is changed. */
(()=>{
const PRI={1:'High',2:'Medium',3:'Low'};
const pri=it=>it&&it.pri>=1&&it.pri<=3?it.pri:0;
const subs=it=>Array.isArray(it&&it.subs)?it.subs:[];
const L=s=>window.NXI18N?window.NXI18N.t(s):s;
const LS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}};
const PF='nexus.pfilter'+NS,PS='nexus.psort'+NS;
const filt=()=>LS(PF)||'all',sortBy=()=>LS(PS)||'date';

/* ---------- 1. Priority and steps in the task editor ---------- */
const oEdit2=edit;
edit=function(i){oEdit2(i);const it=get(i);if(!it||!$('#ed'))return;
  if(it.type==='task'&&!$('#npri')){
    const ek=$('#ek')&&$('#ek').closest('label');
    if(ek)ek.insertAdjacentHTML('beforebegin',`<label><span>Priority</span><select id="npri"><option value="0">None</option>${[1,2,3].map(n=>`<option value="${n}" ${pri(it)===n?'selected':''}>${PRI[n]}</option>`).join('')}</select></label>`);
    const sel=$('#npri');if(sel)sel.onchange=e=>{upd(i,{pri:+e.target.value||0})};
  }
  if(it.type==='task'&&!$('#nxsb')){
    const eb=$('#eb')&&$('#eb').closest('label');
    if(eb){eb.insertAdjacentHTML('afterend','<div id="nxsb"></div>');drawSteps(i)}
  }
  if(it.media&&/pdf/i.test(it.media.mime||'')&&!$('#nxpv')&&$('#med'))
    $('#med').insertAdjacentHTML('afterend','<p><button class="btn" id="nxpv" type="button">View PDF here</button></p>');
  if($('#nxpv'))$('#nxpv').onclick=()=>viewPdf(i);
};
function drawSteps(i){const it=get(i),box=$('#nxsb');if(!it||!box)return;const S2=subs(it);
  box.innerHTML=`<span class="mu" id="nxst">Steps${S2.length?' ('+S2.filter(s=>s.d).length+'/'+S2.length+')':''}</span>
  <ul role="group" aria-labelledby="nxst">${S2.map(s=>`<li class="row" style="display:flex;align-items:center;gap:8px"><label style="flex:1;display:flex;gap:8px;align-items:center"><input type="checkbox" data-s="${E(s.id)}" ${s.d?'checked':''}><span class="${s.d?'dn':''}">${E(s.t)}</span></label><button class="btn" type="button" data-sd="${E(s.id)}" aria-label="Remove step: ${E(s.t)}">&times;</button></li>`).join('')}</ul>
  <div style="display:flex;gap:8px;margin-top:6px"><input id="nxsi" maxlength="200" aria-label="Add a step" placeholder="Add a step" autocomplete="off"><button class="btn" id="nxsa" type="button">Add</button></div>`;
  const put=a=>{upd(i,{subs:a});drawSteps(i)};
  box.querySelectorAll('[data-s]').forEach(c=>c.onchange=()=>put(subs(get(i)).map(s=>s.id===c.dataset.s?{...s,d:c.checked}:s)));
  box.querySelectorAll('[data-sd]').forEach(b=>b.onclick=()=>put(subs(get(i)).filter(s=>s.id!==b.dataset.sd)));
  const add=()=>{const v=$('#nxsi').value.trim().slice(0,200);if(!v)return;if(subs(get(i)).length>=50){toast('Up to 50 steps per task.');return}put(subs(get(i)).concat({id:uid(),t:v,d:false}));const n=$('#nxsi');if(n)n.focus()};
  $('#nxsa').onclick=add;$('#nxsi').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add()}};
}

/* ---------- 2. Inline PDF viewer ---------- */
async function viewPdf(i){const it=get(i);if(!it||!it.media)return;let url='';
  try{const b=await bget(it.media.id);if(!b){toast('The file is missing on this device.');return}url=URL.createObjectURL(new Blob([b],{type:'application/pdf'}))}catch(e){toast('Could not open the file.');return}
  sheet(`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2 style="margin:0;overflow:hidden;text-overflow:ellipsis">${E(it.media.name||it.title||'PDF')}</h2><button class="btn" id="nxpb" type="button">Back</button></div>
  <iframe title="${E(it.media.name||'PDF')}" src="${url}" style="width:100%;height:68vh;border:0;margin-top:10px;background:#fff"></iframe>
  <p class="mu"><small>If the page stays blank, this browser cannot show PDFs inline. </small><a href="${url}" download="${E(it.media.name||'file.pdf')}">Download it instead</a></p>`);
  const done=()=>{try{URL.revokeObjectURL(url)}catch(e){}};
  $('#nxpb').onclick=()=>{done();edit(i)};dlg.addEventListener('close',done,{once:true});
}

/* ---------- 3. Rows: priority and steps, filter and sort on Tasks, streak ---------- */
const streak=()=>{const days=new Set(D.log.filter(l=>l.k==='done').map(l=>dk(new Date(l.t))));let n=0,d=new Date();if(!days.has(dk(d)))d.setDate(d.getDate()-1);while(days.has(dk(d))){n++;d.setDate(d.getDate()-1)}return n};
window.nxStreak=streak;
function decorate(){const m=$('#m');if(!m)return;
  m.querySelectorAll('li.row').forEach(li=>{const b=li.querySelector('[data-a="open"]');if(!b||li.dataset.nx2)return;const it=get(b.dataset.i);if(!it||it.type!=='task')return;li.dataset.nx2='1';
    const sm=b.querySelector('small'),bits=[];const p=pri(it),S2=subs(it);
    if(p&&!it.done)bits.push(L(PRI[p])+' '+L('priority'));
    if(S2.length)bits.push(S2.filter(s=>s.d).length+'/'+S2.length+' '+L('steps'));
    li.dataset.pri=String(p||4);
    if(bits.length){if(sm)sm.textContent=[sm.textContent,...bits].filter(Boolean).join(', ');else b.insertAdjacentHTML('beforeend','<small>'+E(bits.join(', '))+'</small>')}
  });
  if(S.tab==='tasks'&&!$('#q').value.trim()&&!$('#nxpf')&&$('#qa')){
    const f=filt(),so=sortBy(),n=streak();
    $('#qa').insertAdjacentHTML('afterend',`${n>0?`<p class="mu" id="nxsk" style="margin:8px 0 0">${n} ${L(n===1?'day streak':'day streak')}</p>`:''}<div class="chips" id="nxpf" role="group" aria-label="Filter by priority" style="margin-top:10px">${[['all','All'],['1','High'],['2','Medium'],['3','Low']].map(([k,l])=>`<button class="chip" type="button" data-nf="${k}" aria-pressed="${f===k}">${L(l)}</button>`).join('')}<button class="chip" type="button" data-ns="1" aria-pressed="${so==='pri'}">${L('Sort by priority')}</button><button class="chip" type="button" data-a="weekview">${L('Week view')}</button></div>`);
    $('#nxpf').onclick=e=>{const c=e.target.closest('[data-nf]'),s=e.target.closest('[data-ns]');if(c){LS(PF,c.dataset.nf);render()}else if(s){LS(PS,sortBy()==='pri'?'date':'pri');render()}};
    if(so==='pri')m.querySelectorAll('ul').forEach(ul=>{[...ul.children].map((li,ix)=>[li,ix]).sort((a,b)=>(+a[0].dataset.pri||4)-(+b[0].dataset.pri||4)||a[1]-b[1]).forEach(([li])=>ul.appendChild(li))});
    if(f!=='all'){m.querySelectorAll('ul>li.row').forEach(li=>{if(li.dataset.pri!==f)li.hidden=true});
      m.querySelectorAll('h2').forEach(h=>{const u=h.nextElementSibling;if(u&&u.tagName==='UL'&&![...u.children].some(x=>!x.hidden)){h.hidden=true;u.hidden=true}})}
  }
  if(S.tab==='plan'&&!$('#nxwk')&&$('#m').firstElementChild)$('#m').firstElementChild.insertAdjacentHTML('afterend','<button class="btn" id="nxwk" type="button" data-a="weekview" style="margin:6px 0">'+E(L('Week view'))+'</button>');
}

/* ---------- 4. Week view ---------- */
window.nxDecorate=()=>decorate();
const mon=o=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7)+7*o);return d};
window.nxMon=mon;
function weekHtml(){const o=S.wo||0,s=mon(o),days=[...Array(7)].map((_,k)=>{const d=new Date(s);d.setDate(s.getDate()+k);return dk(d)}),td=dk();
  const rng=new Date(days[0]+'T12:00').toLocaleDateString(undefined,{day:'numeric',month:'short'})+' - '+new Date(days[6]+'T12:00').toLocaleDateString(undefined,{day:'numeric',month:'short'});
  let h=`<h1>${E(L('Week view'))}</h1><div class="chips" role="group" aria-label="Week"><button class="chip" type="button" data-a="wkgo" data-i="-1">${E(L('Previous week'))}</button><button class="chip" type="button" data-a="wkgo" data-i="0" aria-pressed="${o===0}">${E(L('This week'))}</button><button class="chip" type="button" data-a="wkgo" data-i="1">${E(L('Next week'))}</button></div><p class="mu">${E(rng)}</p>`;
  let n=0;days.forEach(k=>{const T=D.items.filter(i=>i.type==='task'&&i.due===k).sort((a,b)=>(a.done-b.done)||(a.tm||'99:99').localeCompare(b.tm||'99:99')||((pri(a)||4)-(pri(b)||4)));n+=T.length;
    const lab=new Date(k+'T12:00').toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short'})+(k===td?' ('+L('today')+')':'');
    h+=`<section data-day="${k}"><h2${k===td?' aria-current="date"':''}>${E(lab)}</h2>`+(T.length?list(T):'<p class="mu" style="margin:0">'+E(L('Nothing planned'))+'</p>')+'</section>'});
  const un=D.items.filter(i=>i.type==='task'&&!i.done&&!i.due).length;
  h+=`<p class="mu" style="margin-top:18px">${n} ${E(L('tasks this week'))}. ${un?un+' '+E(L('have no date'))+'. ':''}<button class="chip" type="button" data-a="tab" data-i="tasks">${E(L('Go to Tasks'))}</button> <button class="chip" type="button" data-a="planview">${E(L('Plan your day'))}</button></p>`;
  return h}
A.weekview=()=>{S.wo=0;S.tab='week';S.pj=S.col=S.sj=null;const q=$('#q');if(q)q.value='';if(dlg.open)dlg.close();render();scrollTo(0,0)};
A.wkgo=i=>{S.wo=+i===0?0:(S.wo||0)+(+i);render()};
A.planview=A.planview||(()=>{});
const oRender2=render;
render=function(){const wk=S.tab==='week'&&!($('#q')&&$('#q').value.trim());
  if(wk)S.tab='tasks';
  try{oRender2()}finally{if(wk)S.tab='week'}
  if(wk){$('#m').innerHTML=weekHtml()+foot();$('#nv').querySelectorAll('[aria-current]').forEach(b=>b.removeAttribute('aria-current'))}
  try{decorate()}catch(e){}};

/* ---------- 5. More smart collections ---------- */
const oCols=cols;
cols=function(){const c=oCols();c['High priority']=i=>i.type==='task'&&!i.done&&i.pri===1;c['Tasks with open steps']=i=>i.type==='task'&&!i.done&&subs(i).some(s=>!s.d);return c};

/* ---------- 6. Focus: screen wake lock and a break afterwards ---------- */
let wl=null;
const lock=async()=>{try{if(!navigator.wakeLock||wl)return;wl=await navigator.wakeLock.request('screen');wl.addEventListener('release',()=>{wl=null})}catch(e){wl=null}};
const unlock=()=>{try{if(wl)wl.release()}catch(e){}wl=null};
let BR=null;
const mmss=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
function brk(min){const o=$('#fx');if(!o)return;if(BR)clearInterval(BR.h);BR={end:Date.now()+min*6e4};
  const draw=()=>{const left=Math.max(0,Math.ceil((BR.end-Date.now())/1e3));o.style.display='flex';
    o.innerHTML=`<p>${E(L('Break'))}</p><div class="tm" aria-live="off">${mmss(left)}</div><p>${E(left?L('Rest your eyes. Stand up and stretch.'):L('Break is over.'))}</p><div class="row2" style="justify-content:center"><button class="btn" data-a="nxbe">${E(L('End break'))}</button></div>`;
    if(!left){clearInterval(BR.h);try{notify('Break is over','Ready for the next one?','break');navigator.vibrate&&navigator.vibrate(200)}catch(e){}}};
  draw();BR.h=setInterval(draw,1e3)}
A.nxbe=()=>{if(BR)clearInterval(BR.h);BR=null;const o=$('#fx');if(o){o.style.display='none';o.innerHTML=''}};
A.nxbrk=m=>{stopF();brk(+m||5)};
setInterval(()=>{try{
  if(F&&F.run&&F.left>0)lock();else unlock();
  if(F&&F.left===0&&!F.run){const r=$('#fx .row2');if(r&&!$('#nxbk'))r.insertAdjacentHTML('afterbegin',`<button class="btn" id="nxbk" data-a="nxbrk" data-i="5">${E(L('Take a 5 minute break'))}</button>`)}
}catch(e){}},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&F&&F.run)lock()});

/* ---------- 7. Settings: reminder time for tasks with a date but no time ---------- */
const DK='nexus.remdef'+NS;
const oSet=settings;
settings=function(){const r=oSet.apply(this,arguments);
  try{if(dlg.open&&!$('#nxrd')){const v=LS(DK);const cur=v===null?'09:00':v;
    dlg.insertAdjacentHTML('beforeend',`<label style="margin-top:14px"><span>${E(L('Reminder for tasks with a date but no time'))}</span><select id="nxrd">${[['','Off'],['08:00','8:00'],['09:00','9:00'],['12:00','12:00'],['18:00','18:00']].map(([k,l])=>`<option value="${k}" ${cur===k?'selected':''}>${E(l==='Off'?L('Off'):l)}</option>`).join('')}</select><small>${E(L('Only the Android app rings these. Later times only: nothing is sent for the past.'))}</small></label>`);
    $('#nxrd').onchange=e=>{LS(DK,e.target.value);try{window.nxSync&&window.nxSync()}catch(x){}}}}catch(e){}
  return r};
A.settings=settings;

/* ---------- 8. Ctrl+Enter (or Cmd+Enter) opens Capture ---------- */
document.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||e.altKey||e.key!=='Enter'||dlg.open)return;
  const t=e.target;if(t&&t.tagName==='TEXTAREA')return;e.preventDefault();try{A.cap()}catch(x){}});

try{render()}catch(e){}
})();
