
  const BOSS_DEFAULTS_KEY = 'bcs_boss_defaults_v1';
  let bossDefaultsFile = null;
  let BOSS_DEFAULTS = {};
  let PREFIX_CODES = [];
  let PREFIX_CODE_MAP = new Map();
  let PREFIX_CODE_SET = new Set();

  function parseBossDefaultsWorkbook(arrayBuffer) {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = workbook.Sheets.Sheet1 ?? workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('价格表没有工作表');

    const [header = [], ...rows] = XLSX.utils.sheet_to_json(sheet, {
      header: 1, range: 0, defval: '', blankrows: true,
    });
    const columns = header.map(value => String(value).trim());
    const required = ['产品中文名', '尺寸', '最低售价', 'vendorCode前缀码'];
    const missing = required.filter(name => !columns.includes(name));
    if (missing.length) throw new Error(`价格表缺少必需列：${missing.join('、')}`);

    const indexes = [...required, '卖家SKU'].map(name => columns.indexOf(name));
    const entries = [];
    const items = {};
    const warnings = [];
    rows.forEach((row, index) => {
      const [name, size, price, prefix, sku] = indexes.map(i => String(row[i] ?? '').trim());
      if (!name && !size && !price && !prefix && !sku) return;

      const code = prefix.toUpperCase();
      const minPrice = Number(price);
      const dimensions = size.split(/[*/]/).map(Number);
      let warning;
      if (!isValidPrefixCode(code)) {
        warning = 'vendorCode前缀码必须为 4 位大写字母';
      } else if (Object.hasOwn(items, code)) {
        warning = `vendorCode前缀码 ${code} 重复，保留首条`;
      } else if (!Number.isFinite(minPrice) || minPrice <= 0) {
        warning = '最低售价必须为大于 0 的有限数字';
      } else if (dimensions.length !== 4 || dimensions.some(n => !Number.isFinite(n) || n <= 0)) {
        warning = '尺寸须为长*宽*高/重量，四项均须为大于 0 的有限数字';
      }
      if (warning) {
        warnings.push(`第 ${index + 2} 行：${warning}`);
        return;
      }

      const [length, width, height, weight] = dimensions;
      const item = { sku, name, minPrice, length, width, height, weight };
      items[code] = item;
      entries.push({ code, ...item });
    });

    if (!entries.length) {
      throw Object.assign(new Error('价格表没有有效条目'), { warnings });
    }
    return { entries, items, warnings };
  }

  function setBossDefaults(items) {
    BOSS_DEFAULTS = items;
    PREFIX_CODES = Object.entries(items).map(([code, { sku, name }]) => ({ sku, name, code }));
    PREFIX_CODE_MAP = new Map(PREFIX_CODES.map(entry => [entry.code, entry]));
    PREFIX_CODE_SET = new Set(PREFIX_CODE_MAP.keys());
  }

  function loadBossDefaults() {
    const file = GM_getValue(BOSS_DEFAULTS_KEY, null);
    if (file === bossDefaultsFile) return false;
    bossDefaultsFile = file;
    setBossDefaults(file?.items ?? {});
    return true;
  }

  function saveBossDefaults(fileName, { entries, items }) {
    return GM_setValue(BOSS_DEFAULTS_KEY, {
      fileName, updatedAt: Date.now(), count: entries.length, items,
    }, { optimistic: false });
  }

  // 恰好 4 位大写字母（A-Z）
  function isValidPrefixCode(code) {
    return /^[A-Z]{4}$/.test(code || '');
  }

  // 是否已在老板价格表中登记
  function isRegisteredPrefixCode(code) {
    return PREFIX_CODE_MAP.has(code);
  }

  // 显示标签：已登记 → "CYQX - 冲牙器"；未登记 → 原样返回
  function getPrefixCodeLabel(code) {
    const p = PREFIX_CODE_MAP.get(code);
    return p ? `${p.code} - ${p.name}` : code;
  }

  // 整批重建 vendorCode：仅改「自动生成格式」/^BCS-[A-Z]{4}-(\d+)$/ 的商品，
  // 空值 / 手填自定义 / 旧版两段式不触碰；prefixCode 为空（改回自动随机）时直接返回不动作。
  // ★ 需求规则：用户选择前缀码后，覆盖已自动生成的值。
  // 返回被修改的 item 列表（调用方负责 savePending + updateItemRow 刷新）。
  function rebuildPendingVendorCodes(list, prefixCode) {
    const changed = [];
    if (!isValidPrefixCode(prefixCode)) return changed;
    const RE = /^BCS-[A-Z]{4}-(\d+)$/;
    list.forEach(it => {
      const m = RE.exec(it.vendorCode || '');
      if (m) {
        it.vendorCode = `BCS-${prefixCode}-${m[1]}`;
        changed.push(it);
      }
    });
    return changed;
  }

  // 查询某前缀码对应的价格表条目：code 空 / 未登记 / 条目残缺（无最低售价）→ null
  // 返回 { minPrice, length, width, height, weight, sku, name }
  function getBossDefaults(code) {
    if (!code) return null;
    const b = BOSS_DEFAULTS[code];
    if (!b) return null;
    // ★ v1.9.0：最低售价是唯一的定价基准，缺失即视为「未匹配价格表」（避免 undefined 传到 toFixed）
    if (!Number.isFinite(b.minPrice) || !(b.minPrice > 0)) return null;
    return {
      minPrice: b.minPrice, length: b.length, width: b.width,
      height: b.height, weight: b.weight, sku: b.sku, name: b.name,
    };
  }

  // ============================================================
  // ★ v1.9.0 价格模型：上架价 = 价格表最低售价(minPrice) × 店铺倍数
  //   倍数只能取 1/2/5/10，不再支持任何自定义价格/尺寸。
  //   ★ PRICE_MULTIPLIERS / normalizePriceMultiplier 定义在 30-config.js
  //     （该文件被 shelve 与 sync 两个产物共享，避免 sync 产物缺符号）
  // ============================================================

  // 读取某店铺的上架倍数（配置缺失默认 2）
  function getShopPriceMultiplier(shopId, config = userConfig) {
    const cfg = (config.shopConfigs || {})[shopId] || {};
    return normalizePriceMultiplier(cfg.priceMultiplier);
  }

  // 解析商品归属的价格表条目（展示 / 预校验 / 提交三处共用，避免逻辑漂移）：
  //   ① 全局已选【登记】前缀码优先（整批统一归属）
  //   ② 否则按行 vendorCode 的 BCS-XXXX- 段归属（卖家后台行内编码预填场景；容忍特例后缀 BCS-XXXX-123456-20）
  //   ③ 都没有 → null（未匹配价格表 → 阻止上架，不再有全局兜底价）
  function getItemBossDefaults(item, config = userConfig) {
    const gp = config.prefixCode || '';
    if (isRegisteredPrefixCode(gp)) return getBossDefaults(gp);
    if (item && item.vendorCode) {
      const m = String(item.vendorCode).match(/^BCS-([A-Z]{4})-\d+(?=$|-)/);
      if (m && isRegisteredPrefixCode(m[1])) return getBossDefaults(m[1]);
    }
    return null;
  }

  // 上架价计算：先四舍五入到「分」再输出（41.525×5 直接 toFixed 会得到 207.62，必须整数分中转）
  function calcShelfPrice(minPrice, mult) {
    const m = Number(minPrice);
    const k = Number(mult);
    if (!Number.isFinite(m) || !Number.isFinite(k) || !(m > 0) || !(k > 0)) return 0;
    return Math.round(m * k * 100) / 100;
  }

  // 当前已选店铺实际用到的倍数集合（按倍数升序；未选店铺时返回全部可选倍数，供列表参考展示）
  // 返回 [{ mult, shopCount }]
  function getSelectedMultiplierGroups(config = userConfig) {
    const ids = config.selectedShopIds || [];
    const countMap = new Map();
    ids.forEach(id => {
      const m = getShopPriceMultiplier(id, config);
      countMap.set(m, (countMap.get(m) || 0) + 1);
    });
    if (!countMap.size) return PRICE_MULTIPLIERS.map(m => ({ mult: m, shopCount: 0 }));
    return [...countMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([mult, shopCount]) => ({ mult, shopCount }));
  }
