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

  /* 展示顺序 —— 用户要求：「左边福彩 右边体彩，这样号区分」（但不要写"福彩/体彩"字样）。
     两列网格是【按行填充】的，所以要【交错】排：
       第1行 双色球 | 大乐透
       第2行 福彩3D | 排列3
       第3行 七乐彩 | 排列5
       第4行 快乐8  | 七星彩
     → 左列全是福彩（双色球/福彩3D/七乐彩/快乐8）
     → 右列全是体彩（大乐透/排列3/排列5/七星彩）
     ⚠️ 改这个数组时注意：它同时决定「行优先」下的左右分列，
        不要改成「先 4 个福彩再 4 个体彩」的写法（那会变成上福彩下体彩）。 */
  var LATEST_GAME_ORDER = ['ssq', 'dlt', 'fc3d', 'pl3', 'qlc', 'pl5', 'kl8', 'qxc'];

  /** 号码补两位（开奖号显示用） */
  /* 【补零】数字彩（福彩3D/排列3/排列5/七星彩）不补零（0 就是 0）；
     其它彩种补两位（4 → 04）。用户要求：「所有的 0 都是一位数 0」。 */
  var DIGIT_IDS = ['fc3d', 'pl3', 'pl5', 'qxc'];
  function hc2(n, gid) {
    if (DIGIT_IDS.indexOf(gid) >= 0) return String(n);
    return String(n).padStart(2, '0');
  }

  /** 号码数组 → 一排球 HTML */
  function hcBallsHtml(nums, cls, gid) {
    return (nums || []).map(function (n) {
      return '<span class="hc-ball ' + (cls || '') + '">' + hc2(n, gid) + '</span>';
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
        ? '<span class="hc-plus">★</span>' + hcBallsHtml(d.special, 'sp', d.gameId)
        : '';
      var blue = (d.blue || []).length
        ? '<span class="hc-plus">+</span>' + hcBallsHtml(d.blue, 'blue', d.gameId)
        : '';
      return '<div class="hc-drawcard">' +
        '<div class="hc-dt">' +
        '<span class="hc-gn">' + d.gameName + '</span>' +
        '<span class="hc-iss">第 ' + d.issue + ' 期</span>' +
        '<span class="hc-date">' + (d.date || '') + '</span>' +
        '</div>' +
        /* __LATEST_NEXTCD__ 距离下期开奖倒计时（前端算，免费） */
        '<div class="hc-nextcd" data-nextcd="' + d.gameId + '">—</div>' +
        '<div class="hc-balls">' + hcBallsHtml(d.red, 'red', d.gameId) + blue + special + '</div>' +
        '</div>';
    }).join('');

    return '<section class="ro-game" id="' + LATEST_DRAWS_ID + '">' +
      '<div class="ro-gamehead">' +
      '<h2>最新开奖</h2>' +
      '<div class="ro-meta">各彩种最新一期开奖号码</div>' +
      /* 【热力图时间提示】用户要求在这里加一行小字，说明两个彩种的热力图公布时段。 */
      '<div class="ro-meta ro-meta-hm">双色球 18:00-20:00 · 大乐透 18:00-21:00 公布热力图数据</div>' +
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
      /* 页面顶部「最新开奖」用的是刚拉到的新数据；
         draw-data.js 里可能还留着旧的【内存】覆盖（loadDraws 里内存优先），
         清掉才不会盖回去。
         ⚠️ 用户明令不许用 localStorage —— 这里改成调 draw-data.js 的 clearDrawCache()，
            原来是 localStorage.removeItem(DRAW_KEY)。 */
      try {
        if (typeof clearDrawCache === 'function') clearDrawCache();
      } catch (e) { /* 忽略 */ }
    }

    return res;
  }

  /* ============================================================
     【热力图顶掉「最新开奖」】区块里到底放什么 —— 唯一判定处
     ------------------------------------------------------------
     用户 2026-10-15 原话：
       「在开双色球的时候 18 点更新到最新开奖位置覆盖住，过了 20 点
         就更新回来最新开奖；同样大乐透在 18 点更新过去，21 点更新回来。」

     规则（北京时间，仅开奖日当天）：
       双色球（周二 / 周四 / 周日）18:00 ≤ now < 20:00 → 双色球热力图占位
       大乐透（周一 / 周三 / 周六）18:00 ≤ now < 21:00 → 大乐透热力图占位
       其余时刻（含非开奖日）                      → 照旧显示「最新开奖」

     【为什么只判定「占位」不自己算时间】
       时间窗只有一处定义：heatmap-data.js 里的 shouldShowHeatmap()
       （由 build-heatmap.mjs 的 HELPER_SRC 生成，服务端 / 客户端 / App
        三边同一份）。这里只是【问它】在窗口内的彩种是哪一个：
         · 窗口内 + 有当日数据 → 顶掉
         · 数据缺失 / 不在窗口 → 返回 null → 区块照旧显示「最新开奖」
           （绝不留白、绝不出现只有标题条的空热力图）
       两边（服务端预渲染 / 客户端就地重画）调的是同一个函数，
       所以不存在「网页和 App 不一样」那种漂移。

     【开奖日会不会重叠】
       ssq = 周日 / 周二 / 周四（0/2/4），dlt = 周一 / 周三 / 周六（1/3/6）
       → 两个集合【互不相交】，任何一天最多只有一个彩种在窗口内。
       注意：周五两个都不开奖 —— 那一天根本不会出现热力图，一直是最新开奖。
       顺序 ssq → dlt 只是「假如同一天两个都在窗口内」时的兜底优先级：
       取 HEATMAP_BLOCK_ORDER 里第一个通过的彩种（不会出现两张热力图叠加）。
     ============================================================ */
  var HEATMAP_BLOCK_ORDER = ['ssq', 'dlt'];

  /* 【图位属性名集中在这里】—— 与 export-static.mjs 生成推荐图图位、
     以及页尾 renderAll() 的选择器（.ro-imagewrap[data-game]）必须是同一套写法。
     写成常量而不是散在各处的字面量，改名时只需要改这一个地方。 */
  var SLOT_CLASS = 'ro-imagewrap';
  var SLOT_ATTR_GAME = 'data-game';
  var SLOT_ATTR_IMAGE = 'data-image';

  /**
   * 现在该由哪个彩种的热力图顶掉「最新开奖」
   * @param {Date|string|number} [now] 不传就是当前时刻（可被 HEATMAP_NOW_OVERRIDE 定格）
   * @returns {string|null} 彩种 id（'ssq' / 'dlt'）；不该顶掉时返回 null
   */
  function heatmapBlockGameId(now) {
    /* 【用户 2026-10-17 改口径：热力图不再顶掉「最新开奖」】
       原话：「热力图不在最新开奖里面，折叠到（热力图）这里面」——
       所以这里【永远返回 null】：区块永远是最新开奖；
       热力图改到「热力图」入口区块里显示（export-static.mjs 的 #ro-heatmap），
       数据由云端每小时重抓晒票 OCR 更新。
       ⚠️ 服务端预渲染和客户端重画都走这个函数 → 改这一处两边同时生效。 */
    void now;
    return null;
  }

  /* 旧判定保留（不删）：万一以后要恢复「18:00 顶掉」只改上面 return 即可。
     原逻辑：取 HEATMAP_BLOCK_ORDER 里第一个 shouldShowHeatmap() 通过的彩种。 */
  function heatmapBlockGameIdLegacy(now) {
    for (var i = 0; i < HEATMAP_BLOCK_ORDER.length; i++) {
      var gid = HEATMAP_BLOCK_ORDER[i];
      var on = false;
      try {
        on = (typeof shouldShowHeatmap === 'function') && !!shouldShowHeatmap(gid, now);
      } catch (e) { on = false; }
      if (on) return gid;
    }
    return null;
  }

  /**
   * 「最新开奖」区块现在该是什么形态
   * @returns {{mode:string, gameId:string}} mode: 'heatmap' | 'latest'
   */
  function latestBlockMode(now) {
    var gid = heatmapBlockGameId(now);
    return gid ? { mode: 'heatmap', gameId: gid } : { mode: 'latest', gameId: '' };
  }

  /**
   * 热力图顶掉「最新开奖」时的区块 HTML
   * 【结构故意和「最新开奖」区块完全一样】：
   *   同一个 id（LATEST_DRAWS_ID），客户端只认这个 id，
   *   所以「换过去」和「换回来」是同一个替换动作，不会出现找不到节点。
   * 【图位写法和推荐图完全一致】：.ro-imagewrap[data-game][data-image]
   *   → 页尾的实时渲染脚本（renderAll）会自动把它渲染成同一张热力图模板图，
   *     服务端预渲染的那份是它的兜底。
   * @param {string} gid       彩种 id
   * @param {string} innerHtml 预渲染 / 实时渲染出来的热力图内部 HTML
   */
  function latestHeatmapSectionHtml(gid, innerHtml) {
    return '<section class="ro-game" id="' + LATEST_DRAWS_ID + '">' +
      '<div class="' + SLOT_CLASS + '" ' +
      SLOT_ATTR_GAME + '="' + gid + '" ' + SLOT_ATTR_IMAGE + '="heatmap">' +
      (innerHtml || '') +
      '</div>' +
      '</section>';
  }

  /**
   * 区块的最终 HTML —— 服务端预渲染和客户端重画【都走这一个入口】
   * @param {object} o
   *   o.latest      getLatestDraws() / latestDrawsFromRaw() 的结果（最新开奖用）
   *   o.games       GAMES
   *   o.now         可选的时刻（不传 = 当前 / HEATMAP_NOW_OVERRIDE）
   *   o.heatmap     function(gid) → 热力图内部 HTML；不传或返回空串 → 退回「最新开奖」
   * @returns {string} 区块 HTML（生成不出来时返回空串，调用方保持原样、绝不留白）
   */
  function latestBlockHtml(o) {
    var opt = o || {};
    var drawsHtml = latestDrawsHtml(opt.latest, opt.games);

    var mode = latestBlockMode(opt.now);
    if (mode.mode === 'heatmap') {
      var inner = '';
      try {
        inner = (typeof opt.heatmap === 'function') ? (opt.heatmap(mode.gameId) || '') : '';
      } catch (e) { inner = ''; }
      /* 热力图渲染失败（或没有渲染器）→ 退回「最新开奖」，不留空白 */
      if (inner) return latestHeatmapSectionHtml(mode.gameId, inner);
    }

    return drawsHtml;
  }

  /* ---------- 对外暴露（服务端 vm / 浏览器全局） ---------- */
  root.HEATMAP_BLOCK_ORDER = HEATMAP_BLOCK_ORDER;
  root.heatmapBlockGameId = heatmapBlockGameId;
  root.latestBlockMode = latestBlockMode;
  root.latestHeatmapSectionHtml = latestHeatmapSectionHtml;
  root.latestBlockHtml = latestBlockHtml;

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


/* ============================================================
   【距离下期开奖倒计时】__LATEST_NEXTCD__
   ------------------------------------------------------------
   用户要求：「能不能把每期后面搞一个倒计时 距离下期开奖时间倒计时」
   做法：写死一张【开奖时刻 + 开奖日】表（官方常规时间），
         前端每秒算一次「下一个该开奖的时刻」还有多久。
   ⚠️ 纯前端计算，不联网、不调 AI → 免费。
   ⚠️ 时间统一按北京时间（东八区）算，避免用户设备时区不同导致偏差。
   ============================================================ */
var NEXTCD_TABLE = {
  ssq:  { hm: [21, 15], days: [0, 2, 4] },        /* 双色球 周二/四/日 21:15 */
  dlt:  { hm: [20, 30], days: [1, 3, 6] },        /* 大乐透 周一/三/六 20:30 */
  fc3d: { hm: [21, 15], days: [0,1,2,3,4,5,6] },  /* 福彩3D 每天 21:15 */
  pl3:  { hm: [20, 30], days: [0,1,2,3,4,5,6] },  /* 排列3  每天 20:30 */
  pl5:  { hm: [20, 30], days: [0,1,2,3,4,5,6] },  /* 排列5  每天 20:30 */
  qxc:  { hm: [20, 30], days: [0, 2, 5] },        /* 七星彩 周二/五/日 20:30 */
  qlc:  { hm: [21, 15], days: [1, 3, 5] },        /* 七乐彩 周一/三/五 21:15 */
  kl8:  { hm: [21, 30], days: [0,1,2,3,4,5,6] }   /* 快乐8  每天 21:30 */
};

/* 当前北京时间（不依赖设备时区）：用 UTC 加 8 小时 */
function nextcdNow() {
  var t = new Date();
  return new Date(t.getTime() + (t.getTimezoneOffset() * 60000) + (8 * 3600000));
}

/* 算出某个彩种【下一个】开奖时刻（按北京时间） */
function nextcdTarget(gid) {
  var r = NEXTCD_TABLE[gid];
  if (!r) return null;
  var now = nextcdNow();
  for (var i = 0; i < 8; i++) {
    var d = new Date(now.getTime());
    d.setDate(d.getDate() + i);
    d.setHours(r.hm[0], r.hm[1], 0, 0);
    if (r.days.indexOf(d.getDay()) < 0) continue;
    if (d.getTime() > now.getTime()) return d;
  }
  return null;
}

function nextcdText(gid) {
  var t = nextcdTarget(gid);
  if (!t) return '';
  var ms = t.getTime() - nextcdNow().getTime();
  if (ms <= 0) return '即将开奖';
  var s = Math.floor(ms / 1000);
  var dd = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60);
  var ss = s % 60;
  function p(n) { return n < 10 ? '0' + n : String(n); }
  if (dd > 0) return '距下期开奖 ' + dd + ' 天 ' + p(hh) + ':' + p(mm);
  return '距下期开奖 ' + p(hh) + ':' + p(mm) + ':' + p(ss);
}

(function () {
  /* 【每次重新查询元素，不缓存】
     原因：页面的「实时渲染」脚本会重画「最新开奖」区块，
           缓存的元素会被替换掉 → 倒计时变回占位符 "—"。
           每次 draw 都重新 querySelectorAll 就永远跟得上。 */
  function draw() {
    var els = document.querySelectorAll('[data-nextcd]');
    for (var i = 0; i < els.length; i++) {
      var gid = els[i].getAttribute('data-nextcd');
      var txt = nextcdText(gid);
      if (txt) els[i].textContent = txt;
    }
  }
  function boot() {
    draw();
    setInterval(draw, 1000);
    /* 头几秒多画几次：实时渲染可能稍后才把区块重画出来 */
    setTimeout(draw, 200);
    setTimeout(draw, 800);
    setTimeout(draw, 2000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
