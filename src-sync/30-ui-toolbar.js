  // ============================================================
  // 4. 列表页悬浮条（独立于上架脚本的工具栏，id 前缀 bcs-sync-）
  // ============================================================
  const BAR_ID = SYNC_PREFIX + 'bar';

  function injectSyncStyles() {
    if (document.getElementById(SYNC_PREFIX + 'barstyle')) return;
    const st = document.createElement('style');
    st.id = SYNC_PREFIX + 'barstyle';
    st.textContent = `
#${BAR_ID}{position:fixed;left:16px;bottom:16px;z-index:2147482100;display:flex;align-items:center;gap:8px;
  padding:8px 10px;border-radius:10px;background:rgba(28,32,38,.96);color:#e6e9ee;
  border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 26px rgba(0,0,0,.42);
  font:13px/1.4 -apple-system,"Segoe UI",system-ui,sans-serif;}
#${BAR_ID} .cnt{color:#9aa4b2;font-size:12px;min-width:56px;}
#${BAR_ID} .cnt b{color:#3ddc97;}
#${BAR_ID} button{cursor:pointer;border-radius:6px;border:1px solid rgba(255,255,255,.18);
  background:#2a3038;color:#e6e9ee;padding:6px 12px;font-size:12px;}
#${BAR_ID} button.primary{background:#2f6fed;border-color:#2f6fed;font-weight:600;}
#${BAR_ID} button:disabled{opacity:.5;cursor:not-allowed;}
`;
    (document.head || document.documentElement).appendChild(st);
  }

  function injectSyncBar() {
    if (document.getElementById(BAR_ID)) return;
    injectSyncStyles();
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.innerHTML = `
      <button class="primary" id="${SYNC_PREFIX}open">跨店同步</button>
      <button id="${SYNC_PREFIX}probe-open">店铺自检</button>
      <span class="cnt" id="${SYNC_PREFIX}cnt">已选 0</span>
    `;
    document.body.appendChild(bar);
    bar.querySelector('#' + SYNC_PREFIX + 'open').addEventListener('click', openSyncPanel);
    bar.querySelector('#' + SYNC_PREFIX + 'probe-open').addEventListener('click', () => {
      injectProbePanel();
      const el = document.getElementById(SYNC_PREFIX + 'probe');
      if (el) el.style.display = '';
    });
  }

  let _lastSelCount = -1;
  function pollSelection() {
    const n = countSellerSelected();
    if (n === _lastSelCount) return;
    _lastSelCount = n;
    const el = document.getElementById(SYNC_PREFIX + 'cnt');
    if (el) el.innerHTML = `已选 <b>${n}</b>`;
  }
