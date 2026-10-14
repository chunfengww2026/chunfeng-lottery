// ============================================================
//  draw-sources.mjs —— 开奖号码「多源抓取」共享模块
//
//  为什么要有这个文件：
//    GitHub Actions 的服务器在美国，抓中国彩票官方接口会被拒：
//      · 福彩 cwl.gov.cn      → HTTP 403
//      · 体彩 sporttery.cn    → HTTP 567
//    云端 02:00 那一班（full）因此只能吃本机同步过去的数据 ——
//    电脑一关机，开奖号码/期号/日期就一直是旧的。
//
//  解决办法：每个彩种按顺序试多个源，任一成功即采用，全失败才保留旧值。
//    源列表（顺序见 DEFAULT_ORDER / CLOUD_ORDER）：
//      official  官方接口（福彩/体彩）—— 最权威，本机首选
//      yiqicai   一起彩 www.yiqicai.com/kj/ —— 一个页面覆盖全部 8 个彩种
//      fc500     500彩票网静态 XML（kaijiang.500.com/static/.../list.xml）
//      fc17500   17500.cn 明文 TXT（getData/*.TXT）
//
//  【可达性说明 · 重要】
//    本机（中国移动 120.231.138.19 / 上海）实测：
//      official 通、yiqicai 通、fc500 通、fc17500 通 —— 全部可解析。
//    但【本机出口不是美国】，所以「云端到底哪个能通」无法在本机证伪/证实。
//    因此顺序在云端可配置，见下面 CLOUD_ORDER 与 DRAW_SOURCE_ORDER 环境变量。
//    yiqicai 是唯一有旁证「美国 IP 可访问」的第三方源（任务里已实测 200）。
//
//  所有号码一律经过 validateAreas() 校验（个数/范围/重复），
//  任何一项不合法就当作这个源失败，继续试下一个 —— 宁可保留旧值也不写错数据。
// ============================================================

/* ============================================================
   彩种规则（校验用）
   ============================================================ */
export const RULES = {
  ssq: { name: '双色球', areas: [{ key: 'red', need: 6, from: 1, to: 33 }, { key: 'blue', need: 1, from: 1, to: 16 }] },
  dlt: { name: '大乐透', areas: [{ key: 'front', need: 5, from: 1, to: 35 }, { key: 'back', need: 2, from: 1, to: 12 }] },
  qlc: { name: '七乐彩', areas: [{ key: 'main', need: 7, from: 1, to: 30 }, { key: 'special', need: 1, from: 1, to: 30 }] },
  qxc: { name: '七星彩', areas: [{ key: 'front', need: 6, from: 0, to: 9, allowRepeat: true }, { key: 'back', need: 1, from: 0, to: 14 }] },
  kl8: { name: '快乐8', areas: [{ key: 'main', need: 20, from: 1, to: 80 }] },
  fc3d: { name: '福彩3D', areas: [{ key: 'main', need: 3, from: 0, to: 9, allowRepeat: true }] },
  pl3: { name: '排列3', areas: [{ key: 'main', need: 3, from: 0, to: 9, allowRepeat: true }] },
  pl5: { name: '排列5', areas: [{ key: 'main', need: 5, from: 0, to: 9, allowRepeat: true }] }
};

/** 8 个彩种的固定顺序（报告和日志用） */
export const GAME_IDS = ['ssq', 'dlt', 'qlc', 'qxc', 'kl8', 'fc3d', 'pl3', 'pl5'];

/** 每个彩种「一期」需要抓的期数（最新 1 期） */
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

/* ============================================================
   多源开关与顺序
   ------------------------------------------------------------
   DRAW_SOURCE_ORDER  逗号分隔，覆盖默认顺序（逗号留空 = 关掉某个源）
   DRAW_FORCE_FAIL    逗号分隔，强制这些源失败（故障注入验收用）
   DRAW_500XML_BASE   覆盖 500.com XML 根地址（假源验收用）
   DRAW_YIQICAI_BASE  覆盖一起彩根地址（假源验收用）
   DRAW_17500_BASE    覆盖 17500 根地址（假源验收用）
   ============================================================ */
export const SOURCE_LABELS = {
  official: '官方接口',
  yiqicai: '一起彩',
  fc500: '500彩票网XML',
  fc17500: '17500.cn'
};

/* 本机（中国出口）：官方最权威 → 一起彩 → 500 XML → 17500 */
export const DEFAULT_ORDER = ['official', 'yiqicai', 'fc500', 'fc17500'];

/* 云端（美国出口）：官方接口大概率 403/567。
   放在最后当「兜底尝试」（万一哪天通了就自动用回权威源），
   主用一起彩（唯一有美国可达旁证），再退 500 XML / 17500。 */
export const CLOUD_ORDER = ['yiqicai', 'fc500', 'fc17500', 'official'];

/**
 * 解析出这次运行要用的源顺序
 * @param {string} [envOrder] DRAW_SOURCE_ORDER 的值
 * @param {boolean} [isCloud] 是否云端构建
 */
export function resolveSourceOrder(envOrder, isCloud) {
  const raw = (envOrder || '').trim();
  if (raw) {
    return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return isCloud ? CLOUD_ORDER.slice() : DEFAULT_ORDER.slice();
}

/** DRAW_FORCE_FAIL 里列出的源 */
export function forcedFailures(envForce) {
  const raw = (envForce || '').trim();
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/* ============================================================
   通用抓取（超时 + 重试）
   ============================================================ */

/** 带超时的 fetch，返回 Buffer；失败抛异常 */
async function fetchBuf(url, timeoutMs, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, ...(headers || {}) }
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, ok: res.ok, buf, text: buf.toString('utf8') };
  } finally {
    clearTimeout(timer);
  }
}

/** 状态码值不值得重试：5xx / 408 / 429 是服务端抽风，值得再试 */
function retryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * 【核心】带超时 + 重试的抓取
 *   —— 和原来 build-draws.mjs 里的 fetchJsonRetry 相比，这里【真的会重试】
 *      业务失败（原版只在 throw 时重试，而 fetchJson 是 return {ok:false}，
 *      所以 HTTP 错误其实一次都不会重试）。
 *   重试策略：
 *     · 网络层错误（超时/断连）→ 重试
 *     · 5xx / 408 / 429        → 重试
 *     · 403 / 404 / 567(...)   → 不重试（这是明确的拒绝，重试浪费时间）
 * @returns {Promise<{ok:boolean, text?:string, status?:number, error?:string, attempts?:number}>}
 */
export async function fetchTextRetry(url, { timeoutMs = 15000, tries = 3, headers, label = '' } = {}) {
  let lastErr = '';
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const r = await fetchBuf(url, timeoutMs, headers);
      if (r.status === 200) return { ok: true, text: r.text, status: r.status, attempts: attempt };
      lastErr = 'HTTP ' + r.status;
      if (!retryableStatus(r.status)) return { ok: false, status: r.status, error: lastErr, attempts: attempt };
    } catch (e) {
      lastErr = e?.cause?.code || e?.name === 'AbortError' ? '超时' : (e?.cause?.code || e?.message || String(e));
      if (e?.name === 'AbortError') lastErr = '超时';
    }
    if (attempt < tries) {
      const wait = Math.min(1000 * attempt, 2500);
      if (label) console.log(`     ↻ ${label} 第 ${attempt} 次失败（${lastErr}），${(wait / 1000).toFixed(1)}s 后重试…`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return { ok: false, status: 0, error: lastErr, attempts: tries };
}

/** 抓 JSON（在 fetchTextRetry 之上加 JSON 解析） */
export async function fetchJsonRetry(url, opts = {}) {
  const r = await fetchTextRetry(url, opts);
  if (!r.ok) return r;
  try {
    return { ok: true, json: JSON.parse(r.text), status: r.status, attempts: r.attempts };
  } catch (e) {
    return { ok: false, status: r.status, error: '返回的不是 JSON', attempts: r.attempts };
  }
}

/* ============================================================
   工具
   ============================================================ */
export const log = (...a) => console.log(...a);
export const warn = (...a) => console.warn('  ⚠️ ', ...a);

/** "04,11,14" / "04 11 14" / "04,11 14" → [4,11,14] */
export function splitNums(str) {
  if (str === null || str === undefined) return [];
  return String(str).trim().split(/[\s,，、+|]+/).filter((s) => s !== '')
    .map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n));
}

/** 把日期统一成 YYYY-MM-DD；认不出来就返回原串（不编造） */
export function normalizeDate(s) {
  if (!s) return '';
  const t = String(s).trim();
  let m = /(\d{4})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return t.replace(/\(.*?\)/g, '').trim();
}

/* ============================================================
   【期号归一化】
   ------------------------------------------------------------
   同一个彩种在不同源里期号写法不一致，实测：
     · 大乐透 / 七星彩  官方 26117  ／ 一起彩 2026117
     · 快乐8            官方 2026273 ／ 一起彩 & 500XML 26273
     · 排列3 / 排列5    官方 26273  ／ 一起彩 2026273
   直接混用会让「期号」这一列在页面上跳来跳去。
   策略：拿【当前 draws.js 里的期号】当格式基准，把新抓到的期号
        折算成同一个写法再比较；折算不出同一年就拒绝（绝不写错期号）。
   这和 export-draws.mjs / latest-draws.js 里 newerDraw() 的口径一致。
   ============================================================ */

/** 把期号折算成「同一写法」的去年前缀形式（2026273 / 2026117 → 26273 / 26117） */
function issueCore(digits) {
  if (digits.length === 7 && /^20\d{5}$/.test(digits)) return digits.slice(2);  // 2026273 → 26273
  return digits;                                                                // 26273 / 26117 原样
}

/** 按【同一批数据自己的宽度】把期号写成统一格式（一批历史共用一种写法）
 *  历史数据的关键点：不能拿「最新一期」当格式基准 —— 500XML 里最新一期是
 *  26116（5 位），而它文件里更老的期号是 2026115（7 位），
 *  混在一批里会让同一批数据出现两种写法，去重也会失效。 */
export function formatIssueLike(issue, reference) {
  const s = String(issue || '').replace(/\D/g, '');
  const ref = String(reference || '').replace(/\D/g, '');
  if (!s || !ref || s.length === ref.length || ref.length < 5) return s;
  const core = issueCore(s);
  if (core.length === ref.length) return core;                    // 去掉年位就够长（7 → 6/5）
  if (s.length < ref.length) {
    // 补年位：26273 + '20' → 2026273；26117 + '2' → 226117（错）→ 所以只在
    // 「补 '20' 后长度正好」时补 '20'，否则退回补一位 '2'
    const with20 = '20' + s;
    if (with20.length === ref.length) return with20;
    const with2 = '2' + s;
    if (with2.length === ref.length) return with2;
  }
  return s;
}

/**
 * 把源返回的期号写成「快照的格式」
 * @param {string} raw     源返回的期号
 * @param {string} [snapIssue] 基准期号（只用它的宽度当格式基准）
 * @param {boolean} [requireNewer=false]
 *        true  = 抓「最新一期」用：比基准还旧的期号 → 判为可疑，返回 null
 *        false = 抓「历史多期」用：历史本来就比基准旧，只要格式能对上就接受
 *                （build-history.mjs 必须用 false，否则 60 期会被砍成 1 期）
 * @returns {string|null}
 */
export function normalizeIssue(raw, snapIssue, requireNewer) {
  const s = String(raw === null || raw === undefined ? '' : raw).replace(/\D/g, '');
  if (!s) return null;
  if (snapIssue === null || snapIssue === undefined || snapIssue === '') return s;
  const snap = String(snapIssue).replace(/\D/g, '');
  if (!snap) return s;
  if (s === snap) return s;

  const w = snap.length;
  const aligned = formatIssueLike(s, snap);           // 折算成快照的宽度
  if (aligned === snap) return snap;                  // 同一期（只是年份写法不同）
  if (aligned.length !== w) return requireNewer ? null : s;   // 宽度对不上 → 抓最新时拒绝

  const cs = issueCore(s), cn = issueCore(snap);
  if (cs.length === cn.length && cs.length >= 5 && /^\d+$/.test(cs) && /^\d+$/.test(cn)) {
    // 比基准旧：抓最新一期时判为可疑；抓历史时必须接受
    if (Number(cs) < Number(cn) && requireNewer) return null;
  } else if (requireNewer) {
    return null;                                      // 折算不出同一年 → 抓最新时拒绝
  }
  return aligned;                                     // 统一写成快照的格式
}

/* ============================================================
   校验（所有源的结果都要过这一关）
   ============================================================ */
/**
 * @param {string} gameId
 * @param {object} data  { areas: {...} }
 * @returns {{ok:boolean, areas?:object, reason?:string}}
 */
export function validateAreas(gameId, data) {
  const rule = RULES[gameId];
  if (!rule) return { ok: false, reason: '未知彩种' };
  if (!data || !data.areas) return { ok: false, reason: '没有号码' };

  const out = {};
  for (const a of rule.areas) {
    const nums = data.areas[a.key];
    if (!Array.isArray(nums)) return { ok: false, reason: `缺少「${a.key}」` };
    if (nums.length !== a.need) return { ok: false, reason: `「${a.key}」需要 ${a.need} 个，实际 ${nums.length} 个` };
    if (nums.some((n) => !Number.isInteger(n) || n < a.from || n > a.to)) {
      return { ok: false, reason: `「${a.key}」有号码超出 ${a.from}-${a.to}（${nums.join(',')}）` };
    }
    if (!a.allowRepeat && new Set(nums).size !== nums.length) {
      return { ok: false, reason: `「${a.key}」有重复号码（${nums.join(',')}）` };
    }
    out[a.key] = nums;
  }
  return { ok: true, areas: out };
}

/**
 * 【跨源一致性】判断抓到的这一期是不是「和现有快照同期」
 * 用途：报告里标出「与本地一致」，方便一眼看出云端数据是不是真的更新了
 */
export function sameAsSnapshot(draw, snap) {
  if (!draw || !snap) return false;
  if (String(draw.issue) !== String(snap.issue)) return false;
  const keys = new Set([...Object.keys(draw.areas || {}), ...Object.keys(snap.areas || {})]);
  for (const k of keys) {
    const a = (draw.areas || {})[k] || [];
    const b = (snap.areas || {})[k] || [];
    if (a.join(',') !== b.join(',')) return false;
  }
  return true;
}

/* ============================================================
   源 ①　官方接口
   ============================================================ */
/** 福彩官方接口的彩种代号 */
export const CWL_NAME = { ssq: 'ssq', fc3d: '3d', kl8: 'kl8', qlc: 'qlc' };
/** 体彩官方接口的 gameNo（85=大乐透 35=排列3 350133=排列5 04=七星彩） */
export const SPORTTERY_GAMENO = { dlt: 85, pl3: 35, pl5: '350133', qxc: '04' };

/** 福彩官方：双色球/福彩3D/快乐8/七乐彩 */
export async function fromOfficialCwl(gameId, timeoutMs) {
  const name = CWL_NAME[gameId];
  if (!name) return { ok: false, error: '该彩种没有配置福彩接口' };
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=${name}&issueCount=1&issueStart=&issueEnd=&dayStart=&dayEnd=`;
  const r = await fetchJsonRetry(url, { timeoutMs, tries: 3, label: '福彩官方' });
  if (!r.ok) return { ok: false, error: r.error };

  const item = r.json?.result?.[0];
  if (!item) return { ok: false, error: '接口没有返回数据' };

  const areas = {};
  if (gameId === 'ssq') { areas.red = splitNums(item.red); areas.blue = splitNums(item.blue); }
  else if (gameId === 'qlc') {
    areas.main = splitNums(item.red);
    const sp = splitNums(item.blue);          // 七乐彩特别号在 blue 字段
    if (sp.length) areas.special = sp;
  } else areas.main = splitNums(item.red);    // 3D / 快乐8

  return {
    ok: true, issue: String(item.code || ''), date: normalizeDate(item.date), areas,
    sourceLabel: '中国福彩网（官方）', sourceId: 'official'
  };
}

/** 体彩官方：大乐透/排列3/排列5/七星彩 */
export async function fromOfficialSporttery(gameId, timeoutMs) {
  const gameNo = SPORTTERY_GAMENO[gameId];
  if (gameNo === undefined) return { ok: false, error: '该彩种没有配置体彩接口' };
  const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=${gameNo}&provinceId=0&pageSize=1&isVerify=1&pageNo=1`;
  const r = await fetchJsonRetry(url, { timeoutMs, tries: 3, headers: { Referer: 'https://www.lottery.gov.cn/' }, label: '体彩官方' });
  if (!r.ok) return { ok: false, error: r.error };

  const item = r.json?.value?.list?.[0];
  if (!item) return { ok: false, error: '接口没有返回数据' };

  const all = splitNums(item.lotteryDrawResult);
  const areas = {};
  if (gameId === 'dlt') {
    if (all.length < 7) return { ok: false, error: `号码个数不对：${all.length}` };
    areas.front = all.slice(0, 5); areas.back = all.slice(5, 7);
  } else if (gameId === 'qxc') {
    if (all.length < 7) return { ok: false, error: `号码个数不对：${all.length}` };
    areas.front = all.slice(0, 6); areas.back = all.slice(6, 7);
  } else if (gameId === 'pl5') {
    areas.main = all.slice(0, 5);
  } else {
    areas.main = all;
  }

  return {
    ok: true, issue: String(item.lotteryDrawNum || ''), date: normalizeDate(item.lotteryDrawTime), areas,
    sourceLabel: '中国体彩网（官方）', sourceId: 'official'
  };
}

/** 官方源统一入口（按彩种自动选福彩/体彩） */
export async function fromOfficial(gameId, timeoutMs) {
  if (CWL_NAME[gameId]) return fromOfficialCwl(gameId, timeoutMs);
  if (SPORTTERY_GAMENO[gameId] !== undefined) return fromOfficialSporttery(gameId, timeoutMs);
  return { ok: false, error: '该彩种没有官方接口' };
}

/* ============================================================
   源 ②　一起彩（www.yiqicai.com）
   ------------------------------------------------------------
   /kj/ 一个页面就把 8 个彩种的「最新一期」全列出来：
       <li class="liTable-body"> 彩种名 / NNNN期 / YYYY-MM-DD / 号码球
   页面里的号码球样式（实测 2026-10-15）：
       双色球  6×red-ball + 1×blue-ball
       大乐透  5×red-ball + 2×blue-ball
       福彩3D  3×red-ball
       排列三  3×red-ball
       排列五  5×red-ball
       七乐彩  7×red-ball + 1×blue-ball
       快乐8   20×red-ball
       七星彩  6×red-ball + 1×blue-ball
   注意它把「奖项表」也写成 liTable-body，所以要靠「期号+红球」双重特征筛选，
   否则会把奖项（一等奖/6+1/9/6,640,325）当成开奖行 —— 这是必须防的坑。
   ============================================================ */
export const YIQICAI_BASE = (process.env.DRAW_YIQICAI_BASE || 'https://www.yiqicai.com').replace(/\/$/, '');
const YQC_WANT = {
  ssq: '双色球', dlt: '大乐透', fc3d: '福彩3D', pl3: '排列三',
  pl5: '排列五', qlc: '七乐彩', kl8: '快乐8', qxc: '七星彩'
};

/** 从一起彩的 liTable-body 里抽一条开奖记录 */
export function parseYiqicaiRow(html) {
  const issue = /(\d{5,7})\s*<span[^>]*>期<\/span>/.exec(html) || /(\d{5,7})\s*期/.exec(html);
  const date = /(\d{4}-\d{1,2}-\d{1,2})/.exec(html);
  const red = [...html.matchAll(/class="red-ball"[^>]*>(\d{1,2})</g)].map((m) => +m[1]);
  const blue = [...html.matchAll(/class="blue-ball"[^>]*>(\d{1,2})</g)].map((m) => +m[1]);
  return {
    issue: issue ? issue[1] : '',
    date: date ? normalizeDate(date[1]) : '',
    red, blue
  };
}

/** 一行开奖记录 → 按彩种切区 */
function yiqicaiAreas(gameId, red, blue) {
  const areas = {};
  if (gameId === 'ssq') { areas.red = red; areas.blue = blue; }
  else if (gameId === 'dlt') { areas.front = red; areas.back = blue; }
  else if (gameId === 'qlc') { areas.main = red; areas.special = blue; }
  else if (gameId === 'qxc') { areas.front = red; areas.back = blue; }
  else areas.main = red;   // 3D / 排列3 / 排列5 / 快乐8
  return areas;
}

/**
 * 抓一起彩最新一期
 * @param {string} gameId
 * @param {number} timeoutMs
 */
export async function fromYiqicai(gameId, timeoutMs) {
  const want = YQC_WANT[gameId];
  if (!want) return { ok: false, error: '一起彩没有这个彩种' };

  const r = await fetchTextRetry(`${YIQICAI_BASE}/kj/`, {
    timeoutMs, tries: 3, label: '一起彩',
    headers: { 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'zh-CN,zh;q=0.9' }
  });
  if (!r.ok) return { ok: false, error: r.error };

  const html = r.text;
  if (html.length < 2000) return { ok: false, error: `页面异常（${html.length} 字节）` };

  // 按 <li class="liTable-body"> 切行，只保留「彩种名 + 期号 + 有红球」的行
  for (const m of html.matchAll(/<li class="liTable-body"[\s\S]*?<\/li>/g)) {
    const row = m[0];
    if (!row.includes(`>${want}<`)) continue;
    const parsed = parseYiqicaiRow(row);
    if (!parsed.issue || parsed.red.length === 0) continue;   // 奖项表会被这里挡掉
    return {
      ok: true, issue: parsed.issue, date: parsed.date,
      areas: yiqicaiAreas(gameId, parsed.red, parsed.blue),
      sourceLabel: '一起彩（yiqicai.com）', sourceId: 'yiqicai'
    };
  }
  return { ok: false, error: `页面里没找到「${want}」的开奖行` };
}

/* ============================================================
   源 ③　500彩票网静态 XML
   ------------------------------------------------------------
   https://kaijiang.500.com/static/info/kaijiang/xml/{code}/list.xml
   实测 8 个彩种的 code（注意不是彩种简称）：
       ssq → ssq     dlt → dlt     福彩3D → sd     七乐彩 → qlc
       快乐8 → kl8   七星彩 → qxc   排列3 → p3      排列5 → p5
   <row expect="26117" opencode="04,13,19,29,31|02,12" opentime="2026-10-14 21:25:00" .../>
   【顺序】实测文件里【第一行是最新、最后一行是最老】（按时间倒序），
   所以必须取 rows[0] —— 取最后一行会拿到 2003 年的数据。
   3D 的行还有 trycode（试机号），绝对不能当开奖号。
   ============================================================ */
const X500_BASE = (process.env.DRAW_500XML_BASE || 'https://kaijiang.500.com').replace(/\/$/, '');
const X500_CODE = {
  ssq: 'ssq', dlt: 'dlt', fc3d: 'sd', qlc: 'qlc',
  kl8: 'kl8', qxc: 'qxc', pl3: 'p3', pl5: 'p5'
};

/**
 * 解析 500.com XML，返回【最新一期】
 * @param {string} xml
 * @param {string} [gameId] 给了就按彩种切区
 */
export function parse500Xml(xml, gameId) {
  const rows = [...xml.matchAll(/<row\s+([^>]*?)\/?>/g)];
  if (!rows.length) return { ok: false, error: 'XML 里没有 <row>' };

  // 第一行 = 最新（已实测）
  const attrs = rows[0][1];
  const get = (k) => {
    const m = new RegExp(`${k}\\s*=\\s*"([^"]*)"`).exec(attrs);
    return m ? m[1] : '';
  };

  const issue = get('expect');
  const opencode = get('opencode');
  const opentime = get('opentime');
  if (!issue || !opencode) return { ok: false, error: 'XML 缺少 expect/opencode' };

  let areas = {};
  if (gameId === 'qxc') {
    /* 七星彩的 XML【没有 "|" 分隔符】，是一串 7 个数字：
       opencode="7,7,5,5,1,3,11" → 前 6 个前区 + 第 7 个后区（0-14）
       实测 2026-10-15；这里绝不能按 "|" 切，否则前区会变成 7 个数字。 */
    const all = splitNums(opencode);
    areas = { front: all.slice(0, 6), back: all.slice(6, 7) };
  } else {
    const parts = opencode.split('|');
    const head = splitNums(parts[0]);
    const tail = parts[1] !== undefined ? splitNums(parts[1]) : [];
    if (gameId === 'ssq') areas = { red: head, blue: tail };
    else if (gameId === 'dlt') areas = { front: head, back: tail };
    else if (gameId === 'qlc') areas = { main: head, special: tail };
    else areas = { main: head };   // 3D / 排列3 / 排列5（快乐8 只有一组）
  }

  return {
    ok: true, issue, date: normalizeDate(opentime), areas,
    rowCount: rows.length
  };
}

/** 抓 500.com XML 最新一期 */
export async function from500Xml(gameId, timeoutMs) {
  const code = X500_CODE[gameId];
  if (!code) return { ok: false, error: '500 XML 没有这个彩种' };

  const url = `${X500_BASE}/static/info/kaijiang/xml/${code}/list.xml`;
  const r = await fetchTextRetry(url, {
    timeoutMs, tries: 3, label: '500XML',
    headers: { 'Accept': 'text/xml,application/xml,*/*', 'Referer': 'https://kaijiang.500.com/' }
  });
  if (!r.ok) return { ok: false, error: r.error };

  // 500.com 有反爬：正常是几十万字节，被拦只有不到 2KB 的混淆脚本
  if (r.text.length < 3000) return { ok: false, error: `返回体过小（${r.text.length}B，疑似反爬）` };

  const p = parse500Xml(r.text, gameId);
  if (!p.ok) return p;
  return { ...p, sourceLabel: '500彩票网（XML）', sourceId: 'fc500' };
}

/* ============================================================
   源 ④　17500.cn 明文 TXT
   ------------------------------------------------------------
   https://www.17500.cn/getData/{ssq|dlt|3d|p3|p5}.TXT
   实测字段（空格分隔，末行 = 最新）：
     ssq  期号 日期 r1..r6 blue ...
     dlt  期号 日期 f1..f5 b1 b2 ...
     3d   期号 日期 d1 d2 d3 试机号1 试机号2 试机号3 ...   ← 后 3 个是试机号，不能当开奖号
     p3   期号 日期 d1 d2 d3 销量 注数 ...                ← 只有 3 个号码
     p5   期号 日期 d1..d5 销量 ...
   只提供 ssq / dlt / fc3d / pl3 / pl5 五个彩种。
   ============================================================ */
const Y17500_BASE = (process.env.DRAW_17500_BASE || 'https://www.17500.cn').replace(/\/$/, '');
const Y17500_CODE = { ssq: 'ssq', dlt: 'dlt', fc3d: '3d', pl3: 'p3', pl5: 'p5' };

/**
 * 解析 17500 TXT 的【最后一行】（= 最新一期）
 * @param {string} txt
 * @param {string} gameId
 */
export function parse17500(txt, gameId) {
  const lines = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { ok: false, error: '文件是空的' };
  const f = lines[lines.length - 1].split(/\s+/);

  const issue = f[0];
  const date = f[1];
  if (!/^\d{5,7}$/.test(issue || '')) return { ok: false, error: `首字段不是期号：${issue}` };
  // 日期列有些彩种是 -1（停售日）之类，认不出来就留空，绝不编造
  const d = /^\d{4}-\d{1,2}-\d{1,2}$/.test(date || '') ? normalizeDate(date) : '';
  const num = (i) => {
    const v = parseInt(f[i], 10);
    return Number.isInteger(v) ? v : NaN;
  };

  let areas = {};
  if (gameId === 'ssq') areas = { red: f.slice(2, 8).map((_, i) => num(2 + i)), blue: [num(8)] };
  else if (gameId === 'dlt') areas = { front: f.slice(2, 7).map((_, i) => num(2 + i)), back: [num(7), num(8)] };
  else if (gameId === 'fc3d') areas = { main: [num(2), num(3), num(4)] };     // 5..7 是试机号
  else if (gameId === 'pl3') areas = { main: [num(2), num(3), num(4)] };
  else if (gameId === 'pl5') areas = { main: [num(2), num(3), num(4), num(5), num(6)] };
  else return { ok: false, error: '17500 没有这个彩种' };

  return { ok: true, issue, date: d, areas };
}

/** 抓 17500 TXT 最新一期 */
export async function from17500(gameId, timeoutMs) {
  const code = Y17500_CODE[gameId];
  if (!code) return { ok: false, error: '17500 没有这个彩种' };

  const url = `${Y17500_BASE}/getData/${code}.TXT`;
  const r = await fetchTextRetry(url, {
    timeoutMs, tries: 3, label: '17500',
    headers: { 'Accept': 'text/plain,*/*', 'Referer': 'https://www.17500.cn/' }
  });
  if (!r.ok) return { ok: false, error: r.error };
  if (r.text.length < 1000) return { ok: false, error: `返回体过小（${r.text.length}B）` };
  if (/^\s*</.test(r.text)) return { ok: false, error: '返回的不是数据（是 HTML）' };

  const p = parse17500(r.text, gameId);
  if (!p.ok) return p;
  return { ...p, sourceLabel: '17500.cn', sourceId: 'fc17500' };
}

/* ============================================================
   源注册表
   ============================================================ */
export const SOURCES = {
  official: fromOfficial,
  yiqicai: fromYiqicai,
  fc500: from500Xml,
  fc17500: from17500
};

/**
 * 【多源抓一期】核心入口
 * 按 order 顺序逐个源尝试；每个源的结果都要过 validateAreas + 期号宽度校验。
 * 任何一个源成功就立刻返回；全部失败返回 ok:false 并带上每个源的失败原因。
 *
 * @param {string} gameId
 * @param {object} opt
 * @param {string[]} opt.order          源顺序
 * @param {string[]} [opt.forceFail]    强制失败的源（故障注入用）
 * @param {number} [opt.timeoutMs]
 * @param {string} [opt.snapIssue]   当前 draws.js 里的期号（格式基准 + 新旧判断）
 * @param {(s:string)=>void} [opt.onTry] 日志回调
 * @returns {Promise<{ok:boolean, issue?:string, date?:string, areas?:object, sourceLabel?:string, sourceId?:string, tried?:Array}>}
 */
export async function fetchDrawWithFallback(gameId, opt = {}) {
  const order = opt.order && opt.order.length ? opt.order : DEFAULT_ORDER;
  const forceFail = (opt.forceFail || []).map((s) => s.toLowerCase());
  const timeoutMs = opt.timeoutMs || 15000;
  const tried = [];

  for (const id of order) {
    const fn = SOURCES[id];
    const label = SOURCE_LABELS[id] || id;
    if (!fn) { tried.push({ id, label, error: '未知的源（检查 DRAW_SOURCE_ORDER）' }); continue; }

    if (forceFail.includes(id)) {
      tried.push({ id, label, error: '被 DRAW_FORCE_FAIL 强制失败（故障注入）' });
      if (opt.onTry) opt.onTry(`  ⏭  ${label}：被 DRAW_FORCE_FAIL 跳过（故障注入）`);
      continue;
    }

    if (opt.onTry) opt.onTry(`  → 试 ${label} …`);
    let res;
    try {
      res = await fn(gameId, timeoutMs);
    } catch (e) {
      res = { ok: false, error: (e?.cause?.code || e?.message || String(e)).slice(0, 80) };
    }

    if (!res || !res.ok) {
      const err = (res && res.error) || '未知错误';
      tried.push({ id, label, error: err });
      if (opt.onTry) opt.onTry(`     ✗ ${label}：${err}`);
      continue;   // 【关键】一个源失败绝不让彩种整个丢掉，继续试下一个
    }

    /* ---- 期号：归一化（抓最新一期 → 比快照旧就判为可疑） ---- */
    const issue = normalizeIssue(res.issue, opt.snapIssue, true);
    if (!issue) {
      const err = `期号异常（源返回「${res.issue}」，当前快照「${opt.snapIssue || '无'}」）`;
      tried.push({ id, label, error: err });
      if (opt.onTry) opt.onTry(`     ✗ ${label}：${err}`);
      continue;
    }

    /* ---- 号码：合法性校验 ---- */
    const v = validateAreas(gameId, { areas: res.areas });
    if (!v.ok) {
      const err = '号码校验不通过：' + v.reason;
      tried.push({ id, label, error: err });
      if (opt.onTry) opt.onTry(`     ✗ ${label}：${err}`);
      continue;   // 【关键】号码不合法就当这个源失败，继续试下一个
    }

    if (opt.onTry) opt.onTry(`     ✓ ${label} 成功 · 第 ${issue} 期`);
    return {
      ok: true, issue, date: res.date || '', areas: v.areas,
      sourceLabel: res.sourceLabel || label, sourceId: id, tried
    };
  }

  return { ok: false, tried, reason: tried.map((t) => `${t.label}:${t.error}`).join(' ; ') };
}

/* ============================================================
   多期（历史）抓取 —— build-history.mjs 用
   ============================================================ */

/** 一起彩历史页：/kj/{code}kj/{code}gd.html，实测每页 50 期 */
export const YQC_HIST_CODE = {
  ssq: 'ssq', dlt: 'dlt', fc3d: 'fc3d', pl3: 'pl3',
  pl5: 'pl5', qlc: 'qlc', kl8: 'klb', qxc: 'xqxc'
};

/** 解析一起彩历史页（每行：期号 / 日期 · 星期 / 号码球） */
export function parseYiqicaiHistory(html, gameId, limit) {
  const out = [];
  for (const m of html.matchAll(/<li class="liTable-body"[\s\S]*?<\/li>/g)) {
    const row = m[0];
    const im = /(\d{5,7})\s*<span[^>]*>期<\/span>/.exec(row) || /(\d{5,7})\s*期/.exec(row);
    if (!im) continue;                                   // 没有期号 → 不是开奖行
    const parsed = parseYiqicaiRow(row);
    if (!parsed.issue || parsed.red.length === 0) continue;
    out.push({
      issue: parsed.issue,
      date: parsed.date,
      areas: yiqicaiAreas(gameId, parsed.red, parsed.blue)
    });
    if (limit && out.length >= limit) break;
  }
  return out;
}

/** 一起彩历史：抓最近 N 期 */
export async function historyFromYiqicai(gameId, count, timeoutMs) {
  const code = YQC_HIST_CODE[gameId];
  if (!code) return { ok: false, error: '一起彩没有这个彩种' };
  const r = await fetchTextRetry(`${YIQICAI_BASE}/kj/${code}kj/${code}gd.html`, {
    timeoutMs, tries: 3, label: '一起彩历史',
    headers: { 'Accept': 'text/html,application/xhtml+xml' }
  });
  if (!r.ok) return { ok: false, error: r.error };
  if (r.text.length < 2000) return { ok: false, error: `页面异常（${r.text.length}B）` };

  const draws = parseYiqicaiHistory(r.text, gameId, count);
  if (!draws.length) return { ok: false, error: '页面里没解析出开奖行' };
  return { ok: true, draws, sourceLabel: '一起彩（yiqicai.com）', sourceId: 'yiqicai' };
}

/** 500.com XML 历史：取最后 N 行（文件是倒序，末尾是最老）→ 反转成最新在前 */
export async function historyFrom500Xml(gameId, count, timeoutMs) {
  const code = X500_CODE[gameId];
  if (!code) return { ok: false, error: '500 XML 没有这个彩种' };
  const r = await fetchTextRetry(`${X500_BASE}/static/info/kaijiang/xml/${code}/list.xml`, {
    timeoutMs, tries: 3, label: '500XML历史',
    headers: { 'Accept': 'text/xml,application/xml,*/*', 'Referer': 'https://kaijiang.500.com/' }
  });
  if (!r.ok) return { ok: false, error: r.error };
  if (r.text.length < 3000) return { ok: false, error: `返回体过小（${r.text.length}B，疑似反爬）` };

  const rows = [...r.text.matchAll(/<row\s+([^>]*?)\/?>/g)];
  if (!rows.length) return { ok: false, error: 'XML 里没有 <row>' };

  const draws = [];
  // 从「最新」往「较老」方向取（rows[0] 是最新）
  for (let i = 0; i < rows.length && draws.length < count; i++) {
    const attrs = rows[i][1];
    const get = (k) => (new RegExp(`${k}\\s*=\\s*"([^"]*)"`).exec(attrs) || [])[1] || '';
    const issue = get('expect'), opencode = get('opencode');
    if (!issue || !opencode) continue;
    let areas;
    if (gameId === 'qxc') {
      const all = splitNums(opencode);       // 同上：qxc 没有 "|" 分隔
      areas = { front: all.slice(0, 6), back: all.slice(6, 7) };
    } else {
      const parts = opencode.split('|');
      const head = splitNums(parts[0]);
      const tail = parts[1] !== undefined ? splitNums(parts[1]) : [];
      if (gameId === 'ssq') areas = { red: head, blue: tail };
      else if (gameId === 'dlt') areas = { front: head, back: tail };
      else if (gameId === 'qlc') areas = { main: head, special: tail };
      else areas = { main: head };
    }
    draws.push({ issue, date: normalizeDate(get('opentime')), areas });
  }
  if (!draws.length) return { ok: false, error: '没解析出任何一期' };
  return { ok: true, draws, sourceLabel: '500彩票网（XML）', sourceId: 'fc500' };
}

/** 17500 历史：取最后 N 行，反转成最新在前 */
export async function historyFrom17500(gameId, count, timeoutMs) {
  const code = Y17500_CODE[gameId];
  if (!code) return { ok: false, error: '17500 没有这个彩种' };
  const r = await fetchTextRetry(`${Y17500_BASE}/getData/${code}.TXT`, {
    timeoutMs, tries: 3, label: '17500历史',
    headers: { 'Accept': 'text/plain,*/*', 'Referer': 'https://www.17500.cn/' }
  });
  if (!r.ok) return { ok: false, error: r.error };
  if (r.text.length < 1000) return { ok: false, error: `返回体过小（${r.text.length}B）` };
  if (/^\s*</.test(r.text)) return { ok: false, error: '返回的不是数据（是 HTML）' };

  const lines = r.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const draws = [];
  for (let i = lines.length - 1; i >= 0 && draws.length < count; i--) {
    const f = lines[i].split(/\s+/);
    if (!/^\d{5,7}$/.test(f[0] || '')) continue;
    const num = (k) => { const v = parseInt(f[k], 10); return Number.isInteger(v) ? v : NaN; };
    const date = /^\d{4}-\d{1,2}-\d{1,2}$/.test(f[1] || '') ? normalizeDate(f[1]) : '';
    let areas;
    if (gameId === 'ssq') areas = { red: [2, 3, 4, 5, 6, 7].map(num), blue: [num(8)] };
    else if (gameId === 'dlt') areas = { front: [2, 3, 4, 5, 6].map(num), back: [num(7), num(8)] };
    else if (gameId === 'fc3d') areas = { main: [num(2), num(3), num(4)] };
    else if (gameId === 'pl3') areas = { main: [num(2), num(3), num(4)] };
    else if (gameId === 'pl5') areas = { main: [num(2), num(3), num(4), num(5), num(6)] };
    else continue;
    draws.push({ issue: f[0], date, areas });
  }
  if (!draws.length) return { ok: false, error: '没解析出任何一期' };
  return { ok: true, draws, sourceLabel: '17500.cn', sourceId: 'fc17500' };
}

/** 历史源注册表 */
export const HISTORY_SOURCES = {
  official: null,   // 由 build-history.mjs 自己实现（它要多期参数）
  yiqicai: historyFromYiqicai,
  fc500: historyFrom500Xml,
  fc17500: historyFrom17500
};
