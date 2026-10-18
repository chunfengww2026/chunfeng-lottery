// ============================================================
//  build-draws.mjs —— 抓取开奖号码 + 交给 DeepSeek 解析
//
//  流程：
//    1. 读 deepseek.config.json
//    2. 抓取 500.com 各彩种开奖页（GB2312 解码）
//    3. 从页面里裁出「号码附近」的片段（省 token）
//    4. 把片段交给 DeepSeek，让它解析成结构化号码
//    5. 校验结果是否符合各彩种规则
//    6. 生成 draws.js 供页面读取
//
//  用法：
//    node build-draws.mjs              # 完整流程（默认不调 AI）
//    node build-draws.mjs --dry-run    # 只抓取和解析，不写文件
//    node build-draws.mjs --ai         # 【会花 token】允许最后用 DeepSeek 兜底解析
//    CLOUD_BUILD=1 node build-draws.mjs       # 按云端（美国出口）的源顺序跑
//    DRAW_SOURCE_ORDER=yiqicai,fc500 node build-draws.mjs   # 手动指定源顺序
//    DRAW_FORCE_FAIL=official node build-draws.mjs          # 故障注入（验收用）
//
//  注意：Node 需要写权限才能生成 draws.js。
//  成本：默认路径【完全不调用 DeepSeek】，不需要 apiKey。
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/* 【多源抓取】官方接口在中国能通、在美国（GitHub 服务器）会被 403/567。
   所以把「抓一期开奖」做成多源 fallback 链，实现在 draw-sources.mjs 里：
     ① 官方接口（福彩/体彩）—— 最权威
     ② 一起彩 www.yiqicai.com/kj/ —— 一个页面覆盖全部 8 个彩种
     ③ 500彩票网静态 XML、④ 17500.cn 明文 TXT
   每个源都有超时+重试，号码一律校验合法性，
   一个源失败【绝不会】让整个彩种丢掉，全部失败才保留上一次的值并明确告警。 */
import {
  RULES, GAME_IDS, validateAreas, normalizeIssue, sameAsSnapshot,
  fetchDrawWithFallback, resolveSourceOrder, forcedFailures, SOURCE_LABELS,
  log as srcLog
} from './draw-sources.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(ROOT, 'deepseek.config.json');
const OUT_JS = path.join(ROOT, 'draws.js');
const CACHE_DIR = path.join(ROOT, '_draw-cache');

/* ============================================================
   【本机 backoff 闸门】--min-interval=<分钟>   （2026-10-18 加）
   ------------------------------------------------------------
   为什么加：本机 update-football-smart.mjs 是【每 30 分钟】一轮。开奖号一天只
   变一次（福彩 21:30 / 体彩 21:45），每 30 分钟把所有源站问一遍既没用又费请求。
   （本机另有 update-draws-fast-2min.cmd 在开奖后 2 分钟级补抓，这里只是兜底。）
   规则：
     · 距上次【成功】< N 分钟 → 立刻跳过：打印原因、exit 0、【不动 draws.js】
     · 不传 --min-interval → 闸门关闭，行为与以前【完全一致】（云端不传）
     · --force-run → 忽略闸门，本次一定真跑
   状态文件：./_backoff-build-draws.json
   ⚠️ 只有【真的写了 draws.js】才记 lastSuccess（--dry-run 不记）。
   ============================================================ */
const MIN_INTERVAL_MIN = (() => {
  const m = process.argv.slice(2).find((a) => a.startsWith('--min-interval='));
  if (!m) return 0;
  const n = parseInt(m.slice('--min-interval='.length), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
})();
const FORCE_RUN = process.argv.slice(2).includes('--force-run');
const GATE_FILE = path.join(ROOT, '_backoff-build-draws.json');
function readGate() { try { return JSON.parse(fs.readFileSync(GATE_FILE, 'utf8')) || {}; } catch (e) { return {}; } }
function gateShouldSkip() {
  if (!MIN_INTERVAL_MIN || FORCE_RUN) return false;
  const last = Number(readGate().lastSuccess) || 0;
  if (!last) return false;
  const gone = (Date.now() - last) / 60000;
  if (gone >= MIN_INTERVAL_MIN) return false;
  const ago = gone < 60 ? `${Math.round(gone)} 分钟前` : `${(gone / 60).toFixed(1)} 小时前`;
  console.log(`⏭  跳过：距上次成功 ${ago}（闸门 ${MIN_INTERVAL_MIN} 分钟）→ 保留现有 draws.js 不动`);
  try {
    const st = readGate();
    st.lastSkip = Date.now();
    st.skips = (Number(st.skips) || 0) + 1;
    fs.writeFileSync(GATE_FILE, JSON.stringify(st, null, 1), 'utf8');
  } catch (e) { /* 忽略 */ }
  return true;
}
function gateMarkSuccess() {
  if (!MIN_INTERVAL_MIN) return;
  try {
    const st = readGate();
    st.lastSuccess = Date.now();
    st.lastSuccessText = new Date().toLocaleString('zh-CN', { hour12: false });
    st.minIntervalMin = MIN_INTERVAL_MIN;
    st.skips = Number(st.skips) || 0;
    fs.writeFileSync(GATE_FILE, JSON.stringify(st, null, 1), 'utf8');
  } catch (e) { /* 忽略 */ }
}


const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
const NO_AI = argv.includes('--no-ai');
const DRY_RUN = argv.includes('--dry-run');

/* 【成本红线】DeepSeek 解析默认【关闭】。
   只有显式传 --ai 才会调用 DeepSeek —— 这样：
     · 云端构建永远不会偷偷花 token（用户余额紧张）
     · 本机偶尔需要「页面规则解析也失败」时再手动开一次
   实测官方接口 + 一起彩 + 500XML + 17500 已经能覆盖全部 8 个彩种，
   正常情况根本用不到 AI。 */
const AI_ALLOWED = argv.includes('--ai');

/* ============================================================
   【分班抓取】--only=…
   ------------------------------------------------------------
   用户原话：「最新开奖是每天福彩 21:30 抓取同步，体彩是 21:45 抓取同步」。
   两班各抓各的（福彩 21:30 / 体彩 21:45），所以这里要能只抓一部分彩种。

   用法（等价，任选）：
     node build-draws.mjs --only=ssq,fc3d,qlc,kl8    # 福彩 4 个
     node build-draws.mjs --only=fucai              # 同上（别名）
     node build-draws.mjs --only=ticai              # 体彩 4 个：dlt,pl3,pl5,qxc
     node build-draws.mjs --only=all                # 等同不传（全部 8 个）
     node build-draws.mjs                           # 全部 8 个（云端 / 02:00 全量班）

   【关键】--only 只抓指定的那几个，但写 draws.js 时会把【没抓到的彩种
   沿用上一次的值】补回去 —— 否则一次只抓 4 个就会把另外 4 个从
   draws.js 里抹掉，页面上那 4 个彩种的开奖号码会整块消失。
   ============================================================ */
const FUCAI_IDS = ['ssq', 'fc3d', 'qlc', 'kl8'];   /* 中国福利彩票 */
const TICAI_IDS = ['dlt', 'pl3', 'pl5', 'qxc'];    /* 中国体育彩票 */

function parseOnly(list) {
  const raw = list
    .filter((a) => a.indexOf('--only=') === 0)
    .map((a) => a.slice('--only='.length))
    .join(',');
  if (!raw.trim()) return null;

  const out = [];
  for (const seg of raw.split(',')) {
    const s = seg.trim().toLowerCase();
    if (!s) continue;
    if (s === 'all') return null;                       /* 全量 = 不加限制 */
    if (s === 'fucai') { out.push(...FUCAI_IDS); continue; }
    if (s === 'ticai') { out.push(...TICAI_IDS); continue; }
    if (GAME_IDS.indexOf(s) < 0) {
      console.error(`❌ --only=${s}：不认识的彩种（可选：${GAME_IDS.join(' / ')} / fucai / ticai / all）`);
      process.exit(2);
    }
    out.push(s);
  }
  return out.length ? [...new Set(out)] : null;
}

const ONLY = parseOnly(argv);

/* 【backoff 闸门】参数都解析完了 → 距上次成功不到 N 分钟就直接跳过（不抓、不写） */
if (gateShouldSkip()) process.exit(0);

/* ============================================================
   彩种规则
   ------------------------------------------------------------
   RULES / validateAreas / splitNums / normalizeIssue 都从
   draw-sources.mjs 导入（build-history.mjs 用的是同一份，
   避免两个脚本各维护一份规则导致漂移）。
   ============================================================ */

/* ============================================================
   当前快照（上一次的 draws.js）
   ------------------------------------------------------------
   两个用途：
     1. 期号格式基准 —— 各源期号写法不一（2026117 / 26117），
        拿它的宽度把新抓到的期号写回同一种写法
     2. 「全都抓不到」时保留旧值 —— 【关键】云端 02:00 那一班
        在官方接口 403 的年份里，靠这个不至于把好数据写没
   ============================================================ */
function readSnapshot() {
  try {
    if (!fs.existsSync(OUT_JS)) return { games: {} };
    const src = fs.readFileSync(OUT_JS, 'utf8');
    const ctx = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math, RegExp });
    vm.runInContext(src + '\nglobalThis.__V = DRAW_DATA;', ctx, { filename: 'draws.js' });
    return ctx.__V || { games: {} };
  } catch (e) {
    return { games: {} };
  }
}

/* ============================================================
   工具
   ============================================================ */
const log = (...a) => console.log(...a);
const warn = (...a) => console.warn('  ⚠️ ', ...a);

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`找不到配置文件: ${CONFIG_PATH}`);
  }
  /* 【坑】Windows 上用 PowerShell 的 Set-Content -Encoding utf8 改过这个文件后，
     开头会多一个 UTF-8 BOM（EF BB BF），JSON.parse 会直接报
     "Unexpected token ''"。刚才验收时就踩到了，这里统一去掉 BOM 再解析。 */
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

/** GB2312/GBK 解码（500.com 用的是 GB2312） */
function decodeHtml(buf) {
  const head = buf.slice(0, 3000).toString('latin1');
  const m = /charset=["']?([\w-]+)/i.exec(head);
  const enc = (m ? m[1] : 'utf-8').toLowerCase();
  if (/gb2312|gbk|gb18030/.test(enc)) {
    try { return new TextDecoder('gb18030').decode(buf); } catch { /* 落到下面 */ }
  }
  return buf.toString('utf8');
}

/** 去掉 HTML 标签、脚本、样式，只留文本 */
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 从页面里裁出号码附近的关键片段，省 token */
function extractRelevant(html, maxChars) {
  // 优先找 ball_red / ball_blue 这类号码容器的附近内容
  const marks = [
    /class=["'][^"']*ball[^"']*["'][\s\S]{0,1200}/i,
    /class=["'][^"']*kj[^"']*["'][\s\S]{0,900}/i,
    /第\s*\d{5,7}\s*期[\s\S]{0,900}/,
    /开奖号码[\s\S]{0,900}/
  ];
  const parts = [];
  for (const re of marks) {
    const m = re.exec(html);
    if (m) parts.push(m[0]);
  }
  if (parts.length === 0) {
    // 没命中就用全文的中间段（导航和页脚通常无用）
    const text = htmlToText(html);
    return text.slice(0, maxChars);
  }
  return htmlToText(parts.join(' \n---\n ')).slice(0, maxChars);
}

/* ============================================================
   官方数据源（首选）
   ------------------------------------------------------------
   【已搬到 draw-sources.mjs】官方接口（福彩 cwl.gov.cn / 体彩
   webapi.sporttery.cn）的实现现在和一起彩 / 500XML / 17500 放在一起，
   统一走 fetchDrawWithFallback() 的 fallback 链。
   这样做的好处：这两个文件（build-draws.mjs / build-history.mjs）
   不会再各自维护一份官方接口代码，也就不会各自漂移。
   ============================================================ */

/* ============================================================
   抓取（500.com，备用）
   ============================================================ */
async function fetchPage(url, timeoutMs, retries = 3) {
  let lastErr = '';
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Referer': 'https://kaijiang.500.com/'
        }
      });
      const buf = Buffer.from(await res.arrayBuffer());
      clearTimeout(timer);

      // 反爬检测：正常页面都是几十万字节，被拦的只有不到 2KB 的混淆脚本
      const suspicious = buf.length < 3000 && /__tst_status|_0x[0-9a-f]{4}/i.test(buf.toString('utf8'));
      return {
        ok: res.ok && !suspicious,
        status: res.status,
        size: buf.length,
        blocked: suspicious,
        html: suspicious ? '' : decodeHtml(buf)
      };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e.cause?.code || e.message;
      // 网络抖动才重试，重试之间稍等一下
      if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  return { ok: false, status: 0, size: 0, error: lastErr, html: '' };
}

/* ============================================================
   规则解析（不靠 AI 的兜底方案）
   ============================================================ */
function ruleParse(gameId, html) {
  const text = htmlToText(html);

  // ---------- 期号 ----------
  let issue = null;
  // 形式一：第 26117 期
  let im = /第\s*(\d{4,7})\s*期/.exec(text);
  // 形式二：/shtml/qxc/26117.shtml
  if (!im) im = /\/shtml\/[a-z0-9]+\/(\d{4,7})\.shtml/i.exec(html);
  // 形式三：26117期
  if (!im) im = /(\d{4,7})\s*期/.exec(text);
  if (im) issue = im[1];

  // ---------- 开奖日期 ----------
  let date = '';
  const dm = /开奖日期[：:]\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(text);
  if (dm) {
    date = `${dm[1]}-${String(dm[2]).padStart(2, '0')}-${String(dm[3]).padStart(2, '0')}`;
  }

  // ---------- 号码 ----------
  // 500.com 用不同颜色类名区分球：ball_red / ball_blue / ball_orange 等
  const grab = (colorClass) => {
    const re = new RegExp(`class=["'][^"']*${colorClass}[^"']*["'][^>]*>\\s*(\\d{1,2})\\s*<`, 'gi');
    return [...html.matchAll(re)].map((m) => +m[1]);
  };

  const reds = grab('ball_red');
  const blues = grab('ball_blue');
  const oranges = grab('ball_orange');

  const rule = RULES[gameId];
  if (!rule) return null;
  const areas = {};

  if (gameId === 'ssq') {
    if (reds.length >= 6) areas.red = reds.slice(0, 6);
    if (blues.length >= 1) areas.blue = blues.slice(0, 1);
  } else if (gameId === 'dlt') {
    if (reds.length >= 5) areas.front = reds.slice(0, 5);
    if (blues.length >= 2) areas.back = blues.slice(0, 2);
  } else if (gameId === 'qlc') {
    if (reds.length >= 7) areas.main = reds.slice(0, 7);
    if (blues.length >= 1) areas.special = blues.slice(0, 1);
    else if (reds.length >= 8) { areas.main = reds.slice(0, 7); areas.special = [reds[7]]; }
  } else if (gameId === 'kl8') {
    if (reds.length >= 20) areas.main = reds.slice(0, 20);
    else if (oranges.length >= 20) areas.main = oranges.slice(0, 20);
  } else if (gameId === 'qxc') {
    // 七星彩：7 个 ball_orange，前 6 个是 0-9，最后一个 0-14
    if (oranges.length >= 7) {
      areas.front = oranges.slice(0, 6);
      areas.back = [oranges[6]];
    }
  } else if (rule.areas[0].key === 'main') {
    // 福彩3D / 排列3 / 排列5：三位或五位数字
    const pool = reds.length >= rule.areas[0].need ? reds : oranges;
    if (pool.length >= rule.areas[0].need) areas.main = pool.slice(0, rule.areas[0].need);
  }

  if (Object.keys(areas).length === 0) return null;
  return { issue, date, areas };
}

/* ============================================================
   校验：用 draw-sources.mjs 的 validateAreas（同一份规则）
   ============================================================ */
const validate = validateAreas;


/* ============================================================
   DeepSeek 解析
   ============================================================ */
async function aiParse(cfg, gameId, snippet, fallbackIssue) {
  const rule = RULES[gameId];
  const areaDesc = rule.areas
    .map((a) => `"${a.key}": ${a.need} 个数字（范围 ${a.from}-${a.to}${a.allowRepeat ? '，可重复' : '，不重复'}）`)
    .join('，');

  const sys = '你是一个严谨的数据提取工具。你只能从用户提供的网页文本中提取真实存在的信息，绝对不允许猜测或编造。如果文本里没有开奖号码，就返回 found=false。只输出 JSON，不要任何解释。';

  const user = `从下面这段彩票网页文本里，提取最新一期的开奖号码。

彩种：${rule.name}
需要提取的字段：${areaDesc}
另外还要提取：issue（期号，纯数字字符串）、date（开奖日期 YYYY-MM-DD，没有就留空）

严格按这个 JSON 格式输出：
{"found": true/false, "issue": "期号", "date": "日期", "areas": {"区key": [数字...]}}

注意：
- 只提取网页里真实出现的号码，找不到就 found=false
- 数字必须是整数，不要带前导零
- 不要输出任何 JSON 以外的内容

网页文本：
---
${snippet}
---`;

  const body = {
    model: cfg.model || 'deepseek-chat',
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
    stream: false
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify(body)
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      let hint = '';
      if (res.status === 401) hint = '（API Key 无效，请检查 deepseek.config.json 里的 apiKey）';
      if (res.status === 402) hint = '（账户余额不足）';
      if (res.status === 429) hint = '（请求过于频繁）';
      return { ok: false, error: `HTTP ${res.status} ${hint} ${errText.slice(0, 200)}` };
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || '';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const m = /\{[\s\S]*\}/.exec(content);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* 仍失败 */ } }
    }
    if (!parsed) return { ok: false, error: 'AI 返回的不是合法 JSON' };
    if (parsed.found === false) return { ok: false, error: 'AI 在页面里没找到开奖号码' };

    return { ok: true, data: { issue: parsed.issue || fallbackIssue, date: parsed.date || '', areas: parsed.areas } };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.cause?.code || e.message };
  }
}

/* ============================================================
   主流程
   ============================================================ */
async function main() {
  log('════════════════════════════════════════════');
  log('  春风 · 开奖号码构建');
  log('════════════════════════════════════════════\n');

  const cfg = readConfig();

  // 检查 Key
  const hasKey = cfg.apiKey && cfg.apiKey.trim() !== '';
  if (cfg.ai?.enabled && !NO_AI && !hasKey) {
    log('ℹ️  未配置 DeepSeek apiKey —— 不影响运行。');
    log('    官方接口（福彩/体彩）不需要 Key；仅当 500.com 页面规则解析失败时');
    log('    才需要 AI 兜底解析。想启用就填 deepseek.config.json 的 apiKey。\n');
  }

  /* 【多源 fallback 链】先读上一次的 draws.js：既当「期号格式基准」，
     也是全部源都失败时的保底值（宁可保留旧值也不写错数据） */
  const snapshot = readSnapshot();
  const snapGames = snapshot.games || {};
  const IS_CLOUD = process.env.CLOUD_BUILD === '1' || process.env.GITHUB_ACTIONS === 'true';
  const ORDER = resolveSourceOrder(process.env.DRAW_SOURCE_ORDER, IS_CLOUD);
  const FORCE_FAIL = forcedFailures(process.env.DRAW_FORCE_FAIL);
  const TIMEOUT = cfg.fetch?.timeoutMs || 20000;

  log(`【数据源顺序】${ORDER.map((s) => SOURCE_LABELS[s] || s).join(' → ')}`);
  log(`  出口判定：${IS_CLOUD ? '云端构建（美国出口，官方接口大概率被拒）' : '本机构建（中国出口，官方接口优先）'}`);
  if (FORCE_FAIL.length) log(`  ⚠️ 故障注入生效：${FORCE_FAIL.join(', ')} 被强制视为失败`);
  log(`  上次快照：${Object.keys(snapGames).length} 个彩种`);
  log('');

  const pages = cfg.fetch?.pages || {};
  const results = {};
  const report = [];

  /* 彩种顺序：固定 8 个（与 export-draws.mjs 的 DRAW_GAME_ORDER 一致），
     保证不会因为配置里漏了某个彩种就静默少抓。
     【分班抓取】--only 时只跑指定的那几个（其余沿用上一次的值，见下面写文件处）。 */
  const TARGETS = ONLY || GAME_IDS;
  if (ONLY) {
    log(`【本班只抓】${ONLY.map((g) => (RULES[g] ? RULES[g].name : g)).join(' / ')}（${ONLY.length} 个）`);
    const others = GAME_IDS.filter((g) => ONLY.indexOf(g) < 0);
    log(`  其余 ${others.length} 个沿用上一次的值：${others.map((g) => (RULES[g] ? RULES[g].name : g)).join(' / ')}`);
    log('');
  }

  for (const gameId of TARGETS) {
    const rule = RULES[gameId];
    if (!rule) continue;
    const url = pages[gameId] || '';
    const snap = snapGames[gameId] || null;
    log(`【${rule.name}】`);

    let parsed = null;
    let method = '';
    let sourceLabel = '';
    let triedList = [];

    /* ---------- 第一优先：多源 fallback 链（官方 → 一起彩 → 500XML → 17500） ---------- */
    const fb = await fetchDrawWithFallback(gameId, {
      order: ORDER,
      forceFail: FORCE_FAIL,
      timeoutMs: TIMEOUT,
      snapIssue: snap?.issue,
      onTry: (s) => log(s)
    });
    triedList = fb.tried || [];

    if (fb.ok) {
      parsed = { issue: fb.issue, date: fb.date, areas: fb.areas };
      method = SOURCE_LABELS[fb.sourceId] || '备选源';
      sourceLabel = fb.sourceLabel;
    } else {
      warn(`结构化数据源全部失败（${fb.tried.length} 个都试过了）`);
    }

    /* ---------- 兜底：500.com 开奖页（规则解析 / 缓存 / AI） ----------
       只在上面所有结构化源都失败时才走这条路。
       注意：这里【绝不调用 DeepSeek】，除非显式传 --ai；
       云端构建必须零成本，不能因为某个源挂了就偷偷花 token。 */
    let html = '';
    let fromCache = false;

    if (!parsed && cfg.fetch?.enabled !== false && url) {
      const r = await fetchPage(url, TIMEOUT);
      if (r.blocked) {
        warn(`500.com 页面被反爬拦截（${r.size} 字节混淆脚本）`);
      } else if (!r.ok) {
        warn(`500.com 页面抓取失败：${r.error || 'HTTP ' + r.status}`);
      } else {
        html = r.html;
        log(`  500.com 页面抓取成功 ${(r.size / 1024).toFixed(1)} KB`);
        if (!DRY_RUN) {
          fs.mkdirSync(CACHE_DIR, { recursive: true });
          fs.writeFileSync(path.join(CACHE_DIR, `${gameId}.html`), html, 'utf8');
        }
      }
    }

    // 抓不到就用上次缓存的页面（数据会旧，但总比没有好）
    if (!parsed && !html && cfg.fetch?.enabled !== false && url) {
      const cacheFile = path.join(CACHE_DIR, `${gameId}.html`);
      if (fs.existsSync(cacheFile)) {
        html = fs.readFileSync(cacheFile, 'utf8');
        fromCache = true;
        log(`  改用缓存页面（${(html.length / 1024).toFixed(1)} KB）`);
      }
    }

    /* ---------- 规则解析 ---------- */
    let byRule = null;
    if (!parsed && html) {
      byRule = ruleParse(gameId, html);
      if (byRule) {
        const v = validate(gameId, byRule);
        const iss = normalizeIssue(byRule.issue, snap?.issue);
        if (v.ok && iss) {
          parsed = { issue: iss, date: byRule.date || '', areas: v.areas };
          method = '500页面规则解析';
          sourceLabel = fromCache ? '500彩票网（缓存页面）' : '500彩票网（规则解析）';
        } else if (!v.ok) {
          warn(`规则解析结果校验不通过：${v.reason}`);
        } else {
          warn(`规则解析期号异常：${byRule.issue}`);
        }
      }
      if (!parsed) warn('规则解析没提取到号码');
    }

    /* ---------- 最后：DeepSeek 解析（【只在显式 --ai 时启用，默认关闭】） ---------- */
    const useAi = cfg.ai?.enabled !== false && AI_ALLOWED && hasKey;
    if (!parsed && html && useAi) {
      const snippet = extractRelevant(html, cfg.ai?.maxHtmlChars || 30000);
      log(`  交给 DeepSeek 解析（${snippet.length} 字符）...`);
      const ai = await aiParse(cfg, gameId, snippet, byRule?.issue);
      if (ai.ok) {
        const v = validate(gameId, ai.data);
        const iss = normalizeIssue(ai.data.issue, snap?.issue);
        if (v.ok && iss) {
          parsed = { issue: iss, date: ai.data.date || '', areas: v.areas };
          method = 'AI 解析';
          sourceLabel = '500彩票网（DeepSeek 解析）';
        } else {
          warn(`AI 结果校验不通过：${v.ok ? '期号异常 ' + ai.data.issue : v.reason}`);
        }
      } else {
        warn(`AI 解析失败：${ai.error}`);
      }
    }

    /* ---------- 汇总 ---------- */
    if (parsed && parsed.issue) {
      results[gameId] = {
        issue: String(parsed.issue),
        date: parsed.date || '',
        source: sourceLabel,
        areas: parsed.areas
      };
      const shown = Object.entries(parsed.areas).map(([k, v]) => `${k}=${v.join(' ')}`).join('  ');
      const same = sameAsSnapshot({ issue: parsed.issue, areas: parsed.areas }, snap);
      log(`  ✅ ${method} 成功 · 第 ${parsed.issue} 期${same ? '（与上次相同）' : '（★ 新一期）'}`);
      log(`     ${shown}`);
      report.push({
        gameId, name: rule.name, status: '成功（' + method + '）',
        source: sourceLabel, issue: String(parsed.issue), date: parsed.date || '', same
      });
    } else {
      /* ---------- 【全部源都失败】保留上一次的值 + 明确告警 ----------
         绝对不写空值：宁可让页面显示旧一期，也不能让开奖号变成空白。
         这一条是云端构建的「安全网」—— 抓不到时至少不会比同步过去的数据更差。 */
      if (snap && snap.areas && snap.issue) {
        results[gameId] = {
          issue: String(snap.issue),
          date: snap.date || '',
          source: (snap.source || '') + '（沿用上一次：本次全部数据源失败）',
          areas: snap.areas
        };
        warn(`全部源都失败 → 【保留上一次的值】第 ${snap.issue} 期（${snap.date || '日期未知'}）`);
        report.push({
          gameId, name: rule.name, status: '全部源失败·保留旧值',
          source: (snap.source || '') + '（沿用上一次）', issue: String(snap.issue), date: snap.date || '', same: true, keptOld: true
        });
      } else {
        warn('全部源都失败，而且上一次也没有数据 → 这个彩种本次没有开奖数据');
        report.push({ gameId, name: rule.name, status: '全部源失败·且无旧值可保留', source: '', issue: '', date: '', keptOld: true });
      }
      log(`     失败明细：${triedList.map((t) => `${t.label}(${t.error})`).join(' / ')}`);
    }
    log('');
  }

  // 5. 写文件
  /* 【时区·别再改回 toISOString】必须用【北京时间】（理由同 build-history.mjs）：
     toISOString() 是 UTC，会让页面「数据快照」比真实时间早 8 小时 ——
     实测 draws.js 的 mtime 是 10-17 02:00:02，updated 却写 10-16 18:00:02。 */
  const _d = new Date(), _p2 = (x) => String(x).padStart(2, '0');
  const now = `${_d.getFullYear()}-${_p2(_d.getMonth() + 1)}-${_p2(_d.getDate())} `
    + `${_p2(_d.getHours())}:${_p2(_d.getMinutes())}:${_p2(_d.getSeconds())}`;

  /* 【分班抓取必须补齐另外几个彩种】------------------------------------------------
     --only 只抓了 4 个，剩下 4 个如果直接写空，
     页面上的「最新开奖」就会少 4 张卡、彩种区块也会缺开奖号码。
     所以这里按固定顺序把【没抓到的彩种沿用上一次快照的值】补回来，
     保证 draws.js 永远都是完整的 8 个彩种。 */
  const merged = {};
  const carried = [];
  for (const gid of GAME_IDS) {
    if (results[gid]) { merged[gid] = results[gid]; continue; }
    if (snapGames[gid]) { merged[gid] = snapGames[gid]; carried.push(gid); }
  }

  const out = {
    updated: now,
    note: ONLY
      ? `由 build-draws.mjs 自动生成（本班只抓 ${ONLY.join(',')}，其余沿用上一次），请勿手动编辑`
      : '由 build-draws.mjs 自动生成，请勿手动编辑',
    games: merged
  };

  if (DRY_RUN) {
    log('（--dry-run，不写文件）\n结果预览：');
    log(JSON.stringify(out, null, 2));
  } else {
    const js = `/* 自动生成，请勿手动编辑 · ${now} */\n` +
      `const DRAW_DATA = ${JSON.stringify(out, null, 2)};\n`;
    fs.writeFileSync(OUT_JS, js, 'utf8');
    /* 【backoff 闸门】真写了文件才算成功（--dry-run 不记） */
    gateMarkSuccess();
    log(`✅ 已写入 ${OUT_JS}（${Object.keys(merged).length} 个彩种` +
      (carried.length ? `，其中 ${carried.length} 个沿用上一次：${carried.join(' / ')}` : '') + '）');
  }

  // 6. 报告
  log('\n────────── 结果汇总 ──────────');
  log('  彩种      期号        日期         来源');
  for (const r of report) {
    const icon = r.status.startsWith('成功') ? (r.same ? '＝' : '✅') : '⚠️ ';
    log(`  ${icon} ${r.name.padEnd(6, '　')} ${String(r.issue || '—').padEnd(10)} ${String(r.date || '—').padEnd(12)} ${r.source || '—'}`);
  }
  const okCount = report.filter((r) => r.status.startsWith('成功')).length;
  const keptCount = report.filter((r) => r.keptOld).length;
  const freshCount = report.filter((r) => r.status.startsWith('成功') && !r.same).length;
  log(`\n  成功 ${okCount} / ${report.length} 个彩种　（其中新一期 ${freshCount} 个，与上次同期 ${okCount - freshCount} 个）`);
  if (carried.length) {
    log(`  · 本班不抓的 ${carried.length} 个彩种已沿用上一次的值：` +
      carried.map((g) => `${RULES[g] ? RULES[g].name : g}(第 ${merged[g].issue} 期)`).join(' / '));
  }
  log(`  写出的 draws.js 覆盖 ${Object.keys(merged).length} / ${GAME_IDS.length} 个彩种`);
  if (keptCount) log(`  ⚠️  ${keptCount} 个彩种所有源都失败，已保留上一次的值（没有写入错误数据）`);
  log(`  生成时间：${now}`);
  if (okCount === 0) {
    log('\n  ⚠️ 一个彩种都没抓到：所有数据源都不可用。');
    log('     已尽量保留旧值；请检查网络，或调整 DRAW_SOURCE_ORDER 换源。');
  }
  if (keptCount) process.exitCode = 0;   // 保留旧值不算失败，云端不该因此回滚
}

main().catch((e) => {
  console.error('\n❌ 出错了：', e.message);
  process.exit(1);
});
