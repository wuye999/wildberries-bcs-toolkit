  // ============================================================
  // 13. 页面监听注入
  // ============================================================
  function injectPageWatcher() {
    // 幂等检查，避免重复注册
    // ★ 用 document.body.dataset 作为页面级标记，可从控制台直接验证（window.__bcsWatcherInstalled 在沙箱中不可见）
    if (document.body && document.body.dataset.bcsWatcher === '1') return;
    if (document.body) document.body.dataset.bcsWatcher = '1';
    window.__bcsWatcherInstalled = true;

    // 新增商品节点时防抖刷新，定时补回页面重渲染移除的复选框。
    let debounceTimer = null;
    if (document.body) {
      new MutationObserver((mutations) => {
        // 仅在有新增节点时触发。
        const hasAdded = mutations.some(m => m.addedNodes && m.addedNodes.length > 0);
        if (!hasAdded) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          refreshCheckboxes();
          markListedProducts();
          updateCurrentProductButton();   // ★ v1.7.4 详情页按钮显隐
        }, 400);
      }).observe(document.body, { childList: true, subtree: true });
    }
    setTimeout(() => { refreshCheckboxes(); markListedProducts(); updateCurrentProductButton(); }, 1500);

    window.addEventListener('popstate', updateCurrentProductButton);

    // 每 2 秒检查商品卡片，复选框数量变化时刷新已上架标记。
    let lastCbCount = -1;
    setInterval(() => {
      // ★ v1.7.4 按钮显隐必须先于下方 return 更新：详情页可能没有任何推荐位卡片（linkCount=0）
      updateCurrentProductButton();
      // 用商品链接数量作为卡片数（和 getProductsOnPage 一致的选择器）
      let linkCount = 0;
      document.querySelectorAll('a.product-card__link, a.j-open-full-product-card, a.j-card-link').forEach(a => {
        if (/\/catalog\/\d+\//.test(a.getAttribute('href') || '')) linkCount++;
      });
      if (!linkCount) return;
      // 无条件刷新复选框（幂等，已有复选框会跳过）
      refreshCheckboxes();
      // 仅在复选框数量变化时才刷新已上架标记（避免卡顿）
      const newCbCount = document.querySelectorAll('.bcs-checkbox').length;
      if (newCbCount !== lastCbCount) {
        lastCbCount = newCbCount;
        markListedProducts();
      }
    }, 2000);
  }

  // ============================================================
  // 14. 入口
  // ============================================================
  function refreshBossDefaults() {
    if (!loadBossDefaults() || !panelEl) return;
    renderPriceSettings();
    renderPendingList();
  }

  async function start() {
    try {
      await extStorageReady();
      userConfig = loadConfig();
      pendingList = loadPending();
      refreshBossDefaults();
      extOnStorageChange(BOSS_DEFAULTS_KEY, refreshBossDefaults);
      const hasListedCache = loadListedCache();
      injectToolbar();
      injectPageWatcher();
      if (hasListedCache) {
        log.info('已加载已上架商品缓存:', listedNmIdSet.size, '个');
        setTimeout(markListedProducts, 2000);
      }
    } catch (e) {
      log.error('启动失败:', e.message);
      showToast('批量上架启动失败：' + e.message, 6000);
    }
  }

  // 页面加载后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
