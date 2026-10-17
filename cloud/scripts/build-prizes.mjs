// ============================================================
//  build-prizes.mjs —— 抓取各彩种最新一期的奖级与奖金
//
//  数据源（官方，无需 key）：
//    福彩  https://www.cwl.gov.cn/.../findDrawNotice?name=ssq|3d|kl8|qlc
//    体彩  https://webapi.sporttery.cn/.../getHistoryPageListV1.qry?gameNo=85|35|...
//
//  产物：prize-data.js  →  const PRIZE_DATA = {...}
//  用法：node build-prizes.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'prize-data.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

const log = (...a) => console.log(...a);

/** 带重试的 JSON 抓取（接口偶发返回 HTML 或限流） */
async function fetchJson(url, headers, tries) {
  const max = tries || 3;
  let lastErr = '未知错误';
  for (let i = 1; i <= max; i++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
      if (!res.ok) { lastErr = `HTTP ${res.status}`; }
      else {
        const txt = await res.text();
        const t = txt.trim();
        if (t.startsWith('{') || t.startsWith('[')) {
          try { return { ok: true, json: JSON.parse(t) }; }
          catch (e) { lastErr = 'JSON 解析失败'; }
        } else {
          lastErr = '返回的不是 JSON（可能被限流）';
        }
      }
    } catch (e) {
      lastErr = e.cause?.code || e.message;
    }
    if (i < max) await new Promise((r) => setTimeout(r, 900 * i));
  }
  return { ok: false, error: lastErr };
}

/* ---------- 福彩 ---------- */
const CWL_GAMES = {
  ssq: '双色球',
  fc3d: '福彩3D',
  qlc: '七乐彩',
  kl8: '快乐8'
};

async function fetchCwl(code) {
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=${code}&issueCount=1`;
  const r = await fetchJson(url, {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://www.cwl.gov.cn/',
    'X-Requested-With': 'XMLHttpRequest'
  });
  if (!r.ok) return r;

  const j = r.json;
  const d = j && j.result && j.result[0];
  if (!d) return { ok: false, error: '无数据' };

  // 奖级：type 1..N，typenum=注数，typemoney=单注奖金
  const levels = (d.prizegrades || [])
    .filter((x) => x && x.typemoney !== '' && x.typemoney !== null && x.typemoney !== undefined)
    .map((x) => ({
      level: +x.type,
      name: `${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][+x.type - 1] || x.type}等奖`,
      count: x.typenum === '' ? null : +x.typenum,
      money: x.typemoney === '' ? null : +x.typemoney
    }));

  return {
    ok: true,
    data: {
      issue: d.code,
      date: d.date,
      numbers: d.red ? d.red.split(',') : [],
      special: d.blue ? d.blue.split(',') : [],
      sales: d.sales ? +d.sales : null,
      pool: d.poolmoney ? +d.poolmoney : null,
      levels,
      source: '福彩官网'
    }
  };
}

/* ---------- 体彩 ---------- */
const SPORT_GAMES = {
  dlt: '85',    // 大乐透
  pl3: '35',    // 排列3
  pl5: '350133',// 排列5
  qxc: '04'     // 七星彩
};

async function fetchSport(code) {
  const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=${code}&provinceId=0&pageSize=1&isVerify=1&pageNo=1`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://static.sporttery.cn/'
    },
    signal: AbortSignal.timeout(25000)
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const j = await res.json();
  const d = j && j.value && j.value.list && j.value.list[0];
  if (!d) return { ok: false, error: '无数据' };

  const levels = (d.prizeLevelList || [])
    .filter((x) => x && x.stakeAmountFormat && +x.stakeAmountFormat > 0)
    .map((x) => ({
      name: x.prizeLevel,
      count: x.stakeCount === '' ? null : +x.stakeCount,
      money: +x.stakeAmountFormat
    }));

  return {
    ok: true,
    data: {
      issue: d.lotteryDrawNum,
      date: d.lotteryDrawTime,
      numbers: d.lotteryDrawResult ? d.lotteryDrawResult.split(' ').filter(Boolean) : [],
      special: [],
      sales: d.totalSaleAmount ? +d.totalSaleAmount : null,
      pool: d.poolBalanceAfterdraw ? Math.round(+d.poolBalanceAfterdraw) : null,
      levels,
      source: '体彩官网'
    }
  };
}

/* ---------- 主流程 ---------- */
async function main() {
  log('════════════════════════════════════════════');
  log('  春风 · 奖级奖金抓取');
  log('════════════════════════════════════════════\n');

  const out = {};

  for (const [id, name] of Object.entries(CWL_GAMES)) {
    const r = await fetchCwl(id);
    if (r.ok) {
      out[id] = r.data;
      log(`  ✅ ${name.padEnd(8)} 第 ${r.data.issue} 期  ${r.data.levels.length} 个奖级`);
      r.data.levels.slice(0, 3).forEach((l) => {
        log(`       ${l.name}  ${l.count ?? '?'} 注  ${l.money ? l.money.toLocaleString() : '?'} 元`);
      });
    } else {
      log(`  ❌ ${name.padEnd(8)} ${r.error}`);
    }
    await new Promise((r2) => setTimeout(r2, 400));
  }

  for (const [id, code] of Object.entries(SPORT_GAMES)) {
    const r = await fetchSport(code);
    if (r.ok) {
      out[id] = r.data;
      log(`  ✅ ${id.padEnd(8)} 第 ${r.data.issue} 期  ${r.data.levels.length} 个奖级`);
      r.data.levels.slice(0, 3).forEach((l) => {
        log(`       ${l.name}  ${l.count ?? '?'} 注  ${l.money ? l.money.toLocaleString() : '?'} 元`);
      });
    } else {
      log(`  ❌ ${id.padEnd(8)} ${r.error}`);
    }
    await new Promise((r2) => setTimeout(r2, 400));
  }

  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;

  const js = `/* 自动生成，请勿手动编辑 · ${stamp} */\n` +
    `const PRIZE_DATA = ${JSON.stringify({ updated: stamp, games: out }, null, 1)};\n`;

  fs.writeFileSync(OUT, js, 'utf8');
  log(`\n✅ 已写入 ${OUT}`);
  log(`   ${Object.keys(out).length} 个彩种 · ${stamp}`);
}

main().catch((e) => {
  console.error('\n❌ 出错：', e.message);
  process.exit(1);
});
