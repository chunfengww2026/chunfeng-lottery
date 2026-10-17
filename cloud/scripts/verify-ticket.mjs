/* ============================================================
   verify-ticket.mjs —— 【票图校验】把"不是票的图"挡掉
   ------------------------------------------------------------
   用户要求：
     「晒票是指 一定出现了票」
     「其他的乱图片 明星人物图片都不要」
     「整票百分百」
   目标：页面上显示的每一张图，都必须是【真实的彩票照片/截图】。

   ============================================================
   为什么要上 OCR（而不是只靠启发式）
   ------------------------------------------------------------
   实测（2026-10-16）第一层启发式【完全无效】：
     · 尺寸：头条给的图 URL 全是统一的 `:450:294` 变体（282/282 张）→ 没区分度
     · 跨帖子重复：282 张里【0 张】出现在 ≥5 个标题里 → 没有"默认图"
     · 域名：全是 p11/p3/p9/p6-sign.toutiaoimg.com
   ⇒ 只能看图内容，所以上项目自带的 OCR（ocr-tickets.mjs + runtime/ocr）。

   ============================================================
   OCR 判据的选择（实测调过参，别随便改）
   ------------------------------------------------------------
   拿 24 张【肉眼已确认真票】的图跑，三种判据的召回：
     · 命中「彩票/福利彩票/体育彩票/双色球/大乐透…」强词 → 只 11/24（46%）
       ⇒ 太严，会把一半真票误杀（缩略图太小，票面抬头字认不出来）
     · 命中「期/注/倍/金额/元/投注…」票词        → 16/24（67%）
     · 命中「有 3 位以上连续数字」                → 22/24（92%）★ 采用
       理由：票面【一定印数字】（期号/号码/金额/流水号），
             而明星照/风景照/表情包/logo 基本没有 3 位以上数字。
   配置：只用第 1 个变体（不旋转，省一半时间）+ auto 布局 → 平均 1.03 秒/张。
   ⚠️ 这是【保守】方向：判错的 2 张是【真票被挡】（宁可少，不可假），
      不是假图放进来。所以"100% 真票"是能保证的方向，代价是丢掉约 8% 真票。

   ============================================================
   缓存（必须，否则跑不完）
   ------------------------------------------------------------
   一轮新图约 100~300 张 × 1 秒 = 100~300 秒，而任务每 10 分钟一轮。
   所以：按【图片身份】（32 位 hex 图名，见 cacheKeyOf）缓存判定结果到
   `_ticket-ocr-cache.json`，已经判过的图【永不重复 OCR】
   → 稳态下每轮只 OCR 新增的那几十张。
   ⚠️ 键必须是图片身份而不是整条 URL：头条每轮换 x-signature，
      用 URL 当键会让同一张图每轮重判、且旧结论落不到新 URL 上（实测踩过）。
   ⚠️ 缓存文件是本机运行态数据，不参与云端同步（见 sync-cloud.mjs 的说明）。
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_FILE = path.join(ROOT, '_ticket-ocr-cache.json');

/** 抓图用的 UA（头条图不带 Referer 也能取，实测三种 Referer 都是 200 + 同样字节数） */
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/* 判据：票面一定印 3 位以上连续数字 */
const HAS_DIGITS = /\d{3,}/;
/* 辅助：彩票特征词（命中就【直接】放行，不用等数字 —— 更保险） */
const TICKET_KEYWORD = /彩票|福利彩票|体育彩票|福彩|体彩|双色球|大乐透|排列三|排列3|排列五|排列5|七星彩|七乐彩|快乐8|竞彩|超级大乐透|投注|开奖/;

/* ============================================================
   【缓存键 = 图片身份，不是 URL】
   ------------------------------------------------------------
   实测（2026-10-17）踩到的坑，改回去会立刻复发：
     头条给同一条微头条里的同一张图，每次解析出的 `x-signature` /
     `x-expires` 都不一样 → 同一张图（路径里那 32 位 hex 相同）会得到
     【不同的 URL】。旧版把整条 URL 当缓存键，后果是两条：
       ① 同一张图每轮都重判一次 OCR（白烧 CPU）；
       ② 上一轮已经判成「不是票」的结论【落不到】这一轮的 URL 上 ——
          竞彩 26 条里 20 条因此从没被判过，球员照/分析图就留在页面上。
     ⇒ 缓存键统一成「32 位 hex 图名」（拿不到就用去掉 query 的 URL）。
   ============================================================ */
export function cacheKeyOf(img) {
  const u = String(img || '');
  const m = u.match(/\/([0-9a-f]{32})~/i);
  if (m) return 'h:' + m[1].toLowerCase();
  return u.split('?')[0];
}

let _cache = null;
function loadCache() {
  if (_cache) return _cache;
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (e) { raw = null; }
  if (!raw || typeof raw !== 'object') raw = {};
  /* 【键迁移·幂等】老缓存的键是带签名的整条 URL → 这里统一换算成身份键。
     同一个身份键撞车时留「更可信」的那条：确认是票 > 确认不是票 > 判不了；
     同级留 OCR 文字更长的（读得更全）。已经是身份键的原样保留。 */
  const rank = (v) => (v.ok === true ? 3 : (v.ok === false ? 2 : 1));
  const out = {};
  Object.keys(raw).forEach((k) => {
    const v = raw[k];
    if (!v || typeof v !== 'object') return;
    const nk = cacheKeyOf(k);
    const old = out[nk];
    if (!old || rank(v) > rank(old)
      || (rank(v) === rank(old) && String(v.t || '').length > String(old.t || '').length)) out[nk] = v;
  });
  _cache = out;
  return _cache;
}
function saveCache() {
  if (!_cache) return;
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(_cache), 'utf8'); } catch (e) { /* 忽略 */ }
}

let _ocr = null;
async function ocrMod() {
  if (!_ocr) _ocr = await import('./ocr-tickets.mjs');
  return _ocr;
}

/** 缓存里已有的判定；没有就返回 null（按【图片身份】查，见 cacheKeyOf） */
export function cachedVerdict(img) {
  const c = loadCache();
  const v = c[cacheKeyOf(img)];
  return (v && typeof v === 'object') ? v : null;
}

/** 抓一张图 → Buffer（出错抛异常，交给调用方按"判不了"处理） */
async function fetchImageBytes(img, ua, timeout) {
  const r = await fetch(img, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(timeout || 20000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

/* ============================================================
   【提速】预取槽：让"抓图"和"OCR"重叠起来
   ------------------------------------------------------------
   抓图实测 148ms/张（19~21KB 的头条缩略图），OCR 0.56~1.04s/张 ——
   串行时那 148ms 是纯白等。verifyBatch 在处理第 i 张时，先把第 i+1 张的
   抓图请求发出去，于是单张墙钟时间从 (抓图 + OCR) 变成 max(抓图, OCR)。
   ⚠️ 只预取 1 张（不提高请求速率，不给图源加压力），也不改公开行为。
   ============================================================ */
const _pre = new Map();
/** 提前把这张图的抓图请求发出去（verifyBatch 用） */
export function prefetchTicketImage(img, opts = {}) {
  const ua = opts.ua || UA;
  const p = fetchImageBytes(img, ua, opts.timeout).then((buf) => ({ buf })).catch((err) => ({ err }));
  _pre.set(img, p);
  if (_pre.size > 2) _pre.delete(_pre.keys().next().value);   /* 只留最近两格，长跑不泄漏 */
  return p;
}

/**
 * 校验一张图是不是"票"。
 *
 * ⚠️ 判定语义（踩过坑，别改）：
 *   · ok = true  → 【确认是票】（命中彩票词 或 命中 3 位以上数字）
 *   · ok = false → 【确认不是票】只有一种情况：OCR 读到了文字，
 *                  但里面既没有彩票词、也没有 3 位以上数字。
 *   · ok = null  → 【判不了】：OCR 一个字都没读出来（模糊/反光/太小）。
 *
 *   为什么把"没读到字"单列成 null 而不是 false：
 *     实测（2026-10-16）跑完一轮真实数据，有 7 张【肉眼确认是真的票】
 *     因为 OCR 一个字都没读出来，被当成"不是票"删掉了 —— 那是真的丢数据。
 *     用户要的是"别放假图"，不是"把读不出来的真票删掉"，
 *     所以"判不了"的图【保留】，并在日志里报数，让人知道有多少张没验成。
 *
 * @returns {Promise<{ok:(boolean|null), why:string, text:string, ms:number, cached:boolean}>}
 */
export async function verifyTicketImage(img, opts = {}) {
  const c = loadCache();
  const ck = cacheKeyOf(img);
  if (c[ck] && c[ck].ok !== undefined && !opts.force) {
    return { ok: c[ck].ok, why: c[ck].why || 'cache', text: c[ck].t || '', ms: 0, cached: true };
  }
  const ua = opts.ua || UA;
  const t0 = Date.now();
  let text = '', ok = null, why = 'unknown';
  try {
    /* 有预取好的就用它（省一次等待），否则现在抓 */
    let buf;
    const pre = _pre.get(img);
    if (pre) { _pre.delete(img); const got = await pre; if (got.err) throw got.err; buf = got.buf; }
    else buf = await fetchImageBytes(img, ua, opts.timeout);
    const { makeVariants, recognizeBuffer } = await ocrMod();
    /* 【提速】只做第 1 个变体：下面只用 vs[0]，
       再让 ocr-tickets 生成 90° 那份 = 白转一次 + 白编码一份 PNG。 */
    const vs = await makeVariants(buf, { only: 1 });
    /* 只用第 1 个变体（r0，不旋转）—— 实测平均 1.03s，用全变体会翻倍 */
    const res = await recognizeBuffer(vs[0].png, 'auto');
    text = String((res && res.text) || '');
    if (TICKET_KEYWORD.test(text)) { ok = true; why = 'keyword'; }
    else if (HAS_DIGITS.test(text)) { ok = true; why = 'digits'; }
    else if (text.trim().length >= 4) { ok = false; why = 'no-ticket-marks'; }   /* 读到字了，但不像票 */
    else { ok = null; why = 'unreadable'; }                                     /* 一个字都没读到 → 判不了 */
  } catch (e) {
    /* 抓图/OCR 出错 → 也判不了，且【不写缓存】，下次重试 */
    return { ok: null, why: 'error:' + String(e.message).slice(0, 40), text: '', ms: Date.now() - t0, cached: false };
  }
  const ms = Date.now() - t0;
  c[cacheKeyOf(img)] = { ok, why, t: text.slice(0, 300), ms, at: new Date().toISOString() };
  return { ok, why, text, ms, cached: false };
}

/** 批量校验（串行，避免同时开太多 tesseract 把它们挤爆）；返回统计 */
export async function verifyBatch(imgs, opts = {}) {
  const max = opts.max || 300;
  const list = (Array.isArray(imgs) ? imgs : []).slice(0, max);
  let checked = 0, passed = 0, failed = 0, unreadable = 0, cacheHit = 0, ms = 0;
  const failedList = [], unreadableList = [];
  for (let i = 0; i < list.length; i++) {
    const img = list[i];
    /* 【提速】先把下一张的抓图发出去，和这一张的 OCR 重叠（见 prefetchTicketImage） */
    const nxt = list[i + 1];
    if (nxt && !cachedVerdict(nxt)) prefetchTicketImage(nxt, opts);
    const r = await verifyTicketImage(img, opts);
    checked++;
    if (r.cached) cacheHit++;
    ms += r.ms;
    if (r.ok === true) passed++;
    else if (r.ok === false) { failed++; failedList.push({ img, why: r.why }); }
    else { unreadable++; unreadableList.push({ img, why: r.why }); }
    /* 每张之间歇一下，别把本机 CPU 占满。
       【2026-10-18 提速】原来固定 150ms，但下一张的抓图已经预取了（见上面 prefetch），
       这段纯粹是白等 → 降到 60ms（实测 OCR 是瓶颈，60ms 足够让出事件循环）。 */
    if (!r.cached) await new Promise((x) => setTimeout(x, opts.gap === undefined ? 60 : opts.gap));
  }
  saveCache();
  return { checked, passed, failed, unreadable, cacheHit, ms, failedList, unreadableList };
}

/** 缓存规模（给日志/报告用） */
export function cacheStats() {
  const c = loadCache();
  const ks = Object.keys(c);
  return {
    total: ks.length,
    pass: ks.filter((k) => c[k].ok === true).length,
    fail: ks.filter((k) => c[k].ok === false).length,
    unreadable: ks.filter((k) => c[k].ok === null).length
  };
}

export async function closeTicketOcr() {
  saveCache();
  if (_ocr) { try { await (await _ocr).terminateOcr(); } catch (e) {} _ocr = null; }
}

/* ============================================================
   【竞彩专用：更严的判据】票据词【必须】命中 + 分析图/赔率图词【必须】不命中
   ------------------------------------------------------------
   为什么竞彩不能用"有 3 位以上数字"（实测踩过，很重要）：
     竞彩那批帖子里混着"比赛现场照 / 球员庆祝照 / 球队合影"，
     这些图里【有记分牌、球衣号码、排名表数字】→ OCR 能读到数字 →
     被判成"是票"混进来。
   ------------------------------------------------------------
   2026-10-17 拿真实数据重判（竞彩 26 条 = 9 张唯一图，逐张肉眼看过，
   缩略图存在 _jc_probe/uniq/），三类：
     · 真票 2 张：①竞彩过关截图 → 450px 缩略 OCR 读到「过关方式 / 让球平(3.90)」
                 ②体彩竞彩纸票 → 读到「固定奖金 / 单倍注数 / 兑奖 / 元」
     · 假图 7 张：③球员庆祝照与赛场照 ×3（OCR 一个字都读不出来）
                  ④500 赔率表 ×1（读到「专业媒体倾向 / 欧赔总汇 / 平均赔率 /
                    欧洲投注初盘」—— 只按"彩票词"判会把它当票放进来）
                  ⑤分析海报 ×3（读到「14场赛事大势拆解 / 正路参考 /
                    临场变数 / 观赛参考 / 不盲目投入」）
   ⇒ 单条判据都不够：
       · 只要求"命中彩票词" → 会丢掉那张真纸票（450 宽缩略图认不出票面抬头的
         "体彩 竞彩"，实测 OCR 输出里【没有】这两个词）；
       · 只要求"读到字" → 赔率表 + 分析海报 4 张假图照样进。
     所以做成两段判据（JC_STRICT_KEYWORD + JC_BLOCK_WORD）。
   ⚠️ 代价：拍得模糊、票据词没识别出来的真票会被丢（宁可少，不可假）。
   ⚠️ 缓存里存了最多 300 字的 OCR 文本（t 字段），这里直接复用，不用重跑 OCR。
   ⚠️ 这仍是"按实测把口子收紧"，做不到 100%：根治要换图源
      （头条只给 450×294 缩略图，原图 ~noop.jpeg 实测 403）。
   ============================================================ */
/* 【必须命中，且只认"票面专属词"】实测：把 投注 / 让球 / 胜平负 / 串关 这类
   "分析贴也爱写"的词也算数的话，那张 500 赔率表会过关 ——
   它的 OCR 只读出「洲投注初盛 … 专业蝎体佐吊」（= 欧洲投注初盘 的残字），
   命中"投注"，而"赔率/倾向/初盘"这些黑名单词在 450px 缩略图上一个都没认出来。
   所以这里【只留】真票票面一定会印、分析贴/赔率表不会印的词。
   （不放进来的弱词：投注 · 让球 · 胜平负 · 二串一 · 2串1/3串1/4串1 —— 单独命中不算票） */
export const JC_STRICT_KEYWORD = /中国体育彩票|体育彩票|中国福利彩票|福利彩票|竞彩|竞彩足球|胜负彩|任九|北单|过关方式|过关|串关|单倍注数|固定奖金|兑奖|注数|倍投|期号|开奖|中奖|彩票|超级大乐透|双色球|排列三|排列五|七星彩|七乐彩|快乐8|福彩3D/;
/** 分析图 / 赔率图 / 复盘海报上【一定】会出现、而真票票面【不会】出现的词。
 *  实测依据见下面 jcVerdictStrict 的说明（500 赔率表 / 分析海报就是这么挡掉的）。 */
export const JC_BLOCK_WORD = /赔率|欧赔|亚盘|盘口|初盘|火线|水位|倾向|媒体倾向|新浪网友|调查|复盘|拆解|大势|正路|冷门|观赛参考|临场变数|强队隐患|战意|轮换|伤病|理性看球|不盲目投入|预测|仅供/;
/** 竞彩条目：OCR 文本必须命中票据词、且不得命中分析图词。
 *  @param {string} img           图 URL
 *  @param {string} [textOverride] 直接给 OCR 文本（验收/回放用，不读缓存）
 *  @returns {boolean|null} true=确认是票 · false=确认不是 · null=还没判过 */
export function jcVerdictStrict(img, textOverride) {
  const c = loadCache();
  const v = c[cacheKeyOf(img)];
  if (textOverride === undefined) {
    if (!v) return null;                                /* 还没判过 → 调用方决定 */
    if (v.ok !== true) return false;                    /* 之前判成不是票 / 读不出字 */
  }
  const text = (textOverride === undefined) ? String(v.t || '') : String(textOverride);
  if (JC_BLOCK_WORD.test(text)) return false;           /* 分析图 / 赔率表 → 否 */
  return JC_STRICT_KEYWORD.test(text);                  /* 必须命中票据词 */
}
