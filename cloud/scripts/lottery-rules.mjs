/* ============================================================
   lottery-rules.mjs —— 【彩种规则 · 唯一真源】
   ------------------------------------------------------------
   这一份表回答一个问题：**每个彩种有哪些号码区、每区的号码范围、每期出几个 /
   玩法默认选几个**。项目里原本散着 5 份近似表，改一处漏一处：

     1. build-trend.mjs      TREND_GAMES      （lo/hi/pick，走势图用）
     2. ocr-tickets.mjs      GAME_SPEC        （front/back 个数 + max，OCR 认票用）
     3. ticket-store.js      areaRangeOf      （[min,max]，摇号/推荐用）
     4. data-store.js        materialAreaRange（[min,max] —— 第 3 份的复印件！）
     5. data-store.js        materialAreaSpec （区名/关键词）

   ⚠️ 本文件是【纯 ESM，无副作用、不读文件、不碰 DOM】，供 .mjs 直接 import。
      扩展名必须是 .mjs：项目根 package.json 里没有 "type":"module"，
      叫 .js 的话 Node 会先按 CommonJS 解析失败、再重解析成 ESM
      （功能能用，但每次 import 都打一条 MODULE_TYPELESS_PACKAGE_JSON warning）。
   ⚠️ 浏览器脚本（ticket-store.js / data-store.js）不能 import —— 但分享页是
      export-static.mjs 生成的，那边本来就用 vm + readFileSync 把 asian-index.js
      内联进页面；需要时用同一招把这份表内联成全局即可，
      既不用改回 .js，也不用动页面里 <script> 的顺序。
   ⚠️ 新文件必须加进 cloud/sync-cloud.mjs 的 CODE_MODULES，
      否则云端 build 找不到模块直接报错（那份清单是白名单，不是通配）。
   ============================================================ */

/* ---------- 权威规则 ----------
   字段说明（每条都是对着 60 期真实开奖 + 体彩/福彩官方规则核过的）：
     name        中文名
     areas[]     号码区，顺序 = 主区、副区；字段：
                   key     history.js / jc-data 里的区键（red/blue/front/back/main/special）
                   label   页面上显示的中文区名
                   min/max 号码取值范围（⚠️ 位型彩种从 0 开始，选号型从 1 开始）
                   pick    玩法默认选几个 / 位型就是位数
                   opens   每期官方【开出】几个号（选号型里 pick ≠ opens 的只有快乐8）
                   noRepeat 区内是否不允许重复（选号型 true；位型 false）
     positional  是否【按位】的彩种（3D/排列3/排列5/七星彩：012 与 210 是两张票）
     flat        == 用户给的扁平写法红/蓝对照（redMax/blueMax/redDefault/blueDefault），
                 见文件末尾 buildFlat()，只做兼容展示，别拿它当计算依据。
   ------------------------------------------------------------ */
export const LOTTERY_SPEC = {
  ssq: {
    name: '双色球', gameNo: 'ssq',
    areas: [
      { key: 'red',  label: '红球', min: 1, max: 33, pick: 6, opens: 6, noRepeat: true },
      { key: 'blue', label: '蓝球', min: 1, max: 16, pick: 1, opens: 1, noRepeat: true }
    ],
    positional: false
  },
  dlt: {
    name: '大乐透', gameNo: 'dlt',
    areas: [
      { key: 'front', label: '前区', min: 1, max: 35, pick: 5, opens: 5, noRepeat: true },
      { key: 'back',  label: '后区', min: 1, max: 12, pick: 2, opens: 2, noRepeat: true }
    ],
    positional: false
  },
  /* ⚠️ 七乐彩有【特别号】：基本号 7 个 + 特别号 1 个（都是 1~30）。
      用户原表 blueMax:0 / blueDefault:0 把特别号整个漏掉了。 */
  qlc: {
    name: '七乐彩', gameNo: 'qlc',
    areas: [
      { key: 'main',    label: '基本号', min: 1, max: 30, pick: 7, opens: 7, noRepeat: true },
      { key: 'special', label: '特别号', min: 1, max: 30, pick: 1, opens: 1, noRepeat: true }
    ],
    positional: false
  },
  /* ⚠️ 七星彩是【6+1】不是「7 个 0~9」：
      前 6 位每位 0~9，第 7 位 0~14（体彩官方规则；history.js 也是这个口径）。
      用户原表写成 redMax:9 / redDefault:7，会把第 7 位错当成 0~9。 */
  qxc: {
    name: '七星彩', gameNo: 'qxc',
    areas: [
      { key: 'front', label: '前6位', min: 0, max: 9,  pick: 6, opens: 6, noRepeat: false },
      { key: 'back',  label: '第7位', min: 0, max: 14, pick: 1, opens: 1, noRepeat: false }
    ],
    positional: true
  },
  /* ⚠️ 快乐8：官方每期【开 20 个】(1~80)，而玩法是「选一 ~ 选十」。
      用户原表把它写成 redDefault:10 —— 那是「选十」这个玩法的选号数，
      【不是】每期开奖个数。这两个数混成一个字段是这份表最容易踩的坑，
      所以这里 pick（玩法默认）和 opens（每期开出）分开写。 */
  kl8: {
    name: '快乐8', gameNo: 'kl8',
    areas: [{ key: 'main', label: '号码', min: 1, max: 80, pick: 10, opens: 20, noRepeat: true }],
    positional: false,
    playLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]   /* 选一~选十，默认取 10 = 选十 */
  },
  fc3d: {
    name: '福彩3D', gameNo: 'fc3d',
    areas: [{ key: 'main', label: '号码', min: 0, max: 9, pick: 3, opens: 3, noRepeat: false }],
    positional: true
  },
  pl3: {
    name: '排列3', gameNo: 'pl3',
    areas: [{ key: 'main', label: '号码', min: 0, max: 9, pick: 3, opens: 3, noRepeat: false }],
    positional: true
  },
  pl5: {
    name: '排列5', gameNo: 'pl5',
    areas: [{ key: 'main', label: '号码', min: 0, max: 9, pick: 5, opens: 5, noRepeat: false }],
    positional: true
  }
};

/* ---------- 别名 ----------
   ⚠️ 项目历史遗留两套键：用户表写 3d / qx，项目脚本写 fc3d / qxc。
     两个都留，正名 = 项目在用的那个（fc3d / qxc），别名指回正名。
     LOTTERY_RULES 里两个键都能取到【同一个对象】，所以不会漂移。 */
export const ALIASES = { '3d': 'fc3d', qx: 'qxc' };

/** 把 id（含别名）归一成正名；认不出来返回 null */
export function canonId(id) {
  const k = String(id == null ? '' : id).trim();
  if (!k) return null;
  if (LOTTERY_SPEC[k]) return k;
  const a = ALIASES[k];
  return a && LOTTERY_SPEC[a] ? a : null;
}

/** 扁平写法（用户原表那套字段名），只做兼容/展示 —— 计算请用 areas */
function buildFlat(spec) {
  const a0 = spec.areas[0];
  const a1 = spec.areas[1];
  return {
    name: spec.name,
    redMax: a0 ? a0.max : 0,
    blueMax: a1 ? a1.max : 0,
    redDefault: a0 ? a0.pick : 0,
    blueDefault: a1 ? a1.pick : 0,
    blueFixed: true
  };
}

/* LOTTERY_RULES[id] = 规则 + 扁平兼容字段；别名键指向同一对象 */
export const LOTTERY_RULES = (() => {
  const out = {};
  for (const id of Object.keys(LOTTERY_SPEC)) {
    out[id] = Object.freeze({ id, ...LOTTERY_SPEC[id], ...buildFlat(LOTTERY_SPEC[id]) });
  }
  for (const [alias, id] of Object.entries(ALIASES)) out[alias] = out[id];
  return Object.freeze(out);
})();

export const GAME_IDS = Object.keys(LOTTERY_SPEC);
export const ALL_IDS = Object.keys(LOTTERY_RULES);

/* ---------- 取值助手（都要能容忍别名 + 野生 id） ---------- */

/** 规则对象；认不出来返回 null */
export function ruleOf(id) {
  const k = canonId(id);
  return k ? LOTTERY_RULES[k] : null;
}

/** 号码区列表（[{key,label,min,max,pick,opens,noRepeat}]），认不出来返回 [] */
export function areasOf(id) {
  const r = ruleOf(id);
  return r ? r.areas : [];
}

/** 单区范围 [min, max]；认不出来返回 null（⚠️ 不要像旧代码那样兜底成 [1,33]） */
export function areaRange(id, areaKey) {
  const a = areasOf(id).filter((x) => x.key === areaKey)[0];
  return a ? [a.min, a.max] : null;
}

/** 区中文名，取不到就用 key */
export function areaLabel(id, areaKey) {
  const a = areasOf(id).filter((x) => x.key === areaKey)[0];
  return a ? a.label : String(areaKey || '');
}

/** 玩法默认选号数：{ red: 6, blue: 1 } / { main: 3 } */
export function pickCounts(id) {
  const out = {};
  areasOf(id).forEach((a) => { out[a.key] = a.pick; });
  return out;
}

/** 每期开奖个数：{ red: 6, blue: 1 } / { main: 20 } */
export function openCounts(id) {
  const out = {};
  areasOf(id).forEach((a) => { out[a.key] = a.opens; });
  return out;
}

export function isPositional(id) {
  const r = ruleOf(id);
  return !!(r && r.positional);
}

/** 号码区总数上界之和（复式/全包注数上限用） */
export function ballCount(id) {
  return areasOf(id).reduce((n, a) => n + (a.max - a.min + 1), 0);
}

/** 校验一组号码是否符合该彩种该区规则 —— 返回 { ok, why } */
export function validateArea(id, areaKey, nums) {
  const a = areasOf(id).filter((x) => x.key === areaKey)[0];
  if (!a) return { ok: false, why: `未知号码区 ${id}.${areaKey}` };
  const list = (Array.isArray(nums) ? nums : []).map(Number);
  for (const n of list) {
    if (!Number.isInteger(n)) return { ok: false, why: `不是整数：${n}` };
    if (n < a.min || n > a.max) return { ok: false, why: `${n} 超出 ${a.label} 范围 ${a.min}~${a.max}` };
  }
  if (a.noRepeat && new Set(list).size !== list.length) {
    return { ok: false, why: `${a.label} 不允许重复号` };
  }
  if (list.length !== a.pick) {
    return { ok: false, why: `${a.label} 要 ${a.pick} 个，实际 ${list.length} 个` };
  }
  return { ok: true, why: '' };
}

/* ============================================================
   怎么接（按风险从低到高；接之前先跑 _verify_lottery_rules.mjs 对真数据）
   ------------------------------------------------------------
   · build-trend.mjs（ESM，可直接 import）：
       import { GAME_IDS, areasOf, isPositional } from './lottery-rules.mjs';
       TREND_GAMES 由它派生 → 走势图输出的 HTML 必须逐字节不变。
       ⚠️ TREND_GAMES.pick 是【每期画几个号】= 本表的 opens，不是 pick
          （唯一不同的是快乐8：走势图画 20 个，玩法默认选 10 个）。
   · ocr-tickets.mjs（ESM，可直接 import）：
       GAME_SPEC 由 pickCounts/areaRange 派生（原表只覆盖 ssq/dlt）。
   · ticket-store.js / data-store.js（浏览器 <script>，不能 import）：
       ⚠️ 别为了复用去改页面的 <script> 顺序 —— export-static.mjs 生成页面时
          用 vm + readFileSync 把这份表内联成全局即可（asian-index.js 就是这么做的），
          但 export-static.mjs 是另一个窗口正在改的文件，动手前先商量。
   ============================================================ */
