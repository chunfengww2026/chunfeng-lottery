/* ============================================================
   latest-draws.js —— 「最新开奖」区块的【唯一】生成逻辑
   ------------------------------------------------------------
   为什么要单独抽一个文件：
     这块 HTML 以前只在服务端由 hit-check.js 的 buildLatestDrawHtml() 生成，
     浏览器里跑不了（hit-check.js 不在分享页的内联脚本里）。
     于是「页面上的开奖号码」只能靠刷新整页才能变。

     现在服务端（export-static.mjs 预渲染兜底）和客户端（分享页拿到
     tickets.json 后就地重渲染）【共用这一个函数】：
       · 服务端：export-static.mjs 里 vm 上下文加载本文件
       · 客户端：export-static.mjs 把本文件内联进分享页
     两边同一份代码 → 不会出现「服务端和客户端写法漂移」的不一致。

   数据格式（与 draws.js 的 DRAW_DATA.games 完全一致）：
     { issue, date, source, areas: { red:[…], blue:[…] } }
     各彩种的区域命名见下面的 latestDrawsPickAreas()。

   用法（服务端）：
     import { drawsFromDrawData } from './export-draws.mjs';
     const draws = drawsFromDrawData();                 // 从 draws.js 取
     const html  = latestDrawsHtml(latestDrawsFromRaw(draws), GAMES);

   用法（客户端）：
     const html = latestDrawsHtml(latestDrawsFromRaw(j.draws), GAMES);
   ============================================================ */
(function (root) {
  'use strict';

  /* 【稳定 id】客户端拿它定位并整体替换这个区块。
     服务端渲染和客户端替换都用这一个常量，改名不会漏改一边。 */
  var LATEST_DRAWS_ID = 'ro-latest';

  /* 展示顺序（和 hit-check.js 的 HC_GAME_ORDER 一致） */
  var LATEST_GAME_ORDER = ['ssq', 'dlt', 'qlc', 'kl8', 'fc3d', 'pl3', 'pl5', 'qxc'];

  /** 号码补两位（开奖号显示用） */
  function hc2(n) {
    return String(n).padStart(2, '0');
  }

  /** 号码数组 → 一排球 HTML */
  function hcBallsHtml(nums, cls) {
    return (nums || []).map(function (n) {
      return '<span class="hc-ball ' + (cls || '') + '">' + hc2(n) + '</span>';
    }).join('');
  }

  /**
   * 各彩种的区域命名 → 统一结构 { red, blue, special }
   * 口径与 hit-check.js 的 hcDrawOf 完全一致：
   *   双色球 red/blue · 大乐透 front/back · 七乐彩 main/special
   *   快乐8/福彩3D/排列3/排列5 main · 七星彩 front/back
   * @param {string} gameId
   * @param {object} item  { areas: {...} }
   */
  function hcDrawOf(gameId, item) {
    var a = (item && item.areas) || {};
    if (!item || !item.areas) return null;

    function pick() {
      for (var i = 0; i < arguments.length; i++) {
        var k = arguments[i];
        if (Array.isArray(a[k]) && a[k].length) return a[k].map(Number);
      }
      return [];
    }

    switch (gameId) {
      case 'ssq': return { red: pick('red'), blue: pick('blue'), special: [] };
      case 'dlt': return { red: pick('front'), blue: pick('back'), special: [] };
      case 'qlc': return { red: pick('main'), blue: [], special: pick('special') };
      case 'kl8': return { red: pick('main'), blue: [], special: [] };
      case 'fc3d':
      case 'pl3':
      case 'pl5': return { red: pick('main'), blue: [], special: [] };
      case 'qxc': return { red: pick('front'), blue: pick('back'), special: [] };
      default: return { red: pick('red', 'front', 'main'), blue: pick('blue', 'back', 'special'), special: pick('special') };
    }
  }

  /**
   * 把 draws 原始数据（{ gameId: { issue,date,areas } }）转成
   * buildLatestDrawHtml 用的展示结构。
   * @param {object} draws  每彩种一条最新开奖（可以是部分彩种、可以是 null）
   * @param {object} [games] GAMES 定义（取彩种中文名），缺省时直接用 gameId
   * @returns {Array}
   */
  function latestDrawsFromRaw(draws, games) {
    var out = [];
    if (!draws || typeof draws !== 'object') return out;

    LATEST_GAME_ORDER.forEach(function (gid) {
      var d = draws[gid];
      if (!d) return;

      /* 兼容两种写法：
         · areas 形式 —— draws.js / tickets.json 里的原始结构
         · 扁平形式   —— 直接把 red/blue/front/back/main/special 放在顶层 */
      var item = d;
      if (!d.areas) {
        var flat = {};
        ['red', 'blue', 'front', 'back', 'main', 'special'].forEach(function (k) {
          if (Array.isArray(d[k]) && d[k].length) flat[k] = d[k];
        });
        item = { issue: d.issue, date: d.date, areas: flat };
      }

      var m = hcDrawOf(gid, item);
      if (!m) return;

      var g = (games && games[gid]) || {};
      out.push({
        gameId: gid,
        gameName: g.name || gid,
        issue: d.issue,
        date: d.date || '',
        red: m.red,
        blue: m.blue,
        special: m.special,
        issuer: g.issuer || ''
      });
    });

    return out;
  }

  /**
   * 生成「最新开奖」区块的完整 HTML
   * （服务端预渲染 和 客户端就地替换 都用它 —— 同一份代码）
   * @param {Array}  latest getLatestDraws() / latestDrawsFromRaw() 的结果
   * @param {object} games  GAMES（当前不用，保留给以后的彩种名兜底）
   * @returns {string} 没有数据时返回空串（调用方自行决定要不要清空区块）
   */
  function latestDrawsHtml(latest, games) {
    var list = (latest || []).filter(function (d) {
      return d && d.issue && Array.isArray(d.red) && d.red.length;
    });
    if (!list.length) return '';

    var cards = list.map(function (d) {
      var special = (d.special || []).length
        ? '<span class="hc-plus">★</span>' + hcBallsHtml(d.special, 'sp')
        : '';
      var blue = (d.blue || []).length
        ? '<span class="hc-plus">+</span>' + hcBallsHtml(d.blue, 'blue')
        : '';
      return '<div class="hc-drawcard">' +
        '<div class="hc-dt">' +
        '<span class="hc-gn">' + d.gameName + '</span>' +
        '<span class="hc-iss">第 ' + d.issue + ' 期</span>' +
        '<span class="hc-date">' + (d.date || '') + '</span>' +
        '</div>' +
        '<div class="hc-balls">' + hcBallsHtml(d.red, 'red') + blue + special + '</div>' +
        '</div>';
    }).join('');

    return '<section class="ro-game" id="' + LATEST_DRAWS_ID + '">' +
      '<div class="ro-gamehead">' +
      '<h2>最新开奖</h2>' +
      '<div class="ro-meta">各彩种最新一期开奖号码</div>' +
      '</div>' +
      '<div class="hc-drawgrid">' + cards + '</div>' +
      '</section>';
  }

  /**
   * 比较两期开奖谁更新（期号优先，期号不可比时退回日期）
   * @returns {boolean} remote 是否比 mine 新
   */
  function latestDrawsNewer(remote, mine) {
    if (!remote || !remote.issue) return false;
    if (!mine || !mine.issue) return true;

    var ri = String(remote.issue).replace(/\D/g, '');
    var mi = String(mine.issue).replace(/\D/g, '');
    if (ri && mi && ri.length === mi.length) return Number(ri) > Number(mi);

    /* 期号长度/格式不同（跨年等）→ 比开奖日期 */
    if (remote.date && mine.date && remote.date !== mine.date) return String(remote.date) > String(mine.date);

    return false;
  }

  /**
   * 把服务器上的 draws 合并进本页内存里的开奖数据
   * ------------------------------------------------------------
   * 【只改属性、不换变量】：
   *   DRAW_DATA 是 draws.js 里的 const，不能整体重新赋值，
   *   所以这里逐彩种改 areas / issue / date（和 saved-tickets.js 同样的思路）。
   * 【只更新有的】：
   *   draws 里缺的彩种保持原样；比本页旧的也不覆盖。
   *
   * @param {object} incoming  tickets.json 里的 draws
   * @param {object} [data]    DRAW_DATA（缺省取全局的同名变量）
   * @returns {{applied:string[], skipped:string[]}}
   */
  function applyRemoteDraws(incoming, data) {
    var res = { applied: [], skipped: [] };
    if (!incoming || typeof incoming !== 'object') return res;

    var target = data;
    if (!target) {
      try { target = (typeof DRAW_DATA !== 'undefined') ? DRAW_DATA : null; } catch (e) { target = null; }
    }
    if (!target) return res;
    if (!target.games || typeof target.games !== 'object') target.games = {};

    LATEST_GAME_ORDER.forEach(function (gid) {
      var r = incoming[gid];
      if (!r || !r.areas) { if (r) res.skipped.push(gid); return; }

      var cur = target.games[gid];
      if (!latestDrawsNewer(r, cur)) { res.skipped.push(gid); return; }

      var next = cur || {};
      next.issue = r.issue;
      next.date = r.date || next.date || '';
      if (r.source) next.source = r.source;
      next.areas = r.areas;              /* 换掉这一层就行 —— loadDraws 每次现读 */

      target.games[gid] = next;
      res.applied.push(gid);
    });

    if (res.applied.length) {
      /* 页面顶部「最新开奖」用的是内存数据；本机 localStorage 里可能存着
         更旧的手动录入开奖号（loadDraws 里本地优先），清掉才不会盖回去 */
      try {
        if (typeof localStorage !== 'undefined' && localStorage) localStorage.removeItem(DRAW_KEY);
      } catch (e) { /* 忽略 */ }
    }

    return res;
  }

  /* ---------- 对外暴露（服务端 vm / 浏览器全局） ---------- */
  root.LATEST_DRAWS_ID = LATEST_DRAWS_ID;
  root.LATEST_GAME_ORDER = LATEST_GAME_ORDER;
  root.hc2 = hc2;
  root.hcBallsHtml = hcBallsHtml;
  root.hcDrawOf = hcDrawOf;
  root.latestDrawsFromRaw = latestDrawsFromRaw;
  root.latestDrawsHtml = latestDrawsHtml;
  root.latestDrawsNewer = latestDrawsNewer;
  root.applyRemoteDraws = applyRemoteDraws;
})(typeof globalThis !== 'undefined' ? globalThis : this);
