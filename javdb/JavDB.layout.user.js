// ==UserScript==
// @name            JavDB.layout
// @namespace       JavDB.layout@blc
// @version         0.0.3
// @author          blc
// @description     JavDB 样式
// @match           https://javdb.com/*
// @icon            https://javdb.com/favicon.ico
// @run-at          document-start
// @grant           GM_getValue
// @grant           GM_setValue
// @grant           GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  const STORE_KEY = "JavDB.layout.config";
  const DEFAULT_CONFIG = {
    pageWidth: 96,
    detailWidth: 96,
    waterfallColumns: 4,
    cardGap: 16,
    cardRadius: 0,
    backgroundPreset: "telegram",
    backgroundSpeed: 1,
  };

  const BACKGROUND_PRESETS = {
    telegram: { name: "Telegram \u56db\u5f69", colors: ["#FEDE2B", "#2F9FD6", "#936DEC", "#FE8AB7"] },
    aurora: { name: "\u6d77\u5cb8\u6781\u5149", colors: ["#72F0D4", "#2E9DFF", "#8458E8", "#E0A0FF"] },
    sunset: { name: "\u65e5\u843d\u7cd6\u679c", colors: ["#FFD35A", "#FF8A42", "#E9559B", "#8367E8"] },
    mist: { name: "\u96fe\u84dd\u7d2b\u7f57\u5170", colors: ["#C9F2E5", "#76C6E6", "#8B91E8", "#E9A7C6"] },
  };

  const clamp = (value, min, max) => Math.min(Math.max(Number(value) || min, min), max);
  const getPreset = (id) => BACKGROUND_PRESETS[id] || BACKGROUND_PRESETS.telegram;

  const readConfig = () => {
    const saved = GM_getValue(STORE_KEY, {});
    return {
      pageWidth: clamp(saved.pageWidth ?? DEFAULT_CONFIG.pageWidth, 70, 100),
      detailWidth: clamp(saved.detailWidth ?? DEFAULT_CONFIG.detailWidth, 70, 100),
      waterfallColumns: clamp(saved.waterfallColumns ?? DEFAULT_CONFIG.waterfallColumns, 2, 8),
      cardGap: clamp(saved.cardGap ?? DEFAULT_CONFIG.cardGap, 4, 40),
      cardRadius: clamp(saved.cardRadius ?? DEFAULT_CONFIG.cardRadius, 0, 32),
      backgroundPreset: BACKGROUND_PRESETS[saved.backgroundPreset] ? saved.backgroundPreset : DEFAULT_CONFIG.backgroundPreset,
      backgroundSpeed: clamp(saved.backgroundSpeed ?? DEFAULT_CONFIG.backgroundSpeed, 0.35, 2),
    };
  };

  const writeConfig = (config) => GM_setValue(STORE_KEY, config);

  const createBackgroundSvg = (config) => {
    const [yellow, blue, purple, pink] = getPreset(config.backgroundPreset).colors;
    const duration = (seconds) => `${(seconds / config.backgroundSpeed).toFixed(1)}s`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="yellow"><stop offset="0%" stop-color="${yellow}"/><stop offset="62%" stop-color="${yellow}" stop-opacity=".80"/><stop offset="100%" stop-color="${yellow}" stop-opacity="0"/></radialGradient>
    <radialGradient id="blue"><stop offset="0%" stop-color="${blue}"/><stop offset="60%" stop-color="${blue}" stop-opacity=".88"/><stop offset="100%" stop-color="${blue}" stop-opacity="0"/></radialGradient>
    <radialGradient id="purple"><stop offset="0%" stop-color="${purple}"/><stop offset="60%" stop-color="${purple}" stop-opacity=".86"/><stop offset="100%" stop-color="${purple}" stop-opacity="0"/></radialGradient>
    <radialGradient id="pink"><stop offset="0%" stop-color="${pink}"/><stop offset="60%" stop-color="${pink}" stop-opacity=".86"/><stop offset="100%" stop-color="${pink}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="${yellow}"/>
  <ellipse cx="240" cy="140" rx="1320" ry="720" fill="url(#yellow)">
    <animate attributeName="cx" values="-180;700;-380;240" dur="${duration(32)}" repeatCount="indefinite"/>
    <animate attributeName="cy" values="-120;460;120;140" dur="${duration(38)}" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="1700" cy="240" rx="1280" ry="700" fill="url(#blue)">
    <animate attributeName="cx" values="2100;1120;2260;1700" dur="${duration(36)}" repeatCount="indefinite"/>
    <animate attributeName="cy" values="-120;620;-180;240" dur="${duration(42)}" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="1540" cy="900" rx="1260" ry="680" fill="url(#purple)">
    <animate attributeName="cx" values="1980;920;2180;1540" dur="${duration(40)}" repeatCount="indefinite"/>
    <animate attributeName="cy" values="1260;520;1320;900" dur="${duration(34)}" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="200" cy="860" rx="1260" ry="720" fill="url(#pink)">
    <animate attributeName="cx" values="-300;760;-180;200" dur="${duration(34)}" repeatCount="indefinite"/>
    <animate attributeName="cy" values="1240;480;1340;860" dur="${duration(44)}" repeatCount="indefinite"/>
  </ellipse>
</svg>`;
  };

  const toBackgroundUrl = (config) => `url("data:image/svg+xml;base64,${btoa(createBackgroundSvg(config))}")`;

  GM_addStyle(`
    /* Layout background takes precedence over the optional standalone background script. */
    html.x-layout-background-enabled body {
      background-color: var(--x-layout-background-base) !important;
      background-image: var(--x-layout-background-image) !important;
      background-size: max(145vw, 170vh) auto !important;
      background-position: center center !important;
      background-repeat: no-repeat !important;
      background-attachment: fixed !important;
    }

    .x-layout-modal .modal-card { width: min(620px, calc(100vw - 28px)); border-radius: 14px; overflow: hidden; }
    .x-layout-modal .modal-card-head { padding: 16px 20px; background: linear-gradient(135deg, #f8faff, #f0f5ff); }
    .x-layout-modal .modal-card-body { display: grid; gap: 20px; padding: 22px 20px; }
    .x-layout-section { display: grid; gap: 12px; padding: 15px; border: 1px solid #e8edf5; border-radius: 10px; background: #fbfcff; }
    .x-layout-section-title { margin: 0; color: #344055; font-size: 13px; font-weight: 700; }
    .x-layout-field { display: grid; grid-template-columns: 92px 1fr 56px; align-items: center; gap: 12px; color: #596579; font-size: 13px; }
    .x-layout-field input { width: 100%; accent-color: #3273dc; }
    .x-layout-field output { padding: 3px 7px; border-radius: 5px; background: #edf3ff; color: #2859a5; font-variant-numeric: tabular-nums; text-align: center; }
    .x-layout-background-row { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 12px; color: #596579; font-size: 13px; }
    .x-layout-preset { width: 100%; height: 34px; border: 1px solid #d9e1ee; border-radius: 7px; padding: 0 9px; background: #fff; color: #363636; }
    .x-layout-preview { height: 48px; border-radius: 8px; background: linear-gradient(120deg, var(--x-preview-1), var(--x-preview-2), var(--x-preview-3), var(--x-preview-4)); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .5); }
    .x-layout-modal .modal-card-foot { justify-content: flex-end; gap: 8px; padding: 14px 20px; }
  `);

  const applyConfig = (config) => {
    const root = document.documentElement;
    const colors = getPreset(config.backgroundPreset).colors;
    root.classList.add("x-layout-fluid", "x-layout-background-enabled");
    root.style.setProperty("--x-layout-page-width", `${config.pageWidth}%`);
    root.style.setProperty("--x-layout-detail-width", `${config.detailWidth}%`);
    root.style.setProperty("--x-layout-columns", String(config.waterfallColumns));
    root.style.setProperty("--x-gap", `${config.cardGap}px`);
    root.style.setProperty("--x-layout-card-radius", `${config.cardRadius}px`);
    root.style.setProperty("--x-layout-background-base", colors[0]);
    root.style.setProperty("--x-layout-background-image", toBackgroundUrl(config));
  };

  let config = readConfig();
  applyConfig(config);

  const field = ({ id, label, min, max, step, suffix, value }) => `
    <label class="x-layout-field" for="${id}">
      <span>${label}</span>
      <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
      <output>${value}${suffix}</output>
    </label>`;

  const renderModal = () => {
    const modal = document.createElement("div");
    modal.className = "modal x-layout-modal";
    modal.innerHTML = `
      <div class="modal-background" data-layout-close></div>
      <div class="modal-card">
        <header class="modal-card-head">
          <p class="modal-card-title">\u9875\u9762\u5e03\u5c40\u4e0e\u80cc\u666f</p>
          <button class="delete" type="button" aria-label="\u5173\u95ed" data-layout-close></button>
        </header>
        <section class="modal-card-body">
          <div class="x-layout-section">
            <p class="x-layout-section-title">\u9875\u9762\u5e03\u5c40</p>
            ${field({ id: "x-layout-page-width", label: "\u9875\u9762\u5bbd\u5ea6", min: 70, max: 100, step: 1, suffix: "%", value: config.pageWidth })}
            ${field({ id: "x-layout-detail-width", label: "\u8be6\u60c5\u9875\u5bbd\u5ea6", min: 70, max: 100, step: 1, suffix: "%", value: config.detailWidth })}
            ${field({ id: "x-layout-columns", label: "\u7011\u5e03\u6d41\u5217\u6570", min: 2, max: 8, step: 1, suffix: " \u5217", value: config.waterfallColumns })}
            ${field({ id: "x-layout-card-gap", label: "\u5361\u7247\u95f4\u8ddd", min: 4, max: 40, step: 1, suffix: "px", value: config.cardGap })}
            ${field({ id: "x-layout-card-radius", label: "\u5361\u7247\u5706\u89d2", min: 0, max: 32, step: 1, suffix: "px", value: config.cardRadius })}
          </div>
          <div class="x-layout-section">
            <p class="x-layout-section-title">\u52a8\u6001\u6e10\u53d8\u80cc\u666f</p>
            <label class="x-layout-background-row" for="x-layout-background-preset"><span>\u6e10\u53d8\u914d\u8272</span><select id="x-layout-background-preset" class="x-layout-preset">${Object.entries(BACKGROUND_PRESETS).map(([id, preset]) => `<option value="${id}" ${id === config.backgroundPreset ? "selected" : ""}>${preset.name}</option>`).join("")}</select></label>
            ${field({ id: "x-layout-background-speed", label: "\u52a8\u6001\u901f\u7387", min: 0.35, max: 2, step: 0.05, suffix: "\u00d7", value: config.backgroundSpeed })}
            <div class="x-layout-preview" aria-label="\u5f53\u524d\u6e10\u53d8\u914d\u8272\u9884\u89c8"></div>
          </div>
        </section>
        <footer class="modal-card-foot">
          <button class="button is-light is-small" type="button" data-layout-reset>\u6062\u590d\u9ed8\u8ba4</button>
          <button class="button is-info is-small" type="button" data-layout-save>\u4fdd\u5b58\u8bbe\u7f6e</button>
        </footer>
      </div>`;
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
    trigger.textContent = "\u8bbe\u7f6e";
    triggerWrap.append(trigger);
    navList.append(triggerWrap);

    const modal = renderModal();
    const inputs = {
      pageWidth: modal.querySelector("#x-layout-page-width"),
      detailWidth: modal.querySelector("#x-layout-detail-width"),
      waterfallColumns: modal.querySelector("#x-layout-columns"),
      cardGap: modal.querySelector("#x-layout-card-gap"),
      cardRadius: modal.querySelector("#x-layout-card-radius"),
      backgroundPreset: modal.querySelector("#x-layout-background-preset"),
      backgroundSpeed: modal.querySelector("#x-layout-background-speed"),
    };
    const preview = modal.querySelector(".x-layout-preview");

    const syncOutputs = () => {
      Object.values(inputs).filter((input) => input.type === "range").forEach((input) => {
        const suffix = input.id === "x-layout-columns" ? " \u5217" : input.id === "x-layout-card-gap" || input.id === "x-layout-card-radius" ? "px" : input.id === "x-layout-background-speed" ? "\u00d7" : "%";
        input.nextElementSibling.textContent = `${input.value}${suffix}`;
      });
      const colors = getPreset(inputs.backgroundPreset.value).colors;
      colors.forEach((color, index) => preview.style.setProperty(`--x-preview-${index + 1}`, color));
    };

    const readInputs = () => ({
      pageWidth: clamp(inputs.pageWidth.value, 70, 100),
      detailWidth: clamp(inputs.detailWidth.value, 70, 100),
      waterfallColumns: clamp(inputs.waterfallColumns.value, 2, 8),
      cardGap: clamp(inputs.cardGap.value, 4, 40),
      cardRadius: clamp(inputs.cardRadius.value, 0, 32),
      backgroundPreset: BACKGROUND_PRESETS[inputs.backgroundPreset.value] ? inputs.backgroundPreset.value : DEFAULT_CONFIG.backgroundPreset,
      backgroundSpeed: clamp(inputs.backgroundSpeed.value, 0.35, 2),
    });

    const setInputs = (next) => {
      inputs.pageWidth.value = next.pageWidth;
      inputs.detailWidth.value = next.detailWidth;
      inputs.waterfallColumns.value = next.waterfallColumns;
      inputs.cardGap.value = next.cardGap;
      inputs.cardRadius.value = next.cardRadius;
      inputs.backgroundPreset.value = next.backgroundPreset;
      inputs.backgroundSpeed.value = next.backgroundSpeed;
      syncOutputs();
    };

    syncOutputs();

    Object.values(inputs).forEach((input) => input.addEventListener("input", () => {
      syncOutputs();
      applyConfig(readInputs());
    }));
    inputs.backgroundPreset.addEventListener("change", () => {
      syncOutputs();
      applyConfig(readInputs());
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
