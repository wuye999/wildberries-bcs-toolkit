  // ============================================================
  // 7. 补上架（未上架店铺 → BCS POST /system/wbCollection/wb/new）
  //    payload 字段与上架脚本 src/65-shelver.js 严格对齐（含拼写 packagLength/weightBrutto）
  //    数据来源：源卡（content API）+ card.json（basket CDN）
  // ============================================================
  const SHELVE_WH_CACHE_KEY = 'bcs_sync_wh_cache_v1';

  async function getShopWarehouses(shopId) {
    const cache = gmLoad(SHELVE_WH_CACHE_KEY, {}) || {};
    if (cache[shopId] && cache[shopId].length) return cache[shopId];
    const list = await fetchWarehousesFromCloud(shopId);
    cache[shopId] = list || [];
    gmSave(SHELVE_WH_CACHE_KEY, cache);
    return cache[shopId];
  }

  function pickMoscowWarehouse(list) {
    return (list || []).find(w => /莫斯科|москва/i.test(String(w.name || ''))) || null;
  }

  // 按 vendorCode 取源店 BCS 行（拿默认价/库存/仓库）
  async function fetchBcsRowByVc(shopId, vc) {
    const q = encodeURIComponent(String(vc));
    const resp = await bcsApiCall(
      `/shopKeeper/productList/list?filter=ALL&pageNum=1&pageSize=10&shopId=${shopId}&vendorCodeMulti=${q}`
    );
    if (!resp || resp.code !== 200 || !Array.isArray(resp.rows)) throw new Error('按供应商代码查询失败，请稍后重试');
    return (resp.rows || []).find(r => String(r.vendorCode) === String(vc)) || null;
  }

  function bcsRowDefaults(row) {
    const sz = (row && row.sizeList && row.sizeList[0]) || {};
    const st = (sz.stockList || [])[0] || {};
    return {
      price: sz.price != null ? Number(sz.price) : null,
      stock: st.amount != null ? Number(st.amount) : null,
      warehouseId: st.warehouseId || null,
    };
  }

  function ceilNum(v, dft) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.ceil(n) : dft;
  }

  function buildShelveBody(opts) {
    const srcCard = opts.srcCard;
    const cardInfo = withCleanWbCardDescription(opts.cardInfo);
    const data = (cardInfo && cardInfo.data) || {};
    const offerUrl = buildWbProductUrl(srcCard.nmID);
    const images = photoUrls(srcCard);
    const video = getWbProductVideoUrl(srcCard.nmID, cardInfo);
    const d = dimsOf(srcCard);
    const pkg = parsePackageInfo(cardInfo) || {};
    const len = ceilNum(d.length, ceilNum(pkg.length, 30));
    const wid = ceilNum(d.width, ceilNum(pkg.width, 30));
    const hei = ceilNum(d.height, ceilNum(pkg.height, 10));
    const wgt = (d.weightBrutto != null && d.weightBrutto > 0) ? d.weightBrutto
      : (Number(pkg.weight) > 0 ? Number(pkg.weight) : 1);
    const carryBrand = opts.carryBrand == null ? !!userConfig.settings.carryBrand : !!opts.carryBrand;

    // sizes 重写为 BCS 期望结构（与 65-shelver 一致）
    const wbDetail = JSON.parse(JSON.stringify(
      buildSyntheticDetail({ nmId: srcCard.nmID, title: srcCard.title }, cardInfo)
    ));
    wbDetail.sizes = [{
      origName: 0,
      name: '',
      price: Number(opts.price).toFixed(2),
      vendorCode: opts.vendorCode,
    }];
    wbDetail.brand = carryBrand ? (srcCard.brand || '') : '';

    return {
      shop: JSON.stringify([{
        id: opts.shopId,
        warehouseId: Number(opts.warehouseId),
        warehouseQuantity: normalizeWarehouseQuantity(opts.quantity),
      }]),
      offerDIY: '',
      brandStatus: carryBrand,
      oModel: true,
      status: '1',
      collectionType: '0',
      offerUrl,
      shopDatas: [{
        nmId: null,                       // ★ 必须置空，带值会被后端当"更新已有卡"
        wbDetail: JSON.stringify(wbDetail),
        name: srcCard.title || (cardInfo && cardInfo.imt_name) || '',
        subjectId: srcCard.subjectID,
        parentId: data.subject_root_id || 0,
        wbCardInfo: JSON.stringify(cardInfo),
        images: images.join(';'),
        video,
        videos: video,
        mainImage: images[0] || '',
        packagLength: len,                // 注意拼写
        packagWidth: wid,
        packagHeight: hei,
        weightBrutto: String(wgt),
        vendorCode: opts.vendorCode,
        brand: carryBrand ? (srcCard.brand || '') : '',
        hsCode: null,
        subjectName: (cardInfo && cardInfo.subj_name) || '',
        parentName: (cardInfo && cardInfo.subj_root_name) || '',
        sourceSku: String(srcCard.nmID),
        offerUrl,
      }],
      mode: 1,
      mergeCards: 1,                      // 1=不合并
      carryBrand: carryBrand ? 0 : 1,     // 注意与 brandStatus 反向
      customBrand: null,
      titleSuffix: null,
      vendorCodePrefix: null,
      aiRewrite: false,
      aiRetouch: false,
      aiRetouchTemplateId: null,
      imgUploadMode: 0,
      removeBrandText: false,
    };
  }

  /**
   * 单店补上架
   * @param {object} srcCard 源店卡（content API）
   * @param {object} shop    目标店铺（含 apiKey）
   * @param {object} cfg     {vendorCode, price, quantity, warehouseId}
   */
  async function shelveOne(srcCard, shop, cfg) {
    cfg = { ...cfg, carryBrand: !!userConfig.settings.carryBrand };
    const out = { ok: false, shop: shop.shopName, nmId: null, wrote: [], bad: [], err: '', vc: cfg.vendorCode };
    try {
      if (!cfg.vendorCode) throw new Error('vendorCode 为空');
      if (!Number.isFinite(Number(cfg.price)) || !(Number(cfg.price) >= 0.01)) throw new Error('价格无效（需至少 0.01）');
      cfg.quantity = normalizeWarehouseQuantity(cfg.quantity);
      if (!photoUrls(srcCard).length) throw new Error('源卡无图片，无法上架');

      let cardInfo = await fetchWbCardInfo(srcCard.nmID);
      if (!cardInfo || !cardInfo.imt_id) throw new Error('card.json 拉取失败（basket CDN）');
      cardInfo = withCleanWbCardDescription(cardInfo);

      // ★ card.json 是 CDN 静态快照，可能滞后（刚改完描述就补上架时会拿到旧文案）。
      //   content API（源卡 srcCard）是权威实时源 → 用它覆盖快照中的关键字段，
      //   保证新卡描述/标题/类目与"现在"的源商品一致。BCS 后端从 wbCardInfo 解析这些字段建卡。
      out.notes = [];
      {
        const stale = [];
        if (srcCard.description && normText(cardInfo.description) !== normText(srcCard.description)) {
          cardInfo.description = srcCard.description; stale.push('描述');
        }
        if (srcCard.title && cardInfo.imt_name !== srcCard.title) {
          cardInfo.imt_name = srcCard.title; stale.push('标题');
        }
        if (srcCard.subjectName && cardInfo.subj_name && cardInfo.subj_name !== srcCard.subjectName) {
          cardInfo.subj_name = srcCard.subjectName; stale.push('类目名');
        }
        if (cardInfo.data && srcCard.subjectID && Number(cardInfo.data.subject_id) !== Number(srcCard.subjectID)) {
          cardInfo.data.subject_id = Number(srcCard.subjectID); stale.push('类目ID');
        }
        if (stale.length) {
          out.notes.push(`card.json 快照滞后（${stale.join('/')}），已用 content API 实时值覆盖`);
          log.warn('card.json 快照滞后，已覆盖:', stale.join('/'));
        }
      }

      let whId = Number(cfg.warehouseId) || 0;
      if (!whId) {
        const whs = await getShopWarehouses(shop.id);
        const m = pickMoscowWarehouse(whs);
        if (!m) throw new Error('该店未找到莫斯科仓库');
        whId = m.id;
      }

      const body = buildShelveBody({
        shopId: shop.id,
        warehouseId: whId,
        quantity: cfg.quantity,
        carryBrand: cfg.carryBrand,
        price: Number(cfg.price),
        vendorCode: cfg.vendorCode,
        srcCard,
        cardInfo,
      });

      // 预览与执行可能相隔很久；写入前再次查重，查询失败由 catch 阻止提交。
      const existing = await fetchBcsRowByVc(shop.id, cfg.vendorCode);
      if (existing) {
        out.ok = true;
        out.notes.push('目标店铺已存在相同供应商代码，本次未重复提交');
        return out;
      }
      const res = await bcsApiCall('/system/wbCollection/wb/new', { method: 'POST', data: body, timeout: 90000 });
      if (!res || res.code !== 200) {
        out.err = 'wb/new 失败：' + ((res && (res.msg || res.code)) || '无响应');
        return out;
      }
      out.wrote.push('上架');

      // 回读：轮询 Content API 等卡片出现（BCS 建卡是异步队列）
      let nm = null;
      for (let i = 0; i < 6; i++) {
        await wbSleep(5000);
        const r = await wbFindCardByVc(shop.apiKey, cfg.vendorCode);
        if (r.ok && r.card) { nm = r.card.nmID; break; }
      }
      out.nmId = nm;
      if (!nm) out.bad.push('已提交，但 30 秒内未在 WB 查到卡片（可能仍在建卡队列，稍后刷新预览确认）');
      out.ok = true;
      return out;
    } catch (e) {
      out.err = (e && e.message) || String(e);
      return out;
    }
  }
