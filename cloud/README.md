# 春风十里送大奖 · 云端自动更新

这个仓库每天自动更新彩票推荐页和足球推荐页。

**你的电脑关机也照常更新** —— 因为运行在 GitHub 的服务器上。

---

## 网址

部署完成后：

```
https://你的用户名.github.io/仓库名/
```

手机可以直接打开，发微信也行。

---

## 自动更新时间

```
GitHub 服务器每天 UTC 18:00 运行
        = 北京时间 02:00
```

想立刻更新：到 **Actions** 页 → 左侧选「每日自动更新」→ 点 **Run workflow**。

---

## 更新什么

| 内容 | 说明 |
|---|---|
| 开奖号码 | 官方接口（福彩 + 体彩）|
| 历史开奖 | 最近 60 期，用于统计热号冷号 |
| 足球赛事 | 未开赛 / 进行中 / 已完场 + 实时比分 |
| 竞彩赔率 | 欧赔 / 亚盘 / 大小球 |
| 奖级奖金 | 官方公布的单注奖金 |
| 推荐号码 | **不会自动重摇**（保护已推送的号）|

---

## 推荐号码怎么来的

- 号码池：按近 30 期频率 + 余数筛选自动算
- 胜负平：由博彩公司赔率反推概率（市场共识换算）
- 每期固定，开奖后自动归档，保留最近 30 期

**想换一套号码**：在本地程序点「一键摇号」（或跑 `roll-and-export.mjs`），
它会立刻把新号码写成 `saved-tickets.js` 和 `cloud/out/tickets.json`，
再由 `cloud/sync-cloud.mjs` 一起同步到这个仓库。

---

## 号码多久生效（准实时）

分享页（`index.html`）**不依赖重新构建页面**就能换号码：

1. 页面打开时先用内联的快照渲染 → 立刻有内容，离线也能看
2. 然后异步拉一次 `tickets.json`（每次都带时间戳绕过缓存）
3. 服务器那份的号码时间（`updated`）比页面新 → **就地重渲染**，
   顺便清掉 `localStorage` 里的旧号码，再重新做等比缩放
4. 第一次没拿到更新（云端还在部署）就隔 8s / 25s / 60s 各补拉一次

时间线（本地摇号 → 手机看到新号码）：

| 步骤 | 耗时 |
|---|---|
| 本机摇号 + 生成网页 + 写 `cloud/out/tickets.json` | 约 10 秒 |
| `sync-cloud.mjs` 上传（45 个文件）+ 触发构建 | 约 80 秒 |
| 云端构建（快速模式：不抓数据，只重新渲染） | 本机实测 0.4 秒；云端约 30-80 秒（含 Actions 排队 + Pages 部署） |

> 注意：同步脚本本身要 80 秒左右（一个一个文件传）。
> 页面上的准实时机制让**已经在看的页面**也会自己跟上，
> 但 GitHub Pages 的部署延迟下限在 30 秒左右，这是平台限制。

`cloud-build.mjs` 的快速模式：`CLOUD_QUICK=1` 或 `sync-stamp.json`
小于 12 小时 → 跳过 `build-draws/history/football/jc/prizes`
这些慢抓取，只用同步过来的数据重新渲染。

---

## 目录结构

```
.github/workflows/daily-update.yml   定时任务定义
cloud/cloud-build.mjs                云端构建主脚本
cloud/scripts/                       全部算法与渲染模块
  ├── games.js / stats.js / templates.js / render.js
  ├── build-draws.mjs / build-football.mjs / build-prizes.mjs
  ├── export-static.mjs / export-football.mjs
  └── saved-tickets.js               推荐号码存档
```

---

## 本地预览

```bash
cd cloud
node cloud-build.mjs
# 生成到 cloud/out/index.html 和 cloud/out/football.html
```

---

## 免责声明

彩票有风险，投注需谨慎。

本页面所有内容仅为个人分析，**不构成购彩建议**。

推荐由博彩公司赔率反推得出，属市场共识换算，不保证准确。
