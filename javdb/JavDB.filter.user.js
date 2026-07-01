// ==UserScript==
// @name            JavDB.filter
// @namespace       JavDB.filter@blc
// @version         0.0.3
// @author          blc
// @description     评分筛选与性癖净化
// @match           https://javdb.com/*
// @exclude         https://javdb.com/v/*
// @icon            https://javdb.com/favicon.ico
// @run-at          document-end
// ==/UserScript==

(function () {
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
        item.style.opacity = SCORE_CONFIG.lowOpacity;
      } else if (rating >= SCORE_CONFIG.weakRating && votes < SCORE_CONFIG.weakVotes) {
        item.style.opacity = SCORE_CONFIG.weakOpacity;
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

  processCards(document.querySelectorAll(".movie-list .item"));
  window.addEventListener("JavDB.scroll", ({ detail }) => processCards(detail || []));
})();
