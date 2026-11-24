  // ============================================================
  // 13. 页面监听注入
  // ============================================================
  function injectPageWatcher() {
    // 幂等检查，避免重复注册
    // ★ 用 document.body.dataset 作为页面级标记，可从控制台直接验证（window.__bcsWatcherInstalled 在沙箱中不可见）
    if (document.body && document.body.dataset.bcsWatcher === '1') return;
    if (document.body) document.body.dataset.bcsWatcher = '1';
    window.__bcsWatcherInstalled = true;

    // ★ Bug M4 修复：标准防抖 + setInterval 保底
    // BCS 插件异步加载数据时持续更新 DOM（名称/品牌/价格/销量/评分...），
    // 每次更新都触发 MutationObserver，导致防抖定时器被不断重置，永不执行。
    // 解决方案：
    //   1. MutationObserver 只在有新增节点时触发防抖（忽略 BCS 插件的文本/属性更新）
    //   2. 增加 setInterval 保底，每 2 秒检查是否有商品缺复选框
    let debounceTimer = null;
    if (document.body) {
      new MutationObserver((mutations) => {
        // 只在有新增节点时触发，忽略 BCS 插件的文本内容更新和属性变化
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
    setTimeout(() => { refreshCheckboxes(); markListedProducts(); updateCurrentProductButton(); updateSellerButton(); }, 1500);

    // ★ v1.7.4 详情页→搜索页等 SPA 跳转（不重载页面）时前后退需同步按钮显隐
    // ★ v1.8.0 卖家后台同为 SPA，路由切换（其他 tab ↔ /card-main/）时同步按钮显隐与已选计数
    window.addEventListener('popstate', () => {
      updateCurrentProductButton();
      updateSellerButton();
      if (IS_SELLER_HOST) updateToolbarCount();
    });

    // ★ 保底机制：每 2 秒无条件执行 refreshCheckboxes
    // BCS 插件异步加载完成后可能重渲染卡片内部，导致复选框被删除
    // refreshCheckboxes 是幂等的，已有复选框的卡片会跳过，无副作用
    // markListedProducts 较重，仅在复选框数量变化时才调用
    let lastCbCount = -1;
    setInterval(() => {
      // ★ v1.7.4 按钮显隐必须先于下方 return 更新：详情页可能没有任何推荐位卡片（linkCount=0）
      updateCurrentProductButton();
      // ★ v1.8.0 卖家后台分支：不扫 www 卡片选择器（恒 0 会整体 no-op），仅同步按钮显隐与已选计数
      if (IS_SELLER_HOST) {
        updateSellerButton();
        updateToolbarCount();
        return;
      }
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
  async function start() {
    try {
      // ★ v1.8.0 卖家后台：无 BCS 插件桥接（manifest 不含 seller 域），
      //   跳过 waitForBridge（否则空等 60s 超时）直接注入 UI；凭证由 bcsApiCall 读 GM 跨域缓存
      if (IS_SELLER_HOST) {
        injectToolbar();
        injectPageWatcher();
        if (loadListedCache()) {
          log.info('已加载已上架商品缓存:', listedNmIdSet.size, '个');
        }
        log.info('卖家后台模式启动完成（BCS 凭证走 GM 跨域缓存）');
        return;
      }

      await waitForBridge();

      // 验证token可用
      try {
        const token = await callApi('getToken');
        if (!token) {
          log.warn('Token 为空，请在 BCS 插件中登录');
        }
      } catch (e) {
        log.warn('Token 获取失败:', e.message);
      }

      injectToolbar();
      injectPageWatcher();
      // 尝试加载已上架商品缓存（非阻塞，不依赖网络）
      if (loadListedCache()) {
        log.info('已加载已上架商品缓存:', listedNmIdSet.size, '个');
        setTimeout(markListedProducts, 2000);
      }
    } catch (e) {
      log.error('启动失败:', e.message);
      // 即使桥接失败，也注入工具栏（可添加商品，但上架时会提示错误）
      injectToolbar();
      injectPageWatcher();
    }
  }

  // 页面加载后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
