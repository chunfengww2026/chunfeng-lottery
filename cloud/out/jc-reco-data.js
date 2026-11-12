/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-11-12 22:13",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-11-12 22:13",
   "min": 58,
   "rows": [
    {
     "code": "周五004",
     "time": "2026-11-14 03:45",
     "league": "欧国联",
     "home": "苏格兰",
     "away": "北马其顿",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.18,
     "conf": 77.3,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周五005",
     "time": "2026-11-14 03:45",
     "league": "欧国联",
     "home": "塞尔维亚",
     "away": "德国",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.29,
     "conf": 75.1,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周五007",
     "time": "2026-11-14 03:45",
     "league": "欧国联",
     "home": "斯洛伐克",
     "away": "法罗群岛",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.36,
     "conf": 69.5,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周五009",
     "time": "2026-11-14 03:45",
     "league": "欧国联",
     "home": "荷兰",
     "away": "希腊",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.55,
     "conf": 64.4,
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
