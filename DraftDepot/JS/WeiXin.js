// 由 PageSite::injectSiteScript 注入到 mp.weixin.qq.com，每个文档（含跳转后）都会跑一遍。
// 注入时前面拼了 Msg.js，所以直接用它挂的 window.DDMsg 跟 native 说话。
// 职责：
//   1. 盯住登录态与 token——失效就回登录页，拿到 token 就回传 C++ 存库，并直奔新建图文的编辑页；
//   2. 进了编辑页就把"待发布的文章"（点发布按钮时由主编辑器交给 native 的）灌进微信编辑器。
//
// 图片是唯一要额外跑一趟的事：正文里的图是 https://app.localhost/images/<文件名>（本程序 WebView2
// 的虚拟映射，微信的服务器取不到）。早先的做法是在主编辑器那边就把图读成 base64 内联进 <img src>，
// 现在改成跟知乎/CSDN 同一套：按文件名从本机图片目录取文件，走它自己的素材上传接口传到图床，
// 拿到 cdn_url 换掉正文里的 src 再灌进去。取文件 + 传图床 + 换地址这套四个站点一模一样，收在
// Msg.js 里共用一份（DDMsg.uploadImages），这里只留微信自己的上传接口 uploadImage。
// 目录句柄只能由 native 给：脚本跑在网页上下文里，碰不到本机文件系统，光有路径也造不出 File 对象。
// 传过的图不再重复传：地址记在 image_site 表里，下次直接取（见 Msg.js 的 imageUrl）。
//
// 上传接口要的身份参数比别家多：token（地址上有）、ticket 与 svr_time（页面全局变量 wx.* 上有），
// 再加 cookie 里的 ticket_id —— 它是 HttpOnly，document.cookie 读不到，只能问 native 要
// （DDMsg.invoke("getCookie")，见 PageSite::handleGetCookie）。

// 新建图文的编辑页：拿到 token 后拼这个地址
const CREATE_ARTICLE_URL =
  "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&token={token}&lang=zh_CN&timestamp={timestamp}";
// "已经在编辑页"的判据：目标地址去掉 token / timestamp 后的固定部分。
// 必须用它而不是只判 "/cgi-bin/appmsg"：命中就停手，否则会带着新 timestamp 反复刷新页面
const EDIT_PAGE_MARK =
  "cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0";
// 登录失效兜底：页面上"请重新<a id="jumpUrl">登录</a>"本身就指向登录页，取不到就用首页
const LOGIN_URL = "https://mp.weixin.qq.com/";

/** 图片上传接口：微信自己的素材上传，身份参数一律拼在 URL 上（见 buildUploadUrl） */
const UPLOAD_IMAGE_URL = "https://mp.weixin.qq.com/cgi-bin/filetransfer";

const CHECK_INTERVAL = 600;
// 编辑页是 SPA：地址先落到，编辑器随后才初始化完，所以要再盯着等一会儿。
// 就绪判据优先用微信自己的 mp_editor_get_isready，超时就放弃——宁可少灌一次，
// 也别一直转着重复写别人的编辑器
const EDITOR_WAIT_TIMEOUT = 30 * 1000;

let lastToken = ""; // 已回传过的 token，避免每 600ms 重复往 C++ 发
let filled = false; // 本文档已经灌过一轮：页面自身的后续刷新不该再糊一遍

// 从地址里抠 token：微信把它放在 query 上（登录后的落地页、编辑页都有）
function getToken() {
  const matched = /[?&]token=(\d+)/.exec(location.href);
  return matched ? matched[1] : "";
}

/** ticket_id：cookie 里的（HttpOnly，页面读不到），取一次就够；没有就给空串，URL 上留空 */
let ticketId = null;

/**
 * 向 native 要 ticket_id：它是 HttpOnly，document.cookie 里没有，只能让 native 代读
 * （CookieManager 在 native 侧，不受 HttpOnly 限制）。拿不到就退 slave_user，再没有就空着
 */
async function getTicketId() {
  if (ticketId === null) {
    const cookies = await DDMsg.invoke("getCookie", { names: ["ticket_id", "slave_user"] });
    ticketId = (cookies && (cookies.ticket_id || cookies.slave_user)) || "";
  }
  return ticketId;
}

/** 页面全局变量 wx.* 上的身份参数：新编辑器页还在用这套（老编辑器同源于此） */
function wxData(path, fallback = "") {
  const value = path.split(".").reduce((obj, key) => (obj == null ? obj : obj[key]), window.wx);
  return value == null ? fallback : value;
}

/**
 * 拼上传地址：token / ticket / svr_time / ticket_id 全是它验身份用的，缺一个都传不上去。
 * seq 与 t 是它自己防缓存用的时间戳与随机数，随手造一个就行
 */
async function buildUploadUrl() {
  const params = new URLSearchParams({
    action: "upload_material",
    f: "json",
    scene: "8",
    writetype: "doublewrite",
    groupid: "1",
    ticket_id: await getTicketId(),
    ticket: wxData("commonData.data.ticket"),
    svr_time: wxData("cgiData.svr_time", Math.floor(Date.now() / 1000)),
    token: getToken(),
    lang: "zh_CN",
    seq: Date.now(),
    t: Math.random(),
  });
  return UPLOAD_IMAGE_URL + "?" + params.toString();
}

/** 上传序号：表单里的 id 字段（WebUploader 那套惯例），每张图一个 */
let uploadSeq = 0;

/**
 * 上传一张图，拿到它的图床地址。
 * 表单除 file（二进制）外还带 id / name / type / lastModifiedDate / size —— 它那套上传组件
 * （WebUploader）的惯例字段，照它自己发的那次补齐，缺了可能认不出这是个图片。
 * 返回 JSON 里 base_resp.ret 为 0 才算成，地址在 cdn_url
 */
async function uploadImage(file) {
  const form = new FormData();
  form.append("id", "WU_FILE_" + uploadSeq++);
  form.append("name", file.name);
  form.append("type", file.type || "image/png");
  form.append("lastModifiedDate", new Date(file.lastModified).toString());
  form.append("size", file.size);
  form.append("file", file);
  const res = await fetch(await buildUploadUrl(), { method: "POST", body: form, credentials: "include" });
  if (!res.ok) throw new Error("上传图片失败，HTTP " + res.status);
  const data = await res.json();
  if (!data.base_resp || data.base_resp.ret !== 0) {
    throw new Error("上传图片失败：" + (((data.base_resp || {}).err_msg) || "未知错误"));
  }
  if (!data.cdn_url) throw new Error("上传图片没返回地址");
  return data.cdn_url;
}

/** 微信用的 ProseMirror 编辑器：第 0 个是标题输入框，第 1 个是正文 */
function getEditors() {
  return document.querySelectorAll(".ProseMirror");
}

/** 往编辑器里派发一次 paste：这条路跟人在编辑器里 Ctrl+V 走的是同一套处理，格式才留得住 */
function paste(editor, type, data) {
  const dt = new DataTransfer();
  dt.setData(type, data);
  const ev = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: dt });
  editor.dispatchEvent(ev);
}

/**
 * 标题：全选后 paste 一段纯文本，一次替换掉原有内容。
 * 不用 document.execCommand("insertText")：它已废弃，而且这里也没有更标准的替代品——
 * 标题输入框是 ProseMirror 的，只能由它自己的编辑器去改内容（它不认 beforeinput 那种通用事件），
 * 而 paste 是它明明白白接的一条路（见 paste 的说明）。
 * "替换"靠选区实现：全选后**不** collapseToEnd，粘贴时它见选区没折叠就先删后插，正好是整段替换；
 * 不先 deleteFromDocument：整块删要让它先消化一次"空文档"的 DOM 变更，随后的插入容易落错地方
 */
function setTitle(editor, text) {
  editor.focus();
  const sel = window.getSelection();
  sel.selectAllChildren(editor);
  paste(editor, "text/plain", text);
}

/** 老编辑器的正文：整段 HTML 一把 paste 进去（新编辑器走下面的 JSAPI） */
function setContentByPaste(editor, html) {
  editor.focus();
  const sel = window.getSelection();
  sel.selectAllChildren(editor); // 先把光标交给这块
  sel.collapseToEnd(); // 再收到末尾，paste 就成了"追加"，不会把编辑区的根节点给清掉
  paste(editor, "text/html", html);
}

/** 微信挂在页面上的编辑器 JSAPI：新编辑器才有，而且要等它自己初始化完才出现 */
function getJsApi() {
  const api = window.__MP_Editor_JSAPI__;
  return api && typeof api.invoke === "function" ? api : null;
}

/** 回调式的 JSAPI 包成 Promise，好跟 await 串起来；errCb 走 reject */
function invokeJsApi(apiName, apiParam) {
  return new Promise((resolve, reject) => {
    // get_isready 没有参数，apiParam 传 undefined 它自己会忽略
    getJsApi().invoke({ apiName: apiName, apiParam: apiParam, sucCb: resolve, errCb: reject });
  });
}

/** 编辑器状态：{ isReady, isNew } */
function getEditorState() {
  return invokeJsApi("mp_editor_get_isready");
}

/** 正文（新编辑器）：整篇富文本交给微信自己处理，比模拟一次 paste 稳 */
function setContentByApi(html) {
  return invokeJsApi("mp_editor_set_content", { content: html });
}

async function fillArticle(useApi) {
  if (filled) return;
  filled = true;
  const article = await DDMsg.invoke("getArticle");
  // 两份都空 = 这一轮早给过了（页面刷新/跳转会让本脚本整个重跑），或这篇本来就没内容：都别动手
  if (!article || (!article.title && !article.html)) return;

  // 标题没有对应的 JSAPI（官方只给了正文相关的接口），还是往标题输入框里塞
  const editors = getEditors();
  if (article.title && editors[0]) setTitle(editors[0], article.title);
  // 图先换成微信图床的地址（传过的直接取旧地址，见 Msg.js），再整篇灌进去
  const html = await DDMsg.uploadImages(article.html, uploadImage);
  if (!html) return;
  if (useApi) await setContentByApi(html);
  else if (editors[1]) setContentByPaste(editors[1], html);
}

/**
 * 到了编辑页：等编辑器就绪再把文章灌进去。
 * 就绪优先问微信自己（mp_editor_get_isready），不再靠数 ProseMirror 的个数。
 * 只有 isNew=true 才走 set_content —— 官方说明写得很清楚：这类接口只对新编辑器开放，
 * 老编辑器退回原来的 paste 路子。
 */
function waitEditorAndFill() {
  const startedAt = Date.now();
  let pending = false; // 上一拍的 await 还没回来，别叠下一次
  const wait = setInterval(async () => {
    if (pending) return;
    if (Date.now() - startedAt > EDITOR_WAIT_TIMEOUT) {
      clearInterval(wait);
      console.log("[DraftDepot] 等不到微信编辑器，放弃灌入");
      return;
    }
    pending = true;
    try {
      const jsApi = getJsApi();
      const state = jsApi ? await getEditorState() : null;
      const newEditor = !!(state && state.isReady && state.isNew);
      const oldEditor = getEditors().length >= 2;
      if (newEditor) {
        clearInterval(wait);
        // 传图 + 灌标题正文这一整段都盖着遮罩：那期间页面是半截的，别让人插手（见 Msg.js）
        await DDMsg.withMask(() => fillArticle(true));
      } else if ((!jsApi || (state && state.isReady)) && oldEditor) {
        // 拿不到 JSAPI（老页面），或它明说了不是新编辑器：按老办法来
        clearInterval(wait);
        await DDMsg.withMask(() => fillArticle(false));
      }
    } catch (err) {
      console.log("[DraftDepot] 灌文章失败", err);
    } finally {
      pending = false;
    }
  }, CHECK_INTERVAL);
}

const timer = setInterval(() => {
  // 只在顶层文档干活：注入脚本每个 iframe 也会跑一遍，别钻到别人的框里去做判断
  if (window.self !== window.top) return;

  // 登录态失效：页面出现"请重新登录"（<h2> 里带 #jumpUrl 那个链接）
  const jumpUrl = document.querySelector("#jumpUrl");
  const relogin =
    document.body && document.body.innerText.includes("请重新登录");
  if (jumpUrl || relogin) {
    clearInterval(timer);
    location.href = (jumpUrl && jumpUrl.getAttribute("href")) || LOGIN_URL;
    return;
  }

  const token = getToken();
  if (!token) return; // 登录页 / 首页没有 token，继续等

  // 只在 token 变了才回传：C++ 侧拿它跟 site 表里的比，不同才写库
  if (token !== lastToken) {
    lastToken = token;
    DDMsg.invoke("setParam", { key: "token", value: token });
  }

  // 已经在编辑页：本轮任务完成，停表，转去等编辑器渲染好后灌文章
  if (location.href.includes(EDIT_PAGE_MARK)) {
    clearInterval(timer);
    waitEditorAndFill();
    return;
  }
  // 有 token 但不在编辑页（比如刚登录完停在首页）：拼好地址跳过去，跳完就停表
  clearInterval(timer);
  location.href = CREATE_ARTICLE_URL.replace("{token}", token).replace(
    "{timestamp}",
    Date.now(),
  );
}, CHECK_INTERVAL);
