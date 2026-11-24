  // ============================================================
  // 2.6 卖家后台「所有商品」列表页读取
  //     只用 data-testid（class 是 CSS Modules 哈希，随版本变化）
  // ============================================================
  function sellerRows() {
    return Array.from(document.querySelectorAll('tr[data-testid^="all-goods-table-row-"]'));
  }

  function rowIsSelected(tr) {
    const cb = tr.querySelector('input[data-testid^="main-table-checkbox-row-"]')
      || tr.querySelector('td[data-testid$="_selection"] input[type="checkbox"]');
    return !!(cb && cb.checked);
  }

  function rowNmId(tr) {
    const el = tr.querySelector('[data-testid^="card-nmID-text"]');
    const m = el && String(el.textContent || '').match(/(\d{5,})/);
    if (m) return m[1];
    const img = tr.querySelector('img[data-testid^="main-table-info-cell-image-"]');
    const m2 = img && String(img.getAttribute('src') || '').match(/\/vol\d+\/part\d+\/(\d+)\//);
    return m2 ? m2[1] : '';
  }

  function rowVendorCode(tr) {
    const el = tr.querySelector('[data-testid^="card-vendorCode-text"]');
    if (!el) return '';
    // 形如「卖家商品编码: BCS-XXXX-123」→ 去标签，保留完整原文（兼容 -20 等后缀）
    return String(el.textContent || '').replace(/^[\s\S]*?[:：]\s*/, '').trim();
  }

  function rowTitle(tr) {
    const el = tr.querySelector('[data-testid="card-title-text"]');
    return el ? String(el.textContent || '').trim() : '';
  }

  // 读取当前页面已勾选商品
  function getSellerSelectedRows() {
    const out = [];
    for (const tr of sellerRows()) {
      if (!rowIsSelected(tr)) continue;
      const vc = rowVendorCode(tr);
      const nmId = rowNmId(tr);
      if (!vc && !nmId) continue;
      out.push({ nmId, vendorCode: vc, title: rowTitle(tr), el: tr });
    }
    return out;
  }

  function countSellerSelected() {
    let n = 0;
    for (const tr of sellerRows()) if (rowIsSelected(tr)) n++;
    return n;
  }
