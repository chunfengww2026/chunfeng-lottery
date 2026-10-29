/* ============================================================
   build-football-results.mjs —— 抓【已经踢完的比赛】的赛果
   ------------------------------------------------------------
   用户 2026-10-17：「已完场要有比分显示」/「足球比赛结果实时抓取」
   用户 2026-10-18：「补已经踢完的比赛的赛果抓取，最近 48 小时」

   【为什么要单独一个脚本】
   在售列表（jc-data.js）只含还能买的比赛，一开完就从源头消失；
   build-jc.mjs 的归档（jc-history.js）能把「我们自己那几场」存下来，
   但它的比分只有一个来源（football.js 的实时流），流里没有这一场时
   比分就永远是空的 →「已完场」只能显示「—」，红黑也算不出来。
   这一步补的是【独立的赛果源】：直接抓一张「完场比分」列表页，
   拿到 日期 / 联赛 / 主队 / 客队 / 终场比分 / 半场比分。

   数据源（实测 2026-10-18，全部 HTTP 200 · 见文件末尾的探测结论）：
     live.500.com/wanchang.php —— 完场比分页，2246KB，一次 1400+ 行
     每行自带 gy="联赛,主队,客队" 属性 → 不靠队名猜联赛，属性和比分一一对应
     ⚠️ live.500.com/jczq.php?type=end / ?status=end / ?e=end 实测【无效】：
        三个参数返回的字节数和基准页完全一样（都是在售列表），不要用。

   产物：
     ① jc-results.js   —— window/const JC_RESULTS = { updated, hours, count, list }
        每条：{ date, time, league, home, away, ft:{h,a}, ht:{h,a}|null, fid }
        date/time 是【北京时间】的开赛时间，和 jc-data / jc-history 同一口径
     ② 回填 jc-history.js（默认开）—— 只给「已经开赛 >2 小时、但 score 还是空」
        的记录补 score/result/hit/matched。已经有比分的一条都不动。
        为什么要写回历史：页面的「红黑」和推荐串存档（jc-reco-build.mjs）
        都读 jc-history.js 的 score，只有在那一层补上，红黑才会跟着算对。
        ⚠️ 只补空值 + 只有队名和日期都对上才补 → 没命中就原样不动，
           绝不会把一场错比分写进历史。用 --no-apply-history 可以整步关掉。

   用法：
     node build-football-results.mjs                    # 正常跑（48 小时窗口）
     node build-football-results.mjs --hours=24         # 换窗口
     node build-football-results.mjs --min-interval=30  # 本机链用的 30 分钟闸门
     node build-football-results.mjs --force-run        # 忽略闸门
     node build-football-results.mjs --dry              # 只抓只打印，不写文件
     node build-football-results.mjs --no-apply-history # 只出 jc-results.js，不动历史
     node build-football-results.mjs --no-fix-history   # 只补空比分，不纠正旧比分
     node build-football-results.mjs --strict           # 抓不到就 exit 1（默认 exit 0）

   退出码：默认【永远 0】（抓不到只告警、沿用旧数据）——
          这一步是比分补充源，不该把本机 30 分钟链（连续 3 次 softFail 弃轮）
          或云端构建（有一步 false 就整批回滚）拖垮。要严格失败加 --strict。
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/* 队名归一 / 同队判定 / 历史渲染 —— 全部复用归档内核（同一个口径，
   别在这里再写第二套 norm/sameTeam，否则同一支球队在两边会认成两支队）。 */
import { sameTeam, dayOf } from './jc-archive.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'jc-results.js');
const HIST = path.join(ROOT, 'jc-history.js');
const GATE_FILE = path.join(ROOT, '_backoff-build-football-results.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/* 【完场页】这是本文件唯一的数据源。
   实测（2026-10-18）：
     · 不带参数         → 只覆盖「昨天 10:00 ~ 今天 09:30」约 24 小时
     · ?e=YYYY-MM-DD    → 覆盖【该日 + 次日】（?e=10-17 → 10-17 与 10-18）
     · ?type=end / ?status=end / ?date= / ?d= / ?rq= / ?day= 全部【无效】（字节数一模一样）
   所以要 48 小时窗口 = 抓两页：?e=<今天> 和 ?e=<昨天>，按 fid 去重合并。 */
const RESULTS_URL = 'https://live.500.com/wanchang.php';
/* 每页覆盖「该日 + 次日」→ 要盖住 HOURS 小时，需要 HOURS/24 + 1 页（48h → 抓 3 页）。
   放在 HOURS 解析之后算（见下面 PAGE_DATES）。 */

const argv = process.argv.slice(2);
const argOf = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const has = (name) => argv.includes(`--${name}`);

const HOURS = (() => {
  const n = parseInt(argOf('hours') || '48', 10);
  return Number.isFinite(n) && n > 0 ? n : 48;
})();
/* 每页覆盖「该日 + 次日」→ 48 小时窗口要 3 页（今天 / 昨天 / 前天） */
const PAGE_DATES = Math.min(4, Math.max(2, Math.ceil(HOURS / 24) + 1));
const DRY = has('dry');
const APPLY_HISTORY = !has('no-apply-history');
/* 纠正「已有但错的比分」（比赛进行中的快照被当成终场）—— 默认开，见下面第 4 节说明 */
const FIX_HISTORY = !has('no-fix-history');
const FORCE_RUN = has('force-run');
/* --strict：抓不到就 exit 1（默认不报错，见文件末尾 fail() 的说明） */
const STRICT = has('strict');
const MIN_INTERVAL_MIN = (() => {
  const n = parseInt(argOf('min-interval') || '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
})();

/* 开赛 → 结束 ≈ +2 小时（90 分钟 + 中场 + 补时），和 build-jc.mjs /
   export-football.mjs 用的是同一个数（MATCH_LEN_HOURS）。 */
const MATCH_LEN_HOURS = 2;

const log = (...a) => console.log(...a);

/* ============================================================
   0. 闸门（本机 30 分钟链用；云端不传 --min-interval → 关着）
   ============================================================ */
function readGate() {
  try { return JSON.parse(fs.readFileSync(GATE_FILE, 'utf8')) || {}; } catch (e) { return {}; }
}
function writeGate(o) {
  try { fs.writeFileSync(GATE_FILE, JSON.stringify(o, null, 1), 'utf8'); } catch (e) { /* 忽略 */ }
}
if (MIN_INTERVAL_MIN && !FORCE_RUN) {
  const last = Number(readGate().lastSuccess) || 0;
  const gone = (Date.now() - last) / 60000;
  if (last && gone < MIN_INTERVAL_MIN) {
    log(`⏸  距上次成功 ${gone.toFixed(1)} 分钟 < ${MIN_INTERVAL_MIN} 分钟 → 本步跳过（数据不动）`);
    process.exit(0);
  }
}

/* ============================================================
   1. 读旧数据（抓不到时的兜底 —— 绝不把 jc-results.js 写空）
   ============================================================ */
function loadVar(file, varName) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return null;
  try {
    const c = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
    vm.runInContext(fs.readFileSync(p, 'utf8') + `\nglobalThis.__X = ${varName};`, c);
    return c.__X;
  } catch (e) { return null; }
}

const OLD = loadVar('jc-results.js', 'JC_RESULTS');
const OLD_LIST = (OLD && Array.isArray(OLD.list)) ? OLD.list : [];
/* 月度组合可能已离开短期比赛列表，按未结算的原始队名和开赛日补抓。 */
let PAIR_LEGS = [];
try {
  const archive = JSON.parse(fs.readFileSync(path.join(ROOT, 'reco-archive.json'), 'utf8'));
  const cutoff = Date.now() - 31 * 86400000;
  PAIR_LEGS = (archive.footballPairs || []).flatMap(p => p.legs || [])
    .filter(l => !l.verdict && Date.parse(String(l.time).replace(' ', 'T') + '+08:00') >= cutoff);
} catch (e) {}
function wantedPairResult(r) {
  return PAIR_LEGS.some(l => dayOf(l.time) === r.date && sameTeam(l.home, r.home) && sameTeam(l.away, r.away));
}

/* ============================================================
   2. 抓完场比分页
   ============================================================ */
async function fetchPage(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://www.500.com/'
    },
    signal: AbortSignal.timeout(30000)
  });
  const buf = Buffer.from(await r.arrayBuffer());
  let text = buf.toString('utf8');
  /* 页面可能是 GBK（球探/部分 500 子站是）；出现替换字符就整页按 GBK 重解一次 */
  if (text.indexOf('\ufffd') >= 0) {
    try { text = new TextDecoder('gbk').decode(buf); } catch (e) { /* 保留 utf8 版本 */ }
  }
  return { status: r.status, ok: r.ok, text, kb: Math.round(buf.length / 1024) };
}

/** 今天 / 前 N 天的 YYYY-MM-DD（北京时间，和页面同一口径） */
function bjDay(offset) {
  const d = new Date(Date.now() + 8 * 3600 * 1000 - (offset || 0) * 86400000);
  const p2 = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

/* ============================================================
   3. 解析：一行 = 一场比赛
   ------------------------------------------------------------
   实测行结构（这是唯一可信的形状，别按裸数字正则乱抓）：
     <tr id="a<fid>" gy="联赛,主队,客队" ...>
       <td class="ssbox_01"><a>联赛</a></td>
       <td>第N轮</td>
       <td>10-17 10:00</td>                       ← 开赛（北京时间，无年份）
       <td><span class="red">完</span></td>        ← 状态
       <td class="p_lr01"><span class="mainName">主队</span> …</td>
       <td><div class="pk"><a class="clt1">4</a><span>-</span><a class="clt3">0</a></div></td>
       <td class="p_lr01"><span class="clientName">客队</span> …</td>
       <td class="red">1 - 0</td>                  ← 半场比分
   所以：主客队优先取 mainName / clientName，取不到退回 gy 的第 2、3 段；
        终场比分取 .pk 里的 clt1/clt3；半场取最后一个 class="red" 的纯文本单元格。
   ============================================================ */
const txt = (s) => String(s || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

/** '10-17 10:00' → { md:'10-17', hm:'10:00' } */
function splitDateTime(s) {
  const m = /(\d{1,2})\s*-\s*(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(String(s || ''));
  if (!m) return null;
  return {
    mm: String(m[1]).padStart(2, '0'),
    dd: String(m[2]).padStart(2, '0'),
    hh: m[3] != null ? String(m[3]).padStart(2, '0') : '',
    mi: m[4] != null ? m[4] : ''
  };
}

/** 只有 MM-DD HH:MM → 补年份。补出来的时间比「现在」晚 24 小时以上 = 去年 */
function withYear(dt, nowMs) {
  const cur = new Date(nowMs);
  const mk = (y) => {
    const iso = `${y}-${dt.mm}-${dt.dd}T${dt.hh || '00'}:${dt.mi || '00'}:00`;
    return Date.parse(iso);
  };
  let t = mk(cur.getFullYear());
  if (Number.isFinite(t) && t - nowMs > 24 * 3600 * 1000) t = mk(cur.getFullYear() - 1);
  return Number.isFinite(t) ? t : NaN;
}

function parseRows(html, nowMs) {
  const rows = [];
  const trs = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  let skippedNoName = 0, skippedNoScore = 0, skippedStatus = 0, skippedDate = 0;

  for (const tr of trs) {
    /* 只要带 id="a<纯数字>" 的比分行（登录框那种 tr 没有 id） */
    const idm = /<tr\b[^>]*\bid="a(\d+)"/i.exec(tr);
    if (!idm) continue;
    const fid = idm[1];

    /* 状态：这一行必须是真的「完场」（完 / 完场）；腰斩、延期、取消、未开赛都不要 */
    const statusText = txt((/class="(?:red|blue|gray)"[^>]*>\s*([^<]{0,8}?)\s*</i.exec(tr) || [])[1] || '');
    if (!/^完/.test(statusText)) { skippedStatus++; continue; }

    const gy = (/<tr\b[^>]*\bgy="([^"]*)"/i.exec(tr) || [])[1] || '';
    const gyParts = gy.split(',').map((s) => s.trim());

    const home = txt((/<span class="mainName">([\s\S]*?)<\/span>/i.exec(tr) || [])[1] || '')
      || (gyParts[1] || '');
    const away = txt((/<span class="clientName">([\s\S]*?)<\/span>/i.exec(tr) || [])[1] || '')
      || (gyParts[2] || '');
    if (!home || !away) { skippedNoName++; continue; }

    /* 联赛：gy 的第 1 段（比 <a> 里的文字干净，没有「第N轮」混进来） */
    const league = gyParts[0] || txt((/class="ssbox_01"[^>]*>([\s\S]*?)<\/td>/i.exec(tr) || [])[1] || '');

    /* 终场比分：.pk 里的 clt1 / clt3（这是【全场】，别拿后面的半场当成全场） */
    const pk = (/<div class="pk">([\s\S]*?)<\/div>/i.exec(tr) || [])[1] || '';
    const h1 = (/class="clt1"[^>]*>\s*(\d{1,2})\s*</i.exec(pk) || [])[1];
    const h3 = (/class="clt3"[^>]*>\s*(\d{1,2})\s*</i.exec(pk) || [])[1];
    if (h1 == null || h3 == null) { skippedNoScore++; continue; }

    /* 半场比分：<td class="red">1 - 0</td>（在所有 td 里找带 class="red" 且纯 a - b 的那个） */
    let ht = null;
    for (const m of tr.matchAll(/<td[^>]*class="[^"]*\bred\b[^"]*"[^>]*>([\s\S]*?)<\/td>/gi)) {
      const v = txt(m[1]);
      const hm = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(v);
      if (hm) { ht = { h: +hm[1], a: +hm[2] }; break; }
    }

    /* 开赛时间：第 3 个 td（联赛 / 轮次 / 时间）。直接按 td 顺序取最稳。
       ⚠️ 不能用「全行第一个 MM-DD」—— 有的行联赛名里就带数字。 */
    const tds = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => txt(m[1]));
    let dt = null;
    for (const v of tds) {
      if (/^\d{1,2}-\d{1,2}(\s+\d{1,2}:\d{2})?$/.test(v)) { dt = splitDateTime(v); break; }
    }
    if (!dt) { skippedDate++; continue; }
    const kick = withYear(dt, nowMs);
    if (!Number.isFinite(kick)) { skippedDate++; continue; }

    const iso = new Date(kick);
    const p2 = (x) => String(x).padStart(2, '0');
    rows.push({
      fid,
      date: `${iso.getFullYear()}-${p2(iso.getMonth() + 1)}-${p2(iso.getDate())}`,
      time: `${iso.getFullYear()}-${p2(iso.getMonth() + 1)}-${p2(iso.getDate())} `
        + `${p2(iso.getHours())}:${p2(iso.getMinutes())}`,
      kick,
      league,
      home,
      away,
      ft: { h: +h1, a: +h3 },
      ht
    });
  }

  return { rows, stats: { trs: trs.length, skippedStatus, skippedNoName, skippedNoScore, skippedDate } };
}

/* ============================================================
   4. 回填 / 纠正 jc-history.js
   ------------------------------------------------------------
   两种处理，都只在「队名 + 日期 + 联赛」三样都对上、且候选唯一时才动：
     ① 补空：score 是空字符串 → 写入终场比分 + 结果 + 红黑
     ② 纠正：score 有值但和完场页的终场比分【不一样】→ 改成终场比分
   【为什么必须有 ②】实测 2026-10-18：历史里 54 场已踢完的比赛，
   拿完场页逐场核对，26 场能对上，其中 9 场比分是错的 ——
   而且错得很有规律：4 场刚好等于【半场比分】(罗马 0:0 / 曼城 2:1 / 布伦特 1:0 /
   汉堡 0:0)，另外 5 场是比赛进行到一半时的快照(拜仁 2:0，实际终场 6:1)。
   根因：build-jc.mjs 归档的那一刻，那场球还没踢完，jc-data 里存的是活比分，
   归档时被当成终场比分冻住了，而归档规则是「已有结果绝不被覆盖」→ 永远错下去。
   比分错了，页面的红/黑和推荐串战绩就全错（这正是用户说的「红黑要算对」）。
   ⚠️ 只在开赛超过 2 小时（真踢完了）且三键全中时改；候选不唯一就【不猜】，原样留着。
   ⚠️ 每条改动都打进构建日志，可逐条核对。--no-fix-history 可以只补空不纠错。
   ============================================================ */
function applyToHistory(results, nowMs) {
  if (!fs.existsSync(HIST)) return { ok: false, reason: '还没有 jc-history.js（先跑 build-jc.mjs）' };
  const src = fs.readFileSync(HIST, 'utf8');
  const hist = loadVar('jc-history.js', 'JC_HISTORY');
  const list = (hist && Array.isArray(hist.list)) ? hist.list : [];
  if (!list.length) return { ok: false, reason: 'jc-history.js 是空的' };

  /* 候选索引：按开赛日期分组，避免 N×M 全量比对 */
  const byDay = new Map();
  results.forEach((r) => {
    if (!byDay.has(r.date)) byDay.set(r.date, []);
    byDay.get(r.date).push(r);
  });

  const filled = [], fixed = [], ambiguous = [];
  list.forEach((rec) => {
    if (!rec || !rec.home || !rec.away) return;
    const kick = Date.parse(String(rec.time || '').replace(/-/g, '/'));
    if (!Number.isFinite(kick)) return;
    /* 还没踢完的（开赛不到 2 小时 / 未来场次）→ 不是「已完场」，一律不碰 */
    if (nowMs - kick < MATCH_LEN_HOURS * 3600 * 1000) return;

    /* 主客队 + 开赛日期（±1 天，容忍两边日期口径差一天）+ 联赛 都要对上。
       联赛这一条是【强键】：两边都是同一家数据商的联赛名，实测 26/26 完全一致，
       加上它以后「同一天两支名字相近的球队」几乎不可能误配。 */
    const d0 = dayOf(rec.time);
    const cands = [];
    for (const delta of [0, -1, 1]) {
      const t = Date.parse(d0.replace(/-/g, '/')) + delta * 86400000;
      const key = dayOf(new Date(t).toISOString().slice(0, 10));
      for (const r of (byDay.get(key) || [])) {
        if (!sameTeam(rec.home, r.home) || !sameTeam(rec.away, r.away)) continue;
        if (rec.league && r.league && String(rec.league) !== String(r.league)) continue;
        cands.push(r);
      }
    }
    if (!cands.length) return;
    /* 同一对主客队同一天可能有多场（联赛 + 杯赛）→ 比分不一致就不猜，宁可空着 */
    const uniq = [...new Set(cands.map((c) => c.ft.h + ':' + c.ft.a))];
    const tag = `${rec.time} ${rec.league || ''} ${rec.home} vs ${rec.away}`;
    if (uniq.length > 1) { ambiguous.push(tag); return; }

    const r = cands[0];
    const ft = r.ft.h + ':' + r.ft.a;
    const action = !rec.score ? 'fill' : (String(rec.score) === ft ? '' : 'fix');
    if (!action) return;                       /* 已经有正确的终场比分 → 不动 */
    if (action === 'fix' && !FIX_HISTORY) return;

    const before = rec.score || '(空)';
    rec.score = ft;
    rec.matched = true;
    if (rec.pick) {
      const actual = r.ft.h > r.ft.a ? 'home' : (r.ft.h === r.ft.a ? 'draw' : 'away');
      const side = rec.pick === 'home' ? 'home' : (rec.pick === 'away' ? 'away' : '');
      const hit = (rec.type === 'unbeaten' && side)
        ? (actual === 'draw' || actual === side)
        : rec.pick === actual;
      rec.hit = hit;
      rec.result = hit ? 'win' : 'lose';
    } else {
      rec.result = 'draw';
      rec.hit = false;
    }
    (action === 'fill' ? filled : fixed).push(
      `${tag}  ${before} → ${ft}${action === 'fix' ? '  ← 原来那是比赛进行中的比分' : ''}`);
  });

  if (!filled.length && !fixed.length) {
    return { ok: true, filled: 0, fixed: 0, ambiguous: ambiguous.length, changed: false };
  }

  /* 只在真改了的时候重写，格式必须和 build-jc.mjs 写的一模一样
     （同样的 JSON 缩进 / 文件头 / note），否则下一轮 build-jc.mjs 合并时形状不一致。 */
  const p2 = (x) => String(x).padStart(2, '0');
  const d = new Date(nowMs);
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const body = {
    updated: stamp,
    note: '竞彩已完场累积记录 —— 由 build-jc.mjs 自动维护，勿手改',
    list
  };
  const out = '/* jc-history.js —— 竞彩【已完场】累积记录（程序生成，勿手改）\n'
    + '   为什么需要：体彩「在售」列表只含还能买的比赛，一开完就消失，\n'
    + '   所以必须自己把打完的比赛存下来，已完场才不会永远是 0。 */\n'
    + 'const JC_HISTORY = ' + JSON.stringify(body, null, 1) + ';\n';

  /* 防呆：渲染结果不该比原文小太多（真出问题宁可不动，也不要写坏历史） */
  if (src.length && out.length < src.length * 0.5) {
    return { ok: false, reason: `渲染结果只有原文的 ${Math.round(out.length / src.length * 100)}%，拒绝覆盖` };
  }
  if (!DRY) fs.writeFileSync(HIST, out, 'utf8');
  return {
    ok: true, filled: filled.length, fixed: fixed.length,
    ambiguous: ambiguous.length, changed: true,
    samples: [...fixed, ...filled], bytes: out.length
  };
}

/* ============================================================
   5. 主流程
   ============================================================ */
async function main() {
  const nowMs = Date.now();
  const from = nowMs - HOURS * 3600 * 1000;

  log('══════════════════════════════════════════');
  log('  已完场赛果 · 抓取');
  log('══════════════════════════════════════════');
  log(`  窗口：最近 ${HOURS} 小时（${new Date(from).toLocaleString('zh-CN', { hour12: false })} → 现在）`);

  /* 抓 PAGE_DATES 页：?e=<今天>、?e=<昨天> …（每页覆盖「该日 + 次日」→ 2 页 ≈ 48 小时） */
  const pages = [];
  const dates = new Set(Array.from({length: PAGE_DATES}, (_, i) => bjDay(i)));
  for (const leg of PAIR_LEGS) {
    const kick = Date.parse(String(leg.time).replace(' ', 'T') + '+08:00');
    if (nowMs - kick < MATCH_LEN_HOURS * 3600000) continue;
    dates.add(dayOf(leg.time));
    dates.add(new Date(kick + 8 * 3600000 - 86400000).toISOString().slice(0, 10));
  }
  for (const date of dates) {
    const url = `${RESULTS_URL}?e=${date}`;
    try {
      const p = await fetchPage(url);
      pages.push({ url, ...p });
    } catch (e) {
      log(`  ✗ 抓取失败：${url} → ${(e && (e.cause && e.cause.code || e.message)) || e}`);
    }
  }
  if (!pages.length) return fail();
  let html = '';
  pages.forEach((p) => {
    log(`  完场比分页：HTTP ${p.status} · ${p.kb}KB · e=${p.url.split('e=').pop()}`);
    /* 只要有一页能拿到就继续（另一页失败最多少几场，不至于整个数据文件没更新） */
    if (p.ok && p.text.length > 20000) html += p.text;
  });
  if (html.length < 20000) {
    log('  ✗ 两页都不可用');
    return fail();
  }

  const { rows, stats } = parseRows(html, nowMs);
  log(`  解析：${stats.trs} 个 <tr> → 完场 ${rows.length} 场` +
      `（非完场 ${stats.skippedStatus} · 无队名 ${stats.skippedNoName} · 无比分 ${stats.skippedNoScore} · 无日期 ${stats.skippedDate}）`);

  /* 窗口内 + 已经踢完（开赛 + 2h ≤ 现在）*/
  const inWin = rows.filter((r) => (r.kick >= from || wantedPairResult(r)) && nowMs - r.kick >= MATCH_LEN_HOURS * 3600 * 1000);
  for (const r of OLD_LIST) {
    if (wantedPairResult(r) && !inWin.some(x => x.fid === r.fid)) inWin.push({...r, kick: Date.parse(r.time.replace(' ', 'T') + '+08:00')});
  }
  /* 同一场可能同时出现在列表的多个分区 → 按 fid 去重 */
  const seen = new Set();
  const list = [];
  inWin.forEach((r) => {
    if (seen.has(r.fid)) return;
    seen.add(r.fid);
    list.push(r);
  });
  list.sort((a, b) => b.kick - a.kick);          /* 时间倒序，最近的在最前 */
  log(`  窗口内已完场：${list.length} 场（带半场比分 ${list.filter((r) => r.ht).length} 场）`);

  if (!list.length) {
    /* 窗口内一场都没有 = 不是错误（可能真是空档），但也不能把旧文件写空 */
    log('  ⓘ 窗口内没有已完场 → 保留上一次的 jc-results.js 不动');
    return fail(true);
  }

  /* 样例（构建日志里能直接核对）*/
  list.slice(0, 3).forEach((r) => log(
    `     ${r.time}  ${r.league}  ${r.home} ${r.ft.h}-${r.ft.a} ${r.away}` +
    (r.ht ? `  (半 ${r.ht.h}-${r.ht.a})` : '')));

  /* ---------- 写出 jc-results.js ---------- */
  const payload = {
    updated: (() => {
      const d = new Date(nowMs), p2 = (x) => String(x).padStart(2, '0');
      return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
    })(),
    hours: HOURS,
    count: list.length,
    /* ⚠️ source 只写在文件里给维护者看，【绝不进页面】——
       export-football.mjs 只取 list，不会把来源写进 HTML（source-guard 兜底）。 */
    list: list.map((r) => ({
      date: r.date, time: r.time, league: r.league,
      home: r.home, away: r.away,
      ft: r.ft, ht: r.ht, fid: r.fid
    }))
  };
  const js = '/* jc-results.js —— 已完场赛果（build-football-results.mjs 生成，勿手改）\n'
    + `   窗口 ${HOURS} 小时 · ${list.length} 场 · 时间 ${payload.updated}\n`
    + '   字段：date/time（北京时间开赛）· league · home · away · ft 终场 · ht 半场（可能为 null） */\n'
    + 'const JC_RESULTS = ' + JSON.stringify(payload, null, 1) + ';\n'
    + 'try { if (typeof window !== \'undefined\') window.JC_RESULTS = JC_RESULTS; } catch (e) {}\n';

  if (DRY) {
    log(`  （--dry：不写 jc-results.js，本应 ${(js.length / 1024).toFixed(1)} KB）`);
  } else {
    fs.writeFileSync(OUT, js, 'utf8');
    log(`  ✅ 已写入 jc-results.js（${(js.length / 1024).toFixed(1)} KB · ${list.length} 场）`);
  }

  /* ---------- 回填 / 纠正 jc-history.js ---------- */
  if (!APPLY_HISTORY) {
    log('  ⓘ --no-apply-history：不回填 jc-history.js');
  } else {
    const r = applyToHistory(list, nowMs);
    if (!r.ok) {
      log(`  ⚠️ 历史回填跳过：${r.reason}`);
    } else if (!r.changed) {
      log(`  ✅ 历史回填：没有要改的（比分全对 · 没缺的）` +
          (r.ambiguous ? ` · ${r.ambiguous} 场多个候选未猜` : ''));
    } else {
      log(`  ✅ 历史回填：补上 ${r.filled} 场 / 纠正 ${r.fixed} 场` +
          (r.ambiguous ? ` · ${r.ambiguous} 场多个候选未猜` : ''));
      (r.samples || []).slice(0, 10).forEach((s) => log(`     ${s}`));
    }
  }

  if (!DRY) writeGate({ lastSuccess: Date.now(), count: list.length });
  log('✅ 完成');
}

/** 抓取失败：有旧数据就沿用；没有旧数据时默认【不报错】（exit 0，只告警），
 *  因为这一步是「已完场比分」的补充源 —— 它挂了不该把整条抓取链/云端构建拖垮
 *  （update-football-smart 连续 3 次 softFail 会放弃整轮；cloud-build 有一步 false
 *   就会把整批数据回滚）。需要严格失败（CI / 手工核对）时加 --strict。 */
function fail(soft) {
  if (OLD_LIST.length) {
    log(`  ⓘ 沿用上一次的 jc-results.js（${OLD_LIST.length} 场 · ${(OLD && OLD.updated) || '?'}），本次不改动`);
    return;
  }
  if (soft) return;                       /* 窗口内 0 场 + 没有旧文件：不是错误 */
  if (!STRICT) {
    log('  ⚠️ 这次抓不到，而且没有旧数据可用 → 本次不写 jc-results.js（不影响后面的步骤）');
    return;
  }
  log('  ✗ 抓不到，而且没有旧数据可用（--strict）');
  process.exit(1);
}

main().catch((e) => {
  console.error('❌ 出错了：', e && e.message);
  process.exit(1);
});
