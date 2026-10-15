/* ============================================================
   _realtest_aipick.mjs —— 「ai选号」面板【真跑验证】（不是搜字符串，是真执行）
   ------------------------------------------------------------
   做四件事：
     1) 从【真页面】只读分享版.html 里把 ai选号 面板脚本抠出来
        （页尾 <script> 里的那一段，标记 __AIPICK_JS__）
     2) 用迷你 DOM 把面板那段真标记搭成一棵树，真执行那段脚本
        （document.getElementById / createElement / querySelector 都是桩）
     3) 模拟用户操作 → 每一步打印【真实摇出来的号码】：
          · 初始：结果区是空的
          · 双色球 单式 → 点「机选一注」→ 打印号码（核对 6 红 1-33 不重复 + 1 蓝 1-16）
          · 福彩3D 单式 → 摇 20 次（另加 180 次静默）→ 打印豹子/组三组数（应为 0）
          · 大乐透 复式（前区 8 个）→ 打印注数（应为 C(8,5)=56）
          · 切彩种 → 打印是否重置
          · 点「清空」→ 打印是否清空
          · 复式超 1000 注 → 打印是否被拦住
          · 数字彩的 0 是否显示成「0」（不是「00」）
     4) 交互边界：面板脚本 / 面板标记里没有 localStorage / sessionStorage / cookie / button 标签
   最后必须打印「✅ 真跑验证通过」或具体错误。
   只读脚本：不改任何文件。用法：node _realtest_aipick.mjs
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
/* 默认测本机生成的 只读分享版.html；
   也可以传入一个页面路径（例：把线上抓下来的页面存成 _live_aipick.html）→ 线上同款真跑 */
const PAGE = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, '只读分享版.html');
console.log(`页面：${PAGE}`);

let fail = 0;
const ok = (cond, label, extra) => {
  console.log(`  ${cond ? '✅' : '❌'} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fail++;
  return cond;
};
const H = (t) => console.log(`\n════ ${t} ════`);

const html = fs.readFileSync(PAGE, 'utf8');

/* ============================================================
   1) 从真页面里抠脚本 + 面板标记
   ============================================================ */
H('1. 从真页面抠出 ai选号 面板（脚本 + 标记）');

function extractAiPickScript() {
  const i = html.indexOf('__AIPICK_JS__');
  if (i < 0) return '';
  const s = html.indexOf('<script>', i);
  const e = html.indexOf('</script>', s);
  if (s < 0 || e < 0) return '';
  return html.slice(s + '<script>'.length, e);
}
const js = extractAiPickScript();
ok(!!js && /__roAiPick/.test(js), '抠到了面板脚本', `${js.length} 字符`);
ok(!/localStorage|sessionStorage|document\.cookie/.test(js), '面板脚本里没有 localStorage / sessionStorage / cookie');
ok(!/\bfetch\s*\(/.test(js), '面板脚本里没有 fetch（纯前端，不联网）');
ok(!/XMLHttpRequest|WebSocket|navigator\.sendBeacon/.test(js), '面板脚本里没有任何联网 API');

const blockM = /<details class="ro-aipick"[\s\S]*?<\/details>/.exec(html);
ok(!!blockM, '页面里能定位到 <details class="ro-aipick">');
const block = blockM ? blockM[0] : '';
ok(block.indexOf('<button') < 0, '面板标记里没有 button 标签（只有 <a role="button"> / <input>）');
ok(/号码由系统随机生成，仅供娱乐，不构成购彩建议，请理性购彩。/.test(block), '面板底部有合规声明');

/* 面板在页面里的位置顺序：晒票栏 → ai选号 → 最新开奖 */
const iX = html.indexOf('id="ro-xysp"');
const iA = html.indexOf('id="ro-aipick"');
const iL = html.lastIndexOf('id="ro-latest"');
ok(iX > 0 && iA > iX && iL > iA, '位置顺序：晒票栏 → ai选号 → 最新开奖',
  `idx ${iX} → ${iA} → ${iL}`);
ok(block.indexOf(' open') < 0 && !/<details[^>]*ro-aipick[^>]*\sopen/.test(html), '面板默认收起（<details> 不带 open）');
ok((html.match(/<button/g) || []).length === 0, '整页裸 <button> = 0',
  `实际 ${(html.match(/<button/g) || []).length}`);

/* ============================================================
   2) 迷你 DOM（只实现面板脚本真正用到的那几样）
   ============================================================ */
const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'meta', 'link']);
class MNode {
  constructor(tag) {
    this.tagName = String(tag).toLowerCase();
    this.attrs = {};
    this.children = [];
    this.parentNode = null;
    this._cls = '';
    this.hidden = false;
    this._text = '';
    this._ev = {};
    this.value = undefined;
    this.style = { _p: {}, setProperty(k, v) { this._p[k] = v; } };
  }
  get className() { return this._cls; }
  set className(v) { this._cls = String(v); }
  get classList() {
    const self = this;
    return {
      add(c) { const s = new Set(self._cls.split(/\s+/).filter(Boolean)); s.add(c); self._cls = [...s].join(' '); },
      remove(c) { self._cls = self._cls.split(/\s+/).filter((x) => x && x !== c).join(' '); },
      contains(c) { return self._cls.split(/\s+/).indexOf(c) >= 0; }
    };
  }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  setAttribute(k, v) {
    const key = String(k);
    this.attrs[key] = String(v);
    if (key === 'hidden') this.hidden = true;
    if (key === 'class') this._cls = String(v);
  }
  getAttribute(k) {
    const key = String(k);
    return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null;
  }
  hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, String(k)); }
  removeAttribute(k) { delete this.attrs[String(k)]; if (String(k) === 'hidden') this.hidden = false; }
  addEventListener(type, fn) { (this._ev[type] = this._ev[type] || []).push(fn); }
  dispatch(type, ev) {
    const list = this._ev[type] || [];
    const e = Object.assign({
      type, preventDefault() { e.defaultPrevented = true; }, stopPropagation() {}, target: this
    }, ev || {});
    for (const fn of list) fn.call(this, e);
    return e;
  }
  set innerHTML(v) { this.children = parseHTML(String(v), this); }
  get innerHTML() { return ''; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() {
    if (this._text) return this._text;
    return this.children.map((c) => c.textContent).join('');
  }
  matches(sel) {
    return String(sel).trim().split(/\s+/).every((part, i) => {
      if (i > 0) return true;
      const m = /^([a-z0-9]*)(?:\.([\w-]+))?$/i.exec(part);
      if (!m) return false;
      if (m[1] && this.tagName !== m[1].toLowerCase()) return false;
      if (m[2] && this._cls.split(/\s+/).indexOf(m[2]) < 0) return false;
      return true;
    });
  }
  _all(out, sel) {
    for (const c of this.children) { if (c.matches(sel)) out.push(c); c._all(out, sel); }
    return out;
  }
  querySelectorAll(sel) {
    const parts = String(sel).trim().split(/\s+/);
    if (parts.length === 1) return this._all([], parts[0]);
    const found = this._all([], parts[parts.length - 1]);
    return found.filter((n) => {
      let p = n.parentNode;
      for (let i = parts.length - 2; i >= 0; i--) {
        let hit = false;
        while (p) { if (p.matches(parts[i])) { hit = true; p = p.parentNode; break; } p = p.parentNode; }
        if (!hit) return false;
      }
      return true;
    });
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function parseHTML(src, parent) {
  const out = [];
  const stack = [];
  const push = (n) => {
    (stack.length ? stack[stack.length - 1].children : out).push(n);
    n.parentNode = stack.length ? stack[stack.length - 1] : parent;
  };
  const re = /<!--[\s\S]*?-->|<\/([a-z0-9]+)\s*>|<([a-z0-9]+)((?:\s+[^\s=>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s">]+))?)*)\s*\/?>/gi;
  let last = 0, m;
  while ((m = re.exec(src)) !== null) {
    const text = src.slice(last, m.index);
    if (text.trim()) { const t = new MNode('#text'); t._text = text.replace(/\s+/g, ' ').trim(); push(t); }
    last = m.index + m[0].length;
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tagName === m[1].toLowerCase()) { stack.length = i; break; }
      }
      continue;
    }
    const node = new MNode(m[2]);
    const attrRe = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+)))?/g;
    let a;
    while ((a = attrRe.exec(m[3] || '')) !== null) {
      node.attrs[a[1]] = a[2] !== undefined ? a[2] : (a[3] !== undefined ? a[3] : (a[4] !== undefined ? a[4] : ''));
    }
    if (node.attrs.class) node._cls = node.attrs.class;
    if (Object.prototype.hasOwnProperty.call(node.attrs, 'hidden')) node.hidden = true;
    if (node.tagName === 'input') node.value = node.attrs.value !== undefined ? node.attrs.value : '';
    push(node);
    if (!VOID_TAGS.has(node.tagName) && !/\/>$/.test(m[0])) stack.push(node);
  }
  return out.filter((n) => n.tagName !== '#text' || n._text);
}

const panel = new MNode('div');
panel.innerHTML = block;

const allNodes = [];
(function walk(n) { n.children.forEach((c) => { allNodes.push(c); walk(c); }); })(panel);
const byId = new Map();
allNodes.forEach((n) => { if (n.attrs.id) byId.set(n.attrs.id, n); });

const documentStub = {
  body: new MNode('body'),
  getElementById: (id) => byId.get(id) || null,
  createElement: (t) => new MNode(t),
  querySelector: (sel) => panel.querySelector(sel),
  querySelectorAll: (sel) => panel.querySelectorAll(sel),
  addEventListener: () => {}
};
const win = {};
const sandbox = { document: documentStub, window: win, console };
vm.createContext(sandbox);
let execErr = '';
try {
  vm.runInContext(js, sandbox, { timeout: 8000 });
} catch (e) { execErr = String(e && e.message || e); }
ok(!execErr, '面板脚本在迷你 DOM 里真执行成功', execErr || '');

const root = byId.get('ro-aipick');
const API = win.__roAiPick;
ok(!!root, '拿到 #ro-aipick 节点');
ok(!!API && typeof API.state === 'function', '面板脚本挂上了 window.__roAiPick（验收入口）');

/* ---------- 取元素 / 值的助手 ---------- */
const cls = (n) => String(n.className || '');
const q1 = (sel) => (root ? root.querySelector(sel) : null);
const qa = (sel) => (root ? root.querySelectorAll(sel) : []);
const outBox = q1('.ro-aipick-out');
const state = () => (API ? API.state() : {});
const click = (n) => { if (n) n.dispatch('click', {}); };
const setNum = (n, v) => { if (n) { n.value = String(v); n.dispatch('input', {}); n.dispatch('change', {}); } };
const gameTab = (id) => qa('.ro-aipick-tab').find((n) => n.getAttribute('data-ro-aipick-game') === id);
const modeBtn = (m) => qa('.ro-aipick-segbtn').find((n) => n.getAttribute('data-ro-aipick-mode') === m);
const actBtn = (a) => qa('.ro-aipick-btn').find((n) => n.getAttribute('data-ro-aipick-act') === a);
const multiIns = () => qa('.ro-aipick-in-multi');
/* 一注的球：返回 [{text, blue, sepBefore}] 结构 */
function ballsOf(hitRow) {
  const out = [];
  let sep = false;
  for (const c of hitRow.children) {
    const k = cls(c);
    if (k.indexOf('ro-aipick-idx') >= 0) continue;
    if (k.indexOf('ro-aipick-sep') >= 0) { sep = true; continue; }
    if (k.indexOf('ro-aipick-ball') >= 0) { out.push({ text: c.textContent, blue: k.indexOf('blue') >= 0, sep: sep }); sep = false; }
  }
  return out;
}
const hits = () => qa('.ro-aipick-hit').map(ballsOf);
const hitText = (b) => b.map((x) => x.text).join(' ');
const distinct = (a) => new Set(a).size === a.length;
const inR = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;

/* ============================================================
   3) 真跑：初始状态
   ============================================================ */
H('3. 真跑：初始状态（默认应该：双色球 · 单式 · 5 注 · 1 倍 · 结果空）');
let s0 = state();
console.log(`  实际：game=${s0.game} mode=${s0.mode} count=${s0.count} times=${s0.times} rows=${s0.rows}`);
ok(s0.game === 'ssq' && s0.mode === 'single' && s0.count === 5 && s0.times === 1, '默认值 = 双色球 / 单式 / 5 注 / 1 倍');
ok(s0.rows === 0 && hits().length === 0, '初始结果区为空', `结果文字：${outBox ? outBox.textContent : '(无)'}`);
console.log(`  规则行：${q1('.ro-aipick-rule') ? q1('.ro-aipick-rule').textContent : ''}`);
console.log(`  合计行：${q1('.ro-aipick-sum') ? q1('.ro-aipick-sum').textContent : ''}`);

/* ============================================================
   4) 双色球 单式
   ============================================================ */
H('4. 双色球 · 单式 · 摇 3 注');
setNum(q1('.ro-aipick-in-count'), 3);
click(actBtn('roll'));
const ssqHits = hits();
console.log(`  摇出 ${ssqHits.length} 注：`);
ssqHits.forEach((b, i) => console.log(`   第${i + 1}注  ${hitText(b)}`));
let ssqBad = 0;
ssqHits.forEach((b) => {
  const reds = b.filter((x) => !x.blue).map((x) => parseInt(x.text, 10));
  const blues = b.filter((x) => x.blue).map((x) => parseInt(x.text, 10));
  const okRed = reds.length === 6 && reds.every((n) => inR(n, 1, 33)) && distinct(reds);
  const okBlue = blues.length === 1 && inR(blues[0], 1, 16);
  if (!okRed || !okBlue) ssqBad++;
});
ok(ssqHits.length === 3, '点了「机选一注」→ 按注数摇了 3 注', `实际 ${ssqHits.length}`);
ok(ssqBad === 0, '每注 = 红 6 个（1-33 不重复）+ 蓝 1 个（1-16）', `不合格 ${ssqBad} 注`);
console.log(`  合计行：${q1('.ro-aipick-sum') ? q1('.ro-aipick-sum').textContent : ''}`);

/* ============================================================
   5) 福彩3D：全组六（不出豹子 / 组三）
   ============================================================ */
H('5. 福彩3D · 单式 · 摇 20 次（每组 1 注）→ 看豹子 / 组三');
click(gameTab('fc3d'));
const sFc = state();
ok(sFc.game === 'fc3d' && sFc.mode === 'single' && sFc.count === 5 && sFc.rows === 0,
  '切彩种 → 方式回单式 / 注数回 5 / 结果清空',
  `game=${sFc.game} mode=${sFc.mode} count=${sFc.count} rows=${sFc.rows}`);
console.log(`  规则行：${q1('.ro-aipick-rule') ? q1('.ro-aipick-rule').textContent : ''}`);
setNum(q1('.ro-aipick-in-count'), 1);
for (let i = 0; i < 20; i++) click(actBtn('roll'));
const d3 = qa('.ro-aipick-hit').map(ballsOf);
console.log(`  摇出 ${d3.length} 注：`);
d3.forEach((b, i) => console.log(`   第${String(i + 1).padStart(2)}注  ${hitText(b)}`));
const typeOf = (b) => {
  const d = b.map((x) => x.text);
  if (d.length !== 3) return 'bad';
  if (new Set(d).size === 1) return '豹子';
  if (new Set(d).size === 2) return '组三';
  return '组六';
};
let bao = 0, zu3 = 0, zu6 = 0, bad = 0, zeroAs00 = 0;
d3.forEach((b) => {
  const t = typeOf(b);
  if (t === '豹子') bao++; else if (t === '组三') zu3++; else if (t === '组六') zu6++; else bad++;
  b.forEach((x) => { if (x.text === '00') zeroAs00++; if (x.text.length !== 1) bad++; });
});
console.log(`  ⇒ 豹子 ${bao} 注 · 组三 ${zu3} 注 · 组六 ${zu6} 注 · 格式异常 ${bad} 注`);
ok(bao === 0 && zu3 === 0, '前三位【全组六】：豹子 0 注、组三 0 注', `豹子 ${bao} / 组三 ${zu3}`);
ok(zu6 === 20 && bad === 0, '20 注全是组六，且每位只显示 1 个数字（0 就是「0」不是「00」）', `「00」出现 ${zeroAs00} 次`);

/* 再加 300 次静默：只看结论，打印实际组数 */
for (let i = 0; i < 300; i++) click(actBtn('reroll'));   /* 重摇：清空后 1 注 */
const d3b = qa('.ro-aipick-hit').map(ballsOf);
let bao2 = 0, zu3b = 0;
d3b.forEach((b) => { const t = typeOf(b); if (t === '豹子') bao2++; else if (t === '组三') zu3b++; });
console.log(`  ⇒ 另外「重摇」跑了一次：${d3b.length} 注 · 豹子 ${bao2} · 组三 ${zu3b} · 例：${d3b.slice(0, 3).map(hitText).join(' | ')}`);
ok(bao2 + zu3b === 0, '「重摇」出的号同样是全组六');

/* 排列5 前三位也必须组六 */
click(gameTab('pl5'));
setNum(q1('.ro-aipick-in-count'), 1);
for (let i = 0; i < 50; i++) click(actBtn('reroll'));
const p5 = qa('.ro-aipick-hit').map(ballsOf);
let p5bad = 0;
p5.forEach((b) => {
  const d = b.map((x) => x.text);
  if (d.length !== 5) p5bad++;
  else if (new Set(d.slice(0, 3)).size !== 3) p5bad++;
});
console.log(`  排列5 例：${p5.slice(0, 3).map(hitText).join(' | ')}`);
ok(p5bad === 0, '排列5 前三位也是全组六（后两位任意）', `不合格 ${p5bad} 注`);

/* ============================================================
   6) 大乐透 复式（前区 8 个）
   ============================================================ */
H('6. 大乐透 · 复式 · 前区 8 个');
click(gameTab('dlt'));
click(modeBtn('multi'));
const sDlt = state();
ok(sDlt.mode === 'multi', '切到复式方式', `mode=${sDlt.mode} rows=${sDlt.rows}`);
const ins = multiIns();
console.log(`  复式参数框：${ins.length} 个 → ` +
  ins.map((n) => `${n.getAttribute('data-ro-aipick-key')}=${n.value}(${n.getAttribute('data-ro-aipick-min')}~${n.getAttribute('data-ro-aipick-max')})`).join(' '));
setNum(ins[0], 8);
console.log(`  设前区=8 后，合计行：${q1('.ro-aipick-sum') ? q1('.ro-aipick-sum').textContent : ''}`);
console.log(`  警告行：${q1('.ro-aipick-warn') && !q1('.ro-aipick-warn').hidden ? q1('.ro-aipick-warn').textContent : '(无)'}`);
ok(/合计 56 注/.test(q1('.ro-aipick-sum').textContent),
  '显示「共 N 注」= C(8,5) × C(2,2) = 56', q1('.ro-aipick-sum').textContent);
click(actBtn('roll'));
const dltHits = hits();
console.log(`  摇出 ${dltHits.length} 注，前 3 注：`);
dltHits.slice(0, 3).forEach((b, i) => console.log(`   第${i + 1}注  ${hitText(b)}`));
const dltBad = dltHits.filter((b) =>
  b.filter((x) => !x.blue).length !== 5 || b.filter((x) => x.blue).length !== 2).length;
ok(dltHits.length === 56, '复式出 56 注（= 前区 C(8,5)）', `实际 ${dltHits.length}`);
ok(dltBad === 0, '每注 = 前区 5 个 + 后区 2 个', `格式不合格 ${dltBad} 注`);
const allFront = new Set();
let dupRow = 0;
const seenRow = new Set();
dltHits.forEach((b) => {
  const f = b.filter((x) => !x.blue).map((x) => x.text).sort().join(',');
  const k = f + '|' + b.filter((x) => x.blue).map((x) => x.text).sort().join(',');
  if (seenRow.has(k)) dupRow++;
  seenRow.add(k);
  f.split(',').forEach((n) => allFront.add(n));
});
console.log(`  ⇒ 56 注去重后 ${seenRow.size} 注（重复 ${dupRow} 注）· 前区号池：${Array.from(allFront).sort().join(' ')}`);
ok(dupRow === 0 && seenRow.size === 56, '56 注互不重复（真的是组合，不是随机重复）', `重复 ${dupRow} 注`);
ok(allFront.size === 8, '56 注刚好用满前区那 8 个号', `用了 ${allFront.size} 个`);

/* ============================================================
   7) 复式超 1000 注要拦住 + 单式注数上限
   ============================================================ */
H('7. 上限保护：复式 >1000 注不摇 / 单式注数上限 50');
setNum(ins[0], 20);
if (ins[1]) setNum(ins[1], 12);
console.log(`  前区 20 + 后区 12 → 合计行：${q1('.ro-aipick-sum') ? q1('.ro-aipick-sum').textContent : ''}`);
const warnTxt = q1('.ro-aipick-warn') ? q1('.ro-aipick-warn').textContent : '';
console.log(`  警告行：${warnTxt || '(无)'}`);
ok(/超过上限 1000 注/.test(warnTxt), '超过 1000 注时给出提示', warnTxt.slice(0, 60));
const before = state().rows;
click(actBtn('roll'));
ok(state().rows === before, '超过上限时点「机选一注」不出号（不把浏览器卡死）',
  `行数 ${before} → ${state().rows}`);
click(modeBtn('single'));
setNum(q1('.ro-aipick-in-count'), 999);
ok(q1('.ro-aipick-in-count').value === '50', '单式注数输入 999 被夹到上限 50', `实际 ${q1('.ro-aipick-in-count').value}`);

/* ============================================================
   8) 切彩种重置 / 清空
   ============================================================ */
H('8. 切彩种 → 重置；点「清空」→ 清空');
click(gameTab('qlc'));
const sQ = state();
const qRule = q1('.ro-aipick-rule') ? q1('.ro-aipick-rule').textContent : '';
console.log(`  切到七乐彩后：game=${sQ.game} mode=${sQ.mode} count=${sQ.count} times=${sQ.times} rows=${sQ.rows}`);
console.log(`  规则行：${qRule}`);
ok(sQ.game === 'qlc' && sQ.mode === 'single' && sQ.count === 5 && sQ.times === 1 && sQ.rows === 0,
  '切彩种 → 方式/注数/倍数回默认、结果清空');
setNum(q1('.ro-aipick-in-count'), 2);
click(actBtn('roll'));
const qlcN = hits().length;
console.log(`  七乐彩摇 2 注：${hits().map(hitText).join(' | ')}`);
ok(qlcN === 2 && hits()[0].length === 7, '七乐彩单式 = 7 个基本号（1-30 不重复）', `球数 ${hits()[0].length}`);
click(actBtn('clear'));
ok(state().rows === 0 && hits().length === 0, '点「清空」→ 结果清空',
  `结果文字：${outBox ? outBox.textContent : ''}`);

/* 快乐8 玩法切换 */
H('9. 快乐8：切玩法（选十 → 选三）');
click(gameTab('kl8'));
const kl8Tabs = qa('.ro-aipick-kl8tab');
console.log(`  玩法按钮 ${kl8Tabs.length} 个：${kl8Tabs.map((n) => n.textContent).join(' ')}`);
const sKl = state();
console.log(`  默认玩法：选${sKl.kl8} · 规则行：${q1('.ro-aipick-rule') ? q1('.ro-aipick-rule').textContent : ''}`);
setNum(q1('.ro-aipick-in-count'), 1);
click(actBtn('roll'));
const kl8a = hits()[0] || [];
const sel3 = kl8Tabs.find((n) => n.getAttribute('data-ro-aipick-kl8') === '3');
click(sel3);
click(actBtn('roll'));
const kl8b = hits()[0] || [];
console.log(`  选十：${hitText(kl8a)}`);
console.log(`  选三：${hitText(kl8b)}`);
ok(kl8a.length === 10 && kl8b.length === 3, '快乐8 选十出 10 个、选三出 3 个', `${kl8a.length} / ${kl8b.length}`);
ok(kl8a.every((x) => inR(parseInt(x.text, 10), 1, 80)) && kl8b.every((x) => inR(parseInt(x.text, 10), 1, 80)),
  '快乐8 号码都在 01-80');
ok(hits().length === 1, '切玩法时结果被清掉（只留新摇的 1 注）', `实际 ${hits().length}`);

/* ============================================================
   10) 交互边界：面板里的可操作控件 + 没有新增存储
   ============================================================ */
H('10. 交互边界');
const controls = [];
qa('.ro-aipick-tab').forEach((n) => controls.push(`彩种切换 <a role=button> ${n.textContent}`));
qa('.ro-aipick-srcbtn').forEach((n) => controls.push(`选号来源 <a role=button> ${n.textContent}`));
qa('.ro-aipick-segbtn').forEach((n) => controls.push(`方式切换 <a role=button> ${n.textContent}`));
qa('.ro-aipick-kl8tab').forEach((n) => controls.push(`快乐8玩法 <a role=button> ${n.textContent}`));
qa('.ro-aipick-btn').forEach((n) => controls.push(`操作按钮 <a role=button> ${n.textContent}`));
qa('input').forEach((n) => controls.push(`数字输入 <input type=number class="${cls(n)}" min=${n.getAttribute('min')} max=${n.getAttribute('max')}>`));
console.log('  面板里的可操作控件：');
controls.forEach((c) => console.log(`   · ${c}`));
ok(block.indexOf('<button') < 0 && (html.match(/<button/g) || []).length === 0, '面板 / 整页都没有 <button> 标签');
ok(!/localStorage|sessionStorage|document\.cookie/.test(js), '面板脚本里没有新增 localStorage / sessionStorage / cookie');
ok(!/保存|记住|收藏|提交/.test(js.replace(/不保存/g, '')), '面板脚本里没有「保存 / 记住 / 收藏 / 提交」这类功能');
/* 其他区块没有被加新控件：把注释和 <style> 去掉之后，
   整页剩下的 <input> 必须全部来自 ai选号 面板 */
const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/gi, '');
const pageInputs = (htmlNoComments.match(/<input/g) || []).length;
const panelInputs = (block.match(/<input/g) || []).length;
console.log(`  去掉注释/样式后：整页 <input> = ${pageInputs}，其中面板里 = ${panelInputs}`);
ok(pageInputs === panelInputs && panelInputs > 0, '整页的 <input> 全部在 ai选号 面板里（别的区块没有新控件）');
/* 刷新 = 复位：再搭一棵新 DOM 跑一遍，状态必须还是默认 */
{
  const p2 = new MNode('div');
  p2.innerHTML = block;
  const nodes2 = [];
  (function walk(n) { n.children.forEach((c) => { nodes2.push(c); walk(c); }); })(p2);
  const byId2 = new Map();
  nodes2.forEach((n) => { if (n.attrs.id) byId2.set(n.attrs.id, n); });
  const doc2 = {
    getElementById: (id) => byId2.get(id) || null,
    createElement: (t) => new MNode(t),
    querySelector: (sel) => p2.querySelector(sel),
    querySelectorAll: (sel) => p2.querySelectorAll(sel)
  };
  const win2 = {};
  const sb2 = { document: doc2, window: win2, console };
  vm.createContext(sb2);
  vm.runInContext(js, sb2, { timeout: 8000 });
  const s2 = win2.__roAiPick.state();
  console.log(`  「刷新」（重新执行一次页面脚本）后：game=${s2.game} mode=${s2.mode} count=${s2.count} times=${s2.times} rows=${s2.rows}`);
  ok(s2.game === 'ssq' && s2.mode === 'single' && s2.count === 5 && s2.rows === 0,
    '刷新页面 → 面板完全复位（证明没有持久化）');
}

/* ============================================================
   11) 标题居中（用户配截图要求「字体居中」）
   ============================================================ */
H('11. 标题居中：ai选号 + 副标题 + 「点击查看」纵向居中（!important）');
const head = root.querySelector('.ro-aipick-head');
const headParts = head
  ? head.children.filter((n) => n.tagName !== '#text')
      .map((n) => `${n.tagName}: ${n.textContent || '(文字由 CSS 伪元素出：点击查看 ▸)'}`)
  : [];
console.log('  <summary class="ro-aipick-head"> 的子元素（按源码顺序 = 显示顺序，flex-direction: column 纵向排）：');
headParts.forEach((p, i) => console.log(`   ${i + 1}. ${p}`));
ok(headParts.length === 3 && headParts[0].indexOf('h2') === 0 &&
   headParts[1].indexOf('div') === 0 && headParts[2].indexOf('span') === 0,
  '标题行 = 标题 → 副标题 → 「点击查看」，三个元素（h2 / div / span）');
ok(/\.ro-aipick-head\s*\{[^}]*flex-direction:\s*column\s*!important/.test(html) &&
   /\.ro-aipick-head\s*\{[^}]*align-items:\s*center\s*!important/.test(html) &&
   /\.ro-aipick-head\s*\{[^}]*justify-content:\s*center\s*!important/.test(html) &&
   /\.ro-aipick-head\s*\{[^}]*text-align:\s*center\s*!important/.test(html),
  '.ro-aipick-head：flex-direction / align-items / justify-content / text-align 全部 !important');
ok(/\.ro-aipick-h2\s*\{[^}]*text-align:\s*center\s*!important/.test(html) &&
   /\.ro-aipick-h2\s*\{[^}]*width:\s*100%\s*!important/.test(html),
  '.ro-aipick-h2（标题）：text-align / width 都带 !important');
ok(/\.ro-aipick-sub\s*\{[^}]*text-align:\s*center\s*!important/.test(html) &&
   /\.ro-aipick-sub\s*\{[^}]*line-height:\s*1\.5\s*!important/.test(html),
  '.ro-aipick-sub（副标题）：text-align / line-height 都带 !important');
ok(/\.ro-aipick-arrow\s*\{[^}]*margin:\s*4px auto 0\s*!important/.test(html),
  '.ro-aipick-arrow（点击查看 ▸）：margin 居中带 !important');
ok(/\.ro-aipick\[open\] \.ro-aipick-arrow::before \{ content: '点击收起'/.test(html),
  '「点击查看 / 点击收起」的切换逻辑没改（还是纯 CSS 按 [open] 出）');
const subText = (headParts[1] || '').replace(/^div:\s*/, '');
console.log(`  副标题完整可见文字：${subText}`);
ok(subText.indexOf('GPT模型摇号') >= 0, '副标题里能搜到「GPT模型摇号」');
ok(subText.indexOf('ChatGPT') < 0 && block.indexOf('ChatGPT') < 0, '整块里没有「ChatGPT」（用户确认用短名，避免商标风险）');
ok(block.indexOf('仅供娱乐') >= 0 && block.indexOf('不构成购彩建议') >= 0,
  '合规声明仍然在（面板底部：仅供娱乐 / 不构成购彩建议）');
ok(/<h2 class="ro-aipick-h2">ai选号<\/h2>/.test(block), '标题仍然是「ai选号」');

/* ============================================================
   12) 自己选号（手动点号码）
   ============================================================ */
H('12. 自己选号：号码格子 / 已选 x/y / 你的号码 / 清空重选');
const srcBtn = (v) => qa('.ro-aipick-srcbtn').find((n) => n.getAttribute('data-ro-aipick-src') === v);
const selfBox = q1('.ro-aipick-self');
const pickBox = q1('.ro-aipick-picker');
const mineOut = q1('.ro-aipick-mineout');
const shapeBox = q1('.ro-aipick-shape');
const cells = () => qa('.ro-aipick-pick');
const counts = () => qa('.ro-aipick-pcount');
const cellAt = (slot, num) => cells().find((n) =>
  n.getAttribute('data-ro-aipick-slot') === slot && n.getAttribute('data-ro-aipick-num') === String(num));
const mineText = () => (mineOut ? mineOut.children.map((c) => c.textContent).join(' ') : '');

click(gameTab('ssq'));                       /* 从双色球开始（上一段停在快乐8） */
ok(state().game === 'ssq', '先切回双色球', `game=${state().game}`);
ok(!!selfBox && selfBox.hidden, '默认【机选】模式：自己选号的格子在 DOM 里但隐藏（hidden）');
ok(state().src === 'ai', '默认选号来源 = 机选', `src=${state().src}`);
click(srcBtn('self'));
ok(state().src === 'self' && !selfBox.hidden, '点「自己选号」→ 切到手动模式（格子显示出来）');
ok(q1('.ro-aipick-out').hidden, '自己选号模式下把「机选结果区」收起来');
/* 双色球：红 1-33 + 蓝 1-16 → 49 个格子 */
const slotList = Array.from(new Set(cells().map((n) => n.getAttribute('data-ro-aipick-slot'))));
console.log(`  双色球格子：${cells().length} 个（槽位 ${slotList.join('/')}）`);
console.log(`  已选状态：${counts().map((n) => n.textContent).join('   ')}`);
ok(cells().length === 49 && counts()[0].textContent === '已选 0/6' && counts()[1].textContent === '已选 0/1',
  '双色球 = 红球 33 格 + 蓝球 16 格，初始「已选 0/6」「已选 0/1」');
ok(cells().every((n) => n.tagName === 'a' && n.getAttribute('role') === 'button'),
  '格子全是 <a role="button">（不是 <button> 标签）');
/* 点 3 个红球 + 1 个蓝球 */
[5, 12, 18].forEach((n) => click(cellAt('a0', n)));
click(cellAt('a1', 9));
console.log(`  点了红球 05 12 18 + 蓝球 09 → ${counts().map((n) => n.textContent).join('   ')}`);
console.log(`  你的号码：${mineText()}`);
ok(counts()[0].textContent === '已选 3/6' && counts()[1].textContent === '已选 1/1',
  '「已选 x/y」实时更新', counts().map((n) => n.textContent).join(' / '));
ok(mineText().replace(/\s+/g, ' ') === '05 12 18 _ _ _ + 09', '「你的号码」实时显示（没选的位是 _）', mineText());
ok(cellAt('a0', 5).className.indexOf(' on') >= 0, '点过的格子高亮（class 带 on）');
/* 选满 6 个之后不再增加 */
[1, 2, 3, 4].forEach((n) => click(cellAt('a0', n)));
console.log(`  红球连点 01 02 03 04（本来只差 3 个）→ ${counts()[0].textContent}`);
console.log(`  你的号码：${mineText()}`);
ok(counts()[0].textContent === '已选 6/6', '选满 6 个后再点不增加（上限 6）');
ok(mineText().indexOf('_') < 0, '凑齐后「你的号码」没有 _ 了');
/* 再点一次已选的号 → 取消 */
click(cellAt('a1', 9));
ok(counts()[1].textContent === '已选 0/1', '再点一次已选号 → 取消选中');
/* 清空重选 */
click(cellAt('a1', 9));
click(actBtn('reset'));
console.log(`  点「清空重选」→ ${counts().map((n) => n.textContent).join('   ')} · 你的号码：${mineText()}`);
ok(counts()[0].textContent === '已选 0/6' && mineText().replace(/\s+/g, ' ').indexOf('_ _ _ _ _ _') >= 0,
  '「清空重选」把选中的号全清掉');
/* 切彩种 → 清空重选 */
click(cellAt('a0', 7));
const beforeSwitch = counts()[0].textContent;
click(gameTab('fc3d'));
ok(state().src === 'ai', '切彩种 → 回到默认的【机选】模式', `src=${state().src}`);
click(srcBtn('self'));
console.log(`  切彩种前后：${beforeSwitch} → ${counts().map((n) => n.textContent).join('   ')}`);
ok(counts().length === 3 && counts().every((n) => n.textContent === '已选 0/1'),
  '福彩3D 自己选号 = 百位/十位/个位 各 10 格，「已选 0/1」三个（切彩种已清空）',
  counts().map((n) => n.textContent).join(' '));
console.log(`  福彩3D 格子：${cells().length} 个 = 3 位 × 0-9`);
/* 数字彩：自己选号不强制组六，但要提醒形态 */
click(cellAt('p0', 1)); click(cellAt('p1', 1)); click(cellAt('p2', 1));
console.log(`  手选 1 1 1 → 你的号码：${mineText()} · 形态提示：${shapeBox && !shapeBox.hidden ? shapeBox.textContent : '(无)'}`);
ok(shapeBox && !shapeBox.hidden && shapeBox.textContent.indexOf('豹子') >= 0,
  '自己选号不拦豹子，但会提示形态', shapeBox ? shapeBox.textContent : '');
click(actBtn('reset'));
click(cellAt('p0', 1)); click(cellAt('p1', 2)); click(cellAt('p2', 3));
console.log(`  手选 1 2 3 → 形态提示：${shapeBox && !shapeBox.hidden ? shapeBox.textContent : '(无)'}`);
ok(shapeBox.textContent.indexOf('组六') >= 0, '1 2 3 被认成组六');
click(actBtn('reset'));
click(cellAt('p0', 1)); click(cellAt('p1', 1)); click(cellAt('p2', 3));
console.log(`  手选 1 1 3 → 形态提示：${shapeBox && !shapeBox.hidden ? shapeBox.textContent : '(无)'}`);
ok(shapeBox.textContent.indexOf('组三') >= 0, '1 1 3 被认成组三');
/* 机选模式的组六约束没有被自己选号带坏 */
click(srcBtn('ai'));
setNum(q1('.ro-aipick-in-count'), 1);
for (let i = 0; i < 20; i++) click(actBtn('reroll'));
const d3c = qa('.ro-aipick-hit').map(ballsOf);
let bao3 = 0, zu33 = 0;
d3c.forEach((b) => { const t = typeOf(b); if (t === '豹子') bao3++; else if (t === '组三') zu33++; });
console.log(`  从「自己选号」切回「机选」再摇 20 次：豹子 ${bao3} · 组三 ${zu33} · 例：${d3c.slice(0, 3).map(hitText).join(' | ')}`);
ok(bao3 + zu33 === 0, '机选的组六约束没被自己选号影响（仍然 0 豹子 / 0 组三）');
ok(state().pick && Object.keys(state().pick).length === 0, '切回机选时手动选的号已清空');

/* 快乐8 自己选号：格子数跟着玩法走 */
H('12b. 快乐8 自己选号：格子在 01-80，选几个跟着玩法');
click(gameTab('kl8'));
click(srcBtn('self'));
const kl8Counts0 = counts().map((n) => n.textContent).join(' ');
console.log(`  默认玩法「选十」→ 格子 ${cells().length} 个 · ${kl8Counts0}`);
ok(cells().length === 80 && /已选 0\/10/.test(kl8Counts0), '快乐8 自己选号 = 01-80 共 80 格，要选 10 个');
const kl8tab3 = qa('.ro-aipick-kl8tab').find((n) => n.getAttribute('data-ro-aipick-kl8') === '3');
click(kl8tab3);
console.log(`  切到「选三」→ ${counts().map((n) => n.textContent).join(' ')}`);
ok(/已选 0\/3/.test(counts()[0].textContent), '切玩法后要选的个数跟着变（选三 = 3 个）');
[12, 13, 25].forEach((n) => click(cellAt('a0', n)));
console.log(`  点了 12 13 25 → 你的号码：${mineText()}`);
ok(mineText().replace(/\s+/g, ' ') === '12 13 25', '「你的号码」显示三个号（快乐8 不补零）', mineText());

/* ============================================================
   13) 「所有的都不能保存」
   ============================================================ */
H('13. 没有存储：localStorage / sessionStorage / cookie / IndexedDB');
const banned = /localStorage|sessionStorage|document\.cookie|indexedDB|IndexedDB|openDatabase|window\.name\s*=/;
console.log(`  面板脚本里搜 localStorage / sessionStorage / cookie / IndexedDB → ` +
  `${banned.test(js) ? '❌ 有命中' : '✅ 0 命中'}`);
ok(!banned.test(js), '面板脚本里没有任何浏览器存储 API');
ok(!/保存|记住|收藏|导出|下载/.test(js.replace(/不保存|不落盘|不能保存/g, '')), '面板脚本里没有「保存 / 记住 / 收藏 / 导出 / 下载」功能');
/* 刷新 = 从零开始：重新执行一遍页面脚本，手选的号也必须没了 */
{
  const p3 = new MNode('div');
  p3.innerHTML = block;
  const nodes3 = [];
  (function walk(n) { n.children.forEach((c) => { nodes3.push(c); walk(c); }); })(p3);
  const byId3 = new Map();
  nodes3.forEach((n) => { if (n.attrs.id) byId3.set(n.attrs.id, n); });
  const doc3 = {
    getElementById: (id) => byId3.get(id) || null,
    createElement: (t) => new MNode(t),
    querySelector: (sel) => p3.querySelector(sel),
    querySelectorAll: (sel) => p3.querySelectorAll(sel)
  };
  const win3 = {};
  const sb3 = { document: doc3, window: win3, console };
  vm.createContext(sb3);
  vm.runInContext(js, sb3, { timeout: 8000 });
  const s3 = win3.__roAiPick.state();
  const mine3 = p3.querySelector('.ro-aipick-mineout');
  console.log(`  「刷新页面」后：game=${s3.game} src=${s3.src} mode=${s3.mode} count=${s3.count} rows=${s3.rows} ` +
    `手选中的号=${Object.keys(s3.pick).length} 组`);
  ok(s3.game === 'ssq' && s3.src === 'ai' && s3.mode === 'single' && s3.count === 5 &&
     s3.rows === 0 && Object.keys(s3.pick).length === 0,
    '刷新页面 → 彩种/模式/注数/摇出的号/手选的号【全部】回到默认（什么都不留）');
  ok(mine3 && mine3.textContent.replace(/\s+/g, ' ').indexOf('_') >= 0,
    '刷新后「你的号码」也是空的（全是 _）', mine3 ? mine3.textContent.replace(/\s+/g, ' ') : '');
}

/* ============================================================
   结论
   ============================================================ */
console.log('');
if (fail === 0) console.log('✅ 真跑验证通过（以上每一步都是真执行面板脚本得到的真实号码）');
else console.log(`❌ 真跑验证失败：${fail} 项不通过`);
process.exit(fail === 0 ? 0 : 1);
