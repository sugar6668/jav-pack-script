// ==UserScript==
// @name            JavDB.layout
// @namespace       JavDB.layout@blc
// @version         0.0.9
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
  const KEYWORD_CONFIG_STORAGE_KEY = "JavDB.filter.keywordConfig.v1";
  const KEYWORD_CONFIG_EVENT = "JavDB.filter.keywordConfigChanged";
  const SCORE_CONFIG_STORAGE_KEY = "JavDB.filter.scoreConfig.v1";
  const SCORE_CONFIG_EVENT = "JavDB.filter.scoreConfigChanged";
  const VISIBILITY_CONFIG_STORAGE_KEY = "JavDB.filter.visibilityConfig.v1";
  const VISIBILITY_CONFIG_EVENT = "JavDB.filter.visibilityConfigChanged";
  const DEFAULT_SCORE_CONFIG = Object.freeze({
    lowRating: 3.8, weakRating: 4.0, lowVotes: 20, weakVotes: 30,
    highlightRating: 3.8, highlightVotes: 300, highlightStart: "#00ffff", highlightEnd: "#e0ffff",
    topRating: 4.0, topVotes: 1000, topStart: "#ff69b4", topEnd: "#ffb6c1",
    lowVisibility: 10, weakVisibility: 30, westernBypass: true,
  });
  const DEFAULT_VISIBILITY_CONFIG = Object.freeze({
    searchSafeMode: true,
    keywordFilterEnabled: true,
    scoreFilterEnabled: true,
    manualBlockFilterEnabled: true,
  });
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

  const DEFAULT_KEYWORD_CONFIG = Object.freeze({
    titleKeywords: ["大便", "尿", "粪", "浣肠", "失禁", "排泄", "失便", "唾", "虐", "sm", "m男", "剛毛", "鼻", "アナル", "熟女", "男の娘", "男娘", "偽娘", "伪娘", "女装男子", "女装子", "ニューハーフ", "ふたなり", "futanari"],
    tagKeywords: ["熟女", "排泄", "猎奇", "男の娘", "cross dressing", "cross-dressing", "女装", "ニューハーフ", "transsexual", "shemale", "futanari", "ふたなり"],
  });

  const clamp = (value, min, max) => Math.min(Math.max(Number(value) || min, min), max);
  const clampScoreNumber = (value, min, max, fallback, precision = 0) => {
    if (value == null || typeof value === "boolean" || (typeof value === "string" && !value.trim())) return fallback;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    const clamped = Math.min(Math.max(numeric, min), max);
    return precision ? Number(clamped.toFixed(precision)) : Math.round(clamped);
  };
  const normalizeScoreColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;
  const normalizeScoreConfig = (source = {}) => ({
    lowRating: clampScoreNumber(source.lowRating, 0, 5, DEFAULT_SCORE_CONFIG.lowRating, 1),
    weakRating: clampScoreNumber(source.weakRating, 0, 5, DEFAULT_SCORE_CONFIG.weakRating, 1),
    lowVotes: clampScoreNumber(source.lowVotes, 0, 10000000, DEFAULT_SCORE_CONFIG.lowVotes),
    weakVotes: clampScoreNumber(source.weakVotes, 0, 10000000, DEFAULT_SCORE_CONFIG.weakVotes),
    highlightRating: clampScoreNumber(source.highlightRating, 0, 5, DEFAULT_SCORE_CONFIG.highlightRating, 1),
    highlightVotes: clampScoreNumber(source.highlightVotes, 0, 10000000, DEFAULT_SCORE_CONFIG.highlightVotes),
    highlightStart: normalizeScoreColor(source.highlightStart, DEFAULT_SCORE_CONFIG.highlightStart),
    highlightEnd: normalizeScoreColor(source.highlightEnd, DEFAULT_SCORE_CONFIG.highlightEnd),
    topRating: clampScoreNumber(source.topRating, 0, 5, DEFAULT_SCORE_CONFIG.topRating, 1),
    topVotes: clampScoreNumber(source.topVotes, 0, 10000000, DEFAULT_SCORE_CONFIG.topVotes),
    topStart: normalizeScoreColor(source.topStart, DEFAULT_SCORE_CONFIG.topStart),
    topEnd: normalizeScoreColor(source.topEnd, DEFAULT_SCORE_CONFIG.topEnd),
    lowVisibility: clampScoreNumber(source.lowVisibility, 0, 100, DEFAULT_SCORE_CONFIG.lowVisibility),
    weakVisibility: clampScoreNumber(source.weakVisibility, 0, 100, DEFAULT_SCORE_CONFIG.weakVisibility),
    westernBypass: typeof source.westernBypass === "boolean" ? source.westernBypass : DEFAULT_SCORE_CONFIG.westernBypass,
  });
  const readScoreConfig = () => {
    try { return normalizeScoreConfig(JSON.parse(localStorage.getItem(SCORE_CONFIG_STORAGE_KEY) || "{}")); }
    catch (_) { return { ...DEFAULT_SCORE_CONFIG }; }
  };
  const writeScoreConfig = (next) => {
    const normalized = normalizeScoreConfig(next);
    localStorage.setItem(SCORE_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(SCORE_CONFIG_EVENT));
    return normalized;
  };
  const normalizeVisibilityConfig = (source = {}) => ({
    searchSafeMode: typeof source.searchSafeMode === "boolean" ? source.searchSafeMode : DEFAULT_VISIBILITY_CONFIG.searchSafeMode,
    keywordFilterEnabled: typeof source.keywordFilterEnabled === "boolean" ? source.keywordFilterEnabled : DEFAULT_VISIBILITY_CONFIG.keywordFilterEnabled,
    scoreFilterEnabled: typeof source.scoreFilterEnabled === "boolean" ? source.scoreFilterEnabled : DEFAULT_VISIBILITY_CONFIG.scoreFilterEnabled,
    manualBlockFilterEnabled: typeof source.manualBlockFilterEnabled === "boolean" ? source.manualBlockFilterEnabled : DEFAULT_VISIBILITY_CONFIG.manualBlockFilterEnabled,
  });
  const readVisibilityConfig = () => {
    try { return normalizeVisibilityConfig(JSON.parse(localStorage.getItem(VISIBILITY_CONFIG_STORAGE_KEY) || "{}")); }
    catch (_) { return { ...DEFAULT_VISIBILITY_CONFIG }; }
  };
  const writeVisibilityConfig = (next) => {
    const normalized = normalizeVisibilityConfig(next);
    localStorage.setItem(VISIBILITY_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(VISIBILITY_CONFIG_EVENT, { detail: normalized }));
    return normalized;
  };
  const getPreset = (id) => BACKGROUND_PRESETS[id] || BACKGROUND_PRESETS.telegram;
  const normalizeKeywords = (source) => [...new Set(
    (Array.isArray(source) ? source : source == null ? [] : [source])
      .flatMap((item) => String(item).split(/[,，\r\n]+/))
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )];
  const readKeywordConfig = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEYWORD_CONFIG_STORAGE_KEY) || "{}");
      return {
        titleKeywords: normalizeKeywords(Array.isArray(saved.titleKeywords) ? saved.titleKeywords : DEFAULT_KEYWORD_CONFIG.titleKeywords),
        tagKeywords: normalizeKeywords(Array.isArray(saved.tagKeywords) ? saved.tagKeywords : DEFAULT_KEYWORD_CONFIG.tagKeywords),
      };
    } catch (_) {
      return {
        titleKeywords: [...DEFAULT_KEYWORD_CONFIG.titleKeywords],
        tagKeywords: [...DEFAULT_KEYWORD_CONFIG.tagKeywords],
      };
    }
  };
  const writeKeywordConfig = (next) => {
    const normalized = {
      titleKeywords: normalizeKeywords(next.titleKeywords),
      tagKeywords: normalizeKeywords(next.tagKeywords),
    };
    localStorage.setItem(KEYWORD_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(KEYWORD_CONFIG_EVENT));
    return normalized;
  };

  const readConfig = () => {
    const saved = GM_getValue(STORE_KEY, {});
    return {
      pageWidth: clamp(saved.pageWidth ?? DEFAULT_CONFIG.pageWidth, 70, 100),
      detailWidth: clamp(saved.detailWidth ?? DEFAULT_CONFIG.detailWidth, 70, 100),
      waterfallColumns: clamp(saved.waterfallColumns ?? DEFAULT_CONFIG.waterfallColumns, 2, 8),
      cardGap: clamp(saved.cardGap ?? DEFAULT_CONFIG.cardGap, 4, 40),
      cardRadius: clamp(saved.cardRadius ?? DEFAULT_CONFIG.cardRadius, 0, 32),
      backgroundPreset: BACKGROUND_PRESETS[saved.backgroundPreset] ? saved.backgroundPreset : DEFAULT_CONFIG.backgroundPreset,
      backgroundSpeed: clamp(saved.backgroundSpeed ?? DEFAULT_CONFIG.backgroundSpeed, 0, 1),
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

    .x-layout-modal .modal-card { display: flex; flex-direction: column; width: min(620px, calc(100vw - 28px)); height: min(780px, calc(100vh - 28px)); max-height: calc(100vh - 28px); border-radius: 14px; overflow: hidden; }
    .x-layout-modal .modal-card-head { flex: 0 0 auto; padding: 16px 20px; background: linear-gradient(135deg, #f8faff, #f0f5ff); }
    .x-layout-modal .modal-card-body { display: grid; flex: 1 1 auto; gap: 20px; min-height: 0; overflow-y: scroll; padding: 22px 20px; scrollbar-color: #aab7cf transparent; scrollbar-gutter: stable; scrollbar-width: thin; }
    .x-layout-modal .modal-card-body::-webkit-scrollbar { width: 8px; }
    .x-layout-modal .modal-card-body::-webkit-scrollbar-thumb { background: #aab7cf; border: 2px solid transparent; border-radius: 999px; background-clip: padding-box; }
    .x-layout-section { display: grid; gap: 12px; padding: 15px; border: 1px solid #e8edf5; border-radius: 10px; background: #fbfcff; }
    .x-layout-section-title { margin: 0; color: #344055; font-size: 13px; font-weight: 700; }
    .x-layout-field { display: grid; grid-template-columns: 92px 1fr 56px; align-items: center; gap: 12px; color: #596579; font-size: 13px; }
    .x-layout-field input { width: 100%; accent-color: #3273dc; }
    .x-layout-field output { padding: 3px 7px; border-radius: 5px; background: #edf3ff; color: #2859a5; font-variant-numeric: tabular-nums; text-align: center; }
    .x-layout-background-row { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 12px; color: #596579; font-size: 13px; }
    .x-layout-preset { width: 100%; height: 34px; border: 1px solid #d9e1ee; border-radius: 7px; padding: 0 9px; background: #fff; color: #363636; }
    .x-layout-preview { height: 48px; border-radius: 8px; background: linear-gradient(120deg, var(--x-preview-1), var(--x-preview-2), var(--x-preview-3), var(--x-preview-4)); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .5); }
    .x-layout-keyword-row { display: grid; grid-template-columns: 92px 1fr; align-items: start; gap: 12px; color: #596579; font-size: 13px; }
    .x-layout-keyword-content { display: grid; gap: 8px; }
    .x-layout-keyword-chips { display: flex; flex-wrap: wrap; gap: 6px; min-height: 25px; }
    .x-layout-keyword-chip { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; padding: 3px 5px 3px 8px; border-radius: 999px; background: #e9f1ff; color: #2859a5; line-height: 18px; }
    .x-layout-keyword-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .x-layout-keyword-chip button { width: 17px; height: 17px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; font-size: 16px; line-height: 15px; }
    .x-layout-keyword-chip button:hover { background: rgb(40 89 165 / .14); }
    .x-layout-keyword-entry { display: flex; gap: 6px; }
    .x-layout-keyword-entry textarea { flex: 1 1 auto; width: 100%; min-width: 0; height: 32px; resize: vertical; border: 1px solid #d9e1ee; border-radius: 7px; padding: 6px 9px; outline-color: #3273dc; }
    .x-layout-keyword-entry .button { flex: 0 0 auto; height: 32px; }
    .x-layout-keyword-hint { margin: 0; color: #8792a5; font-size: 12px; line-height: 1.45; }
    .x-layout-score-number { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 12px; color: #596579; font-size: 13px; }
    .x-layout-score-number input { width: 100%; height: 32px; border: 1px solid #d9e1ee; border-radius: 7px; padding: 0 9px; outline-color: #3273dc; }
    .x-layout-score-color { display: grid; grid-template-columns: 92px 44px 1fr; align-items: center; gap: 12px; color: #596579; font-size: 13px; }
    .x-layout-score-color input { width: 40px; height: 28px; padding: 1px; border: 1px solid #d9e1ee; border-radius: 6px; background: #fff; cursor: pointer; }
    .x-layout-score-color code { color: #53627a; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
    .x-layout-score-check { display: flex; align-items: center; gap: 8px; color: #596579; font-size: 13px; cursor: pointer; }
    .x-layout-score-check input { accent-color: #3273dc; }
    .x-layout-visibility-checks { display: grid; gap: 9px; }
    .x-layout-visibility-check { display: grid; grid-template-columns: auto 1fr; align-items: start; gap: 8px; color: #596579; font-size: 13px; cursor: pointer; }
    .x-layout-visibility-check input { margin-top: 3px; accent-color: #3273dc; }
    .x-layout-visibility-check strong { display: block; color: #46536a; font-weight: 600; }
    .x-layout-visibility-check small { display: block; margin-top: 2px; color: #8792a5; font-size: 12px; line-height: 1.4; }
    .x-layout-score-subtitle { margin: 4px 0 -3px; color: #52637d; font-size: 12px; font-weight: 700; }
    .x-layout-score-actions { display: flex; justify-content: flex-end; }
    .x-layout-modal .modal-card-foot { flex: 0 0 auto; justify-content: flex-end; gap: 8px; padding: 14px 20px; }
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
    // A colored match frame is 0.375rem thick, so its outer radius must include that thickness.
    root.style.setProperty("--x-layout-match-radius", `${config.cardRadius ? config.cardRadius + 6 : 0}px`);
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

  const scoreNumberField = ({ id, label, value }) => `
    <label class="x-layout-score-number" for="${id}"><span>${label}</span><input id="${id}" type="number" min="0" max="10000000" step="1" value="${value}"></label>`;

  const scoreColorField = ({ id, label, value }) => `
    <label class="x-layout-score-color" for="${id}"><span>${label}</span><input id="${id}" type="color" value="${value}"><code>${value}</code></label>`;

  const keywordField = ({ kind, label, placeholder }) => `
    <div class="x-layout-keyword-row" data-keyword-kind="${kind}">
      <span>${label}</span>
      <div class="x-layout-keyword-content">
        <div class="x-layout-keyword-chips" data-keyword-chips="${kind}"></div>
        <div class="x-layout-keyword-entry">
          <textarea rows="1" data-keyword-input="${kind}" placeholder="${placeholder}"></textarea>
          <button class="button is-small" type="button" data-keyword-add="${kind}">添加</button>
        </div>
      </div>
    </div>`;

  const visibilityCheckField = ({ id, label, hint, checked }) => `
    <label class="x-layout-visibility-check" for="${id}">
      <input id="${id}" type="checkbox" ${checked ? "checked" : ""}>
      <span><strong>${label}</strong><small>${hint}</small></span>
    </label>`;

  const renderModal = (scoreConfig, visibilityConfig) => {
    const modal = document.createElement("div");
    modal.className = "modal x-layout-modal";
    modal.innerHTML = `
      <div class="modal-background" data-layout-close></div>
      <div class="modal-card">
        <header class="modal-card-head">
          <p class="modal-card-title">全局设置</p>
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
            ${field({ id: "x-layout-background-speed", label: "\u52a8\u6001\u901f\u7387", min: 0, max: 1, step: 0.05, suffix: "\u00d7", value: config.backgroundSpeed })}
            <div class="x-layout-preview" aria-label="\u5f53\u524d\u6e10\u53d8\u914d\u8272\u9884\u89c8"></div>
          </div>
          <div class="x-layout-section">
            <p class="x-layout-section-title">过滤显示</p>
            <div class="x-layout-visibility-checks">
              ${visibilityCheckField({ id: "x-filter-search-safe-mode", label: "搜索结果安全模式", hint: "搜索页默认显示关键词和评分命中结果；手动屏蔽可通过“审查屏蔽”临时查看。", checked: visibilityConfig.searchSafeMode })}
              ${visibilityCheckField({ id: "x-filter-keyword-enabled", label: "关键词过滤", hint: "隐藏标题或标签命中关键词的影片。", checked: visibilityConfig.keywordFilterEnabled })}
              ${visibilityCheckField({ id: "x-filter-score-enabled", label: "评分筛选", hint: "应用低评分或低票数的隐藏规则；评分高亮不受此开关影响。", checked: visibilityConfig.scoreFilterEnabled })}
              ${visibilityCheckField({ id: "x-filter-manual-block-enabled", label: "手动屏蔽", hint: "隐藏通过右键手动屏蔽的影片；可在工具栏“屏蔽管理”中恢复。", checked: visibilityConfig.manualBlockFilterEnabled })}
            </div>
          </div>
          <div class="x-layout-section">
            <p class="x-layout-section-title">\u8bc4\u5206\u7b5b\u9009</p>
            <p class="x-layout-score-subtitle">\u4f4e\u5206 / \u6837\u672c\u89c4\u5219</p>
            ${field({ id: "x-score-low-rating", label: "\u4f4e\u5206\u9608\u503c", min: 0, max: 5, step: 0.1, suffix: "\u5206", value: scoreConfig.lowRating })}
            ${field({ id: "x-score-weak-rating", label: "\u6837\u672c\u9608\u503c", min: 0, max: 5, step: 0.1, suffix: "\u5206", value: scoreConfig.weakRating })}
            ${scoreNumberField({ id: "x-score-low-votes", label: "\u4f4e\u5206\u7968\u6570", value: scoreConfig.lowVotes })}
            ${scoreNumberField({ id: "x-score-weak-votes", label: "\u6837\u672c\u7968\u6570", value: scoreConfig.weakVotes })}
            ${field({ id: "x-score-low-visibility", label: "\u4f4e\u5206\u53ef\u89c1\u5ea6", min: 0, max: 100, step: 1, suffix: "%", value: scoreConfig.lowVisibility })}
            ${field({ id: "x-score-weak-visibility", label: "\u6837\u672c\u53ef\u89c1\u5ea6", min: 0, max: 100, step: 1, suffix: "%", value: scoreConfig.weakVisibility })}
            <label class="x-layout-score-check"><input id="x-score-western-bypass" type="checkbox" ${scoreConfig.westernBypass ? "checked" : ""}>\u897f\u65b9\u65e5\u671f\u7f16\u53f7\u8df3\u8fc7\u4f4e\u5206\u7b5b\u9009</label>
            <p class="x-layout-score-subtitle">\u666e\u901a\u9ad8\u4eae</p>
            ${field({ id: "x-score-highlight-rating", label: "\u9ad8\u4eae\u8bc4\u5206", min: 0, max: 5, step: 0.1, suffix: "\u5206", value: scoreConfig.highlightRating })}
            ${scoreNumberField({ id: "x-score-highlight-votes", label: "\u9ad8\u4eae\u7968\u6570", value: scoreConfig.highlightVotes })}
            ${scoreColorField({ id: "x-score-highlight-start", label: "\u666e\u901a\u9ad8\u4eae\u8d77\u8272", value: scoreConfig.highlightStart })}
            ${scoreColorField({ id: "x-score-highlight-end", label: "\u666e\u901a\u9ad8\u4eae\u6b62\u8272", value: scoreConfig.highlightEnd })}
            <p class="x-layout-score-subtitle">\u9876\u7ea7\u9ad8\u4eae</p>
            ${field({ id: "x-score-top-rating", label: "\u9876\u7ea7\u8bc4\u5206", min: 0, max: 5, step: 0.1, suffix: "\u5206", value: scoreConfig.topRating })}
            ${scoreNumberField({ id: "x-score-top-votes", label: "\u9876\u7ea7\u7968\u6570", value: scoreConfig.topVotes })}
            ${scoreColorField({ id: "x-score-top-start", label: "\u9876\u7ea7\u9ad8\u4eae\u8d77\u8272", value: scoreConfig.topStart })}
            ${scoreColorField({ id: "x-score-top-end", label: "\u9876\u7ea7\u9ad8\u4eae\u6b62\u8272", value: scoreConfig.topEnd })}
            <p class="x-layout-keyword-hint">\u4f4e\u8d28\uff1a\u8bc4\u5206 &lt; \u4f4e\u5206\u9608\u503c\uff0c\u6216\uff08\u8bc4\u5206 &lt;= \u6837\u672c\u9608\u503c\u4e14\u7968\u6570 &lt; \u4f4e\u5206\u7968\u6570\uff09\uff1b\u6837\u672c\uff1a\u8bc4\u5206 &gt;= \u6837\u672c\u9608\u503c\u4e14\u7968\u6570 &lt; \u6837\u672c\u7968\u6570\uff1b\u9ad8\u4eae\uff1a\u8bc4\u5206 &gt; \u9ad8\u4eae\u8bc4\u5206\u4e14\u7968\u6570 &gt; \u9ad8\u4eae\u7968\u6570\uff1b\u9876\u7ea7\u89c4\u5219\u4f18\u5148\u3002</p>
            <div class="x-layout-score-actions"><button class="button is-small is-light" type="button" data-score-reset>\u91cd\u7f6e\u8bc4\u5206\u89c4\u5219</button></div>
          </div>
          <div class="x-layout-section">
            <p class="x-layout-section-title">关键词过滤</p>
            ${keywordField({ kind: "titleKeywords", label: "标题关键词", placeholder: "输入后按 Enter、逗号或换行添加" })}
            ${keywordField({ kind: "tagKeywords", label: "标签关键词", placeholder: "输入后按 Enter、逗号或换行添加" })}
            <p class="x-layout-keyword-hint">支持批量粘贴；添加或删除关键词后会立即重新筛选当前卡片。</p>
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

    let scoreConfig = readScoreConfig();
    let visibilityConfig = readVisibilityConfig();
    const modal = renderModal(scoreConfig, visibilityConfig);
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
    const scoreInputs = {
      lowRating: modal.querySelector("#x-score-low-rating"), weakRating: modal.querySelector("#x-score-weak-rating"),
      lowVotes: modal.querySelector("#x-score-low-votes"), weakVotes: modal.querySelector("#x-score-weak-votes"),
      highlightRating: modal.querySelector("#x-score-highlight-rating"), highlightVotes: modal.querySelector("#x-score-highlight-votes"),
      highlightStart: modal.querySelector("#x-score-highlight-start"), highlightEnd: modal.querySelector("#x-score-highlight-end"),
      topRating: modal.querySelector("#x-score-top-rating"), topVotes: modal.querySelector("#x-score-top-votes"),
      topStart: modal.querySelector("#x-score-top-start"), topEnd: modal.querySelector("#x-score-top-end"),
      lowVisibility: modal.querySelector("#x-score-low-visibility"), weakVisibility: modal.querySelector("#x-score-weak-visibility"),
      westernBypass: modal.querySelector("#x-score-western-bypass"),
    };
    const visibilityInputs = {
      searchSafeMode: modal.querySelector("#x-filter-search-safe-mode"),
      keywordFilterEnabled: modal.querySelector("#x-filter-keyword-enabled"),
      scoreFilterEnabled: modal.querySelector("#x-filter-score-enabled"),
      manualBlockFilterEnabled: modal.querySelector("#x-filter-manual-block-enabled"),
    };
    const keywordInputs = {
      titleKeywords: modal.querySelector('[data-keyword-input="titleKeywords"]'),
      tagKeywords: modal.querySelector('[data-keyword-input="tagKeywords"]'),
    };
    let keywordConfig = readKeywordConfig();

    const renderKeywordChips = () => {
      Object.entries(keywordInputs).forEach(([kind, input]) => {
        const chips = modal.querySelector(`[data-keyword-chips="${kind}"]`);
        chips.replaceChildren(...keywordConfig[kind].map((keyword) => {
          const chip = document.createElement("span");
          chip.className = "x-layout-keyword-chip";
          const text = document.createElement("span");
          text.textContent = keyword;
          const remove = document.createElement("button");
          remove.type = "button";
          remove.title = `删除 ${keyword}`;
          remove.setAttribute("aria-label", `删除 ${keyword}`);
          remove.dataset.keywordRemove = keyword;
          remove.textContent = "×";
          chip.append(text, remove);
          return chip;
        }));
        input.value = "";
      });
    };

    const setKeywords = (kind, values) => {
      keywordConfig = writeKeywordConfig({ ...keywordConfig, [kind]: values });
      renderKeywordChips();
    };

    const commitKeywordInput = (kind) => {
      const input = keywordInputs[kind];
      const additions = normalizeKeywords(input.value);
      if (!additions.length) return;
      setKeywords(kind, [...keywordConfig[kind], ...additions]);
    };

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
      backgroundSpeed: clamp(inputs.backgroundSpeed.value, 0, 1),
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

    const syncScoreOutputs = () => {
      [[scoreInputs.lowRating, "\u5206"], [scoreInputs.weakRating, "\u5206"], [scoreInputs.highlightRating, "\u5206"], [scoreInputs.topRating, "\u5206"], [scoreInputs.lowVisibility, "%"], [scoreInputs.weakVisibility, "%"]].forEach(([input, suffix]) => {
        input.nextElementSibling.textContent = `${input.value}${suffix}`;
      });
      ["highlightStart", "highlightEnd", "topStart", "topEnd"].forEach((key) => {
        scoreInputs[key].nextElementSibling.textContent = scoreInputs[key].value.toLowerCase();
      });
    };
    const readScoreInputs = () => normalizeScoreConfig({
      lowRating: scoreInputs.lowRating.value, weakRating: scoreInputs.weakRating.value,
      lowVotes: scoreInputs.lowVotes.value, weakVotes: scoreInputs.weakVotes.value,
      highlightRating: scoreInputs.highlightRating.value, highlightVotes: scoreInputs.highlightVotes.value,
      highlightStart: scoreInputs.highlightStart.value, highlightEnd: scoreInputs.highlightEnd.value,
      topRating: scoreInputs.topRating.value, topVotes: scoreInputs.topVotes.value,
      topStart: scoreInputs.topStart.value, topEnd: scoreInputs.topEnd.value,
      lowVisibility: scoreInputs.lowVisibility.value, weakVisibility: scoreInputs.weakVisibility.value,
      westernBypass: scoreInputs.westernBypass.checked,
    });
    const setScoreInputs = (next) => {
      Object.entries(next).forEach(([key, value]) => {
        if (key === "westernBypass") scoreInputs[key].checked = value;
        else scoreInputs[key].value = value;
      });
      syncScoreOutputs();
    };
    const previewScoreConfig = () => {
      scoreConfig = writeScoreConfig(readScoreInputs());
      setScoreInputs(scoreConfig);
    };
    const readVisibilityInputs = () => normalizeVisibilityConfig(
      Object.fromEntries(Object.entries(visibilityInputs).map(([key, input]) => [key, input.checked])),
    );
    const setVisibilityInputs = (next) => {
      Object.entries(next).forEach(([key, value]) => { visibilityInputs[key].checked = value; });
    };
    const previewVisibilityConfig = () => {
      visibilityConfig = writeVisibilityConfig(readVisibilityInputs());
      setVisibilityInputs(visibilityConfig);
    };

    syncOutputs();
    syncScoreOutputs();
    setVisibilityInputs(visibilityConfig);
    renderKeywordChips();

    Object.values(inputs).forEach((input) => input.addEventListener("input", () => {
      syncOutputs();
      applyConfig(readInputs());
    }));
    inputs.backgroundPreset.addEventListener("change", () => {
      syncOutputs();
      applyConfig(readInputs());
    });
    Object.values(scoreInputs).forEach((input) => {
      input.addEventListener(input.type === "number" ? "change" : "input", previewScoreConfig);
    });
    Object.values(visibilityInputs).forEach((input) => input.addEventListener("change", previewVisibilityConfig));

    Object.entries(keywordInputs).forEach(([kind, input]) => {
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.isComposing) return;
        event.preventDefault();
        commitKeywordInput(kind);
      });
      input.addEventListener("input", () => {
        if (/[,，\r\n]/.test(input.value)) commitKeywordInput(kind);
      });
    });
    modal.addEventListener("click", (event) => {
      const addButton = event.target.closest("[data-keyword-add]");
      if (addButton) commitKeywordInput(addButton.dataset.keywordAdd);
      const removeButton = event.target.closest("[data-keyword-remove]");
      if (removeButton) {
        const row = removeButton.closest("[data-keyword-kind]");
        const kind = row?.dataset.keywordKind;
        if (kind) setKeywords(kind, keywordConfig[kind].filter((keyword) => keyword !== removeButton.dataset.keywordRemove));
      }
      if (event.target.closest("[data-score-reset]")) {
        scoreConfig = writeScoreConfig(DEFAULT_SCORE_CONFIG);
        setScoreInputs(scoreConfig);
      }
    });

    trigger.addEventListener("click", () => {
      keywordConfig = readKeywordConfig();
      scoreConfig = readScoreConfig();
      visibilityConfig = readVisibilityConfig();
      renderKeywordChips();
      setScoreInputs(scoreConfig);
      setVisibilityInputs(visibilityConfig);
      modal.classList.add("is-active");
    });
    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-layout-close]")) modal.classList.remove("is-active");
      if (event.target.closest("[data-layout-save]")) {
        Object.keys(keywordInputs).forEach(commitKeywordInput);
        config = readInputs();
        writeConfig(config);
        applyConfig(config);
        scoreConfig = writeScoreConfig(readScoreInputs());
        setScoreInputs(scoreConfig);
        visibilityConfig = writeVisibilityConfig(readVisibilityInputs());
        setVisibilityInputs(visibilityConfig);
        modal.classList.remove("is-active");
      }
      if (event.target.closest("[data-layout-reset]")) {
        config = { ...DEFAULT_CONFIG };
        writeConfig(config);
        keywordConfig = writeKeywordConfig(DEFAULT_KEYWORD_CONFIG);
        scoreConfig = writeScoreConfig(DEFAULT_SCORE_CONFIG);
        visibilityConfig = writeVisibilityConfig(DEFAULT_VISIBILITY_CONFIG);
        renderKeywordChips();
        setInputs(config);
        setScoreInputs(scoreConfig);
        setVisibilityInputs(visibilityConfig);
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
