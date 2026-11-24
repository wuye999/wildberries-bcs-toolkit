  // ============================================================
  // 3. 同步计划与字段 diff（纯读，不写）
  //    源/目标两侧都用 WB 官方 content/v2/get/cards/list 按 vendorCode 精确定位
  // ============================================================

  // 同步字段定义（key 与面板复选框一致）
  const SYNC_FIELDS = [
    { key: 'title', label: '标题' },
    { key: 'description', label: '描述' },
    { key: 'brand', label: '品牌' },
    { key: 'characteristics', label: '属性' },
    { key: 'dimensions', label: '尺寸重量' },
    { key: 'photos', label: '图片' },
  ];

  function normText(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function charcMap(card) {
    const map = new Map();
    for (const c of (card && card.characteristics) || []) {
      const id = c.id != null ? String(c.id) : '';
      if (!id) continue;
      let v = c.value;
      if (Array.isArray(v)) v = v.join(' | ');
      map.set(id, { name: c.name || '', value: normText(v) });
    }
    return map;
  }

  function dimsOf(card) {
    const d = (card && card.dimensions) || {};
    return {
      length: d.length == null ? null : Number(d.length),
      width: d.width == null ? null : Number(d.width),
      height: d.height == null ? null : Number(d.height),
      weightBrutto: d.weightBrutto == null ? null : Number(d.weightBrutto),
    };
  }

  function dimsText(d) {
    return [d.length, d.width, d.height, d.weightBrutto].map(x => (x == null ? '—' : x)).join(' × ');
  }

  function photoUrls(card) {
    return ((card && card.photos) || []).map(p => (p && p.big) || '').filter(Boolean);
  }

  // 按 vendorCode 精确查一张卡（textSearch 可能命中标题，故客户端再过滤一次）
  async function wbFindCardByVc(apiKey, vc) {
    const key = String(vc || '').trim();
    if (!key) return { ok: false, card: null, err: 'vendorCode 为空' };
    const res = await wbCardsList(apiKey, { limit: 100, textSearch: key, withPhoto: 0 });
    if (!res.ok) return { ok: false, card: null, err: res.err || ('HTTP ' + res.status) };
    const hit = res.cards.find(c => String(c.vendorCode || '') === key);
    return { ok: true, card: hit || null, err: hit ? '' : '未找到该 vendorCode' };
  }

  /**
   * 对比源卡与目标卡，返回逐字段差异
   * @returns {Array<{key,label,src,tgt,same,note}>}
   */
  function diffCards(srcCard, tgtCard, enabledKeys, photoInfo) {
    const rows = [];
    const on = (k) => !enabledKeys || enabledKeys.indexOf(k) >= 0;

    if (on('title')) {
      const a = normText(srcCard.title), b = normText(tgtCard.title);
      rows.push({ key: 'title', label: '标题', src: a, tgt: b, same: a === b });
    }
    if (on('description')) {
      const a = normText(srcCard.description), b = normText(tgtCard.description);
      rows.push({
        key: 'description', label: '描述',
        src: a.length + ' 字', tgt: b.length + ' 字', same: a === b,
        note: a === b ? '' : '内容不同（长度 ' + b.length + ' → ' + a.length + '）',
        raw: { src: srcCard.description || '', tgt: tgtCard.description || '' },
      });
    }
    if (on('brand')) {
      const a = normText(srcCard.brand), b = normText(tgtCard.brand);
      rows.push({ key: 'brand', label: '品牌', src: a || '（空）', tgt: b || '（空）', same: a === b });
    }
    if (on('characteristics')) {
      const sm = charcMap(srcCard), tm = charcMap(tgtCard);
      let diffN = 0, onlyTgtN = 0;
      for (const [id, sv] of sm) {
        const tv = tm.get(id);
        if (!tv) { diffN++; continue; }
        if (sv.value !== tv.value) diffN++;
      }
      for (const [id] of tm) if (!sm.has(id)) onlyTgtN++;
      rows.push({
        key: 'characteristics', label: '属性',
        src: sm.size + ' 条', tgt: tm.size + ' 条', same: diffN === 0,
        note: (diffN ? diffN + ' 条不同' : '') + (onlyTgtN ? (diffN ? '；' : '') + onlyTgtN + ' 条目标店独有（保留）' : ''),
      });
    }
    if (on('dimensions')) {
      const a = dimsOf(srcCard), b = dimsOf(tgtCard);
      const same = ['length', 'width', 'height', 'weightBrutto'].every(k => a[k] === b[k]);
      rows.push({ key: 'dimensions', label: '尺寸重量', src: dimsText(a) + ' cm/kg', tgt: dimsText(b) + ' cm/kg', same });
    }
    if (on('photos')) {
      const a = photoUrls(srcCard), b = photoUrls(tgtCard);
      let same, note;
      if (photoInfo) {
        same = photoInfo.same;
        if (photoInfo.countDiff) {
          note = `张数 ${photoInfo.tgtCount} → ${photoInfo.srcCount}，整组替换`;
        } else if (photoInfo.changed.length) {
          note = `${photoInfo.changed.length} 张内容不同（第 ${photoInfo.changed.join('、')} 张），整组替换`;
        } else if (photoInfo.unknown) {
          note = '部分图片取不到，无法逐张比对（可勾「强制换图」兜底）';
        } else {
          note = '逐张比对一致';
        }
      } else {
        same = a.length === b.length;
        note = a.length === b.length ? '仅比张数（未做逐张比对）' : '张数不同 → 整组替换';
      }
      rows.push({ key: 'photos', label: '图片', src: a.length + ' 张', tgt: b.length + ' 张', same, note });
    }
    return rows;
  }

  /**
   * 生成同步计划（item × targetShop 矩阵 + 差异）
   * @param {Array} items      [{nmId, vendorCode, title}]
   * @param {Object} sourceShop 源店铺（含 apiKey）
   * @param {Array} targetShops 目标店铺数组（含 apiKey）
   * @param {Array} enabledKeys 启用的字段 key
   * @param {Function} onProgress
   */
  async function buildSyncPlan(items, sourceShop, targetShops, enabledKeys, onProgress) {
    if (!sourceShop || !sourceShop.apiKey) throw new Error('源店铺缺少 apiKey');
    const plan = [];
    let seq = 0;
    const total = items.length * (targetShops.length + 1);

    for (const it of items) {
      const row = {
        item: it, source: null, sourceErr: '', targets: [],
      };
      onProgress && onProgress({ done: seq, total, text: `读取源卡 ${it.vendorCode || it.nmId}` });
      const srcRes = await wbFindCardByVc(sourceShop.apiKey, it.vendorCode);
      seq++;
      if (!srcRes.ok || !srcRes.card) {
        row.sourceErr = srcRes.err || '源店铺未找到该 vendorCode';
      } else {
        row.source = srcRes.card;
      }

      for (const shop of targetShops) {
        onProgress && onProgress({ done: seq, total, text: `${it.vendorCode} → ${shop.shopName}` });
        const cell = { shop, status: 'error', nmId: null, err: '', diff: [], risk: [] };
        try {
          const res = await wbFindCardByVc(shop.apiKey, it.vendorCode);
          seq++;
          if (!res.ok) {
            cell.status = 'error';
            cell.err = res.err || '查询失败';
          } else if (!res.card) {
            cell.status = 'absent';
          } else {
            cell.status = 'listed';
            cell.nmId = res.card.nmID;
            cell._card = res.card;
            if (!row.source) {
              cell.risk.push('源店铺未取到卡片，无法比对');
            } else if (Number(row.source.subjectID) !== Number(res.card.subjectID)) {
              cell.risk.push(`类目不一致（源 ${row.source.subjectID} / 目标 ${res.card.subjectID}），不可同步`);
              cell.status = 'blocked';
            } else {
              let photoInfo = null;
              if (enabledKeys.indexOf('photos') >= 0) {
                onProgress && onProgress({ done: seq, total, text: `${it.vendorCode} → ${shop.shopName} 逐张比对图片` });
                photoInfo = await comparePhotos(photoUrls(row.source), photoUrls(res.card));
                cell._photoInfo = photoInfo;
              }
              cell.diff = diffCards(row.source, res.card, enabledKeys, photoInfo);
              if (!normText(res.card.brand) && normText(row.source.brand)) {
                cell.risk.push('目标店品牌为空，写入品牌可能需品牌授权');
              }
            }
          }
        } catch (e) {
          seq++;
          cell.status = 'error';
          cell.err = e.message;
        }
        row.targets.push(cell);
      }
      plan.push(row);
    }
    return plan;
  }
