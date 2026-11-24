  // ============================================================
  // 3. P0 面板：店铺权限自检（只读，不写任何商品）
  // ============================================================
  const PANEL_ID = SYNC_PREFIX + 'probe';
  let probeRunning = false;

  // 轻提示（30-config 的异常分支也会调用到）
  let _toastEl = null, _toastTimer = null;
  function showToast(msg, ms = 3000) {
    try {
      if (!_toastEl) {
        _toastEl = document.createElement('div');
        _toastEl.id = SYNC_PREFIX + 'toast';
        _toastEl.style.cssText = [
          'position:fixed', 'left:50%', 'top:24px', 'transform:translateX(-50%)',
          'z-index:2147483000', 'max-width:min(760px,92vw)',
          'padding:10px 18px', 'border-radius:10px',
          'background:#1f2937', 'color:#fff', 'font-size:13px', 'line-height:1.5',
          'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",Roboto,sans-serif',
          'box-shadow:0 10px 30px rgba(15,23,42,.24)', 'border:1px solid rgba(255,255,255,.1)',
          'pointer-events:none', 'opacity:0', 'transition:opacity .18s',
        ].join(';');
        document.body.appendChild(_toastEl);
      }
      _toastEl.textContent = msg;
      _toastEl.style.opacity = '1';
      clearTimeout(_toastTimer);
      _toastTimer = setTimeout(() => { if (_toastEl) _toastEl.style.opacity = '0'; }, ms);
    } catch (e) { /* ignore */ }
  }

  function probeEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function injectProbeStyles() {
    if (document.getElementById(SYNC_PREFIX + 'style')) return;
    const st = document.createElement('style');
    st.id = SYNC_PREFIX + 'style';
    st.textContent = `
#${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",Roboto,sans-serif;}
#${PANEL_ID}{position:fixed;inset:0;z-index:2147482300;display:flex;align-items:center;justify-content:center;padding:20px;
  background:rgba(15,23,42,.38);backdrop-filter:blur(2px);font-size:13px;line-height:1.5;color:#111827;}
#${PANEL_ID} .dlg{width:min(760px,95vw);max-height:88vh;display:flex;flex-direction:column;background:#fff;
  border-radius:14px;border:1px solid #e5e7eb;box-shadow:0 24px 60px rgba(15,23,42,.22);overflow:hidden;}
#${PANEL_ID} .hd{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #eef0f4;background:#fff;}
#${PANEL_ID} .hd .ttl{font-size:16px;font-weight:700;color:#111827;}
#${PANEL_ID} .hd .sub{font-size:12px;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:999px;}
#${PANEL_ID} .hd .hd-act{margin-left:auto;display:flex;align-items:center;gap:8px;}
#${PANEL_ID} .hd .x{width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;
  border:none;background:transparent;border-radius:8px;cursor:pointer;color:#6b7280;font-size:20px;line-height:1;}
#${PANEL_ID} .hd .x:hover{background:#f3f4f6;color:#111827;}
#${PANEL_ID} .bd{padding:16px 18px;overflow:auto;flex:1;background:#f7f8fb;}
#${PANEL_ID} .summary{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;
  padding:10px 14px;margin-bottom:12px;border-radius:10px;background:#fff;border:1px solid #e5e7eb;font-size:12px;color:#4b5563;}
#${PANEL_ID} .summary .stat{display:flex;align-items:center;gap:8px;font-weight:600;color:#111827;}
#${PANEL_ID} .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;}
#${PANEL_ID} table{width:100%;border-collapse:collapse;font-size:12px;}
#${PANEL_ID} th,#${PANEL_ID} td{padding:8px 12px;text-align:left;border-bottom:1px solid #f1f3f7;vertical-align:middle;}
#${PANEL_ID} th{background:#fafbfc;color:#6b7280;font-weight:600;white-space:nowrap;font-size:12px;}
#${PANEL_ID} tr:last-child td{border-bottom:none;}
#${PANEL_ID} .shop-nm{font-weight:600;color:#111827;}
#${PANEL_ID} .shop-id{font-size:11px;color:#9ca3af;font-family:ui-monospace,Consolas,monospace;}
#${PANEL_ID} .mono{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#4b5563;font-variant-numeric:tabular-nums;}
#${PANEL_ID} .pill{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;}
#${PANEL_ID} .pill.ok{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;}
#${PANEL_ID} .pill.bad{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;}
#${PANEL_ID} .pill.warn{background:#fffbeb;color:#b45309;border:1px solid #fde68a;}
#${PANEL_ID} .pill.mute{background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;}
#${PANEL_ID} .acc-sub{font-size:11px;color:#6b7280;margin-top:2px;max-width:190px;white-space:normal;line-height:1.35;}
#${PANEL_ID} .err-row td{padding:0 12px 10px 12px;background:#fff8f8;color:#b91c1c;font-size:11px;white-space:normal;}
#${PANEL_ID} .hint{margin-top:12px;padding:12px 14px;border-radius:10px;background:#fffbeb;
  border:1px solid #fde68a;color:#92400e;font-size:12px;line-height:1.7;}
#${PANEL_ID} .hint b{color:#78350f;}
#${PANEL_ID} .empty{text-align:center;padding:38px 20px;background:#fff;border:1px dashed #d1d5db;border-radius:10px;color:#6b7280;}
#${PANEL_ID} .empty strong{display:block;color:#111827;font-size:14px;margin-bottom:4px;}
#${PANEL_ID} .tip{color:#6b7280;font-size:11px;margin-top:10px;line-height:1.6;}
#${PANEL_ID} .ft{display:flex;gap:8px;align-items:center;padding:12px 18px;border-top:1px solid #eef0f4;background:#fff;}
#${PANEL_ID} button.btn{cursor:pointer;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#374151;
  padding:7px 14px;font-size:13px;font-weight:500;transition:background .15s,border-color .15s;}
#${PANEL_ID} button.btn:hover{background:#f3f4f6;border-color:#9ca3af;}
#${PANEL_ID} button.btn.sm{padding:5px 10px;font-size:12px;}
#${PANEL_ID} button.btn.primary{background:#5b47e0;border-color:#5b47e0;color:#fff;font-weight:600;}
#${PANEL_ID} button.btn.primary:hover{background:#4c38cc;border-color:#4c38cc;}
#${PANEL_ID} button.btn:disabled{opacity:.5;cursor:not-allowed;}
#${PANEL_ID} .status{margin-left:auto;color:#6b7280;font-size:12px;}
`;
    (document.head || document.documentElement).appendChild(st);
  }

  function renderProbeTable(result) {
    const bodyEl = document.getElementById(PANEL_ID + '-bd');
    if (!bodyEl) return;
    if (!result || !result.rows || !result.rows.length) {
      bodyEl.innerHTML = `<div class="empty">
        <strong>还没有检测记录</strong>
        请确保已在 BCS 登录，然后点击下方「开始检测」验证各店铺的 WB 密钥与同步权限。
      </div>`;
      return;
    }

    const ynPill = (v, okText, badText) => v === true
      ? `<span class="pill ok">${okText}</span>`
      : v === false
        ? `<span class="pill bad">${badText}</span>`
        : '<span class="pill mute">未检测</span>';

    const rows = result.rows.map((r) => {
      const expTxt = r.daysLeft == null ? '<span class="pill mute">—</span>'
        : (r.daysLeft < 0 ? '<span class="pill bad">已过期</span>'
          : `<span class="pill ${r.daysLeft < 30 ? 'warn' : 'ok'}">剩 ${r.daysLeft} 天</span>`);
      const keyCell = r.hasKey
        ? `<span class="mono">···${probeEsc(r.keyTail)}</span>`
        : '<span class="pill bad">未配置</span>';
      const accSub = r.accText ? `<div class="acc-sub">${probeEsc(r.accText)}</div>` : '';
      const errTip = [r.pingErr, r.contentErr].filter(Boolean).join('；');
      return `<tr>
        <td>
          <div class="shop-nm">${probeEsc(r.shopName || '未命名店铺')}</div>
          <div class="shop-id">#${probeEsc(r.shopId)}</div>
        </td>
        <td>${keyCell}</td>
        <td>${expTxt}</td>
        <td>${ynPill(r.ping, '正常', '失败')}</td>
        <td>${ynPill(r.content, '可用', '不可用')}${accSub}</td>
        <td class="mono">${r.cardTotal == null ? '—' : r.cardTotal}</td>
      </tr>${errTip ? `<tr class="err-row"><td colspan="6">⚠ ${probeEsc(errTip)}</td></tr>` : ''}`;
    }).join('');

    const okCount = result.rows.filter((r) => r.content === true).length;
    const total = result.rows.length;
    const allOk = okCount === total;
    const hint = allOk ? '' : `<div class="hint">
      <b>有 ${total - okCount} 家店铺暂不可同步，常见处理方法：</b><br>
      1. <b>密钥已被撤销</b>：在 WB 卖家后台重新生成过 API 密钥 → 到 BCS 店铺设置里更新对应密钥。<br>
      2. <b>缺少「内容」权限</b>：WB 后台「设置 → API」新建密钥时，必须勾选「内容 (Content)」权限。<br>
      3. <b>未配置密钥</b>：点右上角「打开 BCS 登录页」，在 BCS 店铺管理中补录 WB API 密钥。
    </div>`;

    bodyEl.innerHTML = `
      <div class="summary">
        <div class="stat">
          <span class="pill ${allOk ? 'ok' : 'warn'}">${allOk ? '全部可用' : `${okCount}/${total} 店可用`}</span>
          <span>共检测 ${total} 家店铺</span>
        </div>
        <span>检测时间：${new Date(result.timestamp).toLocaleString()}</span>
      </div>
      <div class="card">
        <table>
          <thead><tr><th>店铺</th><th>API 密钥</th><th>有效期</th><th>接口连通</th><th>商品同步权限</th><th>商品数</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${hint}
      <div class="tip">说明：结果以 WB 官方接口实时返回为准，仅做只读检测，不会改动任何商品数据。</div>
    `;
  }

  function setProbeStatus(text) {
    const el = document.getElementById(PANEL_ID + '-status');
    if (el) el.textContent = text || '';
  }

  async function runProbe() {
    if (probeRunning) return;
    probeRunning = true;
    const btn = document.getElementById(PANEL_ID + '-run');
    if (btn) { btn.disabled = true; btn.textContent = '检测中…'; }
    setProbeStatus('正在获取店铺列表…');
    try {
      const result = await probeAllShops((msg) => setProbeStatus(msg));
      renderProbeTable(result);
      const ok = result.rows.filter((r) => r.content === true).length;
      setProbeStatus(`检测完成：${ok}/${result.rows.length} 家店铺可用`);
      showToast(`权限自检完成：${ok}/${result.rows.length} 店可用`, 3500);
    } catch (e) {
      log.error('权限自检失败:', e && e.message);
      setProbeStatus('失败：' + (e && e.message));
      showToast('权限自检失败：' + (e && e.message), 6000);
    } finally {
      probeRunning = false;
      if (btn) { btn.disabled = false; btn.textContent = '开始检测'; }
    }
  }

  function injectProbePanel() {
    if (document.getElementById(PANEL_ID)) return;
    injectProbeStyles();
    const div = document.createElement('div');
    div.id = PANEL_ID;
    div.innerHTML = `
      <div class="dlg" role="dialog" aria-label="店铺权限自检">
        <div class="hd">
          <span class="ttl">店铺权限自检</span>
          <span class="sub">v${probeEsc(SYNC_VERSION)} · 只读检测</span>
          <div class="hd-act">
            <button type="button" class="btn sm" id="${PANEL_ID}-login">打开 BCS 登录页</button>
            <button type="button" class="x" title="关闭">×</button>
          </div>
        </div>
        <div class="bd" id="${PANEL_ID}-bd"></div>
        <div class="ft">
          <button type="button" class="btn primary" id="${PANEL_ID}-run">开始检测</button>
          <button type="button" class="btn" id="${PANEL_ID}-clear">清空记录</button>
          <span class="status" id="${PANEL_ID}-status"></span>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    const close = () => {
      document.removeEventListener('keydown', onEsc);
      div.remove();
    };
    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onEsc);
    div.addEventListener('click', (e) => { if (e.target === div) close(); });
    div.querySelector('.x').addEventListener('click', close);
    div.querySelector('#' + PANEL_ID + '-login').addEventListener('click', openBcsLogin);
    div.querySelector('#' + PANEL_ID + '-run').addEventListener('click', runProbe);
    div.querySelector('#' + PANEL_ID + '-clear').addEventListener('click', () => {
      gmSave(PROBE_CACHE_KEY, null);
      renderProbeTable(null);
      setProbeStatus('已清空缓存');
    });
    renderProbeTable(loadProbeCache());
  }
