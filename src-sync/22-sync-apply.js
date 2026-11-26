  // ============================================================
  // 6. 写执行（内容 cards/update + 图片 media/save）
  //    铁律：
  //      1) cards/update 是「全量覆盖」→ 必须先用目标店现值铺满，再覆盖勾选字段
  //      2) documents 原样回传（漏传会被清空）
  //      3) sizes 一律用目标店自己的 chrtID / 条码，绝不夺源店
  //      4) 写入前重读目标卡，提交结果以写入接口响应为准
  // ============================================================
  const SYNC_WRITE_GAP = 2500;   // 商品间间隔（ms）

  function valText(v) {
    if (Array.isArray(v)) return normText(v.join(' | '));
    return normText(v);
  }

  // 用目标店现值铺底 → 按勾选字段覆盖为源店值
  function buildUpdatePayload(srcCard, tgtCard, fields) {
    const p = {
      nmID: tgtCard.nmID,
      vendorCode: tgtCard.vendorCode,
      title: tgtCard.title || '',
      description: tgtCard.description || '',
      dimensions: dimsOf(tgtCard),
      characteristics: ((tgtCard.characteristics) || []).map(c => ({ id: c.id, value: c.value })),
      sizes: ((tgtCard.sizes) || []).map(s => ({
        chrtID: s.chrtID, techSize: s.techSize, wbSize: s.wbSize, skus: s.skus || [],
      })),
      kizMarked: !!tgtCard.kizMarked,
    };
    if (tgtCard.brand) p.brand = tgtCard.brand;
    if (tgtCard.gtin) p.gtin = tgtCard.gtin;
    if (tgtCard.documents != null) p.documents = tgtCard.documents;   // ★ 保命字段

    if (fields.title && normText(srcCard.title)) p.title = srcCard.title;
    if (fields.description && normText(srcCard.description)) p.description = srcCard.description;
    if (fields.brand && normText(srcCard.brand)) p.brand = srcCard.brand;
    if (fields.dimensions) p.dimensions = dimsOf(srcCard);

    if (fields.characteristics) {
      const map = new Map(p.characteristics.map(c => [String(c.id), c]));
      for (const c of (srcCard.characteristics || [])) {
        if (!c || c.id == null) continue;
        if (!valText(c.value)) continue;          // 源店空值不覆盖（保留目标店原值）
        map.set(String(c.id), { id: c.id, value: c.value });
      }
      p.characteristics = Array.from(map.values());
    }
    return p;
  }

  async function wbCardsUpdate(apiKey, payloads) {
    await wbThrottle(apiKey);
    return wbOpenFetch(apiKey, 'POST', WB_API.content + '/content/v2/cards/update', payloads, 60000);
  }

  async function wbMediaSave(apiKey, nmId, urls) {
    await wbThrottle(apiKey);
    return wbOpenFetch(apiKey, 'POST', WB_API.content + '/content/v3/media/save',
      { nmId: nmId, data: urls }, 90000);
  }

  /**
   * 对单个「已上架」目标执行同步
   * @returns {{ok:boolean, wrote:string[], bad:string[], err:string, nmId:number}}
   */
  async function syncOneCell(srcCard, tgtShop, vc, fields) {
    const out = { ok: false, wrote: [], bad: [], err: '', nmId: null, shop: tgtShop.shopName };
    try {
      // 写前重读目标卡（防止预览后被人改过）
      const cur = await wbFindCardByVc(tgtShop.apiKey, vc);
      if (!cur.ok || !cur.card) { out.err = '目标店未找到卡片：' + (cur.err || ''); return out; }
      const tgt = cur.card;
      out.nmId = tgt.nmID;
      if (Number(tgt.subjectID) !== Number(srcCard.subjectID)) {
        out.err = `类目不一致（源 ${srcCard.subjectID} / 目标 ${tgt.subjectID}）`;
        return out;
      }

      // ---- 1) 内容 ----
      const needContent = fields.title || fields.description || fields.brand || fields.characteristics || fields.dimensions;
      if (needContent) {
        const payload = buildUpdatePayload(srcCard, tgt, fields);
        const res = await wbCardsUpdate(tgtShop.apiKey, [payload]);
        if (!res.ok) { out.err = 'cards/update 失败：' + (res.err || ('HTTP ' + res.status)); return out; }
        if (res.data && res.data.error) {
          out.err = 'cards/update 返回错误：' + (res.data.errorText || '') + ' ' +
            JSON.stringify(res.data.additionalErrors || {}).slice(0, 120);
          return out;
        }
        out.wrote.push('内容');
      }

      // ---- 2) 图片 ----
      // ★ media/save 的实测行为（2026-10-29 验证）：
      //   1) 会下载外部 URL（跨店另一个 nm 的 CDN 图也能吃）并按数组顺序写入
      //   2) **每次调用都会重新编码图片**，即使传回同一组图字节也会变（≈1% 体积下降）
      //   3) 只能整组替换，没有"只改第 N 张"的接口
      //   → 因此先用 dHash 逐张比对，只有真检测到差异才整组替换；「强制换图」为兜底
      {
        const urls = photoUrls(srcCard);
        const tgtUrls = photoUrls(tgt);
        let doPhoto = false;
        if (fields.photos && urls.length) {
          if (fields.photosForce) {
            doPhoto = true;
          } else {
            const pi = await comparePhotos(urls, tgtUrls);
            doPhoto = pi.countDiff || pi.changed.length > 0;
            if (!doPhoto && pi.unknown) out.bad.push('图片：部分图片无法比对，已跳过（可勾「强制换图」）');
          }
        }
        if (doPhoto) {
          const mr = await wbMediaSave(tgtShop.apiKey, tgt.nmID, urls);
          if (!mr.ok) { out.bad.push('图片：' + (mr.err || ('HTTP ' + mr.status))); }
          else if (mr.data && mr.data.error) { out.bad.push('图片：' + (mr.data.errorText || '返回 error')); }
          else { out.wrote.push('图片'); }
        }
      }

      out.ok = out.bad.length === 0;
      return out;
    } catch (e) {
      out.err = e.message || String(e);
      return out;
    }
  }

  /**
   * 批量执行（只处理 status==='listed' 且确有差异的格子）
   */
  async function runSyncPlan(plan, srcShop, targets, fields, onProgress) {
    const jobs = [];
    for (const row of plan) {
      if (!row.source) continue;
      for (const cell of row.targets) {
        if (cell.status !== 'listed') continue;
        const diffN = cell.diff.filter(d => !d.same).length;
        const photoWillWrite = fields.photos && photoUrls(row.source).length > 0;
        if (!diffN && !photoWillWrite) continue;
        jobs.push({ row, cell, shop: cell.shop });
      }
    }
    const results = [];
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      onProgress && onProgress({ i, n: jobs.length, text: `${j.row.item.vendorCode} → ${j.shop.shopName}` });
      const r = await syncOneCell(j.row.source, j.shop, j.row.item.vendorCode, fields);
      r.item = j.row.item.vendorCode;
      results.push(r);
      if (i < jobs.length - 1) await wbSleep(SYNC_WRITE_GAP);
    }
    return results;
  }
