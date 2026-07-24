/**
 * @name JavPack Quick View Library
 * @description JavDB 瀑布流卡片的小窗 iframe 预览与关闭回调模块。
 */
window.JavPackQuickView = class JavPackQuickView {
  static CARD_SELECTOR = '.movie-list .item:not([data-qv-processed="1"])';
  static DETAIL_LINK_SELECTOR = 'a[href*="/v/"]';
  static OVERLAY_ID = "javdb-quick-view-modal";
  static prefetched = new Set();

  constructor({ onClose } = {}) {
    this.onClose = onClose;
    this.closeActive = null;
  }

  ensureButtons(doc = document) {
    if (window.self !== window.top) return;

    const cards = doc.querySelectorAll(this.constructor.CARD_SELECTOR);
    cards.forEach((card) => {
      card.dataset.qvProcessed = "1";

      const link = card.querySelector(this.constructor.DETAIL_LINK_SELECTOR);
      const cover = card.querySelector(".cover");
      if (!link || !cover) return;

      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "button is-small x-un-hover is-link x-qv-button";
      btn.textContent = "小窗预览";
      btn.title = "小窗预览";
      btn.onpointerenter = () => this.prefetch(link.href, doc);
      btn.onfocus = () => this.prefetch(link.href, doc);
      btn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openIframeModal(link.href, card);
      };

      cover.appendChild(btn);
    });
  }

  prefetch(url, doc = document) {
    if (!url || this.constructor.prefetched.has(url)) return;

    this.constructor.prefetched.add(url);
    const link = doc.createElement("link");
    link.rel = "prefetch";
    link.as = "document";
    link.href = url;
    link.dataset.qvPrefetch = url;
    doc.head?.appendChild(link);
  }

  openIframeModal(url, sourceCard) {
    const existed = document.getElementById(this.constructor.OVERLAY_ID);
    // Closing a previous preview through the same path matters: its source
    // card may have changed in the iframe and must receive its refresh hook.
    if (existed) this.closeActive?.("replace");
    else existed?.remove();

    const originalOverflow = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";

    const overlay = document.createElement("div");
    overlay.id = this.constructor.OVERLAY_ID;
    overlay.className = "x-qv-overlay";

    const loading = document.createElement("div");
    loading.className = "x-qv-loading";
    loading.textContent = "正在加载详情页...";

    const modal = document.createElement("div");
    modal.className = "x-qv-modal is-ready";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "x-qv-close";
    closeBtn.setAttribute("aria-label", "close");
    closeBtn.title = "关闭";

    const iframe = document.createElement("iframe");
    iframe.className = "x-qv-iframe";
    iframe.loading = "eager";
    iframe.setAttribute("fetchpriority", "high");
    iframe.src = url;

    let closed = false;
    const closeModal = (reason = "close") => {
      if (closed) return;
      closed = true;
      overlay.remove();
      document.body.style.overflow = originalOverflow;
      this.closeActive = null;
      const detail = { card: sourceCard, reason };
      // Invoke the owner callback directly.  CustomEvent delivery across
      // userscript sandboxes is not reliable enough to be the only close hook.
      this.onClose?.(detail);
      window.dispatchEvent(new CustomEvent("JavDB_QuickView_Closed", { detail }));
    };
    this.closeActive = closeModal;

    closeBtn.onclick = closeModal;
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeModal();
    });

    iframe.addEventListener("load", () => {
      this.injectIframeStyle(iframe);
      loading.remove();
    });

    modal.append(iframe);
    overlay.append(loading, modal, closeBtn);
    document.body.appendChild(overlay);
  }

  injectIframeStyle(iframe) {
    try {
      const iDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iDoc?.head || iDoc.getElementById("x-qv-iframe-style")) return;

      const style = iDoc.createElement("style");
      style.id = "x-qv-iframe-style";
      style.textContent = `
        html { overflow-y: auto !important; }
        body { padding-top: 0 !important; }
        .navbar, .footer, #footer, .app-desktop-banner, #search-bar-container, .sub-header { display: none !important; }
        .section { padding-top: 1rem !important; }
        .section > .container { width: 96% !important; max-width: none !important; }
        .video-detail { margin-top: 0 !important; }
      `;
      iDoc.head.appendChild(style);
    } catch (err) {
      console.warn("[JavPackQuickView]", err?.message);
    }
  }
};
