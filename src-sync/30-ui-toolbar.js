  // ============================================================
  // 4. 列表页悬浮条
  // ============================================================
  const BAR_ID = SYNC_PREFIX + 'bar';

  function injectSyncStyles() {
    if (document.getElementById(SYNC_PREFIX + 'barstyle')) return;
    const st = document.createElement('style');
    st.id = SYNC_PREFIX + 'barstyle';
    st.textContent = `
#${BAR_ID},#${BAR_ID} *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",Roboto,sans-serif;}
#${BAR_ID}{position:fixed;left:20px;bottom:20px;z-index:2147482100;display:flex;align-items:center;gap:6px;
  padding:6px 8px;border-radius:12px;background:rgba(255,255,255,.97);color:#1f2937;
  border:1px solid #e5e7eb;box-shadow:0 8px 28px rgba(15,23,42,.14),0 2px 6px rgba(15,23,42,.06);
  backdrop-filter:blur(10px);font-size:13px;line-height:1.4;}
#${BAR_ID} button{display:inline-flex;align-items:center;gap:6px;cursor:pointer;border-radius:8px;
  border:1px solid transparent;padding:7px 13px;font-size:13px;font-weight:500;line-height:1.2;
  transition:background .15s,border-color .15s,color .15s,box-shadow .15s;white-space:nowrap;}
#${BAR_ID} button.primary{background:#5b47e0;color:#fff;font-weight:600;box-shadow:0 1px 2px rgba(91,71,224,.25);}
#${BAR_ID} button.primary:hover{background:#4c38cc;}
#${BAR_ID} button.secondary{background:#f8f9fc;border-color:#e5e7eb;color:#374151;}
#${BAR_ID} button.secondary:hover{background:#eef0f6;border-color:#d1d5db;color:#111827;}
#${BAR_ID} button:disabled{opacity:.5;cursor:not-allowed;}
#${BAR_ID} .badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;
  padding:0 6px;border-radius:999px;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;
  background:rgba(255,255,255,.22);color:#fff;transition:background .15s;}
#${BAR_ID} .badge.has{background:#fff;color:#5b47e0;}
#${BAR_ID} .divider{width:1px;height:20px;background:#e5e7eb;margin:0 2px;}
#${BAR_ID} .ico{width:14px;height:14px;flex-shrink:0;display:inline-block;}
`;
    (document.head || document.documentElement).appendChild(st);
  }

  function injectSyncBar() {
    if (document.getElementById(BAR_ID)) return;
    injectSyncStyles();
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.innerHTML = `
      <button type="button" class="primary" id="${SYNC_PREFIX}open">
        <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.5 5.5A5 5 0 0 0 3.7 4.2M3.5 10.5a5 5 0 0 0 8.8 1.3"/>
          <path d="M12.8 2.8v2.9H9.9M3.2 13.2v-2.9h2.9"/>
        </svg>
        <span>跨店同步</span>
        <span class="badge" id="${SYNC_PREFIX}cnt">0</span>
      </button>
      <span class="divider"></span>
      <button type="button" class="secondary" id="${SYNC_PREFIX}probe-open" title="检查所有店铺的 API 密钥和同步权限">
        <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 1.8l5 2v4c0 3.2-2.1 5.6-5 6.5-2.9-.9-5-3.3-5-6.5v-4l5-2z"/>
          <path d="M5.8 8.1l1.5 1.5 3-3.1"/>
        </svg>
        <span>店铺自检</span>
      </button>
    `;
    document.body.appendChild(bar);
    _lastSelCount = -1;
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
    if (el) {
      el.textContent = String(n);
      el.classList.toggle('has', n > 0);
    }
  }
