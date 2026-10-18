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
     · 窗口（2026-10-17 起）：比赛时间前后 36 小时
       —— 用户先说「前后24小时…只留下48小时内推荐过的结果（这里抓48小时的）」，
          所以窗口值是 48，见下面 RECO_KEEP_HOURS（唯一开关）
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
     2. 窗口：比赛时间前后 36 小时
     ------------------------------------------------------------
     用户 2026-10-18 改口径（原话）：「硬性条件就是以后只抓取大于等于58%的信心单（36小时内比赛结果）其他的不算」→ 48 → 36。
      （下面这段是上一轮 36 小时的来历，保留作记录）
     用户 2026-10-17 追加（原话）：
       「推荐串前后24小时自动比对不要还没比赛结果的.
         只留下48小时内推荐过的结果（这里抓48小时的）」
     ⇒ 24 → 48。**这个数是「存档保留 + 统计窗口」的唯一开关**：
       · enrichArchive 按它丢窗口外的批次
       · matchStats 按它逐场过滤（红黑 / 没打完都只算窗口内的）
       · 页面（export-football.mjs 的 REC_ARCH_HOURS）必须和它一致，
         否则会出现「存档留了 36 小时、页面只显示 24 小时」或者反过来。
     ============================================================ */
  const RECO_KEEP_HOURS = 36;

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
         { at, min, rows: [ { code,time,league,home,away,pick,label,type,odds,conf,
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
        /* 【推荐类型】必须一起存：离开在售列表后只剩这份存档，
           type 丢了就只能按 three 判红黑 → 不败推荐（胜或平都算中）
           会被错判成黑。缺失/未知一律按 'three'（和改造前行为一致）。 */
        type: r.type === 'unbeaten' ? 'unbeaten' : 'three',
        odds: r.odds == null ? null : r.odds,
        conf: r.conf == null ? null : r.conf,
        score: '', hit: null, result: ''
      })),
      hit: null, miss: null, pending: list.length, verdict: ''
    };
  }

  /* ============================================================
     【推荐结果判定】three（胜负平）/ unbeaten（不败）
     ------------------------------------------------------------
     判定规则【只写这一份】，别在别处再抄一套：
       · three    ：只中那一个结果（主胜 / 平 / 客胜 之一）
       · unbeaten ：主胜或平 / 客胜或平 都算中（双选）
     ⚠️ 不败推荐如果还用 pick === actual 判，平局会被错判成「黑」。
     规则和 export-football.mjs 的 recoHit() 一字不差（那边是页面渲染用，
     本文件不引用页面脚本，所以两边保持同一套规则、改一边必须改另一边）。
     rec = { pick, type }；type 不是 'unbeaten'（含老存档没有 type）→ 按 three 判，
     所以对现有全是 three 的存档，结果和改造前完全一致。
     ============================================================ */
  /** 「不败」推荐的那一边（'home' | 'away' | ''）；平局推荐没有"不败"边 */
  function unbeatenSide(rec) {
    const pick = typeof rec === 'string' ? rec : (rec && rec.pick);
    return pick === 'home' ? 'home' : (pick === 'away' ? 'away' : '');
  }

  /** 一条推荐是否命中：three 只中一个；unbeaten 胜或平都算中 */
  function recoHit(rec, actual) {
    if (!rec || !actual) return false;
    const side = unbeatenSide(rec);
    if (rec.type === 'unbeaten' && side) return actual === 'draw' || actual === side;
    return rec.pick === actual;
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

    /* 【逐场去重 · 用户 2026-10-18 反馈「抓取的数据不对」的根因之一】
       原来只有「整批场次集合完全一样」才合并；实际每 5 分钟抓一次，
       场次增删（开盘/撤盘）会让集合不同 → 同一场比赛被反复存进多个批次
       → 统计时重复累加（实测同一场出现 8 行，红黑数虚高）。
       这里先按「编号+日期」把【已经存过的场】剔掉，只保留新出现的场次。 */
    const dayKeyOf = (r) => {
      if (!r) return '';
      const code = r.code ? String(r.code).trim() : ((r.home || '') + '|' + (r.away || ''));
      const d = String(r.time || '').slice(0, 10);
      return code ? code + '@' + d : '';
    };
    const already = new Set();
    out.batches.forEach((b) => (b.rows || []).forEach((r) => {
      const k = dayKeyOf(r);
      if (k) already.add(k);
    }));
    const fresh = snap.rows.filter((r) => {
      const k = dayKeyOf(r);
      return k && !already.has(k);
    });
    if (!fresh.length) {
      out.updated = bjStamp(o.now);
      return { archive: out, added: 0, updated: 0, reason: '这一批场次都已经存过（没有新的场次）' };
    }
    snap.rows = fresh;                    /* 只存新场次，重复的不再进库 */

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

    /* 【清理历史重复】用户 2026-10-18：老库里同一场比赛被存了多次（实测 8 行）。
       这里按「编号+日期」只保留【最早那一批】里的那一行，其余重复行删掉 ——
       只删重复、不动任何判定字段；删空的批次整批丢弃。 */
    {
      const seen = new Set();
      const dayKeyOf = (r) => {
        if (!r) return '';
        const code = r.code ? String(r.code).trim() : ((r.home || '') + '|' + (r.away || ''));
        const d = String(r.time || '').slice(0, 10);
        return code ? code + '@' + d : '';
      };
      out.batches.forEach((b) => {
        b.rows = (b.rows || []).filter((r) => {
          const k = dayKeyOf(r);
          if (!k) return true;             /* 没编号没队名 → 不能用去重规则，保留 */
          if (seen.has(k)) return false;   /* 前面批次已经有这一场 → 删掉重复 */
          seen.add(k);
          return true;
        });
      });
      out.batches = out.batches.filter((b) => (b.rows || []).length);
    }

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
        /* 【比分可以被纠正 · 用户 2026-10-19「明明是红了为什么黑」】
           以前这里是 if (r.score) return; —— 一旦存了比分就永远不改，
           结果中途快照 0:0 被永久锁死（周六028 罗马 vs 热那亚 实际主胜，页面一直判黑）。
           现在：0:0 / 0-0 当成「中途快照」，允许用后来的终场比分覆盖并重算判定；
           非 0:0 的比分仍然不覆盖（保护已经正确的历史记录）。 */
        if (r.score && String(r.score) !== '0:0') return;
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
            /* 判定走 recoHit（three 只中一个 / unbeaten 胜或平都算中），
               不能写 pick === actual —— 不败推荐的平局会被错判成黑。 */
            r.hit = recoHit(r, actual);
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

  /**
   * 【单场口径】的统计 —— 页面顶部「推荐串」战绩条用的就是这一份。
   *
   * ⚠️ 用户 2026-10-17 明确要求：红/黑【按单场判定】，不是按整串。
   *      原话「按单场判定（用户设计里每行是一场），不是按整串」。
   *   · red   = 已完场且推荐选项命中的【场次数】
   *   · black = 已完场且没中的【场次数】
   *   · rate  = red / (red + black)；一场都没结算 → null
   *             （页面显示 "—"，绝不用 0 冒充"算过了"）
   *   · unfinished    = 还没打完的【组数】—— 一批推荐里只要还有一场没结算
   *                     就算一组。用户原话：「还有 N 组没打完」。
   *   · pendingMatches = 还没打完的【场次数】（补充字段，方便排查 / 别处复用）
   * 整串口径仍然保留在 summarize() / verdictOf() 里，给「往期详情」用。
   */
  function matchStats(archive, opt) {
    const o = opt || {};
    const out = (archive && Array.isArray(archive.batches)) ? archive : emptyArchive();
    let red = 0, black = 0, pendingMatches = 0, pendingGroups = 0, rows = 0;
    /* 【同一场只算一次】用户 2026-10-18 反馈「抓取的数据不对」——
       根因：抓取每 5 分钟存一批，同一场比赛被重复记录（实测同一场出现 8 行、
       信心还各不相同）→ 这里全部累加，红黑数就虚高。
       现在按「编号+日期」（没编号就用「主队|客队+日期」）去重：
       一场只算一次，且按时间顺序取【最早】那次（那才是当时推给用户的；
       后面批次只是同一场的重复抓取，赔率变化不动结论）。 */
    const seen = new Set();
    const keyOf = (r) => (r.code ? String(r.code).trim() : (r.home || '') + '|' + (r.away || '')) + '@' + dayOf(r.time);
    out.batches.forEach((b) => {
      /* 【逐场窗口过滤】用户口径（2026-10-17 追加为 36 小时）：
         「推荐串前后24小时自动比对不要还没比赛结果的.
          只留下48小时内推荐过的结果（这里抓48小时的）」。
         以前只按【整批】丢（批次里只要有一场还在窗口内，整批都留下），
         于是批内超出窗口的那几场也会被算进红黑 —— 口径不严。
         现在逐场过滤：超窗口的场次既不算红黑、也不算"没打完"。
         （传 { ignoreWindow: true } 可以关掉过滤，调试/回看历史用。） */
      const list = (Array.isArray(b.rows) ? b.rows : [])
        .filter((r) => (o.ignoreWindow ? true : inWindow(r.time, o.now)))
        /* 【信心门槛】用户 2026-10-17：「推荐串战绩指信心大于等于58%的场次，
           低于58%的不算」—— 传 { min: 58 } 之后，历史里那些 <58% 的场次
           既不算红黑、也不算"没打完"，直接从口径里剔除。 */
        .filter((r) => (o.min == null ? true : (r.conf != null && r.conf >= o.min)));
      /* rows 在下面按【去重后】的场次累加（一行一场），这里不再加 list.length */
      let pend = 0;
      list.forEach((r) => {
        const k = keyOf(r);
        if (seen.has(k)) return;                 /* 同一场算过 → 跳过（去重） */
        seen.add(k);
        rows++;
        if (r.hit === true) red++;
        else if (r.hit === false) black++;
        else { pendingMatches++; pend++; }
      });
      if (pend > 0) pendingGroups++;
    });
    const decided = red + black;
    return {
      red, black,
      unfinished: pendingGroups,
      pendingGroups,
      pendingMatches,
      rows, batches: out.batches.length, decided,
      rate: decided ? +((red / decided) * 100).toFixed(1) : null,
      updated: out.updated || bjStamp()
    };
  }

  /** 汇总：红 / 黑 / 命中率（待定不算分母）——【整串口径】，给「往期详情」用 */
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
      '   回填终场比分与红黑。窗口：比赛时间前后 ' + RECO_KEEP_HOURS + ' 小时。\n' +
      '   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result\n' +
      '   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */\n' +
      'const JC_RECO_DATA = ' + JSON.stringify(body, null, 1) + ';\n';
  }

  /* ============================================================
     生成【统计 JSON】jc-reco-stats.json 的文本
     ------------------------------------------------------------
     为什么单独出一个 JSON（而不是让页面读 jc-reco-data.js）：
       · 页面是静态托管的（GitHub Pages），没有后端。
         jc-reco-data.js 是 <script> 全局，页面打开时才加载一次，
         「还有几组没打完」这类数字会一直停在构建那一刻。
       · 这个 JSON 由页面用 fetch 每 30 秒拉一次（带 ?t= 时间戳防缓存），
         拉到了就更新战绩条 → 不需要刷新页面。
       · ⚠️【零 localStorage / sessionStorage / cookie】：
            拉到的新数字只放在 JS 内存变量里，页面一关就没了。
     rate 字段口径：一律是【字符串】—— 还没有已结算的场次时是 "—"，
                    否则是保留 1 位小数的数字串（如 "66.7"）。
     ============================================================ */
  function renderStatsJson(stats, updatedAt) {
    const s = stats || {};
    const rateStr = (s.rate == null) ? '—' : Number(s.rate).toFixed(1);
    const body = {
      red: s.red || 0,
      black: s.black || 0,
      rate: rateStr,
      unfinished: s.unfinished || 0,      updated: updatedAt || s.updated || bjStamp(),
      /* —— 下面是给排查 / 别处复用的补充字段，页面只认上面五个 —— */
      rateNum: (s.rate == null) ? null : s.rate,
      decided: s.decided || 0,
      rows: s.rows || 0,
      batches: s.batches || 0,
      pendingMatches: s.pendingMatches || 0,
      source: 'jc-reco-data.js',
      note: '竞彩推荐串单场战绩（程序生成，勿手改）· 窗口：比赛时间前后 ' +
        RECO_KEEP_HOURS + ' 小时'
    };
    return JSON.stringify(body, null, 1) + '\n';
  }

  return {
    RECO_KEEP_HOURS, bjNow, bjParse, bjStamp,
    emptyArchive, rowKey, buildSnapshot, verdictOf, unbeatenSide, recoHit,
    mergeArchive, enrichArchive, inWindow, summarize, matchStats,
    visibleBatches, renderDataJs, renderStatsJson
  };
});
