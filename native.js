/* Nexus Android bridge. Loaded after features.js.
   Inside the Android app it imports notes typed into the floating bubble, lets Settings switch the
   bubble on and off, and saves backups and downloads to the Downloads folder.
   In a normal browser it only offers the Android download in Settings. */
(()=>{
const N=window.NexusNative,APK='https://github.com/manofwhitebrown/nexus-v4/releases/latest/download/nexus.apk';

if(N){
  /* The window and the system bars belong to Android, not to the page. Tell them which theme the app is in,
     now and every time it changes, so they never stay dark behind a light app (or the other way round). */
  /* The floating bubble is drawn by Android too, so it gets the page's real colours (theme and accent),
     read from the CSS variables, and is told again whenever either one changes. */
  {const root=document.documentElement,
   palette=()=>{const cs=getComputedStyle(root),probe=document.createElement('i');probe.style.display='none';root.appendChild(probe);
     const hex=n=>{const v=cs.getPropertyValue(n).trim();if(!v)return '';probe.style.color='';probe.style.color=v;
       const m=getComputedStyle(probe).color.match(/[\d.]+/g);return m&&m.length>=3?'#'+m.slice(0,3).map(x=>Math.round(+x).toString(16).padStart(2,'0')).join(''):''};
     const o={light:root.dataset.theme==='light',bg:hex('--bg'),s:hex('--s'),ink:hex('--ink'),mu:hex('--mu'),ac:hex('--ac'),on:hex('--on'),pa:hex('--pa'),dg:hex('--dg')};
     probe.remove();return JSON.stringify(o)},
   tell=()=>{try{if(typeof N.setTheme==='function')N.setTheme(root.dataset.theme==='light'?'light':'dark')}catch(e){}
     try{if(typeof N.setPalette==='function')N.setPalette(palette())}catch(e){}};
   tell();new MutationObserver(tell).observe(root,{attributes:true,attributeFilter:['data-theme','data-accent']})}
  /* The phone's Back button asks the page first: if a sheet (Capture, Add task, Settings...) is open, close it
     and stay in the app. The PIN lock screen is left alone so Back cannot be used to get past it. */
  window.nxBack=()=>{const l=document.getElementById('lock');if(l&&l.open)return false;if(dlg.open){dlg.close();return true}return false};
  /* Items from the bubble. Each note goes through the same parser as the capture box, then is confirmed
     back to the app so it is never imported twice. */
  let busy=false;
  const when=ts=>new Date(ts||Date.now()).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  /* A screenshot or voice note recorded in the bubble arrives as a file. Turn it into a photo or voice item. */
  const media=async o=>{
    if(typeof N.inboxMedia!=='function'||!o.f)return false;
    const d=N.inboxMedia(o.f);if(!d)return false;
    const shot=o.k==='screenshot',blob=await (await fetch(d)).blob(),id=uid();
    await bput(id,blob);
    const title=(shot?'Screenshot ':'Voice note ')+when(o.ts);
    return !!addItem({type:'note',title,body:'',tags:['bubble',shot?'screenshot':'voice'],project:null,due:null,promise:false,
      media:{id,kind:shot?'photo':'voice',name:(title+(shot?'.jpg':'.m4a')).slice(0,80),mime:shot?'image/jpeg':'audio/mp4'}})};
  /* A file shared to Nexus from another app: same shapes as the web share target (v42.js). */
  const shared=async o=>{
    if(typeof N.inboxMedia!=='function'||!o.f)return false;
    const d=N.inboxMedia(o.f);if(!d)return false;
    const blob=await (await fetch(d)).blob(),mime=blob.type||'application/octet-stream',id=uid();
    const name=String(o.t||'shared').slice(0,80)||'shared';
    await bput(id,blob);
    return !!addItem({type:'note',title:name.replace(/\.[^.]{1,5}$/,'')||name,body:'',url:'',tags:['shared'],project:null,due:null,promise:false,
      media:{id,kind:/^image\//.test(mime)?'photo':/^audio\//.test(mime)?'voice':/^video\//.test(mime)?'video':'file',name,mime}})};
  window.nxInbox=async()=>{if(busy)return;busy=true;try{
    let a=[];try{a=JSON.parse(N.inboxPeek()||'[]')}catch(e){}
    if(!Array.isArray(a)||!a.length)return;
    let notes=0,files=0,ticks=0;
    for(const o of a){
      if(o&&(o.k==='screenshot'||o.k==='voice')){try{if(await media(o))files++}catch(e){}continue}
      if(o&&o.k==='shared'){try{if(await shared(o))files++}catch(e){}continue}
      /* A tick from the home-screen widget or a reminder's Done button. */
      if(o&&o.k==='step'){const it=get(String(o.id||''));const st=it&&Array.isArray(it.subs)?it.subs.find(s=>s.id===o.s):null;if(st&&!st.d){upd(it.id,{subs:it.subs.map(s=>s.id===o.s?{...s,d:true}:s)});ticks++}continue}
      if(o&&o.k==='done'){const it=get(String(o.id||''));if(it&&it.type==='task'&&!it.done){upd(it.id,{done:true});ticks++}continue}
      const t=String(o&&o.t||'').trim().slice(0,5000);if(!t)continue;
      const k=o.k==='note'||o.k==='task'||o.k==='idea'?o.k:null,p=parse(t,k);if(!p)continue;
      p.tags=[...new Set([...(p.tags||[]),'bubble'])].slice(0,10);if(addItem(p))notes++}
    save();N.inboxAck(a.length);
    const n=notes+files;
    if(n||ticks){render();toast(n?(n===1?'1 item from the bubble':n+' items from the bubble'):(ticks===1?'1 task ticked off from your phone':ticks+' tasks ticked off from your phone'))}
  }catch(e){}finally{busy=false}};
  const poll=()=>{if(typeof parse==='function'&&typeof addItem==='function')window.nxInbox()};
  setTimeout(poll,500);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});

  /* The web view cannot download files by itself, so hand them to Android. */
  const toData=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(b)});
  const hand=a=>fetch(a.href).then(r=>r.blob()).then(toData).then(d=>toast(N.saveFile(a.download,d))).catch(()=>toast('Could not save the file.'));
  const click=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href.startsWith('blob:')){hand(this);return}return click.call(this)};
  document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[download]');if(a&&a.href.startsWith('blob:')){e.preventDefault();hand(a)}},true);
}

/* Settings: bubble switch inside the app, download link in a browser. */
const prev=settings;
settings=function(){prev();if(!dlg.open||$('#nxb'))return;
  const anchor=$('#rmt')&&$('#rmt').previousElementSibling;
  const box=document.createElement('div');box.id='nxb';
  const put=h=>{box.innerHTML=h;if(anchor)anchor.before(box);else dlg.append(box)};
  if(N){
    const label={on:'Turn off',off:'Turn on',nopermission:'Allow and turn on'};
    const note={on:'The bubble is showing. It tucks into the edge of the screen. Tap the small tab to pull it out, then tap it again to write a note. Drag it to the bottom to hide it.',off:'Shows a small Nexus bubble over your other apps. Tap it to write a note without opening Nexus.',nopermission:'Android needs your permission to show the bubble over other apps. Tap the button, switch on "Display over other apps" for Nexus, then come back.'};
    let st=N.bubbleState();
    put(`<h2>Floating bubble</h2><p class="mu" id="nxn">${note[st]||note.off}</p><div class="row2"><button class="btn ${st==='on'?'':'p'}" id="nxt">${label[st]||label.off}</button></div>`);
    const paint=()=>{st=N.bubbleState();const t=$('#nxt'),n=$('#nxn');if(!t||!n)return;t.textContent=label[st]||label.off;t.className='btn '+(st==='on'?'':'p');n.textContent=note[st]||note.off};
    $('#nxt').onclick=()=>{const r=N.setBubble(st!=='on');if(r==='permission')toast('Switch on "Display over other apps" for Nexus.');setTimeout(paint,600)};
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(paint,700)});
  }else if(/Android/i.test(navigator.userAgent)){
    put(`<h2>Android app</h2><p class="mu">The Android app adds a floating bubble that stays over your other apps, so you can jot a note without opening Nexus. It installs outside the Play Store, so Android asks you to allow installs from your browser once.</p><div class="row2"><a class="btn p" href="${APK}" style="display:inline-flex;align-items:center;text-decoration:none" rel="noopener">Download the Android app</a></div><p class="mu">Your items live in this browser. In the app, use Export backup here and Restore backup there to move them across.</p>`);
  }
};
A.settings=settings;
})();
