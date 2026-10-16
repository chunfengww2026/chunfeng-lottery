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
  /* 【竞彩在售场次】体彩官网公布的真实在售场次（build-jc-count.mjs 抓的）。
      必须同步过去：export-football.mjs 读它的 inSale 当「体彩竞彩在售 N 场」
      的那个 N；云端重新生成竞彩页时少了这个文件就会退回本机竞彩数据算的
      upcoming + live 兜底，页面上那个数字就会和体彩官网对不上。 */
  'jc-official.js',
  'deepseek.config.json',
  /* 【热力图】实票统计热力图数据（当天出图的那份）。
     云端 18:00 那一班会自己重新生成；这里同步过去只作为兜底，
     保证「云端还没跑 / 跑失败」时页面上至少有本地这一份。 */
  'heatmap-data.js',
  /* 【文章参考】文章列表数据（build-articles.mjs 每 30 分钟本机抓一次）。
     必须同步过去：云端重新跑 export-static.mjs 生成分享页时会读它，
     少了它云端生成出来的页面就没有「文章参考」这个区块的内容
     （会显示「本期暂无」，等于把本机刚更新的文章冲掉）。 */
  'articles-data.js',
  /* 【开机号 / 选号直播】数据（build-kjh.mjs 每天 2 点本机抓一次）。
      必须同步过去：云端重新跑 export-static.mjs 生成分享页时会读它，
      少了它云端生成出来的页面里「开机号 / 选号直播」两个区块就是空的
      （会显示「暂无」，等于把本机刚更新的开机号冲掉）。 */
  'kjh-data.js',
  /* 【晒票栏】图片数据（build-xysp.mjs 每 30 分钟本机抓一次，
      只保留最近 72 小时内抓到的条目；图片本身是外链、不下载）。
      必须同步过去：云端重新跑 export-static.mjs 生成分享页时会读它，
      少了它云端生成出来的页面里「晒票栏」就是空的（显示「暂无」），
      等于把本机刚抓到的晒票冲掉。
      注：这份里已经包含 games.tt（今日头条那份，下面单独同步它的缓存）。 */
  'xysp-data.js',
  /* 【晒票栏 · 头条】今日头条晒票缓存（build-xysp-tt.mjs 每 30 分钟抓一次）。
      同步过去的用处和 xysp-data.js 一样，是【兜底】：
      云端那一班如果抓不到头条（退出码 10），build-xysp.mjs 就照旧合并
      xysp-data.js 里已有的 games.tt —— 但只要 cloud/scripts/xysp-data.js
      是本机刚同步上去的，头条那 60 条就已经在里面了，页面不会空。
      单独同步它，是为了让「云端本机两条路都断」时头条仍然有数据可合并。 */
  'xysp-tt-data.js',
  /* 【竞彩晒票】竞彩实票缓存（build-xysp-tt.mjs 的「竞彩晒票」分类抓的）。
      ⚠️ 必须同步：竞彩页 足球推荐.html 是云端 export-football.mjs 现场生成的，
         它直接读这个文件（loadVar('xysp-jc-data.js')）。
         少了它，云端生成出来的竞彩页里「晒票」区块就是「暂无」，
         等于把本机刚抓到的竞彩实票冲掉。
         另外 build-xysp.mjs 也会把它合进 xysp-data.js 的 games.jc（备用）。 */
  'xysp-jc-data.js'
];

/* 代码模块：与项目根目录保持一致 */
const CODE_MODULES = [
  'games.js', 'draw-data.js', 'algo.js', 'stats.js', 'templates.js',
  'ticket-store.js', 'render.js', 'hit-check.js', 'data-store.js',
  'fb-page.js', 'icons.js', 'styles.css',
  /* 【竞彩亚指综合换算】asian-index.js 是竞彩/足球共用的算法文件：
       · build-jc.mjs 用 vm 读它算每场的 asianIndex（写进 jc-data.js）
       · export-football.mjs 用 vm 读它渲染 足球推荐.html
     云端少了它，云端重新生成竞彩页时亚指那一块会整块消失
     （本机 fb-page.js 也是 <script src> 直接加载它的）。
     另注：jc-archive.mjs 是 build-jc.mjs 的 import 依赖，同样必须同步。 */
  'asian-index.js', 'jc-archive.mjs',
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
  /* 【开机号 / 选号直播】抓取脚本（每天 2 点本机跑，跟着 daily-update.mjs）。
      云端【每 30 分钟那一班】也会跑它（一起彩云端实测 200）。 */
  'build-kjh.mjs',
  /* 【晒票栏】抓取脚本（本机每 30 分钟跑一次，跟着文章那一班）。
      云端【每 30 分钟那一班】也会跑它（一起彩云端实测 200）。 */
  'build-xysp.mjs',
  /* 【晒票栏 · 头条】今日头条晒票抓取脚本（本机每 30 分钟跑一次，
      排在 build-xysp.mjs 【之前】）。
      ⚠️ 必须同步，两个原因：
        ① 云端每 30 分钟那一班也要自己抓头条（cloud-build.mjs 的【5】附属抓取）
        ② build-xysp.mjs 用 import 读它里面的 mergeTt / readTtOld —— 
           云端 scripts/ 里没有这个文件的话，build-xysp.mjs 直接
           ERR_MODULE_NOT_FOUND，整个晒票栏（含一起彩那 8 个彩种）全没了。
      它只写 xysp-tt-data.js；xysp-data.js 永远只由 build-xysp.mjs 写。 */
  'build-xysp-tt.mjs',
  /* 【票图校验】OCR 判"图里到底有没有票"（用户要求「整票百分百」）。
      ⚠️ 必须同步：build-xysp-tt.mjs 里 `import ... from './verify-ticket.mjs'`，
      云端 scripts/ 里没有它 → ERR_MODULE_NOT_FOUND → 整个头条晒票分类挂掉。
      ⚠️ 它的【缓存文件】_ticket-ocr-cache.json 不在这里 ——
      那个是本机运行态数据（几百 KB、每轮都变），已在 .gitignore 里排除；
      云端没有缓存就重新 OCR 一遍，只是慢一点，不影响正确性。 */
  'verify-ticket.mjs',
  /* 【文章参考】抓取脚本（本机每小时 :16 跑一次，跟着文章那一班）。
      ⚠️ 必须同步：云端 daily-update.mjs 的【3.7】那一步会跑
      build-articles.mjs 重新抓文章（放在生成网页之前）。
      以前没同步 → 云端仓库里是旧版（只抓 /spe 的标题，没有正文），
      于是每天 2 点那一班会把本机刚同步上去的、带正文的
      articles-data.js 冲成「只有标题、页面上点开没有正文」的旧结构，
      而且生成出来的分享页里 25 篇文章的正文全丢。
      这一版同步的是新版（列表 + 正文），云端跑出来的和本机一致。 */
  'build-articles.mjs',
  /* 【热力图】云端 18:00 那一班要自己跑这个脚本抓当日晒票 ——
     不同步过去的话，云端就只能用本地传上去的那份数据。 */
  'build-heatmap.mjs',
  /* 【热力图 · OCR】票面照片识别模块，build-heatmap.mjs 会 import 它。
     它自己只需要 tesseract.js / jpeg-js / pngjs 三个纯 JS 包 ——
     这些包和语言数据【不受版本管理】，所以从本机 runtime/ocr/ 一起传上去
     （见下面 OCR_RUNTIME）。云端不装 tesseract、不联网下模型也能跑。 */
  'ocr-tickets.mjs',
  'export-static.mjs', 'export-football.mjs', 'export-site.mjs',
  /* 【走势图】用户 2026-10-17 新增的第三个独立子页（和彩票页/竞彩页并列）。
     ⚠️ 三个文件必须一起同步，缺一个云端就出不了这一页：
        · build-trend.mjs  生成脚本（读 history.js → 写 走势图.html）
        · trend-render.js  渲染内核（build-trend.mjs 用 readFileSync 内嵌进页面）
        · trend-mount.js   挂载 + 彩种切换（同样被内嵌）
     它们只读本机同步上去的 history.js，不抓网络、不调 AI → 云端零成本可跑。 */
  'build-trend.mjs', 'trend-render.js', 'trend-mount.js',
  /* 【出号 / 出页面 · 备用入口】roll-and-export.mjs 与 export-only.mjs。
     ⚠️ 先说清楚一件事，免得以后有人以为云端少了这两个就不会出号：
        云端【不靠】这两个脚本出号 —— cloud-build.mjs 自己是把
        games.js / ticket-store.js / stats.js / templates.js … 全部塞进一个
        vm 沙箱，直接调 ctx.__roll() 摇号（纯 JS 算法，不碰任何接口），
        再自己写 saved-tickets.js、自己调 export-static / export-football 出页面。
        为什么不用 roll-and-export.mjs：它跑完还会去调 cloud/sync-cloud.mjs
        （云端没有 token，必然失败）和 export-site.mjs（生成要手动上传的分享包），
        而且它一进来就重摇号码 —— 云端只需要「缺才补」，不能重摇已发布的号。
     那为什么还要同步这两个文件：
        ① 让云端仓库里的代码和本机【完全一致】，以后要手工补跑/排查时有据可依；
        ② 它们的依赖（./export-cloud-tickets.mjs、export-static/football/site）
           全都在云端，需要时能直接 node roll-and-export.mjs 跑起来。 */
  'roll-and-export.mjs', 'export-only.mjs',
  /* 【竞彩在售场次】抓体彩官网在售场次的脚本（1 次请求，不调 AI）。
      云端【每 30 分钟那一班】也会跑它；体彩官网对美国 IP 返回 567 时，
      脚本自己保留上一次的 jc-official.js（退出码 10），页面退回兜底算法。 */
  'build-jc-count.mjs',
  /* 【72 小时缓存清理】云端全量班（北京 02:00）会跑它。
      注意：cloud/scripts/ 里的临时/缓存/退避文件已经写进仓库根的 .gitignore，
      清理掉它们不会被提交回仓库，也不会影响同步。 */
  'cleanup-cache.mjs',
  /* 【实时比分 · 每 5 分钟那一班】云端用 --cloud-light 跑它：
      1 个请求；没有进行中的比赛就立刻退出；只改 football.js 的比分/时间字段。
      ⚠️ 必须与项目根目录保持同一版本（本机的「足球比分-每5分钟」计划任务也在用）。 */
  'update-football-live.mjs',
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

/* 【网页产物：现在【不再】往云端传】
   ------------------------------------------------------------
   以前这里会同步 只读分享版.html（1.27 MB）和 足球推荐.html（52 KB），
   想法是「万一云端那次生成网页失败，就拿仓库里这一份顶上」。
   实测下来代价太大、收益接近零：
     · 本机每 30 分钟就重新生成一次 只读分享版.html，
       每次同步（本机一天要同步几十次）都会往仓库塞一个 1.27 MB 的新版本；
       「每 30 分钟一班」上线后，云端自己也会每跑一班就提交一次 ——
       仓库会以每天几十 MB 的速度膨胀。
     · 而它本来想兜的那个场景，现在有更好的兜底：
       cloud-build.mjs 只发布【本次真的重新生成过】的页面
       （看文件修改时间是否落在本次运行开始之后），
       没生成就不发布，workflow 会从【线上当前那一份】拉回来 ——
       拿到的永远是「正在对外服务的最新页面」，而不是仓库里的旧快照。
   所以：不再同步这两个 HTML，云端仓库里也不保留它们。
   （页面本身由云端的 export-static.mjs / export-football.mjs 现场生成。） */
const PAGE_ARTIFACTS = [];

/* 【绝不入库 / 绝不上传的构建产物】
   cloud-build.mjs 会在云端现场把它们生成出来，提交回仓库只会让仓库膨胀。 */
const SKIP_REPO_PATHS = new Set([
  'cloud/scripts/只读分享版.html',
  'cloud/scripts/足球推荐.html',
  'cloud/out/index.html',
  'cloud/out/football.html'
]);

/* 仓库根目录的杂项文件。
   【.gitignore 为什么必须上传】云端每次跑完都会 `git add -A cloud/` 再提交回仓库 ——
   以前 cloud/out/index.html（1.27 MB）也在这个范围里，等于每跑一班就往仓库里
   塞一个 1.27 MB 的网页；改成「每 30 分钟一班」之后一天 48 次，仓库会迅速膨胀。
   现在用 .gitignore 把这两个大页面挡在版本管理之外（部署用的是运行时的 site/ 目录，
   完全不受影响；万一某次构建没产出页面，workflow 会从线上把当前那份拉回来兜底）。 */
const REPO_ROOT_FILES = ['.gitignore', '.github/workflows/daily-update.yml'];

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
      if (SKIP_REPO_PATHS.has(prefix + name)) continue;
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

/* 仓库根目录的 .gitignore（把 cloud/out 的两个大页面挡在版本管理之外） */
REPO_ROOT_FILES.forEach((rel) => {
  const src = path.join(PARENT, rel);
  if (!fs.existsSync(src)) { log(`  ⚠️ 缺少 ${rel}，本次不会上传`); return; }
  if (files.some((f) => f.repo === rel)) return;   /* 上面已经加过 workflow */
  files.push({ local: src, repo: rel });
  log(`  📤 ${rel} 已加入上传列表`);
});

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
  log('  ✅ 清单中包含仓库根 .gitignore（挡住 cloud/out 的大页面）：' +
    (files.some((f) => f.repo === '.gitignore') ? '是' : '否'));
  log('  ✅ 清单中包含竞彩页「晒票」要读的数据 cloud/scripts/xysp-jc-data.js：' +
    (files.some((f) => f.repo === 'cloud/scripts/xysp-jc-data.js') ? '是' : '否 ❌'));
  log('  ✅ 清单中包含云端要跑的算法/抓取脚本：');
  ['algo.js', 'stats.js', 'templates.js', 'ticket-store.js', 'render.js', 'hit-check.js',
   'data-store.js', 'games.js', 'draw-data.js', 'draw-sources.mjs', 'latest-draws.js',
   'build-articles.mjs', 'build-xysp.mjs', 'build-xysp-tt.mjs', 'build-kjh.mjs', 'build-jc-count.mjs',
   'cleanup-cache.mjs', 'update-football-live.mjs', 'build-heatmap.mjs', 'ocr-tickets.mjs',
   'experts-data.js', 'expert-pool.js', 'export-static.mjs', 'export-football.mjs'
  ].forEach((n) => {
    const hit = files.some((f) => f.repo === 'cloud/scripts/' + n);
    log(`      ${hit ? '✅' : '❌'} cloud/scripts/${n}`);
  });
  log('  ✅ 本机 App 专属文件绝不上云（红线）：');
  ['ai-config.js', 'ai-analyze.js', 'assistant-client.js', 'export-image.js',
   'main.js', 'preload.js', 'sync-client.js', 'ai-server.mjs'
  ].forEach((n) => {
    const hit = files.some((f) => f.repo === 'cloud/scripts/' + n || f.repo === 'cloud/' + n);
    log(`      ${hit ? '❌ 竟然在清单里！' : '✅ 不在'} ${n}`);
  });
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
