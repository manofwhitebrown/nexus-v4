/* Nexus AI router. Loaded before patch.js.
   The app talks to one fake "Anthropic" endpoint. When the key is the marker below, this file
   sends the request to the user's own free providers in order (Gemini, Groq, OpenRouter, Mistral,
   Cerebras) and moves to the next model or provider when one hits a limit or fails.
   Keys are the user's own, stored only in this browser. Nothing is bundled in the repository. */
(()=>{
const MARK='__nexus_multi__',LS='nexus.ai.v1'+NS,CL='nexus.ai.cool';
const PROV={
  gemini:{name:'Google Gemini',get:'https://aistudio.google.com/apikey',kind:'gemini',base:'https://generativelanguage.googleapis.com/v1beta',models:['gemini-flash-latest','gemini-flash-lite-latest'],vision:true},
  groq:{name:'Groq',get:'https://console.groq.com/keys',kind:'oai',base:'https://api.groq.com/openai/v1',models:['llama-3.3-70b-versatile','llama-3.1-8b-instant']},
  openrouter:{name:'OpenRouter',get:'https://openrouter.ai/keys',kind:'oai',base:'https://openrouter.ai/api/v1',models:['openrouter/free']},
  mistral:{name:'Mistral',get:'https://console.mistral.ai/api-keys',kind:'oai',base:'https://api.mistral.ai/v1',models:['mistral-small-latest']},
  cerebras:{name:'Cerebras',get:'https://cloud.cerebras.ai/',kind:'oai',base:'https://api.cerebras.ai/v1',models:[]}
};
const ORDER=['gemini','groq','openrouter','mistral','cerebras'];
const raw=window.fetch.bind(window);
const load=()=>{try{const c=JSON.parse(localStorage.getItem(LS)||'{}');return{keys:c.keys||{},models:c.models||{},disc:c.disc||{}}}catch(e){return{keys:{},models:{},disc:{}}}};
const store=c=>{try{localStorage.setItem(LS,JSON.stringify(c))}catch(e){}};
let cool={};try{cool=JSON.parse(localStorage.getItem(CL)||'{}')}catch(e){}
const bad={},last={};
const cooling=(id,m)=>(cool[id+'|'+m]||0)>Date.now();
const setCool=(id,m,s)=>{cool[id+'|'+m]=Date.now()+s*1000;try{localStorage.setItem(CL,JSON.stringify(cool))}catch(e){}};
const has=()=>ORDER.some(i=>load().keys[i]);

/* ---- Anthropic-style request -> provider formats ---- */
const clean=(s,up)=>{if(Array.isArray(s))return s.map(x=>clean(x,up));if(s&&typeof s==='object'){const o={};for(const k in s){if(k==='additionalProperties'||k==='$schema')continue;o[k]=(k==='type'&&typeof s[k]==='string'&&up)?s[k].toUpperCase():clean(s[k],up)}return o}return s};
const blocks=c=>typeof c==='string'?[{type:'text',text:c}]:Array.isArray(c)?c:[];
const needsVision=b=>(b.messages||[]).some(m=>blocks(m.content).some(x=>x.type==='image'||x.type==='document'));
const toOai=(b,model,noTools)=>{const msgs=[];if(b.system)msgs.push({role:'system',content:String(b.system)});
  for(const m of b.messages||[])msgs.push({role:m.role==='assistant'?'assistant':'user',content:blocks(m.content).filter(x=>x.type==='text').map(x=>x.text).join('\n')});
  const o={model,messages:msgs,max_tokens:Math.min(b.max_tokens||1000,4000)};
  if(!noTools&&b.tools&&b.tools.length){o.tools=b.tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:clean(t.input_schema,false)}}));o.tool_choice='auto'}return o};
const toGem=(b,noTools)=>{const o={contents:(b.messages||[]).map(m=>({role:m.role==='assistant'?'model':'user',parts:blocks(m.content).map(x=>x.type==='text'?{text:x.text}:(x.type==='image'||x.type==='document')&&x.source?{inlineData:{mimeType:x.source.media_type,data:x.source.data}}:null).filter(Boolean)})),generationConfig:{maxOutputTokens:Math.min(b.max_tokens||1000,8000)}};
  if(b.system)o.systemInstruction={parts:[{text:String(b.system)}]};
  if(!noTools&&b.tools&&b.tools.length)o.tools=[{functionDeclarations:b.tools.map(t=>({name:t.name,description:t.description,parameters:clean(t.input_schema,true)}))}];return o};
const fromOai=j=>{const m=j&&j.choices&&j.choices[0]&&j.choices[0].message;if(!m)return[];const o=[];if(m.content)o.push({type:'text',text:String(m.content)});
  (m.tool_calls||[]).forEach((c,i)=>{let a={};try{a=JSON.parse(c.function.arguments||'{}')}catch(e){}o.push({type:'tool_use',id:c.id||'t'+i,name:c.function.name,input:a})});return o};
const fromGem=j=>{const p=j&&j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts;if(!p)return[];const o=[];
  p.forEach((x,i)=>{if(x.text&&!x.thought)o.push({type:'text',text:x.text});if(x.functionCall)o.push({type:'tool_use',id:'t'+i,name:x.functionCall.name,input:x.functionCall.args||{}})});return o};

/* ---- One attempt against one provider and model ---- */
async function attempt(id,m,k,b,noTools){const P=PROV[id];let url,init;
  if(P.kind==='gemini'){url=P.base+'/models/'+encodeURIComponent(m)+':generateContent';init={method:'POST',headers:{'content-type':'application/json','x-goog-api-key':k},body:JSON.stringify(toGem(b,noTools))}}
  else{url=P.base+'/chat/completions';init={method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+k,'X-Title':'Nexus'},body:JSON.stringify(toOai(b,m,noTools))}}
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),30000);init.signal=ctl.signal;
  let res;try{res=await raw(url,init)}catch(e){clearTimeout(t);return{net:1}}clearTimeout(t);
  let txt='',j=null;try{txt=await res.text();j=JSON.parse(txt)}catch(e){}
  if(res.ok&&j){const bl=P.kind==='gemini'?fromGem(j):fromOai(j);return bl.length?{ok:1,blocks:bl}:{empty:1}}
  const msg=String((j&&j.error&&(j.error.message||j.error))||txt||'').slice(0,200);
  return{status:res.status,msg,retry:+res.headers.get('retry-after')||0}}

/* ---- Find working model names when a default has been retired ---- */
async function discover(id,k){const P=PROV[id];try{
  const r=await raw(P.kind==='gemini'?P.base+'/models?pageSize=100':P.base+'/models',{headers:P.kind==='gemini'?{'x-goog-api-key':k}:{authorization:'Bearer '+k}});if(!r.ok)return;const j=await r.json();let l=[];
  if(P.kind==='gemini')l=(j.models||[]).filter(x=>(x.supportedGenerationMethods||[]).includes('generateContent')&&/flash/.test(x.name)&&!/(image|tts|live|audio|embed|robotics|computer)/.test(x.name)).map(x=>x.name.replace(/^models\//,'')).sort((a,b)=>(/lite/.test(a)?1:0)-(/lite/.test(b)?1:0));
  else{const ids=(j.data||j.models||[]).map(x=>x.id||x.name).filter(Boolean).filter(x=>!/(whisper|guard|tts|embed|moderation|orpheus|safeguard|rerank|transcri|image|vision-preview)/i.test(x));
    l=id==='openrouter'?ids.filter(x=>/:free$/.test(x)):ids.sort((a,b)=>sc(a)-sc(b))}
  const c=load();c.disc[id]=l.slice(0,3);store(c)}catch(e){}}
const sc=x=>{const p=[/70b|120b|large|medium/i,/small|flash|gpt-oss/i,/llama|qwen/i];const i=p.findIndex(r=>r.test(x));return i<0?9:i};
const models=(id,c)=>c.models[id]?[c.models[id]]:[...new Set([...PROV[id].models,...(c.disc[id]||[])])];

/* ---- Walk the chain ---- */
async function run(b){const why={};const need=needsVision(b);let c=load();
  for(const id of ORDER){const k=c.keys[id];if(!k)continue;if(need&&!PROV[id].vision){why[id]='cannot read files';continue}
    if(bad[id]){why[id]='key rejected';continue}
    let tryDisc=true,list=models(id,c);
    for(let i=0;i<list.length;i++){const m=list[i];if(cooling(id,m)){why[id]=why[id]||'limit reached';continue}
      let r=await attempt(id,m,k,b,false);
      if(r.status===400&&b.tools&&b.tools.length&&!/model/i.test(r.msg||''))r=await attempt(id,m,k,b,true);
      if(r.ok){last.name=PROV[id].name;last.model=m;return new Response(JSON.stringify({type:'message',role:'assistant',model:m,content:r.blocks}),{status:200,headers:{'content-type':'application/json'}})}
      if(r.status===401||r.status===403){bad[id]=1;why[id]='key rejected';break}
      if(r.status===429){setCool(id,m,/day|daily|quota/i.test(r.msg||'')?3600:Math.max(30,Math.min(r.retry||60,900)));why[id]='limit reached';continue}
      if(r.status===404||(r.status===400&&/model/i.test(r.msg||''))){why[id]='model unavailable';setCool(id,m,600);if(tryDisc){tryDisc=false;await discover(id,k);c=load();const n=models(id,c).filter(x=>!list.includes(x));list=list.concat(n)}continue}
      setCool(id,m,30);why[id]=r.net?'could not connect':'busy'}}
  const set=Object.keys(why);const msg=!ORDER.some(i=>c.keys[i])?'No free AI key yet. Add one in Settings under Free AI providers.':
    'Every AI provider is unavailable right now ('+set.map(i=>PROV[i].name+': '+why[i]).join('; ')+'). Free limits usually reset daily. Try again later.';
  return new Response(JSON.stringify({type:'error',error:{type:'overloaded_error',message:msg}}),{status:503,headers:{'content-type':'application/json'}})}

/* ---- Intercept the app's AI calls ---- */
window.fetch=function(u,o){const url=String(u&&u.url||u);
  if(url.startsWith('https://api.anthropic.com/v1/messages')&&o&&o.headers&&o.headers['x-api-key']===MARK){let b;try{b=JSON.parse(o.body)}catch(e){return Promise.resolve(new Response('{"error":{"message":"Bad request."}}',{status:400}))}return run(b)}
  return raw.apply(window,arguments)};

/* ---- Public helpers and Settings section ---- */
const sync=()=>{try{window.setSK&&window.setSK(has()?MARK:'')}catch(e){}};
const test=async()=>{const c=load(),out=[];for(const id of ORDER){const k=c.keys[id];if(!k)continue;let ok=false,note='';
  for(const m of models(id,c)){const r=await attempt(id,m,k,{max_tokens:20,messages:[{role:'user',content:'Reply with the single word ok.'}]},true);
    if(r.ok){ok=true;note=m;setCool(id,m,0);delete bad[id];break}note=r.net?'could not connect (the provider may block browser requests)':r.status===401||r.status===403?'key rejected':r.status===429?'limit reached right now':r.status===404?'model not found':'error '+(r.status||'')}
  out.push({id,name:PROV[id].name,ok,note})}return out};
window.NXAI={has,mark:MARK,test,sync,last:()=>last.name?last.name+' ('+last.model+')':''};

const oS=settings;
settings=function(){oS();try{const hs=[...dlg.querySelectorAll('h2')],del=hs[hs.length-1];if(!del)return;const c=load(),f=document.createElement('div');
  f.innerHTML=`<h2>Free AI providers</h2><p class="mu">Ask Nexus can use free AI keys instead of a paid one. Add as many as you like. Nexus tries them in this order and moves to the next one when a limit is reached: Gemini, Groq, OpenRouter, Mistral, Cerebras. Keys stay in this browser only and are never put in the code. Your question and the matching notes go to whichever provider answers. Google may use free-tier content to improve its products, so skip Gemini if that matters to you.</p>`+ORDER.map(id=>`<label><span>${PROV[id].name} key, <a href="${PROV[id].get}" target="_blank" rel="noopener noreferrer">get a free one</a></span><input type="password" autocomplete="off" maxlength="300" data-k="${id}" placeholder="${c.keys[id]?'Saved. Paste a new key to replace it.':'Paste key'}"></label>`).join('')+`<div class="row2"><button class="btn p" id="aks">Save keys</button><button class="btn" id="akt">Test</button><button class="btn d" id="akc">Remove all keys</button></div><small id="ako" role="status"></small><details style="margin-top:10px"><summary>Model names (advanced)</summary><p class="mu">Leave empty to use the defaults. Nexus finds replacements on its own if a model is retired.</p>${ORDER.map(id=>`<label><span>${PROV[id].name}</span><input autocomplete="off" maxlength="100" data-m="${id}" value="${(c.models[id]||'').replace(/"/g,'')}" placeholder="${PROV[id].models[0]||'automatic'}"></label>`).join('')}</details>`;
  del.before(f);const o=t=>{$('#ako').textContent=t};
  $('#aks').onclick=()=>{const c=load();let n=0,badk=0;dlg.querySelectorAll('[data-k]').forEach(i=>{const v=i.value.trim();if(!v)return;if(!/^[\w\-.]{16,300}$/.test(v)){badk++;return}c.keys[i.dataset.k]=v;i.value='';n++});
    dlg.querySelectorAll('[data-m]').forEach(i=>{const v=i.value.trim();if(!v)delete c.models[i.dataset.m];else if(/^[\w\-./:]{2,100}$/.test(v))c.models[i.dataset.m]=v});
    store(c);Object.keys(bad).forEach(k=>delete bad[k]);sync();o(badk?'One key looks wrong. Keys have no spaces and are at least 16 characters.':n?'Saved '+n+' key'+(n>1?'s':'')+'. Tap Test to check them.':'Model names saved.')};
  $('#akt').onclick=async()=>{if(!has()){o('Add a key first.');return}o('Testing...');$('#akt').disabled=true;const r=await test();$('#akt').disabled=false;o(r.map(x=>x.name+': '+(x.ok?'works ('+x.note+')':x.note)).join('\n'));$('#ako').style.whiteSpace='pre-wrap'};
  $('#akc').onclick=()=>{if(!confirm('Remove all saved AI keys from this browser?'))return;const c=load();c.keys={};store(c);sync();settings()}}catch(e){}};
})();
