/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-11-11 19:06",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-11-11 19:06",
   "min": 58,
   "rows": [
    {
     "code": "周四006",
     "time": "2026-11-13 03:45",
     "league": "欧国联",
     "home": "捷克",
     "away": "西班牙",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.18,
     "conf": 81.1,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周四005",
     "time": "2026-11-13 03:45",
     "league": "欧国联",
     "home": "英格兰",
     "away": "克罗地亚",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.22,
     "conf": 76.9,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周四004",
     "time": "2026-11-13 03:45",
     "league": "欧国联",
     "home": "黑山",
     "away": "拉脱维亚",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.3,
     "conf": 68.7,
     "score": "",
     "hit": null,
     "result": ""
    }
   ],
   "hit": null,
   "miss": null,
   "pending": 3,
   "verdict": ""
  }
 ]
};
