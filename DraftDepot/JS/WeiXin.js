// 由 PageSite::injectSiteScript 注入到 mp.weixin.qq.com，每个文档（含跳转后）都会跑一遍。
// 注入时前面拼了 Msg.js，所以直接用它挂的 window.DDMsg 跟 native 说话。
// 职责：盯住登录态与 token——失效就回登录页，拿到 token 就回传 C++ 存库，并直奔新建图文的编辑页。

// 新建图文的编辑页：拿到 token 后拼这个地址
const CREATE_ARTICLE_URL =
  "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&token={token}&lang=zh_CN&timestamp={timestamp}";
// "已经在编辑页"的判据：目标地址去掉 token / timestamp 后的固定部分。
// 必须用它而不是只判 "/cgi-bin/appmsg"：命中就停手，否则会带着新 timestamp 反复刷新页面
const EDIT_PAGE_MARK =
  "cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0";
// 登录失效兜底：页面上"请重新<a id="jumpUrl">登录</a>"本身就指向登录页，取不到就用首页
const LOGIN_URL = "https://mp.weixin.qq.com/";

const CHECK_INTERVAL = 800;

let lastToken = ""; // 已回传过的 token，避免每 800ms 重复往 C++ 发

// 从地址里抠 token：微信把它放在 query 上（登录后的落地页、编辑页都有）
function getToken() {
  const matched = /[?&]token=(\d+)/.exec(location.href);
  return matched ? matched[1] : "";
}

const timer = setInterval(() => {
  // 登录态失效：页面出现"请重新登录"（<h2> 里带 #jumpUrl 那个链接）
  const jumpUrl = document.querySelector("#jumpUrl");
  const relogin = document.body && document.body.innerText.includes("请重新登录");
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

  // 已经在编辑页：本轮任务完成，停表
  if (location.href.includes(EDIT_PAGE_MARK)) {
    clearInterval(timer);
    return;
  }
  // 有 token 但不在编辑页（比如刚登录完停在首页）：拼好地址跳过去，跳完就停表
  clearInterval(timer);
  location.href = CREATE_ARTICLE_URL.replace("{token}", token).replace(
    "{timestamp}",
    Date.now(),
  );
}, CHECK_INTERVAL);
