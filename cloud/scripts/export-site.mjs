// ============================================================
//  export-site.mjs —— 生成可直接部署的分享站点
//
//  产物：分享包/ 目录
//    index.html    只读分享版（彩票推荐图 + 竞彩）
//    football.html 足球全部赛事推荐
//    _redirects    兼容 Netlify
//
//  把「分享包」里的文件上传到任意静态托管，就能拿到网址。
//  用法：node export-site.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(ROOT, '分享包');

/* ---------- 准备目录 ---------- */
fs.mkdirSync(SITE, { recursive: true });

const log = (...a) => console.log(...a);

/* ---------- 1. 彩票只读版 → index.html ---------- */
const srcLottery = path.join(ROOT, '只读分享版.html');
if (!fs.existsSync(srcLottery)) {
  console.error('❌ 找不到 只读分享版.html，请先运行 export-static.mjs');
  process.exit(1);
}
let lottery = fs.readFileSync(srcLottery, 'utf8');

/* ---------- 2. 足球页 → football.html ---------- */
const srcFootball = path.join(ROOT, '足球推荐.html');
let football = '';
if (fs.existsSync(srcFootball)) {
  football = fs.readFileSync(srcFootball, 'utf8');
} else {
  log('⚠️ 找不到 足球推荐.html，跳过');
}

/* ============================================================
   给页面加上互跳导航
   ------------------------------------------------------------
   ⚠️ 2026-10-17 修正：这段导航以前是【深色】的
      （rgba(15,17,21,.95) 黑底 + #6b7488 灰字），和已经换成米杏色的
      分享页 / 竞彩页拼在一起就是"米杏页面顶着一条黑导航"。
      现在跟着页面一起用米杏色（值取自 export-static.mjs 的 __LIGHT_THEME__）。
   ⚠️ 2026-10-17 再修正：这里原来还有第三个 Tab【走势图】，指向包内的独立页。
      用户要求「留在近30期走势预选参考里面. 删除单独走势图独立页」→
      独立页不再产出，那个 Tab 点了必然是 404，所以【整块删掉】，
      导航回到「彩票推荐 / 竞彩/足球」两栏。
      走势图内容现在内联在 index.html 的「近 30 期走势 · 预选参考」折叠块里。
   ============================================================ */
/* ============================================================
   【第一层防护 · 注入位置】
   ------------------------------------------------------------
   下面两个标签字面量【故意拆开拼】：源码里不出现完整的 head 开 / 收尾标签，
   免得以后又有人在这个文件里写注释、写字符串时把同一个坑踩回来。
   ============================================================ */
const T_HEAD_OPEN = '<' + 'head>';
const T_HEAD_CLOSE = '</' + 'head>';

/* 唯一的 head 注入槽位（export-static.mjs / export-football.mjs 在 head 末尾输出）。
   ⚠️ 为什么不再 out.replace(收尾标签, CSS + 收尾标签)：
      String.replace 只替换【第一处】，而页面 HTML 注释里完全可能出现字面的
      head 收尾标签（2026-10-17 就这么炸过：整段 NAV_CSS 被塞进注释内部 →
      CSS 全废 → 分享页 Tab 变成蓝色下划线链接）。
      槽位标记独一无二 → 页面上不可能有第二处，替换/插入永远落在正确位置。 */
const HEAD_SLOT = '<!--__HEAD_SLOT__-->';

const NAV_CSS = `
<style>
.site-nav {
  position: sticky; top: 0; z-index: 99;
  display: flex; gap: 0;
  background: rgba(247,239,225,0.96);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid #e8d7bd;
}
.site-nav a {
  flex: 1;
  text-align: center;
  padding: 13px 10px;
  font-size: 14px;
  font-weight: 600;
  color: #8a7a63;
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: all .15s;
}
.site-nav a:hover { color: #4a3a26; }
.site-nav a.on { color: #1a8c5a; border-bottom-color: #1a8c5a; }
</style>
`;

function injectNav(html, active) {
  const nav =
    `<div class="site-nav">` +
    `<a href="index.html" class="${active === 'lottery' ? 'on' : ''}">彩票推荐</a>` +
    `<a href="football.html" class="${active === 'football' ? 'on' : ''}">竞彩/足球</a>` +
    `</div>`;

  let out = html;

  /* ⚠️ 去掉页面【自带】的那条顶部 Tab（.top-tabs）。
     实测踩到：分享包里于是有两条导航叠在一起 ——
       · 注入的 .site-nav（指向包内 index/football.html）
       · 页面自带的 .top-tabs（2 个 Tab，href 是 "./" 和 "足球推荐.html"）
     后者的链接在分享包里是【死链】（包里的文件名是 football.html），
     而且两条都占顶部、字叠字（截图里导航宽 490px 超出 430 视口）。
     这里的 .site-nav 就是它的替代品，所以整块删掉。 */
  out = out.replace(/<div class="top-tabs">[\s\S]*?<\/div>\s*/, '');

  /* ⚠️ 只在页面【自己没定义 .site-nav 样式】时才补这段 CSS。
     原因（实测踩过）：竞彩页 export-football.mjs 的浅色主题里已经有一条
     `.site-nav { background: rgba(247,239,225,.96) !important; ... }`，
     而这里插的样式在它【后面】、两条同优先级 —— 后面那条赢，
     于是导航又变回深色（分享包里 football.html 就是这么被压黑的）。
     分享页自己【没有】这条规则，需要这里补。 */
  const needCss = !/\.site-nav\s*\{/.test(html);

  /* 【第一层】注入点：
     ① 优先用唯一槽位标记 __HEAD_SLOT__（页面里只可能有一处）；
     ② 页面没有标记 → 退到【最后一个】head 收尾标签之前
        （lastIndexOf，不是 replace 的第一处）；
     ③ 两样都没有 → 直接报错退出，不再"静默不注入"或注入错位置。 */
  const slot = out.indexOf(HEAD_SLOT);
  if (slot >= 0) {
    out = out.slice(0, slot) + (needCss ? NAV_CSS : '') + out.slice(slot + HEAD_SLOT.length);
  } else if (needCss) {
    const i = out.lastIndexOf(T_HEAD_CLOSE);
    if (i < 0) {
      console.error(`❌ injectNav(${active})：页面里既没有槽位标记 ${HEAD_SLOT}，也没有 ${T_HEAD_CLOSE}，无处注入导航样式`);
      process.exit(1);
    }
    out = out.slice(0, i) + NAV_CSS + out.slice(i);
  }

  // 导航条插到 <body> 后
  out = out.replace(/<body([^>]*)>/, `<body$1>${nav}`);

  return { html: out, css: needCss ? NAV_CSS : '' };
}

/* ============================================================
   【第二层防护 · 构建时硬断言】
   ------------------------------------------------------------
   事故（2026-10-17）：注入 NAV_CSS 用 String.replace(收尾标签, CSS + 收尾标签)
   只替换【第一处】，而页面 HTML 注释里也字面写着一个收尾标签 →
   整段 CSS 被插进注释内部 → CSS 全废 → 分享页 Tab 变蓝色下划线链接。
   现在每份产物在【写文件之前】必须过这三关，任一不过 → exit 1：
     ① head 开标签正好 1 个
     ② head 收尾标签正好 1 个（≠1 直接打印出现次数 + 行号/偏移）
     ③ 注入的样式落在 head 区间内，且【不在 HTML 注释里】
        （判据：样式第一个字符往前找最近的 <!-- 和 -->，谁更近）
   ⚠️ 这段必须留在写文件之前 —— 本机任务（export-only / daily-update）
      和云端构建（cloud/scripts 同名脚本由 sync-cloud.mjs 同步）都会跑到。
   ============================================================ */
function tagPositions(s, tag) {
  const out = [];
  let i = 0;
  while ((i = s.indexOf(tag, i)) !== -1) { out.push(i); i += tag.length; }
  return out;
}
function lineNoOf(s, pos) {
  let line = 1;
  for (let i = 0; i < pos && i < s.length; i++) if (s.charCodeAt(i) === 10) line++;
  return line;
}
function assertSingleHead(html, label, cssText) {
  const bad = [];
  const open = tagPositions(html, T_HEAD_OPEN);
  const close = tagPositions(html, T_HEAD_CLOSE);
  const where = (arr) => arr.map((p) => `第 ${lineNoOf(html, p)} 行（偏移 ${p}）`).join(' / ');

  if (open.length !== 1) {
    bad.push(`${T_HEAD_OPEN} 出现 ${open.length} 次（必须 1 次）${open.length ? ' → ' + where(open) : ''}`);
  }
  if (close.length !== 1) {
    bad.push(`${T_HEAD_CLOSE} 出现 ${close.length} 次（必须 1 次）${close.length ? ' → ' + where(close) : ''}`);
  }
  if (cssText) {
    const ci = html.indexOf(cssText);
    if (ci < 0) {
      bad.push('注入的样式在产物里找不到（注入没生效）');
    } else {
      const cOpen = html.lastIndexOf('<!--', ci);
      const cClose = html.lastIndexOf('-->', ci);
      if (cOpen > cClose) {
        bad.push(`注入的样式落在 HTML 注释内部（最近的 <!-- 偏移 ${cOpen} / --> 偏移 ${cClose}）→ 整段 CSS 会失效`);
      }
      if (open.length === 1 && close.length === 1 && !(ci > open[0] && ci < close[0])) {
        bad.push(`注入的样式不在 head 里（样式偏移 ${ci}，head 区间 ${open[0]}~${close[0]}）`);
      }
    }
  }

  if (bad.length) {
    console.error(`\n❌ ${label}：head 结构自检失败（${bad.length} 项），产物【没有写出】`);
    bad.forEach((b, i) => console.error(`   ${i + 1}) ${b}`));
    console.error('   注入逻辑见本文件 injectNav()：只认槽位标记 ' + HEAD_SLOT + '，');
    console.error('   没有标记才退到「最后一个 ' + T_HEAD_CLOSE + ' 之前」。');
    console.error('   常见原因：页面里别处（尤其是 HTML 注释里）又写了字面的 head 开/收尾标签。\n');
    process.exit(1);
  }
  console.log(`   ✅ ${label}：${T_HEAD_OPEN}=1 · ${T_HEAD_CLOSE}=1${cssText ? ' · 注入样式在 head 内且不在注释里' : ''}`);
}

const lot = injectNav(lottery, 'lottery');
const fb = football ? injectNav(football, 'football') : null;

/* 【第二层防护】写文件之前先过硬断言：不满足就 exit 1，一个字节都不写。 */
assertSingleHead(lot.html, 'index.html', lot.css);
if (fb) assertSingleHead(fb.html, 'football.html', fb.css);

lottery = lot.html;
if (fb) football = fb.html;

/* ---------- 2b. （已删除）走势图独立页 ----------
   2026-10-17 用户要求「留在近30期走势预选参考里面. 删除单独走势图独立页」：
   走势图不再有独立 HTML 产物 —— 它的样式 / 表格 / 脚本由 build-trend.mjs
   出成片段，被 export-static.mjs 内联进 index.html（= 只读分享版.html）的
   <details class="ro-trend">（近 30 期走势 · 预选参考）里。
   所以这里【整段删掉】：不再读独立页、不再往包里写、导航也没有它那一栏。 */

/* ---------- 3. 写文件 ---------- */
fs.writeFileSync(path.join(SITE, 'index.html'), lottery, 'utf8');
log(`✅ index.html    ${(Buffer.byteLength(lottery, 'utf8') / 1024).toFixed(1)} KB`);

if (football) {
  fs.writeFileSync(path.join(SITE, 'football.html'), football, 'utf8');
  log(`✅ football.html ${(Buffer.byteLength(football, 'utf8') / 1024).toFixed(1)} KB`);
  /* 【推荐串红黑 · 30 秒实时刷新】竞彩页会定期去拉这个数据文件（同目录、相对路径）。
     必须跟 football.html 一起发到站点根目录，否则线上那次刷新拿不到文件 ——
     拿不到时前端什么都不做（页面仍是构建时那份数据），不会坏，但也就不会自动更新。
     ⚠️ 本机是 file:// 打开的，走的是 <script src>（不是 fetch），所以本地不依赖这一步。 */
  const recoView = path.join(ROOT, 'jc-reco-view.js');
  if (fs.existsSync(recoView)) {
    fs.copyFileSync(recoView, path.join(SITE, 'jc-reco-view.js'));
    log(`✅ jc-reco-view.js ${(fs.statSync(recoView).size / 1024).toFixed(1)} KB（竞彩页 30 秒刷新用）`);
  } else {
    log('ℹ️ 没有 jc-reco-view.js（先跑 export-football.mjs 生成），跳过');
  }
}

/* （走势图独立页的写入也一并删掉了：包内不再有 走势图.html 这个文件） */

/* ---------- 4. 说明文件 ---------- */
const readme = `春风 · 分享站点
============================================================

这个文件夹里的文件可以直接上传到任意静态托管，得到手机能打开的网址。

文件说明
------------------------------------------------------------
  index.html     首页 —— 彩票推荐图（8 个彩种）+ 竞彩（体彩在售）
  football.html  足球全部赛事推荐
  使用说明.txt    本文件

怎么发布（三选一，都免费）
------------------------------------------------------------

【方法一】Netlify Drop —— 最快，不用注册也行
  1. 电脑浏览器打开  https://app.netlify.com/drop
  2. 把「分享包」这个文件夹整个拖进网页
  3. 等几秒，会给你一个网址，形如
        https://随机名字.netlify.app
  4. 把这个网址发微信 / QQ 就行

【方法二】Vercel
  1. 打开  https://vercel.com
  2. 注册（可用 GitHub 账号）
  3. 新建项目 → 上传这个文件夹 → 得到网址

【方法三】GitHub Pages
  1. 注册 GitHub，新建一个仓库
  2. 把这两个 html 传上去
  3. 仓库 Settings → Pages → 选 main 分支 → 保存
  4. 得到  https://你的用户名.github.io/仓库名/

发布后别人看到什么
------------------------------------------------------------
  · 只能看，没有任何按钮或输入框
  · 手机上自动适配竖屏
  · 顶部两个标签可以切换「彩票推荐」和「足球竞彩」

更新内容
------------------------------------------------------------
  数据变了以后，重新运行 export-site.mjs，
  再把新的 index.html / football.html 覆盖上传即可
  （Netlify / Vercel 拖一下就更新）。

注意事项
------------------------------------------------------------
  · 页面已内置免责声明
  · 彩票有风险，请勿用于诱导他人购彩
`;

fs.writeFileSync(path.join(SITE, '使用说明.txt'), readme, 'utf8');
log('✅ 使用说明.txt');

log('\n════════════════════════════════════════════');
log(`  分享包已生成：${SITE}`);
log('════════════════════════════════════════════');
log('\n下一步：把这个文件夹拖到 https://app.netlify.com/drop');
log('就会得到一个手机能打开的网址。');
