import html from "./Align.html?raw";
import alignLeftSvg from "../icon/alignLeft.svg?raw";
import alignCenterSvg from "../icon/alignCenter.svg?raw";
import alignRightSvg from "../icon/alignRight.svg?raw";
import alignJustifySvg from "../icon/alignJustify.svg?raw";
import CtrlBase from "../../CtrlBase";
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
 */
class Align extends CtrlBase {
  private current: AlignValue = "left";
  private popup: HTMLDivElement | null = null;

  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.addEventListener("click", () => (this.popup ? this.close() : this.open()));
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

  private open(): void {
    const popup = document.createElement("div");
    popup.className = "fontDropdown alignDropdown";
    for (const o of ALIGN_OPTIONS) {
      const item = document.createElement("div");
      item.className = o.value === this.current ? "alignItem selected" : "alignItem";
      item.dataset.align = o.value;
      const icon = document.createElement("span");
      icon.className = "alignItemIcon";
      icon.title = o.label; // 名称做进图标的 title
      icon.innerHTML = o.svg;
      item.append(icon);
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
    const item = (e.target as HTMLElement).closest(".alignItem") as HTMLElement | null;
    if (item && item.dataset.align && isAlign(item.dataset.align)) {
      setAlignment(EditorContent.editor, item.dataset.align);
      this.render(item.dataset.align);
    }
    this.close();
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

export default new Align();
