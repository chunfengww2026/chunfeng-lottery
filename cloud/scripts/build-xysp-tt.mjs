/* ============================================================
   build-xysp-tt.mjs —— 抓【今日头条】的晒票内容
   ------------------------------------------------------------
   产出【两个】缓存文件（同一个源、同一套逻辑，只换关键词）：
     · xysp-tt-data.js  → 数字彩晒票（双色球/大乐透/3D…）
                          build-xysp.mjs 合并进 xysp-data.js 的 games.tt
                          → 只读分享页「晒票」栏
     · xysp-jc-data.js  → 【竞彩晒票】（足球竞彩实票）
                          export-football.mjs 直接读它
                          → 竞彩页 足球推荐.html「晒票」区块

   为什么要有它（用户原话，第一次）：
     「把【今日头条】的晒票内容抓下来，并入 只读分享页现有的「晒票」栏」
   为什么要加竞彩那一路（用户原话，第二次）：
     「竞赛页面 也做一个晒票 你去全网抓取晒票的 和抓彩票的程序编码一样」
     ⇒ "和抓彩票的程序编码一样" = 复用这一整套（抓取/解析/去重/退避/防盗链处理），
       只换关键词 + 换输出文件 + 换保留窗口。所以这里是【分类驱动】的：
       CATEGORIES 里加一项就多一路，抓取主流程一行不改。

   它【不直接改】xysp-data.js —— 那是 build-xysp.mjs 的文件。
   分工（谁写哪个文件写死，避免两个进程互相覆盖）：
     · 本文件          → 只写 xysp-tt-data.js / xysp-jc-data.js
     · build-xysp.mjs  → 唯一写 xysp-data.js 的人；
                         它跑的时候会 import 本文件里的 mergeTt()，
                         把 xysp-tt-data.js 合进 xysp-data.js 的 games.tt
   ⇒ 两个脚本可以在同一个任务里先后跑，也可以只跑其中一个，都不会把对方写坏。

   ── 抓什么（实测 2026-10-16，服务端渲染，用 iPhone UA）
     正式入口 = https://so.toutiao.com/search/?dvpf=pc&keyword=<关键词>
       → HTTP 200 · ~510 KB · 标题 + 图片都在 HTML 里，不需要 __INITIAL_STATE__

     ⚠️ 为什么不用 https://www.toutiao.com/search/?keyword=…（本机实测也是 200）
        本机（中国 IP）直连 www 就是 200 + 完整 SSR 页；
        但【云端 GitHub runner（美国 IP）】取 www 会拿到
          HTTP 302 → location: https://so.toutiao.com/search/?dvpf=pc&keyword=…
        用 Node 的 fetch 时 redirect 默认就是 follow，理论上是能跟过去的，
        但为了【两边走同一条路、不留任何差异】，这里直接写最终的
        so.toutiao.com + dvpf=pc 地址，并且显式写 redirect: 'follow'。
        实测：本机 so+dvpf=pc 和 www 拿到的 HTML 字节数只差 3 字节
        （521401 vs 521404），解析结果完全一样（都是 15 条）。

     ⚠️ 别踩的坑：so.toutiao.com/search/?keyword=… 【不带 dvpf=pc】
        返回的是另一套渲染（1.39 MB、0 个卡片数据块），解析出来 0 条。
        m.toutiao.com / 不带 dvpf 的 so 同样 0 个卡片块（实测）。

   ── 标题 / 图从哪来（实测的真实结构）
     每一条搜索结果是一个
       <script data-druid-card-data-id="…" type="application/json" nonce='…-argus'>
         {…JSON…}
       </script>
     块（⚠️ "-argus" 是 nonce 的尾巴，【不是】id —— 拿 "-argus" 当 id 去切
       会一条都切不到，实测踩过）；里面 JSON 被反斜杠转义，形如：
       "title":{"marked":"…\u003cem\u003e晒票\u003c/em\u003e…","text":"真正的标题"}
       "image_url":"…~tplv-…:450:294.jpg?_iz=…&x-expires=…&x-signature=…"   ← 封面缩略图
       "large_image_url":"…~tplv-…:960:0.jpg?_iz=…&x-expires=…&x-signature=…" ← 封面大图
       "image_list":[{"url":"…:450:294.jpg?…x-signature=…","origin_width":…}, …]
       "title":"3D排列3第26272期晒票，单式、倍投各有选法…"                  ← 标题（纯字符串）
       "group_id":"7696868137202876982"  "datetime":"2026-10-15 20:19:22"
       "media_name":"优雅奶酪6hWlg9"
     ⇒ 解析方式：先按 id 以 -argus 结尾的 <script> 切块，
       再对每块 decodeJSONEscapes()（解 \u003c / \u0026 / \" 等）+ JSON.parse。
       拿不到 JSON 就当这一块没有 —— 绝不抛异常。

   ── ⚠️ 图片防盗链 / 尺寸（实测结论，别再改回去）
     · 只认【带 x-signature 签名的】~tplv 图（p*-sign.toutiaoimg.com 等）。
       这种图【没有防盗链】：不带 Referer / www.toutiao.com / github.io 三种
       都是 HTTP 200 + image/jpeg + 字节数完全相同（实测 63632 B）。
     · ❌ 搜索页里那批 ~cs.jpeg 聚合图（sf3-ttcdn-tos.pstatp.com / byteimg）
       是【验签】的，直接取一律 HTTP 403 + application/json。
       ⇒ 一律不采集（这是"图很多但一张都显示不出来"的坑，已经踩过）。
     · ❌ 绝不给头条图追加 ?imageMogr2/thumbnail/360x ——
       头条的 URL 本来就带 query，再拼一个 '?' 会变成第二个 '?'，
       签名失效 → HTTP 403（实测）。缩略图靠头条自带的 :450:294 变体，
       它只有 21 KB（原图 63 KB），已经够小，不需要我们再缩。
       ⇒ 所以本文件里的 thumb 一定是【头条自己给的 450 宽变体】，
          build-xysp.mjs 里的 thumbOf() 也已经加了保护：不给头条图拼参数。

   ── 保留 / 去重 / 上限（跟一起彩那套规则一致）
     · KEEP_HOURS = 72（at 早于 72 小时前的丢）
     · 按 img 去重（同一个 img 只留一条，保留【最早】的 at，
       字段用最新的 —— 跟 build-xysp.mjs 的规则完全一样）
     · MAX_TT = 60（头条单独设上限，不挤占 8 个彩种的 40 条）
     · 抓不到 → 【不覆盖】旧文件 + 退出码 10（调用方别同步）
     · 连续 6 轮全失败 → 停 120 分钟（退避状态写 _xysp-tt-backoff.json，
       跟一起彩的 _xysp-backoff.json 【分开】，互不影响）
     · 两个关键词页之间间隔 >= 1.2s

   0 token：这个文件不请求任何 AI、不读任何 token、不涉及任何密钥。

   退出码：
     0  = 解析到条目并写入了新的 xysp-tt-data.js
     10 = 本轮跳过（退避中 / 一条都没解析到）—— 保留上一次的 xysp-tt-data.js
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(ROOT, '_xysp-tt.log');
const STATE = path.join(ROOT, '_xysp-tt-backoff.json');

export const TT_KEY = 'tt';
export const TT_NAME = '头条晒票';
export const TT_KEEP_HOURS = 72;
export const TT_MAX = 60;
const GAP_MS = 1200;
const FAIL_PAUSE_AFTER = 6;
const PAUSE_MINUTES = 120;

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/* 搜索入口。至少「晒票」；再加两个按彩种的（实测都能返回结果）。
   ⚠️ 一律用 so.toutiao.com + dvpf=pc —— 本机和云端（美国 IP）走同一条路，
      见文件头的「为什么不用 www」。
   ⚠️ 只加【页面真的能返回结果】的关键词，加多了只是白等 1.2s。 */
const BASE = 'https://so.toutiao.com/search/?dvpf=pc&keyword=';

/* ============================================================
   【竞彩晒票】第二个分类（用户新需求）
   ------------------------------------------------------------
   用户原话：「竞赛页面 也做一个晒票 你去全网抓取晒票的 和抓彩票的程序编码一样」
   ⇒ 就是【同一套抓取/解析/去重/退避逻辑】，只换关键词 + 换输出文件 + 换保留窗口。
   页面：竞彩页 足球推荐.html（export-football.mjs 渲染）
     · 位置：模拟计算区块下面、免责声明上面
     · 形态：和分享页「晒票」栏一致（<details> 可折叠 + 图片网格 + 点图放大）
   ============================================================ */
export const JC_KEY = 'jc';
export const JC_NAME = '竞彩晒票';
export const JC_DATA_FILE = 'xysp-jc-data.js';
export const JC_MAX = 60;

/* ⚠️ 为什么竞彩用【30 天】而不是 72 小时（实测结论，别照抄 tt 的 72h）
   ------------------------------------------------------------
   实测（2026-10-16）：5 个竞彩关键词抓下来一共只有 26 张图 / 10 个帖子，
   而且【没有一个帖子在 72 小时内】：
       最近的  2026-10-16 04:39（胜负彩 142 期）
       其次    2026-10-15 13:03
       再往前  2026-10-09 / 10-08 / 08-28
       更早    2022-12（世界杯那批「高手晒单」）
   注意 at 用的是【抓取时间】不是源站发布时间，所以条目一抓进来就"新鲜"；
   但如果改成按源站发布时间严格卡 72 小时 → 这一栏【永远是空的】。
   竞彩实票（足球竞彩）本来就不是每天有人晒 —— 所以按用户对
   "更新慢的彩种不卡 24 小时" 的先例，这里放宽到 30 天，只受 JC_MAX 和
   去重约束。想改回 72 小时只需改这一个数（JC_KEEP_HOURS）。 */
export const JC_KEEP_HOURS = 24 * 30;

/* ---- 分类定义：每个分类 = 一批关键词 + 一个输出文件 + 一套保留规则 ----
   ⚠️ 每个关键词页面之间固定等 GAP_MS（>=1.2s），分类之间也等。 */
const CATEGORIES = [
  {
    key: TT_KEY,
    name: TT_NAME,
    file: 'xysp-tt-data.js',
    constName: 'XYSP_TT_DATA',
    keepHours: TT_KEEP_HOURS,
    max: TT_MAX,
    src: 'tt',
    gameOf: (title) => gameOfTitle(title),      /* 数字彩：标题里认彩种名 */
    searches: [
      { kw: '晒票' },
      { kw: '双色球 晒票' },
      { kw: '大乐透 晒票' }
    ]
  },
  {
    key: JC_KEY,
    name: JC_NAME,
    file: JC_DATA_FILE,
    constName: 'XYSP_JC_DATA',
    keepHours: JC_KEEP_HOURS,
    max: JC_MAX,
    src: 'tt',                                  /* 还是头条这个源，只换关键词 */
    gameOf: (title) => gameOfJc(title),
    /* 关键词实测结果（2026-10-16，默认排序）：
        竞彩晒单      12 条/4 帖（最多）   胜负彩 晒票    6 条/4 帖
        竞彩 晒票      5 条/4 帖            竞彩 实单      3 条/3 帖
        竞彩足球 晒票   3 条/2 帖            竞彩 单子      3 条/3 帖
        足球 实单 晒票   3 条/3 帖            竞彩 二串一     3 条/1 帖
        足球 彩票 实票   1 条/1 帖
        ❌ 0 条（已剔除，不再浪费请求）：「竞彩 3串1」「足彩 晒票」
       加 sort_type=2（按时间）实测【没用】：返回的是同一批 2022 欧冠旧帖。
       ⇒ 只留下面 5 个覆盖面重叠度最低、实测有结果的词。 */
    searches: [
      { kw: '竞彩晒单' },
      { kw: '竞彩 晒票' },
      { kw: '胜负彩 晒票' },
      { kw: '竞彩 实单' },
      { kw: '竞彩足球 晒票' }
    ]
  }
];
export function getCategories() { return CATEGORIES; }
export function catByKey(k) { return CATEGORIES.find((c) => c.key === k) || null; }

/* 竞彩玩法的具体名称（标题里认得出就用它，认不出就是「竞彩」） */
const JC_HINTS = [
  { re: /胜负彩|14 场|十四场/, name: '胜负彩' },
  { re: /半全场/,              name: '半全场' },
  { re: /比分/,                name: '比分'   },
  { re: /进球数|总进球/,       name: '进球数' },
  { re: /二串一|2 ?串 ?1/,     name: '2串1'  },
  { re: /三串一|3 ?串 ?1/,     name: '3串1'  },
  { re: /四串一|4 ?串 ?1/,     name: '4串1'  },
  { re: /过关|串关/,           name: '过关'   },
  { re: /胜平负|让球/,         name: '胜平负' }
];
function gameOfJc(title) {
  const t = String(title || '');
  for (const g of JC_HINTS) if (g.re.test(t)) return g.name;
  return '竞彩';
}

/* ============================================================
   【头条晒票 → 分发到各彩种】（用户追加要求）
   ------------------------------------------------------------
   用户原话：「头条晒票的内容分发到各个对应的彩种地方」
   （配图圈的是分享页上「头条晒票」那个筛选标签）

   ⚠️ 彩种名有互相包含的陷阱，匹配顺序和边界都要小心（逐条实测过）：
     · 「大乐透」里【不含】乐透单独词 → 只用 /大乐透/ 就够
     · 「七星彩」里含"星彩"，但「七星彩」不是「七乐彩」的子串 → 安全
     · 「排列3」和「排列5」互不包含；但「排列3/5」这种写法两个都不匹配
       → 专门加 /排列\s*3\s*[/、,，]?\s*5/ 之类的组合规则（见下面 MULTI）
     · 「福彩3D」的 3D 要匹配 3d / 3D / 福彩3D / 3D彩，但【不能】被
       「2026273期」这种数字串误伤 → 用 /(?<![0-9a-z])3\s*d(?![0-9a-z])/i
   ============================================================ */
const GAME_MATCHERS = [
  { key: 'ssq',  re: /双色球/s },
  { key: 'dlt',  re: /大乐透/s },
  { key: 'fc3d', re: /福彩\s*3\s*[dD]|(?<![0-9a-z])3\s*[dD](?![0-9a-z])/i },
  { key: 'kl8',  re: /快乐\s*8|快乐八/i },
  { key: 'pl3',  re: /排列\s*3|排列三|排\s*3(?![0-9])/i },
  { key: 'pl5',  re: /排列\s*5|排列五|排\s*5(?![0-9])/i },
  { key: 'qxc',  re: /七星彩/ },
  { key: 'qlc',  re: /七乐彩/ }
];
/* 「排列3/5」「3d、排列3」这种一个标题里点多个彩种的写法：
   下面这几条正则专门把组合形式一次点亮，避免只认出其中一个。 */
const MULTI_HINTS = [
  { re: /排列\s*3\s*[\/、,，]\s*5|排列\s*3[、,，]?\s*和\s*排列\s*5/i, keys: ['pl3', 'pl5'] },
  { re: /3\s*[dD]\s*[、,，\/]\s*排列\s*3/i, keys: ['fc3d', 'pl3'] }
];

/**
 * 从标题里认出【所有】相关彩种（可能多个）。
 * @param {string} title
 * @returns {string[]} 彩种 key 数组（去重，顺序 = GAME_MATCHERS 的顺序）；认不出返回 []
 */
export function gamesOfTitle(title) {
  const t = String(title || '');
  if (!t) return [];
  const out = [];
  const add = (k) => { if (k && out.indexOf(k) < 0) out.push(k); };
  for (const g of GAME_MATCHERS) if (g.re.test(t)) add(g.key);
  for (const m of MULTI_HINTS) if (m.re.test(t)) m.keys.forEach(add);
  /* 按 GAME_MATCHERS 的固定顺序输出，页面上的顺序才稳定 */
  return GAME_MATCHERS.map((g) => g.key).filter((k) => out.indexOf(k) >= 0);
}

/* ============================================================
   【走势图分析图】—— 实测结论：头条上【抓不到】
   ------------------------------------------------------------
   用户原话：「晒票里面也可以抓取对应的走势图分析的图片在里面」
   实测（2026-10-16，12 个关键词全试过）：
     · 「双色球 走势图」「大乐透 走势图」「3D 走势图」「排列3 走势图」
       「快乐8 走势图」「七乐彩 走势图」「七星彩 走势图」
       「双色球 走势分析」「大乐透 走势分析」「福彩3D 走势图」
       「彩票 走势图」「大乐透 走势图分析」
       ⇒ 全部解析出 0 条（这些页面的卡片 template_key 是 "67-toutiao_web"，
         里面【没有】large_image_url / image_list —— 不是解析问题）
     · 那种卡片给的是【站外走势图工具站的链接】（78500.cn / 17500.cn /
       乐彩网 …），只有站点角标 favicon：
         取回来 789 B / 2132 B 的 16×16 小图标，不是走势图本身
     · 页面里唯一像"图集"的块（template_key "26-image"）里是 ~cs.jpeg，
       实测 HTTP 400 {"code":2004,"error":"fail to handle req"}，取不到
   结论：头条搜索页【不提供】可外链的走势图图片。
   ⇒ 所以这一分类【没有加】。加了只能放 favicon 或者外站链接，那是在骗用户。
      如果以后要走势图，得换数据源（比如自己按开奖数据画 canvas，
      或者找允许外链的走势图图床），那已经不属于"复用头条抓取器"的范围了。
   ============================================================ */

const log = (m) => {
  const line = `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${m}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n', 'utf8'); } catch (e) { /* 忽略 */ }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch (e) { return { failStreak: 0, pausedUntil: 0, lastRun: '', runs: 0, skips: 0, ok: 0 }; }
}
function writeState(s) { try { fs.writeFileSync(STATE, JSON.stringify(s, null, 1), 'utf8'); } catch (e) {} }

function stamp(d) {
  const t = d || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ` +
    `${p(t.getHours())}:${p(t.getMinutes())}`;
}

/* ---------- 小工具 ---------- */

/** 解 JSON 字符串里的 \uXXXX 转义（头条把 <em> 之类写成了 \u003c…）。
    ⚠️ 【只】解 \uXXXX，解完直接交给 JSON.parse。
       绝不要在这里手动解 \" / \\ —— 实测那样会把 JSON 结构本身弄坏
       （\" 是 JSON 的合法转义，JSON.parse 自己会处理；
         手动替换会把 " 漏进字符串里 → 直接 parse 失败）。 */
function unescapeJsonText(raw) {
  return String(raw).replace(/\\u([0-9a-fA-F]{4})/g,
    (m, h) => String.fromCharCode(parseInt(h, 16)));
}

/** 把一个 HTML 属性 / JSON 字符串里的内容洗成纯文本（去标签、还原实体、压空白） */
function plainText(s) {
  return String(s == null ? '' : s)
    .replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>')
    .replace(/\\u0026/gi, '&').replace(/\\u002f/gi, '/')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/**
 * 头条图片 URL 认不认。
 * 只认 https + 图片后缀 + 【带 x-signature 签名】的那一批 ——
 * 没签名的（~cs.jpeg 聚合图）一律 HTTP 403，采了也是白采（实测）。
 * @param {string} raw
 * @returns {string} 规范化后的 URL，认不出来返回空串
 */
function normTtImg(raw) {
  let u = String(raw || '').trim().replace(/&amp;/gi, '&');
  if (!/^https:\/\//i.test(u)) return '';
  try {
    const h = new URL(u).host.toLowerCase();
    if (!/(toutiaoimg|pstatp|byteimg|toutiaostatic)\.com$/.test(h)) return '';
  } catch (e) { return ''; }
  if (!/\.(jpe?g|png|webp)(\?|$)/i.test(u)) return '';
  /* 必须带签名：这种图才没有防盗链 */
  if (!/[?&]x-signature=/i.test(u)) return '';
  return u;
}

/* 标题里能认出来的彩种（认不出就留空，不硬猜） */
const GAME_HINTS = [
  { re: /双色球|双色球晒票/, name: '双色球' },
  { re: /大乐透/,            name: '大乐透' },
  { re: /福彩\s*3D|福彩3D|\b3D\b|3d、/, name: '福彩3D' },
  { re: /快乐8|快乐八/,      name: '快乐8'  },
  { re: /排列3|排列三/,      name: '排列3'  },
  { re: /排列5|排列五/,      name: '排列5'  },
  { re: /七星彩/,            name: '七星彩' },
  { re: /七乐彩/,            name: '七乐彩' }
];
function gameOfTitle(title) {
  const t = String(title || '');
  for (const g of GAME_HINTS) if (g.re.test(t)) return g.name;
  return '';
}

/* ============================================================
   解析一个搜索页 → 条目数组
   ------------------------------------------------------------
   每条搜索结果 = 一个 type="application/json" 的 <script> 块，内容是被转义的 JSON。
   独立成函数（不碰网络），方便验收脚本拿真 HTML 直接调。
   @param {string} html
   @param {string} atIso   抓取时间
   @param {object} [cat]   分类（决定 src / gameOf / 每帖最多几张）；不传就按 tt 算
   ============================================================ */
export function parseTtPage(html, atIso, cat) {
  const C = cat || catByKey(TT_KEY);
  const gameOf = C.gameOf || ((t) => gameOfTitle(t));
  const items = [];
  /* ⚠️ 只按【卡片数据块】切：data-druid-card-data-id。
     用 "-argus" / id="…" 都切不到（那个是 nonce 的尾巴，见文件头说明）。 */
  const blocks = String(html).split(/<script[^>]*data-druid-card-data-id[^>]*>/i);
  blocks.shift();                       /* 第一个元素是第一个块之前的页面头 */

  for (const raw of blocks) {
    const end = raw.indexOf('</script>');
    const body = end >= 0 ? raw.slice(0, end) : raw;
    let obj = null;
    try { obj = JSON.parse(unescapeJsonText(body)); } catch (e) { continue; }
    const d = obj && obj.data;
    if (!d || typeof d !== 'object') continue;

    /* 标题实测是【纯字符串】(d.title === "3D排列3第26272期晒票，…")。
       但结构化卡片里也可能给成 {text,marked} —— 两种都吃，不猜错。 */
    const tRaw = (d.title && typeof d.title === 'object')
      ? (d.title.text || d.title.marked || '')
      : d.title;
    const title = plainText(tRaw).slice(0, 120);
    if (!title) continue;               /* 没标题的块（导航/底栏等）直接跳过 */

    const link = String(d.article_url || d.share_url || d.source_url || '');
    const author = plainText(d.media_name || (d.source && d.source.text) || '');
    const when = String(d.datetime || '');

    /* 图：大图（点开看）+ 450 宽缩略（网格里显示）。
       优先用 image_list（一条帖子可能有多张票），没有就退回封面单图。 */
    const big = normTtImg(d.large_image_url) || normTtImg(d.image_url);
    const list = Array.isArray(d.image_list) ? d.image_list : [];
    const urls = [];
    for (const li of list) {
      const u = normTtImg(li && li.url);
      if (u) urls.push(u);
    }
    if (!urls.length) {
      const u = normTtImg(d.image_url);
      if (u) urls.push(u);
    }
    /* 一条帖子最多出 6 张（一个帖子往往就是一组实票，多出几张更像"晒票栏"；
       上限 TT_MAX 兜底，不会无限长） */
    const use = [...new Set(urls)].slice(0, 6);
    if (!use.length && big) use.push(big);
    if (!use.length) continue;          /* 一张图都拿不到 → 这条没用 */

    for (const u of use) {
      if (items.some((x) => x.img === u)) continue;   /* 本页内去重 */
      items.push({
        img: u,                                     /* 缩略（450 宽，实测 21 KB） */
        thumb: u,
        big: big || u,                              /* 点开放大用的（960 宽） */
        title,
        url: link,
        at: atIso,
        src: C.src || 'tt',
        cat: C.key,
        game: gameOf(title),
        author,
        when
      });
    }
  }
  return items;
}

/* ============================================================
   合并旧数据 + 过期 + 去重 + 上限
   ------------------------------------------------------------
   规则跟 build-xysp.mjs 的 mergeAndPrune 完全一致：
     · 同一个 img 只留一条，at 保留【最早】那次，字段用最新的
     · at 早于 (keepHours) 前的丢      ← 数字彩 72 小时 / 竞彩 30 天
     · 按 at 倒序，砍到 max
   独立成函数，方便验收脚本拿假数据直接调（72 小时过滤那条测试就靠它）。
   @param {object|null} oldData   旧缓存文件的内容
   @param {Array} fresh          本轮新解析到的条目
   @param {number} nowMs
   @param {object} [cat]         分类（决定 keepHours / max / src）；不传按 tt 算
   @returns {{items: Array, stat: {kept:number,dropped:number,dupes:number,added:number}}}
   ============================================================ */
export function mergeTt(oldData, fresh, nowMs, cat) {
  const C = cat || catByKey(TT_KEY);
  const keepHours = C.keepHours || TT_KEEP_HOURS;
  const max = C.max || TT_MAX;
  const cutoff = nowMs - keepHours * 3600 * 1000;
  const bucket = new Map();
  const stat = { kept: 0, dropped: 0, dupes: 0, added: 0 };

  const push = (it, isFresh) => {
    const img = it && it.img ? String(it.img) : '';
    if (!img) return;
    const at = String(it.at || '');
    const t = Date.parse(at);
    if (!isFinite(t)) return;
    if (t < cutoff) { stat.dropped++; return; }          /* 超过保留窗口 → 丢 */
    const prev = bucket.get(img);
    if (prev) {
      stat.dupes++;
      prev.title = it.title || prev.title;
      prev.thumb = it.thumb || prev.thumb;
      prev.big = it.big || prev.big;
      prev.url = it.url || prev.url;
      prev.game = it.game || prev.game;
      prev.author = it.author || prev.author;
      prev.when = it.when || prev.when;
      if (Date.parse(prev.at) > t) prev.at = at;         /* 保留最早那次 */
      return;
    }
    bucket.set(img, {
      img,
      thumb: it.thumb || img,
      big: it.big || img,
      title: it.title || '',
      url: it.url || '',
      at,
      src: it.src || C.src || 'tt',
      cat: it.cat || C.key,
      game: it.game || '',
      author: it.author || '',
      when: it.when || ''
    });
    if (isFresh) stat.added++;
  };

  const oldList = (oldData && Array.isArray(oldData.items)) ? oldData.items : [];
  oldList.forEach((it) => push(it, false));
  (Array.isArray(fresh) ? fresh : []).forEach((it) => push(it, true));

  const items = [...bucket.values()]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, max);
  stat.kept = items.length;
  stat.keepHours = keepHours;
  return { items, stat };
}

/** 读旧的缓存文件（文件是我们自己写的纯 JSON，直接 JSON.parse）
    @param {string} file  文件路径
    @param {object} [cat] 分类（决定常量名）；不传按 tt 算 */
export function readTtOld(file, cat) {
  const C = cat || catByKey(TT_KEY);
  try {
    const txt = fs.readFileSync(file || path.join(ROOT, C.file), 'utf8');
    const m = new RegExp('const ' + (C.constName || 'XYSP_TT_DATA') + '\\s*=\\s*(\\{[\\s\\S]*\\});').exec(txt);
    if (!m) return null;
    return JSON.parse(m[1]);
  } catch (e) { return null; }
}

/** 把数据写成缓存文件的文本（纯函数，方便测试直接比对）
    @param {object} data  {updated, items}
    @param {object} [cat] 分类（决定文件名 / 常量名 / 保留窗口说明）；不传按 tt 算 */
export function ttFileText(data, cat) {
  const C = cat || catByKey(TT_KEY);
  const isJc = C.key === JC_KEY;
  const note = isJc
    ? `   ⚠️ 本文件【只】给竞彩页 足球推荐.html 用（export-football.mjs 读它）。\n` +
      `      分享页读的是 xysp-data.js（里面 games.tt / games.jc 是 build-xysp.mjs\n` +
      `      从这两个缓存合并出来的）。\n` +
      `   ⚠️ 保留窗口是 30 天不是 72 小时 —— 竞彩实票不是每天有人晒，\n` +
      `      按 72 小时卡会永远是空的（见 build-xysp-tt.mjs 里的实测说明）。\n`
    : `   ⚠️ 本文件【不直接】被页面读 —— build-xysp.mjs 会把它合进\n` +
      `      xysp-data.js 的 games.tt，页面只读 xysp-data.js。\n`;
  return `/* ============================================================\n` +
    `   ${C.file} —— 「${C.name}」数据（自动生成，请勿手动编辑）\n\n` +
    `   由 build-xysp-tt.mjs 生成（跟着 30 分钟任务跑）。\n` +
    `   只保留最近 ${C.keepHours} 小时内抓到的条目，最多 ${C.max} 条。\n` +
    note +
    `   图片是【外链】（头条签名图没有防盗链），页面里不存图片本体。\n` +
    `   更新时间：${data.updated}\n` +
    `   ============================================================ */\n\n` +
    `const ${C.constName} = ${JSON.stringify(data, null, 1)};\n`;
}

/* ============================================================
   主流程（只有【直接运行本文件】时才跑；被 import 时不跑）
   ------------------------------------------------------------
   build-xysp.mjs 会 import 上面的 mergeTt / readTtOld / TT_* ——
   那时候绝不能在这里发请求、也不能 exit()，否则会把调用方一起干掉。
   ============================================================ */
export function isDirectRun() {
  try {
    const self = fileURLToPath(import.meta.url);
    const arg = process.argv[1] ? path.resolve(process.argv[1]) : '';
    return !!arg && path.resolve(self) === arg;
  } catch (e) { return false; }
}

export async function runTtFetch() {
  const st = readState();
  const now = Date.now();

  if (st.pausedUntil && now < st.pausedUntil) {
    const left = Math.ceil((st.pausedUntil - now) / 60000);
    log(`⏸  头条退避中（连续全失败 ${st.failStreak} 次），还剩 ${left} 分钟，本轮跳过`);
    st.skips = (st.skips || 0) + 1;
    writeState(st);
    return { ok: false, skipped: true, fresh: [], httpOk: 0, failStreak: st.failStreak };
  }

  log('—— 头条本轮开始 ——');
  st.runs = (st.runs || 0) + 1;

  const roundIso = new Date(now).toISOString();
  let httpOk = 0, httpTotal = 0;
  let firstErr = '';
  let anyOk = false;
  const perCat = [];

  /* 分类之间也保持 >=1.2s 的间隔（同一个域名，别连打） */
  for (let ci = 0; ci < CATEGORIES.length; ci++) {
    const C = CATEGORIES[ci];
    const fresh = [];
    log(`  ── ${C.name}（${C.searches.length} 个关键词 · 保留 ${C.keepHours} 小时 · 上限 ${C.max}）──`);

    for (let i = 0; i < C.searches.length; i++) {
      const s = C.searches[i];
      if (i > 0 || ci > 0) await sleep(GAP_MS);       /* 请求间隔 >= 1.2s */
      httpTotal++;
      const url = BASE + encodeURIComponent(s.kw);
      try {
        const r = await fetch(url, {
          headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9'
          },
          /* 云端取 www 时会被 302 到 so.toutiao.com；
             这里显式跟跳转，免得哪天头条又改了入口就直接 0 条。
             ⚠️ 不重定向上限的坑：fetch 默认最多跟 20 跳，够用。 */
          redirect: 'follow',
          signal: AbortSignal.timeout(30000)
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const html = await r.text();
        httpOk++;
        const got = parseTtPage(html, roundIso, C);
        log(`     ${s.kw}：${got.length} 条`);
        fresh.push(...got);
      } catch (e) {
        const msg = String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 120);
        if (!firstErr) firstErr = `${s.kw} ${msg}`;
        log(`     ⚠️ 「${s.kw}」抓取失败：${msg}`);
      }
    }

    /* 跨关键词再去一次重（同一条帖子可能多个关键词都命中） */
    const uniq = new Map();
    for (const it of fresh) if (!uniq.has(it.img)) uniq.set(it.img, it);
    const freshList = [...uniq.values()];
    log(`     小结：${C.searches.length} 个关键词 · 解析到 ${freshList.length} 条图片`);

    const rec = { key: C.key, name: C.name, file: C.file, fresh: freshList.length, ok: false, kept: 0 };

    if (!freshList.length) {
      /* 这一分类零条 —— 不是致命错误：另一个分类可能好着。
         保留上一次的这个文件，继续跑下一个分类。 */
      log(`     ⚠️ ${C.name} 本轮零条 → 保留上一次的 ${C.file}`);
      perCat.push(rec);
      continue;
    }

    /* 合并旧数据 + 过期 + 去重 + 上限 */
    const file = path.join(ROOT, C.file);
    const oldData = readTtOld(file, C);
    const oldTotal = (oldData && Array.isArray(oldData.items)) ? oldData.items.length : 0;
    const { items, stat } = mergeTt(oldData, freshList, now, C);

    const data = { updated: stamp(new Date(now)), items };
    const text = ttFileText(data, C);
    fs.writeFileSync(file, text, 'utf8');

    log(`     ✅ 已写入 ${C.file}（${(Buffer.byteLength(text, 'utf8') / 1024).toFixed(1)} KB）`);
    log(`        旧数据 ${oldTotal} 条 → 合并后 ${stat.kept} 条` +
      `（丢弃过期 ${stat.dropped} 条 · 去重合并 ${stat.dupes} 条 · 本轮新加入 ${stat.added} 条）`);
    anyOk = true;
    rec.ok = true; rec.kept = stat.kept; rec.stat = stat;
    perCat.push(rec);
  }

  const totalFresh = perCat.reduce((n, c) => n + c.fresh, 0);
  log(`   抓取结束：${httpTotal} 个关键词页面成功 ${httpOk} 个 · 解析到 ${totalFresh} 条图片`);

  if (!anyOk) {
    st.failStreak = (st.failStreak || 0) + 1;
    log(`⚠️  本轮【所有分类】都零条（${firstErr || '页面里没解析到晒票'}）· 连续全失败 ${st.failStreak} 次`);
    log('    保留上一次的所有缓存文件');
    if (st.failStreak >= FAIL_PAUSE_AFTER) {
      st.pausedUntil = now + PAUSE_MINUTES * 60000;
      st.failStreak = 0;
      log(`🛑 连续全失败达 ${FAIL_PAUSE_AFTER} 次 → 暂停 ${PAUSE_MINUTES} 分钟（保护数据源）`);
    }
    st.skips = (st.skips || 0) + 1;
    st.lastRun = roundIso;
    writeState(st);
    return { ok: false, skipped: false, fresh: [], perCat, httpOk, failStreak: st.failStreak, firstErr };
  }

  st.failStreak = 0;
  st.pausedUntil = 0;
  st.ok = (st.ok || 0) + 1;
  st.lastRun = roundIso;
  writeState(st);

  log('—— 头条本轮结束（有新数据）——');
  return { ok: true, skipped: false, fresh: totalFresh, perCat, httpOk, updated: stamp(new Date(now)) };
}

/* ---------- 直接运行：跑完按退出码退出 ---------- */
if (isDirectRun()) {
  const r = await runTtFetch();
  process.exit(r.ok ? 0 : 10);
}
