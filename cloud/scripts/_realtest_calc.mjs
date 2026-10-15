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
  el.dispatch = (t) => { (el._listeners[t] || []).forEach((fn) => fn({ target: el, type: t })); };
  el.appendChild = (c) => { c.parentNode = el; el.children.push(c); return c; };
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

const root = makeEl('div', { id: 'jcCalc', className: 'calc' });
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

const els = {};
for (const id of ['calcN', 'calcBets', 'calcCost', 'calcPrize', 'calcPrizeHint', 'calcWarn', 'calcMul', 'calcClear']) {
  const re = new RegExp(`id="${id}"[^>]*>`);
  const m = re.exec(calcHtml);
  const vm2 = m ? (/value="([^"]*)"/.exec(m[0]) || [, '']) [1] : '';
  const tag = m ? (/<([a-z]+)[^>]*id="/.exec(m[0]) || [, 'span'])[1] : 'span';
  els[id] = makeEl(tag, { id, value: vm2 || (id === 'calcMul' ? '1' : '') });
}
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
for (const id of ['calcN', 'calcBets', 'calcCost', 'calcPrize', 'calcPrizeHint', 'calcWarn', 'calcMul', 'calcClear']) {
  const m = new RegExp(`id="${id}"[^>]*>`).exec(calcHtml);
  const tag = m ? (/<([a-z]+)[^>]*id="/.exec(m[0]) || [, 'span'])[1] : 'span';
  const val = m ? ((/value="([^"]*)"/.exec(m[0]) || [, '']) [1]) : '';
  els2[id] = makeEl(tag, { id, value: id === 'calcMul' ? (val || '1') : val });
}
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
const inCalc = interactive(calcHtml);
const whole = interactive(html);
const outside = {
  input: whole.input - inCalc.input, select: whole.select - inCalc.select,
  textarea: whole.textarea - inCalc.textarea, button: whole.button - inCalc.button,
  roleButton: whole.roleButton - inCalc.roleButton
};
console.log(`   计算器里的控件：<input> ${inCalc.input}（${(calcHtml.match(/type="checkbox"/g) || []).length} 勾选框 + 倍数框）` +
  ` · role="button" ${inCalc.roleButton}（清空）`);
console.log(`   计算器【以外】的控件：<input> ${outside.input} · <select> ${outside.select} ·` +
  ` <textarea> ${outside.textarea} · <button> ${outside.button} · role="button" ${outside.roleButton}`);
ok(outside.input === 0 && outside.select === 0 && outside.textarea === 0 &&
  outside.button === 0 && outside.roleButton === 0, '页面上除计算器外没有任何可交互控件');
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

H('8. 合规声明（区块自己的底部）');
const disclaim = /<div class="calc-disclaim">([\s\S]*?)<\/div>/.exec(calcHtml);
const disclaimText = disclaim ? disclaim[1].replace(/<[^>]*>/g, '').trim() : '';
console.log(`   可见文字：${disclaimText}`);
ok(/仅供娱乐/.test(disclaimText), '含「仅供娱乐」');
ok(/不构成购彩建议/.test(disclaimText), '含「不构成购彩建议」');
const calcEnd = calcHtml.length;
const dPos = disclaim ? calcHtml.indexOf(disclaim[0]) : -1;
ok(dPos > 0 && dPos + disclaim[0].length >= calcEnd - 200, '声明在计算器区块的最下面');

/* ============================================================
   结果
   ============================================================ */
console.log('');
if (bad === 0) {
  console.log('════════════════════════════════════════════════════');
  console.log('  ✅ 真跑验证通过（每一步的实际数字见上）');
  console.log(`     · 迷你 DOM 真执行了页面里的计算器脚本（${script.length} 字符）`);
  console.log(`     · ${rows.length} 场官方 SP · 步骤 1~14 全部与手算一致`);
  console.log('════════════════════════════════════════════════════');
} else {
  console.log(`❌ 真跑验证失败：${bad} 项不通过`);
  process.exit(1);
}
