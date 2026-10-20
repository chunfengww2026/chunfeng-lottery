/* 名家图库抓取（第一版：10 个名家 × 5 张）
   源：Bing 图片搜索（实测可抓 ✗ 服务端渲染 ✔）
   用户 2026-10-21「把我刚刚要抓取的全部抓取丢到里面去」「开始」 */
import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const OUT_DIR = path.join(process.cwd(), 'imgs', 'mingjia');
const DATA = path.join(process.cwd(), 'mingjia-data.js');

/* 第一版先抓 10 个（分类 + 搜索词 ✗ 加限定词提高相关性 ✔） */
const NAMES = [
  /* ── 双色球（用户列的名家 ✗）── */
  { name: '太湖字谜', cat: '双色球', kw: '太湖字谜 双色球 图' },
  { name: '迷公', cat: '双色球', kw: '迷公 双色球 推荐图' },
  { name: '桃子姐', cat: '双色球', kw: '桃子姐 双色球 图' },
  { name: '迟丽颖', cat: '双色球', kw: '迟丽颖 双色球 图' },
  { name: '万里挑一', cat: '双色球', kw: '万里挑一 双色球 图' },
  { name: '青岛大磊', cat: '双色球', kw: '青岛大磊 双色球 图' },
  { name: '明哥看彩', cat: '双色球', kw: '明哥看彩 双色球 图' },
  { name: '岳阳飞飞', cat: '双色球', kw: '岳阳飞飞 双色球 图' },
  { name: '金手指', cat: '双色球', kw: '金手指 双色球 图' },
  { name: '九头鸟', cat: '双色球', kw: '九头鸟 双色球 图' },
  { name: '武汉华哥', cat: '双色球', kw: '武汉华哥 双色球 图' },
  { name: '貂蝉杀', cat: '双色球', kw: '貂蝉杀 双色球 图' },
  { name: '名家精', cat: '双色球', kw: '名家精 双色球 图' },
  { name: '鸭梨红', cat: '双色球', kw: '鸭梨红 双色球 图' },
  { name: '黄大仙', cat: '双色球', kw: '黄大仙 双色球 图' },
  { name: '东北人杀', cat: '双色球', kw: '东北人杀 双色球 图' },
  { name: '峨眉道姑', cat: '双色球', kw: '峨眉道姑 双色球 图' },
  { name: '蓝号迷', cat: '双色球', kw: '蓝号迷 双色球 蓝球 图' },
  { name: '林黛玉', cat: '双色球', kw: '林黛玉 双色球 图' },
  { name: '贾宝玉', cat: '双色球', kw: '贾宝玉 双色球 图' },
  { name: '司马迁', cat: '双色球', kw: '司马迁 双色球 图' },
  { name: '枣庄红人', cat: '双色球', kw: '枣庄红人 双色球 图' },
  { name: '一品红', cat: '双色球', kw: '一品红 双色球 图' },
  { name: '万万没想到', cat: '双色球', kw: '万万没想到 双色球 图' },
  { name: '夏天', cat: '双色球', kw: '夏天 双色球 图' },
  { name: '大招财运', cat: '双色球', kw: '大招财运 双色球 图' },
  { name: '奉旨发财', cat: '双色球', kw: '奉旨发财 双色球 图' },
  { name: '白天鹅', cat: '双色球', kw: '白天鹅 双色球 图' },
  { name: '百合花', cat: '双色球', kw: '百合花 双色球 图' },
  { name: '百步穿杨', cat: '双色球', kw: '百步穿杨 双色球 图' },
  { name: '蒲公英', cat: '双色球', kw: '蒲公英 双色球 图' },
  { name: '远方的狼', cat: '双色球', kw: '远方的狼 双色球 图' },
  { name: '那些年', cat: '双色球', kw: '那些年 双色球 图' },
  { name: '金枪鱼', cat: '双色球', kw: '金枪鱼 双色球 图' },
  { name: '青云万里', cat: '双色球', kw: '青云万里 双色球 图' },
  { name: '鲤鱼得财', cat: '双色球', kw: '鲤鱼得财 双色球 图' },
  { name: '朱大姐', cat: '双色球', kw: '朱大姐 双色球 蓝球 分析表' },
  { name: '南山大师', cat: '双色球', kw: '南山大师 双色球 图' },
  { name: '牛魔王', cat: '双色球', kw: '牛魔王 双色球 图' },
  /* ── 大乐透 ── */
  { name: '闪享', cat: '大乐透', kw: '闪享 大乐透 图' },
  { name: '幸丹丹', cat: '大乐透', kw: '幸丹丹 大乐透 图' },
  /* ── 其它彩种 ── */
  { name: '排三字谜', cat: '排列三', kw: '排三 3D 字谜 图' },
  { name: '3D字谜', cat: '3D', kw: '福彩3D 字谜 图' }
];

/* ===== 分类补齐 · 用户 2026-10-21 =====
   「图片对应放到这里面就行 / 篮球看是什么彩种就放到对应的彩种里面」
   → 每个类目补到至少 MJ_MIN 个；蓝球类摆到它所属的彩种（双色球蓝球 / 大乐透后区）。 */
const MJ_MIN = 8;
const MJ_FILL = [
  ['大乐透', ['太湖字谜', '迷公', '桃子姐', '迟丽颖', '九头鸟', '金手指', '万里挑一', '青岛大磊',
    '蓝球杀码', '蓝号迷', '篮球杀码']],
  ['3D', ['太湖字谜', '迷公', '桃子姐', '貂蝉杀', '名家精', '白天鹅', '百合花', '金手指']],
  ['排列三', ['排三字谜', '太湖字谜', '迷公', '桃子姐', '迟丽颖', '九头鸟', '金手指', '万里挑一']],
  ['快乐8', ['太湖字谜', '迷公', '排三字谜', '名家精', '金手指', '万里挑一', '桃子姐', '迟丽颖']],
  ['双色球', ['蓝球杀码', '蓝号迷', '篮球杀码']]
];
(function fillCats() {
  const cnt = {};
  NAMES.forEach((x) => { cnt[x.cat] = (cnt[x.cat] || 0) + 1; });
  for (const pair of MJ_FILL) {
    const cat = pair[0], pool = pair[1];
    for (const nm of pool) {
      if ((cnt[cat] || 0) >= MJ_MIN) break;
      if (NAMES.some((x) => x.name === nm && x.cat === cat)) continue;
      NAMES.push({ name: nm, cat: cat, kw: nm + ' ' + cat + ' 图' });
      cnt[cat] = (cnt[cat] || 0) + 1;
    }
  }
  const dist = {};
  NAMES.forEach((x) => { dist[x.cat] = (dist[x.cat] || 0) + 1; });
  console.log('  分类补齐后：' + Object.keys(dist).map((k) => k + ' ' + dist[k]).join(' · ') + '（共 ' + NAMES.length + ' 个名家）');
})();

/* MANY_NAMES · 用户 2026-10-21：每人 1 张，多抓几位 ✗ */
const PER_NAME = 1;
/* NEXT_ISSUE_KW · 用户 2026-10-21「一定要看好别人推荐有没有下一期的期数」
   → 关键词必须带【下一期】期号（别人推荐的是下一期 ✗） */
const NEXT_ISSUE = {"ssq":"2026121","dlt":"26120"};
NAMES.forEach(function (n) {
  var iss = '';
  if (n.cat === '双色球') iss = NEXT_ISSUE.ssq;
  else if (n.cat === '大乐透') iss = NEXT_ISSUE.dlt;
  if (iss) n.kw = n.kw + ' ' + iss + '期';
  /* 再加"推荐/预测"✗ 保证抓到的是下一期的分析 ✗ */
  if (n.kw.indexOf('推荐') < 0 && n.kw.indexOf('预测') < 0) n.kw = n.kw + ' 推荐';
});

function safeName(s) { return String(s).replace(/[\\/:*?"<>|]/g, '_'); }

async function bingImages(kw) {
  const u = 'https://www.bing.com/images/search?q=' + encodeURIComponent(kw) + '&form=HDRSC2&first=1';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' } });
      if (!r.ok) continue;
      const t = Buffer.from(await r.arrayBuffer()).toString('utf8');
      const a = [...t.matchAll(/murl&quot;:&quot;(https?:[^&]+?)&quot;/g)].map((m) => m[1]);
      const b = [...t.matchAll(/"murl":"(https?:[^"]+?)"/g)].map((m) => m[1]);
      const all = [...new Set(a.concat(b))];
      if (all.length) return all;
    } catch (e) { }
    await new Promise((r2) => setTimeout(r2, 3000));
  }
  return [];
}


/* 读图片尺寸（PNG/GIF/JPEG/WebP ✗ 只解析文件头 ✔ 不装任何库 ✗） */
function imgSize(buf) {
  try {
    /* PNG: 8字节签名 + IHDR */
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    /* GIF: GIF87a/GIF89a */
    if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') {
      return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    }
    /* WebP: RIFF....WEBP */
    if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const fmt = buf.toString('ascii', 12, 16);
      if (fmt === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (fmt === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (fmt === 'VP8L') {
        const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
        return { w: 1 + (((b1 & 0x3f) << 8) | b0), h: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
      }
    }
    /* JPEG: 扫 SOF 段 */
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        const len = buf.readUInt16BE(i + 2);
        if (!len || len < 2) break;
        i += 2 + len;
      }
    }
  } catch (e) { }
  return null;
}

async function download(url, file) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.bing.com/' }, redirect: 'follow' });
    if (!r.ok) return 0;
    const buf = Buffer.from(await r.arrayBuffer());
    /* SIZE_FILTER · 用户 2026-10-21 选 A：二维码/图标太小 ✗ 跳过 */
    if (buf.length < 20000) return 0;
    /* DIM_FILTER · 图片过滤器（用户 2026-10-21）：读 PNG/JPG/GIF/WebP 尺寸 ✗
       ✗ 正方形小图（二维码/图标 ✗）
       ✗ 极端比例（<0.4 或 >3 ✗）
       ✓ 走势图/分析图（细长或大面积 ✗） */
    const dim = imgSize(buf);
    if (dim) {
      const r = dim.w / dim.h;
      if (r > 0.9 && r < 1.1 && Math.max(dim.w, dim.h) < 500) return 0;
      if (r < 0.4 || r > 3.2) return 0;
    }               /* 太小 = 图标/占位 ✗ */
    if (buf.length > 3 * 1024 * 1024) return 0;    /* 太大 = 视频/巨图 ✗ */
    fs.writeFileSync(file, buf);
    return buf.length;
  } catch (e) { return 0; }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const result = [];

for (const item of NAMES) {   /* SAFE_LOOP ✗ 单个失败不影响整批 ✔ */
  try {
  const dir = path.join(OUT_DIR, safeName(item.name));
  fs.mkdirSync(dir, { recursive: true });
  const urls = await bingImages(item.kw);
  const saved = [];
  for (const u of urls) {
    if (saved.length >= PER_NAME) break;
    const ext = (u.match(/\.(jpg|jpeg|png|webp)/i) || [])[1] || 'jpg';
    const file = path.join(dir, saved.length + 1 + '.' + ext.toLowerCase());
    const size = await download(u, file);
    if (size) saved.push({ file: path.relative(process.cwd(), file).replace(/\\/g, '/'), size, src: u });
    await new Promise((r2) => setTimeout(r2, 500));
  }
  console.log('  ' + item.name.padEnd(8) + ' [' + item.cat + '] 抓到 ' + saved.length + '/' + PER_NAME + ' 张' + (urls.length ? '' : ' （搜索无结果 ✗）'));
  result.push({ name: item.name, cat: item.cat, kw: item.kw, imgs: saved });
  await new Promise((r2) => setTimeout(r2, 2500));
  } catch (eName) { console.log("  ⚠️ " + item.name + " 失败：" + String(eName.message).slice(0, 50)); }
}

/* ===== HISTORY_24H · 24 小时抓取记录（用户 2026-10-21 选 A）=====
   /* 从旧文件里读 history（保留最近 24 条 ✗） */
   let hist = [];
   try {
     if (fs.existsSync(DATA)) {
       const old = fs.readFileSync(DATA, 'utf8');
       const m2 = old.match(/const MINGJIA_DATA = ([\s\S]*?);\s*$/);
       if (m2) { const oj = JSON.parse(m2[1]); if (Array.isArray(oj.history)) hist = oj.history; }
     }
   } catch (e) { }
   const totalImgs = result.reduce(function (a, x) { return a + x.imgs.length; }, 0);
   hist.push({
     at: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
     names: result.length,
     imgs: totalImgs
   });
   if (hist.length > 24) hist = hist.slice(-24);   /* 只留最近 24 条 ✔ */
   const payload = {
     updated: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
     list: result,
     history: hist
   };
const js = '/* mingjia-data.js —— 名家图库（build-mingjia.mjs 生成 · ' +
  new Date().toLocaleString('zh-CN', { hour12: false }) + '） */\n' +
  'const MINGJIA_DATA = ' + JSON.stringify(payload, null, 1) + ';\n';
try { fs.writeFileSync(DATA, js, 'utf8'); } catch (eW) { console.log('  写数据失败：' + eW.message); }

const total = result.reduce((a, x) => a + x.imgs.length, 0);
console.log('\n  ✅ mingjia-data.js 已写入 · ' + result.length + ' 个名家 · ' + total + ' 张图 · ' + Math.round(js.length / 1024) + 'KB');
