// 构建脚本：按序拼装模块 → dist/*.user.js
// 用法: node build.js            （构建全部 target）
//       node build.js sync       （只构建指定 target）
// 维护约定：只改 src/ 与 src-sync/ 下的模块，不要手改 dist。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT_DIR = path.join(__dirname, 'dist');
const BOSS_DATA_MODULE = 'src/25-boss-defaults-data.js';
const LOCAL_BOSS_DATA = path.join(__dirname, '.local', 'data', 'boss-defaults.js');

// ---- 现有发布脚本：BCS 批量急速上架 ----
const SHELVE_ORDER = [
  'src/00-header.js', 'src/10-log.js', 'src/20-bridge.js', BOSS_DATA_MODULE,
  'src/26-boss-defaults.js', 'src/30-config.js',
  'src/40-api-bcs.js', 'src/45-api-wb.js', 'src/50-fetcher.js', 'src/55-shops.js',
  'src/56-products.js', 'src/60-listed.js', 'src/65-shelver.js', 'src/70-styles.js',
  'src/80-ui-toolbar.js', 'src/82-ui-panel.js', 'src/84-ui-settings.js', 'src/86-ui-start.js',
  'src/90-main.js',
];

// ---- 新脚本：跨店同步（独立产物，共享 src/ 的 BCS/WB 基础模块）----
const SYNC_ORDER = [
  'src-sync/00-header.js',
  'src/10-log.js',          // 共享：log
  'src/30-config.js',       // 共享：gmLoad/gmSave/userConfig（存储 key 与上架脚本共用）
  'src-sync/08-bridge.js',  // 自有：postMessage 桥接（www 页取 token 写 GM 缓存）+ 手动凭证
  'src/40-api-bcs.js',      // 共享：BCS 直连（seller 页走 GM 凭证缓存）
  'src/45-api-wb.js',       // 共享：card.json / 合成 detail / 描述清洗 / 包装尺寸解析
  'src-sync/10-wb-open-api.js',
  'src-sync/12-shop-probe.js',
  'src-sync/14-shop-map.js',
  'src-sync/16-seller-page.js',
  'src-sync/18-image-hash.js',
  'src-sync/20-sync-diff.js',
  'src-sync/22-sync-apply.js',
  'src-sync/24-shelve-new.js',
  'src-sync/30-ui-probe.js',
  'src-sync/30-ui-toolbar.js',
  'src-sync/32-ui-panel.js',
  'src-sync/40-main.js',
];

const TARGETS = [
  { name: 'shelve', order: SHELVE_ORDER, out: 'bcs_batch_shelve.user.js' },
  { name: 'sync', order: SYNC_ORDER, out: 'bcs_cross_sync.user.js' },
];

const only = process.argv[2];
const list = only ? TARGETS.filter((t) => t.name === only) : TARGETS;
if (!list.length) {
  console.error('未知 target:', only, '可选:', TARGETS.map((t) => t.name).join(', '));
  process.exit(1);
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

let failed = false;
for (const t of list) {
  const chunks = t.order.map((rel) => {
    const p = rel === BOSS_DATA_MODULE && fs.existsSync(LOCAL_BOSS_DATA)
      ? LOCAL_BOSS_DATA
      : path.join(__dirname, rel);
    if (!fs.existsSync(p)) throw new Error('缺少模块文件: ' + rel);
    return fs.readFileSync(p, 'utf8');
  });
  const built = chunks.join('');
  const outFile = path.join(OUT_DIR, t.out);
  fs.writeFileSync(outFile, built, 'utf8');   // ★ 先落盘再校验（子进程有时 EBUSY）

  try {
    execFileSync(process.execPath, ['--check', outFile], { stdio: 'pipe' });
    console.log(`OK   ${t.name}: 语法校验通过`);
  } catch (e) {
    failed = true;
    console.error(`FAIL ${t.name}: 构建产物语法错误`);
    console.error(e.stderr ? e.stderr.toString() : e.message);
  }
  console.log(`built -> ${outFile} (${built.length} bytes)`);
}

if (failed) process.exit(1);
