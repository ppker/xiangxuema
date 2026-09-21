// 由 PageSite::injectSiteScript 注入到 i.cnblogs.com，每个文档（含跳转后）都会跑一遍。
// 注入时前面拼了 Msg.js，所以直接用它挂的 window.DDMsg 跟 native 说话。
// 职责：进了文章编辑页（https://i.cnblogs.com/posts/edit，编辑器要在 Markdown 模式）就把
// "待发布的文章"（点发布按钮时由主编辑器交给 native 的）灌进博客园编辑器。
// 与开源中国同一套：正文在前端已经转成 Markdown（见 UI/src/EditorContent/Markdown.ts），
// 这里只管把它写进 CodeMirror，不做任何格式加工。
//
// 登录这件事不用脚本操心：没登录时打开 /posts/edit 会被博客园送到登录页，登录成功后又被自动送回
// ——那是另一次导航、另一个文档，本脚本会重新跑一遍。所以等"编辑页出现"不设超时：
// 从登录页到人输完验证码可能要好几分钟，超时放弃就等于白跑一趟。
// 唯一的例外是下面 NO_EDITOR_TIMEOUT 那一段：编辑页确实渲染出来了，但编辑器不是 Editor.md。
//
// 图片先不做：正文里的图是 https://app.localhost/images/<文件名>（本程序 WebView2 的虚拟映射），
// 博客园的服务器取不到，所以现在灌进去的图是死链。补的时候跟 OSC 走同一条路——站点脚本留一个
// uploadImage，其余（取文件、查"这张图传过没有"、换 Markdown 里的地址）交给 Msg.js 的
// DDMsg.imageUrl（照抄 JS/OSC.js 末尾 uploadImages 那一段即可）。

// 文章编辑页：认这一个，而不是"只要 hostname 是 i.cnblogs.com 就干"，
// 免得在后台的其它页面（随笔列表、设置）上乱找编辑器
const EDIT_PAGE = "/posts/edit";

const CHECK_INTERVAL = 600;

/** 博客园的偏好设置页：默认编辑器在这儿改（发现编辑器不是 Editor.md 时把人送过去） */
const PREFERENCE_URL = "https://i.cnblogs.com/preference";

/**
 * 编辑页已渲染却迟迟不见 CodeMirror，就认定默认编辑器不是 Editor.md（页面停在富文本模式）：
 * 那等下去也不会有。给 3 秒：editor.md 的初始化就在那一两拍里，等久了只让人干看着
 */
const NO_EDITOR_TIMEOUT = 3000;

let waited = 0; // 编辑页已就绪但 CodeMirror 还没出来的累计等待毫秒数

/**
 * 正文编辑器：Markdown 模式用的是 editor.md，正文在 CodeMirror 里。
 * CodeMirror 初始化时会把实例挂在它那个 textarea 的下一个兄弟节点上
 * （.editormd-markdown-textarea 是 editor.md 给这个 textarea 加的 class）
 */
function getCodeMirror() {
  const textarea = document.querySelector(".editormd-markdown-textarea");
  return textarea && textarea.nextSibling ? textarea.nextSibling.CodeMirror : null;
}

/** 标题输入框：#post-title（Markdown 模式与富文本模式共用这一个） */
function getTitleInput() {
  return document.getElementById("post-title");
}

const timer = setInterval(async () => {
  // 只在顶层文档干活：注入脚本每个 iframe 也会跑一遍，别钻到别人的框里去做判断
  if (window.self !== window.top) return;
  if (location.pathname !== EDIT_PAGE) return; // 登录页 / 别的页面：等它自己跳回编辑页

  // 编辑页是 SPA：地址先落到，标题框与 editor.md 随后才渲染出来
  const cm = getCodeMirror();
  const titleInput = getTitleInput();
  // 连标题框都还没有 = 页面还没渲染完：这一拍不算数，继续等
  if (!titleInput) return;

  // 页面就绪却没有 CodeMirror：多半停在富文本模式。攒够时间就提醒，不再干等
  if (!cm) {
    waited += CHECK_INTERVAL;
    if (waited < NO_EDITOR_TIMEOUT) return;
    clearInterval(timer);
    // 弹框提醒 → 点确定 → 系统默认浏览器打开偏好设置 → 关掉本窗口
    // （三步都由 native 做，见 PageSite::handleNotice）
    await DDMsg.invoke("notice", {
      text: "请把博客园默认编辑器设置为：Editor.md",
      url: PREFERENCE_URL,
    });
    return;
  }

  clearInterval(timer); // 取到就停表：一个文档只灌一次

  const article = await DDMsg.invoke("getArticle");
  // 两份都空 = 这一轮早给过了（页面刷新/跳转会让本脚本整个重跑），或这篇本来就没内容：都别动手
  if (!article || (!article.title && !article.html)) return;

  // 灌标题正文这一整段都盖着遮罩：那期间页面是半截的，别让人插手（见 Msg.js）
  await DDMsg.withMask(() => {
    // 标题是普通 input，直接写 value 就行：不像知乎那样是 React 受控组件，不必走 setter + 派事件
    if (article.title) titleInput.value = article.title;
    // 字段叫 html，这一趟装的其实是 Markdown（见文件头）；CodeMirror 自己的 setValue 会顺带刷新预览
    if (article.html) cm.setValue(article.html);
  });
  console.log("[DraftDepot] 文章已灌入博客园编辑器");
}, CHECK_INTERVAL);
