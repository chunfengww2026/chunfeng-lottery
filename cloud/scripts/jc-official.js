/* 自动生成，请勿手动编辑 · 2026-10-26 23:59
   数据源：体彩官网 webapi.sporttery.cn（getMatchCalculatorV1）
   inSale = 官方公布的【在售场次】，就是竞彩页「体彩竞彩在售 N 场」的那个 N。
   list   = 官方在售的每一场（编号 + 开赛时间），jc-reco-build.mjs 靠它做
            「官方在售 ∩ 推荐」过滤；只写 code/time 两个字段。
   该文件由 build-jc-count.mjs 每小时抓一次；抓不到时不会覆盖本文件。 */
const JC_OFFICIAL = {
 "updated": "2026-10-26 23:59",
 "inSale": 4,
 "officialUpdate": "2026-10-26 21:50:46",
 "list": [
 {
  "code": "周一001",
  "time": "2026-10-27 02:45:00",
  "handicap": 1,
  "handicapOdds": {
   "home": 3.7,
   "draw": 3.6,
   "away": 1.72
  }
 },
 {
  "code": "周一002",
  "time": "2026-10-27 03:45:00",
  "handicap": 1,
  "handicapOdds": {
   "home": 1.82,
   "draw": 3.05,
   "away": 3.96
  }
 },
 {
  "code": "周一003",
  "time": "2026-10-27 04:00:00",
  "handicap": -1,
  "handicapOdds": {
   "home": 3.56,
   "draw": 2.87,
   "away": 2
  }
 },
 {
  "code": "周一004",
  "time": "2026-10-27 07:00:00",
  "handicap": -1,
  "handicapOdds": {
   "home": 1.75,
   "draw": 3.32,
   "away": 3.9
  }
 }
]
};
