/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-10-21 04:00",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-10-17 12:00",
   "min": 55,
   "rows": [
    {
     "code": "周六008",
     "time": "2026-10-17 19:30",
     "league": "英冠",
     "home": "米尔沃尔",
     "away": "林肯城",
     "pick": "home",
     "label": "主胜",
     "odds": 1.57,
     "conf": 59.2,
     "score": "2:2",
     "hit": false,
     "result": "lose"
    },
    {
     "code": "周六010",
     "time": "2026-10-17 20:00",
     "league": "挪超",
     "home": "汉坎",
     "away": "博德闪耀",
     "pick": "away",
     "label": "客胜",
     "odds": 1.22,
     "conf": 74.4,
     "score": "0:2",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周六012",
     "time": "2026-10-17 21:00",
     "league": "芬超",
     "home": "赫尔辛基",
     "away": "赫尔辛基火花",
     "pick": "home",
     "label": "主胜",
     "odds": 1.45,
     "conf": 62.6,
     "score": "4:0",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周日008",
     "time": "2026-10-18 20:00",
     "league": "芬超",
     "home": "库奥皮奥",
     "away": "瓦萨",
     "pick": "home",
     "label": "主胜",
     "odds": 1.55,
     "conf": 58.8,
     "score": "2:0",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周日022",
     "time": "2026-10-19 02:45",
     "league": "意甲",
     "home": "尤文图斯",
     "away": "拉齐奥",
     "pick": "home",
     "label": "主胜",
     "odds": 1.67,
     "conf": 56.9,
     "score": "0:3",
     "hit": false,
     "result": "lose"
    },
    {
     "code": "周日023",
     "time": "2026-10-19 02:45",
     "league": "法甲",
     "home": "里昂",
     "away": "尼斯",
     "pick": "home",
     "label": "主胜",
     "odds": 1.67,
     "conf": 56.9,
     "score": "2:1",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周日024",
     "time": "2026-10-19 03:00",
     "league": "西甲",
     "home": "皇马",
     "away": "塞维利亚",
     "pick": "home",
     "label": "主胜",
     "odds": 1.22,
     "conf": 77.1,
     "score": "4:1",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周一007",
     "time": "2026-10-20 03:15",
     "league": "葡超",
     "home": "布拉加",
     "away": "吉维森特",
     "pick": "home",
     "label": "主胜",
     "odds": 1.56,
     "conf": 59.1,
     "score": "1:2",
     "hit": false,
     "result": "lose"
    }
   ],
   "hit": 0,
   "miss": 3,
   "pending": 0,
   "verdict": "黑"
  },
  {
   "at": "2026-10-18 15:00",
   "min": 58,
   "rows": [
    {
     "code": "周一005",
     "time": "2026-10-20 03:00",
     "league": "英超",
     "home": "热刺",
     "away": "考文垂",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.45,
     "conf": 65.4,
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
   "at": "2026-10-19 10:46",
   "min": 58,
   "rows": [
    {
     "code": "周一008",
     "time": "2026-10-20 07:00",
     "league": "巴甲",
     "home": "科林蒂安",
     "away": "维多利亚",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.65,
     "conf": 58.1,
     "score": "1:1",
     "hit": false,
     "result": "lose"
    }
   ],
   "hit": 0,
   "miss": 1,
   "pending": 0,
   "verdict": "黑"
  },
  {
   "at": "2026-10-19 23:30",
   "min": 58,
   "rows": [
    {
     "code": "周二002",
     "time": "2026-10-21 00:45",
     "league": "欧冠",
     "home": "萨巴赫",
     "away": "多特蒙德",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.29,
     "conf": 73.6,
     "score": "1:2",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周二008",
     "time": "2026-10-21 03:00",
     "league": "欧冠",
     "home": "曼城",
     "away": "雅典AEK",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.1,
     "conf": 86.4,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周二005",
     "time": "2026-10-21 03:00",
     "league": "欧冠",
     "home": "罗马",
     "away": "布拉迪斯",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.14,
     "conf": 82.6,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周二007",
     "time": "2026-10-21 03:00",
     "league": "欧冠",
     "home": "利物浦",
     "away": "比利亚雷",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.5,
     "conf": 63.2,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周二010",
     "time": "2026-10-21 03:00",
     "league": "欧冠",
     "home": "波尔图",
     "away": "埃因霍温",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.57,
     "conf": 60.1,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周二004",
     "time": "2026-10-21 03:00",
     "league": "欧冠",
     "home": "那不勒斯",
     "away": "博德闪耀",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.62,
     "conf": 58.5,
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
   "at": "2026-10-21 01:05",
   "min": 58,
   "rows": [
    {
     "code": "周二003",
     "time": "2026-10-21 02:45",
     "league": "英冠",
     "home": "伍尔弗汉普顿",
     "away": "朴次茅斯",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.55,
     "conf": 60.6,
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
