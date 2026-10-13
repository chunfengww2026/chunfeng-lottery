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

/** 号码数组 → 球元素数组；缺的补灰球，保证每行个数固定 */
function numBalls(nums, count, color, size) {
  const out = [];
  for (let i = 0; i < count; i++) {
    if (i < nums.length) out.push(rBall(twoDigit(nums[i]), color, size));
    else out.push(rBall('', color, size, 'empty'));
  }
  return out;
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
        balls.appendChild(rBall(twoDigit(nums[0]), 'gold', 'md'));
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
      // 第一个金色，其余红色（对应模板里 2 金 + 5 红）
      nums.forEach((n, i) => balls.appendChild(rBall(String(n), i === 0 ? 'gold' : 'red', 'md')));
      for (let i = nums.length; i < sec.groupRow.count; i++) {
        balls.appendChild(rBall('', i === 0 ? 'gold' : 'red', 'md', 'empty'));
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

  /* ---- 绕胆图色块 ---- */
  grid(sec, vals) {
    const box = el('div', 'r-gridwrap');
    const grid = el('div', 'r-grid');
    grid.style.gridTemplateColumns = `repeat(${sec.cols || 4}, 1fr)`;

    // 色块颜色循环：按模板里图2的顺序
    // 双色球：3金胆红 + 3银胆橙 + 7紫拖码 + 3蓝关注
    // 大乐透：4金胆紫 + 4银胆橙 + 4紫拖码 + 4蓝关注
    const colors = sec.colors || (sec.cols === 4 && sec.rows === 4
      ? ['goldred', 'goldred', 'goldred', 'goldred',
         'orange', 'orange', 'orange', 'orange',
         'purple', 'purple', 'purple', 'purple',
         'blue', 'blue', 'blue', 'blue']
      : []);

    const total = (sec.cols || 4) * (sec.rows || 4);
    for (let i = 0; i < total; i++) {
      const cell = el('div', 'r-cell ' + (colors[i] || 'purple'));
      const v = vals['grid_' + i];
      cell.textContent = v ? twoDigit(parseInt(v, 10) || v) : '';
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
      const balls = el('span', 'r-ballwrap');
      const nums = parseTicketNums(vals[e.key]);
      nums.forEach((n) => balls.appendChild(rBall(twoDigit(n), 'wx' + i, 'sm')));
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

  /* ---- 九转连环（同心圆） ---- */
  circle(sec, vals) {
    const box = el('div', 'r-circwrap');
    const c = el('div', 'r-circle');
    // 4 个同心环
    for (let i = 4; i >= 1; i--) {
      const ring = el('div', 'r-ring ring' + i);
      c.appendChild(ring);
    }
    // 中心
    const center = el('div', 'r-center');
    center.textContent = vals[sec.centerKey] || '—';
    c.appendChild(center);

    // 8 个位置的号码（米字四轴的端点和中间层）
    const slots = [
      { top: '4%',  left: '50%' }, { top: '22%', left: '50%' },
      { top: '50%', left: '4%'  }, { top: '50%', left: '22%' },
      { top: '50%', left: '78%' }, { top: '50%', left: '96%' },
      { top: '78%', left: '50%' }, { top: '96%', left: '50%' }
    ];
    slots.forEach((s, i) => {
      const v = vals['cir_' + i];
      if (!v) return;
      const dot = el('div', 'r-ringnum');
      dot.style.top = s.top;
      dot.style.left = s.left;
      dot.textContent = twoDigit(parseInt(v, 10) || v);
      c.appendChild(dot);
    });

    box.appendChild(c);
    if (sec.note) box.appendChild(el('div', 'r-caption', sec.note));
    return box;
  },

  /* ---- 九宫图（洛书 3×3） ---- */
  jiugong(sec, vals) {
    const box = el('div', 'r-jgwrap');
    const g = el('div', 'r-jiugong');
    // 洛书固定排布
    const luoshu = [4, 9, 2, 3, 5, 7, 8, 1, 6];
    luoshu.forEach((base, i) => {
      const cell = el('div', 'r-jgcell' + (i === 4 ? ' center' : ''));
      // 中心格可以被用户覆盖
      const custom = vals['jg_' + i] || (i === 4 ? vals[sec.centerKey] : '');
      cell.textContent = custom || base;
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
          item.appendChild(rBall(twoDigit(m[1]), g.color || 'red', 'sm'));
          item.appendChild(el('span', 'r-rankcount', `出现${m[2]}次`));
        } else {
          item.appendChild(document.createTextNode(v));
        }
        list.appendChild(item);
      }
      box.appendChild(list);
    });
    return box;
  }
};

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

  /* ---------- 红色页头 ---------- */
  const head = el('div', 'r-head');
  head.appendChild(el('div', 'r-headbrand', tpl.footer.brand));
  head.appendChild(el('div', 'r-headshop', '— ' + tpl.footer.shop + ' —'));
  head.appendChild(el('div', 'r-headtitle', img.title));
  const issueLine = el('div', 'r-headissue');
  issueLine.innerHTML = `第&nbsp;&nbsp;<b>${(data && data.issue) || '******'}</b>&nbsp;&nbsp;期`;
  head.appendChild(issueLine);
  root.appendChild(head);

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
    if (fn) block.appendChild(fn(sec, vals, build));

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
