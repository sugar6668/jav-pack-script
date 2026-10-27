// ==UserScript==
// @name            JavDB.reviewKeywords
// @namespace       JavDB.reviewKeywords.local
// @version         0.5.2
// @description     单片与批量短评筛选，识别 ed2k/magnet 资源，联动 offline115 归档，支持增量缓存和 TXT 导出。
// @match           https://javdb.com/*
// @icon            https://javdb.com/favicon.ico
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Req.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.ReqDB.lib.js
// @connect         jdforrepam.com
// @run-at          document-end
// @noframes
// @grant           GM_xmlhttpRequest
// @grant           GM_getValue
// @grant           GM_setValue
// @grant           GM_addStyle
// @grant           GM_setClipboard
// ==/UserScript==

(() => {
  "use strict";
  if (window.self !== window.top) return;

  // API 域名变动时，同步修改此处和上面的 @connect。
  const API_ORIGIN = "https://jdforrepam.com";
  const CACHE_PREFIX = "JavDB.reviewKeywords.cache.v1.";
  const PAGE_SIZE = 100;
  const REQUEST_GAP = 1000;
  const CARD_SELECTOR = ".movie-list .item";
  const cacheMemo = new Map();
  const singlePanels = new Map();
  const controllers = new Set();
  const offlineContexts = new Map();
  const fetchingMovies = new Map();
  const BRIDGE_REQUEST = "JavDB.reviewOffline.request.v2";
  const BRIDGE_RESPONSE = "JavDB.reviewOffline.response.v2";
  let mainPanel;
  let nextRequestAt = 0;
  let requestQueue = Promise.resolve();
  let cacheWarning = "";
  let cacheWriteFailed = false;
  let styled = false;

  const bridgeRequest = (type, movie, data = {}, onProgress) => new Promise((resolve, reject) => {
    if (document.documentElement.dataset.javdbReviewOfflineBridge !== "2") {
      reject(new Error("请更新并启用 JavDB.offline115 0.0.11 或更高版本，并重新打开页面；旧版离线接口已停用"));
      return;
    }
    const id = crypto.randomUUID();
    let timer;
    const finish = (callback, value) => {
      clearTimeout(timer);
      document.removeEventListener(BRIDGE_RESPONSE, listener);
      callback(value);
    };
    const listener = (event) => {
      let response;
      try { response = JSON.parse(event.detail); } catch { return; }
      if (!response || response.id !== id) return;
      if (response.kind === "accepted") {
        clearTimeout(timer);
        if (type === "actions") timer = setTimeout(() => finish(reject, new Error("读取离线目录超时，请重试")), 45000);
      } else if (response.kind === "progress" && response.state) onProgress?.(response.state);
      else if (response.kind === "error") finish(reject, new Error(response.message));
      else if (response.kind === "result") finish(resolve, response.result);
    };
    document.addEventListener(BRIDGE_RESPONSE, listener);
    timer = setTimeout(() => finish(reject, new Error("离线脚本没有响应，请确认两个脚本均已更新并启用")), 5000);
    document.dispatchEvent(new CustomEvent(BRIDGE_REQUEST, { detail: JSON.stringify({ id, type, movieId: movie.id, movieUrl: movie.url, ...data }) }));
  });
  const offlineContext = (movie) => {
    if (!offlineContexts.has(movie.id)) offlineContexts.set(movie.id, { actions: null, selected: null, loading: false, error: "", jobs: new Map(), listeners: new Set() });
    return offlineContexts.get(movie.id);
  };
  const notifyOffline = (context) => [...context.listeners].forEach((listener) => listener());
  const loadOfflineActions = async (movie) => {
    const context = offlineContext(movie);
    if (context.loading) return;
    context.loading = true;
    context.error = "";
    notifyOffline(context);
    try {
      const result = await bridgeRequest("actions", movie);
      context.actions = result.actions || [];
      context.code = result.code;
      context.selected = context.actions.find((action) => action.actor) || context.actions[0] || null;
      if (!context.selected) context.error = "离线配置中没有适用于本片的归档目录";
    } catch (error) { context.error = error.message; }
    finally { context.loading = false; notifyOffline(context); }
  };
  const submitOfflineLink = async (movie, link) => {
    const context = offlineContext(movie);
    if (!context.selected || context.jobs.get(link.key)?.pending) return;
    const action = context.selected;
    const job = { pending: true, state: "queued", message: `准备提交到 ${action.dir}` };
    context.jobs.set(link.key, job);
    notifyOffline(context);
    try {
      const result = await bridgeRequest("submit", movie, { url: link.url, action: { index: action.index, idx: action.idx }, destination: action.dir }, (state) => {
        job.state = state.state;
        job.message = ({ preparing: "正在读取影片资料", queued: "排队中", running: "离线中", waiting: "等待 115 下载完成", archiving: "正在整理归档", verifying: "等待 115 验证", paused: "115 操作已暂停" })[state.state] || state.state;
        notifyOffline(context);
      });
      job.state = result.status;
      job.message = `${result.msg || result.status}${result.realPath ? `；归档目录：${result.realPath}` : ""}`;
    } catch (error) { job.state = "error"; job.message = error.message; }
    finally { job.pending = false; notifyOffline(context); }
  };

  const REVIEW_ICONS = {"reviews":"<path d=\"M21 11.5a8.4 8.4 0 0 1-1.1 4.2 8.6 8.6 0 0 1-7.6 4.3 8.4 8.4 0 0 1-4.2-1.1L3 21l2.1-5.1A8.4 8.4 0 0 1 4 11.7a8.6 8.6 0 0 1 4.3-7.6A8.4 8.4 0 0 1 12.5 3h.5a8.6 8.6 0 0 1 8 8v.5Z\"/><path d=\"M8 10h8M8 14h5\"/>","close":"<path d=\"m6 6 12 12M18 6 6 18\"/>","search":"<circle cx=\"10.8\" cy=\"10.8\" r=\"6.8\"/><path d=\"m16 16 4.5 4.5\"/>","sliders":"<path d=\"M4 6h4m5 0h7M4 12h10m5 0h1M4 18h2m5 0h9\"/><circle cx=\"10.5\" cy=\"6\" r=\"2.5\"/><circle cx=\"16.5\" cy=\"12\" r=\"2.5\"/><circle cx=\"8.5\" cy=\"18\" r=\"2.5\"/>","refresh":"<path d=\"M20 7v5h-5M4 17v-5h5\"/><path d=\"M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3a7 7 0 0 0 11.5-1\"/>","stop":"<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"2\"/>","chevron":"<path d=\"m7 10 5 5 5-5\"/>","copy":"<rect x=\"8\" y=\"8\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3\"/>","download":"<path d=\"M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4\"/>","folder":"<path d=\"M3 7V5h7l2 3h9v11H3V7Z\"/>","check":"<path d=\"m5 12 4 4L19 6\"/>","link":"<path d=\"m10 13 4-4M8 15l-2 2a3.5 3.5 0 0 1-5-5l5-5a3.5 3.5 0 0 1 5 0m2 2 2-2a3.5 3.5 0 0 1 5 5l-5 5a3.5 3.5 0 0 1-5 0\" transform=\"translate(1 0)\"/>","file":"<path d=\"M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 13h8M8 17h5\"/>","external":"<path d=\"M14 3h7v7m-1-6-9 9M10 4H4v16h16v-6\"/>","film":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M7 3v18M17 3v18M3 8h4m-4 8h4M17 8h4m-4 8h4\"/>","like":"<path d=\"M7 10H3v11h4V10Zm0 0 5-7c2 0 2 2 2 3l-1 4h6a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 2H7\"/>","shield":"<path d=\"m12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6l8-3Z\"/><path d=\"m8 12 3 3 5-6\"/>"};

  const createPanel = (singleMovie = null) => {
    const STORE_KEY = singleMovie ? "JavDB.reviewKeywords.singleSettings.v1" : "JavDB.reviewKeywords.settings.v1";
    const panelId = singleMovie ? `javdb-review-keywords-${singleMovie.id}` : "javdb-review-keywords";
    const detailId = location.pathname.match(/^\/v\/([a-zA-Z0-9]+)\/?$/)?.[1];
    const records = new Map();
    const boundButtons = new WeakSet();
    let panel;
    let ui;
    let trigger;
    let launcher;
    let activeRun = null;
    let ensureScheduled = false;
    let returnFocus;
    let oldOverflow = "";
    let selectedMovieId = "";
    let keywordTimer;
    let modalShown = false;

    const element = (tag, className = "", text = "") => {
      const node = document.createElement(tag);
      node.className = className;
      node.textContent = text;
      return node;
    };
    const icon = (name) => {
      const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      node.setAttribute("class", "icon");
      node.setAttribute("viewBox", "0 0 24 24");
      node.setAttribute("aria-hidden", "true");
      node.innerHTML = REVIEW_ICONS[name] || "";
      return node;
    };
    const abortError = () => new DOMException("已停止", "AbortError");
    const apiError = (message, fatal = false) => Object.assign(new Error(message), { fatal });
    const parseKeywords = (text) => [...new Map(String(text).split(/[,，;；\r\n]+/)
      .map((word) => word.trim()).filter(Boolean).map((word) => [word.toLowerCase(), word])).values()];
    const escapeRegExp = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = (text, keywords, mode) => {
      const lower = text.toLowerCase();
      const test = (word) => lower.includes(word.toLowerCase());
      return mode === "all" ? keywords.every(test) : keywords.some(test);
    };
    const reviewKey = (review) => review.id != null ? `id:${review.id}` : JSON.stringify([review.username, review.content, review.created_at]);
    const readSettings = () => ({
      keywords: ui.keywords.value,
      mode: ui.mode.value === "all" ? "all" : "any",
      maxPages: Math.min(20, Math.max(1, Math.floor(Number(ui.pages.value) || 3))),
      refreshHours: Math.max(0, Math.min(168, Number(ui.refreshAge.value) || 0)),
      follow: ui.follow.checked,
      view: ui.view.value,
    });
    const loadCache = (id) => {
      if (cacheMemo.has(id)) return cacheMemo.get(id);
      let cache = null;
      try {
        const saved = GM_getValue(CACHE_PREFIX + id, null);
        if (saved?.version === 1 && saved.movieId === id && Array.isArray(saved.reviews)
          && saved.reviews.every((review) => review && typeof review.content === "string")) cache = saved;
      } catch { cacheWarning = "读取本地缓存失败，本次仍可获取和导出。"; }
      cacheMemo.set(id, cache);
      return cache;
    };
    const cacheIsFresh = (cache, settings) => Boolean(cache?.checkedAt && settings.refreshHours > 0
      && Date.now() - cache.checkedAt < settings.refreshHours * 3600000
      && (cache.state === "complete" || (cache.state === "partial" && cache.reason === "limit" && cache.pages >= settings.maxPages)));
    const cacheState = (cache, settings) => {
      if (!cache) return { state: "new", text: "未获取" };
      if (cache.state === "error") return { state: "error", text: "读取失败" };
      if (cache.state === "stopped") return { state: "partial", text: "获取中断" };
      if (!cacheIsFresh(cache, settings)) return { state: "stale", text: "待更新" };
      return cache.state === "complete" ? { state: "complete", text: "已获取" } : { state: "partial", text: "部分获取" };
    };
    const persistRecord = (record) => {
      const cache = {
        version: 1, movieId: record.movie.id, title: record.movie.title, url: record.movie.url,
        state: record.state, reason: record.reason, pages: record.pages, checkedAt: record.checkedAt || 0,
        attemptedAt: Date.now(), note: record.note,
        reviews: [...new Map([...(loadCache(record.movie.id)?.reviews || []), ...record.reviews]
          .map(({ id, username, content, score, likes_count, created_at }) => {
            const review = { id, username, content, score, likes_count, created_at };
            return [reviewKey(review), review];
          })).values()],
      };
      try { GM_setValue(CACHE_PREFIX + record.movie.id, cache); }
      catch {
        cacheWriteFailed = true;
        cacheWarning = "缓存保存失败，获取状态暂时仅在本页有效；请先导出需要的数据。";
      }
      cacheMemo.set(record.movie.id, cache);
      ui.cacheWarning.textContent = cacheWarning;
      mainPanel?.refreshCards();
    };
    const recordFromCache = (movie, keywords, mode) => {
      const cache = loadCache(movie.id);
      return {
        movie, keywords, mode, view: ui.view.value, reviews: (cache?.reviews || []).map((review) => ({ ...review, downloadLinks: extractLinks(review.content) })),
        pages: cache?.pages || 0, state: cache?.state || "new", reason: cache?.reason || "",
        checkedAt: cache?.checkedAt || 0, note: cache ? `本地缓存：${cache.note || "已有本地数据。"}` : "尚未获取。",
        newCount: 0, error: cache?.state === "error",
      };
    };

    // https://amule-org.github.io/docs/p2p-networks/ed2k/links
    // Keep optional h=/p=/s= fields and the trailing sources field intact.
    const ed2kPattern = () => /ed2k:\/\/\|file\|([^|\r\n<>]+)\|(\d+)\|([a-f\d]{32})\|(?:[a-z][\w-]*=[^|\s<>]+\|)*\/(?:\|sources,[^|\s<>]+\|\/)?/gi;
    const extractEd2k = (text) => {
      const links = new Map();
      for (const match of text.matchAll(ed2kPattern())) {
        // A file is identified by its size and hash, regardless of its name.
        const key = `${match[2].replace(/^0+(?=\d)/, "")}:${match[3].toLowerCase()}`;
        let name = match[1];
        try { name = decodeURIComponent(name); } catch { /* Keep malformed percent escapes as written. */ }
        if (!links.has(key)) links.set(key, { kind: "ed2k", key: `ed2k:${key}`, name, url: match[0] });
      }
      return [...links.values()];
    };
    // BEP 9: keep DN/trackers, validate exact topics, and unify Base32/hex BTIH.
    const magnetPattern = () => /magnet:\?[^\s<>"'`，。；！？”“‘’（）【】《》]+/gi;
    const trimMagnet = (raw) => {
      let url = raw.replace(/&amp;/gi, "&").replace(/[.,;!?]+$/, "");
      for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
        while (url.endsWith(close) && url.split(close).length > url.split(open).length) url = url.slice(0, -1);
      }
      return url;
    };
    const btihHex = (hash) => {
      if (hash.length === 40) return hash.toLowerCase();
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      const bits = [...hash.toUpperCase()].map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0")).join("");
      return bits.match(/.{8}/g).map((byte) => Number.parseInt(byte, 2).toString(16).padStart(2, "0")).join("");
    };
    const extractLinks = (text) => {
      const links = new Map(extractEd2k(text).map((link) => [link.key, link]));
      for (const match of text.matchAll(magnetPattern())) {
        const url = trimMagnet(match[0]);
        const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
        const topics = params.getAll("xt");
        const btih = topics.map((topic) => topic.match(/^urn:btih:([a-f\d]{40}|[a-z2-7]{32})$/i)?.[1]).find(Boolean);
        const btmh = topics.map((topic) => topic.match(/^urn:btmh:(1220[a-f\d]{64})$/i)?.[1]).find(Boolean);
        if (!btih && !btmh) continue;
        const key = `magnet:${btih ? `btih:${btihHex(btih)}` : `btmh:${btmh.toLowerCase()}`}`;
        if (!links.has(key)) links.set(key, { kind: "magnet", key, url, name: params.get("dn") || "磁力链接" });
      }
      return [...links.values()];
    };
    const matchedReviews = (record) => record.reviews.filter((review) => record.view === "links" ? review.downloadLinks.length > 0
      : record.view === "all" || matches(review.content, record.keywords, record.mode));
    const uniqueLinks = (reviews) => {
      const links = new Map();
      reviews.forEach((review) => review.downloadLinks.forEach((link) => {
        if (!links.has(link.key)) links.set(link.key, link);
      }));
      return [...links.values()];
    };
    const exportRecords = () => [...records.values()].map((record) => ({
      record, reviews: ui.exportScope.value === "all" ? record.reviews : matchedReviews(record),
    })).filter(({ reviews }) => reviews.length);
    const updateExportControls = () => {
      const selected = exportRecords();
      const reviews = selected.flatMap((item) => item.reviews);
      const links = uniqueLinks(reviews);
      ui.exportReviews.disabled = !reviews.length;
      ui.exportLinks.disabled = !links.length;
      ui.exportCount.textContent = selected.length + " 部 · " + reviews.length + " 条 · " + links.length + " 个资源";
    };
    const reviewMeta = (review) => {
      const meta = [review.username || "匿名用户"];
      if (review.score != null) meta.push(`评分 ${review.score}`);
      if (review.likes_count != null) meta.push(`赞 ${review.likes_count}`);
      if (review.created_at) meta.push(String(review.created_at).replace("T", " ").replace(/\.\d+Z$/, " UTC"));
      return meta.join(" · ");
    };
    const downloadText = (text, filename) => {
      // UTF-8 BOM and CRLF keep Chinese text readable in Windows text editors.
      const blob = new Blob(["\uFEFF", text.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n")], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = element("a");
      link.href = url;
      link.download = filename;
      link.hidden = true;
      document.body.append(link);
      try { link.click(); }
      finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
    };
    const exportText = (linksOnly) => {
      const selected = exportRecords();
      const reviews = selected.flatMap((item) => item.reviews);
      const links = uniqueLinks(reviews);
      if (linksOnly ? !links.length : !reviews.length) return;
      const now = new Date();
      const stamp = [now.getFullYear(), ...[now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((part) => String(part).padStart(2, "0"))].join("");
      const scope = ui.exportScope.value === "all" ? "全部已读评论" : "当前筛选结果";
      const filename = `JavDB_${linksOnly ? "资源链接" : "短评"}_${scope}_${stamp}.txt`;
      let text;
      if (linksOnly) {
        // One intact URI per line, ready to paste into a download client's batch input.
        text = links.map((link) => link.url).join("\n") + "\n";
      } else {
        const lines = ["JavDB 短评关键词导出", `导出时间：${now.toLocaleString()}`, `导出范围：${scope}`,
          `显示内容：${selected[0].record.view === "links" ? "含资源链接的评论" : selected[0].record.view === "all" ? "全部评论" : "关键词匹配"}`,
          `关键词：${selected[0].record.keywords.join("、") || "未设置"}`,
          `匹配方式：${selected[0].record.mode === "all" ? "同一条评论包含所有词" : "包含任意词"}`,
          `共 ${selected.length} 部影片 / ${reviews.length} 条评论 / ${links.length} 个资源链接（去重）`,
          activeRun ? "任务仍在进行，本文件仅包含导出时已读取的评论。" : "读取范围及是否完整请参见各影片的读取状态。", ""];
        selected.forEach(({ record, reviews: items }) => {
          lines.push("=".repeat(60), `影片：${record.movie.title}`, `地址：${record.movie.url}`,
            `累计缓存：${record.reviews.length} 条；最近读取 ${record.pages} 页；本次导出 ${items.length} 条`,
            `最近有效获取：${record.checkedAt ? new Date(record.checkedAt).toLocaleString() : "尚未完成本次获取"}`, `读取状态：${record.note}`, "");
          items.forEach((review, index) => {
            lines.push(`评论 ${index + 1} · ${reviewMeta(review)}`, "原评论：", review.content, "", "-".repeat(40), "");
          });
        });
        text = lines.join("\n");
      }
      try {
        downloadText(text, filename);
        ui.exportStatus.textContent = `已生成 ${filename}（${linksOnly ? `${links.length} 个去重资源链接` : `${reviews.length} 条原评论`}）。`;
      } catch (error) { ui.exportStatus.textContent = `导出失败：${error.message}`; }
    };

    const delay = (ms, signal) => new Promise((resolve, reject) => {
      if (signal.aborted) return reject(abortError());
      const finish = () => { signal.removeEventListener("abort", cancel); resolve(); };
      const timer = setTimeout(finish, Math.max(0, ms));
      const cancel = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); reject(abortError()); };
      signal.addEventListener("abort", cancel, { once: true });
    });

    const performRequestPage = async (id, page, signal) => {
      await delay(nextRequestAt - Date.now(), signal);
      if (signal.aborted) throw abortError();
      nextRequestAt = Date.now() + REQUEST_GAP;
      const signature = ReqDB.signature();
      if (!signature) throw apiError("无法生成短评请求签名", true);
      const params = new URLSearchParams({ sort_by: "hotly", page, limit: PAGE_SIZE });

      return new Promise((resolve, reject) => {
        let handle;
        let settled = false;
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", cancel);
          callback(value);
        };
        const cancel = () => {
          finish(reject, abortError());
          handle?.abort();
        };
        signal.addEventListener("abort", cancel, { once: true });
        if (signal.aborted) return cancel();

        try {
          handle = GM_xmlhttpRequest({
            method: "GET",
            url: `${API_ORIGIN}/api/v1/movies/${encodeURIComponent(id)}/reviews?${params}`,
            headers: { jdsignature: signature, accept: "application/json" },
            timeout: 15000,
            onload: (response) => {
              try {
                if (response.status < 200 || response.status >= 300) {
                  throw apiError(`短评接口 HTTP ${response.status}`, [401, 403, 429].includes(response.status));
                }
                let body;
                try { body = JSON.parse(response.responseText); }
                catch { throw apiError("短评接口返回了非 JSON 内容，可能需要验证或接口已变更", true); }
                if (!body || typeof body !== "object") throw apiError("短评响应格式异常", true);
                if (body.success === false || body.success === 0 || body.success === "0" || body.action) {
                  throw apiError(`短评接口拒绝请求：${body.message || body.action || "未知原因"}`, true);
                }
                const reviews = body.data?.reviews ?? body.reviews;
                if (!Array.isArray(reviews)) throw apiError("响应中没有有效的短评列表", true);
                finish(resolve, reviews);
              } catch (error) { finish(reject, error); }
            },
            onerror: () => finish(reject, apiError("短评网络请求失败")),
            ontimeout: () => finish(reject, apiError("短评请求超时")),
            onabort: () => finish(reject, abortError()),
          });
        } catch (error) { finish(reject, error); }
      });
    };
    const requestPage = (id, page, signal) => {
      const queued = requestQueue.then(() => performRequestPage(id, page, signal));
      requestQueue = queued.catch(() => {});
      return new Promise((resolve, reject) => {
        const cancel = () => { signal.removeEventListener("abort", cancel); reject(abortError()); };
        const finish = (callback, value) => { signal.removeEventListener("abort", cancel); callback(value); };
        if (signal.aborted) return cancel();
        signal.addEventListener("abort", cancel, { once: true });
        queued.then((value) => finish(resolve, value), (error) => finish(reject, error));
      });
    };

    const movieFromCard = (card) => {
      const link = card.querySelector('a[href*="/v/"]');
      if (!link) return null;
      const url = new URL(link.href, location.href);
      const id = url.pathname.match(/^\/v\/([a-zA-Z0-9]+)\/?$/)?.[1];
      if (!id || url.origin !== location.origin) return null;
      return {
        id, url: `${url.origin}/v/${id}`,
        title: card.querySelector(".video-title strong")?.textContent.trim()
          || card.querySelector(".video-title")?.textContent.trim() || id,
      };
    };

    const currentMovies = () => {
      if (singleMovie) return [singleMovie];
      if (detailId) return [{
        id: detailId, url: `${location.origin}/v/${detailId}`,
        title: document.querySelector(".video-detail .title strong")?.textContent.trim()
          || document.querySelector("h2.title")?.textContent.trim() || detailId,
      }];
      const movies = new Map();
      document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
        if (!card.getClientRects().length) return;
        const movie = movieFromCard(card);
        if (movie) movies.set(movie.id, movie);
      });
      return [...movies.values()];
    };

    const updateCardStatus = (card, movie) => {
      const button = card.querySelector(".rk-card-button");
      const badge = card.querySelector(".rk-fetch-state");
      if (!button || !badge) return;
      const cache = loadCache(movie.id);
      const record = records.get(movie.id);
      const loading = fetchingMovies.has(movie.id);
      const status = loading ? { state: "loading", text: "获取中" } : cacheState(cache, readSettings());
      badge.dataset.state = status.state;
      const label = `${status.text}${cache ? ` · ${cache.reviews.length}` : ""}`;
      if (badge.textContent !== label) badge.textContent = label;
      const checked = cache?.checkedAt ? new Date(cache.checkedAt).toLocaleString() : "尚未有效获取";
      badge.title = `${status.text}；累计缓存 ${cache?.reviews.length || 0} 条；最近有效获取：${checked}。${cache?.note || ""}`;
      button.textContent = loading ? "读取中…" : record ? `短评 ${record.matchCount || 0}` : "筛选短评";
      button.title = record?.note || "打开短评筛选；优先使用有效缓存";
      button.disabled = false;
      button.dataset.movieId = movie.id;
    };
    const updateListInfo = () => {
      const movies = currentMovies();
      const settings = readSettings();
      const fresh = movies.filter((movie) => cacheIsFresh(loadCache(movie.id), settings)).length;
      ui.listInfo.textContent = "已加载 " + movies.length + " 部 · 可复用 " + fresh + " 部";
      renderMovieNav();
      ui.cacheWarning.textContent = cacheWarning;
    };

    const highlight = (text, keywords) => {
      const fragment = document.createDocumentFragment();
      if (!keywords.length) { fragment.append(document.createTextNode(text)); return fragment; }
      const pattern = new RegExp([...keywords].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|"), "giu");
      let end = 0;
      for (const match of text.matchAll(pattern)) {
        fragment.append(document.createTextNode(text.slice(end, match.index)));
        fragment.append(element("mark", "", match[0]));
        end = match.index + match[0].length;
      }
      fragment.append(document.createTextNode(text.slice(end)));
      return fragment;
    };

    const renderMovieNav = () => {
      if (!ui?.movieNav) return;
      const top = ui.movieNav.scrollTop, left = ui.movieNav.scrollLeft;
      const list = currentMovies();
      ui.movieCount.textContent = list.length + " 部";
      ui.movieNav.replaceChildren();
      for (const movie of list) {
        const record = records.get(movie.id);
        const status = fetchingMovies.has(movie.id) ? { state: "loading", text: "获取中" } : cacheState(loadCache(movie.id), readSettings());
        const button = element("button", "movie-option");
        button.type = "button";
        button.dataset.movieId = movie.id;
        button.setAttribute("aria-pressed", String(selectedMovieId === movie.id));
        const thumb = element("span", "film-thumb");
        thumb.style.setProperty("--cover-a", "#8da9c2");
        thumb.style.setProperty("--cover-b", "#577c9b");
        thumb.append(icon("film"));
        const body = element("span", "movie-option-body");
        const row = element("span", "movie-option-top");
        row.append(element("span", "movie-code", movie.title), element("span", "hit-count", record ? (record.matchCount || 0) + " 条命中" : "待筛选"));
        const badge = element("span", "badge " + (status.state === "complete" ? "done" : status.state === "loading" ? "fetching" : status.state === "new" ? "new" : "partial"), status.text);
        body.append(row, element("span", "movie-name", loadCache(movie.id)?.checkedAt ? new Date(loadCache(movie.id).checkedAt).toLocaleString() : "尚未有效获取"), badge);
        button.append(thumb, body);
        button.addEventListener("click", () => {
          selectedMovieId = movie.id;
          if (!records.has(movie.id)) records.set(movie.id, recordFromCache(movie, parseKeywords(ui.keywords.value), ui.mode.value));
          renderRecord(records.get(movie.id));
          ui.results.scrollTop = 0;
          ui.movieNav.querySelector('[data-movie-id="' + movie.id + '"]')?.focus({ preventScroll: true });
        });
        ui.movieNav.append(button);
      }
      ui.movieNav.scrollTop = top;
      ui.movieNav.scrollLeft = left;
    };
    const renderOfflineRoute = (record, context) => {
      const box = element("div", "archive-bar rk-offline-route");
      const label = element("label", "archive-destination");
      label.append(icon("folder"), element("span", "", "归档到"));
      const select = element("select");
      select.setAttribute("aria-label", record.movie.title + " 的离线归档目录");
      select.disabled = !context.actions?.length || context.loading;
      if (!context.actions?.length) select.append(element("option", "", "尚未读取归档目录"));
      (context.actions || []).forEach((action) => {
        const option = element("option", "", action.dir);
        option.value = action.index + ":" + action.idx;
        select.append(option);
      });
      if (context.selected) select.value = context.selected.index + ":" + context.selected.idx;
      select.addEventListener("change", () => {
        context.selected = context.actions.find((action) => action.index + ":" + action.idx === select.value);
        notifyOffline(context);
      });
      label.append(select);
      const refresh = element("button", "btn quiet icon-only small", "");
      refresh.type = "button";
      refresh.title = context.loading ? "读取目录中…" : context.actions ? "刷新离线目录" : "读取离线目录";
      refresh.setAttribute("aria-label", refresh.title);
      refresh.disabled = context.loading;
      refresh.append(icon("refresh"));
      refresh.addEventListener("click", () => { void loadOfflineActions(record.movie); });
      box.append(label, element("span", "archive-hint", "本次任务使用独立子目录"), refresh);
      if (context.error) box.append(element("span", "rk-error", context.error));
      return box;
    };
    const rememberExpanded = (record, node, key) => {
      if (!record.expanded) record.expanded = new Set();
      node.open = record.expanded.has(key);
      node.addEventListener("toggle", () => {
        if (!node.isConnected) return;
        if (node.open) record.expanded.add(key);
        else record.expanded.delete(key);
      });
    };
    const renderResourceLinks = (record, links, context) => {
      const group = element("div", "rk-resources");
      for (const link of links) {
        const row = element("div", "resource rk-resource");
        const top = element("div", "resource-top");
        const type = element("span", "resource-icon " + (link.kind === "ed2k" ? "ed2k" : ""));
        type.append(icon(link.kind === "ed2k" ? "file" : "link"));
        const info = element("div", "resource-info");
        const filename = element("p", "resource-filename", link.name);
        filename.title = link.name;
        const meta = element("div", "resource-meta");
        meta.append(element("span", "resource-type", link.kind.toUpperCase()), element("span", "", "保留完整链接参数"));
        info.append(filename, meta);
        const actions = element("div", "resource-actions");
        const copy = element("button", "btn small", "复制");
        copy.type = "button";
        copy.prepend(icon("copy"));
        copy.addEventListener("click", () => {
          try { GM_setClipboard(link.url, "text"); copy.lastChild.textContent = "已复制"; }
          catch { copy.title = "请展开完整链接后手动复制"; }
        });
        const job = context.jobs.get(link.key);
        const label = job?.pending ? ({ preparing: "准备中", queued: "排队中", running: "离线中", waiting: "等待完成", archiving: "归档中", verifying: "待验证", paused: "已暂停" })[job.state] || "处理中"
          : job?.state === "success" ? "已归档" : job?.state === "pend" ? "继续检测" : job?.state === "error" ? "重试离线" : "115 离线";
        const offlineButton = element("button", "btn small offline rk-link-offline" + (job?.state === "success" ? " is-done" : ""), label);
        offlineButton.type = "button";
        offlineButton.prepend(icon(job?.state === "success" ? "check" : "download"));
        offlineButton.disabled = !context.selected || context.loading || job?.pending || job?.state === "success";
        offlineButton.title = job?.message || "将此链接提交到新的独立任务目录";
        offlineButton.addEventListener("click", () => { void submitOfflineLink(record.movie, link); });
        actions.append(copy, offlineButton);
        top.append(type, info, actions);
        const full = element("details", "resource-links");
        full.append(element("summary", "", "完整链接"));
        const text = element("textarea", "uri-text rk-ed2k-links");
        text.readOnly = true;
        text.rows = 2;
        text.value = link.url;
        text.setAttribute("aria-label", "提取的 " + link.kind + " 完整资源链接");
        full.append(text);
        rememberExpanded(record, full, "link:" + link.key);
        row.append(top, full);
        if (job) row.append(element("p", job.state === "error" ? "rk-error resource-status" : "resource-status", job.message));
        group.append(row);
      }
      return group;
    };
    const renderRecord = (record) => {
      const { movie, reviews, keywords } = record;
      const matched = matchedReviews(record);
      record.matchCount = matched.length;
      if (!selectedMovieId) selectedMovieId = movie.id;
      renderMovieNav();
      if (!singleMovie) document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
        if (card.querySelector(".rk-card-button")?.dataset.movieId === movie.id) updateCardStatus(card, movie);
      });
      updateExportControls();
      if (selectedMovieId !== movie.id) return;
      const heading = element("div", "detail-heading");
      const title = element("div");
      const titleRow = element("div", "detail-title-line");
      titleRow.append(element("h2", "", movie.title));
      const state = record.loading ? "获取中" : cacheState(loadCache(movie.id), readSettings()).text;
      const note = element("p", "detail-description", state + " · 累计缓存 " + reviews.length + " 条 · 命中 " + matched.length + " 条");
      note.title = record.note;
      title.append(titleRow, note);
      const source = element("a", "btn quiet open-detail", "影片详情");
      source.href = movie.url;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.append(icon("external"));
      heading.append(title, source);
      ui.movieHeader.replaceChildren(heading);
      const hasLinks = matched.some((review) => review.downloadLinks.length);
      const context = offlineContext(movie);
      ui.routeContainer.replaceChildren();
      ui.routeContainer.hidden = !hasLinks;
      if (hasLinks) {
        if (!record.unsubscribeOffline) {
          const listener = () => { if (records.get(movie.id) === record && selectedMovieId === movie.id && record.node?.isConnected) renderRecord(record); };
          context.listeners.add(listener);
          record.unsubscribeOffline = () => context.listeners.delete(listener);
        }
        ui.routeContainer.append(renderOfflineRoute(record, context));
      }
      const entry = record.node || element("div", "rk-movie");
      record.node = entry;
      entry.replaceChildren();
      if (record.error) entry.append(element("p", "rk-error", record.note));
      for (const review of matched) {
        const article = element("article", "comment-card rk-review");
        const meta = element("div", "comment-meta");
        const username = review.username || "匿名用户";
        meta.append(element("span", "avatar", username[0]), element("span", "comment-user", username),
          element("span", "comment-date", reviewMeta({ ...review, username: "" }).replace(/^匿名用户\s*·?\s*/, "")));
        const links = review.downloadLinks;
        const text = element("p", "comment-text rk-review-text");
        const readable = links.length ? review.content.replace(ed2kPattern(), "[ed2k 链接已提取]")
          .replace(magnetPattern(), (raw) => extractLinks(raw).some((link) => link.kind === "magnet") ? "[magnet 链接已提取]" : raw) : review.content;
        text.append(highlight(readable, keywords));
        article.append(meta, text);
        if (links.length) {
          article.append(renderResourceLinks(record, links, context));
          const original = element("details", "original-comment rk-original");
          const raw = element("p", "rk-review-text");
          raw.append(highlight(review.content, keywords));
          original.append(element("summary", "", "查看原始评论"), raw);
          rememberExpanded(record, original, "review:" + reviewKey(review));
          article.append(original);
        }
        entry.append(article);
      }
      if (!matched.length) {
        const empty = element("div", "empty-state");
        empty.append(icon("search"), element("h3", "", record.state === "new" ? "这部影片尚未获取短评" : "暂时没有匹配的评论"),
          element("p", "", record.state === "new" ? "点击上方获取按钮，或选择其他已有缓存的影片。" : "可调整关键词，或切换到资源链接、全部评论。"));
        entry.append(empty);
      } else entry.append(element("div", "result-end", "已显示本片 " + matched.length + " 条评论"));
      const scrollTop = ui.results.scrollTop;
      ui.results.replaceChildren(entry);
      ui.results.scrollTop = scrollTop;
      if (singleMovie && hasLinks && !context.actions && !context.loading && !context.error) void loadOfflineActions(movie);
    };

    const fetchMovie = async (record, maxPages, signal) => {
      const seen = new Set();
      const index = new Map(record.reviews.map((review, position) => [reviewKey(review), position]));
      record.pages = 0;
      record.newCount = 0;
      record.state = "partial";
      record.reason = "loading";
      for (let page = 1; page <= maxPages; page++) {
        record.note = `正在读取第 ${page} 页…`;
        renderRecord(record);
        const rows = await requestPage(record.movie.id, page, signal);
        if (signal.aborted) throw abortError();
        record.pages++;
        if (!rows.length) {
          record.state = "complete";
          record.reason = "end";
          record.checkedAt = Date.now();
          record.note = `本次读取到末页，新增 ${record.newCount} 条；历史评论保留在累计缓存中。`;
          persistRecord(record);
          return;
        }
        let added = 0;
        for (const review of rows) {
          if (!review || typeof review.content !== "string") throw apiError("短评内容格式异常", true);
          const key = reviewKey(review);
          if (seen.has(key)) continue;
          seen.add(key);
          const normalized = { ...review, downloadLinks: extractLinks(review.content) };
          if (index.has(key)) record.reviews[index.get(key)] = normalized;
          else {
            index.set(key, record.reviews.length);
            record.reviews.push(normalized);
            record.newCount++;
          }
          added++;
        }
        if (!added) {
          record.reason = "duplicate";
          record.note = "接口返回了重复页，已停止；结果可能不完整，下次增量获取会重试。";
          persistRecord(record);
          return;
        }
        record.note = `本次已读取 ${record.pages} 页，新增 ${record.newCount} 条；获取尚未结束。`;
        persistRecord(record);
        renderRecord(record);
      }
      record.reason = "limit";
      record.checkedAt = Date.now();
      record.note = `部分获取：达到每片 ${maxPages} 页上限，本次新增 ${record.newCount} 条；可提高页数继续检查。`;
      persistRecord(record);
    };

    const setBusy = (busy) => {
      [ui.keywords, ui.mode, ui.view, ui.pages, ui.refreshAge, ui.follow, ui.start, ui.force, ui.local].forEach((node) => { node.disabled = busy; });
      ui.stop.disabled = !busy;
      ui.start.hidden = busy;
      ui.stop.hidden = !busy;
      ui.viewTabs.forEach((button) => { button.disabled = busy; });
    };

    const updateRunStatus = (session, ending = "") => {
      const list = [...records.values()];
      const hits = list.filter((record) => record.matchCount > 0).length;
      const comments = list.reduce((sum, record) => sum + (record.matchCount || 0), 0);
      const state = ending || (session.processing ? `正在处理：${session.currentTitle || ""}。`
        : "跟随中，等待滚动加载新影片；关闭窗口可继续浏览，点击“停止”结束。 ");
      ui.status.textContent = `${state} 已处理 ${session.finished} / ${session.seen.size} 部，复用缓存 ${session.cached} 部，新增 ${session.newCount} 条，命中 ${hits} 部 / ${comments} 条，失败 ${session.failed} 部。`;
      if (trigger) trigger.textContent = ending ? "短评关键词" : session.processing ? `短评关键词 (${session.finished}/${session.seen.size})` : "短评关键词 · 跟随中";
      updateListInfo();
    };
    const finishRun = (session, ending) => {
      if (activeRun !== session) return;
      activeRun = null;
      updateRunStatus(session, ending);
      setBusy(false);
      scheduleEnsure();
    };
    const pump = async (session) => {
      if (session.processing || activeRun !== session) return;
      session.processing = true;
      try {
        while (session.queue.length && !session.controller.signal.aborted) {
          const movie = session.queue.shift();
          session.currentTitle = movie.title;
          const record = recordFromCache(movie, session.keywords, session.settings.mode);
          records.set(movie.id, record);
          updateRunStatus(session);
          if (!session.force && cacheIsFresh(loadCache(movie.id), session.settings)) {
            session.cached++;
            session.finished++;
            record.note = `复用缓存（${new Date(record.checkedAt).toLocaleString()}）：${loadCache(movie.id).note}`;
            renderRecord(record);
            continue;
          }
          record.error = false;
          record.loading = true;
          fetchingMovies.set(movie.id, (fetchingMovies.get(movie.id) || 0) + 1);
          mainPanel?.refreshCards();
          try {
            await fetchMovie(record, session.settings.maxPages, session.controller.signal);
            session.consecutiveFailures = 0;
            session.finished++;
          } catch (error) {
            record.state = error.name === "AbortError" ? "stopped" : "error";
            record.reason = record.state;
            if (error.name === "AbortError") {
              record.note = "获取中断，已读评论和旧缓存均保留，下次增量获取会重试。";
            } else {
              session.failed++;
              session.finished++;
              session.consecutiveFailures++;
              record.error = true;
              record.note = `${error.message}；已读评论和旧缓存均保留，下次增量获取会重试。`;
              if (error.fatal || session.consecutiveFailures >= 3) session.stopReason = error.fatal ? error.message : "连续 3 部读取失败";
            }
            persistRecord(record);
          } finally {
            session.newCount += record.newCount;
            record.loading = false;
            const remaining = fetchingMovies.get(movie.id) - 1;
            if (remaining) fetchingMovies.set(movie.id, remaining);
            else fetchingMovies.delete(movie.id);
            mainPanel?.refreshCards();
            renderRecord(record);
          }
          if (session.stopReason) break;
        }
      } finally {
        session.processing = false;
        if (session.controller.signal.aborted) finishRun(session, "已停止，进度和评论已保存。");
        else if (session.stopReason) finishRun(session, `任务已停止：${session.stopReason}。`);
        else if (!session.follow) finishRun(session, "筛选完成。");
        else updateRunStatus(session);
      }
    };
    const enqueueMovies = (session, movies) => {
      let added = false;
      for (const movie of movies) {
        if (session.seen.has(movie.id)) continue;
        session.seen.add(movie.id);
        session.queue.push(movie);
        added = true;
      }
      if (added || session.queue.length) void pump(session);
    };
    const stopRun = () => {
      const session = activeRun;
      if (!session) return;
      session.controller.abort();
      if (!session.processing) finishRun(session, "已停止跟随，进度和评论已保存。");
    };
    const clearRecords = () => {
      records.forEach((record) => record.unsubscribeOffline?.());
      records.clear();
      selectedMovieId = "";
      ui.movieHeader.replaceChildren();
      ui.routeContainer.replaceChildren();
      ui.routeContainer.hidden = true;
    };
    const hydrateCache = () => {
      if (activeRun) return;
      const keywords = parseKeywords(ui.keywords.value);
      const movies = currentMovies();
      const previousSelection = selectedMovieId;
      clearRecords();
      if (movies.some((movie) => movie.id === previousSelection && loadCache(movie.id))) selectedMovieId = previousSelection;
      ui.results.replaceChildren();
      ui.exportStatus.textContent = "";
      if (keywords.length || ui.view.value !== "keywords") movies.forEach((movie) => {
        if (!loadCache(movie.id)) return;
        const record = recordFromCache(movie, keywords, ui.mode.value);
        records.set(movie.id, record);
        renderRecord(record);
      });
      ui.caption.textContent = ui.view.value === "links" ? "资源链接模式：显示含有效 ed2k 或 magnet 链接的评论，无需填写关键词。"
        : ui.view.value === "all" ? "显示全部已读评论。" : keywords.length ? `当前关键词：${keywords.join("、")}（${ui.mode.value === "all" ? "包含所有词" : "包含任意词"}）；缓存可直接重筛。` : "";
      ui.status.textContent = `已载入${singleMovie ? "本片" : "当前列表"} ${records.size} 部影片的缓存，未发送短评请求。`;
      updateExportControls();
      updateListInfo();
    };
    const run = (movies, { force = false, single = false } = {}) => {
      if (activeRun) return;
      const keywords = parseKeywords(ui.keywords.value);
      if (!keywords.length && ui.view.value === "keywords") {
        ui.status.textContent = "请先填写要查找的关键词，再点击批量或卡片按钮。";
        ui.keywords.focus();
        return;
      }
      if (!movies.length) { ui.status.textContent = "当前没有已加载且可见的影片。"; return; }
      const settings = readSettings();
      ui.pages.value = String(settings.maxPages);
      GM_setValue(STORE_KEY, settings);
      const session = {
        settings, keywords, force, follow: !singleMovie && !single && !detailId && settings.follow,
        controller: new AbortController(), queue: [], seen: new Set(), processing: false,
        finished: 0, cached: 0, newCount: 0, failed: 0, consecutiveFailures: 0,
      };
      activeRun = session;
      clearRecords();
      ui.results.replaceChildren();
      ui.results.scrollTop = 0;
      ui.exportStatus.textContent = "";
      updateExportControls();
      ui.caption.textContent = settings.view === "links" ? "识别本次评论中的 ed2k / magnet 资源链接。"
        : settings.view === "all" ? "显示本次读取与历史缓存中的全部评论。" : `本次关键词：${keywords.join("、")}（${settings.mode === "all" ? "同一条评论包含所有词" : "包含任意词"}）`;
      ui.movieHeader.replaceChildren();
      setBusy(true);
      enqueueMovies(session, movies);
    };

    const restoreModal = () => {
      if (!modalShown) return;
      modalShown = false;
      document.documentElement.style.overflow = oldOverflow;
      trigger?.setAttribute("aria-expanded", "false");
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
    const closePanel = () => {
      if (!panel?.open) return;
      panel.close();
      restoreModal();
    };
    const openPanel = () => {
      if (!panel || panel.open) return;
      if (!activeRun) {
        if (!cacheWriteFailed && ![...controllers].some((item) => item.isBusy())) cacheMemo.clear();
        hydrateCache();
      }
      returnFocus = document.activeElement;
      oldOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      modalShown = true;
      panel.showModal();
      trigger?.setAttribute("aria-expanded", "true");
      panel.querySelector(".rk-close").focus();
    };
    const ensureTrigger = () => {
      if (singleMovie) return;
      const blockButton = document.getElementById("x-manual-blocks-toggle");
      const toolbar = blockButton?.closest(".toolbar") || document.querySelector(".toolbar");
      if (!trigger) {
        trigger = element("button", "button is-small rk-trigger", "短评关键词");
        trigger.id = "javdb-review-keywords-trigger";
        trigger.type = "button";
        trigger.setAttribute("aria-controls", "javdb-review-keywords");
        trigger.setAttribute("aria-expanded", "false");
        trigger.addEventListener("click", openPanel);
      }
      if (blockButton) {
        if (blockButton.nextElementSibling !== trigger) blockButton.after(trigger);
      } else if (toolbar) {
        if (trigger.parentElement !== toolbar) toolbar.append(trigger);
      } else {
        const target = document.querySelector(detailId ? ".video-detail, .tabs.no-bottom" : ".movie-list");
        if (!target) return;
        if (!launcher?.isConnected) {
          launcher = element("div", "rk-launcher");
          target.before(launcher);
        }
        if (trigger.parentElement !== launcher) launcher.append(trigger);
      }
      if (launcher?.isConnected && !launcher.childElementCount) launcher.remove();
    };
    const mountPanel = () => {
      if (!singleMovie && !document.querySelector(detailId ? ".video-detail, .tabs.no-bottom" : ".movie-list")) return false;
      if (panel) {
        if (!panel.isConnected) document.body.append(panel);
        ensureTrigger();
        return true;
      }
      const storedSettings = GM_getValue(STORE_KEY, {}) || {};
      const settings = singleMovie ? { ...(GM_getValue("JavDB.reviewKeywords.settings.v1", {}) || {}), ...storedSettings } : storedSettings;
      panel = element("dialog");
      panel.id = panelId;
      panel.className = "rk-panel" + (singleMovie || detailId ? " rk-single" : "");
      panel.setAttribute("aria-labelledby", `${panelId}-title`);
      panel.innerHTML = `
        <div class="window">
          <header class="window-header rk-modal-header">
            <div class="window-identity"><div class="window-icon" data-rk-icon="reviews"></div><div class="window-title-line"><h3 id="${panelId}-title">短评关键词</h3><span class="badge rk-scope-badge"></span></div></div>
            <button type="button" class="btn quiet icon-only rk-close" aria-label="关闭短评关键词窗口" title="关闭（Esc）" data-rk-icon="close"></button>
          </header>
          <div class="filter-toolbar rk-form">
            <label class="keyword-field"><span data-rk-icon="search"></span><span class="sr-only">短评关键词，逗号、分号或换行分隔</span><textarea class="rk-keywords" rows="1" maxlength="4000" placeholder="输入关键词，多个词用逗号分隔"></textarea></label>
            <div class="toolbar-controls">
              <div class="view-tabs" role="tablist" aria-label="短评显示方式"><button type="button" role="tab" data-view="keywords">关键词</button><button type="button" role="tab" data-view="links">资源链接</button><button type="button" role="tab" data-view="all">全部</button></div>
              <select class="rk-view" hidden><option value="keywords">关键词筛选结果</option><option value="links">含 ed2k / magnet 链接</option><option value="all">全部已读评论</option></select>
              <button type="button" class="btn primary fetch-btn rk-start">增量获取</button><button type="button" class="btn fetch-btn rk-stop" hidden disabled>停止获取</button>
              <div class="settings-anchor">
                <button type="button" class="btn icon-only rk-settings-toggle" title="获取与筛选设置" aria-label="获取与筛选设置" aria-expanded="false" data-rk-icon="sliders"></button>
                <div class="menu settings-menu rk-settings-menu" hidden>
                  <div class="menu-title">获取与筛选设置</div>
                  <label class="setting-row"><span>关键词匹配</span><select class="rk-mode"><option value="any">包含任意词</option><option value="all">包含所有词</option></select></label>
                  <label class="setting-row"><span>每片最多页数</span><input class="rk-pages" type="number" min="1" max="20" value="3"></label>
                  <label class="setting-row"><span>缓存更新间隔</span><select class="rk-refresh-age"><option value="0">每次检查</option><option value="6">6 小时</option><option value="24">24 小时</option><option value="72">3 天</option><option value="168">7 天</option></select></label>
                  <label class="setting-check rk-follow-label"><input type="checkbox" class="rk-follow" checked><span>跟随滚动加载的新影片</span></label>
                  <div class="menu-divider"></div><button type="button" class="btn quiet menu-action rk-local">仅重筛缓存</button><button type="button" class="btn quiet menu-action rk-force">强制更新列表</button>
                  <p class="setting-note">按原文字面匹配，每页最多 100 条；历史评论按 ID 合并保留。</p><p class="setting-note rk-scope"></p>
                </div>
              </div>
            </div>
          </div>
          <div class="result-summary"><span class="rk-list-info"></span><span class="rk-status" role="status">填写关键词后点击获取，或选择资源链接模式。</span></div>
          <p class="rk-error rk-cache-warning" role="status"></p><p class="rk-caption sr-only"></p>
          <div class="workbench">
            <aside class="movie-sidebar" aria-label="影片筛选结果"><div class="sidebar-heading">当前列表<span class="rk-movie-count"></span></div><div class="rk-movie-nav"></div></aside>
            <section class="detail-pane" aria-label="所选影片短评"><div class="rk-movie-header"></div><div class="rk-route-container" hidden></div><div class="comment-scroll rk-results" tabindex="0" role="region" aria-label="短评筛选结果"></div></section>
          </div>
          <footer class="panel-footer"><div class="footer-status"><span data-rk-icon="shield"></span><span class="rk-export-count"></span><span class="rk-export-status" role="status"></span></div><div class="footer-actions">
            <label><span class="sr-only">TXT 导出范围</span><select class="rk-export-scope"><option value="matched">当前筛选结果</option><option value="all">全部已读评论</option></select></label>
            <div class="export-anchor"><button type="button" class="btn rk-export-toggle" aria-expanded="false">导出 TXT</button><div class="menu export-menu rk-export-menu" hidden><button type="button" class="export-item rk-export-reviews" disabled>导出原评论 TXT</button><button type="button" class="export-item rk-export-links" disabled>仅导出资源链接 TXT</button></div></div>
          </div></footer>
        </div>
      `;
      ui = {
        keywords: panel.querySelector(".rk-keywords"), mode: panel.querySelector(".rk-mode"), pages: panel.querySelector(".rk-pages"),
        start: panel.querySelector(".rk-start"), stop: panel.querySelector(".rk-stop"), force: panel.querySelector(".rk-force"), local: panel.querySelector(".rk-local"),
        refreshAge: panel.querySelector(".rk-refresh-age"), follow: panel.querySelector(".rk-follow"), view: panel.querySelector(".rk-view"),
        viewTabs: [...panel.querySelectorAll("[data-view]")], listInfo: panel.querySelector(".rk-list-info"), cacheWarning: panel.querySelector(".rk-cache-warning"),
        status: panel.querySelector(".rk-status"), caption: panel.querySelector(".rk-caption"), results: panel.querySelector(".rk-results"),
        exportScope: panel.querySelector(".rk-export-scope"), exportReviews: panel.querySelector(".rk-export-reviews"), exportLinks: panel.querySelector(".rk-export-links"),
        exportCount: panel.querySelector(".rk-export-count"), exportStatus: panel.querySelector(".rk-export-status"),
        movieNav: panel.querySelector(".rk-movie-nav"), movieCount: panel.querySelector(".rk-movie-count"), movieHeader: panel.querySelector(".rk-movie-header"),
        routeContainer: panel.querySelector(".rk-route-container"),
      };
      panel.querySelectorAll("[data-rk-icon]").forEach((node) => node.append(icon(node.dataset.rkIcon)));
      ui.start.prepend(icon("refresh")); ui.stop.prepend(icon("stop"));
      panel.querySelector(".rk-export-toggle").prepend(icon("download"));
      panel.querySelector(".rk-scope-badge").textContent = singleMovie || detailId ? "单片筛选" : "批量筛选";
      const settingsMenu = panel.querySelector(".rk-settings-menu"), exportMenu = panel.querySelector(".rk-export-menu");
      const settingsToggle = panel.querySelector(".rk-settings-toggle"), exportToggle = panel.querySelector(".rk-export-toggle");
      const closeMenus = () => {
        settingsMenu.hidden = exportMenu.hidden = true;
        settingsToggle.setAttribute("aria-expanded", "false"); exportToggle.setAttribute("aria-expanded", "false");
      };
      const toggleMenu = (menu, toggle) => {
        const open = menu.hidden; closeMenus(); menu.hidden = !open; toggle.setAttribute("aria-expanded", String(open));
      };
      settingsToggle.addEventListener("click", () => toggleMenu(settingsMenu, settingsToggle));
      exportToggle.addEventListener("click", () => toggleMenu(exportMenu, exportToggle));
      panel.addEventListener("click", (event) => { if (!event.target.closest(".settings-anchor, .export-anchor")) closeMenus(); });
      const syncTabs = () => ui.viewTabs.forEach((button) => button.setAttribute("aria-selected", String(button.dataset.view === ui.view.value)));
      ui.viewTabs.forEach((button) => button.addEventListener("click", () => {
        if (activeRun) return;
        ui.view.value = button.dataset.view; ui.view.dispatchEvent(new Event("change"));
      }));
      ui.keywords.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ui.keywords.dispatchEvent(new Event("change")); }
      });
      ui.keywords.addEventListener("input", () => {
        clearTimeout(keywordTimer);
        keywordTimer = setTimeout(() => { if (!activeRun) ui.keywords.dispatchEvent(new Event("change")); }, 250);
      });
      ui.keywords.value = typeof settings.keywords === "string" ? settings.keywords : "";
      ui.mode.value = settings.mode === "all" ? "all" : "any";
      ui.pages.value = String(Math.min(20, Math.max(1, Math.floor(Number(settings.maxPages) || 3))));
      ui.refreshAge.value = [0, 6, 24, 72, 168].includes(Number(settings.refreshHours)) ? String(Number(settings.refreshHours)) : "24";
      ui.follow.checked = settings.follow !== false;
      ui.view.value = ["keywords", "links", "all"].includes(storedSettings.view) ? storedSettings.view : singleMovie ? "links" : "keywords";
      if (singleMovie || detailId) panel.querySelector(".rk-follow-label").hidden = true;
      panel.querySelector("h3").textContent = "短评关键词";
      syncTabs();
      ui.start.lastChild.textContent = singleMovie || detailId ? "获取本片" : "增量获取";
      ui.force.textContent = singleMovie || detailId ? "强制更新本片" : "强制更新列表";
      panel.querySelector(".rk-scope").textContent = singleMovie || detailId ? "仅处理本片；可切换关键词筛选、资源链接识别或全部评论。"
        : "仅处理已加载且未隐藏的影片；开启跟随后，新加载的影片会自动入队。关闭窗口后继续滚动即可，“停止”结束本次跟随。";
      ui.start.addEventListener("click", () => run(currentMovies()));
      ui.force.addEventListener("click", () => { closeMenus(); run(currentMovies(), { force: true }); });
      ui.local.addEventListener("click", () => { closeMenus(); hydrateCache(); ui.status.textContent = "已使用本地缓存重新筛选，没有发送短评请求。"; });
      ui.stop.addEventListener("click", stopRun);
      ui.exportScope.addEventListener("change", updateExportControls);
      ui.exportReviews.addEventListener("click", () => { closeMenus(); exportText(false); });
      ui.exportLinks.addEventListener("click", () => { closeMenus(); exportText(true); });
      updateExportControls();
      [ui.keywords, ui.mode, ui.view, ui.pages, ui.refreshAge, ui.follow].forEach((input) => input.addEventListener("change", () => {
        if (singleMovie && input === ui.keywords && parseKeywords(input.value).length) ui.view.value = "keywords";
        syncTabs();
        GM_setValue(STORE_KEY, readSettings());
        hydrateCache();
        scheduleEnsure();
      }));
      panel.querySelector(".rk-close").addEventListener("click", closePanel);
      panel.addEventListener("cancel", (event) => { event.preventDefault(); if (!settingsMenu.hidden || !exportMenu.hidden) closeMenus(); else closePanel(); });
      panel.addEventListener("close", () => { closeMenus(); if (!panel.open) restoreModal(); });
      panel.addEventListener("click", (event) => {
        if (event.target !== panel) return;
        const rect = panel.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePanel();
      });
      document.body.append(panel);
      ensureTrigger();
      return true;
    };

    const ensure = () => {
      ensureScheduled = false;
      if (!mountPanel()) return;
      if (!singleMovie && !detailId) document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
        const movie = movieFromCard(card);
        if (!movie) return;
        const cover = card.querySelector(".cover");
        if (!cover) return;
        let button = card.querySelector(".rk-card-button");
        if (!button) {
          button = element("button", "button is-small is-link x-un-hover rk-card-button", "筛选短评");
          button.type = "button";
          cover.append(button);
        }
        if (!boundButtons.has(button)) {
          boundButtons.add(button);
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const selected = movieFromCard(card);
            if (!selected) return;
            if (!singlePanels.has(selected.id)) singlePanels.set(selected.id, createPanel(selected));
            singlePanels.get(selected.id).open();
          });
        }
        if (!card.querySelector(".rk-fetch-state")) cover.append(element("span", "rk-fetch-state", "未获取"));
        updateCardStatus(card, movie);
      });
      updateListInfo();
      if (!singleMovie && activeRun?.follow && !activeRun.controller.signal.aborted) enqueueMovies(activeRun, currentMovies());
    };
    const scheduleEnsure = () => {
      if (ensureScheduled) return;
      ensureScheduled = true;
      requestAnimationFrame(ensure);
    };

    if (!styled) {
      styled = true;
      GM_addStyle(`
.rk-panel { position: fixed; inset: 0; margin: auto; --blue:#3566d6; --blue-dark:#2854b8; --blue-soft:#edf3ff; --green:#18724e; --green-soft:#eaf6ef; --ink:#263244; --muted:#657184; --line:#e5e9f0; --surface:#f8fafc; color-scheme:light; font-family:"Segoe UI","Microsoft YaHei UI","PingFang SC",sans-serif; }
        .rk-panel * { box-sizing: border-box; }
        .rk-panel button, .rk-panel input, .rk-panel select { font: inherit; }
        .rk-panel button { cursor: pointer; }
        .rk-panel button, .rk-panel input, .rk-panel select, .rk-panel summary { -webkit-tap-highlight-color: transparent; }
        .rk-panel button { transition: background 160ms ease, border-color 160ms ease, color 160ms ease; }
        .rk-panel button:disabled { cursor: default; opacity: .55; }
        .rk-panel :focus-visible { outline: 3px solid #91b1f8; outline-offset: 3px; }
        .rk-panel [hidden] { display: none !important; }
        .rk-panel .icon { width: 17px; height: 17px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
        .rk-panel .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
        .rk-panel .btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 35px; padding: 0 12px; border: 1px solid #dbe1ea; border-radius: 7px; background: white; color: #4c596c; font-size: 12px; font-weight: 600; white-space: nowrap; }
        .rk-panel .btn:hover:not(:disabled) { border-color: #b8c7df; background: #f6f8fc; }
        .rk-panel .btn.primary { border-color: var(--blue); background: var(--blue); color: white; }
        .rk-panel .btn.primary:hover:not(:disabled) { background: var(--blue-dark); border-color: var(--blue-dark); }
        .rk-panel .btn.soft { border-color: #dae5fb; background: var(--blue-soft); color: #315db8; }
        .rk-panel .btn.quiet { border-color: transparent; background: transparent; }
        .rk-panel .btn.quiet:hover:not(:disabled) { background: #edf1f6; }
        .rk-panel .btn.icon-only { width: 35px; padding: 0; }
        .rk-panel .btn.small { min-height: 29px; padding: 0 10px; font-size: 12px; }
        .rk-panel .btn.offline { border-color: #cce3d6; color: var(--green); background: #f4faf6; }
        .rk-panel .btn.offline:hover:not(:disabled) { border-color: #a5cdb6; background: #e8f5ed; }
        .rk-panel .btn.offline.is-done { color: var(--green); background: var(--green-soft); opacity: 1; }
        .rk-panel .badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 7px; border-radius: 5px; color: #5e6c80; background: #eef1f5; font-size: 10px; font-weight: 500; white-space: nowrap; }
        .rk-panel .badge.done { color: #236748; background: #eaf5ee; }
        .rk-panel .badge.partial { color: #8a6225; background: #fbf3e4; }
        .rk-panel .badge.new { color: #69758a; background: #edf0f5; }
        .rk-panel .badge.fetching { color: #2f5bb8; background: #eaf1ff; }
        .rk-panel .dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
        .rk-panel { width: min(920px, calc(100vw - 48px)); height: min(660px, calc(100dvh - 64px)); max-width: none; max-height: none; padding: 0; overflow: visible; border: 0; background: transparent; color: var(--ink); }
        .rk-panel:not([open]) { display: none; }
        .rk-panel[open] { display: flex; flex-direction: column; }
        .rk-panel.rk-single { width: min(700px, calc(100vw - 48px)); height: min(600px, calc(100dvh - 64px)); }
        .rk-panel::backdrop { background: rgb(31 42 62 / 48%); backdrop-filter: blur(4px); }
        .rk-panel .window { position: relative; display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: hidden; border: 1px solid #fff9; border-radius: 13px; background: #fff; box-shadow: 0 28px 90px #14213d45, 0 4px 16px #14213d20; }
        .rk-panel .window-header { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 12px; min-height: 54px; padding: 9px 16px; border-bottom: 1px solid var(--line); }
        .rk-panel .window-identity { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .rk-panel .window-icon { display: grid; width: 32px; height: 32px; flex: 0 0 auto; place-items: center; border: 1px solid #e0e8fc; border-radius: 8px; color: var(--blue); background: #f0f5ff; }
        .rk-panel .window-icon .icon { width: 20px; height: 20px; }
        .rk-panel .window-title-line { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; }
        .rk-panel .window-title-line h3 { margin: 0; color: #25334b; font-size: 17px; font-weight: 650; letter-spacing: -.3px; }
        .rk-panel .window-title-line .badge { padding: 2px 6px; }
        .rk-panel .window-subtitle { display: none; }
        .rk-panel .close-btn { color: #758094; }
        .rk-panel .filter-toolbar { display: flex; flex: 0 0 auto; align-items: center; gap: 10px; padding: 11px 16px 9px; }
        .rk-panel .keyword-field { display: flex; flex: 1; align-items: center; gap: 9px; min-width: 140px; min-height: 37px; padding: 0 11px; border: 1px solid #dce3ed; border-radius: 7px; background: #fff; color: #79869a; }
        .rk-panel .keyword-field:focus-within { border-color: #91ade9; box-shadow: 0 0 0 3px #edf3ff; }
        .rk-panel .keyword-field input { width: 100%; min-width: 0; height: 35px; padding: 0; border: 0; outline: 0; background: transparent; color: #36465e; font-size: 13px; }
        .rk-panel .keyword-field input::placeholder { color: #738196; }
        .rk-panel .shortcut { flex: 0 0 auto; padding: 2px 4px; border: 1px solid #e4e9f2; border-radius: 4px; color: #7b8798; font: 10px "Segoe UI", sans-serif; }
        .rk-panel .toolbar-controls { display: flex; align-items: center; gap: 9px; }
        .rk-panel .view-tabs { display: flex; flex: 0 0 auto; gap: 2px; padding: 3px; border: 1px solid #e7ebf2; border-radius: 7px; background: #f4f6f9; }
        .rk-panel .view-tabs button { min-height: 29px; padding: 0 11px; border: 0; border-radius: 4px; color: #68758a; background: transparent; font-size: 12px; white-space: nowrap; }
        .rk-panel .view-tabs button[aria-selected="true"] { color: #315fbf; background: white; box-shadow: 0 1px 4px #22385815; font-weight: 600; }
        .rk-panel .fetch-btn { min-width: 104px; min-height: 37px; }
        .rk-panel .fetch-btn[data-running="true"] { border-color: #d8dfe9; color: #556377; background: #f6f8fb; }
        .rk-panel .settings-anchor, .rk-panel .export-anchor { position: relative; }
        .rk-panel .settings-anchor > .btn { min-height: 37px; width: 37px; }
        .rk-panel .settings-anchor > .btn[aria-expanded="true"] { color: var(--blue); border-color: #c4d5f6; background: var(--blue-soft); }
        .rk-panel .menu { position: absolute; z-index: 10; padding: 15px; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; box-shadow: 0 10px 35px #243b6229, 0 2px 5px #243b620d; }
        .rk-panel .settings-menu { top: calc(100% + 9px); right: 0; width: 292px; }
        .rk-panel .menu-title { display: flex; align-items: center; justify-content: space-between; margin: 0 0 15px; font-size: 12px; font-weight: 650; }
        .rk-panel .menu-title span { color: var(--muted); font-size: 10px; font-weight: 400; }
        .rk-panel .setting-row { display: grid; grid-template-columns: 1fr 137px; gap: 13px; align-items: center; margin: 10px 0; font-size: 11px; }
        .rk-panel .setting-row select, .rk-panel .setting-row input { width: 100%; min-height: 31px; padding: 0 7px; border: 1px solid #dce3ed; border-radius: 5px; color: #4c5d75; background: #fff; font-size: 11px; }
        .rk-panel .setting-check { display: flex; align-items: flex-start; gap: 7px; margin: 15px 0; color: #4a5b73; font-size: 11px; line-height: 1.6; }
        .rk-panel .setting-check input { margin: 3px 0 0; accent-color: var(--blue); }
        .rk-panel .menu-divider { height: 1px; margin: 12px 0; background: var(--line); }
        .rk-panel .setting-note { margin: 8px 0 0; color: var(--muted); font-size: 10px; line-height: 1.65; }
        .rk-panel .menu-action { justify-content: flex-start; width: 100%; }
        .rk-panel .result-summary { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 10px; min-height: 30px; padding: 0 17px 8px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; line-height: 1.6; }
        .rk-panel .result-summary strong { color: #3f506c; font-weight: 600; }
        .rk-panel .summary-secondary { color: #6d7b90; }
        .rk-panel .summary-state { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
        .rk-panel .summary-state .dot { color: #438664; }
        .rk-panel .progress-track { height: 2px; flex: 0 0 2px; background: #edf2fa; }
        .rk-panel .progress-track::before { display: block; width: var(--progress, 0%); height: 100%; content: ""; background: var(--blue); transition: width 350ms ease; }
        .rk-panel .workbench { display: grid; flex: 1; grid-template-columns: 210px minmax(0, 1fr); min-height: 0; }
        .rk-panel .movie-sidebar { display: flex; flex-direction: column; min-height: 0; padding: 13px 8px 10px; border-right: 1px solid var(--line); background: #f8fafc; }
        .rk-panel .sidebar-heading { display: flex; align-items: center; justify-content: space-between; margin: 0 10px 12px; color: #58697f; font-size: 11px; font-weight: 600; }
        .rk-panel .sidebar-heading span { padding: 2px 6px; border-radius: 4px; background: #e9edf4; color: #64748b; font-size: 10px; }
        .rk-panel .rk-movie-nav { display: flex; flex-direction: column; gap: 5px; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #cbd5e2 transparent; }
        .rk-panel .movie-option { display: flex; align-items: center; gap: 8px; width: 100%; flex: 0 0 auto; padding: 8px 7px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--ink); text-align: left; }
        .rk-panel .movie-option:hover { background: #edf1f7; }
        .rk-panel .movie-option[aria-pressed="true"] { border-color: #d6e3fc; background: #edf3ff; box-shadow: inset 2px 0 0 #4b77d6; }
        .rk-panel .film-thumb { display: grid; width: 28px; height: 38px; flex: 0 0 auto; place-items: center; border: 1px solid #ffffff8c; border-radius: 5px; color: #ffffffd9; background: linear-gradient(155deg, var(--cover-a), var(--cover-b)); }
        .rk-panel .film-thumb .icon { width: 19px; height: 19px; stroke-width: 1.25; }
        .rk-panel .movie-option-body { flex: 1; min-width: 0; }
        .rk-panel .movie-option-top { display: flex; align-items: center; justify-content: space-between; gap: 5px; }
        .rk-panel .movie-code { color: #34445f; font-size: 13px; font-weight: 650; }
        .rk-panel .hit-count { color: #5d78ac; font-size: 11px; white-space: nowrap; }
        .rk-panel .movie-name { display: block; overflow: hidden; margin: 3px 0 5px; color: #65738b; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
        .rk-panel .movie-option .badge { padding: 2px 5px; font-size: 10px; }
        .rk-panel .detail-pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: #fff; }
        .rk-panel .detail-heading { display: flex; flex: 0 0 auto; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 13px 18px 9px; }
        .rk-panel .detail-title-line { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; }
        .rk-panel .detail-title-line h2 { margin: 0; color: #25344e; font-size: 18px; font-weight: 650; }
        .rk-panel .detail-title-line > span { font-size: 13px; color: #62738d; }
        .rk-panel .detail-description { margin: 5px 0 0; color: var(--muted); font-size: 11px; line-height: 1.7; }
        .rk-panel .open-detail { gap: 4px; padding: 0; min-height: 24px; font-size: 10px; color: #617798; }
        .rk-panel .open-detail .icon { width: 13px; height: 13px; }
        .rk-panel .archive-bar { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 10px; margin: 0 18px 3px; padding: 6px 9px; border: 1px solid #e8edf3; border-radius: 7px; background: #f8fafc; }
        .rk-panel .archive-destination { display: flex; flex: 1; align-items: center; gap: 7px; min-width: 0; color: #66768d; font-size: 11px; }
        .rk-panel .archive-destination > span { white-space: nowrap; }
        .rk-panel .archive-destination > .icon { width: 15px; height: 15px; color: #788ba9; }
        .rk-panel .archive-destination select { width: min(200px, 100%); min-width: 0; height: 24px; padding: 0 18px 0 3px; border: 0; border-radius: 3px; background: transparent; color: #425a7b; font-size: 12px; }
        .rk-panel .archive-hint { color: #65748b; font-size: 10px; white-space: nowrap; }
        .rk-panel .comment-scroll { min-height: 0; flex: 1; padding: 0 18px 10px; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #c6d0df transparent; }
        .rk-panel .comment-card { padding: 15px 0; border-bottom: 1px solid #ecf0f5; }
        .rk-panel .comment-card:last-child { border-bottom: 0; }
        .rk-panel .comment-meta { display: flex; align-items: center; gap: 8px; color: #69788e; font-size: 11px; }
        .rk-panel .avatar { display: grid; width: 25px; height: 25px; flex: 0 0 auto; place-items: center; border-radius: 50%; color: #647b9d; background: #eef2f8; font-size: 11px; font-weight: 600; }
        .rk-panel .comment-user { color: #485a75; font-size: 12px; font-weight: 600; }
        .rk-panel .comment-date { color: #66758a; }
        .rk-panel .comment-likes { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; color: #718097; font-size: 10px; }
        .rk-panel .comment-likes .icon { width: 13px; height: 13px; }
        .rk-panel .comment-text { margin: 11px 0; color: #3e4d64; font-size: 14px; line-height: 1.95; overflow-wrap: anywhere; }
        .rk-panel mark { padding: 1px 2px; border-radius: 3px; background: #fff0c2; color: #654f1d; }
        .rk-panel .resource { margin: 11px 0 4px; padding: 10px 12px; border: 1px solid #e2e8f1; border-radius: 8px; background: #fbfcfe; }
        .rk-panel .resource-top { display: flex; align-items: center; gap: 10px; }
        .rk-panel .resource-icon { display: grid; width: 30px; height: 34px; flex: 0 0 auto; place-items: center; border: 1px solid #e1e9fa; border-radius: 6px; color: #5f7db3; background: #f0f5ff; }
        .rk-panel .resource-icon.ed2k { border-color: #d9e9e2; color: #4a8670; background: #eff7f3; }
        .rk-panel .resource-info { flex: 1; min-width: 0; }
        .rk-panel .resource-filename { overflow: hidden; margin: 0 0 5px; color: #3d506c; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .rk-panel .resource-meta { display: flex; flex-wrap: wrap; gap: 7px; color: #62728a; font-size: 10px; line-height: 1.5; }
        .rk-panel .resource-type { color: #5875a8; font-size: 10px; font-weight: 700; letter-spacing: .4px; }
        .rk-panel .resource-actions { display: flex; flex: 0 0 auto; gap: 6px; }
        .rk-panel .resource-actions .icon { width: 13px; height: 13px; }
        .rk-panel .resource-links { width: 100%; min-width: 0; margin: 8px 0 0; }
        .rk-panel .resource-links summary, .rk-panel .original-comment summary { display: inline-flex; align-items: center; gap: 4px; color: #61728d; font-size: 11px; cursor: pointer; list-style: none; user-select: none; }
        .rk-panel .resource-links summary::-webkit-details-marker, .rk-panel .original-comment summary::-webkit-details-marker { display: none; }
        .rk-panel .resource-links summary .icon, .rk-panel .original-comment summary .icon { width: 12px; height: 12px; }
        .rk-panel details[open] > summary .chevron { transform: rotate(180deg); }
        .rk-panel .uri-text { display: block; width: 100%; min-width: 0; max-width: 100%; max-height: 88px; resize: vertical; overflow: auto; margin: 8px 0 0; padding: 9px; border: 1px solid #e3e9f2; border-radius: 5px; color: #61728c; background: #f3f6fa; font: 10px/1.7 Consolas, monospace; overflow-wrap: anywhere; white-space: pre-wrap; }
        .rk-panel .original-comment { margin-top: 12px; }
        .rk-panel .original-comment p { margin: 8px 0 0; padding: 10px 12px; border-left: 2px solid #d9e3f4; color: #61718a; font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; white-space: pre-wrap; }
        .rk-panel .resource-status { display: flex; align-items: center; gap: 5px; margin: 9px 0 0; color: #48775d; font-size: 10px; line-height: 1.6; overflow-wrap: anywhere; }
        .rk-panel .resource-status .icon { width: 12px; height: 12px; }
        .rk-panel .result-end { padding: 16px 0 7px; color: #738098; text-align: center; font-size: 10px; }
        .rk-panel .empty-state { display: grid; align-content: center; justify-items: center; min-height: 230px; padding: 24px; text-align: center; }
        .rk-panel .empty-state > .icon { width: 32px; height: 32px; margin-bottom: 12px; color: #9daec6; stroke-width: 1.25; }
        .rk-panel .empty-state h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; }
        .rk-panel .empty-state p { max-width: 300px; margin: 0; color: var(--muted); font-size: 11px; line-height: 1.8; }
        .rk-panel .panel-footer { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; padding: 7px 16px; border-top: 1px solid var(--line); background: #fff; }
        .rk-panel .footer-status { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; color: #64738b; font-size: 11px; line-height: 1.6; }
        .rk-panel .footer-status .icon { width: 13px; height: 13px; color: #5a8b70; }
        .rk-panel .footer-status kbd { padding: 1px 4px; border: 1px solid #e2e8f1; border-radius: 4px; color: #75829a; background: #f8fafc; font: 9px "Segoe UI", sans-serif; }
        .rk-panel .footer-actions { display: flex; align-items: center; gap: 9px; }
        .rk-panel .footer-actions select { min-height: 31px; max-width: 150px; padding: 0 20px 0 8px; border: 0; border-radius: 5px; color: #64758f; background: #f6f8fb; font-size: 10px; }
        .rk-panel .export-menu { right: 0; bottom: calc(100% + 10px); width: 216px; padding: 7px; }
        .rk-panel .export-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px; border: 0; border-radius: 5px; color: #415674; background: white; text-align: left; }
        .rk-panel .export-item:hover { background: #f0f5ff; }
        .rk-panel .export-item strong { display: block; font-size: 11px; font-weight: 600; }
        .rk-panel .export-item small { display: block; margin-top: 4px; color: #6d7b91; font-size: 9px; }
        .rk-panel.rk-single .workbench { grid-template-columns: minmax(0, 1fr); }
        .rk-panel.rk-single .movie-sidebar { display: none; }
        .rk-panel.rk-single .comment-scroll { padding-right: 20px; padding-left: 20px; }
        .rk-panel.rk-single .archive-bar { margin-right: 20px; margin-left: 20px; }
        .rk-panel.rk-single .detail-heading { padding-right: 20px; padding-left: 20px; }
        .rk-panel.rk-single .comment-text { font-size: 14px; }
        .rk-panel.rk-single .comment-card { padding-top: 15px; padding-bottom: 15px; }
        .rk-panel .toast { position: absolute; z-index: 30; right: 16px; bottom: 62px; max-width: calc(100% - 32px); padding: 10px 15px; border: 1px solid #dae6df; border-radius: 8px; color: #365c47; background: #f3fbf6; box-shadow: 0 4px 16px #1b382717; font-size: 11px; line-height: 1.6; pointer-events: none; }
    @media (max-width: 1050px) {
        .rk-panel .filter-toolbar { flex-wrap: wrap; gap: 10px; }
        .rk-panel .keyword-field { flex-basis: 220px; }
        .rk-panel .toolbar-controls { flex: 0 0 auto; }
        .rk-panel .view-tabs button { padding-right: 8px; padding-left: 8px; }
        .rk-panel .workbench { grid-template-columns: 190px minmax(0, 1fr); }
        .rk-panel .movie-sidebar { padding-right: 8px; padding-left: 8px; }
        .rk-panel .film-thumb { display: none; }
        .rk-panel .detail-heading { padding-right: 20px; padding-left: 20px; }
        .rk-panel .comment-scroll { padding-right: 20px; padding-left: 20px; }
        .rk-panel .archive-bar { margin-right: 20px; margin-left: 20px; }
        .rk-panel .archive-hint { display: none; }
    }
    @media (max-width: 760px) {
        .rk-panel { width: calc(100vw - 32px); height: min(660px, calc(100dvh - 48px)); }
        .rk-panel.rk-single { width: calc(100vw - 32px); height: min(600px, calc(100dvh - 48px)); }
        .rk-panel .window { border-radius: 10px; }
        .rk-panel .window-header { min-height: 54px; padding: 9px 14px; }
        .rk-panel .window-icon { width: 32px; height: 32px; border-radius: 8px; }
        .rk-panel .window-title-line h3 { font-size: 15px; }
        .rk-panel .window-title-line { gap: 6px; }
        .rk-panel .window-subtitle { font-size: 10px; }
        .rk-panel .filter-toolbar { gap: 7px; padding: 10px 14px 9px; }
        .rk-panel .keyword-field { flex: 1 0 100%; }
        .rk-panel .toolbar-controls { flex: 1; gap: 7px; }
        .rk-panel .view-tabs { flex: 1; justify-content: space-between; }
        .rk-panel .view-tabs button { flex: 1; padding: 0 6px; font-size: 10px; }
        .rk-panel .fetch-btn { min-width: 90px; padding: 0 9px; font-size: 11px; }
        .rk-panel .result-summary { min-height: 35px; padding: 0 15px 10px; font-size: 10px; }
        .rk-panel .summary-secondary { display: none; }
        .rk-panel .workbench { grid-template-columns: minmax(0, 1fr); grid-template-rows: 66px minmax(0, 1fr); }
        .rk-panel .movie-sidebar { padding: 8px 10px; border-right: 0; border-bottom: 1px solid var(--line); }
        .rk-panel .sidebar-heading { display: none; }
        .rk-panel .rk-movie-nav { flex-direction: row; gap: 7px; overflow: auto hidden; }
        .rk-panel .movie-option { width: 163px; padding: 5px 10px; }
        .rk-panel .movie-option[aria-pressed="true"] { box-shadow: inset 0 -2px 0 #4b77d6; }
        .rk-panel .movie-name { margin: 4px 0; }
        .rk-panel .movie-option .badge { display: none; }
        .rk-panel .detail-heading, .rk-panel.rk-single .detail-heading { padding: 11px 16px 8px; }
        .rk-panel .detail-title-line h2 { font-size: 15px; }
        .rk-panel .detail-title-line > span { font-size: 11px; }
        .rk-panel .detail-description { font-size: 9px; }
        .rk-panel .open-detail { display: none; }
        .rk-panel .archive-bar, .rk-panel.rk-single .archive-bar { margin: 0 16px 2px; padding: 7px 9px; }
        .rk-panel .archive-destination { gap: 5px; font-size: 9px; }
        .rk-panel .archive-destination select { font-size: 10px; }
        .rk-panel .comment-scroll, .rk-panel.rk-single .comment-scroll { padding: 0 16px 10px; }
        .rk-panel .comment-text, .rk-panel.rk-single .comment-text { font-size: 13px; }
        .rk-panel .comment-date { font-size: 9px; }
        .rk-panel .resource { padding: 9px; }
        .rk-panel .resource-top { flex-wrap: wrap; gap: 8px; }
        .rk-panel .resource-info { flex-basis: calc(100% - 40px); }
        .rk-panel .resource-actions { width: 100%; justify-content: flex-end; }
        .rk-panel .resource-actions .btn { min-height: 29px; }
        .rk-panel .panel-footer { gap: 8px; min-height: 48px; padding: 7px 14px; }
        .rk-panel .footer-status { display: none; }
        .rk-panel .footer-actions { justify-content: space-between; width: 100%; }
        .rk-panel .footer-actions select { max-width: 160px; }
        .rk-panel.rk-single .workbench { grid-template-rows: minmax(0, 1fr); }
        .rk-panel .settings-menu { width: min(292px, calc(100vw - 60px)); }
        .rk-panel .toast { right: 14px; bottom: 100px; max-width: calc(100% - 28px); }
    }
    @media (prefers-reduced-motion: reduce) {
        .rk-panel *, .rk-panel *::before, .rk-panel *::after { transition: none !important; scroll-behavior: auto !important; }
        .rk-panel::backdrop { backdrop-filter: none; }
    }

        .rk-panel .keyword-field textarea { width:100%; height:35px; min-height:35px; resize:none; padding:7px 0; border:0; outline:0; color:#36465e; background:transparent; font-family:inherit; font-size:13px; line-height:20px; overflow:auto; white-space:pre; }
        .rk-panel .rk-status { display:block; max-width:62%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .rk-panel .rk-cache-warning { flex:0 0 auto; margin:0; padding:6px 16px; }
        .rk-panel .rk-cache-warning:empty { display:none; }
        .rk-panel .rk-error { color:#ad2e2e; font-size:12px; overflow-wrap:anywhere; }
        .rk-panel .archive-bar:has(.rk-error) { flex-wrap:wrap; }
        .rk-panel .archive-bar .rk-error { width:100%; margin:0; }
        .rk-panel .rk-movie-header,.rk-panel .rk-route-container { flex:0 0 auto; }
        .rk-panel .rk-export-status { max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .rk-panel .rk-export-status:empty { display:none; }
        .rk-panel .rk-review-meta { color:#657184; }
        .rk-panel .resource-status { display:block; }
        .rk-panel .rk-stop { color:#56657c; background:#f5f7fb; border-color:#d7deea; }
        .rk-panel .open-detail { text-decoration:none; }

        .toolbar .rk-trigger { min-width: 6.5em; margin-left: .25rem; margin-bottom: .5rem; font-size: var(--x-size-sm, .75rem); font-weight: 600; }
        .rk-launcher { margin: 12px 0; }
        .movie-list .item .cover:has(> .rk-card-button) { position: relative; }
        .movie-list .item .cover > .rk-card-button { position: absolute; inset: auto .5rem .5rem auto; z-index: 4; min-width: 70px; height: 2em; padding: 0 .75em; margin: 0; border: none; border-radius: 1px; background: #485fc7; color: #fff; font-size: .75rem; line-height: 1.5; cursor: pointer; }
        .movie-list .item .cover > .rk-card-button:not(:disabled):hover { background: #3e56c4; }
        .movie-list .item .cover > .rk-fetch-state { position: absolute; bottom: .5rem; left: .5rem; z-index: 4; max-width: calc(100% - 100px); overflow: hidden; padding: 3px 6px; border-radius: 3px; background: #4b5563e8; color: #fff; font: 11px/1.5 sans-serif; text-overflow: ellipsis; white-space: nowrap; pointer-events: auto; }
        .rk-fetch-state[data-state="complete"] { background: #187443ed !important; }
        .rk-fetch-state[data-state="partial"], .rk-fetch-state[data-state="stale"] { background: #995d10ed !important; }
        .rk-fetch-state[data-state="error"] { background: #a52a2aed !important; }
        .rk-fetch-state[data-state="loading"] { background: #245aa7ed !important; }
      `);
    }
    const controller = {
      open: () => {
        openPanel();
        if (singleMovie && !activeRun) run([singleMovie], { single: true });
      },
      stop: stopRun,
      refreshCards: scheduleEnsure,
      isBusy: () => Boolean(activeRun),
    };
    controllers.add(controller);
    if (singleMovie) mountPanel();
    else {
      ensure();
      window.addEventListener("JavDB.scroll", scheduleEnsure);
      new MutationObserver((mutations) => {
        if (panel && !panel.isConnected) { scheduleEnsure(); return; }
        if (mutations.some((mutation) => mutation.type === "attributes"
          ? mutation.target.matches(".movie-list, .movie-list .item") || (mutation.attributeName === "href" && mutation.target.closest(CARD_SELECTOR))
          : [...mutation.addedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE
            && (node.matches(".movie-list, .item, .video-detail, .tabs.no-bottom, .toolbar, #x-manual-blocks-toggle")
              || node.querySelector(".movie-list, .movie-list .item, .video-detail, .toolbar, #x-manual-blocks-toggle"))))) scheduleEnsure();
      }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "href"] });
      window.addEventListener("focus", () => {
        if ([...controllers].some((item) => item.isBusy()) || !ui) return;
        if (!cacheWriteFailed) cacheMemo.clear();
        scheduleEnsure();
        if (panel.open) hydrateCache();
      });
    }
    return controller;
  };
  mainPanel = createPanel();
  window.addEventListener("pagehide", () => controllers.forEach((controller) => controller.stop()), { once: true });
})();
