// ==UserScript==
// @name            JavDB.offline115
// @namespace       JavDB.offline115@blc
// @version         0.0.14
// @author          blc
// @description     115 网盘离线
// @match           https://javdb.com/*
// @match           https://captchaapi.115.com/*
// @icon            https://javdb.com/favicon.ico
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Grant.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Magnet.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Offline.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Req.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Req115.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Subtitle.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Util.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Verify115.lib.js
// @resource        pend https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/assets/pend.png
// @resource        warn https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/assets/warn.png
// @resource        error https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/assets/error.png
// @resource        success https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/assets/success.png
// @connect         jdbstatic.com
// @connect         aliyuncs.com
// @connect         javdb.com
// @connect         115.com
// @connect         api-shoulei-ssl.xunlei.com
// @connect         *
// @run-at          document-end
// @grant           GM_removeValueChangeListener
// @grant           GM_addValueChangeListener
// @grant           GM_getResourceURL
// @grant           GM_xmlhttpRequest
// @grant           GM_notification
// @grant           GM_addElement
// @grant           unsafeWindow
// @grant           GM_openInTab
// @grant           window.close
// @grant           GM_getValue
// @grant           GM_setValue
// @grant           GM_info
// @require         https://github.com/Tampermonkey/utils/raw/d8a4543a5f828dfa8eefb0a3360859b6fe9c3c34/requires/gh_2215_make_GM_xhr_more_parallel_again.js
// ==/UserScript==

const defaultConfig = [
  {
    name: "云下载",
    color: "is-primary",
    inMagnets: true,
  },
  {
    name: "番号",
    dir: `番号/\${prefix}`,
    color: "is-link",
    inMagnets: true,
  },
  {
    name: "片商",
    dir: `片商/\${maker}`,
    inMagnets: true,
  },
  {
    name: "系列",
    dir: `系列/\${series}`,
    color: "is-success",
    inMagnets: true,
  },
  {
    name: "清单",
    dir: `清单/\${list}`,
    color: "is-danger is-light",
  },
  {
    type: "genres",
    name: `\${genre}`,
    dir: `类别/\${genre}`,
    match: ["屁股", "連褲襪", "巨乳", "亂倫"],
    color: "is-warning",
  },
  {
    type: "actors",
    name: `\${actor}`,
    dir: `演员/\${actor}`,
    exclude: ["♂"],
    color: "is-danger",
    inMagnets: true,
  },
];

const CUSTOM_CONFIG = "CUSTOM_CONFIG";

const getConfig = async () => {
  const customConfig = GM_getValue(CUSTOM_CONFIG);
  if (!customConfig) return defaultConfig;

  const blob = new Blob([customConfig], { type: "application/javascript" });
  const moduleUrl = URL.createObjectURL(blob);

  try {
    const { default: func } = await import(moduleUrl);
    return func(defaultConfig);
  } catch {
    return defaultConfig;
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
};

const setConfig = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    if (file.type !== "text/javascript") throw new Error("不支持文件类型");
    if (file.size > 3145728) throw new Error("文件大小限制 3 MB");

    const customConfig = await new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onerror = () => reject(new Error("文件读取失败"));
      fileReader.onload = (e) => resolve(e.target.result);
      fileReader.readAsText(file);
    });

    GM_setValue(CUSTOM_CONFIG, customConfig);
    Grant.notify({ icon: "success", msg: "导入成功，页面刷新后生效", onclick: () => location.reload() });
  } catch (err) {
    Grant.notify({ icon: "warn", msg: err?.message });
  }
};

const TARGET_CLASS = "x-offline";
const CRACK_REG = Magnet.crackReg;
const LEAK_REG = Magnet.leakReg;
const LOAD_CLASS = "is-loading";
const offlineButtonUI = new WeakMap();

const beginOfflineButtonUI = (target, scope) => {
  if (!target) return;
  let ui = offlineButtonUI.get(target);
  if (!ui) {
    const buttonScope = scope || target.parentElement || target;
    const buttons = [...buttonScope.querySelectorAll(`.${TARGET_CLASS}`)];
    if (!buttons.includes(target)) buttons.push(target);
    ui = {
      buttons: buttons.map((button) => ({
        button,
        wasDisabled: button.hasAttribute("disabled"),
      })),
      label: target.textContent,
    };
    offlineButtonUI.set(target, ui);
    ui.buttons.forEach(({ button }) => button.setAttribute("disabled", ""));
  }
  target.classList.remove(LOAD_CLASS);
  target.dataset.offlineState = "preparing";
  target.setAttribute("aria-busy", "true");
  target.textContent = "读取资源中";
};

const setOfflineButtonState = (target, { state, queued = 0 } = {}) => {
  if (!target || !offlineButtonUI.has(target)) return;
  const text = {
    queued: `排队中${queued ? ` (${queued})` : ""}`,
    running: "离线中",
    waiting: "等待下载完成",
    archiving: "整理归档中",
    paused: "115 操作已暂停",
    verifying: "等待 115 验证",
  }[state];
  if (!text) return;
  target.classList.remove(LOAD_CLASS);
  target.dataset.offlineState = state;
  target.textContent = text;
};

const finishOfflineButtonUI = (target) => {
  const ui = offlineButtonUI.get(target);
  if (!ui) return;
  ui.buttons.forEach(({ button, wasDisabled }) => {
    if (wasDisabled) button.setAttribute("disabled", "");
    else button.removeAttribute("disabled");
  });
  target.classList.remove(LOAD_CLASS);
  target.removeAttribute("aria-busy");
  target.textContent = ui.label;
  delete target.dataset.offlineState;
  offlineButtonUI.delete(target);
};

const getCoverError = (res = {}) => String(res?.coverError || res?.match?.coverError || "").trim();
const getOfflineNotification = (res) => {
  const coverError = getCoverError(res);
  if (res?.status !== "success" || !coverError) return res;
  const msg = String(res.msg || "");
  return {
    ...res,
    status: "warn",
    icon: "warn",
    msg: msg.includes("封面未上传") ? msg : `${msg || "离线任务成功"}；封面未上传：${coverError}`,
  };
};

const MATCH_API = "reMatch";
const MATCH_DELAY = 750;
const syncOfflineMatch = (details, res) => {
  const match = res?.status === "success" ? res.match : null;
  if (!match) return false;
  const payload = {
    source: "JavDB.match115",
    type: "offline",
    id: crypto.randomUUID(),
    operation: res.operation || "offline",
    code: details.code,
    data: match.files,
    cid: match.cid,
    realPath: match.realPath,
    hasCover: match.hasCover,
    coverError: getCoverError(res),
    subtitleFiles: match.subtitleFiles,
  };
  // Refresh the detail frame from the just-produced cache; no 115 re-match.
  const sync = payload.operation === "offline-pending"
    ? unsafeWindow.JavDBMatchSyncOfflinePending
    : unsafeWindow.JavDBMatchSyncOffline;
  const localSources = sync?.(payload);
  let rendered = false;
  if (localSources) {
    if (document.querySelector(".movie-panel-info")) {
      if (typeof unsafeWindow.JavDBMatchRefreshDetail === "function") {
        // The detail matcher reads the just-written cache. Do not pass the
        // snapshot object here: its legacy first argument is the `force`
        // flag, so an object would accidentally issue another 115 search.
        unsafeWindow.JavDBMatchRefreshDetail();
        rendered = true;
      }
    } else if (typeof unsafeWindow.JavDBMatchApplySnapshot === "function") {
      unsafeWindow.JavDBMatchApplySnapshot(payload);
      rendered = true;
    }
  }

  // `GM_info.script.name` differs between offline115 and match115.  Use the
  // match script's fixed channel name, then retain postMessage as a fallback.
  const channel = new BroadcastChannel("JavDB.match115");
  channel.postMessage(payload);
  channel.close();
  if (window.parent !== window) window.parent.postMessage(payload, location.origin);
  return rendered || window.parent !== window;
};
const WIKI_BASE_URL = "https://ja.wikipedia.org/wiki/";
const ACTRESS_INFO_NOT_FOUND = "未找到演员信息";

const { HOST, STATUS_KEY, STATUS_VAL } = Verify115;
const { PENDING, VERIFIED, FAILED } = STATUS_VAL;

const transToByte = Magnet.useTransByte();

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const normalizeText = (value = "") => String(value).replace(/\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();

const decodeMagnetUrl = (value = "") => {
  try { return decodeURIComponent(value); } catch (_) { return value; }
};

const getActorPanel = (dom = document) => {
  return [...dom.querySelectorAll(".movie-panel-info > .panel-block")].find((item) => item.querySelector("strong")?.textContent.trim() === "演員:");
};

const getActorItems = (dom = document) => {
  const panel = getActorPanel(dom);
  const valueNode = panel?.querySelector(".value");
  if (!valueNode) return [];

  const actorLinks = [...valueNode.querySelectorAll('a[href*="/actors/"]')];
  return actorLinks.map((node, index) => {
    const nextNode = actorLinks[index + 1];
    const nodes = [node];
    let cursor = node.nextSibling;

    while (cursor && cursor !== nextNode) {
      nodes.push(cursor);
      cursor = cursor.nextSibling;
    }

    const text = nodes.map((item) => item.textContent || "").join("");
    const name = node.textContent.trim();

    const isFemale = node.classList.contains("actor-female") || /♀/.test(text);
    const isMale = !isFemale && (node.classList.contains("actor-male") || /♂/.test(text));
    return { node, index, name, isFemale, isMale };
  }).filter((item) => item.name);
};

const getWikiProfileValue = (dom, labels) => {
  const rows = [...dom.querySelectorAll("table tr")];
  const row = rows.find((item) => {
    const label = normalizeText(item.querySelector("th")?.textContent);
    return labels.some((name) => label.includes(name));
  });
  return normalizeText(row?.querySelector("td")?.textContent);
};

const fetchActressInfo = async ({ name }) => {
  const url = `${WIKI_BASE_URL}${encodeURIComponent(name)}`;

  try {
    const dom = await Req.request({ url, responseType: "document" });
    const text = normalizeText(dom.body?.textContent);

    const birthday = getWikiProfileValue(dom, ["生年月日"]);
    const age = getWikiProfileValue(dom, ["現年齢"]);
    const height = getWikiProfileValue(dom, ["身長"]);
    const sizes = getWikiProfileValue(dom, ["スリーサイズ"]);
    const cup = getWikiProfileValue(dom, ["ブラサイズ"]);
    const heightText = height.match(/\d+(?:\.\d+)?\s*cm/i)?.[0] || "";
    const sizesText = sizes.replace(/\s*cm\b/i, "").trim();

    return { name, url, birthday, age, height: heightText, sizes: sizesText, cup };
  } catch {
    return { name, url, notFound: true };
  }
};

const renderActressInfo = (info) => {
  const tags = [
    [info.birthday, info.age].filter(Boolean).join(" "),
    info.height,
    [info.sizes, info.cup].filter(Boolean).join(" "),
  ].filter(Boolean);

  return `
    <a href="${escapeHtml(info.url)}" target="_blank" rel="noopener noreferrer">
      <span class="tag is-link is-light">${escapeHtml(info.name)}</span>
      ${tags.map((tag) => `<span class="tag is-light">${escapeHtml(tag)}</span>`).join("")}
    </a>
  `;
};

const renderActressInfoPanel = (infoNode, actorInfos) => {
  infoNode.querySelector(".actress-info")?.remove();
  const found = actorInfos.filter((item) => !item.notFound);
  const content = found.length ? found.map(renderActressInfo).join("") : ACTRESS_INFO_NOT_FOUND;
  const actorPanel = getActorPanel();
  const html = `<div class="panel-block actress-info"><strong>演员信息: </strong><div class="value">${content}</div></div>`;

  if (actorPanel) actorPanel.insertAdjacentHTML("afterend", html);
  else infoNode.insertAdjacentHTML("beforeend", html);
};

const sortActorsByGender = (actorItems) => {
  const sorted = actorItems.toSorted((a, b) => Number(b.isFemale) - Number(a.isFemale) || a.index - b.index);
  const parent = actorItems[0]?.node.parentElement;
  if (!parent) return;

  const fragment = parent.ownerDocument.createDocumentFragment();
  sorted.forEach((item, index) => {
    if (index) fragment.append(", ");
    fragment.append(item.node);
    const symbol = item.isFemale ? "♀" : item.isMale ? "♂" : "";
    if (symbol) fragment.append(` ${symbol}`);
  });
  parent.replaceChildren(fragment);
};

const ensureActressInfo = async (dom = document) => {
  const infoNode = dom.querySelector(".movie-panel-info");
  const actorItems = getActorItems(dom);
  if (!infoNode || !actorItems.length) return;

  const actressItems = actorItems.filter((item) => item.isFemale);
  sortActorsByGender(actorItems);

  const actorInfos = await Promise.all(actressItems.map(fetchActressInfo));
  renderActressInfoPanel(infoNode, actorInfos);
};

const onShortcut = () => {
  let hovered = null;
  const regex = /^Digit\d$/;

  const onMouseover = (e) => {
    hovered = e.target;
  };

  const onKeydown = (e) => {
    if (!e.altKey || !regex.test(e.code)) return;

    const digit = Number(e.code[5]);
    const shortcut = digit ? digit - 1 : 9;

    const target = hovered?.closest(`.item:has(.${TARGET_CLASS})`) ?? document.querySelector(".movie-panel-info");
    if (target) target.querySelectorAll(`.${TARGET_CLASS}`)?.[shortcut]?.click();
  };

  document.addEventListener("mouseover", onMouseover);
  document.addEventListener("keydown", onKeydown);
};

const getDetails = (dom = document) => {
  const infoNode = dom.querySelector(".movie-panel-info");
  if (!infoNode) return;

  const info = { cover: dom.querySelector(".video-cover")?.src ?? "" };
  const codeNode = infoNode.querySelector(".first-block .value");
  const prefix = codeNode.querySelector("a")?.textContent.trim();
  const code = codeNode.textContent.trim();
  info.codeFirstLetter = code[0].toUpperCase();
  if (prefix) info.prefix = prefix;

  const titleNode = dom.querySelector(".title.is-4");
  const label = titleNode.querySelector("strong").textContent;
  const origin = titleNode.querySelector(".origin-title");
  const current = titleNode.querySelector(".current-title");
  info.title = `${label}${(origin ?? current).textContent}`.replace(code, "").trim();
  info.isVR = /【\s*VR\s*】/i.test(titleNode.textContent || "");
  info.uncensored = /无码|無碼/i.test(titleNode.textContent || "");

  infoNode.querySelectorAll(":scope > .panel-block").forEach((item) => {
    const label = item.querySelector("strong")?.textContent.trim();
    const value = item.querySelector(".value")?.textContent.trim();
    if (!label || !value || value.includes("N/A")) return;

    switch (label) {
      case "日期:":
        info.date = value;
        break;
      case "導演:":
        info.director = value;
        break;
      case "片商:":
        info.maker = value;
        break;
      case "發行:":
        info.publisher = value;
        break;
      case "系列:":
        info.series = value;
        break;
      case "類別:":
        info.genres = value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        break;
      case "演員:":
        // Read individual links; current JavDB uses actor-female instead of gender text.
        // Only confirmed actresses are eligible for actor-based offline destinations.
        info.actors = getActorItems(dom)
          .filter((actor) => actor.isFemale)
          .map((actor) => `${actor.name} ♀`);
        break;
    }
  });

  if (info.date) {
    const [year, month, day] = info.date.split("-");
    info.year = year;
    info.month = month;
    info.day = day;
  }

  return { ...Util.codeParse(code), ...info };
};

const isUncensored = (dom = document) => {
  return /无码|無碼/i.test(dom.querySelector(".title.is-4")?.textContent || "");
};

const renderAction = ({ color, index, idx, desc, name }) => {
  return `
  <button
    class="${TARGET_CLASS} button is-small x-un-hover ${color}"
    data-index="${index}"
    data-idx="${idx}"
    title="${desc}"
  >
    ${name}
  </button>
  `;
};

const findAction = ({ index, idx }, actions) => {
  return actions.find((act) => act.index === Number(index) && act.idx === Number(idx));
};

const parseMagnet = (node) => {
  const name = node.querySelector(".name")?.textContent.trim() ?? "";
  const meta = node.querySelector(".meta")?.textContent.trim() ?? "";
  const href = node.querySelector(".magnet-name a")?.href ?? "";
  const tagText = [...node.querySelectorAll(".tags .tag")].map((tag) => tag.textContent.trim()).join(" ");
  // JavDB can place the signal in a magnet tag, while other sources put it in
  // a display name or the magnet's dn parameter.  Treat all three as inputs.
  const sourceText = [name, href, decodeMagnetUrl(href), tagText].join(" ");
  return {
    url: href.split("&")[0].toLowerCase(),
    crack: CRACK_REG.test(sourceText),
    leaked: LEAK_REG.test(sourceText),
    zh: !!node.querySelector(".tag.is-warning") || Magnet.zhReg.test(name),
    size: transToByte(meta.split(",")[0]),
    meta,
    name,
  };
};

const getMagnets = (dom = document) => {
  return [...dom.querySelectorAll("#magnets-content > .item")].map(parseMagnet).toSorted(Magnet.magnetSort);
};

const checkCrack = (magnets, uncensored) => {
  return magnets.map((item) => ({ ...item, uncensored: Boolean(uncensored) }));
};

// BEGIN SAFE115_ARCHIVE_V1
const create115SafeArchiveFallback = (Base) => class Safe115Archive extends Base {
  static SAFE_ARCHIVE_VERSION = "2026-10-27.1";
  static archiveId(value) { return value == null ? "" : String(value); }
  static archiveFailure(message) { return new Error("安全保护：" + message + "，已停止后续操作；未确认的文件和目录保留"); }
  static archiveAck(response, operation) {
    if (response?.state !== true && response?.state !== 1) throw this.archiveFailure(operation + "未得到成功确认");
    return response;
  }
  static archiveName(file = {}) { return String(file.n ?? file.name ?? file.file_name ?? ""); }
  static archiveText(value) { return String(value || "").normalize("NFKC").replace(/[‐‑‒–—−]/g, "-").toUpperCase(); }
  static archiveCodePattern(code) {
    const text = this.archiveText(code);
    if (!/^[A-Z0-9\s._-]+$/.test(text) || !/\d/.test(text)) return "";
    const sep = "[\\s._-]*";
    const parts = text.match(/[A-Z]+|\d+/g) || [];
    const pattern = /^FC2(?:[\s._-]*PPV)?[\s._-]*\d+$/.test(text)
      ? "FC2" + sep + "(?:PPV" + sep + ")?" + parts.at(-1)
      : parts.join(sep);
    return pattern ? "(?<![A-Z0-9])" + pattern + "(?![A-Z0-9])" : "";
  }
  static archiveMatchesCode(name, code) {
    const pattern = this.archiveCodePattern(code);
    return Boolean(pattern && new RegExp(pattern).test(this.archiveText(name)));
  }
  static archiveHasForeignCode(name, code) {
    let text = this.archiveText(name).replace(/[0-9A-F]{8}-(?:[0-9A-F]{4}-){3}[0-9A-F]{12}/g, "");
    const pattern = this.archiveCodePattern(code);
    if (pattern) text = text.replace(new RegExp(pattern, "g"), " ");
    const tokens = text.match(/(?<![A-Z0-9])(?:FC2[\s._-]*(?:PPV[\s._-]*)?\d{5,10}|\d{0,3}[A-Z]{1,12}\d{0,3}[\s._-]+\d{2,10}[A-Z]{0,3}|[A-Z]{2,12}\d{2,10}[A-Z]{0,3}|\d{6}[-_]\d{2,4})(?![A-Z0-9])/g) || [];
    return tokens.some((token) => !/^(?:CD|DISC|PART|PT|EP|MP)[\s._-]*\d+$/.test(token));
  }
  static archivePart(name) {
    const text = this.archiveText(name);
    const match = text.match(/(?:^|[^A-Z0-9])(?:CD|DISC|PART|PT|EP)[\s._-]*(\d{1,3})(?=$|[^A-Z0-9])/)
      || text.match(/\.(\d{2})(?=(?:\.[^.]+){0,2}\.(?:MP4|MKV|AVI|WMV|SRT|ASS|SSA|VTT|SUB|IDX)$)/);
    return match ? Number(match[1]) : null;
  }
  static archiveSubtitle(file) { return /\.(srt|ass|ssa|vtt|sub|idx)$/i.test(this.archiveName(file)); }
  static archiveAttachmentScore(video, attachment, code) {
    const name = this.archiveName(attachment);
    const videoName = this.archiveName(video);
    if (!/\.(srt|ass|ssa|vtt|sub|idx|nfo)$/i.test(name)
      && !/\.(?:cover|poster|fanart|thumb)\.(?:jpe?g|png|webp)$/i.test(name)) return 0;
    if (![name, videoName].every((value) => this.archiveMatchesCode(value, code) && !this.archiveHasForeignCode(value, code))) return 0;
    if (this.archiveSubtitle(attachment) && this.archivePart(name) !== this.archivePart(videoName)) return 0;
    const stem = this.archiveText(videoName.replace(/\.[^.]+$/, ""));
    const attachmentStem = this.archiveText(name.replace(/\.[^.]+$/, ""));
    return attachmentStem === stem || [".", "-", "_", " "].some((sep) => attachmentStem.startsWith(stem + sep)) ? 2 : 1;
  }
  static archiveAttachments(sourceFiles, videos, code) {
    const selected = new Set(videos.map((file) => this.archiveId(file.fid)));
    const alternatives = sourceFiles.filter((file) => this.archiveVideo(file) && !selected.has(this.archiveId(file.fid)) && !this.archiveJunk(file, videos, code));
    return sourceFiles.filter((file) => {
      if (!file.fid || selected.has(this.archiveId(file.fid))) return false;
      const score = Math.max(0, ...videos.map((video) => this.archiveAttachmentScore(video, file, code)));
      if (!score || alternatives.some((video) => this.archiveAttachmentScore(video, file, code) >= score)) return false;
      // VobSub indexes are useful only with their matching .sub payload.
      return !/\.idx$/i.test(this.archiveName(file)) || sourceFiles.some((other) =>
        this.archiveId(other.cid) === this.archiveId(file.cid)
        && this.archiveText(this.archiveName(other)) === this.archiveText(this.archiveName(file).replace(/\.idx$/i, ".sub")));
    });
  }
  static archiveRenamedFiles(files, videos, rename) {
    const sorted = [...videos].sort((a, b) => this.archiveName(a).localeCompare(this.archiveName(b), undefined, { numeric: true }));
    const bases = new Map(sorted.map((file, index) => [this.archiveId(file.fid), rename
      + (this.archivePart(this.archiveName(file)) != null ? ".CD" + this.archivePart(this.archiveName(file))
        : sorted.length > 1 ? "." + String(index + 1).padStart(2, "0") : "")]));
    const used = new Set();
    return files.map((file) => {
      const name = this.archiveName(file);
      const ext = name.split(".").at(-1).toLowerCase();
      let base = bases.get(this.archiveId(file.fid));
      if (!base) {
        const part = this.archivePart(name);
        base = rename + (part != null ? ".CD" + part : "");
        if (this.archiveSubtitle(file)) {
          const language = name.match(/(?:[.\s_-])((?:zh[-_](?:cn|tw|hans|hant)|chs|cht|chi|zho|eng|en|jpn|ja|简体|繁体|双语)(?:[._-](?:forced|sdh))?)(?=\.[^.]+$)/i);
          if (language) base += "." + language[1].toLowerCase().replaceAll("_", "-");
        } else if (/\.(?:cover|poster|fanart|thumb)\./i.test(name)) {
          base += "." + name.match(/\.(cover|poster|fanart|thumb)\./i)[1].toLowerCase();
        }
      }
      let renamed = base + "." + ext;
      for (let index = 2; used.has(renamed.toLowerCase()); index++) renamed = base + "." + index + "." + ext;
      used.add(renamed.toLowerCase());
      return { ...file, ico: ext, n: renamed };
    });
  }
  static archiveFileStamp(file) {
    return JSON.stringify([this.archiveId(file.fid), this.archiveId(file.cid), this.archiveName(file),
      String(file.s ?? file.size ?? ""), String(file.sha ?? file.sha1 ?? "")]);
  }
  static archiveSharedSource(cid, remember = false) {
    this.sharedArchiveSources ??= new Set();
    try {
      const stored = typeof GM_getValue === "function" ? GM_getValue("JavPack.archive.sharedSources.v1", []) : [];
      if (Array.isArray(stored)) stored.forEach((id) => this.sharedArchiveSources.add(String(id)));
      if (remember) {
        this.sharedArchiveSources.add(String(cid));
        if (typeof GM_setValue === "function") GM_setValue("JavPack.archive.sharedSources.v1", [...this.sharedArchiveSources]);
      }
    } catch (_) { /* Session protection remains effective if userscript storage is unavailable. */ }
    return this.sharedArchiveSources.has(String(cid));
  }
  static archiveJunk(file, videos, code) {
    const name = this.archiveName(file);
    if (this.archiveHasForeignCode(name, code) || this.archiveSubtitle(file) || /\.(nfo|jpe?g|png|webp)$/i.test(name)) return false;
    const advert = /广告|廣告|推广|推廣|宣传|宣傳|最新地址|下载地址|下载说明|下载必看|网址|免責|免责|read[ ._-]*me|advert|promotion|website/i;
    if (this.archiveVideo(file)) {
      const size = Number(file.s ?? file.size);
      const mainSizes = videos.map((video) => Number(video.s ?? video.size)).filter((value) => value > 0);
      return /(?:^|[^a-z])(?:sample|trailer|advert)(?:$|[^a-z])|广告|廣告|预告|預告|试看|試看/i.test(name)
        && size > 0 && mainSizes.length > 0 && size <= Math.min(64 * 1024 * 1024, Math.min(...mainSizes) * 0.05);
    }
    if (this.archiveMatchesCode(name, code)) return false;
    if (/^(?:thumbs\.db|desktop\.ini|\.ds_store)$/i.test(name)) return true;
    if (/\.(url|webloc)$/i.test(name)) return true;
    if (/\.(html?|mhtml?|txt|md|pdf|docx?|rtf)$/i.test(name)) return advert.test(name) || /^(?:index|说明|說明|必看)\./i.test(name);
    return /\.(zip|rar|7z)$/i.test(name) && advert.test(name) && !/(?:part\d+|\.\d{3})\./i.test(name);
  }
  static archiveSourcePlan(scope, tree, videos, files, code, trusted = false) {
    const keepIds = new Set(files.map((file) => this.archiveId(file.fid)));
    const entries = [...tree.files, ...[...tree.folders.values()].map((folder) => folder.path.at(-1))];
    const rootName = this.archiveName(tree.root.path.at(-1));
    const plan = { scope, tree, videos, files, code, trusted, keepIds, type: "unknown", reason: "源目录无法确认为本片专属目录",
      candidates: [], attemptedFiles: new Set(), attemptedFolders: new Set(), removedFiles: new Set(), removedFolders: new Set() };
    if (entries.some((entry) => this.archiveHasForeignCode(this.archiveName(entry), code))) {
      this.archiveSharedSource(scope.cid, true);
      return { ...plan, type: "mixed", reason: "源目录包含其他作品，未清理" };
    }
    if (this.archiveSharedSource(scope.cid)) return { ...plan, type: "mixed", reason: "源目录已标记为混放目录，未清理" };
    if (scope.cid === "0" || scope.ids.length < 2 || /^(?:根目录|网盘|115|演员|番号)$/i.test(rootName)
      || /合集|合辑|混放|作品集|收藏|(?:^|\W)(?:collection|downloads?|actors?|movies)(?:$|\W)/i.test(rootName)) return plan;
    if (!trusted && !this.archiveMatchesCode(rootName, code)) return plan;
    const remaining = tree.files.filter((file) => !keepIds.has(this.archiveId(file.fid)));
    if (remaining.some((file) => !this.archiveJunk(file, videos, code))) return { ...plan, reason: "存在其他版本或归属不明的文件，未清理" };
    if (!trusted && [...tree.folders].some(([cid, folder]) => cid !== scope.cid
      && !this.archiveMatchesCode(this.archiveName(folder.path.at(-1)), code)
      && !/^(?:samples?|trailers?|subs?|subtitles?|字幕|广告|廣告|推广|推廣|说明|說明)$/i.test(this.archiveName(folder.path.at(-1))))) return plan;
    return { ...plan, type: "single", reason: "已确认本片专属目录", candidates: remaining };
  }
  static async archiveReadSource(cid) {
    const root = await this.archiveDirectory(cid);
    const scope = { cid: this.archiveId(cid), ids: root.ids, protectedIds: new Set(root.ids.slice(0, -1)) };
    return { scope, tree: await this.archiveTree(scope) };
  }
  static async archiveVerifyFiles(files, cid) {
    const directory = await this.archiveDirectory(cid);
    for (const expected of files) {
      const actual = directory.data.find((file) => this.archiveId(file.fid) === this.archiveId(expected.fid));
      if (!(Number(expected.s ?? expected.size) > 0) || !actual
        || this.archiveFileStamp({ ...actual, cid: this.archiveId(cid) }) !== this.archiveFileStamp({ ...expected, cid: this.archiveId(cid) })) {
        throw this.archiveFailure("归档文件的位置、名称、大小或哈希尚未核实");
      }
    }
    return directory;
  }
  static archiveCheckCleanupTree(plan, tree, archivedFiles, targetCid) {
    const expected = new Map(plan.tree.files.filter((file) => !plan.keepIds.has(file.fid)).map((file) => [file.fid, file]));
    if (targetCid === plan.scope.cid) archivedFiles.forEach((file) => expected.set(file.fid, file));
    for (const file of tree.files) {
      if (!expected.has(file.fid) || this.archiveFileStamp(file) !== this.archiveFileStamp(expected.get(file.fid))) throw this.archiveFailure("源目录内容已变化，未继续清理");
    }
    for (const [fid] of expected) {
      if (!tree.files.some((file) => file.fid === fid)) {
        if (!plan.attemptedFiles.has(fid)) throw this.archiveFailure("源目录文件已变化，未继续清理");
        plan.removedFiles.add(fid);
      }
    }
    for (const [cid, folder] of tree.folders) {
      const original = plan.tree.folders.get(cid);
      if (!original || folder.ids.join("/") !== original.ids.join("/")) throw this.archiveFailure("源目录结构已变化，未继续清理");
      const expectedNames = original.path.map((part) => this.archiveId(part.cid ?? part.file_id ?? part.id) === plan.scope.cid && plan.rootName
        ? plan.rootName : this.archiveName(part));
      if (folder.path.some((part, index) => this.archiveName(part) !== expectedNames[index])) throw this.archiveFailure("源目录路径已变化，未继续清理");
    }
    for (const cid of plan.tree.folders.keys()) {
      if (!tree.folders.has(cid)) {
        if (!plan.attemptedFolders.has(cid)) throw this.archiveFailure("源目录结构已变化，未继续清理");
        plan.removedFolders.add(cid);
      }
    }
  }
  static archiveAudit(plan, entries) {
    const record = { at: Date.now(), sourceCid: plan.scope.cid, sourcePath: plan.tree.root.path.map((part) => this.archiveName(part)).join("/"),
      entries: entries.map((file) => ({ id: this.archiveId(file.fid || file.cid), name: this.archiveName(file), cid: this.archiveId(file.cid) })) };
    console.info("[115.archive.cleanup]", record);
    if (typeof GM_getValue === "function" && typeof GM_setValue === "function") {
      const previous = GM_getValue("JavPack.archive.cleanupLog.v1", []);
      GM_setValue("JavPack.archive.cleanupLog.v1", [...(Array.isArray(previous) ? previous : []).slice(-49), record]);
    }
  }
  static async archiveCleanSource(plan, { targetCid, archivedFiles, removeRoot = true } = {}) {
    targetCid = this.archiveId(targetCid);
    const result = (status, reason) => ({ status, reason, count: plan.removedFiles.size, sourceCid: plan.scope.cid });
    if (plan.type !== "single") return result("skipped", plan.reason);
    try {
      const target = await this.archiveVerifyFiles(archivedFiles, targetCid);
      if ((removeRoot && (target.ids.includes(plan.scope.cid) || plan.scope.ids.includes(targetCid)))
        || this.archiveSharedSource(plan.scope.cid)) return result("skipped", "源目录属于受保护范围，未清理");
      const scan = async () => {
        await this.archiveVerifyFiles(archivedFiles, targetCid);
        const tree = await this.archiveTree(plan.scope);
        this.archiveCheckCleanupTree(plan, tree, archivedFiles, targetCid);
        return tree;
      };
      await scan();
      const groups = new Map();
      for (const file of plan.candidates) {
        if (!plan.removedFiles.has(file.fid)) {
          if (!groups.has(file.cid)) groups.set(file.cid, []);
          groups.get(file.cid).push(file);
        }
      }
      for (const [cid, files] of groups) {
        await scan();
        this.archiveAudit(plan, files);
        files.forEach((file) => plan.attemptedFiles.add(file.fid));
        this.archiveAck(await this.rbDelete(files.map((file) => file.fid), cid), "清理已确认垃圾");
        const after = await scan();
        if (files.some((file) => after.files.some((actual) => actual.fid === file.fid))) throw this.archiveFailure("垃圾删除结果尚未确认");
      }
      const folders = [...plan.tree.folders].sort((a, b) => b[1].ids.length - a[1].ids.length);
      for (const [cid, folder] of folders) {
        if ((!removeRoot && cid === plan.scope.cid) || plan.removedFolders.has(cid)) continue;
        const tree = await scan();
        const current = tree.folders.get(cid);
        if (!current || current.data.length || Number(current.count) !== 0) continue;
        this.archiveAudit(plan, [{ cid, n: this.archiveName(folder.path.at(-1)) }]);
        plan.attemptedFolders.add(cid);
        this.archiveAck(await this.rbDelete([cid], folder.ids.at(-2)), "移除已确认空目录");
        if (cid === plan.scope.cid) {
          const parent = await this.archiveDirectory(folder.ids.at(-2));
          if (parent.data.some((entry) => this.archiveId(entry.cid || entry.fid) === cid)) throw this.archiveFailure("空目录删除结果尚未确认");
          plan.removedFolders.add(cid);
          return result("cleaned", "已清理垃圾并移除源目录");
        }
        const after = await scan();
        if (after.folders.has(cid)) throw this.archiveFailure("空子目录删除结果尚未确认");
      }
      return result("cleaned", "已清理本片目录中的垃圾");
    } catch (error) {
      return result("failed", error?.message || "源目录清理失败");
    }
  }
  static async archiveDirectory(cid, expectedPath) {
    cid = this.archiveId(cid);
    if (!cid) throw this.archiveFailure("目录 ID 缺失");
    const result = await this.filesAll(cid);
    if (!result || (result.state !== true && result.state !== 1) || !Array.isArray(result.data) || !Array.isArray(result.path)) {
      throw this.archiveFailure("目录内容或路径无法验证");
    }
    const ids = result.path.map((part) => this.archiveId(part.cid ?? part.file_id ?? part.id));
    if (!ids.length || ids.some((id) => !id) || new Set(ids).size !== ids.length || ids.at(-1) !== cid) {
      throw this.archiveFailure("目录路径与 ID 不一致");
    }
    if (expectedPath && (ids.length !== expectedPath.length || ids.some((id, index) => id !== expectedPath[index]))) {
      throw this.archiveFailure("目录不在本次隔离范围内");
    }
    if (result.count == null || !/^\d+$/.test(String(result.count)) || Number(result.count) !== result.data.length) {
      throw this.archiveFailure("目录列表不完整");
    }
    return { ...result, ids };
  }
  static async createArchiveScope(parentCid, code) {
    parentCid = this.archiveId(parentCid);
    const parent = await this.archiveDirectory(parentCid);
    const name = String(code || "影片").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) + ".离线-" + crypto.randomUUID();
    const created = this.archiveAck(await this.filesAdd(name, parentCid), "创建独立任务目录");
    const cid = this.archiveId(created.cid ?? created.data?.cid);
    if (!cid || cid === "0" || parent.ids.includes(cid)) throw this.archiveFailure("新目录返回了归档目录或祖先 ID");
    const ids = [...parent.ids, cid];
    const fresh = await this.archiveDirectory(cid, ids);
    const leaf = fresh.path.at(-1);
    if ((leaf.name || leaf.file_name || leaf.n) !== name) throw this.archiveFailure("新任务目录名称未得到确认");
    if (fresh.data.length || (fresh.count != null && Number(fresh.count) !== 0)) {
      throw this.archiveFailure("新任务目录并非空目录");
    }
    return {
      cid, ids, name, parentCid, protectedIds: new Set(parent.ids),
      parentNames: parent.path.map((part) => part.name || part.file_name || part.n).filter(Boolean),
    };
  }
  static async archiveTree(scope) {
    const pending = [{ cid: scope.cid, ids: scope.ids }];
    const folders = new Map();
    const files = new Map();
    while (pending.length) {
      const current = pending.shift();
      if (folders.has(current.cid) || scope.protectedIds.has(current.cid)) throw this.archiveFailure("目录循环或越界");
      if (folders.size >= 100 || files.size > 5000) throw this.archiveFailure("任务目录超出检查上限");
      const result = await this.archiveDirectory(current.cid, current.ids);
      folders.set(current.cid, result);
      for (const item of result.data) {
        const fid = this.archiveId(item.fid);
        if (fid && fid !== "0") {
          if (scope.protectedIds.has(fid) || fid === scope.cid || files.has(fid)) throw this.archiveFailure("文件 ID 冲突");
          const owner = this.archiveId(item.cid ?? item.parent_id ?? item.pid ?? current.cid);
          if (owner !== current.cid) throw this.archiveFailure("文件不属于已验证目录");
          files.set(fid, { ...item, fid, cid: current.cid });
        } else {
          const cid = this.archiveId(item.cid ?? item.file_id);
          if (!cid || cid === scope.cid || scope.protectedIds.has(cid)) throw this.archiveFailure("子目录指向受保护目录");
          pending.push({ cid, ids: [...current.ids, cid] });
        }
      }
    }
    return { files: [...files.values()], folders, root: folders.get(scope.cid) };
  }
  static archiveVideo(file) {
    return Number(file.iv) === 1 || Number(file.type) === 4
      || /^(mp4|mkv|avi|wmv|mov|flv|ts|m2ts|m4v|webm|rmvb|mpg|mpeg|vob)$/i.test(file.ico || String(file.n).split(".").at(-1));
  }
  static archiveWait(interval = 3000) { return new Promise((resolve) => setTimeout(resolve, interval)); }
  static archiveCompletedFile(tree, url) {
    // A registered single-file ed2k result can confirm completion even while
    // task metadata lags. Require its exact name/size and SHA1 in our fresh scope.
    const link = String(url || "").match(/^ed2k:\/\/\|file\|([^|]+)\|(\d+)\|[a-f\d]{32}\|/i);
    if (!link || tree.files.length !== 1 || tree.folders.size !== 1) return "";
    let name = link[1];
    try { name = decodeURIComponent(name); } catch (_) {}
    const file = tree.files[0];
    const sha = String(file.sha || file.sha1 || "").toLowerCase();
    if (file.n !== name || Number(file.s) !== Number(link[2]) || Number(file.s) <= 0 || !/^[a-f\d]{40}$/.test(sha)) return "";
    return JSON.stringify([file.fid, file.cid, file.n, Number(file.s), sha]);
  }
  static async verifyArchiveTask(infoHash, scope, { code }, { max = 41, interval = 3000, filter = () => true } = {}, magnet = {}) {
    let hash = typeof infoHash === "string" ? infoHash.trim().toLowerCase() : "";
    const checks = Math.min(120, Math.max(1, Math.floor(Number(max) || 41)));
    const waitMs = Math.min(30000, Math.max(1000, Number(interval) || 3000));
    let completed = false;
    let previousFile = "";
    let outsideTask = false;
    let mediaVisible = false;
    for (let index = 0; index < checks; index++) {
      if (index) await this.archiveWait(waitMs);
      const response = await this.lixianTaskLists();
      if (response?.state === false || !Array.isArray(response?.tasks)) throw this.archiveFailure("任务列表无法验证");
      const tasks = response.tasks.filter((item) => item && typeof item === "object");
      const matchesHash = (item) => hash && typeof item.info_hash === "string" && item.info_hash.trim().toLowerCase() === hash;
      const identifiesScope = (item) => this.archiveId(item.wp_path_id) === scope.cid || this.archiveId(item.file_id) === scope.cid;
      const pages = Math.min(20, Math.max(1, Math.floor(Number(response.page_count) || 1)));
      for (let page = 2; page <= pages && !tasks.some((item) => matchesHash(item) || (!hash && identifiesScope(item))); page++) {
        const next = await this.lixianTaskLists(page);
        if (next?.state === false || !Array.isArray(next?.tasks)) throw this.archiveFailure("任务列表分页无法验证");
        tasks.push(...next.tasks.filter((item) => item && typeof item === "object"));
      }
      let task = tasks.find(matchesHash);
      if (task && scope.protectedIds.has(this.archiveId(task.file_id))) throw this.archiveFailure("任务返回了演员归档目录或祖先目录");
      if (task && Number(task.status) === -1) return { pending: false, message: "115 任务失败" };
      if (task && Number(task.status) !== 2 && !/^ed2k:/i.test(magnet.url || "")) { previousFile = ""; continue; }
      const tree = await this.archiveTree(scope);
      const ownedIds = new Set([...tree.folders.keys(), ...tree.files.map((file) => file.fid)]);
      if (!task) {
        // A missing hash is not a reason to stop waiting. Bind a task only by
        // the unique directory we just created or an output verified inside it.
        const scopedTasks = tasks.filter((item) => {
          if (hash && typeof item.info_hash === "string" && item.info_hash.trim()) return false;
          return this.archiveId(item.wp_path_id) === scope.cid || ownedIds.has(this.archiveId(item.file_id));
        });
        if (scopedTasks.length > 1) throw this.archiveFailure("本次目录关联了多个离线任务");
        task = scopedTasks[0];
        if (!hash && typeof task?.info_hash === "string") hash = task.info_hash.trim().toLowerCase();
      }
      const taskId = this.archiveId(task?.file_id);
      if (scope.protectedIds.has(taskId)) throw this.archiveFailure("任务返回了演员归档目录或祖先目录");
      if (task && Number(task.status) === -1) return { pending: false, message: "115 任务失败" };
      completed ||= Number(task?.status) === 2;
      // Task completion and directory indexing are separate updates in 115.
      // Retry an unseen output; it never becomes a directory we may operate on.
      outsideTask = Boolean(taskId && !ownedIds.has(taskId));
      if (outsideTask) { previousFile = ""; continue; }
      const taskFile = tree.files.find((file) => file.fid === taskId);
      const allVideos = (taskFile ? [taskFile] : tree.files).filter((file) => this.archiveVideo(file));
      const videos = allVideos.filter((file) => this.archiveMatchesCode(file.n, code) && !this.archiveHasForeignCode(file.n, code) && filter(file));
      mediaVisible ||= allVideos.length > 0;
      if (Number(task?.status) === 2 && videos.length) return { videos, allVideos, tree, pending: false };
      const readyFile = videos.length ? this.archiveCompletedFile(tree, magnet.url) : "";
      if (readyFile && readyFile === previousFile) return { videos, allVideos, tree, pending: false };
      previousFile = readyFile;
    }
    const windowText = "检测等待窗口（约 " + Math.ceil((checks - 1) * waitMs / 1000) + " 秒）已结束";
    return {
      pending: !outsideTask && (!completed || !mediaVisible),
      message: windowText + (outsideTask ? "，任务文件尚未同步到本次独立目录"
        : completed ? "，仍未识别到与完整番号匹配的视频" : "，115 仍在下载或任务结果尚未同步"),
    };
  }
  static archiveOwned(scope, tree, keepIds, knownIds) {
    for (const id of [...tree.folders.keys(), ...tree.files.map((file) => file.fid)]) {
      if (scope.protectedIds.has(id) || (knownIds && !knownIds.has(id))) throw this.archiveFailure("隔离目录内容或归属发生变化");
    }
    const files = keepIds.map((id) => tree.files.find((file) => file.fid === id));
    if (files.some((file) => !file)) throw this.archiveFailure("待整理文件已移出隔离目录");
    return files;
  }
  static async finishArchive(scope, verified, options, magnet, onMatch) {
    const { code, rename, renameTxt, tags = [], clean, cover, uncensored } = options;
    const videos = verified.videos;
    const attachments = this.archiveAttachments(verified.tree.files, videos, code);
    const srts = attachments.filter((file) => this.archiveSubtitle(file));
    const knownIds = new Set([...verified.tree.folders.keys(), ...verified.tree.files.map((file) => file.fid)]);
    const videoIds = videos.map((file) => file.fid);
    const keepIds = [...new Set([...videoIds, ...attachments.map((file) => file.fid)])];
    const plan = this.archiveSourcePlan(scope, verified.tree, videos, [...videos, ...attachments], code, true);
    let tree = await this.archiveTree(scope);
    this.archiveCheckCleanupTree(plan, tree, plan.files, scope.cid);
    let files = this.archiveOwned(scope, tree, keepIds, knownIds);
    const moveIds = files.filter((file) => file.cid !== scope.cid).map((file) => file.fid);
    if (moveIds.length) {
      this.archiveAck(await this.filesMove(moveIds, scope.cid), "移动本次任务文件");
      tree = await this.archiveTree(scope);
      files = this.archiveOwned(scope, tree, keepIds, knownIds);
      if (files.some((file) => file.cid !== scope.cid)) throw this.archiveFailure("文件移动后位置未确认");
    }
    await this.archiveVerifyFiles(files, scope.cid);
    tree = await this.archiveTree(scope);
    files = this.archiveOwned(scope, tree, keepIds, knownIds);
    if (files.some((file) => file.cid !== scope.cid)) throw this.archiveFailure("重命名前文件目录发生变化");
    let syncedVideos = files.filter((file) => videoIds.includes(file.fid));
    try { onMatch?.({ cid: scope.cid, files: syncedVideos, realPath: "", hasCover: false, subtitleFiles: [] }); }
    catch (error) { console.warn("[Req115.archive.onMatch]", error?.message); }
    if (tags.length) await this.handleTags(syncedVideos, tags);
    let names = {};
    if (rename) {
      names = this.buildRenameObject(files, scope.cid, {
        rename, renameTxt, zh: magnet.zh || srts.length, crack: magnet.crack, leaked: magnet.leaked,
        uncensored: uncensored || magnet.uncensored,
      });
      const renamed = this.archiveRenamedFiles(files, videos, names[scope.cid]);
      renamed.forEach((file) => { names[file.fid] = file.n; });
      if (Object.keys(names).some((id) => scope.protectedIds.has(id) || (id !== scope.cid && !keepIds.includes(id)))) {
        throw this.archiveFailure("重命名清单超出本次任务范围");
      }
      this.archiveAck(await this.filesBatchRename(names), "重命名本次任务");
      syncedVideos = syncedVideos.map((file) => ({ ...file, n: names[file.fid] || file.n }));
    }
    const archivedFiles = files.map((file) => ({ ...file, n: names[file.fid] || file.n }));
    plan.rootName = names[scope.cid];
    await this.archiveVerifyFiles(archivedFiles, scope.cid);
    const cleanup = clean ? await this.archiveCleanSource(plan, { targetCid: scope.cid, archivedFiles, removeRoot: false })
      : { status: "skipped", reason: "清理已关闭", count: 0 };
    let hasCover = false;
    let coverError = "";
    if (cover) {
      try {
        await this.archiveDirectory(scope.cid, scope.ids);
        const uploaded = await this.handleCover(cover, scope.cid, code + ".cover.jpg");
        await this.setFolderCover(scope.cid, this.getUploadedFileId(uploaded));
        hasCover = true;
      } catch (error) { coverError = error?.message || "封面上传失败"; }
    }
    const realPath = [...scope.parentNames, names[scope.cid] || scope.name].join("/");
    return {
      status: "success", msg: code + " 离线任务成功；" + cleanup.reason + (coverError ? "；封面未上传：" + coverError : ""), coverError, cleanup,
      match: {
        cid: scope.cid, files: syncedVideos, realPath, hasCover, coverError,
        subtitleFiles: archivedFiles.filter((file) => this.archiveSubtitle(file)),
      },
    };
  }
  static pendingArchives = new Map();
  static async handleOfflineNow(options, magnets, { onMatch, onState } = {}) {
    const parentCid = this.archiveId(await this.handleDir(options.dir));
    if (!parentCid) return { status: "error", msg: "获取归档目录失败" };
    for (let index = 0; index < magnets.length; index++) {
      const magnet = magnets[index];
      const jobKey = JSON.stringify([parentCid, options.code, magnet.url]);
      let job = this.pendingArchives.get(jobKey);
      if (!job) {
        const scope = await this.createArchiveScope(parentCid, options.code);
        const result = await this.lixianAddTaskUrl(magnet.url, scope.cid);
        if (!result?.state) {
          const message = result?.error_msg || "115 未确认离线任务提交";
          if (Number(result?.errcode) === 10008) continue;
          if (Number(result?.errcode) === 911) {
            this.pauseMutations(message);
            return { status: "warn", msg: message, currIdx: index };
          }
          return { status: "error", msg: message, currIdx: index };
        }
        job = { scope, infoHash: result.info_hash };
        this.pendingArchives.set(jobKey, job);
      }
      const { scope, infoHash } = job;
      onState?.({ state: "waiting", label: "离线任务" });
      const verified = await this.verifyArchiveTask(infoHash, scope, options, options.verifyOptions, magnet);
      if (!verified.videos?.length) {
        if (!verified.pending) this.pendingArchives.delete(jobKey);
        return {
          status: verified.pending ? "pend" : "error", currIdx: index,
          msg: options.code + " 已提交；" + verified.message + (verified.pending ? "；可在当前页面继续检测" : "")
            + "；任务目录保留：" + [...scope.parentNames, scope.name].join("/"),
        };
      }
      this.pendingArchives.delete(jobKey);
      onState?.({ state: "archiving", label: "离线任务" });
      return this.finishArchive(scope, verified, options, magnet, onMatch);
    }
    return { status: "error", msg: "所选资源未能建立新的离线任务；未整理已有文件" };
  }
};
// END SAFE115_ARCHIVE_V1
const ArchiveReq115 = Req115.SAFE_ARCHIVE_VERSION === "2026-10-27.1" ? Req115 : create115SafeArchiveFallback(Req115);
// Apply the longer defaults even when Tampermonkey still caches the older Offline library.
Offline.defaultVerifyOptions = { ...Offline.defaultVerifyOptions, max: 41, interval: 3000 };

const offline = async ({ options, magnets, onstart, onprogress, onmatch, onState, onfinally, requester = ArchiveReq115 }, currIdx = 0, started = false) => {
  if (!started) onstart?.();
  let res;
  try {
    res = await requester.handleOffline(options, magnets.slice(currIdx), { onMatch: onmatch, onState });
  } catch (err) {
    return onfinally?.({
      status: "error",
      msg: err?.message || "离线请求失败",
    });
  }
  if (res.status !== "warn") return onfinally?.(res);
  onState?.({ state: "verifying", label: "离线任务" });
  onprogress?.(res);

  if (GM_getValue(STATUS_KEY) !== PENDING) {
    Verify115.start();
    Grant.notify(res);
  }

  const listener = GM_addValueChangeListener(STATUS_KEY, (_name, _old_value, new_value) => {
    if (![VERIFIED, FAILED].includes(new_value)) return;
    GM_removeValueChangeListener(listener);
    if (new_value === FAILED) return onfinally?.({ status: "error", msg: "115 验证未通过，离线任务未提交" });
    Req115.resumeMutations();
    offline({ options, magnets, onstart, onprogress, onmatch, onState, onfinally, requester }, res.currIdx, true);
  });
};

// JSON strings cross userscript sandboxes without exposing privileged functions.
const REVIEW_OFFLINE_REQUEST = "JavDB.reviewOffline.request.v2";
const REVIEW_OFFLINE_RESPONSE = "JavDB.reviewOffline.response.v2";
const reviewOfflineJobs = new Set();
const reviewOfflineDetails = new Map();

class ReviewReq115 extends ArchiveReq115 {
  static handleVerify(infoHash, ...args) {
    // Never match an unrelated task when a submitted URL has no returned hash.
    if (typeof infoHash !== "string" || !infoHash.trim()) {
      return Promise.resolve({ file_id: "", videos: [], allVideos: [], pending: true });
    }
    return super.handleVerify(infoHash, ...args);
  }
}

const parseReviewOfflineLink = (raw) => {
  const url = String(raw || "").trim();
  const ed2k = url.match(/^ed2k:\/\/\|file\|([^|\r\n<>]+)\|(\d+)\|([a-f\d]{32})\|(?:[a-z][\w-]*=[^|\s<>]+\|)*\/(?:\|sources,[^|\s<>]+\|\/)?$/i);
  let name;
  let size = 0;
  if (ed2k) {
    name = decodeMagnetUrl(ed2k[1]);
    size = Number(ed2k[2]);
  } else {
    if (!/^magnet:\?/i.test(url) || /[\s<>"'`]/.test(url)) throw new Error("不支持的评论资源链接");
    const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    const valid = params.getAll("xt").some((value) => /^urn:btih:(?:[a-f\d]{40}|[a-z2-7]{32})$/i.test(value)
      || /^urn:btmh:1220[a-f\d]{64}$/i.test(value));
    if (!valid) throw new Error("磁力链接没有有效的 BTIH/BTMH 标识");
    name = params.get("dn") || "评论磁力链接";
    size = Number(params.get("xl")) || 0;
  }
  const source = `${name} ${decodeMagnetUrl(url)}`;
  return { url, name, size, zh: Magnet.zhReg.test(source), crack: CRACK_REG.test(source), leaked: LEAK_REG.test(source) };
};

const getReviewOfflineContext = async (request) => {
  const movieId = String(request.movieId || "");
  const url = new URL(request.movieUrl, location.origin);
  if (!/^[a-zA-Z0-9]+$/.test(movieId) || url.origin !== location.origin || url.pathname !== `/v/${movieId}` || url.search || url.hash) {
    throw new Error("影片地址与影片 ID 不匹配");
  }
  let entry = reviewOfflineDetails.get(movieId);
  if (!entry || Date.now() - entry.at > 300000) {
    const dom = location.pathname.replace(/\/$/, "") === url.pathname && document.querySelector(".movie-panel-info")
      ? document : await Req.request(url.href);
    const details = getDetails(dom);
    if (!details?.code) throw new Error("无法读取影片资料，未提交离线任务");
    entry = { at: Date.now(), details, uncensored: isUncensored(dom) };
    reviewOfflineDetails.set(movieId, entry);
  }
  const config = await getConfig();
  const actions = Offline.getActions(config, entry.details);
  return { ...entry, actions, config };
};

const initReviewOfflineBridge = () => {
  if (location.hostname !== "javdb.com") return;
  document.documentElement.dataset.javdbReviewOfflineBridge = "2";
  document.addEventListener(REVIEW_OFFLINE_REQUEST, async (event) => {
    let request;
    try { request = JSON.parse(event.detail); } catch { return; }
    if (!request || typeof request.id !== "string" || request.id.length > 128 || !["actions", "submit"].includes(request.type)) return;
    const respond = (kind, data = {}) => document.dispatchEvent(new CustomEvent(REVIEW_OFFLINE_RESPONSE, {
      detail: JSON.stringify({ id: request.id, kind, ...data }),
    }));
    respond("accepted");
    let jobKey;
    let ownsJob = false;
    try {
      const context = await getReviewOfflineContext(request);
      const { details, actions, config } = context;
      if (request.type === "actions") {
        respond("result", { result: { code: details.code, actions: actions.map((action) => ({
          index: action.index, idx: action.idx, name: action.name, dir: action.dir.join("/"),
          actor: config[action.index]?.type === "actors",
        })) } });
        return;
      }
      const magnet = parseReviewOfflineLink(request.url);
      const action = actions.find((item) => item.index === request.action?.index && item.idx === request.action?.idx);
      if (!action || action.dir.join("/") !== request.destination) throw new Error("归档目录配置已变化，请刷新离线目录后重试");
      jobKey = `${request.movieId}\n${magnet.url}`;
      if (reviewOfflineJobs.has(jobKey)) throw new Error("这个影片链接正在离线，请等待当前任务结束");
      reviewOfflineJobs.add(jobKey);
      ownsJob = true;
      const { magnetOptions: _magnetOptions, ...options } = Offline.getOptions(action, details);
      await new Promise((resolve, reject) => offline({
        requester: ReviewReq115,
        options,
        magnets: checkCrack([magnet], context.uncensored),
        onstart: () => { Util.setFavicon("pend"); respond("progress", { state: { state: "preparing" } }); },
        onprogress: Util.setFavicon,
        onState: (state) => respond("progress", { state }),
        onmatch: (match) => syncOfflineMatch(details, { status: "success", match, operation: "offline-pending" }),
        onfinally: (result) => {
          try {
            Grant.notify(getOfflineNotification(result));
            Util.setFavicon(result);
            syncOfflineMatch(details, result);
          } finally {
            respond("result", { result: { status: result.status, msg: result.msg, realPath: result.match?.realPath || "" } });
            resolve();
          }
        },
      }).catch(reject));
    } catch (error) {
      respond("error", { message: error?.message || "评论链接离线失败" });
    } finally {
      if (ownsJob) reviewOfflineJobs.delete(jobKey);
    }
  });
};

initReviewOfflineBridge();

(function () {
  if (location.host === HOST) return Verify115.verify();

  const attributes = { type: "file", accept: ".js", style: "display: none;" };
  const fileInput = GM_addElement(document.body, "input", attributes);

  document.addEventListener("keydown", (e) => e.altKey && e.code === "KeyU" && fileInput.click());
  fileInput.addEventListener("change", setConfig);

  onShortcut();
})();

(async function () {
  const details = getDetails();
  if (!details) return;

  ensureActressInfo().catch((err) => Util.print(err?.message));

  const CONFIG = await getConfig();
  const actions = Offline.getActions(CONFIG, details);
  if (!actions.length) return;

  const UNC = isUncensored();

  const insertActions = (actions) => {
    document.querySelector(".movie-panel-info").insertAdjacentHTML(
      "beforeend",
      `<div class="panel-block"><div class="columns"><div class="column"><div class="buttons">
        ${actions.map(renderAction).join("")}
      </div></div></div></div>`,
    );

    const inMagnets = actions.filter((item) => Boolean(item.inMagnets));
    if (!inMagnets.length) return;

    const inMagnetsStr = inMagnets.map(renderAction).join("");
    const magnetsNode = document.querySelector("#magnets-content");

    const insert = (node) => {
      const buttons = node.querySelector(".buttons");
      if (!buttons || buttons.querySelector(`.${TARGET_CLASS}`)) return;
      buttons.insertAdjacentHTML("beforeend", inMagnetsStr);
    };
    const insertMagnets = () => magnetsNode?.querySelectorAll(":scope > .item").forEach(insert);

    window.addEventListener("JavDB.magnet", insertMagnets);
    insertMagnets();
  };

  const onstart = (target) => {
    Util.setFavicon("pend");
    beginOfflineButtonUI(target, document);
  };

  const onState = (target, state) => {
    setOfflineButtonState(target, state);
  };

  const onfinally = (target, res) => {
    finishOfflineButtonUI(target);
    if (!res) return;

    Grant.notify(getOfflineNotification(res));
    Util.setFavicon(res);
    if (!syncOfflineMatch(details, res)) setTimeout(() => unsafeWindow.JavDBMatchRefreshDetail?.(true), MATCH_DELAY);
  };

  const onclick = (e) => {
    const target = e.target.closest?.(`.${TARGET_CLASS}`);
    if (!target) return;

    e.preventDefault();
    e.stopPropagation();

    const action = findAction(target.dataset, actions);
    if (!action) return;
    const inMagnets = target.closest("#magnets-content > .item");
    const { magnetOptions, ...options } = Offline.getOptions(action, details);

    const magnets = inMagnets ? [parseMagnet(inMagnets)] : Offline.getMagnets(getMagnets(), magnetOptions);
    if (!magnets.length) return;

    offline({
      options,
      magnets: checkCrack(magnets, UNC),
      onstart: () => onstart(target),
      onprogress: Util.setFavicon,
      onmatch: (match) => syncOfflineMatch(details, { status: "success", match, operation: "offline-pending" }),
      onState: (state) => onState(target, state),
      onfinally: (res) => onfinally(target, res),
    });
  };

  insertActions(actions);
  window.JavPackSubtitle?.ensureDetailButton({
    details,
    getTargetCid: () => document.querySelector(".x-match-cont .zymatch-item [data-cid]")?.dataset.cid || "",
    getSubtitleEntries: () => [...document.querySelectorAll('.x-match-cont .zymatch-item[data-has-subtitle="1"]')]
      .map((node) => {
        let files = [];
        try { files = JSON.parse(node.dataset.subtitleFiles || "[]"); } catch (_) {}
        return { directory: node.querySelector(".x-match-dir")?.textContent.trim(), files };
      }),
  });
  document.addEventListener("click", onclick);
})();

(async function () {
  const COVER_SELECTOR = ".cover";
  const movieList = document.querySelectorAll(".movie-list .item");
  if (!movieList.length) return;

  const getParams = () => {
    const sectionName = document.querySelector(".section-name")?.textContent.trim() ?? "";
    const actorSectionName = document.querySelector(".actor-section-name")?.textContent.trim() ?? "";

    const getLastName = (txt) => txt.split(", ").at(-1).trim();

    const getOnTags = () => {
      const nodeList = document.querySelectorAll("#tags .tag_labels .tag.is-info");
      const genres = [...nodeList].map((item) => item.textContent.trim());
      return { genres };
    };

    const getOnActors = () => {
      const actor = getLastName(actorSectionName).replace("(無碼)", "").trim();
      const nodeList = document.querySelectorAll(".actor-tags.tags .tag.is-medium.is-link:not(.is-outlined)");
      const genres = [...nodeList].map((item) => item.textContent.trim());
      return { actors: [actor], genres };
    };

    const getOnSeries = () => {
      return { series: sectionName };
    };

    const getOnMakers = () => {
      return { maker: getLastName(sectionName) };
    };

    const getOnDirectors = () => {
      return { director: getLastName(sectionName) };
    };

    const getOnVideoCodes = () => {
      return { prefix: sectionName, codeFirstLetter: sectionName[0].toUpperCase() };
    };

    const getOnLists = () => {
      return { list: actorSectionName };
    };

    const getOnPublishers = () => {
      return { publisher: getLastName(sectionName) };
    };

    const getOnUsersList = () => {
      const list = document.querySelector(".title.is-4 .is-active a")?.textContent.trim() ?? "";
      return { list };
    };

    const { pathname: PATHNAME } = location;
    if (PATHNAME.startsWith("/tags")) return getOnTags();
    if (PATHNAME.startsWith("/actors")) return getOnActors();
    if (PATHNAME.startsWith("/series")) return getOnSeries();
    if (PATHNAME.startsWith("/makers")) return getOnMakers();
    if (PATHNAME.startsWith("/directors")) return getOnDirectors();
    if (PATHNAME.startsWith("/video_codes")) return getOnVideoCodes();
    if (PATHNAME.startsWith("/lists")) return getOnLists();
    if (PATHNAME.startsWith("/publishers")) return getOnPublishers();
    if (PATHNAME.startsWith("/users/list_detail")) return getOnUsersList();
    return {};
  };

  const CONFIG = await getConfig();
  const params = getParams();
  const actions = Offline.getActions(CONFIG, params);
  if (!actions.length) return;

  const insertActions = (actions) => {
    const actionsStr = `<div class="px-2 pt-2 buttons">${actions.map(renderAction).join("")}</div>`;

    // The rankings module reserves the cover corner for its rank marker.  It still
    // emits JavDB.scroll so matching and Quick View initialize normally.
    const insert = (node) => {
      if (node.closest("#x-rankings-override-page")) return;
      node.querySelector(COVER_SELECTOR)?.insertAdjacentHTML("beforeend", actionsStr);
    };
    const insertList = (nodeList) => nodeList.forEach(insert);

    insertList(movieList);
    window.addEventListener("JavDB.scroll", ({ detail }) => insertList(detail));
  };

  const videoFocus = (target) => target.closest(COVER_SELECTOR)?.querySelector("video")?.focus();

  const onstart = (target) => {
    Util.setFavicon("pend");
    beginOfflineButtonUI(target, target.parentElement);
  };

  const onState = (target, state) => {
    setOfflineButtonState(target, state);
  };

  const onfinally = (target, details, res) => {
    finishOfflineButtonUI(target);
    if (!res) return;
    Grant.notify(getOfflineNotification(res));
    Util.setFavicon(res);
    if (res.status === "success" && !syncOfflineMatch(details, res)) {
      setTimeout(() => unsafeWindow[MATCH_API]?.(target), MATCH_DELAY);
    }
  };

  const onclick = async (e) => {
    const target = e.target.closest?.(`.${TARGET_CLASS}`);
    if (!target) return;

    e.preventDefault();
    e.stopPropagation();
    requestAnimationFrame(() => videoFocus(target));

    const action = findAction(target.dataset, actions);
    if (!action) return;
    onstart(target);

    try {
      const dom = await Req.request(target.closest("a").href);
      const details = getDetails(dom);
      if (!details) throw new Error("Not found details");
      const UNC = isUncensored(dom);
      const { magnetOptions, ...options } = Offline.getOptions(action, details);

      const magnets = Offline.getMagnets(getMagnets(dom), magnetOptions);
      if (!magnets.length) throw new Error("Not found magnets");

      offline({
        options,
        magnets: checkCrack(magnets, UNC),
        onmatch: (match) => syncOfflineMatch(details, { status: "success", match, operation: "offline-pending" }),
        onState: (state) => onState(target, state),
        onfinally: (res) => onfinally(target, details, res),
      });
    } catch (err) {
      onfinally(target, null, { status: "error", msg: err?.message || "读取资源失败" });
      Util.print(err?.message);
    }
  };

  insertActions(actions);
  document.addEventListener("click", onclick, true);
})();
