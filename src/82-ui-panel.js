  // ============================================================
  // 12. 待上架列表面板（按运营操作顺序：价格表前缀 → 上架选项 → 目标店铺 → 商品核对）
  // ============================================================
  let panelKeyHandler = null;

  function getStartButtonLabel() {
    return userConfig && userConfig.settings && !userConfig.settings.directUpload
      ? '一键存入采集箱'
      : '一键全部上架';
  }

  function openPanel() {
    if (panelEl) return;
    injectStyles();

    panelMask = document.createElement('div');
    panelMask.className = 'bcs-panel-mask';
    panelMask.onclick = closePanel;

    panelEl = document.createElement('div');
    panelEl.className = 'bcs-panel';
    panelEl.innerHTML = `
      <div class="bcs-panel-header">
        <h3>
          <span>批量上架工作台</span>
          <span id="bcs-panel-count" class="bcs-header-pill">0 个商品</span>
        </h3>
        <span class="bcs-header-sub">按从上到下顺序核对后即可提交</span>
        <button type="button" class="bcs-panel-close" id="bcs-panel-close" title="关闭（Esc）">×</button>
      </div>
      <div class="bcs-panel-body" id="bcs-panel-body"></div>
      <div class="bcs-progress" id="bcs-progress" style="display:none;"></div>
      <div class="bcs-panel-footer">
        <button type="button" class="bcs-btn-clear-list" id="bcs-btn-clear-list">清空列表</button>
        <div class="bcs-footer-summary" id="bcs-footer-summary"></div>
        <button type="button" class="bcs-btn-start" id="bcs-btn-start">${getStartButtonLabel()}</button>
      </div>
    `;
    document.body.appendChild(panelMask);
    document.body.appendChild(panelEl);

    document.getElementById('bcs-panel-close').onclick = closePanel;
    document.getElementById('bcs-btn-clear-list').onclick = () => {
      if (!pendingList.length) { showToast('列表已为空', 2500); return; }
      if (!confirm(`确认清空 ${pendingList.length} 个待上架商品？`)) return;
      clearList();
      renderPendingList();
      updateToolbarCount();
    };
    document.getElementById('bcs-btn-start').onclick = onStartBatch;

    panelKeyHandler = (e) => {
      if (e.key === 'Escape' && panelEl) closePanel();
    };
    document.addEventListener('keydown', panelKeyHandler);

    renderPanelBody();
  }

  function closePanel() {
    if (panelKeyHandler) {
      document.removeEventListener('keydown', panelKeyHandler);
      panelKeyHandler = null;
    }
    if (panelMask) { panelMask.remove(); panelMask = null; }
    if (panelEl) { panelEl.remove(); panelEl = null; }
  }

  function renderPanelBody() {
    const body = document.getElementById('bcs-panel-body');
    if (!body) return;
    body.innerHTML = '';

    // --- 1. 价格表与商品前缀（最先核对，决定全批定价与包装） ---
    const priceSection = document.createElement('div');
    priceSection.className = 'bcs-section';
    priceSection.innerHTML = `
      <div class="bcs-section-title">
        <div class="bcs-section-head-left">
          <span class="bcs-section-name">1. 价格表与商品前缀</span>
          <span id="bcs-price-status" role="status"></span>
        </div>
        <div class="bcs-section-head-right" id="bcs-price-actions"></div>
      </div>
      <div class="bcs-section-body" id="bcs-price-body"></div>
    `;
    body.appendChild(priceSection);

    // --- 2. 上架选项（紧凑单行：方式 / 品牌 / 同款合并 / 提交间隔） ---
    const modeSection = document.createElement('div');
    modeSection.className = 'bcs-section';
    modeSection.innerHTML = `
      <div class="bcs-section-body" id="bcs-mode-body"></div>
    `;
    body.appendChild(modeSection);

    // --- 3. 目标店铺（仓库 / 库存 / 上架倍数，支持全选与全不选） ---
    const shopSection = document.createElement('div');
    shopSection.className = 'bcs-section';
    shopSection.innerHTML = `
      <div class="bcs-section-title">
        <div class="bcs-section-head-left">
          <span class="bcs-section-name">2. 目标店铺与倍数</span>
          <span id="bcs-shop-count-pill" class="bcs-pill bcs-pill-muted">加载中</span>
          <span class="bcs-section-sub">各店铺仓库、库存、倍数会自动记忆</span>
        </div>
        <div class="bcs-section-head-right">
          <button type="button" class="bcs-link-btn" id="bcs-shops-all">全选</button>
          <span class="bcs-link-sep">|</span>
          <button type="button" class="bcs-link-btn mute" id="bcs-shops-none">全不选</button>
          <button type="button" class="bcs-btn-outline" id="bcs-refresh-shops">刷新店铺</button>
        </div>
      </div>
      <div class="bcs-section-body bcs-no-pad" id="bcs-shop-body"></div>
    `;
    body.appendChild(shopSection);
    document.getElementById('bcs-refresh-shops').onclick = () => renderShopList(true);

    // --- 4. 待上架商品列表（主核对区） ---
    const listSection = document.createElement('div');
    listSection.className = 'bcs-section';
    listSection.innerHTML = `
      <div class="bcs-section-title">
        <div class="bcs-section-head-left">
          <span class="bcs-section-name">3. 待上架商品</span>
          <span id="bcs-list-badges"></span>
        </div>
        <div class="bcs-section-head-right">
          <span class="bcs-fetch-info" id="bcs-fetch-info"></span>
          <button type="button" class="bcs-btn-accent" id="bcs-btn-fetch">刷新商品信息</button>
        </div>
      </div>
      <div class="bcs-section-body bcs-no-pad" id="bcs-pending-list"></div>
    `;
    body.appendChild(listSection);
    document.getElementById('bcs-btn-fetch').onclick = onFetchDetails;

    renderPriceSettings();
    renderModeSettings();
    renderPendingList();
    renderShopList();
  }

  // 更新列表头部的数量、待抓取、未匹配徽标
  function updateListBadges() {
    const headerCount = document.getElementById('bcs-panel-count');
    if (headerCount) headerCount.textContent = `${pendingList.length} 个商品`;

    const badges = document.getElementById('bcs-list-badges');
    if (badges) {
      const unfetched = pendingList.filter(it => it.fetched !== true).length;
      const noBoss = pendingList.filter(it => !getItemBossDefaults(it)).length;
      const parts = [`<span class="bcs-pill bcs-pill-info">共 ${pendingList.length} 个</span>`];
      if (unfetched > 0) parts.push(`<span class="bcs-pill bcs-pill-warn">${unfetched} 个待抓取</span>`);
      if (noBoss > 0) parts.push(`<span class="bcs-pill bcs-pill-err">${noBoss} 个未匹配价格表</span>`);
      badges.innerHTML = parts.join(' ');
    }

    const fetchBtn = document.getElementById('bcs-btn-fetch');
    if (fetchBtn && !fetchingQueue) {
      fetchBtn.disabled = pendingList.length === 0;
    }
  }

  // 更新底部就绪状态摘要与主按钮文案
  function updateFooterSummary() {
    const summaryEl = document.getElementById('bcs-footer-summary');
    const startBtn = document.getElementById('bcs-btn-start');
    if (startBtn && !batchRunning && !batchPreparing) {
      startBtn.textContent = getStartButtonLabel();
    }
    if (!summaryEl) return;

    summaryEl.className = 'bcs-footer-summary';
    if (!pendingList.length) {
      summaryEl.textContent = '请先在 Wildberries 页面勾选商品并点击「加入待上架」';
      return;
    }

    const noBoss = pendingList.filter(it => !getItemBossDefaults(it)).length;
    const unfetched = pendingList.filter(it => it.fetched !== true).length;
    const shopCount = (userConfig.selectedShopIds || []).length;

    if (!bossDefaultsFile) {
      summaryEl.classList.add('is-err');
      summaryEl.textContent = '尚未上传价格表，请先在顶部上传 商品价格表.xlsx';
      return;
    }
    if (noBoss > 0) {
      summaryEl.classList.add('is-err');
      summaryEl.textContent = `${noBoss} 个商品未匹配价格表，请先选择已登记前缀码`;
      return;
    }
    if (!shopCount) {
      summaryEl.classList.add('is-err');
      summaryEl.textContent = '请至少勾选 1 个目标店铺';
      return;
    }
    if (unfetched > 0) {
      summaryEl.classList.add('is-warn');
      summaryEl.textContent = `${unfetched} 个商品待抓取详情，请等待抓取完成或点「刷新商品信息」`;
      return;
    }

    const modeText = userConfig.settings.directUpload ? '直接上架' : '存入采集箱';
    const multGroups = getSelectedMultiplierGroups();
    const reqEst = pendingList.length * multGroups.length;
    summaryEl.classList.add('is-ok');
    summaryEl.textContent = `已就绪：${pendingList.length} 个商品 → ${shopCount} 个店铺（${modeText}，约 ${reqEst} 次提交）`;
  }

  // ---- 商品列表渲染 ----
  function renderPendingList() {
    const container = document.getElementById('bcs-pending-list');
    updateListBadges();
    updateFooterSummary();
    if (!container) return;

    if (!pendingList.length) {
      container.innerHTML = '<div class="bcs-empty">待上架列表为空，请在 Wildberries 搜索页勾选商品或在详情页点击「＋当前商品」</div>';
      return;
    }

    const noBossCount = pendingList.filter(it => !getItemBossDefaults(it)).length;
    const alertBar = noBossCount
      ? `<div class="bcs-alert-bar">有 <b>${noBossCount}</b> 个商品未匹配价格表，提交时将被阻止：请在上方「1. 价格表与商品前缀」选择已登记前缀码，或直接修改下方对应行的供应商代码。</div>`
      : '';

    container.innerHTML = `
      ${alertBar}
      <div class="bcs-table-wrap">
        <table class="bcs-pending-table">
          <thead>
            <tr>
              <th class="col-idx">#</th>
              <th class="col-product">商品信息</th>
              <th class="col-code">供应商代码</th>
              <th class="col-sku">规格 / SKU</th>
              <th class="col-minprice">最低售价</th>
              <th class="col-shelfprice">各店铺上架价</th>
              <th class="col-rub">WB 现价(₽)</th>
              <th class="col-dim">包装尺寸</th>
              <th class="col-action">删</th>
            </tr>
          </thead>
          <tbody id="bcs-pending-tbody"></tbody>
        </table>
      </div>
    `;

    const tbody = container.querySelector('#bcs-pending-tbody');
    pendingList.forEach((item, idx) => {
      const tr = document.createElement('tr');
      if (item.fetched !== true) tr.classList.add('row-unfetched');
      tr.dataset.nmId = item.nmId;

      // 1. 序号
      const tdIdx = document.createElement('td');
      tdIdx.className = 'col-idx';
      tdIdx.textContent = String(idx + 1);
      tr.appendChild(tdIdx);

      // 2. 商品信息（缩略图 + nmId 链接 + 标题 + 状态标签）
      const tdProd = document.createElement('td');
      tdProd.className = 'col-product';
      paintProductCell(tdProd, item);
      tr.appendChild(tdProd);

      // 3. 供应商代码（唯一可编辑列，宽输入框可读完整 BCS-XXXX-nmId）
      const tdCode = document.createElement('td');
      tdCode.className = 'col-code';
      const codeInput = document.createElement('input');
      codeInput.type = 'text';
      codeInput.value = item.vendorCode || '';
      codeInput.placeholder = `自动(${userConfig.prefixCode || '随机'})`;
      codeInput.onchange = () => {
        const val = codeInput.value.trim();
        updatePendingItem(item.nmId, 'vendorCode', val);
        item.vendorCode = val;
        paintPriceCells(tr, item);
        updateListBadges();
        updateFooterSummary();
      };
      tdCode.appendChild(codeInput);
      tr.appendChild(tdCode);

      // 4. 规格 / SKU
      const tdSku = document.createElement('td');
      tdSku.className = 'col-sku';
      paintSkuCell(tdSku, item);
      tr.appendChild(tdSku);

      // 5 & 6. 最低售价 + 上架价
      const tdMinPrice = document.createElement('td');
      tdMinPrice.className = 'col-minprice';
      tr.appendChild(tdMinPrice);

      const tdShelfPrice = document.createElement('td');
      tdShelfPrice.className = 'col-shelfprice';
      tr.appendChild(tdShelfPrice);

      // 7. WB 现价/原价
      const tdRub = document.createElement('td');
      tdRub.className = 'col-rub';
      paintRubCell(tdRub, item);
      tr.appendChild(tdRub);

      // 8. 包装尺寸
      const tdDim = document.createElement('td');
      tdDim.className = 'col-dim';
      tr.appendChild(tdDim);

      // 9. 删除按钮
      const tdAction = document.createElement('td');
      tdAction.className = 'col-action';
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-del';
      delBtn.textContent = '×';
      delBtn.title = '从待上架列表移除';
      delBtn.onclick = () => {
        removeFromList(item.nmId);
        renderPendingList();
        updateToolbarCount();
      };
      tdAction.appendChild(delBtn);
      tr.appendChild(tdAction);

      paintPriceCells(tr, item);
      tbody.appendChild(tr);
    });
  }

  function paintProductCell(cell, item) {
    if (!cell) return;
    cell.replaceChildren();

    const wrap = document.createElement('div');
    wrap.className = 'bcs-prod-cell';

    const thumbBox = document.createElement('div');
    thumbBox.className = 'bcs-thumb-box';
    if (item.thumb) {
      const img = document.createElement('img');
      img.className = 'thumb';
      img.alt = '';
      img.onerror = () => { thumbBox.textContent = '无图'; };
      img.src = item.thumb;
      thumbBox.appendChild(img);
    } else {
      thumbBox.textContent = '无图';
    }
    wrap.appendChild(thumbBox);

    const meta = document.createElement('div');
    meta.className = 'bcs-prod-meta';

    const top = document.createElement('div');
    top.className = 'bcs-prod-top';

    const link = document.createElement('a');
    link.className = 'bcs-prod-nm';
    link.href = `https://www.wildberries.ru/catalog/${encodeURIComponent(item.nmId)}/detail.aspx`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = String(item.nmId);
    link.title = `在新标签页打开商品 ${item.nmId}`;
    top.appendChild(link);

    if (item.fetched !== true) {
      const tag = document.createElement('span');
      tag.className = 'bcs-status-tag wait';
      tag.textContent = '待抓取';
      top.appendChild(tag);
    } else if (item.detailSource === 'synthetic') {
      const tag = document.createElement('span');
      tag.className = 'bcs-status-tag syn';
      tag.textContent = '合成';
      tag.title = 'detail 接口抓取失败，已用 card.json 合成数据（规格名占位、无实时现价，售价与包装按价格表提交）';
      top.appendChild(tag);
    }
    meta.appendChild(top);

    const title = document.createElement('div');
    title.className = 'bcs-prod-title';
    const titleText = item.title || (item.fetched ? '（无标题）' : '等待抓取详情...');
    title.textContent = titleText;
    title.title = `${item.nmId}\n${item.title || ''}`;
    meta.appendChild(title);

    wrap.appendChild(meta);
    cell.appendChild(wrap);
  }

  function paintSkuCell(cell, item) {
    if (!cell) return;
    if (item.skus && item.skus.length > 0) {
      const first = item.skus[0];
      let skuText = '';
      if (first.nmId) {
        skuText = first.nmId;
      } else {
        const parts = [];
        if (first.wbSize) parts.push(first.wbSize);
        else if (first.techSize) parts.push(first.techSize);
        if (first.rubPrice) parts.push(`${first.rubPrice}₽`);
        skuText = parts.join(' / ') || '无';
      }

      const allSkuText = item.skus.map((s, idx) => {
        const p = [];
        if (s.nmId) p.push(s.nmId);
        if (s.wbSize) p.push(s.wbSize);
        else if (s.techSize) p.push(s.techSize);
        if (s.rubPrice) p.push(`${s.rubPrice}₽`);
        return `#${idx + 1}: ${p.join(' / ')}`;
      }).join('\n');

      const subParts = [];
      if (item.skus.length > 1) subParts.push(`<b>${item.skus.length} 规格</b>`);
      if (item.colors && item.colors.length > 1) subParts.push(`${item.colors.length} 色`);

      cell.innerHTML =
        `<div class="bcs-sku-main" title="${escHtml(allSkuText)}">${escHtml(skuText)}</div>` +
        (subParts.length ? `<div class="bcs-sku-sub">${subParts.join(' · ')}</div>` : '');
    } else {
      cell.innerHTML = '<span style="color:#d1d5db;">—</span>';
    }
  }

  function paintRubCell(cell, item) {
    if (!cell) return;
    const cur = item.currentPrice || '—';
    const old = item.originalPrice || '';
    cell.innerHTML = `<div>${escHtml(cur)}</div>` +
      (old ? `<div class="bcs-rub-old">${escHtml(old)}</div>` : '');
  }

  // 价格/包装只读渲染（待上架列表与抓取后局部刷新共用）
  function paintPriceCells(tr, item) {
    if (!tr) return;
    const boss = getItemBossDefaults(item);
    const minPriceCell = tr.querySelector('.col-minprice');
    const shelfCell = tr.querySelector('.col-shelfprice');
    const dimCell = tr.querySelector('.col-dim');

    if (!boss) {
      tr.classList.add('row-no-boss');
      if (minPriceCell) minPriceCell.innerHTML = '<span class="bcs-warn-text">—</span>';
      if (shelfCell) {
        const prefixState = userConfig.prefixCode
          ? `前缀码 ${userConfig.prefixCode} 未在价格表登记`
          : '前缀码为自动随机生成（不参与价格表归属）';
        const tip = `未匹配价格表：${prefixState}；本行供应商代码 ${item.vendorCode || '（空，上架时自动生成）'}`;
        shelfCell.innerHTML = `<span class="bcs-warn-text" title="${escHtml(tip)}">未匹配价格表</span>`;
      }
      if (dimCell) dimCell.innerHTML = '<span class="bcs-warn-text">—</span>';
      return;
    }

    tr.classList.remove('row-no-boss');
    if (minPriceCell) minPriceCell.textContent = `¥${boss.minPrice}`;
    if (shelfCell) {
      const groups = getSelectedMultiplierGroups();
      shelfCell.innerHTML = groups.map(g => {
        const price = formatShelvePrice(boss.minPrice, g.mult, userConfig.settings.directUpload);
        const cnt = g.shopCount ? ` · ${g.shopCount}店` : '';
        const cls = g.shopCount ? 'bcs-price-line' : 'bcs-price-line bcs-price-line-idle';
        return `<div class="${cls}"><span class="bcs-price-tag">×${g.mult}${cnt}</span><b>¥${price}</b></div>`;
      }).join('');
    }
    if (dimCell) {
      dimCell.innerHTML =
        `<div class="bcs-dim-size">${boss.length}×${boss.width}×${boss.height} cm</div>` +
        `<div class="bcs-dim-weight">${boss.weight} kg</div>`;
    }
  }

  // ---- 批量抓取商品详情（手动刷新按钮）----
  async function onFetchDetails() {
    if (!pendingList.length) { showToast('待上架列表为空', 2500); return; }
    if (fetchingQueue) { showToast('已有抓取任务进行中，请稍候', 2500); return; }
    const toFetch = pendingList.filter(it => it.fetched !== true);
    if (!toFetch.length) {
      showToast('所有商品信息已获取，无需刷新', 3000);
      return;
    }
    fetchingQueue = true;
    const btn = document.getElementById('bcs-btn-fetch');
    const info = document.getElementById('bcs-fetch-info');
    if (btn) btn.disabled = true;

    try {
      const { ok, fail, synthetic } = await fetchItemsBatch(toFetch, (text) => {
        if (info) info.textContent = text;
      });

      const skipped = pendingList.length - toFetch.length;
      const doneText = `抓取完成：成功 ${ok} 个` +
        (synthetic > 0 ? `（含合成 ${synthetic} 个）` : '') +
        (fail > 0 ? `，失败 ${fail} 个` : '') +
        (skipped > 0 ? `，跳过已抓 ${skipped} 个` : '');
      if (info) info.textContent = doneText;
      showToast(doneText, 4000);
    } finally {
      if (btn) btn.disabled = pendingList.length === 0;
      fetchingQueue = false;
      updateListBadges();
      updateFooterSummary();
    }
  }
