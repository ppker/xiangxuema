import html from "./FontFamily.html?raw";
import CtrlBase from "../../CtrlBase";
import { setFontName } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

/** 下拉可选的字体，展示顺序即列表顺序 */
const FONT_OPTIONS = ["微软雅黑", "宋体", "黑体", "仿宋", "楷体", "Arial", "Times New Roman", "Courier New"];

/**
 * 字体选择器（模块单例）。
 * 根元素即工具栏按钮；下拉列表在展开时用 DOM 构建挂到 body，关闭即移除。
 */
class FontFamily extends CtrlBase {
  private current = "";
  private popup: HTMLDivElement | null = null;

  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.addEventListener("click", () => (this.popup ? this.close() : this.open()));
    Msg.on("editorState", (state) => this.render(state.fontName));
  }

  /** 用当前字体渲染按钮标签与下拉选中态（编辑器给的 fontFamily 可能带引号/回退列表，取首个并去引号） */
  private render(fontName: string): void {
    this.current = (fontName ?? "").split(",")[0].trim().replace(/^["']|["']$/g, "");
    this.dom.querySelector<HTMLElement>(".fontName").textContent = this.current || "默认";
  }

  private open(): void {
    const popup = document.createElement("div");
    popup.className = "fontDropdown";
    for (const name of FONT_OPTIONS) {
      const item = document.createElement("div");
      item.className = name === this.current ? "fontItem selected" : "fontItem";
      item.textContent = name;
      item.style.fontFamily = name;
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
      setFontName(EditorContent.editor, item.style.fontFamily);
      this.render(item.style.fontFamily);
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

export default new FontFamily();
