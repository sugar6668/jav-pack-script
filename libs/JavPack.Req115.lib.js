/**
 * @require JavPack.Req.lib.js
 *
 * @connect 115.com
 */
class Drive115 extends Req {
  static DEFAULT_GET_RESPONSE_TYPE = "json";

  static files(cid = "0", params = {}) {
    return this.request({
      url: "https://webapi.115.com/files",
      params: { cid, ...params },
    });
  }

  static filesSearch(search_value, params = {}) {
    return this.request({
      url: "https://webapi.115.com/files/search",
      params: { search_value, ...params },
    });
  }

  static lixianTaskLists(page = 1) {
    return this.request({
      url: "https://115.com/web/lixian/",
      params: { ct: "lixian", ac: "task_lists", page },
    });
  }

  static labelList() {
    return this.request({
      url: "https://webapi.115.com/label/list",
      params: { keyword: "", limit: 11150 },
    });
  }

  /**
   * @connect 115vod.com
   */
  static filesVideo(pickcode) {
    return this.request({
      url: "https://115vod.com/webapi/files/video",
      params: { pickcode, local: 1 },
    });
  }

  static post(details) {
    return this.request({ method: "POST", ...details });
  }

  static filesAdd(cname, pid) {
    return this.post({
      url: "https://webapi.115.com/files/add",
      data: { cname, pid },
    });
  }

  static lixianAddTaskUrl(url, wp_path_id) {
    return this.post({
      url: "https://115.com/web/lixian/",
      params: { ct: "lixian", ac: "add_task_url" },
      data: { url, wp_path_id },
    });
  }

  /**
   * Bulk delete offline tasks and source files
   * @param {string[]} hash Array of info_hashes
   */
  static lixianTaskDel(hash) {
    return this.post({
      url: "https://115.com/web/lixian/",
      params: { ct: "lixian", ac: "task_del" },
      data: { hash },
    });
  }

  /**
   * Bulk delete files
   * @param {string[]} fid Array of file IDs
   * @param {string} pid Parent folder ID
   */
  static rbDelete(fid, pid = "") {
    return this.post({
      url: "https://webapi.115.com/rb/delete",
      data: { fid, pid, ignore_warn: 1 },
    });
  }

  /**
   * Batch move files
   * @param {string[]} fid Array of file IDs
   * @param {string} pid Destination folder ID
   */
  static filesMove(fid, pid) {
    return this.post({
      url: "https://webapi.115.com/files/move",
      data: { fid, pid, move_proid: "" },
    });
  }

  /**
   * Bulk label files
   * @param {string} file_ids fid1,fid2,fid3...
   * @param {string} file_label label_id1,label_id2,label_id3...
   */
  static filesBatchLabel(file_ids, file_label, action = "add") {
    return this.post({
      url: "https://webapi.115.com/files/batch_label",
      data: { file_ids, file_label, action },
    });
  }

  /**
   * Bulk rename files
   * @param {object} files_new_name { [fid]: rename }
   */
  static filesBatchRename(files_new_name) {
    return this.post({
      url: "https://webapi.115.com/files/batch_rename",
      data: { files_new_name },
    });
  }

  static sampleInitUpload({ filename, filesize, cid }) {
    return this.post({
      url: "https://uplb.115.com/3.0/sampleinitupload.php",
      data: { filename, filesize, target: `U_1_${cid}` },
    });
  }

  /**
   * @connect aliyuncs.com
   */
  static upload({
    host: url,
    filename: name,
    object: key,
    policy,
    accessid: OSSAccessKeyId,
    callback,
    signature,
    file,
  }) {
    return this.post({
      url,
      data: {
        name,
        key,
        policy,
        OSSAccessKeyId,
        success_action_status: "200",
        callback,
        signature,
        file,
      },
    });
  }

  static filesEdit(fid, fid_cover) {
    return this.post({
      url: "https://webapi.115.com/files/edit",
      data: { fid, fid_cover },
    });
  }
}

// eslint-disable-next-line no-unused-vars, unused-imports/no-unused-vars
class Req115 extends Drive115 {
  static MUTATION_GAP = 2000;
  static MUTATION_COORDINATOR_KEY = "__JavPack115MutationCoordinatorV1";
  static REQUEST_GAP = 2000;
  static REQUEST_COORDINATOR_KEY = "__JavPack115RequestCoordinatorV1";

  static getMutationRoot() {
    try {
      if (typeof unsafeWindow !== "undefined" && unsafeWindow.top) return unsafeWindow.top;
      if (typeof window !== "undefined" && window.top) return window.top;
    } catch (_) {}
    return globalThis;
  }

  static is115Request(config) {
    const url = typeof config === "string" ? config : config?.url;
    if (!url) return false;
    try {
      return /(^|\.)115\.com$/i.test(new URL(url, location.origin).hostname);
    } catch (_) {
      return false;
    }
  }

  static isMatchSearchRequest(config) {
    if (!this.is115Request(config)) return false;
    const url = typeof config === "string" ? config : config?.url;
    const params = typeof config === "object" ? config?.params : null;
    try {
      return new URL(url, location.origin).pathname === "/files/search" && Number(params?.type) === 4;
    } catch (_) {
      return false;
    }
  }

  static getRequestCoordinator() {
    const root = this.getMutationRoot();
    let coordinator = root[this.REQUEST_COORDINATOR_KEY];
    if (coordinator) return coordinator;

    coordinator = { queue: [], current: null, running: false, paused: null, lastFinishedAt: 0, drain: null };
    coordinator.drain = async () => {
      if (coordinator.running || coordinator.paused || !coordinator.queue.length) return;
      coordinator.running = true;
      const entry = coordinator.queue.shift();
      coordinator.current = entry;
      try {
        const wait = Math.max(0, coordinator.lastFinishedAt + this.REQUEST_GAP - Date.now());
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        if (coordinator.paused) {
          if (!entry.cancelled) coordinator.queue.unshift(entry);
          return;
        }
        entry.started = true;
        entry.resolve(await entry.task());
      } catch (err) {
        entry.reject(err);
      } finally {
        coordinator.running = false;
        if (coordinator.current === entry) coordinator.current = null;
        coordinator.lastFinishedAt = Date.now();
        if (!coordinator.paused && coordinator.queue.length) coordinator.drain();
      }
    };
    root[this.REQUEST_COORDINATOR_KEY] = coordinator;
    return coordinator;
  }

  static queue115Request(task) {
    const coordinator = this.getRequestCoordinator();
    if (coordinator.paused) return Promise.reject(new Error(coordinator.paused.reason));
    return new Promise((resolve, reject) => {
      coordinator.queue.push({ task, resolve, reject });
      coordinator.drain();
    });
  }

  static pauseRequests(reason = "115 请求已暂停") {
    const coordinator = this.getRequestCoordinator();
    if (coordinator.paused) return;
    coordinator.paused = { reason, at: Date.now() };
    const error = new Error(reason);
    if (coordinator.current && !coordinator.current.started) {
      coordinator.current.cancelled = true;
      coordinator.current.reject(error);
    }
    coordinator.queue.splice(0).forEach((entry) => entry.reject(error));
    // A risk response from a read endpoint must also stop queued write work.
    // Recovery remains tied to the existing successful verification path.
    this.pauseMutations(reason);
  }

  static resumeRequests() {
    const coordinator = this.getRequestCoordinator();
    coordinator.paused = null;
    coordinator.drain();
  }

  static isRiskResponse(response) {
    const code = Number(response?.errcode ?? response?.code);
    const message = String(response?.error_msg || response?.message || "");
    return code === 911 || /安全验证|风控|操作频繁|请求频繁|captcha|risk.?control/i.test(message);
  }

  static request(config) {
    if (!this.is115Request(config)) return super.request(config);
    const execute = async () => {
      const response = await super.request(config);
      if (this.isRiskResponse(response)) this.pauseRequests(response.error_msg || response.message || "115 需要安全验证");
      return response;
    };
    // Page matching is the only automatic high-fan-out path.  Keep that search
    // serialized at two seconds; archive/offline internals already run in the
    // mutation queue and should not inherit a delay for every API step.
    return this.isMatchSearchRequest(config) ? this.queue115Request(execute) : execute();
  }

  static getMutationCoordinator() {
    const root = this.getMutationRoot();
    let coordinator = root[this.MUTATION_COORDINATOR_KEY];
    if (coordinator) return coordinator;

    coordinator = {
      queue: [],
      running: false,
      draining: false,
      paused: null,
      lastFinishedAt: 0,
      gap: this.MUTATION_GAP,
      drain: null,
    };

    const emit = (entry, state) => {
      const detail = {
        state,
        label: entry?.label || "",
        queued: coordinator.queue.length,
        running: coordinator.running,
        paused: coordinator.paused,
      };
      entry?.onState?.(detail);
      try { root.dispatchEvent(new CustomEvent("JavPack115MutationState", { detail })); } catch (_) {}
    };

    coordinator.drain = async () => {
      if (coordinator.running || coordinator.draining || coordinator.paused || !coordinator.queue.length) return;
      coordinator.draining = true;
      const entry = coordinator.queue.shift();
      try {
        const wait = Math.max(0, coordinator.lastFinishedAt + coordinator.gap - Date.now());
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        if (coordinator.paused) {
          coordinator.queue.unshift(entry);
          emit(entry, "paused");
          return;
        }

        coordinator.running = true;
        emit(entry, "running");
        try {
          entry.resolve(await entry.task());
        } catch (err) {
          entry.onError?.(err);
          entry.reject(err);
        }
      } finally {
        coordinator.running = false;
        coordinator.draining = false;
        coordinator.lastFinishedAt = Date.now();
        emit(entry, coordinator.paused ? "paused" : "finished");
        if (!coordinator.paused && coordinator.queue.length) setTimeout(coordinator.drain, coordinator.gap);
      }
    };

    root[this.MUTATION_COORDINATOR_KEY] = coordinator;
    root.JavPack115Mutation = {
      getState: () => ({ queued: coordinator.queue.length, running: coordinator.running, paused: coordinator.paused }),
      resume: () => this.resumeMutations(),
      cancelPending: () => this.cancelPendingMutations(),
    };
    return coordinator;
  }

  static queueMutation(label, task, { onState } = {}) {
    const coordinator = this.getMutationCoordinator();
    return new Promise((resolve, reject) => {
      const entry = {
        label,
        task,
        resolve,
        reject,
        onState,
        onError: (err) => this.reportMutationError(err),
      };
      coordinator.queue.push(entry);
      onState?.({ state: coordinator.paused ? "paused" : "queued", label, queued: coordinator.queue.length, running: coordinator.running, paused: coordinator.paused });
      coordinator.drain();
    });
  }

  static pauseMutations(reason = "115 操作需要确认") {
    const coordinator = this.getMutationCoordinator();
    if (coordinator.paused) return;
    coordinator.paused = { reason, at: Date.now() };
    try {
      window.Grant?.notify?.({ status: "warn", icon: "warning", msg: `115 操作已暂停：${reason}` });
    } catch (_) {}
  }

  static resumeMutations() {
    const coordinator = this.getMutationCoordinator();
    coordinator.paused = null;
    this.resumeRequests();
    coordinator.drain();
  }

  static getMutationState() {
    const coordinator = this.getMutationCoordinator();
    return { queued: coordinator.queue.length, running: coordinator.running, paused: coordinator.paused };
  }

  static cancelPendingMutations(reason = "已取消排队操作") {
    const coordinator = this.getMutationCoordinator();
    const error = new Error(reason);
    coordinator.queue.splice(0).forEach((entry) => entry.reject(error));
  }

  static isRiskError(err) {
    const code = Number(err?.errcode ?? err?.code ?? err?.response?.errcode);
    const message = String(err?.message || err?.error_msg || err?.response?.error_msg || "");
    return code === 911 || /安全验证|风控|操作频繁|请求频繁|captcha|risk.?control/i.test(message);
  }

  static reportMutationError(err) {
    if (this.isRiskError(err)) this.pauseMutations(err?.message || "115 需要安全验证");
  }

  static async filesAll(cid, params = {}) {
    const res = await this.files(cid, params);
    // 🛡️ 防御补丁：如果 res 是空的，直接返回空数据格式
    if (!res) return { data: [] };
    // 🛡️ 防御补丁：给予默认值，防止解构报错
    const { count = 0, page_size = 0, data = [] } = res;
    return count > page_size && data.length ? this.files(cid, { ...params, limit: count }) : res;
  }

  static filesAllVideos(cid, params = {}) {
    return this.filesAll(cid, { ...params, type: 4 });
  }

  static filesAllSRTs(cid, params = {}) {
    return this.filesAll(cid, { ...params, suffix: "srt" });
  }

  static async filesSearchAll(search_value, params = {}) {
    const res = await this.filesSearch(search_value, params);
    // 🛡️ 防御补丁：如果 res 是空的，直接返回空数据格式
    if (!res) return { data: [] };
    // 🛡️ 防御补丁：给予默认值，防止解构报错
    const { count = 0, page_size = 0, data = [] } = res;
    return count > page_size && data.length ? this.filesSearch(search_value, { ...params, limit: count }) : res;
  }

  static filesSearchAllVideos(search_value, params = {}) {
    return this.filesSearchAll(search_value, { ...params, type: 4 });
  }

  static filesSearchAllFolders(search_value, params = {}) {
    return this.filesSearchAll(search_value, { ...params, fc: 1 });
  }

  static async handleDir(routes) {
    if (routes.length === 1 && /^\d{5,}$/.test(routes[0])) return routes[0];

    let cid;
    const routesStr = routes.join("/");
    const cachedCid = localStorage.getItem(routesStr);

    if (cachedCid) {
      const res = await this.files(cachedCid);
      if (res?.path?.length) {
        const path = res.path.slice(1).map((p) => p.name);
        if (path.join("/") === routesStr) cid = cachedCid;
      }
    }

    if (!cid) {
      cid = "0";

      for (const route of routes) {
        const { data } = await this.filesSearchAllFolders(route, { cid });
        let folder = data.find((folder) => folder.n === route);
        if (!folder) folder = await this.filesAdd(route, cid);
        cid = folder?.cid;
        if (!cid) break;
      }
    }

    const month = new Date().getMonth().toString();
    if (localStorage.getItem("115_CD") !== month) {
      localStorage.clear();
      localStorage.setItem("115_CD", month);
    }

    if (cid) localStorage.setItem(routesStr, cid);
    return cid;
  }

  static async handleVerify(info_hash, { regex, codes }, { max, filter }) {
    const sleep = () => {
      return new Promise((r) => {
        setTimeout(r, 1000);
      });
    };

    let file_id = "";
    let videos = [];
    let allVideos = [];

    for (let index = 0; index < max; index++) {
      if (index) await sleep();
      const { tasks } = await this.lixianTaskLists();

      const task = tasks.find((task) => task.info_hash === info_hash);
      if (!task || task.status === -1) break;

      file_id = task.file_id;
      if (file_id) break;
    }

    if (!file_id) return { file_id, videos, allVideos };

    for (let index = 0; index < max; index++) {
      if (index) await sleep();
      const { data } = await this.filesAllVideos(file_id);

      allVideos = data;
      videos = data.filter((item) => regex.test(item.n));
      if (videos.length) break;
    }

    if (!videos.length) {
      const { tasks } = await this.lixianTaskLists();
      const task = tasks.find((task) => task.info_hash === info_hash);

      if (task.status === 2) {
        const { data } = await this.filesAllVideos(file_id);
        allVideos = data;
        codes = codes.map((code) => code.toUpperCase());

        videos = data.filter((item) => {
          const name = item.n.toUpperCase();
          return codes.some((code) => name.includes(code));
        });
      }
    }

    return { videos: videos.filter(filter), allVideos, file_id };
  }

  static async handleClean(keepFiles, cid) {
    const needMove = keepFiles.filter((file) => file.cid !== cid).map((file) => file.fid);
    if (needMove.length) await this.filesMove(needMove, cid);

    const { data } = await this.filesAll(cid);

    const needRemove = data
      .filter((item) => !keepFiles.some((file) => file.fid === item.fid))
      .map((item) => item.fid ?? item.cid);

    if (needRemove.length) return this.rbDelete(needRemove, cid);
  }

  static async handleTags(files, tags) {
    const { data } = await this.labelList();
    if (!data?.list?.length) return;

    const { list } = data;
    const labels = [];

    tags.forEach((tag) => {
      const item = list.find((item) => item.name === tag);
      if (item) labels.push(item.id);
    });

    if (labels.length) return this.filesBatchLabel(files.map((it) => it.fid).toString(), labels.toString());
  }

  static buildRenameObject(files, cid, { rename, renameTxt, zh, crack, leaked, uncensored }) {
    rename = rename.replaceAll("$zh", zh ? renameTxt.zh : "");
    rename = rename.replaceAll("$crack", crack ? renameTxt.crack : "");
    rename = rename.replaceAll("$leaked", leaked ? renameTxt.leaked : "");
    rename = rename.replaceAll("$uncensored", uncensored ? renameTxt.uncensored : "");
    rename = rename.split("$sep").filter(Boolean).join(renameTxt.sep);
    rename = rename.trim();

    const renameObj = { [cid]: rename };

    if (files.length === 1) {
      const { fid, ico } = files[0];
      renameObj[fid] = `${rename}.${ico}`;
      return renameObj;
    }

    const icoMap = files.reduce((acc, { ico, ...item }) => {
      acc[ico] ??= [];
      acc[ico].push(item);
      return acc;
    }, {});

    const noTxt = renameTxt.no;
    for (const [ico, items] of Object.entries(icoMap)) {
      if (items.length === 1) {
        renameObj[items[0].fid] = `${rename}.${ico}`;
        continue;
      }

      items
        .toSorted((a, b) => a.n.localeCompare(b.n))
        .forEach(({ fid }, idx) => {
          const no = noTxt.replaceAll(`\${no}`, `${idx + 1}`.padStart(2, "0"));
          renameObj[fid] = `${rename}${no}.${ico}`;
        });
    }

    return renameObj;
  }

  static handleRename(files, cid, options) {
    return this.filesBatchRename(this.buildRenameObject(files, cid, options));
  }

  static async handleCover(url, cid, filename) {
    const file = await this.request({ url, timeout: 60000, responseType: "blob" });
    if (!file) return;

    const res = await this.sampleInitUpload({ cid, filename, filesize: file.size });
    if (res?.host) return this.upload({ ...res, filename, file });
  }

  static async handleOffline(options, magnets) {
    return this.queueMutation("离线任务", () => this.handleOfflineNow(options, magnets));
  }

  static async handleOfflineNow(
    { dir, regex, codes, verifyOptions, code, rename, renameTxt, tags, clean, cover, isVR, uncensored },
    magnets,
  ) {
    const res = { status: "error", msg: `获取目录失败: ${dir.join("/")}` };
    const cid = await this.handleDir(dir);
    if (!cid) return res;

    for (let index = 0, { length } = magnets; index < length; index++) {
      const { url, zh, crack, leaked, uncensored: magnetUncensored } = magnets[index];
      const { state, error_msg, errcode, info_hash } = await this.lixianAddTaskUrl(url, cid);

      if (!state) {
        res.msg = error_msg;
        res.status = "error";
        res.currIdx = index;
        if (errcode === 10008) continue;
        if (errcode === 911) {
          res.status = "warn";
          this.pauseMutations(error_msg || "115 需要安全验证");
        }
        break;
      }

      const { videos, allVideos = [], file_id } = await this.handleVerify(info_hash, { regex, codes }, verifyOptions);

      if (!videos.length) {
        if (verifyOptions.clean) await this.lixianTaskDel([info_hash]);
        if (file_id && clean) await this.rbDelete([file_id], cid);

        res.msg = `${code} 离线验证失败`;
        res.status = "error";
        continue;
      }

      // A verified VR torrent can contain several camera/angle files.  Keep
      // the whole task's video set in its one 115 task directory instead of
      // cleaning everything except the filename that matched the code.
      const bundleVideos = isVR && allVideos.length ? allVideos : videos;
      const srtRes = await this.filesAllSRTs(file_id);
      const srts = srtRes?.data || [];
      const files = [...bundleVideos, ...srts];
      let syncedVideos = bundleVideos;

      if (clean) await this.handleClean(files, file_id);

      if (tags.length) await this.handleTags(bundleVideos, tags);

      if (rename) {
        const renameObj = this.buildRenameObject(files, file_id, {
          rename,
          renameTxt,
          zh: zh || srts.length,
          crack,
          leaked,
          uncensored: uncensored || magnetUncensored,
        });
        await this.filesBatchRename(renameObj);
        syncedVideos = bundleVideos.map((file) => ({ ...file, n: renameObj[file.fid] || file.n }));
      }

      let hasCover = false;
      if (cover) {
        try {
          const { data } = await this.handleCover(cover, file_id, `${code}.cover.jpg`);
          if (data?.file_id) {
            await this.filesEdit(file_id, data.file_id);
            hasCover = true;
          }
        } catch (err) {
          console.warn("[Req115.handleCover]", err?.message);
        }
      }

      res.msg = `${code} 离线任务成功`;
      res.status = "success";
      res.match = {
        cid: file_id,
        files: syncedVideos.map((file) => ({ ...file, cid: file_id })),
        realPath: (srtRes?.path || [])
          .map((part) => part?.name || part?.file_name || part?.n)
          .filter((name) => name && name !== "网盘" && name !== "115")
          .join("/"),
        hasCover,
        subtitleFiles: srts,
      };
      break;
    }

    return res;
  }
}
