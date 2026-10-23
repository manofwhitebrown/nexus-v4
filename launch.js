/* Nexus Phase 5 (launch). Loaded last.
   1. The first-run tour: four short steps, about a minute. Language first, so everything after it is readable.
   2. Language in Settings (English, हिन्दी, తెలుగు).
   3. Accessibility: every dialog is named for screen readers, focus goes into a dialog and comes back,
      groups of buttons say what they are, and new content is announced politely.
   The tour never opens on top of another dialog, and it counts as seen however it is closed. */
(()=>{
const I=window.NXI18N||{t:s=>s,set(){},pref:()=>'auto',lang:()=>'en',langs:[['auto','Phone language'],['en','English']],onChange(){}};
const HK='nexus.hi'+NS;
const seen=()=>{try{return!!localStorage.getItem(HK)}catch(e){return true}};
const mark=()=>{try{localStorage.setItem(HK,'1')}catch(e){}};

/* ---------- 1. the tour ---------- */
const droid=!!window.NexusNative;
const LANG3=[['en','English','en'],['hi','हिन्दी','hi'],['te','తెలుగు','te']];
const STEPS=[
  ()=>`<h2 id="nx-th" tabindex="-1">Welcome to Nexus</h2><p class="mu">Tasks, notes and study in one place. Everything stays on this phone. No account, no server.</p>
    <p class="mu" style="margin-bottom:0" id="nx-tl">Language</p>
    <div class="chips" role="group" aria-labelledby="nx-tl" id="nx-tlg">${LANG3.map(([k,l,c])=>`<button class="chip" type="button" lang="${c}" data-l="${k}" aria-pressed="${I.lang()===k}">${l}</button>`).join('')}</div>`,
  ()=>`<h2 id="nx-th" tabindex="-1">Save anything in three seconds</h2><p class="mu">Tap Capture and type. Words like tomorrow, #tags and @project sort it for you.</p>
    <div class="card" style="cursor:default"><small>You type</small><b>task call Sam tomorrow</b><small>Nexus saves a task due tomorrow.</small></div>
    ${droid?'<p class="mu">The floating bubble, the home-screen widget and the lock-screen shortcut save a note from any app.</p>':''}`,
  ()=>`<h2 id="nx-th" tabindex="-1">Plan without guilt</h2><p class="mu">Home shows the one thing to do now, then what comes next. A task you miss stays in your list. It is never shown in red.</p>`,
  ()=>`<h2 id="nx-th" tabindex="-1">Study from your own notes</h2><p class="mu">Turn notes into flashcards. Nexus brings each card back just before you would forget it.</p><p class="mu">To lock everything with a passphrase and keep a backup, open Settings from the More tab.</p>`];
let step=0,on=false;
function draw(){
  const last=step===STEPS.length-1;
  sheet(`<div class="row2" style="margin:0 0 6px;justify-content:space-between;align-items:center"><small style="margin:0">Step ${step+1} of ${STEPS.length}</small>${last?'':'<button class="btn" type="button" id="nx-tskip">Skip</button>'}</div>${STEPS[step]()}
    <div class="row2">${step?'<button class="btn" type="button" id="nx-tback">Back</button>':''}${last?'<button class="btn p" type="button" id="nx-tgo">Start empty</button><button class="btn" type="button" id="nx-tsm">Add sample items</button>':'<button class="btn p" type="button" id="nx-tnext">Next</button>'}</div>`);
  const q=s=>dlg.querySelector(s),h=q('#nx-th');
  if(q('#nx-tnext'))q('#nx-tnext').onclick=()=>{step++;draw()};
  if(q('#nx-tback'))q('#nx-tback').onclick=()=>{step--;draw()};
  if(q('#nx-tskip'))q('#nx-tskip').onclick=()=>dlg.close();
  if(q('#nx-tgo'))q('#nx-tgo').onclick=()=>dlg.close();
  if(q('#nx-tsm'))q('#nx-tsm').onclick=()=>{dlg.close();if(window.nxSample)window.nxSample()};
  if(q('#nx-tlg'))q('#nx-tlg').onclick=e=>{const b=e.target.closest('[data-l]');if(!b)return;I.set(b.dataset.l);
    [...q('#nx-tlg').children].forEach(c=>c.setAttribute('aria-pressed',c===b))};
  if(h)h.focus();
}
function tour(){on=true;step=0;draw()}
dlg.addEventListener('close',()=>{if(on){on=false;mark();if(typeof render==='function')render()}});
window.showWelcome=tour;A.welcome=tour;
function firstRun(){
  if(seen()||D.items.length||D.projects.length)return;
  if(dlg.open){dlg.addEventListener('close',()=>setTimeout(firstRun,300),{once:true});return}
  tour()}
setTimeout(firstRun,600);

/* ---------- 2. language in Settings ---------- */
const LN={auto:'Phone language'};
const oS=settings;
settings=function(){oS();
  const ap=$('#ap3');if(!ap||$('#nx-lg'))return;
  ap.insertAdjacentHTML('afterend',`<p class="mu" style="margin:0" id="nx-lgt">Language</p><div class="chips" id="nx-lg" role="group" aria-labelledby="nx-lgt">${I.langs.map(([k,l])=>`<button class="chip" type="button" data-v="${k}" ${k==='hi'?'lang="hi"':k==='te'?'lang="te"':''} aria-pressed="${I.pref()===k}">${k==='auto'?LN.auto:l}</button>`).join('')}</div>`);
  $('#nx-lg').onclick=e=>{const b=e.target.closest('[data-v]');if(!b)return;I.set(b.dataset.v);
    [...$('#nx-lg').children].forEach(c=>c.setAttribute('aria-pressed',c===b))}};
A.settings=settings;

/* ---------- 3. accessibility ---------- */
/* 3a. every dialog is named by its first heading, or says what it is */
let lastFocus=null;
const nameDlg=d=>{
  if(!d.open){return}
  const h=d.querySelector('h1,h2');
  if(h){if(!h.id)h.id='nx-dh';d.setAttribute('aria-labelledby',h.id);d.removeAttribute('aria-label')}
  else{d.removeAttribute('aria-labelledby');if(!d.getAttribute('aria-label'))d.setAttribute('aria-label','Dialog')}};
new MutationObserver(()=>nameDlg(dlg)).observe(dlg,{childList:true,subtree:true});
/* remember what had focus, so closing a dialog puts you back where you were (the browser focuses inside it itself) */
new MutationObserver(()=>{
  if(dlg.open){if(!lastFocus&&document.activeElement&&document.activeElement!==document.body&&!dlg.contains(document.activeElement))lastFocus=document.activeElement;nameDlg(dlg)}
}).observe(dlg,{attributes:true,attributeFilter:['open']});
dlg.addEventListener('close',()=>{
  const f=lastFocus;lastFocus=null;
  setTimeout(()=>{if(dlg.open)return;
    if(f&&document.contains(f)&&f.focus){f.focus();return}
    if(document.activeElement===document.body||!document.activeElement){const m=$('#m');if(m)m.focus({preventScroll:true})}},0)});
/* 3b. the Focus screen is a dialog too: name it and move focus into it */
const fxEl=$('#fx');
if(fxEl)new MutationObserver(()=>{if(fxEl.style.display&&fxEl.style.display!=='none'){const b=fxEl.querySelector('button');if(b&&!fxEl.contains(document.activeElement))b.focus()}}).observe(fxEl,{attributes:true,attributeFilter:['style'],childList:true});
/* 3c. screen readers: the toast is already role=status; the screen title is announced when you change tabs */
const mEl=$('#m');
if(mEl){
  document.addEventListener('click',e=>{if(e.target.closest('nav [data-a=tab]')||e.target.closest('.mk')){setTimeout(()=>{const h=mEl.querySelector('h1');if(h){h.setAttribute('tabindex','-1');h.focus({preventScroll:true})}},60)}})}
/* 3d. button groups made of chips say they are groups, and say which one is chosen */
const groupChips=root=>{root.querySelectorAll('.chips:not([role])').forEach(c=>{c.setAttribute('role','group');if(!c.getAttribute('aria-label')&&!c.getAttribute('aria-labelledby')){
  const p=c.previousElementSibling;if(p&&/^(P|H2|H3|SMALL)$/.test(p.tagName)){if(!p.id)p.id='nx-g'+Math.random().toString(36).slice(2,7);c.setAttribute('aria-labelledby',p.id)}}})};
new MutationObserver(()=>{groupChips(document)}).observe(document.body,{childList:true,subtree:true});
groupChips(document);
/* 3e. a skip link for keyboards */
if(!$('#nx-skip')){const a=document.createElement('a');a.id='nx-skip';a.href='#m';a.textContent='Skip to content';
  a.addEventListener('click',e=>{e.preventDefault();const m=$('#m');if(m)m.focus()});document.body.prepend(a)}
})();
