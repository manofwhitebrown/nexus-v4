/* Nexus smarter dates. Loaded after features.js.
   Tasks now understand: "friday", "next monday", "in 3 days", "in 2 weeks", "next week",
   "every monday", "every day", "weekly", "monthly", plus a few Hindi and Telugu words
   (aaj/आज/ఈ రోజు = today, repu/రేపు = tomorrow, parso/परसों/ఎల్లుండి = day after tomorrow), Hindi and Telugu weekday
   names (सोमवार, సోమవారం), "हर सोमवार / ప్రతి సోమవారం" (every Monday), "अगले हफ्ते / వచ్చే వారం" (next week) and
   "3 दिन में / 3 రోజుల్లో" (in 3 days).
   Dates are whole days (the app stores a date, not a time). "in 2 hours" means today. */
(()=>{
const WD={sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6,
  'रविवार':0,'सोमवार':1,'मंगलवार':2,'बुधवार':3,'गुरुवार':4,'बृहस्पतिवार':4,'शुक्रवार':5,'शनिवार':6,
  'ఆదివారం':0,'సోమవారం':1,'మంగళవారం':2,'బుధవారం':3,'గురువారం':4,'శుక్రవారం':5,'శనివారం':6,
  ravivar:0,somvar:1,mangalvar:2,budhvar:3,guruvar:4,shukravar:5,shanivar:6,
  adivaram:0,somavaram:1,mangalavaram:2,budhavaram:3,guruvaram:4,shukravaram:5,shanivaram:6};
const EVERY='every|हर|ప్రతి',NEXT='next|अगले|अगला|వచ్చే';
const WB='(?<![\\p{L}\\p{M}\\p{N}])',WA='(?![\\p{L}\\p{M}\\p{N}])';
const re=(src)=>new RegExp(WB+'(?:'+src.normalize('NFC')+')'+WA,'iu');
const DAYS=Object.keys(WD).map(k=>k.normalize('NFC')).join('|');
const nextWd=(wd,strict)=>{const d=new Date(),n=(wd-d.getDay()+7)%7;return addD(n===0&&strict?7:n)};
const R={
  everyWd:re('(?:'+EVERY+')\\s+('+DAYS+')'),
  everyDay:re('(?:every\\s*day|daily|हर\\s*दिन|रोज़|रोज|ప్రతి\\s*రోజు|రోజూ)'),
  weekly:re('every\\s*week|weekly|हर\\s*(?:हफ्ते|हफ़्ते|सप्ताह)|ప్రతి\\s*వారం'),
  monthly:re('every\\s*month|monthly|हर\\s*महीने|ప్రతి\\s*నెల'),
  nextWd:re('(?:'+NEXT+')\\s+('+DAYS+')'),
  nextWeek:re('next\\s+week|अगले\\s*(?:हफ्ते|हफ़्ते|सप्ताह)|వచ్చే\\s*వారం'),
  inN:re('in\\s+(\\d{1,3})\\s*(day|days|week|weeks|month|months)'),
  inH:re('in\\s+\\d{1,3}\\s*(?:hour|hours|hr|hrs|minute|minutes|min|mins)'),
  bare:re('(?:on\\s+)?('+DAYS+')'),
  inN2:re('(\\d{1,3})\\s*(दिन|రోజుల్లో|రోజులలో|din)'),
  today:re('aaj|आज|ఈ\\s*రోజు|ఈరోజు|ఇవాళ|నేడు'),
  tomorrow:re('repu|kal|రేపు|कल'),
  dayAfter:re('parso|परसों|ఎల్లుండి')
};
function when(t){
  t=String(t||'').normalize('NFC');let m;
  if((m=R.everyWd.exec(t)))return{due:nextWd(WD[m[1].toLowerCase().normalize('NFC')],false),rep:'weekly'};
  if(R.everyDay.test(t))return{due:dk(),rep:'daily'};
  if(R.weekly.test(t))return{due:addD(7),rep:'weekly'};
  if(R.monthly.test(t))return{due:dk(addMo(new Date(),1)),rep:'monthly'};
  if((m=R.nextWd.exec(t)))return{due:nextWd(WD[m[1].toLowerCase().normalize('NFC')],true)};
  if(R.nextWeek.test(t))return{due:addD(7)};
  if((m=R.inN.exec(t))){const n=+m[1],u=m[2].toLowerCase();if(u.startsWith('week'))return{due:addD(7*n)};if(u.startsWith('month'))return{due:dk(addMo(new Date(),n))};return{due:addD(n)}}
  if((m=R.inN2.exec(t)))return{due:addD(+m[1])};
  if(R.inH.test(t))return{due:dk()};
  if((m=R.bare.exec(t)))return{due:nextWd(WD[m[1].toLowerCase().normalize('NFC')],true)};
  if(R.dayAfter.test(t))return{due:addD(2)};
  if(R.tomorrow.test(t))return{due:addD(1)};
  if(R.today.test(t))return{due:dk()};
  return{};
}
window.nxWhen=when;
const oParse=parse;
parse=function(t,f){const p=oParse(t,f);if(p&&p.type==='task'){const r=when(String(t||''));if(!p.due&&r.due)p.due=r.due;if(r.rep)p.rep=r.rep}return p};
const oAdd=addItem;
addItem=function(p){const it=oAdd(p);if(it&&p&&p.rep&&it.type==='task'){it.rep=p.rep;save()}return it};
})();
