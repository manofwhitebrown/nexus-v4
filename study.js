/* Nexus study: FSRS scheduling (replaces the old five-box system).
   FSRS models how fast you forget each card. Every card keeps a stability (days until recall
   drops to 90%) and a difficulty. Hard cards come back sooner, easy ones much later, and
   the gaps adapt to how you actually answer. This is FSRS-5 with its published default weights.
   Dates are whole days, like the rest of Nexus. Loaded after plan.js. */
(()=>{
const W=[0.40255,1.18385,3.173,15.69105,7.1949,0.5345,1.4604,0.0046,1.54575,0.1192,1.01925,1.9395,0.11,0.29605,2.2698,0.2315,2.9898,0.51655,0.6621];
const DECAY=-0.5,FACTOR=19/81,MAXI=3650,SB=[0,1,3,7,16];
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const retention=()=>{try{const v=+localStorage.getItem('nexus.ret');return v>=0.7&&v<=0.97?v:0.9}catch(e){return 0.9}};
const dayN=k=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(k||'');return m?Date.UTC(+m[1],m[2]-1,+m[3])/864e5:NaN};
const gap=(a,b)=>Math.max(0,Math.round(dayN(b)-dayN(a)));
const d0=g=>W[4]-Math.exp(W[5]*(g-1))+1;
const R=(t,s)=>Math.pow(1+FACTOR*t/s,DECAY);
const ivl=(s,r)=>clamp(Math.round(s/FACTOR*(Math.pow(r,1/DECAY)-1)),1,MAXI);
const nextD=(d,g)=>clamp(W[7]*d0(4)+(1-W[7])*(d+(-W[6]*(g-3))*(10-d)/9),1,10);
const stable=(s,d,r,g)=>g===1
  ?Math.min(s,W[11]*Math.pow(d,-W[12])*(Math.pow(s+1,W[13])-1)*Math.exp(W[14]*(1-r)))
  :s*(1+Math.exp(W[8])*(11-d)*Math.pow(s,-W[9])*(Math.exp(W[10]*(1-r))-1)*(g===2?W[15]:1)*(g===4?W[16]:1));
const boxOf=s=>s<1?0:s<3?1:s<7?2:s<16?3:4;

/* The card's memory state. Old cards (just a box and a due date) are converted the first time they are seen. */
function state(c){
  if(c.fs&&c.fs.s>0)return c.fs;
  if(!(c.box>0))return null;                     /* never learned: a new card */
  const s=SB[clamp(c.box|0,1,4)],due=/^\d{4}-\d{2}-\d{2}$/.test(c.due)?c.due:dk(),l=new Date(dayN(due)*864e5-s*864e5);
  return{s,d:5,l:l.getUTCFullYear()+'-'+String(l.getUTCMonth()+1).padStart(2,'0')+'-'+String(l.getUTCDate()).padStart(2,'0'),n:c.box,x:0}}

/* What would this card's state be after answering g (1 Again, 2 Hard, 3 Good, 4 Easy)? */
function answer(c,g,today=dk()){
  const p=state(c);let s,d,n=0,x=0;
  if(!p){s=Math.max(0.1,W[g-1]);d=clamp(d0(g),1,10)}
  else{const t=gap(p.l,today),r=R(t,p.s);d=nextD(p.d,g);n=p.n||0;x=p.x||0;
    if(t<1)s=p.s*Math.exp(W[17]*(g-3+W[18]));   /* same-day review */
    else s=stable(p.s,p.d,r,g);
    s=Math.max(0.1,s)}
  if(g===1)x++;n++;
  const days=g===1?0:ivl(s,retention());
  return{fs:{s:+s.toFixed(4),d:+d.toFixed(4),l:today,n,x,f:(p&&(p.f||p.l))||today},days,due:addDays(today,days)}}
const addDays=(k,n)=>{const t=new Date(dayN(k)*864e5+n*864e5);return t.getUTCFullYear()+'-'+String(t.getUTCMonth()+1).padStart(2,'0')+'-'+String(t.getUTCDate()).padStart(2,'0')};
const label=n=>n<1?'today':n<30?n+'d':n<365?Math.round(n/30.4)+'mo':(Math.round(n/36.5)/10)+'y';
function apply(c,g){const a=answer(c,g);c.fs=a.fs;c.due=a.due;c.box=boxOf(a.fs.s);return a}
const forecast=c=>[1,2,3,4].map(g=>label(answer(c,g).days));

/* A mastered card is one you will remember for at least a week */
mast=s=>s.cards.length?Math.round(100*s.cards.filter(c=>{const p=state(c);return p&&p.s>=7}).length/s.cards.length):0;

review=function(sid){
  const s=subj(sid);if(!s)return;
  const Q=dueC(s).sort(()=>Math.random()-.5),n=Q.length;let sh=0;
  const step=()=>{
    if(!Q.length){sheet(`<h2 style="margin:0">Done</h2><p>You reviewed ${n} ${n===1?'card':'cards'}. ${mast(s)}% of this subject is mastered.</p><div class="row2"><button class="btn p" id="rx">Close</button></div>`);$('#rx').onclick=()=>dlg.close();return}
    const c=Q[0],f=sh?forecast(c):[];
    sheet(`<small>${Q.length} left</small><p style="font-size:24px;font-weight:600;margin:12px 0">${E(c.q)}</p>${sh?`<p style="font-size:20px">${E(c.a)}</p><div class="row2"><button class="btn d" data-g="1">Again<br><small>${f[0]}</small></button><button class="btn" data-g="2">Hard<br><small>${f[1]}</small></button><button class="btn p" data-g="3">Good<br><small>${f[2]}</small></button><button class="btn" data-g="4">Easy<br><small>${f[3]}</small></button></div>`:'<div class="row2"><button class="btn p" id="sa">Show answer</button></div>'}<div class="row2"><button class="btn" id="rq">Stop</button></div>`);
    $('#rq').onclick=()=>dlg.close();
    if(sh)dlg.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{const g=+b.dataset.g;apply(c,g);save();Q.shift();if(g===1)Q.push(c);sh=0;step()});
    else $('#sa').onclick=()=>{sh=1;step()}};
  step()};

window.NXFSRS={answer,apply,state,forecast,retention,R,ivl,W,gap};
})();
