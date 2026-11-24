  // ============================================================
  // 2.7 图片差异检测（dHash + 亮度 MAD 双判据）
  //     背景：WB media/save 只能整组替换，且每次都会重新编码图片，
  //           所以"要不要推"必须靠内容比对决定，不能靠张数。
  //     为什么不用 md5：重编码后字节必变；dHash 只保留 9×8 亮度结构，对压缩/缩放不敏感。
  //     为什么还要 MAD：纯色/极简图 dHash 会退化（纯白 vs 纯黑距离都是 0），
  //                     用 9×8 灰度平均绝对差兜住（同色 0、浅灰 20、黑白 255）。
  //     实测（2026-10-29，真实商品图）：
  //       同图变体（webp q40 / jpeg q70 / 缩放 0.4x / 裁剪 2% / 调亮 5%）
  //         → dHash 距离 ≤3，MAD ≤8.6
  //       不同图 → dHash 距离 ≥8（多为 12~30），MAD 39
  //       → 阈值：dHash ≤4 且 MAD ≤12 视为同一张
  //     取图走 GM_xmlhttpRequest（跨域），blob 为同源 → canvas 不受 CORS 污染。
  // ============================================================
  const IMG_SIG_CACHE = new Map();      // url → {bits, gray} | null
  const PHOTO_SAME_THRESHOLD = 4;       // dHash 汉明距离上限
  const PHOTO_MAD_THRESHOLD = 12;       // 9×8 灰度平均绝对差上限
  const IMG_HASH_CONCURRENCY = 4;

  function gmBinary(url, timeout = 30000) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'arraybuffer',
        timeout,
        onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(r.response) : reject(new Error('HTTP ' + r.status))),
        onerror: () => reject(new Error('网络错误')),
        ontimeout: () => reject(new Error('超时')),
      });
    });
  }

  async function toBitmap(buf) {
    const blob = new Blob([buf], { type: 'image/webp' });
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(blob); } catch (e) { /* 走 Image 兜底 */ }
    }
    return await new Promise((res, rej) => {
      const img = new Image();
      const u = URL.createObjectURL(blob);
      img.onload = () => { URL.revokeObjectURL(u); res(img); };
      img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('解码失败')); };
      img.src = u;
    });
  }

  async function imgSig(url) {
    if (IMG_SIG_CACHE.has(url)) return IMG_SIG_CACHE.get(url);
    let sig = null;
    try {
      const buf = await gmBinary(url);
      const bmp = await toBitmap(buf);
      const W = 9, H = 8;
      let ctx, cv;
      if (typeof OffscreenCanvas !== 'undefined') {
        cv = new OffscreenCanvas(W, H);
        ctx = cv.getContext('2d');
      } else {
        cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        ctx = cv.getContext('2d');
      }
      ctx.drawImage(bmp, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;
      const gray = [];
      for (let i = 0; i < W * H; i++) {
        gray.push(data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114);
      }
      let bits = '';
      for (let r = 0; r < H; r++) {
        for (let c = 0; c < W - 1; c++) bits += (gray[r * W + c] > gray[r * W + c + 1] ? '1' : '0');
      }
      sig = { bits, gray };
    } catch (e) {
      sig = null;
    }
    IMG_SIG_CACHE.set(url, sig);
    return sig;
  }

  function hashDistance(a, b) {
    if (!a || !b || a.length !== b.length) return 999;
    let d = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
    return d;
  }

  // 9×8 灰度平均绝对差（纯色图兜底判据）
  function grayMad(a, b) {
    if (!a || !b || a.length !== b.length) return 999;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / a.length;
  }

  // 同一张图？dHash 与 MAD 双条件都通过才算
  function sigSame(s1, s2) {
    if (!s1 || !s2) return false;
    return hashDistance(s1.bits, s2.bits) <= PHOTO_SAME_THRESHOLD
      && grayMad(s1.gray, s2.gray) <= PHOTO_MAD_THRESHOLD;
  }

  // 有限并发
  async function mapLimit(arr, limit, fn) {
    const out = new Array(arr.length);
    let idx = 0;
    async function worker() {
      while (idx < arr.length) {
        const i = idx++;
        out[i] = await fn(arr[i], i);
      }
    }
    await Promise.all(new Array(Math.min(limit, arr.length)).fill(0).map(worker));
    return out;
  }

  /**
   * 逐张比对两组图片
   * @returns {{srcCount,tgtCount,changed:number[],countDiff:boolean,unknown:boolean,same:boolean}}
   *          changed 为 1 起的序号；unknown=有图取不到/解不了
   */
  async function comparePhotos(srcUrls, tgtUrls) {
    const n = Math.min(srcUrls.length, tgtUrls.length);
    const srcS = await mapLimit(srcUrls.slice(0, n), IMG_HASH_CONCURRENCY, imgSig);
    const tgtS = await mapLimit(tgtUrls.slice(0, n), IMG_HASH_CONCURRENCY, imgSig);
    const changed = [];
    let unknown = false;
    for (let i = 0; i < n; i++) {
      if (!srcS[i] || !tgtS[i]) { unknown = true; continue; }
      if (!sigSame(srcS[i], tgtS[i])) changed.push(i + 1);
    }
    const countDiff = srcUrls.length !== tgtUrls.length;
    return {
      srcCount: srcUrls.length,
      tgtCount: tgtUrls.length,
      changed,
      countDiff,
      unknown,
      same: !countDiff && changed.length === 0,
    };
  }
