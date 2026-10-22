/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-10-23 00:35",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-10-22 00:05",
   "min": 58,
   "rows": [
    {
     "code": "周三007",
     "time": "2026-10-22 03:00",
     "league": "欧冠",
     "home": "皇马",
     "away": "莱红牛",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.22,
     "conf": 77.8,
     "score": "4:1",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周三008",
     "time": "2026-10-22 03:00",
     "league": "欧冠",
     "home": "维拉",
     "away": "维京",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.25,
     "conf": 75.6,
     "score": "3:1",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周三011",
     "time": "2026-10-22 03:00",
     "league": "欧冠",
     "home": "里斯本",
     "away": "LASK林茨",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.29,
     "conf": 73.9,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周四005",
     "time": "2026-10-23 00:45",
     "league": "欧罗巴",
     "home": "克里特",
     "away": "勒沃库森",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.2,
     "conf": 78.7,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周四004",
     "time": "2026-10-23 00:45",
     "league": "欧罗巴",
     "home": "尤文图斯",
     "away": "雷恩",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.55,
     "conf": 61.4,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周四010",
     "time": "2026-10-23 03:00",
     "league": "欧罗巴",
     "home": "利勒斯特",
     "away": "皇家社会",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.5,
     "conf": 63.2,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周四013",
     "time": "2026-10-23 08:30",
     "league": "解放者杯",
     "home": "弗拉门戈",
     "away": "拉普大学",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.38,
     "conf": 68.9,
     "score": "",
     "hit": null,
     "result": ""
    }
   ],
   "hit": null,
   "miss": null,
   "pending": 5,
   "verdict": ""
  },
  {
   "at": "2026-10-22 00:28",
   "min": 58,
   "rows": [
    {
     "code": "周三009",
     "time": "2026-10-22 03:00",
     "league": "欧冠",
     "home": "贝蒂斯",
     "away": "费耶诺德",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.62,
     "conf": 58.1,
     "score": "1:0",
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
   "at": "2026-10-22 23:30",
   "min": 58,
   "rows": [
    {
     "code": "周四003",
     "time": "2026-10-23 00:45",
     "league": "欧罗巴",
     "home": "萨迪纳摩",
     "away": "奈梅亨",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.44,
     "conf": 65.6,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周五004",
     "time": "2026-10-24 02:00",
     "league": "荷甲",
     "home": "前进之鹰",
     "away": "特尔斯达",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.6,
     "conf": 59.3,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周五006",
     "time": "2026-10-24 02:30",
     "league": "德甲",
     "home": "斯图加特",
     "away": "门兴",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.38,
     "conf": 68.5,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周五010",
     "time": "2026-10-24 03:00",
     "league": "英冠",
     "home": "博尔顿",
     "away": "米堡",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.55,
     "conf": 60.5,
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
