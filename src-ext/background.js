'use strict';

const BCS_LOGIN_URL = 'https://wb.bcserp.com/productList';
const allowedHosts = chrome.runtime.getManifest().host_permissions
  .map(pattern => pattern.slice('https://'.length, -2));

async function getBcsAuth() {
  const cookies = await chrome.cookies.getAll({ domain: 'bcserp.com' });
  function value(name) {
    const matches = cookies.filter(cookie => cookie.name === name && cookie.value.trim());
    return (matches.find(cookie => cookie.domain === 'wb.bcserp.com' || cookie.domain === '.wb.bcserp.com')
      || matches.find(cookie => cookie.domain === '.bcserp.com')
      || matches[0])?.value || '';
  }
  return { token: value('Admin-Token'), limitKey: value('Limit-Key') };
}

async function fetchForContent({ url, method, headers, body, credentials, timeout, responseType }) {
  const target = new URL(url);
  const allowed = target.protocol === 'https:' && !target.port && allowedHosts.some(host => {
    if (!host.startsWith('*.')) return target.hostname === host;
    return target.hostname === host.slice(2) || target.hostname.endsWith(host.slice(1));
  });
  if (!allowed) throw new Error('请求地址不在扩展授权范围内');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout > 0 ? timeout : 30000);
  try {
    const response = await fetch(target.href, {
      method, headers, body,
      credentials: credentials === 'include' ? 'include' : 'omit',
      signal: controller.signal,
    });
    let responseText;
    if (responseType === 'arraybuffer') {
      // Chrome 扩展消息使用 JSON 序列化，图片字节以 Base64 传递。
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      }
      responseText = btoa(binary);
    } else {
      responseText = await response.text();
    }
    return { ok: response.ok, status: response.status, responseText };
  } catch (error) {
    if (controller.signal.aborted) return { timedOut: true };
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  let task;
  switch (message?.type) {
    case 'EXT_GET_BCS_AUTH':
      task = getBcsAuth();
      break;
    case 'EXT_OPEN_BCS_LOGIN':
      task = chrome.tabs.create({ url: BCS_LOGIN_URL }).then(() => ({ ok: true }));
      break;
    case 'EXT_FETCH':
      task = fetchForContent(message);
      break;
    default:
      return false;
  }
  task.then(sendResponse, error => sendResponse({ error: error.message }));
  return true;
});
