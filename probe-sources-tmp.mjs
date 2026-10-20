/* ============================================================
   probe-sources.mjs —— 探测「足球竞彩晒票 / 实票」候选源
   ------------------------------------------------------------
   要解决的问题：m.33633.cn/jingcai/ 本机 200，云端（美国 IP）405（阿里云 WAF）。
   本轮目标：找一个【云端也抓得到】的晒票源，或者证明 33633 有可绕过的路子。

   每行输出：HTTP 状态 · KB · <img> 数 · 图链数 · 关键词命中
             · 第一张图能不能下（状态/类型/大小）
   再加：33633 的各种「换 UA / 换协议 / 换代理」变体实验结果。

   只用 node 自带 fetch（node 18+）。云端跑：node probe-sources.mjs
   ============================================================ */

const UA_M = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const UA_GOOGLE = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const UA_BAIDU = 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)';

const q = encodeURIComponent;

const SOURCES = [
  /* ---------- ① 33633（现用源）+ 各种变体 ---------- */
  { g: 'A 33633', n: 'm.33633 竞彩(mobileUA)', u: 'https://m.33633.cn/jingcai/', ua: UA_M },
  { g: 'A 33633', n: 'm.33633 竞彩(pcUA)', u: 'https://m.33633.cn/jingcai/', ua: UA_PC },
  { g: 'A 33633', n: 'm.33633 竞彩(Googlebot)', u: 'https://m.33633.cn/jingcai/', ua: UA_GOOGLE },
  { g: 'A 33633', n: 'm.33633 竞彩(Baiduspider)', u: 'https://m.33633.cn/jingcai/', ua: UA_BAIDU },
  { g: 'A 33633', n: 'm.33633 竞彩(http 明文)', u: 'http://m.33633.cn/jingcai/', ua: UA_M },
  { g: 'A 33633', n: 'm.33633 竞彩?sort=0', u: 'https://m.33633.cn/jingcai?sort=0', ua: UA_M },
  { g: 'A 33633', n: 'm.33633 首页', u: 'https://m.33633.cn/', ua: UA_M },
  { g: 'A 33633', n: 'm.33633 详情页', u: 'https://m.33633.cn/topic/2436480.html', ua: UA_M },
  { g: 'A 33633', n: 'www.33633 竞彩', u: 'https://www.33633.cn/jingcai/', ua: UA_PC },
  { g: 'A 33633', n: 'static.33633 静态', u: 'https://static.33633.cn/m33633/js/home/jingcai.js', ua: UA_M },

  /* ---------- ② 33633 的图床（页面能抓还不够，图也得能下） ---------- */
  { g: 'B 图床', n: 'imgbcw.cpyc.cn', u: 'https://imgbcw.cpyc.cn/CustomFiles/Files/Web/2023-01-16/202301161644508298.png', ua: UA_M, imgOnly: true },
  { g: 'B 图床', n: 'img33633.cpyc.cn', u: 'https://img33633.cpyc.cn/', ua: UA_M },
  { g: 'B 图床', n: 'img02.17chdd.com', u: 'http://img02.17chdd.com/2026-10-21/242f5363-474c-4beb-be1f-0255d69829f81792514514873.jpg', ua: UA_M, imgOnly: true },

  /* ---------- ③ 代理 / 第三方抓取（绕 WAF 的备选路，不是"源"） ---------- */
  { g: 'C 代理', n: 'jina→33633', u: 'https://r.jina.ai/https://m.33633.cn/jingcai/', ua: UA_PC },
  { g: 'C 代理', n: 'allorigins→33633', u: 'https://api.allorigins.win/raw?url=' + q('https://m.33633.cn/jingcai/'), ua: UA_PC },
  { g: 'C 代理', n: 'codetabs→33633', u: 'https://api.codetabs.com/v1/proxy?quest=' + q('https://m.33633.cn/jingcai/'), ua: UA_PC },
  { g: 'C 代理', n: 'corsproxy.io→33633', u: 'https://corsproxy.io/?url=' + q('https://m.33633.cn/jingcai/'), ua: UA_PC },
  { g: 'C 代理', n: 'microlink→33633', u: 'https://api.microlink.io/?url=' + q('https://m.33633.cn/jingcai/'), ua: UA_PC },

  /* ---------- ④ 一起彩（已知云端能抓，看有没有竞彩晒票页） ---------- */
  { g: 'D 一起彩', n: 'm.yiqicai/xysp/jcxysp', u: 'https://m.yiqicai.com/xysp/jcxysp', ua: UA_M },
  { g: 'D 一起彩', n: 'm.yiqicai/xysp/ssqxysp', u: 'https://m.yiqicai.com/xysp/ssqxysp', ua: UA_M },
  { g: 'D 一起彩', n: 'm.yiqicai 首页', u: 'https://m.yiqicai.com/', ua: UA_M, links: /竞彩|晒票|jingcai/ },

  /* ---------- ⑤ 500 系 ---------- */
  { g: 'E 500', n: 'www.500 首页', u: 'https://www.500.com/', ua: UA_PC, links: /晒票|实票|竞彩/ },
  { g: 'E 500', n: 'bbs.500 论坛', u: 'https://bbs.500.com/', ua: UA_PC, links: /晒票|实票|竞彩/ },
  { g: 'E 500', n: 'zx.500 竞彩足球', u: 'https://zx.500.com/jczq/', ua: UA_PC, links: /晒票|实票/ },

  /* ---------- ⑥ 官方 / 门户 ---------- */
  { g: 'F 门户', n: 'sporttery 竞彩网', u: 'https://www.sporttery.cn/', ua: UA_PC },
  { g: 'F 门户', n: 'zhcw 中彩网', u: 'https://www.zhcw.com/', ua: UA_PC },
  { g: 'F 门户', n: '新浪彩票', u: 'https://lottery.sina.com.cn/', ua: UA_PC },
  { g: 'F 门户', n: '彩宝贝 cbb', u: 'https://www.cbb.cn/', ua: UA_PC },
  { g: 'F 门户', n: '彩经网', u: 'https://www.cjcp.com.cn/', ua: UA_PC },

  /* ---------- ⑦ 社区 / 搜索 ---------- */
  { g: 'G UGC', n: '贴吧·竞彩足球', u: 'https://tieba.baidu.com/f?kw=' + q('竞彩足球'), ua: UA_PC },
  { g: 'G UGC', n: '微博搜·竞彩晒票', u: 'https://m.weibo.cn/api/container/getIndex?containerid=' + q('100103type=1&q=竞彩晒票') + '&page_type=searchall', ua: UA_M },
  { g: 'G UGC', n: '微博搜·竞彩实票', u: 'https://m.weibo.cn/api/container/getIndex?containerid=' + q('100103type=1&q=竞彩实票') + '&page_type=searchall', ua: UA_M },
  { g: 'G UGC', n: 'hupu 首页', u: 'https://bbs.hupu.com/', ua: UA_PC },
  { g: 'G UGC', n: '245qq 足球', u: 'https://m.245qq.com/', ua: UA_M, links: /晒票|实票|竞彩/ },
  { g: 'G UGC', n: 'sukeku 足球', u: 'https://new-jiko.sukeku.com/', ua: UA_M },
  { g: 'G UGC', n: 'bing 图搜·竞彩实票', u: 'https://www.bing.com/images/search?q=' + q('竞彩实票'), ua: UA_PC },
  { g: 'G UGC', n: 'baidu·竞彩晒票', u: 'https://www.baidu.com/s?wd=' + q('竞彩晒票'), ua: UA_PC },
];

const KW = ['晒票', '实票', '竞彩', '票面'];

function decode(buf, ct) {
  const utf8 = buf.toString('utf8');
  if (utf8.indexOf('\ufffd') >= 0 || /charset=["']?(gb2312|gbk)/i.test(ct || '')) {
    try { return new TextDecoder('gbk').decode(buf); } catch { return utf8; }
  }
  return utf8;
}
function absUrl(src, base) {
  try { return new URL(src.replace(/&amp;/g, '&'), base).toString(); } catch { return ''; }
}
async function imgTest(url, referer, ua) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': ua, 'Referer': referer, 'Accept': 'image/*,*/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const buf = await r.arrayBuffer();
    return `图 ${r.status} ${(r.headers.get('content-type') || '?').split(';')[0]} ${Math.round(buf.byteLength / 1024)}KB`;
  } catch (e) { return `图 FAIL ${e.name === 'TimeoutError' ? '超时' : String(e.message).slice(0, 26)}`; }
}

async function probe(s) {
  const out = { name: s.n, group: s.g };
  const headers = {
    'User-Agent': s.ua || UA_M,
    'Accept': s.imgOnly ? 'image/*,*/*;q=0.8' : 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };
  if (/33633/.test(s.u)) headers['Referer'] = 'https://m.33633.cn/';
  let html = '';
  try {
    const r = await fetch(s.u, { headers, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    out.status = r.status;
    out.ct = (r.headers.get('content-type') || '').split(';')[0];
    const buf = Buffer.from(await r.arrayBuffer());
    out.bytes = buf.byteLength;
    html = decode(buf, r.headers.get('content-type'));
  } catch (e) {
    out.err = e.name === 'TimeoutError' ? '超时' : String(e.message).slice(0, 40);
    return out;
  }
  if (s.imgOnly) { out.imgTest = `图 ${out.status} ${out.ct} ${Math.round(out.bytes / 1024)}KB`; return out; }

  out.imgs = (html.match(/<img\b/gi) || []).length;
  out.imgLinks = (html.match(/https?:\/\/[^"'\s)\\]+\.(?:jpg|jpeg|png|webp)/gi) || []).length;
  out.kw = KW.map((k) => k + ':' + (html.split(k).length - 1)).join(' ');
  out.json = /^\s*[{[]/.test(html.slice(0, 1));

  let first = '';
  if (out.json) {
    const m = /https?:\/\/[a-z0-9.]*(?:sinaimg|cpyc|17chdd|jiangduoduo)[a-z0-9.]*\/[^"'\\\s]+/i.exec(html) ||
      /https?:\/\/[^"'\\\s]+\.(?:jpg|jpeg|png|webp)[^"'\\\s]*/i.exec(html);
    if (m) first = m[0];
  } else {
    const re = /<img\b[^>]*?(?:data-src|data-original|data-lazy-src|src)\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html))) {
      const a = absUrl(m[1], s.u);
      if (/^https?:/i.test(a) && !/\.(gif|svg)(\?|$)/i.test(a)) { first = a; break; }
    }
  }
  out.first = first;
  if (first && out.status === 200) out.imgTest = await imgTest(first, s.u, s.ua || UA_M);

  if (s.links) {
    const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,60}?)<\/a>/gi;
    const seen = new Set(); const picked = [];
    let m;
    while ((m = re.exec(html)) && picked.length < 5) {
      const text = m[2].replace(/<[^>]+>/g, '').trim();
      const href = absUrl(m[1], s.u);
      if (!/^https?:/i.test(href) || seen.has(href)) continue;
      if (!s.links.test(text + ' ' + href)) continue;
      seen.add(href);
      picked.push(href + (text ? `  「${text.slice(0, 16)}」` : ''));
    }
    out.links = picked;
  }
  return out;
}

const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

async function main() {
  const t0 = Date.now();
  console.log('=== probe-sources · ' + new Date().toISOString() + ' · node ' + process.version + ' ===');
  const results = [];
  for (let i = 0; i < SOURCES.length; i += 4) {
    results.push(...await Promise.all(SOURCES.slice(i, i + 4).map(probe)));
  }
  let g = '';
  for (const r of results) {
    if (r.group !== g) { g = r.group; console.log('\n--- ' + g + ' ---'); }
    if (r.err) { console.log(`${pad(r.name, 24)} FAIL ${r.err}`); continue; }
    console.log(
      `${pad(r.name, 24)} HTTP ${pad(r.status, 3)} ${pad(Math.round((r.bytes || 0) / 1024) + 'KB', 7)}` +
      ` img=${pad(r.imgs ?? '-', 3)} 图链=${pad(r.imgLinks ?? '-', 3)} · ${r.kw || r.ct}` +
      (r.imgTest ? ' · ' + r.imgTest : '')
    );
    for (const l of r.links || []) console.log('     ↘ ' + l.slice(0, 120));
    if (r.first) console.log('     🖼 ' + r.first.slice(0, 120));
  }

  const ok = results.filter((r) => r.status === 200 && r.kw && /晒票:[1-9]|实票:[1-9]/.test(r.kw) && (r.imgLinks || 0) > 0);
  console.log('\n=== 小结（HTTP 200 + 有晒票/实票字样 + 有图链）===');
  if (!ok.length) console.log('  （没有一个候选同时满足）');
  ok.forEach((r) => console.log('  ✅ ' + r.name + '  →  ' + SOURCES.find((s) => s.n === r.name).u));
  console.log(`共 ${results.length} 个候选 · 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
