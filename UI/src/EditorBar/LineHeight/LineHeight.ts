import html from "./LineHeight.html?raw";
import lineHeightSvg from "../icon/lineHeight.svg?raw";
import DropdownBase from "../../DropdownBase";
import { getSelectedParagraphs } from "roosterjs-content-model-dom";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

/** 可选的行高倍数（相对字号，CSS 无单位 line-height），展示顺序即列表顺序 */
const LINE_HEIGHTS = ["1", "1.5", "2", "2.5", "3"];

/** 编辑器正文默认行高：需与 EditorContent.scss 中 #editorContent 的 line-height 保持一致。
 *  段落未显式设置行高时继承该默认值，回显视为选中档位 "1.5"。 */
const DEFAULT_LINE_HEIGHT = "1.5";

/**
 * 行高下拉（模块单例）。
 * 按钮为图标 + 箭头，点开展开挂到 body 的下拉；下拉项为固定倍数，选择后应用并回显选中态。
 * 开合/定位/外部关闭逻辑见 DropdownBase。
 */
class LineHeight extends DropdownBase {
  /** 当前行高档位（"1"/"1.5"/…）；初始为默认档位，即下拉默认选中 "1.5" */
  private current = DEFAULT_LINE_HEIGHT;

  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector(".toolIcon")!.innerHTML = lineHeightSvg;
    this.dom.addEventListener("click", () => this.toggle());
    Msg.on("editorState", (state) => this.render(state.lineHeight, state.fontSize));
  }

  /**
   * 记录当前行高档位。
   * roosterjs 上报的 lineHeight 是浏览器折算后的绝对值（如 15px 字号下的默认行高为 "22.5px"），
   * 因此需除以当前字号 fontSize 换算回"相对字号的倍数"再匹配档位；
   * 若拿不到可解析的行高（空文档/未聚焦），按默认档位 1.5 回显。
   */
  private render(lineHeight?: string, fontSize?: string): void {
    const linePx = this.toPx(lineHeight);
    const fontPx = this.toPx(fontSize);
    if (linePx <= 0) {
      this.current = DEFAULT_LINE_HEIGHT;
      return;
    }
    if (fontPx <= 0) {
      this.current = "";
      return;
    }

    const factor = linePx / fontPx;
    // 匹配最接近的档位；容差 0.1（换算可能出现极小的浮点/取整误差），其它值不点亮选中态
    let closest: string | null = null;
    for (const item of LINE_HEIGHTS) {
      const diff = Math.abs(parseFloat(item) - factor);
      if (closest === null || diff < Math.abs(parseFloat(closest) - factor)) {
        closest = item;
      }
    }
    this.current = closest && Math.abs(parseFloat(closest) - factor) < 0.1 ? closest : "";
  }

  /** 长度转 px：pt→px = ×4/3（与 FontSize.ts 一致）；非长度值返回 0 */
  private toPx(length: string | undefined): number {
    const m = /^(\d+(?:\.\d+)?)\s*(px|pt)$/i.exec((length ?? "").trim());
    if (!m) {
      return 0;
    }
    return m[2].toLowerCase() === "px" ? parseFloat(m[1]) : (parseFloat(m[1]) * 4) / 3;
  }

  protected buildPopup(): HTMLDivElement {
    const popup = document.createElement("div");
    popup.className = "fontDropdown lineHeightDropdown";
    for (const value of LINE_HEIGHTS) {
      const item = document.createElement("div");
      item.className = value === this.current ? "fontItem selected" : "fontItem";
      item.dataset.value = value;
      item.textContent = value;
      popup.appendChild(item);
    }
    return popup;
  }

  protected onPicked(value: string): void {
    const editor = EditorContent.editor;
    editor.focus();
    editor.formatContentModel(
      (model) => {
        const paragraphs = getSelectedParagraphs(model, true);
        if (paragraphs.length === 0) {
          return false;
        }
        paragraphs.forEach((paragraph) => {
          paragraph.format.lineHeight = value;
        });
        return true;
      },
      { apiName: "setLineHeight" },
    );
    // 应用的是下拉档位本身，直接作为选中态（后续 editorState 会按 px 换算回同一档位）
    this.current = value;
    this.close();
  }
}

export default new LineHeight();
