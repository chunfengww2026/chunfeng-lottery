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

/** RGBA → 灰度（0-255）。which='lum' 亮度 / 'r' 红通道 / 'g' 绿 / 'b' 蓝
 *
 *  【为什么要单通道】一起彩晒票图上有【彩虹多多】水印：粉红色重复小字铺满整张，
 *  还压在号码行上。粉色的 RGB 大约 (230,170,185) —— 亮度上跟浅灰背景差不多，
 *  亮度阈值切不掉；但【红通道】里它是 230（接近白），而黑色打印墨在三个通道都只有 30 左右。
 *  → 只取红通道 = 免费把水印「漂白」，号码一点不损失（实测见 makeBinaryVariants 注释）。
 */
function toGrayCh(img, which) {
  const { data, width, height } = img;
  const g = new Uint8Array(width * height);
  if (which === 'r') { for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = data[p]; return g; }
  if (which === 'g') { for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = data[p + 1]; return g; }
  if (which === 'b') { for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = data[p + 2]; return g; }
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000 | 0;
  }
  return g;
}

/** 兼容旧调用：亮度灰度 */
function toGray(img) { return toGrayCh(img, 'lum'); }

/** 局部自适应二值化（Bradley / Wellner）：像素 < 邻域均值 ×(1-t%) → 黑，否则白
 *  用积分图，复杂度 O(w·h)，1800×2400 也就几十毫秒。
 *  @param {Uint8Array} g 灰度
 *  @param {number} t 百分比（默认 12 → 比邻域均值暗 12% 以上才算墨）
 *  @param {number} win 邻域边长（像素）
 */
function adaptiveBin(g, w, h, t, win) {
  const W = w + 1;
  const I = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    const row = y * w, iRow = (y + 1) * W, pRow = y * W;
    for (let x = 0; x < w; x++) {
      rowSum += g[row + x];
      I[iRow + x + 1] = I[pRow + x + 1] + rowSum;
    }
  }
  const half = Math.max(2, Math.floor(win / 2));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = y - half < 0 ? 0 : y - half;
    const y1 = y + half >= h ? h - 1 : y + half;
    const a0 = y0 * W, a1 = (y1 + 1) * W;
    for (let x = 0; x < w; x++) {
      const x0 = x - half < 0 ? 0 : x - half;
      const x1 = x + half >= w ? w - 1 : x + half;
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = I[a1 + x1 + 1] - I[a0 + x1 + 1] - I[a1 + x0] + I[a0 + x0];
      out[y * w + x] = (g[y * w + x] * area * 100 < sum * (100 - t)) ? 0 : 255;
    }
  }
  return out;
}

/** 大津法全局阈值 */
function otsuThreshold(g) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const total = g.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = -1, th = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; th = i; }
  }
  return th;
}

/** 全局二值：g <= th 的变黑，其余变白。bias<1 → 更严格（只留更黑的墨） */
function globalBin(g, bias) {
  const th = Math.max(1, Math.min(254, Math.round(otsuThreshold(g) * (bias || 1))));
  const out = new Uint8Array(g.length);
  for (let i = 0; i < g.length; i++) out[i] = g[i] <= th ? 0 : 255;
  return out;
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
   二之二、【条带兜底】把整张票横向切成几条，各自放大后再识别
   ------------------------------------------------------------
   手机实拍票的通病：票只占画面下面三分之一，上面是桌面/手/背景，
   整图 OCR 的版面分析（PSM.AUTO）会把这些暗区当成主体，
   号码那一行直接被丢掉。实测（12 张真晒票）里有 3 张就是这样：
   整图只认出一行「2026年10月17日 开奖」，号码行完全没进文本。
   → 所以「整图什么都没认出来」时，再按横向条带重跑一遍：
     每条只放 30% 高度，放大到长边 BAND_LONG，专盯号码行。
   条带有重叠，同一行号码会落进相邻两条 → 天然形成「多变体投票」。
   ============================================================ */
const BAND_LONG = Number(process.env.OCR_BAND_LONG || 1400);
/* 【参数是实测挑的】12 张真晒票上扫过 count ∈ {6,8,10} × ratio ∈ {0.16,0.22,0.28,0.34}：
   最佳组合是 10 条 / 28% 高（行被约 3 条覆盖，够投票）；
   6 条 16%（最早试的）只救得回 1 张，10 条 28% 能救回 3 张。 */
const BAND_COUNT = Number(process.env.OCR_BAND_COUNT || 10);
const BAND_RATIO = Number(process.env.OCR_BAND_RATIO || 0.28);

/**
 * 一张原图 → 若干「横向条带」变体（每条都是放大后的 PNG）
 * @param {Buffer} buf
 * @param {{targetLong?:number, maxUpscale?:number, long?:number, count?:number, ratio?:number}} [opts]
 * @returns {Promise<Array<{name:string, png:Buffer, w:number, h:number}>>}
 */
export async function makeBandVariants(buf, opts) {
  const o = opts || {};
  const targetLong = Number(o.targetLong || TARGET_LONG);
  const maxUp = Number(o.maxUpscale === undefined ? MAX_UPSCALE : o.maxUpscale);
  const long = Number(o.long || BAND_LONG);
  const count = Math.max(1, Number(o.count || BAND_COUNT));
  const ratio = Math.min(0.9, Math.max(0.15, Number(o.ratio || BAND_RATIO)));

  const img = await decodeImage(buf);
  let g = toGray(img);
  let w = img.width, h = img.height;

  let scale = targetLong / Math.max(w, h);
  if (maxUp > 0 && scale > maxUp) scale = maxUp;
  if (Math.abs(scale - 1) > 0.02) {
    const nw = Math.max(8, Math.round(w * scale)), nh = Math.max(8, Math.round(h * scale));
    g = resizeGray(g, w, h, nw, nh); w = nw; h = nh;
  }
  g = stretch(g);

  const bh = Math.max(8, Math.round(h * ratio));
  const span = Math.max(0, h - bh);
  const out = [];
  for (let i = 0; i < count; i++) {
    const y0 = count > 1 ? Math.round((span * i) / (count - 1)) : 0;
    const band = new Uint8Array(w * bh);
    for (let y = 0; y < bh; y++) {
      const src = (y0 + y) * w;
      band.set(g.subarray(src, src + w), y * w);
    }
    let bg = band, bw = w, bhh = bh;
    const k = long / Math.max(bw, bhh);
    if (k > 1.05) {
      bw = Math.round(bw * k); bhh = Math.round(bhh * k);
      bg = resizeGray(band, w, bh, bw, bhh);
    }
    out.push({ name: 'band' + i, png: await encodePng(bg, bw, bhh), w: bw, h: bhh, y: y0 });
  }
  return out;
}

/* ============================================================
   二之三、【二值化档】放大 + 去水印 + 自适应二值（第二道 OCR）
   ------------------------------------------------------------
   为什么要有这一档（实测 2026-10-18，一起彩晒票真图）：
     · 票面照片上铺满【彩虹多多】粉红水印小字，水印压在号码行上，
       整图 OCR 常常把「01 03 04 05 09」读成「O1 O3 ...」或干脆吞掉整行；
     · 手机截图长图（1080×2400 / 1744×3840）长边被 TARGET_LONG 缩到 1800，
       票面小字随之缩到 10px 以下，tesseract 直接放弃。
   这一档做三件事：
     ① 【放大】长边拉到 BIN_LONG（小图最多放大 BIN_MAX_UPSCALE 倍）；
     ② 【取红通道】粉色水印在红通道里接近白（≈230），黑墨只有 ≈30
        —— 等于免费把水印漂白，号码一点不掉；
     ③ 【二值化】局部自适应（Bradley，抗反光/阴影）或全局大津，
        把灰背景压成纯白、墨压成纯黑，tesseract 的二值化自己也可能出错，
        这里先替它做好。
   ⚠️ 这一档【只在第一道（原图灰度）一个号都没认出来时才跑】，
      顺序是「认出来就停」——成功的票不多花时间。
   ============================================================ */
const BIN_LONG = Number(process.env.OCR_BIN_LONG || 0);          /* >0 → 强制这个长边 */
const BIN_MIN_LONG = Number(process.env.OCR_BIN_MIN_LONG || 1600);
const BIN_MAX_LONG = Number(process.env.OCR_BIN_MAX_LONG || 2600);
const BIN_MAX_UPSCALE = Number(process.env.OCR_BIN_MAX_UPSCALE || 3);
const BIN_T = Number(process.env.OCR_BIN_T || 12);
const BIN_WIN_RATIO = Number(process.env.OCR_BIN_WIN || 0.05);

/** 默认配方（可用 OCR_BIN_RECIPES=名字,名字 覆盖，方便实测对比） */
const BIN_RECIPES = [
  { name: 'red', channel: 'r', mode: 'otsu', bias: 1 },      /* 红通道 + 大津二值：漂白粉红水印 */
  { name: 'bin', channel: 'lum', mode: 'adaptive', t: BIN_T } /* 亮度 + 局部自适应二值：抗反光 */
];

/**
 * 一张原图 → 若干「二值化」变体
 * @param {Buffer} buf
 * @param {{long?:number, maxUpscale?:number, recipes?:Array<object>, rot?:boolean}} [opts]
 * @returns {Promise<Array<{name:string, png:Buffer, w:number, h:number}>>}
 */
export async function makeBinaryVariants(buf, opts) {
  const o = opts || {};
  const wantRot = o.rot === true;
  const maxUp = Number(o.maxUpscale === undefined ? BIN_MAX_UPSCALE : o.maxUpscale);
  let recipes = Array.isArray(o.recipes) && o.recipes.length ? o.recipes : BIN_RECIPES;
  const pick = process.env.OCR_BIN_RECIPES;
  if (pick) {
    const names = String(pick).split(',').map((s) => s.trim()).filter(Boolean);
    const filt = BIN_RECIPES.filter((r) => names.includes(r.name));
    if (filt.length) recipes = filt;
  }

  const img = await decodeImage(buf);
  const nativeLong = Math.max(img.width, img.height);
  /* 【这一档不缩小】原图长边 ≥BIN_MIN_LONG 就保持原尺寸：
     整图那道（makeVariants）会把长边一律收到 1800，
     长截图（1744×3840）里票面的小字就是这样被缩没的。
     太小的小图仍然放大，最多 BIN_MAX_UPSCALE 倍、长边不超过 BIN_MAX_LONG。 */
  const targetLong = Number(o.long || BIN_LONG) > 0
    ? Number(o.long || BIN_LONG)
    : Math.min(BIN_MAX_LONG, Math.max(nativeLong, BIN_MIN_LONG));

  const prepCache = new Map();
  /** 每个通道只解码 / 缩放 / 拉伸一次 */
  const prep = (ch) => {
    if (prepCache.has(ch)) return prepCache.get(ch);
    let g = toGrayCh(img, ch);
    let w = img.width, h = img.height;
    let scale = targetLong / nativeLong;
    if (maxUp > 0 && scale > maxUp) scale = maxUp;
    if (Math.abs(scale - 1) > 0.02) {
      const nw = Math.max(8, Math.round(w * scale)), nh = Math.max(8, Math.round(h * scale));
      g = resizeGray(g, w, h, nw, nh); w = nw; h = nh;
    }
    g = stretch(g);
    const v = { g, w, h };
    prepCache.set(ch, v);
    return v;
  };

  const out = [];
  for (const r of recipes) {
    const p = prep(r.channel || 'lum');
    let b;
    if (r.mode === 'otsu') {
      b = globalBin(p.g, r.bias);
    } else {
      const win = Math.max(8, Math.round(Math.max(p.w, p.h) * (r.win || BIN_WIN_RATIO)));
      b = adaptiveBin(p.g, p.w, p.h, r.t === undefined ? BIN_T : r.t, win);
    }
    const rots = wantRot ? [0, 1] : [0];
    for (const k of rots) {
      const rr = rotate90(b, p.w, p.h, k);
      out.push({
        name: r.name + (k ? '90' : ''),
        png: await encodePng(rr.g, rr.w, rr.h), w: rr.w, h: rr.h
      });
    }
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

/** 期号归一化：'2026118' / '26118' / '第26118期' 都算【同一期】
 *  规则：7 位且以 20 开头（年份 4 位）→ 去掉前 2 位，剩下「年 2 位 + 序号」；
 *        5 位就是「年 2 位 + 序号」，原样返回；
 *        别的一律原样返回（宁可判不同，也不要把错号当对的）。
 *  ⚠️ 为什么要这一步：大乐透项目期号是 5 位（26119），
 *     但票面 / 晒票截图里常常印的是 7 位（2026119）——
 *     原来用严格全等比较，会把【当期真票】判成「期号不符」直接丢掉。 */
export function issueKey(s) {
  const t = String(s || '').replace(/\D/g, '');
  /* 【OCR 多认一个字】实测票面上「第2026119期」被认成「12026119」——
     "第"被当成 1 并粘到数字前面，于是 8 位、后 7 位正好是规范的 20xxxxx。
     → 丢掉最前面那个噪点字符。
     这条规则【只会让真票被认出来】，不会把别的期号变成当期：
     它要求后 7 位本身就以 20 开头（也就是本来就写着年份），
     别的期的 5 位尾巴不可能因为这个变换变成当期期号。 */
  if (t.length === 8 && t.slice(1, 3) === '20') return t.slice(3);
  if (t.length === 7 && t.slice(0, 2) === '20') return t.slice(2);
  if (t.length === 5) return t;
  return t;
}

/** 两个期号是不是同一期（归一化后比较） */
export function sameIssue(a, b) {
  if (!a || !b) return false;
  const ka = issueKey(a), kb = issueKey(b);
  return !!ka && ka === kb;
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
  /* 【倍数要整块删掉】福彩票面把倍数印在行尾：`… 32- 6 (1)`
     如果只把括号换成空格，就剩一个孤零零的 1 → 后区被读成 1（实测把蓝球 6 读成 1）。 */
  s = s.replace(/[（(]\s*\d{1,3}\s*[)）]/g, ' ');
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

    /* 前区：
       ① 【复式票】福彩票面就是这么印的 ——「8 15 16 17 30 32 - 6」，
          左区印 6 个号（复式 6+1）。以前这里死要求「正好 spec.front(5) 个」，
          于是只能硬丢一个号凑 5 个 → 读出来的号码是错的（实测把 8 丢了），
          而且不同变体丢的号不一样 → 判「识别结果不稳定」整张丢掉。
          所以先允许「左区 token 数 == 面数」这种一带不丢的读法（waste=0，评分最高）。
       ② 【单式票】仍然要求正好 spec.front 个；OCR 常混进一个噪点数字，
          所以保留「丢掉任意 1 个 token」再试。 */
    const fronts = [];
    const maxClean = Math.min(12, left.length);
    if (maxClean > spec.front) {
      const fBig = searchSplit(left, maxClean, spec.frontMax);
      if (fBig) fronts.push(fBig);
    }
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
      const front = frontAll.slice(0);                 /* 复式票可以 >5 个号，别截断 */
      if (front.length < spec.front) continue;
      if (new Set(front).size !== front.length) continue;
      if (front.some((x) => x < 1 || x > spec.frontMax)) continue;
      for (const backRaw of backs) {
        const back = backRaw.slice(0, spec.back);
        if (back.length !== spec.back) continue;
        if (new Set(back).size !== back.length) continue;
        if (back.some((x) => x < spec.backMin || x > spec.backMax)) continue;

        const waste = left.length - front.length + right.length - back.length;
        let score = 100 - waste * 5 - front.reduce((x, y) => x + y, 0) / 1000;
        if (s[sp] === '+') score += 8;
        if (gid === 'dlt' && !(Math.max(...front) < Math.min(...back))) score -= 12;
        /* strict：这一行是【照印出来的数量原样切出来的】，没丢 token、没合并 token。
           这种读法可信度高得多（见 vote() 里的单票采用规则）。 */
        cands.push({ front, back, score, strict: waste === 0 });
      }
    }
  }

  if (!cands.length) return null;
  cands.sort((x, y) => y.score - x.score);
  const b = cands[0];
  return {
    front: [...b.front].sort((x, y) => x - y),
    back: [...b.back].sort((x, y) => x - y),
    strict: !!b.strict
  };
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
  /* 【必须查范围】以前只查了后区，前区可以出现 55 / 71 这种不存在的号
     （例如把「20:55」读成号码），会让假票通过后续投票。 */
  if (front.some((x) => x < 1 || x > spec.frontMax)) return null;
  if (back.some((x) => x < spec.backMin || x > spec.backMax)) return null;
  return { front: [...front].sort((a, b) => a - b), back: [...back].sort((a, b) => a - b) };
}

/* ============================================================
   四之二、复式票 / 胆拖票（没有「+」分隔符的票面）
   ------------------------------------------------------------
   一起彩晒票里【复式票】和【胆拖票】占比很高（用户愿意晒大票），
   但它们印的是分区的整块号码，不是「5 个 + 2 个」那一行：

     复式票  前区 02 03 04 07 10 11 14 17 19 21 26 27 30 32
                   17 19 21 26 27 30 32          ← 折行
             后区 04 05 12
     胆拖票  前区胆 12 20 22 26 / 前区拖 02 09 32
             后区胆 06          / 后区拖 09 12

   以前只认「+」那一行 → 这类票【一个号都提不出来】（实测 12 张里 2 张）。
   现在按「区关键字」切块：
     · 后区/蓝球 开头的那一行（含紧跟其后的 后区拖/后区胆 行）= 后区
     · 它上面的几行（连续的、以号码为主的行）= 前区
   号码一律去重、查范围；前区 < 5 个或后区 < 2 个就判定「不是号码块」，直接放弃。
   ============================================================ */
/* 【区名关键字】票面上「后区 / 蓝球」那张牌有十几种写法，漏一个就整张票认不出：
     蓝球 / 蓝号 / 蓝胆 / 蓝拖 / 篮(球) / 后区 / 后胆 / 后拖 / 后K
   + 【2026-10-19 补】蓝复（蓝复式）/ 后复 / 蓝选 / 后选 / 蓝码 / 后码
     实测一张真票（第 26119 期）印的是「红复:…/蓝复:…」，只写「蓝球」的话
     后区一个号都认不出来 → 整张票丢掉。
   + 【「球」字兜底】水印把「蓝」吃掉很常见：实测把「蓝球」读成「盎球」。
     「球」这个字本身很好认，所以「任何非『色』的字 + 球」也算后区行
     —— 排除「色球」，否则「双色球」这张票的标题行会被当成后区行。 */
const BACK_LINE_RE = /(后\s*区|蓝\s*球|蓝\s*号|蓝\s*胆|蓝\s*拖|蓝\s*复|蓝\s*选|蓝\s*码|篮\s*球|后\s*胆|后\s*拖|后\s*复|后\s*选|后\s*码|后\s*K|[^色]球)/;

/** 一行里所有「像号码」的数字（先剔掉日期 / 期号 / 金额 / 注数 / 倍数） */
function numbersOf(line, spec) {
  let s = normalizeText(line);
  s = s.replace(/\d{4}\s*[/\-.年]\s*\d{1,2}\s*[/\-.月]\s*\d{1,2}\s*日?/g, ' ');
  s = s.replace(/\d{1,2}\s*[/\-.]\s*\d{1,2}\s*日?/g, ' ');
  s = s.replace(/\d{5,8}/g, ' ');          /* 期号 */
  /* 【时刻要整块删掉】`2026-10-17 16:01:11` 里的 16:01:11 以前会剩成 16/1/11
     三个「号码」，于是日期行被当成号码行，往上找前区时把日期一路收进前区
     —— 实测把「红球 02 08 15 16 25 32」读成 11 个号（多出 1 4 10 11 19）。
     日期上面的两条 \d{4}/\d{1,2} 规则只管斜杠点号，管不了冒号。 */
  s = s.replace(/\d{1,2}\s*:\s*\d{1,2}(?:\s*:\s*\d{1,2})?/g, ' ');
  /* 【倍数 / 注数整块删掉】票面印 `[1倍]` / `(1)` / `【2注】`，
     OCR 常把它读成 `[145]` / `[14%]` —— 里面的数字会被当成号码：
     实测把「蓝球 01 13 [1倍]」读成 1 13 14 5。带数字的括号块一律整块丢。 */
  s = s.replace(/[\[【〔(（][^\]】〕)）]{0,8}\d[^\]】〕)）]{0,8}[\]】〕)）]/g, ' ');
  s = s.replace(/\d+\s*[.,]\s*\d+\s*元/g, ' ');
  s = s.replace(/\d+\s*元/g, ' ');
  s = s.replace(/\d+\s*注/g, ' ');
  s = s.replace(/\d+\s*倍/g, ' ');
  s = s.replace(/\d+\s*期/g, ' ');
  s = s.replace(/[¥￥]/g, ' ');
  const out = [];
  const re = /\d{1,2}/g;
  let m;
  while ((m = re.exec(s))) {
    const n = parseInt(m[0], 10);
    if (Number.isInteger(n) && n >= 1 && n <= spec.frontMax) out.push(n);
  }
  return out;
}

/**
 * 整页文本 → 复式 / 胆拖 的号码块
 * @returns {Array<{front:number[],back:number[],kind:string}>}
 */
export function parseStructuredTicket(text, gid) {
  const spec = GAME_SPEC[gid];
  if (!spec) return [];
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const out = [];
  const seen = new Set();

  for (let bi = 0; bi < lines.length; bi++) {
    const kw = BACK_LINE_RE.exec(lines[bi]);
    if (!kw) continue;

    /* ---------- 后区 ---------- */
    let back = numbersOf(lines[bi].slice(kw.index + kw[0].length), spec)
      .filter((n) => n >= spec.backMin && n <= spec.backMax);
    for (let k = bi + 1; k <= bi + 2 && k < lines.length; k++) {
      const kw2 = BACK_LINE_RE.exec(lines[k]);
      if (!kw2) break;                                   /* 后区块断了就停 */
      back = back.concat(numbersOf(lines[k].slice(kw2.index + kw2[0].length), spec)
        .filter((n) => n >= spec.backMin && n <= spec.backMax));
    }
    if (!back.length) continue;

    /* ---------- 前区：往上找连续的号码行 ---------- */
    let front = [];
    for (let k = bi - 1; k >= 0 && k >= bi - 4; k--) {
      const l = lines[k];
      const nums = numbersOf(l, spec);
      if (!nums.length) break;                           /* 空行 / 纯文字行 → 号码块结束 */
      /* 【只认「号码行」】票面上的「复式票 1倍 合计12元」这类元数据行里也有数字，
         而且 OCR 常把「倍」认成「俘」、「元」认成「工」→ 光靠删词会漏。
         所以这里按「这一行像不像号码行」来判断：
           · 3 个以上号码                → 是号码行
           · 2 个号码 + 整行没有汉字     → 是号码行的折行
           · 2 个号码 + 有「前区/红球/胆/拖」 → 是号码行
           · 其它                        → 号码块到此为止 */
      const cjk = /[\u4e00-\u9fa5]/.test(l);
      /* ⚠️ 关键词不能只写「胆 / 拖」——「胆拖票」这种【票种标签】里也有，
         会把「1倍 合计12元」误当成号码行（实测多读出 1、12 两个假号）。 */
      const dense = nums.length >= 3
        || (nums.length >= 2 && !cjk)
        || (nums.length >= 2 && /(前\s*[区KV]|红\s*球|红\s*号|红\s*[胆拖复选]|前\s*[胆拖复选]|区\s*[胆拖]|胆\s*码|拖\s*码)/.test(l));
      if (!dense) break;
      front = nums.concat(front);
      if (front.length > 20) break;
    }

    const fset = [...new Set(front)];
    const bset = [...new Set(back)];
    if (fset.length < spec.front) continue;              /* 前区不够 5 个 → 不是号码块 */
    if (bset.length < spec.back) continue;
    if (fset.length > 20 || bset.length > spec.backMax) continue;

    const key = fset.join(',') + '|' + bset.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const hasDanTuo = /(胆|拖)/.test(text);
    const kind = hasDanTuo ? '胆拖票' : (fset.length > spec.front || bset.length > spec.back ? '复式票' : '单式票');
    out.push({
      front: [...fset].sort((a, b) => a - b),
      back: [...bset].sort((a, b) => a - b),
      kind
    });
  }
  return out;
}

/** 整页文本 → 所有合法注 */
export function parseTicketText(text, gid) {
  const raw = String(text || '').split(/\r?\n/);
  /* 【折行救命】票面一行太长时 OCR 会断成两行：
       "01 08 19 27 34"
       "+ 05 11"
     这里把「下一行以 +/- 开头」的折行先接回去，否则两行都解析不出来。 */
  const lines = [];
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i];
    const nxt = i + 1 < raw.length ? raw[i + 1] : '';
    if (/^\s*[+\-–—/／]\s*\d/.test(nxt) && /\d/.test(cur)) { lines.push(cur + ' ' + nxt); i++; continue; }
    lines.push(cur);
  }
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
    found.push({ ...hit, kind: '单式票', line: normalizeText(line).replace(/\s+/g, ' ').trim().slice(0, 120), lineNo: idx });
  });
  /* 【复式 / 胆拖】没有「+」那一行的票：一行都没解析出来时，按区关键字切块再试 */
  if (!found.length) {
    for (const t of parseStructuredTicket(text, gid)) {
      const key = ticketKey(t);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ front: t.front, back: t.back, kind: t.kind, line: '', lineNo: -1 });
    }
  }
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
function vote(reads, expectIssue, hintIssue) {
  const votes = new Map();          // key → { t, n, issues:Set }
  let best = null;
  for (const r of reads) {
    for (const t of r.tickets) {
      const k = ticketKey(t);
      if (!votes.has(k)) votes.set(k, { t, n: 0, issues: new Set(), variants: new Set(), strict: false });
      const v = votes.get(k);
      v.n++;
      v.variants.add(r.variant + '/' + r.layout);
      if (t.strict) v.strict = true;
      if (r.issue) v.issues.add(r.issue);
    }
    const sc = (r.tickets.length ? 100 + Math.min(r.tickets.length, 4) * 10 : 0)
      + (r.issue ? 25 : 0) + (r.confidence || 0) / 10;
    if (!best || sc > best.score) best = { ...r, score: sc };
  }
  const list = [...votes.values()].sort((a, b) => b.n - a.n);
  const withTicket = reads.filter((r) => r.tickets.length).length || 1;
  /* 【整张图】的期号（所有变体里出现最多的那个）——
     有些变体只读出了号码行、没读出期号行，但同一张图的另一个变体读出了期号。
     票面期号和号码行本来就印在同一张票上，所以「整图期号 = 当期」可以算旁证。
     hintIssue：条带兜底时，条带是横切的，永远切不到期号行 ——
     由主路径（整图）读到的期号传进来当旁证。 */
  const imgIc = new Map();
  reads.forEach((r) => { if (r.issue) imgIc.set(r.issue, (imgIc.get(r.issue) || 0) + 1); });
  const imgIssue = (([...imgIc.entries()].sort((a, b) => b[1] - a[1])[0] || [])[0]) || hintIssue || '';
  const accepted = [];      // 强接受：多变体一致
  const weak = [];          // 弱接受：只有 1 票（生产默认丢弃）
  for (const v of list) {
    const rate = v.n / withTicket;
    const ownOk = !!expectIssue && [...v.issues].some((i) => sameIssue(i, expectIssue));
    const imgOk = !!expectIssue && !!imgIssue && sameIssue(imgIssue, expectIssue);
    const issueOk = ownOk || imgOk;
    /* 期号只能当【加分项】，不能单独把「只有 1 票」的读法抬成可靠 ——
       实测过：这么做会把 4 张真票读成 5～8 张，噪声全进来了。 */
    const rec = {
      ...v.t, votes: v.n, rate: Math.round(rate * 100), issueOk,
      score: v.n * 10 + (issueOk ? 6 : 0) + rate * 2
    };
    if (v.n >= 2 && rate >= 0.5) accepted.push(rec);
    else if (issueOk && v.n >= 2) accepted.push(rec);
    /* ③ 【单票也可信的情形】只被 1 个变体读出来，但满足两个硬条件：
          · 票面期号 = 当期（时间证据）
          · 号码是「照印出来的数量原样切出来的」（strict：没丢号、没并号）
       实测：SSQ「8 15 16 17 30 32 - 6」这种复式票，14 个变体里常常只有 1 个
       能整行读对，其余全被水印/倾斜搞坏。不放这一条，真票就白丢。
       （之所以不敢只靠「期号相符」就放行，见上面注释：会把噪声读法也放进来。） */
    else if (issueOk && v.n >= 1 && v.strict) accepted.push(rec);
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

  /* ============================================================
     【二值化档】第一道（原图灰度）没认出来 / 没认出期号 → 再走放大+去水印+二值
     ------------------------------------------------------------
     顺序严格是「认出来就停」：
       ① 原图灰度（上面那批 reads）能出「多变体一致」的号 → 直接跳过这一档；
       ② 出不了号，或者号出来了但期号一个都没读到 → 跑这一档；
       ③ 还不行才轮到下面的条带兜底。
     投票方式和条带一样【自成一组】：二值化变体少（默认 2 个 × 2 版面），
     并进主组会把 withTicket 抬高、把一致率压低。
     ⚠️ 这一档【只能补，不能改】：主路径读到的期号永远优先；
        只有主路径「完全没读到期号」时，才采纳二值档读到的期号。
        这样「宁可少，不可错」这条线没动。
     ============================================================ */
  const v = vote(reads, expectIssue);
  const issueOkNow = !expectIssue || (!!v.issue && sameIssue(v.issue, expectIssue));
  let binUsed = 0;
  let binPool = [];
  let binIssue = '';
  if (!v.accepted.length || !issueOkNow) {
    try {
      const bins = await makeBinaryVariants(buf);
      const binLayouts = opt.binLayouts || ['auto', 'block'];
      const binReads = [];
      for (const b of bins) {
        for (const layout of binLayouts) {
          tried++;
          try {
            const r = await recognizeBuffer(b.png, layout);
            binReads.push({
              variant: b.name, layout, issue: parseIssue(r.text),
              tickets: parseTicketText(r.text, gid), confidence: r.confidence, text: r.text
            });
          } catch (e) { /* 单个变体失败不影响其它变体 */ }
        }
      }
      if (binReads.length) {
        const bv = vote(binReads, expectIssue, v.issue);
        binUsed = binReads.length;
        binIssue = bv.issue || '';
        if (bv.accepted.length) binPool = bv.accepted;
      }
    } catch (e) { /* 二值化档失败不影响主流程 */ }
  }

  /* ============================================================
     【条带兜底】整图一个号都没解析出来 → 再按横向条带跑一遍
     ------------------------------------------------------------
     为什么只在「失败时」才跑：整图能读出来的票，条带读出来的是同一张，纯浪费。
     为什么条带【单独投票】而不是并进上面那批读法：
       条带多（默认 10 条），噪声读法也多；混在一起会把 withTicket 抬高、
       把真票的一致率压低，反而更容易被丢。所以条带自成一组，
       仍然要求「组内 ≥2 条一致且一致率 ≥50%」才采用。
     条带之间是重叠的（ratio 0.28 / 10 条），一行号码会落进约 3 条 → 天然有票。
     ============================================================ */
  let bandUsed = 0;
  let bandPool = [];
  let bandIssue = '';
  if (!v.accepted.length && !binPool.length) {
    try {
      const bands = await makeBandVariants(buf);
      const bandReads = [];
      for (const b of bands) {
        tried++;
        try {
          const r = await recognizeBuffer(b.png, opt.bandLayout || 'sparse');
          bandReads.push({
            variant: b.name, layout: opt.bandLayout || 'sparse', issue: parseIssue(r.text),
            tickets: parseTicketText(r.text, gid), confidence: r.confidence, text: r.text
          });
        } catch (e) { /* 单条失败不影响其它条 */ }
      }
      if (bandReads.length) {
        /* hintIssue = 整图读到的期号：条带只负责号码行，期号靠整图那一路 */
        const bv = vote(bandReads, expectIssue, v.issue || binIssue);
        bandUsed = bands.length;
        bandIssue = bv.issue || v.issue || binIssue || '';
        if (bv.accepted.length) bandPool = bv.accepted;
      }
    } catch (e) { /* 条带兜底失败不影响主流程 */ }
  }

  const ms = Date.now() - t0;
  if (!reads.length && !bandPool.length && !binPool.length) {
    return { ok: false, issue: '', tickets: [], reason: 'OCR 无输出', tried, ms, votes: [] };
  }

  let pool = v.accepted.length ? v.accepted : (allowWeak ? v.weak : []);
  let issueOut = v.issue;
  /* 【二值档只补不改】主路径完全没读到期号时，才用二值档读到的期号 */
  if (!issueOut && binIssue) issueOut = binIssue;
  /* 号码只靠二值档才读出来的票（主路径一张都没成） */
  if (!v.accepted.length && binPool.length) pool = binPool;
  /* 条带救回来的票（只有主路径 + 二值档一个都没成功时才走到这里） */
  if (!pool.length && bandPool.length) {
    pool = bandPool;
    if (!issueOut && bandIssue) issueOut = bandIssue;
  }

  /* 只保留「和最强读法同一档」的读法，避免把 1 票的噪声也带进来 */
  if (pool.length > 1) {
    const maxScore = Math.max(...pool.map((t) => t.score));
    const cut = Math.max(maxScore - 25, maxScore * 0.6);
    const strong = pool.filter((t) => t.score >= cut);
    if (strong.length) pool = strong;
  }

  /* 【别把同一张票算两次】复式/胆拖票的号码是一个「集合」，
     不同变体常常只差一个号（多读/少读一行）——
     两个读法都是「合法」的，会同时被采用，导致同一张票统计两次。
     规则：得票高的先留；后面的如果号码集合是已留那张的子集/超集 → 丢弃。
     （两张真正不同的小票不会是子集关系，所以单式多注票不受影响。） */
  if (pool.length > 1) {
    const sorted = pool.slice().sort((a, b) => (b.votes || 0) - (a.votes || 0));
    const kept = [];
    const sig = (t) => new Set([...t.front.map((n) => 'f' + n), ...t.back.map((n) => 'b' + n)]);
    const isSubset = (x, y) => [...x].every((v) => y.has(v));
    for (const t of sorted) {
      const sx = sig(t);
      const dup = kept.some((k) => {
        const sy = sig(k);
        return isSubset(sx, sy) || isSubset(sy, sx);
      });
      if (!dup) kept.push(t);
    }
    pool = kept;
  }

  /* 期号过滤：找得到期号、且与当期不是同一期 → 整张丢弃
     （用 sameIssue 归一化比较：票面印 2026119、项目期号 26119 也算同一期） */
  if (expectIssue && issueOut && !sameIssue(issueOut, expectIssue)) {
    return {
      ok: false, issue: issueOut, tickets: pool, reason: `期号不符（识别 ${issueOut} ≠ 当期 ${expectIssue}）`,
      tried, ms, reads: v.reads, withTicket: v.withTicket, rejected: v.rejected, bandUsed, binUsed,
      text: v.best ? v.best.text : ''
    };
  }

  if (!pool.length) {
    return {
      ok: false, issue: issueOut, tickets: [],
      reason: v.weak.length ? '识别结果不稳定（都没有多變體一致，已丢弃）' : '没识别出合法号码行',
      tried, ms, reads: v.reads, withTicket: v.withTicket, bandUsed, binUsed,
      weak: v.weak.map((t) => ticketKey(t)), rejected: v.rejected,
      text: v.best ? v.best.text : ''
    };
  }

  /* ok 的口径：主路径「多变体一致」通过 或 二值档组内一致 或 条带组内一致 —— 都算硬证据 */
  const hardOk = v.accepted.length > 0 || binPool.length > 0 || bandPool.length > 0;
  return {
    ok: hardOk,
    weak: !hardOk,
    issue: issueOut,
    tickets: pool,
    reason: hardOk ? 'ok' : 'weak',
    tried, ms, bandUsed, binUsed,
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
