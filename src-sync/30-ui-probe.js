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
          'padding:10px 16px', 'border-radius:8px',
          'background:rgba(28,32,38,.96)', 'color:#fff', 'font-size:13px', 'line-height:1.5',
          'box-shadow:0 6px 24px rgba(0,0,0,.35)', 'border:1px solid rgba(255,255,255,.14)',
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

  function injectProbeStyles() {
    if (document.getElementById(SYNC_PREFIX + 'style')) return;
    const st = document.createElement('style');
    st.id = SYNC_PREFIX + 'style';
    st.textContent = `
#${PANEL_ID}{position:fixed;top:64px;right:16px;width:660px;max-width:94vw;z-index:2147482000;
  background:#1c2026;color:#e6e9ee;border:1px solid rgba(255,255,255,.14);border-radius:10px;
  box-shadow:0 10px 34px rgba(0,0,0,.45);font:13px/1.55 -apple-system,"Segoe UI",system-ui,sans-serif;}
#${PANEL_ID} .hd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.1);}
#${PANEL_ID} .hd b{font-size:14px;}
#${PANEL_ID} .hd .ver{font-size:11px;color:#8b93a1;}
#${PANEL_ID} .hd .x{margin-left:auto;cursor:pointer;color:#98a1ae;font-size:18px;line-height:1;padding:0 4px;}
#${PANEL_ID} .bd{padding:10px 12px;max-height:62vh;overflow:auto;}
#${PANEL_ID} .cred{padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.07);}
#${PANEL_ID} table{width:100%;border-collapse:collapse;font-size:12px;}
#${PANEL_ID} th,#${PANEL_ID} td{padding:5px 6px;text-align:left;border-bottom:1px solid rgba(255,255,255,.07);white-space:nowrap;}
#${PANEL_ID} th{color:#8b93a1;font-weight:600;}
#${PANEL_ID} td.mono{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#9aa4b2;}
#${PANEL_ID} .ok{color:#3ddc97;}
#${PANEL_ID} .bad{color:#ff6b6b;}
#${PANEL_ID} .warn{color:#ffc44d;}
#${PANEL_ID} .ft{display:flex;gap:8px;align-items:center;padding:10px 12px;border-top:1px solid rgba(255,255,255,.1);}
#${PANEL_ID} button{cursor:pointer;border-radius:6px;border:1px solid rgba(255,255,255,.18);
  background:#2a3038;color:#e6e9ee;padding:6px 12px;font-size:12px;}
#${PANEL_ID} button.primary{background:#2f6fed;border-color:#2f6fed;}
#${PANEL_ID} button:disabled{opacity:.55;cursor:not-allowed;}
#${PANEL_ID} .status{margin-left:auto;color:#9aa4b2;font-size:12px;}
#${PANEL_ID} .hint{margin-top:8px;padding:8px 10px;border-radius:6px;background:rgba(255,196,77,.08);
  border:1px solid rgba(255,196,77,.28);color:#ffd98a;font-size:12px;line-height:1.6;}
#${PANEL_ID} .tip{color:#8b93a1;font-size:11px;margin-top:6px;line-height:1.6;}
`;
    (document.head || document.documentElement).appendChild(st);
  }

  function renderProbeTable(result) {
    const bodyEl = document.getElementById(PANEL_ID + '-bd');
    if (!bodyEl) return;
    if (!result || !result.rows || !result.rows.length) {
      bodyEl.innerHTML = '<div class="tip">还没有检测数据，点右下「开始检测」。</div>';
      return;
    }
    const yn = (v) => v === true ? '<span class="ok">✓</span>'
      : v === false ? '<span class="bad">✗</span>' : '<span class="warn">–</span>';
    const rows = result.rows.map((r) => {
      const expTxt = r.daysLeft == null ? '—'
        : (r.daysLeft < 0 ? `<span class="bad">已过期</span>`
          : `<span class="${r.daysLeft < 30 ? 'warn' : 'ok'}">${r.daysLeft} 天</span>`);
      const acc = r.acc == null ? '—' : `${r.acc} <span class="mono">(${r.accText})</span>`;
      const errTip = [r.pingErr, r.contentErr].filter(Boolean).join(' / ');
      return `<tr>
        <td>${r.shopId}<br><span class="mono">${r.shopName || ''}</span></td>
        <td class="mono">${r.hasKey ? '…' + r.keyTail : '<span class="bad">无</span>'}</td>
        <td>${expTxt}</td>
        <td>${acc}</td>
        <td>${yn(r.ping)}</td>
        <td>${yn(r.content)}</td>
        <td class="mono">${r.cardTotal == null ? '—' : r.cardTotal}</td>
      </tr>${errTip ? `<tr><td colspan="7" class="bad" style="padding-top:0">${errTip}</td></tr>` : ''}`;
    }).join('');

    const okCount = result.rows.filter((r) => r.content === true).length;
    const total = result.rows.length;
    const allOk = okCount === total;
    const hint = allOk ? '' : `<div class="hint">
      ${total - okCount} 个店铺 Content 不可用。常见原因与处置：<br>
      · <b>token 已被撤销</b>：WB 后台重新生成过密钥 → 更新 BCS 店铺里的 apiKey<br>
      · <b>缺少「内容」类别</b>：WB 后台 Settings → API → 新建 token 时勾选「内容」（类别创建后不可改，必须新建）<br>
      · <b>BCS 未返回 apiKey</b>：请登录 BCS 网站并更新该店的 WB API 密钥
    </div>`;

    bodyEl.innerHTML = `
      <table>
        <thead><tr><th>店铺</th><th>apiKey</th><th>有效期</th><th>acc(类别)</th><th>ping</th><th>Content</th><th>卡片数</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${hint}
      <div class="tip">判定以真实接口返回为准（ping=common-api，Content=content/v2/get/cards/list limit=1）。acc 位掩码仅作参考。检测时间：${new Date(result.timestamp).toLocaleString()}</div>
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
      setProbeStatus(`完成：${ok}/${result.rows.length} 店 Content 可用`);
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
      <div class="hd">
        <b>跨店同步 · 店铺权限自检</b>
        <span class="ver">v${SYNC_VERSION} · 只读</span>
        <span class="x" title="关闭">×</span>
      </div>
      <div class="cred">
        <button type="button" id="${PANEL_ID}-login">打开 BCS 登录页</button>
        <span class="tip">登录后，点「开始检测」验证店铺权限。</span>
      </div>
      <div class="bd" id="${PANEL_ID}-bd"></div>
      <div class="ft">
        <button class="primary" id="${PANEL_ID}-run">开始检测</button>
        <button id="${PANEL_ID}-clear">清空缓存</button>
        <span class="status" id="${PANEL_ID}-status"></span>
      </div>
    `;
    document.body.appendChild(div);
    div.querySelector('.x').addEventListener('click', () => div.remove());
    div.querySelector('#' + PANEL_ID + '-login').addEventListener('click', openBcsLogin);
    div.querySelector('#' + PANEL_ID + '-run').addEventListener('click', runProbe);
    div.querySelector('#' + PANEL_ID + '-clear').addEventListener('click', () => {
      gmSave(PROBE_CACHE_KEY, null);
      renderProbeTable(null);
      setProbeStatus('已清空缓存');
    });
    renderProbeTable(loadProbeCache());
  }
