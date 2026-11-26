  // ============================================================
  // 5. 跨店同步面板（比对预览 + 同步更新 + 缺品补上架）
  // ============================================================
  const PANEL_SYNC = SYNC_PREFIX + 'panel';

  const syncState = {
    shops: null,
    sourceId: null,
    targetIds: new Set(),      // 勾选「同步修改」的店铺（对已上架商品执行更新）
    shelveShops: new Set(),    // 勾选「缺品补上」的店铺（对未上架商品执行补上架）
    defaultPrice: '',          // 补上架统一默认价（空=取源店价）
    fields: { title: true, description: true, brand: true, characteristics: true, dimensions: true, photos: true, photosForce: false },
    plan: null,
    fetchedShopIds: new Set(), // 本次 plan 已拉取数据的目标店铺 ID
    shelveEdits: new Map(),    // key(vc|shopId) -> { vc, price, qty }，避免重绘丢失手填值
    filter: 'all',             // all | sync | shelve | same | absent | error
    items: [],
    lastResults: null,
    running: false,
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function enabledFieldKeys() {
    return SYNC_FIELDS.filter(f => syncState.fields[f.key]).map(f => f.key);
  }

  function activeTargetShopIds() {
    const ids = new Set();
    for (const id of syncState.targetIds) if (id !== syncState.sourceId) ids.add(id);
    for (const id of syncState.shelveShops) if (id !== syncState.sourceId) ids.add(id);
    return ids;
  }

  function isPhotoWriteNeeded(row, cell) {
    if (!row.source || !syncState.fields.photos) return false;
    const pSrc = photoUrls(row.source).length;
    if (!pSrc) return false;
    if (syncState.fields.photosForce) return true;
    const pi = cell._photoInfo;
    return pi ? !pi.same : pSrc !== photoUrls(cell._card || {}).length;
  }

  function cellNeedsSync(row, cell) {
    if (!row.source || cell.status !== 'listed') return false;
    if (!syncState.targetIds.has(cell.shop.id)) return false;
    return cell.diff.some(d => !d.same) || isPhotoWriteNeeded(row, cell);
  }

  function cellWillShelve(row, cell) {
    return !!row.source && cell.status === 'absent' && syncState.shelveShops.has(cell.shop.id);
  }

  function sourceThumbUrl(card) {
    const p = card && card.photos && card.photos[0];
    return (p && (p.tm || p.c246x328 || p.square || p.big)) || '';
  }

  function getCellShelveValues(row, cell) {
    const key = `${row.item.vendorCode}|${cell.shop.id}`;
    const saved = syncState.shelveEdits.get(key) || {};
    const defVc = row.item.vendorCode || (row.source && row.source.vendorCode) || '';
    return {
      key,
      vc: saved.vc !== undefined ? saved.vc : defVc,
      price: saved.price !== undefined ? saved.price : syncState.defaultPrice,
      qty: saved.qty !== undefined ? saved.qty : '999',
    };
  }

  function recomputePlanDiffs() {
    if (!syncState.plan) return;
    const enabled = enabledFieldKeys();
    for (const row of syncState.plan) {
      if (!row.source) continue;
      for (const cell of row.targets) {
        if (cell.status === 'listed' && cell._card) {
          cell.diff = diffCards(row.source, cell._card, enabled, syncState.fields.photos ? cell._photoInfo : null);
        }
      }
    }
  }

  function syncStyles() {
    if (document.getElementById(SYNC_PREFIX + 'panelstyle')) return;
    const st = document.createElement('style');
    st.id = SYNC_PREFIX + 'panelstyle';
    st.textContent = `
#${PANEL_SYNC},#${PANEL_SYNC} *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",Roboto,sans-serif;}
#${PANEL_SYNC}{position:fixed;inset:0;z-index:2147482200;display:flex;align-items:center;justify-content:center;padding:20px;
  background:rgba(15,23,42,.42);backdrop-filter:blur(2px);color:#111827;font-size:13px;line-height:1.5;}
#${PANEL_SYNC} .dlg{position:relative;width:min(1080px,96vw);max-height:90vh;display:flex;flex-direction:column;
  background:#fff;border-radius:14px;border:1px solid #e5e7eb;box-shadow:0 24px 64px rgba(15,23,42,.26);overflow:hidden;}

/* 顶部栏 */
#${PANEL_SYNC} .hd{display:flex;align-items:center;gap:10px;padding:14px 20px;border-bottom:1px solid #eef0f4;background:#fff;flex-shrink:0;}
#${PANEL_SYNC} .hd .ttl{font-size:16px;font-weight:700;color:#111827;}
#${PANEL_SYNC} .hd .cnt-pill{padding:2px 10px;border-radius:999px;background:#f0eeff;color:#5b47e0;font-size:12px;font-weight:600;}
#${PANEL_SYNC} .hd .hd-act{margin-left:auto;display:flex;align-items:center;gap:8px;}
#${PANEL_SYNC} .hd .x{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:none;
  background:transparent;border-radius:8px;cursor:pointer;color:#6b7280;font-size:22px;line-height:1;}
#${PANEL_SYNC} .hd .x:hover{background:#f3f4f6;color:#111827;}

/* 配置区 */
#${PANEL_SYNC} .cfg{padding:12px 20px 14px;background:#f8f9fc;border-bottom:1px solid #e5e7eb;display:flex;flex-direction:column;gap:12px;flex-shrink:0;}
#${PANEL_SYNC} .cfg-row{display:flex;flex-wrap:wrap;align-items:flex-start;gap:18px;}
#${PANEL_SYNC} .cfg-blk{display:flex;flex-direction:column;gap:6px;}
#${PANEL_SYNC} .cfg-blk.grow{flex:1;min-width:280px;}
#${PANEL_SYNC} .cfg-hd{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}
#${PANEL_SYNC} .lb{font-size:12px;font-weight:600;color:#374151;display:inline-flex;align-items:center;gap:6px;}
#${PANEL_SYNC} .lb .sub{font-weight:400;color:#6b7280;font-size:11px;}
#${PANEL_SYNC} .quick-links{display:inline-flex;align-items:center;gap:8px;font-size:11px;}
#${PANEL_SYNC} .link-btn{background:none;border:none;padding:0;color:#5b47e0;cursor:pointer;font-size:11px;font-weight:500;}
#${PANEL_SYNC} .link-btn:hover{text-decoration:underline;}
#${PANEL_SYNC} .link-btn.mute{color:#6b7280;}
#${PANEL_SYNC} .link-sep{color:#d1d5db;}

#${PANEL_SYNC} select.src-sel{height:34px;min-width:210px;max-width:280px;padding:0 10px;border-radius:8px;
  border:1px solid #d1d5db;background:#fff;color:#111827;font-size:13px;font-weight:500;outline:none;cursor:pointer;}
#${PANEL_SYNC} select.src-sel:focus{border-color:#5b47e0;box-shadow:0 0 0 3px rgba(91,71,224,.12);}

/* 字段选择胶囊 */
#${PANEL_SYNC} .field-pills{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
#${PANEL_SYNC} .fpill{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 11px;border-radius:999px;
  border:1px solid #d1d5db;background:#fff;color:#4b5563;font-size:12px;font-weight:500;cursor:pointer;user-select:none;
  transition:all .14s;}
#${PANEL_SYNC} .fpill:hover{border-color:#9ca3af;color:#111827;}
#${PANEL_SYNC} .fpill.on{background:#f0eeff;border-color:#a59bf5;color:#4338ca;font-weight:600;}
#${PANEL_SYNC} .fpill.warn.on{background:#fffbeb;border-color:#fcd34d;color:#b45309;}
#${PANEL_SYNC} .fpill.dis{opacity:.42;cursor:not-allowed;pointer-events:none;}
#${PANEL_SYNC} .fpill input{display:none;}
#${PANEL_SYNC} .fpill .ck{font-size:11px;line-height:1;}

/* 目标店铺卡片网格 */
#${PANEL_SYNC} .shop-grid{display:flex;flex-wrap:wrap;gap:8px;max-height:112px;overflow-y:auto;padding-right:2px;}
#${PANEL_SYNC} .shop-card{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:9px;
  background:#fff;border:1px solid #e5e7eb;transition:border-color .14s,box-shadow .14s;}
#${PANEL_SYNC} .shop-card.active{border-color:#c7d2fe;box-shadow:0 1px 3px rgba(91,71,224,.08);}
#${PANEL_SYNC} .shop-card.nokey{background:#fafafa;border-style:dashed;opacity:.75;}
#${PANEL_SYNC} .shop-card .snm{font-size:12px;font-weight:600;color:#111827;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#${PANEL_SYNC} .shop-card .togs{display:inline-flex;gap:4px;}
#${PANEL_SYNC} .tog{height:24px;padding:0 8px;border-radius:6px;border:1px solid #e5e7eb;background:#f9fafb;
  color:#6b7280;font-size:11px;font-weight:500;cursor:pointer;transition:all .14s;white-space:nowrap;}
#${PANEL_SYNC} .tog:hover:not(:disabled){border-color:#cbd5e1;color:#111827;}
#${PANEL_SYNC} .tog.sync-on{background:#eef2ff;border-color:#a5b4fc;color:#4338ca;font-weight:600;}
#${PANEL_SYNC} .tog.shelve-on{background:#fffbeb;border-color:#fcd34d;color:#b45309;font-weight:600;}
#${PANEL_SYNC} .tog:disabled{opacity:.45;cursor:not-allowed;}

/* 补上架默认价条 */
#${PANEL_SYNC} .shelve-bar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:8px 12px;border-radius:8px;
  background:#fffbeb;border:1px solid #fde68a;font-size:12px;color:#92400e;}
#${PANEL_SYNC} .shelve-bar input{width:130px;height:28px;padding:0 8px;border-radius:6px;border:1px solid #f59e0b;
  background:#fff;color:#111827;font-size:12px;outline:none;}
#${PANEL_SYNC} .shelve-bar input:focus{box-shadow:0 0 0 3px rgba(245,158,11,.18);}

/* 进度条 */
#${PANEL_SYNC} .prog{display:none;background:#f0eeff;border-bottom:1px solid #e0dcfb;padding:8px 20px;flex-shrink:0;}
#${PANEL_SYNC} .prog.show{display:block;}
#${PANEL_SYNC} .prog-top{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#4338ca;font-weight:500;margin-bottom:5px;}
#${PANEL_SYNC} .prog-track{height:5px;border-radius:999px;background:#ddd6fe;overflow:hidden;}
#${PANEL_SYNC} .prog-fill{height:100%;width:0;border-radius:999px;background:#5b47e0;transition:width .2s ease;}

/* 主内容滚动区 */
#${PANEL_SYNC} .bd{flex:1;overflow-y:auto;padding:16px 20px;background:#f5f6fa;}

/* 筛选条与提示条 */
#${PANEL_SYNC} .notice{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;
  margin-bottom:12px;border-radius:10px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;font-size:12px;}
#${PANEL_SYNC} .filter-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:12px;}
#${PANEL_SYNC} .fbtn{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:999px;
  border:1px solid #e5e7eb;background:#fff;color:#4b5563;font-size:12px;font-weight:500;cursor:pointer;transition:all .14s;}
#${PANEL_SYNC} .fbtn:hover{border-color:#cbd5e1;color:#111827;}
#${PANEL_SYNC} .fbtn.on{background:#111827;border-color:#111827;color:#fff;}
#${PANEL_SYNC} .fbtn .num{font-variant-numeric:tabular-nums;font-weight:700;}
#${PANEL_SYNC} .fbtn.c-sync .num{color:#2563eb;}
#${PANEL_SYNC} .fbtn.c-shelve .num{color:#d97706;}
#${PANEL_SYNC} .fbtn.c-ok .num{color:#059669;}
#${PANEL_SYNC} .fbtn.c-bad .num{color:#dc2626;}
#${PANEL_SYNC} .fbtn.on .num{color:#fff;}

/* 商品卡片 */
#${PANEL_SYNC} .pcard{background:#fff;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:12px;overflow:hidden;
  box-shadow:0 1px 2px rgba(15,23,42,.03);}
#${PANEL_SYNC} .pcard-hd{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#fafbfc;border-bottom:1px solid #eef0f4;}
#${PANEL_SYNC} .pthumb{width:44px;height:44px;border-radius:7px;object-fit:cover;border:1px solid #e5e7eb;background:#f3f4f6;flex-shrink:0;}
#${PANEL_SYNC} .pthumb-empty{width:44px;height:44px;border-radius:7px;border:1px solid #e5e7eb;background:#f3f4f6;
  display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:11px;flex-shrink:0;}
#${PANEL_SYNC} .pinfo{min-width:0;flex:1;}
#${PANEL_SYNC} .pmeta{display:flex;align-items:center;flex-wrap:wrap;gap:8px;}
#${PANEL_SYNC} .pvc{font-size:13px;font-weight:700;color:#111827;font-family:ui-monospace,Consolas,monospace;}
#${PANEL_SYNC} .pnm{font-size:11px;color:#6b7280;font-family:ui-monospace,Consolas,monospace;}
#${PANEL_SYNC} .ptitle{font-size:12px;color:#4b5563;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}

/* 目标店铺行 */
#${PANEL_SYNC} .trow{display:grid;grid-template-columns:168px 180px 1fr;gap:12px;align-items:start;
  padding:10px 14px;border-bottom:1px solid #f1f3f7;}
#${PANEL_SYNC} .trow:last-child{border-bottom:none;}
#${PANEL_SYNC} .trow:hover{background:#fcfcfd;}
#${PANEL_SYNC} .tshop{font-weight:600;color:#111827;font-size:12px;line-height:1.4;}
#${PANEL_SYNC} .tshop .tnm{display:block;font-weight:400;font-size:11px;color:#9ca3af;font-family:ui-monospace,Consolas,monospace;margin-top:2px;}

/* 状态标签 */
#${PANEL_SYNC} .tag{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;}
#${PANEL_SYNC} .tag.ok{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;}
#${PANEL_SYNC} .tag.diff{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;}
#${PANEL_SYNC} .tag.abs{background:#fffbeb;color:#b45309;border:1px solid #fde68a;}
#${PANEL_SYNC} .tag.mute{background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;}
#${PANEL_SYNC} .tag.bad{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;}
#${PANEL_SYNC} .risk-txt{color:#b45309;font-size:11px;margin-top:4px;line-height:1.4;}
#${PANEL_SYNC} .err-txt{color:#b91c1c;font-size:11px;margin-top:4px;line-height:1.4;}

/* 差异摘要与展开对比表 */
#${PANEL_SYNC} .diff-head{display:flex;flex-wrap:wrap;align-items:center;gap:5px;}
#${PANEL_SYNC} .df-chip{display:inline-block;padding:1px 7px;border-radius:5px;background:#eff6ff;color:#1e40af;font-size:11px;font-weight:500;}
#${PANEL_SYNC} .muted-note{font-size:12px;color:#9ca3af;}
#${PANEL_SYNC} details.dt-wrap{margin-top:4px;}
#${PANEL_SYNC} details.dt-wrap summary{cursor:pointer;color:#5b47e0;font-size:11px;font-weight:500;list-style:none;display:inline-flex;align-items:center;gap:4px;user-select:none;}
#${PANEL_SYNC} details.dt-wrap summary::-webkit-details-marker{display:none;}
#${PANEL_SYNC} details.dt-wrap summary:hover{text-decoration:underline;}
#${PANEL_SYNC} details.dt-wrap summary .arr{display:inline-block;transition:transform .15s ease;}
#${PANEL_SYNC} details.dt-wrap[open] summary .arr{transform:rotate(180deg);}
#${PANEL_SYNC} .dt{margin-top:6px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff;}
#${PANEL_SYNC} .dt table{width:100%;border-collapse:collapse;font-size:11px;}
#${PANEL_SYNC} .dt th,#${PANEL_SYNC} .dt td{padding:6px 8px;border-bottom:1px solid #f1f3f7;text-align:left;vertical-align:top;word-break:break-word;}
#${PANEL_SYNC} .dt th{background:#f9fafb;color:#6b7280;font-weight:600;white-space:nowrap;}
#${PANEL_SYNC} .dt tr:last-child td{border-bottom:none;}
#${PANEL_SYNC} .dt tr.same td{color:#9ca3af;}
#${PANEL_SYNC} .dt tr.ne{background:#fffdf5;}
#${PANEL_SYNC} .dt tr.ne td:first-child{font-weight:600;color:#111827;}
#${PANEL_SYNC} .dt .ne-st{color:#b45309;font-weight:600;}
#${PANEL_SYNC} .dt .dt-note{display:block;color:#6b7280;font-weight:400;margin-top:2px;}

/* 补上架行内表单 */
#${PANEL_SYNC} .shelve-form{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;
  background:#fffdf7;border:1px solid #fde68a;}
#${PANEL_SYNC} .shelve-form label{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#78350f;font-weight:500;}
#${PANEL_SYNC} .shelve-form input{height:26px;padding:0 7px;border-radius:6px;border:1px solid #d1d5db;background:#fff;
  color:#111827;font-size:12px;outline:none;width:88px;}
#${PANEL_SYNC} .shelve-form input.vc{width:175px;font-family:ui-monospace,Consolas,monospace;font-size:11px;}
#${PANEL_SYNC} .shelve-form input.qty{width:70px;}
#${PANEL_SYNC} .shelve-form input:focus{border-color:#5b47e0;box-shadow:0 0 0 2px rgba(91,71,224,.12);}
#${PANEL_SYNC} .wh-tag{font-size:11px;color:#92400e;background:#fef3c7;padding:2px 7px;border-radius:5px;}

/* 执行结果卡 */
#${PANEL_SYNC} .res-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:14px;overflow:hidden;
  box-shadow:0 1px 3px rgba(15,23,42,.05);}
#${PANEL_SYNC} .res-hd{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fafbfc;border-bottom:1px solid #eef0f4;font-size:12px;}
#${PANEL_SYNC} .res-hd b{font-size:13px;color:#111827;}
#${PANEL_SYNC} .res-card table{width:100%;border-collapse:collapse;font-size:12px;}
#${PANEL_SYNC} .res-card th,#${PANEL_SYNC} .res-card td{padding:7px 12px;border-bottom:1px solid #f1f3f7;text-align:left;vertical-align:top;}
#${PANEL_SYNC} .res-card th{background:#fff;color:#6b7280;font-weight:600;white-space:nowrap;font-size:11px;}
#${PANEL_SYNC} .res-card tr:last-child td{border-bottom:none;}
#${PANEL_SYNC} .mono{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#4b5563;}

/* 空状态与底部说明 */
#${PANEL_SYNC} .empty-box{text-align:center;padding:42px 20px;background:#fff;border:1px dashed #d1d5db;border-radius:10px;color:#6b7280;}
#${PANEL_SYNC} .empty-box strong{display:block;font-size:14px;color:#111827;margin-bottom:4px;}
#${PANEL_SYNC} .tip{color:#6b7280;font-size:11px;margin-top:8px;line-height:1.6;}

/* 底部操作栏 */
#${PANEL_SYNC} .ft{display:flex;align-items:center;gap:10px;padding:12px 20px;border-top:1px solid #eef0f4;background:#fff;flex-shrink:0;}
#${PANEL_SYNC} .ft .status{color:#6b7280;font-size:12px;margin-right:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#${PANEL_SYNC} button.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;
  border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#374151;padding:7px 14px;font-size:13px;font-weight:500;
  transition:all .14s;white-space:nowrap;}
#${PANEL_SYNC} button.btn:hover:not(:disabled){background:#f3f4f6;border-color:#9ca3af;color:#111827;}
#${PANEL_SYNC} button.btn.sm{padding:5px 10px;font-size:12px;}
#${PANEL_SYNC} button.btn.primary{background:#5b47e0;border-color:#5b47e0;color:#fff;font-weight:600;
  box-shadow:0 1px 3px rgba(91,71,224,.28);}
#${PANEL_SYNC} button.btn.primary:hover:not(:disabled){background:#4c38cc;border-color:#4c38cc;}
#${PANEL_SYNC} button.btn:disabled{opacity:.48;cursor:not-allowed;}
#${PANEL_SYNC} .dot{width:7px;height:7px;border-radius:50%;background:#f59e0b;display:inline-block;}

/* 面板内二次确认弹窗 */
#${PANEL_SYNC} .cfm-mask{position:absolute;inset:0;z-index:20;border-radius:14px;background:rgba(15,23,42,.36);backdrop-filter:blur(1px);
  display:flex;align-items:center;justify-content:center;padding:20px;}
#${PANEL_SYNC} .cfm-box{width:min(480px,92%);background:#fff;border-radius:12px;border:1px solid #e5e7eb;
  box-shadow:0 20px 50px rgba(15,23,42,.24);overflow:hidden;}
#${PANEL_SYNC} .cfm-hd{padding:14px 18px;border-bottom:1px solid #eef0f4;font-size:15px;font-weight:700;color:#111827;}
#${PANEL_SYNC} .cfm-bd{padding:16px 18px;display:flex;flex-direction:column;gap:10px;font-size:13px;color:#374151;}
#${PANEL_SYNC} .cfm-item{padding:10px 12px;border-radius:8px;background:#f8f9fc;border:1px solid #e5e7eb;font-size:12px;line-height:1.65;}
#${PANEL_SYNC} .cfm-item.amber{background:#fffbeb;border-color:#fde68a;color:#92400e;}
#${PANEL_SYNC} .cfm-item b{color:#111827;}
#${PANEL_SYNC} .cfm-item.amber b{color:#78350f;}
#${PANEL_SYNC} .cfm-ft{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid #eef0f4;background:#fafbfc;}
`;
    (document.head || document.documentElement).appendChild(st);
  }

  function closeSyncPanel() {
    if (syncState.running) {
      showToast('正在执行中，请等待完成再关闭', 3000);
      return;
    }
    const div = document.getElementById(PANEL_SYNC);
    if (div && div._onEsc) document.removeEventListener('keydown', div._onEsc);
    if (div) div.remove();
  }

  async function openSyncPanel() {
    syncStyles();
    syncState.items = getSellerSelectedRows();
    if (!syncState.items.length) {
      showToast('请先在商品列表勾选要同步的商品', 3000);
      return;
    }
    let shops;
    try {
      shops = await ensureShops();
    } catch (e) {
      showToast('获取店铺列表失败：' + e.message, 7000);
      if (isCardMainPage() && e.message.includes(BCS_LOGIN_URL)) injectProbePanel();
      return;
    }
    syncState.shops = shops;
    const cur = detectCurrentShop(shops);
    syncState.sourceId = cur ? cur.id : (shops[0] && shops[0].id);
    if (!cur) {
      showToast('正在识别当前登录店铺…', 2500);
      try {
        const inferred = await inferSourceShop(syncState.items, shops);
        if (inferred) syncState.sourceId = inferred.id;
      } catch (e) { /* 失败则保持默认，面板里可手动改 */ }
      if (!shops.some(s => s.id === syncState.sourceId && s.apiKey)) {
        showToast('未能自动识别当前店铺，请在「源店铺」下拉框手动选择', 5000);
      }
    }

    if (!isCardMainPage()) return;
    syncState.targetIds = new Set(shops.filter(s => s.id !== syncState.sourceId && s.apiKey).map(s => s.id));
    syncState.shelveShops.delete(syncState.sourceId);
    syncState.plan = null;
    syncState.lastResults = null;
    syncState.fetchedShopIds = new Set();
    syncState.shelveEdits = new Map();
    syncState.filter = 'all';

    let div = document.getElementById(PANEL_SYNC);
    if (!div) {
      div = document.createElement('div');
      div.id = PANEL_SYNC;
      document.body.appendChild(div);
    }
    renderSyncPanel();
    runPreview();
  }

  function renderConfigHtml() {
    const shops = syncState.shops || [];
    const targetList = shops.filter(s => s.id !== syncState.sourceId);
    const srcOpts = shops.map(s =>
      `<option value="${s.id}" ${s.id === syncState.sourceId ? 'selected' : ''}>${esc(shopLabel(s))}${s.apiKey ? '' : '（无密钥）'}</option>`).join('');

    const allFieldsOn = SYNC_FIELDS.every(f => syncState.fields[f.key]);
    const fieldPills = SYNC_FIELDS.map(f => {
      const on = !!syncState.fields[f.key];
      return `<label class="fpill ${on ? 'on' : ''}">
        <input type="checkbox" data-field="${f.key}" ${on ? 'checked' : ''}>
        <span class="ck">${on ? '✓' : '+'}</span><span>${f.label}</span>
      </label>`;
    }).join('') + `
      <label class="fpill warn ${syncState.fields.photosForce ? 'on' : ''} ${syncState.fields.photos ? '' : 'dis'}"
             title="即使图片张数和内容看似一致，也强制用源店图片整组覆盖">
        <input type="checkbox" data-field="photosForce" ${syncState.fields.photosForce ? 'checked' : ''} ${syncState.fields.photos ? '' : 'disabled'}>
        <span class="ck">${syncState.fields.photosForce ? '✓' : '○'}</span><span>强制换图</span>
      </label>`;

    const shopCards = targetList.length ? targetList.map(s => {
      const noKey = !s.apiKey;
      const syncOn = !noKey && syncState.targetIds.has(s.id);
      const shelveOn = !noKey && syncState.shelveShops.has(s.id);
      return `<div class="shop-card ${noKey ? 'nokey' : ((syncOn || shelveOn) ? 'active' : '')}">
        <span class="snm" title="${esc(shopLabel(s))}">${esc(s.shopName)}</span>
        ${noKey
          ? '<span class="tag bad">无密钥</span>'
          : `<span class="togs">
               <button type="button" class="tog ${syncOn ? 'sync-on' : ''}" data-toggle-tgt="${s.id}"
                 title="如果该店已上架此商品，同步源店的修改内容">${syncOn ? '✓ 同步修改' : '同步修改'}</button>
               <button type="button" class="tog ${shelveOn ? 'shelve-on' : ''}" data-toggle-shelve="${s.id}"
                 title="如果该店未上架此商品，顺便帮它补上架">${shelveOn ? '+ 缺品补上' : '缺品补上'}</button>
             </span>`}
      </div>`;
    }).join('') : '<span class="muted-note">没有其他可选目标店铺</span>';

    const shelveBar = syncState.shelveShops.size > 0 ? `
      <div class="shelve-bar">
        <span><b>缺品补上架默认价（元）：</b></span>
        <input type="number" min="0" step="0.01" id="${SYNC_PREFIX}price"
          value="${esc(syncState.defaultPrice)}" placeholder="留空自动取源店价">
        <span>默认库存 999 · 仓库自动选莫斯科仓（下方可对单条商品微调）</span>
      </div>` : '';

    return `
      <div class="cfg-row">
        <div class="cfg-blk">
          <div class="cfg-hd"><span class="lb">源店铺 <span class="sub">（以此店商品为准）</span></span></div>
          <select class="src-sel" id="${SYNC_PREFIX}src">${srcOpts}</select>
        </div>
        <div class="cfg-blk grow">
          <div class="cfg-hd">
            <span class="lb">同步内容</span>
            <span class="quick-links">
              <button type="button" class="link-btn" data-act="toggle-all-fields">${allFieldsOn ? '取消全选' : '全部勾选'}</button>
            </span>
          </div>
          <div class="field-pills">${fieldPills}</div>
        </div>
      </div>
      <div class="cfg-blk">
        <div class="cfg-hd">
          <span class="lb">目标店铺 <span class="sub">（同步修改 ${syncState.targetIds.size} 店 · 缺品补上 ${syncState.shelveShops.size} 店）</span></span>
          <span class="quick-links">
            <button type="button" class="link-btn" data-act="tgt-all">全部同步</button>
            <button type="button" class="link-btn mute" data-act="tgt-none">清空同步</button>
            <span class="link-sep">|</span>
            <button type="button" class="link-btn" data-act="shelve-all">全部补上</button>
            <button type="button" class="link-btn mute" data-act="shelve-none">清空补上</button>
          </span>
        </div>
        <div class="shop-grid">${shopCards}</div>
      </div>
      ${shelveBar}
    `;
  }

  function refreshConfigSection() {
    const cfgEl = document.getElementById(PANEL_SYNC + '-cfg');
    if (cfgEl) cfgEl.innerHTML = renderConfigHtml();
    updateRunButtonHint();
  }

  function updateRunButtonHint() {
    const runBtn = document.getElementById(PANEL_SYNC + '-run');
    if (!runBtn) return;
    const hasUnfetched = hasUnfetchedActiveShops();
    runBtn.innerHTML = hasUnfetched ? '<span class="dot"></span>重新比对' : '重新比对';
  }

  function hasUnfetchedActiveShops() {
    if (!syncState.plan) return false;
    for (const id of activeTargetShopIds()) {
      if (!syncState.fetchedShopIds.has(id)) return true;
    }
    return false;
  }

  function renderSyncPanel() {
    const div = document.getElementById(PANEL_SYNC);
    if (!div) return;

    div.innerHTML = `
      <div class="dlg" role="dialog" aria-label="跨店同步">
        <div class="hd">
          <span class="ttl">跨店同步</span>
          <span class="cnt-pill">已选 ${syncState.items.length} 件商品</span>
          <div class="hd-act">
            <button type="button" class="btn sm" id="${PANEL_SYNC}-probe">店铺自检</button>
            <button type="button" class="x" title="关闭">×</button>
          </div>
        </div>
        <div class="cfg" id="${PANEL_SYNC}-cfg">${renderConfigHtml()}</div>
        <div class="prog" id="${PANEL_SYNC}-prog">
          <div class="prog-top">
            <span id="${PANEL_SYNC}-prog-text">准备中…</span>
            <span id="${PANEL_SYNC}-prog-pct">0%</span>
          </div>
          <div class="prog-track"><div class="prog-fill" id="${PANEL_SYNC}-prog-fill"></div></div>
        </div>
        <div class="bd" id="${PANEL_SYNC}-bd">
          <div class="empty-box"><strong>正在读取各店铺商品数据…</strong>请稍候，马上展示差异对比。</div>
        </div>
        <div class="ft">
          <button type="button" class="btn" id="${PANEL_SYNC}-run">重新比对</button>
          <span class="status" id="${PANEL_SYNC}-status"></span>
          <button type="button" class="btn" id="${PANEL_SYNC}-close">关闭</button>
          <button type="button" class="btn primary" id="${PANEL_SYNC}-apply" disabled>执行同步</button>
        </div>
      </div>
    `;

    if (div._onEsc) document.removeEventListener('keydown', div._onEsc);
    div._onEsc = (e) => {
      if (e.key !== 'Escape') return;
      const cfm = document.getElementById(PANEL_SYNC + '-cfm');
      if (cfm) cfm.remove();
      else closeSyncPanel();
    };
    document.addEventListener('keydown', div._onEsc);

    if (!div.dataset.bound) {
      div.dataset.bound = '1';
      div.addEventListener('click', onPanelClick);
      div.addEventListener('change', onPanelChange);
      div.addEventListener('input', onPanelInput);
    }
  }

  function onPanelClick(e) {
    const div = document.getElementById(PANEL_SYNC);
    if (!div) return;
    if (e.target === div) { closeSyncPanel(); return; }

    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.classList.contains('x') || btn.id === PANEL_SYNC + '-close') { closeSyncPanel(); return; }
    if (btn.id === PANEL_SYNC + '-probe') {
      injectProbePanel();
      const el = document.getElementById(SYNC_PREFIX + 'probe');
      if (el) el.style.display = '';
      return;
    }
    if (btn.id === PANEL_SYNC + '-run' || btn.dataset.act === 'rerun') { runPreview(); return; }
    if (btn.id === PANEL_SYNC + '-apply') { confirmAndRun(); return; }

    // 确认弹窗按钮
    if (btn.dataset.act === 'cfm-cancel') {
      const cfm = document.getElementById(PANEL_SYNC + '-cfm');
      if (cfm) cfm.remove();
      return;
    }

    if (btn.dataset.act === 'clear-results') {
      syncState.lastResults = null;
      renderPlan(syncState.plan);
      return;
    }

    if (btn.dataset.filter) {
      syncState.filter = btn.dataset.filter;
      if (syncState.plan) renderPlan(syncState.plan);
      return;
    }

    if (syncState.running) return;

    const validOthers = (syncState.shops || []).filter(s => s.id !== syncState.sourceId && s.apiKey);

    if (btn.dataset.toggleTgt) {
      const id = Number(btn.dataset.toggleTgt);
      if (syncState.targetIds.has(id)) syncState.targetIds.delete(id);
      else syncState.targetIds.add(id);
      refreshConfigSection();
      if (syncState.plan) renderPlan(syncState.plan);
      return;
    }

    if (btn.dataset.toggleShelve) {
      const id = Number(btn.dataset.toggleShelve);
      if (syncState.shelveShops.has(id)) syncState.shelveShops.delete(id);
      else syncState.shelveShops.add(id);
      refreshConfigSection();
      if (syncState.plan) renderPlan(syncState.plan);
      return;
    }

    if (btn.dataset.act === 'tgt-all') {
      syncState.targetIds = new Set(validOthers.map(s => s.id));
      refreshConfigSection();
      if (syncState.plan) renderPlan(syncState.plan);
      return;
    }
    if (btn.dataset.act === 'tgt-none') {
      syncState.targetIds.clear();
      refreshConfigSection();
      if (syncState.plan) renderPlan(syncState.plan);
      return;
    }
    if (btn.dataset.act === 'shelve-all') {
      syncState.shelveShops = new Set(validOthers.map(s => s.id));
      refreshConfigSection();
      if (syncState.plan) renderPlan(syncState.plan);
      return;
    }
    if (btn.dataset.act === 'shelve-none') {
      syncState.shelveShops.clear();
      refreshConfigSection();
      if (syncState.plan) renderPlan(syncState.plan);
      return;
    }
    if (btn.dataset.act === 'toggle-all-fields') {
      const allOn = SYNC_FIELDS.every(f => syncState.fields[f.key]);
      for (const f of SYNC_FIELDS) syncState.fields[f.key] = !allOn;
      if (allOn) syncState.fields.photosForce = false;
      refreshConfigSection();
      afterFieldToggle(!allOn);
      return;
    }
  }

  function afterFieldToggle(photosTurnedOn) {
    if (!syncState.plan) return;
    if (photosTurnedOn) {
      const missingPhotoInfo = syncState.plan.some(r =>
        r.source && r.targets.some(c => c.status === 'listed' && !c._photoInfo));
      if (missingPhotoInfo) {
        runPreview();
        return;
      }
    }
    recomputePlanDiffs();
    renderPlan(syncState.plan);
  }

  function onPanelChange(e) {
    const t = e.target;
    if (!t || syncState.running) return;

    if (t.id === SYNC_PREFIX + 'src') {
      const v = Number(t.value);
      syncState.sourceId = v;
      syncState.targetIds = new Set((syncState.shops || []).filter(s => s.id !== v && s.apiKey).map(s => s.id));
      syncState.shelveShops.delete(v);
      syncState.shelveEdits.clear();
      syncState.plan = null;
      syncState.fetchedShopIds.clear();
      refreshConfigSection();
      runPreview();
      return;
    }

    if (t.dataset && t.dataset.field) {
      const k = t.dataset.field;
      syncState.fields[k] = t.checked;
      if (k === 'photos' && !t.checked) syncState.fields.photosForce = false;
      refreshConfigSection();
      afterFieldToggle(k === 'photos' && t.checked);
      return;
    }
  }

  function onPanelInput(e) {
    const t = e.target;
    if (!t) return;
    if (t.id === SYNC_PREFIX + 'price') {
      syncState.defaultPrice = t.value;
      // 同步更新未单独改过的补上架价格输入框
      const body = document.getElementById(PANEL_SYNC + '-bd');
      if (body) {
        for (const inp of body.querySelectorAll('input[data-cfg="price"]')) {
          const saved = syncState.shelveEdits.get(inp.dataset.key);
          if (!saved || saved.price === undefined) inp.value = syncState.defaultPrice;
        }
      }
      return;
    }
    if (t.dataset && t.dataset.cfg && t.dataset.key) {
      const k = t.dataset.key;
      const cur = syncState.shelveEdits.get(k) || {};
      cur[t.dataset.cfg] = t.value;
      syncState.shelveEdits.set(k, cur);
    }
  }

  function setPanelStatus(text) {
    const el = document.getElementById(PANEL_SYNC + '-status');
    if (el) el.textContent = text || '';
  }

  function setProgress(show, text, done, total) {
    const box = document.getElementById(PANEL_SYNC + '-prog');
    if (!box) return;
    box.classList.toggle('show', !!show);
    if (!show) return;
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    const tEl = document.getElementById(PANEL_SYNC + '-prog-text');
    const pEl = document.getElementById(PANEL_SYNC + '-prog-pct');
    const fEl = document.getElementById(PANEL_SYNC + '-prog-fill');
    if (tEl) tEl.textContent = text || '';
    if (pEl) pEl.textContent = pct + '%';
    if (fEl) fEl.style.width = pct + '%';
  }

  async function runPreview() {
    if (syncState.running) return;
    const bodyEl = document.getElementById(PANEL_SYNC + '-bd');
    if (!bodyEl) return;

    const srcShop = (syncState.shops || []).find(s => s.id === syncState.sourceId);
    const activeIds = activeTargetShopIds();
    const targets = (syncState.shops || []).filter(s => activeIds.has(s.id) && s.apiKey);
    const enabled = enabledFieldKeys();

    if (!srcShop) {
      bodyEl.innerHTML = '<div class="empty-box"><strong>请先选择源店铺</strong>在上方下拉框中指定作为基准的源店铺。</div>';
      updateActionButton(0, 0);
      return;
    }
    if (!srcShop.apiKey) {
      bodyEl.innerHTML = `<div class="empty-box"><strong>源店铺「${esc(srcShop.shopName)}」未配置 API 密钥</strong>请点击右上角「店铺自检」查看并在 BCS 补录密钥。</div>`;
      updateActionButton(0, 0);
      return;
    }
    if (!targets.length) {
      bodyEl.innerHTML = '<div class="empty-box"><strong>请至少选择一个目标店铺</strong>点击上方店铺的「同步修改」或「缺品补上」按钮即可开始比对。</div>';
      updateActionButton(0, 0);
      return;
    }
    if (!enabled.length && syncState.shelveShops.size === 0) {
      bodyEl.innerHTML = '<div class="empty-box"><strong>请至少勾选一项要同步的内容</strong>勾选上方「同步内容」，或为目标店铺开启「缺品补上」。</div>';
      updateActionButton(0, 0);
      return;
    }

    syncState.running = true;
    const runBtn = document.getElementById(PANEL_SYNC + '-run');
    const applyBtn = document.getElementById(PANEL_SYNC + '-apply');
    if (runBtn) runBtn.disabled = true;
    if (applyBtn) applyBtn.disabled = true;
    setPanelStatus('正在读取各店商品信息…');
    setProgress(true, '正在读取源店铺与目标店铺数据…', 0, 1);
    bodyEl.innerHTML = '<div class="empty-box"><strong>正在逐店比对商品差异…</strong>请稍候，包含图片内容比对时可能需要几秒钟。</div>';

    try {
      const plan = await buildSyncPlan(syncState.items, srcShop, targets, enabled, (p) => {
        const curStep = Math.min(p.done + 1, p.total);
        setProgress(true, `${p.text}（${curStep}/${p.total}）`, p.done, p.total);
        setPanelStatus(`比对中 ${curStep}/${p.total}`);
      });
      syncState.plan = plan;
      syncState.fetchedShopIds = new Set(targets.map(s => s.id));
      renderPlan(plan);
      updateRunButtonHint();
    } catch (e) {
      log.error('生成预览失败:', e && e.message);
      bodyEl.innerHTML = `<div class="empty-box"><strong style="color:#b91c1c">比对失败</strong>${esc(e.message)}</div>`;
      setPanelStatus('比对失败');
      updateActionButton(0, 0);
    } finally {
      syncState.running = false;
      setProgress(false);
      if (runBtn) runBtn.disabled = false;
      if (syncState.plan) {
        const counts = computeActionCounts(syncState.plan);
        updateActionButton(counts.syncN, counts.shelveN);
      }
    }
  }

  function computeActionCounts(plan) {
    let syncN = 0, shelveN = 0;
    for (const row of plan) {
      for (const cell of row.targets) {
        if (cellNeedsSync(row, cell)) syncN++;
        if (cellWillShelve(row, cell)) shelveN++;
      }
    }
    return { syncN, shelveN };
  }

  function updateActionButton(syncN, shelveN) {
    const ab = document.getElementById(PANEL_SYNC + '-apply');
    if (!ab) return;
    const total = syncN + shelveN;
    ab.disabled = total === 0 || syncState.running;
    if (syncN > 0 && shelveN > 0) ab.textContent = `执行同步与补上架（${total}）`;
    else if (syncN > 0) ab.textContent = `执行同步更新（${syncN}）`;
    else if (shelveN > 0) ab.textContent = `执行补上架（${shelveN}）`;
    else ab.textContent = '暂无可执行项';
  }

  function cellCategory(row, cell) {
    if (cellNeedsSync(row, cell)) return 'sync';
    if (cellWillShelve(row, cell)) return 'shelve';
    if (cell.status === 'listed') return 'same';
    if (cell.status === 'absent') return 'absent';
    return 'error';
  }

  function diffTable(diff) {
    const rows = diff.map(d => `
      <tr class="${d.same ? 'same' : 'ne'}">
        <td style="width:76px;white-space:nowrap">${esc(d.label)}</td>
        <td>${esc(d.src)}</td>
        <td>${esc(d.tgt)}</td>
        <td style="width:176px">${d.same ? '一致' : '<span class="ne-st">将覆盖</span>'}${d.note ? `<span class="dt-note">${esc(d.note)}</span>` : ''}</td>
      </tr>`).join('');
    return `<div class="dt"><table>
      <thead><tr><th>字段</th><th>源店铺</th><th>目标店铺</th><th>结果</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function renderPlan(plan) {
    const bodyEl = document.getElementById(PANEL_SYNC + '-bd');
    if (!bodyEl) return;

    if (!plan) {
      bodyEl.innerHTML = `
        ${renderResults(syncState.lastResults)}
        <div class="tip">执行结果以提交接口的返回为准。如需查看最新差异，请稍后点击「重新比对」。</div>
      `;
      updateActionButton(0, 0);
      updateRunButtonHint();
      return;
    }

    const activeIds = activeTargetShopIds();
    const counts = { all: 0, sync: 0, shelve: 0, same: 0, absent: 0, error: 0 };

    // 统计各状态数量（仅统计当前已选中的目标店铺）
    for (const row of plan) {
      for (const cell of row.targets) {
        if (!activeIds.has(cell.shop.id)) continue;
        const cat = cellCategory(row, cell);
        counts.all++;
        counts[cat]++;
      }
    }

    // 未比对的新增店铺提示
    const unfetchedNames = (syncState.shops || [])
      .filter(s => activeIds.has(s.id) && s.apiKey && !syncState.fetchedShopIds.has(s.id))
      .map(s => s.shopName);
    const noticeHtml = unfetchedNames.length ? `
      <div class="notice">
        <span>新增了尚未比对的目标店铺：<b>${esc(unfetchedNames.join('、'))}</b>，点击右侧按钮加载最新差异。</span>
        <button type="button" class="btn sm primary" data-act="rerun">立即比对</button>
      </div>` : '';

    // 筛选条
    const filters = [
      { key: 'all', label: '全部', num: counts.all, cls: '' },
      { key: 'sync', label: '待同步', num: counts.sync, cls: 'c-sync' },
      { key: 'shelve', label: '待补上架', num: counts.shelve, cls: 'c-shelve' },
      { key: 'same', label: '已一致', num: counts.same, cls: 'c-ok' },
      { key: 'absent', label: '未上架', num: counts.absent, cls: '' },
    ];
    if (counts.error > 0) filters.push({ key: 'error', label: '异常/跳过', num: counts.error, cls: 'c-bad' });
    if (syncState.filter !== 'all' && !counts[syncState.filter]) syncState.filter = 'all';

    const filterHtml = `<div class="filter-bar">${filters.map(f => `
      <button type="button" class="fbtn ${f.cls} ${syncState.filter === f.key ? 'on' : ''}" data-filter="${f.key}">
        <span>${f.label}</span><span class="num">${f.num}</span>
      </button>`).join('')}</div>`;

    // 商品卡片
    const cardsHtml = [];
    for (const row of plan) {
      const visibleCells = row.targets.filter(c => {
        if (!activeIds.has(c.shop.id)) return false;
        if (syncState.filter === 'all') return true;
        return cellCategory(row, c) === syncState.filter;
      });
      const showMissingSrc = !row.source && (syncState.filter === 'all' || syncState.filter === 'error');
      if (!visibleCells.length && !showMissingSrc) continue;

      const it = row.item;
      const thumb = sourceThumbUrl(row.source);
      const thumbHtml = thumb
        ? `<img class="pthumb" src="${esc(thumb)}" alt="">`
        : '<div class="pthumb-empty">无图</div>';
      const srcMeta = row.source
        ? `<span class="pnm">商品ID ${row.source.nmID} · ${photoUrls(row.source).length} 张图</span>`
        : `<span class="tag bad">源店铺未找到：${esc(row.sourceErr || '无该货号')}</span>`;

      const targetRowsHtml = visibleCells.map(cell => {
        const wantSync = syncState.targetIds.has(cell.shop.id);
        const willSync = cellNeedsSync(row, cell);
        const willShelve = cellWillShelve(row, cell);
        const diffItems = (cell.diff || []).filter(d => !d.same);
        const forcePhoto = wantSync && cell.status === 'listed' && isPhotoWriteNeeded(row, cell)
          && !diffItems.some(d => d.key === 'photos');

        // 状态标签
        let stTag = '';
        if (willSync) {
          const n = diffItems.length + (forcePhoto ? 1 : 0);
          stTag = `<span class="tag diff">待同步 · ${n} 项</span>`;
        } else if (willShelve) {
          stTag = '<span class="tag abs">将补上架</span>';
        } else if (cell.status === 'listed') {
          stTag = wantSync
            ? '<span class="tag ok">已一致</span>'
            : '<span class="tag mute">已上架 · 未选同步</span>';
        } else if (cell.status === 'absent') {
          stTag = '<span class="tag mute">未上架</span>';
        } else if (cell.status === 'blocked') {
          stTag = '<span class="tag bad">类目不同 · 跳过</span>';
        } else {
          stTag = '<span class="tag bad">查询失败</span>';
        }

        const riskHtml = (cell.risk || []).map(r => `<div class="risk-txt">⚠ ${esc(r)}</div>`).join('');
        const errHtml = cell.err ? `<div class="err-txt">✕ ${esc(cell.err)}</div>` : '';

        // 右侧详情/操作区
        let detailHtml = '';
        if (cell.status === 'listed' && wantSync) {
          const chips = diffItems.map(d => `<span class="df-chip">${esc(d.label)}</span>`);
          if (forcePhoto) chips.push('<span class="df-chip">图片(强制)</span>');
          const summaryTop = chips.length
            ? `<div class="diff-head">${chips.join('')}</div>`
            : '<span class="muted-note">勾选字段均与源店铺一致</span>';
          const dtBlock = (cell.diff && cell.diff.length)
            ? `<details class="dt-wrap"><summary>查看字段对比 <span class="arr">▾</span></summary>${diffTable(cell.diff)}</details>`
            : '';
          detailHtml = summaryTop + dtBlock;
        } else if (cell.status === 'listed' && !wantSync) {
          detailHtml = '<span class="muted-note">仅勾选了「缺品补上」，该店已上架故跳过</span>';
        } else if (willShelve) {
          const sv = getCellShelveValues(row, cell);
          detailHtml = `<div class="shelve-form">
            <label>货号 <input class="vc" data-cfg="vc" data-key="${esc(sv.key)}" value="${esc(sv.vc)}"></label>
            <label>售价(元) <input data-cfg="price" data-key="${esc(sv.key)}" type="number" min="0" step="0.01" placeholder="取源店价" value="${esc(sv.price)}"></label>
            <label>库存 <input class="qty" data-cfg="qty" data-key="${esc(sv.key)}" type="number" min="0" step="1" value="${esc(sv.qty)}"></label>
            <span class="wh-tag">莫斯科仓</span>
          </div>`;
        } else if (cell.status === 'absent') {
          detailHtml = '<span class="muted-note">该店暂无此商品（可在上方点击该店「缺品补上」）</span>';
        } else {
          detailHtml = '<span class="muted-note">无法执行操作</span>';
        }

        return `<div class="trow">
          <div class="tshop">${esc(cell.shop.shopName)}${cell.nmId ? `<span class="tnm">ID ${cell.nmId}</span>` : ''}</div>
          <div>${stTag}${riskHtml}${errHtml}</div>
          <div>${detailHtml}</div>
        </div>`;
      }).join('');

      cardsHtml.push(`<div class="pcard">
        <div class="pcard-hd">
          ${thumbHtml}
          <div class="pinfo">
            <div class="pmeta">
              <span class="pvc">${esc(it.vendorCode || '（无货号）')}</span>
              ${srcMeta}
            </div>
            <div class="ptitle" title="${esc(it.title)}">${esc(it.title || '（无商品标题）')}</div>
          </div>
        </div>
        <div>${targetRowsHtml || '<div class="trow"><span class="muted-note">当前筛选条件下无匹配店铺</span></div>'}</div>
      </div>`);
    }

    const emptyList = !cardsHtml.length
      ? '<div class="empty-box"><strong>当前筛选条件下没有商品</strong>可以切换上方的状态筛选，或点击「重新比对」。</div>'
      : cardsHtml.join('');

    bodyEl.innerHTML = `
      ${renderResults(syncState.lastResults)}
      ${noticeHtml}
      ${filterHtml}
      ${emptyList}
      <div class="tip">图片会逐张比对，仅在内容不同或勾选「强制换图」时整组替换。执行结果以提交接口的返回为准。如需查看最新差异，请稍后点击「重新比对」。</div>
    `;

    updateActionButton(counts.sync, counts.shelve);
    updateRunButtonHint();
    if (!syncState.running) {
      if (counts.sync || counts.shelve) {
        setPanelStatus(`比对完成：待同步 ${counts.sync} 项，待补上架 ${counts.shelve} 项`);
      } else {
        setPanelStatus('比对完成：当前没有需要写入的差异项');
      }
    }
  }

  // 执行结果区（写完后展示，可手动清除）
  function renderResults(results) {
    if (!results || !results.length) return '';
    const okN = results.filter(r => r.ok).length;
    const failN = results.length - okN;
    const rows = results.map(r => {
      const detail = [r.err, ...(r.bad || [])].filter(Boolean).join('；');
      const notes = (r.notes || []).join('；');
      const actTag = r.action === '上架'
        ? '<span class="tag abs">补上架</span>'
        : '<span class="tag diff">同步</span>';
      return `<tr>
        <td class="mono">${esc(r.item)}</td>
        <td>${actTag}</td>
        <td>${esc(r.shop)}</td>
        <td class="mono">${r.nmId ? r.nmId : '—'}</td>
        <td><span class="tag ${r.ok ? 'ok' : 'bad'}">${r.ok ? '成功' : '失败'}</span></td>
        <td>
          ${esc((r.wrote || []).join('、') || (r.ok ? '已处理' : ''))}
          ${detail ? `<div class="err-txt">${esc(detail)}</div>` : ''}
          ${notes ? `<div class="risk-txt">ℹ ${esc(notes)}</div>` : ''}
        </td>
      </tr>`;
    }).join('');
    return `<div class="res-card">
      <div class="res-hd">
        <b>上次执行结果</b>
        <span class="tag ok">成功 ${okN}</span>
        ${failN ? `<span class="tag bad">失败 ${failN}</span>` : ''}
        <button type="button" class="link-btn mute" data-act="clear-results" style="margin-left:auto">清除记录</button>
      </div>
      <table>
        <thead><tr><th>货号</th><th>操作</th><th>目标店铺</th><th>商品ID</th><th>结果</th><th>说明</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function collectJobs(plan) {
    const jobs = [];
    for (const row of plan) {
      if (!row.source) continue;
      for (const cell of row.targets) {
        if (!cellNeedsSync(row, cell)) continue;
        jobs.push({ row, cell });
      }
    }
    return jobs;
  }

  // 收集补上架任务（优先从已保存的 shelveEdits 读取，确保筛选隐藏行也能取到正确值）
  function collectShelveJobs(plan) {
    const jobs = [];
    for (const row of plan) {
      if (!row.source) continue;
      for (const cell of row.targets) {
        if (!cellWillShelve(row, cell)) continue;
        const sv = getCellShelveValues(row, cell);
        jobs.push({
          row, cell,
          cfg: {
            vendorCode: String(sv.vc || '').trim() || row.item.vendorCode || row.source.vendorCode,
            price: String(sv.price || '').trim(),
            quantity: normalizeWarehouseQuantity(String(sv.qty || '').trim()),
            warehouseId: 0,   // 0 = 自动选莫斯科仓
          },
        });
      }
    }
    return jobs;
  }

  function confirmAndRun() {
    if (syncState.running || !syncState.plan) return;
    const jobs = collectJobs(syncState.plan);
    let shelveJobs;
    try { shelveJobs = collectShelveJobs(syncState.plan); }
    catch (error) { showToast(error.message, 4000); return; }
    if (!jobs.length && !shelveJobs.length) { showToast('没有需要写入的内容', 3000); return; }

    const dlg = document.querySelector(`#${PANEL_SYNC} .dlg`);
    if (!dlg) return;
    const old = document.getElementById(PANEL_SYNC + '-cfm');
    if (old) old.remove();

    const fieldNames = SYNC_FIELDS.filter(f => syncState.fields[f.key]).map(f => f.label).join('、');
    const blocks = [];
    if (jobs.length) {
      const names = Array.from(new Set(jobs.map(j => j.cell.shop.shopName)));
      const photoN = jobs.filter(j => isPhotoWriteNeeded(j.row, j.cell)).length;
      blocks.push(`<div class="cfm-item">
        <div><b>同步更新：${jobs.length} 个商品×店铺</b></div>
        <div>目标店铺：${esc(names.join('、'))}</div>
        <div>同步字段：${esc(fieldNames || '无')}</div>
        ${photoN ? `<div class="risk-txt">⚠ 其中 ${photoN} 项将整组替换目标店商品图片</div>` : ''}
      </div>`);
    }
    if (shelveJobs.length) {
      const names = Array.from(new Set(shelveJobs.map(j => j.cell.shop.shopName)));
      const vcs = Array.from(new Set(shelveJobs.map(j => j.cfg.vendorCode)));
      blocks.push(`<div class="cfm-item amber">
        <div><b>缺品补上架：${shelveJobs.length} 个商品×店铺</b></div>
        <div>目标店铺：${esc(names.join('、'))}</div>
        <div>上架货号：${esc(vcs.slice(0, 5).join('、'))}${vcs.length > 5 ? ` 等 ${vcs.length} 个` : ''}</div>
        <div>仓库固定选莫斯科仓；售价留空时自动取源店价</div>
      </div>`);
    }

    const mask = document.createElement('div');
    mask.className = 'cfm-mask';
    mask.id = PANEL_SYNC + '-cfm';
    mask.innerHTML = `
      <div class="cfm-box">
        <div class="cfm-hd">确认写入 Wildberries / BCS？</div>
        <div class="cfm-bd">
          ${blocks.join('')}
          <div class="tip" style="margin:0">本次操作会写入目标店铺，并按提交接口的返回展示结果。如需查看最新差异，请稍后点击「重新比对」。</div>
        </div>
        <div class="cfm-ft">
          <button type="button" class="btn" data-act="cfm-cancel">取消</button>
          <button type="button" class="btn primary" id="${PANEL_SYNC}-cfm-ok">确认执行</button>
        </div>
      </div>
    `;
    dlg.appendChild(mask);
    mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
    mask.querySelector('#' + PANEL_SYNC + '-cfm-ok').addEventListener('click', () => {
      mask.remove();
      doRun(jobs, shelveJobs);
    });
  }

  async function doRun(jobs, shelveJobs) {
    if (syncState.running || !syncState.plan) return;
    const srcShop = (syncState.shops || []).find(s => s.id === syncState.sourceId);
    const sJobs = shelveJobs || [];
    const total = jobs.length + sJobs.length;
    let done = 0;

    syncState.running = true;
    syncState.lastResults = null;
    const ab = document.getElementById(PANEL_SYNC + '-apply');
    const rb = document.getElementById(PANEL_SYNC + '-run');
    if (ab) { ab.disabled = true; ab.textContent = '执行中…'; }
    if (rb) rb.disabled = true;
    setProgress(true, `开始执行（0/${total}）…`, 0, total);

    const results = [];
    try {
      for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i];
        const label = `同步 ${j.row.item.vendorCode} → ${j.cell.shop.shopName}（${done + 1}/${total}）`;
        setProgress(true, label, done, total);
        setPanelStatus(label);
        const r = await syncOneCell(j.row.source, j.cell.shop, j.row.item.vendorCode, syncState.fields);
        r.item = j.row.item.vendorCode;
        r.action = '同步';
        results.push(r);
        done++;
        setProgress(true, label, done, total);
        if (i < jobs.length - 1) await wbSleep(SYNC_WRITE_GAP);
      }
      for (let i = 0; i < sJobs.length; i++) {
        const j = sJobs[i];
        const label = `补上架 ${j.cfg.vendorCode} → ${j.cell.shop.shopName}（${done + 1}/${total}）`;
        setProgress(true, label, done, total);
        setPanelStatus(label);
        let price = Number(j.cfg.price);
        if (!(price > 0)) {
          try {
            const row = await fetchBcsRowByVc(srcShop.id, j.cfg.vendorCode);
            price = bcsRowDefaults(row).price || Number(userConfig.fixedPrice) || 0;
          } catch (e) {
            price = Number(userConfig.fixedPrice) || 0;
          }
        }
        let r;
        if (!(price > 0)) {
          r = { ok: false, shop: j.cell.shop.shopName, nmId: null, wrote: [], bad: [], err: '未取到有效价格（源店价/默认价均为空）' };
        } else {
          r = await shelveOne(j.row.source, j.cell.shop, Object.assign({}, j.cfg, { price }));
        }
        r.item = j.row.item.vendorCode;
        r.action = '上架';
        results.push(r);
        done++;
        setProgress(true, label, done, total);
        if (i < sJobs.length - 1) await wbSleep(SYNC_WRITE_GAP);
      }
      const okN = results.filter(r => r.ok).length;
      setPanelStatus(`执行完成：成功 ${okN} / 失败 ${results.length - okN}`);
      showToast(`执行完成：成功 ${okN}，失败 ${results.length - okN}`, 5000);
    } catch (e) {
      log.error('执行失败:', e && e.message);
      setPanelStatus('执行异常：' + e.message);
    } finally {
      syncState.running = false;
      syncState.lastResults = results;
      syncState.plan = null;
      syncState.fetchedShopIds.clear();
      setProgress(false);
      if (rb) rb.disabled = false;
      renderPlan(syncState.plan);
    }
  }
