  // ============================================================
  // 10. 样式注入（与跨店同步保持统一的现代清爽风格）
  // ============================================================
  function injectStyles() {
    if (document.getElementById('bcs-batch-styles')) return;
    const style = document.createElement('style');
    style.id = 'bcs-batch-styles';
    style.textContent = `
      /* ---- 公共基础 ---- */
      .bcs-toolbar, .bcs-toolbar *,
      .bcs-panel, .bcs-panel *,
      #bcs-toast {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif;
      }

      /* ---- 页面底部悬浮工具栏 ---- */
      .bcs-toolbar {
        position: fixed; right: 20px; bottom: 20px; z-index: 999999;
        display: flex; align-items: center; gap: 6px;
        padding: 6px 8px;
        background: rgba(255, 255, 255, 0.97);
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        box-shadow: 0 8px 28px rgba(15, 23, 42, 0.14), 0 2px 6px rgba(15, 23, 42, 0.06);
        backdrop-filter: blur(10px);
        font-size: 13px; color: #1f2937; line-height: 1.4;
      }
      .bcs-tb-divider {
        width: 1px; height: 20px; background: #e5e7eb; margin: 0 2px; flex-shrink: 0;
      }
      .bcs-tb-count {
        display: inline-flex; align-items: center; justify-content: center;
        padding: 4px 9px; border-radius: 999px;
        background: #f3f4f6; color: #6b7280;
        font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums;
        white-space: nowrap; transition: background .15s, color .15s;
      }
      .bcs-tb-count.has-sel {
        background: #f0eeff; color: #5b47e0;
      }
      .bcs-toolbar button {
        display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        padding: 6px 11px; border: 1px solid transparent; border-radius: 8px;
        background: #f8f9fc; color: #374151;
        cursor: pointer; font-size: 13px; font-weight: 500; line-height: 1.2;
        white-space: nowrap;
        transition: background .15s, border-color .15s, color .15s, box-shadow .15s;
      }
      .bcs-toolbar button:hover {
        background: #eef0f6; color: #111827;
      }
      .bcs-toolbar button:disabled {
        opacity: 0.5; cursor: not-allowed;
      }
      .bcs-toolbar .bcs-tb-ghost {
        background: transparent; color: #4b5563; padding: 6px 8px; font-size: 12px;
      }
      .bcs-toolbar .bcs-tb-ghost:hover {
        background: #f3f4f6; color: #111827;
      }
      .bcs-toolbar .bcs-btn-add {
        background: #f0eeff; color: #4c38cc; border-color: #d8d2fc; font-weight: 600;
      }
      .bcs-toolbar .bcs-btn-add:hover {
        background: #e4dfff; border-color: #c4b8fa;
      }
      .bcs-toolbar .bcs-btn-add.active {
        background: #5b47e0; color: #fff; border-color: #5b47e0;
      }
      .bcs-toolbar .bcs-btn-add.active:hover {
        background: #4c38cc;
      }
      .bcs-toolbar .bcs-tb-cur-btn {
        background: #fffbeb; color: #b45309; border-color: #fde68a; font-weight: 600;
      }
      .bcs-toolbar .bcs-tb-cur-btn:hover {
        background: #fef3c7; border-color: #fcd34d;
      }
      .bcs-toolbar .bcs-btn-panel {
        background: #5b47e0; color: #fff; font-weight: 600;
        box-shadow: 0 1px 2px rgba(91, 71, 224, 0.28);
      }
      .bcs-toolbar .bcs-btn-panel:hover {
        background: #4c38cc; color: #fff;
      }
      .bcs-badge {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
        background: rgba(255, 255, 255, 0.22); color: #fff;
        font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
      }
      .bcs-badge.has-items {
        background: #fff; color: #5b47e0;
      }
      .bcs-toolbar .bcs-tb-listed-btn {
        background: #f0fdf4; color: #15803d; border-color: #bbf7d0; font-weight: 500;
      }
      .bcs-toolbar .bcs-tb-listed-btn:hover {
        background: #dcfce7; border-color: #86efac; color: #166534;
      }
      .bcs-toolbar .bcs-tb-listed-btn:disabled {
        background: #f3f4f6; color: #9ca3af; border-color: #e5e7eb;
      }

      /* ---- 非阻塞 Toast ---- */
      #bcs-toast {
        position: fixed; top: 20px; right: 20px; z-index: 9999999;
        background: rgba(17, 24, 39, 0.94); color: #fff;
        padding: 10px 16px; border-radius: 10px;
        font-size: 13px; line-height: 1.45; max-width: 380px;
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.28);
        pointer-events: none;
        opacity: 0; transform: translateY(-6px);
        transition: opacity .22s ease, transform .22s ease;
      }
      #bcs-toast.show {
        opacity: 1; transform: translateY(0);
      }

      /* ---- 遮罩 & 右侧抽屉面板 ---- */
      .bcs-panel-mask {
        position: fixed; inset: 0; z-index: 999998;
        background: rgba(15, 23, 42, 0.38);
        backdrop-filter: blur(2px);
      }
      .bcs-panel {
        position: fixed; right: 0; top: 0; bottom: 0;
        width: min(1040px, 95vw); z-index: 999999;
        background: #f6f7fb;
        box-shadow: -8px 0 36px rgba(15, 23, 42, 0.2);
        display: flex; flex-direction: column;
        color: #111827; font-size: 13px; line-height: 1.45;
      }
      .bcs-panel-header {
        display: flex; align-items: center; gap: 10px;
        padding: 13px 20px; background: #fff;
        border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
      }
      .bcs-panel-header h3 {
        margin: 0; font-size: 16px; font-weight: 700; color: #111827;
        display: flex; align-items: center; gap: 8px;
      }
      .bcs-header-pill {
        display: inline-flex; align-items: center;
        padding: 2px 10px; border-radius: 999px;
        background: #f0eeff; color: #5b47e0;
        font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums;
      }
      .bcs-header-sub {
        font-size: 12px; color: #6b7280; margin-left: 2px;
      }
      .bcs-panel-close {
        margin-left: auto;
        width: 34px; height: 34px; border: none; border-radius: 8px;
        background: transparent; color: #6b7280;
        font-size: 22px; line-height: 1; cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center;
        transition: background .15s, color .15s;
      }
      .bcs-panel-close:hover { background: #f3f4f6; color: #111827; }

      .bcs-panel-body {
        flex: 1; overflow-y: auto; padding: 14px 18px 20px;
        display: flex; flex-direction: column; gap: 12px;
      }

      /* ---- 卡片区块 ---- */
      .bcs-section {
        background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
        overflow: hidden; flex-shrink: 0;
      }
      .bcs-section-title {
        padding: 10px 16px; background: #fafbfd;
        border-bottom: 1px solid #eef0f4;
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; flex-wrap: wrap;
      }
      .bcs-section-head-left {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      }
      .bcs-section-head-right {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      }
      .bcs-section-name {
        font-size: 13px; font-weight: 700; color: #111827;
      }
      .bcs-section-sub {
        font-size: 12px; color: #6b7280; font-weight: 400;
      }
      .bcs-section-body { padding: 12px 16px; }
      .bcs-section-body.bcs-no-pad { padding: 0; }

      /* ---- 小标签 & 按钮 ---- */
      .bcs-pill {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 2px 8px; border-radius: 999px;
        font-size: 11px; font-weight: 600; line-height: 1.4;
        white-space: nowrap;
      }
      .bcs-pill-ok { background: #ecfdf5; color: #047857; }
      .bcs-pill-warn { background: #fffbeb; color: #b45309; }
      .bcs-pill-err { background: #fef2f2; color: #dc2626; }
      .bcs-pill-info { background: #f0eeff; color: #5b47e0; }
      .bcs-pill-muted { background: #f3f4f6; color: #6b7280; }

      .bcs-btn-outline {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 5px 11px; border-radius: 7px;
        border: 1px solid #d1d5db; background: #fff; color: #374151;
        font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap;
        transition: background .15s, border-color .15s, color .15s;
      }
      .bcs-btn-outline:hover { background: #f8f9fc; border-color: #9ca3af; color: #111827; }
      .bcs-btn-outline:disabled { opacity: 0.45; cursor: not-allowed; }

      .bcs-btn-accent {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 5px 12px; border-radius: 7px;
        border: 1px solid #c7d2fe; background: #f0eeff; color: #4c38cc;
        font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
        transition: background .15s, border-color .15s, color .15s;
      }
      .bcs-btn-accent:hover { background: #5b47e0; border-color: #5b47e0; color: #fff; }
      .bcs-btn-accent:disabled {
        background: #f3f4f6; color: #9ca3af; border-color: #e5e7eb; cursor: not-allowed;
      }

      .bcs-link-btn {
        background: none; border: none; padding: 2px 4px;
        color: #5b47e0; font-size: 12px; font-weight: 500; cursor: pointer;
      }
      .bcs-link-btn:hover { text-decoration: underline; }
      .bcs-link-btn.mute { color: #6b7280; }
      .bcs-link-sep { color: #d1d5db; font-size: 11px; }

      /* ---- 价格表与前缀码区 ---- */
      .bcs-prefix-grid {
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      }
      .bcs-input-group {
        display: flex; align-items: center; gap: 6px;
      }
      .bcs-input-group.grow { flex: 1; min-width: 260px; }
      .bcs-input-group label {
        font-size: 12px; font-weight: 600; color: #374151; white-space: nowrap;
      }
      .bcs-control {
        height: 34px; padding: 0 10px; border-radius: 8px;
        border: 1px solid #d1d5db; background: #fff; color: #111827;
        font-size: 13px; outline: none;
        transition: border-color .15s, box-shadow .15s;
      }
      .bcs-control:focus {
        border-color: #5b47e0; box-shadow: 0 0 0 3px rgba(91, 71, 224, 0.12);
      }
      .bcs-control.w-search { width: 220px; }
      .bcs-control.w-custom { width: 96px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-transform: uppercase; letter-spacing: 1px; text-align: center; font-weight: 600; }
      .bcs-control.flex-1 { flex: 1; min-width: 180px; }

      .bcs-match-bar {
        margin-top: 10px; padding: 8px 12px; border-radius: 8px;
        font-size: 12px; line-height: 1.5;
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; flex-wrap: wrap;
      }
      .bcs-match-bar.ok {
        background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;
      }
      .bcs-match-bar.warn {
        background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
      }
      .bcs-match-bar.info {
        background: #fffbeb; border: 1px solid #fde68a; color: #92400e;
      }
      .bcs-match-formula {
        font-size: 11px; color: #15803d; opacity: 0.85;
      }

      /* ---- 上架选项紧凑单行条 ---- */
      .bcs-mode-strip {
        display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      }
      .bcs-toggle-group {
        display: inline-flex; align-items: center; gap: 6px;
      }
      .bcs-toggle-label {
        font-size: 12px; font-weight: 600; color: #4b5563; white-space: nowrap;
      }
      .bcs-toggle-btns {
        display: inline-flex; padding: 2px; border-radius: 8px;
        background: #f3f4f6; border: 1px solid #e5e7eb;
      }
      .bcs-toggle-btn {
        padding: 4px 9px; border: none; border-radius: 6px;
        background: transparent; color: #4b5563;
        cursor: pointer; font-size: 12px; font-weight: 500;
        white-space: nowrap; transition: all .14s;
      }
      .bcs-toggle-btn:hover { color: #111827; }
      .bcs-toggle-btn.active {
        background: #fff; color: #5b47e0; font-weight: 600;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
      }
      .bcs-interval-wrap {
        margin-left: auto; display: inline-flex; align-items: center; gap: 5px;
        font-size: 12px; color: #4b5563; white-space: nowrap;
      }
      .bcs-interval-wrap input {
        width: 52px; height: 28px; padding: 0 6px; text-align: center;
        border: 1px solid #d1d5db; border-radius: 7px; font-size: 12px;
        outline: none;
      }
      .bcs-interval-wrap input:focus {
        border-color: #5b47e0; box-shadow: 0 0 0 3px rgba(91, 71, 224, 0.12);
      }

      /* ---- 店铺选择区 ---- */
      .bcs-shop-wrap {
        max-height: 210px; overflow-y: auto;
      }
      .bcs-shop-head {
        display: grid; grid-template-columns: 24px 1fr 200px 76px 168px;
        align-items: center; gap: 10px;
        padding: 7px 16px; background: #f8f9fc;
        border-bottom: 1px solid #eef0f4;
        font-size: 11px; font-weight: 600; color: #6b7280;
        position: sticky; top: 0; z-index: 1;
      }
      .bcs-shop-row {
        display: grid; grid-template-columns: 24px 1fr 200px 76px 168px;
        align-items: center; gap: 10px;
        padding: 7px 16px; border-bottom: 1px solid #f3f4f6;
        font-size: 12px; transition: background .12s, opacity .15s;
      }
      .bcs-shop-row:last-child { border-bottom: none; }
      .bcs-shop-row:hover { background: #fafbfd; }
      .bcs-shop-row.is-unchecked { opacity: 0.55; }
      .bcs-shop-row input[type="checkbox"] {
        width: 16px; height: 16px; margin: 0; cursor: pointer; accent-color: #5b47e0;
      }
      .bcs-shop-name {
        font-weight: 500; color: #111827;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        cursor: pointer;
      }
      .bcs-shop-row select[data-field="warehouse"] {
        width: 100%; height: 29px; padding: 0 8px;
        border: 1px solid #d1d5db; border-radius: 6px;
        background: #fff; color: #111827; font-size: 12px; outline: none;
      }
      .bcs-shop-row select[data-field="warehouse"]:focus {
        border-color: #5b47e0;
      }
      .bcs-shop-row input[data-field="qty"] {
        width: 100%; height: 29px; padding: 0 6px; text-align: center;
        border: 1px solid #d1d5db; border-radius: 6px;
        font-size: 12px; font-variant-numeric: tabular-nums; outline: none;
      }
      .bcs-shop-row input[data-field="qty"]:focus {
        border-color: #5b47e0;
      }
      .bcs-mult-group {
        display: inline-flex; width: 100%; padding: 2px; gap: 2px;
        border-radius: 7px; background: #f3f4f6; border: 1px solid #e5e7eb;
      }
      .bcs-mult-btn {
        flex: 1; height: 24px; padding: 0; border: none; border-radius: 5px;
        background: transparent; color: #6b7280;
        font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums;
        cursor: pointer; transition: all .12s;
      }
      .bcs-mult-btn:hover:not(:disabled) { color: #111827; background: rgba(255,255,255,0.6); }
      .bcs-mult-btn:disabled { cursor: not-allowed; }
      .bcs-mult-btn.active {
        background: #5b47e0; color: #fff;
        box-shadow: 0 1px 2px rgba(91, 71, 224, 0.25);
      }
      .bcs-mult-btn.active.mult-high {
        background: #d97706; box-shadow: 0 1px 2px rgba(217, 119, 6, 0.25);
      }
      .bcs-mult-btn.active.mult-max {
        background: #dc2626; box-shadow: 0 1px 2px rgba(220, 38, 38, 0.25);
      }
      .bcs-shop-row.is-unchecked .bcs-mult-btn.active {
        background: #9ca3af; box-shadow: none;
      }

      /* ---- 待上架商品表格 ---- */
      .bcs-table-wrap {
        overflow-x: auto;
      }
      .bcs-alert-bar {
        padding: 9px 14px; background: #fef2f2; border-bottom: 1px solid #fecaca;
        font-size: 12px; color: #b91c1c; line-height: 1.5;
      }
      .bcs-pending-table {
        width: 100%; border-collapse: collapse; font-size: 12px;
      }
      .bcs-pending-table th {
        background: #f8f9fc; padding: 8px 6px; text-align: center;
        border-bottom: 1px solid #e5e7eb;
        font-size: 11px; font-weight: 600; color: #6b7280; white-space: nowrap;
      }
      .bcs-pending-table th.col-product,
      .bcs-pending-table th.col-shelfprice { text-align: left; }
      .bcs-pending-table td {
        padding: 8px 6px; border-bottom: 1px solid #f3f4f6;
        text-align: center; vertical-align: middle;
        background: #fff; transition: background .12s;
      }
      .bcs-pending-table tbody tr:last-child td { border-bottom: none; }
      .bcs-pending-table tbody tr:hover td { background: #fafbfd; }

      .bcs-pending-table tr.row-unfetched td { background: #fffdf5; }
      .bcs-pending-table tr.row-unfetched:hover td { background: #fef9e7; }

      .bcs-pending-table tr.row-no-boss td { background: #fff5f5; }
      .bcs-pending-table tr.row-no-boss:hover td { background: #fee2e2; }
      .bcs-pending-table tr.row-no-boss td:first-child {
        box-shadow: inset 3px 0 0 #ef4444;
      }

      .bcs-pending-table .col-idx {
        width: 36px; color: #9ca3af; font-variant-numeric: tabular-nums;
      }
      .bcs-pending-table .col-product {
        min-width: 190px; max-width: 240px; text-align: left;
      }
      .bcs-prod-cell {
        display: flex; align-items: center; gap: 9px;
      }
      .bcs-thumb-box {
        width: 44px; height: 44px; border-radius: 7px; overflow: hidden;
        background: #f3f4f6; border: 1px solid #e5e7eb; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; color: #9ca3af;
      }
      .bcs-thumb-box img.thumb {
        width: 100%; height: 100%; object-fit: cover; display: block;
      }
      .bcs-prod-meta {
        min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px;
      }
      .bcs-prod-top {
        display: flex; align-items: center; gap: 5px; flex-wrap: nowrap;
      }
      .bcs-prod-nm {
        color: #5b47e0; font-size: 12px; font-weight: 600;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        text-decoration: none;
      }
      .bcs-prod-nm:hover { text-decoration: underline; }
      .bcs-prod-title {
        font-size: 11px; color: #6b7280;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .bcs-status-tag {
        display: inline-flex; align-items: center;
        padding: 0 5px; height: 16px; border-radius: 4px;
        font-size: 10px; font-weight: 600; white-space: nowrap;
      }
      .bcs-status-tag.wait { background: #fef3c7; color: #b45309; }
      .bcs-status-tag.syn { background: #ffedd5; color: #c2410c; cursor: help; }
      .bcs-status-tag.ok { background: #dcfce7; color: #15803d; }

      .bcs-pending-table .col-code { width: 172px; min-width: 162px; }
      .bcs-pending-table .col-code input {
        width: 100%; height: 30px; padding: 0 8px;
        border: 1px solid #d1d5db; border-radius: 6px;
        font-size: 12px; color: #111827; background: #fff;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        outline: none; transition: border-color .15s, box-shadow .15s;
      }
      .bcs-pending-table .col-code input:focus {
        border-color: #5b47e0; box-shadow: 0 0 0 3px rgba(91, 71, 224, 0.12);
      }

      .bcs-pending-table .col-sku { width: 96px; }
      .bcs-sku-main {
        font-size: 11px; color: #374151; font-weight: 500;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        cursor: help;
      }
      .bcs-sku-sub {
        font-size: 10px; color: #6b7280; margin-top: 2px;
      }
      .bcs-sku-sub b { color: #5b47e0; font-weight: 600; }

      .bcs-pending-table .col-minprice {
        width: 74px; font-weight: 600; color: #374151;
        font-variant-numeric: tabular-nums; white-space: nowrap;
      }
      .bcs-pending-table .col-shelfprice {
        width: 166px; min-width: 148px; text-align: left;
      }
      .bcs-price-line {
        display: flex; align-items: center; justify-content: space-between; gap: 6px;
        padding: 1px 0; font-size: 11px; line-height: 1.45; color: #4b5563;
        font-variant-numeric: tabular-nums; white-space: nowrap;
      }
      .bcs-price-tag {
        display: inline-flex; align-items: center; gap: 2px;
        padding: 0 5px; border-radius: 4px; white-space: nowrap;
        background: #f3f4f6; color: #374151; font-size: 10px; font-weight: 600;
      }
      .bcs-price-line b { color: #dc2626; font-weight: 700; font-size: 12px; }
      .bcs-price-line-idle { opacity: 0.45; }

      .bcs-pending-table .col-rub {
        width: 78px; font-variant-numeric: tabular-nums; color: #374151;
      }
      .bcs-rub-old {
        font-size: 11px; color: #9ca3af; text-decoration: line-through;
      }

      .bcs-pending-table .col-dim { width: 102px; }
      .bcs-dim-size {
        font-size: 11px; color: #374151; font-variant-numeric: tabular-nums; white-space: nowrap;
      }
      .bcs-dim-weight {
        font-size: 11px; color: #6b7280; font-variant-numeric: tabular-nums;
      }
      .bcs-warn-text {
        color: #dc2626; font-weight: 600; font-size: 11px;
      }

      .bcs-pending-table .col-action { width: 42px; }
      .bcs-pending-table .btn-del {
        width: 28px; height: 28px; border: none; border-radius: 6px;
        background: transparent; color: #9ca3af;
        cursor: pointer; font-size: 16px; line-height: 1;
        display: inline-flex; align-items: center; justify-content: center;
        transition: background .12s, color .12s;
      }
      .bcs-pending-table .btn-del:hover { background: #fee2e2; color: #dc2626; }

      .bcs-fetch-info {
        font-size: 11px; color: #6b7280;
      }
      .bcs-empty {
        text-align: center; color: #9ca3af; padding: 24px 16px; font-size: 13px;
      }

      /* ---- 底部进度 & 操作栏 ---- */
      .bcs-progress {
        padding: 9px 18px; background: #fffbeb; border-top: 1px solid #fde68a;
        font-size: 12px; color: #92400e; line-height: 1.5;
        white-space: pre-wrap; max-height: 120px; overflow-y: auto; flex-shrink: 0;
      }
      .bcs-progress.is-done {
        background: #ecfdf5; border-top-color: #a7f3d0; color: #065f46;
      }
      .bcs-progress.is-error {
        background: #fef2f2; border-top-color: #fecaca; color: #b91c1c;
      }
      .bcs-panel-footer {
        padding: 12px 18px; background: #fff; border-top: 1px solid #e5e7eb;
        display: flex; align-items: center; gap: 12px; flex-shrink: 0;
      }
      .bcs-btn-clear-list {
        padding: 8px 14px; border-radius: 8px;
        background: #fff; border: 1px solid #d1d5db; color: #4b5563;
        font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap;
        transition: background .15s, border-color .15s, color .15s;
      }
      .bcs-btn-clear-list:hover {
        background: #fef2f2; border-color: #fecaca; color: #dc2626;
      }
      .bcs-footer-summary {
        flex: 1; font-size: 12px; color: #4b5563;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .bcs-footer-summary.is-err { color: #dc2626; font-weight: 500; }
      .bcs-footer-summary.is-warn { color: #b45309; font-weight: 500; }
      .bcs-footer-summary.is-ok { color: #047857; font-weight: 500; }

      .bcs-btn-start {
        min-width: 170px; padding: 9px 22px; border-radius: 9px;
        background: #5b47e0; color: #fff; border: none;
        font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap;
        box-shadow: 0 2px 6px rgba(91, 71, 224, 0.3);
        transition: background .15s, box-shadow .15s;
      }
      .bcs-btn-start:hover { background: #4c38cc; box-shadow: 0 3px 10px rgba(91, 71, 224, 0.36); }
      .bcs-btn-start:disabled {
        background: #c4c9d4; box-shadow: none; cursor: not-allowed;
      }

      /* ---- 商品卡片复选框 & 已上架标记 ---- */
      .bcs-checkbox {
        position: absolute; top: 8px; left: 8px; z-index: 99;
        width: 20px; height: 20px; cursor: pointer;
        accent-color: #5b47e0;
        border-radius: 4px;
        outline: 2px solid rgba(255, 255, 255, 0.92);
        box-shadow: 0 2px 6px rgba(15, 23, 42, 0.32);
      }
      .bcs-listed-badge {
        position: absolute; top: 6px; right: 6px; z-index: 99;
        background: #10b981; color: #fff; font-size: 11px; font-weight: 600;
        padding: 2px 8px; border-radius: 999px; line-height: 1.4;
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
        box-shadow: 0 2px 6px rgba(16, 185, 129, 0.35); pointer-events: none;
        white-space: nowrap;
      }
      .bcs-listed-detail-banner {
        position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
        background: #059669; color: #fff; text-align: center;
        padding: 9px 40px 9px 16px; font-size: 13px; font-weight: 600;
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.18);
      }
      .bcs-listed-detail-banner .bcs-listed-close {
        position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
        width: 26px; height: 26px; border: none; border-radius: 6px;
        background: transparent; color: #fff; cursor: pointer;
        font-size: 18px; line-height: 1; opacity: 0.85;
      }
      .bcs-listed-detail-banner .bcs-listed-close:hover {
        opacity: 1; background: rgba(255, 255, 255, 0.18);
      }
      .bcs-listed-detail-banner .bcs-listed-shops {
        font-size: 12px; font-weight: 400; opacity: 0.92; margin-top: 2px;
      }
    `;
    document.head.appendChild(style);
  }
