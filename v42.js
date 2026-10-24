/* Nexus 4.2. Loaded after import2.js.
   1. Files shared from other apps (web share target, POST): sw.js parks them in the "share-inbox" cache, this file saves them as notes.
   2. Voice commands: a mic button in the command palette (Ctrl+K). English phrases, listed below. */
(()=>{
const L=s=>window.NXI18N?window.NXI18N.t(s):s,N=window.NexusNative,SR=window.SpeechRecognition||window.webkitSpeechRecognition;
const KIND=m=>/^image\//.test(m)?'photo':/^audio\//.test(m)?'voice':'file';

/* ---------- 1. shared files ---------- */
let busy=false;
async function takeShared(){
  if(busy||!window.caches)return 0;busy=true;let n=0,big=0;
  try{const c=await caches.open('share-inbox'),ks=await c.keys();
    for(const k of ks){const res=await c.match(k);await c.delete(k);if(!res)continue;
      const blob=await res.blob(),u=new URL(k.url);let name='shared';try{name=decodeURIComponent(u.searchParams.get('n')||'shared')}catch(e){}
      name=name.slice(0,80)||'shared';if(blob.size>8e6){big++;continue}
      const mime=blob.type||res.headers.get('content-type')||'application/octet-stream',id=uid();
      try{await bput(id,blob)}catch(e){continue}
      if(addItem({type:'note',title:name.replace(/\.[^.]{1,5}$/,'')||name,body:'',url:'',tags:['shared'],project:null,due:null,promise:false,media:{id,kind:KIND(mime),name,mime}}))n++}}
  catch(e){}
  busy=false;if(n||big){try{render()}catch(e){}toast(n?(n+' '+L(n===1?'file saved to Nexus':'files saved to Nexus'))+(big?'. '+big+' '+L('over 8 MB left out'):''):big+' '+L('over 8 MB left out'))}
  return n}
setTimeout(takeShared,900);document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(takeShared,400)});

/* ---------- 2. voice commands ---------- */
const TABS=[[/^(home|today)$/,'home'],[/^(tasks?|to ?dos?)$/,'tasks'],[/^(notes?|library|files)$/,'notes'],[/^(study|flashcards?)$/,'study'],[/^(more|browse)$/,'browse'],[/^(timeline)$/,'time'],[/^(week|week view)$/,'week']];
function say(text){
  let t=String(text||'').toLowerCase().replace(/[.!?,]+$/g,'').replace(/\s+/g,' ').trim(),m;if(!t)return{ok:false,msg:L('I heard nothing.')};
  const cap=(raw,type)=>{const p=parse(raw);if(!p)return{ok:false,msg:L('I heard nothing.')};if(type)p.type=type;p.tags=[...new Set([...(p.tags||[]),'voice'])];const it=addItem(p);render();return it?{ok:true,msg:L('Saved')+': '+it.title.slice(0,40),id:it.id}:{ok:false,msg:L('Could not save that.')}};
  const orig=String(text).replace(/\s+/g,' ').trim().replace(/[.!?]+$/,'');
  const rest=re=>{const x=orig.match(re);return x?x[x.length-1].trim():''};
  if((m=t.match(/^(?:go to|open|show me|show)(?: the| my)? (.+)$/))){
    const w=m[1];for(const[re,tab]of TABS)if(re.test(w)){A.tab(tab);return{ok:true,msg:L('Opened')+' '+w}}
    if(/^(plan|planner|day plan)$/.test(w)&&A.planview){A.planview();return{ok:true,msg:L('Opened')+' '+w}}
    if(/^(settings|backup)$/.test(w)){A.settings();return{ok:true,msg:L('Opened')+' '+w}}
    if(/^(recap|weekly recap)$/.test(w)){A.recap();return{ok:true,msg:L('Opened')+' '+w}}
    if(/^monthly recap$/.test(w)&&A.recapm){A.recapm(0);return{ok:true,msg:L('Opened')+' '+w}}
    if(/^graph( of connections)?$/.test(w)&&A.graph){A.graph('all');return{ok:true,msg:L('Opened')+' '+w}}}
  if(/^(capture|quick capture|new note)$/.test(t)){A.cap();return{ok:true,msg:L('Capture')}}
  if((m=t.match(/^(?:add|new|create)(?: a| an)? task (?:to )?(.+)$/))||(m=t.match(/^(?:task|todo|remind me to) (.+)$/)))return cap(rest(/(?:task|todo|remind me to)\s+(?:to\s+)?(.+)$/i)||m[1],'task');
  if((m=t.match(/^(?:add|new|create|take)(?: a| an)? (?:note|idea) (?:that |to |about )?(.+)$/))||(m=t.match(/^(?:note|idea|remember|capture|save) (?:that )?(.+)$/)))return cap(rest(/(?:note|idea|remember|capture|save)\s+(?:that\s+|to\s+|about\s+)?(.+)$/i)||m[1]);
  if((m=t.match(/^(?:search|find|look up|search for|find me) (.+)$/))){const q=$('#q');if(q){q.value=rest(/(?:search for|search|find me|find|look up)\s+(.+)$/i)||m[1];q.dispatchEvent(new Event('input',{bubbles:true}))}return{ok:true,msg:L('Searching')+': '+m[1]}}
  if((m=t.match(/^(?:mark|complete|finish|tick)(?: off)? (.+?)(?: as done| done)?$/))||(m=t.match(/^(.+?) (?:is )?done$/))){const w=m[1].replace(/^(the )?task /,'');
    const it=D.items.find(i=>i.type==='task'&&!i.done&&String(i.title).toLowerCase().includes(w));if(it){A.done(it.id);return{ok:true,msg:L('Done')+': '+it.title.slice(0,40)}}return{ok:false,msg:L('No open task matches')+' "'+w+'"'}}
  if((m=t.match(/^(?:start |begin )?focus(?: on)?(?: (.+))?$/))){const w=m[1],T=D.items.filter(i=>i.type==='task'&&!i.done),it=w?T.find(i=>String(i.title).toLowerCase().includes(w)):T[0];
    if(it){focus(it.id);return{ok:true,msg:L('Focus')+': '+it.title.slice(0,40)}}return{ok:false,msg:L('No open task to focus on.')}}
  if((m=t.match(/^ask(?: nexus)? (.+)$/))){askAI(rest(/^ask(?: nexus)?\s+(.+)$/i)||m[1]);return{ok:true,msg:L('Asking Nexus')}}
  return{ok:false,msg:L('Not understood. Try: add task buy milk, note an idea, go to tasks, search physics, focus, mark milk done.')}}

function listen(done){
  if(N&&typeof N.listen==='function'){window.nxSpeech=(txt,state)=>{window.nxSpeech=null;state===0?done(txt):done(null,L('Voice is not available on this phone.'))};N.listen(navigator.language||'');return()=>{}}
  if(!SR){done(null,L('Voice is not available here.'));return()=>{}}
  let r;try{r=new SR();r.lang=navigator.language||'en-US';r.interimResults=false;r.maxAlternatives=1;
    r.onresult=e=>done(Array.from(e.results).map(x=>x[0].transcript).join(' '));
    r.onerror=e=>done(null,e.error==='not-allowed'||e.error==='service-not-allowed'?L('Microphone blocked. Allow it in your browser settings.'):L('Could not hear anything. Try again.'));
    r.start()}catch(e){done(null,L('Voice is not available here.'))}
  return()=>{try{r.stop()}catch(e){}}}

function addMic(){const inp=document.querySelector('#nxp');if(!inp||document.querySelector('#nx42m')||!(SR||(N&&typeof N.listen==='function')))return;
  inp.insertAdjacentHTML('beforebegin',`<div class="row2" style="margin-top:4px"><button class="btn" type="button" id="nx42m">${L('Speak a command')}</button><small id="nx42s" role="status" style="align-self:center"></small></div>`);
  const b=document.querySelector('#nx42m'),s=document.querySelector('#nx42s');let stop=null;
  b.onclick=()=>{if(stop){stop();stop=null;b.textContent=L('Speak a command');return}
    b.textContent=L('Listening. Tap to stop');
    stop=listen((txt,err)=>{stop=null;b.textContent=L('Speak a command');
      if(err){s.textContent=err;return}const r=say(txt);s.textContent=r.msg;if(r.ok){try{dlg.close()}catch(e){}toast(r.msg)}})}}
new MutationObserver(addMic).observe(document.body||document.documentElement,{childList:true,subtree:true});
window.NXV42={say,takeShared,listen};
})();
