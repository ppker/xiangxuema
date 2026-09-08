import "./ArticleTitle.scss";
import html from "./ArticleTitle.html?raw";
import CtrlBase from "../CtrlBase";

/**
 * 中部文章标题面板（模块单例）。
 * 面板即 #articleTitle 自身，由 ContentBox 挂到中间分栏槽位；
 * 当前为空壳，后续内容在此填充。
 */
class ArticleTitle extends CtrlBase {
  constructor() {
    super(html);
  }
}

export default new ArticleTitle();
