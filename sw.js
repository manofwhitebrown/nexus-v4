const SCOPE=self.registration.scope,VERSION='nexus-4.2.2|'+SCOPE;
const SHELL=['./','index.html','ai.js','patch.js','capture.js','features.js','native.js','vault.js','safety.js','sync.js','dates.js','i18n.js','i18n-data.js','launch.js','v41.js','import2.js','v42.js','vendor/pdf.min.mjs','vendor/pdf.worker.min.mjs','fonts.css','palette.js','plan.js','tasks2.js','boards.js','projectchat.js','titles.js','thumbs.js','phone.js','portability.js','study.js','smart.js','sound.js','theme.css','manifest.webmanifest','privacy.html','terms.html','404.html','offline.html','error.html','icons/favicon.svg','icons/logo.svg','icons/apple-touch-icon.png','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','fonts/familjen-grotesk-latin-400.woff2','fonts/familjen-grotesk-latin-600.woff2','fonts/familjen-grotesk-latin-700.woff2','fonts/noto-sans-devanagari-400.woff2','fonts/noto-sans-devanagari-700.woff2','fonts/noto-sans-telugu-400.woff2','fonts/noto-sans-telugu-700.woff2'];

self.addEventListener('install',e=>{
  /* cache:'reload' bypasses GitHub Pages' 10-minute HTTP cache so a new version never installs old files */
  e.waitUntil(caches.open(VERSION).then(c=>Promise.all(SHELL.map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>{})))).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION&&k.startsWith('nexus-')&&(k.endsWith('|'+SCOPE)||!k.includes('|'))).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

/* Same-origin files: serve the cached copy instantly, refresh it in the background.
   Everything else (the Anthropic API, the AI providers, Dropbox) goes straight to the network. The Hindi and Telugu fonts are cached the first time they are shown. */
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  /* Files shared from other apps arrive as a POST to the app address: park them, then open the app */
  if(r.method==='POST'&&u.origin===location.origin&&u.pathname===new URL(SCOPE).pathname){
    e.respondWith((async()=>{try{const f=await r.formData(),q=new URLSearchParams();
      for(const k of['title','text','url']){const v=f.get(k);if(typeof v==='string'&&v)q.set(k,v)}
      const c=await caches.open('share-inbox');for(const k of await c.keys())await c.delete(k);
      let i=0;for(const x of f.getAll('files')){if(!x||typeof x!=='object'||!x.size||x.size>8e6||i>=10)continue;
        await c.put(new URL('share/'+(i++)+'?n='+encodeURIComponent(x.name||'shared'),SCOPE).href,new Response(x,{headers:{'content-type':x.type||'application/octet-stream'}}))}
      return Response.redirect(SCOPE+(q.toString()?'?'+q:''),303)}catch(err){return Response.redirect(SCOPE,303)}})());return}
  if(r.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(caches.open(VERSION).then(async c=>{
    const hit=await c.match(r,{ignoreSearch:true});
    const net=fetch(r,{cache:'no-cache'}).then(res=>{if(res.ok&&res.status===200)c.put(r,res.clone());return res}).catch(()=>null);
    if(hit){e.waitUntil(net);return hit}
    const res=await net;if(res&&r.mode==='navigate'&&(res.status>=500||res.status===403||res.status===429)){return (await c.match('error.html'))||res}
    return res||(r.mode==='navigate'?((await c.match('index.html'))||(await c.match('offline.html'))||Response.error()):Response.error());
  }));
});

/* Tapping a reminder or focus notification opens (or focuses) the app */
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  if(e.notification.tag==='nexus-quick'){
    /* Keep the quick-note shortcut pinned, then open the small capture screen */
    e.waitUntil(Promise.all([self.registration.showNotification('Nexus quick note',{body:'Tap to jot something down.',tag:'nexus-quick',requireInteraction:true,silent:true,icon:'icons/icon-192.png',badge:'icons/icon-192.png'}),self.clients.openWindow('./?a=capture&q=1')]));return;
  }
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>l.length?l[0].focus():self.clients.openWindow('./')));
});
