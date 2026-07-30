/**
 * @require JavPack.Req115.lib.js
 */
window.JavPackMatch115Console = class JavPackMatch115Console {
  static zhReg = /中文|中字|字幕|\[[a-z]?hdc[a-z]?\]|[-_\s]+(uc|c|ch|cu|zh)(?![a-z])/i;

  static subtitleFileReg = /\.(srt|ass|ssa|vtt|sub)$/i;
  static subtitleDetectionVersion = 2;
  static archiveAttachmentFileReg = /\.(srt|ass|ssa|vtt|sub|nfo)$/i;
  static crackReg = /无码破解|無碼破解|流出|破解|解密版|uncensored|restored|破[\u4E00-\u9FC6]版|[-_\s]+(cu|u|uc)(?![a-z])/i;

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
      file.s && `大小：${file.s}`,
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

  static async enrichMetadata(items = [], req115, details = {}) {
    const cids = [...new Set(items
      .filter((item) => item?.cid && (!item.realPath || !item.paths?.length || item.hasCover === undefined || item.subtitleDetectionVersion !== this.subtitleDetectionVersion))
      .map((item) => item.cid))];
    const entries = await Promise.all(cids.map(async (cid) => [cid, await this.resolveMetadata(req115, cid).catch(() => ({ realPath: "", hasCover: false, subtitleFiles: [] }))]));
    const metadata = new Map(entries);

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
    const hasZh = files.some((file) => this.zhReg.test(file.n));
    const hasCrack = files.some((file) => this.crackReg.test(file.n));
    // 无码标签仅由当前 JavDB 番号的页面属性决定，不能由资源文件名中的 -U、无码、破解等字样推断。
    const isUncensored = Boolean(details.isUncensored);
    const tags = [hasZh && "[中文]", hasCrack && "[破解]", isUncensored && "[无码]"].filter(Boolean).join("");
    // 标签统一位于番号和作品名之间，例如：LUXU-123 [中文][破解][无码] 作品名。
    return [code, tags, title].filter(Boolean).join(" ");
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
    const tip = this.formatItemTip(file, path);
    const safeName = this.escapeHtml(file.n);
    const safePath = this.escapeHtml(path);
    const safeTip = this.escapeHtml(tip);
    const safeActorDir = this.escapeHtml(this.buildArchiveDir(details, "actor").join("/"));
    const safeCodeDir = this.escapeHtml(this.buildArchiveDir(details, "code").join("/"));
    const safeActorPreview = this.escapeHtml(this.buildPreview(details, file, "actor"));
    const safeCodePreview = this.escapeHtml(this.buildPreview(details, file, "code"));
    const safeRenamePreview = this.escapeHtml(this.buildPreview(details, file));
    const safeSubtitleFiles = this.escapeHtml(JSON.stringify(file.subtitleFiles || []));
    const coverClass = file.hasCover ? "is-success" : "is-info";
    const coverText = file.hasCover ? "已有封面" : "传封面";
    const coverDisabled = file.hasCover ? " disabled" : "";

    return `
      <div class="zymatch-item" data-fid="${this.escapeHtml(file.fid || "")}" data-cid="${this.escapeHtml(file.cid || "")}" data-has-subtitle="${file.hasSubtitle ? "1" : "0"}" data-subtitle-files="${safeSubtitleFiles}">
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
            <button class="button is-small is-primary x-match-action x-match-archive-main" title="${safeActorPreview}" data-action="archive" data-archive-mode="actor" data-dir="${safeActorDir}" data-cid="${this.escapeHtml(file.cid || "")}" data-fid="${this.escapeHtml(file.fid || "")}" data-n="${this.escapeHtml(file.n)}">刮削归档</button>
            <button class="button is-small is-primary x-match-archive-toggle" type="button" aria-haspopup="true" aria-expanded="false" aria-label="选择归档方式">
              <svg class="x-match-archive-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <div class="x-match-archive-menu" role="menu">
              <button class="button is-small is-primary x-match-action x-match-archive-code" title="${safeCodePreview}" data-action="archive" data-archive-mode="code" data-dir="${safeCodeDir}" data-cid="${this.escapeHtml(file.cid || "")}" data-fid="${this.escapeHtml(file.fid || "")}" data-n="${this.escapeHtml(file.n)}">按番号归档</button>
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

  static async archiveMatched({ req115, item, details, dir }) {
    const file = this.normalizeFile(item);
    const targetDir = (dir?.length ? dir : this.buildTargetDir(details)).map((part) => this.sanitizeName(part)).filter(Boolean);
    const targetCid = await req115.handleDir(targetDir);
    if (!targetCid) throw new Error("目标目录创建失败");

    const { data: sourceFiles = [] } = await req115.filesAll(file.cid);
    // Prefer the selected video's basename.  When an old actor directory uses
    // different release names, allow only subtitle/NFO attachments whose
    // filename still matches the current JavDB code.
    const files = [file, ...this.getArchiveBundleFiles(sourceFiles, file, details)];

    if (String(file.cid) !== String(targetCid)) {
      const moveRes = await req115.filesMove(files.map((it) => it.fid), targetCid);
      if (!moveRes || moveRes.state === false) throw new Error("文件移动失败");
    }

    await req115.handleRename(files, targetCid, {
      rename: this.buildRename(details, files),
      renameTxt: { zh: " [中文]", crack: "", no: ".${no}", sep: "-" },
      zh: false,
      crack: false,
    });

    // 仅把“*.cover.图片扩展名”视为已存在的封面；目标目录已有该封面时不再上传，避免重复封面文件。
    const { data: targetFiles = [] } = await req115.files(targetCid, { limit: 1150 }).catch(() => ({ data: [] }));
    if (details.cover && !this.hasCoverFile(targetFiles)) {
      await this.uploadCover({ req115, cid: targetCid, details }).catch((err) => console.warn("[JavPackMatch115Console.handleCover]", err?.message));
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
        if (!deleteRes || deleteRes.state === false) throw new Error("源文件夹清理失败");
      }
    }

    return targetCid;
  }

  static async uploadCover({ req115, cid, details }) {
    if (!details.cover) throw new Error("未找到可用封面");
    const coverRes = await req115.handleCover(details.cover, cid, this.getCoverFilename(details));
    const fileId = coverRes?.data?.file_id || coverRes?.data?.fileid || coverRes?.file_id || coverRes?.fileid;
    if (!fileId) throw new Error("封面上传失败");
    await req115.filesEdit(cid, fileId);
    return fileId;
  }

  static async renameMatched({ req115, item, details }) {
    const file = this.normalizeFile(item);
    const { data: srts = [] } = await req115.filesAllSRTs(file.cid).catch(() => ({ data: [] }));
    const subtitles = srts.filter((srt) => this.belongsToVideoSubtitle(file, srt));
    const files = [file, ...subtitles.map((srt) => this.normalizeFile(srt))];
    const rename = this.buildRename(details, [file]);

    await req115.handleRename(files, file.cid, {
      rename,
      renameTxt: { zh: " [中文]", crack: "", no: ".${no}", sep: "-" },
      zh: false,
      crack: false,
    });

    return { file, rename };
  }

  static async deleteMatched({ req115, item, action }) {
    const file = this.normalizeFile(item);
    return req115.rbDelete(action === "delf" ? [file.cid] : [file.fid], file.cid);
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

      const btn = e.target.closest(".x-match-action");
      if (!btn || !root.contains(btn)) return;

      e.preventDefault();
      e.stopPropagation();
      if (btn.dataset.busy === "1") return;

      const { req115 = window.Req115 || (typeof Req115 !== "undefined" ? Req115 : null), grant = window.Grant || (typeof Grant !== "undefined" ? Grant : null), details = {} } = options;
      if (!req115) return;
      const item = {
        fid: btn.dataset.fid,
        cid: btn.dataset.cid,
        n: btn.dataset.n || btn.closest(".zymatch-item")?.querySelector(".x-match-name")?.textContent.trim(),
      };
      const action = btn.dataset.action;
      const oldText = btn.textContent;
      const restoreText = action === "rename" ? "重命名" : oldText;
      const useSpinner = action === "archive";

      const dropdown = btn.closest(".x-match-archive-dropdown");
      dropdown?.classList.remove("is-active");
      dropdown?.querySelector(".x-match-archive-toggle")?.setAttribute("aria-expanded", "false");

      btn.dataset.busy = "1";
      if (useSpinner) {
        btn.classList.add("is-loading");
      } else if (action === "rename") {
        // Rename updates the row in-place.  Keep its label stable so a later
        // render or a detached old button can never leave the visible control
        // showing a stale progress label.
        btn.style.opacity = "0.5";
      } else {
        btn.textContent = "执行中..";
        btn.style.opacity = "0.5";
      }

      try {
        if (action === "archive") {
          const newCid = await this.archiveMatched({ req115, item, details, dir: btn.dataset.dir?.split("/") });
          item.cid = newCid;
          const itemDom = btn.closest(".zymatch-item");
          itemDom?.querySelectorAll("[data-cid]").forEach((node) => {
            node.dataset.cid = String(newCid);
          });
          const dirNode = itemDom?.querySelector(".x-match-dir");
          if (dirNode && btn.dataset.dir) dirNode.textContent = btn.dataset.dir;
          const coverBtn = itemDom?.querySelector('.x-match-cover');
          if (coverBtn && details.cover) {
            coverBtn.classList.remove("is-info");
            coverBtn.classList.add("is-success");
            coverBtn.textContent = "已有封面";
            coverBtn.setAttribute("disabled", "");
          }
          // 归档改变了文件夹和文件名；旧匹配缓存会让页面刷新后仍显示归档前的信息。
          options.invalidateCache?.();
          await options.refresh?.().catch((err) => console.warn("[JavPackMatch115Console.refresh]", err?.message));
        } else if (action === "rename") {
          const { file, rename } = await this.renameMatched({ req115, item, details });
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
          options.invalidateCache?.();
          await options.refresh?.().catch((err) => console.warn("[JavPackMatch115Console.refresh]", err?.message));
          grant?.notify?.({ status: "success", icon: "success", msg: "操作成功" });
          return;
        } else if (action === "cover") {
          await this.uploadCover({ req115, cid: item.cid, details });
          btn.classList.remove("is-info");
          btn.classList.add("is-success");
          btn.textContent = "已有封面";
          btn.setAttribute("disabled", "");
        } else if (action === "delv" || action === "delf") {
          await this.deleteMatched({ req115, item, action });
          const cache = options.removeFromCache?.(item, action);
          // Detail views run in the quick-view iframe.  Send the exact
          // post-delete cache snapshot back to the source card instead of
          // waiting for a new 115 search (which can briefly return deleted
          // files while indexing catches up).
          options.syncCache?.(cache);
          if (action === "delf") {
            // 删除文件夹会同时删除该目录下的所有匹配项；同步移除整组行，避免只消失当前行而显示旧结果。
            root.querySelectorAll(".zymatch-item").forEach((node) => {
              if (String(node.dataset.cid) === String(item.cid)) node.remove();
            });
          } else {
            btn.closest(".zymatch-item")?.remove();
          }
        }

        grant?.notify?.({ status: "success", icon: "success", msg: "操作成功" });
        if (action === "archive") {
          btn.textContent = "已归档";
          btn.setAttribute("disabled", "");
        } else if (action === "delv" || action === "delf") {
          btn.textContent = "已删除";
          btn.setAttribute("disabled", "");
        }
      } catch (err) {
        grant?.notify?.({ status: "error", icon: "error", msg: err?.message || "操作失败" });
        btn.textContent = restoreText;
      } finally {
        if (useSpinner) btn.classList.remove("is-loading");
        btn.style.opacity = "1";
        delete btn.dataset.busy;
        if (action === "rename") btn.textContent = restoreText;
      }
    }, true);
  }
};
