/* ============================================================
   data-store.js —— 资料库
   ------------------------------------------------------------
   用途：像聊天框一样记资料，按彩种归类，自动分发到对应板块。

   存储结构（localStorage，key = cdd.materials.v1）：
     [
       {
         id: "1700000000000",
         text: "资料内容……",
         games: ["ssq", "dlt"],   // 适用彩种；空数组 = 通用（所有彩种都显示）
         time: "2026-10-13 22:30"
       }
     ]
   ============================================================ */

const MATERIAL_KEY = 'cdd.materials.v1';

/* ---------------- 存取 ---------------- */

function loadMaterials() {
  try {
    const raw = localStorage.getItem(MATERIAL_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.warn('读取资料失败:', e);
    return [];
  }
}

function saveMaterials(list) {
  try {
    localStorage.setItem(MATERIAL_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.warn('保存资料失败:', e);
    return false;
  }
}

/** 取某个彩种适用的资料（含通用资料），最新的排前面 */
function materialsFor(gameId) {
  return loadMaterials()
    .filter((m) => !m.games || m.games.length === 0 || m.games.includes(gameId))
    .sort((a, b) => (b.time > a.time ? 1 : -1));
}

/** 新增一条资料 */
function addMaterial(text, games) {
  const list = loadMaterials();
  list.push({
    id: String(Date.now()) + Math.random().toString(36).slice(2, 7),
    text: String(text || '').trim(),
    games: Array.isArray(games) ? games : [],
    time: nowStr()
  });
  return saveMaterials(list);
}

/** 删除一条资料 */
function removeMaterial(id) {
  const list = loadMaterials().filter((m) => m.id !== id);
  return saveMaterials(list);
}

/** 更新时间字符串 */
function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ============================================================
   输入界面（聊天框样式）
   ============================================================ */

/**
 * 渲染「资料输入区」
 * @param {HTMLElement} container 放哪
 * @param {function} onSaved 保存后的回调
 */
function renderMaterialInput(container, onSaved) {
  const box = document.createElement('div');
  box.className = 'panel';

  const h3 = document.createElement('h3');
  h3.innerHTML = '新增资料 <span class="hint">输入内容，选好彩种，保存后自动分发</span>';
  box.appendChild(h3);

  // 彩种选择
  const pickWrap = document.createElement('div');
  pickWrap.className = 'mat-games';

  const allBtn = document.createElement('button');
  allBtn.className = 'mat-chip on';
  allBtn.textContent = '通用（所有彩种）';
  allBtn.dataset.game = '';

  const selected = new Set();   // 选中的彩种；为空表示通用

  allBtn.addEventListener('click', () => {
    selected.clear();
    pickWrap.querySelectorAll('.mat-chip').forEach((c) => c.classList.remove('on'));
    allBtn.classList.add('on');
  });
  pickWrap.appendChild(allBtn);

  // 所有彩种都列出来
  Object.keys(GAMES).forEach((id) => {
    const g = GAMES[id];
    const chip = document.createElement('button');
    chip.className = 'mat-chip';
    chip.textContent = g.name;
    chip.dataset.game = id;
    chip.addEventListener('click', () => {
      if (selected.has(id)) {
        selected.delete(id);
        chip.classList.remove('on');
      } else {
        selected.add(id);
        chip.classList.add('on');
      }
      // 一旦选了具体彩种，就取消「通用」
      if (selected.size > 0) allBtn.classList.remove('on');
      else allBtn.classList.add('on');
    });
    pickWrap.appendChild(chip);
  });

  box.appendChild(pickWrap);

  // 输入框
  const ta = document.createElement('textarea');
  ta.className = 'mat-input';
  ta.rows = 6;
  ta.placeholder = '在这里输入资料……\n\n例如：\n本期重点关注中区号码\n05 12 19 是胆码\n和值建议 90-110';
  box.appendChild(ta);

  /* 【解析失败提示】这段资料识别不出可用的号码时，在编辑区下方给个显眼的提示
     （不阻止保存 —— 资料照样存下来，只是摇号用不上） */
  const warn = document.createElement('div');
  warn.className = 'mat-parse-warn';
  warn.style.cssText = 'display:none;margin-top:9px;font-size:12.5px;line-height:1.75;' +
    'color:#f0b429;background:rgba(240,180,41,0.07);' +
    'border:1px solid rgba(240,180,41,0.25);border-radius:9px;padding:8px 12px;';
  warn.textContent = '这段资料没有识别出可用的号码，请按格式写，例如：红球：01 05 09';
  box.appendChild(warn);

  // 按钮
  const acts = document.createElement('div');
  acts.className = 'actions';
  acts.style.marginTop = '12px';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn';
  saveBtn.textContent = '保存资料';

  const msg = document.createElement('span');
  msg.style.cssText = 'font-size:12px;margin-left:10px;';

  /** 实时检查这段资料能不能被识别（不通过就显示下方提示） */
  const checkParse = () => {
    const t = ta.value.trim();
    if (!t) { warn.style.display = 'none'; return true; }
    const ok = materialTextRecognized([...selected], t);
    warn.style.display = ok ? 'none' : 'block';
    return ok;
  };
  ta.addEventListener('input', checkParse);
  ta.addEventListener('blur', checkParse);

  saveBtn.addEventListener('click', () => {
    const text = ta.value.trim();
    if (!text) {
      msg.style.color = '#f0b429';
      msg.textContent = '请先输入内容';
      ta.focus();
      return;
    }
    const recognized = checkParse();
    addMaterial(text, [...selected]);
    ta.value = '';
    if (recognized) {
      msg.style.color = '#7ee787';
      msg.textContent = '已保存';
      setTimeout(() => { msg.textContent = ''; }, 2000);
    } else {
      /* 存是存下来了，但要明确告诉用户：这段资料摇号时用不上 */
      msg.style.color = '#f0b429';
      msg.textContent = '已保存，但这段资料没识别出可用的号码（见下方提示）';
      setTimeout(() => { msg.textContent = ''; }, 6000);
    }
    if (onSaved) onSaved();
  });

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn ghost';
  clearBtn.textContent = '清空输入';
  clearBtn.addEventListener('click', () => { ta.value = ''; ta.focus(); });

  acts.appendChild(saveBtn);
  acts.appendChild(clearBtn);
  acts.appendChild(msg);
  box.appendChild(acts);

  // Ctrl+Enter 快速保存
  ta.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); saveBtn.click(); }
  });

  container.appendChild(box);
  return ta;
}

/* ============================================================
   资料导出 / 分享页展示
   ============================================================ */

/** 把资料导成文件内容（供下载成 materials-data.js） */
function materialsToFileText() {
  const list = loadMaterials();
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;

  return `/* ============================================================\n` +
    `   materials-data.js —— 资料存档\n\n` +
    `   由程序导出；放到程序目录后，分享页就能显示这些资料。\n` +
    `   导出时间：${stamp}\n` +
    `   ============================================================ */\n\n` +
    `const MATERIALS_DATA = ${JSON.stringify({ updated: stamp, list }, null, 1)};\n`;
}

/** 资料导出面板 */
function renderMaterialExportPanel(container, onChanged) {
  const box = document.createElement('div');
  box.className = 'panel';

  const h3 = document.createElement('h3');
  h3.innerHTML = '资料导出 <span class="hint">导出后分享页也能看到资料</span>';
  box.appendChild(h3);

  const list = loadMaterials();
  const note = document.createElement('div');
  note.className = 'tk-note';
  note.style.marginBottom = '14px';
  note.innerHTML = list.length
    ? `当前共 <b style="color:#7ee787">${list.length}</b> 条资料。导出后分享页会新增「资料」区域。`
    : '还没有资料。先在上面输入并保存，再导出。';
  box.appendChild(note);

  const acts = document.createElement('div');
  acts.className = 'actions';
  const msg = document.createElement('span');
  msg.style.cssText = 'font-size:12px;margin-left:10px;';

  const expBtn = document.createElement('button');
  expBtn.className = 'btn';
  expBtn.textContent = '导出资料到文件';
  expBtn.title = '下载 materials-data.js，放到程序目录即可让分享页显示资料';
  expBtn.addEventListener('click', () => {
    try {
      const text = materialsToFileText();
      const blob = new Blob([text], { type: 'text/javascript;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'materials-data.js';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      msg.style.color = '#7ee787';
      msg.textContent = '已下载，放到 D:\\春风\\ 目录（覆盖原文件）';
    } catch (e) {
      msg.style.color = '#f0575c';
      msg.textContent = '导出失败：' + e.message;
    }
  });

  acts.appendChild(expBtn);
  acts.appendChild(msg);
  box.appendChild(acts);

  container.appendChild(box);
}

/**
 * 生成「资料」区域的 HTML（分享页用）
 * 按彩种分组展示
 * @returns {string}
 */
function buildMaterialsHtml() {
  let data = null;
  try {
    if (typeof MATERIALS_DATA !== 'undefined' && MATERIALS_DATA) data = MATERIALS_DATA;
  } catch (e) { data = null; }
  if (!data || !Array.isArray(data.list) || !data.list.length) return '';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const gameName = (id) => {
    try {
      if (typeof GAMES !== 'undefined' && GAMES[id]) return GAMES[id].name;
    } catch (e) { /* 忽略 */ }
    return id;
  };

  /* 按彩种分组：通用 + 各彩种 */
  const groups = new Map();
  data.list.forEach((m) => {
    const games = (m.games && m.games.length) ? m.games : ['__common'];
    games.forEach((g) => {
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(m);
    });
  });

  const order = ['__common'].concat(
    Object.keys((typeof GAMES !== 'undefined' && GAMES) || {})
  );

  let body = '';
  order.forEach((g) => {
    const arr = groups.get(g);
    if (!arr || !arr.length) return;

    const title = g === '__common' ? '通用资料' : gameName(g);
    const items = arr.map((m) => {
      const lines = esc(m.text).split('\n').map((l) => l.trim()).filter(Boolean);
      return `<div class="mt-item">` +
        `<div class="mt-time">${esc(m.time || '')}</div>` +
        `<div class="mt-text">${lines.map((l) => `<div class="mt-line">${l}</div>`).join('')}</div>` +
        `</div>`;
    }).join('');

    body += `<div class="mt-group">` +
      `<div class="mt-gtitle">${esc(title)}<span class="mt-gcount">${arr.length}</span></div>` +
      items +
      `</div>`;
  });

  if (!body) return '';

  return (
    `<section class="ro-game" id="matSection">` +
    `<div class="ro-gamehead">` +
    `<h2>资料</h2>` +
    `<div class="ro-meta">发布者提供的参考资料 · 共 ${data.list.length} 条 </div>` +
    `</div>` +
    body +
    `</section>`
  );
}

/** 资料区域样式 */
function materialsCss() {
  return `
.mt-group { margin-bottom: 18px; }
.mt-gtitle {
  font-size: 14px; font-weight: 700; color: #e8eaed;
  padding-left: 9px; position: relative; margin-bottom: 9px;
}
.mt-gtitle::before {
  content: ''; position: absolute; left: 0; top: 3px;
  width: 3px; height: 14px; border-radius: 2px; background: #ff2d55;
}
.mt-gcount { font-size: 11.5px; color: #6b7488; font-weight: 400; margin-left: 6px; }
.mt-item {
  background: #161a21; border: 1px solid #262d3a;
  border-radius: 11px; padding: 12px 15px; margin-bottom: 9px;
}
.mt-time { font-size: 11px; color: #5a6272; margin-bottom: 7px; }
.mt-text { font-size: 13.5px; color: #c8cfda; line-height: 1.9; }
.mt-line { white-space: pre-wrap; word-break: break-word; }
`;
}

/**
 * 渲染资料列表
 * @param {HTMLElement} container
 * @param {function} onChanged 删除后的回调
 */
function renderMaterialList(container, onChanged) {
  const box = document.createElement('div');
  box.className = 'panel';

  const list = loadMaterials().sort((a, b) => (b.time > a.time ? 1 : -1));

  const h3 = document.createElement('h3');
  h3.innerHTML = `资料库 <span class="hint">共 ${list.length} 条</span>`;
  box.appendChild(h3);

  if (list.length === 0) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = '还没有资料。在上面输入并保存，会自动分发到对应彩种。';
    box.appendChild(e);
    container.appendChild(box);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'mat-list';

  list.forEach((m) => {
    const item = document.createElement('div');
    item.className = 'mat-item';

    const head = document.createElement('div');
    head.className = 'mat-head';

    const tags = document.createElement('div');
    tags.className = 'mat-tags';
    if (!m.games || m.games.length === 0) {
      tags.innerHTML = '<span class="mat-tag all">通用</span>';
    } else {
      m.games.forEach((id) => {
        const t = document.createElement('span');
        t.className = 'mat-tag';
        t.textContent = (GAMES[id] && GAMES[id].name) || id;
        tags.appendChild(t);
      });
    }
    head.appendChild(tags);

    const time = document.createElement('span');
    time.className = 'mat-time';
    time.textContent = m.time;
    head.appendChild(time);

    const del = document.createElement('button');
    del.className = 'mat-del';
    del.textContent = '删除';
    del.title = '删除这条资料';
    del.addEventListener('click', () => {
      if (confirm('确定删除这条资料吗？')) {
        removeMaterial(m.id);
        if (onChanged) onChanged();
      }
    });
    head.appendChild(del);

    item.appendChild(head);

    const body = document.createElement('div');
    body.className = 'mat-body';
    body.textContent = m.text;
    item.appendChild(body);

    wrap.appendChild(item);
  });

  box.appendChild(wrap);
  container.appendChild(box);
}

/* ============================================================
   在彩种板块里展示「相关资料」
   ============================================================ */

function renderMaterialsForGame(container, gameId) {
  const list = materialsFor(gameId);
  if (list.length === 0) return;

  const box = document.createElement('div');
  box.className = 'panel';

  const h3 = document.createElement('h3');
  h3.innerHTML = `相关资料 <span class="hint">来自资料库，含通用资料</span>`;
  box.appendChild(h3);

  const wrap = document.createElement('div');
  wrap.className = 'mat-list';

  list.forEach((m) => {
    const item = document.createElement('div');
    item.className = 'mat-item';

    const head = document.createElement('div');
    head.className = 'mat-head';
    const tags = document.createElement('div');
    tags.className = 'mat-tags';
    if (!m.games || m.games.length === 0) {
      tags.innerHTML = '<span class="mat-tag all">通用</span>';
    } else {
      m.games.forEach((id) => {
        const t = document.createElement('span');
        t.className = 'mat-tag';
        t.textContent = (GAMES[id] && GAMES[id].name) || id;
        tags.appendChild(t);
      });
    }
    head.appendChild(tags);
    const time = document.createElement('span');
    time.className = 'mat-time';
    time.textContent = m.time;
    head.appendChild(time);
    item.appendChild(head);

    const body = document.createElement('div');
    body.className = 'mat-body';
    body.textContent = m.text;
    item.appendChild(body);

    wrap.appendChild(item);
  });

  box.appendChild(wrap);
  container.appendChild(box);
}

/* ============================================================
   资料 → 摇号约束（「资料优先」层）
   ------------------------------------------------------------
   摇号（ticket-store.js 的 rollAllGames / stats.js 的取号）原来只看
   experts-data.js 的专家池。从这段开始：资料里写明的号码【优先进入号码池】，
   排在专家池前面 —— 优先级：资料 > 专家池 > 原算法。

   认这些写法（字段解析复用 parseOverridesFromText，不另写一套解析器）：
     · 字段写法：胆码 05 12 19 ／ 杀号 01 04 ／ 拖码 07 11 26 ／ 20码 01 02 …
     · 区域写法：红球：01 02 03 ／ 蓝球 05 09 ／ 前区 01 02 03 ／ 后区 05 09
     · 组合写法：红球杀号 01 04 ／ 蓝球胆码 05
   解析不出来就返回全空 —— 静默跳过，不报错，也不影响其它彩种。
   ============================================================ */

/** 各彩种的「主区 / 副区」关键词与 areaKey（与 ticket-store.js 的判定保持一致） */
function materialAreaSpec(gameId) {
  if (gameId === 'ssq') {
    return { mainKey: 'red', altKey: 'blue', mainWords: ['红球', '红号', '红'], altWords: ['蓝球', '蓝号', '蓝'] };
  }
  if (gameId === 'dlt') {
    return { mainKey: 'front', altKey: 'back', mainWords: ['前区', '红球', '红'], altWords: ['后区', '蓝球', '蓝'] };
  }
  if (gameId === 'qxc') {
    return { mainKey: 'front', altKey: 'back', mainWords: ['前区', '前'], altWords: ['后区', '后'] };
  }
  return { mainKey: 'main', altKey: 'main', mainWords: ['号码', '前区', '红球'], altWords: ['后区', '蓝球', '蓝'] };
}

/** 该区号码范围：优先用 ticket-store.js 的 areaRangeOf，取不到就用本地表兜底 */
function materialAreaRange(gameId, areaKey) {
  try {
    if (typeof areaRangeOf === 'function') return areaRangeOf(gameId, areaKey);
  } catch (e) { /* 回退 */ }
  const R = {
    ssq: { red: [1, 33], blue: [1, 16] },
    dlt: { front: [1, 35], back: [1, 12] },
    qxc: { front: [0, 9], back: [0, 14] },
    qlc: { main: [1, 30] },
    kl8: { main: [1, 80] },
    fc3d: { main: [0, 9] },
    pl3: { main: [0, 9] },
    pl5: { main: [0, 9] }
  };
  return (R[gameId] && R[gameId][areaKey]) || [1, 33];
}

/** 严格取号码：整段只有「数字 + 分隔符」才算，避免把 90-110 / 8奇4偶 当号码 */
function numbersInText(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || !/^[0-9\s,，、+\-~]+$/.test(s)) return [];
  const out = [];
  (s.match(/\d{1,3}/g) || []).forEach((t) => {
    const n = parseInt(t, 10);
    if (out.indexOf(n) < 0) out.push(n);
  });
  return out;
}

/** key → 标签（buildLabelKeyMap 的反向表：判断这个字段属于哪个区、是杀还是胆） */
function buildKeyLabelMap(gameId) {
  const out = {};
  try {
    buildLabelKeyMap(gameId).forEach((k, label) => { if (!out[k]) out[k] = label; });
  } catch (e) { /* 忽略 */ }
  return out;
}

/**
 * 取某彩种某区的「资料约束」（从资料库读）
 * @param {string} gameId
 * @param {string} areaKey red / blue / front / back / main
 * @returns {{pick:number[], kill:number[], dan:number[], tuo:number[]}}
 */
function materialRulesFor(gameId, areaKey) {
  const empty = { pick: [], kill: [], dan: [], tuo: [] };
  let text = '';
  try {
    const mats = (typeof materialsFor === 'function') ? materialsFor(gameId) : [];
    text = mats.map((m) => (m && m.text) || '').join('\n');
  } catch (e) { return empty; }
  return materialRulesFromText(gameId, areaKey, text);
}

/**
 * 从一段资料文字里解析某彩种某区的号码约束（不读资料库，给「资料页提示」等用）
 * @param {string} gameId
 * @param {string} areaKey
 * @param {string} text
 * @returns {{pick:number[], kill:number[], dan:number[], tuo:number[]}}
 */
function materialRulesFromText(gameId, areaKey, text) {
  const out = { pick: [], kill: [], dan: [], tuo: [] };
  if (!gameId || !areaKey) return out;

  const spec = materialAreaSpec(gameId);
  const range = materialAreaRange(gameId, areaKey);
  const from = range[0];
  const to = range[1];

  text = String(text == null ? '' : text);
  if (!text.trim()) return out;
  /* 一点数字都没有，肯定解析不出号码 —— 直接跳过（资料页实时检查用得到） */
  if (!/\d/.test(text)) return out;

  const put = (arr, nums) => {
    nums.forEach((n) => { if (n >= from && n <= to && arr.indexOf(n) < 0) arr.push(n); });
  };

  /* ① 字段写法：复用现有解析器 ② 的区域写法见下面 */
  const keyLabel = buildKeyLabelMap(gameId);
  const isAltLabel = (label) => /蓝|后区/.test(label);
  /* 明显不是号码的字段（和值 / 跨度 / 比例 / 排行 / 位置 …）一律跳过 */
  const isJunkLabel = (label) =>
    /和值|合值|跨度|比|排行|位|连号|邻号|同尾|重复号|同区号|遗漏|尾|公历|农历|干支|五行|神|冲煞/.test(label);

  let overrides = {};
  try { overrides = parseOverridesFromText(gameId, text) || {}; } catch (e) { overrides = {}; }

  Object.keys(overrides).forEach((key) => {
    const label = keyLabel[key] || '';
    if (!label) return;
    /* 字段标签带「蓝 / 后区」就是副区，否则算主区 */
    if ((isAltLabel(label) ? spec.altKey : spec.mainKey) !== areaKey) return;
    if (isJunkLabel(label)) return;
    if (!/[码号]|推荐|关注|胆|拖|杀/.test(label)) return;
    const nums = numbersInText(overrides[key]);
    if (!nums.length) return;
    if (/杀/.test(label)) put(out.kill, nums);
    else if (/胆/.test(label)) put(out.dan, nums);
    else if (/拖/.test(label)) put(out.tuo, nums);
    else put(out.pick, nums);
  });

  /* ② 区域写法：红球：01 02 03 ／ 前区杀号 01 04 ／ 蓝球 05 09 */
  const words = [];
  spec.altWords.forEach((w) => words.push({ w, key: spec.altKey }));
  spec.mainWords.forEach((w) => { if (!words.some((x) => x.w === w)) words.push({ w, key: spec.mainKey }); });
  words.sort((a, b) => b.w.length - a.w.length);

  String(text).split(/[\n\r;；]+/)
    .flatMap((line) => line.split(/[，,]/))
    .forEach((raw) => {
      const chunk = String(raw).trim();
      if (!chunk) return;
      for (const item of words) {
        if (chunk.indexOf(item.w) !== 0) continue;
        if (item.key !== areaKey) return;    // 写的是别的区，跳过
        const rest = chunk.slice(item.w.length).trim();
        const m = /^(杀号|杀|胆码|胆|拖码|拖|推荐|关注|号码|号)?\s*[:：=]?\s*([0-9\s,，、+\-~]+)$/.exec(rest);
        if (!m) continue;
        const nums = numbersInText(m[2]);
        if (!nums.length) continue;
        const role = m[1] || '';
        if (/杀/.test(role)) put(out.kill, nums);
        else if (/胆/.test(role)) put(out.dan, nums);
        else if (/拖/.test(role)) put(out.tuo, nums);
        else put(out.pick, nums);
        return;
      }
    });

  return out;
}

/** 这段资料有没有被识别出可用的字段 / 号码（资料页提示用） */
function materialTextRecognized(gameIds, text) {
  const t = String(text == null ? '' : text);
  if (!t.trim()) return true;
  const all = (typeof GAMES !== 'undefined' && GAMES) ? Object.keys(GAMES) : [];
  const ids = (Array.isArray(gameIds) && gameIds.length) ? gameIds : all;
  return ids.some((g) => {
    try {
      if (Object.keys(parseOverridesFromText(g, t) || {}).length > 0) return true;
    } catch (e) { /* 忽略 */ }
    try {
      const spec = materialAreaSpec(g);
      return [spec.mainKey, spec.altKey].some((k) => {
        const r = materialRulesFromText(g, k, t);
        return (r.pick.length + r.kill.length + r.dan.length + r.tuo.length) > 0;
      });
    } catch (e) { return false; }
  });
}

/* ============================================================
   资料文字 → 模板字段的覆盖值
   ------------------------------------------------------------
   允许在「资料」里直接写字段，覆盖系统自动算的结果。
   写法很宽松，下面几种都认：

     胆码 05 12 19
     胆码：05 12 19
     热号=05 12 19
     杀号 01 04

   也支持一行里写多个键值对（用「，」或「;」分隔）：
     胆码 05 12 19，拖码 07 11 26，后区杀号 05 09
   ============================================================ */

/** 模板字段的中文标签 → key 的映射 */
function buildLabelKeyMap(gameId) {
  const tpl = (typeof TEMPLATES !== 'undefined') ? TEMPLATES[gameId] : null;
  const map = new Map();
  if (!tpl) return map;

  // 注意：sec.rows 在「号码行」里是数组，在「网格」里是行数（数字），必须区分
  const isArr = (v) => Array.isArray(v);

  const walk = (sec) => {
    if (!sec || typeof sec !== 'object') return;

    if (isArr(sec.fields)) sec.fields.forEach((f) => map.set(f.label, f.key));
    if (isArr(sec.items)) sec.items.forEach((i) => map.set(i.label, i.key));
    if (isArr(sec.rows)) sec.rows.forEach((r) => map.set(r.label, r.key));
    if (isArr(sec.positions)) sec.positions.forEach((p) => map.set(p.label, p.key));
    if (isArr(sec.footer)) sec.footer.forEach((f) => map.set(f.label, f.key));
    if (sec.bigBall && sec.bigBall.label) map.set(sec.bigBall.label, sec.bigBall.key);
    if (sec.left) walk(sec.left);
    if (sec.right) walk(sec.right);
  };
  tpl.images.forEach((img) => {
    if (isArr(img.sections)) img.sections.forEach(walk);
  });

  return map;
}

/**
 * 从资料文字里解析出字段覆盖值
 * @param {string} gameId
 * @param {string} text 资料原文
 * @returns {{ 字段key: 值 }}
 */
function parseOverridesFromText(gameId, text) {
  const map = buildLabelKeyMap(gameId);
  const out = {};
  if (!text) return out;

  // 先按行、再按分隔符切成「一条条」
  const chunks = String(text)
    .split(/[\n\r;；]+/)
    .flatMap((line) => line.split(/[，,]/))
    .map((s) => s.trim())
    .filter(Boolean);

  // 标签按长度倒序，避免「后区杀号」被短的「杀号」抢先匹配
  const labels = [...map.keys()].sort((a, b) => b.length - a.length);

  chunks.forEach((chunk) => {
    for (const label of labels) {
      // 匹配：标签 + 空格/冒号/等号 + 内容
      const re = new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[:：=]?\\s*(.+)$');
      const m = re.exec(chunk);
      if (m && m[1].trim()) {
        out[map.get(label)] = m[1].trim();
        return;
      }
    }
  });

  return out;
}

/**
 * 合并三路数据，按优先级取
 *   ① 手动录入  manual
 *   ② 资料覆盖  overrides
 *   ③ 系统自动  auto
 * 空字符串不算有效值，会被下层补上。
 */
function mergeFieldValues(auto, overrides, manual) {
  const out = Object.assign({}, auto || {});
  const put = (src) => {
    if (!src) return;
    Object.keys(src).forEach((k) => {
      const v = src[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') out[k] = v;
    });
  };
  put(overrides);   // 资料覆盖自动算
  put(manual);      // 手动录入最优先
  return out;
}

/**
 * 取某个彩种、某张图最终的字段值
 * @param {string} gameId
 * @param {string} imageKey
 * @param {object} manualValues 手动录入的那张图的字段
 * @returns {{values:object, sources:object}} sources 标明每个字段来自哪一层
 */
function resolveTemplateValues(gameId, imageKey, manualValues) {
  const auto = (typeof autoFillForTemplate === 'function')
    ? autoFillForTemplate(gameId, imageKey) : {};

  // 资料库里的文字（该彩种所有资料拼起来）
  const mats = (typeof materialsFor === 'function') ? materialsFor(gameId) : [];
  const text = mats.map((m) => m.text).join('\n');
  const overrides = parseOverridesFromText(gameId, text);

  const values = mergeFieldValues(auto, overrides, manualValues);

  // 记录来源，方便界面上标注
  const sources = {};
  Object.keys(values).forEach((k) => {
    if (manualValues && String(manualValues[k] || '').trim()) sources[k] = 'manual';
    else if (overrides[k]) sources[k] = 'material';
    else sources[k] = 'auto';
  });

  return { values, sources, auto, overrides };
}


function renderAlgoTool(container) {
  const box = document.createElement('div');
  box.className = 'panel';

  const h3 = document.createElement('h3');
  h3.innerHTML = '余数筛选工具 <span class="hint">按开奖号的模 4 余数特征，筛选并分组号码池</span>';
  box.appendChild(h3);

  const note = document.createElement('div');
  note.className = 'tk-note';
  note.style.marginBottom = '14px';
  note.textContent = '⚠️ 这是号码整理工具，用于按同余类组织号码池。彩票每期独立随机，本工具不提高中奖概率。';
  box.appendChild(note);

  /* ---- 输入：特征号码 ---- */
  const row1 = document.createElement('div');
  row1.className = 'tk-numrow';
  row1.innerHTML = '<span class="tk-numlabel">特征号码</span>';
  const inWin = document.createElement('input');
  inWin.type = 'text';
  inWin.className = 'tk-input tk-numinput';
  inWin.placeholder = '开奖号码，如 04 11 14 22 26 27（留空则用最近一期开奖号）';
  row1.appendChild(inWin);
  box.appendChild(row1);

  /* ---- 输入：大底号码池 ---- */
  const row2 = document.createElement('div');
  row2.className = 'tk-numrow';
  row2.innerHTML = '<span class="tk-numlabel">大底号码池</span>';
  const inPool = document.createElement('input');
  inPool.type = 'text';
  inPool.className = 'tk-input tk-numinput';
  inPool.placeholder = '要筛选的号码，如 01 02 03 ... 33';
  row2.appendChild(inPool);
  box.appendChild(row2);

  /* ---- 取模基数 ---- */
  const row3 = document.createElement('div');
  row3.className = 'tk-numrow';
  row3.innerHTML = '<span class="tk-numlabel">取模基数</span>';
  const inMod = document.createElement('input');
  inMod.type = 'number';
  inMod.className = 'tk-input tk-numinput';
  inMod.value = '4';
  inMod.min = '2';
  inMod.max = '12';
  inMod.style.maxWidth = '110px';
  row3.appendChild(inMod);
  box.appendChild(row3);

  /* ---- 按钮 ---- */
  const acts = document.createElement('div');
  acts.className = 'actions';
  acts.style.marginTop = '14px';

  const runBtn = document.createElement('button');
  runBtn.className = 'btn';
  runBtn.textContent = '执行筛选';

  const poolBtn = document.createElement('button');
  poolBtn.className = 'btn ghost';
  poolBtn.textContent = '填入 1-33 大底';

  const msg = document.createElement('span');
  msg.style.cssText = 'font-size:12px;margin-left:10px;';

  acts.appendChild(runBtn);
  acts.appendChild(poolBtn);
  acts.appendChild(msg);
  box.appendChild(acts);

  /* ---- 结果区 ---- */
  const out = document.createElement('div');
  out.style.marginTop = '16px';
  box.appendChild(out);

  poolBtn.addEventListener('click', () => {
    const arr = [];
    for (let i = 1; i <= 33; i++) arr.push(i);
    inPool.value = arr.map((n) => String(n).padStart(2, '0')).join(' ');
  });

  runBtn.addEventListener('click', () => {
    out.innerHTML = '';

    const pool = parseTicketNums(inPool.value);
    if (pool.length === 0) {
      msg.style.color = '#f0b429';
      msg.textContent = '请先填大底号码池';
      return;
    }

    // 特征号码：留空则取最近一期开奖号（双色球红球优先）
    let win = parseTicketNums(inWin.value);
    if (win.length === 0) {
      const d = (typeof getDraw === 'function') ? getDraw('ssq') : null;
      if (d && d.areas && d.areas.red) {
        win = d.areas.red;
        msg.style.color = '#8b93a1';
        msg.textContent = `已自动使用双色球最近一期开奖号：${win.join(' ')}`;
      }
    }
    if (win.length === 0) {
      msg.style.color = '#f0b429';
      msg.textContent = '请填特征号码，或先抓取开奖数据';
      return;
    }

    const mod = Math.max(2, parseInt(inMod.value, 10) || 4);
    const result = shrinkLotteryNumbers(win, pool, mod);
    const flat = flattenShrinkResult(result);

    if (result.length === 0) {
      out.innerHTML = '<div class="empty">筛选后没有号码</div>';
      return;
    }

    // 汇总
    const summary = document.createElement('div');
    summary.style.cssText = 'font-size:13px;color:#8b93a1;margin-bottom:14px;line-height:1.9;';
    summary.innerHTML =
      `特征号码：<b style="color:#e8eaed">${win.map((n) => String(n).padStart(2, '0')).join(' ')}</b><br>` +
      `大底 <b style="color:#e8eaed">${pool.length}</b> 个 → 筛选后 <b style="color:#7ee787">${flat.length}</b> 个`;
    out.appendChild(summary);

    // 分组展示
    const list = document.createElement('div');
    list.className = 'mat-list';

    result.forEach((g) => {
      const item = document.createElement('div');
      item.className = 'mat-item';

      const head = document.createElement('div');
      head.className = 'mat-head';
      head.innerHTML = `<span class="mat-tag">余 ${g.remainder}</span>` +
        `<span class="mat-tag all">${g.weight}</span>` +
        `<span class="mat-time">共 ${g.numbers.length} 个</span>`;
      item.appendChild(head);

      const body = document.createElement('div');
      body.className = 'draw-balls';
      g.numbers.forEach((n) => {
        body.appendChild(ballEl(String(n).padStart(2, '0'), 'red', 'sm'));
      });
      item.appendChild(body);

      // 一键复制这一组
      const copy = document.createElement('button');
      copy.className = 'btn ghost';
      copy.style.cssText = 'margin-top:10px;font-size:12px;padding:5px 12px;';
      copy.textContent = '复制这组';
      copy.addEventListener('click', () => {
        const txt = g.numbers.map((n) => String(n).padStart(2, '0')).join(' ');
        navigator.clipboard.writeText(txt).then(
          () => { copy.textContent = '已复制 ✓'; setTimeout(() => { copy.textContent = '复制这组'; }, 1500); },
          () => { copy.textContent = '复制失败'; }
        );
      });
      item.appendChild(copy);

      list.appendChild(item);
    });

    out.appendChild(list);

    // 全部结果 + 存档按钮
    const acts2 = document.createElement('div');
    acts2.className = 'actions';
    acts2.style.marginTop = '14px';

    const copyAll = document.createElement('button');
    copyAll.className = 'btn ghost';
    copyAll.textContent = '复制全部结果';
    copyAll.addEventListener('click', () => {
      const txt = flattenShrinkResult(result).map((n) => String(n).padStart(2, '0')).join(' ');
      navigator.clipboard.writeText(txt).then(
        () => { copyAll.textContent = '已复制 ✓'; setTimeout(() => { copyAll.textContent = '复制全部结果'; }, 1500); },
        () => { copyAll.textContent = '复制失败'; }
      );
    });

    const saveAsMat = document.createElement('button');
    saveAsMat.className = 'btn';
    saveAsMat.textContent = '存档到资料库';
    saveAsMat.addEventListener('click', () => {
      const txt = `【余数筛选】特征号 ${win.map((n) => String(n).padStart(2, '0')).join(' ')}\n` +
        shrinkResultToText(result, mod);
      addMaterial(txt, []);
      saveAsMat.textContent = '已存档 ✓';
      setTimeout(() => { saveAsMat.textContent = '存档到资料库'; }, 1500);
    });

    acts2.appendChild(copyAll);
    acts2.appendChild(saveAsMat);
    out.appendChild(acts2);
  });

  container.appendChild(box);
}
