(function () {
  var KEY='chunfeng-arena-v1',active=null;
  function progress(){try{var p=JSON.parse(localStorage.getItem(KEY)||'{}');return {xp:Math.max(0,Number(p.xp)||0),kills:Math.max(0,Number(p.kills)||0)};}catch(e){return {xp:0,kills:0};}}
  function level(p){return 1+Math.floor(p.xp/100);}
  function mount(host){
    if(active)active();if(!host)return;
    var p=progress(),stopped=false,frame=0,last=0,keys={},held={},shots=[],enemies=[],spark=[],wave=1,waveKills=0,score=0;
    var hero={x:340,y:230,hp:5,hit:0},cool=0,dead=0,spawn=0;
    host.innerHTML='<div class="arena-status" role="status"></div><canvas class="arena-field" width="680" height="390" tabindex="0" aria-label="打怪场地，方向键或WASD移动，空格攻击"></canvas><div class="arena-controls"><div class="arena-pad"><button type="button" data-move="up">↑</button><div><button type="button" data-move="left">←</button><button type="button" data-move="down">↓</button><button type="button" data-move="right">→</button></div></div><button type="button" class="arena-attack">发射光线</button><button type="button" class="arena-pause">暂停</button></div><div class="frog-tip">点击场地后，用方向键/WASD移动，空格/J攻击；手机可长按方向和攻击。怪兽持续刷新，倒下后自动重返场地。游戏升级不代表预测更准确。</div>';
    var canvas=host.querySelector('canvas'),ctx=canvas.getContext('2d'),status=host.querySelector('.arena-status'),paused=false;
    var rocks=[{x:100,y:105,w:75,h:40},{x:490,y:90,w:75,h:40},{x:270,y:300,w:100,h:30}];
    function persist(){try{localStorage.setItem(KEY,JSON.stringify(p));}catch(e){}}
    function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
    function blocked(x,y){return rocks.some(function(r){return x>r.x-15&&x<r.x+r.w+15&&y>r.y-18&&y<r.y+r.h+15;});}
    function spawnEnemy(){var side=Math.floor(Math.random()*4),x=side===0?20:side===1?660:20+Math.random()*640,y=side===2?40:side===3?370:45+Math.random()*320;if(blocked(x,y))return;enemies.push({x:x,y:y,hp:1+Math.floor((wave-1)/4),speed:25+Math.min(40,wave*2)});}
    function fire(){if(cool>0||dead||paused)return;cool=.22;var best=null,dist=Infinity;enemies.forEach(function(e){var d=Math.hypot(e.x-hero.x,e.y-hero.y);if(d<dist){dist=d;best=e;}});var dx=best?best.x-hero.x:1,dy=best?best.y-hero.y:0,n=Math.hypot(dx,dy)||1;shots.push({x:hero.x,y:hero.y,dx:dx/n*500,dy:dy/n*500,life:1.7});}
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
      enemies.forEach(function(e){ctx.fillStyle='#7752a5';ctx.beginPath();ctx.arc(e.x,e.y,17,0,Math.PI*2);ctx.fill();rect(e.x-12,e.y-20,6,12,'#b6a0d5');rect(e.x+6,e.y-20,6,12,'#b6a0d5');rect(e.x-8,e.y-5,5,5,'#fff6b5');rect(e.x+4,e.y-5,5,5,'#fff6b5');rect(e.x-7,e.y+8,14,3,'#302040');});
      if(!dead){ctx.save();ctx.translate(hero.x,hero.y);if(hero.hit>0)ctx.globalAlpha=.55;rect(-11,-4,22,25,'#d84d48');rect(-10,20,8,13,'#c9d9e1');rect(3,20,8,13,'#c9d9e1');ctx.fillStyle='#c9d9e1';ctx.beginPath();ctx.ellipse(0,-12,13,17,0,0,Math.PI*2);ctx.fill();rect(-9,-16,6,5,'#fff8a1');rect(4,-16,6,5,'#fff8a1');rect(-2,-29,4,18,'#e34d45');rect(-3,2,6,6,'#61e1ef');ctx.restore();}
      shots.forEach(function(s){ctx.fillStyle='#fff49a';ctx.beginPath();ctx.arc(s.x,s.y,5,0,Math.PI*2);ctx.fill();});
      spark.forEach(function(s){ctx.strokeStyle='rgba(255,240,120,'+s.life+')';ctx.beginPath();ctx.arc(s.x,s.y,25*(1-s.life),0,Math.PI*2);ctx.stroke();});
      if(paused||dead){rect(170,150,340,75,'rgba(0,0,0,.55)');ctx.fillStyle='#fff';ctx.font='22px sans-serif';ctx.textAlign='center';ctx.fillText(paused?'已暂停':'恢复能量中，即将重返场地',340,195);}
      status.textContent='第 '+wave+' 关 · Lv.'+level(p)+' · 经验 '+p.xp+' · 本局击败 '+score+' · 体力 '+hero.hp+'/5 · 下期可选最多 '+Math.min(12,4+2*(level(p)-1))+' 个杀号';
    }
    function tick(time){
      if(stopped)return;if(!host.isConnected){destroy();return;}var parent=host.closest('details');if(parent&&!parent.open){destroy();return;}
      var dt=last?Math.min(.04,(time-last)/1000):0;last=time;
      if(!paused&&!document.hidden){
        cool=Math.max(0,cool-dt);hero.hit=Math.max(0,hero.hit-dt);spawn-=dt;
        if(dead){dead-=dt;if(dead<=0){dead=0;hero.hp=5;hero.x=340;hero.y=230;hero.hit=2;enemies=[];}}
        else{
          var dx=(keys.arrowright||keys.d||held.right?1:0)-(keys.arrowleft||keys.a||held.left?1:0),dy=(keys.arrowdown||keys.s||held.down?1:0)-(keys.arrowup||keys.w||held.up?1:0),n=Math.hypot(dx,dy)||1;
          var nx=clamp(hero.x+dx/n*160*dt,18,662),ny=clamp(hero.y+dy/n*160*dt,80,353);if(!blocked(nx,hero.y))hero.x=nx;if(!blocked(hero.x,ny))hero.y=ny;
          if(keys[' ']||keys.j||held.fire)fire();
          if(spawn<=0&&enemies.length<14){spawn=Math.max(.35,1.1-wave*.035);spawnEnemy();}
          enemies.forEach(function(e){var d=Math.hypot(hero.x-e.x,hero.y-e.y)||1,ex=e.x+(hero.x-e.x)/d*e.speed*dt,ey=e.y+(hero.y-e.y)/d*e.speed*dt;if(!blocked(ex,e.y))e.x=ex;if(!blocked(e.x,ey))e.y=ey;if(d<29&&hero.hit<=0){hero.hp--;hero.hit=1.2;if(hero.hp<=0)dead=2;}});
          shots.forEach(function(s){s.x+=s.dx*dt;s.y+=s.dy*dt;s.life-=dt;enemies.forEach(function(e){if(s.life>0&&e.hp>0&&Math.hypot(s.x-e.x,s.y-e.y)<23){e.hp--;s.life=0;spark.push({x:e.x,y:e.y,life:1});if(e.hp<=0){p.xp+=10;p.kills++;score++;waveKills++;persist();if(waveKills>=4+Math.min(wave,8)){wave++;waveKills=0;}}}});});
          shots=shots.filter(function(s){return s.life>0;});enemies=enemies.filter(function(e){return e.hp>0;});
        }
        spark.forEach(function(s){s.life-=dt*2;});spark=spark.filter(function(s){return s.life>0;});
      }
      paint();frame=requestAnimationFrame(tick);
    }
    function destroy(){stopped=true;cancelAnimationFrame(frame);keys={};held={};if(active===destroy)active=null;}
    active=destroy;frame=requestAnimationFrame(tick);
    return {destroy:destroy,snapshot:function(){return {x:hero.x,y:hero.y,wave:wave,enemies:enemies.length,shots:shots.length,xp:p.xp,paused:paused};}};
  }
  window.MonsterArena={mount:mount,progress:progress,level:function(){return level(progress());}};
})();
