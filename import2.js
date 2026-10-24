/* Nexus 4.1 import layer. Loaded after portability.js.
   Adds: .zip files (Notion, Obsidian, Google Takeout, Evernote exports; nested zips too), and attachments
   from Evernote (.enex resources), Google Keep (.json + the picture files next to it) and Markdown notes
   (![[pic.png]] and ![](pic.png)). Each attachment is stored like any other file (8 MB limit). */
(()=>{
const IO=window.NXIO;if(!IO)return;
const dec=new TextDecoder(),BASE=n=>String(n).split(/[\\/]/).pop(),LC=s=>String(s).toLowerCase();
const MIME={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',heic:'image/heic',pdf:'application/pdf',m4a:'audio/mp4',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',amr:'audio/amr','3gp':'audio/3gpp',txt:'text/plain',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
const mimeOf=(n,m)=>m&&m!=='application/octet-stream'?m:(MIME[LC(BASE(n).split('.').pop())]||'application/octet-stream');
const kindOf=a=>/^image\//.test(a.mime)?'photo':/^audio\//.test(a.mime)?'voice':'file';
const isText=n=>/\.(csv|json|enex|md|markdown|txt)$/i.test(n),isZip=n=>/\.zip$/i.test(n);
const skipPath=p=>/(^|\/)(__MACOSX|\.obsidian|\.trash)(\/|$)|(^|\/)\.DS_Store$/.test(p);

/* ---- zip reader (stored and deflated files) ---- */
async function inflate(u8){
  const DS=window.DecompressionStream||globalThis.DecompressionStream;if(!DS)throw new Error('nozip');
  const ds=new DS('deflate-raw'),w=ds.writable.getWriter(),r=ds.readable.getReader(),ch=[];let n=0;
  w.write(u8).catch(()=>{});w.close().catch(()=>{});
  for(;;){const {done,value}=await r.read();if(done)break;ch.push(value);n+=value.length;if(n>40e6)throw new Error('big')}
  const o=new Uint8Array(n);let p=0;for(const c of ch){o.set(c,p);p+=c.length}return o}
async function unzip(buf){
  const dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength);let e=buf.length-22;
  while(e>=0&&e>buf.length-65600&&dv.getUint32(e,true)!==0x06054b50)e--;
  if(e<0||dv.getUint32(e,true)!==0x06054b50)throw new Error('badzip');
  const n=dv.getUint16(e+10,true);let o=dv.getUint32(e+16,true),total=0;const out=[];
  for(let i=0;i<Math.min(n,5000);i++){
    if(dv.getUint32(o,true)!==0x02014b50)break;
    const meth=dv.getUint16(o+10,true),csz=dv.getUint32(o+20,true),usz=dv.getUint32(o+24,true),nl=dv.getUint16(o+28,true),xl=dv.getUint16(o+30,true),cl=dv.getUint16(o+32,true),lo=dv.getUint32(o+42,true),
      name=dec.decode(buf.subarray(o+46,o+46+nl)).replace(/\\/g,'/');o+=46+nl+xl+cl;
    if(name.endsWith('/')||skipPath(name))continue;
    total+=usz;if(total>300e6||usz>40e6)continue;
    const ds=lo+30+dv.getUint16(lo+26,true)+dv.getUint16(lo+28,true),raw=buf.subarray(ds,ds+csz);
    out.push({path:name,size:usz,bytes:async()=>meth===0?raw.slice():meth===8?inflate(raw):null})}
  return out}

/* ---- turning the picked files into one flat list ---- */
async function readBuf(f){if(f.arrayBuffer)return new Uint8Array(await f.arrayBuffer());
  return new Uint8Array(await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsArrayBuffer(f)}))}
async function expand(files,depth){
  const out=[];
  for(const f of files){const n=f.name||'';
    if(isZip(n)||/zip/.test(f.type||'')){
      if(depth>1||f.size>300e6)continue;
      try{const inner=await unzip(await readBuf(f)),
        sub=inner.filter(x=>isZip(x.path)),rest=inner.filter(x=>!isZip(x.path));out.push(...rest);
        for(const s of sub){const b=await s.bytes();if(b)out.push(...await expand([{name:s.path,size:b.length,type:'application/zip',arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length)}],depth+1))}}
      catch(e){out.zipError=e&&e.message==='nozip'?'nozip':'badzip'}
      continue}
    if(f.size>40e6)continue;
    out.push({path:n,size:f.size,bytes:async()=>f.text&&!f.arrayBuffer&&!f.size?new TextEncoder().encode(await f.text()):readBuf(f),text:f.text?()=>f.text():null})}
  return out}
const textOf=async e=>e.text?e.text():dec.decode(await e.bytes());

/* ---- finding the files a note points to ---- */
function lookup(assets){
  const byPath=new Map(),byBase=new Map();
  for(const a of assets){byPath.set(LC(a.path),a);const b=LC(BASE(a.path));if(!byBase.has(b))byBase.set(b,a)}
  return(ref,dir)=>{let r=ref;try{r=decodeURIComponent(ref)}catch(e){}
    r=r.replace(/^<|>$/g,'').replace(/[?#].*$/,'').replace(/\\/g,'/');if(!r||/^[a-z][a-z0-9+.-]*:/i.test(r))return null;
    const parts=(r.startsWith('/')?r.slice(1):dir?dir+'/'+r:r).split('/'),st=[];
    for(const p of parts){if(p==='..')st.pop();else if(p&&p!=='.')st.push(p)}
    return byPath.get(LC(st.join('/')))||byBase.get(LC(BASE(r)))||null}}
const refsOf=md=>{const s=new Set();
  for(const m of md.matchAll(/!\[\[([^\]|#]+)/g))s.add(m[1].trim());
  for(const m of md.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g))s.add(m[1]);return[...s]};
async function toAtt(entry,name,mime){const bytes=await entry.bytes();return bytes?{name:BASE(name||entry.path),mime:mimeOf(name||entry.path,mime),bytes}:null}

/* ---- Evernote: note by note, with its resources ---- */
async function enexRes(text){
  const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))return[];
  const ser=new XMLSerializer(),out=[];
  for(const n of doc.querySelectorAll('note')){
    const att=[];let k=0;
    for(const r of n.querySelectorAll(':scope > resource')){
      const d=(r.querySelector('data')||{}).textContent||'';if(!d||d.length>11.2e6)continue;k++;
      let bytes;try{const s=atob(d.replace(/\s+/g,''));bytes=new Uint8Array(s.length);for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i)}catch(e){continue}
      const mime=((r.querySelector('mime')||{}).textContent||'').trim(),fn=((r.querySelector('resource-attributes > file-name')||{}).textContent||'').trim()||('attachment-'+k+'.'+((mime.split('/')[1]||'bin').replace(/[^a-z0-9]/gi,'')));
      att.push({name:BASE(fn),mime:mimeOf(fn,mime),bytes})}
    const c=n.cloneNode(true);c.querySelectorAll(':scope > resource').forEach(r=>r.remove());
    const got=IO.enex('<en-export>'+ser.serializeToString(c)+'</en-export>');
    if(got[0]){got[0]._att=att;out.push(got[0])}}
  return out}

/* ---- the whole import ---- */
async function parse(files){
  const all=await expand(files,0),texts=all.filter(e=>isText(e.path)&&!skipPath(e.path)),assets=all.filter(e=>!isText(e.path)),find=lookup(assets),list=[];
  for(const e of texts){const n=BASE(e.path),dir=e.path.includes('/')?e.path.slice(0,e.path.lastIndexOf('/')):'';let txt;
    try{txt=await textOf(e)}catch(x){continue}
    if(/\.csv$/i.test(n))list.push(...IO.todoist(txt,n));
    else if(/\.enex$/i.test(n)||/^\s*(<\?xml[^>]*>\s*)?(<!DOCTYPE[^>]*>\s*)?<en-export/i.test(txt))list.push(...await enexRes(txt));
    else if(/\.json$/i.test(n)){const got=IO.keep(txt);let j=null;try{j=JSON.parse(txt)}catch(x){}
      const at=[];if(j&&Array.isArray(j.attachments))for(const a of j.attachments){const f=a&&a.filePath&&find(a.filePath,dir);if(f){const x=await toAtt(f,a.filePath,a.mimetype);if(x)at.push(x)}}
      if(at.length){if(got[0]&&got[0].type==='note')got[0]._att=at;else got.push({type:'note',title:String((j&&j.title)||'Keep attachment').slice(0,80),body:'',url:'',tags:got[0]?got[0].tags:[],due:null,done:false,created:got[0]?got[0].created:null,project:null,_att:at})}
      list.push(...got)}
    else{const got=IO.markdown(txt,n);if(got[0]){const at=[];
      for(const r of refsOf(txt)){if(at.length>=10)break;const f=find(r,dir);if(f&&!at.some(a=>a.name===BASE(f.path))){const x=await toAtt(f);if(x)at.push(x)}}
      got[0]._att=at}list.push(...got)}}
  return{list,zipError:all.zipError}}

async function importAll(files){
  const {list,zipError}=await parse(files);
  if(!list.length)return{added:0,skipped:0,over:0,ids:[],files:0,big:0,none:true,zipError};
  try{if(window.NXSafe)await window.NXSafe.snapAdd(JSON.stringify(D),'before import')}catch(e){}
  const tot={added:0,skipped:0,over:0,ids:[],files:0,big:0,zipError},pdfs=[];
  const put=async(id,a)=>{const it=D.items.find(x=>x.id===id);if(!it)return false;
    if(a.bytes.length>8e6){tot.big++;return false}
    try{const mid=uid();await bput(mid,new Blob([a.bytes],{type:a.mime}));it.media={id:mid,kind:kindOf(a),name:a.name.slice(0,80),mime:a.mime};tot.files++;
      if(/pdf/i.test(a.mime+a.name))pdfs.push(id);return true}catch(e){return false}};
  for(const p of list){const att=p._att||[];delete p._att;
    const r=IO.absorb([p]);tot.added+=r.added;tot.skipped+=r.skipped;tot.over+=r.over;tot.ids.push(...r.ids);
    const id=r.ids[0];if(!id)continue;
    let first=true;
    for(const a of att){
      if(first){if(await put(id,a))first=false;continue}
      const x=IO.absorb([{type:'note',title:(String(p.title||'').slice(0,60)+' - '+a.name).slice(0,100),body:'',tags:p.tags||[],project:null,created:p.created}]);
      tot.added+=x.added;tot.ids.push(...x.ids);if(x.ids[0])await put(x.ids[0],a)}}
  save();
  setTimeout(()=>{if(window.NXV41)pdfs.forEach(i=>window.NXV41.pdfIndex(i,{quiet:true}).catch(()=>{}))},100);
  return tot}

const msg=r=>r.none?(r.zipError==='nozip'?'This browser cannot open zip files. Unzip first and pick the files.':r.zipError?'That zip file could not be read.':'Nothing importable found. Use Todoist .csv, Keep .json, Evernote .enex, .md files or a .zip of them.')
  :'Imported '+r.added+(r.added===1?' item':' items')+(r.files?', '+r.files+(r.files===1?' attachment':' attachments'):'')+(r.skipped?', skipped '+r.skipped+' already here':'')+(r.big?', '+r.big+' attachments over 8 MB left out':'')+(r.over?', '+r.over+' did not fit (limit 5,000)':'')+'.';
IO.importFiles=importAll;IO.unzip=unzip;IO.importMsg=msg;

function hook(){const fi=document.querySelector('#impf');if(!fi||fi.dataset.nx2)return;fi.dataset.nx2='1';
  fi.accept='.csv,.json,.enex,.md,.markdown,.txt,.zip,.pdf,image/*,audio/*';
  fi.onchange=async()=>{const fs=[...fi.files];fi.value='';if(!fs.length)return;toast('Importing...');
    try{const r=await importAll(fs);toast(msg(r));if(r.added&&typeof render==='function')render()}catch(e){toast('Import failed. Nothing was changed.')}};
  const n=document.querySelector('#impn');if(n)n.textContent='Import takes Todoist (.csv), Google Keep (.json), Evernote (.enex), and Obsidian or Notion (.md files or the whole .zip). Pictures and files in the notes come along (8 MB each). A restore point is saved first.'}
new MutationObserver(hook).observe(document.body||document.documentElement,{childList:true,subtree:true});hook();
})();
