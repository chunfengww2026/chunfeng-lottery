/* ============================================================
   trend-render.js —— 走势图渲染内核（页面 + 验收脚本共用）
   ------------------------------------------------------------
   这份文件【只被读取、被内嵌】，本身不会被 <script src> 引用，所以：
     · 不用 import / export，纯全局函数，页面里直接可用
     · 迷你 DOM 验收里用 vm.runInContext 直接跑同一份文件
   只做纯函数：给同一份 payload，永远出同一段 HTML。
   ============================================================ */

/* 单区统计：出现次数 / 当前遗漏 / 最大遗漏
   遗漏 = 从最新一期往回数，连续多少期没出现（0 = 最新一期就开了）。
   数字型彩种（positional）按"位"统计：某位等于该数字就算开出。 */
function trAreaStats(series, nCols, lo) {
  const out = [];
  const periods = series.length;
  for (let i = 0; i < nCols; i++) {
    const want = lo + i;
    const hits = series.map((arr) => arr.filter((v) => v === want).length);
    const freq = hits.reduce((a, b) => a + b, 0);
    let gap = 0;
    for (let k = periods - 1; k >= 0; k--) { if (hits[k] > 0) break; gap++; }
    let maxGap = 0, cur = 0;
    for (let k = 0; k < periods; k++) { if (hits[k] > 0) { cur = 0; } else { cur++; if (cur > maxGap) maxGap = cur; } }
    out.push({ n: want, freq, gap, maxGap });
  }
  return out;
}

function trEsc(s) {
  return String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

/* ============================================================
   【走势连线】命中序列 —— 哪些期开了这个号
   ------------------------------------------------------------
   用户 2026-10-17 要求：「加走势连线」（先做双色球 + 大乐透）。
   传统走势图的样子：同一个号码跨期用线连起来。
   ⚠️ 号码【本身带对子】（按位彩种会出现 2,8,7 这种重复）——所以用
      Set 去重。(n + 1) 是为了让返回值能区分"没开"(0) 和"开了"(1)，
      直接返回布尔数组也可以，但数字数组在验收脚本里更好断言。
   ============================================================ */

/* ============================================================
   【连线数据】纯计算，不碰 DOM
   ------------------------------------------------------------
   给"某号码在各期是否命中"的 0/1 序列，算出要画的线段。
   约定：把每一行看成一个单位高度，行 r 的圆心在 y = r + 0.5。
     · 相邻两期都开（r、r+1）→ 一条竖线，从 r+0.5 连到 r+1.5
     · 中间隔了 gap 期没开     → 从圆心各自伸出一个"短线头"，
                                 长度 = 半个行高（0.45），看起来像虚线趋势
   这样【绝不在没开的期上画线】——线只表示"这个号连续出现的区间"。
   ============================================================ */
/* ============================================================
   【连线数据】纯计算，不碰 DOM
   ------------------------------------------------------------
   给"某号码在各期是否命中"的 0/1 序列，算出要画的线段。
   约定：每一行是一个单位高度，行 r 的圆心在 y = r + 0.5。

   ⚠️ 这里改过一版（实测截图才发现问题）：
      第一版画的是"短线头"—— 每个命中点上下各出一小段 0.45。
      截图一看全是碎毛刺，而且【相邻两期的两个短线头之间是虚的】，
      但相邻两期本来就该是实线连着。是我设计错了。
      现在改成传统走势图的标准画法：
        · 同一个号码，从它【首次出现】一直连到【末次出现】
        · 相邻两期都开 → 实线（连续走势）
        · 中间隔着遗漏   → 虚线（跨过没开的期，一眼能看出断了）
      这样每条线是完整的一条走势，不再是碎点。
   ============================================================ */
function trSegmentsFor(series) {
  const hitRows = [];
  series.forEach((v, r) => { if (v) hitRows.push(r); });
  if (hitRows.length < 2) return [];      /* 只出现过一期 → 连不起来，不画 */
  const segs = [];
  for (let i = 1; i < hitRows.length; i++) {
    const a = hitRows[i - 1];
    const b = hitRows[i];
    segs.push({
      y1: a + 0.5,
      y2: b + 0.5,
      solid: (b - a === 1)                 /* 紧邻 → 实线；有遗漏 → 虚线 */
    });
  }
  return segs;
}

/* 所有列的命中序列一次算出来（避免每个号码都重扫一遍 → O(列²)）。
   返回 { [列号]: [0/1, ...] }，长度 = 期数。 */
function trHitSeriesAll(rows, lo, hi) {
  const nCols = hi - lo + 1;
  const series = [];
  for (let i = 0; i < nCols; i++) series.push(new Array(rows.length).fill(0));
  rows.forEach((r, ri) => {
    const seen = new Set();
    (r || []).forEach((v) => {
      const idx = v - lo;
      if (idx >= 0 && idx < nCols) seen.add(idx);   /* 去重：号码本身带对子 */
    });
    seen.forEach((idx) => { series[idx][ri] = 1; });
  });
  return series;
}

/* 一条线路的整体数据（号码 + 连线 + 出现期数） */
function trTrendLines(payload, gameId, opts) {
  const o = opts || {};
  const game = (payload.games || []).filter((g) => g.id === gameId)[0];
  if (!game) return null;
  const rows = game.rows || [];
  const pick = (arrFn, lo, hi, cls) => {
    if (hi < lo) return [];
    const series = trHitSeriesAll(rows.map(arrFn), lo, hi);
    const lines = [];
    series.forEach((s, i) => {
      const count = s.reduce((a, b) => a + b, 0);
      if (!count) return;                         /* 一期都没开过的号不画线 */
      lines.push({ n: lo + i, cls, count, segs: trSegmentsFor(s) });
    });
    return lines;
  };
  return {
    game: gameId,
    rows: rows.length,
    main: pick((r) => r.nums, game.main.lo, game.main.hi, 'main'),
    extra: game.extra ? pick((r) => r.extra, game.extra.lo, game.extra.hi, 'extra') : []
  };
}

/* 渲染整块：彩种切换条 + 8 张走势表 + 图例 */
function renderTrendHtml(payload) {
  const esc = trEsc;
  const games = payload.games;
  const L = [];

  /* ① 彩种切换条 */
  L.push('<div class="tr-tabs" role="tablist" aria-label="彩种切换">');
  games.forEach((g, i) => {
    L.push('<a class="tr-tab' + (i === 0 ? ' on' : '') + '" href="#g=' + esc(g.id) +
      '" data-tr-tab="' + esc(g.id) + '">' + esc(g.name) + '</a>');
  });
  L.push('</div>');

  /* ② 每个彩种一块 */
  games.forEach((g) => {
    const rows = g.rows;
    const nCols = g.main.hi - g.main.lo + 1;
    const exCols = g.extra ? (g.extra.hi - g.extra.lo + 1) : 0;
    const withExtra = exCols > 0;

    L.push('<section class="tr-block" id="' + esc(g.id) + '" data-tr-block="' + esc(g.id) + '">');
    L.push('<div class="tr-head">');
    L.push('<h2 class="tr-title">' + esc(g.name) + ' · 走势图</h2>');
    L.push('<div class="tr-sub">最近 <b>' + rows.length + '</b> 期 · 期号 <b>' + esc(rows[0].issue) +
      '</b> → <b>' + esc(rows[rows.length - 1].issue) + '</b> · 每期 ' + g.main.pick + ' 个' +
      esc(g.main.label) + (g.extra ? ' + ' + g.extra.pick + ' 个' + esc(g.extra.label) : '') + '</div>');
    L.push('</div>');

    L.push('<div class="tr-scroll">');
    L.push('<table class="tr-table" data-tr-table="' + esc(g.id) + '">');

    /* 表头：期号 + 号码列（+ 第二区）+ 开出 */
    L.push('<thead><tr>');
    L.push('<th class="tr-th-issue tr-sticky">期号</th>');
    for (let n = g.main.lo; n <= g.main.hi; n++) {
      L.push('<th class="tr-th-num' + (g.main.positional ? ' tr-th-pos' : '') + '">' + n + '</th>');
    }
    if (withExtra) {
      L.push('<th class="tr-th-sep" aria-label="' + esc(g.extra.label) + '"></th>');
      for (let n = g.extra.lo; n <= g.extra.hi; n++) {
        L.push('<th class="tr-th-num tr-th-extra">' + n + '</th>');
      }
    }
    L.push('<th class="tr-th-tail">开出</th>');
    L.push('</tr></thead>');

    /* 表体：每期一行 */
    L.push('<tbody>');
    rows.forEach((r, ri) => {
      const isLast = ri === rows.length - 1;
      /* 数字型彩种按【位】标记：重复号码各算一格（例如 2,8,7） */
      const hitMain = new Array(nCols).fill(0);
      r.nums.forEach((v) => { const idx = v - g.main.lo; if (idx >= 0 && idx < nCols) hitMain[idx]++; });
      const hitExtra = new Array(exCols).fill(0);
      if (withExtra) r.extra.forEach((v) => { const idx = v - g.extra.lo; if (idx >= 0 && idx < exCols) hitExtra[idx]++; });

      L.push('<tr class="tr-row' + (isLast ? ' tr-row-last' : '') + '" data-tr-issue="' + esc(r.issue) + '">');
      L.push('<td class="tr-td-issue tr-sticky"><b>' + esc(r.issue) + '</b><i>' +
        esc(String(r.date).slice(5)) + '</i></td>');
      for (let i = 0; i < nCols; i++) {
        const c = hitMain[i];
        L.push('<td class="tr-td-num' + (c ? ' on' : '') + '" data-tr-hit="' + c + '">' + (c ? '<s></s>' : '') + '</td>');
      }
      if (withExtra) {
        L.push('<td class="tr-td-sep"></td>');
        for (let i = 0; i < exCols; i++) {
          const c = hitExtra[i];
          L.push('<td class="tr-td-num tr-td-extra' + (c ? ' on' : '') + '" data-tr-zone="x" data-tr-hit="' + c + '">' + (c ? '<s></s>' : '') + '</td>');
        }
      }
      /* 行尾：本期原始开奖号（数字型彩种用它看"位"的顺序） */
      const tail = g.main.positional
        ? r.nums.join('')
        : (r.nums.slice().sort((a, b) => a - b).join(' ') + (withExtra ? ' + ' + r.extra.join(' ') : ''));
      L.push('<td class="tr-td-tail">' + esc(tail) + '</td>');
      L.push('</tr>');
    });
    L.push('</tbody>');

    /* 表尾：出现次数 / 当前遗漏 / 最大遗漏 */
    const stats = trAreaStats(rows.map((r) => r.nums), nCols, g.main.lo);
    const xstats = withExtra ? trAreaStats(rows.map((r) => r.extra), exCols, g.extra.lo) : null;
    L.push('<tfoot>');
    L.push('<tr class="tr-freq"><td class="tr-tf-label tr-sticky">出现次数</td>');
    stats.forEach((s) => L.push('<td class="tr-td-freq">' + s.freq + '</td>'));
    if (withExtra) {
      L.push('<td class="tr-td-sep"></td>');
      xstats.forEach((s) => L.push('<td class="tr-td-freq tr-td-extra">' + s.freq + '</td>'));
    }
    L.push('<td class="tr-td-tail"></td></tr>');
    L.push('<tr class="tr-gap"><td class="tr-tf-label tr-sticky">当前遗漏</td>');
    stats.forEach((s) => L.push('<td class="tr-td-gap' + (s.gap === 0 ? ' zero' : '') + '">' + s.gap + '</td>'));
    if (withExtra) {
      L.push('<td class="tr-td-sep"></td>');
      xstats.forEach((s) => L.push('<td class="tr-td-gap tr-td-extra' + (s.gap === 0 ? ' zero' : '') + '">' + s.gap + '</td>'));
    }
    L.push('<td class="tr-td-tail"></td></tr>');
    L.push('<tr class="tr-maxgap"><td class="tr-tf-label tr-sticky">最大遗漏</td>');
    stats.forEach((s) => L.push('<td class="tr-td-gap">' + s.maxGap + '</td>'));
    if (withExtra) {
      L.push('<td class="tr-td-sep"></td>');
      xstats.forEach((s) => L.push('<td class="tr-td-gap tr-td-extra">' + s.maxGap + '</td>'));
    }
    L.push('<td class="tr-td-tail"></td></tr>');
    L.push('</tfoot>');

    L.push('</table></div>');
    L.push('<div class="tr-note">横轴 = ' + esc(g.main.label) + '号码 ' + g.main.lo + '~' + g.main.hi +
      (withExtra ? ' · 右侧 ' + esc(g.extra.label) + ' ' + g.extra.lo + '~' + g.extra.hi : '') +
      ' · 纵轴 = 期号（越往下越新）· 米色格 = 该期开出' +
      (g.main.positional ? '（数字型按"位"标记，重复号码各算一次）' : '') + '</div>');
    L.push('</section>');
  });

  /* ③ 图例 */
  L.push('<div class="tr-legend">');
  L.push('<span><i class="tr-lg-on"></i>该期开出</span>');
  L.push('<span><i class="tr-lg-last"></i>最新一期</span>');
  L.push('<span><i class="tr-lg-gap"></i>当前遗漏 = 0（刚开过）</span>');
  L.push('</div>');
  return L.join('');
}
