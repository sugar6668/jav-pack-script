// ==UserScript==
// @name            JavDB.search
// @namespace       JavDB.search@blc
// @version         0.0.3
// @author          blc
// @description     快捷搜索
// @match           https://javdb.com/*
// @icon            https://javdb.com/favicon.ico
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Grant.lib.js
// @run-at          document-start
// @grant           GM_openInTab
// ==/UserScript==

(function () {
  const openSearchInTab = (form) => {
    const input = form.querySelector("#video-search");
    const keyword = input?.value.trim();
    if (!keyword) return false;

    const url = new URL("/search", location.origin);
    url.searchParams.set("q", keyword);
    Grant.openTab(url.href);
    return true;
  };

  // Keep searches out of the current Turbo page, whether they are submitted
  // with the search button or with Enter.
  document.addEventListener(
    "submit",
    (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || !form.querySelector("#video-search")) return;
      if (!openSearchInTab(form)) return;

      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );

  document.addEventListener("keydown", async (e) => {
    if (e.ctrlKey && e.code === "Slash") {
      const txt = await navigator.clipboard.readText();
      if (!txt) return;

      const url = `${location.origin}/search?q=${txt.trim()}`;
      if (!location.pathname.startsWith("/search")) return Grant.openTab(url);
      location.href = url;
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.code !== "Slash") return;
    const { nodeName } = document.activeElement;
    if (["INPUT", "TEXTAREA"].includes(nodeName)) return;

    const input = document.querySelector("#video-search");
    if (!input) return;

    input.focus();
    input.select();
  });

  const initSearchBar = () => {
    const menuHero = document.querySelector("#navbar-menu-hero");
    const menuUser = document.querySelector("#navbar-menu-user");
    const searchBarContainer = document.querySelector("#search-bar-container");
    const wrap = searchBarContainer?.querySelector(".search-bar-wrap");
    if (!menuHero || !menuUser || !wrap || document.querySelector(".x-searchbar-wrapper")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "x-searchbar-wrapper";
    wrapper.append(wrap);
    menuHero.parentNode.insertBefore(wrapper, menuUser);
    searchBarContainer.remove();
  };

  let retries = 0;
  const tryInitSearchBar = () => {
    if (retries >= 5 || document.querySelector(".x-searchbar-wrapper")) return;
    retries++;
    initSearchBar();
    if (!document.querySelector(".x-searchbar-wrapper")) setTimeout(tryInitSearchBar, 500);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryInitSearchBar, { once: true });
  } else {
    tryInitSearchBar();
  }
})();
