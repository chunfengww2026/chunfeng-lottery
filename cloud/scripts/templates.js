/* ============================================================
   templates.js —— 推荐图模板（固定结构）

   ⚠️ 这些模板是【固定死】的：
      - 版式、分区、字段、每行几个号，全部固定
      - 不管内容怎么改，排版永远一样
      - 任何人都不要改这个文件的结构

   内容存在 data-store.js 里（key = cdd.tickets.v1），
   每个彩种每天一条，字段名和下面 fields 里的 key 一一对应。

   结构说明：
     fields  —— 简单文本字段（渲染成「标签 + 值」）
     rows    —— 号码行（每行固定个数，从多到少排列）
     grid    —— 色块网格（绕胆图）
     positions —— 定位行（每位一组号）
   ============================================================ */

const TEMPLATES = {

  /* ══════════════════ 双色球 ══════════════════ */
  ssq: {
    name: '双色球',
    footer: { brand: '小晴推荐官', shop: '春风彩票店' },
    images: [

      /* ---------- 图一：精选推荐 ---------- */
      {
        key: 'main',
        title: '双色球 · 精选推荐',
        sections: [

          /* 红球走势分析（24 个字段，三列排布） */
          {
            type: 'fields',
            title: '红球走势分析',
            columns: 3,
            fields: [
              { key: 'hz',      label: '红球和值' },
              { key: 'kd',      label: '跨度' },
              { key: 'jq',      label: '奇偶比' },
              { key: 'dx',      label: '大小比' },
              { key: 'qjb',     label: '区间比' },
              { key: 'lu012',   label: '012路比' },
              { key: 're',      label: '热号' },
              { key: 'leng',    label: '冷号' },
              { key: 'maxomit', label: '最大遗漏' },
              { key: 'ylhb',    label: '遗漏回补' },
              { key: 'lh',      label: '连号' },
              { key: 'cf',      label: '重复号' },
              { key: 'wh',      label: '同尾号' },
              { key: 'lin',     label: '邻号' },
              { key: 'tjlh',    label: '跳连号' },
              { key: 'tqh',     label: '同区号' },
              { key: 'zhs',     label: '质数/合数' },
              { key: 'wsl',     label: '尾数冷热' },
              { key: 'sh',      label: '杀号' },
              { key: 'dm',      label: '胆码' },
              { key: 'tm',      label: '拖码' }
            ]
          },

          /* 红球推荐号码池（固定 5 行） */
          {
            type: 'rows',
            title: '红球推荐号码池',
            rows: [
              { key: 'r20', label: '20码', count: 20, color: 'red'  },
              { key: 'r15', label: '15码', count: 15, color: 'red'  },
              { key: 'r10', label: '10码', count: 10, color: 'red'  },
              { key: 'r3',  label: '3码',  count: 3,  color: 'gold' },
              { key: 'r1',  label: '1码',  count: 1,  color: 'gold' }
            ]
          },

          /* 蓝球走势分析（左栏） + 最近30期（右栏） */
          {
            type: 'twocol',
            left: {
              type: 'fields',
              title: '蓝球走势分析',
              columns: 2,
              fields: [
                { key: 'b_jq',  label: '蓝球奇偶' },
                { key: 'b_dx',  label: '蓝球大小' },
                { key: 'b_012', label: '蓝球012路' },
                { key: 'b_rec', label: '蓝球推荐', count: 6, color: 'blue' },
                { key: 'b_sh',  label: '蓝球杀号' }
              ],
              bigBall: { key: 'b_main', color: 'blue' }
            },
            right: {
              type: 'rank',
              title: '最近30期出现次数',
              groups: [
                { label: '红球热号排行', count: 6, color: 'red' },
                { label: '蓝球热号排行', count: 6, color: 'blue' }
              ]
            }
          }
        ]
      },

      /* ---------- 图二：五行 / 绕胆 / 九转连环 / 九宫 ---------- */
      {
        key: 'wuxing',
        title: '双色球 · 五行 / 绕胆 / 九转连环 / 九宫',
        sections: [
          {
            type: 'calendar',
            fields: [
              { key: 'c_gongli', label: '公历' },
              { key: 'c_nongli', label: '农历' },
              { key: 'c_ganzhi', label: '干支' },
              { key: 'c_wx',     label: '日五行' }
            ],
            badges: [
              { key: 'badge1', label: '财神' },
              { key: 'badge2', label: '喜神' },
              { key: 'badge3', label: '福神' },
              { key: 'badge4', label: '贵神' },
              { key: 'badge5', label: '冲煞' }
            ]
          },
          {
            type: 'twocol',
            left: {
              type: 'wuxing',
              title: '五行号码',
              elements: [
                { key: 'e_jin',  name: '金', tailsLabel: '尾4、9' },
                { key: 'e_mu',   name: '木', tailsLabel: '尾3、8' },
                { key: 'e_shui', name: '水', tailsLabel: '尾1、6' },
                { key: 'e_huo',  name: '火', tailsLabel: '尾2、7' },
                { key: 'e_tu',   name: '土', tailsLabel: '尾5、0' }
              ],
              footer: [
                { key: 'wx_wang', label: '旺尾' },
                { key: 'wx_ruo',  label: '弱尾' },
                { key: 'wx_ji',   label: '吉利数字' },
                { key: 'wx_yy',   label: '阴阳' }
              ]
            },
            right: {
              type: 'grid',
              title: '绕胆图',
              cols: 4,
              rows: 4,
              legend: [
                { label: '金胆', color: 'gold-red' },
                { label: '银胆', color: 'orange'   },
                { label: '拖码', color: 'purple'   },
                { label: '蓝球关注', color: 'blue' }
              ]
            }
          },
          {
            type: 'twocol',
            left: {
              type: 'circle',
              title: '九转连环图',
              centerKey: 'cir_center',
              /* 【固定同心圆模板】中心 1 + 4 圈 × 8 方向 = 33 个位置，
                 33 个位置放全部红球 01~33 —— 位置表和号码都在
                 stats.js 的 JIUZHUAN_LAYOUT 里（用户逐字给的，不改）。
                 stats.js 同时铺好这几个【高亮口径】字段（和图一号码池同一套池子）：
                   cir_pool 推荐号池 20 码 → 图上红色
                   cir_dan  金胆/银胆 前 3 码 → 图上金色
                   cir_tuo  拖码 随后 7 码   → 图上橙色
                 注意：这里【不写 fields】—— circle 区块的 fields 会被
                 autoFillForTemplate 当成走势字段覆盖掉（推荐池会被截成 6 码）。
                 区块结构保持原样，只认 centerKey；图例由 render.js 按
                 实际用到的颜色自己画。 */
            },
            right: {
              type: 'jiugong',
              title: '九宫图',
              centerKey: 'jg_center',
              footer: [
                { key: 'jg_zhong', label: '中宫' },
                { key: 'jg_guan',  label: '关注号码' }
              ]
            }
          }
        ]
      },

      /* ---------- 图三：实票统计热力图 ----------
         【按天出】只在开奖日 18:00 之后、且数据就是当天的才渲染；
         数据在 heatmap-data.js 里（build-heatmap.mjs 生成），
         判断函数是 shouldShowHeatmap(gameId)，两边同一个口径。
         headless: true —— 用图里自己的深红标题条，不再套通用的红色页头。 */
      {
        key: 'heatmap',
        title: '双色球 · 实票统计',
        headless: true,
        sections: [
          { type: 'heatmap', frontKey: 'front', backKey: 'back' }
        ]
      }
    ]
  },

  /* ══════════════════ 大乐透 ══════════════════ */
  dlt: {
    name: '大乐透',
    footer: { brand: '小晴推荐官', shop: '春风彩票店' },
    images: [

      /* ---------- 图一：精选推荐 ---------- */
      {
        key: 'main',
        title: '大乐透 · 精选推荐',
        sections: [
          {
            type: 'fields',
            title: '前区走势分析',
            columns: 3,
            fields: [
              { key: 'hz',      label: '前区和值' },
              { key: 'kd',      label: '跨度' },
              { key: 'jq',      label: '奇偶比' },
              { key: 'dx',      label: '大小比' },
              { key: 'qjb',     label: '区间比' },
              { key: 'lu012',   label: '012路比' },
              { key: 're',      label: '热号' },
              { key: 'leng',    label: '冷号' },
              { key: 'maxomit', label: '最大遗漏' },
              { key: 'ylhb',    label: '遗漏回补' },
              { key: 'lh',      label: '连号' },
              { key: 'cf',      label: '重复号' },
              { key: 'wh',      label: '同尾号' },
              { key: 'lin',     label: '邻号' },
              { key: 'tjlh',    label: '跳连号' },
              { key: 'tqh',     label: '同区号' },
              { key: 'zhs',     label: '质数/合数' },
              { key: 'wsl',     label: '尾数冷热' },
              { key: 'sh',      label: '杀号' },
              { key: 'dm',      label: '胆码' },
              { key: 'tm',      label: '拖码' }
            ]
          },
          {
            type: 'rows',
            title: '前区推荐号码池',
            rows: [
              { key: 'f20', label: '20码', count: 20, color: 'red'  },
              { key: 'f15', label: '15码', count: 15, color: 'red'  },
              { key: 'f10', label: '10码', count: 10, color: 'red'  },
              { key: 'f3',  label: '3码',  count: 3,  color: 'gold' },
              { key: 'f1',  label: '1码',  count: 1,  color: 'gold' }
            ]
          },
          {
            type: 'twocol',
            left: {
              type: 'fields',
              title: '后区走势分析',
              columns: 2,
              fields: [
                { key: 'b_re',  label: '后区热号' },
                { key: 'b_le',  label: '后区冷号' },
                { key: 'b_jq',  label: '后区奇偶' },
                { key: 'b_dx',  label: '后区大小' },
                { key: 'b_012', label: '后区012路' },
                { key: 'b_rec', count: 6, label: '后区推荐' },
                { key: 'b_sh',  label: '后区杀号' }
              ],
              bigBalls: { key: 'b_main', count: 2, color: 'blue' }
            },
            right: {
              type: 'rank',
              title: '最近30期出现次数',
              groups: [
                { label: '前区热号排行', count: 6, color: 'red'  },
                { label: '后区热号排行', count: 6, color: 'blue' }
              ]
            }
          }
        ]
      },

      /* ---------- 图二：五行 / 绕胆 / 九转连环 / 九宫 ---------- */
      {
        key: 'wuxing',
        title: '大乐透 · 五行 / 绕胆 / 九转连环 / 九宫',
        sections: [
          {
            type: 'calendar',
            fields: [
              { key: 'c_gongli', label: '公历' },
              { key: 'c_nongli', label: '农历' },
              { key: 'c_ganzhi', label: '干支' },
              { key: 'c_wx',     label: '日五行' }
            ],
            badges: [
              { key: 'badge1', label: '财神' },
              { key: 'badge2', label: '喜神' },
              { key: 'badge3', label: '福神' },
              { key: 'badge4', label: '贵神' },
              { key: 'badge5', label: '冲煞' }
            ]
          },
          {
            type: 'twocol',
            left: {
              type: 'wuxing',
              title: '五行号码',
              elements: [
                { key: 'e_jin',  name: '金', tailsLabel: '尾4、9' },
                { key: 'e_mu',   name: '木', tailsLabel: '尾3、8' },
                { key: 'e_shui', name: '水', tailsLabel: '尾1、6' },
                { key: 'e_huo',  name: '火', tailsLabel: '尾2、7' },
                { key: 'e_tu',   name: '土', tailsLabel: '尾5、0' }
              ],
              footer: [
                { key: 'wx_wang', label: '旺尾' },
                { key: 'wx_ruo',  label: '弱尾' },
                { key: 'wx_ji',   label: '吉利数字' },
                { key: 'wx_yy',   label: '阴阳' }
              ]
            },
            right: {
              type: 'grid',
              title: '绕胆图',
              cols: 4,
              rows: 4,
              legend: [
                { label: '金胆', color: 'gold-red'     },
                { label: '银胆', color: 'orange'      },
                { label: '拖码', color: 'purple'      },
                { label: '后区关注', color: 'blue'    }
              ]
            }
          },
          {
            type: 'twocol',
            left: {
              type: 'circle',
              title: '九转连环图',
              centerKey: 'cir_center',
              /* 【固定同心圆模板】同双色球：中心 1 + 4 圈 × 8 方向 = 33 个位置，
                 用 JIUZHUAN_LAYOUT.dlt 那张固定表（33 个前区号 ——
                 1~35 里缺 01 和 33，用户给的表就是这样，照实现不补号）。
                 高亮口径同上：cir_pool(红) / cir_dan(金) / cir_tuo(橙)；
                 图例由 render.js 按实际用到的颜色自己画，这里不写 fields。 */
            },
            right: {
              type: 'jiugong',
              title: '九宫图',
              centerKey: 'jg_center',
              footer: [
                { key: 'jg_zhong', label: '中宫' },
                { key: 'jg_guan',  label: '关注号码' }
              ]
            }
          }
        ]
      },

      /* ---------- 图三：实票统计热力图（同上，按天出） ---------- */
      {
        key: 'heatmap',
        title: '大乐透 · 实票统计',
        headless: true,
        sections: [
          { type: 'heatmap', frontKey: 'front', backKey: 'back' }
        ]
      }
    ]
  },

  /* ══════════════════ 七乐彩 ══════════════════
     【已回退】用户原话：「七星彩模板错了 给我改回去」——
     本次「用双色球大乐透布局」的改动连同七乐彩一起撤回，
     恢复成原来的单张图版式（冷热号参考 + 推荐号码池 + 杀号参考）。
     原样保留，不要按双色球/大乐透那套再改。 */
  qlc: {
    name: '七乐彩',
    footer: { brand: '小晴推荐官', shop: '春风彩票店' },
    images: [
      {
        key: 'main',
        title: '七乐彩 · 精选推荐',
        sections: [
          {
            type: 'twovalues',
            title: '冷热号参考',
            items: [
              { key: 're',   label: '热号' },
              { key: 'leng', label: '冷号' }
            ]
          },
          {
            type: 'rows',
            title: '推荐号码池',
            rows: [
              { key: 'r22', label: '22码', count: 22, color: 'red'  },
              { key: 'r18', label: '18码', count: 18, color: 'red'  },
              { key: 'r12', label: '12码', count: 12, color: 'red'  },
              { key: 'r6',  label: '6码',  count: 6,  color: 'red'  },
              { key: 'r3',  label: '3码',  count: 3,  color: 'gold' },
              { key: 'r1',  label: '1码',  count: 1,  color: 'gold' }
            ]
          },
          {
            type: 'rows',
            title: '杀号参考',
            rows: [
              { key: 'sh', label: '杀号', count: 6, color: 'gray' }
            ]
          }
        ]
      }
    ]
  },

  /* ══════════════════ 快乐8 ══════════════════ */
  kl8: {
    name: '快乐8',
    footer: { brand: '小晴推荐官', shop: '春风彩票店' },
    images: [
      {
        key: 'main',
        title: '快乐8 · 精选推荐',
        sections: [
          {
            type: 'twovalues',
            items: [
              { key: 're',   label: '热号' },
              { key: 'leng', label: '冷号' }
            ]
          },
          {
            type: 'rows',
            title: '推荐号码池',
            rows: [
              { key: 'r30', label: '30胆', count: 30, color: 'red'  },
              { key: 'r24', label: '24胆', count: 24, color: 'red'  },
              { key: 'r10', label: '10码', count: 10, color: 'gold' },
              { key: 'r5',  label: '5码',  count: 5,  color: 'gold' }
            ]
          },
          {
            type: 'rows',
            title: '',
            rows: [
              { key: 'sh', label: '杀号', count: 5, color: 'gray' }
            ]
          }
        ]
      }
    ]
  },

  /* ══════════════════ 福彩3D ══════════════════ */
  fc3d: {
    name: '福彩3D',
    footer: { brand: '小晴推荐官', shop: '春风彩票店' },
    images: [
      {
        key: 'main',
        title: '福彩3D · 精选推荐',
        sections: [
          {
            type: 'digit',
            groupLabel: '6码可组选',
            groupRow: { key: 'grp', count: 6 },
            /* 【每位 3 号】用户 2026-10-20：「3D和排列三以及排列五定位都改成3位」
               → 每个位置 3 个号（原来 2 个），仍然全部取自上面那行「6码可组选」。
               数学：各位 3 号 + 全落在 6 码内 ⇒ 组三 ≥ 9 注，做不到全组六（这是必然的）；
                     直选闸会把组三压到该约束下的最小值 9 注、豹子保持 0。
               （final gate：stats.js 的 enforceDigitStraightGate 会按 grp 重排并兜底） */
            positions: [
              { key: 'bai', label: '百位', count: 3 },
              { key: 'shi', label: '十位', count: 3 },
              { key: 'ge',  label: '个位', count: 3 }
            ],
            footer: [
              { key: 'hz',  label: '合值' },
              { key: 'hw',  label: '和尾' },
              { key: 'fz3', label: '防组三' },
              { key: 'sh',  label: '杀号' }
            ]
          }
        ]
      }
    ]
  },

  /* ══════════════════ 排列3 ══════════════════ */
  pl3: {
    name: '排列三',
    footer: { brand: '小晴推荐官', shop: '春风彩票店' },
    images: [
      {
        key: 'main',
        title: '排列三 · 精选推荐',
        sections: [
          {
            type: 'digit',
            groupLabel: '6码可组选',
            groupRow: { key: 'grp', count: 6 },
            /* 【每位 3 号】用户 2026-10-20：「3D和排列三以及排列五定位都改成3位」
               → 每个位置 3 个号（原来 2 个），仍然全部取自上面那行「6码可组选」。
               数学：各位 3 号 + 全落在 6 码内 ⇒ 组三 ≥ 9 注，做不到全组六（这是必然的）；
                     直选闸会把组三压到该约束下的最小值 9 注、豹子保持 0。
               （final gate：stats.js 的 enforceDigitStraightGate 会按 grp 重排并兜底） */
            positions: [
              { key: 'bai', label: '百位', count: 3 },
              { key: 'shi', label: '十位', count: 3 },
              { key: 'ge',  label: '个位', count: 3 }
            ],
            footer: [
              { key: 'hz',  label: '合值' },
              { key: 'hw',  label: '和尾' },
              { key: 'fz3', label: '防组三' },
              { key: 'sh',  label: '杀号' }
            ]
          }
        ]
      }
    ]
  },

  /* ══════════════════ 排列5 ══════════════════ */
  pl5: {
    name: '排列五',
    footer: { brand: '小晴推荐官', shop: '春风彩票店' },
    images: [
      {
        key: 'main',
        title: '排列五 · 精选推荐',
        note: '前三位采用排三',
        sections: [
          {
            type: 'digit',
            positions: [
              /* 【每位 3 号】用户 2026-10-20：「…排列五定位都改成3位」——
                 前三位＝排三那三位直接带入（排三现在也是每位 3 号）；
                 后两位本来就是 3 号，保持不变。 */
              { key: 'wan',  label: '万位', count: 3 },
              { key: 'qian', label: '千位', count: 3 },
              { key: 'bai',  label: '百位', count: 3 },
              { key: 'shi',  label: '十位', count: 3, color: 'blue' },
              { key: 'ge',   label: '个位', count: 3, color: 'blue' }
            ],
            footerText: '排三百位→排五万位　|　排三十位→排五千位　|　排三个位→排五百位　排三前三位直接带入排五'
          }
        ]
      }
    ]
  },

  /* ══════════════════ 七星彩 ══════════════════
     【已回退】用户原话：「七星彩模板错了 给我改回去」——
     本次「用双色球大乐透布局」的改动撤回，恢复成原来的单张图版式：
       图一 main：twocol（左「定位推荐」逐位 / 右「杀号参考（每位杀3）」）
     原样保留，不要按双色球/大乐透那套再改。 */
  qxc: {
    name: '七星彩',
    footer: { brand: '小晴推荐官', shop: '春风彩票店' },
    images: [
      {
        key: 'main',
        title: '七星彩 · 精选推荐',
        sections: [
          {
            type: 'twocol',
            left: {
              type: 'positions',
              title: '定位推荐',
              rows: [
                { key: 'p1', label: '前1位', count: 5 },
                { key: 'p2', label: '前2位', count: 5 },
                { key: 'p3', label: '前3位', count: 5 },
                { key: 'p4', label: '前4位', count: 5 },
                { key: 'p5', label: '前5位', count: 5 },
                { key: 'p6', label: '前6位', count: 5 },
                { key: 'pb', label: '后区',   count: 8, firstGold: true }
              ]
            },
            right: {
              type: 'positions',
              title: '杀号参考（每位杀3）',
              gray: true,
              rows: [
                { key: 'k1', label: '前1杀', count: 3 },
                { key: 'k2', label: '前2杀', count: 3 },
                { key: 'k3', label: '前3杀', count: 3 },
                { key: 'k4', label: '前4杀', count: 3 },
                { key: 'k5', label: '前5杀', count: 3 },
                { key: 'k6', label: '前6杀', count: 3 },
                { key: 'kb', label: '后区杀', count: 5 }
              ]
            }
          }
        ]
      }
    ]
  }
};

/* ============================================================
   页脚免责声明（固定）
   ============================================================ */
const TEMPLATE_DISCLAIMER = '彩票有风险，投注需谨慎。本推荐仅为个人分析，不构成购彩建议，请理性参与。';

/* ============================================================
   冻结：防止模板被意外改动
   ============================================================ */
(function freezeTemplates() {
  const deepFreeze = (obj) => {
    if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
      Object.freeze(obj);
      Object.getOwnPropertyNames(obj).forEach((k) => deepFreeze(obj[k]));
    }
    return obj;
  };
  deepFreeze(TEMPLATES);
  deepFreeze(TEMPLATE_DISCLAIMER);
})();

/* ============================================================
   工具：列出某个模板需要哪些字段（用于生成录入表单）
   ============================================================ */
function templateFieldKeys(gameId, imageKey) {
  const tpl = TEMPLATES[gameId];
  if (!tpl) return [];
  const img = tpl.images.find((i) => i.key === imageKey) || tpl.images[0];
  const keys = [];

  const walk = (sec) => {
    if (!sec || typeof sec !== 'object') return;
    if (sec.fields) sec.fields.forEach((f) => keys.push(f.key));
    if (sec.rows) sec.rows.forEach((r) => keys.push(r.key));
    if (sec.positions) sec.positions.forEach((p) => keys.push(p.key));
    if (sec.groupRow) keys.push(sec.groupRow.key);
    if (sec.elements) sec.elements.forEach((e) => keys.push(e.key));
    if (sec.groups) sec.groups.forEach((g) => keys.push(g.key || g.label));
    if (sec.footer) sec.footer.forEach((f) => keys.push(f.key));
    if (sec.items) sec.items.forEach((i) => keys.push(i.key));
    if (sec.bigBall) keys.push(sec.bigBall.key);
    if (sec.bigBalls) keys.push(sec.bigBalls.key);
    if (sec.centerKey) keys.push(sec.centerKey);
    if (sec.badges) sec.badges.forEach((b) => keys.push(b.key));
    if (sec.left) walk(sec.left);
    if (sec.right) walk(sec.right);
    if (sec.legend) sec.legend.forEach((l, i) => keys.push('legend_' + i));
  };

  img.sections.forEach(walk);
  return keys;
}
