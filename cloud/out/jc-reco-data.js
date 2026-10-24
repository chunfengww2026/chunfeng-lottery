/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-10-25 02:35",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
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
     "score": "3:2",
     "hit": true,
     "result": "win"
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
     "score": "2:3",
     "hit": false,
     "result": "lose"
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
     "score": "1:5",
     "hit": true,
     "result": "win"
    }
   ],
   "hit": null,
   "miss": null,
   "pending": 1,
   "verdict": ""
  },
  {
   "at": "2026-10-23 23:30",
   "min": 58,
   "rows": [
    {
     "code": "周六009",
     "time": "2026-10-24 21:00",
     "league": "意甲",
     "home": "科莫",
     "away": "萨索洛",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.5,
     "conf": 64.2,
     "score": "2:0",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周六011",
     "time": "2026-10-24 21:30",
     "league": "德甲",
     "home": "莱红牛",
     "away": "埃沃斯堡",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.44,
     "conf": 69.8,
     "score": "4:0",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周六016",
     "time": "2026-10-24 22:00",
     "league": "英超",
     "home": "阿森纳",
     "away": "埃弗顿",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.4,
     "conf": 67.3,
     "score": "2:0",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周六024",
     "time": "2026-10-25 00:30",
     "league": "德甲",
     "home": "多特蒙德",
     "away": "法兰克福",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.48,
     "conf": 66.3,
     "score": "0:0",
     "hit": false,
     "result": "lose"
    },
    {
     "code": "周六026",
     "time": "2026-10-25 02:45",
     "league": "意甲",
     "home": "拉齐奥",
     "away": "帕尔马",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.36,
     "conf": 65.2,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六028",
     "time": "2026-10-25 03:00",
     "league": "西甲",
     "home": "马竞",
     "away": "拉科",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.27,
     "conf": 72.2,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六029",
     "time": "2026-10-25 03:30",
     "league": "葡超",
     "home": "吉维森特",
     "away": "波尔图",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.42,
     "conf": 65.3,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周日003",
     "time": "2026-10-25 15:00",
     "league": "日职",
     "home": "东京FC",
     "away": "水户蜀葵",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.33,
     "conf": 70.8,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周日006",
     "time": "2026-10-25 19:30",
     "league": "意甲",
     "home": "国际米兰",
     "away": "佛罗伦萨",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.36,
     "conf": 68.6,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周日028",
     "time": "2026-10-26 04:30",
     "league": "葡超",
     "home": "里斯本",
     "away": "维塞乌",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.25,
     "conf": 77.4,
     "score": "",
     "hit": null,
     "result": ""
    }
   ],
   "hit": null,
   "miss": null,
   "pending": 6,
   "verdict": ""
  },
  {
   "at": "2026-10-23 23:58",
   "min": 58,
   "rows": [
    {
     "code": "周五012",
     "time": "2026-10-24 03:45",
     "league": "葡超",
     "home": "吉马良斯",
     "away": "马里迪莫",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.46,
     "conf": 58.6,
     "score": "5:0",
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
   "at": "2026-10-25 02:35",
   "min": 58,
   "rows": [
    {
     "code": "周六006",
     "time": "2026-10-24 19:30",
     "league": "英超",
     "home": "维拉",
     "away": "曼城",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.62,
     "conf": 58.1,
     "score": "2:1",
     "hit": false,
     "result": "lose"
    }
   ],
   "hit": 0,
   "miss": 1,
   "pending": 0,
   "verdict": "黑"
  }
 ]
};
