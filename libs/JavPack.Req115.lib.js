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
  // Offline work remains strictly serial, but a completed task no longer idles
  // the next explicit archive request for two extra seconds.
  static MUTATION_GAP = 800;
  static MUTATION_COORDINATOR_KEY = "__JavPack115MutationCoordinatorV1";
  static REQUEST_GAP = 1000;
  static REQUEST_COORDINATOR_KEY = "__JavPack115RequestCoordinatorV1";
  static GLOBAL_MATCH_SLOT_KEY = "JavPack115.matchSearchSlot.v1";
  static GLOBAL_MATCH_SIGNAL_KEY = "__JavPack115MatchSearchSignalV1";
  static GLOBAL_MATCH_OWNER_KEY = "__JavPack115MatchSearchOwnerV1";
  static GLOBAL_MATCH_LEASE_MS = 15000;

  static getMutationRoot() {
    try {
      if (typeof unsafeWindow !== "undefined" && unsafeWindow.top) return unsafeWindow.top;
      if (typeof window !== "undefined" && window.top) return window.top;
    } catch (_) {}
    return globalThis;
  }

  static canCoordinateMatchSearchAcrossTabs() {
    return typeof GM_getValue === "function" && typeof GM_setValue === "function";
  }

  static getGlobalMatchOwner() {
    const root = this.getMutationRoot();
    if (!root[this.GLOBAL_MATCH_OWNER_KEY]) root[this.GLOBAL_MATCH_OWNER_KEY] = crypto.randomUUID();
    return root[this.GLOBAL_MATCH_OWNER_KEY];
  }

  static getGlobalMatchSignal() {
    const root = this.getMutationRoot();
    if (root[this.GLOBAL_MATCH_SIGNAL_KEY]) return root[this.GLOBAL_MATCH_SIGNAL_KEY];

    const signal = { waiters: new Set(), channel: null };
    try {
      signal.channel = new BroadcastChannel("JavPack115.matchSearchSlot.v1");
      signal.channel.onmessage = () => {
        [...signal.waiters].forEach((wake) => wake());
      };
    } catch (_) {}
    root[this.GLOBAL_MATCH_SIGNAL_KEY] = signal;
    return signal;
  }

  static notifyGlobalMatchSignal() {
    try { this.getGlobalMatchSignal().channel?.postMessage({ type: "slot" }); } catch (_) {}
  }

  static waitForGlobalMatchSignal(ms) {
    const signal = this.getGlobalMatchSignal();
    return new Promise((resolve) => {
      let timer;
      const wake = () => {
        clearTimeout(timer);
        signal.waiters.delete(wake);
        resolve();
      };
      signal.waiters.add(wake);
      timer = setTimeout(wake, Math.max(50, Math.min(ms, 1000)));
    });
  }

  static getGlobalMatchSlot() {
    try { return GM_getValue(this.GLOBAL_MATCH_SLOT_KEY, null); } catch (_) { return null; }
  }

  static setGlobalMatchSlot(value) {
    try {
      GM_setValue(this.GLOBAL_MATCH_SLOT_KEY, value);
      this.notifyGlobalMatchSignal();
      return true;
    } catch (_) {
      return false;
    }
  }

  static async acquireGlobalMatchSlot() {
    if (!this.canCoordinateMatchSearchAcrossTabs()) return () => {};

    const owner = this.getGlobalMatchOwner();
    for (;;) {
      const now = Date.now();
      const slot = this.getGlobalMatchSlot() || {};
      const ownerBusy = slot.owner && slot.owner !== owner && Number(slot.leaseUntil) > now;
      const nextAt = Math.max(Number(slot.lastFinishedAt || 0) + this.REQUEST_GAP, ownerBusy ? Number(slot.leaseUntil) : 0);
      if (nextAt > now) {
        await this.waitForGlobalMatchSignal(nextAt - now);
        continue;
      }

      const claim = { owner, leaseUntil: now + this.GLOBAL_MATCH_LEASE_MS, lastFinishedAt: Number(slot.lastFinishedAt || 0) };
      if (!this.setGlobalMatchSlot(claim)) return () => {};
      // GM storage does not offer compare-and-set.  Give a simultaneous tab a
      // short claim window, then verify that this tab still owns the lease.
      await new Promise((resolve) => setTimeout(resolve, 40));
      if (this.getGlobalMatchSlot()?.owner !== owner) continue;

      return () => {
        const current = this.getGlobalMatchSlot();
        if (current?.owner !== owner) return;
        this.setGlobalMatchSlot({ ...current, owner: "", leaseUntil: 0, lastFinishedAt: Date.now() });
      };
    }
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
        const releaseGlobalSlot = await this.acquireGlobalMatchSlot();
        try {
          if (coordinator.paused) {
            if (!entry.cancelled) coordinator.queue.unshift(entry);
            return;
          }
          entry.started = true;
          entry.resolve(await entry.task());
        } finally {
          releaseGlobalSlot();
        }
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
    const { skipMatchQueue = false, ...requestConfig } = config;
    const execute = async () => {
      const response = await super.request(requestConfig);
      if (this.isRiskResponse(response)) this.pauseRequests(response.error_msg || response.message || "115 需要安全验证");
      return response;
    };
    // Page matching is the only automatic high-fan-out path.  Keep those
    // searches serialized at one second globally across JavDB tabs; archive/
    // offline internals stay outside this read-search coordinator.
    return this.isMatchSearchRequest(requestConfig) && !skipMatchQueue ? this.queue115Request(execute) : execute();
  }

  static getMutationCoordinator() {
    const root = this.getMutationRoot();
    let coordinator = root[this.MUTATION_COORDINATOR_KEY];
    if (coordinator) return coordinator;

    coordinator = {
      queue: [],
      current: null,
      running: false,
      draining: false,
      paused: null,
      lastFinishedAt: 0,
      gap: this.MUTATION_GAP,
      drain: null,
    };

    const emit = (entry, state) => {
      const detail = {
        ...this.getMutationState(coordinator),
        state,
        label: entry?.label || "",
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
        entry.startedAt = Date.now();
        coordinator.current = entry;
        emit(entry, "running");
        try {
          entry.resolve(await entry.task());
        } catch (err) {
          entry.onError?.(err);
          entry.reject(err);
        }
      } finally {
        coordinator.running = false;
        coordinator.current = null;
        coordinator.draining = false;
        coordinator.lastFinishedAt = Date.now();
        emit(entry, coordinator.paused ? "paused" : "finished");
        if (!coordinator.paused && coordinator.queue.length) setTimeout(coordinator.drain, coordinator.gap);
      }
    };

    root[this.MUTATION_COORDINATOR_KEY] = coordinator;
    root.JavPack115Mutation = {
      getState: () => this.getMutationState(coordinator),
      resume: () => this.resumeMutations(),
      cancelPending: () => this.cancelPendingMutations(),
    };
    return coordinator;
  }

  static queueMutation(label, task, { onState } = {}) {
    const coordinator = this.getMutationCoordinator();
    if (coordinator.paused) {
      const error = new Error(coordinator.paused.reason);
      onState?.({ ...this.getMutationState(coordinator), state: "paused", label });
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      const entry = {
        label,
        task,
        resolve,
        reject,
        onState,
        onError: (err) => this.reportMutationError(err),
        queuedAt: Date.now(),
      };
      coordinator.queue.push(entry);
      onState?.({ ...this.getMutationState(coordinator), state: coordinator.paused ? "paused" : "queued", label });
      coordinator.drain();
    });
  }

  static pauseMutations(reason = "115 操作需要确认") {
    const coordinator = this.getMutationCoordinator();
    if (coordinator.paused) return;
    coordinator.paused = { reason, at: Date.now() };
    const error = new Error(reason);
    coordinator.queue.splice(0).forEach((entry) => entry.reject(error));
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

  static getMutationState(coordinator = this.getMutationCoordinator()) {
    const taskInfo = (entry) => (entry ? {
      label: entry.label || "",
      queuedAt: entry.queuedAt || 0,
      startedAt: entry.startedAt || 0,
    } : null);
    return {
      queued: coordinator.queue.length,
      pending: coordinator.queue.map(taskInfo),
      running: coordinator.running,
      draining: coordinator.draining,
      current: taskInfo(coordinator.current),
      paused: coordinator.paused ? { ...coordinator.paused } : null,
    };
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
    if (typeof info_hash !== "string" || !info_hash.trim()) return { file_id: "", videos: [], allVideos: [], pending: true };
    const sleep = () => {
      return new Promise((r) => {
        setTimeout(r, 1000);
      });
    };

    let file_id = "";
    let videos = [];
    let allVideos = [];
    let taskStatus;

    for (let index = 0; index < max; index++) {
      if (index) await sleep();
      const { tasks } = await this.lixianTaskLists();

      const task = tasks.find((task) => task.info_hash === info_hash);
      if (!task) break;
      taskStatus = task.status;
      if (taskStatus === -1) break;
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

      taskStatus = task?.status ?? taskStatus;
      if (task?.status === 2) {
        const { data } = await this.filesAllVideos(file_id);
        allVideos = data;
        codes = codes.map((code) => code.toUpperCase());

        videos = data.filter((item) => {
          const name = item.n.toUpperCase();
          return codes.some((code) => name.includes(code));
        });
      }
    }

    const matchedVideos = videos.filter(filter);
    return {
      videos: matchedVideos,
      allVideos,
      file_id,
      taskStatus,
      // A task that has not reached terminal completion can legitimately have
      // a folder but no visible media yet.  It must never be treated as a
      // failed archive and cleaned up during this short verification window.
      pending: !matchedVideos.length && taskStatus !== -1 && taskStatus !== 2,
    };
  }

  static async handleClean() {
    throw new Error("安全保护：禁止对没有本次独立任务范围的目录执行清理");
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

  static getUploadedFileId(uploadRes) {
    const fileId = uploadRes?.data?.file_id
      ?? uploadRes?.data?.fileid
      ?? uploadRes?.file_id
      ?? uploadRes?.fileid;
    return fileId === undefined || fileId === null || fileId === "" ? "" : String(fileId);
  }

  static get115Error(response, fallback) {
    return response?.error_msg || response?.error || response?.message || fallback;
  }

  static async setFolderCover(cid, fileId) {
    if (!fileId) throw new Error("封面上传失败：115 未返回文件 ID");
    const editRes = await this.filesEdit(cid, fileId);
    if (!editRes || editRes.state === false) {
      throw new Error(this.get115Error(editRes, "115 未能设置目录封面"));
    }
    return editRes;
  }

  static async handleCover(url, cid, filename) {
    const file = await this.request({ url, timeout: 60000, responseType: "blob" });
    if (!file) throw new Error("封面下载失败");

    const res = await this.sampleInitUpload({ cid, filename, filesize: file.size });
    if (!res?.host) throw new Error(this.get115Error(res, "115 未返回封面上传地址"));
    return this.upload({ ...res, filename, file });
  }

  static async handleOffline(options, magnets, callbacks = {}) {
    return this.queueMutation("离线任务", () => this.handleOfflineNow(options, magnets, callbacks), callbacks);
  }


}


// BEGIN SAFE115_ARCHIVE_V1
const create115SafeArchive = (Base) => class Safe115Archive extends Base {
  static SAFE_ARCHIVE_VERSION = "2026-10-25.1";
  static archiveId(value) { return value == null ? "" : String(value); }
  static archiveFailure(message) { return new Error("安全保护：" + message + "，已停止整理；离线任务和文件保留"); }
  static archiveAck(response, operation) {
    if (response?.state !== true && response?.state !== 1) throw this.archiveFailure(operation + "未得到成功确认");
    return response;
  }
  static async archiveDirectory(cid, expectedPath) {
    cid = this.archiveId(cid);
    if (!cid) throw this.archiveFailure("目录 ID 缺失");
    const result = await this.filesAll(cid);
    if (!result || result.state === false || !Array.isArray(result.data) || !Array.isArray(result.path)) {
      throw this.archiveFailure("目录内容或路径无法验证");
    }
    const ids = result.path.map((part) => this.archiveId(part.cid ?? part.file_id ?? part.id));
    if (!ids.length || ids.some((id) => !id) || new Set(ids).size !== ids.length || ids.at(-1) !== cid) {
      throw this.archiveFailure("目录路径与 ID 不一致");
    }
    if (expectedPath && (ids.length !== expectedPath.length || ids.some((id, index) => id !== expectedPath[index]))) {
      throw this.archiveFailure("目录不在本次隔离范围内");
    }
    if (result.count != null && (!Number.isFinite(Number(result.count)) || Number(result.count) > result.data.length)) {
      throw this.archiveFailure("目录列表不完整");
    }
    return { ...result, ids };
  }
  static async createArchiveScope(parentCid, code) {
    parentCid = this.archiveId(parentCid);
    const parent = await this.archiveDirectory(parentCid);
    const name = String(code || "影片").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) + ".离线-" + crypto.randomUUID();
    const created = this.archiveAck(await this.filesAdd(name, parentCid), "创建独立任务目录");
    const cid = this.archiveId(created.cid ?? created.data?.cid);
    if (!cid || cid === "0" || parent.ids.includes(cid)) throw this.archiveFailure("新目录返回了归档目录或祖先 ID");
    const ids = [...parent.ids, cid];
    const fresh = await this.archiveDirectory(cid, ids);
    const leaf = fresh.path.at(-1);
    if ((leaf.name || leaf.file_name || leaf.n) !== name) throw this.archiveFailure("新任务目录名称未得到确认");
    if (fresh.data.length || (fresh.count != null && Number(fresh.count) !== 0)) {
      throw this.archiveFailure("新任务目录并非空目录");
    }
    return {
      cid, ids, name, parentCid, protectedIds: new Set(parent.ids),
      parentNames: parent.path.map((part) => part.name || part.file_name || part.n).filter(Boolean),
    };
  }
  static async archiveTree(scope) {
    const pending = [{ cid: scope.cid, ids: scope.ids }];
    const folders = new Map();
    const files = new Map();
    while (pending.length) {
      const current = pending.shift();
      if (folders.has(current.cid) || scope.protectedIds.has(current.cid)) throw this.archiveFailure("目录循环或越界");
      if (folders.size >= 100 || files.size > 5000) throw this.archiveFailure("任务目录超出检查上限");
      const result = await this.archiveDirectory(current.cid, current.ids);
      folders.set(current.cid, result);
      for (const item of result.data) {
        const fid = this.archiveId(item.fid);
        if (fid && fid !== "0") {
          if (scope.protectedIds.has(fid) || fid === scope.cid || files.has(fid)) throw this.archiveFailure("文件 ID 冲突");
          const owner = this.archiveId(item.cid ?? item.parent_id ?? item.pid ?? current.cid);
          if (owner !== current.cid) throw this.archiveFailure("文件不属于已验证目录");
          files.set(fid, { ...item, fid, cid: current.cid });
        } else {
          const cid = this.archiveId(item.cid ?? item.file_id);
          if (!cid || cid === scope.cid || scope.protectedIds.has(cid)) throw this.archiveFailure("子目录指向受保护目录");
          pending.push({ cid, ids: [...current.ids, cid] });
        }
      }
    }
    return { files: [...files.values()], folders, root: folders.get(scope.cid) };
  }
  static archiveVideo(file) {
    return Number(file.iv) === 1 || Number(file.type) === 4
      || /^(mp4|mkv|avi|wmv|mov|flv|ts|m2ts|m4v|webm|rmvb|mpg|mpeg|vob)$/i.test(file.ico || String(file.n).split(".").at(-1));
  }
  static archiveWait(interval = 3000) { return new Promise((resolve) => setTimeout(resolve, interval)); }
  static archiveCompletedFile(tree, url) {
    // A registered single-file ed2k result can confirm completion even while
    // task metadata lags. Require its exact name/size and SHA1 in our fresh scope.
    const link = String(url || "").match(/^ed2k:\/\/\|file\|([^|]+)\|(\d+)\|[a-f\d]{32}\|/i);
    if (!link || tree.files.length !== 1 || tree.folders.size !== 1) return "";
    let name = link[1];
    try { name = decodeURIComponent(name); } catch (_) {}
    const file = tree.files[0];
    const sha = String(file.sha || file.sha1 || "").toLowerCase();
    if (file.n !== name || Number(file.s) !== Number(link[2]) || Number(file.s) <= 0 || !/^[a-f\d]{40}$/.test(sha)) return "";
    return JSON.stringify([file.fid, file.cid, file.n, Number(file.s), sha]);
  }
  static async verifyArchiveTask(infoHash, scope, { regex }, { max = 41, interval = 3000, filter = () => true } = {}, magnet = {}) {
    let hash = typeof infoHash === "string" ? infoHash.trim().toLowerCase() : "";
    const matcher = new RegExp(regex.source, regex.flags.replace(/[gy]/g, ""));
    const checks = Math.min(120, Math.max(1, Math.floor(Number(max) || 41)));
    const waitMs = Math.min(30000, Math.max(1000, Number(interval) || 3000));
    let completed = false;
    let previousFile = "";
    let outsideTask = false;
    let mediaVisible = false;
    for (let index = 0; index < checks; index++) {
      if (index) await this.archiveWait(waitMs);
      const response = await this.lixianTaskLists();
      if (response?.state === false || !Array.isArray(response?.tasks)) throw this.archiveFailure("任务列表无法验证");
      const tasks = response.tasks.filter((item) => item && typeof item === "object");
      const matchesHash = (item) => hash && typeof item.info_hash === "string" && item.info_hash.trim().toLowerCase() === hash;
      const identifiesScope = (item) => this.archiveId(item.wp_path_id) === scope.cid || this.archiveId(item.file_id) === scope.cid;
      const pages = Math.min(20, Math.max(1, Math.floor(Number(response.page_count) || 1)));
      for (let page = 2; page <= pages && !tasks.some((item) => matchesHash(item) || (!hash && identifiesScope(item))); page++) {
        const next = await this.lixianTaskLists(page);
        if (next?.state === false || !Array.isArray(next?.tasks)) throw this.archiveFailure("任务列表分页无法验证");
        tasks.push(...next.tasks.filter((item) => item && typeof item === "object"));
      }
      let task = tasks.find(matchesHash);
      if (task && scope.protectedIds.has(this.archiveId(task.file_id))) throw this.archiveFailure("任务返回了演员归档目录或祖先目录");
      if (task && Number(task.status) === -1) return { pending: false, message: "115 任务失败" };
      if (task && Number(task.status) !== 2 && !/^ed2k:/i.test(magnet.url || "")) { previousFile = ""; continue; }
      const tree = await this.archiveTree(scope);
      const ownedIds = new Set([...tree.folders.keys(), ...tree.files.map((file) => file.fid)]);
      if (!task) {
        // A missing hash is not a reason to stop waiting. Bind a task only by
        // the unique directory we just created or an output verified inside it.
        const scopedTasks = tasks.filter((item) => {
          if (hash && typeof item.info_hash === "string" && item.info_hash.trim()) return false;
          return this.archiveId(item.wp_path_id) === scope.cid || ownedIds.has(this.archiveId(item.file_id));
        });
        if (scopedTasks.length > 1) throw this.archiveFailure("本次目录关联了多个离线任务");
        task = scopedTasks[0];
        if (!hash && typeof task?.info_hash === "string") hash = task.info_hash.trim().toLowerCase();
      }
      const taskId = this.archiveId(task?.file_id);
      if (scope.protectedIds.has(taskId)) throw this.archiveFailure("任务返回了演员归档目录或祖先目录");
      if (task && Number(task.status) === -1) return { pending: false, message: "115 任务失败" };
      completed ||= Number(task?.status) === 2;
      // Task completion and directory indexing are separate updates in 115.
      // Retry an unseen output; it never becomes a directory we may operate on.
      outsideTask = Boolean(taskId && !ownedIds.has(taskId));
      if (outsideTask) { previousFile = ""; continue; }
      const taskFile = tree.files.find((file) => file.fid === taskId);
      const allVideos = (taskFile ? [taskFile] : tree.files).filter((file) => this.archiveVideo(file));
      const videos = allVideos.filter((file) => matcher.test(file.n) && filter(file));
      mediaVisible ||= allVideos.length > 0;
      if (Number(task?.status) === 2 && videos.length) return { videos, allVideos, tree, pending: false };
      const readyFile = videos.length ? this.archiveCompletedFile(tree, magnet.url) : "";
      if (readyFile && readyFile === previousFile) return { videos, allVideos, tree, pending: false };
      previousFile = readyFile;
    }
    const windowText = "检测等待窗口（约 " + Math.ceil((checks - 1) * waitMs / 1000) + " 秒）已结束";
    return {
      pending: !outsideTask && (!completed || !mediaVisible),
      message: windowText + (outsideTask ? "，任务文件尚未同步到本次独立目录"
        : completed ? "，仍未识别到与完整番号匹配的视频" : "，115 仍在下载或任务结果尚未同步"),
    };
  }
  static archiveOwned(scope, tree, keepIds, knownIds) {
    for (const id of [...tree.folders.keys(), ...tree.files.map((file) => file.fid)]) {
      if (scope.protectedIds.has(id) || (knownIds && !knownIds.has(id))) throw this.archiveFailure("隔离目录内容或归属发生变化");
    }
    const files = keepIds.map((id) => tree.files.find((file) => file.fid === id));
    if (files.some((file) => !file)) throw this.archiveFailure("待整理文件已移出隔离目录");
    return files;
  }
  static async finishArchive(scope, verified, options, magnet, onMatch) {
    const { code, rename, renameTxt, tags = [], clean, cover, isVR, uncensored } = options;
    const videos = isVR ? verified.allVideos : verified.videos;
    const srts = verified.tree.files.filter((file) => /^srt$/i.test(file.ico || String(file.n).split(".").at(-1)));
    const knownIds = new Set([...verified.tree.folders.keys(), ...verified.tree.files.map((file) => file.fid)]);
    const videoIds = videos.map((file) => file.fid);
    const keepIds = [...new Set([...videoIds, ...srts.map((file) => file.fid)])];
    let tree = await this.archiveTree(scope);
    let files = this.archiveOwned(scope, tree, keepIds, knownIds);
    const moveIds = files.filter((file) => file.cid !== scope.cid).map((file) => file.fid);
    if (moveIds.length) {
      this.archiveAck(await this.filesMove(moveIds, scope.cid), "移动本次任务文件");
      tree = await this.archiveTree(scope);
      files = this.archiveOwned(scope, tree, keepIds, knownIds);
      if (files.some((file) => file.cid !== scope.cid)) throw this.archiveFailure("文件移动后位置未确认");
    }
    if (clean) {
      // Delete only entries observed inside the freshly created, empty job scope.
      // Never pass the actor destination, its ancestors, or an arbitrary task CID.
      const removeIds = tree.root.data.map((item) => this.archiveId(item.fid || item.cid))
        .filter((id) => !keepIds.includes(id));
      if (removeIds.some((id) => !id || id === scope.cid || scope.protectedIds.has(id) || !knownIds.has(id))) {
        throw this.archiveFailure("清理清单包含不属于本次任务的内容");
      }
      if (removeIds.length) this.archiveAck(await this.rbDelete(removeIds, scope.cid), "清理本次任务附属文件");
    }
    tree = await this.archiveTree(scope);
    files = this.archiveOwned(scope, tree, keepIds, knownIds);
    if (files.some((file) => file.cid !== scope.cid)) throw this.archiveFailure("重命名前文件目录发生变化");
    let syncedVideos = files.filter((file) => videoIds.includes(file.fid));
    try { onMatch?.({ cid: scope.cid, files: syncedVideos, realPath: "", hasCover: false, subtitleFiles: [] }); }
    catch (error) { console.warn("[Req115.archive.onMatch]", error?.message); }
    if (tags.length) await this.handleTags(syncedVideos, tags);
    let names = {};
    if (rename) {
      names = this.buildRenameObject(files, scope.cid, {
        rename, renameTxt, zh: magnet.zh || srts.length, crack: magnet.crack, leaked: magnet.leaked,
        uncensored: uncensored || magnet.uncensored,
      });
      if (Object.keys(names).some((id) => scope.protectedIds.has(id) || (id !== scope.cid && !keepIds.includes(id)))) {
        throw this.archiveFailure("重命名清单超出本次任务范围");
      }
      this.archiveAck(await this.filesBatchRename(names), "重命名本次任务");
      syncedVideos = syncedVideos.map((file) => ({ ...file, n: names[file.fid] || file.n }));
    }
    let hasCover = false;
    let coverError = "";
    if (cover) {
      try {
        await this.archiveDirectory(scope.cid, scope.ids);
        const uploaded = await this.handleCover(cover, scope.cid, code + ".cover.jpg");
        await this.setFolderCover(scope.cid, this.getUploadedFileId(uploaded));
        hasCover = true;
      } catch (error) { coverError = error?.message || "封面上传失败"; }
    }
    const realPath = [...scope.parentNames, names[scope.cid] || scope.name].join("/");
    return {
      status: "success", msg: code + " 离线任务成功" + (coverError ? "；封面未上传：" + coverError : ""), coverError,
      match: {
        cid: scope.cid, files: syncedVideos, realPath, hasCover, coverError,
        subtitleFiles: files.filter((file) => !videoIds.includes(file.fid)).map((file) => ({ ...file, n: names[file.fid] || file.n })),
      },
    };
  }
  static pendingArchives = new Map();
  static async handleOfflineNow(options, magnets, { onMatch, onState } = {}) {
    const parentCid = this.archiveId(await this.handleDir(options.dir));
    if (!parentCid) return { status: "error", msg: "获取归档目录失败" };
    for (let index = 0; index < magnets.length; index++) {
      const magnet = magnets[index];
      const jobKey = JSON.stringify([parentCid, options.code, magnet.url]);
      let job = this.pendingArchives.get(jobKey);
      if (!job) {
        const scope = await this.createArchiveScope(parentCid, options.code);
        const result = await this.lixianAddTaskUrl(magnet.url, scope.cid);
        if (!result?.state) {
          const message = result?.error_msg || "115 未确认离线任务提交";
          if (Number(result?.errcode) === 10008) continue;
          if (Number(result?.errcode) === 911) {
            this.pauseMutations(message);
            return { status: "warn", msg: message, currIdx: index };
          }
          return { status: "error", msg: message, currIdx: index };
        }
        job = { scope, infoHash: result.info_hash };
        this.pendingArchives.set(jobKey, job);
      }
      const { scope, infoHash } = job;
      onState?.({ state: "waiting", label: "离线任务" });
      const verified = await this.verifyArchiveTask(infoHash, scope, options, options.verifyOptions, magnet);
      if (!verified.videos?.length) {
        if (!verified.pending) this.pendingArchives.delete(jobKey);
        return {
          status: verified.pending ? "pend" : "error", currIdx: index,
          msg: options.code + " 已提交；" + verified.message + (verified.pending ? "；可在当前页面继续检测" : "")
            + "；任务目录保留：" + [...scope.parentNames, scope.name].join("/"),
        };
      }
      this.pendingArchives.delete(jobKey);
      onState?.({ state: "archiving", label: "离线任务" });
      return this.finishArchive(scope, verified, options, magnet, onMatch);
    }
    return { status: "error", msg: "所选资源未能建立新的离线任务；未整理已有文件" };
  }
};
// END SAFE115_ARCHIVE_V1
Req115 = create115SafeArchive(Req115);
