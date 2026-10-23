/* Phase 5 tests: the language layer, the date fixes, the first-run tour, accessibility, and the Android string files. */
import {boot,newBrowser,ROOT} from './harness.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {t} from './lib.mjs';

const DEVA=/[\u0900-\u097F]/,TELU=/[\u0C00-\u0C7F]/;
const NS='/';

console.log('Language layer');
await t('the dictionary has no Telugu in Hindi lines, no Hindi in Telugu lines, and keeps $ placeholders',async()=>{
  const rows=[];
  const X={add:(e)=>rows.push(...(e||[]))};new Function('window','NXI18N',fs.readFileSync(path.join(ROOT,'i18n-data.js'),'utf8'))({NXI18N:X},X);
  assert.ok(rows.length>400,'only '+rows.length+' rows');
  const bad=[];
  for(const [en,hi,te] of rows){
    if(hi&&TELU.test(hi))bad.push('hi has Telugu: '+en);
    if(te&&DEVA.test(te))bad.push('te has Devanagari: '+en);
    const ph=s=>(String(s).match(/\$\d/g)||[]).sort().join();
    if(hi&&ph(en)!==ph(hi))bad.push('hi placeholders: '+en);
    if(te&&ph(en)!==ph(te))bad.push('te placeholders: '+en);
  }
  assert.deepEqual(bad.slice(0,5),[],bad.length+' problems')});

await t('Hindi and Telugu translate the app\'s words but never the user\'s own',async()=>{
  const br=newBrowser(),p=await boot(br,{pre:w=>w.localStorage.setItem('nexus.hi'+NS,'1')});
  p.w.NXI18N.set('hi');assert.equal(p.w.NXI18N.has('Settings'),true,'precondition: Settings has an entry');p.w.NXI18N.set('en');
  p.ev(`addItem({type:'task',title:'Settings',body:'',url:'',tags:[],project:null,due:null,promise:false});addItem({type:'note',title:'Home',body:'Done',url:'',tags:['Study'],project:null,due:null,promise:false})`);
  for(const [lang,re] of [['hi',DEVA],['te',TELU]]){
    p.w.NXI18N.set(lang);await p.sleep(80);
    assert.equal(p.w.document.documentElement.lang,lang);
    p.ev(`A.tab('tasks')`);await p.sleep(60);
    const txt=p.w.document.body.textContent;
    assert.ok(re.test(txt),lang+': nothing was translated');
    assert.ok([...p.w.document.querySelectorAll('#m *')].some(e=>e.children.length===0&&e.textContent.trim()==='Settings'),lang+': the user\'s task title "Settings" was translated');
    p.ev(`A.tab('notes')`);await p.sleep(60);
    assert.ok([...p.w.document.querySelectorAll('#m *')].some(e=>e.children.length===0&&e.textContent.trim()==='Home'),lang+': the user\'s note title "Home" was translated');
  }
  p.close()});

await t('the chosen language is remembered after a reload and no wrong script leaks in',async()=>{
  const br=newBrowser(),p=await boot(br,{pre:w=>w.localStorage.setItem('nexus.hi'+NS,'1')});
  p.w.NXI18N.set('te');await p.sleep(50);p.close();
  const q=await boot(br);assert.equal(q.w.NXI18N.pref(),'te');assert.equal(q.w.NXI18N.lang(),'te');await q.sleep(100);
  const txt=q.w.document.body.textContent;assert.ok(TELU.test(txt));assert.ok(!DEVA.test(txt),'Hindi characters showed up in Telugu mode');q.close()});

await t('the Android app is told which language was picked (auto included)',async()=>{
  const calls=[],br=newBrowser();
  const stub=new Proxy({setLang:v=>{calls.push(v)}},{get:(o,k)=>k in o?o[k]:(()=>'')});
  const p=await boot(br,{pre:w=>{w.localStorage.setItem('nexus.hi'+NS,'1');w.NexusNative=stub}});
  assert.ok(calls.length>=1&&calls[0]==='auto','not told at start: '+calls);
  p.w.NXI18N.set('hi');p.w.NXI18N.set('en');p.w.NXI18N.set('auto');
  assert.deepEqual(calls.slice(-3),['hi','en','auto']);p.close()});

console.log('Dates');
await t('monthly repeat and "in N months" never skip a month, and clamp to the month\'s last day',async()=>{
  const br=newBrowser(),p=await boot(br);
  const am=(y,m,d,n)=>p.ev(`dk(addMo(new Date(${y},${m},${d},12),${n}))`);
  assert.equal(am(2026,0,31,1),'2026-02-28');assert.equal(am(2026,0,30,1),'2026-02-28');
  assert.equal(am(2026,2,31,1),'2026-04-30');assert.equal(am(2026,0,31,2),'2026-03-31');
  assert.equal(am(2026,11,15,1),'2027-01-15');assert.equal(am(2028,0,31,1),'2028-02-29');
  /* walking a monthly task forward twelve times must land exactly twelve months on, never two in one step */
  let d=new Date(2026,0,31,12),months=0;for(let i=0;i<12;i++){const n=new Date(p.ev(`dk(addMo(new Date(${d.getFullYear()},${d.getMonth()},${d.getDate()},12),1))`)+'T12:00');months+=(n.getFullYear()-d.getFullYear())*12+n.getMonth()-d.getMonth();d=n}
  assert.equal(months,12);p.close()});

await t('Hindi and Telugu weekdays, "every" and "next week" are understood',async()=>{
  const br=newBrowser(),p=await boot(br);const W=s=>JSON.parse(p.ev(`JSON.stringify(nxWhen(${JSON.stringify(s)}))`));
  const wd=d=>new Date(d+'T12:00').getDay(),days=d=>Math.round((new Date(d+'T12:00')-new Date(p.ev('dk()')+'T12:00'))/864e5);
  assert.equal(wd(W('मीटिंग सोमवार').due),1);assert.equal(wd(W('పని శుక్రవారం').due),5);
  assert.equal(wd(W('जिम हर सोमवार').due),1);assert.equal(W('जिम हर सोमवार').rep,'weekly');
  assert.equal(wd(W('వ్యాయామం ప్రతి శనివారం').due),6);assert.equal(W('వ్యాయామం ప్రతి శనివారం').rep,'weekly');
  assert.equal(days(W('योजना अगले हफ्ते').due),7);assert.equal(days(W('ప్లాన్ వచ్చే వారం').due),7);
  assert.equal(days(W('बिल 3 दिन में').due),3);assert.equal(days(W('బిల్లు 3 రోజుల్లో').due),3);
  assert.equal(W('हर दिन पानी').rep,'daily');assert.equal(W('ప్రతి రోజు నీళ్ళు').rep,'daily');
  p.close()});

await t('a weekday inside a longer word is not a date',async()=>{
  const br=newBrowser(),p=await boot(br);const W=s=>JSON.parse(p.ev(`JSON.stringify(nxWhen(${JSON.stringify(s)}))`));
  assert.equal(W('call somvarta now').due,undefined);assert.equal(W('buy sundaylike things').due,undefined);
  assert.equal(W('सोमवारी बैठक').due,undefined);assert.equal(W('రేపటి పని').due,undefined);p.close()});

console.log('First-run tour');
const tourOpen=p=>/Step \d of \d/.test(p.w.document.getElementById('dlg')?.textContent||p.ev('dlg.textContent'));
await t('the tour opens for a new person with four steps, and counts as seen however it is closed',async()=>{
  const br=newBrowser(),p=await boot(br);await p.sleep(900);
  assert.ok(tourOpen(p),'the tour did not open');
  const steps=new Set();for(let i=0;i<8;i++){const m=/Step (\d) of (\d)/.exec(p.ev('dlg.textContent'));if(!m)break;steps.add(m[2]);const nx=[...p.w.document.querySelectorAll('#dlg button')].find(b=>/^(Next|Continue)/i.test(b.textContent.trim()));if(!nx)break;nx.click();await p.sleep(30)}
  assert.deepEqual([...steps],['4']);
  p.ev('dlg.close()');await p.sleep(60);assert.ok(p.w.localStorage.getItem('nexus.hi'+NS));p.close();
  const q=await boot(br);await q.sleep(900);assert.ok(!tourOpen(q),'the tour came back after being seen');q.close()});
await t('the tour does not open for someone who already has data',async()=>{
  const br=newBrowser(),p=await boot(br);p.ev(`addItem({type:'task',title:'x',body:'',url:'',tags:[],project:null,due:null,promise:false})`);await p.flush();p.close();
  const q=await boot(br);await q.sleep(900);assert.ok(!tourOpen(q));q.close()});
await t('the tour never opens on top of another dialog, and waits until it closes',async()=>{
  const br=newBrowser(),p=await boot(br);p.ev('A.settings()');await p.sleep(900);
  assert.ok(!tourOpen(p),'the tour opened over Settings');assert.ok(/Settings/.test(p.ev('dlg.textContent')));
  p.ev('dlg.close()');await p.sleep(700);assert.ok(tourOpen(p),'the tour never came after Settings closed');p.close()});

console.log('Accessibility');
await t('every dialog is named, chip groups are labelled, and there is a skip link',async()=>{
  const br=newBrowser(),errors=[],p=await boot(br,{errors,pre:w=>w.localStorage.setItem('nexus.hi'+NS,'1')});const d=p.w.document;
  assert.ok(d.querySelector('#nx-skip'),'no skip link');assert.equal(d.querySelector('#nx-skip').getAttribute('href'),'#m');
  let checked=0;
  for(const f of ['settings','welcome','cmds','plan','recap','newp','newsub','sfind']){
    try{p.ev(`dlg.open&&dlg.close();A.${f}&&A.${f}()`)}catch(e){continue}await p.sleep(60);
    const dg=d.getElementById('dlg');if(!dg||!dg.hasAttribute('open'))continue;checked++;
    const lb=dg.getAttribute('aria-labelledby'),al=dg.getAttribute('aria-label');
    assert.ok((lb&&d.getElementById(lb)&&d.getElementById(lb).textContent.trim())||(al&&al.trim()),f+': dialog has no name');
    for(const c of dg.querySelectorAll('.chips'))assert.ok(c.getAttribute('role')==='group',f+': a chip group has no role');
    for(const b of dg.querySelectorAll('button'))assert.ok(b.textContent.trim()||b.getAttribute('aria-label')||b.title,f+': an unnamed button');
  }
  assert.ok(checked>=3,'only '+checked+' dialogs could be opened');assert.deepEqual(errors,[]);p.close()});
await t('the language chips in Settings say which one is on',async()=>{
  const br=newBrowser(),p=await boot(br,{pre:w=>w.localStorage.setItem('nexus.hi'+NS,'1')});p.ev('A.settings()');await p.sleep(60);
  const chips=[...p.w.document.querySelectorAll('#nx-lg button')];assert.ok(chips.length>=3);
  assert.equal(chips.filter(c=>c.getAttribute('aria-pressed')==='true').length,1);
  chips.find(c=>c.dataset.v==='hi').click();await p.sleep(40);
  assert.equal([...p.w.document.querySelectorAll('#nx-lg button')].find(c=>c.getAttribute('aria-pressed')==='true').dataset.v,'hi');p.close()});

console.log('Android resources');
await t('values, values-hi and values-te have identical keys, valid XML, matching placeholders and the right script',async()=>{
  const rd=d=>fs.readFileSync(path.join(ROOT,'android/res',d,'strings.xml'),'utf8');
  const parse=x=>{const m=new Map(),re=/<string name="([a-z0-9_]+)">([\s\S]*?)<\/string>/g;let r;while((r=re.exec(x)))m.set(r[1],r[2]);return m};
  const en=parse(rd('values')),hi=parse(rd('values-hi')),te=parse(rd('values-te'));
  for(const x of [rd('values'),rd('values-hi'),rd('values-te')]){assert.ok(/^<\?xml[^>]*\?>\s*<resources>[\s\S]*<\/resources>\s*$/.test(x));assert.equal((x.match(/<string /g)||[]).length,(x.match(/<\/string>/g)||[]).length)}
  assert.deepEqual([...hi.keys()].sort(),[...en.keys()].sort());assert.deepEqual([...te.keys()].sort(),[...en.keys()].sort());
  const ph=s=>(s.match(/%\d\$[sd]/g)||[]).sort().join();
  for(const [k,v] of en){assert.equal(ph(hi.get(k)),ph(v),'hi placeholder in '+k);assert.equal(ph(te.get(k)),ph(v),'te placeholder in '+k);
    assert.ok(!TELU.test(hi.get(k)),'Telugu in hi '+k);assert.ok(!DEVA.test(te.get(k)),'Devanagari in te '+k);
    for(const x of [v,hi.get(k),te.get(k)])assert.ok(!/(^|[^\\])'/.test(x),'unescaped apostrophe in '+k)}
  assert.ok(en.size>=50)});
await t('every R.string and @string reference in the Android code points at a real string',async()=>{
  const en=new Set([...fs.readFileSync(path.join(ROOT,'android/res/values/strings.xml'),'utf8').matchAll(/name="([a-z0-9_]+)"/g)].map(m=>m[1]));
  const files=[];const walk=d=>{for(const f of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,f.name);f.isDirectory()?walk(p):files.push(p)}};walk(path.join(ROOT,'android/src'));walk(path.join(ROOT,'android/res'));files.push(path.join(ROOT,'android/AndroidManifest.xml'));
  const miss=[];for(const f of files.filter(f=>/\.(java|xml)$/.test(f))){const s=fs.readFileSync(f,'utf8');
    for(const m of s.matchAll(/R\.string\.([a-z0-9_]+)|@string\/([a-z0-9_]+)/g)){const k=m[1]||m[2];if(!en.has(k))miss.push(path.basename(f)+': '+k)}}
  assert.deepEqual(miss,[])});
await t('no user-facing English is left hard-coded in the Java files',async()=>{
  const dir=path.join(ROOT,'android/src/com/nexus/personal'),bad=[];
  const UI=/(setText|setHint|setContentTitle|setContentText|setContentDescription|addAction|toast|say|button|Toast\.makeText)\(([^;]*)/g;
  for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.java'))){
    const s=fs.readFileSync(path.join(dir,f),'utf8');
    for(const m of s.matchAll(UI)){let args=m[2];
      if(m[1]==='button')args=args.split(',')[0];   /* button(label, kind, flag): only the label is shown */
      args=args.replace(/R\.string\.\w+/g,'').replace(/"Nexus"/g,'').replace(/"[#:\\u0-9A-Fa-f]*"/g,'');
      if(/"[^"]*[A-Za-z]{3,}[^"]*"/.test(args))bad.push(f+': '+m[0].slice(0,70))}}
  assert.deepEqual(bad,[])});
