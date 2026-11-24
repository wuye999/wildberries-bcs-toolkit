  // ============================================================
  // 8.5 已上架商品检测（从 BCS 拉取全部已上架商品，对比当前页面）
  // ============================================================
  const LISTED_CACHE_KEY = 'bcs_listed_nmids_v1';
  const LISTED_CACHE_TTL = 30 * 60 * 1000;  // 30 分钟

  let listedNmIdSet = null;        // Set<string>  已上架的原始 nmId
  let listedDetailMap = null;      // Map<string, Array<{shopName, vendorCode, bcsNmId}>>

  function loadListedCache() {
    try {
      const data = gmLoad(LISTED_CACHE_KEY, null);   // ★ v1.8.0 GM 存储（跨域共享）
      if (!data) return false;
      if (Date.now() - data.timestamp > LISTED_CACHE_TTL) return false;
      listedNmIdSet = new Set(data.nmIds || []);
      listedDetailMap = new Map();
      if (data.details) {
        for (const [k, v] of Object.entries(data.details)) {
          listedDetailMap.set(k, v);
        }
      }
      return true;
    } catch (e) { return false; }
  }

  function saveListedCache() {
    try {
      const details = {};
      for (const [k, v] of listedDetailMap.entries()) {
        details[k] = v;
      }
      gmSave(LISTED_CACHE_KEY, {   // ★ v1.8.0 GM 存储（跨域共享）
        timestamp: Date.now(),
        nmIds: [...listedNmIdSet],
        details: details,
      });
    } catch (e) {
      log.warn('保存已上架缓存失败:', e.message);
    }
  }

  // 从 vendorCode 解析原始 nmId（格式 BCS-XXXX-{originalNmId}）
  function parseOriginalNmId(vendorCode) {
    if (!vendorCode) return null;
    const parts = String(vendorCode).split('-');
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) return last;
    return null;
  }

  // 拉取所有店铺的全部已上架商品
  async function fetchAllListedProducts(onProgress) {
    const shops = await getShops();
    if (!shops || !shops.length) throw new Error('未获取到店铺列表');

    const nmIdSet = new Set();
    const detailMap = new Map();
    let totalShops = shops.length;

    for (let si = 0; si < shops.length; si++) {
      const shop = shops[si];
      onProgress && onProgress({ phase: `正在同步 ${shop.shopName} (${si + 1}/${totalShops})...` });

      let pageNum = 1;
      let total = 0;
      do {
        const resp = await bcsApiCall(
          `/shopKeeper/productList/list?filter=ALL&pageNum=${pageNum}&pageSize=1000&shopId=${shop.id}`
        );
        if (resp.code !== 200) throw new Error(`获取 ${shop.shopName} 商品失败: ${resp.msg || ''}`);
        total = resp.total || 0;
        const rows = resp.rows || [];
        for (const row of rows) {
          // BCS 分配的 nmId
          nmIdSet.add(String(row.nmId));
          // 从 vendorCode 解析原始 nmId
          const origNmId = parseOriginalNmId(row.vendorCode);
          if (origNmId) {
            nmIdSet.add(origNmId);
            if (!detailMap.has(origNmId)) detailMap.set(origNmId, []);
            detailMap.get(origNmId).push({
              shopName: shop.shopName,
              vendorCode: row.vendorCode,
              bcsNmId: row.nmId,
            });
          }
        }
        pageNum++;
        // 安全上限：最多 50 页
        if (pageNum > 50) break;
      } while ((pageNum - 1) * 1000 < total);

      // 店铺间限流
      if (si < shops.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    listedNmIdSet = nmIdSet;
    listedDetailMap = detailMap;
    saveListedCache();
    onProgress && onProgress({ phase: 'done', count: nmIdSet.size });
    return nmIdSet;
  }

  // 手动触发同步
  let listedSyncing = false;
  async function syncListedProducts() {
    if (listedSyncing) { showToast('正在同步中，请稍候...', 2000); return; }
    listedSyncing = true;
    const btn = document.getElementById('bcs-tb-listed');
    if (btn) { btn.disabled = true; btn.textContent = '同步中...'; }

    try {
      showToast('开始同步已上架商品...', 3000);
      await fetchAllListedProducts((info) => {
        if (info.phase && info.phase !== 'done') {
          showToast(info.phase, 2000);
          if (btn) btn.textContent = info.phase.length > 12 ? '同步中...' : info.phase;
        }
      });
      const cnt = listedNmIdSet ? listedNmIdSet.size : 0;
      showToast(`同步完成：共 ${cnt} 个已上架商品`, 4000);
      markListedProducts();
    } catch (e) {
      log.error('同步已上架商品失败:', e.message);
      showToast('同步失败: ' + e.message, 5000);
    } finally {
      listedSyncing = false;
      if (btn) { btn.disabled = false; btn.textContent = '同步已上架'; }
    }
  }

  // 标记页面上已上架的商品
  function markListedProducts() {
    if (!listedNmIdSet || listedNmIdSet.size === 0) return;

    // 搜索页：在商品卡片上添加标记
    getProductsOnPage().forEach(item => {
      if (!item.el) return;
      // 已有标记则跳过
      if (item.el.querySelector('.bcs-listed-badge')) {
        if (!listedNmIdSet.has(item.nmId)) {
          // 之前标记了但现在不在列表中（不太可能，但处理一下）
          const badge = item.el.querySelector('.bcs-listed-badge');
          if (badge) badge.remove();
        }
        return;
      }
      if (listedNmIdSet.has(item.nmId)) {
        const badge = document.createElement('div');
        badge.className = 'bcs-listed-badge';
        badge.textContent = '已上架';
        if (getComputedStyle(item.el).position === 'static') item.el.style.position = 'relative';
        item.el.appendChild(badge);
      }
    });

    // 详情页：显示顶部横幅
    if (isDetailPage()) {
      const product = getCurrentProduct();
      if (product && listedNmIdSet.has(product.nmId)) {
        // 避免重复添加
        if (document.querySelector('.bcs-listed-detail-banner')) return;

        const details = listedDetailMap && listedDetailMap.get(product.nmId);
        const banner = document.createElement('div');
        banner.className = 'bcs-listed-detail-banner';
        let shopsHtml = '';
        if (details && details.length > 0) {
          const shopNames = [...new Set(details.map(d => d.shopName))];
          shopsHtml = `<div class="bcs-listed-shops">已在 ${shopNames.length} 个店铺上架：${shopNames.join('、')}</div>`;
        }
        banner.innerHTML = `
          <span class="bcs-listed-close" onclick="this.parentElement.remove()">×</span>
          ⚠️ 此商品（${product.nmId}）已在 BCS 上架
          ${shopsHtml}
        `;
        document.body.appendChild(banner);
        // 调整页面顶部 padding 避免遮挡
        document.body.style.paddingTop = (details && details.length > 0) ? '56px' : '40px';
      }
    }
  }

