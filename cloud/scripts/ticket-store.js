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
  try {
    const raw = localStorage.getItem(TICKET_KEY);
    if (raw) fromLocal = JSON.parse(raw);
  } catch (e) { /* 忽略 */ }

  const fromFile = fileTickets();

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
  const stat = { games: 0, images: 0, fields: 0, skipped: 0, rolled: 0 };

  if (typeof TEMPLATES === 'undefined' || typeof GAMES === 'undefined') return stat;

  Object.keys(TEMPLATES).forEach((gameId) => {
    const tpl = TEMPLATES[gameId];
    if (!tpl) return;
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
          sec.fields.forEach((f) => spec.push({ key: f.key, label: f.label, count: cnt, areaKey }));
        }
        if (Array.isArray(sec.rows)) {
          const isKill = /杀号/.test(joined);
          const counts = sec.rows.map((r) => r.count);
          const isPool = counts.length >= 3 && !isKill;
          if (isPool) {
            const biggest = sec.rows.reduce((a, b) => (a.count >= b.count ? a : b));
            const picks = rollPicks(gameId, areaKey, biggest.count).sort((a, b) => a - b);
            sec.rows.forEach((r) => {
              spec.push({ key: r.key, fixedValue: picks.slice(0, r.count).map(pad2).join(' ') });
            });
          } else {
            sec.rows.forEach((r) => spec.push({ key: r.key, label: r.label, count: r.count, areaKey }));
          }
        }
        if (Array.isArray(sec.positions)) {
          if (sec.groupRow) spec.push({ key: sec.groupRow.key, label: sec.groupLabel || '组选', count: sec.groupRow.count, areaKey });
          sec.positions.forEach((p) => spec.push({ key: p.key, label: p.label, count: p.count, areaKey }));
        }
        if (Array.isArray(sec.items)) {
          sec.items.forEach((it) => spec.push({ key: it.key, label: it.label, count: 6, areaKey }));
        }
        if (sec.bigBall) spec.push({ key: sec.bigBall.key, label: sec.bigBall.label || '主推', count: 1, areaKey });
        if (sec.bigBalls) spec.push({ key: sec.bigBalls.key, label: '主推', count: sec.bigBalls.count || 2, areaKey });
        if (Array.isArray(sec.groups)) {
          sec.groups.forEach((g) => {
            const ranks = (typeof hotRankStrings === 'function') ? hotRankStrings(gameId, areaKey, g.count || 6, 30) : [];
            ranks.forEach((v, i) => spec.push({ key: `${g.label}_${i}`, fixedValue: v }));
          });
        }
        if (Array.isArray(sec.elements)) {
          sec.elements.forEach((e) => spec.push({ key: e.key, label: e.name, count: 6, areaKey }));
        }
        if (sec.centerKey) spec.push({ key: sec.centerKey, label: '中心数', count: 1, areaKey });
        if (Array.isArray(sec.footer)) {
          sec.footer.forEach((f) => spec.push({ key: f.key, label: f.label, count: 6, areaKey }));
        }
        if (Array.isArray(sec.badges)) {
          sec.badges.forEach((b) => spec.push({ key: b.key, label: b.label, count: 1, areaKey }));
        }
        if (Number.isInteger(sec.rows) && sec.cols) {
          const total = sec.cols * sec.rows;
          const picks = rollPicks(gameId, areaKey, total);
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
          key: s.key, label: s.label, count: s.count, areaKey: s.areaKey
        });
        stat.fields++;
      });

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
function rollValueFor(gameId, spec) {
  const label = spec.label || '';
  const areaKey = spec.areaKey || 'main';
  const [from, to] = areaRangeOf(gameId, areaKey);
  const count = spec.count || 1;

  // 1) 和值
  if (label.includes('和值')) return rollSumRange(gameId, areaKey, count);

  // 2) 跨度
  if (label.includes('跨度')) return rollSpanRange(gameId, areaKey, count);

  // 3) 奇偶：先摇推荐号，再由它推导（保证一致）
  if (label.includes('奇偶')) {
    const picks = rollPicks(gameId, areaKey, count);
    return deriveFromList(picks, from, to).oddEven;
  }

  // 4) 大小：同上
  if (label.includes('大小')) {
    const picks = rollPicks(gameId, areaKey, count);
    return deriveFromList(picks, from, to).bigSmall;
  }

  // 5) 012 路：同上
  if (label.includes('012')) {
    const picks = rollPicks(gameId, areaKey, count);
    return deriveFromList(picks, from, to).route012;
  }

  // 6) 热号/冷号/邻号等：从近 30 期真实值里随机取一条
  const REAL_LABELS = ['热号', '冷号', '邻号', '同尾号', '连号', '跳连号',
                       '重复号', '同区号', '尾数冷热', '最大遗漏', '遗漏回补',
                       '质数/合数', '区间比'];
  if (REAL_LABELS.some((k) => label.includes(k))) {
    const hist = (typeof getHistory === 'function') ? getHistory(gameId) : [];
    const trendKey = {
      '热号': 're', '冷号': 'leng', '邻号': 'lin', '同尾号': 'wh',
      '连号': 'lh', '跳连号': 'tjlh', '重复号': 'cf', '同区号': 'tqh',
      '尾数冷热': 'wsl', '最大遗漏': 'maxomit', '遗漏回补': 'ylhb',
      '质数/合数': 'zhs', '区间比': 'qjb'
    }[Object.keys({
      '热号': 1, '冷号': 1, '邻号': 1, '同尾号': 1, '连号': 1, '跳连号': 1,
      '重复号': 1, '同区号': 1, '尾数冷热': 1, '最大遗漏': 1, '遗漏回补': 1,
      '质数/合数': 1, '区间比': 1
    }).find((k) => label.includes(k))];

    if (trendKey && typeof calcTrendFields === 'function' && hist.length) {
      const v = calcTrendFields(gameId, areaKey, from, to, count)[trendKey];
      if (v) return v;
    }
  }

  // 7) 号码类：随机抽 count 个
  return rollPicks(gameId, areaKey, count).map(pad2).join(' ');
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
      msg.textContent = '已下载，放到 D:\\春风十里送大奖\\ 目录（覆盖原文件）';
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
    '2. 把它放到 <b>D:\\春风十里送大奖\\</b> 目录（覆盖原来的）<br>' +
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
    dice.title = '随机摇一个';
    dice.textContent = '🎲';
    dice.addEventListener('click', () => {
      inp.value = rollValueFor(gameId, {
        key: spec.key,
        label: spec.label,
        count: spec.count,
        areaKey
      });
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
      const ak = areaKeyOf(sec);
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
          inputMeta[`${g.label}_${i}`] = { label: g.label, count: g.count, areaKey: ak, isRank: true };
          fixedKeys.add(`${g.label}_${i}`);

          const dice = document.createElement('button');
          dice.className = 'tk-dice';
          dice.type = 'button';
          dice.title = '从真实排行里摇一个';
          dice.textContent = '🎲';
          dice.addEventListener('click', () => {
            const ranks = (typeof hotRankStrings === 'function')
              ? hotRankStrings(gameId, ak, g.count || 6, HIST_PERIODS)
              : [];
            inp.value = ranks.length
              ? ranks[ri(0, ranks.length - 1)]
              : '';
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
    Object.keys(inputs).forEach((k) => {
      // 热号排行不参与随机，保持真实统计值
      if (fixedKeys.has(k)) return;

      const meta = inputMeta[k] || {};
      inputs[k].value = rollValueFor(gameId, {
        key: k,
        label: meta.label,
        count: meta.count,
        areaKey: meta.areaKey,
        itemLabel: meta.itemLabel
      });
      n++;
    });
    msg.style.color = '#f0b429';
    msg.textContent = `已随机 ${n} 个字段（热号排行保持真实值）`;
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
