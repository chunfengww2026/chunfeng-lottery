const fs=require('fs'),path=require('path'),vm=require('vm');
function buildUserMethodResults(root){
 const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'history.js'),'utf8')+';globalThis.h=DRAW_HISTORY;',c);const games=c.h.games||{};
 const rows=g=>(games[g]||[]).slice(0,60);
 const nums=d=>{const a=d.areas||{};return (a.red||a.front||a.main||[]).map(Number)};
 const uniq=a=>[...new Set(a)];
 const ranked=(g,max,min=1)=>{const count={};rows(g).forEach(d=>nums(d).forEach(n=>count[n]=(count[n]||0)+1));return Array.from({length:max-min+1},(_,i)=>i+min).sort((a,b)=>(count[b]||0)-(count[a]||0)||a-b)};
 const out={};const cp=require(path.join(root,'core-pool.js'));
 for(const g of ['ssq','dlt']){const r=cp.corePoolFor(g);if(r)out[g]={issue:r.issue,pool20:r.pool20,rank:r.pool20.concat(ranked(g,g==='ssq'?33:35).filter(n=>!r.pool20.includes(n))),kills:r.kills};}
 for(const g of ['fc3d','pl3']){const list=rows(g);if(!list.length)continue;const p=nums(list[0]);if(p.length!==3)continue;const [b,s,u]=p,span=Math.max(...p)-Math.min(...p),sum=b+s+u,route=(sum*b+1)%3;const kills=Array.from({length:10},(_,i)=>i).filter(n=>n%3===route);const candidates=uniq([(b+s)%10,(s+u)%10,(b+u)%10,(span+sum%10)%10,...p.map(n=>(n+5)%10),...p.flatMap(n=>[(n+9)%10,n,(n+1)%10]),Math.abs(s-u)%10]);const rank=uniq(candidates.concat(ranked(g,9,0))).filter(n=>!kills.includes(n));out[g]={issue:list[0].issue,rank,pool20:rank,kills};}
 if(rows('qlc').length){const list=rows('qlc'),p=nums(list[0]).slice().sort((a,b)=>a-b),edge=[];for(let i=0;i<p.length-1;i++)if(p[i+1]-p[i]===1){if(p[i]>1)edge.push(p[i]-1);if(p[i+1]<30)edge.push(p[i+1]+1);}const recent=list.slice(0,10),freq={},gap={};recent.forEach((d,i)=>nums(d).forEach(n=>{freq[n]=(freq[n]||0)+1;if(gap[n]===undefined)gap[n]=i}));const warm=Array.from({length:30},(_,i)=>i+1).filter(n=>freq[n]>=2&&freq[n]<=3&&gap[n]>=2);const rank=uniq(edge.concat(warm,ranked('qlc',30)));out.qlc={issue:list[0].issue,rank,pool20:rank.slice(0,22)};}
 if(rows('kl8').length){const list=rows('kl8'),gap={};list.forEach((d,i)=>nums(d).forEach(n=>{if(gap[n]===undefined)gap[n]=i}));const hot=ranked('kl8',80),cold=Array.from({length:80},(_,i)=>i+1).filter(n=>(gap[n]===undefined?list.length:gap[n])>8);const rank=uniq(hot.slice(0,12).concat(cold.slice(0,8),hot));out.kl8={issue:list[0].issue,rank,pool20:rank.slice(0,20)};}
 if(rows('pl5').length){const rank=uniq((out.pl3?out.pl3.rank:[]).concat(ranked('pl5',9,0)));out.pl5={issue:rows('pl5')[0].issue,rank,pool20:rank};}
 if(rows('qxc').length){const rank=ranked('qxc',9,0);out.qxc={issue:rows('qxc')[0].issue,rank,pool20:rank};}
 return out;
}
module.exports={buildUserMethodResults};
