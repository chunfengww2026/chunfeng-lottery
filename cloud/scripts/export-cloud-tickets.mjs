// ============================================================
//  export-cloud-tickets.mjs —— 把本机当前号码导出成
//  cloud/out/tickets.json（云端站点上的 tickets.json 来源）
//
//  为什么需要它：
//    分享页（只读分享版.html）启动后会去拉服务器上的 tickets.json，
//    拿到比页面内联快照更新的号码就【就地重渲染】——
//    这样本机摇完号，手机打开网址立刻就是新号码，
//    不用等云端重新构建整个页面。
//
//    但前提是：服务器上的 tickets.json 必须是新的。
//    云端构建（cloud/cloud-build.mjs）会自己写一份；
//    本机摇号（roll-and-export.mjs）也要立刻写一份并同步上去，
//    这样「只传数据」也能让网址上的号码变。
//
//  格式与 cloud-build.mjs 里那段【完全一致】：
//    { updated, publishedAt, source, note, tickets, draws }
//    · updated     —— 取自 saved-tickets.js 的 updated（北京时间，给本机比对用）
//    · publishedAt —— 本次导出的 UTC 时间（ISO，页面用它判断新旧）
//    · draws       —— 各彩种最新一期开奖（取自 draws.js，字段格式与之相同）。
//                     分享页拿到它就【就地重画「最新开奖」区块】，
//                     不用刷新整页 —— 以前这块是静态预渲染的。
//
//  用法（单独跑）：node export-cloud-tickets.mjs
//  也可以 import { writeCloudTickets } from './export-cloud-tickets.mjs'
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { drawsFromDrawData } from './export-draws.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 读 saved-tickets.js（不执行摇号，只取数据） */
export function readSavedTickets(root) {
  const p = path.join(root || HERE, 'saved-tickets.js');
  if (!fs.existsSync(p)) return null;
  try {
    const ctx = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
    vm.runInContext(fs.readFileSync(p, 'utf8') + '\nglobalThis.__S = SAVED_TICKETS;', ctx, { filename: 'saved-tickets.js' });
    return ctx.__S || null;
  } catch (e) {
    return null;
  }
}

/**
 * 写 cloud/out/tickets.json
 * @param {object}  [opts]
 * @param {string}  [opts.root]    项目根目录（默认本文件所在目录）
 * @param {object}  [opts.saved]   已有的 { updated, tickets }，不给就自己读文件
 * @param {string}  [opts.source]  'local' | 'cloud'
 * @returns {{ok:boolean, path?:string, updated?:string, publishedAt?:string, games?:number, draws?:number, reason?:string}}
 */
export function writeCloudTickets(opts) {
  const o = opts || {};
  const root = o.root || HERE;
  const saved = o.saved || readSavedTickets(root);

  if (!saved || !saved.tickets || !Object.keys(saved.tickets).length) {
    return { ok: false, reason: 'saved-tickets.js 里没有号码' };
  }

  /* 各彩种最新一期开奖（字段格式与 draws.js 一致）。
     取不到就是 {}，页面那边会自动保持内联快照，不影响号码发布。 */
  let draws = {};
  try {
    draws = drawsFromDrawData(root) || {};
  } catch (e) {
    draws = {};
  }

  const payload = {
    updated: saved.updated || stampNow(),
    publishedAt: new Date().toISOString(),
    source: o.source || 'local',
    note: o.note || '本机摇号后立即发布，供分享页拉取最新号码',
    tickets: saved.tickets,
    draws: draws
  };

  const outPath = path.join(root, 'cloud', 'out', 'tickets.json');
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(payload), 'utf8');
  } catch (e) {
    return { ok: false, reason: String(e.message).slice(0, 160) };
  }

  return {
    ok: true,
    path: outPath,
    updated: payload.updated,
    publishedAt: payload.publishedAt,
    games: Object.keys(payload.tickets).length,
    draws: Object.keys(draws).length,
    size: Buffer.byteLength(JSON.stringify(payload), 'utf8')
  };
}

function stampNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* 直接跑的时候（node export-cloud-tickets.mjs）打一份出来 */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const r = writeCloudTickets({ root: HERE });
  if (r.ok) {
    console.log('✅ 已写出 cloud/out/tickets.json');
    console.log(`   updated=${r.updated}  publishedAt=${r.publishedAt}`);
    console.log(`   ${r.games} 个彩种 / ${r.draws} 个彩种的开奖号码 / ${(r.size / 1024).toFixed(1)} KB`);
  } else {
    console.log('❌ 导出失败：' + r.reason);
    process.exitCode = 1;
  }
}
