// 由 PageSite::injectSiteScript 注入到 my.oschina.net，每个文档（含跳转后）都会跑一遍。
// 注入时前面拼了 Msg.js，所以直接用它挂的 window.DDMsg 跟 native 说话。
// 职责：进了写作页就把"待发布的文章"（点发布按钮时由主编辑器交给 native 的）灌进 OSC 编辑器。
// 与知乎/CSDN 同一套：正文在前端已经转成 Markdown（见 UI/src/EditorContent/Markdown.ts），
// 这里只管把它写进编辑器，不做任何格式加工。
//
// 登录这件事不用脚本操心：没登录时打开写作页会被 OSC 送到登录页，登录成功后又被自动送回写作页
// ——那是另一次导航、另一个文档，本脚本会重新跑一遍。所以等编辑器就绪不设超时：
// 从登录页到人输完验证码可能要好几分钟，超时放弃就等于白跑一趟。
//
// 图片是唯一要额外跑一趟的事：正文里的图是 https://app.localhost/images/<文件名>（本程序 WebView2
// 的虚拟映射，OSC 的服务器取不到）。所以进了写作页先向 native 要一次图片目录的句柄（File System
// Access，跟主窗口存图用的是同一个目录，但这里只给读），之后自己按文件名取文件、传它的图床，
// 拿到地址换掉 Markdown 里的图片地址再灌进去。句柄只能由 native 给：脚本跑在网页上下文里，碰不到
// 本机文件系统，光有路径也造不出 File 对象；拿到目录后取文件就不用再跟 native 啰嗦了。

// 写作页。只认路径结尾，不认 /u/<账号 id> ——换账号登录、或被送回时带的 query 变了都还能认出来
const EDIT_PAGE_SUFFIX = "/blog/ai-write";

/** 图片上传接口：OSC 自己的图床（AI 创作这条线的），身份在 cookie 里，带 withCredentials 才验得过 */
const UPLOAD_IMAGE_URL = "https://apiv1.oschina.net/oschinapi/ai/creation/project/uploadDetail";

const CHECK_INTERVAL = 600;

let filled = false; // 本文档已经灌过一轮：页面自身的后续刷新不该再糊一遍

/** 正文编辑器：OSC 是 Markdown 编辑器，正文就落在一个 textarea 上 */
function getContentBox() {
  return document.querySelector("textarea");
}

/** 标题输入框：写作页上第一个 input */
function getTitleInput() {
  return document.querySelector("input");
}

/**
 * 赋值：走原型上的原生 setter，再派发一次 input 事件。
 * 页面是 Vue（v-model 绑在 value 上）：Vue 把实例上的 value 改写成自己的，直接 el.value = x
 * 只是改了 DOM 属性，它内部那个变量还是旧值，下一轮渲染就把改动冲掉了；只有
 * HTMLTextAreaElement / HTMLInputElement 原型上的原生 setter 能真正写进去，补一个 input 事件
 * 它才会当成"用户敲进去的"收进 model（顺带刷新预览）
 */
function setValue(el, text) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** 正文里的图：https://app.localhost/images/<文件名>；不是这个前缀的（外链图）抓不到 */
const IMAGE_URL_PREFIX = "https://app.localhost/images/";

/** 抓 Markdown 里的图片地址：![](https://app.localhost/images/xxx.png) → 文件名那一截 */
const IMAGE_URL_PATTERN = /https:\/\/app\.localhost\/images\/([^)\s"']+)/g;

/** 图片目录句柄（数据目录下的 images）：取一次就够；页面跳转后脚本重跑，缓存自然失效 */
let imageDir = null;

/** 向 native 要一次图片目录句柄：之后取文件全在 JS 侧完成，不用再为每张图往返一次 */
async function getImageDir() {
  if (!imageDir) imageDir = (await DDMsg.invokeWithObjects("getImageDir")).objects[0];
  return imageDir;
}

/** 按文件名从图片目录里取文件：File 自带文件名与 MIME，正好能直接进 FormData */
async function fileOfImage(name) {
  const dir = await getImageDir();
  const handle = await dir.getFileHandle(name);
  return await handle.getFile();
}

/**
 * 上传一张图，拿到它的图床地址。
 * 表单就一个 file 字段（二进制）；返回 JSON 的 result 是地址（success 为 true 才算成）。
 * 接口在 apiv1.oschina.net，与页面（my.oschina.net）不同源，靠它自己的 CORS 头放行；
 * 没登录或 CORS 不给过时会 reject，地址留空——正文里那张图就是个死链，但不拦别的
 */
function uploadImage(file) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", UPLOAD_IMAGE_URL, true);
    xhr.withCredentials = true; // 身份在 cookie 里，不带就验不过
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      if (xhr.status !== 200 && xhr.status !== 304) {
        reject(new Error("上传图片失败，HTTP " + xhr.status));
        return;
      }
      const data = JSON.parse(xhr.responseText);
      if (!data.success || !data.result) reject(new Error("上传图片没返回地址"));
      else resolve(data.result);
    };
    xhr.send(form);
  });
}

/**
 * 把 Markdown 里的图全部传上图床，地址换成返回的：
 * 按地址里的文件名从图片目录句柄里取文件（本机图片目录只有 native 能给入口），再走 OSC 的上传接口。
 * 外链图抓不到文件名，原样留着。串行一张张传：图一般不多，省得并发把它限流了。
 * 某张失败就保留原地址——多半是裂图，但不该为一张图把整篇都拦下
 */
async function uploadImages(text) {
  if (!text.includes(IMAGE_URL_PREFIX)) return text;
  // 同一张图可能在正文里出现多次：去重，只传一次
  const names = [...new Set([...text.matchAll(IMAGE_URL_PATTERN)].map((matched) => matched[1]))];
  let result = text;
  for (const name of names) {
    const url = await fileOfImage(name)
      .then((file) => uploadImage(file))
      .catch((err) => {
        console.log("[DraftDepot] 图片上传失败", name, err);
        return "";
      });
    if (!url) continue;
    result = result.split(IMAGE_URL_PREFIX + name).join(url);
  }
  return result;
}

const timer = setInterval(async () => {
  // 只在顶层文档干活：注入脚本每个 iframe 也会跑一遍，别钻到别人的框里去做判断
  if (window.self !== window.top) return;
  if (!location.pathname.endsWith(EDIT_PAGE_SUFFIX)) return; // 登录页 / 别的页面：等它自己跳回写作页

  // 写作页是 SPA：地址先落到，编辑器随后才渲染出来
  const contentBox = getContentBox();
  const titleInput = getTitleInput();
  if (!contentBox || !titleInput) return;
  clearInterval(timer);

  if (filled) return;
  filled = true;
  const article = await DDMsg.invoke("getArticle");
  // 两份都空 = 这一轮早给过了（页面刷新/跳转会让本脚本整个重跑），或这篇本来就没内容：都别动手
  if (!article || (!article.title && !article.html)) return;

  if (article.title) setValue(titleInput, article.title);
  // 图先传上去换成图床地址，再把 Markdown 写进编辑器（见文件头说明）
  if (article.html) setValue(contentBox, await uploadImages(article.html));
  console.log("[DraftDepot] 文章已灌入 OSC 编辑器");
}, CHECK_INTERVAL);
