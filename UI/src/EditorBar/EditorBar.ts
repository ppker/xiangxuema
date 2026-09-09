import "./EditorBar.scss";
import html from "./EditorBar.html?raw";
import CtrlBase from "../CtrlBase";
import Undo from "./Undo/Undo";
import Redo from "./Redo/Redo";
import FontFamily from "./FontFamily/FontFamily";
import FontSize from "./FontSize/FontSize";
import Bold from "./Bold/Bold";

/**
 * 编辑器工具栏（模块单例）。
 * 根元素 #editorBar 由 ArticleEditor 挂到标题栏之后；
 * 工具按钮按序挂载到 #editorBar 中。
 */
class EditorBar extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    Undo.appendTo(this.dom);
    Redo.appendTo(this.dom);
    this.appendDivider();
    FontFamily.appendTo(this.dom);
    FontSize.appendTo(this.dom);
    Bold.appendTo(this.dom);
  }

  /** 追加一条纵向分隔线 */
  private appendDivider(): void {
    const div = document.createElement("div");
    div.className = "divider";
    this.dom.appendChild(div);
  }
}

export default new EditorBar();
