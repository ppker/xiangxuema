import "./Header.scss";
import html from "./Header.html?raw";
import CtrlBase from "../../CtrlBase";

/**
 * 分类面板的标题栏（模块单例）。
 * 根元素 #categoryHeader 由 Category 挂到 #category 的最前面，分类树挂在它后面；
 * 右侧“添加分类”按钮只在这里转发点击，具体做什么由 Category 接到 onAddClick 上。
 */
class Header extends CtrlBase {
  /** 右侧加号被点击时的回调，由 Category 注册；带点击位置（弹层要贴鼠标） */
  onAddClick: ((at: { x: number; y: number }) => void) | null = null;

  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector<HTMLElement>("#addCategoryBtn")?.addEventListener("click", (e) => {
      this.onAddClick?.({ x: e.clientX, y: e.clientY });
    });
  }
}

export default new Header();
