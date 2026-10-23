/* Finds the words that are still English when Nexus runs in Hindi or Telugu.
   Usage: node tests/crawl-i18n.mjs [hi|te] [--json]
   It opens every tab and every dialog it can reach, with some data of your own in the app, and lists
   each visible phrase (text, placeholder, aria-label, title) that has no entry in i18n-data.js.
   Phrases that contain "Zq" are the test data and are skipped: they stand for the user's own words. */
import {boot,newBrowser} from './harness.mjs';
process.on('unhandledRejection',()=>{});   /* a button clicked at a odd moment may reject; the crawl carries on */
const lang=process.argv[2]==='te'?'te':'hi',asJson=process.argv.includes('--json');
const br=newBrowser(),errors=[];
const p=await boot(br,{errors,pre:w=>{w.localStorage.setItem('nexus.hi'+w.location.pathname.replace(/[^\/]*$/,''),'1')}});
const W=p.w,ev=c=>{try{return p.ev(c)}catch(e){return undefined}};
const seen=new Map();
const SKIPTAG=new Set(['SCRIPT','STYLE','TEXTAREA','NOSCRIPT']);
const SCRIPT={hi:/[\u0900-\u097F]/,te:/[\u0C00-\u0C7F]/};
/* names and units that stay as they are in every language */
const KEEP=new Set('am pm takeout claude console com tomorrow nexus ai pin md kb mb gb api csv json enex markdown todoist evernote keep obsidian notion google gemini groq mistral openrouter cerebras anthropic claude english sk ant url ctrl esc enter ok id pdf html jpg m4a'.split(' '));
function grab(where){
  const d=W.document,add=(s)=>{s=String(s).replace(/\s+/g,' ').trim();
    if(!s||seen.has(s))return;
    const words=s.match(/[A-Za-z][A-Za-z'\u2019-]*/g)||[];
    if(!words.length||/Zq/i.test(s)||/^https?:|^[\w.+-]+@[\w.-]+$/.test(s))return;
    if(/new project NAME|task call Sam|^sk-ant|^[a-z0-9]+(?:[-\/.][a-z0-9]+)+$/.test(s))return;   /* a typed example, a key hint, a model id: not words to translate */
    if(words.every(x=>KEEP.has(x.toLowerCase())||x.length<2))return;
    if(!SCRIPT[lang].test(s)&&W.NXI18N.has(s))return;   /* plain English that has an entry: fine */
    seen.set(s,where)};
  const w=d.createTreeWalker(d.documentElement,1|4,{acceptNode:n=>n.nodeType===1&&(SKIPTAG.has(n.tagName)||n.getAttribute('data-nx-i18n')==='off')?2:1});
  let n;while((n=w.nextNode())){
    if(n.nodeType===3){const par=n.parentNode;if(par&&par.isContentEditable)continue;add(n.nodeValue)}
    else for(const a of ['placeholder','aria-label','title','alt'])if(n.hasAttribute(a))add(n.getAttribute(a))}}
const closeDlg=()=>{ev('dlg.open&&dlg.close()');ev('typeof stopF==="function"&&stopF()')};
const step=async(name,code)=>{closeDlg();await p.sleep(20);ev(code);await p.sleep(60);grab(name)};

/* some data of the user's own, so every list and card has something in it */
ev(`D.projects.push({id:'pZq',name:'Zq Project'});
addItem({type:'task',title:'Zq task',body:'',url:'',tags:['zq'],project:'pZq',due:dk(),promise:true});
addItem({type:'task',title:'Zq later',body:'',url:'',tags:[],project:null,due:addD(3),promise:false});
addItem({type:'task',title:'Zq old',body:'',url:'',tags:[],project:null,due:addD(-3),promise:false});
addItem({type:'note',title:'Zq note',body:'Zq body',url:'https://example.com',tags:['zq'],project:null,due:null,promise:false});
addItem({type:'idea',title:'Zq idea',body:'',url:'',tags:[],project:null,due:null,promise:false});
D.study.push({id:'sZq',name:'Zq Subject',cards:[{id:'cZq',q:'Zq?',a:'Zq!',box:0,due:'2000-01-01'}],chapters:[]});save()`);
W.NXI18N.set(lang);await p.sleep(100);
const first=ev('D.items.find(i=>i.type==="task").id');

for(const t of ['home','tasks','notes','study','browse'])await step('tab '+t,`A.tab('${t}')`);
await step('browse project','A.proj("pZq")');
await step('browse collection','A.tab("browse");A.col(Object.keys(C)[0])');
await step('timeline','A.tab("time")');
await step('study subject','A.tab("study");A.sub("sZq")');
await step('study review','A.tab("study");A.sub("sZq");A.rev("sZq")');
for(const f of ['settings','welcome','cmds','plan','recap','focus','nxcal','exam','smat','ssess','pdet','planview','newp','newsub','addc','mkcards','bulk','sfind','askai'])
  await step(f,`A.tab('home');A.${f}&&A.${f}(${f==='focus'?`'${first}'`:f==='addc'||f==='mkcards'||f==='exam'||f==='smat'||f==='ssess'||f==='pdet'?`'sZq'`:''})`);
await step('capture','A.cap()');
await step('edit task',`A.open('${first}')`);
await step('palette',`typeof nxPalette==='function'&&nxPalette()`);
await step('settings (twice, as the app does)','A.settings()');
await step('toast & prompts','say("Saved");');

/* click through every button of a few screens, like a curious person would. confirm/prompt are answered "no". */
W.confirm=()=>false;W.prompt=()=>null;W.alert=()=>{};
async function clickAll(name,open){
  closeDlg();ev(open);await p.sleep(80);
  const sel='#m button,#m [data-a],dlg button,dialog button,dialog [data-a]';
  const ids=[];
  const root=W.document;
  root.querySelectorAll('dialog[open] button,dialog[open] [data-a],#m button,#m [data-a]').forEach((b,i)=>{ids.push(i)});
  const n=ids.length;
  for(let i=0;i<n;i++){
    closeDlg();ev(open);await p.sleep(40);
    const bs=[...root.querySelectorAll('dialog[open] button,dialog[open] [data-a],#m button,#m [data-a]')];
    const b=bs[i];if(!b)continue;
    if(/Zq|Lock now|Turn off|Delete all|Erase/i.test(b.textContent||'')||b.dataset.l||b.dataset.v)continue;   /* the language chips would change the language under us */
    try{b.click()}catch(e){}
    await p.sleep(70);if(W.NXI18N.lang()!==lang)W.NXI18N.set(lang);grab(name+' > '+String(b.textContent||b.id||b.dataset.a).trim().slice(0,28));
    /* a dialog that opened from the click may hold more buttons: look one level down */
    const sub=[...root.querySelectorAll('dialog[open] button')].slice(0,40);
    for(const sb of sub){if(/Close|Cancel|Zq/i.test(sb.textContent||''))continue;
      if(sb===b)continue;
      if(sb.dataset.l||sb.dataset.v)continue;try{sb.click()}catch(e){}await p.sleep(40);if(W.NXI18N.lang()!==lang)W.NXI18N.set(lang);grab(name+' > '+String(b.textContent||b.id).trim().slice(0,20)+' > '+String(sb.textContent||sb.id).trim().slice(0,20))}
  }
}
for(const [nm,op] of [['settings','A.settings()'],['home','A.tab("home")'],['tasks','A.tab("tasks")'],['notes','A.tab("notes")'],['study','A.tab("study")'],['browse','A.tab("browse")'],['edit',`A.open('${first}')`]])await clickAll(nm,op);

closeDlg();grab('final');

const out=[...seen.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
if(asJson)console.log(JSON.stringify(out.map(([s,w])=>({s,w})),null,1));
else{console.log(`${out.length} phrases still in English in ${lang}:\n`);for(const [s,w] of out)console.log(`  [${w}] ${s}`)}
if(errors.length)(asJson?console.error:console.log)('\nScript errors:',errors);
p.close();
