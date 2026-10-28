/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-10-29 03:53",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-10-28 00:23",
   "min": 58,
   "rows": [
    {
     "code": "周二009",
     "time": "2026-10-28 03:45",
     "league": "意甲",
     "home": "罗马",
     "away": "卡利亚里",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.29,
     "conf": 70.9,
     "score": "4:2",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周二007",
     "time": "2026-10-28 03:45",
     "league": "德国杯",
     "home": "多特蒙德",
     "away": "不来梅",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.4,
     "conf": 68.1,
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
   "at": "2026-10-28 23:00",
   "min": 58,
   "rows": [
    {
     "code": "周三002",
     "time": "2026-10-28 18:00",
     "league": "亚冠杯",
     "home": "鹿岛鹿角",
     "away": "浦项制铁",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.44,
     "conf": 62.4,
     "score": "3:0",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周三003",
     "time": "2026-10-28 18:00",
     "league": "日联杯",
     "home": "横滨水手",
     "away": "广岛三箭",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.48,
     "conf": 61.5,
     "score": "4:3",
     "hit": false,
     "result": "lose"
    },
    {
     "code": "周三004",
     "time": "2026-10-29 01:00",
     "league": "德国杯",
     "home": "帕德博恩",
     "away": "斯图加特",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.57,
     "conf": 60.4,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周三005",
     "time": "2026-10-29 01:30",
     "league": "意甲",
     "home": "威尼斯",
     "away": "国际米兰",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.38,
     "conf": 69.9,
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
   "at": "2026-10-28 23:04",
   "min": 58,
   "rows": [
    {
     "code": "周三017",
     "time": "2026-10-29 07:30",
     "league": "美职联",
     "home": "迈阿密国际",
     "away": "辛辛那提",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.45,
     "conf": 62.4,
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
   "at": "2026-10-28 23:58",
   "min": 58,
   "rows": [
    {
     "code": "周三009",
     "time": "2026-10-29 02:00",
     "league": "瑞典超",
     "home": "布鲁马波",
     "away": "赫根",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.5,
     "conf": 58.7,
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
