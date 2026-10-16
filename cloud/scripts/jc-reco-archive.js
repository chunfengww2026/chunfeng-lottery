/* ============================================================
   jc-reco-archive.js —— 竞彩【推荐串】存档 · 计算内核（纯函数，可单测）
   ------------------------------------------------------------
   ⚠️【代码和数据必须分两个文件】这条是踩过坑才定下来的：
      第一版让「本文件」既当模块（cloud-build 要 require 它）
      又当存档数据（jc-reco-build 往里写 JC_RECO_ARCHIVE），
      结果 sync-cloud.mjs 把数据当代码同步上去、云端直接报
      「R.bjStamp is not a function」—— 两边的文件互相覆盖。
      现在：本文件 = 只读的计算内核（永不写入）；存档在 jc-reco-data.js。
      （和 jc-archive.mjs 代码 / jc-history.js 数据 完全同一个套路。）

   【为什么需要「推荐串存档」】
   页面上「推荐串」是【当期快照】：只在售场次里挑信心 ≥55% 的，
   比赛一开完就从在售列表消失 → 那期的推荐串就没人记得了。
   而页面上要显示「推荐串 红 X 黑 Y 命中率 Z%」，就必须把每一期存下来，
   等比赛打完再拿终场比分回去比对。

   【和后端已有机制的关系】
     · jc-history.js / jc-archive.mjs 已经做了「已完场累积」（单场级）。
     · 本文件只做上面那一层：把「某一期的那一串」整体存下来 → 整体判红黑。
       单场判定复用已存档记录的 hit；没有就按 pick 与比分自己判。

   【判定口径（用户原话）】
     · 窗口：「足球信息记录前后24小时内的，超过24小时内的比赛就不要了」
     · 一轮推荐串 = 同一期存下来的那一组（一批）：
         全中 = 红；有一场没中 = 黑；还有比赛没打完 = 待定（不进命中率分母）
     · 命中率 = 红 / (红 + 黑)；全是待定时是 null（页面显示"暂无已结算"，
       绝不用 0 冒充"算过了"）。
     · 时刻一律按【北京时间】算，不依赖运行机器时区。

   【怎么加载】两种方式都支持：
     · Node（CJS）：const R = require('./jc-reco-archive.js');
     · 浏览器 / vm：执行后挂在 globalThis.JC_RECO_ARCHIVE 上
   ============================================================ */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JC_RECO_ARCHIVE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ============================================================
     1. 时间：一律按北京时间（东八区）
     ============================================================ */
  function bjNow(t) {
    const base = (t === undefined || t === null || t === '') ? new Date() : new Date(t);
    if (isNaN(base.getTime())) return new Date(NaN);
    return new Date(base.getTime() + base.getTimezoneOffset() * 60000 + 8 * 3600000);
  }

  /** 解析 'YYYY-MM-DD HH:MM(:SS)'（按北京时间墙上时钟）→ 毫秒；解析不了 NaN */
  function bjParse(s) {
    if (!s) return NaN;
    return new Date(String(s).replace(/-/g, '/')).getTime();
  }

  /** 墙上时钟 → 'YYYY-MM-DD HH:MM' */
  function bjStamp(t) {
    const d = bjNow(t);
    if (isNaN(d.getTime())) return '';
    const p = (n) => (n < 10 ? '0' + n : String(n));
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ============================================================
     2. 窗口：开赛时间前后 24 小时
     ============================================================ */
  const RECO_KEEP_HOURS = 24;

  function inWindow(timeStr, now) {
    const t = bjParse(timeStr);
    if (!isFinite(t)) return true;                 /* 解析不出来就保留，别误删 */
    const base = bjParse(bjStamp(now)) || Date.now();
    const span = RECO_KEEP_HOURS * 3600 * 1000;
    return t >= base - span && t <= base + span;
  }

  /* ============================================================
     3. 存档形状（存在 jc-reco-data.js 里）
     ------------------------------------------------------------
     {
       updated: 'YYYY-MM-DD HH:MM',
       note: '竞彩推荐串存档（程序生成，勿手改）',
       batches: [
         { at, min, rows: [ { code,time,league,home,away,pick,label,odds,conf,
                             score,hit,result } ],
           hit, miss, pending, verdict }     // verdict: 红 / 黑 / '' (待定)
       ]
     }
     ============================================================ */
  function emptyArchive() {
    return { updated: '', note: '竞彩推荐串存档（程序生成，勿手改）', batches: [] };
  }

  /** 一场推荐的稳定键：编号@日期；没编号就用 队名对@日期 */
  function rowKey(r) {
    if (!r) return '';
    const d = String(r.time || '').slice(0, 10);
    const code = String(r.code || '').trim();
    if (code) return code + '@' + d;
    return String(r.home || '').trim() + '|' + String(r.away || '').trim() + '@' + d;
  }

  /** 把「这一期的推荐串」做成一个批次 */
  function buildSnapshot(rows, opt) {
    const o = opt || {};
    const list = Array.isArray(rows) ? rows : [];
    return {
      at: bjStamp(o.now),
      min: o.min == null ? 55 : o.min,
      rows: list.map((r) => ({
        code: r.code || '', time: r.time || '', league: r.league || '',
        home: r.home || '', away: r.away || '',
        pick: r.pick || '', label: r.label || '',
        odds: r.odds == null ? null : r.odds,
        conf: r.conf == null ? null : r.conf,
        score: '', hit: null, result: ''
      })),
      hit: null, miss: null, pending: list.length, verdict: ''
    };
  }

  /** 整串判红黑：全中=红；有一场不中=黑；有未打完=待定 */
  function verdictOf(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return { verdict: '', hit: null, miss: null, pending: 0 };
    let miss = 0, pending = 0;
    list.forEach((r) => {
      if (r.hit === true) return;
      if (r.hit === false) { miss++; return; }
      pending++;
    });
    if (pending > 0) return { verdict: '', hit: null, miss: null, pending };
    return miss === 0
      ? { verdict: '红', hit: 1, miss: 0, pending: 0 }
      : { verdict: '黑', hit: 0, miss: miss, pending: 0 };
  }

  /**
   * 合并新一期到存档。【幂等】同一组比赛重复跑不会重复插入，
   * 只刷新赔率/信心，保留已经算出来的 hit/score。
   */
  function mergeArchive(archive, snapshot, opt) {
    const o = opt || {};
    const out = (archive && Array.isArray(archive.batches)) ? archive : emptyArchive();
    const snap = snapshot;
    if (!snap || !Array.isArray(snap.rows) || !snap.rows.length) {
      return { archive: out, added: 0, updated: 0, reason: '本期没有推荐场次' };
    }
    const keys = snap.rows.map(rowKey).filter(Boolean).sort().join('~');

    let same = null;
    out.batches.forEach((b) => {
      if (same) return;
      const k = (b.rows || []).map(rowKey).filter(Boolean).sort().join('~');
      if (k && k === keys) same = b;
    });

    if (same) {
      let updated = 0;
      snap.rows.forEach((nr) => {
        const old = (same.rows || []).find((x) => rowKey(x) === rowKey(nr));
        if (!old) return;
        if (old.odds !== nr.odds || old.conf !== nr.conf || old.label !== nr.label) updated++;
        old.odds = nr.odds; old.conf = nr.conf; old.label = nr.label;
        if (nr.pick) old.pick = nr.pick;
      });
      same.at = same.at || snap.at;
      out.updated = bjStamp(o.now);
      return { archive: out, added: 0, updated, reason: '这一组已经存过（只刷新了赔率/信心）' };
    }

    out.batches.push(snap);
    out.updated = bjStamp(o.now);
    return { archive: out, added: 1, updated: 0, reason: '' };
  }

  const dayOf = (s) => String(s || '').slice(0, 10).replace(/\//g, '-');

  /**
   * 用「已完场记录」回填终场比分与红黑，并丢掉窗口外的批次。
   * @param {object} archive
   * @param {Array}  settled jc-history.js 的 list（含 code/home/away/time/score/hit/pick）
   */
  function enrichArchive(archive, settled, opt) {
    const o = opt || {};
    const list = Array.isArray(settled) ? settled : [];
    const out = (archive && Array.isArray(archive.batches)) ? archive : emptyArchive();

    const byCode = new Map(), byPair = new Map();
    list.forEach((g) => {
      if (!g) return;
      const d = dayOf(g.time);
      if (g.code) byCode.set(String(g.code).trim() + '@' + d, g);
      if (g.home && g.away) byPair.set(g.home + '|' + g.away + '@' + d, g);
    });

    let filled = 0, changed = 0;
    out.batches.forEach((b) => {
      (b.rows || []).forEach((r) => {
        if (r.score) return;                        /* 补过就不覆盖 */
        const d = dayOf(r.time);
        let m = null;
        if (r.code && byCode.has(r.code + '@' + d)) m = byCode.get(r.code + '@' + d);
        else if (r.home && r.away && byPair.has(r.home + '|' + r.away + '@' + d)) {
          m = byPair.get(r.home + '|' + r.away + '@' + d);
        }
        if (!m || !m.score) return;
        r.score = m.score;
        if (typeof m.hit === 'boolean' && m.pick) {
          r.hit = m.hit;
          r.result = m.hit ? 'win' : 'lose';
        } else if (r.pick) {
          const sp = String(m.score).split(':');
          const h = +sp[0], a = +sp[1];
          if (isFinite(h) && isFinite(a)) {
            const actual = h > a ? 'home' : (h === a ? 'draw' : 'away');
            r.hit = (r.pick === actual);
            r.result = r.hit ? 'win' : 'lose';
          }
        }
        filled++; changed++;
      });
      const v = verdictOf(b.rows);
      if (b.verdict !== v.verdict || b.pending !== v.pending) changed++;
      b.verdict = v.verdict; b.hit = v.hit; b.miss = v.miss; b.pending = v.pending;
    });

    const before = out.batches.length;
    out.batches = out.batches.filter((b) => {
      const rows = b.rows || [];
      if (!rows.length) return false;
      return rows.some((r) => inWindow(r.time, o.now));
    });
    const dropped = before - out.batches.length;

    out.updated = bjStamp(o.now);
    return { archive: out, filled, changed, dropped };
  }

  /** 汇总：红 / 黑 / 命中率（待定不算分母） */
  function summarize(archive) {
    const out = (archive && Array.isArray(archive.batches)) ? archive : emptyArchive();
    let red = 0, black = 0, pending = 0, rows = 0;
    out.batches.forEach((b) => {
      const v = verdictOf(b.rows);
      if (v.verdict === '红') red++;
      else if (v.verdict === '黑') black++;
      else pending++;
      rows += (b.rows || []).length;
    });
    const decided = red + black;
    return {
      batches: out.batches.length,
      rows,
      red, black, pending,
      rate: decided ? +((red / decided) * 100).toFixed(1) : null,
      decided
    };
  }

  /** 窗口内、且（可选）已经出结果的批次，按存档时间倒序 */
  function visibleBatches(archive, opt) {
    const o = opt || {};
    const out = (archive && Array.isArray(archive.batches)) ? archive : emptyArchive();
    return out.batches
      .filter((b) => {
        const rows = b.rows || [];
        if (!rows.length) return false;
        if (o.onlyDecided && !verdictOf(rows).verdict) return false;
        return rows.some((r) => inWindow(r.time, o.now));
      })
      .sort((a, b) => (bjParse(b.at) || 0) - (bjParse(a.at) || 0));
  }

  /** 生成【数据文件】jc-reco-data.js 的文本（⚠️ 不是本文件） */
  function renderDataJs(archive, updatedAt) {
    const out = archive || emptyArchive();
    const body = {
      updated: updatedAt || out.updated || bjStamp(),
      note: '竞彩推荐串存档（程序生成，勿手改）',
      batches: out.batches || []
    };
    return '/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）\n' +
      '   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。\n' +
      '   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs\n' +
      '   回填终场比分与红黑。窗口：开赛时间前后 24 小时。\n' +
      '   rows[] 字段：code,time,league,home,away,pick,label,odds,conf,score,hit,result\n' +
      '   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */\n' +
      'const JC_RECO_DATA = ' + JSON.stringify(body, null, 1) + ';\n';
  }

  return {
    RECO_KEEP_HOURS, bjNow, bjParse, bjStamp,
    emptyArchive, rowKey, buildSnapshot, verdictOf,
    mergeArchive, enrichArchive, inWindow, summarize, visibleBatches, renderDataJs
  };
});
