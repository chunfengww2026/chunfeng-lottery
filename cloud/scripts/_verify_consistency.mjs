/* ============================================================
   _verify_consistency.mjs —— 字段自相矛盾验收（机器验证，无浏览器）

   对 8 个彩种 × 每一张图，检查不变量 ①~⑫：
     ①HOT∩COLD=∅  ②KILL∩POOL=∅  ③KILL∩DAN/TUO=∅
     ④DAN,TUO⊆POOL  ⑤DAN∩TUO=∅  ⑥TIERS 严格递减
     ⑦REC∩KREC=∅  ⑧HOT,COLD⊆POOL  ⑨尾数冷热 vs 主推档
     ⑩同区/邻号/连号/跳连/同尾 ⊆POOL  ⑪遗漏回补/最大遗漏 ⊆POOL
     ⑫走势球数口径（奇偶/大小/012路）不变

   三个层面都验：
     auto   —— resolveTemplateValues(gid, key, null)          （stats.js 实时算）
     page   —— resolveTemplateValues(gid, key, 存档值)         （页面实际显示）
     saved  —— saved-tickets.js 里那一层原始字段               （摇号存档层）

   用法：
     node _verify_consistency.mjs --tag=before
     node _verify_consistency.mjs --tag=after
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = 'D:/彩虹多多';
const TAG = (process.argv.find((a) => a.startsWith('--tag=')) || '').split('=')[1] || 'run';

/* ---------------- 迷你 DOM + 沙箱 ---------------- */
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {};
    this._text = ''; this._html = null; this.className = ''; this.dataset = {};
    this.style = { cssText: '' };
  }
  set textContent(v) { this._text = String(v); this.children = []; this._html = null; }
  get textContent() { return this._html ? this._html.replace(/<[^>]*>/g, '') : this._text; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get innerHTML() { return this._html !== null ? this._html : ''; }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {} querySelector() { return null; } querySelectorAll() { return []; }
}
const store = new Map();
const ctx = vm.createContext({
  console, Math, Map, Set, Array, Object, String, Number, JSON, Date,
  parseInt, parseFloat, isNaN, Uint32Array, RegExp, Error, Infinity,
  document: {
    createElement: (t) => new El(t),
    createTextNode: (t) => { const e = new El('#text'); e.textContent = t; return e; },
    addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => []
  },
  window: {}, navigator: {}, localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  Image: function () {}, ClipboardItem: function () {}, alert: () => {}, confirm: () => true
});

const FILES = ['games.js', 'draws.js', 'history.js', 'draw-data.js', 'algo.js', 'stats.js',
  'templates.js', 'experts-data.js', 'expert-pool.js', 'ticket-store.js', 'saved-tickets.js',
  'render.js', 'materials-data.js', 'data-store.js'];
const loadErr = [];
for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { loadErr.push(`${f} 缺失`); continue; }
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f }); }
  catch (e) { loadErr.push(`加载 ${f}: ${e.message}`); }
}
/* 资料塞进 localStorage（和 roll-and-export.mjs 一样，资料优先才生效） */
try {
  vm.runInContext('globalThis.__MATS = (typeof MATERIALS_DATA !== "undefined") ? MATERIALS_DATA : null;', ctx);
  const md = ctx.__MATS;
  if (md && Array.isArray(md.list) && md.list.length) store.set('cdd.materials.v1', JSON.stringify(md.list));
} catch (e) { /* 忽略 */ }

const T = JSON.parse(vm.runInContext('JSON.stringify(TEMPLATES)', ctx));
const GAME_NAME = {};
Object.keys(T).forEach((g) => { GAME_NAME[g] = T[g].name; });

/* --nofix：把一致性收尾函数停掉 —— 用同一份验收脚本量「修复前」，
   这样改前/改后是同一把尺子（saved-tickets.js 也还是旧的）。 */
const NOFIX = process.argv.includes('--nofix');
if (NOFIX) {
  try {
    vm.runInContext('enforceConsistencyImage = function (gameId, imageKey, out) { return out; };', ctx);
  } catch (e) { console.log('⚠️ 停用一致性收尾失败：' + e.message); }
}

const RANGE = {
  ssq: { red: [1, 33], blue: [1, 16] },
  dlt: { front: [1, 35], back: [1, 12] },
  qlc: { main: [1, 30] },
  kl8: { main: [1, 80] },
  fc3d: { main: [0, 9] },
  pl3: { main: [0, 9] },
  pl5: { main: [0, 9] },
  qxc: { front: [0, 9], back: [0, 14] }
};
const PICK_COUNT = {
  ssq: { red: 6, blue: 1 }, dlt: { front: 5, back: 2 }, qlc: { main: 7 }, kl8: { main: 10 },
  fc3d: { main: 1 }, pl3: { main: 1 }, pl5: { main: 1 }, qxc: { front: 1, back: 1 }
};

/* ---------------- 从 TEMPLATES 推出「字段语义」 ---------------- */
function areaOfSection(gameId, joined) {
  if (gameId === 'ssq') return /蓝球/.test(joined) ? 'blue' : 'red';
  if (gameId === 'dlt') return /后区/.test(joined) ? 'back' : 'front';
  if (gameId === 'qxc') return /后区/.test(joined) ? 'back' : 'front';
  return 'main';
}
function labelsOf(sec) {
  const a = [sec.title || ''];
  if (Array.isArray(sec.fields)) sec.fields.forEach((f) => a.push(f.label || ''));
  if (Array.isArray(sec.items)) sec.items.forEach((i) => a.push(i.label || ''));
  if (Array.isArray(sec.rows)) sec.rows.forEach((r) => a.push(r.label || ''));
  if (Array.isArray(sec.positions)) sec.positions.forEach((p) => a.push(p.label || ''));
  if (Array.isArray(sec.footer)) sec.footer.forEach((f) => a.push(f.label || ''));
  if (sec.bigBall) a.push(sec.bigBall.label || '');
  if (sec.bigBalls) a.push('主推');
  return a.join(' ');
}
/** key → { role, count, area, posIdx } */
function rolesOfImage(gameId, img) {
  const out = {};
  const put = (key, role, count, area, posIdx) => { if (key) out[key] = { role, count, area, posIdx }; };

  const walk = (sec) => {
    if (!sec || typeof sec !== 'object') return;
    const joined = labelsOf(sec);
    const area0 = areaOfSection(gameId, joined);
    const type = sec.type;

    if (Array.isArray(sec.fields)) {
      sec.fields.forEach((f) => {
        const L = String(f.label || '');
        const a = areaOfSection(gameId, sec.title + ' ' + L);
        let role = null;
        if (L.includes('热号')) role = 'hot';
        else if (L.includes('冷号')) role = 'cold';
        else if (L.includes('杀号')) role = 'kill';
        else if (L.includes('胆码')) role = 'dan';
        else if (L.includes('拖码')) role = 'tuo';
        else if (L.includes('推荐')) role = 'rec';
        else if (L.includes('跳连号')) role = 'tjlh';
        else if (L.includes('连号')) role = 'lh';
        else if (L.includes('重复号')) role = 'cf';
        else if (L.includes('同尾号')) role = 'wh';
        else if (L.includes('邻号')) role = 'lin';
        else if (L.includes('同区号')) role = 'tqh';
        else if (L.includes('最大遗漏')) role = 'maxomit';
        else if (L.includes('遗漏回补')) role = 'ylhb';
        else if (L.includes('尾数冷热')) role = 'wsl';
        if (role) put(f.key, role, /杀/.test(L) ? 3 : 6, a);
      });
    }
    if (Array.isArray(sec.items)) {
      sec.items.forEach((i) => {
        const L = String(i.label || '');
        let role = null;
        if (L.includes('热号')) role = 'hot';
        else if (L.includes('冷号')) role = 'cold';
        if (role) put(i.key, role, 6, area0);
      });
    }
    if (type === 'rows' && Array.isArray(sec.rows)) {
      sec.rows.forEach((r) => {
        const L = String(r.label || '');
        let role = null;
        if (/杀/.test(L)) role = 'kill';
        else if (/^\d+\s*(码|胆)$/.test(L.trim())) role = 'tier';
        else if (r.key === 'sh') role = 'kill';
        if (role) put(r.key, role, r.count, area0);
      });
    }
    if (type === 'digit' || (Array.isArray(sec.positions) && type !== 'positions')) {
      if (sec.groupRow) put(sec.groupRow.key, 'pool', sec.groupRow.count, area0, -2);
      if (Array.isArray(sec.positions)) {
        sec.positions.forEach((p, i) => put(p.key, 'posrec', p.count, area0, i));
      }
    }
    if (type === 'positions' && Array.isArray(sec.rows)) {
      sec.rows.forEach((r, i) => {
        const L = String(r.label || '');
        const a = (gameId === 'qxc') ? (/后区/.test(L) ? 'back' : 'front') : (/后区/.test(L) ? 'back' : area0);
        put(r.key, /杀/.test(L) ? 'poskill' : 'posrec', r.count, a, i);
      });
    }
    if (Array.isArray(sec.footer)) {
      sec.footer.forEach((f) => {
        const L = String(f.label || '');
        if (L.includes('杀号')) put(f.key, 'kill', 3, area0);
      });
    }
    if (sec.bigBall) put(sec.bigBall.key, 'rec', 1, area0);
    if (sec.bigBalls) put(sec.bigBalls.key, 'rec', sec.bigBalls.count || 2, area0);
    if (sec.left) walk(sec.left);
    if (sec.right) walk(sec.right);
  };
  img.sections.forEach(walk);
  return out;
}

/* ---------------- 号码解析 ---------------- */
function numsOf(role, v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || s === '—' || role === 'wsl') return [];
  let t = s;
  if (role === 'cf') t = t.split('防')[0];
  if (role === 'maxomit') t = t.replace(/号/g, '');
  if (role === 'tqh') t = t.replace(/[一二三]区/g, '');
  const m = t.match(/\d+/g) || [];
  return m.map(Number);
}
const coldTailsOf = (v) => (String(v || '').match(/(\d)尾冷/g) || []).map((x) => Number(x[0]));
const setOf = (a) => new Set(a);
const inter = (a, b) => a.filter((x) => b.has(x));
const fmt = (a) => (a.length ? a.map((x) => String(x).padStart(2, '0')).join(',') : '∅');
const uniq = (a) => [...new Set(a)];

/* ---------------- 每个彩种每张图跑一遍 ---------------- */
const failures = [];
const notes = [];
const poolSizes = [];
const codeStat = {};   // 每条不变量的通过/断言次数
let checks = 0;

function checkArea(layer, gameId, imgKey, areaKey, vals, roles) {
  const keys = Object.keys(roles).filter((k) => roles[k].area === areaKey && vals[k] !== undefined);
  if (!keys.length) return;
  const get = (k) => vals[k];
  const byRole = (r) => keys.filter((k) => roles[k].role === r);

  const tiers = byRole('tier').map((k) => ({ k, count: roles[k].count, nums: numsOf('tier', get(k)) }))
    .sort((a, b) => a.count - b.count);
  const killKeys = byRole('kill').concat(byRole('poskill'));
  const hotKeys = byRole('hot');
  const coldKeys = byRole('cold');
  const danKeys = byRole('dan');
  const tuoKeys = byRole('tuo');
  const recKeys = byRole('rec').concat(byRole('posrec'));
  const propKeys = keys.filter((k) => ['lh', 'cf', 'wh', 'lin', 'tjlh', 'tqh'].includes(roles[k].role));
  const omitKeys = keys.filter((k) => ['maxomit', 'ylhb'].includes(roles[k].role));

  // POOL：优先「最大档」；没有档位就用（组选池 / 专家池 / 推荐号并集 / 全范围）
  let POOL = new Set();
  let poolSrc = '';
  if (tiers.length) {
    const top = tiers[tiers.length - 1];
    POOL = setOf(top.nums);
    poolSrc = `${top.k}(${top.count})`;
  } else {
    const grpNums = uniq(byRole('pool').flatMap((k) => numsOf('pool', get(k))));
    const posUnion = uniq(recKeys.flatMap((k) => numsOf(roles[k].role, get(k))));
    const exp = (() => {
      try {
        return vm.runInContext(`JSON.stringify(expertPoolOf('${gameId}','${areaKey}'))`, ctx);
      } catch (e) { return '[]'; }
    })();
    const expNums = JSON.parse(exp);
    if (grpNums.length) { POOL = setOf(grpNums); poolSrc = `组选池(${grpNums.length})`; }
    else if (expNums.length) { POOL = setOf(expNums); poolSrc = `专家池(${expNums.length})`; }
    else if (posUnion.length) { POOL = setOf(posUnion); poolSrc = `推荐并集(${posUnion.length})`; }
    else {
      const [lo, hi] = (RANGE[gameId] || {})[areaKey] || [1, 33];
      const all = []; for (let i = lo; i <= hi; i++) all.push(i);
      POOL = setOf(all); poolSrc = `全范围(${all.length})`;
    }
  }
  if (tiers.length) poolSizes.push(`${gameId}/${imgKey}/${areaKey} ${poolSrc}`);

  const F = [];
  const add = (ok, code, detail) => {
    checks++;
    const cs = codeStat[code] || (codeStat[code] = { ok: 0, bad: 0 });
    if (ok) cs.ok++; else cs.bad++;
    if (!ok) F.push(`${code}${detail ? '(' + detail + ')' : ''}`);
  };

  // ① HOT ∩ COLD
  const hotNums = uniq(hotKeys.flatMap((k) => numsOf('hot', get(k))));
  const coldNums = uniq(coldKeys.flatMap((k) => numsOf('cold', get(k))));
  if (hotKeys.length && coldKeys.length) add(inter(hotNums, setOf(coldNums)).length === 0, '①HOT∩COLD',
    fmt(inter(hotNums, setOf(coldNums))));

  // ② KILL ∩ POOL（逐字段：有位杀就按该位的推荐池）
  const pairOf = (k) => (roles[k].role === 'poskill'
    ? byRole('posrec').find((m) => roles[m].posIdx === roles[k].posIdx && roles[m].area === roles[k].area)
    : null);
  killKeys.forEach((k) => {
    const kn = numsOf(roles[k].role, get(k));
    const mate = pairOf(k);
    const p = mate ? setOf(numsOf('posrec', get(mate))) : POOL;
    const hit = inter(kn, p);
    add(hit.length === 0, '②KILL∩POOL', hit.length ? `${k} 撞池 ${fmt(hit)}（杀=${fmt(kn)}）` : '');
    // 位杀不能越出该位范围
    const [lo, hi] = (RANGE[gameId] || {})[roles[k].area] || [1, 33];
    const oob = kn.filter((n) => n < lo || n > hi);
    add(oob.length === 0, '②位杀越界', oob.length ? `${k} 越界 ${fmt(oob)}` : '');
  });

  // ③ KILL ∩ DAN / TUO
  const danNums = uniq(danKeys.flatMap((k) => numsOf('dan', get(k))));
  const tuoNums = uniq(tuoKeys.flatMap((k) => numsOf('tuo', get(k))));
  killKeys.forEach((k) => {
    const kn = numsOf(roles[k].role, get(k));
    add(inter(kn, setOf(danNums)).length === 0, '③KILL∩DAN', `${k}=${fmt(kn)}`);
    add(inter(kn, setOf(tuoNums)).length === 0, '③KILL∩TUO', `${k}=${fmt(kn)}`);
  });

  // ④ DAN ⊆ POOL，TUO ⊆ POOL
  if (danNums.length) add(danNums.every((n) => POOL.has(n)), '④DAN⊆POOL', fmt(danNums.filter((n) => !POOL.has(n))));
  if (tuoNums.length) add(tuoNums.every((n) => POOL.has(n)), '④TUO⊆POOL', fmt(tuoNums.filter((n) => !POOL.has(n))));

  // ⑤ DAN ∩ TUO
  if (danNums.length && tuoNums.length) add(inter(danNums, setOf(tuoNums)).length === 0, '⑤DAN∩TUO',
    fmt(inter(danNums, setOf(tuoNums))));

  // ⑥ TIERS 严格递减 + 档位数量不变
  for (let i = 1; i < tiers.length; i++) {
    const small = tiers[i - 1].nums, big = setOf(tiers[i].nums);
    const miss = small.filter((n) => !big.has(n));
    add(miss.length === 0, '⑥TIERS递减', `${tiers[i - 1].k}⊄${tiers[i].k} 缺${fmt(miss)}`);
  }
  tiers.forEach((t) => add(t.nums.length === t.count, '⑥档位数量', `${t.k} 有${t.nums.length}应为${t.count}`));

  // ⑦ REC ∩ KREC（位杀按「该位的推荐」逐位验）
  const krecNums = uniq(killKeys.flatMap((k) => numsOf(roles[k].role, get(k))));
  const recNums = uniq(recKeys.flatMap((k) => numsOf(roles[k].role, get(k))));
  if (recKeys.length && killKeys.length) {
    const paired = killKeys.filter((k) => pairOf(k));
    if (paired.length) {
      paired.forEach((k) => {
        const hit = inter(numsOf(roles[k].role, get(k)), setOf(numsOf('posrec', get(pairOf(k)))));
        add(hit.length === 0, '⑦REC∩KREC', hit.length ? `${k} 撞该位推荐 ${fmt(hit)}` : '');
      });
    } else {
      const hit = inter(recNums, setOf(krecNums));
      add(hit.length === 0, '⑦REC∩KREC', hit.length ? fmt(hit) : '');
    }
  }

  // ⑧ HOT/COLD ⊆ POOL
  if (hotNums.length) add(hotNums.every((n) => POOL.has(n)), '⑧HOT⊆POOL', fmt(hotNums.filter((n) => !POOL.has(n))));
  /* 【方案B】冷号改为「从池外取」（池内=看好→热，池外=没选→冷）。
     所以不再要求 COLD ⊆ POOL，改为只要求「COLD 与 HOT 不重叠」
     （①已查过一次，这里是双保险）。池子占满全区时池外为空，退回池内也允许。*/
  if (coldNums.length) add(inter(coldNums, setOf(hotNums)).length === 0, '⑧COLD∩HOT', fmt(inter(coldNums, setOf(hotNums))));

  // ⑨ 尾数冷热：冷尾的号不能进 主推档（count<=3）
  const wslVals = keys.filter((k) => roles[k].role === 'wsl').map((k) => get(k));
  const coldTails = uniq(wslVals.flatMap(coldTailsOf));
  if (coldTails.length) {
    tiers.filter((t) => t.count <= 3).forEach((t) => {
      const bad = t.nums.filter((n) => coldTails.includes(n % 10));
      add(bad.length === 0, '⑨尾数冷热', `${t.k}(${coldTails.join(',')}尾冷) 含${fmt(bad)}`);
    });
  }

  // ⑩ 同区/邻号/连号/跳连/同尾 ⊆ POOL
  propKeys.forEach((k) => {
    const ns = numsOf(roles[k].role, get(k));
    const bad = ns.filter((n) => !POOL.has(n));
    add(bad.length === 0, '⑩走势号⊆POOL', `${k}=${fmt(ns)} 越界${fmt(bad)}`);
  });

  // ⑪ 遗漏 ⊆ POOL
  omitKeys.forEach((k) => {
    const ns = numsOf(roles[k].role, get(k));
    const bad = ns.filter((n) => !POOL.has(n));
    add(bad.length === 0, '⑪遗漏⊆POOL', `${k}=${fmt(ns)} 越界${fmt(bad)}`);
  });

  // ⑬ 同区「连号」和「跳连号」不能是同一串（两个标签一个内容 = 自相矛盾）
  const lhK = keys.find((k) => roles[k].role === 'lh');
  const tlK = keys.find((k) => roles[k].role === 'tjlh');
  if (lhK && tlK) {
    const a = String(get(lhK) || '').trim();
    const b = String(get(tlK) || '').trim();
    if (a && b) add(a !== b, '⑬连号≠跳连号', a === b ? `两个字段都是 ${a}` : '');
  }

  // ⑫ 走势球数口径：奇偶比/大小比/012路比 必须按「真实球数」
  const expBalls = (() => {
    if (areaKey === 'red') return gameId === 'ssq' ? 6 : undefined;
    if (areaKey === 'front') return gameId === 'dlt' ? 5 : (gameId === 'qxc' ? 1 : undefined);
    if (areaKey === 'main') return { qlc: 7, kl8: 10, fc3d: 1, pl3: 1, pl5: 1 }[gameId];
    if (areaKey === 'blue') return 1;
    if (areaKey === 'back') return gameId === 'dlt' ? 2 : (gameId === 'qxc' ? 1 : undefined);
    return undefined;
  })();
  if (expBalls) {
    const cnt = (s, kind) => {
      const v = String(s || '').trim();
      if (!v) return -1;
      if (kind === '012') {
        if (/^\d+:\d+:\d+$/.test(v)) return v.split(':').reduce((a, b) => a + Number(b), 0);
        return v.split(/\s+/).filter((x) => /路$/.test(x)).length || -1;
      }
      let n = 0; let hit = false;
      for (const m of v.matchAll(/(\d+)(奇|偶|大|小)/g)) { n += Number(m[1]); hit = true; }
      if (!hit && /^\d+:\d+$/.test(v)) return v.split(':').reduce((a, b) => a + Number(b), 0);
      /* 【单球格式】用户要求：蓝球这种只有一个球的区域只写「奇」/「偶」、「大」/「小」，
         不带前面的 1。所以光一个「偶」字就代表 1 个球。 */
      if (!hit && /^(奇|偶|大|小)$/.test(String(v).trim())) return 1;
      return hit ? n : -1;
    };
    const pre = (areaKey === 'blue' || areaKey === 'back') ? 'b_' : '';
    const pairs = [
      [pre + 'jq', 'ratio', '奇偶'],
      [pre + 'dx', 'ratio', '大小'],
      [(areaKey === 'blue' || areaKey === 'back') ? 'b_012' : 'lu012', '012', '012路']
    ];
    pairs.forEach(([k, kind, name]) => {
      if (!String(get(k) || '').trim()) return;   // 该区模板里没有这个字段
      const got = cnt(get(k), kind);
      add(got === expBalls, `⑫${name}球数`, `${k}=${get(k)} 实为${got}应为${expBalls}`);
    });
  }

  return { ok: F.length === 0, F, poolSrc, nFields: keys.length };
}

/* ---------- 收集三个层面的值 ---------- */
function valuesAuto(gid, imgKey) {
  return JSON.parse(vm.runInContext(`JSON.stringify(resolveTemplateValues(${JSON.stringify(gid)},${JSON.stringify(imgKey)},null).values)`, ctx));
}
const savedTickets = JSON.parse(vm.runInContext('JSON.stringify((typeof SAVED_TICKETS!=="undefined"&&SAVED_TICKETS&&SAVED_TICKETS.tickets)||{})', ctx));
const savedTime = vm.runInContext('(typeof SAVED_TICKETS!=="undefined"&&SAVED_TICKETS&&SAVED_TICKETS.updated)||"(无)"', ctx);

function savedImage(gid, imgKey) {
  const byDate = savedTickets[gid];
  if (!byDate) return null;
  const dates = Object.keys(byDate).sort().reverse();
  for (const d of dates) {
    const im = byDate[d] && byDate[d].images;
    if (im && im[imgKey]) return { date: d, vals: im[imgKey] };
  }
  return null;
}
function valuesPage(gid, imgKey, manual) {
  return JSON.parse(vm.runInContext(
    `JSON.stringify(resolveTemplateValues(${JSON.stringify(gid)},${JSON.stringify(imgKey)},${JSON.stringify(manual)}).values)`, ctx));
}

const layerStat = { auto: { bad: 0, areas: 0, checks: 0 }, page: { bad: 0, areas: 0, checks: 0 }, saved: { bad: 0, areas: 0, checks: 0 } };
const perGame = {};
const lines = [];

function runImage(layer, gid, img, values) {
  const roles = rolesOfImage(gid, img);
  const areas = uniq(Object.values(roles).map((r) => r.area));
  areas.forEach((areaKey) => {
    const before = checks;
    const r = checkArea(layer, gid, img.key, areaKey, values, roles);
    if (!r || !r.nFields) return;
    layerStat[layer].areas++;
    layerStat[layer].checks += (checks - before);
    if (!r.ok) {
      layerStat[layer].bad += r.F.length;
      perGame[gid] = (perGame[gid] || 0) + r.F.length;
      failures.push({ layer, gid, img: img.key, areaKey, F: r.F, poolSrc: r.poolSrc });
      lines.push(`  ❌ ${layer.padEnd(5)} ${(GAME_NAME[gid] || gid).padEnd(6)}/${img.key.padEnd(7)} ${areaKey.padEnd(6)} 池=${r.poolSrc.padEnd(14)} ${r.F.join('  ')}`);
    } else {
      lines.push(`  ✅ ${layer.padEnd(5)} ${(GAME_NAME[gid] || gid).padEnd(6)}/${img.key.padEnd(7)} ${areaKey.padEnd(6)} 池=${r.poolSrc.padEnd(14)} ①~⑫ 全过`);
    }
  });
}

for (const gid of Object.keys(T)) {
  T[gid].images.forEach((img) => {
    if (img.sections.some((s) => s.type === 'heatmap')) return;   // 热力图没有号码字段
    const auto = valuesAuto(gid, img.key);
    runImage('auto', gid, img, auto);
    const sv = savedImage(gid, img.key);
    if (sv) {
      runImage('saved', gid, img, sv.vals);
      runImage('page', gid, img, valuesPage(gid, img.key, sv.vals));
    }
  });
}

/* ---------------- 注入式单元测试：证明收尾函数真的会修矛盾 ----------------
   不是「数据刚好没矛盾」，而是往 enforceConsistency 里塞一份故意矛盾的
   字段表，看它能不能修好（防止验收脚本假通过）。 */
const extra = [];
const P = (v) => (String(v == null ? '' : v).match(/\d+/g) || []).map(Number);
const has = (arr, n) => arr.indexOf(n) >= 0;
function runInj(name, gid, areaKey, imgKey, input, expect) {
  let res;
  try {
    res = JSON.parse(vm.runInContext(
      `JSON.stringify(enforceConsistency(${JSON.stringify(gid)},${JSON.stringify(areaKey)},${JSON.stringify(input)},${JSON.stringify(imgKey)}))`, ctx));
  } catch (e) {
    extra.push({ name: '注入测试 ' + name, ok: false, detail: '抛异常 ' + e.message });
    return;
  }
  const problems = expect(res);
  extra.push({ name: '注入测试 ' + name, ok: problems.length === 0, detail: problems.length ? problems.join(' | ') : '矛盾已修好' });
}

runInj('双色球红区 · 热冷重叠+杀号撞池+胆拖越界', 'ssq', 'red', 'main', {
  r20: '01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20',
  r15: '01 02 03 04 05 06 07 08 09 10 11 12 13 14 15',
  r10: '01 02 03 04 05 06 07 08 09 10',
  r3: '03 06 09', r1: '03',
  re: '01 02 25 26 27 28', leng: '01 25 26 29 30 31',
  sh: '01 02 03', dm: '01 21 22', tm: '01 02 23 24 25 26 27',
  lh: '25-26', tjlh: '25-26', wh: '25-26-27', lin: '25 26', tqh: '三区25,26,27',
  maxomit: '25号', ylhb: '25 26 27', wsl: '3尾冷 9尾热'
}, (o) => {
  const bad = [];
  const pool = new Set(P(o.r20));
  if (P(o.r20).length !== 20) bad.push('r20 个数变了');
  if (P(o.r15).some((n) => !pool.has(n))) bad.push('r15 ⊄ r20');
  if (P(o.r10).some((n) => !has(P(o.r15), n))) bad.push('r10 ⊄ r15');
  if (P(o.r3).some((n) => !has(P(o.r10), n))) bad.push('r3 ⊄ r10');
  if (P(o.r1).some((n) => !has(P(o.r3), n))) bad.push('r1 ⊄ r3');
  if (P(o.sh).some((n) => pool.has(n))) bad.push('杀号还在池内 ' + o.sh);
  if (P(o.re).some((n) => !pool.has(n))) bad.push('热号越出池子 ' + o.re);
  if (P(o.leng).some((n) => !pool.has(n))) bad.push('冷号越出池子 ' + o.leng);
  if (P(o.re).some((n) => has(P(o.leng), n))) bad.push('热冷重叠');
  if (P(o.dm).some((n) => !pool.has(n))) bad.push('胆码越出池子 ' + o.dm);
  if (P(o.tm).some((n) => !pool.has(n))) bad.push('拖码越出池子 ' + o.tm);
  if (P(o.dm).some((n) => has(P(o.tm), n))) bad.push('胆拖重叠');
  ['lh', 'tjlh', 'wh', 'lin', 'tqh', 'maxomit', 'ylhb'].forEach((k) => {
    if (P(o[k]).some((n) => !pool.has(n))) bad.push(k + ' 越出池子 ' + o[k]);
  });
  if (String(o.tjlh) === String(o.lh)) bad.push('连号=跳连号 ' + o.lh);
  if (P(o.r3).some((n) => n % 10 === 3) || P(o.r1).some((n) => n % 10 === 3)) bad.push('冷尾(3尾)进了主推档 ' + o.r3 + ' / ' + o.r1);
  if (!String(o.sh).trim() || /—/.test(String(o.sh))) bad.push('杀号为空白/占位');
  return bad;
});

runInj('快乐8 · 杀号撞 30 码池', 'kl8', 'main', 'main', {
  r30: '01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30',
  r24: '01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24',
  r10: '01 02 03 04 05 06 07 08 09 10', r5: '01 02 03 04 05',
  re: '01 02 03 31 32 33', leng: '01 31 32 33 34 35', sh: '29 30 33 34 35'
}, (o) => {
  const bad = [];
  const pool = new Set(P(o.r30));
  if (P(o.sh).some((n) => pool.has(n))) bad.push('杀号还在池内 ' + o.sh);
  if (P(o.re).some((n) => !pool.has(n))) bad.push('热号越出池子 ' + o.re);
  if (P(o.re).some((n) => has(P(o.leng), n))) bad.push('热冷重叠');
  if (P(o.r30).length !== 30) bad.push('r30 个数变了');
  return bad;
});

runInj('池子=全部号（3D 组选 0-9）→ 杀号给中性提示', 'fc3d', 'main', 'main', {
  grp: '00 01 02 03 04 05 06 07 08 09', bai: '00 01 02', shi: '03 04 05', ge: '06 07 08', sh: '01 02 03'
}, (o) => {
  const bad = [];
  if (/—/.test(String(o.sh))) bad.push('杀号变成了 —');
  if (!String(o.sh).trim()) bad.push('杀号为空（render.js 会画成 —）');
  if (P(o.grp).length !== 10) bad.push('组选池个数变了 ' + o.grp);
  return bad;
});

runInj('七星彩 · 每位杀号撞该位推荐', 'qxc', 'front', 'main', {
  p1: '00 01 04 06 07', p2: '01 04 06 07 08', p3: '04 06 07 08 09',
  p4: '00 06 07 08 09', p5: '00 01 07 08 09', p6: '00 01 04 08 09',
  k1: '07 08 09', k2: '00 08 09', k3: '00 01 09', k4: '00 01 04', k5: '01 04 06', k6: '04 06 07'
}, (o) => {
  const bad = [];
  [1, 2, 3, 4, 5, 6].forEach((i) => {
    const rec = P(o['p' + i]);
    const kill = P(o['k' + i]);
    if (kill.some((n) => has(rec, n))) bad.push(`k${i} 撞 p${i}（杀=${kill} 荐=${rec}）`);
    if (kill.some((n) => n > 9)) bad.push(`k${i} 越出 0-9（杀=${kill}）`);
    if (kill.length !== 3) bad.push(`k${i} 个数变了 ${kill.length}`);
  });
  return bad;
});

/* ---------------- 其它回归项 ---------------- */
// 1) 页面不能出现 「—」
['只读分享版.html', '分享包/index.html'].forEach((rel) => {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return;
  const h = fs.readFileSync(fp, 'utf8');
  const n = (h.match(/>—</g) || []).length;
  extra.push({ name: `页面无「—」占位（${rel}）`, ok: n === 0, detail: `>—< 出现 ${n} 次` });
});
// 2) 池子档位数量没变（模板定义 = 实际值里的个数）
{
  let bad = [];
  for (const gid of Object.keys(T)) {
    T[gid].images.forEach((img) => {
      const roles = rolesOfImage(gid, img);
      const vals = valuesAuto(gid, img.key);
      Object.keys(roles).forEach((k) => {
        if (roles[k].role !== 'tier' && roles[k].role !== 'pool') return;
        const got = numsOf(roles[k].role, vals[k]).length;
        if (got !== roles[k].count) bad.push(`${gid}/${img.key}/${k}:${got}≠${roles[k].count}`);
      });
    });
  }
  extra.push({ name: '池子档位数量不变', ok: bad.length === 0, detail: bad.length ? bad.join(' ') : '所有档位个数与模板一致' });
}
// 3) 排列5 前三位 = 排列3
{
  const a = valuesAuto('pl3', 'main');
  const b = valuesAuto('pl5', 'main');
  const ok = String(a.bai) === String(b.wan) && String(a.shi) === String(b.qian) && String(a.ge) === String(b.bai);
  extra.push({ name: '排列5前三位=排列3', ok, detail: ok ? `排三 ${a.bai}|${a.shi}|${a.ge} → 排五 ${b.wan}|${b.qian}|${b.bai}` : `排三 ${a.bai}|${a.shi}|${a.ge} vs 排五 ${b.wan}|${b.qian}|${b.bai}` });
}
// 4) 用户资料优先（红球：30 31 32 → 摇号池最前面就是这三个）
{
  const matRaw = store.get('cdd.materials.v1');
  const injected = JSON.stringify([{ id: 'x', text: '红球：30 31 32', games: ['ssq'], time: '2099-01-01 00:00' }]);
  store.set('cdd.materials.v1', injected);
  const head = JSON.parse(vm.runInContext('JSON.stringify(poolCandidates("ssq","red",20).slice(0,3))', ctx));
  const r20 = JSON.parse(vm.runInContext('JSON.stringify(poolCandidates("ssq","red",20))', ctx));
  const rules = JSON.parse(vm.runInContext('JSON.stringify(materialRulesFor("ssq","red"))', ctx));
  store.set('cdd.materials.v1', matRaw);
  const ok = rules.pick.join(',') === '30,31,32' && head.join(',') === '30,31,32';
  extra.push({
    name: '用户资料优先（红球：30 31 32）',
    ok,
    detail: `解析 pick=[${rules.pick}] 摇号池前3=[${head}] 全长=${r20.length}（资料号必须排最前）`
  });
}
// 4.5) 不能有空值 —— render.js 会把空值画成 「—」
{
  const empties = [];
  for (const gid of Object.keys(T)) {
    T[gid].images.forEach((img) => {
      if (img.sections.some((s) => s.type === 'heatmap')) return;
      const roles = rolesOfImage(gid, img);
      const vals = valuesAuto(gid, img.key);
      const sv = savedImage(gid, img.key);
      const merged = sv ? valuesPage(gid, img.key, sv.vals) : vals;
      Object.keys(roles).forEach((k) => {
        if (roles[k].role === 'wsl') return;
        if (!String(merged[k] || '').trim()) empties.push(`${gid}/${img.key}/${k}`);
      });
    });
  }
  extra.push({ name: '名单类字段无空值（空值会被画成 —）', ok: empties.length === 0, detail: empties.length ? empties.join(' ') : '所有号码/杀号/热冷号字段都有值' });
}
// 5) 空杀号检查：KILL 为空时页面不能出现替代占位
{
  const emptyKill = [];
  for (const gid of Object.keys(T)) {
    T[gid].images.forEach((img) => {
      const roles = rolesOfImage(gid, img);
      const vals = valuesAuto(gid, img.key);
      Object.keys(roles).forEach((k) => {
        if (!/kill/.test(roles[k].role)) return;
        if (!String(vals[k] || '').trim()) emptyKill.push(`${gid}/${img.key}/${k}`);
      });
    });
  }
  extra.push({ name: '杀号为空的情况', ok: true, detail: emptyKill.length ? emptyKill.join(' ') : '没有空杀号' });
}

/* ---------------- 输出 ---------------- */
const out = [];
out.push('════════════════════════════════════════════════════════');
out.push(`  字段一致性验收（tag=${TAG}${NOFIX ? '  --nofix 停用一致性收尾' : ''}）  存档更新时间=${savedTime}`);
out.push('════════════════════════════════════════════════════════');
if (loadErr.length) out.push('⚠️ 加载问题：' + loadErr.join(' | '));
out.push('');
lines.forEach((l) => out.push(l));
out.push('');
out.push('──── 其它回归项 ────');
extra.forEach((e) => out.push(`  ${e.ok ? '✅' : '❌'} ${e.name}${e.detail ? ' —— ' + e.detail : ''}`));
out.push('');
out.push('──── 不变量逐条断言（8 彩种 × 每张图 × auto/saved/page 三层） ────');
Object.keys(codeStat).sort().forEach((code) => {
  const cs = codeStat[code];
  out.push(`  ${code.padEnd(16)} ${String(cs.ok).padStart(4)}/${String(cs.ok + cs.bad).padEnd(4)} ${cs.bad === 0 ? '✅' : '❌'}`);
});
out.push('');
out.push('──── 分层矛盾计数 ────');
Object.keys(layerStat).forEach((l) => {
  out.push(`  ${l.padEnd(5)} 区域=${layerStat[l].areas}  断言=${layerStat[l].checks}  ❌矛盾=${layerStat[l].bad}`);
});
out.push('');
out.push('──── 逐彩种矛盾数 ────');
Object.keys(T).forEach((gid) => {
  out.push(`  ${(GAME_NAME[gid] || gid).padEnd(6)} ${String(perGame[gid] || 0).padStart(4)}`);
});
out.push('');
out.push('──── 池子档位 ────');
poolSizes.forEach((p) => out.push('  ' + p));

const totalBad = layerStat.auto.bad + layerStat.page.bad + layerStat.saved.bad;
out.push('');
out.push(`合计矛盾 = ${totalBad}（auto=${layerStat.auto.bad} page=${layerStat.page.bad} saved=${layerStat.saved.bad}）`);

const text = out.join('\n');
console.log(text);
fs.writeFileSync(path.join(ROOT, `_consistency_${TAG}.txt`), text + '\n', 'utf8');
fs.writeFileSync(path.join(ROOT, `_consistency_${TAG}.json`),
  JSON.stringify({ tag: TAG, totalBad, layerStat, perGame, extra }, null, 1), 'utf8');

/* 改前改后对比 */
const beforeJson = path.join(ROOT, '_consistency_before.json');
if (TAG === 'after' && fs.existsSync(beforeJson)) {
  const b = JSON.parse(fs.readFileSync(beforeJson, 'utf8'));
  const cmp = [];
  cmp.push('');
  cmp.push('════ 修复前 / 修复后 对比 ════');
  const all = uniq(Object.keys(b.perGame).concat(Object.keys(perGame)));
  all.forEach((gid) => {
    const x = b.perGame[gid] || 0, y = perGame[gid] || 0;
    cmp.push(`  ${(GAME_NAME[gid] || gid).padEnd(6)} ${String(x).padStart(4)} → ${String(y).padStart(4)}  ${y === 0 ? '✅' : '❌'}`);
  });
  cmp.push(`  ${'合计'.padEnd(6)} ${String(b.totalBad).padStart(4)} → ${String(totalBad).padStart(4)}  ${totalBad === 0 ? '✅' : '❌'}`);
  const ct = cmp.join('\n');
  console.log(ct);
  fs.appendFileSync(path.join(ROOT, `_consistency_${TAG}.txt`), ct + '\n', 'utf8');
}
process.exitCode = totalBad ? 1 : 0;
