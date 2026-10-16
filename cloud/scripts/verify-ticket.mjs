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
   所以：按 img URL 缓存判定结果到 `_ticket-ocr-cache.json`，
   已经判过的图【永不重复 OCR】→ 稳态下每轮只 OCR 新增的那几十张。
   ⚠️ 缓存文件是本机运行态数据，不参与云端同步（见 sync-cloud.mjs 的说明）。
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_FILE = path.join(ROOT, '_ticket-ocr-cache.json');

/* 判据：票面一定印 3 位以上连续数字 */
const HAS_DIGITS = /\d{3,}/;
/* 辅助：彩票特征词（命中就【直接】放行，不用等数字 —— 更保险） */
const TICKET_KEYWORD = /彩票|福利彩票|体育彩票|福彩|体彩|双色球|大乐透|排列三|排列3|排列五|排列5|七星彩|七乐彩|快乐8|竞彩|超级大乐透|投注|开奖/;

let _cache = null;
function loadCache() {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (e) { _cache = {}; }
  if (!_cache || typeof _cache !== 'object') _cache = {};
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

/** 缓存里已有的判定；没有就返回 null */
export function cachedVerdict(img) {
  const c = loadCache();
  const v = c[img];
  return (v && typeof v === 'object') ? v : null;
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
  if (c[img] && c[img].ok !== undefined && !opts.force) {
    return { ok: c[img].ok, why: c[img].why || 'cache', text: c[img].t || '', ms: 0, cached: true };
  }
  const ua = opts.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const t0 = Date.now();
  let text = '', ok = null, why = 'unknown';
  try {
    const r = await fetch(img, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(opts.timeout || 20000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    const { makeVariants, recognizeBuffer } = await ocrMod();
    const vs = await makeVariants(buf);
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
  c[img] = { ok, why, t: text.slice(0, 300), ms, at: new Date().toISOString() };
  return { ok, why, text, ms, cached: false };
}

/** 批量校验（串行，避免同时开太多 tesseract 把它们挤爆）；返回统计 */
export async function verifyBatch(imgs, opts = {}) {
  const max = opts.max || 300;
  let checked = 0, passed = 0, failed = 0, unreadable = 0, cacheHit = 0, ms = 0;
  const failedList = [], unreadableList = [];
  for (const img of imgs) {
    if (checked >= max) break;
    const r = await verifyTicketImage(img, opts);
    checked++;
    if (r.cached) cacheHit++;
    ms += r.ms;
    if (r.ok === true) passed++;
    else if (r.ok === false) { failed++; failedList.push({ img, why: r.why }); }
    else { unreadable++; unreadableList.push({ img, why: r.why }); }
    /* 每张之间歇一下，别把本机 CPU 占满 */
    if (!r.cached) await new Promise((x) => setTimeout(x, opts.gap === undefined ? 150 : opts.gap));
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
   【竞彩专用：更严的判据】只认"彩票关键词"，不认"有数字"
   ------------------------------------------------------------
   为什么竞彩不能用"有 3 位以上数字"（实测踩过，很重要）：
     竞彩那批帖子里混着"比赛现场照 / 球员庆祝照 / 球队合影"，
     这些图里【有记分牌、球衣号码、排名表数字】→ OCR 能读到数字 →
     被判成"是票"混进来（抽 20 张实测：还有 8 张是球员/球队照）。
     而真正的竞彩票 / 推单截图 OCR 能读到【彩票类词】：
       中国体育彩票 / 竞彩 / 胜负彩 / 任九 / 过关方式 / 让球 / 胜平负 /
       串关 / 2串1 / 4串1 / 投注 / 开奖 …
   ⇒ 所以竞彩这条闸要求命中【彩票关键词】才算票。
   ⚠️ 代价：拍得模糊、关键字没识别出来的真票会被丢（宁可少，不可假）。
   ⚠️ 缓存里存了最多 300 字的 OCR 文本（t 字段），这里直接复用，不用重跑 OCR。
   ============================================================ */
export const JC_STRICT_KEYWORD = /中国体育彩票|体育彩票|中国福利彩票|福利彩票|竞彩|胜负彩|任九|北单|过关方式|过关|让球|胜平负|二串一|串关|4串1|2串1|3串1|投注|开奖|彩票|超级大乐透|双色球|排列三|排列五|七星彩|七乐彩|快乐8|福彩3D/;
/** 竞彩条目：OCR 文本必须命中彩票关键词。
 *  @returns {boolean|null} true=确认是票 · false=确认不是 · null=还没判过 */
export function jcVerdictStrict(img) {
  const c = loadCache();
  const v = c[img];
  if (!v) return null;                                  /* 还没判过 → 调用方决定 */
  if (v.ok !== true) return false;                      /* 之前判成不是票 / 读不出字 */
  return JC_STRICT_KEYWORD.test(String(v.t || ''));     /* 必须命中彩票关键词 */
}
