// ============================================================
//  deploy-github.mjs —— 一键部署到 GitHub（云端自动更新）
//
//  做四件事：
//    1. 用你的 Token 创建仓库
//    2. 上传全部文件（含 .github/workflows 定时任务）
//    3. 开启 GitHub Pages
//    4. 打印你的网址
//
//  用法：
//    node deploy-github.mjs <你的Token> [仓库名]
//
//  例：
//    node deploy-github.mjs ghp_xxxxxxxx 春风
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log(...a);

const TOKEN = (process.argv[2] || '').trim();
const REPO_NAME = (process.argv[3] || 'chunfeng-lottery').trim();

if (!TOKEN) {
  log('❌ 缺少 Token');
  log('');
  log('用法：node deploy-github.mjs <你的Token> [仓库名]');
  log('');
  log('Token 获取步骤：');
  log('  1. 打开 https://github.com/settings/tokens');
  log('  2. Generate new token (classic)');
  log('  3. Note 随便填，Expiration 选 No expiration');
  log('  4. 勾选  ☑ repo   ☑ workflow');
  log('  5. 点 Generate token，复制 ghp_ 开头的那串');
  process.exit(1);
}

const API = 'https://api.github.com';

/* ---------- 请求封装 ---------- */
async function api(method, endpoint, body) {
  const res = await fetch(API + endpoint, {
    method,
    headers: {
      'Authorization': 'Bearer ' + TOKEN,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'chunfeng-deploy',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* 非 JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}

/* ---------- 1. 验证 Token ---------- */
async function whoAmI() {
  const r = await api('GET', '/user');
  if (!r.ok) {
    if (r.status === 401) {
      log('❌ Token 无效或已过期');
      log('   请重新生成：https://github.com/settings/tokens');
    } else {
      log(`❌ 验证失败：${r.status} ${r.json ? r.json.message : r.text.slice(0, 120)}`);
    }
    return null;
  }
  return r.json;
}

/* ---------- 2. 创建仓库（已存在则复用） ---------- */
async function ensureRepo(user, name) {
  const check = await api('GET', `/repos/${user.login}/${name}`);
  if (check.ok) {
    log(`  ✅ 仓库已存在：${check.json.full_name}`);
    return check.json;
  }

  const create = await api('POST', '/user/repos', {
    name,
    description: '春风 · 每日自动更新的推荐网页',
    private: false,
    auto_init: false,
    has_issues: false,
    has_wiki: false,
    has_projects: false
  });

  if (!create.ok) {
    log(`  ❌ 创建仓库失败：${create.status} ${create.json ? create.json.message : ''}`);
    if (create.status === 403) log('     → Token 可能缺少 repo 权限');
    if (create.status === 422) log('     → 仓库名可能已被占用，换个名字重试');
    return null;
  }
  log(`  ✅ 已创建仓库：${create.json.full_name}`);
  return create.json;
}

/* ---------- 3. 收集要上传的文件 ----------
   注意路径：本脚本位于 cloud/ 目录内，
   所以 ROOT 就是 cloud/ 本身。 */
function collectFiles() {
  const out = [];
  const PARENT = path.join(ROOT, '..');   // 项目根 D:\彩虹多多

  /* 云端构建需要的全部模块（cloud/scripts/*） */
  const scriptsDir = path.join(ROOT, 'scripts');
  if (fs.existsSync(scriptsDir)) {
    fs.readdirSync(scriptsDir).forEach((f) => {
      const p = path.join(scriptsDir, f);
      if (fs.statSync(p).isFile()) out.push({ local: p, repo: `cloud/scripts/${f}` });
    });
  }

  /* 云端主脚本（cloud/cloud-build.mjs） */
  const cb = path.join(ROOT, 'cloud-build.mjs');
  if (fs.existsSync(cb)) out.push({ local: cb, repo: 'cloud/cloud-build.mjs' });

  /* GitHub Actions 工作流（.github/workflows/daily-update.yml） */
  const wf = path.join(PARENT, '.github', 'workflows', 'daily-update.yml');
  if (fs.existsSync(wf)) out.push({ local: wf, repo: '.github/workflows/daily-update.yml' });

  /* 说明文件 */
  const rd = path.join(ROOT, 'README.md');
  if (fs.existsSync(rd)) out.push({ local: rd, repo: 'README.md' });

  return out;
}

/* ---------- 4. 上传一个文件 ---------- */
async function putFile(user, repo, item) {
  const content = fs.readFileSync(item.local);
  const b64 = content.toString('base64');

  /* 先看是否已存在，拿 sha 以便覆盖 */
  const exist = await api('GET', `/repos/${user.login}/${repo}/contents/${encodeURIComponent(item.repo).replace(/%2F/g, '/')}`);
  const sha = exist.ok && exist.json && exist.json.sha ? exist.json.sha : undefined;

  const r = await api('PUT', `/repos/${user.login}/${repo}/contents/${encodeURIComponent(item.repo).replace(/%2F/g, '/')}`, {
    message: `上传 ${path.basename(item.repo)}`,
    content: b64,
    ...(sha ? { sha } : {})
  });

  return r.ok;
}

/* ---------- 5. 开启 GitHub Pages ---------- */
async function enablePages(user, repo) {
  /* 先用 Actions 方式试 */
  let r = await api('POST', `/repos/${user.login}/${repo}/pages`, {
    build_type: 'workflow'
  });

  if (r.ok) { log('  ✅ 已开启 Pages（Actions 方式）'); return true; }

  /* 可能已经开启了 */
  const check = await api('GET', `/repos/${user.login}/${repo}/pages`);
  if (check.ok) { log('  ✅ Pages 已经开启'); return true; }

  /* 退回用分支方式 */
  r = await api('POST', `/repos/${user.login}/${repo}/pages`, {
    source: { branch: 'main', path: '/' }
  });
  if (r.ok) { log('  ✅ 已开启 Pages（分支方式）'); return true; }

  log(`  ⚠️ 开启 Pages 失败：${r.status} ${r.json ? r.json.message : ''}`);
  log('     → 可以稍后到仓库 Settings → Pages 手动选 "GitHub Actions"');
  return false;
}

/* ---------- 6. 触发一次工作流 ---------- */
async function triggerWorkflow(user, repo) {
  const r = await api('POST', `/repos/${user.login}/${repo}/actions/workflows/daily-update.yml/dispatches`, {
    ref: 'main'
  });
  if (r.ok) { log('  ✅ 已触发一次构建（约 2-3 分钟出结果）'); return true; }
  log(`  ⚠️ 触发失败：${r.status}（可以稍后到 Actions 页手动 Run workflow）`);
  return false;
}

/* ============================================================
   主流程
   ============================================================ */
async function main() {
  log('════════════════════════════════════════════');
  log('  春风 · 部署到 GitHub');
  log('════════════════════════════════════════════');
  log('');

  /* 1. 验证 */
  log('【1/5】验证 Token');
  const user = await whoAmI();
  if (!user) process.exit(1);
  log(`  ✅ 你好，${user.login}`);
  log('');

  /* 2. 建仓库 */
  log('【2/5】创建仓库');
  const repo = await ensureRepo(user, REPO_NAME);
  if (!repo) process.exit(1);
  log('');

  /* 3. 上传文件 */
  log('【3/5】上传文件');
  const files = collectFiles();
  log(`  共 ${files.length} 个文件`);
  let okCount = 0;
  let failCount = 0;
  for (const item of files) {
    const ok = await putFile(user, REPO_NAME, item);
    if (ok) { okCount++; process.stdout.write('.'); }
    else { failCount++; process.stdout.write('x'); }
    await new Promise((r) => setTimeout(r, 120));   // 别触发限流
  }
  log('');
  log(`  ✅ 成功 ${okCount} 个${failCount ? `，失败 ${failCount} 个` : ''}`);
  log('');

  /* 4. 开 Pages */
  log('【4/5】开启 GitHub Pages');
  await enablePages(user, REPO_NAME);
  log('');

  /* 5. 触发一次构建 */
  log('【5/5】首次构建');
  await triggerWorkflow(user, REPO_NAME);
  log('');

  /* 打印结果 */
  const siteUrl = `https://${user.login.toLowerCase()}.github.io/${REPO_NAME}/`;
  log('════════════════════════════════════════════');
  log('  ✅ 部署完成');
  log('════════════════════════════════════════════');
  log('');
  log('你的网址（手机可直接打开）：');
  log('  ' + siteUrl);
  log('');
  log('仓库地址：');
  log('  ' + repo.html_url);
  log('');
  log('接下来：');
  log('  1. 等 2-3 分钟，第一次构建完成');
  log('  2. 打开上面的网址确认能看');
  log('  3. 把这个网址发微信就行');
  log('');
  log('以后每天（你电脑关着也）自动更新：');
  log('  GitHub 服务器每天 UTC 18:00 = 北京 02:00 自动跑');
  log('');
  log('想立刻更新：到仓库 Actions 页点 "Run workflow"');
}

main().catch((e) => {
  log('');
  log('❌ 出错了：' + e.message);
  process.exit(1);
});
