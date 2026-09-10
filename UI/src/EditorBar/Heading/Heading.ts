import html from "./Heading.html?raw";
import DropdownBase from "../../DropdownBase";
import { setHeadingLevel } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

type HeadingLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 列表项：普通段落(0)放最后，一级~六级标题在前（展示顺序即下拉顺序） */
const HEADING_ITEMS: { level: HeadingLevel; label: string }[] = [
  { level: 1, label: "一级标题" },
  { level: 2, label: "二级标题" },
  { level: 3, label: "三级标题" },
  { level: 4, label: "四级标题" },
  { level: 5, label: "五级标题" },
  { level: 6, label: "六级标题" },
  { level: 0, label: "普通段落" },
];

const LABEL_OF: Record<HeadingLevel, string> = {
  0: "普通段落",
  1: "一级标题",
  2: "二级标题",
  3: "三级标题",
  4: "四级标题",
  5: "五级标题",
  6: "六级标题",
};

/**
 * 标题/段落下拉（模块单例）。
 * 下拉列表内容：一级~六级标题（h1~h6）+ 普通段落。
 * - 选中某项：光标/选区所在段落设为对应标题级别（0 表示恢复普通段落）
 * - 按钮文字随光标所在段的标题级别联动（来自 getFormatState 的 headingLevel）
 * 开合/定位/外部关闭逻辑见 DropdownBase。
 */
class Heading extends DropdownBase {
  private current: HeadingLevel = 0;

  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.addEventListener("click", () => this.toggle());
    Msg.on("editorState", (state) => this.render(state.headingLevel as number | undefined));
  }

  /** 同步按钮标签与下拉选中态：0 / 无 = 普通段落 */
  private render(headingLevel?: number): void {
    const level =
      headingLevel && headingLevel >= 1 && headingLevel <= 6
        ? (headingLevel as HeadingLevel)
        : 0;
    this.current = level;
    this.dom.querySelector<HTMLElement>(".fontName").textContent = LABEL_OF[level];
  }

  protected buildPopup(): HTMLDivElement {
    const popup = document.createElement("div");
    popup.className = "fontDropdown headingDropdown";
    for (const item of HEADING_ITEMS) {
      const row = document.createElement("div");
      row.className = item.level === this.current ? "fontItem selected" : "fontItem";
      row.dataset.value = String(item.level);
      row.textContent = item.label;
      popup.appendChild(row);
    }
    return popup;
  }

  protected onPicked(value: string): void {
    const level = Number(value) as HeadingLevel;
    setHeadingLevel(EditorContent.editor, level);
    this.render(level);
    this.close();
  }
}

export default new Heading();
