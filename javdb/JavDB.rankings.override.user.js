// ==UserScript==
// @name            JavDB.rankings.override
// @namespace       JavDB.rankings.override.local
// @version         0.1.9
// @description     添加独立榜单入口，以默认样式展示榜单，并支持 match115 匹配
// @match           https://javdb.com/*
// @icon            https://javdb.com/favicon.ico
// @connect         jdforrepam.com
// @connect         jdbstatic.com
// @connect         c0.jdbstatic.com
// @grant           GM_xmlhttpRequest
// @grant           GM_getValue
// @grant           GM_setValue
// @grant           GM_deleteValue
// @grant           GM_listValues
// @run-at          document-end
// ==/UserScript==

const API_BASE = "https://jdforrepam.com";
const SECRET = "71cf27bb3c0bcdf207b64abecddc970098c7421ee7203b9cdae54478478a199e7d5a6e1a57691123c1a931c057842fb73ba3b3c83bcd69c17ccf174081e3d8aa";
const TOKEN_KEY = "jdb_rank_token";
const USER_KEY = "jdb_rank_username";
const CACHE_PREFIX = "jdb_rank_override_cache_";
const CACHE_TTL = 30 * 60 * 1000;
// Time-sensitive charts must not reuse an old response after a period/filter switch.
const PLAYBACK_CACHE_TTL = 5 * 60 * 1000;
const PUBLIC_RANK_TYPES = {
  coded: { apiType: "0", label: "\u6709\u7801" },
  uncoded: { apiType: "1", label: "\u65e0\u7801" },
  western: { apiType: "2", label: "\u6b27\u7f8e" },
  fc2: { apiType: "3", label: "FC2" },
};

function rankInfo(type) {
  if (type === "top") return { kind: "top", label: "TOP250" };
  if (type === "playback") return { kind: "playback", label: "\u70ed\u64ad" };
  const info = PUBLIC_RANK_TYPES[type];
  return info ? { kind: "public", ...info } : { kind: "playback", label: "\u70ed\u64ad" };
}

function rankTypeFromText(text) {
  const value = String(text || "").trim();
  const compact = value.replace(/\s+/g, "").toLowerCase();
  if (!compact) return "";
  if (compact.includes("top250")) return "top";
  if (compact.includes("\u70ed\u64ad") || compact.includes("\u71b1\u64ad") || compact.includes("playback")) return "playback";
  if (compact.includes("fc2")) return "fc2";
  if (compact.includes("\u6b27\u7f8e") || compact.includes("\u6b50\u7f8e") || compact.includes("western")) return "western";
  if (compact.includes("\u65e0\u7801") || compact.includes("\u7121\u78bc") || compact.includes("uncensored")) return "uncoded";
  if (compact.includes("\u6709\u7801") || compact.includes("\u6709\u78bc") || compact.includes("censored")) return "coded";
  return "";
}

function getRankRequestConfig(type, controls, token, page = 1) {
  const info = rankInfo(type);
  if (info.kind === "top") {
    if (!token) throw new Error("NO_TOKEN");
    return {
      path: "/api/v1/movies/top",
      query: { period: "", type: controls.topType || "", type_value: "", start_rank: "1", ignore_watched: "false", page: String(page || 1), limit: "50" },
      headers: getApiHeaders(token),
    };
  }
  if (info.kind === "playback") {
    return {
      path: "/api/v1/rankings/playback",
      query: { filter_by: controls.playFilter || "all", period: controls.period || "daily" },
      headers: getApiHeaders(),
    };
  }
  return {
    path: "/api/v1/rankings",
    query: { type: info.apiType, period: controls.period || "monthly", page: String(page || 1) },
    headers: getApiHeaders(),
  };
}

function getRankCacheKey(type, controls, page = 1) {
  const suffix = Number(page) > 1 ? `_p${Number(page)}` : "";
  const info = rankInfo(type);
  if (info.kind === "top") return `${CACHE_PREFIX}top_${controls.topType || ""}${suffix}`;
  if (info.kind === "playback") return `${CACHE_PREFIX}playback_${controls.period || "daily"}_${controls.playFilter || "all"}`;
  return `${CACHE_PREFIX}public_${info.apiType}_${controls.period || "monthly"}${suffix}`;
}

function isPageableRank(type) {
  const kind = rankInfo(type).kind;
  return kind === "top" || kind === "public";
}

function readControls(controlsEl) {
  return {
    topType: controlsEl.querySelector("#x-rank-top-type")?.value || "",
    period: controlsEl.querySelector("#x-rank-period")?.value || controlsEl.querySelector("#x-rank-play-period")?.value || "",
    playFilter: controlsEl.querySelector("#x-rank-play-filter")?.value || "all",
  };
}

// ============================================================
// MD5 (from JavDB.rankings.user.js)
// ============================================================
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
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let i = 0; i < x.length; i += 16) {
      const oa = a, ob = b, oc = c, od = d;
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
      a = safeAdd(a, oa); b = safeAdd(b, ob); c = safeAdd(c, oc); d = safeAdd(d, od);
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

function getApiHeaders(token) {
  const h = {
    "User-Agent": "Dart/3.5 (dart:io)",
    "Accept-Language": "zh-TW",
    "Host": "jdforrepam.com",
    "jdSignature": genSig(),
  };
  if (token) h.Authorization = token; // Send raw token — API docs say no Bearer prefix needed
  return h;
}

// ============================================================
// Cache helpers — clean expired caches at startup
// ============================================================
// - Error caches: removed immediately
// - Expired caches (older than CACHE_TTL): cleaned on page refresh
// - Token and username: kept permanently
(function () {
  const now = Date.now();
  GM_listValues().forEach((k) => {
    if (k.startsWith(CACHE_PREFIX)) {
      const v = GM_getValue(k);
      if (v?.data?.action || v?.data?.error) {
        GM_deleteValue(k);
      } else if (v?.ts && now - v.ts > CACHE_TTL) {
        GM_deleteValue(k);
      }
    }
  });
})();

function getCache(key) {
  const cache = GM_getValue(key);
  const ttl = key.startsWith(`${CACHE_PREFIX}playback_`) ? PLAYBACK_CACHE_TTL : CACHE_TTL;
  return cache?.ts && cache?.data && Date.now() - cache.ts <= ttl ? cache.data : null;
}

function topTypeMatches(movieEntry, selectedType) {
  if (!/^[01]$/.test(String(selectedType))) return true;
  const movie = movieEntry?.movie || movieEntry || {};
  const rawType = movie.type ?? movie.movie_type ?? movie.video_type ?? movie.category_type ?? movie.is_uncensored ?? movie.uncensored ?? "";
  const normalized = String(rawType).trim().toLowerCase();
  if (!normalized) return true; // Old API responses do not expose a type field.
  if (["0", "false", "censored", "有码", "有碼"].includes(normalized)) return selectedType === "0";
  if (["1", "true", "uncensored", "无码", "無碼"].includes(normalized)) return selectedType === "1";
  return true;
}
function setCache(key, data) {
  GM_setValue(key, { ts: Date.now(), data });
}

// ============================================================
// HTTP request
// ============================================================
function apiRequest({ path, query, headers }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const method = path === "/api/v1/sessions" ? "POST" : "GET";
    const safeHeaders = Object.fromEntries(Object.entries(headers).filter(([k]) => !/^(host|user-agent)$/i.test(k)));
    Object.entries(query || {}).forEach(([k, v]) => {
      if (v !== "" && v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    const done = (res) => (res.status >= 200 && res.status < 300 ? resolve(res) : reject(res));
    fetch(url.href, { method, headers: safeHeaders })
      .then(async (resp) => done({ status: resp.status, responseText: await resp.text() }))
      .catch(() => {
        GM_xmlhttpRequest({
          method,
          url: url.href,
          headers: safeHeaders,
          onload: done,
          onerror: (err) => reject(err || new Error("network error")),
          ontimeout: () => reject(new Error("request timeout")),
        });
      });
  });
}

// ============================================================
// Image URL - prefer the static-page CDN path, keep API URL fallback
// API can return CDN URLs such as:
//   https://tp.spfcas.com/rhe951l4q/covers/pq/PQOmv9.jpg
// Static JavDB pages load the same asset path from jdbstatic, e.g.:
//   https://c0.jdbstatic.com/covers/pq/PQOmv9.jpg
// ============================================================
const STATIC_IMAGE_HOST = "https://c0.jdbstatic.com";

function normalizeImageUrl(raw) {
  if (!raw) return "";
  const value = String(raw).trim();
  if (!value) return "";
  if (/^\/\//.test(value)) return `https:${value}`;
  if (/^\//.test(value)) return new URL(value, location.origin).href.replace(/^http:/i, "https:");
  return value.replace(/^http:/i, "https:");
}

function staticImageUrl(raw) {
  const url = normalizeImageUrl(raw);
  if (!url) return "";
  try {
    const parsed = new URL(url, location.origin);
    const path = parsed.pathname || "";
    const marker = path.search(/\/(?:covers|samples)\//i);
    if (marker !== -1) return `${STATIC_IMAGE_HOST}${path.slice(marker)}`;
    if (/jdbstatic\.com$/i.test(parsed.hostname)) return `${STATIC_IMAGE_HOST}${path}`;
  } catch (_) {
    const marker = url.search(/\/(?:covers|samples)\//i);
    if (marker !== -1) return `${STATIC_IMAGE_HOST}${url.slice(marker)}`;
  }
  return "";
}

function uniqueUrls(urls) {
  const seen = new Set();
  return urls.filter((url) => {
    const normalized = normalizeImageUrl(url);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).map(normalizeImageUrl);
}

function coverCandidates(m) {
  const movie = m?.movie || m || {};
  const raws = [
    movie.cover_url, movie.thumb_url, movie.cover, movie.thumb,
    m?.cover_url, m?.thumb_url, m?.cover, m?.thumb,
  ];
  return uniqueUrls(raws.flatMap((raw) => [staticImageUrl(raw), normalizeImageUrl(raw)]));
}

function coverUrl(m) {
  return coverCandidates(m)[0] || "";
}

// ============================================================
// Login / Token
// ============================================================
function getSavedToken() { return GM_getValue(TOKEN_KEY, ""); }

function showLoginModal(callback) {
  const overlay = document.createElement("div");
  overlay.className = "modal is-active";
  overlay.innerHTML = `<div class="modal-background"></div>
<div class="modal-card" style="max-width: 400px;">
  <header class="modal-card-head"><p class="modal-card-title">登录以查看 TOP250</p>
    <button class="delete" data-close-modal></button>
  </header>
  <section class="modal-card-body">
    <p class="mb-2">TOP250 需登录认证。输入账号密码 <strong>或</strong> 粘贴已有 token。</p>
    <div class="field"><label class="label">账号</label><div class="control"><input class="input" id="x-rank-login-user" type="text" value="${GM_getValue(USER_KEY, "")}"></div></div>
    <div class="field"><label class="label">密码</label><div class="control"><input class="input" id="x-rank-login-pass" type="password"></div></div>
    <button class="button is-link is-fullwidth" id="x-rank-login-btn">登录并获取 Token</button>
    <hr>
    <div class="field"><label class="label">已有 Token</label><div class="control"><input class="input" id="x-rank-token-input" type="password"></div></div>
    <button class="button is-fullwidth" id="x-rank-token-save-btn">保存 Token</button>
    <div id="x-rank-login-status" class="mt-2"></div>
  </section>
</div>`;
  document.body.appendChild(overlay);
  const status = overlay.querySelector("#x-rank-login-status");
  const setStatus = (msg, type) => { status.innerHTML = ""; status.textContent = msg; status.className = `mt-2 notification ${type}`; };
  const close = () => { overlay.remove(); callback(getSavedToken()); };
  overlay.querySelector("[data-close-modal]").onclick = close;
  overlay.querySelector(".modal-background").onclick = close;

  overlay.querySelector("#x-rank-login-btn").onclick = async () => {
    const username = overlay.querySelector("#x-rank-login-user").value.trim();
    const password = overlay.querySelector("#x-rank-login-pass").value;
    if (!username || !password) return setStatus("请输入账号和密码", "is-warning");
    setStatus("登录中...", "is-info");
    try {
      const res = await apiRequest({
        path: "/api/v1/sessions",
        query: { username, password, device_uuid: "04b9534d-5118-53de-9f87-2ddded77111e", device_name: "Chrome", device_model: "Browser", platform: "web", system_version: "1.0", app_version: "official", app_version_number: "1.9.29", app_channel: "official" },
        headers: getApiHeaders(),
      });
      const data = JSON.parse(res.responseText || "{}");
      const token = data?.data?.token;
      if (!token) {
        // Login error: API returns HTTP 200 with action field
        const errMsg = data?.message || data?.action || data?.error || "登录失败，请检查账号密码";
        throw new Error(errMsg);
      }
      GM_setValue(TOKEN_KEY, token);
      GM_setValue(USER_KEY, username);
      setStatus("登录成功！Token 已保存", "is-success");
      setTimeout(() => { overlay.remove(); callback(token); }, 800);
    } catch (err) {
      const msg = err?.status ? `HTTP ${err.status}` : String(err?.message || err);
      setStatus("登录失败: " + msg, "is-danger");
    }
  };

  overlay.querySelector("#x-rank-token-save-btn").onclick = () => {
    const token = overlay.querySelector("#x-rank-token-input").value.trim();
    if (!token) return setStatus("请输入 token", "is-warning");
    GM_setValue(TOKEN_KEY, token);
    setStatus("Token 已保存", "is-success");
    setTimeout(() => { overlay.remove(); callback(token); }, 800);
  };
}

// ============================================================
// Scoped style
// ============================================================
const RANK_STYLE_ID = "x-rankings-override-style";

function ensureRankStyles() {
  if (document.getElementById?.(RANK_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = RANK_STYLE_ID;
  style.textContent = `
#x-rankings-override-page { padding-top: 0.75rem; }
#x-rankings-override-page .x-rank-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem 0 0.85rem;
  border-bottom: 1px solid var(--border, rgba(127,127,127,.2));
}
#x-rankings-override-page .x-rank-tabs ul {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  margin: 0;
  border-bottom: 0;
}
#x-rankings-override-page .x-rank-tabs li { display: inline-flex; margin: 0; }
#x-rankings-override-page .x-rank-tabs a {
  display: inline-flex;
  align-items: center;
  min-height: 2.25rem;
  padding: 0.45rem 0.85rem;
  border: 0;
  border-bottom: 3px solid transparent;
  color: var(--grey-darker, #4a4a4a);
  font-weight: 600;
  line-height: 1;
  text-decoration: none;
  transition: color .16s ease, border-color .16s ease, background .16s ease;
}
#x-rankings-override-page .x-rank-tabs li.is-active a,
#x-rankings-override-page .x-rank-tabs a:hover {
  border-bottom-color: var(--link, #3273dc);
  color: var(--link, #3273dc);
  background: color-mix(in srgb, var(--link, #3273dc) 8%, transparent);
}
#x-rankings-override-page .x-rank-status { margin: 0.5rem 0 1rem; }
#x-rankings-override-page .x-rank-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0.75rem 0 1rem;
}
#x-rankings-override-page .x-rank-control {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
}
#x-rankings-override-page .x-rank-control > span:first-child {
  color: var(--grey, #7a7a7a);
  font-size: var(--x-size-sm, .85rem);
  font-weight: 600;
}
#x-rankings-override-page .movie-list { align-items: stretch; gap: 1rem; }
#x-rankings-override-page .movie-list .item {
  overflow: hidden;
  border: 1px solid var(--border, rgba(127,127,127,.18));
  border-radius: 10px;
  background: var(--body-background-color, #fff);
  box-shadow: 0 6px 18px rgba(10,10,10,.09);
  transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
}
#x-rankings-override-page .movie-list .item:hover:not(:has(.x-match:not(.is-normal))):not(.x-multi-matched) {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--link, #3273dc) 35%, transparent);
  box-shadow: 0 12px 28px rgba(10,10,10,.16);
}
#x-rankings-override-page .movie-list .item:has(.x-match:not(.is-normal)):not(.x-multi-matched) {
  border-style: solid;
  border-width: .375rem;
  border-radius: 10px;
}
#x-rankings-override-page .movie-list .item:has(.x-match.is-success):not(.x-multi-matched) { border-color: var(--x-success-bd); }
#x-rankings-override-page .movie-list .item:has(.x-match.is-info):not(.x-multi-matched) { border-color: var(--x-info-bd); }
#x-rankings-override-page .movie-list .item:has(.x-match.is-warning):not(.x-multi-matched) { border-color: var(--x-warning-bd); }
#x-rankings-override-page .movie-list .item:has(.x-match.is-danger):not(.x-multi-matched) { border-color: var(--x-danger-bd); }
#x-rankings-override-page .movie-list .item.x-multi-matched { border-color: transparent; }
#x-rankings-override-page .x-rank-card-link,
#x-rankings-override-page .x-rank-title-link {
  color: inherit;
  text-decoration: none;
}
#x-rankings-override-page .x-rank-title-link { display: block; }
#x-rankings-override-page .movie-list .item .cover {
  position: relative;
  overflow: hidden;
  border-radius: 10px 10px 0 0;
  background: var(--bg, #222);
}
#x-rankings-override-page .movie-list .item .cover > a { display: block; color: inherit; text-decoration: none; border-bottom: 0; }
#x-rankings-override-page .movie-list .item .x-rank-badge {
  position: absolute;
  top: .35rem;
  left: .35rem;
  z-index: 2;
}
#x-rankings-override-page .movie-list .item .cover .button,
#x-rankings-override-page .movie-list .item .cover .tag { text-decoration: none !important; border-bottom: 0 !important; }
#x-rankings-override-page .movie-list .item .cover img {
  display: block;
  width: 100%;
  height: auto;
  transition: transform .22s ease;
}
#x-rankings-override-page .movie-list .item:hover .cover img { transform: scale(1.025); }
#x-rankings-override-page .movie-list .item .video-title,
#x-rankings-override-page .movie-list .item .meta { padding-left: .65rem; padding-right: .65rem; }
#x-rankings-override-page .movie-list .item .video-title { padding-top: .55rem; }
#x-rankings-override-page .movie-list .item .meta { padding-bottom: .7rem; }
#x-rankings-override-page .x-rank-badge { box-shadow: 0 2px 8px rgba(0,0,0,.24); }
#x-rankings-override-page .x-rank-load-more { min-width: 9rem; justify-content: center; }
`;
  document.head?.appendChild(style);
}

function renderRankTabs(type) {
  return `<div class="main-tabs x-rank-tabs"><ul>
    <li data-rank-tab="playback" class="${type === "playback" ? "is-active" : ""}"><a>\u70ed\u64ad</a></li>
    <li data-rank-tab="top" class="${type === "top" ? "is-active" : ""}"><a>TOP250</a></li>
    <li data-rank-tab="coded" class="${type === "coded" ? "is-active" : ""}"><a>\u6709\u7801</a></li>
    <li data-rank-tab="uncoded" class="${type === "uncoded" ? "is-active" : ""}"><a>\u65e0\u7801</a></li>
    <li data-rank-tab="western" class="${type === "western" ? "is-active" : ""}"><a>\u6b27\u7f8e</a></li>
    <li data-rank-tab="fc2" class="${type === "fc2" ? "is-active" : ""}"><a>FC2</a></li>
  </ul></div>`;
}

// ============================================================
// Page rendering — inject alongside original content
// ============================================================
let currentRankType = "";
let containerEl = null;

function showRankingsPage(type) {
  ensureRankStyles();
  currentRankType = type;
  const root = document.querySelector(".section") || document.querySelector("main") || document.body;
  if (!containerEl) {
    containerEl = document.createElement("div");
    containerEl.className = "container";
    containerEl.id = "x-rankings-override-page";
    root.parentNode.insertBefore(containerEl, root.nextSibling);
  }
  root.style.display = "none";
  containerEl.style.display = "";

  containerEl.innerHTML = `<h1 class="title is-4">\u699c\u5355</h1>
${renderRankTabs(type)}
<div class="x-rank-controls"></div>
<div class="notification x-rank-status" hidden></div>
<div class="movie-list cols-4 vcols-8"><div class="item" style="display:none"></div></div>
<button class="button is-rounded has-text-grey is-flex my-4 mx-auto x-rank-load-more" hidden>滚动加载</button>`;

  const listEl = containerEl.querySelector(".movie-list");
  const statusEl = containerEl.querySelector(".x-rank-status");
  const controlsEl = containerEl.querySelector(".x-rank-controls");
  const loadMoreEl = containerEl.querySelector(".x-rank-load-more");
  const pageState = { page: 1, loading: false, exhausted: false, observer: null, requestId: 0 };

  const setStatus = (text, cls) => {
    statusEl.className = `notification x-rank-status ${cls || ""}`.trim();
    statusEl.textContent = text || "";
    statusEl.hidden = !text;
  };

  // Tab switching
  containerEl.querySelectorAll("[data-rank-tab]").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      const t = tab.dataset.rankTab;
      if (t === currentRankType) return;
      currentRankType = t;
      containerEl.querySelectorAll("[data-rank-tab]").forEach((el) => el.classList.remove("is-active"));
      tab.classList.add("is-active");
      controlsEl.innerHTML = "";
      load(t);
    });
  });

  const setLoadMoreState = (text, disabled = false) => {
    if (!loadMoreEl) return;
    loadMoreEl.textContent = text || "滚动加载";
    loadMoreEl.disabled = !!disabled;
    loadMoreEl.hidden = !isPageableRank(currentRankType) || pageState.exhausted;
  };

  const setupLoadMore = () => {
    if (!loadMoreEl) return;
    if (pageState.observer) { pageState.observer.disconnect(); pageState.observer = null; }
    setLoadMoreState("滚动加载", false);
    if (!isPageableRank(currentRankType) || !("IntersectionObserver" in window)) return;
    pageState.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) doLoad({ append: true });
    }, { rootMargin: "320px 0px" });
    pageState.observer.observe(loadMoreEl);
  };

  const doLoad = async ({ append = false, force = false } = {}) => {
    if (append && (!isPageableRank(currentRankType) || pageState.loading || pageState.exhausted)) return;
    const page = append ? pageState.page + 1 : 1;
    // A delayed response from the former period/type must never repaint the new chart.
    const requestId = ++pageState.requestId;
    const requestedType = currentRankType;
    pageState.loading = true;
    if (append) setLoadMoreState("加载中...", true);
    else { setStatus("加载中...", "is-info"); listEl.innerHTML = ""; pageState.page = 1; pageState.exhausted = false; }
    try {
      const controls = readControls(controlsEl);
      const cacheKey = getRankCacheKey(currentRankType, controls, page);
      const cached = append || force ? null : getCache(cacheKey);
      if (cached) {
        const movies = cached?.data?.movies;
        if (Array.isArray(movies)) {
          if (requestId !== pageState.requestId || requestedType !== currentRankType) return;
          renderMovies(movies, { topType: controls.topType });
          setupLoadMore();
          setStatus("已从缓存加载", "is-success");
          return;
        }
        GM_deleteValue(cacheKey);
      }

      let config;
      try {
        config = getRankRequestConfig(currentRankType, controls, getSavedToken(), page);
      } catch (err) {
        if (err?.message === "NO_TOKEN") return setStatus("未设置 Token", "is-warning");
        throw err;
      }

      const res = await apiRequest(config);
      const data = JSON.parse(res.responseText || "{}");

      if (requestId !== pageState.requestId || requestedType !== currentRankType) return;

      if (data?.action) {
        if (/JWTVerification/i.test(data.action)) { GM_setValue(TOKEN_KEY, ""); return setStatus("Token 已失效，请重新登录", "is-danger"); }
        return setStatus(String(data.message || data.action).slice(0, 200), "is-danger");
      }
      if (data?.error) return setStatus(data.error.slice(0, 200), "is-danger");
      if (!data?.data?.movies || !Array.isArray(data.data.movies)) return setStatus("接口数据异常", "is-danger");

      const added = renderMovies(data.data.movies, { append, topType: controls.topType });
      if (!append) setCache(cacheKey, data);
      if (append) {
        if (added > 0) { pageState.page = page; setStatus(`已加载第 ${page} 页`, "is-success"); }
        else { pageState.exhausted = true; setStatus("暂无更多数据", "is-info"); }
      } else {
        pageState.page = 1;
        setStatus("加载完成", "is-success");
      }
      if (data.data.movies.length === 0 || !isPageableRank(currentRankType)) pageState.exhausted = true;
      setupLoadMore();
    } catch (err) {
      if (!append) listEl.innerHTML = "";
      setStatus(String(err?.message || err).slice(0, 200), "is-danger");
    } finally {
      if (requestId === pageState.requestId) {
        pageState.loading = false;
        setLoadMoreState(pageState.exhausted ? "暂无更多" : "滚动加载", false);
      }
    }
  };

  loadMoreEl?.addEventListener("click", () => doLoad({ append: true }));

  const load = async (loadType) => {
    listEl.innerHTML = "";
    controlsEl.innerHTML = "";
    const info = rankInfo(loadType);
    if (info.kind === "top") {
      const token = getSavedToken();
      if (!token) {
        setStatus("TOP250 \u9700\u8981\u767b\u5f55\u8ba4\u8bc1", "is-warning");
        const lnk = document.createElement("a");
        lnk.href = "#"; lnk.textContent = "\u70b9\u51fb\u767b\u5f55"; lnk.className = "button is-small is-link ml-2";
        lnk.addEventListener("click", (e) => { e.preventDefault(); showLoginModal((tk) => { if (tk) load("top"); }); });
        statusEl.querySelector("a")?.remove();
        statusEl.appendChild(lnk);
        return;
      }
      controlsEl.innerHTML = `<label class="x-rank-control"><span>\u7c7b\u578b</span><span class="select is-small"><select id="x-rank-top-type"><option value="">\u9ed8\u8ba4</option><option value="0">\u6709\u7801</option><option value="1">\u65e0\u7801</option><option value="all">\u5168\u90e8</option></select></span></label>
<button class="button is-small is-link" id="x-rank-load-btn">\u52a0\u8f7d</button>`;
      controlsEl.querySelector("#x-rank-load-btn").addEventListener("click", () => doLoad({ force: true }));
      controlsEl.querySelector("#x-rank-top-type").addEventListener("change", () => doLoad({ force: true }));
    } else if (info.kind === "playback") {
      controlsEl.innerHTML = `<label class="x-rank-control"><span>\u5468\u671f</span><span class="select is-small"><select id="x-rank-play-period"><option value="daily">\u6bcf\u65e5</option><option value="weekly">\u6bcf\u5468</option><option value="monthly">\u6bcf\u6708</option></select></span></label>
<label class="x-rank-control"><span>\u7b5b\u9009</span><span class="select is-small"><select id="x-rank-play-filter"><option value="all">\u5168\u90e8</option><option value="high_score">\u9ad8\u5206</option></select></span></label>
<button class="button is-small is-link" id="x-rank-load-btn">\u52a0\u8f7d</button>`;
      controlsEl.querySelector("#x-rank-load-btn").addEventListener("click", () => doLoad({ force: true }));
      controlsEl.querySelectorAll("#x-rank-play-period, #x-rank-play-filter").forEach((control) => control.addEventListener("change", () => doLoad({ force: true })));
    } else {
      controlsEl.innerHTML = `<label class="x-rank-control"><span>${html(info.label)}\u5468\u671f</span><span class="select is-small"><select id="x-rank-period"><option value="daily">\u6bcf\u65e5</option><option value="weekly">\u6bcf\u5468</option><option value="monthly" selected>\u6bcf\u6708</option></select></span></label>
<button class="button is-small is-link" id="x-rank-load-btn">\u52a0\u8f7d</button>`;
      controlsEl.querySelector("#x-rank-load-btn").addEventListener("click", () => doLoad({ force: true }));
      controlsEl.querySelector("#x-rank-period").addEventListener("change", () => doLoad({ force: true }));
    }
    doLoad();
  };

  const renderMovies = (movies, { append = false, topType = "" } = {}) => {
    if (!movies.length) { if (!append) listEl.innerHTML = '<div class="notification">暂无数据</div>'; return 0; }
    const existingLinks = append ? new Set(Array.from(listEl.querySelectorAll('.x-rank-card a[href]')).map((a) => a.getAttribute("href"))) : new Set();
    const filtered = movies.filter((m) => {
      if (currentRankType === "top" && !topTypeMatches(m, topType)) return false;
      const number = m.number || "";
      const link = m.id ? `/v/${m.id}` : `/search?q=${encodeURIComponent(number)}`;
      if (!append || !existingLinks.has(link)) return true;
      return false;
    });
    const offset = append ? listEl.querySelectorAll(".x-rank-card").length : 0;
    const markup = filtered.map((m, i) => {
      const number = m.number || "";
      // Rankings API supplies localized `title` and the original title separately.
      // Cards deliberately show the original title; detail pages keep their native
      // original/translation toggle untouched.
      const title = m.origin_title || m.current_title || m.title || "";
      const covers = coverCandidates(m);
      const cover = covers[0] || "";
      const rank = m.ranking || offset + i + 1;
      const score = m.score ?? "";
      const release = m.release_date || "";
      const magnets = m.magnets_count ?? "";
      const link = m.id ? `/v/${m.id}` : `/search?q=${encodeURIComponent(number)}`;
      return `<div class="item x-rank-card" data-id="${html(m.id || "")}" data-number="${html(number)}" data-rank-type="${html(currentRankType)}">
        <div class="cover">
          <a class="x-rank-card-link" href="${html(link)}" title="${html(`${number} ${title}`.trim())}">
            <img src="${html(cover)}" data-covers="${html(JSON.stringify(covers))}" data-cover-index="0" loading="lazy" referrerpolicy="no-referrer" style="width:100%;height:auto" onerror="try{const a=JSON.parse(this.dataset.covers||'[]');const i=(Number(this.dataset.coverIndex)||0)+1;if(i<a.length){this.dataset.coverIndex=i;this.src=a[i];}else{this.style.display='none';}}catch(e){this.style.display='none';}">
            <span class="tag is-danger x-rank-badge">#${html(rank)}</span>
          </a>
        </div>
        <a class="x-rank-title-link" href="${html(link)}" title="${html(`${number} ${title}`.trim())}">
          <div class="video-title">
            <strong>${html(number)}</strong>
            <span class="current-title">${html(title)}</span>
          </div>
        </a>
        <div class="meta" style="display:flex;flex-wrap:wrap;gap:0.25rem;margin-top:0.25rem;font-size:var(--x-size-sm);color:var(--grey)">
          ${score !== "" && score !== null ? `<span>评分 ${html(score)}</span>` : ""}
          ${release ? `<span>${html(release)}</span>` : ""}
          ${magnets !== "" && magnets !== null ? `<span>磁链 ${html(magnets)}</span>` : ""}
        </div>
      </div>`;
    }).join("");
    if (!append) listEl.innerHTML = markup;
    else listEl.insertAdjacentHTML("beforeend", markup);
    const items = append ? Array.from(listEl.querySelectorAll(".x-rank-card")).slice(-filtered.length) : listEl.querySelectorAll(".item");
    requestAnimationFrame(() => { window.dispatchEvent(new CustomEvent("JavDB.scroll", { detail: items })); });
    return filtered.length;
  };

  const html = (v) => String(v == null ? "" : v).replace(/[&<>'"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;" })[c]);
  load(type);
}

function restoreOriginalContent() {
  const root = document.querySelector(".section") || document.querySelector("main") || document.body;
  root.style.display = "";
  if (containerEl) { containerEl.style.display = "none"; containerEl.innerHTML = ""; }
}

// ============================================================
// Dedicated top navigation entry
// ============================================================
function getRankingsEntryUrl(type = "playback") {
  return `/?x_rankings_override=1&type=${encodeURIComponent(type)}`;
}

function getTopNavList() {
  return document.querySelector(".navbar-start");
}

function insertRankingsEntry() {
  const navList = getTopNavList();
  if (!navList) return;

  const settingsWrap = navList.querySelector(".x-layout-trigger")?.parentElement;
  const current = navList.querySelector(".x-rankings-override-trigger")?.parentElement;
  if (current) {
    if (settingsWrap && current.nextElementSibling !== settingsWrap) navList.insertBefore(current, settingsWrap);
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "navbar-item x-rankings-override-nav";

  const trigger = document.createElement("a");
  trigger.className = "navbar-item x-rankings-override-trigger";
  trigger.href = getRankingsEntryUrl("playback");
  trigger.textContent = "榜单";
  trigger.addEventListener("click", rankingsEntryClickHandler);

  wrap.append(trigger);
  navList.insertBefore(wrap, settingsWrap || null);
}

function rankingsEntryClickHandler(e) {
  e.preventDefault();
  e.stopPropagation();
  const type = new URL(e.currentTarget.href, location.origin).searchParams.get("type") || "playback";
  history.pushState(null, "", getRankingsEntryUrl(type));
  showRankingsPage(type);
}

// ============================================================
// Init
// ============================================================
(function () {
  const params = new URLSearchParams(location.search);
  if (params.get("x_rankings_override") === "1") {
    const type = params.get("type") || "playback";
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", insertRankingsEntry, { once: true });
    else insertRankingsEntry();
    showRankingsPage(type);
    return;
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", insertRankingsEntry, { once: true }); } else { insertRankingsEntry(); }
  [500, 1500, 3000].forEach((ms) => setTimeout(insertRankingsEntry, ms));
  window.addEventListener("popstate", () => {
    const isOurRoute = new URLSearchParams(location.search).has("x_rankings_override");
    if (isOurRoute) { const t = new URLSearchParams(location.search).get("type") || "playback"; showRankingsPage(t); }
    else if (currentRankType) { restoreOriginalContent(); currentRankType = ""; }
  });
})();
