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
      const path = item.paths
        .map((part) => part?.name || part?.file_name || part?.n)
        .filter((name) => name && name !== "网盘" && name !== "115")
        .join("/");
      if (path) return path;
    }

    return item.t || item.pc || "目录未知";
  }

  static buildTargetDir(details = {}) {
    const prefix = this.sanitizeName(details.prefix || details.codeFirstLetter || "未分类");
    const title = this.sanitizeName([details.code, details.title].filter(Boolean).join(" "));
    return ["番号", prefix, title || this.sanitizeName(details.code || "未命名")];
  }

  static buildRename(details = {}, files = []) {
    const title = this.sanitizeName([details.code, details.title].filter(Boolean).join(" "));
    const hasZh = files.some((file) => this.zhReg.test(file.n));
    return `${title || this.sanitizeName(details.code || "未命名")}${hasZh ? " [中文]" : ""}`;
  }

  static renderItem(item, details = {}) {
    const file = this.normalizeFile(item);
    const path = this.formatDirectory(file);
    const targetDir = this.buildTargetDir(details).join("/");
    const tip = [file.n, file.s, path].filter(Boolean).join("\n");
    const safeName = this.escapeHtml(file.n);
    const safePath = this.escapeHtml(path);
    const safeTip = this.escapeHtml(tip);
    const safeDir = this.escapeHtml(targetDir);

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
          <button class="button is-small is-primary x-match-action" data-action="archive" data-dir="${safeDir}" data-cid="${this.escapeHtml(file.cid || "")}" data-fid="${this.escapeHtml(file.fid || "")}" data-n="${this.escapeHtml(file.n)}">刮削归档</button>
          <button class="button is-small is-link x-match-action" data-action="rename" data-cid="${this.escapeHtml(file.cid || "")}" data-fid="${this.escapeHtml(file.fid || "")}" data-n="${this.escapeHtml(file.n)}">重命名</button>
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

    if (details.cover) {
      try {
        const coverRes = await req115.handleCover(details.cover, targetCid, `${details.code || "cover"}.cover.jpg`);
        const fileId = coverRes?.data?.file_id || coverRes?.data?.fileid;
        if (fileId) await req115.filesEdit(targetCid, fileId);
      } catch (err) {
        console.warn("[JavPackMatch115Console.handleCover]", err?.message);
      }
    }

    return targetCid;
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

      btn.dataset.busy = "1";
      btn.classList.add("is-loading");

      try {
        if (action === "archive") {
          const newCid = await this.archiveMatched({ req115, item, details, dir: btn.dataset.dir?.split("/") });
          item.cid = newCid;
          btn.closest(".zymatch-item")?.querySelectorAll("[data-cid]").forEach((node) => {
            node.dataset.cid = String(newCid);
          });
        } else if (action === "rename") {
          await this.renameMatched({ req115, item, details });
        } else if (action === "delv" || action === "delf") {
          await this.deleteMatched({ req115, item, action });
          options.removeFromCache?.(item, action);
          btn.closest(".zymatch-item")?.remove();
        }

        grant?.notify?.({ status: "success", icon: "success", msg: "操作成功" });
        btn.textContent = action === "archive" ? "已归档" : action === "rename" ? "已重命名" : "已删除";
        btn.setAttribute("disabled", "");
        if (action !== "delv" && action !== "delf") options.refresh?.();
      } catch (err) {
        grant?.notify?.({ status: "error", icon: "error", msg: err?.message || "操作失败" });
        btn.textContent = oldText;
      } finally {
        btn.classList.remove("is-loading");
        delete btn.dataset.busy;
      }
    }, true);
  }
};
