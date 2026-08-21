// ==UserScript==
// @name            JavDB.filter
// @namespace       JavDB.filter@blc
// @version         0.0.21
// @author          blc
// @description     评分筛选与性癖净化
// @match           https://javdb.com/*
// @exclude         https://javdb.com/v/*
// @icon            https://javdb.com/favicon.ico
// @run-at          document-end
// @grant           GM_getValue
// @grant           GM_setValue
// ==/UserScript==

(function () {
  const MANUAL_BLOCK_STORAGE_KEY = "manualBlockedMovies";
  const KEYWORD_CONFIG_STORAGE_KEY = "JavDB.filter.keywordConfig.v1";
  const KEYWORD_CONFIG_EVENT = "JavDB.filter.keywordConfigChanged";
  const SCORE_CONFIG_STORAGE_KEY = "JavDB.filter.scoreConfig.v1";
  const SCORE_CONFIG_EVENT = "JavDB.filter.scoreConfigChanged";
  const VISIBILITY_CONFIG_STORAGE_KEY = "JavDB.filter.visibilityConfig.v1";
  const VISIBILITY_CONFIG_EVENT = "JavDB.filter.visibilityConfigChanged";
  const VISIBILITY_CHANGED_EVENT = "JavDB.filter.visibilityChanged";
  const MENU_ID = "javdb-filter-menu";
  const MANUAL_BLOCK_MANAGER_ID = "javdb-filter-manual-block-manager";
  const FILTER_TOGGLE_ID = "x-score-filter-toggle";
  const PURIFY_TOGGLE_ID = "x-purify-filter-toggle";
  const REVIEW_TOGGLE_ID = "x-filter-review-toggle";
  const MANUAL_BLOCKS_TOGGLE_ID = "x-manual-blocks-toggle";
  const ACTOR_MATCH_TOGGLE_ID = "x-actor-match-toggle";

  let pageReviewEnabled = false;
  let actorMatchedOnly = false;
  let actorMatchLoadQueued = false;

  const DEFAULT_SCORE_CONFIG = Object.freeze({
    lowRating: 3.8,
    weakRating: 4.0,
    lowVotes: 20,
    weakVotes: 30,
    highlightRating: 3.8,
    highlightVotes: 300,
    highlightStart: "#00ffff",
    highlightEnd: "#e0ffff",
    topRating: 4.0,
    topVotes: 1000,
    topStart: "#ff69b4",
    topEnd: "#ffb6c1",
    lowVisibility: 10,
    weakVisibility: 30,
    westernBypass: true,
  });
  const DEFAULT_VISIBILITY_CONFIG = Object.freeze({
    searchSafeMode: true,
    keywordFilterEnabled: true,
    scoreFilterEnabled: true,
    manualBlockFilterEnabled: true,
  });
  const WESTERN_CODE_PATTERN = /[A-Za-z]+[\.\s-]+(20\d{2}|\d{2})[.-]\d{2}[.-]\d{2}/;
  const SCORE_BACKGROUND_PROPERTIES = ["background", "background-image", "background-color", "background-position", "background-size", "background-repeat", "background-origin", "background-clip", "background-attachment"];
  const scoreCardBackgrounds = new WeakMap();
  const isStylableCardBox = (node) => Boolean(
    node?.style
    && typeof node.style.getPropertyValue === "function"
    && typeof node.style.getPropertyPriority === "function"
    && typeof node.style.removeProperty === "function",
  );

  const clampScoreNumber = (value, min, max, fallback, precision = 0) => {
    if (value == null || typeof value === "boolean" || (typeof value === "string" && !value.trim())) return fallback;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    const clamped = Math.min(Math.max(numeric, min), max);
    return precision ? Number(clamped.toFixed(precision)) : Math.round(clamped);
  };
  const normalizeScoreColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || ""))
    ? String(value).toLowerCase()
    : fallback;
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
    try {
      return normalizeScoreConfig(JSON.parse(localStorage.getItem(SCORE_CONFIG_STORAGE_KEY) || "{}"));
    } catch (_) {
      return { ...DEFAULT_SCORE_CONFIG };
    }
  };
  let scoreConfig = readScoreConfig();
  let scoreRefreshQueued = false;
  const normalizeVisibilityConfig = (source = {}) => ({
    searchSafeMode: typeof source.searchSafeMode === "boolean" ? source.searchSafeMode : DEFAULT_VISIBILITY_CONFIG.searchSafeMode,
    keywordFilterEnabled: typeof source.keywordFilterEnabled === "boolean" ? source.keywordFilterEnabled : DEFAULT_VISIBILITY_CONFIG.keywordFilterEnabled,
    scoreFilterEnabled: typeof source.scoreFilterEnabled === "boolean" ? source.scoreFilterEnabled : DEFAULT_VISIBILITY_CONFIG.scoreFilterEnabled,
    manualBlockFilterEnabled: typeof source.manualBlockFilterEnabled === "boolean" ? source.manualBlockFilterEnabled : DEFAULT_VISIBILITY_CONFIG.manualBlockFilterEnabled,
  });
  const readVisibilityConfig = () => {
    try {
      return normalizeVisibilityConfig(JSON.parse(localStorage.getItem(VISIBILITY_CONFIG_STORAGE_KEY) || "{}"));
    } catch (_) {
      return { ...DEFAULT_VISIBILITY_CONFIG };
    }
  };
  let visibilityConfig = readVisibilityConfig();
  const isSearchPage = () => location.pathname.startsWith("/search");
  const isSearchSafeModeActive = () => visibilityConfig.searchSafeMode && isSearchPage();
  const isScoreFilterActive = () => visibilityConfig.scoreFilterEnabled && !isSearchSafeModeActive() && !pageReviewEnabled;
  const isKeywordFilterActive = () => visibilityConfig.keywordFilterEnabled && !isSearchSafeModeActive() && !pageReviewEnabled;
  const isManualBlockFilterActive = () => visibilityConfig.manualBlockFilterEnabled && !pageReviewEnabled;

  const PURIFY_CONFIG = {
    blockedIDs: [],
    blockedTitleKeywords: {
      "重口排泄": ["大便", "尿", "粪", "浣肠", "失禁", "排泄", "失便", "唾"],
      "SM与调教": ["虐", "sm", "m男"],
      "身体特征": ["剛毛", "鼻", "アナル"],
      "年龄体型": ["熟女"],
      "伪娘男娘": ["男の娘", "男娘", "偽娘", "伪娘", "女装男子", "女装子", "ニューハーフ", "ふたなり", "futanari"],
    },
    blockedTags: {
      "题材类别": ["熟女",],
      "重口类别": ["排泄", "猎奇"],
      "跨性别伪娘": ["男の娘", "cross dressing", "cross-dressing", "女装", "ニューハーフ", "transsexual", "shemale", "futanari", "ふたなり"],
    },
  };

  const flatten = (source) => Array.isArray(source) ? source : Object.values(source).flat();
  const normalizeKeywords = (source) => [...new Set(
    flatten(source)
      .flatMap((item) => String(item).split(/[,，\r\n]+/))
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )];
  const DEFAULT_KEYWORD_CONFIG = Object.freeze({
    titleKeywords: normalizeKeywords(PURIFY_CONFIG.blockedTitleKeywords),
    tagKeywords: normalizeKeywords(PURIFY_CONFIG.blockedTags),
  });
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
  const idsToBlock = normalizeKeywords(PURIFY_CONFIG.blockedIDs);
  let titlesToBlock = [];
  let tagsToBlock = [];
  const refreshKeywordConfig = () => {
    const next = readKeywordConfig();
    titlesToBlock = next.titleKeywords;
    tagsToBlock = next.tagKeywords;
  };
  refreshKeywordConfig();
  const loadManualBlocks = () => {
    try {
      const saved = typeof GM_getValue === "function"
        ? GM_getValue(MANUAL_BLOCK_STORAGE_KEY, [])
        : JSON.parse(localStorage.getItem(MANUAL_BLOCK_STORAGE_KEY) || "[]");
      return new Set(Array.isArray(saved) ? saved : []);
    } catch (_) {
      return new Set();
    }
  };
  const manuallyBlockedMovies = loadManualBlocks();

  const saveManualBlocks = () => {
    const value = [...manuallyBlockedMovies];
    if (typeof GM_setValue === "function") {
      GM_setValue(MANUAL_BLOCK_STORAGE_KEY, value);
    } else {
      localStorage.setItem(MANUAL_BLOCK_STORAGE_KEY, JSON.stringify(value));
    }
  };

  const getText = (node, selector) => node.querySelector(selector)?.textContent.trim() || "";

  const getCardTitle = (titleNode) => {
    if (!titleNode) return "";
    const clone = titleNode.cloneNode(true);
    clone.querySelector("strong")?.remove();
    return clone.textContent.trim();
  };
  const getCardTags = (item) => [...item.querySelectorAll(".tags a, .tags .tag")]
    .map((node) => node.textContent.trim().toLowerCase())
    .filter(Boolean);

  const parseCard = (item) => {
    const titleNode = item.querySelector(".video-title");
    const code = titleNode?.querySelector("strong")?.textContent.trim() || getText(item, ".uid");
    // The number is rendered inside .video-title too.  Keeping it out of title
    // matching prevents a code such as SMD-123 from accidentally matching "sm".
    const title = getCardTitle(titleNode) || getText(item, ".title");
    const score = getText(item, ".score .value") || getText(item, ".value");
    return {
      code,
      title,
      score,
      tags: getCardTags(item),
      fullText: `${code} ${title}`,
    };
  };

  const getMovieKey = (item, details = parseCard(item)) => {
    const href = item.matches("a[href*='/v/']")
      ? item.href
      : item.querySelector("a[href*='/v/']")?.href;
    const movieId = href && new URL(href, location.origin).pathname.match(/^\/v\/([^/?#]+)/)?.[1];
    const code = String(details.code || "").trim().toLowerCase();
    return movieId ? `id:${movieId.toLowerCase()}` : `code:${code}`;
  };

  const parseScore = (text) => {
    const values = String(text).match(/\d+(?:\.\d+)?/g);
    if (!values || values.length < 2) return null;
    return {
      rating: Number.parseFloat(values[0]),
      votes: Number.parseInt(values[1], 10),
    };
  };

  const isShortAsciiKeyword = (keyword) => /^[a-z0-9]{1,2}$/i.test(keyword);
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matchesTitleKeyword = (title, keyword) => {
    if (!isShortAsciiKeyword(keyword)) return title.includes(keyword);
    const escaped = escapeRegExp(keyword);
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(title);
  };
  const getPurifyReason = ({ code, title, tags }) => {
    const idText = code.toLowerCase();
    const titleText = title.toLowerCase();
    const blockedId = idsToBlock.find((id) => idText === id);
    if (blockedId) return { type: "id", keyword: blockedId, label: `编号 ${blockedId}` };

    // Short Latin keywords need explicit boundaries, otherwise a code such as
    // SMD-123 is accidentally treated as an SM title match.
    const titleKeyword = titlesToBlock.find((keyword) => matchesTitleKeyword(titleText, keyword));
    if (titleKeyword) return { type: "title", keyword: titleKeyword, label: `标题 ${titleKeyword}` };

    const tagKeyword = tagsToBlock.find((keyword) => tags.includes(keyword));
    return tagKeyword ? { type: "tag", keyword: tagKeyword, label: `标签 ${tagKeyword}` } : null;
  };

  const restoreScoreBackground = (cardBox) => {
    if (!isStylableCardBox(cardBox)) return;
    const original = scoreCardBackgrounds.get(cardBox);
    if (!original) return;
    SCORE_BACKGROUND_PROPERTIES.forEach((property) => cardBox.style.removeProperty(property));
    original.forEach(({ property, value, priority }) => {
      if (value) cardBox.style.setProperty(property, value, priority);
    });
  };

  const applyScoreFilter = (item, details) => {
    const cardBox = item.children?.[0];
    const canStyleCardBox = isStylableCardBox(cardBox);
    item.classList.remove("x-score-mask-low", "x-score-mask-weak", "x-score-filtered");
    delete item.dataset.filterScoreMatch;
    if (canStyleCardBox) {
      if (!scoreCardBackgrounds.has(cardBox)) {
        scoreCardBackgrounds.set(cardBox, SCORE_BACKGROUND_PROPERTIES.map((property) => ({
          property,
          value: cardBox.style.getPropertyValue(property),
          priority: cardBox.style.getPropertyPriority(property),
        })));
      }
      restoreScoreBackground(cardBox);
    }

    const score = parseScore(details.score);
    if (!score) return "";

    const { rating, votes } = score;
    const isWestern = WESTERN_CODE_PATTERN.test(details.fullText);
    let reason = "";
    if (!(scoreConfig.westernBypass && isWestern)) {
      if (rating < scoreConfig.lowRating || (rating <= scoreConfig.weakRating && votes < scoreConfig.lowVotes)) {
        item.classList.add("x-score-mask-low", "x-score-filtered");
        reason = "低分/低票";
      } else if (rating >= scoreConfig.weakRating && votes < scoreConfig.weakVotes) {
        item.classList.add("x-score-mask-weak", "x-score-filtered");
        reason = "低票";
      }
    }
    if (reason) item.dataset.filterScoreMatch = "1";

    if (rating > scoreConfig.topRating && votes > scoreConfig.topVotes && canStyleCardBox) {
      cardBox.style.background = `linear-gradient(${scoreConfig.topStart} 50%, ${scoreConfig.topEnd} 100%)`;
    } else if (rating > scoreConfig.highlightRating && votes > scoreConfig.highlightVotes && canStyleCardBox) {
      cardBox.style.background = `linear-gradient(${scoreConfig.highlightStart} 50%, ${scoreConfig.highlightEnd} 100%)`;
    }
    return reason;
  };

  const applyPurify = (item, details) => {
    const movieKey = getMovieKey(item, details);
    const manuallyBlocked = movieKey !== "code:" && manuallyBlockedMovies.has(movieKey);
    const keywordReason = getPurifyReason(details);

    // Remove legacy effective-hidden markers.  Match115 now relies on actual
    // computed visibility, while these new classes retain the reversible reason.
    item.classList.remove("x-purify-keyword-hidden");
    delete item.dataset.purifyKeywordHidden;
    item.classList.toggle("x-purify-keyword-match", Boolean(keywordReason));
    item.classList.toggle("x-manual-blocked", manuallyBlocked);
    if (keywordReason) item.dataset.filterKeywordMatch = keywordReason.label;
    else delete item.dataset.filterKeywordMatch;
    if (manuallyBlocked) item.dataset.filterManualBlock = movieKey;
    else delete item.dataset.filterManualBlock;
    return { manuallyBlocked, keywordReason };
  };

  const updateFilterReasons = (item, { manuallyBlocked, keywordReason }, scoreReason) => {
    const reasons = [];
    if (manuallyBlocked) reasons.push("手动屏蔽");
    if (keywordReason) reasons.push(keywordReason.label);
    if (scoreReason) reasons.push(scoreReason);
    if (reasons.length) item.dataset.filterReasons = reasons.join(" · ");
    else delete item.dataset.filterReasons;
  };

  const processCards = (list) => {
    [...list].forEach((item) => {
      try {
        if (!(item instanceof Element)) return;
        const details = parseCard(item);
        const purifyResult = applyPurify(item, details);
        const scoreReason = applyScoreFilter(item, details);
        updateFilterReasons(item, purifyResult, scoreReason);
      } catch (error) {
        // A malformed card must not break JavDB.scroll's own load-more cycle.
        console.warn("[JavDB.filter] skip card", error);
      }
    });
  };

  const refreshKeywordFilteredCards = () => {
    refreshKeywordConfig();
    processCards(document.querySelectorAll(".movie-list .item"));
    updateReviewToggle();
    queueVisibilityChanged();
  };

  const observeIncomingMovieCards = () => {
    const movieList = document.querySelector(".movie-list");
    if (!movieList) return;

    new MutationObserver((mutations) => {
      const incoming = mutations.flatMap(({ addedNodes }) => [...addedNodes].flatMap((node) => {
        if (!(node instanceof Element)) return [];
        if (node.matches(".item")) return [node];
        return [...node.querySelectorAll(".item")];
      }));
      if (!incoming.length) return;
      processCards(incoming);
      updateReviewToggle();
      queueMoreActorWorksIfNeeded();
    }).observe(movieList, { childList: true });
  };

  const applyScoreMaskVisibility = (next = scoreConfig) => {
    const root = document.documentElement;
    root.style.setProperty("--x-score-low-mask-opacity", String(1 - next.lowVisibility / 100));
    root.style.setProperty("--x-score-weak-mask-opacity", String(1 - next.weakVisibility / 100));
  };
  const scheduleScoreRefresh = () => {
    if (scoreRefreshQueued) return;
    scoreRefreshQueued = true;
    requestAnimationFrame(() => {
      scoreRefreshQueued = false;
      processCards(document.querySelectorAll(".movie-list .item"));
      updateReviewToggle();
      queueVisibilityChanged();
    });
  };
  const refreshScoreConfig = (next) => {
    scoreConfig = normalizeScoreConfig(next || readScoreConfig());
    applyScoreMaskVisibility(scoreConfig);
    scheduleScoreRefresh();
  };

  const filterStyle = document.createElement("style");
  filterStyle.textContent = `
    html.x-purify-filter-active .movie-list .item.x-purify-keyword-match { display: none !important; }
    html.x-manual-block-filter-active .movie-list .item.x-manual-blocked { display: none !important; }
    .x-score-mask-low::after { opacity: var(--x-score-low-mask-opacity, .9) !important; }
    .x-score-mask-weak::after { opacity: var(--x-score-weak-mask-opacity, .7) !important; }
    html:not(.x-score-filter-active) .x-score-mask-low::after,
    html:not(.x-score-filter-active) .x-score-mask-weak::after { opacity: 0 !important; }
    html.x-filter-review-active .movie-list .item[data-filter-reasons] { position: relative !important; }
    html.x-filter-review-active .movie-list .item[data-filter-reasons]::before {
      position: absolute; z-index: 20; top: 5px; left: 5px; max-width: calc(100% - 10px);
      padding: 3px 6px; border-radius: 4px; color: #fff; background: rgb(54 54 54 / .82);
      font-size: 11px; line-height: 1.25; pointer-events: none; content: attr(data-filter-reasons);
    }
  `;
  document.head.append(filterStyle);

  let visibilityChangeQueued = false;
  const queueVisibilityChanged = () => {
    if (visibilityChangeQueued) return;
    visibilityChangeQueued = true;
    requestAnimationFrame(() => {
      visibilityChangeQueued = false;
      window.dispatchEvent(new CustomEvent(VISIBILITY_CHANGED_EVENT, {
        detail: {
          searchSafeMode: isSearchSafeModeActive(),
          pageReviewEnabled,
          scoreFilterEnabled: isScoreFilterActive(),
          keywordFilterEnabled: isKeywordFilterActive(),
          manualBlockFilterEnabled: isManualBlockFilterActive(),
        },
      }));
    });
  };
  const getMatchedFilterCardCount = () => [...document.querySelectorAll(".movie-list .item")].filter((item) => (
    item.classList.contains("x-purify-keyword-match")
    || item.classList.contains("x-manual-blocked")
    || item.dataset.filterScoreMatch === "1"
  )).length;
  const isCardHiddenByActiveFilter = (item) => (
    (isScoreFilterActive() && item.classList.contains("x-score-filtered"))
    || (isKeywordFilterActive() && item.classList.contains("x-purify-keyword-match"))
    || (isManualBlockFilterActive() && item.classList.contains("x-manual-blocked"))
  );

  const refreshFilterVisibility = () => {
    const root = document.documentElement;
    root.classList.toggle("x-score-filter-active", isScoreFilterActive());
    root.classList.toggle("x-purify-filter-active", isKeywordFilterActive());
    root.classList.toggle("x-manual-block-filter-active", isManualBlockFilterActive());
    root.classList.toggle("x-search-safe-mode", isSearchSafeModeActive());
    root.classList.toggle("x-filter-review-active", pageReviewEnabled);
    processCards(document.querySelectorAll(".movie-list .item"));
    updateScoreFilterToggle();
    updatePurifyFilterToggle();
    updateReviewToggle();
    updateManualBlocksToggle();
    queueMoreActorWorksIfNeeded();
    queueVisibilityChanged();
  };
  const updateVisibilityConfig = (change) => {
    const next = normalizeVisibilityConfig({ ...visibilityConfig, ...change });
    localStorage.setItem(VISIBILITY_CONFIG_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(VISIBILITY_CONFIG_EVENT, { detail: next }));
  };
  const refreshVisibilityConfig = (next) => {
    visibilityConfig = normalizeVisibilityConfig(next || readVisibilityConfig());
    refreshFilterVisibility();
  };

  const updateScoreFilterToggle = () => {
    const button = document.getElementById(FILTER_TOGGLE_ID);
    if (!button) return;
    const enabled = visibilityConfig.scoreFilterEnabled;
    button.textContent = enabled ? "\u8bc4\u5206\uff1a\u7b5b\u9009" : "\u8bc4\u5206\uff1a\u663e\u793a";
    button.classList.toggle("is-filter-active", enabled);
    button.classList.toggle("is-filter-inactive", !enabled);
    button.setAttribute("aria-pressed", String(enabled));
    button.title = isSearchSafeModeActive() ? "\u641c\u7d22\u5b89\u5168\u6a21\u5f0f\u4e2d\uff0c\u672c\u9875\u4e0d\u9690\u85cf\u8bc4\u5206\u547d\u4e2d\u7ed3\u679c" : "\u5207\u6362\u8bc4\u5206\u7b5b\u9009";
  };

  const setScoreFilterEnabled = (enabled) => {
    updateVisibilityConfig({ scoreFilterEnabled: Boolean(enabled) });
  };

  const initScoreFilterToggle = () => {
    const toolbar = document.querySelector(".toolbar");
    if (!toolbar || document.getElementById(FILTER_TOGGLE_ID)) return Boolean(toolbar);

    const toggle = document.createElement("button");
    toggle.id = FILTER_TOGGLE_ID;
    toggle.type = "button";
    // Match JavDB's native toolbar button shape exactly; the extra class is styling only.
    toggle.className = "button is-small x-score-filter-toggle";
    toggle.dataset.filterAction = "score";
    toggle.addEventListener("click", () => setScoreFilterEnabled(!visibilityConfig.scoreFilterEnabled));
    // Keep the filter control after every native toolbar control.
    toolbar.append(toggle);
    updateScoreFilterToggle();
    return true;
  };

  const updatePurifyFilterToggle = () => {
    const button = document.getElementById(PURIFY_TOGGLE_ID);
    if (!button) return;
    const enabled = visibilityConfig.keywordFilterEnabled;
    button.textContent = enabled ? "\u51c0\u5316\uff1a\u7b5b\u9009" : "\u51c0\u5316\uff1a\u663e\u793a";
    button.classList.toggle("is-filter-active", enabled);
    button.classList.toggle("is-filter-inactive", !enabled);
    button.setAttribute("aria-pressed", String(enabled));
    button.title = isSearchSafeModeActive() ? "\u641c\u7d22\u5b89\u5168\u6a21\u5f0f\u4e2d\uff0c\u672c\u9875\u4e0d\u9690\u85cf\u5173\u952e\u8bcd\u547d\u4e2d\u7ed3\u679c" : "\u5207\u6362\u5173\u952e\u8bcd\u8fc7\u6ee4";
  };
  const setPurifyFilterEnabled = (enabled) => {
    updateVisibilityConfig({ keywordFilterEnabled: Boolean(enabled) });
  };
  const initPurifyFilterToggle = () => {
    const toolbar = document.querySelector(".toolbar");
    if (!toolbar || document.getElementById(PURIFY_TOGGLE_ID)) return Boolean(toolbar);

    const toggle = document.createElement("button");
    toggle.id = PURIFY_TOGGLE_ID;
    toggle.type = "button";
    toggle.className = "button is-small x-purify-filter-toggle";
    toggle.dataset.filterAction = "purify";
    toggle.addEventListener("click", () => setPurifyFilterEnabled(!visibilityConfig.keywordFilterEnabled));
    toolbar.append(toggle);
    updatePurifyFilterToggle();
    return true;
  };

  const updateReviewToggle = () => {
    const button = document.getElementById(REVIEW_TOGGLE_ID);
    if (!button) return;
    const count = getMatchedFilterCardCount();
    button.textContent = pageReviewEnabled
      ? "\u7ed3\u675f\u5ba1\u67e5"
      : `${isSearchSafeModeActive() ? "\u5ba1\u67e5\u5c4f\u853d" : "\u67e5\u770b\u9690\u85cf"}${count ? ` (${count})` : ""}`;
    button.classList.toggle("is-filter-active", pageReviewEnabled);
    button.classList.toggle("is-filter-inactive", !pageReviewEnabled);
    button.setAttribute("aria-pressed", String(pageReviewEnabled));
    button.title = pageReviewEnabled
      ? "\u6062\u590d\u5f53\u524d\u9875\u7684\u8fc7\u6ee4\u663e\u793a\u89c4\u5219"
      : "\u4e34\u65f6\u663e\u793a\u624b\u52a8\u5c4f\u853d\u4e0e\u81ea\u52a8\u547d\u4e2d\u7684\u7ed3\u679c\uff0c\u4e0d\u4f1a\u4fdd\u5b58\u8be5\u64cd\u4f5c";
  };
  const setPageReviewEnabled = (enabled) => {
    pageReviewEnabled = Boolean(enabled);
    refreshFilterVisibility();
  };
  const initReviewToggle = () => {
    if (!isSearchPage()) return true;
    const toolbar = document.querySelector(".toolbar");
    if (!toolbar || document.getElementById(REVIEW_TOGGLE_ID)) return Boolean(toolbar);

    const toggle = document.createElement("button");
    toggle.id = REVIEW_TOGGLE_ID;
    toggle.type = "button";
    toggle.className = "button is-small x-filter-review-toggle";
    toggle.dataset.filterAction = "review";
    toggle.addEventListener("click", () => setPageReviewEnabled(!pageReviewEnabled));
    toolbar.append(toggle);
    updateReviewToggle();
    return true;
  };

  const closeManualBlockManager = () => document.getElementById(MANUAL_BLOCK_MANAGER_ID)?.remove();
  const updateManualBlocksToggle = () => {
    const button = document.getElementById(MANUAL_BLOCKS_TOGGLE_ID);
    if (!button) return;
    button.textContent = `\u5c4f\u853d\u7ba1\u7406${manuallyBlockedMovies.size ? ` (${manuallyBlockedMovies.size})` : ""}`;
    button.setAttribute("aria-label", `\u7ba1\u7406 ${manuallyBlockedMovies.size} \u6761\u624b\u52a8\u5c4f\u853d`);
  };
  const showManualBlockManager = () => {
    closeManualBlockManager();
    const manager = document.createElement("div");
    manager.id = MANUAL_BLOCK_MANAGER_ID;
    manager.setAttribute("role", "dialog");
    manager.setAttribute("aria-modal", "true");
    manager.innerHTML = `
      <div class="x-filter-manager-title">\u624b\u52a8\u5c4f\u853d\u7ba1\u7406</div>
      <div class="x-filter-manager-text">\u53d6\u6d88\u540e\uff0c\u5f53\u524d\u9875\u4f1a\u7acb\u5373\u6309\u73b0\u6709\u89c4\u5219\u91cd\u65b0\u663e\u793a\u3002</div>
      <div class="x-filter-manager-list"></div>
      <div class="x-filter-manager-actions">
        <button type="button" class="button is-small is-warning" data-clear>\u6e05\u7a7a\u5168\u90e8</button>
        <button type="button" class="button is-small" data-close>\u5173\u95ed</button>
      </div>`;
    Object.assign(manager.style, {
      position: "fixed", zIndex: "100000", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
      width: "min(440px, calc(100vw - 24px))", maxHeight: "min(560px, calc(100vh - 24px))", overflow: "hidden",
      padding: "14px", background: "#fff", border: "1px solid #dbdbdb", borderRadius: "8px",
      boxShadow: "0 12px 32px rgba(10, 10, 10, .24)", color: "#363636", fontSize: "13px",
    });
    const title = manager.querySelector(".x-filter-manager-title");
    const text = manager.querySelector(".x-filter-manager-text");
    const list = manager.querySelector(".x-filter-manager-list");
    const clearButton = manager.querySelector("[data-clear]");
    title.style.fontWeight = "600";
    text.style.margin = "4px 0 10px";
    text.style.color = "#7a7a7a";
    Object.assign(list.style, { display: "grid", gap: "7px", maxHeight: "360px", overflowY: "auto" });
    Object.assign(manager.querySelector(".x-filter-manager-actions").style, { display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "12px" });

    const renderList = () => {
      list.replaceChildren();
      const keys = [...manuallyBlockedMovies].sort();
      if (!keys.length) {
        const empty = document.createElement("div");
        empty.textContent = "\u6682\u65e0\u624b\u52a8\u5c4f\u853d\u8bb0\u5f55\u3002";
        empty.style.color = "#7a7a7a";
        list.append(empty);
      }
      keys.forEach((movieKey) => {
        const row = document.createElement("div");
        const key = document.createElement("code");
        const remove = document.createElement("button");
        Object.assign(row.style, { display: "flex", alignItems: "center", gap: "8px", minWidth: "0", padding: "7px 8px", background: "#f6f8fb", borderRadius: "5px" });
        Object.assign(key.style, { flex: "1 1 auto", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
        key.textContent = movieKey;
        remove.type = "button";
        remove.className = "button is-small is-success";
        remove.textContent = "\u53d6\u6d88\u5c4f\u853d";
        remove.addEventListener("click", () => {
          manuallyBlockedMovies.delete(movieKey);
          saveManualBlocks();
          delete clearButton.dataset.confirm;
          refreshFilterVisibility();
          renderList();
          updateManualBlocksToggle();
        });
        row.append(key, remove);
        list.append(row);
      });
      clearButton.disabled = !keys.length;
      clearButton.textContent = clearButton.dataset.confirm === "1" ? "\u518d\u6b21\u70b9\u51fb\u786e\u8ba4" : "\u6e05\u7a7a\u5168\u90e8";
    };
    clearButton.addEventListener("click", () => {
      if (clearButton.dataset.confirm !== "1") {
        clearButton.dataset.confirm = "1";
        renderList();
        return;
      }
      manuallyBlockedMovies.clear();
      saveManualBlocks();
      delete clearButton.dataset.confirm;
      refreshFilterVisibility();
      renderList();
      updateManualBlocksToggle();
    });
    manager.querySelector("[data-close]").addEventListener("click", closeManualBlockManager);
    document.body.append(manager);
    renderList();
  };
  const initManualBlocksToggle = () => {
    const toolbar = document.querySelector(".toolbar");
    if (!toolbar || document.getElementById(MANUAL_BLOCKS_TOGGLE_ID)) return Boolean(toolbar);

    const toggle = document.createElement("button");
    toggle.id = MANUAL_BLOCKS_TOGGLE_ID;
    toggle.type = "button";
    toggle.className = "button is-small x-manual-blocks-toggle";
    toggle.dataset.filterAction = "manual-blocks";
    toggle.addEventListener("click", showManualBlockManager);
    toolbar.append(toggle);
    updateManualBlocksToggle();
    return true;
  };

  const isActorWorksPage = () => location.pathname.startsWith("/actors/");

  const updateActorMatchToggle = () => {
    const button = document.getElementById(ACTOR_MATCH_TOGGLE_ID);
    if (!button) return;
    button.textContent = actorMatchedOnly ? "\u663e\u793a\u5df2\u5339\u914d" : "\u663e\u793a\u5168\u90e8";
    button.classList.toggle("is-match-active", actorMatchedOnly);
    button.classList.toggle("is-match-inactive", !actorMatchedOnly);
    button.setAttribute("aria-pressed", String(actorMatchedOnly));
  };

  const requestNextActorWorksPage = () => {
    if (!actorMatchedOnly || !isActorWorksPage() || actorMatchLoadQueued) return;

    const loadButton = document.querySelector(".x-load");
    if (!loadButton || /\u6682\u65e0\u66f4\u591a/.test(loadButton.textContent)) return;
    if (loadButton.classList.contains("is-loading") || loadButton.disabled) {
      actorMatchLoadQueued = true;
      setTimeout(() => {
        actorMatchLoadQueued = false;
        requestNextActorWorksPage();
      }, 100);
      return;
    }
    actorMatchLoadQueued = true;
    requestAnimationFrame(() => {
      loadButton.click();
      // Hold the gate until JavDB.scroll has finished its asynchronous fetch;
      // wheel/scroll events otherwise enqueue duplicate page requests.
      const release = () => {
        if (loadButton.classList.contains("is-loading")) return setTimeout(release, 50);
        actorMatchLoadQueued = false;
        queueMoreActorWorksIfNeeded();
      };
      setTimeout(release, 0);
    });
  };

  const queueMoreActorWorksIfNeeded = () => {
    if (!actorMatchedOnly || !isActorWorksPage()) return;

    const items = [...document.querySelectorAll(".movie-list .item")].filter((item) => !isCardHiddenByActiveFilter(item));
    const allItemsProcessed = items.length && items.every((item) => item.querySelector(".x-match"));
    const hasMatchedItems = items.some((item) => item.querySelector(".x-match:not(.is-normal)"));
    if (!allItemsProcessed || hasMatchedItems) return;
    requestNextActorWorksPage();
  };

  const loadMoreActorWorksAtPageEnd = () => {
    if (!actorMatchedOnly || !isActorWorksPage()) return;
    const pageEnd = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    if (window.scrollY + window.innerHeight >= pageEnd - 300) requestNextActorWorksPage();
  };

  const setActorMatchedOnly = (enabled) => {
    actorMatchedOnly = enabled;
    document.documentElement.classList.toggle("x-actor-matched-only", enabled);
    updateActorMatchToggle();
    queueMoreActorWorksIfNeeded();
  };

  const initActorMatchToggle = () => {
    if (!isActorWorksPage()) return true;
    const toolbar = document.querySelector(".toolbar");
    if (!toolbar || document.getElementById(ACTOR_MATCH_TOGGLE_ID)) return Boolean(toolbar);

    const toggle = document.createElement("button");
    toggle.id = ACTOR_MATCH_TOGGLE_ID;
    toggle.type = "button";
    toggle.className = "button is-small x-actor-match-toggle";
    toggle.addEventListener("click", () => setActorMatchedOnly(!actorMatchedOnly));
    toolbar.append(toggle);
    updateActorMatchToggle();
    return true;
  };

  const initToolbarControls = () => (
    initScoreFilterToggle()
    && initPurifyFilterToggle()
    && initReviewToggle()
    && initManualBlocksToggle()
    && initActorMatchToggle()
  );

  const closeBlockMenu = () => document.getElementById(MENU_ID)?.remove();

  const showBlockMenu = (event, item) => {
    closeBlockMenu();
    const details = parseCard(item);
    const movieKey = getMovieKey(item, details);
    if (!movieKey || movieKey === "code:") return;
    const isBlocked = manuallyBlockedMovies.has(movieKey);

    const menu = document.createElement("div");
    menu.id = MENU_ID;
    menu.setAttribute("role", "dialog");
    menu.innerHTML = `
      <div class="x-filter-menu-title">${isBlocked ? "取消屏蔽这部影片？" : "屏蔽这部影片？"}</div>
      <div class="x-filter-menu-text">${isBlocked ? "恢复后会按当前过滤规则重新显示。" : "以后仍可通过“审查屏蔽”或再次右键恢复。"}</div>
      <div class="x-filter-menu-actions">
        <button type="button" class="button is-small ${isBlocked ? "is-success" : "is-danger"}">${isBlocked ? "取消屏蔽" : "屏蔽"}</button>
        <button type="button" class="button is-small">取消</button>
      </div>`;
    Object.assign(menu.style, {
      position: "fixed", zIndex: "99999", left: `${Math.max(8, Math.min(event.clientX, window.innerWidth - 230))}px`,
      top: `${Math.max(8, Math.min(event.clientY, window.innerHeight - 120))}px`, width: "220px", padding: "12px",
      background: "#fff", border: "1px solid #dbdbdb", borderRadius: "6px", boxShadow: "0 8px 20px rgba(10, 10, 10, .18)",
      color: "#363636", fontSize: "13px",
    });
    menu.querySelector(".x-filter-menu-title").style.fontWeight = "600";
    Object.assign(menu.querySelector(".x-filter-menu-text").style, { marginTop: "4px", color: "#7a7a7a" });
    Object.assign(menu.querySelector(".x-filter-menu-actions").style, { display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "12px" });
    const [blockButton, cancelButton] = menu.querySelectorAll("button");
    blockButton.addEventListener("click", () => {
      if (isBlocked) manuallyBlockedMovies.delete(movieKey);
      else manuallyBlockedMovies.add(movieKey);
      saveManualBlocks();
      processCards([item]);
      updateReviewToggle();
      updateManualBlocksToggle();
      queueVisibilityChanged();
      closeBlockMenu();
    });
    cancelButton.addEventListener("click", closeBlockMenu);
    document.body.append(menu);
  };

  applyScoreMaskVisibility(scoreConfig);
  setActorMatchedOnly(false);
  if (!initToolbarControls()) {
    const toolbarObserver = new MutationObserver(() => {
      if (!initToolbarControls()) return;
      toolbarObserver.disconnect();
    });
    toolbarObserver.observe(document.body, { childList: true, subtree: true });
  }

  refreshFilterVisibility();
  observeIncomingMovieCards();
  window.addEventListener(KEYWORD_CONFIG_EVENT, refreshKeywordFilteredCards);
  window.addEventListener(SCORE_CONFIG_EVENT, () => refreshScoreConfig());
  window.addEventListener(VISIBILITY_CONFIG_EVENT, ({ detail }) => refreshVisibilityConfig(detail));
  window.addEventListener("storage", (event) => {
    if (event.key === KEYWORD_CONFIG_STORAGE_KEY) refreshKeywordFilteredCards();
    if (event.key === SCORE_CONFIG_STORAGE_KEY) refreshScoreConfig();
    if (event.key === VISIBILITY_CONFIG_STORAGE_KEY) refreshVisibilityConfig();
  });
  if (isActorWorksPage()) {
    new MutationObserver((mutations) => {
      if (mutations.some(({ type, target }) => type === "childList" || target.classList?.contains("x-match"))) {
        queueMoreActorWorksIfNeeded();
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }
  window.addEventListener("scroll", loadMoreActorWorksAtPageEnd, { passive: true });
  document.addEventListener("contextmenu", (event) => {
    if (event.target.closest(".x-match, .x-match-force")) return;
    const item = event.target.closest(".movie-list .item");
    if (!item) return;
    event.preventDefault();
    showBlockMenu(event, item);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(`#${MENU_ID}`)) closeBlockMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeBlockMenu();
      closeManualBlockManager();
    }
  });
})();
