  // ============================================================
  // 12. 待上架列表面板
  // ============================================================
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
        <h3>待上架列表 <span id="bcs-panel-count" style="font-weight:normal;font-size:13px;">(0)</span></h3>
        <button class="bcs-panel-close" id="bcs-panel-close">×</button>
      </div>
      <div class="bcs-panel-body" id="bcs-panel-body"></div>
      <div class="bcs-progress" id="bcs-progress" style="display:none;"></div>
      <div class="bcs-panel-footer">
        <button class="bcs-btn-clear-list" id="bcs-btn-clear-list">清空列表</button>
        <button class="bcs-btn-start" id="bcs-btn-start">一键全部上架</button>
      </div>
    `;
    document.body.appendChild(panelMask);
    document.body.appendChild(panelEl);

    document.getElementById('bcs-panel-close').onclick = closePanel;
    document.getElementById('bcs-btn-clear-list').onclick = () => {
      if (!pendingList.length) { alert('列表已为空'); return; }
      if (!confirm(`确认清空 ${pendingList.length} 个待上架商品？`)) return;
      clearList();
      renderPendingList();
      updateToolbarCount();
    };
    document.getElementById('bcs-btn-start').onclick = onStartBatch;

    renderPanelBody();
  }

  function closePanel() {
    if (panelMask) { panelMask.remove(); panelMask = null; }
    if (panelEl) { panelEl.remove(); panelEl = null; }
  }

  function renderPanelBody() {
    const body = document.getElementById('bcs-panel-body');
    if (!body) return;
    body.innerHTML = '';

    // --- 商品列表区 ---
    const listSection = document.createElement('div');
    listSection.className = 'bcs-section';
    listSection.innerHTML = `
      <div class="bcs-section-title">
        <span>商品列表</span>
        <span id="bcs-list-count" style="font-weight:normal;font-size:12px;color:#888;">0 个</span>
      </div>
      <div class="bcs-section-body" id="bcs-pending-list" style="max-height:420px;overflow-y:auto;padding:0;"></div>
    `;
    body.appendChild(listSection);

    // --- 上货方式区 ---
    const modeSection = document.createElement('div');
    modeSection.className = 'bcs-section';
    modeSection.innerHTML = `
      <div class="bcs-section-title"><span>上货方式</span></div>
      <div class="bcs-section-body" id="bcs-mode-body"></div>
    `;
    body.appendChild(modeSection);
    renderModeSettings();

    // --- 店铺设置区 ---
    const shopSection = document.createElement('div');
    shopSection.className = 'bcs-section';
    shopSection.innerHTML = `
      <div class="bcs-section-title">
        <span>店铺选择</span>
        <span style="font-weight:normal;font-size:11px;color:#888;">仓库 / 库存 / 上架倍数（各店铺记忆）</span>
        <button id="bcs-refresh-shops" style="padding:2px 10px;font-size:11px;border:1px solid #ccc;border-radius:3px;background:#f5f5f5;cursor:pointer;">刷新店铺</button>
      </div>
      <div class="bcs-section-body" id="bcs-shop-body" style="max-height:240px;overflow-y:auto;"></div>
    `;
    body.appendChild(shopSection);
    document.getElementById('bcs-refresh-shops').onclick = () => renderShopList(true);

    // --- 价格表与上架价区（★ v1.9.0：价格单一口径 = 价格表最低售价 × 店铺倍数）---
    const priceSection = document.createElement('div');
    priceSection.className = 'bcs-section';
    priceSection.innerHTML = `
      <div class="bcs-section-title">
        <span>价格表与上架价</span>
        <span style="font-weight:normal;font-size:11px;color:#888;">上架价 = 最低售价 × 店铺倍数</span>
      </div>
      <div class="bcs-section-body" id="bcs-price-body"></div>
    `;
    body.appendChild(priceSection);
    renderPriceSettings();

    renderPendingList();
    renderShopList();
  }

  // ---- 商品列表渲染（表格形式，可编辑）----
  function renderPendingList() {
    const container = document.getElementById('bcs-pending-list');
    const countEl = document.getElementById('bcs-list-count');
    const headerCount = document.getElementById('bcs-panel-count');
    if (!container) return;

    if (countEl) countEl.textContent = `${pendingList.length} 个`;
    if (headerCount) headerCount.textContent = `(${pendingList.length})`;

    if (!pendingList.length) {
      container.innerHTML = '<div class="bcs-empty">列表为空，请在搜索页或详情页添加商品</div>';
      return;
    }

    // 表格头（★ v1.9.0：价格/包装改为只读展示，价 = 价格表最低售价 × 店铺倍数）
    const noBossCount = pendingList.filter(it => !getItemBossDefaults(it)).length;
    const alertBar = noBossCount
      ? `<div class="bcs-alert-bar">⚠️ ${noBossCount} 个商品未匹配价格表（前缀码未登记 / 自动随机生成），<b>将被阻止上架</b>：请在下方「价格表与上架价」选择已登记前缀码，或把供应商代码改成已登记的 BCS-XXXX-nmId。</div>`
      : '';
    container.innerHTML = `
      ${alertBar}
      <table class="bcs-pending-table">
        <thead>
          <tr>
            <th class="col-idx">#</th>
            <th class="col-img">图片</th>
            <th class="col-code">供应商代码</th>
            <th class="col-sku">SKU变体</th>
            <th class="col-minprice">最低售价(¥)</th>
            <th class="col-shelfprice">上架价(最低售价×店铺倍数)</th>
            <th class="col-rub">现价/原价(P)</th>
            <th class="col-dim">包装(L×W×H×kg)</th>
            <th class="col-action">删除</th>
          </tr>
        </thead>
        <tbody id="bcs-pending-tbody"></tbody>
      </table>
      <div class="bcs-fetch-status" id="bcs-fetch-status">
        <button class="bcs-btn-fetch" id="bcs-btn-fetch">刷新商品信息</button>
        <span id="bcs-fetch-info" style="margin-left:8px;"></span>
      </div>
    `;

    const tbody = container.querySelector('#bcs-pending-tbody');
    pendingList.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.className = item.fetched ? 'row-fetched-true' : '';
      tr.dataset.nmId = item.nmId;

      // 序号
      const tdIdx = document.createElement('td');
      tdIdx.className = 'col-idx';
      // ★ v1.7.0 合成 detail 角标：detail 抓取失败、card.json 合成数据的商品明确标注（不静默）
      tdIdx.innerHTML = String(idx + 1) + (item.detailSource === 'synthetic'
        ? '<span class="bcs-syn-badge" style="display:inline-block;margin-left:4px;padding:0 4px;font-size:10px;line-height:16px;background:#e6a23c;color:#fff;border-radius:3px;vertical-align:middle;cursor:help;" '
          + 'title="detail 抓取失败，使用 card.json 合成数据（规格名占位、无实时现价；售价/尺寸/重量用生效值）">合</span>'
        : '');
      tr.appendChild(tdIdx);

      const tdImg = document.createElement('td');
      tdImg.className = 'col-img';
      paintProductThumbnail(tdImg, item);
      tr.appendChild(tdImg);

      // 供应商代码
      const tdCode = document.createElement('td');
      tdCode.className = 'col-code';
      const codeInput = document.createElement('input');
      codeInput.type = 'text';
      codeInput.value = item.vendorCode || '';
      // ★ v1.5.0：placeholder 提示当前前缀码状态（选前缀码→自动用前缀码，否则随机）
      codeInput.placeholder = `自动(${userConfig.prefixCode || '随机'})`;
      codeInput.onchange = () => {
        updatePendingItem(item.nmId, 'vendorCode', codeInput.value.trim());
        item.vendorCode = codeInput.value.trim();
        // ★ v1.9.0：供应商代码决定价格表归属 → 改完即时重算本行价格/包装（不整表重绘，避免丢焦点）
        paintPriceCells(tr, item);
      };
      tdCode.appendChild(codeInput);
      tr.appendChild(tdCode);

      // SKU 变体（只读，只显示第一个变体的 nmId，tooltip 显示全部）
      const tdSku = document.createElement('td');
      tdSku.className = 'col-sku';
      if (item.skus && item.skus.length > 0) {
        const first = item.skus[0];
        // 优先显示 SKU 代码（nmId），用户需求：只需要上架第一个 SKU
        let skuText = '';
        // 如果有 nmId 字段，直接显示
        if (first.nmId) {
          skuText = first.nmId;
        } else {
          // 否则用 wbSize/techSize 组合
          const parts = [];
          if (first.wbSize) parts.push(first.wbSize);
          else if (first.techSize) parts.push(first.techSize);
          if (first.rubPrice) parts.push(`${first.rubPrice}P`);
          skuText = parts.join(' / ') || '无';
        }

        // tooltip 显示所有变体的详细信息
        const allSkuText = item.skus.map((s, idx) => {
          const p = [];
          if (s.nmId) p.push(s.nmId);
          if (s.wbSize) p.push(s.wbSize);
          else if (s.techSize) p.push(s.techSize);
          if (s.rubPrice) p.push(`${s.rubPrice}P`);
          return `#${idx + 1}: ${p.join(' / ')}`;
        }).join('\n');

        tdSku.innerHTML = `<div class="sku-list" title="${allSkuText}" style="font-size:12px;color:#333;">${skuText}</div>`;
        // 如果有多个变体，标注数量
        if (item.skus.length > 1) {
          const cnt = document.createElement('div');
          cnt.style.cssText = 'font-size:10px;color:#409eff;margin-top:2px;';
          cnt.textContent = `共 ${item.skus.length} 个变体`;
          tdSku.appendChild(cnt);
        }
      } else {
        tdSku.innerHTML = '<span style="color:#ccc;">未抓取</span>';
      }
      // 同款多色提示
      if (item.colors && item.colors.length > 1) {
        const colors = document.createElement('div');
        colors.style.cssText = 'font-size:10px;color:#999;margin-top:2px;';
        colors.textContent = `${item.colors.length} 色`;
        tdSku.appendChild(colors);
      }
      tr.appendChild(tdSku);

      // 最低售价 + 上架价（★ v1.9.0：只读。上架价 = 价格表最低售价 × 各店铺倍数，由 paintPriceCells 统一渲染）
      const tdMinPrice = document.createElement('td');
      tdMinPrice.className = 'col-minprice';
      tr.appendChild(tdMinPrice);

      const tdShelfPrice = document.createElement('td');
      tdShelfPrice.className = 'col-shelfprice';
      tr.appendChild(tdShelfPrice);

      // 现价/原价(P)
      const tdRub = document.createElement('td');
      tdRub.className = 'col-rub';
      const cur = item.currentPrice || '--';
      const old = item.originalPrice || '--';
      tdRub.innerHTML = `<div>${cur}</div><div style="text-decoration:line-through;color:#aaa;">${old}</div>`;
      tr.appendChild(tdRub);

      // 包装尺寸 + 重量（★ v1.9.0：只读，一律取价格表；不再支持逐行手填 / 全局默认值）
      const tdDim = document.createElement('td');
      tdDim.className = 'col-dim';
      tr.appendChild(tdDim);

      // 删除按钮
      const tdAction = document.createElement('td');
      tdAction.className = 'col-action';
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-del';
      delBtn.textContent = '×';
      delBtn.title = '删除此商品';
      delBtn.onclick = () => {
        removeFromList(item.nmId);
        renderPendingList();
        updateToolbarCount();
      };
      tdAction.appendChild(delBtn);
      tr.appendChild(tdAction);

      // ★ v1.9.0：最低售价 / 上架价 / 包装 三格统一由 paintPriceCells 渲染（与 updateItemRow 共用，杜绝漂移）
      paintPriceCells(tr, item);

      tbody.appendChild(tr);
    });

    // 绑定"刷新商品信息"按钮（★ v1.9.0：「一键补充数据」已删除 —— 价格/尺寸全只读，无可补内容）
    const fetchBtn = container.querySelector('#bcs-btn-fetch');
    if (fetchBtn) fetchBtn.onclick = onFetchDetails;
  }

  function paintProductThumbnail(cell, item) {
    if (!cell) return;
    cell.title = `nmId: ${item.nmId}\n${item.title || ''}`;
    cell.replaceChildren();
    if (!item.thumb) {
      const placeholder = document.createElement('span');
      placeholder.style.color = '#ccc';
      placeholder.textContent = '无图';
      cell.appendChild(placeholder);
      return;
    }
    const img = document.createElement('img');
    img.className = 'thumb';
    img.alt = '';
    img.onerror = () => { img.style.display = 'none'; };
    img.src = item.thumb;
    cell.appendChild(img);
  }

  // ★ v1.9.0 价格/包装只读渲染（待上架列表与抓取后局部刷新共用）
  //   - 有价格表条目：最低售价原值 + 按「当前已选店铺实际用到的倍数」逐行显示上架价 + 包装尺寸重量
  //   - 无价格表条目：红字「未匹配价格表」+ 整行红底告警（这类商品会被预校验阻止上架）
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
        shelfCell.innerHTML = `<span class="bcs-warn-text" title="${tip}">未匹配价格表</span>`;
      }
      if (dimCell) dimCell.innerHTML = '<span class="bcs-warn-text">—</span>';
      return;
    }

    tr.classList.remove('row-no-boss');
    if (minPriceCell) minPriceCell.textContent = String(boss.minPrice);
    if (shelfCell) {
      const groups = getSelectedMultiplierGroups();   // [{mult, shopCount}]
      shelfCell.innerHTML = groups.map(g => {
        const price = formatShelvePrice(boss.minPrice, g.mult, userConfig.settings.directUpload);
        const cnt = g.shopCount ? `（${g.shopCount}店）` : '';
        const cls = g.shopCount ? 'bcs-price-line' : 'bcs-price-line bcs-price-line-idle';
        return `<div class="${cls}"><span>×${g.mult}${cnt}</span><b>${price}</b></div>`;
      }).join('');
    }
    if (dimCell) {
      dimCell.innerHTML = `<span class="bcs-dim-text">${boss.length}×${boss.width}×${boss.height} / ${boss.weight}kg</span>`;
    }
  }

  // ---- 批量抓取商品详情（手动刷新按钮）----
  // ★ 仅抓取未成功获取商品信息的商品（fetched !== true），避免重复抓取
  // ★ v1.4.1：改为 detail 合并请求 + 失败不再重试
  async function onFetchDetails() {
    if (!pendingList.length) { alert('列表为空'); return; }
    if (fetchingQueue) { alert('已有抓取任务进行中，请等待完成'); return; }
    // 筛选未成功抓取的商品
    const toFetch = pendingList.filter(it => it.fetched !== true);
    if (!toFetch.length) {
      showToast('所有商品信息已获取，无需刷新', 3000);
      return;
    }
    fetchingQueue = true;  // ★ Bug H1 修复：设置标志，防止与 autoFetchItems 并发
    const btn = document.getElementById('bcs-btn-fetch');
    const info = document.getElementById('bcs-fetch-info');
    if (btn) btn.disabled = true;

    try {
      const { ok, fail, synthetic } = await fetchItemsBatch(toFetch, (text) => {
        if (info) info.textContent = text;
      });

      const skipped = pendingList.length - toFetch.length;
      const doneText = `完成：成功 ${ok} 个（其中合成数据 ${synthetic} 个），失败 ${fail} 个` +
                       (skipped > 0 ? `（已跳过 ${skipped} 个已获取的商品）` : '');
      if (info) info.textContent = doneText;
      showToast(doneText, 4000);
    } finally {
      // ★ Bug M6 修复：确保异常时也恢复状态
      if (btn) btn.disabled = false;
      fetchingQueue = false;
    }
  }

