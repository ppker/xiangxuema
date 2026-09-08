import "./Category.scss";
import html from "./Category.html?raw";
import CtrlBase from "../CtrlBase";

/**
 * 左侧分类目录面板（模块单例）。
 * 面板即 #category 自身（宽度/背景样式在本组件 scss 中），由 ContentBox 挂到分栏槽位；
 * 当前为空壳，后续分类树内容在此填充。
 */
class Category extends CtrlBase {
  constructor() {
    super(html);
  }
}

export default new Category();
