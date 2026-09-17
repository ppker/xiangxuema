import "./EditorTitle.scss";
import html from "./EditorTitle.html?raw";
import CtrlBase from "../CtrlBase";

/**
 * 编辑器顶部的文章标题栏（模块单例）。
 * 根元素 #editorTitle 由 ArticleEditor 挂到其顶部；
 * 左侧是标题输入框 #articleTitleInput，右侧是发布按钮 #publishBtn
 * （点击后把文章发布到外部平台，行为待接线）。
 */
class EditorTitle extends CtrlBase {
  constructor() {
    super(html);
  }
}

export default new EditorTitle();
