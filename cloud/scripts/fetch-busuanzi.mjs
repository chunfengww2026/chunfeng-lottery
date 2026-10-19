/* ============================================================
   fetch-busuanzi.mjs —— 构建时抓「不蒜子」热度数字 → busuanzi.json

   【为什么需要这个文件】
   用户 2026-10-20 原话：「卜蒜子能不能永远都呈现 就算我电脑关机了」
   现状：页面里 🔥 那个数字是【浏览器运行时不蒜子脚本】填的 ——
         busuanzi.ibruce.info 在国外，国内偶尔取不到 → 显示「🔥 --」。
   方案（用户选 A）：构建时（云端每 10 分钟一班）先取一次数、写进页面（静态数字），
         取不到就用上一次的数 → 【永远有数，最多旧 10 分钟】。

   【不蒜子的 API 实测（2026-10-20）】
   页面里那个 busuanzi.pure.mini.js 自己请求的就是这一条：
     GET https://busuanzi.ibruce.info/busuanzi?jsonpCallback=BusuanziCallback
     ⚠️ 没有 siteId、没有 page 参数 —— 站点/页面【全靠 Referer 头】认
        （所以脚本里那个 <script> 带 referrerPolicy="no-referrer-when-downgrade"）。
     ⚠️ 必须带 Referer，否则站点认不出来。
   响应（JSONP，外面裹一层 try{...}catch(e){}）：
     try{BusuanziCallback({"site_uv":422,"page_pv":46,"version":2.4,"site_pv":1285});}catch(e){}
     · site_uv  = 站点累计独立访客  ← 页面上 🔥 显示的就是这个数
     · site_pv  = 站点累计浏览量
     · page_pv  = 当前页面浏览量

   【⚠️ 关键：别把 UV 刷虚】
   实测：不带 cookie 每请求一次 site_uv 就 +1（它发 Set-Cookie: busuanziId=...，
   靠这个 cookie 认「同一个访客」）。云端每 10 分钟一班 = 一天 144 次请求，
   不管的话一天凭空涨 144 UV —— 那等于编数字（用户铁律：绝不编数字）。
   所以：把 busuanziId 这个 cookie 【存进 busuanzi.json 的 cookie 字段】，
   下次请求带上 → UV 不再被自己刷涨（实测带 cookie 连请求两次，site_uv 保持 422 不变）。
   （site_pv / page_pv 是「浏览量」，每次请求本来就要 +1，页面也不显示它，不影响。）

   【抓不到怎么办】
   · 抓不到 / 超时 / 返回不是合法 JSONP / 数字不合法 → 【绝不覆盖旧文件】，
     沿用上一次的 busuanzi.json（旧数字 + 旧的 updated），
     只把 source 标成 'cache'（有旧文件才标；没有就干脆不写）。
   · 退出码【永远 0】——这一步失败绝不能把整条构建链挂掉。

   用法：node fetch-busuanzi.mjs
        node fetch-busuanzi.mjs --quiet
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
/* 本机在 D:\彩虹多多\ → 云端在 cloud/scripts\ 里跑。
   用「脚本自己所在的目录」定位 → 两边都对，不用改代码。 */
const FILE = path.join(ROOT, 'busuanzi.json');
const QUIET = process.argv.includes('--quiet');

/* 线上站点地址：不蒜子按 Referer 的域名认站点（实测同一域名下不同路径都认，
   返回的是同一个站点计数）。云端构建也可以用环境变量覆盖。 */
const REF = process.env.BUSUANZI_REFERER || 'https://chunfengww2026.github.io/chunfeng-lottery/';
/* ⚠️ BUSUANZI_API 只是【本机验收用】：故意改成一个错的地址，验证
   「取不到 → 保留上一次的数、退出码仍然 0」（见 README 的验收步骤）。
   正常构建不用设，走下面这个官方地址。 */
const API = process.env.BUSUANZI_API || 'https://busuanzi.ibruce.info/busuanzi?jsonpCallback=BusuanziCallback';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT_MS = 12000;

const say = (...a) => { if (!QUIET) console.log(...a); };

/* 北京时间 'YYYY-MM-DD HH:MM'（和项目里其它 updated 字段同格式） */
function bjNow() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} `
    + `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/* ---------- 读上一次的数（读不到就 {}） ---------- */
function readOld() {
  try {
    if (!fs.existsSync(FILE)) return {};
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return (d && typeof d === 'object') ? d : {};
  } catch (e) {
    say(`  ⚠️ busuanzi.json 读不出来（${String(e.message).slice(0, 60)}）→ 当没有旧值处理`);
    return {};
  }
}

/* ---------- 写文件（原子：先写 .tmp 再 rename，绝不写半个文件） ---------- */
function writeJson(obj) {
  const txt = JSON.stringify(obj, null, 2) + '\n';
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, txt, 'utf8');
  fs.renameSync(tmp, FILE);
  return txt.length;
}

/* ---------- 抓一次 ---------- */
async function fetchOnce(cookie) {
  const headers = { Referer: REF, 'User-Agent': UA, Accept: '*/*' };
  if (cookie) headers.Cookie = cookie;
  const opt = { headers, redirect: 'follow' };
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opt.signal = AbortSignal.timeout(TIMEOUT_MS);

  const r = await fetch(API, opt);
  const body = await r.text();
  let setCookie = [];
  try { setCookie = r.headers.getSetCookie ? r.headers.getSetCookie() : []; } catch (e) { setCookie = []; }
  return { status: r.status, body: String(body || ''), setCookie };
}

/* JSONP → 对象：try{BusuanziCallback({...});}catch(e){} */
function parseJsonp(body) {
  let m = /BusuanziCallback\s*\(\s*(\{[\s\S]*?\})\s*\)/.exec(body);
  if (!m) m = /(\{[\s\S]*\})/.exec(body);          /* 万一是纯 JSON 也认 */
  if (!m) throw new Error('响应里找不到 JSON 对象');
  return JSON.parse(m[1]);
}

function intOf(v) {
  const n = Number(v);
  return (Number.isFinite(n) && n >= 0) ? Math.floor(n) : null;
}

/* ---------- 主流程：任何异常都不许影响退出码 ---------- */
try {
  const old = readOld();
  const oldCookie = (typeof old.cookie === 'string' && /^busuanziId=/.test(old.cookie)) ? old.cookie : '';

  say('  不蒜子热度：正在取数 ...');
  let res = null;
  let err = null;
  try {
    res = await fetchOnce(oldCookie);
  } catch (e) {
    err = e;
  }
  /* 第一次失败 → 不带 cookie 再试一次（cookie 可能过期/被拒） */
  if (!res && oldCookie) {
    say(`  ⚠️ 带旧 cookie 请求失败（${String(err && err.message).slice(0, 60)}）→ 去掉 cookie 再试一次`);
    try { res = await fetchOnce(''); err = null; } catch (e) { err = e; }
  }

  let data = null;
  if (res) {
    if (res.status !== 200) {
      err = new Error(`HTTP ${res.status}`);
    } else {
      try { data = parseJsonp(res.body); } catch (e) { err = e; }
    }
  }

  const uv = data ? intOf(data.site_uv) : null;
  const pv = data ? intOf(data.site_pv) : null;

  if (uv === null) {
    /* ❌ 没取到 → 保留旧值，一个字节都不动数字 */
    say(`  ⚠️ 没取到不蒜子的数（${String(err && err.message || '数字不合法').slice(0, 80)}）`);
    const hasOld = intOf(old.uv) !== null;
    if (hasOld) {
      /* 数字/时间一律沿用上一次的；只把 source 标成 cache（页面上看不出区别） */
      const keep = Object.assign({}, old, { source: 'cache' });
      try { writeJson(keep); } catch (e) { say(`  ⚠️ 旧值回写失败：${String(e.message).slice(0, 60)}`); }
      say(`  ↩ 沿用上一次的数：UV ${keep.uv}（${keep.updated || '时间未知'}）→ 继续构建，不挂链`);
    } else {
      say('  ⚠️ 也没有上一次的数可用 → 不写文件（页面会退回旧行为，等下一班再取）');
    }
  } else {
    /* ✅ 取到了 → 写文件 */
    let cookie = oldCookie;
    try {
      const picks = (res.setCookie || [])
        .map((c) => String(c).split(';')[0].trim())
        .filter((c) => /^busuanziId=/.test(c));
      if (picks.length) cookie = picks[picks.length - 1];
    } catch (e) { /* 忽略：cookie 只影响「UV 不被自己刷涨」，取不到就沿用旧的 */ }

    const out = {
      uv,
      pv: (pv === null ? (intOf(old.pv) === null ? 0 : intOf(old.pv)) : pv),
      updated: bjNow(),
      source: 'live'
    };
    /* 只给脚本自己用的两个字段（页面上不显示，export-static.mjs 也不读） */
    out.ref = REF;
    if (cookie) out.cookie = cookie;
    if (data && intOf(data.page_pv) !== null) out.page_pv = intOf(data.page_pv);
    if (data && data.version) out.version = String(data.version);

    let bytes = 0;
    try {
      bytes = writeJson(out);
    } catch (e) {
      say(`  ⚠️ busuanzi.json 写不进去：${String(e.message).slice(0, 80)}`);
    }
    say(`  ✅ 不蒜子：UV ${out.uv} · PV ${out.pv} · ${out.updated}（来源 live${cookie ? ' · 已带 cookie 防自刷' : ''}）`
      + (bytes ? ` → busuanzi.json ${bytes} B` : ''));
  }
} catch (e) {
  /* 兜底：连这里都炸了也照样 exit 0（这一步不许拖垮构建） */
  say(`  ⚠️ fetch-busuanzi 异常（已忽略，不影响构建）：${String(e && e.message).slice(0, 120)}`);
}

process.exitCode = 0;
