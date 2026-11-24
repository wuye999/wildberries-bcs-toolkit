  // ============================================================
  // 5. 跨店同步面板（P1：只做预览，不写入）
  // ============================================================
  const PANEL_SYNC = SYNC_PREFIX + 'panel';

  const syncState = {
    shops: null,
    sourceId: null,
    targetIds: new Set(),      // 勾选「同步」的店铺（对已上架的执行更新）
    shelveShops: new Set(),    // 勾选「上架」的店铺（对未上架的执行补上架）
    defaultPrice: '',          // 补上架默认价（空=取源店价）
    fields: { title: true, description: true, brand: true, characteristics: true, dimensions: true, photos: true, photosForce: false },
    plan: null,
    items: [],
    running: false,
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function syncStyles() {
    if (document.getElementById(SYNC_PREFIX + 'panelstyle')) return;
    const st = document.createElement('style');
    st.id = SYNC_PREFIX + 'panelstyle';
    st.textContent = `
#${PANEL_SYNC}{position:fixed;inset:48px 6vw auto 6vw;max-height:82vh;z-index:2147482200;
  display:flex;flex-direction:column;background:#1c2026;color:#e6e9ee;border-radius:12px;
  border:1px solid rgba(255,255,255,.16);box-shadow:0 18px 50px rgba(0,0,0,.55);
  font:13px/1.55 -apple-system,"Segoe UI",system-ui,sans-serif;}
#${PANEL_SYNC} .hd{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.1);}
#${PANEL_SYNC} .hd b{font-size:14px;}
#${PANEL_SYNC} .hd .x{margin-left:auto;cursor:pointer;color:#98a1ae;font-size:20px;line-height:1;padding:0 4px;}
#${PANEL_SYNC} .cfg{display:flex;flex-wrap:wrap;gap:14px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.1);}
#${PANEL_SYNC} .cfg .grp{display:flex;flex-direction:column;gap:6px;min-width:180px;}
#${PANEL_SYNC} .cfg .lb{font-size:11px;color:#8b93a1;letter-spacing:.3px;}
#${PANEL_SYNC} .cfg select{background:#2a3038;color:#e6e9ee;border:1px solid rgba(255,255,255,.18);
  border-radius:6px;padding:5px 8px;font-size:12px;min-width:180px;}
#${PANEL_SYNC} .chips{display:flex;flex-wrap:wrap;gap:6px;max-width:520px;}
#${PANEL_SYNC} .chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;
  background:#262c34;border:1px solid rgba(255,255,255,.14);font-size:12px;cursor:pointer;user-select:none;}
#${PANEL_SYNC} .chip input{margin:0;}
#${PANEL_SYNC} .chip .nm{margin-left:2px;font-weight:600;}
#${PANEL_SYNC} .chip .sep{color:#5c6572;}
#${PANEL_SYNC} .cfg input[type=number],#${PANEL_SYNC} .cfg input[type=text]{
  background:#2a3038;color:#e6e9ee;border:1px solid rgba(255,255,255,.18);
  border-radius:6px;padding:5px 8px;font-size:12px;width:130px;}
#${PANEL_SYNC} .shelve-cfg{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:11px;color:#9aa4b2;}
#${PANEL_SYNC} .shelve-cfg input{background:#2a3038;color:#e6e9ee;border:1px solid rgba(255,255,255,.18);
  border-radius:5px;padding:3px 6px;font-size:11px;width:104px;}
#${PANEL_SYNC} .shelve-cfg .vc{width:190px;}
#${PANEL_SYNC} .bd{padding:10px 14px;overflow:auto;flex:1;}
#${PANEL_SYNC} .sum{display:flex;gap:14px;font-size:12px;color:#9aa4b2;margin-bottom:8px;}
#${PANEL_SYNC} .sum b{color:#e6e9ee;}
#${PANEL_SYNC} table{width:100%;border-collapse:collapse;font-size:12px;}
#${PANEL_SYNC} th,#${PANEL_SYNC} td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.07);
  text-align:left;vertical-align:top;}
#${PANEL_SYNC} th{color:#8b93a1;font-weight:600;white-space:nowrap;}
#${PANEL_SYNC} td.mono{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#9aa4b2;}
#${PANEL_SYNC} .tag{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;white-space:nowrap;}
#${PANEL_SYNC} .tag.ok{background:rgba(61,220,151,.14);color:#3ddc97;}
#${PANEL_SYNC} .tag.diff{background:rgba(47,111,237,.18);color:#7aa7ff;}
#${PANEL_SYNC} .tag.abs{background:rgba(255,196,77,.14);color:#ffc44d;}
#${PANEL_SYNC} .tag.bad{background:rgba(255,107,107,.14);color:#ff8a8a;}
#${PANEL_SYNC} details{margin:2px 0;}
#${PANEL_SYNC} summary{cursor:pointer;color:#7aa7ff;font-size:11px;}
#${PANEL_SYNC} .dt{margin:6px 0 10px 0;border:1px solid rgba(255,255,255,.1);border-radius:6px;overflow:hidden;}
#${PANEL_SYNC} .dt table{font-size:11px;}
#${PANEL_SYNC} .dt td{padding:4px 6px;}
#${PANEL_SYNC} .dt .same{color:#6b7482;}
#${PANEL_SYNC} .dt .ne{color:#ffc44d;}
#${PANEL_SYNC} .ft{display:flex;gap:8px;align-items:center;padding:10px 14px;border-top:1px solid rgba(255,255,255,.1);}
#${PANEL_SYNC} button{cursor:pointer;border-radius:6px;border:1px solid rgba(255,255,255,.18);
  background:#2a3038;color:#e6e9ee;padding:6px 12px;font-size:12px;}
#${PANEL_SYNC} button.primary{background:#2f6fed;border-color:#2f6fed;font-weight:600;}
#${PANEL_SYNC} button:disabled{opacity:.5;cursor:not-allowed;}
#${PANEL_SYNC} .status{margin-left:auto;color:#9aa4b2;font-size:12px;}
#${PANEL_SYNC} .tip{color:#8b93a1;font-size:11px;margin-top:6px;}
`;
    (document.head || document.documentElement).appendChild(st);
  }

  async function openSyncPanel() {
    syncStyles();
    syncState.items = getSellerSelectedRows();
    if (!syncState.items.length) {
      showToast('请先在列表里勾选商品', 3000);
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
      showToast('正在按页面 nmId 反推源店铺…', 2500);
      try {
        const inferred = await inferSourceShop(syncState.items, shops);
        if (inferred) syncState.sourceId = inferred.id;
      } catch (e) { /* 失败则保持默认，面板里可手动改 */ }
      if (!shops.some(s => s.id === syncState.sourceId && s.apiKey)) {
        showToast('未能识别当前登录店铺，请在下拉框里手动选择源店铺', 5000);
      }
    }

    if (!isCardMainPage()) return;
    syncState.targetIds = new Set(shops.filter(s => s.id !== syncState.sourceId).map(s => s.id));

    let div = document.getElementById(PANEL_SYNC);
    if (!div) {
      div = document.createElement('div');
      div.id = PANEL_SYNC;
      document.body.appendChild(div);
    }
    renderSyncPanel();
    runPreview();
  }

  function renderSyncPanel() {
    const div = document.getElementById(PANEL_SYNC);
    if (!div) return;
    const shops = syncState.shops || [];
    const srcOpts = shops.map(s =>
      `<option value="${s.id}" ${s.id === syncState.sourceId ? 'selected' : ''}>${esc(shopLabel(s))}</option>`).join('');
    const tgtChips = shops.map(s => {
      const dis = (s.id === syncState.sourceId || !s.apiKey) ? 'disabled' : '';
      return `<span class="chip">
        <input type="checkbox" data-tgt="${s.id}" ${syncState.targetIds.has(s.id) ? 'checked' : ''} ${dis} title="对已上架的商品执行同步">同步
        <span class="sep">|</span>
        <input type="checkbox" data-shelve="${s.id}" ${syncState.shelveShops.has(s.id) ? 'checked' : ''} ${dis} title="对未上架的商品执行补上架">上架
        <span class="nm">${esc(s.shopName)}</span>
        ${s.apiKey ? '' : '<span class="tag bad">无key</span>'}
      </span>`;
    }).join('');
    const fieldChips = SYNC_FIELDS.map(f => `
      <label class="chip"><input type="checkbox" data-field="${f.key}" ${syncState.fields[f.key] ? 'checked' : ''}>${f.label}</label>`).join('')
      + `<label class="chip" title="张数相同时也强制替换（WB 会重新编码图片，字节会变）">
           <input type="checkbox" data-field="photosForce" ${syncState.fields.photosForce ? 'checked' : ''}>强制换图</label>`;

    div.innerHTML = `
      <div class="hd">
        <b>跨店同步</b>
        <span class="tag diff">预览模式 · 不写入</span>
        <span class="x" title="关闭">×</span>
      </div>
      <div class="cfg">
        <div class="grp"><span class="lb">源店铺（当前登录，可改）</span>
          <select id="${SYNC_PREFIX}src">${srcOpts}</select></div>
        <div class="grp"><span class="lb">目标店铺（同步 ${syncState.targetIds.size} / 上架 ${syncState.shelveShops.size}）</span>
          <div class="chips">${tgtChips}</div></div>
        <div class="grp"><span class="lb">同步字段</span>
          <div class="chips">${fieldChips}</div></div>
        <div class="grp"><span class="lb">补上架默认价（元，留空=取源店价）</span>
          <input type="number" min="0" step="0.01" id="${SYNC_PREFIX}price"
            value="${esc(syncState.defaultPrice)}" placeholder="自动取源店价"></div>
      </div>
      <div class="bd" id="${PANEL_SYNC}-bd"><div class="tip">正在读取…</div></div>
      <div class="ft">
        <button class="primary" id="${PANEL_SYNC}-run">重新预览</button>
        <button id="${PANEL_SYNC}-apply" disabled>执行同步</button>
        <button id="${PANEL_SYNC}-close">关闭</button>
        <span class="status" id="${PANEL_SYNC}-status"></span>
      </div>
    `;

    div.querySelector('.x').addEventListener('click', () => div.remove());
    div.querySelector('#' + PANEL_SYNC + '-close').addEventListener('click', () => div.remove());
    div.querySelector('#' + PANEL_SYNC + '-run').addEventListener('click', runPreview);
    div.querySelector('#' + PANEL_SYNC + '-apply').addEventListener('click', confirmAndRun);
    div.querySelector('#' + SYNC_PREFIX + 'src').addEventListener('change', (e) => {
      const v = Number(e.target.value);
      syncState.sourceId = v;
      syncState.targetIds = new Set((syncState.shops || []).filter(s => s.id !== v).map(s => s.id));
      renderSyncPanel();
      runPreview();
    });
    // 事件委托只绑一次（renderSyncPanel 会重刷 innerHTML，避免监听器叠加）
    if (!div.dataset.bound) {
      div.dataset.bound = '1';
      div.addEventListener('change', (e) => {
        const t = e.target;
        if (t.dataset && t.dataset.tgt) {
          const id = Number(t.dataset.tgt);
          if (t.checked) syncState.targetIds.add(id); else syncState.targetIds.delete(id);
          setPanelStatus(`目标店铺 ${syncState.targetIds.size} 个`);
        }
        if (t.dataset && t.dataset.field) {
          const k = t.dataset.field;
          syncState.fields[k] = t.checked;
          // 图片逐张比对依赖这两个开关，切换后重跑预览（哈希有缓存，第二次很快）
          if ((k === 'photos' || k === 'photosForce') && syncState.plan) runPreview();
        }
        if (t.dataset && t.dataset.shelve) {
          const id = Number(t.dataset.shelve);
          if (t.checked) syncState.shelveShops.add(id); else syncState.shelveShops.delete(id);
          setPanelStatus(`上架店铺 ${syncState.shelveShops.size} 个`);
          if (syncState.plan) renderPlan(syncState.plan);   // 重绘以显示/隐藏 vc·价·库存 输入
        }
        if (t.id === SYNC_PREFIX + 'price') {
          syncState.defaultPrice = t.value;
        }
      });
    }
  }

  function setPanelStatus(text) {
    const el = document.getElementById(PANEL_SYNC + '-status');
    if (el) el.textContent = text || '';
  }

  async function runPreview() {
    if (syncState.running) return;
    const bodyEl = document.getElementById(PANEL_SYNC + '-bd');
    if (!bodyEl) return;
    const srcShop = (syncState.shops || []).find(s => s.id === syncState.sourceId);
    const targets = (syncState.shops || []).filter(s => syncState.targetIds.has(s.id) && s.id !== syncState.sourceId);
    const enabled = SYNC_FIELDS.filter(f => syncState.fields[f.key]).map(f => f.key);
    if (!srcShop) { bodyEl.innerHTML = '<div class="tip">请选择源店铺</div>'; return; }
    if (!targets.length) { bodyEl.innerHTML = '<div class="tip">请至少选择一个目标店铺</div>'; return; }
    if (!enabled.length) { bodyEl.innerHTML = '<div class="tip">请至少勾选一个同步字段</div>'; return; }

    syncState.running = true;
    setPanelStatus('读取中…');
    bodyEl.innerHTML = '<div class="tip">正在按 vendorCode 逐店读取，请稍候…</div>';
    try {
      const plan = await buildSyncPlan(syncState.items, srcShop, targets, enabled, (p) => {
        setPanelStatus(`${p.text}（${Math.min(p.done + 1, p.total)}/${p.total}）`);
      });
      syncState.plan = plan;
      renderPlan(plan);
      setPanelStatus('预览完成（未写入任何数据）');
    } catch (e) {
      log.error('生成预览失败:', e && e.message);
      bodyEl.innerHTML = `<div class="tip" style="color:#ff8a8a">生成失败：${esc(e.message)}</div>`;
      setPanelStatus('失败');
    } finally {
      syncState.running = false;
    }
  }

  function statusTag(cell) {
    if (cell.status === 'listed') {
      const diffN = cell.diff.filter(d => !d.same).length;
      return diffN
        ? `<span class="tag diff">已上架 · ${diffN} 项差异</span>`
        : '<span class="tag ok">已上架 · 无差异</span>';
    }
    if (cell.status === 'absent') return '<span class="tag abs">未上架</span>';
    if (cell.status === 'blocked') return '<span class="tag bad">阻断</span>';
    return '<span class="tag bad">查询失败</span>';
  }

  function diffTable(diff) {
    const rows = diff.map(d => `
      <tr class="${d.same ? 'same' : 'ne'}">
        <td>${esc(d.label)}</td>
        <td>${esc(d.src)}</td>
        <td>${esc(d.tgt)}</td>
        <td>${d.same ? '相同' : '不同'}${d.note ? '<br><span style="color:#8b93a1">' + esc(d.note) + '</span>' : ''}</td>
      </tr>`).join('');
    return `<div class="dt"><table>
      <thead><tr><th>字段</th><th>源店铺</th><th>目标店铺</th><th>状态</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function renderPlan(plan) {
    const bodyEl = document.getElementById(PANEL_SYNC + '-bd');
    if (!bodyEl) return;
    let listed = 0, absent = 0, blocked = 0, failed = 0, needSync = 0, abCount = 0, shelveN = 0;
    const rows = [];

    for (const row of plan) {
      const it = row.item;
      const srcInfo = row.source
        ? `<span class="mono">nm ${row.source.nmID} · subj ${row.source.subjectID} · ${photoUrls(row.source).length} 图</span>`
        : `<span class="tag bad">源店铺未找到：${esc(row.sourceErr)}</span>`;
      rows.push(`<tr style="background:rgba(255,255,255,.03)">
        <td colspan="4"><b>${esc(it.vendorCode || '（无 vc）')}</b>
          <span class="mono"> · 页面 nm ${esc(it.nmId)}</span><br>
          <span style="color:#9aa4b2">${esc(it.title).slice(0, 70)}</span><br>${srcInfo}</td>
      </tr>`);

      for (const cell of row.targets) {
        if (cell.status === 'listed') {
          listed++;
          if (cell.diff.some(d => !d.same)) needSync++;
        } else if (cell.status === 'absent') absent++;
        else if (cell.status === 'blocked') blocked++;
        else failed++;

        // 可执行：已上架且有差异/需要换图；或未上架且该店勾了「上架」
        const pSrc = row.source ? photoUrls(row.source).length : 0;
        const pi = cell._photoInfo;
        const photoWrite = !!syncState.fields.photos && pSrc > 0 &&
          (!!syncState.fields.photosForce || (pi ? !pi.same : pSrc !== photoUrls(cell._card || {}).length));
        if (cell.status === 'listed' && row.source &&
            (cell.diff.some(d => !d.same) || photoWrite)) {
          abCount++;
        }
        const willShelve = cell.status === 'absent' && row.source && syncState.shelveShops.has(cell.shop.id);
        if (willShelve) { abCount++; shelveN++; }

        const cfgKey = `${row.item.vendorCode}|${cell.shop.id}`;
        const defVc = row.item.vendorCode || (row.source && row.source.vendorCode) || '';
        const detail = cell.status === 'listed'
          ? `<details><summary>查看差异（${cell.diff.filter(d => !d.same).length} 项不同）</summary>${diffTable(cell.diff)}</details>`
          : willShelve
            ? `<div class="shelve-cfg">
                 <label>vc <input class="vc" data-cfg="vc" data-key="${esc(cfgKey)}" data-shop="${cell.shop.id}" value="${esc(defVc)}"></label>
                 <label>价 <input data-cfg="price" data-key="${esc(cfgKey)}" data-shop="${cell.shop.id}" type="number" min="0" step="0.01" placeholder="源店价" value="${esc(syncState.defaultPrice)}"></label>
                 <label>库存 <input data-cfg="qty" data-key="${esc(cfgKey)}" data-shop="${cell.shop.id}" type="number" min="0" step="1" value="999"></label>
               </div>
               <div class="tip">仓库：自动选莫斯科仓</div>`
            : '';
        const risk = (cell.risk || []).map(r => `<div style="color:#ffc44d;font-size:11px">⚠ ${esc(r)}</div>`).join('');
        const err = cell.err ? `<div style="color:#ff8a8a;font-size:11px">${esc(cell.err)}</div>` : '';
        const stTag = willShelve ? '<span class="tag abs">未上架 · 将补上架</span>' : statusTag(cell);
        rows.push(`<tr>
          <td></td>
          <td>${esc(cell.shop.shopName)}</td>
          <td>${stTag} ${cell.nmId ? `<span class="mono">${cell.nmId}</span>` : ''}${risk}${err}</td>
          <td>${detail}</td>
        </tr>`);
      }
    }

    bodyEl.innerHTML = `${renderResults(syncState.lastResults)}
      <div class="sum">
        <span>商品 <b>${plan.length}</b></span>
        <span>已上架 <b>${listed}</b></span>
        <span>待同步 <b>${needSync}</b></span>
        <span>未上架 <b>${absent}</b></span>
        <span>待补上架 <b>${shelveN}</b></span>
        <span>阻断 <b>${blocked}</b></span>
        <span>失败 <b>${failed}</b></span>
      </div>
      <table>
        <thead><tr><th style="width:34%">商品（源店铺）</th><th style="width:16%">目标店铺</th>
          <th style="width:26%">状态</th><th>差异</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
      <div class="tip">预览不写入。勾选「图片」时执行会把源店整组图推给目标店（media/save 为完全替换）；属性按 charcID 比对有值项；图片只比张数。</div>
    `;

    const ab = document.getElementById(PANEL_SYNC + '-apply');
    if (ab) {
      ab.disabled = abCount === 0 || syncState.running;
      ab.textContent = abCount ? `执行同步（${abCount}）` : '执行同步';
    }
  }

  // 执行结果区（写完后展示，预览重跑时保留）
  function renderResults(results) {
    if (!results || !results.length) return '';
    const okN = results.filter(r => r.ok).length;
    const rows = results.map(r => {
      const cls = r.ok ? 'ok' : 'bad';
      const detail = [r.err, ...(r.bad || [])].filter(Boolean).join('；');
      const notes = (r.notes || []).join('；');
      return `<tr>
        <td class="mono">${esc(r.item)}</td>
        <td>${esc(r.shop)}</td>
        <td>${r.nmId ? `<span class="mono">${r.nmId}</span>` : '—'}</td>
        <td><span class="tag ${cls}">${r.ok ? '成功' : '失败'}</span></td>
        <td>${esc((r.wrote || []).join('、'))}${detail ? `<br><span style="color:#ff8a8a">${esc(detail)}</span>` : ''}${notes ? `<br><span style="color:#ffc44d">ℹ ${esc(notes)}</span>` : ''}</td>
      </tr>`;
    }).join('');
    return `<div style="margin-bottom:12px">
      <div style="font-size:12px;color:#9aa4b2;margin-bottom:4px">
        上次执行结果：成功 <b style="color:#3ddc97">${okN}</b> / 失败 <b style="color:#ff8a8a">${results.length - okN}</b>
      </div>
      <table><thead><tr><th>商品</th><th>店铺</th><th>nmID</th><th>结果</th><th>写入/异常</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>`;
  }

  function collectJobs(plan) {
    const jobs = [];
    for (const row of plan) {
      if (!row.source) continue;
      for (const cell of row.targets) {
        if (cell.status !== 'listed') continue;
        const diffN = cell.diff.filter(d => !d.same).length;
        const pSrc = photoUrls(row.source).length;
        const pi = cell._photoInfo;
        const photoWrite = !!syncState.fields.photos && pSrc > 0 &&
          (!!syncState.fields.photosForce || (pi ? !pi.same : pSrc !== photoUrls(cell._card || {}).length));
        if (!diffN && !photoWrite) continue;
        jobs.push({ row, cell });
      }
    }
    return jobs;
  }

  // 收集补上架任务（从预览表格里的 vc/价/库存 输入框读取）
  function collectShelveJobs(plan) {
    const body = document.getElementById(PANEL_SYNC + '-bd');
    const inputs = body ? Array.from(body.querySelectorAll('input[data-cfg]')) : [];
    const cfgMap = new Map();
    for (const inp of inputs) {
      const k = inp.dataset.key;
      if (!k) continue;
      if (!cfgMap.has(k)) cfgMap.set(k, {});
      cfgMap.get(k)[inp.dataset.cfg] = String(inp.value || '').trim();
    }
    const jobs = [];
    for (const row of plan) {
      if (!row.source) continue;
      for (const cell of row.targets) {
        if (cell.status !== 'absent' || !syncState.shelveShops.has(cell.shop.id)) continue;
        const c = cfgMap.get(`${row.item.vendorCode}|${cell.shop.id}`) || {};
        jobs.push({
          row, cell,
          cfg: {
            vendorCode: c.vc || row.item.vendorCode || row.source.vendorCode,
            price: c.price || '',
            quantity: normalizeWarehouseQuantity(c.qty),
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
    const fieldNames = SYNC_FIELDS.filter(f => syncState.fields[f.key]).map(f => f.label).join('、');
    const lines = ['即将写入（真实生效）：', ''];
    if (jobs.length) {
      const names = Array.from(new Set(jobs.map(j => j.cell.shop.shopName)));
      lines.push(`· 同步更新：${jobs.length} 个商品×店铺（${names.join('、')}）`);
      lines.push(`· 同步字段：${fieldNames}`);
      const photoN = jobs.filter(j => {
        const pSrc = photoUrls(j.row.source).length;
        const pi = j.cell._photoInfo;
        return !!syncState.fields.photos && pSrc > 0 &&
          (!!syncState.fields.photosForce || (pi ? !pi.same : pSrc !== photoUrls(j.cell._card || {}).length));
      }).length;
      if (photoN) lines.push(`· 图片整体替换：${photoN} 个组合（WB 会重新编码图片）`);
    }
    if (shelveJobs.length) {
      const names = Array.from(new Set(shelveJobs.map(j => j.cell.shop.shopName)));
      const vcs = Array.from(new Set(shelveJobs.map(j => j.cfg.vendorCode)));
      lines.push(`· 补上架：${shelveJobs.length} 个商品×店铺（${names.join('、')}）`);
      lines.push(`· 上架 vc：${vcs.join('、')}`);
      lines.push('· 仓库：莫斯科仓；库存/价格按各行填写（留空则取源店价）');
    }
    lines.push('', '写入后自动回读校验。确认执行？');
    if (!window.confirm(lines.join('\n'))) return;
    doRun(jobs, shelveJobs);
  }

  async function doRun(jobs, shelveJobs) {
    const srcShop = (syncState.shops || []).find(s => s.id === syncState.sourceId);
    const sJobs = shelveJobs || [];
    syncState.running = true;
    syncState.lastResults = null;
    const ab = document.getElementById(PANEL_SYNC + '-apply');
    if (ab) { ab.disabled = true; ab.textContent = '写入中…'; }
    const results = [];
    try {
      for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i];
        setPanelStatus(`同步 ${j.row.item.vendorCode} → ${j.cell.shop.shopName}（${i + 1}/${jobs.length}）`);
        const r = await syncOneCell(j.row.source, j.cell.shop, j.row.item.vendorCode, syncState.fields);
        r.item = j.row.item.vendorCode;
        r.action = '同步';
        results.push(r);
        if (i < jobs.length - 1) await wbSleep(SYNC_WRITE_GAP);
      }
      for (let i = 0; i < sJobs.length; i++) {
        const j = sJobs[i];
        setPanelStatus(`补上架 ${j.cfg.vendorCode} → ${j.cell.shop.shopName}（${i + 1}/${sJobs.length}）`);
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
        if (i < sJobs.length - 1) await wbSleep(SYNC_WRITE_GAP);
      }
      const okN = results.filter(r => r.ok).length;
      syncState.lastResults = results;
      setPanelStatus(`完成：成功 ${okN} / 失败 ${results.length - okN}`);
      showToast(`执行完成：成功 ${okN}，失败 ${results.length - okN}`, 5000);
    } catch (e) {
      log.error('执行失败:', e && e.message);
      setPanelStatus('执行异常：' + e.message);
      syncState.lastResults = results;
    } finally {
      syncState.running = false;
      await runPreview();   // 写完重读，刷新差异
    }
  }
