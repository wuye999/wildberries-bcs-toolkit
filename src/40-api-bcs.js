  // ============================================================
  // 3. BCS 云端 API
  // ============================================================
  const BCS_API_BASE = 'https://wb.bcserp.com/prod-api';
  const BCS_LOGIN_URL = 'https://wb.bcserp.com/productList';
  let bcsAuthCache;
  let bcsAuthPending;

  async function openBcsLogin() {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'EXT_OPEN_BCS_LOGIN' });
      if (!result?.ok) throw new Error(result?.error || '后台未响应');
    } catch (error) {
      showToast(`打开 BCS 登录页失败，请前往 ${BCS_LOGIN_URL} 登录`, 6000);
    }
  }

  async function getAuthHeaders() {
    if (bcsAuthCache && Date.now() < bcsAuthCache.expiresAt) return bcsAuthCache.headers;
    bcsAuthCache = null;
    bcsAuthPending ??= chrome.runtime.sendMessage({ type: 'EXT_GET_BCS_AUTH' }).then(auth => {
      if (auth?.error) throw new Error('读取 BCS 登录状态失败：' + auth.error);
      const token = auth?.token?.trim().replace(/^Bearer(?:\s+|$)/i, '').trim();
      if (!token) throw new Error(`未检测到 BCS 登录状态，请先打开 ${BCS_LOGIN_URL} 登录后重试`);
      const headers = {
        'Content-Type': 'application/json;charset=utf-8',
        'Accept': '*/*',
        'Authorization': 'Bearer ' + token,
      };
      if (auth.limitKey?.trim()) headers['X-Limit-Key'] = auth.limitKey.trim();
      bcsAuthCache = { headers, expiresAt: Date.now() + 5 * 60 * 1000 };
      return headers;
    }).finally(() => { bcsAuthPending = null; });
    return bcsAuthPending;
  }

  // 通用请求：401（含 HTTP 200 + code:401）刷新认证一次，429 最多重试两次。
  // 写请求遇到超时/断网/5xx/无效响应，结果未知，绝不自动重发。
  async function bcsApiCall(path, options = {}) {
    const url = path.startsWith('http') ? path : BCS_API_BASE + path;
    const method = (options.method || 'GET').toUpperCase();
    const writing = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const body = options.data == null ? undefined : JSON.stringify(options.data);
    const failure = (message, uncertain) => Object.assign(new Error(message + (uncertain ? '；提交结果未确认，重试前请先检查目标店铺，避免重复上架' : '')), { uncertain: !!uncertain });
    let authRetries = 0, rateRetries = 0;
    for (;;) {
      const headers = await getAuthHeaders();
      const resp = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method, url, headers: { ...headers, ...(options.headers || {}) }, data: body,
          timeout: options.timeout || 60000,
          onload: resolve,
          onerror: () => reject(failure('BCS API网络请求失败', writing)),
          ontimeout: () => reject(failure('BCS API请求超时', writing)),
        });
      });
      let data = null;
      try { data = JSON.parse(resp.responseText); } catch (e) { /* 下方按状态码处理 */ }
      const httpOk = resp.status >= 200 && resp.status < 300;
      const authFailed = resp.status === 401 || Number(data?.code) === 401;
      if (authFailed) {
        // 并发请求可能已刷新凭证，只丢弃本次请求实际使用的版本。
        if (bcsAuthCache?.headers === headers) bcsAuthCache = null;
        if (authRetries++ < 1) continue;
        throw failure(`BCS 登录已过期，请前往 ${BCS_LOGIN_URL} 重新登录`, false);
      }
      if (resp.status === 429 || (httpOk && Number(data?.code) === 429)) {
        if (rateRetries++ < 2) { await new Promise(r => setTimeout(r, 3000)); continue; }
        throw failure('BCS API限流(429)：请稍后重试', false);
      }
      if (!httpOk) {
        // 不输出原始响应或凭证；网络层/服务器故障下写请求可能已被接收。
        throw failure(`BCS API HTTP ${resp.status}`, writing && (!resp.status || resp.status >= 500));
      }
      if (data == null || typeof data !== 'object') throw failure('BCS API响应解析失败', writing);
      if (writing && (data.code == null || data.code === '' || !Number.isFinite(Number(data.code)))) {
        throw failure('BCS API响应缺少业务状态码', true);
      }
      return data;
    }
  }

  // 店铺列表（云端API）
  async function fetchShopsFromCloud() {
    const resp = await bcsApiCall('/system/wbShop/user/list?pageNum=1&pageSize=9999');
    // 响应结构: { total, rows: [...], code, msg }
    if (resp.code !== 200) throw new Error('获取店铺列表失败: ' + (resp.msg || ''));
    // ★ v0.1 跨店同步：额外暴露 apiKey(WB 官方 token) / sid / expirationTime / masters，
    //   供 WB 官方 Open API 分店调用；上架脚本原有逻辑不使用这些字段（安全，无副作用）。
    return (resp.rows || []).map(s => ({
      id: s.id,
      shopName: s.shopName || String(s.id),
      warehouses: [],
      apiKey: s.apiKey || '',
      sid: s.sid || '',
      expirationTime: s.expirationTime || '',
      masters: s.masters || '',
    }));
  }

  // 仓库列表（云端API）
  async function fetchWarehousesFromCloud(shopId) {
    const resp = await bcsApiCall('/system/wbWarehouses/list?shopId=' + shopId);
    // 响应结构: 直接是数组 [{id, name, officeId, cargoType, deliveryType}]
    if (Array.isArray(resp)) return resp;
    // 兼容包装格式
    if (resp.code === 200 && Array.isArray(resp.data)) return resp.data;
    if (resp.code === 200 && Array.isArray(resp.rows)) return resp.rows;
    throw new Error('获取仓库列表失败: ' + (resp.msg || ''));
  }

