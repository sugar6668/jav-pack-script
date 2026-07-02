/**
 * @name JavPack Subtitle Library
 * @description Xunlei subtitle search, preview, download, and 115 upload for JavDB.
 */
window.JavPackSubtitle = class JavPackSubtitle {
  static BTN_ID = "x-subtitle-search-btn";

  static MODAL_ID = "x-subtitle-modal";

  static previewCache = new Map();

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

  static isSubtitleFile(file = {}) {
    return /\.(srt|ass|ssa|vtt|sub)$/i.test(file.n || "");
  }

  static buildDefaultKeyword(details = {}) {
    return this.sanitizeName(details.code || "") || this.sanitizeName([details.code, details.title].filter(Boolean).join(" ")) || document.title;
  }

  static buildSearchKeywords(details = {}) {
    return [this.buildDefaultKeyword(details)].filter(Boolean);
  }

  static buildSubtitleBaseName(details = {}) {
    if (window.JavPackMatch115Console?.buildRename) {
      return window.JavPackMatch115Console.buildRename(details, [{ n: `${details.code || "subtitle"}.mp4` }]);
    }
    return this.sanitizeName([details.code, details.title].filter(Boolean).join(" ")) || this.buildDefaultKeyword(details);
  }

  static buildSubtitleFilename(details = {}, item = {}) {
    const ext = this.sanitizeName(item.ext || "srt").replace(/^\.+/, "") || "srt";
    return `${this.buildSubtitleBaseName(details)}.${ext}`;
  }

  static clearPreviewCache() {
    this.previewCache.clear();
  }

  static async checkSubInCloud(req115, cid) {
    if (!req115 || !cid) return false;
    const res = await req115.filesAll(cid);
    return (res?.data || []).some((file) => this.isSubtitleFile(file));
  }

  static getReq115() {
    return typeof Req115 !== "undefined" ? Req115 : window.Req115;
  }

  static getGrant() {
    return typeof Grant !== "undefined" ? Grant : window.Grant;
  }

  static getTargetCid() {
    return document.querySelector(".x-match-cont .zymatch-item [data-cid]")?.dataset.cid
      || document.querySelector(".x-match-cont .zymatch-item")?.dataset.cid
      || "";
  }

  static ensureDetailButton({ details, getTargetCid } = {}) {
    const panel = document.querySelector(".movie-panel-info");
    const buttons = panel?.querySelector(".panel-block:last-child .buttons");
    if (!buttons || document.getElementById(this.BTN_ID)) return;

    const btn = document.createElement("button");
    btn.id = this.BTN_ID;
    btn.type = "button";
    btn.className = "button is-small is-info x-subtitle-search";
    btn.textContent = "字幕搜索";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openSearchModal({ details, getTargetCid });
    });
    buttons.appendChild(btn);

    const req115 = this.getReq115();
    const cid = getTargetCid?.() || this.getTargetCid();
    if (req115 && cid) {
      this.checkSubInCloud(req115, cid).then((hasSub) => {
        if (!hasSub) return;
        btn.textContent = "已有字幕";
        btn.classList.remove("is-info");
        btn.classList.add("is-success");
      }).catch(() => {});
    }
  }

  static modalTemplate(defaultKw) {
    return `
      <div class="pdb-sub-modal">
        <div class="pdb-sub-header">
          <div class="pdb-sub-search-wrap">
            <span class="pdb-sub-title">迅雷字幕检索:</span>
            <input type="text" id="sub-search-input" value="${this.escapeHtml(defaultKw)}" class="pdb-sub-input" placeholder="输入检索词..." />
            <button id="sub-search-btn" class="pdb-sub-btn">重新搜索</button>
          </div>
          <span class="pdb-sub-close" id="sub-close-btn">&times;</span>
        </div>
        <div class="pdb-sub-body">
          <div class="pdb-sub-content"></div>
          <div class="pdb-sub-preview-wrap">
            <div class="pdb-sub-preview-header">
              <span>字幕内容预览</span><span id="preview-status" class="pdb-sub-preview-status">暂无预览</span>
            </div>
            <textarea class="pdb-sub-textarea" readonly></textarea>
          </div>
        </div>
      </div>
    `;
  }

  static openSearchModal({ details = {}, getTargetCid } = {}) {
    const defaultKw = this.buildDefaultKeyword(details);
    this.currentDetails = details;
    document.getElementById(this.MODAL_ID)?.remove();

    const overlay = document.createElement("div");
    overlay.id = this.MODAL_ID;
    overlay.className = "pdb-sub-overlay";
    overlay.innerHTML = this.modalTemplate(defaultKw);
    document.body.appendChild(overlay);

    const contentWrap = overlay.querySelector(".pdb-sub-content");
    const previewBox = overlay.querySelector(".pdb-sub-textarea");
    const statusNode = overlay.querySelector("#preview-status");
    const input = overlay.querySelector("#sub-search-input");

    const closeModal = () => {
      this.clearPreviewCache();
      previewBox.value = "";
      overlay.remove();
    };

    overlay.querySelector("#sub-close-btn").addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });

    const performSearch = (kw) => {
      if (!kw) return;
      contentWrap.innerHTML = '<div class="pdb-sub-msg">正在连接迅雷字幕接口，请稍候...</div>';
      previewBox.value = "";
      statusNode.textContent = "暂无预览";

      GM_xmlhttpRequest({
        method: "GET",
        url: `https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=${encodeURIComponent(kw)}`,
        onload: (res) => {
          try {
            const root = JSON.parse(res.responseText);
            if (root.code !== 0 || !root.data?.length) {
              contentWrap.innerHTML = '<div class="pdb-sub-msg">未找到相关字幕，请尝试删减搜索词</div>';
              return;
            }
            this.renderTable({ container: contentWrap, dataList: this.sortResults(root.data, kw, details), previewBox, statusNode, overlay, details, getTargetCid, kw });
          } catch (err) {
            contentWrap.innerHTML = '<div class="pdb-sub-msg pdb-sub-error">API 数据解析失败</div>';
          }
        },
        onerror: () => {
          contentWrap.innerHTML = '<div class="pdb-sub-msg pdb-sub-error">请求失败，请检查网络设置</div>';
        },
      });
    };

    overlay.querySelector("#sub-search-btn").addEventListener("click", () => performSearch(input.value.trim()));
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") performSearch(input.value.trim());
    });
    performSearch(defaultKw);
  }

  static sortResults(dataList, kw = "", details = {}) {
    const kwClean = kw.toLowerCase().replace(/[-_.\s]/g, "");
    const tokens = kw.toLowerCase().split(/[-_.\s]+/).filter((word) => word.length > 1);
    const codeClean = String(details.code || kw).toLowerCase().replace(/[-_.\s]/g, "");
    return [...dataList].sort((a, b) => this.scoreResult(b, kwClean, tokens, codeClean) - this.scoreResult(a, kwClean, tokens, codeClean));
  }

  static scoreResult(item, kwClean, tokens, codeClean = "") {
    const name = (item.name || item.extra_name || "").toLowerCase();
    const compactName = name.replace(/[-_.\s]/g, "");
    const lang = ((item.languages && item.languages[0]) || "").toLowerCase();
    let score = 0;
    if (codeClean && compactName.includes(codeClean)) score += 800;
    tokens.forEach((token) => {
      if (name.includes(token)) score += 50;
    });
    if (kwClean && compactName.includes(kwClean)) score += 500;
    if (/(zh|cn|chs|cht|chinese)/i.test(lang) || /(zh|cn|chs|cht|chinese)/i.test(name)) score += 100;
    if (item.ext === "srt" || item.ext === "ass") score += 20;
    return score;
  }

  static renderTable({ container, dataList, previewBox, statusNode, overlay, details, getTargetCid, kw = "" }) {
    const words = kw.split(/[-_.\s]+/).filter((word) => word.length > 1);
    const highlightRegex = words.length ? new RegExp(`(${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi") : null;

    container.innerHTML = `
      <table class="pdb-sub-table">
        <thead>
          <tr>
            <th class="pdb-sub-th">原始字幕名称</th>
            <th class="pdb-sub-th" style="width: 80px;">语言</th>
            <th class="pdb-sub-th" style="width: 60px;">格式</th>
            <th class="pdb-sub-th" style="width: 170px; text-align:center;">操作</th>
          </tr>
        </thead>
        <tbody>
          ${dataList.map((item, index) => this.renderRow(item, index, highlightRegex)).join("")}
        </tbody>
      </table>
    `;

    container.querySelectorAll(".sub-action-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.handleAction({ btn, item: dataList[btn.dataset.idx], previewBox, statusNode, overlay, details, getTargetCid }));
    });
  }

  static renderRow(item, index, highlightRegex) {
    const lang = item.languages?.[0] || "未知";
    const name = item.name || item.extra_name || "未知字幕";
    const displayName = highlightRegex ? this.escapeHtml(name).replace(highlightRegex, '<span style="color:#e74c3c; font-weight:bold;">$1</span>') : this.escapeHtml(name);
    return `
      <tr class="pdb-sub-tr">
        <td class="pdb-sub-td">${displayName}</td>
        <td class="pdb-sub-td-lang">${this.escapeHtml(lang)}</td>
        <td class="pdb-sub-td-ext">${this.escapeHtml(item.ext || "srt")}</td>
        <td class="pdb-sub-td-actions">
          <button class="sub-action-btn pdb-sub-action-btn pdb-sub-btn-preview" data-action="preview" data-idx="${index}">预览</button>
          <button class="sub-action-btn pdb-sub-action-btn pdb-sub-btn-download" data-action="download" data-idx="${index}">下载</button>
          <button class="sub-action-btn pdb-sub-action-btn pdb-sub-btn-upload" data-action="upload" data-idx="${index}">115直传</button>
        </td>
      </tr>
    `;
  }

  static async handleAction({ btn, item, previewBox, statusNode, overlay, details, getTargetCid }) {
    const action = btn.dataset.action;
    const oldText = btn.textContent;
    const url = item.url;
    if (!url) return alert("无效的字幕下载直链");

    const filename = this.buildSubtitleFilename(details, item);
    btn.textContent = "获取中...";
    btn.style.opacity = "0.6";

    try {
      const buffer = await this.fetchBinaryCached(url);
      const text = this.decodeSubtitle(buffer);
      if (text.includes("<?xml") && text.includes("<Code>NoSuchKey</Code>")) throw new Error("该字幕在迅雷云端已失效丢失 (NoSuchKey)");

      if (action === "preview") {
        previewBox.value = text;
        statusNode.textContent = filename;
      } else if (action === "download") {
        this.downloadBuffer(buffer, filename);
      } else if (action === "upload") {
        const cid = getTargetCid?.() || this.getTargetCid();
        const req115 = this.getReq115();
        if (!cid || !req115) throw new Error("未检测到 115 目标目录，请先等待匹配完成");
        btn.textContent = "直传中...";
        await this.uploadSubtitle({ req115, cid, filename, buffer });
        this.getGrant()?.notify?.({ icon: "success", msg: "字幕已上传到 115" });
        document.getElementById(this.BTN_ID)?.classList.add("is-success");
        document.getElementById(this.BTN_ID).textContent = "已有字幕";
        overlay.remove();
        this.clearPreviewCache();
      }
    } catch (err) {
      alert(`执行中止: ${err.message}`);
    } finally {
      btn.textContent = oldText;
      btn.style.opacity = "1";
    }
  }

  static decodeSubtitle(buffer) {
    let text = new TextDecoder("utf-8").decode(buffer);
    if ((text.match(/\uFFFD/g) || []).length > 3) text = new TextDecoder("gbk").decode(buffer);
    return text;
  }

  static fetchBinaryCached(url) {
    if (this.previewCache.has(url)) return Promise.resolve(this.previewCache.get(url));
    return this.fetchBinary(url).then((buffer) => {
      this.previewCache.set(url, buffer);
      return buffer;
    });
  }

  static fetchBinary(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        responseType: "arraybuffer",
        onload: (res) => {
          if (res.status === 200 && res.response) resolve(res.response);
          else reject(new Error(`字幕流获取失败，HTTP_CODE: ${res.status}`));
        },
        onerror: () => reject(new Error("跨域网络请求被阻断")),
      });
    });
  }

  static downloadBuffer(buffer, filename) {
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  static async uploadSubtitle({ req115, cid, filename, buffer }) {
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    const file = new File([blob], filename, { type: "application/octet-stream" });
    const initRes = await req115.sampleInitUpload({ filename, filesize: file.size, cid });
    if (!initRes || (!initRes.host && initRes.status !== 2 && initRes.statuscode !== 0)) {
      throw new Error(initRes?.error_msg || "获取115上传安全凭证被拦截");
    }
    if (!initRes.host) return initRes;

    let uploadRes = null;
    for (let retry = 0; retry < 3; retry++) {
      uploadRes = await req115.upload({ ...initRes, filename, file });
      if (uploadRes && uploadRes.state !== false) return uploadRes;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error(uploadRes?.error_msg || uploadRes?.error || "115 服务器拒绝接收回调");
  }
};
