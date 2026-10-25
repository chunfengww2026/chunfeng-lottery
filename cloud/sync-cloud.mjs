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
/* 【dispatch 节流】用来问一句「是哪个脚本调的我」（只为了让 .sync-last-dispatch.json
   里的 lastDispatchReason 有意义；查不到也照样同步，见 detectReason()）。 */
import { execFileSync } from 'node:child_process';
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
  'fetch-community-topics.mjs', 'community-topics.json',
  'saved-tickets.js', 'history.js', 'draws.js', 'football.js',
  /* 【🐸 青蛙家园 · 核心算法 20 码 · 2026-10-20 修线上事故】
     export-static.mjs 的 frogPanelHtml() 用 createRequire(import.meta.url)
     require('./core-pool.js') 拿号码池；core-pool.js 自己再
     require('./core-algo.js') + 读同目录的 history.js。
     ⚠️ 以前这两个文件【没在本名单里】→ cloud/scripts/ 里根本没有它们 →
        require 抛 MODULE_NOT_FOUND → 号码池空、免费资料也空 →
        线上青蛙家园显示「数据整理中，稍后自动出现」×2 +「暂无资料」
        （本机有这两个文件所以正常，只有云端出问题；2026-10-20 实测复现）。
     ⚠️ 少任何一个都不行：core-pool 依赖 core-algo，两个必须一起上云。
     ⚠️ 它们只在【构建时】被 require，页面运行时不读 → 不用发布到站点目录。 */
  'core-pool.js', 'core-algo.js', 'user-method-results.cjs',
  /* 【每期换号硬校验 · 2026-10-21】pick-guard.js
     export-static.mjs 现在用 createRequire(import.meta.url) require 它
     （青蛙 20 码 / 双色球蓝球 / 智能精选的「和上一期至少改几个号，不够就加盐重摇」）。
     ⚠️ 必须同步：漏了它 → 云端 export-static.mjs 构建时直接抛 MODULE_NOT_FOUND
        → 整页生成失败（和 2026-10-20 那次 core-pool 事故同一类）。
     ⚠️ 只在【构建时】被 require，页面运行时不读 → 不用发布到站点目录。 */
  'pick-guard.js',
  /* 【真实推荐号存档 · 2026-10-20】reco-archive.json 是 export-static.mjs 构建时
     自己写出来的存档（每期第一次构建把「本期推荐号码」原样存进去，之后不再改）。
     「中奖」卡只认这份存档 + 真实开奖号 —— 【不再按期号回算】，
     用户明确说过：「为什么还有九月份的？我都没推荐过」。
     ⚠️ 必须同步：云端那一班 export-static.mjs 要读它才能算出中奖记录；
        少了它云端生成出来的页面就是「近 365 天暂无中奖记录」，会把本机刚记的冲掉。
     ⚠️ 它是【数据】不是代码：云端只是照着本机的存档重算，权威存档在本机根目录
        （云端构建产物不落盘，别指望云端那份能留下来）。
     ⚠️ 文件很小（每期只存 8 个彩种各一组号，约 2.5 KB/期），一年也就几百 KB；
        超过 365 天的记录由构建自己物理删除，不会无限变大。 */
  'reco-archive.json',
  /* 【🔥 人气数字 · 构建时写死的那个数】busuanzi.json（2026-10-20 加）
     用户：「卜蒜子能不能永远都呈现 就算我电脑关机了」→ 构建时把数字写进页面。
     · 结构：{ uv, pv, updated, source, cookie }（uv = 不蒜子的站点独立访客）
     · 谁写它：fetch-busuanzi.mjs（云端每班跑一次，抓不到就保留旧值不覆盖）
     · 谁读它：export-static.mjs 构建时把 uv 直接写进页面里那个 span
     ⚠️ 必须同步：本机这份是【最新的一份兜底】——
        云端第一次跑、或者哪天 busuanzi 抓不到时，读的就是它。
        不同步的话云端从零开始 → 第一班取不到数就只能显示「--」。
     ⚠️ 里面的 cookie 字段是不蒜子的 busuanziId（不是密钥，不涉及任何账号）：
        带它去请求，不蒜子才认「同一个访客」，不会把我们的构建请求
        算成新访客（否则一天白涨 144 UV = 编数字）。
     ⚠️ 文件很小（约 250 B），每班变了才提交，不会撑仓库。 */
  'busuanzi.json',
  'jc-data.js', 'prize-data.js', 'materials-data.js',
  /* 【九算法独立页 · 用户 2026-10-19】凌晨 2 点全量班自动发布到线上 */
  'px9-methods.html',
  'minjian-methods.html',
  'core-jiajian.html',
  /* 【专家推荐数据】用户 2026-10-19「所有资料去远端」：
     jc-articles.js 是 build-jc-articles.mjs 的产出，页面构建时要读它（没有就整块不渲染）。
     jc-scores.js 是 500 完场比分表（回填红黑用），先一起同步上去。 */
  'jc-articles.js', 'jc-scores.js',
  /* 【已完场赛果 · 终场比分】jc-results.js 是 build-football-results.mjs 的产出
     （最近 48 小时完场，每场 date/time/league/home/away/ft 终场/ht 半场/fid）。
     ⚠️ 必须同步，两个云端步骤直接读它：
        ① build-football-results.mjs 自己（读旧数据兜底，抓不到时绝不写空）
        ② export-football.mjs 用 loadVar('jc-results.js','JC_RESULTS') 取
           「已完场」那一行的终场比分（比分优先级：football.js 实时 > jc-data > 这里）
        没有它 → 云端竞彩页的已完场比分退回「—」，红黑也算不出来。
     ⚠️【不发布到线上】：页面是构建时内嵌的，线上站点目录里没有也不需要这个文件
        → sync-cloud / cloud-build 的 out/ / workflow 的 site/ 三处里只需要这一处。 */
  'jc-results.js',
  /* 【竞彩已完场】累积归档。在售列表只含还能买的比赛，一开完就从
     jc-data.js 里消失 —— 已完场的累积记录全靠这个文件，不传上去
     云端重新生成竞彩页时「已完场」又会变回 0 场。 */
  'jc-history.js',
  /* 【推荐串存档 · 数据】jc-reco-data.js 是 jc-reco-build.mjs 的【产物】，
      同时也是竞彩页要读的数据。同步过去当兜底：万一云端那一班
      jc-reco-build.mjs 失败了，页面上仍然有本机刚算好的红黑统计，
      不会被冲成"暂无已结算"。
      ⚠️【代码和数据是两个文件，别合并】：jc-reco-archive.js 是计算内核
         （代码，见下面 CODE_MODULES），jc-reco-data.js 才是这份存档数据。
         第一版把两者挤在同一个文件名上 → 云端 require 到的成了数据 →
         直接报 "R.bjStamp is not a function"，排查了好久。 */
  'jc-reco-data.js',
  /* 【播报 · 中奖命中】build-broadcast.mjs 的产物：拿我们自己算的号池
     （experts-data.js 的 games.<彩种>.pool）去比开奖号，严格的包住判定，
     近 7 天窗口。export-football.mjs 构建时读它，把「命中一等奖/二等奖」
     接进播报条。必须同步：否则云端构建时这个文件不存在，播报就退回只有战绩数字。 */
  'broadcast.json',
  /* 新浪「下一期参考」（build-sina-predict.mjs 产出，抓不到就不存在） */
  'sina-predict.json',
  /* 【PWA 安装（一键桌面）】用户 2026-10-17：页面上要能"添加到桌面"。
     这五个文件原来【不在白名单里】→ 线上 manifest/图标全 404 →
     浏览器判定"不可安装"，beforeinstallprompt 永远不触发（按钮点了没反应）。
     现在补齐：
       · manifest.json          PWA 清单（用户指定的文件名/内容；icons 用相对路径）
       · manifest.webmanifest   同一份清单的旧文件名（老缓存里还有引用它的页面，
                                留着不删，避免线上 404）
       · icon-192.png / icon-512.png  清单里引用的两个图标（缺一个都不算可安装）
       · service-worker.js      纯透传、不缓存的 SW —— 只满足"可安装"条件，
                                绝不做 cache-first（否则 30 秒实时刷新会被冻住） */
  'manifest.json',
  'manifest.webmanifest',
  'icon-192.png',
  /* 构建实际是从 cloud/scripts/icons/ 拷图标（cloud-build.mjs 的 ICON_FILES）——
     只加根目录那几个的话，新图标传上去了也用不上（踩过两次）。 */
  'cloud/scripts/icons/icon-192.png',
  'cloud/scripts/icons/icon-512.png',
  'cloud/scripts/icons/apple-touch-icon.png',
  'cloud/scripts/icons/share.png',
  'icon-512.png',
  'service-worker.js',
  /* 【祝福视频】用户 2026-10-18：分享页聊天框顶部的那个祝福视频（blessing.mp4，
     2.82 MB，源文件是「火山方舟.mp4」，改成英文名避免 URL 编码麻烦）。
     页面里写的是 <video src="./blessing.mp4" preload="none"> —— 懒加载，
     不进首屏；但【文件必须发布】：不在 FROM_ROOT 里，cloud/scripts/ 就没有它，
     workflow 也就拷不进 site/ → 线上 404 → 聊天框里只剩「点击播放视频」占位
     （点一下倒是能出 TTS 语音 + 黄色气泡，但视频永远播不了）。
     同步路径：本机根目录 → cloud/scripts/blessing.mp4 → (workflow) site/blessing.mp4。 */
  'blessing.mp4',
  /* 【安装教程大图】用户 2026-10-18 21:50 确认要这张图：分享页「添加到手机桌面」区块顶部
     那张 install-guide.jpg（800×1432 / 约 204 KB JPEG，源图是桌面上 1520×2720 / 3.5 MB
     的那张「网页安装到手机桌面教程.jpeg」，已用 Pillow 压过）。
     页面里写的是 <img class="ro-install-shot" src="./install-guide.jpg" loading="lazy">。
     同步路径：本机根目录 → cloud/scripts/install-guide.jpg →（workflow）site/install-guide.jpg。
     ⚠️ 不在 FROM_ROOT 里，云端构建就没有这个文件，workflow 也拷不进 site/ → 线上 404
        → 区块里只剩两列卡片，图位空白（lazy 加载失败被收起）。 */
  'install-guide.jpg',
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
  /* 【名家图库 · 数据】本地抓好的图库数据，作为云端抓取失败时的兜底 */
  'mingjia-data.js',
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
  'xysp-jc-data.js',
  /* 【足球晒票 · 票面照片】竞彩实票的票面实拍图（fetch-football-tickets.mjs
      每 30 分钟在本机抓一次，只留最新 60 条；图片全是外链、不下载本体）。
      ⚠️【必须同步，而且这一路云端是【抓不到】的】：
          实测云端（美国 IP）访问这个源是 HTTP 405（阿里云 WAF 拦截），
          所以线上那份只能靠这里同步过去 —— 云端的 export-football.mjs
          直接 loadVar('football-tickets.js') 读它渲染「晒票」区块。
          少了它，云端这一班生成出来的竞彩页「晒票」区块就退回只剩头条那 1 条，
          等于把本机刚抓到的 30 条票面冲掉。
      注：它只被【构建时】读，线上站点目录里不需要这个文件。 */
  'football-tickets.js',
  /* 【分歧指 · 数据】多公司欧赔离散度（build-odds-divergence.mjs 抓球探 titan007 生成）。
     ⚠️ 必须同步：云端的 比赛详情.html 是 cloud-build.mjs 现场跑 build-match.mjs 出的，
         build-match.mjs 读它把分歧指内嵌进页面。云端少了这个文件 →
         那一班分歧指只能显示「暂无多家赔率数据」（页面本身不坏，是静默降级）。
     ⚠️【它不需要发布到线上】：详情页是【自包含】的，构建时就把数据内嵌进 HTML了 ——
         和 jc-data.js 一样，线上站点目录里【没有】也不需要这个文件，
         所以 sync-cloud / cloud-build 的 out/ / workflow 的 site/ 【三处里只需要这一处】。
         云端自己每次足球班次也会重抓一遍（脚本自带 20 分钟 min-gap）；
         这里同步过去是【兜底】：云端抓不到时，页面仍有本机刚算好的那一份。 */
  'jc-divergence.js',
  /* 【欧赔对比 · 数据】主流 12 家的 初盘/即时/返还率/凯利 明细
     （同一趟抓取由 build-odds-divergence.mjs 写出来的第二份文件 jc-titan.js）。
     ⚠️ 必须同步，理由和 jc-divergence.js 一模一样：详情页「欧赔对比」那一档是
        构建时内嵌的，云端少了它就退回「暂无」。
     ⚠️ 同样【不发布到线上】：页面自包含，线上站点目录里没有也不需要这个文件 →
        sync-cloud / cloud-build 的 out/ / workflow 的 site/ 三处里【只需要这一处】。
     ⚠️ 体积：只存主流 12 家（该场 320~370 家全存要 11 MB），64 场约 200 KB。 */
  'jc-titan.js',
  /* 【雷达寻胆 · 成交资金面】jc-bifa.js（fetch-bifa.mjs 生成）。
     每场三项的成交量/占比/成交价 + 挂单量 + 大小球，详情页「雷达寻胆」用。
     ⚠️ 必须同步，理由同上：详情页是【构建时内嵌】的，云端少了它就只剩
        欧赔+盘口+凯利三个维度（不是错，是静默降一档，所以放进来兜底）。
     ⚠️ 同样【不发布到线上】：页面自包含，线上站点目录里没有也不需要它。
     ⚠️ 体积很小：只存数字，64 场约 10~60 KB（每场只留前 5 笔大宗）。
     ⚠️【关键】只有临近开赛的比赛才有这一份数据：成交额是赛前才累积起来的，
        距开赛太远、或打完很久之后接口返回空数组。云端自己每次足球班次也会
        现场跑 fetch-bifa.mjs 重抓一遍；这里同步过去是【兜底】。 */
  'jc-bifa.js',
  /* 【联赛积分榜 · 真实积分】jc-standings.js（fetch-standings.mjs 生成）。
     每场球队的【本季积分】靠它算，详情页「综合模型」那一档的埃罗要用。
     ⚠️ 必须同步：云端 比赛详情.html 是 cloud-build.mjs 现场跑 build-match.mjs 出的，
         少了这个文件 → 埃罗退回「名次折算」（页面照旧能开，是静默降一档，
         所以放进来兜底）。
     ⚠️【不需要发布到线上】：详情页自包含，构建时已把名次/积分内嵌进 HTML →
         sync-cloud / cloud-build 的 out/ / workflow 的 site/ 三处里【只需要这一处】。
     ⚠️ 体积很小：15 个联赛 × 18~30 队，只有名次/积分/场次/胜平负/进球，约 11 KB。
     云端那一班也会现场跑 fetch-standings.mjs 重抓一遍；这里同步过去是兜底。 */
  'jc-standings.js',
  
  /* 【留痕断言模块】3 个生成脚本（export-static / export-football / build-trend）
     import 它做"不许出现数据来源字样"的硬校验。
     ⚠️ 2026-10-17 起走势图不再自己写文件：build-trend.mjs 只出片段，
        断言由 export-static.mjs 在写分享页【之前】对整页跑一次（同一个模块）。
     ⚠️【必须同步】：少了它云端构建会 ERR_MODULE_NOT_FOUND → 整班挂掉。 */
  'source-guard.mjs',
  /* 【设备门 + PWA 共用模块】export-static / export-football / build-match
     三个生成脚本都 import 它（只拦手机看的设备门 + manifest 链接 + 一键桌面）。
     ⚠️【必须同步】：少了它云端构建 ERR_MODULE_NOT_FOUND → 整班挂掉。 */
  'device-gate.mjs',
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
  /* 【已完场赛果 · 抓取脚本】build-football-results.mjs（2026-10-18 加）
     抓 live.500.com/wanchang.php 的完场比分 → 写 jc-results.js，
     并按终场比分【纠正】jc-history.js 里「归档那刻球还没踢完」冻住的错比分。
     ⚠️ 必须同步：cloud-build.mjs 的【3b】那一步就是 run('build-football-results.mjs')，
         而且排在 jc-reco-build.mjs / export-football.mjs 【之前】——
         少了这个脚本，云端 3b 那一步会走 existsSync 的跳过分支（不报错），
         于是 jc-history 的错比分永远不被纠正 → 推荐串红黑继续算错。
     依赖：jc-archive.mjs 的 sameTeam / dayOf（那个文件已在上面 CODE_MODULES 里）。 */
  'build-football-results.mjs',
  /* 【专家推荐 20 篇 · 用户 2026-10-19「所有资料去远端/云端」】
     这个脚本原来没进名单 ✗ → 云端没有它 → 既跑不了文章抓取，
     也会让 cloud-build.mjs 里那句 run('build-jc-articles.mjs') 直接失败。
     产出 jc-articles.js 也一起同步，页面构建时才有数据可渲染。 */
  'build-jc-articles.mjs', 'build-jc-scores.mjs',
  /* 【名家图库】2026-10-21：build-mingjia.mjs 抓名家图（写 imgs/mingjia/ + mingjia-data.js）。
     漏掉它 → 云端一直跑旧版（实测本地 10824B / 云端 7853B）。 */
  'build-mingjia.mjs',
  'fetch-mingjia-toutiao.mjs',
  'mingjia-toutiao.json',
  'fetch-mingjia-web.mjs',
  'mingjia-web.json',
  /* 【开机号 / 选号直播】抓取脚本（每天 2 点本机跑，跟着 daily-update.mjs）。
      云端【每 30 分钟那一班】也会跑它（一起彩云端实测 200）。 */
  'build-kjh.mjs',
  /* 事先抓取总调度（cloud-build 全量班先跑它，把 18 项抓取一次性抓完） */
  'prefetch-all.mjs',
  /* 新浪「下一期参考」抓取脚本（之前只同步了 sina-predict.json，脚本漏了） */
  'build-sina-predict.mjs',
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
  /* 【足球晒票 · 票面照片】抓取脚本（本机每 30 分钟跑一次，
      跟着 update-football-smart.mjs 的 0.5 步；产物 football-tickets.js）。
      ⚠️ 同步它只是为了【云端那个「尽力而为」的抓取步骤有脚本可跑】——
         实测云端访问源站是 405（阿里云 WAF），这一步在云端【永远抓不到】，
         真正的数据靠本机同步过去的 football-tickets.js。
         哪天 WAF 放开了，云端这个步骤会自动开始出数据，不用再改代码。 */
  'fetch-football-tickets.mjs',
  /* 【票图校验】OCR 判"图里到底有没有票"（用户要求「整票百分百」）。
      ⚠️ 必须同步：build-xysp-tt.mjs 里 `import ... from './verify-ticket.mjs'`，
      云端 scripts/ 里没有它 → ERR_MODULE_NOT_FOUND → 整个头条晒票分类挂掉。
      ⚠️ 它的【缓存文件】_ticket-ocr-cache.json 不在这里 ——
      那个是本机运行态数据（几百 KB、每轮都变），已在 .gitignore 里排除；
      云端没有缓存就重新 OCR 一遍，只是慢一点，不影响正确性。 */
  'verify-ticket.mjs',
  '_ticket-ocr-cache.json',
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
  'jc-market-rules.js', 'status-video.js', 'visitor-counter.js', 'monster-game.js', 'boarding-game.js', 'export-static.mjs', 'export-football.mjs', 'export-site.mjs',
  /* 【🔥 人气数字 · 抓取脚本】fetch-busuanzi.mjs（2026-10-20 加）
     用户：「卜蒜子能不能永远都呈现 就算我电脑关机了」
     ⚠️ 必须同步：cloud-build.mjs 每班在【生成彩票页之前】跑它一次，
        现场取不蒜子的 site_uv 写进 busuanzi.json，紧接着 export-static.mjs
        把这个数【写死进页面】→ 不蒜子被墙/挂了页面也永远有数。
     ⚠️ 它抓不到就【不覆盖旧文件】、退出码永远 0 → 绝不会拖垮整条构建链。
     只读一个 API、只写 busuanzi.json，不碰任何其它文件。 */
  'fetch-busuanzi.mjs',
  /* 【比赛详情页】用户 2026-10-17 第 1 步：竞彩页每张比赛卡片点进去看这场的数据。
     · build-match.mjs  生成脚本（读 jc-data.js + jc-official.js → 写 比赛详情.html）
     ⚠️ 必须同步：cloud-build.mjs 的 exportList 里会跑它，
        云端少了这个文件 → 云端出不了详情页 → 竞彩页 64 张卡片全点到 404。
     （这个页面【自包含】：它把 games 数组在构建时内嵌进 HTML。
       线上站点目录里没有 jc-data.js —— export-football.mjs 也是同样的自包含做法。） */
  'build-match.mjs',
  /* 【分歧指 · 抓取脚本】用户 2026-10-17 第 2 步。
     ⚠️ 必须同步：cloud-build.mjs 的 exportList 里排在 build-match.mjs 【之前】跑它，
        现场抓球探 titan007 的多公司欧赔（1x2d.titan007.com/{ScheduleID}.js），
        算好离散度写 jc-divergence.js，再由 build-match.mjs 内嵌进详情页。
        云端少了这个文件 → 云端出不了分歧指数据 → 详情页那一档退回「暂无」
        （实测云端能访问 titan007：200 · 183 KB · 325 家，所以云端自己抓是可行的）。
     它只读 jc-data.js / jc-history.js（决定要抓哪几场），只写 jc-divergence.js。 */
  'build-odds-divergence.mjs',
  /* 【雷达寻胆 · 抓取脚本】用户 2026-10-17 第 4 步。
     ⚠️ 必须同步：cloud-build.mjs 的 exportList 里排在 build-match.mjs 【之前】跑它，
        现场取当天的比分行、按队名把我们的场次对上号，再问那场有没有成交资金数据，
        写 jc-bifa.js，由 build-match.mjs 内嵌进详情页「雷达寻胆」那一档。
     ⚠️ 云端能访问（实测 200）；拿不到就【不覆盖旧文件】、这一档降一档，不会让构建挂掉。
     它只读 jc-data.js / jc-history.js（决定要问哪几场），只写 jc-bifa.js。 */
  'fetch-bifa.mjs',
  /* 【联赛积分榜 · 抓取脚本】2026-10-18 第 6 步加的。
     ⚠️ 必须同步：云端每一班足球场次可以自己重抓一遍当前积分榜，
         写 jc-standings.js，再由 build-match.mjs 内嵌进详情页 → 埃罗用真实积分。
     它只读 jc-data.js（决定要抓哪几个联赛），只写 jc-standings.js。
     ⚠️ 一个联赛都没抓到 → 它【不覆盖旧文件、exit 0 只记一行日志】（旧数据照旧被读走），
        页面退回名次折算，整班不会挂。 */
  'fetch-standings.mjs',
  /* 【走势图】2026-10-17 起它【不再是独立子页】——
     用户要求「留在近30期走势预选参考里面. 删除单独走势图独立页」：
     走势图改成 export-static.mjs import build-trend.mjs 拿一个 HTML 片段，
     内联进分享页的 <details class="ro-trend">（近 30 期走势 · 预选参考）里。
     ⚠️ 三个文件仍然必须一起同步，缺一个云端就出不了这一块：
        · build-trend.mjs  片段生成器（读 history.js → 出片段，export-static import 它）
        · trend-render.js  渲染内核（build-trend.mjs 用 readFileSync 内嵌进片段）
        · trend-mount.js   挂载 + 彩种切换（同样被内嵌）
     ⚠️ 少了 build-trend.mjs 不是"少一块"，是 export-static.mjs
        ERR_MODULE_NOT_FOUND →【整个分享页构建失败】（和 p3d-section 同一类坑）。
     它们只读本机同步上去的 history.js，不抓网络、不调 AI → 云端零成本可跑。 */
  'build-trend.mjs', 'trend-render.js', 'trend-mount.js',
  /* 【3D & 排列三 手绘参考图】区块（用户 2026-10-17 规格）。
      必须同步：export-static.mjs 现在 import 了 p3d-section.mjs、
      require 了 p3d-analyzer.js。云端重新生成分享页时少了任一个，
      node 会直接 Cannot find module → 整个分享页构建失败
      （不只是少一块，是整页生成挂掉）。 */
  'p3d-section.mjs',
  'p3d-analyzer.js',
  /* 【泊松指数内核】jc-poisson.js（2026-10-17 加）。
     必须同步：export-football.mjs 用 loadVar('jc-poisson.js') 读它。
     ⚠️ loadVar 是【防御式】的 —— 文件缺失只返回 null、不报错，
        结果是云端构建成功但【泊松块整块不渲染】（线上实测 0/64，本机 64/64）。
        所以这类"新加的被读取文件"一定要记得进 CODE_MODULES，
        否则症状是"静默少一块"，比 Cannot find module 更难查。 */
  'jc-poisson.js',
  /* 【彩种规则 · 唯一真源】lottery-rules.mjs —— 号码区范围/每区个数/位型 只写一处。
     ⚠️ 必须同步：build-trend.mjs 与 ocr-tickets.mjs 都 import 它，
        云端少这一个文件 → ERR_MODULE_NOT_FOUND → 走势图页 + OCR 认票整块挂掉。
     ⚠️ 它是 ESM（.mjs）。云端的 cloud-build.mjs / daily-update.mjs 都是 ESM，
        能直接 import；不需要它变成浏览器全局。 */
  'lottery-rules.mjs',
  /* 【推荐串存档】用户 2026-10-17 第④项（前后 24 小时 + 红黑 + 存档比对）：
       · jc-reco-archive.js  纯计算内核（Node 侧 require、页面侧 vm 读，双模式）
       · jc-reco-build.mjs   构建脚本：存这一期 + 回填红黑 → 写 jc-reco-data.js
     ⚠️【内核必须同步】：云端 cloud-build.mjs 会跑 jc-reco-build.mjs，
        而它 require jc-reco-archive.js —— 少了内核这一步直接失败，
        竞彩页就退回"推荐串 0 / 0% / 暂未开始统计"的旧样子（实测踩过：
        第一版同名混用把内核换成了数据，线上就一直没生效）。
     ⚠️ 存档【数据】是另一个文件 jc-reco-data.js，在下面 FROM_ROOT 里同步。 */
  'jc-reco-archive.js', 'jc-reco-build.mjs', 'jc-reco-view.js',   /* __RECO_VIEW_SYNC__ 页面侧 30 秒刷新脚本（漏同步会让线上 404、刷新静默失效） */
  /* 【推荐串统计 JSON 的生成器】jc-reco-build.mjs 会动态 import 它来写
     jc-reco-stats.json（单场口径）。以前清单里没有这个文件 → 云端永远生成不出
     那个 JSON，cloud-build 每班都留一条"文件缺失"警告（页面不读它，只是噪音）。
     用户 2026-10-17 同意补进清单 → 从此云端也能生成，警告消失。 */
  'jc-reco-stats.mjs',
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
  /* 【必须同步】daily-update.mjs —— 云端「常规班」的主脚本：
       workflow → cloud-build.mjs → 跑 cloud/scripts/daily-update.mjs。
     ⚠️ 它以前【不在白名单里】→ 本机怎么改都上不去云，云端一直跑旧版：
        实测根目录 10-16 版 21133 B、cloud/scripts 里还是 10-15 版 19127 B（差 2006 字节），
        也就是说后来往它里面加的步骤，云端一个都没执行过。
     ⚠️ 规矩：凡是「云端会执行的脚本」都必须在这里列出来 —— 漏一个就是静默跑旧代码，
        不报错，只有页面/数据表现不一致，极难发现。 */
  'daily-update.mjs',
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
/* ===== IMG_WALK · 图片上云（用户 2026-10-21「今天做」）=====
   递归扫 imgs/ 目录，把每个图片文件加进上传清单 ✔ */
function walkImgs(dir, out) {
  try {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, name.name);
      if (name.isDirectory()) walkImgs(p, out);
      else if (/\.(jpg|jpeg|png|webp|gif)$/i.test(name.name)) {
        out.push(path.relative(ROOT, p).replace(/\\/g, '/'));
      }
    }
  } catch (e) { }
}
const IMG_FILES = [];
walkImgs(path.join(ROOT, '..', 'imgs'), IMG_FILES);   /* ROOT 是 cloud/ ✗ 图在上一级 ✔ */
if (IMG_FILES.length) console.log('  · 图片文件 ' + IMG_FILES.length + ' 张（imgs/ ✗）');
for (const f of [...FROM_ROOT, ...CODE_MODULES, ...PAGE_ARTIFACTS, ...IMG_FILES]) {
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
/* 【密钥红线 · 2026-10-19 加】这两个文件里都是本机凭据，【永不上传】：
     · cloud-token.txt  本机 GitHub Token
     · ai-config.js     明文 API Key（方舟 ark-c72b… / DeepSeek sk-726c…）
   它们本来也不可能被传上去（ai-config.js 在项目根目录，collect() 只遍历 cloud/；
   根目录文件只有 REPO_ROOT_FILES 里那两个会传），这里再钉一遍是防止以后
   有人把它挪进 cloud/ 或直接加进白名单 → 一传上去就永久留在 git 历史里。
   另：.gitignore 里也排除了它们（双保险）。 */
const SKIP_FILES = new Set(['cloud-token.txt', 'ai-config.js']);

/* 【编辑器/脚本备份文件：一律不上传】
   ------------------------------------------------------------
   实测踩到过：改 sync-cloud.mjs 时留的 sync-cloud.mjs.bak-p3d
   被 collect() 当成正常文件传到了云端仓库，白白多一个垃圾文件。
   根因是 SKIP_FILES 只匹配【精确文件名】，没有通配能力。
   这里加模式过滤，挡住常见的备份/临时形态。
   ⚠️ 只挡 .bak / .orig / ~ 结尾 / .tmp / .swp 这类明确的编辑器产物；
      不挡 .log（_jc-count.log 是云端要读的计数日志，必须继续传）。 */
const SKIP_NAME_RE = /\.(bak|orig|tmp|swp)([.-].*)?$|~$/i;

/* 【本机专用文件：永不上云】
   ------------------------------------------------------------
   1) cloud-pull.js —— App 三页（index/game/data.html）引用的「云同步面板」，
      云端从头到尾不执行它（cloud-build.mjs 里只有一句注释提到"本机程序 cloud-pull.js 下载它"）。
      以前它被传到 cloud/scripts/ 只是个历史遗留副本，删掉不影响任何功能。
   2) _realtest_*.mjs / _verify_*.mjs —— 本机验收/审计脚本，
      核查过：cloud-build.mjs / workflow / export-static.mjs 全都不引用它们。
   ⚠️ 【不要顺手把 _*.log / _*-backoff.json / _*cache*.json 也挡掉】
      它们是云端【要读】的状态（_jc-count.log 是计数日志、_xysp-backoff.json 是退避状态），
      挡掉 = 云端行为改变（该退避的不退避、计数丢失），这是实打实的回归。 */
const SKIP_LOCAL_ONLY_RE = /^(?:_(?:realtest|verify)_.*\.mjs|cloud-pull\.js)$/;

/* 白名单并集（自检用） */
const WL_ALL = new Set([...FROM_ROOT, ...CODE_MODULES, ...PAGE_ARTIFACTS, ...IMG_FILES]);

/* 【同步自检】云端会跑、却不在白名单里的脚本 = 本机改了也永远上不去云
   ------------------------------------------------------------
   实测踩到过：daily-update.mjs（云端「常规班」主脚本）不在 CODE_MODULES 里，
   于是云端一直跑 10-15 的旧版，本机后面加的所有步骤云端一个都没执行，
   而且【不报错】—— 只有页面表现不一致，极难发现。
   这里的判据：某个文件【在根目录和 cloud/scripts 里同时存在】，说明它就是给云端用的；
   若它又不在白名单里，那 cloud/scripts 里那份永远不会被刷新，必然越来越旧。
   ⚠️ 只警告、不中止同步：万一只是本机临时对照的文件，不该拦住整次同步。 */
function selfCheckStale() {
  const names = [];
  /* 只盯【云端可能执行的脚本】：.mjs / .js，且不是 _ 开头（_ 开头那是本机临时/验证/状态文件）。
     ⚠️ 故意不看 _*.log / _*-backoff.json / _*cache*.json：
        它们是各机器自己的运行状态（本机写 ROOT、云端写 cloud/scripts），
        两边内容不同是正常的，不该报警。 */
  const CODE_RE = /\.(mjs|js)$/;
  const IGNORE = new Set([
    'app.js',                        /* App 专用，云端不执行 */
    /* 下面三个都核查过：云端只在【注释】里提到它们，实际不执行（本机/App 自己的工具） */
    'export-cloud-tickets.mjs',      /* cloud-build.mjs:31 只是注释「和它同一份实现」 */
    'update-draws-retry.mjs',        /* 本机补抓开奖用 */
    'update-football-smart.mjs'      /* 本机智能补抓用 */
  ]);
  for (const name of fs.readdirSync(path.join(ROOT, 'scripts'))) {
    if (!CODE_RE.test(name) || name.startsWith('_') || IGNORE.has(name)) continue;
    if (SKIP_LOCAL_ONLY_RE.test(name)) continue;
    if (SKIP_FILES.has(name) || SKIP_NAME_RE.test(name)) continue;
    const rootFile = path.join(PARENT, name);        /* ⚠️ ROOT 是 cloud/，根目录是 PARENT */
    if (!fs.existsSync(rootFile) || !fs.statSync(rootFile).isFile()) continue;
    if (WL_ALL.has(name)) continue;                 /* 已在白名单 → 每次都会刷新，没问题 */
    names.push(name);
  }
  if (!names.length) return;
  log('');
  log('  ⚠️ 自检：下面这些文件【根目录有、cloud/scripts 里也有】，却不在白名单里 ——');
  log('     它们的云端副本永远不会被刷新，会一直跑旧版（本机怎么改都上不去）：');
  names.sort().forEach((n) => log('       · ' + n));
  log('     → 云端要用的，加进 CODE_MODULES；本机专用的，加进 SKIP_LOCAL_ONLY_RE。');
}

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
      /* 备份/临时文件（.bak / .orig / ~ / .tmp / .swp）不上传 —— 见上面 SKIP_NAME_RE 的说明 */
      if (SKIP_NAME_RE.test(name)) continue;
      /* 【本机专用，永不上云】见下面 SKIP_LOCAL_ONLY_RE 的说明 */
      if (SKIP_LOCAL_ONLY_RE.test(name)) continue;
      if (SKIP_REPO_PATHS.has(prefix + name)) continue;
      out.push({ local: full, repo: prefix + name });
    }
  }
  return out;
}

selfCheckStale();
/* 【日志瘦身】cloud/scripts/_*.log 每次同步都整份上传（实测 _xysp.log 1.25 MB、
   _xysp-tt.log 429 KB、_articles.log 84 KB …），而它们只被各自的抓取脚本用来判断
   「上次成功时间 / 是否该退避」——这些都只看【尾部】；
   连续失败次数存在独立的 *_backoff.json 里，不是从日志数行。
   ⇒ 只留尾部 200 行就够用，前面的旧记录没有读者。
   ⚠️ 只裁 .log。*_backoff.json 与 _ticket-ocr-cache.json 【一律不动】：
      前者是结构化退避状态、后者是 OCR 识别结果缓存，裁了会改变行为。
   ⚠️ 裁不动也不许影响同步（整个包在 try 里）。 */
function trimLogs() {
  let n = 0, saved = 0;
  try {
    const dir = path.join(ROOT, 'scripts');
    for (const name of fs.readdirSync(dir)) {
      if (!/^_.*\.log$/.test(name)) continue;
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.size < 64 * 1024) continue;                 /* 小的不值得动 */
      const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
      if (lines.length <= 200) continue;
      const kept = lines.slice(-200).join('\n') + '\n';
      fs.writeFileSync(p, kept, 'utf8');
      n++; saved += st.size - Buffer.byteLength(kept, 'utf8');
    }
  } catch (e) { /* 忽略：日志瘦身失败不能拦住同步 */ }
  if (n) log(`  🧹 日志瘦身：${n} 个 _*.log 只留尾部 200 行（本次少传 ${(saved / 1048576).toFixed(2)} MB）`);
}
trimLogs();
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

/* ===== IMG_PUSH · 把 imgs/ 下的图片推进上传列表（用户 2026-10-21 必须今天做完）===== */
try {
  const walkImg = (dir, out) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walkImg(p, out);
      else if (/\.(jpg|jpeg|png|webp|gif)$/i.test(e.name)) out.push(p);
    }
  };
  const imgRoot = path.join(PARENT, 'imgs');
  if (fs.existsSync(imgRoot)) {
    const imgs = [];
    walkImg(imgRoot, imgs);
    let added = 0;
    for (const abs of imgs) {
      const rel = path.relative(PARENT, abs).replace(/\\/g, '/');
      if (files.some((f) => f.repo === rel)) continue;
      files.push({ local: abs, repo: rel });
      added++;
    }
    log('  🖼  图片 ' + added + ' 张已加入上传列表');
  } else {
    log('  ⚠️ imgs/ 目录不存在：' + imgRoot);
  }
} catch (e) { log('  ⚠️ 扫图片失败：' + e.message); }
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
if (onlyArg) {
  const requested = new Set(onlyArg.slice('--only='.length).split(',').filter(Boolean));
  const selected = files.filter((file) => requested.has(file.repo));
  const missing = [...requested].filter((name) => !selected.some((file) => file.repo === name));
  if (missing.length) throw new Error('指定发布文件未找到：' + missing.join(', '));
  files.splice(0, files.length, ...selected);
}
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
  /* 【比赛详情页】两份构建时内嵌的数据：分歧指 + 欧赔对比（同一趟抓取的两个出口）。
     少了任一个，云端出的详情页就会有一档退回「暂无」（静默降级，所以这里明着体检）。 */
  log('  ✅ 清单中包含详情页要内嵌的两份数据 jc-divergence.js + jc-titan.js：' +
    ((files.some((f) => f.repo === 'cloud/scripts/jc-divergence.js') &&
      files.some((f) => f.repo === 'cloud/scripts/jc-titan.js')) ? '是' : '否 ❌'));
  log('  ✅ 清单中包含雷达寻胆要内嵌的成交资金面 jc-bifa.js + 抓取脚本 fetch-bifa.mjs：' +
    ((files.some((f) => f.repo === 'cloud/scripts/jc-bifa.js') &&
      files.some((f) => f.repo === 'cloud/scripts/fetch-bifa.mjs')) ? '是' : '否 ❌'));
  /* 【比赛详情页 · 真实积分】jc-standings.js（联赛积分榜）：
     少了它云端出的详情页「综合模型」那一档的埃罗会退回「名次折算」（静默降级）。 */
  log('  ✅ 清单中包含详情页埃罗要用的联赛积分榜 jc-standings.js + 抓取脚本 fetch-standings.mjs：' +
    ((files.some((f) => f.repo === 'cloud/scripts/jc-standings.js') &&
      files.some((f) => f.repo === 'cloud/scripts/fetch-standings.mjs')) ? '是' : '否 ❌'));
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

/* ============================================================
   【dispatch 节流 · 2026-10-19 第 3 版】
   用户实测：03:15~03:30 UTC 十几条 workflow_dispatch，日志脏、排队位被顶。
   ------------------------------------------------------------
   根因链：一堆本机脚本（每 5 分钟比分 / 每 2 分钟开奖快更 / 每 30 分钟 /
   21:30·21:45 / 02:00 / 开机补跑 / 代码修改器）【都调这个 sync-cloud】，
   而这个文件每次成功同步都会 dispatch 一次 → manual 那一组的排队位
   （daily-update-manual，GitHub 一个 group 只留 1 个 pending）永远被新触发顶掉。
   ⚠️ 注意：workflow 是【故意不加 on: push】的（构建结束会把 cloud/ 产物提交回
      仓库，加了 push 就无限循环）。所以「靠 push 天然触发」这条路走不通，
      dispatch 不能删，只能【少发】。
   ------------------------------------------------------------
   三道闸（全部只作用于 dispatch，【文件照传、一个都不少】）：
     ① 没实质变化不发：只变了同步标记 / tickets.json / _*.log 这类不用重建的文件 → 不发；
     ② 最小间隔 10 分钟：距上次成功派发 < 10 分钟 → 跳过 dispatch（数据照样推上去）；
     ③ 错峰（原有）：云端已有 pending/in_progress → 不发，那班跑完会带上最新代码。
   --force-dispatch：绕过 ①②（代码修改器 / 用户手动同步要立刻看到效果）。
                     不绕过 ③ —— 往排队位里硬塞只会把别人顶掉。
   ------------------------------------------------------------
   状态文件（只在本机，不进云端、不影响页面）：.sync-last-dispatch.json
     lastDispatchAt     上次【成功】派发的时间戳（ms）
     lastDispatchReason 哪个脚本触发的（--reason= / SYNC_DISPATCH_REASON / 父进程推断）
     skippedCount       累计「因为节流没发」的次数
     lastSkipAt/lastSkipReason  最近一次跳过的原因（排查用）
   ============================================================ */
const DISPATCH_STATE = path.join(PARENT, '.sync-last-dispatch.json');   /* 项目根目录 */
const MIN_DISPATCH_MS = 10 * 60 * 1000;    /* 最小派发间隔 10 分钟 */

/* 【① 没实质变化不发】
   注意：sync-stamp.json 每次同步都会重写（时间戳变了）、tickets.json 是准实时数据
   （分享页自己拉，不需要重建页面）、_*.log 只是云端脚本的运行状态。
   这三类变了【不值得】让云端重跑 6~20 分钟的一班。 */
const NO_REBUILD_RE = [
  /^cloud\/scripts\/sync-stamp\.json$/,
  /^cloud\/out\/tickets\.json$/,
  /^cloud\/scripts\/_[^/]+\.log$/
];
const isNoRebuild = (repo) => NO_REBUILD_RE.some((re) => re.test(repo));
const rebuildFiles = changedFiles.filter((f) => !isNoRebuild(f.repo));

/* 读状态（坏了就当没有，绝不影响同步） */
let prevState = {};
try {
  if (fs.existsSync(DISPATCH_STATE)) {
    const st = JSON.parse(fs.readFileSync(DISPATCH_STATE, 'utf8') || '{}');
    if (st && typeof st === 'object') prevState = st;
  }
} catch (e) { /* 状态文件坏了就当没有 */ }
const lastDispatchAt = Number(prevState.lastDispatchAt || 0);
const prevSkipped = Number(prevState.skippedCount || 0);

function writeDispatchState(patch) {
  try {
    fs.writeFileSync(DISPATCH_STATE, JSON.stringify({
      ...prevState, ...patch, updatedAt: new Date().toISOString()
    }, null, 2), 'utf8');
  } catch (e) { /* 写不了就不记，不影响功能 */ }
}

/* 【触发源】谁调的我 —— 只为状态文件和日志可读，查不到就 'unknown' */
function detectParentScript() {
  if (process.platform !== 'win32') return 'unknown';
  try {
    const ps = '$id=' + process.ppid + ';$o=@();for($i=0;$i -lt 5 -and $id -ne 0;$i++){' +
      '$p=Get-CimInstance Win32_Process -Filter ("ProcessId=" + $id) -ErrorAction SilentlyContinue;' +
      'if($p -eq $null){break};$o+=("{0}#{1}" -f $p.ProcessId,$p.CommandLine);' +
      '$id=$p.ParentProcessId};$o -join [char]10';
    const out = execFileSync('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { encoding: 'utf8', timeout: 4000, windowsHide: true });
    const names = (String(out).match(/[\\/][A-Za-z0-9_][A-Za-z0-9_.\-]*\.(?:mjs|js|cjs|cmd|bat|ps1)/g) || [])
      .map((s) => s.split(/[\\/]/).pop())
      .filter((n) => !/^sync-cloud\.(mjs|cmd)$/i.test(n));
    return names[0] || 'unknown';
  } catch (e) { return 'unknown'; }
}
function detectReason() {
  const arg = (process.argv.find((a) => a.startsWith('--reason=')) || '').slice('--reason='.length).trim();
  if (arg) return arg.slice(0, 80);
  const env = (process.env.SYNC_DISPATCH_REASON || '').trim();
  if (env) return env.slice(0, 80);
  return detectParentScript();
}

const FORCE_DISPATCH = process.argv.includes('--force-dispatch');

/* ② 10 分钟最小间隔 + ① 无实质变化 —— 先在本机判定，不发网络请求 */
let skipDispatch = '';
if (!FORCE_DISPATCH) {
  if (!rebuildFiles.length) {
    skipDispatch = `本次${changedFiles.length} 个文件有变化，但全是同步标记/号码文件/日志这类不用重建的` +
      `（实质变化 0 个）→ 不派发`;
  } else if (lastDispatchAt && Date.now() - lastDispatchAt < MIN_DISPATCH_MS) {
    skipDispatch = `距上次派发只有 ${Math.round((Date.now() - lastDispatchAt) / 60000)} 分钟（<10 分钟）→ 节流，不派发`;
  }
}

/* ③ 错峰：看云端队列（原有逻辑，force 也照旧遵守） */
if (!skipDispatch && !FORCE_DISPATCH) {
  try {
    const runsRes = await gh('GET', `/repos/${OWNER}/${REPO}/actions/runs?per_page=5`);
    if (runsRes && runsRes.ok) {
      const data = runsRes.json || await runsRes.json();
      const busy = (data.workflow_runs || []).filter((x) => x.status === 'pending' || x.status === 'in_progress');
      if (busy.length) {
        skipDispatch = `云端已有 ${busy.length} 个运行在排队/进行中（${busy.map((x) => x.status).join('、')}）→ 错峰，不再派发`;
      }
    }
  } catch (e) { /* 查不到就照常派发 */ }
}

let trigger = null;
if (skipDispatch) {
  writeDispatchState({
    skippedCount: prevSkipped + 1,
    lastSkipAt: new Date().toISOString(),
    lastSkipReason: skipDispatch,
    lastSkipReasonBy: detectReason()
  });
  log(`  ⏭  跳过派发：${skipDispatch}`);
  log(`     · 本次累计跳过 ${prevSkipped + 1} 次；文件【已经全部推上去】了，数据不受影响`);
  log('     · 云端正在跑的那班会带上它；下一次定时班（每 10 分钟）也会补上');
  log('     · 要立刻重建：加 --force-dispatch 再跑一次'
    + '（runtime\\node.exe cloud\\sync-cloud.mjs --force-dispatch）');
} else {
  const reason = detectReason();
  trigger = await gh('POST', dispatchUrl, { ref: BRANCH, inputs: { quick: '1' } });

  /* 万一云端仓库里的 workflow 还没声明 quick 这个输入（会返回 422），
     退一步用普通方式再触发一次，保证「一定会有一次构建」。 */
  if (trigger.status === 422) {
    log('  ⚠️ 快速模式参数被拒（422），改用普通触发重试一次');
    trigger = await gh('POST', dispatchUrl, { ref: BRANCH });
  }
  /* 只在【成功】时才记时间：失败下次还能立刻重试（以前失败也写，白等 30 秒） */
  if (trigger.ok || trigger.status === 204) {
    writeDispatchState({
      lastDispatchAt: Date.now(),
      at: new Date().toISOString(),
      lastDispatchReason: reason,
      lastDispatchForce: FORCE_DISPATCH || undefined,
      skippedCount: prevSkipped
    });
    log(`  · 触发源：${reason}${FORCE_DISPATCH ? '（强制模式 --force-dispatch）' : ''}`);
  }
}

if (!trigger) {
  /* 被错峰/去重跳过：不算失败 */
} else if (trigger.ok || trigger.status === 204) {
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
