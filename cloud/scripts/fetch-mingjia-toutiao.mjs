import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const FILE=path.join(ROOT,'mingjia-toutiao.json');
const GAMES={ssq:{name:'双色球',cat:'双色球'},dlt:{name:'大乐透',cat:'大乐透'},kl8:{name:'快乐8',cat:'快乐8'},fc3d:{name:'福彩3D',cat:'3D'},pl3:{name:'排列三',cat:'排列三'}};
const clean=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/&(?:nbsp|amp);/g,' ').replace(/\s+/g,' ').trim();
export function issueMatches(title,expected){const escaped=String(expected).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const variants=[escaped,String(expected).slice(-5)];return variants.some(s=>new RegExp('(?:^|[^0-9])'+s+'\\s*期(?:[^0-9]|$)').test(title));}
export function parseCards(html,gid,expected,now=Date.now()){
  const out=[];
  for(const chunk of String(html).split(/<script[^>]*data-druid-card-data-id[^>]*>/i).slice(1)){
    let obj;try{let raw=chunk.split('</script>')[0].trim();try{obj=JSON.parse(raw)}catch{obj=JSON.parse(raw.replace(/&quot;/g,'"').replace(/&amp;/g,'&'))}}catch{continue}
    const d=obj?.data;if(!d)continue;
    const title=clean(typeof d.title==='object'?(d.title.text||d.title.marked):d.title);
    const terms={ssq:/双色球/,dlt:/大乐透/,kl8:/快乐[八8]/,fc3d:/福彩.?3[dD]|3[dD]字谜/,pl3:/排列[三3]|排三/};
    if(!terms[gid].test(title)||!issueMatches(title,expected)||!/(字谜|图谜|资料|手写|三字诀|分析|推荐)/.test(title))continue;
    const time=String(d.datetime||'');const pub=Number(d.publish_time||d.create_time)||0;
    const publishedAt=pub?(pub<1e12?pub*1000:pub):Date.parse(time.replace(' ','T')+(/Z$|[+-]\d\d:\d\d$/.test(time)?'':'+08:00'));
    if(!Number.isFinite(publishedAt)||publishedAt>now+300000||now-publishedAt>=172800000)continue;
    const url=String(d.article_url||d.share_url||d.source_url||'');
    let u;try{u=new URL(url)}catch{continue}if(!/(^|\.)toutiao\.com$/.test(u.hostname)||!/^https?:$/.test(u.protocol))continue;
    const author=clean(d.media_name||(d.source&&d.source.text)||'公开资料');
    const images=(Array.isArray(d.image_list)?d.image_list:[]).map(x=>typeof x==='string'?x:x?.url).concat(d.large_image_url||d.image_url||[]).filter(x=>typeof x==='string'&&/^https?:\/\//.test(x)).map(x=>x.replace(/^http:/,'https:')).slice(0,24);
    out.push({id:String(d.group_id||d.item_id||url),gid,cat:GAMES[gid].cat,author,title:title.slice(0,100),issue:String(expected),url,excerpt:clean(d.abstract||d.content||'').slice(0,120),images:[...new Set(images)],publishedAt:new Date(publishedAt).toISOString()});
  }return out;
}
export function mergeEntries(old,fresh,now=Date.now()){
  const seen={...(old.seen||{})},byId=new Map();
  for(const e of [...(old.entries||[]),...fresh]){const k=e.gid+'|'+e.id;const first=seen[k]||e.firstSeen||new Date(now).toISOString();seen[k]=first;const expires=Math.min(Date.parse(first)+172800000,Date.parse(e.publishedAt)+172800000);if(!Number.isFinite(expires)||expires<=now)continue;byId.set(k,{...e,firstSeen:first,expiresAt:new Date(expires).toISOString()});}
  for(const [k,t]of Object.entries(seen))if(now-Date.parse(t)>30*86400000)delete seen[k];
  return {entries:[...byId.values()].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)),seen};
}
export async function run(){
  let old={};try{old=JSON.parse(fs.readFileSync(FILE,'utf8'))}catch{}
  const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(ROOT,'draws.js'),'utf8')+';globalThis.draws=DRAW_DATA;',c);
  const fresh=[],sources=[];
  for(const [gid,g]of Object.entries(GAMES)){
    const latest=String(c.draws?.games?.[gid]?.issue||'');if(!/^\d{5,7}$/.test(latest))continue;
    const expected=String(Number(latest)+1),kw=g.name+expected+'期 字谜 资料图';
    try{const u='https://so.toutiao.com/search?dvpf=pc&source=input&keyword='+encodeURIComponent(kw)+'&enable_druid_v2=1&page_num=0&pd=synthesis';const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'zh-CN,zh;q=0.9'},signal:AbortSignal.timeout(15000)});const html=await r.text();const items=r.ok?parseCards(html,gid,expected):[];fresh.push(...items);sources.push({gid,issue:expected,status:r.status,count:items.length,available:r.ok&&/data-druid-card-data-id/i.test(html)});console.log(g.name+' '+expected+'：'+items.length+' 条，HTTP '+r.status);}catch(e){sources.push({gid,issue:expected,available:false,error:String(e.message).slice(0,100)});console.log(g.name+'：暂不可用');}
    await new Promise(r=>setTimeout(r,1200));
  }
  const merged=mergeEntries(old,fresh);const data={updated:new Date().toISOString(),...merged,sources};fs.writeFileSync(FILE+'.tmp',JSON.stringify(data,null,1));fs.renameSync(FILE+'.tmp',FILE);console.log('已保存 '+data.entries.length+' 条当期资料（图片与短文摘录，保留48小时）');return data;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run().catch(e=>{console.error(e.message);process.exitCode=1});
