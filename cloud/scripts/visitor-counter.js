(function(){
 'use strict';
 if(window.__chunfengVisitorCounterStarted)return;window.__chunfengVisitorCounterStarted=true;
 var endpoint='https://bsz.iirose.cn/api',identityKey='chunfeng-visitor-9420-identity-v1',cacheKey='chunfeng-visitor-9420-daily-cache-v1';
 var num=document.getElementById('busuanzi_value_site_uv'),box=document.getElementById('ro-hot'),hint=null,busy=false,done=false,attempts=0,generation=0,active=null;
 function today(){return new Date(Date.now()+8*3600000).toISOString().slice(0,10);}
 var day=today(),cached=null;
 if(num&&box){hint=document.createElement('small');hint.id='visitorCountStatus';hint.style.cssText='font-size:10px;margin-left:4px;color:#8a7a63';box.appendChild(hint);box.hidden=false;}
 function valid(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&Math.floor(v)===v;}
 function read(k){try{return localStorage.getItem(k)||'';}catch(e){return '';}}
 function save(k,v){try{localStorage.setItem(k,v);}catch(e){}}
 function state(text){if(hint){hint.textContent=text;hint.hidden=!text;}}
 function show(value,updated,fromCache){if(!valid(value))return;if(num){num.textContent=String(value);num.setAttribute('data-counter-date',day);num.title='今日访客 '+day+'（北京时间），同一访客当天只计一次，次日重新统计'+(updated?'；更新于 '+updated:'')+'。';}state(fromCache?'缓存':'');}
 function restore(){cached=null;try{var c=JSON.parse(read(cacheKey)||'null');if(c&&c.date===day&&valid(c.uv))cached=c;}catch(e){}if(cached)show(cached.uv,cached.updated,true);else{if(num){num.textContent='—';num.setAttribute('data-counter-date',day);num.title='今日访客 '+day+'（北京时间），正在获取今日统计。';}state('加载中');}}
 restore();if(location.protocol==='file:'){state('请在线查看');return;}
 async function update(){
  if(busy||done||attempts>=3||document.hidden)return;busy=true;attempts++;var requestDay=day,token=generation;
  try{
   var headers={'x-bsz-referer':'https://chunfengww2026.github.io/chunfeng-lottery/visitor-days/'+requestDay},identity=read(identityKey);if(identity)headers.Authorization='Bearer '+identity;
   var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},12000),r;active=controller;
   try{r=await fetch(endpoint,{method:'POST',headers:headers,signal:controller.signal});}finally{clearTimeout(timer);}
   if(token!==generation||requestDay!==today())return;
   if(r.status===401&&identity){save(identityKey,'');busy=false;return await update();}
   if(!r.ok)throw new Error('counter unavailable');var data=await r.json();
   if(token!==generation||requestDay!==today())return;
   if(data.success!==true||!data.data||!valid(data.data.page_uv))throw new Error('invalid counter');
   var next=r.headers.get('Set-Bsz-Identity');if(next)save(identityKey,next);
   var updated=new Date().toLocaleString('sv-SE',{timeZone:'Asia/Shanghai',hour12:false});
   cached={date:requestDay,uv:data.data.page_uv,updated:updated};save(cacheKey,JSON.stringify(cached));show(cached.uv,updated,false);done=true;
   window.dispatchEvent(new CustomEvent('visitor-count-updated',{detail:{date:requestDay,uv:cached.uv,updated:updated,source:'9420-daily'}}));
  }catch(e){if(token===generation)state(cached?'缓存':'待重试');}
  finally{if(token===generation){busy=false;active=null;}}
 }
 function rollover(){var current=today();if(current!==day){generation++;if(active)active.abort();active=null;day=current;busy=false;done=false;attempts=0;restore();}if(!document.hidden&&!done)update();}
 update();setTimeout(rollover,30000);setTimeout(rollover,120000);
 setInterval(function(){if(today()!==day)rollover();},1000);
 document.addEventListener('visibilitychange',function(){if(!document.hidden)rollover();});window.addEventListener('focus',rollover);
})();
