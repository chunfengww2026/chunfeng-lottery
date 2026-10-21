/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-10-21 20:41",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
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
     "score": "1:0",
     "hit": true,
     "result": "win"
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
     "score": "1:0",
     "hit": true,
     "result": "win"
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
     "score": "0:1",
     "hit": false,
     "result": "lose"
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
     "score": "0:0",
     "hit": false,
     "result": "lose"
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
     "score": "1:0",
     "hit": true,
     "result": "win"
    }
   ],
   "hit": 0,
   "miss": 2,
   "pending": 0,
   "verdict": "黑"
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
