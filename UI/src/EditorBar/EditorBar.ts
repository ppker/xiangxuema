import "./EditorBar.scss";
import html from "./EditorBar.html?raw";
import CtrlBase from "../CtrlBase";
import Heading from "./Heading/Heading";
import FontFamily from "./FontFamily/FontFamily";
import FontSize from "./FontSize/FontSize";
import TextColor from "./TextColor/TextColor";
import BackgroundColor from "./BackgroundColor/BackgroundColor";
import Align from "./Align/Align";
import LineHeight from "./LineHeight/LineHeight";
import Link from "./Link/Link";
import {
  boldButton,
  imageButton,
  italicButton,
  linkRemoveButton,
  listBulletButton,
  listNumberButton,
  quoteButton,
  redoButton,
  strikethroughButton,
  subscriptButton,
  superscriptButton,
  underlineButton,
  undoButton,
} from "./buttons";

/**
 * 工具栏分组：组内按声明顺序排列，组间自动插入竖向分隔线。
 * 新增工具：
 * - 无弹层的按钮 → 在 buttons.ts 加一条声明，放进对应分组
 * - 带下拉/弹层的控件 → 在各自目录实现 CtrlBase（下拉继承 DropdownBase），放进对应分组
 */
const GROUPS: CtrlBase[][] = [
  [undoButton, redoButton],
  [
    Heading,
    FontFamily,
    FontSize,
    boldButton,
    italicButton,
    underlineButton,
    strikethroughButton,
    subscriptButton,
    superscriptButton,
  ],
  [TextColor, BackgroundColor, quoteButton],
  [Align, LineHeight],
  [listBulletButton, listNumberButton],
  // 插入类：链接 + 图片
  [Link, linkRemoveButton, imageButton],
];

/**
 * 编辑器工具栏（模块单例）。
 * 根元素 #editorBar 由 ArticleEditor 挂到标题栏之后。
 */
class EditorBar extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    GROUPS.forEach((group, index) => {
      if (index > 0) {
        this.appendDivider();
      }
      for (const ctrl of group) {
        ctrl.appendTo(this.dom);
      }
    });
    // 末尾分隔线，与原有视觉一致
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
