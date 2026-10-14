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
                { key: 'b_rec', label: '后区推荐' },
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
     版式与双色球 / 大乐透【完全一致】（用户原话：「七星彩和七乐彩用双色球大乐透布局」）：
       图一 main    ：① fields 基本号走势分析 ② rows 基本号推荐号码池 ③ twocol（特别号走势分析 | 最近30期出现次数）
       图二 wuxing  ：① calendar ② twocol（五行号码 | 绕胆图）③ twocol（九转连环图 | 九宫图）
       图三 heatmap ：① heatmap
     七乐彩的 areas 是 main(1~30 选7) + special(1~30 选1)：
       图一① 用「基本号走势分析」、③ 的左栏用「特别号走势分析」。
     特别号是【1 个球】的区 → 奇偶只写「奇/偶」、大小只写「大/小」（不带数字），
     这是用户反复强调过的单球格式，由 stats.js 的 deriveFromPicks 保证。 */
  qlc: {
    name: '七乐彩',
    footer: { brand: '小晴推荐官', shop: '春风彩票店' },
    images: [

      /* ---------- 图一：精选推荐 ---------- */
      {
        key: 'main',
        title: '七乐彩 · 精选推荐',
        sections: [

          /* 基本号走势分析（21 个字段，三列排布）—— 与双色球红球走势同版式 */
          {
            type: 'fields',
            title: '基本号走势分析',
            columns: 3,
            fields: [
              { key: 'hz',      label: '基本号和值' },
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

          /* 基本号推荐号码池（和双色球一样是 20/15/10/3/1 五个档位） */
          {
            type: 'rows',
            title: '基本号推荐号码池',
            rows: [
              { key: 'r20', label: '20码', count: 20, color: 'red'  },
              { key: 'r15', label: '15码', count: 15, color: 'red'  },
              { key: 'r10', label: '10码', count: 10, color: 'red'  },
              { key: 'r3',  label: '3码',  count: 3,  color: 'gold' },
              { key: 'r1',  label: '1码',  count: 1,  color: 'gold' }
            ]
          },

          /* 特别号走势分析（左栏） + 最近30期出现次数（右栏） */
          {
            type: 'twocol',
            left: {
              type: 'fields',
              title: '特别号走势分析',
              columns: 2,
              fields: [
                { key: 'b_jq',  label: '特别号奇偶' },
                { key: 'b_dx',  label: '特别号大小' },
                { key: 'b_012', label: '特别号012路' },
                { key: 'b_rec', label: '特别号推荐', count: 6, color: 'blue' },
                { key: 'b_sh',  label: '特别号杀号' }
              ],
              bigBall: { key: 'b_main', color: 'blue' }
            },
            right: {
              type: 'rank',
              title: '最近30期出现次数',
              groups: [
                { label: '基本号热号排行', count: 6, color: 'red'  },
                { label: '特别号热号排行', count: 6, color: 'blue' }
              ]
            }
          }
        ]
      },

      /* ---------- 图二：五行 / 绕胆 / 九转连环 / 九宫（图位与双色球逐字相同） ---------- */
      {
        key: 'wuxing',
        title: '七乐彩 · 五行 / 绕胆 / 九转连环 / 九宫',
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
                { key: 'wx_ji',   label: '吉利数字' }
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
                { label: '特别号关注', color: 'blue' }
              ]
            }
          },
          {
            type: 'twocol',
            left: {
              type: 'circle',
              title: '九转连环图',
              centerKey: 'cir_center'
              /* 位置/圈数/方向和双色球完全一样（中心 1 + 4 圈 × 8 方向 = 33 格）。
                 七乐彩没有用户给的固定位置表（JIUZHUAN_LAYOUT 只有 ssq / dlt 两张），
                 所以格子里按本彩种主区 1~30 铺号，保证不空格、不出现「—」。
                 位置表要不要补，等用户给（详见交付报告）。 */
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

      /* ---------- 图三：实票统计热力图（图位与双色球逐字相同） ---------- */
      {
        key: 'heatmap',
        title: '七乐彩 · 实票统计',
        headless: true,
        sections: [
          { type: 'heatmap', frontKey: 'main', backKey: 'special' }
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
     版式与双色球 / 大乐透【完全一致】（用户原话：「七星彩和七乐彩用双色球大乐透布局」）：
       图一 main    ：① fields 前区走势分析 ② rows 前区推荐号码池 ③ twocol（后区走势分析 | 最近30期出现次数）
       图二 wuxing  ：① calendar ② twocol（五行号码 | 绕胆图）③ twocol（九转连环图 | 九宫图）
       图三 heatmap ：① heatmap
     七星彩的 areas 是 front(前六位 0~9 ×6) + back(最后一位 0~14)：
       图一① 用「前区走势分析」、③ 的左栏用「后区走势分析」。

     【为什么没有逐位定位了】用户要求「用双色球大乐透布局」，而双色球/大乐透的
     图一只有「走势分析 + 号码池 + 右栏排行」三块；七星彩原来的「定位推荐 / 每位杀号」
     是【另一套版式】（type: positions），要统一就得让位。
     代价说清楚：新图一里【不再逐位（前1位~前6位）给推荐】，
     只有前区整体走势 + 号码池。原来的定位口径没删，
     stats.js 的 positionRecommend / positionKill 一行没动，
     想恢复只要把 type:'positions' 那两个区块加回图一即可（详见交付报告）。

     和保留的「后区」有关的 3 个数字是【真实玩法口径】：
       后区每期只开 1 个号（0~14）→ 推荐 1 个、杀号 3 个。
     旧模板写的是「推荐 8 个 / 杀 5 个」，对「最后一位」是不成立的。 */
  qxc: {
    name: '七星彩',
    footer: { brand: '小晴推荐官', shop: '春风彩票店' },
    images: [

      /* ---------- 图一：精选推荐 ---------- */
      {
        key: 'main',
        title: '七星彩 · 精选推荐',
        sections: [

          /* 前区走势分析（前六位 0~9 的数位，20 个字段，三列排布）
             【逐字段取舍】见交付报告；被去掉的都是「在 0~9 的数位上恒为空」的字段：
               · 同尾号（尾数 = 数字本身，0~9 每个尾数最多 1 个号 → 永远凑不出同尾组）
               · 尾数冷热（同上）
               · 胆码 / 拖码（前区只有 10 个候选，胆拖划分没有统计意义）
             和值的区间宽度标 w:8 —— 6 个 0~9 的真实和值能拉到 0~54，
             按默认 25 会给出没参考价值的宽区间（见 stats.js 的 calcSum 注释）。 */
          {
            type: 'fields',
            title: '前区走势分析',
            columns: 3,
            fields: [
              { key: 'hz',      label: '前区和值',   w: 8 },
              { key: 'kd',      label: '跨度',       kdW: 8 },
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
              { key: 'lin',     label: '邻号' },
              { key: 'tjlh',    label: '跳连号' },
              { key: 'tqh',     label: '同区号' },
              { key: 'zhs',     label: '质数/合数' },
              { key: 'sh',      label: '杀号' },
              { key: 'bf',      label: '定位冷号' }
            ]
          },

          /* 前区推荐号码池（五个档位，版式与双色球/大乐透完全相同）
             【档位数字为什么不是 20/15/10/3/1】前六位是 0~9 的数位，
             候选【只有 10 个】。写「20码」时 stats.js 会老老实实只给出 10 个号
             （range 只有 10 个），于是「20码这一行印了 10 个号」——
             这就是验收脚本里 ⑥档位数量 判定的矛盾（r20 有10应为20）。
             所以数字型彩种的档位必须落在候选范围内：10/8/6/3/1，
             每一档都能真的取满、且小档是大档的子集（和其它彩种同一条规则）。
             要不要给数字彩换一套档位口径，等用户定（详见交付报告）。 */
          {
            type: 'rows',
            title: '前区推荐号码池',
            rows: [
              { key: 'r10', label: '10码', count: 10, color: 'red'  },
              { key: 'r8',  label: '8码',  count: 8,  color: 'red'  },
              { key: 'r6',  label: '6码',  count: 6,  color: 'red'  },
              { key: 'r3',  label: '3码',  count: 3,  color: 'gold' },
              { key: 'r1',  label: '1码',  count: 1,  color: 'gold' }
            ]
          },

          /* 后区走势分析（左栏，最后一位 0~14） + 最近30期出现次数（右栏）
             后区每期只开 1 个号 → 「后区推荐」1 个、「后区杀号」3 个。 */
          {
            type: 'twocol',
            left: {
              type: 'fields',
              title: '后区走势分析',
              columns: 2,
              fields: [
                { key: 'b_jq',  label: '后区奇偶' },
                { key: 'b_dx',  label: '后区大小' },
                { key: 'b_012', label: '后区012路' },
                { key: 'b_rec', label: '后区推荐', count: 1, color: 'blue' },
                { key: 'b_sh',  label: '后区杀号' }
              ],
              bigBall: { key: 'b_main', color: 'blue' }
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

      /* ---------- 图二：五行 / 绕胆 / 九转连环 / 九宫（图位与双色球逐字相同） ---------- */
      {
        key: 'wuxing',
        title: '七星彩 · 五行 / 绕胆 / 九转连环 / 九宫',
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
                { key: 'wx_ji',   label: '吉利数字' }
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
                { label: '后区关注', color: 'blue' }
              ]
            }
          },
          {
            type: 'twocol',
            left: {
              type: 'circle',
              title: '九转连环图',
              centerKey: 'cir_center'
              /* 位置/圈数/方向和双色球完全一样（中心 1 + 4 圈 × 8 方向 = 33 格）。
                 七星彩是 0~9 的数位，没有用户给的固定位置表
                 （JIUZHUAN_LAYOUT 只有 ssq / dlt 两张），
                 所以格子里按本彩种主区 0~9 循环铺号，保证不空格、不出现「—」。
                 位置表要不要补，等用户给（详见交付报告）。 */
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

      /* ---------- 图三：实票统计热力图（图位与双色球逐字相同） ---------- */
      {
        key: 'heatmap',
        title: '七星彩 · 实票统计',
        headless: true,
        sections: [
          { type: 'heatmap', frontKey: 'front', backKey: 'back' }
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
