// ============================================================
//  write-sync-stamp.mjs —— 由 sync-cloud.mjs 调用
//  写一个时间戳，告诉云端构建「刚同步过，别重抓」
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const stampFile = process.argv[2];
if (!stampFile) { console.error('缺少参数'); process.exit(1); }

const info = {
  syncedAt: new Date().toISOString(),
  note: '本机刚同步过数据，云端构建应直接使用，不要重新抓取'
};

fs.writeFileSync(stampFile, JSON.stringify(info, null, 2), 'utf8');
console.log('  已写同步标记: ' + info.syncedAt);
