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
   给两个页面加上互跳导航
   ============================================================ */
const NAV_CSS = `
<style>
.site-nav {
  position: sticky; top: 0; z-index: 99;
  display: flex; gap: 0;
  background: rgba(15,17,21,0.95);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid #262d3a;
}
.site-nav a {
  flex: 1;
  text-align: center;
  padding: 13px 10px;
  font-size: 14px;
  font-weight: 600;
  color: #6b7488;
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: all .15s;
}
.site-nav a:hover { color: #c8cfda; }
.site-nav a.on { color: #47e0a0; border-bottom-color: #47e0a0; }
</style>
`;

function injectNav(html, active) {
  const nav =
    `${NAV_CSS}`.replace('</head>', '') +
    `<div class="site-nav">` +
    `<a href="index.html" class="${active === 'lottery' ? 'on' : ''}">彩票推荐</a>` +
    `<a href="football.html" class="${active === 'football' ? 'on' : ''}">竞彩场次</a>` +
    `</div>`;

  let out = html;

  // 样式插到 </head> 前
  out = out.replace('</head>', NAV_CSS + '</head>');

  // 导航条插到 <body> 后
  out = out.replace(/<body([^>]*)>/, `<body$1>${nav}`);

  return out;
}

lottery = injectNav(lottery, 'lottery');
if (football) football = injectNav(football, 'football');

/* ---------- 3. 写文件 ---------- */
fs.writeFileSync(path.join(SITE, 'index.html'), lottery, 'utf8');
log(`✅ index.html    ${(Buffer.byteLength(lottery, 'utf8') / 1024).toFixed(1)} KB`);

if (football) {
  fs.writeFileSync(path.join(SITE, 'football.html'), football, 'utf8');
  log(`✅ football.html ${(Buffer.byteLength(football, 'utf8') / 1024).toFixed(1)} KB`);
}

/* ---------- 4. 说明文件 ---------- */
const readme = `春风十里送大奖 · 分享站点
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
