import "./Header.scss";
import html from "./Header.html?raw";
import CtrlBase from "../../CtrlBase";

/**
 * 分类面板的标题栏（模块单例）。
 * 根元素 #categoryHeader 由 Category 挂到 #category 的最前面，分类树挂在它后面；
 * 右侧“添加分类”按钮只在这里转发点击，具体做什么由 Category 接到 onAddClick 上。
 */
class Header extends CtrlBase {
  /** 右侧加号被点击时的回调，由 Category 注册；带按钮锚点（弹层始终定位在按钮正下方） */
  onAddClick: ((anchor: { rect: DOMRect; mayFlip: boolean }) => void) | null = null;

  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector<HTMLElement>("#addCategoryBtn")?.addEventListener("click", (e) => {
      const el = e.currentTarget as HTMLElement;
      this.onAddClick?.({ rect: el.getBoundingClientRect(), mayFlip: false });
    });
  }
}

export default new Header();
