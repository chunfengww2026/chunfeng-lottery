/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-11-19 16:17",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-11-19 16:17",
   "min": 58,
   "rows": [
    {
     "code": "周五002",
     "time": "2026-11-20 18:00",
     "league": "日职",
     "home": "柏太阳神",
     "away": "千叶市原",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.53,
     "conf": 63.4,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周五003",
     "time": "2026-11-20 18:00",
     "league": "日职",
     "home": "鹿岛鹿角",
     "away": "清水鼓动",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.5,
     "conf": 60.2,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周五006",
     "time": "2026-11-21 03:30",
     "league": "德甲",
     "home": "拜仁",
     "away": "科隆",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.07,
     "conf": 88.5,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周五008",
     "time": "2026-11-21 04:00",
     "league": "西甲",
     "home": "毕尔巴鄂",
     "away": "西班牙人",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.45,
     "conf": 60.7,
     "score": "",
     "hit": null,
     "result": ""
    }
   ],
   "hit": null,
   "miss": null,
   "pending": 4,
   "verdict": ""
  }
 ]
};
