/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-11-08 18:21",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-11-08 18:21",
   "min": 58,
   "rows": [
    {
     "code": "周日010",
     "time": "2026-11-08 21:30",
     "league": "挪超",
     "home": "特罗姆瑟",
     "away": "博德闪耀",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.42,
     "conf": 67.4,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周日013",
     "time": "2026-11-08 22:00",
     "league": "英超",
     "home": "水晶宫",
     "away": "利物浦",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.57,
     "conf": 58.5,
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
     "odds": 1.48,
     "conf": 62.3,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周日022",
     "time": "2026-11-09 00:30",
     "league": "德甲",
     "home": "弗赖堡",
     "away": "柏林联合",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.48,
     "conf": 63.3,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周日024",
     "time": "2026-11-09 01:30",
     "league": "西甲",
     "home": "比利亚雷",
     "away": "赫塔费",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.5,
     "conf": 59.4,
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
     "odds": 1.53,
     "conf": 60.5,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周日027",
     "time": "2026-11-09 02:30",
     "league": "德甲",
     "home": "霍芬海姆",
     "away": "沙尔克04",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.57,
     "conf": 60.6,
     "score": "",
     "hit": null,
     "result": ""
    }
   ],
   "hit": null,
   "miss": null,
   "pending": 7,
   "verdict": ""
  }
 ]
};
