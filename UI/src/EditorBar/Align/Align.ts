import html from "./Align.html?raw";
import alignLeftSvg from "../icon/alignLeft.svg?raw";
import alignCenterSvg from "../icon/alignCenter.svg?raw";
import alignRightSvg from "../icon/alignRight.svg?raw";
import alignJustifySvg from "../icon/alignJustify.svg?raw";
import DropdownBase from "../../DropdownBase";
import { setAlignment } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

type AlignValue = "left" | "center" | "right" | "justify";

/** 段落水平对齐选项，展示顺序即列表顺序 */
const ALIGN_OPTIONS = [
  { value: "left", label: "左对齐", svg: alignLeftSvg },
  { value: "center", label: "居中对齐", svg: alignCenterSvg },
  { value: "right", label: "右对齐", svg: alignRightSvg },
  { value: "justify", label: "两端对齐", svg: alignJustifySvg },
];

function isAlign(value: string): value is AlignValue {
  return ALIGN_OPTIONS.some((o) => o.value === value);
}

/**
 * 对齐方式下拉（模块单例）。
 * 按钮显示当前对齐图标，点击展开挂到 body 的下拉；选择后应用并对编辑器状态回显。
 * 开合/定位/外部关闭逻辑见 DropdownBase。
 */
class Align extends DropdownBase {
  private current: AlignValue = "left";

  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.addEventListener("click", () => this.toggle());
    Msg.on("editorState", (state) => {
      if (isAlign(state.textAlign)) {
        this.render(state.textAlign);
      }
    });
    this.render(this.current);
  }

  /** 把当前对齐方式渲染到按钮图标 */
  private render(value: AlignValue): void {
    this.current = value;
    const option = ALIGN_OPTIONS.find((o) => o.value === value)!;
    const icon = this.dom.querySelector<HTMLElement>(".toolIcon")!;
    icon.innerHTML = option.svg;
    icon.title = option.label;
  }

  protected buildPopup(): HTMLDivElement {
    const popup = document.createElement("div");
    popup.className = "fontDropdown alignDropdown";
    for (const o of ALIGN_OPTIONS) {
      const item = document.createElement("div");
      item.className = o.value === this.current ? "alignItem selected" : "alignItem";
      item.dataset.value = o.value;
      const icon = document.createElement("span");
      icon.className = "alignItemIcon";
      icon.title = o.label; // 名称做进图标的 title
      icon.innerHTML = o.svg;
      item.append(icon);
      popup.appendChild(item);
    }
    return popup;
  }

  protected onPicked(value: string): void {
    if (isAlign(value)) {
      setAlignment(EditorContent.editor, value);
      this.render(value);
    }
    this.close();
  }
}

export default new Align();
