/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-11-15 20:07",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-11-15 20:07",
   "min": 58,
   "rows": [
    {
     "code": "周日008",
     "time": "2026-11-16 01:00",
     "league": "欧国联",
     "home": "芬兰",
     "away": "圣马力诺",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.02,
     "conf": 91.1,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周日009",
     "time": "2026-11-16 03:45",
     "league": "欧国联",
     "home": "克罗地亚",
     "away": "捷克",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.53,
     "conf": 64.9,
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
