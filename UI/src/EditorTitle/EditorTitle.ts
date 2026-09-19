import "./EditorTitle.scss";
import html from "./EditorTitle.html?raw";
import CtrlBase from "../CtrlBase";
import Msg from "../Msg";
import EditorContent from "../EditorContent/EditorContent";
import forWeiXin from "../EditorContent/WeiXinHtml";

/**
 * 发布目标：按钮 title → 站点类型（存进 WindowSite.type）。
 * 不再带 URL：打开哪个地址由 native 按 type 决定（微信有 token 就直接进编辑页）。
 * 加平台只往这里加一条，native 不用改。
 */
const publishTargets = [
  { title: "发布到微信", type: "WeiXin" },
  { title: "发布到CSDN", type: "CSDN" },
];

/**
 * 编辑器顶部的文章标题栏（模块单例）。
 * 根元素 #editorTitle 由 ArticleEditor 挂到其顶部；
 * 左侧是标题输入框 #articleTitleInput，右侧是发布按钮 .publishBtn
 * （点击后把文章发布到外部平台：调 Msg.invoke("openSite", { type, title, html })，
 * type 决定开哪个 platform，title/html 是给对方编辑器用的当前文章内容）。
 */
class EditorTitle extends CtrlBase {
  constructor() {
    super(html);
  }

  /** 文章标题输入框：由 ArticleTitle 读写（载入文章时填标题，入库时取标题） */
  get input(): HTMLInputElement {
    return this.dom.querySelector<HTMLInputElement>("#articleTitleInput");
  }

  override ready(): void {
    // 标题一被改动就广播出去：由 ArticleTitle 写回当前选中的那篇（最多 2 秒一次）
    this.input.addEventListener("input", () => Msg.emit("articleTitleEdited"));
    // 用 title 属性精确锁定按钮，避免依赖 HTML 里 8 个 .publishBtn 的顺序
    for (const target of publishTargets) {
      const btn = this.dom.querySelector<HTMLElement>(`.publishBtn[title="${target.title}"]`);
      btn.addEventListener("click", () => {
        // 连同当前标题与正文一起交给 native：site 窗口里的脚本（如 WeiXin.js）进到对方编辑器后会来取。
        // 两个窗口是各自独立的 WebView2，互相看不见，内容只能靠 native 中转
        Msg.invoke("openSite", {
          type: target.type,
          title: this.input.value,
          // 只有微信要这份收拾过的正文（行高偏小会被判成文字重叠），别家先原样给
          html: target.type === "WeiXin" ? forWeiXin(EditorContent.content) : EditorContent.content,
        });
      });
    }
  }
}

export default new EditorTitle();
