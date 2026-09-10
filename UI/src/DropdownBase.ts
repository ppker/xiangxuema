import CtrlBase from "./CtrlBase";

/**
 * 下拉类工具栏按钮基类。
 * 统一封装此前在 FontFamily / FontSize / Heading / Align / LineHeight 中逐字重复的逻辑：
 * - 点击按钮开合（已展开则收起）
 * - 弹出层挂到 body，按按钮位置定位，下方放不下则向上翻折
 * - 点击弹层外部 / 窗口失焦时关闭
 *
 * 子类只需实现：
 * - buildPopup()：构建弹出层（含类名与列表项，列表项用 data-value 标记取值）
 * - onPicked(value, item)：选中某项后的处理（应用格式、回显、close() 等）
 */
export default abstract class DropdownBase extends CtrlBase {
  protected popup: HTMLDivElement | null = null;

  /** 构建弹出层（含类名与列表内容；列表项请用 data-value 标记取值） */
  protected abstract buildPopup(): HTMLDivElement;

  /** 选中某一项（value 取自该项的 data-value） */
  protected abstract onPicked(value: string, item: HTMLElement): void;

  /** 点击按钮时调用：已展开则收起，否则展开 */
  protected toggle(): void {
    this.popup ? this.close() : this.open();
  }

  protected open(): void {
    const popup = this.buildPopup();
    // 先挂载再量高度：挂载前 offsetHeight 为 0，会导致“向上翻折”判断失效
    document.body.appendChild(popup);
    this.position(popup);
    popup.addEventListener("click", this.onItemClick);
    document.addEventListener("mousedown", this.onDocMouseDown);
    window.addEventListener("blur", this.close);
    this.popup = popup;
  }

  protected close = (): void => {
    this.popup?.remove();
    this.popup = null;
    document.removeEventListener("mousedown", this.onDocMouseDown);
    window.removeEventListener("blur", this.close);
  };

  private position(popup: HTMLElement): void {
    const rect = this.dom!.getBoundingClientRect();
    const below = rect.bottom + 4;
    const popupHeight = popup.offsetHeight;
    popup.style.left = `${rect.left}px`;
    popup.style.top =
      below + popupHeight > window.innerHeight ? `${rect.top - popupHeight - 4}px` : `${below}px`;
  }

  /** 事件委托：点中带 data-value 的列表项交给子类处理 */
  private onItemClick = (e: MouseEvent): void => {
    const item = (e.target as HTMLElement).closest<HTMLElement>("[data-value]");
    if (item) {
      this.onPicked(item.dataset.value ?? "", item);
    }
  };

  /** 仅在展开期间绑定，因此触发时弹层必然存在 */
  private onDocMouseDown = (e: MouseEvent): void => {
    const target = e.target as Node;
    if (!this.dom!.contains(target) && !this.popup!.contains(target)) {
      this.close();
    }
  };
}
