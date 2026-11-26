  // ---- 上架选项设置（紧凑单行条：方式 / 品牌 / 同款合并 / 提交间隔） ----
  function renderModeSettings() {
    const body = document.getElementById('bcs-mode-body');
    if (!body) return;
    body.innerHTML = '';

    const strip = document.createElement('div');
    strip.className = 'bcs-mode-strip';

    strip.appendChild(createToggleGroup('上架方式', [
      { label: '直接上架', value: true },
      { label: '存入采集箱', value: false },
    ], userConfig.settings.directUpload, (v) => {
      userConfig.settings.directUpload = v;
      saveConfig(userConfig);
      if (panelEl) renderPendingList();
    }));

    strip.appendChild(createToggleGroup('原品牌', [
      { label: '不携带', value: false },
      { label: '携带', value: true },
    ], userConfig.settings.carryBrand, (v) => {
      userConfig.settings.carryBrand = v;
      saveConfig(userConfig);
    }));

    strip.appendChild(createToggleGroup('同款多色', [
      { label: '不合并', value: true },
      { label: '合并', value: false },
    ], userConfig.settings.noMerge, (v) => {
      userConfig.settings.noMerge = v;
      saveConfig(userConfig);
    }));

    const intervalWrap = document.createElement('div');
    intervalWrap.className = 'bcs-interval-wrap';
    intervalWrap.title = '不同倍数的店铺会分组提交（请求数 = 商品数 × 倍数种类数），每次请求之间等待该秒数';
    intervalWrap.innerHTML = `
      <label for="bcs-interval">提交间隔</label>
      <input type="number" id="bcs-interval" value="${userConfig.intervalMs / 1000}" min="1" step="1">
      <span>秒</span>
    `;
    strip.appendChild(intervalWrap);
    body.appendChild(strip);

    const intervalInput = document.getElementById('bcs-interval');
    if (intervalInput) {
      intervalInput.onchange = (e) => {
        const sec = Math.max(1, Number(e.target.value) || 2);
        e.target.value = String(sec);
        userConfig.intervalMs = sec * 1000;
        saveConfig(userConfig);
      };
    }
  }

  function createToggleGroup(label, options, currentValue, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'bcs-toggle-group';
    const lbl = document.createElement('span');
    lbl.className = 'bcs-toggle-label';
    lbl.textContent = label;
    wrap.appendChild(lbl);
    const btnWrap = document.createElement('div');
    btnWrap.className = 'bcs-toggle-btns';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bcs-toggle-btn' + (opt.value === currentValue ? ' active' : '');
      btn.textContent = opt.label;
      btn.onclick = () => {
        btnWrap.querySelectorAll('.bcs-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onChange(opt.value);
      };
      btnWrap.appendChild(btn);
    });
    wrap.appendChild(btnWrap);
    return wrap;
  }

  // ---- 店铺列表渲染（默认全选 + 默认莫斯科仓库 + 库存 999 + 一键切倍数） ----
  function renderShopMessage(body, message, offerLogin) {
    const notice = document.createElement('div');
    notice.className = 'bcs-empty';
    notice.textContent = message;
    if (offerLogin) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bcs-btn-accent';
      button.style.marginLeft = '10px';
      button.textContent = '打开 BCS 登录页';
      button.onclick = openBcsLogin;
      notice.append(' ', button);
    }
    body.replaceChildren(notice);
  }

  function updateShopCountPill(total) {
    const pill = document.getElementById('bcs-shop-count-pill');
    if (!pill) return;
    const selected = (userConfig.selectedShopIds || []).length;
    if (!total) {
      pill.className = 'bcs-pill bcs-pill-muted';
      pill.textContent = '0 个店铺';
    } else if (!selected) {
      pill.className = 'bcs-pill bcs-pill-err';
      pill.textContent = `未选店铺（共 ${total} 店）`;
    } else {
      pill.className = 'bcs-pill bcs-pill-info';
      pill.textContent = `已选 ${selected} / ${total} 店`;
    }
  }

  async function renderShopList(forceRefresh = false) {
    const body = document.getElementById('bcs-shop-body');
    if (!body) return;
    body.innerHTML = '<div class="bcs-empty">正在加载店铺列表...</div>';

    try {
      if (forceRefresh || !shopsCache) {
        shopsCache = await getShops(forceRefresh);
        shopsAutoSelected = false;
      }
      const shops = shopsCache;
      if (!shops || !shops.length) {
        updateShopCountPill(0);
        renderShopMessage(body, '未绑定店铺，请先登录 BCS 网站并绑定店铺。', true);
        updateFooterSummary();
        return;
      }

      // 首次加载时自动勾选全部店铺 + 库存 999 + 上架倍数默认 ×2
      if (!shopsAutoSelected) {
        for (const shop of shops) {
          if (!userConfig.selectedShopIds.includes(shop.id)) {
            userConfig.selectedShopIds.push(shop.id);
          }
          if (!userConfig.shopConfigs[shop.id]) {
            userConfig.shopConfigs[shop.id] = { warehouseId: null, quantity: 999, priceMultiplier: 2 };
          } else if (userConfig.shopConfigs[shop.id].quantity == null) {
            userConfig.shopConfigs[shop.id].quantity = 999;
          }
          if (userConfig.shopConfigs[shop.id].priceMultiplier == null) {
            userConfig.shopConfigs[shop.id].priceMultiplier = 2;
          }
        }
        const validIDs = new Set(shops.map(s => s.id));
        userConfig.selectedShopIds = userConfig.selectedShopIds.filter(id => validIDs.has(id));
        saveConfig(userConfig);
        shopsAutoSelected = true;
      }

      updateShopCountPill(shops.length);
      updateFooterSummary();

      const wrap = document.createElement('div');
      wrap.className = 'bcs-shop-wrap';
      wrap.innerHTML = `
        <div class="bcs-shop-head">
          <span></span>
          <span>店铺名称</span>
          <span>发货仓库</span>
          <span style="text-align:center;">库存</span>
          <span style="text-align:center;">上架倍数</span>
        </div>
      `;
      body.replaceChildren(wrap);

      const rowsMap = new Map();
      for (const shop of shops) {
        const cfg = userConfig.shopConfigs[shop.id] || { warehouseId: null, quantity: 999, priceMultiplier: 2 };
        const isSelected = userConfig.selectedShopIds.includes(shop.id);
        const curMult = normalizePriceMultiplier(cfg.priceMultiplier);
        const row = document.createElement('div');
        row.className = 'bcs-shop-row' + (isSelected ? '' : ' is-unchecked');
        row.innerHTML = `
          <input type="checkbox" data-shopid="${escHtml(shop.id)}" ${isSelected ? 'checked' : ''}>
          <span class="bcs-shop-name" title="${escHtml(shop.shopName)}">${escHtml(shop.shopName)}</span>
          <select data-shopid="${escHtml(shop.id)}" data-field="warehouse" title="发货仓库" ${!isSelected ? 'disabled' : ''}>
            <option value="">${isSelected ? '加载中...' : '请选择发货仓'}</option>
          </select>
          <input type="number" data-shopid="${escHtml(shop.id)}" data-field="qty" value="${cfg.quantity != null ? cfg.quantity : 999}" min="0" title="上架库存" ${!isSelected ? 'disabled' : ''}>
          <div class="bcs-mult-group" data-field="mult" title="上架价 = 价格表最低售价 × 倍数">
            ${PRICE_MULTIPLIERS.map(m => {
              const cls = ['bcs-mult-btn'];
              if (curMult === m) cls.push('active');
              if (m === 5) cls.push('mult-high');
              if (m >= 10) cls.push('mult-max');
              return `<button type="button" class="${cls.join(' ')}" data-mult="${m}" ${!isSelected ? 'disabled' : ''}>×${m}</button>`;
            }).join('')}
          </div>
        `;
        wrap.appendChild(row);
        rowsMap.set(shop.id, {
          row, shop, cfg,
          cb: row.querySelector('input[type="checkbox"]'),
          nameEl: row.querySelector('.bcs-shop-name'),
          whSelect: row.querySelector('select[data-field="warehouse"]'),
          qtyInput: row.querySelector('input[data-field="qty"]'),
          multBtns: Array.from(row.querySelectorAll('.bcs-mult-btn')),
        });
      }

      async function loadShopWarehouse(entry) {
        const { shop, cfg, whSelect } = entry;
        if (shop.warehouses && shop.warehouses.length) {
          fillWarehouseOptions(whSelect, shop, cfg);
          autoSelectMoscow(whSelect, shop, cfg);
          return;
        }
        whSelect.innerHTML = '<option value="">加载中...</option>';
        try {
          const updated = await ensureWarehouses(shop.id);
          if (updated) shop.warehouses = updated.warehouses;
          fillWarehouseOptions(whSelect, shop, cfg);
          autoSelectMoscow(whSelect, shop, cfg);
        } catch (e) {
          whSelect.innerHTML = '<option value="">加载失败</option>';
        }
      }

      function applyRowSelectedState(entry, checked) {
        entry.cb.checked = checked;
        entry.row.classList.toggle('is-unchecked', !checked);
        entry.whSelect.disabled = !checked;
        entry.qtyInput.disabled = !checked;
        entry.multBtns.forEach(b => { b.disabled = !checked; });
      }

      // 绑定单个店铺行事件
      for (const entry of rowsMap.values()) {
        const { shop, cfg, cb, nameEl, whSelect, qtyInput, multBtns } = entry;

        nameEl.onclick = () => {
          cb.checked = !cb.checked;
          cb.onchange();
        };

        cb.onchange = async () => {
          if (cb.checked) {
            if (!userConfig.selectedShopIds.includes(shop.id)) {
              userConfig.selectedShopIds.push(shop.id);
            }
            applyRowSelectedState(entry, true);
            await loadShopWarehouse(entry);
          } else {
            userConfig.selectedShopIds = userConfig.selectedShopIds.filter(id => id !== shop.id);
            applyRowSelectedState(entry, false);
          }
          saveConfig(userConfig);
          updateShopCountPill(shops.length);
          if (panelEl) renderPendingList();
        };

        whSelect.onchange = () => {
          if (!userConfig.shopConfigs[shop.id]) userConfig.shopConfigs[shop.id] = {};
          userConfig.shopConfigs[shop.id].warehouseId = whSelect.value ? Number(whSelect.value) : null;
          userConfig.shopConfigs[shop.id].warehouseLocked = true;
          saveConfig(userConfig);
        };

        qtyInput.onchange = () => {
          if (!userConfig.shopConfigs[shop.id]) userConfig.shopConfigs[shop.id] = {};
          try {
            userConfig.shopConfigs[shop.id].quantity = normalizeWarehouseQuantity(qtyInput.value);
            saveConfig(userConfig);
          } catch (error) {
            qtyInput.value = cfg.quantity == null ? 999 : cfg.quantity;
            showToast(error.message, 4000);
          }
        };

        multBtns.forEach(btn => {
          btn.onclick = () => {
            const mult = normalizePriceMultiplier(btn.dataset.mult);
            if (!userConfig.shopConfigs[shop.id]) userConfig.shopConfigs[shop.id] = {};
            userConfig.shopConfigs[shop.id].priceMultiplier = mult;
            saveConfig(userConfig);
            multBtns.forEach(b => b.classList.toggle('active', Number(b.dataset.mult) === mult));
            if (panelEl) renderPendingList();
          };
        });
      }

      // 绑定「全选 / 全不选」
      const allBtn = document.getElementById('bcs-shops-all');
      if (allBtn) {
        allBtn.onclick = async () => {
          userConfig.selectedShopIds = shops.map(s => s.id);
          saveConfig(userConfig);
          for (const entry of rowsMap.values()) applyRowSelectedState(entry, true);
          updateShopCountPill(shops.length);
          if (panelEl) renderPendingList();
          for (const entry of rowsMap.values()) {
            await loadShopWarehouse(entry);
          }
        };
      }
      const noneBtn = document.getElementById('bcs-shops-none');
      if (noneBtn) {
        noneBtn.onclick = () => {
          userConfig.selectedShopIds = [];
          saveConfig(userConfig);
          for (const entry of rowsMap.values()) applyRowSelectedState(entry, false);
          updateShopCountPill(shops.length);
          if (panelEl) renderPendingList();
        };
      }

      // 串行加载已选店铺的仓库（避免并发导致选错）
      for (const shop of shops) {
        if (!userConfig.selectedShopIds.includes(shop.id)) continue;
        const entry = rowsMap.get(shop.id);
        if (!entry) continue;
        await loadShopWarehouse(entry);
        await new Promise(r => setTimeout(r, 50));
      }
    } catch (e) {
      updateShopCountPill(0);
      renderShopMessage(body, '加载失败：' + e.message, e.message.includes(BCS_LOGIN_URL));
      updateFooterSummary();
    }
  }

  // 自动选莫斯科仓库（用户未手动锁定过时，自动纠正为莫斯科）
  function autoSelectMoscow(select, shop, cfg) {
    if (cfg.warehouseLocked === true && cfg.warehouseId) {
      const opt = select.querySelector(`option[value="${cfg.warehouseId}"]`);
      if (opt) opt.selected = true;
      return;
    }
    const moscow = findMoscowWarehouse(shop.warehouses);
    if (moscow) {
      const opt = select.querySelector(`option[value="${moscow.id}"]`);
      if (opt) opt.selected = true;
      if (!userConfig.shopConfigs[shop.id]) userConfig.shopConfigs[shop.id] = {};
      userConfig.shopConfigs[shop.id].warehouseId = Number(moscow.id);
      saveConfig(userConfig);
    } else if (cfg.warehouseId) {
      if (!userConfig.shopConfigs[shop.id]) userConfig.shopConfigs[shop.id] = {};
      userConfig.shopConfigs[shop.id].warehouseId = null;
      saveConfig(userConfig);
    }
  }

  function fillWarehouseOptions(select, shop, cfg) {
    if (!shop.warehouses || !shop.warehouses.length) {
      select.innerHTML = '<option value="">无可用仓库</option>';
      return;
    }
    const current = cfg.warehouseId ? String(cfg.warehouseId) : '';
    select.innerHTML = '<option value="">请选择发货仓...</option>' +
      shop.warehouses.map(w => (
        `<option value="${escHtml(w.id)}" ${String(w.id) === current ? 'selected' : ''}>${escHtml(w.name)}</option>`
      )).join('');
  }

  // ---- 价格表与商品前缀码设置 ----
  function renderPriceSettings() {
    const body = document.getElementById('bcs-price-body');
    const statusEl = document.getElementById('bcs-price-status');
    const actionsEl = document.getElementById('bcs-price-actions');
    if (!body) return;

    // 1) 头部状态徽标
    if (statusEl) {
      if (bossDefaultsFile) {
        const { count, fileName, updatedAt } = bossDefaultsFile;
        const date = new Date(updatedAt).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
        statusEl.innerHTML =
          `<span class="bcs-pill bcs-pill-ok">✓ 已加载 ${count} 条</span> ` +
          `<span class="bcs-section-sub">${escHtml(fileName)} · ${escHtml(date)}</span>`;
      } else {
        statusEl.innerHTML = '<span class="bcs-pill bcs-pill-warn">未上传价格表</span>';
      }
    }

    // 2) 头部上传按钮
    function summarizeWarnings(warnings) {
      return warnings?.length
        ? `\n已跳过 ${warnings.length} 行（最多显示 5 条）\n${warnings.slice(0, 5).join('\n')}`
        : '';
    }

    if (actionsEl) {
      actionsEl.innerHTML = `
        <button type="button" class="bcs-btn-accent" id="bcs-upload-xlsx">${bossDefaultsFile ? '更新价格表 (.xlsx)' : '上传价格表 (.xlsx)'}</button>
        <input type="file" id="bcs-upload-xlsx-input" accept=".xlsx" hidden>
      `;
      const uploadButton = actionsEl.querySelector('#bcs-upload-xlsx');
      const fileInput = actionsEl.querySelector('#bcs-upload-xlsx-input');
      uploadButton.onclick = () => fileInput.click();
      fileInput.onchange = async () => {
        const file = fileInput.files[0];
        fileInput.value = '';
        if (!file) return;

        uploadButton.disabled = true;
        try {
          if (!/\.xlsx$/i.test(file.name)) throw new Error('请选择 .xlsx 文件');
          const parsed = parseBossDefaultsWorkbook(await file.arrayBuffer());
          await saveBossDefaults(file.name, parsed);
          refreshBossDefaults();

          const message = `已加载 ${parsed.entries.length} 条价格数据`;
          if (parsed.warnings.length) alert(message + summarizeWarnings(parsed.warnings));
          else showToast(message);
        } catch (error) {
          alert('上传价格表失败：' + error.message + summarizeWarnings(error.warnings));
        } finally {
          uploadButton.disabled = false;
        }
      };
    }

    // 3) 主体：搜索框 + 前缀下拉 + 实时匹配详情/告警条
    body.innerHTML = `
      <div class="bcs-prefix-grid">
        <div class="bcs-input-group">
          <label for="bcs-prefix-search">筛选</label>
          <input type="text" id="bcs-prefix-search" class="bcs-control w-search" placeholder="输入中文名 / 前缀码 / SKU">
        </div>
        <div class="bcs-input-group grow">
          <label for="bcs-prefix-code" id="bcs-prefix-label">商品前缀码</label>
          <select id="bcs-prefix-code" class="bcs-control flex-1"></select>
          <input type="text" id="bcs-prefix-code-input" class="bcs-control w-custom" maxlength="4" placeholder="4位字母" style="display:none;">
        </div>
      </div>
      <div id="bcs-prefix-feedback" class="bcs-match-bar"></div>
    `;

    const prefixSearch = document.getElementById('bcs-prefix-search');
    const prefixLabel = document.getElementById('bcs-prefix-label');
    const prefixSelect = document.getElementById('bcs-prefix-code');
    const prefixInput = document.getElementById('bcs-prefix-code-input');
    const feedbackEl = document.getElementById('bcs-prefix-feedback');

    function updatePrefixFeedback() {
      const cur = userConfig.prefixCode || '';
      if (!bossDefaultsFile) {
        feedbackEl.className = 'bcs-match-bar info';
        feedbackEl.innerHTML = '<span>请先点击右上角「上传价格表 (.xlsx)」，上传后即可按中文名或前缀码匹配售价和包装尺寸。</span>';
        return;
      }
      const boss = cur ? getBossDefaults(cur) : null;
      if (boss) {
        feedbackEl.className = 'bcs-match-bar ok';
        feedbackEl.innerHTML =
          `<span>已匹配 <b>${escHtml(cur)} · ${escHtml(boss.name)}</b>` +
          `　｜　最低售价 <b>¥${boss.minPrice}</b>` +
          `　｜　包装 <b>${boss.length}×${boss.width}×${boss.height} cm / ${boss.weight} kg</b></span>` +
          `<span class="bcs-match-formula">上架价 = 最低售价 × 店铺倍数</span>`;
        return;
      }
      feedbackEl.className = 'bcs-match-bar warn';
      feedbackEl.textContent = cur
        ? `前缀码 ${cur} 未在价格表登记：商品无法确定最低售价，上架时将被阻止。`
        : '当前为「自动随机生成」：未匹配价格表的商品将被阻止上架，请在上方选择对应商品前缀码。';
    }

    function syncPrefixSelect() {
      const cur = userConfig.prefixCode || '';
      if (!cur) {
        prefixSelect.value = '';
        prefixInput.style.display = 'none';
        prefixInput.value = '';
      } else if (isRegisteredPrefixCode(cur)) {
        prefixSelect.value = cur;
        prefixInput.style.display = 'none';
        prefixInput.value = '';
      } else {
        prefixSelect.value = '__custom__';
        prefixInput.style.display = '';
        prefixInput.value = cur;
      }
      updatePrefixFeedback();
    }

    function renderPrefixOptions(query) {
      const q = (query || '').trim().toLowerCase();
      const list = q
        ? PREFIX_CODES.filter(p =>
            p.code.toLowerCase().includes(q) ||
            (p.name || '').toLowerCase().includes(q) ||
            (p.sku || '').toLowerCase().includes(q))
        : PREFIX_CODES;

      if (prefixLabel) {
        prefixLabel.textContent = q ? `商品前缀码（匹配 ${list.length}）` : '商品前缀码';
      }

      const cur = userConfig.prefixCode || '';
      const needCur = cur && isRegisteredPrefixCode(cur) && !list.some(p => p.code === cur);
      const opts = [new Option('自动随机生成（不匹配价格表）', ''), ...list.map(p => new Option(getPrefixCodeLabel(p.code), p.code))];
      if (needCur) {
        opts.push(new Option(getPrefixCodeLabel(cur), cur));
      }
      if (q && !list.length && !needCur) {
        const empty = new Option('（无匹配，请修改或清空筛选词）', '__none__');
        empty.disabled = true;
        opts.push(empty);
      }
      opts.push(new Option('自定义…', '__custom__'));
      prefixSelect.replaceChildren(...opts);
      syncPrefixSelect();
    }
    renderPrefixOptions('');
    prefixSearch.oninput = () => renderPrefixOptions(prefixSearch.value);

    function applyPrefixCode(code) {
      if (code === (userConfig.prefixCode || '')) return;
      userConfig.prefixCode = code;
      saveConfig(userConfig);
      const changed = rebuildPendingVendorCodes(pendingList, code);
      if (changed.length) {
        savePending(pendingList);
        showToast(`已将 ${changed.length} 个商品的供应商代码更新为前缀码 ${code || '（自动随机）'}`, 4000);
      }
      if (panelEl) renderPendingList();
      syncPrefixSelect();
    }

    prefixSelect.onchange = () => {
      const v = prefixSelect.value;
      if (v === '') {
        applyPrefixCode('');
      } else if (v === '__custom__') {
        prefixInput.style.display = '';
        prefixInput.focus();
      } else {
        prefixInput.style.display = 'none';
        applyPrefixCode(v);
      }
    };

    prefixInput.oninput = () => {
      prefixInput.value = prefixInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    };
    prefixInput.onchange = () => {
      const v = prefixInput.value.trim();
      if (!isValidPrefixCode(v)) {
        alert('前缀码必须为 4 位大写字母（A-Z）');
        syncPrefixSelect();
        return;
      }
      if (!isRegisteredPrefixCode(v)) {
        alert(`前缀码 ${v} 未在价格表中登记，商品将无法确定最低售价，上架时会被阻止`);
      }
      applyPrefixCode(v);
    };
    prefixInput.onkeydown = (e) => {
      if (e.key === 'Enter') prefixInput.blur();
    };

    updateFooterSummary();
  }
