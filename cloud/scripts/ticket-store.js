/* ============================================================
   ticket-store.js —— 推荐数据存储 + 录入表单

   每天的推荐数据按「彩种 + 日期」存一条：
     {
       date: "2026-10-13",
       issue: "2026117",
       images: {
         main:    { 字段key: 值, ... },   // 图一
         raodan:  { 字段key: 值, ... }    // 图二
       }
     }

   字段结构由 templates.js 固定定义，本文件只负责存取和生成表单。
   ============================================================ */

const TICKET_KEY = 'cdd.tickets.v1';
/* 记录 localStorage 里那份号码的写入时间，用来和文件比新 */
const TICKET_TS_KEY = 'cdd.tickets.ts';

/* ---------------- 文件版数据（tickets.js） ----------------
   由本程序导出、写在磁盘上的数据。
   好处：关掉电脑、清浏览器缓存、换电脑都不会丢。
   优先级：本地存储（新） > tickets.js（文件）
   ------------------------------------------------------------ */

function fileTickets() {
  try {
    if (typeof SAVED_TICKETS === 'undefined' || !SAVED_TICKETS) return {};
    return SAVED_TICKETS.tickets || {};
  } catch (e) { return {}; }
}

function fileTicketsTime() {
  try {
    return (typeof SAVED_TICKETS !== 'undefined' && SAVED_TICKETS && SAVED_TICKETS.updated) || null;
  } catch (e) { return null; }
}

/* ---------------- 存取 ---------------- */

function loadTickets() {
  let fromLocal = {};
  let localTime = 0;
  try {
    const raw = localStorage.getItem(TICKET_KEY);
    if (raw) fromLocal = JSON.parse(raw);
    localTime = Number(localStorage.getItem(TICKET_TS_KEY) || 0) || 0;
  } catch (e) { /* 忽略 */ }

  const fromFile = fileTickets();

  /* 【重要】比较文件与本地的时间，新的赢。
     saved-tickets.js 是 Node 脚本（摇号/云端同步）生成的「权威版本」，
     如果它比 localStorage 里的新，就必须以文件为准 ——
     否则浏览器会一直显示旧号码，网页和 App 对不上。 */
  let fileTime = 0;
  try {
    const t = fileTicketsTime();
    if (t) fileTime = new Date(String(t).replace(' ', 'T')).getTime() || 0;
  } catch (e) { /* 忽略 */ }

  if (fileTime && fileTime > localTime) {
    return Object.assign({}, fromFile);
  }

  // 文件里有、本地没有的，用文件的（换电脑/清缓存后能恢复）
  const merged = Object.assign({}, fromFile);
  Object.keys(fromLocal).forEach((gid) => {
    merged[gid] = Object.assign({}, merged[gid] || {}, fromLocal[gid]);
  });
  return merged;
}

/** 写入全部推荐数据（仅本地） */
function saveTickets(all) {
  try {
    localStorage.setItem(TICKET_KEY, JSON.stringify(all));
    localStorage.setItem(TICKET_TS_KEY, String(Date.now()));
    return true;
  } catch (e) {
    console.warn('保存推荐数据失败:', e);
    return false;
  }
}

/** 导出成文件内容（供下载成 tickets.js） */
function ticketsToFileText(all) {
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;

  return `/* ============================================================\n` +
    `   tickets.js —— 推荐数据存档（由程序导出）\n\n` +
    `   放在程序目录下，程序启动时会自动读取。\n` +
    `   这样即使关掉电脑、清空浏览器缓存，推荐内容也不会丢。\n\n` +
    `   导出时间：${stamp}\n` +
    `   ============================================================ */\n\n` +
    `const SAVED_TICKETS = ${JSON.stringify({ updated: stamp, tickets: all }, null, 1)};\n`;
}

/** 取某个彩种某天的数据 */
function getTicket(gameId, date) {
  const all = loadTickets();
  return (all[gameId] && all[gameId][date]) || null;
}

/** 取某个彩种最近一条数据 */
function latestTicket(gameId) {
  const all = loadTickets();
  const byDate = all[gameId];
  if (!byDate) return null;
  const dates = Object.keys(byDate).sort().reverse();
  if (dates.length === 0) return null;
  return { date: dates[0], data: byDate[dates[0]] };
}

/** 保存某个彩种某天的数据 */
function setTicket(gameId, date, data) {
  const all = loadTickets();
  if (!all[gameId]) all[gameId] = {};
  all[gameId][date] = data;
  return saveTickets(all);
}

/** 删除某条 */
function removeTicket(gameId, date) {
  const all = loadTickets();
  if (all[gameId]) {
    delete all[gameId][date];
    return saveTickets(all);
  }
  return false;
}

/* ---------------- 号码解析 ---------------- */

/** 把 "05 06 08" 之类解析成数组 */
function parseTicketNums(str) {
  if (!str) return [];
  return String(str)
    .trim()
    .split(/[\s,，、;；/|+]+/)
    .filter((s) => s !== '')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isInteger(n));
}

/** 把数字补成两位 */
function twoDigit(n) {
  return String(n).padStart(2, '0');
}

/** 随机整数 [a, b] */
function ri(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

/* ============================================================
   随机摇号（每个字段旁边的 🎲 按钮）
   ------------------------------------------------------------
   规则：
     · 号码类字段 → 从该区范围内随机抽 N 个（N = 档位个数）
     · 和值/跨度   → 按该档位个数算理论区间，在区间内随机取一小段
     · 奇偶/大小   → 跟推荐号走，内部保持一致
     · 012路       → 由推荐号逐位推导
     · 其他文字    → 从近 30 期真实值里随机取一条
   ============================================================ */

/** 该彩种各号码区的范围 */
function areaRangeOf(gameId, areaKey) {
  const R = {
    ssq:  { red: [1, 33], blue: [1, 16] },
    dlt:  { front: [1, 35], back: [1, 12] },
    qlc:  { main: [1, 30] },
    kl8:  { main: [1, 80] },
    fc3d: { main: [0, 9] },
    pl3:  { main: [0, 9] },
    pl5:  { main: [0, 9] },
    qxc:  { front: [0, 9], back: [0, 14] }
  };
  return (R[gameId] && R[gameId][areaKey]) || [1, 33];
}

/** 随机抽 n 个不重复号码，升序 */
function rollPicks(gameId, areaKey, n) {
  const [from, to] = areaRangeOf(gameId, areaKey);
  const size = to - from + 1;
  const cnt = Math.min(n, size);

  if (cnt >= size) {
    const all = [];
    for (let i = from; i <= to; i++) all.push(i);
    return all;
  }

  const pool = [];
  for (let i = from; i <= to; i++) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = ri(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, cnt).sort((a, b) => a - b);
}

/**
 * 号码池基底：长度固定为 want 的号码表
 *   · 【资料优先】资料（data-store.js）里写明的具体号码排在最前面，
 *     优先级：资料 > 专家池 > 原算法（用户要求「按我输入的逻辑出号」）；
 *     资料里的「杀号」会从池子里剔除
 *   · 有专家号码池（expert-pool.js）→ 池内号码按共识度排序排在资料号码后面，
 *     不足 want 个时用原来的随机算法补齐（不会报错）
 *   · 没有资料也没有专家池 / 加载失败 → 完全走原来的随机算法
 * @returns {number[]}  长度 = min(want, 该区号码个数)
 */
function poolCandidates(gameId, areaKey, want) {
  const [from, to] = areaRangeOf(gameId, areaKey);
  const size = to - from + 1;
  const n = Math.max(1, Math.min(want, size));

  /* 【三源融合】号池统一走 stats.js 的 poolRankBlend（资料 ∪ 核心算法 20 码 ∪ 专家池 + 频率热度）。
     这样「摇号写卡」（本文件）和「自动补算」（stats.js）两条路出的是同一份号码池，
     不会再出现「20 码来自核心算法、15 码来自专家池」这种两张来源打架的情况。 */
  if (typeof poolRankBlend === 'function') {
    try {
      const r = poolRankBlend(gameId, areaKey, from, to, n);
      if (Array.isArray(r) && r.length) return r;
    } catch (e) { /* 回落老逻辑 */ }
  }

  /* ---- ① 资料优先层（data-store.js 的 materialRulesFor）：解析不出来就静默跳过 ---- */
  let matPick = [];
  let matKillSet = new Set();
  try {
    if (typeof materialRulesFor === 'function') {
      const mr = materialRulesFor(gameId, areaKey) || {};
      matKillSet = new Set((mr.kill || []).filter((x) => x >= from && x <= to));
      matPick = (mr.pick || []).concat(mr.dan || [], mr.tuo || [])
        .filter((x) => Number.isInteger(x) && x >= from && x <= to && !matKillSet.has(x));
    }
  } catch (e) { matPick = []; matKillSet = new Set(); }

  let list = [];
  matPick.forEach((x) => { if (list.length < n && list.indexOf(x) < 0) list.push(x); });
  let acc = list.slice();

  /* ---- ② 专家号码池：按共识度排序排在资料号码后面 ---- */
  try {
    if (typeof expertPoolBase === 'function' && typeof expertsReady === 'function' && expertsReady(gameId)) {
      acc = expertPoolBase(gameId, areaKey, n, from, to, (need) => {
        // 用原来的随机算法补足（排除已在池子里的号、以及资料里的杀号）
        const have = new Set(acc);
        const rest = [];
        for (let i = from; i <= to; i++) if (!have.has(i) && !matKillSet.has(i)) rest.push(i);
        for (let i = rest.length - 1; i > 0; i--) {
          const j = ri(0, i);
          [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        return rest.slice(0, need);
      });
    }
  } catch (e) { acc = null; }

  /* 专家池的号接在资料号码后面（资料 > 专家池） */
  if (Array.isArray(acc)) {
    acc.forEach((x) => {
      if (list.length < n && !matKillSet.has(x) && list.indexOf(x) < 0) list.push(x);
    });
  }

  /* ---- ③ 原算法兜底：还是不够就用原来的随机算法补齐 ---- */
  if (list.length < n) {
    const have = new Set(list);
    const rest = [];
    for (let i = from; i <= to; i++) if (!have.has(i) && !matKillSet.has(i)) rest.push(i);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = ri(0, i);
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    list = list.concat(rest.slice(0, n - list.length));
  }

  return list.slice(0, n);
}

/** 和值理论区间：n 个数时的最小和 ~ 最大和，再收紧到合理宽度 */
function rollSumRange(gameId, areaKey, n) {
  const [from, to] = areaRangeOf(gameId, areaKey);
  const minSum = from * n + (n * (n - 1)) / 2;
  const maxSum = to * n - (n * (n - 1)) / 2;

  // 取中间一段，宽度控制在 25 以内
  const mid = Math.round((minSum + maxSum) / 2);
  let a = mid - ri(0, 8);
  let b = Math.min(a + ri(12, 25), maxSum);
  a = Math.max(a, minSum);
  if (b - a > 25) b = a + 25;
  return `${a}~${b}`;
}

/** 跨度理论区间：宽度控制在 15 以内 */
function rollSpanRange(gameId, areaKey, n) {
  const [from, to] = areaRangeOf(gameId, areaKey);
  const maxSpan = to - from;
  let b = Math.min(maxSpan, ri(Math.max(8, n + 3), maxSpan));
  let a = Math.max(0, b - ri(6, 15));
  if (b - a > 15) a = b - 15;
  return `${a}~${b}`;
}

/** 由号码列表推出奇偶/大小/012路（与 stats.js 的 deriveFromPicks 同规则） */
function deriveFromList(list, from, to) {
  if (!list.length) return { oddEven: '', bigSmall: '', route012: '' };
  const mid = (from + to) / 2;
  const odd = list.filter((n) => n % 2 === 1).length;
  const even = list.length - odd;
  const big = list.filter((n) => n > mid).length;
  const small = list.length - big;

  const oddEven = odd === list.length ? `${list.length}奇`
    : even === list.length ? `${list.length}偶`
    : `${odd}奇${even}偶`;
  const bigSmall = big === list.length ? `${list.length}大`
    : small === list.length ? `${list.length}小`
    : `${big}大${small}小`;
  const route012 = list.map((n) => `${n % 3}路`).join(' ');

  return { oddEven, bigSmall, route012 };
}

/**
 * 一键摇号：给【所有彩种】的【所有模板图】都摇一套数据并保存
 *
 * 存档结构（按期号，保留最近 30 期）：
 *   tickets[gameId] = {
 *     history: [{ issue, date, images:{}, pushedAt }],   // 已归档的历史期
 *     current: { issue, date, images:{} }                 // 当前待开奖的这一期
 *   }
 *
 * 规则：
 *   · 当前期已有数据 → 不重复摇（用 force 可强制）
 *   · 新摇出来的先放进 current
 *   · 历史归档由 archiveFinished() 在开奖后搬运
 */
function rollAllGames(opts) {
  const o = opts || {};
  // 默认就是重摇（点了摇号就是要新号码）
  // 只有明确传 keepExisting:true 时才保留已有号码
  const keepExisting = !!o.keepExisting;
  /* 【只补这几个】opts.only = ['dlt','qlc'] → 只重摇这几个彩种，其余原样不动。
     云端「缺才补」那一班用它：只补本期还没有号码的彩种，
     不会把已经推送出去、本期已经有号码的彩种也一起重摇。 */
  const only = (Array.isArray(o.only) && o.only.length) ? o.only : null;
  const stat = { games: 0, images: 0, fields: 0, skipped: 0, rolled: 0 };

  if (typeof TEMPLATES === 'undefined' || typeof GAMES === 'undefined') return stat;

  Object.keys(TEMPLATES).forEach((gameId) => {
    const tpl = TEMPLATES[gameId];
    if (!tpl) return;
    if (only && only.indexOf(gameId) < 0) return;
    stat.games++;

    // 该彩种这一期的期号与开奖日期
    let issue = '';
    let dateStr = '';
    try {
      if (typeof nextIssueFor === 'function') issue = nextIssueFor(gameId);
      if (typeof nextDrawDate === 'function') dateStr = nextDrawDate(gameId);
    } catch (e) { /* 忽略 */ }

    if (!dateStr) {
      const now = new Date();
      const p = (n) => String(n).padStart(2, '0');
      dateStr = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
    }

    const rec = getTicket(gameId, dateStr) || { date: dateStr, issue: '', images: {} };
    if (!rec.images) rec.images = {};

    const hasData = Object.keys(rec.images).length > 0;
    if (hasData && keepExisting) {
      // 保留已有：统计里仍然算上，方便界面显示
      stat.skipped++;
      stat.images += tpl.images.length;
      tpl.images.forEach((img) => {
        const v = rec.images[img.key];
        if (v) stat.fields += Object.keys(v).length;
      });
      return;
    }

    /* ---- 生成这一期的号码 ---- */
    tpl.images.forEach((img) => {
      /* 【实票统计热力图】这张图没有可摇的字段：数据来自
         heatmap-data.js（一起彩晒票 / 近 30 期开奖频率）。
         给它摇一套空值只会让「本期还缺号码」的判断永远为真，
         所以直接跳过，不写进 rec.images。 */
      if (img.key === 'heatmap') return;
      stat.images++;
      const spec = [];
      const collect = (sec, areaKeyHint) => {
        if (!sec || typeof sec !== 'object') return;

        const texts = [sec.title || ''];
        if (Array.isArray(sec.fields)) sec.fields.forEach((f) => texts.push(f.label));
        if (Array.isArray(sec.items)) sec.items.forEach((i) => texts.push(i.label));
        const joined = texts.join(' ');
        let areaKey = areaKeyHint || 'main';
        if (gameId === 'ssq') areaKey = /蓝球/.test(joined) ? 'blue' : 'red';
        else if (gameId === 'dlt') areaKey = /后区/.test(joined) ? 'back' : 'front';
        else if (gameId === 'qxc') areaKey = /后区/.test(joined) ? 'back' : 'front';

        const cnt = { ssq: areaKey === 'blue' ? 1 : 6, dlt: areaKey === 'back' ? 2 : 5 }[gameId]
          || { qlc: 7, kl8: 20, fc3d: 3, pl3: 3, pl5: 5 }[gameId] || 6;

        if (Array.isArray(sec.fields)) {
          sec.fields.forEach((f) => spec.push({
            key: f.key, label: f.label,
            /* 【个数优先级】模板里显式写了 count 就用它，没写才回落到默认值 cnt。
               以前这里无脑用 cnt（硬编码：ssq 蓝球 1 个、dlt 后区 2 个…），
               所以模板里写 count: 6 完全不生效 ——
               用户要求「蓝球推荐要 6 个码」，改了模板却还是 1 个就是因为这里。
               杀号类没写 count 时仍然默认 3 个（和走势页口径一致）。 */
            count: (typeof f.count === 'number' && f.count > 0)
              ? f.count
              : (/杀/.test(f.label || '') ? 3 : cnt),
            areaKey
          }));
        }
        if (Array.isArray(sec.rows)) {
          const isKill = /杀号/.test(joined);
          const counts = sec.rows.map((r) => r.count);
          const isPool = counts.length >= 3 && !isKill;
          if (isPool) {
            /* 【号码池优先】整块号码池共用一份基底（大档包含小档）：
               · 有专家池 → 池内号码按共识度排序取，不够最大档时用原算法补
               · 没有专家池 → poolCandidates 内部退回原来的随机算法
               同一块里如果某行写的是「后区 / 蓝球」，就换成那个区的池子。 */
            const groups = new Map();
            sec.rows.forEach((r) => {
              const rk = /后区|蓝球/.test(r.label || '')
                ? (gameId === 'ssq' ? 'blue' : 'back')
                : areaKey;
              if (!groups.has(rk)) groups.set(rk, []);
              groups.get(rk).push(r);
            });
            groups.forEach((rows, rk) => {
              const [lo, hi] = areaRangeOf(gameId, rk);
              const size = hi - lo + 1;
              const wantMax = rows.reduce((a, r) => Math.max(a, Math.min(r.count || 1, size)), 1);
              const base = poolCandidates(gameId, rk, wantMax);
              rows.forEach((r) => {
                const c = Math.max(1, Math.min(r.count || 1, base.length));
                spec.push({
                  key: r.key,
                  fixedValue: base.slice(0, c).sort((a, b) => a - b).map(pad2).join(' ')
                });
              });
            });
          } else {
            sec.rows.forEach((r, idx) => spec.push({
              key: r.key, label: r.label,
              count: /杀/.test(r.label || '') ? Math.min(r.count || 3, 3) : r.count,
              areaKey, posIdx: idx
            }));
          }
        }
        if (Array.isArray(sec.positions)) {
          if (sec.groupRow) spec.push({ key: sec.groupRow.key, label: sec.groupLabel || '组选', count: sec.groupRow.count, areaKey });
          sec.positions.forEach((p, idx) => spec.push({ key: p.key, label: p.label, count: p.count, areaKey, posIdx: idx }));
        }
        if (Array.isArray(sec.items)) {
          sec.items.forEach((it) => spec.push({ key: it.key, label: it.label, count: 6, areaKey }));
        }
        if (sec.bigBall) spec.push({ key: sec.bigBall.key, label: sec.bigBall.label || '主推', count: 1, areaKey });
        if (sec.bigBalls) spec.push({ key: sec.bigBalls.key, label: '主推', count: sec.bigBalls.count || 2, areaKey });
        if (Array.isArray(sec.groups)) {
          /* 【修正】热号排行要【按分组标签】选号码区。
             原来整段都用 areaKey，导致「蓝球热号排行」拿红球的号
             （会出现 24 这种根本不是蓝球的号）、「后区热号排行」拿前区的号。
             这里和 stats.js 的同类逻辑（sec.type==='rank' && sec.groups）保持一致。 */
          const areaForRankGroup = (lb) => {
            const s = String(lb || '');
            if (gameId === 'ssq') return /蓝球/.test(s) ? 'blue' : 'red';
            if (gameId === 'dlt') return /后区/.test(s) ? 'back' : 'front';
            if (gameId === 'qxc' || gameId === 'xqxc') return /后区/.test(s) ? 'back' : 'front';
            if (/后区|蓝球/.test(s)) return 'back';
            return areaKey;
          };
          sec.groups.forEach((g) => {
            const gArea = areaForRankGroup(g.label);
            const ranks = (typeof hotRankStrings === 'function') ? hotRankStrings(gameId, gArea, g.count || 6, 30) : [];
            ranks.forEach((v, i) => spec.push({ key: `${g.label}_${i}`, fixedValue: v }));
          });
        }
        if (Array.isArray(sec.elements)) {
          sec.elements.forEach((e) => spec.push({ key: e.key, label: e.name, count: 6, areaKey }));
        }
        if (sec.centerKey) spec.push({ key: sec.centerKey, label: '中心数', count: 1, areaKey });
        if (Array.isArray(sec.footer)) {
          sec.footer.forEach((f) => spec.push({
            key: f.key, label: f.label,
            // 页脚大多是文字字段（和尾/防组三），杀号只要 3 个号
            count: /杀/.test(f.label || '') ? 3 : 6,
            areaKey
          }));
        }
        if (Array.isArray(sec.badges)) {
          sec.badges.forEach((b) => spec.push({ key: b.key, label: b.label, count: 1, areaKey }));
        }
        if (Number.isInteger(sec.rows) && sec.cols) {
          // 绕胆图 / 色块网格：号码同样从号码池里取
          const total = sec.cols * sec.rows;
          const picks = poolCandidates(gameId, areaKey, total).sort((a, b) => a - b);
          for (let i = 0; i < total; i++) spec.push({ key: 'grid_' + i, fixedValue: pad2(picks[i]) });
        }
        if (sec.left) collect(sec.left, areaKey);
        if (sec.right) collect(sec.right, areaKey);
      };

      img.sections.forEach((sec) => collect(sec, null));

      const outVals = {};
      spec.forEach((s) => {
        if (s.fixedValue !== undefined) { outVals[s.key] = s.fixedValue; stat.fields++; return; }
        outVals[s.key] = rollValueFor(gameId, {
          key: s.key, label: s.label, count: s.count, areaKey: s.areaKey, posIdx: s.posIdx
        });
        stat.fields++;
      });

      /* 五行 / 绕胆 / 九转连环 / 九宫 这张图：
         阴阳历、神煞、五行号码、绕胆图都走 stats.js 的专用填充
         （它同样已经按专家号码池来算），保证和分享页完全一致 */
      if (img.key === 'wuxing' && typeof autoFillForTemplate === 'function') {
        try {
          const wx = autoFillForTemplate(gameId, 'wuxing');
          if (wx && Object.keys(wx).length >= 20) Object.assign(outVals, wx);
        } catch (e) { /* 失败就保留上面摇好的值 */ }
      }

      /* 【一致性收尾】摇完就地把自相矛盾的字段修掉（池子优先）。
         这一层写进 saved-tickets.js，页面/分享页显示的就是它，
         所以在存档之前必须过一遍 —— 唯一实现在 stats.js。 */
      if (typeof enforceConsistencyImage === 'function') {
        try { enforceConsistencyImage(gameId, img.key, outVals); } catch (e) { /* 失败不影响出号 */ }
      }

      rec.images[img.key] = outVals;
    });

    rec.issue = issue || rec.issue || '';
    rec.date = dateStr;
    rec.pushedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
    setTicket(gameId, dateStr, rec);
    stat.rolled++;
  });

  return stat;
}

/**
 * 归档整理：把已开奖的期次搬进 history，未开奖的留在 current，只保留最近 30 期
 *
 * 兼容两种存储形态：
 *   旧： tickets[gameId] = { "2026-10-14": {issue, images}, ... }
 *   新： tickets[gameId] = { history: [...], current: {...} }
 *
 * @returns {{archived:number, trimmed:number, kept:number}}
 */
function archiveFinished() {
  const out = { archived: 0, trimmed: 0, kept: 0 };
  if (typeof TEMPLATES === 'undefined') return out;

  const all = loadTickets();
  const next = {};

  Object.keys(all).forEach((gameId) => {
    const raw = all[gameId];
    if (!raw || typeof raw !== 'object') return;

    /* ---- 1. 先把所有期次收集成一个数组（兼容新旧两种结构）---- */
    const entries = [];

    if (Array.isArray(raw.history) || raw.current) {
      // 新结构
      if (Array.isArray(raw.history)) raw.history.forEach((h) => entries.push(h));
      if (raw.current) entries.push(raw.current);
    } else {
      // 旧结构：日期 → 记录
      Object.keys(raw).forEach((date) => {
        const rec = raw[date];
        if (rec && typeof rec === 'object' && rec.images) {
          entries.push(Object.assign({ date }, rec));
        }
      });
    }

    /* ---- 2. 按期号去重，只留有内容的 ---- */
    const seen = new Set();
    const clean = [];
    entries.forEach((e) => {
      if (!e || !e.images || !Object.keys(e.images).length) return;
      const key = String(e.issue || e.date || '');
      if (!key || seen.has(key)) return;
      seen.add(key);
      clean.push(e);
    });

    /* ---- 3. 判断每期是否已开奖 ---- */
    const history = [];
    let current = null;

    clean.forEach((e) => {
      const draw = (typeof hcFindDraw === 'function') ? hcFindDraw(gameId, e.date, e.issue) : null;
      if (draw) {
        history.push({
          issue: e.issue || '',
          date: e.date || '',
          pushedAt: e.pushedAt || '',
          images: e.images,
          draw: { issue: draw.issue, date: draw.date, red: draw.red, blue: draw.blue, special: draw.special }
        });
        out.archived++;
      } else {
        // 未开奖：保留最新的一期作为当前期
        if (!current || String(e.issue || '') >= String(current.issue || '')) {
          current = { issue: e.issue || '', date: e.date || '', pushedAt: e.pushedAt || '', images: e.images };
        }
      }
    });

    /* ---- 4. 历史按日期倒序，只留 30 期 ---- */
    history.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (history.length > 30) {
      out.trimmed += history.length - 30;
      history.length = 30;
    }

    if (history.length || current) {
      next[gameId] = { history, current };
      out.kept++;
    }
  });

  saveTickets(next);
  return out;
}

/**
 * 兼容读取：把某彩种的所有期次（历史 + 当前）拉成一个数组
 * @returns {Array<{issue,date,images,pushedAt,draw}>}
 */
function allPeriodsOf(gameId) {
  const all = loadTickets();
  const raw = all[gameId];
  if (!raw || typeof raw !== 'object') return [];

  const list = [];
  if (Array.isArray(raw.history)) list.push(...raw.history);
  if (raw.current) list.push(raw.current);

  // 旧结构兜底
  if (!list.length) {
    Object.keys(raw).forEach((date) => {
      const rec = raw[date];
      if (rec && rec.images) list.push(Object.assign({ date }, rec));
    });
  }

  // 附上开奖结果
  return list.map((e) => Object.assign({}, e, {
    draw: e.draw || ((typeof hcFindDraw === 'function') ? hcFindDraw(gameId, e.date, e.issue) : null)
  }));
}
/**
 * 算一个字段的值（确定性算法）
 *   【号码池优先】有专家号码池时，号码一律从池子里取、走势一律围绕池子算；
 *   没有专家池（或 expert-pool.js 没加载）时，完全按原来的算法走。
 *
 * ⚠️ 这是「出号」用的那一套：同样的数据 → 同样的结果。
 *    一键摇号 rollAllGames() / 存档 saved-tickets.js / 分享页 / 一致性收尾
 *    全都依赖它保持不变（改一个字都会让已上线的号码和页面/存档对不上）。
 *    需要随机的是骰子 🎲 —— 走下面的 rollValueFor(..., { random: true })。
 */
function rollValueDeterministic(gameId, spec) {
  const label = spec.label || '';
  let areaKey = spec.areaKey || 'main';
  // 字段自己写了「后区 / 蓝球」就按那个区取（例如七星彩的「后区」行）
  if (/后区|蓝球/.test(label)) areaKey = (gameId === 'ssq') ? 'blue' : 'back';
  const rng = areaRangeOf(gameId, areaKey);
  const from = rng[0];
  const to = rng[1];
  const count = spec.count || 1;
  const posIdx = Number.isInteger(spec.posIdx) ? spec.posIdx : -1;

  // 号码池相关的走势值（没有池子返回 null）
  const poolTrend = () => {
    if (typeof poolTrendFields !== 'function') return null;
    try { return poolTrendFields(gameId, areaKey, from, to, count); } catch (e) { return null; }
  };

  /* 该玩法该区的「真实球数」：
     双色球红球 6 · 大乐透前区 5 · 七乐彩 7 · 快乐8 10 · 蓝球 1 · 后区 2 …
     ⚠️ 奇偶比 / 大小比 / 012路比 必须按这个球数写，
        不能按「号码池 20 个号的构成」写（会写出「8奇12偶」）。 */
  const ballCount = (fallback) => {
    if (typeof areaPickCount === 'function') {
      try { return areaPickCount(gameId, areaKey, fallback); } catch (e) { /* 回退 */ }
    }
    return fallback;
  };

  // 号码池优先（recommendNumbers 已按池子取），但个数 = 真实球数
  const derivedReal = () => {
    const n = Math.max(1, ballCount(count));
    const picks = (typeof recommendNumbers === 'function')
      ? recommendNumbers(gameId, areaKey, n, from, to)
      : rollPicks(gameId, areaKey, n);
    return deriveFromList(picks, from, to);
  };

  // 1) 和值 / 合值：用「最近 30 期真实开奖」的和值区间
  //    （必须覆盖最近开奖，不能给一段随机的理论区间）
  if (label.includes('和值') || label.includes('合值')) {
    /* 【数字彩：和值只给 3 个数】用户的模板硬性条件 ——
       原来返回「6~24」这种区间，用户要求给 3 个具体号码。 */
    /* 【只对数字彩】排列3/福彩3D/排列5 —— 用户明确要求这三个彩种给 3 个数。
       双色球/大乐透/七乐彩/快乐8 的和值仍然保持【区间】。 */
    const DIGIT_GAMES = ['fc3d', 'pl3', 'pl5'];
    if (DIGIT_GAMES.indexOf(gameId) >= 0
        && typeof digitFooterTop === 'function' && typeof historyAreas === 'function') {
      try {
        const s3 = digitFooterTop(historyAreas(gameId, areaKey, 30), 'sum', 3);
        if (s3 && s3.length === 3) return s3.join(' ');
      } catch (e) { /* 回退到区间 */ }
    }
    if (typeof calcTrendFields === 'function') {
      try {
        const hz = calcTrendFields(gameId, areaKey, from, to, count).hz;
        if (hz) return hz;
      } catch (e) { /* 回退 */ }
    }
    const t = poolTrend();
    if (t && t.hz) return t.hz;
    if (label.includes('合值') && typeof poolNumberStats === 'function') {
      const s = (() => { try { return poolNumberStats(gameId, areaKey, from, to); } catch (e) { return null; } })();
      if (s && s.sumRange) return s.sumRange;
    }
    return rollSumRange(gameId, areaKey, count);
  }

  // 2) 跨度：同上
  if (label.includes('跨度')) {
    if (typeof calcTrendFields === 'function') {
      try {
        const kd = calcTrendFields(gameId, areaKey, from, to, count).kd;
        if (kd) return kd;
      } catch (e) { /* 回退 */ }
    }
    const t = poolTrend();
    if (t && t.kd) return t.kd;
    return rollSpanRange(gameId, areaKey, count);
  }

  /* 【单球格式】用户原话：
       「双色球硬模板蓝球要么就是大要么就是小不要加个 1」
     所以只选 1 个球的区域（双色球蓝球 / 大乐透后区只有一个位时）
     只写「奇」/「偶」、「大」/「小」，不写「1奇」「1小」。
     号码池里多个球的区域保持「2奇4偶」「3大2小”写法。 */
  const singleBallFormat = (txt, kind) => {
    if (count !== 1) return txt;
    const s = String(txt || '');
    if (kind === 'jq') {
      if (/^1奇$/.test(s) || /^1奇0偶$/.test(s)) return '奇';
      if (/^1偶$/.test(s) || /^0奇1偶$/.test(s)) return '偶';
      if (/奇/.test(s) && !/偶/.test(s)) return '奇';
      if (/偶/.test(s) && !/奇/.test(s)) return '偶';
    } else {
      if (/^1大$/.test(s) || /^1大0小$/.test(s)) return '大';
      if (/^1小$/.test(s) || /^0大1小$/.test(s)) return '小';
      if (/大/.test(s) && !/小/.test(s)) return '大';
      if (/小/.test(s) && !/大/.test(s)) return '小';
    }
    return txt;
  };

  // 3) 奇偶：按「真实球数」取一批推荐号再推导（双色球红球 6、大乐透前区 5）
  //    不能写号码池自身的构成 —— 池子有 20 个号，会写出「8奇12偶」
  if (label.includes('奇偶')) {
    const d = derivedReal();
    if (d.oddEven) return singleBallFormat(d.oddEven, 'jq');
    return singleBallFormat(deriveFromList(rollPicks(gameId, areaKey, count), from, to).oddEven, 'jq');
  }

  // 4) 大小：同上
  if (label.includes('大小')) {
    const d = derivedReal();
    if (d.bigSmall) return singleBallFormat(d.bigSmall, 'dx');
    return singleBallFormat(deriveFromList(rollPicks(gameId, areaKey, count), from, to).bigSmall, 'dx');
  }

  // 5) 012 路：同上
  if (label.includes('012')) {
    const d = derivedReal();
    if (d.route012) return d.route012;
    return deriveFromList(rollPicks(gameId, areaKey, count), from, to).route012;
  }

  // 6) 杀号（含 蓝球杀号 / 后区杀 / 前1杀）：池内共识度最低的先杀
  if (/杀/.test(label)) {
    /* 【资料优先】资料里写了杀号 → 直接用资料里的（资料 > 专家池 > 原算法） */
    try {
      if (typeof materialRulesFor === 'function') {
        const mr = materialRulesFor(gameId, areaKey);
        if (mr && mr.kill && mr.kill.length) {
          return mr.kill.slice(0, count).map(pad2).join(' ');
        }
      }
    } catch (e) { /* 解析不出来就走原来的算法 */ }
    // 按位杀（七星彩 前N杀 / 后区杀）：每个位置用位置统计，号码池按位置错开
    if (posIdx >= 0 && (/^前\d+杀$/.test(label) || /^后区杀$/.test(label)) && typeof positionKill === 'function') {
      const killed = positionKill(gameId, posIdx, count, from, to, 30);
      if (killed && killed.length) return killed.map(pad2).join(' ');
    }
    if (typeof autoKillNumbers === 'function') {
      const killed = autoKillNumbers(gameId, areaKey, count, from, to, 30);
      if (killed && killed.length) return killed.map(pad2).join(' ');
    }
    return rollPicks(gameId, areaKey, count).map(pad2).join(' ');
  }

  // 7) 胆码 / 拖码：池内分档（胆=共识最高，拖=次之）
  if (label.includes('胆码') || label.includes('拖码')) {
    /* 【资料优先】资料里写了胆码 / 拖码 → 直接用资料里的 */
    try {
      if (typeof materialRulesFor === 'function') {
        const mr = materialRulesFor(gameId, areaKey);
        if (mr) {
          const mv = label.includes('胆码')
            ? (mr.dan || []).concat(mr.pick || [])
            : (mr.tuo || []).concat(mr.pick || []);
          if (mv.length) return mv.slice(0, count).map(pad2).join(' ');
        }
      }
    } catch (e) { /* 解析不出来就走原来的算法 */ }
    const t = poolTrend();
    const v = t ? (label.includes('胆码') ? t.dm : t.tm) : '';
    if (v) return v;
  }

  // 8) 推荐 / 主推 / 组选：号码池优先（recommendNumbers 已按池子取）
  if (label.includes('推荐') || label.includes('主推') || label.includes('组选')) {
    return recommendLine(gameId, areaKey, count, from, to);
  }

  // 9) 定位行（百位 / 十位 / 个位 / 万位 / 千位）：按位置从号码池里取
  if (posIdx >= 0 && /位/.test(label)) {
    const picked = (typeof positionRecommend === 'function')
      ? positionRecommend(gameId, posIdx, count, from, to, 30)
      : rollPicks(gameId, areaKey, count);
    return picked.map(pad2).join(' ');
  }

  /* 10) 【数字彩页脚三项】用户的模板硬性条件：
       和值 → 3 个数 · 和尾 → 3 个数 · 对子号 → 2 个数
     （原来是「0~9」「对子号」这种固定文字/区间，用户要求给具体号码）
     数据来自近 30 期真实开奖统计（digitFooterTop 定义在 stats.js）。 */
  const DIGIT_FOOTER_GAMES = ['fc3d', 'pl3', 'pl5'];
  if (DIGIT_FOOTER_GAMES.indexOf(gameId) >= 0
      && typeof digitFooterTop === 'function' && typeof historyAreas === 'function') {
    const areas30 = historyAreas(gameId, areaKey, 30);
    if (label.includes('和尾')) {
      const t = digitFooterTop(areas30, 'tail', 3);
      if (t.length) return t.join(' ');
    }
    if (label.includes('防组三') || label.includes('对子')) {
      const p = digitFooterTop(areas30, 'pair', 2);
      if (p.length) return p.join(' ');
    }
    if (label.includes('合值') || label.includes('和值')) {
      const s = digitFooterTop(areas30, 'sum', 3);
      if (s.length) return s.join(' ');
    }
  }
  /* 兜底（digitFooterTop 不可用时） */
  if (label.includes('和尾')) return '0 1 2';
  if (label.includes('防组三')) return '11 22';

  // 11) 热号/冷号/邻号等走势：围绕号码池算
  const TREND_KEY = {
    '热号': 're', '冷号': 'leng', '邻号': 'lin', '同尾号': 'wh',
    '连号': 'lh', '跳连号': 'tjlh', '重复号': 'cf', '同区号': 'tqh',
    '尾数冷热': 'wsl', '最大遗漏': 'maxomit', '遗漏回补': 'ylhb',
    '质数/合数': 'zhs', '区间比': 'qjb'
  };
  /* 关键词按长度从长到短匹配：「跳连号」不能被「连号」抢先匹配到，
     否则连号/跳连号两个字段会是同一串号（字段自相矛盾）。
     算不出来就返回空 —— 交给 stats.js 的一致性收尾按号码池补，
     绝不能再掉到下面「随机抽号」那一档。 */
  const trendKw = Object.keys(TREND_KEY).sort((a, b) => b.length - a.length)
    .find((k) => label.includes(k));
  if (trendKw) {
    const trendKey = TREND_KEY[trendKw];
    const hist = (typeof getHistory === 'function') ? getHistory(gameId) : [];
    if (hist.length) {
      const t = poolTrend();
      if (t && t[trendKey]) return t[trendKey];
      if (typeof calcTrendFields === 'function') {
        try {
          const v = calcTrendFields(gameId, areaKey, from, to, count)[trendKey];
          if (v) return v;
        } catch (e) { /* 交给一致性收尾补 */ }
      }
    }
    return '';
  }

  // 12) 五行号码（金木水火土）：按尾数从号码池里挑
  if (/^[金木水火土]$/.test(label)) {
    const TAILS = { 金: [4, 9], 木: [3, 8], 水: [1, 6], 火: [2, 7], 土: [5, 0] }[label];
    const pool = (typeof expertPoolOf === 'function') ? expertPoolOf(gameId, areaKey) : [];
    const picked = pool.filter((n) => TAILS.includes(n % 10));
    if (picked.length) return picked.sort((a, b) => a - b).map(pad2).join(' ');
  }

  // 12.5) 旺尾 / 弱尾：号码池里尾数的冷热
  if (label.includes('旺尾') || label.includes('弱尾')) {
    const pool = (typeof expertPoolOf === 'function') ? expertPoolOf(gameId, areaKey) : [];
    if (pool.length) {
      const tail = new Array(10).fill(0);
      pool.forEach((n) => { tail[n % 10]++; });
      const ranked = tail.map((c, i) => ({ tail: i, c })).sort((a, b) => (b.c - a.c) || (a.tail - b.tail));
      const picked = label.includes('旺尾')
        ? ranked.slice(0, 4).map((x) => x.tail)
        : ranked.slice(-2).map((x) => x.tail);
      return picked.join('、');
    }
  }

  // 13) 中心数：取号码池中间那个
  if (label.includes('中心数')) {
    const pool = (typeof expertPoolOf === 'function') ? expertPoolOf(gameId, areaKey) : [];
    if (pool.length) {
      const sorted = pool.slice().sort((a, b) => a - b);
      return pad2(sorted[Math.floor(sorted.length / 2)]);
    }
  }

  // 14) 号码类：号码池优先，否则随机抽 count 个
  if (typeof expertPoolUsable === 'function') {
    try {
      if (expertPoolUsable(gameId, areaKey)) {
        return poolCandidates(gameId, areaKey, count).sort((a, b) => a - b).map(pad2).join(' ');
      }
    } catch (e) { /* 回退 */ }
  }
  return rollPicks(gameId, areaKey, count).map(pad2).join(' ');
}

/* ============================================================
   摇一个字段的值（对外入口）
   ------------------------------------------------------------
   第三参数 opts：
     · 不传 / opts.random !== true
         → 完全走 rollValueDeterministic()：同样的数据 → 同样的结果。
           一键摇号 rollAllGames() 走的就是这条，行为一个字都没动。
     · opts.random === true
         → 骰子 🎲 / 「全部随机」走这条：从「合法候选」里随机挑一个。
           用户点一次应该得到一个「合法的、但不一样」的值。
           必须满足 stats.js 的一致性不变量（①~⑫）：
             ①热∩冷=∅ ②杀∩池=∅ ③杀∩胆拖=∅ ④胆拖⊆池 ⑤胆∩拖=∅
             ⑥档位递减 ⑦推荐∩杀号=∅ ⑧热⊆池 ⑨尾数冷热 ⑩⑪⊆池
     opts.ctx       当前表单里其它字段的值（可选）：知道「池子 / 杀号 / 胆拖 /
                   推荐 / 热冷号」现在是什么，随机出来的值才不会和它们打架
     opts.imageKey  这张图的 key（可选）：用来查 stats.js 的字段语义表 fieldRolesOf()

   拿不准 / 候选不够时返回确定性算法的值（绝不出错）。
   ============================================================ */
function rollValueFor(gameId, spec, opts) {
  if (!opts || opts.random !== true) return rollValueDeterministic(gameId, spec);
  try {
    const v = rollValueRandom(gameId, spec, opts);
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  } catch (e) { /* 随机分支出问题 → 确定性算法兜底 */ }
  return rollValueDeterministic(gameId, spec);
}

/* ============================================================
   随机分支（骰子 🎲 / 全部随机 专用）
   ------------------------------------------------------------
   铁律：每个字段先算出「合法候选域」，再从域里随机挑 ——
     · 杀号     = 池外（并避开 推荐 / 定位推荐 / 胆拖）→ ②③⑦ 成立
     · 热号     = 池内（并避开当前冷号）               → ⑧① 成立
     · 冷号     = 池外（池子铺满全区时退回全区 + 避开热号）→ ① 成立
     · 胆码/拖码 = 池内、互不重复、避开杀号            → ③④⑤ 成立
     · 号码池档位 = 保留比它小的档位，其余从上一层随机补 → ⑥ 成立（小档 ⊆ 大档）
     · 走势号   = 池内、按真实格式重排（连号 / 同尾 / 邻号 / 跳连 / 同区 / 重复 / 尾数冷热）
     · 奇偶/大小/012路 = 从该区「真实开过的期次」里随机挑一期推导（球数天然正确）
     · 和值/跨度 = 理论区间内随机放宽，且一定覆盖近 30 期实际范围
     · 热号排行（NN出现M次）= 从真实排行里随机挑一条（骰子原本的语义）
   ============================================================ */

/** 随机取 n 个（不重复、升序） */
function rrTake(arr, n) {
  const src = (arr || []).slice();
  const cnt = Math.max(0, Math.min(Math.floor(n) || 0, src.length));
  for (let i = src.length - 1; i > 0; i--) {
    const j = ri(0, i);
    const t = src[i]; src[i] = src[j]; src[j] = t;
  }
  return src.slice(0, cnt).sort((a, b) => a - b);
}

/** 随机取 n 个（不重复、不打乱成升序 —— 给「连号 01-02 / 03-04」这类字符串用） */
function rrSome(arr, n) {
  const src = (arr || []).slice();
  const cnt = Math.max(0, Math.min(Math.floor(n) || 0, src.length));
  for (let i = src.length - 1; i > 0; i--) {
    const j = ri(0, i);
    const t = src[i]; src[i] = src[j]; src[j] = t;
  }
  return src.slice(0, cnt);
}

/** 随机取 1 个（空数组返回 undefined） */
function rrOne(arr) {
  const a = arr || [];
  return a.length ? a[ri(0, a.length - 1)] : undefined;
}

/** 号码串 / 号码数组 → 去重号码数组 */
function rrNums(v) {
  const out = [];
  const push = (x) => { if (Number.isInteger(x) && out.indexOf(x) < 0) out.push(x); };
  if (Array.isArray(v)) v.forEach(push);
  else (String(v == null ? '' : v).match(/\d+/g) || []).forEach((s) => push(parseInt(s, 10)));
  return out;
}

/** 区间内全部号码 */
function rrAllNums(from, to) {
  const a = [];
  for (let i = from; i <= to; i++) a.push(i);
  return a;
}

/** 升序去重 */
function rrSorted(arr) {
  const out = [];
  (arr || []).forEach((n) => { if (Number.isInteger(n) && out.indexOf(n) < 0) out.push(n); });
  return out.sort((a, b) => a - b);
}

/** 该区最近 N 期的真实开奖号（最新在前） */
function rrActualAreas(gameId, areaKey, periods) {
  try {
    if (typeof historyAreas === 'function') return historyAreas(gameId, areaKey, periods || HIST_PERIODS) || [];
  } catch (e) { /* 忽略 */ }
  return [];
}

/** 位置下标：spec 没给就用标签猜（万位=0 … 个位=4；前N位 / 后区=6） */
function rrPosIdxOf(label) {
  const L = String(label || '').trim();
  const WORDS = ['万位', '千位', '百位', '十位', '个位'];
  const wi = WORDS.indexOf(L);
  if (wi >= 0) return wi;
  let m = L.match(/^前(\d+)(位|杀)$/);
  if (m) return Number(m[1]) - 1;
  if (/^后区/.test(L)) return 6;
  return -1;
}

/** 该图的字段语义表（key → {role,count,area,posIdx}），stats.js 的唯一实现 */
function rrRolesOf(gameId, imageKey) {
  try {
    if (typeof fieldRolesOf === 'function') return fieldRolesOf(gameId, imageKey || null) || {};
  } catch (e) { /* 忽略 */ }
  return {};
}

/**
 * 骰子的「当前局面」
 * @returns {{gameId,areaKey,from,to,all,pool,roles,cur,inArea,curOfRole,curOfPos}}
 */
function rrSituation(gameId, areaKey, opts) {
  const [from, to] = areaRangeOf(gameId, areaKey);
  const all = rrAllNums(from, to);
  const roles = rrRolesOf(gameId, opts && opts.imageKey);
  const rawCtx = (opts && opts.ctx) || {};
  const cur = {};
  Object.keys(rawCtx).forEach((k) => { cur[k] = rrNums(rawCtx[k]); });

  const inArea = (k) => !!(roles[k] && roles[k].area === areaKey);

  /* 号码池 = 本图「最大档位」的当前值（和 stats.js enforceConsistency 的定池口径一致），
     没有档位就用专家号码池，再没有就用 poolCandidates（含资料优先 + 随机补齐） */
  let pool = [];
  const tierKeys = Object.keys(roles)
    .filter((k) => inArea(k) && roles[k].role === 'tier' && cur[k] && cur[k].length)
    .sort((a, b) => roles[a].count - roles[b].count);
  if (tierKeys.length) pool = cur[tierKeys[tierKeys.length - 1]].slice();
  if (!pool.length) {
    try { pool = expertPoolOf(gameId, areaKey) || []; } catch (e) { pool = []; }
  }
  pool = pool.filter((n) => n >= from && n <= to);
  if (!pool.length && typeof poolCandidates === 'function') {
    try { pool = poolCandidates(gameId, areaKey, all.length) || []; } catch (e) { pool = []; }
    pool = pool.filter((n) => n >= from && n <= to);
  }
  if (!pool.length) pool = all.slice();

  const curOfRole = (role) => {
    const out = [];
    Object.keys(roles).forEach((k) => {
      if (!inArea(k) || roles[k].role !== role) return;
      (cur[k] || []).forEach((n) => { if (out.indexOf(n) < 0) out.push(n); });
    });
    return out;
  };
  const curOfPos = (role, posIdx) => {
    const out = [];
    Object.keys(roles).forEach((k) => {
      if (!inArea(k) || roles[k].role !== role || roles[k].posIdx !== posIdx) return;
      (cur[k] || []).forEach((n) => { if (out.indexOf(n) < 0) out.push(n); });
    });
    return out;
  };

  return {
    gameId, areaKey, from, to, all,
    pool: rrSorted(pool),
    roles, cur, inArea, curOfRole, curOfPos
  };
}

/**
 * 和值 / 跨度：在理论区间内随机放宽，但必须覆盖近 30 期真实取值范围
 * （和 stats.js compactRange 的「必须覆盖」规则一致 —— 区间漏掉最近开奖就是错的）
 */
function rrRangeText(values, from, to, balls, kind) {
  const arr = (values || []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!arr.length) return undefined;
  const min = arr[0];
  const max = arr[arr.length - 1];
  const n = Math.max(1, balls);
  const loB = (kind === 'sum') ? from * n + (n * (n - 1)) / 2 : 0;
  const hiB = (kind === 'sum') ? to * n - (n * (n - 1)) / 2 : (to - from);
  const pad = (kind === 'sum') ? 6 : 3;
  let a = Math.max(loB, min - ri(0, pad));
  let b = Math.min(hiB, max + ri(0, pad));
  if (a > min) a = min;
  if (b < max) b = max;
  if (b < a) { a = min; b = max; }
  return `${a}~${b}`;
}

/**
 * 杀号：从「池外」随机挑
 *   · 普通杀号：避开 号码池 + 推荐 + 定位推荐 + 胆拖（②③⑦ 的硬要求）
 *   · 每位杀号：这一位必须避开「同一位的定位推荐」，候选不够时逐级放宽
 *   候选实在不够 → 返回 undefined，交给确定性算法 + 一致性收尾（绝不出矛盾）
 */
function rrKillText(S, want, posIdx) {
  const mate = (posIdx >= 0) ? S.curOfPos('posrec', posIdx) : [];
  const strict = [].concat(S.pool, S.curOfRole('rec'), S.curOfRole('posrec'),
    S.curOfRole('dan'), S.curOfRole('tuo'), mate);
  const hard = (posIdx >= 0)
    ? mate
    : [].concat(S.pool, S.curOfRole('rec'), S.curOfRole('posrec'));
  const uniqStrict = [...new Set(strict)];
  const uniqHard = [...new Set(hard)];
  /* 先按最严的来；太严就没得挑（摇 5 次都一样），这时退到「硬要求」那一档 */
  const enough = Math.min(S.all.length, want + 3);
  let dom = S.all.filter((n) => uniqStrict.indexOf(n) < 0);
  if (dom.length < enough) {
    const relaxed = S.all.filter((n) => uniqHard.indexOf(n) < 0);
    if (relaxed.length > dom.length) dom = relaxed;
  }
  if (dom.length < want) return undefined;
  return rrTake(dom, want).map(pad2).join(' ');
}

/**
 * 号码池档位（20码 / 15码 / 10码 / 3码 / 1码 …）
 *   保留「比它小的档位」的当前值（小档 ⊆ 大档 永远成立），
 *   其余从「上一层档位（没有就用号码池）」里随机补足。
 */
function rrTierText(S, want) {
  const roles = S.roles;
  const tiers = Object.keys(roles)
    .filter((k) => S.inArea(k) && roles[k].role === 'tier')
    .map((k) => ({ k, count: roles[k].count || 1 }))
    .sort((a, b) => a.count - b.count);
  const smaller = tiers.filter((t) => t.count < want).reverse();
  const larger = tiers.filter((t) => t.count > want);

  let keep = [];
  for (let i = 0; i < smaller.length; i++) {
    const v = S.cur[smaller[i].k];
    if (v && v.length) { keep = v.slice(); break; }
  }
  let dom = [];
  for (let i = 0; i < larger.length; i++) {
    const v = S.cur[larger[i].k];
    if (v && v.length) { dom = v.slice(); break; }
  }
  /* 表单里还没有这些档位的值时（比如空白表单），用「出号算法」的对应档位当骨架：
     poolCandidates 对小档返回的是大档的前缀 —— 小档 ⊆ 大档 照样成立（⑥） */
  if (!keep.length && smaller.length && typeof poolCandidates === 'function') {
    try { keep = poolCandidates(S.gameId, S.areaKey, Math.min(smaller[0].count, S.all.length)) || []; } catch (e) { keep = []; }
  }
  if (dom.length < want && larger.length && typeof poolCandidates === 'function') {
    try { dom = poolCandidates(S.gameId, S.areaKey, Math.min(larger[0].count, S.all.length)) || []; } catch (e) { dom = []; }
  }
  if (dom.length < want) dom = S.pool.slice();
  if (dom.length < want) dom = S.all.slice();

  const kept = keep.filter((n) => dom.indexOf(n) >= 0);
  const rest = dom.filter((n) => kept.indexOf(n) < 0);
  const picked = kept.concat(rrTake(rest, Math.max(0, want - kept.length)));
  if (picked.length < Math.min(want, dom.length)) return undefined;
  return rrSorted(picked).map(pad2).join(' ');
}

/**
 * 走势号（连号 / 跳连号 / 同尾号 / 邻号 / 重复号 / 同区号 / 尾数冷热）
 *   全部只从号码池里取（⑩ 硬要求），格式和 stats.js 的对应函数保持一致；
 *   池里凑不出这种东西时退回 stats.js 的池内兜底 consPropFallback()。
 */
function rrPropText(role, S) {
  const pool = S.pool;
  if (!pool.length) return '';
  const sorted = rrSorted(pool);
  const set = new Set(sorted);
  const fallback = () => {
    try {
      if (typeof consPropFallback === 'function') {
        return consPropFallback(role, sorted, S.from, S.to, S.gameId, S.areaKey) || '';
      }
    } catch (e) { /* 忽略 */ }
    return '';
  };

  if (role === 'lh') {
    const pairs = [];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] === 1) pairs.push(`${pad2(sorted[i - 1])}-${pad2(sorted[i])}`);
    }
    const picked = rrSome(pairs, 3);
    return picked.length ? picked.join(' / ') : fallback();
  }
  if (role === 'tjlh') {
    const found = [];
    sorted.forEach((n) => {
      if (set.has(n + 2) && set.has(n + 4)) found.push(`${pad2(n)}-${pad2(n + 2)}-${pad2(n + 4)}`);
    });
    const picked = rrSome(found, 2);
    return picked.length ? picked.join(' / ') : fallback();
  }
  if (role === 'wh') {
    const byTail = new Map();
    sorted.forEach((n) => {
      const t = n % 10;
      if (!byTail.has(t)) byTail.set(t, []);
      byTail.get(t).push(n);
    });
    const groups = [...byTail.values()].filter((g) => g.length >= 2)
      .map((g) => g.map(pad2).join('-'));
    const picked = rrSome(groups, 2);
    return picked.length ? picked.join(' / ') : fallback();
  }
  if (role === 'lin') {
    const near = [];
    sorted.forEach((n) => {
      if (set.has(n + 1)) near.push(n + 1);
      if (set.has(n - 1)) near.push(n - 1);
    });
    const picked = rrTake([...new Set(near)], 6);
    return picked.length ? picked.map(pad2).join(' ') : fallback();
  }
  if (role === 'cf') {
    const picked = rrTake(sorted, Math.min(sorted.length, ri(1, 3)));
    return picked.length ? picked.map(pad2).join(',') + `防${picked.length}枚` : fallback();
  }
  if (role === 'tqh') {
    const size = Math.ceil((S.to - S.from + 1) / 3);
    const zones = [0, 1, 2].map((i) => {
      const lo = S.from + i * size;
      const hi = Math.min(S.to, lo + size - 1);
      return { i, nums: sorted.filter((n) => n >= lo && n <= hi) };
    }).filter((z) => z.nums.length);
    const z = rrOne(zones);
    if (!z) return fallback();
    return `${['一区', '二区', '三区'][z.i]}${rrTake(z.nums, 6).map(pad2).join(',')}`;
  }
  if (role === 'wsl') {
    /* 尾数冷热：池内尾数按出现次数排，热尾随机 2 个、冷尾随机 1 个。
       冷尾尽量避开 1码/3码 档位里已有的号；避不开也没关系，
       一致性收尾会把小档里的冷尾号换掉（⑨）。 */
    const tail = new Array(10).fill(0);
    sorted.forEach((n) => { tail[n % 10]++; });
    const idx = tail.map((c, i) => ({ tail: i, c })).sort((a, b) => (b.c - a.c) || (a.tail - b.tail));
    const smallNums = Object.keys(S.roles)
      .filter((k) => S.inArea(k) && S.roles[k].role === 'tier' && (S.roles[k].count || 0) <= 3)
      .reduce((acc, k) => acc.concat(S.cur[k] || []), []);
    const smallTails = new Set(smallNums.map((n) => n % 10));
    const hotList = idx.slice(0, Math.min(5, idx.length)).filter((x) => x.c > 0).map((x) => `${x.tail}尾热`);
    const coldIdx = idx.slice(-3).filter((x) => !smallTails.has(x.tail));
    const coldList = (coldIdx.length ? coldIdx : idx.slice(-1)).map((x) => `${x.tail}尾冷`);
    const v = rrSome(hotList, 2).concat(rrSome(coldList, 1)).join(' ');
    return String(v).trim() ? v : fallback();
  }
  return '';
}

/** 该字段的随机值；返回 undefined → 交给确定性算法 */
function rollValueRandom(gameId, spec, opts) {
  const label = String(spec.label || '');
  let areaKey = spec.areaKey || 'main';
  if (/后区|蓝球/.test(label)) areaKey = (gameId === 'ssq') ? 'blue' : 'back';

  const S = rrSituation(gameId, areaKey, opts);
  const roleInfo = S.roles[spec.key] || {};
  const role = roleInfo.role || '';
  const posIdx = Number.isInteger(spec.posIdx) ? spec.posIdx
    : (Number.isInteger(roleInfo.posIdx) ? roleInfo.posIdx : rrPosIdxOf(label));
  const count = Math.max(1, Number(spec.count) || 1);
  const { from, to, all, pool } = S;
  const joinNums = (arr) => arr.map(pad2).join(' ');

  /* ---- 热号排行（NN出现M次）：从真实排行里随机挑一条 ---- */
  if (label.includes('排行')) {
    if (typeof hotRankStrings === 'function') {
      const ranks = hotRankStrings(gameId, areaKey, count, HIST_PERIODS) || [];
      const v = rrOne(ranks);
      if (v) return v;
    }
    return undefined;
  }

  /* ---- 和值 / 合值 ---- */
  if (label.includes('和值') || label.includes('合值')) {
    const sums = rrActualAreas(gameId, areaKey, HIST_PERIODS)
      .map((a) => a.reduce((x, y) => x + y, 0));
    const v = rrRangeText(sums, from, to, count, 'sum');
    if (v) return v;
    /* 没有历史数据 → 用真实球数随机组一批号凑一个和值 */
    const n = Math.max(1, (typeof areaPickCount === 'function') ? areaPickCount(gameId, areaKey, count) : count);
    const picks = rrTake(pool.length ? pool : all, n);
    return picks.length ? `${picks.reduce((x, y) => x + y, 0)}~${picks.reduce((x, y) => x + y, 0)}` : undefined;
  }

  /* ---- 跨度 ---- */
  if (label.includes('跨度')) {
    const spans = rrActualAreas(gameId, areaKey, HIST_PERIODS)
      .filter((a) => a.length)
      .map((a) => Math.max(...a) - Math.min(...a));
    const v = rrRangeText(spans, from, to, count, 'span');
    if (v) return v;
    return undefined;
  }

  /* ---- 奇偶 / 大小 / 012路：随机挑一期真实开奖来推导（球数天然 = 真实球数，⑫成立） ---- */
  if (label.includes('奇偶') || label.includes('大小') || label.includes('012')) {
    const areas = rrActualAreas(gameId, areaKey, HIST_PERIODS).filter((a) => a.length);
    let src = rrOne(areas);
    if (!src || !src.length) {
      const n = Math.max(1, (typeof areaPickCount === 'function') ? areaPickCount(gameId, areaKey, count) : count);
      src = rrTake(pool.length ? pool : all, n);
    }
    if (!src.length) return undefined;
    const d = deriveFromList(src, from, to);
    if (label.includes('奇偶')) return d.oddEven || undefined;
    if (label.includes('大小')) return d.bigSmall || undefined;
    return d.route012 || undefined;
  }

  /* ---- 区间比 / 质数合数：随机挑一期真实开奖的构成 ---- */
  if (label.includes('区间比') || label.includes('质数')) {
    const src = rrOne(rrActualAreas(gameId, areaKey, HIST_PERIODS).filter((a) => a.length));
    if (!src) return undefined;
    if (label.includes('区间比')) {
      const size = Math.ceil((to - from + 1) / 3);
      const z = [0, 0, 0];
      src.forEach((x) => { z[Math.min(2, Math.floor((x - from) / size))]++; });
      return z.join(':');
    }
    const p = src.filter((x) => (typeof isPrime === 'function') ? isPrime(x) : false).length;
    return `${p}:${src.length - p}`;
  }

  /* ---- 杀号（含 蓝球杀号 / 后区杀 / 每位杀）---- */
  if (role === 'kill' || role === 'poskill' || /杀/.test(label)) {
    const want = Math.max(1, roleInfo.count || (role === 'poskill' ? count : Math.min(count, 3)));
    const v = rrKillText(S, want, (role === 'poskill' || posIdx >= 0) ? posIdx : -1);
    if (v) return v;
    return undefined;
  }

  /* ---- 胆码 / 拖码：池内、互不重复、避开杀号 ---- */
  if (role === 'dan' || role === 'tuo' || label.includes('胆码') || label.includes('拖码')) {
    const isDan = (role === 'dan') || (!role && label.includes('胆码'));
    const want = Math.max(1, roleInfo.count || count);
    const kills = [].concat(S.curOfRole('kill'), S.curOfRole('poskill'));
    const other = isDan ? S.curOfRole('tuo') : S.curOfRole('dan');
    const dom = pool.filter((n) => kills.indexOf(n) < 0 && other.indexOf(n) < 0);
    const out = rrTake(dom, want);
    if (out.length >= want) return joinNums(out);
    return undefined;
  }

  /* ---- 热号 / 冷号（①⑧ 的硬要求）---- */
  if (role === 'hot' || role === 'cold' || label.includes('热号') || label.includes('冷号')) {
    const isHot = (role === 'hot') || (!role && label.includes('热号'));
    if (isHot) {
      const want = Math.min(6, pool.length);
      const coldCur = S.curOfRole('cold');
      let dom = pool.filter((n) => coldCur.indexOf(n) < 0);
      if (dom.length < want) dom = pool.slice();
      const out = rrTake(dom, want);
      return out.length >= want ? joinNums(out) : undefined;
    }
    const poolSet = new Set(pool);
    const outside = all.filter((n) => !poolSet.has(n));
    const base = (outside.length && outside.length < all.length) ? outside : all.slice();
    const hotCur = S.curOfRole('hot');
    const want = Math.min(6, base.length);
    let dom = base.filter((n) => hotCur.indexOf(n) < 0);
    if (dom.length < want) dom = base.slice();
    const out = rrTake(dom, want);
    return out.length >= want ? joinNums(out) : undefined;
  }

  /* ---- 最大遗漏 / 遗漏回补：池内随机挑 ---- */
  if (role === 'maxomit' || label.includes('最大遗漏')) {
    const n = rrOne(pool);
    return (n === undefined) ? undefined : `${pad2(n)}号`;
  }
  if (role === 'ylhb' || label.includes('遗漏回补')) {
    const out = rrTake(pool, Math.min(3, pool.length));
    return out.length ? joinNums(out) : undefined;
  }

  /* ---- 走势号 ---- */
  const PROP = { lh: 1, tjlh: 1, wh: 1, lin: 1, cf: 1, tqh: 1, wsl: 1 };
  const propRole = PROP[role] ? role
    : (label.includes('跳连号') ? 'tjlh'
      : label.includes('连号') ? 'lh'
        : label.includes('重复号') ? 'cf'
          : label.includes('同尾号') ? 'wh'
            : label.includes('邻号') ? 'lin'
              : label.includes('同区号') ? 'tqh'
                : label.includes('尾数冷热') ? 'wsl' : '');
  if (propRole) {
    const v = rrPropText(propRole, S);
    if (v) return v;
    return undefined;
  }

  /* ---- 号码池档位（20码 / 15码 / 3码 …）---- */
  if (role === 'tier') {
    const v = rrTierText(S, roleInfo.count || count);
    if (v) return v;
    return undefined;
  }

  /* ---- 文字型固定值（和尾 = 0~9；防组三 = 对子号）：本来就只有一个合法值 ---- */
  if (label.includes('和尾') || label.includes('防组三')) return undefined;

  /* ---- 文字 / 配置字段（公历 / 农历 / 干支 / 日五行 / 金银胆 / 中宫 …）----
     这些根本不是号码：摇成号码会把「公历」「财神」写成 04 这种，
     用 stats.js 的 autoFillForTemplate() 给的真实值（一键摇号给这张图填的就是它），
     拿不到就交给确定性算法 —— 绝不给文字字段写号码。 */
  if (/^(c_|badge|e_|wx_|jg_|grid_)/.test(String(spec.key || ''))
    || /公历|农历|干支|五行|财神|喜神|福神|贵神|冲煞|旺尾|弱尾|吉利|中宫|关注/.test(label)) {
    const v = rrAutoFill(gameId, opts, spec.key);
    if (v !== undefined) return v;
    return undefined;
  }

  /* ---- 组选池 / 推荐 / 主推 / 定位推荐 / 号码类：合法域里随机挑一组 ---- */
  const wantN = Math.max(1, Math.min(count, all.length));
  const bans = [].concat(S.curOfRole('kill'), S.curOfRole('poskill'));
  const domOf = (src, ban) => (ban.length ? src.filter((n) => ban.indexOf(n) < 0) : src.slice());
  let dom = domOf(pool, bans);
  if (dom.length < wantN) dom = domOf(all, bans);
  if (dom.length < wantN) {
    /* ⑦ 对「定位推荐」是逐位比的：最后至少避开同一位的杀号 */
    const mate = (role === 'posrec' && posIdx >= 0) ? S.curOfPos('poskill', posIdx) : [];
    dom = mate.length ? domOf(all, mate) : all.slice();
  }
  const out = rrTake(dom, wantN);
  if (out.length) return joinNums(out);
  return undefined;
}

/** 文字 / 配置字段的真实值（stats.js 的 autoFillForTemplate，和一键摇号同一套） */
function rrAutoFill(gameId, opts, key) {
  if (!key || typeof autoFillForTemplate !== 'function') return undefined;
  try {
    const map = autoFillForTemplate(gameId, (opts && opts.imageKey) || 'wuxing');
    if (map && map[key] !== undefined && map[key] !== null && String(map[key]).trim() !== '') {
      return String(map[key]);
    }
  } catch (e) { /* 忽略 */ }
  return undefined;
}

/* ============================================================
   摇号面板（资料页用）
   ============================================================ */

function renderRollPanel(container, onChanged) {
  const box = document.createElement('div');
  box.className = 'panel';

  const h3 = document.createElement('h3');
  h3.innerHTML = '一键摇号 <span class="hint">给所有彩种重新生成推荐号码</span>';
  box.appendChild(h3);

  const note = document.createElement('div');
  note.className = 'tk-note';
  note.style.marginBottom = '14px';
  note.innerHTML =
    '点一下会给 8 个彩种、10 张图全部重摇一套号码，并保存下来。<br>' +
    '当前期已有号码时不会重复摇（避免推送出去的号变了）。';
  box.appendChild(note);

  const acts = document.createElement('div');
  acts.className = 'actions';

  const msg = document.createElement('span');
  msg.style.cssText = 'font-size:12px;margin-left:10px;';

  const rollBtn = document.createElement('button');
  rollBtn.className = 'btn';
  rollBtn.style.cssText = 'background:linear-gradient(180deg,#f0b429,#d99a12);color:#3a2c00;';
  rollBtn.textContent = '🎲 一键摇号（所有彩种）';
  rollBtn.addEventListener('click', () => {
    if (typeof rollAllGames !== 'function') { msg.textContent = '模块未加载'; return; }
    const stat = rollAllGames();
    msg.style.color = '#7ee787';
    if (stat.skipped && !stat.rolled) {
      msg.textContent = `${stat.skipped} 个彩种本期已有号码，未改动`;
    } else {
      msg.textContent = `已摇 ${stat.rolled || stat.games} 个彩种 / ${stat.images} 张图 / ${stat.fields} 个字段`;
    }
    if (onChanged) onChanged();
  });

  /* 强制重摇（用于换期或想换一套号） */
  const forceBtn = document.createElement('button');
  forceBtn.className = 'btn ghost';
  forceBtn.textContent = '强制重摇本期';
  forceBtn.title = '不管本期有没有号码，都重新摇一套';
  forceBtn.addEventListener('click', () => {
    if (!confirm('会覆盖本期的号码，之前推送出去的旧号就对不上了。\n\n确定继续吗？')) return;
    if (typeof rollAllGames !== 'function') { msg.textContent = '模块未加载'; return; }
    const stat = rollAllGames({ force: true });
    msg.style.color = '#f0b429';
    msg.textContent = `已强制重摇 ${stat.rolled || stat.games} 个彩种 / ${stat.fields} 个字段`;
    if (onChanged) onChanged();
  });

  acts.appendChild(rollBtn);
  acts.appendChild(forceBtn);
  acts.appendChild(msg);
  box.appendChild(acts);

  container.appendChild(box);
}

/* ============================================================
   存档面板：一键摇号 / 导出 / 清空
   ============================================================ */

function renderArchivePanel(container, onChanged) {
  const box = document.createElement('div');
  box.className = 'panel';

  const h3 = document.createElement('h3');
  h3.innerHTML = '数据存档 <span class="hint">导出成文件，关机、清缓存、换电脑都不会丢</span>';
  box.appendChild(h3);

  const fileTime = (typeof fileTicketsTime === 'function') ? fileTicketsTime() : null;
  const info = document.createElement('div');
  info.className = 'tk-note';
  info.style.marginBottom = '14px';
  info.innerHTML = fileTime
    ? `当前存档文件时间：<b style="color:#7ee787">${fileTime}</b>`
    : '存档文件还是空的 —— 点下面的「导出存档文件」，或让自动更新脚本写入。';
  box.appendChild(info);

  const acts = document.createElement('div');
  acts.className = 'actions';

  const msg = document.createElement('span');
  msg.style.cssText = 'font-size:12px;margin-left:10px;';

  /* ---- 一键摇号（所有彩种）---- */
  const rollBtn = document.createElement('button');
  rollBtn.className = 'btn';
  rollBtn.style.cssText = 'background:linear-gradient(180deg,#f0b429,#d99a12);color:#3a2c00;';
  rollBtn.textContent = '🎲 一键摇号（所有彩种）';
  rollBtn.addEventListener('click', () => {
    if (typeof rollAllGames !== 'function') { msg.textContent = '功能未加载'; return; }
    const stat = rollAllGames();
    msg.style.color = '#7ee787';
    msg.textContent = `已摇 ${stat.games} 个彩种 / ${stat.images} 张图 / ${stat.fields} 个字段`;
    if (onChanged) onChanged();
  });

  /* ---- 导出存档 ---- */
  const expBtn = document.createElement('button');
  expBtn.className = 'btn';
  expBtn.textContent = '导出存档文件';
  expBtn.title = '下载 saved-tickets.js，放到程序目录即可永久保存';
  expBtn.addEventListener('click', () => {
    try {
      const all = loadTickets();
      const text = ticketsToFileText(all);
      const blob = new Blob([text], { type: 'text/javascript;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'saved-tickets.js';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      msg.style.color = '#7ee787';
      msg.textContent = '已下载，放到 D:\\春风\\ 目录（覆盖原文件）';
    } catch (e) {
      msg.style.color = '#f0575c';
      msg.textContent = '导出失败：' + e.message;
    }
  });

  /* ---- 清空本地 ---- */
  const clrBtn = document.createElement('button');
  clrBtn.className = 'btn ghost';
  clrBtn.textContent = '清空本地数据';
  clrBtn.addEventListener('click', () => {
    if (!confirm('确定清空浏览器里的推荐数据吗？\n（saved-tickets.js 文件不受影响）')) return;
    try { localStorage.removeItem(TICKET_KEY); } catch (e) {}
    msg.style.color = '#f0b429';
    msg.textContent = '已清空，重新打开会从文件读取';
    if (onChanged) onChanged();
  });

  acts.appendChild(rollBtn);
  acts.appendChild(expBtn);
  acts.appendChild(clrBtn);
  acts.appendChild(msg);
  box.appendChild(acts);

  const help = document.createElement('div');
  help.className = 'tk-note';
  help.style.marginTop = '14px';
  help.innerHTML =
    '怎么用：<br>' +
    '1. 点「导出存档文件」→ 下载 <b>saved-tickets.js</b><br>' +
    '2. 把它放到 <b>D:\\春风\\</b> 目录（覆盖原来的）<br>' +
    '3. 以后每次打开程序，都会自动读取这个文件里的推荐内容';
  box.appendChild(help);

  container.appendChild(box);
}

/**
 * 为某个彩种的一张图生成录入表单
 * @param {string} gameId
 * @param {string} imageKey
 * @param {string} date
 * @param {HTMLElement} container
 * @param {function} onSaved
 */
function renderTicketForm(gameId, imageKey, date, container, onSaved) {
  const tpl = TEMPLATES[gameId];
  if (!tpl) return;
  const img = tpl.images.find((i) => i.key === imageKey) || tpl.images[0];

  const existing = getTicket(gameId, date) || {};
  const vals = (existing.images && existing.images[imageKey]) || {};

  const box = document.createElement('div');
  box.className = 'panel';

  const h3 = document.createElement('h3');
  h3.innerHTML = `${img.title} <span class="hint">${date}</span>`;
  box.appendChild(h3);

  const inputs = {};   // 收集所有输入控件
  const inputMeta = {}; // 每个字段的元信息，供「全部随机」使用
  const fixedKeys = new Set();  // 这些字段不参与全部随机（保持真实统计值）

  /** 收集当前表单里「已经有值」的字段（骰子随机时要知道现在是什么局面） */
  const formValues = () => {
    const out = {};
    Object.keys(inputs).forEach((k) => {
      const v = String(inputs[k].value == null ? '' : inputs[k].value).trim();
      if (v) out[k] = v;
    });
    return out;
  };

  /**
   * 整图一致性收尾（和 rollAllGames 存档前调用的是同一个 enforceConsistencyImage）
   *   随机摇出来的单个字段可能和图上别的字段打架（比如摇出来的热号不在
   *   20码池里、杀号摇进了池子），所以摇完立刻过一遍。
   *   只回写「本来就有值」的字段 —— 点一个骰子不该把空字段填满。
   * @returns {number} 顺手修掉的字段数
   */
  const settleConsistency = () => {
    if (typeof enforceConsistencyImage !== 'function') return 0;
    const before = formValues();
    const work = Object.assign({}, before);
    try { enforceConsistencyImage(gameId, imageKey, work); } catch (e) { return 0; }
    let n = 0;
    Object.keys(work).forEach((k) => {
      if (!inputs[k] || !(k in before)) return;
      const v = String(work[k] == null ? '' : work[k]);
      if (v !== String(inputs[k].value == null ? '' : inputs[k].value)) { inputs[k].value = v; n++; }
    });
    return n;
  };

  /** 判断某个区块属于哪个号码区（和 stats.js 同逻辑） */
  const areaKeyOf = (sec, itemLabel) => {
    const texts = [sec.title || '', itemLabel || ''];
    if (Array.isArray(sec.fields)) sec.fields.forEach((f) => texts.push(f.label));
    if (Array.isArray(sec.items)) sec.items.forEach((i) => texts.push(i.label));
    const joined = texts.join(' ');
    if (gameId === 'ssq') return /蓝球/.test(joined) ? 'blue' : 'red';
    if (gameId === 'dlt') return /后区/.test(joined) ? 'back' : 'front';
    if (gameId === 'qxc') return /后区/.test(joined) ? 'back' : 'front';
    return 'main';
  };

  /**
   * 创建一个「输入框 + 🎲 按钮」的组合
   * @param {object} spec { key, label, count }
   * @param {string} areaKey
   * @param {string} placeholder
   */
  const diceField = (spec, areaKey, placeholder) => {
    const wrap = document.createElement('div');
    wrap.className = 'tk-with-dice';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'tk-input';
    inp.dataset.key = spec.key;
    inp.placeholder = placeholder || '';
    inp.value = vals[spec.key] || '';
    inputs[spec.key] = inp;

    // 记下元信息，供「全部随机」按钮使用
    inputMeta[spec.key] = { label: spec.label, count: spec.count, areaKey };

    wrap.appendChild(inp);

    const dice = document.createElement('button');
    dice.className = 'tk-dice';
    dice.type = 'button';
    dice.title = '随机摇一个（合法的候选里随机挑，每次都不一样）';
    dice.textContent = '🎲';
    dice.addEventListener('click', () => {
      /* 【骰子 = 随机】必须传 random:true —— 不传就是「出号」用的确定性算法，
         同样的数据每次算出来都一样，点骰子当然摇不出变化。 */
      inp.value = rollValueFor(gameId, {
        key: spec.key,
        label: spec.label,
        count: spec.count,
        areaKey
      }, { random: true, ctx: formValues(), imageKey });
      settleConsistency();
      dice.classList.add('rolled');
      setTimeout(() => dice.classList.remove('rolled'), 400);
    });
    wrap.appendChild(dice);

    return wrap;
  };

  /* ---------- 按 section 逐个生成 ---------- */
  const buildSection = (sec, parent, depth) => {
    if (!sec || typeof sec !== 'object') return;

    // 两栏布局
    if (sec.type === 'twocol') {
      const wrap = document.createElement('div');
      wrap.className = 'tk-twocol';
      const L = document.createElement('div');
      const R = document.createElement('div');
      wrap.appendChild(L);
      wrap.appendChild(R);
      buildSection(sec.left, L, depth);
      buildSection(sec.right, R, depth);
      parent.appendChild(wrap);
      return;
    }

    const block = document.createElement('div');
    block.className = 'tk-block';

    if (sec.title) {
      const t = document.createElement('div');
      t.className = 'tk-title';
      t.textContent = sec.title;
      block.appendChild(t);
    }

    /* ---- 文本字段（每个带骰子） ---- */
    if (sec.fields) {
      const ak = areaKeyOf(sec);
      const grid = document.createElement('div');
      grid.className = 'tk-fields';
      grid.style.gridTemplateColumns = `repeat(${sec.columns || 3}, minmax(0, 1fr))`;
      sec.fields.forEach((f) => {
        const item = document.createElement('div');
        item.className = 'tk-field';
        const lab = document.createElement('label');
        lab.className = 'tk-label';
        lab.textContent = f.label;
        item.appendChild(lab);
        // 这里的 count 用该区常规选号个数，供和值/跨度/奇偶推导
        const cnt = { ssq: ak === 'blue' ? 1 : 6, dlt: ak === 'back' ? 2 : 5 }[gameId]
          || { qlc: 7, kl8: 20, fc3d: 3, pl3: 3, pl5: 5 }[gameId] || 6;
        item.appendChild(diceField({ key: f.key, label: f.label, count: cnt }, ak, ''));
        grid.appendChild(item);
      });
      block.appendChild(grid);
    }

    /* ---- 号码行（每个带骰子） ---- */
    if (sec.rows && Array.isArray(sec.rows)) {
      const ak = areaKeyOf(sec);
      sec.rows.forEach((r) => {
        const row = document.createElement('div');
        row.className = 'tk-numrow';
        const lab = document.createElement('span');
        lab.className = 'tk-numlabel';
        lab.textContent = r.label;
        row.appendChild(lab);
        row.appendChild(diceField(
          { key: r.key, label: r.label, count: r.count },
          ak,
          `填 ${r.count} 个号，用空格分隔`
        ));
        block.appendChild(row);
      });
    }

    /* ---- 定位行（带骰子） ---- */
    if (sec.positions) {
      const ak = areaKeyOf(sec);
      if (sec.groupRow) {
        const row = document.createElement('div');
        row.className = 'tk-numrow';
        row.innerHTML = `<span class="tk-numlabel">${sec.groupLabel || '组选'}</span>`;
        row.appendChild(diceField(
          { key: sec.groupRow.key, label: sec.groupLabel || '组选', count: sec.groupRow.count },
          ak, `填 ${sec.groupRow.count} 个号`
        ));
        block.appendChild(row);
      }
      sec.positions.forEach((p) => {
        const row = document.createElement('div');
        row.className = 'tk-numrow';
        const lab = document.createElement('span');
        lab.className = 'tk-numlabel';
        lab.textContent = p.label;
        row.appendChild(lab);
        row.appendChild(diceField(
          { key: p.key, label: p.label, count: p.count },
          ak, `填 ${p.count} 个号`
        ));
        block.appendChild(row);
      });
    }

    /* ---- 键值对（冷热号等）（带骰子） ---- */
    if (sec.items) {
      const ak = areaKeyOf(sec);
      sec.items.forEach((it) => {
        const row = document.createElement('div');
        row.className = 'tk-numrow';
        row.innerHTML = `<span class="tk-numlabel">${it.label}</span>`;
        row.appendChild(diceField(
          { key: it.key, label: it.label, count: 6 },
          ak, '用空格分隔'
        ));
        block.appendChild(row);
      });
    }

    /* ---- 主推球（带骰子） ---- */
    if (sec.bigBall) {
      const ak = areaKeyOf(sec);
      const row = document.createElement('div');
      row.className = 'tk-numrow';
      row.innerHTML = `<span class="tk-numlabel">${sec.bigBall.label || '主推'}</span>`;
      row.appendChild(diceField(
        { key: sec.bigBall.key, label: sec.bigBall.label || '主推', count: 1 },
        ak, '1 个号'
      ));
      block.appendChild(row);
    }
    if (sec.bigBalls) {
      const ak = areaKeyOf(sec);
      const row = document.createElement('div');
      row.className = 'tk-numrow';
      row.innerHTML = `<span class="tk-numlabel">主推</span>`;
      row.appendChild(diceField(
        { key: sec.bigBalls.key, label: '主推', count: sec.bigBalls.count || 2 },
        ak, `填 ${sec.bigBalls.count} 个号`
      ));
      block.appendChild(row);
    }

    /* ---- 热号排行（带骰子：从真实排行里摇） ---- */
    if (sec.groups) {
      /* 【修正】热号排行的号码区要【按分组标签】判断，
         不能整段用一个 areaKey —— 否则「蓝球热号排行」「后区热号排行」
         会拿红球/前区的号（会出现 24 这种根本不是蓝球的号）。
         这里和 stats.js 的同类逻辑保持一致。 */
      const areaForGroup = (g) => {
        const base = areaKeyOf(sec);
        const lb = String((g && g.label) || '');
        if (gameId === 'ssq') return /蓝球/.test(lb) ? 'blue' : 'red';
        if (gameId === 'dlt') return /后区/.test(lb) ? 'back' : 'front';
        if (gameId === 'qxc' || gameId === 'xqxc') return /后区/.test(lb) ? 'back' : 'front';
        if (/后区|蓝球/.test(lb)) return 'back';
        return base;
      };
      const ak = areaKeyOf(sec);   // 保留：下面非分组的字段（主推球等）仍用它
      sec.groups.forEach((g) => {
        const sub = document.createElement('div');
        sub.className = 'tk-subtitle';
        sub.textContent = g.label;
        block.appendChild(sub);
        for (let i = 0; i < (g.count || 6); i++) {
          const row = document.createElement('div');
          row.className = 'tk-numrow';
          row.innerHTML = `<span class="tk-numlabel">第${i + 1}行</span>`;

          const wrap = document.createElement('div');
          wrap.className = 'tk-with-dice';
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'tk-input';
          inp.dataset.key = `${g.label}_${i}`;
          inp.placeholder = '如 13出现8次';
          inp.value = vals[`${g.label}_${i}`] || '';
          inputs[`${g.label}_${i}`] = inp;
          wrap.appendChild(inp);

          // 热号排行：属于真实统计值，「全部随机」时保持不动
          inputMeta[`${g.label}_${i}`] = { label: g.label, count: g.count, areaKey: areaForGroup(g), isRank: true };
          fixedKeys.add(`${g.label}_${i}`);

          const dice = document.createElement('button');
          dice.className = 'tk-dice';
          dice.type = 'button';
          dice.title = '从真实排行里摇一个';
          dice.textContent = '🎲';
          dice.addEventListener('click', () => {
            /* 【骰子原本的语义】从热号排行的真实结果里随机挑一条。
               号码区必须按【分组标签】取（蓝球热号排行 → 蓝球），
               否则会摇出 24 这种根本不是蓝球的号。 */
            const gArea = areaForGroup(g);
            const ranks = (typeof hotRankStrings === 'function')
              ? hotRankStrings(gameId, gArea, g.count || 6, HIST_PERIODS)
              : [];
            inp.value = ranks.length ? ranks[ri(0, ranks.length - 1)] : '';
            dice.classList.add('rolled');
            setTimeout(() => dice.classList.remove('rolled'), 400);
          });
          wrap.appendChild(dice);

          row.appendChild(wrap);
          block.appendChild(row);
        }
      });
    }

    /* ---- 五行 ---- */
    if (sec.elements) {
      sec.elements.forEach((e) => {
        const row = document.createElement('div');
        row.className = 'tk-numrow';
        row.innerHTML = `<span class="tk-numlabel">${e.name} ${e.tailsLabel || ''}</span>`;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'tk-input tk-numinput';
        inp.dataset.key = e.key;
        inp.placeholder = '号码，用空格分隔';
        inp.value = vals[e.key] || '';
        inputs[e.key] = inp;
        row.appendChild(inp);
        block.appendChild(row);
      });
    }

    /* ---- 日历 / 徽章 ---- */
    if (sec.badges) {
      sec.badges.forEach((b) => {
        const row = document.createElement('div');
        row.className = 'tk-numrow';
        row.innerHTML = `<span class="tk-numlabel">${b.label}</span>`;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'tk-input tk-numinput';
        inp.dataset.key = b.key;
        inp.placeholder = '如 正南';
        inp.value = vals[b.key] || '';
        inputs[b.key] = inp;
        row.appendChild(inp);
        block.appendChild(row);
      });
    }

    /* ---- 九宫 / 连环的中心数 ---- */
    if (sec.centerKey) {
      const row = document.createElement('div');
      row.className = 'tk-numrow';
      row.innerHTML = `<span class="tk-numlabel">中心数</span>`;
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'tk-input tk-numinput';
      inp.dataset.key = sec.centerKey;
      inp.placeholder = '如 18';
      inp.value = vals[sec.centerKey] || '';
      inputs[sec.centerKey] = inp;
      row.appendChild(inp);
      block.appendChild(row);
    }

    /* ---- 绕胆图色块（16 格）---- */
    if (sec.type === 'grid') {
      const total = (sec.cols || 4) * (sec.rows || 4);
      for (let i = 0; i < total; i++) {
        const row = document.createElement('div');
        row.className = 'tk-numrow';
        row.innerHTML = `<span class="tk-numlabel">第${i + 1}格</span>`;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'tk-input tk-numinput';
        inp.dataset.key = `grid_${i}`;
        inp.placeholder = '号码';
        inp.value = vals[`grid_${i}`] || '';
        inputs[`grid_${i}`] = inp;
        row.appendChild(inp);
        block.appendChild(row);
      }
    }

    /* ---- 固定文字（脚注）---- */
    if (sec.footerText) {
      const n = document.createElement('div');
      n.className = 'tk-note';
      n.textContent = sec.footerText;
      block.appendChild(n);
    }

    /* ---- 页脚键值 ---- */
    if (sec.footer) {
      const ak = areaKeyOf(sec);
      sec.footer.forEach((f) => {
        const row = document.createElement('div');
        row.className = 'tk-numrow';
        row.innerHTML = `<span class="tk-numlabel">${f.label}</span>`;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'tk-input tk-numinput';
        inp.dataset.key = f.key;
        inp.placeholder = '';
        inp.value = vals[f.key] || '';
        inputs[f.key] = inp;
        /* 记下元信息：一键摇号会给这些字段填「合值区间 / 和尾 / 防组三 / 杀号」，
           「全部随机」也要按同一口径填（杀号只要 3 个号），
           否则空白表单点完还是空的、存档到页面上会画成「—」 */
        inputMeta[f.key] = { label: f.label, count: /杀/.test(f.label || '') ? 3 : 6, areaKey: ak };
        row.appendChild(inp);
        block.appendChild(row);
      });
    }

    parent.appendChild(block);
  };

  img.sections.forEach((sec) => buildSection(sec, box, 0));

  /* ---------- 保存按钮 ---------- */
  const acts = document.createElement('div');
  acts.className = 'actions';
  acts.style.marginTop = '18px';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn';
  saveBtn.textContent = '保存这套推荐';

  const msg = document.createElement('span');
  msg.style.cssText = 'font-size:12px;margin-left:10px;';

  saveBtn.addEventListener('click', () => {
    const out = {};
    Object.keys(inputs).forEach((k) => {
      const v = inputs[k].value.trim();
      if (v) out[k] = v;
    });
    const rec = getTicket(gameId, date) || { date, issue: '', images: {} };
    if (!rec.images) rec.images = {};
    rec.images[imageKey] = out;
    // 期号顺手从开奖数据带过来
    if (!rec.issue) {
      const d = (typeof getDraw === 'function') ? getDraw(gameId) : null;
      if (d) rec.issue = d.issue;
    }
    setTicket(gameId, date, rec);
    msg.style.color = '#7ee787';
    msg.textContent = '已保存';
    setTimeout(() => { msg.textContent = ''; }, 2000);
    if (onSaved) onSaved();
  });

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn ghost';
  resetBtn.textContent = '清空表单';
  resetBtn.addEventListener('click', () => {
    if (!confirm('确定清空这张图的录入内容吗？')) return;
    Object.keys(inputs).forEach((k) => { inputs[k].value = ''; });
  });

  /* ---------- 全部随机 ---------- */
  const allBtn = document.createElement('button');
  allBtn.className = 'btn';
  allBtn.style.cssText = 'background:linear-gradient(180deg,#f0b429,#d99a12);color:#3a2c00;';
  allBtn.textContent = '🎲 全部随机';
  allBtn.title = '一次把所有字段都摇出来（热号排行保持真实值不动）';
  allBtn.addEventListener('click', () => {
    let n = 0;
    /* 逐步累积：后面的字段看得到前面刚摇出来的值，整图才不会自相矛盾 */
    const work = formValues();
    Object.keys(inputs).forEach((k) => {
      const meta = inputMeta[k];
      /* 热号排行：保持真实统计值不动。
         空白表单里这几行还没有值（不然保存后页面上会画成「—」），
         按「一键摇号」的同一口径给它们填上真实排行的那一条。 */
      if (fixedKeys.has(k)) {
        if (meta && !String(inputs[k].value || '').trim() && typeof hotRankStrings === 'function') {
          const ranks = hotRankStrings(gameId, meta.areaKey, meta.count || 6, HIST_PERIODS) || [];
          const m = String(k).match(/_(\d+)$/);
          const idx = m ? Number(m[1]) : 0;
          if (ranks[idx] !== undefined) { inputs[k].value = ranks[idx]; n++; }
        }
        return;
      }

      /* 没有元信息的字段（公历 / 农历 / 五行号码 / 徽章 / 绕胆图格子…）
         根本不是号码，以前会被写成一个号码，这里保持原样不动 */
      if (!meta) return;

      /* 【random:true】骰子要的是「合法的、但不一样的值」；
         不传就是出号用的确定性算法 —— 那才会出现「点了全部随机没变化」。 */
      const v = rollValueFor(gameId, {
        key: k,
        label: meta.label,
        count: meta.count,
        areaKey: meta.areaKey,
        itemLabel: meta.itemLabel
      }, { random: true, ctx: work, imageKey });
      inputs[k].value = v;
      if (String(v == null ? '' : v).trim()) work[k] = v;
      n++;
    });
    const fixed = settleConsistency();
    msg.style.color = '#f0b429';
    msg.textContent = `已随机 ${n} 个字段（热号排行保持真实值${fixed ? `，顺手修了 ${fixed} 处自相矛盾` : ''}）`;
    setTimeout(() => { msg.textContent = ''; }, 3000);

    // 按钮反馈
    allBtn.textContent = '🎲 已随机';
    setTimeout(() => { allBtn.textContent = '🎲 全部随机'; }, 1200);
  });

  acts.appendChild(allBtn);
  acts.appendChild(saveBtn);
  acts.appendChild(resetBtn);
  acts.appendChild(msg);
  box.appendChild(acts);

  container.appendChild(box);
}
