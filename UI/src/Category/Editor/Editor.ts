import "./Editor.scss";
import html from "./Editor.html?raw";
import CtrlBase from "../../CtrlBase";

/** 提交时回传的内容 */
export interface EditorResult {
  name: string;
}

/** 打开编辑器时的初始状态 */
export interface EditorOptions {
  /** 输入框初始值：改分类时传原名，新增时留空 */
  value?: string;
  /** 占位文案 */
  placeholder?: string;
}

/** 弹层定位所依据的锚点（由调用方在锚点元素仍可见时采集其包围盒） */
export interface EditorAnchor {
  /** 锚点包围盒（视口坐标）。弹层左边缘与它左边缘对齐 */
  rect: DOMRect;
  /** 下方空间不足时是否向锚点上方翻折：
   *  被右键的分类行（右键菜单入口）传 true（下方放不下就弹到分类正上方）；
   *  标题栏"+"按钮传 false（始终位于按钮正下方）。 */
  mayFlip: boolean;
}

/**
 * 分类编辑器（模块单例，按需创建）。
 * 平时不在 DOM 里：第一次 open() 才把模板挂到 document.body。
 * 定点弹层，定位对齐触发它的锚点（被右键的分类行 / 标题栏按钮）：
 * - 默认：弹层左上角贴锚点左下角（正下方）
 * - mayFlip 时若下方放不下且上方有空间，改为弹层左下角贴锚点左上角（正上方）
 * 点别处、点取消、按 Esc 都算取消；点提交（或在输入框里回车）校验非空后回调 onSubmit。
 * 提交之后要写库、刷新分类树，由调用方（Category）在回调里做，组件本身只管收名字。
 */
class Editor extends CtrlBase {
  private input: HTMLInputElement | null = null;

  /** 本次的提交回调，由 open() 传入，close() 时清掉 */
  private onSubmit: ((result: EditorResult) => void) | null = null;

  constructor() {
    super(html);
  }

  override ready(): void {
    this.input = this.dom.querySelector<HTMLInputElement>(".editorInput");

    // 提交 / 取消：两个按钮都用事件委托
    this.dom.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "submit") this.submit();
      else this.close();
    });

    // 输入框里回车直接提交
    this.input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.submit();
    });

    // 点别处等于取消（和右键菜单同一套行为）
    document.addEventListener("mousedown", (e) => {
      if (!this.dom || !this.dom.contains(e.target as Node)) this.close();
    });

    // Esc 取消（只在打开时才响应，别影响别处的 Esc）
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen) this.close();
    });
  }

  get isOpen(): boolean {
    return this.dom?.classList.contains("open") ?? false;
  }

  /** 以 anchor 为锚点弹出；options 给初始值，onSubmit 在提交且名称非空时回调 */
  open(anchor: EditorAnchor, options: EditorOptions, onSubmit: (result: EditorResult) => void): void {
    if (!this.dom) {
      this.appendTo(document.body);
    }
    this.onSubmit = onSubmit;
    if (this.input) {
      this.input.value = options.value ?? "";
      this.input.placeholder = options.placeholder ?? "";
    }
    // 先显示再量尺寸：隐藏时量到的是 0，越界判断会失效
    this.dom.classList.add("open");
    const { width, height } = this.dom.getBoundingClientRect();
    const { rect, mayFlip } = anchor;

    // 默认贴到锚点正下方（弹层左上角 = 锚点左下角）；mayFlip 且下方放不下时
    // 翻到正上方（弹层左下角 = 锚点左上角）。上下都放不下时仍留在下方。
    const below = rect.bottom + 4;
    const fitsBelow = below + height <= window.innerHeight - 4;
    const top = mayFlip && !fitsBelow && rect.top - height - 4 >= 4 ? rect.top - height - 4 : below;
    // 弹层左边缘与锚点左边缘对齐；水平方向超出窗口就往回收，四周留 4px
    const left = Math.max(4, Math.min(rect.left, window.innerWidth - width - 4));

    this.dom.style.left = `${left}px`;
    this.dom.style.top = `${top}px`;
    // 打开即聚焦并全选：改分类时可以直接覆盖原名
    this.input?.focus();
    this.input?.select();
  }

  /** 关闭（取消）。提交走 submit()，它回调完也会关 */
  close(): void {
    this.dom?.classList.remove("open");
    this.onSubmit = null;
  }

  /** 提交：名称去空白后不能为空，空了就留在输入框里 */
  private submit(): void {
    const name = this.input?.value.trim() ?? "";
    if (!name) {
      this.input?.focus();
      return;
    }
    const onSubmit = this.onSubmit;
    this.close();
    onSubmit?.({ name });
  }
}

export default new Editor();
