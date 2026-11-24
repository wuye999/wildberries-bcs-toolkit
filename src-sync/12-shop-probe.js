  // ============================================================
  // 2. P0 店铺能力探针（纯只读）
  //    验证每店 apiKey：是否明文返回 / 是否过期 / 是否有 Content 权限
  //    判定以「真实接口返回」为准，acc 位掩码仅作参考展示
  // ============================================================
  const PROBE_CACHE_KEY = 'bcs_sync_probe_v1';
  const PROBE_CACHE_TTL = 10 * 60 * 1000;

  // WB token 类别位掩码（官方 13 类；此处只列常用低位，仅用于面板展示，不作为判定依据）
  const WB_ACC_BITS = [
    [1, '内容'],
    [2, '价格与折扣'],
    [4, '统计'],
    [8, '分析'],
    [16, '推广'],
    [32, '问题与评价'],
    [64, 'FBW 供货'],
    [128, 'FBS 订单'],
    [256, '退货'],
    [512, '文档'],
    [1024, '财务'],
  ];

  function decodeJwtPayload(token) {
    try {
      const seg = String(token).split('.')[1];
      if (!seg) return null;
      const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const bin = atob(pad);
      let json = '';
      for (let i = 0; i < bin.length; i++) json += '%' + ('00' + bin.charCodeAt(i).toString(16)).slice(-2);
      return JSON.parse(decodeURIComponent(json));
    } catch (e) { return null; }
  }

  function accToText(acc) {
    const n = Number(acc) || 0;
    const hit = WB_ACC_BITS.filter(([bit]) => (n & bit) === bit).map(([, name]) => name);
    return hit.length ? hit.join('+') : String(n);
  }

  function daysLeft(expSec) {
    if (!expSec) return null;
    return Math.floor((Number(expSec) * 1000 - Date.now()) / 86400000);
  }

  // 单店探针：ping + 卡列表 limit=1
  async function probeOneShop(shop) {
    const row = {
      shopId: shop.id,
      shopName: shop.shopName,
      hasKey: !!shop.apiKey,
      keyTail: shop.apiKey ? String(shop.apiKey).slice(-8) : '',
      exp: null,
      daysLeft: null,
      acc: null,
      accText: '',
      oid: null,
      ping: null,        // true/false/null
      pingErr: '',
      content: null,     // true/false/null
      contentErr: '',
      cardTotal: null,
      bcsExp: shop.expirationTime || '',
    };

    if (!shop.apiKey) {
      row.contentErr = 'BCS 未返回 apiKey，请在 BCS 网站更新该店的 WB API 密钥';
      return row;
    }

    const payload = decodeJwtPayload(shop.apiKey);
    if (payload) {
      row.exp = payload.exp || null;
      row.daysLeft = daysLeft(payload.exp);
      row.acc = payload.acc != null ? payload.acc : null;
      row.accText = payload.acc != null ? accToText(payload.acc) : '';
      row.oid = payload.oid != null ? payload.oid : null;
    }

    const ping = await wbPing(shop.apiKey);
    row.ping = ping.ok;
    row.pingErr = ping.err || '';

    if (!ping.ok) {
      // token 本身不可用，无需再打 content
      row.content = false;
      row.contentErr = ping.err || 'token 不可用';
      return row;
    }

    const list = await wbCardsList(shop.apiKey, { limit: 1 });
    row.content = list.ok;
    row.contentErr = list.err || '';
    row.cardTotal = list.ok && list.cursor && list.cursor.total != null ? list.cursor.total : null;
    return row;
  }

  // 全部店铺探针（串行，内含限速）
  async function probeAllShops(onProgress) {
    const shops = await fetchShopsFromCloud();
    shopsCacheForProbe = shops;
    const rows = [];
    for (let i = 0; i < shops.length; i++) {
      const s = shops[i];
      onProgress && onProgress(`正在检测 ${s.shopName}（${i + 1}/${shops.length}）…`);
      try {
        rows.push(await probeOneShop(s));
      } catch (e) {
        rows.push({
          shopId: s.id, shopName: s.shopName, hasKey: !!s.apiKey, keyTail: s.apiKey ? String(s.apiKey).slice(-8) : '',
          ping: false, pingErr: e.message, content: false, contentErr: e.message,
        });
      }
    }
    const result = { timestamp: Date.now(), rows };
    gmSave(PROBE_CACHE_KEY, result);
    return result;
  }

  let shopsCacheForProbe = null;

  function loadProbeCache() {
    const c = gmLoad(PROBE_CACHE_KEY, null);
    if (!c || !c.rows) return null;
    if (Date.now() - c.timestamp > PROBE_CACHE_TTL) return null;
    return c;
  }
