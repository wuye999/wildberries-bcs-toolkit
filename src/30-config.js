  // ============================================================
  // 2. 用户配置 + 待上架列表
  // 批量上架与跨店同步共用 chrome.storage.local。
  // ============================================================
  const STORAGE_KEY = 'bcs_batch_v131_settings';
  const PENDING_KEY = 'bcs_batch_v131_pending';

  // ============================================================
  // ★ v1.9.0 上架价倍数（上架价 = 价格表最低售价 × 店铺倍数）
  //   定义在 30-config 的原因：本文件被 shelve 与 sync 两个产物共享，
  //   而 26-boss-defaults.js 只进 shelve —— 把常量/归一化放这里，两个产物都不会缺符号。
  // ============================================================
  const PRICE_MULTIPLIERS = [1, 2, 5, 10];

  // 脏值/老配置（无该字段）→ 2（等于 v1.8.x 的「双倍售价」现状，老用户无感升级）
  function normalizePriceMultiplier(v) {
    const n = Number(v);
    return PRICE_MULTIPLIERS.includes(n) ? n : 2;
  }

  // 未填写才采用默认库存；0 是有效库存，不能被 || 999 覆盖。
  function normalizeWarehouseQuantity(value) {
    if (value == null || (typeof value === 'string' && !value.trim())) return 999;
    if (typeof value !== 'string' && typeof value !== 'number') throw new Error('库存必须为非负整数');
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('库存必须为非负整数');
    return n;
  }

  // 通过扩展内存映射同步读取 JSON 配置。
  function gmLoad(key, fallback) {
    try {
      const raw = GM_getValue(key, '');
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function gmSave(key, value) {
    try { GM_setValue(key, JSON.stringify(value)); return true; }
    catch (e) { log.error('扩展存储写入失败（' + key + '）:', e && e.message); return false; }
  }

  const DEFAULTS = {
    selectedShopIds: [],
    shopConfigs: {},                    // { [shopId]: { warehouseId, warehouseLocked, quantity, priceMultiplier } }
                                        // ★ v1.9.0 priceMultiplier = 该店铺上架价倍数（1/2/5/10，默认 2），与仓库一样随配置记忆
    settings: {
      carryBrand: false,                // 携带品牌（v1.4.7 起默认不携带）
      directUpload: true,               // true=直上；false=存入采集箱（修改）
      noMerge: true,                    // 不合并
    },
    // ★ v1.9.0 已废弃：上架脚本不再使用（价格 = 价格表最低售价 × 店铺倍数，尺寸/重量取价格表）
    //   仅为 src-sync（跨店同步 · 补上架）兜底保留，勿删（删了会让 sync 兜底变 NaN 报错）
    fixedPrice: 100,
    prefixCode: '',                     // 商品前缀码（vendorCode 中段，4 位大写；空=自动随机生成；★ v1.9.0 唯一作用=价格表归属）
    defaults: { length: 30, width: 30, height: 10, weight: 1 },  // ★ 已废弃（同上，sync 兜底保留）
    intervalMs: 2000,                   // 提交间隔（毫秒）
  };

  function loadConfig() {
    try {
      const cfg = gmLoad(STORAGE_KEY, null);
      if (cfg) {
        // ★ v1.9.0 店铺配置归一化：老配置无 priceMultiplier（或脏值）→ 2（等价改造前的双倍售价）
        const sc = cfg.shopConfigs || {};
        Object.keys(sc).forEach(id => {
          if (!sc[id] || typeof sc[id] !== 'object') sc[id] = {};
          sc[id].priceMultiplier = normalizePriceMultiplier(sc[id].priceMultiplier);
        });
        // 合并默认值，防止字段缺失
        return {
          ...DEFAULTS,
          ...cfg,
          settings: { ...DEFAULTS.settings, ...(cfg.settings || {}) },
          defaults: { ...DEFAULTS.defaults, ...(cfg.defaults || {}) },
          shopConfigs: sc,
          selectedShopIds: cfg.selectedShopIds || [],
        };
      }
    } catch (e) { /* ignore */ }
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  function saveConfig(cfg) {
    gmSave(STORAGE_KEY, cfg);
  }

  let userConfig;

  // ---- 待上架列表 ----
  function loadPending() {
    const list = gmLoad(PENDING_KEY, []);
    // ★ v1.9.0：清掉旧版本遗留的「可编辑价格/尺寸」字段（幂等；价格与包装一律取价格表，不再存在逐行自定义）
    if (Array.isArray(list)) {
      list.forEach(it => {
        if (!it || typeof it !== 'object') return;
        delete it.price;
        delete it.length;
        delete it.width;
        delete it.height;
        delete it.weight;
        delete it.__manual;
      });
    }
    return Array.isArray(list) ? list : [];
  }
  function savePending(list) {
    try {
      const json = JSON.stringify(list);
      // 大列表会占用扩展存储，并影响读写性能。
      if (json.length > 4 * 1024 * 1024) {
        log.warn(`待上架列表数据较大（${(json.length / 1024 / 1024).toFixed(2)}MB），建议减少待上架商品数量`);
      }
      gmSave(PENDING_KEY, list);
    } catch (e) {
      log.error('保存待上架列表失败:', e && e.message);
      showToast('保存失败：数据过大，建议减少待上架商品数量', 5000);
    }
  }
  let pendingList;

  // 新建待上架商品对象（字段定义集中在此，便于维护）
  // ★ v1.9.0：取消 price/length/width/height/weight/__manual —— 上架价 = 价格表最低售价 × 店铺倍数，
  //   包装尺寸/重量一律取价格表，逐行自定义能力已彻底移除（仅剩供应商代码可编辑）
  function createPendingItem(it) {
    return {
      nmId: it.nmId,
      title: it.title || '',
      url: it.url || '',
      thumb: it.thumb || '',
      addedAt: Date.now(),
      vendorCode: it.vendorCode || '',   // 供应商代码（★ v1.8.0 卖家页商品预填行内卖家编码；空=上架时自动生成）
      currentPrice: '',          // 现价(P)（抓取的卢布价，只读展示）
      originalPrice: '',         // 原价(P)（抓取的卢布原价，只读展示）
      skus: [],                  // SKU 变体列表 [{techSize, wbSize, rubPrice, nmId}]
      colors: [],                // 同款多色 nmId 列表
      fetched: false,            // 是否已抓取详情
      wbDetail: null,            // WB cards/v4/detail 的 product 对象
      wbCardInfo: null,          // WB card.json 完整响应
      subjectId: null,           // 类目ID
      subjectName: it.subjectName || '',   // 类目名（★ v1.8.0 卖家页可从行内预填；抓取成功后被 card.json 覆盖）
      parentId: null,            // 父类目ID
      parentName: '',            // 父类目名
      mainImage: '',             // 主图URL
      imagesList: [],            // 所有图片URL数组
      brand: '',                 // 品牌名
      description: '',           // 商品描述
    };
  }

  // 返回 { added: 新增数量, newItems: 新增商品对象列表 }
  function addToList(items) {
    const existing = new Set(pendingList.map(it => String(it.nmId)));
    const newItems = [];
    for (const it of items) {
      if (existing.has(String(it.nmId))) continue;
      const newItem = createPendingItem(it);
      pendingList.push(newItem);
      existing.add(String(it.nmId));
      newItems.push(newItem);
    }
    savePending(pendingList);
    return { added: newItems.length, newItems };
  }

  // 更新单个待上架商品的字段
  function updatePendingItem(nmId, field, value) {
    const item = pendingList.find(it => String(it.nmId) === String(nmId));
    if (item) {
      item[field] = value;
      savePending(pendingList);
    }
  }

  function removeFromList(nmId) {
    pendingList = pendingList.filter(it => it.nmId !== String(nmId) && it.nmId !== Number(nmId));
    savePending(pendingList);
  }

  function clearList() {
    pendingList = [];
    savePending(pendingList);
  }

