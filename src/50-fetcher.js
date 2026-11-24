  // ============================================================
  // 5. 商品详情抓取（云端API模式：直接fetch WB官方接口）
  // ★ v1.4.1 重构：
  //   - detail 请求按批次合并（nm 逗号分隔，5个/批），请求量直接降一个数量级
  //   - 商品失败后不再重试（重试只会加重 Angie 封禁），标记失败由用户手动「刷新商品信息」
  //   - 检测到 403/429 时批次间冷却 15~30 秒，避免后续商品整批陪葬
  // ============================================================

  // 把 detail + card.json 数据填充进 item（单商品）
  // ★ v1.7.0 新增 opts.synthetic：true 时 item.detailSource='synthetic'（card.json 合成伪 detail），
  //   否则 'direct'；该标记仅用于列表角标与上架确认框提示，不参与提交 payload。
  function applyDetailToItem(item, product, cardInfo, opts) {
    if (!product) throw new Error('WB detail 无产品数据');
    if (!cardInfo) throw new Error('card.json 为空');
    // ★ v1.8.7 对齐插件 1.3.5：提交的 wbCardInfo 用清洗后的描述（去 WB 法务声明 + 末尾标点墙）
    //   插件 `assembleBaseProduct` 在 wbCardInfo 入库时就套 withCleanWbCardDescription；
    //   脚本的入库点就是这里（direct / synthetic 两条路径共用），故在此清洗一次即可。
    cardInfo = withCleanWbCardDescription(cardInfo);
    item.detailSource = (opts && opts.synthetic) ? 'synthetic' : 'direct';

    // === 填充商品数据 ===
    // ★ Bug修复：wbDetail 存单个product对象（非完整响应），与HAR抓包结构一致
    item.wbDetail = product;
    item.wbCardInfo = cardInfo;
    item.brand = product.brand || '';
    item.description = cardInfo.description || '';
    // ★ v1.7.4 标题/缩略图兜底：详情页主商品加入列表时 title/thumb 只来自 DOM（无卡片 alt），
    //   若 WB 改版导致 h1 取不到则列表 tooltip 空白 —— 抓取成功后用 card.json 补全。
    //   仅在为空时填充，不覆盖页面提取值（搜索页卡片 alt 更贴近卖家习惯）。
    if (!item.title) item.title = cardInfo.imt_name || '';
    // ★ Bug修复：subjectId/parentId 优先从product获取，card.json在data字段中
    item.subjectId = product.subjectId || cardInfo.data?.subject_id || null;
    item.subjectName = cardInfo.subj_name || '';
    item.parentId = product.subjectParentId || cardInfo.data?.subject_root_id || null;
    item.parentName = cardInfo.subj_root_name || '';

    // 变体（colors）
    let colors = Array.isArray(cardInfo.colors) ? cardInfo.colors : [];
    if (colors.length === 0) colors = [Number(item.nmId)];
    item.colors = colors.slice();
    const firstNmId = colors[0];

    // SKU变体（从detail的sizes解析，nmId 从 colors 数组按索引对应）
    // ★ WB 数据结构：product.sizes[i] 对应 cardInfo.colors[i] 的 nmId
    //   之前漏了 nmId 字段，导致 UI 显示 fallback 为"现价P"
    if (Array.isArray(product.sizes) && product.sizes.length > 0) {
      item.skus = product.sizes.map((s, idx) => ({
        techSize: s.techSize || '',
        wbSize: s.wbSize || '',
        rubPrice: s.price?.product != null ? String(Math.round(s.price.product / 100)) : '',
        nmId: colors[idx] != null ? String(colors[idx]) : '',
      }));
    } else {
      item.skus = [{ techSize: '', wbSize: '', rubPrice: '', nmId: String(firstNmId) }];
    }

    // 现价/原价（卢布，从detail的sizes[0].price解析）
    const firstSize = product.sizes?.[0];
    if (firstSize?.price) {
      item.currentPrice = firstSize.price.product != null ? String(Math.round(firstSize.price.product / 100)) : '';
      // 原价通常在 price.basic 或 sizes[1]
      item.originalPrice = firstSize.price.basic != null ? String(Math.round(firstSize.price.basic / 100)) : '';
    }

    // ★ v1.9.0：包装尺寸/重量不再从 card.json 写入 item —— 一律以价格表（BOSS_DEFAULTS）为准，
    //   避免「抓取值 vs 价格表值」双源漂移；价格表缺尺寸/重量的商品在预校验阶段直接阻止上架。
    //   （parsePackageInfo 仍保留在 45-api-wb.js，供其它链路/诊断使用）

    // 图片URL列表
    const photoCount = cardInfo?.media?.photo_count || 0;
    item.imagesList = generateImageUrls(item.nmId, photoCount);
    item.mainImage = item.imagesList[0] || getMainImageUrl(item.nmId);
    // ★ v1.7.4 缩略图兜底：空则用 basket CDN 主图（详情页加入的商品已在提取时填好，此处兜底搜索页取不到 src 的卡片）
    if (!item.thumb) item.thumb = item.mainImage;

    // 供应商代码（自己生成，不依赖插件；★ v1.4.1 不覆盖用户手填值）
    // ★ v1.4.2 复查修正：统一用当前商品 nmId 生成（M7 语义），不要用 colors[0]（兄弟颜色 nmId），
    //   与 batchShelve / markItemFetchFailed / checkDuplicatedItems 的预测值保持一致
    if (!item.vendorCode) {
      item.vendorCode = generateVendorCode(Number(item.nmId));
    }

    item.fetched = true;
    savePending(pendingList);
  }

  // 抓取失败标记（★ v1.4.1 不再覆盖用户手填的 vendorCode）
  function markItemFetchFailed(item) {
    item.fetched = false;
    item.detailSource = '';   // ★ v1.7.0 清除数据来源标记（重新抓取成功后会重新写入）
    if (!item.vendorCode) item.vendorCode = generateVendorCode(Number(item.nmId));
    item.colors = [Number(item.nmId)];
    item.skus = [{ techSize: '', wbSize: '', rubPrice: '', nmId: String(item.nmId) }];
    savePending(pendingList);
  }

  // 批量抓取详情（detail 逐批请求 + card.json 逐个；★ v1.7.0 流程重排：card.json 先抓，
  // detail 失败时用 card.json 合成伪 detail 兜底，只有两者都失败才标记失败）
  // 返回 { ok, fail, synthetic }；onProgress(text) 用于更新进度提示
  async function fetchItemsBatch(items, onProgress) {
    const BATCH_SIZE = 5;  // ★ detail 每批最多 5 个 nm 合并，避免单请求过大
    let ok = 0, fail = 0, synthetic = 0;

    for (let start = 0; start < items.length; start += BATCH_SIZE) {
      const batch = items.slice(start, start + BATCH_SIZE);
      const end = Math.min(start + BATCH_SIZE, items.length);
      if (onProgress) onProgress(`正在抓取 ${start + 1}~${end}/${items.length}: ${batch.map(it => it.nmId).join(',')}`);

      let detailResp = null;
      if (!IS_SELLER_HOST) {
        // ★ v1.8.0 卖家后台：跳过 detail 请求（unsafeWindow.fetch 跨 www 域必败、seller 域无
        //   wbx__sessionID/__HOST_VERSION__ 指纹），直接走下方 card.json 合成伪 detail（已实验验证可建卡）
        try {
          detailResp = await fetchWbDetailBatch(batch.map(it => it.nmId));
        } catch (e) {
          // detail 请求整体失败 → 本批全部标记失败（★ v1.7.0 抛错路径仅剩防御意义，
          // fetchWbDetailBatch 内部已逐商品 try/catch，正常不会走到这里）
          log.warn(`detail 批量请求失败（${e.message}），本批 ${batch.length} 个商品标记失败`);
          batch.forEach(it => markItemFetchFailed(it));
          fail += batch.length;
          // ★ 403/429/498：WB 风控冷却期，需长冷却后再继续下一批
          //   （v1.7.0：498 加入冷却正则——WB 风控码，插件视同 429；原正则只认 403/429 会连坐后续批次）
          if (/403|429|498/.test(e.message)) {
            const coolMs = 15000 + Math.floor(Math.random() * 15000);
            log.warn(`检测到 WB 反爬限流，冷却 ${Math.round(coolMs / 1000)} 秒后继续下一批`);
            if (onProgress) onProgress(`检测到限流，冷却 ${Math.round(coolMs / 1000)} 秒...`);
            await new Promise(r => setTimeout(r, coolMs));
          }
          continue;
        }
      }

      // 按 nmId 映射 detail 返回的 product
      const productMap = new Map();
      (detailResp?.products || []).forEach(p => productMap.set(String(p.id), p));

      for (const item of batch) {
        try {
          // ★ v1.7.0：card.json 先抓（basket CDN 稳定、不受反爬影响），
          //   detail 失败时用 card.json 合成伪 detail 兜底，尽力保证商品信息完整性
          const cardInfo = await fetchWbCardInfo(item.nmId);
          const product = detailResp ? productMap.get(String(item.nmId)) : null;
          if (product) {
            applyDetailToItem(item, product, cardInfo);   // detailSource='direct'
          } else if (cardInfo) {
            // detail 失败（直连 498/429 重试后仍失败 + 代理被 WB 风控 404）→ card.json 合成兜底
            // ★ v1.8.0 卖家后台：detail 通道本就跳过，此处为常态路径（非失败降级）
            log.warn(IS_SELLER_HOST
              ? `卖家后台模式（nm=${item.nmId}）：使用 card.json 合成伪 detail`
              : `抓取 ${item.nmId} detail 失败，使用 card.json 合成伪 detail 兜底`);
            const syntheticProduct = buildSyntheticDetail(item, cardInfo);
            applyDetailToItem(item, syntheticProduct, cardInfo, { synthetic: true });   // detailSource='synthetic'
            synthetic++;
          } else {
            // card.json 也失败：商品可能不存在或 basket 未生成，真失败
            throw new Error('detail 与 card.json 均失败（商品可能已删除或 basket 未生成）');
          }
          ok++;
          // 只更新该行的显示（不重渲染整个表格，避免用户编辑丢失）
          if (panelEl) updateItemRow(item);
        } catch (e) {
          log.error(`抓取 ${item.nmId} 失败: ${e.message}（可稍后点击「刷新商品信息」重试）`);
          markItemFetchFailed(item);
          fail++;
        }
        // card.json 之间随机小抖动，避免与 detail 请求形成固定节拍
        await new Promise(r => setTimeout(r, 300 + Math.floor(Math.random() * 500)));
      }

      // 批次间随机抖动限流（1200~2500ms，避免固定 800ms 节拍的机器特征）
      if (end < items.length) {
        await new Promise(r => setTimeout(r, 1200 + Math.floor(Math.random() * 1300)));
      }
    }
    return { ok, fail, synthetic };
  }

