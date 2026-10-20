/* ============================================================
   probe-sources.mjs —— 「足球竞彩晒票」云端可抓性探测（GitHub Actions 美国 IP）
   ------------------------------------------------------------
   已知：m.33633.cn/jingcai/ 本机 200（IIS/ASP.NET），云端 405。
   本脚本分四段：
     1) 候选源清单（各站晒票页）→ 状态/图数/关键词/首图可下载性
     2) 33633 绕 WAF 的所有路子：405 响应头、XFF、翻译跳板、CORS 代理、Wayback
     3) Bing 索引能不能替我们提供 topic 列表 / cpyc 票面图
     4) 其它没试过的站（p.33633.cn / 8300 / jqdi / 微博正文检查）
   只用 node 自带 fetch。云端跑：node probe-sources.mjs
   ============================================================ */

const UA_M = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const q = encodeURIComponent;
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

/* ================= 第 1 段：候选源 ================= */
const SOURCES = [
  { g: 'A 33633', n: 'm.33633 竞彩', u: 'https://m.33633.cn/jingcai/', ua: UA_M },
  { g: 'A 33633', n: 'm.33633 首页', u: 'https://m.33633.cn/', ua: UA_M },
  { g: 'B 一起彩', n: 'yiqicai/xysp/jcxysp', u: 'https://m.yiqicai.com/xysp/jcxysp', ua: UA_M },
  { g: 'B 一起彩', n: 'yiqicai/xysp/ssqxysp', u: 'https://m.yiqicai.com/xysp/ssqxysp', ua: UA_M },
  { g: 'C 500', n: 'www.500 首页', u: 'https://www.500.com/', ua: UA_PC },
  { g: 'C 500', n: 'zx.500 竞彩足球', u: 'https://zx.500.com/jczq/', ua: UA_PC },
  { g: 'D 门户', n: 'sporttery 竞彩网', u: 'https://www.sporttery.cn/', ua: UA_PC },
  { g: 'D 门户', n: 'zhcw 中彩网', u: 'https://www.zhcw.com/', ua: UA_PC },
  { g: 'D 门户', n: 'zgzcw 足彩网', u: 'https://www.zgzcw.com/', ua: UA_PC },
  { g: 'D 门户', n: '新浪彩票', u: 'https://lottery.sina.com.cn/', ua: UA_PC },
  { g: 'E UGC', n: '贴吧·竞彩足球', u: 'https://tieba.baidu.com/f?kw=' + q('竞彩足球'), ua: UA_PC },
  { g: 'E UGC', n: 'hupu 足球区', u: 'https://bbs.hupu.com/soccer', ua: UA_PC },
  { g: 'E UGC', n: 'zhibo8 首页', u: 'https://www.zhibo8.com/', ua: UA_PC },
  { g: 'E UGC', n: '懂球帝 首页', u: 'https://www.dongqiudi.com/', ua: UA_PC },
  { g: 'F 新候选', n: 'p.33633 首页', u: 'https://p.33633.cn/', ua: UA_PC },
  { g: 'F 新候选', n: 'p.33633 /jingcai/', u: 'https://p.33633.cn/jingcai/', ua: UA_PC },
  { g: 'F 新候选', n: 'jqdi 标签·实票', u: 'http://www.jqdi.cn/tags-67158.html', ua: UA_PC },
  { g: 'F 新候选', n: 'm.8300 首页', u: 'https://m.8300.cn/', ua: UA_M },
];

const KW = ['晒票', '实票', '竞彩', '足球', '票面'];

function decode(buf, ct) {
  const utf8 = buf.toString('utf8');
  if (utf8.indexOf('\ufffd') >= 0 || /charset=["']?(gb2312|gbk)/i.test(ct || '')) {
    try { return new TextDecoder('gbk').decode(buf); } catch { return utf8; }
  }
  return utf8;
}
const absUrl = (src, base) => { try { return new URL(src.replace(/&amp;/g, '&'), base).toString(); } catch { return ''; } };

async function imgTest(url, referer, ua) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': ua, 'Referer': referer, 'Accept': 'image/*,*/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    const b = await r.arrayBuffer();
    return `首图 ${r.status} ${(r.headers.get('content-type') || '?').split(';')[0]} ${Math.round(b.byteLength / 1024)}KB`;
  } catch (e) { return `首图 FAIL ${e.name === 'TimeoutError' ? '超时' : String(e.message).slice(0, 22)}`; }
}

async function probe(s) {
  const out = { name: s.n, group: s.g, url: s.u };
  const headers = { 'User-Agent': s.ua || UA_M, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' };
  if (/33633/.test(s.u)) headers['Referer'] = 'https://m.33633.cn/';
  let html = '';
  try {
    const r = await fetch(s.u, { headers, redirect: 'follow', signal: AbortSignal.timeout(18000) });
    out.status = r.status;
    out.server = r.headers.get('server') || '';
    const buf = Buffer.from(await r.arrayBuffer());
    out.kb = Math.round(buf.byteLength / 1024);
    html = decode(buf, r.headers.get('content-type'));
  } catch (e) { out.err = e.name === 'TimeoutError' ? '超时' : String(e.message).slice(0, 34); return out; }
  out.imgs = (html.match(/<img\b/gi) || []).length;
  out.imgLinks = (html.match(/https?:\/\/[^"'\s)\\]+\.(?:jpg|jpeg|png|webp)/gi) || []).length;
  out.kw = KW.map((k) => k + ':' + (html.split(k).length - 1)).join(' ');
  const m = /<img\b[^>]*?(?:data-src|data-original|src)\s*=\s*["']([^"']+)["']/i.exec(html);
  const first = m ? absUrl(m[1], s.u) : '';
  if (first && out.status === 200) out.imgTest = await imgTest(first, s.u, s.ua || UA_M);
  return out;
}

async function part1() {
  console.log('\n================ 第 1 段：候选源 ================');
  const res = [];
  for (let i = 0; i < SOURCES.length; i += 4) res.push(...await Promise.all(SOURCES.slice(i, i + 4).map(probe)));
  let g = '';
  for (const r of res) {
    if (r.group !== g) { g = r.group; console.log('\n-- ' + g + ' --'); }
    if (r.err) { console.log(`${pad(r.name, 20)} FAIL ${r.err}`); continue; }
    console.log(`${pad(r.name, 20)} HTTP ${pad(r.status, 3)} ${rpad(r.kb + 'KB', 7)} img=${pad(r.imgs, 3)} 图链=${pad(r.imgLinks, 3)} · ${r.kw}` + (r.imgTest ? ' · ' + r.imgTest : ''));
  }
  return res;
}

/* ================= 第 2 段：33633 绕 WAF ================= */
function hostInfo(txt) {
  const cpyc = (txt.match(/https?:\/\/img\d*\.cpyc\.cn\/[^"'\s)]+/gi) || []).length;
  const topics = (txt.match(/\/topic\/\d+\.html/gi) || []).length;
  return { cpyc, topics, jc: txt.split('竞彩').length - 1 };
}

async function part2() {
  console.log('\n================ 第 2 段：33633 绕 WAF ================');
  const T = 'https://m.33633.cn/jingcai/';

  /* 2.1 405 是谁发的 */
  try {
    const r = await fetch(T, { headers: { 'User-Agent': UA_M, 'Referer': 'https://m.33633.cn/' }, redirect: 'manual', signal: AbortSignal.timeout(18000) });
    const t = await r.text();
    console.log(`[405 诊断] status=${r.status} server=${r.headers.get('server')} via=${r.headers.get('via') || '-'} x-powered-by=${r.headers.get('x-powered-by') || '-'}`);
    const sc = r.headers.get('set-cookie');
    if (sc) console.log('  set-cookie: ' + sc.slice(0, 100));
    console.log('  body: ' + t.replace(/\s+/g, ' ').slice(0, 260));
  } catch (e) { console.log('[405 诊断] FAIL ' + e.message.slice(0, 40)); }

  /* 2.2 各种请求头伪装 */
  const hdrCases = [
    ['XFF 国内IP', { 'X-Forwarded-For': '223.5.5.5, 114.114.114.114', 'X-Real-IP': '223.5.5.5', 'Client-IP': '223.5.5.5' }],
    ['百度蜘蛛 UA', null],
    ['Cookie acw_tc 伪', { 'Cookie': 'acw_tc=276c5e4d17925213004584686e9bc1127ff319022c28ba3a46c6fe375aae9d' }],
    ['Forwarded 头', { 'Forwarded': 'for=223.5.5.5;proto=https' }],
  ];
  for (const [n, h] of hdrCases) {
    try {
      const ua = n.includes('蜘蛛') ? 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)' : UA_M;
      const r = await fetch(T, { headers: { 'User-Agent': ua, 'Referer': 'https://m.33633.cn/', ...(h || {}) }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      const t = await r.text();
      const hi = hostInfo(t);
      console.log(`${pad(n, 16)} HTTP ${r.status} ${rpad(Math.round(t.length / 1024) + 'KB', 6)} cpyc=${hi.cpyc} topic=${hi.topics} 竞彩=${hi.jc}`);
    } catch (e) { console.log(`${pad(n, 16)} FAIL ${e.message.slice(0, 30)}`); }
  }

  /* 2.3 翻译跳板 / CORS 代理 */
  const proxies = [
    ['r.jina.ai', 'https://r.jina.ai/' + T],
    ['allorigins', 'https://api.allorigins.win/raw?url=' + q(T)],
    ['codetabs', 'https://api.codetabs.com/v1/proxy?quest=' + q(T)],
    ['cors.lol', 'https://api.cors.lol/?url=' + q(T)],
    ['corsfix', 'https://proxy.corsfix.com/?' + T],
    ['yacdn', 'https://yacdn.org/proxy/' + T],
    ['thingproxy', 'https://thingproxy.freeboard.io/fetch/' + T],
    ['whateverorigin', 'http://www.whateverorigin.org/get?url=' + q(T)],
    ['googletranslate', 'https://m-33633-cn.translate.goog/jingcai/?_x_tr_sl=zh-CN&_x_tr_tl=en&_x_tr_hl=en'],
    ['baidu transpage', 'https://fanyi.baidu.com/transpage?query=' + q(T) + '&source=url&ie=utf8&from=zh&to=en&render=1'],
    ['bing translatetheweb', 'https://www.translatetheweb.com/?from=&to=en&a=' + q(T)],
  ];
  for (const [n, u] of proxies) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA_PC, 'Accept': '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(22000) });
      const t = await r.text();
      const hi = hostInfo(t);
      console.log(`${pad(n, 20)} HTTP ${pad(r.status, 3)} ${rpad(Math.round(t.length / 1024) + 'KB', 6)} cpyc=${hi.cpyc} topic=${hi.topics} 竞彩=${hi.jc}`);
    } catch (e) { console.log(`${pad(n, 20)} FAIL ${e.name === 'TimeoutError' ? '超时' : e.message.slice(0, 30)}`); }
  }

  /* 2.4 Wayback */
  try {
    const r = await fetch('https://web.archive.org/cdx/search/cdx?url=m.33633.cn/jingcai/&output=json&limit=-3&fl=timestamp,statuscode', { headers: { 'User-Agent': UA_PC }, signal: AbortSignal.timeout(20000) });
    console.log('wayback cdx: HTTP ' + r.status + ' ' + (await r.text()).replace(/\s+/g, ' ').slice(0, 200));
  } catch (e) { console.log('wayback cdx: FAIL ' + e.message.slice(0, 30)); }
}

/* ================= 第 3 段：Bing ================= */
async function part3() {
  console.log('\n================ 第 3 段：Bing 索引能不能兜底 ================');
  /* 3.1 图搜里有没有 cpyc.cn 的票面图（文件名带时间戳 → 能验新鲜度） */
  for (const s of ['牛票票 实票', 'site:cpyc.cn 竞彩', '竞彩实票 晒票']) {
    try {
      const r = await fetch('https://www.bing.com/images/search?q=' + q(s), { headers: { 'User-Agent': UA_PC, 'Accept-Language': 'zh-CN,zh;q=0.9' }, signal: AbortSignal.timeout(20000) });
      const t = await r.text();
      const murl = [...t.matchAll(/&quot;murl&quot;:&quot;([^&]+)&quot;/gi)].map((m) => decodeURIComponent(m[1]));
      const cpyc = murl.filter((u) => /cpyc\.cn/.test(u));
      const stamps = [...new Set(cpyc.map((u) => (/(\d{8})\d{6}/.exec(u) || [])[1]).filter(Boolean))].sort().slice(-3);
      console.log(`${pad(s, 16)} murl=${pad(murl.length, 3)} cpyc=${pad(cpyc.length, 3)} 最新日期=${stamps.join(',') || '-'}`);
      cpyc.slice(0, 2).forEach((u) => console.log('   ' + u.slice(0, 100)));
    } catch (e) { console.log(`${pad(s, 16)} FAIL ${e.message.slice(0, 26)}`); }
  }
  /* 3.2 文本搜 site:m.33633.cn */
  for (const [n, u] of [
    ['bing site:', 'https://www.bing.com/search?q=' + q('site:m.33633.cn') + '&count=30'],
    ['bing topic', 'https://www.bing.com/search?q=' + q('site:m.33633.cn/topic') + '&count=30'],
  ]) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA_PC, 'Accept-Language': 'zh-CN,zh;q=0.9' }, signal: AbortSignal.timeout(20000) });
      const t = await r.text();
      const ids = [...new Set([...t.matchAll(/topic\/(\d{6,9})/g)].map((m) => Number(m[1])))].sort((a, b) => b - a);
      console.log(`${pad(n, 12)} HTTP ${r.status} topic 命中=${ids.length} 最大 id=${ids[0] || '-'}`);
    } catch (e) { console.log(`${pad(n, 12)} FAIL ${e.message.slice(0, 26)}`); }
  }
}

/* ================= 第 4 段：其它 ================= */
async function part4() {
  console.log('\n================ 第 4 段：微博正文 / 其它 ================');
  for (const [n, u] of [
    ['weibo 搜索API', 'https://m.weibo.cn/api/container/getIndex?containerid=' + q('100103type=1&q=竞彩晒票') + '&page_type=searchall'],
    ['weibo 搜索HTML', 'https://s.weibo.com/weibo?q=' + q('竞彩晒票')],
  ]) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA_M, 'Accept': '*/*', 'Referer': 'https://m.weibo.cn/' }, redirect: 'follow', signal: AbortSignal.timeout(18000) });
      const t = await r.text();
      const imgs = (t.match(/https?:\/\/[a-z0-9.]*sinaimg\.cn\/[^"'\s]+/gi) || []).length;
      console.log(`${pad(n, 16)} HTTP ${r.status} ${Math.round(t.length / 1024)}KB 图=${imgs} 正文: ${t.replace(/\s+/g, ' ').slice(0, 120)}`);
    } catch (e) { console.log(`${pad(n, 16)} FAIL ${e.message.slice(0, 30)}`); }
  }
}

/* ================= 主流程 ================= */
const t0 = Date.now();
console.log('=== probe-sources · ' + new Date().toISOString() + ' · node ' + process.version + ' ===');
try {
  await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(10000) })
    .then((r) => r.text()).then((t) => console.log('出口 IP: ' + t));
} catch { console.log('出口 IP: 取不到'); }
await part1();
await part2();
await part3();
await part4();
console.log('\n=== 完 · ' + ((Date.now() - t0) / 1000).toFixed(1) + 's ===');
