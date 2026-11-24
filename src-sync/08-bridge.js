  // ============================================================
  // 0.5 凭证自给自足（解决"BCS 插件只在 www 运行"的问题）
  //   插件 content_scripts 只注入 www.wildberries.ru，seller 域拿不到 token。
  //   方案：本脚本同时匹配 www 域 → 在 www 页通过 postMessage 桥接取 token →
  //         写入 GM 存储（跨域共享）→ seller 页直接读缓存。
  //   若缓存缺失/过期：面板里可手动粘贴 token（写入同一份缓存，上架脚本也复用）。
  //   ★ 自建 callApi（前缀 s），避免与上架脚本的 c1/c2 序号撞车
  // ============================================================
  const SYNC_CALL_PREFIX = 's';
  const _syncPending = new Map();
  let _syncSeq = 0;

  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'BCS_RESULT') return;
    const { id, result, error } = e.data;
    const resolver = _syncPending.get(id);
    if (!resolver) return;
    _syncPending.delete(id);
    if (error) resolver.reject(new Error(error));
    else resolver.resolve(result);
  });

  function callApi(method, args = [], timeout = 30000) {
    return new Promise((resolve, reject) => {
      const id = SYNC_CALL_PREFIX + (++_syncSeq);
      const timer = setTimeout(() => {
        if (_syncPending.has(id)) {
          _syncPending.delete(id);
          reject(new Error('调用超时: ' + method));
        }
      }, timeout);
      _syncPending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      window.postMessage({ type: 'BCS_CALL', id, method, args }, '*');
    });
  }

  // www 页启动时取凭证并缓存。
  // ★ 插件注入比脚本慢（脚本 document-start，插件 content_script 通常 document_idle），
  //   所以必须轮询等待，不能只试一次。桥接协议能区分三种状态：
  //     · 超时        → 桥接还没注入（插件没加载/没打补丁）
  //     · method not found → 桥接已注入但 getToken 还没挂上（继续等）
  //     · 返回 null   → 插件已就绪但未登录（连续 3 次就放弃，别白等）
  function syncSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function bootstrapCredFromBridge(opts) {
    if (IS_SELLER_HOST) return false;
    const o = opts || {};
    const timeoutMs = o.timeoutMs || 60000;
    const deadline = Date.now() + timeoutMs;
    let lastErr = '';
    let nullStreak = 0;
    let bridgeSeen = false;
    let round = 0;

    while (Date.now() < deadline) {
      if (round > 0) await syncSleep(1000);
      round++;
      // 单次调用超时不超过剩余预算，避免最后一轮拖过 deadline
      const wait = Math.max(600, Math.min(1500, deadline - Date.now()));
      try {
        const t = await callApi('getToken', [], wait);
        bridgeSeen = true;
        if (t) {
          let lk = '';
          try { lk = (await callApi('getLimitKey', [], 1500)) || ''; } catch (e) { /* 可选 */ }
          gmSave(CRED_CACHE_KEY, { token: t, limitKey: lk, ts: Date.now() });
          log.info(`已缓存 BCS 凭证（www → GM，第 ${round} 次尝试成功）`);
          return true;
        }
        nullStreak++;
        if (nullStreak >= 3) {
          log.info('BCS 插件桥接可达但 getToken 连续返回空（插件未登录）');
          return false;
        }
      } catch (e) {
        lastErr = (e && e.message) || String(e);
        // method not found = 桥接在、方法还没挂 → 继续等；超时 = 桥接还没注入 → 继续等
      }
    }
    log.info(`等待 BCS 凭证超时（${Math.round(timeoutMs / 1000)}s，${round} 次尝试）：` +
      (bridgeSeen ? '' : '桥接未注入，') + (lastErr || '无响应'));
    return false;
  }

  // 读当前缓存的凭证状态（不校验有效性）
  function getCachedCred() {
    const c = gmLoad(CRED_CACHE_KEY, null);
    if (!c || !c.token) return null;
    return {
      token: c.token,
      limitKey: c.limitKey || '',
      ts: c.ts || 0,
      ageMin: c.ts ? Math.floor((Date.now() - c.ts) / 60000) : null,
      tail: String(c.token).slice(-8),
      manual: !!c.manual,
    };
  }

  // 手动写入凭证（seller 页兜底）
  function saveManualCred(token, limitKey) {
    const t = String(token || '').trim();
    if (!t) return false;
    gmSave(CRED_CACHE_KEY, { token: t, limitKey: String(limitKey || '').trim(), ts: Date.now(), manual: true });
    return true;
  }
