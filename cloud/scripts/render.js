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
   九转连环的小工具（几何）
   ------------------------------------------------------------
   圈数 / 轴数【必须和 stats.js 的 JIUZHUAN_GEOMETRY 对齐】：
     两个彩种共用一套几何 —— ssq 4×8 = 32 交点（+ 中心 1 个号码位 = 33 位）
                                dlt 4×8 = 32 交点（+ 中心 1 位 + 中心旁 34/35 两个小字球 = 35 位）
   优先读 stats.js 铺好的 cir_rings / cir_axes；读不到就按交点数推断，
   保证老存档 / 手写数据也能画出正确的圈数与轴数。
   ============================================================ */

/** 交点数量 → { rings, axes } */
function cirGeometry(pointCount, vals) {
  const n = Number(pointCount) || 0;
  const vr = parseInt((vals && vals.cir_rings) || '', 10);
  const va = parseInt((vals && vals.cir_axes) || '', 10);
  if (Number.isFinite(vr) && Number.isFinite(va) && vr > 0 && va > 0 && vr * va === n) {
    return { rings: vr, axes: va };
  }
  /* 推断：轴数优先，找一个能整除交点数、且圈数合理的组合 */
  const AXIS_PREF = [8, 7, 9, 6, 10, 5, 12, 11, 4];
  for (const a of AXIS_PREF) {
    if (n % a === 0 && n / a >= 2 && n / a <= 8) return { rings: n / a, axes: a };
  }
  if (n === 32) return { rings: 4, axes: 8 };          // 老存档的经典几何
  const axes = Math.max(1, Math.min(12, Math.ceil(Math.sqrt(n)) || 8));
  return { rings: Math.max(1, Math.ceil(n / axes)), axes };
}

/** 圈数 → 每圈半径（%），第 1 个是最内圈。
    4 圈时【保持原来的 12 / 24 / 36 / 46】，画面和以前一模一样；
    其它圈数就按同样的最外圈（46%）等分。 */
function cirRadii(ringCount, outer) {
  const n = Math.max(1, Number(ringCount) || 4);
  const max = Number(outer) || 46;
  if (n === 4) return [12, 24, 36, 46];
  const out = [];
  for (let i = 1; i <= n; i++) out.push(Math.round((max * i / n) * 100) / 100);
  return out;
}

/* ============================================================
   九转连环 · 「上一期开奖号」的后区部分（用户 2026-10-20）
   ------------------------------------------------------------
   用户原话：「九转图 编程每次开奖后自动抓取开奖号码 + 在下一期新的图
   出来的时候，把上一期开奖号码颜色深一点渲染出来」。
   · 圈上把 1~33（大乐透 1~35）全号铺满，所以「上一期开奖号」本来都在
     圈上有位置 —— 深浅由 stats.js 铺好的 cir_points 的 H 位决定；
   · 双色球的蓝球 / 大乐透的后区，号码也落在 1~33(35) 里，圈上同样有位，
     但 cir_points 只标了主区（红球 / 前区）。要「一起加深」且和红球
     区分开，就得知道哪几个号是后区 → 深蓝；红球 → 深红。
   · 单一来源：和 stats.js 的 lastIssueNumsFor 取「上期开奖号」同一期，
     即 DRAW_HISTORY.games[gid][0].areas（history.js，最新在前）。
     取不到 → 返回 []，全部命中点仍按红球渲染，行为不变、绝不报错。
   ============================================================ */
function cirBackNums(gameId, vals) {
  const out = [];
  const push = (v) => {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0 && out.indexOf(n) < 0) out.push(n);
  };
  try {
    /* ① 数据层已经铺好就直接用（stats.js 以后加了 cir_back 这个键，这里自动生效） */
    if (vals && vals.cir_back) {
      String(vals.cir_back).split(/[\s,，、]+/).forEach(push);
      if (out.length) return out;
    }
    /* ② 从最新一期开奖里读后区 */
    let hist = [];
    if (typeof DRAW_HISTORY !== 'undefined' && DRAW_HISTORY && DRAW_HISTORY.games) {
      hist = DRAW_HISTORY.games[gameId] || [];
    } else if (typeof getHistory === 'function') {
      hist = getHistory(gameId) || [];
    }
    const areas = (hist && hist[0] && hist[0].areas) || {};
    /* 后区按【区名】找：双色球 blue / 大乐透 back（不按彩种名写死） */
    const backKey = ['blue', 'back', 'special'].find((k) => Array.isArray(areas[k]) && areas[k].length);
    if (!backKey) return out;
    /* 这里【全部】返回，不和主区去重：
         图注要如实写出「蓝球：04」，哪怕 04 同时是红球（双色球红 01~16
         和蓝 01~16 本来就重叠）。
       去重（同一个号到底画深红还是深蓝）在下面 circle() 里做 ——
       规则：主区优先（红球命中就画深红，见 isBack 的 !p.isHit 判断）。 */
    areas[backKey].forEach(push);
  } catch (e) { /* 忽略：读不到就不加蓝标记，红球照样加深 */ }
  return out;
}

/* ============================================================
   字谜区（只有 福彩3D / 排列3 的 main 图用）
   ------------------------------------------------------------
   数据来源：全局 ZIMI_DATA（zimi-data.js，build-zimi.mjs 抓的）。
   结构：ZIMI_DATA[gameId] = { issue, title, lines: ['每行一句', ...] }
   抓不到 / 文件缺失 → 这里画「本期暂无」，绝不抛错（不能因为字谜把整页弄崩）。
   ⚠️ 这个文件缺失时 typeof 判断必须留着 —— render.js 可能先于它加载。
   ============================================================ */
function zimiDataFor(gameId) {
  try {
    if (typeof ZIMI_DATA === 'undefined' || !ZIMI_DATA) return null;
    const d = ZIMI_DATA[gameId];
    if (!d || !Array.isArray(d.lines) || !d.lines.length) return null;
    return d;
  } catch (e) { return null; }
}

/** 右侧【竖排】字谜块：标题 + 每行一句 */
function zimiBlock(gameId) {
  const box = el('div', 'r-zimi');
  const d = zimiDataFor(gameId);

  const head = el('div', 'r-zimihead');
  head.appendChild(el('span', 'r-zimititle', '字谜'));
  if (d && d.issue) head.appendChild(el('span', 'r-zimiissue', '第 ' + d.issue + ' 期'));
  box.appendChild(head);

  if (d && d.title) box.appendChild(el('div', 'r-zimisub', d.title));

  const body = el('div', 'r-zimilines');
  if (d) {
    /* 竖着排：每行一句 */
    d.lines.forEach((line) => body.appendChild(el('div', 'r-zimiline', String(line))));
  } else {
    body.appendChild(el('div', 'r-zimiline none', '本期暂无'));
  }
  box.appendChild(body);
  return box;
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
      /* 【空串 ≠ 缺值】
         null / undefined（真·没有这个字段）→ 画占位符（一个破折号），和以前一样；
         空字符串（字段存在、但这张图这一格本来就没内容，例如
         「七星彩前区 0~9 池=全区 → 杀号无从杀起」）→ 画成空白，
         不留破折号、也不要「无」这种字。
         用户硬要求：页面上不能出现破折号占位符。 */
      if (v === undefined || v === null) {
        item.appendChild(el('div', 'r-value empty', '—'));
      } else {
        item.appendChild(el('div', 'r-value' + (v ? '' : ' empty'), String(v)));
      }
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

  /* ---- 两位数字型（3D/排列） ----
     ⚠️ 模板上打了 zimi: true 的（现在只有 福彩3D / 排列3 的 main 图），
        右边那 ~330px 空白处会【竖着】排上抓来的字谜（每行一句）。
        做法：号码那几行全部挂到 host（左栏），最后再拼成「左号码 / 右字谜」两栏。
        其它彩种没有 zimi: true → host 就是 box 本身，版式和以前一模一样。 */
  digit(sec, vals, build, gameId) {
    const box = el('div', 'r-rows');
    const host = sec.zimi ? el('div', 'r-digitmain') : box;
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
      host.appendChild(row);
    }
    if (sec.positions) {
      sec.positions.forEach((p) => {
        const row = el('div', 'r-numrow');
        row.appendChild(el('span', 'r-numlabel', p.label));
        const balls = el('span', 'r-ballwrap');
        const nums = parseTicketNums(vals[p.key]);
        numBalls(nums, p.count, p.color || 'gold', 'md').forEach((b) => balls.appendChild(b));
        row.appendChild(balls);
        host.appendChild(row);
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
      host.appendChild(f);
    }
    if (sec.footerText) host.appendChild(el('div', 'r-note', sec.footerText));

    /* 字谜区只有 fc3d / pl3 的 main 图有（模板里那个 zimi: true） */
    if (!sec.zimi) return box;
    const wrap = el('div', 'r-digitwrap');
    wrap.appendChild(host);
    wrap.appendChild(zimiBlock(gameId));
    box.appendChild(wrap);
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

  /* ---- 九转连环（同心圆环 × 米字轴，【全号铺满】版） ----
     【只画，不造号】版面和号码全部来自 stats.js 的 createJiuZhuan：
       · 几何【两个彩种完全一样】（见 stats.js 的 JIUZHUAN_GEOMETRY）：
           双色球 4 圈 × 8 轴 = 32 交点 + 中心 1 个号码位 = 33 位 → 01~33 全铺满
           大乐透 4 圈 × 8 轴 = 32 交点 + 中心 1 个号码位 = 33 位，
                  余下的 34、35 放在【中心旁边的小字球】里 → 01~35 全铺满
       · 每个交点都有号码；上期开奖号【所在的那个点】isHit:true → 深色，
         其余号码浅色（用户说的「有深浅，开奖的有标记」）
     stats.js 把这些点压成定宽串 vals.cir_points（3 字符/点：H 或 - 开头，
     然后是两位号码）。这里优先调 stats.js 的 decodeCirPoints 解码，
     stats.js 没加载时用下面这段【等价】兜底解码 —— 两边口径必须一致。

     ⚠️ 中心旁边的小字球【不在 cir_points 里】，单独走一个字段
        vals.cir_side（逗号分隔的两位号，例：大乐透 '34,35'；
        双色球是空串）。老存档没有这个键 → 不画小字球，行为不变。

     ⚠️ 老存档（更早的两版）没有 cir_points、只有逐格键：
        cir_num_1~32（无补零）/ cir_num_01~32（补零）+ cir_num_center，
        这里两种键都读，旧数据不会画成空白。

     ⚠️ 坐标不写死方向表了：用「角度 → 单位向量」现算
        （角度 = 圈去 90°，让轴 1 朝正上方，顺时针排；
        8 轴时得到的就是原来的 上/右上/右/…/左上 八个方向，一个不差）。
        圆心 (50%,50%)；最外圈半径 46%（留 4% 边距，避免号码点贴边被切）。 */
  circle(sec, vals, build, gameId) {
    const CIR_CENTER = { x: 50, y: 50 };            // 圆心（%）
    const CIR_OUTER = 46;                           // 最外圈半径（%）

    /* ---------- 交点：解码 stats.js 铺好的定宽串 cir_points ----------
       3 字符一个点：第 1 位 H = 命中（上期开奖号）/ - = 未开出，后 2 位是号码。 */
    let pts = [];
    if (typeof decodeCirPoints === 'function') {
      try { pts = decodeCirPoints(vals.cir_points); } catch (e) { pts = []; }
    } else {
      const s = String(vals.cir_points || '');
      for (let i = 0; i + 2 < s.length; i += 3) {
        const body = s.slice(i + 1, i + 3);
        pts.push({ isHit: s[i] === 'H', num: body === '--' ? null : parseInt(body, 10) });
      }
    }

    /* 老存档兜底：cir_num_01…/cir_num_1…（两种键都认）+ cir_num_center。
       读到的号同样按「圈优先」的顺序铺到交点上，旧存档照样出图。 */
    if (!pts.length && (vals.cir_num_01 !== undefined || vals.cir_num_1 !== undefined)) {
      const legacyN = parseInt(vals.cir_rings, 10) * parseInt(vals.cir_axes, 10) || 32;
      for (let i = 1; i <= legacyN; i++) {
        const padded = vals['cir_num_' + String(i).padStart(2, '0')];
        const plain = vals['cir_num_' + i];
        const raw = (padded !== undefined && padded !== '') ? padded : plain;
        const n = parseInt(raw, 10);
        pts.push({ isHit: false, num: Number.isFinite(n) ? n : null });
      }
    }

    /* ---------- 圈数 / 轴数 ----------
       优先读 stats.js 铺好的 cir_rings / cir_axes；读不到（老存档、手写数据）
       就按交点数推断：优先 4×8，其次 5×7，再不行找能整除的轴数。 */
    const geo = cirGeometry(pts.length, vals);
    const CIR_RADII = cirRadii(geo.rings, CIR_OUTER);

    const box = el('div', 'r-circwrap');
    const c = el('div', 'r-circle');

    /* 同心圆环：最内圈先入 DOM、最外圈最后画 → 环线压在号码点下面。
       直径【内联】写在每个环上（inline 覆盖 styles.css 里 ringN 的旧值），
       这样 4 圈 / 5 圈都能画，且第 N 圈 = 数据里的 data-ring=N = 从内往外第 N 圈。 */
    for (let i = geo.rings; i >= 1; i--) {
      const ring = el('div', 'r-ring ring' + i);
      ring.style.width = (CIR_RADII[i - 1] * 2).toFixed(2) + '%';
      ring.style.height = (CIR_RADII[i - 1] * 2).toFixed(2) + '%';
      ring.setAttribute('data-ring', String(i));
      c.appendChild(ring);
    }

    /* 米字轴：每条都是一根过圆心的直线，旋转角 = createJiuZhuan 的 axisList 角度，
       第 i 条 = i × (360 / 轴数)。8 轴时就是 0/45/…/315（和以前完全一样）。
       旋转角用内联 style 写死，不依赖 CSS 变量 —— 导出图片时也原样带上。 */
    for (let i = 0; i < geo.axes; i++) {
      const ang = Math.round(i * (360 / geo.axes) * 100) / 100;
      const line = el('div', 'r-ciraxis');
      line.setAttribute('data-axis', '轴' + (i + 1));
      line.setAttribute('data-angle', String(ang));
      line.setAttribute('style', 'transform:rotate(' + ang + 'deg)');
      c.appendChild(line);
    }

    /* ---------- 上一期开奖号里的【后区】部分（双色球蓝球 / 大乐透后区） ----------
       圈上 1~33(35) 全号铺满，后区的号也有位置。用户要求「开奖号颜色深一点」，
       红球/前区 = 深红、后区 = 深蓝，所以先把后区那几个号单独拿出来。 */
    const backNums = cirBackNums(gameId, vals);
    const backSet = Object.create(null);
    backNums.forEach((n) => { backSet[n] = true; });

    /* ---------- 中心：双色球 17 / 大乐透 18（固定值，来自配置） ----------
       cir_center_pos = 1 表示这一格也算一个号码位（两彩种都是 1：
       双色球 17、大乐透 18 都自己占一个号位），这时它参与命中高亮；
       = 0 表示是纯装饰位（老存档 / 其它彩种）。 */
    const centerRaw = (vals.cir_num_center !== undefined && vals.cir_num_center !== '')
      ? vals.cir_num_center : vals[sec.centerKey];
    const centerNum = parseInt(centerRaw, 10);
    const centerIsPos = String(vals.cir_center_pos || '') === '1';
    let centerHit = String(vals.cir_center_hit || '') === '1';
    /* 老存档没有 cir_center_hit 时，用「上期开奖号原文」自己判一下（别把命中判丢） */
    if (centerHit === false && centerIsPos && vals.cir_source) {
      const src = String(vals.cir_source).split(/[\s,，、]+/).map((s) => parseInt(s, 10));
      if (Number.isFinite(centerNum) && src.indexOf(centerNum) >= 0) centerHit = true;
    }
    /* 中心那个号本身是蓝球/后区 → 画深蓝（老存档没有这个标记时按 0 处理）。
       同样主区优先：中心已经是红球命中就不改蓝。 */
    const centerBack = Number.isFinite(centerNum) && !centerHit && !!backSet[centerNum];
    const centerOn = centerHit || centerBack;
    const center = el('div', 'r-circenter' + (centerOn ? ' hit' : ' dim') + (centerBack ? ' bl' : ''));
    center.setAttribute('data-hit', centerOn ? '1' : '0');
    center.setAttribute('data-zone', centerBack ? 'back' : (centerOn ? 'main' : ''));
    center.setAttribute('data-center-pos', centerIsPos ? '1' : '0');
    center.textContent = Number.isFinite(centerNum) ? numText(centerNum) : '—';
    c.appendChild(center);

    /* ---------- 圈 × 轴 = 全部交点 ----------
       顺序和 createJiuZhuan 完全一致：圈优先（rings.forEach → axisList.forEach），
       所以第 i 个点 = 第 floor(i / 轴数) 圈 × 第 i % 轴数 个轴。 */
    let hitCount = 0;      // 环上的命中数（主区）
    let numCount = 0;      // 环上有号码的点数
    let emptyCount = 0;    // 环上没号码的点数（正常情况下是 0）
    let backHitCount = 0;  // 环上命中的【后区】号（画深蓝）
    CIR_RADII.forEach((r, ringIdx) => {
      for (let dirIdx = 0; dirIdx < geo.axes; dirIdx++) {
        const p = pts[ringIdx * geo.axes + dirIdx] || { num: null, isHit: false };
        const has = p.num !== null && p.num !== undefined && Number.isFinite(Number(p.num));
        /* 这个点是不是「上一期开奖号码」：主区（红球/前区）= 深红，
           后区（蓝球/后区）= 深蓝；两个都不是才浅色。
           ⚠️ 同一个号既中红球又是蓝球时（双色球红 01~16 / 蓝 01~16 重叠）
              → 主区优先，画深红（!p.isHit 这一条就是去重）。 */
        const isBack = has && !p.isHit && !!backSet[Number(p.num)];
        const isOn = has && (p.isHit || isBack);
        const dot = el('div', 'r-cirnum' + (has ? (isOn ? ' hit' : ' dim') + (isBack ? ' bl' : '') : ' empty'));
        /* 角度 = -90° + i × (360 / 轴数)：轴 1 朝正上方，顺时针排 */
        const rad = (-90 + dirIdx * (360 / geo.axes)) * Math.PI / 180;
        dot.style.top = (CIR_CENTER.y + Math.sin(rad) * r).toFixed(2) + '%';
        dot.style.left = (CIR_CENTER.x + Math.cos(rad) * r).toFixed(2) + '%';
        dot.setAttribute('data-ring', String(ringIdx + 1));        // = 模板里的 ringId / radius
        dot.setAttribute('data-axis', '轴' + (dirIdx + 1));        // = 模板里的 axisName
        dot.setAttribute('data-angle', String(Math.round(dirIdx * (360 / geo.axes) * 100) / 100));
        dot.setAttribute('data-radius', String(ringIdx + 1));      // radius 是圈的序号
        if (has) {
          dot.textContent = numText(p.num);
          dot.setAttribute('data-hit', isOn ? '1' : '0');
          dot.setAttribute('data-zone', isBack ? 'back' : (p.isHit ? 'main' : ''));
          numCount++;
          if (p.isHit) hitCount++;
          if (isBack) backHitCount++;
        } else {
          /* 空位：点位照画，就是【不写数字】（全号铺满后这里正常不会出现） */
          dot.setAttribute('data-hit', '0');
          emptyCount++;
        }
        c.appendChild(dot);
      }
    });

    /* ---------- 中心旁边的小字球（大乐透的 34、35） ----------
       stats.js 的 cir_side = 逗号分隔的两位号（大乐透 '34,35'，双色球空串）。
       它们是【中心 + 32 个交点还装不下】的那几个号，画成中心下方一排小字球，
       字号比环上的号码点小、位置就在中心 18 旁边 —— 这样几何和双色球一样，
       号码还一个不漏。老存档没有 cir_side → 这一排不画。 */
    const sideNums = String(vals.cir_side || '')
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
    let sideHitCount = 0;
    /* 命中判定口径和中心/环上一致：这个号在【上期开奖号原文】里出现过 */
    const sideSrc = String(vals.cir_source || '').split(/[\s,，、]+/).map((s) => parseInt(s, 10));
    if (sideNums.length) {
      const sideWrap = el('div', 'r-cirside');
      /* 布局全部内联：不新增 styles.css 依赖，导出图片时也原样带上 */
      sideWrap.setAttribute('style',
        'position:absolute;left:50%;top:68%;transform:translateX(-50%);'
        + 'display:flex;gap:6px;justify-content:center;z-index:3;pointer-events:none');
      sideNums.forEach((n) => {
        /* 主区优先：小字球已经在 cir_source（上期主区开奖号）里就不改蓝 */
        const isBack = !!backSet[n] && sideSrc.indexOf(n) < 0;
        const isHit = sideSrc.indexOf(n) >= 0 || isBack;
        const ball = el('span', 'r-cirsideball' + (isHit ? ' hit' : ' dim') + (isBack ? ' bl' : ''));
        ball.setAttribute('style',
          'display:inline-block;min-width:18px;padding:1px 4px;border-radius:50%;'
          + 'font-size:11px;line-height:16px;text-align:center;'
          + 'background:' + (isHit ? (isBack ? '#1f5fd6' : '#c0392b') : '#eceff1') + ';'
          + 'color:' + (isHit ? '#fff' : '#455a64') + ';font-weight:bold');
        ball.setAttribute('data-side', '1');
        ball.setAttribute('data-hit', isHit ? '1' : '0');
        ball.setAttribute('data-zone', isBack ? 'back' : (isHit ? 'main' : ''));
        ball.textContent = numText(n);
        sideWrap.appendChild(ball);
        if (isHit) sideHitCount++;
      });
      c.appendChild(sideWrap);
    }

    box.appendChild(c);

    /* 图例：两种深浅（命中 / 其余号码），口径就是 cir_points 的 H 位（含中心/小字球）
       + 命中里再分一档：后区（蓝球 / 后区）单独一个蓝点，和深红区分开 */
    const hitAll = hitCount + (centerHit ? 1 : 0) + sideHitCount;   // 主区（红球/前区）
    const backAll = backHitCount + (centerBack ? 1 : 0);            // 后区（蓝球/后区）
    /* 其余号码 = 环上没开的 + 小字球里没开的（后区那几个已经从「未开」里扣掉） */
    const dimAll = (numCount + sideNums.length) - hitAll - backAll;
    const legend = [
      { label: '上期开奖号（命中 ' + hitAll + '）', color: 'hit' },
      { label: '其余号码（' + dimAll + '）', color: 'dim' }
    ];
    if (backAll) {
      legend.splice(1, 0, {
        label: '上期' + (gameId === 'dlt' ? '后区' : '蓝球') + '（' + backAll + '）',
        color: 'hit bl'
      });
    }
    const lg = el('div', 'r-legend');
    legend.forEach((l) => {
      const item = el('span', 'r-legenditem');
      const sw = el('span', 'r-dot ' + l.color);
      /* 色点颜色内联写死：styles.css 里只有 .r-dot.dim，命中/后区这两档
         不能靠外部样式表（导出图片时不带 CSS 也会缺色） */
      const bg = (l.color.indexOf('bl') >= 0) ? '#1f5fd6' : (l.color.indexOf('hit') >= 0 ? '#c0392b' : '');
      if (bg) sw.setAttribute('style', 'background:' + bg + ' !important');
      item.appendChild(sw);
      item.appendChild(document.createTextNode(l.label));
      lg.appendChild(item);
    });
    box.appendChild(lg);

    /* 图注：本图铺了什么、深浅怎么读 —— 让「一个号不漏」在页面上看得见 */
    const sideText = sideNums.length
      ? ' + 中心旁 ' + sideNums.length + ' 个小字球（' + sideNums.map(numText).join(' ') + '）'
      : '';
    const covered = numCount + (centerIsPos ? 1 : 0) + sideNums.length;
    const rangeText = geo.rings + ' 圈 × ' + geo.axes + ' 轴'
      + (centerIsPos ? ' + 中心 1 格' : '')
      + sideText
      + ' = ' + covered + ' 个号码位';
    const backText = backNums.length
      ? '　|　' + (gameId === 'dlt' ? '后区' : '蓝球') + '：' + backNums.map(numText).join(' ')
      : '';
    const capText = '上期开奖号：' + (vals.cir_source || '—') + backText
      + '　|　' + rangeText + '，本彩种全部号码 1~' + covered
      + ' 一键铺满（浅色为未开出，深红/深蓝为上期开出）';
    box.appendChild(el('div', 'r-caption', capText));

    if (sec.note) box.appendChild(el('div', 'r-caption', sec.note));
    return box;
  },

  /* ---- 九宫图（洛书 + 每期自动偏移） ----
     【本函数只负责画】本期盘面【由 stats.js 算好】放在 vals.jg_matrix 里
     （stats.js 的 autoFillWuxing 走统一入口 createNineChartPack → luoshu.grid）。
     这里优先读 jg_matrix，读不到才退回用户给的基准洛书。

     ⚠️ 为什么不再现算：stats.js 侧那一版九宫重写把
        resetLuShu / matrixOffsetShift / BASE_LU_SHU / cloneMatrix 都删掉了，
        而这里原来还在调 resetLuShu() —— 会直接抛 ReferenceError，
        整张「五行 / 绕胆 / 九转连环 / 九宫」图渲染不出来（实测 ssq/dlt 的
        wuxing 图位会整块从页面上消失）。现在改成只读 stats.js 铺好的矩阵，
        两边就不会因为「谁定义了什么函数」而对不上。 */
  jiugong(sec, vals, build, gameId) {
    const box = el('div', 'r-jgwrap');
    const g = el('div', 'r-jiugong');

    /* 用户给的基准洛书（只读兜底） */
    const BASE_LU_SHU = [
      [4, 9, 2],
      [3, 5, 7],
      [8, 1, 6]
    ];
    let cur = BASE_LU_SHU;
    try {
      if (typeof vals.jg_matrix === 'string' && vals.jg_matrix.length >= 9) {
        const rows = vals.jg_matrix.split(',').map((row) => row.split('').map(Number));
        if (rows.length === 3 && rows.every((r) => r.length === 3 && r.every((n) => Number.isFinite(n)))) {
          cur = rows;
        }
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
    /* 【副标题】用户要求去掉「· 全网公开晒票号码占比」—— 只留「彩种 第 X 期」。 */
    const sub = `${H.name} 第 ${H.issue} 期`;
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

        /* ---------- 3. 数据来源标注 —— 【用户要求整块删掉】 ----------
       用户原话：「我框起来的不要了」（框的是「数据来源：近 30 期开奖频率 · 仅为统计展示」）。
       现在这一行不再输出。数据来源信息仍然存在于 heatmap-data.js 的
       source / sourceLabel / note 字段里，需要时可以去那里查。 */
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

/* __H_UNIQUE__ 用户 2026-10-18：「热力图最好每一个都高度不同」
   —— 同占比的柱子原来一样高（33 个号只有 9 种高度）；
      这里按柱序号加 0~2px 的微差，肉眼仍是真实比例，但每根都不完全相同。 */
function hUnique(h, idx) {
  const bump = Math.round(((idx || 0) % 5) * 0.5);   /* 0,1,1,1,2 px */
  return Math.max(1, h + bump);
}

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

  items.forEach((it, idx) => {
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
      `position:absolute;left:0;right:0;bottom:0;height:${hUnique(h, idx)}px;` +   /* __H_UNIQUE__ */
      `background:linear-gradient(to top, ${hmColor(pct, maxPct, colorKind)} 0%, ${hmColor(pct, maxPct, colorKind)} 58%, ${hmColor(pct, maxPct, colorKind)}cc 84%, ${hmColor(pct, maxPct, colorKind)}55 100%);border-radius:2px 2px 0 0;`;

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
       九转连环按彩种取的是 stats.js 铺好的 cir_points（渲染器只画不算） */
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
