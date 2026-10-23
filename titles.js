/* Nexus: page titles for saved links (Android app only; a browser cannot read other sites' titles).
   A link saved with just its address gets the page's title. Titles you wrote yourself are never replaced. */
(()=>{
const N=window.NexusNative,L=s=>window.NXI18N?window.NXI18N.t(s):s;
const OFF='nexus.titles'+NS,on=()=>{try{return localStorage.getItem(OFF)!=='off'}catch(e){return true}};
const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch(e){return''}};
const plain=it=>!it.title||it.title===it.url||it.title===host(it.url)||it.title===host(it.url).replace(/\.[a-z]+$/,'');
const can=()=>N&&typeof N.fetchTitle==='function'&&on();
function queue(){if(!can())return;let n=0;
  for(const it of D.items){if(n>=5)break;if(it.type!=='link'||!/^https?:\/\//i.test(it.url||'')||it.ttl===1||!plain(it))continue;
    if(typeof it.ttl==='number'&&Date.now()-it.ttl<864e5)continue;
    it.ttl=Date.now();n++;try{N.fetchTitle(it.id,it.url)}catch(e){}}
  if(n)save()}
window.nxTitle=(id,t)=>{const it=get(id);if(!it)return;t=String(t||'').trim().slice(0,200);
  if(t&&plain(it)){upd(id,{title:t,ttl:1});render()}else if(t)it.ttl=1;save()};
window.nxTitleQueue=queue;
const oAdd=addItem;addItem=function(){const it=oAdd.apply(this,arguments);if(it&&it.type==='link')setTimeout(queue,400);return it};
setTimeout(queue,3000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(queue,1500)});
const oS=settings;settings=function(){const r=oS.apply(this,arguments);
  try{if(N&&typeof N.fetchTitle==='function'&&dlg.open&&!$('#nxti'))dlg.insertAdjacentHTML('beforeend',`<label style="margin-top:14px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="nxti" ${on()?'checked':''}><span>${E(L('Look up page titles for saved links'))}</span></label><p class="mu"><small>${E(L('Contacts only the saved page, from this phone, and only when a link has no title of its own.'))}</small></p>`),$('#nxti').onchange=e=>{try{localStorage.setItem(OFF,e.target.checked?'on':'off')}catch(x){}if(e.target.checked)queue()}}catch(e){}
  return r};A.settings=settings;
})();
