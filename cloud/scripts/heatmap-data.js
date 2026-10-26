/* ============================================================
   heatmap-data.js —— 实票统计热力图数据（程序生成，勿手改）

   生成时间：2026-10-26 15:57
   生成脚本：build-heatmap.mjs
   本次彩种：ssq、dlt
   数据来源：history-fallback

   口径说明：
     · ocr-xysp          = 一起彩「幸运晒票」页当期【票面照片 OCR】识别出的号码占比
     · xysp-text         = OCR 样本不够，改用晒票【正文文字】里提取到的号码
     · history-fallback  = 都不可用，改用「近 30 期开奖号码频率」代替
   免责：只是「大家买了什么号」的统计展示，不构成购彩建议，也不能预测中奖。
   ============================================================ */

const HEATMAP_DATA = {
  updated: '2026-10-26 15:57',
  source: 'history-fallback',
  games: {
    ssq: {
      name: '双色球',
      issue: '2026123',
      drawDate: '2026-10-27',
      madeAt: '2026-10-26 15:52',
      source: 'history-fallback',
      sourceLabel: '近 30 期开奖频率',
      sampleCount: 30,
      numberPosts: 0,
      note: '晒票样本不足，改用近 30 期开奖号码频率（2026093~2026122）（当期晒票 8 篇 / 候选票面 8 张，能确认期号的只有 1 张）',
      ocr: { posts: 8, urls: 8, downloaded: 8, downloadFailed: 0, cacheHits: 0, recognized: 2, tickets: 1, secs: 116.2, err: '期号确认的有效票只有 1 张（需 ≥2）；另有 1 张号码读出来了但票面期号认不出/不是当期，已丢弃' },
      front: { label: '红球', color: 'red', total: 180, items: [{ num: 4, pct: 6.11, count: 11 }, { num: 22, pct: 5.56, count: 10 }, { num: 24, pct: 5.56, count: 10 }, { num: 30, pct: 5.56, count: 10 }, { num: 13, pct: 5, count: 9 }, { num: 14, pct: 5, count: 9 }, { num: 31, pct: 4.44, count: 8 }, { num: 20, pct: 3.89, count: 7 }, { num: 26, pct: 3.89, count: 7 }, { num: 5, pct: 3.33, count: 6 }, { num: 6, pct: 3.33, count: 6 }, { num: 11, pct: 3.33, count: 6 }, { num: 16, pct: 3.33, count: 6 }, { num: 1, pct: 2.78, count: 5 }, { num: 12, pct: 2.78, count: 5 }, { num: 18, pct: 2.78, count: 5 }, { num: 25, pct: 2.78, count: 5 }, { num: 2, pct: 2.22, count: 4 }, { num: 9, pct: 2.22, count: 4 }, { num: 15, pct: 2.22, count: 4 }, { num: 17, pct: 2.22, count: 4 }, { num: 19, pct: 2.22, count: 4 }, { num: 27, pct: 2.22, count: 4 }, { num: 28, pct: 2.22, count: 4 }, { num: 29, pct: 2.22, count: 4 }, { num: 33, pct: 2.22, count: 4 }, { num: 3, pct: 1.67, count: 3 }, { num: 7, pct: 1.67, count: 3 }, { num: 8, pct: 1.67, count: 3 }, { num: 21, pct: 1.67, count: 3 }, { num: 23, pct: 1.67, count: 3 }, { num: 10, pct: 1.11, count: 2 }, { num: 32, pct: 1.11, count: 2 }] },
      back: { label: '蓝球', color: 'blue', total: 30, items: [{ num: 4, pct: 16.67, count: 5 }, { num: 2, pct: 10, count: 3 }, { num: 3, pct: 10, count: 3 }, { num: 9, pct: 10, count: 3 }, { num: 14, pct: 10, count: 3 }, { num: 11, pct: 6.67, count: 2 }, { num: 12, pct: 6.67, count: 2 }, { num: 16, pct: 6.67, count: 2 }, { num: 1, pct: 3.33, count: 1 }, { num: 5, pct: 3.33, count: 1 }, { num: 6, pct: 3.33, count: 1 }, { num: 7, pct: 3.33, count: 1 }, { num: 8, pct: 3.33, count: 1 }, { num: 10, pct: 3.33, count: 1 }, { num: 15, pct: 3.33, count: 1 }, { num: 13, pct: 0, count: 0 }] }
    },
    dlt: {
      name: '大乐透',
      issue: '26122',
      drawDate: '2026-10-26',
      madeAt: '2026-10-26 15:52',
      source: 'history-fallback',
      sourceLabel: '近 30 期开奖频率',
      sampleCount: 30,
      numberPosts: 1,
      note: '晒票样本不足，改用近 30 期开奖号码频率（26092~26121）（当期晒票 10 篇 / 候选票面 16 张，能确认期号的只有 1 张）',
      ocr: { posts: 10, urls: 16, downloaded: 16, downloadFailed: 0, cacheHits: 0, recognized: 2, tickets: 1, secs: 172.8, err: '期号确认的有效票只有 1 张（需 ≥2）；另有 3 张号码读出来了但票面期号认不出/不是当期，已丢弃' },
      front: { label: '前区', color: 'red', total: 150, items: [{ num: 10, pct: 6, count: 9 }, { num: 6, pct: 4.67, count: 7 }, { num: 14, pct: 4.67, count: 7 }, { num: 3, pct: 4, count: 6 }, { num: 25, pct: 4, count: 6 }, { num: 26, pct: 4, count: 6 }, { num: 29, pct: 4, count: 6 }, { num: 33, pct: 4, count: 6 }, { num: 1, pct: 3.33, count: 5 }, { num: 2, pct: 3.33, count: 5 }, { num: 8, pct: 3.33, count: 5 }, { num: 9, pct: 3.33, count: 5 }, { num: 11, pct: 3.33, count: 5 }, { num: 12, pct: 3.33, count: 5 }, { num: 15, pct: 3.33, count: 5 }, { num: 17, pct: 3.33, count: 5 }, { num: 32, pct: 3.33, count: 5 }, { num: 35, pct: 3.33, count: 5 }, { num: 5, pct: 2.67, count: 4 }, { num: 7, pct: 2.67, count: 4 }, { num: 19, pct: 2.67, count: 4 }, { num: 20, pct: 2.67, count: 4 }, { num: 21, pct: 2.67, count: 4 }, { num: 22, pct: 2.67, count: 4 }, { num: 4, pct: 2, count: 3 }, { num: 16, pct: 2, count: 3 }, { num: 18, pct: 2, count: 3 }, { num: 24, pct: 2, count: 3 }, { num: 27, pct: 1.33, count: 2 }, { num: 28, pct: 1.33, count: 2 }, { num: 30, pct: 1.33, count: 2 }, { num: 31, pct: 1.33, count: 2 }, { num: 34, pct: 1.33, count: 2 }, { num: 13, pct: 0.67, count: 1 }, { num: 23, pct: 0, count: 0 }] },
      back: { label: '后区', color: 'blue', total: 60, items: [{ num: 9, pct: 16.67, count: 10 }, { num: 4, pct: 13.33, count: 8 }, { num: 1, pct: 11.67, count: 7 }, { num: 7, pct: 11.67, count: 7 }, { num: 12, pct: 10, count: 6 }, { num: 8, pct: 8.33, count: 5 }, { num: 3, pct: 6.67, count: 4 }, { num: 6, pct: 6.67, count: 4 }, { num: 10, pct: 6.67, count: 4 }, { num: 2, pct: 5, count: 3 }, { num: 5, pct: 1.67, count: 1 }, { num: 11, pct: 1.67, count: 1 }] }
    }
  }
};

/* ---------- 开奖日 & 显示时机（客户端与服务端共用同一套判断） ---------- */
/* 各彩种开奖日（0=周日），与 draw-data.js 的 DRAW_WEEKDAYS 保持一致 */
const HEATMAP_DRAW_DAYS = { ssq: [0, 2, 4], dlt: [1, 3, 6] };

/* 【顶掉「最新开奖」的时间窗】开奖日当天（北京时间）：
     18:00 起   → 热力图出现，【占据页面顶部「最新开奖」区块的位置】
     到 WINDOW_END → 换回「最新开奖」
   双色球（周二 / 周四 / 周日）：18:00 → 20:00
   大乐透（周一 / 周三 / 周六）：18:00 → 21:00

   用户 2026-10-15 原话：
     「在开双色球的时候 18 点更新到最新开奖位置覆盖住，过了 20 点就更新回来
       最新开奖；同样大乐透在 18 点更新过去，21 点更新回来最新开奖。」
   ⚠️ 这里的结束时刻【不是开奖时刻】，是用户指定的「换回最新开奖」时刻
      （所以大乐透 21:00 会晚于它 20:30 的开奖时刻 —— 已向用户说明）。
   与 draw-data.js 的 DRAW_WEEKDAYS / 上面的 HEATMAP_DRAW_DAYS 配套。 */
const HEATMAP_WINDOW_START = '18:00';
const HEATMAP_WINDOW_END = { ssq: '20:00', dlt: '21:00' };

/**
 * 把任意时刻转成「北京时间的墙上时钟」
 * @param {Date|string|number} [now] 不传就是当前时刻
 *
 * 【注意】之前这里写成「base 无效时才看 HEATMAP_NOW_OVERRIDE」，
 * 结果是：传了 now 也会被 override/真实时间顶掉，
 * 导致 shouldShowHeatmap(gid, '2026-10-15T18:00') 这种调用不可靠。
 * 现在把优先级写清楚：显式 now > HEATMAP_NOW_OVERRIDE > 真实时间。
 */
function heatmapBeijingNow(now) {
  var base = null;
  if (now !== undefined && now !== null) {
    var d = new Date(now);
    if (!isNaN(d.getTime())) base = d;
  }
  if (!base) {
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

/** 'HH:MM' → 当天第几分钟（0~1439）；写错/没配 → -1（表示不做时刻限制） */
function heatmapClockMinute(hhmm) {
  var seg = String(hhmm === undefined || hhmm === null ? '' : hhmm).split(':');
  var h = +seg[0], m = +seg[1];
  if (!isFinite(h) || !isFinite(m)) return -1;
  return h * 60 + m;
}

/**
 * 这张热力图现在该不该显示（= 该不该顶掉「最新开奖」区块）
 *   ① 必须有这个彩种的数据，数据就是【今天】生成的，而且真的有柱子数据
 *   ② 今天必须是这个彩种的开奖日
 *   ③ 必须已经过了 18:00（北京时间）
 *   ④ 【到点换回来】还没到当天的窗口结束时刻
 *      双色球 20:00 换回「最新开奖」 / 大乐透 21:00 换回「最新开奖」
 * 四个条件缺一不可 —— 18:00 出现（顶掉最新开奖），窗口结束就换回来。
 *
 * 【服务端 / 客户端 / App 共用这一个函数】
 *   · 服务端：export-static.mjs 预渲染时用它（heatmapVisible）
 *   · 客户端：分享页内联脚本用它（实时渲染 + 到点自动切换）
 *   · latest-draws.js 的 latestBlockMode() 也调它来决定区块里放哪一张
 *   → 时间窗口只有这一处定义，两边不可能漂移。
 */
function shouldShowHeatmap(gid, now) {
  var H = (typeof HEATMAP_DATA !== 'undefined' && HEATMAP_DATA && HEATMAP_DATA.games)
    ? HEATMAP_DATA.games[gid] : null;
  if (!H || !H.drawDate) return false;

  /* 【数据缺失就不要顶掉】只有标题条没有柱子的热力图等于空白区块，
     这种情况必须让「最新开奖」照常显示（宁可不出热力图，也不能留白）。 */
  if (!H.front || !H.front.items || !H.front.items.length) return false;

  var bj = heatmapBeijingNow(now);
  if (H.drawDate !== heatmapToday(now)) return false;

  var days = HEATMAP_DRAW_DAYS[gid];
  if (!days || days.indexOf(bj.getDay()) < 0) return false;

  var nowMin = bj.getHours() * 60 + bj.getMinutes();
  var startMin = heatmapClockMinute(HEATMAP_WINDOW_START);
  if (startMin < 0) startMin = 18 * 60;
  if (nowMin < startMin) return false;                   /* 18:00 之前不显示 */

  /* 【到点换回来】到当天的窗口结束时刻就撤下，区块换回「最新开奖」 */
  var endMin = heatmapClockMinute(HEATMAP_WINDOW_END[gid]);
  if (endMin >= 0 && nowMin >= endMin) return false;

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
