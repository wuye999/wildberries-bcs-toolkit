  // ============================================================
  // 11. 工具栏 + 待上架列表面板 UI
  // ============================================================
  let selectedItems = new Set();   // 当前页面选中的 nmId
  let panelEl = null;
  let panelMask = null;

  function injectToolbar() {
    // 幂等检查，避免重复注入
    if (document.querySelector('.bcs-toolbar')) return;
    injectStyles();

    const toolbar = document.createElement('div');
    toolbar.className = 'bcs-toolbar';
    toolbar.innerHTML = `
      <span id="bcs-tb-count">已选 0</span>
      <button id="bcs-tb-cur" class="bcs-tb-cur-btn" style="display:none;">＋当前商品</button>
      <button id="bcs-tb-add" class="bcs-btn-add">添加到待上架列表</button>
      <button id="bcs-tb-panel">待上架列表<span class="bcs-badge" id="bcs-tb-badge">0</span></button>
      <button id="bcs-tb-selectall">全选</button>
      <button id="bcs-tb-clear">清空选择</button>
      <button id="bcs-tb-listed" class="bcs-tb-listed-btn">同步已上架</button>
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
    if (countEl) countEl.textContent = `已选 ${selectedItems.size}`;
    const badge = document.getElementById('bcs-tb-badge');
    if (badge) badge.textContent = pendingList.length;
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
      alert('请先勾选要上架的商品\n（详情页主商品不在推荐列表内，请用工具栏「＋当前商品」按钮加入）');
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
  //   opts.clearSelection：是否清空页面已勾选商品（勾选流程 true；详情页按钮 false）
  //   opts.label：提示文案前缀（如「当前商品 1590343793」）
  //   opts.warn：附加警告文案（合并进同一条 toast，避免被后续 toast 覆盖而丢失）
  function addItemsAndFetch(toAdd, opts = {}) {
    const { added, newItems } = addToList(toAdd);
    const skipped = toAdd.length - added;

    // 清空当前页选择
    if (opts.clearSelection) {
      selectedItems.clear();
      refreshCheckboxes();
    }
    updateToolbarCount();

    // 如果面板已打开，刷新列表
    if (panelEl) renderPendingList();

    // 非阻塞提示
    let msg = opts.label ? `${opts.label}：` : '';
    msg += `已添加 ${added} 个商品`;
    if (skipped > 0) msg += `（${skipped} 个已存在跳过）`;
    msg += '，正在自动抓取详情...';
    if (opts.warn) msg += ` ⚠️ ${opts.warn}`;
    showToast(msg, opts.warn ? 6000 : 3000);

    // 自动抓取新增商品的详情
    if (newItems.length > 0) {
      autoFetchItems(newItems);
    }
    return { added, skipped, newItems };
  }

  // 非阻塞提示（右上角浮层，3秒后消失）
  function showToast(text, duration = 3000) {
    let toast = document.getElementById('bcs-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'bcs-toast';
      toast.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 9999999;
        background: #333; color: #fff; padding: 10px 16px;
        border-radius: 6px; font-size: 13px; max-width: 320px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
        transition: opacity 0.3s;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
  }

  // 自动抓取一批商品的详情（★ v1.4.1：detail 合并请求 + 失败不重试 + 批次间随机抖动限流）
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

    // 标记为已抓取（背景变绿）
    row.classList.add('row-fetched-true');
    paintProductThumbnail(row.querySelector('.col-img'), item);

    // ★ v1.7.0 合成 detail 角标就地同步（重渲染路径在 renderPendingList 的序号列生成）
    if (item.detailSource === 'synthetic') {
      const idxCell = row.querySelector('.col-idx');
      if (idxCell && !idxCell.querySelector('.bcs-syn-badge')) {
        const badge = document.createElement('span');
        badge.className = 'bcs-syn-badge';
        badge.style.cssText = 'display:inline-block;margin-left:4px;padding:0 4px;font-size:10px;line-height:16px;background:#e6a23c;color:#fff;border-radius:3px;vertical-align:middle;cursor:help;';
        badge.title = 'detail 抓取失败，使用 card.json 合成数据（规格名占位、无实时现价；售价/尺寸/重量用生效值）';
        badge.textContent = '合';
        idxCell.appendChild(badge);
      }
    }

    // 更新供应商代码输入框（强制更新，确保抓取到的值显示出来；placeholder 同步前缀码状态）
    const codeInput = row.querySelector('.col-code input');
    if (codeInput) {
      codeInput.placeholder = `自动(${userConfig.prefixCode || '随机'})`;
      if (item.vendorCode) {
        codeInput.value = item.vendorCode;
      }
    } else {
      log.debug(`更新行 ${item.nmId} 供应商代码失败: codeInput=${!!codeInput}, vendorCode=${item.vendorCode}`);
    }

    // 更新 SKU 列（只显示第一个变体的 nmId，标注总变体数）
    const skuCell = row.querySelector('.col-sku');
    if (skuCell && item.skus && item.skus.length > 0) {
      const first = item.skus[0];
      // 优先显示 SKU 代码（nmId）
      let skuText = '';
      if (first.nmId) {
        skuText = first.nmId;
      } else {
        const parts = [];
        if (first.wbSize) parts.push(first.wbSize);
        else if (first.techSize) parts.push(first.techSize);
        if (first.rubPrice) parts.push(`${first.rubPrice}P`);
        skuText = parts.join(' / ') || '无';
      }

      // tooltip 显示所有变体
      const allSkuText = item.skus.map((s, idx) => {
        const p = [];
        if (s.nmId) p.push(s.nmId);
        if (s.wbSize) p.push(s.wbSize);
        else if (s.techSize) p.push(s.techSize);
        if (s.rubPrice) p.push(`${s.rubPrice}P`);
        return `#${idx + 1}: ${p.join(' / ')}`;
      }).join('\n');

      skuCell.innerHTML = `<div class="sku-list" title="${allSkuText}" style="font-size:12px;color:#333;">${skuText}</div>`;
      if (item.skus.length > 1) {
        const cnt = document.createElement('div');
        cnt.style.cssText = 'font-size:10px;color:#409eff;margin-top:2px;';
        cnt.textContent = `共 ${item.skus.length} 个变体`;
        skuCell.appendChild(cnt);
      }
    } else if (skuCell) {
      skuCell.innerHTML = '<span style="color:#ccc;">无变体</span>';
    }

    // 同款多色提示
    if (skuCell && item.colors && item.colors.length > 1) {
      const colors = document.createElement('div');
      colors.style.cssText = 'font-size:10px;color:#999;margin-top:2px;';
      colors.textContent = `${item.colors.length} 色`;
      skuCell.appendChild(colors);
    }

    // 更新现价/原价列
    const rubCell = row.querySelector('.col-rub');
    if (rubCell) {
      const cur = item.currentPrice || '--';
      const old = item.originalPrice || '--';
      rubCell.innerHTML = `<div>${cur}</div><div style="text-decoration:line-through;color:#aaa;">${old}</div>`;
    }

    // 更新价格/包装列（★ v1.9.0：全只读，最低售价 + 按店铺倍数的上架价 + 价格表包装尺寸）
    //   实现集中在 82-ui-panel.js 的 paintPriceCells（函数声明提升，跨模块可调），避免两处逻辑漂移
    paintPriceCells(row, item);
  }

  // 更新表格下方的抓取状态文字
  function updateFetchStatus(text) {
    const info = document.getElementById('bcs-fetch-info');
    if (info) info.textContent = text;
  }

  // ---- 复选框注入 ----
  function refreshCheckboxes() {
    // 详情页也注入复选框（用于推荐列表的商品选择）
    // 排除当前详情页主商品（h1 所在区域的商品）
    // ★ v1.7.4：主商品改由工具栏「＋当前商品」按钮加入（见 56-products.getCurrentProduct），
    //   此处保持排除——否则「全选」会把主商品混进推荐位勾选集合
    const currentNmId = (() => {
      const m = location.pathname.match(/\/catalog\/(\d+)/);
      return m ? m[1] : null;
    })();

    const products = getProductsOnPage();
    let added = 0;
    products.forEach(item => {
      // 详情页：跳过当前主商品（URL 中的 nmId）
      if (isDetailPage() && item.nmId === currentNmId) return;

      if (!item.el) return;
      // ★ 已存在复选框：检查 nmId 是否变化（搜索页虚拟滚动会复用 DOM 节点，只更新 href）
      const existingCb = item.el.querySelector('.bcs-checkbox');
      if (existingCb) {
        // 如果复选框绑定的 nmId 与当前 nmId 不同，说明 DOM 节点被复用，需重建复选框
        if (existingCb.dataset.nmId !== item.nmId) {
          // 旧 nmId 的选中状态保留在 selectedItems 中，新 nmId 按当前选中状态显示
          existingCb.remove();
        } else {
          // nmId 一致：同步 checked 状态（清空选择后需取消勾选 UI）
          existingCb.checked = selectedItems.has(item.nmId);
          return;
        }
      }
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'bcs-checkbox';
      cb.dataset.nmId = item.nmId;  // ★ 记录绑定的 nmId，用于检测虚拟滚动复用
      cb.checked = selectedItems.has(item.nmId);
      cb.onchange = () => {
        if (cb.checked) selectedItems.add(item.nmId);
        else selectedItems.delete(item.nmId);
        updateToolbarCount();
      };
      if (getComputedStyle(item.el).position === 'static') item.el.style.position = 'relative';
      item.el.appendChild(cb);
      added++;
    });
  }

