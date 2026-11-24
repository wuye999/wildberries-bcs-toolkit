// node --test tests/shelve.test.js
// 所有接口均为内存模拟；不读取真实凭证、不发送 HTTP、不操作真实店铺。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { locateAuthBundle, makeBridge, MARKER } = require('../tools/patch_v151');
const root = path.resolve(__dirname, '..');
const pluginDir = 'WildberriesAl上品助手V1.5.8';
const hasOfficialPlugin = fs.existsSync(path.join(root, pluginDir));
const requiresPlugin = { skip: !hasOfficialPlugin && '需要本地 1.5.8 扩展副本' };
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const quiet = { info() {}, warn() {}, error() {}, errorDetail() {} };
const instant = callback => { queueMicrotask(callback); return 0; };
// 1.5.8 安装包只有编译产物。执行选中的纯函数，避开扩展初始化和 HTTP。
function officialWb(parts) {
  const official = vm.createContext({});
  const shared = 'pluginFocusReset.js';
  const ui = 'index.ts.js';
  const sections = {
    description: [
      [shared, 'const py=2e3;', 'const Cf='],
      [shared, 'const AT=[', 'function uv('],
    ],
    media: [
      [shared, 'let bg=[[143,"01"]', 'class mT'],
      [shared, 'function PT(', 'function Ow('],
    ],
    detail: [[shared, 'const Aw="-1257786";', 'function rT(']],
    template: [[ui, 'function Tc(', 'function R2(']],
    direct: [
      [ui, 'function Dc(', 'function OO('],
      [ui, 'function DO(', 'function CC('],
    ],
    collectBox: [
      [shared, 'function cL(', 'function wu('],
      [shared, 'function Cy(', 'function Wne('],
      [ui, 'function Hu(', 'function O5('],
    ],
  };
  for (const part of parts) {
    for (const [file, start, end] of sections[part]) {
      const bundle = read(pluginDir + '/' + file);
      const from = bundle.indexOf(start);
      assert.notEqual(from, -1, start);
      const to = bundle.indexOf(end, from + start.length);
      assert.notEqual(to, -1, end);
      vm.runInContext(bundle.slice(from, to), official, { filename: file });
    }
    if (part === 'description') vm.runInContext('const ff=py; const ms=ki;', official);
    if (part === 'collectBox') vm.runInContext('const Hb=cL; const Bx=Cy;', official);
  }
  return official;
}

function context(files, extra = {}) {
  const storage = new Map();
  const c = vm.createContext({
    console, log: quiet, setTimeout: instant, clearTimeout() {},
    GM_getValue: (key, fallback) => storage.get(key) ?? fallback,
    GM_setValue: (key, value) => storage.set(key, value),
    localStorage: { getItem: () => null }, IS_SELLER_HOST: false,
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
    BOSS_DEFAULTS: {
      QAAA: { sku: 'TEST-A', name: '测试商品 A', minPrice: 50, length: 16, width: 9, height: 4, weight: 0.2 },
      QBBB: { sku: 'TEST-B', name: '测试商品 B', minPrice: 60, length: 25, width: 9, height: 4, weight: 0.3 },
      QCCC: { sku: 'TEST-C', name: '测试商品 C', minPrice: 42.4, length: 20, width: 9, height: 4, weight: 0.3 },
    },
    shopsCache: shops(), listedNmIdSet: new Set(), listedDetailMap: new Map(), saveListedCache() {},
    bcsApiCall: async () => ({ code: 200, rows: [], total: 0 }), ...extra,
  });
  c.inputConfig = config(); c.inputItem = item();
  c.evaluate('userConfig = inputConfig; pendingList = [inputItem];');
  return c;
}

for (const [version, className, instance] of [['1.5.4', 'JE', 'Qe'], ['1.5.8', 'zx', 'Qe']]) {
  const dir = `WildberriesAl上品助手V${version}`;
  const skip = !fs.existsSync(path.join(root, dir)) && `需要本地 ${version} 扩展副本`;
  test(`${version} 桥接可精确还原原件且保留版本检查`, { skip }, () => {
    const found = locateAuthBundle(path.join(root, dir));
    assert.equal(path.basename(found.file), 'pluginFocusReset.js');
    assert.equal(found.className, className);
    assert.equal(found.instance, instance);
    assert.ok(found.code.includes(MARKER));
    assert.equal(found.code.replace(makeBridge(found.instance), ''), fs.readFileSync(found.file + '.bak', 'utf8'));
    assert.equal(JSON.parse(read(dir + '/manifest.json')).version, version);
    assert.ok(read(dir + '/index.ts.js').includes('checkNewVersionInfo?platformKey=wbAi'));
    const endpoints = read(dir + '/ozonMeasureIdbProtocol.js');
    assert.ok(endpoints.includes('BCS_WB_BASE_URL:"https://wb.bcserp.com/prod-api"'));
    assert.ok(endpoints.includes('WB_QUICK_SHELVE_NEW:"/system/wbCollection/wb/new"'));
    assert.ok(endpoints.includes('WB_COLLECT_BOX_SAVE:"/system/collectBox"'));
  });
}

test('桥接取得凭证、捕获错误、屏蔽非白名单/外部来源；重复导入只注册一次', async () => {
  let handler, listeners = 0;
  const replies = [];
  const w = { location: { hostname: 'www.wildberries.ru', origin: 'https://www.wildberries.ru' },
    addEventListener(type, callback) { handler = callback; listeners++; },
    postMessage(data) { replies.push(data); } };
  w.top = w;
  const c = vm.createContext({ window: w, service: { getToken: async () => 'DUMMY', getLimitKey: async () => { throw new Error('test error'); } } });
  vm.runInContext(makeBridge('service') + makeBridge('service'), c);
  assert.equal(listeners, 1);
  const send = data => handler({ source: w, origin: w.location.origin, data: { type: 'BCS_CALL', id: 'test', ...data } });
  await send({ method: 'getToken' }); assert.equal(replies.pop().result, 'DUMMY');
  await send({ method: 'getLimitKey' }); assert.equal(replies.pop().error, 'test error');
  await send({ method: 'constructor' }); assert.match(replies.pop().error, /method not found/);
  await send({ method: 'getToken', args: ['x'] }); assert.match(replies.pop().error, /invalid args/);
  await handler({ source: {}, origin: w.location.origin, data: { type: 'BCS_CALL', id: 'x', method: 'getToken' } });
  assert.equal(replies.length, 0);
  assert.doesNotThrow(() => vm.runInNewContext(makeBridge('service'), {})); // worker 无 window
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

test('描述清洗、详情 URL 和 65 个图片分片与官方 1.5.8 一致', requiresPlugin, () => {
  const c = shelver(), official = officialWb(['description', 'media', 'detail']);
  for (const text of ['', null, '<p>abc</p> <b>&amp; ./</b>', 'Название: 1. Текст./ &',
    'x'.repeat(4000), 'Текст\n' + '*'.repeat(50), 'Текст' + '!'.repeat(39) + ' ',
    'Вся информация предоставлена продавцом\nТекст']) {
    assert.equal(c.cleanWbCardDescription(text), official.vy(text));
  }
  const table = vm.runInContext('bg', official);
  assert.equal(table.length, 65);
  for (const [upper] of table) for (const nm of [upper * 100000, (upper + 1) * 100000]) {
    assert.equal(c.getCardJsonUrl(nm), official.dT(nm));
    assert.equal(c.getMainImageUrl(nm), official.ld(nm));
  }
  assert.equal(c.getMainImageUrl(9999999999), official.ld(9999999999));
  assert.equal(c.buildWbDetailUrl(12345), official.Ew(12345));
});

test('商品视频路径与官方 1.5.8 一致，覆盖 144 个分片余数及无视频卡片', requiresPlugin, () => {
  const c = shelver(), official = officialWb(['media']);
  const card = { media: { has_video: true } };
  for (let nmId = 1334124800; nmId < 1334124800 + 144; nmId++) {
    assert.equal(c.getWbProductVideoUrl(nmId, card), official.bb(nmId, card));
  }
  assert.equal(c.getWbProductVideoUrl(1334124858, { media: { hasVideo: true } }),
    'https://videonme-basket-12.wbbasket.ru/vol138/part133412/1334124858/mp4/360p/1.mp4');
  assert.equal(c.getWbProductVideoUrl(1334124858, { media: { has_video: false } }), '');
  assert.equal(c.getWbProductVideoUrl(1334124858, { media: { photo_count: 12 } }), '');
  assert.equal(c.getWbProductVideoUrl('invalid', card), '');
});

test('提交中更改界面配置不影响后续倍数组的品牌、尺寸、店铺和价格', async () => {
  const requests = [];
  let c;
  c = shelver({ bcsApiCall: async (_, options) => {
    requests.push(clone(options.data));
    c.evaluate("userConfig.prefixCode = 'QBBB'; userConfig.settings.carryBrand = true; userConfig.shopConfigs[2].priceMultiplier = 1;");
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

function authContext(replies, extra = {}) {
  const requests = [];
  const c = context(['src/30-config.js', 'src/40-api-bcs.js'], {
    IS_SELLER_HOST: true,
    GM_xmlhttpRequest: request => { requests.push(request); const next = replies.shift();
      queueMicrotask(() => typeof next === 'function' ? next(request) : request.onload({ status: 200, responseText: JSON.stringify(next) })); },
    ...extra,
  });
  c.requests = requests;
  c.storage.set('bcs_bcs_cred_cache', JSON.stringify({ token: 'Bearer DUMMY', limitKey: 'LK' }));
  return c;
}

test('认证规范化 Bearer/并发合并认证；插件明确退出登录时清缓存', async () => {
  let calls = 0;
  const c = authContext([], { IS_SELLER_HOST: false, callApi: async method => { calls++; return method === 'getToken' ? 'Bearer DUMMY' : 'LK'; } });
  const headers = await Promise.all([c.getAuthHeaders(), c.getAuthHeaders()]);
  assert.equal(calls, 2); assert.equal(headers[0].Authorization, 'Bearer DUMMY');
  c.evaluate('_tokenExpireAt = 0;'); c.callApi = async () => null;
  await assert.rejects(c.getAuthHeaders(), /未登录/);
  assert.equal(JSON.parse(c.storage.get('bcs_bcs_cred_cache')), '');
});

test('HTTP 200 + code401 刷新一次，最终失败清凭证；独立统计 401 与 429', async () => {
  let tokenCalls = 0;
  const c = authContext([{ code: 401 }, { code: 429 }, { code: 429 }, { code: 200 }], {
    IS_SELLER_HOST: false, callApi: async method => method === 'getToken' ? 'DUMMY' + (++tokenCalls) : 'LK',
  });
  const result = await c.bcsApiCall('/test');
  assert.equal(result.code, 200); assert.equal(c.requests.length, 4); assert.equal(tokenCalls, 2);
  const expired = authContext([{ code: 401 }, { code: 401 }], {
    IS_SELLER_HOST: false, callApi: async () => 'DUMMY',
  });
  await assert.rejects(expired.bcsApiCall('/test'), /认证失败/);
  assert.equal(JSON.parse(expired.storage.get('bcs_bcs_cred_cache')), '');
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

test('直上路径及根参数与官方 1.5.8 一致（包括模板字段）', requiresPlugin, async () => {
  const official = officialWb(['direct', 'template']);
  let actual;
  const c = shelver({ bcsApiCall: async (url, options) => {
    assert.equal(url, '/system/wbCollection/wb/new');
    assert.equal(options.method, 'POST');
    actual = options.data;
    return { code: 200 };
  } });
  await c.batchShelve([item()]);
  const selected = JSON.parse(actual.shop).map(s => ({ ...s, checked: true }));
  const options = { ...config().settings, brandMode: 0 };
  const expected = official.DO(selected, options, clone(actual.shopDatas));
  official.Tc(expected, options);
  assert.deepEqual(clone(actual), clone(expected));
});

test('直上与修改均携带商品图片和视频', async () => {
  const official = hasOfficialPlugin ? officialWb(['description', 'collectBox', 'template']) : null;
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
    assert.equal(JSON.parse(data.variant)[0].videos, video);
    assert.equal(data.images, row.images);
    if (official) {
      const expected = official.V_(
        [{ ...row, nmId: product.nmId }], JSON.parse(original.shop)
      );
      official.Tc(expected, { ...cfg.settings, brandMode: 0 });
      expected.offerUrl = row.offerUrl;
      assert.deepEqual(data, clone(expected));
    }
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
  if (hasOfficialPlugin) assert.equal(officialWb(['media']).bb(srcCard.nmID, opts.cardInfo), video);
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
