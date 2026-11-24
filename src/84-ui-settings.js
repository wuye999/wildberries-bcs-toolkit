  // ---- 上货方式设置 ----
  function renderModeSettings() {
    const body = document.getElementById('bcs-mode-body');
    if (!body) return;
    body.innerHTML = '';

    body.appendChild(createToggleGroup('方式', [
      { label: '直上', value: true },
      { label: '修改（存入采集箱）', value: false },
    ], userConfig.settings.directUpload, (v) => {
      userConfig.settings.directUpload = v;
      saveConfig(userConfig);
      if (panelEl) renderPendingList();
    }));

    body.appendChild(createToggleGroup('品牌', [
      { label: '携带', value: true },
      { label: '不携带', value: false },
    ], userConfig.settings.carryBrand, (v) => {
      userConfig.settings.carryBrand = v;
      saveConfig(userConfig);
    }));

    body.appendChild(createToggleGroup('合并', [
      { label: '合并', value: false },
      { label: '不合并', value: true },
    ], userConfig.settings.noMerge, (v) => {
      userConfig.settings.noMerge = v;
      saveConfig(userConfig);
    }));
  }

  function createToggleGroup(label, options, currentValue, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'bcs-toggle-group';
    const lbl = document.createElement('span');
    lbl.className = 'bcs-toggle-label';
    lbl.textContent = label + '：';
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

  // ---- 店铺列表渲染（默认全选 + 默认莫斯科仓库 + 库存999）----

  async function renderShopList(forceRefresh = false) {
    const body = document.getElementById('bcs-shop-body');
    if (!body) return;
    body.innerHTML = '<div class="bcs-empty">加载中...</div>';

    try {
      if (forceRefresh || !shopsCache) {
        // 通过云端API获取店铺列表（GM_xmlhttpRequest 直连，带缓存）
        shopsCache = await getShops(forceRefresh);
        shopsAutoSelected = false;
      }
      const shops = shopsCache;
      if (!shops || !shops.length) {
        body.innerHTML = '<div class="bcs-empty">未绑定店铺，请先在 BCS 插件中绑定店铺</div>';
        return;
      }

      // ---- 首次加载时自动勾选全部店铺 + 库存999 + 上架倍数默认 ×2（仓库串行加载时自动选莫斯科）----
      // ★ A6 保留原设计：自动全选 + 库存 999 兜底
      // ★ v1.9.0：店铺配置新增 priceMultiplier（上架价 = 价格表最低售价 × 倍数），与仓库一样持久化记忆
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

      // ---- 先渲染所有店铺行（仓库下拉显示"加载中"）----
      body.innerHTML = '';
      const rowsMap = new Map();
      for (const shop of shops) {
        const cfg = userConfig.shopConfigs[shop.id] || { warehouseId: null, quantity: 999, priceMultiplier: 2 };
        const isSelected = userConfig.selectedShopIds.includes(shop.id);
        const curMult = normalizePriceMultiplier(cfg.priceMultiplier);   // 30-config.js
        const row = document.createElement('div');
        row.className = 'bcs-shop-row';
        row.innerHTML = `
          <input type="checkbox" data-shopid="${shop.id}" ${isSelected ? 'checked' : ''}>
          <span class="bcs-shop-name" title="${shop.shopName}">${shop.shopName}</span>
          <select data-shopid="${shop.id}" data-field="warehouse" title="发货仓库" ${!isSelected ? 'disabled' : ''}>
            <option value="">${isSelected ? '加载中...' : '发货地...'}</option>
          </select>
          <input type="number" data-shopid="${shop.id}" data-field="qty" value="${cfg.quantity != null ? cfg.quantity : 999}" min="0" title="库存" ${!isSelected ? 'disabled' : ''}>
          <select data-shopid="${shop.id}" data-field="mult" title="上架价 = 价格表最低售价 × 倍数" ${!isSelected ? 'disabled' : ''}>
            ${PRICE_MULTIPLIERS.map(m => `<option value="${m}" ${curMult === m ? 'selected' : ''}>×${m}</option>`).join('')}
          </select>
        `;
        body.appendChild(row);
        rowsMap.set(shop.id, {
          row, shop, cfg,
          whSelect: row.querySelector('select[data-field="warehouse"]'),
          qtyInput: row.querySelector('input[type="number"]'),
          multSelect: row.querySelector('select[data-field="mult"]'),
          cb: row.querySelector('input[type="checkbox"]'),
        });
      }

      // ---- 绑定事件 ----
      for (const { row, shop, cfg, whSelect, qtyInput, multSelect, cb } of rowsMap.values()) {
        cb.onchange = async () => {
          if (cb.checked) {
            if (!userConfig.selectedShopIds.includes(shop.id)) {
              userConfig.selectedShopIds.push(shop.id);
            }
            whSelect.disabled = false;
            qtyInput.disabled = false;
            if (multSelect) multSelect.disabled = false;
            if (!shop.warehouses || !shop.warehouses.length) {
              whSelect.innerHTML = '<option value="">加载中...</option>';
              try {
                const updated = await ensureWarehouses(shop.id);
                if (updated) shop.warehouses = updated.warehouses;
                fillWarehouseOptions(whSelect, shop, cfg);
                autoSelectMoscow(whSelect, shop, cfg);
              } catch (e) {
                whSelect.innerHTML = '<option value="">加载失败</option>';
              }
            } else {
              fillWarehouseOptions(whSelect, shop, cfg);
              autoSelectMoscow(whSelect, shop, cfg);
            }
          } else {
            userConfig.selectedShopIds = userConfig.selectedShopIds.filter(id => id !== shop.id);
            whSelect.disabled = true;
            qtyInput.disabled = true;
            if (multSelect) multSelect.disabled = true;
          }
          saveConfig(userConfig);
          // ★ v1.9.0：已选店铺集合变化 → 待上架列表「上架价」列涉及的倍数分组要重算
          if (panelEl) renderPendingList();
        };

        whSelect.onchange = () => {
          if (!userConfig.shopConfigs[shop.id]) userConfig.shopConfigs[shop.id] = {};
          userConfig.shopConfigs[shop.id].warehouseId = whSelect.value ? Number(whSelect.value) : null;
          // ★ v1.5.3：用户手动下拉选仓 = 显式意图，标记锁定，autoSelectMoscow 不再自动纠正
          userConfig.shopConfigs[shop.id].warehouseLocked = true;
          saveConfig(userConfig);
        };

        qtyInput.onchange = () => {
          if (!userConfig.shopConfigs[shop.id]) userConfig.shopConfigs[shop.id] = {};
          // ★ A6 保留原设计：未填库存默认 999
          try {
            userConfig.shopConfigs[shop.id].quantity = normalizeWarehouseQuantity(qtyInput.value);
            saveConfig(userConfig);
          } catch (error) {
            qtyInput.value = cfg.quantity == null ? 999 : cfg.quantity;
            showToast(error.message, 4000);
          }
        };

        // ★ v1.9.0 上架倍数：与仓库/库存同存 shopConfigs，随 GM 配置记忆（换商品、刷新页面、重开浏览器都保持）
        if (multSelect) {
          multSelect.onchange = () => {
            if (!userConfig.shopConfigs[shop.id]) userConfig.shopConfigs[shop.id] = {};
            userConfig.shopConfigs[shop.id].priceMultiplier = normalizePriceMultiplier(multSelect.value);
            saveConfig(userConfig);
            if (panelEl) renderPendingList();   // 倍数变了 → 列表上架价列即时重算
          };
        }
      }

      // ---- 串行加载已选店铺的仓库（避免并发导致选错）----
      for (const shop of shops) {
        const isSelected = userConfig.selectedShopIds.includes(shop.id);
        if (!isSelected) continue;
        const entry = rowsMap.get(shop.id);
        if (!entry) continue;
        const { whSelect, cfg } = entry;

        // 已有仓库数据：直接填充
        if (shop.warehouses && shop.warehouses.length) {
          fillWarehouseOptions(whSelect, shop, cfg);
          autoSelectMoscow(whSelect, shop, cfg);
          continue;
        }
        // 没有则串行加载
        whSelect.innerHTML = '<option value="">加载中...</option>';
        try {
          const updated = await ensureWarehouses(shop.id);
          if (updated) shop.warehouses = updated.warehouses;
          fillWarehouseOptions(whSelect, shop, cfg);
          autoSelectMoscow(whSelect, shop, cfg);
        } catch (e) {
          whSelect.innerHTML = '<option value="">加载失败</option>';
        }
        // 让出主线程，避免 UI 卡死
        await new Promise(r => setTimeout(r, 50));
      }
    } catch (e) {
      body.innerHTML = `<div class="bcs-empty">加载失败: ${e.message}</div>`;
    }
  }

  // 自动选莫斯科仓库（用户未手动锁定过时，自动纠正为莫斯科）
  function autoSelectMoscow(select, shop, cfg) {
    // ★ v1.5.3：仅当用户「手动」选过仓库（warehouseLocked）才保持不变；
    //   否则（含历史脏 warehouseId，无 locked 标记）无条件重新匹配莫斯科并覆盖，
    //   修复历史版本误写入成都仓库后永久沿用的 bug。
    if (cfg.warehouseLocked === true && cfg.warehouseId) {
      const opt = select.querySelector(`option[value="${cfg.warehouseId}"]`);
      if (opt) opt.selected = true;
      return;
    }
    // 自动状态 → 重新匹配莫斯科
    const moscow = findMoscowWarehouse(shop.warehouses);
    if (moscow) {
      const opt = select.querySelector(`option[value="${moscow.id}"]`);
      if (opt) opt.selected = true;
      if (!userConfig.shopConfigs[shop.id]) userConfig.shopConfigs[shop.id] = {};
      userConfig.shopConfigs[shop.id].warehouseId = Number(moscow.id);
      saveConfig(userConfig);
    } else if (cfg.warehouseId) {
      // ★ v1.5.3：匹配不到莫斯科时清空历史脏值（不 fallback 到第一个仓库），
      //   让 batchShelve 报「未选择发货仓库」阻止提交，而非误上架到错误仓库
      if (!userConfig.shopConfigs[shop.id]) userConfig.shopConfigs[shop.id] = {};
      userConfig.shopConfigs[shop.id].warehouseId = null;
      saveConfig(userConfig);
    }
  }

  function fillWarehouseOptions(select, shop, cfg) {
    if (!shop.warehouses || !shop.warehouses.length) {
      select.innerHTML = '<option value="">无仓库</option>';
      return;
    }
    const current = cfg.warehouseId ? String(cfg.warehouseId) : '';
    select.innerHTML = '<option value="">发货地...</option>' +
      shop.warehouses.map(w => `<option value="${w.id}" ${String(w.id) === current ? 'selected' : ''}>${w.name}</option>`).join('');
  }

  // ---- 价格表与上架价设置（★ v1.9.0：价格只有一条口径，不再有全局默认值/自定义输入）----
  function renderPriceSettings() {
    const body = document.getElementById('bcs-price-body');
    if (!body) return;
    body.innerHTML = '';

    // 提示文字
    const tip = document.createElement('div');
    tip.style.cssText = 'padding:6px 8px; background:#fffbe6; border:1px solid #ffe58f; border-radius:4px; margin-bottom:8px; font-size:11px; color:#8c6e2a; line-height:1.5;';
    tip.innerHTML = '<strong>上架价 = 价格表（商品价格表.xlsx）最低售价 × 店铺倍数</strong>（倍数在「店铺选择」里按店铺设置，只能选 ×1/×2/×5/×10）。' +
                    '包装尺寸与重量也一律取价格表。价格表查不到的商品将被阻止上架 —— 请务必选择已登记前缀码（或让商品供应商代码为已登记的 BCS-XXXX-nmId）。';
    body.appendChild(tip);

    // ★ v1.5.0 商品前缀码（vendorCode 中段）：默认自动随机生成；
    //   用户选择《前缀码对照表》中登记的 4 位前缀码后，整批待上架商品的 vendorCode 中段统一用它
    //   （自动格式 BCS-XXXX-nmId 会被重建为 BCS-{前缀码}-nmId，便于映射侧自动归属老板商品）
    // ★ v1.5.9 前缀码搜索框：数据量 112+ 条，按 中文名/前缀码/SKU 片段实时过滤下拉选项
    const prefixSearchField = document.createElement('div');
    prefixSearchField.className = 'bcs-field';
    prefixSearchField.innerHTML = `
      <label>搜索前缀码：</label>
      <input type="text" id="bcs-prefix-search" placeholder="输入中文名 / 前缀码 / SKU 片段过滤下拉选项">
    `;
    body.appendChild(prefixSearchField);

    const prefixField = document.createElement('div');
    prefixField.className = 'bcs-field';
    prefixField.innerHTML = `
      <label>商品前缀码：</label>
      <select id="bcs-prefix-code">
        <option value="">自动随机生成</option>
        ${PREFIX_CODES.map(p => `<option value="${p.code}">${p.code} - ${p.name}</option>`).join('')}
        <option value="__custom__">自定义…</option>
      </select>
      <input type="text" id="bcs-prefix-code-input" maxlength="4" placeholder="4位大写字母"
             style="display:none;width:90px;margin-left:6px;flex:0 0 90px;">
    `;
    body.appendChild(prefixField);

    // ★ v1.9.0 前缀码未生效时的显式告警（未登记 / 自动随机 → 商品无法匹配价格表 → 会被阻止上架）
    const prefixWarn = document.createElement('div');
    prefixWarn.id = 'bcs-prefix-warn';
    prefixWarn.style.cssText = 'display:none;padding:6px 8px;margin-bottom:8px;background:#fef0f0;border:1px solid #fbc4c4;border-radius:4px;font-size:11px;color:#cb2c2c;line-height:1.5;';
    body.appendChild(prefixWarn);

    const prefixSelect = document.getElementById('bcs-prefix-code');
    const prefixInput = document.getElementById('bcs-prefix-code-input');

    function updatePrefixWarn() {
      const cur = userConfig.prefixCode || '';
      if (cur && isRegisteredPrefixCode(cur)) {
        prefixWarn.style.display = 'none';
        prefixWarn.textContent = '';
        return;
      }
      prefixWarn.style.display = '';
      prefixWarn.textContent = cur
        ? `⚠️ 前缀码 ${cur} 未在价格表登记：商品无法确定最低售价，上架时会被阻止。`
        : '⚠️ 当前为「自动随机生成」：随机前缀码不参与价格表归属 → 商品无法确定最低售价，上架时会被阻止。请选择已登记前缀码。';
    }

    // 渲染/恢复 select 与输入框状态（按 userConfig.prefixCode 定位）
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
      updatePrefixWarn();
    }
    syncPrefixSelect();

    // ★ v1.5.9 前缀码下拉搜索过滤：按 中文名/前缀码/SKU 片段（大小写不敏感包含匹配）重建登记码 options。
    //   常驻项「自动随机生成」(value="") 与「自定义…」(value="__custom__") 始终保留；
    //   过滤只改可见选项，不改 userConfig.prefixCode 与 onchange/applyPrefixCode 应用逻辑。
    const prefixSearch = document.getElementById('bcs-prefix-search');
    function renderPrefixOptions(query) {
      const q = (query || '').trim().toLowerCase();
      const list = q
        ? PREFIX_CODES.filter(p =>
            p.code.toLowerCase().includes(q) ||
            (p.name || '').toLowerCase().includes(q) ||
            (p.sku || '').toLowerCase().includes(q))
        : PREFIX_CODES;
      // 当前已选登记前缀码不在过滤结果中时临时插入该项，保持显示与配置一致（避免误显示为"自动随机生成"）
      const cur = userConfig.prefixCode || '';
      const needCur = cur && isRegisteredPrefixCode(cur) && !list.some(p => p.code === cur);
      const opts = ['<option value="">自动随机生成</option>']
        .concat(list.map(p => `<option value="${p.code}">${p.code} - ${p.name}</option>`));
      if (needCur) {
        const cp = PREFIX_CODES.find(p => p.code === cur);
        opts.push(`<option value="${cp.code}">${cp.code} - ${cp.name}</option>`);
      }
      if (!list.length && !needCur) {
        opts.push('<option value="__none__" disabled>（无匹配，请修改或清空搜索词）</option>');
      }
      opts.push('<option value="__custom__">自定义…</option>');
      prefixSelect.innerHTML = opts.join('');
      syncPrefixSelect();
    }
    prefixSearch.oninput = () => renderPrefixOptions(prefixSearch.value);

    // 应用前缀码：保存配置 + 整批重建「自动格式」vendorCode + 轻量刷新表格
    // ★ v1.9.0：不再写任何全局默认值（售价/尺寸均由价格表 + 店铺倍数决定），前缀码仅用于价格表归属
    function applyPrefixCode(code) {
      if (code === (userConfig.prefixCode || '')) return;
      userConfig.prefixCode = code;
      saveConfig(userConfig);
      const changed = rebuildPendingVendorCodes(pendingList, code);   // 空 code 返回 []，不清空已生成值
      if (changed.length) {
        savePending(pendingList);
        showToast(`已将 ${changed.length} 个商品的供应商代码更新为前缀码 ${code || '（自动随机）'}`, 4000);
      }
      // ★ v1.9.0：前缀码决定价格表归属 → 整批商品的最低价/上架价/包装都要重算
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
        // 不立即保存，等待输入框提交
      } else {
        prefixInput.style.display = 'none';
        applyPrefixCode(v);
      }
    };

    // 自动大写转换 + 过滤非法字符 + 限长
    prefixInput.oninput = () => {
      prefixInput.value = prefixInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    };
    prefixInput.onchange = () => {
      const v = prefixInput.value.trim();
      if (!isValidPrefixCode(v)) {
        alert('前缀码必须为 4 位大写字母（A-Z）');
        syncPrefixSelect();   // 恢复旧状态，不写入配置（阻止提交）
        return;
      }
      if (!isRegisteredPrefixCode(v)) {
        // 允许提交，但警告无法归属价格表（★ v1.9.0：未登记 = 无法确定最低售价 = 会被阻止上架）
        alert(`前缀码 ${v} 未在价格表中登记，商品将无法确定最低售价，上架时会被阻止`);
      }
      applyPrefixCode(v);
    };
    prefixInput.onkeydown = (e) => {
      if (e.key === 'Enter') prefixInput.blur();   // 触发 onchange 完成输入
    };

    // ★ v1.9.0：已删除「统一售价」与「包装长/宽/高/重」全局默认值输入框
    //   —— 上架价 = 价格表最低售价 × 店铺倍数，包装尺寸/重量取价格表，不再存在自定义兜底

    // 提交间隔
    const intervalField = document.createElement('div');
    intervalField.className = 'bcs-field';
    intervalField.innerHTML = `
      <label>提交间隔(秒)：</label>
      <input type="number" id="bcs-interval" value="${userConfig.intervalMs / 1000}" min="1" step="1">
    `;
    body.appendChild(intervalField);
    document.getElementById('bcs-interval').onchange = (e) => {
      userConfig.intervalMs = (Number(e.target.value) || 2) * 1000;
      saveConfig(userConfig);
    };

    // 说明：分组提交的请求数 = 商品数 × 已选店铺的倍数种类数
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:#888;line-height:1.5;margin-top:4px;';
    hint.textContent = '提示：不同倍数的店铺会在提交时分组，每组单独请求一次（请求数 = 商品数 × 倍数种类数），间隔按每次请求计算。';
    body.appendChild(hint);
  }

