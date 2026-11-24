  // ============================================================
  // 10. 样式注入
  // ============================================================
  function injectStyles() {
    if (document.getElementById('bcs-batch-styles')) return;
    const style = document.createElement('style');
    style.id = 'bcs-batch-styles';
    style.textContent = `
      .bcs-toolbar {
        position: fixed; right: 20px; bottom: 20px; z-index: 999999;
        display: flex; gap: 8px; align-items: center;
        padding: 8px 12px; background: #fff; border: 1px solid #ddd;
        border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.15);
        font-size: 13px; font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      .bcs-toolbar button {
        padding: 5px 12px; border: 1px solid #ccc; border-radius: 4px;
        background: #f5f5f5; cursor: pointer; font-size: 13px; white-space: nowrap;
      }
      .bcs-toolbar button:hover { background: #e8e8e8; }
      .bcs-btn-primary {
        background: #cb2c2c !important; color: #fff !important;
        border: none !important; font-weight: bold !important;
      }
      .bcs-btn-primary:hover { background: #a52323 !important; }
      .bcs-btn-add {
        background: #409eff !important; color: #fff !important;
        border: none !important;
      }
      .bcs-btn-add:hover { background: #337ecc !important; }
      /* ★ v1.7.4 详情页「＋当前商品」按钮（橙，区别于蓝色"添加到待上架列表"） */
      .bcs-tb-cur-btn {
        background: #e6a23c !important; color: #fff !important;
        border: none !important; font-weight: bold !important;
      }
      .bcs-tb-cur-btn:hover { background: #cf9236 !important; }
      .bcs-badge {
        display: inline-block; min-width: 18px; height: 18px; line-height: 18px;
        text-align: center; background: #cb2c2c; color: #fff; border-radius: 9px;
        font-size: 11px; padding: 0 5px; margin-left: 2px;
      }

      .bcs-panel-mask {
        position: fixed; inset: 0; z-index: 999998;
        background: rgba(0,0,0,0.3);
      }
      .bcs-panel {
        position: fixed; right: 0; top: 0; bottom: 0; width: 940px; z-index: 999999;
        background: #f8f8f8; box-shadow: -2px 0 12px rgba(0,0,0,0.2);
        display: flex; flex-direction: column; font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      .bcs-panel-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 12px 16px; background: #cb2c2c; color: #fff;
      }
      .bcs-panel-header h3 { margin: 0; font-size: 15px; }
      .bcs-panel-close {
        background: none; border: none; color: #fff; font-size: 28px;
        cursor: pointer; line-height: 1;
        width: 44px; height: 44px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 6px;
      }
      .bcs-panel-close:hover { background: rgba(255,255,255,0.15); }
      .bcs-panel-body { flex: 1; overflow-y: auto; padding: 12px; }

      .bcs-section {
        background: #fff; border: 1px solid #e0e0e0; border-radius: 6px;
        margin-bottom: 10px; overflow: hidden;
      }
      .bcs-section-title {
        padding: 8px 12px; font-size: 13px; font-weight: bold;
        background: #fafafa; border-bottom: 1px solid #e0e0e0;
        display: flex; justify-content: space-between; align-items: center;
      }
      .bcs-section-body { padding: 10px 12px; }

      .bcs-toggle-group {
        display: flex; align-items: center; margin-bottom: 8px;
      }
      .bcs-toggle-group:last-child { margin-bottom: 0; }
      .bcs-toggle-label {
        display: inline-block; width: 60px; font-size: 13px; color: #555;
      }
      .bcs-toggle-btns { display: flex; gap: 0; }
      .bcs-toggle-btn {
        padding: 4px 14px; border: 1px solid #ccc; background: #fff;
        cursor: pointer; font-size: 12px;
      }
      .bcs-toggle-btn:first-child { border-radius: 4px 0 0 4px; }
      .bcs-toggle-btn:last-child { border-radius: 0 4px 4px 0; border-left: none; }
      .bcs-toggle-btn.active { background: #409eff; color: #fff; border-color: #409eff; }

      .bcs-field {
        display: flex; align-items: center; margin-bottom: 6px; font-size: 13px;
      }
      .bcs-field label { width: 100px; color: #555; }
      .bcs-field input[type="text"], .bcs-field input[type="number"], .bcs-field select {
        flex: 1; padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;
      }

      .bcs-shop-row {
        display: flex; align-items: center; gap: 6px; padding: 6px 0;
        border-bottom: 1px solid #f0f0f0; font-size: 12px;
      }
      .bcs-shop-row:last-child { border-bottom: none; }
      .bcs-shop-row input[type="checkbox"] { margin: 0; }
      .bcs-shop-row .bcs-shop-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .bcs-shop-row select { padding: 2px 4px; font-size: 12px; max-width: 90px; }
      .bcs-shop-row input[type="number"] { width: 50px; padding: 2px 4px; font-size: 12px; }
      /* ★ v1.9.0：上架倍数下拉（与仓库下拉同排，随店铺配置记忆） */
      .bcs-shop-row select[data-field="mult"] {
        max-width: 62px; padding: 2px 2px; font-size: 12px;
        font-weight: bold; color: #cb2c2c;
      }

      .bcs-pending-item {
        display: flex; align-items: center; gap: 8px; padding: 6px 8px;
        border-bottom: 1px solid #f0f0f0; font-size: 12px;
      }
      .bcs-pending-item:last-child { border-bottom: none; }
      .bcs-pending-item img { width: 36px; height: 36px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
      .bcs-pending-item-info { flex: 1; overflow: hidden; }
      .bcs-pending-item-nm { color: #888; font-size: 11px; }
      .bcs-pending-item-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .bcs-pending-item-del {
        background: none; border: none; color: #cb2c2c; cursor: pointer;
        font-size: 16px; padding: 0 4px;
      }
      .bcs-empty { text-align: center; color: #999; padding: 16px; font-size: 12px; }

      .bcs-progress {
        padding: 8px 12px; background: #fff3cd; border-top: 1px solid #ffeaa7;
        font-size: 12px; color: #856404;
      }
      .bcs-panel-footer {
        padding: 10px 12px; background: #fff; border-top: 1px solid #e0e0e0;
        display: flex; gap: 8px;
      }
      .bcs-panel-footer button { flex: 1; padding: 8px; border-radius: 4px; cursor: pointer; font-size: 13px; }
      .bcs-btn-clear-list { background: #f5f5f5; border: 1px solid #ccc; }
      .bcs-btn-start { background: #cb2c2c; color: #fff; border: none; font-weight: bold; }
      .bcs-btn-start:hover { background: #a52323; }
      .bcs-btn-start:disabled { background: #ccc; cursor: not-allowed; }

      .bcs-checkbox {
        position: absolute; top: 6px; left: 6px; z-index: 99;
        width: 20px; height: 20px; cursor: pointer; accent-color: #cb2c2c;
      }

      /* ---- 待上架商品表格 ---- */
      .bcs-pending-table {
        width: 100%; border-collapse: collapse; font-size: 12px;
      }
      .bcs-pending-table th {
        background: #f0f0f0; padding: 6px 4px; text-align: center;
        border-bottom: 1px solid #ddd; font-weight: 600; white-space: nowrap;
        position: sticky; top: 0; z-index: 1;
      }
      .bcs-pending-table td {
        padding: 4px; border-bottom: 1px solid #f0f0f0; text-align: center;
        vertical-align: middle;
      }
      .bcs-pending-table tr:hover td { background: #fafafa; }
      .bcs-pending-table img.thumb {
        width: 40px; height: 40px; object-fit: cover; border-radius: 4px;
        display: block; margin: 0 auto;
      }
      .bcs-pending-table input[type="text"],
      .bcs-pending-table input[type="number"] {
        width: 100%; max-width: 80px; padding: 3px 4px;
        border: 1px solid #ddd; border-radius: 3px; font-size: 12px;
        text-align: center;
      }
      /* ★ v1.9.0：输入框仅剩供应商代码列（售价/尺寸已改只读），黄底默认值标记随之废弃 */
      .bcs-pending-table input:focus { border-color: #409eff; outline: none; }
      .bcs-pending-table .col-idx { width: 30px; color: #888; }
      .bcs-pending-table .col-img { width: 50px; }
      .bcs-pending-table .col-code { width: 100px; }
      .bcs-pending-table .col-sku { width: 130px; text-align: left; }
      .bcs-pending-table .col-sku .sku-list {
        font-size: 11px; line-height: 1.4; color: #555;
        max-height: 56px; overflow-y: auto;
      }
      /* ★ v1.9.0：价格/包装全只读（上架价 = 价格表最低售价 × 店铺倍数），逐行输入框已移除 */
      .bcs-pending-table .col-minprice { width: 72px; color: #555; }
      .bcs-pending-table .col-shelfprice { width: 160px; text-align: left; }
      .bcs-pending-table .col-rub { width: 88px; color: #888; }
      .bcs-pending-table .col-dim { width: 130px; }
      .bcs-pending-table .col-action { width: 40px; }
      .bcs-price-line {
        display: flex; justify-content: space-between; gap: 8px;
        font-size: 11px; line-height: 1.5; color: #555;
      }
      .bcs-price-line b { color: #cb2c2c; font-weight: 600; }
      .bcs-price-line-idle { opacity: .45; }
      .bcs-dim-text { font-size: 11px; color: #666; white-space: nowrap; }
      .bcs-warn-text { color: #cb2c2c; font-weight: bold; font-size: 11px; }
      /* ★ v1.9.0：未匹配价格表的行整行红底告警（这类商品会被阻止上架） */
      .bcs-pending-table tr.row-no-boss td { background: #fef0f0; }
      .bcs-pending-table tr.row-no-boss:hover td { background: #fde2e2; }
      .bcs-alert-bar {
        padding: 6px 8px; margin: 0 0 6px; background: #fef0f0; border: 1px solid #fbc4c4;
        border-radius: 4px; font-size: 11px; color: #cb2c2c; line-height: 1.5;
      }
      .bcs-pending-table .btn-del {
        background: none; border: none; color: #cb2c2c; cursor: pointer;
        font-size: 16px; padding: 0 4px;
      }
      .bcs-pending-table .btn-del:hover { color: #a52323; }
      .bcs-pending-table .row-fetched-true td { background: #f0f9eb; }
      .bcs-pending-table .row-fetched-true:hover td { background: #e8f5e0; }
      .bcs-fetch-status {
        padding: 4px 8px; font-size: 11px; color: #888;
      }
      .bcs-btn-fetch {
        padding: 3px 10px; font-size: 11px; border: 1px solid #409eff;
        border-radius: 3px; background: #ecf5ff; color: #409eff; cursor: pointer;
      }
      .bcs-btn-fetch:hover { background: #409eff; color: #fff; }
      .bcs-btn-fetch:disabled { background: #f5f5f5; color: #ccc; border-color: #ddd; cursor: not-allowed; }

      /* ---- 已上架商品标记 ---- */
      .bcs-listed-badge {
        position: absolute; top: 4px; right: 4px; z-index: 99;
        background: #67c23a; color: #fff; font-size: 11px; font-weight: bold;
        padding: 2px 8px; border-radius: 10px; line-height: 1.4;
        font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 1px 4px rgba(0,0,0,0.2); pointer-events: none;
        white-space: nowrap;
      }
      .bcs-listed-detail-banner {
        position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
        background: #67c23a; color: #fff; text-align: center;
        padding: 8px 16px; font-size: 14px; font-weight: bold;
        font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      }
      .bcs-listed-detail-banner .bcs-listed-close {
        float: right; cursor: pointer; font-size: 18px; line-height: 1;
        margin-top: -2px; opacity: 0.8;
      }
      .bcs-listed-detail-banner .bcs-listed-close:hover { opacity: 1; }
      .bcs-listed-detail-banner .bcs-listed-shops {
        font-size: 12px; font-weight: normal; opacity: 0.9; margin-top: 2px;
      }
      .bcs-tb-listed-btn {
        background: #67c23a !important; color: #fff !important;
        border: none !important; font-weight: bold !important;
      }
      .bcs-tb-listed-btn:hover { background: #5daf37 !important; }
      .bcs-tb-listed-btn:disabled { background: #c0c0c0 !important; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  }

