/* jc-reco-data.js —— 竞彩【推荐串】存档数据（程序生成，勿手改）
   ⚠️ 这是【数据】不是代码；计算逻辑在 jc-reco-archive.js 里。
   每期把「当时那一串推荐」原样存下来；比赛打完后由 jc-reco-build.mjs
   回填终场比分与红黑。窗口：开赛时间前后 24 小时。
   rows[] 字段：code,time,league,home,away,pick,label,odds,conf,score,hit,result
   batches[].verdict：红 / 黑 / （空 = 还有比赛没打完） */
const JC_RECO_DATA = {
 "updated": "2026-10-17 08:45",
 "note": "竞彩推荐串存档（程序生成，勿手改）",
 "batches": [
  {
   "at": "2026-10-17 02:21",
   "min": 55,
   "rows": [
    {
     "code": "周五003",
     "time": "2026-10-17 01:00",
     "league": "瑞典超",
     "home": "布鲁马波",
     "away": "佐加顿斯",
     "pick": "away",
     "label": "客胜",
     "odds": 1.5,
     "conf": 62.7,
     "score": "0:2",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周五005",
     "time": "2026-10-17 02:00",
     "league": "荷乙",
     "home": "登博思",
     "away": "奥斯",
     "pick": "home",
     "label": "主胜",
     "odds": 1.56,
     "conf": 60.3,
     "score": "2:1",
     "hit": true,
     "result": "win"
    },
    {
     "code": "周五004",
     "time": "2026-10-17 02:00",
     "league": "荷甲",
     "home": "海伦芬",
     "away": "SBV精英",
     "pick": "home",
     "label": "主胜",
     "odds": 1.6,
     "conf": 59.2,
     "score": "4:0",
     "hit": true,
     "result": "win"
    }
   ],
   "hit": 1,
   "miss": 0,
   "pending": 0,
   "verdict": "红"
  }
 ]
};
