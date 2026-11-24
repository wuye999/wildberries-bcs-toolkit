  // ============================================================
  // 6. 店铺与仓库读取（云端API模式：GM_xmlhttpRequest 直连）
  // ============================================================
  let shopsCache = null;
  let shopsAutoSelected = false;

  // 获取店铺列表（带缓存；force=true 强制刷新）
  async function getShops(force = false) {
    if (!shopsCache || force) {
      shopsCache = await fetchShopsFromCloud();
    }
    return shopsCache;
  }

  // 确保仓库已加载（云端API模式）
  async function ensureWarehouses(shopId) {
    const shops = shopsCache || [];
    const shop = shops.find(s => s.id === shopId);
    if (shop && shop.warehouses && shop.warehouses.length > 0) return shop;
    const warehouses = await fetchWarehousesFromCloud(shopId);
    if (shop) {
      shop.warehouses = warehouses;
      return shop;
    }
    // ★ v1.5.3 兜底：店铺不在缓存时也返回仓库数据，避免返回 undefined 导致仓库加载静默失败
    return { warehouses };
  }

