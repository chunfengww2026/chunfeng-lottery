/* ============================================================
   fb-page.js —— 足球赛事页面逻辑（只显示竞猜场次）
   ------------------------------------------------------------
   数据来源：
     jc-data.js    —— 体彩竞彩【在售】比赛
     jc-history.js —— 竞彩【已完场】累积记录（可选；没有就只用在售的）

   【为什么要有 jc-history】在售列表只含还能买的比赛，一开完赛就
   从列表里消失 —— 所以「已完场」如果只读 jc-data 会永远是 0 场。
   build-jc.mjs 每跑一次就把打完的比赛归档进 jc-history.js，
   这里把两边合并，已完场才真的能累积。

   本文件把 jc-data 的结构适配成页面需要的形状：
     gid, kind, league{name}, time, minute,
     home{name,score,rank}, away{name,score,rank},
     odds{asian,europe,overunder}, reco{...}, result{hit,...}
   ============================================================ */

/** 取竞彩原始数据 */
function getJcData() {
  try {
    if (typeof JC_DATA === 'undefined' || !JC_DATA) return null;
    return JC_DATA;
  } catch (e) { return null; }
}

/** 取已完场累积记录（jc-history.js 没加载时返回空） */
function getJcHistory() {
  try {
    if (typeof JC_HISTORY === 'undefined' || !JC_HISTORY) return null;
    return JC_HISTORY;
  } catch (e) { return null; }
}

/** 欧赔反推概率（老历史记录可能没存 prob） */
function probFromOdds(odds) {
  if (!odds) return null;
  const h = +odds.home, d = +odds.draw, a = +odds.away;
  if (!(h > 0) || !(d > 0) || !(a > 0)) return null;
  const raw = { home: 1 / h, draw: 1 / d, away: 1 / a };
  const sum = raw.home + raw.draw + raw.away;
  if (!sum) return null;
  return {
    home: +(raw.home / sum * 100).toFixed(1),
    draw: +(raw.draw / sum * 100).toFixed(1),
    away: +(raw.away / sum * 100).toFixed(1)
  };
}

/** 一条历史归档记录 → jc-data 里一场的形状 */
function historyGame(rec) {
  const m = /^(\d+)\s*[:：-]\s*(\d+)$/.exec(String(rec.score || ''));
  const hs = m ? +m[1] : null;
  const as_ = m ? +m[2] : null;
  const hasScore = hs !== null && as_ !== null;
  const pick = rec.pick || '';

  return {
    gid: 'hist-' + (rec.code || '') + '-' + String(rec.time || '').replace(/\D/g, ''),
    code: rec.code || '',
    league: rec.league || '',
    round: '',
    time: rec.time || '',
    handicap: rec.hc != null ? rec.hc : null,
    home: { name: rec.home || '?', rank: null },
    away: { name: rec.away || '?', rank: null },
    score: hasScore ? { home: hs, away: as_ } : null,
    liveScore: null,
    status: 'finished',
    minute: 0,
    odds: rec.odds ? { europe: { open: null, live: rec.odds } } : null,
    reco: pick ? {
      pick,
      label: rec.pickLabel || { home: '主胜', draw: '平局', away: '客胜' }[pick] || '',
      confidence: rec.conf != null ? rec.conf : null,
      prob: rec.prob || probFromOdds(rec.odds),
      clear: false, margin: null, fromHistory: true
    } : null
  };
}

/** 归一化后的「主队|客队@日期」——用来判断历史里的场次是不是已经在在售列表里 */
function pairKey(g) {
  const clean = (s) => String(s || '').replace(/[\s\-·.()（）]/g, '').toLowerCase();
  const h = clean(g && g.home && g.home.name);
  const a = clean(g && g.away && g.away.name);
  if (!h || !a) return '';
  return [h, a].sort().join('|') + '@' + String(g.time || '').slice(0, 10);
}

/**
 * 全部比赛 = jc-data 在售 + jc-history 已完场（去重）
 * 页面其余部分一律走这里，保证「已完场」能累积。
 */
function allJcGames() {
  const d = getJcData();
  if (!d || !Array.isArray(d.games)) return [];

  const out = d.games.slice();
  const seen = new Set();
  out.forEach((g) => { const k = pairKey(g); if (k) seen.add(k); });
  const codes = new Set(out.map((g) => String(g.code || '')).filter(Boolean));

  const h = getJcHistory();
  if (h && Array.isArray(h.list)) {
    h.list.forEach((rec) => {
      if (!rec) return;
      const g = historyGame(rec);
      const k = pairKey(g);
      /* 在售列表里已经有这场（同编号或同队名+日期）就不重复显示 */
      if (g.code && codes.has(g.code)) return;
      if (k && seen.has(k)) return;
      if (k) seen.add(k);
      if (g.code) codes.add(g.code);
      out.push(g);
    });
  }
  return out;
}

/** 把一场竞彩数据适配成页面用的形状 */
function adaptJc(g) {
  const kind = g.status || 'upcoming';

  /* 比分优先级：liveScore > score */
  let hs = null, as_ = null;
  if (g.liveScore && g.liveScore.home !== null && g.liveScore.home !== undefined) {
    hs = g.liveScore.home; as_ = g.liveScore.away;
  } else if (g.score && g.score.home !== null && g.score.home !== undefined) {
    hs = g.score.home; as_ = g.score.away;
  }
  const hasScore = hs !== null && hs !== undefined && as_ !== null && as_ !== undefined;

  /* 判定结果（完场才有红黑） */
  let result = null;
  if (hasScore && kind === 'finished') {
    const actual = hs > as_ ? 'home' : (hs === as_ ? 'draw' : 'away');
    const actualLabel = actual === 'home' ? '主胜' : (actual === 'draw' ? '平局' : '客胜');
    result = {
      actual, actualLabel,
      hit: !!(g.reco && g.reco.pick === actual),
      score: hs + ' - ' + as_
    };
  }

  return {
    gid: g.gid,
    fid: g.fid,
    code: g.code,
    kind,
    league: { name: g.league || '' },
    round: g.round || '',
    time: g.time,
    minute: g.minute || 0,
    handicap: g.handicap || null,
    home: { name: g.home ? g.home.name : '?', score: hs, rank: g.home ? g.home.rank : null },
    away: { name: g.away ? g.away.name : '?', score: as_, rank: g.away ? g.away.rank : null },
    odds: g.odds,
    reco: g.reco,
    result,
    hasScore,
    fromHistory: !!(g.reco && g.reco.fromHistory)
  };
}

/** 取某一状态的比赛列表 */
function footballList(kind) {
  return allJcGames()
    .filter((g) => (g.status || 'upcoming') === kind)
    .map(adaptJc)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

/** 统计数据 */
function footballStat() {
  const ms = allJcGames().map(adaptJc);
  const st = {
    total: ms.length,
    upcoming: 0, live: 0, finished: 0,
    settled: 0, hit: 0, miss: 0, rate: '0.0'
  };
  ms.forEach((m) => {
    st[m.kind] = (st[m.kind] || 0) + 1;
    if (m.kind === 'finished' && m.result) {
      st.settled++;
      if (m.result.hit) st.hit++; else st.miss++;
    }
  });
  st.rate = st.settled ? ((st.hit / st.settled) * 100).toFixed(1) : '0.0';
  return st;
}

/** 更新时间（在售时间和归档时间里取较新的） */
function footballUpdated() {
  const d = getJcData();
  const h = getJcHistory();
  const arr = [d && d.updated, h && h.updated].filter(Boolean).sort();
  return arr.length ? arr[arr.length - 1] : null;
}

/* 兼容旧调用 */
function getFootballData() {
  const d = getJcData();
  if (!d) return null;
  return {
    updated: footballUpdated(),
    stat: footballStat(),
    lists: {
      upcoming: footballList('upcoming'),
      live: footballList('live'),
      finished: footballList('finished')
    }
  };
}

/* ============================================================
   小工具
   ============================================================ */

function timeHM(dt) {
  const m = /(\d{2}):(\d{2})/.exec(dt || '');
  return m ? `${m[1]}:${m[2]}` : '';
}

function dateMD(dt) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(dt || '');
  return m ? `${m[2]}-${m[3]}` : '';
}

function weekCN(dt) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(dt || '');
  if (!m) return '';
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
}

function pctText(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return '—';
  return (pct > 0 ? '+' : '') + pct + '%';
}

function pctClass(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return 'fv-flat';
  if (pct > 0) return 'fv-up';
  if (pct < 0) return 'fv-down';
  return 'fv-flat';
}

/* ============================================================
   列表
   ============================================================ */

function renderFootballList(container, games, onPick) {
  container.innerHTML = '';

  if (!games.length) {
    container.innerHTML = '<div class="empty">这个分类下暂时没有比赛</div>';
    return;
  }

  const byDate = new Map();
  games.forEach((g) => {
    const d = dateMD(g.time) || '未知';
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(g);
  });

  [...byDate.keys()].sort().forEach((date) => {
    const arr = byDate.get(date);
    const head = document.createElement('div');
    head.className = 'fb-datehead';
    head.innerHTML =
      `<span>${date}</span>` +
      `<span class="fb-week">${weekCN(arr[0].time)}</span>` +
      `<span class="fb-cnt">${arr.length} 场</span>`;
    container.appendChild(head);

    arr.forEach((g) => container.appendChild(renderFootballRow(g, onPick)));
  });
}

function renderFootballRow(g, onPick) {
  const row = document.createElement('div');
  row.className = 'fb-row';
  row.dataset.gid = g.gid;

  /* 联赛 */
  const left = document.createElement('div');
  left.className = 'fb-left';
  const lg = document.createElement('div');
  lg.className = 'fb-league';
  lg.textContent = g.league ? g.league.name : '';
  if (g.league && g.league.color) lg.style.color = '#' + g.league.color;
  left.appendChild(lg);
  row.appendChild(left);

  /* 时间 / 进行中分钟 */
  const mid = document.createElement('div');
  mid.className = 'fb-time';
  if (g.kind === 'live' && g.minute) {
    mid.textContent = g.minute + "'";
    mid.style.color = '#f0575c';
    mid.style.fontWeight = '700';
  } else {
    mid.textContent = timeHM(g.time);
  }
  row.appendChild(mid);

  /* 对阵 + 比分 */
  const score = document.createElement('div');
  score.className = 'fb-score';

  const h = document.createElement('span');
  h.className = 'fb-team home';
  h.appendChild(document.createTextNode((g.home && g.home.name) || '?'));
  score.appendChild(h);

  const sc = document.createElement('span');
  sc.className = 'fb-vs';
  if (g.home && g.home.score !== null && g.home.score !== undefined) {
    sc.textContent = `${g.home.score} - ${g.away.score}`;
    sc.classList.add('has-score');
  } else {
    sc.textContent = 'VS';
  }
  score.appendChild(sc);

  const a = document.createElement('span');
  a.className = 'fb-team away';
  a.appendChild(document.createTextNode((g.away && g.away.name) || '?'));
  score.appendChild(a);

  row.appendChild(score);

  /* 欧赔 */
  const right = document.createElement('div');
  right.className = 'fb-odds';
  const eu = g.odds && g.odds.europe;
  const euV = eu && (eu.live || eu.open);
  if (euV) {
    right.innerHTML = `<span>${euV.home ?? '—'}</span><span>${euV.draw ?? '—'}</span><span>${euV.away ?? '—'}</span>`;
  } else {
    right.innerHTML = '<span class="fb-noodds">无赔率</span>';
  }
  row.appendChild(right);

  /* 推荐 + 红黑 */
  const reco = g.reco;
  if (reco) {
    const tag = document.createElement('span');
    const res = g.result;
    tag.className = 'fb-reco' + (res ? (res.hit ? ' hit' : ' miss') : (reco.clear ? ' clear' : ''));

    if (res) {
      tag.innerHTML = `推 <b>${reco.label}</b> <i>${res.hit ? '红' : '黑'}</i>`;
      tag.title = `${reco.label} 信心 ${reco.confidence}%\n实际：${res.actualLabel}（${res.score}）\n${res.hit ? '✅ 命中' : '❌ 未中'}`;
    } else {
      tag.innerHTML = `推 <b>${reco.label}</b> <i>${reco.confidence}%</i>`;
      tag.title = `主胜 ${reco.prob.home}% / 平局 ${reco.prob.draw}% / 客胜 ${reco.prob.away}%`;
    }
    row.appendChild(tag);
  }

  /* 看指数按钮 */
  const idxBtn = document.createElement('button');
  idxBtn.className = 'fb-idxbtn';
  idxBtn.type = 'button';
  idxBtn.textContent = '指数';
  idxBtn.title = '查看欧赔 / 亚盘 / 大小球';
  idxBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();          // 别触发整行的点击
    if (onPick) onPick(g);
  });
  row.appendChild(idxBtn);

  row.addEventListener('click', () => { if (onPick) onPick(g); });
  return row;
}

/* ============================================================
   详情
   ============================================================ */

function oddsTable(title, rows) {
  const box = document.createElement('div');
  box.className = 'fb-odds-block';

  const t = document.createElement('div');
  t.className = 'fb-odds-title';
  t.textContent = title;
  box.appendChild(t);

  const table = document.createElement('table');
  table.className = 'fb-table';
  table.innerHTML = '<thead><tr><th>项目</th><th>初盘</th><th>即时</th><th>变化</th></tr></thead>';
  const tb = document.createElement('tbody');

  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="lbl">${r.label}</td><td>${r.open}</td>` +
      `<td class="live">${r.live}</td><td class="${r.cls || ''}">${r.delta || ''}</td>`;
    tb.appendChild(tr);
  });

  table.appendChild(tb);
  box.appendChild(table);
  return box;
}

function renderFootballDetail(container, g) {
  container.innerHTML = '';

  const box = document.createElement('div');
  box.className = 'panel fb-detail';

  const stTxt = { upcoming: '未开赛', live: `进行中 ${g.minute || 0}'`, finished: '已完场' }[g.kind] || '';

  box.innerHTML =
    `<div class="fb-detail-head">` +
    `<div class="fb-detail-league">${g.league ? g.league.name : ''} <span class="fb-st">${stTxt}</span></div>` +
    `<div class="fb-detail-time">${timeHM(g.time)}</div></div>`;

  const hs = g.home ? g.home.score : null;
  const as_ = g.away ? g.away.score : null;
  const hasScore = hs !== null && hs !== undefined && as_ !== null && as_ !== undefined;

  const versus = document.createElement('div');
  versus.className = 'fb-versus';
  versus.innerHTML =
    `<div class="fb-v-team"><div class="n">${(g.home && g.home.name) || '?'}</div></div>` +
    `<div class="fb-v-score${g.kind === 'live' ? ' live' : ''}">${hasScore ? hs + ' - ' + as_ : 'VS'}</div>` +
    `<div class="fb-v-team"><div class="n">${(g.away && g.away.name) || '?'}</div></div>`;
  box.appendChild(versus);

  /* 推荐 + 红黑 */
  if (g.reco) {
    const r = g.reco;
    const res = g.result;
    const rb = document.createElement('div');
    rb.className = 'fb-reco-block';
    rb.innerHTML =
      `<div class="fb-reco-head">推荐：<b>${r.label}</b>` +
      `<span class="fb-reco-conf">信心 ${r.confidence}%</span>` +
      (res ? `<span class="m-rb ${res.hit ? 'hit' : 'miss'}">${res.hit ? '红' : '黑'}</span>` : '') +
      `</div>` +
      `<div class="fb-reco-probs">` +
      `<span class="${r.pick === 'home' ? 'on' : ''}">主胜 ${r.prob.home}%</span>` +
      `<span class="${r.pick === 'draw' ? 'on' : ''}">平局 ${r.prob.draw}%</span>` +
      `<span class="${r.pick === 'away' ? 'on' : ''}">客胜 ${r.prob.away}%</span>` +
      `</div>` +
      `<div class="fb-reco-note">` +
      (res
        ? `最终结果：${res.actualLabel}（${res.score}）· ${res.hit ? '✅ 推荐命中' : '❌ 推荐未中'}`
        : `依据即时欧赔反推概率（庄家抽水约 ${r.margin}%）`) +
      `</div>`;
    box.appendChild(rb);
  }

  const eu = g.odds && g.odds.europe;
  const as2 = g.odds && g.odds.asian;
  const ou = g.odds && g.odds.overunder;

  if (eu && (eu.open || eu.live)) {
    const o = eu.open || {}, l = eu.live || {};
    const delta = (x, y) => {
      if (x === null || x === undefined || y === null || y === undefined) return '—';
      return pctText(+(((y - x) / x) * 100).toFixed(1));
    };
    box.appendChild(oddsTable('欧赔（初盘 → 即时）', [
      { label: '主胜', open: o.home ?? '—', live: l.home ?? '—', delta: delta(o.home, l.home) },
      { label: '平局', open: o.draw ?? '—', live: l.draw ?? '—', delta: delta(o.draw, l.draw) },
      { label: '客胜', open: o.away ?? '—', live: l.away ?? '—', delta: delta(o.away, l.away) }
    ]));
  }

  if (as2 && (as2.open || as2.live)) {
    const o = as2.open || {}, l = as2.live || {};
    box.appendChild(oddsTable('亚盘（让球）', [
      { label: '盘口', open: o.line ?? '—', live: l.line ?? '—',
        delta: o.line !== l.line ? '变动' : '—', cls: o.line !== l.line ? 'fv-up' : 'fv-flat' },
      { label: '主水位', open: o.home ?? '—', live: l.home ?? '—' },
      { label: '客水位', open: o.away ?? '—', live: l.away ?? '—' }
    ]));
  }

  if (ou && (ou.open || ou.live)) {
    const o = ou.open || {}, l = ou.live || {};
    box.appendChild(oddsTable('大小球', [
      { label: '盘口', open: o.line ?? '—', live: l.line ?? '—',
        delta: o.line !== l.line ? '变动' : '—', cls: o.line !== l.line ? 'fv-up' : 'fv-flat' },
      { label: '大球水位', open: o.over ?? '—', live: l.over ?? '—' },
      { label: '小球水位', open: o.under ?? '—', live: l.under ?? '—' }
    ]));
  }

  if (!eu && !as2 && !ou) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = '这场比赛暂无赔率数据';
    box.appendChild(e);
  }

  container.appendChild(box);
}
