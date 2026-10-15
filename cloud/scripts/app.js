/* ============================================================
   app.js —— 公共逻辑
   路由、号码生成、应用化处理
   ============================================================ */

/* ---------------- App 化处理 ---------------- */
(function appLike() {
  // 屏蔽右键菜单（网页才需要，App 不需要）
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // 屏蔽浏览器快捷键：刷新、打印、源码、开发者工具
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['f5', 'f7', 'f12'].includes(k)) { e.preventDefault(); return; }
    if (e.ctrlKey && !e.shiftKey && ['r', 'p', 'u'].includes(k)) { e.preventDefault(); return; }
    if (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(k)) { e.preventDefault(); return; }
  });

  // 禁止拖拽文件/链接导致页面跳走
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
})();

/* ---------------- 工具函数 ---------------- */

/** 生成 [from, to] 之间的一个随机整数（含两端），范围大时用加密随机更均匀 */
function randInt(from, to) {
  const range = to - from + 1;
  if (window.crypto && window.crypto.getRandomValues && range <= 65536) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0xFFFFFFFF / range) * range;
    let v;
    do { window.crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
    return from + (v % range);
  }
  return from + Math.floor(Math.random() * range);
}

/** 从 [from, to] 中不重复地随机取 n 个，返回升序数组 */
function pickNumbers(from, to, n) {
  const pool = [];
  for (let i = from; i <= to; i++) pool.push(i);
  // Fisher-Yates 洗牌后取前 n 个
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).sort((a, b) => a - b);
}

/** 补零成固定位数 */
function pad(n, width) {
  return String(n).padStart(width, '0');
}

/** 渲染一个球 */
function ballEl(text, color, size) {
  const el = document.createElement('span');
  el.className = `ball ${color} s-${size || 'md'}`;
  el.textContent = text;
  return el;
}

/** 解析地址栏参数 */
function getParam(key) {
  // 同时支持 ?g=xx 和 #g=xx 两种写法
  const search = new URLSearchParams(location.search);
  if (search.has(key)) return search.get(key);
  const hash = location.hash.replace(/^#/, '');
  const hp = new URLSearchParams(hash);
  if (hp.has(key)) return hp.get(key);
  return null;
}

/* ---------------- 号码生成（按彩种规则） ---------------- */

/**
 * 按彩种定义生成一注随机号码
 * 返回 { areas: { 区key: [号码...] }, mode: 玩法 }
 */
function generateTicket(game, modeKey) {
  const result = { areas: {}, mode: modeKey || null };

  // 快乐8：先按玩法决定选几个号
  if (game.playModes) {
    const pick = Number(modeKey) || 10;
    const area = game.areas[0];
    result.areas[area.key] = pickNumbers(area.from, area.to, pick);
    return result;
  }

  // 七星彩：前六位是 6 个 0-9，最后一位 0-14
  if (game.type === 'qxc') {
    for (const area of game.areas) {
      const nums = [];
      for (let i = 0; i < area.digits; i++) {
        nums.push(randInt(area.from, area.to));
      }
      result.areas[area.key] = nums;
    }
    return result;
  }

  // 3D / 排列5：每一位独立随机
  if (game.type === 'digit') {
    const nums = [];
    for (let i = 0; i < game.digits; i++) nums.push(randInt(game.from, game.to));
    result.areas.main = nums;
    return result;
  }

  // 竞猜：没有固定号码结构
  if (game.type === 'custom') return null;

  // 通用：每个区独立不重复选号
  for (const area of game.areas) {
    result.areas[area.key] = pickNumbers(area.from, area.to, area.pick);
  }
  return result;
}

/* ---------------- 号码渲染 ---------------- */

/** 把一注号码渲染成 DOM 片段 */
function renderTicketRow(ticket, game, index) {
  const row = document.createElement('div');
  row.className = 'ticket';

  if (typeof index === 'number') {
    const idx = document.createElement('span');
    idx.className = 'idx';
    idx.textContent = `第${index + 1}注`;
    row.appendChild(idx);
  }

  if (game.playModes) {
    const area = game.areas[0];
    for (const n of ticket.areas[area.key]) row.appendChild(ballEl(pad(n, 2), area.color, 'sm'));
    return row;
  }

  if (game.type === 'qxc') {
    const front = ticket.areas.front;
    front.forEach((d, i) => {
      if (i === 3) {
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '|';
        row.appendChild(sep);
      }
      row.appendChild(ballEl(String(d), 'red', 'sm'));
    });
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '+';
    row.appendChild(sep);
    row.appendChild(ballEl(String(ticket.areas.back[0]), 'blue', 'sm'));
    return row;
  }

  if (game.type === 'digit') {
    ticket.areas.main.forEach((d) => row.appendChild(ballEl(String(d), 'red', 'sm')));
    return row;
  }

  // 通用多区
  game.areas.forEach((area, ai) => {
    if (ai > 0) {
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = area.key === 'special' ? '★' : '+';
      row.appendChild(sep);
    }
    for (const n of ticket.areas[area.key]) {
      row.appendChild(ballEl(pad(n, 2), area.color, 'sm'));
    }
  });

  return row;
}

/* ---------------- 左侧导航栏 ---------------- */

/**
 * 初始化左侧导航
 * activeKey: 当前页面对应的导航项（'home' 或彩种 id）
 */
function initNav(activeKey) {
  const items = document.querySelectorAll('.nav-item');
  items.forEach((el) => {
    const key = el.dataset.nav;

    // 高亮当前项
    if (key === activeKey) el.classList.add('on');

    // 点击跳转（点当前项不重复加载）
    el.addEventListener('click', (e) => {
      e.preventDefault();
      if (key === activeKey) return;
      const target = el.dataset.target;
      if (target) location.href = target;
    });
  });
}

/* ---------------- 页面初始化 ---------------- */

document.addEventListener('DOMContentLoaded', () => {
  requestAnimationFrame(() => document.body.classList.add('ready'));
});
