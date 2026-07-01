// ==UserScript==
// @name            JavDB.quickView
// @namespace       JavDB.quickView@blc
// @version         0.0.1
// @author          blc
// @description     JavDB 瀑布流小窗预览
// @match           https://javdb.com/*
// @exclude         https://javdb.com/v/*
// @icon            https://javdb.com/favicon.ico
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.QuickView.lib.js
// @run-at          document-end
// @grant           unsafeWindow
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
  window.addEventListener("JavDB_QuickView_Closed", ({ detail }) => {
    const matchNode = detail?.card?.querySelector(".x-match");
    if (!matchNode) return;
    setTimeout(() => unsafeWindow.reMatch?.(matchNode), 400);
  });
})();
