import "./EditorBar.scss";
import html from "./EditorBar.html?raw";
import CtrlBase from "../CtrlBase";
import Undo from "./Undo/Undo";
import Redo from "./Redo/Redo";
import Heading from "./Heading/Heading";
import FontFamily from "./FontFamily/FontFamily";
import FontSize from "./FontSize/FontSize";
import Bold from "./Bold/Bold";
import Italic from "./Italic/Italic";
import Underline from "./Underline/Underline";
import Strikethrough from "./Strikethrough/Strikethrough";
import TextColor from "./TextColor/TextColor";
import BackgroundColor from "./BackgroundColor/BackgroundColor";
import Align from "./Align/Align";
import LineHeight from "./LineHeight/LineHeight";
import ListBullet from "./ListBullet/ListBullet";
import ListNumber from "./ListNumber/ListNumber";
import Subscript from "./Subscript/Subscript";
import Superscript from "./Superscript/Superscript";
import Link from "./Link/Link";
import LinkRemove from "./LinkRemove/LinkRemove";
import Quote from "./Quote/Quote";

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
    Heading.appendTo(this.dom);
    FontFamily.appendTo(this.dom);
    FontSize.appendTo(this.dom);
    Bold.appendTo(this.dom);
    Italic.appendTo(this.dom);
    Underline.appendTo(this.dom);
    Strikethrough.appendTo(this.dom);
    Subscript.appendTo(this.dom);
    Superscript.appendTo(this.dom);
    this.appendDivider();
    TextColor.appendTo(this.dom);
    BackgroundColor.appendTo(this.dom);
    Quote.appendTo(this.dom);
    this.appendDivider();
    Align.appendTo(this.dom);
    LineHeight.appendTo(this.dom);
    this.appendDivider();
    ListBullet.appendTo(this.dom);
    ListNumber.appendTo(this.dom);
    this.appendDivider();
    Link.appendTo(this.dom);
    LinkRemove.appendTo(this.dom);
    this.appendDivider();
  }

  /** 追加一条纵向分隔线 */
  private appendDivider(): void {
    const div = document.createElement("div");
    div.className = "divider";
    this.dom.appendChild(div);
  }
}

export default new EditorBar();
