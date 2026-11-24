  // ============================================================
  // 7. 商品提取（搜索页 + 详情页）
  // ============================================================
  function getProductsOnPage() {
    const seen = new Set();
    const items = [];
    const linkPattern = /\/catalog\/(\d+)\//;

    // ★ 多策略查找商品卡片，确保覆盖搜索页和详情页推荐列表
    const linkSelectors = [
      'a.product-card__link',
      'a.j-open-full-product-card',
      'a.j-card-link',
    ];
    const allLinks = new Set();
    for (const sel of linkSelectors) {
      document.querySelectorAll(sel).forEach(a => allLinks.add(a));
    }

    allLinks.forEach(a => {
      const href = a.getAttribute('href') || '';
      const m = href.match(linkPattern);
      if (!m) return;
      const nmId = m[1];

      // 从 a 向上找卡片容器
      let card = a.closest('article.product-card') ||
                 a.closest('.product-card__wrapper') ||
                 a.closest('article') ||
                 a.parentElement;
      if (!card || card === document.body) return;

      // ★ 按 DOM 元素去重（而非 nmId），因为虚拟滚动可能让同一商品出现在多个卡片中
      // 同一个卡片元素只处理一次，但不同卡片即使 nmId 相同也要处理
      if (seen.has(card)) return;
      seen.add(card);

      const img = card.querySelector('img.j-thumbnail, img');
      const title = img?.getAttribute('alt') ||
                    card.querySelector('.product-card__name')?.textContent?.trim() || '';
      const thumb = img?.src || '';

      items.push({ nmId, title, url: a.href, thumb, el: card });
    });
    return items;
  }

  // 详情页：从 URL 提取当前商品（★ v1.7.4 供工具栏「＋当前商品」按钮使用）
  // - nmId 每次实时读 URL：详情页内点击推荐位商品是 SPA 跳转、页面不重载，缓存会取到上一个商品
  // - 标题：h1 → og:title → <title>（仅作列表 tooltip 初始展示；v1.7.4 起抓取成功时也用 card.json 的
  //   imt_name 兜底，见 applyDetailToItem）
  // - 主图：按 nmId 推导 basket CDN 地址（与抓取后 item.mainImage 同源），不依赖详情页 DOM 结构，
  //   避免 WB 改版后选择器失效
  function getCurrentProduct() {
    const m = (location.pathname || '').match(/\/catalog\/(\d+)/);
    if (!m) return null;
    const nmId = m[1];

    const metaContent = (sel) => {
      const el = document.querySelector(sel);
      return el ? String(el.getAttribute('content') || '').trim() : '';
    };

    let title = document.querySelector('h1')?.textContent?.trim() || '';
    if (!title) title = metaContent('meta[property="og:title"]');
    if (!title) title = (document.title || '').trim();

    return {
      nmId,
      title,
      // 归一化为干净详情页地址（去掉 ?targetUrl=GP 等跟踪参数）
      url: `${location.origin}/catalog/${nmId}/detail.aspx`,
      thumb: getMainImageUrl(nmId),
    };
  }

  // 判断是否详情页
  function isDetailPage() {
    return /\/catalog\/\d+\/detail/.test(location.pathname) ||
           /\/catalog\/\d+\/?$/.test(location.pathname);
  }

  // ============================================================
  // 8. 莫斯科仓库匹配（支持中文"莫斯科"和俄文"Москва"）
  // ============================================================
  function findMoscowWarehouse(warehouses) {
    if (!warehouses || !warehouses.length) return null;
    // ★ v1.5.3 负向保险：成都等非莫斯科仓库永不匹配（中/俄/英文名）
    const whs = warehouses.filter(w => !/成都|чэнду|chengdu|cheng du/i.test(w.name || ''));
    // 1. 名称包含 "莫斯科"（中文）或 "Москва"（俄文）或 Moscow/Moskow（英文）
    const moscow = whs.find(w => /莫斯科|москва|moscow|moskow/i.test(w.name || ''));
    if (moscow) return moscow;
    // 2. 名称包含常见莫斯科州周边仓库（精确地名；v1.5.3 已移除 юг/север/восток 过宽方位词）
    const region = whs.find(w => /подольск|электросталь|хоругвино|колчанино/i.test(w.name || ''));
    if (region) return region;
    // 3. 不 fallback 到第一个仓库，避免选错（返回 null 让用户手动选）
    return null;
  }

