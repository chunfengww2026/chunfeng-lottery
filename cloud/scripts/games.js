/* ============================================================
   games.js —— 彩种数据定义
   所有规则参数集中在这里，改规则只改这个文件
   规则来源：中国福彩网 / 中国体彩网官方规则
   ============================================================ */

const GAMES = {

  /* ==================== 中国福利彩票 ==================== */

  ssq: {
    name: '双色球',
    short: 'SSQ',
    issuer: '中国福利彩票',
    desc: '红球 33 选 6，蓝球 16 选 1',
    draw: '每周二、四、日',
    price: 2,
    // 号码结构：按顺序排列，每区一个颜色
    areas: [
      { key: 'red',  label: '红球', from: 1, to: 33, pick: 6, color: 'red'  },
      { key: 'blue', label: '蓝球', from: 1, to: 16, pick: 1, color: 'blue' }
    ],
    tiers: [
      { name: '一等奖', cond: '6红+1蓝', money: null },
      { name: '二等奖', cond: '6红',     money: null },
      { name: '三等奖', cond: '5红+1蓝', money: 3000 },
      { name: '四等奖', cond: '5红 或 4红+1蓝', money: 200 },
      { name: '五等奖', cond: '4红 或 3红+1蓝', money: 10 },
      { name: '六等奖', cond: '1蓝（含2红+1蓝、1红+1蓝、0红+1蓝）', money: 5 }
    ]
  },

  fc3d: {
    name: '福彩3D',
    short: '3D',
    issuer: '中国福利彩票',
    desc: '000-999，三位数字',
    draw: '每天',
    price: 2,
    type: 'digit',
    digits: 3,
    from: 0, to: 9,
    tiers: [
      { name: '单选',  cond: '按位全中',   money: 1040 },
      { name: '组选3', cond: '两位相同，顺序不限', money: 346 },
      { name: '组选6', cond: '三位各不相同，顺序不限', money: 173 }
    ]
  },

  kl8: {
    name: '快乐8',
    short: 'KL8',
    issuer: '中国福利彩票',
    desc: '01-80 选 1~10 个，开奖摇 20 个',
    draw: '每天',
    price: 2,
    // 快乐8特殊：先选玩法（选几），再选号
    playModes: true,
    areas: [
      { key: 'main', label: '号码', from: 1, to: 80, pick: 10, color: 'red' }
    ],
    // 各玩法奖级：[中几个, 奖金]
    modes: {
      10: { label: '选十', tiers: [[10,'浮动奖'],[9,8000],[8,720],[7,80],[6,5],[5,3],[0,2]] },
       9: { label: '选九', tiers: [[9,'浮动奖'],[8,2000],[7,225],[6,22],[5,5],[4,3],[0,2]] },
       8: { label: '选八', tiers: [[8,50000],[7,800],[6,80],[5,10],[4,3],[0,2]] },
       7: { label: '选七', tiers: [[7,8500],[6,300],[5,30],[4,4],[0,2]] },
       6: { label: '选六', tiers: [[6,2880],[5,30],[4,10],[3,3]] },
       5: { label: '选五', tiers: [[5,1000],[4,20],[3,3]] },
       4: { label: '选四', tiers: [[4,93],[3,5],[2,3]] },
       3: { label: '选三', tiers: [[3,52],[2,3]] },
       2: { label: '选二', tiers: [[2,19]] },
       1: { label: '选一', tiers: [[1,4.5]] }
    },
    note: '“选九中九”“选十中十”为浮动奖，单注封顶分别为 25 万元、500 万元'
  },

  qlc: {
    name: '七乐彩',
    short: 'QLC',
    issuer: '中国福利彩票',
    desc: '01-30 选 7，另有 1 个特别号',
    draw: '每周一、三、五',
    price: 2,
    areas: [
      { key: 'main', label: '基本号', from: 1, to: 30, pick: 7, color: 'red'  },
      { key: 'special', label: '特别号', from: 1, to: 30, pick: 1, color: 'blue',
        note: '开奖时额外摇出，用于判定二、四、六等奖' }
    ],
    tiers: [
      { name: '一等奖', cond: '7个基本号全中',           money: null },
      { name: '二等奖', cond: '6个基本号 + 特别号',       money: null },
      { name: '三等奖', cond: '6个基本号',                 money: null },
      { name: '四等奖', cond: '5个基本号 + 特别号',       money: 200 },
      { name: '五等奖', cond: '5个基本号',                 money: 50 },
      { name: '六等奖', cond: '4个基本号 + 特别号',       money: 10 },
      { name: '七等奖', cond: '4个基本号',                 money: 5 }
    ]
  },

  /* ==================== 中国体育彩票 ==================== */

  dlt: {
    name: '大乐透',
    short: 'DLT',
    issuer: '中国体育彩票',
    desc: '前区 35 选 5，后区 12 选 2',
    draw: '每周一、三、六',
    price: 2,
    areas: [
      { key: 'front', label: '前区', from: 1, to: 35, pick: 5, color: 'red'  },
      { key: 'back',  label: '后区', from: 1, to: 12, pick: 2, color: 'blue' }
    ],
    tiers: [
      { name: '一等奖', cond: '5前+2后', money: null },
      { name: '二等奖', cond: '5前+1后', money: null },
      { name: '三等奖', cond: '5前',     money: null },
      { name: '四等奖', cond: '4前+2后', money: 3000 },
      { name: '五等奖', cond: '4前+1后', money: 300 },
      { name: '六等奖', cond: '3前+2后', money: 200 },
      { name: '七等奖', cond: '4前',     money: 100 },
      { name: '八等奖', cond: '3前+1后 或 2前+2后', money: 15 },
      { name: '九等奖', cond: '3前 或 1前+2后 或 2前+1后 或 0前+2后', money: 5 }
    ]
  },

  pl3: {
    name: '排列3',
    short: 'P3',
    issuer: '中国体育彩票',
    desc: '000-999，三位数字',
    draw: '每天',
    price: 2,
    type: 'digit',
    digits: 3,
    from: 0, to: 9,
    tiers: [
      { name: '直选',  cond: '按位全中', money: 1000 },
      { name: '组选3', cond: '两位相同，顺序不限', money: 320 },
      { name: '组选6', cond: '三位各不相同，顺序不限', money: 160 }
    ]
  },

  pl5: {
    name: '排列5',
    short: 'P5',
    issuer: '中国体育彩票',
    desc: '00000-99999，五位数字',
    draw: '每天',
    price: 2,
    type: 'digit',
    digits: 5,
    from: 0, to: 9,
    tiers: [
      { name: '直选', cond: '五位数字按位全中', money: 100000 }
    ]
  },

  qxc: {
    name: '七星彩',
    short: 'QXC',
    issuer: '中国体育彩票',
    desc: '前六位 000000-999999 + 最后一位 0-14',
    /* 【修正】用户确认 + 体彩官方接口核实：七星彩是【每周二、五、日】开奖，不是每天。
       原来的 '每天' 会让 21:45 那班在非开奖日白重试满 35 分钟。
       依据：官方接口最近三期 = 2026-10-13(周二) / 10-11(周日) / 10-09(周五)。 */
    draw: '每周二、五、日',
    price: 2,
    // 特殊结构：前6位是 0-9 数位，最后一位独立 0-14
    type: 'qxc',
    areas: [
      { key: 'front', label: '前六位', digits: 6, from: 0, to: 9,  color: 'red' },
      { key: 'back',  label: '最后一位', digits: 1, from: 0, to: 14, color: 'blue' }
    ],
    tiers: [
      { name: '一等奖', cond: '7位全中',            money: null },
      { name: '二等奖', cond: '前6位全中',          money: null },
      { name: '三等奖', cond: '前6位中5个 + 最后一位中', money: 3000 },
      { name: '四等奖', cond: '任意5个数字命中',    money: 500 },
      { name: '五等奖', cond: '任意4个数字命中',    money: 30 },
      { name: '六等奖', cond: '任意3个数字命中 或 前6位中1个+最后一位中 或 仅最后一位中', money: 5 }
    ]
  }

};

/* ============================================================
   首页分组展示用
   ============================================================ */
const GROUPS = [
  { title: '中国福利彩票', color: 'red',  ids: ['ssq', 'fc3d', 'qlc', 'kl8'] },
  { title: '中国体育彩票', color: 'blue', ids: ['dlt', 'pl3', 'pl5', 'qxc'] }
];
