import "./EditorTitle.scss";
import html from "./EditorTitle.html?raw";
import CtrlBase from "../CtrlBase";
import Msg from "../Msg";
import EditorContent from "../EditorContent/EditorContent";
import forWeiXin from "../EditorContent/WeiXinHtml";
import forZhiHu from "../EditorContent/ZhiHuHtml";
import forCSDN from "../EditorContent/CSDNHtml";
import toMarkdown from "../EditorContent/Markdown";

/**
 * 发布目标：按钮 title → 站点类型（存进 WindowSite.type）。
 * 不再带 URL：打开哪个地址由 native 按 type 决定（微信有 token 就直接进编辑页）。
 * 加平台只往这里加一条，native 不用改（但它的落地地址要进 WindowSite.cpp 的 siteHome）。
 */
const publishTargets = [
  { title: "发布到微信", type: "WeiXin" },
  { title: "发布到知乎", type: "ZhiHu" },
  { title: "发布到CSDN", type: "CSDN" },
  { title: "发布到博客园", type: "CnBlogs" },
  { title: "发布到开源中国", type: "OSC" },
];

/**
 * 各平台要的正文形态：type → 转换函数（不登记的先原样给）。
 * 微信要整段摊平成它自己的段落结构、着色靠 shiki 内联色；知乎反过来——只标代码块语言，
 * 样式一概不塞（它只认自己的语义结构，见 ZhiHuHtml）；CSDN 与知乎同一套（见 CSDNHtml）。
 * 开源中国与博客园都是 Markdown 编辑器，所以它们不是"另一种 HTML"，而是整篇转 Markdown（见 Markdown）。
 * 图片都由站点脚本在对方编辑页里传图床（见 JS/WeiXin.js、JS/ZhiHu.js、JS/CSDN.js、JS/OSC.js、
 * JS/CnBlogs.js）。
 */
const forSite: Record<string, (html: string) => Promise<string> | string> = {
  WeiXin: forWeiXin,
  ZhiHu: forZhiHu,
  CSDN: forCSDN,
  OSC: toMarkdown,
  CnBlogs: toMarkdown,
};

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
      // 转换可能是异步的（转 Markdown 那份要读数据目录），所以这里一律 await
      btn.addEventListener("click", async () => {
        const content = EditorContent.content;
        // 连同当前标题与正文一起交给 native：site 窗口里的脚本（如 WeiXin.js）进到对方编辑器后会来取。
        // 两个窗口是各自独立的 WebView2，互相看不见，内容只能靠 native 中转
        const convert = forSite[target.type];
        Msg.invoke("openSite", {
          type: target.type,
          title: this.input.value,
          html: convert ? await convert(content) : content,
        });
      });
    }
  }
}

export default new EditorTitle();
