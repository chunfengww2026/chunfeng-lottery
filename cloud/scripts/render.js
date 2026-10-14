/* ============================================================
   render.js —— 按固定模板渲染推荐图

   输入：彩种 + 图key + 数据对象
   输出：一个 DOM 元素，版式与模板完全一致

   版式是固定的：不管数据填多少，每行几个号、哪里放什么，都不变。
   ============================================================ */

/* ---------------- 小工具 ---------------- */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 渲染一个号码球 */
function rBall(text, color, size, kind) {
  const b = document.createElement('span');
  b.className = `rball ${color} ${size || 'md'}${kind ? ' ' + kind : ''}`;
  b.textContent = text;
  return b;
}

/** 号码文本：0 只写一位「0」，其它个位数补成两位（01、04）
    【为什么不用 ticket-store.js 的 twoDigit】它一律 padStart(2,'0')，
    数字 0 会写成 '00' —— 和用户反复强调的「号码里的 0 写成单个 0，不写 00」
    冲突（福彩3D / 排列3 / 排列5 / 七星彩 这些含 0 的玩法图上会印出 00）。
    图上所有号码位置统一走这一个口径。 */
function numText(n) {
  return (Number(n) === 0) ? '0' : String(n).padStart(2, '0');
}

/** 号码数组 → 球元素数组；缺的补灰球，保证每行个数固定 */
function numBalls(nums, count, color, size) {
  const out = [];
  for (let i = 0; i < count; i++) {
    if (i < nums.length) out.push(rBall(numText(nums[i]), color, size));
    else out.push(rBall('', color, size, 'empty'));
  }
  return out;
}

/* ============================================================
   实票统计热力图的小工具（柱状图专用）
   ------------------------------------------------------------
   全部用 div + 内联样式画，不依赖 canvas ——
   这样 HTML→图片 的导出链路（export-image.js / 手机截图）能原样处理。
   ============================================================ */

/* 红/蓝两套色阶：占比越高越深越饱和，越低越浅 */
const HM_RED_TIERS  = ['#e53935', '#d32f2f', '#b71c1c', '#8e0000', '#f48fb1', '#f8bbd0', '#fce4ec'];
const HM_BLUE_TIERS = ['#0d47a1', '#1565c0', '#1976d2', '#1e88e5', '#64b5f6', '#90caf9', '#bbdefb'];
/* 分档边界（占最大值的比例，从高到低） */
const HM_TIER_BOUNDS = [0.86, 0.71, 0.57, 0.43, 0.29, 0.14];

/** 占比 → 柱子颜色 */
function hmColor(pct, max, color) {
  const tiers = (color === 'blue') ? HM_BLUE_TIERS : HM_RED_TIERS;
  if (!(max > 0)) return tiers[tiers.length - 1];
  const r = pct / max;
  for (let i = 0; i < HM_TIER_BOUNDS.length; i++) {
    if (r >= HM_TIER_BOUNDS[i]) return tiers[i];
  }
  return tiers[tiers.length - 1];
}

/**
 * 算 Y 轴：让轴顶略高于最大占比，分成 3~7 格，步长取好读的数
 *   6.09% → 轴到 7%，每 1% 一格
 *   10.81% → 轴到 12%，每 2% 一格
 *   13.33% → 轴到 14%，每 2% 一格
 * @returns {{axisMax:number, step:number, ticks:number[]}}
 */
function hmAxis(maxPct) {
  const STEPS = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 3, 5, 10, 15, 20, 25, 50, 100];
  const m = Number(maxPct) || 0;
  if (!(m > 0)) return { axisMax: 1, step: 1, ticks: [0, 1] };

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    const n = Math.ceil(m / step - 1e-9);
    if (n >= 3 && n <= 7) {
      const axisMax = Math.round(n * step * 1000) / 1000;
      const ticks = [];
      for (let k = 0; k <= n; k++) ticks.push(Math.round(k * step * 1000) / 1000);
      return { axisMax, step, ticks };
    }
  }
  // 兜底：轴顶 = 最大值向上取整
  const axisMax = Math.max(1, Math.ceil(m));
  const ticks = [];
  for (let k = 0; k <= axisMax; k++) ticks.push(k);
  return { axisMax, step: 1, ticks };
}

/** 百分比文本：保留最多 2 位小数，去掉末尾多余的 0（6.09% / 2.7% / 0%） */
function hmPctText(pct) {
  if (typeof heatmapPctText === 'function') return heatmapPctText(pct);
  let s = (Number(pct) || 0).toFixed(2);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s + '%';
}

/* ============================================================
   各 section 类型的渲染
   ============================================================ */

const SECTION_RENDER = {

  /* ---- 文本字段网格 ---- */
  fields(sec, vals) {
    const box = el('div', 'r-fields');
    box.style.gridTemplateColumns = `repeat(${sec.columns || 3}, minmax(0, 1fr))`;
    sec.fields.forEach((f) => {
      const item = el('div', 'r-field');
      item.appendChild(el('div', 'r-label', f.label));
      const v = vals[f.key];
      item.appendChild(el('div', 'r-value' + (v ? '' : ' empty'), v || '—'));
      box.appendChild(item);
    });
    return box;
  },

  /* ---- 号码行（号码池） ---- */
  rows(sec, vals) {
    const box = el('div', 'r-rows');
    sec.rows.forEach((r) => {
      const row = el('div', 'r-numrow');
      row.appendChild(el('span', 'r-numlabel', r.label));
      const balls = el('span', 'r-ballwrap');
      const nums = parseTicketNums(vals[r.key]);
      numBalls(nums, r.count, r.color || 'red', 'md').forEach((b) => balls.appendChild(b));
      row.appendChild(balls);
      box.appendChild(row);
    });
    return box;
  },

  /* ---- 定位行（七星彩/3D）---- */
  positions(sec, vals) {
    const box = el('div', 'r-rows');
    sec.rows.forEach((r) => {
      const row = el('div', 'r-numrow');
      row.appendChild(el('span', 'r-numlabel', r.label));
      const balls = el('span', 'r-ballwrap');
      const nums = parseTicketNums(vals[r.key]);
      if (r.firstGold && nums.length) {
        balls.appendChild(rBall(numText(nums[0]), 'gold', 'md'));
        numBalls(nums.slice(1), r.count - 1, sec.gray ? 'gray' : 'red', 'md').forEach((b) => balls.appendChild(b));
      } else {
        numBalls(nums, r.count, sec.gray ? 'gray' : (r.color || 'red'), 'md').forEach((b) => balls.appendChild(b));
      }
      row.appendChild(balls);
      box.appendChild(row);
    });
    return box;
  },

  /* ---- 两位数字型（3D/排列） ---- */
  digit(sec, vals) {
    const box = el('div', 'r-rows');
    if (sec.groupRow) {
      const row = el('div', 'r-numrow');
      row.appendChild(el('span', 'r-numlabel', sec.groupLabel || ''));
      const balls = el('span', 'r-ballwrap');
      const nums = parseTicketNums(vals[sec.groupRow.key]);
      /* 【6 码统一红色】用户原话：「排三 3D 6码推荐都要给我是红色」
         以前是「第一个金色，其余红色」，用户要求 6 个码全部红色。 */
      nums.forEach((n) => balls.appendChild(rBall(String(n), 'red', 'md')));
      for (let i = nums.length; i < sec.groupRow.count; i++) {
        balls.appendChild(rBall('', 'red', 'md', 'empty'));
      }
      row.appendChild(balls);
      box.appendChild(row);
    }
    if (sec.positions) {
      sec.positions.forEach((p) => {
        const row = el('div', 'r-numrow');
        row.appendChild(el('span', 'r-numlabel', p.label));
        const balls = el('span', 'r-ballwrap');
        const nums = parseTicketNums(vals[p.key]);
        numBalls(nums, p.count, p.color || 'gold', 'md').forEach((b) => balls.appendChild(b));
        row.appendChild(balls);
        box.appendChild(row);
      });
    }
    if (sec.footer) {
      const f = el('div', 'r-inlinefoot');
      sec.footer.forEach((item) => {
        const s = el('span', 'r-inlineitem');
        s.appendChild(el('b', '', item.label + ' '));
        s.appendChild(document.createTextNode(vals[item.key] || '—'));
        f.appendChild(s);
      });
      box.appendChild(f);
    }
    if (sec.footerText) box.appendChild(el('div', 'r-note', sec.footerText));
    return box;
  },

  /* ---- 冷热号两行 ---- */
  twovalues(sec, vals) {
    const box = el('div', 'r-twovalues');
    sec.items.forEach((it) => {
      const row = el('div', 'r-tvrow');
      row.appendChild(el('span', 'r-tvlabel', it.label + '：'));
      row.appendChild(el('span', 'r-tvvalue', vals[it.key] || '—'));
      box.appendChild(row);
    });
    return box;
  },

  /* ---- 绕胆图色块（固定 4×4 版式） ----
     ① 颜色：模板里写死 sec.colors 就用它；没写就读 stats.js 的角色表
        RAODAN_ROLES（唯一口径）—— 金3 · 银3 · 拖6 · 蓝4，
        蓝球固定在中间 2×2（位置 5/6/9/10），不随号码变化。
     ② 版式最外层兜底：老版本 stats.js（没有 RAODAN_ROLES）也不会白屏。
     格子里的号码怎么取见 stats.js 的 buildRaodanGrid()。 */
  grid(sec, vals) {
    const box = el('div', 'r-gridwrap');
    const grid = el('div', 'r-grid');
    grid.style.gridTemplateColumns = `repeat(${sec.cols || 4}, 1fr)`;

    /* 兜底：stats.js 未加载/是旧版时的 4+4+4+4 老版式 */
    const LEGACY_COLORS = [
      'goldred', 'goldred', 'goldred', 'goldred',
      'orange', 'orange', 'orange', 'orange',
      'purple', 'purple', 'purple', 'purple',
      'blue', 'blue', 'blue', 'blue'
    ];
    const COLOR_OF_ROLE = { dan: 'goldred', yin: 'orange', tuo: 'purple', blue: 'blue' };

    let colors = sec.colors;
    if (!colors && sec.cols === 4 && sec.rows === 4) {
      /* render.js 可能先于 stats.js 被加载 → 必须 typeof 判断，不能直接引用 */
      if (typeof RAODAN_ROLES !== 'undefined' && RAODAN_ROLES.length === 16) {
        colors = RAODAN_ROLES.map((r) => COLOR_OF_ROLE[r] || 'purple');
      } else {
        colors = LEGACY_COLORS;
      }
    }
    if (!colors) colors = [];

    const total = (sec.cols || 4) * (sec.rows || 4);
    for (let i = 0; i < total; i++) {
      const cell = el('div', 'r-cell ' + (colors[i] || 'purple'));
      const v = vals['grid_' + i];
      cell.textContent = v ? numText(parseInt(v, 10) || v) : '';
      grid.appendChild(cell);
    }
    box.appendChild(grid);

    if (sec.legend) {
      const lg = el('div', 'r-legend');
      sec.legend.forEach((l) => {
        const item = el('span', 'r-legenditem');
        const dot = el('span', 'r-dot ' + l.color);
        item.appendChild(dot);
        item.appendChild(document.createTextNode(l.label));
        lg.appendChild(item);
      });
      box.appendChild(lg);
    }
    if (sec.caption) box.appendChild(el('div', 'r-caption', sec.caption));
    return box;
  },

  /* ---- 五行号码 ---- */
  wuxing(sec, vals) {
    const box = el('div', 'r-wuxing');
    sec.elements.forEach((e, i) => {
      const row = el('div', 'r-wxrow');
      const badge = el('span', 'r-wxbadge wx' + i, e.name);
      row.appendChild(badge);
      row.appendChild(el('span', 'r-wxtails', e.tailsLabel || ''));
      /* 【五行阴阳】标记该行两个尾数各自的阴阳（阳X·阴Y），和行里号码一一对应，
         只占 40px 左右的行内小字，不改号码区宽度、不影响 760px 版式 */
      const yy = (typeof yinYangLabelOf === 'function') ? yinYangLabelOf(e.tailsLabel) : '';
      if (yy) row.appendChild(el('span', 'r-wxyy', yy));
      const balls = el('span', 'r-ballwrap');
      const nums = parseTicketNums(vals[e.key]);
      nums.forEach((n) => balls.appendChild(rBall(numText(n), 'wx' + i, 'sm')));
      row.appendChild(balls);
      box.appendChild(row);
    });
    if (sec.footer) {
      const f = el('div', 'r-wxfoot');
      sec.footer.forEach((item) => {
        const s = el('div', 'r-wxfootitem');
        s.appendChild(el('b', '', item.label + '：'));
        s.appendChild(document.createTextNode(vals[item.key] || '—'));
        f.appendChild(s);
      });
      box.appendChild(f);
    }
    return box;
  },

  /* ---- 九转连环（固定同心圆模板：中心 1 + 4 圈 × 8 方向 = 33 个位置） ----
     用户原话：「九转连环图必须是这种模板还要有号码」「所有号码都会在上面，
     全部是红球」——所以 33 个位置固定，每个位置上都显示号码：
       双色球 → 01~33 · 大乐透 → 01~35（表里是哪些号就画哪些号）
     位置来自 stats.js 的 JIUZHUAN_LAYOUT（用户逐字给的固定表），
     这里只负责画，不重排、不改号。

     ⚠️ 坐标故意写成【显式表】：每圈半径 + 8 个方向向量，不靠三角函数隐式推导，
        一眼就能看出位置写死在哪。
        圆心 (50%,50%)；方向从「上」开始顺时针，45° 一个：
          [0]上 [1]右上 [2]右 [3]右下 [4]下 [5]左下 [6]左 [7]左上
        位置 = 圆心 + 方向向量 × 该圈半径（单位 %，相对整张圆的直径） */
  circle(sec, vals, build, gameId) {
    /* 【固定几何】圆心 + 4 圈半径 + 8 个方向单位向量（0.7071 = √2/2）
       半径留 4% 边距（最外圈 46% + 号码点半径），否则 3 点/9 点方向会贴边被切 */
    const CIR_CENTER = { x: 50, y: 50 };                       // 圆心（%）
    const CIR_RADII = [14, 24.67, 35.33, 46];                  // 第 1~4 圈半径（%）
    const CIR_DIRS = [
      { name: '上',   dx: 0,        dy: -1       },            // 0  上
      { name: '右上', dx: 0.7071,   dy: -0.7071  },            // 1  右上
      { name: '右',   dx: 1,        dy: 0        },            // 2  右
      { name: '右下', dx: 0.7071,   dy: 0.7071   },            // 3  右下
      { name: '下',   dx: 0,        dy: 1        },            // 4  下
      { name: '左下', dx: -0.7071,  dy: 0.7071   },            // 5  左下
      { name: '左',   dx: -1,       dy: 0        },            // 6  左
      { name: '左上', dx: -0.7071,  dy: -0.7071  }             // 7  左上
    ];

    const box = el('div', 'r-circwrap');
    const c = el('div', 'r-circle');

    /* 4 个同心圆环（从大到小入 DOM，保证环线压在号码下面） */
    for (let i = 4; i >= 1; i--) c.appendChild(el('div', 'r-ring ring' + i));

    /* 高亮集合：推荐号（号码池 / 金胆银胆 / 拖码）—— 口径同 stats.js 的
       cir_pool / cir_dan / cir_tuo；取不到就不高亮（全部浅色） */
    const poolSet = new Set(parseTicketNums(vals.cir_pool || ''));
    const danSet = new Set(parseTicketNums(vals.cir_dan || ''));
    const tuoSet = new Set(parseTicketNums(vals.cir_tuo || ''));

    /* 33 个位置的号码：优先用 stats.js 铺好的 cir_num_01~33（模板里的固定号），
       没有（旧存档/手工录入）就退回旧键 cir_center + cir_0~7，保证不空图 */
    const numAt = {};
    if (vals.cir_num_center !== undefined) {
      numAt[0] = vals.cir_num_center;
      for (let i = 1; i <= 33; i++) {
        if (vals['cir_num_' + i] !== undefined) numAt[i] = vals['cir_num_' + i];
      }
    } else if (typeof jiuzhuanLayoutOf === 'function') {
      /* 旧存档 / 手工录入没有 cir_num_* 时，直接按固定模板把 33 个号铺上，
         保证「所有号码都在图上」，不会因为没存档就变成空图 */
      const L = jiuzhuanLayoutOf(gameId);
      if (L) {
        numAt[0] = L.center;
        for (let ri = 0; ri < L.rings.length; ri++) {
          for (let di = 0; di < L.rings[ri].length; di++) numAt[1 + ri * 8 + di] = L.rings[ri][di];
        }
      }
    } else {
      numAt[0] = vals[sec.centerKey];
      for (let i = 0; i < 8; i++) numAt[i + 1] = vals['cir_' + i];
    }

    /* 中心（第 0 个位置） */
    const centerNum = parseInt(numAt[0], 10);
    const centerKind = danSet.has(centerNum) ? ' core'
      : (tuoSet.has(centerNum) ? ' silver' : (poolSet.has(centerNum) ? ' pool' : ''));
    const center = el('div', 'r-circenter' + centerKind);
    center.textContent = numAt[0] === undefined || numAt[0] === '' ? '—' : numText(centerNum);
    c.appendChild(center);

    /* 4 圈 × 8 方向 */
    CIR_RADII.forEach((r, ringIdx) => {
      CIR_DIRS.forEach((d, dirIdx) => {
        const posIdx = 1 + ringIdx * 8 + dirIdx;               // 1~32
        const v = numAt[posIdx];
        if (v === undefined || v === null || v === '') return;
        const n = parseInt(v, 10);
        if (!Number.isFinite(n)) return;
        const kind = danSet.has(n) ? ' core'
          : (tuoSet.has(n) ? ' silver' : (poolSet.has(n) ? ' pool' : ''));
        const dot = el('div', 'r-cirnum' + kind);
        dot.style.top = (CIR_CENTER.y + d.dy * r).toFixed(2) + '%';
        dot.style.left = (CIR_CENTER.x + d.dx * r).toFixed(2) + '%';
        dot.textContent = numText(n);
        c.appendChild(dot);
      });
    });

    box.appendChild(c);

    /* 图例：只列实际用到的颜色，口径和 stats.js 的高亮字段一一对应 */
    const legend = [];
    if (danSet.size) legend.push({ label: '金胆/银胆', color: 'core' });
    if (tuoSet.size) legend.push({ label: '拖码', color: 'silver' });
    if (poolSet.size) legend.push({ label: '号码池', color: 'pool' });
    if (legend.length) {
      legend.push({ label: '未推荐', color: 'dim' });
      const lg = el('div', 'r-legend');
      legend.forEach((l) => {
        const item = el('span', 'r-legenditem');
        item.appendChild(el('span', 'r-dot ' + l.color));
        item.appendChild(document.createTextNode(l.label));
        lg.appendChild(item);
      });
      box.appendChild(lg);
    }

    if (sec.note) box.appendChild(el('div', 'r-caption', sec.note));
    return box;
  },

  /* ---- 九宫图（洛书 + 每期自动偏移） ----
     数据流（用户指定的用法）：
       上期开奖号 → calcOffsetByLastLottery → offset
       → matrixOffsetShift(BASE_LU_SHU, offset) → 本期矩阵 → 画格子
     所以中宫不再是固定 5，每期跟着上期开奖号变。
     BASE_LU_SHU 只读：matrixOffsetShift 内部 cloneMatrix，不改基准。 */
  jiugong(sec, vals) {
    const box = el('div', 'r-jgwrap');
    const g = el('div', 'r-jiugong');

    /* 本期矩阵：优先按 offset 现算（和 stats.js 同一个函数）；算不了就用
       stats.js 铺好的 jg_matrix；再不行退回原始基准洛书 */
    let cur = resetLuShu();
    try {
      const off = parseInt(vals.jg_offset, 10);
      if (Number.isFinite(off) && off >= 1 && off <= 9) {
        cur = matrixOffsetShift(BASE_LU_SHU, off);
      } else if (typeof vals.jg_matrix === 'string' && vals.jg_matrix.length >= 17) {
        cur = vals.jg_matrix.split(',').map((row) => row.split('').map(Number));
      }
    } catch (e) { /* 兜底就是基准洛书 */ }

    const flat = cur[0].concat(cur[1], cur[2]);
    flat.forEach((v, i) => {
      const cell = el('div', 'r-jgcell' + (i === 4 ? ' center' : ''));
      cell.textContent = String(v);
      g.appendChild(cell);
    });
    box.appendChild(g);
    if (sec.note) box.appendChild(el('div', 'r-caption', sec.note));
    if (sec.footer) {
      const f = el('div', 'r-jgfoot');
      sec.footer.forEach((item) => {
        const s = el('div', '');
        s.appendChild(el('b', '', item.label + '：'));
        s.appendChild(document.createTextNode(vals[item.key] || '—'));
        f.appendChild(s);
      });
      box.appendChild(f);
    }
    return box;
  },

  /* ---- 日历条 ---- */
  calendar(sec, vals) {
    const box = el('div', 'r-calendar');
    const row = el('div', 'r-calrow');
    sec.fields.forEach((f) => {
      const s = el('span', 'r-calitem');
      s.appendChild(el('b', '', f.label + '：'));
      s.appendChild(document.createTextNode(vals[f.key] || '—'));
      row.appendChild(s);
    });
    box.appendChild(row);
    if (sec.badges) {
      const b = el('div', 'r-calbadges');
      sec.badges.forEach((bg) => {
        const s = el('span', 'r-calbadge');
        s.appendChild(el('b', '', bg.label + ' '));
        s.appendChild(document.createTextNode(vals[bg.key] || '—'));
        b.appendChild(s);
      });
      box.appendChild(b);
    }
    return box;
  },

  /* ---- 热号排行 ---- */
  rank(sec, vals) {
    const box = el('div', 'r-rank');
    sec.groups.forEach((g) => {
      box.appendChild(el('div', 'r-ranktitle', g.label));
      const list = el('div', 'r-ranklist');
      /* 【重要】列数写进内联样式 ——
         媒体查询（手机上的 @media max-width:700px）就永远改不了它，
         图片在手机上不会被重排成竖列。 */
      list.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
      for (let i = 0; i < (g.count || 6); i++) {
        const v = vals[`${g.label}_${i}`] || '';
        if (!v) continue;
        // 「13出现8次」拆成 号 + 次数
        const m = /^(\d+)\s*出现\s*(\d+)\s*次?$/.exec(v.replace(/\s/g, ''));
        const item = el('span', 'r-rankitem');
        if (m) {
          item.appendChild(rBall(numText(m[1]), g.color || 'red', 'sm'));
          item.appendChild(el('span', 'r-rankcount', `出现${m[2]}次`));
        } else {
          item.appendChild(document.createTextNode(v));
        }
        list.appendChild(item);
      }
      box.appendChild(list);
    });
    return box;
  },

  /* ============================================================
     实票统计热力图
     ------------------------------------------------------------
     数据来源：全局 HEATMAP_DATA（heatmap-data.js，build-heatmap.mjs 生成）
     结构：
       顶部深红标题条（春风小店实票统计 + 彩种期号副标题）
       前区/红球购买占比（完全降序）—— 红色系柱状图
       后区/蓝球购买占比（完全降序）—— 蓝色系柱状图
     柱子全部用 div + 内联样式，底部对齐；无 canvas。
     ============================================================ */
  heatmap(sec, vals, build, gameId) {
    const box = el('div', 'r-hm');

    const H = (typeof HEATMAP_DATA !== 'undefined' && HEATMAP_DATA && HEATMAP_DATA.games)
      ? HEATMAP_DATA.games[gameId] : null;
    const front = H && H[sec.frontKey || 'front'];
    const back = H && H[sec.backKey || 'back'];

    if (!H || !front || !back || !front.items || !front.items.length) {
      box.appendChild(el('div', 'r-hm-nodata', '本期暂无实票统计数据'));
      return box;
    }

    /* ---------- 1. 顶部标题条（几何/配色同时写内联，避免缓存里的旧样式表拖累） ----------
       【排版】副标题固定「{彩种} 第 {期号} 期 · 全网公开晒票号码占比」（用户指定的模板原文，
       不加任何括号补充）。字号 11.5px、不加字距，保证在窄屏也不溢出红条；
       真溢出了就自动换行（不裁切、不贴边）。 */
    const bar = el('div', 'r-hm-titlebar');
    bar.style.cssText = 'background:#b71c1c;border-radius:10px;color:#ffffff;text-align:center;' +
      'padding:12px 16px 11px;margin-bottom:14px;border:none;overflow:hidden;box-sizing:border-box;';
    const t1 = el('div', 'r-hm-t1', '春风小店实票统计');
    t1.style.cssText = 'font-size:22px;font-weight:800;letter-spacing:2px;line-height:1.25;color:#ffffff;';
    bar.appendChild(t1);
    const sub = `${H.name} 第 ${H.issue} 期 · 全网公开晒票号码占比`;
    const t2 = el('div', 'r-hm-t2', sub);
    t2.style.cssText = 'font-size:11.5px;color:#ffd9d9;margin-top:5px;letter-spacing:0;line-height:1.4;' +
      'white-space:normal;word-break:keep-all;';
    bar.appendChild(t2);
    box.appendChild(bar);

    /* ---------- 2. 两组柱状图 ---------- */
    const frontItems = front.items;
    const n = frontItems.length;
    const pctFont = n >= 24 ? '8px' : '9.5px';
    const numFont = n >= 24 ? '9px' : '10px';

    box.appendChild(hmChartBlock(front, 'red', 250, pctFont, numFont));
    box.appendChild(hmChartBlock(back, 'blue', 200, '9.5px', '10px'));

    /* ---------- 3. 数据来源标注（不假装是晒票统计） ----------
       OCR 成功 → 「数据来源：全网公开晒票照片识别 · 仅为统计展示」
       兜底     → 「数据来源：近 30 期开奖号码频率 · 仅为统计展示」 */
    const src = el('div', 'r-hm-src');
    src.style.cssText = 'font-size:10.5px;color:#9aa0a6;text-align:center;margin-top:4px;line-height:1.5;';
    /* 兼容历史数据：没有 source 字段的旧数据（'yiqicai-xysp'）按晒票文字处理 */
    src.textContent = (H.source === 'ocr-xysp')
      ? '数据来源：全网公开晒票照片识别 · 仅为统计展示'
      : (H.source === 'xysp-text' || H.source === 'yiqicai-xysp')
        ? '数据来源：全网公开晒票 · 仅为统计展示'
        : '数据来源：近 30 期开奖号码频率 · 仅为统计展示';
    box.appendChild(src);
    const tip = el('div', 'r-hm-tip',
      '仅为公开晒票/历史开奖的统计展示，不构成购彩建议，也不能预测中奖。');
    tip.style.cssText = 'font-size:10.5px;color:#b0b4b9;text-align:center;margin-top:3px;';
    box.appendChild(tip);
    return box;
  }
};

/**
 * 画一组柱状图
 * @param {{label:string,color:string,total:number,items:Array}} area
 * @param {string} colorKind 'red' | 'blue'
 * @param {number} plotH 绘图区高度（px）
 */
function hmChartBlock(area, colorKind, plotH, pctFont, numFont) {
  const wrap = el('div', 'r-hm-sec');

  // 小节标题：红球购买占比（完全降序）
  const seclabel = el('div', 'r-hm-seclabel', `${area.label}购买占比（完全降序）`);
  seclabel.style.cssText = 'font-size:14px;font-weight:700;color:#b71c1c;padding-left:9px;' +
    'position:relative;margin-bottom:8px;';
  wrap.appendChild(seclabel);

  const items = area.items || [];
  const maxPct = items.reduce((m, it) => Math.max(m, Number(it.pct) || 0), 0);
  const ax = hmAxis(maxPct);

  const TOP_PAD = 13;                 // 柱顶百分比标签占的高度
  const unit = plotH - TOP_PAD;       // 轴顶 axisMax 对应的像素高度
  const pxOf = (pct) => Math.max(0, Math.round(((Number(pct) || 0) / ax.axisMax) * unit));

  const YW = 30;                      // Y 轴刻度列宽

  const chart = el('div', 'r-hm-chart');
  chart.style.cssText = `display:flex;align-items:flex-start;font-family:"Microsoft YaHei","Segoe UI",sans-serif;`;

  /* ---- Y 轴刻度 ---- */
  const yax = el('div', 'r-hm-yax');
  yax.style.cssText = `position:relative;width:${YW}px;height:${plotH}px;flex:0 0 ${YW}px;`;
  ax.ticks.forEach((t) => {
    const lab = el('div', 'r-hm-ytick', hmPctText(t));
    lab.style.cssText =
      `position:absolute;right:4px;bottom:${pxOf(t) - 5}px;height:10px;line-height:10px;` +
      `font-size:8.5px;color:#9aa0a6;white-space:nowrap;text-align:right;`;
    yax.appendChild(lab);
  });
  chart.appendChild(yax);

  /* ---- 绘图区 ---- */
  const plot = el('div', 'r-hm-plot');
  plot.style.cssText = `position:relative;flex:1 1 auto;min-width:0;height:${plotH}px;`;

  // 浅灰横向网格线
  ax.ticks.forEach((t) => {
    const line = el('div', 'r-hm-grid');
    line.style.cssText =
      `position:absolute;left:0;right:0;bottom:${pxOf(t)}px;height:0;` +
      `border-top:1px solid ${t === 0 ? '#d5d8dc' : '#ececec'};`;
    plot.appendChild(line);
  });

  // 柱子（底部对齐）
  const bars = el('div', 'r-hm-bars');
  bars.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:100%;' +
    'display:flex;align-items:flex-end;gap:2px;';

  let prevPct = null;                 // 上一根的占比（用来跳过同占比的重复标签）

  items.forEach((it) => {
    const pct = Number(it.pct) || 0;
    const h = pxOf(pct);

    const col = el('div', 'r-hm-col');
    col.style.cssText = 'position:relative;flex:1 1 0;min-width:0;height:100%;';

    /* 柱顶百分比：760px 宽下 35 根柱子只有 ~19px，同占比的相邻标签会挤成一团
       （实测出现 "6%6%"、"4%4%4%4%4%"）。所以【同占比的连续柱子只标第一根】，
       剩下的留白 —— 柱子高度/颜色已经能看出是同一个占比。
       0% 的号也照此处理（第一根 0% 仍然显示 0%）。 */
    if (prevPct === null || Math.abs(pct - prevPct) > 1e-9) {
      const pctEl = el('div', 'r-hm-pct', hmPctText(pct));
      pctEl.style.cssText =
        `position:absolute;left:-2px;right:-2px;bottom:${h}px;height:12px;line-height:12px;` +
        `text-align:center;font-size:${pctFont};color:#5f6368;white-space:nowrap;`;
      col.appendChild(pctEl);
    }
    prevPct = pct;

    // 柱子本体
    const b = el('div', 'r-hm-bar');
    b.style.cssText =
      `position:absolute;left:0;right:0;bottom:0;height:${h}px;` +
      `background:${hmColor(pct, maxPct, colorKind)};border-radius:2px 2px 0 0;`;

    col.appendChild(b);
    bars.appendChild(col);
  });
  plot.appendChild(bars);
  chart.appendChild(plot);
  wrap.appendChild(chart);

  /* ---- 号码标签（柱子正下方） ---- */
  const xax = el('div', 'r-hm-xax');
  xax.style.cssText = `display:flex;gap:2px;margin-left:${YW}px;margin-top:3px;`;
  items.forEach((it) => {
    const lab = el('div', 'r-hm-num', numText(it.num));
    lab.style.cssText =
      `flex:1 1 0;min-width:0;text-align:center;font-size:${numFont};` +
      `color:#3c4043;line-height:14px;white-space:nowrap;overflow:visible;`;
    xax.appendChild(lab);
  });
  wrap.appendChild(xax);

  return wrap;
}

/* ============================================================
   主渲染函数
   ============================================================ */

/**
 * 渲染一张推荐图
 * @param {string} gameId
 * @param {string} imageKey
 * @param {object} data  { date, issue, images:{...} }
 * @returns {HTMLElement}
 */
function renderTicketImage(gameId, imageKey, data) {
  const tpl = TEMPLATES[gameId];
  if (!tpl) return el('div', '', '没有该彩种的模板');

  const img = tpl.images.find((i) => i.key === imageKey) || tpl.images[0];
  const vals = (data && data.images && data.images[imageKey]) || {};

  const root = el('div', 'r-image');
  root.dataset.game = gameId;
  root.dataset.image = imageKey;

  /* ---------- 红色页头 ----------
     热力图那张图自带深红标题条（headless: true），不再套通用页头，
     否则顶上会出现两条红条。 */
  if (!img.headless) {
    const head = el('div', 'r-head');
    head.appendChild(el('div', 'r-headbrand', tpl.footer.brand));
    head.appendChild(el('div', 'r-headshop', '— ' + tpl.footer.shop + ' —'));
    head.appendChild(el('div', 'r-headtitle', img.title));
    const issueLine = el('div', 'r-headissue');
    issueLine.innerHTML = `第&nbsp;&nbsp;<b>${(data && data.issue) || '******'}</b>&nbsp;&nbsp;期`;
    head.appendChild(issueLine);
    root.appendChild(head);
  }

  /* ---------- 内容区 ---------- */
  const body = el('div', 'r-body');

  const build = (sec, parent) => {
    if (sec.type === 'twocol') {
      const wrap = el('div', 'r-twocol');
      /* 【重要】方向写进内联样式，手机媒体查询改不了 */
      wrap.style.flexDirection = 'row';
      const L = el('div', 'r-col');
      const R = el('div', 'r-col');
      if (sec.left) build(sec.left, L);
      if (sec.right) build(sec.right, R);
      wrap.appendChild(L);
      wrap.appendChild(R);
      parent.appendChild(wrap);
      return;
    }

    const block = el('div', 'r-block');
    if (sec.title) {
      const t = el('div', 'r-sectitle');
      t.textContent = sec.title;
      block.appendChild(t);
    }

    // 把 key 映射到真实的 section 类型渲染器
    let rendererName = sec.type;
    if (sec.type === 'positions2') rendererName = 'positions';   // 兼容旧写法
    const fn = SECTION_RENDER[rendererName];
    /* 第 4 个参数传 gameId —— 热力图要按彩种去读全局 HEATMAP_DATA，
       九转连环要按彩种取 JIUZHUAN_LAYOUT 里那张固定位置表 */
    if (fn) block.appendChild(fn(sec, vals, build, gameId));

    parent.appendChild(block);
  };

  img.sections.forEach((sec) => build(sec, body));
  root.appendChild(body);

  /* ---------- 页脚 ---------- */
  const foot = el('div', 'r-foot');
  foot.innerHTML = `— ${tpl.footer.brand} · 仅供参考 —`;
  foot.appendChild(el('div', 'r-disclaimer', TEMPLATE_DISCLAIMER));
  root.appendChild(foot);

  return root;
}
