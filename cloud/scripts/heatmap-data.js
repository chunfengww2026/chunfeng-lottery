/* ============================================================
   heatmap-data.js —— 实票统计热力图数据（程序生成，勿手改）

   生成时间：2026-10-14 18:24
   生成脚本：build-heatmap.mjs
   本次彩种：dlt
   数据来源：history-fallback

   口径说明：
     · yiqicai-xysp      = 一起彩「幸运晒票」页当期晒票里提取到的号码占比
     · history-fallback  = 晒票样本不足，改用「近 30 期开奖号码频率」代替
   免责：只是「大家买了什么号」的统计展示，不构成购彩建议，也不能预测中奖。
   ============================================================ */

const HEATMAP_DATA = {
  updated: '2026-10-14 18:24',
  source: 'history-fallback',
  games: {
    dlt: {
      name: '大乐透',
      issue: '26117',
      drawDate: '2026-10-14',
      madeAt: '2026-10-14 18:24',
      source: 'history-fallback',
      sourceLabel: '近 30 期开奖频率',
      sampleCount: 30,
      numberPosts: 2,
      note: '晒票样本不足，改用近 30 期开奖号码频率（26087~26116）',
      front: { label: '前区', color: 'red', total: 150, items: [{ num: 10, pct: 6, count: 9 }, { num: 14, pct: 6, count: 9 }, { num: 3, pct: 5.33, count: 8 }, { num: 12, pct: 4.67, count: 7 }, { num: 7, pct: 4, count: 6 }, { num: 9, pct: 4, count: 6 }, { num: 11, pct: 4, count: 6 }, { num: 17, pct: 4, count: 6 }, { num: 26, pct: 4, count: 6 }, { num: 33, pct: 4, count: 6 }, { num: 5, pct: 3.33, count: 5 }, { num: 25, pct: 3.33, count: 5 }, { num: 29, pct: 3.33, count: 5 }, { num: 35, pct: 3.33, count: 5 }, { num: 1, pct: 2.67, count: 4 }, { num: 2, pct: 2.67, count: 4 }, { num: 6, pct: 2.67, count: 4 }, { num: 8, pct: 2.67, count: 4 }, { num: 15, pct: 2.67, count: 4 }, { num: 16, pct: 2.67, count: 4 }, { num: 22, pct: 2.67, count: 4 }, { num: 24, pct: 2.67, count: 4 }, { num: 27, pct: 2.67, count: 4 }, { num: 4, pct: 2, count: 3 }, { num: 18, pct: 2, count: 3 }, { num: 19, pct: 2, count: 3 }, { num: 20, pct: 2, count: 3 }, { num: 21, pct: 2, count: 3 }, { num: 32, pct: 2, count: 3 }, { num: 28, pct: 1.33, count: 2 }, { num: 30, pct: 1.33, count: 2 }, { num: 34, pct: 1.33, count: 2 }, { num: 31, pct: 0.67, count: 1 }, { num: 13, pct: 0, count: 0 }, { num: 23, pct: 0, count: 0 }] },
      back: { label: '后区', color: 'blue', total: 60, items: [{ num: 9, pct: 18.33, count: 11 }, { num: 1, pct: 11.67, count: 7 }, { num: 4, pct: 11.67, count: 7 }, { num: 7, pct: 10, count: 6 }, { num: 10, pct: 8.33, count: 5 }, { num: 2, pct: 6.67, count: 4 }, { num: 8, pct: 6.67, count: 4 }, { num: 12, pct: 6.67, count: 4 }, { num: 3, pct: 5, count: 3 }, { num: 5, pct: 5, count: 3 }, { num: 6, pct: 5, count: 3 }, { num: 11, pct: 5, count: 3 }] }
    }
  }
};

/* ---------- 开奖日 & 显示时机（客户端与服务端共用同一套判断） ---------- */
/* 各彩种开奖日（0=周日），与 draw-data.js 的 DRAW_WEEKDAYS 保持一致 */
const HEATMAP_DRAW_DAYS = { ssq: [0, 2, 4], dlt: [1, 3, 6] };

/**
 * 把任意时刻转成「北京时间的墙上时钟」
 * @param {Date|string|number} [now] 不传就是当前时刻
 */
function heatmapBeijingNow(now) {
  var base = (now === undefined || now === null) ? null : new Date(now);
  if (!base || isNaN(base.getTime())) {
    base = new Date();
    try {
      if (typeof HEATMAP_NOW_OVERRIDE !== 'undefined' && HEATMAP_NOW_OVERRIDE) {
        var o = new Date(HEATMAP_NOW_OVERRIDE);
        if (!isNaN(o.getTime())) base = o;
      }
    } catch (e) { /* 忽略 */ }
  }
  // UTC+8：把本地时区偏移补掉，返回值各字段即为北京时间
  return new Date(base.getTime() + (base.getTimezoneOffset() + 480) * 60000);
}

/** 北京时间的今天，'YYYY-MM-DD' */
function heatmapToday(now) {
  var d = heatmapBeijingNow(now);
  var p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/**
 * 这张热力图现在该不该显示
 *   ① 必须有这个彩种的数据，且数据就是【今天】生成的
 *   ② 今天必须是这个彩种的开奖日
 *   ③ 必须已经过了 18:00（北京时间）
 * 三个条件缺一不可 —— 平常不透露，第二天自动消失。
 */
function shouldShowHeatmap(gid, now) {
  var H = (typeof HEATMAP_DATA !== 'undefined' && HEATMAP_DATA && HEATMAP_DATA.games)
    ? HEATMAP_DATA.games[gid] : null;
  if (!H || !H.drawDate) return false;

  var bj = heatmapBeijingNow(now);
  if (H.drawDate !== heatmapToday(now)) return false;

  var days = HEATMAP_DRAW_DAYS[gid];
  if (!days || days.indexOf(bj.getDay()) < 0) return false;

  if (bj.getHours() < 18) return false;

  return true;
}

/** 百分比文本：保留原始精度（2 位小数），去掉末尾多余的 0 */
function heatmapPctText(pct) {
  var v = Number(pct);
  if (!isFinite(v)) v = 0;
  var s = v.toFixed(2);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s + '%';
}
