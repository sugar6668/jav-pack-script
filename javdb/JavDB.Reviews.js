// ==UserScript==
// @name            JavDB.Reviews
// @namespace       JavDB.Reviews.local
// @version         0.0.1
// @author          ziyuxingyuan
// @description     JavDB短评完整显示，集成增强样式，客户端分页显示评论，点击翻页自动回顶部，自动重试+高性能签名缓存
// @match           https://javdb.com/v/*
// @icon            https://javdb.com/favicon.ico
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Req.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.ReqDB.lib.js
// @require         https://raw.githubusercontent.com/sugar6668/jav-pack-script/refs/heads/main/libs/JavPack.Util.lib.js
// @connect         jdforrepam.com // <--- 如果API域名变动，这里也需要手动修改!
// @connect         javdb.com
// @run-at          document-end
// @grant           GM_xmlhttpRequest
// @grant           GM_deleteValues
// @grant           GM_listValues
// @grant           unsafeWindow
// @grant           GM_getValue
// @grant           GM_setValue
// @require         https://github.com/Tampermonkey/utils/raw/d8a4543a5f828dfa8eefb0a3360859b6fe9c3c34/requires/gh_2215_make_GM_xhr_more_parallel_again.js
// ==/UserScript==

// === 配置区域 ===
// API域名，如果jdforrepam.com变动，请修改此处
const apiDomain = 'jdforrepam.com';
// 客户端每页显示的评论数量
const commentsPerPage = 50;
// API单页获取评论数量 (用于一次API请求尽量多获取数据)
const apiPageLimit = 100; // 沿用之前设置的100
// === 配置区域结束 ===

Util.upStore(); // 确保 JavPack 库的存储机制正常工作

(function () {
  // 签名缓存优化
  const SIGN_CACHE = {
    lastTs: 0,
    signature: '',
    get() {
      const now = Math.floor(Date.now() / 1000);
      return (now - this.lastTs <= 20) ? this.signature : null;
    },
    set(sign) {
      this.lastTs = Math.floor(Date.now() / 1000);
      this.signature = sign;
    }
  };

  // 高性能签名获取
  const getOptimizedSignature = () => {
    const cachedSign = SIGN_CACHE.get();
    if (cachedSign) return cachedSign;
    const sign = ReqDB.signature();
    SIGN_CACHE.set(sign);
    return sign;
  };

  // 获取影片ID
  const mid = unsafeWindow.appData?.split("/").at(-1);
  if (!mid) return;

  // 获取页面上的关键DOM节点
  const tabsNode = document.querySelector(".tabs.no-bottom");
  const magnetsNode = document.querySelector("#magnets");
  const reviewsNode = document.querySelector("#reviews");
  const listsNode = document.querySelector("#lists");
  const loadNode = document.querySelector("#tabs-container > article");

  // 分页和加载状态
  let allReviews = []; // 存储所有页获取到的评论 (API加载完成后包含所有数据)
  let currentApiPage = 1; // 当前正在请求的API页码 (从1开始)
  let currentDisplayPage = 1; // 当前正在显示的客户端页码 (从1开始)
  let retryCount = 0; // 当前API页的重试计数
  const maxRetries = 60; // 最大API请求重试次数
  let retryTimer = null; // 重试定时器
  let lastRequestTime = 0; // 上次请求时间，用于控制请求频率
  let isFetchingApi = false; // 标记是否正在进行API加载

  // 渲染容器
  const renderCont = (insert) => {
    return `<article class="message video-panel"><div class="message-body">${insert}</div></article>`;
  };

  // 渲染单个评论
  const renderReview = (review) => {
      if (!review) return '';

      const username = review.username || '匿名用户';
      const content = review.content || '无内容';
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
             if (!isNaN(date.getTime())) {
                formattedTime = createdAt.replace("T", " ").replace(".000Z", "").split('.')[0];
             } else {
                formattedTime = createdAt;
             }
          } catch (e) {
              console.error("时间格式化错误:", e, "原始时间:", createdAt);
              formattedTime = createdAt;
          }
      }

      return `<dt class="review-item">
                  <div class="review-title">
                      <div class="likes is-pulled-right">
                          <button title="贊" class="button is-small is-info" disabled>
                              <span class="label">贊</span>
                              <span class="likes-count">${likesCount}</span>
                          </button>
                      </div>
                      ${username}
                      <span class="score-stars">${stars}</span>
                      <span class="time">${formattedTime}</span>
                  </div>
                  <div class="content" style="white-space: pre-line"> <p>${content}</p> </div>
              </dt>`;
  };

  // 渲染分页导航按钮
  const renderPaginationControls = (totalComments, currentPage, commentsPerPage, isApiLoading) => {
      if (totalComments === 0 && !isApiLoading) return ''; // 没有评论且API加载完成才不显示分页

      const totalPages = Math.ceil(totalComments / commentsPerPage);
      // 只有一页或没有评论 (但可能还在加载) 时不显示分页
      if (totalPages <= 1 && !isApiLoading) return '';


      const prevDisabled = currentPage === 1 || isApiLoading ? 'is-disabled' : '';
      const nextDisabled = currentPage === totalPages || isApiLoading ? 'is-disabled' : '';

      // 页面信息显示
      let pageInfo = `第 ${currentPage} / ${totalPages} 页`;
      if (isApiLoading) {
          pageInfo = `已加载 ${totalComments} 条 (加载中...)`; // API加载中只显示已加载数量
      } else if (totalPages > 0) {
           pageInfo = `第 ${currentPage} / ${totalPages} 页 (共 ${totalComments} 条)`;
      } else if (totalComments > 0 && totalPages === 0) { // 理论上不会发生，除非 commentsPerPage 是 Infinity 或负数
             pageInfo = `共 ${totalComments} 条`;
      }


      // 使用flex布局让按钮居中
      return `
          <div class="pagination-controls" style="display: flex; justify-content: center; align-items: center; margin-top: 1em;">
              <button class="button pagination-button" data-action="prev" ${prevDisabled}>上一页</button>
              <span style="margin: 0 1em;">${pageInfo}</span>
              <button class="button pagination-button" data-action="next" ${nextDisabled}>下一页</button>
          </div>
      `;
  };

  // 处理分页按钮点击事件
  const handlePaginationClick = (event) => {
      const target = event.target.closest('.pagination-button');
      if (!target || target.classList.contains('is-disabled') || isFetchingApi) return; // 如果正在请求API，禁用点击

      const action = target.dataset.action;
      const totalPages = Math.ceil(allReviews.length / commentsPerPage); // 总页数基于已加载评论数

      if (action === 'prev' && currentDisplayPage > 1) {
          currentDisplayPage--;
          displayCurrentPageReviews(); // 显示上一页内容
      } else if (action === 'next' && currentDisplayPage < totalPages) {
          currentDisplayPage++;
          displayCurrentPageReviews(); // 显示下一页内容
      }
      // 注意：在这个版本（1.5改），点击下一页不会触发新的API请求，只会内部翻页
  };

  // 显示当前客户端页码的评论
  const displayCurrentPageReviews = () => {
      const startIndex = (currentDisplayPage - 1) * commentsPerPage;
      const endIndex = startIndex + commentsPerPage;
      const commentsToDisplay = allReviews.slice(startIndex, endIndex);

      let domStr = ""; // 初始化为空字符串

      if (allReviews.length > 0) { // 只要总评论数大于0，就显示评论列表容器
          domStr = `<dl class="review-items">${commentsToDisplay.map(renderReview).join("")}</dl>`;
      } else if (!isFetchingApi) { // 如果没有加载到任何评论，且API加载已完成
           domStr = "暂无数据";
      }
      // 如果正在加载中，domStr保持为空，加载提示会显示在容器里


      // 渲染评论列表和分页导航
      reviewsNode.innerHTML = renderCont(domStr + renderPaginationControls(allReviews.length, currentDisplayPage, commentsPerPage, isFetchingApi));

      // 重新绑定分页按钮事件监听 (innerHTML会清除之前的监听器)
      const paginationControls = reviewsNode.querySelector('.pagination-controls');
      if(paginationControls) {
          paginationControls.addEventListener('click', handlePaginationClick);
      }

      console.log(`JavDB短评显示增强版: 显示客户端第 ${currentDisplayPage} 页评论 (${commentsToDisplay.length} 条)，API加载状态: ${isFetchingApi ? '进行中' : '完成'}，共 ${allReviews.length} 条评论。`);

      // === 新增：滚动到评论区域顶部 ===
      // 使用 requestAnimationFrame 确保 DOM 更新完成后再滚动，提高平滑度
      requestAnimationFrame(() => {
           reviewsNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      // === 新增结束 ===
  };


  // 完成API加载，显示第一页评论
  const finishFetchingApi = () => {
      isFetchingApi = false; // API加载完成
      loadNode.style.setProperty("display", "none"); // 隐藏主加载提示

      if (allReviews.length === 0) {
           reviewsNode.innerHTML = renderCont("暂无数据");
           console.log("JavDB短评显示增强版: API加载完成，无评论数据。");
           return;
      }

      console.log(`JavDB短评显示增强版: API加载完成，共获取 ${allReviews.length} 条评论。`);
      currentDisplayPage = 1; // API加载完毕后，默认显示第一页客户端分页
      displayCurrentPageReviews(); // 显示第一页评论和分页导航
  };

  // 处理单页API数据并决定是否继续加载下一页API
  const processApiPage = (reviews, pageFetched) => {
      if (reviews && reviews.length > 0) {
          allReviews = allReviews.concat(reviews); // 合并当前页评论到总列表
          currentApiPage++; // 准备加载下一页API数据
          retryCount = 0; // 当前API页成功，重置下一页的重试计数

          // 更新加载提示，显示已加载数量和当前API页码
          reviewsNode.innerHTML = renderCont(`正在加载短评... 已加载 ${allReviews.length} 条 (API页 ${pageFetched})`);

          // 继续加载下一页API数据
          fetchReviews(currentApiPage);
      } else {
          // 当前API页没有返回评论，说明已经加载完毕所有API数据
          finishFetchingApi(); // 完成API加载，显示客户端分页
      }
  };

  // 错误处理和重试 (现在针对单页API请求)
  const handleError = (msg, error, pageWithError) => {
    console.error(`JavDB短评显示增强版错误 (API页 ${pageWithError}): ${msg}`, error);

    // 如果是签名获取失败，停止整个流程
    if (msg.includes("签名获取失败")) {
         reviewsNode.innerHTML = renderCont(`加载失败：${msg}，请刷新页面`);
         loadNode.style.setProperty("display", "none");
         isFetchingApi = false; // 停止加载
         if (retryTimer) clearTimeout(retryTimer);
         return;
    }

    // 如果当前API页重试次数达到上限
    if (retryCount >= maxRetries) {
        // 停止加载后续页，显示已加载部分和错误信息
        let errorMsg = `加载部分完成 (${allReviews.length} 条)，API页 ${pageWithError} 加载失败：${msg}，请刷新页面重试`;
        reviewsNode.innerHTML = renderCont(errorMsg); // 先显示错误信息

        loadNode.style.setProperty("display", "none");
        isFetchingApi = false; // 停止加载
        if (retryTimer) clearTimeout(retryTimer);

        // 即使加载失败，也尝试显示已获取的评论（如果存在）
        if (allReviews.length > 0) {
            // 显示已加载数据的最后一页
            currentDisplayPage = Math.max(1, Math.ceil(allReviews.length / commentsPerPage));
             displayCurrentPageReviews(); // 重新渲染，这次会包含分页和已加载数据
             // 在评论下方再次添加错误信息，更醒目
             const existingContent = reviewsNode.querySelector('.message-body');
             if(existingContent) {
                 existingContent.innerHTML += `<p style="color: red; margin-top: 1em;">API加载未完成，部分数据获取失败：${msg}</p>`;
             }
        } else {
            // 没有加载到任何数据
            reviewsNode.innerHTML = renderCont(`加载失败：${msg}，请刷新页面重试`);
        }

        return;
    }

    // 增加当前API页的重试计数
    retryCount++;
    // 计算下一次重试的延迟时间
    const delay = Math.min(1500 * Math.pow(1.5, retryCount - 1), 15000); // 指数退避

    // 更新加载提示，显示重试信息
    reviewsNode.innerHTML = renderCont(`正在加载短评... 已加载 ${allReviews.length} 条。API页 ${pageWithError} ${msg}，${Math.ceil(delay/1000)}秒后重试 (${retryCount}/${maxRetries})`);

    // 设置定时器，重试加载失败的那一页API数据
    retryTimer = setTimeout(() => fetchReviews(pageWithError), delay);
  };


  // 获取评论数据 (现在接受页码参数，用于API请求)
  const fetchReviews = (pageToFetch) => {
    // 请求间隔限制
    const now = Date.now();
    if (now - lastRequestTime < 300) {
      setTimeout(() => fetchReviews(pageToFetch), 300 - (now - lastRequestTime));
      return;
    }
    lastRequestTime = now;

    // 标记正在请求API
    isFetchingApi = true;
    // 更新加载提示 (fetchReviews 调用前已更新，这里无需重复)


    // 使用顶部的apiDomain变量构建URL
    const apiUrl = `https://${apiDomain}/api/v1/movies/${mid}/reviews`;
    const params = {
        sort_by: "hotly",
        page: pageToFetch, // 使用传入的API页码
        limit: apiPageLimit // 使用配置的API单页限制
    };

    const signature = getOptimizedSignature();
    if (!signature) {
         handleError("签名获取失败", null, pageToFetch);
         return;
    }

    GM_xmlhttpRequest({
      url: `${apiUrl}?${new URLSearchParams(params).toString()}`,
      method: "GET",
      headers: { "jdSignature": signature },
      timeout: 8000,
      onload: function(response) {
        if (response.status === 200) {
          try {
            const data = JSON.parse(response.responseText);
            // 处理当前页API数据，并决定是否加载下一页API数据
            processApiPage(data?.data?.reviews ?? [], pageToFetch);
          } catch (e) {
            handleError("数据解析失败", e, pageToFetch);
          }
        } else {
          handleError(`API请求失败: HTTP ${response.status}`, null, pageToFetch);
        }
      },
      onerror: function(error) {
        handleError("网络请求错误", error, pageToFetch);
      },
      ontimeout: function() {
        handleError("请求超时", null, pageToFetch);
      }
    });
  };


  // 显示评论区域并触发加载
  const showReviews = ({ dataset }) => {
    magnetsNode.style.display = "none";
    listsNode.style.display = "none";
    reviewsNode.style.display = "block";

    // 如果正在进行API加载，则直接返回，避免重复触发
    if (isFetchingApi) {
        console.log("JavDB短评显示增强版: 正在进行API加载，跳过重复触发。");
        return;
    }

    // 如果已经加载过任何评论数据，直接显示当前客户端页
    if (allReviews.length > 0) {
        console.log(`JavDB短评显示增强版: 已加载 ${allReviews.length} 条评论，直接显示客户端第 ${currentDisplayPage} 页。`);
        displayCurrentPageReviews();
        return;
    }

    // 首次加载：重置所有状态变量
    allReviews = []; // 清空之前的数据
    currentApiPage = 1; // 从第一页API开始请求
    currentDisplayPage = 1; // 客户端显示从第一页开始
    retryCount = 0; // 重置第一页API的重试计数
    isFetchingApi = true; // 标记开始API加载

    reviewsNode.innerHTML = ""; // 清空旧内容
    loadNode.style.display = "block"; // 显示主加载提示
    reviewsNode.innerHTML = renderCont(`正在加载短评...`); // 初始加载提示

    console.log("JavDB短评显示增强版: 开始API分页加载短评...");
    // 从第一页API开始加载 (API页码从1开始)
    fetchReviews(currentApiPage);
  };

  // Tab点击事件处理
  const onclick = (e) => {
    const target = e.target.closest("li");
    if (!target) return;

    const { dataset, classList } = target;
    if (dataset.movieTabTarget !== "reviewTab") return;

    e.preventDefault();
    e.stopPropagation();
    if (classList.contains("is-active")) return;

    tabsNode.querySelector(".is-active").classList.remove("is-active");
    classList.add("is-active");
    showReviews(target);
  };

  // 初始化：添加Tab点击事件监听
  if (tabsNode) {
      tabsNode.addEventListener("click", onclick, true);
  } else {
      console.error("JavDB短评显示增强版: 未找到tabs容器");
  }

})();
