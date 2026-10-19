/* ============================================================
   draw-data.js —— 开奖号码：读取 + 展示

   数据来源有两个，优先级从高到低：
     1. draws.js   —— 由 build-draws.mjs 自动生成（抓取 + AI 解析）
     2. localStorage —— 浏览器本地存储（手动录入的兜底）

   存储结构（一个彩种一条，只存最新一期）：
     {
       issue: "2024118",                      // 期号
       date:  "2026-10-13",                   // 开奖日期（可选）
       source: "500彩票网",                    // 数据来源说明
       areas: { main: [1,2,3], special: [9] }  // 各区的号码
     }

   注意：用 draws.js 而不是 fetch 读 JSON，是因为本程序以 file://
   方式打开，浏览器不允许 fetch 本地文件（CORS）。
   ============================================================ */

const DRAW_KEY = 'cdd.draws.v1';   /* 旧 localStorage 的键名，仅留作注释参考，已不再使用 */

/* 【不再用 localStorage —— 用户明令「不要用 localStorage」】
   原来这里是 localStorage.getItem/setItem(DRAW_KEY)：把开奖数据缓存在浏览器里。
   现在只存在下面这个【内存变量】里：刷新页面自然丢失 → 每次重新读 draws.js / 重新拉最新数据。
   ⚠️ 存的是 JSON 字符串（和原来 localStorage 里存的东西一模一样），
      所以读取侧的 JSON.parse 逻辑一行都不用改，行为差别只有"刷新后不再有本地覆盖"。 */
let DRAW_CACHE_JSON = null;

/* ---------------- 读取 ---------------- */

/** 读出全部开奖数据（合并文件数据与内存里的数据，内存优先） */
function loadDraws() {
  let fromFile = {};
  try {
    // DRAW_DATA 由 draws.js 定义；文件不存在时为 undefined
    if (typeof DRAW_DATA !== 'undefined' && DRAW_DATA && DRAW_DATA.games) {
      fromFile = DRAW_DATA.games;
    }
  } catch (e) { /* 忽略 */ }

  let fromLocal = {};
  try {
    if (DRAW_CACHE_JSON) fromLocal = JSON.parse(DRAW_CACHE_JSON);
  } catch (e) { /* 忽略 */ }

  return Object.assign({}, fromFile, fromLocal);
}

/** 取数据文件的生成时间 */
function getDrawDataTime() {
  try {
    if (typeof DRAW_DATA !== 'undefined' && DRAW_DATA && DRAW_DATA.updated) {
      return DRAW_DATA.updated;
    }
  } catch (e) { /* 忽略 */ }
  return null;
}

/** 写入全部开奖数据（仅内存部分）—— 不再落 localStorage */
function saveDraws(all) {
  try {
    DRAW_CACHE_JSON = JSON.stringify(all);
    return true;
  } catch (e) {
    console.warn('保存开奖数据失败:', e);
    return false;
  }
}

/** 清掉内存缓存（latest-draws.js 用：页面顶部已经用新拉到的数据重画过了，
    不能再让旧的本地覆盖盖回去）—— 原来是 localStorage.removeItem(DRAW_KEY) */
function clearDrawCache() {
  DRAW_CACHE_JSON = null;
}

/** 取某个彩种的最新开奖 */
function getDraw(gameId) {
  return loadDraws()[gameId] || null;
}

/** 保存某个彩种的最新开奖 */
function setDraw(gameId, data) {
  const all = loadDraws();
  all[gameId] = data;
  return saveDraws(all);
}

/** 删除某个彩种的开奖记录 */
function clearDraw(gameId) {
  const all = loadDraws();
  delete all[gameId];
  return saveDraws(all);
}

/* ============================================================
   下一期开奖日期
   ------------------------------------------------------------
   推荐图标题显示的是「下一期要开奖的时间」，不是已开奖的时间。
   例：大乐透周一/三/六开奖，今天周二 → 下一期是周三。
   ============================================================ */

/** 各彩种开奖的星期（0=周日, 1=周一 … 6=周六）；null 表示每天 */
const DRAW_WEEKDAYS = {
  ssq:  [0, 2, 4],        // 双色球：周二、四、日
  dlt:  [1, 3, 6],        // 大乐透：周一、三、六
  qlc:  [1, 3, 5],        // 七乐彩：周一、三、五
  fc3d: null,             // 福彩3D：每天
  kl8:  null,             // 快乐8：每天
  pl3:  null,             // 排列3：每天
  pl5:  null,             // 排列5：每天
  /* 【七星彩不是每天开】原来这里写的是 null（每天），是错的。
     按 history.js 的实开记录核对（2026-09 ~ 10）：
       10-06 二 26114 · 10-09 五 26115 · 10-11 日 26116
       10-13 二 26117 · 10-16 五 26118 · 10-18 日 26119
     → 周日 / 周二 / 周五 开奖 = [0, 2, 5]。
     配错的后果（2026-10-19 前真实发生过）：七星彩被当成每天开奖，
     每一班都算「今天就是这一期」，于是
       10-14 / 10-15 / 10-16 三天的推荐被重复标成同一个期号 26118，
       10-17 / 10-18 两天重复标成 26119 —— 期号重复、票面日期也不是那一期的。 */
  qxc:  [0, 2, 5]         // 七星彩：周日、二、五
};

/** 把日期格式化成 2026-10-14 */
function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 算「本期」开奖日期
 * 规则：今天是开奖日就显示今天；今天不是开奖日，才往后找最近的开奖日。
 *   例：大乐透周一/三/六开奖
 *       周三看 → 2026-10-14（就是今天）
 *       周二看 → 2026-10-14（下一个开奖日）
 * @param {string} gameId
 * @param {Date}   [from] 从哪天算起，默认今天
 * @returns {string} YYYY-MM-DD
 */
function nextDrawDate(gameId, from) {
  const today = from ? new Date(from) : new Date();
  today.setHours(0, 0, 0, 0);

  const days = DRAW_WEEKDAYS[gameId];

  // 每天开奖的彩种：就是今天
  if (days === null || days === undefined) {
    return fmtDate(today);
  }

  // 今天就是开奖日 → 显示今天
  if (days.includes(today.getDay())) {
    return fmtDate(today);
  }

  // 今天不是 → 往后找最近的开奖日（1~7 天内必有一天）
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (days.includes(d.getDay())) return fmtDate(d);
  }

  // 兜底
  return fmtDate(today);
}

/** 下一期开奖是星期几（中文） */
function nextDrawWeekday(gameId) {
  const s = nextDrawDate(gameId);
  const d = new Date(s + 'T00:00:00');
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
}

/* ============================================================
   下一期期号
   ------------------------------------------------------------
   各彩种期号格式不同，自动识别并保持位数：
     双色球 / 七乐彩  2026117   → 「2026」+「117」，自增后段
     大乐透 / 排列3/5  26116    → 「26」+「116」，自增后段
     快乐8 / 福彩3D    2026272  → 「2026」+「272」
   ============================================================ */

/**
 * 把期号自增 1，保持原格式
 * @param {string} issue 如 "26116" 或 "2026117"
 * @returns {string} 如 "26117" 或 "2026118"
 */
function nextIssue(issue) {
  const s = String(issue || '').trim();
  if (!/^\d{5,8}$/.test(s)) return s;   // 格式不认识就原样返回

  const yearLen = s.length >= 7 ? 4 : 2;
  const year = s.slice(0, yearLen);
  const seqRaw = s.slice(yearLen);
  const width = seqRaw.length;

  const yearNum = parseInt(year, 10);
  let seq = parseInt(seqRaw, 10) + 1;
  let nextYear = yearNum;

  // 跨年处理：一年最多 400 期（所有彩种都远少于这个数）
  if (seq > 400) {
    seq = 1;
    nextYear = yearNum + 1;
  }

  // 保持年份位数（两位年份取后两位）
  const yearStr = yearLen === 4
    ? String(nextYear).padStart(4, '0')
    : String(nextYear % 100).padStart(2, '0');

  return yearStr + String(seq).padStart(width, '0');
}

/**
 * 取该彩种「下一期」的期号
 * @param {string} gameId
 * @returns {string} 期号；没有数据时返回空串
 */
function nextIssueFor(gameId) {
  const d = getDraw(gameId);
  if (!d || !d.issue) return '';
  return nextIssue(d.issue);
}

/* ============================================================
   展示
   ============================================================ */

/**
 * 把开奖号码渲染成一行球
 * 各彩种的排布规则和 renderTicketRow 保持一致，这样
 * 首页卡片、板块页、投注列表三处看起来完全一样。
 */
function renderDrawBalls(game, draw, size) {
  const box = document.createElement('span');
  box.style.cssText = 'display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;';
  size = size || 'sm';

  if (!draw || !draw.areas) return box;

  const sep = (txt) => {
    const s = document.createElement('span');
    s.style.cssText = 'color:#5a6272;font-size:13px;margin:0 3px;';
    s.textContent = txt;
    return s;
  };

  // 快乐8：只显示号码
  if (game.playModes) {
    const area = game.areas[0];
    (draw.areas[area.key] || []).forEach((n) => box.appendChild(ballEl(pad(n, 2), area.color, size)));
    return box;
  }

  // 七星彩：前六位 | 最后一位
  if (game.type === 'qxc') {
    (draw.areas.front || []).forEach((d, i) => {
      if (i === 3) box.appendChild(sep('|'));
      box.appendChild(ballEl(String(d), 'red', size));
    });
    box.appendChild(sep('+'));
    box.appendChild(ballEl(String((draw.areas.back || [])[0]), 'blue', size));
    return box;
  }

  // 数字型（3D / 排列3 / 排列5）
  if (game.type === 'digit') {
    (draw.areas.main || []).forEach((d) => box.appendChild(ballEl(String(d), 'red', size)));
    return box;
  }

  // 通用多区（双色球 / 大乐透 / 七乐彩）
  game.areas.forEach((area, i) => {
    if (i > 0) box.appendChild(sep(area.key === 'special' ? '★' : '+'));
    (draw.areas[area.key] || []).forEach((n) => box.appendChild(ballEl(pad(n, 2), area.color, size)));
  });

  return box;
}

/**
 * 给首页卡片用的「开奖号码」区块
 * 有数据就显示号码，没数据就显示提示
 */
function renderCardDraw(game, gameId) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:12px;';

  const draw = getDraw(gameId);

  const label = document.createElement('div');
  label.style.cssText = 'font-size:11px;color:#5a6272;margin-bottom:7px;display:flex;align-items:center;gap:6px;';
  label.innerHTML = draw
    ? `<span>第 <b style="color:#8b93a1">${draw.issue}</b> 期开奖</span>`
    : '<span>本期开奖号码</span>';

  if (draw) {
    wrap.appendChild(label);
    wrap.appendChild(renderDrawBalls(game, draw, 'sm'));
  } else {
    // 没录入：显示一排灰色问号球，提示这里会显示开奖号
    label.innerHTML = '<span>本期开奖号码 · 未录入</span>';
    label.style.color = '#4a5261';
    wrap.appendChild(label);

    const balls = document.createElement('span');
    balls.style.cssText = 'display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;opacity:0.35;';

    if (game.type === 'custom') {
      balls.appendChild(ballEl('—', 'gold', 'sm'));
    } else if (game.type === 'digit') {
      for (let i = 0; i < game.digits; i++) balls.appendChild(ballEl('?', 'gray', 'sm'));
    } else if (game.type === 'qxc') {
      for (let i = 0; i < 6; i++) balls.appendChild(ballEl('?', 'gray', 'sm'));
      balls.appendChild(ballEl('?', 'gray', 'sm'));
    } else {
      game.areas.forEach((area, i) => {
        if (i > 0) {
          const s = document.createElement('span');
          s.style.cssText = 'color:#5a6272;font-size:13px;';
          s.textContent = area.key === 'special' ? '★' : '+';
          balls.appendChild(s);
        }
        const n = Math.min(area.pick || 1, 3);
        for (let k = 0; k < n; k++) balls.appendChild(ballEl('?', 'gray', 'sm'));
      });
    }
    wrap.appendChild(balls);
  }

  return wrap;
}

/* ============================================================
   手动录入弹窗
   ============================================================ */

/** 从字符串解析数字：支持空格、逗号、顿号、中文逗号分隔 */
function parseNums(str) {
  return String(str)
    .split(/[\s,，、;；]+/)
    .filter((s) => s !== '')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isInteger(n));
}

/**
 * 打开「录入开奖号码」弹窗
 * @param {string} gameId
 * @param {function} onSaved 保存成功后的回调
 */
function openDrawEditor(gameId, onSaved) {
  const game = GAMES[gameId];
  if (!game) return;

  // 竞猜没有固定号码结构，暂不支持
  if (game.type === 'custom') {
    alert('竞猜的开奖结果需要按赛事录入，这部分还没做。');
    return;
  }

  // 取出已录入的数据，供回填
  const existing = getDraw(gameId) || {};

  /* ---------- 遮罩 ---------- */
  const mask = document.createElement('div');
  mask.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.62);
    display:flex; align-items:center; justify-content:center;
    z-index:9999; padding:20px; backdrop-filter:blur(3px);`;

  /* ---------- 弹窗 ---------- */
  const box = document.createElement('div');
  box.style.cssText = `
    background:#1a1f28; border:1px solid #2d3546; border-radius:15px;
    width:100%; max-width:520px; max-height:88vh; overflow-y:auto;
    padding:24px; box-shadow:0 18px 50px rgba(0,0,0,0.55);`;

  box.innerHTML = `
    <div style="font-size:19px;font-weight:700;margin-bottom:6px;">
      ${game.name} · 录入开奖号码
    </div>
    <div style="font-size:12px;color:#8b93a1;margin-bottom:20px;line-height:1.7;">
      ${game.desc}<br>
      号码之间用<b style="color:#c8cfda">空格</b>或<b style="color:#c8cfda">逗号</b>分隔，例如 <code style="color:#7ee787">03 12 18 24 29 33</code>
    </div>
  `;

  /* 期号 + 日期 */
  const meta = document.createElement('div');
  meta.style.cssText = 'display:flex;gap:14px;margin-bottom:20px;flex-wrap:wrap;';

  const issueWrap = document.createElement('div');
  issueWrap.style.cssText = 'flex:1;min-width:150px;';
  issueWrap.innerHTML = '<div style="font-size:12px;color:#8b93a1;margin-bottom:7px;">期号</div>';
  const issueInput = document.createElement('input');
  issueInput.type = 'text';
  issueInput.placeholder = '例如 2024118';
  issueInput.value = existing.issue || '';
  issueInput.style.cssText = inputStyle();
  issueWrap.appendChild(issueInput);
  meta.appendChild(issueWrap);

  const dateWrap = document.createElement('div');
  dateWrap.style.cssText = 'flex:1;min-width:150px;';
  dateWrap.innerHTML = '<div style="font-size:12px;color:#8b93a1;margin-bottom:7px;">开奖日期（可留空）</div>';
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = existing.date || '';
  dateInput.style.cssText = inputStyle();
  dateWrap.appendChild(dateInput);
  meta.appendChild(dateWrap);

  box.appendChild(meta);

  /* 各区号码输入 */
  const inputs = {};

  function addArea(area, need) {
    const block = document.createElement('div');
    block.style.marginBottom = '18px';

    const lab = document.createElement('div');
    lab.style.cssText = 'font-size:13px;color:#c8cfda;margin-bottom:7px;display:flex;align-items:center;gap:8px;';
    lab.innerHTML = `
      <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${area.color === 'blue' ? '#2f6feb' : '#e5484d'};"></span>
      ${area.label}
      <span style="color:#5a6272;font-size:12px;">
        需 ${need} 个，范围 ${area.from}-${area.to}
      </span>`;

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.style.cssText = inputStyle();
    inp.placeholder = `输入 ${need} 个号码`;
    if (existing.areas && existing.areas[area.key]) {
      inp.value = existing.areas[area.key].join(' ');
    }
    // 实时校验
    inp.addEventListener('input', () => validate());
    inputs[area.key] = inp;

    block.appendChild(lab);
    block.appendChild(inp);
    box.appendChild(block);
  }

  if (game.playModes) {
    addArea(game.areas[0], 20);   // 快乐8 开奖固定摇 20 个号
  } else if (game.type === 'qxc') {
    addArea(game.areas[0], 6);
    addArea(game.areas[1], 1);
  } else if (game.type === 'digit') {
    const fake = { key: 'main', label: '开奖号码', color: 'red', from: game.from, to: game.to };
    addArea(fake, game.digits);
  } else {
    game.areas.forEach((area) => addArea(area, area.pick));
  }

  /* 提示区 */
  const msg = document.createElement('div');
  msg.style.cssText = 'font-size:12px;min-height:20px;margin-bottom:14px;line-height:1.6;';
  box.appendChild(msg);

  /* 按钮 */
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;';

  const btnClear = document.createElement('button');
  btnClear.textContent = '清除记录';
  btnClear.style.cssText = btnStyle('ghost');
  btnClear.addEventListener('click', () => {
    if (confirm(`确定要清除 ${game.name} 的开奖记录吗？`)) {
      clearDraw(gameId);
      close();
      if (onSaved) onSaved();
    }
  });

  const btnCancel = document.createElement('button');
  btnCancel.textContent = '取消';
  btnCancel.style.cssText = btnStyle('ghost');
  btnCancel.addEventListener('click', close);

  const btnSave = document.createElement('button');
  btnSave.textContent = '保存';
  btnSave.style.cssText = btnStyle('primary');
  btnSave.addEventListener('click', () => {
    const data = collect();
    if (!data) return;
    setDraw(gameId, data);
    close();
    if (onSaved) onSaved();
  });

  btns.appendChild(btnClear);
  btns.appendChild(btnCancel);
  btns.appendChild(btnSave);
  box.appendChild(btns);

  /* ---------- 校验与收集 ---------- */

  // 每个区的规则（用于校验）
  const rules = [];
  if (game.playModes) {
    rules.push({ key: 'main', need: 20, from: game.areas[0].from, to: game.areas[0].to, label: game.areas[0].label });
  } else if (game.type === 'qxc') {
    rules.push({ key: 'front', need: 6, from: 0, to: 9, label: '前六位' });
    rules.push({ key: 'back', need: 1, from: 0, to: 14, label: '最后一位' });
  } else if (game.type === 'digit') {
    rules.push({ key: 'main', need: game.digits, from: game.from, to: game.to, label: '开奖号码', allowRepeat: true });
  } else {
    game.areas.forEach((a) => rules.push({
      key: a.key, need: a.pick, from: a.from, to: a.to, label: a.label, allowRepeat: false
    }));
  }

  function validate() {
    const problems = [];
    let anyFilled = false;

    for (const r of rules) {
      const raw = inputs[r.key].value.trim();
      if (raw === '') continue;
      anyFilled = true;

      const nums = parseNums(raw);
      if (nums.length !== r.need) {
        problems.push(`${r.label}：需要 ${r.need} 个号，现在填了 ${nums.length} 个`);
        continue;
      }
      const out = nums.filter((n) => n < r.from || n > r.to);
      if (out.length) {
        problems.push(`${r.label}：${out.join('、')} 超出范围 ${r.from}-${r.to}`);
        continue;
      }
      if (!r.allowRepeat && new Set(nums).size !== nums.length) {
        problems.push(`${r.label}：有重复号码`);
      }
    }

    if (problems.length) {
      msg.style.color = '#f0b429';
      msg.innerHTML = '⚠️ ' + problems.join('<br>⚠️ ');
      btnSave.disabled = true;
      btnSave.style.opacity = '0.5';
      btnSave.style.cursor = 'not-allowed';
    } else if (!anyFilled) {
      msg.style.color = '#5a6272';
      msg.textContent = '填好号码后点保存。';
      btnSave.disabled = false;
      btnSave.style.opacity = '1';
      btnSave.style.cursor = 'pointer';
    } else {
      msg.style.color = '#7ee787';
      msg.textContent = '✓ 格式正确，可以保存';
      btnSave.disabled = false;
      btnSave.style.opacity = '1';
      btnSave.style.cursor = 'pointer';
    }
  }

  function collect() {
    const areas = {};
    for (const r of rules) {
      const raw = inputs[r.key].value.trim();
      if (raw === '') {
        msg.style.color = '#f0b429';
        msg.textContent = `⚠️ 请填写「${r.label}」`;
        return null;
      }
      let nums = parseNums(raw);
      if (nums.length !== r.need || nums.some((n) => n < r.from || n > r.to) ||
          (!r.allowRepeat && new Set(nums).size !== nums.length)) {
        msg.style.color = '#f0b429';
        msg.textContent = `⚠️ 「${r.label}」填写不正确，请检查`;
        return null;
      }
      areas[r.key] = nums;
    }

    const issue = issueInput.value.trim();
    if (!issue) {
      msg.style.color = '#f0b429';
      msg.textContent = '⚠️ 请填写期号';
      issueInput.focus();
      return null;
    }

    return { issue, date: dateInput.value || '', areas };
  }

  function close() {
    mask.remove();
    document.removeEventListener('keydown', onEsc);
  }
  function onEsc(e) { if (e.key === 'Escape') close(); }

  /* ---------- 挂载 ---------- */
  mask.appendChild(box);
  document.body.appendChild(mask);
  document.addEventListener('keydown', onEsc);

  // 点遮罩空白处关闭
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });

  validate();
  issueInput.focus();
}

/* ---------- 样式小工具 ---------- */
function inputStyle() {
  return `width:100%;padding:10px 13px;font-size:14px;font-family:inherit;
    color:#e8eaed;background:#0f1115;border:1px solid #2d3546;border-radius:9px;
    outline:none;box-sizing:border-box;`;
}
function btnStyle(kind) {
  const base = 'padding:10px 20px;font-size:14px;font-family:inherit;border-radius:9px;cursor:pointer;border:none;';
  return kind === 'primary'
    ? base + 'color:#fff;background:linear-gradient(180deg,#4a82f5,#2860d8);'
    : base + 'color:#e8eaed;background:#161a21;border:1px solid #2d3546;';
}
