/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-10-28 00:23",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-10-25 12:29",
   "min": 58,
   "rows": [
    {
     "code": "周日011",
     "time": "2026-10-25 21:30",
     "league": "挪超",
     "home": "维京",
     "away": "特罗姆瑟",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.5,
     "conf": 63.5,
     "score": "3:1",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周日022",
     "time": "2026-10-26 00:30",
     "league": "德甲",
     "home": "弗赖堡",
     "away": "拜仁",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.4,
     "conf": 70.5,
     "score": "1:3",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周日023",
     "time": "2026-10-26 01:00",
     "league": "意甲",
     "home": "莱切",
     "away": "尤文图斯",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.5,
     "conf": 65,
     "score": "0:2",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周日029",
     "time": "2026-10-26 09:00",
     "league": "美职联",
     "home": "洛杉矶FC",
     "away": "洛城银河",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.55,
     "conf": 61.1,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周一001",
     "time": "2026-10-27 02:45",
     "league": "葡超",
     "home": "圣克拉拉",
     "away": "本菲卡",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.38,
     "conf": 66.8,
     "score": "1:2",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周一004",
     "time": "2026-10-27 07:00",
     "league": "巴甲",
     "home": "弗拉门戈",
     "away": "米竞技",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.33,
     "conf": 68.3,
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
     "score": "",
     "hit": null,
     "result": ""
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
   "pending": 2,
   "verdict": ""
  }
 ]
};
