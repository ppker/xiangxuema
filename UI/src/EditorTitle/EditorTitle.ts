import "./EditorTitle.scss";
import html from "./EditorTitle.html?raw";
import CtrlBase from "../CtrlBase";

/**
 * 编辑器顶部的文章标题输入栏（模块单例）。
 * 根元素 #editorTitle 由 ArticleEditor 挂到其顶部；
 * 内容为标题输入框 #articleTitleInput。
 */
class EditorTitle extends CtrlBase {
  constructor() {
    super(html);
  }
}

export default new EditorTitle();
