  // ============================================================
  // 1. postMessage 桥接：调用 ISOLATED world 的插件 API
  // ============================================================
  const pendingCalls = new Map();
  let callSeq = 0;

  // 注意：不能用 e.source !== window 判断，因为 Tampermonkey 沙箱下 window 是 proxy，
  // 而 e.source 是真实 window，两者不相等会导致所有响应被过滤
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'BCS_RESULT') return;
    const { id, result, error } = e.data;
    const resolver = pendingCalls.get(id);
    if (!resolver) return;
    pendingCalls.delete(id);
    if (error) resolver.reject(new Error(error));
    else resolver.resolve(result);
  });

  function callApi(method, args = [], timeout = 30000) {
    return new Promise((resolve, reject) => {
      const id = 'c' + (++callSeq);
      const timer = setTimeout(() => {
        if (pendingCalls.has(id)) {
          pendingCalls.delete(id);
          reject(new Error('调用超时: ' + method));
        }
      }, timeout);
      pendingCalls.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      window.postMessage({ type: 'BCS_CALL', id, method, args }, '*');
    });
  }

  // 等待桥接就绪：验证 getToken 是否可用（云端API模式依赖token）
  async function waitForBridge(timeout = 60000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const ping = () => {
        if (Date.now() - start > timeout) {
          reject(new Error('等待 BCS 插件桥接超时（请确认插件已启用且在 wildberries.ru 页面）'));
          return;
        }
        // 验证 getToken 是否可用
        callApi('getToken', [], 3000)
          .then(() => resolve())
          .catch(() => setTimeout(ping, 500));
      };
      ping();
    });
  }

