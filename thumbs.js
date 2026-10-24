/* Nexus: preview pictures for saved links (Android app only; a browser cannot read other sites' pictures).
   Android finds the page's own preview image, this file shrinks it to a small square and keeps it on the link.
   A picture is never fetched for a link that already has one, and a link without one is tried once a day at most. */
(()=>{
const N=window.NexusNative,L=s=>window.NXI18N?window.NXI18N.t(s):s;
const OFF='nexus.thumbs'+NS,on=()=>{try{return localStorage.getItem(OFF)!=='off'}catch(e){return true}};
const can=()=>N&&typeof N.fetchThumb==='function'&&on();
const SZ=112;
function queue(){if(!can())return;let n=0;
  for(const it of D.items){if(n>=4)break;if(it.type!=='link'||!/^https?:\/\//i.test(it.url||'')||it.th||it.thx===1)continue;
    if(typeof it.thx==='number'&&Date.now()-it.thx<864e5)continue;
    it.thx=Date.now();n++;try{N.fetchThumb(it.id,it.url)}catch(e){}}
  if(n)save()}
/* shrink to a centred SZ x SZ square, as a small JPEG */
const shrink=d=>new Promise(res=>{const im=new Image();im.onload=()=>{try{const w=im.naturalWidth,h=im.naturalHeight;if(!w||!h)return res('');
  const s=Math.min(w,h),c=document.createElement('canvas');c.width=c.height=SZ;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,SZ,SZ);
  x.drawImage(im,(w-s)/2,(h-s)/2,s,s,0,0,SZ,SZ);res(c.toDataURL('image/jpeg',.6))}catch(e){res('')}};im.onerror=()=>res('');im.src=d});
window.nxThumb=async(id,d)=>{const it=get(id);if(!it)return;let t='';try{if(d&&/^data:image\//.test(d)&&d.length<900000)t=await shrink(d)}catch(e){}
  if(t&&t.length<20000){it.th=t;it.thx=1;save();render()}else{it.thx=Date.now();save()}};
window.nxThumbQueue=queue;
/* show it: a small picture at the start of each link row (the row markup is built in index.html, so add it after drawing) */
const paint=()=>{if(!on())return;document.querySelectorAll('#m li.row').forEach(li=>{if(li.querySelector('.nxth'))return;const b=li.querySelector('.rm[data-i]');if(!b)return;
  const it=get(b.dataset.i);if(!it||!it.th)return;const im=document.createElement('img');im.className='nxth';im.alt='';im.src=it.th;im.width=im.height=44;li.insertBefore(im,li.firstChild)})};
const oR=render;render=function(){const r=oR.apply(this,arguments);try{paint()}catch(e){}return r};
const st=document.createElement('style');st.textContent='.nxth{flex:none;width:44px;height:44px;align-self:center;object-fit:cover;border-radius:var(--r);border:1px solid var(--ln);background:var(--tr)}';document.head.appendChild(st);
const oAdd=addItem;addItem=function(){const it=oAdd.apply(this,arguments);if(it&&it.type==='link')setTimeout(queue,900);return it};
setTimeout(queue,4000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(queue,2000)});
const oS=settings;settings=function(){const r=oS.apply(this,arguments);
  try{if(N&&typeof N.fetchThumb==='function'&&dlg.open&&!$('#nxtp'))dlg.insertAdjacentHTML('beforeend',`<label style="margin-top:14px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="nxtp" ${on()?'checked':''}><span>${E(L('Show preview pictures for saved links'))}</span></label><p class="mu"><small>${E(L('Contacts the saved page and the site that holds its picture, from this phone, and keeps a small copy on the link.'))}</small></p>`),$('#nxtp').onchange=e=>{try{localStorage.setItem(OFF,e.target.checked?'on':'off')}catch(x){}if(e.target.checked)queue();render()}}catch(e){}
  return r};A.settings=settings;
})();
