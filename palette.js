/* Nexus command palette. Loaded after features.js.
   Ctrl+K (or Cmd+K) opens it anywhere. "/" jumps to the top search bar and "c" opens Capture
   when you are not typing in a field. Type to filter commands and search your items. */
(()=>{
const typing=t=>t&&(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable);
const cmds=()=>{const T=D.items.filter(i=>i.type==='task'&&!i.done).sort((a,b)=>String(a.due||'9').localeCompare(String(b.due||'9')));
  const c=[['Capture something',()=>A.cap()],['Go to Home',()=>A.tab('home')],['Go to Tasks',()=>A.tab('tasks')],['Go to Library',()=>A.tab('notes')],['Go to Study',()=>A.tab('study')],['Go to More',()=>A.tab('browse')],['Open timeline',()=>A.tab('time')],
   ['Plan your day (time blocks)',()=>A.planview()],['Ask Nexus',()=>A.askai()],['Settings, backup, trash and restore points',()=>A.settings()],['New project',()=>A.newp()],['New study subject',()=>A.newsub()]];
  if(T.length)c.push(['Focus 25 minutes on: '+T[0].title.slice(0,40),()=>focus(T[0].id)]);return c};
function open(){
  let sel=0,rows=[];
  sheet('<input id="nxp" type="search" autocomplete="off" aria-label="Command palette" placeholder="Type a command or search" style="margin-top:4px"><ul id="nxl" role="listbox" style="margin-top:8px"></ul><small>Up and down to choose, Enter to run, Esc to close.</small>');
  const inp=$('#nxp'),ul=$('#nxl'),run=r=>{dlg.close();setTimeout(r.fn,80)};
  const draw=()=>{const q=inp.value.trim().toLowerCase();rows=[];
    cmds().filter(c=>!q||c[0].toLowerCase().includes(q)).slice(0,q?5:12).forEach(c=>rows.push({l:c[0],s:'Command',fn:c[1]}));
    if(q.length>1){const r=search(q);r.pr.slice(0,3).forEach(p=>rows.push({l:p.name,s:'Project',fn:()=>A.proj(p.id)}));r.it.slice(0,8).forEach(i=>rows.push({l:i.title||dom(i.url)||'Untitled',s:i.type[0].toUpperCase()+i.type.slice(1),fn:()=>A.open(i.id)}))}
    sel=Math.min(sel,Math.max(0,rows.length-1));
    ul.innerHTML=rows.length?rows.map((r,i)=>`<li class="row" role="option" aria-selected="${i===sel}"><button class="rm" data-p="${i}" style="${i===sel?'background:var(--ln);':''}padding:10px 8px"><b>${E(r.l)}</b><small>${E(r.s)}</small></button></li>`).join(''):'<li><small>Nothing matches.</small></li>'};
  inp.oninput=()=>{sel=0;draw()};
  inp.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();sel=Math.min(rows.length-1,sel+1);draw()}else if(e.key==='ArrowUp'){e.preventDefault();sel=Math.max(0,sel-1);draw()}else if(e.key==='Enter'&&rows[sel]){e.preventDefault();run(rows[sel])}};
  ul.onclick=e=>{const b=e.target.closest('[data-p]');if(b&&rows[+b.dataset.p])run(rows[+b.dataset.p])};
  draw();inp.focus()}
window.nxPalette=open;
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='k'){e.preventDefault();open();return}
  if(e.ctrlKey||e.metaKey||e.altKey||typing(e.target)||dlg.open)return;
  if(e.key==='/'){e.preventDefault();$('#q').focus()}
  else if(e.key==='c'){e.preventDefault();A.cap()}
});
})();
