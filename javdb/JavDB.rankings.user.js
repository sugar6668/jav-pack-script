// ==UserScript==
// @name            JavDB.rankings
// @namespace       JavDB.rankings.local
// @version         0.1.0
// @match           https://javdb.com/*
// @connect         jdforrepam.com
// @grant           GM_xmlhttpRequest
// @grant           GM_getValue
// @grant           GM_setValue
// @run-at          document-end
// ==/UserScript==

const API_BASE = "https://jdforrepam.com";
const TOKEN_KEY = "jdb_rank_token";
const CACHE_PREFIX = "jdb_rank_cache_";
const CACHE_TTL = 30 * 60 * 1000;

(function () {
  const VOID = "javascript:void(0);";
  const T = {
    title: "\u6392\u884c\u699c",
    list: "\u699c\u5355",
    period: "\u5468\u671f",
    type: "\u7c7b\u578b",
    startRank: "\u8d77\u59cb\u6392\u540d",
    ignoreWatched: "\u5ffd\u7565\u5df2\u770b",
    filter: "\u7b5b\u9009",
    playback: "\u70ed\u64ad\u699c",
    def: "\u9ed8\u8ba4",
    coded: "\u6709\u7801",
    uncoded: "\u65e0\u7801",
    all: "\u5168\u90e8",
    highScore: "\u9ad8\u5206",
    tokenSaved: "token \u5df2\u4fdd\u5b58",
    noToken: "\u8bf7\u5148\u8bbe\u7f6e token",
    badToken: "token \u65e0\u6548\u6216\u6743\u9650\u4e0d\u8db3",
    badShape: "\u63a5\u53e3\u8fd4\u56de\u7ed3\u6784\u5f02\u5e38",
    loading: "\u52a0\u8f7d\u4e2d...",
    cached: "\u5df2\u4ece\u7f13\u5b58\u52a0\u8f7d",
    loaded: "\u52a0\u8f7d\u5b8c\u6210",
    empty: "\u6682\u65e0\u6570\u636e",
    load: "\u52a0\u8f7d",
    refresh: "\u5237\u65b0",
    saveToken: "\u4fdd\u5b58 token",
    playable: "\u53ef\u64ad",
    cnsub: "\u4e2d\u5b57",
    preview: "\u9884\u89c8",
    score: "\u8bc4\u5206",
    magnets: "\u78c1\u94fe",
  };

  let pageState;

  const html = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char]);
  const field = (name) => pageState.root.querySelector(`[data-rank-field="${name}"]`);
  const action = (name) => pageState.root.querySelector(`[data-rank-action="${name}"]`);
  const isTop = () => pageState.rankType.value === "top";
  const period = () => pageState.period.value || "daily";

  const request = ({ path, query, headers = {} }) => new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    Object.entries(query || {}).forEach(([key, value]) => url.searchParams.set(key, value));
    GM_xmlhttpRequest({
      method: "GET",
      url: url.href,
      headers,
      onload: (res) => (res.status >= 200 && res.status < 300 ? resolve(res) : reject(res)),
      onerror: reject,
      ontimeout: reject,
    });
  });

  const getCache = (key) => {
    const cache = GM_getValue(key);
    return cache?.ts && cache.data && Date.now() - cache.ts <= CACHE_TTL ? cache.data : null;
  };
  const setCache = (key, data) => GM_setValue(key, { ts: Date.now(), data });

  const setStatus = (text, type = "") => {
    pageState.status.className = `notification x-rank-status ${type}`.trim();
    pageState.status.textContent = text || "";
    pageState.status.hidden = !text;
  };

  const syncControls = (resetPeriod = false) => {
    const top = isTop();
    pageState.topControls.forEach((node) => { node.hidden = !top; });
    pageState.playbackControls.forEach((node) => { node.hidden = top; });
    const current = resetPeriod ? (top ? "" : "daily") : pageState.period.value;
    pageState.period.innerHTML = top
      ? `<option value="">${T.def}</option><option value="daily">daily</option><option value="weekly">weekly</option><option value="monthly">monthly</option>`
      : `<option value="daily">daily</option><option value="weekly">weekly</option><option value="monthly">monthly</option>`;
    pageState.period.value = top ? current : (current || "daily");
  };

  const getCacheKey = () => isTop()
    ? `${CACHE_PREFIX}top_${period()}_${pageState.type.value}_${pageState.startRank.value}_${pageState.ignoreWatched.value}`
    : `${CACHE_PREFIX}playback_${period()}_${pageState.filterBy.value}`;

  const getRequestConfig = () => {
    if (!isTop()) {
      return {
        path: "/api/v1/rankings/playback",
        query: { filter_by: pageState.filterBy.value, period: period() },
        headers: { "Accept-Language": "zh-TW" },
      };
    }

    const token = pageState.token.value.trim();
    if (!token) throw new Error("NO_TOKEN");
    return {
      path: "/api/v1/movies/top",
      query: {
        period: period(),
        type: pageState.type.value,
        type_value: pageState.type.value,
        start_rank: pageState.startRank.value,
        ignore_watched: pageState.ignoreWatched.value,
        page: "1",
        limit: "50",
      },
      headers: { Authorization: `Bearer ${token}`, "Accept-Language": "zh-TW" },
    };
  };

  const moviesOf = (data) => {
    const movies = data?.data?.movies;
    if (!Array.isArray(movies)) throw new Error("BAD_SHAPE");
    return movies;
  };
  const coverOf = (movie) => movie.cover_url || movie.thumb_url || movie.cover || movie.thumb || "";
  const rankOf = (movie, index) => movie.ranking || (isTop() ? Number(pageState.startRank.value) + index : index + 1);
  const badgesOf = (movie) => [
    movie.can_play && T.playable,
    movie.has_cnsub && T.cnsub,
    movie.has_preview_video && T.preview,
  ].filter(Boolean).map((text) => `<span class="tag is-light x-rank-flag">${text}</span>`).join("");

  const renderMovie = (movie, index) => {
    const number = movie.number || "";
    const title = movie.title || movie.current_title || movie.name || "";
    const score = movie.score ?? "";
    const magnets = movie.magnets_count ?? "";
    return `<div class="item">
      <a href="/search?q=${encodeURIComponent(number)}">
        <div class="cover"><img src="${html(coverOf(movie))}"><span class="tag is-danger x-rank-badge">#${html(rankOf(movie, index))}</span></div>
        <div class="video-title"><strong>${html(number)}</strong><span class="current-title">${html(title)}</span></div>
        <div class="x-rank-meta">
          ${score !== "" ? `<span>${T.score} ${html(score)}</span>` : ""}
          ${movie.release_date ? `<span>${html(movie.release_date)}</span>` : ""}
          ${magnets !== "" ? `<span>${T.magnets} ${html(magnets)}</span>` : ""}
        </div>
        <div class="x-rank-flags">${badgesOf(movie)}</div>
      </a>
    </div>`;
  };

  const renderMovies = (movies) => {
    pageState.list.innerHTML = movies.map(renderMovie).join("") || `<div class="notification">${T.empty}</div>`;
    const items = document.querySelectorAll(".movie-list .item");
    window.dispatchEvent(new CustomEvent("JavDB.scroll", { detail: items }));
  };

  const loadRankings = async (force = false) => {
    try {
      setStatus(T.loading, "is-info");
      const cacheKey = getCacheKey();
      const cache = force ? null : getCache(cacheKey);
      if (cache) {
        renderMovies(moviesOf(cache));
        return setStatus(T.cached, "is-success");
      }

      const res = await request(getRequestConfig());
      const data = JSON.parse(res.responseText || "{}");
      renderMovies(moviesOf(data));
      setCache(cacheKey, data);
      setStatus(T.loaded, "is-success");
    } catch (err) {
      pageState.list.innerHTML = "";
      if (err?.message === "NO_TOKEN") return setStatus(T.noToken, "is-warning");
      if (err?.message === "BAD_SHAPE") return setStatus(T.badShape, "is-danger");
      if (err?.status === 401 || err?.status === 403) return setStatus(T.badToken, "is-danger");
      if (typeof err?.status === "number") return setStatus(`HTTP ${err.status}: ${(err.responseText || "").slice(0, 200)}`, "is-danger");
      setStatus(String(err?.message || err).slice(0, 200), "is-danger");
    }
  };

  const renderPageHTML = () => `<div class="x-rankings-page container">
    <h1 class="title is-4">${T.title}</h1>
    <div class="x-rank-controls">
      <label class="x-rank-control"><span>${T.list}</span><span class="select is-small"><select data-rank-field="rankType"><option value="top">TOP250</option><option value="playback">${T.playback}</option></select></span></label>
      <label class="x-rank-control"><span>${T.period}</span><span class="select is-small"><select data-rank-field="period"></select></span></label>
      <label class="x-rank-control x-rank-top"><span>${T.type}</span><span class="select is-small"><select data-rank-field="type"><option value="">${T.def}</option><option value="0">0 ${T.coded}</option><option value="1">1 ${T.uncoded}</option><option value="all">all ${T.all}</option></select></span></label>
      <label class="x-rank-control x-rank-top"><span>${T.startRank}</span><span class="select is-small"><select data-rank-field="startRank"><option value="1">1</option><option value="51">51</option><option value="101">101</option><option value="151">151</option><option value="201">201</option></select></span></label>
      <label class="x-rank-control x-rank-top"><span>${T.ignoreWatched}</span><span class="select is-small"><select data-rank-field="ignoreWatched"><option value="false">false</option><option value="true">true</option></select></span></label>
      <label class="x-rank-control x-rank-top"><span>token</span><input class="input is-small" data-rank-field="token" type="password" placeholder="Bearer token"></label>
      <button class="button is-small x-rank-top" data-rank-action="saveToken">${T.saveToken}</button>
      <label class="x-rank-control x-rank-playback"><span>${T.filter}</span><span class="select is-small"><select data-rank-field="filterBy"><option value="all">all ${T.all}</option><option value="high_score">high_score ${T.highScore}</option></select></span></label>
      <button class="button is-small is-link" data-rank-action="load">${T.load}</button>
      <button class="button is-small" data-rank-action="refresh">${T.refresh}</button>
    </div>
    <div class="notification x-rank-status" hidden></div>
    <div class="movie-list h cols-4 vcols-8"></div>
  </div>`;

  window.renderRankingsPage = () => {
    const root = document.querySelector(".section") || document.querySelector("main") || document.body;
    root.innerHTML = renderPageHTML();
    pageState = {
      root,
      rankType: field("rankType"),
      period: field("period"),
      type: field("type"),
      startRank: field("startRank"),
      ignoreWatched: field("ignoreWatched"),
      token: field("token"),
      filterBy: field("filterBy"),
      status: root.querySelector(".x-rank-status"),
      list: root.querySelector(".movie-list"),
      topControls: root.querySelectorAll(".x-rank-top"),
      playbackControls: root.querySelectorAll(".x-rank-playback"),
    };

    pageState.token.value = GM_getValue(TOKEN_KEY, "");
    syncControls();
    pageState.rankType.addEventListener("change", () => { syncControls(true); loadRankings(); });
    action("load").addEventListener("click", () => loadRankings());
    action("refresh").addEventListener("click", () => loadRankings(true));
    action("saveToken").addEventListener("click", () => {
      GM_setValue(TOKEN_KEY, pageState.token.value.trim());
      setStatus(T.tokenSaved, "is-success");
    });
    loadRankings();
  };

  const insertNav = () => {
    const navList = document.querySelector(".main-tabs ul, .navbar-start, .tabs:not(.no-bottom) ul");
    if (!navList) return;

    const current = document.querySelector(".x-rankings-trigger")?.parentElement;
    const settings = navList.querySelector(".x-layout-trigger")?.parentElement;
    if (current) {
      if (settings && current.nextElementSibling !== settings) navList.insertBefore(current, settings);
      return;
    }

    const wrap = navList.matches("ul") ? document.createElement("li") : document.createElement("div");
    const trigger = document.createElement("a");
    trigger.href = VOID;
    trigger.className = navList.matches("ul") ? "x-rankings-trigger" : "navbar-item x-rankings-trigger";
    trigger.textContent = T.title;
    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      history.pushState(null, "", "/?x_rankings=1");
      window.renderRankingsPage();
    });
    wrap.append(trigger);
    navList.insertBefore(wrap, settings || null);
  };

  insertNav();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", insertNav, { once: true });
  setTimeout(insertNav, 500);

  if (new URLSearchParams(location.search).has("x_rankings")) window.renderRankingsPage();
  window.addEventListener("popstate", () => {
    if (!new URLSearchParams(location.search).has("x_rankings")) location.reload();
  });
})();
