/* core-algo.js —— 春风核心算法（自动取最新三期 · 用户 2026-10-18 选 A / 去掉 lastGold）
   输入：draws.js 的 HISTORY（每期 red 数组，按时间倒序）
   输出：{ pool20, kills, goldTail, silverTail, dltKills, basis }
   规则（照用户给的代码）：
     交叉相加减 → 减法杀号 → 金胆尾/银胆尾 → 大乐透跨彩种绝杀尾 → 剔杀 → 不足补到 20 码
*/
function coreAlgo(history, maxNum, isDLT, ssqHistory) {
  const unit = (n) => Math.abs(n) % 10;
  const ok = (n) => (n >= 1 && n <= maxNum ? n : null);
  if (!Array.isArray(history) || history.length < 3) return null;
  const B = history[0].red.map(Number);   /* 上期 */
  const A = history[1].red.map(Number);   /* 上上期 */
  const C = history[2].red.map(Number);   /* 上上上期 */
  const i6 = (arr) => (arr.length >= 6 ? arr[5] : arr[arr.length - 1]);

  /* ① 交叉相加减 */
  let pool = [];
  const add = (v) => { if (v !== null) pool.push(v); };
  add(ok(unit(A[0] * B[1])));
  add(ok(unit(A[0] * B[2])));
  add(ok(A[0] + B[2]));
  add(ok(A[0] + B[1]));
  add(ok(A[0] + unit(B[1])));
  add(ok(A[2] + unit(i6(B))));
  add(ok(A[3] - unit(i6(B))));
  add(ok(unit(A[3] - i6(B))));
  add(ok(unit(A[0] + i6(B))));
  pool = [...new Set(pool)].sort((a, b) => a - b);

  /* ② 减法杀号（全组两两相减 + 个位和） */
  let kills = [];
  for (let s = B.length - 1; s > 0; s--) {
    for (let t = s - 1; t >= 0; t--) {
      kills.push(ok(B[s] - B[t]));
      kills.push(ok(unit(B[s] - B[t])));
    }
  }
  kills.push(ok(unit(B.reduce((x, v) => x + unit(v), 0))));
  kills = [...new Set(kills.filter((n) => n !== null))].sort((a, b) => a - b);

  /* ③ 金胆尾（去掉 lastGold，只用 A/B 两期） */
  const goldTail = unit(unit(A[2] - A[1]) + unit(B[2] - B[1]) + unit(A[2] - A[0]) + unit(B[2] - B[0]));
  const goldPool = [];
  for (let i = 1; i <= maxNum; i++) if (unit(i) === goldTail) goldPool.push(i);

  /* ④ 银胆尾：B 第 1 位个位 + 第 6 位个位 */
  const silverTail = unit(unit(B[0]) + unit(i6(B)));
  const silverPool = [];
  for (let i = 1; i <= maxNum; i++) if (unit(i) === silverTail) silverPool.push(i);

  /* ⑤ 大乐透：用双色球最近两期的首尾个位做「绝杀尾」 */
  let dltKills = [];
  if (isDLT && Array.isArray(ssqHistory) && ssqHistory.length >= 2) {
    dltKills = ssqHistory.slice(0, 2).map((d) => {
      const r = d.red.map(Number);
      return unit(unit(r[0]) + unit(r[r.length - 1]));
    });
    dltKills = [...new Set(dltKills)];
  }

  /* ⑥ 汇总剔杀 + 不足补到 20 码 */
  let rec = [...new Set([...pool, ...goldPool, ...silverPool])]
    .filter((n) => !kills.includes(n))
    .filter((n) => !(isDLT && dltKills.some((t) => unit(n) === t)))
    .sort((a, b) => a - b);
  if (rec.length < 20) {
    /* 补足到 20 码（用户要求）：分三档放宽，尽量不碰杀号/绝杀尾
       ① 先补「既没被杀、也不在绝杀尾」的
       ② 不够再补「不在绝杀尾」的
       ③ 还不够就直接补（保证一定 20 码） */
    const bannedTail = (n) => isDLT && dltKills.some((t) => unit(n) === t);
    const all = Array.from({ length: maxNum }, (_, i) => i + 1);
    const take = (pred) => {
      for (const n of all) {
        if (rec.length >= 20) return;
        if (rec.includes(n)) continue;
        if (!pred(n)) continue;
        rec.push(n);
      }
    };
    take((n) => !kills.includes(n) && !bannedTail(n));
    take((n) => !bannedTail(n));
    take(() => true);
    rec.sort((a, b) => a - b);
  }
  return { pool20: rec, kills, goldTail, silverTail, dltKills, goldPool, silverPool, pool1: pool };
}
if (typeof module !== 'undefined') module.exports = { coreAlgo };
