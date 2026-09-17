import "./EditorTitle.scss";
import html from "./EditorTitle.html?raw";
import CtrlBase from "../CtrlBase";
import Msg from "../Msg";

/**
 * 编辑器顶部的文章标题栏（模块单例）。
 * 根元素 #editorTitle 由 ArticleEditor 挂到其顶部；
 * 左侧是标题输入框 #articleTitleInput，右侧是发布按钮 .publishBtn
 * （点击后把文章发布到外部平台：当前只接"发布到微信"，调 Msg.invoke("openSite", { url }) 让主 Page 派发到 WindowSite 新开一个浏览器窗口）。
 */
class EditorTitle extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    // 用 title 属性精确锁定"发布到微信"那个按钮，避免依赖 HTML 里 7 个 .publishBtn 的顺序
    const weixinBtn = this.dom.querySelector<HTMLElement>('.publishBtn[title="发布到微信"]');
    if (weixinBtn) {
      weixinBtn.addEventListener("click", () => {
        Msg.invoke("openSite", { url: "https://mp.weixin.qq.com/" });
      });
    }
  }
}

export default new EditorTitle();