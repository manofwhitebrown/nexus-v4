/* Nexus time (Phase 2). Loaded after dates.js and palette.js.
   Adds a start time and a length to tasks ("time blocks"), a Plan screen that lays one day out hour by hour
   (drag a task onto the day, drag its bottom edge to change the length), your phone's calendar shown beside
   your tasks (Android app only), a shrinking disc in Focus mode, and clock phrases in the capture box:
   "at 5pm", "at 17:30", "noon", "in 2 hours", "for 45 min".
   A task keeps its date in "due" and gains "tm" ("HH:MM") and "dur" (minutes). Tasks without "tm" are unchanged. */
(()=>{
const N=window.NexusNative;
const SNAP=15,DEF=30,MAXD=480,PX=56,LENS=[15,30,45,60,90,120,180,240];
const TM=/^([01]\d|2[0-3]):[0-5]\d$/;

/* ---------- time helpers ---------- */
const mins=tm=>+tm.slice(0,2)*60+ +tm.slice(3);
const hm=n=>{n=Math.max(0,Math.min(1439,Math.round(n)));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
const fmtT=n=>new Date(2000,0,1,Math.floor(n/60)%24,n%60).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const lenOf=t=>{const d=t&&t.dur|0;return d>=5?Math.min(MAXD,d):DEF};
/* The block a task occupies on its day, in minutes from midnight, or null when it has no start time. */
const slot=t=>{if(!t||t.type!=='task'||!t.due||!TM.test(t.tm||''))return null;const s=mins(t.tm),d=lenOf(t);return{s,e:Math.min(1440,s+d),d}};
const atMs=t=>{const s=slot(t);return s?new Date(t.due+'T'+hm(s.s)+':00').getTime():0};
const shift=(k,n)=>{const d=new Date(k+'T12:00');d.setDate(d.getDate()+n);return dk(d)};
const dayLabel=k=>k===dk()?'Today':k===addD(1)?'Tomorrow':k===addD(-1)?'Yesterday':new Date(k+'T12:00').toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'});
const snap=m=>Math.round(m/SNAP)*SNAP;
const lenOpts=cur=>{const a=LENS.includes(cur)?LENS:[...LENS,cur].sort((x,y)=>x-y);return a.map(m=>`<option value="${m}" ${m===cur?'selected':''}>${m<60?m+' min':m%60?(m/60).toFixed(1).replace('.0','')+' h':(m/60)+' h'}</option>`).join('')};

/* Public pieces other files and the tests use. */
window.nxT={slot,at:atMs,fmt:fmtT,mins,hm,len:lenOf};
const place=(id,day,startMin,dur)=>{const it=get(id);if(!it||it.type!=='task'||!day)return false;
  const d=dur||lenOf(it);upd(id,{due:day,tm:hm(Math.max(0,Math.min(1440-d,startMin))),dur:d});return true};
const unplace=id=>{const it=get(id);if(!it)return false;upd(id,{tm:null,dur:null});return true};
window.nxPlace=place;window.nxUnplace=unplace;

/* ---------- clock phrases in what you type ---------- */
const WB='(?<![\\p{L}\\p{N}])',WA='(?![\\p{L}\\p{N}])';
const CL={
  inM:new RegExp(WB+'in\\s+(\\d{1,3})\\s*(hours?|hrs?|h|minutes?|mins?|m)'+WA,'iu'),
  ampm:new RegExp(WB+'(?:at\\s+)?(\\d{1,2})(?::([0-5]\\d))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)'+WA,'iu'),
  at:new RegExp(WB+'at\\s+(\\d{1,2})(?::([0-5]\\d))?(?![\\p{L}\\p{N}:])','iu'),
  hhmm:new RegExp('(?<![\\p{L}\\p{N}:.])([01]?\\d|2[0-3]):([0-5]\\d)(?![\\p{L}\\p{N}:])','u'),
  noon:new RegExp(WB+'(?:at\\s+)?(noon|midday)'+WA,'iu'),
  dur:new RegExp(WB+'for\\s+(\\d+(?:\\.\\d+)?)\\s*(hours?|hrs?|h|minutes?|mins?|m)'+WA,'iu')
};
/* "at 5" with no am or pm: 1 to 6 is taken as the afternoon, 7 to 11 as the morning. */
const guess=(h,mi)=>(h>=1&&h<=6?h+12:h)*60+mi;
function clock(text){
  const t=String(text||'');let m,tm=null,due=null,dur=null;
  if((m=CL.inM.exec(t))){
    const n=+m[1],u=/^h/i.test(m[2])?36e5:6e4,d=new Date(Math.ceil((Date.now()+n*u)/3e5)*3e5);
    tm=hm(d.getHours()*60+d.getMinutes());due=dk(d);
  }else if((m=CL.noon.exec(t)))tm='12:00';
  else if((m=CL.ampm.exec(t))){
    const h=+m[1],mi=+(m[2]||0);
    if(h>=1&&h<=12)tm=hm(((h%12)+(/^p/i.test(m[3])?12:0))*60+mi);
  }else if((m=CL.at.exec(t))){
    const h=+m[1],mi=+(m[2]||0);if(h<=23)tm=hm(guess(h,mi));
  }else if((m=CL.hhmm.exec(t)))tm=hm(+m[1]*60+ +m[2]);
  if((m=CL.dur.exec(t))){const n=+m[1]*(/^h/i.test(m[2])?60:1);if(n>=5)dur=Math.min(MAXD,Math.round(n))}
  return{tm,due,dur};
}
window.nxClock=clock;
const oParse=parse;
parse=function(t,f){const p=oParse(t,f);
  if(p&&p.type==='task'){const c=clock(t);
    if(c.tm){p.tm=c.tm;
      if(c.due)p.due=c.due;
      else if(!p.due){const n=new Date();p.due=mins(c.tm)>n.getHours()*60+n.getMinutes()?dk():addD(1)}
      if(c.dur)p.dur=c.dur}}
  return p};
const oAdd=addItem;
addItem=function(p){const it=oAdd(p);
  if(it&&p&&it.type==='task'&&TM.test(p.tm||'')){it.tm=p.tm;if(p.dur)it.dur=Math.max(5,Math.min(MAXD,p.dur|0));if(!it.due)it.due=dk();save()}
  return it};
/* A repeating task keeps its time of day when the next one is made. */
const oUpd=upd;
upd=function(i,patch){const it=get(i),was=it&&it.done,n0=D.items.length;oUpd(i,patch);
  if(it&&patch&&patch.done===true&&!was&&it.rep&&it.tm&&D.items.length>n0){
    const n=D.items[D.items.length-1];
    if(n&&n!==it&&n.type==='task'&&!n.done&&n.title===it.title&&n.rep===it.rep){n.tm=it.tm;if(it.dur)n.dur=it.dur;save()}}};

/* ---------- start time and length in the task editor ---------- */
const oEdit=edit;
edit=function(i){oEdit(i);const it=get(i);if(!it||it.type!=='task'||!$('#ed'))return;
  const lab=$('#ed').closest('label');if(!lab||$('#etm'))return;
  const blk=document.createElement('div');
  blk.innerHTML=`<label><span>Start time, optional</span><input id="etm" type="time" step="900" value="${E(it.tm||'')}"></label><label><span>Length</span><select id="edu">${lenOpts(lenOf(it))}</select></label>`;
  lab.after(blk);
  $('#etm').onchange=e=>{const v=e.target.value;
    if(!TM.test(v)){upd(i,{tm:null,dur:null});return}
    if(!it.due){upd(i,{due:dk()});$('#ed').value=dk()}
    upd(i,{tm:v,dur:lenOf(it)})};
  $('#edu').onchange=e=>{upd(i,{dur:+e.target.value})};
};

/* ---------- the phone calendar (Android app) ---------- */
const HK='nexus.calhide'+NS,evCache={};
const calState=()=>N&&typeof N.calendarState==='function'?N.calendarState():'none';
const calHidden=()=>{try{return localStorage.getItem(HK)==='1'}catch(e){return false}};
function events(day){
  const out={ad:[],tm:[]};
  if(calState()!=='on'||calHidden())return out;
  const c=evCache[day];if(c&&Date.now()-c.t<45e3)return c.v;
  const a=new Date(day+'T00:00:00'),b=new Date(a);b.setDate(b.getDate()+1);
  let raw=[];try{raw=JSON.parse(N.calendarEvents(a.getTime(),b.getTime())||'[]')}catch(e){}
  (Array.isArray(raw)?raw:[]).forEach(o=>{if(!o)return;const t=String(o.t||'Busy').slice(0,80);
    if(o.ad){if(String(o.d)<=day&&day<String(o.e))out.ad.push(t)}
    else{const s=Math.max(0,Math.round((o.b-a.getTime())/6e4)),e=Math.min(1440,Math.round((o.e-a.getTime())/6e4));if(e>s)out.tm.push({s,e,t})}});
  evCache[day]={t:Date.now(),v:out};return out;
}
window.nxCalReady=()=>{for(const k in evCache)delete evCache[k];if(S.tab==='plan')render()};

/* ---------- the Plan screen ---------- */
let PD=dk(),SEL=null,JD=false,inPlan=false;
const lay=a=>{a.sort((x,y)=>x.s-y.s||y.e-x.e);let cl=[],ce=-1;
  const flush=()=>{const n=cl.reduce((m,x)=>Math.max(m,x.l+1),1);cl.forEach(x=>x.n=n)};
  for(const x of a){if(x.s>=ce){flush();cl=[];ce=-1}
    const used=cl.filter(y=>y.e>x.s).map(y=>y.l);let l=0;while(used.includes(l))l++;x.l=l;cl.push(x);ce=Math.max(ce,x.e)}
  flush();return a};
const range=(a,today)=>{let h0=7,h1=22;a.forEach(x=>{h0=Math.min(h0,Math.floor(x.s/60));h1=Math.max(h1,Math.ceil(x.e/60))});
  if(today){const n=new Date(),m=n.getHours();h0=Math.min(h0,m);h1=Math.max(h1,m+2)}return[Math.max(0,h0),Math.min(24,h1)]};
const trayOf=day=>{const td=dk();
  return D.items.filter(t=>t.type==='task'&&!t.done&&!slot(t)&&(t.due===day||(day===td&&(!t.due||t.due<td))))
    .sort((a,b)=>(a.due||'9').localeCompare(b.due||'9')||a.created.localeCompare(b.created))};
function planPage(){
  const day=PD,td=dk(),ev=events(day);
  const items=D.items.filter(t=>t.type==='task'&&t.due===day&&slot(t)).map(t=>{const s=slot(t);return{k:'t',id:t.id,s:s.s,e:s.e,t:t.title,done:t.done}})
    .concat(ev.tm.map(x=>({k:'c',s:x.s,e:x.e,t:x.t})));
  lay(items);
  const[h0,h1]=range(items,day===td),tray=trayOf(day);
  let h=`<div class="nxhd"><h1>Plan</h1><div class="row2" style="margin-top:0"><button class="btn" data-a="nxprev" aria-label="Previous day">&lsaquo;</button><button class="btn" data-a="nxtoday">Today</button><button class="btn" data-a="nxnext" aria-label="Next day">&rsaquo;</button></div></div>`;
  h+=`<p class="mu" style="margin:4px 0 0" id="nxday">${E(dayLabel(day))}</p>`;
  if(ev.ad.length)h+=`<p class="mu" style="margin:8px 0 0">All day: ${ev.ad.map(E).join(', ')}</p>`;
  if(N&&typeof N.calendarState==='function'){
    h+=calState()!=='on'
      ?`<div class="card" style="margin-top:12px"><b>Show your phone calendar here</b><p class="mu" style="margin:4px 0 10px">Events appear next to your tasks so you can see what is free. Nexus only reads them on this phone.</p><button class="btn" data-a="nxcal">Allow calendar</button></div>`
      :`<p style="margin:10px 0 0"><button class="btn" data-a="nxcalhide">${calHidden()?'Show calendar events':'Hide calendar events'}</button></p>`}
  h+=`<div class="nxg" id="nxg" data-h0="${h0}" data-day="${day}" style="height:${(h1-h0)*PX}px">`;
  for(let x=h0;x<h1;x++)h+=`<div class="nxh" style="top:${(x-h0)*PX}px"><span>${E(fmtT(x*60))}</span></div>`;
  h+='<div class="nxz" id="nxz">';
  items.forEach(b=>{
    const w=100/b.n,pos=`top:${(b.s-h0*60)*PX/60}px;height:${Math.max(24,(b.e-b.s)*PX/60-2)}px;left:${b.l*w}%;width:calc(${w}% - 4px)`,rng=fmtT(b.s)+' to '+fmtT(b.e);
    h+=b.k==='c'
      ?`<div class="nxe" style="${pos}"><b>${E(b.t)}</b><small>${E(rng)}</small></div>`
      :`<div class="nxb ${b.done?'dn':''}" role="button" tabindex="0" data-nb="${E(b.id)}" ${b.done?'':`data-drag="${E(b.id)}"`} data-a="nxopen" data-i="${E(b.id)}" aria-label="${E(b.t+', '+rng+'. Open details')}" style="${pos}"><b>${E(b.t)}</b><small>${E(rng)}</small>${b.done?'':`<i class="nxr" data-rs="${E(b.id)}" aria-hidden="true"></i>`}</div>`});
  h+='</div>';
  if(day===td){const n=new Date(),m=n.getHours()*60+n.getMinutes();if(m>=h0*60&&m<=h1*60)h+=`<div class="nxn" style="top:${(m-h0*60)*PX/60}px"></div>`}
  h+='</div>';
  h+=`<h2>To place</h2>`;
  h+=tray.length
    ?`<p class="mu" style="margin:0 0 10px">Drag a task onto the day, or tap it and then tap a time. On a phone, press and hold to drag.</p><div class="nxt" id="nxt">${tray.slice(0,30).map(t=>`<button class="nxc" data-drag="${E(t.id)}" data-a="nxsel" data-i="${E(t.id)}" aria-pressed="${SEL===t.id}">${E(t.title.slice(0,60))}</button>`).join('')}</div>${tray.length>30?`<p class="mu">${tray.length-30} more not shown.</p>`:''}`
    :`<p class="mu" id="nxt">Everything for this day has a time, or there is nothing due.</p>`;
  return h;
}
const oRender=render;
render=function(){const q=$('#q');if(S.tab!=='plan'||(q&&q.value.trim()))return oRender();
  inPlan=true;S.tab='tasks';try{oRender()}finally{S.tab='plan';inPlan=false}};
const oTasks=tasks;
tasks=function(){if(inPlan)return planPage();
  return oTasks().replace('</form>','</form><div class="row2" style="margin-top:10px"><button class="btn" data-a="planview">Plan your day</button></div>')};

A.planview=()=>{PD=dk();SEL=null;S.tab='plan';S.pj=S.col=S.sj=null;const q=$('#q');if(q)q.value='';if(dlg.open)dlg.close();render();scrollTo(0,0)};
A.nxprev=()=>{PD=shift(PD,-1);SEL=null;render()};
A.nxnext=()=>{PD=shift(PD,1);SEL=null;render()};
A.nxtoday=()=>{PD=dk();SEL=null;render()};
A.nxsel=id=>{SEL=SEL===id?null:id;render()};
A.nxcal=()=>{if(N&&N.calendarAllow)N.calendarAllow()};
A.nxcalhide=()=>{try{localStorage.setItem(HK,calHidden()?'0':'1')}catch(e){}render()};
A.nxopen=id=>{
  const it=get(id);if(!it||it.type!=='task')return;const s=slot(it);
  sheet(`<div class="nxhd"><h2 style="margin:0">${E(it.title)}</h2><button class="btn" id="nxx">Close</button></div><p class="mu" id="nxw">${s?E(fmtT(s.s)+' to '+fmtT(s.e)+', '+dayLabel(it.due)):'Not on the plan yet'}</p>
<label><span>Start time</span><input id="nxs" type="time" step="900" value="${E(it.tm||'')}"></label><label><span>Length</span><select id="nxl">${lenOpts(lenOf(it))}</select></label>
<div class="row2"><button class="btn p" id="nxf">Focus on this</button>${it.done?'':'<button class="btn" id="nxd">Mark done</button>'}<button class="btn" id="nxo">Open task</button><button class="btn" id="nxu">Take off the plan</button></div>`);
  $('#nxx').onclick=()=>dlg.close();
  $('#nxs').onchange=e=>{const v=e.target.value;if(!TM.test(v))return;place(id,it.due||PD,mins(v),lenOf(it));render();A.nxopen(id)};
  $('#nxl').onchange=e=>{upd(id,{dur:+e.target.value});render();A.nxopen(id)};
  $('#nxf').onclick=()=>{dlg.close();focus(id,Math.max(5,Math.min(120,s?s.d:25)))};
  if($('#nxd'))$('#nxd').onclick=()=>{upd(id,{done:true});dlg.close();render()};
  $('#nxo').onclick=()=>edit(id);
  $('#nxu').onclick=()=>{unplace(id);dlg.close();render()};
};

/* ---------- drag to schedule: mouse, pen and touch ---------- */
let DR=null,raf=0;
const clean=()=>{if(!DR)return;clearTimeout(DR.timer);if(DR.ghost)DR.ghost.remove();const p=$('#nxp');if(p)p.remove();document.querySelectorAll('.mv').forEach(e=>e.classList.remove('mv'));cancelAnimationFrame(raf);DR=null};
function target(){
  const g=$('#nxg');if(!g||!DR)return null;const R=g.getBoundingClientRect(),h0=+g.dataset.h0,it=get(DR.id);if(!it)return null;
  if(DR.mode==='resize'){const sl=slot(it);if(!sl)return null;
    const end=snap((DR.y-R.top)/PX*60+h0*60);return{s:sl.s,d:Math.max(SNAP,Math.min(MAXD,1440-sl.s,end-sl.s))}}
  if(DR.x<R.left||DR.x>R.right||DR.y<R.top-24||DR.y>R.bottom+24)return null;
  const d=lenOf(it),top=DR.y-(DR.from==='grid'?DR.offY:10);
  return{s:Math.max(0,Math.min(1440-d,snap((top-R.top)/PX*60+h0*60))),d};
}
function frame(){
  if(!DR||!DR.go)return;
  if(DR.y<80)scrollBy(0,-14);else if(DR.y>innerHeight-80)scrollBy(0,14);
  if(DR.ghost){DR.ghost.style.left=(DR.x-DR.offX)+'px';DR.ghost.style.top=(DR.y-DR.offY)+'px'}
  const t=target(),z=$('#nxz'),g=$('#nxg');let p=$('#nxp');
  if(!t||!z||!g){if(p)p.remove()}
  else{if(!p){p=document.createElement('div');p.id='nxp';p.className='nxp';z.append(p)}
    const h0=+g.dataset.h0;p.style.top=((t.s-h0*60)*PX/60)+'px';p.style.height=Math.max(20,t.d*PX/60-2)+'px';p.style.left='0';p.style.right='4px';
    p.textContent=fmtT(t.s)+' to '+fmtT(t.s+t.d)}
  raf=requestAnimationFrame(frame);
}
function begin(){
  if(!DR||DR.go)return;DR.go=true;clearTimeout(DR.timer);
  try{navigator.vibrate&&navigator.vibrate(12)}catch(e){}
  if(DR.mode==='move'){const g=DR.el.cloneNode(true);g.className=(DR.from==='grid'?'nxb':'nxc')+' nxgh';g.removeAttribute('data-a');g.removeAttribute('data-i');g.removeAttribute('data-drag');g.removeAttribute('role');
    g.style.width=DR.w+'px';g.style.height=DR.h+'px';document.body.append(g);DR.ghost=g}
  DR.el.classList.add('mv');raf=requestAnimationFrame(frame);
}
function finish(){
  const d=DR;if(!d||!d.go){clean();return}
  const t=target(),it=get(d.id),tr=$('#nxt'),before=it?{due:it.due,tm:it.tm||null,dur:it.dur||null}:null;
  let msg='';
  if(it&&d.mode==='resize'&&t){upd(d.id,{dur:t.d});msg='Length set to '+t.d+' min'}
  else if(it&&d.mode==='move'&&t){place(d.id,PD,t.s,t.d);msg='Scheduled for '+fmtT(t.s)}
  else if(it&&d.mode==='move'&&d.from==='grid'&&tr){const R=tr.getBoundingClientRect();if(d.x>=R.left&&d.x<=R.right&&d.y>=R.top-10&&d.y<=R.bottom+10){unplace(d.id);msg='Taken off the plan'}}
  clean();JD=true;setTimeout(()=>{JD=false},60);SEL=null;render();
  if(msg&&before)toast(msg,'Undo',()=>{upd(it.id,before);render()});
}
document.addEventListener('pointerdown',e=>{
  if(S.tab!=='plan'||DR||(e.button&&e.button>0))return;
  const r=e.target.closest&&e.target.closest('[data-rs]'),d=r||(e.target.closest&&e.target.closest('[data-drag]'));if(!d)return;
  const id=r?r.dataset.rs:d.dataset.drag,it=get(id);if(!it||it.type!=='task'||it.done)return;
  const el=r?r.closest('.nxb'):d,b=el.getBoundingClientRect(),touch=e.pointerType!=='mouse';
  DR={mode:r?'resize':'move',id,el,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,go:false,touch,offX:e.clientX-b.left,offY:e.clientY-b.top,w:b.width,h:b.height,from:el.hasAttribute('data-nb')?'grid':'tray',timer:0};
  if(touch)DR.timer=setTimeout(begin,330);
},true);
document.addEventListener('pointermove',e=>{
  if(!DR)return;DR.x=e.clientX;DR.y=e.clientY;
  if(!DR.go){const far=Math.hypot(DR.x-DR.x0,DR.y-DR.y0);
    if(DR.touch){if(far>9)clean()}else if(far>4)begin()}
});
document.addEventListener('pointerup',e=>{if(!DR)return;DR.x=e.clientX;DR.y=e.clientY;finish()});
document.addEventListener('pointercancel',()=>clean());
/* While a touch drag is on, stop the page from scrolling under the finger. */
document.addEventListener('touchmove',e=>{if(DR&&DR.go&&e.cancelable)e.preventDefault()},{passive:false});
document.addEventListener('contextmenu',e=>{if(e.target.closest&&e.target.closest('[data-drag]'))e.preventDefault()});
/* A drag ends with a click on the same element. Swallow it so it does not open the sheet. */
document.addEventListener('click',e=>{if(JD){e.stopPropagation();e.preventDefault()}},true);
/* Tap a free time with a task chosen to place it there. */
document.addEventListener('click',e=>{
  if(S.tab!=='plan'||JD)return;const g=e.target.closest&&e.target.closest('#nxg');if(!g||e.target.closest('[data-nb]'))return;
  if(!SEL){if(document.querySelector('#nxt .nxc'))toast('Choose a task below first, or drag one in.');return}
  const R=g.getBoundingClientRect(),m=Math.floor(((e.clientY-R.top)/PX*60+ +g.dataset.h0*60)/SNAP)*SNAP,id=SEL;
  const it=get(id);if(!it)return;const before={due:it.due,tm:it.tm||null,dur:it.dur||null};
  place(id,PD,m,lenOf(it));SEL=null;render();toast('Scheduled for '+fmtT(m),'Undo',()=>{upd(id,before);render()});
});
document.addEventListener('keydown',e=>{
  if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('[data-nb]')){e.preventDefault();A.nxopen(e.target.dataset.nb)}});

/* ---------- Focus: a disc that shrinks as time runs out ---------- */
const oFx=fx;
fx=function(){oFx();if(!F)return;const o=$('#fx'),t=o&&o.querySelector('.tm');if(!t)return;
  if(!F.tot)F.tot=Math.max(1,F.left);
  const f=Math.max(0,Math.min(1,F.left/F.tot)),d=document.createElement('div');
  d.className='nxd';d.setAttribute('role','img');d.setAttribute('aria-label',pl(Math.ceil(F.left/60),'minute')+' left');
  d.innerHTML='<i style="transform:scale('+Math.sqrt(f).toFixed(3)+')"></i>';t.before(d)};

/* ---------- look ---------- */
const st=document.createElement('style');
st.textContent=`.nxhd{display:flex;justify-content:space-between;align-items:center;gap:8px}
.nxg{position:relative;margin-top:14px;border-top:1px solid var(--ln)}
.nxh{position:absolute;left:0;right:0;height:0;border-top:1px solid var(--ln)}
.nxh span{position:absolute;top:-9px;left:0;width:50px;font-size:11px;color:var(--mu);background:var(--bg);padding-right:4px;white-space:nowrap}
.nxz{position:absolute;left:54px;right:0;top:0;bottom:0}
.nxb{position:absolute;box-sizing:border-box;background:var(--ac);color:var(--on);border-radius:10px;padding:4px 8px;overflow:hidden;font-size:13px;line-height:1.25;cursor:grab;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:pan-y}
.nxb b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nxb small{display:block;opacity:.75;font-size:11px}
.nxb.dn{background:var(--s);color:var(--mu);border:1px solid var(--ln);cursor:default}.nxb.dn b{text-decoration:line-through}
.nxb.mv,.nxc.mv{opacity:.3}
.nxr{position:absolute;left:0;right:0;bottom:0;height:14px;cursor:ns-resize}
.nxr::after{content:"";position:absolute;left:50%;bottom:3px;width:24px;height:3px;margin-left:-12px;border-radius:2px;background:currentColor;opacity:.45}
.nxe{position:absolute;box-sizing:border-box;border:1px dashed var(--mu);border-radius:10px;padding:4px 8px;overflow:hidden;color:var(--mu);font-size:12px;line-height:1.25;pointer-events:none}
.nxe b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nxe small{display:block;font-size:11px}
.nxn{position:absolute;left:46px;right:0;height:0;border-top:2px solid var(--ink);pointer-events:none;z-index:3}
.nxn::before{content:"";position:absolute;left:-1px;top:-6px;width:10px;height:10px;border-radius:50%;background:var(--ink)}
.nxp{position:absolute;box-sizing:border-box;border:2px solid var(--ink);border-radius:10px;background:rgba(127,127,127,.2);pointer-events:none;z-index:4;font-size:12px;padding:2px 8px}
.nxt{display:flex;flex-wrap:wrap;gap:8px}
.nxc{border:1px solid var(--ln);background:var(--s);color:var(--ink);border-radius:999px;padding:10px 14px;font:inherit;font-size:14px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:grab;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:pan-y}
.nxc[aria-pressed=true]{background:var(--ac);color:var(--on)}
.nxgh{position:fixed!important;z-index:80;pointer-events:none;opacity:.92;box-shadow:0 8px 24px rgba(0,0,0,.35);margin:0}
.nxd{width:min(56vw,240px);aspect-ratio:1;border-radius:50%;border:1.5px solid rgba(255,255,255,.25);margin:0 auto 22px;display:grid;place-items:center}
.nxd i{display:block;width:100%;height:100%;border-radius:50%;background:#F2F2F0}`;
document.head.append(st);
})();
