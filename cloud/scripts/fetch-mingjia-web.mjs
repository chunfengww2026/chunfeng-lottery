import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {mergeEntries} from './fetch-mingjia-toutiao.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url)),FILE=path.join(ROOT,'mingjia-web.json');
const seeds=[['https://www.cz89.com/p3/item_7.htm','pl3'],['https://m.cz89.com/read_10914065.htm','fc3d'],['https://www.800820.net/ssq/list_46.html','ssq'],['https://www.55128.cn/zt/3dzmtmhz','fc3d'],['https://taihu.17500.cn/home/','fc3d'],['https://www.17500.cn/arts/detail-4925224.html','fc3d']];
for(const gid of ['ssq','dlt','kl8','fc3d','pl3'])seeds.push(['https://www.78500.cn/zimi/',gid]);
for(const [route,gid]of [['3d/item_3.htm','fc3d'],['3d/item_4.htm','fc3d'],['3d/item_14.htm','fc3d'],['3d/item_48.htm','fc3d'],['3d/item_49.htm','fc3d'],['p3/item_6.htm','pl3'],['p3/item_7.htm','pl3'],['ssq/item_9.htm','ssq'],['dlt/item_13.htm','dlt'],['qxc/item_10.htm','qxc'],['qlc/item_12.htm','qlc']])seeds.push(['https://m.cz89.com/'+route,gid]);
const cats={qxc:'七星彩',qlc:'七乐彩',ssq:'双色球',dlt:'大乐透',kl8:'快乐8',fc3d:'3D',pl3:'排列三'};
for(const [gid,name] of Object.entries({ssq:'双色球',dlt:'大乐透',kl8:'快乐8',fc3d:'福彩3D',pl3:'排列三'}))seeds.push(['https://tieba.baidu.com/f?kw='+encodeURIComponent(name),gid]);
export const plain=s=>String(s||'').replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'').replace(/<(?:br\b[^>]*|\/p|\/div)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
export function issueOf(s,gid){const full=/(?:^|\D)(20\d{2})\s*年?\s*(\d{3})\s*期/.exec(s);const short=/(?:^|\D)(\d{2})年\s*(\d{3})\s*期/.exec(s);const compact=/(?:^|\D)(\d{5,7})\s*期/.exec(s);let n=full?full[1]+full[2]:short?'20'+short[1]+short[2]:compact?.[1]||'';if(n.length===5&&['ssq','fc3d','kl8'].includes(gid))n='20'+n;if(n.length===7&&['pl3','dlt','qxc'].includes(gid))n=n.slice(2);return n;}
export function contentBlocks(body,url){
 const blocks=[];let last=0;
 function text(s){const t=plain(s);if(t)blocks.push({type:'text',text:t.slice(0,1200)});}
 for(const m of body.matchAll(/<img\b[^>]*(?:data-original|data-src|src)\s*=\s*["']([^"']+)["'][^>]*>/gi)){
   text(body.slice(last,m.index));last=m.index+m[0].length;
   try{const u=new URL(m[1].replaceAll('&amp;','&'),url);if(!/^https?:$/.test(u.protocol)||/logo|qrcode|avatar|banner|weixin/i.test(u.pathname))continue;u.protocol='https:';blocks.push({type:'image',src:u.href});}catch{}
 }
 text(body.slice(last));return blocks.slice(0,150);
}
export function gameOfLink(title,url){
 const t=String(title)+' '+String(url);
 if(/七星彩|\/qxc\//.test(t))return 'qxc';if(/七乐彩|\/qlc\//.test(t))return 'qlc';
 if(/排列[三3]|排三|\/p3zimi\/|\/p3\//i.test(t))return 'pl3';
 if(/福彩.?3d|3d字谜|\/3dzimi\/|\/3d\//i.test(t))return 'fc3d';
 if(/双色球|\/ssq/.test(t))return 'ssq';if(/大乐透|\/dlt/.test(t))return 'dlt';if(/快乐[八8]|\/kl8/.test(t))return 'kl8';return '';
}

export function parseArticle(html,url,gid,expected,now=Date.now()){
 const title=plain((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
 if(issueOf(title,gid)!==String(expected))return null;
 const detected=gameOfLink(title,url);if(detected&&detected!==gid)return null;
 const match=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)||html.match(/<div\b[^>]*(?:id|class)\s*=\s*["'][^"']*(?:article-content|news-content|articleContent|content-body|detail-content|art-content|article_text|d_post_content|article-con|articlecon|articleCon|news_text|article-body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
 if(!match)return null;const body=match[1];
 const tm=plain(html).match(/(?:发布(?:时间)?|时间|日期)?\s*[：:]?\s*(20\d{2}[-/]\d{1,2}[-/]\d{1,2})\s+(\d{1,2}:\d{2}(?::\d{2})?)/);
 const cn=plain(html).match(/(20\d{2})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}:\d{2})/);
 const published=cn?Date.parse(cn[1]+'-'+cn[2].padStart(2,'0')+'-'+cn[3].padStart(2,'0')+'T'+cn[4].padStart(5,'0')+':00+08:00'):tm?Date.parse(tm[1].replaceAll('/','-')+'T'+tm[2]+(tm[2].length===5?':00':'')+'+08:00'):NaN;
 if(!Number.isFinite(published)||published>now+300000||now-published>=172800000)return null;
 const images=[];for(const m of body.matchAll(/<img\b[^>]*(?:data-original|data-src|src)\s*=\s*["']([^"']+)["'][^>]*>/gi)){try{const u=new URL(m[1].replaceAll('&amp;','&'),url);if(!/^https?:$/.test(u.protocol)||/logo|qrcode|avatar|banner|weixin/i.test(u.pathname))continue;u.protocol='https:';images.push(u.href);}catch{}}
 const excerpt=plain(body).replace(/发布时间[\s\S]*$/,'').trim().slice(0,120);
 if(!images.length&&!excerpt)return null;
 return {id:url,gid,cat:cats[gid],author:'字谜资料',title:title.slice(0,100),issue:String(expected),url,excerpt,blocks:contentBlocks(body,url),images:[...new Set(images)].slice(0,100),publishedAt:new Date(published).toISOString()};
}
async function read(url){const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(15000)});const buf=await r.arrayBuffer();let html=new TextDecoder().decode(buf);if(/charset\s*=\s*["']?(gbk|gb2312)/i.test(html))html=new TextDecoder('gb18030').decode(buf);const blocked=/Sorry, you have been blocked|RequestID:|var arg1=/.test(html);return {status:blocked?403:r.status,html:blocked?'':html};}
export async function run(){let old={};try{old=JSON.parse(fs.readFileSync(FILE,'utf8'))}catch{}const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(ROOT,'draws.js'),'utf8')+';globalThis.draws=DRAW_DATA;',c);const fresh=[],sources=[];
 for(const [url,gid]of seeds.filter(function(seed){const only=process.argv.find(function(a){return a.startsWith('--source=');});return !only||new URL(seed[0]).hostname===only.slice(9);})){const expected=String(Number(c.draws?.games?.[gid]?.issue||0)+1);try{const r=await read(url);if(r.status!==200){sources.push({url,status:r.status,count:0});continue;}let items=[];const direct=parseArticle(r.html,url,gid,expected);if(direct)items.push(direct);else{const links=[];for(const m of r.html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){const t=plain(m[2]);if(issueOf(t,gid)!==expected)continue;const detected=gameOfLink(t,m[1]);if(detected&&detected!==gid)continue;const u=new URL(m[1],url);if(u.hostname!==new URL(url).hostname||!/read_|detail-|\/p\/|\/\d+\.html?/.test(u.pathname))continue;if(!links.includes(u.href))links.push(u.href);}for(const u of (function(){const offset=links.length?Math.floor(Date.now()/600000)*10%links.length:0;return links.slice(offset).concat(links.slice(0,offset)).slice(0,10);})()){try{const a=await read(u);if(a.status===200){const item=parseArticle(a.html,u,gid,expected);if(item)items.push(item)}}catch{}}}fresh.push(...items);sources.push({url,status:r.status,count:items.length});console.log(new URL(url).hostname+'：'+items.length+' 条');}catch(e){sources.push({url,status:0,error:e.message,count:0});console.log(new URL(url).hostname+'：暂不可用');}}
 const merged=mergeEntries(old,fresh);const data={updated:new Date().toISOString(),...merged,sources};fs.writeFileSync(FILE+'.tmp',JSON.stringify(data,null,1));fs.renameSync(FILE+'.tmp',FILE);console.log('网站资料 '+data.entries.length+' 条，图片 '+data.entries.reduce((n,e)=>n+e.images.length,0)+' 张');return data;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run().catch(e=>{console.error(e.message);process.exitCode=1});

