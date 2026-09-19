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
// 编辑页是 SPA：地址先落到，编辑器（ProseMirror）随后才渲染出来，所以要再盯着等一会儿。
// 超时就放弃——宁可少灌一次，也别一直转着重复写别人的编辑器
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

/** 标题：先清空再塞字。insertText 比 paste 干净，不会带进多余空行；被拦时退回 paste */
function setTitle(editor, text) {
  editor.focus();
  const sel = window.getSelection();
  sel.selectAllChildren(editor);
  sel.deleteFromDocument();
  if (!document.execCommand("insertText", false, text)) {
    paste(editor, "text/plain", text);
  }
}

/** 正文：整段 HTML 一把 paste 进去 */
function setContent(editor, html) {
  editor.focus();
  const sel = window.getSelection();
  sel.selectAllChildren(editor); // 先把光标交给这块
  sel.collapseToEnd(); // 再收到末尾，paste 就成了"追加"，不会把编辑区的根节点给清掉
  paste(editor, "text/html", html);
}

async function fillArticle(editors) {
  const article = await DDMsg.invoke("getArticle");
  // 两份都空 = 这一轮早给过了（页面刷新/跳转会让本脚本整个重跑），或这篇本来就没内容：都别动手
  if (!article || (!article.title && !article.html)) return;
  if (article.title) setTitle(editors[0], article.title);
  if (article.html) setContent(editors[1], article.html);
}

/** 到了编辑页：等标题 + 正文两个 ProseMirror 都渲染出来，再把文章灌进去 */
function waitEditorAndFill() {
  const startedAt = Date.now();
  const wait = setInterval(async () => {
    const editors = getEditors();
    if (editors.length < 2) {
      if (Date.now() - startedAt > EDITOR_WAIT_TIMEOUT) {
        clearInterval(wait);
        console.log("[DraftDepot] 等不到微信编辑器，放弃灌入");
      }
      return;
    }
    clearInterval(wait);
    if (filled) return;
    filled = true;
    try {
      await fillArticle(editors);
    } catch (err) {
      console.log("[DraftDepot] 灌文章失败", err);
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
  // TODO 图片：正文里的 src 是 https://app.localhost/images/xxx.png（本程序 WebView2 的虚拟映射），
  //      微信服务器取不到，粘过去会丢图。要么让 native 把本地图片内联成 data URI，要么先传图床
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
