/* ============================================================
   icons.js —— 彩种图标（自绘 SVG）
   ------------------------------------------------------------
   说明：这里不使用任何官方 logo 素材（有版权），
   而是按各彩种的官方配色与玩法特征自绘图标。
   造型统一：圆角方形底 + 象征性元素。

   用法：
     HTML 里放 <span class="ico" data-ico="ssq"></span>
     本文件加载后会自动把对应 SVG 填进去。
   ============================================================ */

(function () {
  'use strict';

  /* 每个图标：24x24 视框，圆角方底 + 白色/彩色元素 */
  var ICONS = {

    /* 双色球：红底 + 两颗球（红 + 蓝） */
    ssq:
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<rect x="1" y="1" width="22" height="22" rx="6" fill="#c8102e"/>' +
      '<circle cx="9" cy="10" r="4.2" fill="#fff"/>' +
      '<circle cx="16" cy="15" r="4.2" fill="#1f6fd0"/>' +
      '<circle cx="9" cy="10" r="4.2" fill="none" stroke="#8d0a1f" stroke-width="0.9"/>' +
      '<circle cx="16" cy="15" r="4.2" fill="none" stroke="#134a8c" stroke-width="0.9"/>' +
      '</svg>',

    /* 福彩3D：红底 + 「3D」立体字 */
    fc3d:
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<rect x="1" y="1" width="22" height="22" rx="6" fill="#c8102e"/>' +
      '<text x="12" y="17" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" ' +
      'font-size="11" font-weight="900" fill="#fff" letter-spacing="-0.4">3D</text>' +
      '</svg>',

    /* 七乐彩：红底 + 圆形奖章 + 星 */
    qlc:
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<rect x="1" y="1" width="22" height="22" rx="6" fill="#c8102e"/>' +
      '<circle cx="12" cy="12" r="7.5" fill="none" stroke="#fff" stroke-width="1.6"/>' +
      '<path d="M12 7.6l1.35 2.9 3.15.42-2.3 2.2.58 3.13L12 14.72l-2.78 1.53.58-3.13-2.3-2.2 3.15-.42z" fill="#ffd54a"/>' +
      '</svg>',

    /* 快乐8：红底 + 8 个圆点环绕 */
    kl8:
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<rect x="1" y="1" width="22" height="22" rx="6" fill="#c8102e"/>' +
      '<circle cx="12" cy="6.6" r="1.75" fill="#fff"/>' +
      '<circle cx="16.6" cy="8.5" r="1.75" fill="#ffd54a"/>' +
      '<circle cx="18.4" cy="12" r="1.75" fill="#fff"/>' +
      '<circle cx="16.6" cy="15.5" r="1.75" fill="#ffd54a"/>' +
      '<circle cx="12" cy="17.4" r="1.75" fill="#fff"/>' +
      '<circle cx="7.4" cy="15.5" r="1.75" fill="#ffd54a"/>' +
      '<circle cx="5.6" cy="12" r="1.75" fill="#fff"/>' +
      '<circle cx="7.4" cy="8.5" r="1.75" fill="#ffd54a"/>' +
      '</svg>',

    /* 大乐透：蓝底 + 五颗前区球 + 两颗后区球 */
    dlt:
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<rect x="1" y="1" width="22" height="22" rx="6" fill="#0b5cad"/>' +
      '<circle cx="7" cy="8.5" r="2.1" fill="#fff"/>' +
      '<circle cx="12.5" cy="6.8" r="2.1" fill="#fff"/>' +
      '<circle cx="12.5" cy="13.2" r="2.1" fill="#fff"/>' +
      '<circle cx="7" cy="15.4" r="2.1" fill="#fff"/>' +
      '<circle cx="18" cy="11" r="2.3" fill="#e5484d"/>' +
      '<circle cx="18" cy="17" r="2.3" fill="#e5484d"/>' +
      '</svg>',

    /* 排列3：蓝底 + 三个数字位 */
    pl3:
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<rect x="1" y="1" width="22" height="22" rx="6" fill="#0b5cad"/>' +
      '<rect x="4.2" y="7" width="4.4" height="10" rx="1.4" fill="#fff"/>' +
      '<rect x="9.8" y="7" width="4.4" height="10" rx="1.4" fill="#fff"/>' +
      '<rect x="15.4" y="7" width="4.4" height="10" rx="1.4" fill="#ffd54a"/>' +
      '</svg>',

    /* 排列5：蓝底 + 五个数字位 */
    pl5:
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<rect x="1" y="1" width="22" height="22" rx="6" fill="#0b5cad"/>' +
      '<rect x="3" y="8" width="3.2" height="8" rx="1" fill="#fff"/>' +
      '<rect x="7.2" y="8" width="3.2" height="8" rx="1" fill="#fff"/>' +
      '<rect x="11.4" y="8" width="3.2" height="8" rx="1" fill="#fff"/>' +
      '<rect x="15.6" y="8" width="3.2" height="8" rx="1" fill="#fff"/>' +
      '<rect x="19.8" y="8" width="1.6" height="8" rx="0.8" fill="#ffd54a"/>' +
      '</svg>',

    /* 七星彩：蓝底 + 七颗星 */
    qxc:
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<rect x="1" y="1" width="22" height="22" rx="6" fill="#0b5cad"/>' +
      '<path d="M12 4.6l1.15 2.5 2.7.36-1.97 1.9.5 2.7L12 10.8l-2.38 1.26.5-2.7-1.97-1.9 2.7-.36z" fill="#ffd54a"/>' +
      '<circle cx="6.4" cy="15.6" r="1.5" fill="#fff"/>' +
      '<circle cx="10.2" cy="17.6" r="1.5" fill="#fff"/>' +
      '<circle cx="14.2" cy="17.6" r="1.5" fill="#fff"/>' +
      '<circle cx="17.8" cy="15.4" r="1.5" fill="#fff"/>' +
      '</svg>',

    /* 足球：绿底 + 足球 */
    football:
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<rect x="1" y="1" width="22" height="22" rx="6" fill="#1f8a4c"/>' +
      '<circle cx="12" cy="12" r="7.6" fill="#fff"/>' +
      '<path d="M12 7.2l3.2 2.3-1.2 3.8h-4l-1.2-3.8z" fill="#101418"/>' +
      '<path d="M12 4.4v2.8M5.4 9.2l3.4 2.5M8.2 19.2l2-4.2M15.8 19.2l-2-4.2M18.6 9.2l-3.4 2.5" ' +
      'stroke="#101418" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
      '</svg>',

    /* 资料：灰底 + 文档 */
    data:
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<rect x="1" y="1" width="22" height="22" rx="6" fill="#3a4150"/>' +
      '<rect x="6" y="4.5" width="12" height="15" rx="2" fill="#fff"/>' +
      '<path d="M8.6 9h6.8M8.6 12h6.8M8.6 15h4.2" stroke="#3a4150" stroke-width="1.4" stroke-linecap="round"/>' +
      '</svg>',

    /* 首页：灰底 + 房子 */
    home:
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<rect x="1" y="1" width="22" height="22" rx="6" fill="#3a4150"/>' +
      '<path d="M12 5.4l6.4 5.3v7.3a1 1 0 0 1-1 1h-3.6v-4.6h-3.6V19H6.6a1 1 0 0 1-1-1v-7.3z" fill="#fff"/>' +
      '</svg>',

    /* 智能助手：蓝紫底 + 对话气泡 */
    ai:
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<rect x="1" y="1" width="22" height="22" rx="6" fill="#4b57c8"/>' +
      '<path d="M5.6 7.6a2 2 0 0 1 2-2h8.8a2 2 0 0 1 2 2v5.2a2 2 0 0 1-2 2H10l-3.2 2.6v-2.6h-.2a1 1 0 0 1-1-1z" fill="#fff"/>' +
      '<path d="M8.6 10.2h6.8M8.6 12.6h4.4" stroke="#4b57c8" stroke-width="1.4" stroke-linecap="round"/>' +
      '</svg>'
  };

  /** 把 nav 里所有 data-ico 的占位符填上 SVG */
  function paint(root) {
    var host = root || document;
    var slots = host.querySelectorAll('.ico[data-ico]');
    for (var i = 0; i < slots.length; i++) {
      var el = slots[i];
      var key = el.getAttribute('data-ico');
      if (ICONS[key] && !el.getAttribute('data-painted')) {
        el.innerHTML = ICONS[key];
        el.setAttribute('data-painted', '1');
      }
    }
  }

  // 暴露出去，页面切换后可再调用
  window.paintIcons = paint;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { paint(); });
  } else {
    paint();
  }
})();
