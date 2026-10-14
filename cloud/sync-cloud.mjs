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
import crypto from 'node:crypto';
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
   还会真的去比对云端指纹（只读），但【不上传、不触发构建】 */
const LIST_ONLY = process.argv.includes('--list');

const TOKEN = getToken();
if (!TOKEN && !LIST_ONLY) {
  log('❌ 找不到 GitHub Token');
  log('请把 Token 保存到：' + path.join(ROOT, 'cloud-token.txt'));
  process.exit(1);
}
if (!TOKEN && LIST_ONLY) {
  log('（--list 模式：没有 Token，比对不了云端指纹，只能列出本地清单）');
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
      await new Promise((res) => setTimeout(res, 1500));
    }
  }
}

/* ---------- 「只传变化的文件」用的工具 ----------
   Git 的 blob 指纹 = sha1('blob ' + 字节数 + '\0' + 内容)，
   和 GitHub 上文件列表返回的 sha 是同一个东西。
   先拿一次云端整棵文件树的指纹表，本地逐个算一遍：
   指纹一样 = 内容没变 = 不用上传。日常同步里
   history.js / football.js / experts-data.js 这些大文件经常没变，
   跳过它们能把 45 次上传压到几次。 */
function gitBlobSha(buf) {
  const h = crypto.createHash('sha1');
  h.update('blob ' + buf.length + '\0');
  h.update(buf);
  return h.digest('hex');
}

/** 一次请求取回云端所有文件的 blob 指纹 */
async function fetchRemoteShas() {
  const r = await gh('GET', `/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`);
  const map = new Map();
  if (r.ok && r.json && Array.isArray(r.json.tree)) {
    for (const t of r.json.tree) if (t.type === 'blob') map.set(t.path, t.sha);
    return { ok: true, map, truncated: !!r.json.truncated };
  }
  return { ok: false, map, status: r.status };
}

/** 上传一个文件（已知远端 sha 就直接用；没有就现查一次） */
async function putFile(item, message) {
  if (!fs.existsSync(item.local)) return { ok: false, reason: '本地文件不存在' };

  let content;
  try { content = fs.readFileSync(item.local); }
  catch (e) { return { ok: false, reason: '读取失败 ' + String(e.message).slice(0, 60) }; }

  const url = `/repos/${OWNER}/${REPO}/contents/${item.repo}`;
  let sha = item.remoteSha || undefined;
  if (!sha && !item.isNew) {
    const exist = await gh('GET', url);
    sha = (exist.ok && exist.json && exist.json.sha) ? exist.json.sha : undefined;
  }

  const r = await gh('PUT', url, {
    message, content: content.toString('base64'), branch: BRANCH, ...(sha ? { sha } : {})
  });

  if (!r.ok) {
    /* 409/422 多半是 sha 过期（云端这个文件刚被别的东西改过）→ 重新取 sha 再传一次 */
    if (r.status === 409 || r.status === 422) {
      const again = await gh('GET', url);
      const sha2 = (again.ok && again.json && again.json.sha) ? again.json.sha : undefined;
      const r2 = await gh('PUT', url, {
        message, content: content.toString('base64'), branch: BRANCH, ...(sha2 ? { sha: sha2 } : {})
      });
      if (r2.ok) return { ok: true, size: content.length };
      return { ok: false, reason: `${r2.status} ${r2.json ? r2.json.message : String(r2.text).slice(0, 90)}` };
    }
    return { ok: false, reason: `${r.status} ${r.json ? r.json.message : String(r.text).slice(0, 90)}` };
  }
  return { ok: true, size: content.length };
}

/** 并发跑任务（默认 5 个一起传，比一个个串行快得多） */
async function runPool(items, limit, fn) {
  const queue = items.slice();
  const workers = [];
  for (let i = 0; i < Math.min(limit, queue.length); i++) {
    workers.push((async () => {
      while (queue.length) {
        const it = queue.shift();
        await fn(it);
      }
    })());
  }
  await Promise.all(workers);
}

log('════════════════════════════════════════════');
log('  同步本机 → 云端');
log('════════════════════════════════════════════');
log('');
const tAll = Date.now();

/* 数据 + 配置：云端抓不到，必须本机提供 */
const FROM_ROOT = [
  'saved-tickets.js', 'history.js', 'draws.js', 'football.js',
  'jc-data.js', 'prize-data.js', 'materials-data.js',
  /* 【竞彩已完场】累积归档。在售列表只含还能买的比赛，一开完就从
     jc-data.js 里消失 —— 已完场的累积记录全靠这个文件，不传上去
     云端重新生成竞彩页时「已完场」又会变回 0 场。 */
  'jc-history.js',
  'deepseek.config.json',
  /* 【热力图】实票统计热力图数据（当天出图的那份）。
     云端 18:00 那一班会自己重新生成；这里同步过去只作为兜底，
     保证「云端还没跑 / 跑失败」时页面上至少有本地这一份。 */
  'heatmap-data.js'
];

/* 代码模块：与项目根目录保持一致 */
const CODE_MODULES = [
  'games.js', 'draw-data.js', 'algo.js', 'stats.js', 'templates.js',
  'ticket-store.js', 'render.js', 'hit-check.js', 'data-store.js',
  'fb-page.js', 'icons.js', 'styles.css',
  /* 【必须同步】只读分享版现在直接内联这两个文件后在浏览器里实时渲染，
     云端少了它们，分享页会和本地 App 渲染得不一样
     （实测：福彩3D / 排列5 / 七星彩 的奇偶、大小、012路 会对不上）。 */
  'experts-data.js', 'expert-pool.js',
  /* 【开奖 · 多源抓取】draw-sources.mjs 是 build-draws.mjs / build-history.mjs
     共用的「多源 fallback 链 + 号码合法性校验」模块。
     云端（美国 IP）抓不到中国官方接口（福彩 403 / 体彩 567），
     靠它自动改用 一起彩 / 500XML / 17500。
     少同步这个文件，云端两个脚本会 import 失败 → 开奖号彻底不更新。 */
  'draw-sources.mjs',
  'build-draws.mjs', 'build-history.mjs', 'build-football.mjs',
  'build-jc.mjs', 'build-experts.mjs', 'build-prizes.mjs', 'build-materials.mjs',
  /* 【热力图】云端 18:00 那一班要自己跑这个脚本抓当日晒票 ——
     不同步过去的话，云端就只能用本地传上去的那份数据。 */
  'build-heatmap.mjs',
  /* 【热力图 · OCR】票面照片识别模块，build-heatmap.mjs 会 import 它。
     它自己只需要 tesseract.js / jpeg-js / pngjs 三个纯 JS 包 ——
     这些包和语言数据【不受版本管理】，所以从本机 runtime/ocr/ 一起传上去
     （见下面 OCR_RUNTIME）。云端不装 tesseract、不联网下模型也能跑。 */
  'ocr-tickets.mjs',
  'export-static.mjs', 'export-football.mjs',
  /* 【最新开奖 · 实时更新】分享页顶部那块现在会就地重画，靠的就是这两个文件：
       · latest-draws.js  —— 区块的生成函数 + 客户端更新逻辑（分享页内联它）
       · export-draws.mjs —— 从 draws.js 取各彩种最新开奖，写进 tickets.json 的 draws
     不同步的话，云端生成出来的分享页里就没有这段逻辑，
     手机打开网址还是刷新才能看到新开奖号。 */
  'latest-draws.js', 'export-draws.mjs'
];

/* ============================================================
   【热力图 · OCR 运行时】从本机 runtime/ocr/ 传上去
   ------------------------------------------------------------
   为什么必须一起传：
     云端（GitHub Actions）没有 tesseract、也不能保证能访问 npm/CDN。
     把「引擎 + 语言数据」当成普通文件传过去，云端就【完全离线】可跑，
     而且和本机用的是同一份引擎、同一个模型 —— 结果一致。
   体积：约 54 MB / 317 个文件
     · tesseract.js-core 的 *.wasm        ≈ 18 MB（只留 4 个用得到的变体）
     · tessdata/chi_sim + eng .traineddata.gz ≈ 30 MB
     · tesseract.js / jpeg-js / pngjs 等  ≈ 6 MB
   这些文件【几乎不变】，sync-cloud.mjs 的指纹比对会把它们自动跳过，
   所以只有第一次同步会慢一点。 */
const OCR_RUNTIME = [
  'runtime/ocr/tessdata/chi_sim.traineddata.gz',
  'runtime/ocr/tessdata/eng.traineddata.gz'
];
/* runtime/ocr/node_modules 下要传的包（其余不传，省体积） */
const OCR_PACKAGES = [
  'tesseract.js', 'tesseract.js-core', 'jpeg-js', 'pngjs',
  'bmp-js', 'idb-keyval', 'is-url', 'node-fetch', 'wasm-feature-detect', 'zlibjs',
  'data-uri-to-buffer', 'fetch-blob', 'formdata-polyfill', 'node-domexception',
  'regenerator-runtime', 'tr46', 'webidl-conversions', 'whatwg-url', 'punycode'
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

/* 【热力图 · OCR 运行时】把 runtime/ocr 下的引擎 + 语言数据也复制进 cloud/scripts/runtime/ocr/ */
log('');
log('【1.2/3】刷新 OCR 运行时（tesseract.js + 语言数据，纯 JS、离线可用）');
let ocrCopied = 0;
const OCR_DEST = path.join(SCRIPTS, 'runtime', 'ocr');
/* 先整个清掉再拷：本机删掉的包/剪掉的体积，云端也要跟着消失，
   否则旧文件会一直留在仓库里（越传越大，还会传已经被删的垃圾）。 */
try { fs.rmSync(OCR_DEST, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
for (const f of OCR_RUNTIME) {
  const src = path.join(PARENT, f);
  if (!fs.existsSync(src)) { log(`  ⚠️ 缺少 ${f}（OCR 在云端会降级成兜底口径）`); continue; }
  try {
    const dst = path.join(SCRIPTS, f.replace(/^runtime[\\/]ocr[\\/]/, 'runtime/ocr/'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    ocrCopied++;
  } catch (e) { log(`  ⚠️ ${f} 复制失败：${e.message}`); }
}
for (const pkg of OCR_PACKAGES) {
  const src = path.join(PARENT, 'runtime', 'ocr', 'node_modules', pkg);
  if (!fs.existsSync(src)) { log(`  ⚠️ 缺少 OCR 包 ${pkg}`); continue; }
  try {
    const dst = path.join(OCR_DEST, 'node_modules', pkg);
    fs.cpSync(src, dst, { recursive: true });
    ocrCopied++;
  } catch (e) { log(`  ⚠️ OCR 包 ${pkg} 复制失败：${e.message}`); }
}
log(`  ✅ OCR 运行时已刷新（${ocrCopied} 项）→ cloud/scripts/runtime/ocr/`);

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

/* 【特例】cloud/scripts/runtime/ocr/node_modules 必须传！
   ------------------------------------------------------------
   collect() 默认跳过所有 node_modules（那是构建产物），
   但 OCR 运行时（tesseract.js + WASM）恰恰就放在 node_modules 里，
   而且它【不在任何 package.json 里】—— 云端没有 npm install，
   不传过去云端就没有 OCR 引擎，热力图的主口径直接失效。
   所以这里只对这一个路径开绿灯。 */
const KEEP_NODE_MODULES_PREFIX = 'cloud/scripts/runtime/ocr/';

function collect(dir, prefix) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) {
      /* runtime/ocr 下的 node_modules 例外：继续往下收 */
      if (name === 'node_modules' && prefix.startsWith(KEEP_NODE_MODULES_PREFIX)) { /* 继续 */ }
      else continue;
    }
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

/* ---------- 比指纹，挑出真正变了的文件 ---------- */
log('');
log('  比对云端文件指纹，只传变了的文件 ...');
const t0 = Date.now();
const remote = await fetchRemoteShas();
if (remote.ok) {
  log(`  ✅ 一次请求取回云端 ${remote.map.size} 个文件的指纹${remote.truncated ? '（列表被截断，会多传几个）' : ''}`);
} else {
  log(`  ⚠️ 取不到云端指纹（HTTP ${remote.status}），退回「逐个查询 + 全部上传」的老办法`);
}
if (remote.truncated) remote.map.clear();   /* 截断了就不敢跳过任何文件 */

let skippedCount = 0;
for (const f of files) {
  let localSha = null;
  try { localSha = gitBlobSha(fs.readFileSync(f.local)); } catch (e) { /* 读不了就当变了 */ }
  f.remoteSha = remote.map.get(f.repo) || null;
  f.isNew = !f.remoteSha;
  f.changed = !localSha || !f.remoteSha || localSha !== f.remoteSha;
  if (!f.changed) skippedCount++;
}
const changedFiles = files.filter((f) => f.changed);
log(`  ${files.length} 个里需要上传 ${changedFiles.length} 个，内容没变的 ${skippedCount} 个直接跳过`);

/* --list：只打印清单，不上传 */
if (LIST_ONLY) {
  log('');
  log('  ── 上传清单（--list 模式：不上传、不触发构建）──');
  files.forEach((f, i) => log(`    ${String(i + 1).padStart(3, ' ')}. ${f.changed ? '📤 会上传' : '⏭  没变跳过'}  ${f.repo}`));
  log('');
  log('  ✅ 清单中包含 cloud/out/tickets.json：' +
    (files.some((f) => f.repo === 'cloud/out/tickets.json') ? '是' : '否 ❌'));
  log('  ✅ 清单中包含 .github/workflows/daily-update.yml：' +
    (files.some((f) => f.repo === '.github/workflows/daily-update.yml') ? '是' : '否'));
  log('  ✅ 清单中包含 cloud/scripts/saved-tickets.js：' +
    (files.some((f) => f.repo === 'cloud/scripts/saved-tickets.js') ? '是' : '否'));
  log('  ✅ 清单中包含 cloud/scripts/sync-stamp.json：' +
    (files.some((f) => f.repo === 'cloud/scripts/sync-stamp.json') ? '是' : '否'));
  log(`  ✅ 本次实际需要上传 ${changedFiles.length} 个文件（指纹比对耗时 ${Date.now() - t0} ms）`);
  process.exit(0);
}

log('');
log(`  开始上传（8 个并发）...`);

const uploadStart = Date.now();
let okCount = 0;
const failed = [];

/* 一轮并发上传（失败的单文件原地再试一次） */
async function uploadPass(list, concurrency, quiet) {
  await runPool(list, concurrency, async (f) => {
    let r = await putFile(f, '同步 ' + path.basename(f.repo));
    if (!r.ok) {                    /* 单文件失败立刻原地再试一次 */
      await new Promise((s) => setTimeout(s, 1200));
      r = await putFile(f, '同步 ' + path.basename(f.repo));
    }
    if (r.ok) {
      okCount++;
      if (!quiet) process.stdout.write('.');
    } else {
      failed.push({ repo: f.repo, reason: r.reason });
      process.stdout.write('x');
    }
  });
}

await uploadPass(changedFiles, 8, false);

log('');
log(`  ✅ 上传成功 ${okCount} 个 / 需要上传 ${changedFiles.length} 个，用时 ${((Date.now() - uploadStart) / 1000).toFixed(1)} 秒`);

/* 还有失败的再来一轮（串行，慢但稳） */
if (failed.length) {
  const retryFiles = changedFiles.filter((f) => failed.some((x) => x.repo === f.repo));
  log('');
  log(`  ⚠️ 以下文件没传上去，再重试一轮：`);
  failed.forEach((x) => log(`      ${x.repo}  ← ${x.reason}`));
  failed.length = 0;
  okCount = 0;
  await uploadPass(retryFiles, 2, true);
  const stillFailed = failed.length;
  log(`  重试结果：又成功 ${okCount} 个${stillFailed ? `，还是失败 ${stillFailed} 个：${failed.map((x) => x.repo).join(', ')}` : ''}`);
  if (stillFailed) {
    log('  ⚠️ 这些文件没传成功，云端会用仓库里的旧版本（号码可能不更新）');
    log('     办法：等 1 分钟再跑一次同步（cloud\\sync-cloud.cmd）');
  }
}

log('');
log('触发云端重新构建（快速模式：直接用刚同步过去的数据，不重新抓取）...');
const tDispatch = Date.now();
const dispatchUrl = `/repos/${OWNER}/${REPO}/actions/workflows/daily-update.yml/dispatches`;
let trigger = await gh('POST', dispatchUrl, { ref: BRANCH, inputs: { quick: '1' } });

/* 万一云端仓库里的 workflow 还没声明 quick 这个输入（会返回 422），
   退一步用普通方式再触发一次，保证「一定会有一次构建」。 */
if (trigger.status === 422) {
  log('  ⚠️ 快速模式参数被拒（422），改用普通触发重试一次');
  trigger = await gh('POST', dispatchUrl, { ref: BRANCH });
}

if (trigger.ok || trigger.status === 204) {
  log(`  ✅ 已触发（用时 ${((Date.now() - tDispatch) / 1000).toFixed(1)} 秒）`);
  log(`  ⏱  本次同步总共用时 ${((Date.now() - tAll) / 1000).toFixed(1)} 秒（改之前要 80 多秒）`);
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
