// 用法：node build.js，生成 dist/extension/ 下的 Chrome 扩展。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT_DIR = path.join(__dirname, 'dist', 'extension');
const XLSX_FILE = 'xlsx.mini.min.js';

const SHELVE_ORDER = [
  'src/00-header.js', 'src-ext/shim.js', 'src/10-log.js',
  'src/26-boss-defaults.js', 'src/30-config.js',
  'src/40-api-bcs.js', 'src/45-api-wb.js', 'src/50-fetcher.js', 'src/55-shops.js',
  'src/56-products.js', 'src/60-listed.js', 'src/65-shelver.js', 'src/70-styles.js',
  'src/80-ui-toolbar.js', 'src/82-ui-panel.js', 'src/84-ui-settings.js', 'src/86-ui-start.js',
  'src/90-main.js',
];

const SYNC_ORDER = [
  'src-sync/00-header.js',
  'src-ext/shim.js',
  'src/10-log.js',
  'src/30-config.js',
  'src/40-api-bcs.js',
  'src/45-api-wb.js',
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

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const file of ['manifest.json', 'background.js']) {
  fs.copyFileSync(path.join(__dirname, 'src-ext', file), path.join(OUT_DIR, file));
}
fs.copyFileSync(require.resolve(`xlsx/dist/${XLSX_FILE}`), path.join(OUT_DIR, XLSX_FILE));

for (const [file, order] of [['shelve.js', SHELVE_ORDER], ['sync.js', SYNC_ORDER]]) {
  const chunks = order.map(rel => fs.readFileSync(path.join(__dirname, rel), 'utf8'));
  fs.writeFileSync(path.join(OUT_DIR, file), chunks.join('\n'), 'utf8');
}

for (const file of ['background.js', XLSX_FILE, 'shelve.js', 'sync.js']) {
  execFileSync(process.execPath, ['--check', path.join(OUT_DIR, file)], { stdio: 'inherit' });
  console.log(`OK   dist/extension/${file}`);
}
