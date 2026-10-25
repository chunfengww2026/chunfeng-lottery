(function(){
 'use strict';
 if(window.__chunfengVisitorCounterStarted)return;window.__chunfengVisitorCounterStarted=true;
 var endpoint='https://bsz.iirose.cn/api',identityKey='chunfeng-visitor-9420-identity-v1',cacheKey='chunfeng-visitor-9420-cache-v1';
 var num=document.getElementById('busuanzi_value_site_uv'),box=document.getElementById('ro-hot'),hint=null,legacy=num?num.getAttribute('data-legacy-count')||'426':'426',busy=false,done=false,attempts=0;
 if(num&&box){hint=document.createElement('small');hint.id='visitorCountStatus';hint.style.cssText='font-size:10px;margin-left:4px;color:#8a7a63';box.appendChild(hint);box.hidden=false;}
 function valid(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&Math.floor(v)===v;}
 function read(k){try{return localStorage.getItem(k)||'';}catch(e){return '';}}
 function save(k,v){try{localStorage.setItem(k,v);}catch(e){}}
 function state(text){if(hint){hint.textContent=text;hint.hidden=!text;}}
 function show(value,updated,cached){if(!valid(value))return;if(num){num.textContent=String(value);num.title='新服务独立访客统计'+(updated?'，更新于 '+updated:'')+'；旧服务历史统计 '+legacy+'，两者分别记录。';}state(cached?'缓存':'');}
 var cached=null;try{cached=JSON.parse(read(cacheKey)||'null');}catch(e){}if(cached&&valid(cached.uv))show(cached.uv,cached.updated,true);else{if(num)num.textContent='—';state('加载中');}
 if(location.protocol==='file:'){state('请在线查看');return;}
 async function update(){
  if(busy||done||attempts>=3)return;busy=true;attempts++;
  try{
   var headers={'x-bsz-referer':'https://chunfengww2026.github.io/chunfeng-lottery/index.html'},identity=read(identityKey);if(identity)headers.Authorization='Bearer '+identity;
   var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},12000),r;
   try{r=await fetch(endpoint,{method:'POST',headers:headers,signal:controller.signal});}finally{clearTimeout(timer);}
   if(r.status===401&&identity){save(identityKey,'');busy=false;return update();}
   if(!r.ok)throw new Error('counter unavailable');var data=await r.json();
   if(data.success!==true||!data.data||!valid(data.data.site_uv))throw new Error('invalid counter');
   var next=r.headers.get('Set-Bsz-Identity');if(next)save(identityKey,next);
   var updated=new Date().toLocaleString('sv-SE',{timeZone:'Asia/Shanghai',hour12:false});
   show(data.data.site_uv,updated,false);save(cacheKey,JSON.stringify({uv:data.data.site_uv,updated:updated}));done=true;
   window.dispatchEvent(new CustomEvent('visitor-count-updated',{detail:{uv:data.data.site_uv,updated:updated,source:'9420'}}));
  }catch(e){state(cached&&valid(cached.uv)?'缓存':'待重试');}
  finally{busy=false;}
 }
 update();setTimeout(update,30000);setTimeout(update,120000);document.addEventListener('visibilitychange',function(){if(!document.hidden&&!done)update();});
})();
