(function () {
  var KEY='chunfeng-arena-v1',active=null;
  function progress(){var p={};try{p=JSON.parse(localStorage.getItem(KEY)||'{}');}catch(e){}return {xp:Math.max(0,Number(p.xp)||0),kills:Math.max(0,Number(p.kills)||0),coins:p.coins===undefined?50:Math.max(0,Number(p.coins)||0),hunger:p.hunger===undefined?100:Math.max(0,Number(p.hunger)||0),energy:p.energy===undefined?100:Math.max(0,Number(p.energy)||0),hygiene:p.hygiene===undefined?100:Math.max(0,Number(p.hygiene)||0),wave:Math.max(1,Number(p.wave)||1)};}
  function level(p){return 1+Math.floor(p.xp/100);}
  function mount(host){
    if(active)active();if(!host)return;
    var p=progress(),stopped=false,frame=0,last=0,keys={},held={},shots=[],enemyShots=[],enemies=[],spark=[],wave=p.wave,waveKills=0,score=0,bossSpawned=false;
    var hero={x:340,y:230,hp:5,hit:0},cool=0,dead=0,spawn=0,target=null,activity='',activityTime=0,notice='',saveTime=0;
    host.innerHTML='<div class="arena-status" role="status"></div><canvas class="arena-field" width="680" height="390" tabindex="0" aria-label="打怪场地，方向键或WASD移动，空格攻击"></canvas><div class="arena-controls"><div class="arena-pad"><button type="button" data-move="up">↑</button><div><button type="button" data-move="left">←</button><button type="button" data-move="down">↓</button><button type="button" data-move="right">→</button></div></div><button type="button" class="arena-attack">发射光线</button><button type="button" class="arena-pause">暂停</button></div><div class="frog-tip">点击场地后，用方向键/WASD移动，空格/J攻击；手机可长按方向和攻击。怪兽持续刷新，倒下后自动重返场地。游戏升级不代表预测更准确。</div>';
    var canvas=host.querySelector('canvas'),ctx=canvas.getContext('2d'),status=host.querySelector('.arena-status'),paused=false;
    var life=document.createElement('div');life.className='arena-life';life.innerHTML='<button type="button" data-life="eat">🍚 吃饭</button><button type="button" data-life="sleep">🛏 睡觉</button><button type="button" data-life="toilet">🚻 上厕所</button><button type="button" data-life="trade">🏪 做生意</button><button type="button" data-life="fight">⚔ 打怪</button><div class="arena-needs" role="status"></div>';host.insertBefore(life,canvas);
    var facilities=[{kind:'eat',x:45,y:95,label:'饭店',color:'#e8ac64'},{kind:'sleep',x:625,y:95,label:'卧室',color:'#8bbbd5'},{kind:'toilet',x:45,y:335,label:'厕所',color:'#97cbb3'},{kind:'trade',x:625,y:335,label:'商店',color:'#e1bb7c'}];
    [].slice.call(life.querySelectorAll('[data-life]')).forEach(function(btn){btn.onclick=function(){var kind=btn.dataset.life;paused=false;host.querySelector('.arena-pause').textContent='暂停';keys={};held={};activity='';if(kind==='fight'){target=null;notice='返回战斗，注意躲避红色弹丸';return;}if(kind==='eat'&&p.coins<8){notice='吃饭需要8金币，可先到商店做生意';return;}target=Object.assign({},facilities.find(function(f){return f.kind===kind;}));target.path=route(target);notice='正在前往'+target.label;};});
    var rocks=[{x:100,y:105,w:75,h:40},{x:490,y:90,w:75,h:40},{x:270,y:300,w:100,h:30}];
    function persist(){try{localStorage.setItem(KEY,JSON.stringify(p));host.dispatchEvent(new CustomEvent('arena-wallet'));window.dispatchEvent(new CustomEvent('game-wallet-change'));}catch(e){}}
    function reconcileWallet(){var latest=progress();p.coins=latest.coins;}
    host.addEventListener('arena-spent',reconcileWallet);
    function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
    function blocked(x,y){return rocks.some(function(r){return x>r.x-15&&x<r.x+r.w+15&&y>r.y-18&&y<r.y+r.h+15;});}
    function route(goal){var cols=34,start={x:Math.round((hero.x-10)/20),y:Math.round((hero.y-10)/20)},end={x:Math.round((goal.x-10)/20),y:Math.round((goal.y-10)/20)},key=function(v){return v.x+v.y*cols;},queue=[start],seen=new Map([[key(start),null]]),found=null;for(var qi=0;qi<queue.length;qi++){var at=queue[qi];if(at.x===end.x&&at.y===end.y){found=at;break;}[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var next={x:at.x+d[0],y:at.y+d[1]},x=next.x*20+10,y=next.y*20+10,k=key(next);if(next.x<1||next.x>32||y<80||y>353||seen.has(k)||blocked(x,y))return;seen.set(k,at);queue.push(next);});}var path=[];while(found&&seen.get(key(found))){path.unshift({x:found.x*20+10,y:found.y*20+10});found=seen.get(key(found));}return path;}
    function spawnEnemy(){var side=Math.floor(Math.random()*4),x=side===0?20:side===1?660:20+Math.random()*640,y=side===2?65:side===3?370:80+Math.random()*270;if(blocked(x,y))return;var boss=wave%5===0&&!bossSpawned;if(boss)bossSpawned=true;var ranged=boss||Math.random()<Math.min(.5,.15+wave*.025);enemies.push({x:x,y:y,hp:boss?12+wave*3:2+Math.floor((wave-1)/2),speed:boss?28:38+Math.min(70,wave*4),boss:boss,ranged:ranged,shoot:1+Math.random()});}
    function fire(){if(cool>0||dead||paused||activity)return;cool=p.energy<20?.55:.28;p.energy=Math.max(0,p.energy-.4);var best=null,dist=Infinity;enemies.forEach(function(e){var d=Math.hypot(e.x-hero.x,e.y-hero.y);if(d<dist){dist=d;best=e;}});var dx=best?best.x-hero.x:1,dy=best?best.y-hero.y:0,n=Math.hypot(dx,dy)||1;shots.push({x:hero.x,y:hero.y,dx:dx/n*500,dy:dy/n*500,life:1.7});}
    function hold(el,key){el.style.touchAction='none';el.addEventListener('pointerdown',function(e){e.preventDefault();held[key]=true;try{el.setPointerCapture(e.pointerId);}catch(x){}});['pointerup','pointercancel','lostpointercapture'].forEach(function(name){el.addEventListener(name,function(){held[key]=false;});});}
    [].slice.call(host.querySelectorAll('[data-move]')).forEach(function(b){hold(b,b.dataset.move);});hold(host.querySelector('.arena-attack'),'fire');
    canvas.addEventListener('keydown',function(e){var k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d',' ','j'].indexOf(k)>=0){e.preventDefault();keys[k]=true;}});
    canvas.addEventListener('keyup',function(e){keys[e.key.toLowerCase()]=false;});canvas.addEventListener('blur',function(){keys={};});
    host.querySelector('.arena-pause').onclick=function(){paused=!paused;keys={};held={};this.textContent=paused?'继续':'暂停';};
    function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
    function paint(){
      rect(0,0,680,390,'#c6e3ee');rect(0,58,680,332,'#6d9d6b');
      for(var x=0;x<680;x+=42)rect(x,26,25,32,'#8ca9b1');
      ctx.strokeStyle='rgba(255,255,255,.08)';for(var y=75;y<390;y+=35){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(680,y);ctx.stroke();}
      rocks.forEach(function(r){rect(r.x,r.y,r.w,r.h,'#6d777c');rect(r.x+5,r.y+4,r.w-10,7,'#9ba6aa');});
      facilities.forEach(function(f){rect(f.x-28,f.y-23,56,42,f.color);ctx.fillStyle='#44382b';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText(f.label,f.x,f.y+5);});
      enemies.forEach(function(e){ctx.fillStyle='#7752a5';ctx.beginPath();ctx.arc(e.x,e.y,17,0,Math.PI*2);ctx.fill();rect(e.x-12,e.y-20,6,12,'#b6a0d5');rect(e.x+6,e.y-20,6,12,'#b6a0d5');rect(e.x-8,e.y-5,5,5,'#fff6b5');rect(e.x+4,e.y-5,5,5,'#fff6b5');rect(e.x-7,e.y+8,14,3,'#302040');});
      if(!dead){ctx.save();ctx.translate(hero.x,hero.y);if(hero.hit>0)ctx.globalAlpha=.55;rect(-11,-4,22,25,'#d84d48');rect(-10,20,8,13,'#c9d9e1');rect(3,20,8,13,'#c9d9e1');ctx.fillStyle='#c9d9e1';ctx.beginPath();ctx.ellipse(0,-12,13,17,0,0,Math.PI*2);ctx.fill();rect(-9,-16,6,5,'#fff8a1');rect(4,-16,6,5,'#fff8a1');rect(-2,-29,4,18,'#e34d45');rect(-3,2,6,6,'#61e1ef');ctx.restore();}
      shots.forEach(function(s){ctx.fillStyle='#fff49a';ctx.beginPath();ctx.arc(s.x,s.y,5,0,Math.PI*2);ctx.fill();});
      enemyShots.forEach(function(s){ctx.fillStyle='#e23b36';ctx.beginPath();ctx.arc(s.x,s.y,6,0,Math.PI*2);ctx.fill();});
      enemies.filter(function(e){return e.boss;}).forEach(function(e){ctx.strokeStyle='#ffdd44';ctx.lineWidth=4;ctx.strokeRect(e.x-24,e.y-25,48,48);ctx.fillStyle='white';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText('BOSS '+e.hp,e.x,e.y-30);ctx.lineWidth=1;});
      spark.forEach(function(s){ctx.strokeStyle='rgba(255,240,120,'+s.life+')';ctx.beginPath();ctx.arc(s.x,s.y,25*(1-s.life),0,Math.PI*2);ctx.stroke();});
      if(paused||dead){rect(170,150,340,75,'rgba(0,0,0,.55)');ctx.fillStyle='#fff';ctx.font='22px sans-serif';ctx.textAlign='center';ctx.fillText(paused?'已暂停':'恢复能量中，即将重返场地',340,195);}
      status.textContent='第 '+wave+' 关'+(wave%5===0?' · BOSS关':'')+' · Lv.'+level(p)+' · 经验 '+p.xp+' · 本局击败 '+score+' · 生命 '+hero.hp+'/5 · 金币 '+p.coins;
      life.querySelector('.arena-needs').textContent='饱食 '+Math.floor(p.hunger)+' · 精力 '+Math.floor(p.energy)+' · 舒适 '+Math.floor(p.hygiene)+' ｜ '+(activity?{eat:'正在吃饭',sleep:'正在睡觉',toilet:'正在上厕所',trade:'正在做生意'}[activity]:notice||'金币可兑换本期娱乐杀号');
    }
    function tick(time){
      if(stopped)return;if(!host.isConnected){destroy();return;}var parent=host.closest('details');if(parent&&!parent.open){destroy();return;}
      var dt=last?Math.min(.04,(time-last)/1000):0;last=time;
      if(!paused&&!document.hidden){
        cool=Math.max(0,cool-dt);hero.hit=Math.max(0,hero.hit-dt);spawn-=dt;p.hunger=Math.max(0,p.hunger-dt*.12);p.hygiene=Math.max(0,p.hygiene-dt*.08);saveTime+=dt;if(saveTime>10){saveTime=0;persist();}
        if(dead){dead-=dt;if(dead<=0){dead=0;hero.hp=5;hero.x=340;hero.y=230;hero.hit=2;enemies=[];enemyShots=[];activity='';target=null;wave=Math.max(1,wave-1);p.wave=wave;p.coins=Math.floor(p.coins*.8);bossSpawned=false;waveKills=0;persist();notice='已复活，退回上一关，损失20%游戏金币';}}
        else{
          var dx=(keys.arrowright||keys.d||held.right?1:0)-(keys.arrowleft||keys.a||held.left?1:0),dy=(keys.arrowdown||keys.s||held.down?1:0)-(keys.arrowup||keys.w||held.up?1:0);if(dx||dy){target=null;activity='';}else if(target&&!activity){var aim=target.path&&target.path.length?target.path[0]:target;dx=aim.x-hero.x;dy=aim.y-hero.y;if(Math.hypot(dx,dy)<7&&target.path&&target.path.length){target.path.shift();dx=dy=0;}else if((!target.path||!target.path.length)&&Math.hypot(target.x-hero.x,target.y-hero.y)<16){activity=target.kind;activityTime=activity==='sleep'?4:3;target=null;dx=dy=0;}}
          if(activity){activityTime-=dt;if(activityTime<=0){if(activity==='eat'){if(p.coins>=8){p.coins-=8;p.hunger=100;p.energy=Math.min(100,p.energy+20);notice='吃饱了，花费8金币';}else notice='金币不足，请先做生意';}if(activity==='sleep'){p.energy=100;hero.hp=5;notice='精力恢复，生命回满';}if(activity==='toilet'){p.hygiene=100;notice='舒适度已恢复';}if(activity==='trade'){p.coins+=12;p.energy=Math.max(0,p.energy-8);p.hunger=Math.max(0,p.hunger-5);notice='生意完成，获得12游戏金币';}activity='';persist();}}
          var n=Math.hypot(dx,dy)||1,speed=p.hunger<15||p.energy<15?100:160,nx=clamp(hero.x+dx/n*speed*dt,18,662),ny=clamp(hero.y+dy/n*speed*dt,80,353);if(!activity){if(!blocked(nx,hero.y))hero.x=nx;if(!blocked(hero.x,ny))hero.y=ny;}
          if(keys[' ']||keys.j||held.fire)fire();
          if(spawn<=0&&enemies.length<Math.min(32,16+wave)){spawn=Math.max(.22,.85-wave*.04);spawnEnemy();}
          var safe=facilities.some(function(f){return Math.hypot(f.x-hero.x,f.y-hero.y)<65;})&&!(keys[' ']||keys.j||held.fire);
          enemies.forEach(function(e){var d=Math.hypot(hero.x-e.x,hero.y-e.y)||1,ex=e.x+(hero.x-e.x)/d*e.speed*dt,ey=e.y+(hero.y-e.y)/d*e.speed*dt;if(!safe){if(!blocked(ex,e.y))e.x=ex;if(!blocked(e.x,ey))e.y=ey;}e.shoot-=dt;if(e.ranged&&!safe&&e.shoot<=0){e.shoot=Math.max(.7,2-wave*.05);enemyShots.push({x:e.x,y:e.y,dx:(hero.x-e.x)/d*(115+wave*4),dy:(hero.y-e.y)/d*(115+wave*4),life:4});}if(!safe&&d<29&&hero.hit<=0){hero.hp--;hero.hit=1;if(hero.hp<=0)dead=2;}});
          shots.forEach(function(s){s.x+=s.dx*dt;s.y+=s.dy*dt;s.life-=dt;if(blocked(s.x,s.y))s.life=0;enemies.forEach(function(e){if(s.life>0&&e.hp>0&&Math.hypot(s.x-e.x,s.y-e.y)<23){e.hp--;s.life=0;spark.push({x:e.x,y:e.y,life:1});if(e.hp<=0){var previousLevel=level(p);p.xp+=e.boss?50:10;p.coins+=e.boss?25:3;p.kills++;score++;waveKills++;persist();if(level(p)!==previousLevel)host.dispatchEvent(new CustomEvent('arena-level'));}}});});
          enemyShots.forEach(function(s){s.x+=s.dx*dt;s.y+=s.dy*dt;s.life-=dt;if(blocked(s.x,s.y))s.life=0;if(!safe&&s.life>0&&Math.hypot(s.x-hero.x,s.y-hero.y)<17&&hero.hit<=0){s.life=0;hero.hp--;hero.hit=1;if(hero.hp<=0)dead=2;}});enemyShots=enemyShots.filter(function(s){return s.life>0;});
          if(waveKills>=6+Math.min(24,wave*2)&&!enemies.some(function(e){return e.boss&&e.hp>0;})){wave++;p.wave=wave;waveKills=0;bossSpawned=false;persist();notice='进入第'+wave+'关，怪兽更强了';}
          shots=shots.filter(function(s){return s.life>0;});enemies=enemies.filter(function(e){return e.hp>0;});
        }
        spark.forEach(function(s){s.life-=dt*2;});spark=spark.filter(function(s){return s.life>0;});
      }
      paint();frame=requestAnimationFrame(tick);
    }
    function destroy(){stopped=true;cancelAnimationFrame(frame);keys={};held={};persist();host.removeEventListener('arena-spent',reconcileWallet);if(active===destroy)active=null;}
    active=destroy;frame=requestAnimationFrame(tick);
    return {destroy:destroy,snapshot:function(){return {x:hero.x,y:hero.y,wave:wave,enemies:enemies.length,boss:enemies.some(function(e){return e.boss;}),shots:shots.length,xp:p.xp,coins:p.coins,activity:activity,target:target&&target.kind,hunger:p.hunger,energy:p.energy,hygiene:p.hygiene,paused:paused};}};
  }
  window.MonsterArena={mount:mount,progress:progress,level:function(){return level(progress());},addCoins:function(n){if(!Number.isInteger(n)||n<=0||n>1000)return false;var p=progress();p.coins+=n;try{localStorage.setItem(KEY,JSON.stringify(p));document.querySelectorAll('.monster-arena').forEach(function(el){el.dispatchEvent(new CustomEvent('arena-spent'));});window.dispatchEvent(new CustomEvent('game-wallet-change'));return true;}catch(e){return false;}},spendCoins:function(n){var p=progress();if(!Number.isInteger(n)||n<0||p.coins<n)return false;p.coins-=n;try{localStorage.setItem(KEY,JSON.stringify(p));document.querySelectorAll('.monster-arena').forEach(function(el){el.dispatchEvent(new CustomEvent('arena-spent'));});window.dispatchEvent(new CustomEvent('game-wallet-change'));return true;}catch(e){return false;}}};
})();
