// ==UserScript==
// @name            JavDB.filter
// @namespace       JavDB.filter@blc
// @version         0.0.8
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
  const MENU_ID = "javdb-filter-menu";
  const FILTER_TOGGLE_ID = "x-score-filter-toggle";

  let scoreFilterEnabled = true;

  const SCORE_CONFIG = {
    lowOpacity: "10%",
    weakOpacity: "30%",
    lowRating: 3.8,
    weakRating: 4.0,
    lowVotes: 20,
    weakVotes: 30,
    highlightRating: 3.8,
    highlightVotes: 300,
    topRating: 4.0,
    topVotes: 1000,
    westernCodePattern: /[A-Za-z]+[\.\s-]+(20\d{2}|\d{2})[.-]\d{2}[.-]\d{2}/,
  };

  const PURIFY_CONFIG = {
    blockedIDs: [],
    blockedTitleKeywords: {
      "重口排泄": ["大便", "尿", "粪", "浣肠", "失禁", "排泄", "失便", "唾"],
      "SM与调教": ["虐", "奴", "调教", "拷问", "レイプ", "sm", "m男"],
      "身体特征": ["剛毛", "鼻", "アナル"],
      "年龄体型": ["熟女"],
      "伪娘男娘": ["男の娘", "男娘", "偽娘", "伪娘", "女装男子", "女装子", "ニューハーフ", "ふたなり", "futanari"],
    },
    blockedTags: {
      "题材类别": ["熟女", "人妻", "痴女"],
      "重口类别": ["排泄", "猎奇"],
      "跨性别伪娘": ["男の娘", "cross dressing", "cross-dressing", "女装", "ニューハーフ", "transsexual", "shemale", "futanari", "ふたなり"],
    },
  };

  const flatten = (source) => {
    if (Array.isArray(source)) return source;
    return Object.values(source).flat();
  };

  const lowerList = (source) => flatten(source).map((item) => String(item).toLowerCase()).filter(Boolean);
  const idsToBlock = lowerList(PURIFY_CONFIG.blockedIDs);
  const titlesToBlock = lowerList(PURIFY_CONFIG.blockedTitleKeywords);
  const tagsToBlock = lowerList(PURIFY_CONFIG.blockedTags);
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

  const applyScoreFilter = (item, details) => {
    if (item.dataset.scoreProcessed === "1") return;

    const score = parseScore(details.score);
    if (!score) return;

    const { rating, votes } = score;
    const isWestern = SCORE_CONFIG.westernCodePattern.test(details.fullText);
    if (!isWestern) {
      if (rating < SCORE_CONFIG.lowRating || (rating <= SCORE_CONFIG.weakRating && votes < SCORE_CONFIG.lowVotes)) {
        item.classList.add("x-score-mask-low", "x-score-filtered");
      } else if (rating >= SCORE_CONFIG.weakRating && votes < SCORE_CONFIG.weakVotes) {
        item.classList.add("x-score-mask-weak", "x-score-filtered");
      }
    }

    const cardBox = item.children?.[0];
    if (rating > SCORE_CONFIG.highlightRating && votes > SCORE_CONFIG.highlightVotes && cardBox) {
      cardBox.style.background = "linear-gradient(cyan 50%, lightcyan 100%)";
    }
    if (rating > SCORE_CONFIG.topRating && votes > SCORE_CONFIG.topVotes && cardBox) {
      cardBox.style.background = "linear-gradient(hotpink 50%, lightpink 100%)";
    }

    item.dataset.scoreProcessed = "1";
  };

  const applyPurify = (item, details) => {
    if (manuallyBlockedMovies.has(getMovieKey(item, details))) {
      item.remove();
      return true;
    }
    if (item.dataset.purifyProcessed === "1") return false;
    item.dataset.purifyProcessed = "1";
    if (!shouldRemove(details)) return false;
    item.remove();
    return true;
  };

  const processCards = (list) => {
    [...list].forEach((item) => {
      if (!(item instanceof Element)) return;
      const details = parseCard(item);
      if (applyPurify(item, details)) return;
      applyScoreFilter(item, details);
    });
  };

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

    const toggleGroup = document.createElement("span");
    toggleGroup.className = "button-group x-score-filter-toggle-group";
    const toggle = document.createElement("button");
    toggle.id = FILTER_TOGGLE_ID;
    toggle.type = "button";
    toggle.className = "button is-small x-score-filter-toggle";
    toggle.addEventListener("click", () => setScoreFilterEnabled(!scoreFilterEnabled));
    toggleGroup.append(toggle);
    // Keep the filter control after every native toolbar control.
    toolbar.append(toggleGroup);
    updateScoreFilterToggle();
    return true;
  };

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

  setScoreFilterEnabled(true);
  if (!initScoreFilterToggle()) {
    const toolbarObserver = new MutationObserver(() => {
      if (!initScoreFilterToggle()) return;
      toolbarObserver.disconnect();
    });
    toolbarObserver.observe(document.body, { childList: true, subtree: true });
  }

  processCards(document.querySelectorAll(".movie-list .item"));
  window.addEventListener("JavDB.scroll", ({ detail }) => processCards(detail || []));
  document.addEventListener("contextmenu", (event) => {
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
