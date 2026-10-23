/* Nexus capture. Loaded after patch.js and before features.js.
   Adds: note, task, link, idea, photo, video, audio and file capture with numbered names
   (Photo 001, Video 001, Audio 001, File 001), quick-note mode (?a=capture&q=1),
   a notification-shade shortcut, a floating note window where the browser allows it,
   and friendly handling of errors, offline and AI request bursts. */
(()=>{
let QM=/[?&]q=1\b/.test(location.search);
if(QM)document.documentElement.dataset.quick='1';
const MAX=25e6,MAXN=20;
const KD={photo:['Photo','image/*','photo','image/'],video:['Video','video/*','video','video/'],audio:['Audio','audio/*','voice','audio/'],file:['File','*/*','file','']};
const TY=[['auto','Auto'],['note','Note'],['task','Task'],['link','Link'],['idea','Idea'],['photo','Photo'],['video','Video'],['audio','Audio'],['file','File']];
const pad=n=>String(n).padStart(3,'0');
const ext=n=>{const m=/\.[A-Za-z0-9]{1,6}$/.exec(n||'');return m?m[0].toLowerCase():''};
const counter=(label,kind)=>{let n=0;const re=new RegExp('^'+label+' (\\d+)');for(const i of D.items)if(i.media&&i.media.kind===kind){const m=re.exec(i.title||'');if(m)n=Math.max(n,+m[1])}return n};
let rc=null;

capture=function(pj){
  let ty=QM?'note':'auto',files=[];
  const h2=QM?'Quick note':'Capture';
  sheet(`<h2 style="margin:0">${h2}</h2><div class="chips" id="cc" role="group" aria-label="What are you saving?">${TY.map(([k,l])=>`<button class="chip" data-t="${k}" aria-pressed="${k===ty}">${l}</button>`).join('')}</div><div id="cx2"></div><label><span id="ctl">Note</span><textarea id="ct" rows="4" maxlength="5000" placeholder="Type or paste anything"></textarea></label><small id="ch" role="status"></small><label><span>Project</span><select id="cp"><option value="">No project</option>${D.projects.map(p=>`<option value="${E(p.id)}" ${p.id===pj?'selected':''}>${E(p.name)}</option>`).join('')}</select></label><div class="row2"><button class="btn p" id="cs" style="flex:1">Save</button><button class="btn" id="cn0">Cancel</button></div>`);
  const msg=t=>{const h=$('#ch');if(h)h.textContent=t};
  const nm=i=>KD[ty][0]+' '+pad(counter(KD[ty][0],KD[ty][2])+i+1);
  const list=()=>{const l=$('#cl');if(!l)return;l.innerHTML=files.length?files.map((f,i)=>`<li class="row"><span class="rm"><b>${nm(i)}${E(f.ext)}</b><small>${E(f.orig)}, ${(f.blob.size/1e6).toFixed(1)} MB</small></span><button class="btn" data-rm="${i}" aria-label="Remove ${nm(i)}">Remove</button></li>`).join(''):'<li><small>Nothing chosen yet.</small></li>'};
  const hint=()=>{const h=$('#ch');if(!h)return;if(['auto','note','task','idea'].includes(ty)){const p=parse($('#ct').value,ty==='auto'?null:ty);h.textContent=p?`Saving as ${{note:'a note',task:'a task',link:'a saved link',idea:'an idea'}[p.type]}${p.project||$('#cp').value?' in '+pname(p.project||$('#cp').value):''}${p.due?', '+dueL(p.due):''}${p.tags.length?', tagged '+p.tags.map(t=>'#'+t).join(' '):''}.`:'Use #tags and @project. Words like tomorrow set a due date on tasks.'}else h.textContent=''};
  const pick=()=>{const f=document.createElement('input');f.type='file';f.accept=KD[ty][1];f.multiple=true;f.onchange=async()=>{let bad=0;for(let x of f.files){if(files.length>=MAXN){msg('Up to '+MAXN+' files at a time.');break}if(KD[ty][3]&&!x.type.startsWith(KD[ty][3])){bad++;continue}const o=x.name||'file';if(ty==='photo'){try{x=await shrink(x)}catch(e){}}if(x.size>MAX){msg(o+' is over 25 MB.');continue}files.push({blob:x,ext:ty==='photo'?'.jpg':ext(o),mime:x.type,orig:o})}if(bad)msg(bad+' file'+(bad>1?'s were':' was')+' not a '+KD[ty][0].toLowerCase()+' and skipped.');list()};f.click()};
  const record=async()=>{if(rc){rc.stop();return}try{const s=await navigator.mediaDevices.getUserMedia({audio:true}),ch=[];rc=new MediaRecorder(s);rc.ondataavailable=e=>{if(e.data.size)ch.push(e.data)};rc.onstop=()=>{s.getTracks().forEach(t=>t.stop());const mt=(rc&&rc.mimeType)||'audio/webm';rc=null;const b=$('#crc');if(b)b.textContent='Record';if(ch.length&&$('#cl')){files.push({blob:new Blob(ch,{type:mt}),ext:mt.includes('mp4')?'.m4a':mt.includes('ogg')?'.ogg':'.webm',mime:mt,orig:'Recording'});list()}};rc.start();$('#crc').textContent='Stop'}catch(e){rc=null;msg('Microphone blocked or unavailable. Allow it in your browser settings.')}};
  const draw=()=>{const x=$('#cx2'),l=$('#ctl');
    if(ty==='link'){x.innerHTML='<label><span>Web address</span><input id="cu" inputmode="url" autocomplete="off" maxlength="2000" placeholder="example.com/page"></label><label><span>Title, optional</span><input id="ctt" maxlength="200" autocomplete="off"></label>';l.textContent='Notes, optional';$('#cu').focus()}
    else if(KD[ty]){x.innerHTML=`<div class="row2"><button class="btn" id="cpk">${ty==='file'?'Choose files':ty==='audio'?'Choose audio':'Choose '+KD[ty][0].toLowerCase()+'s'}</button>${ty==='audio'?'<button class="btn" id="crc">Record</button>':''}</div><ul id="cl" class="fl"></ul>`;l.textContent='Caption, optional';$('#cpk').onclick=pick;if(ty==='audio')$('#crc').onclick=record;$('#cl').onclick=e=>{const b=e.target.closest('[data-rm]');if(b){files.splice(+b.dataset.rm,1);list()}};list()}
    else{x.innerHTML='';l.textContent={task:'Task',idea:'Idea',note:'Note'}[ty]||'Text'}
    hint()};
  $('#cc').onclick=e=>{const b=e.target.closest('[data-t]');if(!b)return;if(KD[b.dataset.t]!==KD[ty])files=[];ty=b.dataset.t;[...$('#cc').children].forEach(c=>c.setAttribute('aria-pressed',c===b));draw()};
  $('#ct').oninput=hint;$('#cp').onchange=hint;$('#cn0').onclick=()=>dlg.close();
  dlg.addEventListener('close',()=>{if(rc&&rc.state!=='inactive')rc.stop()},{once:true});
  $('#cs').onclick=async()=>{const b=$('#cs');if(b.disabled)return;const txt=$('#ct').value,proj=$('#cp').value||null;let made=[];b.disabled=true;
    try{
      if(KD[ty]){if(!files.length){msg('Choose or record something first.');b.disabled=false;return}
        const [lb,,kd]=KD[ty],cp=txt.trim()?parse(txt,'note'):null;let n=counter(lb,kd);
        for(const f of files){const id=uid();await bput(id,f.blob);const title=lb+' '+pad(++n);made.push(addItem({type:'note',title,body:cp?cp.title+(cp.body?'\n'+cp.body:''):'',tags:cp?cp.tags:[],project:(cp&&cp.project)||proj,media:{id,kind:kd,name:(title+f.ext).slice(0,80),mime:String(f.mime||'').slice(0,100)}}))}}
      else if(ty==='link'){const u=safeUrl($('#cu').value);if(!u){msg('Enter a valid web address, like example.com.');b.disabled=false;return}
        made.push(addItem({type:'link',title:$('#ctt').value.trim().slice(0,200)||dom(u),url:u,body:txt.trim().slice(0,5000),tags:[],project:proj}))}
      else{const p=parse(txt,ty==='auto'?null:ty);if(!p){msg('Type something to save.');b.disabled=false;return}if(proj)p.project=proj;made.push(addItem(p))}
    }catch(e){b.disabled=false;msg('Could not save. Your device storage may be full.');return}
    made=made.filter(Boolean);if(!made.length){b.disabled=false;return}
    const ids=new Set(made.map(x=>x.id));
    if(QM){sheet('<h2 style="margin:0">Saved</h2><p class="mu">Your note is in Nexus.</p><div class="row2"><button class="btn p" id="qa2">Add another</button><button class="btn" id="qo">Open Nexus</button></div>');$('#qa2').onclick=()=>capture();$('#qo').onclick=()=>{QM=false;delete document.documentElement.dataset.quick;history.replaceState(null,'',location.pathname);dlg.close()};return}
    dlg.close();toast(made.length>1?made.length+' items saved':'Saved as '+(made[0].media?KD[ty][0].toLowerCase():made[0].type),'Undo',()=>{D.items=D.items.filter(x=>!ids.has(x.id));D.log=D.log.filter(l=>!(ids.has(l.id)&&l.k==='created'));save();render();setTimeout(()=>{try{window.gcMedia&&window.gcMedia()}catch(e){}},500)})};
  draw();if(!KD[ty]&&ty!=='link')$('#ct').focus()};

/* Show photos, videos, audio and files in the editor */
mediaShow=async function(it,el){if(!it.media||!el)return;try{const b=await bget(it.media.id);if(!b){el.textContent='The attached file is missing on this device.';return}const u=URL.createObjectURL(b),k=it.media.kind;
  el.innerHTML=k==='photo'?`<img src="${u}" alt="${E(it.title)}" style="max-width:100%;border-radius:6px;margin-top:12px">`:k==='video'?`<video controls playsinline preload="metadata" src="${u}" style="width:100%;max-height:60vh;margin-top:12px;border-radius:6px"></video>`:k==='voice'?`<audio controls src="${u}" style="width:100%;margin-top:12px"></audio>`:`<p><a href="${u}" download="${E(it.media.name)}">Download ${E(it.media.name)}</a></p>`}catch(e){el.textContent='Could not load the attachment.'}};

/* Quick note extras in Settings */
const oS=settings;settings=function(){oS();try{
  const hs=[...dlg.querySelectorAll('h2')],del=hs[hs.length-1];if(!del)return;
  const on=localStorage.getItem('nexus.qn')==='1',pip='documentPictureInPicture' in window,f=document.createElement('div');
  f.innerHTML=`<h2>Quick note</h2><p class="mu">Jot something down without opening the whole app. A phone browser cannot draw over other apps, so Nexus offers a pinned notification and a home screen shortcut instead.</p><div class="row2"><button class="btn" id="qn">${on?'Remove notification shortcut':'Pin a notification shortcut'}</button><button class="btn" id="qw">Open quick note</button>${pip?'<button class="btn" id="qf">Float on top (desktop)</button>':''}</div>`;
  del.before(f);
  $('#qw').onclick=()=>{QM=true;document.documentElement.dataset.quick='1';dlg.close();setTimeout(()=>capture(),50)};
  $('#qn').onclick=async()=>{try{if(localStorage.getItem('nexus.qn')==='1'){localStorage.removeItem('nexus.qn');const r=await navigator.serviceWorker.getRegistration();(await r.getNotifications({tag:'nexus-quick'})).forEach(n=>n.close());toast('Shortcut removed');settings();return}
    if(!('Notification' in window)){toast('This browser does not support notifications.');return}
    if(await Notification.requestPermission()!=='granted'){toast('Notifications are blocked for this site.');return}
    localStorage.setItem('nexus.qn','1');await pinQ();toast('Pinned to your notification shade');settings()}catch(e){toast('Could not pin the shortcut.')}};
  if(pip)$('#qf').onclick=async()=>{try{const w=await documentPictureInPicture.requestWindow({width:340,height:250}),cs=getComputedStyle(document.documentElement),v=['--bg','--s','--ink','--mu','--ln','--ac','--on'].map(k=>k+':'+cs.getPropertyValue(k)).join(';');
    w.document.head.innerHTML=`<style>:root{${v}}body{margin:0;padding:12px;background:var(--bg);color:var(--ink);font:15px system-ui,sans-serif;display:grid;gap:8px;height:100vh;box-sizing:border-box;grid-template-rows:1fr auto auto}textarea{resize:none;background:var(--s);color:var(--ink);border:1px solid var(--ln);border-radius:6px;padding:10px;font:inherit}button{min-height:40px;border:0;border-radius:6px;background:var(--ac);color:var(--on);font:inherit;font-weight:600}small{color:var(--mu)}</style>`;
    w.document.body.innerHTML='<textarea id="t" placeholder="Quick note. Use #tags."></textarea><button id="s">Save</button><small id="m"></small>';
    const t=w.document.getElementById('t'),m=w.document.getElementById('m');t.focus();
    const sv=()=>{const p=parse(t.value,'note');if(!p){m.textContent='Type something first.';return}if(addItem(p)){t.value='';m.textContent='Saved.';render()}};
    w.document.getElementById('s').onclick=sv;t.onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))sv()}}catch(e){toast('Your browser did not open the floating note.')}};
}catch(e){}};
async function pinQ(){try{const r=await navigator.serviceWorker.getRegistration();if(r)await r.showNotification('Nexus quick note',{body:'Tap to jot something down.',tag:'nexus-quick',requireInteraction:true,silent:true,icon:'icons/icon-192.png',badge:'icons/icon-192.png'})}catch(e){}}
try{if(localStorage.getItem('nexus.qn')==='1'&&'Notification' in window&&Notification.permission==='granted')setTimeout(pinQ,1500)}catch(e){}

/* Guards: calm errors, offline notice, no rapid-fire AI requests */
let lastErr=0;const oops=()=>{const n=Date.now();if(n-lastErr>5000){lastErr=n;try{toast('Something went wrong. Your data is safe on this device.')}catch(e){}}};
addEventListener('error',oops);addEventListener('unhandledrejection',oops);
addEventListener('offline',()=>toast('You are offline. Nexus still works. AI answers need a connection.'));
addEventListener('online',()=>toast('Back online.'));
const of=window.fetch;let last=0;
window.fetch=function(u){if(String(u&&u.url||u).startsWith('https://api.anthropic.com/')){const n=Date.now();if(n-last<3000)return Promise.reject(new Error('Please wait a few seconds between AI requests.'));last=n}return of.apply(this,arguments)};
})();
