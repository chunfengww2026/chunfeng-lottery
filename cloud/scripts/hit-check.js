/* ============================================================
   hit-check.js —— 中奖比对
   ------------------------------------------------------------
   比对「当天推送的号码」与「当期实际开奖号码」，
   给出命中的奖级与奖金。

   数据来源：
     saved-tickets.js  当天推送的号码（程序生成）
     history.js        往期开奖号码
     draws.js          最新一期开奖号码
     prize-data.js     官方奖级与单注奖金
   ============================================================ */

/* ============================================================
   工具
   ============================================================ */

/** 把 "05 06 08" / "01" / "050608" 解析成数字数组 */
function hcParseNums(v) {
  if (v === null || v === undefined) return [];
  const s = String(v).trim();
  if (!s) return [];

  // 1) 有分隔符：直接按分隔符拆
  if (/\s/.test(s)) {
    return s.split(/\s+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
  }
  if (/[,，、]/.test(s)) {
    return s.split(/[,，、]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
  }

  // 2) 纯数字，无分隔符
  if (/^\d+$/.test(s)) {
    // 【关键】两位数以内的，就是一个号码本身
    //   "01" → [1]     "16" → [16]
    // 不能拆成 [0,1]，否则全错
    if (s.length <= 2) return [parseInt(s, 10)];

    // 4 位及以上：按两位一组拆（如 "050608" → [5,6,8]）
    if (s.length % 2 === 0 && s.length >= 4) {
      const out = [];
      for (let i = 0; i < s.length; i += 2) {
        const n = parseInt(s.slice(i, i + 2), 10);
        if (Number.isFinite(n)) out.push(n);
      }
      return out;
    }

    // 奇数位：逐位拆（如 "505" → [5,0,5]）
    return s.split('').map((c) => parseInt(c, 10)).filter((n) => Number.isFinite(n));
  }

  // 3) 其他：提取所有数字
  return (s.match(/\d+/g) || []).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
}

/** 单个数字（取第一个） */
function hcOne(v) {
  const arr = hcParseNums(v);
  return arr.length ? arr[0] : null;
}

/**
 * 定位字段：形如 "04 06 09"（该位置的候选码列表）
 * 取【第一个】作为实际投注的那个数字。
 */
function hcFirstDigit(v) {
  const arr = hcParseNums(v);
  return arr.length ? arr[0] : null;
}

/** 交集个数 */
function hcIntersect(a, b) {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x)).length;
}

function hcSorted(arr) {
  return [...arr].sort((x, y) => x - y);
}

function hcSameArr(a, b) {
  if (a.length !== b.length) return false;
  const sa = hcSorted(a).join(','), sb = hcSorted(b).join(',');
  return sa === sb;
}

/* ============================================================
   奖级表（官方规则）
   ============================================================ */

/* 双色球：红球命中数-蓝球是否命中 → 奖级 */
const SSQ_LEVELS = [
  { key: '6+1', name: '一等奖', amount: '浮动' },
  { key: '6+0', name: '二等奖', amount: '浮动' },
  { key: '5+1', name: '三等奖', amount: 3000 },
  { key: '5+0', name: '四等奖', amount: 200 },
  { key: '4+1', name: '四等奖', amount: 200 },
  { key: '4+0', name: '五等奖', amount: 10 },
  { key: '3+1', name: '五等奖', amount: 10 },
  { key: '2+1', name: '六等奖', amount: 5 },
  { key: '1+1', name: '六等奖', amount: 5 },
  { key: '0+1', name: '六等奖', amount: 5 }
];

/* 大乐透：前区命中-后区命中 → 奖级 */
const DLT_LEVELS = [
  { key: '5+2', name: '一等奖', amount: '浮动' },
  { key: '5+1', name: '二等奖', amount: '浮动' },
  { key: '5+0', name: '三等奖', amount: 10000 },
  { key: '4+2', name: '三等奖', amount: 10000 },
  { key: '4+1', name: '四等奖', amount: 3000 },
  { key: '3+2', name: '四等奖', amount: 3000 },
  { key: '4+0', name: '五等奖', amount: 300 },
  { key: '3+1', name: '五等奖', amount: 300 },
  { key: '2+2', name: '五等奖', amount: 300 },
  { key: '3+0', name: '六等奖', amount: 200 },
  { key: '1+2', name: '六等奖', amount: 200 },
  { key: '2+1', name: '六等奖', amount: 200 },
  { key: '0+2', name: '六等奖', amount: 200 },
  { key: '2+0', name: '七等奖', amount: 100 },
  { key: '1+1', name: '七等奖', amount: 100 },
  { key: '0+1', name: '七等奖', amount: 100 },
  { key: '1+0', name: '八等奖', amount: 15 },
  { key: '0+0', name: '九等奖', amount: 5 }
];

/* 七乐彩：基本号命中数 + 是否含特别号 → 奖级 */
const QLC_LEVELS = [
  { m: 7, sp: false, name: '一等奖', amount: '浮动' },
  { m: 6, sp: true,  name: '二等奖', amount: '浮动' },
  { m: 6, sp: false, name: '三等奖', amount: '浮动' },
  { m: 5, sp: true,  name: '四等奖', amount: 200 },
  { m: 5, sp: false, name: '五等奖', amount: 50 },
  { m: 4, sp: true,  name: '六等奖', amount: 10 },
  { m: 4, sp: false, name: '七等奖', amount: 5 }
];

/* 快乐8：选 N 中 M → 奖金（官方固定奖金，选十/选九/选八…） */
const KL8_TABLE = {
  10: { 10: '浮动', 9: 8000, 8: 720, 7: 80, 6: 5, 5: 3, 0: 2 },
  9:  { 9: 250000, 8: 2000, 7: 225, 6: 22, 5: 5, 4: 3, 0: 2 },
  8:  { 8: 50000, 7: 800, 6: 80, 5: 15, 4: 3, 0: 2 },
  7:  { 7: 10000, 6: 288, 5: 28, 4: 4, 0: 2 },
  6:  { 6: 3000, 5: 30, 4: 10, 3: 3, 0: 2 },
  5:  { 5: 1000, 4: 21, 3: 3 },
  4:  { 4: 100, 3: 5, 2: 3 },
  3:  { 3: 53, 2: 3 },
  2:  { 2: 19 },
  1:  { 1: 4.6 }
};

/* 福彩3D / 排列3：固定奖金 */
const P3_FIXED = { '直选': 1040, '组三': 346, '组六': 173 };

/* ============================================================
   从推送数据里提取「本期投注号码」
   ============================================================ */

/**
 * @returns {{desc:string, nums:any, extra:any}|null}
 */
function hcExtractTicket(gameId, vals) {
  if (!vals) return null;

  switch (gameId) {
    case 'ssq': {
      // 红球 1 码 + 蓝球主推
      const reds = hcParseNums(vals.r1);
      const blue = hcOne(vals.b_main);
      if (!reds.length) return null;
      return { desc: `红球 ${reds.map(hc2).join(' ')} + 蓝球 ${blue !== null ? hc2(blue) : '—'}`, nums: { red: reds, blue: blue !== null ? [blue] : [] } };
    }
    case 'dlt': {
      const front = hcParseNums(vals.f1);
      const back = hcParseNums(vals.b_main);
      if (!front.length) return null;
      return { desc: `前区 ${front.map(hc2).join(' ')} + 后区 ${back.map(hc2).join(' ') || '—'}`, nums: { front, back } };
    }
    case 'qlc': {
      const main = hcParseNums(vals.r1);
      if (!main.length) return null;
      return { desc: `基本号 ${main.map(hc2).join(' ')}`, nums: { main } };
    }
    case 'kl8': {
      const main = hcParseNums(vals.r5 || vals.r10);
      if (!main.length) return null;
      return { desc: `选${main.length}：${main.map(hc2).join(' ')}`, nums: { main } };
    }
    case 'fc3d':
    case 'pl3': {
      // 定位字段形如 "04 06 09"，取第一个作为实际投注号
      const d = hcFirstDigit(vals.bai);
      const s = hcFirstDigit(vals.shi);
      const g = hcFirstDigit(vals.ge);
      if (d === null || s === null || g === null) return null;
      const pick = [d, s, g];
      return { desc: `直选 ${pick.join(' ')}`, nums: { pick } };
    }
    case 'pl5': {
      const w = hcFirstDigit(vals.wan), q = hcFirstDigit(vals.qian), b = hcFirstDigit(vals.bai);
      const s = hcFirstDigit(vals.shi), g = hcFirstDigit(vals.ge);
      if (w === null || q === null || b === null || s === null || g === null) return null;
      const pick = [w, q, b, s, g];
      return { desc: `号码 ${pick.join(' ')}`, nums: { pick } };
    }
    case 'qxc': {
      const pos = [];
      for (let i = 1; i <= 6; i++) {
        const d = hcFirstDigit(vals['p' + i]);
        if (d === null) return null;
        pos.push(d);
      }
      const back = hcFirstDigit(vals.pb);
      return {
        desc: `号码 ${pos.join(' ')} + ${back !== null ? back : '—'}`,
        nums: { pick: pos, back: back !== null ? [back] : [] }
      };
    }
    default:
      return null;
  }
}

function hc2(n, gid) {
    if (['fc3d','pl3','pl5','qxc'].indexOf(gid) >= 0) return String(n);
  return String(n).padStart(2, '0');
}

/* ============================================================
   提取开奖号码（按彩种映射到统一结构）
   ------------------------------------------------------------
   各彩种的区域命名不同：
     双色球   red / blue
     大乐透   front / back
     七乐彩   main / special
     快乐8    main
     福彩3D   main（3 位）
     排列3    main（3 位）
     排列5    main（5 位）
     七星彩   front（6 位）/ back（1 位）
   ============================================================ */
function hcDrawOf(gameId, item) {
  const a = item && item.areas;
  if (!a) return null;

  const pick = (...keys) => {
    for (const k of keys) {
      if (Array.isArray(a[k]) && a[k].length) return a[k].map(Number);
    }
    return [];
  };

  switch (gameId) {
    case 'ssq':
      return { red: pick('red'), blue: pick('blue'), special: [] };
    case 'dlt':
      return { red: pick('front'), blue: pick('back'), special: [] };
    case 'qlc':
      return { red: pick('main'), blue: [], special: pick('special') };
    case 'kl8':
      return { red: pick('main'), blue: [], special: [] };
    case 'fc3d':
    case 'pl3':
    case 'pl5':
      return { red: pick('main'), blue: [], special: [] };
    case 'qxc':
      return { red: pick('front'), blue: pick('back'), special: [] };
    default:
      return { red: pick('red', 'front', 'main'), blue: pick('blue', 'back', 'special'), special: pick('special') };
  }
}

/* ============================================================
   判定中奖
   ============================================================ */

/**
 * @param {string} gameId
 * @param {object} ticket  hcExtractTicket 的结果
 * @param {object} draw    开奖号码
 * @returns {{hit:boolean, levelName:string|null, amount:number|string|null, detail:string, big:boolean}}
 */
function hcJudge(gameId, ticket, draw) {
  const none = { hit: false, levelName: null, amount: null, detail: '', big: false };
  if (!ticket || !draw) return none;

  switch (gameId) {
    /* ---------- 双色球 ---------- */
    case 'ssq': {
      const r = hcIntersect(ticket.nums.red, draw.red);
      const b = hcIntersect(ticket.nums.blue, draw.blue) > 0 ? 1 : 0;
      const key = `${r}+${b}`;
      const lv = SSQ_LEVELS.find((x) => x.key === key);
      return {
        hit: !!lv,
        levelName: lv ? lv.name : null,
        amount: lv ? lv.amount : null,
        detail: `红球中 ${r} 个，蓝球${b ? '中' : '未中'}`,
        big: !!lv && (lv.name === '一等奖' || lv.name === '二等奖' || lv.name === '三等奖')
      };
    }

    /* ---------- 大乐透 ---------- */
    case 'dlt': {
      const f = hcIntersect(ticket.nums.front, draw.red);
      const bk = hcIntersect(ticket.nums.back, draw.blue);
      const key = `${f}+${bk}`;
      const lv = DLT_LEVELS.find((x) => x.key === key);
      return {
        hit: !!lv,
        levelName: lv ? lv.name : null,
        amount: lv ? lv.amount : null,
        detail: `前区中 ${f} 个，后区中 ${bk} 个`,
        big: !!lv && (lv.name === '一等奖' || lv.name === '二等奖' || lv.name === '三等奖')
      };
    }

    /* ---------- 七乐彩 ---------- */
    case 'qlc': {
      const m = hcIntersect(ticket.nums.main, draw.red);
      const sp = hcIntersect(ticket.nums.main, draw.special) > 0;
      // 从上往下找第一个满足的
      const lv = QLC_LEVELS.find((x) => m === x.m && x.sp === sp) ||
                 QLC_LEVELS.find((x) => m >= x.m && (!x.sp || sp));
      return {
        hit: !!lv,
        levelName: lv ? lv.name : null,
        amount: lv ? lv.amount : null,
        detail: `基本号中 ${m} 个${sp ? '，含特别号' : ''}`,
        big: !!lv && (lv.name === '一等奖' || lv.name === '二等奖' || lv.name === '三等奖')
      };
    }

    /* ---------- 快乐8 ---------- */
    case 'kl8': {
      const pick = ticket.nums.main.length;
      const m = hcIntersect(ticket.nums.main, draw.red);
      const table = KL8_TABLE[pick];
      const amt = table ? table[m] : undefined;
      const isHit = amt !== undefined;
      return {
        hit: isHit,
        levelName: isHit ? `选${pick}中${m}` : null,
        amount: isHit ? amt : null,
        detail: `选 ${pick} 个，中 ${m} 个`,
        big: isHit && (m >= 8 || (typeof amt === 'number' && amt >= 1000))
      };
    }

    /* ---------- 福彩3D / 排列3 ---------- */
    case 'fc3d':
    case 'pl3': {
      const p = ticket.nums.pick;
      const w = draw.red;   // 三个数字，按顺序
      const direct = p.length === 3 && w.length >= 3 &&
        p[0] === w[0] && p[1] === w[1] && p[2] === w[2];

      if (direct) {
        return {
          hit: true, levelName: '直选', amount: P3_FIXED['直选'],
          detail: `直选命中 ${p.join(' ')}`, big: true
        };
      }

      // 组选：三个数字全中（顺序不限）
      const sameSet = hcSameArr(p, w.slice(0, 3));
      if (sameSet) {
        const uniq = new Set(w.slice(0, 3)).size;
        if (uniq === 1) {
          return { hit: true, levelName: '组三（豹子）', amount: P3_FIXED['组三'], detail: `三同号 ${w.slice(0,3).join(' ')}`, big: true };
        }
        if (uniq === 2) {
          return { hit: true, levelName: '组三', amount: P3_FIXED['组三'], detail: `组三命中（对子号）`, big: true };
        }
        return { hit: true, levelName: '组六', amount: P3_FIXED['组六'], detail: `组六命中（三个不同号）`, big: false };
      }

      const m = hcIntersect(p, w.slice(0, 3));
      return { hit: false, levelName: null, amount: null, detail: `中 ${m} 个号，未中奖`, big: false };
    }

    /* ---------- 排列5 ---------- */
    case 'pl5': {
      const p = ticket.nums.pick;
      const w = draw.red;
      const ok = p.length === 5 && w.length >= 5 && p.every((x, i) => x === w[i]);
      return ok
        ? { hit: true, levelName: '一等奖（直选）', amount: 100000, detail: `五码全中 ${p.join(' ')}`, big: true }
        : { hit: false, levelName: null, amount: null, detail: `未全中`, big: false };
    }

    /* ---------- 七星彩 ---------- */
    case 'qxc': {
      const p = ticket.nums.pick;
      const w = draw.red;
      let m = 0;
      for (let i = 0; i < Math.min(p.length, w.length); i++) if (p[i] === w[i]) m++;
      // 后区
      const bHit = ticket.nums.back.length && draw.blue.length &&
        ticket.nums.back[0] === draw.blue[0];

      let level = null, amount = null;
      if (m === 6 && bHit) { level = '一等奖'; amount = 5000000; }
      else if (m === 6) { level = '二等奖'; amount = '浮动'; }
      else if (m === 5 && bHit) { level = '三等奖'; amount = 3000; }
      else if (m === 5) { level = '四等奖'; amount = 500; }
      else if (m === 4 && bHit) { level = '五等奖'; amount = 20; }
      else if (m === 4) { level = '六等奖'; amount = 5; }

      return {
        hit: !!level,
        levelName: level,
        amount,
        detail: `前 6 位中 ${m} 个${bHit ? '，后区中' : ''}`,
        big: !!level && (level === '一等奖' || level === '二等奖' || level === '三等奖')
      };
    }

    default:
      return none;
  }
}

/* ============================================================
   查官方奖级奖金（浮动奖金用）
   ============================================================ */
function hcOfficialAmount(gameId, levelName) {
  try {
    if (typeof PRIZE_DATA === 'undefined' || !PRIZE_DATA || !PRIZE_DATA.games) return null;
    const g = PRIZE_DATA.games[gameId];
    if (!g || !Array.isArray(g.levels)) return null;

    // 名称匹配（去掉括号补充说明）
    const base = String(levelName).replace(/[（(].*?[)）]/g, '');
    const lv = g.levels.find((x) => String(x.name).replace(/[（(].*?[)）]/g, '') === base);
    if (!lv || !lv.money) return null;
    return { money: lv.money, count: lv.count, issue: g.issue };
  } catch (e) { return null; }
}

/* ============================================================
   总入口：算出所有彩种的中奖情况
   ============================================================ */
/**
 * 检查所有【已归档期次】的中奖情况
 * 只返回真正中奖的 + 待开奖的当前期
 *
 * @param {object} opts { onlyWins: 只返回中奖的 }
 * @returns {{rows:Array, summary:object}}
 */
function checkAllHits(opts) {
  const o = opts || {};
  const onlyWins = !!o.onlyWins;

  const rows = [];
  const summary = {
    total: 0, hit: 0, first: 0, second: 0, third: 0,
    money: 0, hasMoney: false, pending: 0
  };

  HC_GAME_ORDER.forEach((gid) => {
    let periods = [];
    try {
      periods = (typeof allPeriodsOf === 'function') ? allPeriodsOf(gid) : [];
    } catch (e) { return; }

    periods.forEach((p) => {
      const vals = p.images && p.images.main;
      if (!vals) return;

      const ticket = hcExtractTicket(gid, vals);
      if (!ticket) return;

      const draw = p.draw || null;
      const pending = !draw;
      const judge = pending
        ? { hit: false, levelName: null, amount: null, detail: '尚未开奖', big: false }
        : hcJudge(gid, ticket, draw);

      // 浮动奖金换成官方实际金额
      let amount = judge.amount;
      if (judge.hit && (amount === '浮动' || amount === null)) {
        const off = hcOfficialAmount(gid, judge.levelName);
        if (off) amount = off.money;
      }

      const row = {
        gameId: gid,
        gameName: (typeof GAMES !== 'undefined' && GAMES[gid]) ? GAMES[gid].name : gid,
        issue: p.issue || (draw && draw.issue) || '',
        date: p.date || (draw && draw.date) || '',
        pushedAt: p.pushedAt || '',
        pending,
        ticket,
        ticketDesc: ticket.desc,
        draw,
        drawDesc: draw ? hcDrawDesc(gid, draw) : '',
        images: p.images,
        hit: judge.hit,
        levelName: judge.levelName,
        amount,
        detail: judge.detail,
        big: judge.big,
        isFirst: judge.levelName === '一等奖',
        isSecond: judge.levelName === '二等奖'
      };

      summary.total++;
      if (pending) summary.pending++;
      if (judge.hit) {
        summary.hit++;
        if (row.isFirst) summary.first++;
        if (row.isSecond) summary.second++;
        if (/三等奖/.test(judge.levelName || '')) summary.third++;
        if (typeof amount === 'number') { summary.money += amount; summary.hasMoney = true; }
      }

      if (onlyWins && !judge.hit) return;
      rows.push(row);
    });
  });

  // 一等奖 → 二等奖 → 其他中奖 → 待开奖
  const rank = (r) => (r.isFirst ? 0 : r.isSecond ? 1 : r.hit ? 2 : 3);
  rows.sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d) return d;
    return String(b.date).localeCompare(String(a.date));
  });

  return { rows, summary };
}

/** 只取中奖记录（中奖栏用） */
function getWinRows() {
  return checkAllHits({ onlyWins: true }).rows.filter((r) => r.hit);
}

/** 汇总中奖统计（供顶部提示） */
function getWinSummary() {
  const r = checkAllHits({ onlyWins: true });
  return r.summary;
}

/**
 * 找某彩种某期/某日的开奖，返回统一结构 {issue,date,red,blue,special}
 *
 * 【重要】比对必须期号对得上，否则会拿上一期的开奖号去比这一期的推荐，
 * 造成「误报中奖」。所以这里的规则是：
 *   1. 期号完全相同 → 用
 *   2. 日期完全相同 → 用
 *   3. 都不匹配 → 返回 null（视为尚未开奖）
 */
function hcFindDraw(gameId, date, issue) {
  const out = [];

  try {
    if (typeof getDraw === 'function') {
      const d = getDraw(gameId);
      if (d && d.areas) out.push({ issue: d.issue, date: d.date, areas: d.areas });
    }
  } catch (e) { /* 忽略 */ }

  try {
    if (typeof getHistory === 'function') {
      getHistory(gameId).forEach((h) => { if (h && h.areas) out.push(h); });
    }
  } catch (e) { /* 忽略 */ }

  let hit = null;

  // 1) 期号完全相同（最可靠）
  if (issue) {
    hit = out.find((x) => String(x.issue) === String(issue));
  }

  // 2) 日期完全相同
  if (!hit && date) {
    hit = out.find((x) => x.date === date);
  }

  // 3) 日期在推荐日之后、且是同一彩种的那一期（推荐日当天开奖的情况）
  if (!hit && date) {
    const t = new Date(date + 'T00:00:00').getTime();
    const later = out
      .filter((x) => x.date && new Date(x.date + 'T00:00:00').getTime() >= t)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (later.length) hit = later[0];
  }

  if (!hit) return null;

  const mapped = hcDrawOf(gameId, hit);
  if (!mapped) return null;
  return Object.assign({ issue: hit.issue, date: hit.date }, mapped);
}

/** 开奖号码的可读文字（draw 是 hcFindDraw 的统一结构） */
function hcDrawDesc(gameId, draw) {
  if (!draw) return '';
  const red = (draw.red || []).map(hc2);
  const blue = (draw.blue || []).map(hc2);
  const sp = (draw.special || []).map(hc2);
  let s = red.join(' ');
  if (blue.length) s += ' + ' + blue.join(' ');
  if (sp.length) s += ' ★' + sp.join(' ');
  return s;
}

/* ============================================================
   最新开奖（供页面顶部展示）
   ============================================================ */
const HC_GAME_ORDER = ['ssq', 'dlt', 'fc3d', 'pl3', 'qlc', 'pl5', 'kl8', 'qxc'];

/** 取所有彩种的最新开奖 */
function getLatestDraws() {
  const out = [];
  HC_GAME_ORDER.forEach((gid) => {
    try {
      const d = (typeof getDraw === 'function') ? getDraw(gid) : null;
      if (!d || !d.areas) return;
      const mapped = hcDrawOf(gid, d);
      if (!mapped) return;
      out.push({
        gameId: gid,
        gameName: (typeof GAMES !== 'undefined' && GAMES[gid]) ? GAMES[gid].name : gid,
        issue: d.issue,
        date: d.date,
        red: mapped.red,
        blue: mapped.blue,
        special: mapped.special,
        issuer: (typeof GAMES !== 'undefined' && GAMES[gid]) ? GAMES[gid].issuer : ''
      });
    } catch (e) { /* 忽略 */ }
  });
  return out;
}

/** 号码 → 球 HTML */
function hcBallsHtml(nums, cls) {
  return (nums || []).map((n) => `<span class="hc-ball ${cls || ''}">${hc2(n)}</span>`).join('');
}

/* ============================================================
   在推荐图上圈出中奖号码
   ============================================================ */

/**
 * 把一个已经渲染好的推荐图，按中奖号码加高亮圈
 * @param {HTMLElement} root 渲染出来的图
 * @param {string} gameId
 * @param {object} draw   开奖号码（red/blue/special）
 * @param {object} ticket 投注号码
 */
function hcHighlightImage(root, gameId, draw, ticket) {
  if (!root || !draw) return root;

  const hitMain = new Set();
  const hitBack = new Set();
  const addAll = (set, arr) => (arr || []).forEach((n) => set.add(Number(n)));

  switch (gameId) {
    case 'ssq':
    case 'dlt':
      addAll(hitMain, draw.red);
      addAll(hitBack, draw.blue);
      break;
    case 'qlc':
      addAll(hitMain, draw.red);
      addAll(hitMain, draw.special);
      break;
    case 'qxc':
      addAll(hitMain, draw.red);
      addAll(hitBack, draw.blue);
      break;
    default:
      addAll(hitMain, draw.red);
      break;
  }

  let marked = 0;

  /** 递归遍历（不依赖 querySelectorAll，导出环境和浏览器都能用） */
  const walk = (node) => {
    if (!node) return;
    const cls = String(node.className || '');

    // 只看号码球 / 色块 / 五行号码
    if (/rball|r-cell|r-wxnum|r-num/.test(cls)) {
      const txt = (node.textContent || '').trim();
      const m = /(\d{1,2})/.exec(txt);
      if (m) {
        const num = parseInt(m[1], 10);
        // 后区判定：class 里带 blue/back
        const isBack = /blue|back/i.test(cls);
        const set = isBack ? hitBack : hitMain;
        if (Number.isFinite(num) && set.has(num)) {
          node.className = cls + ' hc-hit';
          marked++;
        }
      }
    }

    if (Array.isArray(node.children)) node.children.forEach(walk);
  };

  walk(root);
  return { root, marked };
}

/* ============================================================
   中奖栏（只显示中奖的）
   ============================================================ */

/**
 * 生成中奖栏 HTML
 * @param {object} opts { renderImage: function(gameId, imageKey, values, draw) → HTML字符串 }
 * @returns {string}  没有中奖时返回空字符串
 */
function buildWinSectionHtml(opts) {
  const o = opts || {};
  const wins = getWinRows();
  if (!wins.length) return '';

  const s = checkAllHits({ onlyWins: true }).summary;

  /* ---- 汇总 ---- */
  const badges = [];
  if (s.first) badges.push(`<span class="hw-badge first">一等奖 ${s.first}</span>`);
  if (s.second) badges.push(`<span class="hw-badge second">二等奖 ${s.second}</span>`);
  if (s.third) badges.push(`<span class="hw-badge third">三等奖 ${s.third}</span>`);
  if (s.hasMoney) badges.push(`<span class="hw-badge money">奖金合计 ${s.money.toLocaleString()} 元</span>`);

  const summaryHtml =
    `<div class="hw-summary">` +
    `<div class="hw-sum-main">🎉 累计命中 ${wins.length} 注</div>` +
    `<div class="hw-sum-sub">${badges.join('')}</div>` +
    `</div>`;

  /* ---- 逐条中奖 ---- */
  const cards = wins.map((w) => {
    // 推荐图（带高亮）
    let imgHtml = '';
    if (typeof o.renderImage === 'function') {
      try {
        imgHtml = o.renderImage(w.gameId, 'main', w.images.main, w.draw);
      } catch (e) { imgHtml = ''; }
    }

    const amt = (typeof w.amount === 'number')
      ? `<span class="hw-amt">${w.amount.toLocaleString()} 元</span>`
      : '';

    return (
      `<div class="hw-card${w.big ? ' big' : ''}">` +
      `<div class="hw-head">` +
      `<span class="hw-game">${w.gameName}</span>` +
      `<span class="hw-issue">第 ${w.issue} 期</span>` +
      `<span class="hw-level${w.big ? ' big' : ''}">${w.levelName}</span>` +
      `</div>` +
      `<div class="hw-detail">${w.detail}${amt}</div>` +
      `<div class="hw-draw">` +
      `${hcBallsHtml(w.draw.red, 'red')}` +
      `${w.draw.blue.length ? '<span class="hc-plus">+</span>' + hcBallsHtml(w.draw.blue, 'blue') : ''}` +
      `${w.draw.special.length ? '<span class="hc-plus">★</span>' + hcBallsHtml(w.draw.special, 'sp') : ''}` +
      `<span class="hw-drawtip">开奖号码 · 圈出的是命中号</span>` +
      `</div>` +
      (imgHtml ? `<div class="hw-img">${imgHtml}</div>` : '') +
      `</div>`
    );
  }).join('');

  return (
    `<section class="ro-game" id="winSection">` +
    `<div class="ro-gamehead">` +
    `<h2>中奖栏</h2>` +
    `<div class="ro-meta">已开奖期的命中情况 · 圈出的是中奖号码</div>` +
    `</div>` +
    summaryHtml +
    `<div class="hw-list">${cards}</div>` +
    `<div class="hc-note">按官方玩法规则自动比对；浮动奖金取自官方公布单注奖金。仅供核对，不构成购彩建议。</div>` +
    `</section>`
  );
}

/* ============================================================
   最新开奖（页面顶部）
   ------------------------------------------------------------
   【重要】这里不再自己拼 HTML，而是交给 latest-draws.js 里的
   latestDrawsHtml() —— 分享页【内联的是同一份文件】，
   客户端拉到 tickets.json 里的新 draws 后也用这个函数重画。
   两边同一个函数 → 服务端预渲染的内容和客户端就地替换的内容
   不可能出现写法漂移（以前这里是唯一实现，浏览器里跑不到，
   所以那块内容只有刷新整页才能变）。
   ============================================================ */
function buildLatestDrawHtml() {
  const draws = getLatestDraws();
  if (!draws.length) return '';

  if (typeof latestDrawsHtml === 'function') {
    return latestDrawsHtml(draws, (typeof GAMES !== 'undefined') ? GAMES : {});
  }

  /* 兜底：latest-draws.js 没加载成功时，退回原来那段写法
     （保证页面照样能生成，只是缺少稳定 id、客户端无法就地更新） */
  const cards = draws.map((d) => {
    const sp = d.special.length ? `<span class="hc-plus">★</span>${hcBallsHtml(d.special, 'sp')}` : '';
    const bl = d.blue.length ? `<span class="hc-plus">+</span>${hcBallsHtml(d.blue, 'blue')}` : '';
    return `<div class="hc-drawcard">` +
      `<div class="hc-dt">` +
      `<span class="hc-gn">${d.gameName}</span>` +
      `<span class="hc-iss">第 ${d.issue} 期</span>` +
      `<span class="hc-date">${d.date || ''}</span>` +
      `</div>` +
      `<div class="hc-balls">${hcBallsHtml(d.red, 'red')}${bl}${sp}</div>` +
      `</div>`;
  }).join('');

  return (
    `<section class="ro-game" id="ro-latest">` +
    `<div class="ro-gamehead">` +
    `<h2>最新开奖</h2>` +
    `<div class="ro-meta">各彩种最新一期开奖号码</div>` +
    `</div>` +
    `<div class="hc-drawgrid">${cards}</div>` +
    `</section>`
  );
}

/* ============================================================
   中奖栏样式
   ============================================================ */
function hitSectionCss() {
  return `
/* ---- 最新开奖 ---- */
.hc-drawgrid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
.hc-drawcard { background: #161a21; border: 1px solid #262d3a; border-radius: 12px; padding: 12px 14px; }
.hc-dt { display: flex; align-items: baseline; gap: 8px; margin-bottom: 9px; flex-wrap: wrap; }
.hc-gn { font-size: 14px; font-weight: 700; color: #e8eaed; }
.hc-iss { font-size: 11.5px; color: #8b93a1; }
.hc-date { font-size: 11px; color: #5a6272; margin-left: auto; }
.hc-balls { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.hc-ball {
  width: 27px; height: 27px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #fff; font-family: Arial, sans-serif;
}
.hc-ball.red  { background: linear-gradient(180deg,#f0575c,#d32f34); }
.hc-ball.blue { background: linear-gradient(180deg,#4a83f5,#2158c4); }
.hc-ball.sp   { background: linear-gradient(180deg,#f0b429,#d99a12); color: #4a3600; }
.hc-plus { color: #5a6272; font-size: 13px; margin: 0 2px; }

/* ---- 中奖号码圈选 ---- */
.hc-hit {
  box-shadow: 0 0 0 3px #ff2d55, 0 0 16px rgba(255,45,85,0.9) !important;
  z-index: 3;
}
.rball.hc-hit, .r-cell.hc-hit { outline: 2px solid #ffd54a; outline-offset: 1px; }

/* ---- 中奖栏 ---- */
.hw-summary {
  border-radius: 12px; padding: 16px 18px; margin-bottom: 16px;
  background: linear-gradient(135deg, rgba(255,45,85,0.14), rgba(240,180,41,0.10));
  border: 1px solid rgba(255,45,85,0.45);
}
.hw-sum-main { font-size: 19px; font-weight: 800; color: #ff5f6d; margin-bottom: 9px; }
.hw-sum-sub { display: flex; gap: 8px; flex-wrap: wrap; }
.hw-badge { padding: 4px 12px; border-radius: 7px; font-size: 13px; font-weight: 800; }
.hw-badge.first  { background: linear-gradient(180deg,#ff5f6d,#d32f34); color: #fff; }
.hw-badge.second { background: linear-gradient(180deg,#f0b429,#d99a12); color: #4a3600; }
.hw-badge.third  { background: linear-gradient(180deg,#7ee787,#3aa657); color: #0b2b12; }
.hw-badge.money  { background: rgba(71,224,160,0.18); color: #47e0a0; border: 1px solid rgba(71,224,160,0.4); }

.hw-list { display: flex; flex-direction: column; gap: 18px; }
.hw-card {
  background: #161a21; border: 1px solid #262d3a;
  border-radius: 13px; padding: 14px 16px;
}
.hw-card.big {
  background: linear-gradient(135deg, rgba(255,45,85,0.13), rgba(240,180,41,0.08));
  border-color: rgba(255,45,85,0.5);
  box-shadow: 0 0 0 1px rgba(255,45,85,0.2), 0 6px 24px rgba(255,45,85,0.14);
}
.hw-head { display: flex; align-items: center; gap: 9px; margin-bottom: 7px; flex-wrap: wrap; }
.hw-game { font-size: 15px; font-weight: 700; color: #e8eaed; }
.hw-issue { font-size: 12px; color: #6b7488; }
.hw-level {
  margin-left: auto; padding: 3px 11px; border-radius: 7px;
  font-size: 12.5px; font-weight: 800;
  background: rgba(71,224,160,0.18); color: #47e0a0;
}
.hw-level.big { background: linear-gradient(180deg,#ff5f6d,#d32f34); color: #fff; }
.hw-detail { font-size: 12.5px; color: #8b93a1; display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.hw-amt { color: #47e0a0; font-weight: 700; }
.hw-draw {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding-bottom: 10px; border-bottom: 1px dashed #232a36; margin-bottom: 12px;
}
.hw-drawtip { font-size: 11px; color: #5a6272; margin-left: 6px; }
.hw-img {
  border-radius: 10px; overflow: hidden;
  box-shadow: 0 3px 14px rgba(0,0,0,0.4);
}
.hw-img .r-image { margin: 0 !important; border-radius: 0 !important; max-width: 100% !important; }
.hc-note { font-size: 11px; color: #454d5c; margin-top: 14px; line-height: 1.8; }

@media (max-width: 560px) {
  .hc-drawgrid { grid-template-columns: 1fr; }
  .hc-ball { width: 25px; height: 25px; font-size: 11.5px; }
  .hw-sum-main { font-size: 17px; }
}
`;
}
