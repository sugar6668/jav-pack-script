// ==UserScript==
// @name            JavDB.match115
// @namespace       JavDB.match115@blc
// @version         0.0.15
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

const MatchCache = (() => {
  const PREFIX = "jdb_match_state_v2_";
  const LEGACY_PREFIX = "jdb_match_v1_";
  const MIGRATION_KEY = "jdb_match_state_v2_migrated";
  const mem = new Map();

  const normalize = (key) => String(key || "").trim().toUpperCase();
  const fullKey = (key) => PREFIX + normalize(key);
  const valid = (value) => value
    && (value.status === "matched" || value.status === "unmatched")
    && Array.isArray(value.data)
    && typeof value.revision === "number";

  const makeRecord = (data, previous = null, updatedAt = Date.now()) => ({
    status: data.length ? "matched" : "unmatched",
    data,
    revision: (previous?.revision || 0) + 1,
    updatedAt,
  });

  const migrate = () => {
    if (GM_getValue(MIGRATION_KEY)) return;

    GM_listValues().forEach((key) => {
      if (!key.startsWith(LEGACY_PREFIX)) return;

      const legacy = GM_getValue(key);
      if (!legacy || !Array.isArray(legacy.data)) return;

      const cacheKey = normalize(key.slice(LEGACY_PREFIX.length));
      if (!cacheKey || valid(GM_getValue(fullKey(cacheKey)))) return;

      GM_setValue(fullKey(cacheKey), makeRecord(legacy.data, null, legacy.ts || Date.now()));
    });

    GM_setValue(MIGRATION_KEY, true);
  };

  const del = (key) => {
    const cacheKey = normalize(key);
    if (!cacheKey) return;
    mem.delete(cacheKey);
    GM_deleteValue(fullKey(cacheKey));
  };

  const get = (key) => {
    const cacheKey = normalize(key);
    if (!cacheKey) return null;

    let value = mem.get(cacheKey);
    if (!value) {
      value = GM_getValue(fullKey(cacheKey));
      if (valid(value)) mem.set(cacheKey, value);
    }

    if (!valid(value)) return null;
    return value.data;
  };

  const set = (key, data) => {
    const cacheKey = normalize(key);
    if (!cacheKey || !Array.isArray(data)) return;
    const value = makeRecord(data, mem.get(cacheKey) || GM_getValue(fullKey(cacheKey)));
    mem.set(cacheKey, value);
    GM_setValue(fullKey(cacheKey), value);
  };

  migrate();
  return { get, set, del };
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
  const keys = ["pc", "cid", "fid", "n", "s", "t", "ico", "paths", "realPath", "name", "file_name"];
  return data.map((item) => {
    const source = JSON.parse(JSON.stringify(item, keys));
    return { ...source, bytes: Number(item[format]) || 0, [format]: formatBytes(item[format]) };
  });
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
      const { data = [] } = await Req115.filesSearchAllVideos(codes.join(" "));
      if (load.dataset.uid !== UUID) return;

      const sources = await enrichMetadata(extractData(data.filter((it) => regex.test(it.n))), { code, codes, regex });
      cont.innerHTML = renderMatches(sources);
      MatchCache.set(code, sources);
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
  const matcher = (force = false) => {
    const cache = force ? null : MatchCache.get(code);
    if (cache !== null) {
      block.cont.innerHTML = renderMatches(cache);
      block.load.textContent = "115";
      return;
    }

    return matchCode(codeDetails, block);
  };

  matcher();
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
    syncCache: (data) => syncQuickViewState("delete", data),
    invalidateCache: () => MatchCache.del(code),
    refresh: () => matcher(true),
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
  const TARGET_HTML = `<a href="${VOID}" class="tag is-normal ${TARGET_CLASS}">${TARGET_TXT}</a><button type="button" class="tag is-light ${FORCE_MATCH_CLASS} is-hidden" title="强制重新匹配 115" aria-label="强制重新匹配 115">↻</button>`;
  const SUBTITLE_ICON_HTML = `<span class="tag x-match-subtitle" title="网盘目录内已有字幕" aria-label="网盘目录内已有字幕"><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M2 12C2 8.22876 2 6.34315 3.17157 5.17157C4.34315 4 6.22876 4 10 4H14C17.7712 4 19.6569 4 20.8284 5.17157C22 6.34315 22 8.22876 22 12C22 15.7712 22 17.6569 20.8284 18.8284C19.6569 20 17.7712 20 14 20H10C6.22876 20 4.34315 20 3.17157 18.8284C2 17.6569 2 15.7712 2 12ZM6 15.25C5.58579 15.25 5.25 15.5858 5.25 16C5.25 16.4142 5.58579 16.75 6 16.75H10C10.4142 16.75 10.75 16.4142 10.75 16C10.75 15.5858 10.4142 15.25 10 15.25H6ZM7.75 13C7.75 12.5858 7.41421 12.25 7 12.25H6C5.58579 12.25 5.25 12.5858 5.25 13C5.25 13.4142 5.58579 13.75 6 13.75H7C7.41421 13.75 7.75 13.4142 7.75 13ZM11.5 12.25C11.9142 12.25 12.25 12.5858 12.25 13C12.25 13.4142 11.9142 13.75 11.5 13.75H9.5C9.08579 13.75 8.75 13.4142 8.75 13C8.75 12.5858 9.08579 12.25 9.5 12.25H11.5ZM18.75 13C18.75 12.5858 18.4142 12.25 18 12.25H14C13.5858 12.25 13.25 12.5858 13.25 13C13.25 13.4142 13.5858 13.75 14 13.75H18C18.4142 13.75 18.75 13.4142 18.75 13ZM12.5 15.25C12.0858 15.25 11.75 15.5858 11.75 16C11.75 16.4142 12.0858 16.75 12.5 16.75H14C14.4142 16.75 14.75 16.4142 14.75 16C14.75 15.5858 14.4142 15.25 14 15.25H12.5ZM15.75 16C15.75 15.5858 16.0858 15.25 16.5 15.25H18C18.4142 15.25 18.75 15.5858 18.75 16C18.75 16.4142 18.4142 16.75 18 16.75H16.5C16.0858 16.75 15.75 16.4142 15.75 16Z" fill="currentColor"></path></svg></span>`;
  const MATCH_TYPE_COLORS = {
    normal: "var(--x-success)",
    crack: "var(--x-info)",
    subtitle: "var(--x-warning)",
    both: "var(--x-danger)",
  };

  const movieList = document.querySelectorAll(MOVIE_SELECTOR);
  if (!movieList.length) return;

  const parseCodeCls = (code) => ["x", ...code.split(/[\s.\-_]/)].filter(Boolean).join("-");
  const getMatchType = ({ n }) => {
    const crack = Magnet.crackReg.test(n);
    const subtitle = Magnet.zhReg.test(n);
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

  const matchAfter = ({ code, regex, target }, data) => {
    const itemNode = target.closest(MOVIE_SELECTOR);
    delete itemNode.dataset.matchPending;
    itemNode.dataset.matchResolved = "1";
    itemNode.classList.add(parseCodeCls(code));
    const sources = data.filter((it) => regex.test(it.n));
    const len = sources.length;
    syncSubtitleIcon(itemNode, sources);

    let pc = "";
    let cid = "";
    let title = "鼠标左键缓存刷新，右键接口刷新";
    let className = "is-normal";
    let textContent = "未匹配";

    if (len) {
      const zhs = sources.filter((it) => Magnet.zhReg.test(it.n));
      const crack = sources.find((it) => Magnet.crackReg.test(it.n));

      const zh = zhs[0];
      const both = zhs.find((it) => Magnet.crackReg.test(it.n));
      const active = both ?? zh ?? crack ?? sources[0];
      const types = getMatchTypes(sources);
      const isVR = Boolean(target.dataset.isVr === "1");
      const presentation = getPresentationItems(sources, { isVR });

      pc = active.pc;
      cid = active.cid;
      title = presentation.map(formatTip).join("\n\n");
      className = both ? "is-danger" : zh ? "is-warning" : crack ? "is-info" : "is-success";
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

  const matchBefore = (node) => {
    if (node.classList.contains("is-hidden")) return;

    const target = node.querySelector(CODE_SELECTORS[0]);
    if (!target) return;

    const code = target.querySelector(CODE_SELECTORS[1])?.textContent.trim();
    if (!code) return;

    if (!target.querySelector(`.${TARGET_CLASS}`)) target.insertAdjacentHTML("afterbegin", TARGET_HTML);

    const parsed = Util.codeParse(code);
    target.dataset.isVr = isVrTitle(target.textContent) ? "1" : "";
    return { ...parsed, searchKey: parsed.codes.join(" "), target };
  };

  const useMatchQueue = (before, after) => {
    const wait = {};
    const queue = [];
    let loading = false;

    const over = async (key, data = [], shouldCache = false) => {
      await Promise.all(wait[key].map(async (it) => {
        const scoped = data.filter((file) => it.regex.test(file.n));
        const enriched = await enrichMetadata(scoped, it);
        if (shouldCache) MatchCache.set(it.code, enriched);
        after?.(it, enriched);
      }));
      delete wait[key];
    };

    const match = async () => {
      if (loading || !queue.length) return;
      const searchKey = queue[0];
      loading = true;

      try {
        const { data = [] } = await Req115.filesSearchAllVideos(searchKey);
        const pendingItems = wait[searchKey] || [];
        const matchedData = data.filter((item) => pendingItems.some(({ regex }) => regex.test(item.n)));
        const sources = extractData(matchedData);
        await over(searchKey, sources, true);
      } catch (err) {
        await over(searchKey);
        Util.print(err?.message);
      }

      loading = false;
      queue.shift();
      match();
    };

    const dispatch = (node, force = false) => {
      if (force) {
        delete node.dataset.matchPending;
        delete node.dataset.matchResolved;
      }
      if (node.dataset.matchPending === "1" || node.dataset.matchResolved === "1") return;
      const details = before?.(node);
      if (!details) return;

      node.dataset.matchPending = "1";

      const { code, prefix, searchKey } = details;
      const cache = MatchCache.get(code) ?? MatchCache.get(prefix);
      if (cache !== null) {
        return enrichMetadata(cache, details)
          .then((sources) => {
            MatchCache.set(code, sources);
            after?.(details, sources);
          })
          .catch(() => after?.(details, cache));
      }

      if (!wait[searchKey]) wait[searchKey] = [];
      wait[searchKey].push(details);

      if (queue.includes(searchKey)) return;
      queue.push(searchKey);
      match();
    };

    const callback = (entries, obs) => {
      entries.forEach(({ isIntersecting, target }) => {
        if (isIntersecting) obs.unobserve(target) || requestAnimationFrame(() => dispatch(target));
      });
    };

    const obs = new IntersectionObserver(callback, { threshold: 0.25 });
    return (nodeList, { force = false } = {}) => nodeList.forEach((node) => {
      // A forced refresh commonly comes from Quick View closing.  The card is
      // already in the viewport and has been unobserved, so it must bypass
      // IntersectionObserver and enter the queue directly.
      if (force) return requestAnimationFrame(() => dispatch(node, true));
      // Matched-only actor mode hides unmatched cards, so they never intersect.
      // Queue them immediately to resolve their match state before CSS decides visibility.
      if (document.documentElement.classList.contains("x-actor-matched-only")) {
        requestAnimationFrame(() => dispatch(node, force));
      } else {
        obs.observe(node);
      }
    });
  };

  const matchQueue = useMatchQueue(matchBefore, matchAfter);
  const handledSyncs = new Set();
  matchQueue(movieList);

  window.addEventListener("JavDB.scroll", ({ detail }) => matchQueue(detail));
  // Rankings and other in-page modules can create cards before this userscript
  // has attached its custom-event listener.  Observe additions as a durable
  // fallback so every normal `.movie-list .item` gets the same match UI.
  const matchDynamicCards = (nodes) => {
    const cards = [];
    nodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.matches?.(MOVIE_SELECTOR)) cards.push(node);
      cards.push(...node.querySelectorAll?.(MOVIE_SELECTOR) || []);
    });
    if (cards.length) matchQueue(cards);
  };
  new MutationObserver((records) => records.forEach((record) => matchDynamicCards(record.addedNodes)))
    .observe(document.body, { childList: true, subtree: true });
  const receiveMatchState = (data) => {
    const payload = typeof data === "string" ? { code: data } : data;
    if (!payload?.code) return;
    if (payload.id && handledSyncs.has(payload.id)) return;
    if (payload.id) {
      handledSyncs.add(payload.id);
      setTimeout(() => handledSyncs.delete(payload.id), 30 * 1000);
    }
    if (payload.type === "sync" && Array.isArray(payload.data)) {
      MatchCache.set(payload.code, payload.data);
      // Let QuickView distinguish a delete-cache sync from normal operations
      // such as subtitle upload, which still need a close-triggered re-match.
      window.dispatchEvent(new CustomEvent("JavDB_MatchCacheSynced", { detail: { code: payload.code } }));
    }
    matchQueue(document.querySelectorAll(`.${parseCodeCls(payload.code)}`), { force: true });
  };
  CHANNEL.onmessage = ({ data }) => receiveMatchState(data);
  window.addEventListener("message", ({ data, origin }) => {
    if (origin === location.origin && data?.source === "JavDB.match115") receiveMatchState(data);
  });

  const publish = (code) => {
    // A manual refresh deliberately replaces an already resolved result.
    matchQueue(document.querySelectorAll(`.${parseCodeCls(code)}`), { force: true });
    CHANNEL.postMessage(code);
  };

  const matchCode = async (node) => {
    const movie = node.closest(MOVIE_SELECTOR);
    if (!movie) return;

    const code = movie.querySelector(CODE_SELECTOR)?.textContent.trim();
    const target = movie.querySelector(`.${TARGET_CLASS}`);
    if (!code || !target) return;

    const details = {
      ...Util.codeParse(code),
      isVR: isVrTitle(movie.querySelector(".video-title")?.textContent),
    };
    const { codes, regex } = details;
    const UUID = crypto.randomUUID();
    target.dataset.uid = UUID;

    try {
      const { data = [] } = await Req115.filesSearchAllVideos(codes.join(" "));
      if (target.dataset.uid !== UUID) return;

      const sources = await enrichMetadata(extractData(data.filter((it) => regex.test(it.n))), details);
      MatchCache.set(code, sources);
    } catch (err) {
      if (target.dataset.uid !== UUID) return;
      Util.print(err?.message);
    }

    publish(code);
  };

  const refresh = ({ type, target }) => {
    if (target.textContent === TARGET_TXT) return;
    target.textContent = TARGET_TXT;
    target.title = "";

    if (type === "contextmenu") return matchCode(target);
    if (type !== "click") return;
    const code = target.closest(MOVIE_SELECTOR)?.querySelector(CODE_SELECTOR)?.textContent.trim();
    if (code) setTimeout(publish, 750, code);
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
    // Delete only this card's stored state, then return to the normal match queue.
    MatchCache.del(code);
    target.className = `tag is-normal ${TARGET_CLASS}`;
    target.dataset.pc = "";
    target.dataset.cid = "";
    target.textContent = TARGET_TXT;
    target.title = "";
    matchQueue([movie], { force: true });
  };

  unsafeWindow[MATCH_API] = matchCode;
  document.addEventListener("click", forceMatch, true);
  listenClick(matchCode, refresh);
})();
