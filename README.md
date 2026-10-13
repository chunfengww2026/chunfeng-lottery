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

**想换一套号码**：在本地程序「资料」页点「一键摇号」，
然后把新的 `cloud/scripts/saved-tickets.js` 提交到这个仓库。

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
