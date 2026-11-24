// ==UserScript==
// @name         BCS 批量急速上架（云端API版）
// @namespace    https://bcserp.com/
// @version      1.10.7
// @description  适配官方插件 1.5.8。WB 搜索页/详情页/卖家后台批量上架，按店铺倍数分组，可合并同款颜色，支持原商品图片及视频。
// @match        https://www.wildberries.ru/*
// @match        https://wildberries.ru/*
// @match        https://seller.wildberries.ru/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      wb.bcserp.com
// @connect      www.bcserp.com
// @connect      www.wildberries.ru
// @connect      wildberries.ru
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

  // ★ v1.8.0 卖家后台域名标记（seller.wildberries.ru）：
  //   - BCS 插件不注入 seller 域 → 无 postMessage 桥接，凭证走 GM 跨域缓存（40-api-bcs）
  //   - detail 直连跨域必败 → card.json 合成伪 detail（50-fetcher）
  //   - 复用页面自带勾选框（56-products.getSellerSelectedItems）
  const IS_SELLER_HOST = location.hostname === 'seller.wildberries.ru';
