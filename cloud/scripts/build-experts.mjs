/* ============================================================
   build-experts.mjs —— 抓取一起彩（yiqicai.com）专家数据

   产物：experts-data.js → const EXPERTS_DATA = {...}

   抓取内容：
     1. /ex/{game}ex_{catCode}          分类列表页 → 专家名单 + 近10中/最高连红
     2. /ex/{game}ex/tjsy_{gid}_{eid}.html  专家历史表 → 逐期推荐号 / 命中号 / 中N
     3. /zjxhfb/{game}.html             选号分布页 → 共识百分比 + 近10期最准十大专家

   统计口径（全部来自站点公开历史数据，仅作统计参考）：
     hitRate10    近10期命中率 = 最近 10 期里「中N >= 1」的期数 / 实际期数
     maxStreak    最长连红（连续命中的最长段）
     curStreak    当前连红（从最新一期往回数）
     recoverRate  恢复率 = 黑过之后下一期立刻转红的次数 / 黑过的总次数
     blackCount   黑的次数（中N == 0）
     lastHit      最新一期是否命中

   用法：
     node build-experts.mjs               抓全部 8 个彩种
     node build-experts.mjs ssq           只抓双色球
     node build-experts.mjs ssq --limit=5 每个分类最多取 5 位专家（调试用）
     node build-experts.mjs --cats=3      每个彩种抓 3 个分类
     node build-experts.mjs --max=12      每个彩种最多抓 12 位专家的历史页

   注意：本脚本只做「历史命中统计」，不做任何中奖预测。
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


/* 【昵称打码】用户页面上不能出现站名片段（source-guard 会拦）——
   实测重抓时出现过昵称「我中500万」，命中硬词「500万」导致整页构建失败。
   这里在写数据前统一打码：命中站名片段就替换成等长全角＊，专家本身保留。 */
const NAME_BAD = [/500万/g, /500\s*网/g, /500\.com/gi, /球探/g, /雷速/g, /leisu/gi, /titan0*7/gi, /一起彩/g, /yiqicai/gi, /头条/g];
function safeName(n) {
  let out = String(n || '');
  for (const re of NAME_BAD) out = out.replace(re, (m) => '＊'.repeat(Math.max(1, m.length)));
  return out;
}
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_JS = path.join(ROOT, 'experts-data.js');

/* ============================================================
   【本机 backoff 闸门】--min-interval=<分钟>   （2026-10-18 加）
   ------------------------------------------------------------
   为什么加：本机 update-football-smart.mjs 是【每 30 分钟】一轮，而这一步
   全量跑一次要 5~6 分钟（几百个请求，还要打源站）。每 30 分钟真跑一次
   → 整条链必超时，源站也扛不住。
   规则：
     · 距上次【成功】< N 分钟 → 立刻跳过：打印原因、exit 0、【一个数据文件都不动】
     · 不传 --min-interval → 闸门关闭，行为与以前【完全一致】
       （云端 cloud-build.mjs 不传这个参数，所以云端行为不受任何影响）
     · --force-run → 忽略闸门，本次一定真跑（手工补数据用）
   状态文件：./_backoff-build-experts.json
   ⚠️ 只有【真正写成功】才记 lastSuccess；失败 / 被「防回退」拦住都不记 → 下一轮还会再试。
   ============================================================ */
const MIN_INTERVAL_MIN = (() => {
  const m = process.argv.slice(2).find((a) => a.startsWith('--min-interval='));
  if (!m) return 0;
  const n = parseInt(m.slice('--min-interval='.length), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
})();
const FORCE_RUN = process.argv.slice(2).includes('--force-run');
const GATE_FILE = path.join(ROOT, '_backoff-build-experts.json');
function readGate() { try { return JSON.parse(fs.readFileSync(GATE_FILE, 'utf8')) || {}; } catch (e) { return {}; } }
function gateShouldSkip() {
  if (!MIN_INTERVAL_MIN || FORCE_RUN) return false;
  const last = Number(readGate().lastSuccess) || 0;
  if (!last) return false;
  const gone = (Date.now() - last) / 60000;
  if (gone >= MIN_INTERVAL_MIN) return false;
  const ago = gone < 60 ? `${Math.round(gone)} 分钟前` : `${(gone / 60).toFixed(1)} 小时前`;
  log(`  ⏭  跳过：距上次成功 ${ago}（闸门 ${MIN_INTERVAL_MIN} 分钟）→ 保留现有 experts-data.js 不动`);
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

const BASE = 'https://www.yiqicai.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REFERER = 'https://www.yiqicai.com/ex';

/* ---------- 彩种配置 ----------
   seed       用于发现该彩种分类编号的入口分类（随便一个能出的页面都会带 exp-tabs）
   red/blue   号码合法区间（null = 该彩种没有这个区）
   drawn      每期开奖号码个数（用于算「高于随机期望」的命中门槛）
   poolRed    号码池大小（数字型彩种 0-9 只有 10 个号，取 7）
--------------------------------- */
const GAMES = {
  ssq:  { name: '双色球', seeds: ['_1003', '_1025'], red: [1, 33], blue: [1, 16], drawn: 6,  poolRed: 20, poolBlue: 5, kind: 'ball' },
  dlt:  { name: '大乐透', seeds: ['_1025', '_1003'], red: [1, 35], blue: [1, 12], drawn: 5,  poolRed: 20, poolBlue: 4, kind: 'ball' },
  fc3d: { name: '福彩3D', seeds: ['_1003', '_1007'], red: [0, 9],  blue: null,    drawn: 3,  poolRed: 7,  poolBlue: 0, kind: 'digit' },
  klb:  { name: '快乐8',  seeds: ['_1015', '_1012'], red: [1, 80], blue: null,    drawn: 20, poolRed: 20, poolBlue: 0, kind: 'ball' },
  pl3:  { name: '排列3',  seeds: ['_1003', '_1007'], red: [0, 9],  blue: null,    drawn: 3,  poolRed: 7,  poolBlue: 0, kind: 'digit' },
  pl5:  { name: '排列5',  seeds: ['_2000', '_1003'], red: [0, 9],  blue: null,    drawn: 5,  poolRed: 7,  poolBlue: 0, kind: 'digit' },
  xqxc: { name: '七星彩', seeds: ['_1006', '_1003'], red: [0, 9],  blue: [0, 14], drawn: 6,  poolRed: 7,  poolBlue: 4, kind: 'digit' },
  qlc:  { name: '七乐彩', seeds: ['_1022', '_1003'], red: [1, 30], blue: null,    drawn: 7,  poolRed: 20, poolBlue: 0, kind: 'ball' }
};

const DEFAULTS = {
  perCategoryLimit: 20,      // 每个分类的列表页只取前 N 位（站点一页 20 位，?page=2 服务端不生效）
  catsPerGame: 4,            // 每个彩种抓几个「号码类」分类
  blueCats: 2,               // 额外强制抓几个「蓝球/后区类」分类（蓝球定五/定三 等）
  blueExpertSlots: 3,        // 抓取队列里给「蓝球/后区类」专家保留的名额
  maxExpertsPerGame: 20,     // 每个彩种最多抓多少位专家的历史页
  maxPeriods: 10,            // 每位专家最多解析最近多少期
  stableTop: 20,             // 每个彩种输出多少位稳定专家（用户 2026-10-17：10 → 20 位）
  prescreenHit10: 5,         // 列表页「近10中」低于此值的专家不进入专家页抓取队列
  minPeriodsForStable: 6,    // 进入 stable 至少要有多少期历史
  /* 【--all · 用户 2026-10-18「把专家的所有资料全部抓进来」】
     全量模式的上限：每个分类 20 位（站点一页 20 位，翻页无效，所以 20 就是全量）、
     每个彩种 200 位专家、每人最近 30 期。用 `--all` 打开。
     ⚠️ 全量一轮约 2000+ 请求 / 30~60 分钟，只放云端跑（本机不跑）。 */
  allPerCategoryLimit: 20,
  allMaxExpertsPerGame: 200,
  allMaxPeriods: 30,
  retries: 3,
  timeoutMs: 25000,
  delayMin: 400,
  delayMax: 800
};

/* ============================================================
   基础工具
   ============================================================ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randDelay = () => DEFAULTS.delayMin + Math.floor(Math.random() * (DEFAULTS.delayMax - DEFAULTS.delayMin + 1));

const p2 = (n) => String(n).padStart(2, '0');
function stampNow(d = new Date()) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
const log = (...a) => console.log(...a);

/* ---------- 带重试的 GET ---------- */
let reqCount = 0;
async function httpGet(url, { retries = DEFAULTS.retries, timeoutMs = DEFAULTS.timeoutMs } = {}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      reqCount++;
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Referer': REFERER,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text) throw new Error('空响应');
      return { ok: true, text };
    } catch (e) {
      lastErr = e.cause?.code || e.message || String(e);
      if (attempt < retries) await sleep(600 * attempt);
    }
  }
  return { ok: false, error: lastErr };
}

/* ============================================================
   解析
   ============================================================ */

/* ---------- 分类 tabs：<div class="exp-tabs ..."><a href="/ex/ssqex_1025">红球25码</a>...</div> ---------- */
function parseTabs(html, game) {
  const box = html.match(/<div class="exp-tabs[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (!box) return [];
  const out = [];
  const re = new RegExp(`<a href="/ex/${game}ex_(\\d+)"[^>]*>([^<]*)</a>`, 'g');
  let m;
  while ((m = re.exec(box[1]))) {
    out.push({ code: '_' + m[1], label: m[2].trim() });
  }
  return out;
}

/* ---------- 分类挑选 ----------
   把分类分成「号码类」和「蓝球/后区类」两组：
     - 号码类按名字里的数字大小降序（25码 > 20码 > 12码 > 三胆 > 双胆 …）
     - 蓝球/后区类额外保留 blueSlots 个（用户明确要求蓝球定三/定五必须抓）
   杀号类（名字含「杀」）默认全部排除，只有在几乎没有可选分类时才兜底使用。
--------------------------------- */
const isBlueLabel = (label) => /蓝球|后区|蓝区/.test(label);
const isKillLabel = (label) => /杀/.test(label);

/* 分类名里的号码个数：既有阿拉伯数字（25码/15码），也有中文数字（七码组选/三胆/蓝球定五）。
   注意「十位定3」「百位定1」里的 十/百 是位数而不是个数，所以中文数字必须紧跟 码/胆/注/个 或收尾。 */
const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function labelSize(label) {
  const nums = (label.match(/\d+/g) || []).map(Number);
  const cn = [...label.matchAll(/([一二三四五六七八九十])(?=码|胆|注|个|$)/g)].map((m) => CN_NUM[m[1]]);
  const all = [...nums, ...cn].filter((x) => Number.isFinite(x));
  return all.length ? Math.max(...all) : 0;
}

function selectCategories(tabs, n, blueSlots) {
  const noKill = tabs.filter((t) => !isKillLabel(t.label));
  const pool = noKill.length >= 2 ? noKill : tabs;

  const rank = (arr) => arr
    .map((t, i) => ({ ...t, size: labelSize(t.label), ord: i }))
    .sort((a, b) => (b.size - a.size) || (a.ord - b.ord));

  const reds = rank(pool.filter((t) => !isBlueLabel(t.label))).slice(0, Math.max(1, n));
  const blues = rank(pool.filter((t) => isBlueLabel(t.label))).slice(0, blueSlots);

  const out = [...reds, ...blues];
  // 兜底：非杀号分类不够时，优先用非杀号补齐，实在不够才动杀号分类
  if (out.length < n) {
    for (const src of [rank(pool), rank(tabs)]) {
      for (const t of src) {
        if (out.length >= n) break;
        if (!out.some((o) => o.code === t.code)) out.push(t);
      }
    }
  }
  return out.map(({ code, label, size }) => ({ code, label, size, blue: isBlueLabel(label) }));
}

/* ---------- 专家列表项 ---------- */
function parseExpertList(html) {
  const out = [];
  const re = /<a href="([^"]*\/tjsy_[\d_]+\.html)"[^>]*class="exp-item"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const inner = m[2];
    const name = (inner.match(/class="exp-name"[^>]*>([^<]*)</) || [])[1];
    if (!name) continue;
    const hit10 = (inner.match(/近10中<span class="c-red"[^>]*>(\d+)<\/span>期/) || [])[1];
    const siteMax = (inner.match(/最高<span class="c-red"[^>]*>(\d+)<\/span>连红/) || [])[1];
    const siteCur = (inner.match(/连红<span class="c-red"[^>]*>(\d+)<\/span>期/) || [])[1];
    out.push({
      name: name.trim(),
      url: href.startsWith('http') ? href : BASE + href,
      path: href.replace(BASE, ''),
      hit10: hit10 === undefined ? null : +hit10,
      siteMaxStreak: siteMax === undefined ? null : +siteMax,
      siteCurStreak: siteCur === undefined ? null : +siteCur
    });
  }
  return out;
}

/* ---------- 单个球号 em ---------- */
const BALL_RE = /<em class="(red-ball|blue-ball)((?:\s[^"]*)?)"[^>]*>([^<]*)<\/em>/g;

/* ---------- 专家历史表 ---------- */
function parseExpertHistory(html, game, maxPeriods) {
  const rows = [];
  const bodyRe = /<li class="liTable-body"[^>]*>([\s\S]*?)(?=<li class="liTable-body"|<\/ul>)/g;
  let m;
  while ((m = bodyRe.exec(html))) {
    const body = m[1];
    const issue = (body.match(/(\d{5,7})期/) || [])[1];
    if (!issue) continue;

    const tds = body.split(/<div class="tbl-td"/).slice(1);

    // td[1] = 推荐号码
    const picks = [];
    const hits = [];
    const bluePicks = [];
    if (tds[1]) {
      BALL_RE.lastIndex = 0;
      let b;
      while ((b = BALL_RE.exec(tds[1]))) {
        const zone = b[1];
        const isWin = /c-win/.test(b[2] || '');
        const val = parseInt(b[3], 10);
        if (!Number.isFinite(val)) continue;
        if (zone === 'blue-ball') {
          bluePicks.push({ n: val, win: isWin });
          if (isWin) hits.push({ zone: 'blue', n: val });
          continue;
        }
        picks.push(val);
        if (isWin) hits.push({ zone: 'red', n: val });
      }
    }

    // td[2] = 开奖号码（lotto-draw-num，<em> / <em class="c-blue">，可能一格塞多个空格分隔的数字）
    const draw = [];
    let drawBlue = null;
    if (tds[2]) {
      const emRe = /<em((?:\s[^>]*)?)>([^<]*)<\/em>/g;
      let e;
      while ((e = emRe.exec(tds[2]))) {
        const isBlue = /c-blue/.test(e[1] || '');
        const vals = (e[2].match(/\d+/g) || []).map(Number);
        for (const v of vals) {
          if (isBlue) { if (drawBlue === null) drawBlue = v; }
          else draw.push(v);
        }
      }
    }

    // td[3] = 中N
    let siteHitCount = null;
    if (tds[3]) {
      const h = tds[3].match(/中\s*(\d+)/);
      if (h) siteHitCount = +h[1];
    }

    /* 校验：站点的 c-win / 中N 并不总是和同一行的开奖号一致。
       实测 排列5 会出现「推荐 4、开奖 8 9 0 2 0、却标 c-win 中1」的情况，
       七星彩也有类似现象。所以只要解析到了开奖号，就以「号码真的在开奖号里」为准，
       把对不上的 c-win 丢掉，避免把没开出的号当成命中号灌进号码池。 */
    const drawRedSet = new Set(draw);
    const haveDraw = drawRedSet.size > 0 || drawBlue !== null;
    const hitNums = [];
    let badHits = 0;
    for (const h of hits) {
      let ok = true;
      if (haveDraw) {
        ok = h.zone === 'blue'
          ? (drawBlue === null ? true : h.n === drawBlue)
          : (drawRedSet.size === 0 ? true : drawRedSet.has(h.n));
      }
      if (ok) hitNums.push(h.n); else badHits++;
    }
    const hitCount = haveDraw ? hitNums.length : (siteHitCount ?? hitNums.length);

    /* td[4] = 「查看」→ 这一期的【分类详情页】（按分类拆开他这一期推的号）
       形如 /ex/ssqex/tjxq_5_168_2026118.html
       专家页每期只有一栏（大池 25 个），按分类拆开的号在详情页里 —— 见 parseCatDetail()。 */
    let detailPath = '';
    const dm = /href="([^"]*tjxq[^"]*\.html)"/.exec(tds[4] || '');
    if (dm) detailPath = dm[1];

    rows.push({ issue, picks, hits: hitNums, bluePicks, draw, drawBlue, hitCount, siteHitCount, badHits, detailPath });
    if (rows.length >= maxPeriods) break;
  }
  return rows;
}

/* ---------- 某一期的「分类详情页」：按分类列出他这一期推的号 ----------
   用户 2026-10-17 原话：「点开后抓取专家的资料是这一期免费公开的 N 胆 具体数字」。
   实测页面结构（www.yiqicai.com/ex/ssqex/tjxq_5_168_2026118.html）：
     <li class="liTable-body">
       <div class="tbl-td">红球三胆</div>            ← 分类名
       <div class="tbl-td"><div class="lotto-scheme-num"><em>9</em><em>22</em><em>31</em></div></div>
       <div class="tbl-td"><a href="/ex/ssqex_1003">查看红球三胆排行</a></div>
     </li>
   ⇒ 取出【分类名 === 这位专家的分类】那一行的号码，就是他这一期的 N 胆。
   ⚠️ 对不上、或这一期没有这个分类 → 返回 null（调用方就不显示这块，绝不编数字）。 */
function parseCatDetail(html, catLabel) {
  const blocks = String(html).split('<li class="liTable-body"').slice(1);
  for (const blk of blocks) {
    const tds = blk.split('<div class="tbl-td"').slice(1);
    if (tds.length < 2) continue;
    /* td[0] 的分类名：去掉标签本身和里面的属性残留（split 会留下 " data-v-xxx>红球三胆"） */
    const name = tds[0].replace(/^[^>]*>/, '').replace(/<[^>]*>/g, '').trim();
    if (name !== catLabel) continue;
    const nums = (tds[1].match(/<em[^>]*>(\d+)<\/em>/g) || [])
      .map((x) => Number(String(x).replace(/<[^>]*>/g, '')))
      .filter(Number.isFinite);
    if (nums.length) return nums;
  }
  return null;
}

/* ---------- 专家页页首「最新推荐 第 X 期」=【正在卖/待开奖】的那一期 ----------
   实测（2026-10-18 20:0x · www.yiqicai.com/ex/ssqex/tjsy_5_168.html）：
     <div class="cm-box exp-lastest">
       <div class="exp-lastest-tit"><h3>双色球最新推荐</h3> <span>第2026119期</span> …
       <div class="exp-lastest-recommend">… <em class="red-ball">?</em>×6 <em class="blue-ball">?</em> …
   号码在页面上是「?」（要「查看完整方案」才看得到），但【期号是明写的】。
   而下面那张 liTable（parseExpertHistory 解析的）【只列已开奖的期】——
   所以「下一期」的期号只能从这里拿。取不到返回 ''（调用方退回旧行为）。 */
function parsePendingIssue(html) {
  const s = String(html || '');
  const m = s.match(/exp-lastest[\s\S]{0,800}?第\s*(\d{5,7})\s*期/);
  if (m) return m[1];
  const m2 = s.match(/最新推荐[\s\S]{0,300}?第\s*(\d{5,7})\s*期/);
  return m2 ? m2[1] : '';
}

/* ---------- 选号分布页（共识百分比） ---------- */
function parseConsensus(html) {
  const sections = [];
  const secRe = /<h1 class="lotto-select-tit"[^>]*>([^<]*)<\/h1>\s*<ul class="lotto-pick"[^>]*>([\s\S]*?)<\/ul>/g;
  let m;
  while ((m = secRe.exec(html))) {
    const title = m[1].trim();
    const items = [];
    const chunks = m[2].split(/<li class="lotto-pick-item/).slice(1);
    for (const c of chunks) {
      const cls = (c.match(/^([^"]*)"/) || [])[1] || '';
      const raw = (c.match(/<span class="lotto-pick-ball"[^>]*>([^<]*)<\/span>/) || [])[1];
      const prog = (c.match(/--progress:\s*([\d.]+)/) || [])[1];
      const pctTxt = (c.match(/<span class="lotto-pick-num"[^>]*>([^<]*)<\/span>/) || [])[1];
      let pct = prog !== undefined ? parseFloat(prog) : NaN;
      if (!Number.isFinite(pct) && pctTxt) pct = parseFloat(pctTxt);
      if (!Number.isFinite(pct)) continue;
      const isQ = !raw || raw.trim() === '?' || raw.trim() === '';
      items.push({
        num: isQ ? null : parseInt(raw, 10),
        pct,
        zone: /blue/.test(cls) ? 'blue' : 'red'
      });
    }
    sections.push({ title, items });
  }

  const isBlueTitle = (t) => /蓝|后区/.test(t);
  const red = [];
  const blue = [];
  for (const s of sections) {
    const target = isBlueTitle(s.title) ? blue : red;
    for (const it of s.items) {
      if (it.zone === 'blue' && !isBlueTitle(s.title)) { blue.push({ ...it, sec: s.title }); continue; }
      target.push({ ...it, sec: s.title });
    }
  }

  // 页面底部「近10期预测最准十大专家」
  const topExperts = [];
  const box = html.match(/<div class="cm-box w-exp-accurate"[\s\S]*$/);
  if (box) {
    for (const e of parseExpertList(box[0]).slice(0, 10)) {
      topExperts.push({ name: safeName(e.name), url: e.path, hit10: e.hit10 });
    }
  }

  const updated = (html.match(/数据更新为\s*([\d\-: ]+)/) || [])[1]?.trim() || null;

  /* 【期号 · 用户 2026-10-18「是不是抓不到下一期的了」】
     源站页面的数据里带 issueName:"2026119" —— 这就是【当前正在卖的那一期】，
     而下面那些 lotto-pick-ball 号码就是这一期的共识分布。
     以前这里没取，页面只能写「下一期待出号」；现在把期号一起带出去，
     页面可以明确标成「第 2026119 期」。取不到就保持 null（不改旧行为）。 */
  let issue = null;
  const im = html.match(/issueName\s*:\s*"(\d{5,7})"/);
  if (!im) {
    /* 有的页面可能是 HTML 里直接写「第 2026119 期」 */
    const im2 = html.match(/第\s*(\d{5,7})\s*期/);
    if (im2) issue = im2[1];
  } else {
    issue = im[1];
  }

  return { red, blue, sections: sections.map((s) => ({ title: s.title, n: s.items.length })), topExperts, updated, issue };
}

/* ============================================================
   稳定性评分

   关键口径：站点的「中N」是「推荐号码里有几个落在开奖号里」。
   宽号码推荐（如双色球 25 码）几乎每期都必然中至少 1 个，用「中N>=1」判定
   会让所有专家都是满分、毫无区分度（实测：15 位双色球专家全部 中N>=1 = 10/10，
   而列表页给他们的是 6~10，说明站点用的是更严的判红线）。
   所以这里改用「高于随机期望」的门槛：

     threshold = max(1, ceil(推荐个数 × 每期开出个数 / 号码池大小))

   即：命中数要超过「纯随机乱选的平均水平」才算这一期算红。
   另外用 calibrateThreshold() 反查「列表页 近10中N / 最高连红」对应的门槛，
   仅作为校验证据输出（siteFit），不参与打分。
   ============================================================ */
function hitThreshold(picksN, drawn, poolSize) {
  if (!picksN || !drawn || !poolSize) return 1;
  return Math.max(1, Math.ceil((picksN * drawn) / poolSize));
}

/* 用站点列表页的「近10中N期 / 最高N连红」反查判红门槛，仅用于校验历史表是否与列表分类同源 */
function calibrateThreshold(rows, picksN, siteHit10, siteMaxStreak) {
  if (siteHit10 === null || siteHit10 === undefined) return null;
  let best = null;
  for (let t = 1; t <= Math.max(1, picksN); t++) {
    const seq = rows.map((r) => (r.hitCount || 0) >= t);
    const cnt = seq.filter(Boolean).length;
    let mx = 0, run = 0;
    for (const h of seq) { run = h ? run + 1 : 0; if (run > mx) mx = run; }
    const cost = Math.abs(cnt - siteHit10) * 10 +
      (siteMaxStreak === null || siteMaxStreak === undefined ? 0 : Math.abs(mx - siteMaxStreak));
    if (!best || cost < best.cost) best = { threshold: t, count: cnt, maxStreak: mx, cost };
  }
  return best ? { threshold: best.threshold, count: best.count, maxStreak: best.maxStreak, exact: best.cost === 0 } : null;
}

function computeStats(recent, cfg) {
  const poolSize = cfg.red[1] - cfg.red[0] + 1;
  const picksN = recent.reduce((mx, r) => Math.max(mx, r.picks.length), 0);
  const threshold = hitThreshold(picksN, cfg.drawn, poolSize);

  const rows = recent.map((r) => ({ ...r, hit: (r.hitCount || 0) >= threshold }));
  const n = rows.length;
  const hitSeq = rows.map((r) => r.hit);                      // 最新在前

  // 站点口径：中N >= 1 就算这一期红（列表页「近10中N期」用的就是这个口径）
  const rawHit10 = rows.filter((r) => (r.hitCount || 0) >= 1).length;

  const hitCount10 = hitSeq.filter(Boolean).length;
  const hitRate10 = n ? +(hitCount10 / n).toFixed(4) : 0;

  // 最长连红
  let maxStreak = 0, run = 0;
  for (const h of hitSeq) { run = h ? run + 1 : 0; if (run > maxStreak) maxStreak = run; }

  // 当前连红（从最新往回）
  let curStreak = 0;
  for (const h of hitSeq) { if (h) curStreak++; else break; }

  // 恢复率：黑过一次之后「下一期（更近的一期）」马上红
  const blackCount = hitSeq.filter((h) => !h).length;
  let recovers = 0;
  for (let i = 0; i < n; i++) {
    if (!hitSeq[i] && i > 0 && hitSeq[i - 1]) recovers++;
  }
  const recoverRate = blackCount ? +(recovers / blackCount).toFixed(4) : 1;

  const lastHit = n ? hitSeq[0] : false;

  return { periods: n, picksN, threshold, rows, rawHit10, hitCount10, hitRate10, maxStreak, curStreak, recoverRate, blackCount, recovers, lastHit };
}

function scoreExpert(s) {
  let score = s.hitRate10 * 35
    + (Math.min(s.maxStreak, 10) / 10) * 25
    + s.recoverRate * 25
    + (s.lastHit ? 15 : 0);
  // 惩罚「一直黑」：黑得多且几乎不恢复
  if (s.blackCount >= 3 && s.recoverRate < 0.4) score -= 20;
  // 轻微惩罚「当前正在黑」（有连黑未恢复）
  if (s.periods >= 4 && s.curStreak === 0 && s.blackCount >= 2) score -= 5;
  // 历史期数越少越不可信
  if (s.periods < 6) score -= (6 - s.periods) * 3;
  return +Math.max(0, score).toFixed(2);
}

/* ============================================================
   号码池
   ============================================================ */
const inc = (map, k) => map.set(k, (map.get(k) || 0) + 1);
const inRange = (n, rg) => Number.isFinite(n) && n >= rg[0] && n <= rg[1];

function buildPool(cfg, stable, useHits = true) {
  const pickFreq = new Map();
  const hitFreq = new Map();
  const drawFreq = new Map();
  const bluePickFreq = new Map();
  const blueHitFreq = new Map();
  const blueDrawFreq = new Map();

  for (const e of stable) {
    for (const r of e.recentRaw) {
      for (const n of r.picks) if (inRange(n, cfg.red)) inc(pickFreq, n);
      if (useHits) for (const n of r.hits) if (inRange(n, cfg.red)) inc(hitFreq, n);
      for (const n of r.draw) if (inRange(n, cfg.red)) inc(drawFreq, n);
      if (cfg.blue) {
        for (const b of (r.bluePicks || [])) {
          if (!inRange(b.n, cfg.blue)) continue;
          inc(bluePickFreq, b.n);
          if (useHits && b.win) inc(blueHitFreq, b.n);
        }
        if (r.drawBlue !== null && inRange(r.drawBlue, cfg.blue)) inc(blueDrawFreq, r.drawBlue);
      }
    }
  }

  const maxOf = (map) => Math.max(1, ...[...map.values()]);
  const maxPick = maxOf(pickFreq);
  const maxHit = maxOf(hitFreq);
  const maxDraw = maxOf(drawFreq);

  // 共识百分比（可见号码才有号码；? 的只有百分比，无法映射到具体号）
  const consRed = new Map();
  for (const it of (cfg._consensus?.red || [])) {
    if (it.num === null || !inRange(it.num, cfg.red)) continue;
    consRed.set(it.num, Math.max(consRed.get(it.num) || 0, it.pct));
  }

  const universe = new Set([...pickFreq.keys(), ...hitFreq.keys(), ...drawFreq.keys(), ...consRed.keys()]);
  const ranked = [...universe].map((num) => {
    const score =
      45 * ((hitFreq.get(num) || 0) / maxHit) +
      25 * ((pickFreq.get(num) || 0) / maxPick) +
      20 * ((consRed.get(num) || 0) / 100) +
      10 * ((drawFreq.get(num) || 0) / maxDraw);
    return { num, score: +score.toFixed(3), pick: pickFreq.get(num) || 0, hit: hitFreq.get(num) || 0 };
  }).sort((a, b) => (b.score - a.score) || (a.num - b.num));

  const red = ranked.slice(0, cfg.poolRed).map((x) => x.num).sort((a, b) => a - b);

  /* 蓝球 / 后区：共识页可见号（按百分比）+ 专家历史蓝号命中/推荐频率 + 近期开奖蓝号频率 */
  let blue = [];
  if (cfg.blue) {
    const consBlue = new Map();
    for (const it of (cfg._consensus?.blue || [])) {
      if (it.num === null || !inRange(it.num, cfg.blue)) continue;
      consBlue.set(it.num, Math.max(consBlue.get(it.num) || 0, it.pct));
    }
    const maxCP = maxOf(consBlue);
    const maxBH = maxOf(blueHitFreq);
    const maxBP = maxOf(bluePickFreq);
    const maxBD = maxOf(blueDrawFreq);
    const uniB = new Set([...consBlue.keys(), ...blueHitFreq.keys(), ...bluePickFreq.keys(), ...blueDrawFreq.keys()]);
    blue = [...uniB].map((num) => ({
      num,
      score:
        60 * ((consBlue.get(num) || 0) / maxCP) +
        20 * ((blueHitFreq.get(num) || 0) / maxBH) +
        12 * ((bluePickFreq.get(num) || 0) / maxBP) +
        8 * ((blueDrawFreq.get(num) || 0) / maxBD)
    })).sort((a, b) => (b.score - a.score) || (a.num - b.num))
      .slice(0, cfg.poolBlue)
      .map((x) => x.num)
      .sort((a, b) => a - b);
  }

  return {
    pool: { red, blue },
    freq: ranked.slice(0, 30)
  };
}

/* ============================================================
   单彩种抓取
   ============================================================ */
async function runGame(game, cfg, opts, report) {
  log(`\n────────────────────────────────────────────`);
  log(`【${cfg.name}】${game}  开始`);

  const g = {
    name: cfg.name,
    categories: {},
    expertCount: 0,
    listedCount: 0,
    scoreSource: 'history',
    hitDataReliable: true,
    stable: [],
    consensus: { red: [], blue: [], sections: [], topExperts: [], updated: null },
    pool: { red: [], blue: [] },
    notes: []
  };

  /* 1) 找分类编号 */
  let tabs = [];
  let seedHtml = null;
  let seedCode = null;
  for (const seed of cfg.seeds) {
    const r = await httpGet(`${BASE}/ex/${game}ex${seed}`);
    if (!r.ok) { report.errors.push(`${game} 种子页 ${seed}: ${r.error}`); await sleep(randDelay()); continue; }
    const t = parseTabs(r.text, game);
    if (t.length) { tabs = t; seedHtml = r.text; seedCode = seed; break; }
    await sleep(randDelay());
  }
  if (!tabs.length) {
    log(`  ❌ 拿不到分类列表，跳过 ${game}`);
    g.notes.push('分类列表抓取失败');
    report.games[game] = g;
    return g;
  }

  const cats = selectCategories(tabs, opts.catsPerGame, opts.blueCats);
  for (const c of tabs) {
    g.categories['c' + c.code.replace('_', '')] = { code: c.code, label: c.label, used: cats.some((x) => x.code === c.code) };
  }
  log(`  分类 ${tabs.length} 个，选中 ${cats.length} 个：${cats.map((c) => c.label + c.code).join(' / ')}`);

  /* 2) 分类列表页 → 专家候选（同一位专家可能出现在多个分类，保留每个分类的战绩） */
  const seen = new Map();
  for (let i = 0; i < cats.length; i++) {
    const c = cats[i];
    let html;
    if (seedHtml && c.code === seedCode) {
      html = seedHtml;                     // 种子页正好就是这个分类，直接复用
    } else {
      const r = await httpGet(`${BASE}/ex/${game}ex${c.code}`);
      await sleep(randDelay());
      if (!r.ok) {
        log(`    ⚠️  分类 ${c.label}(${c.code}) 抓取失败：${r.error}`);
        report.errors.push(`${game}/${c.label}: ${r.error}`);
        continue;
      }
      html = r.text;
    }
    const list = parseExpertList(html).slice(0, opts.perCategoryLimit);
    let added = 0;
    for (const e of list) {
      if (seen.has(e.path)) {
        // 同一专家在别的分类也上榜：补记战绩，不覆盖首个分类
        const prev = seen.get(e.path);
        prev.siteMetrics.push({ cat: c.label, hit10: e.hit10, maxStreak: e.siteMaxStreak });
        continue;
      }
      seen.set(e.path, {
        ...e,
        catCode: c.code,
        catLabel: c.label,
        blue: isBlueLabel(c.label),
        siteMetrics: [{ cat: c.label, hit10: e.hit10, maxStreak: e.siteMaxStreak }]
      });
      added++;
    }
    log(`    [${i + 1}/${cats.length}] ${c.label}(${c.code}) 列表 ${list.length} 位，新增 ${added} 位，累计 ${seen.size}`);
  }

  g.listedCount = seen.size;
  if (!seen.size) {
    log(`  ❌ 没有拿到任何专家，跳过 ${game}`);
    g.notes.push('专家列表为空');
    report.games[game] = g;
    return g;
  }

  /* 3) 预筛 + 截断（给蓝球/后区类专家保留名额） */
  const byRank = (a, b) =>
    ((b.hit10 ?? -1) - (a.hit10 ?? -1)) || ((b.siteMaxStreak ?? -1) - (a.siteMaxStreak ?? -1));
  let cands = [...seen.values()].sort(byRank);
  const passed = cands.filter((e) => (e.hit10 ?? 0) >= opts.prescreenHit10);
  cands = passed.length >= 5 ? passed : cands;

  const blueCands = cands.filter((e) => e.blue);
  const redCands = cands.filter((e) => !e.blue);
  const blueKeep = blueCands.slice(0, opts.blueExpertSlots);
  /* ===== FIVE_CAT_QUOTA（用户 2026-10-19：5 类号必须每类 20 位）=====
     原来：按分数取前 N → 分数高的前 2 个分类把名额全占满 ✗
           → byCat 只有 2 组，25码/3码/1码/后区定三/杀号三 里缺 3 类 ✗
     现在：每个分类最多 20 位，按分类轮着取 → 5 个目标分类都有 20 位 ✔
     总人数仍受 maxExpertsPerGame 限制（--all 模式是 200，够用） */
  const PER_CAT_QUOTA = 20;
  const catCount = {};
  const redKeep = [];
  const cap = Math.max(0, opts.maxExpertsPerGame - blueKeep.length);
  for (const e of redCands) {
    if (redKeep.length >= cap) break;
    const catOf = (e.siteMetrics && e.siteMetrics[0] && e.siteMetrics[0].cat) || e.cat || '_';
    catCount[catOf] = (catCount[catOf] || 0) + 1;
    if (catCount[catOf] <= PER_CAT_QUOTA) redKeep.push(e);
  }
  log('  分类配额：' + Object.keys(catCount).map((k) => k + '=' + Math.min(catCount[k], PER_CAT_QUOTA)).join(' '));
  const dropped = cands.length - redKeep.length - blueKeep.length;
  cands = [...redKeep, ...blueKeep];
  log(`  候选 ${g.listedCount} 位 → 预筛(近10中≥${opts.prescreenHit10}) ${passed.length} 位 → 抓取 ${cands.length} 位` +
    `（号码类 ${redKeep.length} + 蓝球/后区类 ${blueKeep.length}${blueKeep.length ? '：' + blueKeep.map((e) => e.name).join('/') : ''}，其余 ${dropped} 位未抓）`);

  /* 4) 逐位专家历史 */
  const experts = [];
  for (let i = 0; i < cands.length; i++) {
    const e = cands[i];
    const r = await httpGet(e.url);
    await sleep(randDelay());
    if (!r.ok) {
      log(`    ⚠️  [${i + 1}/${cands.length}] ${e.name} 失败：${r.error}`);
      report.errors.push(`${game} 专家 ${e.name}: ${r.error}`);
      continue;
    }
    const recent = parseExpertHistory(r.text, game, opts.maxPeriods);
    if (!recent.length) {
      log(`    ⚠️  [${i + 1}/${cands.length}] ${e.name} 无历史表`);
      report.errors.push(`${game} 专家 ${e.name}: 无历史表`);
      continue;
    }
    const st = computeStats(recent, cfg);
    const siteFit = calibrateThreshold(st.rows, st.picksN, e.hit10, e.siteMaxStreak);

    /* 【这一期免费公开的 N 胆】用户 2026-10-17：
       专家页每一期只有一栏（他的大池），按分类拆开的号在「查看」进去的详情页里；
       页面上要显示的就是【最新一期】那一页 —— 所以只多抓这一页（每位专家 +1 次请求）。
       ⚠️ 抓不到 / 这一期他没公开这个分类 → catLatest = null，页面上那块不显示，绝不编数字。

       【2026-10-18 20:0x 修「专家推荐 0 条」· 补抓【下一期】】
       原实现只抓「历史表最新一行 = 最新已开奖期」的详情页，于是数据永远比源站在售期
       晚一期：源站 issueName 已切到 2026119，catLatest.issue 还是 2026118 →
       index 页那条 `catLatest.issue === g.issue` 的过滤把 8 个彩种全滤成 0 条。
       实测「下一期」的详情页是能公开抓到的（同一套 URL，只换期号）：
         /ex/ssqex/tjxq_5_168_2026118.html（已开奖）
         /ex/ssqex/tjxq_5_168_2026119.html（正在卖 → 200，分类行 + 号码都在）
       所以顺序改成：
         ① 页首那期（pendingIssue）≠ 历史最新期 → 先抓【下一期】，拿到就用它；
         ② 拿不到（还没出号 / 没这个分类）→ 退回抓【历史最新期】，期号如实写；
         ③ 两处都拿不到 → catLatest = null（页面那块不显示）。
       ⚠️ 期号绝不乱拼：详情页链接里没有 7 位期号段就【不换期】（返回 null）。 */
    let catLatest = null;
    const latestRow = st.rows[0];
    const pendingIssue = parsePendingIssue(r.text);
    e.pendingIssue = pendingIssue;
    const fetchCatNums = async (issueNo, basePath) => {
      if (!basePath) return null;
      let p = String(basePath);
      if (issueNo) {
        /* URL 形如 /ex/ssqex/tjxq_5_168_2026118.html —— 期号在【结尾】，
           前面是下划线（_168_2026118），所以只认「结尾那一段 5~7 位数字 + .html」。 */
        const rep = p.replace(/(\d{5,7})\.html$/, String(issueNo) + '.html');
        if (rep === p) return null;      /* 链接里没有期号段 → 不乱拼，直接放弃 */
        p = rep;
      }
      let u = '';
      try { u = new URL(p, BASE + '/').href; } catch (err) { return null; }
      const rr = await httpGet(u);
      await sleep(randDelay());
      if (!rr.ok) {
        log(`         ⚠️ 详情页抓取失败（${issueNo || '?'} 期）：${rr.error || rr.status}`);
        return null;
      }
      return parseCatDetail(rr.text, e.catLabel);
    };
    if (latestRow) {
      if (pendingIssue && latestRow.issue && String(pendingIssue) !== String(latestRow.issue)) {
        const nextNums = await fetchCatNums(pendingIssue, latestRow.detailPath);
        if (nextNums) {
          catLatest = { issue: String(pendingIssue), nums: nextNums };
          log(`         ✅ 下一期 ${pendingIssue} 期已出号 → 抓到 ${nextNums.length} 个号`);
        } else {
          log(`         ⚠️ 下一期 ${pendingIssue} 期还没出号/没这个分类 → 退回 ${latestRow.issue} 期`);
        }
      }
      if (!catLatest && latestRow.detailPath) {
        /* 详情页链接是【根相对路径】（/ex/ssqex/tjxq_x_期号.html），
           而 httpGet 只吃绝对 URL —— 用 BASE 拼（BASE 就是抓取用的站点根）。 */
        const nums = await fetchCatNums('', latestRow.detailPath);
        if (nums) catLatest = { issue: String(latestRow.issue), nums };
        else log(`         ⚠️ 详情页里没有分类「${e.catLabel}」（这一期没公开？）→ 不显示`);
      }
    }

    const expert = {
      name: safeName(e.name),
      url: e.path,
      cat: e.catLabel,
      blue: !!e.blue,
      siteMetrics: e.siteMetrics,
      listHit10: e.hit10,
      siteMaxStreak: e.siteMaxStreak,
      siteFit,
      catLatest,
      /* 【内部字段】专家页页首那期的期号 —— 只用来给 games[g].issue 兜底，
         输出到 g.stable 时会被白名单过滤掉（不会进 experts-data.js）。 */
      pendingIssue,
      ...st,
      score: scoreExpert(st)
    };
    expert.recentRaw = st.rows;
    experts.push(expert);

    // 原始战绩逐条打印，方便人工核对站点数据
    log(`    [${String(i + 1).padStart(2)}/${cands.length}] ${e.name}` +
      `  站点:近10中${e.hit10 ?? '?'}/最高${e.siteMaxStreak ?? '?'}连红` +
      `  计算:中N≥1 ${st.rawHit10}/${st.periods}` +
      ` 门槛${st.threshold}(${st.picksN}码) 红${st.hitCount10}/${st.periods}` +
      ` 最长${st.maxStreak} 当前${st.curStreak} 恢复${st.recoverRate} 黑${st.blackCount} 上期${st.lastHit ? '红' : '黑'} 分${expert.score}` +
      (siteFit ? `  | 站点可复现:${siteFit.exact ? '是' : '否'}@门槛${siteFit.threshold}(中${siteFit.count}/连${siteFit.maxStreak})` : ''));
    if (opts.verbose) {
      log(`         每期中N（新→旧）: ${st.rows.map((x) => `${x.issue}:${x.hitCount}${x.hit ? '*' : ''}`).join(' ')}`);
    }
  }
  g.expertCount = experts.length;
  if (!experts.length) {
    log(`  ❌ 专家历史全部抓取失败，跳过 ${game}`);
    g.notes.push('专家历史全部抓取失败');
    report.games[game] = g;
    return g;
  }

  /* 4.5) 数据质量：c-win 与开奖号对不上的比例 */
  const totalBad = experts.reduce((s, e) => s + e.recentRaw.reduce((a, r) => a + (r.badHits || 0), 0), 0);
  const totalHits = experts.reduce((s, e) => s + e.recentRaw.reduce((a, r) => a + r.hits.length + (r.badHits || 0), 0), 0);
  const badRatio = totalHits ? totalBad / totalHits : 0;
  g.hitDataReliable = badRatio < 0.2;
  if (totalBad) {
    log(`  ⚠️  c-win 与开奖号不一致的号共 ${totalBad}/${totalHits}（${(badRatio * 100).toFixed(1)}%）` +
      (g.hitDataReliable ? '，已丢弃这些假命中' : '，超过 20% → 该彩种命中数据不可信'));
    if (!g.hitDataReliable) {
      g.notes.push(`站点 c-win 与开奖号大量不一致（${(badRatio * 100).toFixed(1)}%），号码池不使用命中号，稳定性排序改用站点战绩`);
    } else {
      g.notes.push(`已丢弃与开奖号不一致的 c-win 号 ${totalBad} 个`);
    }
  }

  /* 4.6) 区分度检查
     有些彩种/玩法历史表里推荐的号太少（例如排列5 只显示 1 个号），
     「超过随机期望」的门槛只能是 1，于是人人 10/10 —— 历史表本身没有区分度。
     这种情况改用站点列表页的战绩（近10中 / 最高连红）排序，并在输出里注明。 */
  const distinctRates = new Set(experts.map((e) => e.hitRate10)).size;
  const atMax = experts.filter((e) => e.hitRate10 >= 1).length;
  const atZero = experts.filter((e) => e.hitRate10 <= 0).length;
  const degenerate = experts.length >= 8 &&
    (distinctRates <= 2 || atMax / experts.length >= 0.8 || atZero / experts.length >= 0.8);
  const saturated = degenerate || !g.hitDataReliable;
  g.scoreSource = saturated ? 'site' : 'history';
  if (saturated) {
    for (const e of experts) {
      e.score = +(((e.listHit10 ?? 0) / 10) * 60 + (Math.min(e.siteMaxStreak ?? 0, 30) / 30) * 40).toFixed(2);
    }
    if (degenerate) {
      log(`  ⚠️  该彩种历史表判红无区分度（推荐号个数=${[...new Set(experts.map((e) => e.picksN))].join('/')}，` +
        `命中门槛=${[...new Set(experts.map((e) => e.threshold))].join('/')}，` +
        `满分 ${atMax}/${experts.length} · 全黑 ${atZero}/${experts.length} · 命中率只有 ${distinctRates} 种取值）`);
      g.notes.push('历史表判红口径无区分度（推荐号太少），稳定性排序改用站点列表页战绩（近10中/最高连红）');
    }
    log(`      → 稳定性排序改用站点列表页战绩（近10中 + 最高连红）`);
  }

  /* 5) 稳定专家 */
  let poolExperts = experts.filter((e) => e.periods >= opts.minPeriodsForStable);
  if (poolExperts.length < 5) {
    const rest = experts.filter((e) => e.periods < opts.minPeriodsForStable)
      .sort((a, b) => b.score - a.score);
    poolExperts = poolExperts.concat(rest).slice(0, Math.max(5, poolExperts.length));
  }
  poolExperts.sort((a, b) => b.score - a.score);
  const stable = poolExperts.slice(0, opts.stableTop);

  const thrs = [...new Set(stable.map((e) => `${e.picksN}码/${e.threshold}中`))];
  log(`  命中门槛：${thrs.join(' ')}（优于随机期望才算红）`);
  log(`  稳定专家 ${stable.length} 位（候选 ${poolExperts.length}）：` +
    stable.map((e) => `${e.name}(${e.score})`).join(' '));

  /* 6) 共识分布页 */
  let consensus = { red: [], blue: [], sections: [], topExperts: [], updated: null };
  if (opts.consensus) {
    /* 部分彩种（排列5/七星彩/七乐彩）没有选号分布页，实测 /zjxhfb/{game}.html 返回空响应，
       这里按候选路径依次尝试，全部失败就跳过（不算错误）。 */
    /* 【手机版备用源 · 用户 2026-10-18】
       m.yiqicai.com 的手机版网页和 App 是同一份数据（实测 200 / 29KB / 已含下一期期号）。
       桌面版抓不到就自动改抓手机版，逻辑不变。
       顺序：手机版 → 桌面版 → 桌面版_1，谁先拿到算谁。 */
    const consPaths = [
      `/zjxhfb/${game}.html`,
      `/zjxhfb/${game}_1.html`,
      `https://m.yiqicai.com/zjxhfb/${game}.html`
    ];
    let got = null;
    for (const cp of consPaths) {
      /* 手机版是绝对地址（以 http 开头），桌面版是相对路径 */
      const url = cp.startsWith('http') ? cp : `${BASE}${cp}`;
      const r = await httpGet(url, { retries: 2 });
      await sleep(randDelay());
      if (r.ok && r.text.length > 500) { got = r.text; break; }
    }
    if (got) {
      consensus = parseConsensus(got);
      const visR = consensus.red.filter((x) => x.num !== null).length;
      const visB = consensus.blue.filter((x) => x.num !== null).length;
      log(`  共识分布：[${consensus.sections.map((s) => s.title + '(' + s.n + ')').join(' ')}] 可见号 红${visR}/蓝${visB}`);
    } else {
      log(`  共识分布：该彩种没有可用的选号分布页（/zjxhfb/${game}.html 空响应），号码池仅用专家历史频率`);
      g.notes.push('无选号分布页（站点未提供），号码池仅由专家历史频率生成');
      g.consensusUnavailable = true;
    }
  }

  /* 7) 号码池 */
  cfg._consensus = consensus;
  const built = buildPool(cfg, stable, g.hitDataReliable);
  g.consensus = {
    red: consensus.red.map((x) => ({ num: x.num, pct: x.pct })),
    blue: consensus.blue.map((x) => ({ num: x.num, pct: x.pct })),
    sections: consensus.sections,
    topExperts: consensus.topExperts,
    updated: consensus.updated,
    /* 【期号】源站 issueName 原文（例如 "2026119"）；取不到就是 null */
    issue: consensus.issue || null
  };
  /* 游戏层也放一份，页面取用方便 */
  if (consensus.issue) g.issue = consensus.issue;
  /* 【期号兜底 · 2026-10-18 20:0x】
     选号分布页取不到 issueName 的彩种（实测 福彩3D / 排列5 / 七星彩 / 七乐彩 都是 null），
     g.issue 就会缺 → 页面 NEXT_ISSUE = null → 这一组专家【全部被过滤成 0 条】。
     专家页页首的「最新推荐 第X期」是同一件事的另一个来源，用它的最大值补上。 */
  if (!g.issue && experts.length) {
    const pend = experts.map((e) => e.pendingIssue).filter(Boolean).sort();
    if (pend.length) {
      g.issue = pend[pend.length - 1];
      log(`  期号：源站 issueName 缺失 → 用专家页页首「最新推荐」补齐 = ${g.issue}`);
    }
  }
  g.pool = built.pool;
  if (!g.pool.red.length) g.notes.push('号码池为空（数据不足）');
  if (cfg.blue && !g.pool.blue.length) g.notes.push('蓝球池为空（共识页可见蓝号与历史蓝号均不足）');

  /* 8) 输出用的 stable（去掉内部字段） */
  g.stable = stable.map((e) => ({
    name: safeName(e.name),
    url: e.url,
    cat: e.cat,
    /* 【这一期免费公开的 N 胆】{ issue, nums } —— 页面详情面板就显示它；
       抓不到时是 null（面板不显示这块）。见 parseCatDetail() 的说明。 */
    catLatest: e.catLatest || null,
    siteMetrics: e.siteMetrics,
    siteHit10: e.listHit10,
    rawHit10: e.rawHit10,
    siteFit: e.siteFit,
    picksN: e.picksN,
    threshold: e.threshold,
    hitRate10: e.hitRate10,
    maxStreak: e.maxStreak,
    curStreak: e.curStreak,
    recoverRate: e.recoverRate,
    blackCount: e.blackCount,
    lastHit: e.lastHit,
    score: e.score,
    periods: e.periods,    recent: e.recentRaw.map((r) => ({
      issue: r.issue,
      picks: r.picks,
      hits: r.hits,
      hitCount: r.hitCount,
      hit: r.hit
    }))
  }));

  /* ============================================================
     【5 类号 · 用户 2026-10-19「每个专家必须抓到：25码 3码 1码 后区3码 杀号3码」】
     ------------------------------------------------------------
     问题：g.stable 是按「人」去重的，每位只带【一个】分类（e.cat）。
     所以页面没法把同一个人的 5 类号并排显示。
     解决：这里额外输出 g.byCat —— 按【分类】分组，每组最多 20 位专家，
           每位带他自己的号码（catLatest.nums）。
     页面可以：
       ① 按分类展示「这个分类的 20 位专家 + 号码」（5 行 × 20 人）
       ② 或者按专家名合并同一人的多个分类（有哪类显示哪类）
     只加数据、不改原有 stable 结构，老页面完全不受影响。
     ============================================================ */
  const FIVE_KW = [
    { key: 'c25', re: /25码|前区25|红球25/ },
    { key: 'c3', re: /三胆/ },
    { key: 'c1', re: /独胆|一胆|定一|^1码$/ },
    { key: 'cback', re: /蓝球定三|定三|后区3|后区三/ },
    { key: 'ckill', re: /杀三|杀号三|红球杀三|杀3/ }
  ];
  try {
    const all = (experts || []).filter((e) => e && e.cat && e.catLatest && Array.isArray(e.catLatest.nums) && e.catLatest.nums.length);
    const byCat = {};
    const byExpert = {};
    for (const e of all) {
      const nm = safeName(e.name);
      const nums = e.catLatest.nums;
      const issue = e.catLatest.issue || '';
      /* ① 按分类分组（每个分类最多 20 位） */
      if (!byCat[e.cat]) byCat[e.cat] = [];
      if (byCat[e.cat].length < 20) byCat[e.cat].push({ name: nm, nums, issue, score: e.score });
      /* ② 按专家合并（同一人的多个分类） */
      if (!byExpert[nm]) byExpert[nm] = { name: nm, cats: {} };
      byExpert[nm].cats[e.cat] = nums;
    }
    /* ③ 只保留「5 类」里出现过的分类名，并标上属于哪一类 */
    const catsLite = Object.keys(byCat).map((c) => ({
      cat: c,
      five: (FIVE_KW.find((k) => k.re.test(c)) || {}).key || '',
      count: byCat[c].length,
      experts: byCat[c]
    })).sort((a, b) => (a.cat < b.cat ? -1 : 1));
    g.byCat = catsLite;
    g.byExpert = Object.values(byExpert).slice(0, 60);
    const fiveFound = FIVE_KW.filter((k) => catsLite.some((c) => c.five === k.key)).map((k) => k.key);
    log(`  5 类号：分类 ${catsLite.length} 组 · 覆盖 ${fiveFound.join('/') || '无'} · 专家 ${Object.keys(byExpert).length} 位`);
  } catch (e) {
    g.byCat = [];
    g.byExpert = [];
    log('  ⚠️ 5 类号输出失败（不影响其它数据）：' + e.message);
  }

  log(`  号码池：红/前区 ${g.pool.red.length} 个 [${g.pool.red.join(',')}]` +
    (cfg.blue ? `  蓝/后区 ${g.pool.blue.length} 个 [${g.pool.blue.join(',')}]` : ''));
  if (g.notes.length) log(`  备注：${g.notes.join('；')}`);

  report.games[game] = g;
  return g;
}

/* ============================================================
   入口
   ============================================================ */
function parseArgs(argv) {
  const opts = { ...DEFAULTS, consensus: true, verbose: false, games: [], perCategoryLimitSet: false, maxSet: false };
  const games = [];
  for (const a of argv) {
    if (/^--limit=(\d+)$/.test(a)) { opts.perCategoryLimit = +a.split('=')[1]; opts.perCategoryLimitSet = true; continue; }
    /* 【--all · 用户 2026-10-18「把专家的所有资料全部抓进来」】
       全量模式：每个分类 20 位（站点一页上限）、每个彩种 200 位、每人 30 期、
       输出 200 位稳定专家、保留所有分类。
       ⚠️ 全量一轮 2000+ 请求 / 30~60 分钟 —— 只放云端（凌晨 2 点全量班）跑。 */
    /* 【抓到就停】用户 2026-10-18：已抓够的彩种直接跳过，等下一期开奖再抓 */
    if (a === '--skip-done') { opts.skipDone = true; continue; }
    /* 【防回退闸门】故意接受"比上一版更小"的抓取结果时才加这个（见输出段的说明） */
    if (a === '--allow-shrink') { opts.allowShrink = true; continue; }
    if (a === '--all') {
      opts.perCategoryLimit = DEFAULTS.allPerCategoryLimit;
      opts.perCategoryLimitSet = true;
      opts.maxExpertsPerGame = DEFAULTS.allMaxExpertsPerGame;
      opts.maxPeriods = DEFAULTS.allMaxPeriods;
      opts.stableTop = 200;
      opts.catsPerGame = 99;
      opts.blueCats = 99;
      opts.blueExpertSlots = 99;
      opts.prescreenHit10 = 0;
      opts.maxSet = true;
      opts.all = true;
      continue;
    }
    if (/^--max=(\d+)$/.test(a)) { opts.maxExpertsPerGame = +a.split('=')[1]; opts.maxSet = true; continue; }
    if (/^--cats=(\d+)$/.test(a)) { opts.catsPerGame = +a.split('=')[1]; continue; }
    if (/^--bluecats=(\d+)$/.test(a)) { opts.blueCats = +a.split('=')[1]; continue; }
    if (/^--blueslots=(\d+)$/.test(a)) { opts.blueExpertSlots = +a.split('=')[1]; continue; }
    if (/^--stable=(\d+)$/.test(a)) { opts.stableTop = +a.split('=')[1]; continue; }
    if (/^--periods=(\d+)$/.test(a)) { opts.maxPeriods = +a.split('=')[1]; continue; }
    if (a === '--no-consensus') { opts.consensus = false; continue; }
    if (a === '--verbose' || a === '-v') { opts.verbose = true; continue; }
    if (a.startsWith('--')) continue;
    games.push(a);
  }
  if (opts.perCategoryLimitSet && !opts.maxSet) {
    opts.maxExpertsPerGame = Math.max(2, opts.perCategoryLimit * 3);
  }
  opts.games = games.length ? games : Object.keys(GAMES);
  return opts;
}

async function main() {
  const t0 = Date.now();
  /* 【backoff 闸门】距上次成功不到 --min-interval 分钟 → 直接跳过（不抓、不写） */
  if (gateShouldSkip()) return;
  const opts = parseArgs(process.argv.slice(2));

  const unknown = opts.games.filter((g) => !GAMES[g]);
  if (unknown.length) {
    log(`❌ 不认识的彩种：${unknown.join(', ')}（可用：${Object.keys(GAMES).join(' / ')}）`);
    process.exit(1);
  }

  log('════════════════════════════════════════════');
  log('  彩虹多多 · 一起彩专家数据抓取（统计参考，非预测）');
  log('════════════════════════════════════════════');
  log(`  彩种：${opts.games.join(', ')}`);
  log(`  参数：每分类≤${opts.perCategoryLimit} 位 / 每彩种≤${opts.maxExpertsPerGame} 位专家历史 / ` +
    `${opts.catsPerGame} 个号码类分类 + ${opts.blueCats} 个蓝球类分类 / 每人≤${opts.maxPeriods} 期`);

  const report = { games: {}, errors: [] };
  /* 【上一版数据】用来判断"某个彩种是不是已经抓完了"（用户 2026-10-18：
     「一直抓取，直到某个彩种抓到为止就停了，等下一期开奖继续抓」） */
  const PREV_DATA = (() => {
    try {
      const f = path.join(path.dirname(fileURLToPath(import.meta.url)), 'experts-data.js');
      if (!fs.existsSync(f)) return {};
      const m = fs.readFileSync(f, 'utf8').match(/const EXPERTS_DATA = ([\s\S]*?);\s*$/) ||
        fs.readFileSync(f, 'utf8').match(/const EXPERTS_DATA = ([\s\S]*?);/);
      return m ? JSON.parse(m[1]) : {};
    } catch (e) { return {}; }
  })();

  for (const game of opts.games) {
    /* 【抓到就停 · 用户 2026-10-18】
       每个彩种只要满足三条，就【跳过不抓】：
         ① 源站当前期号 == 本地已存的期号（说明这一期已经抓过）
         ② 专家 ≥ 20 位
         ③ 分类 ≥ 10 个（25码/三胆/独胆/蓝球定三/杀号 都在里面）
       哪天源站期号变了（= 下一期开奖/开卖）→ 条件①不成立 → 自动重新抓。
       云端每 10 分钟跑一次这个脚本，所以：没抓够就一直抓，抓够了就安静等着。 */
    if (opts.skipDone) {
      try {
        const probe = await httpGet(`${BASE}/zjxhfb/${game}.html`, { retries: 1 });
        const srcIssue = (probe.text.match(/issueName\s*:\s*"(\d{5,7})"/) || [])[1] || '';
        const prev = (PREV_DATA.games || {})[game] || {};
        const prevIssue = String(prev.issue || (prev.consensus && prev.consensus.issue) || '');
        const stableN = (prev.stable || []).length;
        const catN = Object.keys(prev.categories || {}).length;
        if (srcIssue && srcIssue === prevIssue && stableN >= 20 && catN >= 10) {
          log(`  ⏭  ${game}：已是 ${srcIssue} 期 · ${stableN} 位专家 · ${catN} 个分类 → 抓够了，等下一期开奖再抓`);
          report.games[game] = prev;
          continue;
        }
        log(`  ▶  ${game}：需要抓（源站 ${srcIssue || '?'} 期 / 本地 ${prevIssue || '无'} 期 / 已 ${stableN} 位 / ${catN} 类）`);
      } catch (e) { /* 探测失败就照常抓，不影响 */ }
    }
    try {
      await runGame(game, { ...GAMES[game] }, opts, report);
    } catch (e) {
      log(`  ❌ ${game} 出错：${e.message}`);
      report.errors.push(`${game}: ${e.message}`);
    }
  }

  /* ---------- 输出 ---------- */
  const stamp = stampNow();
  const out = {
    updated: stamp,
    source: 'yiqicai.com',
    note: '程序自动抓取的一起彩专家历史命中统计与号码池，仅作统计参考，不构成任何中奖预测。',
    params: {
      perCategoryLimit: opts.perCategoryLimit,
      catsPerGame: opts.catsPerGame,
      blueCats: opts.blueCats,
      blueExpertSlots: opts.blueExpertSlots,
      maxExpertsPerGame: opts.maxExpertsPerGame,
      maxPeriods: opts.maxPeriods,
      stableTop: opts.stableTop
    },
    stat: {
      games: Object.keys(report.games).length,
      experts: Object.values(report.games).reduce((s, g) => s + (g.expertCount || 0), 0),
      stable: Object.values(report.games).reduce((s, g) => s + (g.stable || []).length, 0),
      requests: reqCount,
      errors: report.errors.length,
      seconds: +((Date.now() - t0) / 1000).toFixed(1)
    },
    games: report.games
  };

  /* ---------- 【防回退闸门】写出前先比上一版 ----------
     2026-10-18 事故复盘：有人调试时跑了 `node build-experts.mjs ssq`
     （只抓 1 个彩种 / 默认上限），一轮 37 个请求 23 秒就把上一班全量抓到的
     「8 彩种 · 160 位专家」覆盖成「1 彩种 · 15 位」。
     数据没编、也没报错（errors=0），但线上的专家推荐可点行 169 → 24、
     页面体积掉了 610 KB。这种"静默变小"必须拦住。
     规则：新一轮【彩种数变少】或【专家数掉到上一版的 70% 以下】时，
     【不覆盖】正式文件，把结果写成 experts-data.js.rejected-<时间戳> 备查，
     并大声报错；确认就是要接受更小的数据集时，加 --allow-shrink 再跑。 */
  const prevGamesN = Number(PREV_DATA && PREV_DATA.stat && PREV_DATA.stat.games) || 0;
  const prevExpertsN = Number(PREV_DATA && PREV_DATA.stat && PREV_DATA.stat.experts) || 0;
  const shrunkGames = prevGamesN > 0 && out.stat.games < prevGamesN;
  const shrunkExperts = prevExpertsN > 0 && out.stat.experts < Math.ceil(prevExpertsN * 0.7);

  const header = `/* ============================================================
   experts-data.js —— 一起彩专家数据（程序生成，勿手改）
   生成时间：${stamp}
   生成脚本：build-experts.mjs（node build-experts.mjs）
   数据来源：yiqicai.com 专家历史方案 + 选号分布

   字段说明：
     stable[].siteHit10 / rawHit10 列表页「近10中N期」 / 本期历史表里「中N>=1」的期数
                                   （两者口径一致，可用来核对抓取是否正确）
     stable[].recent[].picks       该期推荐号码
     stable[].recent[].hits        其中命中开奖号的号码
     stable[].recent[].hitCount    站点标注的「中N」（推荐号落在开奖号里的个数）
     stable[].recent[].hit         按 threshold 判定这一期是否算「红」
     stable[].picksN / threshold   推荐个数 / 命中门槛
     stable[].hitRate10            最近 10 期里「hit 为真」的比例
     stable[].maxStreak/curStreak  最长连红 / 当前连红
     stable[].recoverRate          黑过一次后下一期立刻转红的比例
     games.<game>.scoreSource      history = 用历史表算的分；site = 历史表无区分度，
                                   改用列表页「近10中 + 最高连红」算的分
     games.<game>.pool.red/blue    号码池（稳定专家历史频率 + 共识百分比 + 近期开奖冷热）

   命中门槛的口径（重要）：
     站点「中N」= 推荐号里有几个落在开奖号里。宽号码推荐（如双色球 25 码）几乎每期
     必定中 1 个以上，用「中N>=1」会让所有专家都满分。因此这里用「高于随机期望」判定：
       threshold = max(1, round(推荐个数 × 每期开出个数 / 号码池大小))
     即命中数达到「乱选的平均水平」才算这一期算红。

   已知数据口径限制（抓取时实测）：
     1. 专家详情页的历史表不按分类过滤，展示的是该专家「最新主推」的往期方案，
        因此 stable[].cat 是其在列表页所属分类，不一定是历史表里的玩法。
     2. 列表页 ?page=2 服务端不生效（返回第 1 页），每分类只能拿到约 20 位专家。
     3. 历史表「推荐号码」列不出现蓝球/后区，蓝球池主要来自选号分布页的可见蓝号，
        不足时用近期开奖蓝号频率补位。
     4. 选号分布页只有前若干个号码可见，其余为 ? 且仅有百分比，无法映射到具体号码。
     5. 排列5 / 七星彩 / 七乐彩 的选号分布页不存在（空响应），其号码池仅由专家历史频率生成。
     6. 数字型彩种（福彩3D/排列3/排列5/七星彩）无法区分号码所在的位（百/十/个位），
        号码池是跨位聚合的「热码」，下游需要按位选号时请用原有算法。
     7. 排列5 / 七星彩 的专家历史表里 c-win 与同一行的开奖号大量对不上（实测 ~59%），
        站点这两个彩种的命中标记不可信：脚本会丢弃对不上的 c-win，
        并且这两个彩种的 hitDataReliable=false、scoreSource='site'、号码池不使用命中号。
     8. 排列5 的专家历史表「推荐号码」列只有 1 个号，命中数只能是 0/1，
        任何门槛都无法区分，因此 pl5 的 scoreSource 是 'site'（用列表页战绩排序）。

   本文件仅为历史命中统计与热度参考，不构成任何中奖预测或保证。
   ============================================================ */

`;
  const js = header + `const EXPERTS_DATA = ${JSON.stringify(out, null, 1)};\n`;

  if (!opts.allowShrink && (shrunkGames || shrunkExperts)) {
    const rejFile = OUT_JS + '.rejected-' + stamp.replace(/[^\d]/g, '');
    fs.writeFileSync(rejFile, js, 'utf8');
    log('\n⛔ 已拒绝覆盖 experts-data.js —— 这一轮抓到的数据【比上一版少】：');
    log(`   上一版：${prevGamesN} 个彩种 / ${prevExpertsN} 位专家`);
    log(`   这一轮：${out.stat.games} 个彩种 / ${out.stat.experts} 位专家` +
      `（请求 ${out.stat.requests} · 错误 ${out.stat.errors}）`);
    log('   常见原因：手工只指定了部分彩种（如 `node build-experts.mjs ssq`）、' +
      '或源站限流导致某些彩种整块抓空。');
    log(`   正式文件保持原样，本轮结果留在：${path.basename(rejFile)}`);
    log('   确实要接受更小的数据集，请加 --allow-shrink 重跑。');
    process.exitCode = 2;
    return;
  }

  fs.writeFileSync(OUT_JS, js, 'utf8');
  /* 【backoff 闸门】确认写成功 → 记下这次成功时间（下一次要等 --min-interval 分钟才真跑） */
  gateMarkSuccess();

  /* ---------- 汇总 ---------- */
  const secs = +((Date.now() - t0) / 1000).toFixed(1);
  log('\n════════════════════════════════════════════');
  log('  抓取完成汇总');
  log('════════════════════════════════════════════');
  for (const [k, g] of Object.entries(report.games)) {
    log(`\n【${g.name} ${k}】候选 ${g.listedCount} · 抓取成功 ${g.expertCount} · 稳定 ${g.stable.length}` +
      (g.scoreSource === 'site' ? ' · 评分来源=站点战绩' : ''));
    log(`  分类：${Object.values(g.categories).filter((c) => c.used).map((c) => c.label + c.code).join(' / ') || '—'}`);
    log(`  稳定专家：${g.stable.map((e) => `${e.name}(${e.score})`).join('  ') || '—'}`);
    if (g.stable.length) {
      log('  核对（站点 近10中 / 计算 中N>=1 / 期望门槛 红 / 最长连红 / 恢复率 / 站点能否复现）:');
      for (const e of g.stable) {
        log(`    ${e.name.padEnd(12, ' ')} 站点${String(e.siteHit10 ?? '?').padStart(2)}/${e.periods}` +
          `  中N≥1 ${String(e.rawHit10).padStart(2)}/${e.periods}` +
          `  门槛${e.threshold}(${e.picksN}码) 红${String(Math.round(e.hitRate10 * e.periods)).padStart(2)}/${e.periods}` +
          `  最长${String(e.maxStreak).padStart(2)} 当前${e.curStreak} 恢复${e.recoverRate} 黑${e.blackCount} ${e.lastHit ? '上期红' : '上期黑'}` +
          `  ${e.siteFit ? (e.siteFit.exact ? '✓站点=门槛' + e.siteFit.threshold : '✗站点不可复现') : '—'}`);
      }
    }
    log(`  号码池 红/前区(${g.pool.red.length})：${g.pool.red.join(',') || '—'}`);
    if (g.pool.blue.length) log(`  号码池 蓝/后区(${g.pool.blue.length})：${g.pool.blue.join(',')}`);
    const consR = g.consensus.red.filter((x) => x.num !== null);
    const consB = g.consensus.blue.filter((x) => x.num !== null);
    if (consR.length || consB.length) {
      log(`  共识可见号：红 ${consR.map((x) => x.num + '(' + x.pct + '%)').join(' ') || '—'}` +
        (g.consensus.blue.length ? ` | 蓝 ${consB.map((x) => x.num + '(' + x.pct + '%)').join(' ') || '—'}` : ''));
    }
    if (g.notes.length) log(`  备注：${g.notes.join('；')}`);
  }

  const size = fs.statSync(OUT_JS).size;
  log(`\n请求数 ${reqCount} · 耗时 ${secs}s · 错误 ${report.errors.length}`);
  if (report.errors.length) {
    log('错误明细：');
    for (const e of report.errors.slice(0, 30)) log('  - ' + e);
    if (report.errors.length > 30) log(`  … 还有 ${report.errors.length - 30} 条`);
  }
  log(`\n✅ 已写入 ${OUT_JS}（${(size / 1024).toFixed(1)} KB）`);
}

main().catch((e) => {
  console.error('\n❌ 出错了：', e.stack || e.message);
  process.exit(1);
});
