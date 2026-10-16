/* ============================================================
   p3d-analyzer.js —— 3D / 排列三 手绘参考图 · 计算内核（纯函数，可单测）
   ------------------------------------------------------------
   用户 2026-10-17 给的 P3D_Analyzer（算法我核对过，是对的）：
     ROAD_MAP = num % 3（012 路）✅
     形态：1 个不同数字=豹子 / 2 个=组三 / 3 个=组六 ✅（和项目 stats.js 用词一致）
     和值 = 三数之和；和尾 = 和值 % 10；跨度 = max - min ✅
   这里保留他的全部口径，只做三件事：
     ① 数据从【示例 3 期】换成【history.js 真数据 60 期】
     ② 洛书基盘【复用项目的 NINE_CHART_BASE.baseLuoshu】，不再抄第 N 份
     ③ 开奖命中 与 六码圈选 分成两个 class（用户原 JS 都加 .hit → 同色分不清）

   ⚠️ 与用户原 JS 的三处差异（都是修正，逐条注明）：
     ① getLuoshuPos() 在他代码里【定义了但从没调用】→ 死代码，这里不保留。
        真正要的是"某个数字落在九宫哪一格"，改成 luoshuCells() 一次算全部。
     ② highlightLuoshuByLiuyuan() 只 add('hit') 从不 remove，
        而 renderLuoshu 也用同一个 'hit' → 开奖命中的格子 和 六码圈选的格子
        视觉上完全一样，分不出是开奖还是推荐。
        这里分成 hit（开奖）和 pick（六码）两个 class。
     ③ tbody_getCell() 每取一格都 querySelectorAll('#posTableBody tr')
        （60 期 × 3 列 = 180 次全表查询）。这里改成一次取行、按索引访问。

   两种加载方式（和项目其它文件一致）：
     · Node（CJS）：const P3D = require('./p3d-analyzer.js');
     · 浏览器 / vm：执行后挂在 globalThis.P3D_ANALYZER 上
   ============================================================ */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.P3D_ANALYZER = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* 洛书九宫基盘 —— 和项目一致（stats.js 的 NINE_CHART_BASE.baseLuoshu）。
     ⚠️ 项目的洛书是【按上期号码算 offset 动态旋转】的（createLuoshu9Grid）；
        这里是【静态基盘】，只用于"标出本期命中的宫位"这种参考图。
        要动态盘请用 stats.js 的 getCurrentLuoshu()，别在这里再实现一遍。 */
  const LUOSHU = [[4, 9, 2], [3, 5, 7], [8, 1, 6]];

  /** 012 路：就是 num % 3（用户的 ROAD_MAP 完全等价于此） */
  function roadOf(n) { return ((n % 3) + 3) % 3; }

  /**
   * 单期解析（保留用户 parseDraw 的全部口径）。
   * @param {number[]} nums [百, 十, 个]（或任意按位数字）
   */
  function parseDraw(nums) {
    const list = (Array.isArray(nums) ? nums : []).map(Number);
    const bai = list[0], shi = list[1], ge = list[2];
    const sum = list.reduce((a, b) => a + b, 0);
    const distinct = new Set(list).size;
    const shape = distinct === 1 ? '豹子' : (distinct === 2 ? '组三' : '组六');
    const rb = roadOf(bai), rs = roadOf(shi), rg = roadOf(ge);
    return {
      raw: list, bai, shi, ge,
      sum, sumTail: sum % 10,
      span: Math.max.apply(null, list) - Math.min.apply(null, list),
      shape,
      roadBai: rb, roadShi: rs, roadGe: rg,
      roadStr: String(rb) + String(rs) + String(rg)
    };
  }

  /**
   * 洛书九宫命中情况（把一批号码落到九宫格上）。
   * @param {number[]} nums 号码（0~9）
   * @returns {{cells: Object, zero: boolean}}
   *          cells 的键是 "r,c"，值是命中该格的原号码数组
   */
  function luoshuHits(nums) {
    const cells = {};
    let zero = false;
    (Array.isArray(nums) ? nums : []).forEach((n) => {
      const v = Number(n);
      if (v === 0) { zero = true; return; }       /* 0 单独外置（用户的规则） */
      if (v < 1 || v > 9) return;
      for (let r = 0; r < LUOSHU.length; r++) {
        for (let c = 0; c < LUOSHU[r].length; c++) {
          if (LUOSHU[r][c] === v) {
            const k = r + ',' + c;
            (cells[k] = cells[k] || []).push(v);
            return;
          }
        }
      }
    });
    return { cells, zero };
  }

  /** 一批期次的完整分析 */
  function analyze(rows) {
    const draws = (Array.isArray(rows) ? rows : []).map((r) => {
      const p = parseDraw(r.nums || r);
      p.issue = r.issue == null ? '' : String(r.issue);
      p.date = r.date ? String(r.date) : '';
      return p;
    });

    /* 形态分布 / 路组合分布 / 指标区间 —— 给"指标记录栏"做汇总用 */
    const shapeCount = { 组六: 0, 组三: 0, 豹子: 0 };
    const roadComboCount = {};
    let sumMin = Infinity, sumMax = -Infinity, spanMin = Infinity, spanMax = -Infinity;
    draws.forEach((d) => {
      shapeCount[d.shape] = (shapeCount[d.shape] || 0) + 1;
      roadComboCount[d.roadStr] = (roadComboCount[d.roadStr] || 0) + 1;
      if (d.sum < sumMin) sumMin = d.sum;
      if (d.sum > sumMax) sumMax = d.sum;
      if (d.span < spanMin) spanMin = d.span;
      if (d.span > spanMax) spanMax = d.span;
    });
    if (!draws.length) { sumMin = sumMax = spanMin = spanMax = null; }

    /* 洛书：把所有期次的号码并起来标（不是只看最后一期 —— 用户原 JS 只看最后一期，
       但那和旁边三张"显示全部期次"的表不一致；这里给两个都有，调用方自己选） */
    const allNums = [];
    draws.forEach((d) => d.raw.forEach((n) => allNums.push(n)));
    const luoshuAll = luoshuHits(allNums);
    const luoshuLast = draws.length ? luoshuHits(draws[draws.length - 1].raw) : { cells: {}, zero: false };

    return {
      draws,
      periods: draws.length,
      shapeCount,
      roadComboCount,
      sumRange: [sumMin, sumMax],
      spanRange: [spanMin, spanMax],
      luoshuAll,
      luoshuLast,
      first: draws.length ? draws[0].issue : '',
      last: draws.length ? draws[draws.length - 1].issue : ''
    };
  }

  /** 六码推荐 → 要圈在九宫上的数字集合（去重、滤掉 0~9 以外的） */
  function liuMaSet(rec) {
    if (!rec) return [];
    const raw = [];
    if (rec.goldDan != null) raw.push(rec.goldDan);
    if (rec.silverDan != null) raw.push(rec.silverDan);
    (rec.tuoList || []).forEach((n) => raw.push(n));
    const seen = new Set();
    const out = [];
    raw.forEach((n) => {
      const v = Number(n);
      if (v >= 0 && v <= 9 && !seen.has(v)) { seen.add(v); out.push(v); }
    });
    return out.sort((a, b) => a - b);
  }

  return { LUOSHU, roadOf, parseDraw, luoshuHits, analyze, liuMaSet };
});
