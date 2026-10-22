(function(){
  var card=document.getElementById('roStatusCard');if(!card)return;
  var opener=document.createElement('div');opener.className='status-video-open';opener.setAttribute('role','button');opener.tabIndex=0;opener.setAttribute('aria-label','点击查看好运');opener.innerHTML='<span aria-hidden="true">▶</span><small>点击查看好运</small>';card.appendChild(opener);
  var modal=document.createElement('div');modal.className='status-video-modal';modal.hidden=true;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','祝福视频');
  modal.innerHTML='<div class="status-video-box"><div class="status-video-close" role="button" tabindex="0" aria-label="关闭视频">×</div><video controls playsinline preload="none" loop></video><div class="status-video-message" role="status"></div></div>';
  document.body.appendChild(modal);var video=modal.querySelector('video'),close=modal.querySelector('.status-video-close'),message=modal.querySelector('.status-video-message'),oldOverflow='';
  function shut(){video.pause();modal.hidden=true;document.body.style.overflow=oldOverflow;opener.focus();}
  function show(){oldOverflow=document.body.style.overflow;modal.hidden=false;document.body.style.overflow='hidden';if(!video.getAttribute('src'))video.src='./blessing.mp4';message.textContent='';var play=video.play();if(play&&play.catch)play.catch(function(){message.textContent='点击播放按钮观看视频';});close.focus();}
  function activate(el,fn){el.addEventListener('click',fn);el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();fn();}});}
  activate(opener,show);activate(close,shut);modal.addEventListener('click',function(e){if(e.target===modal)shut();});
  modal.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();shut();}if(e.key==='Tab'){var items=[close,video];if(e.shiftKey&&document.activeElement===close){e.preventDefault();video.focus();}else if(!e.shiftKey&&document.activeElement===video){e.preventDefault();close.focus();}}});
  video.tabIndex=0;video.addEventListener('error',function(){message.textContent='视频暂时无法播放，请稍后重试';});
})();
