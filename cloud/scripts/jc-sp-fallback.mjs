/* 公开竞彩奖金页的 SP 原值兜底。只认未停售且允许过关的玩法，不拿欧赔代替。 */
export function parsePublishedSp(html, now = Date.now()) {
  const list = [], seen = new Set();
  const attr = (s, key) => {
    const m = new RegExp('(?:^|\\s)' + key + '=["\']([^"\']*)["\']', 'i').exec(s);
    return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : '';
  };
  for (const [, attrs, body] of String(html).matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    if (attr(attrs, 'data-isend') !== '0' || attr(attrs, 'data-isactive') !== '1') continue;
    const code = attr(attrs, 'data-matchnum'), date = attr(attrs, 'data-matchdate');
    const clock = attr(attrs, 'data-matchtime'), time = date + ' ' + clock;
    const kick = Date.parse(date + 'T' + clock.slice(0, 5) + ':00+08:00');
    const closeRaw = attr(attrs, 'data-buyendtime');
    const close = Date.parse(closeRaw.replace(' ', 'T') + '+08:00');
    if (!/^周[一二三四五六日]\d{3}$/.test(code) || !Number.isFinite(kick) || kick <= now || !Number.isFinite(close) || close <= now) continue;
    const home = attr(attrs, 'data-homesxname'), away = attr(attrs, 'data-awaysxname');
    if (!home || !away || seen.has(code + '@' + date)) continue;
    const flags = new Map(attr(attrs, 'data-subactive').split(',').map(v => v.split(':')));
    const pools = { nspf: {}, spf: {} };
    for (const [, a] of body.matchAll(/<p\b([^>]*)>/gi)) {
      const type = attr(a, 'data-type'), key = { 3: 'h', 1: 'd', 0: 'a' }[attr(a, 'data-value')];
      const value = Number(attr(a, 'data-sp'));
      if (pools[type] && key && Number.isFinite(value) && value > 1) pools[type][key] = value;
    }
    const valid = (type, flag) => flags.get(flag) === '1' && ['h', 'd', 'a'].every(k => pools[type][k] > 1);
    const had = valid('nspf', 'nspfgg') ? pools.nspf : null;
    const rawLine = attr(attrs, 'data-rangqiu'), line = Number(rawLine);
    const hhad = valid('spf', 'spfgg') && rawLine !== '' && Number.isInteger(line) ? { ...pools.spf, line: String(line) } : null;
    if (!had && !hhad) continue;
    seen.add(code + '@' + date);
    list.push({ code, time, home, away, league: attr(attrs, 'data-simpleleague'), matchNum: attr(attrs, 'data-processname'), had, hhad, saleEnd: closeRaw, parlay: { HAD: !!had, HHAD: !!hhad } });
  }
  return list;
}

export async function fetchPublishedSp({ now = Date.now(), fetchFn = fetch } = {}) {
  const url = 'https://trade.500.com/jczq/?playid=269&g=2';
  try {
    const r = await fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://trade.500.com/jczq/' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { ok: false, error: 'SP公开同步页 HTTP ' + r.status };
    const text = new TextDecoder('gb18030').decode(await r.arrayBuffer());
    const list = parsePublishedSp(text, now);
    if (!list.length) return { ok: false, error: 'SP公开同步页没有有效在售玩法' };
    return { ok: true, source: 'official-mirror', from: '公开竞彩奖金页同步的SP原值', sourceUrl: url, list, codes: list.map(r => r.code), teams: list.map(r => ({ home: r.home, away: r.away })), officialUpdate: '', inSale: list.length };
  } catch (e) { return { ok: false, error: 'SP公开同步页 ' + e.message }; }
}
