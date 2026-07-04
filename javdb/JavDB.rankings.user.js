// ==UserScript==
// @name            JavDB.rankings
// @namespace       JavDB.rankings.local
// @version         0.1.0
// @match           https://javdb.com/*
// @icon            https://javdb.com/favicon.ico
// @connect         jdforrepam.com
// @grant           GM_xmlhttpRequest
// @grant           GM_getValue
// @grant           GM_setValue
// @grant           GM_deleteValue
// @run-at          document-end
// ==/UserScript==

const API_BASE = "https://jdforrepam.com";
const SECRET = "71cf27bb3c0bcdf207b64abecddc970098c7421ee7203b9cdae54478478a199e7d5a6e1a57691123c1a931c057842fb73ba3b3c83bcd69c17ccf174081e3d8aa";
const TOKEN_KEY = "jdb_rank_token";
const CACHE_PREFIX = "jdb_rank_cache_";
const CACHE_TTL = 30 * 60 * 1000;

function md5(s) {
  const safeAdd = (x, y) => {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  };
  const bitRotateLeft = (num, cnt) => (num << cnt) | (num >>> (32 - cnt));
  const cmn = (q, a, b, x, sft, t) => safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), sft), b);
  const ff = (a, b, c, d, x, sft, t) => cmn((b & c) | (~b & d), a, b, x, sft, t);
  const gg = (a, b, c, d, x, sft, t) => cmn((b & d) | (c & ~d), a, b, x, sft, t);
  const hh = (a, b, c, d, x, sft, t) => cmn(b ^ c ^ d, a, b, x, sft, t);
  const ii = (a, b, c, d, x, sft, t) => cmn(c ^ (b | ~d), a, b, x, sft, t);
  const binlMD5 = (x, len) => {
    x[len >> 5] |= 0x80 << (len % 32);
    x[(((len + 64) >>> 9) << 4) + 14] = len;
    let a = 1732584193;
    let b = -271733879;
    let c = -1732584194;
    let d = 271733878;
    for (let i = 0; i < x.length; i += 16) {
      const olda = a; const oldb = b; const oldc = c; const oldd = d;
      a = ff(a, b, c, d, x[i], 7, -680876936); d = ff(d, a, b, c, x[i + 1], 12, -389564586); c = ff(c, d, a, b, x[i + 2], 17, 606105819); b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
      a = ff(a, b, c, d, x[i + 4], 7, -176418897); d = ff(d, a, b, c, x[i + 5], 12, 1200080426); c = ff(c, d, a, b, x[i + 6], 17, -1473231341); b = ff(b, c, d, a, x[i + 7], 22, -45705983);
      a = ff(a, b, c, d, x[i + 8], 7, 1770035416); d = ff(d, a, b, c, x[i + 9], 12, -1958414417); c = ff(c, d, a, b, x[i + 10], 17, -42063); b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
      a = ff(a, b, c, d, x[i + 12], 7, 1804603682); d = ff(d, a, b, c, x[i + 13], 12, -40341101); c = ff(c, d, a, b, x[i + 14], 17, -1502002290); b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
      a = gg(a, b, c, d, x[i + 1], 5, -165796510); d = gg(d, a, b, c, x[i + 6], 9, -1069501632); c = gg(c, d, a, b, x[i + 11], 14, 643717713); b = gg(b, c, d, a, x[i], 20, -373897302);
      a = gg(a, b, c, d, x[i + 5], 5, -701558691); d = gg(d, a, b, c, x[i + 10], 9, 38016083); c = gg(c, d, a, b, x[i + 15], 14, -660478335); b = gg(b, c, d, a, x[i + 4], 20, -405537848);
      a = gg(a, b, c, d, x[i + 9], 5, 568446438); d = gg(d, a, b, c, x[i + 14], 9, -1019803690); c = gg(c, d, a, b, x[i + 3], 14, -187363961); b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
      a = gg(a, b, c, d, x[i + 13], 5, -1444681467); d = gg(d, a, b, c, x[i + 2], 9, -51403784); c = gg(c, d, a, b, x[i + 7], 14, 1735328473); b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
      a = hh(a, b, c, d, x[i + 5], 4, -378558); d = hh(d, a, b, c, x[i + 8], 11, -2022574463); c = hh(c, d, a, b, x[i + 11], 16, 1839030562); b = hh(b, c, d, a, x[i + 14], 23, -35309556);
      a = hh(a, b, c, d, x[i + 1], 4, -1530992060); d = hh(d, a, b, c, x[i + 4], 11, 1272893353); c = hh(c, d, a, b, x[i + 7], 16, -155497632); b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
      a = hh(a, b, c, d, x[i + 13], 4, 681279174); d = hh(d, a, b, c, x[i], 11, -358537222); c = hh(c, d, a, b, x[i + 3], 16, -722521979); b = hh(b, c, d, a, x[i + 6], 23, 76029189);
      a = hh(a, b, c, d, x[i + 9], 4, -640364487); d = hh(d, a, b, c, x[i + 12], 11, -421815835); c = hh(c, d, a, b, x[i + 15], 16, 530742520); b = hh(b, c, d, a, x[i + 2], 23, -995338651);
      a = ii(a, b, c, d, x[i], 6, -198630844); d = ii(d, a, b, c, x[i + 7], 10, 1126891415); c = ii(c, d, a, b, x[i + 14], 15, -1416354905); b = ii(b, c, d, a, x[i + 5], 21, -57434055);
      a = ii(a, b, c, d, x[i + 12], 6, 1700485571); d = ii(d, a, b, c, x[i + 3], 10, -1894986606); c = ii(c, d, a, b, x[i + 10], 15, -1051523); b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
      a = ii(a, b, c, d, x[i + 8], 6, 1873313359); d = ii(d, a, b, c, x[i + 15], 10, -30611744); c = ii(c, d, a, b, x[i + 6], 15, -1560198380); b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
      a = ii(a, b, c, d, x[i + 4], 6, -145523070); d = ii(d, a, b, c, x[i + 11], 10, -1120210379); c = ii(c, d, a, b, x[i + 2], 15, 718787259); b = ii(b, c, d, a, x[i + 9], 21, -343485551);
      a = safeAdd(a, olda); b = safeAdd(b, oldb); c = safeAdd(c, oldc); d = safeAdd(d, oldd);
    }
    return [a, b, c, d];
  };
  const str2binl = (str) => {
    const bin = [];
    const utf8 = unescape(encodeURIComponent(str));
    for (let i = 0; i < utf8.length * 8; i += 8) bin[i >> 5] |= (utf8.charCodeAt(i / 8) & 0xff) << (i % 32);
    return bin;
  };
  const rhex = (n) => {
    let s = "";
    for (let j = 0; j < 4; j += 1) s += (`0${((n >> (j * 8 + 4)) & 0x0f).toString(16)}`).slice(-1) + (`0${((n >> (j * 8)) & 0x0f).toString(16)}`).slice(-1);
    return s;
  };
  return binlMD5(str2binl(s), unescape(encodeURIComponent(s)).length * 8).map(rhex).join("");
}

function genSig() {
  const ts = Math.floor(Date.now() / 1000);
  return `${ts}.lpw6vgqzsp.${md5(`${ts}${SECRET}`)}`;
}

function getApiHeaders(token = "") {
  const h = {
    "User-Agent": "Dart/3.5 (dart:io)",
    "Accept-Language": "zh-TW",
    "Host": "jdforrepam.com",
    "jdSignature": genSig(),
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

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
    saveToken: "\u4fdd\u5b58 token",
    noToken: "\u8bf7\u5148\u8bbe\u7f6e token",
    badToken: "token \u65e0\u6548\u6216\u6743\u9650\u4e0d\u8db3",
    genToken: "\u751f\u6210 token",
    tokenGenerated: "token \u5df2\u751f\u6210\u5e76\u4fdd\u5b58",
    tokenFailed: "\u751f\u6210 token \u5931\u8d25\uff1a",
    inputAccount: "\u8bf7\u8f93\u5165\u8d26\u53f7\u548c\u5bc6\u7801",
    username: "\u8d26\u53f7",
    password: "\u5bc6\u7801",
    badShape: "\u63a5\u53e3\u8fd4\u56de\u7ed3\u6784\u5f02\u5e38",
    loading: "\u52a0\u8f7d\u4e2d...",
    cached: "\u5df2\u4ece\u7f13\u5b58\u52a0\u8f7d",
    loaded: "\u52a0\u8f7d\u5b8c\u6210",
    empty: "\u6682\u65e0\u6570\u636e",
    load: "\u52a0\u8f7d",
    refresh: "\u5237\u65b0",
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
  const period = () => pageState.period.value;

  const request = ({ path, query, headers = {} }) => new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== "" && value !== undefined && value !== null) url.searchParams.set(key, value);
    });
    GM_xmlhttpRequest({
      method: path === "/api/v1/sessions" ? "POST" : "GET",
      url: url.href,
      headers,
      anonymous: false,
      withCredentials: true,
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
    ? `${CACHE_PREFIX}top_${pageState.period.value || "default"}_${pageState.type.value || "default"}_${pageState.startRank.value}_${pageState.ignoreWatched.value}`
    : `${CACHE_PREFIX}playback_${pageState.period.value || "daily"}_${pageState.filterBy.value}`;

  const getRequestConfig = () => {
    if (!isTop()) {
      return {
        path: "/api/v1/rankings/playback",
        query: { filter_by: pageState.filterBy.value, period: pageState.period.value || "daily" },
        headers: getApiHeaders(),
      };
    }

    const token = pageState.token.value.trim();
    if (!token) throw new Error("NO_TOKEN");
    return {
      path: "/api/v1/movies/top",
      query: {
        period: pageState.period.value,
        type: pageState.type.value,
        type_value: "",
        start_rank: pageState.startRank.value,
        ignore_watched: pageState.ignoreWatched.value,
        page: "1",
        limit: "50",
      },
      headers: getApiHeaders(token),
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

  const loginAndSaveToken = async (username, password) => {
    try {
      setStatus(T.loading, "is-info");
      const res = await request({
        path: "/api/v1/sessions",
        query: {
          username,
          password,
          device_uuid: "04b9534d-5118-53de-9f87-2ddded77111e",
          device_name: "Chrome",
          device_model: "Browser",
          platform: "web",
          system_version: "1.0",
          app_version: "official",
          app_version_number: "1.9.29",
          app_channel: "official",
        },
        headers: getApiHeaders(),
      });
      const data = JSON.parse(res.responseText || "{}");
      const token = data?.data?.token;
      if (!token) throw new Error(data?.error || T.badShape);
      GM_setValue(TOKEN_KEY, token);
      GM_setValue("jdb_rank_username", username);
      pageState.token.value = token;
      setStatus(T.tokenGenerated, "is-success");
      loadRankings(true);
    } catch (err) {
      const message = err?.status ? `HTTP ${err.status}: ${(err.responseText || "").slice(0, 200)}` : String(err?.message || err);
      setStatus(T.tokenFailed + message, "is-danger");
    }
  };

  const renderPageHTML = () => `<div class="x-rankings-page container">
    <h1 class="title is-4">${T.title}</h1>
    <div class="x-rank-controls">
      <label class="x-rank-control"><span>${T.list}</span><span class="select is-small"><select data-rank-field="rankType"><option value="playback">${T.playback}</option><option value="top">TOP250</option></select></span></label>
      <label class="x-rank-control"><span>${T.period}</span><span class="select is-small"><select data-rank-field="period"></select></span></label>
      <label class="x-rank-control x-rank-top"><span>${T.type}</span><span class="select is-small"><select data-rank-field="type"><option value="">${T.def}</option><option value="0">0 ${T.coded}</option><option value="1">1 ${T.uncoded}</option><option value="all">all ${T.all}</option></select></span></label>
      <label class="x-rank-control x-rank-top"><span>${T.startRank}</span><span class="select is-small"><select data-rank-field="startRank"><option value="1">1</option><option value="51">51</option><option value="101">101</option><option value="151">151</option><option value="201">201</option></select></span></label>
      <label class="x-rank-control x-rank-top"><span>${T.ignoreWatched}</span><span class="select is-small"><select data-rank-field="ignoreWatched"><option value="false">false</option><option value="true">true</option></select></span></label>
      <label class="x-rank-control x-rank-top"><span>${T.username}</span><input class="input is-small" data-rank-field="username" type="text"></label>
      <label class="x-rank-control x-rank-top"><span>${T.password}</span><input class="input is-small" data-rank-field="password" type="password"></label>
      <button class="button is-small x-rank-top" data-rank-action="loginToken">${T.genToken}</button>
      <label class="x-rank-control x-rank-top"><span>token</span><input class="input is-small" data-rank-field="token" type="password" placeholder="Bearer token"></label>
      <button class="button is-small x-rank-top" data-rank-action="saveToken">${T.saveToken}</button>
      <label class="x-rank-control x-rank-playback"><span>${T.filter}</span><span class="select is-small"><select data-rank-field="filterBy"><option value="all">all ${T.all}</option><option value="high_score">high_score ${T.highScore}</option></select></span></label>
      <button class="button is-small is-link" data-rank-action="load">${T.load}</button>
      <button class="button is-small" data-rank-action="refresh">${T.refresh}</button>
    </div>
    <div class="notification x-rank-status" hidden></div>
    <div class="movie-list h cols-4 vcols-8"></div>
  </div>`;

  window.renderRankingsPage = (typeFromNav) => {
    const root = document.querySelector(".section") || document.querySelector("main") || document.body;
    root.innerHTML = renderPageHTML();
    pageState = {
      root,
      rankType: field("rankType"),
      period: field("period"),
      type: field("type"),
      startRank: field("startRank"),
      ignoreWatched: field("ignoreWatched"),
      username: field("username"),
      password: field("password"),
      token: field("token"),
      filterBy: field("filterBy"),
      status: root.querySelector(".x-rank-status"),
      list: root.querySelector(".movie-list"),
      topControls: root.querySelectorAll(".x-rank-top"),
      playbackControls: root.querySelectorAll(".x-rank-playback"),
    };

    pageState.username.value = GM_getValue("jdb_rank_username", "");
    pageState.token.value = GM_getValue(TOKEN_KEY, "");
    {
      const params = new URLSearchParams(location.search);
      const initialType = typeFromNav || params.get("type") || "playback";
      pageState.rankType.value = initialType === "top" ? "top" : "playback";
    }
    syncControls(true);
    pageState.rankType.addEventListener("change", () => {
      const type = pageState.rankType.value;
      history.replaceState(null, "", `/?x_rankings=1&type=${type}`);
      syncControls(true);
      loadRankings();
    });
    action("load").addEventListener("click", () => loadRankings());
    action("refresh").addEventListener("click", () => loadRankings(true));
    action("saveToken").addEventListener("click", () => {
      GM_setValue(TOKEN_KEY, pageState.token.value.trim());
      setStatus(T.tokenSaved, "is-success");
    });
    action("loginToken").addEventListener("click", () => {
      const username = pageState.username.value.trim();
      const password = pageState.password.value;
      if (!username || !password) return setStatus(T.inputAccount, "is-warning");
      loginAndSaveToken(username, password);
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

    const wrap = document.createElement(navList.matches("ul") ? "li" : "div");
    wrap.className = navList.matches("ul") ? "x-rankings-nav dropdown is-hoverable" : "navbar-item has-dropdown is-hoverable x-rankings-nav";
    wrap.innerHTML = navList.matches("ul")
      ? `<a class="x-rankings-trigger" href="${VOID}"><span>${T.title}</span><span class="icon is-small">▾</span></a><div class="dropdown-menu"><div class="dropdown-content"><a class="dropdown-item" data-rank-nav="top">TOP250</a><a class="dropdown-item" data-rank-nav="playback">${T.playback}</a></div></div>`
      : `<a class="navbar-link x-rankings-trigger" href="${VOID}">${T.title}</a><div class="navbar-dropdown"><a class="navbar-item" data-rank-nav="top">TOP250</a><a class="navbar-item" data-rank-nav="playback">${T.playback}</a></div>`;
    wrap.addEventListener("click", (e) => {
      const target = e.target.closest("[data-rank-nav]");
      if (!target) {
        if (e.target.closest(".x-rankings-trigger")) {
          e.preventDefault();
          wrap.classList.toggle("is-active");
        }
        return;
      }
      e.preventDefault();
      wrap.classList.remove("is-active");
      const type = target.dataset.rankNav;
      history.pushState(null, "", `/?x_rankings=1&type=${type}`);
      window.renderRankingsPage(type);
    });
    navList.insertBefore(wrap, settings || null);
  };

  document.addEventListener("click", ({ target }) => {
    if (!target.closest(".x-rankings-nav")) document.querySelector(".x-rankings-nav.is-active")?.classList.remove("is-active");
  });

  insertNav();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", insertNav, { once: true });
  setTimeout(insertNav, 500);

  if (new URLSearchParams(location.search).has("x_rankings")) window.renderRankingsPage();
  window.addEventListener("popstate", () => {
    if (!new URLSearchParams(location.search).has("x_rankings")) location.reload();
  });
})();
