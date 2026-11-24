  // ---- 一键全部上架 ----
  // ★ v1.4.2 复查：包装函数负责防重复触发（查重/确认阶段耗时，可被连点）与按钮状态管理
  let batchPreparing = false;
  async function onStartBatch() {
    if (batchRunning) { alert('已有上架任务进行中，请等待完成'); return; }
    if (batchPreparing) { alert('正在准备上架，请稍候...'); return; }
    batchPreparing = true;
    const startBtn = document.getElementById('bcs-btn-start');
    if (startBtn) startBtn.disabled = true;
    try {
      await doStartBatch();
    } catch (error) {
      log.error('上架准备失败:', error);
      alert(error.message || String(error));
      showProgress(error.message || String(error), true);
    } finally {
      batchPreparing = false;
      if (startBtn) { startBtn.disabled = false; startBtn.textContent = '一键全部上架'; }
    }
  }

  async function doStartBatch() {
    const config = JSON.parse(JSON.stringify(userConfig));
    const pricesAtStart = BOSS_DEFAULTS;
    const directUpload = config.settings.directUpload;
    const action = directUpload ? '上架' : '存入采集箱';
    const items = JSON.parse(JSON.stringify(pendingList));
    if (!items.length) { alert('待上架列表为空'); return; }
    if (!config.selectedShopIds.length) { alert('请先选择至少一个店铺'); return; }

    // ---- 预校验①：数据完整性（★ A4 保留原设计：无效商品确认后跳过，不阻断其他商品）----
    // ★ v1.4.2：b2（名称缺失）/b4（图片缺失）/b6（售价下限）已加入无效判定
    // ★ v1.9.0：价格/包装一律取价格表 —— 未匹配价格表 = 无法定价 = 该商品无效（不再有全局兜底价）
    const invalidItems = [];
    const validItems = [];
    items.forEach((it, idx) => {
      try {
        if (!it.vendorCode) it.vendorCode = generateVendorCode(Number(it.nmId), config);
        prepareShelveItem(it, config);
        validItems.push(it);
      } catch (error) {
        invalidItems.push(`#${idx + 1} ${it.nmId}: ${error.message}`);
      }
    });

    if (!validItems.length) {
      alert(`所有 ${invalidItems.length} 个商品数据均无效，无法上架：\n\n${invalidItems.join('\n')}`);
      return;
    }
    if (invalidItems.length) {
      const ok = confirm(`检测到 ${invalidItems.length} 个商品数据无效：\n\n${invalidItems.join('\n')}\n\n` +
                         `将跳过这些商品，仅对 ${validItems.length} 个有效商品执行「${action}」。\n` +
                         `点击"确定"继续，"取消"中止上架。`);
      if (!ok) return;
    }

    // ---- 预校验②：店铺仓库（★ A6 保留原设计：仅校验仓库，库存默认 999）----
    // ★ 注意：用户勾选的每个商品都上架（勾选即人工核对过），不做同款多色自动去重；
    //   多色只提交第一个 nmId 的 SKU 在 batchShelve 构造请求时处理
    const shops = JSON.parse(JSON.stringify(shopsCache || []));
    const selectedShops = shops.filter(s => config.selectedShopIds.some(id => String(id) === String(s.id)));
    if (!selectedShops.length) {
      alert('未找到已选店铺（店铺列表可能未加载），请点击「刷新店铺」后重新勾选。');
      return;
    }
    for (const shop of selectedShops) {
      if (!shop.warehouses?.length) {
        const loaded = await ensureWarehouses(shop.id);
        shop.warehouses = JSON.parse(JSON.stringify(loaded.warehouses || []));
      }
      validateShelveShop(shop, config);
    }

    // ---- 预校验③：补全缺失的供应商代码（★ v1.4.8）----
    // vendorCode 为随机格式（BCS-XXXX-nmId）：此处生成一次并立即持久化，
    // 保证同一商品上架全部店铺用同一代码、下次上架也复用同一代码（跨店铺/跨次一致）。
    // 生成值已写入本批快照；补存回原列表，保证跨次重试使用同一供应商代码。
    // 异步加载仓库期间若用户改了原行，不覆盖其新输入，也不提交与界面含义已不同的批次。
    let generatedCodes = 0;
    for (const it of validItems) {
      const original = pendingList.find(p => String(p.nmId) === String(it.nmId));
      if (original && !original.vendorCode) { original.vendorCode = it.vendorCode; generatedCodes++; }
      else if (original && original.vendorCode !== it.vendorCode) throw new Error('准备期间供应商代码已改变，请重新开始上架');
    }
    if (generatedCodes > 0) savePending(pendingList);

    // ---- 预校验④：重复上架检测（★ v1.4.2 b5；★ v1.4.8 空 vendorCode 商品跳过并提示）----
    // ★ v1.9.0：一次提交按倍数拆成多次请求后，「命中即整批阻断」会让部分成功的商品无法重试 →
    //   改为「命中只跳过该商品×该店铺，其余继续」（确认框明示）
    showToast(`正在检查 ${selectedShops.length} 个店铺中是否存在重复上架...`, 8000);
    const { dupes, skipped } = await checkDuplicatedItems(validItems, selectedShops);
    if (skipped.length) throw new Error('部分商品未完成查重，本批未提交');
    if (BOSS_DEFAULTS !== pricesAtStart) throw new Error('准备期间价格表已更新，请重新开始上架');
    const skipByNm = new Map();   // nmId -> Set(shopId)
    if (dupes.length) {
      dupes.forEach(d => {
        const k = String(d.nmId);
        if (!skipByNm.has(k)) skipByNm.set(k, new Set());
        skipByNm.get(k).add(d.shopId);
      });
      const lines = dupes.slice(0, 30)
        .map(d => `  - ${d.nmId} 已在「${d.shopName}」上架`)
        .join('\n');
      const more = dupes.length > 30 ? `\n  ...（其余 ${dupes.length - 30} 条略）` : '';
      const okDup = confirm(`检测到 ${dupes.length} 个「商品 × 店铺」组合已上架，本次将跳过这些组合：\n\n${lines}${more}\n\n` +
                            `点击"确定"继续${action}，"取消"中止本次操作。`);
      if (!okDup) return;
    }

    // ---- 确认框（★ v1.4.2 b8：列出全部店铺 + 默认值使用警告；商品多时截断防超长）----
    // ★ v1.5.3：确认框逐店铺显示「店铺 → 实际仓库名」，仓库选错时提交前即可察觉
    // ★ v1.9.0：逐店铺显示上架倍数；上架价 = 价格表最低售价 × 倍数（分组提交）
    const shopWarehouseLines = selectedShops.map(s => {
      const cfg = config.shopConfigs[s.id] || {};
      const wh = (s.warehouses || []).find(w => String(w.id) === String(cfg.warehouseId));
      const mult = getShopPriceMultiplier(s.id, config);
      if (wh) return `  - ${s.shopName || s.id} → ${wh.name}　×${mult}`;
      return `  - ${s.shopName || s.id} → ⚠️ 仓库未知(id=${cfg.warehouseId != null ? cfg.warehouseId : '未选'})，请核对　×${mult}`;
    }).join('\n');

    const { groups, requests } = buildShelvePlan(validItems, selectedShops, skipByNm, config);
    const multLines = groups
      .map(g => {
        const names = g.shops.map(s => s.shopName || s.id);
        const sample = validItems.slice(0, 3)
          .map(it => {
            const b = getItemBossDefaults(it, config);
            return b ? `${it.nmId}:${formatShelvePrice(b.minPrice, g.mult, directUpload)}` : it.nmId;
          }).join('、');
        return `  ×${g.mult}（${g.shops.length}店）：${names.join('、')}\n      示例上架价 ${sample}${validItems.length > 3 ? ' …' : ''}`;
      })
      .join('\n');
    const reqCount = requests.length;
    if (!reqCount) { alert('所选商品在所选店铺均已上架，无需提交'); return; }
    const estMinutes = Math.ceil((reqCount * config.intervalMs) / 60000);
    const skippedShopCount = skipByNm.size;

    let msg = directUpload
      ? `确认将 ${validItems.length} 个商品上架到 ${selectedShops.length} 个店铺？\n\n`
      : `确认将 ${validItems.length} 个商品存入采集箱（目标店铺 ${selectedShops.length} 个）？\n\n`;
    msg += `店铺（发货仓库 / 上架倍数）：\n${shopWarehouseLines}\n`;
    msg += `前缀码：${config.prefixCode || '自动随机'}\n`;
    msg += `方式：${directUpload ? '直上' : '修改（存入采集箱）'} / ` +
           `品牌：${config.settings.carryBrand ? '携带' : '不携带'} / ` +
           `合并：${config.settings.noMerge ? '不合并' : '合并已选的同款颜色'}\n\n`;
    const rounding = directUpload ? '四舍五入至分' : '按采集箱规则向上取整至元';
    msg += `上架价 = 价格表最低售价 × 店铺倍数（${rounding}）\n${multLines}\n`;
    msg += `计划提交 ${reqCount} 次请求（${groups.length} 个倍数分组），` +
           `间隔 ${config.intervalMs / 1000}s，预计约 ${estMinutes} 分钟\n`;
    if (skippedShopCount) {
      msg += `\n⚠️ ${skippedShopCount} 个商品在部分店铺已上架，本次将跳过那些店铺（其余继续）。\n`;
    }
    // ★ v1.4.8：vendorCode 为空的商品未参与查重，确认框明确提示（正常流程已补全，此处为兜底）
    if (skipped.length) {
      const skipList = skipped.slice(0, 20).map(s => `  - ${s.nmId}`).join('\n');
      msg += `\n⚠️ ${skipped.length} 个商品供应商代码为空，未参与重复上架检测：\n${skipList}` +
             (skipped.length > 20 ? `\n  ...（其余 ${skipped.length - 20} 个略）` : '') + '\n';
    }
    // ★ v1.7.0：合成 detail 商品汇总提示（detail 抓取失败、card.json 合成，规格名占位、无实时现价）
    const syntheticItems = validItems.filter(it => it.detailSource === 'synthetic');
    if (syntheticItems.length) {
      const synList = syntheticItems.slice(0, 20).map(s => `  - ${s.nmId}`).join('\n');
      msg += `\n⚠️ ${syntheticItems.length} 个商品使用 card.json 合成数据（detail 抓取失败；` +
             `规格名为占位、无实时现价，售价/尺寸/重量按价格表 + 店铺倍数提交），请核对：\n${synList}` +
             (syntheticItems.length > 20 ? `\n  ...（其余 ${syntheticItems.length - 20} 个略）` : '') + '\n';
    }
    msg += `\n${action}完成前请保持此页面打开。`;
    if (!confirm(msg)) return;

    const btn = document.getElementById('bcs-btn-start');
    if (btn) btn.disabled = true;
    if (btn) btn.textContent = `${action}中...`;
    showProgress(`开始批量${action}...`);

    // ★ 传递快照而非引用，避免上架过程中用户编辑/删除导致数据不一致
    // ★ 仅上架有效商品，跳过预校验失败的商品
    // ★ v1.9.0：skipByNm 传入 batchShelve → 查重命中的「商品×店铺」按店铺剔除，其余继续
    const snapshot = JSON.parse(JSON.stringify(validItems));
    try {
      await batchShelve(snapshot, (info) => {
        if (info.phase) showProgress(info.phase);
        if (info.done) {
          const warnings = info.results ? info.results.filter(r => r.warning) : [];
          let msg = `批量${action}完成：成功 ${info.ok} 个商品`;
          if (info.partial) msg += `，部分成功 ${info.partial} 个`;
          if (info.fail) msg += `，失败 ${info.fail} 个`;
          msg += `（分组提交，以商品为单位统计）`;
          if (!directUpload && (info.ok || info.partial)) msg += '\n已保存的商品可在 BCS 采集箱中手动编辑上架。';
          if (warnings.length) msg += `\n\n⚠️ ${warnings.length} 组提交结果未确认，重试前请先检查${directUpload ? '目标店铺' : '采集箱'}：\n` +
            warnings.map(r => `${r.nmId} → ${r.shopNames.join('/')}`).join('\n');
          if (info.partialList) {
            const retryHint = directUpload ? '请到失败店铺补上架' : '请核对采集箱后重试失败分组';
            msg += `\n\n⚠️ 部分成功（${retryHint}）：\n${info.partialList}`;
          }
          if (info.failList) msg += `\n\n失败列表：\n${info.failList}`;
          if (info.skippedList) msg += `\n\n以下商品在所选店铺均已上架，本次未提交：\n${info.skippedList}`;
          showProgress(msg, true);
          alert(msg);
        }
      }, { skipByNm, config, shops: selectedShops });
    } catch (e) {
      log.error('批量上架异常:', e);
      alert('批量上架异常：' + (e.message || e));
      showProgress('异常：' + (e.message || e), true);
    } finally {
      if (btn) btn.disabled = false;
      if (btn) btn.textContent = '一键全部上架';
    }
  }

  function showProgress(text, isFinal = false) {
    const el = document.getElementById('bcs-progress');
    if (!el) return;
    el.style.display = 'block';
    el.textContent = text;
    el.style.background = isFinal ? '#d4edda' : '#fff3cd';
    el.style.color = isFinal ? '#155724' : '#856404';
  }

