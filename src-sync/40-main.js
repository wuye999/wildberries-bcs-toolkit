  // 卖家后台通过 SPA 切换路由，进入商品列表时挂载工具栏。
  function isCardMainPage() {
    return /^\/card-main\//.test(location.pathname);
  }

  function refreshSyncPage() {
    if (!isCardMainPage()) {
      for (const id of [BAR_ID, PANEL_ID, PANEL_SYNC]) {
        document.getElementById(id)?.remove();
      }
      return;
    }
    injectSyncBar();
    pollSelection();
  }

  async function boot() {
    try {
      await extStorageReady();
      userConfig = loadConfig();
      refreshSyncPage();
      setInterval(refreshSyncPage, 1200);
    } catch (error) {
      log.error('跨店同步启动失败:', error.message);
      showToast('跨店同步启动失败：' + error.message, 6000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
