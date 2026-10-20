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
  { name: '太湖字谜', cat: '双色球', kw: '太湖字谜 双色球 图' },
  { name: '迷公', cat: '双色球', kw: '迷公 双色球 推荐图' },
  { name: '桃子姐', cat: '双色球', kw: '桃子姐 双色球 图' },
  { name: '迟丽颖', cat: '双色球', kw: '迟丽颖 双色球 图' },
  { name: '闪享', cat: '大乐透', kw: '闪享 大乐透 图' },
  { name: '幸丹丹', cat: '大乐透', kw: '幸丹丹 大乐透 图' },
  { name: '排三字谜', cat: '排列三', kw: '排三 3D 字谜 图' },
  { name: '名家精', cat: '3D', kw: '福彩3D 名家 精推 图' },
  { name: '朱大姐', cat: '篮球', kw: '朱大姐 篮球 分析表' },
  { name: '篮球杀码', cat: '篮球', kw: '篮球 杀码 公式 图' },
];

const PER_NAME = 5;

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

async function download(url, file) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.bing.com/' }, redirect: 'follow' });
    if (!r.ok) return 0;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 3000) return 0;               /* 太小 = 图标/占位 ✗ */
    if (buf.length > 3 * 1024 * 1024) return 0;    /* 太大 = 视频/巨图 ✗ */
    fs.writeFileSync(file, buf);
    return buf.length;
  } catch (e) { return 0; }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const result = [];

for (const item of NAMES) {
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
  new Date().toLocaleString('zh-CN', { hour12: false }) + '）\n' +
  'const MINGJIA_DATA = ' + JSON.stringify(payload, null, 1) + ';\n';
fs.writeFileSync(DATA, js, 'utf8');

const total = result.reduce((a, x) => a + x.imgs.length, 0);
console.log('\n  ✅ mingjia-data.js 已写入 · ' + result.length + ' 个名家 · ' + total + ' 张图 · ' + Math.round(js.length / 1024) + 'KB');
