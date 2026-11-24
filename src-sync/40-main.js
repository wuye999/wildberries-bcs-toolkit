  // ============================================================
  // 9. 启动
  // ============================================================
  function isCardMainPage() {
    return IS_SELLER_HOST && /^\/card-main\//.test(location.pathname || '');
  }

  let _pollTimer = null;

  function boot() {
    log.info(`BCS 跨店同步 v${SYNC_VERSION} 已加载（${location.pathname}）`);

    // www 页：只负责把插件 token 缓存到 GM，供 seller 页使用（插件只注入 www 域）
    if (!IS_SELLER_HOST) {
      const cached = getCachedCred();
      if (cached && cached.ageMin != null && cached.ageMin < 30) {
        log.info(`BCS 凭证缓存较新（${cached.ageMin} 分钟前），本轮跳过刷新`);
        return;
      }
      const budget = cached ? 20000 : 60000;
      bootstrapCredFromBridge({ timeoutMs: budget }).then((ok) => {
        if (!ok) log.info('www 页未取到 BCS 凭证；可在 seller 页「店铺自检」手动粘贴，或稍后刷新本页重试');
      });
      // 插件可能比脚本晚很久才注入 → 页面可见/恢复时补一次
      let retried = false;
      const retry = () => {
        if (retried || getCachedCred()) return;
        retried = true;
        bootstrapCredFromBridge({ timeoutMs: 20000 });
      };
      document.addEventListener('visibilitychange', () => { if (!document.hidden) retry(); });
      window.addEventListener('pageshow', retry);
      return;
    }

    if (!isCardMainPage()) return;
    injectSyncBar();
    pollSelection();
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(() => {
      if (!isCardMainPage()) return;
      // 页面可能被 SPA 重渲染，悬浮条掉了就补回来
      if (!document.getElementById(BAR_ID) && document.body) injectSyncBar();
      pollSelection();
    }, 1200);

    // 凭证自检：seller 域拿不到插件桥接，只能靠 GM 缓存
    setTimeout(() => {
      const c = getCachedCred();
      if (!c) {
        showToast('未找到 BCS 凭证。请先在 www.wildberries.ru 打开任意页面（脚本会自动缓存），或点「店铺自检」手动粘贴 token', 9000);
      } else if (c.ageMin != null && c.ageMin > 720) {
        showToast(`BCS 凭证已缓存 ${Math.floor(c.ageMin / 60)} 小时，可能已过期；若报 401 请回 www 页刷新或手动粘贴`, 7000);
      }
    }, 1200);
  }

  function whenBodyReady(fn) {
    if (document.body) { fn(); return; }
    const obs = new MutationObserver(() => {
      if (document.body) { obs.disconnect(); fn(); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); if (document.body) fn(); }, 10000);
  }

  whenBodyReady(boot);
})();
