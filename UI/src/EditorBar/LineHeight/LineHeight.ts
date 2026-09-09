import html from "./LineHeight.html?raw";
import lineHeightSvg from "../icon/lineHeight.svg?raw";
import CtrlBase from "../../CtrlBase";
import { getSelectedParagraphs } from "roosterjs-content-model-dom";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

/** 可选的行高倍数，展示顺序即列表顺序 */
const LINE_HEIGHTS = ["1", "1.5", "2", "2.5"];

/**
 * roosterjs 没有现成的 setLineHeight，这里走 formatContentModel：
 * 直接给所有选中段落的 format.lineHeight 赋值（挂到段落 CSS line-height，随文档保存）。
 */
function setLineHeight(lineHeight: string): void {
  const editor = EditorContent.editor;
  editor.focus();
  editor.formatContentModel(
    (model) => {
      const paragraphs = getSelectedParagraphs(model, true);
      if (paragraphs.length === 0) {
        return false;
      }
      paragraphs.forEach((paragraph) => {
        paragraph.format.lineHeight = lineHeight;
      });
      return true;
    },
    { apiName: "setLineHeight" },
  );
}

/**
 * 行高下拉（模块单例）。
 * 按钮为图标 + 箭头，点开展开挂到 body 的下拉；下拉项为固定倍数，选择后应用并回显选中态。
 */
class LineHeight extends CtrlBase {
  /** 当前行高（"1"/"1.5"/…），空串表示编辑器未给出选项中的值 */
  private current = "";
  private popup: HTMLDivElement | null = null;

  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector(".toolIcon")!.innerHTML = lineHeightSvg;
    this.dom.addEventListener("click", () => (this.popup ? this.close() : this.open()));
    Msg.on("editorState", (state) => this.render(state.lineHeight));
  }

  /** 记录当前行高：只认选项里的值，其它（如粘贴来的 "18px"）不点亮选中态 */
  private render(lineHeight: string): void {
    const value = (lineHeight ?? "").trim();
    this.current = LINE_HEIGHTS.includes(value) ? value : "";
  }

  private open(): void {
    const popup = document.createElement("div");
    popup.className = "fontDropdown lineHeightDropdown";
    for (const value of LINE_HEIGHTS) {
      const item = document.createElement("div");
      item.className = value === this.current ? "fontItem selected" : "fontItem";
      item.textContent = value;
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
    if (item?.textContent) {
      setLineHeight(item.textContent);
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

export default new LineHeight();
