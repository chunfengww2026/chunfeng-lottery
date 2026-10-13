// ============================================================
//  sync-cloud.mjs —— 把本机的代码 + 数据全部同步到云端
//
//  为什么必须这样做：
//    GitHub 的服务器在美国，抓中国彩票接口会被拒绝：
//      福彩（双色球/3D/七乐彩/快乐8） → HTTP 403
//      体彩（大乐透/排列3/排列5/七星彩）→ HTTP 567
//    所以云端自己抓不到数据，必须用本机同步上去的。
//
//  做的事情：
//    1. 从项目根目录刷新 cloud/scripts/ 里的模块与数据
//    2. 写同步标记（告诉云端构建：别重抓，直接用）
//    3. 把 cloud/ 下所有文件上传到 GitHub
//    4. 触发一次云端重新构建
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));   // D:\彩虹多多\cloud
const PARENT = path.join(ROOT, '..');                        // D:\彩虹多多
const SCRIPTS = path.join(ROOT, 'scripts');
const log = (...a) => console.log(...a);

const OWNER = 'chunfengww2026';
const REPO = 'chunfeng-lottery';
const BRANCH = 'main';
const API = 'https://api.github.com';

function getToken() {
  const fromArg = (process.argv[2] || '').trim();
  if (fromArg) return fromArg;
  const tokenFile = path.join(ROOT, 'cloud-token.txt');
  if (fs.existsSync(tokenFile)) {
    const t = fs.readFileSync(tokenFile, 'utf8').trim();
    if (t) return t;
  }
  return (process.env.GITHUB_TOKEN || '').trim();
}

const TOKEN = getToken();
if (!TOKEN) {
  log('❌ 找不到 GitHub Token');
  log('请把 Token 保存到：' + path.join(ROOT, 'cloud-token.txt'));
  process.exit(1);
}

async function gh(method, endpoint, body, tries = 3) {
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch(API + endpoint, {
        method,
        headers: {
          'Authorization': 'Bearer ' + TOKEN,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'chunfeng-sync',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60000)
      });
      const text = await r.text();
      let json = null;
      try { json = JSON.parse(text); } catch (e) {}
      return { ok: r.ok, status: r.status, json, text };
    } catch (e) {
      if (t === tries) return { ok: false, status: 0, text: String(e.message) };
      log(`     网络抖动，重试 ${t}/${tries}...`);
      await new Promise((res) => setTimeout(res, 4000));
    }
  }
}

async function putFile(localPath, repoPath, message) {
  if (!fs.existsSync(localPath)) return { ok: false, reason: '本地文件不存在' };
  const content = fs.readFileSync(localPath);
  const b64 = content.toString('base64');
  const url = `/repos/${OWNER}/${REPO}/contents/${repoPath}`;

  const exist = await gh('GET', url);
  const sha = (exist.ok && exist.json && exist.json.sha) ? exist.json.sha : undefined;

  const r = await gh('PUT', url, {
    message, content: b64, branch: BRANCH, ...(sha ? { sha } : {})
  });

  if (!r.ok) return { ok: false, reason: `${r.status} ${r.json ? r.json.message : String(r.text).slice(0, 90)}` };
  return { ok: true, size: content.length };
}

log('════════════════════════════════════════════');
log('  同步本机 → 云端');
log('════════════════════════════════════════════');
log('');

/* 数据 + 配置：云端抓不到，必须本机提供 */
const FROM_ROOT = [
  'saved-tickets.js', 'history.js', 'draws.js', 'football.js',
  'jc-data.js', 'prize-data.js', 'materials-data.js',
  'deepseek.config.json'
];

/* 代码模块：与项目根目录保持一致 */
const CODE_MODULES = [
  'games.js', 'draw-data.js', 'algo.js', 'stats.js', 'templates.js',
  'ticket-store.js', 'render.js', 'hit-check.js', 'data-store.js',
  'fb-page.js', 'icons.js', 'styles.css', 'ai-config.js',
  /* 【必须同步】只读分享版现在直接内联这两个文件后在浏览器里实时渲染，
     云端少了它们，分享页会和本地 App 渲染得不一样
     （实测：福彩3D / 排列5 / 七星彩 的奇偶、大小、012路 会对不上）。 */
  'experts-data.js', 'expert-pool.js',
  'build-draws.mjs', 'build-history.mjs', 'build-football.mjs',
  'build-jc.mjs', 'build-prizes.mjs', 'build-materials.mjs',
  'export-static.mjs', 'export-football.mjs'
];

log('【1/3】刷新云端模块');
let refreshed = 0;
const missing = [];
for (const f of [...FROM_ROOT, ...CODE_MODULES]) {
  const src = path.join(PARENT, f);
  if (!fs.existsSync(src)) { missing.push(f); continue; }
  try {
    fs.copyFileSync(src, path.join(SCRIPTS, f));
    refreshed++;
  } catch (e) {
    log(`  ⚠️ ${f} 复制失败：${e.message}`);
  }
}
log(`  ✅ 已刷新 ${refreshed} 个文件`);
if (missing.length) log(`  ⏭  本机缺少：${missing.join(', ')}`);

log('');
log('【2/3】写同步标记');
const stampPath = path.join(SCRIPTS, 'sync-stamp.json');
fs.writeFileSync(stampPath, JSON.stringify({
  syncedAt: new Date().toISOString(),
  note: '本机刚同步过完整数据，云端构建请直接使用，不要重新抓取'
}, null, 2), 'utf8');
log('  ✅ ' + new Date().toISOString());

log('');
log('【3/3】上传到 GitHub');

const SKIP_DIRS = new Set(['out', 'node_modules', '.git']);
const SKIP_FILES = new Set(['cloud-token.txt']);

function collect(dir, prefix) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...collect(full, prefix + name + '/'));
    else {
      if (SKIP_FILES.has(name)) continue;
      out.push({ local: full, repo: prefix + name });
    }
  }
  return out;
}

const files = collect(ROOT, 'cloud/');

const wf = path.join(PARENT, '.github', 'workflows', 'daily-update.yml');
if (fs.existsSync(wf)) files.push({ local: wf, repo: '.github/workflows/daily-update.yml' });

log(`  共 ${files.length} 个文件`);

let okCount = 0;
const failed = [];

for (const f of files) {
  const r = await putFile(f.local, f.repo, '同步 ' + path.basename(f.repo));
  if (r.ok) { okCount++; process.stdout.write('.'); }
  else { failed.push(f.repo); process.stdout.write('x'); }
  await new Promise((res) => setTimeout(res, 180));
}

log('');
log(`  ✅ 成功 ${okCount} 个${failed.length ? `，失败 ${failed.length} 个：${failed.slice(0, 8).join(', ')}` : ''}`);

log('');
log('触发云端重新构建 ...');
const trigger = await gh('POST',
  `/repos/${OWNER}/${REPO}/actions/workflows/daily-update.yml/dispatches`,
  { ref: BRANCH });

if (trigger.ok || trigger.status === 204) {
  log('  ✅ 已触发，等 2-3 分钟云端就更新好了');
} else {
  log(`  ⚠️ 触发失败：${trigger.status}`);
  log(`     手动去：https://github.com/${OWNER}/${REPO}/actions`);
}

log('');
log('════════════════════════════════════════════');
log('  完成');
log(`  🌐 https://${OWNER.toLowerCase()}.github.io/${REPO}/`);
log('════════════════════════════════════════════');
