/* ============================================================
   expert-pool.js —— 专家数据接入层
   ------------------------------------------------------------
   数据来源：experts-data.js（由 build-experts.mjs 抓取一起彩生成）

   作用：
     1. 给各彩种提供「专家号码池」（红球/前区 20 码 + 蓝球/后区）
     2. 提供「稳定专家」列表给界面展示
     3. 把专家池转成模板需要的字段格式

   ⚠️ 说明：本模块只做历史数据统计归纳，不是预测。
      彩票每期独立随机，任何分析都不能提高中奖概率。
   ============================================================ */

/* ------------------------------------------------------------
   彩种编号对照
   ------------------------------------------------------------
   程序内部（games.js / templates.js / stats.js）用的编号，
   和 build-experts.mjs 抓下来的编号有两处不一样：
     程序 kl8（快乐8）   ←→ 专家数据 klb
     程序 qxc（七星彩）  ←→ 专家数据 xqxc
   这里统一在入口处转一次，其它地方不用管。
   ------------------------------------------------------------ */
const EXPERT_GAME_ID = { kl8: 'klb', qxc: 'xqxc' };

/** 程序编号 → 专家数据编号 */
function expertGameIdOf(gameId) {
  return EXPERT_GAME_ID[gameId] || gameId;
}

/** 取原始专家数据 */
function getExpertsData() {
  try {
    if (typeof EXPERTS_DATA === 'undefined' || !EXPERTS_DATA) return null;
    return EXPERTS_DATA;
  } catch (e) { return null; }
}

/** 取某彩种的专家数据（自动做编号映射） */
function expertsFor(gameId) {
  const d = getExpertsData();
  if (!d || !d.games) return null;
  const id = expertGameIdOf(gameId);
  return d.games[id] || d.games[gameId] || null;
}

/** 是否已有专家数据 */
function expertsReady(gameId) {
  const g = expertsFor(gameId);
  if (!g) return false;
  const p = g.pool || {};
  return !!(p.red && p.red.length) || !!(p.blue && p.blue.length);
}

/**
 * 取专家号码池
 * @returns {{red:number[], blue:number[], front:number[], back:number[], main:number[]}}
 */
function expertPool(gameId) {
  const g = expertsFor(gameId);
  const p = (g && g.pool) || {};
  return {
    red: Array.isArray(p.red) ? p.red.slice() : [],
    blue: Array.isArray(p.blue) ? p.blue.slice() : [],
    front: Array.isArray(p.front) ? p.front.slice() : (Array.isArray(p.red) ? p.red.slice() : []),
    back: Array.isArray(p.back) ? p.back.slice() : (Array.isArray(p.blue) ? p.blue.slice() : []),
    main: Array.isArray(p.main) ? p.main.slice() : []
  };
}

/* ============================================================
   号码区 → 池子取数
   ------------------------------------------------------------
   红球 / 前区 / 主号 统一取 pool.red
   蓝球 / 后区        统一取 pool.blue
   ============================================================ */

/** 该号码区对应池子里的哪个键 */
function expertPoolKeyOf(areaKey) {
  return (areaKey === 'blue' || areaKey === 'back') ? 'blue' : 'red';
}

/** 取某区专家池（原始顺序） */
function expertPoolList(gameId, areaKey) {
  const p = expertPool(gameId);
  const arr = expertPoolKeyOf(areaKey) === 'blue' ? p.blue : p.red;
  return arr.filter((n) => Number.isInteger(n));
}

/** 该区是否有可用的专家池 */
function expertPoolUsable(gameId, areaKey) {
  return expertPoolList(gameId, areaKey).length > 0;
}

/**
 * 号码 → 共识度（百分比）
 *   共识列表里同一个号可能出现多次（3D / 排3 是分位统计），取最大值
 * @returns {Map<number, number>}
 */
function expertPctMap(gameId, areaKey) {
  const cons = expertConsensus(gameId);
  const arr = (expertPoolKeyOf(areaKey) === 'blue' ? cons.blue : cons.red) || [];
  const map = new Map();
  arr.forEach((x) => {
    if (!x || !Number.isInteger(x.num) || !Number.isFinite(x.pct)) return;
    const prev = map.get(x.num);
    if (prev === undefined || x.pct > prev) map.set(x.num, x.pct);
  });
  return map;
}

/**
 * 专家池「按共识度排序」后的号码表
 *   · 共识列表里能对上号的 → 按 pct 从高到低排在前面
 *   · 对不上的（网站隐藏了号码）→ 保持 pool 里的原始顺序接在后面
 *     没有共识数据时，就完全是 pool 的原始顺序
 * @returns {number[]}
 */
function expertPoolOrdered(gameId, areaKey) {
  const pool = expertPoolList(gameId, areaKey);
  if (!pool.length) return [];

  const pct = expertPctMap(gameId, areaKey);
  const idxOf = new Map(pool.map((n, i) => [n, i]));

  const matched = [...pct.keys()]
    .filter((n) => idxOf.has(n))
    .sort((a, b) => (pct.get(b) - pct.get(a)) || (idxOf.get(a) - idxOf.get(b)));

  const used = new Set(matched);
  const rest = pool.filter((n) => !used.has(n));
  return matched.concat(rest);
}

/** 按共识度取前 n 个（不足就返回全部，由调用方补齐） */
function expertPoolTake(gameId, areaKey, n) {
  return expertPoolOrdered(gameId, areaKey).slice(0, Math.max(0, n || 0));
}

/**
 * 号码池基底：长度固定为 total 的号码表
 *   前面是专家池（按共识度排序），不够 total 时：
 *     1) 先用 fillFn(还差几个) 的返回值补（调用方传原算法）
 *     2) 还不够就在 [from,to] 里随机补
 *   注意：这里只保证「号码集合」，显示顺序由调用方决定。
 *
 * @param {string} gameId
 * @param {string} areaKey
 * @param {number} total     需要的个数（如 20 / 22 / 30）
 * @param {number} from      号码区下限（补齐时用）
 * @param {number} to        号码区上限
 * @param {function(number):number[]} [fillFn]  补齐函数，参数=还差几个
 * @returns {number[]|null}  没有专家池时返回 null（调用方走原算法）
 */
function expertPoolBase(gameId, areaKey, total, from, to, fillFn) {
  const ordered = expertPoolOrdered(gameId, areaKey);
  if (!ordered.length) return null;

  const lo = Number.isInteger(from) ? from : 1;
  const hi = Number.isInteger(to) ? to : 80;
  const size = hi - lo + 1;
  const want = Math.max(1, Math.min(total || 1, size));

  const out = [];
  const have = new Set();
  const push = (n) => {
    if (!Number.isInteger(n)) return;
    if (n < lo || n > hi) return;
    if (have.has(n)) return;
    have.add(n);
    out.push(n);
  };

  ordered.forEach(push);

  if (out.length < want && typeof fillFn === 'function') {
    try { (fillFn(want - out.length) || []).forEach(push); } catch (e) { /* 忽略 */ }
  }

  if (out.length < want) {
    const rest = [];
    for (let i = lo; i <= hi; i++) if (!have.has(i)) rest.push(i);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = rest[i]; rest[i] = rest[j]; rest[j] = t;
    }
    rest.slice(0, want - out.length).forEach(push);
  }

  return out.slice(0, want);
}

/**
 * 号码池分档（胆码 / 拖码 / 杀号 用）
 *   档位 = 共识度排序后的位置：
 *     最前面几个 = 共识度最高 → 胆码
 *     中间一段   = 拖码
 *     最后几个   = 共识度最低 → 杀号
 * @returns {{dan:number[], tuo:number[], kill:number[]}}
 */
function expertPoolGrades(gameId, areaKey, danN, tuoN, killN) {
  const ordered = expertPoolOrdered(gameId, areaKey);
  const dn = Math.max(0, danN === undefined ? 3 : danN);
  const tn = Math.max(0, tuoN === undefined ? 7 : tuoN);
  const kn = Math.max(0, killN === undefined ? 3 : killN);
  return {
    dan: ordered.slice(0, dn),
    tuo: ordered.slice(dn, dn + tn),
    kill: ordered.slice(Math.max(0, ordered.length - kn)).reverse()
  };
}

/** 取稳定专家列表（已按评分排序） */
function expertStableList(gameId, limit) {
  const g = expertsFor(gameId);
  const arr = (g && g.stable) || [];
  const sorted = arr.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
  return limit ? sorted.slice(0, limit) : sorted;
}

/** 取专家共识（百分比） */
function expertConsensus(gameId) {
  const g = expertsFor(gameId);
  return (g && g.consensus) || { red: [], blue: [] };
}

/** 专家数据是否过期（超过 30 小时） */
function expertsStale() {
  const d = getExpertsData();
  if (!d || !d.updated) return true;
  const t = new Date(String(d.updated).replace(' ', 'T')).getTime();
  if (isNaN(t)) return true;
  return (Date.now() - t) > 30 * 3600 * 1000;
}

/**
 * 把专家池转成「号码池」字段值（空格分隔的两位数字符串）
 * 模板里的号码池字段形如：{ r20: '01 02 03 ...', b6: '04 11 ...' }
 *
 * @param {string} gameId
 * @param {object} spec  { redKey, blueKey, redCount, blueCount }
 * @returns {object}  { [key]: '01 02 ...' }
 */
function expertPoolFields(gameId, spec) {
  const s = spec || {};
  const pool = expertPool(gameId);
  const out = {};
  const p2 = (n) => String(n).padStart(2, '0');

  const redKey = s.redKey || 'r20';
  const redCount = s.redCount || 20;
  if (pool.red.length) {
    out[redKey] = pool.red.slice(0, redCount).map(p2).join(' ');
  }

  if (s.blueKey) {
    const blueCount = s.blueCount || 2;
    if (pool.blue.length) {
      out[s.blueKey] = pool.blue.slice(0, blueCount).map(p2).join(' ');
    }
  }
  return out;
}

/* ============================================================
   界面：稳定专家面板
   ============================================================ */
function renderExpertPanel(container, gameId) {
  const box = document.createElement('div');
  box.className = 'panel';

  const g = expertsFor(gameId);
  const h3 = document.createElement('h3');
  h3.innerHTML = '稳定专家 <span class="hint">一起彩 · 按历史战绩筛选</span>';
  box.appendChild(h3);

  if (!g) {
    const n = document.createElement('div');
    n.className = 'tk-note';
    n.innerHTML = '还没有该彩种的专家数据。<br>请运行 <code>build-experts.mjs</code> 抓取。';
    box.appendChild(n);
    container.appendChild(box);
    return;
  }

  const d = getExpertsData();
  const note = document.createElement('div');
  note.className = 'tk-note';
  note.style.marginBottom = '12px';
  note.innerHTML =
    /* 【用户要求】所有「数据来源/来自网络」字样都不显示 —— 只留统计信息和免责。 */
    /* __NO_UPDATED__ 用户要求删掉「更新于」 */ '' +
    `共分析 <b>${g.expertCount || 0}</b> 位专家，筛出 <b>${(g.stable || []).length}</b> 位稳定专家<br>` +
    `<span style="color:#f0b429">稳定性 = 近10期命中率 + 最长连红 + 黑一次马上红 + 上一期是否红</span><br>` +
    `<span style="color:#6b7488">⚠️ 只是历史统计归纳，不是预测，不能提高中奖概率</span>`;
  box.appendChild(note);

  /* 号码池 */
  const pool = expertPool(gameId);
  const poolRow = (label, arr) => {
    if (!arr || !arr.length) return '';
    return `<div class="ai-nums"><span class="ai-numlabel">${label}</span>` +
      arr.map((n) => `<span class="ai-ball main">${String(n).padStart(2, '0')}</span>`).join('') +
      `</div>`;
  };
  const poolBox = document.createElement('div');
  poolBox.className = 'ai-block';
  poolBox.style.marginBottom = '14px';
  poolBox.innerHTML =
    `<div class="ai-title">专家号码池</div>` +
    poolRow('红球/前区', pool.red) +
    poolRow('蓝球/后区', pool.blue) +
    poolRow('主号', pool.main);
  box.appendChild(poolBox);

  /* 稳定专家表 */
  const list = expertStableList(gameId, 15);
  if (list.length) {
    const t = document.createElement('div');
    t.style.cssText = 'margin-top:6px;';
    let html = '<div class="ex-table">' +
      '<div class="ex-row ex-head">' +
      '<span class="ex-c1">专家</span>' +
      '<span class="ex-c2">近10中</span>' +
      '<span class="ex-c3">最长连红</span>' +
      '<span class="ex-c4">当前连红</span>' +
      '<span class="ex-c5">黑后回红</span>' +
      '<span class="ex-c6">上期</span>' +
      '<span class="ex-c7">评分</span>' +
      '</div>';
    list.forEach((e) => {
      const rr = (e.recoverRate === null || e.recoverRate === undefined)
        ? '—' : Math.round(e.recoverRate * 100) + '%';
      html += '<div class="ex-row">' +
        `<span class="ex-c1">${e.name || '?'}</span>` +
        `<span class="ex-c2">${Math.round((e.hitRate10 || 0) * 10)}/10</span>` +
        `<span class="ex-c3">${e.maxStreak || 0}</span>` +
        `<span class="ex-c4">${e.curStreak || 0}</span>` +
        `<span class="ex-c5">${rr}</span>` +
        `<span class="ex-c6">${e.lastHit ? '<b style="color:#f0575c">红</b>' : '<b style="color:#6b7488">黑</b>'}</span>` +
        `<span class="ex-c7">${(e.score || 0).toFixed(1)}</span>` +
        '</div>';
    });
    html += '</div>';
    t.innerHTML = html;
    box.appendChild(t);
  }

  /* 共识百分比 */
  const cons = expertConsensus(gameId);
  if ((cons.red && cons.red.length) || (cons.blue && cons.blue.length)) {
    const c = document.createElement('div');
    c.className = 'ai-block';
    c.style.marginTop = '14px';
    const rows = (label, arr) => {
      if (!arr || !arr.length) return '';
      return `<div class="ai-title" style="font-size:13px">${label}（按专家选号比例）</div>` +
        arr.slice(0, 12).map((x) =>
          `<div class="ex-cons"><span class="ex-consnum">${x.num === null || x.num === undefined ? '（网站隐藏）' : String(x.num).padStart(2, '0')}</span>` +
          `<span class="ex-consbar"><i style="width:${Math.min(100, x.pct)}%"></i></span>` +
          `<span class="ex-conspct">${x.pct}%</span></div>`
        ).join('');
    };
    c.innerHTML = rows('红球/前区', cons.red) + rows('蓝球/后区', cons.blue);
    box.appendChild(c);
  }

  container.appendChild(box);
}
