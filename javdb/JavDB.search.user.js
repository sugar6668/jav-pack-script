// ==UserScript==
// @name            JavDB.search
// @namespace       JavDB.search@blc
// @version         0.0.5
// @author          blc
// @description     快捷搜索
// @match           https://javdb.com/*
// @icon            https://javdb.com/favicon.ico
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Grant.lib.js
// @run-at          document-start
// @grant           GM_openInTab
// ==/UserScript==

(function () {
  const SEARCH_INPUT = "#video-search, input[name='q']";

  const getSearchInput = (target) => {
    if (!(target instanceof Element)) return null;
    return target.closest(SEARCH_INPUT) ?? target.closest(".search-bar-wrap")?.querySelector(SEARCH_INPUT) ?? null;
  };

  const openSearchInTab = (input) => {
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
      if (!(form instanceof HTMLFormElement) || !form.querySelector(SEARCH_INPUT)) return;
      if (!openSearchInTab(form.querySelector(SEARCH_INPUT))) return;

      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );

  // JavDB/Turbo may handle the submit button before a form submit event is
  // dispatched. Intercept the user gesture itself so both clicking and Enter
  // consistently open the result in a new tab.
  document.addEventListener(
    "click",
    (e) => {
      const button = e.target instanceof Element ? e.target.closest("#search-submit, .search-submit") : null;
      if (!button) return;

      if (!openSearchInTab(getSearchInput(button))) return;

      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" || e.isComposing) return;

      if (!openSearchInTab(getSearchInput(e.target))) return;

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
