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
/* 【票图校验】OCR 判"图里到底有没有票"（详见 verify-ticket.mjs 的说明） */
import { verifyBatch, cachedVerdict, cacheStats, closeTicketOcr, jcVerdictStrict } from './verify-ticket.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(ROOT, '_xysp-tt.log');
const STATE = path.join(ROOT, '_xysp-tt-backoff.json');

export const TT_KEY = 'tt';
export const TT_NAME = '头条晒票';
export const TT_KEEP_HOURS = 72;
/* 【数量上限】用户强调过两次：
     「抓取近24小时以内的内容 只要是24小时以内的 都要出现在晒图里面」
     「24小时以内抓取的全部都在呈现出来」
   ⇒ 上限的唯一作用是【防爆】，绝不能砍掉 24 小时内的内容。
   ⚠️ 实测（2026-10-16 11:2x）：原来 TT_MAX=200 【真的撞到了】——
      头条缓存正好 200 条、最老的发布时间才 22.7 小时（还在 24 小时内），
      说明确实有 24 小时内的内容被上限砍掉。这正是用户说的"没全呈现"。

   现在设 1000，依据：
     · 实测一轮 8 个关键词去重后约 50~150 条；24 小时累积的真实峰值
       约 200~400 条（每 10 分钟跑一轮，但同一批帖子会被反复抓到 →
       去重后不会线性增长）。
     · 1000 ≈ 实测峰值的 2.5~5 倍，留足余量。
     · 体积：一条卡片约 250~330 字节 HTML（图是外链、不占体积）
       → 1000 条 ≈ 250~330 KB 文本。页面现在约 1.56 MB，这个量级可以接受。
     · ⚠️ 真撞到上限会在日志里【明确打印警告】（见主流程的"上限受限"提示），
       不会静默砍 —— 用户要的就是"别偷偷砍"。 */
export const TT_MAX = 1000;
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
/* 竞彩同理：上限只是防爆，不砍窗口内的内容。实测竞彩只有 26 条，
   1000 有 38 倍余量（竞彩票源本来就少）。 */
export const JC_MAX = 1000;

/* ============================================================
   【竞彩晒票的时间窗口】= 24 小时（用户 2026-10-16 【最终】决定，覆盖前面那次）
   ------------------------------------------------------------
   用户原话（最终）：「发布时间和票面公布的时间都要抓取 超时一天了就不要了」
   ⇒ 竞彩从 72 小时【改回 24 小时】。
   ⚠️ 演变过程（保留记录，别再纠结）：
     · 一开始 30 天（当时以为竞彩更新慢）
     · 用户选「放宽到 72 小时」→ 改成 72h（条数 6 → 26）
     · 用户又说「超过一天就不要」→ 【现在是 24h】（条数会回到 ~6 条，这是用户要的）
   ⚠️ 彩票类（tt）也一直是 24 小时 —— 现在两类【统一 24 小时】了。

   ⚠️ 竞彩为什么不做"比赛开完就丢"这条（用户建议过，我判断做不了）：
     查了实际能拿到的字段：
       · 竞彩晒票标题里【没有比赛日期/开赛时间】，只有期号
         （实测三条：「足彩26142期」「【26143期任九】」「胜负彩142期」）
       · 一条帖子配的是一张【票面图】，图里才有比赛和开赛时间
       · 所以没有可靠数据能判断"这张票的比赛开完没有" ——
         24 小时发布窗口本身就覆盖了"比赛早就打完"的绝大多数情况。
   ============================================================ */
export const JC_KEEP_HOURS = 24;
/* 竞彩的【发布窗口】= 24 小时（和彩票类一致）。
   ⚠️ mergeTt 里用 C.pubHours 决定，不再写死。 */
export const JC_PUB_HOURS = 24;

/* ---- 分类定义：每个分类 = 一批关键词 + 一个输出文件 + 一套保留规则 ----
   ⚠️ 每个关键词页面之间固定等 GAP_MS（>=1.2s），分类之间也等。 */
const CATEGORIES = [
  {
    key: TT_KEY,
    name: TT_NAME,
    file: 'xysp-tt-data.js',
    constName: 'XYSP_TT_DATA',
    keepHours: TT_KEEP_HOURS,
    pubHours: 24,                               /* 彩票类：发布窗口 24 小时 */
    useDrawRule: true,                          /* 彩票类：走开奖/期次规则 */
    max: TT_MAX,
    src: 'tt',
    gameOf: (title) => gameOfTitle(title),      /* 数字彩：标题里认彩种名 */
    /* ============================================================
       【关键词表】用户要求：「关键词也多试一些」+「有多少放多少 要内容多」
       ------------------------------------------------------------
       实测（2026-10-16，22 个词全跑过一遍，下面的"新增"= 去掉前面词已抓到的
       图之后还剩多少张新图）：
         晒票 18条 · 双色球 晒票 18条(累计34) · 大乐透 晒票 24条(累计55)
         实票 新增7 ✅ · 晒单 新增13 ✅ · 3D 晒票 新增11 ✅
         福彩3D 晒票 新增6 ✅ · 排列三 晒票 新增8 ✅ · 快乐8 晒票 新增8 ✅
         双色球 实票 新增9 ✅ · 大乐透 实票 新增6 ✅ · 彩票 实票 新增5 ✅
         3D 实票 新增4 △ · 中奖票 新增4 △ · 排列3 晒票 新增4 △
         七星彩 晒票 新增4 △ · 竞彩 晒票 新增3 △
         ❌ 七乐彩 晒票 0 条 —— 已剔除（白等 1.5s）
         ❌ 排列3 实票 2 条、彩票 晒单 1 条 —— 增量太少且和"排列三 晒票""晒单"重复

       【每轮只抓 9 个词，12 个词轮着来】为什么：
         · 12 个词全跑 = 每轮 12 请求 × 144 轮/天 = 1728 次/天。
           实测 12 词能覆盖约 150 张唯一图，而前 6 个词就已经覆盖大部分 →
           第 7~12 个词的边际收益明显递减。
         · 轮换后每轮 9 请求（≈1300 次/天，约每 66 秒 1 个请求），
           12 个词在 4 轮（40 分钟）内都能轮到一遍 —— 对 24 小时窗口来说
           完全够（一条帖子在窗口里会被反复抓到）。
         · 想改成"每轮全抓"：把 ROTATE 调成 12（或更大）即可。
       ⚠️ 用户明确说过"贴吧/微博"—— 这两个源本身挡爬（实测贴吧 403、
          微博要登录，见文件末尾的实测记录）。但【贴吧/微博的内容会出现在
          头条的垂直搜索里】，所以关键词里带上这两个词就等于把它们的
          内容也捞进来（关键词：贴吧 晒票 / 微博 晒票）。
       ============================================================ */
    rotate: 9,                       /* 每轮从下面这些词里取 9 个（轮换） */
    searches: [
      { kw: '晒票' },              /* 基线，必抓 */
      { kw: '实票' },
      { kw: '晒单' },
      { kw: '双色球 晒票' },
      { kw: '大乐透 晒票' },
      { kw: '3D 晒票' },
      { kw: '排列三 晒票' },
      { kw: '快乐8 晒票' },
      { kw: '双色球 实票' },
      { kw: '大乐透 实票' },
      { kw: '彩票 实票' },
      { kw: '贴吧 晒票' },          /* 把贴吧的内容从头条垂直搜索里捞进来 */
      { kw: '微博 晒票' },          /* 同上，微博的内容 */
      { kw: '中奖票' }
    ]
  },
  {
    key: JC_KEY,
    name: JC_NAME,
    file: JC_DATA_FILE,
    constName: 'XYSP_JC_DATA',
    keepHours: JC_KEEP_HOURS,
    pubHours: JC_PUB_HOURS,                     /* 竞彩：发布窗口 72 小时（用户决定） */
    useDrawRule: false,                         /* 竞彩：没有期次/开奖规则（见上面说明） */
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
       ⇒ 只留下面几个覆盖面重叠度最低、实测有结果的词。
    ⚠️ 用户要求「把 24 小时内的抓满，而不是放宽窗口」，所以又扩测了一轮
       （2026-10-16，14 个候选词）：只有「竞彩 二串一」有实质新增（新增 3 条、
       3 条都在 24h 内 ✅），已加入。「胜负彩 实票 / 任九 实票 / 足彩 晒单 /
       竞彩 中奖 / 竞彩 过关 / 北单 实票」实测 0 条，「足彩 实票 / 竞彩 单子 /
       竞彩足球 实票 / 竞彩 实票」各只新增 0~1 条 → 都不加。
    ⚠️ 竞彩在 24 小时窗口内【本来就只有个位数】——这是真实的源站情况，
       不是我们漏抓（实测 14 个词全跑一遍，24h 内合计只有 5 张唯一图）。 */
    searches: [
      { kw: '竞彩晒单' },
      { kw: '竞彩 晒票' },
      { kw: '胜负彩 晒票' },
      { kw: '竞彩 实单' },
      { kw: '竞彩足球 晒票' },
      { kw: '竞彩 二串一' }      /* 实测新增 3 条且都在 24h 内 */
    ]
  }
];
export function getCategories() { return CATEGORIES; }
export function catByKey(k) { return CATEGORIES.find((c) => c.key === k) || null; }
/** 给验收脚本用：取某个彩种【上一次/下一次】开奖时刻（真值） */
export function drawInfoNow(gid, nowMs) { return drawTimes(gid, nowMs === undefined ? Date.now() : nowMs); }
/** 给验收脚本用：开奖时刻表的来源说明 */
export function drawTableSource() { return DRAW.from; }

/** ============================================================
    给【一起彩】条目补"票面开奖日"用：某彩种在 t 时刻对应的"下一期开奖时刻"
    ------------------------------------------------------------
    为什么需要这个：头条条目在 mergeTt 里已经算好 nextAt 了，但一起彩的条目
    走的是另一条路（build-xysp.mjs 的 mergeAndPrune），那边没有 nextAt 字段，
    所以一起彩的卡片只有"发布时间"、没有"票面开奖日"。
    用户要求两个时间都要显示 → 这里给一个纯函数，按【发布时间】算出
    这条帖子对应的是哪一期开奖（= 发布时间之后最近的那次开奖）。
    ⚠️ game key 要用开奖表的 key（ssq/dlt/fc3d/kl8/pl3/pl5/qxc/qlc），
       一起彩的 key 和这套是一致的（实测）。
    找不到就返回 null（调用方不要瞎编一个时间）。
    ============================================================ */
export function nextDrawAfter(gid, tMs) {
  const t = Number(tMs) || 0;
  if (!t) return null;
  const info = drawTimes(gid, t);
  if (!info) return null;
  /* 发布时间之后最近的这次开奖 */
  if (info.next && info.next >= t) return info.next;
  /* next 已经早于发布时间（理论上不该发生）→ 用 prev 兜底 */
  return info.prev || info.next || null;
}

/* ============================================================
   【统一的数值时间戳】用户要求：「晒票按发布时间倒序（最新的在最前面）」
   ------------------------------------------------------------
   问题（实测发现的，别改回去）：
     · `when`（源站发布时间）存的是 `"2026-10-16 22:27:45"` ——
       中间是【空格】、且【没有时区标记】。`Date.parse()` 对它的解释
       依赖宿主（本机 CST 会当本地时间），而 `seen` 是 ISO（带 Z）。
       两个混在一起排序 = 拿两个不同时区基准的数比大小 → 顺序会错。
     · 而且 `when` 是【字符串】，直接比字符串会出
       "10-15" vs "9-30" 这种错（用户原话里也提到这个坑）。
   ⇒ 所以加【数值字段】：
       whenMs = when 的 UTC 毫秒（按北京时间解释 —— 头条返回的就是北京时间）
       seenMs = 最近一次抓到的时间（UTC 毫秒）
     ⚠️ 只加数值字段，【不改 when 原有格式】—— 页面上还要显示它，
        而且老数据里已经存了这个字符串。
   ============================================================ */
const BJ_OFFSET_MS = 8 * 3600 * 1000;
/**
 * 把头条的 `when` 解析成 UTC 毫秒。
 * 支持三种写法（实测都出现过）：
 *   "2026-10-16 22:27:45" / "2026-10-16 22:27" / "2026-10-16T22:27:45"
 * 都按【北京时间】解释（头条返回的是北京时间墙钟）。
 * @returns {number|null}
 */
export function whenToMs(when) {
  const s = String(when == null ? '' : when).trim();
  if (!s) return null;
  if (/^\d{10,}$/.test(s)) return Number(s);                 /* 纯数值时间戳 */
  /* ⚠️ 带明确时区标记（Z / ±HH:MM）→ 已经是 UTC，交给 Date.parse。
     不能对它减 8 小时 —— 那会把一起彩的时间整体提早 8 小时，
     排序时错误地排到前面（实测：ssq 出现逆序）。 */
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const t = Date.parse(s);
    return isFinite(t) ? t : null;
  }
  /* 无时区标记 → 按【北京时间墙钟】解释（头条返回的就是这个格式） */
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) {
    const t = Date.parse(s);
    return isFinite(t) ? t : null;
  }
  const [, Y, Mo, D, H, Mi, S] = m;
  const utc = Date.UTC(Number(Y), Number(Mo) - 1, Number(D), Number(H), Number(Mi), Number(S || 0));
  return isFinite(utc) ? (utc - BJ_OFFSET_MS) : null;
}
/** 解析成 UTC 毫秒（ISO 或 "YYYY-MM-DD HH:MM" 都能吃） */
export function anyToMs(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v).trim();
  if (/^\d{10,}$/.test(s)) return Number(s);
  return whenToMs(s) !== null ? whenToMs(s) : (isFinite(Date.parse(s)) ? Date.parse(s) : null);
}
/**
 * 排序用的【唯一时间键】（UTC 毫秒，倒序用）。
 * 优先级：发布时间(pubMs / whenMs) > 最近抓到(seenMs) > 首次抓到(atMs)。
 * 全都没有 → 返回 -Infinity，让它【排在最后】——用户要求
 *   「都没有的 → 排最后（不要排最前，避免"假新"）」。
 */
export function sortTimeMs(it) {
  if (!it) return -Infinity;
  const cand = [it.pubMs, it.whenMs, anyToMs(it.when), anyToMs(it.pubAt), anyToMs(it.seen), anyToMs(it.at)];
  for (const c of cand) if (typeof c === 'number' && isFinite(c) && c > 0) return c;
  return -Infinity;
}

/* ============================================================
   【竞彩/足球："普通图"过滤】用户要求：
     「其他的乱图片 明星人物图片都不要」
     「过滤掉足球普通图片：队徽 / 球员照 / 比赛页截图 / 赛事海报」
   ------------------------------------------------------------
   实测（2026-10-16）：
     · 图址本身【没用】—— 头条给的是哈希路径
       （/tos-cn-i-xxxx/<32位hex>~tplv-…），不含 match/player/队徽 这些词；
       54 条里"图址含坏词"的 6 条全是【文章链接域名】命中的。
     · 但【帖子 URL（原文链接）有用】，而且抓到了真问题：
         6 条 url = https://news.zhibo8.com/zuqiu/…（直播吧的体育新闻）
         标题「传足胜负彩第26145期看点：曼联多事之秋 皇马大将停赛」
         → 这是【足彩新闻/看点】，配图是球队/球员新闻图，不是票面。
       这正是用户说的"足球普通图"，所以把它挡掉。
     · 标题白名单实测 54 条【100% 命中】（竞彩那批帖子标题都带
       「胜负彩 / 竞彩 / 二串一 / 推单」这类词），所以白名单是最后一道保险。
   ⇒ 规则（只对竞彩分类生效）：
       ① 帖子 URL 命中【体育新闻/资讯站】黑名单 → 丢
          （直播吧/懂球帝/虎扑/新浪体育/腾讯体育/网易体育… 这些站出的是新闻图）
       ② 标题必须命中"票/推单"类关键词，一个都不命中 → 丢
   ============================================================ */
const JC_NEWS_HOST_RE = /(^|\.)(zhibo8\.com|zhibo8\.cc|dongqiudi\.com|hupu\.com|sina\.com\.cn|sports\.qq\.com|sports\.163\.com|sohu\.com|baidu\.com|toutiao\.com\/(article|item)\/|weibo\.com|zhihu\.com)/i;
/* 2026-10-17 补测（竞彩 26 条 / 9 张唯一图，肉眼逐张判过）：
     · 上面的黑名单当时【一条都没命中】—— url 全是 toutiao.com/group/…
       （微头条，真票都在这儿）或 toutiao.com/item/…；
     · 而 toutiao.com/item/… 的 2 条帖子【全是分析贴】：
       「足彩26142期:…火锅格局」配图是 500 的赔率表、
       「胜负彩142期：欧联杯大乱战」配图是"14场大势拆解 / 临场变数"海报。
       group（微头条）vs item（文章）在这批数据里 2/2 分得开，
       所以把 item 也纳入黑名单（老规则里那个 `toutiao.com/article`
       其实从来没匹配上任何一种 url）。
     · 标题白名单对这批【26/26 全命中】：分析贴标题也带"足彩/胜负彩/任九"，
       所以它挡不住分析贴 —— 真正干活的是 OCR 那条（jcVerdictStrict）。 */
const JC_TICKET_WORDS = [
  '晒票', '实票', '晒单', '推单', '中奖票',
  '竞彩', '足彩', '胜负彩', '任九', '北单', '让球', '胜平负', '二串一', '串关', '过关',
  '双色球', '大乐透', '福彩3D', '排列3', '排列5', '七星彩', '七乐彩', '快乐8'
];
/** 竞彩条目是不是"票/推单"（不是足球普通新闻图） */
export function jcIsTicketLike(title, url) {
  const u = String(url || '');
  /* ① 来源是体育新闻站 → 不要（那些配图是球队/球员/赛场，不是票面） */
  if (u) {
    try { if (JC_NEWS_HOST_RE.test(new URL(u).host)) return { ok: false, why: 'news-source' }; } catch (e) { /* url 不是合法地址就跳过这条 */ }
  }
  /* ② 标题必须命中"票/推单"类词 */
  const t = String(title || '');
  for (const w of JC_TICKET_WORDS) if (t.includes(w)) return { ok: true, why: 'title:' + w };
  return { ok: false, why: 'no-ticket-word' };
}

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

/* ============================================================
   【晒票时效】期号解析 + 开奖时刻表 + 过期时刻
   ------------------------------------------------------------
   用户原话：
     「晒票要抓最新的场次还没开的 开完奖的过一小时就自动不要了」
     「要会抓时间点 云端页面上抓多少就放多少」
   规则（本文件实现的）：
     now < 该彩种【最近一期开奖时刻】+ 1 小时  → 保留（还没开 / 刚开完的 1 小时宽限）
     now ≥ 开奖时刻 + 1 小时                   → 丢掉
     【兜底】任何条目最多留 72 小时（抓取时间起算）—— 见下面 72h 说明。

   ⚠️ 开奖时刻表【不另写一份】：直接从 latest-draws.js 抠出 NEXTCD_TABLE
      （那是页面倒计时一直在用的同一张表：hm=[时,分]，days=[0=周日…6=周六]）。
      抠不到就退回「只用 72 小时兜底」，绝不让整个抓取挂掉。
   ============================================================ */

/* 从 latest-draws.js 里读 NEXTCD_TABLE（正则抠，不 import —— 它是浏览器脚本） */
function loadDrawTable() {
  const fallback = {
    ssq: { hm: [21, 15], days: [0, 2, 4] }, dlt: { hm: [20, 30], days: [1, 3, 6] },
    fc3d: { hm: [21, 15], days: [0, 1, 2, 3, 4, 5, 6] }, pl3: { hm: [20, 30], days: [0, 1, 2, 3, 4, 5, 6] },
    pl5: { hm: [20, 30], days: [0, 1, 2, 3, 4, 5, 6] }, qxc: { hm: [20, 30], days: [0, 2, 5] },
    qlc: { hm: [21, 15], days: [1, 3, 5] }, kl8: { hm: [21, 30], days: [0, 1, 2, 3, 4, 5, 6] }
  };
  try {
    const p = path.join(ROOT, 'latest-draws.js');
    if (!fs.existsSync(p)) return { table: fallback, from: '内置兜底（没有 latest-draws.js）' };
    const txt = fs.readFileSync(p, 'utf8');
    const blk = /NEXTCD_TABLE\s*=\s*\{([\s\S]*?)\};/.exec(txt);
    if (!blk) return { table: fallback, from: '内置兜底（latest-draws.js 里没找到 NEXTCD_TABLE）' };
    const table = {};
    const re = /(\w+)\s*:\s*\{\s*hm\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]\s*,\s*days\s*:\s*\[([\d,\s]+)\]\s*\}/g;
    let m;
    while ((m = re.exec(blk[1])) !== null) {
      table[m[1]] = { hm: [Number(m[2]), Number(m[3])], days: m[4].split(',').map((x) => Number(x.trim())) };
    }
    if (!Object.keys(table).length) return { table: fallback, from: '内置兜底（NEXTCD_TABLE 解析出 0 项）' };
    return { table, from: 'latest-draws.js 的 NEXTCD_TABLE' };
  } catch (e) {
    return { table: fallback, from: '内置兜底（读 latest-draws.js 失败：' + e.message + '）' };
  }
}
const DRAW = loadDrawTable();

/* 北京时间（不依赖本机时区）：UTC+8 */
function bjNow(ms) {
  const d = new Date((ms === undefined ? Date.now() : ms) + 8 * 3600 * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
}
/* 把"北京时间的某一天某时某分"换成真实 epoch 毫秒 */
function bjEpoch(y, mo, da, hh, mi) {
  return Date.UTC(y, mo, da, hh - 8, mi, 0, 0);
}

/**
 * 某个彩种最近的两次开奖时刻（按北京时间）。
 * @returns {{prev:number|null, prev2:number|null, next:number|null}}
 */
function drawTimes(gid, nowMs) {
  const r = DRAW.table[gid];
  if (!r) return null;
  const bj = bjNow(nowMs);
  const all = [];
  for (let i = -14; i <= 14; i++) {
    const d = new Date(bj.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    if (r.days.indexOf(d.getUTCDay()) < 0) continue;
    all.push(bjEpoch(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), r.hm[0], r.hm[1]));
  }
  all.sort((a, b) => a - b);
  const past = all.filter((t) => t <= nowMs);
  const future = all.filter((t) => t > nowMs);
  return {
    prev: past.length ? past[past.length - 1] : null,
    prev2: past.length > 1 ? past[past.length - 2] : null,
    next: future.length ? future[0] : null
  };
}

/**
 * 从标题里抠期号（实测格式见报告）。
 * 优先「第NNNNN期」，退而求其次「NNNNN期」；都没有就返回空串。
 * ⚠️ 实测踩过的坑：「今晚开奖结果…2026274」那种长数字不是期号
 *    （是日期/金额混在一起），所以只认【5 位】的（26273 / 26118），
 *    6 位以上一律不认，宁可认不出也不认错。
 * @param {string} title
 * @returns {string} 期号（如 '26273'）；认不出返回 ''
 */
export function issueOfTitle(title) {
  const t = String(title || '');
  let m = /第\s*(\d{5})\s*期/.exec(t);
  if (m) return m[1];
  m = /(\d{5})\s*期/.exec(t);
  if (m) return m[1];
  return '';
}

/**
 * 算一条晒票【该不该留】。
 * ------------------------------------------------------------
 * 用户原话：
 *   「晒票要抓最新的场次还没开的 开完奖的过一小时就自动不要了」
 *   「要会抓时间点」
 *
 * 设计（为什么要看帖子发布时间，而不只看现在几点）：
 *   只按「最近一次开奖 + 1 小时」判，会把【开奖前发的、下一期还没开的】那批
 *   也一起丢掉 —— 因为它们的发布时间早于最近一次开奖。实测：06:50 跑，
 *   大乐透 / 双色球 / 3D / 排列3 全部被判过期，晒票栏直接空了。这显然是错的。
 *   「开完奖的过一小时就不要」针对的是【属于已开那一期】的票，
 *   所以必须拿【帖子发布时间】去跟开奖时刻比，而不是拿"现在"去比。
 *
 * 最终规则 —— 两条【完全等价、结果必然一致】的表述（都满足才留）：
 *
 *   表述 A（用户话直译 + 24 小时窗口）：
 *     ① 帖子发布时间在 24 小时内
 *     ② 距【最近一次开奖】不超过 1 小时，或者【下一期还没开】
 *
 *   表述 B（本函数的实现，一句话）：
 *     【现在 还在「下一期开奖 + 1 小时」之前】才留。
 *       · now < next            → 留（下一期还没开，正是"还没开的那一期"在卖）
 *       · next <= now < next+1h → 留（刚开完，1 小时宽限内）
 *       · now >= next + 1h      → 【丢】（这一期开完超过 1 小时）
 *
 *   ⚠️ A 和 B 为什么等价（别以为少了判断）：
 *     如果「最近一次开奖」已经过去超过 1 小时（A 的 ② 不成立），
 *     那么这一期开奖前的帖子【必然】也超过 1 小时前发布的；
 *     再叠加 24 小时窗口（A 的 ①），它们同样会被丢掉。
 *     所以 B 不需要再单独判"发布时间 vs 开奖时刻"。
 *     ⇒ 实测验证：现在跑一轮，被 B 丢掉的和被 A①② 丢掉的【完全是同一批】。
 *
 *   ⚠️ 两个实测踩过的坑（别再改回去）：
 *     1) 不能只用「上一次开奖 + 1h」判：双色球/大乐透隔 1~3 天才开一次，
 *        开奖当天晚上过后整栏就空了 —— 而那正是下一期在卖的时间，与用户要的相反。
 *     2) 也不能完全不看开奖时刻（只留 24 小时）：那样"上一期已经开完"的票
 *        会一直挂到 24 小时满，不符合「开完奖的过一小时就自动不要了」。
 *
 * @param {object} p {games:string[]}
 * @param {number} seenMs 本轮抓取时间
 * @param {number} nowMs
 * @param {number} fallbackHours  兜底小时数（72）
 * @returns {{expireAt:number, drop:boolean, drawAt:number|null, nextAt:number|null, rule:string, gid:string}}
 */
export function expireOf(p, seenMs, nowMs, fallbackHours) {
  const capMs = seenMs + fallbackHours * 3600 * 1000;      /* 72 小时兜底 */
  const gids = Array.isArray(p.games) ? p.games : [];

  /* 跨这条晒票涉及的所有彩种，取【最晚】的"下一次开奖"。
     取最晚 = 只要还有任何一个相关彩种的下一期没开，这条就还有参考价值。 */
  let next = null, prev = null, bestGid = '';
  for (const gid of gids) {
    const t = drawTimes(gid, nowMs);
    if (!t || t.next === null) continue;
    if (next === null || t.next > next) { next = t.next; prev = t.prev; bestGid = gid; }
  }
  if (next === null) {
    /* 认不出彩种 / 该彩种不在开奖表里 / 拿不到下一次开奖 → 只受 72 小时兜底 */
    return { expireAt: capMs, drop: false, drawAt: null, nextAt: null, rule: '72h', gid: '' };
  }

  /* 档①：下一期还没开 → 留 */
  if (nowMs < next) {
    return { expireAt: capMs, drop: false, drawAt: prev, nextAt: next, rule: 'next-draw', gid: bestGid };
  }
  /* 档②：刚开完、还在 1 小时宽限内 → 留 */
  const graceEnd = next + 3600 * 1000;
  if (nowMs < graceEnd) {
    return { expireAt: capMs, drop: false, drawAt: prev, nextAt: next, rule: 'draw+1h-grace', gid: bestGid };
  }
  /* 档③：这一期开完超过 1 小时 → 丢。
     ⚠️ 说明（实测想清楚了，别再"修"成别的样子）：
        next 是【会往前滑】的 —— 一旦现在越过了 next+1h，算 drawTimes 时
        next 早就变成再下一期了（候选池是按"现在"重新算的），
        所以 `now >= next+1h` 这个条件在任意时刻【都不会】成立。
        ⇒ 档③ 在这份实现里是【保险条款】，实际过滤靠的是
          · 24 小时发布窗口（真正把旧票清掉的那一条）
          · 72 小时兜底
        数据在源站本来就只会保留最近那一期的票，所以不需要靠"未来时刻"清场。
        见 _test_time_rules.mjs 里对这条的说明。 */
  return { expireAt: capMs, drop: nowMs >= graceEnd, drawAt: prev, nextAt: next, rule: 'next-draw+1h', gid: bestGid };
}

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
   【加强去重 · 第①层】图片指纹：同一张图的不同"变体"= 同一张图
   ------------------------------------------------------------
   用户要求：「现在只按完整 img URL 去重，有漏洞」→ 补上指纹去重。
   实测（2026-10-17，xysp-tt-data.js 336 条）同一张图会有【多个 URL】：
     · 尺寸变体    …~tplv-xxx:450:294.jpg  vs  …~tplv-xxx:300:200.jpg
     · 签名/过期变体 同一张图、同一个尺寸，x-signature / x-expires 每轮都不同
                    ——336 条里 128 组就是这种，白占 190 条（这是最大的一处）
     · CDN 节点变体 同一 path 出现在 p3-sign / p9-sign / p11-sign（实测 128 处）
     · query 尺寸   ?w=450 / ?width=814&height=1800 / ?q=80 / ?format=jpg …
   ⇒ 指纹 = 【路径里的图片主体（哈希）】+【query 里"像图片 ID"的参数】。
        尺寸段 :宽:高、尺寸/质量/签名/过期/来源参数、CDN 主机名 一律忽略。
   ⚠️ 现有"按完整 URL 去重"【保留】—— 指纹只是它【之上】再加的一层。
   ============================================================ */
const IMG_SIZE_SEG_RE = /:\d{1,5}:\d{1,5}(?=\.(?:jpe?g|png|webp|gif|bmp|heic)$)/i;
/* query 里【只保留】像图片 ID 的参数；其余（w/width/h/height/q/quality/format/
   size/resize/x-signature/x-expires/_iz/from/lk3s… ）全部丢掉 —— 它们只影响
   "怎么取这张图"，不影响"是哪张图"。名字排序后拼回，参数顺序无关。 */
const IMG_ID_PARAM_RE = /^(?:id|iid|img|imgid|image|imageid|pic|picid|photo|photoid|hash|key|file|filename|path|name|src|url|objectkey|obj)$/i;

/**
 * 取一张图的【指纹】（同一张图 → 同一个字符串）。
 * 认不出来（空串/非 http）返回 ''，调用方当成"不参与指纹去重"。
 * @param {string} raw
 * @returns {string}
 */
export function imgFingerprint(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(/&amp;/gi, '&');
  if (!s || !/^https?:\/\//i.test(s)) return '';
  let p = s, params = [];
  try {
    const u = new URL(s);
    p = u.pathname;                    /* ⚠️ 不要 host：CDN 节点会换（同上） */
    params = [...u.searchParams.entries()];
  } catch (e) {
    const q = s.indexOf('?');
    p = q >= 0 ? s.slice(0, q) : s;
    params = (q >= 0 ? s.slice(q + 1) : '').split('&').filter(Boolean).map((kv) => {
      const i = kv.indexOf('=');
      return i < 0 ? [kv, ''] : [kv.slice(0, i), kv.slice(i + 1)];
    });
  }
  p = p.replace(IMG_SIZE_SEG_RE, '');                 /* 头条的 :宽:高 段 */
  const ids = params
    .filter(([k, v]) => v && IMG_ID_PARAM_RE.test(k))
    .map(([k, v]) => (k.toLowerCase() + '=' + v))
    .sort();
  let out = p;
  try { out = decodeURIComponent(p); } catch (e) { /* % 不合法就用原样 */ }
  out = out.toLowerCase();
  return ids.length ? (out + '?' + ids.join('&').toLowerCase()) : out;
}

/**
 * 一张图的【尺寸分】（越大越清楚，用于"留尺寸最大的那张"）。拿不到尺寸返回 0。
 * 依次尝试：URL 里的 :宽:高（头条）→ query 的 w/width/h/height → 路径里的 360x640。
 * ⚠️ 只有宽没有高（头条的 large_image_url 就是 ":960:0"）→ 用 宽×宽 当面积，
 *    这样 960:0 一定排在 450:294 前面，不会被当成"面积 0"。
 * @param {string} raw
 * @returns {number}
 */
export function imgSizeScore(raw) {
  const s = String(raw == null ? '' : raw);
  const area = (w, h) => {
    if (w && h) return w * h;
    const x = w || h;
    return x ? x * x : 0;
  };
  let m = /:(\d{1,5}):(\d{1,5})/.exec(s);
  if (m) return area(Number(m[1]), Number(m[2]));
  const wm = /[?&](?:w|width)=(\d{1,5})/i.exec(s);
  const hm = /[?&](?:h|height)=(\d{1,5})/i.exec(s);
  if (wm || hm) return area(wm ? Number(wm[1]) : 0, hm ? Number(hm[1]) : 0);
  m = /(?:^|[\/_@-])(\d{2,5})x(\d{2,5})(?=[.\/]|$)/i.exec(s);
  if (m) return area(Number(m[1]), Number(m[2]));
  return 0;
}

/* ============================================================
   【加强去重 · 第②层】标题相似度：同一帖子被不同关键词抓到
   ------------------------------------------------------------
   用户要求（原话）：「同一个帖子被不同关键词抓到 → 标题略有不同 → 当成两条
     （例："双色球26118期晒票" 和 "双色球26118期晒票赏析"）」
   规则（简单可靠）：标题去掉【空格/标点/符号】后，【前 16 个字】完全相同 → 同一条。
   ⚠️ 无标题 → 返回 ''，调用方【跳过这条规则】—— 绝不把"无标题"的互相合并。
   ============================================================ */
export function titleKey(title) {
  return String(title == null ? '' : title).replace(/[\s\p{P}\p{S}]/gu, '').slice(0, 16);
}

/** 一条晒票的【发布时间】数值（UTC 毫秒，排序/取早期用）；拿不到返回 0 */
export function pubMsOf(it) {
  if (!it) return 0;
  for (const v of [it.pubMs, it.whenMs, anyToMs(it.when), anyToMs(it.pubAt)]) {
    if (typeof v === 'number' && isFinite(v) && v > 0) return v;
  }
  return 0;
}

/**
 * 条目属于【哪一个帖子】—— 用来避免把"同一个帖子的多张票"当成标题重复删掉。
 * （一个帖子往往晒 3~6 张票，标题一模一样 ⇒ 只按标题合并会把 6 张砍成 1 张，
 *   那是【误合并】，用户要的是"有多少放多少"。）
 * 优先级：group_id/item_id > 帖子链接里的 id > 标题+发布时间。
 * @param {object} it
 * @returns {string} 空串 = 认不出帖子（调用方跳过标题规则）
 */
export function postKeyOf(it) {
  if (!it) return '';
  const pid = String(it.postId || '').trim();
  if (pid) return 'g' + pid;
  const u = String(it.url || '').trim();
  if (u) {
    const m = /\/(?:item|group|article|a|video|w)\/(\d{6,})/.exec(u);
    if (m) return 'g' + m[1];
    return 'u' + u.replace(/^https?:\/\//i, '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  }
  /* 没有帖子链接（一起彩那 8 个彩种）→ 用「标题前 16 字 + 发布时间」当帖子身份：
       同一个帖子的多张票 = 同标题 + 同一发布时间 → 不合并（保住多图）；
       两个不同帖子（发布时间不同）→ 会合并（这才是用户要的那条）。 */
  const tk = titleKey(it.title);
  return tk ? ('t' + tk + '@' + pubMsOf(it)) : '';
}

/**
 * ============================================================
 * 【加强去重】在"按完整 URL 去重"之上再加的两层（两个抓取脚本共用）
 * ============================================================
 *  ① 图片指纹：同一张图的不同尺寸/签名/CDN 节点变体 → 只留一条，
 *     留【尺寸最大的那张】（拿不到尺寸 → 留【先出现的】）；
 *     缩略图仍取组里【最小】的那张（网格省流量），原图/大图用最大的那张。
 *  ② 标题相似度：前 16 字相同且【不是同一个帖子】→ 只留一条，
 *     留【发布时间最早】的那条（那是原始帖子）。
 * ⚠️ 现有"按完整 URL 去重"由调用方的 bucket 负责，本函数不碰它。
 * ⚠️ 必须在 slice(上限) 【之前】调用 —— 去重腾出的名额给窗口内其他条目。
 * @param {Array} list  已经过滤/排序好的条目
 * @param {object} [stat] 计数对象（累加 imgDup / titleDup）
 * @returns {Array} 去重后的新数组（组内被合并的条目不再出现）
 */
export function dedupeItems(list, stat) {
  const st = stat || {};
  const src = Array.isArray(list) ? list : [];
  const px = (it) => {
    const p = Number(it && it.px);
    return (isFinite(p) && p > 0) ? p : imgSizeScore(it && it.img);
  };

  /* ---------- ① 图片指纹 ---------- */
  const order = [];
  const groups = new Map();
  for (const it of src) {
    const fp = imgFingerprint(it && it.img);
    const key = fp || ('\u0000' + order.length);      /* 指纹取不到 → 各自独立成组 */
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key).push(it);
  }
  const stage = [];
  for (const key of order) {
    const g = groups.get(key);
    if (g.length === 1) { stage.push(g[0]); continue; }
    /* 留尺寸最大的；尺寸一样/都拿不到 → 留【先出现的】 */
    let win = g[0], winPx = px(g[0]);
    for (let i = 1; i < g.length; i++) {
      const p = px(g[i]);
      if (p > winPx) { win = g[i]; winPx = p; }
    }
    const merged = Object.assign({}, win);
    for (const it of g) {
      if (it === win) continue;
      /* 丢掉的只是同一张图的另一个变体 —— 字段有缺就补上，信息不丢 */
      if (!merged.title) merged.title = it.title || '';
      if (!merged.url) merged.url = it.url || '';
      if (!merged.author) merged.author = it.author || '';
      if (!merged.issue) merged.issue = it.issue || '';
      if (!merged.postId) merged.postId = it.postId || '';
      if (Array.isArray(it.games)) merged.games = [...new Set((merged.games || []).concat(it.games))];
      const a1 = Date.parse(String(merged.at || '')) || 0;
      const a2 = Date.parse(String(it.at || '')) || 0;
      if (a2 && (!a1 || a2 < a1)) { merged.at = it.at; merged.atMs = a2; }     /* at 保留最早那次 */
      const s1 = Date.parse(String(merged.seen || '')) || 0;
      const s2 = Date.parse(String(it.seen || '')) || 0;
      if (s2 > s1) { merged.seen = it.seen; merged.seenMs = it.seenMs; }       /* seen 取最近那次 */
    }
    /* 缩略图用组里【最小】的那张（网格里显示小图），img/big 是最小的那张的对立面：
       merged.img 已经是"尺寸最大的那张"（用户要「看清票面」）。 */
    let small = null, smallPx = 0;
    for (const it of g) {
      const p = px(it);
      if (p > 0 && (!small || p < smallPx)) { small = it; smallPx = p; }
    }
    if (small && small.thumb) merged.thumb = small.thumb;
    merged.imgPx = winPx || 0;
    merged.dedupeImgs = g.length;                       /* 便于报告/排查 */
    st.imgDup = (st.imgDup || 0) + (g.length - 1);
    stage.push(merged);
  }

  /* ---------- ② 标题相似度（前 16 字） ---------- */
  const out = [];
  const idxOf = new Map();          /* titleKey → out 里的下标 */
  const posts = new Map();          /* titleKey → Set(postKey)：这个标题已经出现过哪些帖子 */
  for (const it of stage) {
    const tk = titleKey(it && it.title);
    const pk = postKeyOf(it);
    /* ⚠️ 无标题（tk 空）→ 跳过这条规则（无标题的绝不互相合并） */
    if (!tk || !pk) { out.push(it); continue; }
    if (!idxOf.has(tk)) { idxOf.set(tk, out.length); posts.set(tk, new Set([pk])); out.push(it); continue; }
    const seenPosts = posts.get(tk);
    /* 同一个帖子的另一张票 → 保留（一个帖子晒 6 张票就是 6 条，不能砍） */
    if (seenPosts.has(pk)) { out.push(it); continue; }
    /* 不同帖子、标题前 16 字相同 → 视为同一条：留【发布时间最早】的 */
    seenPosts.add(pk);
    st.titleDup = (st.titleDup || 0) + 1;
    const i = idxOf.get(tk);
    const cur = out[i];
    const tIt = pubMsOf(it), tCur = pubMsOf(cur);
    if (tIt && (!tCur || tIt < tCur)) {
      const keepIt = Object.assign({}, it);
      if (!keepIt.url) keepIt.url = cur.url || '';
      if (!keepIt.thumb) keepIt.thumb = cur.thumb || '';
      if (!keepIt.big) keepIt.big = cur.big || '';
      if (!keepIt.author) keepIt.author = cur.author || '';
      if (Array.isArray(cur.games)) keepIt.games = [...new Set((keepIt.games || []).concat(cur.games))];
      const a1 = Date.parse(String(keepIt.at || '')) || 0;
      const a2 = Date.parse(String(cur.at || '')) || 0;
      if (a2 && (!a1 || a2 < a1)) { keepIt.at = cur.at; keepIt.atMs = a2; }   /* at 仍保留最早那次 */
      out[i] = keepIt;
    }
  }
  return out;
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
  /* 【图片指纹】本页内去重用：fp → items 里的下标（"本页内按完整 URL 去重"仍然保留） */
  const fpSeen = new Map();
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
    /* 【帖子身份】group_id（微头条）/ item_id（文章）—— 标题相似度去重要用它
       区分"同一个帖子的多张票"和"两个帖子标题撞车"（见 postKeyOf）。 */
    const postId = String(d.group_id || d.item_id || d.groupId || d.itemId || '');
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

    const mk = (u) => ({
      img: u,                                     /* 缩略（450 宽，实测 21 KB） */
      thumb: u,
      big: big || u,                              /* 点开放大用的（960 宽） */
      title,
      url: link,
      at: atIso,
      src: C.src || 'tt',
      cat: C.key,
      game: gameOf(title),
      /* 【分发到各彩种】认出来的【所有】彩种 key（可能多个）。
         tt 分类用 gamesOfTitle（数字彩）；jc 分类没有彩种可分发，给空数组。 */
      games: (C.key === TT_KEY) ? gamesOfTitle(title) : [],
      /* 【时效】期号 + 本轮抓取时间（后面的中间处理会补 drawAt / expireAt） */
      issue: (C.key === TT_KEY) ? issueOfTitle(title) : '',
      seen: atIso,
      /* 【数值时间戳】排序必须用数值（用户要求倒序），见 whenToMs / sortTimeMs 的说明 */
      whenMs: whenToMs(when),
      seenMs: Date.parse(atIso) || null,
      author,
      when,
      /* 【帖子身份 / 图片尺寸】给"加强去重"用（dedupeItems / postKeyOf） */
      postId,
      px: imgSizeScore(u)
    });

    for (const u of use) {
      if (items.some((x) => x.img === u)) continue;   /* 本页内去重（按完整 URL，保留） */
      /* 【本页内指纹去重】同一张图的不同尺寸/签名变体 → 只留【尺寸最大的】那张 */
      const fp = imgFingerprint(u);
      if (fp && fpSeen.has(fp)) {
        const i = fpSeen.get(fp);
        if (imgSizeScore(u) > imgSizeScore(items[i].img)) items[i] = mk(u);
        continue;
      }
      if (fp) fpSeen.set(fp, items.length);
      items.push(mk(u));
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
  const stat = { kept: 0, dropped: 0, dupes: 0, added: 0, dropDraw: 0, dropCap: 0, dropPub: 0, pubFallback: 0, dropNoTicket: 0, dropOcr: 0, dropJcPlain: 0, imgDup: 0, titleDup: 0 };

  const push = (it, isFresh) => {
    const img = it && it.img ? String(it.img) : '';
    if (!img) return;
    const at = String(it.at || '');
    const t = Date.parse(at);
    if (!isFinite(t)) return;
    if (t < cutoff) { stat.dropped++; stat.dropCap++; return; }   /* 超过保留窗口 → 丢 */

    /* 【迁移】老数据（第一版做"独立 tt 分类"时写的）里没有 games 字段，
       或者缓存文件是旧版脚本写的 —— 这里按标题【补算】一次彩种归属，
       不然这些条目永远只会留在「头条晒票」聚合里，分发不出去。
       （实测踩过：只做"并集"不够，因为老条目的 games 是 undefined。） */
    let games = Array.isArray(it.games) ? it.games.slice() : null;
    if (!games && C.key === TT_KEY) games = gamesOfTitle(it.title);
    const gs = games || [];

    /* ============================================================
       【必须是"晒票"：图里得真有一张票】用户原话：「晒票是指 一定出现了票」
       ------------------------------------------------------------
       实测（2026-10-16，抽 20 张实际抓到的图肉眼判）：
         · 16 张是真实票面照（超级大乐透/排列3/排列5，票面能看清期号+金额）
         · 4 张【不是票】：一条"女子花228元买景区门票，附赠的彩票中了770万"
           的新闻，配图是景区兑奖现场照片（有人物/横幅，没有票面）
         · 真票图占比 = 80%
       而且这 4 张（以及同类）的【标题里认不出任何彩种】——
       实测：21 条"无彩种归属"的条目里，全是这类新闻/购物晒单
       （「女子…景区门票…」「买微星 X 系列外设晒单即有奖」「Apple 18 Pro 晒单」），
       而【6 条"像新闻"的条目全部无彩种、0 条误杀】。
       ⇒ 所以规则：头条条目【必须能认出彩种】才收。
         · 会不会误杀真票？会一点点 —— 标题没提彩种名的真票会被丢。
           但这类帖子的图本来就常是"合集/无关图"，宁可不要（用户要的是"一定有票"）。
         · 认不出彩种的条目【不会破坏聚合栏】：它们只是不进 games.tt，
           日志里会打印丢了多少条。
         ⚠️ 为什么不用 OCR 判"图里有没有票"：见文件末尾的实测记录
            （10 张里只读出 4 张日期 / 5 张期号，还要 3.6 秒一张）。
       ============================================================ */
    if (C.key === TT_KEY && !gs.length) { stat.dropped++; stat.dropNoTicket = (stat.dropNoTicket || 0) + 1; return; }

    /* 【竞彩/足球：挡掉"普通图"】用户要求「队徽/球员照/比赛页截图/赛事海报都不要」。
       规则见 jcIsTicketLike 的说明（新闻站来源 + 标题必须像"票/推单"）。 */
    if (C.key === JC_KEY) {
      const v = jcIsTicketLike(it.title, it.url);
      if (!v.ok) { stat.dropped++; stat.dropJcPlain = (stat.dropJcPlain || 0) + 1; return; }
    }

    /* ============================================================
       【票图校验的第二道闸】这里再过一遍 OCR 判定缓存。
       ------------------------------------------------------------
       ⚠️ 两个分类的【宽严不同】，这是实测出来的，别统一：
         · 彩票类 tt：只挡【确认不是票】(false)。
           "读不出字"(null) 【保留】—— 实测把 null 当假图会误删真票
           （上线第一版就这么干，误删 7 张，后来救回 22 张）。
         · 竞彩 jc：必须【确认是票】(true)，也就是 OCR 得读到
           彩票词或 3 位以上数字；null 一律丢。
           为什么竞彩可以更严（实测依据）：
             竞彩里混进来的"足球普通图"（比赛现场照 / 球员照 / 赛场足球图）
             OCR 全都读不出字（全是草皮和人，没文字）；
             而真正的竞彩票 / 推单截图 OCR 都能读到数字
             （实测：9 张真票全是 digits/keyword，19 张读不出字的
               全是"胜负彩143期深度拆解"那类分析帖的比赛配图）。
           代价：少数拍得很糊的真票会被丢 —— 但用户明确说
             「宁可少，不可假」「队徽球员照都不要」，所以这个方向是对的。
       ============================================================ */
    if (C.key === TT_KEY) {
      const cv = cachedVerdict(img);
      /* 彩票类：只有【确认不是票】才丢；null（读不出字）保留 —— 见上面长注释 */
      if (cv && cv.ok === false) { stat.dropped++; stat.dropOcr = (stat.dropOcr || 0) + 1; return; }
    } else if (C.key === JC_KEY) {
      /* 竞彩：必须【确认是票】(true) 才留 —— false / null 都挡。
         实测（2026-10-17）：26 条里 20 条从没被判过（null），旧规则让它们
         全部穿过这道闸；改成"必须 true"后，没判定的图一律不进文件。
         理由见 verify-ticket.mjs 的 jcVerdictStrict。 */
      const jv = jcVerdictStrict(img);
      if (jv !== true) { stat.dropped++; stat.dropJcPlain = (stat.dropJcPlain || 0) + 1; return; }
    }

    /* 【时效】本轮"看到"的时间：新条目 = 现在；老条目沿用它自己的 seen。
       （没有 seen 的老数据退回用 at —— 那是它第一次被抓到的时间） */
    const seenMs = Date.parse(String(it.seen || '')) || t;
    /* 帖子发布时间（头条的 datetime）：用来判"这条属于哪一期" */
    const pubMs = Date.parse(String(it.when || '')) || null;

    /* 【开奖后 1 小时】规则 —— 只有彩票类（tt）走；竞彩不做这条（见 JC_KEEP_HOURS 说明） */
    let ex = { expireAt: seenMs + keepHours * 3600 * 1000, drop: false, drawAt: null, nextAt: null, rule: 'cap', gid: '' };
    if (C.useDrawRule) ex = expireOf({ games: gs, publishMs: pubMs }, seenMs, nowMs, keepHours);

    /* ============ 时效规则（按分类不同） ============
       彩票类 tt（双色球/大乐透/3D…）—— 两条都要满足：
         ① 帖子发布时间在【24 小时】内
         ② 期次未开奖，或开奖后 <= 1 小时（= 现在还在「下一次开奖 + 1 小时」之前）
       竞彩 jc —— 只一条：
         ① 帖子发布时间在【72 小时】内（用户 2026-10-16 决定放宽，选 B）
         ⚠️ 竞彩【不套用】期次/开奖规则：标题里没有比赛时间、票面图要 OCR 才能
            知道比赛，没有可靠数据能判"比赛开完没有"。理由详见 JC_KEEP_HOURS 段。
       ⚠️ 两条都要满足的那种分类里，②更严：一条 12 小时前发的票，
          如果它那一期已经开完超过 1 小时，照样丢掉
          （用户先说"开完奖的过一小时就自动不要了"，后说"24 小时内晒出来的"，
            后者是补充缩小范围，不是放宽前者）。
       ⚠️ 拿不到发布时间（头条 datetime 没解析出来）→ 【不丢】，
          退回用抓取时间当发布时间（pubSrc='at'），只受兜底窗口约束。
          绝不能因为少个时间字段就让整栏空掉。
       ================================================================ */
    const pubHours = C.pubHours || 24;
    const pubCutoff = nowMs - pubHours * 3600 * 1000;
    if (pubMs !== null && pubMs < pubCutoff) { stat.dropped++; stat.dropPub++; return; }
    if (pubMs === null) stat.pubFallback++;

    /* 属于已开的那一期、且开完超过 1 小时 → 直接丢（只有彩票类有这条） */
    if (ex.drop) { stat.dropped++; stat.dropDraw++; return; }
    /* 兜底窗口（从"最近一次看到它"起算）。
       ⚠️ 最上面那个 `t < cutoff` 已经拦过一次（按【首次抓到】算），
          这里再按【最近看到】算一遍 —— 两者取更严的，双保险，都是 dropCap。 */
    if (nowMs >= ex.expireAt) { stat.dropped++; stat.dropCap++; return; }

    const prev = bucket.get(img);
    if (prev) {
      stat.dupes++;
      prev.title = it.title || prev.title;
      prev.thumb = it.thumb || prev.thumb;
      prev.big = it.big || prev.big;
      prev.url = it.url || prev.url;
      prev.game = it.game || prev.game;
      /* 【彩种归属取并集】：老数据可能只认出 1 个彩种、新解析认出 2 个，
         并起来才不会因为"哪一轮先跑"而丢分类。 */
      if (gs.length) {
        const set = new Set(Array.isArray(prev.games) ? prev.games : []);
        gs.forEach((k) => set.add(k));
        prev.games = [...set];
      }
      if (it.issue) prev.issue = it.issue;
      prev.author = it.author || prev.author;
      prev.when = it.when || prev.when;
      /* 【帖子身份】老数据里可能没有 postId（第一版没存）→ 有就补上，
         标题相似度去重（含"同一帖子多张票不合并"）才判得准。 */
      if (it.postId) prev.postId = it.postId;
      if (typeof it.px === 'number' && (!prev.px || it.px > prev.px)) prev.px = it.px;
      /* seen 取【较晚】那次（我们最近一次看到它是什么时候） */
      if (seenMs > (Date.parse(String(prev.seen || '')) || 0)) prev.seen = new Date(seenMs).toISOString();
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
      /* 认不出彩种 → 空数组（条目仍留在聚合里，不会丢） */
      games: gs,
      /* 【时效字段】用户要求「要会抓时间点」，界面上要显示。存的四个时间点：
           issue   期号（从标题解析出来的）
           when    帖子发布时间（源站 datetime）
           seen    我们最近一次抓到它的时间
           drawAt  该彩种【上一期】开奖时刻
           nextAt  该彩种【下一期】开奖时刻（卡片上显示"距开奖 x 小时"用这个） */
      issue: it.issue || (C.key === TT_KEY ? issueOfTitle(it.title) : ''),
      seen: new Date(seenMs).toISOString(),
      /* 【数值时间戳】—— 排序用（见 sortTimeMs）；同时把 nextAt 统一成【数值】
         ⚠️ 踩过的坑：早先这里存的是 ISO 字符串，而一起彩那条路存的是数值
            （build-xysp.mjs 里 nextDrawAfter 返回 number）→ 同一个字段两种类型。
            现在两边【都存 UTC 毫秒数值】，页面显示时再格式化。 */
      whenMs: (typeof it.whenMs === 'number' && isFinite(it.whenMs)) ? it.whenMs : whenToMs(it.when),
      seenMs,
      drawMs: ex.drawAt || null,
      nextMs: ex.nextAt || null,
      atMs: t,
      drawAt: ex.drawAt ? new Date(ex.drawAt).toISOString() : '',
      nextAt: ex.nextAt || null,
      drawGid: ex.gid || '',
      expireAt: new Date(ex.expireAt).toISOString(),
      rule: ex.rule,
      author: it.author || '',
      when: it.when || '',
      /* 【帖子身份 / 图片尺寸】给 dedupeItems / postKeyOf 用（见那两个函数的说明） */
      postId: it.postId || '',
      px: (typeof it.px === 'number' && it.px > 0) ? it.px : imgSizeScore(img)
    });
    if (isFresh) stat.added++;
  };

  const oldList = (oldData && Array.isArray(oldData.items)) ? oldData.items : [];
  oldList.forEach((it) => push(it, false));
  (Array.isArray(fresh) ? fresh : []).forEach((it) => push(it, true));

  /* 排序：先按 at（最新抓到的在前），再按 expireAt 兜底 */
  /* 【排序】按【发布时间】倒序（最新的在最前）—— 用户明确要求。
     ⚠️ 用 sortTimeMs（数值 UTC 毫秒），不要用 Date.parse(b.at)：
        · at 是"抓到的时间"，不是"发布的时间"；同一条帖子被抓到的时间都一样，
          用它排序等于没排序（实测踩过）。
        · 也不能比 when 字符串："10-15" vs "9-30" 会错。
     同分时用 expireAt 兜底，保证顺序稳定。 */
  const sorted = [...bucket.values()]
    .sort((a, b) => (sortTimeMs(b) - sortTimeMs(a)) ||
      (anyToMs(b.expireAt) || 0) - (anyToMs(a.expireAt) || 0));
  /* ============================================================
     【加强去重】用户要求：只按完整 img URL 去重不够，要再加两层规则。
       · ① 图片指纹（尺寸 / 签名 / CDN 节点变体 → 留【尺寸最大】的那张）
       · ② 标题前 16 字相同且不是同一个帖子（→ 留【发布时间最早】的那条）
     ⚠️ 上面 bucket 那条"按完整 URL 去重"【原样保留】—— 这里是它【之上】的一层。
     ⚠️ 必须在 slice(max) 之前做：去重腾出来的名额留给窗口内其他条目，
        绝不能"重复占了名额"把 24 小时内的内容挤掉（用户红线）。
     ============================================================ */
  const deduped = dedupeItems(sorted, stat);
  const items = deduped.slice(0, max);
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

    /* 【关键词轮换】rotate 是每轮实际抓几个词（不写 = 全抓）。
       轮换用【当前 10 分钟槽位】当游标：同一个槽位每次跑都取同一批词，
       所以「这一轮抓哪几个」是可复现的，不会随机跳来跳去。
       ⚠️ 顺序上，第一个词（晒票）是基线，每轮都要抓 —— 保证"最新那一批"
          一定进来；剩下的词轮换补量。 */
    const allKw = C.searches;
    let picked = allKw;
    if (C.rotate && C.rotate < allKw.length) {
      const base = allKw[0];
      const rest = allKw.slice(1);
      const slots = Math.ceil(rest.length / Math.max(1, C.rotate - 1));
      const slot = Math.floor(now / (10 * 60 * 1000)) % slots;      /* 10 分钟一个槽 */
      const start = slot * (C.rotate - 1);
      const chunk = rest.slice(start, start + (C.rotate - 1));
      picked = [base].concat(chunk.length ? chunk : rest.slice(0, C.rotate - 1));
    }

    log(`  ── ${C.name}（本轮抓 ${picked.length}/${allKw.length} 个关键词 · 发布窗口 ${C.pubHours} 小时 · 兜底 ${C.keepHours} 小时 · 上限 ${C.max}）──`);
    log(`     本轮关键词：${picked.map((x) => x.kw).join(' / ')}`);

    for (let i = 0; i < picked.length; i++) {
      const s = picked[i];
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
    let freshList = [...uniq.values()];
    log(`     小结：本轮 ${picked.length} 个关键词（共 ${allKw.length} 个在轮换）· 解析到 ${freshList.length} 条图片`);

    /* ============================================================
       【票图校验】用户要求「一定出现了票」「乱图片 明星人物图片都不要」
                              「整票百分百」
       这里对【还没校验过的图】跑 OCR，把不是票的挡掉。
       ⚠️ 只校验【缓存里没有的】→ 稳态下每轮只跑几十张。
       ⚠️ 放在 mergeTt 之前：不合格的图根本不进缓存文件，页面自然不会显示。
       判据和实测定参见 verify-ticket.mjs 的说明。

       ⚠️⚠️ 【竞彩必须连"文件里的老图"一起判】实测（2026-10-17）：
       旧版只把【本轮新解析到的图】送去 OCR，于是
         · 上一轮 OCR 抓图/识别报错（出错不写缓存）→ 老图永远没有判定，
         · 上一版脚本写进文件、当时还没有竞彩强判据的图，
       这些图在 mergeTt 里拿到的是 null（"还没判过"）→ 按旧规则【放行】→
       一直留在页面上。真实数据：竞彩 26 条里 20 条从来没被 OCR 判过 ——
       这正是"球员照 / 分析海报还能看到"的根因（不是判据不够严）。
       ⇒ 竞彩这一路：toCheck = 本轮新图 + 文件里所有还没判定的老图。
         只对竞彩放开（jc 体量小，几十张）；彩票类 tt 保持"只判新图"，
         免得一次补判几百张把一轮任务拖长。
       ============================================================ */
    const rec = { key: C.key, name: C.name, file: C.file, fresh: freshList.length, ok: false, kept: 0, ocrChecked: 0, ocrFailed: 0 };
    const file = path.join(ROOT, C.file);
    const oldData = readTtOld(file, C);
    const oldTotal = (oldData && Array.isArray(oldData.items)) ? oldData.items.length : 0;
    const toCheckImgs = [];
    const pendSeen = new Set();
    const addPend = (u) => {
      if (!u || pendSeen.has(u)) return;
      pendSeen.add(u);
      if (!cachedVerdict(u)) toCheckImgs.push(u);     /* 缓存里已有判定就不重复 OCR */
    };
    freshList.forEach((it) => { if (it.__ocrOk !== true) addPend(it.img); });
    if (C.key === JC_KEY) ((oldData && oldData.items) || []).forEach((it) => addPend(it && it.img));
    if (toCheckImgs.length) {
      log(`     🔍 票图校验：本轮新图 ${freshList.length} 张，需要 OCR ${toCheckImgs.length} 张…`);
      const v = await verifyBatch(toCheckImgs, { max: 400, gap: 120 });
      log(`        校验完成：确认是票 ${v.passed} · 确认不是票 ${v.failed} · 读不出字${C.key === JC_KEY ? '' : '(保留)'} ${v.unreadable} · 命中缓存 ${v.cacheHit} · OCR 耗时 ${(v.ms / 1000).toFixed(1)}s`);
      for (const f of v.failedList.slice(0, 6)) log(`          ✗ 确认不是票（${f.why}）：${f.img.slice(50, 104)}`);
      rec.ocrChecked = v.checked; rec.ocrFailed = v.failed; rec.ocrUnreadable = v.unreadable;
    }
    /* 用缓存里的判定结果过滤：
       ⚠️ 只挡【确认不是票】的（cv.ok === false）。
          cv.ok === null（读不出字）和"没判定过"都【放行】——
          用户要的是别放假图，不是把读不出来的真票删掉（实测这样会误删 7 张真票）。
       ⚠️ 竞彩分类例外：它要求【确认是票】(cv.ok === true)，
          读不出字的一律挡掉 —— 依据见 mergeTt 里那段说明。 */
    const beforeOcr = freshList.length;
    freshList = freshList.filter((it) => {
      if (C.key === JC_KEY) {
        /* 【竞彩】必须【确认是票】才留：true 才算过，false/null 都挡。
           null 意味着 OCR 连图都没抓下来/识别崩了 —— 用户要「整票百分百」，
           所以这一路宁缺毋滥（下一轮还会重判，抓图恢复后真票能回来）。
           依据见 verify-ticket.mjs 里 jcVerdictStrict 的实测说明。 */
        return jcVerdictStrict(it.img) === true;
      }
      const cv = cachedVerdict(it.img);
      if (!cv) return true;                                   /* 还没判过 → 放行 */
      return cv.ok !== false;                                 /* 只挡【确认不是票】 */
    });
    rec.ocrDropped = beforeOcr - freshList.length;
    if (rec.ocrDropped) log(`        因"图里不是票"挡掉 ${rec.ocrDropped} 张`);

    if (!freshList.length) {
      /* 这一分类零条 —— 不是致命错误：另一个分类可能好着。
         保留上一次的这个文件，继续跑下一个分类。 */
      log(`     ⚠️ ${C.name} 本轮零条 → 保留上一次的 ${C.file}`);
      perCat.push(rec);
      continue;
    }

    /* 合并旧数据 + 过期 + 去重 + 上限（oldData 已在上面读好，这里复用） */
    const { items, stat } = mergeTt(oldData, freshList, now, C);

    const data = { updated: stamp(new Date(now)), items };
    const text = ttFileText(data, C);
    fs.writeFileSync(file, text, 'utf8');

    log(`     ✅ 已写入 ${C.file}（${(Buffer.byteLength(text, 'utf8') / 1024).toFixed(1)} KB）`);
    log(`        旧数据 ${oldTotal} 条 → 合并后 ${stat.kept} 条` +
      `（丢弃 ${stat.dropped} 条 [发布超 ${C.pubHours}h ${stat.dropPub} · 开奖超 1 小时 ${stat.dropDraw} · 兜底超时 ${stat.dropCap}${stat.dropNoTicket ? ` · 认不出彩种(非票图) ${stat.dropNoTicket}` : ''}${stat.dropOcr ? ` · 图里没有票 ${stat.dropOcr}` : ''}${stat.dropJcPlain ? ` · 足球普通图 ${stat.dropJcPlain}` : ''}]` +
      ` · 去重合并 ${stat.dupes} 条 · 本轮新加入 ${stat.added} 条` +
      ` · 【加强去重】图片指纹 ${stat.imgDup} 条 · 标题相似 ${stat.titleDup} 条` +
      ` · 发布时间取不到 ${stat.pubFallback} 条）`);
    if (C.key === TT_KEY) {
      const withIssue = items.filter((x) => x.issue).length;
      const withDraw = items.filter((x) => x.drawAt).length;
      const withPub = items.filter((x) => x.seen && x.when).length;
      log(`        时效：认出期号 ${withIssue}/${items.length} 条 · 有开奖时刻 ${withDraw} 条` +
        ` · 有源站发布时间 ${withPub} 条（开奖时刻表来自 ${DRAW.from}）`);
    }
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
