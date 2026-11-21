/* 仅修复尚未开奖期次的小档位；保留20码成员、历史资料和原值审计记录。 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const VERSION = 'gold-silver-freq-v1';
function load(root, file, name) {
  const c = {}; vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8') + ';globalThis.value=' + name, c);
  return c.value;
}
function repairUpcomingCoreTiers(root, saved, now = Date.now()) {
  const history = load(root, 'history.js', 'DRAW_HISTORY');
  const draws = load(root, 'draws.js', 'DRAW_DATA');
  const core = require(path.join(root, 'core-pool.js'));
  const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10), repairs = [];
  const numbers = v => [...new Set((String(v || '').match(/\d+/g) || []).map(Number))];
  const text = nums => nums.slice().sort((a, b) => a - b).map(n => String(n).padStart(2, '0')).join(' ');
  for (const gid of ['ssq', 'dlt']) {
    const latest = (history.games[gid] || [])[0], cp = core.corePoolFor(gid);
    if (!latest || !cp) continue;
    if (Number(draws.games[gid] && draws.games[gid].issue) > Number(latest.issue)) continue;
    const group = saved.tickets && saved.tickets[gid];
    if (!group) continue;
    const records = [...new Set([group.current, ...Object.entries(group).filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key)).map(([, value]) => value)].filter(Boolean))];
    const prefix = gid === 'ssq' ? 'r' : 'f', max = gid === 'ssq' ? 33 : 35;
    for (const rec of records) {
      if (!rec || !rec.images || rec.tierRankingVersion === VERSION) continue;
      const day = String(rec.date || '').slice(0, 10), issue = Number(rec.issue);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < today || !(issue > Number(latest.issue))) continue;
      if (!(now < Date.parse(day + 'T20:30:00+08:00'))) continue;
      const image = rec.images.main, pool = numbers(image && image[prefix + '20']);
      if (!image || pool.length !== 20 || pool.some(n => !Number.isInteger(n) || n < 1 || n > max)) continue;
      const rank = core.rankCorePool({ ...cp, pool20: pool }, history.games[gid]);
      const cold = new Set((String(image.wsl || '').match(/\d尾冷/g) || []).map(s => Number(s[0])));
      const before = {}, after = {}; let parent = rank;
      for (const count of [15, 10, 3, 1]) {
        const key = prefix + count;
        if (!Object.prototype.hasOwnProperty.call(image, key)) continue;
        const warm = parent.filter(n => !cold.has(n % 10));
        const order = count <= 3 && warm.length >= count ? warm : parent;
        const chosen = order.slice(0, count);
        before[key] = image[key]; after[key] = text(chosen); parent = chosen;
      }
      Object.assign(image, after);
      rec.tierRankingVersion = VERSION;
      rec.tierRepair = { version: VERSION, at: new Date(now).toISOString(), basisIssue: String(latest.issue), original: before };
      repairs.push({ gid, issue: String(rec.issue), before, after });
    }
  }
  return repairs;
}
module.exports = { repairUpcomingCoreTiers, VERSION };
