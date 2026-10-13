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
import { writeCloudTickets } from '../export-cloud-tickets.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));   // D:\彩虹多多\cloud
const PARENT = path.join(ROOT, '..');                        // D:\彩虹多多
const SCRIPTS = path.join(ROOT, 'scripts');
const log = (...a) => console.log(...a);

const OWNER = 'chunfengww2026';
const REPO = 'chunfeng-lottery';
const BRANCH = 'main';
const API = 'https://api.github.com';

function getToken() {
  const fromArg = (process.argv.slice(2).find((a) => a && !a.startsWith('--')) || '').trim();
  if (fromArg) return fromArg;
  const tokenFile = path.join(ROOT, 'cloud-token.txt');
  if (fs.existsSync(tokenFile)) {
    const t = fs.readFileSync(tokenFile, 'utf8').trim();
    if (t) return t;
  }
  return (process.env.GITHUB_TOKEN || '').trim();
}

/* --list：本地准备工作照做（刷新 cloud/scripts、写同步标记、刷新 tickets.json），
   但【不上传、不触发构建】，只把要上传的文件清单打印出来（排查用） */
const LIST_ONLY = process.argv.includes('--list');

const TOKEN = LIST_ONLY ? '(list-only)' : getToken();
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

/* 页面产物：也一起刷新。
   为什么必须同步这两份 HTML：
   cloud-build.mjs 生成完网页后会把 cloud/scripts/只读分享版.html
   复制成 out/index.html。万一云端那次生成网页失败（比如少个模块），
   复制过去的就是【仓库里这一份】。如果它是老版本，
   部署上去的页面就没有「拉 tickets.json 就地重渲染」的能力 ——
   手机看到的还是旧号码。所以这里必须是本机刚生成的新版。 */
const PAGE_ARTIFACTS = ['只读分享版.html', '足球推荐.html'];

log('【1/3】刷新云端模块');
let refreshed = 0;
const missing = [];
for (const f of [...FROM_ROOT, ...CODE_MODULES, ...PAGE_ARTIFACTS]) {
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

/* 【准实时】顺手把当前号码重新发布成 cloud/out/tickets.json。
   分享页启动后会拉这个文件，只要它比页面里的内联快照新，
   就【就地重渲染】成新号码 —— 不用等云端重新构建整个页面。
   所以这个文件每次同步都必须是新的（摇号脚本里也会写，这里是双保险）。 */
log('');
log('【1.5/3】刷新 cloud/out/tickets.json（分享页的准实时数据源）');
const pub = writeCloudTickets({ root: PARENT, source: 'local' });
if (pub.ok) {
  log(`  ✅ updated=${pub.updated}`);
  log(`     publishedAt=${pub.publishedAt}（${pub.games} 个彩种 / ${(pub.size / 1024).toFixed(1)} KB）`);
} else {
  log(`  ⚠️ 没有生成：${pub.reason}（先跑 roll-and-export.mjs 或 export-only.mjs 生成号码）`);
}

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

/* 【必须单独加回来】cloud/out/tickets.json
   collect() 会跳过 out/ 目录（那是构建产物），但 tickets.json 不一样：
   它是分享页的「准实时」数据源 —— 本机一摇完号就发布一份新的，
   传到仓库后网站上的 tickets.json 立刻就是新号码，
   手机上的分享页拉到它就能就地重渲染（页面自带这段逻辑）。 */
const TICKETS_JSON = path.join(ROOT, 'out', 'tickets.json');
if (fs.existsSync(TICKETS_JSON)) {
  files.push({ local: TICKETS_JSON, repo: 'cloud/out/tickets.json' });
  log(`  📤 cloud/out/tickets.json 已加入上传列表（${(fs.statSync(TICKETS_JSON).size / 1024).toFixed(1)} KB）`);
} else {
  log('  ⚠️ 找不到 cloud/out/tickets.json，本次不会更新网站上的号码文件');
}

const wf = path.join(PARENT, '.github', 'workflows', 'daily-update.yml');
if (fs.existsSync(wf)) files.push({ local: wf, repo: '.github/workflows/daily-update.yml' });

log(`  共 ${files.length} 个文件`);

/* --list：只打印清单，不上传 */
if (LIST_ONLY) {
  log('');
  log('  ── 上传清单（--list 模式：不上传、不触发构建）──');
  files.forEach((f, i) => log(`    ${String(i + 1).padStart(3, ' ')}. ${f.repo}`));
  log('');
  log('  ✅ 清单中包含 cloud/out/tickets.json：' +
    (files.some((f) => f.repo === 'cloud/out/tickets.json') ? '是' : '否 ❌'));
  log('  ✅ 清单中包含 .github/workflows/daily-update.yml：' +
    (files.some((f) => f.repo === '.github/workflows/daily-update.yml') ? '是' : '否'));
  log('  ✅ 清单中包含 cloud/scripts/saved-tickets.js：' +
    (files.some((f) => f.repo === 'cloud/scripts/saved-tickets.js') ? '是' : '否'));
  log('  ✅ 清单中包含 cloud/scripts/sync-stamp.json：' +
    (files.some((f) => f.repo === 'cloud/scripts/sync-stamp.json') ? '是' : '否'));
  process.exit(0);
}

let okCount = 0;
const failed = [];

async function uploadAll(list, quiet) {
  for (const f of list) {
    const r = await putFile(f.local, f.repo, '同步 ' + path.basename(f.repo));
    if (r.ok) { okCount++; if (!quiet) process.stdout.write('.'); }
    else { failed.push({ repo: f.repo, reason: r.reason }); process.stdout.write('x'); }
    await new Promise((res) => setTimeout(res, 180));
  }
}

await uploadAll(files, false);

log('');
log(`  ✅ 成功 ${okCount} 个${failed.length ? `，失败 ${failed.length} 个` : ''}`);

/* 失败的重试一遍（常见原因：网络抖动、GitHub 一时 409/502、
   或者本机刚好在改这个文件）。失败原因也打出来，方便排查。 */
if (failed.length) {
  const retryFiles = files.filter((f) => failed.some((x) => x.repo === f.repo));
  log('');
  log(`  ⚠️ 以下文件第 1 次没传上去，正在重试一遍：`);
  failed.forEach((x) => log(`      ${x.repo}  ← ${x.reason}`));
  failed.length = 0;
  log('  重试中 ...');
  await uploadAll(retryFiles, true);
  log('');
  log(`  重试结果：成功 ${retryFiles.length - failed.length} 个` +
    (failed.length ? `，还是失败 ${failed.length} 个：${failed.map((x) => x.repo).join(', ')}` : ''));
  if (failed.length) {
    log('  ⚠️ 这些文件没传成功，云端会用仓库里的旧版本（号码可能不更新）');
    log('     办法：等 1 分钟再跑一次同步（cloud\\sync-cloud.cmd）');
  }
}

log('');
log('触发云端重新构建（快速模式：直接用刚同步过去的数据，不重新抓取）...');
const dispatchUrl = `/repos/${OWNER}/${REPO}/actions/workflows/daily-update.yml/dispatches`;
let trigger = await gh('POST', dispatchUrl, { ref: BRANCH, inputs: { quick: '1' } });

/* 万一云端仓库里的 workflow 还没声明 quick 这个输入（会返回 422），
   退一步用普通方式再触发一次，保证「一定会有一次构建」。 */
if (trigger.status === 422) {
  log('  ⚠️ 快速模式参数被拒（422），改用普通触发重试一次');
  trigger = await gh('POST', dispatchUrl, { ref: BRANCH });
}

if (trigger.ok || trigger.status === 204) {
  log('  ✅ 已触发');
  log('     · 网站上的 tickets.json：约 1 分钟（云端构建 + 部署）');
  log('     · 手机上的分享页：拉到新号码后立刻重渲染，不用等页面重建');
} else {
  log(`  ⚠️ 触发失败：${trigger.status}`);
  log(`     手动去：https://github.com/${OWNER}/${REPO}/actions`);
}

log('');
log('════════════════════════════════════════════');
log('  完成');
log(`  🌐 https://${OWNER.toLowerCase()}.github.io/${REPO}/`);
log('════════════════════════════════════════════');
