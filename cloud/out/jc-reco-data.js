/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-11-16 18:23",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-11-16 18:23",
   "min": 58,
   "rows": [
    {
     "code": "周一004",
     "time": "2026-11-17 01:00",
     "league": "欧国联",
     "home": "冰岛",
     "away": "卢森堡",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.2,
     "conf": 72.6,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周一008",
     "time": "2026-11-17 03:45",
     "league": "欧国联",
     "home": "希腊",
     "away": "塞尔维亚",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.42,
     "conf": 65.9,
     "score": "",
     "hit": null,
     "result": ""
    }
   ],
   "hit": null,
   "miss": null,
   "pending": 2,
   "verdict": ""
  }
 ]
};
