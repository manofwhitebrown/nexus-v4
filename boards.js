/* Nexus boards, rules and folders. Loaded after tasks2.js.
   1. Board view: To do, Doing and Done columns for all tasks or one project. Move a card by dragging (press and hold)
      or with the arrow buttons.
   2. Week view: drag a task to another day (press and hold), or use its Move button.
   3. Your own smart collections: rules you write (type, status, priority, tag, project, due date, words).
      Rules are part of backups and sync.
   4. Folders for files in the Library. */
(()=>{
const L=s=>window.NXI18N?window.NXI18N.t(s):s;
const LS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}};
const COLS=[['todo','To do'],['doing','Doing'],['done','Done']];
const colOf=i=>i.done?'done':i.st==='doing'?'doing':'todo';

/* ---------- moving things (also used by the tests) ---------- */
A.moveDay=(id,day)=>{const it=get(id);if(!it||it.type!=='task'||!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return;if(it.due===day)return;upd(id,{due:day});render()};
A.bmv=(id,col)=>{const it=get(id);if(!it||it.type!=='task')return;
  if(col==='done')upd(id,{done:true,st:null});else upd(id,{done:false,st:col==='doing'?'doing':null});render()};
A.bstep=a=>{const [id,d]=String(a).split('|'),it=get(id);if(!it)return;const k=COLS.map(c=>c[0]),n=k.indexOf(colOf(it))+(+d);if(n>=0&&n<k.length)A.bmv(id,k[n])};
A.nxmv=id=>{const it=get(id);if(!it)return;const s=nxMon(S.wo||0);
  sheet(`<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">${E(L('Move to'))}</h2><button class="btn" id="nxmx" type="button">${E(L('Close'))}</button></div><ul>${[...Array(7)].map((_,k)=>{const d=new Date(s);d.setDate(s.getDate()+k);const key=dk(d);return`<li class="row"><button class="rm" type="button" data-day-pick="${key}" ${key===it.due?'aria-current="date"':''}><b>${E(d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short'}))}</b></button></li>`}).join('')}</ul>`);
  $('#nxmx').onclick=()=>dlg.close();
  dlg.querySelectorAll('[data-day-pick]').forEach(b=>b.onclick=()=>{dlg.close();A.moveDay(id,b.dataset.dayPick)})};

/* ---------- press-and-hold drag ---------- */
let DG=null,NOCLICK=0;
const target=(x,y)=>{const e=document.elementFromPoint(x,y);return e&&e.closest?e.closest('[data-day],[data-col]'):null};
const mark=el=>{document.querySelectorAll('[data-dropping]').forEach(n=>{n.removeAttribute('data-dropping');n.style.outline=''});if(el){el.setAttribute('data-dropping','1');el.style.outline='2px dashed var(--fg,currentColor)';el.style.outlineOffset='4px'}};
document.addEventListener('pointerdown',e=>{if(e.button&&e.button>0)return;if(!['week','board'].includes(S.tab))return;
  const li=e.target.closest&&e.target.closest('li[data-dg]');if(!li||e.target.closest('button.ck,[data-a="nxmv"],[data-a="bstep"]'))return;
  DG={id:li.dataset.dg,li,x:e.clientX,y:e.clientY,on:0,t:setTimeout(()=>{if(DG){DG.on=1;li.style.opacity='.55';try{navigator.vibrate&&navigator.vibrate(15)}catch(x){}}},350)}});
document.addEventListener('pointermove',e=>{if(!DG)return;
  if(!DG.on){if(Math.hypot(e.clientX-DG.x,e.clientY-DG.y)>8){clearTimeout(DG.t);DG=null}return}
  mark(target(e.clientX,e.clientY))});
document.addEventListener('touchmove',e=>{if(DG&&DG.on)e.preventDefault()},{passive:false});
const end=e=>{if(!DG)return;clearTimeout(DG.t);const d=DG;DG=null;d.li.style.opacity='';
  if(!d.on){mark(null);return}
  const t=e&&e.type==='pointerup'?target(e.clientX,e.clientY):null;mark(null);NOCLICK=Date.now();
  if(t&&t.dataset.day)A.moveDay(d.id,t.dataset.day);else if(t&&t.dataset.col)A.bmv(d.id,t.dataset.col)};
document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
document.addEventListener('click',e=>{if(Date.now()-NOCLICK<400){e.stopPropagation();e.preventDefault()}},true);

/* ---------- 1. Board view ---------- */
function boardHtml(){const pj=S.bp&&D.projects.find(p=>p.id===S.bp)?S.bp:null,T=D.items.filter(i=>i.type==='task'&&(!pj||i.project===pj));
  let h=`<h1>${E(L('Board'))}</h1><div class="chips" role="group" aria-label="${E(L('Project'))}"><button class="chip" type="button" data-a="bpj" data-i="" aria-pressed="${!pj}">${E(L('All projects'))}</button>${D.projects.map(p=>`<button class="chip" type="button" data-a="bpj" data-i="${E(p.id)}" aria-pressed="${p.id===pj}">${E(p.name)}</button>`).join('')}<button class="chip" type="button" data-a="tab" data-i="tasks">${E(L('Go to Tasks'))}</button></div>`;
  h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin-top:8px">';
  COLS.forEach(([k,l])=>{let C=T.filter(i=>colOf(i)===k);if(k==='done')C=C.sort((a,b)=>(b.doneAt||'').localeCompare(a.doneAt||'')).slice(0,20);
    h+=`<section data-col="${k}" aria-label="${E(L(l))}" style="min-height:90px"><h2>${E(L(l))} (${C.length})</h2>${C.length?list(C):'<p class="mu" style="margin:0">'+E(L('Drop a card here'))+'</p>'}</section>`});
  return h+'</div><p class="mu"><small>'+E(L('Press and hold a card to drag it, or use the arrows.'))+'</small></p>'}
A.boardview=pj=>{S.bp=pj&&typeof pj==='string'?pj:null;S.tab='board';S.pj=S.col=S.sj=null;const q=$('#q');if(q)q.value='';if(dlg.open)dlg.close();render();scrollTo(0,0)};
A.bpj=i=>{S.bp=i||null;render()};

/* ---------- 3. Rules ---------- */
const RK='nexus.rules'+NS;
const migrate=()=>{try{if(!Array.isArray(D.rules))D.rules=[];const old=JSON.parse(LS(RK)||'null');if(Array.isArray(old)&&old.length){const have=new Set(D.rules.map(r=>r.id));old.forEach(r=>{if(r&&r.id&&r.name&&!have.has(r.id))D.rules.push(r)});save()}if(LS(RK)!==null)try{localStorage.removeItem(RK)}catch(e){}}catch(e){}};
const rules=()=>{migrate();return(Array.isArray(D.rules)?D.rules:[]).filter(x=>x&&x.id&&x.name).slice(0,30)};
const setRules=r=>{D.rules=r.slice(0,30);save()};
const pred=r=>i=>{
  if(r.type&&r.type!=='any'&&i.type!==r.type)return false;
  if(r.status==='open'&&(i.type!=='task'||i.done))return false;
  if(r.status==='done'&&!(i.type==='task'&&i.done))return false;
  if(r.pri&&r.pri!=='any'&&String(i.pri||0)!==r.pri)return false;
  if(r.tag&&!(i.tags||[]).includes(String(r.tag).toLowerCase().replace(/^#+/,'')))return false;
  if(r.project&&r.project!=='any'&&(r.project==='none'?!!i.project:i.project!==r.project))return false;
  const td=dk();
  if(r.due==='overdue'&&!(i.due&&i.due<td&&!i.done))return false;
  if(r.due==='today'&&i.due!==td)return false;
  if(r.due==='week'&&!(i.due&&i.due>=td&&i.due<=addD(6)))return false;
  if(r.due==='none'&&i.due)return false;
  if(r.due==='has'&&!i.due)return false;
  if(r.text&&!((i.title||'')+' '+(i.body||'')).toLowerCase().includes(String(r.text).toLowerCase()))return false;
  return true};
window.nxRules={list:rules,set:setRules,pred};
const oCols=cols;
cols=function(){const c=oCols();rules().forEach(r=>{let n=r.name;while(n in c)n+=' *';c[n]=pred(r)});return c};
const opt=(v,cur,l)=>`<option value="${E(v)}" ${v===cur?'selected':''}>${E(L(l))}</option>`;
function ruleForm(id){const all=rules(),r=all.find(x=>x.id===id)||{id:uid(),name:'',type:'any',status:'any',pri:'any',tag:'',project:'any',due:'any',text:''},isNew=!all.some(x=>x.id===r.id);
  sheet(`<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">${E(L(isNew?'New rule':'Edit rule'))}</h2><button class="btn" id="nrx" type="button">${E(L('Close'))}</button></div>
<label><span>${E(L('Name'))}</span><input id="nr-n" maxlength="40" value="${E(r.name)}" autocomplete="off"></label>
<label><span>${E(L('Type'))}</span><select id="nr-t">${[['any','Any'],['task','Tasks'],['note','Notes'],['link','Saved'],['idea','Ideas']].map(([v,l])=>opt(v,r.type,l)).join('')}</select></label>
<label><span>${E(L('Status'))}</span><select id="nr-s">${[['any','Any'],['open','Open tasks'],['done','Finished tasks']].map(([v,l])=>opt(v,r.status,l)).join('')}</select></label>
<label><span>${E(L('Priority'))}</span><select id="nr-p">${[['any','Any'],['1','High'],['2','Medium'],['3','Low'],['0','None']].map(([v,l])=>opt(v,r.pri,l)).join('')}</select></label>
<label><span>${E(L('Due'))}</span><select id="nr-d">${[['any','Any'],['overdue','Overdue'],['today','Today'],['week','Next 7 days'],['has','Has a date'],['none','No date']].map(([v,l])=>opt(v,r.due,l)).join('')}</select></label>
<label><span>${E(L('Project'))}</span><select id="nr-j">${[['any','Any'],['none','No project']].map(([v,l])=>opt(v,r.project,l)).join('')}${D.projects.map(p=>`<option value="${E(p.id)}" ${p.id===r.project?'selected':''}>${E(p.name)}</option>`).join('')}</select></label>
<label><span>${E(L('Has the tag'))}</span><input id="nr-g" maxlength="30" value="${E(r.tag)}" autocomplete="off"></label>
<label><span>${E(L('Contains the words'))}</span><input id="nr-w" maxlength="60" value="${E(r.text)}" autocomplete="off"></label>
<p class="mu" id="nr-e" role="alert"></p><div class="row2"><button class="btn p" id="nr-ok" type="button">${E(L('Save rule'))}</button>${isNew?'':`<button class="btn d" id="nr-del" type="button">${E(L('Delete rule'))}</button>`}</div>`);
  $('#nrx').onclick=()=>dlg.close();
  $('#nr-ok').onclick=()=>{const n=$('#nr-n').value.trim().slice(0,40);if(!n){$('#nr-e').textContent=L('Give the rule a name.');return}
    const nr={id:r.id,name:n,type:$('#nr-t').value,status:$('#nr-s').value,pri:$('#nr-p').value,due:$('#nr-d').value,project:$('#nr-j').value,tag:$('#nr-g').value.trim().toLowerCase().replace(/^#+/,'').slice(0,30),text:$('#nr-w').value.trim().slice(0,60)};
    setRules(isNew?all.concat(nr):all.map(x=>x.id===r.id?nr:x));dlg.close();render()};
  if($('#nr-del'))$('#nr-del').onclick=()=>{setRules(all.filter(x=>x.id!==r.id));dlg.close();render();toast(L('Rule deleted'))}}
A.rule=id=>ruleForm(id||'');

/* ---------- 4. Folders ---------- */
const folders=()=>[...new Set(D.items.filter(i=>i.media&&i.folder).map(i=>i.folder))].sort((a,b)=>a.localeCompare(b));
const oEdit3=edit;
edit=function(i){oEdit3(i);const it=get(i);if(!it||!it.media||!$('#med')||$('#nxfo'))return;
  $('#med').insertAdjacentHTML('afterend',`<label><span>${E(L('Folder'))}</span><input id="nxfo" list="nxfl" maxlength="40" autocomplete="off" value="${E(it.folder||'')}" placeholder="${E(L('No folder'))}"><datalist id="nxfl">${folders().map(f=>`<option value="${E(f)}"></option>`).join('')}</datalist></label>`);
  $('#nxfo').onchange=e=>{upd(i,{folder:e.target.value.trim().slice(0,40)||null})}};
A.ff=i=>{S.ff=i||'';render()};

/* ---------- wiring into the screens ---------- */
function decorate3(){const m=$('#m');if(!m)return;
  m.querySelectorAll('li.row').forEach(li=>{const b=li.querySelector('[data-a="open"]');if(!b||li.dataset.nx3)return;const it=get(b.dataset.i);if(!it)return;li.dataset.nx3='1';
    if(it.folder&&it.media){const sm=b.querySelector('small');if(sm)sm.textContent=[sm.textContent,L('Folder')+': '+it.folder].filter(Boolean).join(', ')}
    if(it.type==='task'&&['week','board'].includes(S.tab)){li.dataset.dg=it.id;li.style.touchAction='manipulation';
      if(S.tab==='week')li.insertAdjacentHTML('beforeend',`<button class="chip" type="button" data-a="nxmv" data-i="${E(it.id)}" aria-label="${E(L('Move to')+': '+(it.title||''))}">${E(L('Move'))}</button>`);
      else li.insertAdjacentHTML('beforeend',`${colOf(it)!=='todo'?`<button class="chip" type="button" data-a="bstep" data-i="${E(it.id)}|-1" aria-label="${E(L('Move left')+': '+(it.title||''))}">&larr;</button>`:''}${colOf(it)!=='done'?`<button class="chip" type="button" data-a="bstep" data-i="${E(it.id)}|1" aria-label="${E(L('Move right')+': '+(it.title||''))}">&rarr;</button>`:''}`)}});
  if(S.tab==='tasks'&&!$('#q').value.trim()&&$('#nxpf')&&!$('#nxbd'))$('#nxpf').insertAdjacentHTML('beforeend',`<button class="chip" type="button" id="nxbd" data-a="boardview">${E(L('Board'))}</button>`);
  if(S.tab==='browse'&&S.pj&&!$('#nxbp')){const r=m.querySelector('.row2');if(r)r.insertAdjacentHTML('beforeend',`<button class="btn" id="nxbp" data-a="boardview" data-i="${E(S.pj)}">${E(L('Board'))}</button>`)}
  if(S.tab==='browse'&&!S.pj&&!S.col&&!$('#nxrl')){const rs=rules(),f=m.querySelector('footer'),h=`<div id="nxrl"><h2>${E(L('Your rules'))}</h2><p class="mu" style="margin:0">${E(L('Write your own smart collections. They show up above, with the built-in ones.'))}</p>${rs.length?'<ul>'+rs.map(r=>`<li class="row"><button class="rm" data-a="rule" data-i="${E(r.id)}"><b>${E(r.name)}</b><small>${pl(D.items.filter(pred(r)).length,'item')}, ${E(L('tap to edit'))}</small></button></li>`).join('')+'</ul>':''}<p><button class="btn" type="button" data-a="rule" data-i="">${E(L('New rule'))}</button></p></div>`;
    if(f)f.insertAdjacentHTML('beforebegin',h);else m.insertAdjacentHTML('beforeend',h)}
  if(S.tab==='notes'&&S.nf==='file'&&!$('#nxfd')){const fs=folders(),ch=m.querySelector('.chips');
    if(fs.length&&ch){const cur=S.ff||'';ch.insertAdjacentHTML('afterend',`<div class="chips" id="nxfd" role="group" aria-label="${E(L('Folder'))}">${[['',L('All folders')],...fs.map(f=>[f,f]),['__none',L('No folder')]].map(([k,l])=>`<button class="chip" type="button" data-a="ff" data-i="${E(k)}" aria-pressed="${cur===k}">${E(l)}</button>`).join('')}</div>`);
      if(cur)m.querySelectorAll('li.row').forEach(li=>{const b=li.querySelector('[data-a="open"]'),it=b&&get(b.dataset.i);if(it&&(cur==='__none'?!!it.folder:it.folder!==cur))li.hidden=true})}}
}
const oRender3=render;
render=function(){const bd=S.tab==='board'&&!($('#q')&&$('#q').value.trim());
  if(bd)S.tab='tasks';
  try{oRender3()}finally{if(bd)S.tab='board'}
  if(bd){$('#m').innerHTML=boardHtml()+foot();$('#nv').querySelectorAll('[aria-current]').forEach(b=>b.removeAttribute('aria-current'));try{window.nxDecorate()}catch(e){}}
  try{decorate3()}catch(e){}};
})();
