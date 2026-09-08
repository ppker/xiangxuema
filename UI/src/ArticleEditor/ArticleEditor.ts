import "./ArticleEditor.scss";
import html from "./ArticleEditor.html?raw";
import CtrlBase from "../CtrlBase";
import EditorTitle from "../EditorTitle/EditorTitle";
import EditorBar from "../EditorBar/EditorBar";
import EditorContent from "../EditorContent/EditorContent";

/**
 * 右侧文章编辑面板（模块单例）。
 * 面板即 #articleEditor 自身（弹性宽度），由 ContentBox 挂到最右侧槽位；
 * 内部纵向依次挂载：标题栏 / 工具栏 / 富文本编辑区。
 */
class ArticleEditor extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    EditorTitle.appendTo(this.dom);
    EditorBar.appendTo(this.dom);
    EditorContent.appendTo(this.dom);
  }
}

export default new ArticleEditor();
