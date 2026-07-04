// ==UserScript==
// @name            JavDB.match115
// @namespace       JavDB.match115@blc
// @version         0.0.2
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
  const PREFIX = "jdb_match_v1_";
  const TTL_HIT = 30 * 24 * 60 * 60 * 1000;
  const TTL_EMPTY = 30 * 60 * 1000;
  const mem = new Map();

  const normalize = (key) => String(key || "").trim().toUpperCase();
  const fullKey = (key) => PREFIX + normalize(key);
  const ttl = (data) => (data.length ? TTL_HIT : TTL_EMPTY);
  const valid = (value) => value && typeof value.ts === "number" && Array.isArray(value.data);
  const expired = ({ ts, data }) => Date.now() - ts > ttl(data);

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
    if (expired(value)) {
      del(cacheKey);
      return null;
    }

    return value.data;
  };

  const set = (key, data) => {
    const cacheKey = normalize(key);
    if (!cacheKey || !Array.isArray(data)) return;
    const value = { ts: Date.now(), data };
    mem.set(cacheKey, value);
    GM_setValue(fullKey(cacheKey), value);
  };

  const sweep = () => {
    setTimeout(() => {
      GM_listValues().forEach((key) => {
        if (!key.startsWith(PREFIX)) return;
        const value = GM_getValue(key);
        if (!valid(value) || expired(value)) GM_deleteValue(key);
      });
    }, 10 * 1000);
  };

  sweep();
  return { get, set, del, sweep };
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
    return { ...source, [format]: formatBytes(item[format]) };
  });
};

const formatDirectory = (item) => {
  if (window.JavPackMatch115Console) return window.JavPackMatch115Console.formatDirectory(item);
  return item.t || item.pc || "";
};

const formatTip = (item) => `${item.n} - ${item.s} / ${formatDirectory(item)}`;

const enrichMetadata = async (sources) => {
  if (!window.JavPackMatch115Console?.enrichMetadata) return sources;
  return window.JavPackMatch115Console.enrichMetadata(sources, Req115);
};

const getPageDetails = (dom = document) => {
  const infoNode = dom.querySelector(".movie-panel-info");
  const code = infoNode?.querySelector(".first-block .value")?.textContent.trim();
  if (!code) return;

  const titleNode = dom.querySelector(".title.is-4");
  const label = titleNode?.querySelector("strong")?.textContent.trim() || "";
  const currentTitle = titleNode?.querySelector(".origin-title, .current-title")?.textContent.trim() || "";
  const title = `${label}${currentTitle}`.replace(code, "").trim();

  return {
    ...Util.codeParse(code),
    title,
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

  const matchCode = async ({ code, codes, regex }, { load, cont }) => {
    const UUID = crypto.randomUUID();
    load.dataset.uid = UUID;

    try {
      const { data = [] } = await Req115.filesSearchAllVideos(codes.join(" "));
      if (load.dataset.uid !== UUID) return;

      const sources = await enrichMetadata(extractData(data.filter((it) => regex.test(it.n))));
      cont.innerHTML = sources.map((item) => render(item, codeDetails)).join("") || "暂无匹配";
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
  const matcher = (force = false) => {
    const cache = force ? null : MatchCache.get(code);
    if (cache !== null) {
      block.cont.innerHTML = cache.map((item) => render(item, codeDetails)).join("") || "暂无匹配";
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
      const next = cache.filter((file) => {
        if (action === "delv") return String(file.fid) !== String(item.fid);
        if (action === "delf") return String(file.cid) !== String(item.cid);
        return true;
      });
      if (next.length > 0) MatchCache.set(code, next);
      else MatchCache.del(code);
    },
    refresh: () => matcher(true),
  });
  window.addEventListener("beforeunload", () => CHANNEL.postMessage(code));
})();

(function () {
  const MOVIE_SELECTOR = ".movie-list .item";
  const CODE_SELECTORS = [".video-title", "strong"];
  const CODE_SELECTOR = CODE_SELECTORS.join(" ");
  const TARGET_HTML = `<a href="${VOID}" class="tag is-normal ${TARGET_CLASS}">${TARGET_TXT}</a>`;
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
    itemNode.classList.add(parseCodeCls(code));
    const sources = data.filter((it) => regex.test(it.n));
    const len = sources.length;

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

      pc = active.pc;
      cid = active.cid;
      title = sources.map(formatTip).join("\n\n");
      className = both ? "is-danger" : zh ? "is-warning" : crack ? "is-info" : "is-success";
      textContent = "已匹配";
      if (len > 1) textContent += ` ${len}`;

      itemNode.classList.toggle("x-multi-matched", types.length > 1);
      itemNode.dataset.matchTypes = types.join(" ");
      itemNode.style.setProperty("--multi-match-bg", getMatchGradient(types));
    } else {
      itemNode.classList.remove("x-multi-matched");
      delete itemNode.dataset.matchTypes;
      itemNode.style.removeProperty("--multi-match-bg");
    }

    const node = target.querySelector(`.${TARGET_CLASS}`);
    node.title = title;
    node.className = `tag ${className} ${TARGET_CLASS}`;
    node.dataset.pc = pc;
    node.dataset.cid = cid;
    node.textContent = textContent;
  };

  const matchBefore = (node) => {
    if (node.classList.contains("is-hidden")) return;

    const target = node.querySelector(CODE_SELECTORS[0]);
    if (!target) return;

    const code = target.querySelector(CODE_SELECTORS[1])?.textContent.trim();
    if (!code) return;

    if (!target.querySelector(`.${TARGET_CLASS}`)) target.insertAdjacentHTML("afterbegin", TARGET_HTML);

    const parsed = Util.codeParse(code);
    return { ...parsed, searchKey: parsed.codes.join(" "), target };
  };

  const useMatchQueue = (before, after) => {
    const wait = {};
    const queue = [];
    let loading = false;

    const over = (key, data = [], shouldCache = false) => {
      wait[key].forEach((it) => {
        const scoped = data.filter((file) => it.regex.test(file.n));
        if (shouldCache) MatchCache.set(it.code, scoped);
        after?.(it, scoped);
      });
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
        const sources = await enrichMetadata(extractData(matchedData));
        over(searchKey, sources, true);
      } catch (err) {
        over(searchKey);
        Util.print(err?.message);
      }

      loading = false;
      queue.shift();
      match();
    };

    const dispatch = (node) => {
      const details = before?.(node);
      if (!details) return;

      const { code, prefix, searchKey } = details;
      const cache = MatchCache.get(code) ?? MatchCache.get(prefix);
      if (cache !== null) return after?.(details, cache);

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
    return (nodeList) => nodeList.forEach((node) => obs.observe(node));
  };

  const matchQueue = useMatchQueue(matchBefore, matchAfter);
  matchQueue(movieList);

  window.addEventListener("JavDB.scroll", ({ detail }) => matchQueue(detail));
  CHANNEL.onmessage = ({ data }) => matchQueue(document.querySelectorAll(`.${parseCodeCls(data)}`));

  const publish = (code) => {
    matchQueue(document.querySelectorAll(`.${parseCodeCls(code)}`));
    CHANNEL.postMessage(code);
  };

  const matchCode = async (node) => {
    const movie = node.closest(MOVIE_SELECTOR);
    if (!movie) return;

    const code = movie.querySelector(CODE_SELECTOR)?.textContent.trim();
    const target = movie.querySelector(`.${TARGET_CLASS}`);
    if (!code || !target) return;

    const { codes, regex } = Util.codeParse(code);
    const UUID = crypto.randomUUID();
    target.dataset.uid = UUID;

    try {
      const { data = [] } = await Req115.filesSearchAllVideos(codes.join(" "));
      if (target.dataset.uid !== UUID) return;

      const sources = await enrichMetadata(extractData(data.filter((it) => regex.test(it.n))));
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

  unsafeWindow[MATCH_API] = matchCode;
  listenClick(matchCode, refresh);
})();
