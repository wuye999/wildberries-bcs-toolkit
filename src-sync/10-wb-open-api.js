  // ============================================================
  // 1. WB 官方 Open API 调用层（按店铺 apiKey 调用，跨店天然支持）
  //    仅用到 Content 类别：common-api(探活) + content-api(读写)
  //    鉴权：请求头 Authorization: <apiKey>（WB 官方 token，非 Bearer）
  // ============================================================
  const WB_API = {
    common: 'https://common-api.wildberries.ru',
    content: 'https://content-api.wildberries.ru',
  };

  const WB_MIN_INTERVAL = 700;        // 同一 token 的最小请求间隔（ms），content 限流 100 req/min
  const _wbLastCall = new Map();      // apiKey 尾号 → 上次请求时间

  function wbSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // 把 WB 的错误响应翻译成人话（401 撤销 / 403 缺类别 / 429 限流 是最常见的三类）
  function wbExplain(status, text) {
    const t = String(text || '');
    if (status === 401) {
      if (/withdrawn/i.test(t)) return 'token 已被撤销（WB 后台重新生成过密钥，需更新 BCS 里的 apiKey）';
      return 'token 无效或过期（401）';
    }
    if (status === 403) return '缺少「内容(Content)」类别权限（403）';
    if (status === 429) return '请求过于频繁被限流（429）';
    if (status === -1) return '网络错误：' + t;
    return `HTTP ${status}：` + t.slice(0, 160);
  }

  /**
   * 调用 WB 官方 API（GM_xmlhttpRequest 绕过 CORS）
   * @param {string} apiKey 店铺 WB 官方 token
   * @param {string} method GET/POST
   * @param {string} url    完整 URL
   * @param {object} body   POST 体（可空）
   * @returns {Promise<{ok:boolean,status:number,data:any,text:string,err?:string}>}
   */
  function wbOpenFetch(apiKey, method, url, body, timeout = 30000) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers: {
          'Authorization': apiKey,          // ★ 官方 token 直接放 Authorization，不加 Bearer
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        data: body ? JSON.stringify(body) : undefined,
        timeout,
        onload: (resp) => {
          const text = resp.responseText || '';
          let data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { /* 非 JSON 保留原文 */ }
          const ok = resp.status >= 200 && resp.status < 300;
          resolve({
            ok, status: resp.status, data, text,
            err: ok ? '' : wbExplain(resp.status, text),
          });
        },
        onerror: (e) => resolve({ ok: false, status: -1, data: null, text: '', err: wbExplain(-1, (e && e.error) || '网络错误') }),
        ontimeout: () => resolve({ ok: false, status: -1, data: null, text: '', err: wbExplain(-1, '请求超时') }),
      });
    });
  }

  // 同 token 串行限速：避免多店并发时被 429
  async function wbThrottle(apiKey) {
    const k = String(apiKey || '').slice(-8);
    const last = _wbLastCall.get(k) || 0;
    const wait = WB_MIN_INTERVAL - (Date.now() - last);
    if (wait > 0) await wbSleep(wait);
    _wbLastCall.set(k, Date.now());
  }

  // ---- 探活：GET /ping ----
  async function wbPing(apiKey) {
    await wbThrottle(apiKey);
    return wbOpenFetch(apiKey, 'GET', WB_API.common + '/ping');
  }

  /**
   * 卡列表：POST /content/v2/get/cards/list
   * @param {object} opts { limit(≤100), textSearch(vendorCode/标题), withPhoto, cursor }
   */
  async function wbCardsList(apiKey, opts = {}) {
    const settings = {
      cursor: Object.assign({ limit: Math.min(Number(opts.limit) || 1, 100) }, opts.cursor || {}),
      filter: { withPhoto: opts.withPhoto == null ? 0 : opts.withPhoto },
    };
    if (opts.textSearch) settings.filter.textSearch = String(opts.textSearch);
    await wbThrottle(apiKey);
    const res = await wbOpenFetch(apiKey, 'POST', WB_API.content + '/content/v2/get/cards/list', { settings });
    if (res.ok && res.data) {
      return { ok: true, cards: res.data.cards || [], cursor: res.data.cursor || null, status: res.status };
    }
    return { ok: false, cards: [], cursor: null, status: res.status, err: res.err };
  }
