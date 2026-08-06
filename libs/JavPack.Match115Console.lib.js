/**
 * @require JavPack.Req115.lib.js
 */
window.JavPackMatch115Console = class JavPackMatch115Console {
  static zhReg = /中文|中字|字幕|\[[a-z]?hdc[a-z]?\]|[-_\s]+(uc|c|ch|cu|zh)(?![a-z])/i;

  static subtitleFileReg = /\.(srt|ass|ssa|vtt|sub)$/i;
  static subtitleDetectionVersion = 2;
  static archiveAttachmentFileReg = /\.(srt|ass|ssa|vtt|sub|nfo)$/i;
  static crackReg = /破解|解密版|restored|破[\u4E00-\u9FC6]版/i;
  static leakReg = /uncensored[\s._-]*leaked|\buncen\b|無碼流出|流出/i;

  static escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  static sanitizeName(value = "") {
    return String(value).replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  }

  static requestError(message, response = {}) {
    const err = new Error(response?.error_msg || response?.error || message);
    err.errcode = response?.errcode;
    err.response = response;
    return err;
  }

  static getExt(name = "") {
    const ext = String(name).split(".").pop();
    return ext && ext !== name ? ext.toLowerCase() : "mp4";
  }

  static normalizeFile(item) {
    return { ...item, ico: item.ico || this.getExt(item.n) };
  }

  static truncateHoverText(value = "", max = 96) {
    const text = String(value || "");
    if (text.length <= max) return text;
    const head = Math.ceil((max - 1) / 2);
    const tail = Math.floor((max - 1) / 2);
    return `${text.slice(0, head)}…${text.slice(-tail)}`;
  }

  static formatHoverLine(label, value = "", max = 96) {
    const text = String(value || "");
    return `${label}：${this.truncateHoverText(text, max)}`;
  }

  static formatItemTip(file = {}, path = this.formatDirectory(file)) {
    return [
      this.formatHoverLine("视频", file.n || file.name || file.file_name || ""),
      file.s && `大小：${file.s}${file.videoCount ? ` · ${file.videoCount} 个视频` : ""}`,
      this.formatHoverLine("目录", path || ""),
    ].filter(Boolean).join("\n");
  }

  static replaceDirectoryTail(path = "", folderName = "") {
    const text = String(path || "").trim();
    if (!text || text === "目录未知") return folderName;
    return text.includes("/") ? text.replace(/[^/]+$/, folderName) : folderName;
  }

  static formatDirectory(item = {}) {
    if (item.realPath) return String(item.realPath);

    if (Array.isArray(item.paths)) {
      const path = this.formatPathParts(item.paths);
      if (path) return path;
    }

    return item.t || item.pc || "目录未知";
  }

  static formatPathParts(parts = []) {
    return parts
      .map((part) => part?.name || part?.file_name || part?.n)
      .filter((name) => name && name !== "网盘" && name !== "115")
      .join("/");
  }

  static hasCoverFile(files = []) {
    return files.some((file) => /\.cover\.(jpe?g|png|webp|gif)$/i.test(file?.n || ""));
  }

  static getCoverFilename(details = {}) {
    const code = this.sanitizeName(details.code || "cover") || "cover";
    return `${code}.cover.jpg`;
  }

  static async resolveMetadata(req115, cid) {
    if (!req115 || !cid) return "";
    const res = await req115.files(cid, { limit: 1150 });
    const files = res?.data || [];
    return {
      realPath: this.formatPathParts(res?.path || []),
      hasCover: this.hasCoverFile(files),
      subtitleFiles: files.filter((file) => this.subtitleFileReg.test(file.n || file.name || file.file_name || "")),
    };
  }

  static subtitleStem(name = "") {
    // Keep only subtitles belonging to the selected video.  A collection
    // directory can contain subtitles for several titles, all of which share
    // the same cid.
    return this.sanitizeName(String(name).replace(/\.[^.]+$/, ""))
      .replace(/(?:[._ -](?:cd|disc|part|pt|ep|e)\d+)(?:[._ -].*)?$/i, "")
      .toLowerCase();
  }

  static belongsToVideoSubtitle(video = {}, subtitle = {}) {
    const videoStem = this.subtitleStem(video.n || video.name || video.file_name || "");
    const subtitleStem = this.subtitleStem(subtitle.n || subtitle.name || subtitle.file_name || "");
    return Boolean(videoStem && subtitleStem && (subtitleStem === videoStem || subtitleStem.startsWith(`${videoStem}.`) || subtitleStem.startsWith(`${videoStem} `) || subtitleStem.startsWith(`${videoStem}-`)));
  }

  static hasMatchingDetailCode(video = {}, attachment = {}, details = {}) {
    const videoName = video.n || video.name || video.file_name || "";
    const attachmentName = attachment.n || attachment.name || attachment.file_name || "";
    return Boolean(details.regex?.test(videoName) && details.regex.test(attachmentName));
  }

  static belongsToVideoSubtitleFile(video = {}, subtitle = {}, details = {}) {
    const name = subtitle.n || subtitle.name || subtitle.file_name || "";
    if (!this.subtitleFileReg.test(name)) return false;
    if (this.belongsToVideoSubtitle(video, subtitle)) return true;

    // Historical actor folders often use a different release name for the
    // subtitle.  Use the current JavDB code only as a narrow fallback.
    return this.hasMatchingDetailCode(video, subtitle, details);
  }

  static belongsToArchiveBundle(video = {}, attachment = {}, details = {}) {
    const name = attachment.n || attachment.name || attachment.file_name || "";
    if (!this.archiveAttachmentFileReg.test(name)) return false;
    if (this.subtitleFileReg.test(name)) return this.belongsToVideoSubtitleFile(video, attachment, details);

    // NFO files use the same code fallback as subtitles, while other file types
    // never qualify as archive attachments.
    return this.belongsToVideoSubtitle(video, attachment) || this.hasMatchingDetailCode(video, attachment, details);
  }

  static getArchiveBundleFiles(sourceFiles = [], video = {}, details = {}) {
    return sourceFiles
      .filter((item) => !video?.fid || String(item?.fid || "") !== String(video.fid))
      .filter((item) => this.belongsToArchiveBundle(video, item, details))
      .map((item) => this.normalizeFile(item));
  }

  static getBundleMembers(item = {}) {
    const source = Array.isArray(item.members) && item.members.length ? item.members : [item];
    const seen = new Set();
    return source
      .filter((file) => file?.fid)
      .filter((file) => {
        const fid = String(file.fid);
        if (seen.has(fid)) return false;
        seen.add(fid);
        return true;
      })
      .map((file) => this.normalizeFile(file));
  }

  static getBundleAttachments(sourceFiles = [], videos = [], details = {}) {
    const videoFids = new Set(videos.map((file) => String(file.fid)));
    const files = videos.flatMap((video) => this.getArchiveBundleFiles(sourceFiles, video, details));
    const seen = new Set(videoFids);
    return files.filter((file) => {
      const fid = String(file.fid || "");
      if (!fid || seen.has(fid)) return false;
      seen.add(fid);
      return true;
    });
  }

  static async enrichMetadata(items = [], req115, details = {}) {
    const cids = [...new Set(items
      .filter((item) => item?.cid && (!item.realPath || !item.paths?.length || item.hasCover === undefined || item.subtitleDetectionVersion !== this.subtitleDetectionVersion))
      .map((item) => item.cid))];
    const metadata = new Map();
    // Metadata requests used to fan out with Promise.all.  A fresh card may
    // contain several folders, so resolve them one by one instead.
    for (const cid of cids) {
      const metadataItem = await this.resolveMetadata(req115, cid)
        .catch(() => ({ realPath: "", hasCover: false, subtitleFiles: [] }));
      metadata.set(cid, metadataItem);
    }

    for (const item of items) {
      const meta = metadata.get(item.cid);
      if (!meta) continue;
      if (meta.realPath && !item.realPath) item.realPath = meta.realPath;
      if (item.hasCover === undefined) item.hasCover = meta.hasCover;
      item.subtitleFiles = meta.subtitleFiles
        .filter((subtitle) => this.belongsToVideoSubtitleFile(item, subtitle, details))
        .map((subtitle) => ({ n: subtitle.n || subtitle.name || subtitle.file_name || "", s: subtitle.s || 0 }));
      item.hasSubtitle = Boolean(item.subtitleFiles.length);
      item.subtitleDetectionVersion = this.subtitleDetectionVersion;
    }

    return items;
  }

  static enrichDirectories(items = [], req115, details = {}) {
    return this.enrichMetadata(items, req115, details);
  }

  static buildTargetDir(details = {}) {
    const prefix = this.sanitizeName(details.prefix || details.codeFirstLetter || "未分类");
    const title = this.sanitizeName([details.code, details.title].filter(Boolean).join(" "));
    return ["番号", prefix, title || this.sanitizeName(details.code || "未命名")];
  }

  static buildActorTargetDir(details = {}) {
    const actor = this.sanitizeName(details.actors?.[0] || "");
    const title = this.sanitizeName([details.code, details.title].filter(Boolean).join(" "))
      || this.sanitizeName(details.code || "未命名");
    // 一部影片没有演员资料，此时保留原有番号归档作为可靠的后备路径。
    // 演员目录下还要以作品名分目录，避免同一演员的所有作品直接混在一起。
    return actor ? ["演员", actor, title] : this.buildTargetDir(details);
  }

  static buildArchiveDir(details = {}, mode = "actor") {
    return mode === "code" ? this.buildTargetDir(details) : this.buildActorTargetDir(details);
  }

  static buildRename(details = {}, files = []) {
    const code = this.sanitizeName(details.code || "未命名");
    const title = this.sanitizeName(details.title || "");
    const names = files.map((file) => file.n || file.name || file.file_name || "");
    const hasZh = names.some((name) => this.zhReg.test(name));
    const hasCrack = names.some((name) => this.crackReg.test(name));
    const hasLeak = names.some((name) => this.leakReg.test(name));
    // 无码标签仅由当前 JavDB 番号的页面属性决定，不能由资源文件名中的 -U、无码、破解等字样推断。
    const isUncensored = Boolean(details.isUncensored);
    const tags = [hasZh && "[中文]", hasCrack && "[破解]", hasLeak && "[流出]", isUncensored && "[无码]"].filter(Boolean).join("");
    // 标签统一位于番号和作品名之间，例如：LUXU-123 [中文][破解][流出][无码] 作品名。
    return [code, tags, title].filter(Boolean).join(" ");
  }

  static buildRenamedFiles(files = [], rename = "") {
    const sorted = [...files].sort((a, b) => String(a.n || "").localeCompare(String(b.n || "")));
    const names = new Map(sorted.map((file, index) => [
      String(file.fid),
      `${rename}${sorted.length > 1 ? `.${String(index + 1).padStart(2, "0")}` : ""}.${file.ico}`,
    ]));
    return files.map((file) => ({ ...file, n: names.get(String(file.fid)) || file.n }));
  }

  static buildPreview(details = {}, file = {}, mode = "rename") {
    const normalized = this.normalizeFile(file);
    const rename = this.buildRename(details, [normalized]);
    const lines = [];
    if (mode !== "rename") lines.push(this.formatHoverLine("目录", this.buildArchiveDir(details, mode).join("/")));
    lines.push(this.formatHoverLine("视频", `${rename}.${normalized.ico}`));
    if (mode !== "rename") lines.push("同目录字幕会一并移动并按相同规则命名");
    return lines.join("\n");
  }

  static renderItem(item, details = {}) {
    const file = this.normalizeFile(item);
    const path = this.formatDirectory(file);
    const members = this.getBundleMembers(item);
    const videoCount = Number(file.videoCount) || members.length;
    const displayName = file.isVrBundle && videoCount > 1 ? `${file.n} 等 ${videoCount} 个视频` : file.n;
    const tip = this.formatItemTip({ ...file, n: displayName, videoCount: file.isVrBundle ? videoCount : 0 }, path);
    const safeName = this.escapeHtml(displayName);
    const safePath = this.escapeHtml(path);
    const safeTip = this.escapeHtml(tip);
    const safeActorDir = this.escapeHtml(this.buildArchiveDir(details, "actor").join("/"));
    const safeCodeDir = this.escapeHtml(this.buildArchiveDir(details, "code").join("/"));
    const safeActorPreview = this.escapeHtml(this.buildPreview(details, file, "actor"));
    const safeCodePreview = this.escapeHtml(this.buildPreview(details, file, "code"));
    const safeRenamePreview = this.escapeHtml(this.buildPreview(details, file));
    const safeSubtitleFiles = this.escapeHtml(JSON.stringify(file.subtitleFiles || []));
    const safeMembers = this.escapeHtml(JSON.stringify(members));
    const coverClass = file.hasCover ? "is-success" : "is-info";
    const coverText = file.hasCover ? "已有封面" : "传封面";
    const coverDisabled = file.hasCover ? " disabled" : "";

    return `
      <div class="zymatch-item" data-fid="${this.escapeHtml(file.fid || "")}" data-cid="${this.escapeHtml(file.cid || "")}" data-vr-bundle="${file.isVrBundle ? "1" : "0"}" data-members="${safeMembers}" data-has-subtitle="${file.hasSubtitle ? "1" : "0"}" data-subtitle-files="${safeSubtitleFiles}">
        <a
          href="javascript:void(0);"
          class="x-match button is-small is-light"
          title="${safeTip}"
          data-pc="${this.escapeHtml(file.pc || "")}"
          data-cid="${this.escapeHtml(file.cid || "")}"
        >
          <span class="x-match-name">${safeName}</span>
          <span class="x-match-dir">${safePath}</span>
        </a>
        <div class="buttons">
          <div class="x-match-archive-dropdown">
            <button class="button is-small is-primary x-match-action x-match-archive-main" title="${safeActorPreview}" data-action="archive" data-archive-mode="actor" data-dir="${safeActorDir}" data-default-dir="${safeActorDir}" data-default-title="${safeActorPreview}" data-cid="${this.escapeHtml(file.cid || "")}" data-fid="${this.escapeHtml(file.fid || "")}" data-n="${this.escapeHtml(file.n)}">刮削归档</button>
            <button class="button is-small is-primary x-match-archive-toggle" type="button" aria-haspopup="true" aria-expanded="false" aria-label="选择归档方式">
              <svg class="x-match-archive-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <div class="x-match-archive-menu" role="menu">
              <button class="button is-small is-primary x-match-action x-match-archive-code" title="${safeCodePreview}" data-action="archive" data-archive-mode="code" data-dir="${safeCodeDir}" data-cid="${this.escapeHtml(file.cid || "")}" data-fid="${this.escapeHtml(file.fid || "")}" data-n="${this.escapeHtml(file.n)}">番号归档</button>
            </div>
          </div>
          <button class="button is-small is-link x-match-action" title="${safeRenamePreview}" data-action="rename" data-cid="${this.escapeHtml(file.cid || "")}" data-fid="${this.escapeHtml(file.fid || "")}" data-n="${this.escapeHtml(file.n)}">重命名</button>
          <button class="button is-small ${coverClass} x-match-action x-match-cover" data-action="cover" data-cid="${this.escapeHtml(file.cid || "")}" data-fid="${this.escapeHtml(file.fid || "")}" data-n="${this.escapeHtml(file.n)}"${coverDisabled}>${coverText}</button>
          <button class="button is-small is-danger is-light x-match-action" data-action="delv" data-cid="${this.escapeHtml(file.cid || "")}" data-fid="${this.escapeHtml(file.fid || "")}">删除文件</button>
          <button class="button is-small is-danger x-match-action" data-action="delf" data-cid="${this.escapeHtml(file.cid || "")}">删除文件夹</button>
        </div>
      </div>
    `;
  }

  static archiveMatched({ req115, queueOptions, ...args }) {
    return req115.queueMutation("归档", () => this.archiveMatchedNow({ req115, ...args }), queueOptions);
  }

  static async archiveMatchedNow({ req115, item, details, dir }) {
    const file = this.normalizeFile(item);
    const videos = this.getBundleMembers(item);
    const targetDir = (dir?.length ? dir : this.buildTargetDir(details)).map((part) => this.sanitizeName(part)).filter(Boolean);
    const targetCid = await req115.handleDir(targetDir);
    if (!targetCid) throw new Error("目标目录创建失败");

    const { data: sourceFiles = [] } = await req115.filesAll(file.cid);
    // Prefer the selected video's basename.  When an old actor directory uses
    // different release names, allow only subtitle/NFO attachments whose
    // filename still matches the current JavDB code.
    const files = [...videos, ...this.getBundleAttachments(sourceFiles, videos, details)];

    if (String(file.cid) !== String(targetCid)) {
      const moveRes = await req115.filesMove(files.map((it) => it.fid), targetCid);
      if (!moveRes || moveRes.state === false) throw this.requestError("文件移动失败", moveRes);
    }

    const rename = this.buildRename(details, files);
    const renamedFiles = this.buildRenamedFiles(files, rename);
    await req115.handleRename(files, targetCid, {
      rename,
      renameTxt: { zh: " [中文]", crack: "", no: ".${no}", sep: "-" },
      zh: false,
      crack: false,
    });

    // 仅把“*.cover.图片扩展名”视为已存在的封面；目标目录已有该封面时不再上传，避免重复封面文件。
    const targetRes = await req115.files(targetCid, { limit: 1150 }).catch(() => ({ data: [], path: [] }));
    const targetFiles = targetRes?.data || [];
    const targetPath = this.formatPathParts(targetRes?.path || []) || ["根目录", ...targetDir].join("/");
    let coverError = "";
    let hasCover = this.hasCoverFile(targetFiles);
    if (details.cover && !hasCover) {
      try {
        await this.uploadCoverNow({ req115, cid: targetCid, details, strict: Boolean(item.isVrBundle) });
        hasCover = true;
      } catch (err) {
        // Video archival has already completed.  Return this separately so
        // the caller can refresh its real location without pretending that
        // the cover was applied.
        if (item.isVrBundle) coverError = err?.message || "封面上传失败";
        else console.warn("[JavPackMatch115Console.handleCover]", err?.message);
      }
    }

    // Only remove the original directory after every selected file has been
    // moved and the destination work has completed.  A matched item may come
    // from a collection folder, so delete it only when the 115 listing
    // explicitly reports that no entries remain.
    if (String(file.cid) !== String(targetCid)) {
      const sourceRes = await req115.files(file.cid, { limit: 1 });
      const sourceCount = Number(sourceRes?.count);
      if (Number.isFinite(sourceCount) && sourceCount === 0) {
        const deleteRes = await req115.rbDelete([file.cid]);
        if (!deleteRes || deleteRes.state === false) throw this.requestError("源文件夹清理失败", deleteRes);
      }
    }

    // The destination listing is already available from the archive flow.
    // Keep an exact delta on the item so Quick View can update the parent card
    // without sending a second 115 search after it closes.
    item.archiveSync = {
      sourceCid: file.cid,
      cid: targetCid,
      realPath: targetPath,
      // The move/rename result is known locally.  Do not wait for the listing
      // index to catch up before synchronizing the small window and its card.
      files: renamedFiles,
      hasCover,
    };

    return item.isVrBundle ? { cid: targetCid, coverError } : targetCid;
  }

  static uploadCover({ req115, queueOptions, ...args }) {
    return req115.queueMutation("设置封面", () => this.uploadCoverNow({ req115, ...args }), queueOptions);
  }

  static async uploadCoverNow({ req115, cid, details, strict = false }) {
    if (!details.cover) throw new Error("未找到可用封面");
    const filename = this.getCoverFilename(details);
    const coverRes = await req115.handleCover(details.cover, cid, filename);
    const fileId = coverRes?.data?.file_id || coverRes?.data?.fileid || coverRes?.file_id || coverRes?.fileid;
    if (!fileId) throw new Error("封面上传失败");

    const editRes = await req115.filesEdit(cid, fileId);
    if (strict && editRes?.state === false) {
      throw new Error(editRes?.error_msg || editRes?.error || "115未能设置目录封面");
    }
    return fileId;
  }

  static renameMatched({ req115, queueOptions, ...args }) {
    return req115.queueMutation("重命名", () => this.renameMatchedNow({ req115, ...args }), queueOptions);
  }

  static async renameMatchedNow({ req115, item, details }) {
    const file = this.normalizeFile(item);
    const videos = this.getBundleMembers(item);
    const { data: srts = [] } = await req115.filesAllSRTs(file.cid).catch(() => ({ data: [] }));
    const subtitles = srts.filter((srt) => videos.some((video) => this.belongsToVideoSubtitleFile(video, srt, details)));
    const files = [...videos, ...subtitles.map((srt) => this.normalizeFile(srt))];
    const rename = this.buildRename(details, videos);

    await req115.handleRename(files, file.cid, {
      rename,
      renameTxt: { zh: " [中文]", crack: "", no: ".${no}", sep: "-" },
      zh: false,
      crack: false,
    });

    return { file, rename };
  }

  static deleteMatched({ req115, queueOptions, ...args }) {
    return req115.queueMutation(args.action === "delf" ? "删除文件夹" : "删除文件", () => this.deleteMatchedNow({ req115, ...args }), queueOptions);
  }

  static async deleteMatchedNow({ req115, item, action }) {
    const file = this.normalizeFile(item);
    const videos = this.getBundleMembers(item);
    return req115.rbDelete(action === "delf" ? [file.cid] : videos.map((video) => video.fid), file.cid);
  }

  static bindActions(root, options) {
    if (!root || root.dataset.matchConsoleBound === "1") return;
    root.dataset.matchConsoleBound = "1";

    root.addEventListener("click", async (e) => {
      const toggle = e.target.closest(".x-match-archive-toggle");
      if (toggle && root.contains(toggle)) {
        e.preventDefault();
        e.stopPropagation();
        const dropdown = toggle.closest(".x-match-archive-dropdown");
        const isActive = dropdown?.classList.toggle("is-active");
        toggle.setAttribute("aria-expanded", String(Boolean(isActive)));
        return;
      }

      const actionBtn = e.target.closest(".x-match-action");
      if (!actionBtn || !root.contains(actionBtn)) return;

      e.preventDefault();
      e.stopPropagation();

      const { req115 = window.Req115 || (typeof Req115 !== "undefined" ? Req115 : null), grant = window.Grant || (typeof Grant !== "undefined" ? Grant : null), details = {} } = options;
      if (!req115) return;
      const itemNode = actionBtn.closest(".zymatch-item");
      let members = [];
      try { members = JSON.parse(itemNode?.dataset.members || "[]"); } catch (_) {}
      const item = {
        fid: actionBtn.dataset.fid,
        cid: actionBtn.dataset.cid,
        n: actionBtn.dataset.n || itemNode?.querySelector(".x-match-name")?.textContent.trim(),
        isVrBundle: itemNode?.dataset.vrBundle === "1",
        members,
      };
      const action = actionBtn.dataset.action;
      const dropdown = actionBtn.closest(".x-match-archive-dropdown");
      const archiveMain = dropdown?.querySelector(".x-match-archive-main");

      // The code-mode action lives inside a menu that closes immediately. Promote
      // the selected mode to the visible split-button so its spinner remains
      // observable; the default actor mode is restored after the operation.
      if (action === "archive" && actionBtn.classList.contains("x-match-archive-code") && archiveMain) {
        ["archiveMode", "dir"].forEach((key) => {
          archiveMain.dataset[key] = actionBtn.dataset[key] || "";
        });
        archiveMain.title = actionBtn.title;
        archiveMain.textContent = "番号归档";
      }

      const btn = action === "archive" && archiveMain ? archiveMain : actionBtn;
      const busyTarget = action === "archive" && dropdown ? dropdown : btn;
      if (busyTarget.dataset.busy === "1") return;
      const oldText = btn.textContent;
      const restoreText = action === "rename" ? "重命名" : oldText;
      const useSpinner = action === "archive";

      dropdown?.classList.remove("is-active");
      dropdown?.querySelector(".x-match-archive-toggle")?.setAttribute("aria-expanded", "false");

      busyTarget.dataset.busy = "1";
      if (useSpinner) {
        btn.classList.add("is-loading");
        dropdown?.querySelectorAll(".x-match-archive-toggle, .x-match-archive-code").forEach((node) => node.setAttribute("disabled", ""));
      } else if (action === "rename") {
        // Rename updates the row in-place.  Keep its label stable so a later
        // render or a detached old button can never leave the visible control
        // showing a stale progress label.
        btn.style.opacity = "0.5";
      } else {
        btn.textContent = "执行中..";
        btn.style.opacity = "0.5";
      }

      const queueOptions = {
        onState: ({ state, queued }) => {
          btn.dataset.queueState = state;
          if (state === "queued") btn.textContent = `排队中${queued ? ` (${queued})` : ""}`;
          if (state === "running" && !useSpinner) btn.textContent = "执行中..";
        },
      };
      let archiveResult;
      try {
        if (action === "archive") {
          archiveResult = await this.archiveMatched({ req115, item, details, dir: btn.dataset.dir?.split("/"), queueOptions });
          const newCid = archiveResult?.cid || archiveResult;
          item.cid = newCid;
          const itemDom = btn.closest(".zymatch-item");
          itemDom?.querySelectorAll("[data-cid]").forEach((node) => {
            node.dataset.cid = String(newCid);
          });
          const dirNode = itemDom?.querySelector(".x-match-dir");
          if (dirNode && btn.dataset.dir) dirNode.textContent = btn.dataset.dir;
          const renamed = item.archiveSync?.files?.find((file) => String(file.fid) === String(item.fid));
          if (renamed?.n) {
            const nameNode = itemDom?.querySelector(".x-match-name");
            if (nameNode) nameNode.textContent = renamed.n;
            itemDom?.querySelectorAll("[data-n]").forEach((node) => { node.dataset.n = renamed.n; });
          }
          const matchNode = itemDom?.querySelector(".x-match");
          if (matchNode) {
            matchNode.title = this.formatItemTip(
              { ...item, ...renamed, cid: newCid },
              item.archiveSync?.realPath || dirNode?.textContent,
            );
          }
          const coverBtn = itemDom?.querySelector('.x-match-cover');
          if (coverBtn && item.archiveSync?.hasCover) {
            coverBtn.classList.remove("is-info");
            coverBtn.classList.add("is-success");
            coverBtn.textContent = "已有封面";
            coverBtn.setAttribute("disabled", "");
          }
          const cache = options.updateCache?.("archive", item, item.archiveSync);
          options.syncCache?.("archive", cache);
        } else if (action === "rename") {
          const { file, rename } = await this.renameMatched({ req115, item, details, queueOptions });
          const itemDom = btn.closest(".zymatch-item");
          const renamedVideo = `${rename}.${file.ico}`;
          const nameNode = itemDom?.querySelector(".x-match-name");
          if (nameNode) nameNode.textContent = renamedVideo;
          const dirNode = itemDom?.querySelector(".x-match-dir");
          if (dirNode) dirNode.textContent = this.replaceDirectoryTail(dirNode.textContent, rename);
          itemDom?.querySelectorAll("[data-n]").forEach((node) => {
            node.dataset.n = renamedVideo;
          });
          const matchNode = itemDom?.querySelector(".x-match");
          if (matchNode) matchNode.title = this.formatItemTip({ ...file, n: renamedVideo }, dirNode?.textContent);
          const cache = options.updateCache?.("rename", item, { rename, file });
          options.syncCache?.("rename", cache);
          grant?.notify?.({ status: "success", icon: "success", msg: "操作成功" });
          return;
        } else if (action === "cover") {
          await this.uploadCover({ req115, cid: item.cid, details, strict: item.isVrBundle, queueOptions });
          btn.classList.remove("is-info");
          btn.classList.add("is-success");
          btn.textContent = "已有封面";
          btn.setAttribute("disabled", "");
          const cache = options.updateCache?.("cover", item, { hasCover: true });
          options.syncCache?.("cover", cache);
        } else if (action === "delv" || action === "delf") {
          await this.deleteMatched({ req115, item, action, queueOptions });
          const cache = options.removeFromCache?.(item, action);
          // Detail views run in the quick-view iframe.  Send the exact
          // post-delete cache snapshot back to the source card instead of
          // waiting for a new 115 search (which can briefly return deleted
          // files while indexing catches up).
          options.syncCache?.("delete", cache);
          if (action === "delf") {
            // 删除文件夹会同时删除该目录下的所有匹配项；同步移除整组行，避免只消失当前行而显示旧结果。
            root.querySelectorAll(".zymatch-item").forEach((node) => {
              if (String(node.dataset.cid) === String(item.cid)) node.remove();
            });
          } else {
            btn.closest(".zymatch-item")?.remove();
          }
        }

        const archiveCoverError = action === "archive" ? archiveResult?.coverError : "";
        grant?.notify?.(archiveCoverError
          ? { status: "warn", icon: "warning", msg: `已归档，封面未上传：${archiveCoverError}` }
          : { status: "success", icon: "success", msg: "操作成功" });
        if (action === "delv" || action === "delf") {
          btn.textContent = "已删除";
          btn.setAttribute("disabled", "");
        }
      } catch (err) {
        grant?.notify?.({ status: "error", icon: "error", msg: err?.message || "操作失败" });
        btn.textContent = restoreText;
      } finally {
        if (useSpinner) {
          btn.classList.remove("is-loading");
          if (archiveMain) {
            archiveMain.dataset.archiveMode = "actor";
            archiveMain.dataset.dir = archiveMain.dataset.defaultDir || "";
            archiveMain.title = archiveMain.dataset.defaultTitle || "";
            archiveMain.textContent = "刮削归档";
            archiveMain.removeAttribute("disabled");
          }
          dropdown?.querySelectorAll(".x-match-archive-toggle, .x-match-archive-code").forEach((node) => node.removeAttribute("disabled"));
        }
        btn.style.opacity = "1";
        delete busyTarget.dataset.busy;
        delete btn.dataset.queueState;
        if (action === "rename") btn.textContent = restoreText;
      }
    }, true);
  }
};
