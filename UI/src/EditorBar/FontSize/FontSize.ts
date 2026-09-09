import html from "./FontSize.html?raw";
import CtrlBase from "../../CtrlBase";
import { setFontSize } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

/** 下拉可选的文字大小（像素 px，整数档位），展示顺序即列表顺序 */
const FONT_SIZES = [10, 11, 12, 14, 15, 16, 18, 20, 24, 28, 36, 48, 72];

/**
 * 字号选择器（模块单例）。
 * 根元素即工具栏按钮；下拉列表在展开时用 DOM 构建挂到 body，关闭即移除。
 * 与 FontFamily 同构，仅值来源不同：以 px 设置/展示文字大小。
 * 注意 editorState.fontSize 由 roosterjs 统一折算成 pt（如 "11.25pt" 对应 15px），
 * 显示前需换算回 px。
 */
class FontSize extends CtrlBase {
  /** 当前文字大小（px 展示文本，如 "15px"），空串表示编辑器未给出字号 */
  private current = "";
  private popup: HTMLDivElement | null = null;

  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.addEventListener("click", () => (this.popup ? this.close() : this.open()));
    Msg.on("editorState", (state) => this.render(state.fontSize));
  }

  /** 用当前字号渲染按钮标签与下拉选中态 */
  private render(fontSize: string): void {
    this.current = this.stateToPxText(fontSize);
    this.dom.querySelector<HTMLElement>(".fontName").textContent = this.current || "默认";
  }

  /**
   * 状态字号转 px 展示文本。
   * 状态值形如 "11.25pt"（px 折算而来，见 retrieveModelFormatState），pt→px = ×4/3 取整；
   * 若已是 px 单位则原样取值。
   */
  private stateToPxText(fontSize: string): string {
    const m = /^(\d+(?:\.\d+)?)\s*(px|pt)/i.exec(fontSize ?? "");
    if (!m) {
      return "";
    }
    const value = parseFloat(m[1]);
    const px = m[2].toLowerCase() === "px" ? value : Math.round((value * 4) / 3);
    return `${px}px`;
  }

  private open(): void {
    const popup = document.createElement("div");
    popup.className = "fontDropdown sizeDropdown";
    for (const size of FONT_SIZES) {
      const item = document.createElement("div");
      item.className = this.current === `${size}px` ? "fontItem selected" : "fontItem";
      item.textContent = `${size}px`;
      popup.appendChild(item);
    }
    popup.addEventListener("click", this.onItemClick);
    const rect = this.dom.getBoundingClientRect();
    const below = rect.bottom + 4;
    const popupHeight = popup.offsetHeight;
    popup.style.left = `${rect.left}px`;
    popup.style.top = below + popupHeight > window.innerHeight ? `${rect.top - popupHeight - 4}px` : `${below}px`;
    document.addEventListener("mousedown", this.onDocMouseDown);
    window.addEventListener("blur", this.close);
    document.body.appendChild(popup);
    this.popup = popup;
  }

  /** 事件委托：popup 上只绑一个 click，点中哪项由目标元素定位 */
  private onItemClick = (e: MouseEvent) => {
    const item = (e.target as HTMLElement).closest(".fontItem") as HTMLElement | null;
    if (item) {
      // item.textContent 形如 "16px"，按 px 设置
      setFontSize(EditorContent.editor, item.textContent);
      this.render(item.textContent);
      this.close();
    }
  };

  private close(): void {
    this.popup?.remove();
    this.popup = null;
    document.removeEventListener("mousedown", this.onDocMouseDown);
    window.removeEventListener("blur", this.close);
  }

  /** 仅在展开期间绑定，因此触发时弹层必然存在 */
  private onDocMouseDown = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!this.dom.contains(target) && !this.popup!.contains(target)) {
      this.close();
    }
  };
}

export default new FontSize();
