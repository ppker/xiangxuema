// 站点脚本（JS/*.js）共用的 IPC 客户端，注入时挂在 window.DDMsg 上。
// 与主页面 UI/src/Msg.ts 是同一套协议：{ id, method, args } 发出去，native 回 { id, result | error }。
// 由 PageSite::injectSiteScript 拼在站点脚本前面，所以站点脚本里直接用 DDMsg.invoke 即可。
(function () {
  const cache = new Map(); // id → { resolve, reject, withObjects }；事件名 → 监听者数组，与主页面一致共用一张表

  function emit(eventName, data) {
    const listeners = cache.get(eventName);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      listener(data);
    }
  }

  function onMessage(event) {
    const msg = event.data;
    if (msg.id && cache.has(msg.id)) {
      const item = cache.get(msg.id);
      if (msg.error) {
        item.reject(msg.error);
      } else {
        // withObjects 的请求额外把原生随回包附带的附加对象交出去（没有时给空数组）
        item.resolve(
          item.withObjects ? { result: msg.result, objects: event.additionalObjects || [] } : msg.result,
        );
      }
      cache.delete(msg.id);
    } else if (msg.eventName) {
      emit(msg.eventName, msg);
    }
  }

  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener("message", onMessage);
  }

  function invoke(method, args, withObjects) {
    return new Promise(function (resolve, reject) {
      const id = Math.random().toString(8).substring(2);
      cache.set(id, { resolve: resolve, reject: reject, withObjects: withObjects });
      if (!window.chrome || !window.chrome.webview) {
        return;
      }
      window.chrome.webview.postMessage({ id: id, method: method, args: args });
    });
  }

  /**
   * 与 invoke 同构，但回包 resolve 的是 { result, objects }：
   * objects 是原生用 PostWebMessageAsJsonWithAdditionalObjects 随回包附带的对象数组
   * （如 File System Access 的文件句柄），原生没附带对象时是空数组
   */
  function invokeWithObjects(method, args) {
    return invoke(method, args, true);
  }

  function on(eventName, listener) {
    const arr = cache.get(eventName);
    if (arr) {
      arr.push(listener);
    } else {
      cache.set(eventName, [listener]);
    }
  }

  function off(eventName, listener) {
    const arr = cache.get(eventName);
    if (!arr) return;
    cache.set(
      eventName,
      arr.filter(function (item) {
        return item !== listener;
      }),
    );
  }

  function once(eventName, listener) {
    const onceListener = function (arg) {
      listener(arg);
      off(eventName, onceListener);
    };
    on(eventName, onceListener);
  }

  // —— 图片：取文件、传图床，以及"这张图在本站点传过没有" ——
  // 四个站点脚本原本各写一份（要目录句柄 → 按名取文件 → 传图床 → 换 src），内容逐字相同，
  // 收到这里共用一份：站点脚本只留自己家图床的 uploadImage（拿到 File，返回地址）。
  //
  // 传过就别再传：同一张图重发这一篇、或别的文章又用到它，发布前先拿文件名问一次 native
  // （image_site 表，按"文件名 + 站点"记），命中直接用旧地址——省一趟上传，对方图床也不堆重复副本。
  // 文件名是存图时一次性生成、之后从不改写的，所以同名必然是同一份内容，不会误命中。

  /** 正文里引用图片的 URL 前缀：原生把这个主机映射到了数据目录的 images 子目录 */
  const IMAGE_URL_PREFIX = "https://app.localhost/images/";

  /** 图片目录句柄（数据目录下的 images）：取一次就够；页面跳转后脚本重跑，缓存自然失效 */
  let imageDir = null;

  /** 向 native 要一次图片目录句柄：之后取文件全在 JS 侧完成，不用再为每张图往返一次 */
  async function getImageDir() {
    if (!imageDir) imageDir = (await invokeWithObjects("getImageDir")).objects[0];
    return imageDir;
  }

  /** 按文件名从图片目录里取文件：File 自带文件名与 MIME，正好能直接进 FormData */
  async function imageFile(name) {
    const dir = await getImageDir();
    return await (await dir.getFileHandle(name)).getFile();
  }

  /** 正文里的图：https://app.localhost/images/<文件名> → 文件名；不是这个前缀的（外链图）返回空串 */
  function fileNameOf(src) {
    return src.startsWith(IMAGE_URL_PREFIX) ? src.slice(IMAGE_URL_PREFIX.length) : "";
  }

  /**
   * 一张图在本站点的图床地址：
   * 先问 native 这张图传过没有，传过就直接拿地址；没有才取文件交给 uploadFile 上传，
   * 成功了把地址回写给 native——下一轮发布（重发、或别的文章用到同一张图）就不必再传。
   * uploadFile 由站点脚本给：拿到 File，返回图床地址。
   * 传失败不给地址，也不写库：下次会重新传
   */
  async function imageUrl(name, uploadFile) {
    const cached = await invoke("getImageUrl", { name: name });
    if (cached && cached.url) return cached.url;
    const url = await uploadFile(await imageFile(name));
    if (url) await invoke("setImageUrl", { name: name, url: url });
    return url;
  }

  /**
   * 把正文 HTML 里的图全部换成它在本站点图床上的地址（外链图取不到文件名，原样留着）。
   * 串行一张张来：图一般不多，省得并发把它限流了。
   * 某张失败就保留原地址——多半是裂图，但不该为一张图把整篇都拦下
   */
  async function uploadImages(html, uploadFile) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const img of Array.from(doc.querySelectorAll("img"))) {
      const name = fileNameOf(img.getAttribute("src") || "");
      if (!name) continue;
      const url = await imageUrl(name, uploadFile).catch((err) => {
        console.log("[DraftDepot] 图片上传失败", name, err);
        return "";
      });
      if (url) img.setAttribute("src", url);
    }
    return doc.body.innerHTML;
  }

  // —— 遮罩：传图与灌文章期间把页面盖住，别让用户在半截上乱点 ——
  // 各站点脚本灌文章都是"传图 → 写标题 → 写正文"，中间要等网络、等编辑器消化内容，那会儿页面
  // 看着是空的、内容是半截的，用户随手一点就可能把正在写的东西搅乱，或者以为还没开始就自己动手。
  // 所以统一在这一层做：整页盖住 + 居中提示，灌完自动撤掉。放 Msg.js 里是给四个站点共用一份实现
  // （各站点是各自的文档，各盖各的，互不影响）。

  /** 默认提示语 */
  const MASK_TEXT = "正在同步文章，请稍后";
  // 转圈的动画：keyframes 只能写在样式表里，所以注入一次（带 id，重跑脚本时不会重复注入）
  const MASK_STYLE_ID = "dd-mask-style";
  const MASK_STYLE = "@keyframes dd-mask-spin{to{transform:rotate(360deg)}}";

  let maskEl = null;
  let maskDepth = 0; // 嵌套调用也只盖一层，最后一次 hideMask 才真撤
  let lastOverflow = ""; // 页面原来的滚动设置，撤遮罩时还原

  /** 动画样式表：第一次盖遮罩时才注入 */
  function ensureMaskStyle() {
    if (document.getElementById(MASK_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = MASK_STYLE_ID;
    style.textContent = MASK_STYLE;
    (document.head || document.documentElement).appendChild(style);
  }

  /** 遮罩上的输入一律拦掉：点击、滚轮、右键、触摸都到不了页面 */
  function blockEvent(ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }

  /**
   * 盖一层遮罩：整页盖住，正中提示一句话。
   * 样式全写成内联：站点页面自己的 CSS 带不动它；z-index 取最大值，压过它自己的弹层。
   * 重复调用只是叠一层（嵌套只会盖一层），文案按最后一次给的显示
   */
  function showMask(text) {
    maskDepth += 1;
    if (maskEl) {
      const label = maskEl.querySelector(".dd-mask-text");
      if (label) label.textContent = text || MASK_TEXT;
      return;
    }
    // 脚本在文档创建时就跑，那会儿可能连 body 都还没有：这一拍先不盖，反正下一拍还会来
    const root = document.body || document.documentElement;
    if (!root) return;

    ensureMaskStyle();
    maskEl = document.createElement("div");
    Object.assign(maskEl.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      zIndex: "2147483647",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0, 0, 0, 0.45)",
      cursor: "wait",
      // 字体自己定死：不然会继承站点的字体与字号，各家看着都不一样
      fontSize: "15px",
      lineHeight: "1.5",
      fontFamily: "-apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif",
      color: "#fff",
    });
    const panel = document.createElement("div");
    Object.assign(panel.style, {
      display: "flex",
      alignItems: "center",
      padding: "16px 24px",
      borderRadius: "8px",
      background: "rgba(0, 0, 0, 0.75)",
      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
    });
    const spinner = document.createElement("div");
    Object.assign(spinner.style, {
      width: "18px",
      height: "18px",
      marginRight: "12px",
      border: "2px solid rgba(255, 255, 255, 0.35)",
      borderTopColor: "#fff",
      borderRadius: "50%",
      animation: "dd-mask-spin 0.8s linear infinite",
    });
    const label = document.createElement("div");
    label.className = "dd-mask-text";
    label.textContent = text || MASK_TEXT;
    panel.appendChild(spinner);
    panel.appendChild(label);
    maskEl.appendChild(panel);
    root.appendChild(maskEl);

    // 交互全拦在遮罩这一层：页面自己的元素收不到点击、滚轮、右键、触摸
    const blocked = ["mousedown", "mouseup", "click", "dblclick", "wheel", "touchstart", "touchend", "contextmenu"];
    for (const type of blocked) {
      maskEl.addEventListener(type, blockEvent, true);
    }
    // 键盘拦在文档的捕获阶段：不然页面自己的快捷键与输入框照收不误
    document.addEventListener("keydown", blockEvent, true);
    // 顺带锁滚动：内容还半截的时候滚来滚去只会让人更摸不着头脑
    lastOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
  }

  /** 撤掉遮罩：嵌套着盖的（depth > 1）先不撤，等最外面那次 */
  function hideMask() {
    maskDepth = Math.max(0, maskDepth - 1);
    if (!maskEl || maskDepth > 0) return;
    document.removeEventListener("keydown", blockEvent, true);
    maskEl.remove();
    maskEl = null;
    document.documentElement.style.overflow = lastOverflow;
  }

  /**
   * 包一段活儿：盖遮罩 → 干活 → 撤遮罩（默认提示语见 MASK_TEXT，要换就传 text）。
   * 用 finally 撤：活儿里抛了错（比如某张图没传上去）也得把页面还给人家，不能卡在遮罩上
   */
  async function withMask(task, text) {
    try {
      showMask(text);
      return await task();
    } finally {
      hideMask();
    }
  }

  window.DDMsg = {
    invoke: invoke,
    invokeWithObjects: invokeWithObjects,
    on: on,
    off: off,
    once: once,
    emit: emit,
    showMask: showMask,
    hideMask: hideMask,
    withMask: withMask,
    imageUrl: imageUrl,
    uploadImages: uploadImages,
  };
})();
