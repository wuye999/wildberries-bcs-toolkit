  // ============================================================
  // 4. WB官方接口数据获取（云端API模式核心）
  // ============================================================

  // 用商品编号计算 card.json 和图片的 CDN 路径。
  function calcBasketPath(nmId) {
    const id = parseInt(String(nmId), 10);
    const vol = Math.floor(id / 100000);
    const part = Math.floor(id / 1000);
    // basket号查找表（插件 1.3.4 权威表，65 个区间）
    const basketTable = [[143,"01"],[287,"02"],[431,"03"],[719,"04"],[1007,"05"],[1061,"06"],[1115,"07"],[1169,"08"],[1313,"09"],[1601,"10"],[1655,"11"],[1919,"12"],[2045,"13"],[2189,"14"],[2405,"15"],[2621,"16"],[2837,"17"],[3053,"18"],[3269,"19"],[3485,"20"],[3701,"21"],[3917,"22"],[4133,"23"],[4349,"24"],[4565,"25"],[4877,"26"],[5189,"27"],[5501,"28"],[5813,"29"],[6125,"30"],[6437,"31"],[6749,"32"],[7061,"33"],[7373,"34"],[7685,"35"],[7997,"36"],[8309,"37"],[8741,"38"],[9173,"39"],[9605,"40"],[10373,"41"],[11141,"42"],[11909,"43"],[12677,"44"],[13445,"45"],[14213,"46"],[14981,"47"],[15749,"48"],[16517,"49"],[17285,"50"],[18053,"51"],[18821,"52"],[19589,"53"],[20357,"54"],[21125,"55"],[21893,"56"],[22661,"57"],[23429,"58"],[24197,"59"],[24965,"60"],[25733,"61"],[26501,"62"],[27269,"63"],[28037,"64"],[28805,"65"]];
    // ★ 越界回退表尾分片（对齐插件 resolveNmBasketBucket：官方越界行为 = 最后一个分片）
    let basketNo = basketTable[basketTable.length - 1][1];
    for (const [threshold, no] of basketTable) {
      if (vol <= threshold) { basketNo = no; break; }
    }
    return `https://basket-${basketNo}.wbbasket.ru/vol${vol}/part${part}/${id}`;
  }

  function buildWbProductUrl(nmId) {
    return `https://www.wildberries.ru/catalog/${nmId}/detail.aspx`;
  }

  function getCardJsonUrl(nmId) {
    return `${calcBasketPath(nmId)}/info/ru/card.json`;
  }

  function getMainImageUrl(nmId, idx = 1) {
    return `${calcBasketPath(nmId)}/images/big/${idx}.webp`;
  }

  // 官方插件的 12 个静态 WB 视频分片。直上和跨店补上架共用。
  function getWbProductVideoUrl(nmId, cardInfo) {
    const media = cardInfo?.media;
    if (media?.has_video !== true && media?.hasVideo !== true) return '';
    const id = Number(nmId);
    if (!Number.isSafeInteger(id) || id <= 0) return '';
    const vol = id % 144;
    const bucket = String(Math.floor(vol / 12) + 1).padStart(2, '0');
    const part = Math.floor(id / 10000);
    return `https://videonme-basket-${bucket}.wbbasket.ru/vol${vol}/part${part}/${id}/mp4/360p/1.mp4`;
  }

  // ============================================================
  // ★ v1.10.0 对齐插件 1.5.1：抓取与提交前清洗 card.json 描述
  //   插件源码注释原话：「markdown_description 随整张卡进入直上请求，末尾标点墙不删会被 WAF 拦成 405」。
  //   清洗范围：HTML/./&、WB 法务声明、末尾标点墙、多余空行，最后截断到 2000 字符。
  //   只改 description / markdown_description，其余字段（colors/media/grouped_options…）原样保留。
  // ============================================================
  const WB_SUBMIT_DESCRIPTION_MAX_LENGTH = 2000;

  /** 每次调用新建 RegExp，避免带 g 标志的 lastIndex 串到下一次 */
  const WB_DESCRIPTION_BOILERPLATE = [
    String.raw`Wildberries не является продавцом товара\.\s*Информацию о продавце можно узнать на странице магазина`,
    String.raw`Товар реализуется иностранным продавцом`,
    String.raw`Вся информация предоставлена продавцом`,
  ];

  function stripWbDescriptionMarkup(raw) {
    let text = String(raw == null ? '' : raw);
    if (/[<>]/.test(text)) {
      try {
        const doc = new DOMParser().parseFromString(text, 'text/html');
        text = String(doc.body?.textContent || '').replace(/\s+\n/g, '\n');
      } catch (e) {
        text = text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ');
      }
    }
    return text.trim().replace(/\.\//g, '').replace(/&/g, '');
  }

  function formatWbDescription(text) {
    return text
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, WB_SUBMIT_DESCRIPTION_MAX_LENGTH);
  }

  function sanitizeWbProductDescription(raw) {
    return formatWbDescription(stripWbDescriptionMarkup(raw));
  }

  // WB 卡片额外移除法务声明和末尾标点墙。
  function cleanWbCardDescription(raw) {
    let text = stripWbDescriptionMarkup(raw);
    if (!text.trim()) return '';
    for (const source of WB_DESCRIPTION_BOILERPLATE) {
      text = text.replace(new RegExp(source, 'gi'), '');
    }
    // 末尾「Обратите внимание! (Важно!)」紧跟 40+ 标点 → 连同标点一起去掉；其余纯标点尾同样切掉
    text = text.replace(/\n*Обратите внимание!?\s*\(Важно!\)(?:[\s\p{P}\p{S}]){40,}$/iu, '');
    text = text.replace(/(?:[\s\p{P}\p{S}]){40,}$/u, '');
    text = text.replace(/\n*Обратите внимание!?\s*\(Важно!\)\s*$/i, '');
    return formatWbDescription(text);
  }

  // 返回清洗后的 card 副本；两段描述都无变化时返回原对象（避免改动已存引用）
  function withCleanWbCardDescription(card) {
    if (!card || typeof card !== 'object') return card;
    const next = Object.assign({}, card);
    let changed = false;
    if (card.description != null && card.description !== '') {
      const description = cleanWbCardDescription(card.description);
      if (description !== card.description) {
        next.description = description;
        changed = true;
      }
    }
    const rawMarkdown = card.markdown_description;
    if (typeof rawMarkdown === 'string' && rawMarkdown !== '') {
      const markdownDescription = cleanWbCardDescription(rawMarkdown);
      if (markdownDescription !== rawMarkdown) {
        next.markdown_description = markdownDescription;
        changed = true;
      }
    }
    return changed ? next : card;
  }


  // GM_xmlhttpRequest 的 Promise 封装（用于 WB 官方接口，携带 cookie）
  function gmFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: options.method || 'GET',
        url: url,
        headers: options.headers || {},
        anonymous: false,
        timeout: options.timeout || 30000,
        onload: (resp) => {
          if (resp.status >= 200 && resp.status < 300) {
            try {
              resolve(JSON.parse(resp.responseText));
            } catch (e) {
              log.errorDetail('GM JSON解析失败', e, resp);
              reject(new Error(`JSON解析失败: ${e.message}`));
            }
          } else {
            // 错误时打印完整响应详情（用于调试 403 等问题）
            log.errorDetail(`GM HTTP ${resp.status}`, null, resp);
            reject(new Error(`HTTP ${resp.status}`));
          }
        },
        onerror: (err) => {
          log.error('GM 网络错误:', url, err?.error || '');
          reject(new Error('网络请求失败'));
        },
        ontimeout: () => {
          log.error('GM 超时:', url);
          reject(new Error('请求超时'));
        },
      });
    });
  }

  // 获取 WB 的 deviceid（反爬必需字段，直连主通道使用）
  // ★ 参照插件 1.2.0 getWbCardDetailHeaders：真实值来自页面存储 wbx__sessionID（site_<32hex>），
  //   WB 会轮换，每次请求实时读取、不缓存死值；读不到才 fallback 随机值（不缓存）。
  function getWbDeviceId() {
    try {
      const v = localStorage.getItem('wbx__sessionID');
      if (v) return v;
      // 兼容性兜底：老键 / cookie（大小写均尝试）
      const keys = ['wb_deviceId', 'deviceId', 'wb_device_id', 'device_id'];
      for (const k of keys) {
        const v2 = localStorage.getItem(k);
        if (v2) return v2;
      }
      const m = document.cookie.match(/device[iI]d=([^;]+)/);
      if (m) return m[1];
    } catch (e) {}
    // fallback：生成一个随机 deviceid（格式与 WB 一致），不缓存
    const rand = Array.from({length: 32}, () =>
      '0123456789abcdef'[Math.floor(Math.random() * 16)]
    ).join('');
    return 'site_' + rand;
  }

  // 获取 WB 当前 x-spa-version（直连主通道使用；从页面内联 script 动态提取，参照插件 J1()/N3()）
  // ★ 不写死版本号——WB 迭代快，写死会形成过期指纹被反爬识别
  function getWbSpaVersion() {
    try {
      const scripts = document.getElementsByTagName('script');
      for (let i = 0; i < scripts.length; i++) {
        const text = scripts[i].textContent || '';
        if (text.indexOf('__HOST_VERSION__') === -1) continue;
        const m = text.match(/__HOST(?:_REMOTE)?_VERSION__\s*=\s*["']([^"']+)["']/);
        if (m && m[1]) return m[1];
      }
    } catch (e) {}
    return '';
  }

  // 构造 WB detail 单商品 URL（与插件 1.2.0 buildWbCardDetailUrl 完全一致，nm 为单值）
  function buildWbDetailUrl(nmId) {
    return `https://www.wildberries.ru/__internal/u-card/cards/v4/detail?appType=1&curr=rub&dest=-1257786&spp=30&hide_vflags=4294967296&hide_dtype=15&mtype=257&lang=ru&ab_testing=false&nm=${nmId}`;
  }

  // 获取单个 WB 商品详情（复刻插件 fetchWbProductDetail / fetchWithWbApiQueue）
  // ★ v1.4.5：WB 今日 antibot 升级后校验 nm 单值，批量逗号分隔 → 400。
  //   因此每次只请求一个 nm；headers 与插件完全一致（仅 x-spa-version + deviceid，无 accept/referer）；
  //   当前站点的 fetch 直连携带 Cookie，失败降级 BCS 代理（单 nm）。
  // ★ v1.7.0：498/429 退避重试 1 次（WB 风控码，插件 1.2.4 handleBlocked 视同 429：冷却+换号重试；
  //   延迟 3~5s 后重读 deviceid，wbx__sessionID 可能已被 WB 轮换）；
  //   非 2xx 打印响应头/body 前 500 字符（log.errorDetail），498 响应常含风控原因/挑战 cookie，留证据。
  async function fetchWbDetailOne(nmId) {
    const wbUrl = buildWbDetailUrl(nmId);
    const { pathname, search } = new URL(wbUrl);
    // ---- 主通道：页面上下文 fetch 直连（498/429 退避重试 1 次）----
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const headers = {
          'x-spa-version': getWbSpaVersion(),
          'deviceid': getWbDeviceId(),   // 每次实时读取，不缓存
          // ★ v1.8.3 对齐插件 1.3.3 getWbCardDetailHeaders：WB 风控收紧后 __internal 接口
          //   必须携带（对齐官网 XHR），缺失直接 403（插件源码注释原话）
          'x-requested-with': 'XMLHttpRequest',
        };
        const res = await window.fetch(pathname + search, { method: 'GET', headers, credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          return (data && data.products && data.products[0]) || null;
        }
        // 诊断：完整响应证据（仅失败时打印）
        let respHeaders = '', respText = '';
        try {
          respHeaders = [...res.headers.entries()].map(([k, v]) => k + ': ' + v).join('\n');
          respText = (await res.text()).substring(0, 500);
        } catch (e) {}
        log.errorDetail(`WB 直连 HTTP ${res.status}（nm=${nmId}，第 ${attempt} 次尝试）`, null,
          { status: res.status, responseHeaders: respHeaders, responseText: respText });
        // 498/429：退避 3~5s 后重试 1 次（避免重试加重风控，与插件"只重试 1 次"策略一致）
        if ((res.status === 498 || res.status === 429) && attempt === 1) {
          await new Promise(r => setTimeout(r, 3000 + Math.floor(Math.random() * 2000)));
          continue;
        }
        log.warn(`WB 直连 HTTP ${res.status}（nm=${nmId}），降级 BCS 云端代理`);
        break;
      } catch (e) {
        log.warn('WB 直连异常（nm=' + nmId + '）:', e && e.message);
        break;
      }
    }
    // ---- 备用通道：BCS 云端代理（单 nm）----
    // ★ v1.7.0 现状：代理为服务端转发、无浏览器指纹，WB 对代理来源的 detail 请求直接回 404
    //   （2026-09-08 实测，响应来自 WB mediabasket 服务器）——保留兜底但报错明确化，避免误判为代理宕机。
    const proxyUrl = `${BCS_API_BASE}/wb/api/proxy/common?url=${encodeURIComponent(wbUrl)}`;
    let resp;
    try {
      resp = await bcsApiCall(proxyUrl);
    } catch (e) {
      if (/HTTP 404/.test(e && e.message)) {
        throw new Error('代理通道被 WB 风控拒绝（HTTP 404，代理请求无浏览器指纹）');
      }
      throw e;
    }
    if (resp.code !== 200) {
      throw new Error((resp.msg || '代理请求异常') + `(code=${resp.code})`);
    }
    return (resp.data && resp.data.products && resp.data.products[0]) || null;
  }

  // 批量获取商品详情：内部逐个单 nm 请求（复刻插件限流节奏，约 3 次/5 秒保守化）
  // 返回 { products }，成功项收集，失败项由调用方按缺失自然标记失败，不中断整批
  async function fetchWbDetailBatch(nmIds) {
    const products = [];
    for (let i = 0; i < nmIds.length; i++) {
      const nmId = nmIds[i];
      try {
        const product = await fetchWbDetailOne(nmId);
        if (product) products.push(product);
      } catch (e) {
        log.warn(`抓取 ${nmId} 详情失败: ${e.message}`);
      }
      // 限流：单请求间隔 800~1500ms 随机抖动（参照插件 WbApiQueue 3 次/5 秒）
      if (i < nmIds.length - 1) {
        await new Promise(r => setTimeout(r, 800 + Math.floor(Math.random() * 700)));
      }
    }
    return { products };
  }

  // 获取WB卡片信息（card.json）
  async function fetchWbCardInfo(nmId) {
    const url = getCardJsonUrl(nmId);
    return await gmFetch(url);
  }

  // ★ v1.7.0 合成伪 detail（card.json 兜底通道）
  // detail 直连+代理均失败时，用 card.json（basket CDN 静态文件，不受 WB 反爬影响）+ 页面数据
  // 拼装伪 detail product，结构与真 detail 的 product 对象对齐（applyDetailToItem 消费的字段）。
  // 提交时 batchShelve 会将 sizes 重写为 {origName, name, price:生效价, vendorCode}，价格不依赖真实 detail。
  // 先例：wb/wb_ops/replicate.py build_synthetic_detail（2026-08-22 实验验证同端点 POST /system/wbCollection/wb/new 建卡成功）。
  // 边界：brand 空（carryBrand 默认不携带）；sizes 单规格占位（多规格商品规格名退化，与"多色截断只提交第一个 SKU"行为一致）。
  function buildSyntheticDetail(item, cardInfo) {
    const data = (cardInfo && cardInfo.data) || {};
    const colors = Array.isArray(cardInfo && cardInfo.colors) && cardInfo.colors.length
      ? cardInfo.colors
      : [Number(item.nmId)];
    const firstNmId = Number(colors[0] || item.nmId);
    return {
      id: firstNmId,
      root: (cardInfo && cardInfo.imt_id) || 0,
      brand: '',
      brandId: 0,
      colors: colors,
      subjectId: data.subject_id || null,
      subjectParentId: data.subject_root_id || 0,
      name: (cardInfo && cardInfo.imt_name) || item.title || '',
      pics: (cardInfo && cardInfo.media && cardInfo.media.photo_count) || 0,
      weight: 0,
      // sizes 占位（单规格）：techSize/wbSize 占位，price 留空由提交时按生效值重写
      sizes: [{ techSize: '0', wbSize: '', price: null }],
    };
  }

  // 解析包装尺寸和重量（从grouped_options的"Габариты"组）
  // ★ 关键：必须匹配"упаковки"(包装)关键字，区分"Длина упаковки"(包装长)和"Длина предмета"(商品长)
  // HAR验证：packagLength=26 ← "Длина упаковки: 26 см"
  //         weightBrutto="0.473" ← "Вес с упаковкой (кг): 0.473 кг"
  function parsePackageInfo(cardInfo) {
    const result = { length: '', width: '', height: '', weight: '' };
    const groups = cardInfo?.grouped_options || [];
    for (const group of groups) {
      if (group.group_name !== 'Габариты') continue;
      for (const opt of group.options || []) {
        const name = String(opt.name || '');
        const val = opt.value;
        // 必须包含"упаковки"(包装)或"упаковкой"(带包装)才认定为包装尺寸
        const isPackage = /упаковк/i.test(name);
        if (!isPackage) continue;
        if (name.includes('Длина')) result.length = parseDimension(val);
        else if (name.includes('Ширина')) result.width = parseDimension(val);
        else if (name.includes('Высота')) result.height = parseDimension(val);
        // ★ 重量：仅取"Вес с упаковкой"(毛重/包装重量)，排除"Вес товара без упаковки"(商品净重)
        // 否则商品净重会覆盖包装重量（如0.2kg覆盖0.4kg），导致weightBrutto传错
        else if ((name.includes('Вес') || name.includes('Масса')) && !/без\s*упаковк/i.test(name)) result.weight = parseWeight(val);
      }
    }
    return result;
  }

  function parseDimension(val) {
    const t = String(val || '').replace(/\s+/g, '');
    if (t.includes('мм')) return Number(t.split('мм')[0]) / 10;
    if (t.includes('см')) return Number(t.split('см')[0]);
    if (t.includes('м')) return Number(t.split('м')[0]) * 100;
    return Number(t);
  }

  function parseWeight(val) {
    const t = String(val || '').replace(/\s+/g, '');
    if (t.includes('кг')) return Number(t.split('кг')[0]);
    if (t.includes('г')) return Number(t.split('г')[0]) / 1000;
    return Number(t);
  }

  // 生成图片URL列表
  function generateImageUrls(nmId, photoCount) {
    const urls = [];
    const count = photoCount || 0;
    for (let i = 0; i < count; i++) {
      urls.push(getMainImageUrl(nmId, i + 1));
    }
    if (urls.length === 0) urls.push(getMainImageUrl(nmId));
    return urls;
  }

  // 供应商代码生成（复刻插件 1.2.0 wbSkusTableUtils.normalizeVendorCode）
  // 格式：BCS-{4随机大写字母}-{nmId}（如 BCS-DQGM-750990246）
  // ★ v1.4.8 修正：v1.4.2 b7 曾改为确定性 BCS-{nmId}（两段式），与插件/BCS 生态不一致——
  //   插件正则 /^BCS-([a-zA-Z]{4})[-/]/ 无法识别两段式，混用时插件会重写前缀。
  //   跨店铺/跨次一致性由「doStartBatch 补全时生成一次 + localStorage 持久化 + 上架复用」保证，与格式无关。
  // ★ v1.5.0 新增：用户设置全局前缀码后，中段用前缀码（BCS-{前缀码}-{nmId}），否则随机；
  //   随机 4 位避免命中《前缀码对照表》（撞车则重新生成），保证随机格式不误伤自动归属。
  function random4Letters() {
    let letters;
    let tries = 0;
    do {
      letters = Array.from({ length: 4 }, () =>
        String.fromCharCode(65 + Math.floor(Math.random() * 26))
      ).join('');
      tries++;
    } while (PREFIX_CODE_SET.has(letters) && tries < 100);  // ★ 撞车重试（上限100防死循环）
    return letters;
  }
  function generateVendorCode(nmId, config = userConfig) {
    const prefix = config.prefixCode || random4Letters();
    return `BCS-${prefix}-${nmId}`;
  }

