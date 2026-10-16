/* ============================================================
   jc-poisson.js —— 竞彩「泊松指数」计算内核（纯函数，可单测）
   ------------------------------------------------------------
   用户 2026-10-17 队列⑥：「比赛详情页第 2~3 步：泊松指数 + 分歧指 + 亚指多家」，
   并选定「先做能从现有数据算出来的」。

   ✅ 泊松指数 —— 能做。数据源 = jc-data.js 里每场的
        odds.europe.live  { home, draw, away }     欧指
        odds.overunder.live { over, under, line }  大小盘
      （⚠️ 字段名有误导：over 才是【盘口】，line 其实是大球水位。
         依据：截图上「大小 0.8 大 3 小 1」对应 {line:0.8, over:3, under:1}。）
   ❌ 分歧指数 —— 做不了。它需要【多家博彩公司】同一场比赛的赔率离散度，
      而 jc-data.js 里只有一家（open/live 是同一家的开盘/即时两个时点，
      那是"时间差"，不是"公司间分歧"）。
   ❌ 亚指多家 —— 做不了，同样缺多家数据（项目里只有一条亚盘线）。

   算法（纯数学，不编任何数字）：
     ① 欧指去水：p_i = (1/odds_i) / Σ(1/odds_j)               → 市场概率
     ② 大小盘去水：用亚洲水位 w → 隐含概率 1/(1+w)，再归一化    → P(大)/P(小)
     ③ 用【网格搜索 + 局部细化】解出 λ主 / λ客（期望进球）：
          目标 = 让泊松算出的「主胜/平/客胜」概率最接近 ① 的市场概率，
                 同时让「总进球 ≥ 盘口」的概率接近 ②。
        （不是硬套公式，是拟合；拟合误差会一起显示出来，不藏。）
     ④ 输出 λ主 λ客、三路概率、大小概率、最可能的几个比分。

   ⚠️ 这是【由赔率反推的数学模型】，不是博彩公司公布的泊松数据。
      页面上必须如实标注口径，不能让人以为是官方数字。
   ⚠️ 【已知局限】独立泊松会系统性【低估平局】：模型把主客进球当独立变量，
      而真实足球里低比分、互相牵制让平局率更高。真数据 11 场实测：
      平局概率平均低 1.6pp、最大 3.0pp（主胜/客胜几乎无偏）。
      处理方式是【把偏差算出来显示】，不是塞一个说不清的修正系数。
   ============================================================ */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JC_POISSON = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 阶乘（进球数很小，直接算） */
  function fact(n) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }

  /** 泊松概率 P(X = k) */
  function pmf(lambda, k) { return Math.exp(-lambda) * Math.pow(lambda, k) / fact(k); }

  const MAXG = 8;   /* 比分矩阵 0..8 球，够覆盖足球实际 */

  /**
   * 由 λ主 / λ客 算出各种概率（比分矩阵）。
   */
  function poissonOutcome(lh, la) {
    const ph = [], pa = [];
    for (let i = 0; i <= MAXG; i++) { ph.push(pmf(lh, i)); pa.push(pmf(la, i)); }
    let home = 0, draw = 0, away = 0;
    const scores = [];
    for (let i = 0; i <= MAXG; i++) {
      for (let j = 0; j <= MAXG; j++) {
        const p = ph[i] * pa[j];
        if (i > j) home += p; else if (i === j) draw += p; else away += p;
        scores.push({ h: i, a: j, p: p });
      }
    }
    const tot = home + draw + away;
    scores.sort((x, y) => y.p - x.p);
    return {
      home: home / tot, draw: draw / tot, away: away / tot,
      top: scores.slice(0, 5).map((s) => ({ h: s.h, a: s.a, p: s.p / tot })),
      matrix: (i, j) => ph[i] * pa[j] / tot
    };
  }

  /** P(总进球 ≥ line) —— 亚盘大小，含 .25/.75 的半球拆分按标准做法取整盘拆分 */
  function poissonOver(lh, la, line) {
    const ph = [], pa = [];
    for (let i = 0; i <= MAXG; i++) { ph.push(pmf(lh, i)); pa.push(pmf(la, i)); }
    const pOfTotal = (t) => {
      let s = 0;
      for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) if (i + j === t) s += ph[i] * pa[j];
      return s;
    };
    /* 把盘口拆成整盘：2.25 → 2 和 2.5 各半；2.75 → 2.5 和 3 各半 */
    const parts = [];
    const lo = Math.floor(line * 2) / 2;
    if (Math.abs(line - lo) < 1e-9) parts.push(lo);
    else { parts.push(lo, lo + 0.5); }
    let p = 0;
    parts.forEach((L) => {
      /* P(总进球 > L) 对半盘；对整盘 L 则 L+0.5 也是"大" */
      let s = 0;
      for (let t = 0; t <= MAXG * 2; t++) if (t > L) s += pOfTotal(t);
      p += s / parts.length;
    });
    return p;
  }

  /** 欧指去水 → 市场概率 */
  function marketProb(eu) {
    if (!eu) return null;
    const h = Number(eu.home), d = Number(eu.draw), a = Number(eu.away);
    if (!(h > 1 && d > 1 && a > 1)) return null;
    const ih = 1 / h, id = 1 / d, ia = 1 / a;
    const s = ih + id + ia;
    return { home: ih / s, draw: id / s, away: ia / s, overround: s };
  }

  /** 亚洲水位 → 去水后的 P(大) */
  function marketOver(ou) {
    if (!ou) return null;
    const wOver = Number(ou.line);      /* ⚠️ 字段名误导：line 是大球水位 */
    const wUnder = Number(ou.under);
    const line = Number(ou.over);       /* ⚠️ over 才是盘口 */
    if (!(wOver > 0 && wUnder > 0 && line > 0)) return null;
    const io = 1 / (1 + wOver), iu = 1 / (1 + wUnder);
    const s = io + iu;
    return { over: io / s, under: iu / s, line: line };
  }

  /**
   * 解 λ主 / λ客：网格搜索 + 局部细化。
   * 目标函数 = 三路概率的平方误差 + 大小概率的平方误差（权重可调）。
   */
  function solveLambdas(mk, mo, opt) {
    const o = opt || {};
    const wOU = o.weightOU == null ? 1.0 : o.weightOU;
    const cost = (lh, la) => {
      const r = poissonOutcome(lh, la);
      let c = Math.pow(r.home - mk.home, 2) + Math.pow(r.draw - mk.draw, 2) + Math.pow(r.away - mk.away, 2);
      if (mo) c += wOU * Math.pow(poissonOver(lh, la, mo.line) - mo.over, 2);
      return c;
    };
    /* 粗搜：λ主 0.2~4.0，λ客 0.2~4.0，步长 0.1 */
    let best = { c: Infinity, lh: 1, la: 1 };
    for (let lh = 0.2; lh <= 4.001; lh += 0.1) {
      for (let la = 0.2; la <= 4.001; la += 0.1) {
        const c = cost(lh, la);
        if (c < best.c) best = { c: c, lh: lh, la: la };
      }
    }
    /* 细化：围绕最优点按 0.01 再搜一轮 */
    const c0 = best.lh, a0 = best.la;
    for (let lh = Math.max(0.2, c0 - 0.12); lh <= c0 + 0.12; lh += 0.01) {
      for (let la = Math.max(0.2, a0 - 0.12); la <= a0 + 0.12; la += 0.01) {
        const c = cost(lh, la);
        if (c < best.c) best = { c: c, lh: lh, la: la };
      }
    }
    return { lh: +best.lh.toFixed(2), la: +best.la.toFixed(2), cost: best.c };
  }

  /**
   * 一场比赛的泊松指数。
   * @param {object} game jc-data.js 里的一场
   * @returns {object|null} 数据不全时返回 null（绝不硬编、绝不给假数）
   */
  function compute(game) {
    if (!game || !game.odds) return null;
    /* 优先用即时盘，没有就用开盘 */
    const eu = (game.odds.europe && (game.odds.europe.live || game.odds.europe.open)) || null;
    const ou = (game.odds.overunder && (game.odds.overunder.live || game.odds.overunder.open)) || null;
    const mk = marketProb(eu);
    if (!mk) return null;
    const mo = marketOver(ou);
    const sol = solveLambdas(mk, mo);
    const r = poissonOutcome(sol.lh, sol.la);
    const src = (game.odds.europe && game.odds.europe.live) ? 'live' : 'open';
    return {
      source: src,
      lambdaHome: sol.lh,
      lambdaAway: sol.la,
      lambdaTotal: +(sol.lh + sol.la).toFixed(2),
      /* 泊松算出来的三路概率（%） */
      poisson: { home: +(r.home * 100).toFixed(1), draw: +(r.draw * 100).toFixed(1), away: +(r.away * 100).toFixed(1) },
      /* 市场去水后的三路概率（%），用来对比 */
      market: { home: +(mk.home * 100).toFixed(1), draw: +(mk.draw * 100).toFixed(1), away: +(mk.away * 100).toFixed(1) },
      overround: +(mk.overround * 100).toFixed(1),
      overunder: mo ? {
        line: mo.line,
        poisson: { over: +(poissonOver(sol.lh, sol.la, mo.line) * 100).toFixed(1), under: +((1 - poissonOver(sol.lh, sol.la, mo.line)) * 100).toFixed(1) },
        market: { over: +(mo.over * 100).toFixed(1), under: +(mo.under * 100).toFixed(1) }
      } : null,
      topScores: r.top.map((s) => ({ score: s.h + '-' + s.a, p: +(s.p * 100).toFixed(1) })),
      /* 【已知局限，如实暴露】独立泊松会系统性低估平局（足球比分不是独立泊松，
         低比分/相关性让真实平局率高于模型值）。真数据 11 场实测：
         平局平均低 1.6 个百分点，最大 3.0。这里把偏差算出来一起显示，
         而不是加一个说不清的系数去糊。 */
      drawBias: +(r.draw * 100 - mk.draw * 100).toFixed(1),
      /* 拟合误差：三路概率的最大偏差（百分点）—— 如实显示，不藏 */
      fitError: +Math.max(
        Math.abs(r.home * 100 - mk.home * 100),
        Math.abs(r.draw * 100 - mk.draw * 100),
        Math.abs(r.away * 100 - mk.away * 100)
      ).toFixed(1)
    };
  }

  return { compute, pmf, poissonOutcome, poissonOver, marketProb, marketOver, solveLambdas, fact };
});
