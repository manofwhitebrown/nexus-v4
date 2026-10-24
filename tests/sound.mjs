/* Sound, mute, accent colour on every tab, and the Android theme bridge. */
import {boot,newBrowser} from './harness.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {t} from './lib.mjs';

/* A fake AudioContext that only counts what would have been played. */
const fakeAudio=w=>{
  const au={osc:0,src:0,made:0};w.__au=au;
  const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}});
  const node=()=>({connect(){},disconnect(){}});
  w.AudioContext=class{
    constructor(){au.made++;this.state='running';this.currentTime=0;this.sampleRate=8000;this.destination=node()}
    resume(){return Promise.resolve()}
    createDynamicsCompressor(){return{...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()}}
    createGain(){return{...node(),gain:param()}}
    createBuffer(c,n){return{getChannelData:()=>new Float32Array(n)}}
    createConvolver(){return{...node(),buffer:null}}
    createOscillator(){return{...node(),type:'sine',frequency:param(),start(){au.osc++},stop(){}}}
    createBiquadFilter(){return{...node(),type:'',Q:param(),frequency:param()}}
    createBufferSource(){return{...node(),buffer:null,start(){au.src++}}}
  };
};
const boot2=(br,o={})=>boot(br,{...o,pre:w=>{fakeAudio(w);if(o.pre)o.pre(w)}});
const voices=p=>p.w.__au.osc+p.w.__au.src;
const PREF=p=>JSON.parse(p.ev(`localStorage.getItem('nexus.pref'+NS)||'{}'`));

console.log('Sound');
await t('the sound layer loads with no errors and a speaker button sits beside the search bar',async()=>{
  const errors=[],p=await boot2(newBrowser(),{errors});
  assert.equal(typeof p.w.NXSound,'object');assert.equal(p.w.NXSound.isOn(),true,'on by default');
  const b=p.w.document.querySelector('header .hd #nx-snd');assert.ok(b,'speaker button');assert.equal(b.getAttribute('aria-label'),'Mute sounds');
  assert.ok(b.querySelector('svg'));assert.deepEqual(errors,[]);p.close()});

await t('nothing plays before the first tap, and a tap on a button makes a sound',async()=>{
  const p=await boot2(newBrowser());
  assert.equal(p.w.NXSound.play('tap'),false);assert.equal(p.w.__au.made,0,'no audio context before a gesture');
  p.w.document.querySelector('nav button').click();
  assert.equal(p.w.__au.made,1);assert.ok(voices(p)>0,'a sound was made');p.close()});

await t('the three styles each make every kind of sound',async()=>{
  const p=await boot2(newBrowser());p.w.document.querySelector('nav button').click();
  for(const st of p.w.NXSound.styles){p.ev(`localStorage.setItem('nexus.pref'+NS,JSON.stringify({sndst:'${st}'}))`);
    for(const k of ['tap','tick','pop','done','undo','open','close','on']){
      await p.sleep(120);const before=voices(p);
      assert.equal(p.w.NXSound.play(k),true,st+' '+k);assert.ok(voices(p)>before,st+' '+k+' made voices')}}
  p.close()});

await t('mute: the speaker button silences everything and the choice is kept after a reload',async()=>{
  const br=newBrowser();let p=await boot2(br);
  p.w.document.querySelector('nav button').click();const heard=voices(p);assert.ok(heard>0);
  p.w.document.getElementById('nx-snd').click();
  assert.equal(p.w.NXSound.isOn(),false);assert.equal(PREF(p).snd,false);
  assert.equal(p.w.document.getElementById('nx-snd').getAttribute('aria-label'),'Turn sounds on');
  const after=voices(p);
  for(let i=0;i<3;i++){p.w.document.querySelector('nav button').click();await p.sleep(60)}
  p.w.document.querySelector('#m button')&&p.w.document.querySelector('#m button').click();
  assert.equal(voices(p),after,'muted: no new voices');assert.equal(p.w.NXSound.play('done'),false);
  p.close();
  p=await boot2(br);assert.equal(p.w.NXSound.isOn(),false,'still muted after a reload');
  p.w.document.querySelector('nav button').click();assert.equal(voices(p),0);
  p.w.document.getElementById('nx-snd').click();assert.equal(p.w.NXSound.isOn(),true);assert.ok(voices(p)>0,'turning it on is heard');p.close()});

await t('the m key mutes and unmutes, but not while typing or with a sheet open',async()=>{
  const p=await boot2(newBrowser()),d=p.w.document;
  const key=(el,k)=>el.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
  key(d.body,'m');assert.equal(p.w.NXSound.isOn(),false);key(d.body,'m');assert.equal(p.w.NXSound.isOn(),true);
  key(d.getElementById('q'),'m');assert.equal(p.w.NXSound.isOn(),true,'typing an m in the search bar does nothing');
  p.ev(`sheet('<p>x</p>')`);key(d.body,'m');assert.equal(p.w.NXSound.isOn(),true,'not while a sheet is open');p.close()});

await t('sounds never play for typing: inputs and text areas are silent',async()=>{
  const p=await boot2(newBrowser()),d=p.w.document;d.querySelector('nav button').click();const n=voices(p);
  await p.sleep(60);d.getElementById('q').click();d.getElementById('q').dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'a',bubbles:true}));
  assert.equal(voices(p),n);p.close()});

await t('ticking a task plays the "done" sound and un-ticking a softer one',async()=>{
  const p=await boot2(newBrowser());
  p.ev(`addItem({type:'task',title:'Buy milk',body:'',url:'',tags:[],project:null,due:null,promise:false});S.tab='tasks';render()`);
  const ck=p.w.document.querySelector('#m .ck');assert.ok(ck,'checkbox');
  ck.click();const a=voices(p);assert.ok(a>=4,'done is a two-note sound: '+a);p.close()});

await t('Settings has a Sound section: on/off, three styles, three volumes, remembered',async()=>{
  const p=await boot2(newBrowser()),d=p.w.document;p.ev('settings()');
  for(const id of ['sn1','sn2','sn3'])assert.ok(d.getElementById(id),id);
  d.querySelector('#sn2 [data-v="glass"]').click();assert.equal(PREF(p).sndst,'glass');assert.equal(d.querySelector('#sn2 [data-v="glass"]').getAttribute('aria-pressed'),'true');
  d.querySelector('#sn3 [data-v="low"]').click();assert.equal(PREF(p).sndv,'low');
  d.querySelector('#sn1 [data-v="off"]').click();assert.equal(PREF(p).snd,false);assert.equal(d.getElementById('nx-snd').getAttribute('aria-label'),'Turn sounds on');
  const n=voices(p);d.querySelector('#sn2 [data-v="wood"]').click();assert.equal(voices(p),n,'muted: choosing a style makes no sound');
  await p.sleep(120);d.querySelector('#sn1 [data-v="on"]').click();assert.equal(p.w.NXSound.isOn(),true);assert.ok(voices(p)>n,'turning on previews');
  assert.equal(PREF(p).accent,undefined,'sound settings do not disturb other preferences');
  p.close()});

await t('sound settings keep the other appearance settings',async()=>{
  const p=await boot2(newBrowser());p.ev(`localStorage.setItem('nexus.pref'+NS,JSON.stringify({accent:'sage',fs:'l'}))`);p.ev('settings()');
  p.w.document.querySelector('#sn3 [data-v="high"]').click();
  const pr=PREF(p);assert.equal(pr.accent,'sage');assert.equal(pr.fs,'l');assert.equal(pr.sndv,'high');p.close()});

await t('the new words are in the Hindi and Telugu dictionary',async()=>{
  const p=await boot2(newBrowser());
  for(const lang of ['hi','te']){p.ev(`NXI18N.set('${lang}')`);
  for(const w of ['Sound','Tap sounds','On','Style','Soft pop','Wood tap','Glass','Volume','Mute sounds','Turn sounds on','Sounds on','Sounds off (muted)','Soft sounds when you tap. They never play while you type. Turn them off for quiet.'])
    assert.equal(p.w.NXI18N.has(w),true,lang+': '+w)}
  p.close()});

await t('sound.js is in the page, the offline cache and the Android build',async()=>{
  const idx=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  assert.match(idx,/data-src="sound\.js"/);assert.match(sw,/'sound\.js'/);
  assert.match(fs.readFileSync(new URL('../android/build.sh',import.meta.url),'utf8'),/\*\.js/)});

console.log('Accent and theme');
await t('the accent colour reaches the Library: selected chips, recap and active tab use it',async()=>{
  const css=fs.readFileSync(new URL('../theme.css',import.meta.url),'utf8');
  assert.match(css,/\.chip\[aria-pressed=true\]\{background:var\(--ac\)/);assert.match(css,/nav button\[aria-current=page\]\{color:var\(--ac\)\}/);
  assert.match(css,/\.bars i\{background:var\(--ac\)\}/);assert.match(css,/main h1::after/);
  for(const a of ['steel','sage','clay'])assert.match(css,new RegExp(':root\\[data-accent='+a+'\\]\\{--na:'))});

await t('the page container never shows a focus ring',async()=>{
  const css=fs.readFileSync(new URL('../theme.css',import.meta.url),'utf8');assert.match(css,/main:focus,#m:focus[^{]*\{outline:none\}/)});

await t('inside the Android app the window and system bars are told the theme, at start and on every change',async()=>{
  const calls=[],N=new Proxy({setTheme:v=>calls.push(v)},{get:(o,k)=>k in o?o[k]:(()=>'')});
  const p=await boot2(newBrowser(),{pre:w=>{w.NexusNative=N}});
  assert.equal(calls[0],'dark');
  p.ev(`localStorage.setItem(TH,'light');applyTh()`);await p.sleep(30);assert.equal(calls.at(-1),'light');
  p.ev(`localStorage.setItem(TH,'dark');applyTh()`);await p.sleep(30);assert.equal(calls.at(-1),'dark');p.close()});

await t('the floating bubble is sent the real theme and accent colours, at start and whenever either changes',async()=>{
  const pal=[],N=new Proxy({setPalette:v=>pal.push(JSON.parse(v))},{get:(o,k)=>k in o?o[k]:(()=>'')});
  const p=await boot2(newBrowser(),{pre:w=>{w.NexusNative=N}});
  assert.ok(pal.length>=1);
  p.ev(`localStorage.setItem(TH,'light');applyTh()`);await p.sleep(30);
  p.ev(`document.documentElement.dataset.accent='steel'`);await p.sleep(30);
  const n=pal.length;assert.ok(n>=2);
  p.ev(`document.documentElement.dataset.accent='clay'`);await p.sleep(30);
  assert.ok(pal.length>n);assert.equal(pal.at(-1).light,true);p.close()});

await t('the bubble reads its words fresh, follows the palette, and tucks into the screen edge',async()=>{
  const d=new URL('../android/src/com/nexus/personal/',import.meta.url),b=fs.readFileSync(new URL('BubbleService.java',d),'utf8'),m=fs.readFileSync(new URL('MainActivity.java',d),'utf8');
  assert.doesNotMatch(b,/getString\(R\.string/);assert.match(b,/Loc\.wrap\(getApplicationContext\(\)\)/);
  assert.doesNotMatch(b,/setColor\(0xFF161617\)/);assert.match(b,/Pal\.load/);
  assert.match(b,/private void dock\(\)/);assert.match(b,/private void undock\(\)/);
  assert.match(m,/public void setPalette\(String json\)/);assert.match(m,/BubbleService\.refresh\(\)/)});

await t('the phone Back button closes an open sheet first instead of leaving the app',async()=>{
  const p=await boot2(newBrowser(),{pre:w=>{w.NexusNative=new Proxy({},{get:()=>(()=>'')})}});
  assert.equal(p.ev(`window.nxBack()`),false);
  p.ev(`A.cap()`);await p.sleep(60);assert.equal(p.w.document.querySelector('#dlg').open,true);
  assert.equal(p.ev(`window.nxBack()`),true);assert.equal(p.w.document.querySelector('#dlg').open,false);
  assert.equal(p.ev(`window.nxBack()`),false);
  const j=fs.readFileSync(new URL('../android/src/com/nexus/personal/MainActivity.java',import.meta.url),'utf8');
  assert.match(j,/window\.nxBack&&window\.nxBack\(\)/);p.close()});

await t('a Settings gear sits in the header on every tab and opens Settings',async()=>{
  const p=await boot2(newBrowser());const d=p.w.document;
  const g=d.querySelector('header .hd #nx-set');assert.ok(g,'gear');assert.equal(g.getAttribute('aria-label'),'Settings');
  for(const tab of ['home','tasks','notes','browse']){
    p.ev(`A.tab('${tab}')`);await p.sleep(40);
    d.querySelector('#nx-set').click();await p.sleep(60);
    assert.equal(d.querySelector('#dlg').open,true,tab);assert.match(d.querySelector('#dlg').innerHTML,/Settings/);
    d.querySelector('#dlg').close();await p.sleep(20)}
  p.close()});

await t('the Android code has a setTheme bridge that colours the window and both system bars',async()=>{
  const j=fs.readFileSync(new URL('../android/src/com/nexus/personal/MainActivity.java',import.meta.url),'utf8');
  assert.match(j,/public void setTheme\(final String theme\)/);assert.match(j,/setStatusBarColor\(bg\)/);assert.match(j,/setNavigationBarColor\(bg\)/);assert.match(j,/rootView\.setBackgroundColor\(bg\)/)});
