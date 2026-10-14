// ============================================================
//  export-draws.mjs —— 从 draws.js 取【各彩种最新一期开奖】，
//  生成要写进 tickets.json 的 draws 字段
//
//  为什么需要它：
//    分享页的「最新开奖」区块以前是服务器预渲染的静态 HTML，
//    只能靠刷新整页才能变。现在 tickets.json 里带上 draws，
//    页面加载后拉到它就能【就地重新渲染】开奖号码。
//
//  字段格式与 draws.js / DRAW_DATA.games 里的一条【完全一致】：
//    { issue: "2026117", date: "2026-10-13", source: "…",
//      areas: { red: [4,11,14,22,26,27], blue: [4] } }
//    各彩种的区域命名（red/blue、front/back、main/special…）原样保留，
//    客户端用 latest-draws.js 的 hcDrawOf() 做同一套映射 ——
//    所以这里【不要】自己拍平成 red/blue/front，否则两边会漂移。
//
//  两个写 tickets.json 的地方都用它，保证结构一致：
//    · cloud/cloud-build.mjs 的 publishTicketsJson()
//    · export-cloud-tickets.mjs 的 writeCloudTickets()
//
//  用法：node export-draws.mjs        （打一份到控制台，方便核对）
//        import { drawsFromDrawData } from './export-draws.mjs';
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* 分享页展示顺序（和 latest-draws.js / hit-check.js 保持一致） */
export const DRAW_GAME_ORDER = ['ssq', 'dlt', 'qlc', 'kl8', 'fc3d', 'pl3', 'pl5', 'qxc'];

/** 执行一个 .js 数据文件，取回它声明的全局变量（不联网、不产生副作用） */
function evalDataFile(file, globalName) {
  if (!fs.existsSync(file)) return null;
  try {
    const ctx = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math, RegExp });
    vm.runInContext(fs.readFileSync(file, 'utf8') + `\nglobalThis.__V = ${globalName};`,
      ctx, { filename: path.basename(file) });
    return ctx.__V || null;
  } catch (e) {
    return null;
  }
}

/**
 * 两期开奖谁更新（期号优先，期号不可比时退回日期）
 * 和 latest-draws.js 的 latestDrawsNewer() 是同一套口径 ——
 * 用来在「文件数据」和「本地录入数据」里挑出真正最新的那一期。
 */
function newerDraw(a, b) {
  if (!a || !a.issue) return false;
  if (!b || !b.issue) return true;
  const ai = String(a.issue).replace(/\D/g, '');
  const bi = String(b.issue).replace(/\D/g, '');
  if (ai && bi && ai.length === bi.length) return Number(ai) > Number(bi);
  if (a.date && b.date && a.date !== b.date) return String(a.date) > String(b.date);
  return false;
}

/**
 * 读出各彩种最新一期开奖
 * @param {string} [root] 项目根目录（默认本文件所在目录）
 * @returns {object} { ssq: {issue,date,source,areas}, … }；读不到就是 {}
 */
export function drawsFromDrawData(root) {
  const dir = root || HERE;
  const out = {};

  const fileData = evalDataFile(path.join(dir, 'draws.js'), 'DRAW_DATA');
  const games = (fileData && fileData.games) || {};

  /* 数据来源就是 draws.js —— 分享页内联的也是这一份，
     所以这里不需要再跟别的地方比对（口径完全一致）。 */
  for (const gid of DRAW_GAME_ORDER) {
    const pick = games[gid];
    if (!pick || !pick.areas) continue;

    /* 原样保留 areas 的区域命名（red/blue、front/back、main/special…） */
    out[gid] = {
      issue: pick.issue,
      date: pick.date || '',
      source: pick.source || '',
      areas: pick.areas
    };
  }

  return out;
}

/** 统计一下 draws 里有哪些彩种，给日志用 */
export function drawsSummary(draws) {
  const ids = Object.keys(draws || {});
  return { count: ids.length, ids };
}

/* 直接跑的时候（node export-draws.mjs）打一份出来核对 */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const draws = drawsFromDrawData(HERE);
  const s = drawsSummary(draws);
  if (!s.count) {
    console.log('❌ 没有读到任何开奖数据（draws.js 缺失或格式不对）');
    process.exitCode = 1;
  } else {
    console.log(`✅ 已从 draws.js 取出 ${s.count} 个彩种的最新开奖：${s.ids.join(', ')}`);
    console.log(JSON.stringify(draws, null, 2));
  }
}
