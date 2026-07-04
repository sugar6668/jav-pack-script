window.JavPackQuickView = class JavPackQuickView {
  static CARD_SELECTOR = '.movie-list .item:not([data-qv-processed="1"])';
  static DETAIL_LINK_SELECTOR = 'a[href*="/v/"]';
  static OVERLAY_ID = "javdb-quick-view-modal";
  static prefetched = new Set();

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
    if (existed) existed.remove();

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

    const closeModal = () => {
      overlay.remove();
      document.body.style.overflow = originalOverflow;
      window.dispatchEvent(new CustomEvent("JavDB_QuickView_Closed", { detail: { card: sourceCard } }));
    };

    closeBtn.onclick = closeModal;
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeModal();
    });

    iframe.addEventListener("load", () => {
      this.injectIframeStyle(iframe);
      this.injectIframeFancyboxGuard(iframe);
      loading.remove();
    });

    modal.append(iframe);
    overlay.append(loading, modal, closeBtn);
    document.body.appendChild(overlay);
  }


  injectIframeFancyboxGuard(iframe) {
    try {
      const iWin = iframe.contentWindow;
      const iDoc = iframe.contentDocument || iWin.document;
      if (!iDoc || iDoc.documentElement.dataset.qvFancyboxGuard === "1") return;
      iDoc.documentElement.dataset.qvFancyboxGuard = "1";

      const closeFancybox = () => {
        const jq = iWin.jQuery || iWin.$;
        if (jq?.fancybox?.close) return jq.fancybox.close();
        if (iWin.Fancybox?.close) return iWin.Fancybox.close();

        iDoc.querySelectorAll(".fancybox-container").forEach((node) => node.remove());
        iDoc.documentElement.classList.remove("fancybox-enabled", "fancybox-active");
        iDoc.body?.classList.remove("fancybox-active", "compensate-for-scrollbar");
      };

      const guard = (event) => {
        const container = event.target?.closest?.(".fancybox-container");
        if (!container) return;
        const interactive = event.target.closest(".fancybox-content, .fancybox-button, .fancybox-navigation");
        if (interactive) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type === "click") closeFancybox();
      };

      iDoc.addEventListener("pointerdown", guard, true);
      iDoc.addEventListener("click", guard, true);
    } catch (err) {
      console.warn("[JavPackQuickView]", err?.message);
    }
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
