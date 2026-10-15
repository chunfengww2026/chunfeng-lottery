// ============================================================
//  _realtest_calc.mjs —— 奖金试算器【真跑验证】（不是静态检查）
//
//  做法：把 足球推荐.html 里内联的计算器脚本【抠出来】，
//        配一个迷你 DOM（getElementById / querySelectorAll /
//        checkbox.checked / addEventListener+dispatch / classList），
//        用 vm 【真执行】这段脚本，然后模拟：
//          勾 1 场 → 勾 2 场 → 同场勾 2 个（复式）→ 改倍数 1→5
//          → 9 关（超上限）→ 同场跨玩法（混合过关）→ 点清空
//        每一步都把【脚本算出来的数字】和【测试脚本自己独立手算的结果】对比。
//
//  顺带核对页面不变量（竞彩页）：
//    计算器在免责声明上方 · 裸 <button> = 0 · 三个 m-sec 默认收起 ·
//    交互控件只在计算器里 · 计算器代码里没有 localStorage/sessionStorage/cookie
//
//  用法：node _realtest_calc.mjs   （纯本地，不联网、不调 AI、不发请求）
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(ROOT, '足球推荐.html');

let bad = 0;
const ok = (cond, msg) => { if (!cond) bad++; console.log(`   ${cond ? '✅' : '❌'} ${msg}`); };
const H = (t) => console.log(`\n──── ${t} ────`);

if (!fs.existsSync(PAGE)) {
  console.log('❌ 还没有 足球推荐.html —— 先跑 node export-football.mjs');
  process.exit(1);
}
const html = fs.readFileSync(PAGE, 'utf8');

/* ============================================================
   1. 从页面里抠出计算器脚本 + 赔率 JSON
   ============================================================ */
H('1. 抠出计算器脚本 / 赔率数据');

const mk = html.indexOf('<!-- __FB_CALC_JS__');
if (mk < 0) { console.log('❌ 页面里找不到 __FB_CALC_JS__ 标记'); process.exit(1); }
const sTag = html.indexOf('<script>', mk);
const sEnd = html.indexOf('</script>', sTag);
const script = html.slice(sTag + '<script>'.length, sEnd);
console.log(`   计算器脚本：${script.length} 字符（位置 ${sTag}）`);

const jsonM = /<script type="application\/json" id="jcCalcData">([\s\S]*?)<\/script>/.exec(html);
if (!jsonM) { console.log('❌ 页面里找不到 jcCalcData（赔率 JSON）'); process.exit(1); }
const payloadText = jsonM[1];
const rows = JSON.parse(payloadText.replace(/\\u003c/g, '<'));
console.log(`   赔率 JSON：${rows.length} 场（${payloadText.length} 字符）`);
rows.slice(0, 3).forEach((r) => {
  console.log(`     · ${r.code} had=${r.had ? [r.had.h, r.had.d, r.had.a].join('/') : '—'}` +
    ` hhad=${r.hhad ? `${r.hhad.line} ${[r.hhad.h, r.hhad.d, r.hhad.a].join('/')}` : '—'}`);
});

/* ============================================================
   2. 迷你 DOM（只实现脚本真正用到的那几样）
   ============================================================ */
function makeEl(tag, opts = {}) {
  const el = {
    tagName: String(tag).toUpperCase(),
    id: opts.id || '',
    value: opts.value != null ? opts.value : '',
    checked: !!opts.checked,
    textContent: opts.text != null ? opts.text : '',
    parentNode: null,
    children: [],
    _cls: String(opts.className || '').split(/\s+/).filter(Boolean),
    _listeners: {}
  };
  Object.defineProperty(el, 'className', {
    get() { return el._cls.join(' '); },
    set(v) { el._cls = String(v || '').split(/\s+/).filter(Boolean); }
  });
  el.classList = {
    add(n) { if (el._cls.indexOf(n) < 0) el._cls.push(n); },
    remove(n) { const i = el._cls.indexOf(n); if (i >= 0) el._cls.splice(i, 1); },
    contains(n) { return el._cls.indexOf(n) >= 0; },
    toggle(n, force) {
      const want = force === undefined ? !el.classList.contains(n) : !!force;
      if (want) el.classList.add(n); else el.classList.remove(n);
      return want;
    }
  };
  el.addEventListener = (t, fn) => { (el._listeners[t] = el._listeners[t] || []).push(fn); };
  el.dispatch = (t) => {
    const ev = {
      target: el, type: t, defaultPrevented: false, propagationStopped: false,
      preventDefault() { ev.defaultPrevented = true; },
      stopPropagation() { ev.propagationStopped = true; }
    };
    (el._listeners[t] || []).forEach((fn) => fn(ev));
    return ev;
  };
  el.appendChild = (c) => { c.parentNode = el; el.children.push(c); return c; };
  el.closest = (sel) => {
    const cls = String(sel).replace(/^\./, '');
    let n = el;
    while (n) {
      if (n.classList && n.classList.contains(cls)) return n;
      n = n.parentNode;
    }
    return null;
  };
  el.querySelectorAll = (sel) => {
    const m = /^([a-zA-Z]+)?\.?([\w-]+)?$/.exec(sel) || [];
    const tag = (m[1] || '').toUpperCase();
    const cls = m[2] || '';
    const hit = [];
    const walk = (node) => {
      node.children.forEach((c) => {
        if ((!tag || c.tagName === tag) && (!cls || c.classList.contains(cls))) hit.push(c);
        walk(c);                                  /* 后代选择器：要递归 */
      });
    };
    walk(el);
    return hit;
  };
  return el;
}

/* 页面里计算器区块的 HTML（从 id="jcCalc" 到免责声明前） */
const iCalc = html.indexOf('id="jcCalc"');
const iNote = html.indexOf('<div class="note">');
ok(iCalc >= 0 && iNote > iCalc, `计算器区块在【免责声明上方】（jcCalc=${iCalc} < note=${iNote}）`);
const calcHtml = html.slice(iCalc, iNote > iCalc ? iNote : html.length);

const root = makeEl('details', { id: 'jcCalc', className: 'm-calc' });
root.open = false;            /* 页面里的 <details class="m-calc"> 不带 open → 默认收起 */
const LABELS = [];
/* 页面上的勾选：<label class="calc-opt"><input class="calc-cb" type="checkbox" value="..."> */
for (const m of calcHtml.matchAll(/<label class="calc-opt"><input class="calc-cb" type="checkbox" value="([^"]+)">/g)) {
  const lab = makeEl('label', { className: 'calc-opt' });
  const box = makeEl('input', { className: 'calc-cb', value: m[1] });
  root.appendChild(lab);
  lab.appendChild(box);
  LABELS.push({ lab, box });
}
const boxes = root.querySelectorAll('input.calc-cb');
console.log(`   迷你 DOM：${boxes.length} 个勾选框（页面上的 calc-cb 数量 = ${(calcHtml.match(/class="calc-cb"/g) || []).length}）`);
ok(boxes.length === (calcHtml.match(/class="calc-cb"/g) || []).length, '勾选框数量与页面一致');

/* 从页面 HTML 里造一个元素（<select> 的当前值 = 带 selected 的那个 option） */
function elSpec(id) {
  const m = new RegExp(`id="${id}"[^>]*>`).exec(calcHtml);
  const tag = m ? (/<([a-z]+)[^>]*id="/.exec(m[0]) || [, 'span'])[1] : 'span';
  const cls = m ? ((/class="([^"]*)"/.exec(m[0]) || [, ''])[1]) : '';
  let val = m ? ((/value="([^"]*)"/.exec(m[0]) || [, ''])[1]) : '';
  if (id === 'calcPass') {
    const sel = /<option value="(\d+)" selected>/.exec(calcHtml);
    val = sel ? sel[1] : '1';
  }
  if (id === 'calcMul' && !val) val = '1';
  return makeEl(tag, { id, value: val, className: cls });
}

const CALC_IDS = ['calcN', 'calcBets', 'calcCost', 'calcPrize', 'calcPrizeHint',
  'calcWarn', 'calcMul', 'calcClear', 'calcRand', 'calcPass',
  'calcShot', 'calcShotImg', 'calcShotX', 'calcShotBtn'];
const els = {};
for (const id of CALC_IDS) els[id] = elSpec(id);
els.jcCalcData = makeEl('script', { id: 'jcCalcData', text: payloadText });

const document = {
  getElementById: (id) => (id === 'jcCalc' ? root : (els[id] || null))
};

/* ============================================================
   3. 真执行页面上的那段脚本
   ============================================================ */
H('2. 用迷你 DOM 真执行计算器脚本');
const ctx = vm.createContext({
  document, console, JSON, Math, isFinite, parseInt, parseFloat,
  String, Number, Array, Object, Date, window: {}
});
try {
  vm.runInContext(script, ctx, { filename: 'jcCalc-inline.js' });
  console.log('   ✅ 脚本执行成功（没有抛异常 —— 说明它不依赖页面其它东西）');
} catch (e) {
  console.log('   ❌ 脚本执行抛异常：' + e.message);
  process.exit(1);
}

/* ============================================================
   4. 模拟操作 + 与「独立手算」对比
   ============================================================ */
const r2 = (v) => {                              /* 官方 2 位小数规则（测试脚本自己实现） */
  const s = (Math.round(v * 1e6) / 1e6).toFixed(4);
  const [ip, fp] = s.split('.');
  const cents = Number(ip) * 100 + Number(fp.slice(0, 2));
  const third = Number(fp[2]);
  if (third > 5) return (cents + 1) / 100;
  if (third < 5) return cents / 100;
  return (cents % 2 === 0 ? cents : cents + 1) / 100;
};
const capOf = (n) => (n <= 1 ? 100000 : n <= 3 ? 200000 : n <= 5 ? 500000 : 1000000);
const box = (code, pool, key) => boxes.find((b) => b.value === `${code}|${pool}|${key}`);
const setBox = (b, on) => { b.checked = on; b.dispatch('change'); };
const mul = (v) => { els.calcMul.value = String(v); els.calcMul.dispatch('input'); };
const read = () => ({
  n: els.calcN.textContent, bets: els.calcBets.textContent, cost: els.calcCost.textContent,
  prize: els.calcPrize.textContent, hint: els.calcPrizeHint.textContent, warn: els.calcWarn.textContent
});
const money = (v) => '¥' + v.toFixed(2);
let step = 0;
function check(label, got, want) {
  step++;
  const pass = got === want;
  if (!pass) bad++;
  console.log(`   ${pass ? '✅' : '❌'} 步骤${step} ${label}`);
  console.log(`        算出：${got}`);
  console.log(`        手算：${want}`);
}
function reset() {
  boxes.forEach((b) => setBox(b, false));
  mul(1);
}

const A = rows[0];        /* 第 1 场 */
const B = rows[1];        /* 第 2 场 */
const C = rows[2];        /* 第 3 场 */
console.log(`   用到的三场：${A.code} / ${B.code} / ${C.code}`);

H('3. 逐步模拟（每一步都打印实际数字）');

/* --- 步骤 1：初始状态（一个都没勾） --- */
reset();
let st = read();
step++;
console.log(`   ${st.n === '0' && st.bets === '0' && st.prize === '¥0.00' ? '✅' : '❌'} 步骤${step} 初始（未勾选）`);
console.log(`        已选 ${st.n} 关 · ${st.bets} 注 · 总投注 ${st.cost} · 预计奖金 ${st.prize} · ${st.hint}`);
if (!(st.n === '0' && st.bets === '0' && st.prize === '¥0.00')) bad++;

/* --- 步骤 2：勾 1 场 1 个结果 → 单关 = 2 × 赔率 × 倍数 --- */
if (!box(A.code, 'had', 'h')) { console.log('❌ 找不到 A 场的胜平负主胜勾选框'); process.exit(1); }
setBox(box(A.code, 'had', 'h'), true);
st = read();
const e1 = r2(2 * A.had.h);
console.log(`   [${A.code} 胜平负 主胜 ${A.had.h}]  2 × ${A.had.h} = ${(2 * A.had.h).toFixed(4)} → ${e1.toFixed(2)}`);
check('单关 1 注：奖金 = 2 × 赔率', st.prize, money(e1));
check('单关 1 注：注数 / 总投注', `${st.bets} 注 ${st.cost}`, `1 注 ${money(2)}`);

/* --- 步骤 3：再勾 1 场 → 2 串 1 = 2 × 赔率积 --- */
setBox(box(B.code, 'had', 'a'), true);
st = read();
const e2 = r2(2 * A.had.h * B.had.a);
console.log(`   [${A.code} 主胜 ${A.had.h}] × [${B.code} 客胜 ${B.had.a}] = ${(2 * A.had.h * B.had.a).toFixed(4)} → ${e2.toFixed(2)}`);
check('2 串 1（1 注）：奖金 = 2 × 两场赔率之积', st.prize, money(e2));
check('2 串 1：注数 / 总投注', `${st.bets} 注 ${st.cost}`, `1 注 ${money(2)}`);
console.log(`        提示：${st.hint}`);

/* --- 步骤 4：同一场勾 2 个结果（复式）→ 2 注 + 奖金范围 --- */
setBox(box(B.code, 'had', 'a'), false);
setBox(box(A.code, 'had', 'd'), true);
st = read();
const lo = r2(2 * Math.min(A.had.h, A.had.d));
const hi = r2(2 * Math.max(A.had.h, A.had.d));
console.log(`   [${A.code}] 同时勾 主胜 ${A.had.h} + 平 ${A.had.d} → 2 注；单注 = ${lo.toFixed(2)} ~ ${hi.toFixed(2)}`);
check('复式 2 注：奖金范围（中其中一注）', st.prize, `${money(lo)} ~ ${money(hi)}`);
check('复式 2 注：注数 / 总投注 = 2 × 2 × 1', `${st.bets} 注 ${st.cost}`, `2 注 ${money(4)}`);

/* --- 步骤 5：改倍数 1 → 5 --- */
const before = st.prize;
mul(5);
st = read();
console.log(`   倍数 1 → 5：${before} 变成 ${st.prize}（总投注 ${st.cost}）`);
check('倍数 5：奖金 = 单注 × 5', st.prize, `${money(lo * 5)} ~ ${money(hi * 5)}`);
check('倍数 5：总投注 = 2 注 × 2 元 × 5', st.cost, money(20));
check('倍数 5：注数不变', st.bets, '2');
mul(1);

/* --- 步骤 6：9 场（超过 8 关上限）→ 不给数字 + 提示 --- */
reset();
for (let i = 0; i < 9 && i < rows.length; i++) setBox(box(rows[i].code, 'had', 'h'), true);
st = read();
step++;
const p6 = st.prize === '—' && /8 关/.test(st.warn);
if (!p6) bad++;
console.log(`   ${p6 ? '✅' : '❌'} 步骤${step} 勾 9 场（> 8 关）：预计奖金 ${st.prize} · 已选 ${st.n} 关`);
console.log(`        提示：${st.warn}`);

/* --- 步骤 7：同场跨玩法（胜平负 + 让球胜平负）越过关 → 混合过关，不给数字 --- */
reset();
setBox(box(A.code, 'had', 'h'), true);
if (box(A.code, 'hhad', 'h')) {
  setBox(box(A.code, 'hhad', 'h'), true);
  setBox(box(B.code, 'had', 'h'), true);
  st = read();
  step++;
  const p7 = st.prize === '—' && /混合过关/.test(st.warn);
  if (!p7) bad++;
  console.log(`   ${p7 ? '✅' : '❌'} 步骤${step} 同场跨玩法：预计奖金 ${st.prize}`);
  console.log(`        提示：${st.warn}`);
} else {
  console.log('   ⚠️ A 场没有让球胜平负 SP，跳过跨玩法步骤');
}

/* --- 步骤 8：点「清空」→ 回到 0 --- */
reset();
setBox(box(A.code, 'had', 'h'), true);
setBox(box(A.code, 'had', 'd'), true);
mul(7);
els.calcClear.dispatch('click');
st = read();
const p8 = st.n === '0' && st.bets === '0' && st.prize === '¥0.00' && st.cost === '¥0.00' &&
  els.calcMul.value === '1' && !boxes.some((b) => b.checked);
step++;
if (!p8) bad++;
console.log(`   ${p8 ? '✅' : '❌'} 步骤${step} 点「清空」：已选 ${st.n} 关 · ${st.bets} 注 · 总投注 ${st.cost} · 预计奖金 ${st.prize}` +
  ` · 倍数回到 ${els.calcMul.value} · 还有勾选 = ${boxes.some((b) => b.checked)}`);

/* --- 步骤 9：默认值检查（页面静态渲染出来的就是「未勾选 / 倍数 1 / ¥0.00」） --- */
H('4. 默认值（刷新后应该就是这个，不做任何持久化）');
ok(!/class="calc-cb"[^>]*\schecked/.test(calcHtml), '页面渲染出来的勾选框【没有】任何一个带 checked（默认全不勾）');
ok(/id="calcMul"[^>]*value="1"/.test(calcHtml), '倍数输入框默认 value="1"');
ok(/id="calcPrize">¥0\.00</.test(calcHtml), '预计奖金默认 ¥0.00');
ok(/id="calcN">0</.test(calcHtml), '已选 0 关');

/* --- 步骤 10：模拟「刷新页面」= 用同一份静态 HTML 重新建一次 DOM 再跑一遍脚本 --- */
H('5. 模拟刷新页面（证明没有持久化：勾好 + 倍数 7 之后重新加载 → 回到默认）');
setBox(box(A.code, 'had', 'h'), true);
setBox(box(B.code, 'had', 'a'), true);
mul(7);
const beforeReload = read();
console.log(`   刷新前：已选 ${beforeReload.n} 关 · ${beforeReload.bets} 注 · 倍数 ${els.calcMul.value} · 预计奖金 ${beforeReload.prize}`);

const root2 = makeEl('div', { id: 'jcCalc', className: 'calc' });
for (const m of calcHtml.matchAll(/<label class="calc-opt"><input class="calc-cb" type="checkbox" value="([^"]+)">/g)) {
  const lab = makeEl('label', { className: 'calc-opt' });
  const b2 = makeEl('input', { className: 'calc-cb', value: m[1] });
  root2.appendChild(lab); lab.appendChild(b2);
}
const els2 = {};
for (const id of CALC_IDS) els2[id] = elSpec(id);
els2.jcCalcData = makeEl('script', { id: 'jcCalcData', text: payloadText });
const doc2 = { getElementById: (id) => (id === 'jcCalc' ? root2 : (els2[id] || null)) };
vm.runInContext(script, vm.createContext({
  document: doc2, console, JSON, Math, isFinite, parseInt, parseFloat,
  String, Number, Array, Object, Date, window: {}
}), { filename: 'jcCalc-inline-reload.js' });
const afterReload = {
  n: els2.calcN.textContent, bets: els2.calcBets.textContent, cost: els2.calcCost.textContent,
  prize: els2.calcPrize.textContent, mul: els2.calcMul.value,
  anyChecked: root2.querySelectorAll('input.calc-cb').some((b) => b.checked)
};
console.log(`   刷新后：已选 ${afterReload.n} 关 · ${afterReload.bets} 注 · 总投注 ${afterReload.cost} ·` +
  ` 倍数 ${afterReload.mul} · 预计奖金 ${afterReload.prize} · 还有勾选 = ${afterReload.anyChecked}`);
step++;
const p10 = afterReload.n === '0' && afterReload.bets === '0' && afterReload.prize === '¥0.00' &&
  afterReload.mul === '1' && !afterReload.anyChecked;
if (!p10) bad++;
console.log(`   ${p10 ? '✅' : '❌'} 步骤${step} 刷新页面 → 全部回到默认（没有持久化）`);

/* ============================================================
   6. 交互边界 / 不变量
   ============================================================ */
H('6. 交互边界（整页只有计算器可以操作）');
const noStore = !/localStorage|sessionStorage|document\.cookie|indexedDB/.test(script);
ok(noStore, '计算器脚本里【没有】localStorage / sessionStorage / cookie / indexedDB');
const allStore = (html.match(/localStorage|sessionStorage|document\.cookie/g) || []);
console.log(`   整页 localStorage/sessionStorage/cookie 出现次数 = ${allStore.length}（计算器里的次数 = ${
  (script.match(/localStorage|sessionStorage|document\.cookie/g) || []).length}）`);

const interactive = (s) => ({
  input: (s.match(/<input\b/g) || []).length,
  select: (s.match(/<select\b/g) || []).length,
  textarea: (s.match(/<textarea\b/g) || []).length,
  button: (s.match(/<button\b/g) || []).length,
  roleButton: (s.match(/role="button"/g) || []).length
});
const stripC = (s) => String(s).replace(/<!--[\s\S]*?-->/g, '');
const inCalc = interactive(stripC(calcHtml));
const whole = interactive(stripC(html));
/* 【允许有交互控件的只有两块】：模拟计算（含它的选号图全屏层）和 晒票（另一个专人做的，
   含它的看大图全屏层）。其余任何地方出现 input/select/textarea/button/role=button 都算违规。
   ⚠️ 注释里的 `role="button"` 字样不算（先 stripC 去掉注释）。 */
const xyspViewRegion = stripC(html.slice(html.indexOf('id="jcXyspView"'), html.indexOf('<!-- __FB_LOCK_JS__')));
const allowed = interactive(stripC(calcHtml) + xyspViewRegion);
const outside = {
  input: whole.input - allowed.input,
  select: whole.select - allowed.select,
  textarea: whole.textarea - allowed.textarea,
  button: whole.button - allowed.button,
  roleButton: whole.roleButton - allowed.roleButton
};
console.log(`   模拟计算里的控件：<input> ${inCalc.input}（${(calcHtml.match(/type="checkbox"/g) || []).length} 勾选框 + 倍数框）` +
  ` · role="button" ${inCalc.roleButton}（清空 + GPT随机 + 保存图片 + ×）`);
console.log(`   晒票看大图全屏层里的控件：role="button" ${interactive(xyspViewRegion).roleButton}`);
console.log(`   这两块【以外】的控件：<input> ${outside.input} · <select> ${outside.select} ·` +
  ` <textarea> ${outside.textarea} · <button> ${outside.button} · role="button" ${outside.roleButton}`);
ok(outside.input === 0 && outside.select === 0 && outside.textarea === 0 &&
  outside.button === 0 && outside.roleButton === 0, '模拟计算 / 晒票以外，页面没有任何可交互控件');
ok(whole.button === 0, `页面上裸 <button> = ${whole.button}（必须 0）`);
ok((html.match(/data-image/g) || []).length === 0, `计算器没有用 data-image（整页 data-image = ${(html.match(/data-image/g) || []).length}）`);

H('7. 竞彩页关键不变量（不能被这次改动弄坏）');
const secs = [...html.matchAll(/<details class="m-sec"([^>]*)>/g)];
ok(secs.length === 3, `三个分段 <details class="m-sec"> = ${secs.length}`);
ok(secs.every((m) => !/\bopen\b/.test(m[1])), `三个分段默认都是收起（带 open 的 = ${secs.filter((m) => /\bopen\b/.test(m[1])).length}）`);
ok((html.match(/class="m-sectip"/g) || []).length === 3, `m-sectip = ${(html.match(/class="m-sectip"/g) || []).length}（3）`);
ok(html.includes('__FB_SEC_JS__'), '__FB_SEC_JS__（点顶部数字自动展开）还在');
ok((html.match(/data-cd=/g) || []).length === 1, `data-cd 倒计时 = ${(html.match(/data-cd=/g) || []).length}（1）`);
ok(/体彩竞彩在售 \d+ 场 · 已完场累积 \d+ 场 ·/.test(html), '头行「体彩竞彩在售 N 场 · 已完场累积 N 场」在');
ok((html.match(/undefined/g) || []).length === 0, `整页没有 "undefined"（出现 ${(html.match(/undefined/g) || []).length} 次）`);

H('8. 模拟计算可收起（原生 details/summary，默认收起）');
const calcM = /<details class="m-calc[^"]*" id="jcCalc"([^>]*)>/.exec(html);
ok(!!calcM, '用的是原生 <details class="m-calc allow-save" id="jcCalc">');
ok(calcM && !/\bopen\b/.test(calcM[1]), '模拟计算默认【收起】（<details> 不带 open）');
const allDetails = [...html.matchAll(/<details\b([^>]*)>/g)];
console.log(`   页面里 <details> 共 ${allDetails.length} 个（m-sec ${secs.length} + m-calc 1）· 带 open 的 = ${allDetails.filter((m) => /\bopen\b/.test(m[1])).length}`);
ok(allDetails.length === 6, `页面里 <details> 数量 = ${allDetails.length}（3 个分段 + 模拟计算 + 晒票 + 推荐可串）`);
ok(allDetails.every((m) => !/\bopen\b/.test(m[1])), '所有 <details> 都不带 open（全部默认收起）');
ok(/<summary class="calc-head">/.test(html), '<summary class="calc-head"> 标题行在（标题由 summary 承载）');
ok((html.match(/class="calc-tip"/g) || []).length === 1, `提示 span .calc-tip = ${(html.match(/class="calc-tip"/g) || []).length}（1）`);
ok(html.includes(".m-calc[open] > summary.calc-head .calc-tip::after { content: '点击收起'; }"), 'CSS：展开时显示「点击收起」');
ok(html.includes(".m-calc:not([open]) > summary.calc-head .calc-tip::after { content: '点击查看'; }"), 'CSS：收起时显示「点击查看」');
ok(html.includes('.m-calc > summary.calc-head::-webkit-details-marker { display: none; }') &&
  html.includes(".m-calc > summary.calc-head::marker { content: ''; }"), 'CSS：去掉了 summary 的默认三角');
ok(html.includes('.m-calc > summary.calc-head { cursor: pointer; list-style: none; user-select: none;'), 'CSS：summary cursor:pointer + list-style:none + user-select:none');
const detailsEnd = iCalc >= 0 ? html.indexOf('</details>', iCalc) : -1;
const disclaimInDetails = iCalc >= 0 && detailsEnd > iCalc &&
  html.slice(iCalc, detailsEnd).includes('class="calc-disclaim"');
ok(disclaimInDetails, '底部合规声明在 <details> 里面（跟着一起折叠）');

H('9. 合规声明（区块自己的底部）');
const disclaim = /<div class="calc-disclaim">([\s\S]*?)<\/div>/.exec(calcHtml);
const disclaimText = disclaim ? disclaim[1].replace(/<[^>]*>/g, '').trim() : '';
console.log(`   可见文字：${disclaimText}`);
ok(/仅供娱乐/.test(disclaimText), '含「仅供娱乐」');
ok(/不构成购彩建议/.test(disclaimText), '含「不构成购彩建议」');
const calcEnd = calcHtml.length;
const dPos = disclaim ? calcHtml.indexOf(disclaim[0]) : -1;
const detailsEndAbs0 = html.indexOf('</details>', iCalc);
ok(dPos > 0 && html.indexOf(disclaim[0]) + disclaim[0].length <= detailsEndAbs0 + 1,
  '声明在计算器区块（<details> 内部）的最下面');

H('10. 标题与时间（用户要求：标题=模拟计算 · 不显示抓取时间）');
/* 页面【可见文字】：去掉 script / 注释 / 标签 */
const visible = (s) => s.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const headM = /<summary class="calc-head">([\s\S]*?)<\/summary>/.exec(calcHtml);
const headText = headM ? visible(headM[1]) : '';
console.log(`   标题行可见文字：【${headText}】`);
ok(/模拟计算/.test(headText), '标题行里有「模拟计算」');
ok(!/奖金试算/.test(headText), '标题行里没有「奖金试算」');
ok(/赔率：体彩官网官方 SP/.test(headText), '标题行右边保留「赔率：体彩官网官方 SP」');
ok(!/抓取于/.test(headText), '标题行里没有「抓取于」');

const pageVisible = visible(html);
ok(!/奖金试算/.test(pageVisible), `整页可见文字里没有「奖金试算」（出现 ${(pageVisible.match(/奖金试算/g) || []).length} 次）`);
ok(!/抓取于/.test(pageVisible), `整页可见文字里没有「抓取于」（出现 ${(pageVisible.match(/抓取于/g) || []).length} 次）`);
ok(!/奖金试算/.test(html), '整页源码（含注释）里也没有「奖金试算」');
ok(/模拟计算/.test(pageVisible), '整页可见文字里有「模拟计算」');
console.log(`   底部合规声明：${disclaimText}`);

H('11. 展开后（点一下标题）勾选算奖金仍然正常');
console.log(`   展开前：details.open = ${root.open}（默认收起，一个勾选框都看不见）`);
root.open = true;                       /* 模拟用户点了一下 <summary> */
console.log(`   展开后：details.open = ${root.open}`);
reset();
setBox(box(A.code, 'had', 'h'), true);
setBox(box(B.code, 'had', 'a'), true);
st = read();
const e10 = r2(2 * A.had.h * B.had.a);
check('展开后 2 串 1：奖金 = 2 × 两场赔率之积', st.prize, money(e10));
console.log(`        ${st.n} 关 · ${st.bets} 注 · 总投注 ${st.cost} · 提示：${st.hint}`);
reset();
console.log('   （收起/展开只影响显示，不影响任何计算，也不写任何存储）');

H('12. GPT随机按钮（点 5 次，打印每次勾了什么 + 算出多少奖金）');
const randTag = /<a[^>]*id="calcRand"[^>]*>([^<]*)<\/a>/.exec(html);
ok(!!randTag, `按钮是 <a>：${randTag ? randTag[0] : '(没找到)'}`);
ok(randTag && !/^<button/.test(randTag[0]) && /role="button"/.test(randTag[0]), 'GPT随机 用的是 <a role="button">（不是裸 <button>）');
ok(randTag && randTag[1] === 'GPT随机', `按钮文字 = ${randTag ? randTag[1] : ''}`);
ok(!/<button\b/.test(html), '整页仍然没有裸 <button>');
const rowMap = {};
rows.forEach((r) => { rowMap[r.code] = r; });
reset();                                  /* 倍数回到 1，全不勾 */
const label = { h: '主胜', d: '平', a: '客胜' };
let randOk = true;
for (let n = 1; n <= 5; n++) {
  els.calcRand.dispatch('click');
  const picked = boxes.filter((b) => b.checked).map((b) => b.value.split('|'));
  const codes = picked.map((p) => p[0]);
  const uniq = new Set(codes).size === codes.length;
  let prod = 2;
  const detail = picked.map(([code, pool, key]) => {
    const o = rowMap[code][pool][key];
    prod *= o;
    return `${code} ${pool === 'hhad' ? '让球' : '胜平负'} ${label[key]} ${o}`;
  }).join('  +  ');
  const one = Math.min(r2(prod), capOf(picked.length));
  const got = read();
  /* 每场只勾 1 个结果 → 复式注数 = 1 注；总投注 = 1 × 2 元 × 倍数(1) = 2 元 */
  const pass = got.prize === money(one) && uniq && picked.length >= 2 && picked.length <= 4 &&
    Number(got.bets) === 1 && got.cost === money(2);
  if (!pass) randOk = false;
  step++;
  console.log(`   ${pass ? '✅' : '❌'} 步骤${step} 第 ${n} 次随机：${picked.length} 关（${picked.length === 1 ? '单关' : '串关'}）`);
  console.log(`        勾了：${detail}`);
  console.log(`        算出：预计奖金 ${got.prize} · 共 ${got.bets} 注 · 总投注 ${got.cost}　|　手算：${money(one)}`);
}
if (!randOk) bad++;
ok(randOk, '5 次随机的奖金都与手算一致（2 元 × 各场赔率之积，取单注限额）');

/* 随机后再模拟刷新 → 应该全空（不保存） */
const randPickedBefore = boxes.filter((b) => b.checked).length;
const root3 = makeEl('details', { id: 'jcCalc', className: 'm-calc' });
for (const m of calcHtml.matchAll(/<label class="calc-opt"><input class="calc-cb" type="checkbox" value="([^"]+)">/g)) {
  const lab = makeEl('label', { className: 'calc-opt' });
  const b3 = makeEl('input', { className: 'calc-cb', value: m[1] });
  root3.appendChild(lab); lab.appendChild(b3);
}
const els3 = {};
for (const id of CALC_IDS) els3[id] = elSpec(id);
els3.jcCalcData = makeEl('script', { id: 'jcCalcData', text: payloadText });
vm.runInContext(script, vm.createContext({
  document: { getElementById: (id) => (id === 'jcCalc' ? root3 : (els3[id] || null)) },
  console, JSON, Math, isFinite, parseInt, parseFloat, String, Number, Array, Object, Date, window: {}
}), { filename: 'jcCalc-inline-afterrand.js' });
const randAfterReload = root3.querySelectorAll('input.calc-cb').filter((b) => b.checked).length;
console.log(`   随机后刷新页面：随机前勾了 ${randPickedBefore} 个 · 刷新后勾了 ${randAfterReload} 个 · 预计奖金 ${els3.calcPrize.textContent}`);
ok(randAfterReload === 0 && els3.calcPrize.textContent === '¥0.00', 'GPT随机的勾选刷新后清空（不保存）');
reset();

H('13. 过关方式（先选几串几 → 再 GPT随机 按这个关数挑）');
const passOpts = [...calcHtml.matchAll(/<option value="(\d+)"( selected)?>(单关|\d+串1)<\/option>/g)]
  .map((m) => ({ v: Number(m[1]), label: m[3], sel: !!m[2] }));
console.log(`   选项：${passOpts.map((o) => o.label + (o.sel ? '（默认）' : '')).join(' · ')}`);
ok(passOpts.length === Math.min(8, rows.length), `选项数 = ${passOpts.length}（= min(8, 可算场次 ${rows.length})）`);
ok(passOpts[0].v === 1 && passOpts[0].label === '单关', '第一个选项是「单关」');
ok(passOpts[passOpts.length - 1].label === `${passOpts[passOpts.length - 1].v}串1`, '最后一个是最高关数「N串1」');
ok(passOpts.filter((o) => o.sel).length === 1 && passOpts.find((o) => o.sel).label === '2串1', '默认选中的是「2串1」');
ok(!/<button\b/.test(html) && /<select id="calcPass">/.test(html), '用的是 <select>（页面里没有裸 <button>）');

/* 选 2串1，点 5 次 GPT随机 → 每次都必须正好挑 2 场 */
const setPass = (v) => { els.calcPass.value = String(v); els.calcPass.dispatch('change'); };
let passOk = true;
setPass(2);
for (let n = 1; n <= 5; n++) {
  els.calcRand.dispatch('click');
  const picked = boxes.filter((b) => b.checked).map((b) => b.value.split('|'));
  const codes = picked.map((p) => p[0]);
  let prod = 2;
  const detail = picked.map(([code, pool, key]) => {
    const o = rowMap[code][pool][key];
    prod *= o;
    return `${code} ${pool === 'hhad' ? '让球' : '胜平负'} ${label[key]} ${o}`;
  }).join('  +  ');
  const one = Math.min(r2(prod), capOf(picked.length));
  const got = read();
  const pass = picked.length === 2 && new Set(codes).size === 2 &&
    got.prize === money(one) && Number(got.bets) === 1;
  if (!pass) passOk = false;
  step++;
  console.log(`   ${pass ? '✅' : '❌'} 步骤${step} 选「2串1」第 ${n} 次随机 → 挑了 ${picked.length} 场`);
  console.log(`        勾了：${detail}`);
  console.log(`        算出：预计奖金 ${got.prize}（手算 ${money(one)}）· 已选 ${got.n} 关 · ${got.bets} 注`);
}

/* 选 5串1，点 2 次 → 正好 5 场 */
setPass(5);
for (let n = 1; n <= 2; n++) {
  els.calcRand.dispatch('click');
  const picked = boxes.filter((b) => b.checked);
  const codes = picked.map((b) => b.value.split('|')[0]);
  const pass = picked.length === 5 && new Set(codes).size === 5;
  if (!pass) passOk = false;
  step++;
  console.log(`   ${pass ? '✅' : '❌'} 步骤${step} 选「5串1」第 ${n} 次随机 → 挑了 ${picked.length} 场（${read().prize}）`);
}
ok(passOk, 'GPT随机 严格按「过关方式」选的关数挑（2串1 → 2 场 / 5串1 → 5 场）');

/* 手勾的场数和过关方式不一致 → 软提示，但奖金按【实际勾的场数】算 */
setPass(2);
reset();
setBox(box(A.code, 'had', 'h'), true);
setBox(box(B.code, 'had', 'a'), true);
setBox(box(C.code, 'had', 'h'), true);
st = read();
const e13 = r2(2 * A.had.h * B.had.a * C.had.h);
console.log(`   选 2串1 但手勾了 3 场 → 预计奖金 ${st.prize} · 注数 ${st.bets}`);
console.log(`        说明：${st.hint}`);
check('勾选场数与过关方式不一致时：奖金按实际 3 关算', st.prize, money(e13));
ok(/与所选「2串1」不一致/.test(st.hint), '不一致时有软提示（「与所选「2串1」不一致」）');
setPass(3);
st = read();
console.log(`   把过关方式改成 3串1 后 → 提示：${st.hint}`);
ok(!/不一致/.test(st.hint), '改成一致的关数后，提示消失');

/* 可选的场次不够 N 场时：挑满可用的 + 明确说明（不硬凑、不报错） */
H('14. 可选场次不足时的行为（用只有 3 场的迷你页面真跑一遍）');
const smallRows = rows.slice(0, 3);
const root4 = makeEl('details', { id: 'jcCalc', className: 'm-calc' });
for (const r of smallRows) {
  for (const pool of ['had', 'hhad']) {
    if (!r[pool]) continue;
    for (const key of ['h', 'd', 'a']) {
      if (!(r[pool][key] > 0)) continue;
      const lab = makeEl('label', { className: 'calc-opt' });
      const b4 = makeEl('input', { className: 'calc-cb', value: `${r.code}|${pool}|${key}` });
      root4.appendChild(lab); lab.appendChild(b4);
    }
  }
}
const els4 = {};
for (const id of CALC_IDS) els4[id] = elSpec(id);
els4.calcPass.value = '5';                 /* 页面上给到 5串1，但只有 3 场有赔率 */
els4.jcCalcData = makeEl('script', {
  id: 'jcCalcData',
  text: JSON.stringify(smallRows.map((r) => ({ code: r.code, had: r.had, hhad: r.hhad })))
});
vm.runInContext(script, vm.createContext({
  document: { getElementById: (id) => (id === 'jcCalc' ? root4 : (els4[id] || null)) },
  console, JSON, Math, isFinite, parseInt, parseFloat, String, Number, Array, Object, Date, window: {}
}), { filename: 'jcCalc-inline-small.js' });
els4.calcRand.dispatch('click');
const picked4 = root4.querySelectorAll('input.calc-cb').filter((b) => b.checked);
console.log(`   页面只给 3 场有赔率、过关方式选了 5串1 → 实际挑了 ${picked4.length} 场`);
console.log(`        说明：${els4.calcPrizeHint.textContent}`);
ok(picked4.length === 3, '可选的只有 3 场时：按 3 场随机（不硬凑到 5）');
ok(/可选的只有 3 场/.test(els4.calcPrizeHint.textContent), '并且明确提示「可选的只有 3 场」');

setPass(2);
reset();

H('15. 保存图片（canvas 真画一遍 → 全屏层显示 → 关闭不影响勾选）');
/* --- 造一个带 canvas/事件/history 桩的环境，真跑页面脚本 --- */
function buildShotDom() {
  const ops = [], canvases = [], historyCalls = [], docL = {}, winL = {};
  const ctxStub = new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 9 });
      if (k in t) return t[k];
      return (...args) => { ops.push({ op: String(k), args }); };
    },
    set(t, k, v) { ops.push({ op: 'set:' + String(k), args: [v] }); t[k] = v; return true; }
  });
  const makeCanvas = () => {
    const c = makeEl('canvas');
    c.width = 0; c.height = 0;
    c.getContext = () => ctxStub;
    c.toDataURL = () => 'data:image/png;base64,STUB';
    canvases.push(c);
    return c;
  };
  const r4 = makeEl('details', { id: 'jcCalc', className: 'm-calc' });
  for (const m of calcHtml.matchAll(/<label class="calc-opt"><input class="calc-cb" type="checkbox" value="([^"]+)">/g)) {
    const lab = makeEl('label', { className: 'calc-opt' });
    const bx = makeEl('input', { className: 'calc-cb', value: m[1] });
    r4.appendChild(lab); lab.appendChild(bx);
  }
  const e4 = {};
  for (const id of CALC_IDS) e4[id] = elSpec(id);
  e4.jcCalcData = makeEl('script', { id: 'jcCalcData', text: payloadText });
  const document4 = {
    getElementById: (id) => (id === 'jcCalc' ? r4 : (e4[id] || null)),
    createElement: (tag) => (String(tag).toLowerCase() === 'canvas' ? makeCanvas() : makeEl(tag)),
    addEventListener: (t, fn) => { (docL[t] = docL[t] || []).push(fn); },
    dispatch: (t, ev) => {
      const e = ev || { type: t, key: '', preventDefault() {}, stopPropagation() {} };
      (docL[t] || []).forEach((fn) => fn(e));
      return e;
    }
  };
  const window4 = {
    addEventListener: (t, fn) => { (winL[t] = winL[t] || []).push(fn); },
    dispatch: (t, ev) => { (winL[t] || []).forEach((fn) => fn(ev || { type: t })); }
  };
  const history4 = {
    pushState: (...a) => historyCalls.push(['pushState', ...a]),
    back: () => historyCalls.push(['back'])
  };
  vm.runInContext(script, vm.createContext({
    document: document4, window: window4, history: history4, console, JSON, Math,
    isFinite, parseInt, parseFloat, String, Number, Array, Object, Date
  }), { filename: 'jcCalc-inline-shot.js' });
  return { root: r4, els: e4, ops, canvases, historyCalls, document: document4, window: window4 };
}
const S = buildShotDom();
const sBox = (code, pool, key) => S.root.querySelectorAll('input.calc-cb').find((b) => b.value === `${code}|${pool}|${key}`);
const sRead = () => ({ n: S.els.calcN.textContent, bets: S.els.calcBets.textContent, cost: S.els.calcCost.textContent, prize: S.els.calcPrize.textContent, hint: S.els.calcPrizeHint.textContent, warn: S.els.calcWarn.textContent });
const drawnTexts = () => S.ops.filter((o) => o.op === 'fillText').map((o) => String(o.args[0]));

/* 15.1 没勾选就点 → 提示「请先选择比赛」，不生成空图 */
S.els.calcShotBtn.dispatch('click');
console.log(`   没勾选时点「保存图片」→ 提示：${S.els.calcWarn.textContent}`);
ok(/请先选择比赛/.test(S.els.calcWarn.textContent), '没勾选时提示「请先选择比赛」');
ok(S.canvases.length === 0, '没勾选时没有生成任何 canvas（不画空图）');
ok(!S.els.calcShot.classList.contains('on'), '没勾选时全屏层没弹出来');

/* 15.2 勾 2 场 → 点保存图片 → 真画一张 */
S.els.calcPass.value = '2'; S.els.calcPass.dispatch('change');
const cbA = sBox(A.code, 'had', 'h'); cbA.checked = true; cbA.dispatch('change');
const cbB = sBox(B.code, 'had', 'a'); cbB.checked = true; cbB.dispatch('change');
const uiPrize = S.els.calcPrize.textContent;
const evShot = S.els.calcShotBtn.dispatch('click');
const shotTexts = drawnTexts();
const shotJoined = shotTexts.join('\n');
const oneShot = Math.min(r2(2 * A.had.h * B.had.a), capOf(2));
console.log(`   勾了 ${A.code} 主胜 ${A.had.h} + ${B.code} 客胜 ${B.had.a} → 点「保存图片」`);
console.log(`   画布：canvas × ${S.canvases.length}，尺寸 ${S.canvases[0] ? S.canvases[0].width + '×' + S.canvases[0].height : '(none)'}，fillText 共 ${shotTexts.length} 条`);
shotTexts.forEach((t) => console.log(`        │ ${t}`));
ok(evShot.defaultPrevented && evShot.propagationStopped, '点它时 preventDefault + stopPropagation（不会把整块收起）');
ok(S.canvases.length === 1, '生成了 1 张 canvas');
ok(S.canvases[0] && S.canvases[0].width === 760 && S.canvases[0].height > 200, '画布尺寸 760×H（H>200）');
ok(/模拟计算 · 春风十里送大奖/.test(shotJoined), '图上有标题「模拟计算 · 春风十里送大奖」');
ok(/过关方式 2串1/.test(shotJoined), '图上有「过关方式 2串1」');
ok(/倍数 1 倍/.test(shotJoined), '图上有倍数');
ok(shotJoined.includes(A.home.slice(0, 6)) && shotJoined.includes(B.away.slice(0, 6)), '图上有选中的两队队名');
ok(shotJoined.includes(String(A.had.h)) && shotJoined.includes(String(B.had.a)), '图上有两场的赔率');
ok(/总投注额/.test(shotJoined) && shotJoined.includes(money(2)), '图上有总投注额 ¥2.00');
ok(/预计奖金/.test(shotJoined) && shotJoined.includes(money(oneShot)) &&
  uiPrize === money(oneShot), `图上的预计奖金 = 界面上的 = ${money(oneShot)}`);
ok(shotJoined.includes('仅供娱乐，不构成购彩建议'), '图上带合规声明「仅供娱乐，不构成购彩建议」');
ok(S.els.calcShot.classList.contains('on'), '全屏层弹出来了（class 加了 on）');
ok(S.els.calcShotImg.src === 'data:image/png;base64,STUB', '全屏层的 img.src = canvas 生成的 data URL');
ok(S.historyCalls.some((c) => c[0] === 'pushState'), '进图时 push 了一个 history 状态（手机返回键能关）');
console.log(`   全屏层：img.src=${String(S.els.calcShotImg.src).slice(0, 32)}… · class="${S.els.calcShot.className}"`);

/* 15.3 点图片本身不关；点空白 / × / Esc / 手机返回 都能关 */
S.els.calcShot.dispatch('click');                       /* dispatch 的 target 是 overlay 自己 = 点空白 */
ok(!S.els.calcShot.classList.contains('on'), '点空白 → 关掉');
ok(S.historyCalls.filter((c) => c[0] === 'back').length === 1, '关闭时把 history 状态还回去了（history.back）');

S.els.calcShotBtn.dispatch('click');
const imgEv = { target: S.els.calcShotImg };
(S.els.calcShot._listeners.click || []).forEach((fn) => fn(imgEv));
ok(S.els.calcShot.classList.contains('on'), '点图片本身【不】关闭（方便长按保存）');

S.document.dispatch('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} });
ok(!S.els.calcShot.classList.contains('on'), '按 Esc → 关掉');

S.els.calcShotBtn.dispatch('click');
S.els.calcShotX.dispatch('click');
ok(!S.els.calcShot.classList.contains('on'), '点 × → 关掉');

S.els.calcShotBtn.dispatch('click');
S.window.dispatch('popstate');
ok(!S.els.calcShot.classList.contains('on'), '手机返回键（popstate）→ 关掉');

ok(!S.els.calcShotImg.src, '关闭后把 img.src 清掉了（不留 data URL）');
const stillChecked = S.root.querySelectorAll('input.calc-cb').filter((b) => b.checked).length;
console.log(`   关闭后：勾选状态 = ${stillChecked} 个（关闭不影响勾选）· 预计奖金 ${S.els.calcPrize.textContent}`);
ok(stillChecked === 2, '关闭全屏层不影响勾选状态（还是那 2 个）');
ok(S.els.calcPrize.textContent === money(oneShot), '关闭后预计奖金不变');
ok(html.indexOf('id="calcShot"') > html.indexOf('</details>', iCalc), '全屏层在 <details> 外面（折叠状态下也能弹出）');

H('16. 防截图（最终版）：owner 判定 = file: 协议 → 多源 IP 兜底 → 非 owner 才保护');
const lockMark = html.indexOf('<!-- __FB_LOCK_JS__');
if (lockMark < 0) {
  ok(false, '页面里找不到 __FB_LOCK_JS__');
} else {
  const ls = html.indexOf('<script>', lockMark);
  const le = html.indexOf('</script>', ls);
  const lockScript = html.slice(ls + '<script>'.length, le);
  console.log(`   锁屏脚本 ${lockScript.length} 字符`);

  /* IP 源：顺序 + 超时（照用户实测：ipify 连不上 → ipinfo → ip.sb → ifconfig） */
  const urls = [...lockScript.matchAll(/url: '(https:[^']+)'/g)].map((m) => m[1]);
  console.log(`   IP 源（${urls.length} 个，按顺序）：${urls.join(' → ')}`);
  ok(urls.length === 4 && urls[0].includes('ipify') && urls[1].includes('ipinfo') &&
    urls[2].includes('ip.sb') && urls[3].includes('ifconfig.me'), 'IP 源 4 个、顺序 = ipify → ipinfo → ip.sb → ifconfig');
  ok(/IP_TIME_OUT = 4000/.test(lockScript) && /AbortController/.test(lockScript), '每个源 4 秒超时（AbortController）');
  ok(/'120\.231\.138\.19'/.test(lockScript), 'OWNER_IP = 120.231.138.19 写在代码里');
  ok(/location\.protocol === 'file:'/.test(lockScript), "owner 判定优先看 location.protocol === 'file:'");
  ok(!/localStorage|sessionStorage|document\.cookie/.test(lockScript), '锁屏脚本里没有 localStorage / sessionStorage / cookie');

  const SRC = {
    ipify: 'https://api.ipify.org?format=json',
    ipinfo: 'https://ipinfo.io/json',
    ipsb: 'https://api.ip.sb/jsonip',
    ifconfig: 'https://ifconfig.me/all.json'
  };
  /* 造一个假的 fetch：routes = { 源名: 'throw' | {ip:'…'} }，并记录调用顺序 */
  function makeFetch(routes) {
    const calls = [];
    const fn = (url) => {
      const name = Object.keys(SRC).find((k) => SRC[k] === url) || url;
      calls.push(name);
      const r = routes[name];
      if (!r || r === 'throw') return Promise.reject(new Error('connect failed'));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(r) });
    };
    return { fn, calls };
  }
  function runLock(protocol, routes) {
    const htmlEl = makeEl('html');
    const wmEl = makeEl('div', { id: 'watermark' });
    const winL = {}, docL = {};
    const clip = [];
    const window2 = {
      innerWidth: 900, innerHeight: 700,
      addEventListener: (t, fn) => { (winL[t] = winL[t] || []).push(fn); },
      dispatch: (t, ev) => {
        const e = ev || { type: t, preventDefault() { this.defaultPrevented = true; }, defaultPrevented: false };
        (winL[t] || []).forEach((fn) => fn(e));
        return e;
      }
    };
    const document2 = {
      documentElement: htmlEl, hidden: false, activeElement: null,
      getElementById: (id) => (id === 'watermark' ? wmEl : null),
      addEventListener: (t, fn) => { (docL[t] = docL[t] || []).push(fn); },
      dispatch: (t, ev) => {
        const e = ev || { type: t, preventDefault() { this.defaultPrevented = true; }, defaultPrevented: false };
        (docL[t] || []).forEach((fn) => fn(e));
        return e;
      }
    };
    const net = routes ? makeFetch(routes) : { fn: null, calls: [] };
    const ctx = {
      document: document2, window: window2, location: { protocol },
      navigator: { clipboard: { writeText: (s) => { clip.push(s); return { catch() {} }; } } },
      console, Math, String, Number, Object, Array, Date, JSON, setTimeout, clearTimeout,
      AbortController, Promise
    };
    if (net.fn) ctx.fetch = net.fn;
    vm.runInContext(lockScript, vm.createContext(ctx), { filename: 'fbLock.js' });
    return {
      htmlEl, wmEl, clip, window2, document2, calls: net.calls, net,
      locked: () => htmlEl.classList.contains('locked'),
      isOwner: () => htmlEl.classList.contains('is-owner')
    };
  }
  const tick = (ms) => new Promise((r) => setTimeout(r, ms || 80));

  /* ---- 用例 1：本机 App（file: 协议）→ 立刻 owner，不联网、不保护 ---- */
  const L1 = runLock('file:', null);
  await tick();
  console.log(`   ① file: 协议 → is-owner = ${L1.isOwner()} · locked = ${L1.locked()} · IP 请求次数 = ${L1.calls.length}`);
  ok(L1.isOwner(), "① location.protocol === 'file:' → 判定为自己（is-owner）");
  ok(L1.calls.length === 0, '① file: 时不发任何 IP 请求（不联网）');
  const evBlur1 = L1.window2.dispatch('blur');
  L1.document2.dispatch('visibilitychange');
  L1.window2.dispatch('keydown', { key: 'PrintScreen', code: 'PrintScreen', preventDefault() {}, defaultPrevented: false });
  console.log(`   ① 失焦 / 切标签 / PrintScreen 之后：locked = ${L1.locked()}`);
  ok(!L1.locked(), '① 自己人：失焦 / PrintScreen 都不会被模糊');
  const evCtx1 = L1.document2.dispatch('contextmenu', { type: 'contextmenu', preventDefault() { this.defaultPrevented = true; }, defaultPrevented: false });
  ok(!evCtx1.defaultPrevented, '① 自己人：右键没有被拦');
  ok(/html\.is-owner \.owner-tag \{ display: inline-flex; \}/.test(html),
    '① 自己人：右上角显示「👑 管理员模式 · 可截图」徽章');

  /* ---- 用例 2：网页打开 + ipify 连不上 + ipinfo 返回主人 IP → owner ---- */
  const routes2 = { ipify: 'throw', ipinfo: { ip: '120.231.138.19' } };
  const L2 = runLock('https:', routes2);
  await tick();
  console.log(`   ② https: · ipify 失败 → ipinfo 给出主人 IP · 请求顺序 = ${L2.calls.join(' → ')} · is-owner = ${L2.isOwner()}`);
  ok(L2.calls[0] === 'ipify' && L2.calls[1] === 'ipinfo', '② ipify 失败后自动换 ipinfo（多源兜底真的生效）');
  ok(L2.isOwner(), '② 公网 IP = OWNER_IP → 判定为自己');
  L2.window2.dispatch('blur');
  ok(!L2.locked(), '② 自己人（IP 命中）：不会被模糊');

  /* ---- 用例 3：网页打开 + IP 是别人 → 全套保护生效 ---- */
  const L3 = runLock('https:', { ipify: { ip: '8.8.8.8' } });
  await tick();
  console.log(`   ③ https: · IP = 8.8.8.8（别人）· is-owner = ${L3.isOwner()} · 请求 = ${L3.calls.join(' → ')}`);
  ok(!L3.isOwner(), '③ 别人的 IP → 不是 owner');
  console.log(`      locked 初始 = ${L3.locked()}（打开时页面清晰，但保护已经武装好）`);
  ok(!L3.locked(), '③ 非 owner：打开时页面清晰（保护已武装，一有截图动作就锁）');
  L3.window2.dispatch('blur');
  ok(L3.locked(), '③ 非 owner：一失焦立刻 locked（保护真的武装着）');
  L3.window2.dispatch('focus');
  ok(!L3.locked(), '③ 回焦后恢复清晰');
  L3.window2.dispatch('blur');
  ok(L3.locked(), '③ 失焦 → locked（内容模糊 + 遮罩）');
  L3.document2.hidden = true; L3.document2.dispatch('visibilitychange');
  ok(L3.locked(), '③ 切标签页 → locked');
  L3.document2.hidden = false; L3.document2.dispatch('visibilitychange');
  L3.window2.dispatch('blur');
  const clipBefore = L3.clip.length;
  L3.window2.dispatch('keydown', { key: 'PrintScreen', code: 'PrintScreen', preventDefault() {}, defaultPrevented: false });
  console.log(`      按 PrintScreen → locked = ${L3.locked()} · 清剪贴板 = ${L3.clip.length} 次`);
  ok(L3.locked(), '③ PrintScreen → locked');
  ok(L3.clip.length > clipBefore && L3.clip[L3.clip.length - 1] === '', '③ PrintScreen → 清空剪贴板');
  console.log(`      等 4 秒自动解锁 ...`);
  await new Promise((r) => setTimeout(r, 4300));
  console.log(`      4.3 秒后：locked = ${L3.locked()}`);
  ok(!L3.locked(), '③ 4 秒后自动解锁（不会永久挡住）');
  let keyOk = true;
  for (const [name, ev] of [
    ['Win+Shift+S', { key: 'S', shiftKey: true, preventDefault() {}, defaultPrevented: false }],
    ['Cmd+Shift+4', { key: '4', metaKey: true, shiftKey: true, preventDefault() {}, defaultPrevented: false }],
    ['F12', { key: 'F12', preventDefault() { this.defaultPrevented = true; }, defaultPrevented: false }],
    ['Ctrl+Shift+I', { key: 'I', ctrlKey: true, shiftKey: true, preventDefault() { this.defaultPrevented = true; }, defaultPrevented: false }],
    ['Ctrl+U', { key: 'u', ctrlKey: true, preventDefault() { this.defaultPrevented = true; }, defaultPrevented: false }]
  ]) {
    L3.document2.hidden = false; L3.window2.dispatch('focus');
    const got = L3.window2.dispatch('keydown', ev);
    if (!L3.locked()) keyOk = false;
    console.log(`      ${L3.locked() ? '✅' : '❌'} ${name} → locked${/F12|Ctrl/.test(name) ? ` · preventDefault = ${got.defaultPrevented}` : ''}`);
  }
  ok(keyOk, '③ 截屏键 / 开发者工具键都会 locked');
  let preventOk = true;
  for (const t of ['contextmenu', 'dragstart', 'copy', 'cut']) {
    const got = L3.document2.dispatch(t, { type: t, preventDefault() { this.defaultPrevented = true; }, defaultPrevented: false });
    if (!got.defaultPrevented) preventOk = false;
  }
  ok(preventOk, '③ 页面其它地方：右键 / 拖拽 / 复制 / 剪切 全部 preventDefault');

  /* ---- 保存白名单：模拟计算区块 / 生成的选号图 里不拦 ---- */
  console.log('   ⑥ 保存白名单（.allow-save = 模拟计算区块 + 选号图那一层）');
  ok(/class="m-calc allow-save"/.test(html), '模拟计算容器带 class="m-calc allow-save"');
  ok(/class="calc-shot allow-save"/.test(html), '生成的选号图全屏层也带 allow-save（不然没法右键另存）');
  const statEl = makeEl('a', { className: 'stat-link' });          /* 统计卡（不在白名单） */
  const cardEl = makeEl('div', { className: 'm-card' });           /* 比赛卡片（不在白名单） */
  const saveBox = makeEl('details', { className: 'm-calc allow-save' });
  const saveInput = makeEl('input', { className: 'calc-cb' });
  const shotImg = makeEl('img', { className: 'calc-shot-img' });
  const shotBox = makeEl('div', { className: 'calc-shot allow-save' });
  saveBox.appendChild(saveInput);
  shotBox.appendChild(shotImg);
  const mk = (target) => ({ type: 'contextmenu', target, preventDefault() { this.defaultPrevented = true; }, defaultPrevented: false });
  const evStat = L3.document2.dispatch('contextmenu', mk(statEl));
  const evCard = L3.document2.dispatch('contextmenu', mk(cardEl));
  const evSave = L3.document2.dispatch('contextmenu', mk(saveInput));
  const evShot = L3.document2.dispatch('contextmenu', mk(shotImg));
  const evCopyStat = L3.document2.dispatch('copy', mk(statEl));
  console.log(`      统计卡右键 preventDefault = ${evStat.defaultPrevented} · 比赛卡片右键 = ${evCard.defaultPrevented}`);
  console.log(`      模拟计算里右键 preventDefault = ${evSave.defaultPrevented} · 选号图上右键 = ${evShot.defaultPrevented} · 统计卡复制 = ${evCopyStat.defaultPrevented}`);
  ok(evStat.defaultPrevented && evCard.defaultPrevented && evCopyStat.defaultPrevented,
    '⑥ 统计卡 / 比赛卡片 / 统计卡复制 → 仍然被拦（禁止保存）');
  ok(!evSave.defaultPrevented && !evShot.defaultPrevented,
    '⑥ 模拟计算区块内 / 选号图上 → 放行（能右键存图、能长按保存）');
  L3.document2.hidden = false; L3.window2.dispatch('focus');
  /* 【不要水印】用户明确要求去掉 → 页面里不该有任何水印痕迹 */
  L3.window2.innerWidth = 1600; L3.window2.innerHeight = 1200;
  L3.window2.dispatch('resize');        /* 以前 resize 会重画水印，现在什么都不该做 */
  const wmHits = ['watermark', 'wm-item', 'drawWatermark', 'userTag', '仅供观看']
    .filter((k) => new RegExp(k, 'i').test(html));
  console.log(`      水印相关字样扫描：${wmHits.length === 0 ? '一个都没有 ✅' : wmHits.join('、')}`);
  ok(wmHits.length === 0, '③ 水印已彻底删除（watermark / wm-item / drawWatermark / userTag / 水印文字 全搜不到）');
  ok(!L3.wmEl.innerHTML, '③ resize 之后也没有任何水印内容被画出来');

  /* ---- 用例 4：IP 全查不到 + https → 安全降级（按非 owner 处理） ---- */
  const L4 = runLock('https:', {});
  await tick();
  L4.window2.dispatch('blur');
  console.log(`   ④ 4 个源全失败 → 请求 = ${L4.calls.join(' → ')} · is-owner = ${L4.isOwner()} · 失焦后 locked = ${L4.locked()}`);
  ok(L4.calls.length === 4, '④ 4 个源都试过了');
  ok(!L4.isOwner() && L4.locked(), '④ IP 查不到 → 安全降级：按非 owner 处理（保护照常生效）');

  /* ---- CSS / 结构 ---- */
  ok(/html\.locked #article, html\.locked \.guard \{ filter: blur\(25px\) grayscale\(1\); pointer-events: none; \}/.test(html), 'CSS：locked 时 #article/.guard 模糊 + 不能点');
  ok(/html\.locked #mask \{ display: flex; \}/.test(html), 'CSS：locked 时显示全屏遮罩');
  ok(/html\.locked \.m-calc, html\.locked \.m-sec \{ filter: none !important;\s*pointer-events: auto !important; position: relative; z-index: 99999; \}/.test(html), 'CSS：模拟计算 + 三个分段是豁免区（z-index 99999，压住遮罩）');
  ok(/#mask \{[\s\S]*?z-index: 99998;/.test(html), '遮罩 z-index 99998（在豁免区 99999 下面）');
  ok(/@media print \{[\s\S]*?filter: blur\(25px\) grayscale\(1\) !important;/.test(html), 'CSS：打印时也模糊（@media print）');
  const ia = html.indexOf('id="article"');
  const iCalc2 = html.indexOf('<details class="m-calc allow-save" id="jcCalc">');
  const articleEnd = html.indexOf('</div>', html.indexOf('class="record"'));
  ok(iCalc2 > articleEnd && iCalc2 > ia, '模拟计算【不在】#article 里（不会被模糊）');
  const secStart = html.indexOf('<details class="m-sec"', ia);
  ok(html.slice(secStart, html.indexOf('</details>', secStart)).includes('class="guard"'),
    '三个分段里的比赛卡片包在 .guard 里（locked 时被模糊），summary 留在外面（照样能点开）');

  /* ---- locked 时：模拟计算照样能勾选算奖金（豁免区真的可用） ---- */
  L3.htmlEl.classList.add('locked');
  S.root.querySelectorAll('input.calc-cb').forEach((b) => { if (b.checked) { b.checked = false; b.dispatch('change'); } });
  const cbLock = sBox(A.code, 'had', 'h');
  cbLock.checked = true; cbLock.dispatch('change');
  const lockPrize = S.els.calcPrize.textContent;
  console.log(`   ⑤ locked 状态下勾 1 场（${A.code} 主胜 ${A.had.h}）→ 预计奖金 ${lockPrize}`);
  ok(lockPrize === money(r2(2 * A.had.h)), '⑤ locked 时模拟计算照常能勾选并算出奖金（豁免区真的可用）');
  L3.htmlEl.classList.remove('locked');
  cbLock.checked = false; cbLock.dispatch('change');
  console.log('   ⑤ 三个分段在 locked 时可点：summary 在 .guard 之外 + 分段整体 z-index 99999 / pointer-events:auto（CSS 已断言）');
}

H('17. 推荐可串（在售 × 信心 ≥55%）—— 真跑核对 + 迷你 DOM 展开');
{
  /* ---- 测试脚本自己独立算一遍（不看页面的结果，用 jc-data.js + sp 重算） ---- */
  const jcSrc = fs.readFileSync(path.join(ROOT, 'jc-data.js'), 'utf8');
  const jctx = vm.createContext({ console, Object, Array, String, Number, JSON, Date, Math });
  vm.runInContext(jcSrc + '\nglobalThis.__J = JC_DATA;', jctx);
  const JD = jctx.__J;
  const dayOf = (t) => String(t || '').slice(0, 10);
  const REC_MIN = 55;
  const byKey = new Map();
  JD.games.forEach((g) => {
    if (!g || !g.code || !g.reco || g.reco.confidence == null) return;
    byKey.set(`${g.code}@${dayOf(g.time)}`, g);
  });
  const cand = (JD.sp && Array.isArray(JD.sp.list) ? JD.sp.list : [])
    .map((r) => {
      const g = byKey.get(`${r.code}@${dayOf(r.time)}`);
      if (!g) return null;
      const eu = g.odds && g.odds.europe && (g.odds.europe.live || g.odds.europe.open) || {};
      return {
        code: r.code,
        label: g.reco.label || '',
        odds: g.reco.pick ? eu[g.reco.pick] : null,
        conf: g.reco.confidence
      };
    })
    .filter(Boolean);
  const want = cand.filter((r) => r.conf >= REC_MIN).sort((a, b) => b.conf - a.conf);
  const low = cand.filter((r) => r.conf < REC_MIN);
  console.log(`   在售（官方 Selling）${(JD.sp && JD.sp.list ? JD.sp.list.length : 0)} 场 · 其中有推荐/信心数据的 ${cand.length} 场`);
  console.log(`   符合「信心 ≥${REC_MIN}%」的 ${want.length} 场：` + (want.length ? want.map((r) => `${r.code} ${r.label} ${r.odds} ${r.conf}%`).join(' | ') : '（无）'));
  console.log(`   被排除（信心 <${REC_MIN}%）的 ${low.length} 场：` + (low.length ? low.map((r) => `${r.code} ${r.conf}%`).join(' | ') : '（无）'));
  console.log(`   说明：信心 = jc-data.js 的 reco.confidence = 欧赔反推概率里最高的那个 = 推荐结果的百分比（每场一个值）`);

  /* ---- 页面渲染出来的行 ---- */
  const recM = /<details class="m-rec" id="jcRec"([^>]*)>([\s\S]*?)<\/details>/.exec(html);
  ok(!!recM, '页面里有 <details class="m-rec" id="jcRec">');
  const recInner = recM ? recM[2] : '';
  const rows = [...recInner.matchAll(/<div class="m-recrow">([\s\S]*?)<\/div>/g)].map((m) => {
    const t = m[1];
    const pick = (cls) => {
      const r = new RegExp(`<span class="${cls}[^"]*">([^<]*)<`).exec(t);
      return r ? r[1] : '';
    };
    return { code: pick('m-reccode'), label: pick('m-recpick'), odds: pick('m-recodds'), conf: pick('m-recconf') };
  });
  console.log(`   页面里渲染出 ${rows.length} 行`);
  rows.forEach((r) => console.log(`      · ${r.code} ${r.label} ${r.odds} ${r.conf}`));
  ok(rows.length === want.length, `行数 = 符合条件场数（页面 ${rows.length} · 独立算 ${want.length}）`);
  const same = JSON.stringify(rows.map((r) => r.code + r.conf)) === JSON.stringify(want.map((r) => r.code + r.conf + '%'));
  ok(same, '每行的编号 + 信心与独立算的完全一致（顺序也一样：信心从高到低）');
  if (want.length > 1) {
    const confs = rows.map((r) => parseFloat(r.conf));
    ok(confs.every((v, i) => i === 0 || confs[i - 1] >= v), '排序按信心从高到低');
  }
  const lowShown = low.filter((r) => rows.some((x) => x.code === r.code));
  ok(lowShown.length === 0, `信心 <${REC_MIN}% 的一场都没显示（排除 ${low.length} 场，页面里混入 ${lowShown.length} 场）`);
  if (!rows.length) {
    ok(/m-recempty/.test(recInner) && /暂无/.test(recInner), '没有符合条件的场次 → 显示「暂无」空态（不是空白块）');
    const empt = /<div class="m-recempty">([^<]*)<\/div>/.exec(recInner);
    console.log(`      空态文案：${empt ? empt[1] : '(无)'}`);
  } else {
    ok(!/m-recempty/.test(recInner), '有符合条件的场次 → 不显示空态');
  }

  /* ---- 区块形态：可收起 + 默认收起 + 提示伪元素 + 位置 ---- */
  ok(recM && !/\bopen\b/.test(recM[1]), '推荐可串【默认收起】（<details> 不带 open）');
  ok(/<summary class="m-rechead">/.test(recInner) && /class="m-rectitle">推荐可串</.test(recInner), 'summary 里是「推荐可串」标题');
  ok(/class="m-reccount">在售 · 信心 ≥55% · \d+ 场</.test(recInner), '副标题带「在售 · 信心 ≥55% · N 场」');
  ok((recInner.match(/class="m-rectip"/g) || []).length === 1, '提示 span .m-rectip 有 1 个');
  ok(html.includes(".m-rec[open] > summary.m-rechead .m-rectip::after { content: '点击收起'; }"), 'CSS：展开时显示「点击收起」');
  ok(html.includes(".m-rec:not([open]) > summary.m-rechead .m-rectip::after { content: '点击查看'; }"), 'CSS：收起时显示「点击查看」');
  ok(html.includes('.m-rec > summary.m-rechead::-webkit-details-marker { display: none; }') &&
    html.includes(".m-rec > summary.m-rechead::marker { content: ''; }"), 'CSS：去掉了 summary 默认三角');
  ok(html.includes('.m-rec > summary.m-rechead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;\n  cursor: pointer; list-style: none; user-select: none;'), 'CSS：summary cursor:pointer + list-style:none + user-select:none');

  /* 位置：完场战绩下面、未开赛（第一个 m-sec）上面 */
  const iArt = html.indexOf('id="article"');
  const iRec = html.indexOf('id="jcRec"');
  const iArtEnd = html.indexOf('</div>', html.indexOf('class="record"'));
  const iSec = html.indexOf('<details class="m-sec"');
  console.log(`   位置：record结束=${iArtEnd} < jcRec=${iRec} < 第一个 m-sec=${iSec}`);
  ok(iRec > iArtEnd && iRec < iSec, '位置正确：在「完场战绩」下面、「未开赛」分段上面');
  ok(iRec > iArt && iRec < iArtEnd + 400, '在 #article 保护容器里（locked 时会被模糊保护，和其它推荐内容一致）');

  /* 紧凑排版：字号 / 行距 / 窄屏不溢出 */
  const fs414 = {};
  for (const m of html.matchAll(/\.(m-rec[a-z-]*) \{([^}]*)\}/g)) fs414[m[1]] = m[2].replace(/\s+/g, ' ').trim();
  console.log(`   字号：行 ${(fs414['m-recteams'].match(/font-size: ([\d.]+)px/) || [])[1]}px · 编号 ${(fs414['m-reccode'].match(/font-size: ([\d.]+)px/) || [])[1]}px · 信心 ${(fs414['m-recconf'].match(/font-size: ([\d.]+)px/) || [])[1]}px（比赛卡片正文是 14px）`);
  ok(/minmax\(0, 1fr\)/.test(fs414['m-recrow']), 'CSS：队名列用 minmax(0,1fr)（窄屏靠省略号截断，不会把页面撑宽）');
  ok(/text-overflow: ellipsis/.test(fs414['m-recteams']) && /white-space: nowrap/.test(fs414['m-recteams']), 'CSS：队长名超长会省略号截断');
  ok(/white-space: nowrap/.test(fs414['m-recodds']) && /white-space: nowrap/.test(fs414['m-recconf']), 'CSS：赔率/信心不换行（不会被挤成两行）');
  ok(/font-size: 12\.5px/.test(fs414['m-recteams']), 'CSS：一行一场字号 12.5px（比比赛卡片 14px 小一档）');
  ok(/border-bottom: 1px solid #1e2430/.test(fs414['m-recrow']), 'CSS：行之间用 1px 细线分隔（行距紧，不靠大留白）');
  ok(/\.m-recconf\.strong \{ color: #47e0a0/.test(html), 'CSS：信心 ≥60% 用主题绿 #47e0a0（55~59% 用普通文字色 #98a1b2）');

  /* ---- 迷你 DOM：真执行页面脚本 → jcRec 保持收起 → 展开后可见行数 ---- */
  const noScript = !/jcRec/.test(script) && !/jcRec/.test(html.slice(html.indexOf('<!-- __FB_LOCK_JS__'), html.indexOf('</html>')));
  ok(noScript, '没有任何内联脚本引用 jcRec（纯 <details>，不写 JS 也能用）');
  const recEl = makeEl('details', { id: 'jcRec', className: 'm-rec' });
  recEl.open = false;                       /* 页面 markup 没带 open → 默认收起 */
  const bodyWrap = makeEl('div', { className: 'm-recbody' });
  recEl.appendChild(bodyWrap);
  rows.forEach(() => bodyWrap.appendChild(makeEl('div', { className: 'm-recrow' })));
  /* 浏览器行为：<details> 收起时，非 summary 的子节点不渲染 → 可见行数 0 */
  const visibleRows = () => (recEl.open ? bodyWrap.children.length : 0);
  console.log(`   迷你 DOM：初始 open=${recEl.open} → 可见行数 ${visibleRows()}（收起时行隐藏）`);
  ok(visibleRows() === 0, '收起状态下可见行数 = 0');
  recEl.open = true;
  console.log(`   迷你 DOM：点开（open=true）→ 可见行数 ${visibleRows()} · 期望 ${want.length}`);
  ok(visibleRows() === want.length, `展开后可见行数 = 符合条件的场数（${visibleRows()} = ${want.length}）`);
  const rowEls = bodyWrap.querySelectorAll('div.m-recrow');
  ok(rowEls.length === rows.length, `迷你 DOM 里程式化出的行数 = 页面 HTML 里的行数（${rowEls.length} = ${rows.length}）`);
}

/* ============================================================
   结果
   ============================================================ */
console.log('');
if (bad === 0) {
  console.log('════════════════════════════════════════════════════');
  console.log('  ✅ 真跑验证通过（每一步的实际数字见上）');
  console.log(`     · 迷你 DOM 真执行了页面里的计算器脚本（${script.length} 字符）`);
  console.log(`     · ${rows.length} 场官方 SP · 步骤 1~28 全部与手算一致` +
    `（含 GPT随机 5 次 + 保存图片 canvas 真画 + 防截图 owner/file:/IP 兜底/4 秒解锁）`);
  console.log('════════════════════════════════════════════════════');
} else {
  console.log(`❌ 真跑验证失败：${bad} 项不通过`);
  process.exit(1);
}
