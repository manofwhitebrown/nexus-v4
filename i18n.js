/* Nexus language layer (Phase 5): English, हिन्दी, తెలుగు.
   Loads first, in <head>, so even the lock screen speaks the chosen language.

   How it works. The app is written in English. This file translates what the app puts on the screen:
   text, placeholders, aria-labels, titles, and the messages of confirm/alert/prompt. The words live in
   i18n-data.js, one line per phrase. Anything without an entry stays in English, so nothing breaks.

   Your own words are never translated. A piece of text that is exactly the same as something you wrote
   (a task titled "Home", a project named "Study") is left alone.

   Nothing runs while the language is English. Nothing is sent anywhere. */
(()=>{
'use strict';
const NSP=location.pathname.replace(/[^\/]*$/,''),LK='nexus.lang'+NSP;
const LANGS=[['auto','Phone language'],['en','English'],['hi','हिन्दी'],['te','తెలుగు']];
const LOC={en:'en',hi:'hi-IN',te:'te-IN'};
const norm=s=>String(s).replace(/\s+/g,' ').trim();

let pref='auto';try{pref=localStorage.getItem(LK)||'auto'}catch(e){}
if(!LANGS.some(l=>l[0]===pref))pref='auto';
const detect=()=>{
  const l=(navigator.languages&&navigator.languages.length)?navigator.languages:[navigator.language||'en'];
  for(const x of l){const c=String(x).slice(0,2).toLowerCase();if(c==='hi'||c==='te'||c==='en')return c}
  return'en'};
let active=pref==='auto'?detect():pref;

/* ---------- the dictionary ---------- */
const DICT={hi:new Map(),te:new Map()},PATS=[],cache={hi:new Map(),te:new Map()};
function add(entries,patterns){
  for(const e of entries||[]){const k=norm(e[0]);if(e[1])DICT.hi.set(k,e[1]);if(e[2])DICT.te.set(k,e[2])}
  for(const p of patterns||[])PATS.push(p);
  cache.hi.clear();cache.te.clear();
  if(active!=='en'&&ready)rescan()}
const fill=(t,m)=>t.replace(/\$(\d)/g,(a,i)=>m[+i]===undefined?'':m[+i]);
function lookup(core){
  const k=norm(core),c=cache[active];
  if(c.has(k))return c.get(k);
  let r=DICT[active].get(k);
  if(r===undefined){
    r=null;
    for(const p of PATS){const m=p[0].exec(k);if(m){const t=p[active==='hi'?1:2];const v=typeof t==='function'?t(m,tr):fill(t,m);if(v!=null){r=v;break}}}}
  if(c.size>4000)c.clear();c.set(k,r);return r}
/* Translate a string. Keeps the spaces around it. Returns the same string when there is no entry. */
function tr(s){
  if(active==='en'||typeof s!=='string'||!s)return s;
  const m=/^(\s*)([\s\S]*?)(\s*)$/.exec(s);if(!m[2])return s;
  const r=lookup(m[2]);return r===null?s:m[1]+r+m[3]}

/* ---------- your own words are never translated ---------- */
const EMPTY=new Set();let USET=null;
function mine(){
  if(USET)return USET;
  let d;try{d=typeof D!=='undefined'?D:null}catch(e){d=null}
  if(!d)return EMPTY;
  const s=new Set(),a=x=>{if(typeof x==='string'&&x)s.add(norm(x))};
  try{
    for(const i of d.items||[]){a(i.title);a(String(i.body||'').slice(0,200));(i.tags||[]).forEach(a)}
    for(const p of d.projects||[]){a(p.name);a(p.desc)}
    for(const b of d.study||[]){a(b.name);for(const c of b.cards||[]){a(c.q);a(c.a)}for(const c of b.chapters||[])a(c.name||c.t)}
  }catch(e){}
  return USET=s}

/* ---------- the screen ---------- */
const SKIP=new Set(['SCRIPT','STYLE','TEXTAREA','CODE','PRE','NOSCRIPT']);
const ATTRS=['placeholder','aria-label','title','alt'];
const TXT=new WeakMap(),ATT=new WeakMap();
const skipEl=el=>{for(let e=el;e&&e.nodeType===1;e=e.parentNode){if(SKIP.has(e.tagName)||e.isContentEditable||e.getAttribute('data-nx-i18n')==='off')return true}return false};
function outFor(src){
  if(active==='en')return src;
  const out=tr(src);if(out===src)return src;
  return mine().has(norm(src))?src:out}
function doText(n){
  const cur=n.nodeValue;let o=TXT.get(n);
  if(!o||cur!==o.out)o={src:cur,out:cur};
  if(!/\S/.test(o.src)){TXT.delete(n);return}
  const out=outFor(o.src);o.out=out;TXT.set(n,o);
  if(out!==cur)n.nodeValue=out}
function doAttr(el,a){
  if(!el.hasAttribute||!el.hasAttribute(a))return;
  const cur=el.getAttribute(a);let rec=ATT.get(el);if(!rec)ATT.set(el,rec={});
  let o=rec[a];if(!o||cur!==o.out)o={src:cur,out:cur};
  const out=outFor(o.src);o.out=out;rec[a]=o;
  if(out!==cur)el.setAttribute(a,out)}
function scan(root){
  if(!root)return;
  if(root.nodeType===3){if(!skipEl(root.parentNode))doText(root);return}
  if(root.nodeType!==1&&root.nodeType!==9&&root.nodeType!==11)return;
  const base=root.nodeType===9?root.documentElement:root;
  if(!base||(base.nodeType===1&&skipEl(base)))return;
  if(base.nodeType===1)for(const a of ATTRS)doAttr(base,a);
  const w=document.createTreeWalker(base,1|4,{acceptNode(n){
    if(n.nodeType===1)return SKIP.has(n.tagName)||n.getAttribute('data-nx-i18n')==='off'?2:1;
    return 1}});
  let n;while((n=w.nextNode())){
    if(n.nodeType===3)doText(n);
    else for(const a of ATTRS)doAttr(n,a)}}
let ready=false,mo=null;
function rescan(){USET=null;scan(document.documentElement)}   /* the <title> is a text node, so it is scanned too */
function watch(on){
  if(on&&!mo&&typeof MutationObserver==='function'){
    mo=new MutationObserver(recs=>{
      USET=null;
      for(const r of recs){
        if(r.type==='childList')r.addedNodes.forEach(scan);
        else if(r.type==='characterData'){if(r.target.parentNode&&!skipEl(r.target.parentNode))doText(r.target)}
        else if(r.type==='attributes')doAttr(r.target,r.attributeName)}});
    mo.observe(document,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATTRS})}
  if(!on&&mo){mo.disconnect();mo=null}}

/* ---------- dates, times and the dialogs the browser draws itself ---------- */
const DT=['toLocaleDateString','toLocaleTimeString','toLocaleString'],origDT={};
for(const k of DT)origDT[k]=Date.prototype[k];
function wrapDates(){
  for(const k of DT){
    if(active==='en'){Date.prototype[k]=origDT[k];continue}
    Date.prototype[k]=function(l,...r){return origDT[k].call(this,(l===undefined||(Array.isArray(l)&&!l.length))?LOC[active]:l,...r)}}}
const nat={};
for(const k of ['alert','confirm','prompt']){nat[k]=window[k];
  window[k]=function(m,d){return k==='prompt'?nat[k].call(window,tr(String(m)),d):nat[k].call(window,tr(String(m)))}}

/* ---------- switching ---------- */
const subs=[];
function tellNative(){try{if(window.NexusNative&&NexusNative.setLang)NexusNative.setLang(pref)}catch(e){}}
function apply(){
  document.documentElement.lang=active;tellNative();
  wrapDates();
  watch(active!=='en');
  if(ready){rescan();for(const f of subs){try{f(active)}catch(e){}}}}
function set(v){
  if(!LANGS.some(l=>l[0]===v))return;
  pref=v;try{localStorage.setItem(LK,v)}catch(e){}
  active=v==='auto'?detect():v;apply();
  try{document.dispatchEvent(new CustomEvent('nx-lang',{detail:active}))}catch(e){}}

window.NXI18N={t:tr,add,set,lang:()=>active,pref:()=>pref,langs:LANGS,locale:()=>LOC[active],onChange:f=>subs.push(f),
  /* for the tests and for translators: what would this say, and is there an entry? */
  has:s=>{const was=active;if(was==='en')return false;return lookup(s)!==null}};

const boot=()=>{ready=true;if(active!=='en')rescan()};
apply();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
