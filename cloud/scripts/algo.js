/* ============================================================
   algo.js —— 号码筛选算法

   本文件是用户提供的 Python 算法的 JS 移植，逻辑保持一致：

     def shrink_lottery_numbers(winning_numbers, big_pool):
         winning_remainders = [n % 4 for n in winning_numbers]
         remainder_counts = Counter(winning_remainders)
         target_remainders = set(winning_remainders)
         filtered_pool = [n for n in big_pool if n % 4 in target_remainders]
         ...

   ⚠️ 定位说明：
     这是「按同余类分组」的号码整理工具，用于组织号码池。
     彩票每期独立随机，本算法不提高中奖概率，也不预测号码。
   ============================================================ */

/**
 * 按开奖号的「模 4 余数特征」筛选并分组大底号码
 *
 * @param {number[]} winningNumbers 开奖号码（或你指定的特征号码）
 * @param {number[]} bigPool        大底号码池
 * @param {number}   mod            取模基数，默认 4（对应原算法 n % 4）
 * @returns {{remainder:number, numbers:number[], weight:string}[]}
 */
function shrinkLotteryNumbers(winningNumbers, bigPool, mod) {
  const M = mod || 4;

  // 1. 计算开奖号特征余数
  const winningRemainders = winningNumbers.map((n) => n % M);

  // 2. 统计每个余数出现次数（对应 Python 的 Counter）
  const remainderCounts = new Map();
  winningRemainders.forEach((r) => {
    remainderCounts.set(r, (remainderCounts.get(r) || 0) + 1);
  });

  // 3. 目标余数集合
  const targetRemainders = new Set(winningRemainders);

  // 4. 过滤大底：余数在目标集合里的留下
  const filteredPool = bigPool.filter((n) => targetRemainders.has(n % M));

  // 5. 按余数分组
  const groups = new Map();
  filteredPool.forEach((num) => {
    const rem = num % M;
    if (!groups.has(rem)) groups.set(rem, []);
    groups.get(rem).push(num);
  });

  // 6. 整理输出（余数从小到大，号码升序）
  const result = [];
  [...groups.keys()].sort((a, b) => a - b).forEach((rem) => {
    const nums = groups.get(rem).slice().sort((a, b) => a - b);
    const count = remainderCounts.get(rem) || 0;
    result.push({
      remainder: rem,
      numbers: nums,
      weight: count + '组'
    });
  });

  return result;
}

/**
 * 把分组结果拉平成数组（方便直接填进号码池字段）
 */
function flattenShrinkResult(result) {
  const out = [];
  result.forEach((g) => g.numbers.forEach((n) => out.push(n)));
  return out;
}

/**
 * 生成分组的文字摘要（放进资料里存档）
 * 例：余0(2组): 04 08 12 …  |  余1(1组): 05 09 …
 */
function shrinkResultToText(result, mod) {
  const M = mod || 4;
  return result
    .map((g) => `余${g.remainder}（${g.weight}）：${g.numbers.map((n) => String(n).padStart(2, '0')).join(' ')}`)
    .join('\n');
}
