/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-11-14 17:52",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-11-14 17:52",
   "min": 58,
   "rows": [
    {
     "code": "周六005",
     "time": "2026-11-14 23:30",
     "league": "荷乙",
     "home": "布雷达",
     "away": "埃门",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.45,
     "conf": 61.8,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六007",
     "time": "2026-11-15 01:00",
     "league": "欧国联",
     "home": "挪威",
     "away": "威尔士",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.25,
     "conf": 76.7,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六010",
     "time": "2026-11-15 03:00",
     "league": "荷乙",
     "home": "阿尔梅勒",
     "away": "海尔蒙特",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.33,
     "conf": 66.1,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六014",
     "time": "2026-11-15 03:45",
     "league": "欧国联",
     "home": "葡萄牙",
     "away": "丹麦",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.57,
     "conf": 63.4,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六012",
     "time": "2026-11-15 03:45",
     "league": "欧国联",
     "home": "瑞典",
     "away": "波黑",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.45,
     "conf": 63.2,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六011",
     "time": "2026-11-15 03:45",
     "league": "欧国联",
     "home": "奥地利",
     "away": "爱尔兰",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.67,
     "conf": 59.2,
     "score": "",
     "hit": null,
     "result": ""
    }
   ],
   "hit": null,
   "miss": null,
   "pending": 6,
   "verdict": ""
  }
 ]
};
