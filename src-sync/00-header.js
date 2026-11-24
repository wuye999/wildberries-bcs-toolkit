// ==UserScript==
// @name         BCS 跨店同步（跨店铺商品信息同步）
// @namespace    https://bcserp.com/
// @version      0.8.5
// @description  适配官方插件 1.5.8，补上架提交 WB 源商品链接及主图视频。WB 卖家后台「所有商品」页勾选商品 → 已上架店铺同步内容/图片，未上架店铺补上架。同步走 WB 官方 Open API（content/v2/cards/update 全量回填 + content/v3/media/save 换图），补上架走 BCS /system/wbCollection/wb/new（vc 默认沿用源店、价格/库存可逐行自定义、仓库自动选莫斯科）。v0.5.0：目标店铺可分别勾选「同步」与「上架」，预览里直接编辑每行的 vc/价/库存，执行前二次确认，写后自动回读校验。图片用 dHash+亮度MAD 双判据逐张比对（重编码/缩放/轻裁剪不误判；纯色图靠 MAD 兜底），只有真检测到差异才整组替换；「强制换图」为兜底。
// @match        https://seller.wildberries.ru/*
// @match        https://www.wildberries.ru/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      wb.bcserp.com
// @connect      content-api.wildberries.ru
// @connect      common-api.wildberries.ru
// @connect      seller-content.wildberries.ru
// @connect      www.wildberries.ru
// @connect      basket-01.wbbasket.ru
// @connect      basket-02.wbbasket.ru
// @connect      basket-03.wbbasket.ru
// @connect      basket-04.wbbasket.ru
// @connect      basket-05.wbbasket.ru
// @connect      basket-06.wbbasket.ru
// @connect      basket-07.wbbasket.ru
// @connect      basket-08.wbbasket.ru
// @connect      basket-09.wbbasket.ru
// @connect      basket-10.wbbasket.ru
// @connect      basket-11.wbbasket.ru
// @connect      basket-12.wbbasket.ru
// @connect      basket-13.wbbasket.ru
// @connect      basket-14.wbbasket.ru
// @connect      basket-15.wbbasket.ru
// @connect      basket-16.wbbasket.ru
// @connect      basket-17.wbbasket.ru
// @connect      basket-18.wbbasket.ru
// @connect      basket-19.wbbasket.ru
// @connect      basket-20.wbbasket.ru
// @connect      basket-21.wbbasket.ru
// @connect      basket-22.wbbasket.ru
// @connect      basket-23.wbbasket.ru
// @connect      basket-24.wbbasket.ru
// @connect      basket-25.wbbasket.ru
// @connect      basket-26.wbbasket.ru
// @connect      basket-27.wbbasket.ru
// @connect      basket-28.wbbasket.ru
// @connect      basket-29.wbbasket.ru
// @connect      basket-30.wbbasket.ru
// @connect      basket-31.wbbasket.ru
// @connect      basket-32.wbbasket.ru
// @connect      basket-33.wbbasket.ru
// @connect      basket-34.wbbasket.ru
// @connect      basket-35.wbbasket.ru
// @connect      basket-36.wbbasket.ru
// @connect      basket-37.wbbasket.ru
// @connect      basket-38.wbbasket.ru
// @connect      basket-39.wbbasket.ru
// @connect      basket-40.wbbasket.ru
// @connect      basket-41.wbbasket.ru
// @connect      basket-42.wbbasket.ru
// @connect      basket-43.wbbasket.ru
// @connect      basket-44.wbbasket.ru
// @connect      basket-45.wbbasket.ru
// @connect      basket-46.wbbasket.ru
// @connect      basket-47.wbbasket.ru
// @connect      basket-48.wbbasket.ru
// @connect      basket-49.wbbasket.ru
// @connect      basket-50.wbbasket.ru
// @connect      basket-51.wbbasket.ru
// @connect      basket-52.wbbasket.ru
// @connect      basket-53.wbbasket.ru
// @connect      basket-54.wbbasket.ru
// @connect      basket-55.wbbasket.ru
// @connect      basket-56.wbbasket.ru
// @connect      basket-57.wbbasket.ru
// @connect      basket-58.wbbasket.ru
// @connect      basket-59.wbbasket.ru
// @connect      basket-60.wbbasket.ru
// @connect      basket-61.wbbasket.ru
// @connect      basket-62.wbbasket.ru
// @connect      basket-63.wbbasket.ru
// @connect      basket-64.wbbasket.ru
// @connect      basket-65.wbbasket.ru
// ==/UserScript==

(function () {
  'use strict';

  // ★ 独立脚本：与《BCS 批量急速上架》并存互不干扰
  //   - DOM id 前缀：bcs-sync-
  //   - 自有存储 key 前缀：bcs_sync_
  //   - 仅匹配 seller 域，因此不走插件桥接（40-api-bcs 读 GM 跨域凭证缓存）
  const IS_SELLER_HOST = location.hostname === 'seller.wildberries.ru';
  const SYNC_VERSION = '0.8.5';
  const SYNC_PREFIX = 'bcs-sync-';
