/**
 * @require JavPack.Req115.lib.js
 */
window.JavPackMatch115Console = class JavPackMatch115Console {
  static zhReg = /中字|字幕|\b(chs|cht|sub)\b|[-_]c(?=\.[a-z0-9]+$|$)/i;

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
    return files.some((file) => /cover/i.test(file?.n || "") && /\.(jpe?g|png|webp|gif)$/i.test(file?.n || ""));
  }

  static getCoverFilename(details = {}) {
    const code = this.sanitizeName(details.code || "cover") || "cover";
    return `${code}.cover.jpg`;
  }

  static async resolveMetadata(req115, cid) {
    if (!req115 || !cid) return "";
    const res = await req115.files(cid, { limit: 1150 });
    return {
      realPath: this.formatPathParts(res?.path || []),
      hasCover: this.hasCoverFile(res?.data || []),
    };
  }

  static async enrichMetadata(items = [], req115) {
    const cids = [...new Set(items.filter((item) => item?.cid && (!item.realPath || !item.paths?.length || item.hasCover === undefined)).map((item) => item.cid))];
    const entries = await Promise.all(cids.map(async (cid) => [cid, await this.resolveMetadata(req115, cid).catch(() => ({ realPath: "", hasCover: false }))]));
    const metadata = new Map(entries);

    for (const item of items) {
      const meta = metadata.get(item.cid);
      if (!meta) continue;
      if (meta.realPath && !item.realPath) item.realPath = meta.realPath;
      if (item.hasCover === undefined) item.hasCover = meta.hasCover;
    }

    return items;
  }

  static enrichDirectories(items = [], req115) {
    return this.enrichMetadata(items, req115);
  }

  static buildTargetDir(details = {}) {
    const prefix = this.sanitizeName(details.prefix || details.codeFirstLetter || "未分类");
    const title = this.sanitizeName([details.code, details.title].filter(Boolean).join(" "));
    return ["番号", prefix, title || this.sanitizeName(details.code || "未命名")];
  }

  static buildActorTargetDir(details = {}) {
    const actor = this.sanitizeName(details.actors?.[0] || "");
    // 一部影片没有演员资料，此时保留原有番号归档作为可靠的后备路径。
    return actor ? ["演员", actor] : this.buildTargetDir(details);
  }

  static buildArchiveDir(details = {}, mode = "actor") {
    return mode === "code" ? this.buildTargetDir(details) : this.buildActorTargetDir(details);
  }

  static buildRename(details = {}, files = []) {
    const title = this.sanitizeName([details.code, details.title].filter(Boolean).join(" "));
    const hasZh = files.some((file) => this.zhReg.test(file.n));
    return `${title || this.sanitizeName(details.code || "未命名")}${hasZh ? " [中文]" : ""}`;
  }

  static buildPreview(details = {}, file = {}, mode = "rename") {
    const normalized = this.normalizeFile(file);
    const rename = this.buildRename(details, [normalized]);
    const lines = [];
    if (mode !== "rename") lines.push(`目录：${this.buildArchiveDir(details, mode).join("/")}`);
    lines.push(`主文件：${rename}.${normalized.ico}`);
    if (mode !== "rename") lines.push("同目录字幕会一并移动并按相同规则命名");
    return lines.join("\n");
  }

  static renderItem(item, details = {}) {
    const file = this.normalizeFile(item);
    const path = this.formatDirectory(file);
    const tip = [file.n, file.s, path].filter(Boolean).join("\n");
    const safeName = this.escapeHtml(file.n);
    const safePath = this.escapeHtml(path);
    const safeTip = this.escapeHtml(tip);
    const safeActorDir = this.escapeHtml(this.buildArchiveDir(details, "actor").join("/"));
    const safeCodeDir = this.escapeHtml(this.buildArchiveDir(details, "code").join("/"));
    const safeActorPreview = this.escapeHtml(this.buildPreview(details, file, "actor"));
    const safeCodePreview = this.escapeHtml(this.buildPreview(details, file, "code"));
    const safeRenamePreview = this.escapeHtml(this.buildPreview(details, file));
    const coverClass = file.hasCover ? "is-success" : "is-info";
    const coverText = file.hasCover ? "已有封面" : "传封面";
    const coverDisabled = file.hasCover ? " disabled" : "";

    return `
      <div class="zymatch-item" data-fid="${this.escapeHtml(file.fid || "")}" data-cid="${this.escapeHtml(file.cid || "")}">
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

    const { data: srts = [] } = await req115.filesAllSRTs(file.cid);
    const files = [file, ...srts.map((srt) => this.normalizeFile(srt))];

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

    if (details.cover) await this.uploadCover({ req115, cid: targetCid, details }).catch((err) => console.warn("[JavPackMatch115Console.handleCover]", err?.message));

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
    return req115.handleRename([file], file.cid, {
      rename: this.buildRename(details, [file]),
      renameTxt: { zh: " [中文]", crack: "", no: ".${no}", sep: "-" },
      zh: false,
      crack: false,
    });
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
      const useSpinner = action === "archive";

      const dropdown = btn.closest(".x-match-archive-dropdown");
      dropdown?.classList.remove("is-active");
      dropdown?.querySelector(".x-match-archive-toggle")?.setAttribute("aria-expanded", "false");

      btn.dataset.busy = "1";
      if (useSpinner) {
        btn.classList.add("is-loading");
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
        } else if (action === "rename") {
          await this.renameMatched({ req115, item, details });
          const nameNode = btn.closest(".zymatch-item")?.querySelector(".x-match-name");
          if (nameNode) nameNode.textContent = this.buildRename(details, [item]);
        } else if (action === "cover") {
          await this.uploadCover({ req115, cid: item.cid, details });
          btn.classList.remove("is-info");
          btn.classList.add("is-success");
          btn.textContent = "已有封面";
          btn.setAttribute("disabled", "");
        } else if (action === "delv" || action === "delf") {
          await this.deleteMatched({ req115, item, action });
          options.removeFromCache?.(item, action);
          btn.closest(".zymatch-item")?.remove();
        }

        grant?.notify?.({ status: "success", icon: "success", msg: "操作成功" });
        if (action !== "cover") btn.textContent = action === "archive" ? "已归档" : action === "rename" ? "已重命名" : "已删除";
        btn.setAttribute("disabled", "");
      } catch (err) {
        grant?.notify?.({ status: "error", icon: "error", msg: err?.message || "操作失败" });
        btn.textContent = oldText;
      } finally {
        if (useSpinner) btn.classList.remove("is-loading");
        btn.style.opacity = "1";
        delete btn.dataset.busy;
      }
    }, true);
  }
};
