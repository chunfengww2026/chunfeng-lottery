/* ============================================================
   build-xysp.mjs —— 抓「晒票」图片，产出 xysp-data.js
   ------------------------------------------------------------
   为什么要这个（用户原话）：
     「做。一直循环抓取24小时内的 保留24小时内的图片」
     背景：微信把 yiqicai.com 拉黑了，点链接跳过去打不开
           → 所以要把图片抓到【我们自己的页面】上直接显示。

   抓什么（手机版，服务端渲染，8 个彩种各一页，实测全部 HTTP 200）：
     https://m.yiqicai.com/xysp/ssqxysp   双色球
     https://m.yiqicai.com/xysp/dltxysp   大乐透
     https://m.yiqicai.com/xysp/fc3dxysp  福彩3D
     https://m.yiqicai.com/xysp/klbxysp   快乐8
     https://m.yiqicai.com/xysp/pl3xysp   排列3
     https://m.yiqicai.com/xysp/pl5xysp   排列5
     https://m.yiqicai.com/xysp/xqxcxysp  七星彩
     https://m.yiqicai.com/xysp/qlcxysp   七乐彩

   页面真实结构（实测）——一条晒票就是一块：
     <div class="lucky-tickets-x">
       <div class="lucky-user">
         <dl class="lucky-info">
           <dt class="lucky-name">昵称</dt>
           <dd class="lucky-msg-txt">10-15 22:37</dd>      ← 源站发布时间
         </dl>
       </div>
       <div class="lucky-msg">[26119期]中5块</div>          ← 描述（当标题用）
       <div class="lucky-pics">
         <img src="http://img02.17chdd.com/2026-10-15/xxx.jpg?width=814&amp;height=1800">
         ...（一条可能有 1~3 张图）
       </div>
     </div>
   只取 lucky-pics 里的图 —— 头像 / 广告 / 站标都在这个 div 外面，
   所以不会混进来。

   【图片不下载】图床没有防盗链（实测：不带 Referer / 带 m.yiqicai.com /
   带 github.io 三种都是 HTTP 200 + 真 JPEG + 字节数完全相同），
   而且支持 ?imageMogr2/thumbnail/360x 缩略（192377 B → 52104 B，
   Content-Type 还会被修正成 image/jpeg）。
   ⇒ 页面里只写【外链 URL】，所以页面体积几乎不变大。
   注意：图床是 http 的，但 https 同样能取（实测 200）
        → 一律写成 https，避免 https 页面被浏览器当混合内容拦掉。

   产出 xysp-data.js：
     const XYSP_DATA = {
       updated: '2026-10-16 03:30',
       games: {
         ssq: { name: '双色球', items: [ { img, thumb, title, url, at } ] },
         ...
         tt:  { name: '头条晒票', items: [ { img, thumb, title, url, at, src, game } ] }
       }
     };
     · at    = 这条晒票的【抓取时间】(ISO)，用于 72 小时过滤
     · img   = 原图 URL（点开看大图用）
     · thumb = 缩略图 URL（一起彩用 ?imageMogr2/thumbnail/360x）
     · url   = 详情页 URL；一起彩列表页每条没有独立详情页 ⇒ 留空
     · tt    = 【今日头条】的晒票（见下）

   ── 【头条晒票】（games.tt）怎么进来的
     本文件【不自己抓头条】。分工写死，避免两个进程互相覆盖同一个文件：
       · build-xysp-tt.mjs  → 抓头条 → 写 xysp-tt-data.js（头条专属缓存）
       · 本文件             → 【唯一】写 xysp-data.js 的人；
                              跑的时候 readTtOld() 读 xysp-tt-data.js，
                              用 mergeTt() 合进 games.tt
     ⇒ 头条没抓到 / 文件不存在时，本文件照常跑，games.tt 保持旧的那份
       （头条那 60 条不会因为一起彩成功就被清空，反过来也一样）。
     ⚠️ 头条图【不能】拼 ?imageMogr2/thumbnail/360x：
       头条 URL 本来就带 query，再拼一个 '?' 会变成第二个 '?'
        → 验签失败 HTTP 403（实测）。缩略图直接用头条自带的 :450:294 变体
        （21 KB）。thumbOf() 里已经加了保护，不给头条图拼参数。

   【保留 72 小时】不是每次覆盖清空，而是：
     1) 先读旧的 xysp-data.js
     2) 把新抓到的并进去（同一个 img 只留一条，保留【最早】的 at）
     3) 丢掉 at 早于 72 小时的
     4) 每个彩种只留最新的 MAX_PER_GAME 条（头条单独 TT_MAX 条）
   ⇒ 每 30 分钟跑一次 + 72 小时自动过期 = 用户要的「一直循环、只留 72 小时」。

   安全 / 省成本：
     · 正常手机 User-Agent；8 个页面，请求间隔 >= 1.2s
     · 失败退避（照 update-football-smart.mjs 那套）：连续 N 轮全失败就停 2 小时
     · 抓不到不崩、也【不覆盖】上一次的 xysp-data.js（退出码 10）
     · 一律 UTF-8 无 BOM；绝不请求任何 AI，不涉及任何 token（0 token）
     · 只在这里用 fetch；生成的页面里没有任何抓取逻辑

   退出码：
     0  = 抓到并写入了新的 xysp-data.js（调用方可以继续出页面 + 同步）
     10 = 本轮跳过（退避中 / 抓不到）—— 保留上一次的数据，调用方别同步
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* 【头条晒票】只要它里面的合并/读取函数 —— import 是【没有副作用】的
   （build-xysp-tt.mjs 的抓取主流程有 isDirectRun() 关卡，
     被 import 时不会发请求、不会 exit）。 */
import { mergeTt, readTtOld, TT_KEY, TT_NAME, TT_MAX, JC_KEY, JC_NAME, JC_MAX, JC_KEEP_HOURS, catByKey, nextDrawAfter, sortTimeMs, whenToMs, anyToMs,
  /* 【加强去重】两层去重规则都写在 build-xysp-tt.mjs 里（两边共用同一份实现，
     避免"两个脚本各写一套、规则慢慢跑偏"）。见那些函数的说明。 */
  dedupeItems, imgFingerprint, imgSizeScore, titleKey, normTitle, titlesSimilar, postKeyOf, pubMsOf } from './build-xysp-tt.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'xysp-data.js');
const LOG = path.join(ROOT, '_xysp.log');
const STATE = path.join(ROOT, '_xysp-backoff.json');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/* 8 个彩种（顺序 = 页面上筛选按钮的显示顺序） */
const GAMES = [
  { key: 'ssq',  name: '双色球', url: 'https://m.yiqicai.com/xysp/ssqxysp' },
  { key: 'dlt',  name: '大乐透', url: 'https://m.yiqicai.com/xysp/dltxysp' },
  { key: 'fc3d', name: '福彩3D', url: 'https://m.yiqicai.com/xysp/fc3dxysp' },
  { key: 'kl8',  name: '快乐8',  url: 'https://m.yiqicai.com/xysp/klbxysp' },
  { key: 'pl3',  name: '排列3',  url: 'https://m.yiqicai.com/xysp/pl3xysp' },
  { key: 'pl5',  name: '排列5',  url: 'https://m.yiqicai.com/xysp/pl5xysp' },
  { key: 'qxc',  name: '七星彩', url: 'https://m.yiqicai.com/xysp/xqxcxysp' },
  { key: 'qlc',  name: '七乐彩', url: 'https://m.yiqicai.com/xysp/qlcxysp' }
];

/* 【发布时间窗口】用户要求（新）：
   「所有的晒票 不管是彩票还是足球 都抓取24小时内晒出来的票」
   ⇒ 一起彩这 8 个彩种：只看【帖子发布时间】在 24 小时内的。
   （发布时间从页面上的 lucky-msg-txt 解析，实测格式 "10-15 22:37"）
   ⚠️ 这条【取代】了以前那个 KEEP_HOURS=72 的抓取时间窗口，也取代了
      "七星彩/七乐彩 不受 24 小时限制" 那个老特例 —— 现在所有彩种一视同仁。 */
const PUB_HOURS = 24;
/* 每个彩种最多留几条 —— 【只是防爆，不砍窗口内的内容】。
   用户强调：「有多少放多少 要内容多」+「24小时以内抓取的全部都在呈现出来」。
   ⚠️ 以前是 40。实测（2026-10-16）：单页实际 10~35 条，没撞到过，
      但"没撞到过"不等于安全 —— 源站某天多放几张就会被砍。
      现在放到 1000：
        · 一起彩 8 个彩种单页实测各 10~35 条 → 1000 是 30~100 倍余量
        · 8 个彩种全满 1000 也不可能（源站一页就给几十条）
        · 真撞到上限会在日志里【明确打印警告】（见主流程），不会静默砍 */
const MAX_PER_GAME = 1000;
/* 两个页面之间至少隔这么久（保护数据源） */
const GAP_MS = 1200;

/* 失败退避（写法照 update-football-smart.mjs） */
const FAIL_PAUSE_AFTER = 6;    // 连续全失败这么多次 → 暂停
const PAUSE_MINUTES = 120;     // 暂停时长（分钟）

const log = (m) => {
  const line = `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${m}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n', 'utf8'); } catch (e) { /* 忽略 */ }
};

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 小工具 ---------- */
const stripTags = (s) => String(s).replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim();

/**
 * 规范化一张晒票图片的 URL：
 *   · 把 HTML 实体还原（源页里是 &amp;height=…）
 *   · 去掉 ?width=…&height=… 那串显示尺寸参数（保留它反而干扰缩略参数）
 *   · 一律换成 https（图床 http/https 都能取；页面是 https，必须用 https，
 *     否则浏览器按「混合内容」直接拦截，图就白了）
 * 不是 http(s) 的（比如站内 /images/logo.png）一律返回空串
 * @param {string} raw 原始 src
 * @returns {string} 规范化后的 URL，认不出来返回空串
 */
function normImg(raw) {
  let u = String(raw || '').trim().replace(/&amp;/gi, '&');
  if (!/^https?:\/\//i.test(u)) return '';
  if (!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) return '';
  const q = u.indexOf('?');
  if (q >= 0) u = u.slice(0, q);
  u = u.replace(/^http:\/\//i, 'https://');
  return u;
}

/** 缩略图 URL：一起彩图床支持 imageMogr2，拿不到就退回原图（页面里 onerror 还会再兜一层）
    ⚠️ 【只给一起彩的图拼参数】：头条的 URL 本来就带 query，
       再拼一个 '?' 会变成第二个 '?' → 验签失败 HTTP 403（实测）。
       头条的缩略图是它自己给的 :450:294 变体，已经在 it.thumb 里了。 */
function thumbOf(img) {
  if (!img) return '';
  if (!/(^https?:\/\/)?[a-z0-9.\-]*17chdd\.com/i.test(img)) return img;
  return img + '?imageMogr2/thumbnail/360x';
}

/* ============================================================
   【发布时间】从一起彩的 lucky-msg-txt 解析
   ------------------------------------------------------------
   实测（2026-10-16）：每条晒票里都有
     <dd class="lucky-msg-txt">10-15 22:37</dd>
   —— 这就是【源站的发布时间】，格式固定 "MM-DD HH:MM"（没有年份）。
   用户要求（新）：「所有的晒票 不管是彩票还是足球 都抓取24小时内晒出来的票」
   ⇒ 拿它当 pubAt；拿不到就退回 at（抓取时间）—— 见 mergeAndPrune 的说明。
   年份推定：先按【当前年】；若算出来比"现在"晚了一天以上，说明跨年了 → 退一年。
   @returns {number|null} epoch ms，认不出返回 null
   ============================================================ */
function parsePubAt(b, atIso, nowMs) {
  const m = /<dd class="lucky-msg-txt"[^>]*>\s*(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/.exec(b);
  if (!m) return null;
  const [, mm, dd, hh, mi] = m;
  const base = new Date(nowMs);
  /* 用北京时间的那一天做基准（源站显示的是北京时间） */
  const bj = new Date(nowMs + 8 * 3600 * 1000);
  let t = Date.UTC(bj.getUTCFullYear(), Number(mm) - 1, Number(dd), Number(hh) - 8, Number(mi), 0, 0);
  if (t - nowMs > 24 * 3600 * 1000) t -= 365 * 24 * 3600 * 1000;   /* 跨年 → 退一年 */
  return isFinite(t) ? t : null;
}

/* ============================================================
   解析一个彩种页 → 条目数组
   ============================================================ */
function parsePage(html, atIso, nowMs) {
  const items = [];
  const now = nowMs || Date.parse(atIso) || Date.now();
  /* 【图片指纹】本页内去重用：fp → items 里的下标
     （原来那条"本页内按完整 URL 去重"保留，指纹是它上面再加的一层） */
  const fpSeen = new Map();
  let postIdx = 0;
  /* 一条晒票 = 从 <div class="lucky-tickets-x"> 开始的那一块。
     直接按这个开头切：每一段里【第一次】出现的 lucky-msg / lucky-pics
     就一定是这一条的（两者都排在块内很靠前的位置），
     所以不需要去猜块在哪里结束，也不会把下一段的内容混进来。 */
  const parts = String(html).split('<div class="lucky-tickets-x"');
  parts.shift();                       // 第一个元素是第一条之前的页面头

  for (const b of parts) {
    /* 描述（有什么抓什么；源站每条都有这一句） */
    const msgM = /<div class="lucky-msg"[^>]*>([\s\S]*?)<\/div>/.exec(b);
    const title = msgM ? stripTags(msgM[1]).slice(0, 120) : '';

    /* 【发布时间】源站页面上就有 —— 实测 "10-15 22:37" */
    const pub = parsePubAt(b, atIso, now);

    /* 图片：只认 lucky-pics 这个 div 里的（头像/广告都在它外面） */
    const picsM = /<div class="lucky-pics"[^>]*>([\s\S]*?)<\/div>/.exec(b);
    if (!picsM) continue;

    /* 【帖子身份】一条 lucky-tickets-x 块 = 一个帖子（一个帖子可能 1~3 张票）。
       标题相似度去重要用它区分"同帖多图"（不合并）和"跨帖标题撞车"（合并）。
       ⚠️ 每轮块的顺序可能变，所以再带上"标题+发布时间"做二次核对（见 postKeyOf）。 */
    const postId = 'yq' + (postIdx++) + ':' + String(pub || '') + ':' + titleKey(title);
    const mk = (img) => ({
      img, thumb: thumbOf(img), title, url: '', at: atIso,
      /* pubAt = 帖子发布时间；pubSrc 记明来源，便于报告/排查 */
      pubAt: pub ? new Date(pub).toISOString() : '',
      pubSrc: pub ? 'page' : 'at',
      pubMs: pub || 0,
      postId,
      px: imgSizeScore(img)
    });

    const IMG = /<img[^>]*\bsrc="([^"]+)"/gi;
    let im = null;
    while ((im = IMG.exec(picsM[1])) !== null) {
      const img = normImg(im[1]);
      if (!img) continue;
      if (items.some((x) => x.img === img)) continue;      // 本页内去重（按完整 URL，保留）
      /* 【本页内指纹去重】同一张图的不同尺寸/签名变体 → 只留【尺寸最大的】那张 */
      const fp = imgFingerprint(img);
      if (fp && fpSeen.has(fp)) {
        const i = fpSeen.get(fp);
        if (imgSizeScore(img) > imgSizeScore(items[i].img)) items[i] = mk(img);
        continue;
      }
      if (fp) fpSeen.set(fp, items.length);
      items.push(mk(img));
    }
  }
  return items;
}

/* ============================================================
   读旧数据 + 合并 + 24 小时过期 + 去重 + 数量上限
   ------------------------------------------------------------
   独立成函数，方便验收脚本直接拿假数据调它。
   ============================================================ */
function mergeAndPrune(oldData, freshByGame, nowMs) {
  const cutoff = nowMs - PUB_HOURS * 3600 * 1000;      /* 24 小时：看【发布时间】 */
  const games = {};
  const stat = { kept: 0, dropped: 0, dupes: 0, added: 0, dropPub: 0, dropDraw: 0, dropCap: 0, pubFallback: 0, imgDup: 0, titleDup: 0 };

  for (const g of GAMES) {
    const bucket = new Map();          // img → 条目（保留最早的 at）

    const push = (it, count) => {
      const img = it && it.img ? String(it.img) : '';
      if (!img) return;
      const at = String(it.at || '');
      const t = Date.parse(at);
      if (!isFinite(t)) return;

      /* ============ 用户要求的两条时效规则（两条都要满足） ============
         ① 【发布时间在 24 小时内】—— 用户原话：
            「所有的晒票 不管是彩票还是足球 都抓取24小时内晒出来的票」
         ② 【期次未开奖，或开奖后 <= 1 小时】—— 见 build-xysp-tt.mjs 的 expireOf

         ⚠️ 拿不到发布时间怎么办（这里的关键决定）：
            一起彩页面上【有】发布时间（lucky-msg-txt = "10-15 22:37"），
            所以正常情况下走 ①。万一某条解析不出时间：
              · 【不丢】—— 绝不能因为少个时间字段就把整个彩种清空（用户红线）
              · 退回用【抓取时间 at】当发布时间（pubSrc='at'）——
                我们刚抓到它，所以它必然过 ①；真正的清理交给
                at + 24 小时的下限（老数据到点自然掉出去）。
              · 为什么要下限：一条条目会一直被重新抓到（at 保留最早那次），
                所以"最早抓到的时间 + 24 小时"就是它的最长期限，
                不会出现某条永远赖着不走。
            ⚠️ 注意：这里【不能】直接用 at 判 24 小时 ——
                at 是"我们第一次抓到它"的时间，不是帖子发布时间；
                源站上一条 3 天前发的票，我们第一次抓到也会是"现在"。
                所以【有 pubAt 就必须用 pubAt】。
         ================================================================ */
      const pubRaw = String(it.pubAt || '');
      let pubMs = Date.parse(pubRaw);
      if (!isFinite(pubMs)) {
        const fb = Number(it.pubMs);
        pubMs = isFinite(fb) && fb > 0 ? fb : 0;
      }
      let pubSrc = it.pubSrc || '';
      if (!pubMs) { pubMs = t; pubSrc = 'at'; stat.pubFallback++; }   /* 退回抓取时间 */
      if (pubSrc !== 'at' && pubMs < cutoff) { stat.dropped++; stat.dropPub++; return; }

      /* 条目本身的兜底下限：最早抓到的时间 + 24 小时 */
      if (t < cutoff) { stat.dropped++; stat.dropCap++; return; }

      const prev = bucket.get(img);
      if (prev) {
        /* 同一个 img 只留一条：at 保留【最早】那次，其余字段用最新的 */
        stat.dupes++;
        prev.title = it.title || prev.title;
        prev.thumb = it.thumb || prev.thumb;
        prev.url = it.url || prev.url;
        /* 【发布时间取"有就更新"】—— 老数据里没有 pubAt（第一版没存这个字段），
           新抓到的同一条带着 pubAt 时必须补进去，
           否则 24 小时发布规则对它们永远失效（实测踩过：重建后 pubAt 全空）。 */
        if (it.pubAt) { prev.pubAt = it.pubAt; prev.pubMs = pubMs; }
        if (pubSrc && pubSrc !== 'at') prev.pubSrc = pubSrc;
        /* 【票面开奖日】也一样"有就补"—— 老数据没这个字段，
           新抓到的同一条算出了 nextAt 就补进去，不然老条目永远不显示。 */
        if (it.nextAt) prev.nextAt = it.nextAt;
        if (!prev.nextAt) {
          const na = nextDrawAfter(g.key, prev.pubMs || Date.parse(prev.at) || 0);
          if (na) prev.nextAt = na;
        }
        if (Date.parse(prev.at) > t) prev.at = at;
        return;
      }
      bucket.set(img, {
        img,
        thumb: it.thumb || thumbOf(img),
        title: it.title || '',
        url: it.url || '',
        at,
        pubAt: it.pubAt || (pubSrc === 'at' ? '' : new Date(pubMs).toISOString()),
        pubMs,
        pubSrc,
        /* 【票面开奖日】一起彩的条目本来没有这个字段（只有头条那条路才算），
           用户要求"发布时间和票面公布的时间都要显示" → 这里按【发布时间】
           算出这条帖子对应的是哪一期开奖（= 发布时间之后最近那次开奖）。
           纯解析、0 成本；算不出来就是 null，页面就不显示那一段
           （绝不给一个编出来的日期）。见 build-xysp-tt.mjs 的 nextDrawAfter。 */
        nextAt: it.nextAt || nextDrawAfter(g.key, pubMs || Date.parse(at)) || null,
        atMs: Date.parse(at) || null,
        seenMs: (typeof it.seenMs === 'number' && isFinite(it.seenMs)) ? it.seenMs : (Date.parse(String(it.seen || '')) || Date.parse(at) || null),
        whenMs: null
      });
      if (count) stat.added++;
    };

    const oldList = (oldData && oldData.games && oldData.games[g.key] &&
      Array.isArray(oldData.games[g.key].items)) ? oldData.games[g.key].items : [];
    oldList.forEach((it) => push(it, false));
    const freshList = Array.isArray(freshByGame[g.key]) ? freshByGame[g.key] : [];
    freshList.forEach((it) => push(it, true));

    /* 【排序】按【发布时间】倒序（最新的在最前）—— 用户明确要求。
       用 sortTimeMs（统一数值 UTC 毫秒）：发布(pubMs/whenMs) > 最近抓到(seenMs) > 首次抓到(atMs)；
       三个都没有 → -Infinity → 【排最后】（用户要求"不要排最前，避免假新"）。
       ⚠️ 不要用 b.pubMs || Date.parse(b.at) 这种混合表达式：一个是数值、
          一个是"本地时间字符串解析出的毫秒"，基准可能差一个时区。
       ⚠️ 砍到上限会【记账】（stat.capped），主流程打印警告 —— 绝不静默。 */
    const list = [...bucket.values()].sort((a, b) =>
      (sortTimeMs(b) - sortTimeMs(a)) ||
      ((b.pubMs || 0) - (a.pubMs || 0)));
    /* 【加强去重】在"按完整 URL 去重（bucket）"之上再加两层（和头条那一路同一份实现）：
         · ① 图片指纹（尺寸/签名/CDN 节点变体 → 留尺寸最大的那张）
         · ② 标题前 16 字相同且不是同一个帖子（→ 留发布时间最早的）
       ⚠️ 必须在 slice(MAX_PER_GAME) 之前 —— 去重腾出的名额给窗口内其他条目。 */
    const deduped = dedupeItems(list, stat);
    const keptList = deduped.slice(0, MAX_PER_GAME);
    if (deduped.length > keptList.length) {
      /* ⚠️ 只用【去重后】的条数算上限被砍 —— 去重合并掉的不算"被上限砍"，
         不然日志会误报（用户明确要求"别偷偷砍"，但也别虚报）。 */
      stat.capped = (stat.capped || 0) + (deduped.length - keptList.length);
      stat.cappedGames = (stat.cappedGames || []).concat([`${g.name} ${deduped.length}→${keptList.length}`]);
    }
    games[g.key] = { name: g.name, items: keptList };
    stat.kept += games[g.key].items.length;
  }
  return { games, stat };
}

/* ============================================================
   【跨源去重】头条 vs 一起彩（用户要求：合并时也要再跑一次）
   ------------------------------------------------------------
   为什么必须放在【本文件】：两个源的数据在这里才第一次碰面 ——
     games.ssq…qlc = 一起彩抓的；games.tt = 头条抓的（靠 it.games 分发到各彩种）。
   规则（和 mergeTt 里的标题规则【同一份实现】）：
     同一个彩种里，一起彩某条 与 头条某条 标题前 16 字相同、且不是同一条帖子
       → 只留【发布时间最早】的那条，另一条从它所在的那一侧删掉。
   ⚠️ 同源之间的重复【不在这里做】—— 已经由 mergeAndPrune / mergeTt 各自处理，
      这里再比一次只会重复干同一件事（也可能误删）。
   ⚠️ 不按"图片指纹"跨源删：两个源的主机不同，指纹本来就不同；
      真出现同一张图跨源，说明是同一内容，标题规则能兜住。
   ============================================================ */
function crossSourceDedupe(games, stat) {
  const tt = (games[TT_KEY] && Array.isArray(games[TT_KEY].items)) ? games[TT_KEY].items : [];
  const res = { removed: 0, examples: [] };
  if (!tt.length) return res;
  const dropTt = new Set();
  for (const g of GAMES) {
    const gObj = games[g.key];
    const mine = (gObj && Array.isArray(gObj.items)) ? gObj.items : [];
    if (!mine.length) continue;
    /* 这个彩种下、头条那一路的条目，按"归一化前 10 字"装桶（titleSimilar 的必要条件） */
    const bucket = new Map();
    for (const it of tt) {
      if (dropTt.has(it)) continue;
      if (!Array.isArray(it.games) || it.games.indexOf(g.key) < 0) continue;
      const nk = normTitle(it.title);
      if (nk.length < 10) continue;                    /* 太短的标题不参与（同 titlesSimilar） */
      const k = nk.slice(0, 10);
      if (!bucket.has(k)) bucket.set(k, []);
      bucket.get(k).push(it);
    }
    if (!bucket.size) continue;
    const keepMine = new Set(mine);
    for (const it of mine) {
      const nk = normTitle(it.title);
      if (nk.length < 10) continue;                    /* 无标题 / 太短 → 跳过这条规则 */
      const cand = bucket.get(nk.slice(0, 10));
      if (!cand) continue;
      for (const t of cand) {
        if (!titlesSimilar(nk, t.title)) continue;
        /* 同一条帖子（跨源理论上不会有；有就不删，宁可留） */
        const pkY = postKeyOf(it), pkT = postKeyOf(t);
        if (pkY && pkY === pkT) break;
        const yMs = pubMsOf(it), tMs = pubMsOf(t);
        const dropYq = !!(tMs && (!yMs || tMs < yMs));  /* 头条更早 → 删一起彩那条 */
        if (dropYq) {
          if (keepMine.has(it)) { keepMine.delete(it); res.removed++; }
        } else if (!dropTt.has(t)) { dropTt.add(t); res.removed++; }
        if (res.examples.length < 3) {
          res.examples.push({ key: titleKey(it.title), side: dropYq ? 'yq' : 'tt', keep: String(dropYq ? t.img : it.img).slice(-40), drop: String(dropYq ? it.img : t.img).slice(-40) });
        }
        break;
      }
    }
    if (keepMine.size !== mine.length) games[g.key] = Object.assign({}, gObj, { items: mine.filter((x) => keepMine.has(x)) });
  }
  if (dropTt.size) {
    games[TT_KEY] = Object.assign({}, games[TT_KEY], { items: tt.filter((x) => !dropTt.has(x)) });
  }
  if (stat) stat.crossDup = res.removed;
  return res;
}

/** 从旧的 xysp-data.js 文本里抠出对象（文件是我们自己写的纯 JSON，直接 JSON.parse） */
function readOld(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    const m = /const XYSP_DATA\s*=\s*(\{[\s\S]*\});/.exec(txt);
    if (!m) return null;
    return JSON.parse(m[1]);
  } catch (e) { return null; }
}

/* ============================================================
   主流程
   ============================================================ */
const st = readState();
const now = Date.now();

/* 1. 退避期？ */
if (st.pausedUntil && now < st.pausedUntil) {
  const left = Math.ceil((st.pausedUntil - now) / 60000);
  log(`⏸  退避中（连续全失败 ${st.failStreak} 次），还剩 ${left} 分钟，本轮跳过`);
  st.skips = (st.skips || 0) + 1;
  writeState(st);
  process.exit(10);
}

log('—— 本轮开始 ——');
st.runs = (st.runs || 0) + 1;

const roundIso = new Date(now).toISOString();
const freshByGame = {};
let httpOk = 0;
let firstErr = '';

for (let i = 0; i < GAMES.length; i++) {
  const g = GAMES[i];
  if (i > 0) await sleep(GAP_MS);            // 请求间隔 >= 1.2s
  try {
    const r = await fetch(g.url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://m.yiqicai.com/'
      },
      signal: AbortSignal.timeout(30000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();
    httpOk++;
    freshByGame[g.key] = parsePage(html, roundIso, now);
  } catch (e) {
    freshByGame[g.key] = [];
    const msg = String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 120);
    if (!firstErr) firstErr = `${g.name} ${msg}`;
    log(`   ⚠️ ${g.name} 抓取失败：${msg}`);
  }
}

const freshTotal = Object.values(freshByGame).reduce((n, a) => n + a.length, 0);
log(`   抓取结束：8 个页面成功 ${httpOk} 个 · 新解析到 ${freshTotal} 条图片`);

/* 2. 一条都没抓到 → 当失败处理（不覆盖旧文件） */
if (freshTotal === 0) {
  st.failStreak = (st.failStreak || 0) + 1;
  log(`⚠️  本轮零条（${firstErr || '全部页面都没解析到晒票'}）· 连续全失败 ${st.failStreak} 次`);
  log('    保留上一次的 xysp-data.js（页面显示上一轮 / 暂无）');
  if (st.failStreak >= FAIL_PAUSE_AFTER) {
    st.pausedUntil = now + PAUSE_MINUTES * 60000;
    st.failStreak = 0;
    log(`🛑 连续全失败达 ${FAIL_PAUSE_AFTER} 次 → 暂停 ${PAUSE_MINUTES} 分钟（保护数据源）`);
  }
  st.skips = (st.skips || 0) + 1;
  st.lastRun = roundIso;
  writeState(st);
  process.exit(10);
}

/* 3. 合并旧数据 + 72 小时过期 + 去重 + 上限 */
const oldData = readOld(OUT);
const oldTotal = oldData && oldData.games
  ? Object.values(oldData.games).reduce((n, g) => n + ((g && g.items) ? g.items.length : 0), 0) : 0;
const { games, stat } = mergeAndPrune(oldData, freshByGame, now);

/* 3.5 【头条晒票 + 竞彩晒票】并进 games.tt / games.jc
   ------------------------------------------------------------
   数据源是 build-xysp-tt.mjs 写的两个缓存文件（不是网络）：
     xysp-tt-data.js → games.tt（数字彩晒票，分享页「晒票」栏里挂着）
     xysp-jc-data.js → games.jc（竞彩晒票，给竞彩页用；分享页不显示它）
   抓失败、或者缓存文件还不存在时，这里【不会】把 games.tt/jc 清掉：
   旧的那份原样搬回来（过期和上限照旧生效），页面那一栏不会闪没。
   ⚠️ 顺序：必须在 mergeAndPrune 之后赋值 —— 它的循环只认 GAMES
      里那 8 个彩种，本来就不会碰 tt/jc。 */
const SIDE_CATS = [
  catByKey(TT_KEY),
  catByKey(JC_KEY)
].filter(Boolean);

for (const C of SIDE_CATS) {
  /* ① 先把 xysp-data.js 里已有的那一份按同样的规则过一遍（过期 + 去重 + 上限）。
     ⚠️ 老的那一份要当成 fresh 传进去 —— mergeTt 只在处理条目时才会
        「按标题补算彩种归属（games）」。当成旧数据传的话不会补算，
        那些老条目就永远分发不到各彩种（实测踩过：30 条认不出彩种）。 */
  const prev = (oldData && oldData.games && oldData.games[C.key] &&
    Array.isArray(oldData.games[C.key].items)) ? oldData.games[C.key].items : [];
  let items = mergeTt(null, prev, now, C).items;

  /* ② 再把缓存文件里的条目合进来 */
  const cacheFile = path.join(ROOT, C.file);
  const cache = readTtOld(cacheFile, C);
  const freshN = (cache && Array.isArray(cache.items)) ? cache.items.length : 0;
  if (freshN) {
    const m = mergeTt({ items }, cache.items, now, C);
    items = m.items;
    log(`   ${C.name}：缓存 ${freshN} 条 → 合并后 ${items.length} 条` +
      `（丢弃过期 ${m.stat.dropped} 条 · 去重 ${m.stat.dupes} 条 · 上限 ${C.max} · 保留 ${C.keepHours} 小时）`);
  } else {
    log(`   ${C.name}：没有 ${C.file}` +
      (items.length ? `（沿用旧数据 ${items.length} 条）` : '，也没有旧数据 → 页面这一栏空着'));
  }
  games[C.key] = { name: C.name, items };
}

/* ============================================================
   3.6 【跨源去重】头条 vs 一起彩 —— 用户要求"合并时再跑一次"
   ------------------------------------------------------------
   规则与 mergeTt 里的标题规则完全一致（titleKey 前 16 字），只是这次跨源比：
   同一个彩种下，一起彩某条与头条某条标题前 16 字相同、且不是同一条帖子
     → 只留【发布时间最早】的那条。
   ⚠️ 放在 SIDE_CATS 之后、写文件之前 —— 这是两个源的数据唯一碰面的时刻。
   ============================================================ */
const cross = crossSourceDedupe(games, stat);
log(`   跨源去重（头条 vs 一起彩）：标题前 16 字撞车 → 合并 ${cross.removed} 条` +
  (cross.examples.length ? `（例：${cross.examples.map((x) => `「${x.key}」丢了${x.side === 'tt' ? '头条' : '一起彩'}那条`).join(' · ')}）` : ''));

/* 4. 成功 → 写文件 */
st.failStreak = 0;
st.pausedUntil = 0;
st.ok = (st.ok || 0) + 1;
st.lastRun = roundIso;
writeState(st);

const data = { updated: stamp(new Date(now)), games };
const text =
  `/* ============================================================\n` +
  `   xysp-data.js —— 「晒票栏」图片数据（自动生成，请勿手动编辑）\n\n` +
  `   由 build-xysp.mjs 生成（晒票每 10 分钟一次；本文件跟着刷新）。\n` +
  `   时效规则（用户要求，两条都要满足）：\n` +
  `     · 帖子【发布时间】在 ${PUB_HOURS} 小时内\n` +
  `     · 期次未开奖，或开奖后不超过 1 小时\n` +
  `   每个彩种最多 ${MAX_PER_GAME} 条\n` +
  `   （头条晒票最多 ${TT_MAX} 条、竞彩晒票最多 ${JC_MAX} 条，都来自 build-xysp-tt.mjs）。\n` +
  `   图片是【外链】（图床没有防盗链），页面里不存图片本体。\n` +
  `   更新时间：${data.updated}\n` +
  `   ============================================================ */\n\n` +
  `const XYSP_DATA = ${JSON.stringify(data, null, 1)};\n`;
fs.writeFileSync(OUT, text, 'utf8');

log(`✅ 已写入 xysp-data.js（${(Buffer.byteLength(text, 'utf8') / 1024).toFixed(1)} KB）`);
log(`   旧数据 ${oldTotal} 条 → 合并后 ${stat.kept} 条` +
  `（丢弃 ${stat.dropped} 条 [发布时间超 ${PUB_HOURS}h ${stat.dropPub} · 兜底超时 ${stat.dropCap}]` +
  ` · 去重合并 ${stat.dupes} 条 · 【加强去重】图片指纹 ${stat.imgDup} 条 · 标题相似 ${stat.titleDup} 条` +
  ` · 跨源去重 ${stat.crossDup || 0} 条` +
  ` · 本轮新加入 ${stat.added} 条 / 共抓到 ${freshTotal} 条` +
  ` · 发布时间取不到退回抓取时间 ${stat.pubFallback} 条）`);
/* 【上限警告】用户明确要求"别偷偷砍"。真撞到上限就【大声打出来】，
   并且把上限值和被砍的彩种都列清楚，方便马上调大。 */
if (stat.capped) {
  log(`   ⚠️⚠️ 上限告警：有 ${stat.capped} 条因为 MAX_PER_GAME=${MAX_PER_GAME} 被砍掉了！`);
  log(`        被砍的：${(stat.cappedGames || []).join(' · ')}`);
  log(`        → 这些都在窗口内，按用户要求【不该被砍】。请把 MAX_PER_GAME 调大。`);
} else {
  log(`   上限检查：没有条目因为 MAX_PER_GAME=${MAX_PER_GAME} 被砍（每条都是窗口内的）`);
}
GAMES.concat([{ key: TT_KEY, name: TT_NAME }, { key: JC_KEY, name: JC_NAME }]).forEach((g) => {
  const items = (games[g.key] && games[g.key].items) || [];
  const h = (g.key === JC_KEY) ? (JC_KEEP_HOURS / 24) + ' 天' : PUB_HOURS + ' 小时';
  log(`   ${g.name.padEnd(6)} ${String(items.length).padStart(2)} 条` +
    (items.length ? ` · 例：${items[0].img}` : ` · ⚠️ ${h} 内没有新的`));
});
log(`   合计 ${stat.kept + games[TT_KEY].items.length + games[JC_KEY].items.length} 条 · 更新时间 ${data.updated}`);
log('—— 本轮结束（有新数据）——');
process.exit(0);
