import {JSDOM,ResourceLoader,VirtualConsole} from 'jsdom';
import {IDBFactory as FDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
class Loader extends ResourceLoader{
  fetch(url){const u=new URL(url);if(u.origin!=='http://localhost')return null;
    const f=path.join(ROOT,u.pathname==='/'?'index.html':u.pathname);
    try{return Promise.resolve(fs.readFileSync(f))}catch(e){return Promise.reject(e)}}
}
/* A "browser" keeps its storage between page loads, like a real one. */
export const newBrowser=()=>({idb:new FDBFactory(),ls:{},ss:{}});

export async function boot(br,{quotaFail=false,errors=[],pre=null,query='',locked=false}={}){
  const vc=new VirtualConsole();
  vc.on('jsdomError',e=>{if(!/not implemented/i.test(e.message))errors.push(String(e.message||e).slice(0,200)+' '+(e.detail&&e.detail.message||''))});
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost/'+query,runScripts:'dangerously',resources:new Loader(),pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(w){
      for(const [k,v] of Object.entries(br.ls))w.localStorage.setItem(k,v);
      for(const [k,v] of Object.entries(br.ss))w.sessionStorage.setItem(k,v);
      w.__rawGet=Object.getPrototypeOf(w.localStorage).getItem;w.Blob=Blob;   /* Node's Blob can be stored in the fake IndexedDB; jsdom's cannot */
      if(pre)pre(w);w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.fetch=()=>Promise.reject(new Error('offline'));w.indexedDB=br.idb;w.IDBKeyRange=IDBKeyRange;
      Object.defineProperty(w,'crypto',{value:webcrypto,configurable:true});
      w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){}}));
      const dp=w.HTMLDialogElement.prototype;
      dp.showModal=function(){this.setAttribute('open','')};
      dp.close=function(){if(!this.hasAttribute('open'))return;this.removeAttribute('open');setTimeout(()=>this.dispatchEvent(new w.Event('close')),0)};
      if(quotaFail){const P=Object.getPrototypeOf(w.localStorage),o=P.setItem;P.setItem=function(k,v){if(w.__full&&String(k)==='nexus.data/')throw new w.DOMException('full','QuotaExceededError');return o.apply(this,arguments)}}
    }});
  const w=dom.window;
  await new Promise(r=>w.document.readyState==='complete'?r():w.addEventListener('load',r));
  /* app scripts load after the vault decides whether to ask for a passphrase */
  if(!locked){for(let i=0;i<400&&!w.__nxReady;i++)await new Promise(r=>setTimeout(r,10));if(!w.__nxReady)errors.push('app scripts never finished loading')}
  await new Promise(r=>setTimeout(r,50));
  const page={w,errors,dom,
    ev:c=>w.eval(c),
    sleep:ms=>new Promise(r=>setTimeout(r,ms)),
    flush:async()=>{await w.NXSafe.flush();await w.NXVault.flush()},
    /* what the browser would keep after this page is closed */
    raw:k=>w.__rawGet.call(w.localStorage,k),
    /* raw: what is really on disk, even when the vault is showing the app plain text */
    close(){br.ls={};for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);br.ls[k]=w.__rawGet.call(w.localStorage,k)}br.ss={};for(let i=0;i<w.sessionStorage.length;i++){const k=w.sessionStorage.key(i);br.ss[k]=w.sessionStorage.getItem(k)}w.close()}};
  return page;
}
