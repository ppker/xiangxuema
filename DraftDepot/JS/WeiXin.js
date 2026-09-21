// 由 PageSite::injectSiteScript 注入到 mp.weixin.qq.com，每个文档（含跳转后）都会跑一遍。
// 注入时前面拼了 Msg.js，所以直接用它挂的 window.DDMsg 跟 native 说话。
// 职责：
//   1. 盯住登录态与 token——失效就回登录页，拿到 token 就回传 C++ 存库，并直奔新建图文的编辑页；
//   2. 进了编辑页就把"待发布的文章"（点发布按钮时由主编辑器交给 native 的）灌进微信编辑器。

// 新建图文的编辑页：拿到 token 后拼这个地址
const CREATE_ARTICLE_URL =
  "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&token={token}&lang=zh_CN&timestamp={timestamp}";
// "已经在编辑页"的判据：目标地址去掉 token / timestamp 后的固定部分。
// 必须用它而不是只判 "/cgi-bin/appmsg"：命中就停手，否则会带着新 timestamp 反复刷新页面
const EDIT_PAGE_MARK =
  "cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0";
// 登录失效兜底：页面上"请重新<a id="jumpUrl">登录</a>"本身就指向登录页，取不到就用首页
const LOGIN_URL = "https://mp.weixin.qq.com/";

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
  if (article.html) {
    if (useApi) await setContentByApi(article.html);
    else if (editors[1]) setContentByPaste(editors[1], article.html);
  }
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
        await fillArticle(true);
      } else if ((!jsApi || (state && state.isReady)) && oldEditor) {
        // 拿不到 JSAPI（老页面），或它明说了不是新编辑器：按老办法来
        clearInterval(wait);
        await fillArticle(false);
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
  // 图片不用管：正文在 forWeiXin 里已经把 app.localhost/images/...（本程序 WebView2 的虚拟映射，
  // 微信服务器取不到）内联成了 base64，代码块也带着内联的着色样式，粘过去就是完整的一篇
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
