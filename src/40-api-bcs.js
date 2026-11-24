  // ============================================================
  // 3. BCS 云端API直连（通过 GM_xmlhttpRequest 绕过 CORS）
  // ============================================================
  const BCS_API_BASE = 'https://wb.bcserp.com/prod-api';

  // 获取认证 header（从插件桥接获取 token 和 limitKey）
  let _tokenCache = null;
  let _limitKeyCache = null;
  let _tokenExpireAt = 0;

  // ★ v1.8.0 BCS 凭证跨域缓存（GM 存储）：
  //   BCS 插件 content_scripts 只匹配 www.wildberries.ru，seller.wildberries.ru 上无 postMessage 桥接。
  //   www 页桥接取到凭证后写入 GM（Tampermonkey 跨域共享）；seller 页桥接不可用时读缓存兜底。
  const CRED_CACHE_KEY = 'bcs_bcs_cred_cache';
  function clearCredCache() {
    _tokenCache = null;
    _limitKeyCache = null;
    _tokenExpireAt = 0;
    gmSave(CRED_CACHE_KEY, '');
  }

  let _authInflight = null;
  function normalizeAuthToken(value) {
    return typeof value === 'string' ? value.trim().replace(/^Bearer\s+/i, '').trim() : '';
  }

  async function getAuthHeaders() {
    if (!_tokenCache || Date.now() >= _tokenExpireAt) {
      if (!_authInflight) {
        _authInflight = (async () => {
          let got = false;
          if (!IS_SELLER_HOST) {
            try {
              const [t, lk] = await Promise.all([callApi('getToken'), callApi('getLimitKey')]);
              const token = normalizeAuthToken(t);
              // 明确返回空代表已退出登录；不可复用旧账号的 GM 凭证。
              if (!token) {
                clearCredCache();
                throw Object.assign(new Error('BCS 插件未登录，请先登录后重试'), { authAbsent: true });
              }
              _tokenCache = token;
              _limitKeyCache = typeof lk === 'string' ? lk.trim() : '';
              _tokenExpireAt = Date.now() + 5 * 60 * 1000;
              got = true;
              gmSave(CRED_CACHE_KEY, { token, limitKey: _limitKeyCache, ts: Date.now() });
            } catch (error) {
              if (error.authAbsent) throw error;
              // 桥接未加载时仍可使用跨域缓存；明确未登录的情况已在上面阻止。
            }
          }
          if (!got) {
            const cached = gmLoad(CRED_CACHE_KEY, null);
            const token = normalizeAuthToken(cached?.token);
            if (!token) throw new Error('获取BCS认证失败：请先打开任一 www.wildberries.ru 页面，确认插件已登录并完成认证。');
            _tokenCache = token;
            _limitKeyCache = typeof cached.limitKey === 'string' ? cached.limitKey.trim() : '';
            _tokenExpireAt = Date.now() + 60 * 1000;
          }
        })();
      }
      const task = _authInflight;
      try { await task; }
      finally { if (_authInflight === task) _authInflight = null; }
    }
    const headers = { 'Content-Type': 'application/json;charset=utf-8', 'Accept': '*/*' };
    if (_tokenCache) headers.Authorization = 'Bearer ' + _tokenCache;
    if (_limitKeyCache) headers['X-Limit-Key'] = _limitKeyCache;
    return headers;
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
          onabort: () => reject(failure('BCS API请求已中止', writing)),
        });
      });
      let data = null;
      try { data = JSON.parse(resp.responseText); } catch (e) { /* 下方按状态码处理 */ }
      const httpOk = resp.status >= 200 && resp.status < 300;
      const authFailed = resp.status === 401 || (httpOk && Number(data?.code) === 401);
      if (authFailed) {
        clearCredCache();
        if (authRetries++ < 1) continue;
        throw failure('BCS认证失败(401)：请重新登录插件，并在 www 页面刷新认证缓存', false);
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

