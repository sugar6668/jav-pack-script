// ==UserScript==
// @name            JavDB.Reviews
// @namespace       JavDB.Reviews.local
// @version         0.0.2
// @author          ziyuxingyuan
// @description     JavDB短评完整显示，集成增强样式，客户端分页显示评论，点击翻页自动回顶部，自动重试+高性能签名缓存
// @match           https://javdb.com/v/*
// @match           https://javdb*.com/v/*
// @icon            https://javdb.com/favicon.ico
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/JavPack.Req.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/JavPack.ReqDB.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/JavPack.Util.lib.js
// @require         https://github.com/Tampermonkey/utils/raw/d8a4543a5f828dfa8eefb0a3360859b6fe9c3c34/requires/gh_2215_make_GM_xhr_more_parallel_again.js
// @connect         jdforrepam.com
// @connect         javdb.com
// @connect         javdb*.com
// @run-at          document-end
// @grant           GM_xmlhttpRequest
// @grant           GM_deleteValues
// @grant           GM_listValues
// @grant           unsafeWindow
// @grant           GM_getValue
// @grant           GM_setValue
// ==/UserScript==

(() => {
  'use strict';

  // === 配置区域 ===
  // 如果 API 域名变动，请同步修改这里和上面的 @connect
  const apiDomain = 'jdforrepam.com';

  // 客户端每页显示的评论数量
  const commentsPerPage = 50;

  // API 单页获取评论数量
  const apiPageLimit = 100;
  // === 配置区域结束 ===

  const SCRIPT_NAME = 'JavDB短评显示增强版';

  // 检查依赖库
  if (typeof Util === 'undefined' || !Util.upStore) {
    console.error(`${SCRIPT_NAME}: Util 未加载，请检查 JavPack.Util.lib.js 是否可访问`);
    return;
  }

  if (typeof ReqDB === 'undefined' || !ReqDB.signature) {
    console.error(`${SCRIPT_NAME}: ReqDB 未加载，请检查 JavPack.ReqDB.lib.js 是否可访问`);
    return;
  }

  Util.upStore();

  // 签名缓存优化
  const SIGN_CACHE = {
    lastTs: 0,
    signature: '',
    get() {
      const now = Math.floor(Date.now() / 1000);
      return now - this.lastTs <= 20 ? this.signature : null;
    },
    set(sign) {
      this.lastTs = Math.floor(Date.now() / 1000);
      this.signature = sign;
    },
  };

  const getOptimizedSignature = () => {
    const cachedSign = SIGN_CACHE.get();
    if (cachedSign) return cachedSign;

    try {
      const sign = ReqDB.signature();
      SIGN_CACHE.set(sign);
      return sign;
    } catch (error) {
      console.error(`${SCRIPT_NAME}: 获取签名失败`, error);
      return null;
    }
  };

  const escapeHTML = (value) => {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // 获取影片 ID：优先从当前地址获取，其次从短评 tab 的 data-url 获取，最后兼容 unsafeWindow.appData
  const mid =
    location.pathname.match(/\/v\/([^/?#]+)/)?.[1] ||
    document.querySelector('.review-tab[data-url]')?.dataset.url?.match(/\/v\/([^/]+)\//)?.[1] ||
    (typeof unsafeWindow?.appData === 'string' ? unsafeWindow.appData.split('/').at(-1) : '');

  if (!mid) {
    console.error(`${SCRIPT_NAME}: 未获取到影片ID`, {
      pathname: location.pathname,
      appData: unsafeWindow?.appData,
    });
    return;
  }

  // 获取页面上的关键 DOM 节点
  const tabsNode = document.querySelector('.tabs.no-bottom, .tabs');
  const magnetsNode = document.querySelector('#magnets');
  const reviewsNode = document.querySelector('#reviews');
  const listsNode = document.querySelector('#lists');
  const loadNode = document.querySelector('#tabs-container > article');

  if (!tabsNode) {
    console.error(`${SCRIPT_NAME}: 未找到 tabs 容器`);
    return;
  }

  if (!reviewsNode) {
    console.error(`${SCRIPT_NAME}: 未找到 #reviews 容器`);
    return;
  }

  // 分页和加载状态
  let allReviews = [];
  let currentApiPage = 1;
  let currentDisplayPage = 1;
  let retryCount = 0;
  const maxRetries = 60;
  let retryTimer = null;
  let lastRequestTime = 0;
  let isFetchingApi = false;
  let hasFetchedOnce = false;

  const renderCont = (insert) => {
    return `<article class="message video-panel"><div class="message-body">${insert}</div></article>`;
  };

  const renderReview = (review) => {
    if (!review) return '';

    const username = escapeHTML(review.username || '匿名用户');
    const content = escapeHTML(review.content || '无内容');
    const score = review.score ?? 0;
    const likesCount = review.likes_count ?? 0;
    const createdAt = review.created_at;

    let stars = '';
    const safeScore = Math.max(0, Math.min(5, Math.round(score)));

    for (let i = 0; i < safeScore; i++) {
      stars += '<i class="icon-star"></i>';
    }

    for (let i = safeScore; i < 5; i++) {
      stars += '<i class="icon-star gray"></i>';
    }

    let formattedTime = '未知时间';

    if (createdAt) {
      try {
        const date = new Date(createdAt);
        if (!Number.isNaN(date.getTime())) {
          formattedTime = String(createdAt)
            .replace('T', ' ')
            .replace('.000Z', '')
            .split('.')[0];
        } else {
          formattedTime = String(createdAt);
        }
      } catch (error) {
        console.error(`${SCRIPT_NAME}: 时间格式化错误`, error, createdAt);
        formattedTime = String(createdAt);
      }
    }

    return `
      <dt class="review-item">
        <div class="review-title">
          <div class="likes is-pulled-right">
            <button title="贊" class="button is-small is-info" disabled>
              <span class="label">贊</span>
              <span class="likes-count">${escapeHTML(likesCount)}</span>
            </button>
          </div>
          ${username}
          <span class="score-stars">${stars}</span>
          <span class="time">${escapeHTML(formattedTime)}</span>
        </div>
        <div class="content" style="white-space: pre-line">
          <p>${content}</p>
        </div>
      </dt>
    `;
  };

  const renderPaginationControls = (totalComments, currentPage, perPage, isApiLoading) => {
    if (totalComments === 0 && !isApiLoading) return '';

    const totalPages = Math.ceil(totalComments / perPage);

    if (totalPages <= 1 && !isApiLoading) return '';

    const prevDisabled = currentPage === 1 || isApiLoading ? 'is-disabled' : '';
    const nextDisabled = currentPage === totalPages || isApiLoading ? 'is-disabled' : '';

    let pageInfo = `第 ${currentPage} / ${totalPages} 页`;

    if (isApiLoading) {
      pageInfo = `已加载 ${totalComments} 条，加载中...`;
    } else if (totalPages > 0) {
      pageInfo = `第 ${currentPage} / ${totalPages} 页，共 ${totalComments} 条`;
    } else if (totalComments > 0 && totalPages === 0) {
      pageInfo = `共 ${totalComments} 条`;
    }

    return `
      <div class="pagination-controls" style="display: flex; justify-content: center; align-items: center; margin-top: 1em;">
        <button class="button pagination-button" data-action="prev" ${prevDisabled}>上一页</button>
        <span style="margin: 0 1em;">${pageInfo}</span>
        <button class="button pagination-button" data-action="next" ${nextDisabled}>下一页</button>
      </div>
    `;
  };

  const displayCurrentPageReviews = () => {
    const startIndex = (currentDisplayPage - 1) * commentsPerPage;
    const endIndex = startIndex + commentsPerPage;
    const commentsToDisplay = allReviews.slice(startIndex, endIndex);

    let domStr = '';

    if (allReviews.length > 0) {
      domStr = `<dl class="review-items">${commentsToDisplay.map(renderReview).join('')}</dl>`;
    } else if (!isFetchingApi) {
      domStr = '暂无数据';
    }

    reviewsNode.innerHTML = renderCont(
      domStr +
        renderPaginationControls(
          allReviews.length,
          currentDisplayPage,
          commentsPerPage,
          isFetchingApi,
        ),
    );

    const paginationControls = reviewsNode.querySelector('.pagination-controls');
    if (paginationControls) {
      paginationControls.addEventListener('click', handlePaginationClick);
    }

    console.log(
      `${SCRIPT_NAME}: 显示客户端第 ${currentDisplayPage} 页评论，当前页 ${commentsToDisplay.length} 条，API加载状态: ${
        isFetchingApi ? '进行中' : '完成'
      }，共 ${allReviews.length} 条评论。`,
    );
  };

  const scrollToReviewsTop = () => {
    requestAnimationFrame(() => {
      reviewsNode.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const handlePaginationClick = (event) => {
    const target = event.target.closest('.pagination-button');
    if (!target || target.classList.contains('is-disabled') || isFetchingApi) return;

    const action = target.dataset.action;
    const totalPages = Math.ceil(allReviews.length / commentsPerPage);

    if (action === 'prev' && currentDisplayPage > 1) {
      currentDisplayPage--;
      displayCurrentPageReviews();
      scrollToReviewsTop();
    } else if (action === 'next' && currentDisplayPage < totalPages) {
      currentDisplayPage++;
      displayCurrentPageReviews();
      scrollToReviewsTop();
    }
  };

  const finishFetchingApi = () => {
    isFetchingApi = false;
    hasFetchedOnce = true;

    if (loadNode) {
      loadNode.style.setProperty('display', 'none');
    }

    if (allReviews.length === 0) {
      reviewsNode.innerHTML = renderCont('暂无数据');
      console.log(`${SCRIPT_NAME}: API加载完成，无评论数据。`);
      return;
    }

    console.log(`${SCRIPT_NAME}: API加载完成，共获取 ${allReviews.length} 条评论。`);

    currentDisplayPage = 1;
    displayCurrentPageReviews();
  };

  const processApiPage = (reviews, pageFetched) => {
    if (reviews && reviews.length > 0) {
      allReviews = allReviews.concat(reviews);
      currentApiPage++;
      retryCount = 0;

      reviewsNode.innerHTML = renderCont(
        `正在加载短评... 已加载 ${allReviews.length} 条，API页 ${pageFetched}`,
      );

      fetchReviews(currentApiPage);
    } else {
      finishFetchingApi();
    }
  };

  const handleError = (msg, error, pageWithError) => {
    console.error(`${SCRIPT_NAME}错误，API页 ${pageWithError}: ${msg}`, error);

    if (msg.includes('签名获取失败') || msg.includes('ReqDB 未加载')) {
      reviewsNode.innerHTML = renderCont(`加载失败：${escapeHTML(msg)}，请刷新页面`);
      if (loadNode) {
        loadNode.style.setProperty('display', 'none');
      }
      isFetchingApi = false;
      if (retryTimer) clearTimeout(retryTimer);
      return;
    }

    if (retryCount >= maxRetries) {
      reviewsNode.innerHTML = renderCont(
        `加载部分完成，已加载 ${allReviews.length} 条，API页 ${pageWithError} 加载失败：${escapeHTML(
          msg,
        )}，请刷新页面重试`,
      );

      if (loadNode) {
        loadNode.style.setProperty('display', 'none');
      }

      isFetchingApi = false;
      hasFetchedOnce = true;

      if (retryTimer) clearTimeout(retryTimer);

      if (allReviews.length > 0) {
        currentDisplayPage = Math.max(1, Math.ceil(allReviews.length / commentsPerPage));
        displayCurrentPageReviews();

        const existingContent = reviewsNode.querySelector('.message-body');
        if (existingContent) {
          existingContent.innerHTML += `<p style="color: red; margin-top: 1em;">API加载未完成，部分数据获取失败：${escapeHTML(
            msg,
          )}</p>`;
        }
      } else {
        reviewsNode.innerHTML = renderCont(`加载失败：${escapeHTML(msg)}，请刷新页面重试`);
      }

      return;
    }

    retryCount++;
    const delay = Math.min(1500 * Math.pow(1.5, retryCount - 1), 15000);

    reviewsNode.innerHTML = renderCont(
      `正在加载短评... 已加载 ${allReviews.length} 条。API页 ${pageWithError} ${escapeHTML(
        msg,
      )}，${Math.ceil(delay / 1000)}秒后重试 (${retryCount}/${maxRetries})`,
    );

    retryTimer = setTimeout(() => fetchReviews(pageWithError), delay);
  };

  const fetchReviews = (pageToFetch) => {
    const now = Date.now();

    if (now - lastRequestTime < 300) {
      setTimeout(() => fetchReviews(pageToFetch), 300 - (now - lastRequestTime));
      return;
    }

    lastRequestTime = now;
    isFetchingApi = true;

    if (typeof ReqDB === 'undefined' || !ReqDB.signature) {
      handleError('ReqDB 未加载，无法生成签名', null, pageToFetch);
      return;
    }

    const signature = getOptimizedSignature();

    if (!signature) {
      handleError('签名获取失败', null, pageToFetch);
      return;
    }

    const apiUrl = `https://${apiDomain}/api/v1/movies/${mid}/reviews`;

    const params = {
      sort_by: 'hotly',
      page: pageToFetch,
      limit: apiPageLimit,
    };

    GM_xmlhttpRequest({
      url: `${apiUrl}?${new URLSearchParams(params).toString()}`,
      method: 'GET',
      headers: {
        jdSignature: signature,
      },
      timeout: 8000,

      onload(response) {
        if (response.status === 200) {
          try {
            const data = JSON.parse(response.responseText);
            processApiPage(data?.data?.reviews ?? [], pageToFetch);
          } catch (error) {
            handleError('数据解析失败', error, pageToFetch);
          }
        } else {
          handleError(`API请求失败: HTTP ${response.status}`, null, pageToFetch);
        }
      },

      onerror(error) {
        handleError('网络请求错误', error, pageToFetch);
      },

      ontimeout() {
        handleError('请求超时', null, pageToFetch);
      },
    });
  };

  const showReviews = () => {
    if (magnetsNode) {
      magnetsNode.style.display = 'none';
    }

    if (listsNode) {
      listsNode.style.display = 'none';
    }

    reviewsNode.style.display = 'block';

    if (isFetchingApi) {
      console.log(`${SCRIPT_NAME}: 正在进行API加载，跳过重复触发。`);
      return;
    }

    if (hasFetchedOnce || allReviews.length > 0) {
      console.log(`${SCRIPT_NAME}: 已加载过短评，直接显示客户端第 ${currentDisplayPage} 页。`);
      displayCurrentPageReviews();
      return;
    }

    allReviews = [];
    currentApiPage = 1;
    currentDisplayPage = 1;
    retryCount = 0;
    isFetchingApi = true;

    reviewsNode.innerHTML = '';

    if (loadNode) {
      loadNode.style.display = 'block';
    }

    reviewsNode.innerHTML = renderCont('正在加载短评...');

    console.log(`${SCRIPT_NAME}: 开始API分页加载短评... movieId=${mid}`);
    fetchReviews(currentApiPage);
  };

  const activateReviewTab = (target) => {
    const activeTab = tabsNode.querySelector('li.is-active');

    if (activeTab && activeTab !== target) {
      activeTab.classList.remove('is-active');
    }

    if (target) {
      target.classList.add('is-active');
    }
  };

  const onclick = (event) => {
    const target = event.target.closest('li[data-movie-tab-target]');
    if (!target) return;

    const { dataset } = target;

    // 当前 JavDB 短评 tab 是 review，不是 reviewTab
    if (dataset.movieTabTarget !== 'review') return;

    event.preventDefault();
    event.stopPropagation();

    // 即使当前短评 tab 已经是 active，也允许执行增强渲染
    activateReviewTab(target);
    showReviews();
  };

  tabsNode.addEventListener('click', onclick, true);

  // 页面默认已经在短评 tab 时，自动执行一次增强渲染
  const activeReviewTab = tabsNode.querySelector('li.is-active[data-movie-tab-target="review"]');

  if (activeReviewTab) {
    console.log(`${SCRIPT_NAME}: 检测到页面默认处于短评 Tab，自动执行增强渲染。`);
    showReviews();
  }

  // 兼容：如果不是默认短评 tab，但评论区域已经显示，也自动执行一次
  if (!activeReviewTab && getComputedStyle(reviewsNode).display !== 'none') {
    console.log(`${SCRIPT_NAME}: 检测到 #reviews 已显示，自动执行增强渲染。`);
    showReviews();
  }
})();