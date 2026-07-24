// ==UserScript==
// @name            JavDB.quickView
// @namespace       JavDB.quickView@blc
// @version         0.0.4
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
  const syncedDeletes = new Map();
  const getCode = (card) => card?.querySelector(".video-title strong")?.textContent.trim().toUpperCase();

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
  window.addEventListener("JavDB_MatchCacheSynced", ({ detail }) => {
    if (detail?.operation !== "delete") return;
    const code = String(detail.code || "").trim().toUpperCase();
    if (code) syncedDeletes.set(code, Date.now());
  });
  window.addEventListener("JavDB_QuickView_Closed", ({ detail }) => {
    const card = detail?.card;
    const matchNode = card?.querySelector(".x-match");
    if (!matchNode) return;
    const code = getCode(card);
    const syncedAt = syncedDeletes.get(code);
    // Delete state was copied from the iframe; querying immediately can show a
    // just-deleted file until the 115 index has caught up.
    if (syncedAt && Date.now() - syncedAt < 10 * 1000) {
      syncedDeletes.delete(code);
      return;
    }
    setTimeout(() => unsafeWindow.reMatch?.(matchNode), 400);
  });
})();
