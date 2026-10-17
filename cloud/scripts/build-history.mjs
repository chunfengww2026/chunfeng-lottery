// ============================================================
//  build-history.mjs —— 抓取历史开奖，生成 history.js
//
//  用途：
//    1. 统计热号/冷号（真实统计，非预测）
//    2. 给「系统自动算号码池」提供大底依据
//
//  【云端抓不到的问题】
//    GitHub 服务器在美国，抓中国彩票官方接口会被拒
//    （福彩 403 / 体彩 567）。所以这里和 build-draws.mjs 用同一套
//    多源 fallback 链（实现在 draw-sources.mjs 里）：
//      ① 官方接口（福彩/体彩）
//      ② 一起彩 www.yiqicai.com/kj/{code}kj/{code}gd.html —— 每页 50 期
//      ③ 500彩票网静态 XML     ④ 17500.cn 明文 TXT
//    每个源都有超时+重试；每一条历史记录都要过号码校验；
//    一个源失败【不会】让整个彩种丢掉；全部失败才保留上一次的值并告警。
//    多期源都拿不到 60 期时，会把各源结果【合并去重】再截取 —— 
//    比如一起彩 50 期 + 500XML 补齐剩下的，尽量凑够要求的期数。
//
//  用法：node build-history.mjs [期数]      默认 60 期
//        CLOUD_BUILD=1 node build-history.mjs 60     # 云端（美国出口）源顺序
//        DRAW_SOURCE_ORDER=yiqicai,fc500 node build-history.mjs 60
//        DRAW_FORCE_FAIL=official node build-history.mjs 60   # 故障注入
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import {
  RULES, GAME_IDS, validateAreas, normalizeIssue, formatIssueLike,
  fetchJsonRetry, resolveSourceOrder, forcedFailures, SOURCE_LABELS,
  splitNums, normalizeDate,
  historyFromYiqicai, historyFrom500Xml, historyFrom17500,
  CWL_NAME, SPORTTERY_GAMENO,
  HISTORY_SOURCES
} from './draw-sources.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_JS = path.join(ROOT, 'history.js');

const COUNT = Math.min(Math.max(parseInt(process.argv[2], 10) || 60, 5), 200);

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn('  ⚠️ ', ...a);

/* ============================================================
   当前快照（上一次的 history.js）—— 全部源失败时保留旧值 + 期号格式基准
   ============================================================ */
function readSnapshot() {
  try {
    if (!fs.existsSync(OUT_JS)) return { games: {} };
    const src = fs.readFileSync(OUT_JS, 'utf8');
    const ctx = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math, RegExp });
    vm.runInContext(src + '\nglobalThis.__V = DRAW_HISTORY;', ctx, { filename: 'history.js' });
    return ctx.__V || { games: {} };
  } catch (e) {
    return { games: {} };
  }
}

/* ============================================================
   源 ①　官方接口（一次多期）
   ============================================================ */
const TIMEOUT = parseInt(process.env.DRAW_TIMEOUT_MS, 10) || 20000;

/** 福彩官方：抓 N 期 */
async function officialCwlHistory(gameId, count) {
  const name = CWL_NAME[gameId];
  if (!name) return { ok: false, error: '该彩种没有配置福彩接口' };
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=${name}&issueCount=${count}`;
  const r = await fetchJsonRetry(url, { timeoutMs: TIMEOUT, tries: 3, label: '福彩官方' });
  if (!r.ok) return { ok: false, error: r.error };

  const list = r.json?.result;
  if (!Array.isArray(list)) return { ok: false, error: '接口没有返回列表' };

  const draws = list.map((it) => {
    const red = splitNums(it.red);
    const blue = splitNums(it.blue);
    let areas;
    if (gameId === 'ssq') areas = { red, blue };
    else if (gameId === 'qlc') { areas = { main: red }; if (blue.length) areas.special = blue; }
    else areas = { main: red };
    return { issue: String(it.code || ''), date: normalizeDate(it.date), areas };
  }).filter((d) => d.issue);

  if (!draws.length) return { ok: false, error: '接口返回了空列表' };
  return { ok: true, draws, sourceLabel: '中国福彩网（官方）', sourceId: 'official' };
}

/** 体彩官方：抓 N 期 */
async function officialSportteryHistory(gameId, count) {
  const gameNo = SPORTTERY_GAMENO[gameId];
  if (gameNo === undefined) return { ok: false, error: '该彩种没有配置体彩接口' };
  const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=${gameNo}&provinceId=0&pageSize=${count}&isVerify=1&pageNo=1`;
  const r = await fetchJsonRetry(url, { timeoutMs: TIMEOUT, tries: 3, headers: { Referer: 'https://www.lottery.gov.cn/' }, label: '体彩官方' });
  if (!r.ok) return { ok: false, error: r.error };

  const list = r.json?.value?.list;
  if (!Array.isArray(list)) return { ok: false, error: '接口没有返回列表' };

  const draws = list.map((it) => {
    const all = splitNums(it.lotteryDrawResult);
    let areas;
    if (gameId === 'dlt') areas = { front: all.slice(0, 5), back: all.slice(5, 7) };
    else if (gameId === 'qxc') areas = { front: all.slice(0, 6), back: all.slice(6, 7) };
    else areas = { main: all };          // 排列3 / 排列5
    return { issue: String(it.lotteryDrawNum || ''), date: normalizeDate(it.lotteryDrawTime), areas };
  }).filter((d) => d.issue);

  if (!draws.length) return { ok: false, error: '接口返回了空列表' };
  return { ok: true, draws, sourceLabel: '中国体彩网（官方）', sourceId: 'official' };
}

async function officialHistory(gameId, count) {
  if (CWL_NAME[gameId]) return officialCwlHistory(gameId, count);
  if (SPORTTERY_GAMENO[gameId] !== undefined) return officialSportteryHistory(gameId, count);
  return { ok: false, error: '该彩种没有官方接口' };
}

/* 官方接口放进历史源注册表 */
HISTORY_SOURCES.official = officialHistory;

/* ============================================================
   源结果处理：校验 + 期号归一 + 按「新→旧」排序 + 去重
   ============================================================ */
/**
 * 逐条校验一个源返回的历史记录，坏记录【单独丢掉】而不是丢掉整个源
 * （一条记录号码不对不该让 60 期全没了；但如果坏得太多就判定这个源不可信）
 * 注意 normalizeIssue 第三个参数传 false —— 历史本来就比「最新一期」旧，
 * 传 true 会把 60 期砍成 1 期（这个坑已踩过）。
 */
function sanitizeDraws(draws, gameId, snapIssue) {
  const good = [];
  const badReasons = [];
  for (const d of draws || []) {
    if (!d || !d.issue) { badReasons.push('缺期号'); continue; }
    const issue = normalizeIssue(d.issue, snapIssue, false);
    if (!issue) { badReasons.push(`期号异常(${d.issue})`); continue; }
    const v = validateAreas(gameId, { areas: d.areas });
    if (!v.ok) { badReasons.push(`${issue}:${v.reason}`); continue; }
    good.push({ issue, date: d.date || '', areas: v.areas });
  }
  return { good, badReasons };
}

/** 期号数值（用于排序比较） */
function issueNum(issue) {
  const s = String(issue || '').replace(/\D/g, '');
  if (!s) return 0;
  // 去年前缀后再比，避免 2026117 和 26117 混在一起排错
  return s.length === 7 && /^20/.test(s) ? Number(s.slice(2)) : Number(s);
}

/** 期号的「同一期」判定 key —— 去年前缀后再比，
 *  否则 500XML 的 2026115 和一起彩的 26115 会被当成两期（已踩过）。 */
function issueKey(issue) {
  const s = String(issue || '').replace(/\D/g, '');
  return s.length === 7 && /^20/.test(s) ? s.slice(2) : s;
}

/**
 * 合并多个源的结果：按期号去重（保留优先级更高的源），最后按新→旧排序
 * 【重要】合并前先把每个源自己的期号写成统一格式 —— 
 * 同一批历史里出现 2026115 和 26115 两种写法会让去重失效、页面显示跳变。
 */
function mergeDraws(lists) {
  const map = new Map();
  for (const list of lists) {
    if (!list || !list.length) continue;
    const ref = list[0].issue;                  // 用这一批自己的最新期号当格式基准
    for (const d of list) {
      const issue = formatIssueLike(d.issue, ref);
      const key = issueKey(issue);
      if (!key) continue;
      if (!map.has(key)) map.set(key, { issue, date: d.date || '', areas: d.areas });
    }
  }
  return [...map.values()].sort((a, b) => issueNum(b.issue) - issueNum(a.issue));
}

/* ============================================================
   多源 fallback：抓某个彩种的最近 N 期
   ============================================================ */
async function fetchHistoryWithFallback(gameId, count, opt) {
  const order = opt.order;
  const forceFail = opt.forceFail;
  const snapIssue = opt.snapIssue;
  const tried = [];
  const collected = [];      // 各源（校验后）的结果，按源优先级排列
  let sourceLabel = '';

  for (const id of order) {
    const fn = HISTORY_SOURCES[id];
    const label = SOURCE_LABELS[id] || id;
    if (!fn) { tried.push({ id, label, error: '未知的源' }); continue; }
    if (forceFail.includes(id)) {
      tried.push({ id, label, error: '被 DRAW_FORCE_FAIL 强制失败（故障注入）' });
      log(`  ⏭  ${label}：被 DRAW_FORCE_FAIL 跳过（故障注入）`);
      continue;
    }

    let res;
    log(`  → 试 ${label} …`);
    try {
      res = await fn(gameId, count, TIMEOUT);
    } catch (e) {
      res = { ok: false, error: (e?.cause?.code || e?.message || String(e)).slice(0, 80) };
    }

    if (!res || !res.ok) {
      const err = (res && res.error) || '未知错误';
      tried.push({ id, label, error: err });
      log(`     ✗ ${label}：${err}`);
      continue;                       // 【关键】一个源失败不让彩种整个丢掉
    }

    const { good, badReasons } = sanitizeDraws(res.draws, gameId, snapIssue);
    if (!good.length) {
      const err = `返回 ${res.draws.length} 期，但全部校验不通过（${badReasons.slice(0, 2).join('; ')}）`;
      tried.push({ id, label, error: err });
      log(`     ✗ ${label}：${err}`);
      continue;
    }
    if (badReasons.length) {
      warn(`${label} 有 ${badReasons.length} 条记录不合规已丢弃（${badReasons.slice(0, 2).join('; ')}）`);
    }

    collected.push(good);
    sourceLabel = sourceLabel ? sourceLabel + ' + ' + (res.sourceLabel || label) : (res.sourceLabel || label);
    tried.push({ id, label, error: '', got: good.length });
    log(`     ✓ ${label} 取得 ${good.length} 期（最新 ${good[0].issue}）`);

    // 已经够期数就不用再试后面的源（省时间）
    if (mergeDraws(collected).length >= count) break;
  }

  const merged = mergeDraws(collected);
  if (!merged.length) return { ok: false, tried, reason: tried.map((t) => `${t.label}:${t.error}`).join(' ; ') };

  return {
    ok: true,
    draws: merged.slice(0, count),
    sourceLabel: sourceLabel || '多源合并',
    tried
  };
}

/* ============================================================
   主流程
   ============================================================ */
async function main() {
  log('════════════════════════════════════════════');
  log('  春风 · 历史开奖抓取');
  log(`  每个彩种抓最近 ${COUNT} 期`);
  log('════════════════════════════════════════════\n');

  const snapshot = readSnapshot();
  const snapGames = snapshot.games || {};
  const IS_CLOUD = process.env.CLOUD_BUILD === '1' || process.env.GITHUB_ACTIONS === 'true';
  const ORDER = resolveSourceOrder(process.env.DRAW_SOURCE_ORDER, IS_CLOUD);
  const FORCE_FAIL = forcedFailures(process.env.DRAW_FORCE_FAIL);

  log(`【数据源顺序】${ORDER.map((s) => SOURCE_LABELS[s] || s).join(' → ')}`);
  log(`  出口判定：${IS_CLOUD ? '云端构建（美国出口，官方接口大概率被拒）' : '本机构建（中国出口，官方接口优先）'}`);
  if (FORCE_FAIL.length) log(`  ⚠️ 故障注入生效：${FORCE_FAIL.join(', ')} 被强制视为失败`);
  log(`  上次快照：${Object.keys(snapGames).length} 个彩种`);
  log('');

  const out = {};
  const report = [];

  for (const gameId of GAME_IDS) {
    const rule = RULES[gameId];
    if (!rule) continue;
    const snapList = Array.isArray(snapGames[gameId]) ? snapGames[gameId] : null;
    const snapIssue = snapList && snapList[0] ? snapList[0].issue : null;
    log(`【${rule.name}】`);

    const fb = await fetchHistoryWithFallback(gameId, COUNT, {
      order: ORDER, forceFail: FORCE_FAIL, snapIssue
    });

    if (fb.ok) {
      out[gameId] = fb.draws;
      log(`  ✅ 取得 ${fb.draws.length} 期（最新 ${fb.draws[0].issue} / 最老 ${fb.draws[fb.draws.length - 1].issue}）`);
      log(`     来源：${fb.sourceLabel}`);
      report.push({ gameId, name: rule.name, count: fb.draws.length, source: fb.sourceLabel, ok: true });
    } else if (snapList && snapList.length) {
      /* 【全部源失败】保留上一次的历史 —— 绝不让热号/冷号统计变成空 */
      out[gameId] = snapList;
      warn(`全部源都失败 → 【保留上一次的 ${snapList.length} 期历史】（最新 ${snapIssue}）`);
      log(`     失败明细：${fb.tried.map((t) => `${t.label}(${t.error})`).join(' / ')}`);
      report.push({ gameId, name: rule.name, count: snapList.length, source: '沿用上一次', ok: false, keptOld: true });
    } else {
      warn(`全部源都失败，而且上一次也没有历史 → 这个彩种本次没有历史数据`);
      log(`     失败明细：${fb.tried.map((t) => `${t.label}(${t.error})`).join(' / ')}`);
      report.push({ gameId, name: rule.name, count: 0, source: '无', ok: false, keptOld: true });
    }
    log('');
  }

  /* 【时区·别再改回 toISOString】必须用【北京时间】。
     原来这里是 new Date().toISOString() —— 那是 UTC，比北京时间早 8 小时。
     实测（2026-10-17）：history.js 的 mtime 是 10-17 02:00:05，文件头和
     updated 却写 10-16 18:00:05；而走势图页 build-trend.mjs 把 updated 直接
     印成「数据快照 …」⇒ 用户看到的时间永远差 8 小时。
     项目里其它数据文件（heatmap / xysp-tt / jc / kjh）用的都是本地时间戳，
     build-history 与 build-draws 这两处是唯二的例外，统一改成同一口径。 */
  const _d = new Date(), _p2 = (x) => String(x).padStart(2, '0');
  const now = `${_d.getFullYear()}-${_p2(_d.getMonth() + 1)}-${_p2(_d.getDate())} `
    + `${_p2(_d.getHours())}:${_p2(_d.getMinutes())}:${_p2(_d.getSeconds())}`;
  const js = `/* 自动生成，请勿手动编辑 · ${now} */\n` +
    `const DRAW_HISTORY = ${JSON.stringify({ updated: now, count: COUNT, games: out }, null, 1)};\n`;
  fs.writeFileSync(OUT_JS, js, 'utf8');

  log('\n────────── 结果汇总 ──────────');
  log('  彩种      期数    最新期号     来源');
  for (const r of report) {
    const icon = r.ok ? '✅' : '⚠️ ';
    log(`  ${icon} ${r.name.padEnd(6, '　')} ${String(r.count).padStart(4)}   ${String(r.source).slice(0, 40)}`);
  }
  const okCount = report.filter((r) => r.ok).length;
  const kept = report.filter((r) => r.keptOld).length;
  log(`\n  成功 ${okCount} / ${report.length} 个彩种${kept ? `，${kept} 个沿用了上一次的历史` : ''}`);
  log(`✅ 已写入 ${OUT_JS}`);
  log(`   覆盖彩种：${Object.keys(out).join(', ')}`);
}

main().catch((e) => {
  console.error('\n❌ 出错了：', e.message);
  process.exit(1);
});
