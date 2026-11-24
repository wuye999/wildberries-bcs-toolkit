// node --test tests/shelve.test.js
// 所有接口均为内存模拟；不读取真实凭证、不发送 HTTP、不操作真实店铺。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const XLSX = require('xlsx');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('src-ext/manifest.json'));
const clone = value => JSON.parse(JSON.stringify(value));
const quiet = { info() {}, warn() {}, error() {}, errorDetail() {} };
const instant = callback => { queueMicrotask(callback); return 0; };

function context(files, extra = {}) {
  const storage = new Map();
  const c = vm.createContext({
    console, log: quiet, URL, setTimeout: instant, clearTimeout() {},
    GM_getValue: (key, fallback) => storage.get(key) ?? fallback,
    GM_setValue: (key, value) => storage.set(key, value),
    localStorage: { getItem: () => null },
    document: { getElementById: () => null }, showToast() {}, alert() {}, confirm: () => true,
    ...extra,
  });
  for (const file of files) vm.runInContext(read(file), c, { filename: file });
  c.storage = storage;
  c.evaluate = code => vm.runInContext(code, c);
  return c;
}

const config = () => ({
  selectedShopIds: ['1', 2], prefixCode: 'QAAA', intervalMs: 0,
  shopConfigs: { 1: { warehouseId: 11, quantity: 0, priceMultiplier: 2 }, 2: { warehouseId: 22, quantity: 7, priceMultiplier: 10 } },
  settings: { carryBrand: false, directUpload: true, noMerge: true },
});
const shops = () => [
  { id: 1, shopName: 'A', warehouses: [{ id: 11, name: 'Москва' }] },
  { id: 2, shopName: 'B', warehouses: [{ id: 22, name: 'Москва' }] },
];
const item = () => ({
  nmId: '12345', vendorCode: 'BCS-QAAA-12345', fetched: true, title: 'Товар',
  subjectId: 1, parentId: 2, brand: 'SOURCE BRAND', colors: [12345],
  wbDetail: { id: 12345, name: 'Товар', brand: 'SOURCE BRAND', sizes: [
    { techSize: 'S', wbSize: '44', skus: ['SOURCE BARCODE'] },
    { techSize: 'M', wbSize: '46', barcode: 'SOURCE BARCODE' },
  ] },
  wbCardInfo: { imt_id: 10, data: { subject_id: 1, subject_root_id: 2 }, description: 'x'.repeat(2500) + '&./', media: { photo_count: 1 } },
  imagesList: ['https://example.invalid/photo.webp'], mainImage: 'https://example.invalid/photo.webp',
});

function shelver(extra = {}) {
  const c = context(['src/26-boss-defaults.js', 'src/30-config.js', 'src/45-api-wb.js',
    'src/50-fetcher.js', 'src/65-shelver.js', 'src/86-ui-start.js'], {
    BCS_API_BASE: 'https://wb.bcserp.com/prod-api',
    shopsCache: shops(), listedNmIdSet: new Set(), listedDetailMap: new Map(), saveListedCache() {},
    bcsApiCall: async () => ({ code: 200, rows: [], total: 0 }), ...extra,
  });
  c.setBossDefaults({
    QAAA: { sku: 'TEST-A', name: '测试商品 A', minPrice: 50, length: 16, width: 9, height: 4, weight: 0.2 },
    QBBB: { sku: 'TEST-B', name: '测试商品 B', minPrice: 60, length: 25, width: 9, height: 4, weight: 0.3 },
    QCCC: { sku: 'TEST-C', name: '测试商品 C', minPrice: 42.4, length: 20, width: 9, height: 4, weight: 0.3 },
  });
  c.inputConfig = config(); c.inputItem = item();
  c.evaluate('userConfig = inputConfig; pendingList = [inputItem];');
  return c;
}

const priceHeader = ['产品中文名', '尺寸', '最低售价', 'vendorCode前缀码'];
const xlsxMini = path.relative(root, require.resolve('xlsx/dist/xlsx.mini.min.js'));

function priceWorkbook(sheets) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

test('解析真实表头与空卖家 SKU，优先读取 Sheet1 并按前缀更新价格和包装', () => {
  const c = context([xlsxMini, 'src/26-boss-defaults.js'], { ArrayBuffer });
  const parsed = c.parseBossDefaultsWorkbook(priceWorkbook({
    说明: [['忽略这个工作表']],
    Sheet1: [
      ['产品图片', '卖家SKU', ...priceHeader, '马帮库存SKU', '发货方式'],
      [null, null, ' 冲牙器 ', '7*8*10 /0.34', 41.5, ' abcd ', 'MB-1', '仓发'],
      [null, ' SKU-2 ', '收纳盒', '20*25*8/ 6.5', ' 16.2 ', 'QBBB'],
    ],
  }));
  const expected = { sku: '', name: '冲牙器', minPrice: 41.5, length: 7, width: 8, height: 10, weight: 0.34 };
  assert.deepEqual(clone(parsed.entries[0]), { code: 'ABCD', ...expected });
  assert.equal(parsed.items.QBBB.sku, 'SKU-2');
  assert.equal(parsed.items.QBBB.weight, 6.5);
  assert.equal(parsed.warnings.length, 0);
  assert.deepEqual(clone(c.evaluate('PREFIX_CODES')), []);

  c.setBossDefaults(parsed.items);
  assert.deepEqual(clone(c.evaluate('PREFIX_CODES')), [
    { sku: '', name: '冲牙器', code: 'ABCD' },
    { sku: 'SKU-2', name: '收纳盒', code: 'QBBB' },
  ]);
  assert.equal(c.evaluate("PREFIX_CODE_SET.has('ABCD')"), true);
  assert.equal(c.getPrefixCodeLabel('ABCD'), 'ABCD - 冲牙器');
  assert.deepEqual(clone(c.getItemBossDefaults({ vendorCode: 'BCS-ABCD-123' }, {})), expected);
  assert.equal(c.getItemBossDefaults({}, { prefixCode: 'QBBB' }).minPrice, 16.2);
});

test('按第一行列名读取重排列，支持无卖家 SKU，缺少必需列时报列名', () => {
  const c = context([xlsxMini, 'src/26-boss-defaults.js'], { ArrayBuffer });
  const parsed = c.parseBossDefaultsWorkbook(priceWorkbook({
    价格清单: [
      ['发货方式', '最低售价', 'vendorCode前缀码', '尺寸', '产品中文名'],
      ['仓发', 10, 'ABCD', ' 7/8*10/0.34 ', '冲牙器'],
    ],
  }));
  assert.equal(parsed.items.ABCD.sku, '');
  assert.equal(parsed.items.ABCD.height, 10);
  assert.throws(() => c.parseBossDefaultsWorkbook(priceWorkbook({
    Sheet1: [['产品中文名', '最低售价'], ['冲牙器', 10]],
  })), /缺少必需列：尺寸、vendorCode前缀码/);
  assert.throws(() => c.parseBossDefaultsWorkbook(priceWorkbook({
    Sheet1: [[], priceHeader, ['冲牙器', '7*8*10/0.34', 10, 'ABCD']],
  })), /缺少必需列：产品中文名、尺寸、最低售价、vendorCode前缀码/);
});

test('跳过空关键行，对重复前缀、非法前缀、售价和尺寸记录实际行号', () => {
  const c = context([xlsxMini, 'src/26-boss-defaults.js'], { ArrayBuffer });
  const parsed = c.parseBossDefaultsWorkbook(priceWorkbook({
    Sheet1: [
      [...priceHeader, '发货方式'],
      ['首条', '7*8*10/0.34', 10, 'ABCD'],
      [],
      [null, null, null, null, '仓发'],
      ['重复项', '7*8*10/0.34', 20, ' abcd '],
      ['非法前缀', '7*8*10/0.34', 10, 'AB1D'],
      ['非法售价', '7*8*10/0.34', 'Infinity', 'QBBB'],
      ['非法尺寸', '7*8*10/0', 10, 'QCCC'],
    ],
  }));
  assert.deepEqual(Object.keys(parsed.items), ['ABCD']);
  assert.equal(parsed.items.ABCD.minPrice, 10);
  assert.deepEqual(clone(parsed.warnings), [
    '第 5 行：vendorCode前缀码 ABCD 重复，保留首条',
    '第 6 行：vendorCode前缀码必须为 4 位大写字母',
    '第 7 行：最低售价必须为大于 0 的有限数字',
    '第 8 行：尺寸须为长*宽*高/重量，四项均须为大于 0 的有限数字',
  ]);
  c.setBossDefaults(parsed.items);
  assert.throws(() => c.parseBossDefaultsWorkbook(priceWorkbook({
    Sheet1: [priceHeader, ['非法售价', '7*8*10/0.34', 0, 'ABCD']],
  })), error => /没有有效条目/.test(error.message) && /第 2 行.*最低售价/.test(error.warnings[0]));
  assert.equal(c.getBossDefaults('ABCD').minPrice, 10);
});

function mockBackground({ getCookies, openTab, fetch: mockFetch }) {
  let listener;
  vm.runInNewContext(read('src-ext/background.js'), {
    URL, AbortController, setTimeout, clearTimeout, btoa, fetch: mockFetch,
    chrome: {
      runtime: { getManifest: () => manifest, onMessage: { addListener: fn => { listener = fn; } } },
      cookies: { getAll: getCookies },
      tabs: { create: openTab },
    },
  });
  return message => new Promise(resolve => {
    const handled = listener(clone(message), {}, response => resolve(clone(response)));
    if (!handled) resolve(undefined);
  });
}

test('后台按域名优先级选择非空 BCS Cookie，并打开固定的登录页', async () => {
  let cookies = [
    { name: 'Admin-Token', domain: 'other.bcserp.com', value: 'OTHER' },
    { name: 'Admin-Token', domain: '.bcserp.com', value: 'ROOT' },
    { name: 'Admin-Token', domain: 'wb.bcserp.com', value: 'WB' },
    { name: 'Limit-Key', domain: 'wb.bcserp.com', value: ' ' },
    { name: 'Limit-Key', domain: '.bcserp.com', value: 'LK' },
  ];
  const tabs = [];
  const send = mockBackground({
    getCookies: async filter => { assert.deepEqual(clone(filter), { domain: 'bcserp.com' }); return cookies; },
    openTab: async tab => { tabs.push(clone(tab)); },
  });
  assert.deepEqual(await send({ type: 'EXT_GET_BCS_AUTH' }), { token: 'WB', limitKey: 'LK' });
  cookies = cookies.slice(0, 2);
  assert.deepEqual(await send({ type: 'EXT_GET_BCS_AUTH' }), { token: 'ROOT', limitKey: '' });
  cookies.push({ name: 'Admin-Token', domain: '.wb.bcserp.com', value: 'WB-DOMAIN' });
  assert.deepEqual(await send({ type: 'EXT_GET_BCS_AUTH' }), { token: 'WB-DOMAIN', limitKey: '' });
  cookies = [];
  assert.deepEqual(await send({ type: 'EXT_GET_BCS_AUTH' }), { token: '', limitKey: '' });
  assert.deepEqual(await send({ type: 'EXT_OPEN_BCS_LOGIN', url: 'https://example.invalid/' }), { ok: true });
  assert.deepEqual(tabs, [{ url: 'https://wb.bcserp.com/productList' }]);
  assert.equal(await send({ type: 'UNKNOWN' }), undefined);
});

test('扩展存储只预载一次，并应用来自其他标签页的更新与删除', async () => {
  let applyChanges, finishRead;
  let reads = 0;
  const writes = [];
  const snapshot = new Promise(resolve => { finishRead = resolve; });
  const c = context(['src-ext/shim.js', 'src/30-config.js'], {
    chrome: { storage: {
      local: {
        get: key => { assert.equal(key, null); reads++; return snapshot; },
        set: async data => { writes.push(clone(data)); },
      },
      onChanged: { addListener: fn => { applyChanges = fn; } },
    } },
  });
  const ready = Promise.all([c.extStorageReady(), c.extStorageReady()]);
  const key = 'bcs_batch_v131_settings';
  applyChanges({ [key]: { newValue: '{"prefixCode":"QBBB"}' } }, 'local');
  finishRead({
    [key]: '{"prefixCode":"QAAA"}',
    bcs_batch_v131_pending: '[{"nmId":12345}]',
  });
  await ready;
  assert.equal(reads, 1);
  assert.equal(c.loadConfig().prefixCode, 'QBBB');
  assert.equal(c.loadPending()[0].nmId, 12345);
  applyChanges({ [key]: { newValue: '{"prefixCode":"QCCC"}' } }, 'sync');
  assert.equal(c.loadConfig().prefixCode, 'QBBB');
  applyChanges({ [key]: {} }, 'local');
  assert.equal(c.loadConfig().prefixCode, '');
  c.saveConfig({ prefixCode: 'QCCC' });
  assert.equal(c.loadConfig().prefixCode, 'QCCC');
  assert.deepEqual(writes, [{ [key]: '{"prefixCode":"QCCC"}' }]);
});

test('启动加载价格表，跨标签页刷新设置与待上架列表，写入失败保留当前价格表', async () => {
  let applyChanges, start, rejectWrite;
  const key = 'bcs_boss_defaults_v1';
  const previous = { fileName: '原价格表.xlsx', updatedAt: 1, count: 1, items: {
    QAAA: { sku: '', name: '商品 A', minPrice: 10, length: 7, width: 8, height: 10, weight: 0.34 },
  } };
  const replacement = { fileName: '新价格表.xlsx', updatedAt: 2, count: 1, items: {
    QBBB: { sku: '', name: '商品 B', minPrice: 20, length: 20, width: 25, height: 8, weight: 6.5 },
  } };
  const rendered = [];
  const writes = [];
  const c = context(['src-ext/shim.js', 'src/26-boss-defaults.js', 'src/30-config.js'], {
    chrome: { storage: {
      local: {
        get: async () => ({ [key]: previous }),
        set: async data => {
          if (rejectWrite) throw new Error('存储空间不足');
          writes.push(clone(data));
        },
      },
      onChanged: { addListener: fn => { applyChanges = fn; } },
    } },
    document: { readyState: 'loading', addEventListener: (_, listener) => { start = listener; } },
    window: { addEventListener() {} },
    setTimeout() {}, setInterval() {}, loadListedCache: () => false,
    panelEl: null,
    injectToolbar: () => assert.equal(c.getBossDefaults('QAAA').minPrice, 10),
    renderPriceSettings: () => rendered.push('settings'),
    renderPendingList: () => rendered.push('list'),
  });
  c.evaluate('(function () {\n' + read('src/90-main.js'));
  await start();
  assert.equal(c.evaluate('bossDefaultsFile.fileName'), previous.fileName);

  c.panelEl = {};
  applyChanges({ [key]: { newValue: replacement } }, 'local');
  assert.equal(c.getBossDefaults('QAAA'), null);
  assert.equal(c.getBossDefaults('QBBB').weight, 6.5);
  assert.deepEqual(rendered, ['settings', 'list']);

  const parsed = { entries: [{ code: 'QAAA' }], items: previous.items };
  rejectWrite = true;
  await assert.rejects(c.saveBossDefaults(previous.fileName, parsed), /存储空间不足/);
  assert.equal(c.loadBossDefaults(), false);
  assert.equal(c.evaluate('bossDefaultsFile.fileName'), replacement.fileName);
  assert.equal(c.getBossDefaults('QBBB').minPrice, 20);

  rejectWrite = false;
  await c.saveBossDefaults(previous.fileName, parsed);
  const saved = writes[0][key];
  assert.ok(saved.updatedAt > replacement.updatedAt);
  assert.deepEqual(saved, { ...previous, updatedAt: saved.updatedAt });
  assert.equal(c.loadBossDefaults(), true);
  assert.equal(c.getBossDefaults('QAAA').minPrice, 10);
});

test('跨店同步等待存储就绪并跟随卖家后台 SPA 路由', async () => {
  let finishLoad, tick;
  const ready = new Promise(resolve => { finishLoad = resolve; });
  const location = { pathname: '/dashboard' };
  const elements = new Set();
  const c = context([], {
    location, BAR_ID: 'bar', PANEL_ID: 'probe', PANEL_SYNC: 'sync',
    document: { readyState: 'complete', getElementById: id => (
      elements.has(id) ? { remove: () => elements.delete(id) } : null
    ) },
    extStorageReady: () => ready,
    loadConfig: () => ({ prefixCode: 'QAAA' }),
    injectSyncBar: () => elements.add('bar'),
    pollSelection() {},
    setInterval: fn => { tick = fn; },
  });
  c.evaluate('(function () { let userConfig;\n' + read('src-sync/40-main.js'));
  assert.equal(tick, undefined);
  finishLoad();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.size, 0);
  location.pathname = '/card-main/list';
  tick();
  assert.ok(elements.has('bar'));
  elements.add('probe').add('sync');
  location.pathname = '/dashboard';
  tick();
  assert.equal(elements.size, 0);
});

test('扩展请求适配 HTTP 状态、二进制图片、超时及网络错误', async () => {
  const calls = [];
  const sendMessage = mockBackground({
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/timeout')) {
        return new Promise((_, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
        });
      }
      if (url.endsWith('/error')) throw new Error('网络错误');
      if (url.endsWith('.webp')) return new Response(Uint8Array.of(0, 127, 255));
      return new Response('{"code":401}', { status: 401 });
    },
  });
  const c = context(['src-ext/shim.js'], {
    atob, chrome: { runtime: { sendMessage }, storage: { onChanged: { addListener() {} } } },
  });
  const request = options => new Promise((resolve, reject) => {
    c.GM_xmlhttpRequest({ method: 'GET', onload: resolve, onerror: e => reject(new Error(e.error)),
      ontimeout: () => reject(new Error('超时')), ...options });
  });
  const result = await request({
    url: 'https://wb.bcserp.com/test', method: 'POST', headers: { 'Content-Type': 'application/json' }, data: '{}',
  });
  assert.deepEqual(clone(result), { ok: false, status: 401, responseText: '{"code":401}' });
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body, '{}');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  const photo = await request({ url: 'https://basket-01.wbbasket.ru/1.webp', responseType: 'arraybuffer', anonymous: false });
  assert.deepEqual([...new Uint8Array(photo.response)], [0, 127, 255]);
  assert.equal(calls[1].options.credentials, 'include');
  await assert.rejects(request({ url: 'https://wb.bcserp.com/timeout', timeout: 1 }), /超时/);
  assert.equal(calls[2].options.signal.aborted, true);
  await assert.rejects(request({ url: 'https://wb.bcserp.com/error' }), /网络错误/);
  await assert.rejects(request({ url: 'https://wb.bcserp.com.example.invalid/' }), /授权范围/);
  assert.equal(calls.length, 4);
});

test('描述清洗保留其他卡字段，并去除 HTML、指定字符与标点墙', () => {
  const c = shelver();
  assert.equal(c.cleanWbCardDescription('Текст./ & 1.\n' + '!'.repeat(50)), 'Текст  1');
  assert.equal(c.cleanWbCardDescription('x'.repeat(5000)).length, 2000);
  assert.equal(c.cleanWbCardDescription('<b>Текст</b> ./ &'), 'Текст');
  const card = { description: 'x./&', markdown_description: 'y./&', colors: [1, 2], data: { a: 1 } };
  const cleaned = c.withCleanWbCardDescription(card);
  assert.equal(cleaned.description, 'x'); assert.equal(cleaned.markdown_description, 'y');
  assert.equal(cleaned.colors, card.colors); assert.equal(cleaned.data, card.data);
  assert.equal(card.description, 'x./&');
});

test('不同倍数组独立价格、同一货号、库存 0、字母尺码、清品牌/源条码、旧缓存提交时清洗', async () => {
  const requests = [];
  const c = shelver({ bcsApiCall: async (_, options) => { requests.push(clone(options.data)); return { code: 200 }; } });
  let done;
  await c.batchShelve([item()], info => { if (info.done) done = info; });
  assert.equal(requests.length, 2); assert.equal(done.ok, 1);
  assert.deepEqual(requests.map(r => JSON.parse(r.shopDatas[0].wbDetail).sizes[0].price), ['100.00', '500.00']);
  assert.deepEqual(requests.map(r => JSON.parse(r.shop)[0].warehouseQuantity), [0, 7]);
  for (const request of requests) {
    const row = request.shopDatas[0], detail = JSON.parse(row.wbDetail);
    assert.equal(row.nmId, null); assert.equal(row.sourceSku, '12345');
    assert.equal(row.offerUrl, 'https://www.wildberries.ru/catalog/12345/detail.aspx');
    assert.equal(request.offerUrl, row.offerUrl);
    assert.ok(!('mergeCode' in row) && !('mergeStatus' in row));
    assert.equal(row.vendorCode, 'BCS-QAAA-12345'); assert.equal(row.brand, ''); assert.equal(detail.brand, '');
    assert.equal(row.video, ''); assert.equal(row.videos, '');
    assert.deepEqual(detail.sizes.map(s => s.origName), ['S', 'M']);
    assert.ok(detail.sizes.every(s => !('skus' in s) && !('barcode' in s)));
    assert.equal(JSON.parse(row.wbCardInfo).description.length, 2000);
    assert.equal(request.removeBrandText, false);
  }
});

test('描述清洗和图片边界分片符合商品请求格式', () => {
  const c = shelver();
  for (const [text, expected] of [
    ['', ''], [null, ''], ['Название: 1. Текст./ &', 'Название: 1. Текст'],
    ['x'.repeat(4000), 'x'.repeat(2000)], ['Текст\n' + '*'.repeat(50), 'Текст'],
    ['Текст' + '!'.repeat(39) + ' ', 'Текст' + '!'.repeat(39)],
    ['Вся информация предоставлена продавцом\nТекст', 'Текст'],
  ]) {
    assert.equal(c.cleanWbCardDescription(text), expected);
  }
  const limits = [
    143, 287, 431, 719, 1007, 1061, 1115, 1169, 1313, 1601, 1655, 1919, 2045,
    2189, 2405, 2621, 2837, 3053, 3269, 3485, 3701, 3917, 4133, 4349, 4565, 4877,
    5189, 5501, 5813, 6125, 6437, 6749, 7061, 7373, 7685, 7997, 8309, 8741, 9173,
    9605, 10373, 11141, 11909, 12677, 13445, 14213, 14981, 15749, 16517, 17285,
    18053, 18821, 19589, 20357, 21125, 21893, 22661, 23429, 24197, 24965, 25733,
    26501, 27269, 28037, 28805,
  ];
  limits.forEach((limit, index) => {
    for (const [vol, shard] of [[limit, index + 1], [limit + 1, Math.min(index + 2, 65)]]) {
      const nm = vol * 100000;
      const basket = String(shard).padStart(2, '0');
      const base = `https://basket-${basket}.wbbasket.ru/vol${vol}/part${vol * 100}/${nm}`;
      assert.equal(c.getCardJsonUrl(nm), base + '/info/ru/card.json');
      assert.equal(c.getMainImageUrl(nm), base + '/images/big/1.webp');
    }
  });
  assert.equal(c.getMainImageUrl(9999999999),
    'https://basket-65.wbbasket.ru/vol99999/part9999999/9999999999/images/big/1.webp');
});

test('详情请求使用页面同源的 window.fetch，保留请求参数和 Cookie', async () => {
  const calls = [];
  const c = shelver({ window: { fetch: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ products: [{ id: 12345 }] }) };
  } } });
  const expected = '/__internal/u-card/cards/v4/detail?appType=1&curr=rub&dest=-1257786&spp=30&hide_vflags=4294967296&hide_dtype=15&mtype=257&lang=ru&ab_testing=false&nm=12345';
  assert.equal(c.buildWbDetailUrl(12345), 'https://www.wildberries.ru' + expected);
  assert.equal((await c.fetchWbDetailOne(12345)).id, 12345);
  assert.equal(calls[0].url, expected);
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.headers['x-requested-with'], 'XMLHttpRequest');
});

test('商品视频路径覆盖 144 个分片余数及无视频卡片', () => {
  const c = shelver();
  const card = { media: { has_video: true } };
  for (let vol = 0; vol < 144; vol++) {
    const nm = 1334124720 + vol;
    const basket = String(1 + (vol - vol % 12) / 12).padStart(2, '0');
    assert.equal(c.getWbProductVideoUrl(nm, card),
      `https://videonme-basket-${basket}.wbbasket.ru/vol${vol}/part133412/${nm}/mp4/360p/1.mp4`);
  }
  assert.equal(c.getWbProductVideoUrl(1334124858, { media: { hasVideo: true } }),
    'https://videonme-basket-12.wbbasket.ru/vol138/part133412/1334124858/mp4/360p/1.mp4');
  assert.equal(c.getWbProductVideoUrl(1334124858, { media: { has_video: false } }), '');
  assert.equal(c.getWbProductVideoUrl(1334124858, { media: { photo_count: 12 } }), '');
  assert.equal(c.getWbProductVideoUrl('invalid', card), '');
});

test('提交中更新价格表与界面配置不影响后续倍数组的品牌、尺寸、店铺和价格', async () => {
  const requests = [];
  let c;
  c = shelver({ bcsApiCall: async (_, options) => {
    requests.push(clone(options.data));
    c.evaluate("userConfig.prefixCode = 'QBBB'; userConfig.settings.carryBrand = true; userConfig.shopConfigs[2].priceMultiplier = 1;");
    c.setBossDefaults({});
    return { code: 200 };
  } });
  await c.batchShelve([item()]);
  assert.deepEqual(requests.map(r => JSON.parse(r.shopDatas[0].wbDetail).sizes[0].price), ['100.00', '500.00']);
  assert.ok(requests.every(r => r.brandStatus === false && r.shopDatas[0].packagLength === 16));
});

test('多色截断/部分成功/按店铺跳过；只有全部组成功才标记已上架', async () => {
  const c = shelver({ bcsApiCall: async () => ({ code: 500, msg: 'failed' }) });
  const colored = item(); colored.colors = [12345, 54321];
  assert.equal(c.prepareShelveItem(colored, config()).baseDetail.sizes.length, 1);
  let count = 0, done;
  c.bcsApiCall = async () => (++count === 1 ? { code: 200 } : { code: 500, msg: 'failed' });
  await c.batchShelve([item()], info => { if (info.done) done = info; });
  assert.equal(done.partial, 1); assert.equal(c.listedNmIdSet.size, 0);
  const skip = new Map([['12345', new Set(['1'])]]);
  c.bcsApiCall = async (_, options) => { assert.equal(JSON.parse(options.data.shop)[0].id, 2); return { code: 200 }; };
  await c.batchShelve([item()], info => { if (info.done) done = info; }, { skipByNm: skip });
  assert.equal(done.ok, 1);
});

test('数据校验阻止未抓取/无规格/前缀串价/未知仓库/非法库存', () => {
  const c = shelver();
  const bad = item(); bad.fetched = undefined;
  assert.throws(() => c.prepareShelveItem(bad, config()), /抓取/);
  bad.fetched = true; bad.wbDetail.sizes = [];
  assert.throws(() => c.prepareShelveItem(bad, config()), /规格/);
  const wrong = item(); wrong.vendorCode = 'BCS-QBBB-12345-20';
  assert.throws(() => c.prepareShelveItem(wrong, config()), /不一致/);
  const cfg = config(); cfg.shopConfigs[1].warehouseId = 99;
  assert.throws(() => c.validateShelveShop(shops()[0], cfg), /仓库/);
  for (const qty of [-1, 1.2, 'bad', Infinity]) assert.throws(() => c.normalizeWarehouseQuantity(qty), /库存/);
  assert.equal(c.normalizeWarehouseQuantity(0), 0); assert.equal(c.normalizeWarehouseQuantity(''), 999);
});

test('查重含全部分页、编码逗号、按店铺标记；业务/网络错误阻止提交', async () => {
  const urls = [], c = shelver();
  c.bcsApiCall = async url => {
    urls.push(url);
    return url.includes('pageNum=1&')
      ? { code: 200, rows: Array.from({ length: 100 }, () => ({ vendorCode: 'other' })), total: 101 }
      : { code: 200, rows: [{ vendorCode: item().vendorCode }], total: 101 };
  };
  const other = { ...item(), nmId: '12346', vendorCode: 'BCS-QAAA-12346' };
  const result = await c.checkDuplicatedItems([item(), other], [shops()[0]]);
  assert.equal(urls.length, 2); assert.ok(urls[0].includes('%2C'));
  assert.equal(result.dupes.length, 1); assert.equal(result.dupes[0].shopId, 1);
  c.bcsApiCall = async () => ({ code: 500, msg: 'failed' });
  await assert.rejects(c.checkDuplicatedItems([item()], shops()), /本批未提交/);
  c.bcsApiCall = async () => { throw new Error('network'); };
  await assert.rejects(c.checkDuplicatedItems([item()], shops()), /本批未提交/);
  await assert.rejects(c.checkDuplicatedItems([item(), { ...item(), nmId: '999' }], shops()), /共用/);
});

test('一键上架准备遇到查重错误时没有 POST，按钮恢复，错误可见', async () => {
  let posts = 0;
  const alerts = [];
  const c = shelver({ alert: message => alerts.push(message), bcsApiCall: async (_, options) => {
    if (options?.method === 'POST') posts++;
    throw new Error('offline');
  } });
  await c.onStartBatch();
  assert.equal(posts, 0); assert.ok(alerts.some(message => message.includes('本批未提交')));
  assert.equal(c.evaluate('batchPreparing'), false);
});

test('查重期间更换价格表时停止提交并提示重新开始', async () => {
  let posts = 0;
  const alerts = [];
  const c = shelver({ alert: message => alerts.push(message), bcsApiCall: async (_, options) => {
    if (options?.method === 'POST') posts++;
    else c.setBossDefaults({});
    return { code: 200, rows: [], total: 0 };
  } });
  await c.onStartBatch();
  assert.equal(posts, 0);
  assert.deepEqual(alerts, ['准备期间价格表已更新，请重新开始上架']);
});

test('一键上架从查重到确认/提交均使用开始时的配置和商品快照', async () => {
  const posts = [];
  let c;
  c = shelver({ bcsApiCall: async (_, options) => {
    if (options?.method === 'POST') { posts.push(clone(options.data)); return { code: 200 }; }
    c.evaluate("userConfig.prefixCode = 'QBBB'; userConfig.settings.carryBrand = true; pendingList[0].title = 'changed'; pendingList[0].wbDetail.name = 'changed';");
    return { code: 200, rows: [], total: 0 };
  } });
  await c.onStartBatch();
  assert.equal(posts.length, 2);
  assert.deepEqual(posts.map(r => JSON.parse(r.shopDatas[0].wbDetail).sizes[0].price), ['100.00', '500.00']);
  assert.ok(posts.every(r => r.shopDatas[0].name === 'Товар' && r.brandStatus === false));
});

function authContext(replies, getCookies = async () => [{ name: 'Admin-Token', domain: 'wb.bcserp.com', value: 'DUMMY' }], extra = {}) {
  const requests = [];
  const c = context(['src/40-api-bcs.js'], {
    chrome: { runtime: { sendMessage: mockBackground({ getCookies }) } },
    GM_xmlhttpRequest: request => { requests.push(request); const next = replies.shift();
      queueMicrotask(() => typeof next === 'function' ? next(request) : request.onload({ status: 200, responseText: JSON.stringify(next) })); },
    ...extra,
  });
  c.requests = requests;
  return c;
}

test('BCS Cookie 认证规范化 Bearer，并发读取共用 5 分钟内存缓存', async () => {
  let reads = 0, now = 1000;
  const c = authContext([], async () => {
    if (++reads > 1) return [];
    return [{ name: 'Admin-Token', domain: '.bcserp.com', value: ' Bearer DUMMY ' },
      { name: 'Limit-Key', domain: '.bcserp.com', value: 'LK' }];
  }, { Date: class extends Date { static now() { return now; } } });
  const headers = await Promise.all([c.getAuthHeaders(), c.getAuthHeaders()]);
  assert.equal(reads, 1);
  assert.strictEqual(headers[0], headers[1]);
  assert.equal(headers[0].Authorization, 'Bearer DUMMY');
  assert.equal(headers[0]['X-Limit-Key'], 'LK');
  now += 5 * 60 * 1000 - 1;
  assert.strictEqual(await c.getAuthHeaders(), headers[0]);
  now++;
  await assert.rejects(c.getAuthHeaders(), {
    message: '未检测到 BCS 登录状态，请先打开 https://wb.bcserp.com/productList 登录后重试',
  });
  assert.equal(reads, 2);
  assert.equal(c.storage.size, 0);
});

test('HTTP 401 时重读 Cookie，独立统计 401 与 429 重试次数', async () => {
  let reads = 0;
  const c = authContext([r => r.onload({ status: 401, responseText: '' }), { code: 429 }, { code: 429 }, { code: 200 }],
    async () => [{ name: 'Admin-Token', domain: 'wb.bcserp.com', value: 'DUMMY' + (++reads) }]);
  const result = await c.bcsApiCall('/test');
  assert.equal(result.code, 200);
  assert.equal(reads, 2);
  assert.deepEqual(c.requests.map(r => r.headers.Authorization), ['Bearer DUMMY1', 'Bearer DUMMY2', 'Bearer DUMMY2', 'Bearer DUMMY2']);
});

test('业务 code 401 重读后仍失败时只重试一次，清凭证并提示重新登录', async () => {
  let reads = 0;
  const expired = authContext([{ code: 401 }, { code: 401 }],
    async () => [{ name: 'Admin-Token', domain: 'wb.bcserp.com', value: 'DUMMY' + (++reads) }]);
  await assert.rejects(expired.bcsApiCall('/test'), {
    message: 'BCS 登录已过期，请前往 https://wb.bcserp.com/productList 重新登录',
  });
  assert.equal(reads, 2);
  assert.deepEqual(expired.requests.map(r => r.headers.Authorization), ['Bearer DUMMY1', 'Bearer DUMMY2']);
  assert.equal((await expired.getAuthHeaders()).Authorization, 'Bearer DUMMY3');
});

test('POST 超时/断网/5xx/无效响应结果未知且不重发；非 2xx 不当作成功', async () => {
  for (const reply of [r => r.ontimeout(), r => r.onerror(), r => r.onload({ status: 500, responseText: '{}' }),
    r => r.onload({ status: 200, responseText: '<html>' }), {}]) {
    const c = authContext([reply]);
    await assert.rejects(c.bcsApiCall('/test', { method: 'POST', data: {} }), error => error.uncertain && /未确认/.test(error.message));
    assert.equal(c.requests.length, 1);
  }
  const c = authContext([r => r.onload({ status: 302, responseText: '{"code":200}' })]);
  await assert.rejects(c.bcsApiCall('/test'), /HTTP 302/);
});

test('不同类型 nmId 不重复添加', () => {
  const c = shelver();
  assert.equal(c.addToList([{ nmId: 12345 }]).added, 0);
});

test('直上路径和请求根参数保留模板字段', async () => {
  let actual;
  const c = shelver({ bcsApiCall: async (url, options) => {
    assert.equal(url, '/system/wbCollection/wb/new');
    assert.equal(options.method, 'POST');
    actual = options.data;
    return { code: 200 };
  } });
  await c.batchShelve([item()]);
  const { shop, shopDatas, ...fields } = clone(actual);
  assert.equal(JSON.parse(shop)[0].id, 2);
  assert.equal(shopDatas[0].vendorCode, 'BCS-QAAA-12345');
  assert.equal(JSON.parse(shopDatas[0].wbDetail).sizes[0].price, '500.00');
  assert.deepEqual(fields, {
    offerDIY: '', brandStatus: false, oModel: true, status: '1', collectionType: '0',
    offerUrl: 'https://www.wildberries.ru/catalog/12345/detail.aspx',
    mode: 1, mergeCards: 1, carryBrand: 1, customBrand: null, titleSuffix: null,
    vendorCodePrefix: null, aiRewrite: false, aiRetouch: false, aiRetouchTemplateId: null,
    imgUploadMode: 0, removeBrandText: false,
  });
});

test('直上与修改均携带商品图片和视频', async () => {
  const requests = [];
  const c = shelver({ bcsApiCall: async (url, options) => {
    requests.push({ url, method: options.method, data: clone(options.data) });
    return { code: 200 };
  } });
  const product = { ...item(), nmId: '1334124858', vendorCode: 'BCS-QCCC-1334124858', colors: [1334124858] };
  product.wbCardInfo.media = { photo_count: 12, has_video: true };
  product.wbCardInfo.description = 'x'.repeat(1999) + ' z';
  product.imagesList = c.generateImageUrls(product.nmId, product.wbCardInfo.media.photo_count);
  product.mainImage = product.imagesList[0];
  const video = 'https://videonme-basket-12.wbbasket.ru/vol138/part133412/1334124858/mp4/360p/1.mp4';
  product.wbCardInfo.grouped_options = [
    { group_name: 'Характеристики', options: [{ id: 100, name: 'Цвет', value: 'белый' }] },
    { group_name: 'Габариты', options: [{ id: 101, name: 'Вес', value: '500' }] },
  ];
  const cfg = config();
  cfg.prefixCode = 'QCCC';
  await c.batchShelve([product], undefined, { config: cfg });
  const direct = requests.splice(0);
  c.listedNmIdSet.clear();
  cfg.settings.directUpload = false;
  let done;
  await c.batchShelve([product], info => { if (info.done) done = info; }, { config: cfg });
  assert.equal(requests.length, 2);
  assert.equal(done.ok, 1);
  assert.equal(c.listedNmIdSet.size, 0);
  assert.deepEqual(requests.map(r => r.data.prices), ['85', '424']);
  assert.deepEqual(requests.map(r => JSON.parse(r.data.shop)[0].warehouseQuantity), [0, 7]);
  for (const [i, { url, method, data }] of requests.entries()) {
    assert.equal(url, '/system/collectBox');
    assert.equal(method, 'POST');
    const original = direct[i].data;
    const [row] = original.shopDatas;
    assert.equal(row.video, video);
    assert.equal(row.videos, video);
    assert.equal(row.images.split(';').length, 12);
    assert.equal(data.videos, video);
    const [variant] = JSON.parse(data.variant);
    assert.equal(variant.videos, video);
    assert.equal(data.images, row.images);
    assert.equal(data.offerUrl, row.offerUrl);
    assert.equal(data.shop, original.shop);
    assert.equal(data.mode, 0);
    assert.equal(data.collectType, '0');
    assert.deepEqual(variant.sizes, JSON.parse(data.sizes));
    assert.deepEqual(variant.chars, JSON.parse(data.chars));
    assert.deepEqual(JSON.parse(data.scopeConfig), { fieldScope: { name: 'variant', description: 'common' }, charScope: {} });
  }
});

test('一键修改按查重结果保存草稿，部分成功与结果未确认时提示检查采集箱', async () => {
  const requests = [], alerts = [];
  const c = shelver({
    alert: message => alerts.push(message),
    bcsApiCall: async (url, options) => {
      if (options?.method !== 'POST') {
        return { code: 200, rows: url.includes('shopId=1&') ? [{ vendorCode: item().vendorCode }] : [] };
      }
      requests.push({ url, data: clone(options.data) });
      if (requests.length === 2) throw Object.assign(new Error('timeout'), { uncertain: true });
      return { code: 200 };
    },
  });
  c.inputConfig.settings.directUpload = false;
  c.inputItem2 = { ...item(), nmId: '12346', vendorCode: 'BCS-QAAA-12346' };
  c.evaluate('pendingList.push(inputItem2);');
  await c.onStartBatch();
  assert.equal(requests.length, 3);
  assert.ok(requests.every(r => r.url === '/system/collectBox'));
  assert.deepEqual(requests.map(r => JSON.parse(r.data.shop)[0].id), [2, 1, 2]);
  assert.equal(c.listedNmIdSet.size, 0);
  assert.match(alerts.at(-1), /批量存入采集箱完成：成功 1 个商品，部分成功 1 个/);
  assert.match(alerts.at(-1), /提交结果未确认，重试前请先检查采集箱/);
});

for (const directUpload of [true, false]) {
  test(`${directUpload ? '直上' : '采集箱'}合并同款颜色，按店铺查重与价格倍数保留可提交的商品`, async () => {
    const submitted = [], confirmations = [];
    const cfg = config();
    cfg.settings = { ...cfg.settings, directUpload, noMerge: false };
    cfg.shopConfigs[2].priceMultiplier = 2;
    cfg.shopConfigs[3] = { warehouseId: 33, quantity: 8, priceMultiplier: 10 };
    cfg.shopConfigs[4] = { warehouseId: 44, quantity: 9, priceMultiplier: 2 };
    cfg.selectedShopIds.push(3, 4);
    const first = { ...item(), colors: [12345, 12346] };
    const second = { ...item(), nmId: '12346', colors: [12345, 12346], vendorCode: 'BCS-QAAA-12346' };
    const unrelated = { ...item(), nmId: '12347', vendorCode: 'BCS-QAAA-12347' };
    unrelated.wbCardInfo.imt_id = 99;
    const c = shelver({
      shopsCache: [...shops(), { id: 3, shopName: 'C', warehouses: [{ id: 33, name: 'Москва' }] },
        { id: 4, shopName: 'D', warehouses: [{ id: 44, name: 'Москва' }] }],
      confirm: message => { confirmations.push(message); return true; },
      bcsApiCall: async (url, options) => {
        if (options?.method !== 'POST') {
          const duplicate = url.includes('shopId=1&') ? second : url.includes('shopId=4&') ? first : null;
          return { code: 200, rows: duplicate ? [{ vendorCode: duplicate.vendorCode }] : [] };
        }
        const body = clone(options.data);
        const rows = directUpload ? body.shopDatas : JSON.parse(body.variant);
        const shopIds = JSON.parse(body.shop).map(shop => shop.id);
        submitted.push({ url, body, rows, shopIds });
        return shopIds.join() === '2' ? { code: 500, msg: 'failed' } : { code: 200 };
      },
    });
    c.inputs = [first, second, unrelated];
    c.cfg = cfg;
    c.evaluate('pendingList = inputs; userConfig = cfg;');
    await c.onStartBatch();
    assert.match(confirmations.at(-1), /计划提交 6 次请求/);
    assert.deepEqual(submitted.map(r => [r.shopIds, r.rows.map(row => row.sourceSku)]), [
      [[1], ['12345']], [[2], ['12345', '12346']], [[4], ['12346']], [[3], ['12345', '12346']],
      [[1, 2, 4], ['12347']], [[3], ['12347']],
    ]);
    for (const { url, body, rows, shopIds } of submitted) {
      assert.equal(url, directUpload ? '/system/wbCollection/wb/new' : '/system/collectBox');
      assert.equal(body.mergeCards, 0);
      const parentNmId = rows[0].sourceSku === '12347' ? null : '12345';
      assert.equal(body.offerUrl, `https://www.wildberries.ru/catalog/${parentNmId || '12347'}/detail.aspx`);
      const [code, status] = directUpload ? [rows[0].mergeCode, rows[0].mergeStatus] : [body.mergeCode, body.mergeStatus];
      if (rows.length > 1) {
        assert.match(code, /^[A-Za-z0-9]{10}$/);
        assert.equal(status, '0');
      } else {
        assert.equal(code ?? null, null);
        assert.equal(status ?? null, null);
      }
      for (const row of rows) {
        assert.equal(row.nmId, null);
        const [size] = directUpload ? JSON.parse(row.wbDetail).sizes : row.sizes;
        const price = shopIds.includes(3) ? '500' : '100';
        assert.equal(size.price, directUpload ? price + '.00' : price);
        if (directUpload) {
          assert.equal(row.mergeCode, code);
          assert.equal(row.mergeStatus, status);
          assert.equal(row.parentNmId ?? null, parentNmId);
          assert.equal(row.offerUrl, body.offerUrl);
        }
      }
    }
    assert.deepEqual([...c.listedNmIdSet], directUpload ? ['12347'] : []);
  });
}

test('跨店补上架保留库存 0、源商品链接和视频，按设置清空品牌', () => {
  const c = context(['src/30-config.js', 'src/45-api-wb.js', 'src-sync/24-shelve-new.js'], {
    photoUrls: card => card.photos.map(p => p.big), dimsOf: card => card.dimensions,
  });
  c.evaluate('userConfig = loadConfig()');
  const srcCard = { nmID: 12345, title: 'Товар', subjectID: 1, brand: 'SOURCE BRAND',
    photos: [{ big: 'https://example.invalid/photo.webp' }], dimensions: { length: 14, width: 7, height: 3, weightBrutto: 0.12 } };
  const opts = { srcCard, cardInfo: item().wbCardInfo, shopId: 1, warehouseId: 11,
    price: 80, quantity: 0, vendorCode: item().vendorCode };
  const body = c.buildShelveBody(opts);
  assert.equal(JSON.parse(body.shop)[0].warehouseQuantity, 0);
  assert.equal(JSON.parse(body.shopDatas[0].wbDetail).brand, '');
  assert.equal(JSON.parse(body.shopDatas[0].wbCardInfo).description.length, 2000);
  assert.equal(body.removeBrandText, false);
  assert.equal(body.offerUrl, 'https://www.wildberries.ru/catalog/12345/detail.aspx');
  assert.equal(body.shopDatas[0].offerUrl, body.offerUrl);
  assert.equal(body.shopDatas[0].video, '');
  assert.equal(body.shopDatas[0].videos, '');
  opts.cardInfo.media.has_video = true;
  const video = 'https://videonme-basket-09.wbbasket.ru/vol105/part1/12345/mp4/360p/1.mp4';
  const [row] = c.buildShelveBody(opts).shopDatas;
  assert.equal(row.video, video);
  assert.equal(row.videos, video);
});

test('跨店补上架写前查重：已存在不提交、查重失败不提交；实时描述清洗后提交', async () => {
  const posts = [];
  const c = context(['src/30-config.js', 'src/45-api-wb.js', 'src-sync/24-shelve-new.js'], {
    photoUrls: card => card.photos.map(p => p.big), dimsOf: card => card.dimensions,
    normText: value => String(value || '').trim(), wbSleep: async () => {},
    wbFindCardByVc: async () => ({ ok: true, card: { nmID: 54321 } }),
  });
  c.evaluate('userConfig = loadConfig()');
  const source = { nmID: 12345, title: 'Товар', subjectID: 1, description: 'Новый./& ' + 'x'.repeat(2400),
    photos: [{ big: 'https://example.invalid/photo.webp' }], dimensions: { length: 14, width: 7, height: 3, weightBrutto: 0.12 } };
  const cfg = { vendorCode: item().vendorCode, price: 80, quantity: 0, warehouseId: 11 };
  c.fetchWbCardInfo = async () => clone(item().wbCardInfo);
  c.bcsApiCall = async () => ({ code: 200, rows: [{ vendorCode: cfg.vendorCode }] });
  let result = await c.shelveOne(source, shops()[0], cfg);
  assert.equal(result.ok, true); assert.equal(result.wrote.length, 0);
  assert.ok(result.notes.some(note => note.includes('未重复提交')));
  c.bcsApiCall = async () => ({ code: 500 });
  result = await c.shelveOne(source, shops()[0], cfg);
  assert.equal(result.ok, false); assert.match(result.err, /查询失败/);
  c.bcsApiCall = async (_, options) => {
    if (options?.method === 'POST') { posts.push(clone(options.data)); return { code: 200 }; }
    return { code: 200, rows: [] };
  };
  result = await c.shelveOne(source, shops()[0], cfg);
  assert.equal(result.ok, true); assert.equal(posts.length, 1);
  const description = JSON.parse(posts[0].shopDatas[0].wbCardInfo).description;
  assert.ok(description.startsWith('Новый ')); assert.equal(description.length, 2000);
  assert.equal(JSON.parse(posts[0].shop)[0].warehouseQuantity, 0);
});

test('跨店同步面板：取消同步不写入、仅勾选补上架也会查询并保留手填配置、切换字段即时重算差异', () => {
  const c = context(['src/30-config.js', 'src-sync/20-sync-diff.js', 'src-sync/32-ui-panel.js'], {
    SYNC_PREFIX: 'bcs-sync-',
  });
  const srcCard = { nmID: 1001, vendorCode: 'BCS-QAAA-1001', title: '新标题', description: '同描述',
    brand: '', characteristics: [], dimensions: { length: 10, width: 10, height: 5, weightBrutto: 0.5 },
    photos: [{ big: 'https://example.invalid/1.webp' }] };
  const tgtCard = { ...srcCard, nmID: 2001, title: '旧标题' };
  const shopB = { id: 2, shopName: 'B店', apiKey: 'k2' };
  const shopC = { id: 3, shopName: 'C店', apiKey: 'k3' };
  const plan = [{
    item: { nmId: '1001', vendorCode: 'BCS-QAAA-1001', title: '新标题' },
    source: srcCard,
    targets: [
      { shop: shopB, status: 'listed', nmId: 2001, _card: tgtCard, _photoInfo: { same: true, changed: [], countDiff: false },
        diff: c.diffCards(srcCard, tgtCard, ['title', 'description', 'photos'], { same: true, changed: [], countDiff: false }) },
      { shop: shopC, status: 'absent', nmId: null, diff: [], risk: [] },
    ],
  }];
  c.plan = plan;
  c.evaluate(`
    syncState.sourceId = 1;
    syncState.targetIds = new Set([2]);
    syncState.shelveShops = new Set([3]);
    syncState.defaultPrice = '88';
    syncState.plan = plan;
    syncState.shelveEdits.set('BCS-QAAA-1001|3', { vc: 'BCS-QAAA-1001-C', price: '99.5', qty: '0' });
  `);

  assert.deepEqual([...c.activeTargetShopIds()].sort((a, b) => a - b), [2, 3]);
  assert.equal(c.collectJobs(plan).length, 1);

  // 取消勾选 B 店「同步修改」后，即使未重新比对，也不得再收集 B 店写入任务
  c.evaluate('syncState.targetIds.delete(2)');
  assert.equal(c.collectJobs(plan).length, 0);

  // 重新勾选 B 店，但取消「标题」字段后即时重算差异，B 店变为无差异
  c.evaluate('syncState.targetIds.add(2); syncState.fields.title = false;');
  c.recomputePlanDiffs();
  assert.equal(c.collectJobs(plan).length, 0);

  // C 店仅勾选「缺品补上」，收集到保留的自定义货号、价格与库存 0
  const shelveJobs = c.collectShelveJobs(plan);
  assert.equal(shelveJobs.length, 1);
  assert.deepEqual(clone(shelveJobs[0].cfg), {
    vendorCode: 'BCS-QAAA-1001-C', price: '99.5', quantity: 0, warehouseId: 0,
  });
});
