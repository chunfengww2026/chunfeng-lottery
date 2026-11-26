/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：比赛时间前后 36 小时。
   rows[] 字段：code,time,league,home,away,pick,label,type,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-11-26 20:15",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-11-26 20:15",
   "min": 58,
   "rows": [
    {
     "code": "周四004",
     "time": "2026-11-27 01:45",
     "league": "欧罗巴",
     "home": "比尔森",
     "away": "本菲卡",
     "pick": "away",
     "label": "客胜",
     "type": "three",
     "odds": 1.45,
     "conf": 65.2,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周四012",
     "time": "2026-11-27 04:00",
     "league": "欧协联",
     "home": "布拉加",
     "away": "库奥皮奥",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.13,
     "conf": 79.4,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周四009",
     "time": "2026-11-27 04:00",
     "league": "欧罗巴",
     "home": "霍芬海姆",
     "away": "格风暴",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.3,
     "conf": 68.2,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周四008",
     "time": "2026-11-27 04:00",
     "league": "欧罗巴",
     "home": "桑德兰",
     "away": "比亚韦",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.22,
     "conf": 67.3,
     "score": "",
     "hit": null,
     "result": ""
    },
    {
     "code": "周五003",
     "time": "2026-11-28 03:00",
     "league": "荷甲",
     "home": "格罗宁根",
     "away": "威廉二世",
     "pick": "home",
     "label": "主胜",
     "type": "three",
     "odds": 1.4,
     "conf": 73,
     "score": "",
     "hit": null,
     "result": ""
    }
   ],
   "hit": null,
   "miss": null,
   "pending": 5,
   "verdict": ""
  }
 ]
};
