import html from "./FontFamily.html?raw";
import DropdownBase from "../../DropdownBase";
import { setFontName } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

/** 下拉可选的字体，展示顺序即列表顺序 */
const FONT_OPTIONS = ["微软雅黑", "宋体", "黑体", "仿宋", "楷体", "Arial", "Times New Roman", "Courier New"];

/**
 * 字体选择器（模块单例）。
 * 根元素即工具栏按钮；下拉列表在展开时用 DOM 构建挂到 body，关闭即移除（开合逻辑见 DropdownBase）。
 */
class FontFamily extends DropdownBase {
  private current = "";

  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.addEventListener("click", () => this.toggle());
    Msg.on("editorState", (state) => this.render(state.fontName));
  }

  /** 用当前字体渲染按钮标签与下拉选中态（编辑器给的 fontFamily 可能带引号/回退列表，取首个并去引号） */
  private render(fontName: string): void {
    this.current = (fontName ?? "").split(",")[0].trim().replace(/^["']|["']$/g, "");
    this.dom.querySelector<HTMLElement>(".fontName").textContent = this.current || "默认";
  }

  protected buildPopup(): HTMLDivElement {
    const popup = document.createElement("div");
    popup.className = "fontDropdown";
    for (const name of FONT_OPTIONS) {
      const item = document.createElement("div");
      item.className = name === this.current ? "fontItem selected" : "fontItem";
      item.dataset.value = name;
      item.textContent = name;
      item.style.fontFamily = name;
      popup.appendChild(item);
    }
    return popup;
  }

  protected onPicked(value: string): void {
    setFontName(EditorContent.editor, value);
    this.render(value);
    this.close();
  }
}

export default new FontFamily();
