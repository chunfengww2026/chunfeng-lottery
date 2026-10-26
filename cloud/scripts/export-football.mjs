/* ============================================================
  <!-- 【已删除 · 用户 2026-10-19「这几个都删除」】专家推荐块整块不再渲染（数据/脚本仍保留，随时可以恢复） --> ⛔ 铁律（2026-10-18 · 用户明确要求 · 改这个文件的人/助手都适用）
   不要动模板：不删区块、不加区块、不挪位置、不隐藏区块、
   不改列数/顺序/间距/字号/配色/文案。
   没数据时在【原有结构内】写"暂无"，不允许整块消失。
   只填数据、只修用户点名的 bug；要改结构先弹窗问用户。
   详细版：根目录 AGENTS.md
   ============================================================ */

// ============================================================
//  export-football.mjs —— 生成足球只读分享页（只显示竞猜场次）
//
//  产物：足球推荐.html —— 自包含单文件，发出去只能看
//
//  【数据源】
//    jc-data.js     —— 体彩竞彩【在售】比赛（官方场次，每天 10~20 场）
//    jc-history.js  —— 竞彩【已完场】累积记录（build-jc.mjs 归档出来的）
//
//  【为什么要有 jc-history】
//    在售列表只含还能买的比赛，一开完赛就从列表里消失 ——
//    所以「已完场」如果只读 jc-data 会【永远是 0 场】。
//    build-jc.mjs 每跑一次就把打完的比赛归档进 jc-history.js，
//    这里把两边合并，已完场才真的能累积起来。
//
//  内容：未开赛 / 进行中 / 已完场 三个分区
//        每场：竞彩编号、联赛、球队+排名、比分、赔率、推荐
//        完场明确标出「红（命中）/ 黑（未中）」
//
//  用法：node export-football.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
/* 数据源留痕断言（3 个生成脚本共用一份，见 source-guard.mjs）
   ⚠️ 用相对路径 import：与 DSH_JC_ROOT（只改数据目录）无关，代码目录恒为本文件所在目录 */
import { assertNoSourceTrace, removeSourceWords } from './source-guard.mjs';
/* 【设备门 + PWA】共用模块（零 localStorage、零裸 button、文案不含任何出处）：
     本机 / ?admin=1 / 手机平板 → 放行；电脑浏览器 / 电脑微信 → 拦截。
   ⚠️ 新模块必须同步进 cloud/sync-cloud.mjs 的 FROM_ROOT，否则云端构建找不到它。 */
import {
  PWA_HEAD, DEVICE_GATE_CSS, DEVICE_GATE_BODY,
  CHAT_CSS, CHAT_HTML, CHAT_JS, metaItemprop
} from './device-gate.mjs';


/* 【性能优化】用户 2026-10-17：「网页和桌面顺畅一点」。
   ① 所有 <img> 补 loading="lazy" + decoding="async"（首屏不用等 226 张图）
   ② 长页面加 content-visibility:auto（推荐图那 8～10 段先不渲染，滚到才渲染）
      ⚠️ 只加在 .ro-game（推荐图分节）上 —— 走势图要 JS 量坐标，不能跳过渲染。 */
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
      '.ro-game{content-visibility:auto;contain-intrinsic-size:auto 900px;}\n.m-rule-analysis{margin:8px 0;border:1px solid #e5d6bd;border-radius:8px;padding:9px;background:#fff9eb}.m-rule-analysis summary{cursor:pointer;font-weight:700}.m-rule-body{line-height:1.8;font-size:12px}.m-rule-body small{color:#8a7a63}</style>');
  }
  return s;
}

/* 【自测用】DSH_JC_ROOT 可以把数据目录指到别处（用夹具验证页面，不碰真数据） */
const ROOT = process.env.DSH_JC_ROOT
  ? path.resolve(process.env.DSH_JC_ROOT)
  : path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, '足球推荐.html');

/* 代码目录：DSH_JC_ROOT 只改【数据目录】，不改代码目录 */
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

/* ---------- 亚指综合换算（算法在 asian-index.js，只有一份） ----------
   用 vm 读进来而不是 import：asian-index.js 是普通浏览器脚本
   （football.html 里 <script src> 直接用），不能同时写 export。 */
function loadAsianIndex() {
  const p = path.join(SCRIPT_DIR, 'asian-index.js');
  if (!fs.existsSync(p)) { console.error('⚠️ 缺 asian-index.js —— 页面不做亚指换算'); return null; }
  try {
    const c = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
    vm.runInContext(fs.readFileSync(p, 'utf8') + `
globalThis.__AI = { ASIAN_INDEX_CALC, calcAsianIndexAnalysis, asianHotRule,
  asianHandicapFromLine, buildAsianIndex, asianIndexView, getFundUp };`, c);
    return c.__AI;
  } catch (e) {
    console.error(`⚠️ asian-index.js 解析失败：${e.message} —— 页面不做亚指换算`);
    return null;
  }
}
const AI = loadAsianIndex();

/* ---------- 读数据 ---------- */
function loadVar(file, varName) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return null;
  try {
    const c = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
    vm.runInContext(fs.readFileSync(p, 'utf8') + `\nglobalThis.__X = ${varName};`, c);
    return c.__X;
  } catch (e) {
    console.error(`⚠️ ${file} 解析失败：${e.message}`);
    return null;
  }
}

const JC = loadVar('jc-data.js', 'JC_DATA');
if (!JC || !Array.isArray(JC.games) || !JC.games.length) {
  console.error('❌ 找不到竞彩数据（jc-data.js），请先运行 build-jc.mjs');
  process.exit(1);
}

/* 已完场累积记录（可能还没有这个文件 —— 第一次跑 build-jc.mjs 之后才有） */
const HIST = loadVar('jc-history.js', 'JC_HISTORY');

/* 【已完场赛果】jc-results.js —— build-football-results.mjs 抓的【最近 48 小时完场】
   ------------------------------------------------------------
   用户 2026-10-18：「补已经踢完的比赛的赛果抓取」。
   为什么要多这一份：上面 jc-history.js 的比分只靠足球数据流补（football.js），
   流里没有那一场时，归档记录就是「已完场 + 比分 —」，红黑也判不出来。
   这份是独立抓的一张完场比分表（终场 + 半场），这里只把它当【最后一个比分来源】：
   实时流 → jc-data 自身的 score / liveScore → 都没有时，才来查它。
   文件缺失 / 解析失败 → 返回 null，页面照旧（绝不编比分）。 */
const RESULTS = loadVar('jc-results.js', 'JC_RESULTS');

/* football.js 用来补充实时比分（可选） */
const FB = loadVar('football.js', 'FOOTBALL_DATA');

/* 【体彩官网在售场次】jc-official.js 由 build-jc-count.mjs 每小时抓一次，
   里面 JC_OFFICIAL.inSale 是体彩官网公布的【真实】在售场次。
   读取方式和上面 jc-data.js / jc-history.js / football.js 完全一样。
   拿不到（文件还没生成 / 解析失败）时返回 null，页面自动退回原来的
   stat.upcoming + stat.live，绝不会因为少这个文件就崩。 */
const JC_OFFICIAL = loadVar('jc-official.js', 'JC_OFFICIAL');

/* 【推荐串存档】jc-reco-data.js 由 jc-reco-build.mjs 生成：
   每期把「当时那一串推荐（在售 × 信心 ≥58%）」原样存下来，
   比赛打完后回填终场比分与红黑 → 页面上「推荐串 红 X 黑 Y 命中率 Z%」
   才有数可显示（以前这里是写死的 0 / 0%）。
   文件缺失时返回 null，页面退回「暂未开始统计」，绝不填 0 凑数。 */
const JC_RECO = loadVar('jc-reco-data.js', 'JC_RECO_DATA');

/* 【推荐串计算内核】jc-reco-archive.js（纯函数，UMD：无 module 时挂到 globalThis）
   用和上面几个数据文件【同一套 vm 读法】加载，不必额外引 createRequire。
   ⚠️ 必须用【同一个内核】算红黑：以前这里自己写了一段"整串口径"的循环，
      结果 3 场全中只显示「红 1」，和 jc-reco-stats.mjs（单场口径）不一致。 */
const RECO_KERNEL = loadVar('jc-reco-archive.js', 'JC_RECO_ARCHIVE');

/* 【泊松指数内核】jc-poisson.js（纯函数，UMD：无 module 时挂到 globalThis）
   ------------------------------------------------------------
   用户队列⑥「泊松指数 + 分歧指 + 亚指多家」，并定「先做能从现有数据算出来的」。
   能做：泊松指数 —— 由 odds.europe（欧指）+ odds.overunder（大小盘）反推期望进球。
   做不了：分歧指数 / 亚指多家 —— 它们需要【多家博彩公司】的赔率离散度，
           而 jc-data.js 里只有一家（open/live 是同公司两个时点，不是公司间分歧）。
   ⚠️ 字段名有误导：odds.overunder 里【over 才是盘口】，line 其实是大球水位。
      依据：竞彩页现显示「大小 0.8 大 3 小 1」，对应 {line:0.8, over:3, under:1}。
   ⚠️ 内核已知局限：独立泊松会系统性【低估平局】（真数据 11 场平均低 1.6pp）。
      内核把偏差算出来（drawBias），页面上如实显示，不加说不清的修正系数。 */
const POISSON = loadVar('jc-poisson.js', 'JC_POISSON');

/* 【多家公司欧赔 + 分歧指数据】
   ------------------------------------------------------------
   用户 2026-10-17：「竞彩页卡片上加欧赔对比 + 分歧」。
   这两份是【比赛详情页】本来就在用的数据，这里只是让竞彩页也读一份：
     JC_TITAN      主流 12 家公司的 初盘/即时/返还率/凯利（每场还标了参与统计的公司总数）
     JC_DIVERGENCE 分歧指 —— 各家【即时】欧赔逐方向算的变异系数 cv = 标准差 ÷ 均值
   口径和 build-match.mjs 的 renderDivergence 保持一致（同一个"分歧"不能两套算法）。
   ⚠️ 拿不到就整块不显示，绝不用单源硬造（和泊松块同一套原则）。 */
const TITAN = loadVar('jc-titan.js', 'JC_TITAN');
const DIVERGENCE = loadVar('jc-divergence.js', 'JC_DIVERGENCE');
const MARKET_RULES = loadVar('jc-market-rules.js','JC_MARKET_RULES');
const MARKET_BIFA = loadVar('jc-bifa.js','JC_BIFA');

/* ============================================================
   【晒票】竞彩实票图片数据（xysp-jc-data.js）
   ------------------------------------------------------------
   用户原话：「竞赛页面 也做一个晒票 你去全网抓取晒票的 和抓彩票的程序编码一样」
   ⇒ 数据由 build-xysp-tt.mjs 的「竞彩晒票」分类抓（今日头条搜索页，
     关键词 = 竞彩晒单 / 竞彩 晒票 / 胜负彩 晒票 / 竞彩 实单 / 竞彩足球 晒票），
     每 30 分钟跟着 update-articles-30min.cmd 刷新一次。
   读取方式照抄上面几个：文件不在 / 解析失败 → null，
   页面照常生成，只是「晒票」区块显示「暂无」——绝不让整页生成失败。
   ⚠️ 只认 https 外链（图是头条签名外链，实测没有防盗链、不下载本体）。
   窗口（用户 2026-10-16 【最终】决定）：竞彩晒票 = 发布【24 小时】内的。
   （演变：30 天 → 72 小时 → 现在 24 小时。用户原话「超时一天了就不要了」。）
   见 build-xysp-tt.mjs 里 JC_KEEP_HOURS 的说明。

   ⚠️【这里为什么要自己再过一遍窗口】抓取脚本写缓存时会按窗口清，
      但缓存文件可能很旧（比如 30 分钟任务停了几天 / 脚本刚改过窗口值），
      或者被人手动塞了东西。页面不能盲信文件内容 ——
      实测踩过两次：造假数据时"31 天前"的条目被原样渲染到竞彩页上；
      后来窗口改了之后页面这边没跟着改，又把超窗条目渲染了出来。
      所以出页面时按【同一套规则】再过一遍：
        · 丢掉发布时间超过 24 小时的（拿不到发布时间就退回用 at）
        · 按 img 去重（同一个图只留一条）
      ⚠️ 窗口值必须和 build-xysp-tt.mjs 的 JC_KEEP_HOURS / JC_PUB_HOURS 保持一致，
         改一边必须改另一边（这里踩过坑）。 */
const JC_KEEP_HOURS = 24;
const JC_MAX = 1000;

/* ------------------------------------------------------------
   【晒票 · 第二路数据】足球晒票的票面实拍照片（football-tickets.js）
   ------------------------------------------------------------
   用户原话：「做足球晒票/晒单实时抓取」。
   这一路是【票面照片】，和上面那路（搜索结果的分享图）互补：
   上面那路实测经常只剩 1 条，这一路能把整块真正撑起来。

   数据由 fetch-football-tickets.mjs 在【本机】抓、写 football-tickets.js，
   跟着本机同步上云；云端抓不到（实测 405），所以云端只读文件、不抓。

   读取方式照抄上面几个：文件不在 / 解析失败 → null，页面照常生成。
   ⚠️ 窗口 FB_KEEP_HOURS = 72 小时，比头条那路的 24 小时宽 ——
      竞彩实票集中在周末和晚上，用 24 小时窗口的话白天大半时间整块是空的。
   ⚠️ 只认 https 外链（图床实测无防盗链、不下载本体、页面只存外链）。
   ⚠️ 标题在抓取脚本里就中性化好了（不搬源站原标题，自己拼「期号 · 时间」），
      这里【不再往标题里加任何别的东西】—— 页面铁律：不出现任何出处字样。
   ------------------------------------------------------------ */
const FB_KEEP_HOURS = 72;
const FB_RAW = loadVar('football-tickets.js', 'FB_TICKETS');
const FB_UPDATED = loadVar('football-tickets.js', 'FB_TICKETS_UPDATED');

/* 原始文件内容（可能带过期/重复条目）—— 下面立刻过滤成 JC_XYSP */
const XYSP_JC = loadVar('xysp-jc-data.js', 'XYSP_JC_DATA');
const JC_XYSP = (function () {
  const raw = (XYSP_JC && Array.isArray(XYSP_JC.items)) ? XYSP_JC.items : [];
  const now = Date.now();
  const cutoff = now - JC_KEEP_HOURS * 3600 * 1000;
  const seen = new Set();
  const items = [];
  for (const it of raw) {
    const img = String((it && it.img) || '');
    if (!img || seen.has(img)) continue;          /* 去重 */
    /* 发布窗口：优先看 when（源站发布时间），拿不到才退回 at（抓取时间） */
    const pub = Date.parse(String((it && it.when) || '')) || Date.parse(String((it && it.at) || ''));
    if (!isFinite(pub) || pub < cutoff) continue;  /* 超出 72 小时窗口 → 丢 */
    seen.add(img);
    items.push(it);
  }

  /* ---- ② 足球晒票（票面照片）----
     映射成上面那路同一套字段（img / thumb / title / game / when / at），
     这样下面的【排序和渲染一行都不用改】。 */
  const fbCutoff = now - FB_KEEP_HOURS * 3600 * 1000;
  const fbRaw = Array.isArray(FB_RAW) ? FB_RAW : [];
  for (const it of fbRaw) {
    const img = String((it && it.image_url) || '');
    /* 只认 https（http 会被浏览器当混合内容拦掉，和上面同一条规矩） */
    if (!/^https:\/\//i.test(img) || seen.has(img)) continue;
    const pub = Date.parse(String((it && it.published_at) || '')) || Date.parse(String((it && it.fetched_at) || ''));
    if (!isFinite(pub) || pub < fbCutoff) continue;
    seen.add(img);
    items.push({
      img,
      thumb: img,          /* 这家图床不支持缩略参数（实测字节数不变）→ 原图当缩略图 */
      title: String((it && it.title) || ''),
      /* game 留空：标题里已经写了期号，再带一个「竞彩」标签就重复了；
         渲染时用兜底值「竞彩」当粗体标签（见 buildJcXyspHtml）。 */
      game: '',
      when: String((it && it.published_at) || ''),
      at: String((it && it.fetched_at) || ''),
      url: String((it && it.url) || ''),
      src: 'fb',
    });
  }
  /* 排序：发布时间新的在前（没有发布时间的用抓取时间） */
  items.sort((a, b) =>
    ((Date.parse(String(b.when || '')) || Date.parse(String(b.at))) -
     (Date.parse(String(a.when || '')) || Date.parse(String(a.at)))));
  /* 两路数据合并后 items 可能超过 1000 条 —— 页面只放最新的 JC_MAX 条 */
  /* updated 取【两路里较新的那个】：两边的格式都是 'YYYY-MM-DD HH:mm'，
     字符串比大小就是时间比大小，不用解析。 */
  const stampA = String((XYSP_JC && XYSP_JC.updated) || '');
  const stampB = String(FB_UPDATED || '');
  const updated = stampB > stampA ? stampB : stampA;
  return { updated, items: items.slice(0, JC_MAX) };
})();

/* ---------- 工具 ---------- */
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function timeHM(dt) {
  const m = /(\d{2}):(\d{2})/.exec(dt || '');
  return m ? `${m[1]}:${m[2]}` : '';
}
function dateMD(dt) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(dt || '');
  return m ? `${m[2]}-${m[3]}` : '';
}
function weekCN(dt) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(dt || '');
  if (!m) return '';
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
}

/* ---------- 用 football.js 补实时比分 ---------- */
const ALL_FB = FB && FB.lists
  ? [...(FB.lists.upcoming || []), ...(FB.lists.live || []), ...(FB.lists.finished || [])]
  : [];

/* 繁简 + 简写对照
   【注意】这份表和 jc-archive.mjs 里的 ALIAS / TRAD 是同一套规则，
   两边要一起改，否则「归档时能配上的队名、出页面时又配不上」。
   这里只影响 jc-data 场次去 football.js 补实时比分，漏配只是少个比分，不会出错。 */
const ALIAS = {
  /* jc-data（竞彩简称）→ football.js（245qq 写法） */
  '南安普敦': '南安普顿', '贝蒂斯': '皇家贝蒂斯', '维拉': '阿斯顿维拉',
  '曼城': '曼彻斯特城', '巴黎圣曼': '巴黎圣日耳曼', '弗鲁米嫩': '弗鲁米嫩塞',
  '帕梅拉斯': '帕尔梅拉斯', '圣路易斯城': '圣路易斯市', '温哥华': '温哥华白帽',
  '皇马': '皇家马德里', '巴萨': '巴塞罗那', '马竞': '马德里竞技',
  '曼联': '曼彻斯特联', '国米': '国际米兰', '拜仁': '拜仁慕尼黑',
  '莱红牛': '莱比锡红牛', '米堡': '米德尔斯堡', '那不勒斯': '拿玻里',
  '比利亚雷': '比利亚雷亚尔', '加拉塔萨': '加拉塔萨雷',
  '埃因霍温': 'PSV埃因霍温', '里斯本': '葡萄牙体育',
  '纽喷气机': '纽卡斯尔喷气机', '博德闪耀': '博多格林特'
};

/* 繁体 → 简体（队名常见字） */
const TRAD = {
  '溫': '温', '爾': '尔', '蘭': '兰', '維': '维', '薩': '萨', '羅': '罗',
  '馬': '马', '德': '德', '聯': '联', '競': '竞', '體': '体', '門': '门',
  '興': '兴', '達': '达', '萊': '莱', '錫': '锡', '圖': '图', '倫': '伦',
  '佈': '布', '雷': '雷', '斯': '斯', '頓': '顿', '漢': '汉', '堡': '堡',
  '聖': '圣', '貝': '贝', '華': '华', '魯': '鲁', '輔': '辅', '亞': '亚',
  '內': '内', '納': '纳', '傑': '杰', '飛': '飞', '紅': '红', '紐': '纽',
  '約': '约', '廣': '广', '島': '岛', '國': '国', '際': '际', '業': '业',
  '費': '费', '熱': '热', '銀': '银', '礦': '矿', '澤': '泽', '車': '车',
  '東': '东', '蘇': '苏', '愛': '爱'
};

function toSimp(s) {
  return String(s || '').replace(/[\u4e00-\u9fa5]/g, (ch) => TRAD[ch] || ch);
}

/** 去掉「U19 / 女足 / 俱乐部 / 后备队」这类噪音 */
function stripNoise(s) {
  return String(s || '').replace(
    /(足球俱乐部|俱乐部|足球队|后备队|预备队|青年队|女足|U\d{2}|FC|SC|CF|AC|BK|IF|FK|SV|SK|CS)/gi,
    ''
  );
}

function norm(s) {
  const simp = toSimp(String(s || '').trim());
  const aliased = ALIAS[simp] || simp;
  return stripNoise(aliased)
    .replace(/[（(].*?[)）()]/g, '')
    .replace(/[\s\-·.]/g, '')
    .toLowerCase();
}

/* 青年队 / 后备队 / 女足 必须和成年队区分开，否则「维拉」会配到「阿斯顿维拉U19」 */
const YOUTH_RE = /(U\d{2}|女足|后备队|预备队|青年队|B队|二队|II队)/i;

function sameTeam(a, b) {
  const ra = String(a || '');
  const rb = String(b || '');
  if (YOUTH_RE.test(ra) !== YOUTH_RE.test(rb)) return false;
  const x = norm(ra);
  const y = norm(rb);
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length <= y.length ? x : y;
  const long = x.length <= y.length ? y : x;
  if (short.length >= 3 && long.includes(short)) return true;
  return false;
}

const dayOf = (t) => String(t || '').slice(0, 10);

/** 「现在」的北京时间墙钟（和 jc-data / jc-history 里 '2026-10-17 06:07' 同一口径）。
 *  用途：判断某场的开赛时间是不是还没到 —— 见 prep() 里那段「按开赛时间如实分档」。
 *  ⚠️ 不能用 new Date() 的 UTC 值直接比：数据里写的是北京时间。 */
const nowCN = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');

/** 找 football.js 里对应的那场（用来拿比分 / 实时状态）
 *  ⚠️ 两级匹配（2026-10-17 补：用户要求「已完场要有比分显示」）：
 *     ① 先按【同一天 ±1 天 + 主客队名都认得】—— 最稳，能拿到实时比分和分钟数
 *     ② ① 找不到时，只按队名再找一次（不限日期，取日期最接近的那场）——
 *        归档（jc-history）里有些场次的日期和 football.js 的对不上一天，
 *        只靠 ① 会白白丢掉本来拿得到的比分。
 *     两级都找不到 → 返回 null（调用方如实显示「—」，不编）。 */
function findFb(g) {
  if (!ALL_FB.length) return null;
  const jd = dayOf(g.time);
  const t0 = new Date(jd + 'T00:00:00').getTime();
  const near = ALL_FB.find((m) => {
    const d1 = t0;
    const d2 = new Date(dayOf(m.time) + 'T00:00:00').getTime();
    if (Math.abs(d1 - d2) > 86400000) return false;
    return sameTeam(g.home.name, m.home.name) && sameTeam(g.away.name, m.away.name);
  });
  if (near) return near;
  /* ② 同队名、不限日期，取日期最近的那一场 */
  let best = null, bestGap = Infinity;
  for (const m of ALL_FB) {
    if (!sameTeam(g.home.name, m.home.name) || !sameTeam(g.away.name, m.away.name)) continue;
    const gap = Math.abs(t0 - new Date(dayOf(m.time) + 'T00:00:00').getTime());
    if (gap < bestGap) { best = m; bestGap = gap; }
  }
  return best;
}

/* ============================================================
   【完场赛果查找】jc-results.js → 这一场的终场比分
   ------------------------------------------------------------
   只用在不该为空的地方：调用方【已经拿不到任何比分】时才查它。
   匹配条件（三条同时满足，宁可查不到也不要查错）：
     ① 主队、客队 都 sameTeam（别名 / 繁简 / 简称容忍）
     ② 开赛日期相差 ≤ 1 天（两边日期口径常常差一天）
     ③ 两边都写了联赛 → 联赛名必须一致（实测两边联赛名 26/26 完全一致，
        加上这条以后「同一天两支名字相近的球队」几乎不可能误配）
   候选不唯一（同一天同一对球队有两场）→ 比分一致才用，不一致返回 null。
   ============================================================ */
const RESULT_LIST = (RESULTS && Array.isArray(RESULTS.list)) ? RESULTS.list : [];
function findResult(g) {
  if (!RESULT_LIST.length) return null;
  if (!g || !g.home || !g.away) return null;
  const t0 = new Date(dayOf(g.time) + 'T00:00:00').getTime();
  if (isNaN(t0)) return null;
  const cands = [];
  for (const r of RESULT_LIST) {
    const t1 = new Date(String(r.date) + 'T00:00:00').getTime();
    if (isNaN(t1) || Math.abs(t0 - t1) > 86400000) continue;
    if (!sameTeam(g.home.name, r.home) || !sameTeam(g.away.name, r.away)) continue;
    if (g.league && r.league && String(g.league) !== String(r.league)) continue;
    cands.push(r);
  }
  if (!cands.length) return null;
  const uniq = [...new Set(cands.map((c) => c.ft.h + ':' + c.ft.a))];
  if (uniq.length > 1) return null;
  return cands[0];
}

/* ---------- 整理每场的展示数据 ---------- */
const kindCN = { upcoming: '未开赛', live: '进行中', finished: '已完场' };

/* ============================================================
   把 jc-history.js 的归档记录转成和 jc-data 一样的形状，
   这样后面的 prep / renderMatch / 统计全都不用改逻辑。
   ============================================================ */
/** 老记录可能没存 prob（早期版本），从欧赔反推一下，免得渲染时 r.prob 是 null */
function probFromOdds(odds) {
  if (!odds) return null;
  const h = +odds.home, d = +odds.draw, a = +odds.away;
  if (!(h > 0) || !(d > 0) || !(a > 0)) return null;
  const raw = { home: 1 / h, draw: 1 / d, away: 1 / a };
  const sum = raw.home + raw.draw + raw.away;
  if (!sum) return null;
  return {
    home: +(raw.home / sum * 100).toFixed(1),
    draw: +(raw.draw / sum * 100).toFixed(1),
    away: +(raw.away / sum * 100).toFixed(1)
  };
}

/* ============================================================
   【推荐类型】three（胜负平）/ unbeaten（不败）__RECO_UNBEATEN__
   ------------------------------------------------------------
   用户要求：推荐类型支持两种
     type='three'    推胜负平：主胜 / 平 / 客胜        ← 原来只有这个
     type='unbeaten' 推不败：主不败 / 客不败           ← 2026-10-17 新增

   ① 不败概率怎么算（纯数学，不编数字）
      数据源 = reco.prob —— jc-data.js 里由 build-jc.mjs 的 calcReco()
      用欧赔 1/赔率 归一化反推出来的 home / draw / away 三个概率。
        主不败 = P(主胜) + P(平)      ← 主胜或平，两种结果都算"主队不败"
        客不败 = P(客胜) + P(平)
      实例：周五001  prob = 39.4 / 25.6 / 35
            主不败 = 39.4 + 25.6 = 65.0%     客不败 = 35 + 25.6 = 60.6%
      ⚠️ 两个"不败"【不是互斥】事件（都含"平"），相加 ≠ 100% ——
         这就是"双选 / 不败"的算法本身；prob 为 null（当时没抓到赔率）
         时算不出来 → 不显示数字，绝不填 0 凑数。

   ② type 从哪来
      jc-data.js 的 reco 里【目前没有 type 字段】（已核实：只有
      pick / label / confidence / prob / clear / margin / rqLine）——
      所以这里【按数据里已有的字段推导】，不新增字段、不改 jc-data.js：
        ① 数据里带了 reco.type → 原样用（上游以后加了自动生效）
        ② pick === 'draw' → 'three'（"平"没法用"不败"表达）
        ③ reco.clear === false（build-jc.mjs 的既有标记：信心 <45%，
           胜负平方向不够清晰）→ 'unbeaten'：推更稳的那个"不败"
        ④ 其余 → 'three'
      ⚠️ 只影响【卡片显示 + 卡片自己的红黑判定】：reco.confidence、
         jc-data.js、推荐串（在售 × 信心 ≥58%）的口径一个字都没动。

   ③ 【开关】RECO_DERIVE_UNBEATEN
      默认 false = 【不改变上游的推荐】：一律用数据里的 type（没有就是 'three'），
      卡片照旧显示"推荐 主胜 / 信心 46.4%"和原来的红黑判定，
      只是右侧【多出一行"不败"胶囊】（不败概率照算、照显示）。
      ⇒ 想要"不够清晰的场次改推不败"，把这里改成 true 即可（一行）。
      ⚠️ 为什么默认 false：jc-data.js 的 reco 里【没有 type 字段】，
         而上面的 ③ 规则要拿 reco.clear 当依据 —— 实测 historyToGame()
         给【所有归档场次】写死了 clear:false（那里的 false 是"未知"，
         不是"算出来不清晰"），一开就会把 64 张卡里的 57 张历史卡
         全变成"主不败/客不败"，连它们的红黑判定口径也跟着换 ——
         这超出"只做加法"的范围了。
      ⇒ 正解是上游 build-jc.mjs 的 calcReco() 直接给出 reco.type，
         这里会自动优先用数据的 type（见 ② 的第 ① 条）。
   ============================================================ */
const RECO_DERIVE_UNBEATEN = false;

/** 主不败 / 客不败 的概率（= reco.prob 里的 主胜+平 / 客胜+平；算不出来返回 null） */
function ubProb(prob) {
  if (!prob) return null;
  const h = +prob.home, d = +prob.draw, a = +prob.away;
  if (!Number.isFinite(h) || !Number.isFinite(d) || !Number.isFinite(a)) return null;
  return { home: +(h + d).toFixed(1), away: +(a + d).toFixed(1) };
}

/** 这场按哪种类型推荐（'three' | 'unbeaten'），规则见上面 ② */
function recoTypeOf(r) {
  if (!r) return 'three';
  if (r.type === 'unbeaten') return 'unbeaten';   /* 数据里写了就用数据的 */
  if (r.type === 'three') return 'three';
  if (!RECO_DERIVE_UNBEATEN) return 'three';
  if (r.pick === 'draw') return 'three';          /* 平局没法用"不败"表达 */
  if (r.clear === false && ubProb(r.prob)) return 'unbeaten';
  return 'three';
}

/** 「不败」推荐的那一边（'home' | 'away' | ''）；平局推荐没有"不败"边 */
function unbeatenSide(r) {
  if (!r) return '';
  return r.pick === 'home' ? 'home' : (r.pick === 'away' ? 'away' : '');
}

/** 不败推荐的显示名 */
function unbeatenLabel(r) {
  return r && r.pick === 'away' ? '客不败' : '主不败';
}

/* 推荐结果是否命中：两种类型判据不同，不能用同一套 ——
     three    ：只中那一个结果（主胜/平/客胜 之一）
     unbeaten ：主胜或平 / 客胜或平 都算中（双选）
   ⚠️ 不败推荐如果还用 pick===actual 判，平局会被错判成「黑」。 */
function recoHit(r, actual) {
  if (!r || !actual) return false;
  const side = unbeatenSide(r);
  if (recoTypeOf(r) === 'unbeaten' && side) return actual === 'draw' || actual === side;
  return r.pick === actual;
}

function historyToGame(rec) {
  const m = /^(\d+)\s*[:：-]\s*(\d+)$/.exec(String(rec.score || ''));
  const hs = m ? +m[1] : null;
  const as = m ? +m[2] : null;
  const hasScore = hs !== null && as !== null;

  const pick = rec.pick || '';
  const label = rec.pickLabel
    || { home: '主胜', draw: '平局', away: '客胜' }[pick] || '';

  return {
    gid: 'hist-' + (rec.code || '') + '-' + String(rec.time || '').replace(/\D/g, ''),
    code: rec.code || '',
    league: rec.league || '',
    round: '',
    time: rec.time || '',
    /* 这条是从 jc-history.js 归档来的（统计「已完场累积 N 场」时用来数） */
    fromArchive: true,
    handicap: rec.hc != null ? rec.hc : null,
    /* 【亚指综合换算】归档时存下来的那份（老记录没有 → null → 不显示） */
    asianIndex: rec.asianIndex || null,
    home: { name: rec.home || '?', rank: null },
    away: { name: rec.away || '?', rank: null },
    score: hasScore ? { home: hs, away: as } : null,
    liveScore: null,
    status: 'finished',
    minute: 0,
    odds: rec.odds ? { europe: { open: null, live: rec.odds } } : null,
    reco: pick ? {
      pick, label,
      confidence: rec.conf != null ? rec.conf : null,
      prob: rec.prob || probFromOdds(rec.odds),
      /* 【推荐类型】归档里【存了】type 就用它（见 jc-archive.mjs 的
         toHistoryRecord / recoTypeOf）—— 这样「在售时怎么判红黑、
         进了归档还怎么判」，不会因为离开在售列表就退回 'three'。
         老归档（2026-10-17 之前那批，没存 type）→ 'three' 兜底，
         和改动前完全一样（向后兼容，不瞎猜）。 */
      type: (rec.type === 'unbeaten' || rec.type === 'three') ? rec.type : 'three',
      clear: false, margin: null,
      fromHistory: true
    } : null
  };
}

/* 历史记录的身份键（用来和本次在售的去重） */
const histKey = (r) => {
  const ck = /[周週]([一二三四五六日天])\s*0*(\d{1,3})/.exec(String(r.code || ''));
  if (ck) {
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
    return 'code:周' + map[ck[1]] + '-' + String(ck[2]).padStart(3, '0');
  }
  const tp = [norm(r.home), norm(r.away)].sort().join('|');
  return tp ? 'id:' + tp + '@' + dayOf(r.time) : '';
};

/* 本次在售里已有的身份键 —— 历史里重复的就不再单独显示 */
const jcKeys = new Set();
JC.games.forEach((g) => {
  const ck = /[周週]([一二三四五六日天])\s*0*(\d{1,3})/.exec(String(g.code || ''));
  if (ck) {
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
    jcKeys.add('code:周' + map[ck[1]] + '-' + String(ck[2]).padStart(3, '0'));
  }
  const tp = [norm(g.home && g.home.name), norm(g.away && g.away.name)].sort().join('|');
  if (tp) jcKeys.add('id:' + tp + '@' + dayOf(g.time));
});

/* 历史（去重 + 按时间倒序） */
const HIST_LIST = (HIST && Array.isArray(HIST.list)) ? HIST.list : [];
const HIST_GAMES = [];
const seenHist = new Set();
HIST_LIST.forEach((r) => {
  if (!r) return;
  const k = histKey(r);
  if (k && (jcKeys.has(k) || seenHist.has(k))) return;
  if (k) seenHist.add(k);
  HIST_GAMES.push(historyToGame(r));
});

/* 已完场 = 本次在售里完场的 + 历史累积的 */
const ALL_GAMES = [...JC.games, ...HIST_GAMES];

/* ============================================================
   【规则一 · 已完场只留 24 小时】用户要求（原话）：
     「比赛24小时后抓取 + 竞彩对外开售的」
   ------------------------------------------------------------
   为什么要在【出页面】这一层再做一遍：数据侧（build-jc.mjs）管的是
   「抓」和「归档」—— jc-history.js 故意保留 72 小时，因为推荐串 / 完场
   战绩要和历史比对，归档清干净就没得比了。但屏幕上只该看到新鲜的，
   所以「显示窗口」由这里决定，两边用同一个口径。

   判定（和 build-jc.mjs 的 finishedExpired 完全一致）：
     「比赛结束」≈ 开赛时间 + 2 小时（90 分钟 + 中场 + 补时）
     离「结束」超过 24 小时 → 这场已完场不再显示
   举例：14:00 开赛 → 16:00 算结束 → 次日 16:00 之后从「已完场」移出。

   ⚠️ 认不出开赛时间 → 不删（宁可多显示一场，也绝不把页面搞空）
   ⚠️ 只作用于「已完场」：未开赛 / 进行中 一场都不动
   ⚠️ 和 build-jc.mjs 的 FIN_KEEP_HOURS / MATCH_LEN_HOURS 必须是同一个数
   ============================================================ */
const FIN_KEEP_HOURS = 24;
const MATCH_LEN_HOURS = 2;
function matchEndMs(t) {
  const k = kickMs(t);
  return isNaN(k) ? NaN : k + MATCH_LEN_HOURS * 3600 * 1000;
}
function finishedExpired(m) {
  if (!m || m.kind !== 'finished') return false;
  const e = matchEndMs(m.time);
  if (isNaN(e)) return false;
  return Date.now() - e > FIN_KEEP_HOURS * 3600 * 1000;
}

function prep(g) {
  const fb = findFb(g);

  /* 【亚指综合换算】优先用 build-jc.mjs 存好的那份；
     jc-data.js 还是旧版（没存）时就地算一遍，页面不至于空着。
     算不出来（没亚盘 / 认不出盘口）→ null → 整块不显示。 */
  let asianIndex = g.asianIndex || null;
  if (!asianIndex && AI && typeof AI.buildAsianIndex === 'function') {
    try { asianIndex = AI.buildAsianIndex(g); } catch (e) { asianIndex = null; }
  }

  /* 比分优先级：football.js 实时比分 > jc-data 自己的比分 > jc-results 完场赛果
     ⚠️ 第三条是【兜底】：前两条都拿不到、而且这场【已经踢完】（开赛超过 2 小时）
        才去查完场赛果表。用户 2026-10-18 要求「已完场不能没有比分」，
        这是最后一道保险（正常情况下 build-football-results.mjs 已经把比分
        补进 jc-history.js 了，这里只是防止「刚归档、还没轮到补」那一小段空窗）。
     为什么必须卡「已踢完」：未开赛的场次如果队名和某场历史比赛撞了，
        不卡就会把上一场的比分贴到还没开踢的卡片上。 */
  let hs = null, as = null;
  if (fb && fb.home && fb.home.score !== null && fb.home.score !== undefined) {
    hs = fb.home.score; as = fb.away.score;
  } else if (g.liveScore && g.liveScore.home !== null && g.liveScore.home !== undefined) {
    hs = g.liveScore.home; as = g.liveScore.away;
  } else if (g.score && g.score.home !== null && g.score.home !== undefined) {
    hs = g.score.home; as = g.score.away;
  }
  if (hs === null || hs === undefined || as === null || as === undefined) {
    const kick = kickMs(g.time);
    if (!isNaN(kick) && Date.now() - kick > MATCH_LEN_HOURS * 3600 * 1000) {
      const rr = findResult(g);
      if (rr) { hs = rr.ft.h; as = rr.ft.a; }
    }
  }

  const hasScore = hs !== null && hs !== undefined && as !== null && as !== undefined;
  const fbStamp=Date.parse(String(FB && FB.updated || '').replace(' ','T')+'+08:00');
  const fbFresh=Number.isFinite(fbStamp) && Date.now()-fbStamp>=-300000 && Date.now()-fbStamp<=1800000;
  let kind = (fb && fbFresh && ['upcoming','live','finished'].includes(fb.kind)) ? fb.kind : (g.status || 'upcoming');

  /* 【已完场要有比分显示】用户 2026-10-17 追加。
     实测发现：归档（jc-history）里有些场次【还没开赛就被归档成了 finished】——
     10-18 那 33 场，时间都在「现在」之后，比分自然拿不到，
     于是卡片上就只能显示「—」，用户看到的就是"已完场没有比分"。
     正解不是编一个比分，而是【按开赛时间如实分档】：
       没比分 + 开赛时间还没到 → 它不是"已完场"，退回「未开赛」。
     这样「已完场」里剩下的每一场要么有比分，要么是真·记录缺失（会显示 — 并说明）。
     ⚠️ 只动【没有比分】的那些：有比分的归档一律保持 finished
        （有比分 = 确实踢完了，开赛时间写在未来只是数据源口径问题）。 */
  if (kind === 'finished' && !hasScore && g.time && String(g.time) > nowCN()) {
    kind = 'upcoming';
  }

  /* 判定结果 */
  let result = null;
  if (hasScore) {
    const actual = hs > as ? 'home' : (hs === as ? 'draw' : 'away');
    const actualLabel = actual === 'home' ? '主胜' : (actual === 'draw' ? '平局' : '客胜');
    /* ⚠️ 判据必须跟推荐类型配套（不败推荐：主胜或平 / 客胜或平 都算中），
       否则"不败"在平局时会被错判成黑。见上面的 recoHit()。 */
    const hit = recoHit(g.reco, actual);
    result = { actual, actualLabel, hit, score: `${hs} - ${as}`, settled: kind === 'finished' };
  }

  const officialLine=(JC_OFFICIAL&&JC_OFFICIAL.list||[]).find(function(x){return x.code===g.code&&String(x.time).slice(0,16)===String(g.time).slice(0,16);});
  const officialHandicap=officialLine&&officialLine.handicap!==undefined?officialLine.handicap:null;
  let marketAnalysis=null,effectiveReco=g.reco;
  if(kind==='upcoming'&&!hasScore&&!g.fromArchive&&!(g.reco&&g.reco.fromHistory)&&kickMs(g.time)>Date.now()&&MARKET_RULES){
    let poisson=null;try{poisson=POISSON&&POISSON.compute(g);}catch(e){}
    marketAnalysis=MARKET_RULES.analyze(Object.assign({},g,{handicap:officialHandicap}),{titan:TITAN,divergence:DIVERGENCE,bifa:MARKET_BIFA,poisson:poisson});
    if(marketAnalysis){effectiveReco=Object.assign({},g.reco,{pick:marketAnalysis.pick,label:marketAnalysis.label,prob:marketAnalysis.prob,confidence:marketAnalysis.confidence,type:'three'});}
  }
  return {
    gid: g.gid, code: g.code, league: g.league, round: g.round,
    time: g.time, handicap: g.handicap,
    home: g.home, away: g.away,
    minute: (fb && fb.minute !== undefined && fb.minute !== null) ? fb.minute : (g.minute || 0),
    odds: g.odds, reco: effectiveReco, marketAnalysis, officialHandicap, kind, hasScore, hs, as, result,
    asianIndex,
    /* 这场是从 jc-history 归档来的（不是本次在售）→ 卡片样式区分一下 */
    fromHistory: !!(g.reco && g.reco.fromHistory),
    /* 是不是归档来的（不管有没有 reco）—— 统计「已完场累积」时按它数 */
    archive: !!g.fromArchive
  };
}

/* 【关键】这里必须用合并后的 ALL_GAMES（在售 + 历史），
   否则「已完场」还是只有本次在售里完场的那几场，历史累积的不显示。
   【规则一】再按「比赛结束后 24 小时」筛一遍（只筛已完场，见上面的说明）。 */
const MATCHES_ALL = ALL_GAMES.map(prep);
const MATCHES = MATCHES_ALL.filter((m) => !finishedExpired(m));
/* 被 24 小时窗口挡掉的已完场（构建日志里报出来，便于核对） */
const FIN_EXPIRED = MATCHES_ALL.length - MATCHES.length;

/* 本次在售有多少场完场（和总数区分开，页面上会标） */
const JC_FINISHED = JC.games.filter((g) => (g.status || '') === 'finished').length;

/* ---------- 统计 ---------- */
const stat = {
  total: MATCHES.length,
  upcoming: MATCHES.filter((m) => m.kind === 'upcoming').length,
  live: MATCHES.filter((m) => m.kind === 'live').length,
  /* finished 含【历史累积】的场次 —— 这就是「已完场能累积」的关键 */
  finished: MATCHES.filter((m) => m.kind === 'finished').length,
  /* 其中这一次在售里完场的几场（其余是历史归档来的） */
  finishedToday: JC_FINISHED,
  /* 已完场里【归档来的】还有几场（24 小时窗口内的；窗口外的已经不在这里了） */
  history: MATCHES.filter((m) => m.archive).length,
  settled: 0, hit: 0, miss: 0
};
MATCHES.forEach((m) => {
  if (m.kind === 'finished' && m.result) {
    stat.settled++;
    if (m.result.hit) stat.hit++; else stat.miss++;
  }
});
stat.rate = stat.settled ? ((stat.hit / stat.settled) * 100).toFixed(1) : '0.0';

/* ---------- 「体彩竞彩在售 N 场」的那个 N ----------
   优先用体彩官网的数字（jc-official.js 的 inSale，build-jc-count.mjs 每小时抓）；
   拿不到就用本地竞彩数据算的 upcoming + live 兜底（和改动前完全一样）。
   注意 inSale 必须先确认是「数字本身或纯数字字符串」：
   Number(null) 是 0、Number('') 也是 0，直接 Number() 会把没值的
   jc-official.js 当成「在售 0 场」显示出去。 */
const rawInSale = JC_OFFICIAL ? JC_OFFICIAL.inSale : null;
const OFFICIAL = (typeof rawInSale === 'number' && Number.isFinite(rawInSale)) ||
  (typeof rawInSale === 'string' && /^\s*\d+\s*$/.test(rawInSale))
  ? Number(rawInSale) : null;
const IN_SALE = OFFICIAL === null ? (stat.upcoming + stat.live) : OFFICIAL;

/* ---------- 数据更新时间 ----------
   jc-data.updated 是「在售列表」的时间，jc-history.updated 是归档时间，
   页面上显示两者里较新的那个，免得页脚写着「更新于」却是几小时前的在售时间。 */
const LATEST_UPDATED = [JC.updated, HIST && HIST.updated]
  .filter(Boolean).sort().pop() || JC.updated || '';

/* ============================================================
   __FRESH_STAMP__ 数据新鲜度小字（晒票区 / 「在售 N 场」）
   ------------------------------------------------------------
   为什么要有它：这两块数据是【随本机文件同步】进页面的，文件不再更新，
   页面上的数字就一直停在最后一次同步的样子，用户关电脑之后【看不出来变旧】。
   所以要页面自己说一句「多久以前」：票面更新于 3 小时前 / 数据更新于 12 分钟前。
   ------------------------------------------------------------
   时间戳【全部从文件内容里读】，不读文件 mtime（云上构建时 mtime 是构建机的，
   和数据的真实时间无关）：
     · ① 票面 = football-tickets.js 顶层的 FB_TICKETS_UPDATED（抓取脚本写的）
     · ② 在售 = jc-official.js 顶层的 updated（抓不到不覆盖文件，所以它就是
                「最后一次成功」的时刻）
   两个字段的格式都是本机时区的 'YYYY-MM-DD HH:MM'。
   解析不出来 → 整句【不渲染】（绝不写「更新于 NaN」或编一个时间出来）。
   ------------------------------------------------------------
   三档：<2 小时 灰 · 2~12 小时 淡橙 · >12 小时 红（只换颜色，不改字号字重）。
   ============================================================ */
const FRESH_WARN_H = 2;      /* 2 小时起提示 */
const FRESH_STALE_H = 12;    /* 12 小时起明显提醒 */

/** 任意时间串 → 毫秒；认不出返回 0 */
function stampMs(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return 0;
  let t = Date.parse(s);                                    /* ISO（带 T / Z）走这里 */
  if (!isFinite(t)) t = Date.parse(s.replace(/-/g, '/'));   /* 'YYYY-MM-DD HH:MM' 走这里（项目通用写法） */
  return isFinite(t) ? t : 0;
}

/** 距今多久 →「12 分钟前」/「3 小时前」/「2 天前」；未来时间当「刚刚」 */
function agoText(ms) {
  const min = Math.floor(Math.max(0, Date.now() - ms) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + ' 分钟前';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + ' 小时前';
  return Math.floor(hr / 24) + ' 天前';
}

/** 新鲜度档位：ok（<2h 灰）/ warn（2~12h 淡橙）/ stale（>12h 红） */
function freshTier(ms) {
  const hr = (Date.now() - ms) / 3600000;
  if (hr < FRESH_WARN_H) return 'ok';
  if (hr < FRESH_STALE_H) return 'warn';
  return 'stale';
}

/** 渲染成一句小字（label = 「票面」/「数据」）；时间解析不出来 → 空串 */
function freshStampHtml(label, raw) {
  const ms = stampMs(raw);
  if (!ms) return '';
  return `<span class="fresh fresh-${freshTier(ms)}">${esc(label)}更新于 ${agoText(ms)}</span>`;
}

/* ① 晒票区的时间：football-tickets.js 有条目落进 72 小时窗口 → 用它；
   一条都没落进来（整块只剩另一路）→ 用两路合并后的较新时间，
   免得报一个跟画面上的票毫无关系的旧时间。 */
const TICKETS_STAMP = JC_XYSP.items.some((it) => it && it.src === 'fb')
  ? (FB_UPDATED || JC_XYSP.updated)
  : (JC_XYSP.updated || FB_UPDATED);
const TICKETS_STAMP_HTML = freshStampHtml('票面', TICKETS_STAMP);

/* ② 「在售 N 场」的时间：jc-official.js 顶层的 updated（官方那份时间作兜底） */
const INSALE_STAMP = (JC_OFFICIAL && (JC_OFFICIAL.updated || JC_OFFICIAL.officialUpdate)) || '';
const INSALE_STAMP_HTML = freshStampHtml('数据', INSALE_STAMP);

const recoDist = { home: 0, draw: 0, away: 0, none: 0 };
MATCHES.forEach((m) => { if (m.reco) recoDist[m.reco.pick]++; else recoDist.none++; });

/* ---------- 【推荐串 · 红黑统计】来自 jc-reco-archive.js 存档 ----------
   口径（用户 2026-10-17 明确要求）：【按单场判定】，不是按整串 ——
     原话「按单场判定（用户设计里每行是一场），不是按整串」。
     · red   = 已完场且推荐选项命中的【场次数】
     · black = 已完场且没中的【场次数】
     · rate  = red / (red + black)；一场都没结算 → null（页面显示"—"）
     · pending = 还没打完的【组数】（一批里只要还有一场没结算就算一组）
                页面备注写「还有 K 组没打完」/ K=0 时写「实时更新」
   ⚠️【修 bug】这里原来是自己写的一段【整串口径】循环（miss===0 才 red++）：
      于是「推荐串 3 场全中」只算成 1 红，用户看到的数字比实际少。
      现在统一走内核 matchStats()，和 jc-reco-stats.mjs 的口径完全一致。
   ⚠️ 绝不把待定当黑、也绝不用 0 冒充"算过了"（统计不到就显示"暂未开始统计"）。 */
let REC_STAT = null;
let REC_ROWS_ARCHIVE = [];
/* ============================================================
   【推荐串 · 显示规则】用户 2026-10-17 追加（原话）：
     「推荐串前后24小时自动比对不要还没比赛结果的.
      只留下48小时内推荐过的结果（这里抓48小时的）」
   ------------------------------------------------------------
   ① 只显示【已经出结果】的批次 —— 还没打完的整批不显示，
      页面上不会再出现一排「待」；「还有 N 组没打完」仍然在上面那条
      战绩条里提示（那是用户之前要的，保留）。
   ② 窗口 24 → 36 小时：按【推荐时间】(batch.at) 算，
      只留「现在 - 36 小时 ~ 现在」之间推荐的。
   ⚠️ 「有没有结果」用内核算出来的 verdict（红 / 黑）判断，
      不在这里另写一套判据；待定（verdict 为空）= 还有比赛没打完 → 不显示。
   ⚠️ 36 小时这个数必须和 jc-reco-archive.js 的 RECO_KEEP_HOURS 一致，
      否则会出现「存档里留了 36 小时、页面只显示 24 小时」或者反过来。
   ============================================================ */
const REC_ARCH_HOURS = 36;   /* 用户 2026-10-18：36 小时（内核 RECO_KEEP_HOURS 必须一致） */
/** 这批推荐是不是「近 36 小时内推的」（认不出时间 → 保留，宁可多显示） */
function recArchInWindow(b) {
  const t = Date.parse(String((b && b.at) || '').replace(/-/g, '/'));
  if (!isFinite(t)) return true;
  const span = REC_ARCH_HOURS * 3600 * 1000;
  return t >= Date.now() - span && t <= Date.now() + 60000;
}
/** 这批是不是已经有结果（红 / 黑）—— 待定（还有比赛没打完）不算 */
const recArchDecided = (b) => {
  const v = b && b.verdict;
  return v === '红' || v === '黑';
};
/* 窗口内、但还没打完的批次数（空态文案和构建日志用，不进详情列表） */
let REC_ARCH_PENDING = 0;
/* 【30 秒实时刷新用】存档的时间戳 = 判断"这份数据比页面里那份新"的依据 */
const RECO_STAMP = (JC_RECO && JC_RECO.updated) || '';
/* 【30 秒实时刷新用】往期比对列表的【内层】HTML —— 由 renderRec() 渲染时顺手存下来，
   给 jc-reco-view.js 复用（保证页面内和刷新后是【同一套渲染】，不写第二份渲染逻辑） */
let REC_ARCH_INNER = '';
/* 【30 秒实时刷新用】「推荐」在售那一块的两样东西（用户 2026-10-18 反馈这块从来没刷过）：
     · REC_COUNT_TEXT = 入口行副标题「在售 · 信心 ≥58% · N 场」
     · REC_ROWS_INNER = 每场比赛那一行（.m-recrow）的 HTML
   刷新脚本只换这两样，summary / tips / note / <details> 的 open 状态一律不碰。 */
let REC_COUNT_TEXT = '';
let REC_ROWS_INNER = '';
if (JC_RECO && Array.isArray(JC_RECO.batches) && RECO_KERNEL) {
  /* 【先筛批，再统计】用户 2026-10-18：「我举得没有这么多场次黑」——
     之前是【单场口径】（一场没中就 +1 黑），玩家看的是【整组】：一批 3 场全中才算 1 红，
     有一场没中就是 1 黑。所以现在改用内核的 summarize()（verdictOf 判整组）出红黑。
     筛选规则不变：每批 rows 只留信心 ≥58 的；整批一场不剩就丢掉；再按 48 小时窗口。
     ⚠️ 58 用字面量：REC_MIN 的 const 声明在文件后面，直接引用会踩 TDZ。 */
  const REC_MIN_CONF = 58;
  const winBatches = JC_RECO.batches
    .map((b) => Object.assign({}, b, {
      rows: (Array.isArray(b.rows) ? b.rows : []).filter((r) => r.conf != null && r.conf >= REC_MIN_CONF)
    }))
    .filter((b) => b.rows.length)
    .filter(recArchInWindow);

  /* 用户原话（2026-10-18）：「你不是抓取 36 小时内信心 ≥58% 的完场单吗」
     → 按【场次】算（一场一条），不是按整批。窗口 36 小时，门槛 ≥58%。
     ⚠️ 58 用字面量：REC_MIN 的 const 声明在文件后面，直接引用会踩 TDZ。 */
  const MS = RECO_KERNEL.matchStats({ batches: winBatches }, { min: 58 });
  REC_STAT = {
    batches: MS.batches, rows: MS.rows,
    red: MS.red, black: MS.black,
    pending: MS.unfinished,
    pendingMatches: MS.pendingMatches,
    decided: MS.decided,
    rate: MS.rate == null ? null : Number(MS.rate).toFixed(1),
    updated: JC_RECO.updated || ''
  };
  REC_ARCH_PENDING = winBatches.filter((b) => !recArchDecided(b)).length;
  /* 详情：按存档时间倒序（最近的一期在最上面） */
  /* 用户 2026-10-18：「没结算的也加进来」+「按日期分组」→ 这里不再过滤已结算 */
  REC_ROWS_ARCHIVE = winBatches
    .slice()
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

/* ============================================================
   __JC_HIT_MQ__ 顶部小喇叭 · 横向滚动播报命中率（用户 2026-10-17 追加）
   ------------------------------------------------------------
   用户原话：「同时这里也有一个小喇叭.横向滚动通告推荐串的命中率百分比」
             「喇叭都要横向」
   播的数字【全部来自上面已经算好的统计】，一个都不另算、更没有一个写死：
     · 推荐串战绩 = REC_STAT（和「推荐串战绩」那条**同一个数**）
     · 完场战绩   = stat.hit / stat.miss / stat.rate（和「完场战绩」同一条）
     · 还有几组没打完 = REC_STAT.pending
   ⚠️ 用户 2026-10-17 追加：「竞彩喇叭不要写近48小时.就写推荐串就好了」
      → 喇叭里【不出现任何"N 小时"】字样，只写
        「推荐串：红 X 黑 Y · 命中率 Z%」「完场战绩：红 A 黑 B · 命中率 C%」。
        窗口小时数（REC_ARCH_HOURS / FIN_KEEP_HOURS）照旧参与计算，只是不写在喇叭上。
   ⚠️ 用户 2026-10-17：「竞彩喇叭是推荐竞彩的，彩票移到彩票那边去」
      → 喇叭里【不再有彩票的中奖播报】（详见下面 BC_JSON_ITEMS 那段说明）。
   横向滚动 = 轨道 .m-mq-track 上纯 CSS 的 translateX(0 → -50%)（见 CSS 里的
   jc-mq-roll）；轨道里放两份一模一样的内容，退一半正好接上 → 无缝左右循环。
   ⚠️ 一条统计都没有 → 显示「暂无命中率统计」，绝不编数字。
   ============================================================ */
const MQ_ITEMS = (() => {
  const out = [];
  if (REC_STAT && REC_STAT.rate != null) {
    out.push(`<span class="m-mq-item mq-gold">推荐串：` +
      `<b>红 ${REC_STAT.red}</b> 黑 ${REC_STAT.black} · 命中率 <i>${REC_STAT.rate}%</i></span>`);
  }
  if (stat.settled) {
    out.push(`<span class="m-mq-item">完场战绩：` +
      `<b>红 ${stat.hit}</b> 黑 ${stat.miss} · 命中率 <i>${stat.rate}%</i></span>`);
  }
  if (REC_STAT && REC_STAT.pending) {
    out.push(`<span class="m-mq-item">推荐串还有 <b>${REC_STAT.pending}</b> 组没打完 · 未出结果先不列出</span>`);
  }
  return out.length ? out : ['<span class="m-mq-item">暂无命中率统计</span>'];
})();
const MQ_ITEMS_HTML = MQ_ITEMS.join('');
/* 滚动速度按文字长度估（中文字宽 ~11.5px、数字字母 ~6.4px），约 36px/秒；限 12~40 秒 */
const MQ_TEXT = MQ_ITEMS_HTML.replace(/<[^>]*>/g, '');
const MQ_PX = [...MQ_TEXT].reduce((n, ch) => n + (/[\x00-\xff]/.test(ch) ? 6.4 : 11.5), 0);
const MQ_DUR = Math.min(40, Math.max(12, Math.round(MQ_PX / 36)));
/* 【结构对齐用户 2026-10-17 给的播报条】
     <div class="broadcast-bar" id="broadcastBar">
       <div class="horn-icon">📢</div>
       <div class="broadcast-content"><div class="marquee" id="marqueeText">…</div></div>
     </div>
   两套类名同时挂着（broadcast-bar/horn-icon/broadcast-content/marquee + 原有的 m-mq*），
   这样他给的 CSS 能直接选中，页面原有动画/暂停/减少动效逻辑也照旧生效。
   ⚠️ 内容仍然是【页面上已经算好的数字】，不是「中奖播报」——
      这个页面没有中奖数据，绝不编；没有数字可播时才显示「暂无最新播报」。 */
const MQ_INNER = MQ_ITEMS_HTML || `<span class="m-mq-item">暂无最新播报</span>`;
/* 【后台数据 → 页面内嵌 JSON】用户 2026-10-17 给的写法是
     fetch('./data/broadcast.json') + document.getElementById('marqueeText').textContent = ...
   但本项目的页面在 App 里是 file:// 打开的 —— file:// 下 fetch 同目录文件会被 CORS 拦死
   （这条之前踩过，所以晒票/推荐串的实时刷新都是 <script src> 轮询，不是 fetch）。
   等价做法（同样"后台生成、前端读取"）：构建时把这份数组写成页面里的
     <script type="application/json" id="broadcastData">[{ "text": "…" }, …]</script>
   页面端的 loadBroadcast() 读它 → 与 fetch json 的效果一致，但没有 CORS 问题、也没有额外请求。
   ⚠️ 内容是页面上真实的统计（命中率/红黑），不是「中奖」——这个页面没有中奖数据，绝不编。
   ⚠️ JSON 放在 <script> 里必须把 < 转义，否则出现 </script> 会截断页面。 */
const BC_JSON_ITEMS = (() => {
  const items = [];
  /* 【彩票不进竞彩页喇叭】用户 2026-10-17 两次确认：
       「竞彩喇叭是推荐竞彩的，彩票移到彩票那边去」
       「彩票喇叭里面内容写 推荐号命中xxx等奖就行了，不用写中了多少号」
     —— 所以这里【不再】塞号池对开奖的中奖播报（原先第一条就是
        「推荐号池命中二等奖（… 个基本号中 6 个）」：既不是竞彩、
        又在写"中了几个号"）。彩票的中奖播报只在只读分享版的
        「中奖播报」喇叭里播，格式是「推荐号命中X等奖 / 组选命中」。
     竞彩页喇叭只播竞彩自己的战绩：推荐串红黑/命中率、完场战绩、还有几组没打完。 */
  for (const h of MQ_ITEMS) items.push({ text: h.replace(/<[^>]*>/g, '').trim() });
  return items;
})();
const BC_JSON = JSON.stringify(BC_JSON_ITEMS)
  .replace(/</g, '\\u003c');
const HIT_MQ_HTML = `<script type="application/json" id="broadcastData">${BC_JSON}</script>` +
  `<div class="m-mq broadcast-bar" id="broadcastBar">` +
  `<div class="m-mq-ico horn-icon" aria-hidden="true">📢</div>` +
  `<div class="m-mq-view broadcast-content">` +
  `<div class="m-mq-track marquee" id="marqueeText" style="animation-duration:${MQ_DUR}s">` +
  `<div class="m-mq-group">${MQ_INNER}</div>` +
  `<div class="m-mq-group" aria-hidden="true">${MQ_INNER}</div>` +
  `</div></div></div>`;

/* ============================================================
   模拟计算器 · 数据准备（页面上的 SP 赔率）
   ------------------------------------------------------------
   【赔率来源】体彩官网 webapi.sporttery.cn（getMatchCalculatorV1）的
   【官方 SP 原值】：had = 胜平负（主胜/平/客胜）、hhad = 让球胜平负（让球数 + 三项）。
   由 build-jc.mjs 抓到后写进 jc-data.js 顶层的 sp 块 —— 本机可抓，
   云端（美国 IP）抓不到时 build-jc.mjs 会沿用上一次那份（source='carried'）。
   这里【原样使用】：不换算、不估算、不编数字。没有 sp 就显示「暂无」。

   【可试算的场次】
     · 必须有官方 SP（had 或 hhad）
     · 已完场的去掉（竞彩开赛前就停售，完场更不能投注）
     · SP 是「沿用上次」的（可能已过几小时）→ 再剔掉已过开赛时间的
   ============================================================ */
const SP = (JC && JC.sp && Array.isArray(JC.sp.list) && JC.sp.list.length) ? JC.sp : null;
/* 【页面可见文字】来源说明：只显示「体彩官网官方 SP」。
   ⚠️ 用户要求【不显示抓取时间】—— 页面上不出现「（抓取于 …）」。
   抓取时间仍然存在 jc-data.js 的 sp.updated 里（数据没丢，只是不上页面），
   构建日志里另外用 SP_SRC_LOG 打出来，方便排查。 */
const SP_SRC_CN = SP ? '体彩官网官方 SP' : '暂无官方 SP 数据';
const SP_SRC_LOG = !SP
  ? '暂无官方 SP 数据'
  : (SP.source === 'official'
    ? `体彩官网官方 SP（抓取于 ${SP.updated || '—'}）`
    : SP.source === 'carried'
      ? `体彩官网官方 SP（沿用上次抓取 ${SP.updated || '—'}）`
      : '暂无官方 SP 数据');

const NOW_MS = Date.now();
function kickMs(t) {
  const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(t || ''));
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

/* 本次【在售列表】(jc-data) 里每场的状态：编号@日期 → status。
   ⚠️ 只认在售列表，【不认】历史归档 —— 归档记录是「从在售列表消失」就记下来的，
   没有终场比分的那种（比赛还没开踢）也会被标成 finished，
   用它来判「这场不能投注」会把还在官方在售的比赛误删。
   （编号每天复用，所以必须带上日期一起比。） */
const JC_SALE_STATUS = new Map();
JC.games.forEach((g) => {
  if (g && g.code) JC_SALE_STATUS.set(`${g.code}@${dayOf(g.time)}`, g.status || 'upcoming');
});

const CALC_ROWS = (SP ? SP.list : []).filter((r) => {
  if (!r || !(r.had || r.hhad)) return false;
  /* 本次在售里明确已经完场的 → 不能投注，剔掉 */
  if (JC_SALE_STATUS.get(`${r.code}@${dayOf(r.time)}`) === 'finished') return false;
  if (SP.source === 'carried') {
    const t = kickMs(r.time);
    if (!isNaN(t) && t <= NOW_MS) return false;   /* 已开赛 → 竞彩已停售 */
  }
  return true;
}).map((r) => ({
  code: r.code || '', league: r.league || '', time: r.time || '',
  home: r.home || '', away: r.away || '',
  had: r.had ? { h: r.had.h, d: r.had.d, a: r.had.a } : null,
  hhad: r.hhad ? { line: r.hhad.line || '', h: r.hhad.h, d: r.hhad.d, a: r.hhad.a } : null
}));

/* ---------- 渲染 ---------- */
function oddsRow(label, v, pickKey) {
  if (!v) return '';
  const cell = (txt, on) => (txt === null || txt === undefined || txt === '')
    ? '' : `<span class="m-ov${on ? ' on' : ''}">${esc(txt)}</span>`;
  return `<div class="m-odds"><span class="m-ol">${label}</span>${cell(v.a, false)}${cell(v.b, pickKey === 'b')}${cell(v.c, pickKey === 'c')}</div>`;
}

/* ============================================================
   亚指综合换算卡片
   ------------------------------------------------------------
   · 真拿到「上盘真实资金占比 fundUp」时：结论标签 + 热度文案 + 理论/真实资金 + 偏差
   · 没拿到时（【当前就是这种】）：【整块不显示热度推演】，只显示由真实水位
     换算出来的「水位隐含 · 理论均衡占比」+ 走水判定，并如实标注数据缺失 ——
     不显示任何编造的数字。
   【合规】带「仅娱乐参考」；标签只用中性词（爆冷 / 输盘 / 赢盘 / 走水机会 / 胜负难分）。
   ============================================================ */
const devNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
function devCls(v) {
  const n = devNum(v);
  if (n === null) return '';
  return n > 0 ? 'up' : (n < 0 ? 'down' : '');
}
function devText(v) {
  const n = devNum(v);
  if (n === null) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}

function renderAsianCard(m) {
  if (!AI || typeof AI.asianIndexView !== 'function') return '';
  let ai = null;
  try { ai = AI.asianIndexView(m.asianIndex); } catch (e) { return ''; }
  if (!ai) return '';            /* 没有亚指数据 → 整块不显示 */

  const head =
    `<div class="m-ai-head">` +
    `<span class="m-ai-title">亚指综合换算</span>` +
    (ai.hasFund && ai.conclusionTag ? `<span class="m-ai-tag">${esc(ai.conclusionTag)}</span>` : '') +
    `<span class="m-ai-fun">仅娱乐参考</span>` +
    `</div>`;

  const line =
    `<div class="m-ai-line">盘口 ${esc(ai.line)}（${esc(ai.fromText)}）· ${esc(ai.handicapText)}` +
    ` · 上盘 ${esc(ai.upSideText)} · 上 ${esc(ai.upWater)} / 下 ${esc(ai.downWater)}` +
    ` · ${esc(ai.canWaterText)}</div>`;

  const change = ai.changeType
    ? `<div class="m-ai-change"><span class="m-ai-change-tag">${esc(ai.changeType)}</span>` +
      `<span class="m-ai-change-d">${esc(ai.changeDetail)}</span></div>`
    : '';

  let grid = '';
  if (ai.hasFund) {
    grid =
      `<div class="m-ai-grid">` +
      `<span class="m-ai-cell"><i>理论上盘资金</i><b>${esc(ai.theoryUp)}%</b></span>` +
      `<span class="m-ai-cell on"><i>真实上盘资金</i><b>${esc(ai.fundUp)}%</b></span>` +
      `<span class="m-ai-cell"><i>理论下盘资金</i><b>${esc(ai.theoryDown)}%</b></span>` +
      `<span class="m-ai-cell on"><i>真实下盘资金</i><b>${esc(ai.fundDown)}%</b></span>` +
      `</div>` +
      `<div class="m-ai-dev"><span class="m-ai-dev-v ${devCls(ai.devUp)}">偏差 ${devText(ai.devUp)}</span>` +
      `<span class="m-ai-dev-u">（上盘真实 − 理论上盘）</span></div>` +
      (ai.hotText ? `<div class="m-ai-hot">${esc(ai.hotText)}</div>` : '') +
      (ai.fundUpSource ? `<div class="m-ai-src">资金占比来源：${esc(ai.fundUpSource)}</div>` : '');
  } else {
    grid =
      `<div class="m-ai-grid">` +
      `<span class="m-ai-cell"><i>水位隐含 · 理论上盘</i><b>${esc(ai.theoryUp)}%</b></span>` +
      `<span class="m-ai-cell"><i>水位隐含 · 理论下盘</i><b>${esc(ai.theoryDown)}%</b></span>` +
      `</div>`;
  }

  const miss = ai.missingText ? `<div class="m-ai-miss">${esc(ai.missingText)}</div>` : '';
  const note = ai.note ? `<div class="m-ai-note">${esc(ai.note)}</div>` : '';

  return `<div class="m-ai">${head}${line}${change}${grid}${miss}${note}</div>`;
}

/* 【泊松指数】比赛卡片里的一块（用户队列⑥）
   ------------------------------------------------------------
   数据：odds.europe（欧指）+ odds.overunder（大小盘）→ 反推期望进球 λ。
   算不出来（缺欧指）就【整块不显示】，绝不填假数。
   ⚠️ 页面上写明「由欧指反推 · 非官方数据」，并显示拟合偏差与平局偏差，
      不让人误以为这是博彩公司公布的泊松值。 */
/* ============================================================
   【胜平负 EV（期望值）】用户 2026-10-17：「新增 EV 值展示区」
   ------------------------------------------------------------
   公式（用户定的，标准 EV）：EV = 模型概率 × 赔率 − 1，按百分比显示。
     例：主胜 50.2% × 1.86 − 1 = -6.6% → 负数是"期望亏损"，正数是"期望盈利"
   数据来源：概率 = reco.prob（build-jc.mjs 从欧赔反推的那三个）
             赔率 = 同一张卡片上「欧赔」那三个数（euV）
   缺概率或缺赔率 → 显示 —，绝不编数。
   ============================================================ */
function evOf(pctVal, oddsVal) {
  const p = parseFloat(pctVal);
  const o = parseFloat(oddsVal);
  if (!isFinite(p) || !isFinite(o) || o <= 0) return null;
  return (p / 100) * o - 1;                     /* 小数：-0.0663 = -6.63% */
}
function renderEvRow(r, euV) {
  if (!r || !euV) return '';
  /* 【对齐用户 2026-10-17 给的参考实现】
     类名用他那套：.ev-title / .ev-items / .ev-item.positive|negative
     公式也用他的：EV = ((p/100) * odds - 1) * 100
       > 0 → positive（红 + 带 + 号）
       ≤ 0 → negative（灰）
     缺概率或缺赔率 → 显示 —，不编数。
     ⚠️ 和外层 .m-ev 的组合：.m-ev 只负责底色/边框（米杏浅色主题那块），
        里面这三块用他的类名，方便他以后直接套自己的 CSS。 */
  const calc = (p, o) => {
    const pp = parseFloat(p), oo = parseFloat(o);
    if (!isFinite(pp) || !isFinite(oo) || oo <= 0) return null;
    return ((pp / 100) * oo - 1) * 100;
  };
  const fmt = (lab, p, o) => {
    const v = calc(p, o);
    if (v == null) return `<span class="ev-item negative">${lab} —</span>`;
    const num = parseFloat(v.toFixed(1));
    return `<span class="ev-item ${num > 0 ? 'positive' : 'negative'}">` +
      `${lab} ${num > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
  };
  return `<div class="m-ev">` +
    `<span class="ev-title">胜平负 EV</span>` +
    `<div class="ev-items">` +
    fmt('主', r.prob && r.prob.home, euV.home) +
    fmt('平', r.prob && r.prob.draw, euV.draw) +
    fmt('客', r.prob && r.prob.away, euV.away) +
    `</div></div>`;
}

/* ============================================================
   【比分推荐 · 3 个】用户 2026-10-17 追加：竞彩卡片上给三个推荐比分
   ------------------------------------------------------------
   怎么算（和详情页那个「泊松指数」是同一条路，口径统一）：
     · 内核 = jc-poisson.js 的 compute(m)，本页已有的模块，不新增算法
     · 它用欧赔/亚盘/大小球反解两队的期望进球 λ主 / λ客（solveLambdas），
       再按【独立泊松】P(i;λ主)·P(j;λ客) 算每个比分的概率
     · 这里取概率最高的【三个】比分，按概率从高到低排
   如实说明（页面上也写着）：λ 是市场赔率反推的、不是真泊松模型拟合；
     独立泊松会略低估平局 —— 所以叫「参考」，不叫预测。
   ⚠️ 拿不到赔率的场次（prob 为空 / 归档老记录）→ 内核返回 null
      → 这一行显示「—」，绝不编数字。
   ⚠️ 页面上不出现任何"数据从哪来"的字样（站名 / 文件名 / 接口都不写），
      由 source-guard.mjs 的留痕断言兜底。
   ============================================================ */
const POISSON_CACHE = new Map();
function poissonOf(m) {
  if (!POISSON || typeof POISSON.compute !== 'function') return null;
  if (POISSON_CACHE.has(m.code)) return POISSON_CACHE.get(m.code);
  let r = null;
  try { r = POISSON.compute(m); } catch (e) { r = null; }
  POISSON_CACHE.set(m.code, r);
  return r;
}

function renderScorePick(m) {
  const r = poissonOf(m);
  const top = r && Array.isArray(r.topScores) ? r.topScores.slice(0, 3) : [];
  if (!top.length) {
    /* 没数据就如实显示 —（不编、不留空） */
    return `<div class="m-scorepick">` +
      `<span class="m-sp-lab">比分推荐</span>` +
      `<span class="m-sp-none">—</span>` +
      `<span class="m-sp-note">这一场没有可用的赔率，算不出比分</span>` +
      `</div>`;
  }
  return `<div class="m-scorepick">` +
    `<span class="m-sp-lab">比分推荐</span>` +
    `<span class="m-sp-list">` +
    top.map((s) => {
      /* 内核给的是 '2-1' 写法，这里统一成用户要的 '2:1' */
      const score = String(s.score).replace('-', ':');
      return `<span class="m-sp-item"><b>${esc(score)}</b><i>${esc(String(s.p))}%</i></span>`;
    }).join('') +
    `</span>` +
    `<span class="m-sp-note">按赔率反推的期望进球算</span>` +
    `</div>`;
}

function renderPoissonCard(m) {
  if (!POISSON || typeof POISSON.compute !== 'function') return '';
  let r = null;
  try { r = POISSON.compute(m); } catch (e) { return ''; }
  if (!r) return '';                       /* 数据不全 → 整块不显示 */

  const pct = (v) => (v == null ? '—' : v.toFixed(1) + '%');
  const head =
    `<div class="m-ps-head">` +
    `<span class="m-ps-title">泊松指数</span>` +
    `<span class="m-ps-src">${r.source === 'live' ? '即时盘' : '开盘'}反推</span>` +
    `<span class="m-ps-fun">非官方数据</span>` +
    `</div>`;

  const line =
    `<div class="m-ps-line">期望进球 主 <b>${r.lambdaHome}</b> · 客 <b>${r.lambdaAway}</b>` +
    ` · 合计 <b>${r.lambdaTotal}</b></div>`;

  const grid =
    `<div class="m-ps-grid">` +
    `<span class="m-ps-cell"><i>主胜</i><b>${pct(r.poisson.home)}</b><em>${pct(r.market.home)}</em></span>` +
    `<span class="m-ps-cell"><i>平</i><b>${pct(r.poisson.draw)}</b><em>${pct(r.market.draw)}</em></span>` +
    `<span class="m-ps-cell"><i>客胜</i><b>${pct(r.poisson.away)}</b><em>${pct(r.market.away)}</em></span>` +
    `</div>`;

  const ou = r.overunder
    ? `<div class="m-ps-line">大小 ${esc(String(r.overunder.line))}：` +
      `模型 大 <b>${pct(r.overunder.poisson.over)}</b> / 小 <b>${pct(r.overunder.poisson.under)}</b>` +
      ` · 市场 ${pct(r.overunder.market.over)} / ${pct(r.overunder.market.under)}</div>`
    : '';

  const top = r.topScores && r.topScores.length
    ? `<div class="m-ps-scores">最可能比分 ` +
      r.topScores.slice(0, 3).map((s) => `<span>${esc(s.score)} <b>${s.p}%</b></span>`).join('') +
      `</div>`
    : '';

  /* 如实暴露模型局限：拟合偏差 + 平局偏差（独立泊松会低估平局） */
  const note =
    `<div class="m-ps-note">大号字＝泊松算出的、小号字＝市场去水后的值` +
    ` · 拟合偏差 ${r.fitError}pp` +
    ` · 平局偏差 ${r.drawBias > 0 ? '+' : ''}${r.drawBias}pp（独立泊松会略低估平局）` +
    ` · 仅娱乐参考</div>`;

  return `<div class="m-ps">${head}${line}${grid}${ou}${top}${note}</div>`;
}

/* 【欧赔对比 + 分歧】比赛卡片里的一块（用户 2026-10-17 要求）
   ------------------------------------------------------------
   ⚠️ 算法口径照抄 build-match.mjs 的 renderDivergence：
      分歧 = 各家【即时】欧赔逐方向算 cv = 标准差 ÷ 均值
      （用 cv 不用标准差：主胜 1.5 与客胜 8.0 的标准差天然差几倍）
      档位 cv < 3.0% 低 · 3.0%~5.5% 中 · ≥ 5.5% 高
   ⚠️ 文案里不写数据源名 / 文件名（项目硬性规则）。
   ⚠️ 12 家明细平铺（整卡是 <a>，内部不能放可点击的折叠控件）。 */
function renderMultiCard(m) {
  const code = String(m.code || '');
  const tt = (TITAN && TITAN.games) ? TITAN.games[code] : null;
  const dd = (DIVERGENCE && DIVERGENCE.games) ? DIVERGENCE.games[code] : null;
  if (!tt && !dd) return '';                 /* 两样都没有 → 整块不显示 */

  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const lvName = (lv) => (lv === '低' || lv === '中' || lv === '高') ? lv : '';
  const lvCls = (lv) => lv === '低' ? 'lo' : (lv === '高' ? 'hi' : 'mi');
  /* cv 在数据里是小数（0.046 = 4.6%），和详情页一样 ×100 显示 */
  const cvPct = (v) => { const n = num(v); return n === null ? '—' : (Math.round(n * 10000) / 100) + '%'; };

  /* 【去掉了 12 家明细】用户 2026-10-17：「卡片上只留分歧 3 档 + 各家区间 + 公司家数」。
     12 家逐家明细占 ~293px/卡 × 64 张 = +18.8k px，页面到 69061px 太高，
     而且比赛详情页本来就有完整的 12 家明细 —— 那里看不挤。
     所以这里标题也跟着改成「欧赔分歧」（明细没了就不再叫"对比"）。 */
  const head =
    `<div class="m-mc-head">` +
    `<span class="m-mc-title">欧赔分歧</span>` +
    `<span class="m-mc-sub">${dd && dd.companies ? dd.companies + ' 家公司 · 即时盘' : '即时盘'}</span>` +
    `<span class="m-mc-fun">仅娱乐参考</span>` +
    `</div>`;

  /* ---- 分歧：三方向档位 + 变异系数 ---- */
  let dv = '';
  if (dd && dd.live) {
    const dirs = [['主胜', 'home'], ['平局', 'draw'], ['客胜', 'away']];
    dv = `<div class="m-dv">` +
      dirs.map(([label, k]) => {
        const d = dd.live[k];
        if (!d) return '';
        return `<span class="m-dv-i"><i>${label}</i>` +
          (lvName(d.level) ? `<b class="${lvCls(d.level)}">${lvName(d.level)}</b>` : '') +
          `<em>${cvPct(d.cv)}</em></span>`;
      }).join('') +
      `</div>`;
    /* 【去掉了重复的家数行】原来这里还有一行 "N 家公司参与统计 · 分歧＝…"，
       但标题上已经写了 "N 家公司 · 即时盘"、末尾也讲了算法 —— 重复，去掉。 */
  }

  /* ---- 即时赔率的区间（"对比"最直观的一眼）---- */
  let rng = '';
  if (tt && tt.eu) {
    const keys = Object.keys(tt.eu);
    const pick = (idx) => {
      const vals = keys.map((k) => (Array.isArray(tt.eu[k].l) ? num(tt.eu[k].l[idx]) : null)).filter((v) => v !== null);
      if (vals.length < 2) return null;
      return { lo: Math.min.apply(null, vals), hi: Math.max.apply(null, vals) };
    };
    const a = pick(0), b = pick(1), c = pick(2);
    if (a || b || c) {
      const f = (o) => o ? `${o.lo.toFixed(2)}~${o.hi.toFixed(2)}` : '—';
      rng = `<div class="m-mc-rng">各家区间 主 <b>${f(a)}</b> · 平 <b>${f(b)}</b> · 客 <b>${f(c)}</b></div>`;
    }
  }

  /* 说明只讲分歧的算法（返还率那段随明细一起去掉了）。
     口径照抄 build-match.mjs：用 cv 不用标准差 —— 主胜 1.5 与客胜 8.0 的
     标准差天然差几倍，只有变异系数（除以均值）才可比。 */
  const note = `<div class="m-mc-note">分歧＝各家【即时】欧赔的变异系数 cv（标准差÷均值）` +
    ` · 低<3% / 中3~5.5% / 高≥5.5% · 越大＝各家公司看法越不一致 · 仅娱乐参考</div>`;

  return `<div class="m-mc">${head}${dv}${rng}${note}</div>`;
}

function renderSixOutcomes(m){
 const a=m.marketAnalysis||{},regular=a.prob||(m.reco&&m.reco.prob),h=a.handicap;
 const options=['home','draw','away'];
 function group(labels,prob,pick,scale){return options.map(function(k,i){const value=prob&&Number.isFinite(Number(prob[k]))?(Number(prob[k])*scale).toFixed(1)+'%':'暂无';return '<div class="m-six-option'+(pick===k?' chosen':'')+'" style="border:1px solid '+(pick===k?'#19895d':'#e7d6b9')+';border-radius:8px;padding:7px;text-align:center;background:'+(pick===k?'#e9f6ec':'#fffaf1')+'"><b>'+labels[i]+'</b><div>'+value+'</div>'+(pick===k?'<small>推荐方向</small>':'')+'</div>';}).join('');}
 const pick=regular?options.slice().sort((x,y)=>regular[y]-regular[x])[0]:null;
 return '<div class="m-six" style="margin:9px 0;padding:10px;border:1px solid #e7d6b9;border-radius:9px"><b>六项参考推荐</b><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:7px">'+group(['胜','平','负'],regular,pick,1)+group(['让胜','让平','让负'],h&&h.prob,h&&h.pick,100)+'</div><small>'+(h?'官方竞彩让球 '+(h.line>0?'+':'')+h.line:'官方竞彩让球数或比分模型不足，让球三项暂不推荐')+' · 两种玩法分别判断，参考概率不保证赛果。</small></div>';
}

function renderMarketRules(m){
 const a=m.marketAnalysis;if(!a)return '';
 const h=a.handicap;
 return '<details class="m-rule-analysis"><summary>综合研判 · 胜平负 / 让球胜平负</summary><div class="m-rule-body">'+
 '<p><b>胜平负参考：'+esc(a.label)+'</b></p>'+
 (h?'<p><b>官方让球 '+(h.line>0?'+':'')+h.line+'：'+esc(h.label)+'</b> · '+['home','draw','away'].map(function(k,i){return ['让胜','让平','让负'][i]+' '+(h.prob[k]*100).toFixed(1)+'%';}).join(' / ')+'</p>':'<p>让球建议：官方让球数或比分模型不足，暂不推荐</p>')+
 '<p>'+a.signals.map(esc).join('<br>')+'</p>'+
 (a.risk.length?'<p>风险提示：'+a.risk.map(esc).join('；')+'</p>':'')+
 (a.missing.length?'<p>数据不足：'+a.missing.map(esc).join('；')+'</p>':'')+
 '<small>'+esc(a.note)+'</small></div></details>';
}

function renderMatch(m) {
  const eu = m.odds && m.odds.europe;
  const euV = eu && (eu.live || eu.open);
  const as = m.odds && m.odds.asian;
  const asV = as && (as.live || as.open);
  const ou = m.odds && m.odds.overunder;
  const ouV = ou && (ou.live || ou.open);
  const r = m.reco;

  /* ---- 推荐类型 / 不败概率 / 胶囊高亮（定义见文件上半部 __RECO_UNBEATEN__ 段） ---- */
  const ub = r ? ubProb(r.prob) : null;
  const rtype = recoTypeOf(r);
  const ubSide = unbeatenSide(r);
  /* 推荐名：不败类型显示"主不败 / 客不败"，其余照旧用数据里的 label */
  const rLabel = !r ? ''
    : (rtype === 'unbeaten' && ubSide ? unbeatenLabel(r)
      : (r.label || { home: '主胜', draw: '平局', away: '客胜' }[r.pick] || ''));
  /* "信心"= 【推荐的那个选项】的概率：three → reco.confidence；
     unbeaten → 那一侧的"不败"概率（推荐的是不败，信心就该是不败的概率）。
     prob 拿不到时退回 reco.confidence，不编数。 */
  const rConf = (rtype === 'unbeaten' && ub && ubSide) ? ub[ubSide] : (r ? r.confidence : null);
  /* 每张卡片【只有一个】高亮 = 那一场的推荐（不会两个类型同时亮）：
       three    → 高亮 reco.pick 那个
       unbeaten → 高亮对应那一侧的"不败" */
  const onThree = rtype === 'unbeaten' ? '' : (r ? r.pick : '');
  const onUb = rtype === 'unbeaten' ? ubSide : '';
  const opt = (txt, on) => `<span class="opt${on ? ' active' : ''}">${txt}</span>`;

  const hc = m.handicap ? `<span class="m-hc">(${esc(m.handicap)})</span>` : '';
  const hs = m.home && m.home.rank ? `<i>[${m.home.rank}]</i>` : '';
  const asR = m.away && m.away.rank ? `<i>[${m.away.rank}]</i>` : '';

  /* 状态标签 */
  let st = '';
  if (m.kind === 'live') st = `<span class="m-st live">${m.minute ? m.minute + "'" : '进行中'}</span>`;
  else if (m.kind === 'finished') st = '<span class="m-st fin">完场</span>';

  /* 历史归档场次：卡片加 .hist（虚线左边框 + 略淡），一眼看出不是本次在售 */
  const cls = 'm-card collapsed folded'
    + (m.result && m.result.settled ? (m.result.hit ? ' win' : ' lose') : '')
    + (m.fromHistory ? ' hist' : '');

  /* 【比赛详情页】整张卡片可点 → 比赛详情.html?c=编号（__MATCH_DETAIL_LINK__）
     只在有编号时包链接：没编号（少数归档场次）就还是普通卡片，不产生死链。
     目标页由 build-match.mjs 生成，发布名单见 sync-cloud.mjs / cloud-build.mjs /
     .github/workflows/daily-update.yml 三处。 */
  const body =
    `<div class="m-top" role="button" aria-expanded="false">` +
    (m.code ? `<span class="m-code">${esc(m.code)}</span>` : '') +
    `<span class="m-league">${esc(m.league || '')}</span>` +
    (m.round ? `<span class="m-round">${esc(m.round)}</span>` : '') +
    st +
    `<span class="m-time">${esc(dateMD(m.time))} ${esc(timeHM(m.time))}</span>` +
    /* 【折叠】用户 2026-10-17 给的卡片设计：点头部折叠/展开，右侧一个 ▾。
       .m-top 现在是可点的（整卡不再是链接，见下方 return），
       .m-body 包住下面所有内容，折叠时 display:none，▾ 转 90 度。 */
    `<span class="m-fold" aria-hidden="true" style="transform:none!important">▸</span>` +
    `</div>` +
    `<div class="m-body" style="display:none!important">` +
    `<div class="m-teams">` +
    `<span class="m-team home">${hs}${esc(m.home.name)}${hc}</span>` +
    /* 【比分显示】用户 2026-10-17：「已完场要有比分显示」（进行中本来就有）。
       有比分 → 「4 - 2」；已完场但两边数据都没有这一场的比分 → 「—」
       （不是「VS」：VS 看着像还没开踢，会让用户以为卡在未开赛状态）；
       其余（未开赛）才显示 VS。⚠️ 拿不到就如实显示 —，绝不编一个比分。 */
    `<span class="m-vs${m.kind === 'live' ? ' live' : ''}${m.kind === 'finished' ? ' final' : ''}">` +
    (m.hasScore ? m.hs + ' - ' + m.as : (m.kind === 'finished' ? '—' : 'VS')) +
    `</span>` +
    `<span class="m-team away">${esc(m.away.name)}${asR}</span>` +
    `</div>` +
    (euV ? `<div class="m-odds"><span class="m-ol">欧赔</span>` +
      (euV.home != null ? `<span class="m-ov${r && r.pick === 'home' ? ' on' : ''}">主 ${euV.home}</span>` : '') +
      (euV.draw != null ? `<span class="m-ov${r && r.pick === 'draw' ? ' on' : ''}">平 ${euV.draw}</span>` : '') +
      (euV.away != null ? `<span class="m-ov${r && r.pick === 'away' ? ' on' : ''}">客 ${euV.away}</span>` : '') +
      `</div>` : '') +
    (asV ? `<div class="m-odds"><span class="m-ol">亚盘</span>` +
      (asV.home != null ? `<span class="m-ov">${asV.home}</span>` : '') +
      (asV.line ? `<span class="m-ov">${esc(asV.line)}</span>` : '') +
      (asV.away != null ? `<span class="m-ov">${asV.away}</span>` : '') +
      `</div>` : '') +
    (ouV ? `<div class="m-odds"><span class="m-ol">大小</span>` +
      (ouV.line != null ? `<span class="m-ov">${ouV.line}</span>` : '') +
      (ouV.over != null ? `<span class="m-ov">大 ${ouV.over}</span>` : '') +
      (ouV.under != null ? `<span class="m-ov">小 ${ouV.under}</span>` : '') +
      `</div>` : '') +
    (r ? `<div class="m-reco">` +
      `<span class="m-pick">推荐 <b>${esc(rLabel)}</b></span>` +
      (m.result && m.result.settled ? `<span class="m-rb ${m.result.hit ? 'hit' : 'miss'}">${m.result.hit ? '红' : '黑'}</span>` : '') +
      `<span class="m-conf">${m.result && m.result.settled
        ? '最终 ' + esc(m.result.actualLabel) + '（' + esc(m.result.score) + '）'
        : (m.kind === 'finished' && !m.hasScore
          /* 已完场但两边数据都没有这一场的比分 → 如实说明，别让用户以为漏了一行 */
          ? '最终比分未记录'
          : '信心 ' + rConf + '%')}</span>` +
      /* 【两组百分比胶囊】推荐行右侧，推荐的那个用 .opt.active（主色底 + 白字）高亮：
           胜平负  3 个：主 X% / 平 Y% / 客 Z%
           不败    2 个：主不败 X% / 客不败 Z%（= P(主胜)+P(平) / P(客胜)+P(平)）
         用户给的 HTML 设计只画了【一组】（按类型 3 个 or 2 个）——
         这里两组都出（信息更全），但【只有推荐的那个】高亮。
         prob 为 null（这场当时没抓到赔率）→ 显示 —，不能直接取 .home。 */
      (r.prob
        ? `<span class="m-probrows">` +
          `<span class="m-probrow"><span class="m-problab">胜平负</span>` +
          opt(`主${esc(r.prob.home)}%`, onThree === 'home') +
          opt(`平${esc(r.prob.draw)}%`, onThree === 'draw') +
          opt(`客${esc(r.prob.away)}%`, onThree === 'away') +
          `</span>` +
          (ub ? `<span class="m-probrow"><span class="m-problab">不败</span>` +
            /* 【三档】用户 2026-10-17 设计：主不败 / 平手交流 / 客不败，三个都带概率。
               · 主不败 = P(主胜)+P(平)   · 客不败 = P(客胜)+P(平)
               · 平手交流 = P(平)（用户确认「就是平局那个选项，带平局概率」） */
            `<span class="m-tags">` +
            opt(`主不败${esc(ub.home)}%`, onUb === 'home') +
            `<i class="m-tag orange">平手交流${esc(r.prob.draw)}%</i>` +
            opt(`客不败${esc(ub.away)}%`, onUb === 'away') +
            `</span>` +
            `</span>` : '') +
          `</span>`
        : `<span class="m-probs">` +
          opt(`主—%`, onThree === 'home') +
          opt(`平—%`, onThree === 'draw') +
          opt(`客—%`, onThree === 'away') +
          `</span>`) +
      renderEvRow(r, euV) + renderSixOutcomes(m) + renderMarketRules(m) +
      `</div>` : '<div class="m-reco"><span class="m-noodds">暂无赔率</span></div>') +
    renderScorePick(m) +
    renderAsianCard(m) +
    renderPoissonCard(m) +
    renderMultiCard(m) +
    (m.code ? `<a class="m-godetail" href="比赛详情.html?c=${encodeURIComponent(m.code)}">看这场数据 ›</a>` : '') +
    `</div>`;   /* ← .m-body 收尾（折叠时整块隐藏） */

  /* 【整卡不再是链接】用户 2026-10-17 给的卡片设计：点【头部】是折叠/展开，不是跳转。
     所以卡片本身改成 <div>，详情入口只剩 .m-body 末尾那个「看这场数据 ›」（已是 <a>）。
     这样「点头部折叠」和「看详情」两件事不会打架。 */
  return `<div class="${cls}" data-match-id="${esc(String(m.gid || m.code)+'|'+String(m.time || ''))}">${body}</div>`;
}

/* ============================================================
   【推荐串】在售 + 信心 ≥58% 的紧凑列表
   ------------------------------------------------------------
   数据全部来自页面【已有】的字段，没有新算法、不编数：
     · 「在售」= 体彩官网公布的 Selling 场次 = jc-data.js 顶层 sp.list
       （和「模拟计算」里能勾选的是同一批场次）
     · 「信心指数」= jc-data.js 每场的 reco.confidence ——
       build-jc.mjs 的 calcReco() 算的就是「欧赔反推概率里最高的那个」，
       所以 reco.confidence === max(prob.home, prob.draw, prob.away)
       === 推荐结果（reco.pick）的百分比。每场【只有一个】信心值。
     · 「赔率」= 该场 reco.pick 对应的欧赔（live 优先，没 live 用 open）——
       和信心的来源是同一份赔率，不混用官方 SP，免得两个来源对不上。
     · 在售列表里没有它 / 没有 reco（数据缺失）→ 不显示，绝不填 0 凑数。
   ============================================================ */
const REC_MIN = 58;                    /* 用户要求：信心 ≥58% 才进推荐（原 55% → 2026 用户提到 58%） */

const REC_BY_KEY = new Map();          /* 编号@日期 → 这场在 jc-data 里的推荐数据 */
JC.games.forEach((g) => {
  if (!g || !g.code || !g.reco || g.reco.confidence == null) return;
  const eu = g.odds && g.odds.europe && (g.odds.europe.live || g.odds.europe.open);
  const pick = g.reco.pick;
  REC_BY_KEY.set(`${g.code}@${dayOf(g.time)}`, {
    code: g.code,
    league: g.league || '',
    time: g.time || '',
    home: (g.home && g.home.name) || '',
    away: (g.away && g.away.name) || '',
    label: g.reco.label || { home: '主胜', draw: '平局', away: '客胜' }[pick] || '',
    odds: (eu && pick && eu[pick] != null) ? eu[pick] : null,
    /* 【排名 + 三项欧赔】用户 2026-10-18 要「爆冷预警 / 差异分析」：
       排名和赔率我们本来就有（jc-data.js 的 home.rank / away.rank / odds.europe），
       这里一并带进推荐串行，页面上标事实（不写"谨防平局"那种判断）。 */
    rankH: (g.home && g.home.rank != null) ? g.home.rank : null,
    rankA: (g.away && g.away.rank != null) ? g.away.rank : null,
    euHome: (eu && eu.home != null) ? eu.home : null,
    euDraw: (eu && eu.draw != null) ? eu.draw : null,
    euAway: (eu && eu.away != null) ? eu.away : null,
    conf: g.reco.confidence
  });
});

/* 在售（官方 Selling）× 有信心数据；低于 REC_MIN 的一律不要 */
const REC_ALL = (SP ? SP.list : [])
  .map((r) => REC_BY_KEY.get(`${r.code}@${dayOf(r.time)}`))
  .filter(Boolean);
const REC_ROWS = REC_ALL
  .filter((r) => r.conf >= REC_MIN)
  /* 【排序：按比赛时间升序】用户明确要求（这条覆盖了之前"按信心从高到低"）：
       「核心：按比赛时间升序排列（越早开赛越靠前）」
     ⇒ 信心【不再参与排序】，只作为筛选条件（≥ REC_MIN）。
     用 Date.parse 比较时间戳（不是字符串比较）—— 时间字段是 ISO 串，
     能被 new Date() 正确解析；字符串比较在跨天/跨月时会出错。
     时间相同的再按信心从高到低兜底，保证顺序稳定。 */
  .sort((a, b) => {
    const ta = Date.parse(String(a.time || '')) || 0;
    const tb = Date.parse(String(b.time || '')) || 0;
    return (ta - tb) || (b.conf - a.conf);
  });
const REC_LOW = REC_ALL.filter((r) => r.conf < REC_MIN);
/* 一条都没有时，把「在售里最好的那个」写出来 —— 让用户知道是筛选生效而不是坏了 */
const REC_MAXCONF = REC_ALL.length ? Math.max.apply(null, REC_ALL.map((r) => r.conf)) : null;

/* 【推荐串红黑条 · 内层 HTML】—— 抽成函数只为了【一处渲染、两处使用】：
   页面里是 <span class="m-recstat" id="jcRecStat">…</span>（在「推荐串」那一行的标题里），
   30 秒刷新用的 jc-reco-view.js 里也放这同一串（换 innerHTML）。
   ⚠️ 用户 2026-10-17：「把这一栏移除，功能放到下面显示」
      → 原来悬在列表上方那条独立的战绩条搬进了「推荐串」入口行，
        所以这里【不再输出「推荐串」这三个字】（行标题里已经有了，否则重复两遍）。
   ⚠️ 数字口径一个字没动：没比对出来就是 0/—，绝不用 0 冒充"算过了"。 */
function recoStatBarInner() {
  /* ⚠️ 用户 2026-10-17 原话（照抄）：
       if (data.unfinished > 0) recNote = 「还有 ${data.unfinished} 组没打完」
       else                     recNote = 「更新于 ${data.updated}」
     ① 没打完 → 只写「还有 N 组没打完」（⚠️ 不带任何窗口小时数，用户强调过）
     ② 都打完 → 写「更新于 2026-10-17 23:10」（时间＝jc-reco-stats.json 的 updated，
        REC_STAT.updated 就是它；再退回构建时间戳 RECO_STAMP）
     ③ 一个字的时间都拿不到 → 只写「已更新」，不显示空括号、不填假时间
     ⚠️ 30 秒刷新脚本（jc-reco-view.js）里那串 stat 也是【调用本函数】写出的，
        所以页面初始渲染 和 刷新后 永远是同一套文案，不需要改刷新逻辑。 */
  const recTime = REC_STAT ? (REC_STAT.updated || RECO_STAMP || '') : '';
  const note = REC_STAT
    ? (REC_STAT.pending
      ? `还有 ${REC_STAT.pending} 组没打完`
      : (recTime ? `更新于 ${esc(recTime)}` : '已更新'))
    : '暂未开始统计';
  /* 【类名对齐用户 2026-10-17 给的结构】他给的是：
       <div class="record-bar" id="recStatsBar">
         <span class="label">推荐单</span>
         <span class="red" id="recRedText">红 0</span>
         <span class="black" id="recBlackText">黑 0</span>
         <span class="rate" id="recRateText">命中率 —</span>
         <span class="note">（推荐串比对最终比分）</span>
       </div>
     所以这里用 .red/.black/.rate/.note + 三个 id —— 他以后可以直接
     document.getElementById('recRedText').textContent = '红 20' 这样更新。
     ⚠️ 旧类名（.h/.m/.r/.n）保留成同款样式，老缓存页面不至于没样式。 */
  return `<span class="red h" id="recRedText">红 ${REC_STAT ? REC_STAT.red : 0}</span>` +
    `<span class="black m" id="recBlackText">黑 ${REC_STAT ? REC_STAT.black : 0}</span>` +
    `<span class="rate r" id="recRateText">命中率 ${REC_STAT && REC_STAT.rate != null ? REC_STAT.rate + '%' : '—'}</span>` +
    `<span class="note n">（推荐串比对最终比分 · ${note}）</span>`;
}

/* 【整条战绩条 = 左标签 + 数字】刷新脚本要换的就是这一整串。
   ⚠️ 以前脚本只换 recoStatBarInner()（不含「推荐单」标签）→ 第一轮刷新后
      那三个字就没了（线上实测过）。现在两边都用本函数，页面初始渲染 ＝ 刷新后。 */
function recoStatBarHtml() {
  return `<span class="label t">推荐单</span>` + recoStatBarInner();
}

/* 【推荐串战绩条 · 顶层那一条】—— 用户 2026-10-17 追加要求：
     「红 N 黑 M 命中率 X%（前后 24 小时 · 实时更新）」原来在「推荐串」折叠块【里面】，
     要挪到【外面】，紧跟在「完场战绩」下面做第二条同款战绩条，
     不展开折叠块也能看见红黑数。
   ⚠️ id="jcRecStat" + data-reco-updated 两个属性【必须保留】：
      30 秒实时刷新那段脚本就是按这个 id 找元素、原地换 innerHTML 的（搬到哪都行）。
   ⚠️ 没有统计结果时【整条不渲染】—— 不显示空标题、不拿 0 冒充"算过了"。 */
function selectConfidentPair(rows, spList, matches, now) {
  const picks={ '主胜':'home', '平局':'draw', '客胜':'away' }, keys={home:'h',draw:'d',away:'a'};
  const candidates=rows.map(r=>{
    const pick=picks[r.label], sp=spList.find(x=>x.code===r.code&&dayOf(x.time)===dayOf(r.time));
    const m=matches.find(x=>x.code===r.code&&dayOf(x.time)===dayOf(r.time));
    const odds=Number(sp&&sp.had&&sp.had[keys[pick]]);
    if(!pick||!m||m.kind!=='upcoming'||m.hasScore||!(kickMs(r.time)>now)||!(odds>1)||!(r.conf>=58))return null;
    return {code:r.code,time:r.time,home:r.home,away:r.away,label:r.label,pick,odds,conf:Number(r.conf)};
  }).filter(Boolean);
  let best=null;
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
    const legs=[candidates[i],candidates[j]];
    if(legs[0].code===legs[1].code&&dayOf(legs[0].time)===dayOf(legs[1].time))continue;
    const odds=legs[0].odds*legs[1].odds, confidence=legs[0].conf*legs[1].conf;
    if(odds<2)continue;
    if(!best||confidence>best.confidence||(confidence===best.confidence&&odds<best.odds))best={legs,odds,confidence};
  }
  return best;
}
function pairSaleQuotes(pair,spList,matches,now){
  if(!pair||pair.verdict==='red'||pair.verdict==='black'||!Array.isArray(pair.legs)||pair.legs.length!==2)return null;
  const keys={home:'h',draw:'d',away:'a'},quotes=[];
  for(const leg of pair.legs){
    const sp=spList.find(x=>x.code===leg.code&&dayOf(x.time)===dayOf(leg.time));
    const m=matches.find(x=>x.code===leg.code&&dayOf(x.time)===dayOf(leg.time));
    const odds=Number(sp&&sp.had&&sp.had[keys[leg.pick]]);
    if(!sp||!m||m.kind!=='upcoming'||m.hasScore||!(kickMs(leg.time)>now)||!(odds>1))return null;
    quotes.push(odds);
  }
  return quotes[0]*quotes[1]>=2?quotes:null;
}
function pairSignature(pair){return pair.legs.map(l=>l.code+'@'+dayOf(l.time)+'@'+l.pick).sort().join('|');}

function settleConfidentPair(pair,matches){
  pair.legs.forEach(leg=>{
    if(leg.verdict)return;
    const m=matches.find(x=>x.code===leg.code&&dayOf(x.time)===dayOf(leg.time));
    if(!m||m.kind!=='finished'||!m.hasScore||!Number.isFinite(Number(m.hs))||!Number.isFinite(Number(m.as)))return;
    const actual=Number(m.hs)>Number(m.as)?'home':Number(m.hs)<Number(m.as)?'away':'draw';
    leg.score=m.hs+' : '+m.as;leg.verdict=actual===leg.pick?'red':'black';
  });
  pair.verdict=pair.legs.some(x=>x.verdict==='black')?'black':pair.legs.every(x=>x.verdict==='red')?'red':'pending';
  return pair;
}
const PAIR_ARCHIVE_FILE=path.join(ROOT,'reco-archive.json');
const PAIR_SALE_TIME=SP?kickMs(SP.updated||JC.updated||''):NaN;
const PAIR_SALE_LIST=SP&&Number.isFinite(PAIR_SALE_TIME)&&Date.now()-PAIR_SALE_TIME>=-300000&&Date.now()-PAIR_SALE_TIME<=90*60000?SP.list:[];
let PAIR_ARCHIVE={};
try{PAIR_ARCHIVE=JSON.parse(fs.readFileSync(PAIR_ARCHIVE_FILE,'utf8'));}catch(e){}
const PAIR_DAY=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const PAIR_CUT=Date.parse(PAIR_DAY+'T00:00:00+08:00')-29*86400000;
const PAIR_RECORDS=(Array.isArray(PAIR_ARCHIVE.footballPairs)?PAIR_ARCHIVE.footballPairs:[]).filter(x=>x&&Array.isArray(x.legs)&&x.legs.length===2&&Date.parse(x.date+'T00:00:00+08:00')>=PAIR_CUT);
PAIR_RECORDS.forEach(p=>settleConfidentPair(p,MATCHES_ALL));
let CURRENT_PAIR=PAIR_RECORDS.slice().reverse().find(p=>pairSaleQuotes(p,PAIR_SALE_LIST,MATCHES_ALL,Date.now()));
if(!CURRENT_PAIR){const chosen=selectConfidentPair(REC_ROWS,PAIR_SALE_LIST,MATCHES_ALL,Date.now());if(chosen){
 const signature=pairSignature(chosen);CURRENT_PAIR=PAIR_RECORDS.find(p=>pairSignature(p)===signature);
 if(!CURRENT_PAIR){CURRENT_PAIR={date:PAIR_DAY,createdAt:new Date().toISOString(),odds:chosen.odds,legs:chosen.legs,verdict:'pending'};PAIR_RECORDS.push(CURRENT_PAIR);}
}}
function saveConfidentPairs(){
  let latest={};try{latest=JSON.parse(fs.readFileSync(PAIR_ARCHIVE_FILE,'utf8'));}catch(e){}
  latest.footballPairs=PAIR_RECORDS;
  const tmp=PAIR_ARCHIVE_FILE+'.pair.tmp';fs.writeFileSync(tmp,JSON.stringify(latest),'utf8');fs.renameSync(tmp,PAIR_ARCHIVE_FILE);
}
function confidentPairHtml(){
  const red=PAIR_RECORDS.filter(x=>x.verdict==='red').length,black=PAIR_RECORDS.filter(x=>x.verdict==='black').length,pending=PAIR_RECORDS.length-red-black;
  function status(v){return v==='red'?'红':v==='black'?'黑':'待赛果';}
  function group(p,live){
    const quotes=live?pairSaleQuotes(p,PAIR_SALE_LIST,MATCHES_ALL,Date.now()):null;
    const odds=quotes?quotes[0]*quotes[1]:p.odds;
    const deadline=Math.min(...p.legs.map(l=>kickMs(l.time)));
    const line=p.legs.map(l=>esc(l.code)+' '+esc(l.home)+' vs '+esc(l.away)+'【'+esc(l.label)+'】').join(' <span class="pair-plus">＋</span> ');
    return '<div class="pair-slip"'+(live?' data-pair-deadline="'+deadline+'"':'')+'><div class="pair-slip-head">'+(live?'本组一起选 · 同一张单':'已公布组合 · 结果记录')+'</div><div class="pair-selection">'+line+'</div><div class="pair-pass">组合方式：<strong>2串1</strong> · '+(live?'当前参考':'公布时')+'组合赔率 <strong>'+Number(odds).toFixed(2)+'</strong></div>'+
      p.legs.map((l,i)=>'<div class="confident-pair-leg">第'+(i+1)+'场：<b>'+esc(l.code)+' '+esc(l.home)+' vs '+esc(l.away)+'</b><div>选 <strong>'+esc(l.label)+'</strong> · 赔率 '+Number(quotes?quotes[i]:l.odds).toFixed(2)+' · '+(live?'公布时信心 ':'信心 ')+l.conf+'%</div><small>'+esc(l.time)+(l.score?' · 比分 '+esc(l.score)+' · '+status(l.verdict):'')+'</small></div>').join('')+
      (live?'<small>两场需同时在售；请在最早一场开赛前选择组合，具体停售时间和赔率以实际购彩渠道为准。</small>':'')+'</div>';
  }
  return '<style>.confident-pair-leg{padding:9px 0;border-top:1px dashed #dfceb1}.confident-pair-leg small{color:#8a7a63}.confident-pair-content{font-size:12px;line-height:1.8;overflow-wrap:anywhere}.confident-pair-content details{margin-top:10px}.pair-slip{border:1px solid #ddc6a0;border-radius:9px;padding:10px;margin:8px 0;background:#fffdf7}.pair-slip-head{font-weight:bold;color:#19895d}.pair-selection{font-weight:bold;margin:9px 0}.pair-plus{color:#19895d;font-size:20px;display:block;text-align:center}.pair-pass{padding:7px 0;color:#7c582c}</style><div class="confident-pair-content"><b>2串1组合推荐</b>'+
    (CURRENT_PAIR?'<div class="pair-current">'+group(CURRENT_PAIR,true)+'</div>':'<div class="pair-current pair-empty">暂无两场同时在售、未开赛且组合赔率不低于2的合适组合，等待更新。</div>')+
    '<div>近30天：红 '+red+' · 黑 '+black+' · 待 '+pending+' · 命中率 '+(red+black?(red/(red+black)*100).toFixed(1)+'%':'—')+'</div><small>每组公布后保留记录，两场都命中才算本组红。仅供参考，不保证命中。</small>'+
    '<details><summary>近30天2串1记录</summary>'+(PAIR_RECORDS.length?PAIR_RECORDS.slice().reverse().map(p=>'<div><b>'+esc(p.date)+' · '+status(p.verdict)+'</b>'+group(p,false)+'</div>').join(''):'暂无已公布组合')+'</details></div>';
}

function recoStatBarTop(){return `<section id="jcConfidentPair" style="padding:12px;margin:10px 0;border:1px solid #e4d4b8;border-radius:10px;background:#fff9ed">${confidentPairHtml()}</section>`;}

/* ============================================================
   渲染
   ============================================================ */

/* 【值得注意 · 口诀口径但只讲事实】用户 2026-10-18：要「爆冷预警 / 差异分析」。
   只用真实字段（主客排名 + 主/平/客三项欧赔）做判定，陈述事实，不下"谨防平局"这类断言；
   页面上同时给免责声明。返回空串表示没有可说的（不硬凑）。 */
function recNoteHtml(r) { return ""; }

function renderRec() {
  /* __FB_ENTRY_ROW__ 和三个分段同一套「横排 entry 行」：
     左「推荐串」+ 副标题（在售 · 信心 ≥58% · N 场），右「点击查看」。
     ⚠️ 还是 <details>/<summary> 折叠；[open] 切换靠 .m-rec[open] 的 ::after。
     ⚠️ 这一行【只放入口】，不放战绩数字 —— 战绩数字在折叠块外面那条
        recoStatBarTop() 上（用户 2026-10-17 追加要求：放外面）。 */
  /* 【30 秒刷新】副标题文案先存一份 —— 刷新时按这个字符串换「在售 · 信心 ≥58% · N 场」 */
  REC_COUNT_TEXT = CURRENT_PAIR ? "两场合为一组 · 2串1" : "等待合适的2串1组合";
  const head =
    `<summary class="m-rechead entry-item">` +
    `<span class="left">` +
    `<span class="t m-rectitle">2串1推荐</span>` +
    `<span class="d m-reccount">${REC_COUNT_TEXT}</span>` +
    `</span>` +
    `<span class="right m-rectip" aria-hidden="true"></span>` +
    `</summary>`;

  /* 【战绩数字已搬出折叠块】用户 2026-10-17 追加要求：截图圈掉这一行 →
     要挪到折叠块【外面】、紧跟「完场战绩」做第二条同款条。
     所以折叠块里【不再渲染这一条】（避免里外重复显示），
     改由 recoStatBarTop() 在顶层渲染；id / data 属性照旧，刷新脚本不用改。 */

  const note =
    `<div class="m-recnote">只在<b>官方在售</b>场次里挑信心 ≥${REC_MIN}% 的 · ` +
    `信心＝欧赔反推概率里最高那个（参考胜负平指数推演）</div>`;

  const body = REC_ROWS.length
    ? REC_ROWS.map((r) =>
      `<div class="m-recrow">` +
      `<span class="m-reccode">${esc(r.code)}</span>` +
      `<span class="m-recteams">${esc(r.home)} vs ${esc(r.away)}` +
      (r.league ? `<i>${esc(r.league)}</i>` : '') + `</span>` +
      `<span class="m-recpick">${esc(r.label)}</span>` +
      `<span class="m-recodds">${r.odds == null ? '—' : Number(r.odds).toFixed(2)}</span>` +
      /* 【排名】用户 2026-10-18：主客排名是真实字段（jc-data 的 home.rank / away.rank），直接标出来 */
      (r.rankH != null || r.rankA != null
        ? `<span class="m-recrank">#${r.rankH == null ? '—' : r.rankH} : #${r.rankA == null ? '—' : r.rankA}</span>`
        : '') +
      `<span class="m-recconf${r.conf >= 60 ? ' strong' : ''}">${r.conf}%</span>` +
      `</div>` + recNoteHtml(r)).join('')
    : `<div class="m-recempty">暂无（在售场次里` +
      (REC_MAXCONF == null
        ? `还没有推荐数据`
        : `带推荐数据的 ${REC_ALL.length} 场，最高信心 ${REC_MAXCONF}% < ${REC_MIN}%`) +
      `）</div>`;
  /* 【30 秒刷新】把「推荐」在售那一块的行 HTML 存下来给 jc-reco-view.js 用
     （页面初始渲染 和 刷新后 是同一份，不会两处慢慢长歪） */
  REC_ROWS_INNER = "";

  /* ---------- 【详情：往期推荐串的比对结果】 ----------
     用户要求：「推荐串详情 —— 前后24小时窗口 + 红黑结果 + 存档+比对机制」，
     2026-10-17 追加：「不要还没比赛结果的 · 只留 36 小时内推荐过的」。
     数据来自 jc-reco-data.js（jc-reco-build.mjs 每期存一次、打完回填）。
     · 窗口：推荐时间在【近 36 小时】内（REC_ARCH_HOURS，见上面那段说明）
     · 只列【已出结果】的批次（红 / 黑）；还有比赛没打完的整批不显示，
       但「还有 N 组没打完」会显示在标题旁边（用户之前要的提示，保留）
     · 每一场都列出终场比分；红/黑由内核按单场 hit 算出来，不在这里另判
     · 近 36 小时一场结果都没有 → 显示一句说明（不留空白、不填假数字）
     ⚠️ 没有存档时这一整块【不渲染】（不显示空标题）。 */
  /* 【往期推荐串】用户 2026-10-17 给的模块结构（选 B：替换掉原来那块，页面上只留一份）：
       .past-recommend-section > .past-header(.title-left .label + .stats-right#pastStats)
                                 > .past-list#pastList
     · 外层仍带 id="jcRecArch" —— 30 秒刷新脚本按它换 innerHTML，机制不变
     · 统计口径和顶部那条一致（单场判定 REC_STAT），两处数字永远相同
     · 列表项沿用现有 .m-recbatch / .m-recrow-arch（数据、红黑判定不动） */
  const pastStats = (REC_STAT && REC_STAT.decided)
    ? `红 ${REC_STAT.red} · 黑 ${REC_STAT.black} · 命中率 ${REC_STAT.rate}%`
    : `红 ${REC_STAT ? REC_STAT.red : 0} · 黑 ${REC_STAT ? REC_STAT.black : 0} · 命中率 —`;
  const pastHead =
    `<div class="past-header">` +
    `<div class="title-left"><span class="label">推荐历史结果</span></div>` +
    `<div class="stats-right" id="pastStats">${pastStats}</div>` +
    `</div>` +
    (REC_ARCH_PENDING ? `<div class="past-pending">还有 ${REC_ARCH_PENDING} 组没打完（已列在下面，标「待」）</div>` : '');
  /* 【按日期分组】用户 2026-10-18：「分时间写好」→ 每天一个小标题，下面列那天的批次。
     未结算的批次也列（标「进行中」，每场显示 待；不再只说"没打完不列出"）。 */
  const archGroups = [];
  const archMap = {};
  REC_ROWS_ARCHIVE.forEach((b) => {
    const day = String((b && b.at) || '').slice(0, 10) || '未知日期';
    if (!archMap[day]) { archMap[day] = []; archGroups.push(day); }
    archMap[day].push(b);
  });
  const pastItems = archGroups.map((day) => {
    const items = archMap[day].map((b) => {
      const rows = Array.isArray(b.rows) ? b.rows : [];
      const tag = b.verdict || '待定';
      return `<div class="past-item">` +
        `<div class="past-item-head">` +
        `<span>${esc(b.at || '')} <span class="badge">${esc(tag)}</span></span>` +
        `<span>${rows.length} 场` + (b.pending ? ` · ${b.pending} 场未打完` : ' · 已结算') + `</span>` +
        `</div>` +
        rows.map((r) => {
          const st = r.hit === true ? '红' : (r.hit === false ? '黑' : '待');
          const stCls = r.hit === true ? 'status-red' : (r.hit === false ? 'status-black' : '');
          return `<div class="past-match-row">` +
            `<span class="teams">${esc(r.code || '')} ${esc(r.home || '')} vs ${esc(r.away || '')}` +
            (r.label ? ` · ${esc(r.label)}` : '') + `</span>` +
            `<span class="arch-conf">${r.conf != null ? esc(String(r.conf)) + '%' : '—'}</span>` +
            `<span class="result">${r.score ? esc(r.score) : '—'}</span>` +
            `<span class="${stCls}">${st}</span>` +
            `</div>`;
        }).join('') +
        `</div>`;
    }).join('');
    return `<div class="arch-day"><div class="arch-day-h">${esc(day)}</div>${items}</div>`;
  }).join('');

  /* 【提示文案】用户 2026-10-17 指定的那句（和设计稿一致） */
  const tips = '<div class="m-rectips">在售场次里挑信心 ≥ 58% 的比赛（参考胜负平指数推演）</div>';
  /* 【刷新心跳】用户 2026-10-18：「显示最后更新时间，让用户看到在刷」。
     这一行小字（.reco-sync）＝ 数据是什么时候更新的；30 秒刷新脚本每次拉到文件后
     会把它改写成「数据更新 02:05 · 已同步 02:31:12」—— 秒数一直往前走，
     用户一眼就能看出这块是活的（没变数据也不会白闪）。 */
  const syncRow = `<div class="reco-sync" id="recoSync">` +
    (RECO_STAMP ? `数据更新 ${esc(RECO_STAMP)}` : '数据已更新') + `</div>`;
  const detail = REC_ROWS_ARCHIVE.length
    ? pastHead + `<div class="past-list" id="pastList">${pastItems}</div>` + syncRow
    : (JC_RECO && Array.isArray(JC_RECO.batches) && JC_RECO.batches.length
      /* 【空态】窗口内一场结果都没有 → 明确说明，不留白、不填假的 */
      ? pastHead + `<div class="past-list" id="pastList">` +
        `<div class="past-empty">近 ${REC_ARCH_HOURS} 小时暂无已出结果的推荐` +
        (REC_ARCH_PENDING ? `（还有 ${REC_ARCH_PENDING} 组没打完）` : '') + `</div></div>` + syncRow
      : '');

  /* 【30 秒刷新】把这份内层 HTML 存下来给 jc-reco-view.js 用 */
  REC_ARCH_INNER = detail;
  /* 【跟着推荐栏一起折叠】用户 2026-10-18：
     ①「跟着推荐栏去折叠」→ 推荐历史结果（#jcRecArch）放回 details 里面；
     ②「推荐单只抓取推荐里面的，不是抓取在售的」→ 推荐单数字条（recoStatBarTop）
        也从顶层搬进来，只跟这一栏走（收起时一起收），口径不变（≥58% 的推荐场次）。 */
  return `<details class="m-rec" id="jcRec">${head}${recoStatBarTop()}</details>`;
}

/* ============================================================
   模拟计算器（渲染）
   ------------------------------------------------------------
   · 勾选 / 倍数由页面上的纯前端脚本实时算（不发任何请求、不刷新页面）
   · 【交互边界】竞彩页上只有这一块可以操作；不写任何本地存储
     （浏览器存储 API 一个都不用），刷新页面全部回到默认（全不勾选、倍数 1）
   · 规则见区块底部「怎么算的」，合规声明单独一行放在最下面
   · 【可收起】用原生 <details class="m-calc"> / <summary>，默认【收起】，
     和三个分段 .m-sec 完全同一套做法（提示文字由 CSS 按 [open] 切换）
   ============================================================ */
const CALC_MAX_PARLAY = 8;   /* 体彩：胜平负 / 让球胜平负 最多 8 关 */

/* 【过关方式最多能选到几串1】= min(体彩上限 8, 当前真的能算的场次)
   —— 只有 5 场有官方 SP 时就最多给到 5串1，不给选不出来的档。 */
const hasSpOdds = (r) => {
  const pos = (o) => typeof o === 'number' && o > 0;
  return !!r && ((r.had && (pos(r.had.h) || pos(r.had.d) || pos(r.had.a))) ||
    (r.hhad && (pos(r.hhad.h) || pos(r.hhad.d) || pos(r.hhad.a))));
};
const CALC_MAX_N = Math.min(CALC_MAX_PARLAY, CALC_ROWS.filter(hasSpOdds).length);
const passLabel = (n) => (n <= 1 ? '单关' : n + '串1');

function renderCalc() {
  /* summary 里就是标题行；最右边那个 span 负责「点击查看 / 点击收起」，
     文字由 CSS 按 .m-calc[open] 切换（和 .m-sectip 一模一样） */
  const head =
    `<summary class="calc-head bottom-bar">` +
    `<span class="calc-title btn2 primary">模拟计算</span>` +
    `<span class="calc-tag tag">仅供娱乐参考</span>` +
    /* 【保存图片】在标题行里（<summary> 内）。点了【不会】把整块收起：
       脚本里对它的 click 调了 preventDefault + stopPropagation。用 <a role="button">，不是裸 <button>。 */
    `<a role="button" tabindex="0" class="calc-btn calc-shot-btn btn2" id="calcShotBtn">保存图片</a>` +
    `<span class="calc-src">赔率：${esc(SP_SRC_CN)}</span>` +
    `<span class="calc-tip" aria-hidden="true"></span>` +
    `</summary>`;

  const rules =
    `<div class="calc-note">` +
    `<b>怎么算的</b>（按体彩竞彩官方规则）：<br>` +
    `· 单注固定 <b>2 元</b>。<b>单注奖金</b> = 2 元 × 所选各场固定奖金额连乘，按官方规则保留 2 位小数（第 3 位 0~4 舍、6~9 进、5 看第 2 位奇偶，偶舍奇进）。<br>` +
    `· <b>总投注额</b> = 注数 × 2 元 × 倍数；中奖时按【中的那一注】算奖金，再乘倍数。<br>` +
    `· 只勾 1 场 = <b>单关</b>；勾 2 场及以上 = <b>过关</b>（串关）。同一场勾多个结果 = <b>复式</b>，注数 = 各场勾选个数的乘积。<br>` +
    `· <b>单注最高奖金限额</b>：单关 10 万元 · 2~3 关 20 万元 · 4~5 关 50 万元 · 6 关及以上 100 万元（超出部分按限额兑付）。<br>` +
    `· 胜平负 / 让球胜平负最多 <b>${CALC_MAX_PARLAY} 关</b>；同一场比赛的「胜平负」与「让球胜平负」<b>不能混合过关</b>（体彩规则，遇到这种勾选本工具不计算并提示）。<br>` +
    `· 单关只有在官方开放单关的场次才能投注，本工具<b>不判断该资格</b>，请以官方为准。<br>` +
    `· 赔率随时会变，一切以官方最终公布为准。` +
    `</div>`;

  /* 【合规声明】这一块自己的底部声明（不与页面最底部的免责声明重复堆砌） */
  const disclaim =
    `<div class="calc-disclaim">本工具仅为模拟计算演示，数据仅供参考，` +
    `<b>仅供娱乐，不构成购彩建议</b>，请理性购彩。</div>`;

  /* 默认收起：<details> 不带 open 属性（刷新后天然回到收起，不做任何持久化）
     · allow-save：这一块是【允许保存】的白名单区域 —— 区块内的右键 / 长按 /
       拖拽 / 复制都不拦（用户要能自己复制赔率、自己右键存图）；
       页面其它地方（统计卡 / 战绩 / 比赛卡片 / 免责声明）照旧全拦。
     · 生成的选号图那一层（#calcShot）也带 allow-save —— 不然没法右键另存。 */
  const open = `<details class="m-calc allow-save" id="jcCalc">${head}<div class="calc-body">`;
  const close = `</div></details>`;

  if (!CALC_ROWS.length) {
    return open +
      `<div class="calc-empty">暂无可试算的竞彩 SP 赔率（${esc(SP ? (SP.from || '') : 'jc-data.js 里没有 sp 数据')}）。` +
      `SP 抓不到时本区块不会显示数字，也绝不估算。</div>` +
      rules + disclaim + close;
  }

  const rows = CALC_ROWS.map((r) => {
    const opt = (pool, key, label, odds) => (odds == null ? '' :
      `<label class="calc-opt"><input class="calc-cb" type="checkbox" value="${esc(r.code)}|${pool}|${key}">` +
      `<span class="calc-opt-t">${label}</span><span class="calc-opt-o">${odds}</span></label>`);
    return `<div class="calc-row">` +
      `<div class="calc-mt"><span class="calc-code">${esc(r.code)}</span>` +
      `<span class="calc-league">${esc(r.league)}</span>` +
      `<span class="calc-time">${esc(dateMD(r.time))} ${esc(timeHM(r.time))}</span></div>` +
      `<div class="calc-teams">${esc(r.home)}<span class="calc-vs">VS</span>${esc(r.away)}</div>` +
      (r.had ? `<div class="calc-opts"><span class="calc-ol">胜平负</span>` +
        opt('had', 'h', '主胜', r.had.h) + opt('had', 'd', '平', r.had.d) + opt('had', 'a', '客胜', r.had.a) +
        `</div>` : '') +
      (r.hhad ? `<div class="calc-opts"><span class="calc-ol">让球${esc(r.hhad.line)}</span>` +
        opt('hhad', 'h', '主胜', r.hhad.h) + opt('hhad', 'd', '平', r.hhad.d) + opt('hhad', 'a', '客胜', r.hhad.a) +
        `</div>` : '') +
      `</div>`;
  }).join('');

  /* 纯前端脚本要用的赔率 + 队名（保存图片时要画到图上）：内联成 JSON。
     【注意】必须把 < 转义，否则 JSON 里的字符串可能提前闭合 <script>。 */
  const payload = JSON.stringify(CALC_ROWS.map((r) => ({
    code: r.code, league: r.league, time: r.time, home: r.home, away: r.away,
    had: r.had, hhad: r.hhad
  }))).replace(/</g, '\\u003c');

  const bar =
    `<script type="application/json" id="jcCalcData">${payload}</script>` +
    `<div class="calc-bar">` +
    `<div class="calc-stat">` +
    `<span>已选 <b id="calcN">0</b> 关</span>` +
    `<span>共 <b id="calcBets">0</b> 注</span>` +
    `<span>总投注 <b id="calcCost">¥0.00</b></span>` +
    `<span class="calc-mul"><label for="calcMul">倍数</label>` +
    `<input id="calcMul" type="number" min="1" max="99" step="1" value="1"></span>` +
    `<a role="button" tabindex="0" class="calc-btn" id="calcClear">清空</a>` +
    `</div>` +
    `<div class="calc-prize"><span class="calc-prize-l">预计奖金</span>` +
    `<b id="calcPrize">¥0.00</b>` +
    `<span class="calc-prize-h" id="calcPrizeHint">还没勾选场次</span></div>` +
    `<div class="calc-warn" id="calcWarn"></div>` +
    `<div class="calc-foot">单注 2 元（体彩竞彩固定）；倍数越大，总投注与预计奖金同步放大。</div>` +
    `</div>`;

  /* 【过关方式】选项：单关 / 2串1 … N串1（N = min(8, 能算的场次)），默认 2串1。
     用 <select>（不是 <button>，页面不变量「裸 <button> = 0」不受影响）；
     手机上是原生选择器，比一排小标签更好点。 */
  let passOpts = '';
  for (let n = 1; n <= CALC_MAX_N; n++) {
    passOpts += `<option value="${n}"${n === (CALC_MAX_N >= 2 ? 2 : 1) ? ' selected' : ''}>${passLabel(n)}</option>`;
  }

  return open +
    `<div class="calc-sub">` +
    `<span class="calc-sub-t">勾选你看好的结果 → 自动按体彩竞彩规则算预计奖金（纯前端计算，不刷新页面）</span>` +
    `<span class="calc-sel"><label for="calcPass">过关方式</label>` +
    `<select id="calcPass">${passOpts}</select></span>` +
    /* 【GPT随机】放在说明行右边（不在 <summary> 里，点了不会顺手把区块收起来）。
       用 <a role="button">，不是裸 <button>（页面不变量：裸 <button> = 0）。 */
    `<a role="button" tabindex="0" class="calc-btn calc-rand" id="calcRand">GPT随机</a>` +
    `</div>` +
    `<div class="calc-rows">${rows}</div>` +
    bar + rules + disclaim + close;
}

/* ============================================================
   【晒票】区块（竞彩实票图片）
   ------------------------------------------------------------
   用户原话：「竞赛页面 也做一个晒票 你去全网抓取晒票的 和抓彩票的程序编码一样」
   位置：模拟计算区块【下面】、免责声明【上面】（用户截图红框处）。
        具体插在「模拟计算 details 结尾」和「免责声明那个 .guard 开头」之间。
        ⇒ 这两个区块之间只有这一处空隙（渲染顺序 =
          cards 三个分段 → 模拟计算 → ★晒票★ → .guard(免责声明)）。
   形态：和只读分享页的「晒票」栏【一致】——
     · 原生 <details>/<summary>，默认【收起】，右侧「点击查看/点击收起」纯 CSS 按 [open] 切
     · 图片网格：手机 2 列 / 宽屏(>=620px) 4 列
     · 缩略图是【图床外链】（头条签名图，实测没有防盗链）→ 页面不存图片本体
     · 点图 → 全屏放大（竞彩页原来没有看图机制，所以这里自带一层极简的，
       关闭方式 4 种：点图外空白 / × / Esc / 手机返回键）
   ⚠️ 这一块【不出任何裸 button 标签】—— 全用 <a role="button"> 和 <summary>。
      （注释里也不写那个标签的字面量：页面不变量是靠数 <button 这个串来验的，
        写在注释里会被一起数进去。这里只写 "button 标签"。）
   ⚠️ 图【不占】图位属性（没有 data-image / data-ro-mob）。
   ⚠️ 【不用】水印 —— 用户已明确要求删掉水印，这里也不画。
   ⚠️ class 带 allow-save：用户规定「晒票是三个允许保存的地方之一」。
      同时把它从防截图的模糊区里豁免（它不在 #article / .guard 里面，
      所以 locked 时本来也不会被模糊 —— 位置选在这里也正好有这个好处）。
   ============================================================ */
function buildJcXyspHtml() {
  /* ⚠️ 用【过滤过的】JC_XYSP（已按 30 天窗口去掉过期、按 img 去重），
     不是原始文件内容 —— 页面不能盲信缓存文件（见上面那段说明）。 */
  const data = JC_XYSP.items;
  /* 票面新鲜度小字（__FRESH_STAMP__，时间读自 football-tickets.js 的 FB_TICKETS_UPDATED） */
  const stamp = TICKETS_STAMP_HTML;

  const cells = [];
  data.forEach((it) => {
    const img = String((it && it.img) || '');
    if (!/^https:\/\//i.test(img)) return;        /* 只认 https（http 会被浏览器当混合内容拦掉） */
    const thumb = String((it && it.thumb) || '') || img;
    const title = String((it && it.title) || '');
    const kind = String((it && it.game) || '');
    /* 描述行 = 玩法 + 标题（例：「2串1 · 8 元 2 串 1 喜提 9600…」） */
    const desc = kind ? (kind + (title ? ' · ' + title : '')) : title;
    cells.push(
      /* href = 原图地址（点开看大图）；thumb 只在 src 里。
         referrerpolicy="no-referrer"：外链图不把来源带过去。
         onerror：票面图挂了 → 隐藏 <img>、给卡片加 .jxp-bad，
           由 CSS 画一个米杏色占位块写「票面加载失败」（用户要求：加载失败显示占位）。
           ⚠️ 只是加 class，不改布局、不弹窗、不写任何存储。 */
      `<a class="jxp-pic" href="${esc(img)}" data-jxp-i="${cells.length}">` +
      `<img class="jxp-thumb" src="${esc(thumb)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" ` +
      `onerror="this.style.display='none';if(this.parentNode)this.parentNode.className+=' jxp-bad'">` +
      `<span class="jxp-cap">` +
      `<b>${esc(kind || '竞彩')}</b>` +
      (desc ? `<i>${esc(desc)}</i>` : '') +
      `</span></a>`
    );
  });

  const head =
    `<summary class="jxp-head">` +
    `<span class="jxp-title">晒票</span>` +
    `<span class="jxp-tag">竞彩实票</span>` +
    /* 【票面新鲜度】紧跟在「竞彩实票」标签后面（11px 小字，收起状态下也看得见） */
    stamp +
    `<span class="jxp-tip" aria-hidden="true"></span>` +
    `</summary>`;

  const body = cells.length
    ? `<div class="jxp-grid">${cells.join('')}</div>`
    /* 用户 2026-10-18：0 张时的兜底也不能承诺「每 30 分钟」（源挂了就变 0 张，那句会露出来）
       → 和底部那句统一口径。 */
    : `<div class="jxp-empty">暂无竞彩晒票（电脑开着时自动更新）</div>`;

  /* 区块自己的底部：实时更新 + 合规声明（用户要求） */
  const foot =
    `<div class="jxp-foot">` +
    `仅供娱乐，不构成购彩建议` +
    /* 用户 2026-10-18：标题行已写「票面更新于 X」，底部再写「每 30 分钟自动更新」
       会自相矛盾（22 小时前 vs 每 30 分钟）→ 改成不承诺具体频率的说法。
       __NO_UPDATED__ 用户要求删掉「更新于」 */
    ` · 电脑开着时自动更新` +
    `</div>`;

  return `<details class="m-jxp allow-save" id="jcXysp">` +
    head +
    `<div class="jxp-body">` +
    `<div class="jxp-sub">全网竞彩实票 · 共 ${data.length} 张 · 图片仅供参考 · 点图可放大</div>` +
    body +
    foot +
    `</div>` +
    `</details>`;
}
const jcXyspHtml = buildJcXyspHtml();

/* ============================================================
   【专家推荐 · 20 篇 · 每小时抓】
   用户 2026-10-18：「竞彩晒票下面新增：专家推荐 / 文章要有 20 篇 /
     去抓取今日头条和一起彩和 www.500.com / 一小时抓一次 / 按时间顺序一直抓」
   数据来自 jc-articles.js（build-jc-articles.mjs 生成）。
   构建时读一次；读不到就整块不渲染（绝不影响整页生成）。
   ============================================================ */
function buildJcArticlesHtml() {
  let data = null;
  try {
    const f = path.join(ROOT, 'jc-articles.js');
    if (fs.existsSync(f)) {
      const ctx = vm.createContext({});
      vm.runInContext(fs.readFileSync(f, 'utf8') + '\n;globalThis.__A = JC_ARTICLES;', ctx);
      data = ctx.__A;
    }
  } catch (e) { data = null; }
  /* 【整块删除 · 用户 2026-10-19「这几个都删除」】
     不管数据有没有，这块（专家推荐 + 空态文案）都不再渲染。
     数据和脚本（build-jc-articles.mjs / jc-articles.js）都还在，
     以后用户想恢复，把这一行 return '' 删掉即可。 */
  return '';
  if (!data || !Array.isArray(data.list) || !data.list.length) return '';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* 时间显示：抓到具体时间就显示「MM-DD HH:MM」，没有就留空（按时间倒序已经排过） */
  const fmtTime = (ms) => {
    if (!ms) return '';
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const okSources = (data.sources || []).filter((s) => s.ok).map((s) => s.name);
  const badSources = (data.sources || []).filter((s) => !s.ok).map((s) => s.name);

  /* __NO_LOTTO_IN_FB__ 用户 2026-10-18：「足球页面的专家推荐放到双色球那边」
     足球页只留足球内容：标题或链接里带彩票彩种/彩票玩法的，一律不进足球页。
     ★ 全被过滤掉时不拿彩票条目凑数 → 走块内空态（结构不动）。 */
  const LOTTO_RE = /双色球|大乐透|福彩\s*3D|排列[三五]|排列3|排列5|快乐\s*8|七乐彩|七星彩|红球|蓝球|胆码|杀号|杀蓝|定胆|组三|组六/;
  const LOTTO_URL_RE = /ssqex|dltex|3dex|pl3ex|pl5ex|kl8ex|qlcex|qxcex|ssq|dlt/i;
  const fbList = (data.list || []).filter((it) =>
    !LOTTO_RE.test(String(it.title || '')) && !LOTTO_URL_RE.test(String(it.url || '')));
  const useList = fbList;
  if (!useList.length) {
    return '<details class="m-card3 jca" id="jcExpertArticles">' +
      '<summary class="jca-head">' +
      '<span class="jca-h-title">专家推荐</span>' +
      '<span class="jca-h-sub">足球专家分析 · 每小时更新</span>' +
      '<span class="jca-h-go">点击收起</span>' +
      '</summary>' +
      '<div class="jca-row"><span class="jca-main"><span class="jca-title">本轮暂无足球专家免费分析（每小时自动抓取，抓到就出现在这里）</span></span></div>' +
      '</details>';
  }

  const rows = useList.slice(0, 20).map((it, i) => {
    const t = fmtTime(it.time);
    /* ⚠️ 不做外链：项目有「数据源留痕」断言，页面里出现来源站域名会直接让构建失败。
       所以这里只展示「标题 + 时间」，点不了外链（想看原文可以按标题自己去搜）。 */
    return '<div class="jca-row">' +
      '<span class="jca-idx">' + (i + 1) + '</span>' +
      /* __STRIP_FREE__ 用户 2026-10-18：「抓取的专家文章要去掉免费推荐几个字」 */
      '<span class="jca-main"><span class="jca-title">' +
        esc(String(it.title || '').replace(/[·・\-—]*\s*免费推荐\s*/g, '').replace(/\s{2,}/g, ' ').trim()) + '</span>' +
      '<span class="jca-meta">' +
      (t ? '<span class="jca-time">' + esc(t) + '</span>' : '<span class="jca-time">刚刚</span>') +
      '</span></span>' +
      '</div>';
  }).join('');

  return '<details class="m-card3 jca" id="jcExpertArticles">' +
    '<summary class="jca-head">' +
    /* __NO_LOTTO_IN_FB__ 用户 2026-10-18：「足球页面的专家推荐放到双色球那边」
     足球页只留足球内容：含彩票彩种关键词的条目一律不进足球页。 */
  '<span class="jca-h-title">专家推荐</span>' +
    '<span class="jca-h-sub">' + useList.length + ' 篇 · 每小时更新 · ' +
    '综合整理' + '</span>' +
    '<span class="jca-h-go">点击收起</span>' +
    '</summary>' +
    '<div class="jca-list">' + rows + '</div>' +
    /* __HIDE_SKIP_NOTE__ 用户 2026-10-18：「这些提示不要显示」→ 不再显示"暂时抓不到" */
  '' +
    (data.updated ? '<div class="jca-upd">更新时间 ' + esc(data.updated) + '</div>' : '') +
    '</details>';
}
const jcArticlesHtml = buildJcArticlesHtml();

/* 【看大图 · 全屏层】竞彩页原来没有看图机制，所以这里自带一层极简的。
   关闭方式 4 种（和分享页那套一致的思路）：
     · 点图片外的空白
     · 右上角 ×
     · Esc
     · 手机返回键（进去时 push 一个 history 状态，popstate 时关掉）
   这一层放在页面最下面（折叠区外面），整块收起时也能弹出来。 */
const JC_XYSP_VIEW =
  `<div class="jxp-view allow-save" id="jcXyspView" hidden>` +
  `<div class="jxp-view-bar">` +
  `<span class="jxp-view-tip">点图外 / × / 返回键 → 关闭</span>` +
  `<a role="button" tabindex="0" class="jxp-view-x" id="jcXyspViewX">×</a>` +
  `</div>` +
  `<div class="jxp-view-box" id="jcXyspViewBox">` +
  `<img class="jxp-view-img" id="jcXyspViewImg" alt="竞彩晒票大图">` +
  `</div>` +
  /* 【滑动提示】用户要求底部给一句「上下滑动切换」。
     有相册时脚本会把它改成「第 N / M 张 · 上下滑动切换」。
     ⚠️ 用 <span>（不是 button 标签），且 pointer-events:none 不挡点击。 */
  `<span class="jxp-view-hint" id="jcXyspHint">上下滑动切换</span>` +
  `</div>`;

/* 分组 */
const order = [['upcoming', '未开赛'], ['live', '进行中'], ['finished', '已完场']];
let cards = '';
order.forEach(([kind, label]) => {
  const arr = MATCHES.filter((m) => m.kind === kind);
  if (kind === 'finished') arr.sort((a, b) => String(b.time).localeCompare(String(a.time)));
  else arr.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  /* __FB_SEC_COL__ 用户要求：三个分段（未开赛/进行中/已完场）
     也要能收起，默认【收起】，点了才展开 —— 和彩票推荐那边的架构一致。
     用原生 <details> 折叠（不写 JS 也能用），提示文字由 CSS 按 [open] 切换。 */
  /* __FB_ENTRY_ROW__ 用户要求：分段入口改成「横排 entry 行」——
     左：标题 + 副标题（N 场），右：「点击查看 / 点击收起」。
     ⚠️ 仍然是原生 <details> + <summary>（点整行照常开合），一个裸 <button> 都没有。
     ⚠️ 旧的类名一个都没删（m-subhead / m-subcount / m-sectip）：
        防截图那套 `html.locked .m-sec > summary`、以及 [open] 切换
        「点击查看 / 点击收起」的 ::after 伪元素全靠它们命中，动了就坏。 */
  cards += `<details class="m-sec" id="sec-${kind}">` +
    `<summary class="m-subhead entry-item">` +
    `<span class="left">` +
    `<span class="t m-subname">${label}</span>` +
    `<span class="d m-subcount">${arr.length} 场</span>` +
    `</span>` +
    `<span class="right m-sectip" aria-hidden="true"></span>` +
    `</summary>`;
  if (!arr.length) {
    cards += `<div class="m-empty">这个分类下暂时没有比赛</div>`;
  } else {
    /* .guard = 受保护区域：locked 时这一块会被模糊（分段标题 summary 留在外面，照样能点） */
    cards += `<div class="guard">`;
    arr.forEach((m) => { cards += renderMatch(m); });
    cards += `</div>`;
  }
  cards += `</details>`;
});

/* ---------- 页面 ---------- */
const nav = `
<style>
.site-nav { position: sticky; top: 0; z-index: 99; display: flex; background: rgba(15,17,21,0.96); border-bottom: 1px solid #262d3a; }
.site-nav a { flex: 1; text-align: center; padding: 13px 10px; font-size: 14px; font-weight: 600; color: #6b7488; text-decoration: none; border-bottom: 2px solid transparent; }
.site-nav a.on { color: #47e0a0; border-bottom-color: #47e0a0; }
</style>`;

const CSS = `
* { box-sizing: border-box; }
body { margin: 0; background: #0f1115; color: #e8eaed;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
.wrap { max-width: 820px; margin: 0 auto; padding: 16px 14px 60px; }
h1 { font-size: 21px; margin: 6px 0 4px; }
.sub { font-size: 12.5px; color: #98a1b2; margin-bottom: 14px; line-height: 1.7; }
.stat { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.stat > div { flex: 1 1 90px; background: #161a21; border: 1px solid #262d3a;
  border-radius: 10px; padding: 10px 12px; text-align: center; }
.stat b { display: block; font-size: 19px; color: #47e0a0; }
.stat span { font-size: 11.5px; color: #98a1b2; }
.record { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  background: #161a21; border: 1px solid #262d3a; border-radius: 10px;
  padding: 11px 14px; margin-bottom: 16px; font-size: 13px; }
.record .t { color: #98a1b2; }
.record .h { color: #f0575c; font-weight: 700; }
.record .m { color: #6b7488; font-weight: 700; }
.record .r { color: #f0b429; font-weight: 700; }
.record .n { color: #6b7488; font-size: 11.5px; }
.m-subhead { display: flex; align-items: center; gap: 8px; font-size: 14px;
  font-weight: 700; color: #e8eaed; margin: 18px 0 10px; }
/* __FB_SEC_COL__ 分段可收起的样式（details/summary 原生折叠） */
.m-sec { margin-bottom: 4px; }
.m-sec > summary.m-subhead { cursor: pointer; list-style: none; user-select: none; display: flex; align-items: center; gap: 8px; }
.m-sec > summary.m-subhead::-webkit-details-marker { display: none; }
.m-sec > summary.m-subhead::marker { content: ''; }
.m-sectip { margin-left: auto; font-size: 11.5px; font-weight: 400; color: #47e0a0; opacity: .9; }
.m-sec[open] > summary.m-subhead .m-sectip::after { content: '点击收起'; }
.m-sec:not([open]) > summary.m-subhead .m-sectip::after { content: '点击查看'; }

.m-subcount { font-size: 11.5px; color: #6b7488; font-weight: 400;
  background: #12151d; padding: 2px 8px; border-radius: 20px; }
.m-card { background: #161a21; border: 1px solid #262d3a; border-left: 3px solid #262d3a;
  border-radius: 11px; padding: 12px 14px; margin-bottom: 10px; }
.m-card.win { border-left-color: #f0575c; }
.m-card.lose { border-left-color: #6b7488; }
/* 历史归档场次：左边框更暗、整卡略淡，和「本次在售」区分开 */
.m-card.hist { border-left-style: dashed; opacity: .88; }
.m-card.hist.win { border-left-color: #f0575c; }
.m-card.hist.lose { border-left-color: #6b7488; }
/* 【比赛详情页】整张卡片的 <a> 外壳（__MATCH_DETAIL_LINK__）——
   只是包一层，卡片自身的边框/底色/圆角一个字没动；
   display:block + color:inherit 保证里面的文字颜色不被链接色改掉。 */
.m-cardlink { display: block; color: inherit; text-decoration: none; cursor: pointer; }
/* 【修】原来这里是 #1b2029（深色主题遗留）—— 米杏主题下按下卡片会闪一下深蓝黑。
   换成米杏的深一档（--ro-sunken 再压深），按下只是"按下去"的感觉。 */
.m-cardlink:active .m-card { background: #eadfc8; }
/* 卡片右下角那句「看这场数据 ›」，提示这卡能点 */
.m-godetail { display: block; margin-top: 8px; text-align: right;
  font-size: 11.5px; font-weight: 700; color: #47e0a0; }
.m-top { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; flex-wrap: wrap; }
.m-code { font-size: 11.5px; font-weight: 700; color: #98a1b2;
  background: #12151d; padding: 2px 8px; border-radius: 5px; }
.m-league { font-size: 12px; color: #98a1b2; }
.m-round { font-size: 11px; color: #6b7488; }
.m-time { margin-left: auto; font-size: 12px; color: #6b7488; font-family: Consolas, monospace; }
.m-st { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 5px; }
.m-st.live { color: #f0575c; background: rgba(240,87,92,0.14); }
.m-st.fin { color: #98a1b2; background: #262d3a; }
.m-teams { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.m-team { flex: 1 1 0; min-width: 0; font-size: 14px; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m-team.home { text-align: right; }
.m-team i { font-style: normal; font-size: 11px; color: #6b7488; margin: 0 3px; }
.m-hc { font-size: 11px; color: #f0b429; margin-left: 3px; }
.m-vs { flex: 0 0 auto; min-width: 62px; text-align: center; font-size: 14px;  color: #6b7488; font-family: Consolas, monospace; font-weight: 700; }
.m-vs.live { color: #47e0a0; }
/* 【已完场比分】用户 2026-10-17：「已完场要有比分显示」。
   .final = 已完场的最终比分，主色加粗（和「进行中」同一套 .m-vs，只换颜色）；
   ⚠️ 没比分时这个 span 里是「—」（.m-vs.final 也适用，看着就是"记录缺失"）。 */
.m-vs.final { color: #e8eaed; font-weight: 800; letter-spacing: .3px; }
.m-odds { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; flex-wrap: wrap; }
.m-ol { flex: 0 0 34px; font-size: 11.5px; color: #6b7488; }
.m-ov { font-size: 12px; color: #e8eaed; background: #12151d;
  padding: 2px 9px; border-radius: 5px; font-family: Consolas, monospace; }
.m-ov.on { background: rgba(71,224,160,0.16); color: #47e0a0; font-weight: 700; }
.m-reco { display: flex; align-items: center; gap: 9px; margin-top: 9px;
  padding-top: 9px; border-top: 1px solid #1e2430; flex-wrap: wrap; }
.m-pick { font-size: 12.5px; color: #98a1b2; }
.m-pick b { color: #47e0a0; font-size: 14px; }
.m-rb { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 5px; }
.m-rb.hit { background: rgba(240,87,92,0.18); color: #f0575c; }
.m-rb.miss { background: #262d3a; color: #6b7488; }
.m-conf { font-size: 11.5px; color: #98a1b2; }
/* 【可点击的分类卡】未开赛 / 进行中 / 已完场 */
.stat a { flex: 1; display: block; text-align: center; text-decoration: none;
  background: #12151d; border: 1px solid #262d3a; border-radius: 10px;
  padding: 13px 8px 11px; cursor: pointer; transition: border-color .15s, background .15s; }
.stat a:active { background: #12151d; border-color: #47e0a0; }
.stat a b { display: block; font-size: 25px; font-weight: 800; color: #47e0a0;
  font-variant-numeric: tabular-nums; line-height: 1.1; }
.stat a span { display: block; margin-top: 5px; font-size: 12.5px; color: #98a1b2; }
/* 【三个统计卡的颜色】用户要求：只有「进行中」用白色，其余（未开赛/已完场）用绿色。
   ⚠️ 用 :nth-child(2) 定位"进行中"（顺序 = 未开赛 / 进行中 / 已完场，见上面的 .stat）。 */
.stat a:nth-child(2) b { color: #e8eaed; }
.m-empty { padding: 22px 12px; text-align: center; font-size: 13px;
  color: #6b7488; background: #12151d; border-radius: 10px; margin-bottom: 12px; }
/* 点分类卡跳过去时，标题不要被顶部导航挡住 */
.m-subhead { scroll-margin-top: 58px; }
.m-probs { margin-left: auto; display: flex; gap: 5px; }
.m-probs i { font-style: normal; font-size: 11px; color: #6b7488;
  background: #12151d; padding: 2px 7px; border-radius: 4px; }
.m-probs i.on { color: #47e0a0; background: rgba(71,224,160,0.14); font-weight: 700; }
.m-noodds { font-size: 12px; color: #6b7488; }
/* 【两组百分比胶囊】推荐行右侧：胜平负（3 个）+ 不败（2 个）__RECO_UNBEATEN__
   .opt        = 没被推荐的那个（次级色底 + 副文字）
   .opt.active = 推荐的那个（主色底 + 白字 + 加粗）
   ⚠️ 原来那三个 <i> 的规则（上面的 .m-probs i）【原样保留没动】；
      这里用新类名 .opt，和计算器已有的 .calc-opt 是两个类名，不冲突。 */
.m-probrows { margin-left: auto; display: flex; flex-direction: column;
  align-items: flex-end; gap: 4px; min-width: 0; }
.m-probrow { display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
  justify-content: flex-end; }
.m-problab { font-size: 10.5px; color: #6b7488; margin-right: 1px; white-space: nowrap; }
/* 【不败三档标签】用户 2026-10-17 设计：主不败 / 平手交流 / 客不败（都带概率）
   主不败=P(主胜)+P(平)、客不败=P(客胜)+P(平)、平手交流=P(平)（用户确认「就是平局那个选项」） */
.m-tags { display: inline-flex; align-items: center; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
.m-tag.orange { font-style: normal; font-size: 11px; color: #e0a13c;
  background: rgba(224,161,60,0.14); padding: 2px 7px; border-radius: 4px; font-weight: 700; }
/* 【胜平负 EV】用户 2026-10-17：「新增 EV 值展示区」
   公式：EV = 模型概率 × 赔率 − 1 → 百分比。正数绿（期望盈利）、负数红（期望亏损） */
.m-ev { display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  margin-top: 7px; padding-top: 7px; border-top: 1px dashed #262d3a; }
.m-evlab { font-size: 10.5px; color: #6b7488; white-space: nowrap; }
.m-evitem { font-size: 11px; color: #98a1b2; background: #12151d; padding: 2px 7px;
  border-radius: 4px; font-variant-numeric: tabular-nums; }
.m-evitem.pos { color: #47e0a0; background: rgba(71,224,160,0.14); font-weight: 700; }
.m-evitem.neg { color: #e0687a; background: rgba(224,104,122,0.12); }
/* 【折叠】用户 2026-10-17：点头部折叠/展开，右侧 ▾ 跟着转
   ⚠️ 实测被别处的 transform/display 规则压住过 → 这两条用 !important 钉住 */
.m-card { cursor: pointer; }
.m-fold { margin-left: auto; font-size: 11px; color: #6b7488; line-height: 1;
  transition: transform .15s; }
.m-card.folded .m-body { display: none !important; }
.m-card.folded .m-fold { transform: rotate(-90deg) !important; }
/* 【比分推荐 · 3 个】用户 2026-10-17 追加。
   一行放「比分推荐」标签 + 三个比分胶囊（大号比分 + 小号百分比）+ 一句说明。
   ⚠️ 375 / 320 都要不挤爆：胶囊 white-space:nowrap 但整行 flex-wrap，
      320px 下三个胶囊放不下会折到第二行（不横向溢出）。 */
.m-scorepick { display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  margin-top: 7px; padding-top: 7px; border-top: 1px dashed #262d3a; }
.m-sp-lab { font-size: 10.5px; color: #6b7488; white-space: nowrap; }
.m-sp-list { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; min-width: 0; }
.m-sp-item { display: inline-flex; align-items: baseline; gap: 3px;
  padding: 2px 8px; border-radius: 12px; background: #12151d;
  border: 1px solid #262d3a; white-space: nowrap; }
.m-sp-item b { font-size: 12.5px; font-weight: 800; color: #e8eaed; letter-spacing: .2px; }
.m-sp-item i { font-style: normal; font-size: 10px; color: #6b7488; }
.m-sp-item:first-child { border-color: rgba(71,224,160,0.45); }
.m-sp-item:first-child b { color: #47e0a0; }
.m-sp-none { font-size: 12.5px; color: #6b7488; }
.m-sp-note { font-size: 10px; color: #6b7488; margin-left: auto; white-space: nowrap; }
.opt { font-style: normal; font-size: 11px; padding: 3px 8px; border-radius: 12px;
  background: #12151d; color: #6b7488; white-space: nowrap; }
.opt.active { background: #47e0a0; color: #0b0d11; font-weight: 700; }
.note { margin-top: 22px; padding: 13px 15px; background: #12151d;
  border: 1px solid #1e2430; border-radius: 10px; font-size: 11.5px;
  color: #6b7488; line-height: 1.9; }
.brand { margin-top: 22px; text-align: center; font-size: 12.5px; color: #f0575c; }
/* ---- 亚指综合换算卡片（手机优先，格子 auto-fit 自适应） ---- */
.m-ai { margin-top: 10px; padding: 11px 12px; background: #12151d;
  border: 1px solid #262d3a; border-radius: 10px; }
.m-ai-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.m-ai-title { font-size: 12.5px; font-weight: 700; color: #e8eaed; }
.m-ai-tag { font-size: 11.5px; font-weight: 700; padding: 2px 9px; border-radius: 6px;
  color: #f0b429; background: rgba(240,180,41,0.14);
  border: 1px solid rgba(240,180,41,0.35); white-space: nowrap; }
.m-ai-fun { margin-left: auto; font-size: 10.5px; color: #6b7488;
  border: 1px solid #262d3a; border-radius: 20px; padding: 1px 8px; white-space: nowrap; }
.m-ai-line { font-size: 11.5px; color: #98a1b2; line-height: 1.8;
  font-family: Consolas, monospace; word-break: break-word; margin-bottom: 9px; }
.m-ai-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 7px; margin-bottom: 8px; }
.m-ai-cell { display: flex; flex-direction: column; gap: 3px; background: #0f1115;
  border: 1px solid #262d3a; border-radius: 8px; padding: 7px 9px;
  min-width: 0; overflow: hidden; }
.m-ai-cell i { font-style: normal; font-size: 10.5px; color: #6b7488; white-space: nowrap; }
.m-ai-cell b { font-size: 13.5px; font-weight: 700; color: #e8eaed;
  font-family: Consolas, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m-ai-cell.on { border-color: rgba(71,224,160,0.4); background: rgba(71,224,160,0.08); }
.m-ai-cell.on b { color: #47e0a0; }
.m-ai-dev { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; margin-bottom: 7px; }
.m-ai-dev-v { font-size: 12.5px; font-weight: 700; font-family: Consolas, monospace; }
.m-ai-dev-v.up { color: #f0575c; }
.m-ai-dev-v.down { color: #47e0a0; }
.m-ai-dev-u { font-size: 10.5px; color: #6b7488; }
.m-ai-hot { font-size: 12px; color: #f0b429; line-height: 1.75; margin-bottom: 7px; }
.m-ai-src { font-size: 10.5px; color: #6b7488; line-height: 1.7; }
.m-ai-miss { font-size: 11px; color: #98a1b2; line-height: 1.8; background: #12151d;
  border: 1px dashed #262d3a; border-radius: 8px; padding: 7px 9px; margin-bottom: 6px; }
.m-ai-note { font-size: 10.5px; color: #6b7488; line-height: 1.7; }
/* 盘口升降标签（升盘降水 / 降盘降水 / 升盘升水 / 降盘升水 / 无明显变化） */
.m-ai-change { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 9px; }
.m-ai-change-tag { font-size: 11.5px; font-weight: 700; padding: 2px 9px; border-radius: 6px;
  color: #98a1b2; background: #12151d;
  border: 1px solid #262d3a; white-space: nowrap; }
.m-ai-change-d { font-size: 10.5px; color: #6b7488; font-family: Consolas, monospace;
  word-break: break-word; }
/* ---- 模拟计算器（竞彩页唯一可操作的区块；可收起，默认收起） ---- */
/* 折叠做法和上面三个分段 .m-sec 完全一致：原生 details/summary，
   提示文字由 CSS 按 [open] 切换，不写 JS 也能用。 */
.m-calc { margin-top: 22px; background: #12151d;
  border: 1px solid #262d3a; border-radius: 12px; }
.m-calc > summary.calc-head { cursor: pointer; list-style: none; user-select: none;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 12px 14px; }
.m-calc > summary.calc-head::-webkit-details-marker { display: none; }
.m-calc > summary.calc-head::marker { content: ''; }
.calc-tip { margin-left: 8px; font-size: 11.5px; font-weight: 400; color: #47e0a0;
  opacity: .9; white-space: nowrap; }
.m-calc[open] > summary.calc-head .calc-tip::after { content: '点击收起'; }
.m-calc:not([open]) > summary.calc-head .calc-tip::after { content: '点击查看'; }
.calc-body { padding: 0 14px 13px; }
.calc-head .calc-title { font-size: 14.5px; font-weight: 800; color: #e8eaed; letter-spacing: .5px; }
.calc-sub { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font-size: 11.5px; color: #98a1b2; line-height: 1.7; margin-bottom: 10px; }
.calc-sub-t { flex: 1 1 auto; min-width: 0; }
.calc-sel { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.calc-sel select { padding: 3px 6px; background: #0f1115; border: 1px solid #262d3a;
  border-radius: 6px; color: #e8eaed; font-size: 12px; font-family: Consolas, monospace; }
.calc-rand { margin-left: auto; font-weight: 700; color: #47e0a0;
  background: rgba(71,224,160,0.10); border-color: rgba(71,224,160,0.42); }
.calc-shot-btn { margin-left: 2px; color: #98a1b2; border-color: #262d3a;
  background: #12151d; }
/* ---- 【晒票】竞彩实票图片区块（位置：模拟计算下面、免责声明上面） ----
   用户原话：「竞赛页面 也做一个晒票 你去全网抓取晒票的 和抓彩票的程序编码一样」
   观感/做法照抄分享页的「晒票」栏和本页的 .m-calc：
     · 原生 details/summary 折叠，默认【收起】，提示文字纯 CSS 按 [open] 切
     · 配色沿用本页既有色板：#12151d 底 / #262d3a 边 / #e8eaed 正文 /
       #98a1b2 次要 / #47e0a0 主色（不引入任何新颜色）
     · 图片是外链，页面不存本体
   布局：手机 2 列；宽屏(>=620px) 4 列。 */
.m-jxp { margin-top: 22px; background: #12151d;
  border: 1px solid #262d3a; border-radius: 12px; }
.m-jxp > summary.jxp-head { cursor: pointer; list-style: none; user-select: none;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 12px 14px; }
.m-jxp > summary.jxp-head::-webkit-details-marker { display: none; }
.m-jxp > summary.jxp-head::marker { content: ''; }
.jxp-title { font-size: 14.5px; font-weight: 800; color: #e8eaed; letter-spacing: .5px; }
.jxp-tag { font-size: 11px; color: #47e0a0; background: rgba(71,224,160,0.10);
  border: 1px solid rgba(71,224,160,0.42); border-radius: 20px; padding: 1px 8px;
  white-space: nowrap; }
.jxp-tip { margin-left: auto; font-size: 11.5px; font-weight: 400; color: #47e0a0;
  opacity: .9; white-space: nowrap; }
.m-jxp[open] > summary.jxp-head .jxp-tip::after { content: '点击收起'; }
.m-jxp:not([open]) > summary.jxp-head .jxp-tip::after { content: '点击查看'; }
.jxp-body { padding: 0 14px 13px; }
.jxp-sub { font-size: 11.5px; color: #98a1b2; line-height: 1.7; }
.jxp-grid { display: grid; gap: 9px; margin-top: 11px;
  grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 620px) {
  .jxp-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.jxp-pic { display: block; background: #161a21; border: 1px solid #262d3a;
  border-radius: 10px; overflow: hidden; text-decoration: none;
  -webkit-tap-highlight-color: transparent; transition: border-color .15s; }
.jxp-pic:hover, .jxp-pic:active { border-color: #47e0a0; }
.jxp-thumb { display: block; width: 100%; height: auto; min-height: 60px;
  background: #0f1115; }
.jxp-cap { display: block; padding: 5px 7px 6px; }
.jxp-cap b { display: block; font-size: 11.5px; font-weight: 700; color: #47e0a0; }
.jxp-cap i { margin-top: 2px; font-style: normal; font-size: 10.5px;
  line-height: 1.35; color: #98a1b2; word-break: break-word;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; }
.jxp-empty { margin-top: 11px; font-size: 12px; color: #6b7488; }
/* ---- 票面图【加载失败】的占位（用户要求：加载失败显示占位）----
   onerror 只做两件事：把 <img> 藏掉 + 给卡片加 .jxp-bad。
   .jxp-bad 里的 ::before 就是那块米杏色占位 + 一行说明字。
   ⚠️ 米杏色在后面的配色覆盖里还会再刷一次（保持一致）。 */
.jxp-pic.jxp-bad { position: relative; min-height: 96px; }
.jxp-pic.jxp-bad::before { content: '票面加载失败';
  position: absolute; left: 0; right: 0; top: 0; bottom: 30px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11.5px; color: #a08e73; text-align: center; padding: 0 6px;
  background: #f3e6d0; }
.jxp-foot { margin-top: 10px; font-size: 10.5px; color: #6b7488; }
/* ---- 看大图全屏层（点晒票的图打开；4 种关闭方式） ----
   z-index 100002：高于遮罩 #mask(99998) 和保存图片层 calc-shot(100001)，
   owner 徽章 100002 —— 同层没关系，徽章在右上角、不重叠。 */
.jxp-view { position: fixed; left: 0; top: 0; right: 0; bottom: 0; display: none;
  background: rgba(15,17,21,0.97); z-index: 100002; flex-direction: column; }
.jxp-view[hidden] { display: none !important; }
.jxp-view:not([hidden]) { display: flex; }
.jxp-view-bar { display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; flex: 0 0 auto; }
.jxp-view-tip { flex: 1 1 auto; font-size: 11.5px; color: #98a1b2; }
.jxp-view-x { flex: 0 0 auto; font-size: 20px; line-height: 1; font-weight: 700;
  color: #e8eaed; text-decoration: none; padding: 4px 12px;
  border: 1px solid #262d3a; border-radius: 8px; background: #161a21;
  cursor: pointer; user-select: none; }
.jxp-view-box { flex: 1 1 auto; display: flex; align-items: center;
  justify-content: center; overflow: auto; padding: 0 10px 14px; }
.jxp-view-img { max-width: 100%; max-height: 100%; border-radius: 10px;
  background: #0f1115; }
/* 【滑动提示】底部居中一句「第 N / M 张 · 上下滑动切换」。
   不挡点击（pointer-events:none），文字小而灰，和分享页那条提示风格一致。 */
.jxp-view-hint { position: absolute; left: 0; right: 0;
  bottom: calc(6px + env(safe-area-inset-bottom, 0px));
  text-align: center; font-size: 11.5px; color: #98a1b2;
  pointer-events: none; }
/* ---- 保存图片 · 全屏层（默认隐藏） ---- */
.calc-shot { display: none; position: fixed; left: 0; top: 0; right: 0; bottom: 0;
  z-index: 999; background: rgba(15,17,21,0.95); padding: 14px;
  flex-direction: column; align-items: center; justify-content: center; }
.calc-shot.on { display: flex; }
.calc-shot-bar { width: 100%; max-width: 760px; display: flex; align-items: center;
  gap: 10px; margin-bottom: 10px; }
.calc-shot-tip { flex: 1 1 auto; font-size: 12px; color: #98a1b2; }
.calc-shot-x { font-size: 17px; line-height: 1; color: #e8eaed; background: #12151d;
  border: 1px solid #262d3a; border-radius: 8px; padding: 4px 12px; cursor: pointer;
  user-select: none; -webkit-user-select: none; }
.calc-shot-img { max-width: 100%; max-height: 78vh; border-radius: 10px; background: #0f1115; }
/* ============================================================
   防截图锁定（把整页内容在「失焦 / 切窗口 / 截屏按键」时模糊 + 盖一层遮罩）
   ------------------------------------------------------------
   · 保护容器： #article（顶部标题/统计卡/战绩） + .guard（三个分段里的比赛卡片、
                底部免责声明区）
   · 【豁免】  .m-calc（模拟计算）和 .m-sec（三个分段）—— locked 时浮在遮罩之上，
                仍然能点开、能勾选；分段里的卡片本身在 .guard 里，照样被模糊
   · 层高： 内容 < 水印(99997→100000) … 遮罩 99998 < 豁免区 99999 < 水印 100000
   · ⚠️ 这套东西只是【提高门槛】，不能真正禁止截图（详见页面说明）
   ============================================================ */
body { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
input, select, textarea { user-select: auto; -webkit-user-select: auto; }
#article, .guard { transition: filter .15s ease; }
html.locked #article, html.locked .guard { filter: blur(25px) grayscale(1); pointer-events: none; }
#mask { display: none; position: fixed; left: 0; top: 0; right: 0; bottom: 0;
  background: rgba(15,17,21,0.96); color: #e8eaed; z-index: 99998;
  align-items: center; justify-content: center; text-align: center;
  font-size: 20px; line-height: 1.8; padding: 40px; flex-direction: column; }
html.locked #mask { display: flex; }
#mask .mask-s { margin-top: 12px; font-size: 13px; color: #98a1b2; line-height: 1.9; }
/* 【不要水印】—— 用户明确要求去掉，页面里不再有任何水印容器 / 样式 / 绘制逻辑 */
.owner-tag { display: none; width: max-content; max-width: 100%;
  margin: 2px 0 2px auto;
  font-size: 11.5px; font-weight: 700; color: #f0b429; background: rgba(240,180,41,0.12);
  border: 1px solid rgba(240,180,41,0.42); border-radius: 20px; padding: 3px 10px;
  white-space: nowrap; pointer-events: none; }
html.is-owner .owner-tag { display: block; }
/* 【豁免区】locked 时压住遮罩，保持清晰可点 */
html.locked .m-calc, html.locked .m-sec { filter: none !important;
  pointer-events: auto !important; position: relative; z-index: 99999; }
html.locked .m-calc * , html.locked .m-sec > summary { pointer-events: auto !important; }
html.locked .m-calc, html.locked .m-calc input, html.locked .m-calc select, html.locked .m-calc label {
  user-select: auto !important; -webkit-user-select: auto !important; }
/* 保存图片的全屏层始终在最上面（用户自己生成的那张图，locked 时也要能看/能存） */
.calc-shot { z-index: 100001; }
@media print {
  #article, .guard { filter: blur(25px) grayscale(1) !important; }
  #mask { display: flex !important; }
}
.calc-tag { font-size: 10.5px; color: #f0b429; background: rgba(240,180,41,0.13);
  border: 1px solid rgba(240,180,41,0.32); border-radius: 20px; padding: 1px 8px; white-space: nowrap; }
.calc-src { margin-left: auto; font-size: 10.5px; color: #6b7488; }
.calc-rows { display: flex; flex-direction: column; gap: 8px; }
.calc-row { background: #161a21; border: 1px solid #262d3a; border-radius: 10px; padding: 9px 10px; }
.calc-mt { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-bottom: 6px; }
.calc-code { font-size: 11px; font-weight: 700; color: #98a1b2;
  background: #12151d; padding: 1px 7px; border-radius: 5px; }
.calc-league { font-size: 11px; color: #98a1b2; }
.calc-time { margin-left: auto; font-size: 11px; color: #6b7488; font-family: Consolas, monospace; }
.calc-teams { display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
  font-size: 13px; font-weight: 600; color: #e8eaed; margin-bottom: 7px; }
.calc-vs { font-size: 10.5px; font-weight: 400; color: #6b7488; }
.calc-opts { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 5px; }
.calc-ol { flex: 0 0 auto; min-width: 52px; font-size: 11px; color: #6b7488; }
.calc-opt { display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
  background: #12151d; border: 1px solid #262d3a; border-radius: 7px; padding: 4px 8px;
  font-size: 11.5px; color: #e8eaed; user-select: none; -webkit-user-select: none; }
.calc-opt input { width: 14px; height: 14px; margin: 0; cursor: pointer; accent-color: #47e0a0; }
.calc-opt-o { font-family: Consolas, monospace; color: #98a1b2; }
.calc-opt.on { background: rgba(71,224,160,0.14); border-color: #47e0a0; color: #47e0a0; }
.calc-opt.on .calc-opt-o { color: #47e0a0; font-weight: 700; }
.calc-bar { margin-top: 11px; padding-top: 11px; border-top: 1px solid #1e2430; }
.calc-stat { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-size: 11.5px; color: #98a1b2; }
.calc-stat b { color: #e8eaed; font-family: Consolas, monospace; }
.calc-mul { display: inline-flex; align-items: center; gap: 5px; }
.calc-mul input { width: 58px; padding: 3px 6px; background: #0f1115; border: 1px solid #262d3a;
  border-radius: 6px; color: #e8eaed; font-size: 12.5px; font-family: Consolas, monospace; }
.calc-btn { margin-left: auto; padding: 4px 12px; font-size: 11.5px; color: #98a1b2;
  background: #12151d; border: 1px solid #262d3a; border-radius: 7px;
  cursor: pointer; user-select: none; -webkit-user-select: none; }
.calc-btn:active { background: #262d3a; color: #47e0a0; }
.calc-prize { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-top: 9px; }
.calc-prize-l { font-size: 12px; color: #98a1b2; }
.calc-prize b { font-size: 20px; font-weight: 800; color: #47e0a0;
  font-family: Consolas, monospace; font-variant-numeric: tabular-nums; }
.calc-prize-h { font-size: 10.5px; color: #6b7488; }
.calc-warn { margin-top: 7px; font-size: 11.5px; color: #f0b429; line-height: 1.7; }
.calc-warn:empty { display: none; }
.calc-foot { margin-top: 7px; font-size: 10.5px; color: #6b7488; }
.calc-empty { margin-bottom: 8px; padding: 9px 10px; background: #12151d;
  border: 1px dashed #262d3a; border-radius: 8px; font-size: 12px; color: #98a1b2; line-height: 1.8; }
.calc-note { margin-top: 11px; padding: 10px 11px; background: #0f1115;
  border: 1px solid #1e2430; border-radius: 9px; font-size: 10.5px; color: #6b7488; line-height: 1.9; }
.calc-disclaim { margin-top: 9px; padding-top: 8px; border-top: 1px dashed #262d3a;
  font-size: 10.5px; color: #6b7488; line-height: 1.8; }
.calc-disclaim b { color: #98a1b2; font-weight: 700; }
/* ---- 【推荐串】紧凑列表（可收起、默认收起；一行一场，字号比比赛卡片小一档） ---- */
.m-rec { margin-bottom: 4px; }
.m-rec > summary.m-rechead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  cursor: pointer; list-style: none; user-select: none; margin: 14px 0 8px; }
.m-rec > summary.m-rechead::-webkit-details-marker { display: none; }
.m-rec > summary.m-rechead::marker { content: ''; }
/* 推荐卡片里的提示行（用户指定文案） */
.m-rectips { font-size: 11px; color: #a89a80; padding: 2px 2px 8px; }
/* 推荐串行里的主客排名（真实字段，不是估算） */
.m-recrank { font-size: 11px; color: #8a7a63; }
.arch-day { margin: 6px 0 10px; }
.arch-day-h { font-size: 11.5px; font-weight: 700; color: #8a7a63; padding: 4px 2px; border-bottom: 1px dashed #e8d7bd; margin-bottom: 4px; }
.arch-conf { font-size: 11px; color: #8a7a63; margin-right: 6px; font-variant-numeric: tabular-nums; }
.m-recknow { font-size: 11px; color: #8a6a3a; background: #fff6e6; border: 1px solid #f0dfa8; border-radius: 8px; padding: 6px 8px; margin: -2px 0 8px; line-height: 1.5; }
.m-recknow i { display: block; font-style: normal; color: #a89a80; font-size: 10.5px; margin-top: 2px; }
.m-rectitle { font-size: 14px; font-weight: 700; color: #e8eaed; }
.m-reccount { font-size: 11px; color: #6b7488; background: #12151d;
  padding: 2px 8px; border-radius: 20px; }
.m-rectip { margin-left: auto; font-size: 11.5px; font-weight: 400; color: #47e0a0; opacity: .9; }
.m-rec[open] > summary.m-rechead .m-rectip::after { content: '点击收起'; }
.m-rec:not([open]) > summary.m-rechead .m-rectip::after { content: '点击查看'; }
.m-recnote { font-size: 10px; color: #6b7488; line-height: 1.6; margin: 0 0 4px; }
/* __RECROW_6COL__ 一行有 6 个元素（编号/队名/推荐/赔率/排名/信心），
   原来只有 5 列 → 第 6 个「信心%」会掉到下一行、贴左边，看着像断开的。
   这里补成 6 列；窄屏只收紧间距和字号，不动结构、不隐藏任何信息。 */
.m-recrow { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto auto auto;
  align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid #1e2430; }
/* __NOWRAP__ 用户 2026-10-18：「主胜后面的这些数据尽量一排 不要转行」
   做法：行内每一个 span 都禁止换行；队名那格允许被压缩（ellipsis）腾地方；
   窄屏只收紧间距/字号，绝不隐藏任何一项信息。 */
.m-recrow > span { white-space: nowrap; }
.m-recrow .m-recteams { min-width: 0; }
@media (max-width: 420px) {
  .m-recrow { gap: 4px; }
  .m-reccode { font-size: 10px; padding: 1px 4px; }
  .m-recteams { font-size: 12px; }
  .m-recpick, .m-recodds { font-size: 12px; }
  .m-recrank { font-size: 10px; }
  .m-recconf { font-size: 11.5px; }
}
@media (max-width: 360px) {
  .m-recrow { gap: 3px; }
  .m-reccode { font-size: 9.5px; padding: 1px 3px; }
  .m-recteams { font-size: 11.5px; }
  .m-recteams i { font-size: 9.5px; margin-left: 3px; }
  .m-recpick, .m-recodds { font-size: 11.5px; }
  .m-recrank { font-size: 9.5px; }
  .m-recconf { font-size: 11px; }
}
.m-recrow:last-child { border-bottom: 0; }
.m-reccode { font-size: 11px; font-weight: 700; color: #98a1b2; background: #12151d;
  padding: 1px 6px; border-radius: 4px; white-space: nowrap; }
.m-recteams { font-size: 12.5px; color: #e8eaed; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-recteams i { font-style: normal; font-size: 10.5px; color: #6b7488; margin-left: 5px; }
.m-recpick { font-size: 12.5px; font-weight: 700; color: #47e0a0; white-space: nowrap; }
.m-recodds { font-size: 12.5px; color: #98a1b2; white-space: nowrap; font-family: Consolas, monospace; }
.m-recconf { font-size: 12px; color: #98a1b2; white-space: nowrap; font-family: Consolas, monospace; }
.m-recconf.strong { color: #47e0a0; font-weight: 700; }
.m-recempty { font-size: 11.5px; color: #6b7488; padding: 8px 2px 10px; }

/* ============================================================
   __LIGHT_THEME__ 竞彩页 · 米杏色暖色调（和分享页同一套）
   ------------------------------------------------------------
   用户要求「整体换成浅色系主题」并给了米杏色配色，
   且明确「用一段 CSS 覆盖在样式表最后统一换色 —— 最省钱的路径」。
   ⚠️ 颜色和 export-static.mjs 里那段完全一致（两页统一），要改一起改。
   ⚠️ 防截图遮罩保持深色；模拟计算区块的功能一个字没动（只换色）。
   ============================================================ */
html, body { background: #f7efe1 !important; color: #4a3a26; }
.site-nav { background: rgba(247, 239, 225, .96) !important; border-bottom-color: #e8d7bd !important; }
.site-nav a { color: #8a7a63 !important; }
.site-nav a.on { color: #1a8c5a !important; border-bottom-color: #1a8c5a !important; }
[style*="#0f1115"] { background-color: #f7efe1 !important; }
[style*="#161a21"] { background-color: #fdf6ea !important; }
[style*="#12151d"] { background-color: #f3e6d0 !important; }
[style*="#0b0b0b"] { background-color: #f7efe1 !important; }
[style*="#141414"] { background-color: #fdf6ea !important; }
[style*="#222"]    { background-color: #e8d7bd !important; }
[style*="#262d3a"] { border-color: #e8d7bd !important; }
[style*="#1e2430"] { border-color: #efe2cc !important; }
[style*="#e8eaed"] { color: #4a3a26 !important; }
[style*="#98a1b2"] { color: #8a7a63 !important; }
[style*="#6b7488"] { color: #a2937c !important; }
[style*="#47e0a0"] { color: #1a8c5a !important; }
[style*="#22c07a"] { color: #1a8c5a !important; }
[style*="#f0575c"] { color: #c0392b !important; }
[style*="#f0b429"] { color: #f5b301 !important; }
/* 主要容器换米杏底 + 暖边框（列举式覆盖，不动布局） */
body, .m-sec, .m-calc, .m-jxp, .m-rec, .wrap, .page { color: #4a3a26; }
.m-sec, .m-calc, .m-jxp, .m-rec { background: #fdf6ea !important; border-color: #e8d7bd !important; }
.jxp-pic, .m-subhead, .jxp-view-box { background: #f3e6d0 !important; border-color: #efe2cc !important; }
.m-sectip { color: #1a8c5a !important; }
/* 全屏看图保持深色（看图背景）+ 遮罩保持深色 */
.jxp-view { background: rgba(11, 13, 17, .97) !important; }
.jxp-view-tip, .jxp-view-hint { color: #c8cfda !important; }
#mask { background: rgba(0, 0, 0, 0.96) !important; }

/* ============================================================
   __JC_ALIGN__ 竞彩页顶部几块对齐米杏色（用户 2026-10-17 给了整页设计参考）
   ------------------------------------------------------------
   为什么单独补这一段：上面那层覆盖用的是【属性选择器】（[style*="#161a21"]），
   只对行内样式生效；而 .stat / .record / .m-subcount / .m-subhead 这些颜色
   是写在 <style> 的【类规则】里的，所以一直是深色没被换掉 ——
   实测截图里：统计是黑卡片、战绩条黑底、四个入口是深色小胶囊配灰字，几乎看不清。
   ⚠️ 这一段【只改颜色/间距/字号】，不动任何结构、不动 JS：
      · .stat 里三个数字仍是 <a href="#sec-...">（点一下跳到那一栏，功能保留）
      · .m-sec > summary / .m-rec > summary 仍是原生 details 折叠（保留）
      · 模拟计算那块的功能一个字没动，只把底栏 .calc-bar 换成浅色
   ⚠️ 规则必须写在这个位置（样式表最后、!important），才能压过上面的深色类规则。
   ============================================================ */
/* ① 统计条：三张米杏卡片（数字绿 / 标签灰） */
.stat { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  gap: 8px !important; margin: 0 0 12px !important; padding: 0 !important; }
.stat > a { display: block !important; background: #fdf6ea !important;
  border: 1px solid #e8d7bd !important; border-radius: 10px !important;
  padding: 14px 6px !important; text-align: center !important; text-decoration: none !important; }
.stat > a b { display: block !important; font-size: 26px !important; font-weight: 700 !important;
  line-height: 1.1 !important; color: #1a8c5a !important; font-variant-numeric: tabular-nums; }
.stat > a span { display: block !important; margin-top: 6px !important;
  font-size: 12px !important; color: #8a7a63 !important; }
/* ② 战绩条：米杏卡片 · 标签深棕加粗 · 红/黑/命中率按设计参考配色 */
.record { display: flex !important; align-items: center !important; flex-wrap: wrap !important;
  background: #fdf6ea !important; border: 1px solid #e8d7bd !important; border-radius: 10px !important;
  padding: 12px 14px !important; margin: 0 0 10px !important; font-size: 13px !important; gap: 0 !important; }
.record .t { color: #4a3a26 !important; font-weight: 700 !important; margin-right: 10px !important; }
.record .h { color: #c0392b !important; font-weight: 700 !important; }
.record .m { color: #8a7a63 !important; font-weight: 700 !important; margin-left: 8px !important; }
.record .r { color: #c0392b !important; font-weight: 700 !important; margin-left: 8px !important; }
.record .n { color: #8a7a63 !important; font-size: 11px !important; margin-left: 8px !important; }
/* ③ 分段入口 / 推荐串入口：深色小胶囊 → 浅底可读（深色胶囊配灰字实测看不清） */
.m-subhead { color: #4a3a26 !important; }
.m-subcount, .m-reccount { background: #f3e6d0 !important; color: #8a7a63 !important; }
.m-rechead .m-rectitle { color: #4a3a26 !important; }
/* ③b 【推荐串战绩数字】从顶部那条搬进「推荐串」入口行（用户 2026-10-17 要求）：
   沿用原来那条的配色（红=#c0392b / 黑与备注=#8a7a63），不引新色。 */
.m-recstat { display: inline-flex !important; align-items: center !important; gap: 8px !important;
  flex-wrap: wrap !important; font-size: 12.5px !important; line-height: 1.5 !important; }
.m-recstat .h { color: #c0392b !important; font-weight: 700 !important; }
.m-recstat .m { color: #8a7a63 !important; font-weight: 700 !important; }
.m-recstat .r { color: #c0392b !important; font-weight: 700 !important; }
.m-recstat .n { color: #8a7a63 !important; font-size: 11px !important; }
/* ④ 模拟计算底栏：浅色（功能不动） */
.calc-bar { border-top-color: #efe2cc !important; }
.calc-stat { color: #8a7a63 !important; }
.calc-stat b { color: #4a3a26 !important; }
.calc-mul input { background: #fffdf8 !important; border-color: #e8d7bd !important; color: #4a3a26 !important; }
.calc-bar .calc-btn { background: #fdf6ea !important; border: 1px solid #e8d7bd !important; color: #4a3a26 !important; }
/* 主按钮 + 金标签：对齐设计参考。
   ⚠️ 这里【只】写竞彩页真实存在的按钮：
      .calc-shot-btn =「保存图片」、.calc-rand = App 端「GPT随机」（竞彩页没有，不写）。
   用 :is() 把优先级提到 (0,2,1)，压过基础规则 .calc-btn.calc-shot-btn（0,2,0）——
   否则两条打平只能靠书写顺序决胜，以后谁挪一下位置就又变深色了。 */
.calc-bar :is(.calc-btn).calc-rand { background: #1a8c5a !important; border-color: #1a8c5a !important;
  color: #fff !important; font-weight: 600 !important; }
.calc-bar .tag { font-size: 11px !important; color: #d9a300 !important;
  border: 1px solid #d9a300 !important; border-radius: 10px !important; padding: 2px 8px !important; }
/* ⑤ 折叠区标题（模拟计算 / 晒票）：按设计参考改成绿字加粗 */
.calc-head .calc-title, .jxp-head .jxp-title { color: #1a8c5a !important; }
.calc-tag, .jxp-tag { color: #d9a300 !important; background: rgba(217, 163, 0, .12) !important;
  border-color: #d9a300 !important; }
/* ⑥ 折叠标题行里的按钮（保存图片 / 晒票那条）：
   ⚠️ 它们不在 .calc-bar 里，而是 <summary class="calc-head"> 的直接子元素，
      所以上面那条 .calc-bar .calc-btn 命中不到（实测：还是深色 #12151d + 灰字）。
   用 :is() 提优先级，压过基础规则 .calc-btn.calc-shot-btn（两条同优先级会靠顺序决胜）。 */
.calc-head :is(.calc-btn), .jxp-head :is(.calc-btn) { background: #fdf6ea !important;
  border: 1px solid #e8d7bd !important; color: #4a3a26 !important; }
/* ⑦ 模拟计算【内容区】也改成浅色
   ------------------------------------------------------------
   用户 2026-10-17 反馈：把外壳换成浅色后，展开内容还是黑底（比赛卡片 / 下拉 /
   GPT随机按钮 / 选项勾选 / 奖金数字 / 怎么算的），成了"浅色壳 + 深色内容"的夹生页。
   这一段把展开态的元素一起换成米杏色；【只改颜色和边框】，
   不动结构、不动 JS（勾选、几串几、注数金额计算全部照旧）。 */
.calc-body { color: #4a3a26 !important; }
.calc-sub, .calc-sub-t { color: #8a7a63 !important; }
.calc-sel select, .calc-sel select option { background: #fffdf8 !important;
  border-color: #e8d7bd !important; color: #4a3a26 !important; }
.calc-rand { background: #e3f2ea !important; border-color: #b7e4cd !important; color: #1a8c5a !important; }
.calc-row { background: #fdf6ea !important; border-color: #e8d7bd !important; }
.calc-code { background: #f3e6d0 !important; color: #4a3a26 !important; }
.calc-league { color: #8a7a63 !important; }
.calc-time { color: #a2937c !important; }
.calc-teams { color: #4a3a26 !important; }
.calc-vs { color: #a2937c !important; }
.calc-ol { color: #8a7a63 !important; }
.calc-opt { background: #fffdf8 !important; border-color: #e8d7bd !important; color: #4a3a26 !important; }
.calc-opt-o { color: #8a7a63 !important; }
.calc-opt.on { background: #e8f6ef !important; border-color: #1a8c5a !important; color: #1a8c5a !important; }
.calc-opt.on .calc-opt-o { color: #1a8c5a !important; }
.calc-opt input { accent-color: #1a8c5a !important; }
.calc-prize-l, .calc-prize-h { color: #8a7a63 !important; }
.calc-prize b { color: #1a8c5a !important; }
.calc-warn { color: #b8860b !important; }
.calc-foot { color: #a2937c !important; }
.calc-note { background: #f3e6d0 !important; border-color: #efe2cc !important; color: #8a7a63 !important; }
.calc-note b { color: #4a3a26 !important; }
.calc-disclaim { border-top-color: #e8d7bd !important; color: #8a7a63 !important; }
.calc-disclaim b { color: #4a3a26 !important; }
/* ⑧ 推荐串【详情：往期比对】 —— 用户要求「前后24小时窗口 + 红黑结果 + 存档比对」
   结构和 .m-recrow 一致，只是多一层"批次"（某一期的一串）分组。
   ⚠️ 第三种状态"待定"（比赛还没打完）：.m-rb 原本只有 hit/miss 两种，
      这里补 .wait —— 绝不能把待定显示成黑（那是在编造结果）。 */
.m-rechead2 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin: 12px 0 6px; padding-top: 10px; border-top: 1px dashed #e8d7bd;
  font-size: 12.5px; font-weight: 700; color: #4a3a26; }
.m-recsum { margin-left: auto; font-size: 11.5px; font-weight: 700; color: #c0392b; }
.m-recbatch { background: #f3e6d0; border: 1px solid #efe2cc; border-radius: 8px;
  padding: 8px 10px; margin-bottom: 8px; }
.m-recbhead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 6px; font-size: 11.5px; }
.m-recbat { color: #4a3a26; font-weight: 700; }
.m-recbnote { color: #8a7a63; font-size: 11px; }
.m-recrow-arch { padding: 3px 0; border-bottom: 1px dotted #e8d7bd; }
.m-recrow-arch:last-child { border-bottom: 0; }
.m-rb.wait { background: #fdf6ea; color: #8a7a63; border: 1px solid #e8d7bd; }

/* ---- 【往期推荐串】用户 2026-10-17 给的模块结构与样式（按用户给的原样落地）----
   .past-recommend-section > .past-header(.label + .stats-right#pastStats) > .past-list#pastList
   每条：.past-item > .past-item-head(时间 + .badge 红/黑) + .past-match-row(.teams/.result/.status-*) */
.past-recommend-section {
  background: #fdf6ea;
  border: 1px solid #e8d7bd;
  border-radius: 10px;
  margin: 0 12px 12px;
  padding: 12px;
}
.past-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.past-header .label {
  font-size: 14px;
  font-weight: 800;
  color: #4a3a26;
}
.past-header .stats-right {
  font-size: 13px;
  font-weight: 700;
  color: #c0392b; /* 红色统计 */
}
.past-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* 单条往期卡片 */
.past-item {
  background: #fff;
  border: 1px solid #e8d7bd;
  border-radius: 8px;
  padding: 10px;
}
.past-item-head {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #8a7a63;
  margin-bottom: 8px;
  border-bottom: 1px dashed #f0e2cc;
  padding-bottom: 6px;
}
.past-item-head .badge {
  background: #e3f2ea;
  color: #1a8c5a;
  padding: 1px 6px;
  border-radius: 4px;
}
.past-match-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  padding: 6px 0;
}
.past-match-row .teams { color: #4a3a26; flex: 1; }
.past-match-row .result { color: #8a7a63; margin-right: 10px; }
.past-match-row .status-red { color: #c0392b; font-weight: 700; }
.past-match-row .status-black { color: #8a7a63; font-weight: 700; }
/* 补充（用户没给、这两句是空态/提示用，沿用同色系） */
.past-pending { font-size: 11px; color: #8a7a63; padding: 0 0 6px; }
/* 【刷新心跳】推荐历史结果卡最下面那一行小字：数据更新 02:05 · 已同步 02:31:12
   （用户 2026-10-18：「显示最后更新时间，让用户看到在刷」）
   · 米杏色同系（#8a7a63 字 / #f0e2cc 虚线）、10.5px、右对齐 → 320px 也不会撑开
   · 单独成行（border-top 分隔），不挤标题行那一条 flex */
.reco-sync {
  font-size: 11px;
  line-height: 1.6;
  color: #8a7a63;
  text-align: right;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #f0e2cc;
  white-space: normal;
  word-break: break-word;
}
.past-empty { font-size: 11.5px; color: #8a7a63; padding: 6px 0; }
.past-list .loading-text { font-size: 11px; color: #8a7a63; }

/* ============================================================
   __FB_ENTRY_BAR__ 竞彩页 · entry 行 + 底部操作条（用户设计稿）
   ------------------------------------------------------------
   这一整块【只改样式，不动任何功能】：
     · 折叠：仍然是原生 <details>/<summary>，[open] 切换逻辑一个字没变
       （「点击查看 / 点击收起」还是 .m-sectip / .m-rectip 的 ::after 伪元素）
     · 模拟计算：5 个元素（模拟计算 / 仅供娱乐参考 / 保存图片 / 赔率 / 点击查看）
       本来就在同一个 <summary class="calc-head"> 里，markup 只多了 3 个类名
       （bottom-bar / btn2 / tag），文字和功能一个字没动。
   ⚠️ 颜色全部走变量，本页是米杏【浅色】主题，所以下面这组值就是浅色主题的色值。
      （上一版这里写的是 --ro-*，但那组变量整个项目里【从来没定义过】——
         var() 取不到值 = 该条声明作废，于是 entry 行没有卡片底也没有边框。
         现在变量在下面 :root 里定死，改色只改这一处。）
   ============================================================ */
:root {
  --card: #fdf6ea;        /* 卡片底（= __LIGHT_THEME__ 的卡片色） */
  --border: #e8d7bd;      /* 暖边框 */
  --text: #4a3a26;        /* 主文字 */
  --text-sub: #8a7a63;    /* 副文字 */
  --green: #1a8c5a;       /* 主色（绿） */
  --gold: #d9a300;        /* 金标签 */
}

/* ① 三个分段 + 推荐串 → 横排 entry 行（左：标题 + 副标题 / 右：「点击查看」）
   ⚠️ 折叠功能一个字没动：仍然是原生 <details> + <summary>，
      [open] 切换还是靠 .m-sec[open] / .m-rec[open] 那两条 ::after 伪元素。
   ⚠️ 一个裸 <button> 都没有（这里全是 <summary>）。
   下面 4 条 = 用户给的样式规格，原样照抄。 */
.entry-item { display:flex; align-items:center; justify-content:space-between;
  background:var(--card); border:1px solid var(--border);
  border-radius:10px; padding:12px 14px; margin-bottom:8px; }
.entry-item .left .t { font-size:14px; font-weight:600; }
.entry-item .left .d { font-size:11px; color:var(--text-sub); margin-top:3px; }
.entry-item .right { font-size:12px; color:var(--green); white-space:nowrap; }

/* ①-补：上面 4 条要真的成立还差这几句（规格里没写，不写会散）：
   .left 必须竖排（标题一行、副标题一行），.right 必须靠右且不吃掉剩余宽度。
   基础规则 .m-sec > summary.m-subhead 也设了 gap，这里提优先级压回规格值。
   ⚠️ background / border 必须 !important —— 米杏色主题里有一条
      「.jxp-pic, .m-subhead, .jxp-view-box { background:#f3e6d0 !important;
        border-color:#efe2cc !important }」
      （实测：三个分段的 entry 行会变成 #f3e6d0 + #efe2cc，和推荐串那条 #fdf6ea 不一致）。 */
.m-sec > summary.entry-item,
.m-rec > summary.entry-item { gap: 4px 10px !important; }
.entry-item { background: var(--card) !important; border: 1px solid var(--border) !important; }
.entry-item .left { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.entry-item .left .t { color: var(--text) !important; }
/* 场次数（副标题）：去掉原来的深色小胶囊，只留 11px 副文字色 */
.entry-item .left .d { color: var(--text-sub) !important; background: transparent !important;
  border: 0 !important; border-radius: 0 !important; padding: 0 !important; }
.entry-item .right { order: 9; flex: 0 0 auto; margin-left: auto !important;
  font-weight: 400 !important; color: var(--green) !important; opacity: 1 !important; }

/* ② 底部操作条：[模拟计算][仅供娱乐参考][保存图片]  赔率：体彩官网官方 SP  点击查看
   ⚠️ 这 5 个元素本来就都在同一个 <summary class="calc-head"> 里 ——
      markup 只加了 .bottom-bar / .btn2 / .tag 三个类名，文字一个字没动、功能一个字没动。
      「保存图片」是 <a role="button">，不是裸 <button>。
   ⚠️ 「模拟计算」= .btn2.primary（绿底白字）·「仅供娱乐参考」= .tag（金标签）·
      「保存图片」= .btn2（卡片底 + 边框）·「赔率 + 点击查看」顶到最右
      —— 规格里写的是 .bottom-bar .spacer{flex:1}，这里用 .bottom-bar::before
      当那个弹性空档，省得为了排版多插一个 <span>（少动 DOM）。 */
.bottom-bar { display:flex; align-items:center; gap:8px; margin-top:16px; flex-wrap:wrap; }
.btn2 { padding:8px 14px; border-radius:8px; font-size:13px; border:1px solid var(--border);
  background:var(--card); }
.btn2.primary { background:var(--green); color:#fff; font-weight:600; }
.tag { font-size:11px; color:var(--gold); border:1px solid var(--gold);
  border-radius:10px; padding:2px 8px; }
.bottom-bar .spacer { flex:1; }
/* 弹性空档（等价于 .spacer{flex:1}）：宽屏把「赔率 / 点击查看」顶到最右。
   ⚠️ 必须同时给「赔率 / 点击查看」排 order（8 / 9）—— 空档自己是 order:7，
      不排的话它会被放到最后一位（默认 order:0），变成"吃掉尾巴的空白"而不是空档，
      实测「赔率」会紧贴在「保存图片」右边、右边一大片空的。 */
.bottom-bar::before { content: ''; order: 7; flex: 1 1 0; min-width: 0; }

/* ②-补：上面 4 条要压过【本段之前】的基础深色规则 + 米杏主题里的那些 !important。
   ⚠️ 必须连 font-size / padding / border-radius 一起 !important：
      基础规则「.calc-head .calc-title」是 (0,2,0)，比「.btn2」的 (0,1,0) 高 ——
      只写 .btn2 的话「模拟计算」会按 14.5px/800 渲染（实测 88px 宽、比另外两个按钮高）。
   ⚠️ .calc-btn 基础规则自带 margin-left:auto，这里归零，否则「保存图片」会被顶到最右、
      和「赔率」抢剩余空间；靠右这件事交给上面那个 ::before 空档一个人做。 */
.bottom-bar .btn2 { padding: 8px 14px !important; border-radius: 8px !important;
  font-size: 13px !important; background: var(--card) !important;
  border: 1px solid var(--border) !important; color: var(--text) !important;
  margin-left: 0 !important; }
.bottom-bar .btn2.primary { background: var(--green) !important; border-color: var(--green) !important;
  color: #fff !important; font-weight: 600 !important; letter-spacing: 0 !important; }
.bottom-bar .tag { font-size: 11px !important; border-radius: 10px !important; padding: 2px 8px !important;
  color: var(--gold) !important; background: transparent !important;
  border: 1px solid var(--gold) !important; }
.bottom-bar .calc-src { order: 8; margin-left: 0 !important; font-size: 12px !important;
  color: var(--text-sub) !important; white-space: nowrap !important; }
.bottom-bar .calc-tip { order: 9; margin-left: 0 !important; font-size: 12px !important;
  color: var(--green) !important; }

/* ②-窄屏：这 5 个元素在手机上挤不进一行（实测 442px 内容宽要 460px+）。
   规格里的 flex-wrap 本来就是留给这种情况的，但直接让它自己折会把「点击查看」
   单独甩到第三行左侧 —— 所以窄屏主动排成两行：
     第一行三个按钮（保存图片吃掉剩余宽度）· 第二行「赔率 + 点击查看」整体靠右。 */
@media (max-width: 620px) {
  .bottom-bar::before { display: none !important; }
  .bottom-bar { justify-content: flex-end !important; }
  .bottom-bar .calc-shot-btn { margin-right: auto !important; }
}

/* ③ 三个统计卡颜色：未开赛=绿 · 进行中=白 · 已完场=绿
   ⚠️ 本页已经是米杏【浅色】主题，纯白（#fff）在浅底上根本看不见 ——
      所以「进行中」用主文字色（= 设计稿里"白"这一档在浅色主题下的对应值）。
      顺序 = 未开赛 / 进行中 / 已完场（见页面里的 .stat）→ :nth-child(2) 就是进行中。 */
.stat a:nth-child(2) b { color: var(--text) !important; }
.stat a:not(:nth-child(2)) b { color: var(--green) !important; }

/* ③-补 推荐串列表 · 浅色主题下的可读性（只换色，不动 grid → 还是一行一场）
   ------------------------------------------------------------
   实测：这一行的颜色还是【深色主题】那一套 —— 队名 #e8eaed（近白）画在米杏底上
   几乎看不见，行间分隔线 #1e2430（近黑）也过重。这里只覆盖颜色。
   ⚠️ 结构一个字没动：还是 .m-recrow 那 5 列 grid（编号 + 队名/联赛 + 推荐 + 赔率 + 信心）。 */
.m-rec .m-recrow { border-bottom-color: #efe2cc !important; }
.m-rec .m-recteams { color: var(--text) !important; }
.m-rec .m-recteams i { color: var(--text-sub) !important; }
.m-rec .m-recpick { color: var(--green) !important; }
.m-rec .m-recodds { color: var(--text) !important; }
.m-rec .m-recconf { color: var(--text-sub) !important; }
.m-rec .m-recconf.strong { color: var(--green) !important; }

/* ============================================================
   __JC_ALIGN_CARD__ 比赛详情 / 亚指块 换米杏色（用户：「竞猜这边点开也要换色」）
   ------------------------------------------------------------
   上面那层 __JC_ALIGN__ 覆盖的是统计条/战绩条/模拟计算；
   这一层补【比赛详情卡片】那批 —— 它们仍是 CSS 类规则里的深色。
   ⚠️ 只改颜色，不动结构/间距/字号；全屏看图与遮罩保持深色。
   ============================================================ */
/* ① 比赛卡片本体 */
.m-card { background: #fdf6ea !important; border-color: #e8d7bd !important;
  border-left: 3px solid #e8d7bd !important; }
.m-card.win { border-left-color: #c0392b !important; }
.m-card.lose { border-left-color: #a2937c !important; }
.m-card.hist { opacity: .95 !important; }
.m-card.hist.win { border-left-color: #c0392b !important; }
.m-card.hist.lose { border-left-color: #a2937c !important; }

/* ② 卡片头部：编号 / 联赛 / 轮次 / 时间 / 状态 */
.m-code { background: #f3e6d0 !important; color: #8a7a63 !important; }
.m-league { color: #8a7a63 !important; }
.m-round, .m-time { color: #a2937c !important; }
.m-st { color: #8a7a63 !important; background: #f3e6d0 !important; }
.m-st.live { color: #c0392b !important; background: #fbe4e2 !important; }
.m-st.fin { color: #8a7a63 !important; background: #efe2cc !important; }

/* ③ 队名 / 比分 / 让球标记 */
.m-team { color: #4a3a26 !important; }
.m-team i { color: #a2937c !important; }
.m-hc { color: #b8860b !important; }
.m-vs { color: #a2937c !important; }
.m-vs.live { color: #1a8c5a !important; }
/* 【已完场比分 · 米杏色主题】最终比分用主文字色加粗（比进行中的主色稍弱一档，
   一眼能区分"已结束"和"进行中"；未记录时显示 —，同一个颜色规则） */
.m-vs.final { color: #4a3a26 !important; font-weight: 800 !important; }

/* ④ 欧赔那一行 */
.m-ol { color: #a2937c !important; }
.m-ov { color: #4a3a26 !important; background: #f3e6d0 !important; }
.m-ov.on { background: #e3f2ea !important; color: #1a8c5a !important; }

/* ⑤ 推荐那一行 */
.m-reco { border-top-color: #efe2cc !important; }
.m-pick { color: #8a7a63 !important; }
.m-pick b { color: #1a8c5a !important; }
.m-rb.hit { background: #fbe4e2 !important; color: #c0392b !important; }
.m-rb.miss { background: #efe2cc !important; color: #8a7a63 !important; }
.m-conf { color: #8a7a63 !important; }

/* ⑥ 分类小标签 / 空态 / 说明条 */
.m-subcount { color: #a2937c !important; background: #f3e6d0 !important; }
.m-probs i { color: #a2937c !important; background: #f3e6d0 !important; }
.m-probs i.on { color: #1a8c5a !important; background: #e3f2ea !important; }
/* 【两组百分比胶囊】米杏色主题（用户给的设计：次级色底 + 副文字 / 主色底 + #fff 加粗）
   __RECO_UNBEATEN__ —— 必须写在这里（!important + 靠后），才压得过上面的深色 .opt */
.m-problab { color: #8a7a63 !important; }
.opt { background: #f3e6d0 !important; color: #8a7a63 !important; }
.opt.active { background: #1a8c5a !important; color: #fff !important; font-weight: 700 !important; }
.m-noodds { color: #a2937c !important; }
/* 【比分推荐 · 3 个】米杏色主题覆盖（必须写在深色规则后面 + !important，才压得过） */
.m-scorepick { border-top-color: #efe2cc !important; }
.m-sp-lab { color: #8a7a63 !important; }
.m-sp-item { background: #f3e6d0 !important; border-color: #e8d7bd !important; }
.m-sp-item b { color: #4a3a26 !important; }
.m-sp-item i { color: #8a7a63 !important; }
.m-sp-item:first-child { border-color: #1a8c5a !important; background: #e3f2ea !important; }
.m-sp-item:first-child b { color: #1a8c5a !important; }
.m-sp-none { color: #a2937c !important; }
.m-sp-note { color: #a2937c !important; }
.m-empty { color: #a2937c !important; background: #f3e6d0 !important; }
.note { background: #f3e6d0 !important; border-color: #e8d7bd !important; color: #8a7a63 !important; }
.brand { color: #c0392b !important; }

/* ⑦ 亚指综合换算（.m-ai 及其子件） */
.m-ai { background: #f3e6d0 !important; border-color: #e8d7bd !important; }
.m-ai-title { color: #4a3a26 !important; }
.m-ai-tag { color: #b8860b !important; background: rgba(184,134,11,.12) !important;
  border-color: rgba(184,134,11,.32) !important; }
.m-ai-fun { color: #a2937c !important; border-color: #e8d7bd !important; }
.m-ai-line { color: #8a7a63 !important; }
.m-ai-cell { background: #fdf6ea !important; border-color: #e8d7bd !important; }
.m-ai-cell i { color: #a2937c !important; }
.m-ai-cell b { color: #4a3a26 !important; }
.m-ai-cell.on { border-color: rgba(26,140,90,.42) !important; background: #e3f2ea !important; }
.m-ai-cell.on b { color: #1a8c5a !important; }
.m-ai-dev-v.up { color: #c0392b !important; }
.m-ai-dev-v.down { color: #1a8c5a !important; }
.m-ai-dev-u, .m-ai-src, .m-ai-note, .m-ai-change-d { color: #a2937c !important; }
.m-ai-hot { color: #b8860b !important; }
.m-ai-miss { color: #8a7a63 !important; background: #f3e6d0 !important; border-color: #e8d7bd !important; }
.m-ai-change-tag { color: #8a7a63 !important; background: #fdf6ea !important;
  border-color: #e8d7bd !important; }

/* ⑧ 其它零散深色小件 */
.m-reccode { color: #8a7a63 !important; background: #f3e6d0 !important; }
.jxp-thumb { background: #efe2cc !important; }
.m-sec .m-subhead { color: #4a3a26 !important; }
.m-sectip { color: #1a8c5a !important; }


/* ============================================================
   __JC_CONTRAST_FIX__ 文字对比度兜底（米杏底上的字要看得清）
   ------------------------------------------------------------
   改完深色卡片后实测 48 处文字对比度 < 3.0，最差 1.37（几乎看不见）。
   原因：① 我上一版把弱文字映射成 #a2937c 太浅；
        ② 旧主题的 #98a1b2 / #47e0a0 / #d9a300 / #f0b429 还留在浅底上。
   这里统一加深：#8a7a63（≈3.3~3.8）· #1a8c5a（≈4.0）· #9c7000（≈4.0）。
   ⚠️ 只改颜色；只在这几处加 !important（原值在类规则里）。
   ============================================================ */
/* ① 我上一版映射过浅的：弱文字统一加深到 #8a7a63 */
.m-round, .m-time, .m-vs, .m-ol, .m-league, .m-code, .m-conf, .m-pick,
.m-subcount, .m-noodds, .m-empty, .m-team i,
.m-ai-fun, .m-ai-note, .m-ai-src, .m-ai-dev-u, .m-ai-change-d, .m-ai-line,
.m-probs i, .m-st, .m-st.fin, .m-rb.miss, .note, .calc-foot { color: #8a7a63 !important; }

/* ② 前一轮漏改文字的（旧主题色留在浅底上） */
.cd, .jxp-sub { color: #8a7a63 !important; }
.jxp-cap i { color: #8a7a63 !important; }
.jxp-cap b { color: #1a8c5a !important; }          /* 「2串1」原来是旧绿 #47e0a0 */
.m-godetail { color: #1a8c5a !important; }          /* 「看这场数据 ›」原来 1.37 */
.calc-tag.tag, .jxp-tag { color: #9c7000 !important; }
#ownerTag.owner-tag { color: #9c7000 !important; background: #fff6dd !important;
  border-color: #e8d7bd !important; }

/* ③ 绿/红强调也换成米杏主题里那对（旧 #47e0a0 / #f0575c 在浅底上偏亮） */
.m-pick b, .m-vs.live, .m-ai-cell.on b, .m-ai-dev-v.down { color: #1a8c5a !important; }
.m-ai-dev-v.up, .m-rb.hit, .m-st.live { color: #c0392b !important; }
.m-hc, .m-ai-hot { color: #9c7000 !important; }


/* __JC_CONTRAST_TAIL__ 收尾两处（上一轮漏的：亚指单元格标签 / 计算器行时间） */
.m-ai-cell i { color: #8a7a63 !important; }
.calc-time { color: #8a7a63 !important; }


/* ============================================================
   __JC_COMPACT__ 竞彩页紧凑排版（用户：「整个版面压缩一下，零零闪闪不好看」）
   ------------------------------------------------------------
   和分享页同一套口径：区块之间 12px、卡片内边距 10~12px。
   只改【纵向】间距；不写 font-size、不压 line-height、不用简写。
   ============================================================ */
:root { --jc-gap: 12px; }

/* ① 页面上下留白收敛（原来 wrap pb=60px） */
.wrap { padding-top: 12px !important; padding-bottom: 22px !important; }

/* ② 顶部：标题 → 副标题 → 统计条 → 战绩条 */
.sub { margin-bottom: 10px !important; }
.stat { margin-bottom: var(--jc-gap) !important; }
.record { margin-bottom: var(--jc-gap) !important; }

/* ③ 三个分段（未开赛/进行中/已完场）与它们的分段头 */
.m-sec { margin-bottom: 0 !important; }
.m-subhead { margin-top: 10px !important; margin-bottom: 8px !important;
  padding-top: 10px !important; padding-bottom: 10px !important; }

/* ④ 比赛卡片：卡片间距 8px、内边距 10px（原来 10/12） */
.m-card { margin-bottom: 8px !important; padding-top: 10px !important; padding-bottom: 10px !important; }
.m-top { margin-bottom: 6px !important; }        /* 卡片头部那行 */
.m-teams { margin-bottom: 6px !important; }      /* 队名/比分那行 */
.m-reco { margin-top: 6px !important; padding-top: 6px !important; }
.m-ai { margin-top: 8px !important; padding-top: 10px !important; padding-bottom: 10px !important; }
.m-godetail { margin-top: 6px !important; }

/* ⑤ 说明条 / 模拟计算 / 晒票：原来都是 mt=22，统一成 12 */
.note { margin-top: var(--jc-gap) !important; padding-top: 12px !important; padding-bottom: 12px !important; }
.m-calc, .m-jxp { margin-top: var(--jc-gap) !important; }
.calc-head { margin-top: 0 !important; padding-top: 10px !important; padding-bottom: 10px !important; }
.jxp-head { padding-top: 10px !important; padding-bottom: 10px !important; }
.m-rechead { margin-top: var(--jc-gap) !important; }
.m-rechead2 { margin-top: var(--jc-gap) !important; }
.guard { margin-top: var(--jc-gap) !important; }


/* ============ 泊松指数（用户队列⑥；米杏配色，和 .m-ai 同一套口径） ============ */
.m-ps { margin-top: 8px; padding: 10px 12px; background: #f3e6d0;
  border: 1px solid #e8d7bd; border-radius: 10px; }
.m-ps-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.m-ps-title { font-size: 12.5px; font-weight: 700; color: #4a3a26; }
.m-ps-src { font-size: 10.5px; color: #a2937c; background: #fdf6ea;
  border: 1px solid #e8d7bd; border-radius: 20px; padding: 1px 8px; }
.m-ps-fun { margin-left: auto; font-size: 10.5px; color: #a2937c;
  border: 1px solid #e8d7bd; border-radius: 20px; padding: 1px 8px; }
.m-ps-line { font-size: 11.5px; color: #8a7a63; line-height: 1.7; margin-bottom: 6px; }
.m-ps-line b { color: #4a3a26; font-family: Consolas, monospace; }
.m-ps-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px; margin-bottom: 6px; }
.m-ps-cell { display: flex; flex-direction: column; gap: 1px; background: #fdf6ea;
  border: 1px solid #e8d7bd; border-radius: 8px; padding: 6px 8px; min-width: 0; }
.m-ps-cell i { font-style: normal; font-size: 10.5px; color: #a2937c; }
.m-ps-cell b { font-size: 14px; font-weight: 700; color: #1a8c5a;
  font-family: Consolas, monospace; }
.m-ps-cell em { font-style: normal; font-size: 10.5px; color: #a2937c;
  font-family: Consolas, monospace; }
.m-ps-scores { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11.5px;
  color: #8a7a63; margin-bottom: 4px; }
.m-ps-scores b { color: #c0392b; font-family: Consolas, monospace; }
.m-ps-note { font-size: 10.5px; color: #a2937c; line-height: 1.7; }


/* ============================================================
   __JC_TEAM_WRAP__ 窄屏队名被切（用户：「320px 下有些队名少半截」）
   ------------------------------------------------------------
   实测（真 Chrome · 320px · 128 个 .m-team）：正好 8 处被切 ——
     米拉索尔(-1) 需要 107px 只有 91px · 弗洛西诺(-1) 101/91 · 伍尔弗汉普顿[10] 112/91
     麦克阿瑟FC(-1) 96/91 · 法兰克福(-1) 107/91 · 海伦芬(-1) 93/91
     登博思(-1) 93/91 · 圣路易斯城(-1) 93/91
   原因：基础规则里 .m-team 是 nowrap + overflow:hidden → 放不下就直接切掉，没有省略号提示。
   改法：只在【放不下时】折行，并放开裁切。能放下的宽度渲染结果一字不变（不加字号、不改间距）。
   ⚠️ 断点取 374px 而不是全局：375px 是用户实际宽度，必须逐像素不变。写成全局规则的话，
      将来队名变长就会把 375px 的省略号变成两行 —— 那点风险不该留。
   ⚠️ 最长的「伍尔弗汉普顿[10]」要到 ≈363px 才放得下，所以 360px 手机也在覆盖范围内。
   ⚠️ overflow-wrap:break-word 是给「一整串没有空格的拉丁队名」兜底的（中日韩文字本来就逐字可折），
      它只在单词本身放不下时才生效 → 不会改变本来放得下的行的排版。
   ============================================================ */
@media (max-width: 374px) {
  .m-team { white-space: normal !important; overflow: visible !important;
    overflow-wrap: break-word !important; }
}


/* ============ 欧赔对比 + 分歧（用户 2026-10-17：竞彩页卡片上也要）============
   ⚠️ 卡片整体是 <a>，所以这里【不能有可点击元素】—— 明细平铺，两列。 */
.m-mc { margin-top: 8px; padding: 10px 12px; background: #f3e6d0;
  border: 1px solid #e8d7bd; border-radius: 10px; }
.m-mc-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.m-mc-title { font-size: 12.5px; font-weight: 700; color: #4a3a26; }
.m-mc-sub { font-size: 10.5px; color: #a2937c; background: #fdf6ea;
  border: 1px solid #e8d7bd; border-radius: 20px; padding: 1px 8px; }
.m-mc-fun { margin-left: auto; font-size: 10.5px; color: #a2937c;
  border: 1px solid #e8d7bd; border-radius: 20px; padding: 1px 8px; }
.m-dv { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-bottom: 4px; }
.m-dv-i { display: flex; align-items: center; gap: 5px; background: #fdf6ea;
  border: 1px solid #e8d7bd; border-radius: 8px; padding: 5px 8px; min-width: 0; }
.m-dv-i i { font-style: normal; font-size: 10.5px; color: #8a7a63; }
.m-dv-i b { font-size: 10.5px; font-weight: 700; border-radius: 20px; padding: 0 6px; }
.m-dv-i b.lo { background: #e3f2ea; color: #1a8c5a; }
.m-dv-i b.mi { background: #fff6dd; color: #9c7000; }
.m-dv-i b.hi { background: #fdeceb; color: #c0392b; }
.m-dv-i em { font-style: normal; margin-left: auto; font-size: 10.5px; color: #a2937c;
  font-family: Consolas, monospace; }
.m-dv-sum { font-size: 10.5px; color: #a2937c; line-height: 1.7; margin-bottom: 5px; }
.m-mc-rng { font-size: 11px; color: #8a7a63; line-height: 1.7; margin-bottom: 6px; }
.m-mc-rng b { color: #4a3a26; font-family: Consolas, monospace; }
/* 【去掉了 12 家明细】.m-mc-grid / .m-mc-r 的样式已删（卡片上不放 12 家明细了）。 */
.m-mc-note { font-size: 10.5px; color: #a2937c; line-height: 1.7; }

/* ============================================================
   【推荐串 · 待定提示】往期列表标题右边那句「还有 N 组没打完」
   —— 用户 2026-10-17：「不要还没比赛结果的，只留 36 小时内推荐过的」，
      没打完的批次不列出来了，但这句提示保留（用户之前要过）。
   ============================================================ */
.m-recpending { width: 100%; font-size: 10.5px; font-weight: 400; color: #a2937c; }

/* ============================================================
   __JC_HIT_MQ__ 顶部小喇叭：横向滚动播报命中率（用户 2026-10-17 追加）
   ------------------------------------------------------------
   用户原话：「同时这里也有一个小喇叭.横向滚动通告推荐串的命中率百分比」
   位置：标题行「竞彩 · 推胜负平」右边那块空位（和标题同一行，不撑高）。
   播的数字【全部是页面上已经算好的】（推荐串战绩 / 完场战绩），
   这里不另算一套、也没有任何写死的数字。
   · 纯 CSS 动画（keyframes + transform），不用废弃的 <marquee> 标签、
     不用 <button>、不引任何外部图片；喇叭图标是 emoji。
   · 轨道里放两组一模一样的条目 → translateX(-50%) 正好退一组，无缝循环。
   · 悬停 / 点按 / 键盘聚焦时暂停；系统开了「减少动态效果」就改成可横向拖动。
   · 米杏色：底 var(--card) · 边框 var(--border) · 字 var(--text-sub)；
     命中率用主色 var(--green)（醒目），「红」用金 var(--gold)。
   · 高 24px，和 21px 的 h1 同一行不撑高；窄屏 h1 缩到 18px 给喇叭留位置。
   ============================================================ */
.m-titlerow { display: flex; align-items: center; gap: 10px; margin: 6px 0 4px; }
.m-titlerow h1 { margin: 0 !important; flex: 0 0 auto; white-space: nowrap; }
.m-mq { flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: 6px;
  height: 24px; padding: 0 8px; border-radius: 8px;
  background: var(--card); border: 1px solid var(--border); overflow: hidden; }
.m-mq-ico { flex: 0 0 auto; font-size: 12px; line-height: 1; }
.m-mq-view { flex: 1 1 0; min-width: 0; overflow: hidden; }
.m-mq-track { display: flex; width: max-content; will-change: transform;
  animation-name: jc-mq-roll; animation-duration: 20s; animation-timing-function: linear;
  animation-iteration-count: infinite; }
.m-mq-group { display: flex; align-items: center; flex: 0 0 auto; }
.m-mq-item { font-size: 11.5px; line-height: 24px; color: var(--text-sub);
  white-space: nowrap; padding-right: 26px; }
.m-mq-item b { font-weight: 700; color: var(--text); }
.m-mq-item i { font-style: normal; font-weight: 700; color: var(--green); }
.m-mq-item.mq-gold b { color: var(--gold); }
.m-mq:hover .m-mq-track,
.m-mq:active .m-mq-track,
.m-mq:focus-within .m-mq-track { animation-play-state: paused; }
@keyframes jc-mq-roll {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .m-mq-track { animation: none; }
  .m-mq-view { overflow-x: auto; }
  .m-mq-view::-webkit-scrollbar { height: 0; }
}
/* 窄屏：标题缩一档，把位置让给喇叭（320px 实测标题 21px 时只剩 ~90px） */
@media (max-width: 380px) {
  .m-titlerow h1 { font-size: 18px !important; }
  .m-titlerow { gap: 8px; }
}
/* 【本机 owner 专用】徽章「👑 管理员模式 · 可截图」原来也是 position:fixed
   （top:10px/right:10px），和标题行同一高度 —— 实测会把喇叭盖掉一大半。
   ⚠️ 2026-10-18 改：徽章挪进顶部 Tab 条下面那一行（流内、靠右），
      所以这里【不再】需要把标题行往下让 30px（再让就是多出来一块空白）。 */

/* ============================================================
   __TOP_TABS__ 顶部 Tab 条（彩票推荐 / 竞彩-足球）
   ------------------------------------------------------------
   用户 2026-10-18：「竞彩页没有 Tab 条 / 没有回分享页的链接 → 过去了回不来」。
   这里补一条和分享页同款的 Tab 条：flex 横排 · 底部 1px 边框 ·
   未选中灰、选中绿 + 2px 短线。
   ⚠️ 只用 <a>（页面铁律：0 个裸 button）。
   ⚠️ 放在 #article【外面】—— 防截图 locked 时 #article 会整块模糊 + 不能点，
      放里面会连「回分享页」一起锁死。
   ⚠️ 颜色全走变量（--border / --text-sub / --green），米杏色主题自动生效。
   ⚠️ 横向压缩：两个 Tab 各占一半、white-space:nowrap，320px 也不会把字挤换行。
   ============================================================ */
/* 【Tab 条贴边 · 底线贯穿全宽】用户 2026-10-18：「两个首页的 tab 上面封顶宽一点」
   ------------------------------------------------------------
   本页 Tab 条被 .wrap 的左右内边距夹住（.wrap { padding: 16px 14px 60px }），
   所以整条 Tab + 它那条 1px 底线两边各留 14px 空档
   （实测 375px：条 14→361，只占 347；320px：14→306，只占 292），
   看起来就是「上面封顶那块窄」。
   做法：把 .wrap 的左右内边距存成变量 --jc-pad-x（14px，全宽度都不变，
        本页没有窄屏改左右 padding 的规则），再用负外边距抵消掉 ——
        Tab 条撑到屏幕两边，border-bottom 自然贯穿整屏；
        吸顶时两边也不会透出下面滚动的内容。
   ⚠️ 只加左右外边距：高度 43px（Tab）/ 44px（条）、两列 50%/50%、
      激活态下划线 2px / bottom:-1px、吸顶阴影、徽章位置 全都不动。 */
.wrap { --jc-pad-x: 14px; }   /* 和 .wrap { padding: 16px 14px 60px } 的左右内边距保持一致 */
.top-tabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 0;
  margin-left: calc(-1 * var(--jc-pad-x, 14px));
  margin-right: calc(-1 * var(--jc-pad-x, 14px));
  position: -webkit-sticky; position: sticky; top: 0; z-index: 60;
  background: var(--bg, #f7efe1); }
.top-tabs.stuck { box-shadow: 0 2px 8px rgba(74, 58, 38, 0.10); }
.ro-swipe-hint { display: flex; align-items: center; justify-content: center; gap: 6px;
  margin: 0 0 2px; padding: 5px 10px 3px; font-size: 11px; line-height: 1.2;
  color: #8a7a63; letter-spacing: 0.2px; }
.ro-swipe-hint .ar { font-size: 12px; color: #1a8c5a; font-weight: 700; }
.top-tabs .tab { flex: 1 1 0; min-width: 0; text-align: center; padding: 12px 8px;
  font-size: 14px; font-weight: 600; color: var(--text-sub); text-decoration: none;
  position: relative; white-space: nowrap; -webkit-tap-highlight-color: transparent; }
.top-tabs .tab.on { color: var(--green); font-weight: 700; }
.top-tabs .tab.on::after { content: ''; position: absolute; left: 20%; right: 20%;
  bottom: -1px; height: 2px; background: var(--green); border-radius: 2px; }
.tab:focus-visible { outline: 2px solid var(--green); outline-offset: -3px; border-radius: 6px; }
.tab:hover { color: var(--text); }


`;


/* 【30 秒实时刷新】页面里 id="jcRecStat" 那个条可以被脚本原地换掉内容：
   data-reco-updated = 页面里这份存档的时间戳（拿它跟 jc-reco-view.js 里的比，一样就不动）。
   ⚠️ 这段说明【必须写在模板外面】——
      写在下面那个 const html 的反引号里面，会被当成正文渲染到页面上（用户 2026-10-17 截图报过，
      同一位置原来写的就是一段 JS 块注释，结果被当成正文印到了页面上）。 */

/* __COMMUNITY_DYN__ 社区内容：取 24 小时内的竞彩讨论/晒票条目（最多 8 条） */
function communityHtml() {
  try {
    const list = (typeof JC_XYSP !== 'undefined' && Array.isArray(JC_XYSP)) ? JC_XYSP : [];
    const now = Date.now();
    const items = list.filter((x) => {
      const t = Number(x.at || x.time || 0);
      if (t > 1e12) return now - t <= 24 * 3600 * 1000;
      if (t > 1e9) return now - t * 1000 <= 24 * 3600 * 1000;
      return true;
    }).slice(0, 8);
    if (!items.length) return '<div style="font-size:12px;color:#a89a80;">24 小时内暂无新讨论（自动刷新中）</div>';
    return items.map((x, i) => {
      const t = String(x.title || x.desc || '竞彩讨论').replace(/\s+/g, ' ').slice(0, 46);
      return '<div style="display:flex;gap:6px;padding:5px 0;border-bottom:1px dotted #f0e4cf;font-size:12px;color:#4a3a26;">'
        + '<span style="flex:0 0 16px;color:#b9a98c;">' + (i + 1) + '</span><span>' + escape(t) + '</span></div>';
    }).join('');
  } catch (e) { return ''; }
}


/* __COMMUNITY2__ 社区内容 = 我们自己的真实数据（推荐战绩 + 最近命中 + 最新晒票） */
function communityHtml2() {
  /* __COMMUNITY_IMG__ 社区 = 我方抓到的竞彩实票图（带图片，24 小时内），点图看大图 */
  try {
    const list = (typeof JC_XYSP !== 'undefined' && Array.isArray(JC_XYSP)) ? JC_XYSP.slice(0, 6) : [];
    if (!list.length) return '<div style="font-size:12px;color:#8a7a63;padding:4px 0;">24 小时内暂无新晒票（自动刷新中）</div>';
    const cells = list.map((x) => {
      const img = x.img || x.pic || x.thumb || x.url || '';
      const t = String(x.title || x.desc || '竞彩实票').slice(0, 22);
      return '<a href="' + String(img).replace(/"/g, '%22') + '" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">'
        + '<div style="display:flex;flex-direction:column;gap:4px;">'
        + (img ? '<img src="' + String(img).replace(/"/g, '%22') + '" alt="竞彩实票" loading="lazy" style="width:100%;height:88px;object-fit:cover;border-radius:8px;border:1px solid #ecdcc2;">' : '')
        + '<span style="font-size:11px;color:#4a3a26;line-height:1.3;">' + escape(t) + '</span></div></a>';
    }).join('');
    return '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">' + cells + '</div>';
  } catch (e) { return '<div style="font-size:12px;color:#8a7a63;">社区内容整理中</div>'; }
}

/* __COMMUNITY_HOT__ 社区热点 = 公开论坛的帖子（标题 + 时间 +【点开就地看正文】）
   ------------------------------------------------------------
   用户 2026-10-21 第一次：「我要免费抓取到其他网址的聊天分享信息 → 公开论坛的话题标题」
   用户 2026-10-21 第二次（本条要解决的）：
     「足球社区点不开资料」→ 条目只有标题、点不动 → 要能点开看内容
     「我要别人自己发的图」→ 帖子正文里别人发的截图（不是评论里的）
   用户 2026-10-21 第三次：
     「社区不抓中超国内的比赛消息」「主要抓接下来比赛竞彩的消息」
     → 抓取脚本已换国际板块 + 国内黑名单 + 按 football.js 的「接下来比赛」队名打分排序。
   数据：community-topics.json（fetch-community-topics.mjs 每小时抓一次）
     { updated: '…', topics: [ { t, d, u, body: 正文, nimg: 正文图片张数, imgs: [...] }, … ] }

   ① 【点开就能看】每条 = 原生 <details class="cx-topic"> + <summary>（标题 + 时间）
        · 默认收起，点一下就地展开正文（不跳转、不开新页、不出现外链）
        · 没抓到正文的帖子 → 展开里写「该帖没有正文文字」，【不编内容】
   ② 【图片】只写「[图] ×N」，【不放 <img>】：
        实测（headless Chrome + 本地 http 站当"我们自己的站"）：
          <img src> → HTTP 403；加 referrerpolicy="no-referrer" → 照样 403。
        图片有防盗链，放上去就是一片破图 → 只报张数，图片地址只留在 json 里。
   ③ 【不显示评论】用户明确：评论 = 0 条（抓取脚本也没抓回复）。
   ④ 【不出现外链/站名/来源】：链接只在 json 里，页面不渲染；
        页面有「数据源留痕」断言（source-guard.mjs），可见文本出现站名/来源字样就整页构建失败。
        抓取脚本已经清过一遍，这里【再清一遍】（json 万一手工改过也不至于把构建搞红）。
   ⑤ 读不到 / 解析失败 → 整块返回空字符串（页面照旧，绝不写「暂无」凑数）。 */
function buildCommunityTopicsHtml() {
  let data = null;
  try {
    const f = path.join(ROOT, 'community-topics.json');
    if (fs.existsSync(f)) data = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) { data = null; }
  if (!data || !Array.isArray(data.topics) || !data.topics.length) return '';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* d 是构建时抓到的「YYYY-MM-DD HH:MM」→ 显示成「x 分钟前 / x 小时前 / 昨天 / MM-DD」 */
  const now = Date.now();
  const rel = (dStr) => {
    const m = String(dStr || '').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!m) return '';
    const ts = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0).getTime();
    const mins = Math.round((now - ts) / 60000);
    if (!Number.isFinite(mins)) return '';
    if (mins < 1) return '刚刚';
    if (mins < 60) return mins + ' 分钟前';
    if (mins < 24 * 60) return Math.floor(mins / 60) + ' 小时前';
    if (mins < 48 * 60) return '昨天';
    return m[2] + '-' + m[3];
  };

  /* 最多 10 条（题目：社区热点最多 10 条；json 里存到 20 条，多出来的给以后换版式留量） */
  /* 兜底过滤：论坛标题/正文偶尔带站名/「来源」类字样，可见文本里出现就会被
     source-guard 的留痕断言拦下（整页构建失败）。抓取脚本已经筛过一遍，
     这里再筛一遍 —— 万一 json 是手工改的，也不至于把构建搞红。 */
  const BAD = /虎扑|贴吧|百度|新浪|网易|懂球帝|500|头条|一起彩|球探|雷速|titan007|okooo|sporttery|Betfair|必发|来源|取自|来自|数据源|接口|抓取|爬取|https?:\/\//i;
  const list = data.topics.filter((it) => it && it.t && !BAD.test(String(it.t))).slice(0, 10);
  if (!list.length) return '';

  /* 正文：逐行过滤 + 限长（抓取脚本存的是 ≤700 字；这里再兜一次 800） */
  const bodyOf = (it) => {
    const raw = String((it && it.body) || '').replace(/\r/g, '');
    if (!raw) return '';
    const lines = raw.split('\n').map((L) => String(L).replace(/\s+/g, ' ').trim()).filter((L) => L && !BAD.test(L));
    let s = lines.join('\n');
    if (s.length > 800) {
      const head = s.slice(0, 800);
      const cut = Math.max(head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('？'), head.lastIndexOf('\n'));
      s = (cut >= 300 ? head.slice(0, cut + 1) : head).trim() + '…';
    }
    return s;
  };

  const rows = list.map((it, i) => {
    const t = String(it && it.t || '').replace(/\s+/g, ' ').slice(0, 40);
    if (!t) return '';
    const when = rel(it.d);
    const body = bodyOf(it);
    const nimg = Math.max(0, Math.min(9, Math.floor(Number(it && it.nimg) || 0)));
    return '<details class="cx-topic">'
      + '<summary class="cx-sum">'
      + '<span class="cx-n">' + (i + 1) + '</span>'
      + '<span class="cx-t">' + esc(t) + '</span>'
      + '<span class="cx-d">' + esc(when) + '</span>'
      + '<span class="cx-arrow" aria-hidden="true"></span>'
      + '</summary>'
      + '<div class="cx-body">'
      + (body
        ? '<div class="cx-p">' + esc(body).replace(/\n/g, '<br>') + '</div>'
        : '<div class="cx-p cx-p-empty">该帖没有正文文字（原帖只发了标题）</div>')
      + (nimg ? '<div class="cx-imgs">[图] ×' + nimg + '</div>' : '')
      + '</div>'
      + '</details>';
  }).join('');
  if (!rows) return '';

  /* 样式全用 .cx-* 前缀（页面别处没有这几个类名，不会串样式）。
     原生 details/summary：去掉默认三角，右侧自画一个 ▸/▾ 当「能点开」的提示。 */
  const css = '<style>'
    + '.cx-topic{border-bottom:1px dotted #f0e4cf;}'
    + '.cx-topic>summary.cx-sum{list-style:none;cursor:pointer;display:flex;gap:6px;align-items:baseline;'
    + 'padding:7px 2px;font-size:12.5px;color:#4a3a26;line-height:1.45;border-radius:6px;-webkit-tap-highlight-color:transparent;}'
    + '.cx-topic>summary.cx-sum::-webkit-details-marker{display:none;}'
    + '.cx-topic>summary.cx-sum::marker{content:\'\';}'
    + '.cx-topic>summary.cx-sum:hover{background:#fbf3e6;}'
    + '.cx-topic>summary.cx-sum .cx-n{flex:0 0 15px;color:#b9a98c;}'
    + '.cx-topic>summary.cx-sum .cx-t{flex:1 1 auto;min-width:0;}'
    + '.cx-topic>summary.cx-sum .cx-d{flex:0 0 auto;color:#a89a80;font-size:11px;white-space:nowrap;}'
    + '.cx-topic>summary.cx-sum .cx-arrow{flex:0 0 auto;color:#c9b79a;font-size:10px;line-height:1;width:9px;text-align:center;}'
    + '.cx-topic>summary.cx-sum .cx-arrow::before{content:\'▸\';}'
    + '.cx-topic[open]>summary.cx-sum .cx-arrow::before{content:\'▾\';}'
    + '.cx-topic[open]>summary.cx-sum{color:#3c2f1e;font-weight:600;}'
    + '.cx-body{padding:2px 2px 9px 21px;}'
    + '.cx-body .cx-p{background:#fbf6ec;border:1px solid #efe2cc;border-radius:8px;padding:7px 9px;'
    + 'font-size:12px;color:#5a4a35;line-height:1.62;word-break:break-word;}'
    + '.cx-body .cx-p-empty{color:#a89a80;}'
    + '.cx-body .cx-imgs{margin-top:6px;font-size:11px;color:#a89a80;}'
    + '</style>';

  const hasBody = list.some((x) => x && typeof x.body === 'string' && x.body);
  return '<div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e8d7bd;">'
    + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">'
    + '<span style="font-size:13px;font-weight:800;color:#4a3a26;">大家都在聊</span>'
    + '<span style="font-size:10.5px;color:#a89a80;">' + (hasBody ? '点标题看正文' : '社区热点 · 自动更新') + '</span>'
    + '</div>' + css + rows + '</div>';
}
const communityHotHtml = buildCommunityTopicsHtml();

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- ============================================================
     【分享卡片 / 图标 / PWA】
       · 标题固定为「春风彩票」（用户指定）
       · og:image 必须是【绝对 URL】—— 微信 / QQ / Twitter 抓的是绝对地址，
         相对路径它们抓不到
       · 图标文件由 make-icons.mjs 分发到站点根目录，云端 cloud-build.mjs
         再拷进 out/，最后随 site/ 一起发布
     ============================================================ -->
<title>春风 · 竞彩场次</title>
<meta name="description" content="春风 · 竞彩场次：免费提供竞彩足球推单、比分与战绩统计等服务。仅供娱乐参考，不构成购彩建议；未成年人不得购买彩票。" />
<meta name="format-detection" content="telephone=no" />
<!-- 微信 / QQ 兼容标签（用户 2026-10-18 给的文案；image 必须是绝对地址，用站点根的 share.png） -->
<meta itemprop="name" content="春风 - 竞彩足球推荐" />
<meta itemprop="description" content="免费提供竞彩足球推单、比分与战绩统计等服务。" />
<meta itemprop="image" content="https://chunfengww2026.github.io/chunfeng-lottery/share.png" />
<link rel="icon" type="image/svg+xml" href="icon.svg" />
<link rel="icon" type="image/x-icon" href="favicon.ico" />
<link rel="shortcut icon" href="favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png" />
${PWA_HEAD}
<meta name="application-name" content="春风彩票" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="春风彩票" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="mobile-web-app-capable" content="yes" />
<!-- 分享卡片：微信 / QQ / 微博 / Twitter / Facebook 都读这些
     ⚠️ 用户 2026-10-18 统一品牌为「春风」；图仍是站点根 share.png（绝对地址） -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="春风" />
<meta property="og:title" content="春风 - 竞彩足球推荐" />
<meta property="og:description" content="免费提供竞彩足球推单、比分与战绩统计等服务。" />
<meta property="og:image" content="https://chunfengww2026.github.io/chunfeng-lottery/share.png" />
<meta property="og:image:secure_url" content="https://chunfengww2026.github.io/chunfeng-lottery/share.png" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="春风 —— 彩票球图标与页面标题" />
<meta property="og:url" content="https://chunfengww2026.github.io/chunfeng-lottery/football.html" />
<meta property="og:locale" content="zh_CN" />
<!-- 微信 / QQ 兼容标签已挪到 head 开标签靠前位置（和 title 在一起），这里不重复。
     ⚠️ 这里别写字面的 head 标签：页面里出现第二个，注入就会插错位置。 -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="春风 - 竞彩足球推荐" />
<meta name="twitter:description" content="免费提供竞彩足球推单、比分与战绩统计等服务。" />
<meta name="twitter:image" content="https://chunfengww2026.github.io/chunfeng-lottery/share.png" />
<meta name="twitter:image:alt" content="春风 —— 彩票球图标与页面标题" />
${nav}
<style>${CSS}
/* ============================================================
   【比赛卡片 · 米杏浅色主题】用户 2026-10-17 直接给的 CSS 设计。
   ------------------------------------------------------------
   他那份用的是新类名（.match-card/.match-header/.odds-row/.recommend-bar/
   .ev-bar/.score-row…），而页面现有的卡片是 .m-card/.m-top/.m-odds/.m-reco/.m-ev/.m-scorepick
   —— 重命名会牵连十几处已有样式（历史/红黑/详情链接/欧赔分歧…），所以这里做【映射】：
      .match-card → .m-card        .match-header → .m-top
      .match-body → .m-body        .odds-row/.odds-item → .m-odds（三列同款底）
      .recommend-bar → .m-reco     .right-tags .tag → .m-tag / .m-probrow .opt
      .ev-bar/.ev-item → .m-ev/.m-evitem     .score-row/.score-tag → .m-scorepick/.m-sp-item
   颜色/圆角/间距/字体全部照他给的值；EV>0 用红、EV<0 用灰（他明确：positive 红、negative 灰）。
   放在上面那段 CSS 之后 + 必要的 !important → 稳稳盖住旧的暗色残留。
   ⚠️ 这里【不能】写反引号包起来的插值标记：本行在 CSS 注释里，
      一旦写进来，整段 CSS 会被再展开一遍（页面凭空多 ~39KB 重复样式、
      选择器计数翻倍）。2026-10-18 修。 */
.m-card { background: #fdf6ea !important; border: 1px solid #e8d7bd !important;
  border-radius: 12px !important; margin-bottom: 12px !important; overflow: hidden !important; }
/* 圆角钉死 12px：另有一条更强选择器的 11px 规则抢过（差 1px，肉眼几乎看不出），
   这里用双类名提高特异性压住它。 */
.m-card.m-card { border-radius: 12px !important; }
.m-card .m-top { padding: 12px 14px !important; position: relative; cursor: pointer; }
.m-card .m-top:active { background: #f9efdd !important; }
.m-card .m-league, .m-card .m-time, .m-card .m-round, .m-card .m-code,
.m-card .m-st { color: #8a7a63 !important; }
.m-card .m-team { color: #4a3a26 !important; font-weight: 700 !important; font-size: 15px !important; }
.m-card .m-vs { color: #8a7a63 !important; }
.m-card .m-fold { color: #8a7a63 !important; font-size: 12px !important; }
.m-card .m-body { padding: 0 14px 14px !important; border-top: 1px solid #f0e2cc !important;
  max-height: 2000px; overflow: hidden; transition: max-height .35s ease; background: transparent !important; }
.m-card.folded .m-body { max-height: 0 !important; padding-bottom: 0 !important; display: block !important; }
/* 赔率行：三块浅底小方块 */
.m-card .m-odds { background: #f9efdd !important; border: 1px solid #f0e2cc !important;
  border-radius: 6px !important; padding: 8px !important; margin: 8px 0 !important;
  justify-content: center !important; gap: 10px !important; flex-wrap: wrap !important; }
.m-card .m-ol { color: #8a7a63 !important; }
.m-card .m-ov { color: #4a3a26 !important; background: transparent !important; }
.m-card .m-ov.on { color: #1a8c5a !important; font-weight: 700 !important; }
/* 推荐行 */
.m-card .m-reco { background: #fff6dd !important; border: 0 !important; border-radius: 8px !important;
  padding: 8px 12px !important; margin: 10px 0 !important; }
.m-card .m-pick { color: #4a3a26 !important; font-size: 13px !important; }
.m-card .m-pick b { color: #c0392b !important; font-size: 14px !important; }
.m-card .m-conf { color: #8a7a63 !important; font-size: 11px !important; margin-left: 6px; }
.m-card .m-problab { color: #8a7a63 !important; }
.m-card .m-tag, .m-card .m-probrow .opt {
  font-size: 11px !important; padding: 3px 8px !important; border-radius: 12px !important;
  background: #fdf6ea !important; border: 1px solid #e8d7bd !important;
  color: #8a7a63 !important; font-style: normal !important; font-weight: 400 !important; }
.m-card .m-probrow .opt.active { background: #1a8c5a !important; color: #fff !important;
  border-color: #1a8c5a !important; font-weight: 700 !important; }
.m-card .m-tag.orange { background: #f5b301 !important; color: #fff !important;
  border-color: #f5b301 !important; font-weight: 700 !important; }
/* EV 行：外层 .m-ev 只管底色/边框（米杏主题），里面按用户给的类名走 */
.m-card .m-ev { background: #f4f8f5 !important; border: 1px solid #d0e5d8 !important;
  border-radius: 8px !important; padding: 8px 12px !important; margin: 0 0 10px !important;
  display: flex !important; justify-content: space-between !important; align-items: center !important; }
/* 【用户 2026-10-17 参考实现的类名】.ev-title / .ev-items / .ev-item.positive|negative */
.m-card .ev-title { color: #1a8c5a !important; font-weight: 700 !important; font-size: 12px !important; }
.m-card .ev-items { display: flex !important; gap: 10px !important; flex-wrap: wrap !important; }
.m-card .ev-item { font-weight: 700 !important; font-size: 12px !important; }
.m-card .ev-item.positive { color: #c0392b !important; }   /* EV > 0 → 红 */
.m-card .ev-item.negative { color: #8a7a63 !important; }   /* EV ≤ 0 → 灰 */
/* 兼容我之前那套名字（.m-evlab / .m-evitem.pos|neg），旧页面缓存也不至于没样式 */
.m-card .m-evlab { color: #1a8c5a !important; font-weight: 700 !important; font-size: 12px !important; }
.m-card .m-evitem { background: transparent !important; color: #8a7a63 !important;
  font-weight: 700 !important; padding: 0 !important; font-size: 12px !important; }
.m-card .m-evitem.pos { color: #c0392b !important; }
.m-card .m-evitem.neg { color: #8a7a63 !important; }
/* 比分推荐 */
.m-card .m-scorepick { border-top: 0 !important; }
.m-card .m-sp-lab, .m-card .m-sp-note { color: #8a7a63 !important; }
.m-card .m-sp-item { background: #fdf6ea !important; border: 1px solid #e8d7bd !important;
  border-radius: 10px !important; color: #4a3a26 !important; }
.m-card .m-sp-item.on { background: #e3f2ea !important; border-color: #1a8c5a !important;
  color: #1a8c5a !important; font-weight: 700 !important; }
/* 亚指换算 / 欧赔分歧 / 泊松 / 多选：跟着卡片换成浅底 */
.m-card .m-ai, .m-card .m-mc, .m-card .m-poisson, .m-card .m-multi {
  background: #f9efdd !important; border: 1px solid #f0e2cc !important; border-radius: 8px !important; }
.m-card .m-ai-title, .m-card .m-mc-title, .m-card .m-sp-lab { color: #8a7a63 !important; }
.m-card .m-godetail { color: #1a8c5a !important; }
/* 【推荐串战绩条】用户 2026-10-17 给的结构：.record-bar / .label / .red / .black / .rate / .note
   红用深红、黑用深棕、命中率用绿，其余说明文字用米杏副色 */
.record-bar { display: flex !important; align-items: center !important; flex-wrap: wrap !important;
  gap: 8px !important; background: #fdf6ea !important; border: 1px solid #e8d7bd !important;
  border-radius: 10px !important; padding: 9px 12px !important; margin: 0 0 12px !important;
  font-size: 12px !important; }
.record-bar .label { color: #8a7a63 !important; font-weight: 700 !important; }
.record-bar .red { color: #c0392b !important; font-weight: 700 !important; }
.record-bar .black { color: #4a3a26 !important; font-weight: 700 !important; margin-left: 8px !important; }
.record-bar .rate { color: #1a8c5a !important; font-weight: 700 !important; margin-left: 8px !important; }
.record-bar .note { color: #8a7a63 !important; margin-left: 8px !important; font-weight: 400 !important; }
/* 【播报条 · 视觉按用户 2026-10-17 给的 CSS】浅黄底 #fff6dd + 边 #f0dfa8 + 6px 圆角
   + 14px 喇叭 + 18px 高的滚动区 + 红字 12px 加粗。
   ⚠️ 动画保留页面原来的那套（.m-mq-track 的 keyframes jc-mq-roll：两组内容 + translateX(-50%)
      → 无缝循环、悬停暂停、prefers-reduced-motion 时可拖动）。
      没有用他贴的 padding-left:100% + translateX(-100%) 单段写法 ——
      那种滚完会在屏幕左侧留一整条空白再从头来，看起来像"卡一下"。 */
.broadcast-bar { display: flex !important; align-items: center !important;
  background: #fff6dd !important; border: 1px solid #f0dfa8 !important;
  border-radius: 6px !important; padding: 6px 10px !important; margin-top: 8px !important;
  overflow: hidden !important; height: auto !important; }
.broadcast-bar .horn-icon { font-size: 14px !important; margin-right: 8px !important;
  flex-shrink: 0 !important; line-height: 1 !important; }
.broadcast-bar .broadcast-content { flex: 1 1 0 !important; min-width: 0 !important;
  overflow: hidden !important; white-space: nowrap !important; position: relative !important;
  height: 18px !important; line-height: 18px !important; }
.broadcast-bar .marquee { color: #c0392b !important; font-size: 12px !important; font-weight: 700 !important; }
.broadcast-bar .m-mq-item { color: #c0392b !important; font-size: 12px !important;
  font-weight: 700 !important; line-height: 18px !important; }
.broadcast-bar .m-mq-item b, .broadcast-bar .m-mq-item i { color: #c0392b !important; }
.broadcast-bar:hover .m-mq-track { animation-play-state: paused !important; }
/* 【一键桌面 · 位置/外观按用户 2026-10-17 给的 CSS，位置改到右下角】
   外观照用户原样：实心绿 #1a8c5a + 白字、20px 胶囊、阴影、呼吸灯 2s。
   ⚠️【位置改过】（2026-10-18）：用户原话是 top 55px / right 15px，
      但那个位置会【压住顶部横向滚动的播报喇叭】（「推荐串：红 20 黑 9 …」），
      所以改成和分享页 / 详情页一致的【右下角】，让开喇叭；
      右下角下面 52px 是聊天框按钮，这里锚在它上面（80px），两者不打架；
      聊天框打开时 body 会挂 .cf-open → 本按钮 display:none 自动让位。
   ⚠️ 全部 !important：页面里有别的胶囊/按钮样式会抢（之前播报条的圆角就被抢过），
      固定定位也必须压过容器。
   ⚠️ 呼吸灯的关键帧改名 install-pulse（原名叫 pulse，页面里已有同名 keyframes 会打架）。
   ⚠️ 系统开了「减少动态效果」→ 关掉呼吸灯（无障碍）。 */
.install-btn { position: fixed !important;
  right: 12px !important; bottom: calc(80px + env(safe-area-inset-bottom, 0px)) !important;
  top: auto !important; z-index: 9998 !important;
  display: inline-flex !important; align-items: center !important; justify-content: center !important;
  background: #1a8c5a !important; color: #fff !important; border: none !important;
  border-radius: 20px !important; padding: 6px 12px !important; font-size: 12px !important;
  font-weight: 700 !important; text-decoration: none !important; white-space: nowrap !important;
  box-shadow: 0 2px 8px rgba(26, 140, 90, 0.4) !important; cursor: pointer !important;
  animation: install-pulse 2s infinite !important;
  touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select: none; }
.install-btn:active { transform: scale(0.97) !important; animation: none !important; }
@keyframes install-pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) { .install-btn { animation: none !important; } }
/* 【📱 圆形轻浮按钮】用户 2026-10-18：「💬 保留 + 再加一个 📱」
   位置在聊天气泡左边一档（right:78 bottom:20），点它 = 一键桌面。 */
.install-fab { position: fixed !important;
  right: 78px !important; bottom: calc(20px + env(safe-area-inset-bottom, 0px)) !important;
  top: auto !important; z-index: 9998 !important;
  width: 50px !important; height: 50px !important; border-radius: 50% !important;
  display: inline-flex !important; align-items: center !important; justify-content: center !important;
  background: #1a8c5a !important; color: #fff !important; font-size: 22px !important; line-height: 1 !important;
  text-decoration: none !important; box-shadow: 0 4px 12px rgba(0,0,0,0.18) !important;
  cursor: pointer !important; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.install-fab:active { transform: scale(0.95) !important; }
/* ===== 【专家推荐 · 20 篇】用户 2026-10-18（竞彩晒票下面新增） ===== */
.jca { padding: 0 12px 10px; }
.jca-head { display: flex; align-items: center; gap: 8px; padding: 12px 0 10px; cursor: pointer; list-style: none; }
.jca-head::-webkit-details-marker { display: none; }
.jca-h-title { font-size: 15px; font-weight: 800; color: #1a8c5a; letter-spacing: 0.5px; }
.jca-h-sub { font-size: 11px; color: #8a7a63; }
.jca-h-go { margin-left: auto; font-size: 11px; color: #1a8c5a; }
.jca-list { display: flex; flex-direction: column; gap: 1px; }
.jca-row { display: flex; align-items: flex-start; gap: 8px; padding: 9px 2px; text-decoration: none;
  border-bottom: 1px dashed #efe3cf; color: inherit; }
.jca-row:active { background: #fdf6ea; }
.jca-idx { flex: 0 0 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 50%;
  background: #e3f2ea; color: #1a8c5a; font-size: 11px; font-weight: 800; margin-top: 1px; }
.jca-main { flex: 1 1 auto; min-width: 0; }
.jca-title { display: block; font-size: 13px; line-height: 1.45; color: #3d2f21; }
.jca-meta { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
.jca-src { font-size: 10.5px; color: #1a8c5a; background: #eef8f2; border: 1px solid #cbe9d9;
  border-radius: 8px; padding: 1px 6px; }
.jca-time { font-size: 10.5px; color: #8a7a63; }
.jca-go { flex: 0 0 auto; font-size: 11px; color: #1a8c5a; margin-top: 2px; }
.jca-note { margin-top: 8px; font-size: 10.5px; color: #a94a3c; line-height: 1.5;
  background: #fdf1ef; border: 1px solid #f3d3cc; border-radius: 8px; padding: 6px 8px; }
.jca-upd { margin-top: 6px; font-size: 10.5px; color: #a8987a; text-align: right; }
.install-hint { position: fixed; left: 50%;
  bottom: calc(142px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%);
  max-width: 86vw; background: #4a3a26; color: #fff; font-size: 12.5px; line-height: 1.5;
  padding: 10px 14px; border-radius: 10px; z-index: 99999; box-shadow: 0 6px 24px rgba(0,0,0,.28); }

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
/* 【已恢复显示】用户 2026-10-18：「手机版本彩票推荐页没这个」→ 原来圆形按钮用的是 📱 emoji
   （在他手机上画成紫色骰子）才被这里隐藏；现在换成内联 SVG 手机图标，不再隐藏。 */

/* __CARD_RAISE_END__ 这一段到这里结束（替换时以此为界，别删） */

/* ============================================================
   __FRESH_STAMP__ 数据新鲜度小字（写在样式表最后，压过上面所有旧规则）
   ------------------------------------------------------------
   出现位置只有两处：晒票标题行「晒票 竞彩实票 · 票面更新于 3 小时前」、
   顶部副标题「体彩竞彩在售 N 场 · 数据更新于 3 小时前 · 已完场 …」。
   规格：11px / 不加粗 / 不换行 / 不抢眼；三档只换颜色：
     <2 小时   灰   #8a7a63（本页副文字色；若将来定义了 --ro-fg2 就跟着它走）
     2~12 小时 淡橙 #9c7000（本页金色标签那档，不是新颜色）
     >12 小时  红   #c0392b（本页既有的红，和「黑」那一档同一个红）
   ⚠️ 不用图标、不弹窗、不写存储、不新增任何标签属性。
   ============================================================ */
.fresh { font-size: 11px; font-weight: 400; line-height: 1.6;
  letter-spacing: 0; white-space: nowrap; vertical-align: baseline;
  color: var(--ro-fg2, #8a7a63); }
.fresh-warn  { color: #9c7000; }
.fresh-stale { color: #c0392b; }
/* 顶部副标题里那句：和 .sub 同一条行内流，前面由模板自己给「·」分隔 */
.sub .fresh { color: var(--ro-fg2, #8a7a63); }
.sub .fresh-warn  { color: #9c7000; }
.sub .fresh-stale { color: #c0392b; }
</style>
<!-- __DEVICE_GATE_CSS__ 设备门样式（device-gate.mjs）：放在 head 收尾标签之前，
     电脑端第一帧就是隐藏态，不会先闪内容。
     ⚠️ 这里【别写字面的 head 标签】（开标签 / 收尾标签都别写）：
        页面里只要多出第二个，注入样式就会插错位置 —— 历史上就因此把整段
        导航 CSS 塞进了注释里。export-site.mjs 写盘前的断言会直接拦下来。 -->
<style>${DEVICE_GATE_CSS}${CHAT_CSS}</style>
<!--__HEAD_SLOT__--><!-- 唯一 head 注入槽位：导航样式插在这一行（别删；本页只此一处） -->
</head>
<body>
${DEVICE_GATE_BODY}
<div class="wrap">
  <!-- ============================================================
       __TOP_TABS__ 顶部 Tab 条（彩票推荐 / 竞彩-足球）
       用户 2026-10-18：「竞彩页没有 Tab 条、也没回分享页的入口 → 过去了回不来」。
       和分享页同款结构 / 类名（.top-tabs / .tab / .tab.on），样式见 __TOP_TABS__ CSS。
       ⚠️ 都是 <a>（页面不变量：0 个裸 button）。
       ⚠️ 放在 #article 外面：locked 时不会被模糊，永远点得到。
       ⚠️ 当前页是竞彩，所以「竞彩/足球」带 .on。
       ============================================================ -->
  <!-- 【左滑返回提示 · 用户 2026-10-18「tab 上面用小型号字迹提示+箭头」】 -->
  <div class="top-tabs">
    <a class="tab" href="./" data-tab-home="1">彩票推荐</a>
    <a class="tab on" href="足球推荐.html">竞彩/足球</a>
  </div>
  <script>
  /* __RO_SWIPE__ 吸顶 + 左滑返回（用户 2026-10-18）
     ⚠️ 这段在模板字符串里：不用反引号、不写美元花括号、不写反斜杠 */
  (function () {
    'use strict';
    try {
      var tabs = document.querySelector('.top-tabs');
      if (tabs) {
        var onScroll = function () {
          try {
            var r = tabs.getBoundingClientRect();
            if (r.top <= 0) tabs.classList.add('stuck'); else tabs.classList.remove('stuck');
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
  <!-- 【owner 徽章】只有本机（file: 协议）或公网 IP = 主人 IP 时才显示。
       ⚠️ 2026-10-18 改：原来 position:fixed 在右上角，正好压住顶部 Tab / 喇叭；
          现在排在 Tab 条正下方、靠右，流内定位，不遮任何东西。 -->
  <div id="ownerTag" class="owner-tag">👑 管理员模式 · 可截图</div>
  <script>
  /* __TOP_TABS_HOME__ Tab1「彩票推荐」的地址按协议切换（零存储 · 零外部依赖）：
     · 线上（http / https）→ "./"     = 站点根 index.html
     · 本机（file://）     → "只读分享版.html"
       本机分享页的文件名就是这个；file:// 下 "./" 会落成【目录索引】，
       一点就离开本页、还把整个项目目录列出来。 */
  (function () {
    try {
      if (String(location.protocol) !== 'file:') return;
      var a = document.querySelector('.top-tabs .tab[data-tab-home]');
      if (a) a.setAttribute('href', '只读分享版.html');
    } catch (e) {}
  })();
  </script>
  <!-- #article = 受保护区域之一（防截图：locked 时整块模糊 + 不能点）
       另两块受保护的是三个分段里的 .guard 和底部免责声明 .guard -->
  <div id="article">
  <!-- 【标题行】左边标题 + 右边小喇叭（横向滚动播报命中率，见 __JC_HIT_MQ__）
       ⚠️ 小喇叭是纯 CSS 动画，里面没有 <button>、没有外部图片。 -->
  <div class="m-titlerow">
  <h1>竞彩 · 推胜负平</h1>
  ${HIT_MQ_HTML}
  </div>
  <!-- 【一键桌面】用户 2026-10-17：放在顶部（喇叭同一行的右端）。
       ⚠️ 还是 <a role="button">，不用 <button> 标签 —— 页面不变量（0 裸 button）。
       用户 2026-10-18：改成一进来就显示（不再等浏览器允许安装），
       并在右下角加了一个圆形按钮（💬 保留 + 再加一个手机图标）。
       ⚠️ 图标用内联 SVG：用户手机上 📱 emoji 会画成「紫色骰子」，SVG 不依赖 emoji 字体。 -->
  <a id="installAppBtn" class="install-btn" role="button" tabindex="0" aria-label="添加到桌面"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="vertical-align:-3px;margin-right:5px"><rect x="6.5" y="1.8" width="11" height="20.4" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.9"/><rect x="9.2" y="4.3" width="5.6" height="1.1" rx="0.55" fill="currentColor"/><circle cx="12" cy="19.1" r="1.15" fill="currentColor"/></svg>一键桌面</a>
  <a id="installFab" class="install-fab" role="button" tabindex="0" aria-label="添加到桌面"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><rect x="6.5" y="1.8" width="11" height="20.4" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.9"/><rect x="9.2" y="4.3" width="5.6" height="1.1" rx="0.55" fill="currentColor"/><circle cx="12" cy="19.1" r="1.15" fill="currentColor"/></svg></a>
  <div class="sub">体彩竞彩在售 ${IN_SALE} 场${INSALE_STAMP_HTML ? ` · ${INSALE_STAMP_HTML}` : ''} · 已完场 ${stat.finished} 场（近 24 小时） · <span class="cd" data-cd="1"></span></div>

  <div class="stat">
    <a href="#sec-upcoming"><b>${stat.upcoming}</b><span>未开赛</span></a>
    <a href="#sec-live"><b>${stat.live}</b><span>进行中</span></a>
    <a href="#sec-finished"><b>${stat.finished}</b><span>已完场</span></a>
  </div>

  ${stat.settled ? `<div class="record">
    <span class="t">完场战绩</span>
    <span class="h">红 ${stat.hit}</span>
    <span class="m">黑 ${stat.miss}</span>
    <span class="r">命中率 ${stat.rate}%</span>
    <span class="n">（推荐比对最终比分）</span>
  </div>` : ''}

  <!-- 【推荐单数字条】用户 2026-10-18：「推荐单只抓取推荐里面的，不是抓取在售的」
       → 已从顶层搬进「推荐」折叠块内部（见 renderRec 里对 recoStatBarTop 的调用），
         收起时跟着一起收；口径不变（仍只算信心 ≥58% 的推荐场次）。
         30 秒刷新脚本按 id="recStatsBar"（兼容旧 id="jcRecStat"）原地换内容，位置变了不用改脚本。 -->

  ${renderRec()}
  </div>

  ${cards}

  ${renderCalc()}

  <!-- 【保存图片 · 全屏层】默认隐藏（display:none），点「保存图片」才显示。
       关闭方式：点空白 / 点 × / Esc / 手机返回键（进去时 push 了一个 history 状态）。
       这一层放在折叠区【外面】—— 整块收起时也能弹出来。 -->
  <div class="calc-shot allow-save" id="calcShot">
    <div class="calc-shot-bar">
      <span class="calc-shot-tip">长按图片 / 右键 → 保存到手机</span>
      <a role="button" tabindex="0" class="calc-shot-x" id="calcShotX">×</a>
    </div>
    <img class="calc-shot-img" id="calcShotImg" alt="模拟计算选号图">
  </div>

  <!-- ★【晒票】区块插在这里（用户截图红框）：
       上面 = 模拟计算（上面那个 details，已经收起）
       下面 = .guard（免责声明区）
       ⚠️ 中间那个 #calcShot 是【固定定位的全屏层】、默认 display:none，
          不占布局、平时看不见，所以视觉顺序就是「模拟计算 → 晒票 → 免责声明」。
       ⚠️ 它在 .guard【外面】—— 所以防截图 locked 时【不会】被模糊，
          照常能看能点（本来也在"允许保存/豁免"的意图里）。
       ⚠️ 它也不在 #article 里，所以不会被 #article 的模糊带进去。 -->
  ${jcXyspHtml}

  <!-- 【专家推荐 · 用户 2026-10-18】
       「竞彩晒票下面新增：专家推荐 / 文章要有 20 篇 / 一小时抓一次 / 按时间顺序一直抓」
       数据：build-jc-articles.mjs 每小时抓一次，合并去重后取最新 20 篇（jc-articles.js）。
       ⚠️ 页面里不出现任何来源站名/域名（项目有「数据源留痕」断言，出现即构建失败）。 -->
  ${jcArticlesHtml}

<!-- __COMMUNITY_DYN__ 社区：显示 24 小时内的最新讨论/晒票（数据每次构建自动刷新）
     __COMMUNITY_CARD__ 用户 2026-10-21：「社区按钮是可以收起/展开」
       → 整块包进【原生 <details class="cx-card">】（和其它卡一样的折叠做法）：
         · 标题行 = <summary>，点一下展开、再点收起；纯原生行为，不需要一行 JS
         · 默认【收起】（不写 open）—— 用户 2026-10-21 追加要求：
           「足球每一页点开都默认收起」，所以社区卡也跟着首页规则走，只留标题行
         · 里面「大家都在聊」是第二级 details（.cx-topic），两级嵌套各自点各自的：
           点内层条目只开合内层，不会顺手把外层社区卡收起来
         · 样式全部 .cx-card* 前缀，<style> 就放在这块里，不改页面别处的规则
       ⚠️ 展开/收起状态不做记忆（刷新后回到默认收起），和页面其它块一致。 -->
<style>
.cx-card{margin:12px 16px;background:#fdf6ea;border:1px solid #e8d7bd;border-radius:12px;padding:12px;}
.cx-card>summary.cx-card-sum{list-style:none;cursor:pointer;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;
padding:0;margin:0;user-select:none;-webkit-tap-highlight-color:transparent;border-radius:8px;}
.cx-card>summary.cx-card-sum::-webkit-details-marker{display:none;}
.cx-card>summary.cx-card-sum::marker{content:'';}
.cx-card>summary.cx-card-sum:active{background:#fbf3e6;}
.cx-card-sum .cx-card-t{flex:0 0 auto;font-size:15px;font-weight:800;color:#4a3a26;}
.cx-card-sum .cx-card-sub{flex:1 1 auto;min-width:0;font-size:11px;color:#8a7a63;line-height:1.5;}
.cx-card-sum .cx-card-go{flex:0 0 auto;margin-left:auto;font-size:11px;color:#a8834a;white-space:nowrap;}
.cx-card[open]>summary.cx-card-sum{padding-bottom:6px;margin-bottom:6px;border-bottom:1px dashed #e8d7bd;}
.cx-card-sum .cx-card-go::after{content:'点击收起 ▴';}
.cx-card:not([open])>summary.cx-card-sum .cx-card-go::after{content:'点击查看 ▾';}
.cx-card:not([open])>summary.cx-card-sum{color:#4a3a26;}
.cx-card-body{min-width:0;}
.cx-card-body:empty{display:none;}
@media (max-width:360px){
  .cx-card-sum .cx-card-sub,.cx-card-sum .cx-card-go{font-size:10.5px;}
}
</style>
<details class="m-card3 cx-card" id="cxCard">
<summary class="cx-card-sum">
<span class="cx-card-t">社区</span>
<span class="cx-card-sub">24 小时内的最新 · 自动刷新</span>
<span class="cx-card-go" aria-hidden="true"></span>
</summary>
<div class="cx-card-body" id="communityLiveBody">
${communityHtml2()}
${communityHotHtml}
</div>
</details>
  <div class="guard">
  <div class="note">
    <div class="note-title" style="font-size:13.5px;font-weight:700;letter-spacing:1px;margin-bottom:6px;">免责声明</div>
    · 本页只显示<b>体彩竞彩对外开售</b>的场次，其他比赛不显示。<br>
    · 「已完场」只保留<b>比赛结束后 24 小时内</b>的场次${stat.history ? `（当前 ${stat.history} 场）` : ''}，超过 24 小时自动移出本页；历史记录另外留档，只用于推荐串比对。<br>
    · 推荐由博彩公司赔率反推概率得出（市场共识换算），属统计归纳，<b>不是预测</b>。<br>
    · 「亚指综合换算」「盘口升降」是<b>亚盘水位与资金热度的推演</b>，<b>仅娱乐参考</b>，不是预测，也不代表任何结果倾向。<br>
    · 上盘<b>真实资金占比暂无公开数据</b>，所以不显示热度 / 爆冷推演；页面上的「水位隐含 · 理论均衡占比」是由亚盘水位换算出来的，<b>不是真实资金数据</b>。<br>
    · 盘口升降的「初盘 → 即时」原始数据一并列出，便于自行核对（盘口或水位只有一边变化时，程序也会照原始判定显示「无明显变化」）。<br>
    · 彩票每期独立随机，任何分析都不能提高中奖概率。本页不构成购彩建议。<br>
    · 未满 18 周岁禁止购买彩票。
  </div>

  <div class="brand">— 小晴推荐官 · 仅供参考 —</div>
  </div>
</div>

<!-- 【防截图 · 遮罩】locked 时全屏盖住受保护内容（#article / .guard）；
     「模拟计算」「晒票」和三个分段是豁免区（不在 #article / .guard 里），
     会压在遮罩之上，仍然能用。 -->
<div id="mask">
  <div>⚠️ 检测到截图 / 窗口切换，内容已隐藏</div>
  <div class="mask-s">切回本页后自动恢复（约 4 秒）。<br>
    「模拟计算」「晒票」和三个分段的展开/收起不受影响，可以继续用。</div>
</div>
<!-- 【owner 徽章】已经挪到页面顶部 Tab 条下面（见 __TOP_TABS__ 那段），这里不再重复放。 -->

<!-- 【看大图 · 全屏层】点「晒票」里的图 → 打开它。
     放在页面最下面（折叠区外面），整块收起时也能弹出来。
     4 种关闭方式见 __FB_XYSP_JS__。 -->
${JC_XYSP_VIEW}

<!-- __FB_COUNTDOWN__ 距离下次更新倒数（纯前端，每半小时整点 :00 / :30 为目标）
     免费：只是浏览器里的 setInterval，不请求任何接口、不调 AI。
     数据本身在 :28 / :58 抓取，所以 :00 / :30 那一刻数据已经是新的。 -->
<script>
(function () {
  var el = document.querySelector('.cd[data-cd]');
  if (!el) return;
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function left() {
    var d = new Date();
    /* 【改成每 5 分钟】比分任务每 5 分钟一轮 → 倒计时目标 = 下一个 5 分钟刻度 */
    var sec = d.getMinutes() * 60 + d.getSeconds();
    var step = 300;                        /* 5 分钟 = 300 秒 */
    var rem = step - (sec % step);
    if (rem === step) rem = 0;
    return rem;
  }
  function draw() {
    var s = left();
    if (s <= 0) { el.textContent = '正在更新…'; return; }
    var m = Math.floor(s / 60);
    el.textContent = '实时更新倒计时 ' + pad(m) + ':' + pad(s % 60);
  }
  draw();
  setInterval(draw, 1000);
})();
</script>

<!-- __FB_SEC_JS__ 点了顶部「未开赛/进行中/已完场」的数字 → 自动展开那一栏
     （因为分段默认收起，锚点跳过去如果不展开就看不到内容） -->
<script>
(function () {
  function openTarget() {
    var h = String(location.hash || '');
    if (!h || h.indexOf('#sec-') !== 0) return;
    var el = document.getElementById(h.slice(1));
    if (el && el.tagName === 'DETAILS') el.open = true;
  }
  openTarget();
  window.addEventListener('hashchange', openTarget);
  /* 顶部统计卡也是 <a href="#sec-...">，点的时候 hash 变化 → hashchange 会触发 */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#sec-"]') : null;
    if (!a) return;
    var el = document.getElementById(String(a.getAttribute('href')).slice(1));
    if (el && el.tagName === 'DETAILS') el.open = true;
  }, true);
})();
</script>
<!-- __FB_CALC_JS__ 模拟计算器（纯前端：勾选 / 倍数 → 实时算，不发请求、不刷新页面）
     赔率来自上面内联的 <script type="application/json" id="jcCalcData">（体彩官网官方 SP）。
     算奖规则按体彩竞彩官方规则，见区块底部「怎么算的」。
     【交互边界】竞彩页上只有这一块可以操作；这里【不写任何本地存储】
     （浏览器存储 API 一个都不用，代码里搜不到相关字样）——
     勾选和倍数只存在内存里，刷新页面即回到默认。 -->
<script>
(function () {
  var root = document.getElementById('jcCalc');
  if (!root) return;

  var elN = document.getElementById('calcN');
  var elBets = document.getElementById('calcBets');
  var elCost = document.getElementById('calcCost');
  var elPrize = document.getElementById('calcPrize');
  var elHint = document.getElementById('calcPrizeHint');
  var elWarn = document.getElementById('calcWarn');
  var elMul = document.getElementById('calcMul');
  var elClear = document.getElementById('calcClear');
  var elRand = document.getElementById('calcRand');
  var elPass = document.getElementById('calcPass');
  if (!elN || !elBets || !elCost || !elPrize || !elHint) return;

  var rows = [];
  var dataEl = document.getElementById('jcCalcData');
  if (dataEl) {
    try { rows = JSON.parse(dataEl.textContent || dataEl.innerHTML || '[]') || []; }
    catch (e) { rows = []; }
  }
  var byCode = {};
  for (var r = 0; r < rows.length; r++) { if (rows[r] && rows[r].code) byCode[rows[r].code] = rows[r]; }

  var boxes = root.querySelectorAll('input.calc-cb');
  var MAX_PARLAY = 8;            /* 体彩：胜平负 / 让球胜平负 最多 8 关 */

  function money(v) { return '¥' + v.toFixed(2); }

  /* 官方「单注奖金」保留 2 位小数规则：
     第 3 位 0~4 舍；6~9 进；5 时看第 2 位奇偶（偶舍、奇进） */
  function round2(v) {
    if (!isFinite(v) || v <= 0) return 0;
    var t = Math.round(v * 1000);        /* 千分位整数（消除浮点噪声） */
    var third = t % 10;
    var base = Math.floor(t / 10);       /* 百分位（分） */
    if (third > 5) return (base + 1) / 100;
    if (third === 5) return (base % 2 === 0 ? base : base + 1) / 100;
    return base / 100;
  }
  /* 单注最高奖金限额（体彩竞彩官方规则） */
  function capOf(n) {
    if (n <= 1) return 100000;
    if (n <= 3) return 200000;
    if (n <= 5) return 500000;
    return 1000000;
  }
  function mul() {
    var m = elMul ? parseInt(elMul.value, 10) : 1;
    if (!isFinite(m) || m < 1) m = 1;
    if (m > 99) m = 99;
    return m;
  }
  function warn(t) { if (elWarn) elWarn.textContent = t || ''; }

  /* 【过关方式】下拉当前选中的关数；拿不到就退回 1（单关） */
  function passN() {
    var n = elPass ? parseInt(elPass.value, 10) : 0;
    if (!isFinite(n) || n < 1) n = 1;
    if (n > MAX_PARLAY) n = MAX_PARLAY;
    return n;
  }
  function passCn(n) { return n <= 1 ? '单关' : n + '串1'; }

  /* 随机前如果可选场次不够，用这个把说明带给 update()（只显示一次） */
  var note = '';

  /* ---------- 1) 读勾选（同一场可勾多个结果 → 复式） ---------- */
  function readSelection() {
    var sel = {}, codes = [], i;
    for (i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      var on = !!b.checked;
      var lab = b.parentNode;
      if (lab && lab.classList) { if (on) lab.classList.add('on'); else lab.classList.remove('on'); }
      if (!on) continue;
      var p = String(b.value || '').split('|');
      if (p.length < 3) continue;
      if (!sel[p[0]]) { sel[p[0]] = { had: [], hhad: [] }; codes.push(p[0]); }
      if (p[1] === 'hhad') sel[p[0]].hhad.push(p[2]); else sel[p[0]].had.push(p[2]);
    }
    return { sel: sel, codes: codes };
  }

  var KEY_NAME = { h: '主胜', d: '平', a: '客胜' };
  var POOL_NAME = { had: '胜平负', hhad: '让球' };

  /* ---------- 2) 算一遍 ----------
     界面上的数字和「保存图片」画出来的数字【用的是同一个结果对象】，
     所以图和页面对不上这种事不会发生。 */
  function analyze() {
    var got = readSelection(), sel = got.sel, codes = got.codes;
    var res = {
      n: codes.length, bets: 1, mul: mul(), groups: [],
      ok: false, hint: '', warnText: '',
      loBet: 0, hiBet: 0, capped: false, lim: 0, cost: 0, loPrize: 0, hiPrize: 0,
      passWant: passN()
    };
    if (!res.n) { res.bets = 0; res.hint = '还没勾选场次'; return res; }

    var i, j, mixed = false, missing = false;
    var minProd = 2, maxProd = 2;
    for (i = 0; i < codes.length; i++) {
      var s = sel[codes[i]], rr = byCode[codes[i]] || {};
      var picks = [], lo = Infinity, hi = -Infinity;
      for (j = 0; j < s.had.length; j++) {
        var o1 = rr.had ? rr.had[s.had[j]] : null;
        if (o1 > 0) {
          picks.push({ pool: 'had', key: s.had[j], odds: o1 });
          if (o1 < lo) lo = o1;
          if (o1 > hi) hi = o1;
        }
      }
      for (j = 0; j < s.hhad.length; j++) {
        var o2 = rr.hhad ? rr.hhad[s.hhad[j]] : null;
        if (o2 > 0) {
          picks.push({ pool: 'hhad', key: s.hhad[j], odds: o2 });
          if (o2 < lo) lo = o2;
          if (o2 > hi) hi = o2;
        }
      }
      if (picks.length !== (s.had.length + s.hhad.length)) missing = true;

      res.bets *= (s.had.length + s.hhad.length);
      if (res.n >= 2 && s.had.length && s.hhad.length) mixed = true;
      res.groups.push({
        code: codes[i], league: rr.league || '',
        home: rr.home || '', away: rr.away || '',
        line: (rr.hhad && rr.hhad.line) ? rr.hhad.line : '',
        picks: picks
      });
      if (lo > 0 && hi > 0) { minProd *= lo; maxProd *= hi; }
    }

    if (mixed) {
      res.hint = '该组合不能出票，未计算奖金';
      res.warnText = '同一场比赛不能同时选「胜平负」和「让球胜平负」（体彩混合过关规则），请取消其中一边。';
      return res;
    }
    if (res.n > MAX_PARLAY) {
      res.hint = '该组合不能出票，未计算奖金';
      res.warnText = '已选 ' + res.n + ' 关，超过体彩「胜平负 / 让球胜平负」最多 ' + MAX_PARLAY + ' 关的过关上限，实际不能出票。';
      return res;
    }
    if (missing) {
      res.hint = '所选场次缺少赔率，无法试算';
      res.warnText = '所选里有一场没有可用赔率（官方可能刚更新），取消后重试。';
      return res;
    }

    res.lim = capOf(res.n);
    var rawMax = round2(maxProd);
    res.loBet = Math.min(round2(minProd), res.lim);
    res.hiBet = Math.min(rawMax, res.lim);
    res.capped = rawMax > res.lim;
    res.loPrize = res.loBet * res.mul;
    res.hiPrize = res.hiBet * res.mul;
    res.cost = res.bets * 2 * res.mul;
    res.ok = true;
    return res;
  }

  /* ---------- 3) 把算出来的结果画到界面上 ---------- */
  function update() {
    var res = analyze();
    elN.textContent = String(res.n);
    elBets.textContent = String(res.bets);
    elCost.textContent = money(res.cost);

    if (!res.n) {
      elPrize.textContent = money(0);
      elHint.textContent = '还没勾选场次' + (note ? ' · ' + note : '');
      note = '';
      warn('');
      return;
    }
    if (!res.ok) {
      elPrize.textContent = '—';
      elHint.textContent = res.hint;
      warn(res.warnText);
      return;
    }

    /* 【过关方式】和实际勾选场数不一致时给出软提示：
       奖金始终按【实际勾了几场】算（体彩规则里 3 场就是 3串1，没法按 2串1 出票）。
       note 非空 = 「随机时可选场次不够」那条说明（已经讲了按几关算），不重复叠。 */
    var passNote = note
      ? ' · ' + note
      : (res.n !== res.passWant
        ? ' · ⚠️ 已勾 ' + res.n + ' 场，与所选「' + passCn(res.passWant) + '」不一致 → 按实际 ' + passCn(res.n) + ' 计算'
        : '');
    elPrize.textContent = (res.loPrize === res.hiPrize)
      ? money(res.hiPrize) : (money(res.loPrize) + ' ~ ' + money(res.hiPrize));
    elHint.textContent = (res.n === 1 ? '单关' : res.n + ' 关·串关') +
      ' · 共 ' + res.bets + ' 注 · 单注奖金 ' +
      (res.loBet === res.hiBet ? res.loBet.toFixed(2) : res.loBet.toFixed(2) + '~' + res.hiBet.toFixed(2)) + ' 元' +
      (res.bets > 1 ? '（复式，中其中一注）' : '') +
      (res.capped ? ' · 已按单注最高限额 ' + res.lim + ' 元封顶' : '') +
      (res.n === 1 ? ' · 单关能否投注以官方为准' : '') +
      passNote;
    note = '';
    warn('');
  }

  for (var k = 0; k < boxes.length; k++) boxes[k].addEventListener('change', update);
  if (elMul) {
    elMul.addEventListener('input', update);
    elMul.addEventListener('change', update);
  }
  if (elClear) {
    elClear.addEventListener('click', function () {
      for (var i = 0; i < boxes.length; i++) boxes[i].checked = false;
      if (elMul) elMul.value = '1';
      update();
    });
  }

  /* ============================================================
     【GPT随机】—— 纯前端随机帮用户勾几场，再实时算奖金。
       规则（都按体彩真实可投注的组合来）：
         · 【先按上面选的过关方式】决定要挑几场：选 2串1 就正好挑 2 场，选 5串1 就 5 场
           （可用的场次不够 N 场时，挑满可用的那几场并在说明里讲清楚，不硬凑、不报错）
         · 每场只勾 1 个结果，在「胜平负 / 让球胜平负」里随机挑一个玩法，
           再在该玩法的 主胜 / 平 / 客胜 里随机挑一个有赔率的
         · 同一场绝不重复、不重复勾（先清空再勾）
         · 只改内存里的勾选状态 → 刷新页面即消失（不写任何本地存储） */
  var POOLS = ['had', 'hhad'];
  var KEYS = ['h', 'd', 'a'];

  function optionsOf(r) {
    var out = [];
    for (var p = 0; p < POOLS.length; p++) {
      var pool = POOLS[p];
      if (!r[pool]) continue;
      for (var i = 0; i < KEYS.length; i++) {
        var o = r[pool][KEYS[i]];
        if (o > 0) out.push({ pool: pool, key: KEYS[i], odds: o });
      }
    }
    return out;
  }
  function findBox(code, pool, key) {
    var v = code + '|' + pool + '|' + key;
    for (var i = 0; i < boxes.length; i++) { if (boxes[i].value === v) return boxes[i]; }
    return null;
  }

  function gptRandom() {
    var avail = [], i, j;
    for (i = 0; i < rows.length; i++) {
      var opts = optionsOf(rows[i]);
      if (opts.length) avail.push({ code: rows[i].code, opts: opts });
    }
    if (!avail.length) { warn('暂无可随机的赔率数据。'); return; }

    for (i = 0; i < boxes.length; i++) boxes[i].checked = false;   /* 先清空 → 换一批 */

    var want = passN();                                            /* 下拉选的关数 */
    note = '';
    if (avail.length < want) {
      note = '可选的只有 ' + avail.length + ' 场，不足 ' + passCn(want) + ' → 本次按 ' + passCn(avail.length) + ' 随机';
      want = avail.length;
    }

    /* Fisher-Yates 洗牌后取前 want 场（保证不重复同一场、每场只勾 1 个结果） */
    for (i = avail.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      var t = avail[i]; avail[i] = avail[j]; avail[j] = t;
    }
    for (i = 0; i < want; i++) {
      var item = avail[i];
      var pick = item.opts[Math.floor(Math.random() * item.opts.length)];
      var b = findBox(item.code, pick.pool, pick.key);
      if (b) b.checked = true;
    }
    update();     /* 勾完立刻算奖金（和手动勾选同一条计算路径） */
  }

  if (elPass) elPass.addEventListener('change', update);
  if (elRand) {
    elRand.addEventListener('click', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      gptRandom();
    });
    /* 键盘可访问：role 已是 button，回车 / 空格也能摇 */
    elRand.addEventListener('keydown', function (e) {
      var key = e ? (e.key || e.code || '') : '';
      if (key === 'Enter' || key === ' ' || key === 'Spacebar' || key === 13 || key === 32) {
        if (e.preventDefault) e.preventDefault();
        gptRandom();
      }
    });
  }

  /* ============================================================
     【保存图片】把当前选号画成一张 PNG（纯前端 canvas，不联网、不写任何存储）
       · 点「保存图片」→ canvas 画出来 → 全屏层显示 → 用户长按 / 右键自己保存
       · 没勾选 → 提示「请先选择比赛」，不生成空图
       · 画不出来 → 明说画不出来，绝不静默失败
       · 图上的数字来自 analyze()，和界面上看到的是同一份
     ============================================================ */
  var elShot = document.getElementById('calcShot');
  var elShotImg = document.getElementById('calcShotImg');
  var elShotX = document.getElementById('calcShotX');
  var elShotBtn = document.getElementById('calcShotBtn');
  var shotOpen = false, shotHist = false;

  function two(v) { return (v < 10 ? '0' : '') + v; }
  function nowText() {
    var d = new Date();
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' +
      two(d.getHours()) + ':' + two(d.getMinutes());
  }
  function cut(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function drawShot(res) {
    if (typeof document.createElement !== 'function') return null;
    var canvas = document.createElement('canvas');
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
    var W = 760, pad = 28, y;
    var heights = res.groups.map(function (g) { return 46 + g.picks.length * 30; });
    var bodyH = 0;
    for (var q = 0; q < heights.length; q++) bodyH += heights[q];
    var H = 168 + bodyH + 186;
    canvas.width = W;
    canvas.height = H;

    /* 背景 + 标题区 */
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#161a21';
    ctx.fillRect(0, 0, W, 148);
    ctx.fillStyle = '#e8eaed';
    ctx.font = 'bold 34px ' + FONT;
    ctx.fillText('模拟计算 · 春风', pad, 62);
    ctx.fillStyle = '#47e0a0';
    ctx.font = '22px ' + FONT;
    ctx.fillText('过关方式 ' + passCn(res.n) + '　注数 ' + res.bets + ' 注　倍数 ' + res.mul + ' 倍', pad, 100);
    ctx.fillStyle = '#6b7488';
    ctx.font = '20px ' + FONT;
    ctx.fillText('生成时间 ' + nowText(), pad, 130);

    /* 每一场：编号 + 队名 + 勾的结果和赔率 */
    y = 186;
    var gi;
    for (gi = 0; gi < res.groups.length; gi++) {
      var g = res.groups[gi];
      var gh = heights[gi];
      ctx.fillStyle = gi % 2 ? '#12151d' : '#161a21';
      ctx.fillRect(pad - 8, y - 32, W - (pad - 8) * 2, gh - 8);
      ctx.fillStyle = '#98a1b2';
      ctx.font = 'bold 21px ' + FONT;
      ctx.fillText(cut(g.code, 8), pad, y);
      ctx.fillStyle = '#e8eaed';
      ctx.font = 'bold 22px ' + FONT;
      ctx.fillText(cut(g.home + ' vs ' + g.away, 20), pad + 96, y);
      ctx.fillStyle = '#6b7488';
      ctx.font = '18px ' + FONT;
      ctx.fillText(cut(g.league, 10), W - pad - 96, y);
      for (var pi = 0; pi < g.picks.length; pi++) {
        var p = g.picks[pi];
        ctx.fillStyle = '#47e0a0';
        ctx.font = '21px ' + FONT;
        ctx.fillText(POOL_NAME[p.pool] + (p.pool === 'hhad' ? (g.line || '') : '') +
          ' ' + KEY_NAME[p.key] + '　' + p.odds, pad + 12, y + 28 + pi * 30);
      }
      y += gh;
    }

    /* 底部：投注额 / 预计奖金 / 规则与合规 */
    var by = y + 4;
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(pad - 8, by, W - (pad - 8) * 2, 160);
    ctx.fillStyle = '#98a1b2';
    ctx.font = '22px ' + FONT;
    ctx.fillText('总投注额　' + money(res.cost), pad, by + 38);
    ctx.fillStyle = '#47e0a0';
    ctx.font = 'bold 30px ' + FONT;
    ctx.fillText('预计奖金　' + (res.loPrize === res.hiPrize
      ? money(res.hiPrize) : (money(res.loPrize) + ' ~ ' + money(res.hiPrize))), pad, by + 86);
    ctx.fillStyle = '#6b7488';
    ctx.font = '18px ' + FONT;
    ctx.fillText('单注 2 元 · 按体彩竞彩官方规则试算（保留 2 位小数）', pad, by + 118);
    ctx.fillText('仅供娱乐，不构成购彩建议 · 请理性购彩', pad, by + 146);

    return canvas;
  }

  function openShot() {
    var res = analyze();
    if (!res.n) { warn('请先选择比赛，再保存图片。'); return; }
    if (!res.ok) { warn(res.warnText || res.hint); return; }

    var canvas = null;
    try { canvas = drawShot(res); } catch (e) { canvas = null; }
    if (!canvas || typeof canvas.toDataURL !== 'function') {
      warn('图片生成失败（这个浏览器不支持 canvas），可以先照着页面上的数字自己记一下。');
      return;
    }
    var url = '';
    try { url = canvas.toDataURL('image/png'); } catch (e) { url = ''; }
    if (!url) { warn('图片生成失败（canvas 导出为空），换个浏览器再试。'); return; }
    if (!elShot || !elShotImg) { warn('图片生成失败（页面上没有全屏层）。'); return; }

    elShotImg.src = url;
    elShotImg.width = canvas.width;
    elShotImg.height = canvas.height;
    elShot.classList.add('on');
    shotOpen = true;
    warn('');

    /* 手机返回键也能关：进图时压一个 history 状态（没有 history 就跳过） */
    try {
      /* 没有 history 或不让 push（file: 等）→ ReferenceError / 抛错都被这里兜住 */
      if (history && history.pushState) {
        history.pushState({ calcShot: 1 }, '');
        shotHist = true;
      }
    } catch (e) { shotHist = false; }
  }

  function closeShot() {
    if (!shotOpen) return;
    shotOpen = false;
    if (elShot) elShot.classList.remove('on');
    if (elShotImg) {
      if (elShotImg.removeAttribute) elShotImg.removeAttribute('src');
      else elShotImg.src = '';
    }
    if (shotHist) {
      shotHist = false;
      try { history.back(); } catch (e) { /* 忽略 */ }
    }
  }

  if (elShotBtn) {
    elShotBtn.addEventListener('click', function (e) {
      /* 这个按钮在 <summary> 里：阻止默认行为，点了不会顺手把整块收起 */
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      openShot();
    });
    elShotBtn.addEventListener('keydown', function (e) {
      var key = e ? (e.key || e.code || '') : '';
      if (key === 'Enter' || key === ' ' || key === 'Spacebar' || key === 13 || key === 32) {
        if (e.preventDefault) e.preventDefault();
        openShot();
      }
    });
  }
  if (elShotX) {
    elShotX.addEventListener('click', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      closeShot();
    });
  }
  if (elShot) {
    /* 点空白关掉；点图片本身不关（方便长按保存） */
    elShot.addEventListener('click', function (e) {
      if (e && e.target && e.target === elShotImg) return;
      closeShot();
    });
  }
  if (document.addEventListener) {
    document.addEventListener('keydown', function (e) {
      var key = e ? (e.key || e.code || '') : '';
      if (key === 'Escape' || key === 'Esc' || key === 27) closeShot();
    });
  }
  if (window && window.addEventListener) {
    window.addEventListener('popstate', function () { closeShot(); });
  }

  update();   /* 初始：一个都没勾 → 0 关 0 注 ¥0.00（刷新后也是这样，不做任何持久化） */
})();
</script>
<!-- __FB_LOCK_JS__ 防截图锁定（最终版）
     · 【谁是主人 owner】先看协议、再看公网 IP：
         ① location.protocol === 'file:' → 本机 App 打开的（一定是自己，立刻放行，不联网）
         ② 网页打开的 → 多源查公网 IP（ipify → ipinfo → ip.sb → ifconfig，每源 4 秒超时），
            只有等于 OWNER_IP 才算自己
       ⚠️ 判定结果只放在内存里，【不写任何浏览器本地存储】；每次打开重新查一遍
     · 【owner】只加 html.is-owner（右上角出现「👑 管理员模式 · 可截图」徽章），不拦任何操作
     · 【别人】失焦 / 切窗口 / 切标签 / 截屏按键 → 保护内容模糊 + 全屏遮罩（4 秒后自动解锁）
     · 豁免区：.m-calc（模拟计算）和 .m-sec（三个分段）—— locked 时压在遮罩之上照常可用
     · ⚠️ 默认就当「别人」处理（保护先开着），等 IP 查完确认是自己再解除 ——
        避免刚打开那几百毫秒完全没有保护；IP 全查不到时也按「别人」处理（安全降级）
     · ⚠️ 这只是提高门槛，【不能真正禁止截图】（详见给用户的说明） -->
<script>
(function () {
  var OWNER_IP = '120.231.138.19';   /* 主人公网 IP（家宽 IP 会变，所以还有 file: 那条兜底） */
  var LOCK_MS = 4000;                /* lock 之后最多挡这么久，自动恢复 */
  var IP_TIME_OUT = 4000;            /* 每个 IP 源最多等这么久 */
  var ownerMode = false;             /* 默认按「别人」处理 → 先保护 */
  var timer = null;

  /* ---------- ① 多源查公网 IP（一个源不灵就换下一个） ---------- */
  var IP_SOURCES = [
    { url: 'https://api.ipify.org?format=json', pick: function (j) { return j && j.ip; } },
    { url: 'https://ipinfo.io/json', pick: function (j) { return j && j.ip; } },
    { url: 'https://api.ip.sb/jsonip', pick: function (j) { return j && j.ip; } },
    { url: 'https://ifconfig.me/all.json', pick: function (j) { return j && (j.ip_addr || j.ip); } }
  ];
  /* ⚠️ 这里【故意不用正则】：这段代码写在模板字符串里，
     正则里的 \d 会被模板字符串吃掉（变成 d）→ 判断永远失败。
     改成纯字符判断，怎么写都不会被转义坑到。 */
  function isIPv4(s) {
    var v = String(s == null ? '' : s).trim().split('.');
    if (v.length !== 4) return false;
    for (var i = 0; i < 4; i++) {
      var p = v[i];
      if (!p || p.length > 3) return false;
      for (var j = 0; j < p.length; j++) {
        var c = p.charCodeAt(j);
        if (c < 48 || c > 57) return false;        /* 只允许 0-9 */
      }
    }
    return true;
  }

  function getVisitorIP() {
    var i = 0;
    function next() {
      if (i >= IP_SOURCES.length) return Promise.resolve(null);
      var s = IP_SOURCES[i++];
      return new Promise(function (resolve) {
        var ctl = null, t = null;
        try { ctl = new AbortController(); } catch (e) { ctl = null; }
        if (ctl && ctl.signal) t = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, IP_TIME_OUT);
        var opt = { cache: 'no-store' };
        if (ctl) opt.signal = ctl.signal;
        Promise.resolve()
          .then(function () { return fetch(s.url, opt); })
          .then(function (res) {
            if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
            return res.json();
          })
          .then(function (j) {
            if (t) clearTimeout(t);
            var ip = s.pick(j);
            if (isIPv4(ip)) resolve(String(ip).trim());
            else resolve(next());                      /* 这个源没给出 IP → 换下一个 */
          })
          .catch(function () {
            if (t) clearTimeout(t);
            resolve(next());                           /* 连不上 / 超时 → 换下一个 */
          });
      });
    }
    return next();
  }

  /* ---------- ② owner 判定：file: 协议优先，其次公网 IP ---------- */
  function isOwner() {
    try {
      /* 读不到 location（比如沙箱里）→ 抛错被这里兜住，当「不是 file:」处理 */
      if (location && location.protocol === 'file:') {
        return Promise.resolve(true);                  /* 本机 App 打开 → 一定是自己 */
      }
    } catch (e) { /* 读不到协议 → 当网页处理 */ }
    return getVisitorIP().then(function (ip) { return !!(ip && ip === OWNER_IP); });
  }

  function guard() { return !ownerMode; }              /* true = 需要保护（别人） */

  function lock() {
    if (!guard()) return;
    document.documentElement.classList.add('locked');
    if (timer) clearTimeout(timer);
    timer = setTimeout(unlock, LOCK_MS);
  }
  function unlock() {
    document.documentElement.classList.remove('locked');
    if (timer) { clearTimeout(timer); timer = null; }
  }
  function markOwner() {
    ownerMode = true;
    unlock();                                          /* 自己人：立刻解除锁定 */
    document.documentElement.classList.add('is-owner');
  }

  /* 清空剪贴板（能清就清，清不了就算了） */
  function clearClip() {
    try {
      if (navigator && navigator.clipboard &&
          navigator.clipboard.writeText) {
        var p = navigator.clipboard.writeText('');
        if (p && p.catch) p.catch(function () {});
      }
    } catch (e) { /* 忽略 */ }
  }
  /* 焦点还在页面里的输入框上（手机弹键盘）不算「切窗口」 */
  function typing() {
    var ae = document.activeElement;
    return !!(ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA'));
  }

  window.addEventListener('blur', function () { if (guard() && !typing()) lock(); });
  window.addEventListener('focus', function () { if (guard()) unlock(); });
  document.addEventListener('visibilitychange', function () {
    if (!guard()) return;
    if (document.hidden) lock(); else unlock();
  });

  function keyOf(e) {
    if (!e) return '';
    if (e.key) return String(e.key);
    if (e.code) return String(e.code);
    return '';
  }
  function isShotKey(e, k) {
    if (k === 'PrintScreen') return true;                        /* PrintScreen */
    if ((k === '3' || k === '4' || k === '5') && e.metaKey && e.shiftKey) return true;   /* macOS */
    if ((k === 'S' || k === 's') && e.shiftKey) return true;      /* Win+Shift+S */
    return false;
  }
  function isDevKey(e, k) {
    if (k === 'F12') return true;
    if (e.ctrlKey && e.shiftKey && 'IiJjCc'.indexOf(k) >= 0) return true;
    if (e.ctrlKey && (k === 'u' || k === 'U')) return true;      /* 查看源码 */
    return false;
  }

  window.addEventListener('keydown', function (e) {
    if (!guard()) return;
    var k = keyOf(e);
    if (isShotKey(e, k)) { lock(); clearClip(); }
    if (isDevKey(e, k)) { if (e.preventDefault) e.preventDefault(); lock(); }
  });
  window.addEventListener('keyup', function (e) {
    if (!guard()) return;
    var k = keyOf(e);
    if (isShotKey(e, k)) { lock(); clearClip(); }
  });

  /* 禁右键 / 禁拖拽 / 禁复制剪切
     【白名单】事件落在 .allow-save 里（模拟计算区块 / 生成的选号图）→ 直接放行，
     页面其它地方（统计卡 / 战绩 / 比赛卡片 / 免责声明）一律拦掉。 */
  function inAllowSave(e) {
    var t = e && e.target;
    if (!t) return false;
    if (t.closest) return !!t.closest('.allow-save');
    var n = t;                                    /* 老浏览器没有 closest 就自己往上找 */
    while (n) {
      if (n.className && String(n.className).indexOf('allow-save') >= 0) return true;
      n = n.parentNode;
    }
    return false;
  }
  ['contextmenu', 'dragstart', 'copy', 'cut'].forEach(function (t) {
    document.addEventListener(t, function (e) {
      if (!guard()) return;
      if (inAllowSave(e)) return;                 /* 白名单：允许保存的地方不拦 */
      if (e.preventDefault) e.preventDefault();
    });
  });

  /* ---------- ③ 查一次身份：是自己就解除保护 + 亮徽章 ---------- */
  try {
    isOwner().then(function (own) {
      if (own) markOwner();
    }).catch(function () { /* 判定失败 → 保持「别人」的保护状态（安全降级） */ });
  } catch (e) { /* 同上 */ }
})();
</script>

<!-- __FB_XYSP_JS__ 【晒票】点图看大图（外加 4 种关闭方式）
     用户原话：「竞赛页面 也做一个晒票 …」+「点图放大」
     做法参考只读分享页那套 ro-mob-view 的思路，但这里是【极简一版】：
       打开：点 .jxp-pic → 取它的 href（原图）塞进全屏层的 <img>
       关闭 4 通路：
         ① 点图片外的空白（.jxp-view 自己 / .jxp-view-box 空白处）
         ② 右上角 ×（是 <a role="button">，不是 button 标签）
         ③ Esc 键
         ④ 手机返回键（打开时 push 一个 history 状态，popstate 时关掉）
     纯前端：不请求任何接口、不调 AI、不写任何本地存储 → 0 成本。
     ⚠️ 这一块【不出任何裸 button 标签】（页面不变量靠数那个标签的开头串来验，
        所以连注释里都不写它的字面量）。
     脚本挂了也不影响别的区块：晒票图仍会按 href 自己打开原图。 -->
<script>
(function () {
  try {
    var view = document.getElementById('jcXyspView');
    var box = document.getElementById('jcXyspViewBox');
    var img = document.getElementById('jcXyspViewImg');
    var xBtn = document.getElementById('jcXyspViewX');
    if (!view || !box || !img) return;

    var pics = document.querySelectorAll('.jxp-pic');
    var pushed = false;     /* 是否压过一条 history（避免重复压） */

    /* ============================================================
       【相册 · 上下滑动切换】用户要求（和分享页同一套手感）：
         向上滑 → 下一张 / 向下滑 → 上一张
         第一张向下、最后一张向上 → 停在原地
         切图后缩放（这里没有两档缩放，只是换图）重置
       手势判定（和"点一下"共存）：
         位移 < 10px 且 < 300ms → 算点击（这里点了不做别的，交给原逻辑）
         位移 > 50px（纵向）    → 算滑动 → 切图
       只在【全屏层打开 + 单指 + 纵向超阈值】时才 preventDefault，
       避免平时页面滚动被拦。
       ⚠️ 切图【不压历史】—— 否则返回键要一张一张退回去，关不掉。
       ⚠️ 这里【不新造第二个全屏层】，就在已有的 #jcXyspView 上加手势。
       ============================================================ */
    var galleryList = [];   /* [{src, cap}] 页面上的顺序 = 发布时间倒序 */
    var galleryIdx = 0;

    function flipTo(i) {
      if (!galleryList.length) return false;
      if (i < 0 || i >= galleryList.length) return false;   /* 边界：停住 */
      galleryIdx = i;
      var it = galleryList[i] || {};
      img.setAttribute('src', it.src || '');
      img.setAttribute('alt', it.cap || '竞彩晒票大图');
      updateHint();
      return true;
    }
    function updateHint() {
      var h = document.getElementById('jcXyspHint');
      if (!h) return;
      if (galleryList.length > 1) h.textContent = '第 ' + (galleryIdx + 1) + ' / ' + galleryList.length + ' 张 · 上下滑动切换';
      else h.textContent = '上下滑动切换';
    }
    function visiblePics() {
      var out = [];
      for (var k = 0; k < pics.length; k++) out.push(pics[k]);
      return out;
    }

    var sX = 0, sY = 0, sT = 0, sOn = false;
    view.addEventListener('touchstart', function (e) {
      if (!isOpen() || !e.touches || e.touches.length !== 1) return;
      sOn = true; sX = e.touches[0].clientX; sY = e.touches[0].clientY; sT = Date.now();
    }, { passive: true });
    view.addEventListener('touchmove', function (e) {
      if (!sOn || !e.touches || e.touches.length !== 1) return;
      var dy = e.touches[0].clientY - sY, dx = e.touches[0].clientX - sX;
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { if (e.cancelable) e.preventDefault(); }
    }, { passive: false });
    view.addEventListener('touchend', function (e) {
      if (!sOn) return; sOn = false;
      var t = (e.changedTouches && e.changedTouches[0]) || null;
      if (!t) return;
      var dy = t.clientY - sY, dx = t.clientX - sX;
      var dist = Math.sqrt(dx * dx + dy * dy), dt = Date.now() - sT;
      if (dist < 10 && dt < 300) return;                    /* 点击 → 不切图 */
      if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) {
        if (dy < 0) flipTo(galleryIdx + 1); else flipTo(galleryIdx - 1);
      }
    }, { passive: true });
    /* 桌面：鼠标滚轮（节流，避免一次滚动跳好几张） */
    var wheelLock = 0;
    view.addEventListener('wheel', function (e) {
      if (!isOpen() || galleryList.length < 2) return;
      var now = Date.now();
      if (now - wheelLock < 320) { if (e.cancelable) e.preventDefault(); return; }
      var d = e.deltaY || 0;
      if (Math.abs(d) < 8) return;
      wheelLock = now;
      if (e.cancelable) e.preventDefault();
      if (d > 0) flipTo(galleryIdx + 1); else flipTo(galleryIdx - 1);
    }, { passive: false });

    function isOpen() { return !view.hasAttribute('hidden'); }

    function open(src, alt) {
      if (!src) return false;
      img.setAttribute('src', src);
      img.setAttribute('alt', alt || '竞彩晒票大图');
      view.removeAttribute('hidden');
      try { history.pushState({ jcXyspView: 1 }, ''); pushed = true; } catch (e) { pushed = false; }
      return true;
    }

    function close() {
      view.setAttribute('hidden', '');
      /* 清掉 src，省内存、也避免下次打开先闪上一张 */
      img.removeAttribute('src');
      if (pushed) {
        pushed = false;
        /* 让 history 回到打开前那一步 —— 但不能把自己再弹一次，
           所以先摘掉标记：把 state 换成"已关闭"。 */
        try { history.replaceState({ jcXyspViewClosed: 1 }, ''); } catch (e) { /* 忽略 */ }
      }
    }

    /* 打开：只绑在晒票的图上；图打不开时让 href 自己打开原图（功能不丢） */
    for (var i = 0; i < pics.length; i++) {
      pics[i].addEventListener('click', function (e) {
        var src = this.getAttribute('href');
        /* 把【页面上这批图】作为相册列表（顺序 = 页面顺序 = 发布时间倒序），
           并定位到被点的那一张，这样上下滑动就在这批里前后走。 */
        var list = visiblePics();
        var idx = 0;
        for (var q = 0; q < list.length; q++) { if (list[q] === this) { idx = q; break; } }
        galleryList = [];
        for (var w = 0; w < list.length; w++) {
          var b = list[w].querySelector('.jxp-cap');
          galleryList.push({ src: list[w].getAttribute('href'), cap: b ? String(b.textContent || '') : '' });
        }
        galleryIdx = idx;
        if (open(src, '竞彩晒票大图')) {
          updateHint();
          if (e && e.preventDefault) e.preventDefault();
        }
      });
    }

    /* 关闭 ① 点空白（点在层本身或图片容器上，而不是点在图上） */
    view.addEventListener('click', function (e) {
      if (e.target === view || e.target === box) close();
    });
    /* 关闭 ② × */
    if (xBtn) {
      xBtn.addEventListener('click', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        close();
      });
    }
    /* 关闭 ③ Esc */
    window.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.keyCode === 27) && isOpen()) close();
    });
    /* 关闭 ④ 手机返回键 / 浏览器后退 */
    window.addEventListener('popstate', function () {
      if (isOpen()) close();
    });

    /* 给验收脚本留一个干净入口（不影响页面行为） */
    window.__jcXysp = {
      pics: pics.length,
      open: open,
      close: close,
      isOpen: isOpen,
      current: function () { return img.getAttribute('src') || ''; },
      /* 【相册】给验收脚本用：直接切上一张/下一张，不用造触摸事件 */
      setGallery: function (list, i, src, cap) {
        galleryList = Array.isArray(list) ? list : [];
        galleryIdx = Number(i) || 0;
        if (open(src, cap)) { updateHint(); return true; }
        return false;
      },
      step: flipTo,
      gallery: function () { return { i: galleryIdx, n: galleryList.length }; }
    };
  } catch (e) { /* 忽略：晒票的显示不依赖这段脚本 */ }
})();
</script>
<script>
/* ============================================================
   【推荐 / 推荐历史结果 / 推荐单 · 每 30 秒拉一次线上最新数据】
   ------------------------------------------------------------
   用户 2026-10-18（截图）：这两块「没有实时更新吧」。
   查完的结论（旧实现）：
     · 「推荐」（在售 · 信心 >=58% · N 场 + 比赛列表）压根没人刷新 → 一直是构建时那份；
     · 「推荐历史结果」只在另一段 60 秒的 fetch 里换过数字和列表，
       「还有 N 组没打完」那行没人动，也看不出「到底在不在刷」。
   现在合成【一个 30 秒的循环】刷三块（同一页、不重载）：
     ① #recStatsBar  推荐单 红 / 黑 / 命中率
     ② #jcRec        「推荐」在售场次（条数 + 每场比赛）
     ③ #jcRecArch    「推荐历史结果」（红黑 · 命中率 · 还有几组没打完 · 往期列表 · 时间行）
   ⚠️ 通道用 <script src="jc-reco-view.js?t=...">：
      本机是 file:// 直接打开的，fetch 同目录文件会被 CORS 拦，经典脚本不受限；
      线上是同一个文件（云端每班重建后发布到站点根）→ 本机 / 线上都能刷。
   ⚠️ 不用任何浏览器存储（localStorage / sessionStorage 一个都不用）——
      上一份数据只放在这个闭包的变量里，刷新页面全部回到默认。
   ⚠️ 数据没变（updated 一样）就不动 DOM，只把那行「已同步 hh:mm:ss」重写一遍：
      用户看得见在刷，又不会白闪。
   ⚠️ 取不到 / 解析失败 → 什么都不做，页面保持构建时那份（绝不空白、绝不填 0）。
   ⚠️ 只换这三块的内容，其它元素一律不碰
      （模拟计算、三个分段、晒票、免责声明都不受影响）。 */
(function () {
  var VIEW = 'jc-reco-view.js';
  var POLL_MS = 30000;
  /* 兜底：只有 jc-reco-view.js 完全取不到时，才去拉线上 /data/ 那份 JSON。
     本机 file:// 会被 CORS 拦 → 静默跳过，页面不留空白。 */
  var PAST_URL = 'data/recommend.json';
  var bar = document.getElementById('recStatsBar') || document.getElementById('jcRecStat');
  var pairBox = document.getElementById('jcConfidentPair');
  var recBox = document.getElementById('jcRec');
  var archBox = document.getElementById('jcRecArch');
  var last = (bar && bar.getAttribute('data-reco-updated')) || '';
  var pastBusy = false;
  /* 首轮不把同一份内容重排一遍 */
  if (archBox) archBox.__recoHtml = archBox.innerHTML;

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function hms() {
    var d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }
  /* 【看得见在刷】推荐历史结果底部那行小字（数据时间 + 本次同步的秒数） */
  function syncLine(stamp) {
    var el = document.getElementById('recoSync');
    if (!el) return;
    var t = String(stamp || '').split(' ').pop();
    el.textContent = (t ? '数据更新 ' + t + ' · ' : '') + '已同步 ' + hms();
  }

  /* ②「推荐」在售：只换条数文案 + 每场的行；
     summary / 提示 / <details> 的开合状态一律不动 */
  function applyReco(v) {
    if (!recBox || !v || !v.rec) return;
    var cnt = recBox.querySelector('.m-reccount');
    if (cnt && typeof v.rec.count === 'string' && cnt.textContent !== v.rec.count) {
      cnt.textContent = v.rec.count;
    }
    if (typeof v.rec.html !== 'string' || recBox.__recoRows === v.rec.html) return;
    var olds = recBox.querySelectorAll('.m-recrow, .m-recempty');
    for (var i = 0; i < olds.length; i++) {
      if (olds[i].parentNode) olds[i].parentNode.removeChild(olds[i]);
    }
    var tmp = document.createElement('div');
    tmp.innerHTML = v.rec.html;
    while (tmp.firstChild) recBox.appendChild(tmp.firstChild);
    recBox.__recoRows = v.rec.html;
  }

  /* ③「推荐历史结果」：整块 innerHTML 换
     （红黑 / 命中率 / 还有几组没打完 / 往期列表 / 时间行都在里面） */
  function applyArch(html) {
    if (!archBox || typeof html !== 'string' || !html) return;
    if (archBox.__recoHtml === html) return;
    archBox.innerHTML = html;
    archBox.__recoHtml = html;
  }

  function apply() {
    var v = window.JC_RECO_VIEW;
    if (!v || v.layout !== 'pair-only-v2') return false;
    if (v.updated && v.updated !== last) {
      if(pairBox && typeof v.parlay === 'string') pairBox.innerHTML=v.parlay;
      if (bar && typeof v.stat === 'string') {
        /* 兼容过渡态：线上的数据文件还是旧版时，stat 里没有「推荐单」标签 → 补上，别让标签消失 */
        bar.innerHTML = v.stat.indexOf('class="label') >= 0
          ? v.stat
          : '<span class="label t">推荐单</span>' + v.stat;
      }
      if (bar) bar.setAttribute('data-reco-updated', v.updated);
      applyReco(v);
      applyArch(v.arch);
      /* 【顶部小喇叭】内容跟着一起换（只是两个 group 的 innerHTML，
         轨道本身和动画不动，不会重新从左边滚） */
      var mq = document.getElementById('broadcastBar') || document.getElementById('jcHitMq');
      if (mq && typeof v.mq === 'string') {
        var gs = mq.querySelectorAll('.m-mq-group');
        for (var i = 0; i < gs.length; i++) gs[i].innerHTML = v.mq;
      }
      last = v.updated;
    }
    syncLine(v.updated);
    return true;
  }

  /* ---------- 兜底渲染：只有主通道（jc-reco-view.js）取不到时才跑 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function renderPast(data) {
    if (!data || typeof data !== 'object') return;
    var statsEl = document.getElementById('pastStats');
    if (statsEl) {
      statsEl.textContent = '红 ' + (data.red == null ? 0 : data.red) +
        ' · 黑 ' + (data.black == null ? 0 : data.black) +
        ' · 命中率 ' + (data.rate || '—');
    }
    /* 「还有 N 组没打完」那行也一起换（那份 JSON 里带 unfinished） */
    var pend = document.querySelector('#jcRecArch .past-pending');
    if (pend && typeof data.unfinished === 'number') {
      pend.textContent = data.unfinished > 0
        ? '还有 ' + data.unfinished + ' 组没打完，未出结果前不列出'
        : '';
    }
    var listEl = document.getElementById('pastList');
    if (!listEl) { syncLine(data.updated); return; }
    var hist = Array.isArray(data.history) ? data.history.slice() : [];
    if (!hist.length) {
      listEl.innerHTML = '<div class="past-empty">暂无往期推荐</div>';
      syncLine(data.updated);
      return;
    }
    /* 【两种结构都吃】分组：[{dateStr, finishTime, verdict, matches:[...]}]
       扁平：[{matchNo, teams, pick, score, result, dateStr, finishTime}]
       扁平的先按 dateStr 分组，再走同一套渲染。 */
    var groups = [];
    var isGrouped = !!(hist[0] && Array.isArray(hist[0].matches));
    if (isGrouped) {
      groups = hist.map(function (g) {
        return {
          dateStr: g.dateStr, finishTime: g.finishTime || 0, verdict: g.verdict || '',
          matches: Array.isArray(g.matches) ? g.matches : []
        };
      });
    } else {
      var byKey = {};
      hist.forEach(function (m) {
        var k = m.dateStr || '往期';
        if (!byKey[k]) byKey[k] = { dateStr: k, finishTime: m.finishTime || 0, verdict: '', matches: [] };
        byKey[k].matches.push(m);
        if ((m.finishTime || 0) > byKey[k].finishTime) byKey[k].finishTime = m.finishTime || 0;
      });
      groups = Object.keys(byKey).map(function (k) {
        var g = byKey[k];
        if (!g.verdict) {
          var r = 0, b = 0;
          g.matches.forEach(function (m) { if (m.result === 'red') r++; else if (m.result === 'black') b++; });
          g.verdict = r && !b ? '红' : (b && !r ? '黑' : '');
        }
        return g;
      });
    }
    groups.sort(function (a, b) { return (b.finishTime || 0) - (a.finishTime || 0); });
    listEl.innerHTML = groups.map(function (g) {
      var ms = Array.isArray(g.matches) ? g.matches : [];
      return '<div class="past-item">' +
        '<div class="past-item-head">' +
        '<span>' + esc(g.dateStr) + ' <span class="badge">' + esc(g.verdict || '') + '</span></span>' +
        '<span>' + ms.length + ' 场 · 已结算</span>' +
        '</div>' +
        ms.map(function (m) {
          var cls = m.result === 'red' ? 'status-red' : (m.result === 'black' ? 'status-black' : '');
          var txt = m.result === 'red' ? '红' : (m.result === 'black' ? '黑' : '待');
          return '<div class="past-match-row">' +
            '<span class="teams">' + esc(m.matchNo) + ' ' + esc(m.teams) + (m.pick ? ' · ' + esc(m.pick) : '') + '</span>' +
            '<span class="result">' + esc(m.score || '—') + '</span>' +
            '<span class="' + cls + '">' + txt + '</span>' +
            '</div>';
        }).join('') +
        '</div>';
    }).join('');
    syncLine(data.updated);
  }
  function fallbackPast() {
    if (window.JC_RECO_VIEW || pastBusy || typeof fetch !== 'function') return;
    pastBusy = true;
    fetch(PAST_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (d) { if (d) renderPast(d); })
      .catch(function () { /* file:// 或网络失败：保持页面里那份 */ })
      .then(function () { pastBusy = false; });
  }

  function tick() {
    var s = document.createElement('script');
    s.src = VIEW + '?t=' + Date.now();
    s.onload = function () {
      try { apply(); } catch (e) { /* 数据格式不对就保持原样 */ }
      if (s.parentNode) s.parentNode.removeChild(s);
    };
    s.onerror = function () {
      if (s.parentNode) s.parentNode.removeChild(s);
      try { fallbackPast(); } catch (e) { /* 忽略 */ }
    };
    document.body.appendChild(s);
  }

  /* 【验收钩子】和页面里 window.__jcXysp 同一套做法：给测试脚本一个立刻拉取的口子 */
  window.__jcRecoRefresh = tick;
  window.__jcRecoApplied = function () { return last; };
  window.__jcRecoSyncNow = syncLine;
  window.__pastRecFetch = fallbackPast;
  window.__pastRecRender = renderPast;

  /* 打开就先刷一次（不用干等 30 秒），之后每 30 秒一次 */
  try { tick(); } catch (e) { /* 忽略 */ }
  if (typeof setInterval === 'function') setInterval(tick, POLL_MS);
})();
/* ============================================================
   【播报数据 · 前端读取】用户 2026-10-17 给的参考写法：
     async function loadBroadcast() {
       const res = await fetch('./data/broadcast.json?t=' + Date.now());
       const data = await res.json();
       document.getElementById('marqueeText').textContent = data.map(i => i.text).join('  ★  ');
     }
   这里改成读页面内嵌的 <script type="application/json" id="broadcastData">：
     · 页面在 App 里是 file:// 打开，fetch 同目录文件会被 CORS 拦（所以不用 fetch）
     · 数据仍是"后台生成"的 —— 构建时（云端 GitHub Actions 那次构建）写进页面
     · 读不到 / 空数组 → 兜底文案「暂无近 7 天播报」（7 天是用户口径）
   渲染方式保持轨道里【两组一样的内容】→ 无缝循环；每组用「 ★ 」分隔条目。
   ============================================================ */
(function () {
  if (typeof document === 'undefined') return;
  function loadBroadcast() {
    var dataEl = document.getElementById('broadcastData');
    var stage = document.getElementById('marqueeText');
    if (!stage) return;
    var items = [];
    try {
      var raw = dataEl ? JSON.parse(dataEl.textContent || '[]') : [];
      items = (Array.isArray(raw) ? raw : [])
        .map(function (x) { return String((x && x.text) || '').trim(); })
        .filter(Boolean);
    } catch (e) { items = []; }
    var html;
    if (!items.length) {
      html = '<span class="m-mq-item">暂无近 7 天播报</span>';
    } else {
      var sep = '<span class="m-mq-item" aria-hidden="true">★</span>';
      html = items.map(function (t) { return '<span class="m-mq-item">' + t + '</span>'; }).join(sep);
    }
    var groups = stage.querySelectorAll('.m-mq-group');
    for (var i = 0; i < groups.length; i++) groups[i].innerHTML = html;
  }
  window.__jcLoadBroadcast = loadBroadcast;   /* 给验收脚本一个口子 */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadBroadcast);
  else loadBroadcast();
})();

/* ============================================================
   【一键桌面】用户 2026-10-17 给的按钮（<a role="button">，不用 button 标签）。
   ------------------------------------------------------------
   能力分三档，都不做成"死键"：
     ① 浏览器支持 beforeinstallprompt（Chrome/Edge 安卓等）→ 直接弹原生安装
     ② 微信内置浏览器 → 提示「右上角 ··· → 在浏览器打开」
     ③ iOS Safari → 提示「分享 → 添加到主屏幕」
   已经是桌面应用模式（display-mode: standalone / navigator.standalone）→ 不显示。
   ⚠️ 真正的 PWA 安装需要 service worker；本项目没有 SW（也不建议加：
      会和 30 秒实时刷新、CDN 缓存打架），所以这里做的是【入口 + 分平台引导】，
      不承诺"一定弹系统安装框"。
   ============================================================ */
(function () {
  if (typeof document === 'undefined') return;
  var btn = document.getElementById('installAppBtn');
  if (!btn) return;
  var standalone = false;
  try {
    standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (navigator.standalone === true);
  } catch (e) { standalone = false; }
  if (standalone) { btn.style.display = 'none'; return; }

  var deferred = null;
  var ua = navigator.userAgent || '';
  var isIOS = /iPhone|iPad|iPod/i.test(ua);
  var isWX = /MicroMessenger/i.test(ua);

  /* 【注册 Service Worker】用户 2026-10-17 给的写法（真 PWA 安装必需）。
     ⚠️ service-worker.js 是【纯透传、不缓存】的版本 —— 本站有 30 秒实时刷新，
        做缓存会把数字冻住（所以那个 SW 里 fetch 一律走网络）。
     ⚠️ file:// 下注册必然失败（浏览器规范不允许），catch 住即可，不影响 App 使用；
        真正生效的是 https 的线上站点。 */
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    try {
      navigator.serviceWorker.register('service-worker.js').catch(function () { /* 忽略 */ });
    } catch (e) { /* 忽略 */ }
  }

  function hint(txt) {
    var old = document.querySelector('.install-hint');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var d = document.createElement('div');
    d.className = 'install-hint';
    d.textContent = txt;
    document.body.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 4600);
  }
  function show() { btn.style.display = 'inline-flex'; }

  /* 【iOS / 微信也要有入口】这两个环境【永远不会】触发 beforeinstallprompt，
     只靠那个事件 = 按钮在 iPhone 上永远是隐藏的（等于白做）。
     所以：非 standalone 的 iOS / 微信里直接显示，点了给分平台引导。 */
  if (isIOS || isWX) show();

  window.addEventListener('beforeinstallprompt', function (e) {
    if (e && e.preventDefault) e.preventDefault();
    deferred = e;
    show();
  });
  window.addEventListener('appinstalled', function () {
    btn.style.display = 'none';
    hint('已添加到桌面 ✓');
  });

  btn.addEventListener('click', function (ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (deferred && deferred.prompt) {
      /* 用户给的参考实现：prompt() 之后等 userChoice，接受了就把按钮藏起来 */
      var d = deferred;
      deferred = null;
      d.prompt();
      if (d.userChoice && d.userChoice.then) {
        d.userChoice.then(function (choice) {
          if (choice && choice.outcome === 'accepted') {
            btn.style.display = 'none';
            hint('已添加到桌面 ✓');
          }
        }).catch(function () { /* 忽略 */ });
      }
      return;
    }
    if (isWX) hint('微信里不能直接添加：点右上角 ··· → 在浏览器打开 → 再点「一键桌面」');
    else if (isIOS) hint('Safari：点底部「分享」按钮 →「添加到主屏幕」');
    else hint('在这个浏览器的菜单里选「安装应用」或「添加到主屏幕」');
  });
  btn.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' || ev.key === ' ') { if (ev.preventDefault) ev.preventDefault(); btn.click(); }
  });
  /* 【圆形 📱 按钮】用户 2026-10-18：和文字按钮同一个动作 */
  var fab = document.getElementById('installFab');
  if (fab) {
    fab.addEventListener('click', function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      btn.click();
    });
    fab.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { if (ev.preventDefault) ev.preventDefault(); btn.click(); }
    });
  }
  show();   /* 入口始终给（能力不足时点击是引导，不是死键） */
})();

/* ============================================================
   【比赛卡片折叠】用户 2026-10-17 给的卡片设计：
   「1. 卡片头部（点击折叠/展开）」—— 点 .m-top 就在 .m-card 上切 .folded，
   由 CSS 隐藏 .m-body、并让 ▾ 转 -90°。
   ⚠️ 用事件委托（页面里卡片是静态渲染的，不用逐个绑）；
      点「看这场数据 ›」链接时不要顺手折叠（那个链接在 .m-body 里，
      而且 .m-top 之外，所以天然不冲突 —— 这里只认 closest('.m-top')）。 */
(function () {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  /* 用户 2026-10-17 给的折叠类名是 .collapsed —— 这里就用它（.folded 保留成别名，
     样式同时认两个，旧缓存页面也不会坏）。 */
  function toggleCard(card) {
    if (!card) return;
    var now = card.classList.toggle('collapsed');
    card.classList.toggle('folded', now);          /* 别名，样式也认 */
    /* 【为什么还要设内联样式】页面里有多条 .m-card.folded .m-body 规则互相压
       （display:block !important 会盖掉 display:none），实测类名加了却没真正收起。
       所以折叠状态【由 JS 直接写内联 display】—— 内联优先级最高，CSS 怎么改都不会失灵；
       同时保留 max-height 过渡（CSS 那边有 .collapsed/.folded 的 max-height:0 时仍会动画）。 */
    /* 【为什么用 inline !important】页面里有「.m-card.folded .m-body { display:block !important }」
       这类规则，普通内联 display:none 会被【作者 !important】压过（CSS 规范：
       作者 !important > 内联普通声明）。所以折叠状态用内联 !important 强制写死 ——
       只有它压得住，别的窗口再怎么改 CSS 也不会让折叠失灵。
       ⚠️ 这段代码在页面模板字符串里面：注释里【不能出现反引号】，否则会截断模板。 */
    var body = card.querySelector('.m-body');
    if (body) {
      if (now) body.style.setProperty('display', 'none', 'important');
      else body.style.removeProperty('display');
    }
    var top = card.querySelector('.m-top');
    if (top) top.setAttribute('aria-expanded', now ? 'false' : 'true');
    /* 【箭头换字符，不依赖 transform】用户批准的小修：
       ▾ 的 rotate 被页面里别的 transform 规则压住过（加 !important 也没用），
       所以折叠时直接把字符换成 ▸ —— 一样清楚，且永远不会被 CSS 吃掉。 */
    var fold = card.querySelector('.m-fold');
    if (fold) fold.textContent = now ? '▸' : '▾';
  }
  /* 兼容用户参考实现里的 toggleMatch(cardId) 全局函数 */
  window.toggleMatch = function (id) { toggleCard(document.getElementById(id)); };

  document.addEventListener('click', function (e) {
    var t = e.target;
    var top = t && t.closest ? t.closest('.m-top') : null;
    if (!top) return;
    var card = top.closest('.m-card');
    if (!card) return;
    /* 头部里如果有真正的交互控件（链接/按钮/输入），让它自己处理 */
    if (t.closest('a[href], button, input, select')) return;
    toggleCard(card);
  });
})();
</script>
${CHAT_HTML}
${CHAT_JS}
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

` +
  (() => {
    let raw = '';
    try {
      const f = path.join(ROOT, 'jc-scores.js');
      if (fs.existsSync(f)) {
        const src = fs.readFileSync(f, 'utf8');
        const m = src.match(/const JC_SCORES = ([\s\S]*);\s*$/);
        raw = m ? m[1] : 'null';
      }
    } catch (e) { raw = 'null'; }
    return '<script>window.JC_SCORES = ' + raw + ';</script>';
  })() + `
<script>
(function(){
  if(location.protocol==='file:') return;
  var busy=false;
  function update(){
    if(busy||document.hidden) return; busy=true;
    var url=new URL(location.href);url.searchParams.set('t',String(Date.now()));
    fetch(url.href,{cache:'no-store'}).then(function(r){return r.ok?r.text():'';}).then(function(text){
      var next=new DOMParser().parseFromString(text,'text/html').getElementById('communityLiveBody');
      var current=document.getElementById('communityLiveBody');
      if(!next||!current||next.innerHTML===current.innerHTML)return;
      var open={};current.querySelectorAll('details[open]').forEach(function(d){var t=d.querySelector('.cx-t');if(t)open[t.textContent]=true;});
      next.querySelectorAll('script').forEach(function(s){s.remove();});current.innerHTML=next.innerHTML;
      current.querySelectorAll('details').forEach(function(d){var t=d.querySelector('.cx-t');if(t&&open[t.textContent])d.open=true;});
    }).catch(function(){}).then(function(){busy=false;});
  }
  window.__communityRefresh=update;setInterval(update,90000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)update();});
})();
</script>

<script>
(function(){
  if(location.protocol==='file:')return;
  var busy=false;
  function update(){
    if(busy||document.hidden)return Promise.resolve(false);busy=true;
    var url=new URL(location.href);url.searchParams.set('t',String(Date.now()));
    return fetch(url.href,{cache:'no-store'}).then(function(r){if(!r.ok)throw Error('HTTP '+r.status);return r.text();}).then(function(text){
      var doc=new DOMParser().parseFromString(text,'text/html'),ids=['sec-upcoming','sec-live','sec-finished'];
      if(!ids.every(function(id){return doc.getElementById(id)&&document.getElementById(id);}))return false;
      var expanded={};document.querySelectorAll('.m-card[data-match-id]:not(.collapsed)').forEach(function(c){expanded[c.getAttribute('data-match-id')]=true;});
      ids.forEach(function(id){var current=document.getElementById(id),next=doc.getElementById(id);next.querySelectorAll('script').forEach(function(e){e.remove();});if(current.innerHTML!==next.innerHTML)current.innerHTML=next.innerHTML;});
      document.querySelectorAll('.m-card[data-match-id]').forEach(function(c){if(!expanded[c.getAttribute('data-match-id')])return;c.classList.remove('collapsed','folded');var body=c.querySelector('.m-body');if(body)body.style.removeProperty('display');var top=c.querySelector('.m-top');if(top)top.setAttribute('aria-expanded','true');var arrow=c.querySelector('.m-fold');if(arrow)arrow.textContent='▾';});
      ['upcoming','live','finished'].forEach(function(kind){var sel='.stat a[href="#sec-'+kind+'"] b',next=doc.querySelector(sel),current=document.querySelector(sel);if(next&&current)current.textContent=next.textContent;});
      return true;
    }).catch(function(){return false;}).finally(function(){busy=false;});
  }
  window.__refreshFootballMatches=update;setInterval(update,30000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)update();});
})();
</script>
<script>
${fs.readFileSync(path.join(SCRIPT_DIR, 'visitor-counter.js'), 'utf8')}
</script>

<script>(function(){function expire(){document.querySelectorAll('.pair-current [data-pair-deadline]').forEach(function(p){var t=Number(p.getAttribute('data-pair-deadline'));if(t&&Date.now()>=t){var c=p.closest('.pair-current');if(c)c.textContent='本组已有比赛开赛，不能再整组选择，请等待新的2串1组合。';}});}expire();setInterval(expire,1000);document.addEventListener('visibilitychange',expire);})();</script>
</body>
</html>`;

/* ============================================================
   留痕断言（用户硬性要求）：页面上不能看出「数据是从哪来的」
     ① removeSourceWords —— 把可见文本里的来源字样换成中性说法
        （内嵌的只读模块吐出来的字也在这一步收拾，语义不变）
     ② assertNoSourceTrace —— 再扫一遍；命中 → 打印命中内容 → exit 1
   两条都来自共用模块 source-guard.mjs。
   ============================================================ */
const safeHtml = removeSourceWords(html);
assertNoSourceTrace(safeHtml, '足球推荐.html');

/* ============================================================
   【第二层防护 · 构建时硬断言】写文件之前先过这一关
   ------------------------------------------------------------
   事故（2026-10-17）：注入样式用 String.replace(收尾标签, CSS + 收尾标签) 只替换
   【第一处】；页面 HTML 注释里也字面写着一个收尾标签 → 整段 CSS 进了注释 → 全废。
   现在本页产出【写盘之前】自检，任一不过 → exit 1（一个字节都不写）：
     ① head 开标签正好 1 个
     ② head 收尾标签正好 1 个（≠1 → 打印次数 + 行号/偏移）
     ③ 唯一槽位标记 __HEAD_SLOT__ 正好 1 个，且落在 head 区间内
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
function assertHeadOnce(finalHtml, label) {
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
  if (bad.length) {
    console.error(`\n❌ ${label}：head 结构自检失败（${bad.length} 项），产物【没有写出】`);
    bad.forEach((b, i) => console.error(`   ${i + 1}) ${b}`));
    console.error('   常见原因：页面别处（尤其是 HTML 注释里）又写了字面的 head 开/收尾标签。\n');
    process.exit(1);
  }
  console.log(`   ✅ head 自检：${T_HEAD_OPEN}=1 · ${T_HEAD_CLOSE}=1 · 槽位=1（在 head 内）`);
}

const finalHtml = perfify(safeHtml);
assertHeadOnce(finalHtml, '足球推荐.html');
fs.writeFileSync(OUT, finalHtml, 'utf8');
saveConfidentPairs();

/* 【30 秒实时刷新 · 数据文件】和页面写在同一个目录（本机 = 项目根目录）。
   内容 = 上面那两块的【同一套渲染结果】+ 存档时间戳：
     · 不在页面里写第二套渲染逻辑（避免"两处渲染慢慢长歪"）
     · updated 没变 → 前端不换 DOM，就不会白闪
   ⚠️ 上传到网页那份要跟着页面一起发（cloud/out/ 里），否则线上这次刷新拿不到文件；
      拿不到时前端【什么都不做】，页面照旧是构建时那份数据。 */
const RECO_VIEW_OUT = path.join(ROOT, 'jc-reco-view.js');
fs.writeFileSync(RECO_VIEW_OUT, 'window.JC_RECO_VIEW = ' + JSON.stringify({
  updated: RECO_STAMP,
  layout: "pair-only-v2",
  /* ①推荐单战绩条（⚠️ 含「推荐单」标签 —— 换 innerHTML 用整条，别丢标签） */
  stat: recoStatBarHtml(),
  parlay: confidentPairHtml(),
  /* ③推荐历史结果整块（红黑 / 命中率 / 还有几组没打完 / 往期列表 / 时间行） */
  arch: REC_ARCH_INNER,
  /* ②推荐（在售）那一块：条数文案 + 每场的行 —— 用户 2026-10-18 反馈这块从来没刷过 */
  rec: { count: REC_COUNT_TEXT, html: REC_ROWS_INNER },
  /* 【顶部小喇叭】两组条目共用同一份内容（横向滚动的两份必须一样） */
  mq: MQ_ITEMS_HTML
}) + ';\n', 'utf8');

/* ============================================================
   【data/recommend.json】往期推荐串 · 前端拉取版（用户 2026-10-17 给的方案）
   ------------------------------------------------------------
   用户原话：给了一段 fetchPastRecommend()，每 60 秒拉 ./data/recommend.json。
   所以这里按他给的字段结构生成这份 JSON：
     { updated, red, black, rate, history: [ { dateStr, finishTime,
         matches: [ { matchNo, teams, pick, score, result: 'red'|'black' } ] } ] }
   · red/black/rate = 和顶部战绩条【同一个口径】（单场判定 REC_STAT），两处数字永远一致
   · history = 已结算批次（窗口内），finishTime 用北京时间解析成毫秒，前端按它倒序
   · 写两个地方：项目根 data/（本机/App）+ cloud/out/data/（线上站点根 /data/）
   ⚠️ 本机 file:// 打开时 fetch 会被 CORS 拦 → 页面保留构建时烘好的那份，不空白、不报错
   ============================================================ */
function bjMs(s) {
  const t = Date.parse(String(s || '').replace(/[-]/g, '/'));
  return isFinite(t) ? t : 0;
}
const RECOMMEND_JSON = {
  updated: RECO_STAMP || '',
  red: REC_STAT ? REC_STAT.red : 0,
  black: REC_STAT ? REC_STAT.black : 0,
  rate: (REC_STAT && REC_STAT.rate != null) ? String(REC_STAT.rate) + '%' : '—',
  /* 还有几组没打完（页面兜底渲染拿它更新「还有 N 组没打完」那一行） */
  unfinished: REC_ARCH_PENDING || 0,
  history: (REC_ROWS_ARCHIVE || []).map((b) => {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    return {
      dateStr: b.at || '',
      finishTime: bjMs(b.at),
      verdict: b.verdict || '',
      matches: rows.map((r) => ({
        matchNo: r.code || '',
        teams: `${r.home || ''} vs ${r.away || ''}`,
        pick: r.label || '',
        score: r.score || '—',
        result: r.hit === true ? 'red' : (r.hit === false ? 'black' : 'pending'),
        /* —— 「扁平口径」也够用的字段（用户 2026-10-17：分组/扁平两种结构都兼容）—— */
        confidence: (typeof r.conf === 'number' ? r.conf : null),
        status: (r.hit === true || r.hit === false) ? 'finished' : 'pending',
        finishTime: bjMs(b.at),
        league: r.league || '',
        odds: (typeof r.odds === 'number' ? r.odds : null),
        time: r.time || ''
      }))
    };
  })
};
for (const dir of [path.join(ROOT, 'data'), path.join(ROOT, 'cloud', 'out', 'data')]) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'recommend.json'), JSON.stringify(RECOMMEND_JSON, null, 1), 'utf8');
  } catch (e) {
    console.log(`  ⚠️ 写 recommend.json 失败（${dir}）：${e.message}`);
  }
}
console.log(`   📄 data/recommend.json：${RECOMMEND_JSON.history.length} 批 · 红 ${RECOMMEND_JSON.red} 黑 ${RECOMMEND_JSON.black} · ${RECOMMEND_JSON.rate}`);

console.log('✅ 已生成：' + OUT);
console.log(`   大小：${(Buffer.byteLength(safeHtml, 'utf8') / 1024).toFixed(1)} KB`);
console.log(`   三卡片：未开赛 ${stat.upcoming} · 进行中 ${stat.live} · 已完场 ${stat.finished}`);
console.log(`   已完场构成：本次在售完场 ${stat.finishedToday} 场 + 历史归档 ${stat.history} 场`);
console.log(`   已完场分区卡片数：${MATCHES.filter((m) => m.kind === 'finished').length}`);
/* 【规则一两行】24 小时窗口挡掉多少、窗口内还剩多少 —— 验收直接看这两行 */
console.log(`   【规则一】已完场只留比赛结束后 ${FIN_KEEP_HOURS} 小时：` +
  `窗口内 ${MATCHES.filter((m) => m.kind === 'finished').length} 场` +
  ` · 超时移出 ${FIN_EXPIRED} 场`);
console.log(`   【规则二】在售只留体彩竞彩对外开售的：` +
  (JC.filter && JC.filter.officialGate === false
    ? '本次没拿到官方开售名单 → 未过滤（兜底，照原列表出页面）'
    : `官方过滤生效 · 非官方开售挡掉 ${(JC.filter && JC.filter.droppedNotOnSale) || 0} 场`));
console.log(`   头行「体彩竞彩在售 ${IN_SALE} 场」· 来源：` +
  (OFFICIAL === null
    ? `本地竞彩数据兜底 upcoming+live=${IN_SALE}（没读到 jc-official.js）`
    : `体彩官网 jc-official.js inSale=${IN_SALE} · 官方更新 ${(JC_OFFICIAL && JC_OFFICIAL.officialUpdate) || '(无)'}`));
if (stat.settled) console.log(`   完场战绩：红 ${stat.hit} / 黑 ${stat.miss}  命中率 ${stat.rate}%`);
console.log(`   数据来源：jc-data.js（体彩竞彩在售）+ jc-history.js（已完场累积，显示时按 24 小时窗口筛）`);
console.log(`   模拟计算：${CALC_ROWS.length} 场可试算 · 过关方式最多 ${passLabel(CALC_MAX_N)}` +
  `（单关 ~ ${passLabel(CALC_MAX_N)}）· 赔率来源：${SP_SRC_LOG}`);
console.log(`   推荐串（在售 · 信心 ≥${REC_MIN}%）：符合 ${REC_ROWS.length} 场` +
  (REC_ROWS.length ? ` → ${REC_ROWS.map((r) => `${r.code} ${r.label} ${r.conf}%`).join(' | ')}` : '（无）'));
/* 【推荐串 · 往期】只列已出结果的（红/黑），未打完的整批不显示 */
console.log(`   往期推荐串（近 ${REC_ARCH_HOURS} 小时 · 只列已出结果）：${REC_ROWS_ARCHIVE.length} 批` +
  (REC_ROWS_ARCHIVE.length
    ? ` → ${REC_ROWS_ARCHIVE.map((b) => `${b.at} ${b.verdict}`).join(' | ')}`
    : ' → 未出结果的整批不显示') +
  (REC_ARCH_PENDING ? ` · 还有 ${REC_ARCH_PENDING} 组没打完（不列）` : ''));
/* 【顶部小喇叭】横向滚动的实际文案（数字全部是上面算出来的） */
console.log(`   顶部小喇叭（横向滚动）：${MQ_TEXT} · 一轮 ${MQ_DUR}s`);
console.log(`   其中信心 <${REC_MIN}% 被排除 ${REC_LOW.length} 场` +
  (REC_LOW.length ? ` → ${REC_LOW.map((r) => `${r.code} ${r.conf}%`).join(' | ')}` : '（无）') +
  ` · 在售里有推荐数据的共 ${REC_ALL.length} 场`);
console.log(`   （试算器只用官方 SP 原值；抓不到时不显示数字，绝不估算；不写任何本地存储）`);

/* 【晒票】自测输出：位置 + 条数（验收那一栏直接看这几行）
   ⚠️ 位置判断【不能】直接搜 "<div class=\"guard\">" 或 "免责声明" ——
      内联 JS 里有 `cards += '<div class="guard">'` 这种字符串、
      JS 注释里也有"免责声明"字样，先命中它们，位置就判错了（实测踩过）。
      所以这里锚定【HTML 里唯一的那几个元素 id / class】：
        jcCalc（模拟计算）→ jcXysp（晒票）→ note-title（免责声明那块的标题）
      再用 .guard 的【最后一个】出现位置（= 免责声明那个 guard）做交叉验证。 */
{
  const n = JC_XYSP.items.length;
  const body = html.slice(html.indexOf('<body>'));
  const iCalc = body.indexOf('id="jcCalc"');
  const iXysp = body.indexOf('id="jcXysp"');
  const iNote = body.indexOf('<div class="note-title"');
  const guardAt = [];
  for (let k = body.indexOf('<div class="guard">'); k >= 0; k = body.indexOf('<div class="guard">', k + 1)) guardAt.push(k);
  const iGuardDoc = guardAt.length ? guardAt[guardAt.length - 1] : -1;   /* 免责声明那个 */
  const ordered = (iCalc >= 0 && iXysp > iCalc && iNote > iXysp);
  console.log(`   晒票位置：【模拟计算】下面、免责声明上面`);
  console.log(`      body 内偏移：jcCalc=${iCalc} → jcXysp=${iXysp} → 免责声明=${iNote}` +
    `（"<div class=\\"guard\\">" 共 ${guardAt.length} 处）`);
  console.log(`   晒票位置检查：${ordered ? '✅ 正好插在【模拟计算】和【免责声明】之间' : '❌ 顺序不对'}`);
  console.log(`      （有序性：jcCalc < jcXysp = ${iXysp > iCalc} · jcXysp < 免责声明 = ${iNote > iXysp}）`);
  console.log(`   晒票数据：${n} 张竞彩实票` +
    (n ? '' : ' · ⚠️ 没有 xysp-jc-data.js（显示「暂无」）')   /* __NO_UPDATED__ */);
  /* 【新鲜度标注自测】两处小字分别读的哪个文件的哪个字段 + 算出来长什么样 */
  console.log(`   新鲜度标注：票面 ${TICKETS_STAMP || '(无)'} → ` +
    (TICKETS_STAMP_HTML ? `票面更新于 ${agoText(stampMs(TICKETS_STAMP))}` : '不显示') +
    ` · 在售 ${INSALE_STAMP || '(无)'} → ` +
    (INSALE_STAMP_HTML ? `数据更新于 ${agoText(stampMs(INSALE_STAMP))}` : '不显示'));
}

