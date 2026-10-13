/* ============================================================
   fb-page.js —— 足球赛事页面逻辑
   ------------------------------------------------------------
   数据来源：football.js（由 build-football.mjs 生成）
     FOOTBALL_DATA.lists.upcoming  未开赛
     FOOTBALL_DATA.lists.live      进行中（带实时比分）
     FOOTBALL_DATA.lists.finished  已完场（带最终比分）
     FOOTBALL_DATA.stat            统计（含红黑战绩）

   每场含：
     gid, kind, league, time, minute, home{name,score}, away{name,score},
     odds{asian,europe,overunder}, reco{...}, result{hit,actualLabel,score}
   ============================================================ */

function getFootballData() {
  try {
    if (typeof FOOTBALL_DATA === 'undefined' || !FOOTBALL_DATA) return null;
    return FOOTBALL_DATA;
  } catch (e) { return null; }
}

/** 取某一状态的比赛列表 */
function footballList(kind) {
  const d = getFootballData();
  return (d && d.lists && d.lists[kind]) || [];
}

/** 统计数据 */
function footballStat() {
  const d = getFootballData();
  return (d && d.stat) || {};
}

/** 更新时间 */
function footballUpdated() {
  const d = getFootballData();
  return d ? d.updated : null;
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
