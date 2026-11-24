  // ============================================================
  // 2.5 店铺映射（BCS 店铺 ↔ WB 官方 token ↔ 当前登录店铺）
  //     Z-Sid（Seller-Lk 里的店铺 UUID）与 BCS rows[].sid 完全一致，
  //     且该 UUID 出现在 document.cookie 中 → 用它识别"当前登录店铺"
  // ============================================================
  let shopsWithKeys = null;

  async function ensureShops(force) {
    if (shopsWithKeys && !force) return shopsWithKeys;
    const shops = await fetchShopsFromCloud();
    if (!shops || !shops.length) throw new Error('BCS 未返回店铺列表');
    shopsWithKeys = shops;
    return shopsWithKeys;
  }

  function detectCurrentShop(shops) {
    const ck = (typeof document !== 'undefined' && document.cookie) || '';
    const hit = shops.filter(s => s.sid && ck.includes(s.sid));
    if (hit.length === 1) return hit[0];
    if (hit.length > 1) {
      // 极少见：多店 sid 同时在 cookie 里，取最长 sid 命中（最具体）
      hit.sort((a, b) => String(b.sid).length - String(a.sid).length);
      return hit[0];
    }
    return null;
  }

  function shopLabel(s) { return `${s.shopName}#${s.id}`; }

  /**
   * 兜底识别源店铺：document.cookie 可能读不到 HttpOnly 的 sid，
   * 改用「页面 nmId 与哪家店的同名 vc 卡片 nmID 相同」来反推（最多 6 次只读请求）
   */
  async function inferSourceShop(items, shops) {
    const it = (items || []).find(x => x.vendorCode);
    if (!it) return null;
    for (const s of shops) {
      if (!s.apiKey) continue;
      const r = await wbFindCardByVc(s.apiKey, it.vendorCode);
      if (r.ok && r.card && String(r.card.nmID) === String(it.nmId)) return s;
    }
    return null;
  }
