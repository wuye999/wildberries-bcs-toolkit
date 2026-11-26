  // ============================================================
  // 11. 工具栏 + 局部行更新
  // ============================================================
  let selectedItems = new Set();   // 当前页面选中的 nmId
  let panelEl = null;
  let panelMask = null;

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function injectToolbar() {
    // 幂等检查，避免重复注入
    if (document.querySelector('.bcs-toolbar')) return;
    injectStyles();

    const toolbar = document.createElement('div');
    toolbar.className = 'bcs-toolbar';
    toolbar.innerHTML = `
      <span id="bcs-tb-count" class="bcs-tb-count">已选 0</span>
      <button type="button" id="bcs-tb-selectall" class="bcs-tb-ghost" title="勾选当前页所有商品">全选</button>
      <button type="button" id="bcs-tb-clear" class="bcs-tb-ghost" title="取消当前页勾选">清空</button>
      <button type="button" id="bcs-tb-add" class="bcs-btn-add">加入待上架</button>
      <button type="button" id="bcs-tb-cur" class="bcs-tb-cur-btn" style="display:none;">＋当前商品</button>
      <span class="bcs-tb-divider"></span>
      <button type="button" id="bcs-tb-panel" class="bcs-btn-panel">
        <span>待上架列表</span>
        <span class="bcs-badge" id="bcs-tb-badge">0</span>
      </button>
      <span class="bcs-tb-divider"></span>
      <button type="button" id="bcs-tb-listed" class="bcs-tb-listed-btn" title="拉取 BCS 已上架商品并在页面打标">同步已上架</button>
    `;
    document.body.appendChild(toolbar);

    document.getElementById('bcs-tb-cur').onclick = onAddCurrentProduct;
    document.getElementById('bcs-tb-add').onclick = onAddToPending;
    document.getElementById('bcs-tb-panel').onclick = openPanel;
    document.getElementById('bcs-tb-selectall').onclick = () => {
      getProductsOnPage().forEach(it => selectedItems.add(it.nmId));
      refreshCheckboxes();
      updateToolbarCount();
    };
    document.getElementById('bcs-tb-clear').onclick = () => {
      selectedItems.clear();
      refreshCheckboxes();
      updateToolbarCount();
    };
    document.getElementById('bcs-tb-listed').onclick = syncListedProducts;

    updateToolbarCount();
    updateCurrentProductButton();
  }

  // ★ v1.7.4「＋当前商品」按钮显隐：仅详情页（URL 含 /catalog/{nmId}）显示，搜索页隐藏
  // 详情页内切换商品是 SPA 跳转不重载页面，故每次调用都实时读 URL 与 h1
  function updateCurrentProductButton() {
    const btn = document.getElementById('bcs-tb-cur');
    if (!btn) return;
    const product = isDetailPage() ? getCurrentProduct() : null;
    if (product) {
      btn.style.display = '';
      btn.title = `把当前详情页商品（nmId: ${product.nmId}）加入待上架列表`;
    } else {
      btn.style.display = 'none';
    }
  }

  function updateToolbarCount() {
    const countEl = document.getElementById('bcs-tb-count');
    if (countEl) {
      countEl.textContent = `已选 ${selectedItems.size}`;
      countEl.classList.toggle('has-sel', selectedItems.size > 0);
    }
    const addBtn = document.getElementById('bcs-tb-add');
    if (addBtn) {
      addBtn.classList.toggle('active', selectedItems.size > 0);
    }
    const badge = document.getElementById('bcs-tb-badge');
    if (badge) {
      badge.textContent = String(pendingList.length);
      badge.classList.toggle('has-items', pendingList.length > 0);
    }
  }

  // 全局抓取队列状态（防止并发抓取冲突）
  let fetchingQueue = false;

  function onAddToPending() {
    let toAdd = [];
    // 优先用复选框选中的商品
    if (selectedItems.size > 0) {
      const pageItems = getProductsOnPage();
      toAdd = pageItems.filter(it => selectedItems.has(it.nmId));
    }
    if (toAdd.length === 0) {
      showToast('请先勾选要上架的商品（详情页主商品请点「＋当前商品」）', 4000);
      return;
    }

    // 勾选流程：加入后清空页面选择（保持历史行为）
    addItemsAndFetch(toAdd, { clearSelection: true });
  }

  // ★ v1.7.4 详情页：把 URL 中的当前商品加入待上架列表
  // 与勾选流程的区别：不清空页面已勾选项（用户在推荐位列表勾好的商品不能被顺带清掉）
  function onAddCurrentProduct() {
    // 双重门禁：搜索页 URL 形如 /catalog/0/search.aspx，getCurrentProduct 会取出 nmId=0
    const product = isDetailPage() ? getCurrentProduct() : null;
    if (!product) {
      showToast('未识别到当前商品：仅在商品详情页可用', 4000);
      return;
    }
    // 重复添加：直接提示，不重复入列
    if (pendingList.some(it => String(it.nmId) === product.nmId)) {
      showToast(`商品 ${product.nmId} 已在待上架列表中`, 3000);
      return;
    }

    // ★ 已上架只提示不阻止（与页面推荐位商品行为一致，最终由提交时的重复上架检测把关）
    let warn = '';
    if (listedNmIdSet && listedNmIdSet.has(product.nmId)) {
      const details = listedDetailMap && listedDetailMap.get(product.nmId);
      const shops = details && details.length
        ? [...new Set(details.map(d => d.shopName))].join('、')
        : '';
      warn = `该商品已检测到在 BCS 上架${shops ? '（' + shops + '）' : ''}，请自行核对`;
    }

    addItemsAndFetch([product], {
      label: `当前商品 ${product.nmId}`,
      clearSelection: false,
      warn,
    });
  }

  // ★ v1.7.4 抽取公共流程：加入列表 → 刷新 UI → 提示 → 自动抓取（勾选流程与「＋当前商品」共用）
  function addItemsAndFetch(toAdd, opts = {}) {
    const { added, newItems } = addToList(toAdd);
    const skipped = toAdd.length - added;

    if (opts.clearSelection) {
      selectedItems.clear();
      refreshCheckboxes();
    }
    updateToolbarCount();

    if (panelEl) renderPendingList();

    let msg = opts.label ? `${opts.label}：` : '';
    msg += `已添加 ${added} 个商品`;
    if (skipped > 0) msg += `（${skipped} 个已存在跳过）`;
    msg += '，正在自动抓取详情...';
    if (opts.warn) msg += ` ⚠️ ${opts.warn}`;
    showToast(msg, opts.warn ? 6000 : 3000);

    if (newItems.length > 0) {
      autoFetchItems(newItems);
    }
    return { added, skipped, newItems };
  }

  // 非阻塞提示（右上角浮层）
  function showToast(text, duration = 3000) {
    injectStyles();
    let toast = document.getElementById('bcs-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'bcs-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.classList.remove('show'); }, duration);
  }

  // 自动抓取一批商品的详情
  async function autoFetchItems(items) {
    if (fetchingQueue) {
      log.warn('已有抓取任务进行中，跳过本次自动抓取');
      return;
    }
    if (batchRunning) {
      log.warn('上架任务进行中，跳过自动抓取');
      showToast('上架任务进行中，自动抓取已跳过', 3000);
      return;
    }
    fetchingQueue = true;

    try {
      const { ok, fail } = await fetchItemsBatch(items, (text) => {
        updateFetchStatus(text);
        showToast(text, 2000);
      });
      const doneText = `抓取完成：成功 ${ok} 个，失败 ${fail} 个`;
      updateFetchStatus(doneText);
      showToast(doneText, 4000);
    } finally {
      fetchingQueue = false;
    }
  }

  // 只更新单个商品行的显示（不重渲染整个表格，避免用户正在编辑的输入框失焦）
  function updateItemRow(item) {
    if (!panelEl) return;
    const row = panelEl.querySelector(`tr[data-nm-id="${item.nmId}"]`);
    if (!row) return;

    row.classList.toggle('row-unfetched', item.fetched !== true);
    paintProductCell(row.querySelector('.col-product'), item);

    const codeInput = row.querySelector('.col-code input');
    if (codeInput) {
      codeInput.placeholder = `自动(${userConfig.prefixCode || '随机'})`;
      if (item.vendorCode) {
        codeInput.value = item.vendorCode;
      }
    }

    paintSkuCell(row.querySelector('.col-sku'), item);
    paintRubCell(row.querySelector('.col-rub'), item);
    paintPriceCells(row, item);
    updateListBadges();
    updateFooterSummary();
  }

  // 更新列表头部的抓取状态文字
  function updateFetchStatus(text) {
    const info = document.getElementById('bcs-fetch-info');
    if (info) info.textContent = text;
  }

  // ---- 复选框注入 ----
  function refreshCheckboxes() {
    const currentNmId = (() => {
      const m = location.pathname.match(/\/catalog\/(\d+)/);
      return m ? m[1] : null;
    })();

    const products = getProductsOnPage();
    products.forEach(item => {
      // 详情页：跳过当前主商品（URL 中的 nmId），主商品改由「＋当前商品」按钮加入
      if (isDetailPage() && item.nmId === currentNmId) return;
      if (!item.el) return;

      // 检测虚拟滚动复用 DOM 节点
      const existingCb = item.el.querySelector('.bcs-checkbox');
      if (existingCb) {
        if (existingCb.dataset.nmId !== item.nmId) {
          existingCb.remove();
        } else {
          existingCb.checked = selectedItems.has(item.nmId);
          return;
        }
      }
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'bcs-checkbox';
      cb.dataset.nmId = item.nmId;
      cb.checked = selectedItems.has(item.nmId);
      cb.onchange = () => {
        if (cb.checked) selectedItems.add(item.nmId);
        else selectedItems.delete(item.nmId);
        updateToolbarCount();
      };
      if (getComputedStyle(item.el).position === 'static') item.el.style.position = 'relative';
      item.el.appendChild(cb);
    });
  }
