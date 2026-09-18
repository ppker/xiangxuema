import "./EditorTitle.scss";
import html from "./EditorTitle.html?raw";
import CtrlBase from "../CtrlBase";
import Msg from "../Msg";

/**
 * 发布目标：按钮 title → 打开的 URL，以及一并传给 native 的站点类型（存进 WindowSite.type）。
 * 加平台只往这里加一条，native 不用改。
 */
const publishTargets = [
  { title: "发布到微信", url: "https://mp.weixin.qq.com/", type: "WeiXin" },
  { title: "发布到CSDN", url: "https://mp.csdn.net/", type: "CSDN" },
];

/**
 * 编辑器顶部的文章标题栏（模块单例）。
 * 根元素 #editorTitle 由 ArticleEditor 挂到其顶部；
 * 左侧是标题输入框 #articleTitleInput，右侧是发布按钮 .publishBtn
 * （点击后把文章发布到外部平台：调 Msg.invoke("openSite", { url, type }) 让主 Page 派发到 WindowSite 新开一个浏览器窗口）。
 */
class EditorTitle extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    // 用 title 属性精确锁定按钮，避免依赖 HTML 里 8 个 .publishBtn 的顺序
    for (const target of publishTargets) {
      const btn = this.dom.querySelector<HTMLElement>(`.publishBtn[title="${target.title}"]`);
      btn.addEventListener("click", () => {
        Msg.invoke("openSite", { url: target.url, type: target.type });
      });
    }
  }
}

export default new EditorTitle();