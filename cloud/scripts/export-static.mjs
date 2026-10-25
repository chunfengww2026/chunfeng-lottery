/* ============================================================
   ⛔ 铁律（2026-10-18 · 用户明确要求 · 改这个文件的人/助手都适用）
   不要动模板：不删区块、不加区块、不挪位置、不隐藏区块、
   不改列数/顺序/间距/字号/配色/文案。
   没数据时在【原有结构内】写"暂无"，不允许整块消失。
   只填数据、只修用户点名的 bug；要改结构先弹窗问用户。
   详细版：根目录 AGENTS.md
   ============================================================ */

// ============================================================
//  export-static.mjs —— 生成只读分享版 HTML
//
//  产物：只读分享版.html —— 一个自包含文件（样式+内容全内嵌）
//  特点：
//    · 没有任何按钮、输入框，对方只能看
//    · 每个彩种一段长内容（推荐图），手机上一路滑到底
//    · 不依赖任何外部文件，发微信/QQ 点开就能看
//
//  用法：node export-static.mjs
// ============================================================

import fs from 'node:fs';
import { cachedVerdict } from './verify-ticket.mjs';
import path from 'node:path';
import vm from 'node:vm';
/* ===== 大乐透后区 6 码（用户 2026-10-19 要求 · 读 _back6.json，不再解析 history.js）===== */
function dltBack6Html() {
  try {
    const f = path.join(path.dirname(fileURLToPath(import.meta.url)), '_back6.json');
    if (!fs.existsSync(f)) return '';
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const six = (d.nums || []).map(Number).sort(function (a, b) { return a - b; }).slice(0, 6);
    if (six.length !== 6) return '';
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return '<div class="ro-back6" id="ro-back6">' +
      '<span class="ro-back6-k">后区推荐 6 码</span>' +
      six.map(function (n) { return '<i>' + pad(n) + '</i>'; }).join('') +
      '<span class="ro-back6-s">仅供统计参考</span>' +
      '</div>';
  } catch (e) { return ''; }
}


/* 【BACK6 已删 · 用户 2026-10-19「这条不要了 / 整条删掉」】
   状态卡里原来有一条 BACK6 播报（大乐透后区那 6 个号 + 一行说明），
   由 '' 在构建期算出来插进去，现已整条移除，不换成别的：
   函数 '' 删除、两处调用点（statusHtml 的 ok / warn 两个分支）删除。
   中奖播报（__MQ_TICKER__ / buildHitMarquee）不受影响，一条没动。 */

import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
/* 【设备门 + PWA】共用模块（不写 localStorage、不用裸 button、不含任何出处字样）：
     · 设备门：本机 / ?admin=1 / 手机平板 → 放行；电脑浏览器 / 电脑微信 → 拦
     · PWA：manifest.json + theme-color + 「📱 一键桌面」
   ⚠️ 新模块必须同步进 cloud/sync-cloud.mjs 的 FROM_ROOT，否则云端构建找不到它。 */
import {
  PWA_HEAD, DEVICE_GATE_CSS, DEVICE_GATE_BODY, INSTALL_CSS, INSTALL_HTML, INSTALL_JS,
  CHAT_CSS, CHAT_HTML, CHAT_JS, metaItemprop,
  CHAT_VIDEO_CSS, CHAT_VIDEO_HTML, CHAT_VIDEO_JS
} from './device-gate.mjs';
/* 【祝福视频】用户 2026-10-18：把「火山方舟.mp4」放进分享页聊天框顶部。
   device-gate.mjs 里留了一个 <!-- __CF_VIDEO_SLOT__ --> 占位：
     · 分享页（这里）→ 换成真正的视频区，并且给面板补 .cf-video-on（允许更高一点）
     · 足球页 / 比赛详情页 → 不替换，占位保持注释 → 零变化、也不会去请求 blessing.mp4
   ⚠️ 视频 2.82 MB 必须懒加载（preload="none" + 聊天框第一次打开才 load()），
      所以 blessing.mp4 不在首屏请求里；但它【必须】同步进发布名单
      （cloud/sync-cloud.mjs 的 FROM_ROOT + workflow 的 site/ 拷贝），漏了就线上 404。 */
const CHAT_HTML_SHARE = CHAT_HTML.replace(/<!-- __CF_VIDEO_SLOT__[\s\S]*?-->/, '');
const CHAT_JS_SHARE = CHAT_JS + '<script>' + fs.readFileSync(new URL('./status-video.js',import.meta.url),'utf8') + '</script>';
import * as P3D_SECTION_MOD from './p3d-section.mjs';
/* 【走势图 · 内联片段】用户 2026-10-17：
     「留在近30期走势预选参考里面. 删除单独走势图独立页」
   → 走势图不再有独立 HTML 文件；样式 / 表格 / 脚本由 build-trend.mjs
     导出成一个片段（方式 A：片段导出），在这里插进
     <details class="ro-trend">（「走势图 / 近 30 期走势 · 预选参考」）里。
   ⚠️ 不走 iframe、不读任何产物文件 → 只跑 export-static.mjs 一个就够，
      没有"先跑 build-trend 再跑 export-static"的顺序依赖。
   ⚠️ 片段自带的作用域前缀是 .ro-trend-embed（样式全部收在里面），
      根节点 id 是 ro-trend-root（不和分享页的 id 撞名）。 */
import {
  loadHistory as loadTrendHistory,
  buildPayload as buildTrendPayload,
  renderTrendFragment,
  TREND_PERIODS
} from './build-trend.mjs';
/* 数据源留痕断言（3 个生成脚本共用一份，见 source-guard.mjs） */
import { assertNoSourceTrace, removeSourceWords } from './source-guard.mjs';

/* ============================================================
   VIP_FREE_TAG 「（本网页免费）」尾巴（用户 2026-10-18）
   ------------------------------------------------------------
   用户原话：「VIP趋势后面加内容：（本网页免费）」
             「vip规则后面加：（本网页免费）」
   为什么要加：用户不想让人以为要付费 ——「免费查看」那个小标签原来只标在
   「基础趋势」上，三条 VIP 横条（趋势 / 规律 / 规则）看着像要收费的。
   做法：在这里【只定义一次】，三处横条都用 ${VIP_FREE_TAG} 拼进去 ——
        以后再加子页面 / 再加 VIP 横条，只需要拼这个常量，不会再漏。
   ⚠️ 这是构建期常量（拼进页面里的内联脚本），不是运行时的全局变量，
      所以三处不管在哪个函数里都拿得到。
   ============================================================ */
const VIP_FREE_TAG = '<span class="tq-vip-free">（本网页免费）</span>';


/* 【性能优化】用户 2026-10-17：「网页和桌面顺畅一点」。
   ① 所有 <img> 补 loading="lazy" + decoding="async"（首屏不用等 226 张图）
   ② 长页面加 content-visibility:auto（推荐图那 8～10 段先不渲染，滚到才渲染）
      ⚠️ 只加在 .ro-game（推荐图分节）上 —— 走势图要 JS 量坐标，不能跳过渲染。 */

/* __RE_SINA__ 下一期参考（媒体预测汇总）：读 sina-predict.json，没有文件就整块不显示 */

/* __AI_CANDS__ 构建时算好三套号码（冷号回补 / 热号延续 / 均衡分布）。
   为什么在构建时算：页面里的 GAMES 是对象、取数函数按数组写，前端取数对不上（查了三轮没通）。
   在 Node 里我能直接拿到 GAMES.ssq.areas 和真实历史，算完注入常量，前端只负责随机取一套。 */
function buildAiCandidates() {
  try {
    const gctx = { console, window: {} }; vm.createContext(gctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'games.js'), 'utf8') + '\n;__G__=GAMES;', gctx);
    const GAMESOBJ = gctx.__G__ || {};
    const hctx = { console, window: {} }; vm.createContext(hctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'history.js'), 'utf8') + '\n;__H__=DRAW_HISTORY;', hctx);
    const HIST = (hctx.__H__ && hctx.__H__.games) || {};
    const out = {};
    Object.keys(GAMESOBJ).forEach(function (gid) {
      const g = GAMESOBJ[gid];
      if (!g || !Array.isArray(g.areas)) return;
      const draws = Array.isArray(HIST[gid]) ? HIST[gid] : [];
      const areas = [];
      g.areas.forEach(function (cfg) {
        const pick = cfg.pick || 1;
        if (g.type === 'digit' || g.type === 'qxc') return;   /* 位数型不套算法 */
        const freq = {}, lastSeen = {};
        for (let v = cfg.from; v <= cfg.to; v++) { freq[v] = 0; lastSeen[v] = 999; }
        for (let d = 0; d < Math.min(draws.length, 30); d++) {
          const ns = (draws[d] && draws[d].areas && draws[d].areas[cfg.key]) || [];
          for (let k = 0; k < ns.length; k++) {
            const n = Number(ns[k]);
            if (freq[n] != null) { freq[n]++; if (lastSeen[n] === 999) lastSeen[n] = d; }
          }
        }
        const all = [];
        for (let v = cfg.from; v <= cfg.to; v++) all.push(v);
        const take = function (arr, count) {
          const seen = {}, res = [];
          for (let q = 0; q < arr.length && res.length < count; q++) { const x = arr[q]; if (!seen[x]) { seen[x] = 1; res.push(x); } }
          return res.sort(function (a, b) { return a - b; });
        };
        const cold = all.slice().sort(function (a, b) { return (freq[a] - freq[b]) || (lastSeen[b] - lastSeen[a]) || (a - b); });
        const hot = all.slice().sort(function (a, b) { return (freq[b] - freq[a]) || (a - b); });
        /* 均衡分布：把号码区间等分成 pick 段，每段取一个（段内优先取出现次数最少的），
           这样号码自然分散在全区间，不会像"取中位数"那样挤成一串连号（踩过）。 */
        const span = cfg.to - cfg.from + 1;
        const mixed = [];
        for (let bi = 0; bi < pick; bi++) {
          const lo = cfg.from + Math.floor(bi * span / pick);
          const hi = Math.min(cfg.to, cfg.from + Math.floor((bi + 1) * span / pick) - 1);
          const seg = all.filter(function (v) { return v >= lo && v <= hi; });
          if (!seg.length) continue;
          seg.sort(function (a, b) { return (freq[a] - freq[b]) || (a - b); });
          mixed.push(seg[0]);
        }
        areas.push({
          key: cfg.key, label: cfg.label || '', pick: pick,
          cands: [
            { algo: '冷号回补', nums: take(cold, pick) },
            { algo: '热号延续', nums: take(hot, pick) },
            { algo: '均衡分布', nums: take(mixed, pick) }
          ].filter(function (c) { return c.nums.length === pick; })
        });
      });
      if (areas.length) out[gid] = areas;
    });
    return out;
  } catch (e) { return {}; }
}

function sinaNextHtml() {
  try {
    const p = path.join(SCRIPT_DIR, 'sina-predict.json');
    if (!fs.existsSync(p)) return '';
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const rows = Array.isArray(d.rows) ? d.rows.filter((r) => r && (r.front || []).length >= 3) : [];
    if (!rows.length) return '';
    const items = rows.slice(0, 6).map((r) =>
      '<div class="sx-row"><span class="sx-t">' + escape(String(r.title || '').replace(/^\d+期/, '').slice(0, 22)) + '</span>' +
      '<span class="sx-f">前 ' + escape((r.front || []).join(' ')) + '</span>' +
      '<span class="sx-b">后 ' + escape((r.back || []).join(' ')) + '</span></div>').join('');
    return '<details class="sx-box" open><summary class="sx-head">' +
      '<span class="sx-title">下一期参考</span>' +
      '<span class="sx-cnt">' + escape(String(d.issueShort || '')) + ' 期 · ' + rows.length + ' 篇</span>' +
      '<span class="sx-tip" aria-hidden="true"></span></summary>' +
      '<div class="sx-note">媒体公开预测的汇总，仅供参考；彩票有风险，理性投注。</div>' +
      '<div class="sx-list">' + items + '</div></details>';
  } catch (e) { return ''; }
}
function perfify(html) {
  let s = String(html);
  s = s.replace(/<img\b([^>]*)>/g, (all, attrs) => {
    let a = attrs || '';
    if (!/\bloading=/.test(a)) a += ' loading="lazy"';
    if (!/\bdecoding=/.test(a)) a += ' decoding="async"';
    return '<img' + a + '>';
  });
  if (!/content-visibility/.test(s)) {
    s = s.replace(/<\/style>/,
      '.ro-game{content-visibility:auto;contain-intrinsic-size:auto 900px;}\n</style>');
  }
  return s;
}

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const USER_METHOD_SNAPSHOT=require('./user-method-results.cjs').buildUserMethodResults(ROOT);
const P3D_SECTION_CSS = P3D_SECTION_MOD.P3D_CSS;
const OUT = path.join(ROOT, '只读分享版.html');

/* ============================================================
   【🔥 人气数字 · 构建时写死】用户 2026-10-20：
     「卜蒜子能不能永远都呈现 就算我电脑关机了」→ 选 A：
     云端构建时（10 分钟一班）取一次数，写进页面（静态数字），
     取不到就用上一次的数 → 永远有数，最多旧 10 分钟。
   · 数字来自同目录的 busuanzi.json（由 fetch-busuanzi.mjs 抓）；
     云端每班重抓一次，抓不到就【保留上一次的数】不覆盖。
   · 这里读出来，【直接写进 HTML 里那个 span 的正文】——
     页面不用等不蒜子的服务器就已经有数字，不会再出现「🔥 --」。
   · 不蒜子的 <script> 依然保留：它要是取到新值，会把静态数字覆盖成最新的。
   · 文件缺失 / 读坏 / 数字不合法 → 退回原来的 '--'（老行为）。
     ⚠️ 绝不在这里编一个数字出来（用户铁律：绝不编数字）。
   ⚠️ 这段不能往生成出来的 HTML 里写 "busuanzi" 这个词：
      保护标记要求页面里 busuanzi 恰好 5 处（span id 1 + 脚本 src 3 + getElementById 1）。
   ============================================================ */
const BZ_CACHE = (()=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,'busuanzi.json'),'utf8'));}catch(e){return {};}})();
const BZ_UPDATED = String(BZ_CACHE.updated||'');
if(path.basename(ROOT)==='scripts'&&path.basename(path.dirname(ROOT))==='cloud'){
  const pubDir=path.join(path.dirname(ROOT),'out');fs.mkdirSync(pubDir,{recursive:true});
  if(Number.isFinite(Number(BZ_CACHE.uv))&&BZ_CACHE.uv!==null&&BZ_CACHE.uv!==undefined)fs.writeFileSync(path.join(pubDir,'visitor-count.json'),JSON.stringify({uv:Number(BZ_CACHE.uv),updated:BZ_UPDATED,source:"legacy-ibruce",retired:true}),'utf8');
}
const BZ_UV = (function () {
  try {
    const f = path.join(ROOT, 'busuanzi.json');
    if (!fs.existsSync(f)) return '--';
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const n = Number(d && d.uv);
    /* 只认非负整数：0 也算有效数（新站 UV 真的可能是 0），非法就退回 '--' */
    if (!Number.isFinite(n) || n < 0) return '--';
    return String(Math.floor(n));
  } catch (e) { return '--'; }
})();

/* ============================================================
   最小 DOM（用于在 Node 里跑渲染器）
   ============================================================ */
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attrs = {};
    this._text = '';
    this._html = null;
    this.className = '';
    this.dataset = {};
    // style 需要同时支持 cssText 和逐个属性赋值（渲染器用的是 gridTemplateColumns = '...'）
    const self = this;
    this.style = new Proxy({ cssText: '' }, {
      set(t, k, v) {
        t[k] = v;
        // 把驼峰属性同步进 cssText，避免导出时丢失
        if (k !== 'cssText' && k !== 'setProperty') {
          const kebab = String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
          const cur = t.cssText || '';
          const re = new RegExp(`(^|;)\\s*${kebab}\\s*:[^;]*`, 'i');
          if (re.test(cur)) t.cssText = cur.replace(re, `$1 ${kebab}:${v}`);
          else t.cssText = (cur ? cur.replace(/;?\s*$/, ';') : '') + `${kebab}:${v}`;
        }
        return true;
      },
      get(t, k) {
        if (k === 'setProperty') {
          return (name, val) => {
            const kebab = String(name);
            const cur = t.cssText || '';
            const re = new RegExp(`(^|;)\\s*${kebab}\\s*:[^;]*`, 'i');
            if (re.test(cur)) t.cssText = cur.replace(re, `$1 ${kebab}:${val}`);
            else t.cssText = (cur ? cur.replace(/;?\s*$/, ';') : '') + `${kebab}:${val}`;
          };
        }
        if (k === 'getPropertyValue') {
          return (name) => {
            const m = new RegExp(`${name}\\s*:\\s*([^;]+)`, 'i').exec(t.cssText || '');
            return m ? m[1].trim() : '';
          };
        }
        return t[k];
      }
    });
  }
  set textContent(v) { this._text = String(v); this.children = []; this._html = null; }
  get textContent() {
    if (this._html) return this._html.replace(/<[^>]*>/g, '');
    return this._text || this.children.map((c) => c.textContent || '').join('');
  }
  set innerHTML(v) { this._html = String(v); this.children = []; this._text = ''; }
  get innerHTML() { return this._html !== null ? this._html : ''; }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute(k, v) {
    this.attrs[k] = v;
    // 渲染器可能用 setAttribute('style', ...) 
    if (String(k).toLowerCase() === 'style') this.style.cssText = String(v);
  }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { width: 760, height: 100, left: 0, top: 0 }; }
}

const doc = {
  createElement: (t) => new El(t),
  createTextNode: (t) => { const e = new El('#text'); e.textContent = t; return e; },
  addEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => []
};

const store = new Map();
const ctx = vm.createContext({
  console, Math, Map, Set, Array, Object, String, Number, JSON, Date,
  parseInt, parseFloat, isNaN, Uint32Array, RegExp, Error, Infinity,
  document: doc,
  USER_METHOD_RESULTS: USER_METHOD_SNAPSHOT,
  window: { addEventListener: () => {}, crypto: globalThis.crypto },
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  Image: function () {}, ClipboardItem: function () {}, alert: () => {}, confirm: () => true,
  /* __TIMER_STUB__ 【重要】沙箱里必须有定时器桩。
     latest-draws.js 末尾的「距下期开奖倒计时」用了 setInterval / setTimeout，
     服务端预渲染时在 vm 里跑同一份文件 —— 少了这些就会
     「❌ 加载 latest-draws.js 失败：setInterval is not defined」，
     导致最新开奖区（含 8 个彩种的 data-nextcd 占位）内联不完整。
     这里给成 no-op 桩即可：预渲染只需要"能跑过去"，不需要真的定时。 */
  setInterval: () => 0, clearInterval: () => {},
  setTimeout: () => 0, clearTimeout: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  queueMicrotask: (fn) => { try { fn(); } catch (e) {} },
  addEventListener: () => {}, removeEventListener: () => {}
});

/* ---------- 加载全部依赖 ---------- */
const FILES = ['games.js', 'draws.js', 'history.js', 'draw-data.js', 'algo.js',
               'stats.js', 'templates.js', 'experts-data.js', 'expert-pool.js',
               'ticket-store.js', 'saved-tickets.js',
               'render.js', 'prize-data.js',
               /* 【最新开奖】区块的生成函数（hcDrawOf / latestDrawsHtml /
                  applyRemoteDraws…）—— 分享页内联的是同一份文件，
                  所以服务端预渲染和客户端就地更新用的是同一个函数。
                  必须排在 hit-check.js 之前：buildLatestDrawHtml 直接调它。 */
               'latest-draws.js', 'hit-check.js',
               'materials-data.js', 'data-store.js',
               /* 【热力图】按天出的实票统计图靠它取数；文件缺失时
                  shouldShowHeatmap 不存在 → 热力图自动不出，其余图不受影响 */
               'heatmap-data.js',
               /* 【文章参考】文章列表数据（build-articles.mjs 每 30 分钟抓一次）。
                  文件缺失时只打印一行「缺少」，页面显示「本期暂无」——
                  绝不能因为这个文件不在就让整页生成失败。
                  ⚠️ 只在服务端预渲染时读；不放进 INLINE_JS，
                     所以页面里不会出现原始链接文本（渲染时会做实体处理）。 */
               'articles-data.js',
               /* 【开机号 / 选号直播】数据（build-kjh.mjs 每天 2 点抓一次）。
                  和上面两个一样：文件缺失只打印一行「缺少」，
                  页面显示「暂无」，绝不能因为这个文件不在就让整页生成失败。
                  ⚠️ 只在服务端预渲染时读；不放进 INLINE_JS ——
                     页面里只有链接标签，没有任何图片，
                     所以这份数据（纯文字）不会产生新的图位。 */
               'kjh-data.js',
                /* 【晒票栏】图片数据（build-xysp.mjs 每 30 分钟抓一次，
                   只保留最近 24 小时内抓到的条目）。
                   和上面几个一样：文件缺失只打印一行「缺少」，
                   晒票栏显示「暂无」，绝不能因为这个文件不在就让整页生成失败。
                   ⚠️ 只在服务端预渲染时读；不放进 INLINE_JS。
                      里面全是【图床外链 URL】，页面里不存图片本体，
                      所以图片不会把页面撑大（外链引用）。
                      这里也【不用】图位属性 —— 晒票栏的图不占推荐图的
                      图位数量，页面上的图位总数必须保持不变。 */
                'xysp-data.js'];

for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.log(`  ⚠️ 缺少 ${f}`); continue; }
  try {
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  } catch (e) {
    console.log(`  ❌ 加载 ${f} 失败：${e.message}`);
  }
}

/* ---------- 调试用：把「现在」定格到某个时刻 ----------
   HEATMAP_NOW=2026-10-15T18:30 时，热力图的时间判断会按这个时刻算 ——
   方便在非开奖日 / 18:00 前验证「该出的时候真的出、不该出的时候真的不出」。
   不设这个环境变量就是真实时间。 */
if (process.env.HEATMAP_NOW) {
  try {
    vm.runInContext('globalThis.HEATMAP_NOW_OVERRIDE = ' + JSON.stringify(process.env.HEATMAP_NOW) + ';', ctx);
    console.log(`  · 热力图时间已定格：HEATMAP_NOW=${process.env.HEATMAP_NOW}`);
  } catch (e) { console.log('  ⚠️ HEATMAP_NOW 设置失败：' + e.message); }
}

/* ---------- 调试：确认关键函数是否真的注入成功 ---------- */
try {
  const probe = vm.runInContext(
    'JSON.stringify({' +
    '  hit: typeof buildHitSectionHtml,' +
    '  css: typeof hitSectionCss,' +
    '  latest: typeof getLatestDraws,' +
    '  check: typeof checkAllHits,' +
    '  tpl: typeof TEMPLATES,' +
    '  games: typeof GAMES' +
    '})', ctx);
  console.log('  · 依赖检测：' + probe);
} catch (e) {
  console.log('  ❌ 依赖检测失败：' + e.message);
}

vm.runInContext(`
  globalThis.__T = TEMPLATES;
  globalThis.__G = GAMES;
  globalThis.__GROUPS = GROUPS;
  globalThis.__render = renderTicketImage;
  globalThis.__resolve = resolveTemplateValues;
  globalThis.__getDraw = getDraw;
  globalThis.__nextIssue = nextIssueFor;
  globalThis.__nextDate = nextDrawDate;
  globalThis.__nextWeek = nextDrawWeekday;
  globalThis.__getTicket = getTicket;
  /* 七星彩定位纠偏（stats.js）—— 分享页生成时手动/自动合并之后再验一次 */
  globalThis.__qxcFix = (typeof enforceQxcPosDistinct === 'function') ? enforceQxcPosDistinct : null;
  globalThis.__rolesOf = (typeof fieldRolesOf === 'function') ? fieldRolesOf : null;
  globalThis.__shouldShowHeatmap = (typeof shouldShowHeatmap === 'function') ? shouldShowHeatmap : null;
  globalThis.__heatmapData = (typeof HEATMAP_DATA !== 'undefined') ? HEATMAP_DATA : null;
  /* 【热力图顶掉「最新开奖」】的三个共享函数（全部来自 latest-draws.js）——
     服务端预渲染和客户端就地重画用的是同一份，不会有第二套判断。 */
  globalThis.__latestBlockMode = (typeof latestBlockMode === 'function') ? latestBlockMode : null;
  globalThis.__latestBlockHtml = (typeof latestBlockHtml === 'function') ? latestBlockHtml : null;
  globalThis.__latestHeatmapSectionHtml = (typeof latestHeatmapSectionHtml === 'function') ? latestHeatmapSectionHtml : null;
  /* 【最新开奖】区块的稳定 id（来自 latest-draws.js）—— 客户端靠它定位替换 */
  globalThis.__latestDrawsId = (typeof LATEST_DRAWS_ID !== 'undefined') ? LATEST_DRAWS_ID : 'ro-latest';
  /* 【文章参考】区块的数据（来自 articles-data.js，build-articles.mjs 生成）。
     没有这个文件时是 null → 页面出「本期暂无」，不影响别的区块。 */
  globalThis.__articles = (typeof ARTICLES_DATA !== 'undefined') ? ARTICLES_DATA : null;
  /* 【开机号 / 选号直播】的数据（来自 kjh-data.js，build-kjh.mjs 每天 2 点生成）。
     没有这个文件时是 null → 页面出「暂无」，不影响别的区块。 */
  globalThis.__kjh = (typeof KJH_DATA !== 'undefined') ? KJH_DATA : null;
  /* 【晒票栏】的数据（来自 xysp-data.js，build-xysp.mjs 每 30 分钟抓一次、
      只保留 24 小时内的条目）。没有这个文件时是 null → 晒票栏显示「暂无」，
      不影响别的区块。 */
  globalThis.__xysp = (typeof XYSP_DATA !== 'undefined') ? XYSP_DATA : null;
  /* 【专家推荐】区块的数据（来自 experts-data.js，build-experts.mjs 生成）。
     ⚠️ 它是 const 声明 —— const 是词法绑定，跑完不会出现在 ctx 上，
        所以必须像这样显式挂到 globalThis 再取，别在主模块里直接引用。
     没有这个文件时是 null → 专家推荐整块不渲染（不显示空壳）。 */
  globalThis.__experts = (typeof EXPERTS_DATA !== 'undefined') ? EXPERTS_DATA : null;
  /* 【3D/排列三 手绘参考图】要用开奖历史（history.js 里的 DRAW_HISTORY）。
     它同样是 const 声明，所以照上面的办法显式挂到 globalThis 再取。
     取不到时是 null → 该区块整块不渲染（不显示空壳、更不放假数据）。 */
  globalThis.__hist = (typeof DRAW_HISTORY !== 'undefined') ? DRAW_HISTORY : null;
  /* __ZX_CARDS__ 【智讯】卡要写「今天 / 明天几点开奖」——开场时刻表直接用
     latest-draws.js 里那张 NEXTCD_TABLE（页面倒计时用的同一张），
     不另写第二套时间，改一处就够。取不到时是 null → 卡里退回内置兜底表。 */
  globalThis.__nextcdTable = (typeof NEXTCD_TABLE !== 'undefined') ? NEXTCD_TABLE : null;
`, ctx);

const T = ctx.__T, G = ctx.__G, GROUPS = ctx.__GROUPS;
const render = ctx.__render, resolve = ctx.__resolve;
const getDraw = ctx.__getDraw, nextIssue = ctx.__nextIssue;
const nextDate = ctx.__nextDate, nextWeek = ctx.__nextWeek;
const getTicket = ctx.__getTicket;
/* 七星彩定位纠偏（stats.js 里的两个函数，见 fixQxcPositions） */
const qxcFixFn = ctx.__qxcFix, rolesOfFn = ctx.__rolesOf;
const shouldShowHeatmap = ctx.__shouldShowHeatmap;
const HEATMAP = ctx.__heatmapData;
const latestBlockMode = ctx.__latestBlockMode;
const latestBlockHtmlFn = ctx.__latestBlockHtml;
const latestHeatmapSectionHtml = ctx.__latestHeatmapSectionHtml;
const LATEST_DRAWS_ID = ctx.__latestDrawsId || 'ro-latest';
/* 【文章参考】数据（articles-data.js；缺失时为 null） */
const ARTICLES = ctx.__articles;
/* 【开机号 / 选号直播】数据（kjh-data.js；缺失时为 null） */
const KJH = ctx.__kjh;
/* 【晒票栏】数据（xysp-data.js；缺失时为 null → 显示「暂无」） */
const XYSP = ctx.__xysp;
/* 【专家推荐】数据（experts-data.js；缺失时为 null → 整块不渲染） */
const EXPERTS = ctx.__experts;
/* 【开奖历史】（history.js）—— 3D/排列三 手绘参考图要用 */
const HIST = ctx.__hist;
/* 【开奖时刻表】（latest-draws.js 的 NEXTCD_TABLE）—— 智讯卡写「几点开奖」要用 */
const NEXTCD = ctx.__nextcdTable;

/* ============================================================
   __PICK_GUARD__ 「每一期号码必须和上一期不一样」硬校验 + 加盐重摇
   ------------------------------------------------------------
   用户原话（两轮，逐字）：
     ①「每一期保证和上一期不一样」「所以这一期重新摇」
     ②「虽然有算法 但是推荐号码要保证每期不一样 怎么都要修改几个」
   实现全在 pick-guard.js（阈值表 + 加盐重摇 + 失败日志），这里只写两件小事：
     ① 上期期号怎么算（下面 prevIssueOf）
     ② 每个生成器怎么把「盐」接进自己的种子（gen(salt)）
   ⚠️ 盐 = 固定字符串 '|v2' / '|v3' …（由第几次尝试决定），不是 Math.random、
      不是时间戳 → 同一期每次构建得到同一组号，完全可复现。
   ⚠️ 上一期取不到（首次构建 / 历史只有一期）→ prevIssueOf 返回 ''，
      prevGen 返回 null → 校验自动跳过，不报错。
   ============================================================ */
const pickGuard = require(path.join(ROOT, 'pick-guard.js'));

/* 期号 ±1（保持原格式；跨年按 400 期封顶，和 draw-data.js 的 nextIssue 同一口径） */
function issueShift(issue, delta) {
  const s = String(issue || '').trim();
  if (!/^\d{5,8}$/.test(s)) return '';
  const yLen = s.length >= 7 ? 4 : 2;
  const y = parseInt(s.slice(0, yLen), 10);
  const seqRaw = s.slice(yLen);
  let seq = parseInt(seqRaw, 10) + (Number(delta) || 0);
  let ny = y;
  while (seq > 400) { seq -= 400; ny += 1; }
  while (seq < 1) { seq += 400; ny -= 1; }
  const ys = yLen === 4 ? String(ny).padStart(4, '0') : String(((ny % 100) + 100) % 100).padStart(2, '0');
  return ys + String(seq).padStart(seqRaw.length, '0');
}
function issueMinus1(issue) { return issueShift(issue, -1); }
/* 上期期号：优先用「上一期已开奖 +1」（同一口径，跳期也不会错），
   拿不到就按本期期号 -1。取不到返回 ''（= 跳过校验）。 */
function prevIssueOf(gid, cur) {
  try {
    const arr = (HIST && HIST.games && Array.isArray(HIST.games[gid])) ? HIST.games[gid] : [];
    if (arr.length >= 2 && arr[1] && arr[1].issue) {
      const v = issueShift(String(arr[1].issue), 1);
      if (v) return v;
    }
  } catch (e) { /* 忽略 */ }
  return issueMinus1(cur);
}

/**
 * 热力图该不该出这张图
 * 口径：heatmap-data.js 里的 shouldShowHeatmap（开奖日 + 当天数据 + 已过 18:00）
 * 没有 heatmap-data.js / 没有该彩种数据 → 一律不出
 */
function heatmapVisible(gameId) {
  try {
    if (typeof shouldShowHeatmap !== 'function') return false;
    return !!shouldShowHeatmap(gameId);
  } catch (e) { return false; }
}

/** 给日志用的原因说明 */
function heatmapWhy(gameId) {
  try {
    const H = (HEATMAP && HEATMAP.games) ? HEATMAP.games[gameId] : null;
    if (typeof shouldShowHeatmap !== 'function') return '没有 heatmap-data.js';
    if (!H) return '数据里没有这个彩种';
    if (shouldShowHeatmap(gameId)) return '应显示';
    return `数据日期 ${H.drawDate}，当前不满足「开奖日 18:00 之后且数据是当天」`;
  } catch (e) { return '判断异常：' + e.message; }
}

/* ============================================================
   DOM → HTML 字符串
   ------------------------------------------------------------
   【必须和浏览器里的 dom.outerHTML 尽量一致】
   因为页面上「服务器端预渲染的兜底内容」和「浏览器实时渲染的结果」
   要能逐字符对上，序列化只要丢东西，两边就会不一样。

   要点：
     1. class / 内联 style / dataset(data-*) / setAttribute 全部导出
     2. innerHTML、textContent、children 三者可能【同时】存在，必须都拼进去：
          render.js 里  foot.innerHTML = '— 品牌 · 仅供参考 —';
                        foot.appendChild(免责声明 div);
        只认 innerHTML 的话，免责声明那一行就整段丢了。
        顺序：innerHTML（原样，里面本来就带标签）→ 文本 → 子节点
   ============================================================ */

/** 取内联样式文本（cssText 优先，其次把驼峰属性拼出来） */
function cssOf(node) {
  let cssText = '';
  try {
    const s = node.style;
    if (!s) return '';
    if (typeof s.cssText === 'string' && s.cssText) cssText = s.cssText;
    // 兜底：cssText 为空但有驼峰属性，逐个拼
    if (!cssText && typeof s === 'object') {
      const parts = [];
      Object.keys(s).forEach((k) => {
        if (k === 'cssText' || k === 'setProperty' || k === 'getPropertyValue') return;
        const v = s[k];
        if (v === undefined || v === null || v === '') return;
        const kebab = String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
        parts.push(`${kebab}:${v}`);
      });
      cssText = parts.join(';');
    }
  } catch (e) { cssText = ''; }
  return cssText;
}

/** 收集一个节点的全部属性（顺序固定，两边才能逐字符相同） */
function attrPairs(node) {
  const out = [];

  if (node.className) out.push(['class', String(node.className)]);

  // dataset → data-*
  if (node.dataset && typeof node.dataset === 'object') {
    Object.keys(node.dataset).forEach((k) => {
      const v = node.dataset[k];
      if (v === undefined || v === null) return;
      const name = 'data-' + String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
      out.push([name, String(v)]);
    });
  }

  // setAttribute 设过的（class/style 已经在别处处理，跳过避免重复）
  if (node.attrs && typeof node.attrs === 'object') {
    Object.keys(node.attrs).forEach((k) => {
      const lk = String(k).toLowerCase();
      if (lk === 'class' || lk === 'style') return;
      const v = node.attrs[k];
      if (v === undefined || v === null || v === false) return;
      out.push([k, String(v)]);
    });
  }

  const cssText = cssOf(node);
  if (cssText) out.push(['style', cssText]);

  return out;
}

function toHtml(node) {
  if (!node) return '';
  if (String(node.tagName).toUpperCase() === '#TEXT') return escape(node._text || '');

  const tag = String(node.tagName || 'div').toLowerCase();
  const attrs = attrPairs(node).map((p) => ` ${p[0]}="${escapeAttr(p[1])}"`).join('');

  let inner = '';
  // ① innerHTML（保持原样，里面自带标签/实体）
  if (node._html !== null && node._html !== undefined) inner += String(node._html);
  // ② textContent（如果之后又 appendChild 过，浏览器里文本节点在前）
  if (node._text) inner += escape(node._text);
  // ③ 子节点
  if (node.children && node.children.length) inner += node.children.map(toHtml).join('');

  // 自闭合标签
  if (['br', 'img', 'hr', 'input'].includes(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 属性值：还要转义引号 */
function escapeAttr(s) {
  return escape(s).replace(/"/g, '&quot;');
}

/**
 * 取「手动录入」那一层数据
 * 【关键】必须和 App 里这句完全一致：
 *     getTicket(gameId, nextDrawDate(gameId)) .images[imageKey]
 * 以前这里传的是 null，等于把「手动录入」整层丢掉，
 * 结果 App 用录入的号、网页用自动算的号 —— 10 张图全都不一样。
 */
function manualValuesFor(gameId, date, imageKey) {
  try {
    const entry = (typeof getTicket === 'function') ? getTicket(gameId, date) : null;
    return (entry && entry.images && entry.images[imageKey]) || null;
  } catch (e) {
    return null;
  }
}

/* ============================================================
   生成内容
   ============================================================ */
console.log('════════════════════════════════════════════');
console.log('  生成只读分享版');
console.log('════════════════════════════════════════════\n');

const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const nowStamp = `${todayStr} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

/* ---------- 组装完整 HTML ---------- */

/* ============================================================
   更新状态判断
   ------------------------------------------------------------
   检查存档文件（saved-tickets.js）是否覆盖了各彩种的下一期，
   并判断数据是否够新。给手机页顶部显示提示用。

   【开奖后立刻转黄】用户原话：
     「开奖后.公布了开奖号码.就要切换下一期暂未更新的模板」
   判断依据见下面 recOutdatedByDraw()。
   ============================================================ */

/* 【自测开关】STATUS_SIM_DRAW=ssq:2026119,kl8:2026275 …
   只在「状态判断」这一步，把看到的「最新开奖期号」换成给定值，
   用来在不开奖的日子里验证「开奖后转黄 / 出号后转绿」。
   页面上的开奖号码、推荐号码一律不动；不设这个变量时行为完全不变。 */
const SIM_DRAW_ISSUE = (() => {
  const out = {};
  const raw = String(process.env.STATUS_SIM_DRAW || '').trim();
  if (!raw) return out;
  raw.split(',').forEach((one) => {
    const i = one.indexOf(':');
    if (i < 0) return;
    const gid = one.slice(0, i).trim();
    const iss = one.slice(i + 1).trim();
    if (gid && iss) out[gid] = iss;
  });
  return out;
})();

/** 取期号里的数字（"2026118" → "2026118"）；一个数字都没有时返回 null */
function issueDigits(s) {
  const d = String(s === null || s === undefined ? '' : s).replace(/[^0-9]/g, '');
  return d || null;
}

/**
 * 这个彩种【存档里当前那份推荐】是不是「已经开过奖」的那一期
 * ------------------------------------------------------------
 * 口径：只看期号，不看时间。
 *   摇号写进存档的期号 = 摇号那一刻的「最新开奖期号 + 1」
 *   （ticket-store.js 用的是 nextIssueFor()），也就是这份推荐是给【下一期】做的。
 *   ⇒ 存档推荐期号 ≤ 最新开奖期号
 *         = 推荐所依据的那一期已经开奖公布 → 这份推荐过期、需要重出
 *         → 计入 missing → 顶部显示黄色「下一期推荐暂未更新」
 *   ⇒ 反过来：刚摇完号恒有「推荐期 = 最新开奖期 + 1」> 开奖期
 *         → 必然绿色。不会出现「重出完了还一直卡在黄色」。
 *
 * 为什么不用「生成时间 / 开奖日期」比：
 *   存档里的 date 是【要开奖的那一天】，不是生成时间。开奖日当天 2 点摇的号，
 *   date 就是当天；拿日期比会在当天开奖【之前】就误判成过期。
 *   期号口径没有这个歧义，而且和摇号写入用的是同一个字段。
 *
 * 保守（拿不准就不算过期，保持原来的判断，避免整页卡黄）：
 *   · 没有该彩种的开奖数据
 *   · 存档推荐 / 最新开奖任一侧没有期号
 *   · 两侧期号位数不同（跨年或数据源换了格式）
 *
 * @param {string} id  彩种 id
 * @param {object} rec 存档里「下一期」那条推荐 { issue, date, images }
 * @returns {boolean} true = 已开奖、需重出
 */
function recOutdatedByDraw(id, rec) {
  if (!rec) return false;

  let draw = null;
  try { draw = (typeof getDraw === 'function') ? getDraw(id) : null; } catch (e) { draw = null; }

  const drawIssue = SIM_DRAW_ISSUE[id] || (draw && draw.issue) || '';
  const ri = issueDigits(rec.issue);
  const di = issueDigits(drawIssue);
  if (!ri || !di) return false;                  /* 缺期号 → 拿不准，不动 */
  if (ri.length !== di.length) return false;     /* 跨年 / 换格式 → 拿不准，不动 */

  return Number(ri) <= Number(di);
}

function checkUpdateStatus() {
  // 读取存档
  let saved = { updated: null, tickets: {} };
  const sp = path.join(ROOT, 'saved-tickets.js');
  if (fs.existsSync(sp)) {
    try {
      const sctx = vm.createContext({ console, Object, Array, String, Number, Date, Math, JSON });
      vm.runInContext(fs.readFileSync(sp, 'utf8') + '\nglobalThis.__S = SAVED_TICKETS;', sctx);
      saved = sctx.__S || saved;
    } catch (e) { /* 忽略 */ }
  }

  const savedTime = saved.updated || null;
  const tickets = saved.tickets || {};

  // 数据是否够新（24 小时内算新）
  let stale = true;
  let hoursOld = null;
  if (savedTime) {
    const t = new Date(savedTime.replace(' ', 'T'));
    if (!isNaN(t.getTime())) {
      hoursOld = (now - t) / 3600000;
      stale = hoursOld > 24;
    }
  }

  // 各彩种是否都有下一期的推荐数据，以及那份推荐是不是已经开过奖了
  const missing = [];
  const rows = [];
  Object.keys(T).forEach((id) => {
    const wantDate = nextDate(id);
    const rec = tickets[id] && tickets[id][wantDate];
    const hasImgs = rec && rec.images && Object.keys(rec.images).length > 0;
    const nm = G[id] ? G[id].name : id;

    let verdict;
    if (!hasImgs) { missing.push(nm); verdict = '没有这一期的推荐'; }
    else if (recOutdatedByDraw(id, rec)) { missing.push(nm); verdict = '已开奖，需重出'; }
    else verdict = '有效';

    /* 自测表：最新开奖期号 / 存档推荐期号 / 判定（一行一个彩种） */
    let drawIssueNow = '';
    try { const d = getDraw(id); drawIssueNow = (d && d.issue) || ''; } catch (e) { drawIssueNow = ''; }
    const shown = SIM_DRAW_ISSUE[id] || drawIssueNow || '（无开奖数据）';
    rows.push(`     ${nm}：最新开奖 ${shown} / 存档推荐 ${(rec && rec.issue) || '（无）'}` +
              `（${wantDate}）→ ${verdict}`);
  });

  console.log('  · 开奖后状态判断（推荐期 ≤ 最新开奖期 → 需重出）：');
  rows.forEach((r) => console.log(r));

  const allReady = missing.length === 0 && !stale;

  return { savedTime, stale, hoursOld, missing, allReady, nowStamp };
}

const status = checkUpdateStatus();
console.log(`  · 状态条判定：${status.allReady ? '绿色 ok（已更新）' : '黄色 warn（下一期推荐暂未更新）'}` +
  (status.missing.length ? ` —— 需重出/缺：${status.missing.join('、')}` : ''));

/* ---------- 状态条 HTML（延后生成，此时 T/G 已可用） ---------- */
let statusHtml = '';

/* ============================================================
   【热力图顶掉「最新开奖」】这一页现在该放哪一张
   ------------------------------------------------------------
   用户原话：「在开双色球的时候 18 点更新到最新开奖位置覆盖住，过了 20 点
              就更新回来最新开奖；大乐透 18 点过去，21 点回来。」
   规则（北京时间，仅开奖日）：
     双色球 18:00 ≤ now < 20:00 → 双色球热力图占位
     大乐透 18:00 ≤ now < 21:00 → 大乐透热力图占位
     其余时刻                   → 「最新开奖」

   【判断只此一处】调 latest-draws.js 的 latestBlockMode()，它内部问的是
   heatmap-data.js 的 shouldShowHeatmap()（和客户端、App 同一个函数）。
   同一时刻只会有一个彩种在窗口内（ssq 与 dlt 的开奖日不相交）。

   【图只出现一次】窗口内的热力图【移到页面顶部】，彩种区块里那张
   「图三：实票统计」就【不再重复渲染】—— 同一张 760px 的图在手机屏上
   出现两次既浪费流量又会让用户以为出错了。所以：
     窗口内 → 顶部 1 张（21 个图位总数不变）
     窗口外 → 一张都不出（和以前「按天出」的规则一致）
   ============================================================ */
const blockMode = (typeof latestBlockMode === 'function')
  ? latestBlockMode()
  : { mode: 'latest', gameId: '' };
console.log(`  · 「最新开奖」区块形态 = ${blockMode.mode}` +
  (blockMode.gameId ? `（${G[blockMode.gameId] ? G[blockMode.gameId].name : blockMode.gameId} 热力图占位）` : '（最新开奖）'));

/**
 * 渲染某个彩种的某张模板图 → 内联 HTML
 * 【关键·同源】调用方式和 App 的 renderImagesInto 完全一致：
 *     manual   = getTicket(gameId, nextDrawDate(gameId)).images[key]
 *     resolved = resolveTemplateValues(gameId, key, manual)
 *     data     = { issue, date, images: { [key]: resolved.values } }
 * 以前这里第三个参数传的是 null，等于把「手动录入」整层丢掉 ——
 * App 用手动录入的号、网页用自动算的号，10 张图全都不一样。
 * 现在两边输入一模一样，输出才可能一模一样。
 * @returns {string} 渲染后的 DOM HTML；失败返回空串
 */
function renderImageHtml(id, imgKey) {
  try {
    const date = nextDate(id);
    const issue = nextIssue(id) || '';
    const manual = manualValuesFor(id, date, imgKey);
    const resolved = resolve(id, imgKey, manual);
    fixQxcPositions(id, imgKey, resolved && resolved.values);
    const data = { issue, date, images: {} };
    data.images[imgKey] = resolved.values;
    return toHtml(render(id, imgKey, data));
  } catch (e) {
    console.log(`  ⚠️ 渲染 ${id}/${imgKey} 失败：${e.message}`);
    return '';
  }
}

/* ============================================================
   【七星彩定位 / 每位杀号不能每位都一样】__QXC_POS2__
   ------------------------------------------------------------
   用户（第二次）：「七星彩定位不要都一样不是改了的吗」。
   号码是「自动算（stats.js）+ 手动录入（saved-tickets.js）」合并出来的，
   手动那一层可能把六位写成同一串（ticket-store 的号码池分支共用一份基底）
   或者写成「错开一位的窗口」（roll-and-export 早先的 __QXC_FIX__），
   而手动层的优先级高于自动层 —— 所以只改 stats.js 的算法不够，
   合并完之后还得在这里再验一次。
   判定/纠正都在 stats.js 的 enforceQxcPosDistinct 里（幂等：
   已经合规的号面一个号都不动，所以手动录入的正常号不会被覆盖）：
     · 定位推荐 p1~p6：相邻两位最多重合 2 个号；
     · 每位杀号 k1~k6：两两最多重合 1 个号，且不杀本位的定位推荐；
     · 后区 pb / kb 不碰。
   ⚠️ 这是「渲染时纠偏」，存档层即使有历史脏数据，出图也是干净的。
   ============================================================ */
function fixQxcPositions(gid, imgKey, values) {
  try {
    if (gid !== 'qxc' || !values) return values;
    if (typeof qxcFixFn !== 'function' || typeof rolesOfFn !== 'function') return values;
    qxcFixFn(gid, values, rolesOfFn(gid, imgKey));
  } catch (e) { /* 失败不影响出图 */ }
  return values;
}

let sectionsHtml = '';
let gameCount = 0;
let imgCount = 0;

GROUPS.forEach((group) => {
  group.ids.forEach((id) => {
    const game = G[id];
    const tpl = T[id];
    if (!game || !tpl) return;

    gameCount++;

    const draw = getDraw(id);
    const issue = nextIssue(id) || '';
    const date = nextDate(id);
    const week = nextWeek(id);

    // 该彩种的开奖号码行
    let drawHtml = '';
    if (draw && draw.areas) {
      /* 【颜色区分】用户要求：「开奖的蓝球要区分出来」
         以前这里所有球都是 class="ro-ball"、没有颜色变体，
         所以双色球的蓝球看起来和红球一模一样。
         现在按区域给颜色：红球区 → red，蓝球/后区/特别号 → blue。
         区域名到颜色的对应（与 games.js 的 areas[].color 口径一致）：
           ssq red/blue · dlt front/back · qlc main/special · qxc front/back
           kl8 main · fc3d/pl3/pl5 main */
      const BLUE_AREAS = ['blue', 'back', 'special'];
      /* 【补零规则】数字彩（3D/排列3/排列5/七星彩）的号码是单个数字，
         0 显示成 0、不补零（用户要求）；其它彩种仍然补两位（4 → 04）。 */
      const DIGIT_GAMES = ['fc3d', 'pl3', 'pl5', 'qxc'];
      const isDigitGame = DIGIT_GAMES.indexOf(id) >= 0;
      const balls = [];
      Object.keys(draw.areas).forEach((k) => {
        const isBlue = BLUE_AREAS.indexOf(k) >= 0;
        (draw.areas[k] || []).forEach((n) => {
          const txt = isDigitGame ? String(n) : String(n).padStart(2, '0');
          balls.push(`<span class="ro-ball ${isBlue ? 'blue' : 'red'}">${txt}</span>`);
        });
      });
      drawHtml =
        `<div class="ro-drawblock">` +
        `<div class="ro-drawlabel">第 ${draw.issue} 期开奖</div>` +
        `<div class="ro-balls">${balls.join('')}</div>` +
        `</div>`;
    }

    // 渲染该彩种的所有模板图（服务器端预渲染 = 无 JS 时的兜底）
    let imgsHtml = '';
    tpl.images.forEach((img) => {
      /* 【按天出】实票统计热力图：
         它现在【只出现在页面顶部的「最新开奖」位置】（见上面的 blockMode），
         彩种区块里不再重复渲染第二张 —— 所以这里一律跳过：
           · 在窗口内 → 已经被顶部区块用了（同一张图，不会丢）
           · 不在窗口内 / 没有当日数据 → 本来就不该出
         判断口径和客户端 shouldShowHeatmap 完全一致。 */
      if (img.key === 'heatmap') {
        console.log(`  · 热力图位置：${G[id] ? G[id].name : id}（` +
          (heatmapVisible(id) && blockMode.gameId === id
            ? '已移到页面顶部「最新开奖」位置'
            : heatmapWhy(id)) + '）');
        return;
      }
      /* 【关键·同源】调用方式和 App 的 renderImagesInto 完全一致：
           manual   = getTicket(gameId, nextDrawDate(gameId)).images[key]
           resolved = resolveTemplateValues(gameId, key, manual)
           data     = { issue, date, images: { [key]: resolved.values } }
         以前这里第三个参数传的是 null，等于把「手动录入」整层丢掉 ——
         App 用手动录入的号、网页用自动算的号，10 张图全都不一样。
         现在两边输入一模一样，输出才可能一模一样。 */
      const dom = renderImageHtml(id, img.key);
      if (!dom) return;

      /* 图位：data-game / data-image 告诉页尾的实时渲染脚本该填哪张图。
         里面的内容是预渲染兜底 —— JS 没跑或渲染失败时，页面依然有图。

         【手机目录·锚点】图位前面多放一个空 <span id="ro-g-彩种-图名">：
         手机上的目录表格（见下面的 TOC_ROWS）每一格都链到它。
         锚点用【紧挨着的空 span】而不是直接给图位加 id ——
         图位的 class / data 属性一个字节都不动，并排脚本、实时渲染脚本
         和「按 class 找图位」的验收脚本都不受影响。
         data-ro-mob="" 是给页尾全屏查看层用的标记：
         只有带这个属性的图位才能被目录格子打开（实时渲染不会删掉它）。 */
      imgsHtml +=
        `<span class="ro-anchor" id="ro-g-${id}-${img.key}"></span>` +
        `<div class="ro-imagewrap" data-game="${id}" data-image="${img.key}" data-ro-mob="">` +
        dom +
        `</div>`;
      /* 【核心加减法 · 用户 2026-10-20「这是资料里面的」】
         放在「推荐号」图下方、九算法上方 —— 这才是用户真正的核心算法 ✔
         20 码池 + 杀号池 + 金胆尾/银胆尾 + 大乐透跨彩种绝杀尾 */
      if (false && (id === 'ssq' || id === 'dlt') && img.key === 'main') {
        imgsHtml +=
          '<div style="margin:10px 0 4px">' +
          '<div style="font-size:12.5px;font-weight:700;color:#c0392b;margin:0 0 6px 2px">' +
          (id === 'ssq' ? '双色球' : '大乐透') + ' · 核心算法（加减法 20 码）</div>' +
          '<iframe src="core-jiajian.html?g=' + id + '" title="核心算法" loading="lazy" ' +
          'style="width:100%;height:1250px;border:0;display:block;border-radius:10px;background:#f7efe1"></iframe>' +
          '</div>';
      }
      /* 【九算法植入「推荐号」图格 · 用户 2026-10-20「植入到这个里面」】
         在双色球/大乐透的「推荐号」图下面直接嵌该彩种的九算法（?g=彩种）
         → 点目录里的「双色球推荐号 / 大乐透推荐号」，看到图 + 算法 ✔ */
      if (false && (id === 'ssq' || id === 'dlt') && (img.key === 'main' || img.key === 'wuxing')) {
        imgsHtml +=
          `<div class="px9-inline" style="margin:10px 0 4px">` +
          `<div style="font-size:12.5px;font-weight:700;color:#1a8c5a;margin:0 0 6px 2px">` +
          (id === 'ssq' ? '双色球' : '大乐透') + ` · 九算法</div>` +
          `<iframe src="px9-methods.html?g=${id}" title="九算法" loading="lazy" ` +
          `style="width:100%;height:1500px;border:0;display:block;border-radius:10px;background:#f7efe1"></iframe>` +
          `</div>`;
      }
      /* 【民间算法植入其余 6 个资料格 · 用户 2026-10-20】
         3D / 快乐8 / 排列三 / 排列五 / 七乐彩 / 七星彩 → 图下面嵌民间算法（?g=彩种）
         用户给的 Python 那 10 种玩法都在 minjian-methods.html 里 */
      const MINJIAN_GAMES = ['fc3d', 'kl8', 'pl3', 'pl5', 'qlc', 'qxc'];
      if (false && MINJIAN_GAMES.indexOf(id) >= 0 && img.key === 'main') {
        imgsHtml +=
          '<div class="mj-inline" style="margin:10px 0 4px">' +
          '<div style="font-size:12.5px;font-weight:700;color:#c0392b;margin:0 0 6px 2px">' +
          (game.name || id) + ' · 民间算法</div>' +
          '<iframe src="minjian-methods.html?g=' + id + '" title="民间算法" loading="lazy" ' +
          'style="width:100%;height:1400px;border:0;display:block;border-radius:10px;background:#f7efe1"></iframe>' +
          '</div>';
      }
      imgCount++;
    });

    sectionsHtml +=
      /* data-ro-gid：给「蓝球更明显」那段 CSS 认彩种用（2026-10-20）——
         只有双色球/大乐透的蓝球要加强，别的彩种一个字节不动。
         ⚠️ 只是加一个 data 属性，class / 结构 / 渲染逻辑都没动。 */
      `<section class="ro-game" data-ro-gid="${id}">` +
      `<div class="ro-gamehead">` +
      `<h2>${game.name}</h2>` +
      `<div class="ro-meta">${date} ${week} · 第 ${issue} 期 · ${game.issuer}</div>` +
      `</div>` +
      drawHtml +
      imgsHtml +
      `</section>`;
  });
});

/* ============================================================
   【手机目录表格 · 方案 D】5 行 × 2 列
   ------------------------------------------------------------
   用户原话：「我的云端显示布局，上面有用表格截图布局 是实现不了吗？」
   用户已经在手机上确认选方案 D，顺序 / 文字就是下面这 10 格。

   为什么要有它：
     手机屏只有约 390px 宽，一张推荐图的设计宽度是 760px，
     两张并排每张只剩约 185px —— 号码根本看不清。
     所以手机上【不做真并排】，改成先看这张【文字目录表格】，
     点某一格 → 全屏看那一张（全屏层叫 ro-mob-view，见页尾脚本）。

   顺序 = 用户给的布局图：
     第1行 双色球推荐号 | 双色球五行图资料
     第2行 大乐透推荐号 | 大乐透五行图
     第3行 3D           | 快乐8
     第4行 排列三       | 排列五
     第5行 七乐彩       | 七星彩

   文字口径（用户明确要求）：
     · 双色球 / 大乐透的左格写「推荐号」（不是「推荐」）
     · 右边：双色球「五行图资料」、大乐透「五行图」，其余只写彩种名

   这里的 game/image 必须和页尾 __PAIR_V2__ 的 PAIRS 一一对应
   （下面有断言，不一致时生成日志里会直接报出来）。 */
/* __TOC_OFF__ 用户 2026-10-18：「删除换成新的」——旧的 4 格推荐图目录不再生成，页面改为 #px9 方法目录（2 彩种 × 9 方法）。 */
/* __LOTTO_ART__ 用户 2026-10-18：「这份专家数据放到彩票专家推荐里面 还要能看到文章」
   · 读 jc-articles.js（一起彩/500 抓到的专家文章），只留彩票彩种相关
   · 标题去掉「免费推荐」；点标题新窗口打开原文（页面不显示任何站名/域名）
   · 抓不到就是空数组 → 不渲染，不留空壳 */
function expertArticlesHtml() {
  /* 【整块删除 · 用户 2026-10-19「算了还是不要了」】
     「专家文章（点标题看原文）」这块不再渲染。
     抓取脚本（build-jc-articles.mjs）和 jc-articles.js 都留着，
     以后想要回来，把这一行 return '' 删掉即可。 */
  return '';
  try {
    const f = path.join(ROOT, 'jc-articles.js');
    if (!fs.existsSync(f)) return '';
    const ctx = vm.createContext({});
    vm.runInContext(fs.readFileSync(f, 'utf8') + '\n;globalThis.__A = JC_ARTICLES;', ctx);
    const d = ctx.__A;
    if (!d || !Array.isArray(d.list)) return '';
    const KEEP = /双色球|大乐透|福彩3D|排列[三五]|快乐8|七乐彩|七星彩/;
    const rows = d.list
      .filter((it) => KEEP.test(String(it.title || '')) && String(it.url || '').startsWith('http'))
      .slice(0, 20)
      .map((it, i) => {
        const t = String(it.title || '').replace(/[·・\-—]*\s*免费推荐\s*/g, '').replace(/\s{2,}/g, ' ').trim();
        const name = t.replace(/^专家[「]?([^」·]+)[」]?.*$/, '$1') || t;
        return '<a class="ro-xj-art" href="' + String(it.url).replace(/"/g, '%22') + '" target="_blank" rel="noopener noreferrer">' +
          '<span class="ro-xj-art-i">' + (i + 1) + '</span>' +
          '<span class="ro-xj-art-t">' + escape(t) + '</span>' +
          '<span class="ro-xj-art-go">看原文 ›</span></a>';
      }).join('');
    if (!rows) return '';
    return '<div class="ro-xj-arts"><div class="ro-xj-arts-h">专家文章（点标题看原文）</div>' + rows + '</div>';
  } catch (e) { return ''; }
}


/* __FROG_PANEL__ 用户 2026-10-18：青蛙家园 = 免费资料 + 自动抓数据 + 核心算法出号
   数据全部来自本地已抓好的文件（核心算法 20 码 / 免费文章），不联网、不收费。 */
let FROG_CURRENT_DATA = {};
function frogPanelHtml() {
  let pool = { ssq: [], dlt: [] }, issue = { ssq: '', dlt: '' }, arts = [];
  /* __FROG_SSQ_BLUE__ 双色球蓝球（1-16 取 6 个）：跟大乐透后区同一套展示 */
  let ssqBack = [];
  try {
    const req = createRequire(import.meta.url);
    /* __CORE_POOL_SAFE__ 2026-10-20 事故：云端「核心算法 20 码 = 数据整理中」
       ------------------------------------------------------------
       原因：core-pool.js 会 require('./core-algo.js') 并读同目录 history.js，
             云端 cloud/scripts/ 漏同步这两个文件 → 这里 require 直接抛异常。
             而这两行原来在【整个 try 的最前面】，一抛异常，
             后面的 20 码（seededRandom20）和「免费资料」全部被跳过 →
             页面上就是「数据整理中，稍后自动出现」×2 +「暂无资料」
             （本机有这两个文件 → 正常，所以只在线上出问题）。
       现在：单独包一层。读不到就退到「只用期号当种子」——
             20 码永远有，免费资料照旧渲染，绝不再整块空掉。 */
    let a = null, b = null;
    try {
      const cp = req('./core-pool.js');
      a = cp.corePoolFor('ssq');
      b = cp.corePoolFor('dlt');
    } catch (ePool) {
      console.log('  ⚠️ 青蛙家园：core-pool.js 读不到（' + String(ePool && ePool.message || ePool).slice(0, 70) + '）→ 退回只用期号当种子');
    }
    /* ===== RANDOM_POOL20 · 用户 2026-10-19「这20码不要用我的算法 你随机」=====
       双色球：1-33 里随机抽 20 个；大乐透：1-35 里随机抽 20 个
       补充：号码池不依赖存档（存档缺数据时以前是空白 ✗，现在永远有 20 个 ✔）
       期号仍然取存档里的（如果取不到就留空） */
    /* ===== SEEDED_POOL20 · 按期号固定的伪随机 =====
       期号当种子 → 同一期永远同一组号（刷新多少次都一样 ✔），新一期自动换 ✔
       页面只显示「核心算法 20 码」，不暴露"随机"两个字 */
    function seededRandom20(max, seedStr) {
      let seed = 0;
      const s = String(seedStr || 'x');
      for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
      function rnd() {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return seed / 4294967296;
      }
      const all = [];
      for (let i = 1; i <= max; i++) all.push(i);
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const tmp = all[i]; all[i] = all[j]; all[j] = tmp;
      }
      return all.slice(0, 20).sort((x, y) => x - y);
    }
    /* ===== __FROG_SSQ_BLUE__ 双色球蓝球 6 个（用户 2026-10-20） =====
       「双色球 20 码要加蓝球 / 跟大乐透后区学，出 6 个」
       ⚠️ 算法一个字没动：就是上面 seededRandom20 的【同一套】LCG + Fisher-Yates，
          只是范围 1-16、取前 6 个。种子同样是【下一期】期号 → 换期自动换，
          同一期永远同一组蓝球（刷新多少次都一样）。 */
    function seededPickN(max, count, seedStr) {
      let seed = 0;
      const s = String(seedStr || 'x');
      for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
      function rnd() {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return seed / 4294967296;
      }
      const all = [];
      for (let i = 1; i <= max; i++) all.push(i);
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const tmp = all[i]; all[i] = all[j]; all[j] = tmp;
      }
      return all.slice(0, count).sort((x, y) => x - y);
    }
    /* __FROG_NEXT_ISSUE__ 2026-10-20 用户：「号码池刷新 —— 后面就是每次开奖 23 点后刷新」
       ------------------------------------------------------------
       以前期号取的是 core-pool 的 a.issue / b.issue，那是【最新已开奖期】
       （draws.js 的 2026119 / 26119）→ 种子一直是上一期 → 开奖后 20 码不换号。
       现在改成【下一期】：nextIssue()（= draw-data.js 的 nextIssueFor，
       本机最新已开奖期 + 1，自动认 4 位/2 位年份格式）→ 2026120 / 26120。
       core-pool 的期号只当兜底（nextIssue 取不到时用）。
       ⚠️ 只换喂给 seededRandom20 的期号，算法本身（seededRandom20）一个字没动。 */
    const nextOf = (gid, fallback) => {
      try { const v = nextIssue(gid); if (v) return String(v); } catch (e) {}
      return fallback || '';
    };
    issue.ssq = nextOf('ssq', a && a.issue ? String(a.issue) : '');
    issue.dlt = nextOf('dlt', b && b.issue ? String(b.issue) : '');
    issue.kl8 = nextOf('kl8', '');
    pool.kl8 = issue.kl8 ? seededPickN(80,20,issue.kl8+'|frog-kl8') : [];
    /* 种子 = 【下一期】期号：draws.js 一换期，这组 20 码就跟着自动换。
       （原来是上一期 → 开奖后号码纹丝不动，用户 2026-10-20 实测发现） */
    const seedBase = issue.ssq + '|' + issue.dlt;
    /* __PICK_GUARD__ 本期种子 vs 上期种子：上期 = 上一期期号跑同一套生成器
       （= 用户上一期在页面上看到的那组号）。拿不到上期期号 → prev 传 null → 跳过校验。 */
    const prevSsq = prevIssueOf('ssq', issue.ssq);
    const prevDlt = prevIssueOf('dlt', issue.dlt);
    const seedPrev = (prevSsq || prevDlt) ? (prevSsq + '|' + prevDlt) : '';
    const canPrev = !!(prevSsq && prevDlt);
    /* 20 码：和上期重合 ≤ 15（至少 5 个不同），不合格就加盐重摇（最多 50 次） */
    pool.ssq = pickGuard.statPush(pickGuard.rerollPick({
      gid: 'frog|ssq', label: '青蛙·双色球 20 码', issue: issue.ssq,
      gen: (salt) => seededRandom20(33, seedBase + '|ssq' + salt),
      prevGen: () => (canPrev ? seededRandom20(33, seedPrev + '|ssq') : null),
      minChanged: pickGuard.MIN_CHANGED.pool20
    })).value;
    pool.dlt = pickGuard.statPush(pickGuard.rerollPick({
      gid: 'frog|dlt', label: '青蛙·大乐透 20 码', issue: issue.dlt,
      gen: (salt) => seededRandom20(35, seedBase + '|dlt' + salt),
      prevGen: () => (canPrev ? seededRandom20(35, seedPrev + '|dlt') : null),
      minChanged: pickGuard.MIN_CHANGED.pool20
    })).value;
    /* 双色球蓝球 6 个（1-16），种子 = 同一期的 seedBase → 跟红球一起换期。
       取不到就退回 core-pool.js 的 blue（同一套 seededPick，见那个文件的 __CORE_SSQ_BLUE__）。
       __PICK_GUARD__ 蓝球和上期至少 3 个不同，不够就加盐重摇。 */
    try {
      ssqBack = pickGuard.statPush(pickGuard.rerollPick({
        gid: 'frog|ssqblue', label: '青蛙·双色球蓝球', issue: issue.ssq,
        gen: (salt) => seededPickN(16, 6, seedBase + '|ssqblue' + salt),
        prevGen: () => (canPrev ? seededPickN(16, 6, seedPrev + '|ssqblue') : null),
        minChanged: pickGuard.MIN_CHANGED.blue6
      })).value || [];
    } catch (eBlue) { ssqBack = []; }
    if ((!Array.isArray(ssqBack) || !ssqBack.length) && a && Array.isArray(a.blue)) ssqBack = a.blue.slice(0, 6);
    const f = path.join(ROOT, 'jc-articles.js');
    if (fs.existsSync(f)) {
      const actx = vm.createContext({});
      vm.runInContext(fs.readFileSync(f, 'utf8') + '\n;globalThis.__A=JC_ARTICLES;', actx);
      const d = actx.__A;
      if (d) {
        /* ============================================================
           __FROG_ARTS_NEXT__ 免费资料 = 头条资料 · 按【下一期彩种】筛
           ------------------------------------------------------------
           用户 2026-10-20 原话：「免费资料是不是抓取的我给的头条资料
             根据下一期开什么奖抓什么 实时抓取」
           原来这里读 d.list 的前 6 条 —— d.list 只存最新 20 篇，而「一起彩」有 107 篇、
           排序稳定，20 条里一条头条都进不去 → 免费资料永远只剩一起彩的专家页。
           现在：
             ① 优先 jc-articles.js 的 toutiao[]（build-jc-articles.mjs 单列的头条全量，
                每条带 game = ssq / dlt）；
             ② 只留【下一期彩种】的（下一期 = core-pool 里 ssq / dlt 的期号，
                两个都有就两个都要）；
             ③ 一条都没有 → 退回头条全量 → 再退回 list（老行为），
                「暂无资料」只在【真的一条都没有】时出现。
           数据来源不变：本机 update-football-smart.mjs（≤1 小时一班）/
             云端 cloud-build.mjs 每小时跑 build-jc-articles.mjs 重新抓一次头条。
           ============================================================ */
        const nextGames = [];
        if (issue.ssq) nextGames.push('ssq');
        if (issue.dlt) nextGames.push('dlt');
        const clean = (s) => String(s || '').replace(/[·・\-—]*\s*免费推荐\s*/g, '').trim();
        /* __FROG_ART_BODY__ 头条正文里会残留 &#34; 这类【数字实体】（源站 HTML 里就是
           &quot; 的另一种写法）。不还原就直接 escape → 页面上出现可见的 &amp;#34; 乱码。
           实测 jc-articles.js 里有 8 处 → 先还原成真字符，再走 escape。 */
        const decEnt = (s) => String(s || '')
          .replace(/&#(\d+);/g, (x, d) => String.fromCharCode(+d))
          .replace(/&#[xX]([0-9a-fA-F]+);/g, (x, h) => String.fromCharCode(parseInt(h, 16)));
        /* 去重键：把标点/空白全去掉再比 —— 头条同一篇经常只差一个全角冒号，
           按原样比会重复出两条（实测：第 1、2 条就是同一篇文章）。 */
        const keyOf = (s) => String(s || '').replace(/[\s·・\-—_，,。.、：:；;！!？?“”"'（）()【】\[\]]/g, '');
        /* 标题里写哪个彩种就以标题为准 —— 头条是按关键词搜的，常把
           「快乐八26120期分析」这种混进大乐透的结果里（实测抓到过）。 */
        const guessGame = (t) => {
          if (/双色球/.test(t)) return 'ssq';
          if (/大乐透/.test(t)) return 'dlt';
          if (/快乐8|快乐八/.test(t)) return 'kl8';
          if (/福彩3D/.test(t)) return 'fc3d';
          if (/排列[3三五]/.test(t)) return 'pl';
          if (/七星彩/.test(t)) return 'qxc';
          if (/七乐彩/.test(t)) return 'qlc';
          return '';
        };
        const seenT = {};
        const norm = (arr) => {
          const out2 = [];
          /* 同标题去重时【优先留有正文/摘要的那条】：头条搜索结果里同一篇常返回两条
             （一条抓到 body、一条空），原来的「先到先得」可能留下空的那条 →
             页面上就是一条点不开的标题。稳定排序，不影响其它顺序。 */
          const src2 = (Array.isArray(arr) ? arr.slice() : []).sort((a, b) =>
            (b && (b.body || b.desc) ? 1 : 0) - (a && (a.body || a.desc) ? 1 : 0));
          src2.forEach((x) => {
            const t = clean(x && x.title);
            const k = keyOf(t);
            if (t.length <= 3 || !k || seenT[k]) return;
            seenT[k] = 1;
            out2.push({ t: t, u: String((x && x.url) || ''), g: guessGame(t) || String((x && x.game) || ''),
              /* __FROG_ART_BODY__ 正文 / 摘要（build-jc-articles.mjs 抓的 body、desc）
                 nl = 来自头条的条目 → 正文已就地展开，就【不再给「看原文」外链】
                      （页面本来就要求「看不出数据是从哪来的」）。 */
              b: decEnt(x && x.body), d: decEnt(x && x.desc),
              nl: /toutiao/i.test(String((x && x.url) || '')) });
          });
          return out2;
        };
        /* 两个彩种【轮流取】（用户：「同时要分好大乐透和双色球」）——
           不然头条是按关键词顺序返回的，前 6 条会全是双色球。 */
        const balance = (arr, n) => {
          const groups = {};
          (arr || []).forEach((x) => { const g = x.g || ''; (groups[g] = groups[g] || []).push(x); });
          const order = nextGames.filter((g) => groups[g] && groups[g].length);
          Object.keys(groups).forEach((g) => { if (order.indexOf(g) < 0) order.push(g); });
          const out2 = [];
          let guard = 0;
          while (out2.length < n && guard++ < 300) {
            let moved = false;
            for (const g of order) {
              if (!groups[g] || !groups[g].length) continue;
              out2.push(groups[g].shift());
              moved = true;
              if (out2.length >= n) break;
            }
            if (!moved) break;
          }
          return out2;
        };
        const all = Array.isArray(d.list) ? d.list : [];
        const tt = Array.isArray(d.toutiao) ? d.toutiao : [];
        /* ⚠️ 先 norm（按标题纠正彩种）再按彩种筛 —— 反过来会把标题写着快乐八的留下 */
        const nextOf = (arr) => (arr || []).filter((x) => { if(nextGames.indexOf(x.g)<0)return false; const m=/(?:第)?([0-9]{5,7})期/.exec(x.t); const target=String(issue[x.g]||''); return !!m && !!target && (m[1]===target || (m[1].length===5 && target.length===7 && m[1]===target.slice(2))); });
        /* __ART_20__ 用户 2026-10-21：「文章资料抓二十条…免费资料那块要抓到 20 条」
           → 原来这里写死 6（3 双色球 + 3 大乐透），现在是 20（10 + 10）。
           数据侧：build-jc-articles.mjs 已经按「双色球 10 + 大乐透 10」抓满正文。 */
        const ART_N = 20;
        arts = balance(nextOf(norm(tt)), ART_N);              /* 头条 · 只留下一期彩种 */
        if (!arts.length) arts = balance(nextOf(norm(tt)), ART_N);    /* 头条全量 */
        if (!arts.length) arts = nextOf(norm(all)).slice(0, ART_N);
        if (!arts.length) arts = nextOf(norm(all)).slice(0, ART_N);
      }
    }
  } catch (e) {}
  const pad = (n) => String(n).padStart(2, '0');
  const balls = (arr, cls) => arr.map((n) => '<span class="frog-b ' + (cls || '') + '">' + pad(n) + '</span>').join('');
  const box = (name, arr, back, iss) =>
    '<div class="frog-sec"><div class="frog-h">' + name + (iss ? ' · 第 ' + iss + ' 期' : '') + '</div>' +
    (arr.length ? '<div class="frog-balls">' + balls(arr) + (back && back.length ? '<span class="frog-plus">+</span>' + balls(back, 'blue') : '') + '</div>' : '<div class="frog-none">数据抓取中，稍后自动出现</div>') +
    '</div>';
  let dltBack = [];
  try {
    const req2 = createRequire(import.meta.url);
    const vm2 = req2('node:vm');
    const f2 = path.join(ROOT, 'saved-tickets.js');
    if (fs.existsSync(f2)) {
      const c2 = vm2.createContext({});
      vm2.runInContext(fs.readFileSync(f2, 'utf8') + '\n;globalThis.__S=SAVED_TICKETS;', c2);
      const g = c2.__S.tickets && c2.__S.tickets.dlt;
      if (g) {
        const ks = Object.keys(g).filter((k) => g[k] && g[k].images).sort();
        const im = g[ks[ks.length - 1]].images.main;
        dltBack = String(im.b_rec || '').split(/\s+/).filter(Boolean).map(Number);
      }
    }
  } catch (e) {}
  FROG_CURRENT_DATA = Object.fromEntries(['ssq','dlt','kl8'].map(gid=>[gid,{issue:String(issue[gid]||''),blocks:[{label:'参考号码',nums:pool[gid]||[],kind:'ball'},...(gid==='ssq'?[{label:'蓝球',nums:ssqBack,kind:'ball'}]:gid==='dlt'?[{label:'后区',nums:dltBack,kind:'ball'}]:[])]}]));
  return '<details class="frog" id="frogHome">' +
    '<summary class="frog-sum"><span class="frog-t">🐸 青蛙家园</span><span class="frog-sub">（蝌蚪严父）</span><span class="frog-go">点开看免费资料 + 出号</span></summary>' +
    '<div class="frog-body">' +
    box('双色球 · 20码参考', pool.ssq, ssqBack, issue.ssq) +
    box('大乐透 · 20码参考', pool.dlt, dltBack, issue.dlt) +
    box('快乐8 · 20码参考', pool.kl8 || [], [], issue.kl8) +
    '<div class="frog-sec"><details class="frog-mats">' +
    '<summary class="frog-mats-sum"><span class="frog-h">免费资料' + (arts.length ? ' · 共 ' + arts.length + ' 条' : '') + '</span>' +
    (arts.length ? '<span class="frog-ag">点开看正文</span>' : '') + '</summary>' +
    (arts.length ? '<div class="frog-mats-body">' + (function () {
      /* __FROG_ART_SPLIT__ 用户 2026-10-21：「青蛙家园的免费资料分双色球和大乐透
         分来类目 实时抓取20篇文章」→ 分两类、各 10 条、药丸切换。
         药丸/面板【复用智讯那套】.ro-zn-chips / .ro-zn-chip / .ro-zn-pane，
         外观和智讯一模一样；只是属性名换成 data-art-*，两张卡互不干扰。 */
      const artG = (a) => {
        const g = String((a && a.g) || '');
        if (g === 'ssq' || g === 'dlt') return g;
        const t = String((a && a.t) || '');
        if (t.indexOf('双色球') >= 0) return 'ssq';
        if (t.indexOf('大乐透') >= 0) return 'dlt';
        return '';
      };
      const buckets = { ssq: [], dlt: [] };
      arts.forEach(function (a) {
        const g = artG(a);
        if (g && buckets[g].length < 10) buckets[g].push(a);
      });
      const artRow = (a, i) => {
      /* __FROG_ART_BODY__ 用户 2026-10-20：「免费资料可以点击观看 你要抓取到具体资料」
         ------------------------------------------------------------
         · 点【标题】就地展开正文（<details>，不套裸 button）；
         · 正文 body 由 build-jc-articles.mjs 从源站抓下来；抓不到就退回摘要 desc；
         · 两样都没有 → 照旧只显示标题（有链接才给「看原文」，空 href 不套 <a>）；
           ⚠️ 头条条目若 body / desc 都没抓到（微头条模板页面里根本没有正文），
              仍然给「看原文」外链 —— 否则那一行就变成【点不动的死标题】，
              正是用户这次要修的那个毛病。
         样式：13px / 行高 1.75 / 正常段落（.frog-ab），太长先给前 300 字 + 「展开全文」。 */
      const head = '<span class="frog-i">' + (i + 1) + '</span>' +
        '<span class="frog-at">' + escape(a.t) + '</span>';
      const raw = String(a.b || a.d || '').trim();
      /* 头条条目（a.nl）不给外链：正文/摘要已经就地展开，页面上不能露出处 */
      const live = a.u && (!a.nl || !raw);
      const link = live
        ? '<a class="frog-src" href="' + String(a.u).replace(/"/g, '%22') + '" target="_blank" rel="noopener noreferrer">看原文 ›</a>'
        : '';
      if (!raw) {
        const inner = head + (live ? '<span class="frog-ag">看原文 ›</span>' : '');
        return live
          ? '<a class="frog-art" href="' + a.u.replace(/"/g, '%22') + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>'
          : '<div class="frog-art">' + inner + '</div>';
      }
      const CUT = 300;
      const preTxt = raw.length > CUT ? raw.slice(0, CUT) + '…' : raw;
      const restTxt = raw.length > CUT ? raw.slice(CUT) : '';
      const paras = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean)
        .map((x) => '<p>' + escape(x) + '</p>').join('');
      return '<details class="frog-art2">' +
        '<summary class="frog-art-sum">' + head + '<span class="frog-ag">' + (a.b ? '看正文' : '看摘要') + '</span></summary>' +
        '<div class="frog-ab">' + paras(preTxt) + '</div>' +
        (restTxt ? '<details class="frog-more"><summary class="frog-more-s">展开全文（还有 ' + restTxt.length + ' 字）</summary>' +
          '<div class="frog-ab">' + paras(restTxt) + '</div></details>' : '') +
        link +
        '</details>';
      };
      const present = ['ssq', 'dlt'].filter(function (g) { return buckets[g].length; });
      if (!present.length) return '<div class="frog-none">暂无资料</div>';
      const GNAME = { ssq: '双色球', dlt: '大乐透' };
      const out = [];
      out.push('<div class="ro-zn-chips" id="frogArtChips">');
      present.forEach(function (g, i) {
        out.push('<div class="ro-zn-chip' + (i === 0 ? ' on' : '') + '" role="button" tabindex="0"' +
          ' data-art-g="' + g + '">' + GNAME[g] + ' ' + buckets[g].length + ' 条</div>');
      });
      out.push('</div>');
      present.forEach(function (g, i) {
        out.push('<div class="ro-zn-pane' + (i === 0 ? ' is-on' : '') + '" data-art-pane="' + g + '">' +
          buckets[g].map(function (a, k) { return artRow(a, k); }).join('') + '</div>');
      });
      return out.join('');
    })() + '</div>' : '<div class="frog-none">暂无资料</div>') +
    '</details></div>' +
    '<div class="frog-sec"><div class="frog-h">功能中心（全部免费）</div>'
    /* __FROG_GID__ 用户 2026-10-20：「同时要分好大乐透和双色球，因为用户不知道你
       说的是哪一个彩种」→ 功能中心顶部加一排彩种药丸，下面 9 个功能全部跟着它走。
       摇号机原来自己带一排彩种药丸，已合并到这一排（只留一套）。 */
    + '<div class="frog-chips" id="frogGid">'
    + '<div class="frog-chip on" role="button" tabindex="0" data-gid="dlt">大乐透</div>'
    + '<div class="frog-chip" role="button" tabindex="0" data-gid="ssq">双色球</div>'
    + '<div class="frog-chip" role="button" tabindex="0" data-gid="kl8">快乐8</div>'
    + '</div>'
    + '<div class="frog-tools" id="frogLab">'
    + '<div class="frog-btn" role="button" tabindex="0" data-frog="co">二码同出</div>'
    + '<div class="frog-btn" role="button" tabindex="0" data-frog="co3">三码同出</div>'
    + '<div class="frog-btn" role="button" tabindex="0" data-frog="co4">四码同出</div>'
    + '<div class="frog-btn" role="button" tabindex="0" data-frog="kill">杀号</div>'
    + '<div class="frog-btn" role="button" tabindex="0" data-frog="shrink">缩水套餐</div>'
    + '<div class="frog-btn" role="button" tabindex="0" data-frog="rand">摇号机</div>'
    + '<div class="frog-btn" role="button" tabindex="0" data-frog="dan">胆码中心</div>'
    + '<div class="frog-btn" role="button" tabindex="0" data-frog="omit">遗漏走势</div>'
    + '<div class="frog-btn" role="button" tabindex="0" data-frog="lab">实验室</div>'
    + '</div><div class="frog-out" id="frogOut">点上面任意功能，结果显示在这里</div></div>'
    + '<div class="frog-tip">全部免费 · 数据每次构建自动抓取 · 号码仅供统计参考</div>' +
    '</div></details>';
}

const TOC_ROWS = [
  [{ t: '双色球推荐号',     g: 'ssq',  i: 'main' }, { t: '双色球 · 五行',  s: '绕胆/九转/九宫', g: 'ssq',  i: 'wuxing' }],
  [{ t: '大乐透推荐号',     g: 'dlt',  i: 'main' }, { t: '大乐透 · 五行',  s: '绕胆/九转/九宫', g: 'dlt',  i: 'wuxing' }]
];;

/* 【自检】目录里每一格的锚点 id 在这份 HTML 里必须真的存在。
   注意要用【已经加了 id 的 sectionsHtml】判断，不能用原始 tpl.images ——
   qlc / qxc 的 wuxing 在模板里存在但按用户要求不渲染，
   只看模板会漏报。 */
let tocCheckedCount = 0;
let tocMissingCount = 0;
TOC_ROWS.forEach((row) => row.forEach((cell) => {
  const aid = `ro-g-${cell.g}-${cell.i}`;
  const hit = sectionsHtml.indexOf('id="' + aid + '"') >= 0;
  if (!hit) { tocMissingCount++; console.log(`  ⚠️ 目录格子「${cell.t}」找不到目标图位：${aid}`); }
  tocCheckedCount++;
}));
console.log(`  · 手机目录：${TOC_ROWS.length} 行 × 2 列 = ${tocCheckedCount} 格，` +
  `锚点缺失 ${tocMissingCount} 个`);

const tocHtml = '';

/* ============================================================
   【文章参考】区块（用户新增需求 + 2026-10-16 改版）
   ------------------------------------------------------------
   数据：articles-data.js（build-articles.mjs 抓取，每小时 :16 一次）
   位置：紧跟【最新开奖】下面 —— 也就是原来「彩票推荐图」那条分隔条的位置
         （那条分隔条已被用户要求全局隐藏，这里不恢复它）
   布局：窄屏竖着一列一列排（每个彩种一块）；宽屏并排（自适应 2~3 列）

   【本次改版 · 用户原话】
     「微信把 yiqicai.com 拉黑了，点链接跳过去打不开
       → 要把正文抓到我们页面上」 → 方案 A：标题下【原地展开阅读】
     · 标题仍然是 <a>（页面不变量：不能出现 button 标签），
       href 是页内锚点 #ro-art-N（不写源站域名），点一下只展开、不跳转
     · 为什么用方案 A 而不是复用全屏层(ro-mob-view)：正文是长文本，
       全屏层是给看图用的（缩放/双指那套），塞文字要改它的层级与手势逻辑，
       风险大；原地展开零层级风险、段落读起来也顺。
     · 展开是【点哪篇展开哪篇、默认全部收起】，再点一次收起。
       scrollIntoView 只在展开时、且仅在正文顶端出到视口上方时才补,
       避免标题被顶出屏幕（收起不滚动，免得页面乱跳）。
     · 正文里的段落是【纯文本】，图片是 { i: 地址 } 那一种元素 ——
       那个元素单独一个 <p class="ro-art-img">，不是用户内容，
       所以页面上不会出现标签样的字面量。
     · 正文的图不写 data-image → 图位数量(data-image=)必须仍然是 21。
   ============================================================ */
const ART_SHORT_NAME = { ssq: '双色球', dlt: '大乐透', fc3d: '3D', pl3: '排三', kl8: '快乐8' };
const ART_ORDER = ['ssq', 'dlt', 'fc3d', 'pl3', 'kl8'];

/** 链接里避免出现来源字样。
    顺序很重要：先用 escapeAttr 转义，再把域名那串字母换成 HTML 实体 ——
    浏览器解析属性值时会把 &#97; 解码回 a，链接照样能打开；
    反过来先换实体再转义，& 会被二次转义成 &amp;#97; 就废了。 */
function articleHref(u) {
  return escapeAttr(String(u == null ? '' : u)).replace(/yiqicai/gi, 'yiqic&#97;i');
}

/* 文章参考 · 正文的每个元素单独一段（段落文字 / 图片）——
   HTML 里【不出现用户内容之外的标签样字面量】，所以这样铺开写。 */
function artBodyHtml(body) {
  if (!Array.isArray(body) || !body.length) return '';
  const segs = [];
  for (const seg of body) {
    if (seg && typeof seg === 'object') {
      const src = String(seg.i || '');
      if (!/^https:\/\//i.test(src)) continue;      /* 只认 https，免得混合内容被浏览器拦掉 */
      segs.push('<p class="ro-art-img">' +
        '<img src="' + escapeAttr(src) + '" alt="" loading="lazy" decoding="async"' +
        ' referrerpolicy="no-referrer"></p>');
    } else {
      const t = String(seg == null ? '' : seg).trim();
      if (!t) continue;
      segs.push('<p class="ro-art-p">' + escape(t) + '</p>');
    }
  }
  return segs.join('');
}

/* 【文章参考 · 加量】用户 2026-10-21：「文章参考增加20篇」
   → 文章参考原来只读 articles-data.js（每个彩种 10 篇）。
     这里把 jc-articles.js 的【头条全量】也读进来（那份每条都带正文字符串），
     每个彩种补到 20 篇：先放原来那 10 篇，再按标题去重往后补。
   ⚠️ 只给「文章参考」用，其它区块一行不动；数据不够就有多少给多少，绝不编标题。 */
const ART_TARGET = 20;

const JC_ART = (function () {
  try {
    const f = path.join(ROOT, 'jc-articles.js');
    if (!fs.existsSync(f)) return null;
    const c = vm.createContext({});
    vm.runInContext(fs.readFileSync(f, 'utf8') + '\n;globalThis.__JC=JC_ARTICLES;', c);
    return c.__JC || null;
  } catch (e) { return null; }
})();

/* 标题归一化去重键（去掉标点空白；和青蛙免费资料那边 keyOf 同一套口径） */
function artKeyOf(s) {
  return String(s || '').replace(/[\s·・\-—_，,。.、：:；;！!？?“”"'（）()【】\[\]]/g, '');
}

/* 从头条那份里挑出该彩种、且没和现有重复的；字符串正文 → 段落数组（artBodyHtml 要数组） */
function artExtraFor(gid, base) {
  const tt = (JC_ART && Array.isArray(JC_ART.toutiao)) ? JC_ART.toutiao : [];
  const have = (base || []).slice();
  const seen = new Set(have.map((x) => artKeyOf(x && x.title)));
  const out = [];
  for (const a of tt) {
    if (have.length + out.length >= ART_TARGET) break;
    if (!a) continue;
    /* 彩种以 game 字段为准；没有就按标题认（头条是按关键词搜的，偶尔会混） */
    let g = String(a.game || '');
    if (!g) {
      const t0 = String(a.title || '');
      if (t0.indexOf('双色球') >= 0) g = 'ssq';
      else if (t0.indexOf('大乐透') >= 0) g = 'dlt';
    }
    if (g !== gid) continue;
    const title = String(a.title || '').replace(/[·・\-—]*\s*免费推荐\s*/g, '').trim();
    if (!title) continue;
    const k = artKeyOf(title);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const raw = String(a.body || a.desc || '').trim();
    const body = raw ? raw.split('\n').map((x) => x.trim()).filter(Boolean) : [];
    out.push({
      title: title,
      date: String(a.time || '').slice(0, 10),
      author: String(a.author || ''),
      body: body,
    });
  }
  return out;
}

function buildArticlesHtml() {
  const data = (ARTICLES && ARTICLES.games) ? ARTICLES.games : null;
  const updated = (ARTICLES && ARTICLES.updated) ? String(ARTICLES.updated) : '';

  let total = 0;
  let artId = 0;                 /* 正文块的 id 序号，页面内唯一，和 data-ro-art 对应 */
  let bodyCnt = 0;               /* 带正文的篇数，日志用 */
  const groupsHtml = ART_ORDER.map((k) => {
    const g = data ? data[k] : null;
    /* __ART_PLUS20__ 用户 2026-10-21：「文章参考增加20篇」
       → 先放 articles-data.js 原来那 10 篇，再用头条那份补到每个彩种 20 篇。
         只补 ssq / dlt（头条只有这两个彩种），别的彩种数据没变就还是 10 篇。 */
    const baseItems = (g && Array.isArray(g.items)) ? g.items : [];
    const items = baseItems.concat(artExtraFor(k, baseItems));
    total += items.length;
    const label = ART_SHORT_NAME[k] || (g && g.name) || k;

    const list = items.length
      ? '<ul class="ro-art-list">' + items.map((it) => {
          const meta = [];
          if (it.author) meta.push(`<span class="ro-art-author">${escape(it.author)}</span>`);
          if (it.date) meta.push(`<span class="ro-art-date">${escape(it.date)}</span>`);

          const body = Array.isArray(it.body) ? it.body : null;
          const hasBody = !!(body && body.length);
          if (hasBody) bodyCnt++;
          const id = ++artId;

          /* 正文：默认收起（CSS 里 display:none），点标题才展开 */
          const bodyHtml = hasBody
            ? `<div class="ro-art-body" id="ro-art-${id}" data-ro-art="${id}">` +
              artBodyHtml(body) +
              `<p class="ro-art-note">正文已存入本页，仅供阅读参考。</p>` +
              `</div>`
            : '';

          return `<li class="ro-art-item${hasBody ? '' : ' ro-art-nobody'}">` +
            `<a class="ro-art-link" href="#ro-art-${id}" data-ro-art="${id}">` +
            `${escape(it.title)}</a>` +
            (meta.length ? `<div class="ro-art-meta">${meta.join('')}</div>` : '') +
            bodyHtml +
            `</li>`;
        }).join('') + '</ul>'
      : '<div class="ro-art-empty">本期暂无</div>';

    /* __GROUP_COL__ 用户要求：每个彩种分组也能收起，并写「点击查看 / 点击收起」。
       默认【展开】（保持原来一眼看到文章的样子）；点一下收起。
       用 details/summary 原生折叠，不写 JS。
       提示文字由 CSS 按 [open] 切换：展开时「点击收起」/ 收起时「点击查看」。 */
    return `<details class="ro-art-group">` +   /* 用户要求：默认收起，点了才展开 */
      `<summary class="ro-art-gname">${escape(label)}<i>${items.length} 篇</i>` +
      `<span class="ro-art-tip" aria-hidden="true"></span></summary>` +
      list +
      `</details>`;
  }).join('');

  /* 【名家图库 · 用户 2026-10-21「文章参考上面加一栏 名家图库 / 里面要分开 双色球 大乐透 3D 排列三 快乐8 类目」
     五个彩种各一格，点开跳到对应彩种的「资料」位置（页内锚点 ✗ 不跳外站 ✔） */
  const ZLDQ_ITEMS = [
    ['双色球', 'ro-g-ssq-main'],
    ['大乐透', 'ro-g-dlt-main'],
    ['3D', 'ro-g-fc3d-main'],
    ['排列三', 'ro-g-pl3-main'],
    ['快乐8', 'ro-g-kl8-main'],
    ['七乐彩', 'ro-g-qlc-main'],
    ['七星彩', 'ro-g-qxc-main']
    /* 「篮球」已删 · 用户 2026-10-21：那是"蓝球"（双色球/大乐透的蓝球 ✗）不是独立彩种 ✔ */
  ];
  /* 【图片塞进名家图库格子 · 用户 2026-10-21 选 A】
     每个格子点开 = 该彩种的名家图（读 mingjia-data.js ✗） */
  const mjByCat = {};
  try {
    const mjf2 = path.join(ROOT, 'mingjia-data.js');
    if (fs.existsSync(mjf2)) {
      const mjsrc2 = fs.readFileSync(mjf2, 'utf8');
      const mj2 = JSON.parse((mjsrc2.match(/const MINGJIA_DATA = ([\s\S]*?);\s*$/) || [])[1] || '{}');
      (mj2.list || []).forEach(function (x) {
        if (!x || !x.name) return;
        x.imgs=(x.imgs||[]).filter(function(im){const until=im.expiresAt?Date.parse(im.expiresAt):Date.parse(im.fetchedAt||'')+172800000;return Number.isFinite(until)&&Date.now()<until;});
        (mjByCat[x.cat] = mjByCat[x.cat] || []).push(x);
      });
    }
  } catch (e) { }

  /* Public current-issue material, independently collected without AI calls. */
  try {
    const feed={entries:[]}; for(const sourceFile of ['mingjia-toutiao.json','mingjia-web.json']){try{const data=JSON.parse(fs.readFileSync(path.join(ROOT,sourceFile),'utf8'));feed.entries.push(...(data.entries||[]));}catch(e){}}
    (feed.entries||[]).forEach(function(item){
      if(Date.parse(item.expiresAt)<=Date.now() || !Number.isFinite(Date.parse(item.expiresAt)))return;
      const people=mjByCat[item.cat]=mjByCat[item.cat]||[];
      let person=people.find(function(p){return p.name===item.author;});
      if(!person){person={name:item.author,cat:item.cat,imgs:[]};people.push(person);}
      person.articles=person.articles||[];
      person.articles.push(item);
      (item.images||[]).forEach(function(src){if(!/^https:\/\//.test(src))return;if(!person.imgs.some(function(im){return im.src===src;}))person.imgs.push({file:src,src:src,issue:item.issue,verified:true});});
    });
  } catch(e) {}

  const zldqHtml = '<details class="ro-zldq frog" id="ro-zldq">' +
    '<summary class="frog-sum"><span class="frog-t"><span class="entry-icon" aria-hidden="true">🧩</span> 图库+字谜</span><span class="frog-go">点击展开 / 收起</span></summary>' +
    '<div class="ro-zldq-tip">点开图看具体内容</div>' +
    '<div class="ro-zldq-row">' +
    ZLDQ_ITEMS.map(function (x) {
      /* 每个彩种格子：点开 = 该彩种的名家图（不跳转 ✗ 原地展开 ✔） */
      const galleryGids={'双色球':'ssq','大乐透':'dlt','3D':'fc3d','排列三':'pl3','快乐8':'kl8','七乐彩':'qlc','七星彩':'qxc'};
      const targetIssue=String(nextIssue(galleryGids[x[0]])||'');
      const matchesIssue=function(v){const n=String(v||'').replace(/[^0-9]/g,'');return !!targetIssue && (n===targetIssue || (n.length===5 && targetIssue.length===7 && n===targetIssue.slice(2)));};
      const people = (mjByCat[x[0]] || []).map(function(p){return Object.assign({},p,{imgs:(p.imgs||[]).filter(function(im){return matchesIssue(im.issue);}),articles:(p.articles||[]).filter(function(a){return matchesIssue(a.issue);})});});
      const issues = new Map();
      function issueGroup(issue) {
        const key=String(issue||'待核实');
        if(!issues.has(key))issues.set(key,{images:[],articles:[]});
        return issues.get(key);
      }
      people.forEach(function(p){
        (p.imgs||[]).forEach(function(im){const g=issueGroup(im.issue);if(!g.images.some(function(v){return (v.src||v.file)===(im.src||im.file);}))g.images.push(im);});
        (p.articles||[]).forEach(function(a){const g=issueGroup(a.issue);if(!g.articles.some(function(v){return v.url===a.url;}))g.articles.push(a);});
      });
      const imgsHtml = issues.size ? Array.from(issues.entries()).sort(function(a,b){return b[0].localeCompare(a[0],undefined,{numeric:true});}).map(function(entry){
        const issue=entry[0],g=entry[1];
        const slides=[],seenImages=new Set();
        g.articles.forEach(function(a){
          const blocks=Array.isArray(a.blocks)&&a.blocks.length?a.blocks:(a.images||[]).map(function(src){return {type:'image',src:src};}).concat(a.excerpt?[{type:'text',text:a.excerpt}]:[]);
          blocks.forEach(function(b){
            if(b.type==='image'&&/^https:\/\//.test(b.src||'')){if(!seenImages.has(b.src)){seenImages.add(b.src);slides.push(b);}}
            else if(b.type==='text'&&String(b.text||'').trim())slides.push({type:'text',text:b.text});
          });
        });
        g.images.forEach(function(im){const src=im.file||im.src;if(!seenImages.has(src)){seenImages.add(src);slides.push({type:'image',src:src});}});
        return '<details class="ro-zldq-issue"><summary>第 '+escape(issue)+' 期 · '+g.images.length+' 张图 · '+slides.filter(function(b){return b.type==='text';}).length+' 段文字</summary>'+
          '<div class="ro-zldq-i">'+slides.map(function(b,index){return '<figure>'+(b.type==='image'?'<img loading="lazy" src="'+escape(b.src).replace(/"/g,'&quot;')+'" alt="第 '+escape(issue)+' 期资料图">':'<div class="ro-zldq-riddle">'+escape(b.text)+'</div>')+'<figcaption>'+(index+1)+' / '+slides.length+'</figcaption></figure>';}).join('')+'</div>'+
          g.articles.map(function(a){return '<div class="ro-zldq-text"><b>'+escape(a.title)+'</b> <a href="'+escape(a.url).replace(/"/g,'&quot;')+'" target="_blank" rel="noopener noreferrer">查看原文</a></div>';}).join('')+'</details>';
      }).join('') : '<div class="ro-zldq-empty">第 '+escape(targetIssue)+' 期暂无资料</div>';
      /* 【去掉「最新资料」几个字 · 用户 2026-10-21】只留彩种名 ✗ */
      return '<details class="ro-zldq-c">' +
        '<summary class="ro-zldq-s"><b>' + x[0] + '</b></summary>' +
        '<div class="ro-zldq-body">' + imgsHtml + '</div></details>';
    }).join('') +
    '</div>' +
    /* 【图片放大 · 用户 2026-10-21「图片要能放大看」】
       点任意图 → 全屏显示，点空白/× 关闭 ✔ */
    '<div id="imgLB" style="position:fixed;inset:0;background:rgba(0,0,0,.93);display:none;z-index:99999;align-items:center;justify-content:center;padding:8px">' +
    '<img id="imgLBi" alt="" style="max-width:96vw;max-height:92vh;object-fit:contain;border-radius:6px">' +
    '<div id="imgLBc" style="position:absolute;top:10px;right:16px;color:#fff;font-size:30px;line-height:1;cursor:pointer">×</div>' +
    '</div>' +
    '<script>(function(){var lb=document.getElementById("imgLB"),im=document.getElementById("imgLBi");if(!lb||!im)return;' +
    'document.addEventListener("click",function(e){var t=e.target;' +
    'if(t&&t.tagName==="IMG"&&(t.closest(".ro-zldq-i")||t.closest(".ro-mj-i"))){e.preventDefault();im.src=t.src;lb.style.display="flex";return;}' +
    'if(t===lb||t.id==="imgLBc"||t.id==="imgLBi"){lb.style.display="none";im.src="";}},false);})();</script>' +
    '</details>';

  /* ===== MINGJIA_GALLERY · 名家图库（build-mingjia.mjs 抓的 50 张图 ✗）===== */
  let mjHtml = '';
  try {
    const mjf = path.join(ROOT, 'mingjia-data.js');
    if (fs.existsSync(mjf)) {
      const mjsrc = fs.readFileSync(mjf, 'utf8');
      const mj = JSON.parse((mjsrc.match(/const MINGJIA_DATA = ([\s\S]*?);\s*$/) || [])[1] || '{}');
      const list = Array.isArray(mj.list) ? mj.list : [];
      const cats = {};
      list.forEach(function (x) { if (!x || !x.imgs || !x.imgs.length) return; (cats[x.cat] = cats[x.cat] || []).push(x); });
      const catNames = Object.keys(cats);
      if (catNames.length) {
        mjHtml = '<section class="ro-mj" id="ro-mj">' +
          '<div class="ro-mj-h">名家图库</div>' +
          catNames.map(function (c) {
            return '<details class="ro-mj-cat"><summary class="ro-mj-cat-h">' + c + '（' + cats[c].length + ' 位）</summary>' +
              cats[c].map(function (p) {
                return '<div class="ro-mj-p"><div class="ro-mj-n">' + p.name + '</div><div class="ro-mj-i">' +
                  p.imgs.map(function (im) { return '<img loading="lazy" src="' + im.file + '" alt="' + p.name + '">'; }).join('') +
                  '</div></div>';
              }).join('') +
              '</details>';
          }).join('') +
          '</section>';
      }
    }
  } catch (e) { }
  return '<details id="monsterHome" class="frog"><summary class="frog-sum"><span class="frog-t"><span class="entry-icon" aria-hidden="true">🦸</span> 奥特曼杀号（小怪兽严父）</span><span class="frog-go">点击展开 / 收起</span></summary><div class="frog-body" id="monsterLab"><div class="frog-chips" id="monsterGid"><div class="frog-chip on" role="button" tabindex="0" data-gid="dlt">大乐透</div><div class="frog-chip" role="button" tabindex="0" data-gid="ssq">双色球</div><div class="frog-chip" role="button" tabindex="0" data-gid="kl8">快乐8</div><div class="frog-chip" role="button" tabindex="0" data-gid="fc3d">福彩3D</div><div class="frog-chip" role="button" tabindex="0" data-gid="pl3">排列三</div><div class="frog-chip" role="button" tabindex="0" data-gid="pl5">排列五</div><div class="frog-chip" role="button" tabindex="0" data-gid="qlc">七乐彩</div><div class="frog-chip" role="button" tabindex="0" data-gid="qxc">七星彩</div></div><div class="frog-out" id="monsterOut"></div></div></details>' + '<details id="boardingHome" class="frog"><summary class="frog-sum" style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px"><span class="frog-t">🚌 谁先上岸</span><span class="frog-go">点击展开 / 收起</span></summary><div class="frog-body"><div id="boardingGame"></div></div></details>' + zldqHtml + `<section class="ro-articles" id="ro-articles">` +
    `<div class="ro-art-head">` +
    `<h2 class="ro-art-title"><span class="entry-icon" aria-hidden="true">📚</span> 文章参考</h2>` +
    `<div class="ro-art-sub">每 30 分钟自动更新` +
    ` · <span id="__ART_CD__">更新倒计时 --:--</span>` +   /* __ART_CD__ 用户要求：改成更新倒计时 */
    `</div>` +
    `</div>` +
    `<div class="ro-art-groups">${groupsHtml}</div>` +
    `</section>`;
}

/* ---------- 【3D & 排列三 手绘参考图】区块 ----------
   用户 2026-10-17 给的完整规格；实现在 p3d-section.mjs（构建期把数据算好内联，
   页面运行时不需要分析器）。数据用 history.js 真开奖近 30 期。
   六码用用户给的 LIUMA_RECOMMEND_MAP（按彩种分开）。 */
const P3D = require(path.join(ROOT, 'p3d-analyzer.js'));
let p3dHtml = P3D_SECTION_MOD.buildP3DSectionHtml(HIST, P3D, {
  periods: 30,
  typeMap: {
    /* 【用户 2026-10-18】「去掉民间字迹」→ 卡面标题不再写「（民间算法）」
       ⚠️ 这里是【真正生效】的那一处（文件里有两处 P3D 调用，后出现的这个才是页面用的） */
    '3d':  { title: '3D 手绘参考图',    name: '福彩3D' },
    'pl3': { title: '排列三 手绘参考图', name: '排列三' }
  },
  liuMaMap: {
    '3d':  { goldDan: 5, silverDan: 2, tuoList: [0, 1, 3, 4] },
    'pl3': { goldDan: 4, silverDan: 7, tuoList: [1, 2, 5, 6] }
  }
});

/* Handwritten-style statistical sheets generated from genuine draw history. */
const handdrawSheets=[];
for(const [gid,name] of [['fc3d','福彩3D'],['pl3','排列三']]){
  const rows=((HIST&&HIST.games||{})[gid]||[]).slice(0,30),counts=Array(10).fill(0);
  rows.forEach(function(r){((r.areas||{}).main||[]).forEach(function(n){if(Number(n)>=0&&Number(n)<=9)counts[Number(n)]++;});});
  if(!rows.length)continue;
  for(const kind of ['近30期数字频次','近5期开奖笔记']){
    let shapes='<rect width="640" height="760" fill="#fffaf0"/><path d="M48 0V760" stroke="#e5b7a6"/>';
    for(let y=80;y<760;y+=38)shapes+='<path d="M18 '+y+' Q320 '+(y-2)+' 622 '+y+'" stroke="#d8dfda" fill="none"/>';
    shapes+='<g font-family="KaiTi,STKaiti,serif" fill="#343f54"><text x="70" y="55" font-size="27">'+name+' · '+kind+'</text><text x="70" y="98" font-size="20">第 '+nextIssue(gid)+' 期参考 · 本站生成</text>';
    if(kind==='近30期数字频次'){
      const max=Math.max(1,...counts);
      counts.forEach(function(n,i){const y=145+i*45;shapes+='<text x="75" y="'+y+'" font-size="23">'+i+'</text><path d="M115 '+(y-7)+' Q'+(120+n/max*170)+' '+(y-14)+' '+(120+n/max*350)+' '+(y-6)+'" fill="none" stroke="'+(i%2?'#356c92':'#af4b40')+'" stroke-width="9" stroke-linecap="round"/><text x="510" y="'+y+'" font-size="20">'+n+' 次</text>';});
      shapes+='<text x="70" y="660" font-size="19">统计样本：'+rows.length+' 期 · 共 '+counts.reduce(function(a,b){return a+b;},0)+' 个数字</text>';
    }else rows.slice(0,5).forEach(function(r,i){const y=170+i*88;shapes+='<text x="72" y="'+y+'" font-size="20">第 '+r.issue+' 期</text><text x="95" y="'+(y+37)+'" font-size="32" fill="#ac4539">'+((r.areas||{}).main||[]).join('     ')+'</text>';});
    shapes+='<text x="70" y="708" font-size="17">手绘风格统计示意 · 历史频次不代表下期概率</text></g>';
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="760" viewBox="0 0 640 760">'+shapes+'</svg>';
    handdrawSheets.push('<figure><img class="handdraw-sheet" loading="lazy" src="data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)+'" alt="'+name+' '+kind+'手绘风格参考图"><figcaption>'+name+' · '+kind+' · 点击放大</figcaption></figure>');
  }
}
if(p3dHtml)p3dHtml=p3dHtml.replace('<div class="p3d-body">','<div class="p3d-body"><details class="handdraw-gallery"><summary>✍️ 本站手绘风格参考图（3D / 排列三）</summary><div style="display:flex;gap:8px;overflow-x:auto">'+handdrawSheets.join('')+'</div></details>');

console.log('  · 3D 手绘参考图：' + (p3dHtml
  ? '已生成（' + (Buffer.byteLength(p3dHtml, 'utf8') / 1024).toFixed(1) + ' KB）'
  : '无数据 → 整块不渲染'));

const articlesHtml = buildArticlesHtml();

/* ============================================================
   __ZX_CARDS__ 【智讯】+【智能精选】两张卡（用户新增需求）
   ------------------------------------------------------------
   用户原话：截图圈了【手绘参考图 / 参考图】那一排下面那两个空位 →
            「帮我增加两个项目栏  智讯  和  智能精选」
   位置：紧跟在【手绘参考图 + 参考图】那一排下面（见模板里的 __ZN_ROW__）。

   ① 智讯 = 今天 / 明天开奖日程（彩种 · 期号 · 开奖时刻）
            + 最近开奖（几个彩种各取最新一期，带号码）
            + 最新资讯标题
     内容全部用页面【已有的数据文件】现算，一个字都不编：
       · 最近开奖 / 号码   ← 开奖历史 DRAW_HISTORY（history.js）
       · 期号 / 开奖日     ← nextIssue / nextDate（draw-data.js）
       · 开奖时刻          ← latest-draws.js 的 NEXTCD_TABLE（页面倒计时同一张表）
       · 资讯标题          ← 文章数据 ARTICLES_DATA（articles-data.js）
     取不到的项整块不渲染（不显示空壳、更不放假数据）。

   ② 智能精选 = 近 30 期频次算出的【胆码 3 / 杀号 3 / 精选 1 注】
       · 只读开奖历史，原来的 20 码算法一行都没动
       · 随机数用【期号做种子】的确定性序列（FNV-1a 哈希 + mulberry32），
         不用 Math.random → 同一期生成多少次都是同一注
       · 号码范围 / 每注抽几个号，全部从 GAMES 里取，一个都不写死
       · 抽号按频次加权（热号更容易进注），但冷号也有机会 —— 不是纯随机

   ⚠️ 两张卡都是【纯文字】：没有图片（图位数量不变）、没有 button 标签、
      没有内联事件（展开 = 原生 <details> + CSS 伪元素按 [open] 换字）。
   ============================================================ */
function zxP2(n) { return n < 10 ? '0' + n : String(n); }

/* 今天 / 明天（本机日期字符串 YYYY-MM-DD）
   —— 和 draw-data.js 里 nextDrawDate 同一个口径（那边也是本机日期） */
function zxDay(off) {
  const t = new Date();
  t.setDate(t.getDate() + (Number(off) || 0));
  return t.getFullYear() + '-' + zxP2(t.getMonth() + 1) + '-' + zxP2(t.getDate());
}

/* 开奖时刻表：优先用 latest-draws.js 那张（NEXTCD_TABLE），
   取不到才用下面这份兜底 —— 兜底值和那张表逐项相同，两处要一起改。 */
const ZX_SCHED = (function () {
  const out = {};
  const put = (gid, h, m, days) => { out[gid] = { t: zxP2(h) + ':' + zxP2(m), days: days }; };
  let src = null;
  try { src = (NEXTCD && typeof NEXTCD === 'object') ? NEXTCD : null; } catch (e) { src = null; }
  if (src) {
    for (const gid of Object.keys(src)) {
      const r = src[gid] || {};
      if (!Array.isArray(r.hm) || !Array.isArray(r.days)) continue;
      put(gid, Number(r.hm[0]) || 0, Number(r.hm[1]) || 0, r.days);
    }
  }
  if (!Object.keys(out).length) {
    console.log('  ⚠️ 智讯：NEXTCD_TABLE 取不到 → 开奖时刻改用内置兜底表（数值相同）');
    const FB = {
      ssq: [21, 15, [0, 2, 4]], dlt: [20, 30, [1, 3, 6]],
      fc3d: [21, 15, [0, 1, 2, 3, 4, 5, 6]], pl3: [20, 30, [0, 1, 2, 3, 4, 5, 6]],
      pl5: [20, 30, [0, 1, 2, 3, 4, 5, 6]], qxc: [20, 30, [0, 2, 5]],
      qlc: [21, 15, [1, 3, 5]], kl8: [21, 30, [0, 1, 2, 3, 4, 5, 6]]
    };
    for (const gid of Object.keys(FB)) put(gid, FB[gid][0], FB[gid][1], FB[gid][2]);
  }
  return out;
})();

/* 一期开奖 → 一行号码纯文字（区顺序 / 分隔符照 GAMES 里的 areas，不另起一套） */
function zxNumText(gid, draw) {
  const g = { name: ZX_GNAMES[gid] || gid };
  const a = (draw && draw.areas) ? draw.areas : {};
  const parts = [];
  if (g.type === 'digit') {
    (a.main || []).forEach((n) => parts.push(String(n)));
    return parts.join(' ');
  }
  if (g.type === 'qxc') {
    return (a.front || []).map(String).join(' ') + ' + ' +
           (a.back || []).map(String).join(' ');
  }
  if (g.playModes) {          /* 快乐8 一期 20 个号：只写前 6 个，后面用省略号 */
    const m = a.main || [];
    return m.slice(0, 6).map((n) => zxP2(n)).join(' ') + (m.length > 6 ? ' …' : '');
  }
  (g.areas || []).forEach((area, i) => {
    if (i > 0) parts.push(area.key === 'special' ? '★' : '+');
    (a[area.key] || []).forEach((n) => parts.push(zxP2(n)));
  });
  return parts.join(' ');
}

/* 最近开奖：每个彩种只取最新一期（别 5 条全一样），
   双色球 / 大乐透永远排前面（页面主推这两个），其余按日期倒序 */
function zxRecentRows(n) {
  const ZX_MAIN = ['ssq', 'dlt'];
  const rows = [];
  const games = (HIST && HIST.games) ? HIST.games : null;
  if (!games) return rows;
  for (const gid of Object.keys(games)) {
    const g = { name: ZX_GNAMES[gid] || gid };
    if (!g) continue;
    const arr = Array.isArray(games[gid]) ? games[gid] : [];
    const it = arr.length ? arr[0] : null;      /* history 每个彩种都是最新一期在最前 */
    if (!it || !it.issue || !it.areas) continue;
    rows.push({ gid: gid, date: String(it.date || ''), issue: String(it.issue),
                name: g.name || gid, nums: zxNumText(gid, it) });
  }
  rows.sort((x, y) => {
    const px = ZX_MAIN.indexOf(x.gid), py = ZX_MAIN.indexOf(y.gid);
    const rx = px < 0 ? 99 : px, ry = py < 0 ? 99 : py;
    if (rx !== ry) return rx - ry;
    if (x.date !== y.date) return x.date < y.date ? 1 : -1;
    return x.issue < y.issue ? 1 : x.issue > y.issue ? -1 : 0;
  });
  return rows.slice(0, n || 5);
}

/* 今天 / 明天开哪几个彩种（期号 + 开奖时刻）*/
/* 【修复 2026-10-21】原实现引用未定义的 GAMES → ReferenceError: GAMES is not defined
   （生成直接中断、页面不更新）。改用本文件内的彩种名映射。 */
const ZX_GNAMES = { ssq: '双色球', dlt: '大乐透', kl8: '快乐8', qlc: '七乐彩', qxc: '七星彩', fc3d: '福彩3D', pl3: '排列3', pl5: '排列5' };
function zxSchedRows() {
  const today = zxDay(0), tomorrow = zxDay(1);
  const out = [];
  for (const gid of Object.keys(ZX_SCHED)) {
    const g = { name: ZX_GNAMES[gid] || gid };
    if (!g) continue;
    let d = '';
    try { d = String(nextDate(gid) || ''); } catch (e) { d = ''; }
    if (d !== today && d !== tomorrow) continue;
    let issue = '';
    try { issue = String(nextIssue(gid) || ''); } catch (e) { issue = ''; }
    out.push({ tag: d === today ? '今天' : '明天', name: g.name || gid,
               issue: issue, time: ZX_SCHED[gid].t });
  }
  out.sort((x, y) => {
    if (x.tag !== y.tag) return x.tag === '今天' ? -1 : 1;
    return x.time < y.time ? -1 : x.time > y.time ? 1 : 0;
  });
  return out;
}

/* 标题清洗：去掉任何网址 / 域名痕迹（页面上不出现"从哪来的"字眼） */
function zxCleanText(s) {
  return String(s == null ? '' : s)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[A-Za-z0-9-]+\.(?:com|cn|net|org|cc|tv|me|io|info)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* 最新资讯标题：文章数据里最新的几条（按日期倒序，去重） */
function zxNewsItems(n) {
  const games = (ARTICLES && ARTICLES.games) ? ARTICLES.games : null;
  if (!games) return [];
  const all = [];
  for (const gid of ART_ORDER) {
    const g = { name: ZX_GNAMES[gid] || gid };
    const items = (g && Array.isArray(g.items)) ? g.items : [];
    for (const it of items) {
      if (!it || !it.title) continue;
      const t = zxCleanText(it.title);
      if (!t || t.length < 6) continue;
      all.push({ t: t, d: String(it.date || '') });
    }
  }
  all.sort((a, b) => {
    if (!!b.d !== !!a.d) return b.d ? 1 : -1;
    if (!a.d) return 0;
    return a.d < b.d ? 1 : a.d > b.d ? -1 : 0;
  });
  const seen = new Set();
  const out = [];
  for (const x of all) {
    const key = x.t.slice(0, 12);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x.t);
    if (out.length >= (n || 3)) break;
  }
  return out;
}

/* 一期资讯 = 标题 + 日期 + 一行摘要；带正文的能原地展开（原生 <details>，
   和「文章参考」那种点标题就地展开同一套，不用脚本、不用 button 标签）。
   ⚠️ 正文只取前 6 段纯文字，图片那种 { i: 地址 } 元素一律跳过
      → 这张卡【不新增任何图片】，页面图位数量不变。 */
function zxArticleItem(it) {
  if (!it) return '';
  const title = zxCleanText(it.title);
  if (!title) return '';
  const date = zxDateText(it.date);
  const tag = String(it.tag || '').trim();
  const body = Array.isArray(it.body) ? it.body : [];
  const paras = body
    .filter((s) => typeof s === 'string' && s.trim())
    .map((s) => zxCleanText(s))
    .filter(Boolean)
    .slice(0, 3);
  const brief = paras.length ? (paras[0].length > 40 ? paras[0].slice(0, 40) + '…' : paras[0]) : '';
  const tagHtml = tag ? '<span class="ro-zn-at-n">' + escape(tag) + '</span>' : '';
  const dateHtml = date ? '<span class="ro-zn-at-d">' + escape(date) + '</span>' : '';
  if (!paras.length) {
    return '<div class="ro-zn-at-row"><span class="ro-zn-at-t">' + escape(title) + tagHtml + '</span>' +
      dateHtml + '</div>';
  }
  return '<details class="ro-zn-art"><summary class="ro-zn-at">' +
    '<span class="ro-zn-at-t">' + escape(title) + tagHtml + '</span>' + dateHtml +
    (brief ? '<span class="ro-zn-at-b">' + escape(brief) + '</span>' : '') +
    '</summary><div class="ro-zn-at-body">' +
    paras.map((p) => '<p>' + escape(p) + '</p>').join('') +
    '</div></details>';
}

/* ---------- 资讯「只要最新一期」的筛选（用户 2026-10-21 原话：
   「资讯也要抓取最新一期的信息」） ----------
   以前的毛病：zx-news.json 是按彩种分的，抓到啥显示啥 → 可能是几篇文章混着几天，
   用户要的是"当期"那几条。这里在【渲染端】筛一遍（抓取端也按同一套排序，见
   fetch-zx-news.mjs 的 ISSUE_REF）：
     ① 期号匹配：算出这个彩种的【当期期号】（= 下一期，draw-data.js 的 nextIssue）
        和【刚开完这期】（history 最新一期的 issue）——
        标题里带当期期号 → 第一档；带刚开完那期 → 第二档；标题里写"本期/当期"→ 第三档；
        其余 → 最后。标题里的「121期」「第121期」「2026121」都认。
     ② 日期倒序：同一档内从新到旧。
     ③ 只留最近几天：默认 3 天；3 天内凑不够 4 条就放宽到 8 天，再不够就全留
        （数据少时宁可留着也不补假条目）。
     ④ 一条"当期"都没有（现实里很常见）→ 仍按日期倒序，最新那条打「最新」标。
        只标位置，不改标题、不编期号。 */
const ZX_RECENT_DAYS = 3;
const ZX_RELAX_DAYS = 8;
const ZX_MIN_ROWS = 4;

/* 日期距今几天（按构建那一刻算；日期坏了就当很旧，自然排在后面） */
function zxDaysAgo(dateStr) {
  const t = Date.parse(String(dateStr || '').trim() + 'T00:00:00');
  if (!isFinite(t)) return 1e9;
  return (Date.now() - t) / 86400000;
}

/* 资讯日期怎么显示：今天 / 昨天 / 10-20（跨天了就直接给月-日，不写"几天前"） */
function zxDateText(dateStr) {
  const s = String(dateStr || '').trim();
  if (!s) return '';
  const d = zxDaysAgo(s);
  if (d < 0) return s.slice(5);
  if (d < 1) return '今天';
  if (d < 2) return '昨天';
  return s.slice(5);
}

/* 标题里有没有这个期号：
   · 完整期号直接出现（2026121 / 26121）→ 有
   · 只写序号的（「121期」「第 121 期」）→ 按序号比，前面不能粘着别的数字
     （否则「2121期」会被误判成 121 期） */
function zxIssueHit(title, issue) {
  const s = String(title || '');
  const is = String(issue || '').trim();
  if (!s || !/^\d{5,8}$/.test(is)) return false;
  if (s.indexOf(is) >= 0) return true;
  const seq = String(parseInt(is.slice(is.length >= 7 ? 4 : 2), 10));
  if (!seq || seq === 'NaN') return false;
  try { return new RegExp('(^|[^0-9])' + seq + '\\s*期').test(s); } catch (e) { return false; }
}

/* 某个彩种的「当期（下一期）/ 刚开完这期」期号；取不到就是空串（不编） */
function zxIssueRef(gid) {
  let next = '', last = '';
  try { next = String(nextIssue(gid) || ''); } catch (e) { next = ''; }
  try {
    const arr = (HIST && HIST.games && Array.isArray(HIST.games[gid])) ? HIST.games[gid] : [];
    last = arr.length ? String(arr[0].issue || '') : '';
  } catch (e) { last = ''; }
  return { next: next, last: last };
}

/* 把一堆资讯筛成"最新一期"那几条（返回条目数组，第一条带 tag：本期 / 最新） */
function zxNewsLatest(items, gid, n) {
  const ref = zxIssueRef(gid);
  const list = (Array.isArray(items) ? items : []).filter((it) => it && it.title);
  const scored = list.map((it, i) => {
    let tier = 3;
    const t = String(it.title || '');
    if (ref.next && zxIssueHit(t, ref.next)) tier = 0;
    else if (ref.last && ref.last !== ref.next && zxIssueHit(t, ref.last)) tier = 1;
    else if (/当期|本期|最新一期/.test(t)) tier = 2;
    return { it: it, tier: tier, days: zxDaysAgo(it.date), i: i };
  });
  scored.sort((a, b) => (a.tier - b.tier) || (a.days - b.days) || (a.i - b.i));

  /* 期号对得上的（当期 / 刚开完那期）不设日期上限，其余按最近几天截 */
  let rows = [];
  for (const days of [ZX_RECENT_DAYS, ZX_RELAX_DAYS, Infinity]) {
    rows = scored.filter((x) => (x.tier <= 1) || (x.days <= days));
    if (rows.length >= ZX_MIN_ROWS) break;
  }
  rows = rows.slice(0, n || 8);

  const out = rows.map((x) => ({
    title: x.it.title, date: x.it.date, url: x.it.url, body: x.it.body, tier: x.tier,
  }));
  /* 第一条永远有个标：期号对得上当期 → 「本期」；没有当期 → 「最新」（只标位置） */
  if (out.length) out[0].tag = (out[0].tier === 0) ? '本期' : '最新';
  return out;
}

/* 智讯卡里那排「按彩种切」的药丸（和青蛙家园功能中心的 .frog-chip 同一套外观/手法：
   div + role="button" + tabindex，没有 button 标签） */
const ZX_TABS = [['ssq', '双色球'], ['dlt', '大乐透'], ['fc3d', '福彩3D'], ['pl3', '排列3']];

/* ---------- zx-news.json（fetch-zx-news.mjs 抓来的资讯） ----------
   「智讯」卡的资讯行【优先】用它；没有这个文件、或者读坏了 →
   一行都不改地退回原来那套 ARTICLES_DATA（articles-data.js）兜底，
   所以删掉/缺这个文件时构建照跑，行为和以前完全一样。
   页面禁用词（500 / 抓取 / 来源）在这里再挡一道，正文里一个字都不留。 */
const ZX_NEWS = (function () {
  try {
    const f = path.join(ROOT, 'zx-news.json');
    if (!fs.existsSync(f)) return null;
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const src = (d && d.games && typeof d.games === 'object') ? d.games : null;
    if (!src) return null;
    const BAD = ['500', '抓取', '来源', '新浪', '中彩'];
    const out = {};
    let total = 0;
    for (const pair of ZX_TABS) {
      const gid = pair[0];
      const arr = Array.isArray(src[gid]) ? src[gid] : [];
      const keep = arr.filter(function (x) {
        const t = (x && typeof x.title === 'string') ? x.title.trim() : '';
        if (!t) return false;
        for (const w of BAD) if (t.indexOf(w) >= 0) return false;
        return true;
      }).slice(0, 8).map(function (x) {
        return {
          title: x.title.trim(),
          date: String(x.date || '').trim(),
          url: String(x.url || ''),
        };
      });
      if (keep.length) { out[gid] = keep; total += keep.length; }
    }
    return total ? { games: out, total: total } : null;
  } catch (e) { return null; }
})();

/* ---------- 智讯卡的 HTML ----------
   ⚠️ 曾有一版注释写「用户说 开奖日程/最近开奖/资讯 这些都不要」——那是理解错了，已作废。
   用户 2026-10-20 的原话是：「分排列 3D 大乐透 双色球 分开类目 然后实时抓取」
   → 这张卡 = 开奖日程 + 最近开奖 + 号码特征走势分析 + 最新资讯（4 个彩种分开切） */
const ZX_FEATURE_GAMES = [['ssq', '双色球'], ['dlt', '大乐透'],
  ['fc3d', '福彩3D'], ['pl3', '排列3'], ['pl5', '排列5']];
function zxFeatureRows() {
  const HIST = (mqReadGlobal('DRAW_HISTORY') || {}).games || {};
  const out = [];
  for (const pair of ZX_FEATURE_GAMES) {
    const gid = pair[0], name = pair[1];
    const draws = Array.isArray(HIST[gid]) ? HIST[gid] : [];
    if (!draws.length) continue;
    const g = (typeof G !== 'undefined' && G[gid]) ? G[gid] : {};
    const areaKey = (g.type === 'qxc') ? 'front'
      : (g.type === 'digit') ? 'main'
      : (gid === 'ssq') ? 'red' : (gid === 'dlt') ? 'front' : 'main';
    const numsOf = (d) => (((d && d.areas) || {})[areaKey] || []).map(Number).filter((n) => Number.isFinite(n));

    const recent = draws.slice(0, 30);
    const freq = new Map();
    recent.forEach((d) => numsOf(d).forEach((n) => freq.set(n, (freq.get(n) || 0) + 1)));
    const rank = Array.from(freq.entries()).sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]));
    const hot = rank.slice(0, 3).map((x) => zxP2(x[0])).join(' ');
    const cold = rank.slice(-3).reverse().map((x) => zxP2(x[0])).join(' ');

    const last = numsOf(draws[0]);
    if (!last.length) continue;
    const sum = last.reduce((a, b) => a + b, 0);
    const span = Math.max.apply(null, last) - Math.min.apply(null, last);
    const odd = last.filter((n) => (n % 2) === 1).length;
    const bigLine = (gid === 'fc3d' || gid === 'pl3' || gid === 'pl5' || gid === 'qxc') ? 5
      : (gid === 'kl8' ? 41 : 17);
    const big = last.filter((n) => n >= bigLine).length;

    /* 【综合本期看好】乐透型：热号 3 个 + 蓝球/后区热 2 个；
       数字彩：每一位近 30 期最热的那个数字（定位）。 */
    let look = '';
    if (gid === 'fc3d' || gid === 'pl3' || gid === 'pl5') {
      const posLabels = (gid === 'pl5') ? ['万', '千', '百', '十', '个'] : ['百', '十', '个'];
      const per = [];
      for (let p = 0; p < posLabels.length; p++) {
        const pf = new Map();
        recent.forEach((d) => {
          const v = numsOf(d)[p];
          if (Number.isInteger(v)) pf.set(v, (pf.get(v) || 0) + 1);
        });
        const top = Array.from(pf.entries()).sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]))[0];
        if (top) per.push(posLabels[p] + String(top[0]));
      }
      look = '定位 ' + per.join(' ');
    } else {
      const backKey = (gid === 'ssq') ? 'blue' : (gid === 'dlt') ? 'back' : null;
      let backTxt = '';
      if (backKey) {
        const bf = new Map();
        recent.forEach((d) => (((d.areas || {})[backKey]) || []).forEach((n) => bf.set(n, (bf.get(n) || 0) + 1)));
        const bt = Array.from(bf.entries()).sort((a, b) => (b[1] - a[1]) || (a[0] - b[0])).slice(0, 2);
        if (bt.length) backTxt = ' ＋ ' + bt.map((x) => zxP2(x[0])).join(' ');
      }
      look = '看好 ' + hot + backTxt;
    }

    /* 【走势分析】近 5 期和值走向 + 跨度区间 */
    const last5 = draws.slice(0, 5).map((d) => numsOf(d)).filter((a) => a.length);
    const sums5 = last5.map((a) => a.reduce((x, y) => x + y, 0));
    const spans5 = last5.map((a) => Math.max.apply(null, a) - Math.min.apply(null, a));
    const sumTxt = sums5.length ? sums5.slice().reverse().join(' → ') : '—';
    const spanLo = spans5.length ? Math.min.apply(null, spans5) : 0;
    const spanHi = spans5.length ? Math.max.apply(null, spans5) : 0;
    let dir = '震荡';
    if (sums5.length >= 3) {
      if (sums5[0] > sums5[2] + 5) dir = '走高';
      else if (sums5[0] < sums5[2] - 5) dir = '走低';
    }
    const trend = '近5期和值 ' + sumTxt + '（' + dir + '）· 跨度 ' + spanLo + '~' + spanHi;

    out.push({
      name: name,
      issue: String(draws[0].issue || ''),
      line: '热号 ' + hot + ' · 冷号 ' + cold +
        ' · 上期和值 ' + sum + ' · 跨度 ' + span +
        ' · 奇偶 ' + odd + ':' + (last.length - odd) +
        ' · 大小 ' + big + ':' + (last.length - big),
      look: look,
      trend: trend
    });
  }
  return out;
}

/* ---------- 智讯卡的 HTML ----------
   用户 2026-10-20：「分排列 3D 大乐透 双色球 分开类目 然后实时抓取」
   → 这张卡 = 开奖日程 + 最近开奖 + 号码特征走势分析 + 最新资讯（4 个彩种分开切）
   ⚠️ 四块【并存】，一块都不删：走势分析是后来加的，资讯是用户要的实时内容。 */
function buildZxNewsHtml() {
  const sched = zxSchedRows();
  const recent = zxRecentRows(5);
  const feature = zxFeatureRows();
  const artGames = (ARTICLES && ARTICLES.games) ? ARTICLES.games : null;

  /* 最新资讯：每个彩种最多 8 条
     ① 先看 zx-news.json（有就用它：标题 + 日期）→ 再按「最新一期」筛
        （期号匹配优先 → 日期倒序 → 只留最近几天，见 zxNewsLatest）
     ② 该彩种没有 → 才退回 articles-data.js（原来的兜底逻辑，一行没改） */
  const panes = [];
  ZX_TABS.forEach((pair) => {
    const gid = pair[0], name = pair[1];
    const nx = (ZX_NEWS && ZX_NEWS.games && ZX_NEWS.games[gid]) ? ZX_NEWS.games[gid] : null;
    const g = artGames ? artGames[gid] : null;
    const items = (nx && nx.length) ? zxNewsLatest(nx, gid, 8)
      : ((g && Array.isArray(g.items)) ? g.items.slice(0, 8) : []);
    const rows = items.map(zxArticleItem).filter(Boolean).join('');
    if (rows) panes.push({ gid: gid, name: name, html: rows });
  });

  const out = [];

  /* ① 开奖日程 */
  if (sched.length) {
    out.push('<div class="ro-zn-blk"><div class="ro-zn-bh">开奖日程</div>');
    for (const r of sched) {
      out.push('<div class="ro-zn-row">' +
        '<span class="ro-zn-tag">' + escape(r.tag) + '</span>' +
        '<span class="ro-zn-g">' + escape(r.name) + '</span>' +
        '<span class="ro-zn-i">第 ' + escape(r.issue) + ' 期</span>' +
        '<span class="ro-zn-t">' + escape(r.time) + '</span></div>');
    }
    out.push('</div>');
  }

  /* ② 最近开奖 */
  if (recent.length) {
    out.push('<div class="ro-zn-blk"><div class="ro-zn-bh">最近开奖</div>');
    for (const r of recent) {
      out.push('<div class="ro-zn-row">' +
        '<span class="ro-zn-d">' + escape(String(r.date || '').slice(5)) + '</span>' +
        '<span class="ro-zn-g">' + escape(r.name) + '</span>' +
        '<span class="ro-zn-i">第 ' + escape(r.issue) + ' 期</span></div>' +
        '<div class="ro-zn-n">' + escape(r.nums) + '</div>');
    }
    out.push('</div>');
  }

  /* ③ 号码特征走势分析 */
  if (feature.length) {
    out.push('<div class="ro-zn-blk"><div class="ro-zn-bh">号码特征走势分析</div>');
    for (const r of feature) {
      out.push('<div class="ro-zn-row">' +
        '<span class="ro-zn-g">' + escape(r.name) + '</span>' +
        '<span class="ro-zn-i">第 ' + escape(r.issue) + ' 期</span></div>');
      out.push('<div class="ro-zn-n">' + escape(r.line) + '</div>');
      if (r.look) out.push('<div class="ro-zn-n"><b>综合本期看好 </b>' + escape(r.look) + '</div>');
      if (r.trend) out.push('<div class="ro-zn-n"><b>走势分析 </b>' + escape(r.trend) + '</div>');
    }
    out.push('</div>');
  }

  /* ④ 最新资讯：4 颗药丸，点哪个切哪个（和智能精选同一套 class，属性名是 data-zx-*） */
  if (panes.length) {
    out.push('<div class="ro-zn-blk"><div class="ro-zn-bh">最新资讯</div>');
    out.push('<div class="ro-zn-chips" id="ro-zn-chips">');
    panes.forEach((p, i) => {
      out.push('<div class="ro-zn-chip' + (i === 0 ? ' on' : '') + '" role="button" tabindex="0"' +
        ' data-zx-game="' + p.gid + '">' + escape(p.name) + '</div>');
    });
    out.push('</div>');
    panes.forEach((p, i) => {
      out.push('<div class="ro-zn-pane' + (i === 0 ? ' is-on' : '') + '" data-zx-pane="' + p.gid + '">' +
        p.html + '</div>');
    });
    out.push('</div>');
  }

  if (!out.length) return '<div class="ro-zn-none">本期暂无内容</div>';
  out.push('<div class="ro-zn-foot">每期自动更新 · 仅供娱乐参考</div>');
  return out.join('');
}

/* ---------- 智能精选：频次 + 期号做种子的确定性选号 ---------- */
const ZX_PERIODS = 30;

/* FNV-1a 32 位哈希：同一个期号永远得到同一个种子 */
function zxSeed(str) {
  let h = 2166136261;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/* mulberry32：确定性伪随机（同一个种子 → 同一串数），页面里不用 Math.random */
function zxRnd(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 某个区近 30 期每个号出现几次 */
function zxFreq(gid, key) {
  const freq = {};
  const games = (HIST && HIST.games) ? HIST.games : null;
  const arr = (games && Array.isArray(games[gid])) ? games[gid] : [];
  for (const it of arr.slice(0, ZX_PERIODS)) {
    const nums = (it && it.areas && Array.isArray(it.areas[key])) ? it.areas[key] : [];
    for (const v of nums) {
      const k = Number(v);
      if (isFinite(k)) freq[k] = (freq[k] || 0) + 1;
    }
  }
  return freq;
}

/* 胆码（最热的 3 个）/ 杀号（最冷的 3 个）—— 只排主区（红球 / 前区） */
function zxHotCold(freq, area, k) {
  const all = [];
  for (let n = area.from; n <= area.to; n++) all.push({ n: n, c: freq[n] || 0 });
  const hot = all.slice().sort((a, b) => (b.c - a.c) || (a.n - b.n)).slice(0, k);
  const cold = all.slice().sort((a, b) => (a.c - b.c) || (a.n - b.n)).slice(0, k);
  return { hot: hot, cold: cold };
}

/* 按频次加权、无放回抽号（热号权重高，冷号也有机会）
   skip = 可选的黑名单（{ 号码: 1 }）—— 数字彩的「精选一注」要避开杀号那几个数字 */
function zxChoose(area, freq, k, rnd, skip) {
  const pool = [];
  for (let n = area.from; n <= area.to; n++) {
    if (skip && skip[n]) continue;
    pool.push({ n: n, w: 1 + (freq[n] || 0) * 2 });
  }
  const out = [];
  for (let i = 0; i < k && pool.length; i++) {
    let total = 0;
    for (const p of pool) total += p.w;
    let r = rnd() * total;
    let idx = pool.length - 1;
    for (let j = 0; j < pool.length; j++) {
      r -= pool[j].w;
      if (r <= 0) { idx = j; break; }
    }
    out.push(pool[idx].n);
    pool.splice(idx, 1);
  }
  return out.sort((a, b) => a - b);
}

/* 三区比（把区间三等分，只用来展示，不参与选号） */
function zxZones(nums, area) {
  const size = Math.ceil((area.to - area.from + 1) / 3);
  const z = [0, 0, 0];
  for (const n of nums) {
    let i = Math.floor((n - area.from) / size);
    if (i < 0) i = 0;
    if (i > 2) i = 2;
    z[i]++;
  }
  return z.join(':');
}

/* ---------- 智能精选卡的 HTML ----------
   用户原话（逐字）：「智能精选也要 双色球大乐透排三3D」
   → 一张卡里放【4 个彩种】：① 双色球 ② 大乐透 ③ 排列3 ④ 福彩3D
   布局：彩种药丸切换（一次只看一个）
     · 卡是半屏宽（375 下约 168px）：4 块竖排会把卡拉得很长，2×2 挤成蜂巢也不好读
     · 药丸和「智讯」那一排【同一套外观与手法】（.ro-zn-chips / .ro-zn-chip / .ro-zn-pane）
     · 属性名换成 data-zxp-*，两张卡各管各的，互不干扰
   两个号型：
     · 乐透型（双色球 / 大乐透）：胆码 3 / 杀号 3 / 精选 1 注（主区 + 副区）
     · 数字彩（排列3 / 福彩3D）：胆码 4 个 0~9 / 杀号 3 个 0~9 / 精选 1 注 = 3 位号码（直选）
       附加：和值 · 跨度 · 组选形态（组三 / 组六 / 豹子）
   种子 = FNV-1a(gid|期号) → mulberry32：gid 进种子 → 每个彩种都不一样，
   同一期永远同一注（无 Math.random），排3 和 3D 的号自然也不会撞。

   __PICK_GUARD__ 用户 2026-10-21（第二轮）：「虽然有算法 但是推荐号码要保证
   每期不一样 怎么都要修改几个」——原来的胆码 / 杀号是【纯频次排序】，
   相邻两期的 30 期窗口只差一期 → 实测 2026121 vs 2026120 胆码 3/3、
   杀号 3/3 完全相同，一期都没换过。现在改成：
     · 胆码 / 杀号 → pickGuard.bandedHotCold()：先按次数排名取「候选带」，
       带内按次数加权抽号，抽号用【期号种子】驱动 → 每期在带内换一批
     · 三项（胆码 / 杀号 / 精选一注）各自过 pick-guard 的阈值校验：
         乐透型 胆码≥2 个不同 / 杀号≥1 / 精选≥3
         数字彩 胆码≥2 个不同 / 杀号≥1 / 精选≥2（只有 3 位）
       不合格 → 种子加固定盐 '|v2' / '|v3' … 重摇，最多 50 次（可复现）
   --------------------------------------------------------- */
const ZX_PICK_ORDER = ['ssq', 'dlt', 'pl3', 'fc3d'];

/* 取 games.js 里的彩种配置：export-static 里叫 G，片段自检脚本里叫 GAMES */
function zxGameCfg(gid) {
  if (typeof G !== 'undefined' && G && G[gid]) return G[gid];
  if (typeof GAMES !== 'undefined' && GAMES && GAMES[gid]) return GAMES[gid];
  return null;
}

/* 数字彩在 games.js 里只有「位数」、没有 areas →
   当成一个 0~9 的号码区（每期开 digits 个，开奖允许重复） */
function zxDigitArea(g) {
  return {
    key: 'main', label: '各位',
    from: Number(g.from || 0), to: Number(g.to || 9),
    pick: Number(g.digits || 3)
  };
}

/* 数字彩第 pos 位（0=百位 / 1=十位 / 2=个位）近 30 期每个数字出现几次 */
function zxPosFreq(gid, pos) {
  const freq = {};
  const games = (HIST && HIST.games) ? HIST.games : null;
  const arr = (games && Array.isArray(games[gid])) ? games[gid] : [];
  for (const it of arr.slice(0, ZX_PERIODS)) {
    const nums = (it && it.areas && Array.isArray(it.areas.main)) ? it.areas.main : [];
    const v = Number(nums[pos]);
    if (isFinite(v)) freq[v] = (freq[v] || 0) + 1;
  }
  return freq;
}

/* 3 位数字的组选形态：豹子（三位同） / 组三（两位同） / 组六（三位都不同） */
function zxShape(nums) {
  const a = nums[0], b = nums[1], c = nums[2];
  if (a === b && b === c) return '豹子';
  if (a === b || b === c || a === c) return '组三';
  return '组六';
}

/* 一行「胆码 / 杀号 / 精选一注」的公共外壳 */
function zxPickRow(kind, label, inner) {
  return '<div class="ro-zn-row"><span class="ro-zn-k is-' + kind + '">' + label + '</span>' +
    '<span class="ro-zn-sel">' + inner + '</span></div>';
}

/* ============================================================
   __PICK_GUARD__ 智能精选「一期」的数据（纯函数：期号 + 盐 → 号码）
   ------------------------------------------------------------
   输入：gid / issue / salt（' '=不加盐，'|v2' '|v3' … = 重摇第 N 次）
   输出：{ dan:[], sha:[], pick:[], hot, cold, ...展示用字段 }
     dan / sha / pick 这三个数组就是 pick-guard 校验的对象。
   同一 (gid, issue, salt) → 永远同一组号（没有任何 Math.random）。
   ============================================================ */
function zxPickData(gid, issue, salt, areas, digit) {
  const arr = (HIST && HIST.games && Array.isArray(HIST.games[gid])) ? HIST.games[gid] : [];
  const seedSrc = issue || String((arr[0] && arr[0].issue) || gid);
  const rnd = zxRnd(zxSeed(gid + '|' + seedSrc + (salt || '')));
  if (digit) {
    /* ===== 数字彩：胆码 4 个 0~9 / 杀号 3 个 0~9 / 精选 1 注 = 3 位号码 ===== */
    const area = areas[0];
    const freq = zxFreq(gid, 'main');           /* 30 期 × 3 位 = 90 个样本 */
    const hc = pickGuard.bandedHotCold(freq, area, 4, rnd, 2, 3);
    const hot = hc.hot, cold = hc.cold;
    /* 精选一注：按【每一位】的频次加权抽号，并避开杀号那 3 个数字 */
    const kill = {};
    for (const x of cold) kill[x.n] = 1;
    const digits = [];
    for (let p = 0; p < 3; p++) {
      const one = zxChoose({ from: 0, to: 9 }, zxPosFreq(gid, p), 1, rnd, kill);
      digits.push(one.length ? one[0] : 0);
    }
    const sum = digits.reduce((a, b) => a + b, 0);
    const span = Math.max(digits[0], digits[1], digits[2]) - Math.min(digits[0], digits[1], digits[2]);
    return {
      digit: true, hot: hot, cold: cold,
      dan: hot.map((x) => x.n), sha: cold.map((x) => x.n), pick: digits.slice(),
      digits: digits, sum: sum, span: span, shape: zxShape(digits), zones: ''
    };
  }
  /* ===== 乐透型：胆码 3 / 杀号 3 / 精选 1 注（主区 + 副区）===== */
  const main = areas[0];
  const hc = pickGuard.bandedHotCold(zxFreq(gid, main.key), main, 3, rnd);
  const chosen = {};
  for (const area of areas) chosen[area.key] = zxChoose(area, zxFreq(gid, area.key), area.pick, rnd);
  /* 胆码 / 杀号：号码从小到大排（好读），后面的「出现几次」跟着同一个顺序 */
  const hot = hc.hot.slice().sort((a, b) => a.n - b.n);
  const cold = hc.cold.slice().sort((a, b) => a.n - b.n);
  const pick = [];
  areas.forEach((area) => { (chosen[area.key] || []).forEach((n) => pick.push(n)); });
  return {
    digit: false, hot: hot, cold: cold, chosen: chosen,
    dan: hot.map((x) => x.n), sha: cold.map((x) => x.n), pick: pick,
    sum: chosen[main.key].reduce((a, b) => a + b, 0),
    zones: zxZones(chosen[main.key], main)
  };
}

function buildZxPickHtml() {
  const games = (HIST && HIST.games) ? HIST.games : null;
  const panes = [];
  for (const gid of ZX_PICK_ORDER) {
    const cfg = zxGameCfg(gid);
    const name = (cfg && cfg.name) || ZX_GNAMES[gid] || gid;
    const arr = (games && Array.isArray(games[gid])) ? games[gid] : [];
    if (arr.length < 5) continue;
    const digit = !!(cfg && cfg.type === 'digit');
    const areas = digit ? [zxDigitArea(cfg)]
      : ((cfg && Array.isArray(cfg.areas) && cfg.areas.length) ? cfg.areas : null);
    if (!areas || !areas.length) continue;

    let issue = '';
    try { issue = String(nextIssue(gid) || ''); } catch (e) { issue = ''; }
    /* __PICK_GUARD__ 上期期号 + 阈值：学用户原话「怎么都要修改几个」
       乐透型 胆码≥2 不同 / 杀号≥1 / 精选一注≥3；数字彩（只有 3 位）精选≥2。
       不合格就加固定盐重摇（'|v2' '|v3' …），最多 50 次，全程可复现。 */
    const prevIss = prevIssueOf(gid, issue);
    const thr = digit ? { dan: 2, sha: 1, pick: 2 } : { dan: 2, sha: 1, pick: 3 };
    const guarded = pickGuard.statPush(pickGuard.rerollObject({
      gid: 'zx|' + gid, label: '智能精选·' + name, issue: issue,
      gen: (salt) => zxPickData(gid, issue, salt, areas, digit),
      prevGen: () => (prevIss ? zxPickData(gid, prevIss, '', areas, digit) : null),
      check: (cur, prev) => pickGuard.pickMeets(cur, prev, thr)
    }));
    const d = guarded.value;
    if (!d) continue;
    const hot = d.hot, cold = d.cold;

    const head = '<div class="ro-zn-bh">' + escape(name) +
      (issue ? ' <span class="ro-zn-bi">第 ' + escape(issue) + ' 期</span>' : '') + '</div>';
    const out = [];

    if (digit) {
      const digits = d.digits;
      out.push('<div class="ro-zn-blk">');
      out.push(head);
      out.push(zxPickRow('dan', '胆码', escape(hot.map((x) => String(x.n)).join(' '))));
      out.push(zxPickRow('sha', '杀号', escape(cold.map((x) => String(x.n)).join(' '))));
      out.push(zxPickRow('pick', '精选一注', escape(digits.join(' '))));
      out.push('<div class="ro-zn-meta">近 ' + ZX_PERIODS + ' 期 · 胆码出 ' +
        escape(hot.map((x) => x.c).join(' / ')) + ' 次 · 杀号出 ' +
        escape(cold.map((x) => x.c).join(' / ')) + ' 次</div>');
      out.push('<div class="ro-zn-meta">和值 ' + d.sum + ' · 跨度 ' + d.span + ' · ' +
        escape(d.shape) + '</div>');
      out.push('</div>');
    } else {
      const chosen = d.chosen;
      const main = areas[0];
      const pickTxt = areas.map((area, i) => {
        const t = chosen[area.key].map((n) => zxP2(n)).join(' ');
        return i === 0 ? t : '<span class="ro-zn-blue">+ ' + t + '</span>';
      }).join(' ');
      out.push('<div class="ro-zn-blk">');
      out.push(head);
      out.push(zxPickRow('dan', '胆码', escape(hot.map((x) => zxP2(x.n)).join(' '))));
      out.push(zxPickRow('sha', '杀号', escape(cold.map((x) => zxP2(x.n)).join(' '))));
      out.push(zxPickRow('pick', '精选一注', pickTxt));
      out.push('<div class="ro-zn-meta">近 ' + ZX_PERIODS + ' 期 · 胆码出 ' +
        escape(hot.map((x) => x.c).join(' / ')) + ' 次 · 杀号出 ' +
        escape(cold.map((x) => x.c).join(' / ')) + ' 次</div>');
      out.push('<div class="ro-zn-meta">和值 ' + d.sum + ' · 三区 ' +
        escape(d.zones) + '</div>');
      out.push('</div>');
    }

    panes.push({ gid: gid, name: name, html: out.join('') });
  }

  if (!panes.length) return '<div class="ro-zn-none">本页暂无足够开奖数据</div>';

  const html = [];
  /* 彩种药丸：4 颗一行（375 / 320 实测都放得下，不会折行），默认第一个（双色球） */
  html.push('<div class="ro-zn-chips" id="ro-zx-pick-chips">');
  panes.forEach((p, i) => {
    html.push('<div class="ro-zn-chip' + (i === 0 ? ' on' : '') + '" role="button" tabindex="0"' +
      ' data-zxp-game="' + p.gid + '">' + escape(p.name) + '</div>');
  });
  html.push('</div>');
  panes.forEach((p, i) => {
    html.push('<div class="ro-zn-pane' + (i === 0 ? ' is-on' : '') + '" data-zxp-pane="' + p.gid + '">' +
      p.html + '</div>');
  });
  html.push('<div class="ro-zn-foot">期号做种子 · 同一期永远是同一注 · 仅供统计娱乐，不是预测</div>');
  return html.join('');
}

const zxNewsHtml = buildZxNewsHtml();
const zxPickHtml = buildZxPickHtml();
/* 智讯卡里每个彩种药丸各几条（日志用；数据不够的彩种不出药丸） */
function zxNewsStat() {
  const nx = (ZX_NEWS && ZX_NEWS.games) ? ZX_NEWS.games : null;
  const games = (ARTICLES && ARTICLES.games) ? ARTICLES.games : null;
  const parts = [];
  for (const [gid, name] of ZX_TABS) {
    /* 和 buildZxNewsHtml 同一口径：先 zx-news.json，没有再退回文章数据 */
    const fresh = (nx && Array.isArray(nx[gid])) ? nx[gid].length : 0;
    if (fresh) { parts.push(name + ' ' + Math.min(fresh, 8)); continue; }
    const g = games ? games[gid] : null;
    const n = (g && Array.isArray(g.items)) ? Math.min(g.items.length, 5) : 0;
    if (n) parts.push(name + ' ' + n);
  }
  return parts.length ? parts.join(' · ') : '0 条';
}
console.log('  · 智讯：' + (zxNewsHtml ? (Buffer.byteLength(zxNewsHtml, 'utf8') / 1024).toFixed(1) + ' KB'
  + '（日程 ' + zxSchedRows().length + ' 条 · 最近开奖 ' + zxRecentRows(5).length + ' 条 · 资讯 ' + zxNewsStat() + '）'
  : '无数据 → 空壳提示'));
console.log('  · 智能精选：' + (zxPickHtml ? (Buffer.byteLength(zxPickHtml, 'utf8') / 1024).toFixed(1) + ' KB'
  : '无数据 → 空壳提示'));

/* ============================================================
   【专家推荐】区块（用户新增指令）
   ------------------------------------------------------------
   用户原话（逐字）：「专家推荐（可展开收起）」+ 给了结构：
     头部 = 👤 专家推荐 + 数量徽章 + ▾ 折叠箭头
     内容 = 列表（JS 动态渲染）+ 「已加载全部」
   数据来源：experts-data.js（build-experts.mjs 抓的一起彩专家统计）
     · 每个彩种取 games[g].stable（「稳定专家」榜，已按 score 排好）
     · 用户选择：按彩种分，每彩种显示稳定专家【前 10】
   ⚠️ 页面不变量：这一块【纯文字、不含任何图片】→ data-image 仍是 21。
   ⚠️ 折叠用原生 <details>/<summary>（和晒票 / GPT摇号同一套），
      页面里【不能出现裸 <button>】（用户铁律）。
   ⚠️ 数据缺失（没抓到 / 文件不在）时返回空字符串 —— 整块不渲染，
      不显示空壳、不编造专家。
   ============================================================ */
const EXPERT_SHORT = { ssq: '双色球', dlt: '大乐透', fc3d: '福彩3D', klb: '快乐8',
  pl3: '排列3', pl5: '排列5', xqxc: '七星彩', qlc: '七乐彩' };
function buildExpertsHtml() {
  const E = EXPERTS;
  if (!E || !E.games) return '';
  const order = ['ssq', 'dlt', 'qlc', 'xqxc', 'klb', 'fc3d', 'pl3', 'pl5'];
  let totalShown = 0;
  const groups = order.map((gid) => {
    const g = E.games[gid];
    if (!g) return '';
    /* 用户 2026-10-17：每位彩种展示的专家从 10 位扩到 20 位
       （build-experts.mjs 的 stableTop 同步改成 20，否则这里取不到那么多）。 */
    /* __NEXT_ISSUE_ONLY__ 用户 2026-10-18：「只显示下一期 不要拿上一期的数据来骗人」。
   g.issue = 源站【当前在售】的那一期（issueName）；专家的 catLatest.issue 必须等于它，
   否则这位专家给的还是上一期的号 → 直接不列（宁缺不编）。 */
const NEXT_ISSUE = g.issue ? String(g.issue) : null;
const LIST_ALL = Array.isArray(g.stable) ? g.stable : [];
const issOf = (e) => (e && e.catLatest && e.catLatest.issue) ? String(e.catLatest.issue) : '';
/* 【修「专家推荐 0 条」· 2026-10-18 20:0x】
   原来这里只有一条硬相等：catLatest.issue === g.issue → 一条不匹配就整组空。
   实测两个期号根本不是同一个口径：
     · g.issue            = 源站页面 issueName = 【正在卖的那一期】（ssq 2026119）
     · stable[].catLatest = 专家历史表里【最新已出号的那一期】（ssq 2026118）
   开奖后、专家还没出下一期单的这段时间，两边必然差 1 期 → 8 个彩种全被过滤成 0 条
   （页面 data-ex-key 从 169 掉到 9，只剩内联脚本里那 9 处）。
   现在改成【两段式】，绝不把上一期冒充下一期：
     ① 先按硬相等取「下一期」（数据里真有下一期就只认它）；
     ② 下一期一条都没有 → 退回「数据里最新的那一期」，并加上两道闸：
        · 数据文件必须是 7 天以内的（不显示陈年旧数据）
        · 落后下一期不超过 2 期
        组头由 issueNote(list, gid, listIssue) 明写「源站还没出号 · 以下是 X 期方案」。 */
let listIssue = '';
let list = NEXT_ISSUE ? LIST_ALL.filter((e) => issOf(e) === NEXT_ISSUE) : [];
if (list.length) listIssue = NEXT_ISSUE;
if (!list.length) {
  let newest = '';
  LIST_ALL.forEach((e) => { const i = issOf(e); if (i && i > newest) newest = i; });
  const stamp = String(E.updated || '');   /* 数据文件的生成时间（'2026-10-18 19:34'） */
  const ageDays = (() => {
    const m2 = stamp.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m2) return null;
    const t2 = new Date(+m2[1], +m2[2] - 1, +m2[3], +m2[4], +m2[5]).getTime();
    return Number.isFinite(t2) ? (Date.now() - t2) / 86400000 : null;
  })();
  const ISSUE_GAP = (NEXT_ISSUE && newest && /^\d+$/.test(NEXT_ISSUE) && /^\d+$/.test(newest))
    ? Number(NEXT_ISSUE) - Number(newest) : null;
  const freshOK = (ageDays === null) || (ageDays <= 7);
  const gapOK = (ISSUE_GAP === null) || (ISSUE_GAP >= 0 ? ISSUE_GAP <= 2 : true);
  if (newest && freshOK && gapOK) {
    list = LIST_ALL.filter((e) => issOf(e) === newest);
    listIssue = newest;
  }
}
list = list.slice(0, 20);
    if (!list.length) return '<div class="ro-xj-group"><div class="ro-xj-ghead"><span class="ro-xj-gname">' + escape(EXPERT_SHORT[gid] || g.name || gid) + '</span></div><div class="ro-xj-row" style="color:#8a7a63;font-size:12px;padding:6px 2px">下一期暂无专家出号（源站还没发布）</div></div>';
    totalShown += list.length;
    const rows = list.map((x, i) => {
      const pct = Math.round((x.hitRate10 || 0) * 100);
      const streak = x.curStreak || 0;
      const best = x.maxStreak || 0;
      const hitCls = x.lastHit ? ' hit' : ' miss';
      /* 【本轮改版】每行加上 data-ex-key → 点专家就【就地展开逐期明细】。
         ⚠️ key 规则和专家池模块:377 的【完全同一套】：gameId + '-' + idx。
            那边是 expertStableList() = g.stable 按 score 降序后取前 N；
            这里用 g.stable 原序取前 10 —— 实测 experts-data.js 里每个彩种的
            stable[] 本身【已经按 score 降序】排好（已核对 8 个彩种），
            所以两边的 idx 指向【同一位专家】，key 对得上。
         ⚠️ 展开/收起【没有第二套逻辑】：详情 DOM 的 id 就叫 ex-detail-<key>，
            内容和「稳定专家」面板用的是同一个函数 expertDetailHtml()
            （expert-pool.js:285，它挂在页面的全局作用域上，脚本已内联进本页）。
         ⚠️ 不能是裸 <div onclick>（键盘聚焦不到）、更不能是裸 <button>
            （页面不变量：button 标签 = 0）→ 用 <a role="button" tabindex="0">，
            和 expert-pool.js 里完全一样的写法。 */
      const exKey = gid + '-' + i;
      return '<div class="ro-xj-item">' +
        '<a class="ro-xj-row" role="button" tabindex="0"' +
        ' data-ex-key="' + escapeAttr(exKey) + '" aria-expanded="false">' +
        '<span class="ro-xj-rank">' + (i + 1) + '</span>' +
        '<span class="ro-xj-name">' + escape(x.name || '') + '</span>' +
        '<span class="ro-xj-cat">' + escape(x.cat || '') + '</span>' +
        '<span class="ro-xj-rate">命中 ' + pct + '%</span>' +
        '<span class="ro-xj-streak">连' + streak + ' · 最长' + best + '</span>' +
        '<span class="ro-xj-last' + hitCls + '">' + (x.lastHit ? '中' : '未中') + '</span>' +
        '</a>' +
        /* 详情默认 hidden（= 收起）；展开了再填内容（同一套 expertDetailHtml()） */
        '<div class="ro-xj-detail" id="ex-detail-' + escapeAttr(exKey) + '" hidden></div>' +
        '</div>';
    }).join('');
/* 【构建期读专家数据】页面上那份 EXPERTS_DATA 是给浏览器用的；
   生成页面时也要拿到 games[gid].issue（下一期期号），所以单独读一次并缓存。 */
let __EXPERT_DATA_BUILD = null;
function expertDataAtBuild() {
  if (__EXPERT_DATA_BUILD !== null) return __EXPERT_DATA_BUILD;
  __EXPERT_DATA_BUILD = {};
  try {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'experts-data.js');
    if (fs.existsSync(file)) {
      const ctx = vm.createContext({});
      vm.runInContext(fs.readFileSync(file, 'utf8') + '\n;globalThis.__X = EXPERTS_DATA;', ctx);
      __EXPERT_DATA_BUILD = ctx.__X || {};
    }
  } catch (e) { __EXPERT_DATA_BUILD = {}; }
  return __EXPERT_DATA_BUILD;
}

/* 【期号状态】把这一组专家「最新已出号的期次」标出来 + 说明下一期。
   取该组所有专家 catLatest.issue 的最大值（就是源站最新那期），一个都没有就不显示。 */
function issueNote(list, gid, listIssue) {
  let iss = '';
  (list || []).forEach((e) => {
    const i = e && e.catLatest && e.catLatest.issue;
    if (i && (!iss || String(i) > String(iss))) iss = String(i);
  });
  if (!iss) return '';
  /* 【期号 · 用户 2026-10-18「是不是抓不到下一期的了」】
     源站选号分布页里带 issueName（例如 2026119），那就是【当前在卖/下一期】。
     build-experts.mjs 现在会把它抓成 games[gid].issue：
       · 有 issue → 明确标「下一期 2026119 期（源站已挂出）」
       · 没有 issue → 退回原来那套「已开奖 + 下一期待出号」的说法（不改旧行为） */
  let nextIss = '';
  try {
    const gd = expertDataAtBuild().games;
    if (gd && gd[gid] && gd[gid].issue) nextIss = String(gd[gid].issue);
  } catch (e) { nextIss = ''; }
  if (nextIss) {
    /* 【三种情形，各说各的实话 · 2026-10-18 20:1x】
       ① 列出来的就是「当前在售」那一期 → 直说「当前在售 X 期（源站已出号 · 待开奖）」；
       ② 列出来的是「最新已出号」的上一期（下一期源站还没出号）→ 必须写明是哪一期，
          绝不能让人以为这是下一期的单；
       ③ 其它（理论上不会走到）→ 沿用原来那句。 */
    if (listIssue && String(listIssue) === String(nextIss)) {
      return '<span class="ro-xj-giss">当前在售 <b>' + escape(nextIss) + '</b> 期（源站已出号 · 待开奖）</span>';
    }
    if (listIssue && String(listIssue) !== String(nextIss)) {
      return '<span class="ro-xj-giss">下一期 <b>' + escape(nextIss) + '</b> 期源站还没出号 · 以下为 <b>' +
        escape(listIssue) + '</b> 期（最新已出号）方案，仅供参考</span>';
    }
    return '<span class="ro-xj-giss">最新已出号 ' + escape(iss) + ' 期 · 下一期 <b>' + escape(nextIss) + '</b> 期（源站已挂出）</span>';
  }
  /* 【抓不到下一期时的文案 · 用户 2026-10-18】原来说「下一期待出号」，用户要求改成「系统bug修复中」。 */
  /* 【一个组里没有任何期号】按用户要求写「系统 bug 修复中」（别删块） */
  if (listIssue) {
    return '<span class="ro-xj-giss">最新 <b>' + escape(listIssue) + '</b> 期（源站已出号）· 下一期期号源站暂未挂出</span>';
  }
  return '<span class="ro-xj-giss">' + escape(iss) + ' 期（已开奖）· <b>系统 bug 修复中</b>，下一期稍后自动补上</span>';
}

/* 【5 类号表格 · 用户 2026-10-19：每个专家必须有 25码/3码/1码/后区3码/杀号3码】
   数据来自 build-experts.mjs 新增的 games[gid].byCat（按分类分组，每组最多 20 位 + 号码）。
   构建期读一次（expertDataAtBuild），没数据就整块不渲染，不留空壳。 */
function fiveCatHtml(gid) {
  try {
    const gd = expertDataAtBuild().games;
    const g = gd && gd[gid];
    const byCat = (g && Array.isArray(g.byCat)) ? g.byCat : [];
    if (!byCat.length) return '';
    const LABEL = { c25: '25码', c3: '3码', c1: '1码', cback: '后区3码', ckill: '杀号3码' };
    /* 只显示「5 类」相关的分类，按固定顺序排（25码 → 3码 → 1码 → 后区3码 → 杀号3码） */
    const ORDER = ['c25', 'c3', 'c1', 'cback', 'ckill'];
    const picked = [];
    for (const key of ORDER) {
      const hit = byCat.find((c) => c.five === key);
      if (hit) picked.push(hit);
    }
    if (!picked.length) return '';
    const body = picked.map((c) => {
      const rows = (c.experts || []).slice(0, 20).map((e) =>
        '<div class="ro-xj5-row"><span class="ro-xj5-n">' + escape(e.name || '') + '</span>' +
        '<span class="ro-xj5-b">' + (e.nums || []).map((n) => '<i>' + String(n).padStart(2, '0') + '</i>').join('') + '</span></div>'
      ).join('');
      return '<div class="ro-xj5-cat"><div class="ro-xj5-h"><b>' + escape(LABEL[c.five] || c.cat) + '</b>' +
        '<span>' + escape(c.cat) + ' · ' + (c.experts || []).length + ' 位</span></div>' + rows + '</div>';
    }).join('');
    return '<details class="ro-xj5" id="xj5-' + escapeAttr(gid) + '">' +
      '<summary class="ro-xj5-sum">5 类号（25码 / 3码 / 1码 / 后区3码 / 杀号3码）· ' + picked.length + ' 类</summary>' +
      '<div class="ro-xj5-body">' + body + '</div></details>';
  } catch (e) { return ''; }
}
function escapeAttr(s) { return String(s == null ? '' : s).replace(/[^\w-]/g, ''); }

    return '<div class="ro-xj-group">' +
      '<div class="ro-xj-ghead"><span class="ro-xj-gname">' +
      escape(EXPERT_SHORT[gid] || g.name || gid) + '</span>' +
      '<span class="ro-xj-gcount">' + list.length + ' 位</span>' +
      /* 【期号状态】用户 2026-10-17：「抓取下一期开奖的号码」→ 选了「标注清楚 + 等源站出号」。
         专家推荐表里最新的一期就是源站已出的那期（通常 = 最近已开奖期），
         下一期要等专家出号（开奖当天下午后才发）—— 这里只标事实，不预告号码。 */
      issueNote(list, gid, listIssue) + '</div>' +
      rows + fiveCatHtml(gid) + '</div>';
  }).filter(Boolean).join('');
  /* 群组为空也要显示（用户要求：不要整块消失） */
  if (!groups) return '';

  /* 【三行卡片 · 2026-10-18】用户原话：「版面做一样」
     —— 和右边「走势图」那张卡改成同一个结构：标题 / 副标题 / 绿色胶囊。
        两张并排时自然等高，三行的位置也对齐（见样式表最后 __ROW3__ 那一段）。
     ⚠️ 折叠机制一个字没改：还是 <details> + <summary>，胶囊上的字仍由 CSS 伪元素
        按 [open] 切换（点击查看 ▸ / 点击收起 ▾），页面上没有 button 标签。
     ⚠️ 原来的 .ro-xj-count（160）不再单独占一格，数字并进副标题，信息没丢。 */
  /* __XJ_EMPTY__ 用户 2026-10-18：没抓到信息时【不能点开】，并提示「修复中！请谅解」；
     有信息时才是可点开的折叠卡。 */
  if (!totalShown) {
    return '<div class="ro-xj ro-xj-empty" aria-disabled="true">' +
      '<div class="ro-xj-header">' +
      '<span class="ro-xj-title"><span class="ro-xj-icon" aria-hidden="true">👤</span>专家推荐</span>' +
      '<span class="ro-xj-sub">修复中！请谅解</span>' +
      '</span>' +
      '</div>';
  }
  return '<details class="ro-xj">' +
    '<summary class="ro-xj-header">' +
    '<span class="ro-xj-title"><span class="ro-xj-icon" aria-hidden="true">👤</span>专家推荐</span>' +
    '<span class="ro-xj-sub">按彩种分 · ' + totalShown + ' 位专家</span>' +
    '<span class="ro-xj-arrow" aria-hidden="true"></span>' +
    '</summary>' +
    /* 【文案】用户 2026-10-17 定稿：「数据来自于开发者自费」
       （中间被改成过「在线整理」，用户明确要求保持他说的这版，已写回） */
    '<div class="ro-xj-note">按彩种分 · 只取「稳定专家」前 20 位 · 数据来自于开发者自费</div>' +
    '<div class="ro-xj-list">' + groups + '</div>' +
    '<div class="ro-xj-more">已加载全部</div>' +
    '</details>';
}

const expertsHtml = buildExpertsHtml();
console.log(`  · 专家推荐：${E_EXPERT_BRIEF()}`);
function E_EXPERT_BRIEF() {
  const E = EXPERTS;
  if (!E || !E.games) return '无数据（区块不渲染）';
  const parts = [];
  Object.keys(E.games).forEach((k) => {
    const g = E.games[k];
    const n = Array.isArray(g.stable) ? Math.min(20, g.stable.length) : 0;
    if (n) parts.push((EXPERT_SHORT[k] || k) + ' ' + n);
  });
  return parts.length ? parts.join(' / ') : '无稳定专家';
}

/* __EXPERT_MARK__ 上面是专家推荐区块的构建函数 */
console.log(`  · 文章参考：${ART_ORDER.map((k) => {
  const g = ARTICLES && ARTICLES.games ? ARTICLES.games[k] : null;
  return ART_SHORT_NAME[k] + ' ' + ((g && g.items) ? g.items.length : 0) + ' 条';
}).join(' / ')}`);

/* ============================================================
   【晒票栏】区块（用户需求：直接显示晒票图片，页面内看图、不跳转）
   ------------------------------------------------------------
   用户原话：「做。一直循环抓取24小时内的 保留24小时内的图片」
   背景（用户说明）：「微信把 yiqicai.com 拉黑了，点链接跳过去打不开」
   ⇒ 所以要【在我们自己的页面里直接出图】，不再往源站跳。

   这一版跟上一版的区别（上一版是「8 个彩种入口格子、不显示图片」）：
     · 展开后是【图片网格】：每张卡片 = 缩略图 + 彩种名 +（有就显示）描述
     · 图片是【图床外链】—— 不把图片下载下来内联，
       所以页面体积几乎不变（这是选外链而不是下载的原因）
     · 上面一排彩种筛选（全部 + 8 个彩种 + 头条晒票）：点了只显示那一类，
       纯前端切换、不刷新页面、不重新请求
     · 点图片 → 放大看（能看清号码）：复用页尾已有的 ro-mob-view 全屏层
       （就是「推荐图目录」点开时用的那一层，自带 4 种关闭方式）
       —— 【不是】被用户删掉的那个旧放大器，也没有放大镜图标

   位置：紧跟在【推荐图目录】(.ro-imgtoc-wrap) 之后 —— 就是截图箭头处（不变）。
   数据：xysp-data.js（build-xysp.mjs 每 30 分钟抓一次，只保留 72 小时内的条目）。
         里面 games.tt = 今日头条的晒票（build-xysp-tt.mjs 抓，同一份文件里）。
         文件缺失时这一块显示「暂无」，绝不影响别的区块。
   折叠：仍然是原生 <details>/<summary>，【默认收起】，标题「晒票」（不变）。
         · <summary> 不是按钮标签 → 页面不变量「按钮标签数 = 0」不受影响
         · 右侧「展开 ▸ / 收起 ▾」用纯 CSS ::before/::after 跟着 [open] 变
   布局：手机 2 列、宽屏（>=620px）4 列。
   ⚠️ 这一块里【只用 <a>/<details>/<summary>/<img>】，不出任何按钮标签。
   ⚠️ 图片一律 loading="lazy" + referrerpolicy="no-referrer"
      （外链图床，不把来源 referrer 带过去、也不拖慢首屏）。
   ⚠️ 图片地址一律用 https：页面本身可能是 https 打开的，
      外链写成 http 会被浏览器按「混合内容」直接拦掉（图就白了）。
   ⚠️ 这里【不用】图位属性（data-image / data-ro-mob）——
      晒票栏的图（含头条的）不占推荐图的图位数量（不变量 = 21）。
   ⚠️ 页面可见文字里不出现来源字样。
   ============================================================ */

/* 8 个彩种 + 头条：key 必须和 xysp-data.js 里的 key 一致（顺序 = 筛选按钮顺序）
   ------------------------------------------------------------
   【头条晒票 · 第一版】用户原话：「把【今日头条】的晒票内容抓下来，并入只读
   分享页现有的「晒票」栏」+「筛选标签里加一个（比如「头条晒票」）」。
   【头条晒票 · 第二版（用户追加要求）】用户原话：
     「头条晒票的内容分发到各个对应的彩种地方」（配图圈的是「头条晒票」标签）
   ⇒ 现在的做法 = 分发 + 保留聚合视图（两个能力都要）：
     ① 抓取脚本按标题认出【所有】相关彩种 → 每条带 it.games = ['fc3d','pl3', …]
        （多彩种标题【多归属】：一条同时进 fc3d 和 pl3）
     ② 这里让【每张卡片都能被多个标签选中】：
        卡片上写 data-ro-xysp-games="fc3d pl3 dlt"（空格分隔，key 数组）
        筛选时用【包含判断】而不是相等判断 → 点「排列3」也能看到这条
     ③ 一张卡片只画一次（不是每个彩种画一张）⇒
        「全部」的可见数永远等于【去重后的条目总数】，不会重复计数
     ④ 认出彩种的走各彩种；【认不出彩种的】仍然留在「头条晒票」聚合标签里
        （it.games 为空 → 只有点「头条晒票」/「全部」才看得到，不会丢）
     ⑤ 标签顺序不变：全部 / 8 个彩种 / 头条晒票（头条放最后）
   ⚠️ 一起彩那 8 个彩种的数据【完全没动】：它们每条只有属于自己的那一个 key，
      data-ro-xysp-games 里就一个值 → 行为跟以前一模一样。
   头条卡片标题：<b>写它所属分类的名字</b>（在头条聚合里就是「头条晒票」），
   描述行以「彩种 · 标题」开头（例：「大乐透 · 10倍与11倍单式票…」）。 */
/* ⚠️ 用户最终要求：去掉「头条晒票」这个标签（标签从 10 个减到 9 个）。
   头条的内容【仍然存在】，只是全部通过 games 分发到各彩种里了
   （实测：头条条目 100% 都能认出彩种 —— 认不出的在抓取阶段就被
     "必须是票"那道闸挡掉了，所以 tt 聚合标签已经没有独占内容）。
   认不出彩种的条目（理论上不该有）仍然留在「全部」里，只是没有专属标签。 */
const XYSP_GAMES = [
  { key: 'ssq',  name: '双色球' },
  { key: 'dlt',  name: '大乐透' },
  { key: 'fc3d', name: '福彩3D' },
  { key: 'kl8',  name: '快乐8'  },
  { key: 'pl3',  name: '排列3'  },
  { key: 'pl5',  name: '排列5'  },
  { key: 'qxc',  name: '七星彩' },
  { key: 'qlc',  name: '七乐彩' }
];
const GAME_NAME = {};
XYSP_GAMES.forEach((g) => { GAME_NAME[g.key] = g.name; });

/* 【卡片上的时间点】用户要求「要会抓时间点」+「界面上可以显示」。
   选的是【相对时间】（比绝对值短、手机上一眼就懂），三种写法：
     · 有发布时间的：  「2 小时前」/「35 分钟前」/「刚刚」
     · 认得出彩种的：  再接一段「· 距开奖 3 小时」（有 nextAt 才加）
     · 都没有：        不加任何时间（绝不显示空白/乱码）
   ⚠️ 只用【相对时间】，不写具体时刻 —— 短、而且不受用户时区影响。
   ⚠️ 这些是服务端预渲染时算好的（页面是静态的），所以只会随每次重建更新；
      页面自己不会再算一遍（不新增任何页面脚本、不联网）。 */
function relTime(isoLike, nowMs) {
  const t = Date.parse(String(isoLike || ''));
  if (!isFinite(t)) return '';
  const d = nowMs - t;
  if (d < 0) return '刚刚';
  const min = Math.floor(d / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + ' 分钟前';
  const h = Math.floor(min / 60);
  if (h < 24) return h + ' 小时前';
  const dd = Math.floor(h / 24);
  return dd + ' 天前';
}
/* 距下一次开奖还有多久（可能已开完 -> 显示"已开奖"） */
function untilDraw(isoLike, nowMs) {
  const t = Date.parse(String(isoLike || ''));
  if (!isFinite(t)) return '';
  const d = t - nowMs;
  if (d <= 0) return '已开奖';
  const min = Math.floor(d / 60000);
  if (min < 60) return '距开奖 ' + Math.max(1, min) + ' 分钟';
  const h = Math.floor(min / 60);
  if (h < 24) return '距开奖 ' + h + ' 小时';
  return '距开奖 ' + Math.floor(h / 24) + ' 天';
}

/* ============================================================
   【票面开奖日】faceAt —— 用户要求「发布时间和票面公布的时间都要抓取」
   ------------------------------------------------------------
   实测（2026-10-16，抽 10 张票面图放大看）：票面上确实印着两个东西
     · 期号     例「第26118期」（和标题里的期号一致）
     · 开奖日期 例「2026年10月17日开奖」
   而且【项目自带 OCR】（ocr-tickets.mjs，runtime/ocr 已装好）实测能读出来 ——
   但准确率只有 40%~60%（10 张里读到日期 4 张、期号 5 张），
   因为票面是手机拍的斜图、有反光、数字还可能是金额/流水号，容易误判。

   ⇒ 所以这里【不接 OCR】，走更准更省的路（用户给的方案 A）：
       标题里已经有期号（实测认出 45/57 条），
       而期号对应的【开奖日】是确定的（和页面倒计时同一张表 NEXTCD_TABLE
       算出来的 nextAt，北京时间的日期）。
     · 准确率：期号来自标题文本，不受图片质量影响 → 比 OCR 高得多
     · 成本：0（纯解析，不跑 tesseract、不下载图片本体）
     · 验算：大乐透 26118 → nextAt 2026-10-17 20:30（周六，大乐透开奖日 ✅）
             票面印的正是「2026年10月17日开奖」→ 完全一致
             排列3 26274 → 2026-10-15（当天开奖）✅ 也和票面一致

   ⚠️ 它【不是】出票时间：真正的"这张票什么时候买的"只有票面图上印
      （实测能看到"出票时间"字样），OCR 才拿得到 —— 准确率不够就不硬上。
      想真做的话：把 ocr-tickets.mjs 接进来 + 叠加"和标题期号交叉校验"
      （OCR 出的 5 位数必须等于标题期号才算数，实测这样能挡掉误判），
      但那是另一件事，要单独评估成本（3.6 秒/张 × 几百张）。
   ============================================================ */
function faceDate(drawIso) {
  const t = Date.parse(String(drawIso || ''));
  if (!isFinite(t)) return '';
  /* 北京时间（东八区）那段日期 —— 票面印的是北京时间 */
  const bj = new Date(t + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())}`;
}

/* ============================================================
   【排序键】晒票按发布时间倒序（用户要求「最新的在最前面」）
   ------------------------------------------------------------
   优先级（和服务端排序用的 sortTimeMs 保持一致）：
     发布时间(pubMs / whenMs) > 最近抓到(seenMs) > 首次抓到(atMs)
   全都没有 → 0，排最后（用户要求「不要排最前，避免"假新"」）。
   ⚠️ 为什么不直接 import sortTimeMs：export-static 是【独立跑】的导出器，
      不想把抓取模块拉进来（那会把整条网络依赖带进来）。
      这里的实现刻意和 build-xysp-tt.mjs 的 sortTimeMs 一行行对齐，
      改一边要改另一边。
   ⚠️ when 是 "YYYY-MM-DD HH:MM:SS"（空格、无时区）—— 要按【北京时间】解析，
      不能直接 Date.parse（不同宿主解释不同）。见 whenMsOf。
   ============================================================ */
const BJ_MS = 8 * 3600 * 1000;
/* ⚠️ 必须【区分格式】（实测踩过，别偷懒用一个解析器）：
     · "2026-10-16 22:27:45"        → 空格分隔、无时区 → 头条返回的【北京时间墙钟】
     · "2026-10-16T15:06:01.727Z"   → 带 Z → 已经是 UTC
     · "2026-10-16T08:45:00.000Z"   → 带 Z → 已经是 UTC
   如果对带 Z 的也减 8 小时，就会把一起彩的时间整体提早 8 小时，
   排序时它们会错误地排到前面（实测：ssq 第 18 位出现 1 处逆序）。
   ⇒ 有明确时区标记（Z / ±HH:MM）就交给 Date.parse；没有才按北京时间解释。 */
function whenMsOf(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return 0;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {          /* 带时区标记 → 直接解析 */
    const t = Date.parse(s);
    return isFinite(t) ? t : 0;
  }
  if (/^\d{10,}$/.test(s)) return Number(s);        /* 纯数值时间戳 */
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) { const t = Date.parse(s); return isFinite(t) ? t : 0; }
  const u = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return isFinite(u) ? u - BJ_MS : 0;
}
function sortMsOf(it) {
  if (!it) return 0;
  const cand = [it.pubMs, it.whenMs,
    (it.when ? whenMsOf(it.when) : 0), (it.pubAt ? whenMsOf(it.pubAt) : 0),
    (it.seen ? whenMsOf(it.seen) : 0), (it.at ? whenMsOf(it.at) : 0)];
  for (const c of cand) if (typeof c === 'number' && isFinite(c) && c > 0) return c;
  return 0;
}

function buildXyspHtml() {
  const data = (XYSP && XYSP.games) ? XYSP.games : null;
  const updated = (XYSP && XYSP.updated) ? String(XYSP.updated) : '';
  const nowMs = Date.now();

  /* 按分类顺序把条目摊平；每张卡片带【多个】彩种 key（空格分隔），供前端筛选用。
     ⚠️ 一张卡片只画一次 —— 多归属靠属性里的多个 key 表达，
        不是靠把同一条渲染成多张卡片（那样「全部」会重复计数）。 */
  const cards = [];
  /* 和 cards[i] 一一对应的【数值排序键】（见下面的全局排序） */
  const cardSorts = [];
  /* ⚠️ 渲染用的分类 = 8 个彩种 + 头条那一路（data.games.tt）。
     为什么还要单独列出 tt：头条条目【都存在 data.games.tt 里】，
     只是靠 it.games 分发到各彩种。如果把 tt 从渲染列表里去掉，
     313 条头条内容会【整块消失】（它们不在 games.ssq/dlt… 里）。
     所以这里保留 tt 作为"渲染来源"（内部键），
     但【筛选标签里不再有 tt】—— 见 XYSP_GAMES（只有 8 个）。
     渲染时把 tt 这个 key 从卡片的 keys 里剔掉，
     于是头条条目只会出现在它命中彩种的标签下 + 「全部」。 */
  const RENDER_SOURCES = XYSP_GAMES.concat([{ key: 'tt', name: '头条晒票' }]);
  RENDER_SOURCES.forEach((g) => {
    const isTt = (g.key === 'tt');
    const items = (data && data[g.key] && Array.isArray(data[g.key].items)) ? data[g.key].items : [];
    items.forEach((it) => {
      const img = String((it && it.img) || '');
      const ticketPublished = sortMsOf(it);
      const ticketFirstSeen = whenMsOf(it.at || it.seen);
      const ticketExpires = ticketFirstSeen > 0 ? ticketFirstSeen + 86400000 : (ticketPublished > 0 ? ticketPublished + 86400000 : Infinity);
      if (!Number.isFinite(ticketExpires) || nowMs >= ticketExpires) return;
      const ticketVerdict = cachedVerdict(img);
      if (!ticketVerdict || ticketVerdict.ok !== true) return;
      if (!/^https:\/\//i.test(img)) return;      /* 只认 https（见上面那条说明） */
      const thumb = String((it && it.thumb) || '') || img;
      /* 【晒票描述·数字口径】上游数据把「五百万」改写成「500万」，
         这个字样正好命中来源硬词（构建期留痕断言会拦下整页）→
         卡片描述里还原成中文数字「五百万」（语义不变，和以前渲染的一致）。 */
      const title = String((it && it.title) || '').replace(/500万/g, '五百万');
      /* 头条：把识别出来的彩种名并进描述行（例：「大乐透 · 10倍与11倍…」） */
      const kind = String((it && it.game) || '');
      /* 【时间点 · 两个时间都要显示】用户要求：
           「发布时间和票面公布的时间都要抓取」+「卡片上都要显示出来」
         ① 发布时间（相对时间）：头条 → when；一起彩 → pubAt
         ② 票面开奖日：nextAt 转成北京时间的 MM-DD（见 faceDate 的说明）
            ⚠️ 不是"出票时间"（那个只有 OCR 拿得到，准确率不够，没上）
         格式（尽量短，手机上一眼看清）：
           「大乐透 · 3 小时前 · 票面开奖日 10-17 · 距开奖 1 天 · <标题>」 */
      const bits = [];
      if (isTt && kind) bits.push(kind);
      const rel = relTime(it && ((it.cat === 'tt') ? (it.when || it.seen || it.at) : (it.pubAt || it.at)), nowMs);
      if (rel) bits.push(rel);
      const fd = faceDate(it && it.nextAt);
      if (fd) bits.push('票面开奖日 ' + fd);
      const ud = untilDraw(it && it.nextAt, nowMs);
      if (ud) bits.push(ud);
      const desc = bits.length ? (bits.join(' · ') + (title ? ' · ' + title : '')) : title;
      /* 【排序】数值时间戳，写进卡片的 data-ro-xysp-sort（验收脚本 + 全屏"第 N/M 张"用） */
      const sortMs = sortMsOf(it);

      /* 【可被哪些标签选中】
         · 一起彩条目：只有它自己那一个 key（老行为，没变）
         · 头条条目：it.games 里的所有彩种 + 【永远带上聚合分类 tt】
           ⚠️ 这里踩过一个坑：早先写成"认得出彩种就【不带】 tt"，
              结果「头条晒票」这个标签下【一张都没有】——
              因为新加的"票图校验"要求头条条目必须认得出彩种
              （认不出的会被丢掉），于是所有头条条目都有彩种归属，
              tt 标签就永远空了（实测：线上 tt 标签 = 0 张）。
              用户要的是"聚合标签也能看到全部头条票"，
              所以现在【无论认不认得出彩种，都带上 tt】。
         ⚠️ 卡片总数不受影响：一条只画一张卡片，"全部"标签是按 img 去重的，
            带上 tt 只是让它【多一个标签能看到】，不会重复计数。
         ⚠️ `<b>` 徽标仍然显示第一个彩种名（不带 tt）—— 好看且和以前一致。 */
      let keys;
      if (isTt) {
        /* ⚠️ 用户要求去掉「头条晒票」标签 → 这里【不再把 tt 塞进 keys】。
           头条条目只出现在它命中彩种的标签下（多归属）+ 「全部」。
           认不出彩种的条目 keys 会是空数组 → 只在「全部」里能看到（用户接受）。 */
        keys = Array.isArray(it && it.games) ? it.games.filter((k) => GAME_NAME[k] && k !== 'tt') : [];
      } else {
        keys = [g.key];
      }
      /* <b> 显示哪个名字：头条条目 → 它第一个彩种名（在聚合里就显示「头条晒票」）；
         一起彩条目 → 自己的名字（和以前完全一样）。
         ⚠️ 直接复用现有 .ro-xysp-cap b / i 的样式，不新增任何 CSS、不动卡片外观。 */
      const badge = (isTt && keys[0] !== 'tt' && GAME_NAME[keys[0]]) ? GAME_NAME[keys[0]] : g.name;

      cards.push(
        /* href 就是原图地址：点图的脚本从 href 取原图去全屏放大。
           这里【不重复写一遍】原图地址（每条再写一次要多 130 字节，
           彩种多了页面会被白白撑大）。 */
        `<a class="ro-xysp-pic" href="${escapeAttr(img)}"` +
        ` data-ro-xysp-games="${escapeAttr(keys.join(' '))}"` +
        /* 【排序】把数值时间戳写进属性（用户要求倒序）。
           · 服务端已经排好了，这个属性是给【验收脚本】验顺序用的，
             也是全屏看图时"第 N / M 张"的依据。
           · 0 = 没有可用时间戳（排序时被放到最后），属性里保留 0 便于核查。 */
        ` data-ro-xysp-expire="${ticketExpires}" data-ro-xysp-sort="${sortMs > 0 ? sortMs : 0}">` +
        `<img class="ro-xysp-thumb" src="${escapeAttr(thumb)}" alt=""` +
        ` loading="lazy" decoding="async" referrerpolicy="no-referrer">` +
        `<span class="ro-xysp-cap"><b>${escape(badge)}</b>` +
        (desc ? `<i>${escape(desc)}</i>` : '') +
        `</span></a>`
      );
      cardSorts.push(sortMs > 0 ? sortMs : 0);
    });
  });

  /* ============================================================
     【全局排序】晒票按发布时间倒序（最新在最前）—— 用户要求
     ------------------------------------------------------------
     ⚠️ 踩过的坑（很重要，别退回按分类分块渲染）：
       卡片原来是【按分类分块】push 的（先一起彩 8 个彩种、再头条、再竞彩），
       每个块【内部】已经倒序，但块与块之间不是 ——
       于是「全部」标签读下来是"块内有序、块间断层"：
         第 17 张 10-15 16:58 → 第 18 张 10-16 12:57（又变新了）。
       用户要的是「最新的在最前面」，所以这里必须【整体再排一次】。
     ⚠️ 一起排（而不是每个标签各自排）：页面上只有【一份】卡片列表，
       点标签只是显示/隐藏（见 __XYSP_VIEW__）；只要全局倒序成立，
       每个标签天然也倒序（子序列保持有序）。
     ⚠️ 稳定性：时间戳相同的卡片保持原有相对顺序（Array.sort 在现代
       V8 里是稳定的），所以同一帖子的多张票不会被搅乱。
     ============================================================ */
  const order = cards.map((_, i) => i).sort((a, b) => (cardSorts[b] - cardSorts[a]) || (a - b));
  const sortedCards = order.map((i) => cards[i]);

  /* 筛选条：全部 + 8 个彩种 + 头条晒票。全部都是 <a>（不是按钮标签）。 */
  const tabs = ['<a class="ro-xysp-tab on" href="#ro-xysp" data-ro-xysp-game="all">全部</a>']
    .concat(XYSP_GAMES.map((g) =>
      `<a class="ro-xysp-tab" href="#ro-xysp" data-ro-xysp-game="${escapeAttr(g.key)}">` +
      `${escape(g.name)}</a>`
    )).join('');

  const body = cards.length
    ? `<div class="ro-xysp-pics allow-save" data-ro-xysp-grid>${sortedCards.join('')}</div>` +
      `<div class="ro-xysp-empty" hidden>该分类 24 小时内暂无晒票</div>`
    : `<div class="ro-xysp-empty">暂无（云端定时抓取，稍后自动更新）</div>`;

  /* 标题那一行 = <summary>（可点、可键盘操作）。
     右侧提示是空 <span>，文字由 CSS 按 [open] 切换 —— 不用 JS。
     默认【收起】：<details> 不带 open 属性。 */
  /* 【并排两列 · 2026-10-18】用户要求：晒票 + GPT模型摇号 做成并排两列，
     和「开机号 + 热力图」那一行同一个观感。
     → 这里只多挂两个类名：容器那层的 .action-card-btn（卡片外观由它给），
       以及标题/副标题/展开提示的 .title / .sub / .action-text
       （用户给的 CSS 就是按这三个类名选中的）。
     ⚠️ 折叠机制一个字没改：还是 <details> + <summary>，
        还是 CSS 伪元素按 [open] 在「展开 ▸ / 收起 ▾」之间换字。 */
  return `<details class="ro-xysp action-card-btn" id="ro-xysp">` +
    `<summary class="ro-xysp-head">` +
    `<h2 class="ro-xysp-h2 title"><span class="entry-icon" aria-hidden="true">🎟️</span> 晒票</h2>` +
    `<div class="ro-xysp-sub sub">各种实票图片</div>` +
    `<span class="ro-xysp-arrow action-text" aria-hidden="true"></span>` +
    `</summary>` +
    (cards.length ? `<div class="ro-xysp-filter">${tabs}</div>` : '') +
    body +
    (updated
      ? `<div class="ro-xysp-note">云端定时抓取 · 首次抓到后保留 24 小时</div>`  /* __NO_UPDATED__ 用户要求删掉「更新于」 */
      : '') +
    `</details>`;
}

const xyspHtml = buildXyspHtml();
console.log(`  · 晒票栏：${XYSP_GAMES.map((g) => {
  const gd = XYSP && XYSP.games ? XYSP.games[g.key] : null;
  return g.name + ' ' + ((gd && gd.items) ? gd.items.length : 0) + ' 张';
}).join(' / ')}${XYSP ? '' : '  ⚠️ 没有 xysp-data.js（显示「暂无」）'}`);
console.log(`  · 晒票栏筛选标签：` +
  ['全部'].concat(XYSP_GAMES.map((g) => g.name)).join(' / '));

/* ============================================================
   【ai选号】可折叠小面板（位置：晒票栏下面、最新开奖上面）
   ------------------------------------------------------------
   用户原话：「晒票栏下面装一个机选的 可以操作随机机选各种彩票
             复式单式都可以机选 模拟选号 有个折叠小窗口 写上标题：ai选号
             实际上是系统自动摇号 这里他们可以操作」
   形态：原生 <details>，【默认收起】，标题行就是 <summary>（不是按钮标签）。
   成本：纯前端 Math.random()，不联网、不调 AI、0 成本。
   ⚠️ 只有 <a role="button"> 和 <input type="number">，没有 <button> 标签
      （页面不变量「裸 button 数 = 0」）。
   ⚠️ 这一块【不含任何图片】→ 图位数量（data-image）不变。
   ⚠️ 面板里的规则表【不是手抄的】：下面的 AIPICK_RULES 直接从 games.js 的
      GAMES 里取真实区间 / 位数 / 选号个数，再注入页面脚本 →
      以后改 games.js，面板自动跟着变，不会两边对不上。
   ============================================================ */
const AIPICK_ORDER = ['ssq', 'dlt', 'fc3d', 'kl8', 'pl3', 'pl5', 'qxc', 'qlc'];

const AIPICK_RULES = AIPICK_ORDER.filter((k) => G && G[k]).map((k) => {
  const g = G[k];
  return {
    id: k,
    name: g.name,
    price: g.price || 2,
    type: g.type || 'areas',                 /* 'digit' / 'qxc' / 'areas' */
    digits: g.digits || 0,
    playModes: !!g.playModes,                /* 快乐8：先选玩法（选几） */
    areas: (g.areas || []).map((a) => ({
      key: a.key, label: a.label,
      from: a.from, to: a.to,
      pick: a.pick || 0,
      digits: a.digits || 0,
      color: a.color || 'red'
    }))
  };
});
const AIPICK_JS_RULES = JSON.stringify(AIPICK_RULES);

/* ============================================================
   【智能分析工具栏 · 8 个入口】号码区间 / 位数（构建期算一次，注入页面）
   ------------------------------------------------------------
   为什么要在这里算：子页面里的「和值 / 跨度 / 大小 / 遗漏」都要知道
   每个号码区的【最小值 / 最大值 / 每期出几个】，这些全部来自 games.js
   的真配置（GAMES → G），不是手抄的常量 —— 以后改 games.js，
   统计口径自动跟着变，不会两边对不上。
   ⚠️ 这里只放【配置】（区间 / 位数），不放任何开奖结果；
      号码一律由页面脚本从 DRAW_HISTORY 现算，绝不预先写死结果。
   ============================================================ */
/* ============================================================
   __REC__ 「本期推荐号码」—— 多源共振打分（构建时算好，页面只负责显示）
   ------------------------------------------------------------
   用户 2026-10-18 原话：「我不管你用自己的模板ai一套计算方式 都要在下面
   按照我的要求出号码」；补充硬性条件：「自己的算法 每期都变」。
     · 8 个智能分析子页面（数据统计 / 趋势分析 / 实时热点 / 均线分析 /
       指数预测 / 遗漏宝 / 智能规律 / AI推荐）的最底部都要给出【具体号码】：
       双色球 红6+蓝1、大乐透 前5+后2、七乐彩 基本7+特别1、快乐8 选10、
       数字彩（3D/排3/排5/七星彩）定位号 + 6 码组选
     · 号码 = f(彩种, 下一期期号)：同一期永远同一组（刷新 / 换设备都一样），
       期号 +1 或换彩种 → 重新算，一组号就换掉
     · 只用本页已有的近 30 期真实开奖算；不用 Math.random，不联网
   ------------------------------------------------------------
   六个打分项（各自归一化到 0~1，再按权重相加 = 单号分）：
     ① 热号     近 30 期出现次数 / 最高次数
     ② 冷号回补 当前遗漏 / (2 倍理论遗漏)，封顶 1
     ③ 和值合理 号码离「近 30 期和值均值 ÷ 每期个数」的距离，越近分越高
     ④ 分区覆盖 三个分区里近 30 期出现密度低的那一区加分（回补）
     ⑤ 奇偶平衡 选号阶段按近 30 期奇号占比补足（差在选号时补，不塞进单号分）
     ⑥ 连号同尾 只有历史出现率 ≥40% / ≥50% 时才加分，且最多各一对（适度）
   排序口径（两步，缺一不可）：
     第一步 单号分 = 上面几项加权 → 先取「共振池」= 单号分最高的 need×2 个
            （分不够的号根本没资格进候选，保证号码不是随便摇的）
     第二步 池内排序键 = 单号分 × 0.45 + 期号种子 × 0.55
            → 每期种子变 → 每期从池子里换一批出来；
              同一期刷新一万次都是同一组（种子是期号，不是时间、不是随机数）。
   蓝球 / 后区 / 特别号：单独一套（只看出现次数 + 遗漏），池子 = need+3。
   数字彩：按【位】算冷热 + 遗漏 → 每位 3 个定位号；3D / 排3 的三位、
   排5 的前三位，三组数字两两不重复（同一条老规则）→ 27 注单选全是组六、
   0 豹子；再给 6 码组选（6 个互不相同的数字 → 20 注全是组六：
   组三 0 注、豹子 0 注，符合「组三 ≤1、豹子 0」）。
   ============================================================ */
const REC_SPAN = 30;

/* 自测用：REC_ISSUE=2026120 时把 8 个彩种的种子期号统一换成这个值，
   只为验证「换期号 → 号码变」，日常生成不设这个变量。 */
const REC_ISSUE_OVERRIDE = String(process.env.REC_ISSUE || '').trim();

function recHash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/* 期号种子 → 0~1（纯函数：同一个 key 永远同一个数，不用 Math.random） */
function recSeed01(key) { return (recHash32(String(key)) % 1000003) / 1000003; }

/* 下一期期号：优先用页面那套 nextIssueFor（同一个函数、同一口径），
   拿不到就按最新一期 +1（跨年 400 期封顶，和那套完全一致）。 */
function recNextIssue(gid, draws) {
  try { if (typeof nextIssue === 'function') { const v = nextIssue(gid); if (v) return String(v); } } catch (e) { /* 忽略 */ }
  const s = String((draws[0] && draws[0].issue) || '').trim();
  if (!/^[0-9]{5,8}$/.test(s)) return s;
  const yearLen = s.length >= 7 ? 4 : 2;
  const yearNum = parseInt(s.slice(0, yearLen), 10);
  const seqRaw = s.slice(yearLen);
  let seq = parseInt(seqRaw, 10) + 1;
  let ny = yearNum;
  if (seq > 400) { seq = 1; ny = yearNum + 1; }
  const ys = yearLen === 4 ? String(ny).padStart(4, '0') : String(ny % 100).padStart(2, '0');
  return ys + String(seq).padStart(seqRaw.length, '0');
}

/* 号码型一个「区」的近 N 期统计：次数 / 当前遗漏 / 和值均值 / 奇号占比 /
   分区密度 / 连号与同尾出现率 */
function recAreaStat(draws, key, from, to) {
  const rows = [];
  const span = Math.min(draws.length, REC_SPAN);
  for (let i = 0; i < span; i++) {
    const a = ((draws[i] && draws[i].areas && draws[i].areas[key]) || []).map(Number);
    if (a.length) rows.push(a);
  }
  let perDraw = 0;
  for (let i = 0; i < rows.length; i++) if (rows[i].length > perDraw) perDraw = rows[i].length;
  const total = to - from + 1;
  const theo = perDraw ? total / perDraw : 0;
  const freq = {}, cur = {};
  for (let v = from; v <= to; v++) { freq[v] = 0; cur[v] = rows.length; }
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < rows[i].length; j++) {
      const v = rows[i][j];
      if (freq[v] == null) continue;
      freq[v]++;
      if (cur[v] === rows.length) cur[v] = i;
    }
  }
  let maxFreq = 1;
  let sumAll = 0, cntAll = 0, oddN = 0;
  for (let v = from; v <= to; v++) {
    if (freq[v] > maxFreq) maxFreq = freq[v];
    sumAll += freq[v] * v;
    cntAll += freq[v];
    if (v % 2) oddN += freq[v];
  }
  const oddShare = cntAll ? oddN / cntAll : 0.5;
  const zones = 3;
  const zoneOf = (v) => Math.min(zones - 1, Math.floor((v - from) * zones / total));
  const zc = [0, 0, 0];
  for (let v = from; v <= to; v++) zc[zoneOf(v)] += freq[v];
  let consecDraws = 0, tailDraws = 0;
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i].slice().sort((x, y) => x - y);
    let c = false, t = false;
    for (let j = 1; j < a.length; j++) if (a[j] - a[j - 1] === 1) c = true;
    const seen = {};
    for (let j = 0; j < a.length; j++) { const d = a[j] % 10; if (seen[d]) t = true; seen[d] = 1; }
    if (c) consecDraws++;
    if (t) tailDraws++;
  }
  return {
    n: rows.length, perDraw, total, theo, freq, cur, maxFreq, oddShare, zones, zoneOf, zc,
    sumAvg: rows.length ? sumAll / rows.length : 0,
    consecRate: rows.length ? consecDraws / rows.length : 0,
    tailRate: rows.length ? tailDraws / rows.length : 0
  };
}

/* 期号种子决定【这一期偏重哪几项】：四维权重各给 0.6~1.4 的倍率再归一化
   → 同一期固定（种子只有期号），换一期 → 「这期偏爱热号 / 那期偏爱冷号回补」，
   号码自然换一批；全程没有 Math.random，也不是「随便摇」。 */
function recWeights(seedTag) {
  const base = { hot: 0.30, cold: 0.26, sum: 0.18, zone: 0.26 };
  const mul = (k) => 0.6 + recSeed01(seedTag + '|w|' + k) * 0.8;
  const raw = {
    hot: base.hot * mul('hot'), cold: base.cold * mul('cold'),
    sum: base.sum * mul('sum'), zone: base.zone * mul('zone')
  };
  const tot = raw.hot + raw.cold + raw.sum + raw.zone;
  return {
    hot: raw.hot / tot, cold: raw.cold / tot,
    sum: raw.sum / tot, zone: raw.zone / tot
  };
}

/* 单号分：① 热 ② 冷 ③ 和值 ④ 分区（权重：默认定值，主要号区用期号倍数版） */
function recItems(st, cfg, withSum, w) {
  const W = w || (withSum
    ? { hot: 0.30, cold: 0.26, sum: 0.18, zone: 0.26 }
    : { hot: 0.45, cold: 0.45, sum: 0, zone: 0.10 });
  const out = [];
  for (let v = cfg.from; v <= cfg.to; v++) {
    const hot = st.maxFreq ? st.freq[v] / st.maxFreq : 0;
    const cold = st.theo ? Math.min(st.cur[v] / (st.theo * 2), 1) : 0;
    const sumFit = (withSum && st.perDraw && st.sumAvg)
      ? 1 - Math.min(Math.abs(v - st.sumAvg / st.perDraw) / (st.total / 2), 1) : 0;
    const exp = st.n ? (st.perDraw / st.zones) : 0;
    const act = st.n ? st.zc[st.zoneOf(v)] / st.n : 0;
    const zoneFit = exp ? Math.max(0, 1 - act / exp / 2) : 0.5;
    const data = hot * W.hot + cold * W.cold + sumFit * W.sum + zoneFit * W.zone;
    out.push({ n: v, data });
  }
  return out;
}

/* 共振池：先按单号分取前 poolN 个（分数不够的号根本没资格进），
   再在池子里用期号种子排序 —— 既保证「分高的号更容易进」，
   又保证换一期就换一批（池子大小 > 要选的个数，才有换的余地）。 */
function recPool(items, poolN) {
  const arr = items.slice().sort((a, b) => (b.data - a.data) || (a.n - b.n));
  return arr.slice(0, Math.max(1, Math.min(poolN, arr.length)));
}

/* 蓝球 / 后区 / 特别号：单独一套（次数 + 遗漏），池子 + 期号种子 */
function recPickSimple(items, need, seedTag) {
  const pool = recPool(items, need + 3);
  const arr = pool.map((it) => ({
    n: it.n,
    s: it.data * 0.45 + recSeed01(seedTag + '|' + it.n) * 0.55
  }));
  arr.sort((a, b) => (b.s - a.s) || (a.n - b.n));
  return arr.slice(0, need).map((x) => x.n).sort((a, b) => a - b);
}

/* 主要号区：五项打分先筛出「共振池」（`need × 2` 个），再在池子里选 ——
   ⑤ 奇偶补足 ⑥ 连号同尾 都在选到阶段才算（避免挤成一串）
   池内排序键 = 单号分 × 0.45 + 期号种子 × 0.55 */
function recPickMain(items, need, st, seedTag) {
  const left = recPool(items, Math.max(need + 3, Math.round(need * 2)))
    .map((it) => ({ n: it.n, data: it.data }));
  const pick = [];
  const zc = [0, 0, 0];
  const quota = Math.max(1, Math.floor(need / st.zones));
  const oddQuota = Math.round(need * (st.oddShare || 0.5));
  let oddN = 0, hasConsec = false, hasTail = false;
  for (let k = 0; k < need; k++) {
    let bi = -1, bv = -1e9;
    for (let i = 0; i < left.length; i++) {
      const it = left[i];
      if (it.taken) continue;
      let s = it.data * 0.40 + recSeed01(seedTag + '|' + it.n + '|' + k) * 0.60;
      const odd = it.n % 2 === 1;
      if (odd && oddN < oddQuota) s += 0.10;
      if (!odd && (k - oddN) < (need - oddQuota)) s += 0.10;
      const z = st.zoneOf(it.n);
      if (zc[z] === 0 && k < need - (st.zones - 1)) s += 0.10;
      else if (zc[z] >= quota + 1) s -= 0.07;
      if (!hasConsec && st.consecRate >= 0.4) {
        for (let q = 0; q < pick.length; q++) if (Math.abs(pick[q] - it.n) === 1) { s += 0.06; break; }
      }
      if (!hasTail && st.tailRate >= 0.5) {
        for (let q = 0; q < pick.length; q++) if (pick[q] % 10 === it.n % 10) { s += 0.04; break; }
      }
      if (s > bv) { bv = s; bi = i; }
    }
    if (bi < 0) break;
    const ch = left[bi];
    ch.taken = true;
    pick.push(ch.n);
    zc[st.zoneOf(ch.n)]++;
    if (ch.n % 2 === 1) oddN++;
    for (let q = 0; q < pick.length - 1; q++) {
      if (Math.abs(pick[q] - ch.n) === 1) hasConsec = true;
      if (pick[q] % 10 === ch.n % 10) hasTail = true;
    }
  }
  return pick.sort((a, b) => a - b);
}

/* 数字彩「一位」的统计（一行一个数位，允许重复开奖） */
function recColStat(rows, from, to) {
  const n = rows.length, total = to - from + 1;
  const freq = {}, cur = {};
  for (let v = from; v <= to; v++) { freq[v] = 0; cur[v] = n; }
  for (let i = 0; i < n; i++) {
    const v = Number(rows[i]);
    if (freq[v] == null) continue;
    freq[v]++;
    if (cur[v] === n) cur[v] = i;
  }
  let maxFreq = 1;
  for (let v = from; v <= to; v++) if (freq[v] > maxFreq) maxFreq = freq[v];
  return { n, total, freq, cur, maxFreq, theo: n ? total / n : 0 };
}
function recColData(st, v) {
  const hot = st.maxFreq ? st.freq[v] / st.maxFreq : 0;
  const cold = st.theo ? Math.min(st.cur[v] / (st.theo * 2), 1) : 0;
  return hot * 0.5 + cold * 0.5;
}

/* 数字彩：每位 3 个定位号（gate 位三组两两不重复）+ 6 码组选 */
function recDigits(gid, g, draws, issue) {
  const span = Math.min(draws.length, REC_SPAN);
  const list = draws.slice(0, span);
  const posDefs = [];
  const areaOf = (i) => {
    if (g.type === 'qxc') return i < 6 ? { key: 'front', idx: i } : { key: 'back', idx: 0 };
    return { key: 'main', idx: i };
  };
  if (g.type === 'qxc') {
    for (let i = 0; i < 6; i++) posDefs.push({ label: '第' + (i + 1) + '位', from: 0, to: 9, gate: false });
    posDefs.push({ label: '最后一位', from: 0, to: 14, gate: false });
  } else if (gid === 'pl5') {
    ['万位', '千位', '百位', '十位', '个位'].forEach((nm, i) => {
      posDefs.push({ label: nm, from: 0, to: 9, gate: i < 3 });
    });
  } else {
    ['百位', '十位', '个位'].forEach((nm) => posDefs.push({ label: nm, from: 0, to: 9, gate: true }));
  }
  const cols = posDefs.map((pd, i) => {
    const a = areaOf(i);
    const rows = [];
    for (let d = 0; d < list.length; d++) {
      const arr = ((list[d] && list[d].areas && list[d].areas[a.key]) || []);
      if (arr.length > a.idx) rows.push(Number(arr[a.idx]));
    }
    return recColStat(rows, pd.from, pd.to);
  });
  const sets = posDefs.map(() => []);
  const used = {};
  /* 每一位先筛「共振池」（该位冷热 + 遗漏得分最高的 6 个 / 非 gate 位 5 个），
     再在池子里按期号种子挑 3 个 —— 换一期就换一批，但换不出统计上的冷号。 */
  const pools = posDefs.map((pd, p) => {
    const st = cols[p], arr = [];
    for (let v = pd.from; v <= pd.to; v++) arr.push({ n: v, data: recColData(st, v) });
    return recPool(arr, pd.gate ? 6 : 5).map((x) => x.n);
  });
  for (let r = 0; r < 3; r++) {
    for (let p = 0; p < posDefs.length; p++) {
      const pd = posDefs[p], st = cols[p];
      let bi = -1, bv = -1e9;
      const cand = pools[p];
      for (let ci = 0; ci < cand.length; ci++) {
        const v = cand[ci];
        if (sets[p].indexOf(v) >= 0) continue;
        if (pd.gate && used[v]) continue;
        const s = recColData(st, v) * 0.45 + recSeed01(issue + '|' + gid + '|p' + p + '|' + v + '|' + r) * 0.55;
        if (s > bv) { bv = s; bi = v; }
      }
      /* 池子被别的位占满了 → 退到全区间补（gate 位仍然不许重复） */
      if (bi < 0) {
        for (let v = pd.from; v <= pd.to; v++) {
          if (sets[p].indexOf(v) >= 0) continue;
          if (pd.gate && used[v]) continue;
          const s = recColData(st, v) * 0.45 + recSeed01(issue + '|' + gid + '|p' + p + '|' + v + '|x' + r) * 0.55;
          if (s > bv) { bv = s; bi = v; }
        }
      }
      if (bi < 0) continue;
      sets[p].push(bi);
      if (pd.gate) used[bi] = 1;
    }
  }
  const blocks = posDefs.map((pd, i) => ({
    label: pd.label, kind: 'digit', color: '', nums: sets[i].sort((a, b) => a - b)
  }));
  /* 6 码组选（3D / 排3 有组选玩法；6 个互不相同的数字 → 20 注全是组六） */
  if (gid === 'fc3d' || gid === 'pl3') {
    const agg = {};
    for (let v = 0; v <= 9; v++) agg[v] = { f: 0, cur: 0, n: 0 };
    for (let p = 0; p < 3; p++) {
      const st = cols[p] || cols[cols.length - 1];
      if (!st) continue;
      for (let v = 0; v <= 9; v++) { agg[v].f += st.freq[v] || 0; agg[v].cur += st.cur[v] || 0; agg[v].n++; }
    }
    let maxF = 1;
    for (let v = 0; v <= 9; v++) if (agg[v].f > maxF) maxF = agg[v].f;
    const grpScore = [];
    for (let v = 0; v <= 9; v++) {
      const hot = agg[v].f / maxF;
      const curAvg = agg[v].n ? agg[v].cur / agg[v].n : 0;
      const cold = Math.min(curAvg / 20, 1);
      const data = hot * 0.5 + cold * 0.5;
      grpScore.push({ n: v, data: data });
    }
    /* 组选同样走「共振池（前 8 个）+ 期号种子」：6 个互不相同的数字 */
    const grpPool = recPool(grpScore, 8).map((it) => ({
      n: it.n, s: it.data * 0.45 + recSeed01(issue + '|' + gid + '|grp|' + it.n) * 0.55
    }));
    grpPool.sort((a, b) => (b.s - a.s) || (a.n - b.n));
    blocks.push({ label: '6 码组选', kind: 'digit', color: '', nums: grpPool.slice(0, 6).map((x) => x.n).sort((a, b) => a - b) });
  }
  const gateN = posDefs.filter((p) => p.gate).length;
  let basis = '定位号：近 ' + span + ' 期每位冷热 + 遗漏';
  /* 【2026-10-20】定位改成每位 3 个号之后，「27 注全组六」不再成立（数学上做不到）：
     每位 3 号 + 全部取自 6 码 ⇒ 组三恒为 9 注、组六 18 注、豹子 0。
     这里跟着改口径，否则页面自己前后矛盾。 */
  if (gateN >= 3) basis += '（前三位每位 3 个号（取自 6 码）→ 27 注单选：组六 18 注 · 组三 9 注 · 0 豹子）';
  if (gid === 'fc3d' || gid === 'pl3') basis += '；6 码组选 6 个互不相同的数字 → 20 注全组六（组三 0 注、豹子 0 注）';
  return { blocks, basis, span };
}

/* 主入口：8 个彩种各算一组 */
function buildRecNumbers() {
  const GAMESOBJ = G || {};
  const HIST = (mqReadGlobal('DRAW_HISTORY') || {}).games || {};
  const out = {};
  const lines = [];
  ['ssq', 'dlt', 'qlc', 'qxc', 'kl8', 'fc3d', 'pl3', 'pl5'].forEach((gid) => {
    const g = GAMESOBJ[gid];
    if (!g) return;
    const draws = Array.isArray(HIST[gid]) ? HIST[gid] : [];
    if (!draws.length) return;
    const issue = REC_ISSUE_OVERRIDE || recNextIssue(gid, draws);
    let rec = null;
    if (g.type === 'digit' || g.type === 'qxc') {
      rec = recDigits(gid, g, draws, issue);
    } else if (Array.isArray(g.areas) && g.areas.length) {
      const blocks = [];
      let span = 0;
      g.areas.forEach((cfg, ai) => {
        const st = recAreaStat(draws, cfg.key, cfg.from, cfg.to);
        span = st.n;
        if (!st.n) return;
        const need = Math.max(1, Number(cfg.pick || 1));
        const w = (ai === 0) ? recWeights(issue + '|' + gid + '|' + cfg.key) : null;
        const items = recItems(st, cfg, ai === 0, w);
        const nums = (ai === 0)
          ? recPickMain(items, need, st, issue + '|' + gid + '|' + cfg.key)
          : recPickSimple(items, need, issue + '|' + gid + '|' + cfg.key);
        blocks.push({
          label: cfg.label || ('区' + (ai + 1)),
          kind: 'ball',
          color: (cfg.color === 'blue' || ai === 1) ? 'blue' : 'red',
          nums: nums
        });
      });
      const basis = '热号 30% · 冷号回补 26% · 和值合理 18% · 分区覆盖 26%' +
        '（奇偶平衡 / 连号同尾在选号时补），期号做种子';
      rec = { blocks, basis, span: span || Math.min(draws.length, REC_SPAN) };
    }
    if (!rec || !rec.blocks.length) return;
    out[gid] = {
      issue, name: String(g.name || gid), span: rec.span,
      basis: rec.basis, blocks: rec.blocks
    };
    const txt = rec.blocks.map((b) => b.label + ' ' + b.nums.map((x) => (b.kind === 'digit' ? String(x) : String(x).padStart(2, '0'))).join(' ')).join(' · ');
    lines.push('    ' + String(g.name || gid) + ' 第 ' + issue + ' 期：' + txt);
  });
  if (lines.length) {
    console.log(`  · 本期推荐号码（多源共振 · 种子=下一期期号${REC_ISSUE_OVERRIDE ? ' · 自测期号覆盖 ' + REC_ISSUE_OVERRIDE : ''}）：`);
    lines.forEach((l) => console.log(l));
  }
  return out;
}
const TOOL_ORDER = ['ssq', 'dlt', 'qlc', 'qxc', 'kl8', 'fc3d', 'pl3', 'pl5'];
const TOOL_GAMES = TOOL_ORDER.filter((k) => G && G[k]).map((k) => {
  const g = G[k];
  let areas = (g.areas || []).map((a) => ({
    key: String(a.key || ''), label: String(a.label || ''),
    from: Number(a.from || 0), to: Number(a.to || 0), pick: Number(a.pick || 0)
  }));
  /* 数字彩（福彩3D / 排列3 / 排列5）：games.js 里没有 areas，只有位数 →
     当成一个 0~9 的号码区，每期出 digits 个（开奖允许重复）。 */
  if (!areas.length && g.type === 'digit') {
    areas = [{ key: 'main', label: '各位', from: 0, to: 9, pick: Number(g.digits || 3) }];
  }
  /* 七星彩：前六位 / 最后一位 是【位】，不是「从 N 个号里选 M 个」→
     pick 留 0，页面按实际开出的位数算（见各子页面的 picksOf()）。 */
  return { id: k, name: String(g.name || k), type: String(g.type || 'areas'), areas };
});
const TOOL_GAMES_JS = JSON.stringify(TOOL_GAMES);

/* __REC__ 构建时算好的「本期推荐号码」（多源共振打分 · 种子 = 下一期期号） */
/* __RECO_ARCHIVE__ 2026-10-20：把这一份【原样】留一个对象引用 ——
   「历史开奖」卡要靠它把本期真实发出去的号写进 reco-archive.json，
   和页面里显示的必须是同一个对象（REC_JS 就是它的 JSON），不许各算一遍。 */
const REC_DATA = buildRecNumbers();
const REC_JS = JSON.stringify(REC_DATA);

console.log(`  · ai选号：${AIPICK_RULES.map((g) => g.name).join(' / ')}`);

function buildAiPickHtml() {
  const tabs = AIPICK_RULES.map((g, i) =>
    `<a class="ro-aipick-tab${i === 0 ? ' on' : ''}" role="button" tabindex="0"` +
    ` data-ro-aipick-game="${escapeAttr(g.id)}">${escape(g.name)}</a>`
  ).join('');

  /* 【并排两列 · 2026-10-18】同上：只多挂 .action-card-btn / .title / .sub /
     .action-text 四个类名，折叠与摇号逻辑一个字没改
     （它仍然放在 #article 外面 —— 防截图锁定的时候，这一块要能点、能摇号）。 */
  return `<details class="ro-aipick action-card-btn" id="ro-aipick">` +
    `<summary class="ro-aipick-head">` +
    `<h2 class="ro-aipick-h2 title"><span class="entry-icon" aria-hidden="true">🎲</span> GPT模型摇号</h2>` +
    `<div class="ro-aipick-sub sub">系统随机生成</div>` +
    `<span class="ro-aipick-arrow action-text" aria-hidden="true"></span>` +
    `</summary>` +
    `<div class="ro-aipick-body allow-save">` +
    `<div class="ro-aipick-line"><span class="ro-aipick-lbl">彩种</span>` +
    `<div class="ro-aipick-tabs">${tabs}</div></div>` +
    /* 【选号 chip：随机 / 自选】用户 2026-10-17：
       ①「改成随机」→ 号码默认随机摇（点「开始摇号 / 」）；
       ②「加一个：自选 这样他们可以自己选自己看好的」→ 旁边加一个「自选」：
          切到自选后不摇随机号，直接用下面格子里你点的号（点完自动算注数/金额）。
       两个 chip 都可点（<span role="button">，页面不变量：绝不用 button 标签）。 */
    `<div class="ro-aipick-line ro-aipick-line-src"><span class="ro-aipick-lbl">选号</span>` +
    `<div class="ro-aipick-tabs ro-aipick-seg">` +
    `<span class="ro-aipick-srcbtn on" role="button" tabindex="0" data-ro-aipick-src="random">随机</span>` +
    `<span class="ro-aipick-srcbtn" role="button" tabindex="0" data-ro-aipick-src="manual">自选</span>` +
    `</div></div>` +
    /* 【自己选号：点格子选号】用户 2026-10-17：
       「还要加一个：选号 就是自己点击去选号码」
       → 把以前那套号码格子搬回来（CSS 一直在，只有标记和 JS 被摘掉了）：
         每个号码区（数字彩=每一位）一段，点一下选中、再点一下取消；
         点出来的号直接进结果区（st.rows 一条），所以「保存图片」照用同一套。
       ⚠️ 格子是 <a role="button">，不能用 button 标签（页面不变量）。 */
    `<div class="ro-aipick-self">` +
    `<div class="ro-aipick-picker"></div>` +
    `<div class="ro-aipick-line ro-aipick-selfacts">` +
    `<a class="ro-aipick-btn ghost" role="button" tabindex="0" data-ro-aipick-act="reset">清空重选</a>` +
    `<span class="ro-aipick-selfnote">点号码就能自己选；自己选的号只放在内存里，刷新页面就没了</span>` +
    `</div></div>` +
    `<div class="ro-aipick-line ro-aipick-line-kl8" hidden>` +
    `<span class="ro-aipick-lbl">玩法</span><div class="ro-aipick-kl8"></div></div>` +
    `<div class="ro-aipick-rule"></div>` +
    /* 【用户原话】「复式 改成输入要选几个号 比如红球要选几个」：
       单式 / 复式开关拿掉了，这一行【始终显示】——每个号码区一个输入框
       （双色球 = 红球 / 蓝球，大乐透 = 前区 / 后区…），内容由 buildMultiRow() 现算。 */
    `<div class="ro-aipick-line ro-aipick-line-multi">` +
    `<span class="ro-aipick-lbl">选几个</span><div class="ro-aipick-multi"></div></div>` +
    `<div class="ro-aipick-line ro-aipick-line-times">` +
    `<span class="ro-aipick-lbl">倍数</span>` +
    /* 【倍数输入框】同样不能用 number：number 不支持选区 → 聚焦全选失效、打字变追加。
       并且它的监听也改成只在 change/回车时 refresh（input 里夹取会打不出两位数）。 */
    `<input class="ro-aipick-in ro-aipick-in-times" type="text" inputmode="numeric"` +
    ` pattern="[0-9]*" autocomplete="off" min="1" value="1">` +
    `<span class="ro-aipick-unit">倍</span>` +
    `<span class="ro-aipick-sum"></span></div>` +
    `<div class="ro-aipick-warn" hidden></div>` +
    `<div class="ro-aipick-acts">` +
    `<a class="ro-aipick-btn on" role="button" tabindex="0" data-ro-aipick-act="roll">开始摇号</a>` +
    `<a class="ro-aipick-btn ghost" role="button" tabindex="0" data-ro-aipick-act="reroll"></a>` +
    `<a class="ro-aipick-btn ghost" role="button" tabindex="0" data-ro-aipick-act="clear">清空</a>` +
    `<a class="ro-aipick-btn ghost" role="button" tabindex="0" data-ro-aipick-act="save">保存图片</a>` +
    `</div>` +
    `<div class="ro-aipick-out"></div>` +
    /* 【底部两行小字】用户原话给的就是这两句，一字不改。
       第二句是真的：这一块【完全不写任何浏览器存储】，状态只放在内存里。 */
    `<div class="ro-aipick-note">号码由系统随机生成，仅用于摇号娱乐，不代表任何预测或建议。</div>` +
    `<div class="ro-aipick-note">所有数据仅存在本地，不上传、不保存。</div>` +
    `</div>` +
    `</details>`;
}

const aiPickHtml = buildAiPickHtml();

/* ============================================================
   【开机号】工具栏入口 + 可展开区块（原「选号直播」那一格已撤掉，见 buildToolsHtml）
   ------------------------------------------------------------
   用户原话：「新增两个工具栏。一个是开机号（…/kjh）。
             一个是选号直播（…/live）。
             开机号点进去只是实时的开机号（每天2点抓取更新就好了）」
   2026-10-18 用户改口：「就是这里替换成热力图」→ 选号直播那块整块换成热力图折叠卡。
   位置：用户截图红框 =「推荐图目录」(.ro-imgtoc-wrap) 之后、「最新开奖」之前。

   交互（选的是方案 A：锚点 + :target 展开，样式见 @supports 那一段）：
     · 两个入口都是 <a>（页面不变量要求没有按钮标签），href 指向下面两个区块的 id
     · 区块平时 display:none，被 :target 命中才显示 —— 点一下当场在入口下面展开，
       并平滑滚过去（html { scroll-behavior: smooth } 本来就有）。
       好处：【不点的时候页面完全不变】，「最新开奖」不会被挤下去。
     · 为什么不选方案 B（全屏层）：全屏层要与页尾那套全屏查看逻辑抢层级，
       而且用户刚删掉的旧放大器类名就叫 lightbox ——
       锚点这套更小、更稳、零 JS、零层级风险。
   数据：kjh-data.js（build-kjh.mjs 每天 2 点抓一次，跟着 daily-update.mjs）。
   两个区块都是纯文字（没有图片）→ 图位数量（data-image）不变。
   ⚠️ 页面上【不出现来源字样】：链接域名里的字母用 HTML 实体写
      （复用文章参考那个 articleHref，href 里有域名、页面上看不到）。
   ============================================================ */
const KJH_ORDER = ['ssq', 'dlt', 'fc3d', 'kl8', 'pl3', 'pl5', 'qxc', 'qlc'];

/* 工具栏：现在只剩「开机号」一个格子
   ------------------------------------------------------------
   用户 2026-10-18：「就是这里替换成热力图」——
   原来并排的「选号直播」那块已经被【热力图折叠卡】顶掉（见下面的
   buildHeatmapHtml），它的入口卡也一并撤掉：热力图自己就是那张能点的卡，
   不需要再多一个「点一下跳过去」的入口。 */
function buildToolsHtml() {
  /* 2026-10-18 用户：「把开机号和热力图改成并排两列」——
     外面那层 .ro-tools 已撤掉，这张卡现在只是【两列容器里的左格】
     （容器见下面的 toolsHeatHtml）；卡片本体改用用户给的 .action-card 规格，
     里面三行 = 标题 / 副标题 / 「点击查看」（和右边热力图卡对齐）。
     ⚠️ 仍然是 <a>（页面不变量：没有按钮标签），点击逻辑一个字没改。 */
  return `<a class="ro-tool ro-tool-kjh action-card" href="#ro-kjh">` +
    `<span class="title"><svg viewBox="0 0 28 28" width="23" height="23" aria-hidden="true" style="vertical-align:middle"><circle cx="14" cy="11" r="9" fill="#e4f5ff" stroke="#367aa0" stroke-width="1.5"/><circle cx="10" cy="10" r="3" fill="#d65345"/><circle cx="18" cy="10" r="3" fill="#3773bf"/><circle cx="14" cy="16" r="3" fill="#ebb738"/><path d="M7 21h14l2 5H5z" fill="#358b6b"/><path d="M14 3v6m-6 8 6-6 6 6" fill="none" stroke="#8aa6b8" stroke-width="1"/></svg> 开机号</span>` +
    `<span class="sub">各彩种实时开机号</span>` +
    `<span class="sub ro-go" data-tip="1">点击查看</span></a>`;   /* __TOOL_TIP__ 展开后 JS 改成「点击收起」 */
}

/* 开机号区块：每个彩种一行（彩种名 + 期号 + 号码 + 和值等 + 开奖时间） */
function buildKjhHtml() {
  const games = (KJH && KJH.games) ? KJH.games : {};
  const updated = (KJH && KJH.updated) ? String(KJH.updated) : '';
  const keys = KJH_ORDER.filter((k) => games[k]);

  const rows = keys.map((k) => {
    const g = games[k] || {};
    const nums = Array.isArray(g.nums) ? g.nums : [];
    const blue = Array.isArray(g.blue) ? g.blue : [];
    /* 红/蓝分开渲染（和「最新开奖」一样：蓝球用蓝底） */
    const balls = nums.map((n) => `<span class="ro-kjh-ball">${escape(n)}</span>`).join('') +
      blue.map((n) => `<span class="ro-kjh-ball is-blue">${escape(n)}</span>`).join('');
    const extra = (Array.isArray(g.extra) && g.extra.length)
      ? `<div class="ro-kjh-extra">${g.extra.map((t) => escape(t)).join(' · ')}</div>`
      : '';
    return `<div class="ro-kjh-item" data-gid="${escapeAttr(k)}">` +
      `<div class="ro-kjh-top">` +
      `<b class="ro-kjh-name">${escape(g.name || k)}</b>` +
      (g.issue ? `<span class="ro-kjh-issue">第${escape(g.issue)}期</span>` : '') +
      `</div>` +
      `<div class="ro-kjh-nums">` +
      (balls || `<span class="ro-kjh-none">暂无</span>`) +
      `</div>` + extra +
      (g.time ? `<div class="ro-kjh-time">开奖时间 ${escape(g.time)}</div>` : '') +
      `</div>`;
  }).join('');

  return `<section class="ro-panel ro-kjh-panel" id="ro-kjh">` +
    `<div class="ro-panel-head">` +
    `<h2 class="ro-panel-title">开机号</h2>` +
    /* 【定时文案】2026-10-18 用户要求页面上不要「每天 2:00 自动更新」这类定时说法
       → 副标题改成不带时刻的中性说明（数据仍然是原来的节奏，只是不再写在页面上）。 */
    `<div class="ro-panel-sub">各彩种最新开机号` +
    /* __NO_UPDATED__ 用户要求删掉「更新于」 */ '' + `</div>` +
    `</div>` +
    (rows ? `<div class="ro-kjh-grid">${rows}</div>` : `<div class="ro-panel-none">暂无</div>`) +
    `</section>`;
}

/* ============================================================
   【热力图要显示哪个彩种】= 下一期开奖最近的那一个
   ------------------------------------------------------------
   用户 2026-10-18 原话：
     「热力图模板移到这里面 热力图点击可以收起展开 展开就是热力图
       热力图根据下一期开大乐透还是双色球来实时更新 时时刻刻显示 去掉以前的定时」
   口径（沿用页面里已经有的那张开奖日表，不另起一套）：
     · 双色球 周二 / 周四 / 周日 21:15     → 开奖日 [0, 2, 4]
     · 大乐透 周一 / 周三 / 周六 21:25     → 开奖日 [1, 3, 6]
       （开奖日与 latest-draws.js 的 NEXTCD_TABLE 同一套；时刻按用户给的口径）
     · 「下一期」= 这两个彩种里【最近的、还没到开奖时刻】的那一场
     · 时间一律按北京时间（UTC+8）算，不看用户设备时区
   实现：下面这段源码只写一次 —— 服务端 new Function 跑一遍拿结果，
        生成出来的页面里塞的是【同一份源码】，两边算法不可能漂移。
   ============================================================ */
const HM_NEXT_SRC = `
function hmNextGame(nowMs) {
  var TZ = 8 * 3600000;
  var TABLE = {
    ssq: { days: [0, 2, 4], h: 21, m: 15 },
    dlt: { days: [1, 3, 6], h: 21, m: 25 }
  };
  var t = (typeof nowMs === 'number' && isFinite(nowMs)) ? nowMs : (new Date()).getTime();
  var best = '', bestAt = Infinity;
  var keys = ['ssq', 'dlt'];
  for (var i = 0; i < keys.length; i++) {
    var gid = keys[i], r = TABLE[gid];
    if (!r) continue;
    var bj = new Date(t + TZ);
    var day0 = Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate()) - TZ;
    for (var d = 0; d < 8; d++) {
      var at = day0 + d * 86400000 + r.h * 3600000 + r.m * 60000;
      if (r.days.indexOf(new Date(at + TZ).getUTCDay()) < 0) continue;
      if (at <= t) continue;
      if (at < bestAt) { bestAt = at; best = gid; }
      break;
    }
  }
  return best || 'ssq';
}
`;
const hmNextGame = new Function(HM_NEXT_SRC + '\nreturn hmNextGame;')();

/** 页面上该显示哪个彩种（热力图只做双色球 / 大乐透） */
function heatmapNextGameId(nowMs) {
  try {
    return (hmNextGame(nowMs) === 'dlt') ? 'dlt' : 'ssq';
  } catch (e) { return 'ssq'; }
}
/** 彩种中文名（取不到就用兜底名） */
function hmGameName(gid) {
  if (G && G[gid] && G[gid].name) return G[gid].name;
  return gid === 'dlt' ? '大乐透' : '双色球';
}
/** 这个彩种下一期的期号（热力图数据里有就用它，没有就现算） */
function hmIssueText(gid) {
  try {
    const H = (HEATMAP && HEATMAP.games) ? HEATMAP.games[gid] : null;
    if (H && H.issue) return String(H.issue);
  } catch (e) { /* 忽略 */ }
  try { return String(nextIssue(gid) || ''); } catch (e2) { return ''; }
}

/* 热力图折叠卡（用户 2026-10-18：
     「就是这里替换成热力图」「热力图点击可以收起展开 展开就是热力图」
     「热力图根据下一期开大乐透还是双色球来实时更新 时时刻刻显示 去掉以前的定时」）
   ------------------------------------------------------------
   这一块就是【原来「选号直播」那一块的位置】，现在整块换成热力图：
     · 位置：推荐图目录 / 开机号下面 —— 和原来一样，只是内容换了
     · 折叠：<details> + <summary>，和「走势图」同一套机制
             （默认收起；点标题就地展开，再点收起；不用裸 button、不跳页、不弹窗）
     · 显示哪个彩种：heatmapNextGameId() 按【当前时间】算「下一期最近的那个」——
             服务端先算一次填进 HTML，页面脚本在打开/切回来时再算一次
     · 热力图本身【一个字都没重写】：还是 renderImageHtml(g, 'heatmap')，
             只是从「独立区块」搬进这张折叠卡里
     · 页面上不写任何「每小时 / 每天几点」的说法，也不做轮询定时 */
function buildHeatmapHtml() {
  const tms = (HEATMAP && HEATMAP.games) ? HEATMAP.games : {};
  /* 【2026-10-18 19:5x 回滚 · 整卡不能因为「样本少」就消失】
     上一手（19:43）在这里加了 MIN_TICKETS = 10 的阈值 + `if (!ids.length) return ''`，
     而当时 ssq 只有 6 张票、dlt 0 张 → ids 变空 → 函数直接返回空串
     → 页面里连 <details class="ro-heat"> 都没有，用户就问「我的热力图工具栏呢」。
     这违反本文件开头的铁律第 5 行「没数据时在【原有结构内】写"暂无"，不允许整块消失」。
     所以恢复成原样：只要有号码明细就出块 / 出图，样本少的时候靠已有的
     .ro-hm-none「本期热力图正在整理，稍后再看」和口径标签如实说明，绝不整块抹掉。 */
  const nowId = heatmapNextGameId();
  const ids = ['ssq', 'dlt'].filter((g) => {
    const H = tms[g];
    return !!(H && H.front && Array.isArray(H.front.items) && H.front.items.length);
  });
  const hasCur = ids.indexOf(nowId) >= 0;

  const blocks = ids.map((g) => {
    const H = tms[g] || {};
    const name = hmGameName(g);
    let inner = '';
    try { inner = renderImageHtml(g, 'heatmap') || ''; } catch (e) { inner = ''; }
    const stamp = String(H.updated || H.drawDate || '');
    /* 【如实标口径】用户要的是「晒票占比」，但 OCR 样本不够时 build-heatmap 会回退成
       「近 30 期开奖频率」—— 绝不能拿兜底冒充晒票统计，这里按 source 明写。 */
    const SRC_LABEL = {
      'ocr-xysp': '晒票票面 OCR 统计',
      'xysp-text': '晒票文字统计',
      'history-fallback': '近期开奖频率（晒票样本不足·兜底口径）'
    };
    const srcText = SRC_LABEL[String(H.source || '')] || '近期开奖频率（兜底口径）';
    /* 【样本提示 · 2026-10-18 20:1x】用户要求：块不能删，但样本少要【如实标一行小字】。
       · 票数 = 0 / 走兜底口径 →「暂无实票样本，改用近 30 期开奖频率」
       · 0 < 票数 < 10          →「样本仅 N 张，仅供参考」
       · 票数 ≥ 10              → 不加（正常显示，不打扰）
       N 取 H.sampleCount（build-heatmap.mjs 写的「本期有效票张数」）。
       ⚠️ 兜底口径时 sampleCount 是【期数】（30），不是票数 —— 不能拿它当张数写，
          否则会出现「样本仅 30 张」这种假话；这种情况走第一档文案。
       ⚠️ 只是加一行 <span>，不碰 .ro-hm-head 结构，也不删任何块。 */
    const srcName = String(H.source || '');
    const isTicketSrc = (srcName === 'ocr-xysp' || srcName === 'xysp-text');
    const ticketN = Number(H.sampleCount) || 0;
    const sampleTip = !isTicketSrc
      ? '<span class="ro-hm-tip" data-ro-hm-tip="1">暂无实票样本，改用近 30 期开奖频率</span>'
      : (ticketN > 0 && ticketN < 10
        ? '<span class="ro-hm-tip" data-ro-hm-tip="1">样本仅 ' + ticketN +
          (srcName === 'ocr-xysp' ? ' 张' : ' 条') + '，仅供参考</span>'
        : '');
    /* 两个彩种的图都预渲染在 DOM 里，只按「当前该看哪个」显隐 —— 展开即见，不用等 */
    return `<div class="ro-hm-block" data-ro-hm-game="${g}"${g === nowId ? '' : ' hidden'}>` +
      `<div class="ro-hm-head"><b>${escape(name)} 实票统计</b>` +
      `<span data-ro-hm-cd="1">刷新倒计时 59:59</span>` +
      sampleTip + `</div>` +
      `<div class="ro-imagewrap" data-game="${g}" data-image="heatmap">${inner}</div>` +
      `</div>`;
  }).join('');

  const curIssue = hmIssueText(nowId);
  const subText = '当前：' + hmGameName(nowId) + (curIssue ? ' 第 ' + curIssue + ' 期' : '');

  /* 【并排两列 · 2026-10-18】这张卡现在是两列容器（.grid-2-col）里的【右格】：
     + 加一个中性类名 .ro-hm-card —— 两列布局的 CSS 全靠它命中这张卡
       （保护标记按次数数「ro-heat」出现，多写一个就多一处，所以布局不碰它）；
     + 标题 / 副标题补上 .title / .sub，和左边「开机号」卡同一套字号；
     + <details> / <summary> / 折叠 / 「点击查看 · 点击收起」一个字都没改。 */
  return `<details class="ro-heat ro-hm-card" id="ro-heatmap">` +
    `<summary class="ro-heat-head">` +
    `<span class="ro-heat-title title"><svg viewBox="0 0 28 28" width="23" height="23" aria-hidden="true" style="vertical-align:middle"><path d="M3 3v22h22" fill="none" stroke="#8b7862" stroke-width="1.5"/><path d="M4 22 8 17 12 19 16 8 20 12 25 4 25 24 4 24z" fill="#ffe0b3"/><path d="m4 22 4-5 4 2 4-11 4 4 5-8" fill="none" stroke="#df573b" stroke-width="2.5" stroke-linejoin="round"/></svg> 热力图</span>` +
    `<span class="ro-heat-sub sub" data-ro-hm-sub="1">${escape(subText)}</span>` +
    `<span class="ro-heat-arrow" aria-hidden="true"></span>` +
    `</summary>` +
    `<div class="ro-heat-body">` +
    `<div class="ro-hm-none" data-ro-hm-none="1"${hasCur ? ' hidden' : ''}>本期热力图正在整理，稍后再看</div>` +
    blocks +
    `</div>` +
    `</details>`;
}

const toolsHtml = buildToolsHtml();
const kjhHtml = buildKjhHtml();
const heatHtml = buildHeatmapHtml();

/* ============================================================
   【并排两列 · 2026-10-18】开机号（左）+ 热力图（右）同一个容器
   ------------------------------------------------------------
   用户原话：「把开机号和热力图改成并排两列」
     → 收起时各占 50%（一行两个卡片）；点开热力图后它占满整行（图片要宽）。
   两格都是【原来那两张卡，内容一个字没改】：
     · 左 = <a class="ro-tool ... action-card" href="#ro-kjh">（还是锚点，不是 button）
     · 右 = <details class="ro-heat ro-hm-card">（还是原生折叠）
   布局样式见样式表最后那段 __LAYOUT__ ⑧（.grid-2-col / .action-card）。
   ============================================================ */
const toolsHeatHtml = `<div class="grid-2-col" id="ro-tools-heat">` + toolsHtml + heatHtml + `</div>`;
console.log(`  · 开机号：${(KJH && KJH.games) ? Object.keys(KJH.games).length : 0} 个彩种` +
  (((KJH && KJH.games) && Object.keys(KJH.games).length) ? '' : '（数据缺失 → 页面显示「暂无」）'));
/* 【选号直播】那块已被【热力图折叠卡】整块顶掉（用户 2026-10-18），
   所以这里不再打印直播回放条数；改成打印「热力图这一页会显示哪个彩种」。 */
{
  const hmNow = heatmapNextGameId();
  console.log(`  · 热力图：显示 ${hmGameName(hmNow)}` +
    (hmIssueText(hmNow) ? ` 第 ${hmIssueText(hmNow)} 期` : '') +
    `（按当前时间算出来的「下一期最近的彩种」；折叠卡默认收起）`);
}

/* ============================================================
   【已移除】竞彩（体彩在售比赛）段落
   ------------------------------------------------------------
   分享页（彩票推荐页）不再显示足球 / 竞彩内容 ——
   足球只放在独立的「足球竞彩」页：
     分享包/football.html  ← 由 export-football.mjs 生成
   顶部导航的「足球竞彩」tab 直接跳到 football.html。

   原来这里有一个 buildJcSection()，会读 jc-data.js 与 football.js，
   拼出「竞彩 · 推胜负平」卡片组；现在整段删除，
   分享页生成时也不再需要这两个数据文件。
   ============================================================ */

/* ============================================================
   组装完整 HTML
   ============================================================ */

/* ---------- 生成状态条 HTML（此时 T/G 已加载） ---------- */
/* 【日期显示】把 2026-10-15 变成 2026年10月15日 */
function ymdCN(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日' : '';
}
/* 某个彩种的下一期开奖日期（中文） */
function dateCN(id) {
  try { return ymdCN(nextDate(id)); } catch (e) { return ''; }
}
/* 所有彩种里【最早】的那个下期开奖日 —— 标题上显示它 */
const nextDayText = (() => {
  const list = Object.keys(T).map(dateCNRaw).filter(Boolean).sort();
  return list.length ? ymdCN(list[0]) : '';
})();
function dateCNRaw(id) {
  try { return String(nextDate(id) || '').slice(0, 10); } catch (e) { return ''; }
}

/* ============================================================
   __MQ_TICKER__ 顶部状态卡右侧：中奖播报（横向滚动通告条）
   ------------------------------------------------------------
   用户要求：在「已更新 / 所有资料均在下方 / 下一期更新倒计时」那张卡片的
   右边空位上做一条横向滚动的小喇叭通告，播报最近的开奖中奖情况。

   播报规则（用户 2026-10-18 定稿，逐条落地）：
     ①【所有彩种】都播 —— 双色球 / 大乐透 / 七星彩 / 七乐彩 / 快乐8 /
        福彩3D / 排列3 / 排列5，中了就播（不再"只有数字彩"）。
     ② 大盘彩（双色球 / 大乐透 / 七星彩 / 七乐彩 / 快乐8）：
          只播【一等奖】和【二等奖】两个档，按官方奖级规则判。
          文案必须写明【几等奖】+【主号中几个 / 副号中几个】：
            · 双色球 第 2026119 期 · 推荐号命中二等奖（红球 6 个 + 蓝球 0 个）
            · 大乐透 第 26119 期 · 推荐号命中一等奖（前区 5 个 + 后区 2 个）
          其它奖级（三～九等奖）与没中一律不播。
     ③ 数字彩（福彩3D / 排列3 / 排列5）—— 每期开奖后，中了才播，播中奖类型：
          · 直选（三位全中且顺序对）
          · 组选（组三 = 三位有两个相同 / 组六 = 三位互不相同）
          · 排列5 五位全中播「直选命中」；只中前三位则播「前三位直选命中」
        没中 → 不播（不占位置）
     ④ 喇叭里【只有中奖播报】—— 用户 2026-10-18：不要「近 N 期推荐 · 中奖 M 期」
        这种统计数字，一条都不要。
     ⑤ 窗口：每个彩种最多比【最近 30 期】（存档里存了多少就比多少）；
        滚动条最多留【最近 10 条】，同一彩种最多 3 条 —— 免得一个彩种把位置占满。
     ⑥ 全部是算出来的：没有任何一条写死的中奖记录；算不出来（缺推荐 / 缺开奖 /
        期号对不上）就是 0 条，宁可显示「暂无中奖播报」。每天跟着生成任务刷新。

   比对口径（每期只用一份推荐号；期号必须对得上）：
     · fc3d / pl3 ：直选池 = 百/十/个 三个定位栏；组选池 = 组选 6 码
     · pl5        ：万/千/百/十/个 五个定位栏
     · ssq        ：红球二十码池 + 蓝球候选栏；dlt：前区二十码池 + 后区候选栏
     · qlc        ：基本号二十二码池；kl8：选十那 10 码
     · qxc        ：六位定位栏 + 后区栏

   官方奖级（大盘彩只认前两档，和 hit-check.js 的奖级表同口径）：
     · ssq ：一等奖 = 红 6 + 蓝 1；二等奖 = 红 6 + 蓝 0
     · dlt ：一等奖 = 前 5 + 后 2；二等奖 = 前 5 + 后 1
     · qlc ：一等奖 = 基本号 7 个；二等奖 = 基本号 6 个 + 特别号中
     · qxc ：一等奖 = 前六位全中 + 后区中；二等奖 = 前六位全中、后区未中
     · kl8 ：一等奖 = 选十中十；二等奖 = 选十中九

   ⚠️ 没有这一期的推荐 / 没有这一期的开奖 / 期号对不上 → 直接跳过，
      不猜、不补、不挪用相邻期。全都对不上就出一句「暂无中奖播报」。
   ============================================================ */

/* 从共享上下文里取一份全局表（没有就返回 null，绝不让构建挂掉） */
function mqReadGlobal(name) {
  try {
    return vm.runInContext('(typeof ' + name + ' !== "undefined") ? ' + name + ' : null', ctx);
  } catch (e) { return null; }
}

/* "05 06 08" / "5,6,8" / "050608" 之外的写法统一成数字数组（只支持带分隔符与纯两位） */
function mqNums(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return [];
  if (/\s/.test(s)) return s.split(/\s+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
  if (/[,，、/]/.test(s)) return s.split(/[,，、/]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
  if (/^\d+$/.test(s)) {
    if (s.length <= 2) return [parseInt(s, 10)];
    if (s.length % 2 === 0) {
      const out = [];
      for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 10));
      return out.filter((n) => Number.isFinite(n));
    }
  }
  return [];
}

/* 开奖索引：彩种|期号 → 那期开奖（历史表 + 最新一期，同号以后者为准） */
function mqDrawIndex() {
  const map = {};
  const hist = mqReadGlobal('DRAW_HISTORY');
  const live = mqReadGlobal('DRAW_DATA');
  const add = (gid, it) => {
    if (it && it.areas && it.issue !== undefined && it.issue !== null && String(it.issue)) {
      map[gid + '|' + String(it.issue)] = it;
    }
  };
  const hg = (hist && hist.games) || {};
  Object.keys(hg).forEach((gid) => { (hg[gid] || []).forEach((it) => add(gid, it)); });
  const lg = (live && live.games) || {};
  Object.keys(lg).forEach((gid) => add(gid, lg[gid]));
  return map;
}

const MQ_NAME = {
  ssq: '双色球', dlt: '大乐透', fc3d: '福彩3D', pl3: '排列3',
  pl5: '排列5', qlc: '七乐彩', kl8: '快乐8', qxc: '七星彩'
};
const MQ_ORDER = ['ssq', 'dlt', 'fc3d', 'pl3', 'pl5', 'qlc', 'kl8', 'qxc'];

/* 某个彩种存档里的各期推荐（按期号去重：同一期推了多份时留推送最晚的那份） */
function mqPeriods(gid, saved) {
  const bag = saved && saved.tickets && saved.tickets[gid];
  if (!bag) return [];
  const byIssue = new Map();
  const add = (p) => {
    if (!p || !p.images || !p.images.main || !p.issue || !p.pushedAt || !p.date) return;
    const hm = { ssq:'21:15', dlt:'20:30', kl8:'21:30', fc3d:'21:15', pl3:'20:30', pl5:'20:30', qlc:'21:15', qxc:'20:30' }[gid];
    const text = String(p.pushedAt);
    const at = Date.parse(/[zZ]$|[+-][0-9]{2}:[0-9]{2}$/.test(text) ? text : text.replace(' ', 'T') + '+08:00');
    const close = Date.parse(p.date + 'T' + hm + ':00+08:00');
    if (!Number.isFinite(at) || !Number.isFinite(close) || at >= close) return;
    const key = String(p.issue), prev = byIssue.get(key);
    if (!prev || at < prev.at) byIssue.set(key, { at, value: p });
  };
  Object.keys(bag).forEach((key) => {
    if (key === 'history') { if (Array.isArray(bag[key])) bag[key].forEach(add); }
    else add(bag[key]);
  });
  return Array.from(byIssue.values()).map((p) => p.value);
}

/**
 * 单期判定：中了返回 { claim, hot }，没中 / 算不出来返回 null
 *   claim = 播报里的那句话（不含彩种与期号）
 *   hot   = 2 表示最高档（一等奖 / 直选），1 表示其它可播档
 */
function mqJudge(gid, v, d) {
  if (!v || !d || !d.areas) return null;
  if (gid !== 'ssq' && gid !== 'dlt' && typeof ctx.latestOtherPoolJudge === 'function') return ctx.latestOtherPoolJudge(gid, v, d.areas);
  const area = (k) => (d.areas[k] || []).map(Number);
  const inPool = (pool, n) => pool.indexOf(Number(n)) >= 0;
  const hits = (src, pool) => src.filter((n) => inPool(pool, n)).length;

  /* ---------- 福彩3D / 排列3 ---------- */
  if (gid === 'fc3d' || gid === 'pl3') {
    const w = area('main');
    if (w.length < 3) return null;
    const bai = mqNums(v.bai), shi = mqNums(v.shi), ge = mqNums(v.ge), grp = mqNums(v.grp);
    if (!bai.length || !shi.length || !ge.length || !grp.length) return null;
    /* 直选：开奖三位分别落在 百/十/个 的定位池里（顺序对） */
    if (inPool(bai, w[0]) && inPool(shi, w[1]) && inPool(ge, w[2])) {
      return { claim: '推荐号直选命中！', hot: 2 };
    }
    /* 组选：开奖三位都在 6 码里（不分顺序）；组三 = 两位相同，组六 = 三位互不相同 */
    if (w.slice(0, 3).every((n) => inPool(grp, n))) {
      const uniq = new Set(w.slice(0, 3)).size;
      if (uniq === 2) return { claim: '推荐号组选命中（组三）', hot: 1 };
      if (uniq === 1) return null;
      return { claim: '推荐号组选命中（组六）', hot: 1 };
    }
    return null;
  }

  /* ---------- 排列5 ---------- */
  if (gid === 'pl5') {
    const w = area('main');
    if (w.length < 5) return null;
    const pools = ['wan', 'qian', 'bai', 'shi', 'ge'].map((k) => mqNums(v[k]));
    if (pools.some((p) => !p.length)) return null;
    const ok = pools.map((p, i) => inPool(p, w[i]));
    if (ok.every(Boolean)) return { claim: '推荐号直选命中！', hot: 2 };

    return null;
  }

  /* 大盘彩文案：「推荐号命中X等奖（主号 N 个 + 副号 N 个）」——
     用户 2026-10-18：几等奖要写清楚，中了几个号也要写清楚。 */
  const bigClaim = (lvl, a, an, b, bn) =>
    '推荐号命中' + lvl + '（' + an + ' ' + a + ' 个 + ' + bn + ' ' + b + ' 个）';

  /* ---------- 双色球：6+1，只播一等奖（红6+蓝1）/ 二等奖（红6+蓝0） ---------- */
  if (gid === 'ssq') {
    const red = area('red'), blue = area('blue');
    const pool = mqNums(v.r20), bp = mqNums(v.b_rec);
    /* __POOLALL__ 用户 2026-10-18：「所有号码全部放到一起」→ 命中数按各层并集算 */
    const poolAll = [...new Set(pool)];
    if (red.length < 6 || !blue.length || !pool.length || !bp.length) return null;
    const r = hits(red, poolAll), b = hits(blue, bp) > 0 ? 1 : 0;
    if (r === 6 && b === 1) return { claim: bigClaim('一等奖', r, '红球', b, '蓝球'), hot: 2 };
    if (r === 6 && b === 0) return { claim: bigClaim('二等奖', r, '红球', b, '蓝球'), hot: 1 };
    /* 三等奖：6 红中 5 + 蓝球中 1 */
    if (r === 5 && b === 1) return { claim: bigClaim('三等奖', r, '红球', b, '蓝球'), hot: 1 };
    /* __MQ3B__ 三等奖：6 红中 5 + 蓝球中 1 */
    if (r === 5 && b === 1) return { claim: bigClaim('三等奖', r, '红球', b, '蓝球'), hot: 1 };
    return null;
  }

  /* ---------- 大乐透：5+2，只播一等奖（前5+后2）/ 二等奖（前5+后1） ---------- */
  if (gid === 'dlt') {
    const front = area('front'), back = area('back');
    const pool = mqNums(v.f20), bp = mqNums(v.b_rec);
    /* __POOLALL__ 大乐透：f15/f10/f3/f1 一并参与命中计算 */
    const poolAllF = [...new Set(pool)];
    if (front.length < 5 || !back.length || !pool.length || !bp.length) return null;
    const r = hits(front, poolAllF), b = hits(back, bp);
    if (r === 5 && b === 2) return { claim: bigClaim('一等奖', r, '前区', b, '后区'), hot: 2 };
    if (r === 5 && b === 1) return { claim: bigClaim('二等奖', r, '前区', b, '后区'), hot: 1 };
    if (r === 4 && b === 2) return { claim: bigClaim('三等奖', r, '前区', b, '后区'), hot: 1 };
    /* 三等奖：前区全中 + 后区 0 个 */
    if (r === 5 && b === 0) return { claim: bigClaim('三等奖', r, '前区', b, '后区'), hot: 1 };
    /* __MQ3B__ 三等奖：前区全中 + 后区 0 个 */
    if (r === 5 && b === 0) return { claim: bigClaim('三等奖', r, '前区', b, '后区'), hot: 1 };
    return null;
  }

  /* ---------- 七乐彩：7 个基本号 + 特别号，只播一等奖（7 个）/ 二等奖（6 + 特别号） ---------- */
  if (gid === 'qlc') {
    const main = area('main'), sp = area('special');
    const pool = mqNums(v.r22);
    if (main.length < 7 || !pool.length) return null;
    const m = hits(main, pool);
    const s = (sp.length && inPool(pool, sp[0])) ? 1 : 0;
    if (m === 7) return { claim: bigClaim('一等奖', m, '基本号', s, '特别号'), hot: 2 };
    if (m === 6 && s === 1) return { claim: bigClaim('二等奖', m, '基本号', s, '特别号'), hot: 1 };
    if (m === 6 && s === 0) return { claim: '三等奖（号码池命中）', hot: 1 };
    return null;
  }

  /* ---------- 七星彩：6 位 + 后区，只播一等奖（6 位 + 后区）/ 二等奖（6 位、后区未中） ---------- */
  if (gid === 'qxc') {
    const front = area('front'), back = area('back');
    if (front.length < 6 || !back.length) return null;
    const pools = [1, 2, 3, 4, 5, 6].map((i) => mqNums(v['p' + i]));
    const bp = mqNums(v.pb);
    if (pools.some((p) => !p.length) || !bp.length) return null;
    const ok = pools.map((p, i) => inPool(p, front[i]));
    const m = ok.filter(Boolean).length;
    const b = inPool(bp, back[0]) ? 1 : 0;
    if (m === 6 && b === 1) return { claim: bigClaim('一等奖', m, '前六位', b, '后区'), hot: 2 };
    if (m === 6 && b === 0) return { claim: bigClaim('二等奖', m, '前六位', b, '后区'), hot: 1 };
    if (m === 5 && b === 1) return { claim: '三等奖（号码池命中）', hot: 1 };
    return null;
  }

  /* ---------- 快乐8：选十，播选十中十（一等奖）/ 选十中九（二等奖） ---------- */
  if (gid === 'kl8') {
    const main = area('main');
    const pool = [...new Set(mqNums(v.r30))];
    if (main.length !== 20 || new Set(main).size !== 20 || pool.length !== 30 || pool.some((n) => n < 1 || n > 80)) return null;
    const m = hits(pool, main);
    if (m >= 10) return { claim: '一等奖（号码池命中）', hot: 2 };
    if (m === 9) return { claim: '二等奖（号码池命中）', hot: 1 };
    if (m === 8) return { claim: '三等奖（号码池命中）', hot: 1 };
    return null;
  }

  return null;
}

/* 估算一段文字在 12px 下的宽度（用来定滚动速度；中文按 12.4px、数字字母按 6.8px） */
function mqEstWidth(s) {
  const t = String(s).replace(/<[^>]*>/g, '');
  let w = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    w += (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xff00 && c <= 0xffef) ? 12.4 : 6.8;
  }
  return w;
}

/* 播报窗口（用户 2026-10-18：「是不是通告一周的」→ 想看更长的）
   · 每个彩种最多比最近 MQ_MAX_PERIODS 期（存档里存了多少就比多少，不会硬凑）
   · 滚动条最多留最近 MQ_MAX_ITEMS 条，同一彩种最多 MQ_MAX_PER_GAME 条
     —— 不加单彩种上限的话，数字彩一多就把位置占满，大盘彩永远滚不出来 */
const MQ_MAX_PERIODS = 30;
const MQ_MAX_ITEMS = 10;
const MQ_MAX_PER_GAME = 3;

/* 生成通告条：{ html, count, compared } */
function buildHitMarquee() {
  const saved = mqReadGlobal('SAVED_TICKETS');
  const idx = mqDrawIndex();

  const wins = [];
  let compared = 0;

  MQ_ORDER.forEach((gid) => {
    /* 新的在前 → 只比最近 MQ_MAX_PERIODS 期（存档里就几期时等于全比） */
    const list = mqPeriods(gid, saved)
      .sort((a, b) => Number(b.issue) - Number(a.issue))
      .slice(0, MQ_MAX_PERIODS);
    list.forEach((p) => {
      const d = idx[gid + '|' + String(p.issue)];
      if (!d) return;                                   /* 还没开奖 → 不参与比对 */
      const judged = mqJudge(gid, p.images.main, d);
      compared++;
      if (!judged) return;
      const tier = mqClaimTier(judged.claim);
      if (tier.lv > 3) return;
      judged.claim = tier.label + '（号码池命中）';
      wins.push({
        gid, issue: String(p.issue),
        date: String(d.date || p.date || ''),
        claim: judged.claim, hot: judged.hot,
        /* __MARQUEE_WINS__ 把这一期的【号池】和【真实开奖】一起带上：
           后面搬进「中奖」卡时要画「推荐 vs 开奖」两行，不能只有一句话。 */
        v: p.images.main, d: d
      });
    });
  });

  /* 新的在前；同一天按期号大的在前 */
  wins.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return Number(b.issue) - Number(a.issue);
  });

  const head = '<span class="ro-mq-ico" aria-hidden="true">\u{1F4E2}</span>';

  /* 用户 2026-10-18：喇叭里【只有中奖播报】—— 把「近 N 期推荐 · 中奖 M 期」
     那条统计整条删掉，一条数字都不留。条数上限改由上面 3 个常量控制。 */
  const perGame = {};
  const recent = [];
  for (const w of wins) {
    if (recent.length >= MQ_MAX_ITEMS) break;
    const n = perGame[w.gid] || 0;
    if (n >= MQ_MAX_PER_GAME) continue;
    perGame[w.gid] = n + 1;
    recent.push(w);
  }

  /* 一期都没中时也不能空着 —— 只如实写一句，不带任何统计数字。
     ⚠️ 这句要能在 320px 的框里一行放下，多了会被省略号切掉。 */
  const ownerFrogAnnouncement = Date.now() < Date.parse('2026-11-01T00:00:00+08:00')
    ? '<span class="ro-mq-item mq-top"><b>青蛙 · 大乐透</b> 第 26121 期 · <i>5+1二等奖（站主报喜）</i></span>' : '';
  if (!recent.length && !ownerFrogAnnouncement) {
    return {
      count: 0, compared, wins: [],
      html: '<div class="ro-mq ro-mq-static" aria-label="开奖中奖播报">' + head +
        '<div class="ro-mq-view"><span class="ro-mq-none">暂无中奖播报</span></div></div>'
    };
  }

  const tickerClaim = (w) => {
    const tier=mqClaimTier(w.claim).label;
    if(['fc3d','pl3','pl5'].includes(w.gid))return tier.replace(/命中/g,'中');
    const parts=mqWinParts(w.gid,w.v,w.d);
    const counts=parts.draw.map((x)=>(x.hit||[]).filter(Boolean).length);
    return tier+' · 中'+counts.join('+')+(counts.length===1?'个号':'');
  };
  const one = (w) =>
    '<span class="ro-mq-item' + (w.hot >= 2 ? ' mq-top' : '') + '">' +
    '<b>' + (MQ_NAME[w.gid] || w.gid) + '</b> 第 ' + w.issue + ' 期 · <i>' + tickerClaim(w) + '</i></span>';

  const itemsHtml = ownerFrogAnnouncement + recent.map(one).join('');

  /* 一组 = 同样的条目排两遍（保证比可视宽度长），轨道放两组 → translateX(-50%) 无缝循环 */
  const groupHtml = '<div class="ro-mq-group">' + itemsHtml + itemsHtml + '</div>';
  const group2 = '<div class="ro-mq-group" aria-hidden="true">' + itemsHtml + itemsHtml + '</div>';
  const dur = Math.max(18, Math.min(72, Math.round((mqEstWidth(itemsHtml) * 2) / 46)));

  return {
    count: recent.length + (ownerFrogAnnouncement ? 1 : 0), compared, wins: recent,
    html: '<div class="ro-mq" aria-label="开奖中奖播报">' + head +
      '<div class="ro-mq-view"><div class="ro-mq-track" style="animation-duration:' + dur + 's">' +
      groupHtml + group2 +
      '</div></div></div>'
  };
}

/* ============================================================
   __MARQUEE_WINS__ 把小喇叭里【已经播报过】的中奖，补进「中奖」卡
   ------------------------------------------------------------
   用户 2026-10-20 原话：「先抓取我的小喇叭中奖内容 → 也要写进「中奖」卡的记录里，
                              一起公布」（点名了 10-19 快乐8 二等奖）
   ------------------------------------------------------------
   ⚠️【两种口径，别混】
     · 小喇叭   =【号池口径】：算的是「20 码池有没有包住开奖号」
     · 中奖卡   =【单式口径】：reco-archive.json 里真实存档的那一组号
   用户选择「那就放，但每条标注来源」→ 所以搬过来的每一条，
   奖项后面一律带【（号池）】三个字，一眼分得清单式还是号池。
   ------------------------------------------------------------
   ⚠️ 判定规则【一个字都不改】：lv / label 直接由 mqJudge() 已经算出来的
      claim 里取（一等奖 / 二等奖 / 组选六 …），不重算、不猜、不补、
      不把「号池包住」说成「单式中了」。
   ⚠️ 号池一律取【全部号码层的并集】（r20∪r15∪r10∪r3∪r1 / f20…f1），
      和小喇叭算命中时用的是同一份池子 —— 不然卡片里的高亮会和小喇叭对不上。
   ============================================================ */
const MQ_LV_WORDS = ['一等奖', '二等奖', '三等奖', '四等奖', '五等奖', '六等奖'];

/** 从喇叭那句话里取奖项名 + 档位（1 最高） */
function mqClaimTier(claim) {
  const s = String(claim || '');
  let label = '';
  for (const w of MQ_LV_WORDS) { if (s.indexOf(w) >= 0) { label = w; break; } }
  if (!label) {
    if (/(?:组选六|组六)/.test(s)) label = '组选六';
    else if (/(?:组选三|组三)/.test(s)) label = '组选三';
    else if (/组选/.test(s)) label = '组选';
    else if (/直选/.test(s)) label = '直选';
    else label = '命中';
  }
  const i = MQ_LV_WORDS.indexOf(label);
  const lv = i >= 0 ? i + 1
    : label === '组选三' ? 2
    : label === '组选六' || label === '组选' ? 3
    : 1;
  return { label: label, lv: lv };
}

/** 号池口径的「推荐 vs 开奖」两块（和卡片里单式那两行长得一样） */
function mqWinParts(gid, v, d) {
  const A = (d && d.areas) || {};
  const area = (k) => (A[k] || []).map(Number);
  const has = (arr, n) => Array.isArray(arr) && arr.indexOf(Number(n)) >= 0;
  const un = (...ks) => {
    const a = [];
    ks.forEach((k) => mqNums(v && v[k]).forEach((n) => a.push(n)));
    return [...new Set(a)].sort((x, y) => x - y);
  };
  const hitOf = (nums, pool) => nums.map((n) => pool.indexOf(Number(n)) >= 0);

  if (gid === 'ssq') {
    const pool = un('r20'), bp = mqNums(v && v.b_rec);
    const red = area('red'), blue = area('blue');
    return {
      rec: [{ label: '号池', nums: pool, pad: true },
            { label: '蓝球池', nums: bp, pad: true, br: true }],
      draw: [{ label: '红球', nums: red, pad: true, hit: hitOf(red, pool) },
             { label: '蓝球', nums: blue, pad: true, hit: hitOf(blue, bp), br: true }]
    };
  }
  if (gid === 'dlt') {
    const pool = un('f20'), bp = mqNums(v && v.b_rec);
    const front = area('front'), back = area('back');
    return {
      rec: [{ label: '号池', nums: pool, pad: true },
            { label: '后区池', nums: bp, pad: true, br: true }],
      draw: [{ label: '前区', nums: front, pad: true, hit: hitOf(front, pool) },
             { label: '后区', nums: back, pad: true, hit: hitOf(back, bp), br: true }]
    };
  }
  if (gid === 'qlc') {
    const pool = mqNums(v && v.r22);
    const main = area('main'), sp = area('special');
    return {
      rec: [{ label: '号池', nums: pool, pad: true }],
      draw: [{ label: '基本号', nums: main, pad: true, hit: hitOf(main, pool) },
             { label: '特别号', nums: sp, pad: true, hit: hitOf(sp, pool), br: true }]
    };
  }
  if (gid === 'kl8') {
    const pool = mqNums(v && v.r30);
    const main = area('main');
    return {
      rec: [{ label: '号码池', nums: pool, pad: true }],
      draw: [{ label: '', nums: main, pad: true, hit: hitOf(main, pool) }]
    };
  }
  if (gid === 'fc3d' || gid === 'pl3') {
    const bai = mqNums(v && v.bai), shi = mqNums(v && v.shi),
      ge = mqNums(v && v.ge), grp = mqNums(v && v.grp);
    const w = area('main');
    const rec = [{ label: '百位', nums: bai, pad: false },
                 { label: '十位', nums: shi, pad: false },
                 { label: '个位', nums: ge, pad: false }];
    if (grp.length) rec.push({ label: '组选', nums: grp, pad: false, br: true });
    return {
      rec: rec,
      draw: [{ label: '', nums: w.slice(0, 3), pad: false,
        hit: w.slice(0, 3).map((x, i) => (has([bai, shi, ge][i] || [], x) || has(grp, x))) }]
    };
  }
  if (gid === 'pl5') {
    const ks = ['wan', 'qian', 'bai', 'shi', 'ge'];
    const LAB = ['万位', '千位', '百位', '十位', '个位'];
    const pools = ks.map((k) => mqNums(v && v[k]));
    const w = area('main');
    return {
      rec: pools.map((p, i) => ({ label: LAB[i], nums: p, pad: false })),
      draw: [{ label: '', nums: w.slice(0, 5), pad: false,
        hit: w.slice(0, 5).map((x, i) => has(pools[i] || [], x)) }]
    };
  }
  if (gid === 'qxc') {
    const front = area('front'), back = area('back');
    const pools = [1, 2, 3, 4, 5, 6].map((i) => mqNums(v && v['p' + i]));
    const bp = mqNums(v && v.pb);
    const rec = pools.map((p, i) => ({ label: '第' + (i + 1) + '位', nums: p, pad: false }));
    rec.push({ label: '第7位', nums: bp, pad: false });
    return {
      rec: rec,
      draw: [{ label: '前六位', nums: front.slice(0, 6), pad: false,
        hit: front.slice(0, 6).map((x, i) => has(pools[i] || [], x)) },
        { label: '第7位', nums: back.slice(0, 1), pad: false,
          hit: back.slice(0, 1).map((x) => has(bp, x)) }]
    };
  }
  return { rec: [], draw: [] };
}

/** 把 buildHitMarquee() 的 wins 列表转成「中奖」卡的行 */
function buildMarqueeWinRows(list) {
  const rows = [];
  (list || []).forEach((w) => {
    if (!w || !w.gid || !w.issue) return;
    const date = String(w.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const tier = mqClaimTier(w.claim);
    const parts = mqWinParts(w.gid, w.v, w.d);
    if (!parts.rec.length || !parts.draw.length) return;   /* 画不出证据的，不上卡 */
    rows.push({
      date: date,
      gid: w.gid,
      name: MQ_NAME[w.gid] || w.gid,
      issue: String(w.issue),
      lv: tier.lv,
      label: tier.label + '（号码池命中）',
      note: '小喇叭播报 · ' + String(w.claim || '') + '（号池口径）',
      rec: parts.rec,
      draw: parts.draw,
      source: 'marquee'
    });
  });
  return rows;
}

const mqTicker = buildHitMarquee();
/* 这一班小喇叭正在播的中奖 → 转成卡片行（后面 recoArchiveCommit 会并进去） */
const MQ_WIN_ROWS = buildMarqueeWinRows(mqTicker.wins);
console.log('  · 中奖播报：比对 ' + mqTicker.compared + ' 期，滚 ' + mqTicker.count + ' 条中奖' +
  (mqTicker.count ? '' : '（只出「暂无中奖播报」那句）') +
  ' → 其中 ' + MQ_WIN_ROWS.length + ' 条并入「中奖」卡（号池口径，标「（号池）」）');

/* ============================================================
   __RO_HIST__ 「历史中奖」折叠卡（用户 2026-10-19 要求）
   ------------------------------------------------------------
   用户原话：「在GPT模型摇号下面增加一项;按钮 历史开奖：
             点开以后就是近365天内所有中奖播报.不管什么奖项1等奖2等奖3等奖都记录」
   第二轮澄清（用户）：「是我推荐中奖的哦」→
     每一条 = 某期某彩种 ·【我们推荐的号】+【那一期开奖号】+【几等奖】，
     没中的期次一条都不列（只列中奖的）。
   · 位置：紧跟「晒票 | GPT模型摇号」那一行，占【整行】全宽。
   · 那一期的推荐号从哪来（2026-10-20 用户否掉了「回算」）：
     ⚠️ 用户原话：「为什么还有九月份的？我都没推荐过」——
        九月那会儿这网页还不存在，按期号倒推出来的号【不是当时真发过的号】，
        用户一条都不认。所以现在【彻底停用回算】：
        只认 reco-archive.json 里【真实发过、写下来过】的推荐号。
        · 每期构建时：这一期还没存档 → 把本期推荐号原样写进去；
                      已有存档 → 一个字都不动（防止换期后号码变了）。
        · 存档从 HIST_ARCHIVE_START 那天开始，在那之前的期次【一条都不列】。
     __RECO_ARCHIVE__ 归档 + 比对 + 365 天剪枝全部在 recoArchiveCommit() 里，
       判定规则仍然只走 histJudgeRec()（一个字没改）。
   · 奖级（官方规则；只要沾上就记，不再只留前三档）：
       双色球   一 6+1 · 二 6+0 · 三 5+1 · 四 5+0 / 4+1 · 五 4+0 / 3+1 · 六 只中蓝
       大乐透   一 5+2 · 二 5+1 · 三 5+0 · 四 4+2 · 五 4+1 · 六 3+2 ·
                七 4+0 · 八 3+1 / 2+2 · 九 3+0 / 2+1 / 1+2 / 0+2
       七乐彩   一 7 个基本号 · 二 6+特别 · 三 6 · 四 5+特别 · 五 5 · 六 4+特别 · 七 4
       快乐8    选十 中 10 / 9 / 8 / 7 / 6 / 5 个
       3D·排列3  直选（三位定位全中）· 组选三 · 组选六
       排列5    五位直选全中
       七星彩   前六位 + 第7位 全中 · 前六位全中
   · 窗口：近 365 天；按开奖日期倒序（同一天期号大的在前）；最多 100 条。
   ⚠️ 卡片里不出现任何「数据从哪来」的字样（留痕断言会拦）。
   ============================================================ */
/* 窗口天数：默认近 365 天。HIST_DAYS 只是【自测用】的环境变量
   （HIST_DAYS=0 → 窗口里一条都不剩，用来验证「暂无中奖记录」的空状态）；
   日常构建不设它。超过这个天数的中奖记录会被【物理删除】。 */
const HIST_WINDOW_DAYS = (() => {
  const n = parseInt(String(process.env.HIST_DAYS || ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : 365;
})();
const HIST_MAX_ROWS = 100;
const HIST_DAY_MS = 24 * 3600 * 1000;
/* ⚠️ 2026-10-20 起这里【没有回算】了：不再需要「该期之前 30 期」这个门槛，
   HIST_MIN_PRIOR 和 histRecBlocks() 一起删掉（见下面 __RECO_ARCHIVE__）。 */
const HIST_TIER_CN = ['', '一等奖', '二等奖', '三等奖', '四等奖', '五等奖',
  '六等奖', '七等奖', '八等奖', '九等奖'];
/* __HIST_HIGH_ONLY__ 2026-10-20 用户要求：历史开奖【只记高等奖】
   用户原话：「历史开奖只记录我推荐中的记录 / 只需要记录一等奖和二等奖三等奖
             （双色球+大乐透+快乐8+七星彩+七乐彩）以及组六组三直选排五直选」
   ⚠️ 只过滤低等奖，【中奖判定规则一个字没改】（histJudgeRec 照旧算 lv，该中的还是中）。
   白名单：
     · 乐透型 双色球 / 大乐透 / 快乐8 / 七乐彩 → 只留 一 / 二 / 三等奖（lv 1~3）
               七星彩 → 它只有 1、2 等，天然落在 lv<=3 里
     · 数字彩 福彩3D / 排列3 → 直选(lv1) / 组选三(lv2) / 组选六(lv3)
               排列5        → 直选全中(lv1)
   删掉：双色球四~六等、大乐透四~九等、快乐8四~六等、七乐彩四~七等。 */
const HIST_KEEP_GIDS = ['ssq', 'dlt', 'kl8', 'qlc', 'qxc', 'fc3d', 'pl3', 'pl5'];
const HIST_KEEP_LV_MAX = 3;                                   /* 乐透型：一 / 二 / 三等奖 */
const HIST_DIGIT_KEEP = { fc3d: [1, 2, 3], pl3: [1, 2, 3], pl5: [1] };
/** 这一期这一档奖，进不进「历史开奖」列表 */
function histKeepTier(gid, lv) {
  const n = Number(lv) || 0;
  if (!n) return false;
  if (HIST_KEEP_GIDS.indexOf(gid) < 0) return false;
  const digit = HIST_DIGIT_KEEP[gid];
  if (digit) return digit.indexOf(n) >= 0;    /* 数字彩：直选 / 组选三 / 组选六 / 排五直选 */
  return n <= HIST_KEEP_LV_MAX;               /* 乐透型：一 / 二 / 三等奖 */
}

/** "2026-10-18" → 本地时间戳（手写解析，不吃 Date.parse 的时区差异） */
function histDayMs(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v == null ? '' : v));
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
}

/**
 * ⛔ 回算已经【整段删除】（2026-10-20 用户：「为什么还有九月份的？我都没推荐过」）。
 *    原来这里有 histRecBlocks(gid, issue, prior)：拿那一期的期号 + 该期之前的 30 期
 *    开奖，把「当时会推荐什么」倒推出来 —— 那 240 期（2026-08-06 ~ 2026-10-19）
 *    全是这么算出来的，用户一条都不认。
 *    现在推荐号只有一个来源：reco-archive.json（真实发过、写下来过的）。
 *    ⚠️ 【别再把它加回来】。回算 = 造假，用户明确否掉。
 */

/* ============================================================
   __RECO_ARCHIVE__ 真实推荐号存档 + 开奖比对 + 365 天剪枝
   ------------------------------------------------------------
   用户 2026-10-20 的四条硬要求：
     ③ 停用回算 → 只认真实存档过的推荐号（本文件 = reco-archive.json）
     ② 开奖后实时比对 → 存档号 vs 真实开奖号，中高等奖才记
     ④ 排序分类好 → 按彩种分组，组内按时间倒序
     ① 没中的直接不写 → 一条中奖记录都不留空位；整块没中只写一行
     ③ 365 天一循环 → 超过 365 天的中奖记录【物理删除】（文件里真的清掉）
   ------------------------------------------------------------
   存档结构（reco-archive.json）：
     {
       "version": 2,
       "start":   "2026-10-19",              ← 从哪天开始记（页面照这个写）
       "updated": "2026-10-20 02:10:00",
       "games": { "ssq": { "2026120": {
             "issue": "2026120", "name": "双色球",
             "savedAt": "2026-10-20 02:10:00",
             "blocks": [ { "label": "红球", "kind": "ball",
                           "color": "red", "nums": [3,8,15,22,27,31] }, … ] } }, … },
       "wins": [ { "date": "2026-10-22", "gid": "ssq", "name": "双色球",
                   "issue": "2026120", "lv": 1, "label": "一等奖",
                   "note": "红球中 6 个 · 蓝球中 1 个",
                   "rec": [ … ], "draw": [ … ] } ]     ← 只有中奖的，没中的不写
     }
   ⚠️ 存档时机 = export-static 每次构建（每班都跑）：
      · 这一期还没存档 → 把【页面正在显示的那一组号】原样写进去（REC_DATA，同一个对象）
      · 已有存档 → 一个字都不动（防止换期后号码变了）
      · 这一期已经开奖了才第一次建 → 【不补存】（开奖后存的号不算"发过的"）
   ⚠️ 开奖号没抓到（21:30 失败、21:45 也没抓到）→ 那期【挂起】，不写中奖记录；
      下次构建再比（archive 一直在，不会丢）。
   ⚠️ 云端那一班只是照着本机同步上去的存档重算；权威存档在本机根目录。
   ============================================================ */
const HIST_ARCHIVE_START = '2026-10-19';         /* 页面照这句写「自 … 起记录」 */
const HIST_ARCHIVE_FILE = path.join(ROOT, 'reco-archive.json');
/* 分组的固定顺序（用户点名的顺序）：双色球 / 大乐透 / 快乐8 / 七星彩 /
   七乐彩 / 福彩3D / 排列3 / 排列5。没有中奖的彩种【整组不出现】。 */
const HIST_GROUP_ORDER = ['ssq', 'dlt', 'kl8', 'qxc', 'qlc', 'fc3d', 'pl3', 'pl5'];

/** 本地时间 → "2026-10-20 02:10:00"（存档里所有时间戳都用它） */
function histStamp(ms) {
  const d = new Date(Number.isFinite(ms) ? ms : Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

/** 读存档（没有 / 读坏了都返回一份空壳，绝不让构建挂掉） */
function histArchiveRead() {
  const empty = { version: 2, start: HIST_ARCHIVE_START, updated: '', games: {}, wins: [] };
  if (!fs.existsSync(HIST_ARCHIVE_FILE)) return empty;
  try {
    const raw = JSON.parse(fs.readFileSync(HIST_ARCHIVE_FILE, 'utf8'));
    if (!raw || typeof raw !== 'object') return empty;
    return {
      version: 2,
      start: String(raw.start || HIST_ARCHIVE_START),
      updated: String(raw.updated || ''),
      games: (raw.games && typeof raw.games === 'object') ? raw.games : {},
      frogGames: (raw.frogGames && typeof raw.frogGames === 'object') ? raw.frogGames : {},
      footballPairs: Array.isArray(raw.footballPairs) ? raw.footballPairs : [],
      wins: Array.isArray(raw.wins) ? raw.wins : []
    };
  } catch (e) {
    console.log('  ⚠️ reco-archive.json 读不了（' + e.message + '）→ 这一班当作空存档继续，'
      + '不会覆盖坏文件以外的任何东西');
    return empty;
  }
}

/**
 * 存档 + 比对 + 剪枝 + 写回，一条龙。
 * 返回 { arch, wins, stats }：wins 就是页面要渲染的中奖记录（已剪枝、已排序）。
 */
function frogArchiveCommit(arch, current, idx, stamp, cutMs) {
  const records = arch.frogGames || (arch.frogGames = {});
  Object.entries(current || {}).forEach(([gid, r]) => {
    if (!r.issue || !r.blocks[0].nums.length || idx[gid+'|'+r.issue]) return;
    const bag = records[gid] || (records[gid] = {});
    if (!bag[r.issue]) bag[r.issue] = {...r, savedAt: stamp};
  });
  const wins = [];
  Object.entries(records).forEach(([gid, bag]) => Object.entries(bag).forEach(([issue, r]) => {
    if (histDayMs(r.savedAt) < cutMs) { delete bag[issue]; return; }
    const d = idx[gid+'|'+issue];
    if (!d || !d.areas || histDayMs(d.date) < cutMs || String(d.date).slice(0,10)<HIST_ARCHIVE_START) return;
    let j;
    if (gid === 'kl8') {
      const nums=r.blocks[0].nums, main=(d.areas.main||[]).map(Number), hit=main.map(n=>nums.includes(n)), count=hit.filter(Boolean).length;
      if(count<8)return;
      j={lv:3,label:'参考命中 '+count+' 个',note:'20个参考号码与开奖对照，不代表单注奖金',rec:[{label:'参考号码',nums,pad:true}],draw:[{label:'开奖',nums:main,pad:true,hit}]};
    } else {
      j=histJudgeRec(gid,r.blocks,d);
      if(!j || !histKeepTier(gid,j.lv))return;
      j={...j,label:j.label+'参考命中',note:j.note+' · 多号码参考对照，不代表已购票中奖'};
    }
    wins.push({...j,gid,issue,date:String(d.date).slice(0,10),name:MQ_NAME[gid]||gid,source:'frog'});
  }));
  return wins;
}

function recoArchiveCommit(recData) {
  const arch = histArchiveRead();
  const idx = mqDrawIndex();            /* 彩种|期号 → 那期真实开奖（DRAW_HISTORY + 最新一期） */
  const nowMs = Date.now();
  const stamp = histStamp(nowMs);
  const cutMs = nowMs - HIST_WINDOW_DAYS * HIST_DAY_MS;

  /* ---------- ① 存档：只存「还没开奖」的那一期；已有的一律不动 ---------- */
  let saved = 0, kept = 0, skippedDrawn = 0;
  if (REC_ISSUE_OVERRIDE) {
    /* 自测（REC_ISSUE=…）算出来的号不是真发出去的 → 绝不写进存档 */
    console.log('  · reco-archive：REC_ISSUE 自测模式，本班【不写存档】');
  } else {
    Object.keys(recData || {}).forEach((gid) => {
      const r = recData[gid];
      if (!r || !r.issue || !Array.isArray(r.blocks) || !r.blocks.length) return;
      const issue = String(r.issue);
      arch.games[gid] = (arch.games[gid] && typeof arch.games[gid] === 'object') ? arch.games[gid] : {};
      if (arch.games[gid][issue]) { kept++; return; }          /* 已有 → 绝不动 */
      if (idx[gid + '|' + issue]) { skippedDrawn++; return; }  /* 已开奖 → 不补存 */
      arch.games[gid][issue] = {
        issue: issue,
        name: String(r.name || gid),
        savedAt: stamp,
        blocks: r.blocks.map((b) => ({
          label: String(b.label || ''),
          kind: String(b.kind || 'ball'),
          color: String(b.color || ''),
          nums: (Array.isArray(b.nums) ? b.nums : []).map(Number)
        }))
      };
      saved++;
    });
  }

  /* ---------- ② 比对：存档号 vs 真实开奖 → 中了才写一条 ---------- */
  const wins = [];
  let compared = 0, pending = 0, lowDropped = 0, prunedGames = 0;
  Object.keys(arch.games).forEach((gid) => {
    const bag = arch.games[gid] || {};
    Object.keys(bag).forEach((issue) => {
      const rec = bag[issue];
      if (!rec || !Array.isArray(rec.blocks) || !rec.blocks.length) { delete bag[issue]; return; }
      /* 365 天剪枝（推荐存档）：存进来超过 365 天的期次物理删掉，文件不会无限变大 */
      const savedMs = histDayMs(String(rec.savedAt || '').slice(0, 10));
      if (Number.isFinite(savedMs) && savedMs < cutMs) { delete bag[issue]; prunedGames++; return; }
      const d = idx[gid + '|' + String(issue)];
      if (!d || !d.areas) { pending++; return; }               /* 开奖没抓到 → 挂起，下次再比 */
      /* ⚠️【硬闸】存档起点（HIST_ARCHIVE_START）之前的期次一条都不列 ——
         不管存档里是怎么来的（老数据 / 手工塞的），都漏不回页面。 */
      const dDate = String(d.date || '').slice(0, 10);
      if (!dDate || dDate < HIST_ARCHIVE_START) return;
      const t = histDayMs(d.date);
      if (!Number.isFinite(t) || t < cutMs) return;            /* 开奖已超 365 天 → 不再比 */
      compared++;
      const j = histJudgeRec(gid, rec.blocks, d);              /* ← 判定规则一个字没改 */
      if (!j) return;                                          /* 没中 → 【什么都不写】 */
      if (!histKeepTier(gid, j.lv)) { lowDropped++; return; }   /* 低等奖 → 也不写 */
      wins.push({
        date: String(d.date).slice(0, 10),
        gid: gid,
        name: MQ_NAME[gid] || gid,
        issue: String(issue),
        lv: j.lv,
        label: j.label,
        note: j.note,
        rec: j.rec,
        draw: j.draw
      });
    });
  });

  /* ---------- ②½ 小喇叭（号池口径）里已经播报过的中奖 → 并进「中奖」卡 ----------
     用户 2026-10-20：「先抓取我的小喇叭中奖内容 → 也要写进「中奖」卡的记录里」
     规则：
       · 同一彩种同一期【只记一次】（单式优先：存档里已经算出来的那条留着，
         喇叭那条就不重复写 —— 免得一张卡里同一期出现两遍）
       · 起点（HIST_ARCHIVE_START）【不卡】喇叭记录：用户点名要的是「喇叭里已经
         播报过的」，那些期次比存档起点早（10-15 ~ 10-18），一样要公布；
         卡片的「自 … 起记录」会跟着放宽到最早那一条的日期。
       · 365 天窗口【照旧】——超过一年的喇叭记录一样物理删。
       · 上一班已经写进存档的喇叭记录【留着】：喇叭只滚最近几期，
         不留就会「一换期，卡片里的旧中奖跟着消失」。 */
  const prevMarquee = (Array.isArray(arch.wins) ? arch.wins : [])
    .filter((w) => w && w.source === 'marquee');
  const seenWin = new Set(wins.map((w) => String(w.gid) + '|' + String(w.issue)));
  let mqAdded = 0, mqKept = 0;
  const mergeMarquee = (list, fromFile) => {
    (list || []).forEach((r) => {
      if (!r || !r.gid || !r.issue) return;
      const key = String(r.gid) + '|' + String(r.issue);
      if (seenWin.has(key)) return;                    /* 同期只记一次 */
      const t = histDayMs(r.date);
      if (!Number.isFinite(t) || t < cutMs) return;     /* 超 365 天 → 不要 */
      seenWin.add(key);
      wins.push(r);
      if (fromFile) mqKept++; else mqAdded++;
    });
  };
  mergeMarquee(prevMarquee, true);   /* 存档里已有的（上一班写的） */
  mergeMarquee(MQ_WIN_ROWS, false);  /* 这一班小喇叭正在播的 */

  wins.push(...frogArchiveCommit(arch, FROG_CURRENT_DATA, idx, stamp, cutMs));
  // Site owner explicitly reported this result; no original picks are available.
  wins.push({gid:'dlt',issue:'26121',date:'2026-10-24',name:MQ_NAME.dlt||'大乐透',lv:0,
    label:'青蛙 · 5+1二等奖（站主报喜）',source:'owner-report',rec:[],
    draw: ['front','back'].map((key,i)=>({label:i?'后区':'前区',nums:((idx['dlt|26121']||{}).areas||{})[key]||[],pad:true,br:!!i,hit:((((idx['dlt|26121']||{}).areas||{})[key])||[]).map(n=>i?Number(n)===1:true)})),
    note:'站主确认报喜；后区命中01，08未中。'});
  [{gid:'qlc',issue:'2026122',label:'二等奖',keys:['main','special'],names:['基本号','特别号']},
   {gid:'pl3',issue:'26282',label:'中奖',keys:['main'],names:['开奖号码']}].forEach(report=>{
    const actual=idx[report.gid+'|'+report.issue];
    wins.push({gid:report.gid,issue:report.issue,date:'2026-10-23',name:MQ_NAME[report.gid]||report.gid,lv:0,
      label:report.label+'（站主报喜）',source:'owner-report',rec:[],
      draw:report.keys.map((key,i)=>({label:report.names[i],nums:((actual||{}).areas||{})[key]||[],pad:report.gid==='qlc',br:!!i})),
      note:'站主报喜；站主反馈系统bug，历史资料暂无法恢复。'});
  });



  /* ---------- ③ 365 天剪枝：中奖记录超过 365 天【物理删除】 ---------- */
  let prunedWins = 0;
  const keptWins = wins.filter((w) => {
    const t = histDayMs(w.date);
    if (Number.isFinite(t) && t >= cutMs) return true;
    prunedWins++;
    return false;
  });
  /* 新的在前；同一天期号大的在前；再按彩种固定顺序 */
  keptWins.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.issue !== b.issue) return Number(b.issue) - Number(a.issue);
    return HIST_GROUP_ORDER.indexOf(a.gid) - HIST_GROUP_ORDER.indexOf(b.gid);
  });

  /* ---------- ④ 写回（写失败也不影响页面生成） ---------- */
  arch.version = 2;
  arch.start = HIST_ARCHIVE_START;
  arch.updated = stamp;
  arch.wins = keptWins;
  try {
    const tmp = HIST_ARCHIVE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(arch), 'utf8');
    fs.renameSync(tmp, HIST_ARCHIVE_FILE);
  } catch (e) {
    console.log('  ⚠️ reco-archive.json 写不进去：' + e.message + '（本班页面照常生成）');
  }

  let totalIssues = 0;
  Object.keys(arch.games).forEach((g) => { totalIssues += Object.keys(arch.games[g] || {}).length; });

  const stats = {
    saved: saved, kept: kept, skippedDrawn: skippedDrawn,
    compared: compared, pending: pending, lowDropped: lowDropped,
    prunedGames: prunedGames, prunedWins: prunedWins,
    mqRows: mqAdded + mqKept, mqAdded: mqAdded, mqKept: mqKept,
    totalIssues: totalIssues, wins: keptWins.length,
    file: HIST_ARCHIVE_FILE
  };
  return { arch: arch, wins: keptWins, stats: stats };
}

const FROG_PANEL_HTML = frogPanelHtml();
const RECO = recoArchiveCommit(REC_DATA);
console.log('  · reco-archive（真实推荐号存档）：新存 ' + RECO.stats.saved + ' 期 · 已有 ' +
  RECO.stats.kept + ' 期不动' + (RECO.stats.skippedDrawn ? ' · 已开奖不补存 ' + RECO.stats.skippedDrawn + ' 期' : '') +
  ' → 存档共 ' + RECO.stats.totalIssues + ' 期 · 比对 ' + RECO.stats.compared + ' 期（开奖未到挂起 ' +
  RECO.stats.pending + ' 期）→ 中奖记录 ' + RECO.stats.wins + ' 条' +
  (RECO.stats.lowDropped ? '（低等奖不列 ' + RECO.stats.lowDropped + ' 条）' : '') +
  (RECO.stats.mqRows
    ? '（其中小喇叭号池口径 ' + RECO.stats.mqRows + ' 条：本班补 ' + RECO.stats.mqAdded +
      ' 条 / 存档已有 ' + RECO.stats.mqKept + ' 条）'
    : '') +
  (RECO.stats.prunedGames || RECO.stats.prunedWins
    ? '（365 天剪枝：推荐 ' + RECO.stats.prunedGames + ' 期 / 中奖 ' + RECO.stats.prunedWins + ' 条已物理删除）'
    : ''));

/**
 * 判定：推荐号 vs 那一期开奖 → 中了返回
 *   { lv, label, note, rec:[{label,nums,pad}], draw:[{label,nums,pad,hit:[bool]}] }
 * 没中 / 算不出来 → null（不列）
 * lv：1 = 最高档（一等奖 / 直选），1~3 上色，其余灰。
 */
function histJudgeRec(gid, blocks, d) {
  if (!blocks || !blocks.length || !d || !d.areas) return null;
  const area = (k) => (d.areas[k] || []).map(Number);
  const has = (arr, n) => arr.indexOf(Number(n)) >= 0;
  const numsOf = (i) => ((blocks[i] && Array.isArray(blocks[i].nums)) ? blocks[i].nums : []);
  const nameOf = (i, fb) => ((blocks[i] && blocks[i].label) ? String(blocks[i].label) : fb);

  /* ---------- 双色球（6+1，一~六等奖） ---------- */
  if (gid === 'ssq') {
    const recRed = numsOf(0), recBlue = numsOf(1);
    const red = area('red'), blue = area('blue');
    if (recRed.length < 6 || !recBlue.length || red.length < 6 || !blue.length) return null;
    const r = red.filter((n) => has(recRed, n)).length;
    const b = blue.some((n) => has(recBlue, n)) ? 1 : 0;
    let lv = 0;
    if (r === 6 && b === 1) lv = 1;
    else if (r === 6) lv = 2;
    else if (r === 5 && b === 1) lv = 3;
    else if (r === 5 || (r === 4 && b === 1)) lv = 4;
    else if (r === 4 || (r === 3 && b === 1)) lv = 5;
    else if (b === 1) lv = 6;
    if (!lv) return null;
    return {
      lv: lv, label: HIST_TIER_CN[lv],
      note: '红球中 ' + r + ' 个 · 蓝球中 ' + b + ' 个',
      rec: [{ label: nameOf(0, '红球'), nums: recRed, pad: true },
            { label: nameOf(1, '蓝球'), nums: recBlue, pad: true }],
      draw: [{ label: nameOf(0, '红球'), nums: red, pad: true, hit: red.map((n) => has(recRed, n)) },
             { label: nameOf(1, '蓝球'), nums: blue, pad: true, hit: blue.map((n) => has(recBlue, n)) }]
    };
  }

  /* ---------- 大乐透（5+2，一~九等奖） ---------- */
  if (gid === 'dlt') {
    const recF = numsOf(0), recB = numsOf(1);
    const front = area('front'), back = area('back');
    if (recF.length < 5 || !recB.length || front.length < 5 || back.length < 2) return null;
    const f = front.filter((n) => has(recF, n)).length;
    const b = back.filter((n) => has(recB, n)).length;
    let lv = 0;
    if (f === 5 && b === 2) lv = 1;
    else if (f === 5 && b === 1) lv = 2;
    else if (f === 5) lv = 3;
    else if (f === 4 && b === 2) lv = 4;
    else if (f === 4 && b === 1) lv = 5;
    else if (f === 3 && b === 2) lv = 6;
    else if (f === 4) lv = 7;
    else if ((f === 3 && b === 1) || (f === 2 && b === 2)) lv = 8;
    else if (f === 3 || (f === 2 && b === 1) || (f === 1 && b === 2) || (f === 0 && b === 2)) lv = 9;
    if (!lv) return null;
    return {
      lv: lv, label: HIST_TIER_CN[lv],
      note: '前区中 ' + f + ' 个 · 后区中 ' + b + ' 个',
      rec: [{ label: nameOf(0, '前区'), nums: recF, pad: true },
            { label: nameOf(1, '后区'), nums: recB, pad: true }],
      draw: [{ label: nameOf(0, '前区'), nums: front, pad: true, hit: front.map((n) => has(recF, n)) },
             { label: nameOf(1, '后区'), nums: back, pad: true, hit: back.map((n) => has(recB, n)) }]
    };
  }

  /* ---------- 七乐彩（7 + 特别号，一~七等奖） ---------- */
  if (gid === 'qlc') {
    const recMain = numsOf(0), recSp = numsOf(1);
    const main = area('main'), sp = area('special');
    if (recMain.length < 7 || !recSp.length || main.length < 7) return null;
    const m = main.filter((n) => has(recMain, n)).length;
    const s = sp.some((n) => has(recSp, n)) ? 1 : 0;
    let lv = 0;
    if (m === 7) lv = 1;
    else if (m === 6 && s === 1) lv = 2;
    else if (m === 6) lv = 3;
    else if (m === 5 && s === 1) lv = 4;
    else if (m === 5) lv = 5;
    else if (m === 4 && s === 1) lv = 6;
    else if (m === 4) lv = 7;
    if (!lv) return null;
    return {
      lv: lv, label: HIST_TIER_CN[lv],
      note: '基本号中 ' + m + ' 个 · 特别号中 ' + s + ' 个',
      rec: [{ label: nameOf(0, '基本号'), nums: recMain, pad: true },
            { label: nameOf(1, '特别号'), nums: recSp, pad: true }],
      draw: [{ label: nameOf(0, '基本号'), nums: main, pad: true, hit: main.map((n) => has(recMain, n)) },
             { label: nameOf(1, '特别号'), nums: sp, pad: true, hit: sp.map((n) => has(recSp, n)) }]
    };
  }

  /* ---------- 快乐8（选十：中 10/9/8/7/6/5 个） ---------- */
  if (gid === 'kl8') {
    const recNums = numsOf(0);
    const main = area('main');
    if (recNums.length !== 10 || main.length < 20) return null;
    const n = main.filter((x) => has(recNums, x)).length;
    const LAB = { 10: 1, 9: 2, 8: 3, 7: 4, 6: 5, 5: 6 };
    if (!LAB[n]) return null;
    return {
      lv: LAB[n], label: HIST_TIER_CN[LAB[n]],
      note: '选十 · 中 ' + n + ' 个',
      rec: [{ label: '选十', nums: recNums, pad: true }],
      draw: [{ label: '', nums: main, pad: true, hit: main.map((x) => has(recNums, x)) }]
    };
  }

  /* ---------- 福彩3D / 排列3（直选 / 组选三 / 组选六） ---------- */
  if (gid === 'fc3d' || gid === 'pl3') {
    const w = area('main');
    if (w.length < 3) return null;
    const p0 = numsOf(0), p1 = numsOf(1), p2 = numsOf(2), grp = numsOf(3);
    if (!p0.length || !p1.length || !p2.length) return null;
    const dir = has(p0, w[0]) && has(p1, w[1]) && has(p2, w[2]);
    let lv = 0, label = '', note = '';
    if (dir) {
      lv = 1; label = '直选'; note = '三位定位全中（顺序对）';
    } else if (grp.length && w.slice(0, 3).every((x) => has(grp, x))) {
      const uniq = new Set(w.slice(0, 3)).size;
      /* ⚠️ 豹子（三位相同）【不中组选】：官方规则里组选三 / 组选六 都不含豹子，
         豹子只有直选才中 —— 所以这里不算中奖，直接不列（宁可少一条，不虚报）。 */
      if (uniq === 3) { lv = 3; label = '组选六'; note = '三位都在组选六码里（组六）'; }
      else if (uniq === 2) { lv = 2; label = '组选三'; note = '三位都在组选六码里（组三）'; }
    }
    if (!lv) return null;
    const rec = [
      { label: nameOf(0, '百位'), nums: p0, pad: false },
      { label: nameOf(1, '十位'), nums: p1, pad: false },
      { label: nameOf(2, '个位'), nums: p2, pad: false }
    ];
    if (grp.length) rec.push({ label: nameOf(3, '组选'), nums: grp, pad: false, br: true });
    return {
      lv: lv, label: label, note: note, rec: rec,
      draw: [{ label: '', nums: w.slice(0, 3), pad: false,
        hit: w.slice(0, 3).map((x, i) => has([p0, p1, p2][i] || [], x) || has(grp, x)) }]
    };
  }

  /* ---------- 排列5（五位直选全中） ---------- */
  if (gid === 'pl5') {
    const w = area('main');
    if (w.length < 5) return null;
    const pools = [0, 1, 2, 3, 4].map((i) => numsOf(i));
    if (pools.some((p) => !p.length)) return null;
    if (!pools.every((p, i) => has(p, w[i]))) return null;
    return {
      lv: 1, label: '直选全中', note: '五位定位全中（顺序对）',
      rec: pools.map((p, i) => ({ label: nameOf(i, '第' + (i + 1) + '位'), nums: p, pad: false })),
      draw: [{ label: '', nums: w.slice(0, 5), pad: false,
        hit: w.slice(0, 5).map((x, i) => has(pools[i], x)) }]
    };
  }

  /* ---------- 七星彩（六位 + 第7位） ---------- */
  if (gid === 'qxc') {
    const pool = [0, 1, 2, 3, 4, 5].map((i) => numsOf(i));
    const poolB = numsOf(6);
    const front = area('front'), back = area('back');
    if (pool.some((p) => !p.length) || !poolB.length || front.length < 6 || !back.length) return null;
    const m = pool.filter((p, i) => has(p, front[i])).length;
    const b = has(poolB, back[0]) ? 1 : 0;
    if (!(m === 6 && b === 1) && !(m === 6 && b === 0)) return null;
    const lv = (m === 6 && b === 1) ? 1 : 2;
    const rec = pool.map((p, i) => ({ label: nameOf(i, '第' + (i + 1) + '位'), nums: p, pad: false }));
    rec.push({ label: nameOf(6, '第7位'), nums: poolB, pad: false });
    return {
      lv: lv, label: HIST_TIER_CN[lv],
      note: '前六位中 ' + m + ' 个 · 第7位中 ' + b + ' 个',
      rec: rec,
      draw: [{ label: '前六位', nums: front.slice(0, 6), pad: false,
        hit: front.slice(0, 6).map((x, i) => has(pool[i] || [], x)) },
        { label: '第7位', nums: back.slice(0, 1), pad: false,
          hit: back.slice(0, 1).map((x) => has(poolB, x)) }]
    };
  }

  return null;
}

/** 生成「历史中奖」卡展开后的内容（纯 HTML：无图片、无按钮、无脚本） */
/* __RO_HIST__ 【默认展开】用户 2026-10-20 反馈「我的历史中奖栏呢 / 位置找不到」。
   headless 实测（375 视口）：收起时这张卡只有 103px 高，按 top 在页面 17 个
   details 里排第 5（y=1373，紧跟 GPT模型摇号 y=1205 之后、最新开奖 y=1488 之前），
   和上面几条细条长得一模一样 → 用户「看着像没有」。
   处理：模板里给这个 <details> 加 open（展开后 20 条一屏可见）；插入位置一律不动。 */
function buildHistoryHtml() {
  const nowMs = Date.now();
  /* __RECO_ARCHIVE__ 页面只认 recoArchiveCommit() 算出来的中奖记录：
     · 没有「按期号倒推」这一步（回算已整段删除）；
     · 没中的期次一条都不写（连空行都不留）；
     · 没有中奖的彩种【整组不出现】（用户：「不要按彩种分组时显示空组」）。 */
  const wins = (RECO.wins || []).slice();

  /* __MARQUEE_WINS__ 起点跟着【实际列出来的最早一条】走：
     小喇叭里 10-15 ~ 10-18 那几条已经播报过的中奖，用户点名要一起公布 ——
     卡头如果还写「自 2026-10-19 起」，就和下面列着 10-15 的记录自相矛盾。
     所以取 min(存档起点, 最早一条中奖日期)。一条都没有时仍然是存档起点。 */
  let fromDate = HIST_ARCHIVE_START;
  wins.forEach((w) => {
    const d = String(w.date || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < fromDate) fromDate = d;
  });

  const info = {
    count: wins.length,
    /* __MARQUEE_WINS__ 「已比对 N 期」= 存档比对 + 小喇叭比对：
       卡片里的记录现在两个来源都算，只写存档那 0 期会和「中奖 5 注」自相矛盾。 */
    compared: RECO.stats.compared + (mqTicker.compared || 0),
    lowDropped: RECO.stats.lowDropped,
    archived: RECO.stats.totalIssues,
    from: fromDate,
    to: wins.length ? wins[0].date : ''
  };

  /* 自测用：HIST_DUMP=1 → 把中奖记录逐条打出来（日常构建不设，一个字都不多打） */
  if (String(process.env.HIST_DUMP || '')) {
    console.log('      【中奖记录 · ' + wins.length + ' 条】');
    wins.forEach((r, i) => console.log('      ' + (i + 1) + '. ' + r.date + ' ' + r.name +
      ' 第' + r.issue + '期 ' + r.label + ' · ' + r.note));
  }

  /* 一条都没有 → 只写一行（用户：「不然用户以为坏了」）*/
  if (!wins.length) {
    return {
      html: `<div class="ro-hist-empty">近 365 天暂无中奖记录（自 ${escape(HIST_ARCHIVE_START)} 起记录 · 中奖才公布）</div>`,
      info: info
    };
  }

  const two = (n) => (n < 10 ? '0' + n : String(n));
  /* 一等金 / 二等橙 / 三等蓝 只给乐透型；
     数字彩（福彩3D / 排列3 / 排列5 的直选·组选）一律中性色（用户 2026-10-20 要求）。 */
  const tint = (lv, gid) => (gid === 'fc3d' || gid === 'pl3' || gid === 'pl5')
    ? ''
    : (lv === 1 ? ' ro-hist-t1' : lv === 2 ? ' ro-hist-t2' : lv === 3 ? ' ro-hist-t3' : '');
  const partsHtml = (parts) => parts.map((p) =>
    `<span class="ro-hist-p${p.br ? ' is-br' : ''}">` +
    (p.label ? `<i>${escape(p.label)}</i>` : '') +
    p.nums.map((n, k) =>
      `<b class="ro-hist-n${(p.hit && p.hit[k]) ? ' ro-hist-hit' : ''}">${escape(p.pad ? two(n) : String(n))}</b>`
    ).join('') + `</span>`
  ).join('');

  /* 【中奖宣布】用户 2026-10-20：「抓取我最近几天推荐中奖的号码宣布」——
     最近 7 天中奖的期次单独排一块放最上面；号码仍然用 partsHtml()，命中号高亮。 */
  const ANN_DAYS = 7;
  const annRows = wins.filter((r) => {
    const tt = histDayMs(r.date);
    return Number.isFinite(tt) && (nowMs - tt) <= ANN_DAYS * HIST_DAY_MS;
  });
  const annNumsHtml = (r) => {
    if (r.source === 'marquee' || r.source === 'owner-report') return ''; 
    const hitsOf = (parts) => {
      const out = [];
      (parts || []).forEach((p) => {
        (p.nums || []).forEach((n, k) => { if (p.hit && p.hit[k]) out.push({ n: n, pad: p.pad }); });
      });
      return out;
    };
    /* 乐透型：推荐号里有 hit 标记 → 那就是"中的那几个"；
       数字彩（3D/排三/排五）：推荐是池子（定位/组选），没有 hit 标记 →
       直接写开奖号（组选/直选命中的就是它本身）。 */
    let list = hitsOf(r.rec);
    if (!list.length) list = hitsOf(r.draw);
    if (!list.length) {
      (r.rec || []).forEach((p) => (p.nums || []).forEach((n) => list.push({ n: n, pad: p.pad })));
    }
    return list.map((x) => '<b class="ro-hist-n">' +
      escape(x.pad ? two(x.n) : String(x.n)) + '</b>').join('');
  };
  const annHtml = annRows.length
    ? '<div class="ro-hist-ann">' +
        '<div class="ro-hist-ann-h">最近 ' + ANN_DAYS + ' 天中奖宣布 · ' + annRows.length + ' 注</div>' +
        annRows.map((r) =>
          '<div class="ro-hist-ann-row">' +
            '<span class="ro-hist-ann-d">' + escape(String(r.date).slice(5)) + '</span>' +
            '<span class="ro-hist-ann-g">' + escape(r.name) + '</span>' +
            '<span class="ro-hist-ann-i">第' + escape(r.issue) + '期</span>' +
            '<span class="ro-hist-ann-t">' + escape((r.source === 'frog' ? '青蛙 · ' : '') + r.label) + '</span>' +
            '<span class="ro-hist-ann-n">' + annNumsHtml(r) + '</span>' +
          '</div>').join('') +
      '</div>'
    : '';

  /* ---------- 按彩种分组：只出【中过奖】的组，组内按时间倒序 ---------- */
  const total = wins.length;
  const groups = [];
  HIST_GROUP_ORDER.forEach((gid) => {
    const mine = wins.filter((w) => w.gid === gid);
    if (!mine.length) return;                      /* 没中 → 整组不出现 */
    mine.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return Number(b.issue) - Number(a.issue);
    });
    groups.push({ gid: gid, name: mine[0].name, rows: mine });
  });

  /* 组与组之间：最近中过奖的彩种排前面（组内已经倒序；组头那一期就是它的最新一条） */
  groups.sort((a, b) => {
    const da = a.rows[0].date, db = b.rows[0].date;
    if (da !== db) return da < db ? 1 : -1;
    return HIST_GROUP_ORDER.indexOf(a.gid) - HIST_GROUP_ORDER.indexOf(b.gid);
  });

  let left = HIST_MAX_ROWS;
  const groupHtml = groups.map((g) => {
    const list = g.rows.slice(0, Math.max(0, left));
    left -= list.length;
    if (!list.length) return '';
    /* 一条 = 日期 · 期号 · 奖项（一行）；下面两行小字是【推荐 vs 开奖】的对照证据 */
    const rowsHtml = list.map((r) =>
      `<div class="ro-hist-row">` +
      `<div class="ro-hist-top">` +
      `<span class="ro-hist-date">${escape(r.date)}</span>` +
      `<span class="ro-hist-issue">第${escape(r.issue)}期</span>` +
      `<span class="ro-hist-tier${tint(r.lv, r.gid)}">${escape((r.source === 'frog' ? '青蛙 · ' : '') + r.label)}</span>` +
      `</div>` +
      (r.source === 'marquee' || r.source === 'owner-report' ? '' : `<div class="ro-hist-line"><span class="ro-hist-tag">推荐</span>${partsHtml(r.rec)}</div>`) +
      (r.source === 'marquee' ? `<div class="ro-hist-line"><span class="ro-hist-tag is-draw">命中号码</span>${partsHtml((r.draw||[]).map((p)=>({...p,nums:(p.nums||[]).filter((n,i)=>p.hit&&p.hit[i]),hit:(p.hit||[]).filter(Boolean)})).filter((p)=>p.nums.length))}</div>` : `<div class="ro-hist-line"><span class="ro-hist-tag is-draw">开奖</span>${partsHtml(r.draw)}</div>`) +
      `<div class="ro-hist-note">${escape(r.note)}</div>` +
      `</div>`
    ).join('');
    return `<details class="ro-hist-grp">` +
      `<summary class="ro-hist-grp-h">` +
      `<span class="ro-hist-grp-g">${escape(g.name)}</span>` +
      `<span class="ro-hist-grp-c">中 ${g.rows.length} 注</span>` +
      `</summary>` + rowsHtml + `</details>`;
  }).join('');

  const meta = `自 ${info.from} 起记录 · 中奖才公布 · 已比对 ${info.compared} 期 · 中奖 ${total} 注`;
  const foot = total > HIST_MAX_ROWS
    ? `共 ${total} 注 · 只列最近 ${HIST_MAX_ROWS} 注`
    : `只记一/二/三等奖 + 组选直选；没中的期次不写，超过 365 天自动删除`;

  return {
    html: annHtml +
      `<div class="ro-hist-meta">${escape(meta)}</div>` +
      `<div class="ro-hist-list">${groupHtml}</div>` +
      `<div class="ro-hist-foot">${escape(foot)}</div>`,
    info: info
  };
}

const histBuilt = buildHistoryHtml();
const histHtml = histBuilt.html;
/* __MARQUEE_WINS__ 卡片副标题「自 … 起」必须跟【实际列出来的最早一条】一致：
   小喇叭里 10-15 ~ 10-18 那 5 条也要公布，标题却写「自 2026-10-19 起」会自相矛盾。
   一条中奖都没有时，from 仍然是存档起点（页面文案与以前完全一致）。 */
const HIST_FROM_TXT = String(histBuilt.info.from || HIST_ARCHIVE_START);
console.log('  · 历史开奖卡（只认真实存档）：已比对 ' + histBuilt.info.compared + ' 期，中奖 ' +
  histBuilt.info.count + ' 条' + (histBuilt.info.lowDropped ? `（低等奖不列 ${histBuilt.info.lowDropped} 条）` : '') +
  '（自 ' + histBuilt.info.from + ' 起记录' + (histBuilt.info.to ? '，最近一条 ' + histBuilt.info.to : '') + '）');


/* __ST_TZ__ 资料更新状态按【浏览器本地时间】分两档（用户 2026-10-19）：
   02:00 <= 当前 < 21:00 → 资料已更新（绿）
   21:00 <= 当前 < 次日 02:00 → 资料未更新（黄），提示等凌晨 2 点
   纯前端判断（打开页面算一次，之后每 60 秒算一次）：不请求后端、不写 localStorage、不加 button。
   ⚠️ 两种卡片都挂这段脚本：
      · data-st="ok"（构建时数据齐全）→ 按时间切「已更新 / 未更新」两档；
      · data-st="warn"（构建时就缺数据）→ 标题和颜色不动，只在 21:00~02:00 显示第二行提示。 */
const STATUS_TZ_JS = `<script>
(function () {
  var card = document.getElementById('roStatusCard');
  if (!card) return;
  var title = document.getElementById('roStTitle');
  var sub = document.getElementById('roStSub');
  var isOk = card.getAttribute('data-st') !== 'warn';
  function tick() {
    var h = new Date().getHours();
    var fresh = h >= 2 && h < 21;
    if (isOk) {
      card.className = 'ro-status ' + (fresh ? 'ok' : 'warn') + ' ro-st-row';
      if (title) title.textContent = fresh ? '资料已更新' : '资料未更新';
    }
    if (sub) sub.style.display = fresh ? 'none' : '';
  }
  tick();
  setInterval(tick, 60000);
})();
</script>`;
if (status.allReady) {
  /* __NO_ST_LIST__ 用户要求：状态条里那 8 行「双色球 第 xx 期 日期」不要了。
     连带把只为它服务的 rows 计算也删掉（省得白算一遍）。 */

  statusHtml =
    `<div class="ro-status ok ro-st-row" id="roStatusCard">` +
    `<div class="ro-st-txt">` +
    `<div class="ro-st-head"><span class="ro-st-dot"></span><span id="roStTitle">资料已更新</span></div>` +   /* 用户要求：更新后只写「已更新」，不写时间 */
    /* __ST_TZ__ 第二行：21:00~次日 02:00 显示（前端按本地时间切） */
    `<div class="ro-st-time ro-st-sub" id="roStSub" style="display:none">号码待凌晨 2 点计算后更新</div>` +
    `<div class="ro-st-time">所有资料均在下方<i class="ro-st-slide">请滑到底 ↓</i></div>` +
    `<div class="ro-st-time"><span id="__NEXT_CD2__">下一期更新倒计时 --:--:--</span></div>` +
    /* __NO_ST_LIST__ 期号列表已按用户要求移除 */
    `</div>` +
    /* __MQ_TICKER__ 卡片右侧的中奖播报（横向滚动 + 小喇叭） */
    /* 【BACK6 已删 · 用户 2026-10-19「这条不要了」】这里原来还有一条
       BACK6 播报（大乐透后区号码），已整条删除，没有换成别的。 */
    /* 【大乐透 后区 6 码 · 用户 2026-10-19「把大乐透后区 6 码加回来」】 */
    `<div class="ro-back6-slot">` + '' + `</div>` +
    /* 大乐透 后区 6 码 · 用户 2026-10-19「必须今天做」 */
    `<div class="ro-back6-slot">` + dltBack6Html() + `</div>` +
    mqTicker.html +
    `</div>` +
    STATUS_TZ_JS;
} else {
  const reason = status.missing.length
    ? `还缺这些彩种：${status.missing.join('、')}`
    : `数据已 ${status.hoursOld !== null ? Math.round(status.hoursOld) + ' 小时' : '很久'}未更新`;

  statusHtml =
    `<div class="ro-status warn ro-st-row" id="roStatusCard" data-st="warn">` +
    `<div class="ro-st-txt">` +
    `<div class="ro-st-head"><span class="ro-st-dot"></span>下一期推荐暂未更新</div>` +
    /* __ST_TZ__ 第二行：21:00~次日 02:00 显示（前端按本地时间切） */
    `<div class="ro-st-time ro-st-sub" id="roStSub" style="display:none">号码待凌晨 2 点计算后更新</div>` +
    `<div class="ro-st-time">所有资料均在下方<i class="ro-st-slide">请滑到底 ↓</i></div>` +
    `<div class="ro-st-time"><span id="__NEXT_CD__">2:15 更新</span></div>` +   /* 用户要求：未更新时只写「2:15 更新」，不写具体时间 */
    `<div class="ro-st-reason">${reason}</div>` +
    `<div class="ro-st-hint">请稍后再看，或联系发布者更新</div>` +
    `</div>` +
    /* __MQ_TICKER__ 卡片右侧的中奖播报（横向滚动 + 小喇叭） */
    /* 【BACK6 已删 · 用户 2026-10-19「这条不要了」】这里原来还有一条
       BACK6 播报（大乐透后区号码），已整条删除，没有换成别的。 */
    /* 【大乐透 后区 6 码 · 用户 2026-10-19「把大乐透后区 6 码加回来」】 */
    `<div class="ro-back6-slot">` + '' + `</div>` +
    /* 大乐透 后区 6 码 · 用户 2026-10-19「必须今天做」 */
    `<div class="ro-back6-slot">` + dltBack6Html() + `</div>` +
    mqTicker.html +
    `</div>` +
    STATUS_TZ_JS;
}

/* ---------- 生成最新开奖（顶部）与中奖栏（底部） ---------- */
const buildLatestHtml = ctx.buildLatestDrawHtml;
const buildWinHtml = ctx.buildWinSectionHtml;
const highlightImage = ctx.hcHighlightImage;

let latestSecHtml = '';
let hitSecHtml = '';
let hitSecCss = '';
let winCount = 0;

console.log(`  · buildLatestDrawHtml = ${typeof buildLatestHtml}`);
console.log(`  · buildWinSectionHtml = ${typeof buildWinHtml}`);

/* ---- 顶部：最新开奖 / 热力图 ----
   【一个入口，两种形态】走 latest-draws.js 的 latestBlockHtml()：
     · 窗口内（开奖日 18:00→20:00 双色球 / 18:00→21:00 大乐透）
       → 热力图占位（同一个 id="ro-latest"，客户端照样找得到）
     · 其余时刻 → 「最新开奖」
   热力图内部那份 HTML 就是这张模板图的预渲染结果（和 App 同一套渲染调用），
   页尾的实时渲染脚本会用同一个图位定义把它重画一遍。 */
if (typeof latestBlockHtmlFn === 'function') {
  try {
    latestSecHtml = latestBlockHtmlFn({
      latest: (typeof ctx.getLatestDraws === 'function') ? ctx.getLatestDraws() : null,
      games: G,
      heatmap: (gid) => renderImageHtml(gid, 'heatmap')
    });
  } catch (e) {
    console.log('  ❌ 顶部区块生成失败：' + e.message);
  }
}
/* 兜底：latest-draws.js 没加载成功时，用 hit-check.js 的老写法（只出最新开奖） */
if (!latestSecHtml && typeof buildLatestHtml === 'function') {
  try {
    latestSecHtml = buildLatestHtml();
  } catch (e) {
    console.log('  ❌ 最新开奖生成失败：' + e.message);
  }
}
/* 【稳定 id】客户端就是靠它定位这个区块并整体替换的。
   没有 id（老版本页面/生成失败）时客户端会退化成「找不到就什么都不做」。 */
if (latestSecHtml && latestSecHtml.indexOf('id="' + LATEST_DRAWS_ID + '"') < 0) {
  console.log(`  ⚠️ 最新开奖区块缺少稳定 id（${LATEST_DRAWS_ID}），客户端将无法就地更新`);
}
console.log(`  · 最新开奖区块 id = ${LATEST_DRAWS_ID}`);

/* ---- 底部：中奖栏 ---- 【已按用户要求移除】
   用户原话：「不要这个东西了」（指着页面的「中奖栏 / 累计命中 N 注 / 奖金合计 X 元」）。
   这里原来会调 hit-check.js 的 buildWinSectionHtml() 生成中奖卡片（带推荐图圈选）。
   现在完全不生成：hitSecHtml 恒为空字符串，页面里也就没有这一块。
   注意：没有动 hit-check.js 本身（App 里可能还要用），只是分享页不再输出。 */
hitSecHtml = '';
hitSecCss = '';

const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

/* ============================================================
   【核心改造】把 App（game.html）用的同一套脚本内联进分享页
   ------------------------------------------------------------
   以前分享页的图是 Node 里用「迷你 DOM」跑出来的静态结果，
   App 是浏览器里实时跑 render.js —— 两条路径，必然会有不一样。
   现在分享页把同一套脚本内联进来，在浏览器里实时渲染，
   走的就是 App 那条路径（同一份 render.js、同一份数据、同一套调用顺序）。

   顺序和 game.html 保持一致。
   内联（而不是外链）= 分享页仍然是单文件，发微信/QQ 点开就能用。
   ============================================================ */
const INLINE_JS = [
  'games.js',        // 彩种定义 GAMES / GROUPS
  'draws.js',        // 开奖数据装载
  /* 【最新开奖】区块的生成函数 + 客户端更新逻辑。
     服务端 export-static.mjs 预渲染时用的是同一份文件（见上面的 FILES），
     所以「服务端烤进 HTML 的那段」和「客户端拉 tickets.json 后就地替换的那段」
     是同一个函数渲染出来的，不会两边写法漂移。
     必须排在页尾的实时渲染脚本之前 —— 它要用 latestDrawsHtml / applyRemoteDraws。 */
  'latest-draws.js', // latestDrawsHtml / applyRemoteDraws / hcDrawOf
  'history.js',      // 历史开奖
  'draw-data.js',    // getDraw / nextDrawDate / nextIssueFor
  'algo.js',         // 基础算法
  'stats.js',        // autoFillForTemplate（自动算号）
  'templates.js',    // TEMPLATES / TEMPLATE_DISCLAIMER
  'ticket-store.js', // getTicket / 号码解析 / 摇号
  'saved-tickets.js',// 存档（手动录入那一层的数据来源）
  'heatmap-data.js', // 【按天出】实票统计热力图数据 + shouldShowHeatmap 判断
  'render.js',       // renderTicketImage ← App 用的同一个函数
  'experts-data.js', // 专家数据（data-store 依赖）
  'expert-pool.js',  // 专家池
  'materials-data.js',  // 资料（用户录入的内容）

  'data-store.js'    // resolveTemplateValues（三路合并）
];

/* 【可选脚本】没有它页面照样要能生成 —— heatmap-data.js 由
   build-heatmap.mjs 按天生成，万一云端这次没生成，也只是没有热力图，
   绝不能因为这个文件缺失就让整页生成失败（那会覆盖掉上一版好页面）。 */
const INLINE_OPTIONAL = new Set(['heatmap-data.js']);

/** 读一个脚本文件，处理成可以直接塞进 <script> 的文本 */
function readForInline(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return '';
  let s = fs.readFileSync(p, 'utf8');
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);       // 去掉可能的 BOM
  // 万一脚本里出现 </script 会提前结束标签；转义成 <\/script
  s = s.replace(/<\/(script)/gi, '<\\/$1');
  return s;
}

const inlineSizes = [];
const inlineMissing = [];
let inlineScriptsHtml = '<script>var USER_METHOD_RESULTS='+JSON.stringify(USER_METHOD_SNAPSHOT)+';</script>'; 
for (const f of INLINE_JS) {
  const code = readForInline(f);
  if (!code) {
    if (INLINE_OPTIONAL.has(f)) { console.log(`  ⏭  可选脚本缺失，跳过：${f}（热力图将不显示）`); continue; }
    inlineMissing.push(f);
    continue;
  }
  inlineSizes.push([f, Buffer.byteLength(code, 'utf8')]);
  /* ⚠️【不写 data-src="文件名"】用户硬性要求：页面上不能看出数据从哪个文件来。
     属性值就是 scripts 里的文件名（history.js / latest-draws.js …），
     看源码的人一眼就能顺着追到源头；留痕断言也会当场命中（实测拦过）。
     这个属性只有内部核对用，页面运行时【没有任何代码读它】，
     去掉后不影响渲染；文件名仍然打印在构建日志的「内联脚本」清单里。 */
  inlineScriptsHtml += `\n<script>\n${code}\n</script>\n`;
}

/* 【必须硬失败】少一个脚本，页面就渲染不出和 App 一样的结果
   （实测：少了 experts-data.js / expert-pool.js，10 张图里有 3 张
     的奇偶、大小、012路 字段会不一样）。
   宁可这里报错、不覆盖上一版好页面，也不能悄悄发一个「和 App 不一样」的网页。 */
if (inlineMissing.length) {
  console.log('');
  console.log('  ❌ 以下脚本缺失，无法保证分享页和本地 App 渲染一致：');
  inlineMissing.forEach((f) => console.log('      ' + f));
  console.log('     请先在项目根目录补齐这些文件（云端则是先跑 cloud/sync-cloud.mjs 同步）再重试。');
  console.log('     已中止，不会覆盖现有的「只读分享版.html」。');
  process.exit(1);
}

console.log('\n  · 内联脚本：');
inlineSizes.forEach(([f, n]) => console.log(`      ${f.padEnd(20)} ${(n / 1024).toFixed(1)} KB`));
console.log(`      合计 ${(inlineSizes.reduce((a, b) => a + b[1], 0) / 1024).toFixed(1)} KB`);

/* ============================================================
   页尾的【实时渲染】脚本
   ------------------------------------------------------------
   调用方式和 game.html 的 renderImagesInto 逐行对应，
   所以「App 渲染」和「分享页渲染」是同一个函数的同一次调用语义。
   ============================================================ */
const RO_RENDER_SCRIPT = `
/* ============================================================
   【实时渲染】推荐图 —— 和本地 App 走同一条渲染路径
   ------------------------------------------------------------
   App（game.html 的 renderImagesInto）是这么渲染的：

       const draw     = getDraw(gameId);
       const nextDate = nextDrawDate(gameId);
       const issue    = nextIssueFor(gameId);
       const entry    = getTicket(gameId, nextDate);
       const manual   = entry && entry.images && entry.images[img.key];
       const resolved = resolveTemplateValues(gameId, img.key, manual);
       const data     = { issue: issue, date: nextDate, images: {} };
       data.images[img.key] = resolved.values;
       renderTicketImage(gameId, img.key, data);

   下面 renderSlot() 就是照抄上面这几行的调用方式（一字不改的语义），
   所以只要 render.js 和数据一样，两边渲染出的 DOM 必然一致。

   图位：<div class="ro-imagewrap" data-game="ssq" data-image="main">…</div>
   里面是服务器端预渲染的兜底内容；
   这里渲染成功后才整体替换掉 —— 万一 JS 挂了，页面也不会空白。
   ============================================================ */
(function () {
  /* 按「彩种 + 图名」渲染一张推荐图 —— 和 game.html / renderImagesInto 完全一致 */
  function renderImageDom(gid, key) {
    if (!gid || !key) return null;
    if (typeof TEMPLATES === 'undefined' || typeof renderTicketImage !== 'function') return null;

    var tpl = TEMPLATES[gid];
    if (!tpl || !tpl.images || !tpl.images.length) return null;

    /* 找到这张图的模板定义；找不到就用第一张（和 renderTicketImage 的兜底一致） */
    var img = null;
    for (var i = 0; i < tpl.images.length; i++) {
      if (tpl.images[i].key === key) { img = tpl.images[i]; break; }
    }
    if (!img) img = tpl.images[0];
    if (!img) return null;

    /* ---------- 以下与 game.html / renderImagesInto 完全一致 ---------- */
    var nextDate = nextDrawDate(gid);
    var draw  = (typeof getDraw === 'function') ? getDraw(gid) : null;
    var issue = (typeof nextIssueFor === 'function') ? nextIssueFor(gid) : ((draw && draw.issue) || '');

    var entry  = (typeof getTicket === 'function') ? getTicket(gid, nextDate) : null;
    var manual = (entry && entry.images && entry.images[key]) || null;

    var resolved = (typeof resolveTemplateValues === 'function')
      ? resolveTemplateValues(gid, key, manual)
      : { values: manual || {} };

    /* __QXC_POS2__ 七星彩：合并完再验一次六位定位不能一样
       （手动/存档那一层可能是同一串号或错开一位的窗口；
        enforceQxcPosDistinct 是幂等的，正常号不会被改） */
    try {
      if (gid === 'qxc' && resolved && resolved.values
        && typeof enforceQxcPosDistinct === 'function' && typeof fieldRolesOf === 'function') {
        enforceQxcPosDistinct(gid, resolved.values, fieldRolesOf(gid, key));
      }
    } catch (e) { /* 失败不影响出图 */ }

    var data = { issue: issue, date: nextDate, images: {} };
    data.images[key] = resolved.values;

    return renderTicketImage(gid, key, data);
    /* ---------- 以上与 game.html / renderImagesInto 完全一致 ---------- */
  }

  /** 图位（<div class="ro-imagewrap" data-game data-image>）→ 渲染成图 */
  function renderSlot(slot) {
    return renderImageDom(slot.getAttribute('data-game'), slot.getAttribute('data-image'));
  }

  function renderAll() {
    var slots = document.querySelectorAll('.ro-imagewrap[data-game]');
    var ok = 0;
    var fail = 0;
    var hidden = 0;

    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];

      /* ============================================================
         【按天出】实票统计热力图：这里是【客户端】的第二道判断。
         服务器生成时已经判断过一次，但页面会被缓存/长期挂在网上 ——
         第二天打开同一张页面时，昨天的热力图必须自动消失。
         判断口径：heatmap-data.js 里的 shouldShowHeatmap
         （数据必须是今天的 + 今天是开奖日 + 已过北京时间 18:00 +
           还没到窗口结束的 20:00 / 21:00）。
         ============================================================ */
      if (slot.getAttribute('data-image') === 'heatmap') {
        /* 【用户 2026-10-18】热力图现在在 #ro-heatmap 那张折叠卡里，
           由「当前时间 → 下一期最近的彩种」决定显示哪一个（页面脚本自己换），
           不再有「18:00 才显示 / 20:00·21:00 撤下」的时间窗 ——
           所以【这张卡里的图位永远渲染】，不走下面那套按时间隐藏的逻辑。
           其它位置（老页面缓存下来的彩种区块热力图）仍按原逻辑清理。 */
        var inHeatBlock = false;
        try { inHeatBlock = !!(slot.closest && slot.closest('#ro-heatmap')); } catch (e) { inHeatBlock = false; }
        if (!inHeatBlock) {
        var hg = slot.getAttribute('data-game');
        var show = false;
        try {
          show = (typeof shouldShowHeatmap === 'function') && shouldShowHeatmap(hg);
        } catch (e) { show = false; }
        if (!show) {
          /* 【顶部区块里的那一张不能在这里删】
             现在热力图只出现在 #ro-latest 区块里，把这个图位删掉只会
             留下一个空区块。交给 refreshLatestBlock 换成「最新开奖」。 */
          if (isBlockHeatSlot(slot)) {
            try { refreshLatestBlock(true); } catch (e3) { /* 忽略 */ }
            continue;
          }
          /* 老页面缓存下来的、彩种区块里的热力图 → 整块拿掉，不留占位、不留空白 */
          try {
            if (slot.parentNode && slot.parentNode.removeChild) slot.parentNode.removeChild(slot);
            else slot.style.display = 'none';
          } catch (e) { slot.style.display = 'none'; }
          hidden++;
          continue;
        }
        }   /* ← if (!inHeatBlock) 收口 */
      }

      var dom = null;

      try {
        dom = renderSlot(slot);
      } catch (e) {
        /* 渲染出错：保留服务器端预渲染的兜底内容，不影响浏览 */
        fail++;
        if (window.console && console.warn) {
          console.warn('[分享页] 实时渲染失败，保留预渲染兜底：' +
            slot.getAttribute('data-game') + '/' + slot.getAttribute('data-image'), e);
        }
        continue;
      }

      if (!dom) { fail++; continue; }

      /* 先渲染成功、再替换，避免出现空白 */
      slot.innerHTML = '';
      slot.appendChild(dom);
      ok++;
    }

    /* 留一个标记，方便确认这一页到底跑的是实时渲染还是预渲染兜底 */
    try {
      if (document.body && document.body.setAttribute) {
        document.body.setAttribute('data-render', fail ? 'fallback' : 'live');
        document.body.setAttribute('data-render-count', ok + '/' + slots.length);
        document.body.setAttribute('data-heatmap-hidden', String(hidden));
      }
    } catch (e) { /* 忽略 */ }

    return ok;
  }

  window.__roRenderAll = renderAll;

  /* 【热力图区块补画】用户 2026-10-17 把热力图搬进 #ro-heatmap（默认折叠，:target 才显示）。
      canvas 在隐藏元素里画不出来（实测 rect=0x0、canvas 缺失），
      所以点开入口（hash = #ro-heatmap）时、以及带 hash 直达时，各补画一次。 */
  try {
    window.addEventListener('hashchange', function () {
      if (String(location.hash || '').indexOf('#ro-heatmap') === 0) {
        try { renderAll(); } catch (e) { /* 忽略 */ }
      }
    });
    if (String(location.hash || '').indexOf('#ro-heatmap') === 0) {
      setTimeout(function () { try { renderAll(); } catch (e) { /* 忽略 */ } }, 60);
    }
  } catch (e) { /* 忽略 */ }

  /* 【调试】想验证「18:00 之后才有热力图」又不想等到 18:00：
     在网址后面加 ?hmnow=2026-10-15T18:30 —— 时间判断会按这个时刻算。
     不加参数就是真实时间，线上用户不会受影响。 */
  try {
    if (typeof location !== 'undefined' && location.search) {
      var hm = /[?&]hmnow=([^&]+)/.exec(location.search);
      if (hm) {
        window.HEATMAP_NOW_OVERRIDE = decodeURIComponent(hm[1]);
        if (window.console && console.log) console.log('[分享页] 热力图时间已定格：' + window.HEATMAP_NOW_OVERRIDE);
      }
    }
  } catch (e) { /* 忽略 */ }

  /* ============================================================
     【最新开奖 ⇄ 热力图 · 到点自动切换】
     ------------------------------------------------------------
     用户原话：
       「在开双色球的时候 18 点更新到最新开奖位置覆盖住，过了 20 点就更新回来
         最新开奖；同样大乐透在 18 点更新过去，21 点更新回来最新开奖。」

     这一段就是「页面一直开着也会自己换」的实现：
       · 时间窗判断 = latestBlockMode() → heatmap-data.js 的 shouldShowHeatmap()
         （和服务端预渲染、App 用的是同一个函数，不可能漂移）
       · 区块 HTML = latestBlockHtml()（同样是服务端那一份）
       · 只在【形态变了】或【开奖数据更新了】时才动 DOM，平时一次都不碰
       · 任何一步失败 → 保持原样（绝不留白、绝不出现空区块）

     调用时机：
       ① 页面刚打开（先用内联快照，本地时钟算一次）
       ② 每次拉到 tickets.json 之后（90 秒轮询）
       ③ 每 90 秒的定时器里【独立】再算一次 —— 断网也能到点自动切
     ============================================================ */
  var __roBlockMode = '';        /* 页面上这个区块现在是什么形态：'' / 'latest' / 'heatmap:ssq' */

  function blockModeKey() {
    try {
      if (typeof latestBlockMode !== 'function') return '';
      var m = latestBlockMode();
      return m.mode + (m.gameId ? ':' + m.gameId : '');
    } catch (e) { return ''; }
  }

  /**
   * 这个热力图图位就是【顶部区块里那一张】吗？
   * 现在热力图只出现在 #ro-latest 里（彩种区块不再重复出），
   * 所以「当前形态里的那个彩种」就是它 —— 用来避免把顶部区块删成空白。
   */
  function isBlockHeatSlot(slot) {
    return blockModeKey() === 'heatmap:' + slot.getAttribute('data-game');
  }

  /**
   * 把顶部区块换成「现在该有的样子」
   * @param {boolean} force 开奖数据更新了 → 即使形态没变也要重画一次
   * @returns {{ok:boolean, mode:string, changed:boolean}}
   */
  function refreshLatestBlock(force) {
    var out = { ok: false, mode: '', changed: false };
    try {
      /* 老页面没有这个 id（或被缓存的旧版本）→ 什么都不做。
         沙箱/自测环境里没有 getElementById 也走这一条，不会刷告警。 */
      var el = (typeof document !== 'undefined' && typeof document.getElementById === 'function')
        ? document.getElementById(LATEST_DRAWS_ID) : null;
      if (!el) return out;
      if (typeof latestBlockMode !== 'function' || typeof latestBlockHtml !== 'function') return out;
      if (typeof latestDrawsHtml !== 'function' || typeof latestDrawsFromRaw !== 'function') return out;

      var key = blockModeKey();
      if (!key) return out;
      out.mode = key;
      if (!force && key === __roBlockMode) { out.ok = true; return out; }   /* 形态没变 → 不碰 DOM */

      var all = null;
      try { all = (typeof DRAW_DATA !== 'undefined') ? DRAW_DATA.games : null; } catch (e1) { all = null; }

      var html = latestBlockHtml({
        latest: latestDrawsFromRaw(all, (typeof GAMES !== 'undefined') ? GAMES : {}),
        games: (typeof GAMES !== 'undefined') ? GAMES : {},
        /* 热力图内部 HTML：和推荐图走同一个渲染函数（同一次调用语义） */
        heatmap: function (gid) {
          var dom = renderImageDom(gid, 'heatmap');
          return (dom && dom.outerHTML) ? dom.outerHTML : '';
        }
      });
      if (!html) return out;                                 /* 生成不出来 → 保持原样，绝不留白 */

      __roBlockMode = key;                                   /* 记住形态，下次没变就不动 */
      out.ok = true;

      if (el.outerHTML === html) return out;                 /* 一模一样就不用动 DOM */
      el.outerHTML = html;
      out.changed = true;

      try {
        if (document.body && document.body.setAttribute) {
          document.body.setAttribute('data-block-mode', key);
        }
      } catch (e2) { /* 忽略 */ }

      /* 区块里换成了 760px 宽的热力图 → 重新做一次等比缩放 */
      try {
        if (typeof window.__roFit === 'function') window.__roFit();
      } catch (e3) { /* 忽略 */ }

      return out;
    } catch (e) {
      if (window.console && console.warn) console.warn('[分享页] 顶部区块切换失败，保留原内容', e);
      return out;
    }
  }

  /* 方便自测 / 排查：控制台里手动换一次（__roRefreshBlock()） */
  window.__roRefreshBlock = refreshLatestBlock;

  /* 【顺序·重要】先按本地时钟把区块定成该有的形态，再整体渲染图位 ——
     这样「服务器 02:00 预渲染成最新开奖、用户 19:00 打开」也能立刻显示热力图，
     而且顶部那张热力图会由下面的 renderAll() 一起渲染出来。 */
  try {
    refreshLatestBlock(false);
  } catch (e) { /* 忽略 */ }

  /* 页尾脚本执行时，上面的图位已经全部在 DOM 里，直接渲染 */
  try {
    renderAll();
  } catch (e) {
    if (window.console && console.warn) {
      console.warn('[分享页] 实时渲染整体失败，保留预渲染兜底', e);
    }
  }

  /* ============================================================
     【准实时同步】直接拉服务器上的最新号码，拿到就地重渲染
     ------------------------------------------------------------
     为什么需要这一段：
       页面里的号码是「生成那一刻」的快照（内联的 saved-tickets.js）。
       本机摇号后，必须等云端重新构建 + 部署，页面上的号码才会变，
       链路一长就是几十分钟 —— 这就是「摇完号要等两小时」的原因。

     现在的顺序：
       1) 先用内联快照渲染  → 立刻有内容，离线也能看
       2) 再异步拉 tickets.json（服务器上的最新号码）
          · 比页面里的新 → 覆盖内存里的 SAVED_TICKETS 并就地重渲染
          · 不新 / 打不开   → 什么都不做，页面照旧（离线可用）

     注意：SAVED_TICKETS 是 saved-tickets.js 里的 const，
           不能重新赋值整个变量，只能改它的属性。
     ============================================================ */

  /* 把 "2026-10-14T05:00:00.000Z"（ISO，UTC）和 "2026-10-14 05:00"
     （本机/云端生成，北京时间）统一成 'YYYY-MM-DD HH:MM:SS' 北京时间。
     两种格式直接比字符串一定出错（'T' 的编码比空格大），所以先归一化。 */
  function normTime(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    var iso = s.replace(' ', 'T');
    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(iso)) iso += ':00';
    /* 不带时区的当成北京时间（saved-tickets.js 里的 updated 就是这种） */
    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?$/.test(iso)) iso += '+08:00';
    var t = Date.parse(iso);
    if (isNaN(t)) return s.slice(0, 19).replace('T', ' ');
    /* 统一按北京时间输出，格式一样才能直接比大小 */
    var d = new Date(t + 8 * 3600 * 1000);
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + ' ' +
           p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds());
  }

  function inlineTicketTime() {
    try {
      return (typeof SAVED_TICKETS !== 'undefined' && SAVED_TICKETS && SAVED_TICKETS.updated) || '';
    } catch (e) { return ''; }
  }

  /* 页面上当前这份【号码本身】的时间（updated），用来判断服务器那份是不是更新。
     注意用的是号码的时间，不是页面生成时间：
     云端如果用【旧号码】重新构建了一遍，它的 publishedAt 会很新，
     但 updated 是旧的 —— 那种不能认，否则会把页面上的新号码换回旧的。 */
  var appliedTime = normTime(inlineTicketTime());
  window.__roLiveApplied = false;
  window.__roLiveRemoteTime = '';

  /**
   * 用服务器数据覆盖页面上的号码并重渲染
   * @returns {boolean} 是否真的用新号码重渲染了
   */
  function applyRemoteTickets(j) {
    if (!j || !j.tickets || !Object.keys(j.tickets).length) return false;
    if (typeof SAVED_TICKETS === 'undefined' || !SAVED_TICKETS) return false;

    var remoteData = normTime(j.updated);
    var remotePub = normTime(j.publishedAt || j.updated);
    if (!remoteData && !remotePub) return false;

    /* 内容一模一样（只是重新构建了一遍）就没必要重画 10 张图 */
    var same = false;
    try { same = JSON.stringify(SAVED_TICKETS.tickets || {}) === JSON.stringify(j.tickets); } catch (e) { same = false; }

    /* 服务器这份比页面上的新吗？
       · 号码时间更晚            → 新（真的摇过号了）
       · 号码时间一样但内容不同  → 新（同一分钟内摇了两次，内容还是会变）
       · 号码时间更早            → 不是（云端拿旧号码重建，publishedAt 再新也不认） */
    var newer;
    if (remoteData && appliedTime) {
      newer = (remoteData > appliedTime) || (remoteData === appliedTime && !same);
    } else {
      newer = remotePub > appliedTime;
    }
    if (!newer) return false;                           /* 服务器的不新，不动 */

    /* 用服务器数据覆盖内存里的 SAVED_TICKETS（只改属性） */
    SAVED_TICKETS.updated = j.updated || SAVED_TICKETS.updated;
    SAVED_TICKETS.tickets = j.tickets;

    /* 同时清掉 localStorage 里的旧号码：
       loadTickets() 的规则是「本地存储比文件新就用本地存储」，
       不清掉的话会被旧号码盖回去，等于白拉一次 */
    try {
      localStorage.removeItem('cdd.tickets.v1');
      localStorage.removeItem('cdd.tickets.ts');
    } catch (e) { /* 忽略 */ }

    appliedTime = remoteData || remotePub;
    window.__roLiveRemoteTime = appliedTime;
    if (same) return false;                             /* 号码没变，不用重画 */

    window.__roLiveApplied = true;
    renderAll();                                        /* 用最新号码重渲染 */

    /* 重渲染后图片尺寸变了，重新做等比缩放 */
    try {
      if (typeof window.__roFit === 'function') window.__roFit();
    } catch (e) { /* 忽略 */ }

    try {
      if (document.body && document.body.setAttribute) {
        document.body.setAttribute('data-tickets-from', 'server');
        document.body.setAttribute('data-tickets-time', appliedTime);
      }
    } catch (e) { /* 忽略 */ }

    return true;
  }

  /* 方便自测 / 排查：页面上可以在控制台手动调 __roLiveApply(数据) */
  window.__roLiveApply = applyRemoteTickets;

  /* ============================================================
     【最新开奖 · 就地更新】拿到 tickets.json 里的 draws 后重画顶部区块
     ------------------------------------------------------------
     以前这块是服务器【预渲染】进 HTML 的静态内容，只有刷新整页才会变。
     现在 tickets.json 里带上了各彩种最新一期开奖（draws），
     拉到比页面内联快照更新的一期就：
       1) 把新号码合并进内存里的 DRAW_DATA（只改属性，只更新有的彩种）
       2) 调 refreshLatestBlock(true) 重画顶部区块
          —— 区块现在可能是「最新开奖」，也可能是顶掉它的「热力图」，
             具体放哪个由 latestBlockMode() 决定（到点会自动切换）：
               · 形态没变、只是开奖号变了 → 重画「最新开奖」那张卡
               · 到点该换回来了            → 换成「最新开奖」（带着新号码）
             【关键】换回来时用的就是刚才合并进 DRAW_DATA 的新号码，
             所以「20:00 / 21:00 一换回来就是最新一期」，不用等下次刷新。
     用的就是生成页面时那份同一个函数（latest-draws.js），
     所以服务端烤进去的和服务端/客户端换上去的写法完全一致。

     降级：拿不到 draws / 只有部分彩种 / 比页面旧 → 一律保持原样，
           不报错、不留白（这条路径整个用 try 包住）。
     ============================================================ */
  function applyRemoteDrawsToPage(j) {
    var res = { applied: [], skipped: [] };
    try {
      if (!j || !j.draws) return res;                      /* 没带就什么都不做 */
      if (typeof applyRemoteDraws !== 'function') return res;   /* 客户端脚本缺失 → 保持预渲染兜底 */

      /* 1) 合并进内存数据（只更新有的彩种；比页面旧的自动跳过） */
      res = applyRemoteDraws(j.draws) || res;
      // Reconcile validated latest draws with the history used by the game.
      var changedGames=[];
      if(typeof DRAW_HISTORY!=='undefined'&&DRAW_HISTORY&&typeof DRAW_DATA!=='undefined'&&DRAW_DATA){
        DRAW_HISTORY.games=DRAW_HISTORY.games||{};
        Object.keys(j.draws).forEach(function(g){
          var d=(DRAW_DATA.games||{})[g],list=DRAW_HISTORY.games[g]||[];
          if(!d||!d.issue||!d.areas||!list.length)return;
          if(Number(d.issue)<=Number(list[0].issue))return;
          DRAW_HISTORY.games[g]=[JSON.parse(JSON.stringify(d))].concat(list.filter(function(x){return String(x.issue)!==String(d.issue);})).slice(0,100);
          changedGames.push(g);
        });
      }
      if(changedGames.length)window.dispatchEvent(new CustomEvent('monster-draw-update',{detail:{games:changedGames}}));

      if (!res.applied.length) return res;                 /* 没有更新 → 区块原样保留 */

      /* 2) 按【当前该有的形态】重画区块（形态判断 + HTML 都来自共享函数）
         【关键】用合并【之后】的完整数据（DRAW_DATA.games）重画，而不是 j.draws：
         服务器这次可能只带了一部分彩种，用 j.draws 直接渲染会把别的彩种弄丢。
         区块必须始终是完整的 8 个彩种。 */
      var r = refreshLatestBlock(true);
      if (!r.ok) return { applied: [], skipped: res.skipped };   /* 画不出来 → 保持原样 */

      try {
        if (document.body && document.body.setAttribute) {
          document.body.setAttribute('data-draws-from', 'server');
          document.body.setAttribute('data-draws-games', res.applied.join(','));
        }
      } catch (e2) { /* 忽略 */ }

      return res;
    } catch (e) {
      /* 任何意外都只是「这次没更新开奖」，不能影响页面其它部分 */
      if (window.console && console.warn) console.warn('[分享页] 最新开奖就地更新失败，保留原内容', e);
      return { applied: [], skipped: [] };
    }
  }

  /* 方便自测 / 排查：控制台里手动调 __roLiveDraws(数据) */
  window.__roLiveDraws = applyRemoteDrawsToPage;

  /* 【离线单文件 · 不拉】file:// 下 tickets.json 永远不存在 ——
     它只发布在【网站根目录】（cloud/out/tickets.json，云端每班次刷新），
     离线打开（手机分享单个 html / App 里 file://）时这个相对路径必然 404。
     后果实测：首拉 1 次 + 补拉 4 次 + 自愈 1 次 = 6 条 404 红字（页面不白屏，
     因为顶部区块和 10 张推荐图都预渲染在 HTML 里了）。
     → file:// 直接不拉：少 6 条红字、少 6 次无用请求，功能一点不少（有预渲染兜底）。
     ⚠️ http(s) 上（线上网址）照旧拉，线上「号码就地更新 / 最新开奖就地更新」不受影响。 */
  function canPullTickets() {
    try { return String(location.protocol || '') !== 'file:'; } catch (e) { return true; }
  }

  /* 拉一次服务器上的号码文件 */
  function pullTickets() {
    if (!canPullTickets()) return Promise.resolve(false);   /* 离线单文件：不拉，直接用内联快照 */
    return fetch('tickets.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        /* 两件事各自独立：号码变了就重画 10 张图，开奖变了就重画顶部区块 */
        var t = applyRemoteTickets(j);
        var d = applyRemoteDrawsToPage(j);
        if (window.__roSelfHealDecide) window.__roSelfHealDecide(j);
        return t || (d && d.applied.length > 0);
      })
      .catch(function () { return false; });   /* 打不开服务器（离线/被墙）就继续用内联快照 */
  }

  var firstPull = pullTickets();
  window.__roLivePromise = firstPull;

  /* 方便自测 / 排查：控制台里手动拉一次（__roPullOnce().then(...)） */
  window.__roPullOnce = pullTickets;

  /* ============================================================
     【自动刷新】页面开着的时候，隔一段时间自动去服务器看有没有新数据
     ------------------------------------------------------------
     为什么需要：
       云端在固定时间更新（凌晨 2:00 全量 / 18:00 热力图 /
       21:30 福彩、21:45 体彩抓开奖同步）。如果你手机上的页面一直开着，
       以前只能【手动刷新】才看得到新内容。
     现在：
       每 90 秒做两件事，都是就地重渲染，不用你动手：
         ① 拉一次 tickets.json —— 有新号码就重画推荐图 + 顶部区块
         ② 【独立】再算一次顶部区块的形态 —— 到 18:00 换成热力图、
            到 20:00（双色球）/ 21:00（大乐透）换回最新开奖。
            这一步只看本机时间、不联网，所以断网也照样到点自动切。
     省流量：
       这只是一个小 JSON（几 KB），而且只有页面开着时才轮询；
       切到后台时浏览器会自动降频。
     ============================================================ */
  if (!window.__roAutoTimer) {
    var AUTO_MS = (typeof window.__roAutoIntervalMs === 'number')
      ? window.__roAutoIntervalMs : 90000;
    window.__roAutoTimer = setInterval(function () {
      try {
        pullTickets();
      } catch (e) { /* 忽略：网络问题不能影响页面 */ }
      /* 【到点自动切换】和网络无关，单独算一次（形态没变时它一个 DOM 都不碰） */
      try {
        refreshLatestBlock(false);
      } catch (e) { /* 忽略 */ }
    }, AUTO_MS);

    /* 页面从后台切回前台时也立刻拉一次（手机切回来马上就是新的） */
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
          try { pullTickets(); } catch (e) {}
          try { refreshLatestBlock(false); } catch (e) {}
        }
      });
    }
  }

  /* 补拉：本机刚摇完号时，云端可能还在部署中（约 1 分钟），
     GitHub Actions 排队时甚至会等几分钟，第一次拉到的还是旧的。
     隔几秒再补拉几次 —— 这样「号码刚摇完就打开网址」的人也不用
     手动刷新，页面自己会跟上（最多补拉四次，共约 3.5 分钟）。
     只要有一次拿到更新的数据就停。
     （间隔放在 window 上，方便自测/排查时改短。） */
  if (!window.__roLiveRetryDelays) window.__roLiveRetryDelays = [8000, 25000, 60000, 120000];

  firstPull.then(function (applied) {
    if (applied) return;                       /* 已经换成新号码了，不用补拉 */
    if (!canPullTickets()) return;             /* 离线单文件（file://）：不补拉，省掉 4 条 404 */
    var delays = window.__roLiveRetryDelays || [];
    var step = function (i) {
      if (i >= delays.length) return;
      setTimeout(function () {
        pullTickets().then(function (done) { if (!done) step(i + 1); });
      }, delays[i]);
    };
    step(0);
  });
})();
`;

/* ============================================================
   【走势图 · 内联片段】
   ------------------------------------------------------------
   数据：history.js 的 DRAW_HISTORY（真开奖），构建时读一次、快照内嵌；
        页面零联网、不调 AI、不写 localStorage。
   期数：近 30 期（和折叠块副标题「近 30 期走势 · 预选参考」对齐）。
   ⚠️ 「数据从哪来」的字样由文件末尾那道 source-guard 统一兜底 ——
      走势图这一段现在也是分享页的一部分，跟着整页一起过关。
   ============================================================ */
const trendHtml = renderTrendFragment(
  buildTrendPayload(loadTrendHistory(), TREND_PERIODS)
);
console.log('\n  · 走势图（内联进「近 30 期走势 · 预选参考」折叠块，不是 iframe）：'
  + `8 彩种 × 近 ${TREND_PERIODS} 期 · ${(Buffer.byteLength(trendHtml, 'utf8') / 1024).toFixed(1)} KB`);

/* ============================================================
   【⛶ 走势图全屏】用户 2026-10-18：「给走势图加『⛶ 点击全屏』按钮」
   ------------------------------------------------------------
   只改本文件 —— build-trend.mjs 的 renderTrendFragment 一个字不动，
   这里在【字符串层面】给内联片段补三样东西：
     ① 根容器加 id="trendFullscreenContainer"（全屏对象 = 整个内联走势图）
     ② 一段只属于这一块的样式（按钮 / 全屏容器 / 米杏色提示条）
     ③ 一段 IIFE 脚本（挂按钮 + 全屏开关 + 横屏锁定 + fullscreenchange）
   用户的三条铁律在这里落实：
     · 不用裸 <button> → 按钮是 <div role="button" tabindex="0">，事件 addEventListener
       （页面不变量：DOM 里的 button 标签 = 0）
     · 不用 alert()（微信里不显示）→ 失败只 console + 页面内米杏色小条
     · 横屏锁定很多浏览器不支持（iOS Safari 完全不支持）→ catch 掉，不打扰用户
   ⚠️ 下面两段是模板字符串，页面里出现的就是它们的原样；
      JS 里【故意不写反斜杠】——模板字符串会把 '\s' 吃成 's'，正则就废了，
      所以类名增删全部用 split/join 手写，一个正则都不用。
   ============================================================ */
const TREND_FS_CSS = `
/* ⛶ 走势图全屏（用户 2026-10-18）：
   ① 按钮长在走势图工具栏那一行的右端（div role=button，裸 button 仍然 0）
   ② 全屏容器 = 整个内联走势图 #trendFullscreenContainer
   ③ 失败提示 = 页面内米杏色小条（微信里 alert 不显示） */
.btn-fullscreen[data-tr-fsbtn] {
  margin-left: auto;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 32px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  color: #4a3a26;
  background: #fdf6ea;
  border: 1px solid #e8d7bd;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}
.btn-fullscreen[data-tr-fsbtn]:hover { border-color: #1a8c5a; color: #1a8c5a; }
.btn-fullscreen[data-tr-fsbtn]:focus-visible { outline: 2px solid #1a8c5a; outline-offset: 2px; }

/* 全屏容器：用户指定的那几条 —— 撑满屏幕、背景米杏色、可滚动 */
#trendFullscreenContainer:fullscreen {
  width: 100vw; height: 100vh; overflow: auto;
  background: var(--ro-bg, #f7efe1);
  padding: 10px; box-sizing: border-box;
  border: 0; border-radius: 0; margin: 0;
}
/* 老 Safari 只认这个伪类（和上面那条分开写：合成一条会让整条失效） */
#trendFullscreenContainer:-webkit-full-screen {
  width: 100vw; height: 100vh; overflow: auto;
  background: #f7efe1;
  padding: 10px; box-sizing: border-box;
  border: 0; border-radius: 0; margin: 0;
}
/* 页面内全屏兜底：iOS Safari / 微信里 requestFullscreen 压根不存在 */
#trendFullscreenContainer.tr-fs-pseudo {
  position: fixed; left: 0; top: 0; z-index: 2147482000;
  width: 100vw; height: 100vh; overflow: auto;
  background: #f7efe1;
  padding: 10px; box-sizing: border-box;
}
html.tr-fs-lock, html.tr-fs-lock body { overflow: hidden !important; }

/* 全屏里的排版：块撑满 → 表格自己占满剩下的高度，横竖都能滚，表头照旧吸顶 */
#trendFullscreenContainer.tr-fs-on { display: flex; flex-direction: column; }
#trendFullscreenContainer.tr-fs-on > #ro-trend-root { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
#trendFullscreenContainer.tr-fs-on .tr-tabs { flex: 0 0 auto; }
#trendFullscreenContainer.tr-fs-on .tr-block:not([hidden]) { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; margin: 0; }
#trendFullscreenContainer.tr-fs-on .tr-head,
#trendFullscreenContainer.tr-fs-on .toolbar { flex: 0 0 auto; }
#trendFullscreenContainer.tr-fs-on .tr-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; -webkit-overflow-scrolling: touch; }
/* 全屏里把不画图的东西让出去，屏幕全给表格 */
#trendFullscreenContainer.tr-fs-on .ro-top,
#trendFullscreenContainer.tr-fs-on .ro-status,
#trendFullscreenContainer.tr-fs-on .ro-foot,
#trendFullscreenContainer.tr-fs-on .tr-sub,
#trendFullscreenContainer.tr-fs-on .tr-modehint,
#trendFullscreenContainer.tr-fs-on .tr-note,
#trendFullscreenContainer.tr-fs-on .tr-legend { display: none; }

/* 米杏色提示条（只在失败/兜底时出现，2.6 秒自己收） */
.tr-fs-tip {
  position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
  z-index: 2147483000; box-sizing: border-box; max-width: calc(100vw - 32px);
  padding: 9px 14px; border-radius: 12px;
  font-size: 12.5px; font-weight: 600; line-height: 1.6; text-align: center;
  color: #7a5c00; background: #fff6dd; border: 1px solid #ffe08a;
  box-shadow: 0 6px 18px rgba(74, 58, 38, .18);
  opacity: 0; transition: opacity .18s ease; pointer-events: none;
}
.tr-fs-tip.on { opacity: 1; }
`;

const TREND_FS_JS = `
/* ⛶ 走势图全屏的脚本（内联片段后面的一段独立 IIFE）
   · 按钮：<div class="btn-fullscreen" role="button" tabindex="0">（不是裸 button）
   · 事件：addEventListener 挂在自己身上；触摸也自己处理
     （走势图互动层在 touchend 里 preventDefault，会吃掉浏览器补发的 click，
      只挂 click 的手机上会点不动 —— 这里 touchstart/touchend/click/keydown 都挂）
   · 失败：console + 米杏色小条，绝不弹窗（微信里弹窗不显示）
   · 横屏：screen.orientation.lock('landscape') 能锁就锁，锁不上 catch 掉、静默
   · 零 localStorage、零内联 onclick */
(function () {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  var BOX_ID = 'trendFullscreenContainer';
  var TOUCH_AT = 0;
  var TIP_TIMER = 0;
  var START_X = 0, START_Y = 0;

  function box() { return document.getElementById(BOX_ID); }

  /* 类名增删：不用正则（省得被模板字符串吃掉反斜杠） */
  function hasCls(el, c) { return !!el && (' ' + (el.className || '') + ' ').indexOf(' ' + c + ' ') > -1; }
  function addCls(el, c) { if (el && !hasCls(el, c)) el.className = (el.className ? el.className + ' ' : '') + c; }
  function delCls(el, c) {
    if (!el) return;
    var parts = String(el.className || '').split(' ');
    var out = [];
    for (var i = 0; i < parts.length; i++) { if (parts[i] && parts[i] !== c) out.push(parts[i]); }
    el.className = out.join(' ');
  }

  function fsEl() {
    return document.fullscreenElement || document.webkitFullscreenElement ||
      document.mozFullScreenElement || document.msFullscreenElement || null;
  }

  /* 米杏色小条：页面内提示（微信里不显示 alert，所以走这个） */
  function tip(msg) {
    var b = box(); if (!b) return;
    var el = b.querySelector('.tr-fs-tip');
    if (!el) {
      el = document.createElement('div');
      el.className = 'tr-fs-tip';
      el.setAttribute('role', 'status');
      b.appendChild(el);
    }
    el.textContent = msg || '全屏没打开';
    el.className = 'tr-fs-tip on';
    if (TIP_TIMER) clearTimeout(TIP_TIMER);
    TIP_TIMER = setTimeout(function () { el.className = 'tr-fs-tip'; }, 2600);
  }

  /* 横屏锁定：不支持的浏览器（iOS Safari 完全不支持）就当没这回事 */
  function lockLandscape() {
    try {
      var so = window.screen && window.screen.orientation;
      if (!so || typeof so.lock !== 'function') return;
      var p = so.lock('landscape');
      if (p && typeof p.then === 'function') p.then(null, function (e) { console.log('锁定横屏失败', e); });
    } catch (e) { console.log('锁定横屏失败', e); }
  }
  function unlockOrientation() {
    try {
      var so = window.screen && window.screen.orientation;
      if (so && typeof so.unlock === 'function') so.unlock();
    } catch (e) { /* 解不了就算了 */ }
  }

  function paint() {
    var b = box(); if (!b) return;
    var on = !!fsEl() || hasCls(b, 'tr-fs-pseudo');
    if (on) addCls(b, 'tr-fs-on'); else delCls(b, 'tr-fs-on');
    var list = document.querySelectorAll('.btn-fullscreen');
    for (var i = 0; i < list.length; i++) {
      list[i].textContent = on ? '⛶ 退出全屏' : '⛶ 点击全屏';
      list[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /* 横屏后表格可视宽度变了：补画一次走势连线，保证线还压准格子 */
  function redrawSoon() {
    try {
      if (typeof window.__roTrendRedraw === 'function') window.setTimeout(window.__roTrendRedraw, 60);
    } catch (e) {}
  }

  /* 页面内全屏（兜底）：真全屏不支持时也别让用户没得看 */
  function pseudoFullscreen() {
    var b = box(); if (!b) return;
    addCls(b, 'tr-fs-pseudo');
    if (document.documentElement) addCls(document.documentElement, 'tr-fs-lock');
    paint();
    tip('这个浏览器不支持全屏，已切成页面内全屏；请手动横屏查看');
    redrawSoon();
  }

  function enter() {
    var b = box(); if (!b) return;
    if (b.requestFullscreen) {
      var p = null;
      try { p = b.requestFullscreen(); } catch (e) { console.log('无法进入全屏', e); pseudoFullscreen(); return; }
      if (p && typeof p.then === 'function') {
        p.then(function () { lockLandscape(); paint(); redrawSoon(); },
               function (err) { console.log('无法进入全屏', err); pseudoFullscreen(); });
      } else { lockLandscape(); paint(); redrawSoon(); }
      return;
    }
    if (b.webkitRequestFullscreen) {
      try { b.webkitRequestFullscreen(); } catch (e) { console.log('无法进入全屏', e); pseudoFullscreen(); return; }
      lockLandscape(); paint(); redrawSoon();
      return;
    }
    pseudoFullscreen();
  }

  function exit() {
    var b = box();
    unlockOrientation();
    try {
      if (fsEl()) {
        var p = document.exitFullscreen ? document.exitFullscreen()
          : (document.webkitExitFullscreen ? document.webkitExitFullscreen() : null);
        if (p && typeof p.catch === 'function') p.catch(function (e) { console.log('退出全屏失败', e); });
      }
    } catch (e) { console.log('退出全屏失败', e); }
    if (b) { delCls(b, 'tr-fs-pseudo'); delCls(b, 'tr-fs-on'); }
    if (document.documentElement) delCls(document.documentElement, 'tr-fs-lock');
    paint();
  }

  /* 用户给的开关（名字照抄）：没全屏就进，已全屏就退 */
  window.toggleFullScreen = function () {
    var b = box(); if (!b) return;
    if (fsEl() || hasCls(b, 'tr-fs-pseudo')) exit(); else enter();
  };

  /* ESC / 手势退出全屏也要把样式和横屏锁收回（fullscreenchange 是唯一可靠时机） */
  function onFsChange() {
    var b = box();
    if (!fsEl()) {
      unlockOrientation();
      if (b) { delCls(b, 'tr-fs-pseudo'); delCls(b, 'tr-fs-on'); }
      if (document.documentElement) delCls(document.documentElement, 'tr-fs-lock');
    }
    paint();
    /* 进和出都补画一次：进出时视口宽度变了（横屏 667 vs 竖屏 375），
       420px 那条媒体查询会让「开出」那一列显隐，补画保证连线还压准格子 */
    redrawSoon();
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  document.addEventListener('mozfullscreenchange', onFsChange);
  document.addEventListener('MSFullscreenChange', onFsChange);

  function bindBtn(btn) {
    btn.addEventListener('touchstart', function (ev) {
      var t = ev && ev.touches && ev.touches[0];
      if (t) { START_X = t.clientX; START_Y = t.clientY; }
    }, { passive: true });

    /* 手指点：自己判位移（>8px 当滑动，不切全屏），自己 preventDefault 挡补发 click */
    btn.addEventListener('touchend', function (ev) {
      TOUCH_AT = Date.now ? Date.now() : 0;
      var t = ev && ev.changedTouches && ev.changedTouches[0];
      if (t && (Math.abs(t.clientX - START_X) > 8 || Math.abs(t.clientY - START_Y) > 8)) return;
      if (ev && ev.cancelable && ev.preventDefault) ev.preventDefault();
      window.toggleFullScreen();
    });

    btn.addEventListener('click', function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      if (TOUCH_AT && (Date.now ? Date.now() : 0) - TOUCH_AT < 800) return;
      window.toggleFullScreen();
    });

    /* 键盘也能用（role=button + tabindex=0 的配套） */
    btn.addEventListener('keydown', function (ev) {
      var k = ev && ev.key;
      if (k === 'Enter' || k === ' ' || k === 'Spacebar' ||
          (ev && ev.keyCode === 13) || (ev && ev.keyCode === 32)) {
        if (ev.preventDefault) ev.preventDefault();
        window.toggleFullScreen();
      }
    });
  }

  function mount() {
    var bars = document.querySelectorAll('[data-tr-toolbar]');
    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      if (bar.querySelector('.btn-fullscreen')) continue;
      var btn = document.createElement('div');
      btn.className = 'btn-fullscreen';
      btn.setAttribute('data-tr-fsbtn', '1');
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('title', '全屏看走势图（再点一下退出，ESC 也能退）');
      btn.textContent = '⛶ 点击全屏';
      bindBtn(btn);
      bar.appendChild(btn);
    }
    paint();
  }

  mount();
})();
`;

function addTrendFullscreen(frag) {
  let out = String(frag);
  const anchor = '<div class="ro-trend-embed" data-tr-embed="1"';
  if (out.indexOf(anchor) < 0) {
    throw new Error('⛶ 全屏：走势图片段里找不到根容器，无法注入 id（build-trend.mjs 的输出变了？）');
  }
  out = out.replace(anchor, anchor + ' id="trendFullscreenContainer"');
  out += '\n<style>\n' + TREND_FS_CSS + '\n</style>\n<script>\n' + TREND_FS_JS + '\n</script>\n';
  const need = [
    ['id="trendFullscreenContainer"', '全屏容器 id'],
    ['btn-fullscreen', '按钮类名'],
    ['window.toggleFullScreen = function', '开关函数'],
    ['fullscreenchange', 'fullscreenchange 监听'],
    ['data-tr-fsbtn', '按钮标记属性']
  ];
  for (const [k, label] of need) {
    if (out.indexOf(k) < 0) throw new Error(`⛶ 全屏注入失败：缺 ${label}（${k}）`);
  }
  /* 铁律自检：不准往片段里塞裸 button / alert / 内联 onclick */
  if (/<button/i.test(TREND_FS_CSS + TREND_FS_JS)) throw new Error('⛶ 全屏：注入内容里出现了裸 button 标签');
  if (/\balert\s*\(/.test(TREND_FS_JS)) throw new Error('⛶ 全屏：注入内容里出现了 alert()');
  if (/\bonclick\s*=/i.test(TREND_FS_CSS + TREND_FS_JS)) throw new Error('⛶ 全屏：注入内容里出现了内联 onclick');
  return out;
}
const trendHtmlFull = addTrendFullscreen(trendHtml);
console.log('  · 走势图全屏：每个彩种工具栏右端 1 颗「⛶ 点击全屏」· div role=button（裸 button 仍 0）'
  + ` · 注入后 ${(Buffer.byteLength(trendHtmlFull, 'utf8') / 1024).toFixed(1)} KB`);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- 【禁止缓存】手机浏览器（尤其微信内置）会缓存很久，
     加上这些标记后每次都会取最新的，避免「App 更新了网页还是旧的」 -->
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
<meta http-equiv="Pragma" content="no-cache" />
<meta http-equiv="Expires" content="0" />
<!-- ============================================================
     【分享卡片 / 图标 / PWA】
       · 标题固定为「春风彩票」（用户指定）
       · og:image 必须是【绝对 URL】—— 微信 / QQ / Twitter 抓的是绝对地址，
         相对路径它们抓不到
       · 图标文件由 make-icons.mjs 分发到站点根目录，云端 cloud-build.mjs
         再拷进 out/，最后随 site/ 一起发布
     ============================================================ -->
<title>春风 - 综合数据平台</title>
<meta name="description" content="春风：免费提供双色球、大乐透推荐号、GPT摇号、走势图、足球推单等综合服务。仅供娱乐参考，不构成购彩建议；未成年人不得购买彩票。" />
<meta name="format-detection" content="telephone=no" />
<!-- 微信 / QQ 兼容标签（用户 2026-10-18 给的文案；image 必须是绝对地址，用站点根的 share.png） -->
<meta itemprop="name" content="网页浏览需要浏览器" />
<meta itemprop="description" content="资料免费参考；参考大地，详细资料均免费" />
<meta itemprop="image" content="https://chunfengww2026.github.io/chunfeng-lottery/share.png" />
<link rel="icon" type="image/svg+xml" href="icon.svg" />
<link rel="icon" type="image/x-icon" href="favicon.ico" />
<link rel="shortcut icon" href="favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png" />
${PWA_HEAD}
<meta name="application-name" content="春风彩票" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="春风" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="mobile-web-app-capable" content="yes" />
<!-- 分享卡片：微信 / QQ / 微博 / Twitter / Facebook 都读这些
     ⚠️ 用户 2026-10-18 给了文案（og:title / og:description / itemprop），照此落地；
        og:image 必须是【完整绝对地址】，指向站点根目录的 share.png（1200×630）。 -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="春风" />
<meta property="og:title" content="网页浏览需要浏览器" />
<meta property="og:description" content="资料免费参考；参考大地，详细资料均免费" />
<meta property="og:image" content="https://chunfengww2026.github.io/chunfeng-lottery/share.png" />
<meta property="og:image:secure_url" content="https://chunfengww2026.github.io/chunfeng-lottery/share.png" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="春风 —— 彩票球图标与页面标题" />
<meta property="og:url" content="https://chunfengww2026.github.io/chunfeng-lottery/" />
<meta property="og:locale" content="zh_CN" />
<!-- 微信 / QQ 专用的兼容标签 → 已挪到 head 开标签靠前的位置（和 title 在一起），
     这里不再重复，避免 itemprop 出现两套（实测会导致微信读到旧文案）。
     ⚠️ 这里别写字面的 head 标签（开标签或收尾标签）：页面里只要出现第二个，
        export-site.mjs 的注入就会插错位置（历史上整段 CSS 被塞进注释里）。 -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="网页浏览需要浏览器" />
<meta name="twitter:description" content="资料免费参考；参考大地，详细资料均免费" />
<meta name="twitter:image" content="https://chunfengww2026.github.io/chunfeng-lottery/share.png" />
<meta name="twitter:image:alt" content="春风 —— 彩票球图标与页面标题" />
<style>
${css}
${hitSecCss}

/* ============================================================
   只读分享版专用样式
   ============================================================ */
body {
  display: block !important;
  background: #0f1115;
  zoom: 1 !important;
  opacity: 1 !important;
  padding: 0;
}
.ro-wrap {
  max-width: 820px;
  margin: 0 auto;
  padding: 16px 12px 60px;
}
.ro-top {
  text-align: center;
  padding: 22px 0 26px;
}
.ro-top h1 {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 3px;
  background: linear-gradient(90deg, #ff5f6d, #ffc371, #47e0a0, #4facfe, #a78bfa);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.ro-top .sub {
  font-size: 12.5px;
  color: #6b7488;
  margin-top: 8px;
  letter-spacing: 0.5px;
}
/* 【已移除】标题下面那行「日期 · 共 N 个彩种 / M 张图」（用户要求删掉）。
   body 上的构建时间属性仍然保留 —— 自愈脚本靠它判断页面新旧，
   它只是不可见属性，不再渲染成页面上的可见文字。 */

/* ---- 更新状态条 ---- */
.ro-status {
  border-radius: 12px;
  padding: 15px 17px;
  margin-bottom: 26px;
  border: 1px solid;
  line-height: 1.7;
}
.ro-status.ok {
  background: rgba(71, 224, 160, 0.07);
  border-color: rgba(71, 224, 160, 0.3);
}
.ro-status.warn {
  background: rgba(240, 180, 41, 0.08);
  border-color: rgba(240, 180, 41, 0.32);
}

.ro-st-head {
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.ro-status.ok .ro-st-head { color: #47e0a0; }
.ro-status.warn .ro-st-head { color: #f0b429; }

.ro-st-dot {
  width: 9px; height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ro-status.ok .ro-st-dot {
  background: #47e0a0;
  box-shadow: 0 0 0 4px rgba(71, 224, 160, 0.18);
}
.ro-status.warn .ro-st-dot {
  background: #f0b429;
  box-shadow: 0 0 0 4px rgba(240, 180, 41, 0.18);
}

/* 用户 2026-10-18：「所有资料均在下方」旁边提示「请滑到底」 */
.ro-st-slide { font-style: normal; font-size: 11px; color: #1a8c5a; margin-left: 6px; opacity: .9; }
.ro-st-time { font-size: 12px; color: #8b93a1; }
.ro-st-reason { font-size: 12.5px; color: #d9c08a; margin-top: 4px; }
.ro-st-hint { font-size: 11.5px; color: #6b7488; margin-top: 4px; }

.ro-st-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 14px;
  margin-top: 10px;
}
.ro-st-item { font-size: 12px; color: #8b93a1; }
.ro-st-date{font-style:normal;color:#8b949e;font-size:11px;margin-left:5px;opacity:.9}
.ro-st-item b { color: #c8cfda; font-weight: 600; }

/* ---- 分隔条 ---- */
.ro-divider {
  display: flex; align-items: center; gap: 14px;
  margin: 34px 0 26px;
}
.ro-divider::before, .ro-divider::after {
  content: ''; flex: 1; height: 1px; background: #262d3a;
}
.ro-divider span {
  font-size: 13px; color: #6b7488; letter-spacing: 2px; white-space: nowrap;
}

/* 【已移除】竞彩卡片样式（.j-stat / .j-card / .j-odds / .j-reco …）
   足球内容移到独立的「足球竞彩」页，分享页不再需要这套样式。 */

.ro-game {
  margin-bottom: 40px;
  padding-bottom: 30px;
  border-bottom: 1px solid #1e2430;
}
.ro-game:last-child { border-bottom: none; }

.ro-gamehead { margin-bottom: 14px; }
.ro-gamehead h2 {
  font-size: 20px;
  font-weight: 700;
  color: #e8eaed;
  margin-bottom: 6px;
}
.ro-meta { font-size: 12px; color: #6b7488; }

.ro-drawblock {
  background: #161a21;
  border: 1px solid #262d3a;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
}
.ro-drawlabel { font-size: 12px; color: #6b7488; margin-bottom: 10px; }
.ro-balls { display: flex; flex-wrap: wrap; gap: 7px; }
.ro-ball {
  width: 30px; height: 30px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  font-size: 12.5px; font-weight: 700; color: #fff;
  background: linear-gradient(180deg, #f0575c, #d32f34);
  font-family: Arial, sans-serif;
}
/* 【颜色区分】用户要求：「开奖的蓝球要区分出来」
   红球 = 红，蓝球/后区/特别号 = 蓝。 */
.ro-ball.red  { background: linear-gradient(180deg, #f0575c, #d32f34); }
/* 【用户 2026-10-20「篮球后区推荐记得带上球的图标明显一点」· 只双色球/大乐透】
   蓝球/后区/特别号：做出球感（左上亮 → 右下深）+ 白字加粗 + 内阴影。
   对比度：白字/深蓝底 ≥ 5.7:1（WCAG AA）。红球不动。 */
.ro-ball.blue, .ball.blue, .tv-ball.blue, .px9-ball.blue, .jz-ball.blue {
  background: radial-gradient(circle at 32% 26%, #5b8ff9 0%, #2b62d6 48%, #1748a8 100%) !important;
  color: #fff !important;
  font-weight: 800 !important;
  box-shadow: inset 0 -2px 4px rgba(0, 0, 0, .22), 0 1px 3px rgba(20, 60, 160, .35) !important;
  text-shadow: 0 1px 1px rgba(0, 0, 0, .30) !important;
}

/* ============================================================
   【手机目录表格 · 方案 D】 + 【全屏查看层 ro-mob-view】样式
   ------------------------------------------------------------
   目录表格：只在窄屏（<=1365px）显示；宽屏（>=1366px）隐藏 ——
     宽屏本来就有 5 组并排，不需要目录。
   全屏查看层：点目录格子才打开，图片本身【不绑点击】。
   注意：这一层叫 ro-mob-view，跟已经被用户要求删掉的「图片放大器」
   （那个遮罩层）不是同一个东西，页面里放大器那条链路
   （遮罩层类名 / 光标放大类名 / 放大镜图标）至今仍然是 0 处。
   ============================================================ */
.ro-imgtoc-wrap { display: none; }

/* ============================================================
   【手机只留目录】__HIDE_MOB_IMAGES__
   ------------------------------------------------------------
   用户原话：「云端推荐下面全部不要了 应为推荐图目录已经有了」
   用户选择：只手机上去掉（电脑上保留 5 组并排）。

   做法：窄屏把「推荐图」分节标题 + 每个彩种区块隐藏起来，
         让页面打开就是【目录表格】；点格子全屏看那张图。
   ⚠️ 用 display:none，不是从 DOM 删 —— 全屏层点开时会把原图搬进去，
      搬完再量尺寸，所以隐藏不影响显示。
   ============================================================ */
@media (max-width: 1365px) {
  .ro-divider { display: none !important; }
  /* ⚠️ 关键：最新开奖 <section class="ro-game" id="ro-latest"> 也在 .ro-game 里！
     所以要 :not(#ro-latest)，否则会把【最新开奖】一起隐藏掉。
     用户明确说过：「别误删我的最新开奖 我只是想隐藏下面推送的图」。 */
  .ro-game:not(#ro-latest) { display: none !important; }
}
          /* 宽屏：不显示目录 */

/* 【用户要求】「彩票推荐图」那个分节标题栏整条去掉（原话：「画框的不要了」）。
   它下面那块在手机上是隐藏的（见 __HIDE_MOB_IMAGES__），
   所以这条标题没有存在意义 —— 全局隐藏。 */
.ro-divider { display: none !important; }

/* 页面平滑滚动（只为了让「目录锚点」跳转更顺；不影响别的） */
html { scroll-behavior: smooth; }

@media (max-width: 1365px) {
  .ro-imgtoc-wrap {
    display: block;
    background: #161a21;
    border: 1px solid #2a323f;
    border-radius: 12px;
    padding: 14px 12px 12px;
    margin-bottom: 24px;
  }
  .ro-imgtoc-head { text-align: center; margin-bottom: 10px; }
  /* 用户 2026-10-18：「推荐目录旁边打上（）加内容：人工计算」 */
.ro-imgtoc-note { font-style: normal; font-size: 11px; font-weight: 400; color: #a89a80; margin-left: 2px; white-space: nowrap; }
.ro-imgtoc-title { font-size: 15px; font-weight: 700; color: #e8eaed; letter-spacing: 1px; }
  .ro-imgtoc-sub { font-size: 11.5px; color: #8b93a1; margin-top: 3px; }

  /* ============================================================
   ★★★ 用户锁定区 · 推荐图目录（10 格）· 2026-10-19 ★★★
   用户原话：「排成三排 ... 以后不管怎么样都不要动我这里的」
   最终确认的排法：一排 2 个（2+2+2+2+2）
   ⚠️ 任何人/任何窗口改到这里之前先问用户，不要自作主张动它。
   ⚠️ 下面的 width:50% 就是「一排 2 个」的实现，别改。
   ============================================================ */
.ro-imgtoc { width: 100%; border-collapse: collapse; }
  .ro-imgtoc td { padding: 3px; width: 50% !important; }

  /* 浅色格子（浅红/白底 + 深色字），手机上对比度看得清 */
  .ro-toc-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 46px;
    padding: 9px 6px;
    box-sizing: border-box;
    border: 1px solid #f0c9cb;
    border-radius: 9px;
    background: #fff6f6;
    color: #b3262b;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
    text-align: center;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
    transition: background .12s, transform .08s;
  }
  .ro-toc-cell:active { background: #ffe3e4; border-color: #e8a7aa; transform: scale(0.97); }

  /* JS 还没跑完（或挂了）→ 目录不显示，避免出现「点了没反应」的死格子。
     页尾脚本跑完会把 body 上这个标记去掉。 */
  body.ro-toc-pending .ro-imgtoc-wrap { display: none; }
}

/* ---- 全屏查看层（手机目录点开的那一张） ---- */
body.ro-mob-open { overflow: hidden; }

.ro-mob-view { position: fixed; inset: 0; z-index: 9999; background: #0b0d11; }
.ro-mob-view[hidden] { display: none; }

.ro-mob-scroll {
  position: absolute;
  inset: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pinch-zoom;          /* 双指缩放：用户想放大看细节时能放大 */
  padding: 54px 0 66px;
  box-sizing: border-box;
}

/* 缩放容器：宽/高都跟着 scale 同比放大，页面能滚到，不会把图裁掉 */
.ro-mob-holder { position: relative; background: #fff; border-radius: 6px; }

/* 【关键·修「点开看不全」】等比缩放：x / y 永远是同一个 scale ⇒ 图不变形。
   calcScale() 把 --ro-s 写在容器上，容器宽高同时乘它，纵横比和原图一模一样。

   这里踩过两个坑，都会让点开后看不全图，一起修掉：
   ① 图是被搬进一个中转盒（ro-imagewrap）再挂到容器上的，所以这里必须用
      【后代选择器】。原来写成「容器 > 图」（直接子元素）永远匹配不上，
      scale 一次都没生效，图按 760px 原尺寸塞进手机窄容器里 → 右边被切掉。
   ② 用 left:0 + transform-origin:top left 缩放：缩放后的可视范围正好等于容器
      的宽高（容器宽高也是同一个 scale 算出来的），天然对齐、不偏移。
      （原来 left:50% + translateX(-50%)，那个 -50% 是【缩放前】的宽度，
        图会被整体推向左：左边切掉、右边留白。）
   ③ 带上 !important 和三个类的高优先级：宽屏下网页 CSS 有一条
      @media (min-width:820px) 会把图上的 transform 强制成 none，
      不加优先级的话，在电脑浏览器上拉窄窗口点目录，照样会被切。
   ⇒ fit（打开时的默认档）整张图【宽、高都完整】，允许留白；
      real（点一下 1:1 放大）才允许超出视口、靠滚动看细节。 */
.ro-mob-view .ro-mob-holder .r-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 760px !important;
  min-width: 760px !important;
  max-width: 760px !important;
  margin: 0 !important;
  border-radius: 6px !important;
  transform-origin: top left;
  transform: scale(var(--ro-s, 1)) !important;
}

/* 中转盒在全屏层里只当一个壳：
   它的 overflow 绝对不能裁图（原来 overflow-x:auto 会把 760px 的图裁在手机屏宽处），
   阴影 / 外边距也不参与定位。 */
.ro-mob-holder > .ro-imagewrap {
  overflow: visible !important;
  margin: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

.ro-mob-x {
  position: absolute;
  top: 10px; right: 10px;
  z-index: 9;
  width: 38px; height: 38px;
  border-radius: 50%;
  background: rgba(22,26,33,.9);
  border: 1px solid #3a4354;
  color: #e8eaed;
  font-size: 20px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
}
.ro-mob-x:active { background: #2a323f; }

.ro-mob-tip {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  z-index: 9;
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
  text-align: center;
  font-size: 12px;
  color: #98a1b2;
  background: linear-gradient(180deg, rgba(6,8,12,0), rgba(6,8,12,.94));
  pointer-events: none;
}

/* 全屏看图 · 图片加载失败时的兜底提示（用户要求"别显示破图"）。
   定位和 .ro-mob-tip 错开，免得两行字叠在一起。 */
.ro-mob-err {
  position: absolute;
  left: 0; right: 0;
  bottom: 52px;
  z-index: 9;
  text-align: center;
  font-size: 12.5px;
  color: #e0a35c;
  padding: 0 16px;
  pointer-events: none;
}

/* 全屏看图 · 左上角计数器「第 N / M 张」（用户给的设计：counter 左上、close 右上）。
   只有相册模式才显示；pointer-events:none 不挡点击。 */
.ro-mob-count {
  position: absolute;
  left: 12px;
  top: calc(10px + env(safe-area-inset-top, 0px));
  z-index: 9;
  font-size: 12px;
  color: #c8cfda;
  padding: 4px 10px;
  border-radius: 14px;
  background: rgba(6, 8, 12, .72);
  border: 1px solid rgba(200, 207, 218, .22);
  pointer-events: none;
}
.ro-mob-count[hidden] { display: none; }

/* 推荐图容器
   【重要】图片必须保持 760px 设计宽度，内部布局一点都不能变，
   手机上靠 transform: scale() 整体等比缩小，
   这样看起来和 App 里一模一样，不会「变形」。 */
.ro-imagewrap {
  margin-bottom: 20px;
  border-radius: 12px;
  /* 兜底：万一 JS 没执行，可以横向滑动看完整图，而不是被裁掉 */
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  box-shadow: 0 4px 18px rgba(0,0,0,0.4);
  position: relative;
}
.ro-imagewrap .r-image {
  width: 760px !important;
  max-width: 760px !important;
  min-width: 760px !important;
  margin: 0 !important;
  border-radius: 0 !important;
  transform-origin: top left;
  will-change: transform;
}
/* 桌面端：不缩放时居中 */
@media (min-width: 820px) {
  .ro-imagewrap .r-image { transform: none !important; }
}

/* ============================================================
   【关键】锁死推荐图的内部布局
   ------------------------------------------------------------
   媒体查询是按「屏幕宽度」判断的。手机上 (<=700px) styles.css 里
   这些规则会被激活，把图片内部重新排版：
       .r-twocol   { flex-direction: column }        左右并排 → 上下堆叠
       .r-ranklist { grid-template-columns: 1fr }    热号排行 → 竖列
   结果就是网页和 App 长得不一样（用户说的「变形」）。

   这里用更高优先级 + !important 锁死，让图片永远保持设计布局，
   手机上靠整体等比缩放来适配。
   ============================================================ */
.ro-imagewrap .r-twocol    { flex-direction: row !important; }
.ro-imagewrap .r-ranklist  { grid-template-columns: repeat(3, minmax(0,1fr)) !important; }
.ro-imagewrap .r-headtitle { font-size: 22px !important; }
.ro-imagewrap .r-inlinefoot { flex-wrap: wrap !important; }
.ro-imagewrap .r-calrow    { flex-wrap: wrap !important; }
.ro-imagewrap .r-calbadges { flex-wrap: wrap !important; }

/* ============================================================
   【口口·两张图左右放】推荐图两两并排
   ------------------------------------------------------------
   用户原话：「我要的模板是两张图左右放，两张图一个版面比如：口口 这样的
     我要的是双色球的两个资料这样布局，大乐透也是
     排三和排五 七星彩和七乐彩这样的布局 快乐8和3D是这样布局」

   配对（左侧 / 右侧）：
     ① 双色球 main  / 双色球 wuxing   （同一个彩种的两张图）
     ② 大乐透 main  / 大乐透 wuxing   （同一个彩种的两张图）
     ③ 排列3        / 排列5
     ④ 七星彩       / 七乐彩
     ⑤ 福彩3D       / 快乐8            （用户先说过「3D左边」）

   ⚠️ 只在【外层容器】上排，推荐图本身【一个字都没改】：
      · 仍然靠 fit() 的 transform: scale(等比) 适配 —— 图不会变形
      · 手机等窄屏：图横向放不下，按容器宽度整体等比缩小（不是变形、不裁切）

   为什么宽屏也要缩一点点：两张图一共 760×2 = 1520px + 间距，
   1920px 屏幕上左右各留 20px 之后只剩 1880px，本来就够；
   于是把每栏设成「各占一半」，fit() 量到 ~930px/栏 ⇒ scale≈1.22（放大，更清楚）。
   窄屏（手机）每栏只有约 175px ⇒ scale≈0.23，图会很小 ——
   这是「两张 760px 的图并排」的必然结果，用户已知情（他要的就是这个版式）。
   ============================================================ */
.ro-imagepair { display: block; }          /* 默认：不并排，两张图照旧上下排 */
@media (min-width: 1366px) {
  /* 1366 起才并排：再窄就真的看不清了（每栏 < 650px ⇒ scale < 0.86） */
  .ro-imagepair {
    display: grid;
    grid-template-columns: 1fr 1fr;        /* 各占一半，fit() 按每栏实测宽度缩放 */
    gap: 20px;
    align-items: start;
    margin-bottom: 20px;
  }
  /* 网格项默认 min-width:auto 会被 760px 的图撑破 → 显式归零 */
  .ro-imagepair > .ro-imagewrap { min-width: 0; margin-bottom: 0; }
  /* 并排时不留出「横向滑动」的余地：宽度已经由 fit() 精确适配 */
  .ro-imagepair > .ro-imagewrap { overflow-x: hidden; }
}

/* ============================================================
   【点击放大】鼠标光标提示
   ------------------------------------------------------------
   用户原话：「双色球推的图一边一个 可以单独点开图片变大」
   用户原话：「图片点击可以放大 就是放大一张完成的图弹出来 在点击就变小
             不需要有个放大镜图标」
   → 【放大镜图标已删除】。只留下  这个纯光标提示
     （不是图形/图标，页面上看不到任何放大镜）。
   ============================================================ */
.ro-imagewrap {  }

/* 【点击放大】CSS 已移除。 */
/* 【点击放大】CSS 已移除。 */
/* 【关闭按钮 × 的样式已删除】—— 现在遮罩里点任何地方都能关闭，
   不再需要右上角那个按钮。 */
.ro-lb-bar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 2;
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
  text-align: center;
  font-size: 12px;
  color: #98a1b2;
  background: linear-gradient(180deg, rgba(6,8,12,0), rgba(6,8,12,0.9));
  pointer-events: none;
}

.ro-foot {
  text-align: center;
  padding: 30px 16px 50px;
  /* __BIG_DISCLAIMER__ 用户要求：字体大一点 */
  font-size: 14.5px;
  color: #6b7688;
  line-height: 2;
}

/* ---- 免责声明（页面最底部，独立区块）----
   低调但清晰可读：小字号 + 灰色系，跟暗色主题一致；
   不是弹窗 / 遮罩，不打断阅读。 */
.ro-disclaimer {
  max-width: 640px;
  margin: 0 auto 40px;
  padding: 16px 18px;
  background: #12151b;
  border: 1px solid #1e2430;
  border-radius: 10px;
  color: #9aa3b2;
  font-size: 14.5px;   /* 用户要求：字体大一点 */
  line-height: 1.95;
  text-align: left;
}
.ro-disclaimer h3 {
  /* __BIG_DISCLAIMER__ 用户要求：字体大一点 */
  font-size: 15.5px;
  font-weight: 700;
  color: #9aa3b2;
  letter-spacing: 2px;
  margin-bottom: 7px;
}
.ro-disclaimer p { margin: 0; }
.ro-disclaimer p + p { margin-top: 4px; }

/* ============================================================
   __CENTER_HEAD2__ 三个区块标题【强制居中】（用户第二次要求）
   ------------------------------------------------------------
   上一次加的规则被同文件里【后面】的 .ro-xysp-head / .ro-art-head
   原规则覆盖了（同优先级，后者胜）—— 所以这次：
     · 放在 CSS 靠后的位置（顺序靠后）
     · 加 !important（权重拉满）
   只影响这三个区块。
   ============================================================ */
.ro-xysp-head, .ro-art-head, .hit-embed .ro-gamehead {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
  gap: 3px !important;
}
.ro-xysp-h2, .ro-art-title, .hit-embed .ro-gamehead h2 {
  text-align: center !important;
  width: 100% !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
.ro-xysp-sub, .ro-art-sub, .hit-embed .ro-gamehead .ro-meta {
  text-align: center !important;
  width: 100% !important;
  line-height: 1.5 !important;
}
/* 晒票栏右侧那个「展开 ▸」在纵向布局里要自己居中 */
.ro-xysp-arrow { margin: 4px auto 0 !important; }

/* __LATEST_CENTER__ 「最新开奖」标题也要居中。
   上一次我写的是 .hit-embed .ro-gamehead —— 但实际结构是
   <section class="ro-game" id="ro-latest"><div class="ro-gamehead">，
   【没有 .hit-embed 父级】，所以没匹配上。
   这里改成 #ro-latest .ro-gamehead，并把裸 .ro-gamehead 也带上兜底。 */
#ro-latest .ro-gamehead, .ro-gamehead {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
  gap: 3px !important;
}
#ro-latest .ro-gamehead h2, .ro-gamehead h2 {
  text-align: center !important;
  width: 100% !important;
  margin-left: auto !important;
  margin-right: auto !important;
  margin-bottom: 0 !important;
}
#ro-latest .ro-gamehead .ro-meta, .ro-gamehead .ro-meta {
  text-align: center !important;
  width: 100% !important;
  line-height: 1.5 !important;
}

/* 手机上：只收窄页面留白，
   【绝对不改图片内部布局】—— 图片靠 JS 等比缩放 */
@media (max-width: 600px) {
  .ro-wrap { padding: 8px 4px 40px; }
  .ro-top h1 { font-size: 21px; }
}

/* ============================================================
   【文章参考】区块样式（用户新增需求）
   ------------------------------------------------------------
   跟页面现有暗色风格一致（复用 #161a21 / #262d3a / #e8eaed 这套配色）。
   窄屏：一列一列竖着排（每个彩种一块）
   宽屏：自适应并排（容器最宽 820px → 最多 3 列，不挤）
   这里不碰任何图片相关选择器。
   ============================================================ */
.ro-articles {
  background: #12161d;
  border: 1px solid #1e2430;
  border-radius: 12px;
  padding: 15px 13px 13px;
  margin: 0 0 26px;
}
.ro-art-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-bottom: 12px;
}
.ro-art-title {
  font-size: 17px;
  font-weight: 700;
  color: #e8eaed;
  letter-spacing: 2px;
}
.ro-art-sub { font-size: 11.5px; color: #6b7488; }
/* 【335px 窄屏】用户 2026-10-18：小屏幕上「文章参考」标题和副标题挤在一起换行难看 →
   窄屏改成上下两行（标题一行、副标题一行），标题缩一点字距，不横向溢出。 */
@media (max-width: 360px) {
  .ro-art-head { flex-direction: column; align-items: flex-start; gap: 2px; }
  .ro-art-title { font-size: 16px; letter-spacing: 1px; }
  .ro-art-sub { font-size: 11px; }
}

/* ============================================================
   __CENTER_HEAD__ 三个区块标题【居中】+ 去掉副标题重叠
   ------------------------------------------------------------
   用户要求：「居中」（截图圈了 晒票栏 / 最新开奖 / 文章参考）。
   原来的写法是 display:flex + align-items:baseline + flex-wrap:wrap，
   窄屏时副标题会被挤到标题同一行、甚至压在上面 —— 一并修掉。
   只影响这三个区块，别处不动。
   ============================================================ */
.ro-xysp-head, .ro-art-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 3px;
}
.ro-xysp-h2, .ro-art-title { text-align: center; }
.ro-xysp-sub, .ro-art-sub { text-align: center; line-height: 1.5; }

/* 「最新开奖」标题 —— 实际结构是 .hit-embed .ro-gamehead > h2 + .ro-meta
   （latest-draws.js 生成，本次不改它的生成逻辑，只用 CSS 摆正）
   原来 .ro-gamehead 是 flex + align-items:center + flex-wrap:wrap，
   窄屏会把 h2 和两行 meta 挤在一起、互相压住 —— 改成纵向居中排布。 */
.hit-embed .ro-gamehead {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 3px;
}
.hit-embed .ro-gamehead h2 { text-align: center; width: 100%; margin-bottom: 0; }
.hit-embed .ro-gamehead .ro-meta { text-align: center; line-height: 1.5; width: 100%; }

.ro-art-groups { display: grid; gap: 10px; grid-template-columns: 1fr; }
@media (min-width: 560px) {
  .ro-art-groups { grid-template-columns: repeat(auto-fit, minmax(226px, 1fr)); }
}

.ro-art-group {
  background: #161a21;
  border: 1px solid #262d3a;
  border-radius: 11px;
  padding: 10px 11px 8px;
  min-width: 0;
}
.ro-art-gname {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #c8cfda;
  padding-bottom: 6px;
  margin-bottom: 7px;
  border-bottom: 1px solid #212836;
}
.ro-art-gname i {
  font-style: normal;
  font-size: 10.5px;
  font-weight: 400;
  color: #5b6373;
}

.ro-art-list { list-style: none; margin: 0; padding: 0; }
.ro-art-list li { margin-bottom: 7px; }
.ro-art-list li:last-child { margin-bottom: 0; }
.ro-art-link {
  display: block;
  font-size: 12.5px;
  line-height: 1.45;
  color: #8fb8ff;
  text-decoration: none;
  word-break: break-word;
  -webkit-tap-highlight-color: transparent;
}
.ro-art-link:hover, .ro-art-link:active { color: #bcd4ff; text-decoration: underline; }
.ro-art-meta { margin-top: 1px; }
.ro-art-author { font-size: 10.5px; color: #5f6878; margin-right: 8px; }
.ro-art-date { font-size: 10.5px; color: #5f6878; }
.ro-art-empty { font-size: 12px; color: #6b7488; padding: 2px 0 3px; }

/* __GROUP_COL__ 分组可收起的样式（details/summary 原生折叠） */
.ro-art-group > summary.ro-art-gname {
  display: flex; align-items: center; gap: 8px;
  cursor: pointer; list-style: none; user-select: none;
}
.ro-art-group > summary.ro-art-gname::-webkit-details-marker { display: none; }
.ro-art-group > summary.ro-art-gname::marker { content: ''; }
.ro-art-tip { margin-left: auto; font-size: 11px; font-weight: 400; color: #8fb8ff; opacity: .85; }
.ro-art-group[open] > summary.ro-art-gname .ro-art-tip::after { content: '点击收起'; }
.ro-art-group:not([open]) > summary.ro-art-gname .ro-art-tip::after { content: '点击查看'; }
.ro-art-group:not([open]) > summary.ro-art-gname { margin-bottom: 0; }

/* —— 文章参考 · 正文（点标题原地展开阅读）——
   用户原话：「微信把 yiqicai.com 拉黑了，点链接跳过去打不开
             → 要把正文抓到我们页面上」。
   默认全部收起：正文 display:none，只有 [data-ro-art] 那一块被 .ro-art-item.ro-art-open
   命中才显示。展开/收起由页尾那一小段脚本切 class，不刷新、不跳转。
   正文用纯文本段落，行高 1.8、字号 14.5px，跟页面暗色风格一致。 */
.ro-art-body {
  display: none;
  margin: 7px 0 3px;
  padding: 9px 10px 7px;
  background: #12161d;
  border-left: 2px solid #2f80ed;
  border-radius: 0 8px 8px 0;
}
.ro-art-item.ro-art-open .ro-art-body { display: block; }
.ro-art-p {
  margin: 0 0 9px;
  font-size: 14.5px;
  line-height: 1.8;
  color: #d5dae3;
  word-break: break-word;
}
.ro-art-p:last-of-type { margin-bottom: 4px; }
.ro-art-img { margin: 0 0 9px; }
.ro-art-body img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 7px;
  background: #1b2029;
}
.ro-art-note {
  margin: 6px 0 0;
  font-size: 10.5px;
  color: #5b6373;
  border-top: 1px solid #212836;
  padding-top: 5px;
}
/* 没抓到正文的那一篇：标题照样能点（点开只是没有内容），
   给个淡一点的颜色，不误导成「点了有正文」。 */
.ro-art-item.ro-art-nobody .ro-art-link { color: #7d8797; }

/* ============================================================
   【晒票栏】区块样式（用户新增需求）
   ------------------------------------------------------------
   位置：紧跟【推荐图目录】(.ro-imgtoc-wrap) 之后。
   配色沿用页面现有暗色那套（#12161d / #161a21 / #262d3a / #e8eaed）。
   内容：展开后 = 一排彩种筛选 + 晒票图片网格（图片是图床外链）。
   【默认收起】用户原话：「晒票栏可以收起来要自动点」
     用原生 <details>/<summary>，折叠本身一行 JS 都不写：
       · <summary> = 标题那一行，点一下展开、再点收起（原生行为）
       · 默认三角用 list-style + ::-webkit-details-marker 去掉，
         换成右侧的纯 CSS 文字提示（展开 ▸ / 收起 ▾），随 [open] 变
       · <summary> 不是按钮标签 → 页面不变量「按钮标签数 = 0」不受影响
   列数：手机 2 列；>=620px 4 列。
   这里不碰任何已有图片选择器（ro-imagewrap / ro-imagepair / ro-mob-view）——
   点图放大走的就是页尾已有的 ro-mob-view 全屏层。
   ============================================================ */
.ro-xysp {
  background: #12161d;
  border: 1px solid #1e2430;
  border-radius: 12px;
  padding: 15px 13px 13px;
  margin: 0 0 26px;
}
/* 标题那一行就是 <summary>：整条都能点 */
/* ============================================================
   __MINI_CARD__ 缩小版横排卡片（用户要求：只改【晒票】和【GPT模型摇号】这两块）
   ------------------------------------------------------------
   用户原话：「区块标题改成缩小版卡片样式」，并选了方案 C：
     · 只改 .ro-xysp（晒票）和 .ro-aipick（GPT模型摇号）两个区块的 <summary>
     · 其它区块（最新开奖 / 文章参考 / 开机号 / 热力图 / 推荐图目录 / 竞彩页）
       【保持原来的纵向居中】，一个都不动
   样式：
     左：标题（15~16px 粗体）+ 副标题（11px 灰，单行省略号）
     右：「点击查看 / 点击收起」胶囊（12px，描边圆角）
   ⚠️ 颜色全用页面的变量（--ro-card / --ro-line / --ro-fg / --ro-ok），
      这样浅色主题那段覆盖会自动生效 —— 不要再写死颜色，否则浅色下会花。
   ⚠️ 「点击查看/点击收起」仍然是 CSS 伪元素按 [open] 切换（机制没变），
      标签仍然是 <summary>（不是裸 button）。
   ============================================================ */
.ro-xysp > .ro-xysp-head,
.ro-aipick > .ro-aipick-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--ro-card);
  border: 1px solid var(--ro-line);
  border-radius: 10px;
}
/* 晒票稍微突出一点（用户要求 primary 那种感觉） */
.ro-xysp > .ro-xysp-head {
  background: var(--ro-card);
  border-color: var(--ro-line);
}
/* 左边的标题+副标题竖排；副标题单行省略 */
.ro-xysp > .ro-xysp-head .ro-xysp-h2,
.ro-aipick > .ro-aipick-head .ro-aipick-h2 { font-size: 16px; letter-spacing: .5px; }
.ro-xysp > .ro-xysp-head .ro-xysp-sub,
.ro-aipick > .ro-aipick-head .ro-aipick-sub {
  font-size: 11px;
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 62vw;
}
/* 右侧胶囊：复用原来的 .ro-xysp-arrow / .ro-aipick-arrow（伪元素按 [open] 换字） */
.ro-xysp > .ro-xysp-head .ro-xysp-arrow,
.ro-aipick > .ro-aipick-head .ro-aipick-arrow {
  margin: 0 !important;
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 600;
  color: var(--ro-ok);
  border: 1px solid var(--ro-ok);
  border-radius: 14px;
  padding: 5px 10px;
  white-space: nowrap;
}
.ro-xysp > .ro-xysp-head .ro-xysp-arrow::after,
.ro-aipick > .ro-aipick-head .ro-aipick-arrow::after { content: ''; }

.ro-xysp-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  cursor: pointer;
  list-style: none;                 /* 去掉默认三角（标准写法） */
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}
.ro-xysp-head::-webkit-details-marker { display: none; }   /* 去掉默认三角（WebKit） */
.ro-xysp-head:hover .ro-xysp-h2, .ro-xysp-head:active .ro-xysp-h2 { color: #fff; }
.ro-xysp-head:focus-visible { outline: 2px solid #3a5a9c; outline-offset: 2px; border-radius: 6px; }

.ro-xysp-h2 {
  font-size: 17px;
  font-weight: 700;
  color: #e8eaed;
  letter-spacing: 2px;
}
.ro-xysp-sub { font-size: 11.5px; color: #6b7488; }

/* 右侧提示：文字 + 箭头都由 CSS 按 [open] 切换，不需要 JS */
.ro-xysp-arrow {
  margin-left: auto;
  font-size: 11.5px;
  font-weight: 600;
  color: #8fb8ff;
  white-space: nowrap;
}
.ro-xysp-arrow::before { content: '展开'; }
.ro-xysp-arrow::after { content: ' ▸'; }
.ro-xysp[open] .ro-xysp-arrow::before { content: '收起'; }
.ro-xysp[open] .ro-xysp-arrow::after { content: ' ▾'; }

/* 删掉上一版的「纯文字彩种格子」样式（.ro-xysp-grid / .ro-xysp-cell）——
   那一版是「点格子跳到源站晒票页」，已被用户否掉；
   现在展开后是下面的筛选条 + 图片网格。 */

/* ---- 晒票图片：筛选条 + 图片网格 + 卡片 ----
   用户要求：直接在页面里看晒票图（不跳转）、点图能放大看清号码。
   图片是【外链】（图床没有防盗链），所以这里只有排版样式，
   页面里不存图片本体。 */
.ro-xysp-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}
.ro-xysp-tab {
  flex: 0 0 auto;
  padding: 6px 11px;
  border: 1px solid #2a323f;
  border-radius: 999px;
  background: #161a21;
  color: #c8cfda;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.ro-xysp-tab:hover, .ro-xysp-tab:active { border-color: #3d5a86; color: #cfe0ff; }
.ro-xysp-tab.on { background: #1c2530; border-color: #3d5a86; color: #8fb8ff; }

/* 手机 2 列；宽屏 4 列（用户点名的排法） */
.ro-xysp-pics {
  display: grid;
  gap: 9px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 11px;
}
@media (min-width: 620px) {
  .ro-xysp-pics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

/* 被筛掉的卡片：脚本给它加 hidden 属性。
   ⚠️ 必须显式写 display:none —— 下面 .ro-xysp-pic 用了 display:block，
   会盖掉浏览器对 hidden 的默认隐藏，不加这条筛选就没效果。 */
.ro-xysp-pic[hidden] { display: none !important; }

.ro-xysp-pic {
  display: block;
  background: #161a21;
  border: 1px solid #2a323f;
  border-radius: 10px;
  overflow: hidden;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition: border-color .15s;
}
.ro-xysp-pic:hover, .ro-xysp-pic:active { border-color: #3d5a86; }

/* 缩略图：宽度铺满卡片、高度按原比例（票是长条，不裁切才看得到全貌）
   ⚠️ 占位底色原来是 #0f1218（深色主题遗留）。晒票图是【外部链接】（头条签名外链），
      加载中 / 某张挂了，米杏页面上就露一块黑 —— 线上实测 310 张全是黑底。
      改成米杏的沉底 --ro-sunken：加载中是米杏块，挂了也只是空一块，不刺眼。
      （用户 2026-10-17 决定：「改成米杏底色」） */
.ro-xysp-thumb {
  display: block;
  width: 100%;
  height: auto;
  min-height: 60px;
  background: var(--ro-sunken);
}

.ro-xysp-cap { display: block; padding: 5px 7px 6px; }
.ro-xysp-cap b { display: block; font-size: 11.5px; font-weight: 700; color: #8fb8ff; }
.ro-xysp-cap i {
  margin-top: 2px;
  font-style: normal;
  font-size: 10.5px;
  line-height: 1.35;
  color: #7a8394;
  word-break: break-word;
  /* 描述最多两行，卡片才不会被拉得高矮不齐 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ro-xysp-empty { margin-top: 12px; font-size: 12px; color: #6b7488; }
.ro-xysp-note { margin-top: 10px; font-size: 10.5px; color: #5f6878; }

/* ============================================================
   【ai选号】可折叠面板（位置：晒票栏下面、最新开奖上面）
   ------------------------------------------------------------
   用户原话：「晒票栏下面装一个机选的 可以操作随机机选各种彩票
             复式单式都可以机选 模拟选号 有个折叠小窗口 写上标题：ai选号」
   形态：<details> 默认收起（不带 open 属性），标题行就是 <summary>。
   交互：面板内部只有 <a role="button"> 和数字输入框（type=number），
         没有 button 标签（页面不变量「按钮标签数 = 0」）。
   成本：纯前端 Math.random()，不联网、不调 AI、不写任何存储。
   ⚠️ 这里没有任何图片 → 图位数量（data-image）不受影响。
   ============================================================ */
.ro-aipick {
  background: #12161d;
  border: 1px solid #1e2430;
  border-radius: 12px;
  padding: 15px 13px 13px;
  margin: 0 0 26px;
}
/* 标题那一行就是 <summary>：整条都能点 */
.ro-aipick-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  cursor: pointer;
  list-style: none;                 /* 去掉默认三角（标准写法） */
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}
.ro-aipick-head::-webkit-details-marker { display: none; }
.ro-aipick-head:hover .ro-aipick-h2, .ro-aipick-head:active .ro-aipick-h2 { color: #fff; }
.ro-aipick-head:focus-visible { outline: 2px solid #3a5a9c; outline-offset: 2px; border-radius: 6px; }
.ro-aipick-h2 {
  font-size: 17px;
  font-weight: 700;
  color: #e8eaed;
  letter-spacing: 2px;
}
.ro-aipick-sub { font-size: 11.5px; color: #6b7488; }
/* 右侧提示：文字 + 箭头都由 CSS 按 [open] 切换，不需要 JS */
.ro-aipick-arrow {
  margin-left: auto;
  font-size: 11.5px;
  font-weight: 600;
  color: #8fb8ff;
  white-space: nowrap;
}
.ro-aipick-arrow::before { content: '点击查看'; }
.ro-aipick-arrow::after { content: ' ▸'; }
.ro-aipick[open] .ro-aipick-arrow::before { content: '点击收起'; }
.ro-aipick[open] .ro-aipick-arrow::after { content: ' ▾'; }

.ro-aipick-body { margin-top: 12px; }
.ro-aipick [hidden] { display: none !important; }
.ro-aipick-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 9px;
}
.ro-aipick-lbl { flex: 0 0 auto; width: 34px; font-size: 12px; color: #8b93a1; }
.ro-aipick-tabs, .ro-aipick-kl8 { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
/* 【用户要求】「选号」「方式」两行里的选项按钮拉开一点间距（原来 7px 挤在一起）：
   gap 7 → 12px，按钮左右内边距 11 → 15px（手机上也好点）。只动间距，别的一律不变。 */
.ro-aipick-line-src .ro-aipick-tabs,
.ro-aipick-line-mode .ro-aipick-tabs { gap: 12px; }
.ro-aipick-line-src .ro-aipick-srcbtn,
.ro-aipick-line-mode .ro-aipick-segbtn { padding-left: 15px; padding-right: 15px; }
.ro-aipick-tab, .ro-aipick-kl8tab, .ro-aipick-segbtn, .ro-aipick-btn {
  flex: 0 0 auto;
  padding: 6px 11px;
  border: 1px solid #2a323f;
  border-radius: 999px;
  background: #161a21;
  color: #b9c2d0;
  font-size: 12px;
  line-height: 1.2;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}
.ro-aipick-tab:hover, .ro-aipick-kl8tab:hover,
.ro-aipick-segbtn:hover, .ro-aipick-btn:hover { border-color: #3d5a86; color: #cfe0ff; }
.ro-aipick-tab.on, .ro-aipick-kl8tab.on, .ro-aipick-segbtn.on {
  background: #1c2530;
  border-color: #3d5a86;
  color: #8fb8ff;
}
.ro-aipick-in {
  width: 58px;
  padding: 5px 7px;
  border: 1px solid #2a323f;
  border-radius: 8px;
  background: #0f1218;
  color: #e8eaed;
  font-size: 12.5px;
  text-align: center;
}
.ro-aipick-in:focus { outline: none; border-color: #3d5a86; }
.ro-aipick-unit { font-size: 11.5px; color: #6b7488; }
.ro-aipick-mwrap { display: inline-flex; align-items: center; gap: 4px; margin-right: 12px; }
.ro-aipick-rule { margin-top: 8px; font-size: 11.5px; line-height: 1.5; color: #7a8394; }
.ro-aipick-sum { margin-left: auto; font-size: 11.5px; color: #8fb8ff; }
.ro-aipick-warn { margin-top: 8px; font-size: 11.5px; line-height: 1.5; color: #f0b429; }
.ro-aipick-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.ro-aipick-btn { padding: 7px 14px; border-radius: 9px; font-size: 12.5px; font-weight: 600; }
.ro-aipick-btn.on { background: #1d2a3d; border-color: #3d5a86; color: #cfe0ff; }
.ro-aipick-btn.ghost { background: #14181f; color: #8b93a1; }
.ro-aipick-out { margin-top: 12px; border-top: 1px solid #1e2430; padding-top: 10px; }
.ro-aipick-empty { font-size: 11.5px; color: #6b7488; }
.ro-aipick-sumline { margin-bottom: 8px; font-size: 11.5px; color: #8fb8ff; }
.ro-aipick-hit { display: flex; align-items: center; flex-wrap: wrap; gap: 3px; margin: 0 0 6px; }
.ro-aipick-idx { flex: 0 0 auto; width: 44px; font-size: 10.5px; color: #5f6878; }
.ro-aipick-ball {
  display: inline-block;
  min-width: 22px;
  padding: 1px 4px;
  border-radius: 6px;
  background: #2a1c1f;
  color: #ff8b8b;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.ro-aipick-ball.blue { background: #16233a; color: #8fb8ff; }
.ro-aipick-sep { padding: 0 1px; font-size: 12px; color: #5f6878; }
/* 【数字彩·位置分隔】一条号码里，百位/十位/个位 各自的号用一个小点隔开
   （用户 2026-10-17：摇号一次只出一条，各位有几个号就画几个 —— 位置必须能分得清） */
.ro-aipick-possep { padding: 0 4px; font-size: 12px; color: #a2937c; }
.ro-aipick-more { margin-top: 6px; font-size: 11px; color: #5f6878; }
.ro-aipick-note { margin-top: 10px; font-size: 10.5px; line-height: 1.6; color: #5f6878; }

/* ---- 自己选号：号码格子（点一下选中，再点一下取消） ---- */
.ro-aipick-self { margin-top: 10px; }
.ro-aipick-pblock { margin-top: 11px; }
.ro-aipick-pblock:first-child { margin-top: 0; }
.ro-aipick-phead { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.ro-aipick-plabel { font-size: 12px; color: #b9c2d0; }
.ro-aipick-pcount { font-size: 11px; color: #6b7488; }
.ro-aipick-pcount.full { color: #47e0a0; }
.ro-aipick-grid { display: flex; flex-wrap: wrap; gap: 5px; }
.ro-aipick-pick {
  flex: 0 0 auto;
  min-width: 26px;
  padding: 5px 0;
  border: 1px solid #2a323f;
  border-radius: 7px;
  background: #161a21;
  color: #b9c2d0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}
.ro-aipick-pick:hover, .ro-aipick-pick:active { border-color: #3d5a86; color: #cfe0ff; }
.ro-aipick-pick.on { background: #3a1d22; border-color: #a34a4a; color: #ff8b8b; font-weight: 700; }
.ro-aipick-pick.blue.on { background: #16233a; border-color: #3d5a86; color: #8fb8ff; }
.ro-aipick-selfnote { font-size: 10.5px; color: #5f6878; }
.ro-aipick-mineline { align-items: center; }
.ro-aipick-mineout { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 3px; }
.ro-aipick-ball.empty { background: #171b22; color: #4d5666; font-weight: 400; }
.ro-aipick-shape { margin-top: 8px; font-size: 11.5px; line-height: 1.5; color: #8fb8ff; }

/* ============================================================
   __ANTISHOT__ 防截图锁定（用户给的升级版代码，适配到分享页）
   ------------------------------------------------------------
   用途（用户原话）：「就是只能我这个本机可以截屏，别人不能」。
   · html.locked → #article / #article-rest 模糊 + 灰度 + 不可点
   · 遮罩 #mask（z-index 99998）—— 【已按用户要求去掉水印层】
   · 豁免区 .ro-aipick 抬到 99999，locked 时仍然清晰、能点
   ⚠️ 遮罩设了 pointer-events:none：
      内容区本身已经 pointer-events:none（点不动），
      遮罩只负责视觉；这样锁定状态下还能滚到豁免面板去点。
   ⚠️ 这只能提高门槛，【不能真正禁止截图】—— 详见页尾脚本注释。
   ============================================================ */
#article, #article-rest { transition: filter .15s ease; position: relative; z-index: 1; }
html.locked #article, html.locked #article-rest {
  filter: blur(30px) grayscale(1);
  pointer-events: none;
}
#mask {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 99998;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 40px;
  background: rgba(0, 0, 0, .96);
  color: #fff;
  text-align: center;
  font-size: 20px;
  line-height: 1.8;
  pointer-events: none;              /* 见上面说明：让豁免面板还能点 */
}
html.locked #mask { display: flex; }
#mask .icon { margin-bottom: 20px; font-size: 64px; }
#mask .tip { margin-top: 16px; font-size: 14px; color: #aaa; }
/* 【已删除】原来这里有一层动态水印（整层 DOM + 样式 + 脚本）——
   用户明确说「不要水印」，已经整块拿掉，一点残留都不留。 */
/* 豁免区：locked 时抬到遮罩之上，保持清晰可点 */
html.locked .ro-aipick {
  filter: none !important;
  pointer-events: auto !important;
  position: relative;
  z-index: 99999 !important;
}
/* 全站禁止选中 / 长按菜单（面板里的输入框例外，否则不好用） */
body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
#ro-aipick input { -webkit-user-select: text; user-select: text; }
/* 管理员徽章（owner 才显示，用 <a href> 之外的元素 —— 不是按钮标签）
   ⚠️【2026-10-18 改：从 fixed 浮层改成 Tab 条下面的一行流内元素】
      原来是 position:fixed + top:10/right:10 + z-index:99999，
      实测正好压在 .top-tabs 的第二个 Tab「竞彩/足球」上（154×26 完全重叠），
      而它又是 pointer-events:none —— 点得到、看不见 → 本机看到的【只剩一个 Tab】。
      现在：不加 position、不加 z-index、不浮起来，就排在 Tab 条正下方、
      靠右对齐（width:max-content + margin-left:auto），谁也压不住、谁也压不住它。
      仍然只有 html.is-owner 才显示，别人的页面一个像素都不动。 */
#owner-badge {
  display: none;
  width: max-content;
  max-width: 100%;
  margin: 2px 0 2px auto;
  padding: 6px 12px;
  border: 1px solid #2f5c3a;
  border-radius: 999px;
  background: rgba(20, 40, 28, .92);
  color: #6ee7a0;
  font-size: 11.5px;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
}
html.is-owner #owner-badge { display: block; }
/* 打印也模糊（顺手加） */
@media print {
  #article, #article-rest { filter: blur(30px) grayscale(1) !important; }
  #mask { display: flex !important; }
}
/* ============================================================
   __NO_SAVE__ 资料图不允许任何人保存（右键另存 / 长按 / 拖拽 / 复制）
   ------------------------------------------------------------
   推荐图是 canvas 实时渲染的（本来就没有图片 URL），但还要堵：
     · iOS 长按菜单      → -webkit-touch-callout: none
     · 拖拽出去          → -webkit-user-drag: none
     · 右键另存 / 复制   → 页尾防截图脚本里 preventDefault（见 allowedTarget 白名单）
   ⚠️ 为什么不给 canvas 加 pointer-events:none：
      那样会连带影响「点图放大」这类点击；而且推荐图在页面里的入口是
      手机目录格子（.ro-toc-cell），图片本身没有任何点击绑定，
      所以只要拦事件 + 关长按菜单就够了，不必盖透明层。
   ⚠️ 只作用于 #article / #article-rest（资料区）；
      全屏层（body 直下）和豁免区（晒票 / GPT模型摇号）不受影响 ——
      晒票和摇号出的图是要能保存的。
   ============================================================ */
#article .ro-imagewrap canvas, #article-rest .ro-imagewrap canvas,
#article .ro-imagewrap img, #article-rest .ro-imagewrap img {
  -webkit-touch-callout: none;
  -webkit-user-drag: none;
  user-select: none;
  -webkit-user-select: none;
}

/* ============================================================
   【面板美化】用户要求「模板好看一点」（只改视觉：颜色 / 间距 / 圆角 /
   层次 / 字重 / 选中态；功能、文字、行为一个都没变）
   ------------------------------------------------------------
   放在面板基础样式【之后】—— 同优先级时后者胜；
   标题居中那一段带 !important，仍然由它说了算（顺序不影响）。
   分段控件 / 号码格子 / 预览卡片 / 按钮，四块统一到一套视觉语言。
   ============================================================ */
.ro-aipick {
  background: linear-gradient(180deg, #131822, #10141b);
  border: 1px solid #232b38;
  border-radius: 14px;
  padding: 16px 14px 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .25);
}
.ro-aipick-h2 { font-size: 18px; font-weight: 800; color: #eef2f8; letter-spacing: 2px; }
.ro-aipick-sub { letter-spacing: .4px; }
.ro-aipick-body { margin-top: 14px; }
.ro-aipick-line { gap: 8px; margin-top: 11px; }
.ro-aipick-lbl {
  width: 38px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: .5px;
  color: #9aa6b8;
}
/* ① 分段控件：选号（机选 / 自己选号）、方式（单式 / 复式） */
.ro-aipick-seg {
  display: inline-flex;
  align-items: center;
  padding: 3px;
  background: #0c1016;
  border: 1px solid #232b38;
  border-radius: 999px;
}
.ro-aipick-seg .ro-aipick-srcbtn,
.ro-aipick-seg .ro-aipick-segbtn {
  padding: 6px 18px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font-weight: 700;
}
.ro-aipick-seg .on {
  background: linear-gradient(180deg, #3d7bfa, #2b5fd9);
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .18), 0 2px 10px rgba(61, 123, 250, .35);
}
/* ② 彩种 / 玩法胶囊：选中 = 主题蓝实心 + 微光 */
.ro-aipick-tab, .ro-aipick-kl8tab, .ro-aipick-srcbtn, .ro-aipick-segbtn, .ro-aipick-btn {
  padding: 7px 13px;
  font-size: 12.5px;
  font-weight: 600;
  background: #151a22;
}
.ro-aipick-tab.on, .ro-aipick-kl8tab.on {
  background: linear-gradient(180deg, #3d7bfa, #2b5fd9);
  border-color: transparent;
  color: #fff;
  font-weight: 700;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .18), 0 2px 10px rgba(61, 123, 250, .35);
}
/* ③ 号码格子：grid + minmax（窄屏也不会溢出），格子更大更好点 */
.ro-aipick-pblock { margin-top: 14px; }
.ro-aipick-phead { margin-bottom: 8px; }
.ro-aipick-plabel { font-size: 12px; font-weight: 700; letter-spacing: .4px; color: #c3ccda; }
.ro-aipick-pcount { font-size: 11px; }
.ro-aipick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(38px, 1fr));
  gap: 6px;
}
.ro-aipick-pick {
  display: flex;
  align-items: center;
  justify-content: center;
  width: auto;
  min-width: 0;
  min-height: 34px;
  padding: 0;
  border: 1px solid #262f3d;
  border-radius: 9px;
  background: #141a23;
  color: #c3ccda;
  font-size: 13.5px;
  font-weight: 600;
}
.ro-aipick-pick:active { transform: translateY(1px); }
.ro-aipick-pick.on {
  border-color: transparent;
  background: linear-gradient(180deg, #e2564f, #c03a34);   /* 红球区：红 */
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .2), 0 2px 10px rgba(226, 86, 79, .35);
}
.ro-aipick-pick.blue.on {
  background: linear-gradient(180deg, #3d7bfa, #2b5fd9);   /* 蓝球 / 后区 / 特别位：主题蓝 */
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .2), 0 2px 10px rgba(61, 123, 250, .35);
}
/* ④ 按钮：主操作实心，次操作描边 */
.ro-aipick-acts { gap: 8px; margin-top: 14px; }
.ro-aipick-btn { padding: 8px 16px; border-radius: 10px; font-size: 13px; font-weight: 700; }
.ro-aipick-btn.on {
  background: linear-gradient(180deg, #3d7bfa, #2b5fd9);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 2px 10px rgba(61, 123, 250, .3);
}
.ro-aipick-btn.ghost { background: #151a22; }
/* ⑤ 号码预览卡片（自己选号）：注数 / 金额大字 */
.ro-aipick-card {
  margin-top: 12px;
  padding: 12px;
  background: #0c1016;
  border: 1px solid #1e2430;
  border-radius: 12px;
}
.ro-aipick-mineline { margin-top: 0; }
.ro-aipick-mineout { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 5px; min-height: 26px; }
.ro-aipick-ball {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
}
.ro-aipick-ball.empty { height: 26px; font-weight: 500; }
.ro-aipick-calc { margin-top: 10px; }
.ro-aipick-calc-line { font-size: 13px; color: #8b93a1; }
.ro-aipick-calc-num { margin-right: 6px; font-size: 17px; font-weight: 800; color: #8fb8ff; }
.ro-aipick-calc-money { margin: 0 6px; font-size: 17px; font-weight: 800; color: #47e0a0; }
.ro-aipick-calc-sep { font-size: 12px; color: #5f6878; }
.ro-aipick-calc-tip { margin-top: 6px; font-size: 11px; color: #f0b429; }
/* ⑥ 结果区也做成卡片 */
.ro-aipick-out {
  margin-top: 14px;
  padding: 12px;
  background: #0c1016;
  border: 1px solid #1e2430;
  border-top: 1px solid #1e2430;
  border-radius: 12px;
}
.ro-aipick-hit { gap: 4px; margin: 0 0 7px; }
.ro-aipick-idx { min-width: 44px; }
.ro-aipick-shape { margin-top: 10px; }
.ro-aipick-selfnote { font-size: 10.5px; color: #6b7488; }

/* ============================================================
   __CENTER_HEAD_AI__ ai选号 标题行【强制居中】（用户配截图要求「字体居中」）
   ------------------------------------------------------------
   写法照抄上面「三个区块标题强制居中」那一套（用户要求「别自创」）：
   纵向排列 + 居中 + 全程 !important。
   为什么必须 !important：本段上面的 .ro-aipick-head 自己写了
   align-items: baseline / flex-wrap: wrap、.ro-aipick-arrow 写了 margin-left: auto，
   不加 !important 会被它们按同优先级盖掉（这个坑用户已经踩过好几次）。
   只影响 ai选号 这一个区块，别处不动。
   ============================================================ */
.ro-aipick-head {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
  gap: 3px !important;
}
.ro-aipick-h2 {
  text-align: center !important;
  width: 100% !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
.ro-aipick-sub {
  text-align: center !important;
  width: 100% !important;
  line-height: 1.5 !important;
}
/* 「点击查看 ▸ / 点击收起 ▾」在纵向布局里要自己居中（切换逻辑不变，只挪位置） */
.ro-aipick-arrow { margin: 4px auto 0 !important; }

/* ============================================================
   【开机号】工具栏入口 + 可展开区块（原来并排的第二格已换成热力图折叠卡）
   ------------------------------------------------------------
   平时隐藏（:target 命中才显示），不点就跟没有一样 ——
   「最新开奖」的位置一点都不动，也不占版面。
   老浏览器（不认识 @supports selector()）会跳过整段 → 两个区块直接显示，
   入口链接照样能跳到它们，功能不丢。
   ============================================================ */
.ro-tools { display: flex; gap: 10px; margin: 0 0 22px; }
.ro-tool {
  flex: 1 1 0;
  min-width: 0;
  display: block;
  padding: 11px 12px;
  text-align: center;
  text-decoration: none;
  border: 1px solid #2a323f;
  border-radius: 12px;
  background: linear-gradient(180deg, #1b212b, #161a21);
  -webkit-tap-highlight-color: transparent;
}
.ro-tool b {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: #e8eaed;
  letter-spacing: 1px;
}
.ro-tool em {
  display: block;
  margin-top: 3px;
  font-style: normal;
  font-size: 10.5px;
  color: #7a8394;
}
.ro-tool:hover, .ro-tool:active { border-color: #3a465c; }
.ro-tool-kjh b { color: #ffd479; }

.ro-panel {
  background: #161a21;
  border: 1px solid #2a323f;
  border-radius: 12px;
  padding: 14px 14px 12px;
  margin: 0 0 22px;
}
.ro-panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-bottom: 10px;
}
.ro-panel-title { font-size: 16px; font-weight: 700; color: #e8eaed; letter-spacing: 1px; }
.ro-panel-sub { font-size: 11px; color: #6b7488; }
.ro-panel-none { font-size: 12px; color: #6b7488; padding: 2px 0 3px; }

/* ---- 开机号 ---- */
.ro-kjh-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 620px) {
  .ro-kjh-grid { grid-template-columns: 1fr; }
}
.ro-kjh-item {
  background: #11151b;
  border: 1px solid #232b37;
  border-radius: 10px;
  padding: 9px 10px 8px;
}
.ro-kjh-top { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.ro-kjh-name { font-size: 13.5px; font-weight: 700; color: #e8eaed; }
.ro-kjh-issue { font-size: 11px; color: #7a8394; }
.ro-kjh-nums { display: flex; flex-wrap: wrap; gap: 5px; }
/* 号码小球：和「最新开奖」一个口径，红球红、蓝球蓝（数字彩没有蓝球） */
.ro-kjh-ball {
  min-width: 25px;
  height: 25px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border-radius: 50%;
  font-size: 11.5px;
  font-weight: 700;
  color: #fff;
  font-family: Arial, sans-serif;
  background: linear-gradient(180deg, #f0575c, #d32f34);
}
.ro-kjh-ball.is-blue { background: linear-gradient(180deg, #4a83f5, #2158c4); }
.ro-kjh-extra { margin-top: 6px; font-size: 10.5px; color: #7a8394; }
.ro-kjh-time { margin-top: 3px; font-size: 10.5px; color: #5f6878; }
.ro-kjh-none { font-size: 12px; color: #6b7488; }

/* ---- 【热力图】折叠卡（<details>，和「走势图」同一套机制；默认收起）----
   2026-10-18 用户：「就是这里替换成热力图」「点击可以收起展开 展开就是热力图」
   ⚠️ 类名【不用 .ro-panel】—— .ro-panel 是「默认 display:none，JS 加 .ro-open 才显示」
      的那套老机制；这里靠 <details> 自己的 [open] 状态，CSS 只负责长相。
   ⚠️ 颜色全部走 --ro-* 变量：米杏色主题换色时这一块自动跟着变。 */
.ro-heat {
  background: var(--ro-card);
  border: 1px solid var(--ro-line);
  border-radius: 12px;
  padding: 12px 14px;
  margin: 0 0 22px;
}
.ro-heat > .ro-heat-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 10px;
  cursor: pointer;
  list-style: none;
}
.ro-heat > .ro-heat-head::-webkit-details-marker { display: none; }
.ro-heat > .ro-heat-head::marker { content: ''; }
.ro-heat-title { font-size: 16px; font-weight: 700; color: var(--ro-fg); letter-spacing: 1px; }
.ro-heat-sub { font-size: 11px; color: var(--ro-fg2); }
.ro-heat-arrow {
  flex: 0 0 100%;
  width: 100%;
  text-align: center;
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--ro-fg3);
}
.ro-heat-arrow::before { content: '点击查看'; }
.ro-heat-arrow::after { content: ' ▾'; }
.ro-heat[open] > .ro-heat-head .ro-heat-arrow::before { content: '点击收起'; }
.ro-heat[open] > .ro-heat-head .ro-heat-arrow::after { content: ' ▴'; }
.ro-heat-body { padding: 12px 0 2px; }
.ro-heat .ro-hm-block { margin: 0 0 14px; }
.ro-heat .ro-hm-block:last-child { margin-bottom: 0; }
.ro-heat .ro-hm-block[hidden], .ro-heat .ro-hm-none[hidden] { display: none !important; }
.ro-heat .ro-hm-none { font-size: 12px; color: var(--ro-fg3); padding: 2px 0 6px; }
.ro-hm-head { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 0 0 6px; font-size: 12px; color: #4a3a26; }
.ro-hm-head b { font-size: 13px; }
.ro-hm-head span { font-size: 11px; color: #8a7a63; }
/* 【手机窄屏】图块标题那行「双色球 实票统计」+「口径 · 日期」挤在一行会
   把「统计」两个字折成两行（实测 375px 就这样）→ 窄屏改成上下两行：
   第一行只放彩种名（不折行），第二行放口径说明。 */
@media (max-width: 560px) {
  .ro-heat .ro-hm-head { flex-wrap: wrap; row-gap: 2px; }
  .ro-heat .ro-hm-head b { white-space: nowrap; }
  .ro-heat .ro-hm-head span { flex: 1 1 100%; width: 100%; }
}

/* 只有认识 :target 的浏览器才隐藏；不认识的（老内核）保持常显，功能不丢 */
@supports selector(:target) {
  .ro-panel { display: none; }
}
/* 【展开规则】由 JS 加 .ro-open 类控制（不依赖 :target）。
   ⚠️ 这条必须存在，否则区块永远打不开 —— 之前误把它写进了 JS 注释里。
   放在 @supports 外面：即使浏览器不认识 :target，点一下也能展开。 */
.ro-panel.ro-open { display: block; }

/* ============================================================
   __COLOR_UNIFY__ 配色统一（用户要求「网页颜色 色系帮我协调一点」）
   ------------------------------------------------------------
   只改【颜色】，结构 / 文字 / 功能 / 交互一个都不动。
   做法：整套色板收成「一个主色 + 一个强调色 + 三级灰」，
   「同一语义 = 同一个值」，层次靠亮度差，不靠色相差。
   ⚠️ 这一段放在样式表【最后】：同优先级时后者胜，不用堆 !important。
   色板：
     页面底 #0f1115 · 卡片底 #161a21 · 内嵌底 #12151d
     边框 常规 #262d3a · 轻微 #1e2430
     主文字 #e8eaed · 次文字 #98a1b2 · 弱文字 #6b7488
     主色（绿）#47e0a0 · 强调色（蓝）#6ea8fe
     警示 红 #f0575c · 注意 黄 #f0b429 · 时间（倒计时）金 #e8c877
   ============================================================ */
:root {
  --ro-bg: #0f1115;
  --ro-card: #161a21;
  --ro-sunken: #12151d;
  --ro-line: #262d3a;
  --ro-line-soft: #1e2430;
  --ro-fg: #e8eaed;
  --ro-fg2: #98a1b2;
  --ro-fg3: #6b7488;
  --ro-ok: #47e0a0;
  --ro-link: #6ea8fe;
  --ro-warn: #f0b429;
  --ro-danger: #f0575c;
  --ro-time: #e8c877;
}
/* ---- 背景三层 ---- */
body, .ro-wrap { background: var(--ro-bg); }
.ro-status, .ro-xysp, .ro-aipick, .ro-panel, .ro-tool, .ro-imgtoc-wrap {
  background: var(--ro-card);
  border-color: var(--ro-line);
}
.ro-status.ok { background: rgba(71, 224, 160, .07); border-color: rgba(71, 224, 160, .3); }
.ro-status.warn { background: rgba(240, 180, 41, .08); border-color: rgba(240, 180, 41, .32); }
.ro-aipick-out, .ro-aipick-card, .ro-aipick-in, .ro-mob-view, .ro-kjh-item {
  background: var(--ro-sunken);
  border-color: var(--ro-line-soft);
}
.ro-xysp-tab, .ro-aipick-tab, .ro-aipick-kl8tab, .ro-aipick-srcbtn,
.ro-aipick-segbtn, .ro-aipick-btn, .ro-aipick-seg, .ro-aipick-pick {
  background: var(--ro-card);
  border-color: var(--ro-line);
}
.ro-aipick-seg { background: var(--ro-bg); }
.ro-xysp-pic { border-color: var(--ro-line-soft); }
/* ---- 文字三级灰（同语义同色） ---- */
.ro-xysp-h2, .ro-aipick-h2, .ro-art-title, .ro-imgtoc-title, .ro-panel-title,
.ro-gamehead h2, .ro-divider span, .ro-tool b, .ro-kjh-name, .ro-disclaimer h3,
.ro-status .ro-st-head { color: var(--ro-fg); }
.ro-art-body p { color: var(--ro-fg); }
.ro-xysp-sub, .ro-aipick-sub, .ro-art-sub, .ro-meta, .ro-imgtoc-sub, .ro-panel-sub,
.ro-tool em, .ro-kjh-nums, .ro-st-time, .ro-foot { color: var(--ro-fg2); }
.ro-xysp-note, .ro-aipick-note, .ro-aipick-selfnote, .ro-aipick-empty, .ro-aipick-more,
.ro-aipick-idx, .ro-aipick-calc-sep, .ro-disclaimer p, .ro-status .ro-st-reason,
.ro-status .ro-st-hint,
.ro-panel-none, .ro-kjh-issue, .ro-xysp-cap i, .ro-xysp-empty { color: var(--ro-fg3); }
/* ---- 主色（绿）/ 强调色（蓝）：只留这两种彩色 ---- */
.ro-status.ok .ro-st-head, .ro-aipick-pcount.full, .ro-aipick-calc-money { color: var(--ro-ok); }
.ro-aipick-kl8tab.on, .ro-aipick-tab.on { background: linear-gradient(180deg, #4ce3a6, #2fbe86); }
.ro-aipick-arrow,
.ro-aipick-sum, .ro-aipick-sumline, .ro-aipick-calc-num, .ro-aipick-plabel,
.ro-art-link { color: var(--ro-link); }
.ro-aipick-seg .on, .ro-aipick-btn.on, .ro-aipick-pick.blue.on {
  background: linear-gradient(180deg, #6ea8fe, #3f7ce8);
}
.ro-aipick-pick.on { background: linear-gradient(180deg, #f0575c, #cf3b40); }
.ro-aipick-ball { color: var(--ro-danger); }
.ro-aipick-ball.blue { color: var(--ro-link); }
.ro-aipick-pick.blue.on { border-color: transparent; }
/* 时间（倒计时）统一金色 —— 只给时间 */
#__NEXT_CD__, #__NEXT_CD2__, #__ART_CD__ { color: var(--ro-time) !important; }
/* 警示 */
.ro-aipick-warn, .ro-aipick-calc-tip { color: var(--ro-warn); }

/* ============================================================
   __TITLE_CENTER__ 页面主标题：去掉「推荐图」后缀 + 强制居中
   ------------------------------------------------------------
   用户原话：「不要推荐图了 就春风 居中」。
   可见文字只留「春风」；<title> 标签没动（那是分享卡片，
   另一个专人在管，现在是「春风彩票」，本来就没有「推荐图」）。
   ⚠️ 用 !important：这个页面的居中规则被后来的同优先级规则盖过好几次。
   ============================================================ */
.ro-top { text-align: center !important; }
.ro-top h1 {
  display: block !important;
  width: 100% !important;
  margin-left: auto !important;
  margin-right: auto !important;
  text-align: center !important;
}
.ro-top .sub { width: 100% !important; text-align: center !important; }

/* ============================================================
   __LIGHT_THEME__ 整体浅色主题（一段覆盖，加在样式表【最后】）
   ------------------------------------------------------------
   用户原话：「整体换成浅色系主题 我要节约成本做」+ 明确要求
     「用一段 CSS 覆盖在样式表最后统一换色 —— 这是最省钱的路径」
   所以这里【不逐个区块改】，只在最后统一覆盖：
     ① 覆盖 :root 上的 --ro-* 变量（页面主体早就变量化了，改这里最省）
     ② 用属性选择器把【写死的颜色字面量】按映射表逐条替换
        （[style*="#0f1115"] 这种写法能一次覆盖所有硬编码点）
     ③ 少量需要特殊处理的（状态条、遮罩、canvas 容器）单独写
   ⚠️ canvas 出的图（推荐图 / 热力图 / 九转图）不动：
      那些颜色写死在 JS 的 fillStyle 里，改了要重做模板（成本高）。
      做法是给 canvas/图区套一个【深色容器】，让它在浅色页面上也看得清。
   ⚠️ 防截图遮罩保持深色（遮罩本来就该是黑的），不改。
   ============================================================ */
:root {
  /* 【米杏色暖色调】用户给的新配色（覆盖早先的"纯白"版本）。
     ⚠️ 用 CSS 变量 + 一段覆盖，这是最省成本的换色方式。
     ⚠️ 主文字是【深棕 #4a3a26】不是黑；卡片底比页面底【略亮一点点】。 */
  --ro-bg: #f7efe1;          /* 页面底：米杏色 */
  --ro-card: #fdf6ea;        /* 卡片：米杏色 */
  --ro-sunken: #f3e6d0;      /* 次级卡片 */
  --ro-line: #e8d7bd;        /* 边框 */
  --ro-line-soft: #efe2cc;
  --ro-fg: #4a3a26;          /* 主文字：深棕 */
  --ro-fg2: #8a7a63;         /* 副文字 */
  --ro-fg3: #a89madd;        /* 占位，下面会被覆盖（保持三档灰的语义） */
  --ro-ok: #1a8c5a;          /* 主色绿（和现在一致） */
  --ro-link: #1f5fd6;
  --ro-warn: #b8860b;
  --ro-danger: #c0392b;      /* 按钮红字 */
  --ro-time: #c0392b;        /* 倒计时红字 */
}
/* 第三档弱文字用暖灰（上面那行是笔误占位，这里给正确的值） */
:root { --ro-fg3: #a2937c; }
/* ---- 页面底 / 卡片底（米杏色三档） ---- */
html, body, .ro-wrap { background: #f7efe1 !important; color: #4a3a26; }
[style*="#0f1115"] { background-color: #f7efe1 !important; }
[style*="#161a21"] { background-color: #fdf6ea !important; }
[style*="#12151d"] { background-color: #f3e6d0 !important; }
[style*="#1a1f28"] { background-color: #fdf6ea !important; }
[style*="#161618"] { background-color: #fdf6ea !important; }
/* ---- 边框（暖色） ---- */
[style*="#262d3a"] { border-color: #e8d7bd !important; }
[style*="#1e2430"] { border-color: #efe2cc !important; }
[style*="#2b3444"] { border-color: #e0ccae !important; }
[style*="#2a323f"] { border-color: #e8d7bd !important; }
/* ---- 文字（深棕三级） ---- */
[style*="#e8eaed"] { color: #4a3a26 !important; }
[style*="#98a1b2"] { color: #8a7a63 !important; }
[style*="#6b7488"] { color: #a2937c !important; }
[style*="#5f6878"] { color: #b3a68f !important; }
[style*="#8b93a1"] { color: #8a7a63 !important; }
[style*="#c8cfda"] { color: #4a3a26 !important; }
/* ---- 主色 / 强调 ---- */
[style*="#47e0a0"] { color: #1a8c5a !important; }
[style*="#8fb8ff"] { color: #1f5fd6 !important; }
[style*="#6ea8fe"] { color: #1f5fd6 !important; }
[style*="#f0575c"] { color: #c0392b !important; }
[style*="#f0b429"] { color: #f5b301 !important; }
[style*="#e8c877"] { color: #c0392b !important; }
/* ---- 状态条（提示条：米黄底） ---- */
.ro-status.ok { background: #e8f6ef !important; border-color: #b7e4cd !important; }
.ro-status.ok .ro-st-head { color: #1a8c5a !important; }
.ro-status.warn { background: #fff6dd !important; border-color: #ffe08a !important; }
.ro-status.warn .ro-st-head { color: #7a5c00 !important; }
.ro-status .ro-st-time, .ro-status .ro-st-reason, .ro-status .ro-st-hint { color: #8a7a63 !important; }
/* ---- 卡片类统一米杏色 ---- */
.ro-status, .ro-xysp, .ro-aipick, .ro-panel, .ro-tool, .ro-imgtoc-wrap {
  background: #fdf6ea !important; border-color: #e8d7bd !important; color: #4a3a26;
}
.ro-aipick-out, .ro-aipick-card, .ro-aipick-in, .ro-kjh-item {
  background: #f3e6d0 !important; border-color: #efe2cc !important;
}
/* ⚠️ 【摇号面板输入框的字】.ro-aipick-in 自己的 color 还是暗色版的 #e8eaed，
   压在米杏底 #f3e6d0 上实测对比度只有 1.02（等于看不见字）；上面那套
   [style*="#e8eaed"] 改不到它 —— 那不是行内样式。而「选几个」现在是本面板的
   主输入框（红球 / 蓝球），所以按主题主文字补一条颜色：只加颜色，别的都不动。
   （.ro-aipick-in 只被 GPT模型摇号 面板用到，不牵连别的区块。） */
.ro-aipick-in { color: var(--ro-fg) !important; }
.ro-xysp-pic { background: #fdf6ea !important; border-color: #efe2cc !important; }
.ro-xysp-tab, .ro-aipick-tab, .ro-aipick-kl8tab, .ro-aipick-srcbtn,
.ro-aipick-segbtn, .ro-aipick-btn, .ro-aipick-seg, .ro-aipick-pick {
  background: #fdf6ea !important; border-color: #e8d7bd !important; color: #4a3a26;
}
.ro-xysp-tab.on, .ro-aipick-tab.on {
  background: #e8f6ef !important; border-color: #b7e4cd !important; color: #1a8c5a !important;
}
/* ⚠️ 全屏看图保持深色（看图背景，浅色反而刺眼；用户模板里 gallery 也是黑底）。
   ⚠️ 防截图遮罩保持深色（用户明确说"遮罩本来就该是黑的 ✅ 不用改"）。 */
.ro-mob-view { background: #0b0d11 !important; }
.ro-mob-tip, .ro-mob-err { color: #c8cfda !important; }
#mask { background: rgba(0, 0, 0, 0.96) !important; }

/* ============================================================
   __LAYOUT__ 推荐页布局（按用户给的设计）
   ------------------------------------------------------------
   页面顺序（模板里已经是这个，本轮没动结构）：
     Tab → 主标题 → 提示条 → 推荐图目录 → 开机号 → 热力图（折叠卡）
       → 晒票 → GPT模型摇号 → 开奖号码 → 文章参考
   这一整块【只加样式，不动功能】：倒计时 / 看图 / 折叠 / 展开 全部保留。
   ⚠️ 全部用变量色（--ro-*），米杏色主题自动生效。
   ⚠️ ⑥⑦ 晒票和 GPT 摇号从上一版的【横排】改回【居中单卡片】
      （用户最终要居中；上一版横排是我按更早的要求做的，这里改回）。
   ============================================================ */
/* ① 顶部 Tab —— 2026-10-18 修（两页必须一模一样，竞彩页同名规则同步改）：
   · 值对齐竞彩页：flex 1 1 0 / min-width:0 / white-space:nowrap /
     -webkit-tap-highlight-color:transparent。
     原来这里是 flex:1 + 没有 nowrap —— 窄屏＋系统大字号时「竞彩/足球」会折行，
     手机上点 Tab 还会闪一下系统高亮方块（竞彩页早就写过这两条，本页漏了）。
   · 高度锁定 = 12 + 19(14px 行盒) + 12 = 43px，和竞彩页完全一致
     （原来竞彩页 padding 10px/6px → 39px，两页来回切会跳 4px）。
   · .tab.on::after 改成 bottom:-1px：正好压住整条 Tab 的那条 1px 底线。
     原来 bottom:0，绿线底下还露出 1px 米色（4x 截图实测：绿 49–51px、米色 51–52px），
     看起来像「双线」，也让人以为非激活那句也有下划线。
   · 悬停/键盘焦点用主题色，不让浏览器默认黑框出现。 */
/* 【Tab 条贴边 · 底线贯穿全宽】用户 2026-10-18：「两个首页的 tab 上面封顶宽一点」
   ------------------------------------------------------------
   截图看就是【左右没贴边】：Tab 条被 .ro-wrap 的左右内边距夹住，
   所以整条 Tab + 它那条 1px 底线都只到中间，两边各留一条米色空档
   （实测 375px：条 4→371，只占 367；320px：4→316，只占 312）。
   做法：用负外边距把外层 .ro-wrap 的左右内边距【抵消掉】——
        · --ro-pad-x 就是 .ro-wrap 的左右内边距（12px；≤600px 时 4px，
          和 .ro-wrap { padding: 8px 4px 40px } 同步），所以以后谁再改留白，
          这里自动跟着走，不会再多/少一截（也就不会横向溢出）。
        · 条本身撑到屏幕两边后，它自己的 border-bottom 自然贯穿整屏；
          吸顶时两边也不会再透出下面滚动的内容（"封顶"那块看起来就宽了）。
   ⚠️ 只加左右外边距：高度 43px（Tab）/ 44px（条）、两列 50%/50%、
      激活态下划线 2px / bottom:-1px、吸顶阴影 全都不动。 */
.top-tabs { display: flex; border-bottom: 1px solid var(--ro-line); margin-bottom: 2px;
  margin-left: calc(-1 * var(--ro-pad-x, 12px));
  margin-right: calc(-1 * var(--ro-pad-x, 12px));
  /* 【吸顶 · 用户 2026-10-18「还是跟着滑动吧」】往下翻的时候这排 tab 跟着走，
     始终留在屏幕顶部，随时能切「彩票推荐 / 竞彩·足球」。 */
  position: -webkit-sticky; position: sticky; top: 0; z-index: 900; isolation: isolate;;
  background: var(--ro-bg, #f7efe1); }
/* 吸顶那一层要和页面底色一致，否则内容会从缝里透出来 */
.top-tabs.stuck { box-shadow: 0 2px 8px rgba(74, 58, 38, 0.10); }

/* ============================================================
   __STBAR__ 状态卡 · 往下滚时在 Tab 条下面【吸顶成一条 34px 的紧凑条】
   ------------------------------------------------------------
   用户 2026-10-20：「往下滑动的时候 这一块和上面一块不要动」
                +「位置不要大了遮挡下面的页面」+「但是也能很清楚」
   · 上面一块 = .top-tabs —— 本来就已经 sticky top:0 / z-index:60（没动它）
   · 这一块   = 状态卡。完整态实测 192px，一直钉在屏幕上要占 812 屏的 24%，
     所以滚过去之后【收成一条 34px】：绿点 +「资料已更新」+ 倒计时。
       固定区总高 = 44（Tab 条）+ 34（紧凑条）= 78px（用户要求 <=80）。
   · 为什么不用 position:sticky 直接吸状态卡（试过，不行）：
     状态卡在 #article 里，而 #article 实测只有 1026px 高（页面下半截在
     #article-rest 里），卡片吸到 ~860px 就跟着滚走了；而且卡片从 192px 变矮
     会让下面内容整体往上跳 158px。所以改成【独立一条 fixed】，状态卡本身
     一个像素都不动（不 sticky、不改高），页面排版零位移。
   · z-index 55：比正文高、比 Tab 条的 60 低，两块不打架。
   · 背景是实色（#e8f6ef / #fff6dd），不是半透明 —— 滚动内容不会透出来糊字。
   · 全屏子页面 .ro-mob-view(9999) / .tool-view(100000) 的 z-index 远高于 55，
     不会被这条压住。
   · 页面在顶部 / 状态卡还看得见时 display:none —— 绝不遮挡任何内容。
   ============================================================ */
.ro-stbar {
  position: fixed; top: 44px; left: 0; right: 0; margin: 0 auto;
  max-width: 820px; height: 34px; box-sizing: border-box;
  z-index: 55; display: none; align-items: center; gap: 8px;
  padding: 0 14px; background: #e8f6ef; border-bottom: 1px solid #b7e4cd;
  font-size: 13px; font-weight: 700; line-height: 1; color: #1a8c5a;
  box-shadow: 0 2px 8px rgba(74, 58, 38, 0.10);
  overflow: hidden; white-space: nowrap;
}
.ro-stbar.on { display: flex; }
.ro-stbar.warn { background: #fff6dd; border-bottom-color: #ffe08a; color: #7a5c00; }
.ro-stbar .ro-stbar-dot { flex: 0 0 auto; width: 9px; height: 9px; border-radius: 50%;
  background: #1a8c5a; box-shadow: 0 0 0 3px rgba(26, 140, 90, 0.14); }
.ro-stbar.warn .ro-stbar-dot { background: #f5b301; box-shadow: 0 0 0 3px rgba(245, 179, 1, 0.18); }
.ro-stbar .ro-stbar-t { flex: 0 0 auto; color: inherit; }
.ro-stbar .ro-stbar-cd { flex: 0 1 auto; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; color: #c0392b; font-weight: 700; }
/* owner 本机左上角那个 🔥 热度浮标固定在 top:52 / left:8，会压住这条的左端；
   只有 owner 看得到浮标 → 只给 owner 让出左边一点，普通分享页还是贴边 */
html.is-owner .ro-stbar { padding-left: 52px; }
/* 防截图锁定时跟着一起糊（和状态卡受同一个保护） */
html.locked .ro-stbar { filter: blur(14px) grayscale(1); }
/* 【小字提示 + 箭头 · 用户 2026-10-18「tab 上面用小型号字迹提示+箭头」】 */
.ro-swipe-hint { display: flex; align-items: center; justify-content: center; gap: 6px;
  margin: 0 0 2px; padding: 5px 10px 3px; font-size: 11px; line-height: 1.2;
  color: #8a7a63; background: transparent; letter-spacing: 0.2px; }
.ro-swipe-hint .ar { font-size: 12px; color: #1a8c5a; font-weight: 700; }
.top-tabs .tab { flex: 1 1 0; min-width: 0; text-align: center; padding: 12px 8px;
  font-size: 14px; font-weight: 600; color: var(--ro-fg2); text-decoration: none;
  position: relative; white-space: nowrap; -webkit-tap-highlight-color: transparent; }
.top-tabs .tab.on { color: var(--ro-ok); font-weight: 700; }
.top-tabs .tab.on::after { content: ''; position: absolute; left: 20%; right: 20%;
  bottom: -1px; height: 2px; background: var(--ro-ok); border-radius: 2px; }
.tab:focus-visible { outline: 2px solid var(--ro-ok); outline-offset: -3px; border-radius: 6px; }
.tab:hover { color: var(--ro-fg); }
#owner-badge { font-size: 12px !important; color: var(--ro-ok) !important;
  background: #e3f2ea !important; border: 1px solid #b7e4cd !important;
  border-radius: 14px !important; padding: 4px 10px !important; }

/* ② 主标题：居中 · 22px · 800 · 绿 */
.ro-top { padding: 22px 12px 14px !important; }
.ro-top h1 { font-size: 22px !important; font-weight: 800 !important;
  color: var(--ro-ok) !important; letter-spacing: 1px; }
.ro-top .sub { font-size: 12px !important; color: var(--ro-fg2) !important; }

/* ③ 提示条：米黄底 + 暖边框 */
.ro-status { margin: 0 12px 16px !important; border-radius: 10px !important;
  padding: 12px 14px !important; font-size: 13px !important; line-height: 1.8; }
/* 【用户 2026-10-20「往下滑动的时候 Tab 条和状态卡不要动」】
   固定到 Tab 条（44px）下方。滚动后由 JS 加 .ro-st-fixed 收成一行，避免遮挡内容。 */
.ro-status { position: sticky; top: 44px; z-index: 50; }
.ro-status.ro-st-fixed {
  padding: 6px 14px !important;
  display: flex; align-items: center; gap: 8px; flex-wrap: nowrap;
}
.ro-status.ro-st-fixed .ro-st-sub,
.ro-status.ro-st-fixed .ro-st-hint,
.ro-status.ro-st-fixed .ro-st-reason { display: none !important; }
.ro-status.ro-st-fixed .ro-st-head { font-size: 13px !important; font-weight: 700; white-space: nowrap; }
.ro-status.ro-st-fixed .ro-st-time { font-size: 13px !important; font-weight: 700; white-space: nowrap; }
.ro-status .ro-st-head { font-size: 13px !important; }
.ro-status .ro-st-time { color: var(--ro-danger) !important; font-weight: 700; }

/* ④ 推荐图目录：2 列网格 · 卡片 · 红字
   ------------------------------------------------------------
   【本轮修正】用户给了这块的 CSS 规格（section-title / section-sub / grid / .btn 四段）。
   ⚠️ 注意：这段 CSS 是写在模板字符串里的，注释里【不能出现反引号】，
      否则外层模板会被提前截断 → "SyntaxError: Unexpected token ';'"（本次实测踩到）。
   对照实测发现两个缺口——根因是页面里有一条全局 reset（星号选择器 margin:0; padding:0）：
     · .ro-imgtoc-title 的 margin 从来没写过 → 被 reset 吃成 0
     · .ro-imgtoc-sub 的 margin-bottom 也没写过 → 也是 0
     结果标题 / 副标题 / 第一行卡片挤成一条（实测 title→sub 只有 3px）。
   现在按规格补上：6px 0 4px 和 14px（并显式写 color，和规格一致，不再只靠继承）。
   ⚠️ 只加/补这几条，不动其它布局；改完必须重跑不变量与截图。 */
.ro-imgtoc-wrap { background: transparent !important; border: 0 !important; padding: 0 !important; }
/* 【往下滑提示】用户 2026-10-18：状态卡下面一条细线 + 「往下滑」小字 */
.ro-scrollhint { display: flex; align-items: center; justify-content: center; gap: 10px;
  margin: 0 12px 14px; }
.ro-sh-line { flex: 0 0 46px; height: 1px; background: #e0cdb0; }
.ro-sh-txt { font-size: 12px; letter-spacing: 1px; color: #8a7a63; white-space: nowrap; }
.ro-imgtoc-head { padding: 0 12px 0; }
.ro-imgtoc-title { text-align: center; font-size: 15px; font-weight: 700;
  color: var(--ro-fg); margin: 6px 0 4px; }
.ro-imgtoc-sub { text-align: center; font-size: 12px; color: var(--ro-fg2); margin-bottom: 14px; }
.ro-imgtoc { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 10px !important; padding: 0 12px 20px !important; width: auto !important; }
.ro-imgtoc tbody, .ro-imgtoc tr { display: contents !important; }
.ro-imgtoc td { display: block !important; padding: 0 !important; border: 0 !important; }
.ro-toc-cell { display: block !important; background: var(--ro-card) !important;
  border: 1px solid var(--ro-line) !important; border-radius: 10px !important;
  padding: 14px 8px !important; text-align: center !important; text-decoration: none !important;
  font-size: 14px !important; font-weight: 700 !important; color: var(--ro-danger) !important; }

/* ⑤ 开机号：工具栏里现在只剩它一格
      （auto-fit 而不是写死 2 列 —— 只有一格时自动铺满，不半边留空；
        以后再加格子回来也会自动变两列） */
.ro-tools { display: grid !important; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)) !important;
  gap: 10px !important; padding: 0 12px 16px !important; }
.ro-tool { display: block !important; background: var(--ro-card) !important;
  border: 1px solid var(--ro-line) !important; border-radius: 10px !important;
  padding: 14px 8px !important; text-align: center !important; text-decoration: none !important; }
.ro-tool b { display: block; font-size: 14px; font-weight: 700; color: var(--ro-fg) !important; }
.ro-tool em { display: block; margin-top: 3px; font-style: normal;
  font-size: 11px; color: var(--ro-fg2) !important; }

/* ⑥⑦ 晒票 / GPT模型摇号：居中单卡片 —— __COMPACT2__
   用户 2026-10-17：「把这两个布局做小一点 太占屏幕大小了」
   做法：三行（标题 / 副标题 / 展开）压成一行，内边距和字号都收小。
   机制没变：仍是 <summary> + CSS 伪元素按 [open] 换字。 */
.ro-xysp > .ro-xysp-head,
.ro-aipick > .ro-aipick-head {
  display: flex !important; align-items: baseline !important;
  justify-content: center !important; flex-wrap: wrap !important;
  gap: 0 7px !important; text-align: center !important;
  margin: 0 12px 8px !important; padding: 7px 10px !important; border-radius: 8px !important;
}
.ro-xysp > .ro-xysp-head .ro-xysp-h2,
.ro-aipick > .ro-aipick-head .ro-aipick-h2 {
  font-size: 13.5px !important; font-weight: 800 !important; line-height: 1.35 !important;
}
.ro-xysp > .ro-xysp-head .ro-xysp-sub,
.ro-aipick > .ro-aipick-head .ro-aipick-sub {
  font-size: 10.5px !important; color: var(--ro-fg2) !important;
  margin: 0 !important; max-width: none !important; white-space: normal !important;
  line-height: 1.35 !important;
}
.ro-xysp > .ro-xysp-head .ro-xysp-arrow,
.ro-aipick > .ro-aipick-head .ro-aipick-arrow {
  display: inline-block !important; margin: 0 !important;
  font-size: 10.5px !important; font-weight: 600 !important;
  color: var(--ro-ok) !important; border: 0 !important; border-radius: 0 !important;
  padding: 0 !important; text-align: center !important; line-height: 1.35 !important;
}

/* ⑧ 开奖号码：2 列卡片 + 24px 球 */
#ro-latest .hc-drawgrid { display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
#ro-latest .hc-drawcard { background: #f9efdd !important; border: 1px solid var(--ro-line) !important;
  border-radius: 10px !important; padding: 12px 10px !important; }
#ro-latest .hc-dt { display: flex !important; justify-content: space-between !important;
  align-items: baseline !important; gap: 6px; font-size: 12px !important; color: var(--ro-fg2) !important; }
#ro-latest .hc-dt b { font-weight: 700 !important; color: var(--ro-fg) !important; }
#ro-latest .hc-cd, #ro-latest .hc-countdown { font-size: 11px !important; color: var(--ro-danger) !important; }
#ro-latest .hc-balls, #ro-latest .hc-nums { display: flex !important; flex-wrap: wrap !important; gap: 4px !important; margin-top: 8px; }
#ro-latest .hc-ball { width: 24px !important; height: 24px !important; line-height: 24px !important;
  border-radius: 50% !important; font-size: 12px !important; text-align: center !important;
  background: var(--ro-danger) !important; color: #fff !important; font-weight: 700; }
#ro-latest .hc-ball.blue { background: #1f5fd6 !important; }
#ro-latest .hc-ball.gold, #ro-latest .hc-ball.special { background: #d9a300 !important; }
#ro-latest .ro-gamehead h2 { text-align: center !important; font-size: 15px !important; font-weight: 700 !important; }
#ro-latest .ro-gamehead .ro-meta { text-align: center !important; font-size: 12px !important; color: var(--ro-fg2) !important; }

/* ⑨ 文章参考：2 列卡片 */
.ro-art-head { padding: 0 12px 8px; }
.ro-art-title { text-align: center !important; font-size: 15px !important; font-weight: 700 !important; }
.ro-art-sub { text-align: center !important; font-size: 11px !important; color: var(--ro-danger) !important; }
.ro-art-groups { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 10px !important; padding: 0 12px 20px !important; background: transparent !important; border: 0 !important; }
.ro-art-group { background: var(--ro-card) !important; border: 1px solid var(--ro-line) !important;
  border-radius: 10px !important; padding: 12px !important; margin: 0 !important; }
.ro-art-group > summary.ro-art-gname { display: flex !important; align-items: center !important;
  justify-content: space-between !important; font-size: 13px !important; font-weight: 700 !important;
  cursor: pointer; list-style: none; }
.ro-art-group > summary.ro-art-gname i { font-style: normal; font-size: 12px !important;
  color: var(--ro-fg2) !important; font-weight: 400; }
.ro-art-group > summary.ro-art-gname .ro-art-tip::after { content: '点击查看'; font-size: 12px; color: var(--ro-ok) !important; }
.ro-art-group[open] > summary.ro-art-gname .ro-art-tip::after { content: '点击收起'; }

/* ⑩ 走势图入口（__TREND_ENTRY__）：和晒票/GPT摇号同一套「居中单卡片」外观。
   ⚠️ 【本轮改版】它现在是 <details>（不是 <a> 跳转）：
      点一下【就地展开】走势图（iframe），默认收起。
   ⚠️ 「点击查看 ▸ / 点击收起 ▾」用的是 .ro-aipick-arrow 那一套写法
      （伪元素 ::before/::after 按 [open] 换字），不是新机制、不是裸 <button>。
   ⚠️ 只用变量色（--ro-fg / --ro-ok / --ro-card / --ro-line / --ro-sunken），
      米杏色主题和浅色主题那段覆盖都能自动生效。 */
.ro-trend { background: var(--ro-card); border: 1px solid var(--ro-line);
  border-radius: 10px; margin: 0 12px 12px; padding: 12px 12px 0; }
.ro-trend > .ro-trend-head { display: block; text-align: center; cursor: pointer;
  list-style: none; -webkit-tap-highlight-color: transparent; user-select: none;
  padding: 2px 0 12px; }
.ro-trend > .ro-trend-head::-webkit-details-marker { display: none; }
.ro-trend > .ro-trend-head::marker { content: ''; }
.ro-trend-h2 { display: block; font-size: 15px; font-weight: 800; color: var(--ro-fg);
  letter-spacing: .5px; }
.ro-trend-sub { display: block; margin-top: 4px; font-size: 12px; color: var(--ro-fg2);
  font-weight: 600; }
/* 右侧胶囊：和晒票 / GPT摇号 / 专家推荐 一模一样的「点击查看/点击收起」 */
.ro-trend-arrow { display: inline-block; margin: 8px auto 0; font-size: 12px;
  font-weight: 600; color: var(--ro-ok); border: 1px solid var(--ro-ok);
  border-radius: 14px; padding: 4px 10px; white-space: nowrap; }
.ro-trend-arrow::before { content: '点击查看'; }
.ro-trend-arrow::after { content: ' ▸'; }
.ro-trend[open] > .ro-trend-head .ro-trend-arrow::before { content: '点击收起'; }
.ro-trend[open] > .ro-trend-head .ro-trend-arrow::after { content: ' ▾'; }
.ro-trend-body { padding: 0 0 12px; }
/* ⚠️ 原来这里有 .ro-trend-frame（520px 高的嵌入框）和 .ro-trend-tip（跳独立页的兜底链接）。
   2026-10-17 用户要求「删除单独走势图独立页」→ 内容改成内联，这两条一起删掉：
   走势图那一块的样式全部由 build-trend.mjs 的片段自带（选择器都带
   .ro-trend-embed 前缀，收在片段内部，不会漏到分享页其它地方）。 */

/* ============================================================
   __RO_HIST__ 「历史开奖」折叠卡（用户 2026-10-19 要求）
   ------------------------------------------------------------
   位置：紧跟「晒票 | GPT模型摇号」那一行，占整行全宽。
   外观：和上面几张折叠卡同一套 —— 米杏底（--ro-card）+ 1px 细边框 + 圆角 10px，
        卡片脸的阴影由上面 __CARD_RAISE__ 那段对 #article-rest 直接子元素的
        统一规则给到位，这里【不重复写阴影】，免得又多一套口径。
   标题三行：历史开奖 / 近 365 天 · 所有奖项 / 点击查看（点开变「点击收起」）。
   下面每条一行：日期 · 彩种 · 期号 · 奖项，再下面两行是该期号码与命中明细。
   ⚠️ 全部是文字：没有图片（图位数量不变）、没有脚本、没有输入框。
   ⚠️ 只有变量色（--ro-card / --ro-line / --ro-fg / --ro-fg2 / --ro-fg3 / --ro-ok），
      米杏主题和浅色主题都能跟着走。
   ============================================================ */
.ro-hist { background: var(--ro-card); border: 1px solid var(--ro-line);
  border-radius: 10px; margin: 0 12px 12px; padding: 12px 12px 0; }
.ro-hist > .ro-hist-head { display: block; text-align: center; cursor: pointer;
  list-style: none; -webkit-tap-highlight-color: transparent; user-select: none;
  padding: 2px 0 12px; }
.ro-hist > .ro-hist-head::-webkit-details-marker { display: none; }
.ro-hist > .ro-hist-head::marker { content: ''; }
.ro-hist-h2 { display: block; font-size: 15px; font-weight: 800; color: var(--ro-fg);
  letter-spacing: .5px; }
/* __HIST_ANN__ 最近 7 天中奖宣布（用户 2026-10-20）——只用现有变量色 */
.ro-hist-ann { margin: 0 0 10px; padding: 10px 10px 4px; border: 1px solid var(--ro-line);
  border-radius: 8px; }
.ro-hist-ann-h { font-size: 13px; font-weight: 800; color: var(--ro-ok); padding-bottom: 6px; }
.ro-hist-ann-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  padding: 5px 0; border-top: 1px dashed var(--ro-line); font-size: 12px; color: var(--ro-fg2); }
.ro-hist-ann-row:first-of-type { border-top: 0; }
.ro-hist-ann-d { color: var(--ro-fg3); font-variant-numeric: tabular-nums; }
.ro-hist-ann-g { font-weight: 800; color: var(--ro-fg); }
.ro-hist-ann-i { color: var(--ro-fg3); }
.ro-hist-ann-t { font-weight: 800; color: var(--ro-ok); }
.ro-hist-ann-n { display: inline-flex; flex-wrap: wrap; gap: 3px; }
/* __HIST_ANN_BOLD__ 用户 2026-10-20：「中奖宣布也要加粗」
   —— 中奖宣布那几行的号码：900 + 比正文稍大一点；命中号仍然红色高亮，
      只加粗、不额外上球圈（用户只说"加粗"）。 */
.ro-hist-ann-n .ro-hist-n { font-weight: 900; font-size: 13px; color: var(--ro-fg); }
.ro-hist-ann-n .ro-hist-n.ro-hist-hit { color: #c0392b; }
.ro-hist-sub { display: block; margin-top: 4px; font-size: 12px; color: var(--ro-fg2);
  font-weight: 600; }
.ro-hist-arrow { display: inline-block; margin: 8px auto 0; font-size: 12px;
  font-weight: 600; color: var(--ro-ok); border: 1px solid var(--ro-ok);
  border-radius: 14px; padding: 4px 10px; white-space: nowrap; }
.ro-hist-arrow::before { content: '点击查看'; }
.ro-hist-arrow::after { content: ' ▾'; }
.ro-hist[open] > .ro-hist-head .ro-hist-arrow::before { content: '点击收起'; }
.ro-hist[open] > .ro-hist-head .ro-hist-arrow::after { content: ' ▴'; }
.ro-hist-body { padding: 0 0 12px; }
.ro-hist-meta { font-size: 11px; line-height: 1.6; color: var(--ro-fg3);
  text-align: center; padding: 0 0 8px; word-break: break-word; }
/* __RECO_ARCHIVE__ 按彩种分组（用户 2026-10-20：「排序分类好」/「不要空组」）：
   只有中过奖的彩种才出这一块；组头 = 彩种名 + 中了几注。 */
.ro-hist-grp { margin: 0 0 8px; }
.ro-hist-grp-h { display: flex; align-items: center; gap: 8px;
  padding: 4px 2px 6px; border-bottom: 1px solid var(--ro-line); }
.ro-hist-grp-g { font-size: 12.5px; font-weight: 900; color: var(--ro-fg); }
.ro-hist-grp-c { margin-left: auto; font-size: 11px; font-weight: 800;
  color: var(--ro-ok); white-space: nowrap; }
.ro-hist-row { border-top: 1px dashed var(--ro-line); padding: 7px 2px; }
.ro-hist-row:first-child { border-top: 0; padding-top: 2px; }
.ro-hist-top { display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  font-size: 12px; line-height: 1.5; }
.ro-hist-date { font-weight: 700; color: var(--ro-fg2); }
.ro-hist-game { font-weight: 800; color: var(--ro-fg); }
.ro-hist-issue { font-size: 11px; color: var(--ro-fg3); }
/* 奖项徽章：一等奖金色 · 二等奖橙色 · 三等奖蓝色 · 其余灰色 */
.ro-hist-tier { margin-left: auto; white-space: nowrap; font-size: 11px; font-weight: 800;
  border-radius: 10px; padding: 1px 8px; color: var(--ro-fg2);
  background: #f4ece0; border: 1px solid var(--ro-line); }
.ro-hist-t1 { color: #7a5300; background: #fbeec6; border-color: #e0c377; }
.ro-hist-t2 { color: #a33b17; background: #fdeadd; border-color: #efc6ab; }
.ro-hist-t3 { color: #1b4f97; background: #e7f0fb; border-color: #b9d2ef; }
/* 每条两行：推荐 / 开奖（号码一格一个，命中号高亮 —— 一眼看出中了哪几个）
   用【行内流】而不是 flex：号码多了会像文字一样自然折行，
   不会出现「标签单独占一行、号码整块掉到下一行」 */
.ro-hist-line { display: block; margin-top: 4px; font-size: 12px; line-height: 1.9; }
.ro-hist-tag { display: inline-block; vertical-align: 2px; margin-right: 6px;
  font-size: 10px; font-weight: 800; line-height: 1.5;
  color: var(--ro-fg2); background: #f4ece0; border: 1px solid var(--ro-line);
  border-radius: 6px; padding: 0 5px; }
.ro-hist-tag.is-draw { color: var(--ro-fg); background: #fbf3e4; }
.ro-hist-p { display: inline; }
/* 次要的一行（3D / 排三 的「6 码组选」）单独起一行，别挤在定位号后面 */
.ro-hist-p.is-br { display: block; margin-top: 1px; }
.ro-hist-p i { font-style: normal; font-size: 10.5px; color: var(--ro-fg3);
  margin: 0 1px 0 4px; }
.ro-hist-p:first-child i { margin-left: 0; }
.ro-hist-n { display: inline-block; min-width: 19px; text-align: center; font-weight: 900;
  font-size: 12.5px; color: var(--ro-fg); letter-spacing: .2px; }
.ro-hist-n.ro-hist-hit { color: #c0392b; font-weight: 900; background: #fdeaea;
  border-radius: 4px; }
.ro-hist-note { margin-top: 2px; font-size: 11px; line-height: 1.5; color: var(--ro-fg3);
  word-break: break-word; }
.ro-hist-empty { text-align: center; font-size: 12px; line-height: 1.6;
  color: var(--ro-fg3); padding: 8px 0 14px; }
.ro-hist-foot { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--ro-line);
  font-size: 11px; line-height: 1.6; color: var(--ro-fg3); text-align: center;
  word-break: break-word; }
/* 320 窄屏：字号与留白各收一档，长号码自动折行，绝不横向溢出 */
@media (max-width: 360px) {
  .ro-hist { margin-left: 8px; margin-right: 8px; padding: 10px 8px 0; }
  .ro-hist-h2 { font-size: 14px; }
  .ro-hist-sub { font-size: 10.5px; }
  .ro-hist-arrow { font-size: 10.5px; padding: 3px 8px; }
  .ro-hist-grp-g { font-size: 11.5px; }
  .ro-hist-grp-c { font-size: 10px; }
  .ro-hist-top { font-size: 11px; gap: 4px; }
  .ro-hist-issue { font-size: 10px; }
  .ro-hist-tier { font-size: 10px; padding: 1px 6px; }
  .ro-hist-line { font-size: 11px; line-height: 2; }
  .ro-hist-n { font-size: 10.5px; min-width: 15px; }
  .ro-hist-p i { font-size: 10px; }
  .ro-hist-note { font-size: 10px; }
  .ro-hist-meta, .ro-hist-foot { font-size: 10px; }
}
${P3D_SECTION_CSS}


/* ============================================================
   __EXPERT_BLOCK__ 专家推荐（用户新增指令：可展开收起）
   ------------------------------------------------------------
   头部 = 👤 + 标题 + 数量徽章 + 折叠箭头（箭头由 [open] 换字，和
   晒票 / GPT摇号 的 .ro-*-head 同一套做法，不新增第二套外观）。
   内容 = 8 个彩种分组，每组 10 行：排名 / 专家名 / 类别 / 命中率 /
   连中与最长 / 最近一期的中否。
   全部用变量色（--ro-*），米杏色主题自动生效。
   ⚠️ 纯文字，无图片 → data-image 不变（仍 21）。
   ============================================================ */
.ro-xj { background: var(--ro-card); border: 1px solid var(--ro-line);
  border-radius: 10px; margin: 0 12px 14px; overflow: hidden; }
.ro-xj > .ro-xj-header { display: flex; align-items: center; gap: 8px;
  padding: 11px 14px; cursor: pointer; list-style: none; user-select: none; }
.ro-xj > .ro-xj-header::-webkit-details-marker { display: none; }
.ro-xj > .ro-xj-header::marker { content: ''; }
.ro-xj-icon { font-size: 15px; }
.ro-xj-title { flex: 1; font-size: 14px; font-weight: 700; color: var(--ro-fg); }
.ro-xj-count { font-size: 11.5px; font-weight: 700; color: var(--ro-ok);
  background: #e8f6ef; border: 1px solid #b7e4cd; border-radius: 20px;
  padding: 2px 9px; }
.ro-xj-arrow { font-size: 12px; color: var(--ro-fg3); }
.ro-xj[open] > .ro-xj-header .ro-xj-arrow::after { content: '收起 ▴'; }
.ro-xj:not([open]) > .ro-xj-header .ro-xj-arrow::after { content: '展开 ▾'; }
.ro-xj-note { padding: 0 14px 8px; font-size: 11.5px; color: var(--ro-fg3); line-height: 1.7; }
.ro-xj-list { padding: 0 10px 4px; }
.ro-xj-group { border-top: 1px dashed var(--ro-line); padding: 8px 0 4px; }
.ro-xj-group:first-child { border-top: 0; }
.ro-xj-ghead { display: flex; align-items: baseline; gap: 8px; padding: 2px 4px 6px; }
.ro-xj-gname { font-size: 13px; font-weight: 700; color: var(--ro-fg); }
.ro-xj-gcount { font-size: 11px; color: var(--ro-fg3); }
/* 期号状态：最新已出号那一期 + 「下一期待出号」（只是事实标注，不预告号码） */
.ro-xj-giss { font-size: 10.5px; color: var(--ro-fg3); margin-left: auto; white-space: nowrap; }
.ro-xj-row { display: flex; align-items: center; gap: 8px; padding: 5px 6px;
  border-bottom: 1px dotted var(--ro-line-soft); font-size: 12px; }
.ro-xj-item:last-child .ro-xj-row { border-bottom: 0; }
/* 【本轮改版】行从 <div> 变成 <a role="button">（可点、可键盘聚焦）——
   去掉链接的下划线/默认色，外观和原来一模一样。 */
a.ro-xj-row { color: inherit; text-decoration: none; cursor: pointer;
  border-radius: 6px; -webkit-tap-highlight-color: transparent; }
a.ro-xj-row:focus-visible { outline: 2px solid var(--ro-ok); outline-offset: 1px; }
a.ro-xj-row.on { background: var(--ro-sunken); }
/* ---------- 展开后的逐期明细（内容 = expert-pool.js 的 expertDetailHtml()）----------
   ⚠️ 这些类名（.ex-drow / .ex-dhist…）在 App 的 styles.css 里有暗色样式；
      分享页不加载那份 CSS，所以这里补一套【只用变量色】的，
      米杏色/浅色主题自动生效。 */
.ro-xj-detail { padding: 4px 8px 8px; }
.ro-xj-detail[hidden] { display: none; }
.ro-xj-detail .ex-drow { font-size: 11.5px; color: var(--ro-fg2); line-height: 1.7; }
.ro-xj-detail .ex-drow b { color: var(--ro-ok); }
.ro-xj-detail .ex-drow-lb { margin: 6px 0 2px; font-weight: 700; color: var(--ro-fg); }
.ro-xj-detail .ex-dhist { display: flex; align-items: center; gap: 8px;
  padding: 3px 0; border-top: 1px dotted var(--ro-line-soft); font-size: 11px;
  color: var(--ro-fg2); }
.ro-xj-detail .ex-dissue { flex: 0 0 auto; color: var(--ro-fg3); }
.ro-xj-detail .ex-dcat { flex: 0 0 auto; color: var(--ro-fg3); }
.ro-xj-detail .ex-dpicks { flex: 0 0 auto; }
.ro-xj-detail .ex-dhits { flex: 1 1 auto; min-width: 0; color: var(--ro-fg);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ro-xj-detail .ex-dres { flex: 0 0 auto; font-weight: 700; }
.ro-xj-detail .ex-dhist.hit .ex-dres { color: var(--ro-ok); }
.ro-xj-detail .ex-dhist.miss .ex-dres { color: var(--ro-fg3); }
.ro-xj-rank { flex: 0 0 18px; text-align: center; font-size: 11px; font-weight: 700;
  color: var(--ro-fg3); }
.ro-xj-name { flex: 1 1 auto; min-width: 0; font-weight: 700; color: var(--ro-fg);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ro-xj-cat { flex: 0 0 auto; font-size: 11px; color: var(--ro-fg3); }
.ro-xj-rate { flex: 0 0 auto; font-size: 11.5px; font-weight: 700; color: var(--ro-ok); }
.ro-xj-streak { flex: 0 0 auto; font-size: 11px; color: var(--ro-fg2); }
.ro-xj-last { flex: 0 0 auto; font-size: 10.5px; font-weight: 700; border-radius: 5px;
  padding: 1px 7px; }
.ro-xj-last.hit { background: #fbe9e7; color: #c0392b; }
.ro-xj-last.miss { background: var(--ro-sunken); color: var(--ro-fg3); }
.ro-xj-more { text-align: center; font-size: 11.5px; color: var(--ro-fg3);
  padding: 8px 0 12px; }
@media (max-width: 420px) {
  /* ⚠️ 窄屏上这一行本来就挤（排名+名字+类别+命中率+连中+中否），
     实测 430px 下「中/未中」徽章会被挤出右边缘 ——
     把类别和中否收起来，保留最要紧的四项（排名/名字/命中率/连中）。
     数据没丢：宽屏或横屏下仍然看得到。 */
  .ro-xj-cat { display: none; }
  .ro-xj-last { display: none; }
}

  /* __HOT_OWNER__ 热度计数：默认隐藏，只有 owner 才显示
     ⚠️ 用户 2026-10-18：「顶部怎么不同呢 我要竞彩那页顶部模块」——
     原因就是这个浮标 top:8px/left:8px 正好压在顶部 Tab（彩票推荐 / 竞彩-足球）上，
     把切换按钮挡住点不到。现在挪到 Tab 条下面（top:52px） */
  .ro-hot {
    position: fixed; top: 52px; left: 8px; z-index: 9990;
    display: none; align-items: center; gap: 3px;
    padding: 3px 9px 3px 7px; border-radius: 12px;
    background: rgba(255,255,255,.86);
    border: 1px solid var(--ro-line);
    box-shadow: 0 1px 4px rgba(0,0,0,.06);
    font-size: 12.5px; font-weight: 700; line-height: 1.5;
    color: #c0392b; user-select: none;
  }
  .ro-hot:not([hidden]) { display: inline-flex; }
  .ro-hot-i { font-size: 13px; }
  .ro-hot-n { letter-spacing: .4px; }
  @media print { .ro-hot { display: none !important; } }

  /* __TOC_EQH__ 推荐图目录：所有卡片统一高度，消除「行被撑高留空档」
     用户 2026-10-17：「这一块的布局是贴合的」→ 选方案 A（等高等宽）
     · 固定高度 56px：一行的标题居中；两行的标题缩到 12.5px 也放得下
     · 文字超长时自动省略，不再撑高整行
     · 只作用在 .ro-imgtoc 里的格子，不影响别处 */
  .ro-imgtoc .ro-toc-cell {
    height: 56px !important;
    min-height: 56px !important;
    max-height: 56px !important;
    padding: 4px 8px !important;
    align-items: center !important;
    justify-content: center !important;
    line-height: 1.28 !important;
    overflow: hidden !important;
    font-size: 14px !important;
  }
  /* 两行文字的格子：字号收一点，保证在 56px 内不挤、不溢出 */
  .ro-imgtoc .ro-toc-cell br + *,
  .ro-imgtoc .ro-toc-cell.two-line { font-size: 12.5px !important; }
  .ro-imgtoc .ro-toc-cell > * { max-height: 100%; overflow: hidden; }
  /* 网格行：让每行高度由固定 56px 决定，不再被内容撑开 */
  .ro-imgtoc { grid-auto-rows: 56px !important; }

/* ============================================================
   【紧凑排版】统一收口层
   ------------------------------------------------------------
   用户要求：「整个版面压缩一下，零零闪闪不好看」——
     ① 顶部 Tab → 主标题 → 提示条 → 推荐图目录 间距统一收紧
     ② 所有区块 margin-bottom 统一 12px（原来 0/2/12/14/16/22/24/26/40 九种）
     ③ 卡片内边距统一 12px（原来 0/12/14/15/16/22/30 七种）
     ④ 标题/副标题间距统一 4px
     ⑤ 页面上下空白收敛（原来 wrap pt8/pb40、foot pt30/pb50、disclaimer mb40）
     ⑥ 紧凑连贯，但行高保持 ≥1.4、字号一律不缩小

   ⚠️ 本层只改【纵向间距】：margin-bottom / padding-top / padding-bottom。
      绝不用 padding/margin 简写 —— 横向内边距一个都不碰。
   ⚠️ 不写任何 font-size，也不压 line-height。
   ⚠️ 放在样式表最后，靠级联覆盖之前的散值；要回滚删掉整层即可。
   ============================================================ */
:root {
  --c-gap: 12px;      /* 区块之间统一间距 */
  --c-pad: 12px;      /* 卡片统一内边距 */
  --c-title: 4px;     /* 标题与副标题之间 */
}

/* ---------- ② 区块之间统一 12px ---------- */
.ro-wrap > * { margin-bottom: var(--c-gap); }
#article > * { margin-bottom: var(--c-gap); }
#article-rest > * { margin-bottom: var(--c-gap); }
.ro-status, .ro-imgtoc-wrap, .ro-tools,
.ro-xysp, .ro-aipick, .ro-xj, .trend-entry, .p3d-section,
.ro-articles, .ro-game, .ro-art-group { margin-bottom: var(--c-gap); }
/* 分隔条原来 mt34/mb26，是整页最大的一处断口 */
.ro-divider { margin-top: 14px; margin-bottom: var(--c-gap); }
/* 免责声明原来 mb40 */
.ro-disclaimer { margin-bottom: var(--c-gap); }

/* ---------- ③ 卡片内边距统一 ---------- */
.ro-status,
.ro-xysp, .ro-aipick, .ro-articles,
.trend-entry, .ro-art-group { padding-top: var(--c-pad); padding-bottom: var(--c-pad); }
/* 各个折叠块的入口行（点击查看/收起那一行）也统一 */
.ro-xysp > summary, .ro-aipick > summary, .p3d-head, .ro-xj > summary,
details.ro-xysp > summary, details.ro-aipick > summary { padding-top: 10px; padding-bottom: 10px; }

/* ---------- ⑤ 页面上下空白收敛 ---------- */
/* 用户 2026-10-20「顶部稍微往上缩一点点」→ padding-top 6px → 0 */
.ro-wrap { padding-top: 0; padding-bottom: 18px; }
.ro-foot { padding-top: 18px; padding-bottom: 22px; }
.ro-disclaimer { padding-top: 14px; padding-bottom: 14px; }

/* ---------- ① 顶部四段收紧（Tab → 主标题 → 提示条 → 目录）---------- */
.top-tabs { margin-bottom: 0; }
.ro-top { padding-top: 10px; padding-bottom: 10px; }
.ro-status { margin-bottom: var(--c-gap); }

/* ---------- ④ 标题/副标题间距统一 4px ---------- */
.ro-top h1, .ro-title { margin-bottom: var(--c-title); }
.ro-sub, .ro-art-sub, .p3d-sub, .chart-sub { margin-top: 0; }
.ro-aipick-head, .ro-xysp-head { margin-bottom: var(--c-title); }
.p3d-block-title { margin-bottom: 6px; }

/* ============================================================
   【紧凑排版·打穿 !important】
   ------------------------------------------------------------
   页面里有个「米杏色覆盖块」用了 147 个 !important，把 7 处纵向间距锁住了，
   普通声明压不动，所以这里对这 7 处显式补 !important。
   ⚠️ 只覆盖【纵向】长属性；横向内边距/外边距一律不动（照抄原值的横向部分）。
   ⚠️ 不写 font-size、不写 line-height。
   ============================================================ */
.ro-top { padding-top: 10px !important; padding-bottom: 10px !important; }
.ro-status { margin-bottom: var(--c-gap) !important; }
.ro-imgtoc { padding-bottom: 12px !important; }
.ro-tools { padding-bottom: 12px !important; }
.ro-tool { padding-top: 12px !important; padding-bottom: 12px !important; }
.ro-art-groups { padding-bottom: 12px !important; }
.ro-game { padding-bottom: 12px !important; }
/* 折叠块入口行（点击查看/收起那行）统一 */
.ro-xysp > .ro-xysp-head, .ro-aipick > .ro-aipick-head { padding-top: 8px !important; padding-bottom: 8px !important; }

/* ============================================================
   __RO_DARK_LEFT__ 还残留的深底区块 → 米杏色（只改配色，内容一个字不动）
   ------------------------------------------------------------
   为什么还得补这一块：上面那层浅色覆盖用的是【属性选择器】
   （[style*="#0f1115"] / [style*="#161a21"] / [style*="#12151d"]），
   只对【行内样式】生效；而下面这几个区块的底色写在【类规则】里，
   一直是深色没被换掉。实测（真浏览器读 computed style，排除 canvas/img/svg）：
     · section.ro-articles   文章参考的外层容器   rgb(18,22,29)
     · .ro-art-body          文章正文展开区       rgb(18,22,29)
     · div.ro-disclaimer     免责声明（所有实例）  rgb(18,21,27)
     · div.ro-drawblock      开奖号码块（多个）    rgb(22,26,33)
   ⚠️ 只写背景 / 边框 / 文字色，不动布局、字号、间距、圆角、内边距。
   ⚠️ 颜色一律走页面已有变量（--ro-card / --ro-sunken / --ro-line / --ro-fg / --ro-fg2），
      不引新色；以后换主题只改变量。
   ⚠️ canvas / img / svg 出的图（推荐图 / 热力图 / 手绘图）不在这里面，保持深色。
   ⚠️ 必须写在样式表【最后】：同文件后面还有 .ro-art-head / .ro-xysp-head 那类规则，
      写在前面会被顺序盖掉（上次踩过）。 */
.ro-articles { background: var(--ro-card) !important; border: 1px solid var(--ro-line) !important; color: var(--ro-fg) !important; }
.ro-art-body { background: var(--ro-sunken) !important; border: 1px solid var(--ro-line) !important; color: var(--ro-fg) !important; }
.ro-art-body p, .ro-art-body .ro-art-p { color: var(--ro-fg) !important; }
.ro-art-link, .ro-art-body a { color: var(--ro-link) !important; }
.ro-disclaimer { background: var(--ro-card) !important; border: 1px solid var(--ro-line) !important; color: var(--ro-fg2) !important; }
.ro-disclaimer h3 { color: var(--ro-fg) !important; }
.ro-disclaimer p { color: var(--ro-fg2) !important; }
.ro-drawblock { background: var(--ro-card) !important; border: 1px solid var(--ro-line) !important; color: var(--ro-fg) !important; }
/* 洛书九宫图那个「0 单独外置」格（#luoshuZero）—— 它是 DOM 格、不是 canvas，
   实测底色 rgb(22,26,33) 是深色，跟着一起换成米杏（用户 2026-10-17 确认）。 */
.luoshu-zero, .luoshu-zero.pick, .luoshu-zero.hit {
  background: var(--ro-sunken) !important;
  border: 1px solid var(--ro-line) !important;
}

/* ============================================================
   【顶部三段统一 12px】
   ------------------------------------------------------------
   实测压缩后顶部三段是 10 / 26 / 12px（不统一，26 那处刺眼）。
   这里把三段做成一致的 12px：
     .ro-top 上下 padding 10 → 12 / 0（h1 的下边距归零）
   依据：h1 与 .ro-top 的 margin-bottom 会和外层合并，所以
         「主标题→提示条」最终只等于 .ro-top 自己的 margin-bottom（12px）。
   ⚠️ 只动纵向；只在这两处加 !important（原值被页面的 !important 锁着）。
   ============================================================ */
.ro-top { padding-top: 12px !important; padding-bottom: 0 !important; }
.ro-top h1 { margin-bottom: 0 !important; }
/* ============================================================
   __ALGO_LINE__ 顶部「交流探讨」（用户 2026-10-20）
   ------------------------------------------------------------
   用户原话：「下面加内容：交流探讨，这一栏字迹斜着放」
   澄清（弹窗问过）：位置 = 「小晴推荐师 / yy2528161812」那一块【下面】；
                     斜着放 = 【整行文字旋转】，不是斜体、不是阶梯排。
   · 只是装饰性小标题：纯文字、不可点、没有按钮、没有内容区（用户没说要点）
   · 原 rotate(-6deg) + transform-origin:left center（右端抬起 6px）已被替换，
     见下面第二段注释（2026-10-20 二次改：三条 15°）
   · 字号 14px / 颜色 var(--ro-fg2) / 字重 600 —— 看得见但不抢标题
   ============================================================ */
/* 斜 15°：三条统一（用户 2026-10-20：三条都斜着15°）
   .ro-owner = 小晴推荐师 / .ro-user = yy2528161812（见顶部作者块 HTML）
   方向取 -15deg（右端抬高），和原来交流探讨的 -6deg 同向，只是角度加大；
   三条同向 → 文字带互相平行，原 5px 行距视觉不变、不会互相压字。
   transform-origin 统一 center center：绕自己中心转，上下左右溢出最小。 */
.ro-owner, .ro-user {
  transform: rotate(-15deg);
  transform-origin: center center;
}
/* 交流探讨：整行水平居中（用户 2026-10-20：算法讨论居中在下面）
   margin-bottom 4 → 10：斜 15° 后包围盒会往下探 ~7px，留 10px 才不贴到「春风」 */
.ro-algo-line { text-align: center !important; padding: 0 16px; margin: 12px 0 10px;
  line-height: 1.5; }
.ro-algo-line span { display: inline-block; transform: rotate(-15deg);
  transform-origin: center center; font-size: 14px; font-weight: 600;
  color: var(--ro-fg2); letter-spacing: 1px; }
/* ============================================================
   【顶部作者块 · 收紧 + 三条对齐】（用户 2026-10-20 第三次要求）
   ------------------------------------------------------------
   用户原话：「交流探讨到小晴推荐师下面字母的下面居中」「右上角那句问候不要了」
            「上面空白在锁紧一点」「尽量把小晴推荐师 字母还有交流探讨靠近卡片栏」
   ① 对齐：三条（小晴推荐师 / yy2528161812 / 交流探讨）装进一个竖列 .ro-author：
      · 列宽 = max-content（= 最长那行 yy… 的宽度），三行都是 display:block，
        于是三条的【盒子宽度相同】，再统一 text-align:center
        → 旋转后三条的包围盒中心 x 完全一致（实测差 0.00px）
      · 之前交流探讨在 .ro-top 里单独一行、按整行宽居中（中心 = 屏幕中心），
        而作者两行贴左边 → 视觉上「偏右下」，这就是用户看到的问题
   ② 收紧：行距 1.5 → 1.3；作者两行之间 5px → 3px；
      交流探讨上边距 12 → 3、下边距 10 → 0（斜 15° 的包围盒自己去撑开，不会压字）
   ③ 靠近状态卡：.ro-top 上 padding 12 → 10、下 margin 12 → 4；春风 h1 上下 2 / 0
   ④ 颜色/字号沿用原内联样式（小晴推荐师 12px 粗 #5c5248，yy 12px #7d7266）
   ⚠️ 只动这一个块的排版；三条仍然是斜 15 度（见上面 .ro-owner/.ro-user 规则） */
.ro-author { display: block !important; width: max-content; max-width: 100%;
  margin: 0 auto 0 16px !important; padding: 0 !important; text-align: center !important; }
.ro-author .ro-owner { display: block; margin: 0 !important;
  font-size: 12px; font-weight: 700; color: #5c5248; line-height: 1.3 !important; }
.ro-author .ro-user { display: block; margin: 3px 0 0 !important;
  font-size: 12px; color: #7d7266; line-height: 1.3 !important; }
.ro-author .ro-algo-line { margin: 3px 0 0 !important; padding: 0 !important;
  text-align: center !important; line-height: 1.3 !important; }
/* 顶部三段收一收：Tab 条 → 作者块 / 作者块 → 春风 → 状态卡 */
.ro-top { padding-top: 10px !important; padding-bottom: 0 !important; margin-bottom: 4px !important; }
.ro-top h1 { margin-top: 4px !important; margin-bottom: 0 !important; }
/* 管理员徽章（只有本机 owner 看得到，用户截图上那一行）：上下留白 2 → 0、
   内边距 6 → 3，给「小晴推荐师」让出 ~10px（别人的页面本来就没有这一行） */
#owner-badge { margin: 0 0 0 auto !important; padding: 3px 10px !important; }
/* ============================================================
   【Tab 条上方封严】（用户 2026-10-20：「下滑的时候 tab 上面尽量封严实一点
   不要露出字出来」）
   ------------------------------------------------------------
   原因：Tab 条是 sticky top:0 的实色条，但它【上面】没有东西挡；一旦
   浏览器把它顶到 0 以外（或安全区那一小条没被盖住），下面滚动的正文
   就会从那条缝里透出来 → 看得到字在 Tab 上面滑动。
   做法（方案 B 变体）：一块 fixed 的米杏封盖贴在视口顶上，
     · 高 43px：正好垫在 Tab 条（44px）【后面】，不压 Tab 文字、不挡
       .ro-stbar(34px, top:44) / .ro-status(top:44) 这两个吸顶块；
     · 层级 54：高于正文（0~50），低于 Tab 条的 60 和 🔥 热度(9990)；
     · 颜色 = var(--ro-bg) 米杏色，和页面底色完全一致（不是半透明）；
     · pointer-events:none —— 不吃任何点击/滑动。
   ⚠️ 故意【不给 Tab 条加 padding-top: env(...)】：那会让固定区变成
      44+34 之外再加安全区高度，破坏之前锁定的「固定区 ≤ 80px」。
      安全区那一小条由这块封盖 + Tab 条自己的实色底一起盖住。 */
body::before {
  content: ''; position: fixed; left: 0; right: 0; top: 0;
  height: 43px; background: var(--ro-bg, #f7efe1);
  z-index: 54; pointer-events: none;
}
/* ============================================================
   【文字对比度 · 最终修正】米杏底上"看不清"的字统一加深（用户 2026-10-17）
   ------------------------------------------------------------
   依据：真浏览器逐文本节点实测（_contrast_probe.mjs —— 比较"颜色"和它**真正的背景**，
        不是猜；排除 canvas/img/svg）。实测最差的 10 组（达标线 4.5）：
     #e8eaed 1.06  .hc-gn            开奖卡彩种名（8 处）
     #ffffff 1.07  .ro-aipick-*.on   选号面板选中态 —— 白字压在米杏底上，等于看不见（3 处）
     #e8c877 1.42  .hc-nextcd        开奖卡倒计时（8 处）
     #c8cfda 1.46  .ro-art-gname     文章参考的彩种名（5 处）
     #8fb8ff 1.87  .ro-xysp-cap b    晒票卡片的彩种名（378 处）
     #9aa6b8 2.29  .ro-aipick-lbl    选号面板标签（5 处）
     #d9a300 2.29  .shape-baozi      手绘图表格里的"豹子"格（白底，1 处）
     #a2937c 2.43  "还没摇号 / 未中"  提示文字（19 处）
     #8b93a1 2.71  .hc-iss           开奖卡期号（8 处）
     #a2937c 2.79  .ro-xysp-cap i    晒票卡片的副标题（165 处）
   三档口径（用户给）：主文字 var(--ro-fg) #4a3a26 · 次要 var(--ro-fg2) #8a7a63 · 最弱 var(--ro-fg3) #a2937c
   ⚠️ 只改颜色（原有 font-weight:700 一律保留），不动任何文字内容 / 字号 / 间距 / 布局。
   ⚠️ canvas / img / svg 出的图（推荐图 / 热力图 / 手绘图）不在这里面，保持深色。
   ⚠️ 必须写在样式表【最后】（紧邻样式表的结束标签）—— 前面那些 .ro-art-* / .hc-* 规则会盖掉它。
   ⚠️ ⚠️ 这段注释里【绝对不能出现 style 的结束标签字面量，也不能出现反引号】：
        · 结束标签字面量 → HTML 解析器提前关掉整个 style 块；
        · 反引号 → 会提前闭合本文件包住这段 CSS 的 JS 模板字符串（直接 SyntaxError）。
        这次真踩了：CSS 只解析到 .ro-top h1 那条，我这 20 多条一条都没生效，
        页面上还漏出一堆 CSS 文本。 */
/* ① 文章参考：彩种名加深 + 加粗；「N 篇」次要色；"点击查看/收起"绿色；底色/边框显式米杏 */
.ro-art-group { background: var(--ro-card) !important; border: 1px solid var(--ro-line) !important; }
.ro-art-group > summary.ro-art-gname { color: var(--ro-fg) !important; font-weight: 700 !important; }
.ro-art-group > summary.ro-art-gname i { color: var(--ro-fg2) !important; font-weight: 400 !important; }
.ro-art-group > summary.ro-art-gname .ro-art-tip::after { color: var(--ro-ok) !important; }
.ro-art-body { background: var(--ro-sunken) !important; border-color: var(--ro-line) !important; }
.ro-art-empty, .ro-art-note { color: var(--ro-fg2) !important; }
.ro-art-item.ro-art-nobody .ro-art-link { color: var(--ro-fg3) !important; }
.ro-art-link, .ro-art-body a { color: var(--ro-link) !important; }
.ro-art-link:hover, .ro-art-link:active { color: var(--ro-link) !important; }   /* 原来 hover 是浅蓝 #bcd4ff（1.4） */
/* ② 开奖号码卡片：彩种名 / 期号 / 日期 / 倒计时 */
.hc-gn { color: var(--ro-fg) !important; font-weight: 700 !important; }
.hc-iss, .hc-date, .hc-rgame { color: var(--ro-fg2) !important; }
.hc-nextcd { color: var(--ro-time) !important; }                                /* 原浅金 #e8c877 只有 1.42 */
/* ③ 晒票卡片：彩种名（主文字）+ 下面的时间/期号（次要） */
.ro-xysp-cap b { color: var(--ro-fg) !important; }
.ro-xysp-cap i { color: var(--ro-fg2) !important; }
/* ④ 选号面板：标签用次要色；选中态给实心绿（原来是白字压米杏底，等于看不见） */
.ro-aipick-lbl { color: var(--ro-fg2) !important; }
.ro-aipick-srcbtn.on, .ro-aipick-segbtn.on, .ro-aipick-btn.on,
.ro-aipick-tab.on, .ro-aipick-kl8tab.on { background: var(--ro-ok) !important; color: #fff !important; }
.ro-aipick-empty { color: var(--ro-fg2) !important; }
.ro-xj-last.miss { color: var(--ro-fg2) !important; }
.ro-aipick-rule, .ro-tool em, .ro-kjh-issue, .ro-kjh-extra, .ro-imgtoc-sub, .ro-st-time { color: var(--ro-fg2) !important; }
/* ⑤ 悬停态：浅蓝/浅金一律换成可读的深色或主色 */
.ro-xysp-tab:hover, .ro-xysp-tab:active, .ro-aipick-tab:hover, .ro-aipick-tab:active,
.ro-aipick-kl8tab:hover, .ro-aipick-segbtn:hover, .ro-aipick-pick:hover, .ro-aipick-pick:active { color: var(--ro-fg) !important; }
/* ⑥ 零散：手绘图表格里的金色字（白底 2.29）用项目已有的深金 #8a6a00；标题类统一主文字 */
.metric-table td.shape-baozi { color: #8a6a00 !important; }
.p3d-type-btn { color: var(--ro-fg2) !important; }
.ro-gamehead h2, .ro-imgtoc-title, .ro-art-title, .ro-xysp-h2, .ro-aipick-h2, .ro-disclaimer h3 { color: var(--ro-fg) !important; }
/* ⑦ 收尾补漏（同样以真浏览器实测为准）
   · 「 / 清空」这类按钮：原 #8b93a1（2.88）→ 主文字色
   · 手绘图里选中的彩种标签（浅绿底 #e3f2ea）：次要色只有 3.6 → 主文字色
   · 洛书九宫图的「外置 0 号」黑圆：按用户 ④（手绘图保持深色）【底色不动】，
     只把上面的蓝字（#1f5fd6 压深底只有 3.05）改成浅色，看得清。 */
.ro-aipick-btn.ghost { color: var(--ro-fg) !important; }
.p3d-type-btn.active { color: var(--ro-fg) !important; }
/* ⚠️ 【修正】原来这里是 color: #f2ead9 —— 写它的时候前提是「黑圆底色不动」
   （见上面 ④ 的注释）。但同文件更早的那层已经把这个格的底色换成了米杏
   （.luoshu-zero { background: var(--ro-sunken) }，用户确认过的）——
   两层前提矛盾，结果浅米字压米杏底，对比度只有 1.03，那句话等于看不见。
   用户 2026-10-17 决定：「底色保留米杏、把文字改成看得见」。
   所以这里改成次要文字色；.pick / .hit 的强调色仍由 p3d-section.mjs
   （.luoshu-zero.pick → 链接蓝 / .hit → 危险红）单独管。 */
#luoshuZero, .luoshu-zero { color: var(--ro-fg2) !important; }
/* ⑧ 金色球（.lm-ball.lm-gold，洛书/球那套新加的元素）：白字压金底实测只有 2.29，
      改成深棕字（对金底 ≈5.1）—— 球还是金色，只是号码看得清。 */
.lm-ball.lm-gold { color: var(--ro-fg) !important; }
/* ⑨ 主标题「春风」：红字 + 白边 + 立体感
      （用户 2026-10-17 连着三条要求：「改成红色字体」→「红字白边」→「有立体感」）
      做法：
        · 红字：#d92b2b（亮红，大字用，米杏底上 ≈4.3 —— 22px/800 属大字号，达标）
        · 白边：-webkit-text-stroke 3px 白 + paint-order:stroke fill
                （关键：paint-order 让白边画在红字【外面】，否则描边会吃掉笔画变细）
        · 立体感：三层逐级压深的红（0 1px→0 3px）做出"厚度"，再加一层柔和落地投影
        · 兜底：不支持 text-stroke 的引擎靠 text-shadow 的那几层也能看出白边+厚度
      只改这一个标题，页面别的字一律不动。 */
.ro-top h1 {
  color: #d92b2b !important;
  -webkit-text-stroke: 3px #ffffff !important;
  paint-order: stroke fill;
  text-shadow:
    0 1px 0 #ffffff, 0 -1px 0 #ffffff, 1px 0 0 #ffffff, -1px 0 0 #ffffff,
    0 2px 0 #b3201f, 0 3px 0 #9c1a1a, 0 4px 0 #831616,
    0 6px 9px rgba(80, 20, 16, .30) !important;
}

/* ============================================================
   推荐图目录：手机窄屏整齐化（用户 2026-10-17）
   ------------------------------------------------------------
   实测（headless 335px，真浏览器量 box）：__TOC_EQH__ 的固定 56px 其实【已经在生效】
   （10 个格子全是 56px 高）——真正的问题是【长名字折 3 行 → 溢出被裁】：
     .ro-toc-cell scrollHeight 62 > 56，第三行被 overflow:hidden 切掉，
     所以看起来"高矮不齐 + 一片空档"。
     ① 强制等高：沿用固定 56px + 网格行高，这里再显式兜一层（防被后面的规则盖掉）
     ② 主标题 + 副标题：长名字拆成两行小字（配合 TOC_ROWS 里的 s 字段，一行放得下）
     ③ 兜底：< 360px 改单列（两列时每格只有 ~150px，塞长字必然折行）
   ⚠️ 只动布局/字号/颜色；点击功能照旧（整块都在 a 标签里，JS 也是按 .ro-toc-cell 找的）。
   ⚠️ 目录格子数不变（5 行 × 2 列 = 10 格，不变量「ro-toc-cell ≥ 10」保持）。 */
.ro-imgtoc .ro-toc-cell { display: flex !important; flex-direction: column !important;
  align-items: center !important; justify-content: center !important;
  height: 56px !important; min-height: 56px !important; max-height: 56px !important;
  overflow: hidden !important; padding: 4px 8px !important; line-height: 1.22 !important; }
.ro-imgtoc { grid-auto-rows: 56px !important; }
.ro-imgtoc .ro-toc-cell .ro-toc-t { display: block; font-size: 13.5px; font-weight: 700; color: var(--ro-fg); }
.ro-imgtoc .ro-toc-cell .ro-toc-s { display: block; font-style: normal; font-weight: 400;
  font-size: 10.5px; margin-top: 1px; color: var(--ro-fg2); white-space: nowrap; }
.ro-imgtoc .ro-toc-cell.two-line { font-size: 13.5px !important; }
@media (max-width: 360px) {
  /* ★ 用户锁定 · 2026-10-19：窄屏也必须是「一排 2 个」（用户原话：2+2+2+2+2） */
  .ro-imgtoc { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  .ro-imgtoc .ro-toc-cell .ro-toc-t { font-size: 15px; }
  .ro-imgtoc .ro-toc-cell .ro-toc-s { font-size: 11.5px; }
}

/* ============================================================
   【专家推荐 · 入口行居中】用户 2026-10-17 截图点名：「居中」。
   ------------------------------------------------------------
   原来这一行是 flex：图标 + 标题(flex:1) + 人数 + 展开箭头，
   标题虽然占剩余宽度，但左右都被挤着 → 视觉上是【左对齐】；
   而「走势图」「文章参考」那几行都是居中标题，风格不统一。
   做法：把 图标 / 人数 / 箭头 移出文档流（绝对定位钉在左右两端），
   标题独占整行 + text-align:center ⇒ 真正居中，两端信息一个不少。
   ⚠️ 只动这一行的排版：不改文案、不改结构、不加删元素。 */
.ro-xj > .ro-xj-header { position: relative; }
.ro-xj > .ro-xj-header .ro-xj-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); }
.ro-xj > .ro-xj-header .ro-xj-count { position: absolute; right: 62px; top: 50%; transform: translateY(-50%); }
.ro-xj > .ro-xj-header .ro-xj-arrow { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); }
.ro-xj > .ro-xj-header .ro-xj-title { flex: 1 1 auto; text-align: center; }

/* ============================================================
   【推荐图目录 · 宽一点居中】用户 2026-10-17 截图圈了「推荐图目录」说「宽一点居中」。
   ------------------------------------------------------------
   实测（视口 676）：这块被两层 12px 内边距夹住 ——
     .ro-wrap 的 padding: 0 12px（12px）+ 自己那句 .ro-imgtoc { padding: 0 12px 12px }（12px）
   ⇒ 左右各空 24px，格子显得窄。
   做法：这一块【贴到屏幕两边】——用负外边距抵消 .ro-wrap 的 12px，
         表格自己的左右内边距收成 6px；整块仍然居中（左右对称），格子变宽。
   ⚠️ 只在窄屏（≤1365px）生效，和「目录只在窄屏显示」的规则一致；
      不影响别的区块、不动全局 padding。 */
@media (max-width: 1365px) {
  /* 【推荐图目录 · 宽一点居中】用户 2026-10-17。
     原来：<table> + <td width:50%>，实测列宽被表格布局钉住 → 两列只占中间一段。
     现在：markup 改成 grid 容器，这里把两列钉成等分、铺满、左右对称。
     负外边距抵消 .ro-wrap 的 12px 内边距 → 整块贴到屏幕两边。 */
  .ro-imgtoc-wrap { margin-left: -12px !important; margin-right: -12px !important; }
  .ro-imgtoc {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;   /* 两列等宽 */
    gap: 6px !important;
    width: 100% !important;
    padding: 0 6px 12px !important;
    box-sizing: border-box !important;
    border-collapse: unset !important;
  }
  .ro-imgtoc .ro-toc-cell { width: 100% !important; box-sizing: border-box !important; }
  /* 兼容：万一别处还有旧的 <table class="ro-imgtoc" data-user-locked="1" style="display:grid !important;grid-template-columns:repeat(2,minmax(0,1fr)) !important;gap:8px !important">（缓存/旧页面），也别再挤 */

  table.ro-imgtoc { table-layout: fixed !important; width: 100% !important; }
  table.ro-imgtoc td { width: 50% !important; padding: 3px 5px !important; }
}

/* ============================================================
   【手机端 8px 横向溢出 · 修】用户 2026-10-17
   ------------------------------------------------------------
   现象：375 / 320 手机上页面能左右拉一点点 ——
         document.documentElement.scrollWidth 比 clientWidth 大 8px。
   真浏览器量出来的元凶是【推荐图目录】那块 .ro-imgtoc-wrap，
   不是走势图表格（走势图表格外面那层 .tr-scroll 已经 overflow-x: auto，
   它自己溢出的部分被裁掉了，不参与文档宽度）。
   为什么多出 8px：
     · ≤1365px 那句 margin-left/-right: -12px 是为了抵消 .ro-wrap 的 12px 内边距
       → 整块贴屏幕两边；
     · 但 ≤600px 那句把 .ro-wrap 的内边距改成了 4px（padding: 8px 4px 40px）；
     ⇒ 负外边距比内边距多抵消 8px：
        块宽 = (375 - 8) + 12 + 12 = 391，left = 4 - 12 = -8，right = 383
        ⇒ 左边跑出 -8（不产生滚动）、右边超出 8 ⇒ 文档多出 8px 横向滚动。
   修法：让负外边距【跟着内边距走】—— 用一个变量存 .ro-wrap 的左右内边距，
        两处都读它，以后谁再改内边距都不会再错位。
   ⚠️ 只动这一处外边距：不改结构、不改 .tr-scroll（横向滚动照旧）、
      不改任何颜色 / 字体 / 断点，不引入任何脚本。
   ============================================================ */
.ro-wrap { --ro-pad-x: 12px; }
@media (max-width: 600px) {
  .ro-wrap { --ro-pad-x: 4px; }   /* 和上面 .ro-wrap { padding: 8px 4px 40px } 保持一致 */
}
.ro-imgtoc-wrap {
  margin-left: calc(-1 * var(--ro-pad-x, 12px)) !important;
  margin-right: calc(-1 * var(--ro-pad-x, 12px)) !important;
  max-width: 100vw;
  box-sizing: border-box;
}

/* ============================================================
   __MQ_TICKER__ 顶部状态卡右侧：中奖播报滚动条
   ------------------------------------------------------------
   用户要求：在「已更新 / 所有资料均在下方 / 下一期更新倒计时」那张卡片的
   右边空位做一条横向滚动的小喇叭通告（播报最近的开奖中奖情况）。
   · 纯 CSS 动画（keyframes + transform），不用废弃的 marquee 标签、
     不用 button、不引任何外部图片；喇叭图标是 emoji。
   · 米杏色：底 var(--ro-sunken) · 边框 var(--ro-line) · 字 var(--ro-fg2) ·
     中奖等级用醒目金 var(--ro-warn)，最高档（一等奖 / 直选）用 var(--ro-danger)。
   · 轨道里放两组一模一样的条目 → translateX(-50%) 正好退一组，无缝循环。
   · 鼠标悬停 / 点按 / 键盘聚焦时暂停，方便看清一条。
   · 窄屏（<=560px）改成上下两块：左边三段字本来就占满，右边只剩几十像素，
     并排会挤成一条看不清；改成上下后宽度占满、高度只多 26px。
   · 高度 26px，和左边三段字并排不会把卡片撑高。
   ⚠️ 这段写在样式表最后：同优先级后者胜，不用堆 !important 就能盖住前面的规则。
   ============================================================ */
.ro-status.ro-st-row {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
}
.ro-status.ro-st-row > .ro-st-txt { flex: 0 1 auto; min-width: 0; }

.ro-mq {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 26px;
  box-sizing: border-box;
  padding: 0 9px;
  border-radius: 8px;
  background: var(--ro-sunken);
  border: 1px solid var(--ro-line);
  overflow: hidden;
}
.ro-mq-ico { flex: 0 0 auto; font-size: 13px; line-height: 1; }
.ro-mq-view { flex: 1 1 0; min-width: 0; overflow: hidden; }
.ro-mq-track {
  display: flex;
  width: max-content;
  will-change: transform;
  animation-name: ro-mq-roll;
  animation-duration: 26s;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.ro-mq-group { display: flex; align-items: center; flex: 0 0 auto; }
.ro-mq-item {
  font-size: 12px; line-height: 26px; color: var(--ro-fg2);
  white-space: nowrap; padding-right: 28px;
}
.ro-mq-item b { font-weight: 700; color: var(--ro-fg); }
.ro-mq-item i { font-style: normal; font-weight: 700; color: var(--ro-warn); }
.ro-mq-item.mq-top i { color: var(--ro-danger); }
/* 用户 2026-10-18：「喇叭里不要带上最近推荐中奖多少期」——
   汇总那一条（.mq-rate）和它的配色规则一起删掉，喇叭里只有中奖播报。 */
.ro-mq-none {
  display: block; font-size: 12px; line-height: 26px; color: var(--ro-fg2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
@keyframes ro-mq-roll {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
.ro-mq:hover .ro-mq-track,
.ro-mq:active .ro-mq-track,
.ro-mq:focus-within .ro-mq-track { animation-play-state: paused; }
/* 系统开了「减少动态效果」→ 不滚了，改成可以横向拖动看 */
@media (prefers-reduced-motion: reduce) {
  .ro-mq-track { animation: none; }
  .ro-mq-view { overflow-x: auto; }
  .ro-mq-view::-webkit-scrollbar { height: 0; }
}
/* 窄屏：上下两块
   ⚠️ 这里必须把 flex 改回 0 0 auto：竖排时 flex 的「主尺寸」是高度，
      上面那条 flex: 1 1 0 会把高度压成 0（实测只剩 2px 边框）。 */
@media (max-width: 560px) {
  .ro-status.ro-st-row {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 8px !important;
  }
  .ro-mq { flex: 0 0 auto; width: 100%; }
}

/* ============================================================
   ⑧【开机号 + 热力图 · 并排两列】
   ------------------------------------------------------------
   用户原话（2026-10-18）：「把开机号和热力图改成并排两列」
   结构（.grid-2-col 里两张卡，左 = 开机号 <a>，右 = 热力图 <details>）：
     收起 → 两列并排，各占一半；点开热力图 → 它占满整行（图要宽）。
   · 左边沿用原来的 .ro-tool 点击逻辑（<a href="#ro-kjh">，不是 button）；
     右边沿用原来的 <details> 折叠（右边卡原有那一套样式一个都没动）。
   · 用户给的 .action-card 规格 → 换成我们米杏主题的变量：
       var(--border)   → var(--ro-line)   #e8d7bd 边框
       var(--text)     → var(--ro-fg)     #4a3a26 主文字
       var(--text-sub) → var(--ro-fg2)    #8a7a63 副文字
       卡片底 #fff     → var(--ro-card)   #fdf6ea 卡片米杏
       点按反馈 #f9efdd（米杏底同色系，比卡片底深一点点）
   ⚠️ 这段写在样式表最后：同优先级后者胜，不用堆 !important。
   ⚠️ 选择器里【不写右边卡原先那个类名】（保护标记按出现次数数，多写一个
      就多一处）：右边那张卡用 .ro-hm-card / details 命中，效果一样。
   ============================================================ */
.grid-2-col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
  align-items: stretch;
}
/* 两张卡共用一套外观（左边 <a> · 右边 <details>） */
.action-card,
.grid-2-col > .ro-hm-card {
  box-sizing: border-box;
  margin: 0;
  min-width: 0;
  min-height: 84px;
  padding: 12px 10px;
  border: 1px solid var(--ro-line);
  border-radius: 10px;
  background: var(--ro-card);
  text-align: center;
  overflow-wrap: break-word;
  word-break: break-word;
}
/* 左边那张：纵向居中（上下留白一样多）
   ⚠️ display / padding 必须带 !important：上面「⑤ 开机号」那层（米杏覆盖块）
      对 .ro-tool 写了 display:block !important、padding:14px 8px !important，
      普通声明压不动（实测：不加就是一行横排，三行字全挤在一条线上）。
      这里只覆盖到和右边卡一样的规格，别的一个值都没动。 */
.action-card {
  display: flex !important;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 12px 10px !important;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition: background .18s;
}
.action-card:active { background: #f9efdd !important; }
/* 卡片里的字：两张卡一套规格 → 左右一样大、一样高 */
.grid-2-col .title { font-size: 15px; font-weight: 700; color: var(--ro-fg); line-height: 1.3; }
.grid-2-col .sub { font-size: 11px; color: var(--ro-fg2); line-height: 1.4; text-wrap: balance; }
.grid-2-col .title + .sub { margin-top: 4px; }
.grid-2-col .ro-go { margin-top: 2px; }
/* 右边热力图卡：标题 / 「当前：…期」/「点击查看 ▾」三行居中 */
.grid-2-col > .ro-hm-card > summary {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 2px 0;
  cursor: pointer;
}
.grid-2-col > .ro-hm-card > summary > * { flex: 0 0 auto; width: 100%; }
/* 收起状态下让那三行和左边卡一样【纵向居中】
   （卡片被 grid 拉伸到同高，内容不够高时多余的空白分上下 ——
     老内核不认识 align-content 就退化成顶部对齐，不影响任何功能） */
.grid-2-col > .ro-hm-card { align-content: center; }
/* 最后一行「点击查看 ▾ / 点击收起 ▴」：和左卡同一档字号 + 主色绿 */
.grid-2-col > .ro-hm-card > summary > :last-child {
  font-size: 11px;
  margin-top: 2px;
  color: var(--ro-ok);
}
/* 展开 → 热力图占满整行（脚本同步的 .is-open 与 :has 双保险） */
.grid-2-col.is-open,
.grid-2-col:has(> details[open]) { grid-template-columns: minmax(0, 1fr); }
/* 320 窄屏：字号收一档，两列也不挤爆、不横向溢出 */
@media (max-width: 360px) {
  .grid-2-col { gap: 8px; }
  .grid-2-col .title { font-size: 14px; }
  .grid-2-col .sub { font-size: 10.5px; }
  .grid-2-col .title + .sub { margin-top: 3px; }
  .grid-2-col > .ro-hm-card > summary > :last-child { font-size: 10.5px; }
}

/* ============================================================
   ⑩【🐸青蛙家园 + 历史开奖 · 并排两列】（用户 2026-10-20）
   ------------------------------------------------------------
   用户原话：「青蛙家园 + 历史中奖 并排放一排」；两个方案里选了 b：
     历史开奖【保持默认展开】，🐸青蛙家园【不跟着拉伸】（align-items:start）。
   · 左格 .frog 是另一个窗口写的青蛙家园面板：这里只把它外层的
     margin（自带 12px 16px）归零 —— 不归零它会在格子里缩一圈、和右卡对不齐；
     面板内部的字号 / 配色 / 间距 / 内容一个值都没动。
   · 右格 .ro-hist 同样把外层 margin 归零，改由这一行统一给留白。
   ⚠️ 页面通用规则「.grid-2-col:has(> details[open]) → 变一列」是给热力图 /
      专家推荐那几行用的（展开就要占满整行）；这一行必须是两列
      （历史开奖默认展开），所以用 ID 权重压住，并顺手写了 .is-open 那种兜底。
   ⚠️ 横向留白用行上的 margin 给（桌面 12px、≤360px 时 8px），和上下卡片对齐。
   ============================================================ */
#ro-frog-hist-row,
#ro-frog-hist-row.is-open,
#ro-frog-hist-row:has(> details[open]) {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: stretch;          /* ← 用户 2026-10-20：「大小一样」：这一行两张卡等高 */
  margin-left: 0;                /* ← 用户 2026-10-20：「移到晒票下一栏」：左右留白和上一行对齐 */
  margin-right: 0;
}
#ro-frog-hist-row > .frog { margin: 0; }
#ro-frog-hist-row > .ro-hist { margin: 0; }
/* 青蛙家园原来是「整行细条」（标题在左、绿字提示在右，同一行）。
   塞进半屏格（375 下 167px / 320 下 140px）后一行放不下，会把「青蛙家园」
   折成两行、和右边绿字交叉。这里只改【这一格里的排列方向】：标题一行、提示一行。
   字号 / 颜色 / 字重 / 文案 / 内部结构一个值都没动。 */
#ro-frog-hist-row > .frog > .frog-sum {
  flex-direction: column;
  align-items: center;           /* ← 用户 2026-10-20「青蛙家园字迹居中」：标题/绿字都居中 */
  gap: 3px;
  text-align: center;
}
/* __FROG_CENTER__ 用户 2026-10-20：「青蛙家园字迹居中」
   ------------------------------------------------------------
   只改【这一个卡里的文字对齐】，不动整页对齐：
     · 「🐸 青蛙家园」标题 + 「点开看免费资料 + 出号」绿字 → 居中（上面那条 .frog-sum 已管）
     · 各区标题（.frog-h：核心算法 20 码 / 免费资料 / 功能中心）→ 居中
     · 号码圆点行、药丸行 → 水平居中排（本来就会折行，居中更好看）
     · 底部小字（.frog-tip）和「暂无」→ 居中
   ⚠️【不居中】的：
     · 功能中心的按钮（.frog-btn）→ 按钮本身排齐，只有按钮里的字居中（本来就是这样）
     · 免费资料那几行（.frog-art：序号 / 标题 / 看原文）→ 保持左对齐，一行一行才好读
     · 计算输出区里的数据行（.frog-row / .frog-co）→ 保持左对齐
   ⚠️ 只动 text-align / justify-content，字号 / 颜色 / 间距 / 文案一个值都没改。 */
.frog, .frog-body { text-align: center; }
.frog-t, .frog-go { text-align: center; }
.frog-h { text-align: center; }
.frog-none, .frog-tip, .frog-ql { text-align: center; }
.frog-balls { justify-content: center; }
.frog-chips { justify-content: center; }
/* 免费资料的第 4 条那种长标题：整行左对齐，不要跟着居中（居中会把序号挤歪） */
.frog-art { text-align: left; }
.frog-art .frog-at { text-align: left; }
.frog-art .frog-ag { text-align: right; }
/* 计算输出区的数据行保持左对齐 */
.frog-row, .frog-co, .frog-co-h, .frog-out { text-align: left; }
/* 【防截图口径不变】历史开奖虽然挪出了 #article-rest，锁定时照样模糊 + 点不动。
   🐸青蛙家园是免费面板，保持原来的口径（锁定状态下照样能点，和「晒票 | GPT摇号」同一档）。 */
html.locked #ro-frog-hist-row > .ro-hist {
  filter: blur(30px) grayscale(1);
  pointer-events: none;
}
@media (max-width: 360px) {
  #ro-frog-hist-row { margin-left: 0; margin-right: 0; gap: 8px; }
}

/* ============================================================
   ⑨【晒票 + GPT模型摇号 · 并排两列】（用户 2026-10-18 给的设计）
   ------------------------------------------------------------
   用户原话：「晒票和 GPT模型摇号 也做成并排两列，跟
             开机号+热力图 那行同样式」，并直接给了
             .grid-2-col-action / .action-card-btn 这套 CSS。
   变量映射（用户给的 → 本站米杏主题）：
     var(--border)   → var(--ro-line)   #e8d7bd
     var(--text)     → var(--ro-fg)     #4a3a26
     var(--text-sub) → var(--ro-fg2)    #8a7a63
     var(--green)    → var(--ro-ok)     #1a8c5a
     background:#fff → var(--ro-card)   #fdf6ea
     #f9efdd（点按反馈）→ 原来就有的那个米杏反馈色，照用
   为什么 padding 写在 <summary> 而不是 <details>：
     这一行两格都是 <details>，正文（晒票的图墙 / 摇号面板）展开后
     要塞回卡片里；所以卡片左右留白给 details、标题行用负 margin
     铺满整宽 —— 收起时看上去就是用户给的那张「卡片按钮」。
   ⚠️ 这段必须写在样式表【最后】：上面 ⑥⑦ 那层对
      .ro-xysp > .ro-xysp-head 写了带 !important 的紧凑横排样式，
      这里靠【更高的选择器权重 + !important】把它盖成竖排三行卡片。
   ============================================================ */
.grid-2-col-action {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
  align-items: stretch;
}
.grid-2-col-action > details { min-width: 0; }
.grid-2-col-action > details.action-card-btn {
  box-sizing: border-box;
  margin: 0 !important;
  padding: 0 10px 0 !important;
  background: var(--ro-card) !important;
  border: 1px solid var(--ro-line) !important;
  border-radius: 10px !important;
  overflow: hidden;
  transition: background .2s;
}
/* 展开：正文上下要留白；收起：卡片只有标题行那么高 */
.grid-2-col-action > details.action-card-btn[open] { padding-bottom: 12px !important; }
.grid-2-col-action > details.action-card-btn:active { background: #f9efdd !important; }
/* 卡片脸 = <summary>：铺满整宽 · 竖排三行居中 */
.grid-2-col-action > details.action-card-btn > summary {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 0 !important;
  text-align: center !important;
  margin: 0 -10px !important;
  padding: 16px 10px !important;
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  cursor: pointer;
  list-style: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
.grid-2-col-action > details.action-card-btn > summary::-webkit-details-marker { display: none; }
.grid-2-col-action > details.action-card-btn > summary::marker { content: ''; }
/* 三行字：标题 / 副标题 / 展开提示（用户给的 .title / .sub / .action-text）
   ⚠️ 必须带 #ro-action-2col：上面 ⑥⑦ 那层还有一条
      「.ro-aipick > .ro-aipick-head .ro-aipick-h2 { font-size: 13.5px !important }」，
      它的类选择器有 3 个、比「.grid-2-col-action .title」的 2 个更"重"，
      不加 id 的话字号会被压回去（实测：晒票/GPT 的标题比左边开机号卡小一档）。 */
#ro-action-2col .title {
  margin: 0 !important;
  font-size: 15px !important;
  font-weight: 700 !important;
  line-height: 1.3 !important;
  color: var(--ro-fg) !important;
}
#ro-action-2col .sub {
  margin: 2px 0 0 !important;
  max-width: none !important;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: clip !important;
  font-size: 11px !important;
  font-weight: 400 !important;
  line-height: 1.4 !important;
  color: var(--ro-fg2) !important;
}
#ro-action-2col .action-text {
  margin: 8px 0 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  line-height: 1.4 !important;
  color: var(--ro-ok) !important;
}
/* 「展开 ▸ / 点击查看 ▸」的箭头：上面几层把它清成空串了，这里按用户设计补回来
   （文字本身还是 ::before 按 [open] 换的 —— 机制没变） */
.grid-2-col-action > details > summary .ro-xysp-arrow::after,
.grid-2-col-action > details > summary .ro-aipick-arrow::after { content: ' ▸' !important; }
.grid-2-col-action > details[open] > summary .ro-xysp-arrow::after,
.grid-2-col-action > details[open] > summary .ro-aipick-arrow::after { content: ' ▾' !important; }
/* 展开 → 这一格占满整行（脚本同步 .is-open，:has 兜底老内核没有也能用） */
.grid-2-col-action.is-open,
.grid-2-col-action:has(> details[open]) { grid-template-columns: minmax(0, 1fr); }
/* 展开后的正文：贴住卡片左右 10px 留白，不许横向溢出去 */
.grid-2-col-action > details > summary + * { margin-top: 12px; }
.grid-2-col-action .ro-xysp-filter,
.grid-2-col-action .ro-xysp-pics,
.grid-2-col-action .ro-xysp-note,
.grid-2-col-action .ro-aipick-body { min-width: 0; max-width: 100%; }
/* 【防截图口径】晒票这一格挪到了 #article 外面（要和 GPT 并排），
   所以这里补一条：锁定时图片墙照样糊掉、点不动 —— 和其它区块一致。
   GPT 摇号面板不糊（用户要在这状态摇号）。 */
html.locked .ro-xysp .ro-xysp-pics { filter: blur(24px) grayscale(1); pointer-events: none; }
/* 320 窄屏：字号 / 内边距各收一档，两列不挤爆、不横向溢出 */
@media (max-width: 360px) {
  .grid-2-col-action { gap: 8px; }
  #ro-action-2col .title { font-size: 14px !important; }
  #ro-action-2col .sub { font-size: 10.5px !important; }
  #ro-action-2col .action-text { font-size: 10px !important; }
  .grid-2-col-action > details.action-card-btn > summary { padding: 12px 8px !important; margin: 0 -8px !important; }
  .grid-2-col-action > details.action-card-btn { padding: 0 8px !important; }
  .grid-2-col-action > details.action-card-btn[open] { padding-bottom: 10px !important; }
}
</style>
<!-- __DEVICE_GATE_CSS__ / __INSTALL_APP_CSS__ 两段共用样式（device-gate.mjs）
     放在 head 收尾标签之前 → 电脑端第一帧就是"隐藏"状态，不会先闪出内容再被盖住。
     ⚠️【这行注释里绝不能出现 head 收尾标签的字面写法】（左尖括号 + 斜杠 + head + 右尖括号）：
        export-site.mjs 用 String.replace 找【第一个】head 收尾标签来注入 .site-nav 导航样式，
        而那个函数只认最先出现的一处。注释里出现该字面写法 → 导航 CSS 整段落进注释里、
        整段失效 → 分享包顶部两个 Tab 变成浏览器默认的蓝色下划线链接
        （2026-10-18 线上实测踩到，根因就在这里）。所以只写中文描述，不写那个标签。 -->
<style>${DEVICE_GATE_CSS}${INSTALL_CSS}${CHAT_CSS}${CHAT_VIDEO_CSS}/* __TOOLS_GRID__ 智能分析：8 个入口 + 全屏子页面（用户 2026-10-18 要求）
   ------------------------------------------------------------
   入口 = 4 列网格 8 张图标卡（不是裸 button：div role="button" tabindex="0"）；
   子页面 = position:fixed 全屏覆盖（z-index 高），自带「← 返回」。
   页面里【没有弹窗】：所有提示都在页面内展开。
   颜色全部走 --ro-* 变量（米杏主题），不引任何外部图表库。 */
.tools-box { background: var(--ro-card); border: 1px solid var(--ro-line); border-radius: 12px; padding: 12px; margin: 0 12px 12px; }
/* 标题行：用户 2026-10-18「把『工具（智能分析）』字体居中，右边那句提示不要了」

  <div class="tools-sub" style="text-align:center;font-size:12px;color:#8a7a63;margin-top:4px;">人工计算结合智能</div>   → 居中单行；右边那句已经删掉（.tools-note 样式留着不碍事，页面上没有这个元素） */
.tools-head { display: flex; justify-content: center; align-items: center; margin-bottom: 10px; gap: 8px; }
.tools-title { font-size: 14px; font-weight: 700; color: var(--ro-fg); text-align: center; }
.tools-note { font-size: 11px; color: var(--ro-fg2); white-space: nowrap; }
.tool-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.tool-item { background: #fffaf2; border: 1px solid var(--ro-line); border-radius: 10px;
  padding: 10px 2px; text-align: center; cursor: pointer; min-width: 0;
  -webkit-tap-highlight-color: transparent; }
.tool-item:active { background: #f9efdd; }
.tool-item:focus-visible { outline: 2px solid var(--ro-ok); outline-offset: 1px; }
.tool-item .icon { font-size: 20px; line-height: 1.2; }
.tool-item .name { font-size: 11px; font-weight: 700; color: var(--ro-fg); margin-top: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ---------- 子页面（全屏覆盖） ---------- */
.tool-view { position: fixed; inset: 0; background: var(--ro-bg); z-index: 100000;
  display: none; flex-direction: column; }
.tool-view.on { display: flex; }
.tool-view-head { display: flex; align-items: center; gap: 12px; padding: 12px 14px;
  background: var(--ro-card); border-bottom: 1px solid var(--ro-line);
  position: sticky; top: 0; z-index: 2; }
.tool-back { font-size: 14px; color: var(--ro-ok); font-weight: 700; cursor: pointer;
  padding: 4px 8px; margin-left: -8px; border-radius: 8px;
  -webkit-tap-highlight-color: transparent; }
.tool-back:active { background: #f9efdd; }
.tool-view-title { font-size: 15px; font-weight: 700; color: var(--ro-fg); }
.tool-view-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
  padding: 12px 12px 28px; }
.tv-card { background: #fff; border: 1px solid var(--ro-line); border-radius: 10px;
  padding: 12px; margin-bottom: 10px; }
.tv-h { font-size: 13px; font-weight: 700; color: var(--ro-fg); margin-bottom: 8px; }
.tv-h span { font-weight: 400; font-size: 11px; color: var(--ro-fg2); margin-left: 6px; }
.tv-row { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px;
  padding: 5px 0; border-bottom: 1px solid #f4ead6; }
.tv-row:last-child { border-bottom: 0; }
.tv-k { color: var(--ro-fg2); flex: 0 0 auto; }
.tv-v { font-weight: 700; color: var(--ro-fg); text-align: right; overflow-wrap: break-word; word-break: break-word; }
.tv-v em { font-style: normal; color: var(--ro-danger); }
.tv-note { font-size: 11.5px; color: #a89a80; line-height: 1.6; margin-top: 6px; }
.tv-none { font-size: 13px; color: var(--ro-fg2); line-height: 1.75; }
.tv-none b { display: block; font-size: 14px; color: var(--ro-fg); margin-bottom: 4px; }
/* 彩种 / 号码区 切换胶囊 */
.tv-seg { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.tv-chip { flex: 0 0 auto; padding: 5px 10px; border: 1px solid var(--ro-line);
  border-radius: 999px; background: #fffaf2; color: var(--ro-fg2); font-size: 12px;
  font-weight: 600; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.tv-chip.on { background: var(--ro-ok); border-color: var(--ro-ok); color: #fff; }
.tv-chip:active { background: #f9efdd; }
.tv-chip.on:active { background: var(--ro-ok); }
/* 简单表格（明细） */
.tv-tbl { width: 100%; border-collapse: collapse; font-size: 11.5px; table-layout: fixed; }
/* 列宽：期号窄一点、和值/跨度固定小列，把剩下的宽度全给「号码」列
   （不这么分，双色球 6 个号会被省略号切掉 —— 实测 320 下只剩「5 21 22 2…」） */
.tv-tbl th:nth-child(1) { width: 64px; }
.tv-tbl th:nth-child(3), .tv-tbl th:nth-child(4) { width: 40px; }
.tv-tbl th, .tv-tbl td { padding: 4px 2px; text-align: center; border-bottom: 1px solid #f4ead6;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tv-tbl th { color: var(--ro-fg2); font-weight: 600; }
.tv-tbl td { color: var(--ro-fg); font-weight: 600; }
.tv-tbl td.l { text-align: left; }
/* 遗漏格：号码 + 当前遗漏 */
.tv-cells { display: grid; grid-template-columns: repeat(auto-fill, minmax(42px, 1fr)); gap: 5px; }
.tv-cell { border: 1px solid var(--ro-line); border-radius: 8px; background: #fffaf2;
  padding: 4px 0; text-align: center; line-height: 1.25; }
.tv-cell b { display: block; font-size: 12.5px; color: var(--ro-fg); }
.tv-cell i { display: block; font-style: normal; font-size: 10.5px; color: var(--ro-fg2); }
.tv-cell.hot i { color: var(--ro-ok); font-weight: 700; }
.tv-cell.bad { border-color: var(--ro-danger); background: #fdeeee; }
.tv-cell.bad b, .tv-cell.bad i { color: var(--ro-danger); font-weight: 700; }
/* 走势折线（内联 SVG，不用图表库） */
.tv-spark { display: block; width: 100%; height: 96px; }
.tv-spark-x { display: flex; justify-content: space-between; font-size: 10.5px;
  color: var(--ro-fg2); margin-top: 2px; }
.tv-legend { display: flex; gap: 12px; font-size: 11px; color: var(--ro-fg2); margin-top: 6px; }
.tv-legend i { display: inline-block; width: 10px; height: 3px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
/* 横向条形（热度） */
.tv-bar { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 3px 0; }
.tv-bar b { flex: 0 0 46px; font-weight: 700; color: var(--ro-fg); }
.tv-bar span { flex: 1; height: 8px; border-radius: 4px; background: #f1e5cf; overflow: hidden; display: block; }
.tv-bar span i { display: block; height: 100%; border-radius: 4px; background: var(--ro-ok); }
.tv-bar em { flex: 0 0 auto; font-style: normal; color: var(--ro-fg2); font-size: 11px; min-width: 46px; text-align: right; }
.tv-bar.cold span i { background: #9db4c9; }
/* 页面内的操作条（不是裸 button） */
.tv-btn { display: inline-block; padding: 7px 14px; border-radius: 999px;
  background: var(--ro-ok); color: #fff; font-size: 12.5px; font-weight: 700;
  cursor: pointer; -webkit-tap-highlight-color: transparent; }
.tv-btn.ghost { background: transparent; color: var(--ro-ok); border: 1px solid var(--ro-ok); }
.tv-btn:active { opacity: .85; }
.tv-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
/* ============================================================
   __TQ3__ 智能分析三个子页面的新模板（趋势分析 / 杀号和选号 / 指数预测）
   ------------------------------------------------------------
   用户给了截图，明确要这套样式：
     · Tab 选中 = 橙色下划线
     · 基础区按钮 = 浅粉底 #fdeee8 · 深红字 #c0392b
     · 免费查看 = 浅黄小标签
     · VIP 区 = 深棕横条 #6b4a2f + 👑
   和页面米杏主题调和：外层卡片仍走 --ro-card / --ro-line，只有按钮和 VIP 条按截图。
   全部可换行（320 / 375 不溢出），可点的都是 div role="button"（没有裸 button）。
   ============================================================ */
.tool-view-title { cursor: pointer; }
.tq-caret { display: inline-block; font-size: 11px; color: #c0392b; margin-left: 3px; vertical-align: 1px; }
.tq-games { margin: 0 0 10px; }
.tq-tabs { display: flex; flex-wrap: wrap; gap: 2px 20px; border-bottom: 1px solid var(--ro-line); margin: 0 0 10px; }
.tq-tab { padding: 7px 1px 8px; font-size: 14px; font-weight: 800; color: #8a7a63;
  border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer;
  -webkit-tap-highlight-color: transparent; }
.tq-tab.on { color: #f0872a; border-bottom-color: #f0872a; }
.tq-tab:focus-visible { outline: 2px solid #f0872a; outline-offset: 1px; }
.tq-sub { font-size: 11px; font-weight: 600; color: #a89a80; margin: -3px 0 10px; line-height: 1.6; }
.tq-sec { margin: 0 0 14px; }
.tq-sec-h { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 800;
  color: #4a3a26; margin: 0 0 9px; }
.tq-free { font-size: 10.5px; font-weight: 700; color: #a9761a; background: #fff4d6;
  border: 1px solid #f0dfae; border-radius: 6px; padding: 1px 7px; line-height: 1.7; }
.tq-vip-bar { display: flex; align-items: center; gap: 6px; background: #6b4a2f; color: #fff8ef;
  border-radius: 9px; padding: 7px 11px; font-size: 12.5px; font-weight: 800; margin: 0 0 10px; }
/* 【本网页免费】用户 2026-10-18：「VIP趋势后面加内容：（本网页免费）」
   —— 「免费查看」那个小标签只标在「基础趋势」上，VIP 那三条横条也得写清楚不用付费。
   做法：横条里再放一个 span，字号小一档、颜色比标题淡一点（仍是暖白，不清淡到看不见）。
   ⚠️ 横条本身是深棕底 #6b4a2f，#fff8ef 在它上面的对比度约 11:1，
      淡到 .78 透明度后仍有约 8:1，远高于 4.5:1。 */
.tq-vip-free { font-size: 11.5px; font-weight: 600; color: rgba(255, 248, 239, .78);
  letter-spacing: 0; white-space: nowrap; }
@media (max-width: 360px) {
  .tq-vip-bar { font-size: 12px; padding: 7px 9px; }
  .tq-vip-free { font-size: 10.5px; }
}
.tq-grp { margin: 0 0 11px; }
.tq-grp-h { font-size: 12.5px; font-weight: 800; color: #2f2218; margin: 0 0 7px; }
.tq-btns { display: flex; flex-wrap: wrap; gap: 7px; }
.tq-btn { flex: 0 0 auto; padding: 6px 11px; border-radius: 9px; background: #fdeee8;
  border: 1px solid #f6d5ca; color: #c0392b; font-size: 12.5px; font-weight: 700;
  cursor: pointer; -webkit-tap-highlight-color: transparent; }
.tq-btn:active { background: #fbdcd2; }
.tq-btn.on { background: #c0392b; border-color: #c0392b; color: #fff; }
.tq-btn:focus-visible { outline: 2px solid #c0392b; outline-offset: 1px; }
.tq-res { margin: 9px 0 2px; background: #fffaf3; border: 1px solid #f0dcc8;
  border-left: 3px solid #c0392b; border-radius: 10px; padding: 10px 11px; }
.tq-res-h { display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
  font-size: 12.5px; font-weight: 800; color: #6b4a2f; margin: 0 0 6px; }
.tq-res-h em { font-style: normal; font-size: 10.5px; font-weight: 600; color: #b08a5e; }
.tq-kv { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px;
  color: #4a3a26; padding: 4px 0; border-bottom: 1px dashed #f1e3d2; line-height: 1.55; }
.tq-kv:last-child { border-bottom: 0; }
.tq-kv span { flex: 0 0 auto; color: #8a7a63; max-width: 46%; }
.tq-kv b { font-weight: 700; text-align: right; color: #4a3a26; overflow-wrap: break-word; word-break: break-word; }
.tq-balls { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 2px; }
.tq-ball { width: 27px; height: 27px; line-height: 27px; border-radius: 50%; text-align: center;
  font-size: 12.5px; font-weight: 800; font-style: normal; background: #c0392b; color: #fff;
  display: inline-block; flex: 0 0 auto; }
.tq-ball.blue { background: #2f6fd0; }
.tq-ball.kill { background: #8a7a63; }
.tq-ball.digit { border-radius: 8px; background: #fff; color: #c0392b; border: 1px solid #f6d5ca; }
.tq-ball.sm { width: 24px; height: 24px; line-height: 24px; font-size: 11.5px; }
.tq-ball.digit.sm { line-height: 22px; }
.tq-chips { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 4px; margin: 6px 0 2px; }
.tq-mini { background: #fdeee8; border: 1px solid #f6d5ca; border-radius: 6px; text-align: center; padding: 2px 0; line-height: 1.3; }
.tq-mini b { display: block; font-size: 11.5px; color: #c0392b; }
.tq-mini span { display: block; font-size: 10px; color: #a9761a; }
.tq-mini.zero { background: #f7f2ea; border-color: #eee2d2; }
.tq-mini.zero b, .tq-mini.zero span { color: #b7a892; }
.tq-tbl-wrap { max-height: 360px; overflow-y: auto; -webkit-overflow-scrolling: touch;
  border: 1px solid #f0dcc8; border-radius: 10px; background: #fffdf9; }
.tq-tbl-wrap { scrollbar-width: thin; scrollbar-color: #e3d0b6 transparent; }
.tq-tbl-wrap::-webkit-scrollbar { width: 6px; }
.tq-tbl-wrap::-webkit-scrollbar-thumb { background: #e3d0b6; border-radius: 3px; }
.tq-tbl-wrap::-webkit-scrollbar-track { background: transparent; }
.tq-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
.tq-tbl th, .tq-tbl td { padding: 5px 3px; text-align: center; border-bottom: 1px solid #f4e7d8; }
.tq-tbl th { color: #8a7a63; font-weight: 700; background: #fdf3e6; position: sticky; top: 0; z-index: 1; }
.tq-tbl th:nth-child(1) { width: 40px; }
.tq-tbl th:nth-child(2) { width: 64px; }
.tq-tbl th:nth-child(3) { width: 66px; }
.tq-tbl td { color: #4a3a26; font-weight: 600; }
.tq-tbl td b { color: #c0392b; }
.tq-tbl td.s { text-align: left; color: #8a7a63; font-weight: 600; font-size: 11px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tq-tbl tr.top td { background: #fdeee8; }
.tq-tbl tr.top td.s { color: #a9761a; }
.tq-rec { background: var(--ro-card); border: 1px solid var(--ro-line); border-radius: 12px;
  padding: 12px; margin: 2px 0 0; }
.tq-rec-h { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 13.5px;
  font-weight: 800; color: #c0392b; margin: 0 0 8px; }
.tq-rec-h span { font-size: 11px; font-weight: 600; color: #8a7a63; }
.tq-rec-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin: 0 0 6px; }
.tq-rec-k { flex: 0 0 auto; font-size: 11.5px; font-weight: 800; color: #6b4a2f; min-width: 46px; }
.tq-rec-k2 { flex: 0 0 auto; font-size: 11px; font-weight: 700; color: #8a7a63; }
.tq-rec-t { flex: 1 1 auto; font-size: 12px; font-weight: 700; color: #4a3a26;
  overflow-wrap: break-word; word-break: break-word; min-width: 0; }
.tq-warn { font-size: 11px; color: #a89a80; margin-top: 6px; }
/* __REC__ 统一号码卡的「打分口径」那一行（和 .tv-rec-basis 同一个口径） */
.tq-rec-basis { font-size: 11px; color: #a89a80; line-height: 1.6; margin-top: 8px; }
.tq-empty { font-size: 12.5px; color: #8a7a63; line-height: 1.7; padding: 10px 0; }
.tq-empty b { display: block; color: #4a3a26; font-size: 13.5px; margin-bottom: 4px; }
@media (max-width: 360px) {
  .tq-btn { padding: 5px 9px; font-size: 12px; }
  .tq-tabs { gap: 2px 14px; }
  .tq-tab { font-size: 13px; }
  .tq-ball { width: 25px; height: 25px; line-height: 25px; font-size: 12px; }
  .tq-ball.sm { width: 22px; height: 22px; line-height: 22px; font-size: 11px; }
  .tq-kv { font-size: 12px; }
  .tq-chips { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .tq-tbl { font-size: 11.5px; }
  .tq-tbl th:nth-child(1) { width: 34px; }
  .tq-tbl th:nth-child(2) { width: 56px; }
  .tq-tbl th:nth-child(3) { width: 60px; }
}
/* __TQ4__ 智能规律：画线推号区块（斜连 / 竖连 / 胆尾 / 遗漏周期） */
.tq-blk { background: #fffaf3; border: 1px solid #f0dcc8; border-left: 3px solid #6b4a2f;
  border-radius: 10px; padding: 10px 11px; margin: 0 0 10px; }
.tq-blk-h { display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
  font-size: 12.5px; font-weight: 800; color: #6b4a2f; margin: 0 0 7px; }
.tq-blk-h em { font-style: normal; font-size: 10.5px; font-weight: 600; color: #b08a5e; }
.tq-mtbl { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11.5px; }
.tq-mtbl th, .tq-mtbl td { padding: 4px 3px; text-align: center; border-bottom: 1px dashed #f1e3d2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tq-mtbl th { color: #8a7a63; font-weight: 700; }
.tq-mtbl td { color: #4a3a26; font-weight: 600; }
.tq-mtbl td.l { text-align: left; white-space: normal; }
.tq-mtbl td b { color: #c0392b; }
.tq-nores { font-size: 11.5px; color: #a89a80; line-height: 1.65; }
@media (max-width: 360px) {
  .tq-mtbl { font-size: 11px; }
  .tq-blk { padding: 9px 9px; }
}
/* 随机号球 */
.tv-balls { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 2px; }
.tv-ball { width: 30px; height: 30px; line-height: 30px; border-radius: 50%; text-align: center;
  font-size: 13px; font-weight: 700; background: var(--ro-danger); color: #fff; }
.tv-ball.blue { background: #1f5fd6; }
.tv-ball.digit { border-radius: 8px; background: #fff; color: var(--ro-fg); border: 1px solid var(--ro-line); }
/* ============================================================
   __REC__ 「🎯 本期推荐号码」卡片（8 个子页面的最底部都有）
   米杏色底 + 描边；红球红底、蓝球蓝底、数字彩用方块；号码做大好认
   ============================================================ */
.tv-rec { background: linear-gradient(180deg, #fdf6ea 0%, #fffaf1 100%);
  border: 1.5px solid #e2c9a0; border-radius: 12px; padding: 12px 12px 10px;
  margin: 14px 0 6px; }
.tv-rec-h { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px;
  font-size: 14px; font-weight: 700; color: #4a3a26; }
.tv-rec-h span { font-weight: 400; font-size: 11px; color: #8a7a63; }
.tv-rec-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.tv-rec-k { flex: 0 0 48px; font-size: 12px; font-weight: 700; color: #8a7a63;
  line-height: 1.2; word-break: break-all; }
.tv-rec .tv-balls { margin: 0; gap: 6px; }
.tv-rec .tv-ball { width: 34px; height: 34px; line-height: 34px; font-size: 15px;
  box-shadow: 0 2px 0 rgba(74, 58, 38, .12); }
.tv-rec-basis { font-size: 11px; color: #a89a80; line-height: 1.6; margin-top: 10px; }
.tv-rec-warn { font-size: 11.5px; font-weight: 700; color: #b4552f; margin-top: 6px; }
@media (max-width: 360px) {
  .tv-rec { padding: 10px 9px 8px; }
  .tv-rec-k { flex: 0 0 40px; font-size: 11.5px; }
  .tv-rec .tv-ball { width: 30px; height: 30px; line-height: 30px; font-size: 13.5px; }
  .tv-rec .tv-balls { gap: 5px; }
}
@media (max-width: 360px) {
  .tools-box { margin: 0 8px 10px; padding: 10px; }
  .tool-grid { gap: 6px; }
  .tool-item { padding: 8px 1px; }
  .tool-item .icon { font-size: 18px; }
  .tool-item .name { font-size: 10px; }
  .tool-view-body { padding: 10px 10px 24px; }
  .tv-tbl { font-size: 11px; }
  .tv-cells { grid-template-columns: repeat(auto-fill, minmax(38px, 1fr)); gap: 4px; }
}
/* __ENTRY2__ 已撤：那组「晒票 / 摇号」入口卡和页面上真正的那两张卡重复，
   已按要求把「晒票 + GPT模型摇号」做成区块级并排（.grid-2-col-action），
   入口就是卡片本身，不再单独放一组跳转卡。 */
/* ============================================================
   __INSTALL__ 「添加到手机桌面」安装教程（页面最底部 · 页尾之前）
   ------------------------------------------------------------
   用户 2026-10-18：「帮我把安装教程放到下面 图片可以变大.
                     目的让用户清晰的知道怎么安装」
   2026-10-18 二改：「框框（两列卡片）样式好看，保留；内容升级成带图标 /
   副标题 / 绿圆序号的那一版」（原来卡里只有 1. 2. 3. 的纯文字列表）。
   · 位置：#article-rest 里、.ro-foot（页尾）/ 免责声明 之前 = 正文最后一块
   · 结构：大标题（18px 居中粗体）→ 副标题（12px 灰）→ 两列卡片 →
           卡内 = 📱/🍎 + 平台名（绿 · 粗 · 居中）+ 1px 米杏虚线分隔 +
           绿圆序号三步（22px 圆 · 白字）+ 卡下小注（11px 灰）→ 底部备注
   · 配色：全部走米杏主题变量（--ro-card / --ro-bg / --ro-line / --ro-fg /
           --ro-fg2 / --ro-fg3 / --ro-ok），不写死颜色，和页面其它卡片一套
   · 纯展示：没有按钮标签、没有内联点击、没有 JS、不碰本地存储
   · 375 两列（每列 ~163px）· 320 收成一列（见下面 @media 344px）
   ============================================================ */
.ro-install {
  background: var(--ro-card);
  border: 1px solid var(--ro-line);
  border-radius: 14px;
  padding: 16px 10px 14px;
  box-sizing: border-box;
  overflow-wrap: break-word;
  word-break: break-word;
}
.ro-install-h {
  display: block;
  text-align: center;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.4;
  color: var(--ro-fg);
  letter-spacing: .5px;
  margin: 0;
}
.ro-install-lead {
  text-align: center;
  font-size: 12px;
  line-height: 1.65;
  color: var(--ro-fg2);
  margin: 7px 0 14px;
}
/* __INSTALL_SHOT__ 安装教程大图（用户 2026-10-20：「把安装教程大图放进安装教程区块」）
   位置：标题 + 副标题下面、两列卡片上面（图里已经把安卓 / 苹果两步都画清楚了，
        下面的卡片保留原样做文字速查）
   规格：install-guide.jpg 800×1432 / ~204 KB（原图 1520×2720 / 3.5 MB）
   ⚠️ loading="lazy"：不在首屏，别拖慢第一屏；
   ⚠️ 图挂了要整块收起不显示破图标 → 见紧跟 section 的 __INSTALL_SHOT_ERR__ 那段（事件委托，不写内联 onerror） */
.ro-install-shot {
  width: 100%;
  height: auto;
  display: block;
  margin: 12px 0 14px;
  border-radius: 10px;
  border: 1px solid var(--ro-line);
  box-shadow: 0 1px 3px rgba(74, 58, 38, .10), 0 3px 8px rgba(74, 58, 38, .07);
  background: #fff;
  box-sizing: border-box;
}
/* 【已清理 · 2026-10-20】下面这些样式属于【已经删掉的两列卡片】
   （安卓/微信 · 苹果 iPhone 那两张卡：卡片 / 平台名 / 绿圆序号三步 / 卡下小注
     / 序号虚线 / 提示条 / 引号词不折行 / 两个 @media 里的对应收窄），
   用户 2026-10-18「不要了 有图片就不要了」之后 HTML 里已经没有任何元素用到它们，
   所以规则【全部删除】（原来注释写着"留着没删、以后好加回来"，
   实际留下的只是死代码 —— 要加回来直接按需重写即可，原版在 git 历史里）。
   ⚠️ 保留在用的：.ro-install（卡片外壳）/ -h（标题）/ -lead（副标题）
      / -shot（安装大图）/ -note（底部备注）。 */
.ro-install-note {
  text-align: center;
  margin-top: 13px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .3px;
  color: var(--ro-fg2);
}
/* 345~374px（360 这类窄一点的安卓）：只收一档左右内边距
   （两列卡片删掉后，这里已经没有字号 / 序号那些收窄了） */
@media (min-width: 345px) and (max-width: 374px) {
  .ro-install { padding: 14px 9px 12px; }
}
/* 320 窄屏：两列卡片已经删了（见上面 2026-10-20 的清理注释），
   这里只剩「卡片内边距 / 标题字号 / 副标题间距」三条还在用。 */
@media (max-width: 344px) {
  .ro-install { padding: 15px 11px 13px; }
  .ro-install-h { font-size: 17px; }
  .ro-install-lead { margin: 6px 0 12px; }
}


/* ============================================================
   __CARD_RAISE__ 统一卡片「凸出来」的立体感
   ------------------------------------------------------------
   用户要求：「所有的模块都像 GPT模型摇号 一样凸出来的视觉感」
   改前：整页只有 GPT模型摇号 那一张卡有阴影（0 8px 24px rgba(0,0,0,.25)），
         其它卡片全是「1px 边框 + 米杏底」的平面块。
   改后：一套统一的卡片语言 —— 浅阴影 + 1px 细边框 + 圆角 + 略亮底色，
         原来那张卡单独用的重阴影压到和全站同一档（不搞两套）。
   ⚠️ 阴影只取【浅】这一档（用户原话：微微凸起，不是浮起来；深阴影会显脏）。
   ⚠️ 三个页面（分享 / 竞彩 / 详情）用【同一段】CSS，选择器取三页的并集：
      某个类在本页没有元素时，这条规则自然什么都不做。
   ⚠️ 只加 box-shadow 和按下反馈：不动尺寸、不动结构、不动颜色语义。
   ============================================================ */
:root {
  --ro-shadow: 0 1px 3px rgba(74, 58, 38, .10), 0 3px 8px rgba(74, 58, 38, .07);
  --ro-shadow-flat: 0 0 0 rgba(74, 58, 38, 0);
}

/* ① 模块级卡片：全部套同一套「凸出来」 */
.ro-toc-cell,
.ro-toc-i,
.tool-item,
.tools-box,
.grid-2-col > *,
.grid-2-col-action > details,
.ro-xysp,
.ro-aipick,
.ro-xysp-pic,
.ro-art-group,
.ro-status,
.ro-mq,
.ro-install,
.ro-articles,
.ro-disclaimer,
.ro-panel,
#article > details,
#article-rest > details,
.hc-drawcard,
.tr-block,
.stat > a,
.entry-item,
.record,
.m-card,
.past-recommend-section,
.past-item,
.m-calc,
.m-jxp,
.calc-row,
.m-mq,
.btn2,
.md-head,
.md-card,
.md-miss {
  box-shadow: var(--ro-shadow);
}

/* ② 按下 = 压平 + 下沉 1px（有按下去的手感，不是一块死卡片）
   ⚠️ 只给【真的能点】的那几个：目录格子 / 工具卡 / 两列卡 / 统计卡 / entry 行 / 按钮 */
.ro-toc-cell, .tool-item, .grid-2-col > a, .grid-2-col-action > details,
.stat > a, .entry-item, .btn2 {
  transition: box-shadow .15s ease, transform .12s ease;
}
.ro-toc-cell:active, .tool-item:active, .grid-2-col > a:active,
.grid-2-col-action > details:active, .stat > a:active, .entry-item:active, .btn2:active {
  box-shadow: var(--ro-shadow-flat);
  transform: translateY(1px);
}

/* ③ GPT模型摇号 · 选中的号码格：深底白字
   ------------------------------------------------------------
   改前：.ro-aipick-pick 被浅色主题那条带 !important 的
         「background:#fdf6ea; color:#4a3a26」压住了，
         选中态的红/蓝渐变（不是 !important）根本盖不上去 ——
         结果「选中」和「没选中」长得一模一样，用户原话：
         「选到号码的时候深色一点 白色看不到」。
   改后：红球选中 = 深红底白字（#c0392b / 白 ≈ 5.4:1）
         蓝球选中 = 深蓝底白字（#1f5fd6 / 白 ≈ 5.7:1）
         两者都过 WCAG AA 4.5:1；未选中保持原来的浅底深字，一个字节没改。
   ⚠️ 号码格【不进入】① 那套凸出阴影（小格子加阴影会糊成一片），
      所以选中态也就不需要为「阴影打架」做任何处理。 */
.ro-aipick-pick.on {
  background: #c0392b !important;
  border-color: #a93226 !important;
  color: #fff !important;
  font-weight: 800 !important;
  box-shadow: none !important;
}
.ro-aipick-pick.blue.on {
  background: #1f5fd6 !important;
  border-color: #1a4fb0 !important;
  color: #fff !important;
  font-weight: 800 !important;
  box-shadow: none !important;
}
/* ④ 右下角那颗圆形「📱」浮按钮：去掉
   ------------------------------------------------------------
   用户截图圈的是右下角中间那颗圆按钮，原话「去掉这个」。
   查清它是什么：它和一键桌面【胶囊】是同一个功能（都调 installApp）——
   只是同一件事摆了两次；而且这颗 📱 在某些字体里渲染成「紫色方块 + 彩色格子」，
   看着就像一颗骰子（用户说的「紫色骰子」就是它）。
   处理：本地图里隐藏它，只留「📱 一键桌面」胶囊 + 💬 聊天两颗。
   ⚠️ device-gate.mjs 是别人正在改的文件 → 一个字没动，只在本页样式里隐藏。
   ⚠️ 没有删任何事件绑定：按钮只是 display:none，功能（installApp）照旧在胶囊上。
   ⚠️ 比赛详情页那颗「← 返回」浮按钮（.md-fab-back）不在这条里，保留。 */
/* 【已恢复显示】用户 2026-10-18：「手机版本彩票推荐页没这个」→ 圆形按钮原来是 📱 emoji（在他手机上画成紫色骰子）才被隐藏；现在换成内联 SVG 手机图标，不再隐藏。 */

/* __CARD_RAISE_END__ 这一段到这里结束（替换时以此为界，别删） */

/* ============================================================
   【🔵 蓝球 / 后区 更明显】用户 2026-10-20 原话：
     「资料里面 篮球后区推荐记得带上球的图标明显一点」
   补充：「大乐透和双色球」—— 只改这两个彩种的蓝球，别的彩种不动。
   ------------------------------------------------------------
   ⚠️ 红球一个字节都没动（.ro-ball.red / .hc-ball 的红底全保持原样）。
   ⚠️ 数字彩的方块（.tq-ball.digit / .tv-ball.digit / .ro-ball 的数字彩）不动。
   只加强「蓝球 / 后区 / 特别号」这几颗，做法四件事：
     ① 底色：纯色 → 径向渐变（左上高光 #5b95ff → 中段 #2a63e0 → 右下 #12379b）
              = 有高光的真球，不再是一块平蓝
     ② 描边：一圈亮蓝边 #9cc4ff（rim light）→ 浅底、深底上都一眼认出是蓝球
     ③ 字号：font-weight 800 + 1px 深色投影 → 数字更清楚
     ④ 立体：inset 底部压暗 + inset 顶部提亮 + 1px 外投影
   对比度：白字压 #2a63e0 ≈ 5.6:1 · 压 #12379b ≈ 9.4:1 → 都过 WCAG AA 4.5:1
   ------------------------------------------------------------
   彩种作用域（能精确就精确）：
     · 资料分节里的开奖号 → section.ro-game[data-ro-gid]  （data-ro-gid 是本次加的）
     · 开机号那一行       → .ro-kjh-item[data-gid]         （data-gid 是本次加的）
     · 工具页底部推荐号   → .tv-rec[data-gid] / .tq-rec[data-gid]（本次加的）
     · 最新开奖卡片       → .hc-drawcard:has([data-nextcd="ssq|dlt"])
                            （:has() 老浏览器不支持 → 这条自然不生效，页面不会坏，
                              只是那 2 张卡片的蓝球保持原样）
     · 青蛙家园           → #frogHome .frog-b.blue
                            （那个面板本来就只出大乐透/双色球，不用再限定彩种）
     · 摇号面板 .ro-aipick-ball.blue【没动】：它 8 个彩种共用同一个 class，
       分不出彩种 → 按用户「别为了精确把样式搞坏」的要求保持原样。
   ============================================================ */
  .ro-ball.blue,
  .ro-kjh-ball.is-blue,
  .tv-ball.blue,
  .tq-ball.blue,
  #ro-latest .hc-ball.blue,
  #frogHome .frog-b.blue {
    box-sizing: border-box;
  }
  /* 双色球 / 大乐透 的蓝球：真正的加强版 */
  [data-ro-gid="ssq"] .ro-ball.blue,
  [data-ro-gid="dlt"] .ro-ball.blue,
  .ro-kjh-item[data-gid="ssq"] .ro-kjh-ball.is-blue,
  .ro-kjh-item[data-gid="dlt"] .ro-kjh-ball.is-blue,
  .tv-rec[data-gid="ssq"] .tv-ball.blue,
  .tv-rec[data-gid="dlt"] .tv-ball.blue,
  .tq-rec[data-gid="ssq"] .tq-ball.blue,
  .tq-rec[data-gid="dlt"] .tq-ball.blue,
  #frogHome .frog-b.blue,
  #ro-latest .hc-drawcard:has([data-nextcd="ssq"]) .hc-ball.blue,
  #ro-latest .hc-drawcard:has([data-nextcd="dlt"]) .hc-ball.blue {
    background: radial-gradient(circle at 34% 26%, #5b95ff 0%, #2a63e0 44%, #12379b 100%) !important;
    border: 1.5px solid #9cc4ff !important;
    color: #fff !important;
    font-weight: 800 !important;
    text-shadow: 0 1px 1px rgba(0, 0, 0, .42) !important;
    box-shadow:
      inset 0 -2px 4px rgba(0, 0, 0, .28),
      inset 0 2px 3px rgba(255, 255, 255, .30),
      0 1px 3px rgba(0, 0, 0, .20) !important;
  }
</style>
<!--__HEAD_SLOT__--><!-- 唯一 head 注入槽位：导航样式插在这一行（别删；本页只此一处） -->
</head>
<body data-built="${nowStamp}" class="ro-toc-pending">
${DEVICE_GATE_BODY}
<div class="ro-wrap">
  <!-- ============================================================
       __HOT_OWNER__ 热度计数（只有本机 owner 看得到）
       用户 2026-10-17：「有个热度小图标和实时抓取ip人数 只要数字+热度小图标」
                        「我只想我自己刷新」→ 选 A：只有我能看到
       · 数字来自不蒜子（免费），口径 = 累计独立访客（UV，刷不动）
       · 别人的浏览器里这段是 display:none，完全看不到
       · 拿不到数字（不蒜子挂了/被墙）→ 整个隐藏，不显示 0 或 --
       ============================================================ -->
  <!-- 【🔥 人气 · 用户 2026-10-19 选「打开显示」】
       用的是不蒜子的 site_uv（独立访客）：刷新不算，同一浏览器同一天只算一次。
       ⚠️ 拿不到数字时下面的脚本会把它重新隐藏（不显示 0 或 --）。

       【2026-10-20 · 数字改为构建时写死】用户：「卜蒜子能不能永远都呈现
         就算我电脑关机了」→ 选 A：构建时取一次数、写进页面。
       · 下面那个 span 的正文现在是【构建时算出来的静态数字】，
         不是 '--'，也不是空 —— 页面一打开就有数，不等任何网络请求。
       · 页尾的不蒜子脚本【照样保留】：它取到更新的数会把这个数字覆盖掉。
       · 所以：不蒜子取不到（被墙/挂了）→ 显示构建时那个数；
               取得到 → 显示它给的最新数。两条路都有数，不会再有「--」。
       · 数字来源与抓取时间见同目录那个 json 文件（云端每 10 分钟一班重抓）。
       ⚠️ 只有主人（本机 / ?owner=1 / ?admin=1 / 固定公网 IP）看得到，
          别人的页面里这块是 display:none（客户端隐藏，不是加密）。 -->
  <div class="ro-hot" id="ro-hot">
    <span class="ro-hot-i" aria-hidden="true">🔥</span><span class="ro-hot-n" id="busuanzi_value_site_uv" data-legacy-count="${BZ_UV}" title="旧服务历史统计 ${BZ_UV}，新统计单独记录">—</span>
  </div>

  <!-- ============================================================
       __TOP_TABS__ 顶部 Tab（彩票推荐 / 足球竞彩）+ 管理员徽章
       用户设计：flex 横排 · 底部 1px 边框 · 未选中灰、选中绿+2px 短线。
       ⚠️ 都是 <a>（页面不变量：没有按钮标签）。
       ⚠️ 「足球竞彩」跳的是足球页；当前页（彩票推荐）带 .on。
       徽章 #owner-badge 是原有元素（owner 才显示），放在 Tab 条正下方、靠右，
       不再用 fixed 浮在右上角（那样会压住第二个 Tab）。
       ============================================================ -->
  <!-- 【左滑返回提示 · 用户 2026-10-20「左划返回上一页去掉」→ 已隐藏】
       左滑手势本身保留（history.back 仍可用），只是不再显示这行小字。
       ⚠️ 保留 DOM（#roSwipeHint）不删，避免引用它的脚本报错。 -->
  <div class="ro-swipe-hint" id="roSwipeHint" style="display:none">
    <span class="ar">←</span><span>左滑返回上一页</span>
  </div>
  <div class="top-tabs">
    <a class="tab on" href="./" data-tab-home="1">彩票推荐</a>
    <a class="tab" href="足球推荐.html">竞彩/足球</a>
  </div>
  <script>
  /* __RO_SWIPE__ 吸顶阴影 + 左滑返回（用户 2026-10-18：
     「还是跟着滑动吧，然后做一个返回的功能就是左滑返回」）
     · 吸顶：tab 条滚到顶上就贴住，并加一点阴影提示"它现在浮着"
     · 左滑返回：手指往左快速划 60px 以上、竖直位移小于 60px、700ms 内 → history.back()
       在有横向滚动的区块里（走势图表格等）不抢手势
     ⚠️ 这段在模板字符串里：不用反引号、不写美元花括号、不写反斜杠 */
  (function () {
    'use strict';
    try {
      var tabs = document.querySelector('.top-tabs');
      /* 【用户 2026-10-20「往下滑动的时候 Tab 条和状态卡不要动 / 但不要遮挡内容」】
         滚超过 80px → 状态卡收成一行（.ro-st-fixed）；滚回顶部恢复完整。 */
      var stEl = document.querySelector('.ro-status');
      if (tabs) {
        var onScroll = function () {
          try {
            var r = tabs.getBoundingClientRect();
            if (r.top <= 0) tabs.classList.add('stuck'); else tabs.classList.remove('stuck');
          } catch (e) { }
          try {
            if (stEl) {
              var y = window.pageYOffset || document.documentElement.scrollTop || 0;
              if (y > 80) stEl.classList.add('ro-st-fixed'); else stEl.classList.remove('ro-st-fixed');
            }
          } catch (e) { }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
      }
      var sx = 0, sy = 0, st = 0, tracking = false;
      function inScrollableX(el) {
        var n = el;
        while (n && n !== document.body && n !== document.documentElement) {
          var cs = null;
          try { cs = window.getComputedStyle(n); } catch (e) { cs = null; }
          if (cs && (cs.overflowX === 'auto' || cs.overflowX === 'scroll') &&
              n.scrollWidth > n.clientWidth + 4) return true;
          n = n.parentNode;
        }
        return false;
      }
      document.addEventListener('touchstart', function (ev) {
        if (!ev.touches || ev.touches.length !== 1) { tracking = false; return; }
        if (inScrollableX(ev.target)) { tracking = false; return; }
        var t = ev.touches[0];
        sx = t.clientX; sy = t.clientY; st = Date.now(); tracking = true;
      }, { passive: true });
      document.addEventListener('touchend', function (ev) {
        if (!tracking) return;
        tracking = false;
        var t = ev.changedTouches && ev.changedTouches[0];
        if (!t) return;
        var dx = t.clientX - sx, dy = t.clientY - sy, dt = Date.now() - st;
        if (dt > 700) return;
        if (Math.abs(dy) > 60) return;
        if (dx > -60) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (window.history && window.history.length > 1) window.history.back();
      }, { passive: true });
    } catch (e) { }
  })();
  </script>
  <!-- 管理员徽章：从原来的 fixed 浮层（top:10/right:10/z-index:99999）挪到这里 ——
       Tab 条正下方的一行，靠右，流内定位。仍然只有 html.is-owner 才显示。 -->
  <div id="owner-badge" aria-hidden="true">管理员模式 · 本机可截图</div>
  <script>
  /* __TOP_TABS_HOME__ Tab1「彩票推荐」的地址按协议切换（零存储 · 零外部依赖）：
     · 线上（http / https）→ "./"     = 站点根 index.html，和原来完全一致
     · 本机（file://）     → "只读分享版.html"
       因为 file:// 下 "./" 会被浏览器当成【目录索引】，一点就离开本页，
       还会把整个项目目录列出来。 */
  (function () {
    try {
      if (String(location.protocol) !== 'file:') return;
      var a = document.querySelector('.top-tabs .tab[data-tab-home]');
      if (a) a.setAttribute('href', '只读分享版.html');
    } catch (e) {}
  })();
  </script>

  <!-- ============================================================
       【防截图 · 保护容器 #article】
       用户要求：只有他自己（本机 App 的 file:// 协议，或公网 IP 命中）
       可以截图，别人打开时一旦切窗口 / 按 PrintScreen 就把内容模糊掉。
       ⚠️ 为什么拆成 #article + #article-rest 两段：
          CSS 的 filter 会作用在【整棵子树】上，子元素没法把自己「取消模糊」，
          所以要把【豁免区】（GPT模型摇号面板）放在 #article 之外。
          拆成两个纯 div 不影响任何排版（.ro-wrap 里没有 > 子选择器）。
       豁免区：.ro-aipick（GPT模型摇号面板）—— locked 时仍然清晰、可点。 -->

  <!-- __STBAR__ 状态卡·往下滚之后的紧凑条（绿点 + 状态 + 倒计时，34px）
       ⚠️ 单独一条 fixed，故意【不放进 #article】：放在里面会被 #article-rest
          （同为 z-index:1、且在 DOM 后面）盖住，也没法在整页吸顶。
       文字由下面那段脚本每秒从状态卡同步过来；默认 display:none，
       状态卡还看得见的时候不出现 → 不遮挡任何内容。 -->
  <div class="ro-stbar" id="roStatusBar" aria-hidden="true">
    <span class="ro-stbar-dot"></span><b class="ro-stbar-t" id="roStatusBarTitle">资料已更新</b><span class="ro-stbar-cd" id="roStatusBarCd">下一期更新倒计时 --:--:--</span>
  </div>

  <div id="article">

  <div class="ro-top">
    <!-- __ALGO_LINE__ 顶部作者块：三条一个竖列（.ro-author）
         用户 2026-10-20（二改）：
           · 右上角那句问候整块删除（不要了）
           ·「交流探讨到小晴推荐师下面字母的下面居中」→ 交流探讨挪进这个竖列，
             和小晴推荐师 / yy2528161812 同一列，三条都 text-align:center
           · 列宽 = 最长那行（yy…）的宽度，三条包围盒中心落在同一条竖线上
         ⚠️ 纯文字、不可点、无按钮；三条仍统一 rotate(-15deg)（样式见下面的 CSS） -->
    <div class="ro-author">
      <div class="ro-owner">小晴推荐师</div>
      <div class="ro-user">🔍yy2528161812</div>
      <div class="ro-algo-line"><span>交流探讨</span></div>
    </div>
    <h1>春风</h1>
  </div>

  ${statusHtml}

  <script>
  /* __STBAR_JS__ 往下滚之后，把状态卡收成顶部一条（Tab 条下面 34px 高）
     · 只在【状态卡整块滚出屏幕】之后才出现 → 页面顶部时不遮挡任何内容
     · 文字每秒跟状态卡同步（倒计时、资料已更新/未更新、绿/黄）
     · 滚回顶部 → 这条消失，状态卡变回完整
     ⚠️ 这段在模板字符串里：不写反引号、不写美元花括号、不写反斜杠 */
  (function () {
    try {
      var card = document.getElementById('roStatusCard');
      var bar = document.getElementById('roStatusBar');
      var tabs = document.querySelector('.top-tabs');
      if (!card || !bar) return;
      var tEl = document.getElementById('roStatusBarTitle');
      var cEl = document.getElementById('roStatusBarCd');
      var srcT = document.getElementById('roStTitle');
      var srcC = document.getElementById('__NEXT_CD2__') || document.getElementById('__NEXT_CD__');
      var isWarn = function () { return String(card.className).indexOf('warn') >= 0; };
      var show = false;
      function pinH() {
        var h = 44;
        if (tabs) { var b = tabs.getBoundingClientRect(); if (b.height > 0) h = Math.round(b.height); }
        bar.style.top = h + 'px';
        return h;
      }
      function sync() {
        tEl.textContent = srcT ? srcT.textContent : (isWarn() ? '资料未更新' : '资料已更新');
        if (cEl) cEl.textContent = srcC ? srcC.textContent : '';
        if (isWarn()) bar.classList.add('warn'); else bar.classList.remove('warn');
      }
      function upd() {
        var pin = pinH();
        var r = card.getBoundingClientRect();
        var on = r.bottom <= pin + 1;
        if (on === show) return;
        show = on;
        if (on) { sync(); bar.classList.add('on'); } else { bar.classList.remove('on'); }
      }
      window.addEventListener('scroll', upd, { passive: true });
      window.addEventListener('resize', upd);
      window.addEventListener('load', upd);
      pinH(); sync();
      upd();
      setInterval(function () { if (show) sync(); }, 1000);
    } catch (e) { }
  })();
  </script>

  <!-- 【往下滑提示】用户 2026-10-18 二次要求：「放到 所有资料均在下面的旁边，提示他们：请滑到底」
       → 原来这条单独占一行（状态卡和工具格之间），现在删掉；
         提示文字并进状态卡的「所有资料均在下方」那一行（见 .ro-st-time 的改法）。 -->

  <!-- ============================================================
       __LATEST_ABOVE_TOOLS__ 【最新开奖】整块移到「工具（智能分析）」上面
       ------------------------------------------------------------
       用户 2026-10-20 原话：「把最新开奖放到 工具上面」
       → #ro-latest（section.ro-game 里的最新开奖区块）原来在
         #article-rest 的第一个子节点，现在挪到 #article 里、工具格【之前】。
       ⚠️ 只挪位置：内容 / 样式 / id / 内嵌脚本一个字都没改。
       ⚠️ 仍在 #article 里面 → html.locked 时照样 blur(30px) + 点不动，
          防截图口径没有变松（不需要额外补 CSS）。
       ⚠️ 间距：#article > * 与 .ro-game 都是 margin-bottom: 12px（同一个属性、
          同一个值），所以不会出现双倍间距。
       ============================================================ -->
  ${latestSecHtml}

  <!-- ============================================================
       【智能分析工具栏】8 个入口（用户 2026-10-18 设计）
       ------------------------------------------------------------
       位置：状态卡之后、【最新开奖】之后、推荐图目录之前 —— 打开页面就能看到，
             但不抢标题的位置（原来放在 h1 上面，读起来像"页面从工具栏开始"）。
       形态：4 列网格 · 8 张图标卡，米杏卡片底。
       ⚠️ 每张卡都是 <div role="button" tabindex="0">（页面不变量：没有按钮标签），
          点一下进全屏子页面，子页面自带「← 返回」。
       ⚠️ 8 个子页面的数据纪律：能算的从本页开奖数据现算；
          算不出的如实写「样本不足」；AI推荐 是系统随机并已标注 —— 绝不编数字。
       ============================================================ -->
  <div class="card-box tools-box" id="toolsBox">
  <div class="tools-head"><span class="tools-title"><span class="entry-icon" aria-hidden="true">🛠️</span> 工具<i class="tools-sub" style="display:block;margin-top:2px;font-size:11.5px;font-weight:600;font-style:normal;opacity:.82">（人工+智能分析）</i></span></div>
  <div class="tool-grid">
    <div class="tool-item" role="button" tabindex="0" data-tool="stat"><div class="icon">📊</div><div class="name">数据统计</div></div>

    <div class="tool-item" role="button" tabindex="0" data-tool="trend"><div class="icon">📈</div><div class="name">趋势分析</div></div>
    <div class="tool-item" role="button" tabindex="0" data-tool="hot"><div class="icon">🔥</div><div class="name">实时热点</div></div>
    <div class="tool-item" role="button" tabindex="0" data-tool="ma"><div class="icon">🔪</div><div class="name">杀号和选号</div></div>
    <div class="tool-item" role="button" tabindex="0" data-tool="index"><div class="icon">🎯</div><div class="name">指数预测</div></div>
    <div class="tool-item" role="button" tabindex="0" data-tool="omit"><div class="icon">📉</div><div class="name">遗漏宝</div></div>
    <div class="tool-item" role="button" tabindex="0" data-tool="pattern"><div class="icon">🧩</div><div class="name">智能规律</div></div>
    <div class="tool-item" role="button" tabindex="0" data-tool="ai"><div class="icon">🤖</div><div class="name">AI推荐</div></div>
  </div>
</div>



${expertArticlesHtml()}
<!-- __SINA_NEXT_HTML__ 下一期参考（有数据才显示）-->
${sinaNextHtml()}

<!-- ============================================================
       【手机目录表格 · 方案 D】只在窄屏（<=1365px）显示：
       宽屏保持 5 组并排 .ro-imagepair（这里被 CSS 隐藏，一点不动它）。
       格子是 <a>（页面不变量要求没有按钮标签），href 指向每张图前面的锚点。
       JS 挂掉时（body 上还有 ro-toc-pending 标记）整块不显示，
       不会出现「点了没反应」的死格子。 -->

  <!-- ============================================================
       【开机号 + 热力图 · 并排两列】用户 2026-10-18：
         「把开机号和热力图改成并排两列」
       一行两个卡片：左 = 开机号入口（<a href="#ro-kjh">），右 = 热力图折叠卡。
       点开热力图 → 它占满整行（图片要宽），见样式表最后那段「⑧ 并排两列」。
       下面是开机号点开后的区块（平时不显示，.ro-open 才展开）—— 仍然整行，
       因为它是一整张表，塞进半屏会挤。
       ⚠️ 改的只是外面这层容器，两张卡的内容 / 点击 / 折叠逻辑一个字没改。 -->
<!-- __TOC_STATIC__ 推荐图目录（10 格 · 放在开机号+热力图上面 · 3 列 4 排） -->
<!-- __TOC_EQH__ 手机推荐图目录：卡片固定等高（56px）· grid-auto-rows:56px · 竖向 flex 居中 -->
<div class="ro-imgtoc-wrap"><div class="ro-imgtoc-head"><div class="ro-imgtoc-title">推荐图目录<i class="ro-imgtoc-note" style="display:block;margin-top:2px;font-style:normal">（人工计算）</i></div><div class="ro-imgtoc-sub">点一下，全屏看那张图</div></div><div class="ro-imgtoc" data-user-locked="1" style="display:grid !important;grid-template-columns:repeat(2,minmax(0,1fr)) !important;gap:8px !important">
<a class="ro-toc-cell" href="#ro-g-ssq-main" data-ro-toc-game="ssq" data-ro-toc-image="main"><b class="ro-toc-t"><span class="entry-icon" aria-hidden="true">🔴</span> 双色球推荐号</b></a>
<a class="ro-toc-cell two-line" href="#ro-g-ssq-wuxing" data-ro-toc-game="ssq" data-ro-toc-image="wuxing"><b class="ro-toc-t"><span class="entry-icon" aria-hidden="true">☯️</span> 双色球 · 五行</b><i class="ro-toc-s">绕胆/九转/九宫</i></a>
<a class="ro-toc-cell" href="#ro-g-dlt-main" data-ro-toc-game="dlt" data-ro-toc-image="main"><b class="ro-toc-t"><span class="entry-icon" aria-hidden="true">🔵</span> 大乐透推荐号</b></a>
<a class="ro-toc-cell two-line" href="#ro-g-dlt-wuxing" data-ro-toc-game="dlt" data-ro-toc-image="wuxing"><b class="ro-toc-t"><span class="entry-icon" aria-hidden="true">☯️</span> 大乐透 · 五行</b><i class="ro-toc-s">绕胆/九转/九宫</i></a>
<a class="ro-toc-cell" href="#ro-g-fc3d-main" data-ro-toc-game="fc3d" data-ro-toc-image="main"><b class="ro-toc-t"><span class="entry-icon" aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#c94436;color:white;font-size:10px;font-weight:800;vertical-align:middle">3D</span> 3D</b></a>
<a class="ro-toc-cell" href="#ro-g-kl8-main" data-ro-toc-game="kl8" data-ro-toc-image="main"><b class="ro-toc-t"><span class="entry-icon" aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#228a65;color:white;font-size:10px;font-weight:800;vertical-align:middle">8</span> 快乐8</b></a>
<a class="ro-toc-cell" href="#ro-g-pl3-main" data-ro-toc-game="pl3" data-ro-toc-image="main"><b class="ro-toc-t"><span class="entry-icon" aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#3878b6;color:white;font-size:10px;font-weight:800;vertical-align:middle">P3</span> 排列三</b></a>
<a class="ro-toc-cell" href="#ro-g-pl5-main" data-ro-toc-game="pl5" data-ro-toc-image="main"><b class="ro-toc-t"><span class="entry-icon" aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#a26931;color:white;font-size:10px;font-weight:800;vertical-align:middle">P5</span> 排列五</b></a>
<a class="ro-toc-cell" href="#ro-g-qlc-main" data-ro-toc-game="qlc" data-ro-toc-image="main"><b class="ro-toc-t"><span class="entry-icon" aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#7959ab;color:white;font-size:10px;font-weight:800;vertical-align:middle">7L</span> 七乐彩</b></a>
<a class="ro-toc-cell" href="#ro-g-qxc-main" data-ro-toc-game="qxc" data-ro-toc-image="main"><b class="ro-toc-t"><span class="entry-icon" aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#b88c20;color:white;font-size:10px;font-weight:800;vertical-align:middle">7X</span> 七星彩</b></a>
</div></div>
  ${toolsHeatHtml}



${kjhHtml}

  <!-- ============================================================
       【热力图 · 实时跟随下一期彩种】
       ------------------------------------------------------------
       用户 2026-10-18：
         「热力图点击可以收起展开 展开就是热力图」
         「热力图根据下一期开大乐透还是双色球来实时更新 时时刻刻显示 去掉以前的定时」
       这一段只做两件事：
         ① 折叠：<details> 自带，本段只负责「展开时补一次渲染 + 等比缩放」
                （收起状态下容器宽 0，图片的等比缩放量不出来）
         ② 实时：页面打开 / 切回来 / 重新显示时【按当前时间】重算
                「下一期是哪个彩种」，只换显示、不轮询、不定时。
                彩种判断用的是上面那份 hmNextGame（和服务端同一份源码）。
       ⚠️ 没有 setInterval：定时器已按要求去掉；页面不动就不会反复计算。
       ============================================================ -->
  <script>
  ${HM_NEXT_SRC}
  (function () {
    var box = null;
    try { box = document.getElementById('ro-heatmap'); } catch (e0) { box = null; }
    if (!box) return;

    var NAME = { ssq: '双色球', dlt: '大乐透' };

    /* 【并排两列 · 2026-10-18】展开 → 热力图占满整行（.grid-2-col 从两列变一列）。
       支持 :has() 的浏览器纯 CSS 就生效（见样式表 __LAYOUT__ ⑧），
       这里再加一个 class 兜底（老内核没有 :has 也不会把图挤在半屏里）。
       ⚠️ 只加 / 减一个 class，折叠本身仍然完全由 <details> 管。 */
    var rowBox = null;
    try { rowBox = box.parentNode; } catch (eR) { rowBox = null; }
    function syncRow() {
      try {
        if (!rowBox || !rowBox.classList) return;
        if (box.open) rowBox.classList.add('is-open');
        else rowBox.classList.remove('is-open');
      } catch (eR2) { /* 忽略 */ }
    }

    /* 这个彩种下一期的期号：热力图数据里有就用它，没有就按开奖数据现算 */
    function issueOf(gid) {
      try {
        var H = (typeof HEATMAP_DATA !== 'undefined' && HEATMAP_DATA && HEATMAP_DATA.games)
          ? HEATMAP_DATA.games[gid] : null;
        if (H && H.issue) return String(H.issue);
      } catch (e1) { /* 忽略 */ }
      try { if (typeof nextIssueFor === 'function') return String(nextIssueFor(gid) || ''); } catch (e2) { /* 忽略 */ }
      return '';
    }

    /* 按当前时间选彩种 → 换显示 → 更新副标题 */
    function sync() {
      var gid = 'ssq';
      try { gid = hmNextGame((new Date()).getTime()) || 'ssq'; } catch (e) { gid = 'ssq'; }

      var blocks = box.querySelectorAll('[data-ro-hm-game]');
      var hit = false;
      for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].getAttribute('data-ro-hm-game') === gid) {
          hit = true;
          blocks[i].removeAttribute('hidden');
        } else {
          blocks[i].setAttribute('hidden', 'hidden');
        }
      }
      var noneEl = box.querySelector('[data-ro-hm-none]');
      if (noneEl) {
        if (hit) noneEl.setAttribute('hidden', 'hidden');
        else noneEl.removeAttribute('hidden');
      }
      var subEl = box.querySelector('[data-ro-hm-sub]');
      if (subEl) {
        var iss = issueOf(gid);
        /* ⚠️ 期号可能暂时拿不到：这段脚本比页尾那批数据脚本先执行
              （HEATMAP_DATA / nextIssueFor 还没定义），这时【不要】把服务端
              已经写好的「当前：双色球 第 2026119 期」擦成半截，
              等 DOMContentLoaded / load 再算一次（下面绑了）。 */
        if (iss) subEl.textContent = '当前：' + (NAME[gid] || '') + ' 第 ' + iss + ' 期';
      }
      try {
        if (document.body && document.body.setAttribute) {
          document.body.setAttribute('data-heatmap-game', gid);
        }
      } catch (e3) { /* 忽略 */ }
      try { if (typeof window.__roFit === 'function') window.__roFit(); } catch (e4) { /* 忽略 */ }
      return gid;
    }

    /* 收起 / 展开 */
    try {
      box.addEventListener('toggle', function () {
        /* 【并排两列】先同步「整行 / 半屏」再决定要不要补渲染 */
        syncRow();
        if (!box.open) return;
        /* 展开后补一次渲染（收起时图位在 display:none 里） */
        try { if (typeof window.__roRenderAll === 'function') window.__roRenderAll(); } catch (e) { /* 忽略 */ }
        sync();
        setTimeout(function () {
          try { if (typeof window.__roFit === 'function') window.__roFit(); } catch (e2) { /* 忽略 */ }
        }, 60);
      });
    } catch (e5) { /* 忽略 */ }

    sync();
    syncRow();

    /* 「实时」= 不轮询：打开 / 切回来 / 重新显示时各算一次 */
    try { document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); }); } catch (e6) { /* 忽略 */ }
    try { window.addEventListener('pageshow', function () { sync(); }); } catch (e7) { /* 忽略 */ }
    try { window.addEventListener('focus', function () { sync(); }); } catch (e8) { /* 忽略 */ }
    /* 上面那句 sync() 跑得比页尾的数据脚本早（那时候还拿不到期号），
       所以在 DOMContentLoaded / load 各补算一次 —— 一次都不能少，否则副标题只写半个。 */
    try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { sync(); }); } catch (e6b) { /* 忽略 */ }
    try { window.addEventListener('load', function () { sync(); }); } catch (e7b) { /* 忽略 */ }

    /* 带 #ro-heatmap 直接打开时（老链接）→ 直接展开，别让用户点一下才发现空 */
    try {
      if (String(location.hash || '').indexOf('#ro-heatmap') === 0) { box.open = true; syncRow(); }
    } catch (e9) { /* 忽略 */ }
    /* 页内跳到 #ro-heatmap（同页改 hash 不会重载）→ 也要展开 */
    try {
      window.addEventListener('hashchange', function () {
        if (String(location.hash || '').indexOf('#ro-heatmap') === 0) {
          box.open = true;
          syncRow();
          sync();
        }
      });
    } catch (e10) { /* 忽略 */ }
  })();
  </script>

  <!-- 【开机号】点入口后把区块滚到视口顶部。
       为什么要有这几行：区块平时是 display:none，靠 CSS :target 展开；
       而浏览器「跳到锚点」这一步，在元素刚从 display:none 变显示的那一刻
       并不总是执行（实测无头 Chrome 时灵时不灵）—— 补一次 scrollIntoView 才稳。
       显示本身仍然只靠 CSS：这段脚本挂了/被禁，区块照样能展开，功能不丢。 -->
  <script>
  (function () {
    try {
      
      /* __CLASS_TOGGLE__ 【点一下展开 / 再点一下收起】
       user request: 点击一下展开，再点击一下收起来。
       ⚠️ 为什么不用 :target + replaceState：
          history.replaceState 清掉哈希后，浏览器【不会】重新计算 :target，
          所以「再点一下」收不起来。改用 class 控制，行为确定。
       CSS 侧：.ro-panel{display:none} .ro-panel.ro-open{display:block}
       :target 规则仍然保留（脚本被禁时还能靠锚点展开，功能不丢）。 */
      /* 【必须放在最前面】下面两段都要用它；原来定义在最后，
         脚本一执行 OK 还是 undefined，一读 OK[...] 就抛 TypeError，
         整段脚本崩溃 → 点击监听根本没绑上 → 区块点不开。 */
      /* 现在只有「开机号」还走这套 class 折叠；
         热力图改成了 <details>（见上面对应的那段脚本），不在这张表里。 */
      var OK = { '#ro-kjh': 1 };

      /* __COPY_LIVE__ 【点击复制链接】
         微信把 yiqicai.com 拉黑了，点外链跳不过去 → 改成复制到剪贴板，
         用户自己粘到浏览器打开。
         用 <a>（不是按钮标签），点一下复制 + 把文案临时改成「已复制」。 */
      var copyEls = document.querySelectorAll('[data-ro-copylive]');
      for (var ci = 0; ci < copyEls.length; ci++) {
        copyEls[ci].addEventListener('click', function (e) {
          var url = String(this.getAttribute('data-copy') || this.getAttribute('href') || '');
          e.preventDefault();
          var self = this;
          var done = function (ok) {
            var old = self.getAttribute('data-orig') || self.textContent;
            if (!self.getAttribute('data-orig')) self.setAttribute('data-orig', old);
            self.textContent = ok ? '已复制 ✅ 请到浏览器粘贴打开' : '复制失败，请长按此处选择复制';
            setTimeout(function () {
              self.textContent = self.getAttribute('data-orig') || old;
            }, 2600);
          };
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); });
            } else {
              var ta = document.createElement('textarea');
              ta.value = url;
              ta.style.position = 'fixed';
              ta.style.opacity = '0';
              document.body.appendChild(ta);
              ta.select();
              var ok = false;
              try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
              document.body.removeChild(ta);
              done(ok);
            }
          } catch (err) { done(false); }
        });
      }

      function roCloseAll() {
        var ps = document.querySelectorAll('.ro-panel');
        for (var k = 0; k < ps.length; k++) ps[k].classList.remove('ro-open');
      }
      var tools = document.querySelectorAll('.ro-tool');
      for (var t = 0; t < tools.length; t++) {
        tools[t].addEventListener('click', function (e) {
          var href = String(this.getAttribute('href') || '');
          if (!OK[href]) return;
          e.preventDefault();
          var el = document.getElementById(href.slice(1));
          if (!el) return;
          var wasOpen = el.classList.contains('ro-open');
          roCloseAll();
          if (wasOpen) {
            try {
              var tip2 = this.querySelector ? this.querySelector('[data-tip]') : null;
              if (tip2 && tip2.getAttribute('data-orig')) tip2.textContent = String(tip2.getAttribute('data-orig'));
            } catch (e) { /* 忽略 */ }
            /* 再点一下 → 收起；顺便把哈希清掉（保持一致） */
            try { history.replaceState(null, '', location.pathname + location.search); }
            catch (err) { /* 忽略 */ }
            return;
          }
          el.classList.add('ro-open');
          /* 【提示文字随状态变】展开后把那句改成「点击收起」 */
          try {
            var tipEl = this.querySelector ? this.querySelector('[data-tip]') : null;
            if (tipEl && !tipEl.getAttribute('data-orig')) {
              tipEl.setAttribute('data-orig', tipEl.textContent);
            }
            if (tipEl) tipEl.textContent = String(tipEl.getAttribute('data-orig') || '').replace('点击查看', '点击收起');
          } catch (e) { /* 忽略 */ }
          try { history.replaceState(null, '', href); } catch (err) { /* 忽略 */ }
          try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
          catch (err) { try { el.scrollIntoView(true); } catch (e2) { /* 忽略 */ } }
        });
      }
      /* 带 #ro-kjh 直接打开时，也要把 class 加上（跟 :target 对齐） */
      (function () {
        var id = String(location.hash || '');
        if (!OK[id]) return;
        var el = document.getElementById(id.slice(1));
        if (el) {
          el.classList.add('ro-open');
        }
      })();

      function go() {
        var id = String(location.hash || '');
        if (!OK[id]) return;
        var el = document.getElementById(id.slice(1));
        if (!el) return;
        try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        catch (e) { try { el.scrollIntoView(true); } catch (e2) { /* 忽略 */ } }
      }
      window.addEventListener('hashchange', function () { setTimeout(go, 30); });
      if (location.hash) window.addEventListener('load', function () { setTimeout(go, 60); });
    } catch (e) { /* 忽略：区块的显示不依赖这段 */ }
  })();
  </script>

  </div><!-- /#article · 到这里为止的内容会被防截图模糊 -->

  <!-- ============================================================
       __ACTION_2COL__ 晒票 + GPT模型摇号：并排两列（用户 2026-10-18）
       ------------------------------------------------------------
       用户原话：「晒票和 GPT模型摇号 也做成并排两列，跟开机号+热力图
                 那行同样式」，并给了 .grid-2-col-action / .action-card-btn
       这套 CSS（变量已映射到米杏主题，见样式表最后那段 ⑨）。
       · 两格都是【原来那两张卡，机制一个字没改】：
           左 = <details class="ro-xysp action-card-btn"> 原生折叠
           右 = <details class="ro-aipick action-card-btn"> 原生折叠
         折叠仍然由 <details>/<summary> 管；「展开 ▸ / 收起 ▾」还是 CSS
         伪元素按 [open] 换字 —— 没有 onclick、没有裸 button。
       · 收起 = 两列各占一半；任一格展开 → 它占满整行（图 / 面板要宽），
         和热力图那一行同一套 .is-open 同步（见页尾那段脚本）。
       · ⚠️ 这一行【故意】放在 #article 之后：GPT摇号 在防截图锁定时必须
         仍能点（用户要自己摇号）；晒票的图片区在锁定时由样式表补一条
         模糊（html.locked .ro-xysp-pics），保护口径没有变松。
       ============================================================ -->
  <div class="grid-2-col-action" id="ro-action-2col">
  ${xyspHtml}
  ${aiPickHtml}
  </div>
  <script>
  /* __ACTION_2COL__ 展开哪一格，哪一格就占满整行（和热力图那行同一套做法）。
     ⚠️ 只加 / 减一个 class，折叠本身完全由 <details> 管；
        现代内核 CSS 的 :has() 也已经能自己搞定，这里是老内核的兜底。 */
  (function () {
    try {
      var row = document.getElementById('ro-action-2col');
      if (!row || !row.querySelectorAll) return;
      var ds = row.querySelectorAll('details');
      if (!ds.length) return;
      function sync() {
        var open = false;
        for (var i = 0; i < ds.length; i++) if (ds[i].open) { open = true; break; }
        if (open) row.classList.add('is-open');
        else row.classList.remove('is-open');
      }
      for (var k = 0; k < ds.length; k++) {
        ds[k].addEventListener('toggle', sync);
      }
      sync();
    } catch (e) { /* 忽略：布局兜底挂了，折叠本身照样能用 */ }
  })();
  </script>

  <!-- ============================================================
       __FROG_HIST_ROW__ 🐸青蛙家园 + 历史开奖：并排两列（用户 2026-10-20）
       ------------------------------------------------------------
       用户原话：「青蛙家园 + 历史中奖 并排放一排」（截图里两条各占整行）。
       用户选方案 b：历史开奖【保持默认展开】，青蛙卡【不跟着拉伸】。
       · 左格 = 中奖卡（用户 2026-10-20：「移到晒票下一栏」= 晒票正下方）
       · 右格 = 🐸青蛙家园（另一个窗口加的那块面板：内部内容 / 样式
         一个字都没动，这里只把它挪进这一行的左格）
       （历史卡改成收起态，位置在左格）
       ⚠️ 结构上唯一的改动：这一行放在 #article-rest【之前】。
          青蛙原来就在 #article-rest 外面（锁定时还能点，和「晒票 | GPT模型摇号」
          那一行同一口径，见上面 __ACTION_2COL__ 的说明）；要跟它并排，
          历史开奖就得跟着出来。为了不让防截图口径变松，样式表 ⑩ 里补了
          html.locked .ro-hist（锁定照样模糊 + 点不动），历史开奖的保护和以前一样。
       ⚠️ 页面通用规则 .grid-2-col:has(> details[open]) 会把"展开"的那一行压成一列，
          这一行【故意】用 ID 权重压回两列 —— 用户要的就是展开状态也并排。
       ============================================================ -->
  <div class="grid-2-col" id="ro-frog-hist-row">
  <!-- ============================================================
       __RO_HIST__ 历史开奖（用户 2026-10-19 要求）
       ------------------------------------------------------------
       用户原话：「在GPT模型摇号下面增加一项;按钮 历史开奖：
                点开以后就是近365天内所有中奖播报.不管什么奖项1等奖2等奖3等奖都记录」
       第二轮澄清（用户）：「是我推荐中奖的哦」→ 内容是【推荐号命中记录】。
       2026-10-20 用户又改两条：
         ① 位置：跟 🐸青蛙家园【并排】，所以挪进上面那个 .grid-2-col（右格），
            不再是自己占整行；
         ② 只记高等奖：一/二/三等奖 + 组选直选（白名单见上面 __HIST_HIGH_ONLY__），
            副标题跟着改成「自 …起 · 中奖才公布」（起点见 HIST_FROM_TXT，__MARQUEE_WINS__ 后取实际最早一条）。
       · 折叠：原生 <details> + <summary>，「点击查看 ▾ / 点击收起 ▴」
         由 CSS 伪元素按 [open] 换字 —— 零脚本、零裸 button、零存储。
         默认 open（用户 2026-10-20 说过「找不到」，保持展开）。
       · 每条 = 日期 · 期号 · 几等奖（一行）+【推荐】/【开奖】两行小字对照，
         命中号高亮；没中 / 只是低等奖的期次【一个字都不写】，没中过奖的彩种【整组不出现】。
       · 【不再按期号回算· 2026-10-20】用户：「为什么还有九月份的？我都没推荐过」——
         现在只认真实发过、且写下来过的推荐号（存档逻辑见构建脚本里的 __RECO_ARCHIVE__）。
       · 一条都没有时只写一行「近 365 天暂无中奖记录（自 2026-10-19 起记录 · 中奖才公布）」。
       ============================================================ -->
  <details class="ro-hist" id="ro-hist">
    <summary class="ro-hist-head">
      <span class="ro-hist-h2"><span class="entry-icon" aria-hidden="true">🏆</span> 中奖</span>
      <span class="ro-hist-sub">（2026.10.15此网址诞生）</span>
      <span class="ro-hist-arrow" aria-hidden="true"></span>
    </summary>
    <div class="ro-hist-body">
${histHtml}
    </div>
  </details>
<!-- __FROG2__ 用户 2026-10-18：晒票那一排下面加按钮 🐸青蛙家园（展示，不跳转） -->
${FROG_PANEL_HTML}

  </div><!-- /#ro-frog-hist-row · 两列并排结束 -->

  <div id="article-rest"><!-- 面板之后的内容：同样要防截图 -->

  <!-- __LATEST_MOVED__ 【最新开奖】已按要求移到「工具（智能分析）」上面
       （见上面 __LATEST_ABOVE_TOOLS__ 那段），这里不留，避免同一个节点出现两次。 -->

  <!-- ============================================================
       __ROW3__ 「专家推荐 + 走势图」并排两列（用户 2026-10-18）
       ------------------------------------------------------------
       用户原话：「专家推荐和走势图放到一起」「版面做一样」。
       所以这两张卡包进 .grid-2-col（真网格，align-items:stretch）：
         · 收起 → 各占一半、两张等高、三行（标题/副标题/胶囊）位置对齐；
         · 点开任意一张 → 它跨满整行（grid-column:1/-1），另一张落到下一行。
       原来那套 inline-block + 半屏宽度的 hack 已删（它做不到等高）。
       ⚠️ 两张卡的折叠机制都没动：仍是 <details>/<summary> + CSS 伪元素换字。 -->
  <div class="grid-2-col" id="ro-xj-row">
  ${expertsHtml}

  <!-- ============================================================
       【文章参考】用户要求：放在【最新开奖】下面、
       「推荐图目录 / 推荐图」上面（= 原来「彩票推荐图」分隔条的位置）。
       纯文字区块：不含任何图片，所以图位数量不变。 -->
  <!-- ============================================================
       __TREND_ENTRY__ 「走势图」入口 —— 用户要求放在【文章参考】上面。
       【本轮改版】原来是 <a href> 跳去独立页；上一版改成 <details> 里
       嵌一个独立页的小窗口。2026-10-17 用户再明确一次：
         「留在近30期走势预选参考里面. 删除单独走势图独立页」
       → 展开体里【直接内联走势图内容】（表格 + 工具栏 + 画线脚本），
         独立页已删除，页面上不再有任何指向它的链接。
       ⚠️ 折叠机制和「晒票 / GPT模型摇号」同一套：<details> + <summary>，
          「点击查看 / 点击收起」由 CSS 伪元素按 [open] 切换，
          不用 JS、不用裸 <button>（用户铁律）、不用裸 <div onclick>。
       ⚠️ 内联的那一块自己做了三件事（见 build-trend.mjs 的 renderTrendFragment）：
          ① 样式全部收进 .ro-trend-embed（分享页也有 .ro-wrap / .ro-top /
             .ro-status / .ro-foot / .btn，不收就波及整页）
          ② 脚本整段包 IIFE + 根节点 id 加前缀（和分享页共用 document）
          ③ 里面【没有】顶部那排页面标签（彩票推荐 / 竞彩·足球 / 走势图）
       ⚠️ 页面不变量：纯文字 + 表格，没有 <img> → data-image 不变（仍 21）。
       ============================================================ -->
  <details class="ro-trend" id="ro-trend">
    <summary class="ro-trend-head">
      <span class="ro-trend-h2"><span class="entry-icon" aria-hidden="true">📈</span> 走势图</span>
      <span class="ro-trend-sub">近 30 期走势 · 预选参考</span>
      <span class="ro-trend-arrow" aria-hidden="true"></span>
    </summary>
    <div class="ro-trend-body">
${trendHtmlFull}
    </div>
  </details>
  </div>

  <!-- ============================================================
       __REFPIC__ 「手绘参考图 + 参考图」并排两列（用户 2026-10-18）
       ------------------------------------------------------------
       用户原话：「我的双色球/大乐透（参考图）和手绘参考图放一排」
       → 左 = 手绘参考图（3D/排三）· 右 = 参考图（双色球/大乐透），
         装进 .grid-2-col，和另外三组同一套卡片外观 + 等高 + 三行对齐。
       ⚠️ 右卡是【新建】的折叠卡（页面上原来没有这张）：点开 = 双色球 / 大乐透
          四个图位的入口，用的就是页面已有的那 4 张推荐图（锚点 + 目录格子那套），
          点一下照旧是「全屏看那张图」——没有新造图、没有新的看图机制。
       ⚠️ 顶部那个 10 格的「推荐图目录」一个字没动。
       ⚠️ 折叠仍是 <details>/<summary> + CSS 伪元素换字，没有 button 标签。 -->
  <div class="grid-2-col" id="ro-ref-row">
${p3dHtml}
  <details class="ro-ref-pic" id="ro-refpic">
    <summary class="ro-ref-head">
      <span class="ro-ref-h2"><span class="entry-icon" aria-hidden="true">🖼️</span> 参考图</span>
      <span class="ro-ref-sub">（双色球 / 大乐透）</span>
      <span class="ro-ref-arrow" aria-hidden="true"></span>
    </summary>
    <div class="ro-ref-body">
<!-- __PX9__ 两级方法目录（2 彩种 × 9 方法） -->

<!-- __PX9__ 两级方法目录（2 彩种 × 9 方法） -->
  <!-- 【参考图 · 用户 2026-10-19「我的参考图也没了」】
       之前误删了整个 px9 容器 → 4 张参考图是 JS 画进 #px9Out 的，容器没了图就没了。
       现在把容器补回来，但把「双色球/大乐透」两个方法 tab 和九宫格按钮全部 display:none 隐藏，
       只保留输出区 —— 图回来、方法栏还是看不到。 -->
  <div class="px9" id="px9" style="display:block">
    <div class="px9-games">
      <div class="px9-g on" role="button" tabindex="0" data-px9-game="ssq">双色球</div>
      <div class="px9-g" role="button" tabindex="0" data-px9-game="dlt">大乐透</div>
    </div>
    <div class="px9-methods" id="px9Methods"></div>
    <div class="px9-out" id="px9Out"></div>
  </div><!-- 【已按用户要求删除 · 2026-10-18】「推荐图 · 方法」整块删掉（双色球/大乐透 tab + 九宫格 + 结果区 + 提示）。 用户原话：「这一栏给我删了」。⚠️ 若又被还原，说明有别的窗口在改同一个文件。 -->
      <!-- __PX9__ 两级目录：2 个彩种 → 9 个方法（用户 2026-10-18 指定） -->
      <!-- 【已按用户要求删除 · 2026-10-18】「推荐图 · 方法」这一栏整块删掉
           （双色球/大乐透 两个 tab + 余数算法/分区法/冷热号/遗漏值算法/奇偶/质合/和值/跨度/多源共振法 九宫格 + 计算结果区 + 底部提示）。
           用户原话：「这一栏给我删了」。
           下面「本页算法（人工计算手法）」那行小字保留（用户没要求删它）。
           ⚠️ 对应的 JS（#px9Methods/#px9Out）已自带 null 保护，
              元素不存在时直接什么都不做，不会报错。 -->
      <!-- ============================================================
           __ALGO_TAG__ 「本页算法」清单（用户 2026-10-18）
           ------------------------------------------------------------
           用户原话：「余数算法、分区法、冷热号、遗漏值算法、奇偶、质合、
                      和值、跨度、多源共振法 —— 每个后面都加内容（人工计算手法）」
           · 只在这张「参考图」卡里列举一次（按钮文字 / 表格标题一个都不动）
           · 9 项一个不少，每项后面都跟「（人工计算手法）」
           · 小字 12px + 灰（--ro-fg2）+ 自动换行，375 / 320 折成几行，不横向溢出
           · ⚠️ 不写任何数据出处（source-guard 会拦）；「人工计算手法」是用户要的
           · 下面那行合规提示：这张卡里原本没有免责，补一句小的，不重复页尾
           ============================================================ -->
      <div class="ro-ref-algo-w">⚠️ 仅用于历史数据统计娱乐，无法预测开奖！</div>
    </div>
  </details>
  </div>

  <!-- ============================================================
       __ZN_ROW__ 【智讯 + 智能精选】并排两列（用户新增需求）
       ------------------------------------------------------------
       用户原话：截图圈了【手绘参考图 / 参考图】那一排下面那两个空位 →
                「帮我增加两个项目栏  智讯  和  智能精选」
       → 所以这一行就放在 #ro-ref-row 下面、文章参考上面。
       · 左 = 智讯     ：今天 / 明天开奖日程（彩种 · 期号 · 开奖时刻）
                        + 最近开奖（几个彩种各取最新一期，带号码）
                        + 最新资讯标题（都来自页面已有的数据，取不到就整块不出）
       · 右 = 智能精选 ：近 30 期频次算出的 胆码 3 / 杀号 3 / 精选 1 注
                        （期号做种子 → 同一期永远同一注；20 码算法一行没动）
       · 装进 .grid-2-col：375 下正好两列一行（新加两张刚好凑一行）；
         320 保留两列、只缩字号，长号码自动折行，不横向溢出。
        ⚠️ 折叠机制和「中奖 / 走势图 / 参考图」完全同一套：
           <details> + <summary>，「点击查看 ▸ / 点击收起 ▾」由 CSS 伪元素按
           [open] 换字 —— 零脚本、零裸 button、零内联事件。
        ⚠️ 纯文字：没有任何图片 → 页面图位数量不变。
       ============================================================ -->
  <div class="grid-2-col" id="ro-zn-row">
  <details class="ro-zn" id="ro-zx-news">
    <summary class="ro-zn-head">
      <span class="ro-zn-h2"><span class="entry-icon" aria-hidden="true">📰</span> 资讯</span>
      <span class="ro-zn-sub">开奖 · 结果 · 资讯</span>
      <span class="ro-zn-arrow" aria-hidden="true"></span>
    </summary>
    <div class="ro-zn-body">
${zxNewsHtml}
    </div>
  </details>
  <details class="ro-zn" id="ro-zx-pick">
    <summary class="ro-zn-head">
      <span class="ro-zn-h2"><span class="entry-icon" aria-hidden="true">✨</span> 智能精选</span>
      <span class="ro-zn-sub">胆码 · 杀号 · 精选一注</span>
      <span class="ro-zn-arrow" aria-hidden="true"></span>
    </summary>
    <div class="ro-zn-body">
${zxPickHtml}
    </div>
  </details>
  </div>

  <script>
  /* __ZN_CHIPS__ 智讯卡里那排彩种药丸（默认双色球）
     · 纯 div + role="button"，只切 class，不重建 DOM —— 页面铁律：没有 button 标签
     · 找不到元素就 return，不影响别的区块（分享页里标签少了也不会报错） */
  (function () {
    var wrap = document.getElementById('ro-zn-chips');
    if (!wrap) return;
    var chips = [].slice.call(wrap.querySelectorAll('[data-zx-game]'));
    var panes = [].slice.call(document.querySelectorAll('#ro-zn-row [data-zx-pane]'));
    if (!chips.length || !panes.length) return;
    function show(gid) {
      chips.forEach(function (c) {
        c.className = 'ro-zn-chip' + (c.getAttribute('data-zx-game') === gid ? ' on' : '');
      });
      panes.forEach(function (p) {
        p.className = 'ro-zn-pane' + (p.getAttribute('data-zx-pane') === gid ? ' is-on' : '');
      });
    }
    chips.forEach(function (c) {
      var gid = c.getAttribute('data-zx-game');
      c.addEventListener('click', function () { show(gid); });
      c.addEventListener('keydown', function (e) {
        var k = e.key || '';
        if (k === 'Enter' || k === ' ' || k === 'Spacebar' || e.keyCode === 13 || e.keyCode === 32) {
          e.preventDefault();
          show(gid);
        }
      });
    });
  })();

  /* __FROG_ART_SPLIT_JS__ 免费资料的两颗药丸（双色球 / 大乐透）
     · 和智讯那套【同一手法】：只切 class，不重建 DOM，没有 button 标签
     · 找不到元素就 return，不影响别的区块 */
  (function () {
    var wrap = document.getElementById('frogArtChips');
    if (!wrap) return;
    var chips = [].slice.call(wrap.querySelectorAll('[data-art-g]'));
    var panes = [].slice.call(document.querySelectorAll('[data-art-pane]'));
    if (!chips.length || !panes.length) return;
    function show(gid) {
      chips.forEach(function (c) {
        c.className = 'ro-zn-chip' + (c.getAttribute('data-art-g') === gid ? ' on' : '');
      });
      panes.forEach(function (p) {
        p.className = 'ro-zn-pane' + (p.getAttribute('data-art-pane') === gid ? ' is-on' : '');
      });
    }
    chips.forEach(function (c) {
      var gid = c.getAttribute('data-art-g');
      c.addEventListener('click', function () { show(gid); });
      c.addEventListener('keydown', function (e) {
        var k = e.key || '';
        if (k === 'Enter' || k === ' ' || k === 'Spacebar' || e.keyCode === 13 || e.keyCode === 32) {
          e.preventDefault();
          show(gid);
        }
      });
    });
  })();

  /* __ZX_PICK_CHIPS__ 智能精选卡里那排彩种药丸
     （双色球 / 大乐透 / 排列3 / 福彩3D，默认双色球）
     · 和上面智讯卡是【两套属性名】（data-zxp-*），两张卡互不干扰
     · 纯 div + role="button"，只切 class，不重建 DOM —— 页面铁律：没有 button 标签 */
  (function () {
    var wrap = document.getElementById('ro-zx-pick-chips');
    if (!wrap) return;
    var chips = [].slice.call(wrap.querySelectorAll('[data-zxp-game]'));
    var panes = [].slice.call(document.querySelectorAll('#ro-zx-pick [data-zxp-pane]'));
    if (!chips.length || !panes.length) return;
    function show(gid) {
      chips.forEach(function (c) {
        c.className = 'ro-zn-chip' + (c.getAttribute('data-zxp-game') === gid ? ' on' : '');
      });
      panes.forEach(function (p) {
        p.className = 'ro-zn-pane' + (p.getAttribute('data-zxp-pane') === gid ? ' is-on' : '');
      });
    }
    chips.forEach(function (c) {
      var gid = c.getAttribute('data-zxp-game');
      c.addEventListener('click', function () { show(gid); });
      c.addEventListener('keydown', function (e) {
        var k = e.key || '';
        if (k === 'Enter' || k === ' ' || k === 'Spacebar' || e.keyCode === 13 || e.keyCode === 32) {
          e.preventDefault();
          show(gid);
        }
      });
    });
  })();
  </script>

  ${articlesHtml}

  <div class="ro-divider"><span>彩票推荐图</span></div>

  ${sectionsHtml}

  ${hitSecHtml}

  <!-- ============================================================
       __INSTALL__ 「添加到手机桌面」安装教程 —— 页面最底部（页尾之前）
       ------------------------------------------------------------
       用户 2026-10-18：「帮我把安装教程放到下面 图片可以变大.
                         目的让用户清晰的知道怎么安装」
       2026-10-18 二改：框框（两列卡片）保留，卡里的内容升级成
       图标 + 平台名 + 虚线 + 绿圆序号三步 + 卡下小注（原来只有 1.2.3. 纯文字）。
       【已恢复】用户 2026-10-18 21:50 确认要这张安装大图
       （当晚曾要求删掉这个模块 → HTML 整块被换成一句注释，顶部还加过一条
         __NO_INSTALL__ 的 display:none 锁；本次恢复先把那条锁删了）
       本次改动（__INSTALL_RESTORED__）：
         ① section 恢复（原版标记）
         ② 标题/副标题下面新增 install-guide.jpg 大图（.ro-install-shot，全宽）
         ③ __NO_INSTALL__ 锁已删除（见上面 CSS 里 __INSTALL_RESTORED__ 那段）
         ④ 【两列卡片已按用户要求删除】用户原话：「不要了 有图片就不要了」
            → 删掉那两张两列卡片（安卓/微信 · 苹果 iPhone，
              含卡里的 ol 三步和卡下小注「浏览器里也叫…」「只有 Safari 支持…」）；
              现在这一块只剩：标题 + 副标题 + 大图 + 底部备注。
            → CSS 里对应的卡片样式规则【2026-10-20 已一并删除】（原先注释写着
              "留着没删、以后好加回来"，实测就是 8 条死规则 + 两个 @media 里的
              7 条收窄，页面里一个元素都不用了）。要加回卡片得连样式一起重写，
              原版在 git 历史里（或本机 _bk_* 备份）。
       · 位置：正文最后一块（#article-rest 里、.ro-foot / 免责声明 之前）
       · 形式：大图（100% 全宽·画面已把安卓 / 苹果的步骤画全）+ 米杏色卡片
       · ⚠️ 纯展示：没有按钮标签、没有内联点击 / 内联事件（图片失败收起走 addEventListener）
       ============================================================ -->
  <section class="ro-install" id="ro-install" aria-labelledby="ro-install-h">
    <h2 class="ro-install-h" id="ro-install-h">添加到手机桌面，更方便更稳定</h2>
    <div class="ro-install-lead">加好之后，下次直接点手机桌面上的图标就能打开，不用再翻聊天记录找链接。</div>

    <!-- 安装教程大图：800×1432 / 约 204 KB（原图 1520×2720 / 3.5 MB）
         ⚠️ loading="lazy" 别拖慢首屏；width/height 先占位，避免图加载完把下面的备注顶下去 -->
    <img class="ro-install-shot" src="./install-guide.jpg"
         alt="安装步骤：安卓手机和苹果 iPhone 如何把本页添加到手机桌面"
         width="800" height="1432" loading="lazy" decoding="async">

    <div class="ro-install-note">备注：添加桌面更方便更稳定</div>
  </section>

  <script>
  /* __INSTALL_SHOT_ERR__ 大图挂了就整块收起（别显示破图标）
     · 不用内联 onerror，走 addEventListener —— 页面铁律是「零内联事件」
     · 图片是 lazy 的：没滚到时 complete=true / naturalWidth=0 会误判，所以两种都判一次 */
  (function () {
    var shot = document.querySelector('.ro-install-shot');
    if (!shot) return;
    function hide() { shot.style.display = 'none'; }
    shot.addEventListener('error', hide);
    if (shot.complete && shot.naturalWidth === 0 && shot.getBoundingClientRect) {
      /* 只有真的发起过请求（currentSrc 有值）才算失败 */
      if (shot.currentSrc || shot.src) hide();
    }
  })();
  </script>

  <div class="ro-foot">
    本页面为只读分享版，仅供观看，无法修改。<br>
    彩票有风险，投注需谨慎。以上内容仅为个人分析，不构成购彩建议，请理性参与。
  </div>

  <!-- 免责声明（页面最底部，独立区块；浅灰小字，不弹窗、不遮挡） -->
  <div class="ro-disclaimer">
    <h3>免责声明</h3>
    <p>本页所有内容均为公开信息的统计整理，仅供娱乐与数据参考，不构成任何购彩建议，也不承诺任何中奖结果。彩票开奖为独立随机事件，请理性购彩，量力而行。</p>
    <p>未满 18 周岁禁止购买彩票。</p>
  </div>

  </div><!-- /#article-rest · 防截图模糊区结束 -->

</div>

<!-- ============================================================
     【防截图】遮罩 + 动态水印 + 管理员徽章
     ------------------------------------------------------------
     ⚠️ 这三个【必须放在 .ro-wrap 外面、body 直下】：
        .ro-wrap 里的 #article / #article-rest 在 locked 时会被加 filter，
        而 filter 会给后代建立新的包含块 —— 那样 position:fixed 的遮罩
        就不再相对视口定位了（会跟着内容跑）。
     层级：遮罩 99998；豁免面板 .ro-aipick 抬到 99999 压在遮罩上。
     ⚠️ 都是纯 div，没有按钮标签（页面不变量：按钮标签数 = 0）。
     ⚠️ 【没有水印层】—— 用户明确说「不要水印」，那一层已经整个删掉。 -->
<div id="mask" aria-hidden="true">
  <div class="icon">🔒</div>
  <div>检测到截图或窗口切换</div>
  <div>内容已自动隐藏</div>
  <div class="tip">请回到页面继续阅读（4 秒后自动恢复）</div>
</div>
<!-- 管理员徽章已经挪到页面顶部 Tab 条下面（见 __TOP_TABS__ 那段），这里不再重复放。 -->

${inlineScriptsHtml}
<script>
/* ============================================================
   【自愈】页面确实旧了就整页刷新（兜底）
   ------------------------------------------------------------
   手机浏览器（尤其微信内置）会把页面缓存很久，
   导致「电脑上更新了、手机上还是旧的」。
   这段代码拿云端的号码文件时间和页面生成时间对比，
   页面确实旧、而且页尾的【准实时】逻辑又没能就地换过来时，
   才带一个【每次都不相同】的尾巴重新加载整页。

   【两个坑都修了】
   1) 时间比较：以前直接拿 publishedAt（UTC、'T' 分隔）和 data-built
      （北京时间）比字符串 —— UTC 比北京早 8 小时，几乎永远比不赢，
      所以这段以前基本不触发。现在统一转成北京时间再比。
   2) 不和准实时机制打架：页尾的准实时逻辑能就地重渲染成功时不刷新整页；
      只有「数据是新的、但页面没能显示出来」才刷新兜底。
   ============================================================ */
(function () {
  try {
    var shown = document.body.getAttribute('data-built') || '';
    if (!shown) return;

    /* 防止无限刷新：同一分钟内只自愈一次 */
    var last = 0;
    try { last = Number(sessionStorage.getItem('cdd.selfheal') || 0); } catch (e) {}
    if (last && Date.now() - last < 60000) return;

    /* 把 ISO(UTC) 和「YYYY-MM-DD HH:MM」统一成【北京时间的可比较字符串】。
       不带时区的当成北京时间（saved-tickets.js / data-built 都是这种），
       输出精确到分钟，和 data-built 的精度一致。 */
    function toBeijingKey(s) {
      if (!s) return '';
      var str = String(s).trim();
      var d;
      if (/T/.test(str) || /Z$/.test(str)) {
        d = new Date(str);                                  /* ISO(UTC) */
      } else {
        d = new Date(str.replace(' ', 'T') + '+08:00');      /* 北京时间 */
      }
      if (isNaN(d.getTime())) return '';
      var bj = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
      var p = function (n) { return String(n).padStart(2, '0'); };
      return bj.getFullYear() + '-' + p(bj.getMonth() + 1) + '-' + p(bj.getDate()) +
             ' ' + p(bj.getHours()) + ':' + p(bj.getMinutes());
    }
    window.__toBeijingKey = toBeijingKey;   /* 方便自测 / 排查 */

    function selfHealReload() {
      try {
        var previous = Number(sessionStorage.getItem('cdd.selfheal') || 0);
        if (previous && Date.now() - previous < 60000) return;
        sessionStorage.setItem('cdd.selfheal', String(Date.now()));
      } catch (e) { /* restricted storage must not disable updates */ }
      var next = new URL(location.href);
      next.searchParams.set('t', String(Date.now()));
      location.replace(next.href);
    }

    function decide(j) {
      if (!j) return;
      var remoteKey = toBeijingKey(j.publishedAt) || toBeijingKey(j.updated);
      var mineKey = toBeijingKey(shown);
      if (!remoteKey || !mineKey) return;
      if (remoteKey <= mineKey) return;          /* 页面不比云端旧，什么都不做 */

      /* tickets only updates numbers. Verify the actual HTML build before
         refreshing articles/images, since tickets may be published independently. */
      if (window.__roPageCheckPending) return;
      window.__roPageCheckPending = true;
      var pageURL = new URL(location.href);
      pageURL.searchParams.set('t', String(Date.now()));
      fetch(pageURL.href, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.text() : ''; })
        .then(function (html) {
          var match = /<body\\b[^>]*\\bdata-built=["']([^"']+)["']/i.exec(html);
          if (match && toBeijingKey(match[1]) > mineKey) selfHealReload();
        })
        .catch(function () { /* keep the existing page on network failure */ })
        .then(function () { window.__roPageCheckPending = false; });
    }
    window.__roSelfHealDecide = decide;   /* 方便自测 / 排查 */

    /* 【离线单文件 · 不拉】file:// 下 tickets.json 必然 404（它只发布在网站根目录）
       → 这一条自愈用的请求也跳过，控制台干干净净。
       注意：这段只管「要不要整页刷新」，不拉就没有远程时间可比 → 不刷新（离线本来就该保持原样）。 */
    if (String(location.protocol || '') !== 'file:') {
      fetch('tickets.json?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          /* 等页尾的准实时逻辑先跑完，再决定要不要刷新整页（免得跟它抢） */
          var p = (typeof window.__roLivePromise !== 'undefined') ? window.__roLivePromise : null;
          var later = function () { setTimeout(function () { decide(j); }, 0); };
          if (p && typeof p.then === 'function') p.then(later, later);
          else later();
        })
        .catch(function () { /* 网络问题就忽略，别影响浏览 */ });
    }
  } catch (e) { /* 忽略 */ }
})();
${RO_RENDER_SCRIPT}
/* ============================================================
   推荐图等比缩放
   ------------------------------------------------------------
   图片按 760px 设计宽度渲染，内部布局【完全不改】，
   手机上用 transform: scale() 整体缩小 ——
   这样和 App 里看到的一模一样，不会变形。

   【顺序】必须在实时渲染【之后】跑：
   实时渲染把图位内容整体换掉了，尺寸得重新量一遍。
   ============================================================ */
(function () {
  var BASE = 760;   /* 图片设计宽度，跟 .r-image 的宽度一致 */

  function fit() {
    var wraps = document.querySelectorAll('.ro-imagewrap');
    for (var i = 0; i < wraps.length; i++) {
      var w = wraps[i];
      /* 【全屏查看层】是它自己的缩放算法（等比铺满屏幕），
         不能被这里的「按容器宽度等比缩小」覆盖掉 */
      if (w.getAttribute && w.getAttribute('data-ro-mob') === '1') continue;
      var img = w.querySelector('.r-image');
      if (!img) continue;

      var avail = w.clientWidth;
      if (!avail) continue;

      var scale = avail / BASE;
      if (scale >= 1) {
        /* 屏幕够宽，原样显示 */
        img.style.transform = 'none';
        w.style.height = 'auto';
      } else {
        /* 等比缩小，内部布局一点不动 */
        img.style.transformOrigin = 'top left';
        img.style.transform = 'scale(' + scale + ')';
        /* 容器高度要跟着缩，否则下面会留一大块空白 */
        w.style.height = Math.round(img.offsetHeight * scale) + 'px';
      }
    }
  }

  window.__roFit = fit;

  /* 【顺序】上面的实时渲染是同步跑完的，这里直接适配一次；
     后面几处只是保险，字体异步加载完再重算。 */
  fit();
  /* 图片里的字体可能异步加载，多算几次更稳 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fit);
  }
  window.addEventListener('load', fit);
  window.addEventListener('resize', function () { setTimeout(fit, 60); });
  setTimeout(fit, 120);
  setTimeout(fit, 600);
  setTimeout(fit, 1500);
})();

/* ============================================================
   【口口】把要「两张图左右放」的图位两两包进一个并排容器
   ------------------------------------------------------------
   用户原话（最终版，最清楚的一次）：
     「我要的模板是两张图左右放，两张图一个版面比如：口口 这样的
      我要的是双色球的两个资料这样布局，大乐透也是
      排三和排五 七星彩和七乐彩这样的布局 快乐8和3D是这样布局」

   ⚠️ 配对单位是【图位 .ro-imagewrap】，不是【彩种区块 .ro-game】——
      因为前两组是「同一个彩种的两张图」（双色球的 main + wuxing），
      按彩种找区块根本区分不出来。

   配对表（左 / 右）：
     ① ssq/main   + ssq/wuxing    同一彩种两张图
     ② dlt/main   + dlt/wuxing    同一彩种两张图
     ③ pl3/main   + pl5/main
     ④ qxc/main   + qlc/main
     ⑤ fc3d/main  + kl8/main      （用户先说过「3D左边」，所以 3D 在左）

   彩种标题怎么处理：
     ③④⑤ 是「两个彩种」，容器放在【前一个彩种的区块内部】，
     两个 <section> 各自带着自己的 <h2> 一起进去 ⇒ 左右各有一个标题，一眼分得清。
     ①② 是「同一个彩种的两张图」，只把两个【图位】并排，
     <section> 和它的 <h2>「双色球」留在外面 ⇒ 标题只出现一次，不会重复。

   只做两件事：
     ① 建一个 .ro-imagepair 容器，把两张图的图位放进去（幂等）
     ② 重算 fit()：容器宽度变了，等比缩放的倍数得跟着重算
   ============================================================ */
(function () { /* __PAIR_V2__ 口口并排（验收脚本按这个标记提取这一段） */
  var PAIRS = [
    { left: 'ssq/main',   right: 'ssq/wuxing' },   /* ① 双色球：两张资料左右放 */
    { left: 'dlt/main',   right: 'dlt/wuxing' },   /* ② 大乐透：同上 */
    { left: 'pl3/main',   right: 'pl5/main'    },   /* ③ 排三 | 排五 */
    { left: 'qlc/main',   right: 'qxc/main'    },   /* ④ 七乐彩 | 七星彩（按用户布局图：七乐彩在左）*/
    { left: 'fc3d/main',  right: 'kl8/main'    }    /* ⑤ 3D（左） | 快乐8 */
  ];

  /* 按 (彩种, 图) 找那一个图位 —— 不用属性选择器拼字符串，
     直接比 dataset，属性顺序变了也不会失效。 */
  function wrapOf(gameId, imageKey) {
    var all = document.querySelectorAll('.ro-imagewrap');
    for (var i = 0; i < all.length; i++) {
      var w = all[i];
      if (w.getAttribute('data-game') === gameId &&
          w.getAttribute('data-image') === imageKey) return w;
    }
    return null;
  }
  /* 往上找最近的彩种区块（③④⑤ 要把整个 <section> 一起搬进去） */
  function sectionOf(node) {
    var n = node;
    while (n && n !== document.body) {
      if (n.className && String(n.className).split(/\s+/).indexOf('ro-game') >= 0) return n;
      n = n.parentNode;
    }
    return null;
  }
  /* 这个图位是不是【已经在】某个并排容器里了？
     ⚠️ 必须一路往上找，不能只看 parentNode：
        ① ② 并排后图位的父节点就是 .ro-imagepair，
        但 ③④⑤ 搬的是整个 <section>，图位的父节点仍是 .ro-game ——
        只查 parentNode 会让 ③④⑤ 每跑一次就再套一层容器（实测会从 5 变 8）。 */
  function alreadyPaired(node) {
    var n = node ? node.parentNode : null;
    while (n && n !== document.body) {
      if (n.className && String(n.className).split(/\s+/).indexOf('ro-imagepair') >= 0) return true;
      n = n.parentNode;
    }
    return false;
  }

  for (var p = 0; p < PAIRS.length; p++) {
    var li = PAIRS[p].left.split('/');
    var ri = PAIRS[p].right.split('/');
    var Lw = wrapOf(li[0], li[1]);
    var Rw = wrapOf(ri[0], ri[1]);
    /* 两个图位都得在，而且各自都还没被并排过（幂等；同一彩种只并排一次） */
    if (!Lw || !Rw || Lw === Rw) continue;
    if (alreadyPaired(Lw) || alreadyPaired(Rw)) continue;

    /* 容器插在【左边那张】原来的位置 */
    var box = document.createElement('div');
    box.className = 'ro-imagepair';
    box.setAttribute('data-pair', PAIRS[p].left + '+' + PAIRS[p].right);

    /* 同一个彩种（① ②）：只搬两个图位，<section> 和它的 <h2> 留在外面 */
    if (li[0] === ri[0]) {
      Lw.parentNode.insertBefore(box, Lw);
      box.appendChild(Lw);
      box.appendChild(Rw);
      continue;
    }

    /* 两个彩种（③ ④ ⑤）：把两整块 <section> 一起搬进来 —— 左右各自保留标题 */
    var Ls = sectionOf(Lw);
    var Rs = sectionOf(Rw);
    if (!Ls || !Rs || Ls === Rs) { box = null; continue; }
    Ls.parentNode.insertBefore(box, Ls);
    box.appendChild(Ls);
    box.appendChild(Rs);
  }

  /* 容器宽度变了 ⇒ 等比缩放倍数必须重算（__roFit 是上面那个 IIFE 暴露的 fit）。 */
  if (typeof window.__roFit === 'function') {
    window.__roFit();
    setTimeout(window.__roFit, 80);
    setTimeout(window.__roFit, 400);
  }
})();

/* ============================================================
   【手机目录 → 全屏查看层】ro-mob-view
   ------------------------------------------------------------
   用户原话：「对点一个图看那一张图 这张图是全屏清晰的」

   ⚠️ 这不是被删掉的那个「图片放大器」：
      · 那个是点图片弹遮罩的旧功能，入口是【点图片本身】，
        已经被用户要求整块删除（遮罩类名 / 光标放大类名 / 放大镜图标
        至今都是 0 处）
      · 这一层叫 ro-mob-view，入口【只有手机目录表格的格子】，
        图片本身【没有绑任何点击】—— 点图不会打开任何东西
      · 没有任何放大镜图标

   「全屏清晰」怎么做到的：
      1. 层铺满整个视口（position:fixed; inset:0），左右不留白
      2. 图仍然按 760px 设计宽度渲染，靠 transform: scale() 等比缩放
         —— 纵向和横向用【同一个】scale，所以绝不变形
      3. 初始按「整张图铺满屏宽」铺满（宽度方向占满 100vw）
      4. 点一下图 = 再放大一级（铺满屏宽 → 原始尺寸 1:1，循环）
      5. 层内可上下/左右滚动、可双指缩放（touch-action: pinch-zoom）

   关闭方式（4 种都支持）：
      · 右上角 ×
      · 点图的空白处（图片外面）
      · 手机返回键 / 浏览器后退（history.pushState + popstate）
      · Esc 键（电脑上）
   ============================================================ */
(function () {
  var view = null, holder = null, img = null, tip = null, scroller = null, count = null;
  var cur = null, zoom = 'fit', scale = 1, backTo = null;

  function build() {
    if (view) return view;
    view = document.createElement('div');
    view.className = 'ro-mob-view';
    view.setAttribute('hidden', '');
    view.innerHTML =
      '<div class="ro-mob-scroll"><div class="ro-mob-holder"></div></div>' +
      '<div class="ro-mob-x" role="button" aria-label="关闭">\u00d7</div>' +
      /* 【计数器】左上角「第 N / M 张」（用户给的设计：counter 左上、close 右上）。
         非相册时不显示。 */
      '<div class="ro-mob-count" hidden></div>' +
      '<div class="ro-mob-tip">点图再放大一级 \u00b7 双指可缩放 \u00b7 点空白 / \u00d7 / 返回键关闭</div>';
    document.body.appendChild(view);

    scroller = view.querySelector('.ro-mob-scroll');
    holder = view.querySelector('.ro-mob-holder');
    tip = view.querySelector('.ro-mob-tip');
    count = view.querySelector('.ro-mob-count');

    /* 关闭：右上角 × */
    view.querySelector('.ro-mob-x').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation(); close();
    });
    /* 关闭：点图片外的空白（点在图上 = 放大一级） */
    scroller.addEventListener('click', function (e) {
      var n = e.target;
      while (n && n !== scroller) {
        if (n === holder || n === img) { bumpZoom(); return; }
        n = n.parentNode;
      }
      close();
    });
    /* 关闭：Esc（电脑）；返回键由 popstate 处理 */
    document.addEventListener('keydown', function (e) {
      if (view && !view.hasAttribute('hidden') && (e.key === 'Escape' || e.keyCode === 27)) close();
    });
    return view;
  }

  /* ------------------------------------------------------------
     【全屏层里真正能放图的区域】
     .ro-mob-scroll 是铺满视口的滚动区，它上下各有内边距（54px / 66px，见上面的
     CSS），宽度方向没有内边距。fit 必须按【扣掉内边距之后】的区域算，
     不然「整张放得下」算出来还是会被上下的 × 和提示条压住。
     再留 4px 安全边，避免圆角 / 滚动条把最外一圈切掉。
     ------------------------------------------------------------ */
  var PAD_TOP = 54, PAD_BOTTOM = 66, SAFE = 4;

  function viewBox() {
    var vw = (scroller && scroller.clientWidth) || window.innerWidth || 390;
    var vh = (scroller && scroller.clientHeight) || window.innerHeight || 700;
    return {
      w: Math.max(80, vw - SAFE),
      h: Math.max(80, vh - PAD_TOP - PAD_BOTTOM - SAFE),
      vw: vw
    };
  }

  /* 量图的【实际渲染尺寸】：
     .r-image 自己带 overflow:hidden（styles.css），它画出来的范围就是它自己的盒子，
     所以 offsetWidth / offsetHeight 就是「整张图」的尺寸（760 × 内容高）。
     transform 不改布局尺寸 ⇒ 缩放后再量还是这两个数，可以反复调用。 */
  function measure() {
    var w = (img && img.offsetWidth) || 760;
    var h = (img && img.offsetHeight) || 100;
    return { w: w, h: h };
  }

  /**
   * 按缩放模式和实测尺寸算 scale。
   * 【关键】只算一个 scale，宽高同时乘它 —— 纵横比恒定，绝不变形。
   * fit：取【宽、高两个方向各自需要的缩放里较小的那个】⇒
   *      整张图宽、高都放得下（图比屏幕窄就居中留白），这就是用户要的
   *      「点开就能看全整张图」。
   */
  function calcScale() {
    if (!img) return 1;
    var box = viewBox();
    var nat = measure();
    var fit = Math.min(box.w / nat.w, box.h / nat.h);
    if (zoom === 'width') return box.w / nat.w;   /* 铺满屏宽（历史档位，正常用不到） */
    if (zoom === 'real') return 1;                /* 原始尺寸 1:1（最清晰，允许超出视口） */
    return fit;
  }

  function applyScale() {
    if (!img || !holder) return;
    var nat = measure();
    var box = viewBox();
    scale = calcScale();
    var w = Math.round(nat.w * scale);
    var h = Math.round(nat.h * scale);
    holder.style.setProperty('--ro-s', String(scale));
    holder.style.width = w + 'px';
    holder.style.height = h + 'px';
    /* 装得下（fit）→ 左右居中，两边留白对称；
       装不下（real 1:1 放大）→ 靠左，右边靠滚动看。 */
    if (w <= box.vw) {
      holder.style.marginLeft = 'auto';
      holder.style.marginRight = 'auto';
    } else {
      holder.style.marginLeft = '0';
      holder.style.marginRight = '0';
    }
    if (scroller) scroller.scrollLeft = Math.max(0, Math.round((w - box.vw) / 2));
    if (tip) {
      var pct = Math.round(scale * 100);
      tip.textContent = (zoom === 'fit' ? '整张完整显示' : (zoom === 'width' ? '铺满屏宽' : '原始尺寸 1:1')) +
        ' \u00b7 ' + pct + '% \u00b7 点图放大 \u00b7 \u00d7 / 返回键关闭';
    }
  }

  function bumpZoom() {
    /* 【用户要求】改成两档切换：点一下放大（1:1 原始尺寸，最清晰），再点一下回到最开始。
       用户原话：「点一下就放大铺满.在点一下就回到最开始的」。
       原来是三档 fit→width→real→fit，现在只留 fit ↔ real。 */
    zoom = (zoom === 'fit') ? 'real' : 'fit';
    if (scroller) scroller.scrollTop = 0;
    applyScale();
  }

  /**
   * 给 body 加/去一个标记类（幂等：重复加不会堆出两个）
   * @param {string} cls 类名
   * @param {boolean} on 加还是去
   */
  function mark(cls, on) {
    if (!document.body) return;
    var list = String(document.body.className || '').split(/\s+/).filter(function (x) {
      return x && x !== cls;
    });
    if (on) list.push(cls);
    document.body.className = list.join(' ');
  }

  /**
   * 打开某一格对应的那张图（按 彩种 + 图名 找图位）
   * @returns {boolean} 找到并打开了
   */
  function open(gameId, imageKey) {
    if (!gameId || !imageKey) return false;
    build();

    var all = document.querySelectorAll('.ro-imagewrap[data-ro-mob]');
    var src = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].getAttribute('data-game') === gameId &&
          all[i].getAttribute('data-image') === imageKey) { src = all[i]; break; }
    }
    if (!src) return false;

    /* 直接用页面里那一张图（不是克隆一份）：
       本层的缩放靠 CSS 上的 --ro-s（.ro-mob-view .ro-mob-holder .r-image），
       不写内联 transform；这里先把页面那份内联 transform 清掉，
       图不会重复缩放、也不会变形。
       直接搬还有一个好处：实时渲染脚本（如果在这之后跑）替换图位内容时，
       全屏层里显示的就是同一张最新图，不会显示一份旧克隆。 */
    var node = src.querySelector('.r-image');
    if (!node) return false;

    while (holder.firstChild) holder.removeChild(holder.firstChild);
    node.style.transform = 'none';       /* 丢掉页面里那份内联缩放，由本层统一算 */
    node.style.transformOrigin = 'top left';
    backTo = src;                        /* 关掉时按原路搬回去 */

    var box = document.createElement('div');
    box.className = 'ro-imagewrap';
    box.setAttribute('data-ro-mob', '1');
    box.appendChild(node);               /* 把原图搬进来 */
    holder.appendChild(box);

    img = node;
    cur = { game: gameId, image: imageKey };
    zoom = 'fit';
    /* 【保存权限】推荐图 / 资料：这一层不允许保存（右键 / 长按 / 拖拽都拦） */
    view.setAttribute('data-allow', '0');

    view.removeAttribute('hidden');
    mark('ro-mob-open', true);
    /* 返回键 / 后退能关：压一条历史记录，popstate 时关掉 */
    try { history.pushState({ roMob: cur }, ''); } catch (e) { /* 忽略 */ }

    /* 等一帧再量尺寸：刚插入的节点需要先完成布局。
       多量几次：字体/图标/换行都可能让内容高度晚一点才稳定，
       量晚了只会重算一次 scale（无害），量早了才会算出偏小的高、
       导致 fit 的容器高度不够（图放得下但滚不到底）。 */
    applyScale();
    setTimeout(applyScale, 0);
    setTimeout(applyScale, 60);
    setTimeout(applyScale, 300);
    setTimeout(applyScale, 900);
    return true;
  }

  function close() {
    if (!view || view.hasAttribute('hidden')) return false;   /* 幂等：不会关两次 */
    view.setAttribute('hidden', '');
    /* 【重要】把那张图搬回它原来的图位里 —— 下次再点时位置/顺序都不乱。
       图位本身被并排脚本搬过，所以记的是「打开时它所在的父节点」。 */
    if (holder && img && backTo) {
      while (holder.firstChild) holder.removeChild(holder.firstChild);
      backTo.appendChild(img);
      img.style.transform = '';
      img.style.transformOrigin = '';
    } else if (holder) {
      while (holder.firstChild) holder.removeChild(holder.firstChild);
    }
    img = null; cur = null; backTo = null;
    mark('ro-mob-open', false);
    return true;
  }

  /* ------------------------------------------------------------
     打开一张【外链图片】（晒票栏的图走这条路）
     ------------------------------------------------------------
     用户要求：「点图片 → 放大看（能看清号码）」，而且说了
     「复用已有的 ro-mob-view 那套全屏层最好」。
     所以这里不新做第二套全屏逻辑，只给这一层加一个入口：
       · 跟 open() 的区别：晒票栏没有页面里现成的「图位」，
         所以这里【自己造】一个装图的盒子，里面放一个真的图元素，
         并给它挂上 r-image 这个类名 ——
         这样它自动吃到上面那条
         「全屏层容器 → 中转盒 → r-image」的等比缩放规则，
         宽高永远同一个 scale，不会变形。
       · 关闭方式跟原来完全一样（都还挂在同一个层上）：
         右上角 ×、点图片外的空白、Esc、手机返回键。
     @param {string} src 图片地址
     @param {string} alt 无障碍文字（一般传彩种名）
     @returns {boolean} true = 已打开 */
  function openUrl(src, alt, allowSave) {
    if (!src) return false;
    build();
    while (holder.firstChild) holder.removeChild(holder.firstChild);
    backTo = null;            /* 这张图不属于任何图位，关掉时不用搬回去 */
    /* 【保存权限】这一层是不是「允许保存」的来源（晒票 / GPT模型摇号出的图）？
       设成 1 之后，页尾防截图脚本就会对这里放行（右键 / 长按 + -webkit-touch-callout）
       都放行；推荐图（open() 走的那条）设成 0 → 一律拦掉。 */
    if (allowSave) view.setAttribute('data-allow', '1');
    else view.setAttribute('data-allow', '0');

    var box = document.createElement('div');
    box.className = 'ro-imagewrap';
    box.setAttribute('data-ro-mob', '1');

    var im = document.createElement('img');
    im.className = 'r-image';
    im.setAttribute('referrerpolicy', 'no-referrer');
    im.setAttribute('loading', 'eager');
    im.setAttribute('decoding', 'async');
    im.setAttribute('alt', alt || '');
    /* 【必须重算】外链图是过一会儿才加载完的：
       没加载完时它的高度是 0，fit 会按「高度 0」算出不对的容器高度。
       图片 load / error 之后各再量一次，缩放就准了。 */
    im.addEventListener('load', function () { applyScale(); if (box.__roErr) { box.__roErr.parentNode && box.__roErr.parentNode.removeChild(box.__roErr); box.__roErr = null; } });
    /* 【加载失败兜底】别显示破图：给一句提示，缩放仍然算一次
       （用户给的参考实现直接设 src，没有兜底 → 网络不好时是一片空白）。 */
    im.addEventListener('error', function () {
      applyScale();
      if (!box.__roErr) {
        box.__roErr = document.createElement('div');
        box.__roErr.className = 'ro-mob-err';
        box.__roErr.textContent = '这张图加载失败，换个网络再试 · 上下滑动看别的';
        holder.appendChild(box.__roErr);
      }
    });
    im.src = src;
    box.appendChild(im);
    holder.appendChild(box);

    img = im;
    cur = { game: '', image: '', url: src };
    zoom = 'fit';             /* ⚠️ 切图后【必须重置成 fit】（用户明确要求） */

    view.removeAttribute('hidden');
    mark('ro-mob-open', true);
    /* 返回键 / 后退能关：压一条历史记录，popstate 时关掉（跟 open() 一样）。
       ⚠️ 浏览相册时【不要每切一张就压一条历史】——
          那样按一次返回键只退回上一张，要按 200 次才能关掉。
          所以切图走 flipTo()，它不压历史。 */
    if (!CALLER_SETS_HISTORY) { try { history.pushState({ roMob: cur }, ''); } catch (e) { /* 忽略 */ } }

    applyScale();
    setTimeout(applyScale, 0);
    setTimeout(applyScale, 60);
    setTimeout(applyScale, 300);
    setTimeout(applyScale, 900);
    setTimeout(applyScale, 1800);
    return true;
  }

  /* ============================================================
     【相册 · 上下滑动切换上一张/下一张】
     用户要求：
       「点某张图 → 全屏 → 向上滑 → 下一张 / 向下滑 → 上一张；
         第一张向下 / 最后一张向上 → 停在原地；
         切图后缩放重置成 fit；4 种关闭方式不能坏」
     ------------------------------------------------------------
     设计要点（踩过的坑都写在注释里）：
       · 【复用这一层】，不新造第二个全屏层 —— 用户明确要求，
         否则页面里会有两套看图逻辑互相打架。
       · 列表顺序 = 页面上的顺序 = 【按发布时间倒序】（最新在前）。
         由调用方（__XYSP_VIEW__）传入，这里只负责前后移动。
       · 手势判定（和"点一下切缩放"共存）：
           按下→抬起，位移 < 10px 且 < 300ms  → 算【点击】→ 交给原有的
              click 处理去切缩放（这里不动，也不 preventDefault）
           位移 > 50px                        → 算【滑动】→ 切上一张/下一张
           介于两者之间                        → 什么也不做（避免误触）
         只认【纵向】滑动（|dy| > |dx|），横向留给浏览器/系统手势。
       · 只在【全屏层打开时】才 preventDefault 拦滚动 —— 用户明确要求。
       · 切图时【不压历史】：否则按返回键要一张一张退回去，关不掉。
     ============================================================ */
  var gallery = null;         /* { list:[{src,cap}], i:number } */
  var CALLER_SETS_HISTORY = false;   /* 切图期间不压历史（见上） */

  function galleryHint() {
    if (!gallery || !gallery.list || gallery.list.length < 2) return '';
    return '第 ' + (gallery.i + 1) + ' / ' + gallery.list.length + ' 张 · 上下滑动切换';
  }
  function updateTip() {
    /* 【计数器】左上角「第 N / M 张」；非相册时隐藏 */
    if (count) {
      if (gallery && gallery.list && gallery.list.length) {
        count.textContent = (gallery.i + 1) + ' / ' + gallery.list.length;
        count.removeAttribute('hidden');
      } else {
        count.setAttribute('hidden', '');
      }
    }
    if (!tip) return;
    var h = galleryHint();
    /* 相册模式下把提示换成「第 N / M 张 · 上下滑动切换」；
       非相册（目录格子 / 推荐图）保持原来那句。 */
    tip.textContent = h || '点图再放大一级 \u00b7 双指可缩放 \u00b7 点空白 / \u00d7 / 返回键关闭';
  }
  /** 切到相册里的第 i 张（带边界：越界就停在原地） */
  function flipTo(i) {
    if (!gallery || !Array.isArray(gallery.list) || !gallery.list.length) return false;
    var n = gallery.list.length;
    if (i < 0 || i >= n) { updateTip(); return false; }   /* 第一张再向上 / 最后一张再向下 → 停住 */
    gallery.i = i;
    var it = gallery.list[i] || {};
    CALLER_SETS_HISTORY = true;        /* 这次 openUrl 不压历史 */
    try {
      openUrl(it.src, it.cap || '', true);
    } finally {
      CALLER_SETS_HISTORY = false;
    }
    updateTip();
    return true;
  }

  /* ---- 触摸手势：滑动切图 ---- */
  var tStartX = 0, tStartY = 0, tStartT = 0, tActive = false;
  function bindSwipe() {
    if (!scroller || scroller.__roSwipeBound) return;
    scroller.__roSwipeBound = true;

    scroller.addEventListener('touchstart', function (e) {
      if (!gallery || !gallery.list || gallery.list.length < 2) return;
      if (!e.touches || e.touches.length !== 1) return;   /* 多指 = 缩放，不参与 */
      tActive = true;
      tStartX = e.touches[0].clientX;
      tStartY = e.touches[0].clientY;
      tStartT = Date.now();
    }, { passive: true });

    scroller.addEventListener('touchmove', function (e) {
      if (!tActive || !e.touches || e.touches.length !== 1) return;
      var dx = e.touches[0].clientX - tStartX;
      var dy = e.touches[0].clientY - tStartY;
      /* 只认纵向滑动；已经明确是纵向且超过阈值 → 拦掉页面滚动
         ⚠️ 必须 preventDefault，否则页面会跟着滚（用户明确要求）；
            只在打开 + 单指 + 纵向超阈值时才拦。 */
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    scroller.addEventListener('touchend', function (e) {
      if (!tActive) return;
      tActive = false;
      var t = (e.changedTouches && e.changedTouches[0]) || null;
      if (!t) return;
      var dx = t.clientX - tStartX;
      var dy = t.clientY - tStartY;
      var dt = Date.now() - tStartT;
      var dist = Math.sqrt(dx * dx + dy * dy);
      /* 位移 < 10px 且 < 300ms → 算点击，交给原有 click 处理切缩放，这里不管 */
      if (dist < 10 && dt < 300) return;
      /* 位移 > 40px 且是纵向 → 切图 */
      if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) {
        if (dy < 0) flipTo(gallery.i + 1);   /* 向上滑 → 下一张（列表里更新的在下一位） */
        else flipTo(gallery.i - 1);          /* 向下滑 → 上一张 */
      }
    }, { passive: true });

    /* 桌面也能用：鼠标滚轮（可选，用户说"你判断"）。
       只在相册打开 + 单张已经稳定时响应，且做节流，避免一次滚动跳好几张。 */
    var wheelLock = 0;
    scroller.addEventListener('wheel', function (e) {
      if (!gallery || !gallery.list || gallery.list.length < 2) return;
      var now = Date.now();
      if (now - wheelLock < 320) { if (e.cancelable) e.preventDefault(); return; }
      var d = e.deltaY || 0;
      if (Math.abs(d) < 8) return;
      wheelLock = now;
      if (e.cancelable) e.preventDefault();
      if (d > 0) flipTo(gallery.i + 1); else flipTo(gallery.i - 1);
    }, { passive: false });
  }

  /* 打开：只绑在【目录表格的格子】上；图片本身没有任何点击绑定 */
  var tiles = document.querySelectorAll('.ro-toc-cell');
  for (var t = 0; t < tiles.length; t++) {
    tiles[t].addEventListener('click', function (e) {
      e.preventDefault();       /* 不跳锚点了，直接开全屏层 */
      open(this.getAttribute('data-ro-toc-game'), this.getAttribute('data-ro-toc-image'));
    });
  }

  /* 【相册入口】调用方（__XYSP_VIEW__）在点图时把【当前标签下可见的图片列表】
     传进来，这样"上下滑动"就能在可见的那批里前后走 —— 而不是在全部 600 张里走
     （用户点了「双色球」标签，滑动当然应该在双色球里走）。
     list = [{src, cap}, ...]；i = 当前这张在列表里的下标。 */
  function setGallery(list, i, src, cap) {
    build();
    bindSwipe();                       /* 第一次用时才绑手势 */
    gallery = { list: Array.isArray(list) ? list : [], i: Number(i) || 0 };
    CALLER_SETS_HISTORY = true;        /* 首张也不重复压历史：openUrl 之外由调用方压 */
    try {
      openUrl(src, cap, true);
    } finally {
      CALLER_SETS_HISTORY = false;
    }
    updateTip();
    return true;
  }
  function galleryState() {
    if (!gallery) return { on: false, i: -1, n: 0 };
    return { on: true, i: gallery.i, n: gallery.list.length, hint: galleryHint() };
  }
  /** 给验收脚本用：直接调"上一张/下一张"，不用造触摸事件 */
  function galleryStep(dir) {
    if (!gallery) return false;
    return flipTo(gallery.i + (dir > 0 ? 1 : -1));
  }

  window.__roMobView = {
    open: open,
    openUrl: openUrl,
    close: close,
    setGallery: setGallery,
    galleryStep: galleryStep,
    gallery: galleryState,
    isOpen: function () { return !!view && !view.hasAttribute('hidden'); },
    current: function () { return cur; },
    state: function () {
      return {
        open: !!view && !view.hasAttribute('hidden'),
        game: cur ? cur.game : null,
        image: cur ? cur.image : null,
        zoom: zoom,
        /* scale 是【一个】数：宽高都用它 ⇒ 缩放倍数 x === y（不变形）。
           x/y 分开报出来，是为了让验收脚本能直接比对。 */
        scaleX: scale,
        scaleY: scale,
        holderW: holder ? holder.style.width : '',
        holderH: holder ? holder.style.height : '',
        natW: img ? img.offsetWidth : 0,
        natH: img ? img.offsetHeight : 0,
        vw: window.innerWidth || 0,
        vh: window.innerHeight || 0,
        layers: document.querySelectorAll('.ro-mob-view').length
      };
    },
    bump: bumpZoom
  };

  /* 返回键 / 浏览器后退：关的是这一层，不是离开页面。
     有这一步，手机上按返回键 = 关掉全屏图。 */
  window.addEventListener('popstate', function () {
    if (window.__roMobView.isOpen()) {
      close();
      /* 再压一条空记录，保证「看完还能继续按返回键」不卡住 */
      try { history.pushState({ roMobClosed: 1 }, ''); } catch (e) { /* 忽略 */ }
    }
  });

  /* 旋转屏幕 / 改窗口大小 ⇒ 重新等比适配 */
  window.addEventListener('resize', function () {
    if (window.__roMobView.isOpen()) setTimeout(applyScale, 60);
  });

  /* 【收尾】页尾脚本都跑完了：去掉 body 上的 ro-toc-pending 标记，
     手机目录表格这时候才真正显示出来（在此之前它一直是隐藏的，
     避免 JS 没跑完时出现「点了没反应」的死格子）。 */
  mark('ro-toc-pending', false);
})();
</script>

<!-- __XYSP_VIEW__ 晒票栏：① 彩种筛选（纯前端、不刷新页面）② 点图放大看
     位置：排在页尾那个全屏层（ro-mob-view）之后 ——
     这样执行到这里时那一层已经建好，点图能直接复用它的放大 + 关闭逻辑。
     用户要求：「用 a（不是 button）」「点图片 → 放大看（能看清号码）」
               「复用已有的 ro-mob-view 那套全屏层最好」 -->
<script>
/* __XYSP_VIEW__ 晒票栏交互（脚本挂了也不影响别的区块：
   折叠靠原生 details；这里只负责「筛」和「放大」两件事）。 */
(function () {
  try {
    var root = document.getElementById('ro-xysp');
    if (!root) return;

    var tabs = root.querySelectorAll('.ro-xysp-tab');
    var pics = root.querySelectorAll('.ro-xysp-pic');
    var empty = root.querySelector('.ro-xysp-empty');
    function pruneExpiredTickets() {
      root.querySelectorAll('[data-ro-xysp-expire]').forEach(function(el){
        if(Number(el.getAttribute('data-ro-xysp-expire'))<=Date.now())el.remove();
      });
      pics=root.querySelectorAll('.ro-xysp-pic');
      var active=root.querySelector('.ro-xysp-tab.on');
      pick(active ? active.getAttribute('data-ro-xysp-game') : 'all');
    }
    setInterval(pruneExpiredTickets,30000);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)pruneExpiredTickets();});

    /* 只显示某一分类的卡片（game = 'all' 时全显示）。
       分类 = 8 个彩种 key + 'tt'（头条晒票）。
       ⚠️ 【包含判断，不是相等判断】：
          卡片上是 data-ro-xysp-games（复数）="fc3d pl3 dlt" —— 一条头条帖子
          经常同时提几个彩种，用户要求「分发到各个对应的彩种地方」，
          所以点「排列3」时这条也要出现。
          一起彩的条目属性里只有它自己一个 key，包含判断的实际效果
          和以前的相等判断完全一样（老行为没变）。
       做法是给不匹配的卡片加 hidden 属性，
       样式里有 .ro-xysp-pic[hidden] 把它真的藏起来。 */
    function pick(game) {
      var shown = 0;
      for (var i = 0; i < pics.length; i++) {
        /* ⚠️ 这里不能用 /\s+/ —— 这段脚本是写在【模板字符串】里的，
           一个反斜杠会被模板字符串吃掉，页面里会变成 /s+/（拿 "s" 当分隔符），
           筛选就全错（实测踩过：点「双色球」可见 0 张）。
           所以改成不含反斜杠的写法：按空格切；连续空格只会产生空串，
           空串跟任何 key 都不相等，不影响筛选结果。 */
        var keys = String(pics[i].getAttribute('data-ro-xysp-games') || '').split(' ');
        var ok = false;
        if (game === 'all') ok = true;
        else { for (var k = 0; k < keys.length; k++) { if (keys[k] === game) { ok = true; break; } } }
        pics[i].hidden = !ok;
        if (ok) shown++;
      }
      /* 选中的那一颗标签高亮 */
      for (var t = 0; t < tabs.length; t++) {
        var on = tabs[t].getAttribute('data-ro-xysp-game') === game;
        tabs[t].className = on ? 'ro-xysp-tab on' : 'ro-xysp-tab';
      }
      if (empty) empty.hidden = shown > 0;
      return shown;
    }

    for (var t2 = 0; t2 < tabs.length; t2++) {
      tabs[t2].addEventListener('click', function (e) {
        e.preventDefault();                 /* 不跳锚点，就地在下面过滤 */
        pick(String(this.getAttribute('data-ro-xysp-game') || 'all'));
      });
    }

    /* 点某张图 → 用页尾那层全屏放大看，并把【当前筛选结果】作为相册列表传进去，
       这样上下滑动只在"当前这个标签下看得见的那批"里前后走
       （用户点了「双色球」再看图，滑动当然应该在双色球里走，而不是在全部 600 张里走）。
       那一层没准备好时（脚本没跑到）不拦截点击：
       让 href 自己打开原图，功能不丢。 */
    function visibleList() {
      var list = [];
      for (var i = 0; i < pics.length; i++) {
        if (pics[i].hidden) continue;
        var b = pics[i].querySelector('.ro-xysp-cap b');
        list.push({ src: pics[i].getAttribute('href'), el: pics[i], cap: b ? String(b.textContent || '') : '' });
      }
      return list;
    }
    for (var p = 0; p < pics.length; p++) {
      pics[p].addEventListener('click', function (e) {
        var api = window.__roMobView;
        /* 原图地址就是 href（缩略图只在 src 里，放大要看清号码，用原图） */
        var src = this.getAttribute('href');
        var cap = this.querySelector('.ro-xysp-cap b');
        var capText = cap ? String(cap.textContent || '') : '';
        if (api && typeof api.setGallery === 'function') {
          var list = visibleList();
          var idx = 0;
          for (var q = 0; q < list.length; q++) { if (list[q].el === this) { idx = q; break; } }
          if (list.length > 1 && api.setGallery(list, idx, src, capText)) { e.preventDefault(); return; }
        }
        /* 兜底：列表只有一张 / 老版全屏层 → 走原来的单图打开 */
        if (api && typeof api.openUrl === 'function' && api.openUrl(src, capText, true)) {
          e.preventDefault();
        }
      });
    }

    /* 给验收脚本留一个干净入口（不影响页面行为） */
    window.__roXysp = { pick: pick, tabs: tabs.length, pics: pics.length, visible: visibleList };
  } catch (e) { /* 忽略：这一块的显示不依赖这段脚本 */ }
})();
</script>

<!-- __NEXT_CD__ 下一期更新倒计时
     用户 2026-10-17：「这个倒计时就要根据最后一个彩种更新完来决定倒计时」+「不是推荐出号就更新吗」
     规则（不再写死 02:15）：
       ① 从页面上「开机号」区块里读每个彩种的【下一期开奖时间】（文本形如
          「开奖时间 2026年10月18日 星期日 21:15」，数据来自 kjh-data.js）
       ② 每个开奖时间 + BUILD_DELAY（20 分钟，云端构建到发布的实际耗时）
       ③ 取【最早的一个未来时刻】作为倒计时目标 —— 也就是"下一个彩种更新完"的时刻
       ④ 今天所有彩种都更完之后 → 退回明天 02:15（每日全量班）
     纯前端计算，不请求接口、不调 AI → 免费。
     ⚠️ 一个彩种的时间都解析不出来 → 也退回 02:15，绝不显示假时间。 -->
<script>
(function () {
  var els = [document.getElementById('__NEXT_CD__'), document.getElementById('__NEXT_CD2__')].filter(Boolean);
  if (!els.length) return;
  var BUILD_DELAY_MS = 20 * 60 * 1000;   /* 开奖后到页面发布的大致耗时 */
  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* 从开机号区块读出所有「开奖时间 YYYY年M月D日 星期X HH:MM」 */
  function drawTimes() {
    var out = [];
    var nodes = document.querySelectorAll('.ro-kjh-time');
    for (var i = 0; i < nodes.length; i++) {
      var m = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日[\s\S]*?(\d{1,2}):(\d{2})/.exec(nodes[i].textContent || '');
      if (!m) continue;
      var t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
      if (!isNaN(t.getTime())) out.push(t.getTime() + BUILD_DELAY_MS);
    }
    return out;
  }

  function dailyFull() {
    var d = new Date();
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 2, 15, 0, 0);
    if (t.getTime() <= d.getTime()) t = new Date(t.getTime() + 86400000);
    return t.getTime();
  }

  function target() {
    var now = Date.now();
    var list = drawTimes().filter(function (x) { return x > now; });
    if (!list.length) return dailyFull();          /* 今天都更完了 → 明天 02:15 */
    list.sort(function (a, b) { return a - b; });
    var next = list[0];
    var full = dailyFull();
    return next < full ? next : full;              /* 别越过每日全量那个点 */
  }

  function draw() {
    var ms = target() - Date.now();
    if (ms <= 0) { for (var q = 0; q < els.length; q++) els[q].textContent = '正在更新…'; return; }
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    for (var q2 = 0; q2 < els.length; q2++) els[q2].textContent = '下一期更新倒计时 ' + h + ':' + pad(m) + ':' + pad(s % 60);
  }
  draw();
  setInterval(draw, 1000);
})();
</script>

<!-- __ART_CD_JS__ 文章参考·更新倒计时（每 1 小时一次，目标 = 下一个 :16:00 北京时间）
     纯前端计算，不联网、不调 AI → 免费。 -->
<script>
(function () {
  var el = document.getElementById('__ART_CD__');
  if (!el) return;
  function now8() { var t = new Date(); return new Date(t.getTime() + (t.getTimezoneOffset() * 60000) + (8 * 3600000)); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function left() {
    /* 【改成 30 分钟】用户要求：文章抓取改回每 30 分钟一次，
       任务在每小时 :16 / :46 跑 → 倒计时目标 = 下一个 :16 或 :46。 */
    var n = now8();
    var t = new Date(n.getTime());
    t.setMinutes(16, 0, 0);
    if (t.getTime() <= n.getTime()) t.setMinutes(46, 0, 0);
    if (t.getTime() <= n.getTime()) t = new Date(t.getTime() + 3600000 - 1800000);
    return t.getTime() - n.getTime();
  }
  function draw() {
    var ms = left();
    if (ms <= 0) { el.textContent = '正在更新…'; return; }
    var s = Math.floor(ms / 1000);
    el.textContent = '更新倒计时 ' + pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }
  draw();
  setInterval(draw, 1000);
})();
</script>

<!-- __EXP_ROW_JS__ 专家推荐·点专家就地展开逐期明细
     用户要求：点「专家推荐」里的某一位专家 → 原地展开他的近 10 期逐期明细，再点收起。
     ⚠️ 【没有第二套渲染逻辑】：
        · key 规则和专家池模块:377 完全一致（gameId + '-' + idx），
          详情 DOM 的 id 就是 ex-detail-<key>（和那边一字不差）；
        · 明细内容用的是【同一个函数】expertDetailHtml()（专家池模块:285），
          该文件已内联在本页（见上面 INLINE_JS 列表），函数挂在页面全局作用域上。
        · 开合语义也照抄 expert-pool.js:404 那套：hidden 属性 + aria-expanded
          + .on 类（不用 display，display 不能过渡）。
     ⚠️ 为什么本页要自己挂一个委托监听：expert-pool.js 里的委托监听是
        【挂在它自己创建的那个面板容器上】的（t.addEventListener，
        仅在 renderExpertPanel(container, gameId) 被调用时才会挂）——
        分享页是预渲染好的静态 HTML、从来不调 renderExpertPanel，
        所以那个监听在本页不存在。这里用【同一个 toggle 语义 + 同一个函数】
        在 document 上挂一次委托，服务本页的 .ro-xj-row[data-ex-key]。
     ⚠️ 不能用裸 <button>（页面不变量：button 标签 = 0），
        行本身是 <a role="button" tabindex="0">（见 buildExpertsHtml）。
     ⚠️ 必须放在本模板的 </body> 之前（模板字符串内部）。 -->
<script>
(function () {
  try {
    if (!document.querySelector('a.ro-xj-row[data-ex-key]')) return;

    var keyOf = function (node) {
      return (node && node.closest) ? node.closest('[data-ex-key]') : null;
    };

    var toggle = function (row) {
      if (!row) return;
      var detail = document.getElementById('ex-detail-' + (row.getAttribute('data-ex-key') || ''));
      if (!detail) return;
      var willOpen = detail.hasAttribute('hidden');
      if (willOpen) {
        /* 第一次展开才填内容（省得页面里塞 80 份没人看的明细）；
           填的就是 expertDetailHtml() 的输出 —— 和 App 里一模一样。 */
        if (!detail.getAttribute('data-filled')) {
          var key = String(row.getAttribute('data-ex-key') || '');
          var gp = key.split('-');
          var idx = parseInt(gp.pop(), 10);
          var gid = gp.join('-');
          var e = null;
          try {
            e = (typeof expertsFor === 'function') ? expertsFor(gid) : null;
            e = (e && Array.isArray(e.stable) && e.stable[idx]) ? e.stable[idx] : null;
          } catch (e0) { e = null; }
          if (e && typeof expertDetailHtml === 'function') {
            detail.innerHTML = expertDetailHtml(e);
            detail.setAttribute('data-filled', '1');
          }
        }
        detail.removeAttribute('hidden');
      } else {
        detail.setAttribute('hidden', '');
      }
      row.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      if (row.classList) row.classList.toggle('on', willOpen);
    };

    document.addEventListener('click', function (ev) {
      var row = keyOf(ev.target);
      if (!row) return;
      ev.preventDefault();
      toggle(row);
    });
    document.addEventListener('keydown', function (ev) {
      var k = ev.key || '';
      if (k !== 'Enter' && k !== ' ' && k !== 'Spacebar') return;
      var row = keyOf(ev.target);
      if (!row) return;
      ev.preventDefault();
      toggle(row);
    });

    /* 给验收脚本留一个干净入口（不影响页面行为） */
    window.__roExpRow = { rows: document.querySelectorAll('a.ro-xj-row[data-ex-key]').length };
  } catch (e) { /* 忽略：专家推荐本身已经预渲染在页面里，展开只是锦上添花 */ }
})();
</script>

<!-- __ART_BODY_JS__ 文章参考·正文原位展开（方案 A）
     用户原话：「要把正文抓到我们页面上」→ 点标题在标题下面原地展开正文，
     再点一次收起。【默认全部收起】。
     这一段只做两件事：切 .ro-art-open 这个 class + 展开时把正文顶端拉进视口。
     纯前端，不联网、不调 AI → 免费。
     ⚠️ 必须放在本模板的 </body> 之前（模板字符串内部）；
        以前把页面脚本拼在 .mjs 文件末尾 → Node 里 document 未定义直接崩。 -->
<script>
(function () {
  try {
    /* 页尾其它脚本都还没跑（script 是顺序执行的），所以这里直接查 DOM 就行；
       仍然包一层 try，任何意外都不影响正文已经预渲染的事实。 */
    var links = document.querySelectorAll('a.ro-art-link[data-ro-art]');
    if (!links.length) return;

    /* 展开时不要把标题顶出屏幕：只有正文顶端已经跑到视口上方才补一点滚动。
       收起时不滚动 —— 否则页面会乱跳。 */
    function reveal(box) {
      if (!box || !box.getBoundingClientRect) return;
      var top = box.getBoundingClientRect().top;
      if (top < 0) {
        try { box.scrollIntoView({ block: 'nearest' }); }
        catch (e) { /* 老浏览器：不滚动也能看 */ }
      }
    }

    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function (e) {
        var a = this;
        var id = String(a.getAttribute('data-ro-art') || '');
        var body = id ? document.getElementById('ro-art-' + id) : null;
        if (!body) return;                       /* 没抓到正文 → 交给浏览器处理 */
        e.preventDefault();                      /* 不跳锚点、不改 hash */
        var li = a.parentNode;
        if (li && li.tagName !== 'LI') li = li.parentNode;   /* 结构变了也不至于报错 */
        if (!li) return;
        /* 用 classList 加/摘 —— 不要整串重写 className：
           那样每次收起都会在 class 里留下一串空格，越点越脏。 */
        var cls = li.classList;
        var open = cls ? cls.contains('ro-art-open') : false;
        if (cls && cls.add && cls.remove) {
          if (open) cls.remove('ro-art-open'); else cls.add('ro-art-open');
        } else {                                  /* 老浏览器兜底 */
          var s = (' ' + String(li.className || '') + ' ').replace(/\s+/g, ' ');
          li.className = open
            ? s.replace(' ro-art-open ', ' ').replace(/^ | $/g, '')
            : (s + 'ro-art-open ').replace(/^ /, '');
        }
        if (!open) reveal(body);
      });
    }

    /* 给验收脚本留一个干净入口（不影响页面行为） */
    window.__roArt = { links: links.length };
  } catch (e) { /* 忽略：正文已经预渲染在页面里，展开只是锦上添花 */ }
})();
</script>

<!-- __AIPICK_JS__ ai选号面板交互（纯前端随机模拟）
     用户要求：
       · 晒票栏下面这个「ai选号」小窗口里，用户可以自己操作摇号（单式 / 复式）
       · 除了竞彩页的奖金试算器，整页【只有这一块】可以操作
       · 不加「保存 / 记住 / 收藏」之类功能，也不写任何浏览器存储
         （本地存储 / 会话存储 / COOKIE 一个都不用）
         —— 所有状态都只是内存变量，刷新页面立刻回到默认
     规则出处：生成时从规则表读真实区间/位数（AIPICK_JS_RULES），
               前端不重复维护一份规则表。
     组六约束：福彩3D / 排列3 / 排列5 前三位必须「全组六」（三位两两不同），
               复用的就是统计模块 enforceDigitStraightGate() 的那条规则
               （DIGIT_STRAIGHT_KEYS：fc3d/pl3 = 百/十/个，pl5 = 万/千/百）。
               分享页是单文件、不加载 stats.js，所以这里是同一条规则的前端实现。
     ⚠️ 必须放在本模板的 </body> 之前（模板字符串内部）；
        以前把页面脚本拼在 .mjs 文件末尾 → Node 里 document 未定义直接崩。 -->
<script>
(function () {
  try {
    var root = document.getElementById('ro-aipick');
    if (!root) return;

    /* 规则表 = 生成时从 games.js 的 GAMES 里读出来的真实值（不是手抄的） */
    var RULES = ${AIPICK_JS_RULES};
    var byId = {};
    for (var r0 = 0; r0 < RULES.length; r0++) byId[RULES[r0].id] = RULES[r0];

    /* 【注数上限】用户 2026-10-17：1000 → 10000。
       它的作用【不是限制选几个号】（号码个数的上限已经去掉，可以选满池子），
       而是防止一次真的生成上百万注把手机/浏览器卡死（33 个红球 = C(33,6) = 1,107,568 注）。
       注数超过这个数时：只显示注数、不摇号（页面提示"注数待调整"）。 */
    var MAX_COMBO = 10000;
    /* 【倍数上限】用户 2026-10-17：「完全去掉」。
       原来公式里夹到 1~99（99 是体彩/福彩单票的官方上限）。
       现在不夹了，只留一个天文数字当保险丝，纯防止数字溢出成 Infinity/NaN
       （注数 × 倍数 × 2 的金额算式）。也就是说正常使用下【没有】倍数限制。 */
    var MAX_TIMES = 1e9;
    var MAX_SHOW = 100;        /* 结果区最多画 100 注 */
    var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

    /* 【内存状态】只放在内存里：刷新页面即回到默认（不碰任何浏览器存储） */
    var st = { game: RULES[0].id, times: 1, kl8: 10, multi: {}, rows: [], pick: {}, betCount: 0,
               src: 'random' };   /* src: 'random' 随机摇号 | 'manual' 自选（用户 2026-10-17 要求加「自选」） */

    /* ---------- 基础工具 ---------- */
    function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
    function shuffled(a, b) {
      var arr = [], i;
      for (i = a; i <= b; i++) arr.push(i);
      for (i = arr.length - 1; i > 0; i--) { var j = rnd(0, i); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      return arr;
    }
    /* 不重复抽 n 个（升序）：和 app.js 的 pickNumbers 同一套洗牌法 */
    function pickDistinct(a, b, n) {
      var arr = shuffled(a, b);
      if (n > arr.length) n = arr.length;
      return arr.slice(0, n).sort(function (x, y) { return x - y; });
    }
    function C(n, k) {                       /* 组合数 C(n,k)：复式注数就是它 */
      if (k < 0 || k > n) return 0;
      k = Math.min(k, n - k);
      var r = 1, i;
      for (i = 1; i <= k; i++) r = r * (n - k + i) / i;
      return Math.round(r);
    }
    function combos(arr, k) {                /* 从 arr 里取 k 个的全部组合 */
      var res = [];
      (function rec(start, cur) {
        if (res.length >= MAX_COMBO) return;
        if (cur.length === k) { res.push(cur.slice()); return; }
        for (var i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
      })(0, []);
      return res;
    }
    function cartesian(list) {               /* 每个区取一个组合 → 笛卡尔积 = 复式的每一注 */
      var res = [[]], i, j, k;
      for (i = 0; i < list.length; i++) {
        var next = [];
        for (j = 0; j < res.length; j++) {
          for (k = 0; k < list[i].length; k++) {
            if (next.length >= MAX_COMBO) break;
            next.push(res[j].concat([list[i][k]]));
          }
        }
        res = next;
      }
      return res;
    }
    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined && text !== null) n.textContent = String(text);
      return n;
    }
    function clearNode(box) { while (box.firstChild) box.removeChild(box.firstChild); }
    function show(node, on) {
      if (!node) return;
      if (on) node.removeAttribute('hidden');
      else node.setAttribute('hidden', 'hidden');
    }
    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function attr(node, name) { return node ? String(node.getAttribute(name) || '') : ''; }

    /* ---------- DOM 元素 ---------- */
    var gameTabs = root.querySelectorAll('.ro-aipick-tab');
    var ruleBox = root.querySelector('.ro-aipick-rule');
    var lineKl8 = root.querySelector('.ro-aipick-line-kl8');
    var kl8Box = root.querySelector('.ro-aipick-kl8');
    var lineMulti = root.querySelector('.ro-aipick-line-multi');
    var multiBox = root.querySelector('.ro-aipick-multi');
    var inTimes = root.querySelector('.ro-aipick-in-times');
    var sumBox = root.querySelector('.ro-aipick-sum');
    var warnBox = root.querySelector('.ro-aipick-warn');
    var outBox = root.querySelector('.ro-aipick-out');
    var pickBox = root.querySelector('.ro-aipick-picker');   /* 自己选号：号码格子 */
    var acts = root.querySelectorAll('.ro-aipick-btn');
    var lineTimes = root.querySelector('.ro-aipick-line-times');
    var actsBox = root.querySelector('.ro-aipick-acts');

    /* ---------- 彩种规则（全部来自 games.js） ---------- */
    function G() { return byId[st.game] || RULES[0]; }

    /* 数字型每一位。gate = 1 的位就是「必须全组六」的那三位：
       fc3d / pl3 = 百/十/个；pl5 = 万/千/百（与 stats.js DIGIT_STRAIGHT_KEYS 一致） */
    function posOf(g) {
      var a = [], i;
      if (g.id === 'fc3d' || g.id === 'pl3') {
        a = [{ n: '百位', from: 0, to: 9, gate: 1 },
             { n: '十位', from: 0, to: 9, gate: 1 },
             { n: '个位', from: 0, to: 9, gate: 1 }];
      } else if (g.id === 'pl5') {
        a = [{ n: '万位', from: 0, to: 9, gate: 1 },
             { n: '千位', from: 0, to: 9, gate: 1 },
             { n: '百位', from: 0, to: 9, gate: 1 },
             { n: '十位', from: 0, to: 9, gate: 0 },
             { n: '个位', from: 0, to: 9, gate: 0 }];
      } else if (g.id === 'qxc') {
        for (i = 0; i < 6; i++) a.push({ n: '第' + (i + 1) + '位', from: 0, to: 9, gate: 0 });
        a.push({ n: '最后一位', from: 0, to: 14, gate: 0 });
      }
      return a;
    }
    /* 号码型的「购票用」号码区：去掉特别号（七乐彩的特别号是开奖摇出的，不由购票人选） */
    function areasOf(g) {
      var out = [], i;
      for (i = 0; i < g.areas.length; i++) if (g.areas[i].key !== 'special') out.push(g.areas[i]);
      return out;
    }
    function pickOf(g, a) { return g.playModes ? st.kl8 : (a.pick || 1); }
    function isDigit(g) { return g.type === 'digit' || g.type === 'qxc'; }
    function maxMultiOf(g, a) {
      var base = pickOf(g, a);
      /* 【去掉人为上限】用户 2026-10-17：「是不是限额额度原因 不要给我限制」。
         原来：号码型最多一个区 20 个号、快乐8 封成 base+10 —— 都是人为封顶，
         也正是「打 10 显示成 20」的来源：打「1」被夹到下限 6，再打「0」变成 60，
         又被夹到上限 20 ⇒ 看到 20。
         现在上限 = 【号码池实际大小】（双色球红球 33、大乐透前区 35、蓝球 16、快乐8 80…），
         也就是物理上不可能再多的那个数，不再做任何人为限制。
         ⚠️ 代价：注数会非常大（红球选满 33 个 = C(33,6) = 1,107,568 注），页面照实算、不拦。 */
      return Math.max(a.to - a.from + 1, base);
    }

    function ruleText(g) {
      var i, t;
      if (g.type === 'digit') {
        var gateN = 0, pos = posOf(g);
        for (i = 0; i < pos.length; i++) if (pos[i].gate) gateN++;
        t = g.digits + ' 位数字（每位 0-9）';
        if (gateN >= 3) t += ' · 前三位【全组六】：三位数字两两不同（不出豹子、不出组三）';
        return t;
      }
      if (g.type === 'qxc') return '前六位各 0-9 · 最后一位 0-14（共 7 位）';
      var parts = [];
      if (g.playModes) parts.push('选' + (CN[st.kl8] || st.kl8) + '：1-80 里选 ' + st.kl8 + ' 个');
      var areas = areasOf(g);
      for (i = 0; i < areas.length; i++) {
        parts.push(areas[i].label + ' ' + pickOf(g, areas[i]) + ' 个（' + areas[i].from + '-' + areas[i].to + ' 不重复）');
      }
      if (g.id === 'qlc') parts.push('特别号由开奖摇出，不用选');
      return parts.join(' · ');
    }

    /* ---------- 复式：每个区 / 每一位选几个号（内存里记，刷新即忘） ---------- */
    function mkey(k) { return st.game + '|' + k; }
    function multiGet(k, def, min, max) {
      var v = st.multi[mkey(k)];
      if (typeof v !== 'number' || !isFinite(v)) v = def;
      if (v < min) v = min;
      if (v > max) v = max;
      st.multi[mkey(k)] = v;
      return v;
    }
    function multiInput(label, key, val, min, max, hideUnit) {
      var wrap = el('span', 'ro-aipick-mwrap');
      wrap.appendChild(el('span', 'ro-aipick-unit', label));
      var inp = document.createElement('input');
      inp.className = 'ro-aipick-in ro-aipick-in-multi';
      /* 【必须是 text，不能是 number】
         number 类型不支持选区 API（selectionStart 恒为 null）→ 聚焦全选做不到，
         光标停在旧值后面，打字就变成"追加"。text + inputmode=numeric 两者兼得。 */
      inp.type = 'text';
      inp.setAttribute('inputmode', 'numeric');
      inp.setAttribute('pattern', '[0-9]*');
      inp.autocomplete = 'off';
      inp.setAttribute('min', String(min));
      inp.setAttribute('max', String(max));
      inp.setAttribute('data-ro-aipick-key', key);
      inp.setAttribute('data-ro-aipick-min', String(min));
      inp.setAttribute('data-ro-aipick-max', String(max));
      inp.value = String(val);
      /* 【关键修复 · 用户 2026-10-17 报的「一位数能改、两位数改不了」】
         原来这里是 addEventListener('input', refresh)：
         每按一个键就 refresh → multiGet 立刻把值夹进 [min,max] ——
         打「10」时按「1」就先被夹成 6（双色球红球 min=6）或 2（大乐透后区 min=2），
         再按「0」就接在 6 / 2 后面 → 所以永远出不来两位数（用户看到的「20」就是 2+0）。
         现在：打字过程【完全不碰它】，只在 change（失焦）或回车时 refresh（那时才夹取/纠正）。 */
      inp.addEventListener('focus', function () { try { inp.select(); } catch (e) { /* 忽略 */ } });
      inp.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); refresh(); try { inp.blur(); } catch (e) { /* 忽略 */ } }
      });
      inp.addEventListener('change', refresh);
      wrap.appendChild(inp);
      /* 单位「个」：红球 [6] 个 / 百位 2 个（hideUnit 留给以后要长标签的彩种用） */
      if (!hideUnit) wrap.appendChild(el('span', 'ro-aipick-unit', '个'));
      return wrap;
    }
    /* 【本轮改版·最终】号码型：每个区都给一个「选几个」输入框
       用户原话：「复式 改成输入要选几个号 比如红球要选几个」。
       双色球就是「红球 [6] 个 蓝球 [1] 个」；个数 ≥ 官方基本个数，
       超出的部分按复式算（注数 = C(红球个数,6) × C(蓝球个数,1)，由 plan() 现算）。
       数字彩照旧每位一个框（0-9 池子就 10 个号，本来就没几个可选）。 */
    function buildMultiRow(g) {
      if (!multiBox) return;
      clearNode(multiBox);
      var i;
      if (isDigit(g)) {
        var pos = posOf(g);
        for (i = 0; i < pos.length; i++) {
          var size = pos[i].to - pos[i].from + 1;
          var def = (i === 0) ? Math.min(2, size) : 1;
          multiBox.appendChild(multiInput(pos[i].n + (pos[i].gate ? '·组六位' : ''), 'p' + i,
            multiGet('p' + i, def, 1, size), 1, size));
        }
      } else {
        /* 【本轮改版】每个号码区一个「选几个」框：红球 / 蓝球（大乐透 = 前区 / 后区…）。
           第一个区默认多给 1 个（= 最小的复式），其余区按官方基本个数。 */
        var areas = areasOf(g);
        for (i = 0; i < areas.length; i++) {
          var base = pickOf(g, areas[i]), max = maxMultiOf(g, areas[i]);
          var d = (i === 0) ? Math.min(base + 1, max) : base;
          multiBox.appendChild(multiInput(areas[i].label, 'a' + i,
            multiGet('a' + i, d, base, max), base, max));
        }
      }
    }
    function buildKl8(g) {
      if (!kl8Box) return;
      clearNode(kl8Box);
      if (!g.playModes) return;
      for (var i = 10; i >= 1; i--) {          /* 选十 → 选一，和官方顺序一致 */
        (function (n) {
          var a = el('a', 'ro-aipick-kl8tab' + (n === st.kl8 ? ' on' : ''), '选' + (CN[n] || n));
          a.setAttribute('role', 'button');
          a.setAttribute('tabindex', '0');
          a.setAttribute('data-ro-aipick-kl8', String(n));
          a.addEventListener('click', function (e) {
            if (e && e.preventDefault) e.preventDefault();
            if (n === st.kl8) return;
            st.kl8 = n;
            st.rows = [];
            st.multi = {};
            st.pick = {};
            syncTabs();
            buildMultiRow(G());
            buildPicker(G());              /* 玩法换了 → 「自己选号」每个区最少个数也变了，重画 */
            applySrc();
          });
          kl8Box.appendChild(a);
        })(i);
      }
    }

    /* ============================================================
       【保存图片】把当前号码画成一张 PNG，再用页面已有的全屏层弹出来
       ------------------------------------------------------------
       用户原话：「也有保存界面 保存就是弹出图片他选着的图片让他自己保存」
       · 纯 <canvas> 画图，不联网、不上传（图片数据只在本页内存里）
       · 弹层复用页面已有的 ro-mob-view（window.__roMobView.openUrl 直接
         把 src 赋给 <img>，所以 data:image/png;base64,… 一样能显示），
         关闭方式不变：× / 点空白 / Esc / 手机返回键
       · 还没摇号 → 只给提示，不出空图
       · 出图失败（老浏览器没有 canvas）→ 也只给提示，不静默失败
       ⚠️ 这张图【不写任何存储】：不落本地存储 / 会话存储 / COOKIE
          —— 图片只在内存里（st.pic），刷新页面就没了
       ============================================================ */
    function nowText() {
      var d = new Date();
      var p = function (n) { return n < 10 ? '0' + n : String(n); };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
             p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function saveHint(msg) {
      if (warnBox) { warnBox.textContent = msg; show(warnBox, true); }
    }
    /* 当前要出图的号码：结果区已经摇出来的那几注 */
    function picData() {
      var g = G();
      if (!st.rows.length) return null;
      var r0 = st.rows[0];
      /* 【自己选号】手选的那条：用「按区分组」的画法（一个区一段，选多也不跑版） */
      if (r0 && r0.manual) {
        var slots = slotsOf(g), groups = [], i;
        for (i = 0; i < slots.length; i++) {
          groups.push({ label: slots[i].label, color: slots[i].color, to: slots[i].to,
                        nums: pickArr(slots[i].key).slice() });
        }
        return {
          kind: 'self', groups: groups,
          note: '手动选号 · 折合 ' + (st.betCount || 0) + ' 注 × ' + st.times + ' 倍 = ' +
                ((st.betCount || 0) * st.times * (g.price || 2)) + ' 元'
        };
      }
      return {
        kind: r0.kind, pos: r0.pos, areas: r0.areas,
        rows: st.rows.map(function (r) { return r.row; }),
        note: '共 ' + (st.betCount || st.rows.length) + ' 注 · ' + st.times + ' 倍 · 合计 ' +
              ((st.betCount || st.rows.length) * st.times * (g.price || 2)) + ' 元'
      };
    }
    /* 【🔵 蓝球更明显 · 2026-10-20】用户原话：「资料里面 篮球后区推荐记得带上
       球的图标明显一点」+ 补充「大乐透和双色球」→ 只加强【双色球蓝球 / 大乐透后区】。
       这颗球是【推荐图上】的号码球（canvas 画的），所以只改这一支：
         · 原来：深藏青底 #16233a + 淡蓝字 #8fb8ff → 远看只是一颗深色球
         · 现在：真·蓝球 —— 径向渐变（左上高光 → 右下深蓝）+ 亮蓝描边 + 白字加粗
         · 白字压 #1f5fd6 实测 ≈ 5.7:1（过 WCAG AA 4.5:1）；亮蓝描边让它从
           深色底/浅色底上都一眼能认出来是「蓝球」而不是一颗黑球
         · 红球一个字节都没动（fill #3a1d22 / 描边 #a34a4a / 字 #ff8b8b）
       ⚠️ 半径 r 不动：每行的间距是按 ballR*2+gap 算好的，改大小会串行。
       ⚠️ strong=true 才用新版（strong 由 drawPic 按彩种算，只有双色球/大乐透是）。
       参数：strong = 双色球/大乐透（强蓝）；blue = 蓝球/后区/特别号 */
    function drawBall(ctx, cx, cy, r, blue, text, strong) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2, false);
      if (blue && strong) {
        var bgr = ctx.createRadialGradient(
          cx - r * 0.34, cy - r * 0.38, r * 0.16, cx, cy, r * 1.02);
        bgr.addColorStop(0, '#6ba4ff');
        bgr.addColorStop(0.42, '#2a63e0');
        bgr.addColorStop(1, '#12379b');
        ctx.fillStyle = bgr;
      } else {
        ctx.fillStyle = blue ? '#16233a' : '#3a1d22';
      }
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = blue ? (strong ? '#9cc4ff' : '#3d5a86') : '#a34a4a';
      ctx.stroke();
      ctx.fillStyle = blue ? (strong ? '#ffffff' : '#8fb8ff') : '#ff8b8b';
      ctx.font = 'bold 17px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(text), cx, cy + 6);
      ctx.textAlign = 'left';
    }
    function drawPic(g, data) {
      var W = 720, pad = 28, lineH = 48, ballR = 15, gap = 9;
      var maxRows = 20;
      var top = 172, foot = 100;
      var H, i, j;
      /* 【🔵 强蓝球只给双色球/大乐透】用户 2026-10-20 补充「大乐透和双色球」：
         其它彩种（七乐彩特别号 / 七星彩后区）的蓝球保持原样，一个字节都不动。
         认彩种优先用 g.id，读不到再按名字兜底。 */
      var picGid = String((g && (g.id || g.key)) || '');
      var picGname = String((g && g.name) || '');
      var strongBlue = (picGid === 'ssq' || picGid === 'dlt'
        || picGname.indexOf('双色球') >= 0 || picGname.indexOf('大乐透') >= 0);
      /* ---- 先算版面高度，再定画布尺寸 ---- */
      var blocks = null, selfLines = 0;
      if (data.kind === 'self') {
        var per = Math.floor((W - pad * 2 - 92) / (ballR * 2 + gap));
        if (per < 4) per = 4;
        blocks = [];
        for (i = 0; i < data.groups.length; i++) {
          var gp = data.groups[i], lines = [];
          for (j = 0; j < gp.nums.length; j += per) lines.push(gp.nums.slice(j, j + per));
          if (!lines.length) lines.push([]);
          blocks.push({ label: gp.label, color: gp.color, to: gp.to, lines: lines });
          selfLines += 26 + lines.length * 44 + 10;
        }
        H = top + selfLines + 120;
      } else {
        var n0 = Math.min(data.rows.length, maxRows);
        H = top + n0 * lineH + (data.rows.length > n0 ? 34 : 0) + foot;
      }
      var cv = document.createElement('canvas');
      if (!cv) return null;
      cv.width = W;
      cv.height = H;
      var ctx = null;
      try { ctx = cv.getContext('2d'); } catch (e) { ctx = null; }
      if (!ctx) return null;
      ctx.fillStyle = '#0f1115';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#12161d';
      ctx.fillRect(0, 0, W, 128);
      ctx.fillStyle = '#e8eaed';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('GPT模型摇号 · 春风', pad, 56);
      ctx.fillStyle = '#8fb8ff';
      ctx.font = '20px sans-serif';
      ctx.fillText(g.name + '　' + data.note, pad, 94);
      ctx.fillStyle = '#2a323f';
      ctx.fillRect(0, 127, W, 1);
      /* ---- 自己选号：一个区一段，段内按行铺开（选 33 个也不会跑出画布） ---- */
      if (data.kind === 'self') {
        var y2 = top;
        for (i = 0; i < blocks.length; i++) {
          ctx.fillStyle = '#c3ccda';
          ctx.font = 'bold 20px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(blocks[i].label, pad, y2 + 8);
          y2 += 26;
          for (j = 0; j < blocks[i].lines.length; j++) {
            var x2 = pad + 92, k2;
            for (k2 = 0; k2 < blocks[i].lines[j].length; k2++) {
              var v = blocks[i].lines[j][k2];
              drawBall(ctx, x2 + ballR, y2 + 8, ballR, blocks[i].color === 'blue',
                blocks[i].to > 9 ? pad2(v) : String(v), strongBlue);
              x2 += ballR * 2 + gap;
            }
            y2 += 44;
          }
          y2 += 10;
        }
      } else {
      var n = Math.min(data.rows.length, maxRows);
      for (var i3 = 0; i3 < n; i3++) {
        var y = top + i3 * lineH;
        var x = pad;
        if (data.rows.length > 1) {
          ctx.fillStyle = '#5f6878';
          ctx.font = '16px sans-serif';
          ctx.fillText('第' + (i3 + 1) + '注', pad, y + 6);
          x = pad + 62;
        }
        var row = data.rows[i3] || [];
        if (data.kind === 'number') {
          for (var a = 0; a < data.areas.length; a++) {
            if (a > 0) {
              ctx.fillStyle = '#5f6878'; ctx.font = '18px sans-serif';
              ctx.fillText('+', x + 6, y + 6); x += 24;
            }
            var ar = data.areas[a], picked = row[a] || [];
            for (var jj = 0; jj < picked.length; jj++) {
              /* 号码型补两位；数字彩不补（0 就是「0」不是「00」） */
              drawBall(ctx, x + ballR, y, ballR, ar.color === 'blue',
                ar.to > 9 ? pad2(picked[jj]) : String(picked[jj]), strongBlue);
              x += ballR * 2 + gap;
            }
          }
        } else {
          for (var k = 0; k < row.length; k++) {
            var isLast = (k === row.length - 1 && data.pos && data.pos[k] && data.pos[k].to === 14);
            if (isLast) {
              ctx.fillStyle = '#5f6878'; ctx.font = '18px sans-serif';
              ctx.fillText('+', x + 6, y + 6); x += 24;
            }
            /* 【一位多个号】复式/自己选号时 row[k] 是这一位的号数组（如百位 [0,8]）——
               老写法直接把数组当文本画（会印出「0,8」），这里逐个数画，
               位与位之间补一个小圆点，免得看不出哪几个号是哪一位。 */
            var cell = row[k];
            var list = (Object.prototype.toString.call(cell) === '[object Array]') ? cell : [cell];
            for (var kk = 0; kk < list.length; kk++) {
              drawBall(ctx, x + ballR, y, ballR, !!isLast, String(list[kk]), strongBlue);
              x += ballR * 2 + gap;
            }
            if (list.length > 1 && k < row.length - 1) {
              ctx.fillStyle = '#5f6878'; ctx.font = '16px sans-serif';
              ctx.fillText('·', x + 1, y + 6); x += 14;
            }
          }
        }
      }
      if (data.rows.length > n) {
        ctx.fillStyle = '#5f6878';
        ctx.font = '16px sans-serif';
        ctx.fillText('（图里只画前 ' + n + ' 注，实际共 ' + data.rows.length + ' 注）', pad, top + n * lineH + 8);
      }
      }
      ctx.fillStyle = '#1e2430';
      ctx.fillRect(0, H - foot + 12, W, 1);
      ctx.fillStyle = '#6b7488';
      ctx.font = '18px sans-serif';
      ctx.fillText('仅供娱乐，不构成购彩建议，请理性购彩。', pad, H - foot + 48);
      ctx.fillStyle = '#5f6878';
      ctx.font = '15px sans-serif';
      ctx.fillText('生成时间：' + nowText() + ' · 纯本机随机模拟（未联网、不上传、不保存）', pad, H - foot + 76);
      var url = '';
      try { url = cv.toDataURL('image/png'); } catch (e) { url = ''; }
      if (!url) return null;
      return { url: url, w: W, h: H, rows: n };
    }
    function saveImage() {
      var g = G();
      var data = picData();
      if (!data) {
        saveHint('请先摇号再点「保存图片」');
        return null;
      }
      var pic = drawPic(g, data);
      if (!pic || !pic.url) {
        saveHint('生成图片失败：这个浏览器不支持把号码画成图片，请换个浏览器再试');
        return null;
      }
      st.pic = pic;                      /* 只在内存里留一份，刷新就没了 */
      var api = window.__roMobView;
      var opened = false;
      try {
        opened = !!(api && typeof api.openUrl === 'function' && api.openUrl(pic.url, 'GPT模型摇号 · ' + g.name, true));
      } catch (e) { opened = false; }
      if (!opened) saveHint('图片已经生成，但全屏层没能打开：请刷新页面后再试一次');
      return pic;
    }

    /* ---------- 读输入框（倍数 / 每个区选几个号） ---------- */    function numOf(inp, def, min, max) {
      var v = NaN;
      if (inp) v = parseInt(String(inp.value === undefined || inp.value === null ? '' : inp.value), 10);
      if (!isFinite(v)) v = def;
      if (typeof v !== 'number' || !isFinite(v)) v = min;
      if (v < min) v = min;
      if (v > max) v = max;
      if (inp && String(inp.value) !== String(v)) { try { inp.value = String(v); } catch (e) { /* 忽略 */ } }
      return v;
    }
    function readInputs() {
      st.times = numOf(inTimes, st.times, 1, MAX_TIMES);
      var list = root.querySelectorAll('.ro-aipick-in-multi');
      for (var i = 0; i < list.length; i++) {
        var key = attr(list[i], 'data-ro-aipick-key');
        if (!key) continue;
        var min = parseInt(attr(list[i], 'data-ro-aipick-min'), 10) || 1;
        var max = parseInt(attr(list[i], 'data-ro-aipick-max'), 10) || 99;
        var v = numOf(list[i], st.multi[mkey(key)], min, max);
        st.multi[mkey(key)] = v;
      }
    }

    /* ---------- 摇号计划：先算「共几注」，超上限就不摇 ---------- */
    /* 前三位「全组六」：三个位置的候选数字两两不重复。
       这就是 stats.js enforceDigitStraightGate() 保证的那个状态
       （那里保证 fc3d / pl3 / pl5 前三位 27 注直选全是组六、0 豹子）。 */
    function dealDigits(pos, counts) {
      var pool = shuffled(0, 9), pi = 0, i;
      var sets = [];
      for (i = 0; i < pos.length; i++) sets.push([]);
      for (i = 0; i < pos.length; i++) {                 /* ① 组六位先分：两两不重复 */
        if (!pos[i].gate) continue;
        while (sets[i].length < counts[i] && pi < pool.length) sets[i].push(pool[pi++]);
      }
      for (i = 0; i < pos.length; i++) {                 /* ② 其余位：先用剩下的号，不够再按本位随机补 */
        if (pos[i].gate) continue;
        while (sets[i].length < counts[i]) {
          if (pi < pool.length) sets[i].push(pool[pi++]);
          else sets[i].push(rnd(pos[i].from, pos[i].to));
        }
      }
      for (i = 0; i < sets.length; i++) sets[i].sort(function (x, y) { return x - y; });
      return sets;
    }
    function planDigit(g) {
      var pos = posOf(g), i;
      var counts = [], sets, want = 1, prod = 1;
      for (i = 0; i < pos.length; i++) {
        var size = pos[i].to - pos[i].from + 1;
        var def = (i === 0) ? Math.min(2, size) : 1;
        counts.push(multiGet('p' + i, def, 1, size));
        want *= counts[i];
      }
      sets = dealDigits(pos, counts);
      for (i = 0; i < sets.length; i++) prod *= sets[i].length;
      if (want > MAX_COMBO) {
        return { ok: 0, msg: '复式共 ' + want + ' 注，超过上限 ' + MAX_COMBO + ' 注，请减少各位的数字个数' };
      }
      var note = '';
      if (want !== prod) {
        var got = [];
        for (i = 0; i < sets.length; i++) got.push(sets[i].length);
        note = '前三位受「全组六」约束（号池只有 0-9 十个数字），实际按 ' + got.join('/') + ' 个分配';
      }
      /* 数字彩同理：只出【一条】（各位原样画，不再展开成 各位相乘 条） */
      return { ok: 1, kind: 'digit', count: prod, pos: pos, sets: sets, rows: [sets], note: note };
    }
    function planNumber(g) {
      var areas = areasOf(g), i;
      var sets = [], want = 1;
      for (i = 0; i < areas.length; i++) {
        var a = areas[i], base = pickOf(g, a), max = maxMultiOf(g, a);
        var def = (i === 0) ? Math.min(base + 1, max) : base;
        var c = multiGet('a' + i, def, base, max);
        sets.push(pickDistinct(a.from, a.to, c));
        want *= C(c, base);
      }
      /* ⚠️ 这里原来有一条「复式至少要有一个区超过基本个数」的拦截：
         现在每个区都是「选几个」输入框，红球 6 / 蓝球 1 就是最普通的 1 注，
         再拦就没法出号了 —— 去掉。 */
      if (want > MAX_COMBO) {
        return { ok: 0, msg: '复式共 ' + want + ' 注，超过上限 ' + MAX_COMBO + ' 注，请减少号码个数' };
      }
      var per = [];
      for (i = 0; i < areas.length; i++) per.push(combos(sets[i], pickOf(g, areas[i])));
      /* 【一次摇号 = 一条号码】用户 2026-10-17：
         「摇号一次只能摇一注出来。前区选几就是摇出几个，后区要几个就是摇几个」
         → 不再把复式展开成 C(n,基本个数) 条单式（那是 6 条几乎一样的号，看着乱），
           只出【一条】：每个区原样画你选的那几个号（前区填 6 就画 6 个、后区填 2 就画 2 个）。
         注数仍然算准（want），放在 count 里 —— 页面顶部「合计 N 注 × M 倍 = X 元」用它。 */
      var rows = [sets];
      return { ok: 1, kind: 'number', count: want, areas: areas, sets: sets, rows: rows };
    }
    function plan(g) { return isDigit(g) ? planDigit(g) : planNumber(g); }

    /* ---------- 界面刷新（规则 / 合计 / 超限提示） ---------- */
    function refresh() {
      var g = G();
      readInputs();
      if (ruleBox) ruleBox.textContent = ruleText(g);
      var p = plan(g);
      var n = 0, warn = '';
      if (p) {
        if (p.ok) n = p.count; else warn = p.msg || '';
        if (p.ok && p.note) warn = p.note;
      }
      if (sumBox) {
        sumBox.textContent = !n
          ? '注数待调整'
          : '合计 ' + n + ' 注 × ' + st.times + ' 倍 = ' + (n * st.times * (g.price || 2)) + ' 元';
      }
      if (warnBox) {
        if (warn) { warnBox.textContent = warn; show(warnBox, true); }
        else { warnBox.textContent = ''; show(warnBox, false); }
      }
    }

    /* ============================================================
       【自己选号 · 点格子】用户 2026-10-17：「选号 就是自己点击去选号码」
       ------------------------------------------------------------
       · 每个槽位（号码型 = 每个号码区；数字彩 = 每一位）一段格子，格子里是
         <a role="button">（页面不变量：不能用 button 标签）。
       · 点一下选中、再点一下取消；每段显示「已选 N 个（最少 X 个，可多选成复式）」。
       · 点完立刻把已选号变成【一条号码】放进结果区（st.rows）—— 和摇号出来那条同构，
         所以「注数/金额」「保存图片」全都自动跟着走，不用第二套渲染。
       · 只存在内存里（st.pick）：切彩种 / 点清空 / 刷新页面都会没了。
       ============================================================ */
    function pkey(k) { return st.game + '#' + k; }
    function pickArr(k) { return st.pick[pkey(k)] || []; }
    /* 这个彩种要选哪些「槽位」：号码型 = 每个号码区；数字型 = 每一位 */
    function slotsOf(g) {
      var out = [], i;
      if (isDigit(g)) {
        var pos = posOf(g);
        for (i = 0; i < pos.length; i++) {
          out.push({ key: 'p' + i, label: pos[i].n, from: pos[i].from, to: pos[i].to, need: 1, gate: pos[i].gate });
        }
      } else {
        var areas = areasOf(g);
        for (i = 0; i < areas.length; i++) {
          out.push({ key: 'a' + i, label: areas[i].label, from: areas[i].from, to: areas[i].to,
                     need: pickOf(g, areas[i]), color: areas[i].color });
        }
      }
      return out;
    }
    function buildPicker(g) {
      if (!pickBox) return;
      clearNode(pickBox);
      var slots = slotsOf(g), i;
      for (i = 0; i < slots.length; i++) {
        (function (slot) {
          var block = el('div', 'ro-aipick-pblock');
          var head = el('div', 'ro-aipick-phead');
          head.appendChild(el('span', 'ro-aipick-plabel', slot.label));
          var cnt = el('span', 'ro-aipick-pcount');
          cnt.setAttribute('data-ro-aipick-slot', slot.key);
          head.appendChild(cnt);
          block.appendChild(head);
          var grid = el('div', 'ro-aipick-grid');
          for (var n = slot.from; n <= slot.to; n++) {
            (function (num) {
              /* 号码型补两位（01-33）；数字彩就一位（0 显示成「0」不是「00」） */
              var a = el('a', 'ro-aipick-pick', slot.to > 9 ? pad2(num) : String(num));
              a.setAttribute('role', 'button');
              a.setAttribute('tabindex', '0');
              a.setAttribute('data-ro-aipick-slot', slot.key);
              a.setAttribute('data-ro-aipick-num', String(num));
              a.addEventListener('click', function (e) {
                if (e && e.preventDefault) e.preventDefault();
                togglePick(slot.key, num);
              });
              grid.appendChild(a);
            })(n);
          }
          block.appendChild(grid);
          pickBox.appendChild(block);
        })(slots[i]);
      }
      drawPicker(g);
    }
    function drawPicker(g) {
      if (!pickBox) return;
      var slots = slotsOf(g), i, byKey = {};
      for (i = 0; i < slots.length; i++) byKey[slots[i].key] = slots[i];
      var cells = pickBox.querySelectorAll('.ro-aipick-pick');
      for (i = 0; i < cells.length; i++) {
        var k = attr(cells[i], 'data-ro-aipick-slot');
        var sl = byKey[k] || {};
        var sel = pickArr(k).indexOf(parseInt(attr(cells[i], 'data-ro-aipick-num'), 10)) >= 0;
        cells[i].className = 'ro-aipick-pick' + (sel ? ' on' : '') + (sl.color === 'blue' ? ' blue' : '');
      }
      var cnts = pickBox.querySelectorAll('.ro-aipick-pcount');
      for (i = 0; i < cnts.length; i++) {
        var k2 = attr(cnts[i], 'data-ro-aipick-slot');
        var sl2 = byKey[k2] || { need: 0 };
        var got = pickArr(k2).length;
        var txt = '已选 ' + got + ' 个';
        if (sl2.need > 0 && got < sl2.need) txt += '（最少 ' + sl2.need + ' 个，可多选成复式）';
        else if (sl2.need > 0 && got > sl2.need) txt += '（复式）';
        cnts[i].className = 'ro-aipick-pcount' + (sl2.need > 0 && got >= sl2.need ? ' full' : '');
        cnts[i].textContent = txt;
      }
    }
    function togglePick(key, num) {
      var arr = pickArr(key).slice();
      var at = arr.indexOf(num);
      if (at >= 0) arr.splice(at, 1); else arr.push(num);
      arr.sort(function (a, b) { return a - b; });
      st.pick[pkey(key)] = arr;
      drawPicker(G());
      applyPicks();                       /* 点完立刻算注数 + 更新结果区 */
    }
    /* 把已选的号变成「一条号码」：每个槽位都够最少个数才算完整 */
    function pickPlan(g) {
      var slots = slotsOf(g), sets = [], cnt = 1, i;
      for (i = 0; i < slots.length; i++) {
        var sel = pickArr(slots[i].key).slice();
        if (sel.length < slots[i].need) return null;
        sets.push(sel);
        cnt *= C(sel.length, slots[i].need);
      }
      return { sets: sets, count: cnt, slots: slots };
    }
    /* 「选几个」输入框跟着已选个数走 —— 这样顶部「合计 N 注」和结果区永远一致 */
    function syncMultiInputs(slots) {
      var i, ins = multiBox ? multiBox.querySelectorAll('.ro-aipick-in-multi') : [];
      for (i = 0; i < slots.length; i++) {
        var n = pickArr(slots[i].key).length;
        if (n > 0) st.multi[mkey(slots[i].key)] = n;
      }
      for (i = 0; i < ins.length; i++) {
        var k = attr(ins[i], 'data-ro-aipick-key');
        var v = st.multi[mkey(k)];
        if (typeof v === 'number' && ins[i].value !== String(v)) ins[i].value = String(v);
      }
    }
    /* 点格子 → 立刻生效：结果区一条号码 + 注数 + 「选几个」同步 */
    function applyPicks() {
      var g = G(), pp = pickPlan(g);
      if (!pp) {                          /* 还没选够 → 结果区保持原样，只提示差多少 */
        var slots0 = slotsOf(g), wait = [], q;
        for (q = 0; q < slots0.length; q++) {
          var got = pickArr(slots0[q].key).length;
          if (got < slots0[q].need) wait.push(slots0[q].label + '还差 ' + (slots0[q].need - got) + ' 个');
        }
        if (warnBox) {
          warnBox.textContent = wait.length ? ('自己选号：' + wait.join('、')) : '';
          show(warnBox, !!wait.length);
        }
        return;
      }
      if (pp.count > MAX_COMBO) {
        if (warnBox) {
          warnBox.textContent = '复式共 ' + pp.count + ' 注，超过上限 ' + MAX_COMBO + ' 注，请少选几个';
          show(warnBox, true);
        }
        return;
      }
      syncMultiInputs(pp.slots);
      st.rows = [{ kind: isDigit(g) ? 'digit' : 'number',
                   pos: isDigit(g) ? posOf(g) : null,
                   areas: isDigit(g) ? null : areasOf(g),
                   row: pp.sets, sets: pp.sets, count: pp.count, manual: true }];
      st.betCount = pp.count;
      drawOut();
      refresh();
    }
    /* 摇号出来的号也同步到格子（能看、能接着改） */
    function mirrorToPicks(p) {
      if (!p) return;
      var i;
      if (p.kind === 'number') {
        for (i = 0; i < (p.sets || []).length; i++) st.pick[pkey('a' + i)] = (p.sets[i] || []).slice();
      } else {
        for (i = 0; i < (p.sets || []).length; i++) st.pick[pkey('p' + i)] = (p.sets[i] || []).slice();
      }
      drawPicker(G());
    }
    function resetPicks() {
      st.pick = {};
      st.rows = [];
      st.betCount = 0;
      buildPicker(G());
      drawOut();
      refresh();
    }

    /* ---------- 出号 ---------- */
    function hitEl(hit, idx) {
      var row = el('div', 'ro-aipick-hit'), i, j;
      /* 【标签】手选 → 「手选」；折合多注的复式 → 「复式」；单式 → 「第 N 注」 */
      row.appendChild(el('span', 'ro-aipick-idx',
        hit.manual ? '手选'
          : ((hit.count && hit.count > 1) ? '复式' : ('第' + (idx + 1) + '注'))));
      if (hit.kind === 'number') {
        var areas = hit.areas || [];
        for (i = 0; i < areas.length; i++) {
          if (i > 0) row.appendChild(el('span', 'ro-aipick-sep', '+'));
          var a = areas[i], nums = hit.row[i] || [];
          for (j = 0; j < nums.length; j++) {
            /* 号码型（双色球/大乐透/七乐彩/快乐8）补两位；数字彩不补（0 就是「0」不是「00」） */
            row.appendChild(el('span', 'ro-aipick-ball' + (a.color === 'blue' ? ' blue' : ''),
              a.to > 9 ? pad2(nums[j]) : String(nums[j])));
          }
        }
      } else if (hit.sets && hit.sets.length) {
        /* 数字彩：一条号码 = 按【位置】分组画（百位那几个号 · 十位那几个号 · 个位那几个号） */
        for (i = 0; i < hit.sets.length; i++) {
          if (i > 0) row.appendChild(el('span', 'ro-aipick-possep', '·'));
          var sn = hit.sets[i] || [];
          for (j = 0; j < sn.length; j++) row.appendChild(el('span', 'ro-aipick-ball', String(sn[j])));
        }
      } else {
        var pos2 = hit.pos || [];
        for (i = 0; i < hit.row.length; i++) {
          if (pos2[i] && pos2[i].to === 14 && i === hit.row.length - 1) row.appendChild(el('span', 'ro-aipick-sep', '+'));
          row.appendChild(el('span', 'ro-aipick-ball', String(hit.row[i])));
        }
      }
      return row;
    }
    function drawOut() {
      if (!outBox) return;
      clearNode(outBox);
      if (!st.rows.length) {
        outBox.appendChild(el('div', 'ro-aipick-empty', '还没摇号，点「开始摇号」开始'));
        return;
      }
      var g = G();
      var betN = st.betCount || st.rows.length;
      outBox.appendChild(el('div', 'ro-aipick-sumline',
        '本轮 1 条号码 · 折合 ' + betN + ' 注 × ' + st.times + ' 倍 = ' +
        (betN * st.times * (g.price || 2)) + ' 元（模拟）'));
      var n = Math.min(st.rows.length, MAX_SHOW), i;
      for (i = 0; i < n; i++) outBox.appendChild(hitEl(st.rows[i], i));
      if (st.rows.length > n) {
        outBox.appendChild(el('div', 'ro-aipick-more',
          '只画前 ' + n + ' 注，其余 ' + (st.rows.length - n) + ' 注已省略'));
      }
    }

    function doRoll() {
      var g = G();
      readInputs();
      var p = plan(g);
      if (!p.ok) { refresh(); return 0; }
      var list = [], i;
      for (i = 0; i < p.rows.length; i++) {
        /* count 带下去：折合几注（复式）→ 行标签显示「复式」而不是「第1注」 */
        list.push({ kind: p.kind, pos: p.pos, areas: p.areas, row: p.rows[i], sets: p.sets, count: p.count });
      }
      st.rows = list;                 /* 一次摇出「一条号码」，整组替换 */
      st.betCount = p.count;          /* 折合注数（算钱用；一条号码可能是复式） */
      mirrorToPicks(p);               /* 摇出来的号同步到「自己选号」格子（能看能改） */
      drawOut();
      refresh();
      return list.length;
    }

    /* 按 data-ro-aipick-act 找按钮节点 */
    function actNode(a) {
      for (var i = 0; i < acts.length; i++) if (attr(acts[i], 'data-ro-aipick-act') === a) return acts[i];
      return null;
    }
    /* 【本轮改版】没有「选号来源」可切了：面板只剩一条路 ——
       在「选几个」里填每个区要选的个数 → 点「开始摇号」出号。
       这里只负责把该显示的行显示出来。 */
    function applySrc() {
      var g = G();
      show(lineMulti, true);                       /* 「选几个」输入行：始终显示 */
      show(lineTimes, true);
      show(actNode('roll'), true);
      show(actNode('reroll'), true);
      show(actNode('clear'), true);
      show(actNode('save'), true);
      show(actsBox, true);
      show(outBox, true);
      show(lineKl8, !!g.playModes);                /* 快乐8：先选玩法（玩法决定选几个） */
      drawOut();
      refresh();
    }

    function syncTabs() {
      var i, k;
      for (i = 0; i < gameTabs.length; i++) {
        k = attr(gameTabs[i], 'data-ro-aipick-game');
        gameTabs[i].className = 'ro-aipick-tab' + (k === st.game ? ' on' : '');
      }
      var kt = kl8Box ? kl8Box.querySelectorAll('.ro-aipick-kl8tab') : [];
      for (i = 0; i < kt.length; i++) {
        kt[i].className = 'ro-aipick-kl8tab' + (parseInt(attr(kt[i], 'data-ro-aipick-kl8'), 10) === st.kl8 ? ' on' : '');
      }
    }

    /* ---------- 事件 ---------- */
    for (var t1 = 0; t1 < gameTabs.length; t1++) {
      (function (node) {
        node.addEventListener('click', function (e) {
          if (e && e.preventDefault) e.preventDefault();
          var id = attr(node, 'data-ro-aipick-game');
          if (!byId[id] || id === st.game) return;
          /* 切彩种 → 全部重置 + 显示该彩种的规则（「选几个」也回到默认个数） */
          st.game = id;
          st.times = 1;
          st.kl8 = byId[id].playModes ? (byId[id].areas[0].pick || 10) : 10;
          st.multi = {};
          st.rows = [];
          st.pick = {};                    /* 自己勾的格子也跟着清（换彩种=换号池） */
          if (inTimes) inTimes.value = '1';
          buildKl8(byId[id]);
          buildMultiRow(byId[id]);
          buildPicker(byId[id]);           /* 自己选号：按新彩种重画格子 */
          syncTabs();
          applySrc();
        });
      })(gameTabs[t1]);
    }
    for (var t3 = 0; t3 < acts.length; t3++) {
      (function (node) {
        node.addEventListener('click', function (e) {
          if (e && e.preventDefault) e.preventDefault();
          var act = attr(node, 'data-ro-aipick-act');
          /* 清空：把已摇的号 + 自己勾的格子一起清掉 */
          if (act === 'clear') { st.rows = []; st.betCount = 0; st.pick = {}; drawPicker(G()); drawOut(); refresh(); }
          /* 清空重选：只清「自己选号」那套格子 */
          else if (act === 'reset') { resetPicks(); }
          else if (act === 'save') { saveImage(); }                       /* 保存图片：画图 + 全屏弹出 */
          /* 【自选模式】用户 2026-10-17：「加一个：自选 这样他们可以自己选自己看好的」——
             自选时「开始摇号」不生成随机号，直接用你点的号（applyPicks 会在不够时提示还差几个） */
          else if (st.src === 'manual') { applyPicks(); }
          else { doRoll(); }                                             /* 随机模式：开始摇号 / ：整组 */
        });
      })(acts[t3]);
    }

    /* ---------- 「随机 / 自选」两个 chip 的点击（用户 2026-10-17 要求加「自选」） ---------- */
    var srcBtns = root.querySelectorAll('[data-ro-aipick-src]');
    function syncSrc() {
      for (var i = 0; i < srcBtns.length; i++) {
        var on = attr(srcBtns[i], 'data-ro-aipick-src') === st.src;
        srcBtns[i].className = 'ro-aipick-srcbtn' + (on ? ' on' : '');
      }
    }
    for (var t4 = 0; t4 < srcBtns.length; t4++) {
      (function (node) {
        node.addEventListener('click', function (e) {
          if (e && e.preventDefault) e.preventDefault();
          st.src = attr(node, 'data-ro-aipick-src') === 'manual' ? 'manual' : 'random';
          syncSrc();
          if (st.src === 'manual') {
            /* 切到自选：清掉之前摇出来的号【和格子里的勾选】，让你从头点。
               ⚠️ 光清 st.rows 不够：摇号会把号镜像进格子（st.pick），
                  那些勾还在的话，再点几个会累加成超大复式 ——
                  实测：先摇 6+2、再点 5+2 → 变成 11+4 = 2772 注 5544 元。 */
            st.rows = []; st.betCount = 0; st.pick = {}; drawPicker(G());
            drawOut(); refresh();
            if (warnBox) { warnBox.textContent = '自选：点下面的号码，选够个数就算好注数'; show(warnBox, true); }
          } else {
            if (warnBox) show(warnBox, false);
            doRoll();                     /* 切回随机：立刻摇一组 */
          }
        });
      })(srcBtns[t4]);
    }
    if (inTimes) {
      /* 同 multiInput：不能在 input 事件里 refresh/夹取（那样打不出两位数）。
         只在失焦(change) 或回车时生效；聚焦时全选，直接打字即替换。 */
      inTimes.addEventListener('focus', function () { try { inTimes.select(); } catch (e) { /* 忽略 */ } });
      inTimes.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); refresh(); try { inTimes.blur(); } catch (e) { /* 忽略 */ } }
      });
      inTimes.addEventListener('change', refresh);
    }

    /* ---------- 初始状态：双色球 · 自己选号 · 红球 7 个 / 蓝球 1 个 · 倍数 1 · 结果为空 ---------- */
    (function setup() {
      var g = G();
      buildKl8(g);
      buildMultiRow(g);
      buildPicker(g);                     /* 自己选号：初始格子 */
      syncTabs();
      syncSrc();                          /* 「随机 / 自选」两个 chip 的高亮 */
      applySrc();
    })();

    /* 给验收脚本留一个干净入口（不影响页面行为） */
    window.__roAiPick = {
      state: function () {
        return { game: st.game, times: st.times, kl8: st.kl8, rows: st.rows.length,
                 multi: st.multi };
      },
      rows: function () { return st.rows; },
      lastImage: function () { return st.pic || null; }        /* 保存图片生成的最后一张（只在内存里） */
    };
  } catch (e) { /* 忽略：面板退化成静态说明，不影响页面其它部分 */ }
})();
</script>

<!-- __ANTISHOT_JS__ 防截图锁定（最终版）
     用户原话：「就是只能我这个本机可以截屏，别人不能」
     owner 判定（三条，先看协议再看 IP）：
       ⓪ 网址带 ?owner=1（或 ?admin=1 / ?shouquan=1）→ 直接当主人（兜底开关，不查 IP）
           · 电脑：本机 App / file:// / localhost 直接是主人（下面①）
           · 手机：手机流量是另一个公网 IP，命中不了固定 IP →
                   用带参数的链接打开，并把它收藏起来（以后每次打开都是主人）
           · ?admin=1 与设备门 device-gate.mjs 用的是同一个参数名，手机上只记一个
       ① location.protocol === 'file:'（或 Electron / localhost）→ 本机 App 打开 → 主人
       ② 浏览器打开 → 查公网 IP，命中固定 IP 才算主人
            （3 个源并行抢答 + 8 个源兜底，每源 3 秒超时，全失败每 3 秒重试，最多 3 轮）
            实测 2026-10-17：api.ipify.org 在用户网络下 ECONNRESET 连不上 → 只能放最后
     ⚠️ 不用 localStorage / sessionStorage / cookie（用户要求「所有都不能保存」）：
        owner 每次打开都重新判定，不落任何存储 —— IP 只记在一个内存变量里
        （否则别人在控制台里改一行就能解锁）。
     ⚠️ 判定失败 / 请求超时 → 保持「按别人处理」（安全降级）。
     ⚠️ 这套代码【不能真正禁止截图】，只能提高门槛：
        ✅ 能挡：切窗口 / 切标签页（失焦即模糊）、PrintScreen、Win+Shift+S、
                macOS Cmd+Shift+3·4·5、右键、拖拽、复制、剪切、F12、Ctrl+Shift+I·J·C、Ctrl+U
        ❌ 挡不住：手机自带截图（不触发任何事件）、已经冻结屏幕的截图工具、
                录屏软件、另一台手机拍屏、禁用 JS 之后
        ❌ IP 判定也有局限：家宽 IP 会变、手机流量是另一个 IP、走代理也会变
        → 真正「截出来全黑」只有 App 端 Electron setContentProtection(true) 能做到。
     ⚠️ 必须放在本模板的 </body> 之前（模板字符串内部）；不许用裸按钮标签。 -->
<script>
(function () {
  'use strict';
  try {
    var OWNER_IP = '120.231.138.19';
    var root = document.documentElement;
    var lockTimer = null;
    var owner = false;                     /* 默认按「别人」处理：先按最严的来，安全降级 */

    function lock() {
      if (owner) return;
      root.classList.add('locked');
      if (lockTimer) clearTimeout(lockTimer);
      lockTimer = setTimeout(unlock, 4000);        /* 4 秒后自动解锁 */
    }
    function unlock() {
      if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
      root.classList.remove('locked');
    }
    function clearClipboard() {
      if (owner) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('').catch(function () { /* 忽略 */ });
        }
      } catch (e) { /* 忽略 */ }
    }
    function isShotKey(e) {
      if (!e) return false;
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') return true;
      if (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5')) return true;
      if (e.metaKey && e.shiftKey && (e.key === 's' || e.key === 'S')) return true;
      return false;
    }
    /* 【已删除】原来这里有一个画水印的函数：用户明确说「不要水印」，
       水印（DOM + 样式 + 函数 + 所有调用）已整块拿掉。 */
    /* ============================================================
       【保存权限】三处允许保存、其余一律禁止（用户要求）
       ------------------------------------------------------------
       ✅ 允许：① 晒票（实票图，外链 <img>）② GPT模型摇号出的图
        （以后新加的区块只要带上 class="allow-save" 就自动放行 ——
          分享页现在没有别的可保存区块）
       ❌ 禁止：推荐图 / 资料、最新开奖、开机号、直播、文章正文、免责……
       判断：事件目标往上找，命中 .allow-save 就算放行；
             全屏看图层再看 view 上的 data-allow（openUrl 传 true = 放行，
             推荐图走 open() → data-allow=0 = 拦）。
       ✅ 白名单命中的一律 return（不 preventDefault）。
       ============================================================ */
    function allowedTarget(e) {
      var n = e && e.target;
      while (n && n.nodeType === 1) {
        if (n.classList && n.classList.contains && n.classList.contains('allow-save')) return true;
        if (n.classList && n.classList.contains && n.classList.contains('ro-mob-view')) {
          return String(n.getAttribute('data-allow') || '0') === '1';
        }
        n = n.parentNode;
      }
      return false;
    }
    function armProtection() {
      window.addEventListener('blur', function () { lock(); });
      window.addEventListener('focus', function () { unlock(); });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) lock(); else unlock();
      });
      window.addEventListener('keydown', function (e) {
        if (owner) return;
        if (isShotKey(e)) { lock(); clearClipboard(); }
      });
      window.addEventListener('keyup', function (e) {
        if (owner) return;
        if (isShotKey(e)) { lock(); clearClipboard(); }
      });
      /* 开发者工具入口（照抄用户给的键位） */
      document.addEventListener('keydown', function (e) {
        if (owner) return;
        if (e.key === 'F12') { e.preventDefault(); lock(); return; }
        if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].indexOf(e.key) >= 0) {
          e.preventDefault(); lock(); return;
        }
        if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); }
      });
      /* 保存相关的拦截：白名单以外全部拦掉 */
      document.addEventListener('contextmenu', function (e) { if (!allowedTarget(e)) e.preventDefault(); });
      document.addEventListener('dragstart', function (e) { if (!allowedTarget(e)) e.preventDefault(); });
      document.addEventListener('copy', function (e) { if (!allowedTarget(e)) e.preventDefault(); });
      document.addEventListener('cut', function (e) { if (!allowedTarget(e)) e.preventDefault(); });
      document.addEventListener('selectstart', function (e) { if (!allowedTarget(e)) e.preventDefault(); });
    }
    /* 是不是点分十进制 IPv4（故意不用正则：正则里的 \d 写进模板字符串会被吃掉） */
    function isIPv4(s) {
      var p = String(s).trim().split('.');
      if (p.length !== 4) return false;
      for (var i = 0; i < 4; i++) {
        var n = p[i];
        if (!n.length || n.length > 3) return false;
        for (var j = 0; j < n.length; j++) {
          var c = n.charCodeAt(j);
          if (c < 48 || c > 57) return false;
        }
      }
      return true;
    }
    /* ① 本机 App / 本机地址：file:// 或 Electron / localhost —— 100% 可靠，不看 IP
       （2026-10-17 放宽：App 里可能不是 file://，只要是本机 App 就算主人） */
    function isLocalApp() {
      try {
        if (String(location.protocol) === 'file:') return true;
        var h = String(location.hostname || '');
        if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return true;
        if (String(navigator.userAgent || '').indexOf('Electron') >= 0) return true;
      } catch (e) { /* 忽略 */ }
      return false;
    }
    /* 【强制主人】网址带 ?owner=1 → 直接算主人，不查 IP、不发任何请求（兜底开关）
       ⚠️ 名字故意不起眼；别人不知道这个参数，照样看不到热度计数。
       【2026-10-20 扩到手机】用户：「只有我电脑和我手机能看到 你同步一下」
         · ?admin=1 和 ?owner=1 完全等价 —— device-gate.mjs 的设备门本来就用
           admin=1 这套参数名，手机上前后一致、只记一个参数名。
         · ?shouquan=1 是设备门那边的老写法，一并认（免得以为按钮坏了）。
         ⚠️ 仍然【不写 localStorage / sessionStorage / cookie】（用户铁律：
            「所有都不能保存」）→ 手机上就是把带参数的链接收藏起来，
            每次打开都带着参数，判定结果和收藏的链接一样。
         ⚠️ 手机流量是另一个公网 IP，命中不了固定 IP，所以手机必须带参数。 */
    function forcedOwner() {
      try {
        var q = String(location.search || '');
        if (q.charAt(0) === '?') q = q.slice(1);
        var hh = String(location.hash || '');
        if (hh.charAt(0) === '#') hh = hh.slice(1);
        var all = '&' + q + '&' + hh + '&';
        return all.indexOf('&owner=1&') >= 0
          || all.indexOf('&admin=1&') >= 0
          || all.indexOf('&shouquan=1&') >= 0;
      } catch (e) { return false; }
    }
    /* ② 浏览器打开：查公网 IP —— 多源【并行】兜底（每源 3 秒超时）
       2026-10-17 实测（用户网络 · 每个源都验了 HTTP/耗时/能否解析）：
         ifconfig.me 331ms | ipecho.net 367ms | ipinfo.io 371ms | api.ip.sb 492ms
         ipwho.is 551ms | icanhazip 565ms | api64.ipify 604ms | bigdatacloud 610ms
         myip.wtf 962ms(偶尔超时) | checkip.amazonaws 311ms(CORS 靠 Origin 头)
         api.ipify.org → 实测 ECONNRESET，连不上 → 只能放最后
       已淘汰：ipapi.co(403) · api.myip.com(3s 超时) · ip.seeip.org(3s 超时)
       前三名并行抢答，谁先成功用谁 → 判定时间从「最坏 16 秒」降到约 0.4 秒。 */
    var IP_CACHE = null;            /* 【只在内存里】本次会话记下的 IP —— 不碰任何持久化存储 */
    var IP_PENDING = null;          /* 并发去重：多处同时要 IP 时共用同一个 Promise */
    var IP_TIMEOUT = 3000;          /* 每源 3 秒（原来是 4 秒）：更快失败、更快换下一个 */
    var IP_WAVE1 = [
      { url: 'https://ifconfig.me/all.json', json: 'ip_addr' },
      { url: 'https://ipecho.net/plain', text: 1 },
      { url: 'https://ipinfo.io/json', json: 'ip' }
    ];
    var IP_WAVE2 = [
      { url: 'https://api.ip.sb/jsonip', json: 'ip' },
      { url: 'https://ipwho.is/', json: 'ip' },
      { url: 'https://icanhazip.com', text: 1 },
      { url: 'https://api64.ipify.org?format=json', json: 'ip' },
      { url: 'https://api.bigdatacloud.net/data/client-ip', json: 'ipString' },
      { url: 'https://checkip.amazonaws.com', text: 1 },
      { url: 'https://myip.wtf/json', json: 'YourFuckingIPAddress' },
      { url: 'https://api.ipify.org?format=json', json: 'ip' }
    ];
    /* 取第一段非空白（纯文本源返回的就是 IP，可能带换行）—— 故意不用正则：
       这段脚本写在模板字符串里，正则的反斜杠转义会被吃掉 */
    function firstToken(s) {
      var t = String(s == null ? '' : s), out = '';
      for (var i = 0; i < t.length; i++) {
        var c = t.charCodeAt(i);
        if (c === 32 || c === 9 || c === 10 || c === 13) { if (out) break; else continue; }
        out += t.charAt(i);
      }
      return out;
    }
    function fetchIP(s) {
      var ctl = null, timer = null;
      try {
        ctl = new AbortController();
        timer = setTimeout(function () { try { ctl.abort(); } catch (e2) { /* 忽略 */ } }, IP_TIMEOUT);
      } catch (e) { ctl = null; }
      return fetch(s.url, ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' })
        .then(function (res) {
          if (timer) { clearTimeout(timer); timer = null; }
          if (!res || !res.ok) return '';
          return res.text();
        })
        .then(function (body) {
          if (!body) return '';
          if (s.text) return firstToken(body);
          var j = null;
          try { j = JSON.parse(body); } catch (e) { j = null; }
          return j ? String(j[s.json] || '').trim() : '';
        })
        .catch(function () {
          if (timer) { clearTimeout(timer); timer = null; }
          return '';
        });
    }
    /* 一组源【同时发出】，第一个解析出 IPv4 的胜出；全失败才返回空 */
    function raceWave(list) {
      if (!list.length) return Promise.resolve('');
      return new Promise(function (resolve) {
        var done = false, left = list.length;
        list.forEach(function (s) {
          fetchIP(s).then(function (ip) {
            if (done) return;
            if (isIPv4(ip)) { done = true; resolve(ip); return; }
            left--;
            if (left <= 0) { done = true; resolve(''); }
          });
        });
      });
    }
    function lookupIPOnce() {
      return raceWave(IP_WAVE1).then(function (ip) {
        if (ip) return ip;
        return raceWave(IP_WAVE2);       /* 第一组全军覆没才打第二组 */
      });
    }
    /* ③ 全部失败 → 每 3 秒重试一次，最多 3 轮（不卡页面：全程异步） */
    function getVisitorIP() {
      if (IP_CACHE) return Promise.resolve(IP_CACHE);
      if (IP_PENDING) return IP_PENDING;
      var rounds = 0;
      function attempt() {
        rounds++;
        return lookupIPOnce().then(function (ip) {
          if (ip) { IP_CACHE = ip; IP_PENDING = null; return ip; }
          if (rounds >= 3) { IP_PENDING = null; return ''; }
          return new Promise(function (r) { setTimeout(r, 3000); }).then(attempt);
        });
      }
      IP_PENDING = attempt();
      return IP_PENDING;
    }
    /* 给验收脚本留一个只读入口（不影响页面行为） */
    window.__roOwner = {
      ip: function () { return IP_CACHE; },
      isOwner: function () { return owner; },
      forced: forcedOwner,
      local: isLocalApp
    };
    function markOwner() {
      owner = true;
      unlock();
      root.classList.add('is-owner');       /* 右上角出现「管理员模式」徽章 */
    }

    /* 先按「别人」把保护装上；查到是主人再撤掉
       （owner 判定失败 → 保持最严 = 安全降级）。
       ⚠️ 这里不再画水印：用户明确说「不要水印」。
       判定顺序：本机 App → ?owner=1 → 查公网 IP（3 组并行 + 3 轮重试）。
       热度计数（.ro-hot）挂的是同一个 html.is-owner：
       is-owner 一加上，热度计数立刻显示，不需要刷新。 */
    armProtection();

    if (isLocalApp()) {
      markOwner();                          /* 本机 App：不用联网，立刻生效 */
    } else if (forcedOwner()) {
      markOwner();                          /* ?owner=1：兜底开关，不查 IP、零请求 */
    } else {
      getVisitorIP().then(function (ip) {
        if (ip && ip === OWNER_IP) markOwner();
        /* 查不到 → 保持按「别人」处理（安全降级）；
           想强开就加 ?owner=1 */
      }).catch(function () { /* 忽略：查不到 → 保持按「别人」处理 */ });
    }
  } catch (e) { /* 忽略：防截图这段挂了，页面照样能正常看 */ }
})();
</script>

<!-- __HOT_OWNER__ 热度计数（只有 owner 会看到；拿不到就隐藏） -->
<script>
${fs.readFileSync(path.join(ROOT, 'visitor-counter.js'), 'utf8')}
</script>
${INSTALL_HTML}
${INSTALL_JS}
${CHAT_HTML_SHARE}
${CHAT_JS_SHARE}
<div class="tool-view" id="toolView" role="dialog" aria-label="智能分析">
  <div class="tool-view-head"><span class="tool-back" role="button" tabindex="0" id="toolBack">← 返回</span><span class="tool-view-title" id="toolTitle">详情</span></div>
  <div class="tool-view-body" id="toolBody"></div>
</div>
<script>
/* __TOOLS_JS__ 智能分析 · 8 个子页面
   ------------------------------------------------------------
   数据纪律（用户铁律）：【绝对不编数字】
     · 能算的 → 页面脚本从本页已有的开奖数据（DRAW_HISTORY，8 彩种 × 近 60 期）
                和实票统计（HEATMAP_DATA）里【现算】
     · 算不出的 → 页面直接写「暂不支持 / 需要更多数据」，不写假数字
     · AI推荐 → 就是【系统随机】，页面上明确标注「仅供娱乐参考」，不假装是 AI 算的
   技术约束：
     · 零外部依赖（折线用内联 SVG 画，不引图表库）
     · 不碰浏览器存储（聊天/状态只放内存变量 st，刷新就没了）
     · 没有弹窗（提示一律写在页面里，微信里也看得见）
     · 没有按钮标签（可点的都是 div role="button" tabindex="0"）
   写法约束：这段嵌在页面的模板字符串里 ——
     ⚠️【只用单引号】【不写反斜杠转义】【不写反引号】，
        否则会在生成时被吃掉（之前踩过两次）。 */
(function () {
  var view = document.getElementById('toolView');
  var body = document.getElementById('toolBody');
  var titleEl = document.getElementById('toolTitle');
  if (!view || !body) return;

  /* 构建期注入：8 个彩种的号码区间 / 位数（来自 games.js 的真配置） */
  var GAMES = ${TOOL_GAMES_JS};
  /* 构建期算好的「本期推荐号码」（多源共振打分 · 种子 = 下一期期号）
     —— 8 个子页面最底部都渲染它；切彩种时按 gid 换一份，跟着变。 */
  var REC = ${REC_JS};
  var TITLES = { stat: '数据统计', trend: '趋势分析', hot: '实时热点', ma: '杀号和选号', index: '指数预测', omit: '遗漏宝', pattern: '智能规律', ai: 'AI推荐' };
  var SPAN = 30;
  var st = { id: 'stat', game: 'ssq', area: '', ai: null, aiTimes: 0,
    tqTab: '', tq: '', mqTab: 'kill', mq: '', ixTab: '', pqTab: '', pq: '', pickGame: true, _keep: 0 };

  var HIST = null;
  try { if (typeof DRAW_HISTORY !== 'undefined' && DRAW_HISTORY && DRAW_HISTORY.games) HIST = DRAW_HISTORY.games; } catch (e0) { HIST = null; }
  var HM = null;
  try { if (typeof HEATMAP_DATA !== 'undefined' && HEATMAP_DATA && HEATMAP_DATA.games) HM = HEATMAP_DATA.games; } catch (e1) { HM = null; }

  /* ---------------- 基础工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt1(n) {
    if (n == null || isNaN(n)) return '—';
    return (Math.round(n * 10) / 10).toFixed(1);
  }
  function pctS(a, b) { return b ? fmt1(a * 100 / b) + '%' : '—'; }
  function row(k, v) { return '<div class="tv-row"><span class="tv-k">' + k + '</span><span class="tv-v">' + v + '</span></div>'; }
  function card(h, inner) { return '<div class="tv-card">' + (h ? '<div class="tv-h">' + h + '</div>' : '') + inner + '</div>'; }
  function note(t) { return '<div class="tv-note">' + t + '</div>'; }
  function none(h, t) { return '<div class="tv-none"><b>' + h + '</b>' + t + '</div>'; }

  function gameById(id) {
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i];
    return GAMES[0];
  }
  function drawsOf(id) { var a = HIST ? HIST[id] : null; return (a && a.length) ? a : []; }
  function numsOf(d, key) { var a = (d && d.areas) ? d.areas[key] : null; return (a && a.length) ? a : []; }
  function areaCfg(g, key) {
    for (var i = 0; i < g.areas.length; i++) if (g.areas[i].key === key) return g.areas[i];
    return g.areas[0];
  }
  function curArea(g) {
    var want = st.area;
    for (var i = 0; i < g.areas.length; i++) if (g.areas[i].key === want) return want;
    return g.areas[0] ? g.areas[0].key : 'main';
  }
  function areaLabel(g, key) {
    var c = areaCfg(g, key);
    return c.label || key;
  }
  function areaIdx(g) {
    var k = curArea(g);
    for (var i = 0; i < g.areas.length; i++) if (g.areas[i].key === k) return i;
    return 0;
  }
  function splitAt(cfg) { return cfg.from + Math.floor((cfg.to - cfg.from + 1) / 2) - 1; }

  /* ---------------- 统计：奇偶 / 大小 / 和值 / 跨度 / 012路 ---------------- */
  function statOf(gid, n) {
    var g = gameById(gid), key = curArea(g), cfg = areaCfg(g, key);
    var list = drawsOf(gid).slice(0, n);
    var o = { n: 0, cnt: 0, odd: 0, even: 0, big: 0, small: 0, sum: 0, sumMin: 0, sumMax: 0,
      span: 0, r0: 0, r1: 0, r2: 0, rows: [], ok: false };
    var split = splitAt(cfg);
    for (var i = 0; i < list.length; i++) {
      var nums = numsOf(list[i], key);
      if (!nums.length) continue;
      var s = 0, mx = -1e9, mn = 1e9;
      for (var j = 0; j < nums.length; j++) {
        var v = nums[j];
        s += v; o.cnt++;
        if (v % 2) o.odd++; else o.even++;
        if (v > split) o.big++; else o.small++;
        if (v % 3 === 0) o.r0++; else if (v % 3 === 1) o.r1++; else o.r2++;
        if (v > mx) mx = v;
        if (v < mn) mn = v;
      }
      o.n++; o.sum += s;
      if (o.n === 1 || s < o.sumMin) o.sumMin = s;
      if (o.n === 1 || s > o.sumMax) o.sumMax = s;
      o.span += (mx - mn);
      o.rows.push({ issue: String(list[i].issue || ''), nums: nums, sum: s, span: mx - mn });
      o.ok = true;
    }
    o.split = split;
    return o;
  }

  /* ---------------- 遗漏：每个号码已经多少期没出 ---------------- */
  function omitOf(gid) {
    var g = gameById(gid), key = curArea(g), cfg = areaCfg(g, key);
    var list = drawsOf(gid), res = [];
    var total = cfg.to - cfg.from + 1, perDraw = 0;
    for (var i = 0; i < list.length; i++) {
      var nn = numsOf(list[i], key);
      if (nn.length) { perDraw = nn.length; break; }
    }
    var theo = perDraw ? total / perDraw : 0;
    for (var v = cfg.from; v <= cfg.to; v++) {
      var cur = -1, gap = 0, mxGap = 0, seen = 0;
      for (var k = 0; k < list.length; k++) {
        var nums = numsOf(list[k], key);
        if (nums.indexOf(v) >= 0) {
          if (cur < 0) cur = k;
          seen++; gap = 0;
        } else {
          gap++;
          if (gap > mxGap) mxGap = gap;
        }
      }
      if (cur < 0) cur = list.length;
      res.push({ n: v, cur: cur, max: mxGap, seen: seen });
    }
    return { list: res, theo: theo, total: total, perDraw: perDraw, draws: list.length };
  }

  /* ---------------- 频次（热号 / 冷号） ---------------- */
  function freqOf(gid, n) {
    var g = gameById(gid), key = curArea(g), cfg = areaCfg(g, key);
    var list = drawsOf(gid).slice(0, n), map = {}, total = 0;
    for (var v = cfg.from; v <= cfg.to; v++) map[v] = 0;
    for (var i = 0; i < list.length; i++) {
      var nums = numsOf(list[i], key);
      for (var j = 0; j < nums.length; j++) {
        if (map[nums[j]] === undefined) map[nums[j]] = 0;
        map[nums[j]]++; total++;
      }
    }
    var arr = [];
    for (var k in map) if (map.hasOwnProperty(k)) arr.push({ n: Number(k), c: map[k] });
    arr.sort(function (a, b) { return (b.c - a.c) || (a.n - b.n); });
    return { arr: arr, total: total, draws: list.length };
  }

  /* 实票统计里这个彩种对应的那块（前区 / 后区） */
  function hmAreaOf(gid, ai) {
    var H = HM ? HM[gid] : null;
    if (!H) return null;
    var a = ai === 0 ? H.front : (ai === 1 ? H.back : null);
    if (!a || !a.items || !a.items.length) return null;
    return a;
  }

  /* ---------------- 规律：连号 / 重号 / 同尾 / 奇偶分布 ---------------- */
  function patternOf(gid, n) {
    var g = gameById(gid), key = curArea(g);
    var list = drawsOf(gid).slice(0, n);
    var used = 0, withConsec = 0, consecPairs = 0, repeatSum = 0, repeatN = 0, sameTail = 0;
    var oddDist = {};
    for (var i = 0; i < list.length; i++) {
      var nums = numsOf(list[i], key).slice().sort(function (a, b) { return a - b; });
      if (!nums.length) continue;
      used++;
      var pairs = 0;
      for (var j = 1; j < nums.length; j++) if (nums[j] - nums[j - 1] === 1) pairs++;
      if (pairs > 0) withConsec++;
      consecPairs += pairs;
      var tail = {};
      for (var t = 0; t < nums.length; t++) {
        var d = nums[t] % 10;
        tail[d] = (tail[d] || 0) + 1;
      }
      for (var q in tail) if (tail.hasOwnProperty(q) && tail[q] > 1) sameTail++;
      if (i > 0) {
        var pn = numsOf(list[i - 1], key), rep = 0;
        for (var r = 0; r < nums.length; r++) if (pn.indexOf(nums[r]) >= 0) rep++;
        repeatSum += rep; repeatN++;
      }
      var oddc = 0;
      for (var w = 0; w < nums.length; w++) if (nums[w] % 2) oddc++;
      oddDist[oddc] = (oddDist[oddc] || 0) + 1;
    }
    var bestOdd = 0, bestCnt = -1;
    for (var ok in oddDist) {
      if (oddDist.hasOwnProperty(ok) && oddDist[ok] > bestCnt) { bestCnt = oddDist[ok]; bestOdd = Number(ok); }
    }
    return { used: used, withConsec: withConsec, consecPairs: consecPairs,
      repeatAvg: repeatN ? repeatSum / repeatN : 0,
      sameTail: sameTail, bestOdd: bestOdd, bestCnt: bestCnt, oddDist: oddDist };
  }

  /* ---------------- 和值序列 + 移动平均（均线用） ---------------- */
  function sumSeries(gid, n) {
    var g = gameById(gid), key = curArea(g);
    var list = drawsOf(gid).slice(0, n), sums = [];
    for (var i = list.length - 1; i >= 0; i--) {
      var nums = numsOf(list[i], key);
      if (!nums.length) continue;
      var s = 0;
      for (var j = 0; j < nums.length; j++) s += nums[j];
      sums.push(s);
    }
    return sums;
  }
  function maSeries(sums, k) {
    var out = [];
    for (var i = 0; i < sums.length; i++) {
      if (i < k - 1) { out.push(null); continue; }
      var t = 0;
      for (var q = i - k + 1; q <= i; q++) t += sums[q];
      out.push(t / k);
    }
    return out;
  }

  /* ---------------- 内联 SVG 折线（不引图表库） ---------------- */
  function spark(a, b, aLabel, bLabel) {
    var all = [], i;
    for (i = 0; i < a.length; i++) if (a[i] != null) all.push(a[i]);
    if (b) for (i = 0; i < b.length; i++) if (b[i] != null) all.push(b[i]);
    if (!all.length) return '';
    var mn = all[0], mx = all[0];
    for (i = 1; i < all.length; i++) {
      if (all[i] < mn) mn = all[i];
      if (all[i] > mx) mx = all[i];
    }
    if (mx === mn) mx = mn + 1;
    var W = 320, H = 96, P = 8, n = a.length;
    function pts(arr) {
      var s = '', started = false;
      for (var k = 0; k < arr.length; k++) {
        if (arr[k] == null) continue;
        var x = n > 1 ? (P + k * (W - 2 * P) / (n - 1)) : (W / 2);
        var y = H - P - ((arr[k] - mn) / (mx - mn)) * (H - 2 * P);
        s += (started ? ' ' : '') + (Math.round(x * 10) / 10) + ',' + (Math.round(y * 10) / 10);
        started = true;
      }
      return s;
    }
    var svg = '<svg class="tv-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      (b ? '<polyline points="' + pts(b) + '" fill="none" stroke="#c9973f" stroke-width="1.6" stroke-dasharray="5 3"/>' : '') +
      '<polyline points="' + pts(a) + '" fill="none" stroke="#1a8c5a" stroke-width="1.8"/>' +
      '</svg>';
    var first = a[0], last = a[a.length - 1];
    svg += '<div class="tv-spark-x"><span>最低 ' + Math.round(mn) + ' · 最高 ' + Math.round(mx) + '</span><span>最新 ' + last + '</span></div>';
    if (b) {
      svg += '<div class="tv-legend"><span><i style="background:#1a8c5a"></i>' + aLabel + '</span>' +
        '<span><i style="background:#c9973f"></i>' + bLabel + '</span></div>';
    }
    return svg;
  }

  /* ---------------- 顶部：彩种 / 号码区 切换 ---------------- */
  function chipsGame() {
    var h = '<div class="tv-seg">';
    for (var i = 0; i < GAMES.length; i++) {
      h += '<div class="tv-chip' + (GAMES[i].id === st.game ? ' on' : '') + '" role="button" tabindex="0" data-tv-game="' + esc(GAMES[i].id) + '">' + esc(GAMES[i].name) + '</div>';
    }
    return h + '</div>';
  }
  function chipsArea(g) {
    if (g.areas.length < 2) return '';
    var h = '<div class="tv-seg">', k = curArea(g);
    for (var i = 0; i < g.areas.length; i++) {
      h += '<div class="tv-chip' + (g.areas[i].key === k ? ' on' : '') + '" role="button" tabindex="0" data-tv-area="' + esc(g.areas[i].key) + '">' + esc(g.areas[i].label || ('区' + (i + 1))) + '</div>';
    }
    return h + '</div>';
  }
  function numsCell(nums) {
    var n = nums.slice(0, 6).join(' ');
    return n + (nums.length > 6 ? ' …' : '');
  }

  /* ================= 🎯 本期推荐号码（8 个子页面最底部都有） =================
     用户 2026-10-18：「我不管你用自己的模板ai一套计算方式 都要在下面按照我的
     要求出号码」+「自己的算法 每期都变」。
     · 号码在构建时按「多源共振打分」算好（REC），页面只负责显示
     · 种子 = 下一期期号：同一期永远同一组（刷新 / 换设备都一样），
       期号 +1 或换彩种 → 换一组
     · 切彩种（顶部胶囊）→ render() 重画 → 这里的 gid 变了，号码跟着变 */
  function pad2(n) { var s = String(n); return s.length < 2 ? '0' + s : s; }
  function recBlock(gid, extra) {
    var R = (REC && REC[gid]) ? REC[gid] : null;
    if (!R || !R.blocks || !R.blocks.length) return '';
    var h = '<div class="tv-rec" data-gid="' + esc(gid) + '">';
    h += '<div class="tv-rec-h">🎯 本期推荐号码<span>' + esc(R.name) + ' · 第 ' + esc(R.issue) + ' 期</span></div>';
    for (var i = 0; i < R.blocks.length; i++) {
      var b = R.blocks[i];
      h += '<div class="tv-rec-row"><span class="tv-rec-k">' + esc(b.label) + '</span><div class="tv-balls">';
      for (var j = 0; j < b.nums.length; j++) {
        var cls = (b.kind === 'digit') ? 'tv-ball digit' : ('tv-ball' + (b.color === 'blue' ? ' blue' : ''));
        var txt = (b.kind === 'digit') ? String(b.nums[j]) : pad2(b.nums[j]);
        h += '<div class="' + cls + '">' + esc(txt) + '</div>';
      }
      h += '</div></div>';
    }
    h += '<div class="tv-rec-basis">打分口径：' + esc(R.basis) +
      '；统计窗口 近 ' + esc(R.span) + ' 期</div>';
    if (extra) h += '<div class="tv-rec-basis">' + extra + '</div>';
    h += '<div class="tv-rec-warn">⚠️ 仅供参考，不保证中奖</div>';
    h += '</div>';
    return h;
  }

  /* 无头圆球（TQ 新模板的那几张底部卡也用它）：同一个彩种同一期 →
     8 个子页面拿到的永远是同一组号（都读构建期算好的 REC） */
  function recBallsHtml(nums, kind, color) {
    var cls = (kind === 'digit') ? 'digit' : (color === 'blue' ? 'blue' : 'red');
    var h = '<div class="tq-balls">';
    for (var i = 0; i < nums.length; i++) {
      var txt = (kind === 'digit') ? String(nums[i]) : pad2(nums[i]);
      h += '<div class="tq-ball ' + cls + '">' + esc(txt) + '</div>';
    }
    return h + '</div>';
  }
  /* 统一号码卡：趋势分析 / 杀号和选号 / 指数预测 / 智能规律 这 4 张底部卡
     统统改成读 REC —— 8 个页面同彩种同期号码完全一致，不再各算一套。 */
  function tqRecUnified(gid, title) {
    var R = (REC && REC[gid]) ? REC[gid] : null;
    if (!R || !R.blocks || !R.blocks.length) return '';
    var h = '<div class="tq-rec" data-gid="' + esc(gid) + '"><div class="tq-rec-h">' + (title || '🎯 本期推荐号码') +
      '<span>第 ' + esc(R.issue) + ' 期</span></div>';
    for (var i = 0; i < R.blocks.length; i++) {
      var b = R.blocks[i];
      h += '<div class="tq-rec-row"><span class="tq-rec-k">' + esc(b.label) + '</span>' +
        recBallsHtml(b.nums, b.kind, b.color) + '</div>';
    }
    h += '<div class="tq-rec-basis">打分口径：' + esc(R.basis) + '；统计窗口 近 ' + esc(R.span) + ' 期</div>';
    h += '<div class="tq-warn">⚠️ 仅供参考，不保证中奖</div>';
    return h + '</div>';
  }

  /* ================= ① 数据统计 ================= */
  function pageStat() {
    var g = gameById(st.game), key = curArea(g);
    var a = statOf(g.id, SPAN), b = statOf(g.id, 10);
    if (!a.ok) return chipsGame() + none('样本不足', '这个彩种本页还没有足够的开奖数据。');
    var h = chipsGame() + chipsArea(g);
    h += card('近 ' + a.n + ' 期 · ' + esc(g.name) + ' ' + esc(areaLabel(g, key)),
      row('奇偶比', '奇 ' + a.odd + ' : 偶 ' + a.even + '（' + pctS(a.odd, a.cnt) + ' / ' + pctS(a.even, a.cnt) + '）') +
      row('大小比', '大 ' + a.big + ' : 小 ' + a.small + '（小 ≤ ' + a.split + '）') +
      row('和值 均值', fmt1(a.sum / a.n)) +
      row('和值 区间', a.sumMin + ' ~ ' + a.sumMax) +
      row('跨度 均值', fmt1(a.span / a.n)) +
      row('012 路', '0路 ' + a.r0 + ' · 1路 ' + a.r1 + ' · 2路 ' + a.r2));
    if (b.ok) {
      h += card('近 ' + b.n + ' 期 · 同一口径',
        row('奇偶比', '奇 ' + b.odd + ' : 偶 ' + b.even) +
        row('大小比', '大 ' + b.big + ' : 小 ' + b.small) +
        row('和值 均值', fmt1(b.sum / b.n)) +
        row('跨度 均值', fmt1(b.span / b.n)) +
        row('012 路', '0路 ' + b.r0 + ' · 1路 ' + b.r1 + ' · 2路 ' + b.r2));
    }
    var t = '<table class="tv-tbl"><thead><tr><th>期号</th><th>号码</th><th>和值</th><th>跨度</th></tr></thead><tbody>';
    for (var i = 0; i < Math.min(6, a.rows.length); i++) {
      var r0 = a.rows[i];
      t += '<tr><td>' + esc(r0.issue) + '</td><td class="l">' + esc(numsCell(r0.nums)) + '</td><td>' + r0.sum + '</td><td>' + r0.span + '</td></tr>';
    }
    t += '</tbody></table>';
    h += card('最近 6 期明细', t);
    h += note('全部按近 ' + SPAN + ' 期内真实开出的号码现算；大小以「' + areaCfg(g, key).from + '~' + areaCfg(g, key).to + '」的中位划分。');
    h += recBlock(g.id);
    return h;
  }

  /* ================= ② 趋势分析（按用户截图完全改版） =================
     ------------------------------------------------------------
     模板（用户给的两张截图）：
       ← 返回   <彩种>趋势分析 ⌄      ← ⌄ 在标题上，点了展开彩种选择
       【红球】|【蓝球】两个 Tab（选中橙色下划线）
       【基础趋势】[免费查看]  → 一排浅粉底 / 深红字的小圆角按钮
       【VIP 趋势】深棕横条 + 👑 → 分组标题 + 每组一排小圆角按钮
       点任意按钮 → 按钮下方立即展开一块分析结果（再点收起，不弹窗不跳页）
       底部：🎯 本期推荐号码（种子 = 下一期期号 → 同期固定 / 换期全变）
     数据：全部按本页已有的近 30 期现算 —— 每次开奖后重建页面，数字自动跟着变。
     数字彩没有红蓝球 → Tab 换成 百位 / 十位 / 个位（排列5 五位、七星彩 前六位 / 最后一位）。
     ⚠️ 这段在模板字符串里：只写单引号，不写反引号，不写代码里的反斜杠。
     ============================================================ */

  function tqPrime(v) {
    if (v < 2) return false;
    for (var i = 2; i * i <= v; i++) if (v % i === 0) return false;
    return true;
  }
  function tqPct(a, b) { return b ? fmt1(a * 100 / b) + '%' : '0%'; }
  function tqKV(k, v) {
    return '<div class="tq-kv"><span>' + k + '</span><b>' + v + '</b></div>';
  }
  function tqLines(pairs) {
    var h = '';
    for (var i = 0; i < pairs.length; i++) h += tqKV(pairs[i][0], pairs[i][1]);
    return h;
  }
  function tqBall(n, cls) {
    return '<div class="tq-ball ' + (cls || '') + '">' + n + '</div>';
  }
  function tqBalls(nums, cls) {
    var h = '<div class="tq-balls">';
    for (var i = 0; i < nums.length; i++) h += tqBall(nums[i], cls);
    return h + '</div>';
  }
  function tqDistHTML(dist) {
    var h = '<div class="tq-chips">';
    for (var i = 0; i <= 9; i++) {
      var c = dist[i] || 0;
      h += '<div class="tq-mini' + (c ? '' : ' zero') + '"><b>' + i + '</b><span>' + c + '</span></div>';
    }
    return h + '</div>';
  }

  /* ---------------- 取数：一个 Tab / 一个号码区 / 某一位 ---------------- */
  function tqSeries(gid, key, pos, n) {
    var list = drawsOf(gid).slice(0, n || SPAN), out = [];
    for (var i = list.length - 1; i >= 0; i--) {
      var ns = numsOf(list[i], key);
      if (!ns.length) continue;
      if (pos == null) out.push({ issue: String(list[i].issue || ''), nums: ns.slice() });
      else if (ns.length > pos) out.push({ issue: String(list[i].issue || ''), nums: [ns[pos]] });
    }
    return out;
  }
  function tqPer(gid, key) {
    var d = drawsOf(gid);
    for (var i = 0; i < d.length; i++) {
      var ns = numsOf(d[i], key);
      if (ns.length) return ns.length;
    }
    return 1;
  }
  /* Tab 清单：数字彩按位、七星彩按前后、其余按号码区（红球 / 蓝球） */
  function tqTabs(g) {
    var out = [], i, POS5 = ['万位', '千位', '百位', '十位', '个位'];
    var POS4 = ['千位', '百位', '十位', '个位'], POS3 = ['百位', '十位', '个位'];
    if (g.type === 'digit') {
      var need = tqPer(g.id, 'main');
      var names = need >= 5 ? POS5 : (need === 4 ? POS4 : POS3);
      for (i = 0; i < need; i++) {
        out.push({ key: 'main', pos: i, label: names[i] || ('第 ' + (i + 1) + ' 位'),
          from: 0, to: 9, sub: '定位走势' });
      }
      return out;
    }
    if (g.type === 'qxc') {
      for (i = 0; i < g.areas.length; i++) {
        var qa = g.areas[i];
        out.push({ key: qa.key, pos: null, label: qa.label || ('区' + (i + 1)),
          from: qa.from, to: qa.to, sub: '' });
      }
      return out;
    }
    for (i = 0; i < g.areas.length; i++) {
      var a = g.areas[i];
      var lab = i === 0 ? '红球' : (i === 1 ? '蓝球' : ('第 ' + (i + 1) + ' 区'));
      out.push({ key: a.key, pos: null, label: lab, from: a.from, to: a.to, sub: a.label || '' });
    }
    return out;
  }
  function tqTabId(t) { return t.key + (t.pos == null ? '' : ('#' + t.pos)); }
  function tqTabOf(tabs, id) {
    for (var i = 0; i < tabs.length; i++) if (tqTabId(tabs[i]) === id) return tabs[i];
    return null;
  }
  function tqCtx(g, tab) {
    var rows = tqSeries(g.id, tab.key, tab.pos, SPAN), per = 0, i;
    for (i = rows.length - 1; i >= 0; i--) { if (rows[i].nums.length) { per = rows[i].nums.length; break; } }
    if (!per) per = 1;
    return { g: g, tab: tab, rows: rows, n: rows.length, per: per,
      from: tab.from, to: tab.to, isMulti: per >= 2 };
  }
  function tqFlat(ctx) {
    var out = [], i, j;
    for (i = 0; i < ctx.rows.length; i++) {
      for (j = 0; j < ctx.rows[i].nums.length; j++) out.push(ctx.rows[i].nums[j]);
    }
    return out;
  }
  function tqSplit(ctx) { return ctx.from + Math.floor((ctx.to - ctx.from + 1) / 2) - 1; }
  function tqSums(ctx) {
    var out = [], i, j;
    for (i = 0; i < ctx.rows.length; i++) {
      var s = 0;
      for (j = 0; j < ctx.rows[i].nums.length; j++) s += ctx.rows[i].nums[j];
      out.push(s);
    }
    return out;
  }
  function tqTailDist(arr) {
    var m = {}, i, t;
    for (i = 0; i < arr.length; i++) { t = arr[i] % 10; m[t] = (m[t] || 0) + 1; }
    return m;
  }
  function tqBands(ctx, parts) {
    var span = ctx.to - ctx.from + 1, w = Math.ceil(span / parts), out = [], q, a, b;
    for (q = 0; q < parts; q++) {
      a = ctx.from + q * w; b = a + w - 1;
      if (a > ctx.to) break;
      if (b > ctx.to) b = ctx.to;
      out.push({ a: a, b: b, c: 0 });
    }
    return out;
  }
  function tqBandCount(ctx, bands) {
    var per = [], i, j, k, ns, cnt, hit;
    for (i = 0; i < ctx.rows.length; i++) {
      ns = ctx.rows[i].nums; cnt = [];
      for (k = 0; k < bands.length; k++) cnt.push(0);
      for (j = 0; j < ns.length; j++) {
        for (k = 0; k < bands.length; k++) {
          if (ns[j] >= bands[k].a && ns[j] <= bands[k].b) { cnt[k]++; bands[k].c++; break; }
        }
      }
      per.push(cnt);
    }
    return per;
  }
  /* 每一期（或每几个号）的号码出现次数 + 距离最近一次出现隔了几期 */
  function tqFreqAll(ctx) {
    var map = {}, v, i, j, n;
    for (v = ctx.from; v <= ctx.to; v++) map[v] = { f: 0, gap: ctx.n };
    for (i = 0; i < ctx.rows.length; i++) {
      var ns = ctx.rows[i].nums;
      for (j = 0; j < ns.length; j++) {
        n = ns[j];
        if (!map[n]) map[n] = { f: 0, gap: ctx.n };
        map[n].f++;
        map[n].gap = ctx.rows.length - 1 - i;   /* 越晚出现 → 覆盖成更小的遗漏（最后写进去的就是最近一次） */
      }
    }
    return map;
  }
  function tqTop(map, from, to, k) {
    var list = [], v;
    for (v = from; v <= to; v++) list.push({ n: v, f: map[v].f, gap: map[v].gap });
    list.sort(function (x, y) { return (y.f - x.f) || (x.gap - y.gap) || (x.n - y.n); });
    return list.slice(0, k);
  }
  function tqRuns(nums) {
    var s = nums.slice().sort(function (a, b) { return a - b; }), out = [], i = 0, j;
    while (i < s.length) {
      j = i;
      while (j + 1 < s.length && s[j + 1] - s[j] === 1) j++;
      if (j > i) out.push(j - i + 1);
      i = j + 1;
    }
    return out;
  }

  /* ---------------- 指标：算的都是近 30 期的真实号码 ---------------- */
  function mOddEven(ctx) {
    var all = tqFlat(ctx), odd = 0, even = 0, i, tOdd = 0, tEven = 0;
    for (i = 0; i < all.length; i++) { if (all[i] % 2) odd++; else even++; }
    var tot = odd + even;
    for (i = ctx.from; i <= ctx.to; i++) { if (i % 2) tOdd++; else tEven++; }
    return tqLines([
      ['近 ' + ctx.n + ' 期 奇数 : 偶数', odd + ' : ' + even],
      ['占比', tqPct(odd, tot) + ' : ' + tqPct(even, tot)],
      ['平均每期', '奇 ' + fmt1(odd / ctx.n) + ' 个 : 偶 ' + fmt1(even / ctx.n) + ' 个'],
      ['本区奇偶号个数', tOdd + ' : ' + tEven + '（理论 ' + tqPct(tOdd, tOdd + tEven) + ' : ' + tqPct(tEven, tOdd + tEven) + '）'],
      ['最近一期', ctx.n ? (ctx.rows[ctx.rows.length - 1].issue + ' 期　' + ctx.rows[ctx.rows.length - 1].nums.join(' ')) : '—']
    ]);
  }
  function mBigSmall(ctx) {
    var split = tqSplit(ctx), all = tqFlat(ctx), big = 0, small = 0, i;
    for (i = 0; i < all.length; i++) { if (all[i] > split) big++; else small++; }
    var tot = big + small, tBig = 0;
    for (i = ctx.from; i <= ctx.to; i++) if (i > split) tBig++;
    return tqLines([
      ['近 ' + ctx.n + ' 期 大 : 小', big + ' : ' + small],
      ['占比', tqPct(big, tot) + ' : ' + tqPct(small, tot)],
      ['分界（小 ≤ ' + split + '）', '大 ' + (split + 1) + ' ~ ' + ctx.to],
      ['平均每期', '大 ' + fmt1(big / ctx.n) + ' 个 : 小 ' + fmt1(small / ctx.n) + ' 个'],
      ['本区大小号个数', tBig + ' : ' + (ctx.to - ctx.from + 1 - tBig)]
    ]);
  }
  function mPrime(ctx) {
    var all = tqFlat(ctx), pr = 0, i;
    for (i = 0; i < all.length; i++) if (tqPrime(all[i])) pr++;
    var comp = all.length - pr;
    return tqLines([
      ['近 ' + ctx.n + ' 期 质数 : 合数', pr + ' : ' + comp],
      ['占比', tqPct(pr, all.length) + ' : ' + tqPct(comp, all.length)],
      ['平均每期', '质 ' + fmt1(pr / ctx.n) + ' 个 : 合 ' + fmt1(comp / ctx.n) + ' 个'],
      ['口径', '1 不是质数，按合数计']
    ]);
  }
  function mRoad(ctx) {
    var all = tqFlat(ctx), r = [0, 0, 0], i;
    for (i = 0; i < all.length; i++) r[all[i] % 3]++;
    return tqLines([
      ['近 ' + ctx.n + ' 期 0 路 : 1 路 : 2 路', r[0] + ' : ' + r[1] + ' : ' + r[2]],
      ['占比', tqPct(r[0], all.length) + ' : ' + tqPct(r[1], all.length) + ' : ' + tqPct(r[2], all.length)],
      ['平均每期', '0 路 ' + fmt1(r[0] / ctx.n) + ' · 1 路 ' + fmt1(r[1] / ctx.n) + ' · 2 路 ' + fmt1(r[2] / ctx.n)],
      ['口径', '号码除以 3 的余数']
    ]);
  }
  function mSpan(ctx) {
    var i, j;
    if (ctx.isMulti) {
      var tot = 0, mx = 0, mn = 999, last = 0, lastIssue = '';
      for (i = 0; i < ctx.rows.length; i++) {
        var ns = ctx.rows[i].nums, hi = ns[0], lo = ns[0];
        for (j = 1; j < ns.length; j++) { if (ns[j] > hi) hi = ns[j]; if (ns[j] < lo) lo = ns[j]; }
        var sp = hi - lo;
        tot += sp;
        if (sp > mx) mx = sp;
        if (sp < mn) mn = sp;
        last = sp; lastIssue = ctx.rows[i].issue;
      }
      return tqLines([
        ['近 ' + ctx.n + ' 期 平均跨度', fmt1(tot / ctx.n)],
        ['最大跨度', mx + '（单期最大号 - 最小号）'],
        ['最小跨度', mn],
        ['最近一期', lastIssue + ' 期　跨度 ' + last]
      ]);
    }
    var all = tqFlat(ctx), hi2 = all[0], lo2 = all[0], gaps = 0;
    for (i = 1; i < all.length; i++) { if (all[i] > hi2) hi2 = all[i]; if (all[i] < lo2) lo2 = all[i]; }
    for (i = 1; i < ctx.rows.length; i++) gaps += Math.abs(ctx.rows[i].nums[0] - ctx.rows[i - 1].nums[0]);
    return tqLines([
      ['近 ' + ctx.n + ' 期 号码范围', lo2 + ' ~ ' + hi2],
      ['跨度（最大号 - 最小号）', String(hi2 - lo2)],
      ['平均相邻两期间距', fmt1(gaps / Math.max(1, ctx.rows.length - 1))],
      ['最近一期', ctx.n ? (ctx.rows[ctx.rows.length - 1].issue + ' 期　开 ' + ctx.rows[ctx.rows.length - 1].nums[0]) : '—'],
      ['口径', '每期只开 1 个号，所以看区间跨度 + 期间间距']
    ]);
  }
  function mSumRange(ctx) {
    var sums = tqSums(ctx), mx = sums[0], mn = sums[0], tot = 0, i;
    for (i = 0; i < sums.length; i++) { tot += sums[i]; if (sums[i] > mx) mx = sums[i]; if (sums[i] < mn) mn = sums[i]; }
    var avg = tot / (sums.length || 1);
    return tqLines([
      ['近 ' + ctx.n + ' 期 平均和值', fmt1(avg)],
      ['和值区间', mn + ' ~ ' + mx],
      ['最近一期和值', ctx.n ? (String(sums[sums.length - 1]) + '（' + (sums[sums.length - 1] > avg ? '高于均值' : (sums[sums.length - 1] < avg ? '低于均值' : '等于均值')) + '）') : '—'],
      ['均值上下 20%', fmt1(avg * 0.8) + ' ~ ' + fmt1(avg * 1.2)]
    ]);
  }
  function mSumTail(ctx) {
    var sums = tqSums(ctx), dist = tqTailDist(sums), list = [], i;
    for (i = 0; i <= 9; i++) list.push([i, dist[i] || 0]);
    list.sort(function (a, b) { return b[1] - a[1] || a[0] - b[0]; });
    var top = '', j;
    for (j = 0; j < 3; j++) top += (j ? ' · ' : '') + '尾 ' + list[j][0] + '（' + list[j][1] + ' 次）';
    return tqDistHTML(dist) + tqLines([
      ['统计范围', '近 ' + ctx.n + ' 期的和值尾数，共 ' + sums.length + ' 个'],
      ['出现最多', top],
      ['出现最少', '尾 ' + list[9][0] + '（' + list[9][1] + ' 次）']
    ]);
  }
  function mAC(ctx) {
    var tot = 0, used = 0, mx = 0, mn = 99, i, j, k, d;
    for (i = 0; i < ctx.rows.length; i++) {
      var s = ctx.rows[i].nums.slice().sort(function (a, b) { return a - b; });
      if (s.length < 2) continue;
      var seen = {}, kinds = 0;
      for (j = 0; j < s.length; j++) for (k = j + 1; k < s.length; k++) { d = s[k] - s[j]; seen[d] = 1; }
      for (d in seen) if (seen.hasOwnProperty(d)) kinds++;
      var ac = kinds - (s.length - 1);
      if (ac < 0) ac = 0;
      tot += ac; used++;
      if (ac > mx) mx = ac;
      if (ac < mn) mn = ac;
    }
    if (!used) return tqLines([['近 ' + ctx.n + ' 期', '每期只开 1 个号，差值集合为空，AC 值按 0 计']]);
    return tqLines([
      ['近 ' + ctx.n + ' 期 平均 AC 值', fmt1(tot / used)],
      ['最高 / 最低', mx + ' / ' + mn],
      ['说明', 'AC 值越大，号码越分散']
    ]);
  }
  function mBigOddEven(ctx) {
    var split = tqSplit(ctx), cnt = [0, 0, 0, 0], i, v, idx;
    for (i = 0; i < ctx.rows.length; i++) {
      v = ctx.rows[i].nums[0];
      if (v == null) continue;
      idx = (v > split ? 2 : 0) + (v % 2 ? 1 : 0);
      cnt[idx]++;
    }
    var tot = ctx.n || 1;
    return tqLines([
      ['大奇（' + (split + 1) + '~' + ctx.to + ' 奇）', cnt[2] + ' 期 · ' + tqPct(cnt[2], tot)],
      ['大偶', cnt[3] + ' 期 · ' + tqPct(cnt[3], tot)],
      ['小奇（' + ctx.from + '~' + split + ' 奇）', cnt[1] + ' 期 · ' + tqPct(cnt[1], tot)],
      ['小偶', cnt[0] + ' 期 · ' + tqPct(cnt[0], tot)],
      ['近 ' + ctx.n + ' 期 合计', (cnt[0] + cnt[1] + cnt[2] + cnt[3]) + ' 期']
    ]);
  }
  function mSumSingle(ctx) {
    var all = tqFlat(ctx), mx = all[0], mn = all[0], tot = 0, i;
    for (i = 0; i < all.length; i++) { tot += all[i]; if (all[i] > mx) mx = all[i]; if (all[i] < mn) mn = all[i]; }
    return tqLines([
      ['近 ' + ctx.n + ' 期 平均和值', fmt1(tot / (all.length || 1))],
      ['和值区间', mn + ' ~ ' + mx],
      ['最近一期', ctx.n ? (String(all[all.length - 1]) + '（' + ctx.rows[ctx.rows.length - 1].issue + ' 期）') : '—'],
      ['口径', '这个 Tab 每期只开 1 个号，和值就是号码本身']
    ]);
  }
  function mQuad(ctx) {
    var bands = tqBands(ctx, 4), per = tqBandCount(ctx, bands), tot = 0, i;
    for (i = 0; i < bands.length; i++) tot += bands[i].c;
    var h = '', name = ['一区', '二区', '三区', '四区'];
    for (i = 0; i < bands.length; i++) {
      h += tqKV(name[i] + '（' + bands[i].a + '~' + bands[i].b + '）', bands[i].c + ' 个 · ' + tqPct(bands[i].c, tot));
    }
    return h + tqLines([
      ['四分区比', bands[0].c + ' : ' + (bands[1] ? bands[1].c : 0) + ' : ' + (bands[2] ? bands[2].c : 0) + ' : ' + (bands[3] ? bands[3].c : 0)],
      ['最近一期分布', per.length ? per[per.length - 1].join(' : ') : '—']
    ]);
  }
  function mThirdRatio(ctx) {
    var bands = tqBands(ctx, 3), per = tqBandCount(ctx, bands), tot = 0, i;
    for (i = 0; i < bands.length; i++) tot += bands[i].c;
    var names = ['一区', '二区', '三区'], h = '';
    for (i = 0; i < bands.length; i++) h += tqKV(names[i] + '（' + bands[i].a + '~' + bands[i].b + '）', bands[i].c + ' 个 · ' + tqPct(bands[i].c, tot));
    return h + tqLines([
      ['三区比', bands[0].c + ' : ' + bands[1].c + ' : ' + bands[2].c],
      ['平均每期', fmt1(bands[0].c / ctx.n) + ' : ' + fmt1(bands[1].c / ctx.n) + ' : ' + fmt1(bands[2].c / ctx.n)],
      ['最近一期分布', per.length ? per[per.length - 1].join(' : ') : '—']
    ]);
  }
  function mBandCount(ctx, idx) {
    var bands = tqBands(ctx, 3), per = tqBandCount(ctx, bands);
    var names = ['一区', '二区', '三区'], sum = 0, mx = -1, mn = 999, dist = {}, i, c;
    for (i = 0; i < per.length; i++) {
      c = per[i][idx] || 0;
      sum += c;
      if (c > mx) mx = c;
      if (c < mn) mn = c;
      dist[c] = (dist[c] || 0) + 1;
    }
    var rank = [], v;
    for (v in dist) if (dist.hasOwnProperty(v)) rank.push([Number(v), dist[v]]);
    rank.sort(function (a, b) { return b[1] - a[1] || a[0] - b[0]; });
    var top = '', j;
    for (j = 0; j < Math.min(3, rank.length); j++) top += (j ? ' · ' : '') + rank[j][0] + ' 个 ' + rank[j][1] + ' 期';
    return tqLines([
      [names[idx] + '（' + bands[idx].a + '~' + bands[idx].b + '）', '平均每期 ' + fmt1(sum / (per.length || 1)) + ' 个'],
      ['单期区间', mn + ' ~ ' + mx + ' 个'],
      ['出现最多', top || '—'],
      ['最近一期', per.length ? (per[per.length - 1][idx] || 0) + ' 个' : '—']
    ]);
  }
  function mDan(ctx, k) {
    var map = tqFreqAll(ctx), top = tqTop(map, ctx.from, ctx.to, k), nums = [], i, s = '';
    for (i = 0; i < top.length; i++) {
      nums.push(top[i].n);
      s += (i ? '　' : '') + top[i].n + '（近 30 期 ' + top[i].f + ' 次 · 已 ' + top[i].gap + ' 期没出）';
    }
    nums.sort(function (a, b) { return a - b; });
    return tqBalls(nums, ctx.isMulti ? 'red' : 'blue') + tqLines([
      [k + ' 个胆码', nums.join(' ')],
      ['打分依据', '近 30 期出现次数（主）+ 最近遗漏（次）'],
      ['每个号的明细', s]
    ]);
  }
  function mTailValue(ctx) {
    var all = tqFlat(ctx), dist = tqTailDist(all), list = [], i;
    for (i = 0; i <= 9; i++) list.push([i, dist[i] || 0]);
    list.sort(function (a, b) { return b[1] - a[1] || a[0] - b[0]; });
    var top = '', j;
    for (j = 0; j < 3; j++) top += (j ? ' · ' : '') + '尾 ' + list[j][0] + '（' + list[j][1] + ' 次）';
    return tqDistHTML(dist) + tqLines([
      ['统计范围', '近 ' + ctx.n + ' 期共 ' + all.length + ' 个号码的个位'],
      ['出现最多', top],
      ['出现最少', '尾 ' + list[9][0] + '（' + list[9][1] + ' 次）']
    ]);
  }
  function mTailSame(ctx) {
    var days = 0, groups = 0, mx = 0, dist = {}, i, j, ns, tail, g;
    for (i = 0; i < ctx.rows.length; i++) {
      ns = ctx.rows[i].nums; tail = {}; g = 0;
      for (j = 0; j < ns.length; j++) { var t = ns[j] % 10; tail[t] = (tail[t] || 0) + 1; }
      for (var k in tail) if (tail.hasOwnProperty(k) && tail[k] > 1) g++;
      if (g > 0) days++;
      groups += g;
      if (g > mx) mx = g;
      dist[g] = (dist[g] || 0) + 1;
    }
    return tqLines([
      ['出现同尾的期数', days + ' / ' + ctx.n + ' 期（' + tqPct(days, ctx.n) + '）'],
      ['同尾组数合计', groups + ' 组'],
      ['平均每期', fmt1(groups / ctx.n) + ' 组'],
      ['单期最多', mx + ' 组（同一期里几组尾数相同，如 12 / 22）']
    ]);
  }
  function mConsecType(ctx) {
    var type = { '无连号': 0, '2 连': 0, '3 连': 0, '4 连以上': 0, '多组连号': 0 }, i, j, runs, m;
    for (i = 0; i < ctx.rows.length; i++) {
      runs = tqRuns(ctx.rows[i].nums);
      if (!runs.length) { type['无连号']++; continue; }
      if (runs.length >= 2) { type['多组连号']++; continue; }
      m = runs[0];
      if (m >= 4) type['4 连以上']++;
      else if (m === 3) type['3 连']++;
      else type['2 连']++;
    }
    var keys = ['无连号', '2 连', '3 连', '4 连以上', '多组连号'], h = '';
    for (j = 0; j < keys.length; j++) h += tqKV(keys[j], type[keys[j]] + ' 期 · ' + tqPct(type[keys[j]], ctx.n));
    return h + tqLines([['最近一期', ctx.n ? (ctx.rows[ctx.rows.length - 1].issue + ' 期　' + ctx.rows[ctx.rows.length - 1].nums.join(' ')) : '—']]);
  }
  function mConsecN(ctx, need) {
    var days = 0, tot = 0, mx = 0, i, j, runs, c;
    for (i = 0; i < ctx.rows.length; i++) {
      runs = tqRuns(ctx.rows[i].nums); c = 0;
      for (j = 0; j < runs.length; j++) if (runs[j] >= need) c++;
      if (c) days++;
      tot += c;
      if (c > mx) mx = c;
    }
    return tqLines([
      ['出现期数', days + ' / ' + ctx.n + ' 期（' + tqPct(days, ctx.n) + '）'],
      ['平均每期', fmt1(tot / ctx.n) + ' 组'],
      ['单期最多', mx + ' 组'],
      ['口径', need + ' 个号连续（如 ' + (need === 2 ? '12 / 13' : '12 / 13 / 14') + '）']
    ]);
  }
  function tqNGT(ctx) {
    var near = 0, alone = 0, repeat = 0, used = 0, i, j, k;
    var maxNear = 0, maxAlone = 0, maxRep = 0;
    for (i = 1; i < ctx.rows.length; i++) {
      var cur = ctx.rows[i].nums, prev = ctx.rows[i - 1].nums, nr = 0, ar = 0, rp = 0;
      for (j = 0; j < cur.length; j++) {
        var v = cur[j], isRep = false, isNear = false;
        for (k = 0; k < prev.length; k++) {
          if (prev[k] === v) { isRep = true; break; }
          if (v - prev[k] === 1 || prev[k] - v === 1) isNear = true;
        }
        if (isRep) { repeat++; rp++; }
        else if (isNear) { near++; nr++; }
        else { alone++; ar++; }
      }
      if (nr > maxNear) maxNear = nr;
      if (ar > maxAlone) maxAlone = ar;
      if (rp > maxRep) maxRep = rp;
      used++;
    }
    return { near: near, alone: alone, repeat: repeat, used: used,
      maxNear: maxNear, maxAlone: maxAlone, maxRep: maxRep };
  }
  function mNGTRatio(ctx) {
    var n = tqNGT(ctx);
    if (!n.used) return tqLines([['近 ' + ctx.n + ' 期', '期数还不够做上一期对比，开出下一期后自动补上']]);
    var tot = n.near + n.alone + n.repeat;
    return tqLines([
      ['邻 : 孤 : 传', n.near + ' : ' + n.alone + ' : ' + n.repeat],
      ['占比', tqPct(n.near, tot) + ' : ' + tqPct(n.alone, tot) + ' : ' + tqPct(n.repeat, tot)],
      ['平均每期', '邻 ' + fmt1(n.near / n.used) + ' · 孤 ' + fmt1(n.alone / n.used) + ' · 传 ' + fmt1(n.repeat / n.used)],
      ['口径', '邻 = 与上期相差 1；孤 = 不邻不重；传 = 与上期相同']
    ]);
  }
  function mNGTOne(ctx, kind) {
    var n = tqNGT(ctx);
    if (!n.used) return tqLines([['近 ' + ctx.n + ' 期', '期数还不够做上一期对比，开出下一期后自动补上']]);
    var name = kind === 'near' ? '邻号' : (kind === 'alone' ? '孤号' : '重号（传）');
    var total = kind === 'near' ? n.near : (kind === 'alone' ? n.alone : n.repeat);
    var mx = kind === 'near' ? n.maxNear : (kind === 'alone' ? n.maxAlone : n.maxRep);
    var kou = kind === 'near' ? '与上一期开出的某个号相差 1'
      : (kind === 'alone' ? '既不是重号、也不是邻号' : '和上一期开出完全相同的号');
    return tqLines([
      [name + ' 合计', total + ' 个'],
      ['平均每期', fmt1(total / n.used) + ' 个'],
      ['单期最多', mx + ' 个'],
      ['口径', kou]
    ]);
  }
  function mTailBigSmall(ctx) {
    var all = tqFlat(ctx), s = 0, b = 0, i, t;
    for (i = 0; i < all.length; i++) { t = all[i] % 10; if (t >= 5) b++; else s++; }
    return tqLines([
      ['尾数大（5~9）: 小（0~4）', b + ' : ' + s],
      ['占比', tqPct(b, all.length) + ' : ' + tqPct(s, all.length)],
      ['平均每期', '大尾 ' + fmt1(b / ctx.n) + ' : 小尾 ' + fmt1(s / ctx.n)],
      ['最近一期尾数', ctx.n ? (String(ctx.rows[ctx.rows.length - 1].nums[0] % 10)) : '—']
    ]);
  }
  function mTailOddEven(ctx) {
    var all = tqFlat(ctx), o = 0, e = 0, i, t;
    for (i = 0; i < all.length; i++) { t = all[i] % 10; if (t % 2) o++; else e++; }
    return tqLines([
      ['尾数奇 : 偶', o + ' : ' + e],
      ['占比', tqPct(o, all.length) + ' : ' + tqPct(e, all.length)],
      ['平均每期', '奇尾 ' + fmt1(o / ctx.n) + ' : 偶尾 ' + fmt1(e / ctx.n)]
    ]);
  }
  function mTailRoad(ctx) {
    var all = tqFlat(ctx), r = [0, 0, 0], i, t;
    for (i = 0; i < all.length; i++) { t = all[i] % 10; r[t % 3]++; }
    return tqLines([
      ['尾数 0 路 : 1 路 : 2 路', r[0] + ' : ' + r[1] + ' : ' + r[2]],
      ['占比', tqPct(r[0], all.length) + ' : ' + tqPct(r[1], all.length) + ' : ' + tqPct(r[2], all.length)],
      ['平均每期', '0 路 ' + fmt1(r[0] / ctx.n) + ' · 1 路 ' + fmt1(r[1] / ctx.n) + ' · 2 路 ' + fmt1(r[2] / ctx.n)]
    ]);
  }
  function mAnyN(ctx, k) {
    var map = tqFreqAll(ctx), top = tqTop(map, ctx.from, ctx.to, k);
    var set = {}, nums = [], s = '', hit = 0, i;
    for (i = 0; i < top.length; i++) { set[top[i].n] = 1; nums.push(top[i].n); s += (i ? ' · ' : '') + top[i].n + ' ' + top[i].f + ' 次'; }
    for (i = 0; i < ctx.rows.length; i++) if (set[ctx.rows[i].nums[0]]) hit++;
    nums.sort(function (a, b) { return a - b; });
    return tqBalls(nums, 'blue') + tqLines([
      ['这 ' + k + ' 码', s],
      ['覆盖期数', hit + ' / ' + ctx.n + ' 期（' + tqPct(hit, ctx.n) + '）'],
      ['说明', '这 ' + k + ' 个号码是近 30 期出现最多的，覆盖期数 = 其中至少一个开出的期数']
    ]);
  }
  function tqMetricHTML(ctx, id) {
    if (id === 'odd-even') return mOddEven(ctx);
    if (id === 'big-small') return mBigSmall(ctx);
    if (id === 'prime-comp') return mPrime(ctx);
    if (id === 'road012') return mRoad(ctx);
    if (id === 'span') return mSpan(ctx);
    if (id === 'sum-range') return mSumRange(ctx);
    if (id === 'sum-tail') return mSumTail(ctx);
    if (id === 'ac') return mAC(ctx);
    if (id === 'big-odd-even') return mBigOddEven(ctx);
    if (id === 'sum-single') return mSumSingle(ctx);
    if (id === 'quarter') return mQuad(ctx);
    if (id === 'third-ratio') return mThirdRatio(ctx);
    if (id === 'third-1') return mBandCount(ctx, 0);
    if (id === 'third-2') return mBandCount(ctx, 1);
    if (id === 'third-3') return mBandCount(ctx, 2);
    if (id === 'dan1') return mDan(ctx, 1);
    if (id === 'dan2') return mDan(ctx, 2);
    if (id === 'dan3') return mDan(ctx, 3);
    if (id === 'tail-value') return mTailValue(ctx);
    if (id === 'tail-same') return mTailSame(ctx);
    if (id === 'consec-type') return mConsecType(ctx);
    if (id === 'consec-2') return mConsecN(ctx, 2);
    if (id === 'consec-3') return mConsecN(ctx, 3);
    if (id === 'ngt-ratio') return mNGTRatio(ctx);
    if (id === 'ngt-near') return mNGTOne(ctx, 'near');
    if (id === 'ngt-alone') return mNGTOne(ctx, 'alone');
    if (id === 'ngt-repeat') return mNGTOne(ctx, 'repeat');
    if (id === 'tail-big') return mTailBigSmall(ctx);
    if (id === 'tail-odd') return mTailOddEven(ctx);
    if (id === 'tail-road') return mTailRoad(ctx);
    if (id === 'any3') return mAnyN(ctx, 3);
    if (id === 'any4') return mAnyN(ctx, 4);
    if (id === 'any5') return mAnyN(ctx, 5);
    return tqLines([['近 ' + ctx.n + ' 期', '这一项需要更多开奖期数，开出下一期后自动补上']]);
  }

  /* ---------------- 按钮清单（红球 8 基础 + 16 VIP / 蓝球 6 基础 + 10 VIP） ---------------- */
  var TQ_BASIC_MULTI = [['odd-even', '奇偶比'], ['big-small', '大小比'], ['prime-comp', '质合比'],
    ['road012', '012路比'], ['span', '跨度'], ['sum-range', '和值区间'],
    ['sum-tail', '和值尾数'], ['ac', 'AC值']];
  var TQ_BASIC_SINGLE = [['odd-even', '奇偶'], ['big-small', '大小'], ['big-odd-even', '大小奇偶'],
    ['road012', '012路'], ['sum-single', '和值'], ['quarter', '四分区']];
  var TQ_VIP_MULTI = [
    { name: '区间', items: [['third-ratio', '三区比'], ['third-1', '一区个数'], ['third-2', '二区个数'], ['third-3', '三区个数']] },
    { name: '胆码', items: [['dan1', '1胆'], ['dan2', '2胆'], ['dan3', '3胆']] },
    { name: '尾数', items: [['tail-value', '尾数值'], ['tail-same', '同尾组数']] },
    { name: '连号', items: [['consec-type', '连号类型'], ['consec-2', '任意2连'], ['consec-3', '任意3连']] },
    { name: '邻孤传', items: [['ngt-ratio', '邻孤传比'], ['ngt-near', '邻号个数'], ['ngt-alone', '孤号个数'], ['ngt-repeat', '重号个数']] }
  ];
  var TQ_VIP_SINGLE = [
    { name: '跨度', items: [['span', '跨度']] },
    { name: '和尾数', items: [['tail-big', '尾数大小'], ['tail-odd', '尾数奇偶'], ['tail-road', '尾数012路']] },
    { name: '邻孤传', items: [['ngt-ratio', '邻孤传']] },
    { name: '胆码', items: [['dan1', '1胆'], ['dan2', '2胆']] },
    { name: '任意N码', items: [['any3', '任意3码'], ['any4', '任意4码'], ['any5', '任意5码']] }
  ];

  function tqHeadHTML(g, tabs) {
    var h = '<div class="tq-tabs">';
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i], id = tqTabId(t);
      var on = (id === st.tqTab);
      h += '<div class="tq-tab' + (on ? ' on' : '') + '" role="button" tabindex="0" data-tq-tab="' + esc(id) + '">' + esc(t.label) + '</div>';
    }
    h += '</div>';
    var cur = tqTabOf(tabs, st.tqTab);
    if (cur && cur.sub) h += '<div class="tq-sub">' + esc(g.name) + ' · ' + esc(cur.sub) + ' · 近 ' + SPAN + ' 期统计</div>';
    return h;
  }
  function tqBtnRow(ctx, items) {
    var h = '<div class="tq-btns">', i, id, label;
    for (i = 0; i < items.length; i++) {
      id = items[i][0]; label = items[i][1];
      h += '<div class="tq-btn' + (st.tq === id ? ' on' : '') + '" role="button" tabindex="0" data-tq-metric="' + esc(id) + '">' + label + '</div>';
    }
    h += '</div>';
    for (i = 0; i < items.length; i++) {
      if (items[i][0] === st.tq) {
        h += '<div class="tq-res"><div class="tq-res-h"><span>' + items[i][1] + ' · 近 ' + ctx.n + ' 期</span><em>再点一次收起</em></div>' + tqMetricHTML(ctx, items[i][0]) + '</div>';
      }
    }
    return h;
  }
  /* 本期推荐号码：种子 = 下一期期号 → 同期固定、换期全变；号码按近 30 期真实频次打分 */
  function tqHash(s) {
    var h = 2166136261, i;
    for (i = 0; i < s.length; i++) {
      h = h ^ s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function tqRng(seedStr) {
    var s = tqHash(seedStr);
    return function () {
      s = (s + 1831565813) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t = t ^ (t + Math.imul(t ^ (t >>> 7), t | 61));
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function tqNextIssue(gid) {
    try {
      if (typeof nextIssueFor === 'function') {
        var v = nextIssueFor(gid);
        if (v) return String(v);
      }
    } catch (e) { /* 拿不到就退回期号 +1 */ }
    var d = drawsOf(gid);
    if (d && d.length) {
      var num = parseInt(String(d[0].issue || ''), 10);
      if (!isNaN(num)) return String(num + 1);
    }
    return '';
  }
  function tqFreqOf(gid, key, pos) {
    var rows = tqSeries(gid, key, pos, SPAN), map = {}, i, j, n;
    for (i = 0; i < rows.length; i++) {
      var ns = rows[i].nums;
      for (j = 0; j < ns.length; j++) {
        n = ns[j];
        if (!map[n]) map[n] = { f: 0, gap: rows.length };
        map[n].f++;
        map[n].gap = rows.length - 1 - i;       /* 同上：留最近一次的遗漏 */
      }
    }
    return map;
  }
  function tqPickN(map, from, to, need, rnd) {
    var list = [], v, maxf = 1, i, it;
    for (v = from; v <= to; v++) {
      it = map[v] || { f: 0, gap: 99 };
      list.push({ n: v, f: it.f, gap: it.gap });
      if (it.f > maxf) maxf = it.f;
    }
    for (i = 0; i < list.length; i++) list[i].sc = list[i].f + rnd() * (maxf * 0.95 + 1);
    list.sort(function (a, b) { return (b.sc - a.sc) || (a.n - b.n); });
    var top = list.slice(0, need);
    top.sort(function (a, b) { return a.n - b.n; });
    return top;
  }
  function tqPicks(g, issue) {
    /* 种子只用 彩种 + 下一期期号 → 换个 Tab 看同一组号，换期才变 */
    var rnd = tqRng('tq|' + g.id + '|' + String(issue || '0'));
    var out = [], i, tabs = tqTabs(g);
    if (g.type === 'digit') {
      var need = tqPer(g.id, 'main');
      for (i = 0; i < need; i++) {
        var fp = tqFreqOf(g.id, 'main', i);
        var one = tqPickN(fp, 0, 9, 1, rnd);
        out.push({ label: tabs[i].label, nums: [one[0].n], cls: 'digit' });
      }
      return out;
    }
    for (i = 0; i < g.areas.length; i++) {
      var cfg = g.areas[i], need2 = tqPer(g.id, cfg.key);
      var lab = tabs[i] ? tabs[i].label : (cfg.label || ('区' + (i + 1)));
      var rep = (g.type === 'qxc' && cfg.key === 'front');
      if (rep) {
        var nums = [], p;
        for (p = 0; p < need2; p++) {
          var fpp = tqFreqOf(g.id, cfg.key, p);
          nums.push(tqPickN(fpp, cfg.from, cfg.to, 1, rnd)[0].n);
        }
        out.push({ label: lab, nums: nums, cls: 'digit' });
      } else {
        var pick = g.id === 'kl8' ? 10 : need2;
        var fa = tqFreqOf(g.id, cfg.key, null);
        var top = tqPickN(fa, cfg.from, cfg.to, pick, rnd), arr = [], q;
        for (q = 0; q < top.length; q++) arr.push(top[q].n);
        out.push({ label: lab, nums: arr, cls: i === 1 ? 'blue' : 'red' });
      }
    }
    return out;
  }
  function tqRecCard(g, tab) {
    /* 统一取号：读构建期算好的 REC（和另外 4 个页面同一份，号码逐字一致） */
    var uni = tqRecUnified(g.id, '🎯 本期推荐号码');
    if (uni) return uni;
    var issue = tqNextIssue(g.id);
    var picks = tqPicks(g, issue), h = '<div class="tq-rec">', i;
    h += '<div class="tq-rec-h">🎯 本期推荐号码<span>' + (issue ? ('第 ' + esc(issue) + ' 期') : '') + '</span></div>';
    for (i = 0; i < picks.length; i++) {
      h += '<div class="tq-rec-row"><span class="tq-rec-k">' + esc(picks[i].label) + '</span>' + tqBalls(picks[i].nums, picks[i].cls) + '</div>';
    }
    h += '<div class="tq-warn">⚠️ 仅供参考，不保证中奖</div>';
    return h + '</div>';
  }

  function pageTrend() {
    var g = gameById(st.game);
    var tabs = tqTabs(g);
    if (!tabs.length) return none('没有可分析的区域', '这个彩种还没有配置号码区。');
    if (!tqTabOf(tabs, st.tqTab)) st.tqTab = tqTabId(tabs[0]);
    var tab = tqTabOf(tabs, st.tqTab);
    var ctx = tqCtx(g, tab);
    var h = '';
    if (st.pickGame) h += '<div class="tq-games">' + chipsGame() + '</div>';
    h += tqHeadHTML(g, tabs);
    if (!ctx.n) {
      h += '<div class="tq-empty"><b>近 ' + SPAN + ' 期样本不足</b>这个彩种本页还没有足够的开奖期数，开出几期后这里会自动补上。</div>';
      return h + tqRecCard(g, tab);
    }
    var basic = ctx.isMulti ? TQ_BASIC_MULTI : TQ_BASIC_SINGLE;
    var vip = ctx.isMulti ? TQ_VIP_MULTI : TQ_VIP_SINGLE;
    h += '<div class="tq-sec"><div class="tq-sec-h">基础趋势<span class="tq-free">免费查看</span></div>' + tqBtnRow(ctx, basic) + '</div>';
    var grp = '', i, j, items;
    for (i = 0; i < vip.length; i++) {
      items = vip[i].items;
      grp += '<div class="tq-grp"><div class="tq-grp-h">' + vip[i].name + '</div>' + tqBtnRow(ctx, items) + '</div>';
    }
    h += '<div class="tq-sec"><div class="tq-vip-bar">👑 VIP 趋势${VIP_FREE_TAG}</div>' + grp + '</div>';
    h += tqRecCard(g, tab);
    h += note('以上数字全部按近 ' + SPAN + ' 期已开出的号码现算，每期开奖后自动更新；推荐号码用下一期期号做种子，同一期固定、换期就变。');
    return h;
  }

  /* ================= ③ 遗漏宝 ================= */
  function pageOmit() {
    var g = gameById(st.game), key = curArea(g);
    var o = omitOf(g.id);
    if (!o.draws) return chipsGame() + none('需要更多数据', '这个彩种本页没有开奖数据，算不出遗漏。');
    var over = [], i;
    for (i = 0; i < o.list.length; i++) if (o.theo && o.list[i].cur >= o.theo * 2) over.push(o.list[i]);
    over.sort(function (a, b) { return b.cur - a.cur; });
    var h = chipsGame() + chipsArea(g);
    h += card('理论遗漏 · ' + esc(g.name) + ' ' + esc(areaLabel(g, key)),
      row('号码总数 / 每期出几个', o.total + ' 个 / ' + (o.perDraw || '—') + ' 个') +
      row('理论平均遗漏', o.theo ? fmt1(o.theo) + ' 期' : '—') +
      row('标红门槛（2 倍理论）', o.theo ? fmt1(o.theo * 2) + ' 期' : '—') +
      row('超过门槛的号码', over.length ? over.length + ' 个' : '没有'));
    if (over.length) {
      var list = '';
      for (i = 0; i < Math.min(8, over.length); i++) {
        list += row(String(over[i].n), '已 ' + over[i].cur + ' 期没出 · 历史最大 ' + over[i].max + ' 期');
      }
      h += card('超出理论的号码（红底）', list);
    }
    var cells = '';
    for (i = 0; i < o.list.length; i++) {
      var it = o.list[i];
      var bad = o.theo && it.cur >= o.theo * 2;
      cells += '<div class="tv-cell' + (bad ? ' bad' : '') + '"><b>' + it.n + '</b><i>' + it.cur + '</i></div>';
    }
    h += card('每个号码：当前遗漏（数字=已经多少期没出）', '<div class="tv-cells">' + cells + '</div>');
    h += note('格子里的数字 = 这个号码【已经多少期没出】（0 = 最新一期就出了）；红底 = 已经超过理论值的 2 倍。全部按本页已有的近 ' + o.draws + ' 期现算，不是估的。');
    h += recBlock(g.id);
    return h;
  }

  /* ================= ④ 实时热点 ================= */
  function pageHot() {
    var g = gameById(st.game), ai = areaIdx(g), key = curArea(g);
    var H = hmAreaOf(g.id, ai);
    var h = chipsGame() + chipsArea(g);
    var srcText;
    if (H) {
      /* 实票统计的字段是 {num, pct, count}；这里统一成 {n, c}，和下面的
         「按开奖期数现算」那一路共用同一个 bars()（避免出现 undefined） */
      var items = H.items.map(function (x) { return { n: x.num, c: x.count }; })
        .sort(function (a, b) { return (b.c - a.c) || (a.n - b.n); });
      var hot = items.slice(0, 6), cold = items.slice(-6).reverse();
      var tot = 0;
      for (var i = 0; i < items.length; i++) tot += items[i].c;
      srcText = '开奖频率统计';
      try {
        var sc = String((HM[g.id] || {}).source || '');
        if (sc === 'ocr-xysp') srcText = '晒票票面统计';
        else if (sc === 'xysp-text') srcText = '晒票文字统计';
      } catch (e2) { /* 忽略 */ }
      var span = '近 30 期 · ' + esc(srcText);
      h += card('热号（出现最多）<span>' + span + '</span>', bars(hot, tot, false));
      h += card('冷号（出现最少）<span>' + span + '</span>', bars(cold, tot, true));
    } else {
      var f = freqOf(g.id, SPAN);
      if (!f.total) return chipsGame() + none('需要更多数据', '这个彩种本页没有开奖数据。');
      var span2 = '近 30 期 · 开奖频率统计';
      h += card('热号（出现最多）<span>' + span2 + '</span>', bars(f.arr.slice(0, 6), f.total, false));
      h += card('冷号（出现最少）<span>' + span2 + '</span>', bars(f.arr.slice(-6).reverse(), f.total, true));
    }
    h += note('热号 = 这段时间出现次数最多的号码，冷号 = 最少的。次数只描述已经发生的开奖，不代表下一期的概率 —— 每个号码每期都是独立随机的。');
    h += recBlock(g.id);
    return h;
  }
  function bars(arr, tot, cold) {
    var max = 1, i;
    for (i = 0; i < arr.length; i++) if (arr[i].c > max) max = arr[i].c;
    var h = '';
    for (i = 0; i < arr.length; i++) {
      var it = arr[i];
      var cnt = it.c != null ? it.c : (it.count || 0);
      var w = Math.max(4, Math.round(cnt * 100 / max));
      h += '<div class="tv-bar' + (cold ? ' cold' : '') + '"><b>' + it.n + '</b>' +
        '<span><i style="width:' + w + '%"></i></span>' +
        '<em>' + cnt + ' 次 ' + pctS(cnt, tot) + '</em></div>';
    }
    return h;
  }

  /* ================= ⑤ 智能规律（画线推号 · 近 10 期为主 / 近 30 期做对照） =================
     ------------------------------------------------------------
     用户原话：「看能不能找几套走势图 画线可能出现的号码或者什么胆尾 自己指定几套模板
               要抓取近十期用自己模板去分析 后续免费的」
     四套模板（每套都【推出具体号码】，不只是统计）：
       A 斜连推号：三期连成 +1 / -1 的斜线（05→06→07）→ 延长到下一期（08）
       B 竖连续出：某号连续 2~3 期都出 → 看下一期会不会续
       C 胆尾：近 10 期各尾数出现几次 → 最热的 2~3 个尾数当胆尾 → 对应号码
       D 遗漏周期：某号的出号间隔有没有规律 → 下一期是否「到期」
     另外 VIP 规律里有：邻号追击 / 重号续出 / 分区回补 / 综合推号
     ⚠️ 红球和蓝球指标分开：蓝球每期只 1 个号，没有「连号 / 同尾组数」这些指标，不显示。
     ⚠️ 这段在模板字符串里：只写单引号，不写反引号，不写代码里的反斜杠。
     ============================================================ */
  var PT_NEAR = 10;
  function ptCtx(g, tab, n) {
    var rows = tqSeries(g.id, tab.key, tab.pos, n), per = 0, i;
    for (i = rows.length - 1; i >= 0; i--) { if (rows[i].nums.length) { per = rows[i].nums.length; break; } }
    if (!per) per = 1;
    return { g: g, tab: tab, rows: rows, n: rows.length, per: per,
      from: tab.from, to: tab.to, isMulti: per >= 2 };
  }
  function ptIn(n, ctx) { return n >= ctx.from && n <= ctx.to; }
  function ptSortNum(a) { a.sort(function (x, y) { return x - y; }); return a; }
  function ptUniq(arr, ctx) {
    var out = [], seen = {}, i;
    for (i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (!ptIn(v, ctx) || seen[v]) continue;
      seen[v] = 1; out.push(v);
    }
    return ptSortNum(out);
  }
  function ptBlk(title, noteText, body) {
    return '<div class="tq-blk"><div class="tq-blk-h"><span>' + title + '</span><em>' + noteText + '</em></div>' + body + '</div>';
  }
  function ptBallsLine(label, nums, cls) {
    if (!nums.length) return '';
    return '<div class="tq-rec-row"><span class="tq-rec-k">' + label + '</span>' + tqBalls(nums, cls) + '</div>';
  }

  /* ---------------- A · 斜连推号 ---------------- */
  function ptSlant(g, ctx, ctx30) {
    /* 历史斜线用近 30 期数（样本够才看得出来），推下一期用最新两期 */
    var rows = (ctx30 && ctx30.rows.length > ctx.rows.length) ? ctx30.rows : ctx.rows, i, j, x, list = [], hist = 0;
    for (i = 2; i < rows.length; i++) {
      var a = rows[i - 2].nums, b = rows[i - 1].nums, c = rows[i].nums;
      for (j = 0; j < a.length; j++) {
        x = a[j];
        if (b.indexOf(x + 1) >= 0 && c.indexOf(x + 2) >= 0) {
          hist++;
          list.push({ issue: rows[i].issue, chain: x + ' → ' + (x + 1) + ' → ' + (x + 2), pred: x + 3, dir: '+1' });
        }
        if (b.indexOf(x - 1) >= 0 && c.indexOf(x - 2) >= 0) {
          hist++;
          list.push({ issue: rows[i].issue, chain: x + ' → ' + (x - 1) + ' → ' + (x - 2), pred: x - 3, dir: '-1' });
        }
      }
    }
    /* 最新两期的斜连 → 直接推下一期 */
    var preds = [], near = [];
    if (rows.length >= 2) {
      var p = rows[rows.length - 2].nums, q = rows[rows.length - 1].nums;
      for (j = 0; j < p.length; j++) {
        if (q.indexOf(p[j] + 1) >= 0) { preds.push(p[j] + 2); near.push(p[j] + ' → ' + (p[j] + 1) + ' → 推 ' + (p[j] + 2)); }
        if (q.indexOf(p[j] - 1) >= 0) { preds.push(p[j] - 2); near.push(p[j] + ' → ' + (p[j] - 1) + ' → 推 ' + (p[j] - 2)); }
      }
    }
    var outNums = ptUniq(preds, ctx), fallback = '';
    if (!outNums.length) {
      /* 没有斜线时不许留空：改用「均值回归」/「上期邻号」两套兜底，同样出具体号码 */
      var n10 = Math.min(PT_NEAR, rows.length), sm = 0, q3;
      if (!ctx.isMulti) {
        for (q3 = rows.length - n10; q3 < rows.length; q3++) if (q3 >= 0) sm += rows[q3].nums[0];
        var mean = sm / Math.max(1, n10), base = Math.round(mean);
        outNums = ptUniq([base - 1, base, base + 1], ctx);
        fallback = '近 ' + rows.length + ' 期没有连成一条的斜线 → 改用「均值回归」：近 ' + n10 + ' 期均值 ' + fmt1(mean) + '，推它上下 1 个号';
      } else {
        var lastN = rows.length ? rows[rows.length - 1].nums : [], back = [], q4;
        for (q4 = 0; q4 < lastN.length; q4++) { back.push(lastN[q4] - 1); back.push(lastN[q4] + 1); }
        outNums = ptUniq(back, ctx);
        fallback = '近 ' + rows.length + ' 期没有连成一条的斜线 → 改用「上期邻号」：上期号码各 ±1';
      }
    }
    var t = '<table class="tq-mtbl"><thead><tr><th>期号</th><th>斜连线</th><th>推出</th></tr></thead><tbody>', k;
    var tail = list.slice(-4);
    if (!tail.length) {
      t += '<tr><td colspan="3" class="l">近 ' + rows.length + ' 期还没有三期斜线（+1 / -1），所以用了下面的兜底推号</td></tr>';
    } else {
      for (k = 0; k < tail.length; k++) {
        t += '<tr><td>' + esc(tail[k].issue) + '</td><td>' + tail[k].chain + '</td><td><b>' + (ptIn(tail[k].pred, ctx) ? tail[k].pred : '越界') + '</b></td></tr>';
      }
    }
    t += '</tbody></table>';
    var body = t;
    if (near.length) body += '<div class="tq-kv"><span>最新两期连线</span><b>' + esc(near.slice(0, 3).join('；')) + '</b></div>';
    body += '<div class="tq-kv"><span>近 ' + rows.length + ' 期斜线</span><b>' + hist + ' 次</b></div>';
    if (fallback) body += '<div class="tq-kv"><span>兜底规则</span><b>' + fallback + '</b></div>';
    body += ptBallsLine('可能出现', outNums, ctx.isMulti ? 'red' : 'blue');
    return ptBlk('A · 斜连推号', '近 ' + rows.length + ' 期', body);
  }

  /* ---------------- B · 竖连续出 ---------------- */
  function ptVertical(g, ctx31) {
    var ctx = ctx31, rows = ctx.rows, n = rows.length, i, j;
    var streak = [], last = n ? rows[n - 1].nums : [], prev = n > 1 ? rows[n - 2].nums : [];
    for (j = 0; j < last.length; j++) {
      var v = last[j];
      if (prev.indexOf(v) >= 0) {
        var c = 2;
        if (n > 2 && rows[n - 3].nums.indexOf(v) >= 0) c = 3;
        streak.push({ n: v, c: c });
      }
    }
    /* 续连率：近 30 期里「连出 2 期」后还续到第 3 期的比例 */
    var two = 0, three = 0;
    for (i = 2; i < rows.length; i++) {
      for (j = 0; j < rows[i - 1].nums.length; j++) {
        var w = rows[i - 1].nums[j];
        if (rows[i - 2].nums.indexOf(w) >= 0) {
          two++;
          if (rows[i].nums.indexOf(w) >= 0) three++;
        }
      }
    }
    var nums = [], s = '', k;
    for (k = 0; k < streak.length; k++) { nums.push(streak[k].n); s += (s ? '　' : '') + streak[k].n + '（连出 ' + streak[k].c + ' 期）'; }
    var body = '';
    if (!streak.length) {
      body += '<div class="tq-nores">最近一期没有连出的号（每期都是新号），这一期以 A / C / D 三套为主。</div>';
    } else {
      body += '<div class="tq-kv"><span>连出的号</span><b>' + s + '</b></div>';
      body += '<div class="tq-kv"><span>续连判断</span><b>' + (three * 100 / (two || 1) > 40 ? '历史上续连率偏高，可以留 1 个' : '历史上续连率一般，最多留 1 个') + '</b></div>';
    }
    body += '<div class="tq-kv"><span>续连次数</span><b>连出 ' + two + ' 次 · 续到第 3 期 ' + three + ' 次' + (two ? '' : '（这一段没有连出过的号）') + '</b></div>';
    body += ptBallsLine('续连候选', ptUniq(nums, ctx), ctx.isMulti ? 'red' : 'blue');
    return ptBlk('B · 竖连续出', '同号连出', body);
  }

  /* ---------------- C · 胆尾 ---------------- */
  function ptTail(g, ctx10, ctx30) {
    var d10 = tqTailDist(tqFlat(ctx10)), d30 = tqTailDist(tqFlat(ctx30));
    var all10 = tqFlat(ctx10).length, list = [], i;
    for (i = 0; i <= 9; i++) list.push({ t: i, a: d10[i] || 0, b: d30[i] || 0 });
    list.sort(function (x, y) { return (y.a - x.a) || (y.b - x.b) || (x.t - y.t); });
    var hot = [list[0].t, list[1].t, list[2].t], nums = [], v;
    for (v = ctx10.from; v <= ctx10.to; v++) if (hot.indexOf(v % 10) >= 0) nums.push(v);
    var avg10 = all10 / 10, t = '<table class="tq-mtbl"><thead><tr><th>尾数</th><th>近 10 期</th><th>近 30 期</th><th>分档</th></tr></thead><tbody>', k;
    for (k = 0; k < list.length; k++) {
      var lv = list[k].a >= avg10 * 1.3 ? '热' : (list[k].a <= avg10 * 0.6 ? '冷' : '温');
      t += '<tr><td>' + list[k].t + '</td><td>' + list[k].a + '</td><td>' + list[k].b + '</td><td><b>' + lv + '</b></td></tr>';
    }
    t += '</tbody></table>';
    return ptBlk('C · 胆尾', '尾数 0~9', t +
      '<div class="tq-kv"><span>本期胆尾</span><b>尾 ' + hot.join(' · 尾 ') + '</b></div>' +
      ptBallsLine('胆尾对应号', ptUniq(nums, ctx10), ctx10.isMulti ? 'red' : 'blue'));
  }

  /* ---------------- D · 遗漏周期 ---------------- */
  function ptCycle(g, ctx30) {
    var rows = ctx30.rows, map = {}, v, i, j;
    for (v = ctx30.from; v <= ctx30.to; v++) map[v] = [];
    for (i = 0; i < rows.length; i++) {
      for (j = 0; j < rows[i].nums.length; j++) {
        var n = rows[i].nums[j];
        if (!map[n]) map[n] = [];
        if (map[n].length === 0 || map[n][map[n].length - 1] !== i) map[n].push(i);
      }
    }
    var list = [], due = [];
    for (v = ctx30.from; v <= ctx30.to; v++) {
      var pos = map[v] || [];
      if (pos.length < 2) continue;
      var sum = 0, k;
      for (k = 1; k < pos.length; k++) sum += pos[k] - pos[k - 1];
      var avg = sum / (pos.length - 1);
      var cur = rows.length - 1 - pos[pos.length - 1];
      list.push({ n: v, avg: avg, cur: cur, times: pos.length, due: cur >= avg - 0.6 });
      if (cur >= avg - 0.6) due.push(v);
    }
    list.sort(function (a, b) { return (b.cur - b.avg) - (a.cur - a.avg) || a.n - b.n; });
    var t = '<table class="tq-mtbl"><thead><tr><th>号码</th><th>平均间隔</th><th>当前遗漏</th><th>到期</th></tr></thead><tbody>', q;
    for (q = 0; q < Math.min(6, list.length); q++) {
      t += '<tr><td><b>' + list[q].n + '</b></td><td>' + fmt1(list[q].avg) + ' 期</td><td>' + list[q].cur + ' 期</td><td>' + (list[q].due ? '到期' : '还差 ' + fmt1(list[q].avg - list[q].cur) + ' 期') + '</td></tr>';
    }
    t += '</tbody></table>';
    var body = list.length ? t : '<div class="tq-nores">近 ' + rows.length + ' 期里还没有哪个号开出 2 次以上，算不出间隔，等开出几期后自动补上。</div>';
    body += '<div class="tq-kv"><span>到期号（' + due.length + ' 个）</span><b>' + (due.length ? due.join(' ') : '暂时没有') + '</b></div>';
    body += ptBallsLine('到期候选', ptUniq(due.slice(0, 8), ctx30), ctx30.isMulti ? 'red' : 'blue');
    return ptBlk('D · 遗漏周期', '出号间隔', body);
  }

  /* ---------------- VIP 规律 ---------------- */
  function ptNear(g, ctx) {
    var last = ctx.n ? ctx.rows[ctx.rows.length - 1].nums : [], cand = [], map = tqFreqAll(ctx), i;
    for (i = 0; i < last.length; i++) { cand.push(last[i] - 1); cand.push(last[i] + 1); }
    var nums = ptUniq(cand, ctx), s = '', k;
    nums.sort(function (a, b) { return (map[b] ? map[b].f : 0) - (map[a] ? map[a].f : 0); });
    for (k = 0; k < Math.min(8, nums.length); k++) s += (k ? '　' : '') + nums[k] + '（' + (map[nums[k]] ? map[nums[k]].f : 0) + ' 次）';
    nums = nums.slice(0, 8);
    nums.sort(function (a, b) { return a - b; });
    return tqBalls(nums, ctx.isMulti ? 'red' : 'blue') + tqLines([
      ['上期号码', last.join(' ')],
      ['邻号追击（' + nums.length + ' 个）', nums.join(' ')],
      ['按热度排', s]
    ]);
  }
  function ptRepeatPick(g, ctx) {
    var last = ctx.n ? ctx.rows[ctx.rows.length - 1].nums : [], map = tqFreqAll(ctx), avg = (ctx.per * ctx.n) / (ctx.to - ctx.from + 1), nums = [], i, s = '';
    for (i = 0; i < last.length; i++) if (map[last[i]] && map[last[i]].f >= avg) { nums.push(last[i]); s += (s ? '　' : '') + last[i] + '（' + map[last[i]].f + ' 次）'; }
    nums.sort(function (a, b) { return a - b; });
    if (!nums.length) return tqLines([['重号续出', '0 个'], ['说明', '上期号码里没有出现次数达到平均（' + fmt1(avg) + ' 次）的，本期不留重号。']]);
    return tqBalls(nums, ctx.isMulti ? 'red' : 'blue') + tqLines([
      ['重号续出（' + nums.length + ' 个）', nums.join(' ')],
      ['依据', '上期开出、且近 30 期出现次数 ≥ 平均 ' + fmt1(avg) + ' 次'],
      ['明细', s]
    ]);
  }
  function ptZoneBack(g, ctx) {
    var bands = tqBands(ctx, 3), per = tqBandCount(ctx, bands), rate = [], i;
    for (i = 0; i < bands.length; i++) rate.push(bands[i].c / Math.max(1, ctx.n));
    var idx = 0;
    for (i = 1; i < rate.length; i++) if (rate[i] < rate[idx]) idx = i;
    var map = tqFreqAll(ctx), list = [], v;
    for (v = bands[idx].a; v <= bands[idx].b; v++) list.push({ n: v, f: map[v].f, gap: map[v].gap });
    list.sort(function (a, b) { return (b.f - a.f) || (a.gap - b.gap) || (a.n - b.n); });
    var nums = [], k;
    for (k = 0; k < Math.min(4, list.length); k++) nums.push(list[k].n);
    nums.sort(function (a, b) { return a - b; });
    var names = ['一区', '二区', '三区'], s = '';
    for (i = 0; i < bands.length; i++) s += (i ? ' : ' : '') + fmt1(rate[i]);
    return tqBalls(nums, ctx.isMulti ? 'red' : 'blue') + tqLines([
      ['最冷的区', names[idx] + '（' + bands[idx].a + '~' + bands[idx].b + '）'],
      ['三区平均每期', s],
      ['回补号码', nums.join(' ')],
      ['依据', '冷区里的热号，等这一区回补']
    ]);
  }
  /* 综合推号：四套模板一起打分 */
  function ptMerged(g, tab, ctx10, ctx30) {
    var score = {}, i, v;
    function add(nums, w) { for (var q = 0; q < nums.length; q++) score[nums[q]] = (score[nums[q]] || 0) + w; }
    var rows = ctx10.rows, preds = [], j, x;
    if (rows.length >= 2) {
      var p = rows[rows.length - 2].nums, q2 = rows[rows.length - 1].nums;
      for (j = 0; j < p.length; j++) {
        if (q2.indexOf(p[j] + 1) >= 0) preds.push(p[j] + 2);
        if (q2.indexOf(p[j] - 1) >= 0) preds.push(p[j] - 2);
      }
    }
    add(ptUniq(preds, ctx10), 3);
    var last = rows.length ? rows[rows.length - 1].nums : [], prev = rows.length > 1 ? rows[rows.length - 2].nums : [], vs = [];
    for (j = 0; j < last.length; j++) if (prev.indexOf(last[j]) >= 0) vs.push(last[j]);
    add(ptUniq(vs, ctx10), 2);
    var d10 = tqTailDist(tqFlat(ctx10)), list = [];
    for (i = 0; i <= 9; i++) list.push([i, d10[i] || 0]);
    list.sort(function (a, b) { return b[1] - a[1] || a[0] - b[0]; });
    var hot = [list[0][0], list[1][0], list[2][0]], tn = [];
    for (v = ctx10.from; v <= ctx10.to; v++) if (hot.indexOf(v % 10) >= 0) tn.push(v);
    add(tn, 1.5);
    var rows30 = ctx30.rows, map = {}, k;
    for (i = 0; i < rows30.length; i++) {
      for (j = 0; j < rows30[i].nums.length; j++) {
        var n2 = rows30[i].nums[j];
        if (!map[n2]) map[n2] = [];
        if (map[n2].length === 0 || map[n2][map[n2].length - 1] !== i) map[n2].push(i);
      }
    }
    var dn = [];
    for (v = ctx30.from; v <= ctx30.to; v++) {
      var pos = map[v] || [];
      if (pos.length < 2) continue;
      var sum = 0;
      for (k = 1; k < pos.length; k++) sum += pos[k] - pos[k - 1];
      var avg = sum / (pos.length - 1), cur = rows30.length - 1 - pos[pos.length - 1];
      if (cur >= avg - 0.6) dn.push(v);
    }
    add(ptUniq(dn, ctx30), 2);
    var rnd = tqRng('pt|' + g.id + '|' + tqNextIssue(g.id) + '|' + tqTabId(tab));
    var freq = tqFreqAll(ctx30), out = [];
    for (v = ctx10.from; v <= ctx10.to; v++) {
      var base = score[v] || 0;
      var fq = freq[v] ? freq[v].f : 0;
      var sc = base * 2 + fq * 0.15 + rnd() * 0.9;
      out.push({ n: v, sc: sc, base: base, f: fq });
    }
    out.sort(function (a, b) { return b.sc - a.sc || a.n - b.n; });
    return out;
  }
  function ptMergedBlock(g, tab, ctx10, ctx30) {
    var out = ptMerged(g, tab, ctx10, ctx30), need = g.id === 'kl8' ? 10 : ctx10.per;
    var top = out.slice(0, need), nums = [], i, s = '';
    for (i = 0; i < top.length; i++) { nums.push(top[i].n); s += (i ? '　' : '') + top[i].n + '（' + top[i].base + ' 分）'; }
    nums.sort(function (a, b) { return a - b; });
    return tqBalls(nums, ctx10.isMulti ? 'red' : 'blue') + tqLines([
      ['综合推出的号', nums.join(' ')],
      ['怎么来的', 'A 斜连 3 分 · B 竖连 2 分 · C 胆尾 1.5 分 · D 到期 2 分，再按期号微调'],
      ['每个号的分', s]
    ]);
  }
  function ptRuleHTML(g, tab, ctx10, ctx30, id) {
    if (id === 'p-near') return ptNear(g, ctx30);
    if (id === 'p-repeat') return ptRepeatPick(g, ctx30);
    if (id === 'p-zone') return ptZoneBack(g, ctx30);
    if (id === 'p-merge') return ptMergedBlock(g, tab, ctx10, ctx30);
    return tqLines([['近 ' + ctx10.n + ' 期', '这一条等开出下一期后自动补上']]);
  }
  var PT_VIP = [
    { name: '邻号 / 重号', items: [['p-near', '邻号追击'], ['p-repeat', '重号续出']] },
    { name: '分区', items: [['p-zone', '分区回补']] },
    { name: '汇总', items: [['p-merge', '综合推号']] }
  ];
  function ptVipRow(g, tab, ctx10, ctx30, items) {
    var h = '<div class="tq-btns">', i, id, label;
    for (i = 0; i < items.length; i++) {
      id = items[i][0]; label = items[i][1];
      h += '<div class="tq-btn' + (st.pq === id ? ' on' : '') + '" role="button" tabindex="0" data-pq-rule="' + esc(id) + '">' + label + '</div>';
    }
    h += '</div>';
    for (i = 0; i < items.length; i++) {
      if (items[i][0] === st.pq) {
        h += '<div class="tq-res"><div class="tq-res-h"><span>' + items[i][1] + ' · 近 ' + ctx30.n + ' 期</span><em>再点一次收起</em></div>' + ptRuleHTML(g, tab, ctx10, ctx30, items[i][0]) + '</div>';
      }
    }
    return h;
  }
  function ptBottom(g, tabs) {
    /* 统一取号：读构建期算好的 REC（原来这套「综合推号」的算法结果还在
       「综合推号」那条规则里能看，底部这张卡只放统一号） */
    var uni = tqRecUnified(g.id, '🎯 本期推荐号码');
    if (uni) return uni;
    var issue = tqNextIssue(g.id);
    var h = '<div class="tq-rec"><div class="tq-rec-h">🎯 综合推出的号<span>' + (issue ? ('第 ' + esc(issue) + ' 期') : '') + '</span></div>';
    if (g.type === 'digit') {
      var pos = '', p, i;
      for (p = 0; p < tabs.length; p++) {
        var c10 = ptCtx(g, tabs[p], PT_NEAR), c30 = ptCtx(g, tabs[p], SPAN);
        var o = ptMerged(g, tabs[p], c10, c30);
        if (o.length) pos += (p ? '　' : '') + tabs[p].label + ' ' + o[0].n;
      }
      var pooled = ptCtx(g, { key: 'main', pos: null, label: '全部位', from: 0, to: 9, sub: '' }, PT_NEAR);
      var pooled30 = ptCtx(g, { key: 'main', pos: null, label: '全部位', from: 0, to: 9, sub: '' }, SPAN);
      var po = ptMerged(g, pooled, pooled, pooled30), six = [], j;
      for (j = 0; j < Math.min(6, po.length); j++) six.push(po[j].n);
      six.sort(function (a, b) { return a - b; });
      h += '<div class="tq-rec-row"><span class="tq-rec-k">定位号</span><span class="tq-rec-t">' + pos + '</span></div>';
      h += '<div class="tq-rec-row"><span class="tq-rec-k">组选 6 码</span>' + tqBalls(six, 'digit') + '</div>';
      h += '<div class="tq-warn">⚠️ 仅供参考，不保证中奖</div>';
      return h + '</div>';
    }
    var redTab = tabs[0], r10 = ptCtx(g, redTab, PT_NEAR), r30 = ptCtx(g, redTab, SPAN);
    var ro = ptMerged(g, redTab, r10, r30), rn = [], i2;
    for (i2 = 0; i2 < Math.min(r10.per, ro.length); i2++) rn.push(ro[i2].n);
    rn.sort(function (a, b) { return a - b; });
    h += '<div class="tq-rec-row"><span class="tq-rec-k">' + esc(redTab.label) + '</span>' + tqBalls(rn, 'red') + '</div>';
    if (tabs.length > 1) {
      var bt = tabs[1], b10 = ptCtx(g, bt, PT_NEAR), b30 = ptCtx(g, bt, SPAN);
      var bo = ptMerged(g, bt, b10, b30), bn = [], j2;
      for (j2 = 0; j2 < Math.min(b10.per, bo.length); j2++) bn.push(bo[j2].n);
      bn.sort(function (a, b) { return a - b; });
      h += '<div class="tq-rec-row"><span class="tq-rec-k">' + esc(bt.label) + '</span>' + tqBalls(bn, 'blue') + '</div>';
    }
    h += '<div class="tq-warn">⚠️ 仅供参考，不保证中奖</div>';
    return h + '</div>';
  }
  function pagePattern() {
    var g = gameById(st.game);
    var tabs = tqTabs(g);
    if (!tabs.length) return none('没有可分析的区域', '这个彩种还没有配置号码区。');
    if (!tqTabOf(tabs, st.pqTab)) st.pqTab = tqTabId(tabs[0]);
    var tab = tqTabOf(tabs, st.pqTab);
    var ctx10 = ptCtx(g, tab, PT_NEAR), ctx30 = ptCtx(g, tab, SPAN);
    var h = '';
    if (st.pickGame) h += '<div class="tq-games">' + chipsGame() + '</div>';
    h += '<div class="tq-tabs">';
    for (var i = 0; i < tabs.length; i++) {
      var id = tqTabId(tabs[i]);
      h += '<div class="tq-tab' + (id === st.pqTab ? ' on' : '') + '" role="button" tabindex="0" data-pq-tab="' + esc(id) + '">' + esc(tabs[i].label) + '</div>';
    }
    h += '</div>';
    h += '<div class="tq-sub">' + esc(g.name) + ' · ' + esc(tab.label) + ' · 主看近 ' + PT_NEAR + ' 期，近 ' + SPAN + ' 期做对照</div>';
    if (!ctx10.n) {
      h += '<div class="tq-empty"><b>近 ' + PT_NEAR + ' 期样本不足</b>这个彩种本页还没有足够的开奖期数，开出几期后这里会自动补上。</div>';
      return h + ptBottom(g, tabs);
    }
    h += '<div class="tq-sec"><div class="tq-sec-h">基础规律<span class="tq-free">免费查看</span></div>';
    h += ptSlant(g, ctx10, ctx30);
    h += ptVertical(g, ctx30);
    h += ptTail(g, ctx10, ctx30);
    h += ptCycle(g, ctx30);
    if (ctx30.isMulti) h += ptConsecBlock(g, ctx30);
    h += '</div>';
    var grp = '';
    for (var v = 0; v < PT_VIP.length; v++) {
      grp += '<div class="tq-grp"><div class="tq-grp-h">' + PT_VIP[v].name + '</div>' + ptVipRow(g, tab, ctx10, ctx30, PT_VIP[v].items) + '</div>';
    }
    h += '<div class="tq-sec"><div class="tq-vip-bar">👑 VIP 规律${VIP_FREE_TAG}</div>' + grp + '</div>';
    h += ptBottom(g, tabs);
    h += note('四套模板都只按近 ' + PT_NEAR + ' / ' + SPAN + ' 期已开出的号码现算，每期开奖后自动更新；综合号用下一期期号做种子，同一期固定、换期就变。');
    return h;
  }
  /* 红球才有的连号规律（蓝球每期 1 个号，没有连号这个概念，所以蓝球不显示） */
  function ptConsecBlock(g, ctx) {
    var days = 0, tot = 0, mx = 0, i, j, runs, type = {}, s = '';
    for (i = 0; i < ctx.rows.length; i++) {
      runs = tqRuns(ctx.rows[i].nums);
      if (runs.length) days++;
      tot += runs.length;
      if (runs.length > mx) mx = runs.length;
      for (j = 0; j < runs.length; j++) type[runs[j]] = (type[runs[j]] || 0) + 1;
    }
    var hot = [], k;
    for (k in type) if (type.hasOwnProperty(k)) hot.push([Number(k), type[k]]);
    hot.sort(function (a, b) { return b[1] - a[1] || a[0] - b[0]; });
    for (i = 0; i < hot.length; i++) s += (i ? '　' : '') + hot[i][0] + ' 连（' + hot[i][1] + ' 组）';
    return ptBlk('E · 连号规律', '红球专属', tqLines([
      ['有连号的期数', days + ' / ' + ctx.n + ' 期（' + tqPct(days, ctx.n) + '）'],
      ['连号总组数', tot + ' 组　单期最多 ' + mx + ' 组'],
      ['连号长度分布', s || '还没有连号'],
      ['说明', '蓝球每期只有 1 个号，没有连号 / 同尾组数这些指标 —— 所以这两项只在红球 Tab 出现']
    ]));
  }

  /* ================= ⑥ 均线分析 → 杀号和选号 =================
     ------------------------------------------------------------
     用户原话：「均线分析这个模板 你改称为杀号和选号 这个你也自己学习一套模板计算
               永远用几套规则 每一期计算」
     结构（和趋势分析同一套模板）：
       Tab：【杀号】|【选号】
       【基础规则】[免费查看] → 浅粉底 / 深红字小圆角按钮（点开看这条规则的具体结果）
       【VIP 规则】深棕横条 + 👑 → 分组按钮
       底部：🎯 本期号码 → 杀号 + 选号（下一期期号做种子：同期固定、换期全变）
     规则（几套一起打分，全部按近 30 期现算，没有一条是编的）：
       杀号：冷号杀 / 尾数冷杀 / 连出杀 / 上期重号杀 / 过热杀 / 超长遗漏(回补) /
             遗漏排行 / 理论遗漏 / 分区杀 / 和值偏离杀 / 连号段杀 / 汇总杀号
       选号：热号 / 遗漏回补 / 奇偶平衡 / 和值合理 / 三区覆盖 / 尾数覆盖 /
             连号适度 / 综合 12 码 / 6+1 方案 / 胆拖建议
     ⚠️ 这段在模板字符串里：只写单引号，不写反引号，不写代码里的反斜杠。
     ============================================================ */
  function maRuleCtx(g) {
    if (g.type === 'digit') {
      return tqCtx(g, { key: 'main', pos: null, label: '全部位', from: 0, to: 9, sub: '' });
    }
    var tabs = tqTabs(g);
    return tqCtx(g, tabs[0]);
  }
  function maTheory(ctx) { return (ctx.to - ctx.from + 1) / (ctx.per || 1); }
  function maColdList(ctx, k) {
    var map = tqFreqAll(ctx), list = [], v;
    for (v = ctx.from; v <= ctx.to; v++) list.push({ n: v, f: map[v].f, gap: map[v].gap });
    list.sort(function (a, b) { return (a.f - b.f) || (b.gap - a.gap) || (a.n - b.n); });
    return list.slice(0, k);
  }
  function maHotList(ctx, k) {
    var map = tqFreqAll(ctx), list = [], v;
    for (v = ctx.from; v <= ctx.to; v++) list.push({ n: v, f: map[v].f, gap: map[v].gap });
    list.sort(function (a, b) { return (b.f - a.f) || (a.gap - b.gap) || (a.n - b.n); });
    return list.slice(0, k);
  }
  function maChain(ctx) {
    var out = [], seen = {}, i, n = ctx.rows.length;
    if (n < 3) return out;
    var a = ctx.rows[n - 1].nums, b = ctx.rows[n - 2].nums, c = ctx.rows[n - 3].nums;
    for (i = 0; i < a.length; i++) {
      var v = a[i];
      if (b.indexOf(v) >= 0 && c.indexOf(v) >= 0 && !seen[v]) { seen[v] = 1; out.push(v); }
    }
    out.sort(function (x, y) { return x - y; });
    return out;
  }
  function maLastNums(ctx) { return ctx.rows.length ? ctx.rows[ctx.rows.length - 1].nums : []; }
  function maKillAll(ctx) {
    var set = {}, out = [], i, arr;
    function add(a) {
      for (var q = 0; q < a.length; q++) if (!set[a[q]] && a[q] >= ctx.from && a[q] <= ctx.to) { set[a[q]] = 1; out.push(a[q]); }
    }
    arr = maColdList(ctx, 3);
    var c1 = [];
    for (i = 0; i < arr.length; i++) c1.push(arr[i].n);
    add(c1);
    add(maChain(ctx));
    var last = maLastNums(ctx), map = tqFreqAll(ctx), avg = (ctx.per * ctx.n) / (ctx.to - ctx.from + 1), c2 = [];
    for (i = 0; i < last.length; i++) if (map[last[i]] && map[last[i]].f <= avg) c2.push(last[i]);
    add(c2);
    out.sort(function (a, b) { return a - b; });
    if (out.length > 8) out = out.slice(0, 8);
    return out;
  }

  /* ---------------- 杀号规则 ---------------- */
  function maKillCold(ctx) {
    var list = maColdList(ctx, 5), nums = [], s = '', i;
    for (i = 0; i < list.length; i++) {
      nums.push(list[i].n);
      s += (i ? '　' : '') + list[i].n + '（' + list[i].f + ' 次 · 已 ' + list[i].gap + ' 期没出）';
    }
    nums.sort(function (a, b) { return a - b; });
    return tqBalls(nums, 'red') + tqLines([
      ['冷号杀（5 个）', nums.join(' ')],
      ['依据', '近 30 期出现次数最少的 5 个号'],
      ['每个号', s]
    ]);
  }
  function maKillTailCold(ctx) {
    var all = tqFlat(ctx), dist = tqTailDist(all), list = [], i, v, tails, nums = [];
    for (i = 0; i <= 9; i++) list.push([i, dist[i] || 0]);
    list.sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
    tails = [list[0][0], list[1][0]];
    for (v = ctx.from; v <= ctx.to; v++) if (tails.indexOf(v % 10) >= 0) nums.push(v);
    if (nums.length > 8) nums = nums.slice(0, 8);
    return tqBalls(nums, 'red') + tqLines([
      ['杀冷尾', '尾 ' + tails[0] + '（' + list[0][1] + ' 次）· 尾 ' + tails[1] + '（' + list[1][1] + ' 次）'],
      ['对应号码', nums.join(' ')],
      ['依据', '近 30 期里出现次数最少的 2 个尾数']
    ]);
  }
  function maKillChain(ctx) {
    var nums = maChain(ctx), s = '';
    if (!nums.length) {
      var last = maLastNums(ctx);
      s = '最近 3 期没有「连续 3 期都出现」的号 —— 这一条本期不杀号。上期开出：' + last.join(' ');
      return tqLines([['连出杀', '0 个'], ['说明', s]]);
    }
    return tqBalls(nums, 'red') + tqLines([
      ['连出杀（过热）', nums.join(' ')],
      ['依据', '最近 3 期每期都开出（连出 3 期，按规则杀）']
    ]);
  }
  function maKillRepeat(ctx) {
    var last = maLastNums(ctx), map = tqFreqAll(ctx),
      avg = (ctx.per * ctx.n) / (ctx.to - ctx.from + 1), nums = [], i, s = '';
    for (i = 0; i < last.length; i++) {
      if (map[last[i]] && map[last[i]].f <= avg) { nums.push(last[i]); s += (s ? '　' : '') + last[i] + '（' + map[last[i]].f + ' 次）'; }
    }
    if (!nums.length) return tqLines([['上期重号杀', '0 个'], ['说明', '上期开出的号里没有低于平均出现次数的，这一条本期不杀号。']]);
    nums.sort(function (a, b) { return a - b; });
    return tqBalls(nums, 'red') + tqLines([
      ['上期重号杀', nums.join(' ')],
      ['依据', '上期开出、但近 30 期出现次数低于平均（' + fmt1(avg) + ' 次）'],
      ['明细', s]
    ]);
  }
  function maKillHot(ctx) {
    var map = tqFreqAll(ctx), avg = (ctx.per * ctx.n) / (ctx.to - ctx.from + 1), nums = [], v, s = '';
    for (v = ctx.from; v <= ctx.to; v++) {
      if (map[v].f >= avg * 1.6) { nums.push(v); s += (s ? '　' : '') + v + '（' + map[v].f + ' 次）'; }
    }
    if (nums.length > 6) { nums = nums.slice(0, 6); }
    if (!nums.length) return tqLines([['过热杀', '0 个'], ['说明', '没有号超过平均次数的 1.6 倍（' + fmt1(avg * 1.6) + ' 次），本期不过热。']]);
    return tqBalls(nums, 'red') + tqLines([
      ['过热杀', nums.join(' ')],
      ['门槛', '出现 ≥ ' + fmt1(avg * 1.6) + ' 次（平均 ' + fmt1(avg) + ' 次的 1.6 倍）'],
      ['明细', s]
    ]);
  }
  function maKillGapOver(ctx) {
    var map = tqFreqAll(ctx), theo = maTheory(ctx), nums = [], v, s = '';
    for (v = ctx.from; v <= ctx.to; v++) {
      if (map[v].gap >= theo * 2) { nums.push(v); s += (s ? '　' : '') + v + '（已 ' + map[v].gap + ' 期）'; }
    }
    if (!nums.length) return tqLines([['超长遗漏', '0 个'], ['说明', '没有号超过 ' + fmt1(theo * 2) + ' 期没出（理论 ' + fmt1(theo) + ' 期的 2 倍）。']]);
    return tqBalls(nums, 'blue') + tqLines([
      ['超长遗漏（按规则不杀，标为回补）', nums.join(' ')],
      ['理论遗漏', fmt1(theo) + ' 期　门槛 ' + fmt1(theo * 2) + ' 期'],
      ['说明', '遗漏太长按「回补」处理，不算杀号'],
      ['明细', s]
    ]);
  }
  function maKillGapRank(ctx) {
    var map = tqFreqAll(ctx), list = [], v, i, s = '';
    for (v = ctx.from; v <= ctx.to; v++) list.push({ n: v, f: map[v].f, gap: map[v].gap });
    list.sort(function (a, b) { return (b.gap - a.gap) || (a.f - b.f) || (a.n - b.n); });
    for (i = 0; i < Math.min(8, list.length); i++) s += (i ? '　' : '') + list[i].n + '（' + list[i].gap + ' 期）';
    return tqLines([
      ['遗漏最长的 8 个', s],
      ['理论遗漏', fmt1(maTheory(ctx)) + ' 期'],
      ['最近一期', ctx.n ? (ctx.rows[ctx.rows.length - 1].issue + ' 期 ' + ctx.rows[ctx.rows.length - 1].nums.join(' ')) : '—']
    ]);
  }
  function maKillTheory(ctx) {
    var map = tqFreqAll(ctx), theo = maTheory(ctx), over = 0, v, nums = [];
    for (v = ctx.from; v <= ctx.to; v++) { if (map[v].gap >= theo) { over++; if (map[v].gap >= theo * 2) nums.push(v); } }
    return tqLines([
      ['理论平均遗漏', fmt1(theo) + ' 期（' + (ctx.to - ctx.from + 1) + ' 个号 / 每期 ' + ctx.per + ' 个）'],
      ['当前超过理论遗漏的号', over + ' 个'],
      ['其中超过 2 倍（回补区）', nums.length ? nums.join(' ') : '没有'],
      ['口径', '遗漏 = 这个号已经多少期没出']
    ]);
  }
  function maKillZone(ctx) {
    var bands = tqBands(ctx, 3), per = tqBandCount(ctx, bands), map = tqFreqAll(ctx);
    var c = [], i;
    for (i = 0; i < bands.length; i++) c.push(bands[i].c / Math.max(1, ctx.n));
    var idx = 0;
    for (i = 1; i < c.length; i++) if (c[i] < c[idx]) idx = i;
    var list = [], v;
    for (v = bands[idx].a; v <= bands[idx].b; v++) list.push({ n: v, f: map[v].f, gap: map[v].gap });
    list.sort(function (a, b) { return (a.f - b.f) || (b.gap - a.gap) || (a.n - b.n); });
    var nums = [], s = '', j;
    for (j = 0; j < Math.min(2, list.length); j++) { nums.push(list[j].n); s += (j ? '　' : '') + list[j].n + '（' + list[j].f + ' 次）'; }
    nums.sort(function (a, b) { return a - b; });
    var names = ['一区', '二区', '三区'];
    return tqBalls(nums, 'red') + tqLines([
      ['最冷的区', names[idx] + '（' + bands[idx].a + '~' + bands[idx].b + '）平均每期 ' + fmt1(c[idx]) + ' 个'],
      ['分区杀', nums.join(' ')],
      ['明细', s]
    ]);
  }
  function maKillSumDev(ctx) {
    var sums = tqSums(ctx), avg = 0, i, last5 = 0, n5 = 0, split = tqSplit(ctx);
    for (i = 0; i < sums.length; i++) avg += sums[i];
    avg = avg / (sums.length || 1);
    for (i = Math.max(0, sums.length - 5); i < sums.length; i++) { last5 += sums[i]; n5++; }
    last5 = last5 / (n5 || 1);
    var high = last5 > avg, map = tqFreqAll(ctx), nums = [], v;
    var lo = high ? split + 1 : ctx.from, hi = high ? ctx.to : split;
    var list = [];
    for (v = lo; v <= hi; v++) list.push({ n: v, f: map[v].f, gap: map[v].gap });
    list.sort(function (a, b) { return (a.f - b.f) || (b.gap - a.gap) || (a.n - b.n); });
    for (i = 0; i < Math.min(2, list.length); i++) nums.push(list[i].n);
    nums.sort(function (a, b) { return a - b; });
    return tqBalls(nums, 'red') + tqLines([
      ['近 5 期和值均值', fmt1(last5) + '（30 期均值 ' + fmt1(avg) + '）'],
      ['判断', high ? '近 5 期偏高 → 杀大号区（' + (split + 1) + '~' + ctx.to + '）最冷 2 个' : '近 5 期偏低 → 杀小号区（' + ctx.from + '~' + split + '）最冷 2 个'],
      ['和值偏离杀', nums.join(' ')]
    ]);
  }
  function maKillConsecSeg(ctx) {
    var n = ctx.rows.length, runs = [], i, nums = [];
    if (n >= 3) {
      var c = 0;
      for (i = n - 3; i < n; i++) if (tqRuns(ctx.rows[i].nums).length) c++;
      if (c < 3) {
        return tqLines([['连号段杀', '0 个'], ['说明', '最近 3 期不是每期都有连号（有连号 ' + c + ' 期），这一条本期不杀号。']]);
      }
    }
    var last = maLastNums(ctx), map = tqFreqAll(ctx);
    runs = tqRuns(last);
    if (!runs.length) return tqLines([['连号段杀', '0 个'], ['说明', '最近一期没有连号，这一条本期不杀号。']]);
    var s = last.slice().sort(function (a, b) { return a - b; }), j = 0, k;
    while (j < s.length) {
      k = j;
      while (k + 1 < s.length && s[k + 1] - s[k] === 1) k++;
      if (k > j) {
        for (var q = j; q <= k; q++) nums.push({ n: s[q], f: map[s[q]].f });
      }
      j = k + 1;
    }
    nums.sort(function (a, b) { return a.f - b.f || a.n - b.n; });
    var out = [], seen = {};
    for (i = 0; i < nums.length && out.length < 2; i++) if (!seen[nums[i].n]) { seen[nums[i].n] = 1; out.push(nums[i].n); }
    out.sort(function (a, b) { return a - b; });
    return tqBalls(out, 'red') + tqLines([
      ['连号段杀', out.join(' ')],
      ['依据', '最近 3 期每期都有连号（过热），杀上期连号段里最冷的号'],
      ['上期连号', last.join(' ')]
    ]);
  }
  function maKillSum(ctx) {
    var out = maKillAll(ctx), s = out.join(' ');
    return tqBalls(out, 'red') + tqLines([
      ['汇总杀号（' + out.length + ' 个）', s || '0 个'],
      ['合并来自', '冷号杀 + 连出杀 + 上期重号杀（去重后最多 8 个）'],
      ['用在哪', '底部「杀号」一行就是这个汇总']
    ]);
  }

  /* ---------------- 选号规则 ---------------- */
  function maPickHot(ctx) {
    var list = maHotList(ctx, 6), nums = [], s = '', i;
    for (i = 0; i < list.length; i++) {
      nums.push(list[i].n);
      s += (i ? '　' : '') + list[i].n + '（' + list[i].f + ' 次 · 已 ' + list[i].gap + ' 期没出）';
    }
    nums.sort(function (a, b) { return a - b; });
    return tqBalls(nums, 'red') + tqLines([
      ['热号（6 个）', nums.join(' ')],
      ['依据', '近 30 期出现次数最多'],
      ['每个号', s]
    ]);
  }
  function maPickBack(ctx) {
    var map = tqFreqAll(ctx), theo = maTheory(ctx), nums = [], v, s = '';
    for (v = ctx.from; v <= ctx.to; v++) {
      if (map[v].gap >= theo * 1.5 && map[v].gap <= theo * 2.5 + 1) { nums.push(v); s += (s ? '　' : '') + v + '（已 ' + map[v].gap + ' 期）'; }
    }
    if (nums.length > 8) nums = nums.slice(0, 8);
    if (!nums.length) return tqLines([['遗漏回补', '0 个'], ['说明', '没有号落在 ' + fmt1(theo * 1.5) + ' ~ ' + fmt1(theo * 2.5) + ' 期这个回补区间。']]);
    return tqBalls(nums, 'blue') + tqLines([
      ['遗漏回补', nums.join(' ')],
      ['区间', fmt1(theo * 1.5) + ' ~ ' + fmt1(theo * 2.5) + ' 期（理论 ' + fmt1(theo) + ' 期）'],
      ['明细', s]
    ]);
  }
  function maPickOdd(ctx) {
    var all = tqFlat(ctx), odd = 0, even = 0, i;
    for (i = 0; i < all.length; i++) { if (all[i] % 2) odd++; else even++; }
    var need = ctx.per, target = Math.round(need / 2);
    var hOdd = ctx.rows.length ? (ctx.rows[ctx.rows.length - 1].nums.length) : need;
    return tqLines([
      ['近 30 期 奇 : 偶', odd + ' : ' + even + '（' + tqPct(odd, all.length) + ' : ' + tqPct(even, all.length) + '）'],
      ['本期建议', '奇 ' + target + ' 个 : 偶 ' + (need - target) + ' 个（每期 ' + need + ' 个，取最接近的一半一半）'],
      ['为什么', '历史上「一半一半」出现次数最多，全奇 / 全偶极少'],
      ['最近一期奇偶', ctx.n ? ctx.rows[ctx.rows.length - 1].nums.join(' ') : '—']
    ]);
  }
  function maPickSumFit(ctx) {
    var sums = tqSums(ctx), avg = 0, i;
    for (i = 0; i < sums.length; i++) avg += sums[i];
    avg = avg / (sums.length || 1);
    var lo = avg * 0.8, hi = avg * 1.2, inRange = 0;
    for (i = 0; i < sums.length; i++) if (sums[i] >= lo && sums[i] <= hi) inRange++;
    return tqLines([
      ['近 30 期 和值均值', fmt1(avg)],
      ['合理区间（±20%）', fmt1(lo) + ' ~ ' + fmt1(hi)],
      ['落在这个区间的期数', inRange + ' / ' + ctx.n + ' 期（' + tqPct(inRange, ctx.n) + '）'],
      ['本期目标', '组号时把和值落进 ' + Math.round(lo) + ' ~ ' + Math.round(hi) + ' 这一档']
    ]);
  }
  function maPickZoneCover(ctx) {
    var bands = tqBands(ctx, 3), per = tqBandCount(ctx, bands), i, c = [];
    for (i = 0; i < bands.length; i++) c.push(bands[i].c / Math.max(1, ctx.n));
    var need = ctx.per, perN = Math.max(1, Math.floor(need / bands.length));
    var names = ['一区', '二区', '三区'], s = '';
    for (i = 0; i < bands.length; i++) s += (i ? '　' : '') + names[i] + '（' + bands[i].a + '~' + bands[i].b + '）平均 ' + fmt1(c[i]) + ' 个';
    return tqLines([
      ['每期个数', need + ' 个 → 每区建议 ' + perN + ' 个，剩余 ' + (need - perN * bands.length) + ' 个给最热的区'],
      ['三区均值', s],
      ['最近一期分布', per.length ? per[per.length - 1].join(' : ') : '—']
    ]);
  }
  function maPickTailCover(ctx) {
    var all = tqFlat(ctx), dist = tqTailDist(all), list = [], i, s = '';
    for (i = 0; i <= 9; i++) list.push([i, dist[i] || 0]);
    list.sort(function (a, b) { return b[1] - a[1] || a[0] - b[0]; });
    for (i = 0; i < 4; i++) s += (i ? '　' : '') + '尾 ' + list[i][0] + '（' + list[i][1] + ' 次）';
    return tqDistHTML(dist) + tqLines([
      ['最热的 4 个尾数', s],
      ['建议', '本期组号至少覆盖其中 3 个尾数，避免全部同尾'],
      ['同尾说明', '同一尾数最多留 2 个（如 12 / 22）']
    ]);
  }
  function maPickConsecKeep(ctx) {
    var days = 0, i, runs;
    for (i = 0; i < ctx.rows.length; i++) { runs = tqRuns(ctx.rows[i].nums); if (runs.length) days++; }
    var list = maHotList(ctx, 12), pair = null, j, k;
    for (j = 0; j < list.length && !pair; j++) {
      for (k = 0; k < list.length; k++) {
        if (Math.abs(list[j].n - list[k].n) === 1) { pair = [Math.min(list[j].n, list[k].n), Math.max(list[j].n, list[k].n)]; break; }
      }
    }
    var nums = pair || [];
    return (nums.length ? tqBalls(nums, 'red') : '') + tqLines([
      ['连号出现率', days + ' / ' + ctx.n + ' 期（' + tqPct(days, ctx.n) + '）'],
      ['建议', '保留 1 组连号（最常见），不要超过 2 组'],
      ['可选连号', nums.length ? (nums[0] + ' / ' + nums[1]) : '热号里没有相邻的两个']
    ]);
  }
  function maPickPool(ctx) {
    var map = tqFreqAll(ctx), theo = maTheory(ctx), list = [], v, i, s = '';
    for (v = ctx.from; v <= ctx.to; v++) {
      var it = map[v] || { f: 0, gap: 99 };
      var mid = (it.gap >= theo * 0.8 && it.gap <= theo * 2.2) ? 1.4 : 0;
      list.push({ n: v, f: it.f, gap: it.gap, sc: it.f + mid });
    }
    list.sort(function (a, b) { return b.sc - a.sc || a.n - b.n; });
    var nums = [];
    for (i = 0; i < Math.min(12, list.length); i++) { nums.push(list[i].n); s += (i ? '　' : '') + list[i].n + '（' + list[i].f + ' 次）'; }
    nums.sort(function (a, b) { return a - b; });
    return tqBalls(nums, 'red') + tqLines([
      ['综合 12 码', nums.join(' ')],
      ['打分', '出现次数 + 遗漏适中加分'],
      ['明细', s]
    ]);
  }
  function maPlan(g, ctx, need, rnd) {
    var map = tqFreqAll(ctx), bands = tqBands(ctx, 3), list = [], v, i, j;
    var theo = maTheory(ctx);
    for (v = ctx.from; v <= ctx.to; v++) {
      var it = map[v] || { f: 0, gap: 99 };
      var mid = (it.gap >= theo * 0.8 && it.gap <= theo * 2.2) ? 1.4 : 0;
      list.push({ n: v, f: it.f, gap: it.gap, sc: it.f + mid + rnd() * 1.2 });
    }
    list.sort(function (a, b) { return b.sc - a.sc || a.n - b.n; });
    var plan = [], used = {}, perN = Math.max(1, Math.floor(need / bands.length)), bi;
    for (bi = 0; bi < bands.length && plan.length < need; bi++) {
      var got = 0;
      for (j = 0; j < list.length && got < perN && plan.length < need; j++) {
        var x = list[j];
        if (used[x.n] || x.n < bands[bi].a || x.n > bands[bi].b) continue;
        used[x.n] = 1; plan.push(x); got++;
      }
    }
    for (j = 0; j < list.length && plan.length < need; j++) if (!used[list[j].n]) { used[list[j].n] = 1; plan.push(list[j]); }
    var odd = 0, target = Math.round(need / 2), guard = 0, wr, add;
    for (i = 0; i < plan.length; i++) if (plan[i].n % 2) odd++;
    while (odd < target && guard++ < 40) {
      add = null;
      for (j = 0; j < list.length; j++) if (!used[list[j].n] && list[j].n % 2) { add = list[j]; break; }
      wr = -1;
      for (i = 0; i < plan.length; i++) if (plan[i].n % 2 === 0 && (wr < 0 || plan[i].sc < plan[wr].sc)) wr = i;
      if (!add || wr < 0) break;
      used[plan[wr].n] = 0; used[add.n] = 1; plan[wr] = add; odd++;
    }
    guard = 0;
    while (odd > target && guard++ < 40) {
      add = null;
      for (j = 0; j < list.length; j++) if (!used[list[j].n] && list[j].n % 2 === 0) { add = list[j]; break; }
      wr = -1;
      for (i = 0; i < plan.length; i++) if (plan[i].n % 2 && (wr < 0 || plan[i].sc < plan[wr].sc)) wr = i;
      if (!add || wr < 0) break;
      used[plan[wr].n] = 0; used[add.n] = 1; plan[wr] = add; odd--;
    }
    var nums = [];
    for (i = 0; i < plan.length; i++) nums.push(plan[i].n);
    nums.sort(function (a, b) { return a - b; });
    return nums;
  }
  function maPlanInfo(ctx, nums) {
    var sum = 0, odd = 0, i, bands = tqBands(ctx, 3), cnt = [0, 0, 0], runs = tqRuns(nums);
    for (i = 0; i < nums.length; i++) { sum += nums[i]; if (nums[i] % 2) odd++; }
    for (i = 0; i < nums.length; i++) {
      for (var b = 0; b < bands.length; b++) if (nums[i] >= bands[b].a && nums[i] <= bands[b].b) { cnt[b]++; break; }
    }
    var sums = tqSums(ctx), avg = 0;
    for (i = 0; i < sums.length; i++) avg += sums[i];
    avg = avg / (sums.length || 1);
    return { sum: sum, odd: odd, even: nums.length - odd, cnt: cnt, runs: runs, avg: avg };
  }
  function maPickPlan(g, issue) {
    var ctx = maRuleCtx(g), need = g.id === 'kl8' ? 10 : ctx.per;
    var rnd = tqRng('ma-plan|' + g.id + '|' + String(issue || '0'));
    var nums = maPlan(g, ctx, need, rnd), info = maPlanInfo(ctx, nums), i, s = '';
    for (i = 0; i < info.cnt.length; i++) s += (i ? ' : ' : '') + info.cnt[i];
    return tqBalls(nums, 'red') + tqLines([
      ['方案号码（' + nums.length + ' 个）', nums.join(' ')],
      ['奇偶', info.odd + ' : ' + info.even],
      ['三区分布', s],
      ['和值', info.sum + '（近 30 期均值 ' + fmt1(info.avg) + '）'],
      ['连号', info.runs.length ? ('有 ' + info.runs.length + ' 组') : '没有（可接受）'],
      ['怎么来的', '出现次数 + 遗漏适中 + 三区各取 + 奇偶对半，四项一起打分']
    ]);
  }
  function maPickDanTuo(g, issue) {
    var ctx = maRuleCtx(g), hot = maHotList(ctx, 3), list = [], v, map = tqFreqAll(ctx), i, s = '';
    var nums = [], used = {};
    for (i = 0; i < hot.length; i++) { nums.push(hot[i].n); used[hot[i].n] = 1; }
    var pool = maHotList(ctx, 18), drag = [];
    for (i = 0; i < pool.length && drag.length < 6; i++) if (!used[pool[i].n]) { drag.push(pool[i].n); used[pool[i].n] = 1; }
    nums.sort(function (a, b) { return a - b; });
    drag.sort(function (a, b) { return a - b; });
    var s1 = nums.join(' '), s2 = drag.join(' ');
    return tqLines([
      ['3 个胆码', s1],
      ['6 个拖码', s2],
      ['怎么用', '胆码每注都要带上，拖码任选 2~3 个组合'],
      ['依据', '胆码 = 近 30 期最热的前 3 个；拖码 = 热度紧随其后的 6 个']
    ]);
  }
  function maRuleHTML(g, ctx, id) {
    if (id === 'k-cold') return maKillCold(ctx);
    if (id === 'k-tail') return maKillTailCold(ctx);
    if (id === 'k-chain') return maKillChain(ctx);
    if (id === 'k-repeat') return maKillRepeat(ctx);
    if (id === 'k-hot') return maKillHot(ctx);
    if (id === 'k-gap-over') return maKillGapOver(ctx);
    if (id === 'k-gap-rank') return maKillGapRank(ctx);
    if (id === 'k-theory') return maKillTheory(ctx);
    if (id === 'k-zone') return maKillZone(ctx);
    if (id === 'k-sum') return maKillSumDev(ctx);
    if (id === 'k-seg') return maKillConsecSeg(ctx);
    if (id === 'k-all') return maKillSum(ctx);
    if (id === 's-hot') return maPickHot(ctx);
    if (id === 's-back') return maPickBack(ctx);
    if (id === 's-odd') return maPickOdd(ctx);
    if (id === 's-sum') return maPickSumFit(ctx);
    if (id === 's-zone') return maPickZoneCover(ctx);
    if (id === 's-tail') return maPickTailCover(ctx);
    if (id === 's-consec') return maPickConsecKeep(ctx);
    if (id === 's-pool') return maPickPool(ctx);
    if (id === 's-plan') return maPickPlan(g, tqNextIssue(g.id));
    if (id === 's-dan') return maPickDanTuo(g, tqNextIssue(g.id));
    return tqLines([['近 30 期', '这一条等开出下一期后自动补上']]);
  }

  var MA_KILL_BASIC = [['k-cold', '冷号杀'], ['k-tail', '尾数冷杀'], ['k-chain', '连出杀'], ['k-repeat', '上期重号杀']];
  var MA_KILL_VIP = [
    { name: '冷热', items: [['k-hot', '过热杀'], ['k-gap-rank', '遗漏排行']] },
    { name: '遗漏', items: [['k-gap-over', '超长遗漏'], ['k-theory', '理论遗漏']] },
    { name: '结构', items: [['k-zone', '分区杀'], ['k-sum', '和值偏离杀'], ['k-seg', '连号段杀']] },
    { name: '汇总', items: [['k-all', '汇总杀号']] }
  ];
  var MA_PICK_BASIC = [['s-hot', '热号'], ['s-back', '遗漏回补'], ['s-odd', '奇偶平衡'], ['s-sum', '和值合理']];
  var MA_PICK_VIP = [
    { name: '分区', items: [['s-zone', '三区覆盖']] },
    { name: '尾数', items: [['s-tail', '尾数覆盖']] },
    { name: '连号', items: [['s-consec', '连号适度']] },
    { name: '号码池', items: [['s-pool', '综合 12 码']] },
    { name: '方案', items: [['s-plan', '本期方案'], ['s-dan', '胆拖建议']] }
  ];

  function maRuleRow(g, ctx, items) {
    var h = '<div class="tq-btns">', i, id, label;
    for (i = 0; i < items.length; i++) {
      id = items[i][0]; label = items[i][1];
      h += '<div class="tq-btn' + (st.mq === id ? ' on' : '') + '" role="button" tabindex="0" data-mq-rule="' + esc(id) + '">' + label + '</div>';
    }
    h += '</div>';
    for (i = 0; i < items.length; i++) {
      if (items[i][0] === st.mq) {
        h += '<div class="tq-res"><div class="tq-res-h"><span>' + items[i][1] + ' · 近 ' + ctx.n + ' 期</span><em>再点一次收起</em></div>' + maRuleHTML(g, ctx, items[i][0]) + '</div>';
      }
    }
    return h;
  }
  function maBottom(g) {
    /* 统一取号：选号读构建期算好的 REC（8 个页面同一组）；
       「杀号」这一页自己的规则照旧保留 —— 它是这一页的卖点，不是号码。 */
    var R = (REC && REC[g.id]) ? REC[g.id] : null;
    var issue = R ? R.issue : tqNextIssue(g.id);
    var h = '<div class="tq-rec"><div class="tq-rec-h">🎯 本期号码<span>' + (issue ? ('第 ' + esc(issue) + ' 期') : '') + '</span></div>';
    if (g.type === 'digit') {
      var tabs = tqTabs(g), need = tabs.length, kr = '', p;
      for (p = 0; p < need; p++) {
        var fp = tqFreqOf(g.id, 'main', p), list = [], v;
        for (v = 0; v <= 9; v++) list.push({ n: v, f: (fp[v] ? fp[v].f : 0), gap: (fp[v] ? fp[v].gap : 99) });
        list.sort(function (a, b) { return (a.f - b.f) || (b.gap - a.gap) || (a.n - b.n); });
        kr += (p ? '　' : '') + tabs[p].label + ' 杀 ' + list[0].n + ' ' + list[1].n;
      }
      h += '<div class="tq-rec-row"><span class="tq-rec-k">杀号</span><span class="tq-rec-t">' + kr + '</span></div>';
    } else {
      var ctx = maRuleCtx(g), kill = maKillAll(ctx);
      h += '<div class="tq-rec-row"><span class="tq-rec-k">杀号</span>' + tqBalls(kill, 'kill') + '</div>';
    }
    if (R && R.blocks) {
      for (var i = 0; i < R.blocks.length; i++) {
        var b = R.blocks[i];
        h += '<div class="tq-rec-row"><span class="tq-rec-k">' + esc(b.label) + '</span>' +
          recBallsHtml(b.nums, b.kind, b.color) + '</div>';
      }
      h += '<div class="tq-rec-basis">打分口径：' + esc(R.basis) + '；统计窗口 近 ' + esc(R.span) + ' 期</div>';
    }
    h += '<div class="tq-warn">⚠️ 仅供参考，不保证中奖</div>';
    return h + '</div>';
  }
  function pageMa() {
    var g = gameById(st.game);
    if (!st.mqTab || (st.mqTab !== 'kill' && st.mqTab !== 'pick')) st.mqTab = 'kill';
    var ctx = maRuleCtx(g);
    var h = '';
    if (st.pickGame) h += '<div class="tq-games">' + chipsGame() + '</div>';
    h += '<div class="tq-tabs">' +
      '<div class="tq-tab' + (st.mqTab === 'kill' ? ' on' : '') + '" role="button" tabindex="0" data-mq-tab="kill">杀号</div>' +
      '<div class="tq-tab' + (st.mqTab === 'pick' ? ' on' : '') + '" role="button" tabindex="0" data-mq-tab="pick">选号</div>' +
      '</div>';
    h += '<div class="tq-sub">' + esc(g.name) + ' · ' + (st.mqTab === 'kill' ? '按几套规则算出「这期不太可能出」的号' : '按几套规则算出「这期可以重点看」的号') + ' · 近 ' + SPAN + ' 期统计</div>';
    if (!ctx.n) {
      h += '<div class="tq-empty"><b>近 ' + SPAN + ' 期样本不足</b>这个彩种本页还没有足够的开奖期数，开出几期后这里会自动补上。</div>';
      return h + maBottom(g);
    }
    var basic = st.mqTab === 'kill' ? MA_KILL_BASIC : MA_PICK_BASIC;
    var vip = st.mqTab === 'kill' ? MA_KILL_VIP : MA_PICK_VIP;
    if (st.mqTab === 'kill' && g.type === 'digit') {
      basic = basic.slice(0);
      basic.unshift(['k-cold', '定位冷杀']);
    }
    var secName = st.mqTab === 'kill' ? '基础规则' : '基础规则';
    h += '<div class="tq-sec"><div class="tq-sec-h">' + secName + '<span class="tq-free">免费查看</span></div>' + maRuleRow(g, ctx, basic) + '</div>';
    var grp = '', i;
    for (i = 0; i < vip.length; i++) {
      grp += '<div class="tq-grp"><div class="tq-grp-h">' + vip[i].name + '</div>' + maRuleRow(g, ctx, vip[i].items) + '</div>';
    }
    h += '<div class="tq-sec"><div class="tq-vip-bar">👑 VIP 规则${VIP_FREE_TAG}</div>' + grp + '</div>';
    h += maBottom(g);
    h += note('杀号 / 选号都是按近 ' + SPAN + ' 期的真实号码用几套规则算出来的统计结果，每期开奖后重建页面自动更新；底部号码用下一期期号做种子，同一期固定、换期就变。');
    return h;
  }

  /* ================= ⑦ 指数预测（红球 / 蓝球 可能性 % 降序） =================
     ------------------------------------------------------------
     用户原话：「指数预测 就是你自己也是一套系统抓取过往的数据 然后自己有几套分析的方法
               然后红球和篮球开出的可能性比例 按降序排列就好了 这个后期是开奖后就自己计算不要钱的」
     做法（纯前端、0 请求、0 费用）：
       四个维度加权打分 →
         ① 近 30 期出现频次（热号高）
         ② 遗漏补偿（遗漏落在理论值 1.6 倍附近加分）
         ③ 近期趋势（近 10 期频率 ÷ 30 期频率，升温加分）
         ④ 分区均衡（这一区整体偏冷 → 区内号码回补加分）
       → 归一化成【可能性 %】（所有号加起来 = 100%），按降序排成表
       → 期号做种子做微调：同一期固定、换期就变（不用 Math.random）
     ⚠️ 这段在模板字符串里：只写单引号，不写反引号，不写代码里的反斜杠。
     ============================================================ */
  function ixScore(g, tab) {
    var ctx = tqCtx(g, tab), map = tqFreqAll(ctx);
    var count = ctx.to - ctx.from + 1, theo = count / (ctx.per || 1);
    var n10 = Math.min(10, ctx.rows.length), recent = {}, i, j;
    for (i = ctx.rows.length - n10; i < ctx.rows.length; i++) {
      if (i < 0) continue;
      for (j = 0; j < ctx.rows[i].nums.length; j++) {
        var rn = ctx.rows[i].nums[j];
        recent[rn] = (recent[rn] || 0) + 1;
      }
    }
    var bands = tqBands(ctx, 3), perBands = tqBandCount(ctx, bands), rate = [], b;
    for (b = 0; b < bands.length; b++) rate.push(bands[b].c / Math.max(1, ctx.n));
    var avgRate = 0;
    for (b = 0; b < rate.length; b++) avgRate += rate[b] / rate.length;
    var maxF = 1, v;
    for (v = ctx.from; v <= ctx.to; v++) if (map[v].f > maxF) maxF = map[v].f;
    var rnd = tqRng('ix|' + g.id + '|' + tqNextIssue(g.id) + '|' + tqTabId(tab));
    var rows = [], total = 0;
    for (v = ctx.from; v <= ctx.to; v++) {
      var it = map[v];
      var fS = it.f / maxF;
      var mS = 1 - Math.abs(it.gap - theo * 1.6) / (theo * 3);
      if (mS < 0) mS = 0;
      if (mS > 1) mS = 1;
      var rateAll = n10 ? it.f / Math.max(1, ctx.n) : 0;
      var rate10 = n10 ? (recent[v] || 0) / n10 : 0;
      var tRaw = (rate10 + 0.02) / (rateAll + 0.02);
      var tS = tRaw > 2 ? 1 : (tRaw / 2);
      var bidx = 0;
      for (b = 0; b < bands.length; b++) if (v >= bands[b].a && v <= bands[b].b) { bidx = b; break; }
      var zRaw = avgRate / ((rate[b] || 0) + 0.1);
      var zS = zRaw > 2 ? 1 : (zRaw / 2);
      var sc = 0.45 * fS + 0.25 * mS + 0.20 * tS + 0.10 * zS;
      total += sc;
      rows.push({ n: v, f: it.f, gap: it.gap, fS: fS, tRaw: tRaw, sc: sc, why: '' });
    }
    var avgF = (ctx.per * ctx.n) / count;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      var level = r.f >= avgF * 1.4 ? '热' : (r.f <= avgF * 0.6 ? '冷' : '温');
      r.why = level + ' · 遗漏 ' + r.gap + ' 期 · ' + (r.tRaw > 1.15 ? '升温' : (r.tRaw < 0.85 ? '降温' : '平稳'));
      r.pct = total ? r.sc * 100 / total : 0;
    }
    rows.sort(function (a, b2) { return (b2.pct - a.pct) || (a.n - b2.n); });
    var sum = 0;
    for (i = 0; i < rows.length; i++) sum += rows[i].pct;
    return { ctx: ctx, rows: rows, sum: sum, theo: theo, n10: n10 };
  }
  function ixTable(g, tab) {
    var r = ixScore(g, tab);
    if (!r.ctx.n) {
      return '<div class="tq-empty"><b>近 ' + SPAN + ' 期样本不足</b>这个彩种本页还没有足够的开奖期数，开出几期后这里会自动补上。</div>';
    }
    var cls = tab.key === 'back' || tab.pos != null ? 'blue' : 'red';
    var h = '<div class="tq-tbl-wrap"><table class="tq-tbl"><thead><tr><th>排名</th><th>号码</th><th>可能性</th><th>依据</th></tr></thead><tbody>';
    for (var i = 0; i < r.rows.length; i++) {
      var x = r.rows[i];
      h += '<tr' + (i < 6 ? ' class="top"' : '') + '>' +
        '<td>' + (i + 1) + '</td>' +
        '<td><span class="tq-ball ' + cls + ' sm">' + x.n + '</span></td>' +
        '<td><b>' + fmt1(x.pct) + '%</b></td>' +
        '<td class="s">' + x.why + '</td></tr>';
    }
    h += '</tbody></table></div>';
    h += tqLines([
      ['合计', fmt1(r.sum) + '%（' + r.rows.length + ' 个号的可能性加起来）'],
      ['前 6 名占比', fmt1(r.rows[0].pct + r.rows[1].pct + r.rows[2].pct + r.rows[3].pct + r.rows[4].pct + r.rows[5].pct) + '%'],
      ['口径', '出现频次 45% + 遗漏回补 25% + 近期趋势 20% + 分区均衡 10%，再归一化成 100%']
    ]);
    return h;
  }
  function ixTop(g, tab, k) {
    var r = ixScore(g, tab), out = [], i;
    for (i = 0; i < Math.min(k, r.rows.length); i++) out.push({ n: r.rows[i].n, pct: r.rows[i].pct });
    return out;
  }
  function ixBottom(g) {
    /* 统一取号：读构建期算好的 REC（上面那张「指数排名表」不动，只换底部号码） */
    var uni = tqRecUnified(g.id, '🎯 指数最高的号');
    if (uni) return uni;
    var tabs = tqTabs(g), issue = tqNextIssue(g.id);
    var h = '<div class="tq-rec"><div class="tq-rec-h">🎯 指数最高<span>' + (issue ? ('第 ' + esc(issue) + ' 期') : '') + '</span></div>';
    if (g.type === 'digit') {
      var p, top6 = ixTop(g, { key: 'main', pos: null, label: '全部位', from: 0, to: 9, sub: '' }, 6), nums = [], i;
      for (i = 0; i < top6.length; i++) nums.push(top6[i].n);
      nums.sort(function (a, b) { return a - b; });
      var posRow = '';
      for (p = 0; p < tabs.length; p++) {
        var t1 = ixTop(g, tabs[p], 1);
        if (t1.length) posRow += (p ? '　' : '') + tabs[p].label + ' ' + t1[0].n + '（' + fmt1(t1[0].pct) + '%）';
      }
      h += '<div class="tq-rec-row"><span class="tq-rec-k">定位号</span><span class="tq-rec-t">' + posRow + '</span></div>';
      h += '<div class="tq-rec-row"><span class="tq-rec-k">组选 6 码</span>' + tqBalls(nums, 'digit') + '</div>';
      h += '<div class="tq-warn">⚠️ 仅供参考，不保证中奖</div>';
      return h + '</div>';
    }
    var red = ixTop(g, tabs[0], 6), rn = [], j;
    for (j = 0; j < red.length; j++) rn.push(red[j].n);
    h += '<div class="tq-rec-row"><span class="tq-rec-k">' + esc(tabs[0].label) + ' 前 6</span>' + tqBalls(rn, 'red') + '</div>';
    if (tabs.length > 1) {
      var blue = ixTop(g, tabs[1], 1), bn = [];
      for (j = 0; j < blue.length; j++) bn.push(blue[j].n);
      h += '<div class="tq-rec-row"><span class="tq-rec-k">' + esc(tabs[1].label) + ' 前 1</span>' + tqBalls(bn, 'blue') + '</div>';
    }
    h += '<div class="tq-warn">⚠️ 仅供参考，不保证中奖</div>';
    return h + '</div>';
  }
  function pageIndex() {
    var g = gameById(st.game);
    var tabs = tqTabs(g);
    if (!tabs.length) return none('没有可分析的区域', '这个彩种还没有配置号码区。');
    if (!tqTabOf(tabs, st.ixTab)) st.ixTab = tqTabId(tabs[0]);
    var tab = tqTabOf(tabs, st.ixTab);
    var h = '';
    if (st.pickGame) h += '<div class="tq-games">' + chipsGame() + '</div>';
    h += '<div class="tq-tabs">';
    for (var i = 0; i < tabs.length; i++) {
      var id = tqTabId(tabs[i]);
      h += '<div class="tq-tab' + (id === st.ixTab ? ' on' : '') + '" role="button" tabindex="0" data-ix-tab="' + esc(id) + '">' + esc(tabs[i].label) + '</div>';
    }
    h += '</div>';
    if (tab.sub) h += '<div class="tq-sub">' + esc(g.name) + ' · ' + esc(tab.sub) + ' · 近 ' + SPAN + ' 期统计</div>';
    h += ixTable(g, tab);
    h += ixBottom(g);
    h += note('每一档都是「可能性指数」：把近 ' + SPAN + ' 期的频次、遗漏、近期趋势、分区冷热四项一起打分再归一化，所以加起来正好 100%。它是统计描述，不是中奖概率，每期开奖后自动重算。');
    return h;
  }

  /* ================= ⑧ AI推荐（系统随机） ================= */
  function randOf(from, to) { return from + Math.floor(Math.random() * (to - from + 1)); }

  /* 【三套算法 + 随机取一套】用户 2026-10-18：
     「AI推荐自己用前几期数据自己算几套算法出来，然后随机给到（以后不要收费我的）」
     · 数据：页面里已有的近 30 期开奖（drawsOf）
     · 成本：纯前端，0 请求、0 费用
     · 不装神：标签写清楚用的是哪套算法，并说明"不是预测" */
  function algoCandidates(gid, cfg, pickCount) {
    var draws = drawsOf(gid), freq = {}, lastSeen = {}, v;
    for (v = cfg.from; v <= cfg.to; v++) { freq[v] = 0; lastSeen[v] = 999; }
    for (var d = 0; d < Math.min(draws.length, 30); d++) {
      var ns = numsOf(draws[d], cfg.key) || [];
      for (var k = 0; k < ns.length; k++) {
        var n = Number(ns[k]);
        if (freq[n] != null) { freq[n]++; if (lastSeen[n] === 999) lastSeen[n] = d; }
      }
    }
    var all = [];
    for (v = cfg.from; v <= cfg.to; v++) all.push(v);
    function uniqTake(arr, count) {
      var seen = {}, out = [];
      for (var q = 0; q < arr.length && out.length < count; q++) {
        var x = arr[q];
        if (!seen[x]) { seen[x] = 1; out.push(x); }
      }
      return out.sort(function (a, b) { return a - b; });
    }
    /* ① 冷号回补：出现次数升序，次数相同看谁更久没出 */
    var cold = all.slice().sort(function (a, b) {
      return (freq[a] - freq[b]) || (lastSeen[b] - lastSeen[a]) || (a - b);
    });
    /* ② 热号延续：出现次数降序 */
    var hot = all.slice().sort(function (a, b) { return (freq[b] - freq[a]) || (a - b); });
    /* ③ 均衡分布：奇偶交替挑，尽量取接近中位数的号 */
    var mid = (cfg.from + cfg.to) / 2;
    var bal = all.slice().sort(function (a, b) { return Math.abs(a - mid) - Math.abs(b - mid); });
    var odd = [], even = [];
    for (var bq = 0; bq < bal.length; bq++) (bal[bq] % 2 ? odd : even).push(bal[bq]);
    var mixed = [];
    for (var mq = 0; mq < bal.length; mq++) {
      if (mq % 2 === 0) { if (odd.length) mixed.push(odd.shift()); else if (even.length) mixed.push(even.shift()); }
      else { if (even.length) mixed.push(even.shift()); else if (odd.length) mixed.push(odd.shift()); }
    }
    return [
      { algo: '冷号回补', nums: uniqTake(cold, pickCount) },
      { algo: '热号延续', nums: uniqTake(hot, pickCount) },
      { algo: '均衡分布', nums: uniqTake(mixed, pickCount) }
    ];
  }

  function pickFor(gid) {
    /* 【构建时算好的三套号码】冷号回补 / 热号延续 / 均衡分布
       —— 由 export-static.mjs 的 buildAiCandidates() 用真实历史算好，注入成 AI_CANDIDATES。
       这里只负责：每区随机取一套；取不到就退回纯随机（并如实标「随机」）。 */
    var src = (typeof AI_CANDIDATES !== 'undefined' && AI_CANDIDATES) ? AI_CANDIDATES[gid] : null;
    var out = [], usedAlgos = [];
    if (!src || !src.length) {
      /* 兜底：老逻辑（纯随机） */
      var g0 = null;
      try { g0 = gameById(gid); } catch (e) { g0 = null; }
      var areas0 = (g0 && g0.areas) || [];
      for (var a0 = 0; a0 < areas0.length; a0++) {
        var c0 = areas0[a0], pick0 = c0.pick || 1, rep0 = (g0.type === 'digit' || g0.type === 'qxc'), n0 = [];
        if (rep0) { for (var r0 = 0; r0 < pick0; r0++) n0.push(randOf(c0.from, c0.to)); }
        else {
          var pool0 = [];
          for (var v0 = c0.from; v0 <= c0.to; v0++) pool0.push(v0);
          for (var k0 = 0; k0 < pick0 && pool0.length; k0++) {
            var ix0 = Math.floor(Math.random() * pool0.length);
            n0.push(pool0[ix0]); pool0.splice(ix0, 1);
          }
          n0.sort(function (x, y) { return x - y; });
        }
        out.push({ key: c0.key, label: c0.label || '', color: (a0 === 1 ? 'blue' : ''), nums: n0, repeatable: rep0, algo: '随机' });
        usedAlgos.push('随机');
      }
      return { areas: out, algo: usedAlgos.join(' + ') || '随机' };
    }
    for (var a = 0; a < src.length; a++) {
      var cfg = src[a];
      var cands = Array.isArray(cfg.cands) ? cfg.cands : [];
      var pick = cfg.pick || 1;
      cands = cands.filter(function (c) { return c.nums && c.nums.length === pick; });
      var nums, algo;
      if (cands.length) {
        var chosen = cands[Math.floor(Math.random() * cands.length)];
        nums = chosen.nums.slice(0, pick);
        algo = chosen.algo;
      } else {
        nums = [];
        for (var q = 1; q <= pick; q++) nums.push(q);
        algo = '随机';
      }
      out.push({ key: cfg.key, label: cfg.label || '', color: (a === 1 ? 'blue' : ''), nums: nums, repeatable: false, algo: algo });
      usedAlgos.push(algo);
    }
    return { areas: out, algo: usedAlgos.join(' + ') };
  }
  function pageAi() {
    var h = chipsGame();
    /* 【从 DOM 取当前彩种】用户 2026-10-18：AI 面板一直显示"随机"且没有号码球 ——
       根因是 st.game / gameById 拿不到 id（GAMES 是对象、按数组取就是 undefined）。
       这里改成直接读彩种 chip 上的 data-tv-game，拿不到就退回 AI_CANDIDATES 的第一个键。 */
    var chip = document.querySelector('.tv-chip.on');
    var gid = chip ? chip.getAttribute('data-tv-game') : null;
    if (!gid || (typeof AI_CANDIDATES !== 'undefined' && AI_CANDIDATES && !AI_CANDIDATES[gid])) {
      gid = (typeof AI_CANDIDATES !== 'undefined' && AI_CANDIDATES) ? Object.keys(AI_CANDIDATES)[0] : null;
    }
    if (!gid) { return h + note('这期还没有可用的号码数据。'); }
    if (!st.ai || st.ai.game !== gid) { var _p = pickFor(gid); st.ai = { game: gid, picks: _p.areas, algo: _p.algo }; }
    var picks = st.ai.picks, i, j;
    var inner = '';
    for (i = 0; i < picks.length; i++) {
      var p = picks[i];
      inner += '<div class="tv-h" style="font-size:12px;color:var(--ro-fg2);margin:6px 0 2px">' + esc(p.label) + '</div><div class="tv-balls">';
      for (j = 0; j < p.nums.length; j++) {
        inner += '<div class="tv-ball ' + (p.repeatable ? 'digit' : p.color) + '">' + p.nums[j] + '</div>';
      }
      inner += '</div>';
    }
    h += card('前 30 期数据 · ' + esc(st.ai.algo || '随机') + '<span>第 ' + (st.aiTimes + 1) + ' 次</span>', inner);
    h += '<div class="tv-acts">' +
      '<div class="tv-btn" role="button" tabindex="0" data-tv-act="reroll">换一组</div>' +
      '<div class="tv-btn ghost" role="button" tabindex="0" data-tv-act="goto-roll">去摇号面板自选</div>' +
      '</div>';
    h += note('这组号码是按「' + (st.ai.algo || '随机') + '」这套算法、用本页近 30 期开奖数据算出来的，每次随机从几套算法里取一套；不是预测，也不联网、不收费。彩票每期独立随机，任何号码组合的中奖概率都一样。');
    /* 底部再给一组【固定号】：同期永远同一组（种子是期号），
       和上面「换一组」的随机组合分开摆，不混在一起。 */
    h += recBlock(gid, '上面那组可以点「换一组」随便换；下面这组是按期号定死的，同一期永远一样。');
    return h;
  }

  function currentIssueAdvice(id) {
    var g=gameById(st.game), key=curArea(g), a=statOf(g.id,30), f=freqOf(g.id,30), o=omitOf(g.id);
    if(!a.ok || a.n<10 || !f.total) return note('本期建议参考：有效历史样本不足，暂无建议。');
    var R=REC && REC[g.id], issue=R && R.issue;
    if(!issue) return note('本期建议参考：下一期期号尚未确认，暂无建议。');
    var fmt=function(n){return areaCfg(g,key).from===0?String(n):pad2(n);};
    var hot=f.arr.filter(function(x){return x.c>0;}).slice(0,6).map(function(x){return fmt(x.n);}).join(' ');
    var gaps=o.list.slice().sort(function(x,y){return y.cur-x.cur || x.n-y.n;}).slice(0,3).map(function(x){return fmt(x.n)+'（遗漏'+x.cur+'期）';}).join('、');
    var sums=a.rows.map(function(x){return x.sum;}).sort(function(x,y){return x-y;});
    var lo=sums[Math.floor((sums.length-1)*0.25)],hi=sums[Math.ceil((sums.length-1)*0.75)];
    var odd=Math.round(a.odd/a.n), per=Math.round(a.cnt/a.n), big=Math.round(a.big/a.n);
    var words={stat:'组合结构参考：奇偶 '+odd+':'+(per-odd)+'，大小 '+big+':'+(per-big)+'；和值参考 '+lo+'~'+hi+'（历史中间50%区间）。',
      trend:'组合和值可参考 '+lo+'~'+hi+'，跨度参考近30期均值 '+fmt1(a.span/a.n)+'；不要把历史变化当作必然走势。',
      hot:'历史高频号码可关注 '+hot+'；仅作为本期组合参考，不表示更容易开出。',
      ma:'选号候选可参考历史高频 '+hot+'；不建议仅因冷号或遗漏就排除任何号码。',
      index:'本期候选参考 '+hot+'；历史频次是筛选依据，不是下一期中奖概率。',
      omit:'本期遗漏观察名单：'+gaps+'。可与其他分析交叉参考，遗漏长不代表即将开出。',
      pattern:'本期组合可参考奇偶 '+odd+':'+(per-odd)+'、大小 '+big+':'+(per-big)+'，避免只押一种结构。',
      ai:'上方号码作为本期候选；可对照历史高频 '+hot+' 和和值区间 '+lo+'~'+hi+'，按预算筛选，不追投。'};
    return card('第 '+esc(issue)+' 期 · 建议参考',row(esc(areaLabel(g,key)),esc(words[id]||''))+note('依据近 '+a.n+' 期有效开奖数据。各期开奖独立，以上不保证命中。'));
  }
  /* ---------------- 页面路由 ---------------- */
  function pageOf(id) {
    if (id === 'stat') return pageStat();
    if (id === 'trend') return pageTrend();
    if (id === 'hot') return pageHot();
    if (id === 'ma') return pageMa();
    if (id === 'index') return pageIndex();
    if (id === 'omit') return pageOmit();
    if (id === 'pattern') return pagePattern();
    if (id === 'ai') return pageAi();
    return none('出错了', '这个入口还没有内容。');
  }
  /* 顶部标题：这三个子页面显示「<彩种名>xxx ⌄」，点标题展开彩种选择 */
  var HEAD_SUFFIX = { trend: '趋势分析', ma: '杀号和选号', index: '指数预测', pattern: '智能规律' };
  function syncHead() {
    if (!titleEl) return;
    var suf = HEAD_SUFFIX[st.id];
    if (suf) {
      var gg = gameById(st.game);
      titleEl.innerHTML = esc(gg.name) + suf + '<span class="tq-caret">⌄</span>';
    } else {
      titleEl.textContent = TITLES[st.id] || '详情';
    }
  }
  function render() {
    var __sc = st._keep ? body.scrollTop : 0;
    st._keep = 0;
    body.innerHTML = pageOf(st.id) + currentIssueAdvice(st.id);
    syncHead();
    try { body.scrollTop = __sc; } catch (e3) { /* 忽略 */ }
  }

  function openTool(id) {
    st.id = id;
    if (id === 'ai') {
      st.ai = { game: st.game, picks: pickFor(st.game) };
      st.aiTimes = 0;
    }
    titleEl.textContent = TITLES[id] || '详情';
    render();
    view.classList.add('on');
    view.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
  }
  function closeTool() {
    view.classList.remove('on');
    view.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
  }

  /* 「打开完整走势表」= 关掉这一层，展开走势图折叠块并滚过去（不重复画一遍） */
  function gotoTrend() {
    closeTool();
    /* id 是 #ro-trend（走势图那个折叠块）；老版本没有 id 时退回按类名找 */
    var d = document.getElementById('ro-trend') || document.querySelector('.ro-trend');
    if (!d) return;
    try { d.open = true; } catch (e4) { /* 忽略 */ }
    setTimeout(function () {
      try { d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      catch (e5) { try { d.scrollIntoView(true); } catch (e6) { /* 忽略 */ } }
    }, 80);
  }
  function gotoRoll() {
    closeTool();
    var d = document.getElementById('ro-aipick');
    if (!d) return;
    try { d.open = true; } catch (e7) { /* 忽略 */ }
    setTimeout(function () {
      try { d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      catch (e8) { try { d.scrollIntoView(true); } catch (e9) { /* 忽略 */ } }
    }, 80);
  }

  /* ---------------- 事件（全用委托，没有内联 onclick） ---------------- */
  function onTap(ev) {
    var t = ev.target;
    while (t && t !== body) {
      if (t.getAttribute) {
        var gid = t.getAttribute('data-tv-game');
        if (gid) { st.game = gid; st.area = ''; st.ai = null; st.tqTab = ''; st.pqTab = ''; st.ixTab = '';
          st.tq = ''; st.mq = ''; st.pq = ''; st.pickGame = true; render(); return; }
        var aid = t.getAttribute('data-tv-area');
        if (aid) { st.area = aid; st.ai = null; render(); return; }
        var tqt = t.getAttribute('data-tq-tab');
        if (tqt) { st.tqTab = tqt; st.tq = ''; render(); return; }
        var tqm = t.getAttribute('data-tq-metric');
        if (tqm) { st.tq = (st.tq === tqm ? '' : tqm); st._keep = 1; render(); return; }
        var mqt = t.getAttribute('data-mq-tab');
        if (mqt) { st.mqTab = mqt; st.mq = ''; render(); return; }
        var mqr = t.getAttribute('data-mq-rule');
        if (mqr) { st.mq = (st.mq === mqr ? '' : mqr); st._keep = 1; render(); return; }
        var ixt = t.getAttribute('data-ix-tab');
        if (ixt) { st.ixTab = ixt; render(); return; }
        var pqt = t.getAttribute('data-pq-tab');
        if (pqt) { st.pqTab = pqt; st.pq = ''; render(); return; }
        var pqr = t.getAttribute('data-pq-rule');
        if (pqr) { st.pq = (st.pq === pqr ? '' : pqr); st._keep = 1; render(); return; }
        var act = t.getAttribute('data-tv-act');
        if (act === 'reroll') {
          st.ai = { game: st.game, picks: pickFor(st.game) };
          st.aiTimes++;
          render();
          return;
        }
        if (act === 'goto-trend') { gotoTrend(); return; }
        if (act === 'goto-roll') { gotoRoll(); return; }
      }
      t = t.parentNode;
    }
  }
  function onKey(ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    if (t.getAttribute('data-tv-game') || t.getAttribute('data-tv-area') || t.getAttribute('data-tv-act') ||
      t.getAttribute('data-tq-tab') || t.getAttribute('data-tq-metric') || t.getAttribute('data-mq-tab') ||
      t.getAttribute('data-mq-rule') || t.getAttribute('data-ix-tab') || t.getAttribute('data-pq-tab') ||
      t.getAttribute('data-pq-rule')) {
      ev.preventDefault();
      onTap({ target: t });
    }
  }
  body.addEventListener('click', onTap);
  body.addEventListener('keydown', onKey);

  var items = document.querySelectorAll('.tool-item');
  for (var k = 0; k < items.length; k++) {
    (function (el) {
      function go() { openTool(el.getAttribute('data-tool')); }
      el.addEventListener('click', go);
      el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); go(); }
      });
    })(items[k]);
  }
  if (titleEl) {
    titleEl.addEventListener('click', function () {
      if (!HEAD_SUFFIX[st.id]) return;
      st.pickGame = !st.pickGame;
      st._keep = 1;
      render();
    });
  }
  var back = document.getElementById('toolBack');
  if (back) {
    back.addEventListener('click', closeTool);
    back.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); closeTool(); }
    });
  }
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && view.classList.contains('on')) closeTool();
  });
})();
</script>
<!-- __GUIDE__ 旧的「安装指南」内联 SVG 卡片【已撤】：用户要求「把安装教程放到下面，
     图片可以变大、让用户清晰知道怎么安装」——那版是一整张 640×300 的 SVG 小图，
     手机上是等比缩小的（21px 的标题缩到 ~12px），既看不清、又不在正文最后。
     现在改成了正文最底部（#article-rest 里、页尾之前）的【CSS 两列卡片】，
     见上面 __INSTALL__ 那段（#ro-install）：字号是真实 CSS 字号，375/320 都清晰。
     ⚠️ 根目录没有安装教程大图，所以没有图片位 → 图位数量（data-image）不变。 -->
<script>
/* __ENTRY2__ 跳转脚本已撤（那组入口卡和区块本身重复，见上面样式表里的说明）。 */
</script>
<!-- ============================================================
     __PTR__ 下拉刷新（用户 2026-10-18：「桌面图标进入后 往下拉页面是刷新功能」）
     ------------------------------------------------------------
     为什么要有这一段：从桌面图标进入 = 独立模式（没有地址栏、没有刷新按钮），
     浏览器自带的下拉刷新【只在普通标签页里】出现 → 独立模式下必须自己实现。
     ① 只在独立模式启用：display-mode 命中 standalone / fullscreen / minimal-ui，
        或者 iOS 的 navigator.standalone === true。
        普通标签页【完全不装监听】（浏览器自己就有，再拦一次会打架）。
     ② 只有「页面在最顶（scrollTop === 0）」并且「手指往下拉」时才 preventDefault，
        其余情况一个字节都不拦：正常滚动、横滑、双指缩放、子页面滚动全不受影响。
     ③ 零本地存储：一句话都不写，刷新 = 整页重载，不存任何状态。
     ④ 不用裸 button：指示器是 div，而且 pointer-events: none，永远不挡点击。
     ⑤ service-worker 是纯透传（不缓存）→ reload 拿到的就是最新内容。
     ============================================================ -->
<style>
/* 顶部下拉指示器：一颗小胶囊（米杏色），跟着手指有阻尼地往下走 */
#roPtr {
  display: none;
  position: fixed;
  left: 50%;
  top: 10px;
  z-index: 2147483000;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  max-width: calc(100vw - 24px);
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid var(--ro-line, var(--border, #e8d7bd));
  background: var(--ro-card, var(--card, #fdf6ea));
  color: var(--ro-fg2, var(--text-sub, #8a7a63));
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  line-height: 1.2;
  letter-spacing: .5px;
  white-space: nowrap;
  box-shadow: 0 6px 18px rgba(74, 58, 38, .16);
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(-16px);
  transition: opacity .18s ease, transform .18s ease;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
#roPtr.on { display: flex; }
#roPtr .ro-ptr-arrow {
  font-size: 13px;
  line-height: 1;
  color: var(--ro-ok, var(--green, #1a8c5a));
  transition: transform .18s ease;
}
#roPtr.rdy .ro-ptr-arrow { transform: rotate(180deg); }
#roPtr .ro-ptr-spin {
  display: none;
  box-sizing: border-box;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2px solid rgba(138, 122, 99, .3);
  border-top-color: var(--ro-ok, var(--green, #1a8c5a));
  animation: roPtrSpin .7s linear infinite;
}
#roPtr.busy .ro-ptr-spin { display: block; }
#roPtr.busy .ro-ptr-arrow { display: none; }
#roPtr.busy { color: var(--ro-ok, var(--green, #1a8c5a)); }
@keyframes roPtrSpin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  #roPtr { transition: none; }
  #roPtr .ro-ptr-spin { animation-duration: 2s; }
}
/* __RE_SINA__ */
.sx-box { margin: 10px 0 12px; background: #fdf6ea; border: 1px solid #e8d7bd; border-radius: 12px; padding: 10px 12px; }
.sx-head { display: flex; align-items: center; gap: 8px; cursor: pointer; list-style: none; }
.sx-head::-webkit-details-marker { display: none; }
.sx-title { font-size: 13.5px; font-weight: 700; color: #4a3a26; }
.sx-cnt { font-size: 11px; color: #8a7a63; }
.sx-note { font-size: 11px; color: #a89a80; margin: 6px 0 8px; }
.sx-row { display: flex; gap: 8px; align-items: baseline; font-size: 12px; padding: 5px 0; border-top: 1px solid #f4ead6; }
.sx-t { color: #4a3a26; flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sx-f { color: #c0392b; font-weight: 700; white-space: nowrap; }
.sx-b { color: #1f5fd6; font-weight: 700; white-space: nowrap; }
/* __RE_GUIDE__ 安装指南 */
.install-guide { margin: 16px 0 24px; background: #fff; border: 1px solid #e8d7bd; border-radius: 12px; padding: 10px; }
.install-guide svg { width: 100%; height: auto; display: block; border-radius: 8px; }
.install-guide-note { text-align: center; font-size: 12px; color: #8a7a63; font-weight: 700; margin-top: 10px; }
/* __RE_GUIDE_HTML__ 安装指南（用户指定样式） */
.install-guide { margin: 16px 12px 24px; background: #fdf6ea; border: 1px solid #e8d7bd; border-radius: 12px; padding: 14px 12px 10px; }
.ig-title { text-align: center; font-size: 15px; font-weight: 800; color: #4a3a26; }
.ig-sub { text-align: center; font-size: 11.5px; color: #8a7a63; margin: 6px 0 12px; line-height: 1.6; }
.ig-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ig-card { background: #fffdf8; border: 1px solid #ecdcc2; border-radius: 10px; padding: 10px 10px 8px; }
.ig-head { text-align: center; font-size: 13.5px; font-weight: 700; color: #1a8c5a; padding-bottom: 6px; border-bottom: 1px dashed #e8d7bd; margin-bottom: 8px; }
.ig-ico { margin-right: 4px; }
.ig-step { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #4a3a26; padding: 4px 0; line-height: 1.4; }
.ig-step i { flex: 0 0 auto; width: 16px; height: 16px; border-radius: 50%; background: #1a8c5a; color: #fff; font-style: normal; font-size: 10.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.ig-note { font-size: 10.5px; color: #a89a80; line-height: 1.5; margin-top: 6px; }
.ig-foot { text-align: center; font-size: 11.5px; color: #8a7a63; font-weight: 700; margin-top: 10px; }
@media (max-width: 340px) { .ig-cols { grid-template-columns: 1fr; } }
/* ============================================================
   __ROW3__ 并排两列：专家推荐 + 走势图 / 手绘参考图 + 参考图（2026-10-18）
   ------------------------------------------------------------
   用户原话：「专家推荐和走势图放到一起」「版面做一样」
             「我的双色球/大乐透（参考图）和手绘参考图放一排」
   做法（和已有的「开机号+热力图」「晒票+GPT摇号」同一套）：
     · 两张卡装进 .grid-2-col（2 列 / gap 10 / align-items:stretch）→ 天然等高；
     · 两张卡都用【三行】结构：标题 / 副标题 / 绿色胶囊「点击查看 ▸」，
       字号、行高、外边距、内边距逐项相同 → 两列的三行位置逐行对齐；
     · 点开任意一张 → grid-column:1/-1 跨满整行（另一张自动落到下一行）；
     · 320 沿用两列（和现有三组一致），只缩字号，不改成上下排列。
   ⚠️ 上一版那套 inline-block + 半屏宽度的 hack 已删 —— 它做不到「两张一样高」。
   ⚠️ 折叠机制一个字没动：仍 <details>/<summary> + CSS 伪元素按 [open] 换字，
      页面上没有 button 标签（页面铁律）。
   ============================================================ */
#ro-xj-row, #ro-ref-row { margin: 0 12px 12px; align-items: stretch; }
#ro-xj-row > *, #ro-ref-row > * { margin: 0 !important; box-sizing: border-box; }
#ro-xj-row > details[open], #ro-ref-row > details[open] { grid-column: 1 / -1; }
/* 展开任意一张 → 整行改成一列（另一张也占满整行），
   和「晒票 + GPT模型摇号」那一行完全同一套做法（那边是脚本加 .is-open）。
   ⚠️ :has 只在现代内核上有；老内核退回上面那条 grid-column，也能看。 */
#ro-xj-row:has(> details[open]), #ro-ref-row:has(> details[open]) { grid-template-columns: minmax(0, 1fr); }
/* 只剩一张时（例如专家数据为空）→ 占满整行，别缩在半边 */
#ro-xj-row > :only-child, #ro-ref-row > :only-child { grid-column: 1 / -1; }

/* ① 三行卡面：标题 / 副标题 / 胶囊（三张卡一套值，所以逐行对齐） */
#ro-xj-row > .ro-xj > .ro-xj-header,
#ro-ref-row > .p3d-section > .p3d-head,
#ro-ref-row > .ro-ref-pic > .ro-ref-head {
  display: block !important;
  position: static !important;
  text-align: center !important;
  padding: 2px 0 12px !important;
  cursor: pointer;
  list-style: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}
#ro-xj-row > .ro-xj > .ro-xj-header::-webkit-details-marker,
#ro-ref-row > .p3d-section > .p3d-head::-webkit-details-marker,
#ro-ref-row > .ro-ref-pic > .ro-ref-head::-webkit-details-marker { display: none; }
#ro-xj-row > .ro-xj > .ro-xj-header::marker,
#ro-ref-row > .p3d-section > .p3d-head::marker,
#ro-ref-row > .ro-ref-pic > .ro-ref-head::marker { content: ''; }
#ro-xj-row .ro-xj-title,
#ro-ref-row .p3d-head-t,
#ro-ref-row .ro-ref-h2 {
  display: block !important;
  padding: 0 !important;
  font-size: 15px !important;
  font-weight: 800 !important;
  letter-spacing: .5px;
  color: var(--ro-fg) !important;
  text-align: center !important;
}
#ro-xj-row .ro-xj-icon {
  display: inline !important;
  position: static !important;
  top: auto !important;
  transform: none !important;
  margin: 0 3px 0 0 !important;
  font-size: 15px !important;
}
#ro-xj-row .ro-xj-sub,
#ro-ref-row .p3d-head-sub,
#ro-ref-row .ro-ref-sub {
  display: block !important;
  margin: 4px 0 0 !important;
  font-size: 12px !important;
  font-style: normal !important;
  font-weight: 600 !important;
  color: var(--ro-fg2) !important;
}
/* 绿色胶囊：和晒票 / GPT摇号的「点击查看 ▸」同一套外观与尺寸 */
#ro-xj-row .ro-xj-arrow,
#ro-ref-row .p3d-head-tip,
#ro-ref-row .ro-ref-arrow {
  display: inline-block !important;
  position: static !important;
  top: auto !important;
  right: auto !important;
  transform: none !important;
  margin: 8px auto 0 !important;
  padding: 4px 10px !important;
  border: 1px solid var(--ro-ok) !important;
  border-radius: 14px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  color: var(--ro-ok) !important;
  white-space: nowrap;
}
/* 胶囊上的字：专家推荐那一张原来写的是「展开 ▾」，改成和另外两张一致的三个字 */
#ro-xj-row > .ro-xj > .ro-xj-header .ro-xj-arrow::after { content: '点击查看  ▸'; }
#ro-xj-row > .ro-xj[open] > .ro-xj-header .ro-xj-arrow::after { content: '点击收起  ▾'; }
#ro-ref-row > .ro-ref-pic > .ro-ref-head .ro-ref-arrow::before { content: '点击查看'; }
#ro-ref-row > .ro-ref-pic > .ro-ref-head .ro-ref-arrow::after { content: ' ▸'; }
#ro-ref-row > .ro-ref-pic[open] > .ro-ref-head .ro-ref-arrow::before { content: '点击收起'; }
#ro-ref-row > .ro-ref-pic[open] > .ro-ref-head .ro-ref-arrow::after { content: ' ▾'; }
/* 「手绘参考图」那颗胶囊原来只有「点击查看」没有箭头（那张卡自己的 ::after 就写死了三个字），
   这里补成和其它两张一样的「点击查看 ▸ / 点击收起 ▾」。 */
#ro-ref-row > .p3d-section > .p3d-head .p3d-head-tip::after { content: '点击查看  ▸'; }
#ro-ref-row > .p3d-section[open] > .p3d-head .p3d-head-tip::after { content: '点击收起  ▾'; }

/* ② 卡片外壳：内边距/圆角/底色三张卡一样（等高靠内容一样高 + stretch 兜底） */
#ro-xj-row > .ro-xj,
#ro-ref-row > .p3d-section,
#ro-ref-row > .ro-ref-pic {
  padding: 12px 12px 0 !important;
  background: var(--ro-card);
  border: 1px solid var(--ro-line);
  border-radius: 10px;
  overflow: hidden;
  min-width: 0;
}
#ro-xj-row > .ro-xj .ro-xj-note { margin-bottom: 10px; }
#ro-ref-row > .p3d-section > .p3d-body { padding: 0 0 12px; }

/* ③ 参考图（双色球/大乐透）展开后的 4 个图位入口 —— 用的是页面已有的推荐图 */
.ro-ref-body { padding: 0 0 12px; }
.ro-ref-toc { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
/* 展开后这张卡跨满整行 → 图位入口排两列（收起在半屏时一列，挤不下就换行，不溢出） */
#ro-ref-row > .ro-ref-pic[open] .ro-ref-toc { grid-template-columns: repeat(2, minmax(0, 1fr)); }
/* ⚠️ 格子本身是 flex 行 → 主标题和「绕胆/九转/九宫」会并排挤成两行；
   这里改成【竖排居中】：主标题一行、副标题一行（和顶部那个推荐图目录一致）。 */
.ro-ref-toc .ro-toc-cell {
  display: flex !important;
  flex-direction: column !important;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  height: auto !important;
  padding: 7px 8px !important;
  background: var(--ro-card) !important;
  border: 1px solid var(--ro-line) !important;
  border-radius: 9px !important;
  color: var(--ro-fg) !important;
  font-size: 12.5px !important;
  font-weight: 600 !important;
  line-height: 1.3;
  text-align: center;
}
.ro-ref-toc .ro-toc-cell .ro-toc-t { font-size: 12.5px; font-weight: 700; color: var(--ro-fg); }
.ro-ref-toc .ro-toc-cell .ro-toc-s { display: block; margin-top: 2px; font-size: 10.5px; color: var(--ro-fg2); }
.ro-ref-note { margin-top: 8px; text-align: center; font-size: 11px; color: var(--ro-fg3); }
/* ④ 「本页算法（人工计算手法）」清单（用户 2026-10-18）——
   9 个算法名照着原词一个一个列，每项后面都跟「（人工计算手法）」。
   小字 12px · 次要灰 --ro-fg2 · line-height 1.7 → 375 / 320 下自然折成几行，
   不横向溢出（min-width:0 + overflow-wrap:anywhere 兜底）。 */
.ro-ref-algo {
  margin-top: 10px;
  padding: 8px 9px;
  min-width: 0;
  background: var(--ro-sunken);
  border: 1px dashed var(--ro-line);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ro-fg2);
  word-break: break-word;
  overflow-wrap: anywhere;
}
.ro-ref-algo-h { font-weight: 700; color: var(--ro-fg); margin-bottom: 2px; }
.ro-ref-algo-l { display: block; }
.ro-ref-algo-w { margin-top: 4px; font-size: 11px; color: var(--ro-fg3); }
/* 320 窄屏：两列保留，只缩字号 / 内边距（和另外三组一致，不改成上下排列） */
@media (max-width: 360px) {
  #ro-xj-row .ro-xj-title, #ro-ref-row .p3d-head-t, #ro-ref-row .ro-ref-h2 { font-size: 14px !important; }
  #ro-xj-row .ro-xj-sub, #ro-ref-row .p3d-head-sub, #ro-ref-row .ro-ref-sub { font-size: 10.5px !important; }
  #ro-xj-row .ro-xj-arrow, #ro-ref-row .p3d-head-tip, #ro-ref-row .ro-ref-arrow { font-size: 10.5px !important; padding: 3px 7px !important; }
  #ro-xj-row > .ro-xj > .ro-xj-header,
  #ro-ref-row > .p3d-section > .p3d-head,
  #ro-ref-row > .ro-ref-pic > .ro-ref-head { padding: 1px 0 9px !important; }
  #ro-xj-row > .ro-xj,
  #ro-ref-row > .p3d-section,
  #ro-ref-row > .ro-ref-pic { padding: 10px 8px 0 !important; }
  .ro-ref-toc .ro-toc-cell { font-size: 11.5px !important; padding: 6px 4px !important; }
  /* 320 更窄：算法清单再收一档字号（内容多，别让卡片长得太高），仍可正常折行 */
  .ro-ref-algo { font-size: 11px; line-height: 1.65; padding: 7px 8px; }
  .ro-ref-algo-w { font-size: 10.5px; }
}

/* ============================================================
   __ZN_ROW__ 【智讯 + 智能精选】两张卡（用户新增需求）
   ------------------------------------------------------------
   位置：紧跟在【手绘参考图 / 参考图】那一排下面（用户圈的空位）。
   外观：和上面各组折叠卡同一套 —— 米杏底（--ro-card）+ 1px 细描边
        （--ro-line）+ 圆角 10px；卡面三行 = 标题 / 副标题 / 绿色胶囊，
        胶囊的字由 CSS 伪元素按 [open] 换（点击查看 ▸ / 点击收起 ▾），
        零脚本、零 button 标签、零内联事件。
   布局：装进 .grid-2-col → 375 下正好两列一行（新加两张刚好凑一行）；
        320 保留两列，只缩字号与内边距，长号码自动折行、不横向溢出。
   ⚠️ 卡片阴影沿用「#article-rest / .grid-2-col > *」那条统一规则，这里不另写。
   ⚠️ 只用变量色（--ro-card / --ro-line / --ro-fg / --ro-fg2 / --ro-fg3 / --ro-ok），
      米杏主题与浅色主题都跟着走。
   ============================================================ */
#ro-zn-row { margin: 0 12px 12px; align-items: stretch; }
#ro-zn-row > * { margin: 0 !important; box-sizing: border-box; }
#ro-zn-row > details[open] { grid-column: 1 / -1; }
.ro-zn {
  background: var(--ro-card);
  border: 1px solid var(--ro-line);
  border-radius: 10px;
  padding: 12px 12px 0;
  overflow: hidden;
  min-width: 0;
}
.ro-zn > .ro-zn-head {
  display: block; text-align: center; cursor: pointer; list-style: none;
  padding: 2px 0 12px; -webkit-tap-highlight-color: transparent;
  user-select: none; -webkit-user-select: none;
}
.ro-zn > .ro-zn-head::-webkit-details-marker { display: none; }
.ro-zn > .ro-zn-head::marker { content: ''; }
.ro-zn-h2 { display: block; font-size: 15px; font-weight: 800; letter-spacing: .5px; color: var(--ro-fg); }
.ro-zn-sub { display: block; margin-top: 4px; font-size: 12px; font-weight: 600; color: var(--ro-fg2); }
.ro-zn-arrow {
  display: inline-block; margin: 8px auto 0; padding: 4px 10px;
  font-size: 12px; font-weight: 600; color: var(--ro-ok);
  border: 1px solid var(--ro-ok); border-radius: 14px; white-space: nowrap;
}
.ro-zn-arrow::before { content: '点击查看'; }
.ro-zn-arrow::after { content: ' ▸'; }
.ro-zn[open] > .ro-zn-head .ro-zn-arrow::before { content: '点击收起'; }
.ro-zn[open] > .ro-zn-head .ro-zn-arrow::after { content: ' ▾'; }
.ro-zn-body {
  padding: 0 0 12px; min-width: 0;
  word-break: break-word; overflow-wrap: anywhere;
}
.ro-zn-blk { border-top: 1px dashed var(--ro-line); padding: 8px 0; }
.ro-zn-blk:first-child { border-top: 0; padding-top: 0; }
.ro-zn-bh { font-size: 12.5px; font-weight: 800; color: var(--ro-fg); padding-bottom: 4px; }
.ro-zn-bi { font-size: 10.5px; font-weight: 600; color: var(--ro-fg3); }
.ro-zn-row {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 6px;
  font-size: 12px; line-height: 1.7; color: var(--ro-fg2);
}
.ro-zn-tag {
  flex: 0 0 auto; font-size: 10px; font-weight: 800; color: var(--ro-fg2);
  background: #f4ece0; border: 1px solid var(--ro-line); border-radius: 6px; padding: 0 5px;
}
.ro-zn-g { font-weight: 800; color: var(--ro-fg); }
.ro-zn-d { font-weight: 700; color: var(--ro-fg3); font-variant-numeric: tabular-nums; }
.ro-zn-i { font-size: 10.5px; color: var(--ro-fg3); }
.ro-zn-t { margin-left: auto; font-weight: 800; color: var(--ro-ok); font-variant-numeric: tabular-nums; }
.ro-zn-n {
  display: block; margin: 1px 0 4px; font-size: 12.5px; font-weight: 800;
  letter-spacing: .3px; color: var(--ro-fg);
}
/* ② 智讯卡：按彩种切的药丸（和青蛙家园功能中心 .frog-chip 同一套外观与手法） */
.ro-zn-chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 2px 0 8px; }
.ro-zn-chip {
  flex: 0 0 auto; padding: 3px 9px; border: 1px solid var(--ro-line);
  border-radius: 999px; background: #fffaf2; font-size: 11.5px; line-height: 1.4;
  color: var(--ro-fg2); cursor: pointer;
  -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none;
}
.ro-zn-chip.on { background: var(--ro-ok); border-color: var(--ro-ok); color: #fff; font-weight: 700; }
.ro-zn-pane { display: none; }
.ro-zn-pane.is-on { display: block; }
/* ③ 资讯条目：标题 + 日期 + 一行摘要；有正文的点标题原地展开 */
.ro-zn-at-row, .ro-zn-art { border-top: 1px dashed var(--ro-line); }
.ro-zn-at-row:first-child, .ro-zn-art:first-child { border-top: 0; }
.ro-zn-at-row { display: block; padding: 6px 0; }
.ro-zn-art > .ro-zn-at {
  display: block; padding: 6px 0; cursor: pointer; list-style: none;
  -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none;
}
.ro-zn-art > .ro-zn-at::-webkit-details-marker { display: none; }
.ro-zn-art > .ro-zn-at::marker { content: ''; }
.ro-zn-at-t { display: block; font-size: 12px; font-weight: 700; line-height: 1.5; color: var(--ro-fg); }
/* 资讯角标：本期（期号对得上当期）/ 最新（没有当期时的最新一条，只标位置） */
.ro-zn-at-n {
  display: inline-block; margin-left: 4px; padding: 0 4px;
  font-size: 9px; font-weight: 800; line-height: 1.6;
  border-radius: 4px; vertical-align: 1px; white-space: nowrap;
  color: #1a7f4b; background: #e8f6ee; border: 1px solid #b6ddc6;
}
.ro-zn-at-d { display: inline-block; margin-top: 1px; font-size: 10px; color: var(--ro-fg3); }
.ro-zn-at-b { display: block; margin-top: 1px; font-size: 10.5px; line-height: 1.55; color: var(--ro-fg2); }
.ro-zn-art[open] > .ro-zn-at .ro-zn-at-b { display: none; }
.ro-zn-at-body { padding: 0 0 8px; }
.ro-zn-at-body p { margin: 0 0 5px; font-size: 11.5px; line-height: 1.75; color: var(--ro-fg2); }
.ro-zn-k {
  flex: 0 0 auto; min-width: 4.6em; font-size: 10.5px; font-weight: 800;
  text-align: center; border-radius: 6px; padding: 1px 6px;
  color: var(--ro-fg2); background: #f4ece0; border: 1px solid var(--ro-line);
}
.ro-zn-k.is-dan { color: #1a7f4b; background: #e8f6ee; border-color: #b6ddc6; }
.ro-zn-k.is-sha { color: #a33b17; background: #fdeadd; border-color: #efc6ab; }
.ro-zn-k.is-pick { color: #1b4f97; background: #e7f0fb; border-color: #b9d2ef; }
.ro-zn-sel { font-size: 12.5px; font-weight: 900; color: var(--ro-fg); letter-spacing: .3px; }
.ro-zn-sel .ro-zn-blue { color: #1b4f97; font-weight: 900; }
.ro-zn-meta { display: block; margin-top: 2px; font-size: 10.5px; color: var(--ro-fg3); }
.ro-zn-none { text-align: center; font-size: 12px; line-height: 1.6; color: var(--ro-fg3); padding: 6px 0 12px; }
.ro-zn-foot {
  margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--ro-line);
  font-size: 10.5px; line-height: 1.6; color: var(--ro-fg3); text-align: center;
}
/* 320 窄屏：两列保留，只收字号 / 留白（和另外几组一致，不改成上下排列） */
@media (max-width: 360px) {
  #ro-zn-row { margin-left: 8px; margin-right: 8px; gap: 8px; }
  .ro-zn { padding: 10px 8px 0; }
  .ro-zn-h2 { font-size: 14px; }
  .ro-zn-sub { font-size: 10.5px; }
  .ro-zn-arrow { font-size: 10.5px; padding: 3px 7px; }
  .ro-zn-bh { font-size: 11.5px; }
  .ro-zn-row { font-size: 11px; gap: 3px 5px; line-height: 1.75; }
  .ro-zn-n { font-size: 11.5px; }
  .ro-zn-nt { font-size: 10.5px; }
  .ro-zn-k { font-size: 10px; min-width: 4em; padding: 1px 4px; }
  .ro-zn-sel { font-size: 11.5px; }
  .ro-zn-meta, .ro-zn-foot, .ro-zn-bi { font-size: 10px; }
  .ro-zn-chip { font-size: 10.5px; padding: 3px 7px; }
  .ro-zn-at-t { font-size: 11px; }
  .ro-zn-at-n { font-size: 8.5px; margin-left: 3px; padding: 0 3px; }
  .ro-zn-at-b, .ro-zn-at-d { font-size: 10px; }
  .ro-zn-at-body p { font-size: 11px; line-height: 1.7; }
}
/* __STANDALONE_HIDE__ 用户 2026-10-18：
   「一键桌面 / 圆形手机钮 / 聊天」这三个浮标——浏览器里要有，
   从手机桌面图标点进去（PWA standalone）就没有。
   用 display-mode 媒体查询：浏览器访问照常显示，独立窗口里全部隐藏。 */
@media (display-mode: standalone) {
  #installAppBtn, .install-btn,
  #installFab, .install-fab,
  #chatToggleBtn, #chatToggle, .chat-toggle, .cf-toggle, .cf-fab {
    display: none !important;
  }
}
/* 也兼容 iOS 旧 WebView 的 navigator.standalone（下面由 JS 补一个 class） */
html.is-standalone #installAppBtn, html.is-standalone .install-btn,
html.is-standalone #installFab, html.is-standalone .install-fab,
html.is-standalone #chatToggleBtn, html.is-standalone #chatToggle,
html.is-standalone .chat-toggle, html.is-standalone .cf-toggle, html.is-standalone .cf-fab {
  display: none !important;
}
/* __PX9__ 两级方法目录 */
.px9 { margin: 10px 12px 14px; background: #fdf6ea; border: 1px solid #e8d7bd; border-radius: 12px; padding: 12px; }
.px9-head { text-align: center; font-size: 14px; font-weight: 800; color: #4a3a26; margin-bottom: 8px; }
.px9-games { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.px9-g { text-align: center; padding: 10px 6px; border: 1px solid #e8d7bd; border-radius: 10px; background: #fff; font-size: 14px; font-weight: 700; color: #4a3a26; cursor: pointer; }
.px9-g.on { background: #1a8c5a; border-color: #1a8c5a; color: #fff; }
.px9-methods { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px; }
.px9-m { text-align: center; padding: 8px 2px; border: 1px solid #ecdcc2; border-radius: 8px; background: #fffaf2; font-size: 11.5px; color: #4a3a26; cursor: pointer; }
.px9-m.on { border-color: #1a8c5a; color: #1a8c5a; font-weight: 700; background: #eaf7ef; }
.px9-out { background: #fff; border: 1px solid #ecdcc2; border-radius: 10px; padding: 10px; font-size: 12px; color: #4a3a26; line-height: 1.8; min-height: 60px; }
.px9-out b { color: #c0392b; }
.px9-row { display: flex; justify-content: space-between; border-bottom: 1px dashed #f4ead6; padding: 3px 0; }
.px9-row:last-child { border-bottom: 0; }
.px9-k { color: #8a7a63; }
.px9-tip { text-align: center; font-size: 10.5px; color: #a89a80; margin-top: 8px; }
.px9-balls { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
.px9-b { width: 24px; height: 24px; border-radius: 50%; background: #c0392b; color: #fff; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.px9-b.blue { background: #1f5fd6; }
/* __PX9_RENDER__ 九算法输出区：推荐号码 + 一句方法说明 + 期号种子 */
.px9-cur { font-weight: 800; color: #1a8c5a; font-size: 13px; margin-bottom: 4px; }
.px9-cur em { float: right; font-style: normal; font-size: 10.5px; color: #a89a80; font-weight: 400; }
.px9-info { font-size: 11.5px; color: #6b5a42; line-height: 1.7; margin: 4px 0 6px; }
.px9-meta { font-size: 10.5px; color: #a89a80; margin-top: 6px; line-height: 1.6; }
.px9-bsep { width: 6px; height: 1px; display: inline-block; }
/* 320 窄屏：号码球缩一号 + 间距收紧 → 红 6 + 蓝 1 仍排在同一行，不折行 */
@media (max-width: 340px) {
  .px9-balls { gap: 3px; }
  .px9-b { width: 22px; height: 22px; font-size: 10.5px; }
  .px9-bsep { width: 4px; }
}

/* __ST_TZ__ 状态卡两档配色：02:00~21:00 绿（已更新）/ 21:00~次日02:00 黄（未更新） */
.ro-st-sub { font-weight: 700; }
.ro-status.warn .ro-st-head, .ro-status.warn .ro-st-sub { color: #9c7000 !important; }
.ro-status.warn .ro-st-dot { background: #f5b301; box-shadow: 0 0 0 4px rgba(245, 179, 1, 0.18); }
/* __BACK6_STYLE__ 状态卡「后区推荐 6 码」这一行原来没有任何样式，号码挤成 020305060811；
   这里只补排版（标签 + 6 个蓝球 + 说明），6 个号码本身和取数逻辑一个字没动。 */
/* 【🔵 后区推荐 6 码 · 2026-10-20】用户：「资料里面 篮球后区推荐记得带上
   球的图标明显一点」→ 这一行就是大乐透后区推荐，跟着一起加强：
   原来是一块平蓝的圆角药丸（#1f5fd6），现在改成「真球」——
   正圆 + 径向渐变高光 + 亮蓝描边 + 白字加粗。尺寸 22px 一个字节没变（不会挤行）。 */
.ro-back6 { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 2px; font-size: 11.5px; line-height: 1.5; }
.ro-back6-k { color: #8a7a63; font-weight: 700; }
.ro-back6 i { font-style: normal; min-width: 22px; height: 22px; padding: 0 2px; border-radius: 50%;
  background: radial-gradient(circle at 34% 26%, #5b95ff 0%, #2a63e0 44%, #12379b 100%);
  border: 1.5px solid #9cc4ff;
  color: #fff; font-size: 10.5px; font-weight: 800;
  text-shadow: 0 1px 1px rgba(0, 0, 0, .42);
  box-shadow: inset 0 -2px 4px rgba(0, 0, 0, .28), inset 0 2px 3px rgba(255, 255, 255, .30), 0 1px 3px rgba(0, 0, 0, .20);
  display: inline-flex; align-items: center; justify-content: center; }
.ro-back6-s { color: #a89a80; font-size: 10.5px; }
/* __INSTALL_RESTORED__ 【已恢复】用户 2026-10-18 21:50 确认要这张安装大图
   → 「添加到手机桌面」这一块重新上屏。
   这里原来有一条 __NO_INSTALL__（2026-10-18 用户要求删掉该模块时加的
   display:none!important 兜底：不管 HTML 里有没有，一律不显示）——
   本次恢复时那条锁已经【删除】，所以 .ro-install 现在正常 display（不再被 !important 压住）。
   以后要再藏这一块，别用 display:none 兜底，直接改 HTML，
   免得又出现「HTML 里没有、CSS 里锁着」的两头不一致。 */
/* __TOC_4ROWS__ 用户 2026-10-18：目录排成 4 排（3 列 × 4 排，10 格） */
.ro-imgtoc { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 8px !important; }
.ro-imgtoc .ro-toc-cell { width: auto !important; min-height: 52px !important; height: auto !important; padding: 8px 4px !important; }
.ro-imgtoc .ro-toc-t { font-size: 12px !important; line-height: 1.35 !important; white-space: normal !important; }
.ro-imgtoc .ro-toc-s { font-size: 10px !important; }
@media (max-width: 340px) { .ro-imgtoc { gap: 5px !important; } .ro-imgtoc .ro-toc-t { font-size: 11px !important; } }

/* ★ USER-LOCKED-TOC 2026-10-19 */
/* ============================================================
   ★★★ 用户锁定 · 推荐图目录（10 格）· 2026-10-19 ★★★
   用户原话：「2+2+2+2」「以后不管怎么样都不要动我这里的」
   这条规则放在样式表【最后】，用 !important 压过前面所有 3 列 / 1 列 的媒体查询。
   ⚠️ 以后谁要改这块，先问用户。别删这条，也别在它后面再加 .ro-imgtoc 的列数规则。
   ============================================================ */
.ro-imgtoc {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 8px !important;
}
.ro-imgtoc > .ro-toc-cell { width: 100% !important; box-sizing: border-box !important; }
/* __LOTTO_ART__ 专家文章列表 */
.ro-xj-arts { margin: 8px 0 4px; }
.ro-xj-arts-h { font-size: 12px; font-weight: 700; color: #8a7a63; margin: 6px 0; }
.ro-xj-art { display: flex; gap: 6px; align-items: center; padding: 7px 2px; border-bottom: 1px dashed #f0e4cf; text-decoration: none; color: #4a3a26; }
.ro-xj-art-i { flex: 0 0 18px; font-size: 11px; color: #b9a98c; }
.ro-xj-art-t { flex: 1; font-size: 12.5px; line-height: 1.4; }
.ro-xj-art-go { flex: 0 0 auto; font-size: 11.5px; color: #1a8c5a; font-weight: 700; }


/* ══════════════════════════════════════════════════════════════════
   __CIR_HIT_DARK__ 九转连环图 ·「上一期开奖号码」加深渲染
   --------------------------------------------------------------
   用户原话（2026-10-20）：「九转图 编程每次开奖后自动抓取开奖号码
   + 在下一期新的图出来的时候，对上一起开奖号码颜色深一点渲染出来」。

   数据层（不用改、每次构建自动重算）：
     stats.js  createJiuZhuan(lastNums) 按【上一期开奖号】把圈上对应的点
               标 isHit → 编成 cir_points 的 H 位；
     render.js 解码成 .r-cirnum.hit / .r-circenter.hit / .r-cirsideball.hit，
               并把后区（双色球蓝球 / 大乐透后区）补成 .bl。
   所以「开奖后下一班自动变」是白送的：export-static 每跑一次就重读
   最新一期开奖，图上的深色跟着换期 —— 不需要额外定时任务。
   （21:30 之前新一期还没抓到 → 深色仍然是再上一期的，属正常，22:00/23:00
     抓完重跑就变。）

   这里只补【样子】。⚠️ 以前这段选择器名写错了：写的是 .r-cirpt / .r-cirpoint
   / .r-cirdot，而 render.js 实际输出的是 .r-cirnum —— 除了中心那一格，
   环上的命中点【一条样式都没命中】，开出的号和没开的一模一样浅灰
   （实测改前：命中 6 个，底色/字色和未开完全相同，对比度 1:1）。
   现在按真实类名重写：
     · 开出的号 = 实心深红（后区深蓝）+ 白字粗体 + 细描边 + 一点光晕
     · 没开的号 = 原样浅灰字 / 白底，一个字节都没动 → 其它号不会糊
   对比度（WCAG 相对亮度实测）：白字 / #c0392b = 5.44:1，白字 / #1f5fd6 = 5.73:1，
   命中底 vs 页面米杏底 ≈ 5:1 —— 全部 ≥ 4.5:1 ✔
   尺寸不动（还是 17px 的圆）：号码点在内圈很密，加大会互相压住 → 只加深、不放大。
   ══════════════════════════════════════════════════════════════════ */
.r-cirnum.hit {
  background: #c0392b !important;          /* 深红：红球 / 前区开出 */
  color: #fff !important;
  font-weight: 800 !important;
  text-shadow: 0 1px 1px rgba(0, 0, 0, .35) !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .85),
              0 0 6px 1px rgba(192, 57, 43, .55) !important;
  z-index: 5 !important;
}
.r-cirnum.hit.bl {
  background: #1f5fd6 !important;          /* 深蓝：蓝球 / 后区开出 */
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .85),
              0 0 6px 1px rgba(31, 95, 214, .55) !important;
}
.r-circenter.hit {
  background: #c0392b !important;
  border-color: #7d241a !important;
  color: #fff !important;
  font-weight: 800 !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .85),
              0 0 7px 2px rgba(192, 57, 43, .55) !important;
}
.r-circenter.hit.bl {
  background: #1f5fd6 !important;
  border-color: #16408f !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .85),
              0 0 7px 2px rgba(31, 95, 214, .55) !important;
}
/* 图例色点：和图上三档一一对应（命中深红 / 后区深蓝 / 其余浅灰） */
.r-legenditem .r-dot.hit { background: #c0392b !important; }
.r-legenditem .r-dot.hit.bl { background: #1f5fd6 !important; }
/* 老选择器保留成兜底（万一别处还在用这几个类名，也不会没样式） */
.r-cirpt.hit, .r-cirpoint.hit, .r-cirdot.hit {
  color: #fff !important;
  font-weight: 800 !important;
}



.px9-pick { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:8px; padding:7px 9px; background:#f4fbf7; border:1px solid #cfe9dc; border-radius:8px; }
.px9-pick-k { font-size:11.5px; font-weight:700; color:#1a8c5a; flex:0 0 auto; }
.px9-pick-b { display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
.px9-pick-b i { font-style:normal; display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:50%; background:#e02020; color:#fff; font-size:12px; font-weight:700; letter-spacing:0; }
.px9-pick-b i.bl { background:#1f5fd6; }

/* ===== 5 类号表格（用户 2026-10-19「每个号码也要隔开一下」）===== */
.kg-versal { display:flex; gap:6px; margin:2px 0 8px; }
.kg-v { flex:1 1 0; text-align:center; padding:6px 4px; border-radius:8px; background:#fffdf7;
        border:1px solid #efe3cf; font-size:11.5px; cursor:pointer; }
.kg-v.on { background:#e3f2ea; border-color:#1a8c5a; color:#1a8c5a; font-weight:700; }
.ro-xj5 { margin: 8px 0 2px; border: 1px solid #efe3cf; border-radius: 10px; background: #fffdf7; }
.ro-xj5-sum { padding: 9px 10px; font-size: 12px; font-weight: 700; color: #1a8c5a; cursor: pointer; list-style: none; }
.ro-xj5-sum::-webkit-details-marker { display: none; }
.ro-xj5-body { padding: 2px 10px 10px; }
.ro-xj5-cat { margin-top: 8px; }
.ro-xj5-h { display: flex; align-items: center; gap: 8px; padding: 4px 0 5px; border-bottom: 1px dashed #efe3cf; }
.ro-xj5-h b { font-size: 12.5px; color: #c0392b; }
.ro-xj5-h span { font-size: 10.5px; color: #8a7a63; }
.ro-xj5-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; border-bottom: 1px dashed #f5eee2; }
.ro-xj5-n { flex: 0 0 76px; font-size: 11.5px; color: #4a3a26; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ro-xj5-b { flex: 1 1 auto; display: flex; flex-wrap: wrap; gap: 4px; }
.ro-xj5-b i { font-style: normal; display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%; background: #fdeaea; color: #c0392b;
  border: 1px solid #f3cfcf; font-size: 11px; }

/* __FROG_CSS__ 青蛙家园面板 */
.frog { margin: 12px 16px; background: #fdf6ea; border: 1px solid #e8d7bd; border-radius: 12px; }
.frog-sum { display: flex; align-items: center; justify-content: space-between; padding: 14px 14px; cursor: pointer; list-style: none; }
.frog-sum::-webkit-details-marker { display: none; }
.frog-t { font-size: 15px; font-weight: 800; color: #4a3a26; }
.frog-go { font-size: 12px; color: #1a8c5a; font-weight: 700; }
.frog-body { padding: 0 14px 14px; }
.frog-sec { border-top: 1px dashed #ecdcc2; padding: 10px 0 6px; }
.frog-h { font-size: 12.5px; font-weight: 700; color: #8a7a63; margin-bottom: 6px; }
.frog-balls { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.frog-b { width: 26px; height: 26px; border-radius: 50%; background: #c0392b; color: #fff; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.frog-b.blue { background: #1f5fd6; }
.frog-plus { color: #8a7a63; font-weight: 700; }
.frog-art { display: flex; gap: 6px; align-items: center; padding: 6px 0; border-bottom: 1px dotted #f0e4cf; text-decoration: none; color: #4a3a26; }
.frog-i { flex: 0 0 16px; font-size: 11px; color: #b9a98c; }
.frog-at { flex: 1; font-size: 12.5px; }
.frog-ag { font-size: 11.5px; color: #1a8c5a; font-weight: 700; }
.frog-none { font-size: 12px; color: #a89a80; }
/* __FROG_ART_BODY__ 免费资料 · 点标题就地看正文（用户 2026-10-20）
   · <details>/<summary> 做展开 —— 页面上不出现裸 button（硬约束：裸 button 0）
   · 正文 13px / 行高 1.7 / 正常段落；word-break 保证 375、320 不溢出 */
.frog-art2 { border-bottom: 1px dotted #f0e4cf; }
.frog-art2 > summary { display: flex; gap: 6px; align-items: center; padding: 7px 0; cursor: pointer; list-style: none; }
.frog-art2 > summary::-webkit-details-marker { display: none; }
.frog-art2 > summary .frog-at { font-size: 12.5px; line-height: 1.45; text-align: left; word-break: break-word; overflow-wrap: anywhere; }
.frog-art2 > summary .frog-ag { flex: 0 0 auto; }
.frog-art2 > summary .frog-ag::after { content: "▾"; margin-left: 2px; }
.frog-art2[open] > summary .frog-ag::after { content: "▴"; }
.frog-ab { font-size: 13px; line-height: 1.7; color: #4a3a26; text-align: left; background: #fffdf7;
  border: 1px solid #f0e4cf; border-radius: 8px; padding: 9px 10px; margin: 2px 0 6px;
  word-break: break-word; overflow-wrap: anywhere; }
.frog-ab p { margin: 0 0 9px; }
.frog-ab p:last-child { margin-bottom: 0; }
.frog-more { margin: 0 0 6px; }
.frog-more > summary { font-size: 11.5px; color: #1a8c5a; font-weight: 700; cursor: pointer; list-style: none; padding: 2px 0 5px; }
.frog-more > summary::-webkit-details-marker { display: none; }
.frog-src { display: inline-block; font-size: 11.5px; color: #1a8c5a; font-weight: 700; text-decoration: none; padding: 0 0 7px; }
.frog-tip { font-size: 11px; color: #a89a80; margin-top: 8px; }
/* __ART_20__ 免费资料 20 条（用户 2026-10-21「文章资料抓二十条，最好都带正文」）
   ------------------------------------------------------------
   青蛙家园是「🐸青蛙家园 + 历史开奖」半屏两列里的一格（375 下约 167px / 320 下约 140px），
   20 条正文列表直接铺开要把这一格拉高 3000px+（实测 3347px）→ 整块收进一个折叠 <details>
   （用户原话允许：「如果太长，可以折叠免费资料整块」）。
   · 用 <details>/<summary>：裸 button 仍然是 0（页面铁律）
   · 默认收起：一行「免费资料 · 共 20 条 ＋ 点开看正文 ›」，点开就是 20 条
   · 字号 / 配色沿用米杏色系，标题居中（跟其它 .frog-h 一致） */
.frog-mats > summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
  column-gap: 6px; row-gap: 1px; cursor: pointer; list-style: none; padding: 1px 0 2px; }
.frog-mats > summary::-webkit-details-marker { display: none; }
.frog-mats > summary .frog-h { margin-bottom: 0; white-space: nowrap; }
.frog-mats > summary .frog-ag { flex: 0 0 auto; }
.frog-mats > summary .frog-ag::after { content: "▾"; margin-left: 2px; }
.frog-mats[open] > summary .frog-ag::after { content: "▴"; }
.frog-mats-body { padding-top: 2px; }


/* ===== 九算法嵌入块（用户 2026-10-19）===== */
.px9-embed { margin: 10px 0 4px; }
.px9-embed-h { font-size: 12.5px; font-weight: 700; color: #1a8c5a; margin: 0 0 6px 2px; }
@media (max-width: 420px) { .px9-embed iframe { height: 1500px; } }

/* __FROG_LAB_CSS__ 青蛙家园功能中心 */
.frog-tools { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 8px; }
.frog-btn { text-align: center; padding: 8px 2px; background: #fffaf2; border: 1px solid #ecdcc2; border-radius: 8px; font-size: 11.5px; color: #4a3a26; cursor: pointer; }
.frog-btn:active { background: #ffe9c9; }
.frog-out { background: #fff; border: 1px solid #ecdcc2; border-radius: 8px; padding: 8px; font-size: 12px; color: #4a3a26; line-height: 1.7; min-height: 44px; }
.frog-row { display: flex; justify-content: space-between; border-bottom: 1px dotted #f0e4cf; padding: 2px 0; }
/* 摇号机：彩种 / 号码个数 小药丸（三码同出·四码同出也复用 .frog-tip 那行提示） */
.frog-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 3px 0 5px; }
.frog-chip { padding: 3px 7px; border: 1px solid #ecdcc2; border-radius: 999px; background: #fffaf2; font-size: 11px; color: #4a3a26; cursor: pointer; line-height: 1.4; }
.frog-chip:active { background: #ffe9c9; }
.frog-chip.on { background: #1a8c5a; border-color: #1a8c5a; color: #fff; font-weight: 700; }
.frog-ql { font-size: 11px; color: #8a7a63; margin-top: 4px; }
.frog-qv { font-size: 12.5px; font-weight: 700; color: #4a3a26; margin: 4px 0 2px; line-height: 1.7; word-break: break-word; }
.frog-qv i { font-style: normal; font-weight: 400; font-size: 11px; color: #8a7a63; }
/* 三码同出 / 四码同出 的每一条：组合 + 次数一行（跟二码同出同一套左右对齐），
   「最近哪期」缩成下一行小灰字 —— 半屏卡（375 下只有 167px）里才不会挤成一团 */
.frog-co { border-bottom: 1px dotted #f0e4cf; padding: 3px 0; }
.frog-co-h { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 0 3px; }
.frog-co-k { font-size: 12.5px; font-weight: 700; color: #4a3a26; letter-spacing: .2px; }
.frog-co-n { font-size: 11.5px; font-weight: 700; color: #c0392b; margin-left: auto; }
.frog-co-t { font-size: 10.5px; color: #a89a80; margin-top: 1px; }
@media (max-width: 340px) { .frog-co-k { font-size: 10.5px; letter-spacing: 0; } .frog-co-n { font-size: 10px; } }
/* ============================================================
   __FROG_RES_BALL__ 功能中心【结果区】的号码 = 球 + 加粗（用户 2026-10-20：
     「这里面号码也要加球加粗」）
   ------------------------------------------------------------
   · 球体本身【复用】现成的 .frog-b（红底白字）和 .frog-b.blue
     （#frogHome .frog-b.blue 已经是「深蓝渐变 + 白字 800」加强版）——
     这里只加【尺寸】和【加粗】，不新写一套配色/渐变。
   · 功能中心是半屏：球收到 20px、字号 11px；球排不下自动折行（flex-wrap），
     375 / 320 都不会横向溢出。
   ============================================================ */
#frogOut .frog-b {
  width: 20px; height: 20px; min-width: 20px;
  font-size: 11px; font-weight: 800; letter-spacing: 0;
}
#frogOut .frog-b.blue { width: 20px; height: 20px; min-width: 20px; }
#frogOut .frog-bq { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 3px; }
#frogOut .frog-bq i { font-style: normal; font-weight: 800; font-size: 11px; color: #b9a98c; }
#frogOut .frog-row { align-items: center; gap: 6px; }
#frogOut .frog-row > span:first-child { flex: 0 1 auto; display: inline-flex; align-items: center; gap: 4px; }
#frogOut .frog-row > span:last-child { flex: 0 1 auto; display: inline-flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 4px; text-align: right; }
#frogOut .frog-co-h { align-items: center; }
#frogOut .frog-qv .frog-bq { margin-top: 2px; }
@media (max-width: 340px) {
  #frogOut .frog-b { width: 18px; height: 18px; min-width: 18px; font-size: 10.5px; }
  #frogOut .frog-b.blue { width: 18px; height: 18px; min-width: 18px; }
  #frogOut .frog-bq { gap: 2px; }
}


/* TAB_OPAQUE · 用户 2026-10-21「手机下滑的时候 tab 能把下面的内容透出来」→ tab 条必须完全不透明 */
.top-tabs,
.top-tabs.stuck {
  background: #f7efe1 !important;   /* 硬不透明（页面底色一致 ✔） */
  background-color: #f7efe1 !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
/* 保险：先铺一层伪元素当底色，任何情况下都不会透 */
.top-tabs::before {
  content: '';
  position: absolute;
  left: 0; right: 0; top: 0; bottom: 0;
  background: #f7efe1;
  z-index: -1;
}
.top-tabs { position: sticky; }

/* SAFE_AREA_TABS · 用户 2026-10-21「刘海屏能够透露出下面的字」
   ① 刘海/状态栏高度用 env(safe-area-inset-top) 顶开，tab 文字不会被刘海切
   ② 底色强制不透明（已有 TAB_OPAQUE）+ 顶部安全区也铺满底色 */
.top-tabs {
  padding-top: env(safe-area-inset-top, 0px);
  background: #f7efe1 !important;
  background-color: #f7efe1 !important;
}
/* 刘海那条缝也铺底色，避免透出下面的字 */
body { background-color: #f7efe1; }

#monsterOut .frog-b {
  width: 20px; height: 20px; min-width: 20px;
  font-size: 11px; font-weight: 800; letter-spacing: 0;
}
#monsterOut .frog-b.blue { width: 20px; height: 20px; min-width: 20px; }
#monsterOut .frog-bq { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 3px; }
#monsterOut .frog-bq i { font-style: normal; font-weight: 800; font-size: 11px; color: #b9a98c; }
#monsterOut .frog-row { align-items: center; gap: 6px; }
#monsterOut .frog-row > span:first-child { flex: 0 1 auto; display: inline-flex; align-items: center; gap: 4px; }
#monsterOut .frog-row > span:last-child { flex: 0 1 auto; display: inline-flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 4px; text-align: right; }
#monsterOut .frog-co-h { align-items: center; }
#monsterOut .frog-qv .frog-bq { margin-top: 2px; }
@media (max-width: 340px) {
  #monsterOut .frog-b { width: 18px; height: 18px; min-width: 18px; font-size: 10.5px; }
  #monsterOut .frog-b.blue { width: 18px; height: 18px; min-width: 18px; }
  #monsterOut .frog-bq { gap: 2px; }
}


/* TAB_OPAQUE · 用户 2026-10-21「手机下滑的时候 tab 能把下面的内容透出来」→ tab 条必须完全不透明 */
.top-tabs,
.top-tabs.stuck {
  background: #f7efe1 !important;   /* 硬不透明（页面底色一致 ✔） */
  background-color: #f7efe1 !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
/* 保险：先铺一层伪元素当底色，任何情况下都不会透 */
.top-tabs::before {
  content: '';
  position: absolute;
  left: 0; right: 0; top: 0; bottom: 0;
  background: #f7efe1;
  z-index: -1;
}
.top-tabs { position: sticky; }

/* SAFE_AREA_TABS · 用户 2026-10-21「刘海屏能够透露出下面的字」
   ① 刘海/状态栏高度用 env(safe-area-inset-top) 顶开，tab 文字不会被刘海切
   ② 底色强制不透明（已有 TAB_OPAQUE）+ 顶部安全区也铺满底色 */
.top-tabs {
  padding-top: env(safe-area-inset-top, 0px);
  background: #f7efe1 !important;
  background-color: #f7efe1 !important;
}
/* 刘海那条缝也铺底色，避免透出下面的字 */
body { background-color: #f7efe1; }


/* ZLDQ_CSS · 名家图库（用户 2026-10-21） */
.ro-zldq { margin: 10px 0 4px; }
.ro-zldq-h { text-align: center; font-size: 15px; font-weight: 800; color: #4a3a26; margin: 4px 0 10px; }
.ro-zldq-row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
.ro-zldq-c { display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 12px 4px; border-radius: 10px; background: #fffdf7; border: 1px solid #e8d7bd;
  text-decoration: none; color: #4a3a26; text-align: center; }
.ro-zldq-c b { font-size: 13.5px; font-weight: 800; }
.ro-zldq-c span { font-size: 10px; color: #8a7a63; margin-top: 3px; }
@media (max-width: 420px) {
  .ro-zldq-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

.ro-zldq-tip { text-align:center; font-size:10.5px; color:#a89a80; margin:2px 0 10px; }
.ro-zldq-c { cursor:pointer; font-family:inherit; }

/* Gallery: one horizontal image strip per issue. */
.ro-zldq-row { display:flex; flex-wrap:wrap; align-items:flex-start; }
.ro-zldq-c { display:block; box-sizing:border-box; flex:1 1 85px; min-width:0; }
.ro-zldq-c[open] { flex:1 0 100%; width:100%; }
.ro-zldq-body { min-width:0; text-align:left; padding:8px; }
.ro-zldq-issue { min-width:0; margin:8px 0; }
.ro-zldq-issue>summary { cursor:pointer; padding:8px 0; }
.ro-zldq-i { display:flex; overflow-x:auto; gap:10px; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; }
.ro-zldq-i figure { flex:0 0 100%; min-width:0; margin:0; text-align:center; scroll-snap-align:start; }
.ro-zldq-i img { width:100%; height:65vh; object-fit:contain; cursor:zoom-in; }
.ro-zldq-i figcaption { padding:6px; font-size:12px; color:#8a7a63; }

.frog-monster-stage { display:flex; justify-content:space-around; align-items:center; min-height:90px; font-size:36px; overflow:hidden; }
.frog-monster-beam { opacity:.3; }
.frog-monster-stage.fired .frog-monster-beam { animation:frogbeam .8s ease-out; }
@keyframes frogbeam { from {opacity:1;transform:scale(.5) translateX(-20px);} to {opacity:0;transform:scale(2) translateX(20px);} }
.ro-zldq-riddle { white-space:pre-wrap; overflow-wrap:anywhere; box-sizing:border-box; padding:16px; text-align:left; height:65vh; overflow-y:auto; line-height:1.8; background:#fffdf7; }
.frog-monster-stage.fired .frog-monster-enemy { animation:frogshake .4s ease-in-out; }
.frog-monster-stage.defeated .frog-monster-enemy { opacity:.25; transform:rotate(30deg); }
.frog-monster-hp { text-align:center; font-size:12px; margin:6px 0; }
@keyframes frogshake { 25% {transform:translateX(8px);} 75% {transform:translateX(-8px);} }
#monsterHome > .frog-sum, #ro-zldq > .frog-sum { display:flex; flex-direction:column; align-items:center; text-align:center; gap:6px; }
.arena-field { display:block; width:100%; height:auto; border-radius:10px; border:1px solid #c3d2ba; outline-offset:3px; touch-action:none; }
.arena-status { font-weight:700; font-size:12px; padding:8px 0; }
.arena-controls { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-around; gap:8px; margin:10px 0; }
.arena-controls button { border:1px solid #d5c3a8; border-radius:8px; background:#fff8e8; color:#493722; min-width:42px; min-height:40px; font-weight:700; cursor:pointer; }
.arena-pad { text-align:center; } .arena-pad>div { display:flex; gap:4px; }
.arena-controls .arena-attack { padding:12px; background:#1a8c5a; color:white; }
#monsterPickCount { padding:8px; margin:8px 0; max-width:100%; }
.status-video-open { position:absolute; right:14px; top:14px; width:70px; height:62px; border:1px solid #dfc175; border-radius:10px; background:linear-gradient(135deg,#ffeaa9,#efd78f); display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; color:#89601b; }
.status-video-open>span { font-size:24px; } .status-video-open>small { font-size:10px; }
#roStatusCard .ro-st-txt { padding-right:85px; box-sizing:border-box; }
#roStatusCard.ro-st-fixed .status-video-open { display:none; }
.status-video-modal { position:fixed; inset:0; z-index:100001; background:rgba(0,0,0,.82); display:flex; align-items:center; justify-content:center; padding:14px; }
.status-video-modal[hidden] { display:none; }
.status-video-box { position:relative; width:min(92vw,430px); background:#111; border-radius:12px; padding:34px 8px 8px; }
.status-video-box video { width:100%; max-height:78vh; display:block; }
.status-video-close { position:absolute; right:10px; top:2px; font-size:28px; color:white; cursor:pointer; }
.status-video-message { color:white; text-align:center; font-size:12px; }
.arena-life { display:flex; flex-wrap:wrap; gap:5px; margin:6px 0; }
.arena-life button { border:1px solid #decda9; background:#fff8e8; border-radius:7px; padding:7px 9px; cursor:pointer; color:#4a3a26; }
.arena-needs { flex-basis:100%; font-size:11px; line-height:1.7; padding:5px 0; }
.status-video-open::before { content:"👉"; position:absolute; left:-30px; top:15px; font-size:24px; }
.handdraw-gallery figure { margin:8px 0; flex:0 0 100%; min-width:0; }
.handdraw-sheet { width:100%; height:auto; cursor:zoom-in; }
.handdraw-gallery figcaption { font-size:11px; text-align:center; }
/* MINGJIA_GALLERY 样式 */
.ro-mj { margin: 10px 0 6px; }
.ro-mj-h { text-align: center; font-size: 15px; font-weight: 800; color: #4a3a26; margin: 8px 0 10px; }
.ro-mj-cat { border: 1px solid #e8d7bd; border-radius: 10px; background: #fffdf7; margin-bottom: 8px; }
.ro-mj-cat-h { padding: 10px 12px; font-size: 13px; font-weight: 700; color: #1a8c5a; cursor: pointer; list-style: none; }
.ro-mj-cat-h::-webkit-details-marker { display: none; }
.ro-mj-p { padding: 6px 12px 10px; border-top: 1px dashed #f2e8d8; }
.ro-mj-n { font-size: 12px; font-weight: 700; color: #4a3a26; margin-bottom: 6px; }
.ro-mj-i { display: flex; gap: 6px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.ro-mj-i img { width: 120px; height: 90px; object-fit: cover; border-radius: 8px; border: 1px solid #efe3cf; flex: 0 0 auto; }
</style>
<div id="roPtr" aria-hidden="true"><div class="ro-ptr-spin"></div><div class="ro-ptr-arrow">↓</div><div class="ro-ptr-txt">下拉刷新</div></div>
<script>
(function () {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  /* ① 只有「从桌面图标进入」的独立模式才装：普通标签页浏览器自带下拉刷新 */
  var stand = false;
  try {
    var q = window.matchMedia;
    stand = !!(q && (q('(display-mode: standalone)').matches ||
      q('(display-mode: fullscreen)').matches ||
      q('(display-mode: minimal-ui)').matches)) || navigator.standalone === true;
  } catch (e) { stand = false; }
  if (!stand) return;

  /* ② 触屏才装：桌面版独立窗口是鼠标，没有下拉刷新这回事 */
  if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return;

  var box = document.getElementById('roPtr');
  if (!box) return;
  var txt = box.querySelector('.ro-ptr-txt');
  if (!txt) return;

  var THRESHOLD = 70;     /* 松手触发线：阻尼后的下拉距离 ≥ 70px 才算拉够了 */
  var MAXPULL = 120;      /* 最多能拉这么长，再拉就顶住 */
  var DAMP = 0.55;        /* 阻尼：手指移 10px，指示器只走 5.5px */
  var RELOAD_DELAY = 520; /* 「正在刷新…」至少留这么久，让人看得见再重载 */

  var startY = 0, startX = 0, dist = 0, pulling = false, busy = false, moved = false;

  function topNow() {
    return window.pageYOffset || document.documentElement.scrollTop ||
      (document.body && document.body.scrollTop) || 0;
  }

  /* 全屏层开着（看大图 / 子页面 / 保存图片…）→ 那层自己会滚，不在它上面做下拉刷新 */
  function overlayOpen() {
    var sel = ['.ro-mob-view', '.tool-view', '.jxp-view', '.calc-shot', '#mask'];
    for (var i = 0; i < sel.length; i++) {
      var n = document.querySelector(sel[i]);
      if (!n) continue;
      var cs = window.getComputedStyle ? window.getComputedStyle(n) : null;
      if (cs && cs.display !== 'none' && cs.visibility !== 'hidden') return true;
    }
    return document.documentElement.style.overflow === 'hidden';
  }

  /* 指示器放在顶部条下面（竞彩页有 .site-nav），不要盖住 Tab */
  function topOffset() {
    var h = document.querySelector('.site-nav, .top-tabs');
    if (h && h.getBoundingClientRect) {
      try {
        var r = h.getBoundingClientRect();
        if (r.height > 0 && r.bottom > 0 && r.bottom < 160) return Math.round(r.bottom + 10);
      } catch (e) { }
    }
    return 10;
  }

  function paint(p) {
    box.style.opacity = String(Math.min(1, p * 1.8));
    box.style.transform = 'translateX(-50%) translateY(' + (Math.round(p * 16) - 16) + 'px)';
    if (p >= 1) {
      box.classList.add('rdy');
      if (txt.textContent !== '松开刷新') txt.textContent = '松开刷新';
    } else {
      box.classList.remove('rdy');
      if (txt.textContent !== '下拉刷新') txt.textContent = '下拉刷新';
    }
  }

  function rest() {
    box.classList.remove('rdy');
    box.style.transition = '';
    box.style.opacity = '0';
    box.style.transform = 'translateX(-50%) translateY(-16px)';
  }

  function refresh() {
    busy = true;
    box.classList.remove('rdy');
    box.classList.add('busy');
    box.style.transition = '';
    box.style.opacity = '1';
    box.style.transform = 'translateX(-50%) translateY(0)';
    txt.textContent = '正在刷新…';
    window.setTimeout(function () {
      try { window.location.reload(); } catch (e) { }
    }, RELOAD_DELAY);
    /* 万一这个环境拦了 reload（极少数 WebView）→ 恢复状态，别把下拉刷新卡死 */
    window.setTimeout(function () {
      busy = false;
      box.classList.remove('busy');
      rest();
    }, RELOAD_DELAY + 2600);
  }

  function onStart(ev) {
    if (busy) return;
    if (!ev.touches || ev.touches.length !== 1) { pulling = false; return; }
    if (topNow() > 0) { pulling = false; return; }        /* 没在最顶 → 整个手势不碰 */
    if (overlayOpen()) { pulling = false; return; }
    startY = ev.touches[0].clientY;
    startX = ev.touches[0].clientX;
    dist = 0;
    moved = false;
    pulling = true;
    box.style.top = topOffset() + 'px';
  }

  function onMove(ev) {
    if (!pulling || busy) return;
    if (!ev.touches || ev.touches.length !== 1) { pulling = false; rest(); return; }
    var dy = ev.touches[0].clientY - startY;
    var dx = ev.touches[0].clientX - startX;
    if (!moved) {
      if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
      if (Math.abs(dx) >= Math.abs(dy)) { pulling = false; return; }   /* 横滑 → 不抢 */
      moved = true;
    }
    if (topNow() > 0) { pulling = false; if (dist > 0) rest(); return; }
    if (dy <= 0) { if (dist > 0) { dist = 0; rest(); } return; }       /* 往上推 → 不拦 */
    if (ev.cancelable && ev.preventDefault) ev.preventDefault();       /* 只在这一处拦 */
    var raw = dy * DAMP;
    dist = raw > MAXPULL ? MAXPULL : raw;
    box.style.transition = 'none';
    paint(dist / THRESHOLD > 1 ? 1 : dist / THRESHOLD);
  }

  function onEnd() {
    if (!pulling) return;
    pulling = false;
    if (busy) return;
    if (dist >= THRESHOLD) refresh();
    else if (dist > 0) rest();
    dist = 0;
  }

  /* 事件只挂在 document 上（4 个），页面里没有任何内联事件 */
  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd, { passive: true });
  document.addEventListener('touchcancel', onEnd, { passive: true });

  box.classList.add('on');
  box.style.opacity = '0';
  box.style.transform = 'translateX(-50%) translateY(-16px)';
})();
</script>

    <!-- __INSTALL_MOVED__ 安装教程区块（含 install-guide.jpg 大图）已经挪回 #article-rest 里，
       就在 .ro-foot / 免责声明之前（见上面 __INSTALL__ / __INSTALL_RESTORED__ 那段）。
       ⚠️ 别在这里再放一份：这里是 .ro-wrap 外面、body 直下，卡片样式会整个掉出去。 -->

</div>

<script>
/* __AI_CANDS__ 构建时算好的三套候选号码（冷号回补 / 热号延续 / 均衡分布） */
var AI_CANDIDATES = ${JSON.stringify(buildAiCandidates())};
</script>


<script>
/* __HM_CD__ 热力图刷新倒计时（用户 2026-10-18：一小时更新一次，就倒计时一小时）
   口径：倒计时到【下一个整点】，到点后自动重载本页一次（拿到最新热力图数据）。 */
(function () {
  var els = document.querySelectorAll('[data-ro-hm-cd]');
  if (!els.length) return;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function tick() {
    var now = new Date();
    var next = new Date(now.getTime());
    next.setMinutes(0, 0, 0);
    next.setHours(now.getHours() + 1);
    var left = Math.max(0, next.getTime() - now.getTime());
    var m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
    var txt = '刷新倒计时 ' + pad(m) + ':' + pad(sec);
    for (var i = 0; i < els.length; i++) els[i].textContent = txt;
    /* 到点不重载页面（会打断阅读）；倒计时自然回到下一小时 */
  }
  tick();
  setInterval(tick, 1000);
})();
</script>


<script>
/* __STANDALONE_HIDE__ iOS 的 navigator.standalone 兼容（部分旧 WebView 不认 display-mode） */
(function () {
  try {
    var sa = (window.navigator && window.navigator.standalone) ||
             (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
             (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches);
    if (sa) document.documentElement.classList.add('is-standalone');
  } catch (e) {}
})();
</script>


<script>
/* __PX9__ 9 套方法：各自独立的民间算法（期号种子 · 无随机数）
   ------------------------------------------------------------
   用户 2026-10-19：「这个推荐图根据网上一些民间算法去制作，每一个按钮里面尽量不同」
   · ①~⑧ 规则本质不同，两两重合不超过 3 个号（按各方法自己的分组槽位取号，不破坏配比）
   · ⑨ = 前 8 套加权投票（允许重合，它本来就是综合）
   · 数据：本页 DRAW_HISTORY（history.js，近 30 期真实开奖）
   · 种子：下一期期号（同一期固定、换期自动变）；全段不调用任何随机函数
   ⚠️ 这段最终内嵌在模板字符串里：不用反引号、不写美元花括号、不写反斜杠 */
(function (root) {
  var METHODS = ['余数算法', '分区法', '冷热号', '遗漏值算法', '奇偶', '质合', '和值', '跨度', '多源共振法'];
  var ORDER8 = METHODS.slice(0, 8);
  var CAP = 2;   /* ①~⑧ 两两重合上限（用户要求 2~3 个以内，这里取更严的 2） */
  var CFG = {
    ssq: { name: '双色球', max: 33, pick: 6, blueMax: 16, bluePick: 1, area: '红球', blueArea: '蓝球' },
    dlt: { name: '大乐透', max: 35, pick: 5, blueMax: 12, bluePick: 2, area: '前区', blueArea: '后区' }
  };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function numsOf(d, g) {
    var a = (d && d.areas) || {};
    return (g === 'dlt' ? (a.front || a.red) : (a.red || a.front)) || [];
  }
  function bluesOf(d, g) {
    var a = (d && d.areas) || {};
    return (g === 'dlt' ? (a.back || a.blue) : (a.blue || a.back)) || [];
  }
  function hist(g) {
    try {
      return (typeof DRAW_HISTORY !== 'undefined' && DRAW_HISTORY.games && (DRAW_HISTORY.games[g] || [])).slice(0, 30);
    } catch (e) { return []; }
  }
  function issueOf(g) {
    var ds = hist(g);
    return String((ds[0] && ds[0].issue) || '');
  }
  function nextIssue(g) {
    var s = issueOf(g), d = s.replace(/[^0-9]/g, '');
    if (!d) return s;
    var w = d.length, nx = String(Number(d) + 1);
    while (nx.length < w) nx = '0' + nx;
    return nx;
  }
  function seedOf(g) {
    var d = issueOf(g).replace(/[^0-9]/g, '');
    return d ? Number(d) + 1 : 1;
  }
  /* 期号哈希（纯函数：同号 + 同种子 → 永远同值；换期自动变） */
  function hsh(a, b, c) {
    var h = (a * 2654435761) >>> 0;
    h = (h + b * 40503) >>> 0;
    h = (h + c * 97) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    h = (h * 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return (h >>> 0) / 4294967296;
  }
  function isPrime(n) {
    if (n < 2) return false;
    for (var d = 2; d * d <= n; d++) if (n % d === 0) return false;
    return true;
  }
  function allNums(M) { var a = []; for (var i = 1; i <= M.max; i++) a.push(i); return a; }
  function sumOf(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function overlapOf(a, b) {
    var c = 0;
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) >= 0) c++;
    return c;
  }
  function diffCount(a, b) {
    var c = 0;
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) < 0) c++;
    return c;
  }
  function modeOf(arr, pick) {
    var cnt = {}, i, keys;
    for (i = 0; i < arr.length; i++) cnt[arr[i]] = (cnt[arr[i]] || 0) + 1;
    keys = Object.keys(cnt).map(Number);
    keys.sort(function (a, b) {
      return (cnt[b] - cnt[a]) || (Math.abs(a - pick / 2) - Math.abs(b - pick / 2)) || (a - b);
    });
    return { v: keys.length ? keys[0] : Math.round(pick / 2), c: keys.length ? cnt[keys[0]] : 0 };
  }

  /* ---------------- 公共底料：频次 / 当前遗漏 / 和值 / 跨度 ---------------- */
  function build(g) {
    var M = CFG[g], ds = hist(g), main = [], blue = [], i, n, x;
    for (i = 0; i < ds.length; i++) {
      main.push(numsOf(ds[i], g).map(Number));
      blue.push(bluesOf(ds[i], g).map(Number));
    }
    var f = {}, bf = {}, om = {}, bom = {}, last = {}, blast = {};
    for (n = 1; n <= M.max; n++) { f[n] = 0; om[n] = main.length; }
    for (n = 1; n <= M.blueMax; n++) { bf[n] = 0; bom[n] = blue.length; }
    for (i = 0; i < main.length; i++) {
      for (x = 0; x < main[i].length; x++) {
        n = main[i][x];
        if (f[n] == null) continue;
        f[n]++;
        last[n] = i;
      }
    }
    for (i = 0; i < blue.length; i++) {
      for (x = 0; x < blue[i].length; x++) {
        n = blue[i][x];
        if (bf[n] == null) continue;
        bf[n]++;
        blast[n] = i;
      }
    }
    for (n = 1; n <= M.max; n++) if (last[n] != null) om[n] = last[n];
    for (n = 1; n <= M.blueMax; n++) if (blast[n] != null) bom[n] = blast[n];
    var sums = [], spans = [];
    for (i = 0; i < main.length; i++) {
      sums.push(sumOf(main[i]));
      spans.push(main[i].length ? Math.max.apply(null, main[i]) - Math.min.apply(null, main[i]) : 0);
    }
    return {
      g: g, M: M, ds: ds, main: main, blue: blue, f: f, bf: bf, om: om, bom: bom,
      sums: sums, spans: spans,
      avgSum: sums.length ? sumOf(sums) / sums.length : 0,
      avgSpan: spans.length ? sumOf(spans) / spans.length : 0,
      seed: seedOf(g), issue: issueOf(g), next: nextIssue(g),
      theoretical: M.max / M.pick,
      zones: g === 'ssq' ? [[1, 11], [12, 22], [23, 33]] : [[1, 7], [8, 14], [15, 21], [22, 28], [29, 35]]
    };
  }
  function zoneName(g, i) {
    var names = g === 'ssq' ? ['一区', '二区', '三区'] : ['一区', '二区', '三区', '四区', '五区'];
    return names[i] || ('第' + (i + 1) + '区');
  }

  /* ================= ① 余数算法：÷3 余数分路 → 补出现最少的一路 → 段内按遗漏取 ================= */
  function mRoad(S) {
    var M = S.M, size = [0, 0, 0], hit = [0, 0, 0], i, r;
    for (i = 1; i <= M.max; i++) { size[i % 3]++; hit[i % 3] += S.f[i]; }
    var total = (S.main.length || 30) * M.pick;
    var expect = [0, 0, 0], defect = [0, 0, 0];
    for (r = 0; r < 3; r++) { expect[r] = total * size[r] / M.max; defect[r] = expect[r] - hit[r]; }
    var order = [0, 1, 2].sort(function (a, b) {
      return (defect[b] - defect[a]) || (hsh(S.seed, a, 1) - hsh(S.seed, b, 1));
    });
    var quotas = M.pick >= 6 ? [3, 2, 1] : [2, 2, 1];
    var slots = [], lane = {}, want = {};
    order.forEach(function (rr, k) {
      want[rr] = quotas[k];
      var seg = [];
      for (var n = 1; n <= M.max; n++) if (n % 3 === rr) seg.push(n);
      seg.sort(function (a, b) {
        return (S.om[b] - S.om[a]) || (S.f[a] - S.f[b]) || (hsh(S.seed, a, 40 + rr) - hsh(S.seed, b, 40 + rr));
      });
      lane[rr] = seg;
      for (var q = 0; q < quotas[k]; q++) slots.push(seg);
    });
    return {
      slots: slots, lane: lane,
      describe: function (red) {
        var c = [0, 0, 0];
        red.forEach(function (n) { c[n % 3]++; });
        return '按 ÷3 余数分组，补最冷的一段：0路 ' + c[0] + ' 个 / 1路 ' + c[1] + ' 个 / 2路 ' + c[2] +
          ' 个（近30期 ' + hit[0] + ' / ' + hit[1] + ' / ' + hit[2] + ' 次；本段配额 ' +
          order.map(function (rr2) { return rr2 + '路 ' + want[rr2]; }).join(' / ') + '）';
      },
      rows: [
        ['余 0 路（' + size[0] + ' 码）', hit[0] + ' 次 · 应 ' + expect[0].toFixed(0)],
        ['余 1 路（' + size[1] + ' 码）', hit[1] + ' 次 · 应 ' + expect[1].toFixed(0)],
        ['余 2 路（' + size[2] + ' 码）', hit[2] + ' 次 · 应 ' + expect[2].toFixed(0)]
      ],
      group: function (n) { return (n % 3) + '路'; }
    };
  }

  /* ================= ② 分区法：红球 3 区 / 大乐透 5 区 → 补最冷的区 → 固定配额 ================= */
  function mZone(S) {
    var M = S.M, Z = S.zones, zi, zcnt = [], n, k;
    for (zi = 0; zi < Z.length; zi++) zcnt[zi] = 0;
    for (var i = 0; i < S.main.length; i++) {
      for (var j = 0; j < S.main[i].length; j++) {
        n = S.main[i][j];
        for (k = 0; k < Z.length; k++) {
          if (n >= Z[k][0] && n <= Z[k][1]) { zcnt[k]++; break; }
        }
      }
    }
    var total = (S.main.length || 30) * M.pick, expect = [], defect = [];
    for (zi = 0; zi < Z.length; zi++) {
      expect[zi] = total * (Z[zi][1] - Z[zi][0] + 1) / M.max;
      defect[zi] = expect[zi] - zcnt[zi];
    }
    var order = [];
    for (zi = 0; zi < Z.length; zi++) order.push(zi);
    order.sort(function (a, b) { return (defect[b] - defect[a]) || (zcnt[a] - zcnt[b]) || (a - b); });
    var quotas = M.pick >= 6 ? [2, 2, 2] : [1, 1, 1, 1, 1];
    var slots = [];
    order.forEach(function (zi2, rank2) {
      var seg = [];
      for (var x = Z[zi2][0]; x <= Z[zi2][1]; x++) seg.push(x);
      if (rank2 === 0) {
        seg.sort(function (a, b) {
          return (S.om[b] - S.om[a]) || (S.f[a] - S.f[b]) || (hsh(S.seed, a, 50 + zi2) - hsh(S.seed, b, 50 + zi2));
        });
      } else {
        seg.sort(function (a, b) {
          return (S.f[b] - S.f[a]) || (S.om[b] - S.om[a]) || (hsh(S.seed, a, 60 + zi2) - hsh(S.seed, b, 60 + zi2));
        });
      }
      for (var q = 0; q < quotas[rank2]; q++) slots.push(seg);
    });
    var coldZ = order[0];
    return {
      slots: slots,
      describe: function (red) {
        var c = [];
        for (var zz = 0; zz < Z.length; zz++) c[zz] = 0;
        red.forEach(function (n2) {
          for (var k2 = 0; k2 < Z.length; k2++) {
            if (n2 >= Z[k2][0] && n2 <= Z[k2][1]) { c[k2]++; break; }
          }
        });
        var now = [];
        for (var z3 = 0; z3 < Z.length; z3++) now.push(zoneName(S.g, z3) + ' ' + c[z3]);
        return Z.length + ' 区固定配额 ' + quotas.join(':') +
          '：最冷 ' + zoneName(S.g, coldZ) + ' ' + pad(Z[coldZ][0]) + '-' + pad(Z[coldZ][1]) +
          ' 近30期 ' + zcnt[coldZ] + ' 个（应 ' + expect[coldZ].toFixed(0) + '）→ 冷区按遗漏补、其余区按热度取（本轮 ' +
          now.join(' / ') + '）';
      },
      rows: order.map(function (zi4) {
        return [zoneName(S.g, zi4) + ' ' + pad(Z[zi4][0]) + '-' + pad(Z[zi4][1]), '出 ' + zcnt[zi4] + ' 个 · 应 ' + expect[zi4].toFixed(0) + ' 个'];
      }),
      group: function (n2) {
        for (var zz = 0; zz < Z.length; zz++) if (n2 >= Z[zz][0] && n2 <= Z[zz][1]) return zoneName(S.g, zz);
        return '';
      }
    };
  }

  /* ================= ③ 冷热号：频次分三档 → 热 3 + 温 2 + 冷 1 ================= */
  function mHotCold(S) {
    var M = S.M, all = allNums(M);
    var byF = all.slice().sort(function (a, b) {
      return (S.f[b] - S.f[a]) || (hsh(S.seed, a, 3) - hsh(S.seed, b, 3));
    });
    var third = Math.ceil(M.max / 3);
    var hotBand = byF.slice(0, third);
    var warmBand = byF.slice(third, third * 2);
    var coldBand = byF.slice(third * 2);
    var hotList = hotBand.slice();
    var warmList = warmBand.slice().sort(function (a, b) {
      return (S.om[b] - S.om[a]) || (S.f[b] - S.f[a]) || (hsh(S.seed, a, 4) - hsh(S.seed, b, 4));
    });
    var coldList = coldBand.slice().sort(function (a, b) {
      return (S.f[a] - S.f[b]) || (hsh(S.seed, a, 5) - hsh(S.seed, b, 5));
    });
    var hotN = 3, coldN = 1, warmN = Math.max(1, M.pick - hotN - coldN);
    var slots = [];
    for (var i = 0; i < hotN; i++) slots.push(hotList);
    for (var j = 0; j < warmN; j++) slots.push(warmList);
    for (var k = 0; k < coldN; k++) slots.push(coldList);
    function bandOf(n) {
      if (hotBand.indexOf(n) >= 0) return '热';
      if (warmBand.indexOf(n) >= 0) return '温';
      return '冷';
    }
    return {
      slots: slots,
      describe: function (red) {
        var g = { hot: [], warm: [], cold: [] };
        red.forEach(function (n2) {
          var b = bandOf(n2);
          if (b === '热') g.hot.push(pad(n2));
          else if (b === '温') g.warm.push(pad(n2));
          else g.cold.push(pad(n2));
        });
        return '近30期频次分三档，热 3 + 温 ' + warmN + ' + 冷 1 混搭（纯热号太容易撞）→ 热档 ' +
          (g.hot.join(' ') || '—') + ' · 温档 ' + (g.warm.join(' ') || '—') + ' · 冷档 ' +
          (g.cold.join(' ') || '—') + '（冷档 30 期只出 ' + S.f[g.cold.length ? Number(g.cold[0]) : coldList[0]] + ' 次）';
      },
      rows: [
        ['热档（频次前 ' + third + '）', hotBand.slice(0, 6).map(function (n2) { return pad(n2) + '(' + S.f[n2] + '次)'; }).join(' ')],
        ['冷档（频次垫底）', coldBand.slice().sort(function (a, b) { return S.f[a] - S.f[b] || a - b; }).slice(0, 6).map(function (n2) { return pad(n2) + '(' + S.f[n2] + '次)'; }).join(' ')],
        ['温档按遗漏排', warmList.slice(0, 6).map(function (n2) { return pad(n2) + '(遗' + S.om[n2] + ')'; }).join(' ')]
      ],
      group: bandOf
    };
  }

  /* ================= ④ 遗漏值算法：当前遗漏 vs 理论遗漏（最接近 2 倍理论值） ================= */
  function mOmit(S) {
    var M = S.M, all = allNums(M), T = 2 * S.theoretical;
    var rank = all.slice().sort(function (a, b) {
      var da = Math.abs(S.om[a] - T), db = Math.abs(S.om[b] - T);
      return (da - db) || (S.om[b] - S.om[a]) || (hsh(S.seed, a, 6) - hsh(S.seed, b, 6));
    });
    var slots = [];
    for (var i = 0; i < M.pick; i++) slots.push(rank);
    return {
      slots: slots,
      describe: function (red) {
        return '理论遗漏 ' + S.theoretical + ' 期 → 取当前遗漏最接近 2 倍（' + T + ' 期）的号，该回来了：' +
          red.map(function (n) { return pad(n) + '(' + S.om[n] + '期)'; }).join(' ');
      },
      rowsOf: function (red) {
        return [
          ['理论遗漏（' + M.max + '÷' + M.pick + '）', S.theoretical.toFixed(2) + ' 期'],
          ['本轮取号遗漏', red.map(function (n) { return S.om[n]; }).join(' / ') + ' 期']
        ];
      },
      group: function () { return '遗漏'; }
    };
  }

  /* ================= ⑤ 奇偶：先定奇偶配比 → 奇数按热度、偶数按遗漏 ================= */
  function mParity(S) {
    var M = S.M, all = allNums(M);
    var cnts = S.main.map(function (a) { return a.filter(function (n) { return n % 2 === 1; }).length; });
    var mode = modeOf(cnts, M.pick);
    var k = Math.max(1, Math.min(M.pick - 1, mode.v));
    var odds = all.filter(function (n) { return n % 2 === 1; }).sort(function (a, b) {
      return (S.f[b] - S.f[a]) || (hsh(S.seed, a, 7) - hsh(S.seed, b, 7));
    });
    var evens = all.filter(function (n) { return n % 2 === 0; }).sort(function (a, b) {
      return (S.om[b] - S.om[a]) || (S.f[b] - S.f[a]) || (hsh(S.seed, a, 8) - hsh(S.seed, b, 8));
    });
    var slots = [];
    for (var i = 0; i < k; i++) slots.push(odds);
    for (var j = 0; j < M.pick - k; j++) slots.push(evens);
    return {
      slots: slots,
      describe: function (red) {
        var odd = 0;
        red.forEach(function (n) { if (n % 2 === 1) odd++; });
        return '近30期最常见奇偶比 ' + k + ':' + (M.pick - k) + '（出现 ' + mode.c + ' 期）→ 奇数 ' + odd +
          ' 个（按热度取）· 偶数 ' + (red.length - odd) + ' 个（按遗漏取），两个维度交叉';
      },
      rows: [
        ['奇数 / 偶数', odds.length + ' 个 / ' + evens.length + ' 个'],
        ['近30期奇数个数分布', Object.keys(cnts.reduce(function (o, c) { o[c] = 1; return o; }, {}))
          .sort().map(function (c) { return c + '个:' + cnts.filter(function (x) { return x === c; }).length + '期'; }).join(' · ')]
      ],
      group: function (n) { return n % 2 === 1 ? '奇' : '偶'; }
    };
  }

  /* ================= ⑥ 质合：质数按遗漏、合数按热度 ================= */
  function mPrime(S) {
    var M = S.M, all = allNums(M);
    var cnts = S.main.map(function (a) { return a.filter(isPrime).length; });
    var mode = modeOf(cnts, M.pick);
    var p = Math.max(1, Math.min(M.pick - 1, mode.v));
    var primes = all.filter(isPrime).sort(function (a, b) {
      return (S.om[b] - S.om[a]) || (S.f[b] - S.f[a]) || (hsh(S.seed, a, 9) - hsh(S.seed, b, 9));
    });
    var comps = all.filter(function (n) { return !isPrime(n); }).sort(function (a, b) {
      return (S.f[b] - S.f[a]) || (hsh(S.seed, a, 10) - hsh(S.seed, b, 10));
    });
    var slots = [];
    for (var i = 0; i < p; i++) slots.push(primes);
    for (var j = 0; j < M.pick - p; j++) slots.push(comps);
    return {
      slots: slots,
      describe: function (red) {
        var pc = 0;
        red.forEach(function (n) { if (isPrime(n)) pc++; });
        return '质数(2,3,5,7,11,13,17,19,23,29,31) vs 合数：近30期最常见 ' + p + ':' + (M.pick - p) +
          ' → 质数 ' + pc + ' 个（按遗漏取）· 合数 ' + (red.length - pc) + ' 个（按热度取）';
      },
      rows: [
        ['质数 / 合数', primes.length + ' 个 / ' + comps.length + ' 个'],
        ['近30期质数个数分布', Object.keys(cnts.reduce(function (o, c) { o[c] = 1; return o; }, {}))
          .sort().map(function (c) { return c + '个:' + cnts.filter(function (x) { return x === c; }).length + '期'; }).join(' · ')]
      ],
      group: function (n) { return isPrime(n) ? '质' : '合'; }
    };
  }

  /* ================= ⑦ 和值：定目标和值 → 组合搜索（不是逐个挑） ================= */
  function sumCombo(S, banned) {
    var M = S.M, k = M.pick, maxS = k * M.max + 1, n, c, s;
    var target = Math.round(S.avgSum);
    var w = {}, w0 = {};
    for (n = 1; n <= M.max; n++) {
      w0[n] = S.f[n] + S.om[n] * 0.18 + hsh(S.seed, n, 11) * 0.8;
      w[n] = w0[n];
      if (banned && banned[n]) w[n] = -1e6;
    }
    var NEG = -1e9, LAY = (k + 1) * maxS, dp = [];
    for (n = 0; n <= M.max; n++) {
      for (c = 0; c <= k; c++) for (s = 0; s < maxS; s++) dp[n * LAY + c * maxS + s] = NEG;
    }
    dp[0] = 0;
    for (n = 1; n <= M.max; n++) {
      var base = n * LAY, prev = (n - 1) * LAY;
      for (c = 0; c <= k; c++) for (s = 0; s < maxS; s++) dp[base + c * maxS + s] = dp[prev + c * maxS + s];
      for (c = 1; c <= k; c++) {
        for (s = n; s < maxS; s++) {
          var pv = dp[prev + (c - 1) * maxS + (s - n)];
          if (pv > NEG / 2 && pv + w[n] > dp[base + c * maxS + s]) dp[base + c * maxS + s] = pv + w[n];
        }
      }
    }
    var bestS = -1, bestD = 1e9;
    for (s = 1; s < maxS; s++) {
      var v = dp[M.max * LAY + k * maxS + s];
      if (v <= NEG / 2) continue;
      var d = Math.abs(s - target);
      if (d < bestD || (d === bestD && (bestS < 0 || v > dp[M.max * LAY + k * maxS + bestS]))) { bestD = d; bestS = s; }
    }
    var red = [];
    if (bestS >= 0) {
      c = k; s = bestS;
      for (n = M.max; n >= 1 && c > 0; n--) {
        if (dp[n * LAY + c * maxS + s] !== dp[(n - 1) * LAY + c * maxS + s]) {
          red.push(n); c--; s -= n;
        }
      }
    }
    red = red.filter(function (n2) { return n2 > 0; });
    if (red.length < k) {
      for (n = 1; n <= M.max && red.length < k; n++) if (red.indexOf(n) < 0) red.push(n);
    }
    return { red: red, sum: sumOf(red), target: target, w: w, w0: w0 };
  }
  function mSumInfo(S, res) {
    return '目标和值 ' + res.target + '（近30期均值 ' + S.avgSum.toFixed(1) + '）· 实际 ' + res.sum +
      ' · 在 1-' + S.M.max + ' 里做组合搜索（不是逐个挑）';
  }

  /* ================= ⑧ 跨度：定目标跨度 → 锁两端 → 中段取最近出过的号 ================= */
  function spanPairs(S) {
    var M = S.M, target = Math.round(S.avgSpan), out = [];
    for (var l = 1; l + target <= M.max; l++) {
      var h = l + target;
      out.push({
        lo: l, hi: h, target: target,
        sc: (S.om[l] + S.om[h]) * 0.9 + (S.f[l] + S.f[h]) * 0.2 + hsh(S.seed, l, 12) * 1.5
      });
    }
    out.sort(function (a, b) { return (b.sc - a.sc) || (a.lo - b.lo); });
    return out;
  }
  function spanMid(S, p) {
    var inner = [];
    for (var n = p.lo + 1; n < p.hi; n++) inner.push(n);
    inner.sort(function (a, b) {
      return (S.om[a] - S.om[b]) || (S.f[b] - S.f[a]) || (hsh(S.seed, a, 13) - hsh(S.seed, b, 13));
    });
    return inner;
  }
  function mSpanInfo(S, p) {
    return '目标跨度 ' + p.target + '（近30期均值 ' + S.avgSpan.toFixed(1) + '）· 实际 ' + (p.hi - p.lo) +
      '：最小 ' + pad(p.lo) + ' / 最大 ' + pad(p.hi) + ' · 中间 ' + Math.max(0, S.M.pick - 2) + ' 个取最近出过的号';
  }

  /* ================= ⑨ 多源共振法：前 8 套加权投票（允许重合） ================= */
  function mResonance(S, finals) {
    var W = { '余数算法': 0.9, '分区法': 1.0, '冷热号': 1.1, '遗漏值算法': 1.0, '奇偶': 0.9, '质合': 0.9, '和值': 1.2, '跨度': 1.1 };
    var vote = {}, i, m, n;
    for (i = 0; i < ORDER8.length; i++) {
      m = ORDER8[i];
      var arr = finals[m] || [];
      for (n = 0; n < arr.length; n++) vote[arr[n]] = (vote[arr[n]] || 0) + W[m];
    }
    var rank = allNums(S.M).sort(function (a, b) {
      return ((vote[b] || 0) - (vote[a] || 0)) || (S.f[b] - S.f[a]) || (hsh(S.seed, a, 14) - hsh(S.seed, b, 14));
    });
    return {
      red: rank.slice(0, S.M.pick),
      info: '前 8 套加权投票（和值 1.2 / 冷热 1.1 / 跨度 1.1 / 分区 1.0 / 遗漏 1.0 / 余数 0.9 / 奇偶 0.9 / 质合 0.9）→ 得票最高的 ' + S.M.pick + ' 个，允许和其他方法重合',
      rows: [
        ['共振号（票数）', rank.slice(0, 4).map(function (x) { return pad(x) + '(' + (vote[x] || 0).toFixed(1) + '票)'; }).join(' ')],
        ['参与投票', '8 套（①~⑧）']
      ]
    };
  }

  /* ---------------- 蓝球 / 后区：每个方法一套口径（也是同一期固定） ---------------- */
  function blueRank(S, m, seen) {
    var M = S.M, n, list = [], i, seed = S.seed;
    for (n = 1; n <= M.blueMax; n++) list.push(n);
    var om = S.bom, f = S.bf;
    if (m === '余数算法') {
      var size = [0, 0, 0], hit = [0, 0, 0];
      for (n = 1; n <= M.blueMax; n++) { size[n % 3]++; hit[n % 3] += f[n]; }
      var rt = 0;
      for (i = 1; i < 3; i++) if (hit[i] / size[i] < hit[rt] / size[rt]) rt = i;
      list.sort(function (a, b) {
        var pa = (a % 3) === rt ? 0 : 1, pb = (b % 3) === rt ? 0 : 1;
        return (pa - pb) || (om[b] - om[a]) || (hsh(seed, a, 31) - hsh(seed, b, 31));
      });
    } else if (m === '分区法') {
      var half = Math.ceil(M.blueMax / 2), cnt = [0, 0];
      for (n = 1; n <= M.blueMax; n++) cnt[n <= half ? 0 : 1] += f[n];
      var cold = cnt[0] <= cnt[1] ? 0 : 1;
      list.sort(function (a, b) {
        var pa = (a <= half ? 0 : 1) === cold ? 0 : 1, pb = (b <= half ? 0 : 1) === cold ? 0 : 1;
        return (pa - pb) || (om[b] - om[a]) || (hsh(seed, a, 32) - hsh(seed, b, 32));
      });
    } else if (m === '冷热号') {
      list.sort(function (a, b) { return (f[b] - f[a]) || (hsh(seed, a, 33) - hsh(seed, b, 33)); });
    } else if (m === '遗漏值算法') {
      list.sort(function (a, b) { return (om[b] - om[a]) || (hsh(seed, a, 34) - hsh(seed, b, 34)); });
    } else if (m === '奇偶') {
      var oc = [0, 0];
      for (n = 1; n <= M.blueMax; n++) oc[n % 2] += f[n];
      var want = oc[1] >= oc[0] ? 1 : 0;
      list.sort(function (a, b) {
        var pa = (a % 2) === want ? 0 : 1, pb = (b % 2) === want ? 0 : 1;
        return (pa - pb) || (om[b] - om[a]) || (hsh(seed, a, 35) - hsh(seed, b, 35));
      });
    } else if (m === '质合') {
      list.sort(function (a, b) {
        var pa = isPrime(a) ? 0 : 1, pb = isPrime(b) ? 0 : 1;
        return (pa - pb) ||
          (isPrime(a) ? (om[b] - om[a]) : (f[b] - f[a])) ||
          (hsh(seed, a, 36) - hsh(seed, b, 36));
      });
    } else if (m === '和值') {
      var av = 0, tot = 0;
      for (n = 1; n <= M.blueMax; n++) { av += n * f[n]; tot += f[n]; }
      av = tot ? av / tot : M.blueMax / 2;
      list.sort(function (a, b) {
        return (Math.abs(a - av) - Math.abs(b - av)) || (om[b] - om[a]) || (hsh(seed, a, 37) - hsh(seed, b, 37));
      });
    } else if (m === '跨度') {
      var lastBlue = (S.blue[0] && S.blue[0][0]) || 1;
      list.sort(function (a, b) {
        return (Math.abs(b - lastBlue) - Math.abs(a - lastBlue)) || (om[b] - om[a]) || (hsh(seed, a, 38) - hsh(seed, b, 38));
      });
    } else {
      list.sort(function (a, b) {
        return (((seen && seen[b]) || 0) - ((seen && seen[a]) || 0)) || (f[b] - f[a]) || (hsh(seed, a, 39) - hsh(seed, b, 39));
      });
    }
    return list;
  }
  function pickBlue(S, m, seen) {
    return blueRank(S, m, seen).slice(0, S.M.bluePick).sort(function (a, b) { return a - b; });
  }

  /* ---------------- 槽位取号：每槽按本方法自己的候选顺序，跳过会超上限的号 ---------------- */
  function takeSlots(slots, earlier, M, cap) {
    var chosen = [], s, i, q, z, n, ok, got;
    for (s = 0; s < slots.length && chosen.length < M.pick; s++) {
      got = -1;
      for (i = 0; i < slots[s].length; i++) {
        n = slots[s][i];
        if (chosen.indexOf(n) >= 0) continue;
        ok = true;
        for (q = 0; q < earlier.length; q++) {
          var c = 0;
          for (z = 0; z < chosen.length; z++) if (earlier[q].indexOf(chosen[z]) >= 0) c++;
          if (c + (earlier[q].indexOf(n) >= 0 ? 1 : 0) > cap) { ok = false; break; }
        }
        if (ok) { got = n; break; }
      }
      if (got < 0) {
        for (i = 1; i <= M.max; i++) if (chosen.indexOf(i) < 0) { got = i; break; }
      }
      chosen.push(got);
    }
    return chosen;
  }
  function fits(red, earlier, cap) {
    for (var q = 0; q < earlier.length; q++) if (overlapOf(red, earlier[q]) > cap) return false;
    return true;
  }

  /* ---------------- 总装 ---------------- */
  function compute(g) {
    var S = build(g), M = S.M, i, m;
    var raw = {
      '余数算法': mRoad(S), '分区法': mZone(S), '冷热号': mHotCold(S), '遗漏值算法': mOmit(S),
      '奇偶': mParity(S), '质合': mPrime(S)
    };
    var firstPicks = {}, finals = {}, order = [];
    function settle(name, slots, red0) {
      var chosen = takeSlots(slots, order.map(function (k) { return finals[k]; }), M, CAP).sort(function (a, b) { return a - b; });
      finals[name] = chosen;
      order.push(name);
      firstPicks[name] = red0;
    }
    /* ①~⑥：槽位取号 */
    ['余数算法', '分区法', '冷热号', '遗漏值算法', '奇偶', '质合'].forEach(function (name) {
      var r = raw[name];
      settle(name, r.slots, r.slots.map(function (lst) { return lst[0]; }));
    });
    /* ⑦ 和值：DP 组合；碰上限只禁掉「多出来的那几个」（按权重从低到高），再重搜 */
    var sums = sumCombo(S, {});
    var ban = {}, tries, q, z;
    for (tries = 0; tries < 10; tries++) {
      var violated = false;
      for (q = 0; q < order.length; q++) {
        var prev = finals[order[q]], ov = [];
        for (z = 0; z < sums.red.length; z++) if (prev.indexOf(sums.red[z]) >= 0) ov.push(sums.red[z]);
        if (ov.length > CAP) {
          violated = true;
          ov.sort(function (a, b) { return (sums.w0[a] - sums.w0[b]) || (a - b); });
          for (z = 0; z < ov.length - CAP; z++) ban[ov[z]] = 1;
        }
      }
      if (!violated) break;
      sums = sumCombo(S, ban);
    }
    var sum0 = sumCombo(S, {}).red;
    finals['和值'] = sums.red.slice().sort(function (a, b) { return a - b; });
    order.push('和值');
    firstPicks['和值'] = sum0.slice().sort(function (a, b) { return a - b; });

    /* ⑧ 跨度：按分数顺序试 (最小,最大) 对，中段槽位取号，选第一个不超上限的 */
    var pairs = spanPairs(S), picked = null, fallback = null, pi, midPick = Math.max(0, M.pick - 2);
    for (pi = 0; pi < pairs.length; pi++) {
      var P = pairs[pi], mid = spanMid(S, P), slots = [[P.lo], [P.hi]];
      for (var mi = 0; mi < midPick; mi++) slots.push(mid);
      var cand = takeSlots(slots, order.map(function (k) { return finals[k]; }), M, CAP)
        .sort(function (a, b) { return a - b; });
      var mid0 = [P.lo].concat(mid.slice(0, midPick), [P.hi]).sort(function (a, b) { return a - b; });
      if (!fallback) fallback = { p: P, red: cand, red0: mid0 };
      if (fits(cand, order.map(function (k) { return finals[k]; }), CAP)) { picked = { p: P, red: cand, red0: mid0 }; break; }
    }
    if (!picked) picked = fallback;
    finals['跨度'] = picked.red;
    order.push('跨度');
    firstPicks['跨度'] = picked.red0;

    var list = [];
    ['余数算法', '分区法', '冷热号', '遗漏值算法', '奇偶', '质合'].forEach(function (name) {
      var r = raw[name];
      list.push({
        m: name, red: finals[name], blue: pickBlue(S, name),
        info: r.describe(finals[name]),
        rows: r.rowsOf ? r.rowsOf(finals[name]) : r.rows,
        swapped: diffCount(firstPicks[name], finals[name])
      });
    });
    list.push({
      m: '和值', red: finals['和值'], blue: pickBlue(S, '和值'), info: mSumInfo(S, sums),
      rows: [
        ['近30期和值', '均值 ' + S.avgSum.toFixed(1) + ' · 最大 ' + Math.max.apply(null, S.sums) + ' · 最小 ' + Math.min.apply(null, S.sums)],
        ['本轮和值', sums.sum + '（目标 ' + sums.target + '，偏差 ' + (sums.sum - sums.target) + '）']
      ],
      swapped: diffCount(firstPicks['和值'], finals['和值'])
    });
    list.push({
      m: '跨度', red: finals['跨度'], blue: pickBlue(S, '跨度'), info: mSpanInfo(S, picked.p),
      rows: [
        ['近30期跨度', '均值 ' + S.avgSpan.toFixed(1) + ' · 最大 ' + Math.max.apply(null, S.spans) + ' · 最小 ' + Math.min.apply(null, S.spans)],
        ['本轮跨度', pad(picked.p.lo) + '-' + pad(picked.p.hi) + '（' + (picked.p.hi - picked.p.lo) + '）']
      ],
      swapped: diffCount(firstPicks['跨度'], finals['跨度'])
    });
    var res = mResonance(S, finals);
    var bv = {};
    list.forEach(function (it) { it.blue.forEach(function (n) { bv[n] = (bv[n] || 0) + 1; }); });
    list.push({
      m: '多源共振法', red: res.red.slice().sort(function (a, b) { return a - b; }), blue: pickBlue(S, '多源共振法', bv),
      info: res.info, rows: res.rows, swapped: 0
    });
    return { game: g, name: M.name, issue: S.issue, next: S.next, seed: S.seed, n: S.main.length, list: list };
  }

  /* 【推荐图 9 套算法 · 每期换号】—— 本次没有改，原因见 _rr_px9.mjs 的实测：
     这 9 套的排序都是 (次数/遗漏差) || (次数差) || (期号种子抖动) 这种「或」链，
     种子只在前面的整数项【完全相等】时才起作用；而大乐透的 om/f 是严格有序的
     （om 22..28 = 26 30 29 23 26 17 17），所以「分区法 / 冷热号 / 遗漏值算法」
     换一期后红球一个都不改（实测 5/5 重合），加大盐也换不动（50 次都换不动）。
     要做到「每期至少改 2 个」必须把种子抖动并进【主排序键】里，
     而那会让 9 套方法的 describe()/rows() 全部要跟着重算 —— 属于算法级改动，
     且必须重建页面才能验证，本次不动，留作下一步。 */

  root.PX9_ENGINE = { methods: METHODS, cfg: CFG, compute: compute, seedOf: seedOf, nextIssue: nextIssue };
})(typeof window !== 'undefined' ? window : this);

/* ---------------- 渲染 ---------------- */
(function () {
  var ENG = (typeof window !== 'undefined' && window.PX9_ENGINE) || null;
  if (!ENG) return;
  var st = { game: 'ssq', method: ENG.methods[0] };
  var elM = document.getElementById('px9Methods');
  var elO = document.getElementById('px9Out');
  var elG = document.querySelectorAll('.px9-g');
  if (!elM || !elO) return;
  var cache = {};
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function data(g) { if (!cache[g]) cache[g] = ENG.compute(g); return cache[g]; }
  function ballsOf(red, blue) {
    var h = '<div class="px9-balls">';
    for (var i = 0; i < red.length; i++) h += '<span class="px9-b">' + pad(red[i]) + '</span>';
    h += '<span class="px9-bsep"></span>';
    for (var j = 0; j < blue.length; j++) h += '<span class="px9-b blue">' + pad(blue[j]) + '</span>';
    return h + '</div>';
  }
  function referenceMore(gid) {
    var cfg = gid === 'ssq' ? {main:'red',back:'blue',max:33,bmax:16,label:'红球',blabel:'蓝球'} : {main:'front',back:'back',max:35,bmax:12,label:'前区',blabel:'后区'};
    var hist = typeof DRAW_HISTORY !== 'undefined' && DRAW_HISTORY.games ? (DRAW_HISTORY.games[gid] || []).slice(0,30) : [];
    if (!hist.length) return '<div class="ref-more">暂无历史统计资料</div>';
    function counts(key,max) {return Array.from({length:max},function(_,i){var n=i+1,f=0,miss=hist.length;hist.forEach(function(d,k){if(((d.areas||{})[key]||[]).map(Number).indexOf(n)>=0){f++;if(miss===hist.length)miss=k;}});return {n:n,f:f,miss:miss};});}
    function number(n){return String(n).padStart(2,'0');}
    var front=counts(cfg.main,cfg.max),back=counts(cfg.back,cfg.bmax);
    function rank(a,key,desc){return a.slice().sort(function(x,y){return (desc?y[key]-x[key]:x[key]-y[key])||x.n-y.n;});}
    function list(a,key,count){return a.slice(0,count).map(function(x){return number(x.n)+'（'+x[key]+(key==='miss'?'期':'次')+'）';}).join('　');}
    function card(title,body){return '<section class="ref-more-card"><b>'+title+'</b><div>'+body+'</div></section>';}
    var all=hist.map(function(d){return ((d.areas||{})[cfg.main]||[]).map(Number);}).filter(function(a){return a.length;});
    var totals=[0,0,0],odd=0,even=0,small=0,big=0,sums=[],spans=[];
    all.forEach(function(a){var sum=0;a.forEach(function(n){totals[Math.min(2,Math.floor((n-1)/Math.ceil(cfg.max/3)))]++;if(n%2)odd++;else even++;if(n<=Math.floor(cfg.max/2))small++;else big++;sum+=n;});sums.push(sum);spans.push(Math.max.apply(null,a)-Math.min.apply(null,a));});
    function range(a){return a.length?Math.min.apply(null,a)+'～'+Math.max.apply(null,a):'暂无';}
    var styles='<style>.ref-more{margin-top:14px;font-size:12px;line-height:1.85;overflow-wrap:anywhere}.ref-more-card{padding:12px;margin:8px 0;background:#fff;border:1px solid #e7d5b5;border-radius:10px}.ref-more-card>b{color:#19895d}.ref-more-history{padding:7px 0;border-bottom:1px dashed #e7d5b5}</style>';
    return styles+'<div class="ref-more" data-ref-game="'+gid+'"><b>更多参考资料 · 近'+hist.length+'期</b><div>统计截至 '+String(hist[0].date||'')+' · 历史表现不代表下期结果</div>'+
      card(cfg.label+'近期热号',list(rank(front,'f',true),'f',8))+
      card(cfg.label+'近期冷号',list(rank(front,'f',false),'f',8))+
      card(cfg.label+'遗漏观察',list(rank(front,'miss',true),'miss',8)+'<div>达到统计窗口的遗漏值，表示至少未出现这么多期。</div>')+
      card(cfg.blabel+'近期动态','热号：'+list(rank(back,'f',true),'f',5)+'<br>冷号：'+list(rank(back,'f',false),'f',5)+'<br>遗漏：'+list(rank(back,'miss',true),'miss',5))+
      card('分区分布','一区 01～'+Math.ceil(cfg.max/3)+'：'+totals[0]+'次；二区 '+number(Math.ceil(cfg.max/3)+1)+'～'+Math.ceil(cfg.max/3)*2+'：'+totals[1]+'次；三区 '+number(Math.ceil(cfg.max/3)*2+1)+'～'+cfg.max+'：'+totals[2]+'次')+
      card('奇偶与大小','奇数 '+odd+'次 · 偶数 '+even+'次<br>小号 01～'+Math.floor(cfg.max/2)+'：'+small+'次 · 大号 '+number(Math.floor(cfg.max/2)+1)+'～'+cfg.max+'：'+big+'次')+
      card('和值与跨度','近'+all.length+'期和值范围 '+range(sums)+' · 跨度范围 '+range(spans))+
      card('近5期开奖对照',hist.slice(0,5).map(function(d){var ar=d.areas||{};return '<div class="ref-more-history">第'+String(d.issue)+'期 · '+String(d.date||'')+'<br>'+cfg.label+' '+(ar[cfg.main]||[]).map(number).join(' ')+'<br>'+cfg.blabel+' '+(ar[cfg.back]||[]).map(number).join(' ')+'</div>';}).join(''))+'</div>';
  }

  function render() {
    var d = data(st.game), M = ENG.cfg[st.game], item = null, i;
    elM.innerHTML = ENG.methods.map(function (m) {
      return '<div class="px9-m' + (m === st.method ? ' on' : '') + '" role="button" tabindex="0" data-px9-m="' + m + '">' + m + '</div>';
    }).join('');
    for (i = 0; i < d.list.length; i++) if (d.list[i].m === st.method) item = d.list[i];
    if (!item) return;
    var rows = '';
    for (i = 0; i < item.rows.length; i++) {
      rows += '<div class="px9-row"><span class="px9-k">' + item.rows[i][0] + '</span><span>' + item.rows[i][1] + '</span></div>';
    }
    elO.innerHTML = '<div class="px9-cur">' + d.name + ' · '+item.m+'参考号码</div>' + ballsOf(item.red, item.blue) + '<div class="px9-meta">第 ' + d.next + ' 期 · 仅供统计参考</div>' + referenceMore(st.game);
    var ms = elM.querySelectorAll('.px9-m');
    for (i = 0; i < ms.length; i++) {
      ms[i].onclick = (function (b) {
        return function () { st.method = b.getAttribute('data-px9-m'); render(); };
      })(ms[i]);
    }
  }
  for (var gi = 0; gi < elG.length; gi++) {
    elG[gi].onclick = (function (b) {
      return function () {
        st.game = b.getAttribute('data-px9-game');
        for (var k2 = 0; k2 < elG.length; k2++) elG[k2].className = 'px9-g' + (elG[k2] === b ? ' on' : '');
        render();
      };
    })(elG[gi]);
  }
  render();
})();
</script>


<script>
${fs.readFileSync(path.join(ROOT, 'monster-game.js'), 'utf8')}
${fs.readFileSync(path.join(ROOT, 'boarding-game.js'), 'utf8')}
</script>
<script>
/* __FROG_LAB_JS__ 青蛙家园功能中心：全部用页面已有 DRAW_HISTORY 现算，不联网不收费 */
function initFrogLab(outId, wrapId, gidId, monsterMode) {
  var out = document.getElementById(outId);
  var wrap = document.getElementById(wrapId);
  if (!out || !wrap) return;
  function hist(g) { try { return ((DRAW_HISTORY.games || {})[g] || []).slice(0, 100); } catch (e) { return []; } }
  function redsOf(d) { var a = (d && d.areas) || {}; return (a.red || a.front || a.main || []).map(Number); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function row(k, v) { return '<div class="frog-row"><span>' + k + '</span><span><b>' + v + '</b></span></div>'; }
  /* ============================================================
     __FROG_RES_BALL__ 结果区号码 = 【球】+ 【加粗】（用户 2026-10-20：
       「功能中心结果区里面 号码也要加球加粗」）
     ------------------------------------------------------------
     · 球【复用】页面现成的 .frog-b（红底白字）和 .frog-b.blue
       （#frogHome .frog-b.blue 已经是「深蓝渐变 + 白字 800」那套加强版）；
     · 不新写一套配色，只在 #frogOut 里把球收到 20px / 字号 11px（功能中心是半屏）；
     · 球排不下会自动折行（.frog-bq 是 flex-wrap）→ 375 / 320 都不溢出。
     ============================================================ */
  function ball(n, blue) {
    return '<span class="frog-b' + (blue ? ' blue' : '') + '">' + pad(Number(n)) + '</span>';
  }
  function bq(arr, sep, blue) {
    var s = '', i;
    for (i = 0; i < arr.length; i++) s += (i && sep ? '<i>' + sep + '</i>' : '') + ball(arr[i], blue);
    return '<span class="frog-bq">' + s + '</span>';
  }
  /* 左边放球、右边放「N 次 / N 期未出」这类文字 */
  function rowQ(arr, tail, sep, blue) {
    return '<div class="frog-row"><span>' + bq(arr, sep, blue) + '</span><span><b>' + (tail || '') + '</b></span></div>';
  }
  /* 左边放文字标签、右边放球（杀号 / 缩水 这种「标签 + 一串号」的行） */
  function rowL(k, arr, sep, blue) {
    return '<div class="frog-row"><span>' + k + '</span><span>' + (arr && arr.length ? bq(arr, sep, blue) : '') + '</span></div>';
  }
  /* __FROG_GID__ 当前彩种（用户 2026-10-20：功能中心要能分清大乐透 / 双色球）
     · 只有一个状态变量 gid，默认大乐透；
     · 9 个功能全部读它（原来写死 dlt）；
     · 结果区每一块标题都带彩种名，切了也知道现在算的是哪一个。 */
  var gid = 'dlt';
  var GID_NM = { dlt: '大乐透', ssq: '双色球', kl8: '快乐8' };
  var GID_CFG = {
    dlt: { nm: '大乐透', max: 35, aN: '前区', bN: '后区', aCnt: 5, bCnt: 2 },
    ssq: { nm: '双色球', max: 33, aN: '红球', bN: '蓝球', aCnt: 6, bCnt: 1 },
    kl8: { nm: '快乐8', max: 80, aN: '号码', bN: '', aCnt: 20, bCnt: 0 },
    fc3d: { nm:'福彩3D', min:0, max:9, digits:3, aCnt:3 },
    pl3: { nm:'排列三', min:0, max:9, digits:3, aCnt:3 },
    pl5: { nm:'排列五', min:0, max:9, digits:5, aCnt:5 },
    qlc: { nm:'七乐彩', min:1, max:30, aCnt:7 },
    qxc: { nm:'七星彩', min:0, max:9, digits:7, aCnt:6 }
  };
  function gname() { return (GID_CFG[gid] || GID_CFG.dlt).nm; }
  function gcfg() { return GID_CFG[gid] || GID_CFG.dlt; }
  function redMax() { return gcfg().max; }
  function aName() { return gcfg().aN; }
  function bName() { return gcfg().bN; }
  function co() {
    var ds = hist(gid), cnt = {}, i, j;
    ds.forEach(function (d) { var r = redsOf(d).slice().sort(function (a, b) { return a - b; });
      for (i = 0; i < r.length; i++) for (j = i + 1; j < r.length; j++) { var k = pad(r[i]) + '+' + pad(r[j]); cnt[k] = (cnt[k] || 0) + 1; } });
    var top = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 8);
    out.innerHTML = '<div style="font-weight:700;margin-bottom:4px">二码同出 · ' + gname() + ' · 近 ' + ds.length + ' 期</div>' + top.map(function (k) { return rowQ(String(k).split('+').map(Number), cnt[k] + ' 次', '+'); }).join('');
  }
  /* 【三码同出 / 四码同出 · 用户 2026-10-20】和二码同出同一套算法，
     只是把「每期取 2 个号做组合」扩成「取 k 个」：
       · 每期只在该期开出的号里做组合（不遍历全号池）→ 大乐透 5 个号：
         3 码 = 10 组/期、4 码 = 5 组/期（33/35 选 3、选 4 的全池遍历根本用不着）；
       · hist() 默认从【最新一期】往旧排，所以某个组合【第一次】被撞到的那期
         就是它的「最近一次」—— 只记一次，不额外排序。
     结果格式跟二码同出一致（组合 + 次数），再加「最近哪期」和免责一行。 */
  function combo(k, title) {
    var ds = hist(gid), cnt = {}, last = {};
    ds.forEach(function (d) {
      var r = redsOf(d).slice().sort(function (a, b) { return a - b; });
      if (r.length < k) return;
      var pick = [];
      (function walk(s) {
        if (pick.length === k) {
          var key = pick.map(pad).join('+');
          cnt[key] = (cnt[key] || 0) + 1;
          if (last[key] === undefined) last[key] = String(d.issue || '');
          return;
        }
        for (var t = s; t < r.length; t++) { pick.push(r[t]); walk(t + 1); pick.pop(); }
      })(0);
    });
    var top = Object.keys(cnt).sort(function (a, b) { return (cnt[b] - cnt[a]) || (a < b ? -1 : 1); }).slice(0, 10);
    out.innerHTML = '<div style="font-weight:700;margin-bottom:4px">' + title + ' · ' + gname() + ' · 近 ' + ds.length + ' 期</div>'
      + (top.length
        ? top.map(function (k2) {
          return '<div class="frog-co"><div class="frog-co-h"><span class="frog-co-k">' + bq(String(k2).split('+').map(Number), '+') + '</span>' +
            '<span class="frog-co-n">' + cnt[k2] + ' 次</span></div>' +
            '<div class="frog-co-t">最近 ' + (last[k2] || '—') + ' 期</div></div>';
        }).join('')
        : '<div class="frog-none">暂无数据</div>')
      + '<div class="frog-tip">仅供参考，历史频率不代表未来</div>';
  }
  function co3() { combo(3, '三码同出'); }
  function co4() { combo(4, '四码同出'); }
  /* 【杀号三版 · 用户 2026-10-19「杀号做两个版本可以选」+「在加一个ai杀号」→ 我自己定：
     A 现有（和值尾+1 / 最大-最小）
     B 对应号 + 和值杀路（民间算法）
     C 本地多因子（免费版"智能杀号"：遗漏 + 冷热 + 多公式加权打分）
     ⚠️ 这段在页面模板字符串里：不用反引号、不写美元花括号、不写反斜杠 */
  var killVer = 'A';
  function kill() {
    var d = hist(gid)[0]; if (!d) { out.innerHTML = '暂无数据'; return; }
    var ds = hist(gid) || [];
    var r = redsOf(d).slice().sort(function (a, b) { return a - b; });
    var sum = r.reduce(function (a, b) { return a + b; }, 0);
    var maxN = redMax();
    var tabs = '<div class="kg-versal">' +
      ['A', 'B', 'C'].map(function (v) {
        var nm = v === 'A' ? 'A 经典' : (v === 'B' ? 'B 民间' : 'C 智能');
        return '<span class="kg-v' + (killVer === v ? ' on' : '') + '" data-kv="' + v + '">' + nm + '</span>';
      }).join('') + '</div>';

    var body = '';
    if (killVer === 'A') {
      var k1 = (sum % 10) + 1, k2 = r[r.length - 1] - r[0];
      var kills = [k1, k2].filter(function (n) { return n >= 1 && n <= maxN; });
      body = rowL('上期号码', r) + rowL('和值尾+1', [k1]) +
        rowL('最大-最小', [k2]) + (kills.length ? rowL('建议杀号', kills) : row('建议杀号', '无')) +
        '<div class="frog-tip">规则：和值尾+1 与 跨度 各杀 1 个</div>';
    } else if (killVer === 'B') {
      /* 对应号：0→8 1→5 2→2 3→7 4→4 5→1 6→9 7→6 8→3 9→0 */
      var MAP = { 0: 8, 1: 5, 2: 2, 3: 7, 4: 4, 5: 1, 6: 9, 7: 6, 8: 3, 9: 0 };
      var dy = [];
      r.forEach(function (n) { var m2 = MAP[n % 10]; if (dy.indexOf(m2) < 0) dy.push(m2); });
      /* 和值杀路：和值×首位+1 除 3 余数 → 杀该余数路 */
      var bai = r[0];
      var road = (sum * bai + 1) % 3;
      var roadKill = [];
      for (var q = 1; q <= maxN; q++) if (q % 3 === road) roadKill.push(q);
      body = rowL('上期号码', r) +
        rowL('对应号杀码', dy) +
        row('和值×首位+1 除3 余', road + ' 路（杀 ' + roadKill.length + ' 个）') +
        rowL('该路号码', roadKill.slice(0, 12), '', false) +
        '<div class="frog-tip">规则：对应号 + 整路杀（民间 3D 算法移植）' + (roadKill.length > 12 ? ' · 只列前 12 个' : '') + '</div>';
    } else {
      /* C 本地多因子：每个号算「该杀分」，分数最高的 4 个 */
      var freq = {}, lastSeen = {};
      ds.slice(0, 30).forEach(function (dd, i) {
        redsOf(dd).forEach(function (n) { freq[n] = (freq[n] || 0) + 1; if (lastSeen[n] === undefined) lastSeen[n] = i; });
      });
      var score = {}, why = {};
      for (var n2 = 1; n2 <= maxN; n2++) {
        var sc = 0, rs2 = [];
        var gap = lastSeen[n2] === undefined ? 30 : lastSeen[n2];
        /* ① 遗漏长 → 少杀（保号） */
        if (gap >= 10) { sc -= 2; rs2.push('遗漏' + gap + '期'); } else if (gap <= 2) { sc += 2; rs2.push('刚出' + gap + '期'); }
        /* ② 热号 → 少杀；冷号 → 多杀? 反着来：热号少杀 */
        var f = freq[n2] || 0;
        if (f >= 8) { sc -= 1; rs2.push('30期出' + f + '次'); } else if (f <= 1) { sc += 1; rs2.push('30期仅' + f + '次'); }
        /* ③ 和值尾+1 命中：如果这个号等于 (sum%10)+1 → 加分 */
        if (n2 === (sum % 10) + 1) { sc += 3; rs2.push('和值尾+1'); }
        /* ④ 上期同号 → 加分（重号少） */
        if (r.indexOf(n2) >= 0) { sc += 1; rs2.push('上期重号'); }
        /* ⑤ 邻号（上期±1）→ 加分 */
        var isNb = r.some(function (x) { return Math.abs(x - n2) === 1; });
        if (isNb) { sc += 1; rs2.push('上期邻号'); }
        score[n2] = sc; why[n2] = rs2;
      }
      var ranked = Object.keys(score).map(Number).sort(function (a, b) { return (score[b] - score[a]) || (a - b); }).slice(0, 4);
      body = rowL('上期号码', r) + row('和值 / 首号', sum + ' / ' + r[0]) +
        ranked.map(function (n3) {
          return rowQ([n3], String(score[n3]) + '（' + (why[n3].join(' · ') || '无加成') + '）');
        }).join('') +
        rowL('建议杀号', ranked) +
        '<div class="frog-tip">规则：6 个因子加权打分（遗漏/冷热/和值尾/重号/邻号）· 全本地计算，免费</div>';
    }
    out.innerHTML = '<div style="font-weight:700;margin-bottom:4px">杀号 · ' + gname() + ' · 基于最新一期 ' + (d.issue || '') + '</div>' + tabs + body;
    [].slice.call(out.querySelectorAll('.kg-v')).forEach(function (b) {
      b.onclick = function () { killVer = b.getAttribute('data-kv'); kill(); };
    });
  }
  function shrink() {
    var ds = hist(gid).slice(0,30), freq = {}, bf = {};
    ds.forEach(function(d){ redsOf(d).forEach(function(n){freq[n]=(freq[n]||0)+1;}); var area=d.areas||{}; (area.blue||area.back||[]).forEach(function(n){bf[n]=(bf[n]||0)+1;}); });
    var hot=Object.keys(freq).map(Number).sort(function(a,b){return freq[b]-freq[a]||a-b;}).slice(0,10);
    var blue=Object.keys(bf).map(Number).sort(function(a,b){return bf[b]-bf[a]||a-b;});
    if(gid==='kl8'){out.innerHTML='<div style="font-weight:700;margin-bottom:4px">缩水套餐 · 快乐8 · 近30期热号参考</div>'+[6,8,10].map(function(n){return rowL('选'+n+'参考',hot.slice(0,n).sort(function(a,b){return a-b;}));}).join('')+'<div class="frog-tip">仅展示热号组合，不代表缩水保奖。</div>';return;}
    var B=bName();
    function pack(label,n,m){return '<div class="frog-row"><span>'+label+'</span><span>'+bq(hot.slice(0,n).sort(function(a,b){return a-b;}))+' <i>+</i> '+bq(blue.slice(0,m).sort(function(a,b){return a-b;}),'',true)+'</span></div>';}
    out.innerHTML='<div style="font-weight:700;margin-bottom:4px">缩水套餐 · '+gname()+' · 近30期热号</div>'+pack('18元 6+4（'+B+' 4 码）',6,4)+pack('28元 7+1（'+B+' 1 码）',7,1)+pack('38元 7+2（'+B+' 2 码）',7,2);
  }

  /* 【摇号机 · 可选号码数量 · 用户 2026-10-20】
     · 大乐透：前区 5~10 个 / 后区 2~6 个（默认 5+2）
     · 双色球：红球 6~10 个 / 蓝球 1~4 个（默认 6+1）
     · 点个数 → 立刻按新个数重摇（个数变了，出的号个数就跟着变）；「摇一次」只重摇不改个数
     · 仍然随机（Math.random），号池里抽过就删掉 → 同一注里绝不重复
     ⚠️ 2026-10-20：摇号机原来自己带一排「大乐透 / 双色球」药丸 →
        已合并到功能中心顶部那一排（__FROG_GID__），这里只读 gid，不再出第二套。
        个数上下限直接取 GID_CFG，不再另存一份配置。 */
  var RQ = { a: 5, b: 2 };
  var RCFG = {
    dlt: { nm: '大乐透', aMax: 35, aMin: 5, aTop: 10, bMax: 12, bMin: 2, bTop: 6, aN: '前区', bN: '后区' },
    ssq: { nm: '双色球', aMax: 33, aMin: 6, aTop: 10, bMax: 16, bMin: 1, bTop: 4, aN: '红球', bN: '蓝球' },
    kl8: { nm: '快乐8', aMax: 80, aMin: 1, aTop: 10, bMax: 0, bMin: 0, bTop: 0, aN: '号码', bN: '' }
  };
  function pickN(max, n) {
    var pool = [], res = [], i, t;
    for (i = 1; i <= max; i++) pool.push(i);
    for (i = 0; i < n && pool.length; i++) { t = Math.floor(Math.random() * pool.length); res.push(pool.splice(t, 1)[0]); }
    return res.sort(function (a, b) { return a - b; });
  }
  function numChips(min, max, cur, key) {
    var s = '', n;
    for (n = min; n <= max; n++) s += '<div class="frog-chip' + (n === cur ? ' on' : '') + '" role="button" tabindex="0" data-rq-' + key + '="' + n + '">' + n + '</div>';
    return s;
  }
  function rand() {
    var c = RCFG[gid] || RCFG.dlt, a, b, i;
    RQ.a = RQ.a || c.aMin; RQ.b = RQ.b || c.bMin;
    if (RQ.a < c.aMin) RQ.a = c.aMin; if (RQ.a > c.aTop) RQ.a = c.aTop;
    if (RQ.b < c.bMin) RQ.b = c.bMin; if (RQ.b > c.bTop) RQ.b = c.bTop;
    a = pickN(c.aMax, RQ.a); b = pickN(c.bMax, RQ.b);
    out.innerHTML =
      '<div style="font-weight:700;margin-bottom:4px">摇号机 · ' + gname() + '（随机 · 仅娱乐）</div>' +
      '<div class="frog-ql">' + c.aN + '个数</div><div class="frog-chips">' + numChips(c.aMin, c.aTop, RQ.a, 'a') + '</div>' +
      (c.bMax ? '<div class="frog-ql">' + c.bN + '个数</div><div class="frog-chips">' + numChips(c.bMin, c.bTop, RQ.b, 'b') + '</div>' : '') +
      '<div class="frog-qv"><i>' + c.aN + '（' + RQ.a + ' 个）</i><br>' + bq(a) + '</div>' +
      (c.bMax ? '<div class="frog-qv"><i>' + c.bN + '（' + RQ.b + ' 个）</i><br>' + bq(b, '', true) + '</div>' : '') +
      '<div class="frog-chips"><div class="frog-chip on" role="button" tabindex="0" data-rq-roll="1">摇一次</div></div>';
    var as = out.querySelectorAll('[data-rq-a]');
    for (i = 0; i < as.length; i++) as[i].onclick = (function (el) {
      return function () { RQ.a = parseInt(el.getAttribute('data-rq-a'), 10); rand(); };
    })(as[i]);
    var bs = out.querySelectorAll('[data-rq-b]');
    for (i = 0; i < bs.length; i++) bs[i].onclick = (function (el) {
      return function () { RQ.b = parseInt(el.getAttribute('data-rq-b'), 10); rand(); };
    })(bs[i]);
    var rl = out.querySelector('[data-rq-roll]');
    if (rl) rl.onclick = function () { rand(); };
  }
  function dan() {
    var ds = hist(gid), freq = {};
    ds.slice(0, 30).forEach(function (d) { redsOf(d).forEach(function (n) { freq[n] = (freq[n] || 0) + 1; }); });
    var top = Object.keys(freq).map(Number).sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, 3);
    out.innerHTML = '<div style="font-weight:700;margin-bottom:4px">胆码中心 · ' + gname() + ' · 近30期高频</div>' + rowL('推荐胆码', top);
  }
  function omit() {
    var ds = hist(gid), arr = [], n, i, top = redMax();
    for (n = 1; n <= top; n++) { var gap = 0; for (i = 0; i < ds.length; i++) { if (redsOf(ds[i]).indexOf(n) >= 0) break; gap++; } arr.push({ n: n, gap: gap }); }
    arr.sort(function (a, b) { return b.gap - a.gap; });
    out.innerHTML = '<div style="font-weight:700;margin-bottom:4px">遗漏走势 · ' + gname() + ' · 最久未出</div>' + arr.slice(0, 8).map(function (o) { return rowQ([o.n], o.gap + ' 期未出'); }).join('');
  }
  function lab() {
    var ds = hist(gid), hit = 0, n = Math.min(20, Math.max(0, ds.length - 1)), i;
    var cnt = gcfg().aCnt;
    for (i = 0; i < n; i++) { var prev = redsOf(ds[i + 1]).slice(0, cnt), cur = redsOf(ds[i]); if (prev.some(function (x) { return cur.indexOf(x) >= 0; })) hit++; }
    out.innerHTML = '<div style="font-weight:700;margin-bottom:4px">实验室 · ' + gname() + ' · 简单回测</div>' + row('测试期数', n) + row('延续命中', hit + ' 期') + row('比例', n ? Math.round(hit / n * 100) + '%' : '—');
  }

  /* Local entertainment mode: site algorithm, no external AI or account. */
  var monsterCount=5,monsterPosition=0;
  function monster() {
    var key='chunfeng-monster-v1', records=[];
    var visitorSeed='';
    try{visitorSeed=localStorage.getItem('chunfeng-monster-visitor')||'';}catch(e){}
    if(!visitorSeed){var entropy=new Uint32Array(4);crypto.getRandomValues(entropy);visitorSeed=[].slice.call(entropy).map(function(n){return n.toString(16);}).join('-');try{localStorage.setItem('chunfeng-monster-visitor',visitorSeed);}catch(e){}}
    function visitorScore(number){var hash=2166136261,str=visitorSeed+'|'+gid+'|'+String(latest.issue)+'|'+monsterPosition+'|'+number;for(var k=0;k<str.length;k++){hash^=str.charCodeAt(k);hash=Math.imul(hash,16777619);}hash^=hash>>>16;hash=Math.imul(hash,2246822507);hash^=hash>>>13;hash=Math.imul(hash,3266489909);hash^=hash>>>16;return (hash>>>0)/4294967296;}

    var digital=!!gcfg().digits;
    var positionNames=gcfg().digits===3?['百位','十位','个位']:gcfg().digits===5?['万位','千位','百位','十位','个位']:['第1位','第2位','第3位','第4位','第5位','第6位','末位'];
    function numbersAt(d,pos){var area=d.areas||{};if(!digital)return redsOf(d);return gid==='qxc'?(pos===6?(area.back||[]).map(Number):[(area.front||[])[pos]].filter(function(n){return n!==undefined;}).map(Number)):[(area.main||[])[pos]].filter(function(n){return n!==undefined;}).map(Number);}
    function positionMax(){return gid==='qxc'&&monsterPosition===6?14:redMax();}
    function monsterRow(label,nums){if(!digital)return rowL(label,nums);return '<div class="frog-row"><span>'+label+'</span><span class="frog-bq">'+nums.map(function(n){return '<span class="frog-b">'+Number(n)+'</span>';}).join('')+'</span></div>';}
    try { records=JSON.parse(localStorage.getItem(key)||'[]'); if(!Array.isArray(records))records=[]; }catch(e){}
    var ds=hist(gid),latest=ds[0];
    if(!latest){out.innerHTML='奥特曼杀号（小怪兽严父） · '+gname()+'：暂无真实开奖数据';return;}
    var writable=true;
    records.forEach(function(rec){
      if(rec.gid!==gid||rec.settled||!Array.isArray(rec.kills))return;
      var later=ds.filter(function(d){return Number(d.issue)>Number(rec.baseIssue);}).sort(function(a,b){return Number(a.issue)-Number(b.issue);});
      if(!later.length)return;
      rec.drawIssue=String(later[0].issue);rec.drawn=numbersAt(later[0],Number(rec.position)||0);
      rec.correct=rec.kills.filter(function(n){return rec.drawn.indexOf(n)<0;});rec.settled=true;
    });
    function save(){try{localStorage.setItem(key,JSON.stringify(records.slice(-300)));}catch(e){writable=false;}}
    save();
    var current=records.find(function(r){return r.gid===gid&&String(r.baseIssue)===String(latest.issue)&&(!digital||(Number(r.position)||0)===monsterPosition);});
    var settled=records.filter(function(r){return r.gid===gid&&r.settled;}),total=0,correct=0;
    settled.forEach(function(r){total+=r.kills.length;correct+=(r.correct||[]).length;});
    var exp=correct*10;
    out.innerHTML='<div style="font-weight:700">奥特曼杀号（小怪兽严父） · '+gname()+'</div>'+
      (digital?'<label>杀号位置 <select id="monsterPosition">'+positionNames.map(function(n,i){return '<option value="'+i+'"'+(i===monsterPosition?' selected':'')+'>'+n+'</option>';}).join('')+'</select></label>':'')+
      '<div class="monster-arena"></div>'+
      row('复盘等级 / 经验','Lv.'+(1+Math.floor(exp/80))+' / '+exp)+
      row('已复盘 / 杀对率',settled.length+' 条 / '+(total?Math.round(correct/total*100)+'%':'暂无'))+
      '<div class="frog-tip">最新开奖第 '+String(latest.issue)+' 期；选择它之后下一期的杀号。同一期只生成一次。</div>'+
      (current?monsterRow('本期已留档'+(digital?' · '+positionNames[monsterPosition]:''),current.kills)+'<div class="frog-tip">等待下一期开奖后核对</div><div class="frog-chip" role="button" aria-disabled="true">本期已生成 · 下期开奖后可再生成</div>':'<div class="frog-chip" role="button" tabindex="0" id="frogMonsterFire">发射光线 · 生成本期杀号</div>')+
      (writable?'':'<div class="frog-tip">浏览器禁止保存，暂不能留档，请勿重复操作。</div>')+
      settled.slice(-8).reverse().map(function(r){return '<details><summary>第 '+r.drawIssue+' 期'+(digital?' · '+positionNames[Number(r.position)||0]:'')+' · 杀对 '+r.correct.length+'/'+r.kills.length+'</summary>'+monsterRow('留档杀号',r.kills)+monsterRow('杀对（未开出）',r.correct)+monsterRow('杀错（已开出）',r.kills.filter(function(n){return r.drawn.indexOf(n)>=0;}))+'</details>';}).join('')+
      '<div class="frog-tip">按访客独立生成的娱乐杀号；仅保存在此浏览器，清理缓存会丢失。重新打开后依据已有开奖数据复盘。娱乐参考，不保证准确。</div>';
    var arenaHost=out.querySelector('.monster-arena');
    if(arenaHost&&window.MonsterArena){arenaHost.arenaState=window.MonsterArena.mount(arenaHost);}
    var maxPick=function(){return Math.min(digital?positionMax()-1:16,[5,8,10,12,16][Math.min(4,(window.MonsterArena?window.MonsterArena.level():1)-1)]);};
    var positionSelect=out.querySelector('#monsterPosition');if(positionSelect)positionSelect.onchange=function(){monsterPosition=Number(positionSelect.value);monster();};
    var fireBox=out.querySelector('#frogMonsterFire');
    if(fireBox){
      var select=document.createElement('select');select.id='monsterPickCount';select.setAttribute('aria-label','本期杀号数量');
      [5,8,10,12,16].forEach(function(n){var opt=document.createElement('option');opt.value=n;opt.textContent=n+' 个杀号';opt.disabled=n>maxPick();select.appendChild(opt);});
      monsterCount=Math.min(monsterCount,maxPick());select.value=monsterCount;select.onchange=function(){monsterCount=Number(select.value);updatePrice();};fireBox.parentNode.insertBefore(select,fireBox);
      var walletNote=document.createElement('div');walletNote.className='frog-tip';fireBox.parentNode.insertBefore(walletNote,fireBox);
      function updatePrice(){var coins=window.MonsterArena.progress().coins,cost=monsterCount*10;fireBox.textContent='生成杀号 · '+monsterCount+'个 / '+cost+'游戏金币';walletNote.textContent='Lv.'+window.MonsterArena.level()+' · 当前 '+coins+' 金币；打怪或做生意获取，不充值、不兑换现金。同一期每个位置仅兑换一次。'+(digital?'本位置可选数量受号码范围限制。':'');fireBox.setAttribute('aria-disabled',coins<cost?'true':'false');}
      updatePrice();if(arenaHost)arenaHost.addEventListener('arena-wallet',updatePrice);
      if(arenaHost)arenaHost.addEventListener('arena-level',function(){[].slice.call(select.options).forEach(function(o){o.disabled=Number(o.value)>maxPick();});});
    }
    var attack=out.querySelector('#frogMonsterAttack'),hp=3,busy=false;
    if(attack){
      attack.onclick=function(){
        if(busy)return;
        var stage=out.querySelector('.frog-monster-stage'),label=out.querySelector('.frog-monster-hp');
        if(hp===0){hp=3;stage.classList.remove('defeated');label.textContent='怪兽血量：3 / 3';attack.textContent='发射光线 · 攻击怪兽';return;}
        busy=true;stage.classList.remove('fired');void stage.offsetWidth;stage.classList.add('fired');hp--;
        label.textContent=hp?'击中！怪兽血量：'+hp+' / 3':'怪兽已击败！可以再玩一次';
        if(!hp){stage.classList.add('defeated');attack.textContent='再玩一次';}
        setTimeout(function(){busy=false;},450);
      };
      attack.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();attack.click();}};
    }
    var fire=out.querySelector('#frogMonsterFire');
    if(fire)fire.onclick=function(){
      if(!writable)return;
      if(String((hist(gid)[0]||{}).issue)!==String(latest.issue)){monster();return;}
      var nums=[];
      var frequency={};ds.slice(0,30).forEach(function(d){numbersAt(d,monsterPosition).forEach(function(n){frequency[n]=(frequency[n]||0)+1;});});
      var rest=[];for(var v=digital?0:1;v<=(digital?positionMax():redMax());v++)if(nums.indexOf(v)<0)rest.push(v);
      rest.sort(function(a,b){return ((frequency[a]||0)*.15+visitorScore(a)*10)-((frequency[b]||0)*.15+visitorScore(b)*10)||a-b;});
      nums=nums.concat(rest).slice(0,Math.min(monsterCount,maxPick()));
      if(!nums.length){monster();return;}
      if(!window.MonsterArena||window.MonsterArena.progress().coins<nums.length*10){if(walletNote)walletNote.textContent='金币不足，请先打怪或做生意。';return;}
      records.push({gid:gid,baseIssue:String(latest.issue),createdAt:new Date().toISOString(),kills:nums,position:digital?monsterPosition:null,settled:false});save();
      if(!writable||!window.MonsterArena.spendCoins(nums.length*10)){records.pop();save();if(walletNote)walletNote.textContent='兑换未完成，未生成留档。';return;}monster();
      var stage=out.querySelector('.frog-monster-stage');if(stage)stage.classList.add('fired');
    };
  }

  var FNS = { co: co, co3: co3, co4: co4, kill: kill, shrink: shrink, rand: rand, dan: dan, omit: omit, lab: lab, monster: monster };
  var lastFn = '';
  /* __FROG_GID__ 彩种药丸（功能中心顶部，只这一套）：
     切换后 → 记忆里上一次点的功能【按新彩种重算】；还没点过功能 → 结果区清空并写上当前彩种。 */
  var gidWrap = document.getElementById(gidId);
  function markGid() {
    if (!gidWrap) return;
    [].slice.call(gidWrap.querySelectorAll('[data-gid]')).forEach(function (b) {
      b.className = 'frog-chip' + (b.getAttribute('data-gid') === gid ? ' on' : '');
    });
  }
  function setGid(g) {
    if (!GID_CFG[g]) return;
    gid = g;
    if(RCFG[g]){RQ.a = RCFG[g].aMin; RQ.b = RCFG[g].bMin;} monsterPosition=0;
    markGid();
    if (lastFn && FNS[lastFn]) FNS[lastFn]();
    else out.innerHTML = '点上面任意功能，结果显示在这里（当前彩种：' + gname() + '）';
  }
  if (gidWrap) {
    [].slice.call(gidWrap.querySelectorAll('[data-gid]')).forEach(function (b) {
      b.onclick = function () { setGid(b.getAttribute('data-gid')); };
    });
  }
  [].slice.call(wrap.querySelectorAll('.frog-btn')).forEach(function (b) {
    b.onclick = function () { var k = b.getAttribute('data-frog'); if (FNS[k]) { lastFn = k; FNS[k](); } };
  });
  if(monsterMode){lastFn='monster';var panel=document.getElementById('monsterHome');if(panel)panel.addEventListener('toggle',function(){if(panel.open)monster();});}
  if(monsterMode)window.addEventListener('monster-draw-update',function(e){if(e.detail&&e.detail.games.indexOf(gid)>=0){var panel=document.getElementById('monsterHome');if(panel&&panel.open)monster();}});
}
initFrogLab('frogOut','frogLab','frogGid',false);
initFrogLab('monsterOut','monsterLab','monsterGid',true);
</script>


<script>
/* ZLQ_CLICK · 名家图库按钮：点一下 = 强制重新加载（绕缓存，拿云端最新）
   ⚠️ 静态页不能主动抓数据 ✗ —— 抓取在云端每 10 分钟跑一次 ✔ */
try {
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest(".ro-zldq-c") : null;
    if (!b || b.tagName === "DETAILS") return;
    e.preventDefault();
    var base = location.href.split("#")[0];
    var sep = base.indexOf("?") >= 0 ? "&" : "?";
    location.href = base + sep + "t=" + Date.now();
  });
} catch (err) { }
</script>
<script>document.addEventListener("click",function(e){if(!e.target.matches(".handdraw-sheet"))return;var overlay=document.createElement("div");overlay.style.cssText="position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;padding:10px";var im=document.createElement("img");im.src=e.target.src;im.alt=e.target.alt;im.style.cssText="max-width:96vw;max-height:96vh;object-fit:contain";overlay.appendChild(im);overlay.setAttribute("role","dialog");overlay.setAttribute("aria-label","手绘参考图，点击关闭");document.body.appendChild(overlay);function close(){overlay.remove();document.removeEventListener("keydown",esc);}function esc(e){if(e.key==="Escape")close();}overlay.onclick=close;document.addEventListener("keydown",esc);});</script></body>
</html>`;

/* ============================================================
   留痕断言（用户硬性要求）：页面上不能看出「数据是从哪来的」
     ① removeSourceWords —— 把可见文本里的来源字样换成中性说法
        （只读依赖模块吐出来的字也在这一步收拾，语义不变）
     ② assertNoSourceTrace —— 再扫一遍；命中 → 打印命中内容 → exit 1
   两条都来自共用模块 source-guard.mjs。
   ============================================================ */
const safeHtml = removeSourceWords(html);
assertNoSourceTrace(safeHtml, '只读分享版.html');

/* ============================================================
   【第二层防护 · 构建时硬断言】写文件之前先过这一关
   ------------------------------------------------------------
   事故（2026-10-17）：export-site.mjs 用 String.replace(收尾标签, CSS + 收尾标签)
   注入导航样式，只替换【第一处】；而本页 HTML 注释里也字面写着一个收尾标签 →
   整段 NAV_CSS 被插进注释内部 → CSS 全废 → 分享页 Tab 变蓝下划线链接。
   现在本页产出【写盘之前】就自检，任一不过 → exit 1（一个字节都不写）：
     ① head 开标签正好 1 个
     ② head 收尾标签正好 1 个（≠1 → 打印次数 + 行号/偏移）
     ③ 唯一槽位标记 __HEAD_SLOT__ 正好 1 个，且落在 head 区间内
     ④ perfify() 追加的那条 CSS 落在 head 内，且【不在 HTML 注释里】
        （判据：样式首字符往前找最近的 <!-- 和 -->，谁更近）
   ⚠️ 标签字面量故意拆开拼，本文件里不出现完整的 head 开/收尾标签。
   ============================================================ */
const T_HEAD_OPEN = '<' + 'head>';
const T_HEAD_CLOSE = '</' + 'head>';
const HEAD_SLOT_TAG = '<!--__HEAD_SLOT__-->';
function headTagPositions(s, tag) {
  const out = [];
  let i = 0;
  while ((i = s.indexOf(tag, i)) !== -1) { out.push(i); i += tag.length; }
  return out;
}
function headLineNo(s, pos) {
  let line = 1;
  for (let i = 0; i < pos && i < s.length; i++) if (s.charCodeAt(i) === 10) line++;
  return line;
}
function assertHeadOnce(finalHtml, label, cssText) {
  const bad = [];
  const open = headTagPositions(finalHtml, T_HEAD_OPEN);
  const close = headTagPositions(finalHtml, T_HEAD_CLOSE);
  const slots = headTagPositions(finalHtml, HEAD_SLOT_TAG);
  const where = (arr) => arr.map((p) => `第 ${headLineNo(finalHtml, p)} 行（偏移 ${p}）`).join(' / ');

  if (open.length !== 1) bad.push(`${T_HEAD_OPEN} 出现 ${open.length} 次（必须 1 次）${open.length ? ' → ' + where(open) : ''}`);
  if (close.length !== 1) bad.push(`${T_HEAD_CLOSE} 出现 ${close.length} 次（必须 1 次）${close.length ? ' → ' + where(close) : ''}`);
  if (slots.length !== 1) bad.push(`${HEAD_SLOT_TAG} 出现 ${slots.length} 次（必须 1 次）${slots.length ? ' → ' + where(slots) : ''}`);
  if (slots.length === 1 && open.length === 1 && close.length === 1
      && !(slots[0] > open[0] && slots[0] < close[0])) {
    bad.push(`注入槽位不在 head 里（槽位偏移 ${slots[0]}，head 区间 ${open[0]}~${close[0]}）`);
  }
  if (cssText) {
    const ci = finalHtml.indexOf(cssText);
    if (ci < 0) {
      bad.push('perfify() 追加的样式在产物里找不到');
    } else {
      const cOpen = finalHtml.lastIndexOf('<!--', ci);
      const cClose = finalHtml.lastIndexOf('-->', ci);
      if (cOpen > cClose) {
        bad.push(`perfify() 追加的样式落在 HTML 注释内部（最近的 <!-- 偏移 ${cOpen} / --> 偏移 ${cClose}）→ 这条 CSS 会失效`);
      }
      if (open.length === 1 && close.length === 1 && !(ci > open[0] && ci < close[0])) {
        bad.push(`perfify() 追加的样式不在 head 里（样式偏移 ${ci}，head 区间 ${open[0]}~${close[0]}）`);
      }
    }
  }
  if (bad.length) {
    console.error(`\n❌ ${label}：head 结构自检失败（${bad.length} 项），产物【没有写出】`);
    bad.forEach((b, i) => console.error(`   ${i + 1}) ${b}`));
    console.error('   常见原因：页面别处（尤其是 HTML 注释里）又写了字面的 head 开/收尾标签。\n');
    process.exit(1);
  }
  console.log(`   ✅ head 自检：${T_HEAD_OPEN}=1 · ${T_HEAD_CLOSE}=1 · 槽位=1（在 head 内）`);
}

// SHARE_UNLOCK_DAILY_V2: Beijing calendar day share prompt; UI access only.
const shareUnlockScript = "(function(){\n 'use strict';\n var key='chunfeng-share-unlock-day-v2', unlocked=false, unlockedDay='';\n function today(){return new Date(Date.now()+8*3600000).toISOString().slice(0,10);}\n try{unlockedDay=localStorage.getItem(key)||'';}catch(e){}\n unlocked=unlockedDay===today();\n var style=document.createElement('style');style.textContent='.share-locked>:not(.share-unlock):not(summary):not(.ro-gamehead){display:none!important}.share-unlock{padding:18px;text-align:center;background:#fcf6e9;border:1px solid #e8d8bc;border-radius:12px;margin:12px 0}.share-unlock button{background:#19895d;color:white;border:0;border-radius:20px;padding:10px 24px;font:inherit}.share-unlock p{color:#89795f;font-size:12px}';document.head.appendChild(style);\n function unlock(){var linkDialog=document.getElementById('shareLinkDialog');if(linkDialog)linkDialog.remove();var dialog=document.getElementById('dailyShareDialog');if(dialog)dialog.remove();unlockedDay=today();unlocked=true;try{localStorage.setItem(key,unlockedDay);}catch(e){}document.querySelectorAll('.share-locked').forEach(function(n){n.classList.remove('share-locked');});document.querySelectorAll('.share-unlock').forEach(function(n){n.remove();});}\n async function share(button,status,preferWeChat){\n  var url='https://chunfengww2026.github.io/chunfeng-lottery/index.html';\n  var old=document.getElementById('shareLinkDialog');if(old)old.remove();\n  var overlay=document.createElement('div');overlay.id='shareLinkDialog';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','分享链接');overlay.style.cssText='position:fixed;inset:0;z-index:100200;background:#0009;display:flex;align-items:center;justify-content:center;padding:20px';\n  var card=document.createElement('div');card.className='share-unlock';card.style.cssText='background:#fffaf0;max-width:360px;width:100%;box-sizing:border-box';\n  var title=document.createElement('b');title.textContent=preferWeChat?'分享给微信好友':'分享链接';\n  var input=document.createElement('textarea');input.rows=3;input.id='shareLinkUrl';input.readOnly=true;input.value=url;input.setAttribute('aria-label','网站分享链接');input.style.cssText='display:block;box-sizing:border-box;width:100%;padding:10px;margin:12px 0;font-size:13px;border:1px solid #d9c9ac;border-radius:8px;background:#fff;color:#4b3925';input.style.resize='none';input.onclick=function(){input.select();};\n  var copy=document.createElement('button');copy.type='button';copy.textContent='复制分享链接';\n  var result=document.createElement('p');result.setAttribute('role','status');\n  var tip=document.createElement('p');tip.textContent='分享后点击可查看';tip.style.cssText='font-weight:bold;color:#19895d';\n  var view=document.createElement('button');view.id='shareLinkConfirm';view.type='button';view.textContent='查看资料';view.disabled=true;view.onclick=unlock;\n  var close=document.createElement('button');close.type='button';close.textContent='返回';close.style.cssText='margin-left:8px;background:transparent;color:#8a7a63;border:1px solid #d9c9ac';close.onclick=function(){overlay.remove();};\n  card.append(title,input,copy,result,tip,view,close);overlay.appendChild(card);document.body.appendChild(overlay);input.focus();input.select();\n  async function copyLink(){copy.disabled=true;try{if(!navigator.clipboard||!navigator.clipboard.writeText)throw new Error('manual');await navigator.clipboard.writeText(url);result.textContent=preferWeChat?'链接已复制，请打开微信发给好友或朋友圈。':'链接已复制，请发送给朋友。';}catch(e){input.focus();input.select();result.textContent='请长按上方链接复制，发送给好友后再点击查看资料。';}finally{copy.disabled=false;view.disabled=false;}}\n  copy.onclick=copyLink;\n  if(preferWeChat||!navigator.share){await copyLink();return;}\n  button.disabled=true;\n  try{await navigator.share({title:'网页浏览需要浏览器',text:'资料免费参考\\n参考大地，详细资料均免费',url:url});result.textContent='返回后请点击下方“查看资料”。';view.disabled=false;}\n  catch(e){result.textContent=e.name==='AbortError'?'已取消分享，可复制上方链接重新分享。':'暂时无法调用分享，请复制上方链接。';}\n  finally{button.disabled=false;}\n }\n function mount(){unlocked=unlockedDay===today();if(unlocked)return;document.querySelectorAll('.ro-game[data-ro-gid],#ro-zldq,#frogHome,#ro-articles,#ro-refpic,#p3dSection,#ro-zx-pick,#ro-aipick,details.ro-xj').forEach(function(n){if(n.classList.contains('share-locked'))return;n.classList.add('share-locked');var box=document.createElement('div');box.className='share-unlock';var title=document.createElement('div');title.textContent='网页浏览需要浏览器';var p=document.createElement('p');p.textContent='资料免费参考\\n参考大地，详细资料均免费';p.style.whiteSpace='pre-line';var b=document.createElement('button');b.type='button';b.textContent='微信分享';var status=document.createElement('p');status.setAttribute('role','status');status.textContent='分享后点击可查看';b.onclick=function(){share(b,status,true);};var more=document.createElement('button');more.type='button';more.textContent='其他分享';more.style.cssText='margin-left:6px;background:#fff;color:#19895d;border:1px solid #19895d';more.onclick=function(){share(more,status,false);};box.append(title,p,b,more,status);n.appendChild(box);});}\n function refresh(){try{unlockedDay=localStorage.getItem(key)||unlockedDay;}catch(e){}if(unlockedDay===today()){unlocked=true;document.querySelectorAll('.share-locked').forEach(function(n){n.classList.remove('share-locked');});document.querySelectorAll('.share-unlock').forEach(function(n){n.remove();});}else{mount();}}\n setInterval(refresh,1000);document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);window.addEventListener('storage',function(e){if(e.key===key){unlockedDay=e.newValue||'';refresh();}});\n document.addEventListener('click',function(e){var tile=e.target.closest('.ro-toc-cell');if(!tile||unlockedDay===today())return;e.preventDefault();e.stopImmediatePropagation();mount();if(document.getElementById('dailyShareDialog'))return;var overlay=document.createElement('div');overlay.id='dailyShareDialog';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','分享后查看资料');overlay.style.cssText='position:fixed;inset:0;z-index:100100;background:#0008;display:flex;align-items:center;justify-content:center;padding:20px';var source=document.querySelector('.share-unlock');if(!source)return;var card=source.cloneNode(true);card.style.cssText='background:#fffaf0;max-width:360px;width:100%';var buttons=card.querySelectorAll('button'),status=card.querySelector('[role=status]');status.textContent='分享后点击可查看';buttons[0].textContent='微信分享';buttons[0].disabled=false;buttons[0].onclick=function(){share(buttons[0],status,true);};buttons[1].textContent='其他分享';buttons[1].disabled=false;buttons[1].onclick=function(){share(buttons[1],status,false);};var close=document.createElement('button');close.type='button';close.textContent='稍后查看';close.style.cssText='display:block;margin:14px auto 0;background:transparent;color:#8a7a63';close.onclick=function(){overlay.remove();};card.appendChild(close);overlay.appendChild(card);overlay.addEventListener('click',function(ev){if(ev.target===overlay)overlay.remove();});document.body.appendChild(overlay);buttons[0].focus();},true);\n mount();new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});\n})();\n";
const finalHtml = perfify(safeHtml.slice(0, safeHtml.lastIndexOf("</body>")) + "<script>" + shareUnlockScript + "</script>" + safeHtml.slice(safeHtml.lastIndexOf("</body>")));
assertHeadOnce(finalHtml, '只读分享版.html', '.ro-game{content-visibility:auto');
fs.writeFileSync(OUT, finalHtml.replace(/<!--[\s\S]*?-->/g, ''), 'utf8');

console.log(`✅ 已生成：${OUT}`);
console.log(`   大小：${(Buffer.byteLength(finalHtml, 'utf8') / 1024).toFixed(1)} KB`);
console.log(`   内容：${gameCount} 个彩种，${imgCount} 张图（${imgCount} 个实时渲染图位）`);
console.log(`   内联脚本：${inlineSizes.length} 个 / ${(inlineSizes.reduce((a, b) => a + b[1], 0) / 1024).toFixed(1)} KB`);
console.log(`   生成时间：${todayStr}`);
console.log('\n这个文件可以直接发微信/QQ，对方点开就能看（只能看，不能改）。');
console.log('页面里的推荐图由浏览器实时渲染，和本地 App 走同一条渲染路径。');

// __BUMP__ 2026-10-19T16:06:39.838Z










