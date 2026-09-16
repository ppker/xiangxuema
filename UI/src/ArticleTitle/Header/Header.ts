import "./Header.scss";
import html from "./Header.html?raw";
import CtrlBase from "../../CtrlBase";

/**
 * 文章列表面板的标题栏（模块单例）。
 * 根元素 #articleListHeader 由 ArticleTitle 挂到 #articleTitle 的最前面，
 * 文章列表挂在它后面；右侧“添加文章”按钮的行为在这个组件里接（目前只是静态按钮）。
 */
class Header extends CtrlBase {
  constructor() {
    super(html);
  }
}

export default new Header();
