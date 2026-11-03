/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-11-03 15:55",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-11-01 22:00",
   "min": 58,
   "rows": [
    {
     "code": "周一001",
     "time": "2026-11-03 00:00",
     "league": "芬超",
     "home": "国际图尔",
     "away": "赫尔辛基火花",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.36,
     "conf": 66.3,
     "score": "4:3",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周一004",
     "time": "2026-11-03 03:45",
     "league": "意甲",
     "home": "亚特兰大",
     "away": "帕尔马",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.5,
     "conf": 68.2,
     "score": "0:3",
     "hit": false,
     "result": "lose"
    },
    {
     "code": "周一008",
     "time": "2026-11-03 04:15",
     "league": "葡超",
     "home": "本菲卡",
     "away": "阿尔维卡",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.15,
     "conf": 80.2,
     "score": "1:0",
     "hit": true,
     "result": "win"
    }
   ],
   "hit": 0,
   "miss": 1,
   "pending": 0,
   "verdict": "黑"
  },
  {
   "at": "2026-11-02 16:05",
   "min": 58,
   "rows": [
    {
     "code": "周二009",
     "time": "2026-11-04 04:00",
     "league": "欧冠",
     "home": "巴萨",
     "away": "维拉",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.25,
     "conf": 72.6,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周二006",
     "time": "2026-11-04 04:00",
     "league": "欧冠",
     "home": "LASK林茨",
     "away": "布拉迪斯",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.44,
     "conf": 61.7,
     "score": "",
     "hit": null,
     "result": ""
    }
   ],
   "hit": null,
   "miss": null,
   "pending": 2,
   "verdict": ""
  },
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
     "score": "",
     "hit": null,
     "result": ""
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
     "score": "",
     "hit": null,
     "result": ""
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
   "pending": 3,
   "verdict": ""
  }
 ]
};
