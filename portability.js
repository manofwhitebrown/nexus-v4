/* Nexus portability: take your data out as Markdown, bring other apps' data in.
   Export: one .zip with Tasks.md, Notes/*.md (Obsidian-friendly), Study/*.md.
   Import: Todoist CSV, Google Keep (Takeout .json), Evernote (.enex), and Markdown
   files from Obsidian or Notion. Everything runs on the device; nothing is uploaded.
   Loaded after safety.js and patch.js. Pure parsers live on window.NXIO so tests can call them. */
(()=>{
const LIM={items:5000,projects:100,title:200,body:20000};
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>isNaN(d)?null:d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const clean=s=>String(s==null?'':s).replace(/\r\n?/g,'\n');
const tagOf=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{M}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,30);
const uniqTags=a=>[...new Set((a||[]).map(tagOf).filter(Boolean))].slice(0,10);

/* ---------- Markdown export ---------- */
const safeName=s=>String(s||'Untitled').replace(/[\\/:*?"<>|#^\[\]\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'Untitled';
const yq=s=>'"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,' ')+'"';
function toFiles(D){
  const files=[],used=new Set(),pj=id=>(D.projects.find(p=>p.id===id)||{}).name||'';
  const uniq=(dir,base)=>{let n=base,i=2;while(used.has((dir+n).toLowerCase())){n=base+' '+i++}used.add((dir+n).toLowerCase());return dir+n+'.md'};
  const tasks=D.items.filter(i=>i.type==='task'),rest=D.items.filter(i=>i.type!=='task');
  /* Tasks.md uses the checkbox + emoji format that Obsidian Tasks and most Markdown editors read */
  const line=t=>'- ['+(t.done?'x':' ')+'] '+t.title+(t.tm?' ⏰ '+t.tm:'')+(t.dur?' ('+t.dur+' min)':'')+(t.rep?' 🔁 '+t.rep:'')+(t.due?' 📅 '+t.due:'')+(t.done&&t.doneAt?' ✅ '+String(t.doneAt).slice(0,10):'')+(t.tags&&t.tags.length?' '+t.tags.map(x=>'#'+x).join(' '):'');
  const groups=new Map();for(const t of tasks){const k=pj(t.project)||'No project';(groups.get(k)||groups.set(k,[]).get(k)).push(t)}
  let md='# Tasks\n';
  for(const [k,arr] of [...groups].sort((a,b)=>a[0]==='No project'?-1:b[0]==='No project'?1:a[0].localeCompare(b[0]))){
    md+='\n## '+k+'\n\n';for(const t of arr){md+=line(t)+'\n';if(t.body)md+=clean(t.body).trim().split('\n').map(l=>'    '+l).join('\n')+'\n'}}
  files.push({name:'Tasks.md',text:md});used.add('tasks.md');
  for(const n of rest){
    const fm=['---','type: '+n.type,'created: '+(n.created||''),'updated: '+(n.updated||'')];
    if(n.project&&pj(n.project))fm.push('project: '+yq(pj(n.project)));
    if(n.tags&&n.tags.length)fm.push('tags: ['+n.tags.map(tagOf).filter(Boolean).join(', ')+']');
    if(n.url)fm.push('url: '+yq(n.url));
    fm.push('---','');
    files.push({name:uniq('Notes/',safeName(n.title)),text:fm.join('\n')+(n.url?'<'+n.url+'>\n\n':'')+clean(n.body).trim()+'\n'})}
  for(const s of D.study||[]){
    let t='# '+(s.name||'Subject')+'\n\n';
    for(const c of s.cards||[])t+=String(c.q||'').replace(/\s*\n\s*/g,' ')+'::'+String(c.a||'').replace(/\s*\n\s*/g,' ')+'\n\n';
    files.push({name:uniq('Study/',safeName(s.name)),text:t})}
  files.push({name:'README.md',text:'# Nexus export\n\nExported '+new Date().toISOString().slice(0,10)+'.\n\n- `Tasks.md`: every task as a checkbox, grouped by project.\n- `Notes/`: notes, ideas and links, one file each, with front matter.\n- `Study/`: flashcards as `question::answer` lines.\n\nPhotos, voice notes and files are not in this export. Use **Export backup** in Settings to keep those.\n'});
  return files}

/* A minimal ZIP writer (no compression) so the export is a single download with folders */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc32=b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
function zip(files){
  const enc=new TextEncoder(),out=[],cen=[];let off=0;
  const u16=v=>[v&255,(v>>8)&255],u32=v=>[v&255,(v>>8)&255,(v>>16)&255,(v>>>24)&255];
  const d=new Date(),dt=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(),tm=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1);
  for(const f of files){
    const nm=enc.encode(f.name),data=enc.encode(f.text),crc=crc32(data);
    const lh=new Uint8Array([0x50,0x4b,3,4,...u16(20),...u16(0x0800),...u16(0),...u16(tm),...u16(dt),...u32(crc),...u32(data.length),...u32(data.length),...u16(nm.length),...u16(0)]);
    out.push(lh,nm,data);
    cen.push(new Uint8Array([0x50,0x4b,1,2,...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(tm),...u16(dt),...u32(crc),...u32(data.length),...u32(data.length),...u16(nm.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(off)]),nm);
    off+=lh.length+nm.length+data.length}
  let cs=0;for(const c of cen)cs+=c.length;
  const end=new Uint8Array([0x50,0x4b,5,6,...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(cs),...u32(off),...u16(0)]);
  return new Blob([...out,...cen,end],{type:'application/zip'})}

/* ---------- parsers: each returns [{type,title,body,url,tags,due,done,created,project}] ---------- */
function csv(text){
  const rows=[];let row=[],f='',q=false;text=clean(text).replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
    else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'){row.push(f);rows.push(row);row=[];f=''}else f+=c}
  if(f.length||row.length){row.push(f);rows.push(row)}
  return rows.filter(r=>r.some(x=>x.trim()))}
function dueOf(s){s=String(s||'').trim();if(!s)return null;
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[0];
  const d=new Date(s.replace(/\b(every|ev)\b.*$/i,''));return /\d{4}/.test(s)||/^[A-Za-z]{3,9} \d{1,2}/.test(s)?ymd(d):null}
function todoist(text,fileName){
  const rows=csv(text);if(!rows.length)return[];const h=rows[0].map(x=>x.trim().toUpperCase());
  const ix=n=>h.indexOf(n);if(ix('CONTENT')<0)return[];
  const proj=String(fileName||'').replace(/\.csv$/i,'').replace(/\s*\(\d+\)$/,'').trim()||null,out=[];let last=null;
  for(const r of rows.slice(1)){const type=(r[ix('TYPE')]||'task').toLowerCase(),content=(r[ix('CONTENT')]||'').trim();
    if(type==='section'||!content)continue;
    if(type==='note'){if(last)last.body=(last.body?last.body+'\n\n':'')+content;continue}
    let body=(r[ix('DESCRIPTION')]||'').trim();const date=(r[ix('DATE')]||'').trim(),due=dueOf(date);
    if(date&&!due)body=(body?body+'\n\n':'')+'Due: '+date;
    const pr=+(r[ix('PRIORITY')]||4);if(pr&&pr<4)body=(body?body+'\n\n':'')+'Todoist priority: P'+pr;
    const lk=content.match(/\[([^\]]+)\]\((https?:[^)]+)\)/);
    last={type:'task',title:lk?lk[1]:content,body,url:lk?lk[2]:'',tags:[],due,done:false,created:null,project:proj};out.push(last)}
  return out}
function keep(text){
  let j;try{j=JSON.parse(text)}catch(e){return[]}
  if(!j||typeof j!=='object'||j.isTrashed)return[];
  const us=v=>{v=+v;return v?new Date(v/1000).toISOString():null},tags=uniqTags((j.labels||[]).map(l=>l.name)),created=us(j.createdTimestampUsec),title=String(j.title||'').trim(),out=[];
  if(Array.isArray(j.listContent)&&j.listContent.length){
    const t=uniqTags([title,...tags]);
    for(const it of j.listContent){const x=String(it.text||'').trim();if(x)out.push({type:'task',title:x,body:'',url:'',tags:t,due:null,done:!!it.isChecked,created,project:null})}
    return out}
  const body=String(j.textContent||'').trim();if(!title&&!body)return[];
  return[{type:'note',title:title||body.split('\n')[0].slice(0,80),body:title?body:body.split('\n').slice(1).join('\n').trim(),url:'',tags,due:null,done:false,created,project:null}]}
function enex(text){
  const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))return[];
  const out=[];
  for(const n of doc.querySelectorAll('note')){
    const g=s=>{const e=n.querySelector(':scope > '+s);return e?e.textContent:''},title=g('title').trim(),html=g('content');
    const h=new DOMParser().parseFromString(html.replace(/<\?xml[^>]*\?>/,'').replace(/<!DOCTYPE[^>]*>/,''),'text/html');
    /* The HTML parser ignores the "/" in <en-todo/>, so what follows becomes its child: keep the children */
    h.querySelectorAll('en-todo').forEach(e=>e.replaceWith(h.createTextNode(e.getAttribute('checked')==='true'?'[x] ':'[ ] '),...e.childNodes));
    h.querySelectorAll('en-media').forEach(e=>e.replaceWith(...e.childNodes));
    h.querySelectorAll('en-crypt').forEach(e=>e.remove());
    h.querySelectorAll('br').forEach(e=>e.replaceWith(h.createTextNode('\n')));
    h.querySelectorAll('div,p,li,tr,h1,h2,h3,h4').forEach(e=>e.append(h.createTextNode('\n')));
    const body=(h.body.textContent||'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
    const c=g('created').match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/),created=c?new Date(Date.UTC(+c[1],c[2]-1,+c[3],+c[4],+c[5],+c[6])).toISOString():null;
    const url=safeUrlLocal(n.querySelector('note-attributes > source-url')&&n.querySelector('note-attributes > source-url').textContent);
    if(!title&&!body)continue;
    out.push({type:url&&!body?'link':'note',title:title||body.split('\n')[0].slice(0,80),body,url,tags:uniqTags([...n.querySelectorAll(':scope > tag')].map(t=>t.textContent)),due:null,done:false,created,project:null})}
  return out}
const safeUrlLocal=u=>{try{return typeof safeUrl==='function'?safeUrl(u):''}catch(e){return''}};
function markdown(text,fileName){
  text=clean(text);let fm={},body=text;
  const m=text.match(/^---\n([\s\S]*?)\n---\n?/);
  if(m){body=text.slice(m[0].length);
    for(const l of m[1].split('\n')){const k=l.match(/^([A-Za-z_-]+):\s*(.*)$/);if(k)fm[k[1].toLowerCase()]=k[2].trim()}}
  let title=String(fileName||'').replace(/\.(md|markdown|txt)$/i,'').replace(/[ _-]?[0-9a-f]{32}$/i,'').trim();
  if(!title){const h=body.match(/^#\s+(.+)$/m);title=h?h[1].trim():body.trim().split('\n')[0].slice(0,80)}
  if(!title&&!body.trim())return[];
  let tags=[];
  if(fm.tags){tags=fm.tags.replace(/^\[|\]$/g,'').split(/[,\s]+/).map(s=>s.replace(/^["'#]+|["']+$/g,''))}
  for(const t of body.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]{2,30})(?![\p{L}\p{N}_/-])/gu))tags.push(t[1]);
  const cd=fm.created||fm.date;let created=null;if(cd){const d=new Date(cd.replace(/^["']|["']$/g,''));if(!isNaN(d))created=d.toISOString()}
  return[{type:'note',title,body:body.trim(),url:'',tags:uniqTags(tags),due:null,done:false,created,project:null}]}

/* ---------- bringing parsed items into the app ---------- */
function absorb(list){
  const have=new Set(D.items.map(i=>(i.type+'|'+i.title+'|'+(i.body||'').slice(0,80)).toLowerCase()));
  let added=0,skipped=0,over=0;const ids=[];
  for(const p of list){
    const title=String(p.title||'').trim().slice(0,LIM.title);if(!title&&!p.url){skipped++;continue}
    const key=(p.type+'|'+title+'|'+String(p.body||'').slice(0,80)).toLowerCase();if(have.has(key)){skipped++;continue}
    if(D.items.length>=LIM.items){over++;continue}
    let project=null;
    if(p.project){let pr=D.projects.find(x=>x.name.toLowerCase()===p.project.toLowerCase());
      if(!pr&&D.projects.length<LIM.projects){pr={id:uid(),name:p.project.slice(0,60)};D.projects.push(pr)}
      if(pr)project=pr.id}
    const t=p.created||now();
    const it={id:uid(),type:p.type,title,body:String(p.body||'').slice(0,LIM.body),url:p.url||'',project,tags:p.tags||[],done:!!p.done,doneAt:p.done?t:null,due:p.due||null,promise:false,media:null,created:t,updated:t};
    D.items.push(it);have.add(key);ids.push(it.id);added++}
  return{added,skipped,over,ids}}

async function importFiles(files){
  const list=[];
  for(const f of files){
    if(f.size>20e6){continue}
    const n=f.name||'',txt=await f.text();
    if(/\.csv$/i.test(n))list.push(...todoist(txt,n));
    else if(/\.enex$/i.test(n)||/^\s*(<\?xml[^>]*>\s*)?(<!DOCTYPE[^>]*>\s*)?<en-export/i.test(txt))list.push(...enex(txt));
    else if(/\.json$/i.test(n))list.push(...keep(txt));
    else if(/\.(md|markdown|txt)$/i.test(n))list.push(...markdown(txt,n))}
  if(!list.length)return{added:0,skipped:0,over:0,ids:[],none:true};
  try{if(window.NXSafe)await window.NXSafe.snapAdd(JSON.stringify(D),'before import')}catch(e){}
  const r=absorb(list);save();return r}

function msg(r){
  if(r.none)return'Nothing importable found. Use Todoist .csv, Keep .json, Evernote .enex or .md files.';
  return'Imported '+r.added+(r.added===1?' item':' items')+(r.skipped?', skipped '+r.skipped+' already here':'')+(r.over?', '+r.over+' did not fit (limit 5,000)':'')+'.'}

/* ---------- Settings buttons ---------- */
async function exportMd(){
  const blob=zip(toFiles(D)),u=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=u;a.download='nexus-markdown-'+dk()+'.zip';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}
function addButtons(){
  const x=document.querySelector('#xp');if(!x||document.querySelector('#xmd'))return;
  const row=x.closest('.row2'),b=document.createElement('button');b.className='btn';b.id='xmd';b.textContent='Export as Markdown';
  b.onclick=()=>{try{exportMd();toast('Markdown export ready')}catch(e){toast('Export failed. Try again.')}};
  const i=document.createElement('button');i.className='btn';i.id='imp';i.textContent='Import from another app';
  const fi=document.createElement('input');fi.type='file';fi.id='impf';fi.multiple=true;fi.hidden=true;fi.accept='.csv,.json,.enex,.md,.markdown,.txt';
  i.onclick=()=>fi.click();
  fi.onchange=async()=>{const fs=[...fi.files];fi.value='';if(!fs.length)return;toast('Importing...');
    try{const r=await importFiles(fs);toast(msg(r));if(r.added&&typeof render==='function')render()}catch(e){toast('Import failed. Nothing was changed.')}};
  row.append(b,i,fi);
  const n=document.createElement('p');n.className='mu';n.id='impn';n.textContent='Import takes Todoist (.csv), Google Keep (.json from Takeout), Evernote (.enex), and Obsidian or Notion (.md) files. A restore point is saved first.';
  row.after(n)}

window.NXIO={toFiles,zip,csv,todoist,keep,enex,markdown,absorb,importFiles,exportMd};
/* settings() is rebuilt each time it opens, so add the buttons after each build */
const prev=window.settings||(typeof settings==='function'?settings:null);
if(prev&&typeof A!=='undefined'){
  const wrapped=function(){prev.apply(this,arguments);try{addButtons()}catch(e){}};
  try{settings=wrapped}catch(e){}A.settings=wrapped}
})();
