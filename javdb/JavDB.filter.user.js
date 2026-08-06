// ==UserScript==
// @name            JavDB.filter
// @namespace       JavDB.filter@blc
// @version         0.0.20
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
  const MENU_ID = "javdb-filter-menu";
  const FILTER_TOGGLE_ID = "x-score-filter-toggle";
  const ACTOR_MATCH_TOGGLE_ID = "x-actor-match-toggle";

  let scoreFilterEnabled = true;
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

  const parseCard = (item) => {
    const titleNode = item.querySelector(".video-title");
    const code = titleNode?.querySelector("strong")?.textContent.trim() || getText(item, ".uid");
    const title = titleNode?.textContent.trim() || getText(item, ".title");
    const score = getText(item, ".score .value") || getText(item, ".value");
    const meta = [getText(item, ".meta"), getText(item, ".tags")].join(" ");
    return {
      code,
      title,
      score,
      meta,
      fullText: `${code} ${title}`,
    };
  };

  const getMovieKey = (item, details = parseCard(item)) => {
    const href = item.matches("a[href*='/v/']")
      ? item.href
      : item.querySelector("a[href*='/v/']")?.href;
    const movieId = href && new URL(href, location.origin).pathname.match(/^\/v\/([^/?#]+)/)?.[1];
    return movieId ? `id:${movieId.toLowerCase()}` : `code:${details.code.toLowerCase()}`;
  };

  const parseScore = (text) => {
    const values = String(text).match(/\d+(?:\.\d+)?/g);
    if (!values || values.length < 2) return null;
    return {
      rating: Number.parseFloat(values[0]),
      votes: Number.parseInt(values[1], 10),
    };
  };

  const shouldRemove = ({ code, title, meta }) => {
    const idText = code.toLowerCase();
    const titleText = title.toLowerCase();
    const metaText = meta.toLowerCase();
    if (idsToBlock.some((id) => idText.includes(id))) return true;
    if (titlesToBlock.some((keyword) => titleText.includes(keyword))) return true;
    return tagsToBlock.some((tag) => metaText.includes(tag));
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
    if (!score) return;

    const { rating, votes } = score;
    const isWestern = WESTERN_CODE_PATTERN.test(details.fullText);
    if (!(scoreConfig.westernBypass && isWestern)) {
      if (rating < scoreConfig.lowRating || (rating <= scoreConfig.weakRating && votes < scoreConfig.lowVotes)) {
        item.classList.add("x-score-mask-low", "x-score-filtered");
      } else if (rating >= scoreConfig.weakRating && votes < scoreConfig.weakVotes) {
        item.classList.add("x-score-mask-weak", "x-score-filtered");
      }
    }

    if (rating > scoreConfig.topRating && votes > scoreConfig.topVotes && canStyleCardBox) {
      cardBox.style.background = `linear-gradient(${scoreConfig.topStart} 50%, ${scoreConfig.topEnd} 100%)`;
    } else if (rating > scoreConfig.highlightRating && votes > scoreConfig.highlightVotes && canStyleCardBox) {
      cardBox.style.background = `linear-gradient(${scoreConfig.highlightStart} 50%, ${scoreConfig.highlightEnd} 100%)`;
    }
  };

  const applyPurify = (item, details) => {
    if (manuallyBlockedMovies.has(getMovieKey(item, details))) {
      item.remove();
      return true;
    }
    const keywordBlocked = shouldRemove(details);
    item.classList.toggle("x-purify-keyword-hidden", keywordBlocked);
    item.dataset.purifyKeywordHidden = keywordBlocked ? "1" : "";
    return false;
  };

  const processCards = (list) => {
    [...list].forEach((item) => {
      try {
        if (!(item instanceof Element)) return;
        const details = parseCard(item);
        if (applyPurify(item, details)) return;
        applyScoreFilter(item, details);
      } catch (error) {
        // A malformed card must not break JavDB.scroll's own load-more cycle.
        console.warn("[JavDB.filter] skip card", error);
      }
    });
  };

  const refreshKeywordFilteredCards = () => {
    refreshKeywordConfig();
    processCards(document.querySelectorAll(".movie-list .item"));
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
    });
  };
  const refreshScoreConfig = (next) => {
    scoreConfig = normalizeScoreConfig(next || readScoreConfig());
    applyScoreMaskVisibility(scoreConfig);
    scheduleScoreRefresh();
  };

  const filterStyle = document.createElement("style");
  filterStyle.textContent = `
    .movie-list .item.x-purify-keyword-hidden { display: none !important; }
    .x-score-mask-low::after { opacity: var(--x-score-low-mask-opacity, .9) !important; }
    .x-score-mask-weak::after { opacity: var(--x-score-weak-mask-opacity, .7) !important; }
  `;
  document.head.append(filterStyle);

  const updateScoreFilterToggle = () => {
    const button = document.getElementById(FILTER_TOGGLE_ID);
    if (!button) return;
    button.textContent = scoreFilterEnabled ? "\u5df2\u8fc7\u6ee4" : "\u672a\u8fc7\u6ee4";
    button.classList.toggle("is-filter-active", scoreFilterEnabled);
    button.classList.toggle("is-filter-inactive", !scoreFilterEnabled);
    button.setAttribute("aria-pressed", String(scoreFilterEnabled));
  };

  const setScoreFilterEnabled = (enabled) => {
    scoreFilterEnabled = enabled;
    document.documentElement.classList.toggle("x-score-filter-active", enabled);
    updateScoreFilterToggle();
  };

  const initScoreFilterToggle = () => {
    const toolbar = document.querySelector(".toolbar");
    if (!toolbar || document.getElementById(FILTER_TOGGLE_ID)) return Boolean(toolbar);

    const toggle = document.createElement("button");
    toggle.id = FILTER_TOGGLE_ID;
    toggle.type = "button";
    // Match JavDB's native toolbar button shape exactly; the extra class is styling only.
    toggle.className = "button is-small x-score-filter-toggle";
    toggle.addEventListener("click", () => setScoreFilterEnabled(!scoreFilterEnabled));
    // Keep the filter control after every native toolbar control.
    toolbar.append(toggle);
    updateScoreFilterToggle();
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

    const items = [...document.querySelectorAll(".movie-list .item:not(.x-purify-keyword-hidden)")];
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

  const initToolbarControls = () => initScoreFilterToggle() && initActorMatchToggle();

  const closeBlockMenu = () => document.getElementById(MENU_ID)?.remove();

  const showBlockMenu = (event, item) => {
    closeBlockMenu();
    const details = parseCard(item);
    const movieKey = getMovieKey(item, details);
    if (!movieKey || movieKey === "code:") return;

    const menu = document.createElement("div");
    menu.id = MENU_ID;
    menu.setAttribute("role", "dialog");
    menu.innerHTML = `
      <div class="x-filter-menu-title">屏蔽这部影片？</div>
      <div class="x-filter-menu-text">以后在瀑布流中不会再显示。</div>
      <div class="x-filter-menu-actions">
        <button type="button" class="button is-small is-danger">屏蔽</button>
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
      manuallyBlockedMovies.add(movieKey);
      saveManualBlocks();
      item.remove();
      closeBlockMenu();
    });
    cancelButton.addEventListener("click", closeBlockMenu);
    document.body.append(menu);
  };

  applyScoreMaskVisibility(scoreConfig);
  setScoreFilterEnabled(true);
  setActorMatchedOnly(false);
  if (!initToolbarControls()) {
    const toolbarObserver = new MutationObserver(() => {
      if (!initToolbarControls()) return;
      toolbarObserver.disconnect();
    });
    toolbarObserver.observe(document.body, { childList: true, subtree: true });
  }

  processCards(document.querySelectorAll(".movie-list .item"));
  observeIncomingMovieCards();
  window.addEventListener(KEYWORD_CONFIG_EVENT, refreshKeywordFilteredCards);
  window.addEventListener(SCORE_CONFIG_EVENT, () => refreshScoreConfig());
  window.addEventListener("storage", (event) => {
    if (event.key === KEYWORD_CONFIG_STORAGE_KEY) refreshKeywordFilteredCards();
    if (event.key === SCORE_CONFIG_STORAGE_KEY) refreshScoreConfig();
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
    if (event.key === "Escape") closeBlockMenu();
  });
})();
