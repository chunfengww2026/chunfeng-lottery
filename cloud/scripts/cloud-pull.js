/* ============================================================
   cloud-pull.js —— 本机从云端同步号码
   ------------------------------------------------------------
   为什么需要它：
     云端每天凌晨 2 点会自己摇号（不用开电脑），
     本机如果不开，号码就和云端不一样。
     本模块在程序启动时自动下载云端的号码，
     让「本机显示」和「微信链接上」永远一致。

   同步规则（重要）：
     · 云端更新时间【更晚】→ 用云端的（云端赢）
     · 本机更新时间【更晚】→ 保留本机（你刚摇的号不能被覆盖）
     · 手动点「强制用云端」→ 无论如何都用云端

   网址：https://chunfengww2026.github.io/chunfeng-lottery/tickets.json
   ============================================================ */

const CLOUD_TICKETS_URL = 'https://chunfengww2026.github.io/chunfeng-lottery/tickets.json';
const CLOUD_SYNC_KEY = 'cdd.cloud.checked';     // 上次检查时间
const CLOUD_IMPORT_KEY = 'cdd.cloud.imported';  // 上次从云端导入时用的时间戳

/** 把 "2026-10-14 04:10" 这种字符串转成时间戳 */
function cloudParseTime(s) {
  if (!s) return 0;
  const t = new Date(String(s).replace(' ', 'T'));
  return isNaN(t.getTime()) ? 0 : t.getTime();
}

/**
 * 本机的「有效更新时间」
 *   = max(文件里的 updated, 上次从云端导入的时间)
 *
 * 为什么要这样：fileTicketsTime() 只返回文件时间。
 * 导入云端号码后，文件时间没变，会被误判成「本机更旧」而反复导入。
 */
function cloudLocalTime() {
  let fileT = 0;
  try {
    if (typeof fileTicketsTime === 'function') fileT = cloudParseTime(fileTicketsTime());
  } catch (e) { /* 忽略 */ }
  let impT = 0;
  try { impT = Number(localStorage.getItem(CLOUD_IMPORT_KEY) || 0) || 0; } catch (e) { /* 忽略 */ }
  return Math.max(fileT, impT);
}

/** 下载云端号码 */
async function cloudDownload() {
  const res = await fetch(CLOUD_TICKETS_URL + '?t=' + Date.now(), {
    cache: 'no-store',
    signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout)
      ? AbortSignal.timeout(25000) : undefined
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  if (!j || !j.tickets || !Object.keys(j.tickets).length) throw new Error('云端数据是空的');
  return j;
}

/**
 * 同步：把云端号码导入本机
 * @param {boolean} force  true=不管时间，直接用云端
 * @returns {Promise<{ok:boolean, action:string, msg:string}>}
 */
async function cloudSync(force) {
  let remote;
  try {
    remote = await cloudDownload();
  } catch (e) {
    return { ok: false, action: 'fail', msg: '下载失败：' + String(e.message || e).slice(0, 80) };
  }

  const remoteTime = cloudParseTime(remote.updated) || cloudParseTime(remote.publishedAt);
  const localTime = cloudLocalTime();

  if (!force && localTime && localTime >= remoteTime) {
    const lt = fileTicketsTime ? fileTicketsTime() : '';
    return { ok: true, action: 'keep', msg: '本机号码更新（' + lt + '），无需同步' };
  }

  /* 导入本机 */
  try {
    if (typeof saveTickets === 'function') saveTickets(remote.tickets);
    localStorage.setItem('cdd.tickets.v1', JSON.stringify(remote.tickets));
    localStorage.setItem(CLOUD_IMPORT_KEY, String(remoteTime || Date.now()));
    localStorage.setItem(CLOUD_SYNC_KEY, String(Date.now()));
  } catch (e) {
    return { ok: false, action: 'fail', msg: '写入本机失败：' + String(e.message).slice(0, 80) };
  }

  return {
    ok: true, action: 'import',
    msg: '已采用云端号码（' + remote.updated + '，' + Object.keys(remote.tickets).length + ' 个彩种）'
  };
}

/**
 * 启动时自动检查（静默，失败不打扰用户）
 */
async function cloudAutoCheck() {
  try {
    /* 10 分钟内检查过就不再查 */
    const last = Number(localStorage.getItem(CLOUD_SYNC_KEY) || 0);
    if (last && Date.now() - last < 10 * 60 * 1000) return;

    const r = await cloudSync(false);
    if (r.ok && r.action === 'import') {
      console.log('[云端同步] ' + r.msg);
      /* 有更新就提示用户刷新 */
      if (typeof cloudShowToast === 'function') {
        cloudShowToast('已从云端同步最新号码，页面即将刷新…');
        setTimeout(() => location.reload(), 1600);
      }
    }
  } catch (e) {
    console.log('[云端同步] 跳过：' + e.message);
  }
}

/** 轻提示 */
function cloudShowToast(text) {
  try {
    let el = document.getElementById('cloudToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cloudToast';
      el.style.cssText = 'position:fixed;left:50%;bottom:36px;transform:translateX(-50%);' +
        'background:rgba(71,224,160,0.95);color:#0b1a12;font-size:13.5px;font-weight:600;' +
        'padding:11px 20px;border-radius:24px;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.35);' +
        'white-space:nowrap;';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
  } catch (e) { /* 忽略 */ }
}

/* ============================================================
   界面：云端同步面板（放在资料页）
   ============================================================ */
function renderCloudPanel(container, onChanged) {
  const box = document.createElement('div');
  box.className = 'panel';

  const h3 = document.createElement('h3');
  h3.innerHTML = '云端同步 <span class="hint">让本机和微信链接的号码一致</span>';
  box.appendChild(h3);

  const note = document.createElement('div');
  note.className = 'tk-note';
  note.style.marginBottom = '12px';
  note.innerHTML =
    '云端每天<b>凌晨 2 点</b>自动摇号（不用开电脑）。<br>' +
    '本机启动时会自动下载云端的号码，让两边一致。<br>' +
    '⚠️ 你刚在本机摇的号<b>不会被覆盖</b>（本机时间更新时保留本机）。';
  box.appendChild(note);

  const acts = document.createElement('div');
  acts.className = 'actions';

  const msg = document.createElement('span');
  msg.style.cssText = 'font-size:12px;margin-left:10px;';

  const checkBtn = document.createElement('button');
  checkBtn.className = 'btn';
  checkBtn.textContent = '检查云端更新';
  checkBtn.addEventListener('click', async () => {
    checkBtn.disabled = true;
    msg.style.color = '#f0b429';
    msg.textContent = '检查中…';
    const r = await cloudSync(false);
    checkBtn.disabled = false;
    msg.style.color = r.ok ? '#7ee787' : '#f0575c';
    msg.textContent = (r.ok ? '✅ ' : '❌ ') + r.msg;
    if (r.ok && r.action === 'import' && onChanged) onChanged();
  });

  const forceBtn = document.createElement('button');
  forceBtn.className = 'btn ghost';
  forceBtn.textContent = '强制用云端号码';
  forceBtn.title = '不管时间，直接用云端的号覆盖本机';
  forceBtn.addEventListener('click', async () => {
    if (!confirm('确定用云端的号码覆盖本机吗？\n本机当前的号码会丢失。')) return;
    forceBtn.disabled = true;
    msg.style.color = '#f0b429';
    msg.textContent = '同步中…';
    const r = await cloudSync(true);
    forceBtn.disabled = false;
    msg.style.color = r.ok ? '#7ee787' : '#f0575c';
    msg.textContent = (r.ok ? '✅ ' : '❌ ') + r.msg;
    if (r.ok && r.action === 'import' && onChanged) onChanged();
  });

  const pushBtn = document.createElement('button');
  pushBtn.className = 'btn ghost';
  pushBtn.textContent = '推送到云端';
  pushBtn.title = '把本机号码上传到云端（和页头的「同步到网页」是同一件事）';
  pushBtn.addEventListener('click', async () => {
    if (typeof syncToWeb !== 'function') {
      msg.style.color = '#8b93a1';
      msg.textContent = '这个页面没加载同步模块，请用页头的「同步到网页」';
      return;
    }
    if (pushBtn.disabled) return;
    pushBtn.disabled = true;
    msg.style.color = '#f0b429';
    msg.textContent = '正在推送…';
    const r = await syncToWeb((t) => { msg.textContent = t; });
    pushBtn.disabled = false;
    msg.style.color = r.ok ? '#7ee787' : '#f0575c';
    msg.textContent = (r.ok ? '✅ ' : '❌ ') + r.msg;
  });

  acts.appendChild(checkBtn);
  acts.appendChild(forceBtn);
  acts.appendChild(pushBtn);
  acts.appendChild(msg);
  box.appendChild(acts);

  container.appendChild(box);
}

/* 页面加载后自动检查一次（延迟 2 秒，别影响打开速度） */
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(() => { cloudAutoCheck(); }, 2000);
  });
}
