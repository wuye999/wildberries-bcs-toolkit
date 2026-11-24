  // ============================================================
  // 9. 批量上架核心（云端API直连：GM_xmlhttpRequest）
  // ★ v1.9.0 价格模型：上架价 = 价格表最低售价(minPrice) × 店铺倍数(1/2/5/10)
  //   售价随商品规格提交，shop[] 无价格字段
  //   → 不同倍数的店铺必须拆成多次提交：请求数 = 商品数 × 已选店铺的倍数种类数
  // ============================================================
  let batchRunning = false;

  // ★ v1.4.2 b6：售价下限（¥），低于此值视为无效，防止 0.01 元等误提交
  // ★ v1.9.0：校验对象改为「价格表最低售价」与「该倍数算出的上架价」
  const MIN_PRICE = 1;

  function validateShelveShop(shop, config) {
    const cfg = config.shopConfigs[shop.id] || {};
    const wh = Number(cfg.warehouseId);
    if (!Number.isSafeInteger(wh) || wh <= 0) throw new Error(`${shop.shopName || shop.id} 未选择有效发货仓库`);
    if (!Array.isArray(shop.warehouses) || !shop.warehouses.some(w => String(w.id) === String(wh))) {
      throw new Error(`${shop.shopName || shop.id} 的仓库不在该店铺仓库列表中，请刷新店铺并重新选择`);
    }
    normalizeWarehouseQuantity(cfg.quantity);
  }

  // 预校验与提交共用同一校验入口；传入本批快照，异步查重/提交期间不读取界面新配置。
  function prepareShelveItem(item, config) {
    if (item.fetched !== true) throw new Error('未抓取或抓取失败，请刷新商品信息');
    if (!/^[1-9]\d*$/.test(String(item.nmId))) throw new Error('商品 nmId 无效');
    const boss = getItemBossDefaults(item, config);
    if (!boss) throw new Error('未匹配价格表，请选择已登记前缀码');
    if (!(boss.minPrice >= MIN_PRICE) || !Number.isFinite(boss.minPrice)) throw new Error(`价格表最低售价需 ≥ ¥${MIN_PRICE}`);
    if (![boss.length, boss.width, boss.height, boss.weight].every(v => Number.isFinite(v) && v > 0)) {
      throw new Error('价格表包装尺寸/重量无效');
    }
    if (!(Number(item.subjectId) > 0)) throw new Error('类目ID缺失，请重新抓取');
    if (!item.wbDetail || typeof item.wbDetail !== 'object') throw new Error('WB详情缺失，请重新抓取');
    if (!item.wbCardInfo || typeof item.wbCardInfo !== 'object') throw new Error('WB卡片信息缺失，请重新抓取');
    const productName = String(item.wbDetail.name || item.title || '').trim();
    if (!productName) throw new Error('商品名称缺失，请重新抓取');
    const vendorCode = String(item.vendorCode || '');
    if (!vendorCode.trim() || vendorCode !== vendorCode.trim()) throw new Error('供应商代码为空或含首尾空格');
    // 特例后缀/自定义代码不会被批量重建；若其登记码与全局归属冲突，不能按另一商品的价格提交。
    const codeMatch = vendorCode.match(/^BCS-([A-Z]{4})-\d+(?=$|-)/);
    if (config.prefixCode && codeMatch && codeMatch[1] !== config.prefixCode) {
      throw new Error(`供应商代码前缀 ${codeMatch[1]} 与所选价格表 ${config.prefixCode} 不一致，请核对`);
    }
    if (!Array.isArray(item.imagesList) || !item.imagesList.length ||
        item.imagesList.some(v => typeof v !== 'string' || !v.trim())) throw new Error('图片列表不完整，请重新抓取');
    const baseDetail = JSON.parse(JSON.stringify(item.wbDetail));
    // 保持本项目既有人工选品规则：多色只提交第一条规格。
    if (Array.isArray(item.colors) && item.colors.length > 1 && Array.isArray(baseDetail.sizes)) {
      baseDetail.sizes = baseDetail.sizes.slice(0, 1);
    }
    if (!Array.isArray(baseDetail.sizes) || !baseDetail.sizes.length ||
        baseDetail.sizes.some(s => !s || typeof s !== 'object')) throw new Error('WB详情缺少有效规格数据');
    if (!config.settings.carryBrand) baseDetail.brand = '';
    return {
      boss, baseDetail, productName, vendorCode,
      imagesStr: item.imagesList.join(';'),
      cardInfo: withCleanWbCardDescription(item.wbCardInfo),
    };
  }

  function buildShopGroupsByMultiplier(selectedShops, config) {
    const byMult = new Map();
    const out = [];
    for (const shop of selectedShops) {
      const mult = getShopPriceMultiplier(shop.id, config);
      let g = byMult.get(mult);
      if (!g) { g = { mult, shops: [], shopArr: [] }; byMult.set(mult, g); out.push(g); }
      const cfg = config.shopConfigs[shop.id] || {};
      // ★ A6 保留原设计：库存未填时默认 999
      g.shops.push(shop);
      g.shopArr.push({
        id: shop.id,
        warehouseId: Number(cfg.warehouseId),
        warehouseQuantity: normalizeWarehouseQuantity(cfg.quantity),
      });
    }
    out.sort((a, b) => a.mult - b.mult);
    return out;
  }

  function buildShelvePlan(items, selectedShops, skipByNm, config) {
    const groups = buildShopGroupsByMultiplier(selectedShops, config);
    const skippedAll = [];
    const byCard = new Map();
    for (const item of items) {
      const skippedShops = new Set(Array.from(skipByNm.get(String(item.nmId)) || [], String));
      if (selectedShops.every(shop => skippedShops.has(String(shop.id)))) {
        skippedAll.push(item);
        continue;
      }
      // imt_id 标识同一主商品，detail.root 为只有详情数据时的同一标识。
      const cardId = [item.wbCardInfo?.imt_id, item.wbDetail?.root].map(String).find(id => /^[1-9]\d*$/.test(id));
      const key = config.settings.noMerge ? item : (cardId || item);
      if (!byCard.has(key)) byCard.set(key, []);
      byCard.get(key).push({ item, skippedShops });
    }

    const requests = [];
    for (const candidates of byCard.values()) {
      const parentNmId = candidates.length > 1 ? String(candidates[0].item.nmId) : null;
      for (const group of groups) {
        // 只把实际可提交商品完全相同的店铺放进同一请求，避免写回查重命中的店铺。
        const byItems = new Map();
        group.shops.forEach((shop, index) => {
          const eligible = candidates.filter(entry => !entry.skippedShops.has(String(shop.id))).map(entry => entry.item);
          if (!eligible.length) return;
          const key = JSON.stringify(eligible.map(item => String(item.nmId)));
          if (!byItems.has(key)) byItems.set(key, { mult: group.mult, parentNmId, items: eligible, shops: [], shopArr: [] });
          const request = byItems.get(key);
          request.shops.push(shop);
          request.shopArr.push(group.shopArr[index]);
        });
        requests.push(...byItems.values());
      }
    }
    return { groups, requests, skippedAll };
  }

  function formatShelvePrice(minPrice, mult, directUpload) {
    const price = calcShelfPrice(minPrice, mult);
    return directUpload ? price.toFixed(2) : String(Math.ceil(price));
  }

  function buildShelveRow(item, prepared, { mult, parentNmId }, { carryBrand, directUpload }) {
    const { boss, baseDetail, vendorCode, imagesStr, productName, cardInfo } = prepared;
    const price = formatShelvePrice(boss.minPrice, mult, directUpload);
    const video = getWbProductVideoUrl(item.nmId, cardInfo);
    return {
      nmId: null,
      wbDetail: {
        ...baseDetail,
        sizes: baseDetail.sizes.map(s => ({
          origName: s.origName != null ? s.origName : (s.techSize || 0),
          name: s.name != null ? s.name : (s.wbSize || ''),
          price,
          vendorCode,
        })),
      },
      wbCardInfo: cardInfo,
      name: productName,
      subjectId: item.subjectId,
      parentId: item.parentId ?? null,
      images: imagesStr,
      video,
      videos: video,
      mainImage: item.mainImage || getMainImageUrl(item.nmId),
      packagLength: Math.ceil(boss.length),
      packagWidth: Math.ceil(boss.width),
      packagHeight: Math.ceil(boss.height),
      weightBrutto: String(boss.weight),
      vendorCode,
      brand: carryBrand ? (item.brand || baseDetail.brand || '') : '',
      hsCode: null,
      subjectName: item.subjectName || '',
      parentName: item.parentName || '',
      sourceSku: String(item.nmId),
      offerUrl: buildWbProductUrl(parentNmId || item.nmId),
      ...(parentNmId ? { parentNmId } : {}),
    };
  }

  function createMergeCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  function buildWbCollectBoxVariant(row) {
    const chars = [];
    const groups = row.wbCardInfo.grouped_options;
    for (const group of Array.isArray(groups) ? groups : []) {
      if (group?.group_name === 'Габариты' || !Array.isArray(group?.options)) continue;
      for (const option of group.options) {
        if (option?.name && option.value) {
          chars.push({ charcID: option.id || 0, name: String(option.name), value: String(option.value) });
        }
      }
    }
    const sizes = row.wbDetail.sizes.map(size => {
      const name = size.name || size.origName || '';
      return {
        techSize: String(size.origName || name),
        wbSize: String(name),
        price: size.price,
        skus: '',
      };
    });
    return {
      nmId: null,
      sourceSku: row.sourceSku,
      vendorCode: row.vendorCode,
      name: row.name,
      description: sanitizeWbProductDescription(row.wbCardInfo.description),
      brand: row.brand,
      packageLength: row.packagLength,
      packageWidth: row.packagWidth,
      packageHeight: row.packagHeight,
      weightBrut: Number(row.weightBrutto),
      sizes,
      chars,
      mainImage: row.mainImage,
      images: row.images,
      videos: row.video,
    };
  }

  // 采集箱根字段取首款，同组商品各自保留规格、价格和媒体。
  function buildWbModifyCollectBoxBody(rows, shops, templateFields) {
    const row = rows[0];
    const variants = rows.map(buildWbCollectBoxVariant);
    const { sizes, chars } = variants[0];
    return {
      ...variants[0],
      collectType: '0',
      prices: sizes[0].price,
      subjectId: row.subjectId,
      subjectName: row.subjectName || row.wbCardInfo.subj_name || '',
      parentId: row.parentId,
      parentName: row.parentName || row.wbCardInfo.subj_root_name || '',
      sizes: JSON.stringify(sizes),
      chars: JSON.stringify(chars),
      variant: JSON.stringify(variants),
      status: '0',
      mergeStatus: row.mergeStatus ?? null,
      mergeCode: row.mergeCode ?? null,
      uploadStatus: '0',
      uploadImgStatus: '0',
      hsCode: row.hsCode,
      shop: JSON.stringify(shops),
      scopeConfig: JSON.stringify({ fieldScope: { name: 'variant', description: 'common' }, charScope: {} }),
      offerUrl: row.offerUrl,
      ...templateFields,
    };
  }

  async function batchShelve(items, onProgress, opts) {
    if (batchRunning) { alert('已有上架任务进行中，请等待完成'); return; }
    batchRunning = true;

    try {
      const config = JSON.parse(JSON.stringify((opts && opts.config) || userConfig));
      items = JSON.parse(JSON.stringify(items));
      // ---- 校验店铺 ----
      const shops = JSON.parse(JSON.stringify((opts && opts.shops) || shopsCache || []));
      if (!shops.length) {
        alert('店铺列表为空，请在面板中点击「刷新店铺」');
        return;
      }
      if (!config.selectedShopIds.length) {
        alert('请先在面板中选择至少一个店铺');
        return;
      }

      onProgress && onProgress({ phase: '校验店铺配置...' });

      const selectedShops = shops.filter(s => config.selectedShopIds.some(id => String(id) === String(s.id)));

      // ---- 校验仓库 ----
      const missingWhShops = [];
      for (const shop of selectedShops) {
        try { validateShelveShop(shop, config); }
        catch (error) { missingWhShops.push(error.message); }
      }
      if (missingWhShops.length) {
        alert(`店铺配置无效，无法上架：\n${missingWhShops.join('\n')}`);
        return;
      }

      if (!selectedShops.length) {
        alert('没有可上架的店铺，请检查店铺勾选');
        return;
      }

      const skipByNm = opts?.skipByNm || new Map();
      const { groups, requests, skippedAll } = buildShelvePlan(items, selectedShops, skipByNm, config);
      if (!requests.length) {
        alert('所选商品在所选店铺均已上架，无需提交');
        return;
      }

      const { carryBrand, directUpload, noMerge } = config.settings;
      const action = directUpload ? '上架' : '存入采集箱';
      const submitPath = directUpload ? '/system/wbCollection/wb/new' : '/system/collectBox';

      const templateFields = {
        mode: directUpload ? 1 : 0,
        mergeCards: noMerge ? 1 : 0,
        carryBrand: carryBrand ? 0 : 1,
        customBrand: null,
        titleSuffix: null,
        vendorCodePrefix: null,
        aiRewrite: false,
        aiRetouch: false,
        aiRetouchTemplateId: null,
        imgUploadMode: 0,
        removeBrandText: false,
      };

      const perItem = new Map();
      for (const request of requests) {
        for (const item of request.items) {
          if (!perItem.has(item)) perItem.set(item, { nmId: item.nmId, total: 0, ok: 0, fails: [] });
          perItem.get(item).total++;
        }
      }
      for (const [item, state] of perItem) {
        try {
          state.prepared = prepareShelveItem(item, config);
        } catch (err) {
          state.validationError = err?.message || String(err);
          log.error(`${item.nmId} 校验失败:`, state.validationError);
        }
      }
      const totalReq = requests.filter(request => request.items.some(item => perItem.get(item).prepared)).length;
      onProgress?.({ phase: `开始批量${action}（${perItem.size} 商品 / ${groups.length} 个倍数分组 / 共 ${totalReq} 次请求）...` });

      const results = [];
      let reqDone = 0;
      for (const request of requests) {
        const { mult, shops: requestShops, shopArr } = request;
        const shopIds = shopArr.map(shop => shop.id);
        const shopNames = requestShops.map(shop => shop.shopName || shop.id);
        const record = (item, outcome) => {
          const result = { nmId: item.nmId, mult, shopIds, shopNames, ...outcome };
          results.push(result);
          const state = perItem.get(item);
          if (result.ok) state.ok++;
          else state.fails.push(result);
          if (directUpload && state.ok === state.total) {
            listedNmIdSet = listedNmIdSet || new Set();
            listedDetailMap = listedDetailMap || new Map();
            listedNmIdSet.add(String(item.nmId));
            saveListedCache();
          }
        };

        const ready = request.items.filter(item => {
          const state = perItem.get(item);
          if (state.prepared) return true;
          record(item, { ok: false, error: state.validationError });
          return false;
        });
        if (!ready.length) continue;

        const itemLabel = ready.length === 1 ? ready[0].nmId : `${ready[0].nmId} 等 ${ready.length} 件`;
        const tag = `${itemLabel} → ×${mult}（${shopArr.length} 店）`;
        onProgress?.({ phase: `${tag} 请求 ${reqDone + 1}/${totalReq}`, current: reqDone + 1, total: totalReq });

        const rows = ready.map(item => buildShelveRow(item, perItem.get(item).prepared, request, config.settings));
        if (rows.length > 1) {
          const mergeFields = { mergeCode: createMergeCode(), mergeStatus: '0' };
          rows.forEach(row => Object.assign(row, mergeFields));
        }

        let outcome;
        try {
          const requestData = directUpload ? {
            shop: JSON.stringify(shopArr),
            offerDIY: '',
            brandStatus: carryBrand,
            oModel: true,
            status: '1',
            collectionType: '0',
            offerUrl: rows[0].offerUrl,
            shopDatas: rows.map(row => ({
              ...row,
              wbDetail: JSON.stringify(row.wbDetail),
              wbCardInfo: JSON.stringify(row.wbCardInfo),
            })),
            ...templateFields,
          } : buildWbModifyCollectBoxBody(rows, shopArr, templateFields);
          const response = await bcsApiCall(submitPath, { method: 'POST', data: requestData, timeout: 60000 });
          outcome = response.code === 200
            ? { ok: true }
            : { ok: false, error: response.msg || `未知错误(code=${response.code})` };
          if (!outcome.ok) log.error(`${tag} ${action}失败: ${outcome.error}`);
        } catch (error) {
          const warning = !!error?.uncertain;
          const message = error?.message || String(error);
          outcome = {
            ok: false, warning,
            error: warning && !directUpload ? '保存结果未确认，重试前请先检查采集箱' : 'API调用失败: ' + message,
          };
          log.error(`${tag} ${action}失败: ${message}`);
        }
        ready.forEach(item => record(item, outcome));

        reqDone++;
        if (reqDone < totalReq) await new Promise(resolve => setTimeout(resolve, config.intervalMs));
      }

      const stat = [...perItem.values()];
      const okList = stat.filter(v => v.ok === v.total);
      const partialList = stat.filter(v => v.ok > 0 && v.ok < v.total);
      const failStat = stat.filter(v => v.ok === 0);

      const fmtFail = v => v.fails
        .map(f => `    ×${f.mult}［${f.shopNames.join('/')}］${f.error}`)
        .join('\n');
      const partialText = partialList.map(v => `  - ${v.nmId}（成功 ${v.ok}/${v.total} 组）\n${fmtFail(v)}`).join('\n');
      const failText = failStat.map(v => `  - ${v.nmId}\n${fmtFail(v)}`).join('\n');
      const skippedText = skippedAll.map(it => `  - ${it.nmId}`).join('\n');

      const ok = okList.length;
      const fail = failStat.length;
      const partial = partialList.length;

      onProgress && onProgress({
        phase: '完成', done: true,
        ok, fail, partial,
        failList: failText, partialList: partialText, skippedList: skippedText,
        okNmIds: okList.map(v => v.nmId),
        results,
      });

    } finally {
      batchRunning = false;
    }
  }

  // ★ v1.4.2 b5：提交前检查目标店铺是否已存在同 vendorCode 的商品（防重复上架）
  // ★ v1.4.8 修正：vendorCode 为随机格式（BCS-XXXX-nmId），空值时无法预测——
  //   直接跳过查重并记入 skipped（确认框提示），不再用生成值预测（随机值预测无意义）。
  //   正常流程中 doStartBatch 已先补全 vendorCode，故 skipped 通常为空（双保险）。
  // ★ v1.9.0：dupes 增加 shopId —— 一次提交拆成多次请求后，命中只剔除「该商品×该店铺」，其余继续
  //   返回 { dupes: [{nmId, vendorCode, shopId, shopName}], skipped: [{nmId}] }
  async function checkDuplicatedItems(items, shops) {
    const dupes = [], skipped = [];
    const codeToItem = new Map();
    for (const it of items) {
      const code = it.vendorCode;
      if (!code) { skipped.push({ nmId: it.nmId }); continue; }
      const previous = codeToItem.get(code);
      if (previous && String(previous.nmId) !== String(it.nmId)) {
        throw new Error(`不同商品共用了供应商代码 ${code}，请修正后重试`);
      }
      codeToItem.set(code, it);
    }
    const codes = [...codeToItem.keys()];
    if (!codes.length || !shops.length) return { dupes, skipped };

    const seen = new Set();
    for (let i = 0; i < codes.length; i += 50) {
      const vc = codes.slice(i, i + 50).map(encodeURIComponent).join('%2C');
      for (const shop of shops) {
        // 必须查完全部分页；网络错误/业务错误/异常响应一律阻止本批，不能视为没有重复。
        try {
          const pageSize = 100;
          let count = 0;
          for (let page = 1; ; page++) {
            if (page > 1000) throw new Error('查重分页超过上限');
            const url = `${BCS_API_BASE}/shopKeeper/productList/list?filter=ALL&pageNum=${page}&pageSize=${pageSize}&shopId=${encodeURIComponent(shop.id)}&vendorCodeMulti=${vc}`;
            const resp = await bcsApiCall(url);
            if (!resp || resp.code !== 200 || !Array.isArray(resp.rows)) {
              throw new Error(resp?.msg || '查重响应无效');
            }
            for (const row of resp.rows) {
              const it = codeToItem.get(row.vendorCode);
              const key = JSON.stringify([String(shop.id), String(row.vendorCode)]);
              if (it && !seen.has(key)) {
                seen.add(key);
                dupes.push({ nmId: it.nmId, vendorCode: row.vendorCode, shopId: shop.id, shopName: shop.shopName || shop.id });
              }
            }
            count += resp.rows.length;
            const total = resp.total == null ? null : Number(resp.total);
            if (total !== null && (!Number.isSafeInteger(total) || total < 0)) throw new Error('查重 total 无效');
            if (total !== null ? count >= total : resp.rows.length < pageSize) break;
            if (!resp.rows.length) throw new Error('查重分页不完整');
            await new Promise(r => setTimeout(r, 250));
          }
        } catch (e) {
          throw new Error(`重复上架检查失败（${shop.shopName || shop.id}）：${e.message}。本批未提交，请稍后重试。`);
        }
        await new Promise(r => setTimeout(r, 250));
      }
    }
    return { dupes, skipped };
  }
