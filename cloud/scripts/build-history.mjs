// ============================================================
//  build-history.mjs —— 抓取历史开奖，生成 history.js
//
//  用途：
//    1. 统计热号/冷号（真实统计，非预测）
//    2. 给「系统自动算号码池」提供大底依据
//
//  用法：node build-history.mjs [期数]      默认 30 期
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_JS = path.join(ROOT, 'history.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

const COUNT = Math.min(Math.max(parseInt(process.argv[2], 10) || 60, 5), 200);

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn('  ⚠️ ', ...a);

/* ---------- 福彩官方接口（一次多期） ---------- */
const CWL_NAME = { ssq: 'ssq', fc3d: '3d', kl8: 'kl8', qlc: 'qlc' };
/* ---------- 体彩 ---------- */
// 85=大乐透  35=排列3  350133=排列5  04=七星彩
const SPORTTERY_GAMENO = { dlt: '85', pl3: '35', pl5: '350133', qxc: '04' };

async function fetchJson(url, referer) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Referer': referer || 'https://www.cwl.gov.cn/'
      }
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, json: await res.json() };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.cause?.code || e.message };
  }
}

function splitNums(str) {
  if (!str) return [];
  return String(str).trim().split(/[\s,，、+]+/).filter((s) => s !== '')
    .map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n));
}

/* ---------- 福彩：抓 N 期 ---------- */
async function fetchCwl(gameId, count) {
  const name = CWL_NAME[gameId];
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=${name}&issueCount=${count}`;
  const r = await fetchJson(url);
  if (!r.ok) return r;
  const list = r.json?.result;
  if (!Array.isArray(list)) return { ok: false, error: '接口没有返回列表' };

  return {
    ok: true,
    draws: list.map((it) => {
      const red = splitNums(it.red);
      const blue = splitNums(it.blue);
      let areas = {};
      if (gameId === 'ssq') areas = { red, blue };
      else if (gameId === 'qlc') { areas = { main: red }; if (blue.length) areas.special = blue; }
      else areas = { main: red };
      return {
        issue: String(it.code || ''),
        date: (it.date || '').replace(/\(.*?\)/g, '').trim(),
        areas
      };
    }).filter((d) => d.issue)
  };
}

/* ---------- 体彩：抓 N 期 ---------- */
async function fetchSporttery(gameId, count) {
  const gameNo = SPORTTERY_GAMENO[gameId];
  const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=${gameNo}&provinceId=0&pageSize=${count}&isVerify=1&pageNo=1`;
  const r = await fetchJson(url, 'https://www.lottery.gov.cn/');
  if (!r.ok) return r;
  const list = r.json?.value?.list;
  if (!Array.isArray(list)) return { ok: false, error: '接口没有返回列表' };

  return {
    ok: true,
    draws: list.map((it) => {
      const all = splitNums(it.lotteryDrawResult);
      let areas;
      if (gameId === 'dlt') {
        // 前 5 位前区 + 后 2 位后区
        areas = { front: all.slice(0, 5), back: all.slice(5, 7) };
      } else if (gameId === 'qxc') {
        // 前 6 位 + 最后 1 位（后区，范围 0-14）
        areas = { front: all.slice(0, 6), back: all.slice(6, 7) };
      } else {
        // 排列3 / 排列5：全部放 main
        areas = { main: all };
      }
      return {
        issue: String(it.lotteryDrawNum || ''),
        date: it.lotteryDrawTime || '',
        areas
      };
    }).filter((d) => d.issue)
  };
}

async function main() {
  log('════════════════════════════════════════════');
  log('  春风十里送大奖 · 历史开奖抓取');
  log(`  每个彩种抓最近 ${COUNT} 期`);
  log('════════════════════════════════════════════\n');

  const out = {};

  for (const [gameId, name] of Object.entries(CWL_NAME)) {
    log(`【${gameId}】`);
    const r = await fetchCwl(gameId, COUNT);
    if (r.ok) {
      out[gameId] = r.draws;
      log(`  ✅ ${r.draws.length} 期（最新 ${r.draws[0]?.issue}）`);
    } else {
      warn(`失败：${r.error}`);
    }
  }

  for (const gameId of Object.keys(SPORTTERY_GAMENO)) {
    log(`【${gameId}】`);
    const r = await fetchSporttery(gameId, COUNT);
    if (r.ok) {
      out[gameId] = r.draws;
      log(`  ✅ ${r.draws.length} 期（最新 ${r.draws[0]?.issue}）`);
    } else {
      warn(`失败：${r.error}`);
    }
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const js = `/* 自动生成，请勿手动编辑 · ${now} */\n` +
    `const DRAW_HISTORY = ${JSON.stringify({ updated: now, count: COUNT, games: out }, null, 1)};\n`;
  fs.writeFileSync(OUT_JS, js, 'utf8');

  log(`\n✅ 已写入 ${OUT_JS}`);
  log(`   覆盖彩种：${Object.keys(out).join(', ')}`);
}

main().catch((e) => {
  console.error('\n❌ 出错了：', e.message);
  process.exit(1);
});
