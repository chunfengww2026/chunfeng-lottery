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

/* ============================================================
   【斜连】用户 2026-10-17 给了两条规则（原话，第二条更严格）：

   ① 普通斜连：上期 a、本期 b，|a - b| === 1 → 可连线

   ② 隔号斜连（用户第二次给的、更严格的定义）：
        001期开1 → 002期开2 → 003期空 → 004期开4
        步长=1，间隔=2（中间空了1期），从1到4共经历3期，差值3=1+2
      代码要求：
        · j 从 i+2 起（gap ≥ 2，真间隔；相邻期不算）
        · 【中间期必须没开"这个方向的号"】：
            期望 = a + (k-i) * (b>a ? 1 : -1)
            中间任何一期开了这个期望号 → 这条不算
          （即"中间被走过"的不算，只留真正跨过去的）
        · maxGap 默认 3

   ⚠️ 为什么一定要用户这个严格版（实测量级，30 期真实数据）：
        宽松版（谁跟谁差 N 就连）：双色球 573 / 快乐8 3477 条  → 糊
        严格版（隔号+中间不许走过）：双色球 107 / 快乐8 471 条 → 能用
      差了约 8 倍。所以间隔斜连【就用严格版】，宽松那版不再使用。

   ⚠️ 只在【同一个区】内连（红球连红球、蓝球连蓝球）：跨区连线没有意义。
   ============================================================ */

/** gap = 1 的普通斜连 */
function trSlantAdjacent(draws) {
  const rows = Array.isArray(draws) ? draws : [];
  const out = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    const from = rows[i] || [], to = rows[i + 1] || [];
    for (let x = 0; x < from.length; x++) {
      for (let y = 0; y < to.length; y++) {
        if (Math.abs(from[x] - to[y]) === 1) {
          out.push({ i, j: i + 1, a: from[x], b: to[y], gap: 1, type: 'slant' });
        }
      }
    }
  }
  return out;
}

/**
 * 隔号斜连（用户的严格定义）。
 * @param {Array<Array<number>>} draws
 * @param {number} maxGap 最大相隔期数，默认 3
 *
 * ⚠️ 这里【故意偏离】了用户给的那行循环一个细节，说明清楚：
 *      用户写的是  j <= Math.min(i + maxGap + 1, …)
 *      那个 `+1` 会让 maxGap 比名字多放一期：maxGap=2 时 gap=3 也进得来
 *      （实测：maxGap=2 → [[1],[],[],[4]] 仍出 gap=3；maxGap=3 会出 gap=4）。
 *      按"maxGap = 最大相隔期数"的直觉，这里用 j <= i + maxGap，让
 *      maxGap 严格等于上限。若哪天要退回用户那版字面语义，把 bound 改成
 *      `Math.min(i + mg + 1, rows.length - 1)` 即可。
 */
function trSlantGap(draws, maxGap) {
  const rows = Array.isArray(draws) ? draws : [];
  const mg = maxGap == null ? 3 : maxGap;
  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const bound = Math.min(i + mg, rows.length - 1);
    for (let j = i + 2; j <= bound; j++) {
      const gap = j - i;
      const from = rows[i] || [], to = rows[j] || [];
      for (let x = 0; x < from.length; x++) {
        for (let y = 0; y < to.length; y++) {
          const a = from[x], b = to[y];
          if (Math.abs(a - b) !== gap) continue;
          /* 中间任何一期开了"这个方向的期望号" → 这条不算 */
          let hasMiddle = false;
          for (let k = i + 1; k < j; k++) {
            const expected = a + (k - i) * (b > a ? 1 : -1);
            if ((rows[k] || []).indexOf(expected) >= 0) { hasMiddle = true; break; }
          }
          if (!hasMiddle) {
            results.push({
              i, j, a, b, gap, type: 'gapSlant',
              step: Math.abs(b - a) / gap       /* 步长（严格版恒为 1，留着便于核对） */
            });
          }
        }
      }
    }
  }
  return results;
}

/**
 * 检测斜连（普通 + 可选隔号）。
 * @param {Array<Array<number>>} draws 每期号码（按期号正序：旧 → 新）
 * @param {object} o { includeGapSlant, maxGap }
 */
function trSlantLines(draws, o) {
  const opt = o || {};
  const out = trSlantAdjacent(draws);
  if (opt.includeGapSlant) {
    out.push(...trSlantGap(draws, opt.maxGap));
  }
  return out;
}

/** 某个彩种要连的斜连（主场 + 第二区各自算，不跨区） */
function trSlantFor(payload, gameId, opts) {
  const o = opts || {};
  const game = (payload.games || []).filter((g) => g.id === gameId)[0];
  if (!game) return null;
  const main = trSlantLines(game.rows.map((r) => r.nums), o).map((x) => ({ ...x, cls: 'main' }));
  const extra = game.extra
    ? trSlantLines(game.rows.map((r) => r.extra), o).map((x) => ({ ...x, cls: 'extra' }))
    : [];
  return { game: gameId, main, extra, all: main.concat(extra) };
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
        L.push('<td class="tr-td-num' + (c ? ' on' : '') + '" data-tr-hit="' + c + '">' +
          /* 【背景板号数】用户 2026-10-17：每格印上该列号数（很浅），不用抬头看表头 */
          '<i class="tr-ghost">' + (g.main.lo + i) + '</i>' +
          (c ? '<s></s>' : '') + '</td>');
      }
      if (withExtra) {
        L.push('<td class="tr-td-sep"></td>');
        for (let i = 0; i < exCols; i++) {
          const c = hitExtra[i];
          L.push('<td class="tr-td-num tr-td-extra' + (c ? ' on' : '') + '" data-tr-zone="x" data-tr-hit="' + c + '">' +
            '<i class="tr-ghost">' + (g.extra.lo + i) + '</i>' +
            (c ? '<s></s>' : '') + '</td>');
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
