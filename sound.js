/* Nexus sound. Loaded after features.js.
   Soft, short tap sounds made on the device with the Web Audio API: no audio files, nothing to download,
   works offline. Each sound is a quiet pitched "drop" plus a tiny breath of air, a little room around it,
   and a slightly different note every time, so repeated taps feel like a gentle melody.

   Rules this file keeps (see ROADMAP.md, "Sound"):
   - One switch mutes everything: Settings > Sound, the speaker button next to the search bar, or the "m" key.
   - Sounds never play while you type, and never before your first tap or key press on the page.
   - Every sound goes with something you can already see change; sound is never the only signal.
   - Default volume is low. Three volumes and three styles. The choice is remembered on this device. */
(()=>{
const PK='nexus.pref'+NS;
const rd=()=>{try{return JSON.parse(localStorage.getItem(PK)||'{}')||{}}catch(e){return{}}};
const wr=o=>{try{localStorage.setItem(PK,JSON.stringify({...rd(),...o}))}catch(e){}};
const STYLES=['soft','wood','glass'],VOLS={low:.55,med:1,high:1.7};
const cfg=()=>{const p=rd();return{on:p.snd!==false,style:STYLES.includes(p.sndst)?p.sndst:'soft',vol:VOLS[p.sndv]?p.sndv:'med'}};

/* ---------- the audio engine (created on the first tap, never before) ---------- */
let ctx=null,bus=null,noise=null,lastAt=0,lastNote=-1,gesture=false,fail=false;
const ensure=()=>{
  if(fail)return null;
  if(ctx){if(ctx.state==='suspended'&&ctx.resume)try{ctx.resume()}catch(e){}return ctx}
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC){fail=true;return null}
  try{
    ctx=new AC();
    const comp=ctx.createDynamicsCompressor();comp.threshold.value=-20;comp.knee.value=24;comp.ratio.value=5;comp.attack.value=.003;comp.release.value=.14;
    const out=ctx.createGain();out.gain.value=.3;out.connect(comp);comp.connect(ctx.destination);
    bus=ctx.createGain();bus.connect(out);
    /* a very small room: a quarter second of fading noise, mixed in quietly */
    const n=Math.floor(ctx.sampleRate*.28),ir=ctx.createBuffer(2,n,ctx.sampleRate);
    for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,3)}
    const cv=ctx.createConvolver();cv.buffer=ir;const wet=ctx.createGain();wet.gain.value=.22;bus.connect(cv);cv.connect(wet);wet.connect(out);
    /* one second of white noise to cut small pieces from */
    const m=ctx.sampleRate,nb=ctx.createBuffer(1,m,ctx.sampleRate),nd=nb.getChannelData(0);for(let i=0;i<m;i++)nd[i]=Math.random()*2-1;noise=nb;
    if(ctx.state==='suspended'&&ctx.resume)ctx.resume();
    return ctx;
  }catch(e){fail=true;ctx=null;return null}
};

/* ---------- building blocks ---------- */
const lvl=()=>VOLS[cfg().vol];
const env=(g,t,a,d,peak)=>{g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,peak*lvl()),t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d)};
/* a pitched note; glide > 1 rises, < 1 falls */
const tone=(t,f,{type='sine',a=.004,d=.12,peak=.5,glide=1}={})=>{
  const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);
  if(glide!==1)o.frequency.exponentialRampToValueAtTime(Math.max(40,f*glide),t+a+d*.7);
  env(g,t,a,d,peak);o.connect(g);g.connect(bus);o.start(t);o.stop(t+a+d+.05)};
/* a breath of filtered noise: the tactile part of a tap. f2 makes it sweep. */
const puff=(t,{f=3000,q=1.1,a=.002,d=.03,peak=.2,f2=0,type='bandpass'}={})=>{
  const s=ctx.createBufferSource(),fl=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=noise;fl.type=type;fl.Q.value=q;fl.frequency.setValueAtTime(f,t);
  if(f2)fl.frequency.exponentialRampToValueAtTime(f2,t+a+d);
  env(g,t,a,d,peak);s.connect(fl);fl.connect(g);g.connect(bus);s.start(t,Math.random()*.7,a+d+.05)};
/* pick the next note of a scale, never the same one twice in a row, with a hair of detune */
const pick=sc=>{let i;do{i=Math.floor(Math.random()*sc.length)}while(i===lastNote&&sc.length>1);lastNote=i;return sc[i]*(1+(Math.random()-.5)*.012)};

/* ---------- three styles; each defines the same eight sounds ---------- */
const PENTA=[392,440,523.25,587.33,659.25];
const STYLE={
  /* Soft pop: round little water-drop notes. The default. */
  soft:{
    tap:t=>{const f=pick(PENTA);tone(t,f,{d:.1,peak:.5,glide:1.18});tone(t,f*2,{d:.05,peak:.07});puff(t,{f:3400,d:.015,peak:.07})},
    tick:t=>{const f=pick(PENTA)*2;tone(t,f,{a:.002,d:.045,peak:.22});puff(t,{f:4200,d:.01,peak:.05})},
    pop:t=>{const f=pick(PENTA)*.75;tone(t,f,{d:.14,peak:.62,glide:1.4});tone(t,f*2,{d:.08,peak:.12});puff(t,{f:2600,d:.025,peak:.1})},
    done:t=>{tone(t,523.25,{d:.34,peak:.42});tone(t,2093,{d:.07,peak:.05});tone(t+.085,783.99,{d:.42,peak:.42});tone(t+.085,3136,{d:.08,peak:.05});puff(t,{f:5000,d:.02,peak:.06})},
    undo:t=>{tone(t,246.94,{d:.17,peak:.38,glide:.82});puff(t,{f:900,d:.03,peak:.07})},
    open:t=>{puff(t,{f:420,f2:1700,q:.8,a:.05,d:.2,peak:.16})},
    close:t=>{puff(t,{f:1500,f2:420,q:.8,a:.03,d:.15,peak:.12})},
    on:t=>{tone(t,523.25,{d:.2,peak:.4});tone(t+.07,659.25,{d:.26,peak:.4})}
  },
  /* Wood tap: a dry knock, like a fingertip on a desk. */
  wood:{
    tap:t=>{const f=170+Math.random()*60;tone(t,f,{type:'triangle',d:.075,peak:.6,glide:.6});puff(t,{f:1500,q:3,d:.035,peak:.3})},
    tick:t=>{puff(t,{f:2300,q:4,a:.001,d:.022,peak:.3});tone(t,720,{type:'triangle',a:.001,d:.03,peak:.12})},
    pop:t=>{tone(t,150,{type:'triangle',d:.13,peak:.7,glide:.55});puff(t,{f:900,q:2,d:.05,peak:.35})},
    done:t=>{tone(t,260,{type:'triangle',d:.12,peak:.55,glide:.7});puff(t,{f:1500,q:3,d:.03,peak:.25});tone(t+.09,340,{type:'triangle',d:.16,peak:.55,glide:.7});puff(t+.09,{f:1900,q:3,d:.03,peak:.25})},
    undo:t=>{tone(t,125,{type:'triangle',d:.14,peak:.6,glide:.6});puff(t,{f:700,q:2,d:.04,peak:.2})},
    open:t=>{puff(t,{f:300,f2:1100,q:.8,a:.05,d:.18,peak:.13})},
    close:t=>{puff(t,{f:1000,f2:320,q:.8,a:.03,d:.13,peak:.1})},
    on:t=>{tone(t,200,{type:'triangle',d:.1,peak:.55,glide:.7});tone(t+.08,260,{type:'triangle',d:.12,peak:.55,glide:.7})}
  },
  /* Glass: a clear, high chime, like a fingertip on a wine glass. */
  glass:{
    tap:t=>{const f=pick(PENTA)*2;tone(t,f,{d:.24,peak:.26});tone(t,f*2.76,{d:.1,peak:.07});puff(t,{f:6500,d:.01,peak:.04,type:'highpass'})},
    tick:t=>{const f=pick(PENTA)*3;tone(t,f,{a:.002,d:.1,peak:.16})},
    pop:t=>{const f=pick(PENTA)*1.5;tone(t,f,{d:.32,peak:.34});tone(t,f*3.01,{d:.18,peak:.1})},
    done:t=>{[1046.5,1318.5,1568].forEach((f,i)=>{tone(t+i*.075,f,{d:.5,peak:.3});tone(t+i*.075,f*2.76,{d:.12,peak:.05})})},
    undo:t=>{tone(t,392,{d:.26,peak:.26,glide:.85})},
    open:t=>{puff(t,{f:900,f2:3000,q:1.2,a:.05,d:.2,peak:.1})},
    close:t=>{puff(t,{f:2800,f2:800,q:1.2,a:.03,d:.15,peak:.08})},
    on:t=>{tone(t,1046.5,{d:.3,peak:.3});tone(t+.08,1568,{d:.4,peak:.3})}
  }
};

/* ---------- play ---------- */
function play(kind){
  const c=cfg();if(!c.on)return false;
  if(!gesture)return false;
  if(document.hidden)return false;
  const now=performance.now();if(now-lastAt<45&&kind!=='done')return false;lastAt=now;
  if(!ensure())return false;
  try{(STYLE[c.style]||STYLE.soft)[kind](ctx.currentTime+.005);return true}catch(e){return false}
}

/* ---------- what a tap sounds like ---------- */
const kindOf=el=>{
  if(el.matches('.ck,[role=checkbox]'))return el.getAttribute('aria-checked')==='true'?'undo':'done';   /* state before the app flips it */
  if(el.closest('nav')||el.matches('.chip,[aria-pressed],summary,.mk'))return 'tick';
  if(el.matches('.btn.p,.btn.l,.fab'))return 'pop';
  if(el.matches('.btn.d'))return 'undo';
  return 'tap';
};
const TARGET='button,[role=checkbox],[role=button],summary,a[href],.card,[data-a]';
['pointerdown','keydown','touchstart'].forEach(ev=>addEventListener(ev,()=>{gesture=true},{capture:true,passive:true,once:false}));
document.addEventListener('click',e=>{
  if(!cfg().on)return;
  const el=e.target&&e.target.closest&&e.target.closest(TARGET);
  if(!el||el.disabled||el.getAttribute('aria-disabled')==='true'||el.closest('[data-nosound]'))return;
  gesture=true;play(kindOf(el));
},true);

/* sheets: a soft breath when one opens or closes (one sound per change, even if a sheet is swapped for another) */
{let tm=0;new MutationObserver(ms=>{
  if(!ms.some(m=>m.target.tagName==='DIALOG'))return;
  clearTimeout(tm);tm=setTimeout(()=>{play(document.querySelector('dialog[open]')?'open':'close')},70)
}).observe(document.documentElement,{attributes:true,attributeFilter:['open'],subtree:true})}

/* ---------- mute: header button, "m" key, Settings ---------- */
const ICON=off=>`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/>${off?'<path d="M16 9.5l5 5M21 9.5l-5 5"/>':'<path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/>'}</svg>`;
const paint=()=>{const b=document.getElementById('nx-snd');if(!b)return;const on=cfg().on;
  b.innerHTML=ICON(!on);b.setAttribute('aria-label',on?'Mute sounds':'Turn sounds on');b.title=on?'Mute sounds':'Turn sounds on';
  [...document.querySelectorAll('#sn1 [data-v]')].forEach(c=>c.setAttribute('aria-pressed',c.dataset.v===(on?'on':'off')))};
function setOn(on,quiet){
  wr({snd:!!on});paint();
  if(on&&!quiet){gesture=true;play('on')}   /* hear that it is back on */
  if(!quiet&&typeof toast==='function')toast(on?'Sounds on':'Sounds off (muted)')}
const toggle=()=>setOn(!cfg().on);
const mount=()=>{
  const hd=document.querySelector('header .hd');if(!hd||document.getElementById('nx-snd'))return;
  const b=document.createElement('button');b.id='nx-snd';b.type='button';b.className='nxs';b.setAttribute('data-nosound','');
  b.onclick=toggle;hd.appendChild(b);paint()};
mount();
document.addEventListener('keydown',e=>{
  if(e.key!=='m'||e.ctrlKey||e.metaKey||e.altKey)return;
  const t=e.target;if(t&&(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable))return;
  if(document.querySelector('dialog[open]'))return;
  e.preventDefault();toggle()});

/* ---------- Settings > Sound ---------- */
const oSet=settings;
settings=function(){
  oSet();
  const anchor=document.getElementById('ap3');if(!anchor||document.getElementById('sn1'))return;
  const c=cfg();
  const ch=(id,a,sel)=>`<div class="chips" id="${id}" data-nosound>${a.map(([k,l])=>`<button class="chip" data-v="${k}" aria-pressed="${sel===k}">${l}</button>`).join('')}</div>`;
  anchor.insertAdjacentHTML('afterend',
    `<h2>Sound</h2><p class="mu" style="margin:0 0 8px">Soft sounds when you tap. They never play while you type. Turn them off for quiet.</p>`+
    `<p class="mu" style="margin:0">Tap sounds</p>${ch('sn1',[['on','On'],['off','Off']],c.on?'on':'off')}`+
    `<p class="mu" style="margin:0">Style</p>${ch('sn2',[['soft','Soft pop'],['wood','Wood tap'],['glass','Glass']],c.style)}`+
    `<p class="mu" style="margin:0">Volume</p>${ch('sn3',[['low','Low'],['med','Medium'],['high','High']],c.vol)}`);
  const wire=(id,fn)=>{document.getElementById(id).onclick=e=>{const b=e.target.closest('[data-v]');if(!b)return;
    [...document.getElementById(id).children].forEach(x=>x.setAttribute('aria-pressed',x===b));fn(b.dataset.v)}};
  wire('sn1',v=>{setOn(v==='on',true);if(v==='on'){gesture=true;play('on')}});
  wire('sn2',v=>{wr({sndst:v});gesture=true;play('tap')});
  wire('sn3',v=>{wr({sndv:v});gesture=true;play('pop')});
};

window.NXSound={play,isOn:()=>cfg().on,set:setOn,toggle,config:cfg,styles:STYLES};
})();
