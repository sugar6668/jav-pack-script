// ==UserScript==
// @name            JavDB.quickView
// @namespace       JavDB.quickView@blc
// @version         0.0.2
// @author          blc
// @description     JavDB 瀑布流小窗预览
// @match           https://javdb.com/*
// @exclude         https://javdb.com/v/*
// @icon            https://javdb.com/favicon.ico
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.QuickView.lib.js
// @run-at          document-end
// ==/UserScript==

(function () {
  if (!window.JavPackQuickView) return;

  const quickView = new window.JavPackQuickView();
  const ensure = () => quickView.ensureButtons(document);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensure, { once: true });
  } else {
    ensure();
  }

  window.addEventListener("JavDB.scroll", ensure);
  // Covers inserted by the rankings module can exist before its scroll event is
  // observed; keep the preview control in sync with dynamically rendered cards.
  new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) ensure();
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
  // JavDB.match115 synchronizes operation results from the detail iframe to
  // the source card through BroadcastChannel.  A close-triggered re-search is
  // deliberately omitted because 115 can briefly return deleted files.
})();
