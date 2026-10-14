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
   彩种规则（用于校验 AI 的解析结果，防止幻觉）
   ============================================================ */
const RULES = {
  ssq:  { name: '双色球', areas: [{ key: 'red', need: 6, from: 1, to: 33 }, { key: 'blue', need: 1, from: 1, to: 16 }] },
  dlt:  { name: '大乐透', areas: [{ key: 'front', need: 5, from: 1, to: 35 }, { key: 'back', need: 2, from: 1, to: 12 }] },
  qlc:  { name: '七乐彩', areas: [{ key: 'main', need: 7, from: 1, to: 30 }, { key: 'special', need: 1, from: 1, to: 30 }] },
  qxc:  { name: '七星彩', areas: [{ key: 'front', need: 6, from: 0, to: 9, allowRepeat: true }, { key: 'back', need: 1, from: 0, to: 14 }] },
  kl8:  { name: '快乐8', areas: [{ key: 'main', need: 20, from: 1, to: 80 }] },
  fc3d: { name: '福彩3D', areas: [{ key: 'main', need: 3, from: 0, to: 9, allowRepeat: true }] },
  pl3:  { name: '排列3', areas: [{ key: 'main', need: 3, from: 0, to: 9, allowRepeat: true }] },
  pl5:  { name: '排列5', areas: [{ key: 'main', need: 5, from: 0, to: 9, allowRepeat: true }] }
};

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
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
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
   福彩：中国福彩网 cwl.gov.cn 的公开查询接口，返回结构化 JSON
   体彩：国家体彩中心 webapi.sporttery.cn，同样返回 JSON
   官方接口拿不到时，才退回抓 500.com 页面
   ============================================================ */

/** 福彩官方接口返回的彩种代号 */
const CWL_NAME = {
  ssq: 'ssq',
  fc3d: '3d',
  kl8: 'kl8',
  qlc: 'qlc'
};

/** 体彩官方接口的 gameNo */
const SPORTTERY_GAMENO = {
  dlt: 85,
  pl3: 35
};

/** 万能请求：拿 JSON */
async function fetchJson(url, timeoutMs, referer) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': referer || 'https://www.cwl.gov.cn/'
      }
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const text = await res.text();
    try {
      return { ok: true, json: JSON.parse(text) };
    } catch (e) {
      return { ok: false, error: '返回的不是 JSON' };
    }
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.cause?.code || e.message };
  }
}

/* 【重试包装】官方接口偶尔会抽风（实测遇到 UND_ERR_CONNECT_TIMEOUT），
   一次超时就会让那个彩种整个丢掉 —— 彩种少了页面就显示旧数据，
   而「最新开奖」看起来就像"没更新"。
   所以这里统一重试 4 次、每次间隔递增（1s/2s/3s）。
   只重试网络层错误；解析出来的业务错误（接口返回 code!=0）不重试。 */
async function fetchJsonRetry(url, timeoutMs, referer) {
  var lastErr = null;
  for (var attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fetchJson(url, timeoutMs, referer);
    } catch (e) {
      lastErr = e;
      var msg = String((e && (e.cause && e.cause.code)) || (e && e.message) || e);
      /* 业务性错误（比如接口明确报错）不重试，直接抛 */
      if (/接口返回|解析失败|没有数据|not found|404/i.test(msg)) throw e;
      if (attempt < 4) {
        var wait = attempt * 1000;
        console.log('     ↻ 第 ' + attempt + ' 次失败（' + msg.slice(0, 40) + '），' + (wait / 1000) + ' 秒后重试…');
        await new Promise(function (r) { setTimeout(r, wait); });
      }
    }
  }
  throw lastErr;
}


/** 把 "04,11,14" 或 "04 11 14" 或 "04\n" 解析成数字数组 */
function splitNums(str) {
  if (!str) return [];
  return String(str)
    .trim()
    .split(/[\s,，、]+/)
    .filter((s) => s !== '')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isInteger(n));
}

/**
 * 福彩官方：双色球 / 福彩3D / 快乐8 / 七乐彩
 * 接口：https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice
 */
async function officialCwl(gameId, timeoutMs) {
  const name = CWL_NAME[gameId];
  if (!name) return { ok: false, error: '该彩种没有配置福彩接口' };

  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=${name}&issueCount=1&issueStart=&issueEnd=&dayStart=&dayEnd=`;
  const r = await fetchJsonRetry(url, timeoutMs);
  if (!r.ok) return r;

  const item = r.json?.result?.[0];
  if (!item) return { ok: false, error: '接口没有返回数据' };

  const areas = {};
  if (gameId === 'ssq') {
    areas.red = splitNums(item.red);
    areas.blue = splitNums(item.blue);
  } else if (gameId === 'fc3d') {
    areas.main = splitNums(item.red);
  } else if (gameId === 'kl8') {
    areas.main = splitNums(item.red);
  } else if (gameId === 'qlc') {
    areas.main = splitNums(item.red);
    // 七乐彩的特别号在 blue 字段里
    const sp = splitNums(item.blue);
    if (sp.length) areas.special = sp;
  }

  return {
    ok: true,
    issue: String(item.code || ''),
    date: (item.date || '').replace(/\(.*?\)/g, '').trim(),
    areas,
    source: '中国福彩网（官方）'
  };
}

/**
 * 体彩官方：大乐透 / 排列3
 * 接口：https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry
 */
async function officialSporttery(gameId, timeoutMs) {
  const gameNo = SPORTTERY_GAMENO[gameId];
  if (!gameNo) return { ok: false, error: '该彩种没有配置体彩接口' };

  const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=${gameNo}&provinceId=0&pageSize=1&isVerify=1&pageNo=1`;
  const r = await fetchJsonRetry(url, timeoutMs, 'https://www.lottery.gov.cn/');
  if (!r.ok) return r;

  const item = r.json?.value?.list?.[0];
  if (!item) return { ok: false, error: '接口没有返回数据' };

  const all = splitNums(item.lotteryDrawResult);
  const areas = {};

  if (gameId === 'dlt') {
    // 大乐透返回 7 个数：前 5 个前区，后 2 个后区
    if (all.length >= 7) {
      areas.front = all.slice(0, 5);
      areas.back = all.slice(5, 7);
    } else {
      return { ok: false, error: `号码个数不对：${all.length}` };
    }
  } else if (gameId === 'pl3') {
    areas.main = all;
  }

  return {
    ok: true,
    issue: String(item.lotteryDrawNum || ''),
    date: item.lotteryDrawTime || '',
    areas,
    source: '中国体彩网（官方）'
  };
}

/** 按彩种选择官方接口 */
async function officialFetch(gameId, timeoutMs) {
  if (CWL_NAME[gameId]) return officialCwl(gameId, timeoutMs);
  if (SPORTTERY_GAMENO[gameId]) return officialSporttery(gameId, timeoutMs);
  return { ok: false, error: '该彩种暂无官方接口，将退回 500.com' };
}

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
   校验（同时用于规则解析和 AI 解析的结果）
   ============================================================ */
function validate(gameId, data) {
  const rule = RULES[gameId];
  if (!rule) return { ok: false, reason: '未知彩种' };
  if (!data || !data.areas) return { ok: false, reason: '没有号码' };

  const out = {};
  for (const a of rule.areas) {
    const nums = data.areas[a.key];
    if (!Array.isArray(nums)) return { ok: false, reason: `缺少「${a.key}」` };
    if (nums.length !== a.need) return { ok: false, reason: `「${a.key}」需要 ${a.need} 个，实际 ${nums.length} 个` };
    if (nums.some((n) => !Number.isInteger(n) || n < a.from || n > a.to)) {
      return { ok: false, reason: `「${a.key}」有号码超出 ${a.from}-${a.to}` };
    }
    if (!a.allowRepeat && new Set(nums).size !== nums.length) {
      return { ok: false, reason: `「${a.key}」有重复号码` };
    }
    out[a.key] = nums;
  }
  return { ok: true, areas: out };
}

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
  log('  春风十里送大奖 · 开奖号码构建');
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
     保证不会因为配置里漏了某个彩种就静默少抓 */
  for (const gameId of GAME_IDS) {
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
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const out = {
    updated: now,
    note: '由 build-draws.mjs 自动生成，请勿手动编辑',
    games: results
  };

  if (DRY_RUN) {
    log('（--dry-run，不写文件）\n结果预览：');
    log(JSON.stringify(out, null, 2));
  } else {
    const js = `/* 自动生成，请勿手动编辑 · ${now} */\n` +
      `const DRAW_DATA = ${JSON.stringify(out, null, 2)};\n`;
    fs.writeFileSync(OUT_JS, js, 'utf8');
    log(`✅ 已写入 ${OUT_JS}（${Object.keys(results).length} 个彩种）`);
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
