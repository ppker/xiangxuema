import "./Header.scss";
import html from "./Header.html?raw";
import CtrlBase from "../../CtrlBase";

/**
 * 分类面板的标题栏（模块单例）。
 * 根元素 #categoryHeader 由 Category 挂到 #category 的最前面，分类树挂在它后面；
 * 右侧“添加分类”按钮的行为在这个组件里接（目前只是静态按钮）。
 */
class Header extends CtrlBase {
  constructor() {
    super(html);
  }
}

export default new Header();
