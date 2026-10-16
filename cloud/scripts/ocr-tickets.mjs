/* ============================================================
   ocr-tickets.mjs —— 票面照片 OCR（纯 JS，跨平台）
   ============================================================

   用途：把「一起彩晒票页」上的票面照片识别成号码，供
         build-heatmap.mjs 统计「大家买了什么号」。

   为什么选 tesseract.js（而不是 Windows 自带 OCR / 系统 tesseract）：
     ① 云端（GitHub Actions = Ubuntu）和本机（Windows）跑的是【同一套代码】，
        结果一致，不需要在云端装系统包；
     ② 纯 JS + WASM，没有 exe / dll，不需要管理员权限；
     ③ 语言数据（chi_sim / eng）和引擎都放在项目内的 runtime/ocr/ 下，
        完全离线，不依赖任何 CDN（GitHub Actions 上更稳）。

   图片预处理也是纯 JS：
     · 解码  —— jpeg-js（JPEG，含常见 EXIF 方向处理）/ pngjs（PNG）
     · 缩放  —— 双线性，长边收到 TARGET_LONG，太小的图放大到该尺寸
     · 灰度 + 对比度拉伸（2%~98% 分位）
     · 旋转  —— 0° / 90° 两种候选（票面照片横躺是常见情况）
     · 编码  —— PNG（无损，OCR 更准）

   一张照片会跑多个「变体×版面模式」，谁解析出的号码最合法就用谁。
   所有号码都要过【范围 / 个数 / 去重】校验，不合法就整张丢掉 ——
   宁可少几张，也不能把错号统计进去。

   【免责】本模块只做「照片上的号码是什么」的识别，
           与预测中奖、提高中奖概率没有任何关系。
   ============================================================ */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { areasOf } from './lottery-rules.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/* ============================================================
   一、依赖位置
   ============================================================ */
export const OCR_HOME = process.env.OCR_HOME ? path.resolve(process.env.OCR_HOME) : path.join(ROOT, 'runtime', 'ocr');
export const OCR_MODULES = process.env.OCR_MODULES ? path.resolve(process.env.OCR_MODULES) : path.join(OCR_HOME, 'node_modules');
export const OCR_LANG_PATH = process.env.OCR_LANG_PATH ? path.resolve(process.env.OCR_LANG_PATH) : path.join(OCR_HOME, 'tessdata');

export function ocrAvailable() {
  const need = {
    tesseract: path.join(OCR_MODULES, 'tesseract.js', 'src', 'index.js'),
    core: path.join(OCR_MODULES, 'tesseract.js-core', 'index.js'),
    chi_sim: path.join(OCR_LANG_PATH, 'chi_sim.traineddata.gz'),
    jpeg: path.join(OCR_MODULES, 'jpeg-js', 'index.js'),
    png: path.join(OCR_MODULES, 'pngjs', 'lib', 'png.js')
  };
  const missing = Object.entries(need).filter(([, p]) => !fs.existsSync(p)).map(([k]) => k);
  return { ok: missing.length === 0, missing, paths: need };
}

/* ============================================================
   二、图片解码 / 预处理（纯 JS）
   ============================================================ */
let _jpeg = null;
let _PNG = null;
async function codecs() {
  if (!_jpeg) _jpeg = (await import(pathToFileURL(path.join(OCR_MODULES, 'jpeg-js', 'index.js')).href)).default;
  if (!_PNG) {
    const m = await import(pathToFileURL(path.join(OCR_MODULES, 'pngjs', 'lib', 'png.js')).href);
    _PNG = m.PNG || (m.default && m.default.PNG) || m.default;
  }
  return { jpeg: _jpeg, PNG: _PNG };
}

/** 图片字节 → { data: RGBA Uint8Array, width, height } */
export async function decodeImage(buf) {
  const { jpeg, PNG } = await codecs();
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (isPng) {
    const png = PNG.sync.read(Buffer.from(buf));
    return { data: png.data, width: png.width, height: png.height };
  }
  const out = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 512, formatAsRGBA: true });
  return { data: out.data, width: out.width, height: out.height };
}

/** RGBA → 灰度 Float（0-255） */
function toGray(img) {
  const { data, width, height } = img;
  const g = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000 | 0;
  }
  return g;
}

/** 灰度图双线性缩放 */
function resizeGray(g, w, h, nw, nh) {
  const out = new Uint8Array(nw * nh);
  const sx = w / nw, sy = h / nh;
  for (let y = 0; y < nh; y++) {
    const fy = (y + 0.5) * sy - 0.5;
    let y0 = Math.floor(fy); const ty = fy - y0;
    let y1 = y0 + 1;
    if (y0 < 0) y0 = 0; if (y1 > h - 1) y1 = h - 1;
    for (let x = 0; x < nw; x++) {
      const fx = (x + 0.5) * sx - 0.5;
      let x0 = Math.floor(fx); const tx = fx - x0;
      let x1 = x0 + 1;
      if (x0 < 0) x0 = 0; if (x1 > w - 1) x1 = w - 1;
      const a = g[y0 * w + x0], b = g[y0 * w + x1], c = g[y1 * w + x0], d = g[y1 * w + x1];
      out[y * nw + x] = (a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty) | 0;
    }
  }
  return out;
}

/** 旋转 90° 的整数倍：k=1 → 顺时针 90° */
function rotate90(g, w, h, k) {
  k = ((k % 4) + 4) % 4;
  if (!k) return { g, w, h };
  if (k === 2) {
    const out = new Uint8Array(w * h);
    for (let i = 0, j = w * h - 1; i < out.length; i++, j--) out[i] = g[j];
    return { g: out, w, h };
  }
  const nw = h, nh = w;
  const out = new Uint8Array(nw * nh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = g[y * w + x];
      if (k === 1) out[x * nw + (h - 1 - y)] = v;
      else out[(w - 1 - x) * nw + y] = v;
    }
  }
  return { g: out, w: nw, h: nh };
}

/** 对比度拉伸：把 2%~98% 分位的灰度拉到 0~255 */
function stretch(g) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const total = g.length;
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * 0.02) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= total * 0.02) { hi = i; break; } }
  if (hi - lo < 20) return g;
  const out = new Uint8Array(g.length);
  const k = 255 / (hi - lo);
  for (let i = 0; i < g.length; i++) {
    const v = (g[i] - lo) * k;
    out[i] = v < 0 ? 0 : (v > 255 ? 255 : v | 0);
  }
  return out;
}

/** 灰度 → PNG 字节 */
async function encodePng(g, w, h) {
  const { PNG } = await codecs();
  const png = new PNG({ width: w, height: h });
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    png.data[p] = g[i]; png.data[p + 1] = g[i]; png.data[p + 2] = g[i]; png.data[p + 3] = 255;
  }
  return PNG.sync.write(png, { colorType: 6, inputColorType: 6 });
}

const TARGET_LONG = Number(process.env.OCR_TARGET_LONG || 1800);
/* ============================================================
   【提速·别再改回去】小图不许放大太多
   ------------------------------------------------------------
   原来不管原图多大都拉到 1800 长边 —— 但头条晒票只给 450×294 的缩略图，
   于是每一张都被双线性插值放大 4 倍（1800×1176 = 2.1M 像素），
   再编码【两份】PNG，tesseract 也要啃 2.1M 像素。
   实测（2026-10-17，9 张真图 = 2 张真票 + 1 张赔率表 + 3 张球员照 + 3 张分析海报）：
     · TARGET_LONG=1800：变体预处理 3.5s + OCR 5.8s = 9.3s（1.04s/张）
     · TARGET_LONG= 900：变体预处理 1.0s + OCR 4.0s = 5.0s（0.56s/张）
       ⇒ 快 1.86 倍，而且【判定结果逐张完全一致】（还是只留那 2 张真票，
         假图一张都没漏；赔率表/空海报还多识别出了判定理由）
     · TARGET_LONG=1200：6.2s（0.69s/张），判定同样一致
   所以默认「最多把小图放大 2 倍」：原图长边 ≥900 的（手机实拍票）行为不变，
   只有 450 这类小缩略图不再被拉成 4 倍虚影。
   想恢复旧行为：环境变量 OCR_MAX_UPSCALE=99。 */
const MAX_UPSCALE = Number(process.env.OCR_MAX_UPSCALE || 2);

/**
 * 一张原图 → 若干预处理变体
 * @param {Buffer} buf
 * @param {{targetLong?:number, maxUpscale?:number, only?:number}} [opts]
 *        only = 1 → 只出第 1 个变体（verify-ticket 只用第 1 个，
 *        省掉 90° 那份的旋转 + PNG 编码；默认 2 个，build-heatmap 要靠多变体投票）
 * @returns {Promise<Array<{name:string, png:Buffer, w:number, h:number}>>}
 */
export async function makeVariants(buf, opts) {
  const o = opts || {};
  const targetLong = Number(o.targetLong || TARGET_LONG);
  const maxUp = Number(o.maxUpscale === undefined ? MAX_UPSCALE : o.maxUpscale);
  const img = await decodeImage(buf);
  let g = toGray(img);
  let w = img.width, h = img.height;

  let scale = targetLong / Math.max(w, h);
  if (maxUp > 0 && scale > maxUp) scale = maxUp;      /* 小图不许放大太多，见上面的实测 */
  if (Math.abs(scale - 1) > 0.02) {
    const nw = Math.max(8, Math.round(w * scale)), nh = Math.max(8, Math.round(h * scale));
    g = resizeGray(g, w, h, nw, nh); w = nw; h = nh;
  }
  g = stretch(g);

  const out = [];
  const ks = (o.only === 1) ? [0] : [0, 1];
  for (const k of ks) {                       // 0°、顺时针 90°
    const r = rotate90(g, w, h, k);
    out.push({ name: 'r' + k * 90, png: await encodePng(r.g, r.w, r.h), w: r.w, h: r.h });
  }
  return out;
}

/* ============================================================
   三、OCR 引擎（单例 worker）
   ============================================================ */
let _worker = null;
let _tessMod = null;

export async function getOcrWorker() {
  if (_worker) return _worker;
  const p = path.join(OCR_MODULES, 'tesseract.js', 'src', 'index.js');
  const mod = await import(pathToFileURL(p).href);
  _tessMod = mod;
  _worker = await mod.createWorker('chi_sim+eng', 1, {
    langPath: OCR_LANG_PATH,
    corePath: path.join(OCR_MODULES, 'tesseract.js-core'),
    cachePath: path.join(OCR_HOME, 'tesscache'),
    gzip: true,
    logger: () => {}
  });
  return _worker;
}

export async function terminateOcr() {
  if (_worker) { try { await _worker.terminate(); } catch (e) { /* 忽略 */ } _worker = null; }
}

/** 对单个 PNG buffer 跑一次 OCR */
export async function recognizeBuffer(png, layout = 'auto') {
  const w = await getOcrWorker();
  const PSM = _tessMod.PSM;
  const map = { auto: PSM.AUTO, block: PSM.SINGLE_BLOCK, sparse: PSM.SPARSE_TEXT, line: PSM.SINGLE_LINE };
  await w.setParameters({ tessedit_pageseg_mode: map[layout] || PSM.AUTO, preserve_interword_spaces: '1' });
  const t0 = Date.now();
  const { data } = await w.recognize(Buffer.from(png));
  return { text: data.text || '', confidence: data.confidence || 0, ms: Date.now() - t0 };
}

/* ============================================================
   四、文本 → 号码（多重校验）
   ============================================================ */
/* 由 lottery-rules.mjs【派生】—— OCR 只认双色球/大乐透这两种复式票，
   号码区范围与个数不再手写第二份（改规则只改 lottery-rules.mjs 一处）。 */
function ocrSpecOf(id) {
  const a = areasOf(id);
  return {
    front: a[0].pick, back: a[1].pick,
    frontMax: a[0].max, backMin: a[1].min, backMax: a[1].max,
    frontLabel: a[0].label, backLabel: a[1].label
  };
}
export const GAME_SPEC = { ssq: ocrSpecOf('ssq'), dlt: ocrSpecOf('dlt') };

/** OCR 常见字符混淆归一化 */
export function normalizeText(s) {
  return String(s || '')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[OoＱQ]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[Zz]/g, '2')
    .replace(/[，、。；：]/g, ' ');
}

/** 从整页文本里找开奖期 */
export function parseIssue(text) {
  const t = normalizeText(text).replace(/\s+/g, ' ');
  let issue = '';
  const m = /(?:开\s*奖\s*期|开\s*奖\s*号\s*码\s*期|期\s*号|第)\s*[:：]?\s*(\d{5,8})/.exec(t);
  if (m) issue = m[1];
  if (!issue) {
    const all = [...t.matchAll(/\d{6,8}/g)].map((x) => x[0]);
    issue = all.find((x) => /^20\d{5}$/.test(x)) || all.find((x) => /^\d{7}$/.test(x)) || '';
  }
  return issue;
}

/** 一行 → 数字 token */
function digitTokens(line) {
  const out = [];
  const re = /\d{1,2}/g;
  let m;
  while ((m = re.exec(line))) out.push(parseInt(m[0], 10));
  return out;
}

/**
 * 把 token 序列切成 pieces 份号码（每份 1 个 token 或相邻 2 个 token 拼成两位数）
 * @returns {number[]|null}
 */
function searchSplit(toks, pieces, maxV) {
  const out = [];
  const walk = (i, acc) => {
    if (out.length > 600) return;
    if (acc.length > pieces) return;
    if (i === toks.length) { if (acc.length === pieces) out.push(acc.slice()); return; }
    if (acc.length === pieces) return;
    acc.push(toks[i]); walk(i + 1, acc); acc.pop();
    if (i + 1 < toks.length) {
      const v = toks[i] * 10 + toks[i + 1];
      if (v <= maxV) { acc.push(v); walk(i + 2, acc); acc.pop(); }
    }
  };
  walk(0, []);
  if (!out.length) return null;
  const expectTwo = Math.round(pieces * 0.85);
  out.sort((a, b) => {
    const ta = a.filter((x) => x >= 10).length, tb = b.filter((x) => x >= 10).length;
    const da = Math.abs(ta - expectTwo), db = Math.abs(tb - expectTwo);
    if (da !== db) return da - db;
    return a.reduce((x, y) => x + y, 0) - b.reduce((x, y) => x + y, 0);
  });
  return out[0];
}

/**
 * 从一行文本里解析一注号码。
 * 【硬规则】前后区之间必须有分隔符（+ - – ／ /），这是票面的印刷格式；
 * 不要求分隔符的话，机号/流水号/奖池余额这类数字会产生大量假号码。
 * @returns {{front:number[],back:number[]}|null}
 */
export function parseNumberLine(line, gid) {
  const spec = GAME_SPEC[gid];
  if (!spec) return null;

  let s = normalizeText(line);
  if (!s) return null;
  /* 去掉票面的「注次前缀」：A.06 09 … / ①② / 1> 这类，字母不能当数字用 */
  s = s.replace(/(^|\s)[A-Ha-h]\s*[.．、:：]?\s*(?=\d)/g, ' ');
  s = s.replace(/[①②③④⑤⑥⑦⑧⑨①⑩]/g, ' ');
  s = s.replace(/(^|\s)\d{1,2}\s*[>》]\s*(?=\d)/g, ' ');
  s = s.replace(/\d+\s*\)\s*(?=\d)/g, ' ');
  /* 前后区分隔符统一成 '-'（OCR 常把 - 认成 ＝、－、~、^ 等） */
  s = s.replace(/[−–—~～^＝=＿_]/g, '-');
  /* 先删掉明显不是号码的东西：日期、金额、期号、站点编号 */
  s = s.replace(/\d{4}\s*[/\-.年]\s*\d{1,2}\s*[/\-.月]\s*\d{1,2}/g, ' ');
  s = s.replace(/\d{4}\s*[/\-.]\s*\d{1,2}\b/g, ' ');
  s = s.replace(/\d+\s*[.,]\s*\d{2}\s*元/g, ' ');
  s = s.replace(/[¥￥]\s*[\d.,]+/g, ' ');
  s = s.replace(/[<>《》【】\[\](){}]/g, ' ');

  const toks = digitTokens(s);
  if (toks.length < spec.front + spec.back) return null;

  const seps = [...s.matchAll(/[+\-–—/／]/g)].map((m) => m.index);
  if (!seps.length) return null;

  const cands = [];
  for (const sp of seps) {
    const left = digitTokens(s.slice(0, sp));
    const right = digitTokens(s.slice(sp + 1));
    if (left.length < spec.front || right.length < spec.back) continue;

    /* 前区：必须正好切出 spec.front 个；切不出就说明这行不是号码行。
       OCR 常在号码行里混进一个噪点数字，所以允许「丢掉任意 1 个 token」再试。 */
    const fronts = [];
    const f1 = searchSplit(left, spec.front, spec.frontMax);
    if (f1) fronts.push(f1);
    for (let d = 0; d < left.length; d++) {
      const f = searchSplit(left.filter((_, i) => i !== d), spec.front, spec.frontMax);
      if (f) fronts.push(f);
      if (fronts.length > 24) break;
    }
    /* 后区：正好 spec.back 个最好，也允许丢掉 1 个噪点 */
    const backs = [];
    const b1 = searchSplit(right, spec.back, spec.backMax);
    if (b1) backs.push(b1);
    for (let d = 0; d < right.length; d++) {
      const b = searchSplit(right.filter((_, i) => i !== d), spec.back, spec.backMax);
      if (b) backs.push(b);
      if (backs.length > 12) break;
    }
    if (!backs.length) continue;

    for (const frontAll of fronts) {
      const front = frontAll.slice(0, spec.front);
      if (front.length !== spec.front) continue;
      if (new Set(front).size !== front.length) continue;
      if (front.some((x) => x < 1 || x > spec.frontMax)) continue;
      for (const backRaw of backs) {
        const back = backRaw.slice(0, spec.back);
        if (back.length !== spec.back) continue;
        if (new Set(back).size !== back.length) continue;
        if (back.some((x) => x < spec.backMin || x > spec.backMax)) continue;

        const waste = left.length - spec.front + right.length - spec.back;
        let score = 100 - waste * 5 - front.reduce((x, y) => x + y, 0) / 1000;
        if (s[sp] === '+') score += 8;
        if (gid === 'dlt' && !(Math.max(...front) < Math.min(...back))) score -= 12;
        cands.push({ front, back, score });
      }
    }
  }

  if (!cands.length) return null;
  cands.sort((x, y) => y.score - x.score);
  const b = cands[0];
  return { front: [...b.front].sort((x, y) => x - y), back: [...b.back].sort((x, y) => x - y) };
}

/** 没有任何可用分隔符时的兜底：直接按 前区|后区 的顺序整体切 */
export function tryFullSplit(line, gid) {
  const spec = GAME_SPEC[gid];
  if (!spec) return null;
  let s = normalizeText(line);
  s = s.replace(/\d{4}\s*[/\-.年]\s*\d{1,2}\s*[/\-.月]\s*\d{1,2}/g, ' ');
  s = s.replace(/[<>《》【】\[\](){}]/g, ' ');
  const toks = digitTokens(s);
  if (toks.length !== spec.front + spec.back) return null;
  const seq = searchSplit(toks, spec.front + spec.back, spec.frontMax);   // 逐个切，但后区要单独校验
  if (!seq) return null;
  const front = seq.slice(0, spec.front);
  const back = seq.slice(spec.front);
  if (new Set(front).size !== front.length) return null;
  if (new Set(back).size !== back.length) return null;
  if (back.some((x) => x < spec.backMin || x > spec.backMax)) return null;
  return { front: [...front].sort((a, b) => a - b), back: [...back].sort((a, b) => a - b) };
}

/** 整页文本 → 所有合法注 */
export function parseTicketText(text, gid) {
  const lines = String(text || '').split(/\r?\n/);
  const found = [];
  const seen = new Set();
  lines.forEach((line, idx) => {
    let hit = parseNumberLine(line, gid);
    if (!hit) {
      /* 整行没有分隔符，但含分隔符特征（票面上确实有）→ 兜底整体切 */
      if (/[+\-–—/／]/.test(line)) hit = tryFullSplit(line, gid);
    }
    if (!hit) return;
    const key = hit.front.join(',') + '|' + hit.back.join(',');
    if (seen.has(key)) return;                    // 同一注只算一次（多版面模式会重复）
    seen.add(key);
    found.push({ ...hit, line: normalizeText(line).replace(/\s+/g, ' ').trim().slice(0, 120), lineNo: idx });
  });
  return found;
}

/* ============================================================
   五、单张照片 → 号码（多变体 × 多版面 → 交叉投票）

   关键思路：OCR 单个变体经常认错一两位数字，但【不同预处理/版面】
   认错的位往往不一样。所以同一张票的所有变体各自解析，
   然后按「号码完全相同的出现次数」投票：
     · 得票 ≥ 2 且得票率 ≥ 50%  → 认为可靠，采用
     · 只有 1 票（所有变体都不一致）→ 认为不可靠，丢弃
   宁可少几张票，也不把认错的号算进统计。
   ============================================================ */
function ticketKey(t) { return t.front.join(',') + '|' + t.back.join(','); }

/** 合并一张图所有变体的识别结果并投票
 *
 * 采用规则（保守优先）：
 *   ① 得票 ≥ 2 且得票率 ≥ 50%            → 采用
 *   ② 只有 1 票，但这一票所在变体的期号与当期完全一致 → 采用（其它变体全瞎，就它读出来了）
 *   ③ 其余（大量互相矛盾的读法）→ 丢弃，并报「识别结果不稳定」
 */
function vote(reads, expectIssue) {
  const votes = new Map();          // key → { t, n, issues:Set }
  let best = null;
  for (const r of reads) {
    for (const t of r.tickets) {
      const k = ticketKey(t);
      if (!votes.has(k)) votes.set(k, { t, n: 0, issues: new Set(), variants: new Set() });
      const v = votes.get(k);
      v.n++;
      v.variants.add(r.variant + '/' + r.layout);
      if (r.issue) v.issues.add(r.issue);
    }
    const sc = (r.tickets.length ? 100 + Math.min(r.tickets.length, 4) * 10 : 0)
      + (r.issue ? 25 : 0) + (r.confidence || 0) / 10;
    if (!best || sc > best.score) best = { ...r, score: sc };
  }
  const list = [...votes.values()].sort((a, b) => b.n - a.n);
  const withTicket = reads.filter((r) => r.tickets.length).length || 1;
  const accepted = [];      // 强接受：多变体一致
  const weak = [];          // 弱接受：只有 1 票（生产默认丢弃）
  for (const v of list) {
    const rate = v.n / withTicket;
    const issueOk = !!expectIssue && [...v.issues].some((i) => i === expectIssue);
    /* 期号只能当【加分项】，不能单独把「只有 1 票」的读法抬成可靠 ——
       实测过：这么做会把 4 张真票读成 5～8 张，噪声全进来了。 */
    const rec = {
      ...v.t, votes: v.n, rate: Math.round(rate * 100), issueOk,
      score: v.n * 10 + (issueOk ? 6 : 0) + rate * 2
    };
    if (v.n >= 2 && rate >= 0.5) accepted.push(rec);
    else if (issueOk && v.n >= 2) accepted.push(rec);
    else weak.push(rec);
  }
  /* 期号也投票（取出现次数最多的） */
  const ic = new Map();
  reads.forEach((r) => { if (r.issue) ic.set(r.issue, (ic.get(r.issue) || 0) + 1); });
  const issue = [...ic.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    accepted, weak,
    rejected: list.map((v) => ({ key: ticketKey(v.t), votes: v.n, rate: Math.round((v.n / withTicket) * 100) })),
    issue: issue ? issue[0] : '',
    issueVotes: issue ? issue[1] : 0,
    reads: reads.length,
    withTicket,
    best
  };
}

/**
 * 识别一张票面照片
 * @param {Buffer} buf 图片字节
 * @param {'ssq'|'dlt'} gid
 * @param {{expectIssue?:string, layouts?:string[], variants?:number}} [opt]
 * @returns {Promise<{ok:boolean, issue:string, tickets:Array, reason:string, tried:number, ms:number}>}
 */
export async function recognizeTicket(buf, gid, opt = {}) {
  const t0 = Date.now();
  const expectIssue = opt.expectIssue || '';
  const layouts = opt.layouts || ['auto', 'block'];
  /* allowWeak：没有多变体一致、期号也对不上时，要不要采用「只有 1 票」的结果。
     生产（build-heatmap.mjs）用 false —— 宁可少几张，也不赌。
     自测/调试可以用 true 看看到底读出了什么。 */
  const allowWeak = opt.allowWeak === true;

  let variants;
  try {
    variants = await makeVariants(buf);
  } catch (e) {
    return { ok: false, issue: '', tickets: [], reason: '图片解码失败：' + e.message, tried: 0, ms: Date.now() - t0, votes: [] };
  }
  if (opt.variants) variants = variants.slice(0, opt.variants);

  const reads = [];
  let tried = 0;
  for (const v of variants) {
    for (const layout of layouts) {
      tried++;
      try {
        const r = await recognizeBuffer(v.png, layout);
        reads.push({
          variant: v.name, layout, issue: parseIssue(r.text),
          tickets: parseTicketText(r.text, gid), confidence: r.confidence, text: r.text
        });
      } catch (e) { /* 单次失败不影响其它变体 */ }
    }
  }

  const ms = Date.now() - t0;
  if (!reads.length) {
    return { ok: false, issue: '', tickets: [], reason: 'OCR 无输出', tried, ms, votes: [] };
  }

  const v = vote(reads, expectIssue);
  let pool = v.accepted.length ? v.accepted : (allowWeak ? v.weak : []);

  /* 只保留「和最强读法同一档」的读法，避免把 1 票的噪声也带进来 */
  if (pool.length > 1) {
    const maxScore = Math.max(...pool.map((t) => t.score));
    const cut = Math.max(maxScore - 25, maxScore * 0.6);
    const strong = pool.filter((t) => t.score >= cut);
    if (strong.length) pool = strong;
  }

  /* 期号过滤：找得到期号、且与当期不符 → 整张丢弃（严格全等，不做模糊匹配） */
  if (expectIssue && v.issue && v.issue !== expectIssue) {
    return {
      ok: false, issue: v.issue, tickets: pool, reason: `期号不符（识别 ${v.issue} ≠ 当期 ${expectIssue}）`,
      tried, ms, reads: v.reads, withTicket: v.withTicket, rejected: v.rejected,
      text: v.best ? v.best.text : ''
    };
  }

  if (!pool.length) {
    return {
      ok: false, issue: v.issue, tickets: [],
      reason: v.weak.length ? '识别结果不稳定（都没有多變體一致，已丢弃）' : '没识别出合法号码行',
      tried, ms, reads: v.reads, withTicket: v.withTicket,
      weak: v.weak.map((t) => ticketKey(t)), rejected: v.rejected,
      text: v.best ? v.best.text : ''
    };
  }

  return {
    ok: !(v.accepted.length === 0),
    weak: v.accepted.length === 0,
    issue: v.issue,
    tickets: pool,
    reason: v.accepted.length ? 'ok' : 'weak',
    tried, ms,
    reads: v.reads, withTicket: v.withTicket,
    votes: pool.map((t) => ({ key: ticketKey(t), votes: t.votes, rate: t.rate, score: t.score })),
    text: v.best ? v.best.text : ''
  };
}

/* ============================================================
   六、自测入口：node ocr-tickets.mjs --selftest <图片目录>
   ============================================================ */
async function selftest(dir, expectIssue, allowWeak) {
  const files = fs.readdirSync(dir).filter((f) => /\.(jpg|jpeg|png)$/i.test(f) && !f.startsWith('_')).sort();
  const report = [];
  for (const f of files) {
    const gid = /dlt/i.test(f) ? 'dlt' : 'ssq';
    const buf = fs.readFileSync(path.join(dir, f));
    const r = await recognizeTicket(buf, gid, { expectIssue, allowWeak });
    report.push({
      file: f,
      ok: r.ok, weak: !!r.weak, issue: r.issue, tries: r.tried, ms: r.ms,
      tickets: r.tickets.map((t) => t.front.join(',') + '+' + t.back.join(',') + (t.votes ? ` (${t.votes}票)` : '')),
      reason: r.reason
    });
    console.log(`${f}\n  期=${r.issue || '-'} 注数=${r.tickets.length} 变体尝试=${r.tried} ${r.ms}ms ${r.ok ? (r.weak ? '（弱接受）' : '') : '（' + r.reason + '）'}`);
    r.tickets.slice(0, 4).forEach((t) => console.log('    → ' + t.front.join(' ') + '  +  ' + t.back.join(' ')));
  }
  fs.writeFileSync(path.join(dir, '_selftest.json'), JSON.stringify(report, null, 1), 'utf8');
  await terminateOcr();
  return report;
}

const isMain = process.argv[1] && /ocr-tickets\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const i = process.argv.indexOf('--selftest');
  if (i >= 0) {
    const dir = process.argv[i + 1] || path.join(os.tmpdir(), 'tickets');
    const ei = process.argv.indexOf('--issue');
    const expectIssue = ei >= 0 ? String(process.argv[ei + 1] || '') : '';
    const allowWeak = process.argv.includes('--weak');
    console.log(`自测：目录=${dir} 当期期号=${expectIssue || '(未指定，不按期号过滤)'} 弱接受=${allowWeak}\n`);
    selftest(dir, expectIssue, allowWeak)
      .then(() => process.exit(0))
      .catch((e) => { console.error(e); process.exit(1); });
  } else {
    const a = ocrAvailable();
    console.log('OCR 依赖：' + (a.ok ? '✅ 齐备' : '❌ 缺 ' + a.missing.join(' / ')));
    console.log('  node_modules: ' + OCR_MODULES);
    console.log('  tessdata    : ' + OCR_LANG_PATH);
  }
}
