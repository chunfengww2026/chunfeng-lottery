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

  /* 【踢完了没有】开赛 → 结束 ≈ +2 小时（90 分钟 + 中场 + 补时）。
     和 build-jc.mjs / export-football.mjs / build-football-results.mjs
     的 MATCH_LEN_HOURS 是同一个数，别单独改。 */
  const MATCH_LEN_HOURS = 2;

  /** 这一场是不是【已经踢完】了（开赛 + 2 小时 ≤ 现在）。
   *  时间解析不出来 → 当成踢完了（不拦，宁可让它按老办法纠正）。 */
  function isFinished(timeStr, now) {
    const t = bjParse(timeStr);
    if (!isFinite(t)) return true;
    const base = bjParse(bjStamp(now)) || Date.now();
    return base - t >= MATCH_LEN_HOURS * 3600 * 1000;
  }

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

    /* ============================================================
       【终场比分从哪儿来】—— 判定「这一行的比分对不对」的唯一依据
       ------------------------------------------------------------
       ① opt.results（可选）：调用方直接传 jc-results.js 的完场页
          （list 数组，或整个 { updated, list } 都行）→ 用它的 ft 终场比分。
       ② 没传就用 settled（jc-history）：它【已经被 build-football-results.mjs
          用同一张完场页（jc-results.js）纠正过】——那个脚本排在
          jc-reco-build.mjs 之前（cloud-build.mjs 的【3b】步），所以这里拿到的
          score 就是终场比分，不是比赛进行中的快照。
       ⚠️ 两条路都【找不到这一场】时就返回 null → 那一行原样保留，绝不猜、绝不改。
       ============================================================ */
    const resList = Array.isArray(o.results) ? o.results
      : (o.results && Array.isArray(o.results.list) ? o.results.list : []);
    const byRes = new Map();
    const shiftDay = (d, n) => {
      const t = bjParse(d + ' 00:00');
      if (!isFinite(t)) return '';
      const x = new Date(t + n * 86400000);
      const p = (v) => (v < 10 ? '0' + v : String(v));
      return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
    };
    resList.forEach((x) => {
      if (!x || !x.ft || !x.home || !x.away) return;
      const d = dayOf(x.date || x.time);
      if (!d) return;
      const k = x.home + '|' + x.away + '@' + d;
      if (!byRes.has(k)) byRes.set(k, x);          /* 同一场多条 → 取第一条 */
    });

    /** '2-1' / '2:1' / {h,a} / '2:1(半 1:0)' → '2:1'；取不到就 '' */
    function normScore(v) {
      if (v == null) return '';
      if (typeof v === 'object') {
        const h = +v.h, a = +v.a;
        return (isFinite(h) && isFinite(a)) ? h + ':' + a : '';
      }
      const m = /(\d{1,2})\s*[:\-比]\s*(\d{1,2})/.exec(String(v));
      return m ? (+m[1]) + ':' + (+m[2]) : '';
    }

    /**
     * 找这一行的【终场比分】。返回 { score:'2:1', ht:{h,a}|null } 或 null。
     * 顺序：opt.results 的完场页 → settled（jc-history）；都找不到 → null。
     */
    function finalOf(r) {
      const d = dayOf(r.time);
      if (!d) return null;
      /* ⓪ 【500 完场比分 · 用户 2026-10-19「足球比赛结果实时抓取 www.500.com」】
         jc-scores.js（JC_SCORES = { "主|客": "2:0" }）优先用，因为它是按 <tr> 行解析出来的终场比分，
         实测罗马 vs 热那亚 = 2:0（源站的 0:0 是半场）。
         两个方向都认（500 的主客顺序可能和竞彩相反）。 */
      try {
        if (typeof JC_SCORES !== 'undefined' && JC_SCORES && JC_SCORES.map && r.home && r.away) {
          const v = JC_SCORES.map[r.home + '|' + r.away] || JC_SCORES.map[r.away + '|' + r.home];
          if (v && /^\d{1,2}:\d{1,2}$/.test(v)) return { score: v, ht: null };
        }
      } catch (e) { }
      /* ① 完场页（jc-results.js）—— 只认「日期 ±1 天 且 主客队都对上」的 */
      if (byRes.size && r.home && r.away) {
        for (const dd of [0, -1, 1]) {
          const key = r.home + '|' + r.away + '@' + (dd === 0 ? d : shiftDay(d, dd));
          const hit = byRes.get(key);
          if (!hit) continue;
          const s = normScore(hit.ft);
          if (s) return { score: s, ht: hit.ht || null };
        }
      }
      /* ② jc-history（已被 jc-results 的终场纠正过） */
      let m = null;
      if (r.code && byCode.has(r.code + '@' + d)) m = byCode.get(r.code + '@' + d);
      else if (r.home && r.away && byPair.has(r.home + '|' + r.away + '@' + d)) {
        m = byPair.get(r.home + '|' + r.away + '@' + d);
      }
      if (!m) return null;
      const s = normScore(m.score);
      return s ? { score: s, ht: m.ht || null } : null;
    }

    let filled = 0, changed = 0, refixed = 0;
    out.batches.forEach((b) => {
      (b.rows || []).forEach((r) => {
        /* ============================================================
           【比分纠正 · 用户 2026-10-19「明明是红了为什么黑」】
           ------------------------------------------------------------
           原版：只有存的是 0:0 快照才允许被终场比分覆盖
                 （if (r.score && String(r.score) !== '0:0') return;）。
           问题：归档那一刻球还没踢完 → jc-data 里的【活比分】被冻成「终场」，
                 而且错得不止 0:0（实测 9 场：4 场等于半场比分、5 场是进行中快照，
                 例：拜仁存档 2:0、实际终场 6:1）→ 这些永远纠正不了。
           现在：【只要和终场比分不一致就重算】——
                 · score   改成终场比分
                 · hit/result 用终场比分 + recoHit() 重新判（不败推荐不会被错判）
                 · 半场比分（如果这一行带了 ht / htScore）一起刷新
                 · 批次 verdict / hit / miss / pending 跟着重算
           ⚠️【真的 0:0 不会被误判】判据是「和终场比分是否一致」，不是「是不是 0:0」：
              终场 0:0 而存档 0:0 → 一致 → 直接跳过，一个字都不改。
           ⚠️【找不到这场就不动】finalOf() 返回 null（完场页和历史里都没有）→ 原样保留。
           ⚠️【球没踢完不算终场】开赛不到 2 小时 → 拿到的比分可能是进行中的快照，
              一律不覆盖（这正是「冻错」的根因）；已经踢完的才纠正。
           ============================================================ */
        if (!isFinished(r.time, o.now)) return;
        const fin = finalOf(r);
        if (!fin) return;                              /* 找不到这场 → 保持原样 */
        const realScore = fin.score;
        const had = normScore(r.score) || String(r.score == null ? '' : r.score).trim();
        const scoreSame = (had === realScore);         /* 已经和终场一致（含真的 0:0）*/
        const hadHit = (typeof r.hit === 'boolean');   /* 红黑已经算过了吗 */
        /* 比分一样、红黑也已经算过 → 真的什么都不用做（真的 0:0 走的就是这条）*/
        if (scoreSame && hadHit) return;

        if (!scoreSame) {
          r.score = realScore;
          if (fin.ht) {
            /* 存档行目前【没有】半场字段（buildSnapshot 不存它），
               以后若加上 r.ht / r.htScore，这里会跟终场一起刷新。 */
            const hts = fin.ht.h + ':' + fin.ht.a;
            if (r.ht != null && String(r.ht) !== hts) r.ht = hts;
            if (r.htScore != null && String(r.htScore) !== hts) r.htScore = hts;
          }
        }
        /* 红黑【永远用终场比分 + recoHit() 重算】——
           不沿用 jc-history 里那个可能是旧口径算出来的 hit。 */
        if (r.pick) {
          const sp = realScore.split(':');
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
        if (!scoreSame && had) refixed++;              /* 原来有比分但错了 → 纠正了一处 */
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

    /* filled  = 本次写入/纠正了几场（老字段名，jc-reco-build 的日志在用）
       refixed = 其中【原来是错的、这次被纠正】的场次（新增，含 0:0 快照和非 0:0 快照）
       changed = 有任何字段变化（含批次 verdict 变化 / 窗口丢弃）*/
    out.updated = bjStamp(o.now);
    return { archive: out, filled, refixed, changed, dropped };
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
