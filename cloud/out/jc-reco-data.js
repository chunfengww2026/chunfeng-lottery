/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-11-06 12:45",
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
     "score": "6:1",
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
   "at": "2026-11-06 12:45",
   "min": 58,
   "rows": [
    {
     "code": "周五001",
     "time": "2026-11-06 16:40",
     "league": "澳超",
     "home": "悉尼FC",
     "away": "中央海岸",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.57,
     "conf": 61,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周五003",
     "time": "2026-11-07 02:00",
     "league": "瑞典超",
     "home": "哈马比",
     "away": "埃夫斯堡",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.42,
     "conf": 65.9,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六013",
     "time": "2026-11-07 22:30",
     "league": "德甲",
     "home": "多特蒙德",
     "away": "埃沃斯堡",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.3,
     "conf": 73,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六014",
     "time": "2026-11-07 22:30",
     "league": "德甲",
     "home": "美因茨",
     "away": "拜仁",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.33,
     "conf": 68.9,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六011",
     "time": "2026-11-07 22:30",
     "league": "德甲",
     "home": "莱红牛",
     "away": "奥格斯堡",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.45,
     "conf": 66.9,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六015",
     "time": "2026-11-07 23:00",
     "league": "英超",
     "home": "阿森纳",
     "away": "赫尔城",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.17,
     "conf": 79.5,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六024",
     "time": "2026-11-08 01:30",
     "league": "德甲",
     "home": "斯图加特",
     "away": "不来梅",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.65,
     "conf": 60.3,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周六028",
     "time": "2026-11-08 03:45",
     "league": "意甲",
     "home": "罗马",
     "away": "萨索洛",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.3,
     "conf": 70.3,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周日019",
     "time": "2026-11-08 23:45",
     "league": "荷甲",
     "home": "阿尔克马",
     "away": "格罗宁根",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.53,
     "conf": 61.5,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周日026",
     "time": "2026-11-09 02:00",
     "league": "葡超",
     "home": "吉马良斯",
     "away": "波尔图",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.67,
     "conf": 58.6,
     "score": "",
     "hit": null,
     "result": ""
    }
   ],
   "hit": null,
   "miss": null,
   "pending": 10,
   "verdict": ""
  }
 ]
};
