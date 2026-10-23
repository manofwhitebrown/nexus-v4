/* Nexus phone bridge (Phase 1 and 2). Loaded after plan.js.
   1. Dictation: a Dictate button in the capture box. In the Android app it opens Android's speech screen;
      in a browser it uses the built-in speech recognition when there is one.
   2. Home-screen widget: keeps the widget's short task list up to date.
   3. Reminders: tasks with a start time become Android alarms, so they ring when Nexus is closed.
      In a browser tab they show as notifications while Nexus is open.
   Nothing here talks to a server. */
(()=>{
const N=window.NexusNative,T=window.nxT;
if(!T)return;

/* ---------- 1. dictation ---------- */
const LK='nexus.vlang'+NS,SR=window.SpeechRecognition||window.webkitSpeechRecognition;
const canDictate=!!((N&&typeof N.listen==='function')||SR);
let REC=null;
const oCap=capture;
capture=function(pj){oCap(pj);
  if(!canDictate)return;const ta=$('#ct');if(!ta||$('#nxv'))return;
  let lang='';try{lang=localStorage.getItem(LK)||''}catch(e){}
  const row=document.createElement('div');row.className='row2';row.id='nxv';row.style.marginTop='8px';
  row.innerHTML=`<button class="btn" type="button" id="nxm">Dictate</button><select id="nxlg" aria-label="Dictation language" style="flex:1;min-width:0">${[['','Phone language'],['en-IN','English (India)'],['hi-IN','Hindi'],['te-IN','Telugu']].map(([k,l])=>`<option value="${k}" ${k===lang?'selected':''}>${l}</option>`).join('')}</select>`;
  ta.closest('label').after(row);
  const add=txt=>{const t=$('#ct');txt=String(txt||'').trim();if(!t||!txt)return;
    t.value=(t.value&&!/\s$/.test(t.value)?t.value+' ':t.value)+txt;t.dispatchEvent(new Event('input',{bubbles:true}));t.focus()};
  const say=m=>{const h=$('#ch');if(h)h.textContent=m};
  $('#nxlg').onchange=e=>{try{localStorage.setItem(LK,e.target.value)}catch(x){}};
  $('#nxm').onclick=()=>{
    const l=$('#nxlg').value||navigator.language||'';
    if(N&&typeof N.listen==='function'){
      window.nxSpeech=(txt,state)=>{window.nxSpeech=null;if(state===0)add(txt);else if(state===1)say('Voice typing is not available on this phone.')};
      N.listen(l);return}
    if(REC){REC.stop();return}
    try{const r=new SR();r.lang=l;r.interimResults=false;r.maxAlternatives=1;
      r.onresult=ev=>add(Array.from(ev.results).map(x=>x[0].transcript).join(' '));
      r.onerror=ev=>say(ev.error==='not-allowed'||ev.error==='service-not-allowed'?'Microphone blocked. Allow it in your browser settings.':'Could not hear anything. Try again.');
      r.onend=()=>{REC=null;const b=$('#nxm');if(b)b.textContent='Dictate'};
      REC=r;$('#nxm').textContent='Listening. Tap to stop';r.start()}
    catch(e){REC=null;say('Voice typing is not available here.')}};
};
dlg.addEventListener('close',()=>{if(REC){try{REC.stop()}catch(e){}}});

/* ---------- 2. widget list and 3. reminders ---------- */
const wk=k=>new Date(k+'T12:00').toLocaleDateString(undefined,{weekday:'short'});
const L10=s=>window.NXI18N?window.NXI18N.t(s):s;   /* the widget follows the language chosen in Nexus */
const label=t=>{const td=dk(),s=T.slot(t),tm=s?T.fmt(s.s):'';
  if(t.due===td)return tm||L10('today');
  if(t.due===addD(1))return L10('tomorrow')+(tm?' '+tm:'');
  if(t.due&&t.due>td)return wk(t.due)+(tm?' '+tm:'');
  return ''};   /* overdue tasks carry no label, so nothing on the widget shames you */
const snapshot=()=>{const td=dk(),rk=t=>t.due&&t.due<td?0:t.due===td?1:t.promise?2:t.due?3:4;
  return D.items.filter(i=>i.type==='task'&&!i.done)
    .sort((a,b)=>rk(a)-rk(b)||(a.due||'9').localeCompare(b.due||'9')||(a.tm||'99:99').localeCompare(b.tm||'99:99')||a.created.localeCompare(b.created))
    .slice(0,6).map(t=>({id:t.id,t:String(t.title||'Untitled').slice(0,60),d:label(t)}))};
const RDK='nexus.remdef'+NS,defTm=()=>{try{const v=localStorage.getItem(RDK);return v===null?'09:00':v}catch(e){return'09:00'}};
const reminders=()=>{const from=Date.now()+5e3,dt=defTm(),open=D.items.filter(i=>i.type==='task'&&!i.done);
  const timed=open.filter(i=>T.slot(i)).map(i=>({i,at:T.at(i),tm:T.fmt(T.slot(i).s)}));
  /* a task with a date but no time rings at the chosen time that day (Settings; Off turns it off). Past times are never sent. */
  const dated=/^\d{2}:\d{2}$/.test(dt)?open.filter(i=>i.due&&!T.slot(i)).map(i=>{const d=new Date(i.due+'T00:00');d.setHours(+dt.slice(0,2),+dt.slice(3),0,0);return{i,at:d.getTime(),tm:dt}}):[];
  return timed.concat(dated).filter(x=>x.at>from).sort((a,b)=>a.at-b.at).slice(0,50)
    .map(({i,at,tm})=>({id:i.id,at,title:String(i.title||'Task').slice(0,80),body:[tm,pname(i.project)].filter(Boolean).join(' \u00b7 ')}))};
window.nxSnapshot=snapshot;window.nxReminders=reminders;

if(N){
  let lastR=null,lastS=null;
  const sync=()=>{try{
    const r=JSON.stringify(reminders()),s=JSON.stringify(snapshot());
    if(r!==lastR&&typeof N.setReminders==='function'){N.setReminders(r);lastR=r}
    if(s!==lastS&&typeof N.setSnapshot==='function'){N.setSnapshot(s);lastS=s}
  }catch(e){}};
  window.nxSync=sync;
  setTimeout(sync,1200);setInterval(sync,2500);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)sync()});
}else{
  /* No Android app: show a notification when a timed task starts, while Nexus is open. */
  const RK='nexus.remseen'+NS,seen=()=>{try{return JSON.parse(localStorage.getItem(RK)||'{}')||{}}catch(e){return{}}};
  const check=()=>{
    if(!('Notification' in window)||Notification.permission!=='granted')return;
    const s=seen(),now=Date.now();let ch=false;
    D.items.forEach(i=>{if(i.type!=='task'||i.done||!T.slot(i))return;
      const at=T.at(i),k=i.id+'@'+at;
      if(at<=now&&now-at<10*6e4&&!s[k]){s[k]=now;ch=true;notify(i.title,[T.fmt(T.slot(i).s),pname(i.project)].filter(Boolean).join(' · '),'rem-'+i.id)}});
    if(ch){for(const k in s)if(now-s[k]>864e5)delete s[k];try{localStorage.setItem(RK,JSON.stringify(s))}catch(e){}}};
  window.nxRemCheck=check;
  setInterval(check,2e4);setTimeout(check,3000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
}
})();
