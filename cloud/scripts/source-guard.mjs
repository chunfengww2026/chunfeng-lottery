/* ============================================================================
   数据源留痕断言 · 构建侧共用模块（4 个生成脚本共用；无密码层、零外部依赖）
   ----------------------------------------------------------------------------
   用户硬性要求（2026-10-17 两次强调）：
     「全页面不要有任何地方显示在哪里抓取的数据」
     「不要显示任何数据源接口是哪里接入的标明」
   判断的唯一标准：页面上有没有任何东西能让用户看出「数据是从哪来的」。

   用法（在生成脚本写文件【之前】调用）：
     import { assertNoSourceTrace, removeSourceWords } from './source-guard.mjs';
     const safe = removeSourceWords(html);
     assertNoSourceTrace(safe, '走势图.html');
     fs.writeFileSync(OUT, safe, 'utf8');

   两道网，都是【硬失败】（命中 → 打印命中内容 → exit 1，构建红）：
     ① 硬词（站名 / 域名 / 数据文件名）—— 扫【整个 HTML】：
        这些词只要出现在文件里，看源码的人就能顺着追到源头。
        ⚠️ 扫描时把词按空格拼出来再 split 还原（'500' + '.com'）——
           否则脚本自己的源码里就有这些词，一旦生成脚本被内嵌进页面
           （export-static.mjs 就是内嵌的），断言会把自己拦下来（假阳性）。
     ② 软词（数据源 / 数据来源 / 来源 / 来自 / 取自 / 接入 / 接口 / 抓取 / 爬 / API）
        —— 只扫【可见文本】。
        ⚠️【关键坑 · 同事踩过，这里也踩过】：不能整块丢掉 <script>！
           这 3 个页面的字有相当一部分是页内 JS 拼出来再塞进 DOM 的，
           整块丢掉等于什么都没扫（实测：往脚注塞「数据源见上」照样 exit 0）。
           正确做法 = 保留 <script> 里的【字符串字面量】，只去掉 JS 注释。
        · HTML 注释 / <style> 整块不算（用户看不到）
        · 标签属性不算（img 的 src / a 的 href 里的域名是事实，用户看不到 URL 文字）
          —— 但【写成文字显示/复制的外链】算：data-copy 之类会落到剪贴板。
        · 用户自己起的功能名先剔除再扫：数据检测报告 / 体育抓取 / 抓取人数
   ========================================================================== */

/* ---- 词表（按空格拼出来，避免本文件/生成脚本自身命中自己） ---- */
const HARD_WORDS = (
  '500' + '.com 500' + '网 500万 球探 titan0' + '07 7m 雷速 leisu yiqicai 一起彩 头条 ' +
  'toutiaoi' + 'mg 17ch' + 'dd ok' + 'ooo win0' + '07 bf_' + 'jc JcRes' + 'ult ' +
  'histo' + 'ry.js dra' + 'ws.js xysp-da' + 'ta.js xysp-jc-da' + 'ta.js arti' + 'cles-data.js ' +
  'exper' + 'ts-data.js jc-da' + 'ta.js jc-hist' + 'ory.js foot' + 'ball.js ' +
  'kjh-da' + 'ta.js saved-tick' + 'ets.js ga' + 'mes.js al' + 'go.js templ' + 'ates.js ' +
  'latest-dra' + 'ws.js hit-che' + 'ck.js data-sto' + 're.js expert-po' + 'ol.js ' +
  'jc-diverg' + 'ence.js jc-tit' + 'an.js jc-bi' + 'fa.js sport' + 'tery 245' + 'qq ' +
  /* ⚠️ 2026-10-17 加：成交额那一档的站名 / 产品名同样算"来源痕迹"
     （页面上的模块名用中性的「资金分布」，正文里连中文名也不许出现）。 */
  '必' + '发 Bet' + 'fair'
).split(/\s+/).filter(Boolean);

const SOFT_WORDS = '数据源 数据来源 数据来自 接口 接入 来自于 取自 来源 来自'
  .split(/\s+/).filter(Boolean);

/* 「抓取 / 爬」这类词很通用（"先抓取开奖数据" 只是操作说明，不是来源），
   所以带上下文判断：前后 30 字里出现来源类字眼才算命中。 */
const FETCH_WORDS = ['抓取', '爬取', '爬'];
const FETCH_CTX = /数据源|来源|站名|网站|网址|域名|文件|脚本|接口|\.js|http|500|球探|雷速|头条|一起彩|自动抓|抓取于/;

/* 用户自己起的功能名：命中了也放行（原话：那是功能名、必须保留） */
const ALLOW_CTX = ['数据检测报告', '体育抓取', '抓取人数'];

/* 会【当成文字显示 / 复制到剪贴板】的外链属性：这些算「看出来源」 */
const URL_TEXT_ATTRS = ['data-copy', 'data-url', 'data-link', 'data-href', 'data-domain'];

/* ---------------------------------------------------------------------------
   ① 可见文本 / 属性 分词
   返回 { texts: [{text,line}], attrs: [{name,value,line}] }
   ------------------------------------------------------------------------- */
function tokenize(html) {
  const texts = [];
  const attrs = [];
  let i = 0, line = 1;
  const n = html.length;
  const bump = (s) => { for (let k = 0; k < s.length; k++) if (s.charCodeAt(k) === 10) line++; };

  while (i < n) {
    const lt = html.indexOf('<', i);
    const text = html.slice(i, lt < 0 ? n : lt);
    if (text) { if (text.trim()) texts.push({ text, line }); bump(text); }
    if (lt < 0) break;

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt);
      const seg = html.slice(lt, end < 0 ? n : end + 3);
      bump(seg); i = end < 0 ? n : end + 3; continue;
    }
    /* 标签结束位置（跳过引号里的 '>'） */
    let j = lt, q = 0;
    while (j < n) {
      const c = html[j];
      if (q) { if (c === q) q = 0; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '>') break;
      j++;
    }
    const tagRaw = html.slice(lt, j + 1);
    const tagLine = line;
    bump(tagRaw);
    const lower = tagRaw.toLowerCase();
    const name = (lower.match(/^<\s*([a-z0-9-]+)/) || [])[1] || '';

    if (name === 'style' || name === 'textarea' || name === 'title') {
      const close = html.toLowerCase().indexOf('</' + name, j + 1);
      const seg = html.slice(j + 1, close < 0 ? n : close);
      bump(seg); i = close < 0 ? n : close; continue;
    }
    if (name === 'script') {
      const close = html.toLowerCase().indexOf('</script', j + 1);
      const code = html.slice(j + 1, close < 0 ? n : close);
      /* ⚠️ 保留字符串、只去 JS 注释（块注释 + 行注释；// 前面排除冒号，免得切掉 https://） */
      const stripped = code
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
      if (stripped.trim()) texts.push({ text: stripped, line: tagLine });
      bump(code);
      i = close < 0 ? n : close;
      continue;
    }
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(tagRaw))) {
      attrs.push({ name: m[1].toLowerCase(), value: m[3] !== undefined ? m[3] : m[4], line: tagLine });
    }
    i = j + 1;
  }
  return { texts, attrs };
}

/* 硬词扫描范围（精确划定，避免误杀，也避免假阴性）：
   ✅ 扫：【可见文本】+【<script> 字符串（已去注释）】+【<style> 内容（已去 CSS 注释）】
          +【会复制走的外链属性】
   ❌ 不扫：HTML 注释 / CSS 注释 / JS 注释（维护者看的，用户看不到；用户原话"注释/JS 变量名里的
           这些词（页面看不到，不算）"）、href/src 属性里的域名（用户原话"URL 在 src
           属性里没问题"）。
   词按空格拼出来再 split 还原，避免脚本自己的源码命中自己（假阳性）。
   额外：href/src 里的主机名单独列一份【报告】（不拦构建），方便人工看一眼。 */
export function findHardTraces(html) {
  const hits = [];
  const seen = new Set();
  const push = (kind, term, line, ctx) => {
    const key = kind + '|' + term + '|' + line;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ kind, term, line, ctx: String(ctx).replace(/\s+/g, ' ').trim() });
  };
  /* 先只留「可见文本 / script / style」，把 HTML 注释挖掉再扫 */
  const scoped = html.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(0) + '\n'.repeat((m.match(/\n/g) || []).length));
  const regions = visibleRegions(scoped);
  for (const r of regions) {
    for (const w of HARD_WORDS) {
      let idx = r.text.toLowerCase().indexOf(w.toLowerCase());
      while (idx >= 0) {
        push(r.kind, w, r.line + r.text.slice(0, idx).split('\n').length - 1, r.text.slice(Math.max(0, idx - 50), idx + w.length + 50));
        idx = r.text.toLowerCase().indexOf(w.toLowerCase(), idx + 1);
      }
    }
  }
  /* 会复制走 / 当文字显示的外链属性 */
  const attrRe = /(data-copy|data-url|data-link|data-href|data-domain)\s*=\s*"([^"]*)"/gi;
  let am;
  while ((am = attrRe.exec(html))) {
    for (const w of HARD_WORDS) {
      if (am[2].toLowerCase().includes(w.toLowerCase())) {
        push('文字外链属性', w, html.slice(0, am.index).split('\n').length, am[0].slice(0, 120));
      }
    }
  }
  return hits;
}

/* 取「用户能看到 / 会被执行」的区域：标签之间的文本、script/style 的内容。
   line 为区域内首行在整篇里的行号。 */
function visibleRegions(html) {
  const out = [];
  let i = 0, line = 1;
  const n = html.length;
  const bump = (s) => { for (let k = 0; k < s.length; k++) if (s.charCodeAt(k) === 10) line++; };
  while (i < n) {
    const lt = html.indexOf('<', i);
    const text = html.slice(i, lt < 0 ? n : lt);
    if (text) { if (text.trim()) out.push({ kind: '可见文本', text, line }); bump(text); }
    if (lt < 0) break;
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt);
      const seg = html.slice(lt, end < 0 ? n : end + 3);
      bump(seg); i = end < 0 ? n : end + 3; continue;
    }
    let j = lt, q = 0;
    while (j < n) {
      const c = html[j];
      if (q) { if (c === q) q = 0; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '>') break;
      j++;
    }
    const tagRaw = html.slice(lt, j + 1);
    const tagLine = line;
    bump(tagRaw);
    const name = ((tagRaw.toLowerCase().match(/^<\s*([a-z0-9-]+)/) || [])[1]) || '';
    if (name === 'script' || name === 'style') {
      const close = html.toLowerCase().indexOf('</' + name, j + 1);
      const code = html.slice(j + 1, close < 0 ? n : close);
      /* <script>：保留字符串字面量、只去 JS 注释（内嵌文件的行首注释里写着文件名，用户看不到）。
         <style>：CSS 注释同理 —— 是给开发者看的标记/设计说明，不是「用户看得到的东西」，
                  所以【扫描时】也先去注释，避免维护性注释把构建拦下来。
         ⚠️ 这里只是【扫描口径】；写出成品时 <style> 是【原样保留】的
            （见 removeSourceWords），标记（__TOC_EQH__ 等）会留在页面上。 */
      const stripped = name === 'script'
        ? code.replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) || []).length))
          .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
        : code.replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) || []).length));
      if (stripped.trim()) out.push({ kind: name === 'script' ? 'JS字符串' : '样式', text: stripped, line: tagLine });
      bump(code);
      i = close < 0 ? n : close;
      continue;
    }
    i = j + 1;
  }
  return out;
}

/* 软词：只扫【可见文本】+【会当文字显示的外链属性】 */
export function findSoftTraces(html) {
  const hits = [];
  const seen = new Set();
  const { texts, attrs } = tokenize(html);
  const push = (kind, term, line, ctx) => {
    const key = kind + '|' + term + '|' + line + '|' + String(ctx).slice(0, 60);
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ kind, term, line, ctx: String(ctx).replace(/\s+/g, ' ').trim() });
  };

  for (const block of texts) {
    const lines = block.text.split('\n');
    const isScript = /[;{}()]|function|var |let |const /.test(block.text) && block.text.length > 60;
    for (let li = 0; li < lines.length; li++) {
      const L = lines[li];
      const ln = block.line + li;
      for (const w of SOFT_WORDS) {
        let idx = L.indexOf(w);
        while (idx >= 0) {
          const ctx = L.slice(Math.max(0, idx - 60), idx + w.length + 60);
          if (!ALLOW_CTX.some(a => ctx.includes(a))) push(isScript ? '可见文本(JS字符串)' : '可见文本', w, ln, ctx);
          idx = L.indexOf(w, idx + 1);
        }
      }
      for (const w of FETCH_WORDS) {
        let idx = L.indexOf(w);
        while (idx >= 0) {
          const ctx = L.slice(Math.max(0, idx - 30), idx + w.length + 30);
          if (!ALLOW_CTX.some(a => ctx.includes(a)) && FETCH_CTX.test(ctx)) {
            push(isScript ? '可见文本(JS字符串)' : '可见文本', w, ln, ctx);
          }
          idx = L.indexOf(w, idx + 1);
        }
      }
      /* 单独的 API 三字母（词边界；中文里出现 API 也算） */
      const apiRe = /\bAPI\b/g;
      let am;
      while ((am = apiRe.exec(L))) {
        const ctx = L.slice(Math.max(0, am.index - 60), am.index + 63);
        if (!ALLOW_CTX.some(a => ctx.includes(a))) push('可见文本', 'API', ln, ctx);
      }
      /* 可见文本里裸着的 http(s) 网址 —— ⚠️ 只在【非脚本】文本块里算：
         <script> 里的 URL 是代码常量（SVG 命名空间、IP 探测接口清单…），
         用户看不到；而且我们特意保留 script 字符串是为了抓「JS 拼进 DOM 的字」，
         两者不能混为一谈（实测：把 script 里的 URL 也算上，会报出
         http://www.w3.org/2000/svg / https://api.ipify.org 这种假阳性）。 */
      if (!isScript) {
        const urlRe = /https?:\/\/[^\s"'<>）)】,，]+/g;
        let um;
        while ((um = urlRe.exec(L))) {
          push('可见URL', 'URL', ln, L.slice(Math.max(0, um.index - 60), um.index + um[0].length + 60));
        }
      }
    }
  }
  for (const a of attrs) {
    if (URL_TEXT_ATTRS.includes(a.name) && /^https?:\/\//i.test(String(a.value))) {
      push('文字外链属性', a.name, a.line, a.name + '="' + a.value + '"');
    }
  }
  return hits;
}

export function findSourceTraces(html) {
  return findHardTraces(html).concat(findSoftTraces(html));
}

/* 报告（不拦构建）：href/src 里出现的主机名 —— 走站外的图/链接都会列出来，
   方便人工看一眼「有没有哪个域名一看就知道数据是从哪来的」。
   图片走站外是事实，用户也明说 src 里的 URL 不显示文字就没问题，所以不拦。 */
export function listAttrHosts(html) {
  const hosts = {};
  const re = /\s(?:href|src|poster|data-src)\s*=\s*"(https?:\/\/[^"]*)"/gi;
  let m;
  while ((m = re.exec(html))) {
    try { const h = new URL(m[1]).host; hosts[h] = (hosts[h] || 0) + 1; } catch (e) {}
  }
  return hosts;
}

/* ---------------------------------------------------------------------------
   ② 中性化改写：把【可见文本】里的来源字样换成中性说法
   为什么需要：有些字样是【只读的依赖模块】在构建时吐出来的，不在允许改的
   文件清单里。实测：export-football.mjs 内嵌的 asian-index.js（只读）里
     missingText = '上盘真实资金占比暂无公开数据源，故不显示热度 / 爆冷推演'
   会写进竞彩页正文。这里在最后一道把这类词换成中性说法（语义不变）。
   只动【<script>】—— 去注释 + 中性化字符串里的来源字样。
   HTML 注释 / <style>（含里面的标记与设计说明）/ 标签属性一律原样保留。
   ------------------------------------------------------------------------- */
const NEUTRALIZE = [
  ['暂无公开数据源', '暂无公开数据'],
  ['没有公开数据源', '没有公开数据'],
  ['数据来源说明', '说明'],
  ['资金占比来源', '资金占比'],
  ['数据来源', '本页数据'],
  ['数据源', '数据'],
  ['取自', '收录'],
  ['爬取', '整理'],
  ['抓取', '整理'],
  ['来自', '出自'],
  ['来源', '出处'],
  /* ↓ 内嵌脚本的字符串里会写别的文件名；这些字会随 JS 拼进 DOM，页面上能看到。
       改成中性说法，语义不变（文件名本身对用户没有意义）。 */
  ['stats.js', '统计模块'],
  ['games.js', '规则表'],
  ['expert-pool.js', '专家池模块'],
  ['expert-pool', '专家池'],
  ['saved-tickets.js', '存档文件'],
  ['history-fallback', '开奖快照'],
  ['yiqicai', '本站'],
  ['一起彩', '本站'],
  /* ↓【晒票 / 文章标题】抓来的外站原文偶尔带品牌词（例：「快乐8的500万和双色球的500万」），
       会被硬词断言判成"看出来源"→ 整页构建失败（2026-10-20 实测被一条晒票标题拦下）。
       这里把它们换成【同义的中性说法】，语义不变、标题保留；
       注意：只收"一眼是品牌/站名"的词，不要收 7m / 17ch 这种可能出现在图片 URL 里的短串
       （URL 也在 <script> 字符串里，替换会把图片地址弄坏）。 */
  ['500万', '五百万'],
  ['500.com', '本站'],
  ['500网', '本站'],
  ['球探', '赛前'],
  ['雷速', '即时'],
  ['头条', '资讯'],
  ['titan007', ''],
  ['okooo', ''],
  ['sporttery', ''],
  ['Betfair', ''],
  ['必发', ''],
];

export function removeSourceWords(html) {
  const n = html.length;
  let i = 0, out = '', raw = '';
  const flush = () => { if (raw) { out += neutralText(raw); raw = ''; } };

  while (i < n) {
    const lt = html.indexOf('<', i);
    const text = html.slice(i, lt < 0 ? n : lt);
    if (text) raw += text;
    if (lt < 0) break;
    if (html.startsWith('<!--', lt)) {
      flush();
      const end = html.indexOf('-->', lt);
      const seg = html.slice(lt, end < 0 ? n : end + 3);
      out += seg; i = end < 0 ? n : end + 3; continue;
    }
    let j = lt, q = 0;
    while (j < n) {
      const c = html[j];
      if (q) { if (c === q) q = 0; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '>') break;
      j++;
    }
    const tagRaw = html.slice(lt, j + 1);
    const lower = tagRaw.toLowerCase();
    const name = (lower.match(/^<\s*([a-z0-9-]+)/) || [])[1] || '';
    const keepWhole = (name === 'script' || name === 'style' || name === 'textarea' || name === 'title');
    flush();
    out += tagRaw;
    if (keepWhole) {
      const close = html.toLowerCase().indexOf('</' + name, j + 1);
      const seg = html.slice(j + 1, close < 0 ? n : close);
      /* <script> 里的注释收拾一遍：
         分享页把 stats.js / history.js / latest-draws.js 整文件内嵌，
         这些文件的行首注释里写着文件名，硬词扫全文件会命中。
         去注释 + 顺手中性化字符串里的来源字样（⚠️ 这个行为【不变】，别削弱）。
         <style>：【原样保留】—— 里面的注释是标记 + 设计说明
         （__TOC_EQH__ / __LAYOUT__ / __COMPACT2__ / __LIGHT_THEME__ / __COLOR_UNIFY__），
         剥掉等于把标记一起弄丢；它也不是"给用户看的文案"。
         扫描时（findHardTraces → visibleRegions）会先去掉 CSS 注释，
         所以「保留注释」不会让断言变松。 */
      out += (name === 'script')
        ? neutralText(stripJsComments(seg), false)   /* 去注释 + 中性化来源字样 */
        : seg;                                        /* style：一字不动 */
      i = close < 0 ? n : close;
      continue;
    }
    i = j + 1;
  }
  flush();
  return out;
}

/* 把 JS 里的【注释】整段去掉，字符串/模板里的内容原样保留。
   为什么要这样做：分享页把 stats.js / history.js / latest-draws.js 整文件内嵌，
   注释里写着别的文件名和「数据来源：xxx」。硬词扫全文件会命中；
   而注释用户看不到，本来就不该算 —— 去掉注释后断言才是「扫给人看的东西」。
   ⚠️ 必须带状态机：字符串 / 模板 / 正则里的 // 和 星号斜杠 不是注释，
      按行粗暴删会把代码删坏（实测踩过：注释里带引号的行会把状态搞乱）。
   不碰正则字面量的内容，只用「上一个非空白字符」判断 / 是不是正则开头。 */
function stripJsComments(code) {
  const n = code.length;
  let out = '';
  let i = 0;
  let last = '';                 // 上一个非空白字符（判断正则 vs 除法）
  const REGEX_OK = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

  while (i < n) {
    const c = code[i], d = code[i + 1];

    if (c === '/' && d === '/') {
      const e = code.indexOf('\n', i);
      i = e < 0 ? n : e;                 // 保留换行，行号对得上
      continue;
    }
    if (c === '/' && d === '*') {
      const e = code.indexOf('*/', i + 2);
      const seg = code.slice(i, e < 0 ? n : e + 2);
      const nl = (seg.match(/\n/g) || []).length;
      i = e < 0 ? n : e + 2;
      out += '\n'.repeat(nl);            // 用换行补齐，保持行号
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === q) { j++; break; }
        j++;
      }
      out += code.slice(i, j);
      last = q;
      i = j;
      continue;
    }
    if (c === '/' && REGEX_OK.has(last)) {
      /* 正则字面量：扫到未转义的 / 结束（不处理字符类，够用） */
      let j = i + 1, inClass = false;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === '[') inClass = true;
        else if (code[j] === ']') inClass = false;
        else if (code[j] === '/' && !inClass) { j++; break; }
        else if (code[j] === '\n') break;
        j++;
      }
      out += code.slice(i, j);
      last = '/';
      i = j;
      continue;
    }
    out += c;
    if (!/\s/.test(c)) last = c;
    i++;
  }
  return out;
}

function neutralText(s, collapseSpace = true) {
  let t = s;
  for (const [from, to] of NEUTRALIZE) {
    let idx = t.indexOf(from);
    while (idx >= 0) {
      t = t.slice(0, idx) + to + t.slice(idx + from.length);
      idx = t.indexOf(from, idx + to.length);
    }
  }
  /* 脚本里的字符串不能压缩空白（会影响 JS 字符串内容），只在纯文本里压缩 */
  return collapseSpace ? t.replace(/[ \t]{2,}/g, ' ') : t;
}

/* ---------------------------------------------------------------------------
   ③ 断言：命中就 exit 1
   opts.selfTestInsert：自测用 —— 先往 HTML 里塞一个违禁词，断言必须拦住。
   ------------------------------------------------------------------------- */
export function assertNoSourceTrace(html, label, opts = {}) {
  let target = html;
  if (opts.selfTestInsert) {
    /* ⚠️ 不能插在【首个】</body> 前：成品页（只读分享版.html）里第一条 </body>
       出现在 HTML 注释的设计说明里，插进去等于写进注释 —— 注释按设计不算命中
       → 自测会【假通过】（实测踩过）。追加到文档末尾，保证落在【可见文本】区。 */
    target = html + '<div class="kg-selftest">' + opts.selfTestInsert + '</div>';
    console.log('   🧪 自测：故意塞入「' + opts.selfTestInsert + '」，断言【必须】拦住');
  }
  const hits = findSourceTraces(target);
  if (!hits.length) {
    console.log('   ✅ 留痕断言：' + (label || '页面') + ' 没有出现"数据从哪来"的字样（硬词扫可见文本/JS字符串/样式 · 软词扫可见文本）');
    const hosts = listAttrHosts(target);
    const keys = Object.keys(hosts);
    if (keys.length) {
      console.log('   ⓘ 站外主机名（仅报告 · href/src 属性里的域名用户看不到文字，不算命中）：'
        + keys.map(k => k + '×' + hosts[k]).join(' · '));
    }
    return true;
  }
  console.error('❌【数据源留痕断言】' + (label || '页面') + ' 里出现了「数据从哪来」的字样 —— 构建失败。');
  console.error('   用户硬性要求：页面上不能看出数据是从哪个网站 / 接口 / 文件来的。');
  for (const h of hits.slice(0, 40)) {
    console.error('   [' + h.kind + '] ' + h.term + '  L' + h.line + '  …' + h.ctx + '…');
  }
  if (hits.length > 40) console.error('   …（共 ' + hits.length + ' 处，只列前 40 处）');
  console.error('   改法：把生成脚本里对应的可见文案改成中性说法（例如「本页数据」），');
  console.error('         或者把出现位置挪进 HTML 注释 / JS 注释里（注释不算可见文本）。');
  process.exit(1);
}

export const SOURCE_GUARD_VERSION = '1.0.0';
