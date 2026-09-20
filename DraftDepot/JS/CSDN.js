// 由 PageSite::injectSiteScript 注入到 mp.csdn.net，每个文档（含跳转后）都会跑一遍。
// 注入时前面拼了 Msg.js，所以直接用它挂的 window.DDMsg 跟 native 说话。
// 职责：进了文章编辑页就把"待发布的文章"（点发布按钮时由主编辑器交给 native 的）灌进 CSDN 编辑器。
//
// 登录这件事不用脚本操心：没登录时打开编辑页会被 CSDN 送到登录页，登录成功后又被自动送回编辑页
// ——那是另一次导航、另一个文档，本脚本会重新跑一遍（与知乎同一套逻辑，见 JS/ZhiHu.js）。
//
// 图片是唯一要额外跑一趟的事：正文里的图是 https://app.localhost/images/<文件名>（本程序 WebView2
// 的虚拟映射，CSDN 取不到）。试过把图读成 base64 内联进 <img src> 直接给它的编辑器，CSDN 那边不认
// （它的服务端不收内联图，存下来就没了），所以只能跟知乎一样：先向 native 要一次图片目录的句柄
// （File System Access，跟主窗口存图用的是同一个目录，但这里只给读），自己按文件名取文件、传它的
// 图床，拿到地址换掉正文里的 src 再灌进去。句柄只能由 native 给：脚本跑在网页上下文里，碰不到本机
// 文件系统，光有路径也造不出 File 对象；拿到目录后取文件就不用再跟 native 啰嗦了。

// 文章编辑页。认这一个而不是"只要 hostname 是 mp.csdn.net 就干"，是为了避开创作中心的首页
const EDIT_PAGE = "/mp_blog/creation/editor";

const CHECK_INTERVAL = 600;

let filled = false; // 本文档已经灌过一轮：页面自身的后续刷新不该再糊一遍

/**
 * 正文编辑器：CSDN 用的是 CKEditor，实例挂在 window.CKEDITOR.instances.editor 上。
 * 按实例名直接取，不去猜 DOM 里的 contenteditable——它的编辑区在自己的 iframe / divarea 里
 */
function getEditor() {
  const ck = window.CKEDITOR;
  return ck && ck.instances && ck.instances.editor ? ck.instances.editor : null;
}

/** 标题输入框：<input id="txtTitle"> */
function getTitleInput() {
  return document.getElementById("txtTitle");
}

/**
 * 标题：赋值后再派发一次 input 事件——页面是 Vue 的，光改 value 它内部绑的变量还是旧值，
 * 下一轮渲染会把改动冲掉；派发事件它才会当成"用户敲进去的"更新上去
 */
function setTitle(input, text) {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** 正文里的图：https://app.localhost/images/<文件名> → 文件名；不是这个前缀的（外链图）返回空串 */
const IMAGE_URL_PREFIX = "https://app.localhost/images/";

function fileNameOf(src) {
  return src.startsWith(IMAGE_URL_PREFIX) ? src.slice(IMAGE_URL_PREFIX.length) : "";
}

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
 * 走页面自己的上传函数 window.csdn.upload.uploadImg(file, 业务类型, "")：图床地址、鉴权、签名
 * 全在它自己手里，我们只把文件交出去，省得跟着它换接口。
 * 返回值整份打到控制台：约定是拿 [0].data.data.imageUrl，哪天它改了结构，照着打印改这一行就行
 */
async function uploadImage(file) {
  const result = await window.csdn.upload.uploadImg({
        appName: "direct_blog",
        type: "blog",
        imageTemplate: "",
        file: file
    });
  console.log("[DraftDepot] uploadImg 返回", result);
  return result[0].data.data.imageUrl;
}

/**
 * 把正文里的图全部传上图床，src 换成返回的地址：
 * 按 src 里的文件名从图片目录句柄里取文件（本机图片目录只有 native 能给入口），再交给页面自己的上传函数。
 * 外链图取不到文件名，原样留着。串行一张张传：图一般不多，省得并发把它限流了。
 * 某张失败就保留原地址——多半是裂图，但不该为一张图把整篇都拦下
 */
async function uploadImages(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const name = fileNameOf(img.getAttribute("src") || "");
    if (!name) continue;
    const url = await fileOfImage(name)
      .then((file) => uploadImage(file))
      .catch((err) => {
        console.log("[DraftDepot] 图片上传失败", name, err);
        return "";
      });
    if (url) img.setAttribute("src", url);
  }
  return doc.body.innerHTML;
}

const timer = setInterval(async () => {
  // 只在顶层文档干活：注入脚本每个 iframe 也会跑一遍，别钻到别人的框里去做判断
  if (window.self !== window.top) return;
  if (location.pathname !== EDIT_PAGE) return; // 登录页 / 别的页面：等它自己跳回编辑页

  // 编辑页是 SPA：地址先落到，编辑器随后才初始化完。CKEditor 建完实例还要等 status 变 ready
  // （那会儿它的编辑区才真正可用），没 ready 就 setData 会落空
  const editor = getEditor();
  if (!editor || editor.status !== "ready") return;
  // 不设等待超时：从登录页到人输完验证码可能要好几分钟，超时放弃就等于白跑一趟。
  // 反复等没有副作用——灌入由 filled 挡着，每个文档最多灌一次
  clearInterval(timer);

  if (filled) return;
  filled = true;
  const article = await DDMsg.invoke("getArticle");
  // 两份都空 = 这一轮早给过了（页面刷新/跳转会让本脚本整个重跑），或这篇本来就没内容：都别动手
  if (!article || (!article.title && !article.html)) return;

  const titleInput = getTitleInput();
  if (article.title && titleInput) setTitle(titleInput, article.title);
  if (article.html) editor.setData(await uploadImages(article.html));
  console.log("[DraftDepot] 文章已灌入 CSDN 编辑器");
}, CHECK_INTERVAL);
