// ============================================================
//  probe-schedules.mjs —— 足球「比赛场次」候选源探测
//
//  干什么：对一批候选 URL 做【纯 HTTP】抓取（不用浏览器），打印
//      HTTP 状态码 · 响应字节数 · 编码 · 解析出的比赛行数
//      · 未开赛 / 进行中 / 已完场 三态各有几场
//  用途：确认哪些源【在云端（美国 IP）】能抓到「未开赛/进行中/已完场」。
//        sporttery.cn（中国竞彩网）对美国 IP 返 567，不能用。
//
//  用法：
//    node probe-schedules.mjs                # 人看的表
//    node probe-schedules.mjs --json a.json  # 同时写一份 JSON
//    node probe-schedules.mjs --only 500     # 只测名字含 500 的源
//
//  ⚠️ 只读探测：不写项目数据文件、不碰任何 .js 数据、不归档。
// ============================================================

import fs from 'node:fs';
import { TextDecoder } from 'node:util';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const TIMEOUT = 25000;

/* ------------------------------------------------------------
   候选源。kind：
     500     = live.500.com 的比分表（<tr id="aNNNN" ... status="N">）
     500row  = 同站点但行里没有 status，状态要读单元格文字（完 / 中 / -）
     json    = 直接返回 JSON 的接口
     html    = 普通门户页，只统计"像比赛行"的信号
   ------------------------------------------------------------ */
/* 北京日期（YYYY-MM-DD），{BJ0}=北京今天 {BJ1}=北京明天 —— 500 的期次参数用它 */
function bjDate(offsetDays = 0, base = Date.now()) {
  const d = new Date(base + 8 * 3600 * 1000 + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

const SOURCES = [
  /* ---- A. 500.com 比分家族（同域名已被云端验证可用：wanchang.php 在用） ---- */
  { name: '500 竞彩当天', url: 'https://live.500.com/', kind: '500', note: '竞彩在售+进行中+当天完场' },
  { name: '500 竞彩期次(北京今天)', url: 'https://live.500.com/jczq.php?e={BJ0}', kind: '500', note: '按日期取竞彩期（含竞彩编号）' },
  { name: '500 竞彩期次(北京明天)', url: 'https://live.500.com/jczq.php?e={BJ1}', kind: '500', note: '明天那期 = 未开赛名单（可替代体彩官方在售）' },
  { name: '500 完整版', url: 'https://live.500.com/2h1.php', kind: '500', note: '全部赛事（三态都在这页）' },
  { name: '500 单场比分', url: 'https://live.500.com/zqdc.php', kind: '500', note: '单场/滚球' },
  { name: '500 足彩', url: 'https://live.500.com/zucai.php', kind: '500', note: '足彩 14 场' },
  { name: '500 完场', url: 'https://live.500.com/wanchang.php', kind: '500row', note: '已完场（项目在用）' },
  { name: '500 未来赛事', url: 'https://live.500.com/weekfixture.php', kind: '500row', note: '未开赛' },

  /* ---- B. 用户/上级点名要测的 ---- */
  { name: '500 赔率', url: 'https://odds.500.com/', kind: 'html', note: '赔率' },
  { name: '500 主站', url: 'https://www.500.com/', kind: 'html', note: '竞彩' },
  { name: '懂球帝', url: 'https://www.dongqiudi.com/', kind: 'html', note: '赛程' },
  { name: '直播吧', url: 'https://www.zhibo8.com/', kind: 'html', note: '直播' },
  { name: '直播吧cc', url: 'https://www.zhibo8.cc/', kind: 'html', note: '直播' },
  { name: '新浪体育', url: 'https://sports.sina.com.cn/', kind: 'html', note: '门户' },
  { name: '虎扑足球', url: 'https://soccer.hupu.com/', kind: 'html', note: '比赛页' },

  /* ---- C. 额外候选（便宜、值得一试） ---- */
  { name: '球探比分', url: 'https://bf.titan007.com/football/', kind: 'html', note: '比分（本机 403）' },
  { name: '雷速', url: 'https://www.leisu.com/', kind: 'html', note: '比分' },
  { name: '7m', url: 'https://data.7m.com.cn/', kind: 'html', note: '比分' },
  { name: '245qq 走地API', url: 'https://new-jiko.sukeku.com/api/Game/GetRunballList?lang=zh', kind: 'json', note: '进行中（update-football-live 在用）' },
  { name: '体彩官方 sporttery', url: 'https://webapi.sporttery.cn/gateway/jc/football/getMatchCalculatorV1.qry?poolCode=hhad,had&channel=c', kind: 'json', note: '对照：云端已知 567' },
];

/* 500 比分表里的 status 属性 → 三态
   实测（2026-10-21 03:30 本机）：0=未开赛 1=上半场 2=中场 3=下半场 4=完场
   6/9=腰斩·推迟·取消之类，单独归 other */
const ST = { 0: 'up', 1: 'live', 2: 'live', 3: 'live', 4: 'fin' };

function decodeBody(buf, contentType, html) {
  const head = Buffer.from(buf.slice(0, 2048)).toString('latin1');
  const m = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType || '') || /charset\s*=\s*["']?([\w-]+)/i.exec(head);
  const cs = (m ? m[1] : '').toLowerCase();
  const useGbk = /gb2312|gbk|gb18030/.test(cs);
  try {
    return { text: new TextDecoder(useGbk ? 'gbk' : 'utf-8').decode(buf), charset: useGbk ? 'gbk' : 'utf-8' };
  } catch {
    return { text: buf.toString('utf8'), charset: 'utf-8(fallback)' };
  }
}

/* 把一页 500 比分表切成「比赛行」并判三态 */
function parse500(text, kind) {
  const out = { rows: [], heads: 0 };
  const re = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = re.exec(text))) {
    const attrs = m[1];
    const body = m[2];
    const idm = /\bid="a(\d+)"/.exec(attrs);
    const fidm = /\bfid="(\d+)"/.exec(attrs) || /detail\.php\?fid=(\d+)/.exec(body) || /stat-(\d+)\.shtml/.exec(body);
    if (!idm && !fidm) continue;                    /* 表头 / 广告行 */
    const fid = fidm ? fidm[1] : (idm ? idm[1] : '');
    const stm = /\bstatus="(-?\d+)"/.exec(attrs);
    let state = null;
    if (stm) {
      state = ST[stm[1]] || 'other';
    } else {
      /* 单元格文字兜底：完 / 中 / 上 / 下 / 进行中 / 分钟 ' */
      const cells = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
      if (/完/.test(cells)) state = 'fin';
      else if (/中\s|中$|进行中|上半场|下半场/.test(cells) || /\d{1,3}\s*'/.test(cells)) state = 'live';
      else state = 'up';
    }
    const t = /\b(\d{2}-\d{2})\s+(\d{2}:\d{2})\b/.exec(body);
    const teams = [...body.matchAll(/liansai\.500\.com\/team\/\d+\/?"[^>]*>([^<]{1,24})</g)].map((x) => x[1].trim());
    const code = /name="check_id\[\]"[^>]*\/>\s*([^<\s]{2,12})/.exec(body);
    out.rows.push({
      fid, state, time: t ? t[1] + ' ' + t[2] : '', code: code ? code[1].trim() : '',
      home: teams[0] || '', away: teams[1] || '',
    });
    if (kind === '500' && out.rows.length > 600) break;
  }
  return out;
}

function parseJson(text) {
  try {
    const j = JSON.parse(text);
    return { ok: true, shape: Array.isArray(j) ? 'array' : typeof j, len: JSON.stringify(j).length };
  } catch {
    return { ok: false, shape: 'not-json' };
  }
}

function genericSignals(text) {
  const times = (text.match(/\b\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}\b/g) || []).length;
  const vs = (text.match(/\bvs\b|VS/g) || []).length;
  const kw = {};
  for (const k of ['未开赛', '未开', '进行中', '中场', '上半场', '下半场', '完场', '已完', 'FT', 'HT']) {
    const c = text.split(k).length - 1;
    if (c) kw[k] = c;
  }
  return { times, vs, kw };
}

async function probe(src) {
  const t0 = Date.now();
  const url = src.url.replace(/\{BJ0\}/g, bjDate(0)).replace(/\{BJ1\}/g, bjDate(1));
  const res = { name: src.name, url, note: src.note, ok: false, status: 0, bytes: 0, charset: '', ms: 0, err: '' };
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT),
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: url.startsWith('https://live.500.com') ? 'https://www.500.com/' : url,
      },
    });
    res.status = r.status;
    const buf = Buffer.from(await r.arrayBuffer());
    res.bytes = buf.length;
    res.finalUrl = r.url;
    const { text, charset } = decodeBody(buf, r.headers.get('content-type'), '');
    res.charset = charset;
    res.ok = r.ok;

    if (src.kind === 'json') {
      const j = parseJson(text);
      res.json = j;
      /* 走地 API：数组里的场次数 = 进行中 */
      if (j.ok) {
        try {
          const obj = JSON.parse(text);
          const arr = Array.isArray(obj) ? obj
            : (obj.data && (Array.isArray(obj.data) ? obj.data : obj.data.list)) || obj.list || [];
          if (Array.isArray(arr) && arr.length) {
            res.rows = arr.length;
            res.up = 0; res.live = arr.length; res.fin = 0;
          }
        } catch { /* 形状不认识就不猜 */ }
      }
    } else if (src.kind === '500' || src.kind === '500row') {
      const p = parse500(text, src.kind);
      res.rows = p.rows.length;
      res.up = p.rows.filter((x) => x.state === 'up').length;
      res.live = p.rows.filter((x) => x.state === 'live').length;
      res.fin = p.rows.filter((x) => x.state === 'fin').length;
      res.other = p.rows.filter((x) => x.state === 'other').length;
      res.codes = p.rows.filter((x) => x.code).length;
      res.sample = p.rows.slice(0, 2);
    } else {
      res.sig = genericSignals(text);
      res.rows = res.sig.times >= 5 ? res.sig.times : 0;   /* 只做"像不像比赛列表"的粗判 */
    }
  } catch (e) {
    res.err = (e && (e.name + ': ' + e.message)) || String(e);
  }
  res.ms = Date.now() - t0;
  return res;
}

function verdict(r) {
  if (r.err) return 'ERR ' + r.err.slice(0, 46);
  if (r.status !== 200) return 'HTTP ' + r.status;
  const up = r.up || 0, live = r.live || 0, fin = r.fin || 0;
  if (!r.rows) return '无比赛列表';
  if (up && live && fin) return '★三态齐全';
  const got = [up ? '未开' : '', live ? '进行中' : '', fin ? '完场' : ''].filter(Boolean).join('+');
  return got ? got + '（不全）' : '有行但判不出态';
}

const argv = process.argv.slice(2);
const jsonArg = (() => { const i = argv.indexOf('--json'); return i >= 0 ? argv[i + 1] : ''; })();
const onlyArg = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1] : ''; })();

const targets = onlyArg ? SOURCES.filter((s) => s.name.toLowerCase().includes(onlyArg.toLowerCase())) : SOURCES;

console.log('============================================================');
console.log(' 赛程源探测 probe-schedules.mjs');
console.log(' 时间(UTC) ' + new Date().toISOString() + ' · 时间(本机) ' + new Date().toLocaleString('zh-CN'));
console.log(' 出口 IP ' + (await (async () => {
  for (const u of ['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com']) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(9000) });
      if (r.ok) return (await r.text()).trim().slice(0, 40);
    } catch { /* 换下一个 */ }
  }
  return '取不到';
})()));
console.log('============================================================');

const results = [];
for (const s of targets) {
  const r = await probe(s);
  results.push(r);
  const extra = r.rows ? ` 行=${r.rows}${r.codes ? ` 竞彩编号=${r.codes}` : ''}` : '';
  const tri = r.rows && (r.up !== undefined)
    ? ` 未开=${r.up} 进行=${r.live} 完场=${r.fin}${r.other ? ' 其他=' + r.other : ''}`
    : '';
  console.log(`\n[${r.name}] ${r.url}`);
  console.log(`   ${r.status || '-'} ${r.bytes}B ${r.charset} ${r.ms}ms${extra}${tri}`);
  if (r.sig) console.log(`   时间标记=${r.sig.times} vs=${r.sig.vs} 关键词=${JSON.stringify(r.sig.kw)}`);
  if (r.json) console.log(`   JSON=${JSON.stringify(r.json)}`);
  if (r.sample) for (const x of r.sample) console.log(`   样例 fid=${x.fid} ${x.state} ${x.time} ${x.code || ''} ${x.home} vs ${x.away}`);
  console.log('   → ' + verdict(r));
}

/* ---------- 汇总 ---------- */
const good = results.filter((r) => !r.err && r.status === 200 && r.rows > 0);
const tri = good.filter((r) => r.up > 0 && r.live > 0 && r.fin > 0);
console.log('\n============================================================');
console.log(` 汇总：能抓到的 ${good.length}/${results.length} 个  三态齐全 ${tri.length} 个`);
for (const r of good) console.log(`   ✔ ${r.name}  行=${r.rows} 未开=${r.up ?? '?'} 进行=${r.live ?? '?'} 完场=${r.fin ?? '?'}`);
console.log(' ★三态齐全：' + (tri.map((r) => r.name + ' <' + r.url + '>').join(' · ') || '（没有）'));
console.log('============================================================');

if (jsonArg) {
  const payload = { at: new Date().toISOString(), results: results.map((r) => ({
    name: r.name, url: r.url, note: r.note, status: r.status, bytes: r.bytes, ms: r.ms,
    ok: r.ok, err: r.err, rows: r.rows, up: r.up, live: r.live, fin: r.fin, other: r.other, codes: r.codes,
    charset: r.charset, verdict: verdict(r), sig: r.sig, json: r.json, sample: r.sample,
  })) };
  fs.writeFileSync(jsonArg, JSON.stringify(payload, null, 1), 'utf8');
  console.log(' JSON 已写 ' + jsonArg);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = ['## 赛程源探测', '', '| 源 | 状态 | 行数 | 未开 | 进行中 | 完场 | 判定 |', '|---|---|---|---|---|---|---|'];
  for (const r of results) {
    lines.push(`| ${r.name} | ${r.status || '-'} | ${r.rows ?? '-'} | ${r.up ?? '-'} | ${r.live ?? '-'} | ${r.fin ?? '-'} | ${verdict(r)} |`);
  }
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n', 'utf8');
}

/* 探测本身不做门槛判断：有源能用是信息，不是失败 */
process.exit(0);
