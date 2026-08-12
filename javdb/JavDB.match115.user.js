// ==UserScript==
// @name            JavDB.match115
// @namespace       JavDB.match115@blc
// @version         0.0.42
// @author          blc
// @description     115 网盘匹配
// @match           https://javdb.com/*
// @icon            https://javdb.com/favicon.ico
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Grant.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Magnet.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Req.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Req115.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Match115Console.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Util.lib.js
// @connect         115.com
// @connect         aliyuncs.com
// @connect         jdbstatic.com
// @run-at          document-end
// @grant           GM_xmlhttpRequest
// @grant           GM_deleteValues
// @grant           GM_deleteValue
// @grant           GM_listValues
// @grant           unsafeWindow
// @grant           GM_openInTab
// @grant           GM_getValue
// @grant           GM_setValue
// @grant           GM_info
// @require         https://github.com/Tampermonkey/utils/raw/d8a4543a5f828dfa8eefb0a3360859b6fe9c3c34/requires/gh_2215_make_GM_xhr_more_parallel_again.js
// ==/UserScript==

// Util.upStore();

const TARGET_TXT = "匹配中";
const TARGET_CLASS = "x-match";

const VOID = "javascript:void(0);";
const CHANNEL = new BroadcastChannel(GM_info.script.name);
const MATCH_API = "reMatch";
const UNMATCHED_TXT = "未匹配";
const AUTO_MATCH_STORAGE_KEY = "JavDB.match115.autoEnabled";
const AUTO_MATCH_EVENT = "JavDB.match115.autoMatchChanged";
const RECHECK_UNMATCHED_EVENT = "JavDB.match115.recheckUnmatched";
const RECHECK_STATUS_EVENT = "JavDB.match115.recheckStatusChanged";
const MATCH_QUEUE_STATUS_EVENT = "JavDB.match115.queueStatusChanged";
const UNKNOWN_TXT = "\u672a\u68c0\u6d4b";
const METADATA_TXT = "\u8865\u5168\u4e2d";
const MATCH_REQUEST_TIMEOUT = 45 * 1000;
const withMatchTimeout = (promise, message = "115 匹配请求超时") => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(message)), MATCH_REQUEST_TIMEOUT);
  Promise.resolve(promise).then(
    (value) => { clearTimeout(timer); resolve(value); },
    (err) => { clearTimeout(timer); reject(err); },
  );
});

const isAutoMatchEnabled = () => GM_getValue(AUTO_MATCH_STORAGE_KEY, false) === true;

const setAutoMatchEnabled = (enabled) => {
  const value = Boolean(enabled);
  GM_setValue(AUTO_MATCH_STORAGE_KEY, value);
  window.dispatchEvent(new CustomEvent(AUTO_MATCH_EVENT, { detail: { enabled: value } }));
  if (!value) window.dispatchEvent(new CustomEvent(RECHECK_STATUS_EVENT, { detail: { status: "idle" } }));
  return value;
};

const initAutoMatchToggle = () => {
  if (document.querySelector(".x-auto-match-trigger")) return true;

  // The layout script owns the Settings entry.  Insert after it so the two
  // controls remain adjacent on both the tab and navbar variants.
  const settings = document.querySelector(".x-layout-trigger");
  if (!settings) return false;

  const wrap = settings.closest("li") || settings.parentElement;
  if (!wrap?.parentElement) return false;
  const navClass = settings.classList.contains("navbar-item") ? "navbar-item " : "";
  const makeProgress = (nav, name) => {
    const count = document.createElement("span");
    const track = document.createElement("span");
    const fill = document.createElement("span");
    count.className = `x-match-queue-count x-${name}-queue-count`;
    track.className = "x-match-queue-progress";
    fill.className = "x-match-queue-progress-fill";
    track.append(fill);
    nav.append(count, track);
    return { count, track, fill };
  };
  const updateProgress = (view, nav, detail, kind) => {
    const { status = "idle", total = 0, probed = 0, completed = 0, metadataPending = 0, failed = 0 } = detail || {};
    const isAuto = kind === "auto";
    const numerator = isAuto ? probed : completed;
    const active = total > 0 && status !== "idle" && status !== "cancelled";
    const pct = total ? Math.round((numerator / total) * 100) : 0;
    const prefix = isAuto ? `\u68c0\u6d4b ${probed}/${total}` : `\u91cd\u68c0 ${completed}/${total}`;
    view.count.textContent = active ? `${prefix}${metadataPending ? ` \u00b7 \u8865\u5168 ${metadataPending}` : ""}${failed ? ` \u00b7 \u5931\u8d25 ${failed}` : ""}` : "";
    view.fill.style.width = `${pct}%`;
    nav.classList.toggle("is-queue-active", active);
    nav.classList.toggle("is-queue-finished", status === "finished");
    nav.title = active ? `${prefix}${metadataPending ? `\uff0c\u8865\u5168\u4e2d ${metadataPending}` : ""}` : "";
  };

  const triggerWrap = wrap.tagName === "LI" ? document.createElement("li") : document.createElement("div");
  triggerWrap.className = "x-auto-match-nav";
  const trigger = document.createElement("a");
  const dot = document.createElement("span");
  trigger.href = VOID;
  trigger.className = `${navClass}x-auto-match-trigger`;
  trigger.textContent = "\u81ea\u52a8\u5339\u914d";
  dot.className = "x-auto-match-indicator";
  dot.setAttribute("aria-hidden", "true");
  trigger.append(dot);
  triggerWrap.append(trigger);
  const autoView = makeProgress(triggerWrap, "auto");
  wrap.insertAdjacentElement("afterend", triggerWrap);

  let recheck;
  let recheckWrap;
  let recheckView;
  if (document.querySelector(".movie-list")) {
    recheckWrap = wrap.tagName === "LI" ? document.createElement("li") : document.createElement("div");
    recheck = document.createElement("a");
    recheck.className = `${navClass}x-recheck-unmatched-trigger`;
    recheck.href = VOID;
    recheck.textContent = "\u91cd\u68c0\u672a\u5339\u914d";
    recheck.title = "\u91cd\u65b0\u68c0\u6d4b\u5f53\u524d\u9875\u53ca\u540e\u7eed\u7011\u5e03\u6d41\u5df2\u8bb0\u5f55\u4e3a\u672a\u5339\u914d\u7684\u5f71\u7247";
    recheck.addEventListener("click", (event) => {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent(RECHECK_UNMATCHED_EVENT));
    });
    const recheckDot = document.createElement("span");
    recheckDot.className = "x-recheck-unmatched-indicator";
    recheckDot.setAttribute("aria-hidden", "true");
    recheck.append(recheckDot);
    recheckWrap.className = "x-recheck-unmatched-nav";
    recheckWrap.append(recheck);
    recheckView = makeProgress(recheckWrap, "recheck");
    triggerWrap.insertAdjacentElement("afterend", recheckWrap);
    window.addEventListener(RECHECK_STATUS_EVENT, ({ detail }) => {
      const status = detail?.status || "idle";
      recheck.classList.toggle("is-running", status === "running" || status === "waiting");
      recheck.classList.toggle("is-finished", status === "finished");
    });
  }

  window.addEventListener(MATCH_QUEUE_STATUS_EVENT, ({ detail }) => {
    if (detail?.lane === "auto") updateProgress(autoView, triggerWrap, detail, "auto");
    if (detail?.lane === "recheck" && recheckView) updateProgress(recheckView, recheckWrap, detail, "recheck");
  });

  const render = (enabled) => {
    trigger.classList.toggle("is-active", enabled);
    trigger.setAttribute("aria-pressed", String(enabled));
    trigger.title = enabled ? "\u70b9\u51fb\u53d6\u6d88\u81ea\u52a8\u5339\u914d" : "\u70b9\u51fb\u5f00\u59cb\u81ea\u52a8\u5339\u914d";
  };
  render(isAutoMatchEnabled());
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    render(setAutoMatchEnabled(!isAutoMatchEnabled()));
  });
  window.addEventListener(AUTO_MATCH_EVENT, ({ detail }) => render(Boolean(detail?.enabled)));
  return true;
};

const observeAutoMatchToggle = () => {
  if (initAutoMatchToggle()) return;
  const observer = new MutationObserver(() => {
    if (initAutoMatchToggle()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10 * 1000);
};

const MatchCache = (() => {
  const PREFIX = "jdb_match_state_v2_";
  const LEGACY_PREFIX = "jdb_match_v1_";
  const MIGRATION_KEY = "jdb_match_state_v2_migrated";
  const RECHECK_MIGRATION_KEY = "jdb_match_state_v2_recheck_migrated";
  const STATE_VERSION = 2;
  const mem = new Map();

  const normalize = (key) => String(key || "").trim().toUpperCase();
  const fullKey = (key) => PREFIX + normalize(key);
  const valid = (value) => value
    && (value.status === "matched" || value.status === "unmatched")
    && Array.isArray(value.data)
    && typeof value.revision === "number";

  const makeRecord = (data, previous = null, updatedAt = Date.now(), phase = "complete") => ({
    status: data.length ? "matched" : "unmatched",
    data,
    phase: data.length ? phase : "complete",
    revision: (previous?.revision || 0) + 1,
    updatedAt,
    stateVersion: STATE_VERSION,
    needsRecheck: false,
  });

  const migrate = () => {
    if (GM_getValue(MIGRATION_KEY)) return;

    GM_listValues().forEach((key) => {
      if (!key.startsWith(LEGACY_PREFIX)) return;

      const legacy = GM_getValue(key);
      if (!legacy || !Array.isArray(legacy.data)) return;

      const cacheKey = normalize(key.slice(LEGACY_PREFIX.length));
      if (!cacheKey || valid(GM_getValue(fullKey(cacheKey)))) return;

      const migrated = makeRecord(legacy.data, null, legacy.ts || Date.now());
      if (!legacy.data.length) migrated.needsRecheck = true;
      GM_setValue(fullKey(cacheKey), migrated);
    });

    GM_setValue(MIGRATION_KEY, true);
  };

  // Earlier durable records did not distinguish a confirmed empty result from
  // a negative result inherited from the old cache.  Recheck those old empty
  // records once when the user turns automatic matching on.
  const markLegacyUnmatchedForRecheck = () => {
    if (GM_getValue(RECHECK_MIGRATION_KEY)) return;

    GM_listValues().forEach((key) => {
      if (!key.startsWith(PREFIX)) return;
      const record = GM_getValue(key);
      if (!valid(record) || record.status !== "unmatched" || record.stateVersion === STATE_VERSION) return;
      const upgraded = { ...record, stateVersion: STATE_VERSION, needsRecheck: true };
      mem.set(normalize(key.slice(PREFIX.length)), upgraded);
      GM_setValue(key, upgraded);
    });

    GM_setValue(RECHECK_MIGRATION_KEY, true);
  };

  const del = (key) => {
    const cacheKey = normalize(key);
    if (!cacheKey) return;
    mem.delete(cacheKey);
    GM_deleteValue(fullKey(cacheKey));
  };

  const getRecord = (key, { fresh = false } = {}) => {
    const cacheKey = normalize(key);
    if (!cacheKey) return null;

    // A QuickView iframe and its source page share GM storage but not this
    // in-memory map.  A code-only cross-frame notification must therefore be
    // able to bypass an older local `metadata` record and read the final value.
    let value = fresh ? GM_getValue(fullKey(cacheKey)) : mem.get(cacheKey);
    if (!value) {
      value = GM_getValue(fullKey(cacheKey));
      if (valid(value)) mem.set(cacheKey, value);
    }

    if (!valid(value)) {
      if (fresh) mem.delete(cacheKey);
      return null;
    }
    if (fresh) mem.set(cacheKey, value);
    return value;
  };

  const get = (key) => getRecord(key)?.data ?? null;

  const set = (key, data) => {
    const cacheKey = normalize(key);
    if (!cacheKey || !Array.isArray(data)) return;
    const value = makeRecord(data, mem.get(cacheKey) || GM_getValue(fullKey(cacheKey)));
    mem.set(cacheKey, value);
    GM_setValue(fullKey(cacheKey), value);
  };

  // A positive video hit is durable before the slower directory/subtitle pass.
  // Reloading the page can therefore resume enrichment without searching again.
  const setMetadataPending = (key, data) => {
    const cacheKey = normalize(key);
    if (!cacheKey || !Array.isArray(data) || !data.length) return;
    const value = makeRecord(data, mem.get(cacheKey) || GM_getValue(fullKey(cacheKey)), Date.now(), "metadata");
    mem.set(cacheKey, value);
    GM_setValue(fullKey(cacheKey), value);
  };

  migrate();
  markLegacyUnmatchedForRecheck();
  return { get, getRecord, getFreshRecord: (key) => getRecord(key, { fresh: true }), set, setMetadataPending, del };
})();


const listenClick = (onclose, defaultAction) => {
  const actions = {
    click: {
      val: "pc",
      url: "https://115vod.com/?pickcode=%s",
    },
    contextmenu: {
      val: "cid",
      url: "https://115.com/?cid=%s&mode=wangpan",
    },
  };

  const timer = {};
  const getHref = (node) => node.closest(`a:not(.${TARGET_CLASS})`)?.href;
  const getTimerKey = location.pathname.startsWith("/v/") ? () => location.href : getHref;

  const debounce = (target) => {
    const key = getTimerKey(target);
    if (!key) return;

    if (timer[key]) clearTimeout(timer[key]);

    timer[key] = setTimeout(() => {
      onclose?.(target);
      delete timer[key];
    }, 750);
  };

  const onclick = (e) => {
    const { target, type } = e;
    if (!target.classList.contains(TARGET_CLASS)) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const action = actions[type];
    if (!action) return;

    const val = target.dataset[action.val];
    if (!val) return defaultAction?.(e);

    const tab = Grant.openTab(action.url.replaceAll("%s", val));
    tab.onclose = () => debounce(target);
  };

  document.addEventListener("click", onclick);
  document.addEventListener("contextmenu", onclick);
};

const openMatchFolder = (target, onclose) => {
  const cid = target?.dataset.cid;
  if (!cid) return false;

  const tab = Grant.openTab(`https://115.com/?cid=${cid}&mode=wangpan`);
  tab.onclose = () => onclose?.(target);
  return true;
};

const formatBytes = (bytes, k = 1024) => {
  if (bytes < k) return "0KB";
  const units = ["KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)) - 1, units.length - 1);
  const size = (bytes / (k ** (i + 1))).toFixed(2);
  return `${size}${units[i]}`;
};

const extractData = (data, format = "s") => {
  const keys = ["pc", "cid", "fid", "n", "s", "t", "ico", "paths", "realPath", "name", "file_name", "hasCover", "hasSubtitle", "subtitleFiles", "subtitleDetectionVersion"];
  return data.map((item) => {
    const source = JSON.parse(JSON.stringify(item, keys));
    return { ...source, bytes: Number(item[format]) || 0, [format]: formatBytes(item[format]) };
  });
};

const materializeOfflineMatch = (payload = {}) => {
  const details = Util.codeParse(payload.code);
  return extractData(payload.data || []).map((file) => {
    const subtitleFiles = (payload.subtitleFiles || [])
      .filter((subtitle) => window.JavPackMatch115Console?.belongsToVideoSubtitleFile?.(file, subtitle, details))
      .map((subtitle) => ({ n: subtitle.n || subtitle.name || subtitle.file_name || "", s: subtitle.s || 0 }));
    return {
      ...file,
      cid: payload.cid || file.cid,
      realPath: payload.realPath || file.realPath,
      hasCover: Boolean(payload.hasCover),
      hasSubtitle: Boolean(subtitleFiles.length),
      subtitleFiles,
      subtitleDetectionVersion: window.JavPackMatch115Console?.subtitleDetectionVersion,
    };
  });
};

unsafeWindow.JavDBMatchSyncOffline = (payload) => {
  if (!payload?.code || !Array.isArray(payload.data)) return null;
  const sources = materializeOfflineMatch(payload);
  MatchCache.set(payload.code, sources);
  return sources;
};

unsafeWindow.JavDBMatchSyncOfflinePending = (payload) => {
  if (!payload?.code || !Array.isArray(payload.data)) return null;
  const sources = materializeOfflineMatch(payload);
  MatchCache.setMetadataPending(payload.code, sources);
  return sources;
};

const formatDirectory = (item) => {
  if (window.JavPackMatch115Console) return window.JavPackMatch115Console.formatDirectory(item);
  return item.t || item.pc || "";
};

const truncateHoverText = (value = "", max = 96) => {
  const text = String(value || "");
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
};

const formatHoverLine = (label, value = "", max = 96) => {
  if (window.JavPackMatch115Console?.formatHoverLine) return window.JavPackMatch115Console.formatHoverLine(label, value, max);
  const text = String(value || "");
  return `${label}：${truncateHoverText(text, max)}`;
};

const formatTip = (item) => [
  formatHoverLine("视频", item.n),
  item.s && `大小：${item.s}${item.videoCount ? ` · ${item.videoCount} 个视频` : ""}`,
  formatHoverLine("目录", formatDirectory(item)),
].filter(Boolean).join("\n");

const isVrTitle = (value = "") => /【\s*VR\s*】/i.test(String(value));

const getItemBytes = (item = {}) => {
  if (item.bytes !== undefined && Number.isFinite(Number(item.bytes))) return Number(item.bytes);

  const match = String(item.s || "").match(/^([\d.]+)\s*(KB|MB|GB|TB)$/i);
  if (!match) return 0;

  const powers = { KB: 1, MB: 2, GB: 3, TB: 4 };
  return Number(match[1]) * (1024 ** powers[match[2].toUpperCase()]);
};

const pickActiveMatch = (items = []) => {
  const zhs = items.filter((item) => Magnet.zhReg.test(item.n));
  const crack = items.find((item) => Magnet.crackReg.test(item.n));
  const both = zhs.find((item) => Magnet.crackReg.test(item.n));
  return both ?? zhs[0] ?? crack ?? items[0];
};

const uniqueBy = (items = [], key) => items.filter((item, index) => {
  const value = String(item?.[key] || "");
  return value && items.findIndex((candidate) => String(candidate?.[key] || "") === value) === index;
});

// Keep the persisted cache as individual files.  VR presentation is derived
// from it so normal matches and cross-window cache synchronization stay intact.
const getPresentationItems = (sources = [], details = {}) => {
  if (!details.isVR) return sources;

  const groups = new Map();
  sources.forEach((item) => {
    const key = String(item.cid || item.fid || item.pc || item.n || "");
    if (!key) return;
    groups.get(key)?.push(item) ?? groups.set(key, [item]);
  });

  return [...groups.values()].map((members) => {
    const active = pickActiveMatch(members);
    const subtitleFiles = uniqueBy(members.flatMap((item) => item.subtitleFiles || []), "n");
    const totalBytes = members.reduce((sum, item) => sum + getItemBytes(item), 0);

    return {
      ...active,
      isVrBundle: true,
      members,
      videoCount: members.length,
      bytes: totalBytes,
      s: formatBytes(totalBytes),
      hasSubtitle: members.some((item) => item.hasSubtitle),
      subtitleFiles,
    };
  });
};

const enrichMetadata = async (sources, details = {}) => {
  if (!window.JavPackMatch115Console?.enrichMetadata) return sources;
  return window.JavPackMatch115Console.enrichMetadata(sources, Req115, details);
};

const getPageDetails = (dom = document) => {
  const infoNode = dom.querySelector(".movie-panel-info");
  const code = infoNode?.querySelector(".first-block .value")?.textContent.trim();
  if (!code) return;

  const titleNode = dom.querySelector(".title.is-4");
  const label = titleNode?.querySelector("strong")?.textContent.trim() || "";
  const originTitle = titleNode?.querySelector(".origin-title")?.textContent.trim();
  const currentTitle = titleNode?.querySelector(".current-title")?.textContent.trim();
  const title = `${label}${originTitle || currentTitle || ""}`.replace(code, "").trim();
  // 详情页的演员链接位于 movie-panel-info 内；按页面展示顺序取首位演员作为默认归档目录。
  const actors = [...dom.querySelectorAll('.movie-panel-info a[href*="/actors/"]')]
    .map((node) => node.textContent.trim())
    .filter((name, index, names) => name && names.indexOf(name) === index);

  return {
    ...Util.codeParse(code),
    title,
    actors,
    isVR: isVrTitle(titleNode?.textContent),
    isUncensored: /无码|無碼/i.test(titleNode?.textContent || ""),
    cover: dom.querySelector(".video-cover")?.src || "",
  };
};

(function () {
  const CONT = document.querySelector(".movie-panel-info");
  if (!CONT) return;

  const render = ({ pc, cid, ...data }, details) => {
    if (window.JavPackMatch115Console) {
      return window.JavPackMatch115Console.renderItem({ pc, cid, ...data }, details);
    }

    return `
    <a
      href="${VOID}"
      class="${TARGET_CLASS}"
      title="${formatTip(data)}"
      data-pc="${pc}"
      data-cid="${cid}"
    >
      ${data.n}
    </a>
    `;
  };

  const renderMatches = (sources = []) => getPresentationItems(sources, codeDetails)
    .map((item) => render(item, codeDetails))
    .join("") || "暂无匹配";

  const matchCode = async ({ code, codes, regex }, { load, cont }) => {
    const UUID = crypto.randomUUID();
    load.dataset.uid = UUID;

    try {
      // Context-menu matching is an explicit one-card action.  It must not
      // wait behind the waterfall/recheck search coordinator.
      const sources = await withMatchTimeout((async () => {
        const { data = [] } = await Req115.filesSearchAllVideos(codes.join(" "), { skipMatchQueue: true });
        return enrichMetadata(extractData(data.filter((it) => regex.test(it.n))), { code, codes, regex });
      })(), "115 \u5339\u914d\u6216\u5143\u6570\u636e\u8865\u5168\u8d85\u65f6");
      if (load.dataset.uid !== UUID) return;

      cont.innerHTML = renderMatches(sources);
      MatchCache.set(code, sources);
      // This is the detail/QuickView matcher, not the card matcher below.
      // Send both positive and empty completed results to the source card now.
      syncQuickViewState("match", sources);
    } catch (err) {
      if (load.dataset.uid !== UUID) return;
      cont.innerHTML = "匹配失败";
      Util.print(err?.message);
    }

    load.textContent = "115";
  };

  const addBlock = () => {
    const load = `${TARGET_CLASS}-load`;
    const cont = `${TARGET_CLASS}-cont`;

    CONT.querySelector(".review-buttons + .panel-block").insertAdjacentHTML(
      "afterend",
      `<div class="panel-block x-match-block">
        <div class="x-match-heading"><strong><a href="${VOID}" class="${load}">${TARGET_TXT}</a>:</strong></div>
        <div class="value ${cont}">...</div>
      </div>`,
    );

    return {
      load: CONT.querySelector(`.${load}`),
      cont: CONT.querySelector(`.${cont}`),
    };
  };

  const code = CONT.querySelector(".first-block .value").textContent.trim();
  const codeDetails = getPageDetails() || Util.codeParse(code);
  const block = addBlock();
  const syncQuickViewState = (operation, data) => {
    const payload = { source: "JavDB.match115", type: "sync", id: crypto.randomUUID(), operation, code, data: Array.isArray(data) ? data : [] };
    CHANNEL.postMessage(payload);
    // Same-origin parent messaging is an immediate fallback for QuickView;
    // BroadcastChannel delivery can otherwise race with iframe removal.
    if (window.parent !== window) window.parent.postMessage(payload, location.origin);
  };
  const updateMatchCache = (operation, item, changes = {}) => {
    const cache = MatchCache.get(code) || [];
    const fids = new Set([item?.fid, ...(item?.members || []).map((member) => member?.fid)]
      .filter(Boolean)
      .map(String));
    const targetFiles = new Map((changes.files || []).map((file) => [String(file.fid), file]));
    const next = cache.map((source) => {
      if (!fids.has(String(source.fid))) return source;
      const target = targetFiles.get(String(source.fid));
      const updated = { ...source };

      if (operation === "archive") {
        updated.cid = changes.cid || source.cid;
        updated.realPath = changes.realPath || source.realPath;
        updated.hasCover = Boolean(changes.hasCover ?? source.hasCover);
        ["n", "ico", "pc"].forEach((key) => {
          if (target?.[key] !== undefined) updated[key] = target[key];
        });
        // `s` is the human-readable display size (for example, 5.09GB).
        // 115 returns its file size as raw bytes here, which belongs in `bytes`.
        if (target?.s !== undefined) updated.bytes = Number(target.s) || updated.bytes;
      } else if (operation === "rename" && String(source.fid) === String(item.fid)) {
        const ext = changes.file?.ico || source.ico;
        if (changes.rename && ext) updated.n = `${changes.rename}.${ext}`;
      } else if (operation === "cover") {
        updated.hasCover = Boolean(changes.hasCover);
      }
      return updated;
    });
    MatchCache.set(code, next);
    return next;
  };
  const matcher = (force = false) => {
    const cache = force ? null : MatchCache.get(code);
    if (cache !== null) {
      block.cont.innerHTML = renderMatches(cache);
      block.load.textContent = "115";
      return;
    }

    if (!force && !isAutoMatchEnabled()) {
      block.cont.textContent = UNMATCHED_TXT;
      block.load.textContent = UNMATCHED_TXT;
      return;
    }

    return matchCode(codeDetails, block);
  };

  matcher();
  window.addEventListener(AUTO_MATCH_EVENT, ({ detail }) => {
    if (detail?.enabled && block.cont.textContent === UNMATCHED_TXT) matcher();
  });
  listenClick(() => matcher(true));
  unsafeWindow[MATCH_API] = matcher;

  const refresh = ({ target }) => {
    if (target.textContent === TARGET_TXT) return;
    target.textContent = TARGET_TXT;
    matcher(true);
  };

  block.cont.addEventListener("click", (e) => {
    const target = e.target.closest(`.${TARGET_CLASS}`);
    if (!target || !block.cont.contains(target)) return;

    e.preventDefault();
    e.stopPropagation();
    openMatchFolder(target, () => matcher(true));
  }, true);

  block.load.addEventListener("click", refresh);
  window.JavPackMatch115Console?.bindActions(block.cont, {
    req115: Req115,
    grant: Grant,
    details: codeDetails,
    removeFromCache: (item, action) => {
      const cache = MatchCache.get(code) || [];
      const memberFids = new Set((item.members || []).map((member) => String(member.fid)).filter(Boolean));
      const next = cache.filter((file) => {
        if (action === "delv") return !memberFids.has(String(file.fid)) && String(file.fid) !== String(item.fid);
        if (action === "delf") return String(file.cid) !== String(item.cid);
        return true;
      });
      // Preserve an explicit empty result.  Deleting it would make the parent
      // card immediately search 115 again and briefly restore a stale frame.
      MatchCache.set(code, next);
      return next;
    },
    updateCache: (operation, item, changes) => updateMatchCache(operation, item, changes),
    syncCache: (operation, data) => syncQuickViewState(operation, data),
  });
  window.addEventListener("JavDB_SubtitleUploaded", ({ detail }) => {
    if (detail?.code && String(detail.code).trim().toUpperCase() !== String(code).trim().toUpperCase()) return;
    const cid = String(detail?.cid || "");
    const uploadedSubtitle = detail?.subtitle;
    const cache = MatchCache.get(code) || [];
    const next = cache.map((file) => {
      if (String(file.cid) !== cid) return file;
      const subtitleFiles = [...(file.subtitleFiles || []), uploadedSubtitle]
        .filter(Boolean)
        .filter((file, index, files) => files.findIndex((item) => item.n === file.n) === index);
      return { ...file, hasSubtitle: true, subtitleFiles };
    });
    MatchCache.set(code, next);
    block.cont.innerHTML = renderMatches(next);
    syncQuickViewState("subtitle", next);
  });
  window.addEventListener("beforeunload", () => CHANNEL.postMessage(code));
})();

(function () {
  const MOVIE_SELECTOR = ".movie-list .item";
  const CODE_SELECTORS = [".video-title", "strong"];
  const CODE_SELECTOR = CODE_SELECTORS.join(" ");
  const FORCE_MATCH_CLASS = "x-match-force";
  // Filtered cards can still be present in the DOM. They are not part of
  // the current page from the matching queue's point of view. This checks
  // CSS/layout visibility rather than viewport intersection, so cards below
  // the fold remain eligible when they are actually displayed.
  const isDisplayedMovieCard = (node) => {
    if (!(node instanceof Element)) return false;
    const card = node.matches(MOVIE_SELECTOR) ? node : node.closest(MOVIE_SELECTOR);
    if (!card?.isConnected) return false;
    if (card.hidden || card.classList.contains("x-purify-keyword-hidden") || card.dataset.purifyKeywordHidden === "1") return false;
    for (let current = card; current; current = current.parentElement) {
      if (current.hidden) return false;
      const style = window.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    }
    return true;
  };
  const getDisplayedMovieCards = () => [...document.querySelectorAll(MOVIE_SELECTOR)].filter(isDisplayedMovieCard);
  const TARGET_HTML = `<a href="${VOID}" class="tag is-unknown ${TARGET_CLASS}">${UNKNOWN_TXT}</a><button type="button" class="tag is-light ${FORCE_MATCH_CLASS} is-hidden" title="强制重新匹配 115" aria-label="强制重新匹配 115">↻</button>`;
  const SUBTITLE_ICON_HTML = `<span class="tag x-match-subtitle" title="网盘目录内已有字幕" aria-label="网盘目录内已有字幕"><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M2 12C2 8.22876 2 6.34315 3.17157 5.17157C4.34315 4 6.22876 4 10 4H14C17.7712 4 19.6569 4 20.8284 5.17157C22 6.34315 22 8.22876 22 12C22 15.7712 22 17.6569 20.8284 18.8284C19.6569 20 17.7712 20 14 20H10C6.22876 20 4.34315 20 3.17157 18.8284C2 17.6569 2 15.7712 2 12ZM6 15.25C5.58579 15.25 5.25 15.5858 5.25 16C5.25 16.4142 5.58579 16.75 6 16.75H10C10.4142 16.75 10.75 16.4142 10.75 16C10.75 15.5858 10.4142 15.25 10 15.25H6ZM7.75 13C7.75 12.5858 7.41421 12.25 7 12.25H6C5.58579 12.25 5.25 12.5858 5.25 13C5.25 13.4142 5.58579 13.75 6 13.75H7C7.41421 13.75 7.75 13.4142 7.75 13ZM11.5 12.25C11.9142 12.25 12.25 12.5858 12.25 13C12.25 13.4142 11.9142 13.75 11.5 13.75H9.5C9.08579 13.75 8.75 13.4142 8.75 13C8.75 12.5858 9.08579 12.25 9.5 12.25H11.5ZM18.75 13C18.75 12.5858 18.4142 12.25 18 12.25H14C13.5858 12.25 13.25 12.5858 13.25 13C13.25 13.4142 13.5858 13.75 14 13.75H18C18.4142 13.75 18.75 13.4142 18.75 13ZM12.5 15.25C12.0858 15.25 11.75 15.5858 11.75 16C11.75 16.4142 12.0858 16.75 12.5 16.75H14C14.4142 16.75 14.75 16.4142 14.75 16C14.75 15.5858 14.4142 15.25 14 15.25H12.5ZM15.75 16C15.75 15.5858 16.0858 15.25 16.5 15.25H18C18.4142 15.25 18.75 15.5858 18.75 16C18.75 16.4142 18.4142 16.75 18 16.75H16.5C16.0858 16.75 15.75 16.4142 15.75 16Z" fill="currentColor"></path></svg></span>`;
  const MATCH_TYPE_COLORS = {
    normal: "var(--x-success)",
    crack: "var(--x-info)",
    subtitle: "var(--x-warning)",
    both: "var(--x-danger)",
    leak: "var(--x-leak)",
    leakZh: "var(--x-leak-zh)",
  };

  const movieList = document.querySelectorAll(MOVIE_SELECTOR);
  if (!movieList.length) return;

  const parseCodeCls = (code) => ["x", ...code.split(/[\s.\-_]/)].filter(Boolean).join("-");
  const normalizeMatchCode = (code) => String(code || "").trim().toUpperCase();
  const findCardsByCode = (code) => {
    const normalized = normalizeMatchCode(code);
    if (!normalized) return [];
    return [...document.querySelectorAll(MOVIE_SELECTOR)].filter((card) => {
      const stored = normalizeMatchCode(card.dataset.matchCode);
      const current = normalizeMatchCode(card.querySelector(CODE_SELECTOR)?.textContent);
      return stored === normalized || current === normalized;
    });
  };
  const getMatchType = ({ n }) => {
    const crack = Magnet.crackReg.test(n);
    const subtitle = Magnet.zhReg.test(n);
    const leaked = Magnet.leakReg.test(n);
    if (leaked && subtitle) return "leakZh";
    if (leaked) return "leak";
    if (crack && subtitle) return "both";
    if (subtitle) return "subtitle";
    if (crack) return "crack";
    return "normal";
  };
  const getMatchTypes = (sources) => sources.map(getMatchType);
  const syncSubtitleIcon = (itemNode, sources) => {
    const tags = itemNode.querySelector(".tags.has-addons");
    if (!tags) return;

    const icon = tags.querySelector(".x-match-subtitle");
    if (sources.some((item) => item.hasSubtitle)) {
      if (!icon) tags.insertAdjacentHTML("beforeend", SUBTITLE_ICON_HTML);
    } else {
      icon?.remove();
    }
  };
  const getMatchGradient = (types) => {
    if (!types.length) return "";
    const step = 100 / types.length;
    return `linear-gradient(180deg, ${types
      .map((type, index) => {
        const color = MATCH_TYPE_COLORS[type];
        return `${color} ${index * step}% ${(index + 1) * step}%`;
      })
      .join(", ")})`;
  };

  const matchAfter = ({ code, regex, target, manual = false }, data) => {
    if (target.dataset.manualMatchPending && !manual) return;
    const itemNode = target.closest(MOVIE_SELECTOR);
    delete itemNode.dataset.matchPending;
    delete target.dataset.manualMatchPending;
    itemNode.dataset.matchResolved = "1";
    itemNode.classList.add(parseCodeCls(code));
    const sources = data.filter((it) => regex.test(it.n));
    const len = sources.length;
    syncSubtitleIcon(itemNode, sources);

    let pc = "";
    let cid = "";
    let title = "鼠标左键缓存刷新，右键接口刷新";
    let className = "is-normal";
    let textContent = UNMATCHED_TXT;

    if (len) {
      const zhs = sources.filter((it) => Magnet.zhReg.test(it.n));
      const crack = sources.find((it) => Magnet.crackReg.test(it.n));
      const leaked = sources.find((it) => Magnet.leakReg.test(it.n));

      const zh = zhs[0];
      const both = zhs.find((it) => Magnet.crackReg.test(it.n));
      const leakZh = zhs.find((it) => Magnet.leakReg.test(it.n));
      const active = leakZh ?? leaked ?? both ?? zh ?? crack ?? sources[0];
      const types = getMatchTypes(sources);
      const isVR = Boolean(target.dataset.isVr === "1");
      const presentation = getPresentationItems(sources, { isVR });

      pc = active.pc;
      cid = active.cid;
      title = presentation.map(formatTip).join("\n\n");
      className = leakZh ? "is-leak-zh" : leaked ? "is-leak" : both ? "is-danger" : zh ? "is-warning" : crack ? "is-info" : "is-success";
      textContent = "已匹配";
      if (len > 1 && !isVR) textContent += ` ${len}`;

      itemNode.classList.toggle("x-multi-matched", types.length > 1);
      itemNode.dataset.matchTypes = types.join(" ");
      itemNode.style.setProperty("--multi-match-bg", getMatchGradient(types));
    } else {
      itemNode.classList.remove("x-multi-matched");
      delete itemNode.dataset.matchTypes;
      itemNode.style.removeProperty("--multi-match-bg");
    }

    const node = target.querySelector(`.${TARGET_CLASS}`);
    const forceButton = target.querySelector(`.${FORCE_MATCH_CLASS}`);
    node.title = title;
    node.className = `tag ${className} ${TARGET_CLASS}`;
    node.dataset.pc = pc;
    node.dataset.cid = cid;
    node.textContent = textContent;
    forceButton?.classList.toggle("is-hidden", !len);
    forceButton?.classList.remove("is-loading");
    if (forceButton) forceButton.disabled = false;
  };

  const setMatchTag = ({ target }, text, className, title = "") => {
    const node = target.querySelector(`.${TARGET_CLASS}`);
    if (!node) return;
    node.className = `tag ${className} ${TARGET_CLASS}`;
    node.textContent = text;
    node.title = title;
    node.dataset.pc = "";
    node.dataset.cid = "";
  };

  const renderUnknown = (details) => {
    if (details.target?.dataset.manualMatchPending && !details.manual) return;
    const card = details.target?.closest(MOVIE_SELECTOR);
    delete card?.dataset.matchPending;
    delete card?.dataset.matchResolved;
    delete details.target?.dataset.manualMatchPending;
    setMatchTag(details, UNKNOWN_TXT, "is-unknown", "\u5c1a\u672a\u68c0\u6d4b 115 \u662f\u5426\u5b58\u5728\u89c6\u9891");
    const button = details.target?.querySelector(`.${FORCE_MATCH_CLASS}`);
    button?.classList.remove("is-loading");
    if (button) button.disabled = false;
  };
  const renderMetadataPending = (details) => {
    if (details.target?.dataset.manualMatchPending && !details.manual) return;
    setMatchTag(details, METADATA_TXT, "is-metadata-pending", "\u5df2\u53d1\u73b0\u89c6\u9891\uff0c\u6b63\u5728\u8865\u5168\u76ee\u5f55\u3001\u5c01\u9762\u548c\u5b57\u5e55\u4fe1\u606f");
    const button = details.target?.querySelector(`.${FORCE_MATCH_CLASS}`);
    if (!details.manual) {
      button?.classList.remove("is-loading");
      if (button) button.disabled = false;
    }
  };

  const matchBefore = (node) => {
    if (node.classList.contains("is-hidden")) return;

    const target = node.querySelector(CODE_SELECTORS[0]);
    if (!target) return;

    const code = target.querySelector(CODE_SELECTORS[1])?.textContent.trim();
    if (!code) return;

    node.dataset.matchCode = normalizeMatchCode(code);
    if (!target.querySelector(`.${TARGET_CLASS}`)) target.insertAdjacentHTML("afterbegin", TARGET_HTML);

    const parsed = Util.codeParse(code);
    target.dataset.isVr = isVrTitle(target.textContent) ? "1" : "";
    return { ...parsed, searchKey: parsed.codes.join(" "), target };
  };
  const useMatchQueue = (before, after) => {
    const wait = {};
    const probeQueues = { auto: [], recheck: [], normal: [] };
    const queuedKeys = new Map();
    const metadataQueue = [];
    const stats = {
      auto: { total: 0, probed: 0, completed: 0, metadataPending: 0, failed: 0, status: "idle" },
      recheck: { total: 0, probed: 0, completed: 0, metadataPending: 0, failed: 0, status: "idle" },
    };
    let loading = false;
    const METADATA_CONCURRENCY = 2;
    let metadataLoading = 0;
    const metadataCurrent = new Set();

    const laneOf = ({ auto, recheck }) => recheck ? "recheck" : auto ? "auto" : "normal";
    const emit = (lane, status = null) => {
      if (lane === "normal") return;
      const state = stats[lane];
      if (status) state.status = status;
      window.dispatchEvent(new CustomEvent(MATCH_QUEUE_STATUS_EVENT, { detail: { lane, ...state } }));
    };
    const trackQueued = (it) => {
      if (it.lane === "normal" || it.tracked) return;
      it.tracked = true;
      const state = stats[it.lane];
      state.total += 1;
      state.status = "running";
      emit(it.lane);
    };
    const trackProbe = (it) => {
      if (it.lane === "normal" || it.probed) return;
      it.probed = true;
      stats[it.lane].probed += 1;
      emit(it.lane);
    };
    const trackMetadata = (it) => {
      if (it.lane === "normal" || it.metadataTracked) return;
      it.metadataTracked = true;
      stats[it.lane].metadataPending += 1;
      emit(it.lane);
    };
    const settleItem = (it, { failed = false } = {}) => {
      if (it.settled) return;
      it.settled = true;
      if (it.lane !== "normal") {
        const state = stats[it.lane];
        if (it.metadataTracked) state.metadataPending = Math.max(0, state.metadataPending - 1);
        state.completed += 1;
        if (failed) state.failed += 1;
        if (state.completed >= state.total) state.status = "finished";
        emit(it.lane);
      }
      it.onSettled?.(it);
    };
    const resetCancelledAutoItem = (it) => {
      it.cancelled = true;
      const card = it.target.closest(MOVIE_SELECTOR);
      delete card?.dataset.matchPending;
      if (it.recheck) delete card?.dataset.recheckSession;
      if (it.recheck || it.auto) renderUnknown(it);
      settleItem(it);
    };
    const cancelHiddenAutoItem = (it) => {
      if (!it.auto || isDisplayedMovieCard(it.target)) return false;
      resetCancelledAutoItem(it);
      return true;
    };
    const enqueueProbe = (searchKey, lane) => {
      const existing = queuedKeys.get(searchKey);
      if (existing) {
        if (lane === "auto" && existing.lane !== "auto") {
          const source = probeQueues[existing.lane];
          const index = source.indexOf(existing);
          if (index >= 0) source.splice(index, 1);
          existing.lane = "auto";
          probeQueues.auto.push(existing);
        }
        return;
      }
      const job = { searchKey, lane };
      queuedKeys.set(searchKey, job);
      probeQueues[lane].push(job);
    };
    const nextProbe = () => probeQueues.auto.shift() || probeQueues.recheck.shift() || probeQueues.normal.shift();

    const runMetadata = async (job) => {
      const { it, scoped, shouldCache } = job;
      let failed = false;
      try {
        if (cancelHiddenAutoItem(it)) return;
        const enriched = await withMatchTimeout(
          enrichMetadata(scoped, it),
          "115 \u5143\u6570\u636e\u8865\u5168\u8d85\u65f6",
        );
        if (!it.cancelled) {
          if (shouldCache) MatchCache.set(it.code, enriched);
          after?.(it, enriched);
        }
      } catch (err) {
        failed = true;
        // Preserve the durable positive hit.  A retry can resume metadata work
        // without incorrectly replacing it with an empty match result.
        if (!it.cancelled) {
          delete it.target.closest(MOVIE_SELECTOR)?.dataset.matchPending;
          if (it.force) {
            // Explicit right-click/rematch actions must always leave the card
            // in a completed state. The known video result is still usable
            // when directory/cover/subtitle enrichment times out.
            if (shouldCache) MatchCache.set(it.code, scoped);
            after?.(it, scoped);
          } else {
            renderMetadataPending(it);
          }
          Util.print(err?.message);
        }
      } finally {
        metadataCurrent.delete(job);
        metadataLoading -= 1;
        settleItem(it, { failed });
        drainMetadata();
      }
    };
    const drainMetadata = () => {
      while (metadataLoading < METADATA_CONCURRENCY && metadataQueue.length) {
        const job = metadataQueue.shift();
        if (cancelHiddenAutoItem(job.it)) continue;
        metadataLoading += 1;
        metadataCurrent.add(job);
        runMetadata(job);
      }
    };
    const enqueueMetadata = (it, scoped, shouldCache = true) => {
      if (cancelHiddenAutoItem(it)) return;
      trackMetadata(it);
      metadataQueue.push({ it, scoped, shouldCache });
      drainMetadata();
    };
    const resolveSearch = (key, data = []) => {
      const pending = wait[key] || [];
      delete wait[key];
      pending.forEach((it) => {
        const scoped = data.filter((file) => it.regex.test(file.n));
        trackProbe(it);
        if (cancelHiddenAutoItem(it)) return;
        if (!scoped.length) {
          if (!it.cancelled) {
            MatchCache.set(it.code, []);
            after?.(it, []);
          }
          settleItem(it);
          return;
        }
        if (!it.cancelled) {
          MatchCache.setMetadataPending(it.code, scoped);
          renderMetadataPending(it);
          enqueueMetadata(it, scoped, true);
        } else {
          settleItem(it);
        }
      });
    };
    const match = async () => {
      if (loading) return;
      const job = nextProbe();
      if (!job) return;
      const { searchKey } = job;
      queuedKeys.delete(searchKey);
      const activePending = (wait[searchKey] || []).filter((it) => !cancelHiddenAutoItem(it));
      if (!activePending.length) {
        delete wait[searchKey];
        return match();
      }
      wait[searchKey] = activePending;
      loading = true;
      try {
        const { data = [] } = await withMatchTimeout(Req115.filesSearchAllVideos(searchKey));
        const pendingItems = (wait[searchKey] || []).filter((it) => !cancelHiddenAutoItem(it));
        if (pendingItems.length) wait[searchKey] = pendingItems;
        else delete wait[searchKey];
        const matchedData = data.filter((item) => pendingItems.some(({ regex }) => regex.test(item.n)));
        resolveSearch(searchKey, extractData(matchedData));
      } catch (err) {
        // Search failures retain the prior local state instead of writing a
        // false negative result.
        const pending = wait[searchKey] || [];
        delete wait[searchKey];
        pending.forEach((it) => {
          trackProbe(it);
          if (cancelHiddenAutoItem(it)) return;
          if (!it.cancelled) {
            const record = MatchCache.getRecord(it.code) ?? MatchCache.getRecord(it.prefix);
            if (record?.phase === "metadata") renderMetadataPending(it);
            else if (record?.data) after?.(it, record.data);
            else renderUnknown(it);
          }
          settleItem(it, { failed: true });
        });
        Util.print(err?.message);
      }
      loading = false;
      match();
    };
    const dispatch = (node, { force = false, cacheOnly = false, auto = false, recheck = false, onSettled = null } = {}) => {
      if (auto && !isAutoMatchEnabled()) return;
      if (auto && !isDisplayedMovieCard(node)) return;
      const details = before?.(node);
      if (!details) return;
      if (details.target.dataset.manualMatchPending) return;
      const { code, prefix, searchKey } = details;
      const record = MatchCache.getRecord(code) ?? MatchCache.getRecord(prefix);
      const recheckLegacyEmpty = auto && record?.needsRecheck === true;
      const refreshStoredResult = force || recheck || recheckLegacyEmpty;
      if (cacheOnly && record?.data) return after?.(details, record.data);
      // `force` is the explicit recovery path used by right-click refresh and
      // the adjacent rematch button.  It must be allowed to replace a stale
      // pending flag; otherwise the later reset below is unreachable and the
      // card stays on "匹配中" forever.
      if ((!force && node.dataset.matchPending === "1") || (node.dataset.matchResolved === "1" && !refreshStoredResult)) return;
      if (record?.phase === "metadata" && !refreshStoredResult) {
        renderMetadataPending(details);
        if (!auto) return;
        const it = { ...details, force, auto, recheck, onSettled, lane: laneOf({ auto, recheck }), settled: false, cancelled: false };
        node.dataset.matchPending = "1";
        trackQueued(it);
        enqueueMetadata(it, record.data.filter((file) => it.regex.test(file.n)), true);
        return;
      }
      if (record?.data && !refreshStoredResult) return after?.(details, record.data);
      if (refreshStoredResult) {
        delete node.dataset.matchPending;
        delete node.dataset.matchResolved;
      }
      const it = { ...details, force, auto, recheck, onSettled, lane: laneOf({ auto, recheck }), settled: false, cancelled: false };
      node.dataset.matchPending = "1";
      setMatchTag(it, TARGET_TXT, "is-normal");
      trackQueued(it);
      if (!wait[searchKey]) wait[searchKey] = [];
      wait[searchKey].push(it);
      enqueueProbe(searchKey, it.lane);
      match();
    };
    const callback = (entries, obs) => entries.forEach(({ isIntersecting, target }) => {
      if (isIntersecting) obs.unobserve(target) || requestAnimationFrame(() => dispatch(target, { auto: true }));
    });
    const obs = new IntersectionObserver(callback, { threshold: 0.25 });
    const cancelAuto = () => {
      Object.entries(wait).forEach(([key, pending]) => {
        const keep = pending.filter((it) => {
          if (!it.auto) return true;
          resetCancelledAutoItem(it);
          return false;
        });
        if (keep.length) wait[key] = keep;
        else delete wait[key];
      });
      metadataQueue.splice(0).forEach((job) => {
        if (job.it.auto) resetCancelledAutoItem(job.it);
        else metadataQueue.push(job);
      });
      metadataCurrent.forEach((job) => {
        if (job.it.auto) resetCancelledAutoItem(job.it);
      });
      stats.auto = { total: 0, probed: 0, completed: 0, metadataPending: 0, failed: 0, status: "cancelled" };
      emit("auto");
    };
    const enqueue = (nodeList, options = {}) => [...nodeList].forEach((node) => {
      if (options.auto && !isDisplayedMovieCard(node)) return;
      const { force = false, immediate = false } = options;
      if (force || immediate || document.documentElement.classList.contains("x-actor-matched-only")) {
        requestAnimationFrame(() => dispatch(node, options));
      } else {
        obs.observe(node);
      }
    });
    const setLaneStatus = (lane, status) => {
      if (lane !== "normal") emit(lane, status);
    };
    return { enqueue, cancelAuto, setLaneStatus };
  };

  const { enqueue: matchQueue, cancelAuto: cancelAutoMatchQueue, setLaneStatus } = useMatchQueue(matchBefore, matchAfter);
  const handledSyncs = new Set();
  let recheckSession = null;

  const hydrateMatchCard = (node) => {
    const details = matchBefore(node);
    if (!details) return;
    const record = MatchCache.getRecord(details.code) ?? MatchCache.getRecord(details.prefix);
    if (!record) return renderUnknown(details);
    if (record.phase === "metadata") return renderMetadataPending(details);
    matchAfter(details, record.data);
  };
  const hydrateSyncedCards = (code) => {
    let foundState = false;
    findCardsByCode(code).forEach((node) => {
      const details = matchBefore(node);
      if (!details) return;
      const record = MatchCache.getFreshRecord(details.code) ?? MatchCache.getFreshRecord(details.prefix);
      if (!record) return;
      foundState = true;
      if (record.phase === "metadata") renderMetadataPending(details);
      else matchAfter(details, record.data);
    });
    return foundState;
  };
  const finishRecheckWhenExhausted = () => {
    if (!recheckSession?.active) return;
    if (recheckSession.pending > 0) return;
    const load = document.querySelector(".x-load");
    const noMore = !load || /\u6682\u65e0\u66f4\u591a/.test(load.textContent || "");
    if (!noMore) {
      setLaneStatus("recheck", "waiting");
      window.dispatchEvent(new CustomEvent(RECHECK_STATUS_EVENT, { detail: { status: "waiting" } }));
      return;
    }
    recheckSession.active = false;
    setLaneStatus("recheck", "finished");
    window.dispatchEvent(new CustomEvent(RECHECK_STATUS_EVENT, { detail: { status: "finished" } }));
  };
  const collectRecheckCards = (nodes) => {
    if (!recheckSession?.active || !isAutoMatchEnabled()) return;
    const cards = [...nodes].filter((node) => {
      if (!isDisplayedMovieCard(node) || !node.matches?.(MOVIE_SELECTOR) || node.dataset.recheckSession === recheckSession.id) return false;
      const details = matchBefore(node);
      if (!details || node.dataset.matchPending === "1") return false;
      const record = MatchCache.getRecord(details.code) ?? MatchCache.getRecord(details.prefix);
      // A continuous recheck only picks up records that were already known to
      // be empty when the session began. Newly probed unknown cards never get
      // searched twice in the same page run.
      if (record?.status !== "unmatched" || Number(record.updatedAt || 0) > recheckSession.startedAt) return false;
      node.dataset.recheckSession = recheckSession.id;
      return true;
    });
    if (!cards.length) return;
    recheckSession.pending += cards.length;
    setLaneStatus("recheck", "running");
    window.dispatchEvent(new CustomEvent(RECHECK_STATUS_EVENT, { detail: { status: "running" } }));
    matchQueue(cards, {
      force: true,
      immediate: true,
      auto: true,
      recheck: true,
      onSettled: () => {
        if (recheckSession) recheckSession.pending = Math.max(0, recheckSession.pending - 1);
        requestAnimationFrame(finishRecheckWhenExhausted);
      },
    });
  };
  const queueDisplayedAutoCards = () => {
    if (!isAutoMatchEnabled()) return;
    const cards = getDisplayedMovieCards();
    collectRecheckCards(cards);
    matchQueue(cards, { auto: true, immediate: true });
  };
  movieList.forEach(hydrateMatchCard);
  queueDisplayedAutoCards();

  const handleIncomingCards = (nodes) => {
    const cards = [];
    nodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.matches?.(MOVIE_SELECTOR)) cards.push(node);
      cards.push(...node.querySelectorAll?.(MOVIE_SELECTOR) || []);
    });
    if (!cards.length) return;
    cards.forEach(hydrateMatchCard);
    const displayedCards = cards.filter(isDisplayedMovieCard);
    collectRecheckCards(displayedCards);
    if (isAutoMatchEnabled()) matchQueue(displayedCards, { auto: true, immediate: true });
  };
  window.addEventListener("JavDB.scroll", ({ detail }) => {
    // The mutation observer is the durable fallback; the card flags in the
    // queue/session make receiving both signals harmless.
    handleIncomingCards(detail);
    requestAnimationFrame(finishRecheckWhenExhausted);
  });
  new MutationObserver((records) => records.forEach((record) => handleIncomingCards(record.addedNodes)))
    .observe(document.body, { childList: true, subtree: true });
  window.addEventListener("JavDB.filter.keywordConfigChanged", () => requestAnimationFrame(queueDisplayedAutoCards));
  window.addEventListener("storage", ({ key }) => {
    if (key === "JavDB.filter.keywordConfig.v1") requestAnimationFrame(queueDisplayedAutoCards);
  });
  new MutationObserver((records) => {
    const root = document.documentElement;
    const changed = records.some(({ target, oldValue }) => {
      if (target !== root) return false;
      const oldClasses = new Set(String(oldValue || "").split(/\s+/).filter(Boolean));
      return ["x-score-filter-active", "x-actor-matched-only"].some((name) => oldClasses.has(name) !== root.classList.contains(name));
    });
    if (changed) requestAnimationFrame(queueDisplayedAutoCards);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
  window.addEventListener(AUTO_MATCH_EVENT, ({ detail }) => {
    if (detail?.enabled) queueDisplayedAutoCards();
    else {
      recheckSession = null;
      cancelAutoMatchQueue();
      setLaneStatus("recheck", "cancelled");
      window.dispatchEvent(new CustomEvent(RECHECK_STATUS_EVENT, { detail: { status: "idle" } }));
    }
  });
  window.addEventListener(RECHECK_UNMATCHED_EVENT, () => {
    if (!isAutoMatchEnabled()) {
      Util.print("\u8bf7\u5148\u5f00\u542f\u81ea\u52a8\u5339\u914d");
      return;
    }
    if (!recheckSession?.active) {
      recheckSession = { id: crypto.randomUUID(), startedAt: Date.now(), active: true, pending: 0 };
      window.dispatchEvent(new CustomEvent(RECHECK_STATUS_EVENT, { detail: { status: "running" } }));
    }
    collectRecheckCards(getDisplayedMovieCards());
    requestAnimationFrame(finishRecheckWhenExhausted);
  });

  const receiveMatchState = (data) => {
    const payload = typeof data === "string" ? { code: data } : data;
    if (!payload?.code) return;
    if (payload.id && handledSyncs.has(payload.id)) return;
    if (payload.id) {
      handledSyncs.add(payload.id);
      setTimeout(() => handledSyncs.delete(payload.id), 30 * 1000);
    }
    const isSnapshot = (payload.type === "sync" || payload.type === "offline") && Array.isArray(payload.data);
    if (isSnapshot) {
      const sources = payload.type === "offline" ? materializeOfflineMatch(payload) : payload.data;
      const metadataPending = payload.operation === "offline-pending";
      if (metadataPending) MatchCache.setMetadataPending(payload.code, sources);
      else MatchCache.set(payload.code, sources);
      // A new/untested card has no match-result CSS class yet.  Render the
      // exact snapshot by its stable card code so QuickView close is immediate.
      findCardsByCode(payload.code).forEach((node) => {
        const details = matchBefore(node);
        if (!details) return;
        if (metadataPending) renderMetadataPending(details);
        else matchAfter(details, sources);
      });
      // The parent receives an exact post-mutation snapshot before the Quick
      // View frame disappears, so it can repaint without querying 115 again.
      window.dispatchEvent(new CustomEvent("JavDB_MatchCacheSynced", { detail: { code: payload.code, operation: payload.operation } }));
      return;
    }
    // Older detail frames and the beforeunload fallback only announce the
    // code.  Read GM storage afresh first: the iframe may already have written
    // a completed matched *or unmatched* record while this page still holds a
    // stale in-memory "补全中" entry.  Re-entering the queue in that state is
    // de-duplicated, which is what previously left the card stuck forever.
    if (hydrateSyncedCards(payload.code)) {
      window.dispatchEvent(new CustomEvent("JavDB_MatchCacheSynced", { detail: { code: payload.code, operation: payload.operation || "cache" } }));
      return;
    }
    matchQueue(findCardsByCode(payload.code), { force: true, cacheOnly: false, immediate: true });
  };
  CHANNEL.onmessage = ({ data }) => receiveMatchState(data);
  window.addEventListener("message", ({ data, origin }) => {
    if (origin === location.origin && data?.source === "JavDB.match115") receiveMatchState(data);
  });

  const queueManualMatch = async (node, { clearCache = false } = {}) => {
    const movie = node.closest(MOVIE_SELECTOR);
    if (!movie) return;

    const code = movie.querySelector(CODE_SELECTOR)?.textContent.trim();
    const target = movie.querySelector(`.${TARGET_CLASS}`);
    if (!code || !target) return;

    const parsed = matchBefore(movie);
    if (!parsed) return;
    const details = { ...parsed, manual: true };
    const fallback = clearCache
      ? null
      : MatchCache.getRecord(details.code) ?? MatchCache.getRecord(details.prefix);
    if (clearCache) MatchCache.del(code);
    const requestId = crypto.randomUUID();
    target.dataset.uid = requestId;
    target.dataset.manualMatchPending = requestId;
    delete movie.dataset.matchPending;
    delete movie.dataset.matchResolved;
    setMatchTag(details, TARGET_TXT, "is-normal");

    try {
      // Manual right-click/rematch is an independent one-card lane. It skips
      // both the page probe queue and Req115's global match-search slot, so it
      // can run beside automatic matching or unmatched recheck.
      const { data = [] } = await withMatchTimeout(
        Req115.filesSearchAllVideos(details.codes.join(" "), { skipMatchQueue: true }),
        "115 手动强制匹配请求超时",
      );
      if (target.dataset.uid !== requestId) return;

      const scoped = extractData(data.filter((item) => details.regex.test(item.n)));
      if (!scoped.length) {
        MatchCache.set(code, []);
        matchAfter(details, []);
        return;
      }

      MatchCache.setMetadataPending(code, scoped);
      renderMetadataPending(details);
      let sources = scoped;
      try {
        sources = await withMatchTimeout(
          enrichMetadata(scoped, details),
          "115 手动强制匹配元数据补全超时",
        );
      } catch (err) {
        // The video hit is authoritative; metadata timeout must not leave the
        // card in a permanent pending state.
        Util.print(err?.message);
      }
      if (target.dataset.uid !== requestId) return;
      MatchCache.set(code, sources);
      matchAfter(details, sources);
    } catch (err) {
      if (target.dataset.uid !== requestId) return;
      if (fallback?.data) matchAfter(details, fallback.data);
      else renderUnknown(details);
      Util.print(err?.message);
    } finally {
      if (target.dataset.uid === requestId) {
        delete target.dataset.uid;
        delete target.dataset.manualMatchPending;
        delete movie.dataset.matchPending;
      }
    }
  };

  const refresh = ({ type, target }) => {
    if (type === "contextmenu") return queueManualMatch(target);
    if (type !== "click") return;
    setTimeout(() => queueManualMatch(target), 750);
  };

  const forceMatch = (event) => {
    const button = event.target.closest(`.${FORCE_MATCH_CLASS}`);
    if (!button || button.disabled) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const target = button.parentElement?.querySelector(`.${TARGET_CLASS}`);
    if (!target) return;

    const movie = target.closest(MOVIE_SELECTOR);
    const code = movie?.querySelector(CODE_SELECTOR)?.textContent.trim();
    if (!movie || !code) return;

    button.disabled = true;
    button.classList.add("is-loading");
    queueManualMatch(target, { clearCache: true });
  };

  unsafeWindow[MATCH_API] = queueManualMatch;
  document.addEventListener("click", forceMatch, true);
  listenClick(queueManualMatch, refresh);
})();

observeAutoMatchToggle();
