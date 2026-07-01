// ==UserScript==
// @name            JavDB.layout
// @namespace       JavDB.layout@blc
// @version         0.0.1
// @author          blc
// @description     JavDB 页面布局设置
// @match           https://javdb.com/*
// @icon            https://javdb.com/favicon.ico
// @run-at          document-start
// @grant           GM_getValue
// @grant           GM_setValue
// ==/UserScript==

(function () {
  const STORE_KEY = "JavDB.layout.config";
  const DEFAULT_CONFIG = {
    pageWidth: 96,
    detailWidth: 96,
    waterfallColumns: 4,
  };

  const clamp = (value, min, max) => Math.min(Math.max(Number(value) || min, min), max);

  const readConfig = () => {
    const saved = GM_getValue(STORE_KEY, {});
    return {
      pageWidth: clamp(saved.pageWidth ?? DEFAULT_CONFIG.pageWidth, 70, 100),
      detailWidth: clamp(saved.detailWidth ?? DEFAULT_CONFIG.detailWidth, 70, 100),
      waterfallColumns: clamp(saved.waterfallColumns ?? DEFAULT_CONFIG.waterfallColumns, 2, 8),
    };
  };

  const writeConfig = (config) => GM_setValue(STORE_KEY, config);

  const applyConfig = (config) => {
    const root = document.documentElement;
    root.classList.add("x-layout-fluid");
    root.style.setProperty("--x-layout-page-width", `${config.pageWidth}%`);
    root.style.setProperty("--x-layout-detail-width", `${config.detailWidth}%`);
    root.style.setProperty("--x-layout-columns", String(config.waterfallColumns));
  };

  let config = readConfig();
  applyConfig(config);

  const field = ({ id, label, min, max, step, suffix, value }) => `
    <label class="x-layout-field" for="${id}">
      <span>${label}</span>
      <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
      <output>${value}${suffix}</output>
    </label>
  `;

  const renderModal = () => {
    const modal = document.createElement("div");
    modal.className = "modal x-layout-modal";
    modal.innerHTML = `
      <div class="modal-background" data-layout-close></div>
      <div class="modal-card">
        <header class="modal-card-head">
          <p class="modal-card-title">页面布局</p>
          <button class="delete" type="button" aria-label="close" data-layout-close></button>
        </header>
        <section class="modal-card-body">
          ${field({ id: "x-layout-page-width", label: "页面宽度", min: 70, max: 100, step: 1, suffix: "%", value: config.pageWidth })}
          ${field({ id: "x-layout-detail-width", label: "详情页宽度", min: 70, max: 100, step: 1, suffix: "%", value: config.detailWidth })}
          ${field({ id: "x-layout-columns", label: "瀑布流列数", min: 2, max: 8, step: 1, suffix: " 列", value: config.waterfallColumns })}
        </section>
        <footer class="modal-card-foot">
          <button class="button is-info is-small" type="button" data-layout-save>保存</button>
          <button class="button is-light is-small" type="button" data-layout-reset>恢复默认</button>
        </footer>
      </div>
    `;
    document.body.append(modal);
    return modal;
  };

  const initSettings = () => {
    const navList = document.querySelector(".main-tabs ul, .navbar-start, .tabs:not(.no-bottom) ul");
    if (!navList || document.querySelector(".x-layout-trigger")) return;

    const triggerWrap = navList.matches("ul") ? document.createElement("li") : document.createElement("div");
    const trigger = document.createElement("a");
    trigger.href = "javascript:void(0);";
    trigger.className = navList.matches("ul") ? "x-layout-trigger" : "navbar-item x-layout-trigger";
    trigger.textContent = "布局";
    triggerWrap.append(trigger);
    navList.append(triggerWrap);

    const modal = renderModal();
    const inputs = {
      pageWidth: modal.querySelector("#x-layout-page-width"),
      detailWidth: modal.querySelector("#x-layout-detail-width"),
      waterfallColumns: modal.querySelector("#x-layout-columns"),
    };

    const syncOutputs = () => {
      Object.values(inputs).forEach((input) => {
        const suffix = input.id === "x-layout-columns" ? " 列" : "%";
        input.nextElementSibling.textContent = `${input.value}${suffix}`;
      });
    };

    const readInputs = () => ({
      pageWidth: clamp(inputs.pageWidth.value, 70, 100),
      detailWidth: clamp(inputs.detailWidth.value, 70, 100),
      waterfallColumns: clamp(inputs.waterfallColumns.value, 2, 8),
    });

    const setInputs = (next) => {
      inputs.pageWidth.value = next.pageWidth;
      inputs.detailWidth.value = next.detailWidth;
      inputs.waterfallColumns.value = next.waterfallColumns;
      syncOutputs();
    };

    Object.values(inputs).forEach((input) => {
      input.addEventListener("input", () => {
        syncOutputs();
        applyConfig(readInputs());
      });
    });

    trigger.addEventListener("click", () => modal.classList.add("is-active"));
    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-layout-close]")) modal.classList.remove("is-active");
      if (event.target.closest("[data-layout-save]")) {
        config = readInputs();
        writeConfig(config);
        applyConfig(config);
        modal.classList.remove("is-active");
      }
      if (event.target.closest("[data-layout-reset]")) {
        config = { ...DEFAULT_CONFIG };
        writeConfig(config);
        setInputs(config);
        applyConfig(config);
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSettings, { once: true });
  } else {
    initSettings();
  }
})();
