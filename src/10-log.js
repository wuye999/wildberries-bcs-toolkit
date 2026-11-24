
  // ============================================================
  // 0. 日志工具：正常流程简洁输出，错误时输出详细信息
  // ============================================================
  const DEBUG = false;  // 调试模式：true 时打印所有详细信息
  const log = {
    info: (...args) => console.log('[BCS]', ...args),
    warn: (...args) => console.warn('[BCS]', ...args),
    error: (...args) => console.error('[BCS]', ...args),
    debug: (...args) => { if (DEBUG) console.log('[BCS][debug]', ...args); },
    // 错误详情：仅在出错时打印完整响应（用于 403/500 等调试）
    errorDetail: (label, err, resp) => {
      console.error('[BCS]', label, err?.message || err);
      if (resp) {
        console.error('[BCS] 响应状态:', resp.status);
        console.error('[BCS] 响应头:', resp.responseHeaders);
        console.error('[BCS] 响应内容:', resp.responseText?.substring(0, 500));
      }
    },
  };

