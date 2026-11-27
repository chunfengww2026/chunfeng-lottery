/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-11-27 11:36",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-11-27 11:36",
   "min": 58,
   "rows": [
    {
     "code": "周五003",
     "time": "2026-11-28 03:00",
     "league": "荷甲",
     "home": "格罗宁根",
     "away": "威廉二世",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.4,
     "conf": 73,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六006",
     "time": "2026-11-28 22:00",
     "league": "意甲",
     "home": "弗洛西诺",
     "away": "帕尔马",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.44,
     "conf": 62.3,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六010",
     "time": "2026-11-28 22:30",
     "league": "德甲",
     "home": "美因茨",
     "away": "柏林联合",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.5,
     "conf": 61.2,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六012",
     "time": "2026-11-28 23:00",
     "league": "英超",
     "home": "利兹联",
     "away": "考文垂",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.48,
     "conf": 60.4,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六019",
     "time": "2026-11-29 01:30",
     "league": "西甲",
     "home": "埃尔切",
     "away": "马竞",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.4,
     "conf": 62.6,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六020",
     "time": "2026-11-29 03:45",
     "league": "意甲",
     "home": "国际米兰",
     "away": "热那亚",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.33,
     "conf": 73.4,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周日015",
     "time": "2026-11-29 23:15",
     "league": "西甲",
     "home": "拉科",
     "away": "巴萨",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.2,
     "conf": 77.3,
     "score": "",
     "hit": null,
     "result": ""
    }
   ],
   "hit": null,
   "miss": null,
   "pending": 7,
   "verdict": ""
  }
 ]
};
