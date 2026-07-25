// ==UserScript==
// @name            JavDB.magnet
// @namespace       JavDB.magnet@blc
// @version         0.0.5
// @author          blc
// @description     磁链扩展
// @match           https://javdb.com/v/*
// @icon            https://javdb.com/favicon.ico
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Magnet.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Req.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.ReqMagnet.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Util.lib.js
// @connect         btdig.com
// @connect         nyaa.si
// @connect         u9a9.com
// @connect         whatslink.info
// @run-at          document-end
// @grant           GM_xmlhttpRequest
// @grant           GM_deleteValues
// @grant           GM_listValues
// @grant           unsafeWindow
// @grant           GM_getValue
// @grant           GM_setValue
// @grant           GM_info
// @require         https://github.com/Tampermonkey/utils/raw/d8a4543a5f828dfa8eefb0a3360859b6fe9c3c34/requires/gh_2215_make_GM_xhr_more_parallel_again.js
// ==/UserScript==

Util.upStore();

(function () {
  const mid = unsafeWindow.appData?.split("/").at(-1);
  if (!mid) return;

  const transByte = Magnet.useTransByte();
  const HD_SIZE = Number.parseFloat(transByte("2GB"));
  const MIN_SIZE = Number.parseFloat(transByte("250MB"));

  const UNC = document.querySelector(".title.is-4").textContent.includes("無碼");
  const CONT = document.querySelector("#magnets-content");

  const WHATS_LINK_API = "https://whatslink.info/api/v1/link";

  const getScreenshots = (data) => {
    const screenshots = Array.isArray(data?.screenshots) ? data.screenshots : [];
    return screenshots
      .map((item) => (typeof item === "string" ? item : item?.screenshot ?? item?.url ?? item?.src ?? item?.image))
      .filter(Boolean);
  };

  const showPreview = ({ screenshots, name, size, count }) => {
    let index = 0;
    const modal = document.createElement("div");
    modal.className = "x-magnet-preview-modal";
    modal.innerHTML = `
      <section class="x-magnet-preview-dialog" role="dialog" aria-modal="true" aria-label="磁力预览">
        <button class="x-magnet-preview-close" type="button" aria-label="关闭">&times;</button>
        <button class="x-magnet-preview-nav x-magnet-preview-prev" type="button" aria-label="上一张">&lsaquo;</button>
        <figure class="x-magnet-preview-stage">
          <img class="x-magnet-preview-image" alt="" />
          <figcaption class="x-magnet-preview-caption"></figcaption>
        </figure>
        <div class="x-magnet-preview-thumbs" aria-label="preview thumbnails"></div>
        <button class="x-magnet-preview-nav x-magnet-preview-next" type="button" aria-label="下一张">&rsaquo;</button>
        <footer class="x-magnet-preview-footer"><a href="https://whatslink.info/" target="_blank" rel="noreferrer">预览信息由 whatslink.info 提供</a></footer>
      </section>`;

    const image = modal.querySelector(".x-magnet-preview-image");
    const caption = modal.querySelector(".x-magnet-preview-caption");
    const prev = modal.querySelector(".x-magnet-preview-prev");
    const next = modal.querySelector(".x-magnet-preview-next");
    const thumbs = modal.querySelector(".x-magnet-preview-thumbs");
    let wheelAt = 0;

    const close = () => {
      document.removeEventListener("keydown", onKeydown);
      modal.remove();
    };
    const render = () => {
      image.src = screenshots[index];
      image.alt = name || "磁力预览";
      caption.textContent = `${name || "磁力预览"}${size ? ` · ${size}` : ""}${count ? ` · ${count} 个文件` : ""} · ${index + 1} / ${screenshots.length}`;
      prev.hidden = next.hidden = screenshots.length < 2;
      const adjacent = screenshots[(index + 1) % screenshots.length];
      if (adjacent) new Image().src = adjacent;
    };
    const move = (step) => {
      index = (index + step + screenshots.length) % screenshots.length;
      render();
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    };

    screenshots.forEach((src, thumbIndex) => {
      const thumb = document.createElement("button");
      thumb.className = "x-magnet-preview-thumb";
      thumb.type = "button";
      thumb.setAttribute("aria-label", `preview ${thumbIndex + 1}`);
      const thumbImage = new Image();
      thumbImage.src = src;
      thumbImage.alt = "";
      thumb.append(thumbImage);
      thumb.addEventListener("click", () => {
        index = thumbIndex;
        render();
      });
      thumbs.append(thumb);
    });

    modal.querySelector(".x-magnet-preview-close").addEventListener("click", close);
    prev.addEventListener("click", () => move(-1));
    next.addEventListener("click", () => move(1));
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
    modal.addEventListener("wheel", (event) => {
      if (screenshots.length < 2) return;
      event.preventDefault();
      const now = Date.now();
      if (now - wheelAt < 180) return;
      wheelAt = now;
      move(event.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    document.addEventListener("keydown", onKeydown);
    document.body.append(modal);
    render();
  };

  const previewMagnet = async (button) => {
    const url = button.closest(".item")?.querySelector(".magnet-name a")?.href;
    if (!url) return;

    button.classList.add("is-loading");
    button.setAttribute("disabled", "");
    try {
      const data = await Req.request({ url: WHATS_LINK_API, params: { url }, responseType: "json" });
      const screenshots = getScreenshots(data);
      if (!screenshots.length) throw new Error("暂无可用预览图");
      showPreview({ screenshots, name: data.name, size: data.size, count: data.count });
    } catch (err) {
      Util.print(err?.message || "磁力预览加载失败");
    } finally {
      button.classList.remove("is-loading");
      button.removeAttribute("disabled");
    }
  };

  const getMagnets = () => {
    return [...CONT.querySelectorAll(".item.columns")]
      .map((node) => {
        const meta = (node.querySelector(".meta")?.textContent.trim() ?? "").split(",");
        return {
          url: node.querySelector(".magnet-name a")?.href,
          name: node.querySelector(".name")?.textContent.trim() ?? "",
          size: meta[0].replace(/\s/g, ""),
          files: meta?.[1]?.replace("個文件", "").trim() ?? "",
          zh: !!node.querySelector(".tags .is-warning"),
          date: node.querySelector(".time")?.textContent.trim() ?? "",
        };
      })
      .filter(({ url }) => url);
  };

  const renderMagnet = ({ url, name, meta, zh, crack, hd, date, type }, idx) => {
    return `
    <div class="item columns is-desktop${(idx + 1) % 2 !== 0 ? " odd" : ""}">
      <div class="magnet-name column is-four-fifths">
        <a href="${url}">
          <span class="name" title="${name}">${name}</span><br />
          <span class="meta">${meta}</span><br />
          <div class="tags">
            ${zh ? "<span class='tag is-warning is-small is-light'>字幕</span>" : ""}
            ${crack ? "<span class='tag is-info is-small is-light'>破解</span>" : ""}
            ${hd ? "<span class='tag is-primary is-small is-light'>高清</span>" : ""}
            ${type === "ed2k" ? "<span class='tag is-small is-light x-magnet-type'>ed2k</span>" : ""}
          </div>
        </a>
      </div>
      <div class="buttons column">
        <button class="button is-small x-magnet-preview" type="button">\u78c1\u529b\u9884\u89c8</button>
        <button class="button is-info is-small copy-to-clipboard" data-clipboard-text="${url}" type="button">
          复制
        </button>
        <a class="button is-info is-small" href="https://keepshare.org/aa36p03v/${url}" target="_blank">下载</a>
      </div>
      <div class="date column"><span class="time">${date}</span></div>
    </div>
    `;
  };

  CONT.addEventListener("click", (event) => {
    const button = event.target.closest(".x-magnet-preview");
    if (!button) return;
    event.preventDefault();
    previewMagnet(button);
  });

  const filterMin = (item) => !item.min;

  const parseSize = ({ size, files, ...item }) => {
    const meta = [];
    if (size) meta.push(size);
    if (files) meta.push(`${files}个文件`);

    size = transByte(size);
    const magnetSize = Number.parseFloat(size);
    const hd = magnetSize >= HD_SIZE;
    const min = hd ? false : magnetSize > 0 && magnetSize <= MIN_SIZE;
    return { ...item, meta: meta.join(", "), size, hd, min };
  };

  const mergeMagnet = (target, source) => {
    ["name", "size", "files", "zh", "crack", "date"].forEach((key) => {
      if (!target[key] && source[key]) target[key] = source[key];
    });
    return target;
  };

  const reduceMagnet = (acc, cur) => {
    const index = acc.findIndex(({ url }) => url === cur.url);
    return index === -1 ? acc.concat(cur) : acc.toSpliced(index, 1, mergeMagnet(acc[index], cur));
  };

  const parseName = ({ url, name, zh, ...item }) => {
    url = url.split("&")[0].toLowerCase();
    if (!zh) zh = Magnet.zhReg.test(name);
    const crack = UNC ? false : Magnet.crackReg.test(name);
    return { ...item, url, name, zh, crack };
  };

  const setMagnets = (details) => {
    CONT.innerHTML
      = Object.values(details)
        .flat()
        .map(parseName)
        .reduce(reduceMagnet, [])
        .map(parseSize)
        .filter(filterMin)
        .toSorted(Magnet.magnetSort)
        .map(renderMagnet)
        .join("") || "暂无数据";

    Util.dispatchEvent();
  };

  const setHeader = (code) => {
    const countCls = "x-magnet";

    const btdig = `https://btdig.com/search?order=0&q=${code}`;
    const nyaa = `https://sukebei.nyaa.si/?f=0&c=2_2&q=${code}`;
    const u9a9 = `https://u9a9.com/?type=2&search=${code}`;
    const iconStr = "<span class='icon is-small'><i class='icon-check-circle'></i></span>";

    CONT.insertAdjacentHTML(
      "beforebegin",
      `<div class="tags mb-1">
        <a class="tag" href="${btdig}" target="_blank">${iconStr}<span>BTDigg</span></a>
        <a class="tag" href="${nyaa}" target="_blank">${iconStr}<span>Sukebei</span></a>
        <a class="tag" href="${u9a9}" target="_blank">${iconStr}<span>U9A9</span></a>
        <span class="tag">${iconStr}<span>筛选过滤</span></span>
        <span class="tag">${iconStr}<span>综合排序</span></span>
        <span class="tag is-flex-grow-1 is-justify-content-end">总数&nbsp;<span class="${countCls}">
          ${CONT.childElementCount}
        </span></span>
      </div>`,
    );

    const countNode = CONT.previousElementSibling.querySelector(`.${countCls}`);

    window.addEventListener(GM_info.script.name, () => {
      countNode.textContent = CONT.childElementCount;
    });
  };

  const setRefreshButton = (onclick) => {
    const tabsNode = document.querySelector(".tabs.no-bottom");
    if (!tabsNode || tabsNode.querySelector("[data-refresh-magnets]")) return;

    tabsNode.insertAdjacentHTML(
      "beforeend",
      `<div class="buttons mb-0 ml-2">
        <button class="button is-info is-small" type="button" data-refresh-magnets>刷新磁力</button>
      </div>`,
    );

    tabsNode.querySelector("[data-refresh-magnets]")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onclick(e.currentTarget);
    });
  };

  const code = document.querySelector(".first-block .value").textContent.trim();
  const codeDetails = Util.codeParse(code);
  setHeader(code);

  const details = GM_getValue(mid, {});
  const reviewEd2k = JSON.parse(CONT.dataset.reviewEd2k || "[]");
  if (reviewEd2k.length) details.reviewEd2k = reviewEd2k;
  if (Object.keys(details).length) setMagnets(details);

  const setDetails = (sources, key) => {
    details[key] = sources;
    GM_setValue(mid, details);
    setMagnets(details);
  };

  window.addEventListener("JavDB.reviewEd2k", ({ detail: sources }) => {
    details.reviewEd2k = Array.isArray(sources) ? sources : [];
    GM_setValue(mid, details);
    setMagnets(details);
  });

  const refreshMagnets = async (trigger) => {
    trigger?.classList.add("is-loading");
    trigger?.setAttribute("disabled", "");

    try {
      details.origin = getMagnets();
      details.btdig = await ReqMagnet.btdig(codeDetails);
      details.nyaa = await ReqMagnet.nyaa(codeDetails);
      details.u9a9 = await ReqMagnet.u9a9(codeDetails);
      GM_setValue(mid, details);
      setMagnets(details);
    } catch (err) {
      Util.print(err?.message);
    } finally {
      trigger?.classList.remove("is-loading");
      trigger?.removeAttribute("disabled");
    }
  };

  setRefreshButton(refreshMagnets);

  if (!details.origin) setDetails(getMagnets(), "origin");
  if (!details.btdig) ReqMagnet.btdig(codeDetails).then((sources) => setDetails(sources, "btdig"));
  if (!details.nyaa) ReqMagnet.nyaa(codeDetails).then((sources) => setDetails(sources, "nyaa"));
  if (!details.u9a9) ReqMagnet.u9a9(codeDetails).then((sources) => setDetails(sources, "u9a9"));
})();
