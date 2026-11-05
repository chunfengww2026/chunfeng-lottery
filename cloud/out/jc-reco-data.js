/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-11-06 07:43",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-11-03 11:30",
   "min": 58,
   "rows": [
    {
     "code": "周二002",
     "time": "2026-11-03 18:00",
     "league": "亚冠杯",
     "home": "柏太阳神",
     "away": "大田市民",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.53,
     "conf": 62.3,
     "score": "2:0",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周三011",
     "time": "2026-11-05 04:00",
     "league": "欧冠",
     "home": "斯拉维亚",
     "away": "阿森纳",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.27,
     "conf": 75.3,
     "score": "1:2",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周三009",
     "time": "2026-11-05 04:00",
     "league": "欧冠",
     "home": "维京",
     "away": "萨巴赫",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.45,
     "conf": 65.5,
     "score": "",
     "hit": null,
     "result": ""
    }
   ],
   "hit": null,
   "miss": null,
   "pending": 1,
   "verdict": ""
  },
  {
   "at": "2026-11-04 11:28",
   "min": 58,
   "rows": [
    {
     "code": "周三005",
     "time": "2026-11-05 04:00",
     "league": "欧冠",
     "home": "莱红牛",
     "away": "曼城",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.5,
     "conf": 58.2,
     "score": "2:3",
     "hit": true,
     "result": "win"
    }
   ],
   "hit": 1,
   "miss": 0,
   "pending": 0,
   "verdict": "红"
  },
  {
   "at": "2026-11-04 18:30",
   "min": 58,
   "rows": [
    {
     "code": "周四013",
     "time": "2026-11-06 06:30",
     "league": "巴甲",
     "home": "帕梅拉斯",
     "away": "里莫",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.19,
     "conf": 78.4,
     "score": "",
     "hit": null,
     "result": ""
    }
   ],
   "hit": null,
   "miss": null,
   "pending": 1,
   "verdict": ""
  }
 ]
};
