  const extStorage = new Map();
  const extStorageListeners = new Map();
  let extStorageLoad;
  let extStorageChangedDuringLoad = new Set();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      extStorageChangedDuringLoad?.add(key);
      if (newValue === undefined) extStorage.delete(key);
      else extStorage.set(key, newValue);
      extStorageListeners.get(key)?.();
    }
  });

  async function extStorageReady() {
    extStorageLoad ??= chrome.storage.local.get(null).then(values => {
      for (const [key, value] of Object.entries(values)) {
        if (!extStorageChangedDuringLoad.has(key)) extStorage.set(key, value);
      }
      extStorageChangedDuringLoad = null;
    });
    await extStorageLoad;
  }

  function GM_getValue(key, fallback) {
    return extStorage.has(key) ? extStorage.get(key) : fallback;
  }

  function extOnStorageChange(key, listener) {
    extStorageListeners.set(key, listener);
  }

  function GM_setValue(key, value, { optimistic = true } = {}) {
    const previousValue = extStorage.get(key);
    if (optimistic) extStorage.set(key, value);
    const write = chrome.storage.local.set({ [key]: value }).then(() => {
      if (!optimistic && extStorage.get(key) === previousValue) extStorage.set(key, value);
    });
    write.catch(error => {
      log.error('扩展存储写入失败:', key, error.message);
    });
    return write;
  }

  function GM_xmlhttpRequest(options) {
    const { url, method, headers, data, timeout, responseType } = options;
    chrome.runtime.sendMessage({
      type: 'EXT_FETCH', url, method, headers, body: data, timeout, responseType,
      credentials: options.anonymous === false ? 'include' : 'omit',
    }).then(response => {
      if (response?.timedOut) return options.ontimeout?.();
      if (!response || response.error) return options.onerror?.(response);
      if (responseType === 'arraybuffer') {
        response.response = Uint8Array.from(atob(response.responseText), char => char.charCodeAt(0)).buffer;
      }
      options.onload?.(response);
    }, error => options.onerror?.({ error: error.message }));
  }
