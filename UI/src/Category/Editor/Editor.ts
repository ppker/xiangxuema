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

/**
 * 分类编辑器（模块单例，按需创建）。
 * 平时不在 DOM 里：第一次 open() 才把模板挂到 document.body。
 * 和右键菜单一样是定点弹层：open(x, y) 贴到鼠标位置，超出窗口往回收，没有遮罩层；
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

  /** 在视口坐标 (x, y) 弹出；options 给初始值，onSubmit 在提交且名称非空时回调 */
  open(x: number, y: number, options: EditorOptions, onSubmit: (result: EditorResult) => void): void {
    if (!this.dom) {
      this.appendTo(document.body);
    }
    this.onSubmit = onSubmit;
    if (this.input) {
      this.input.value = options.value ?? "";
      this.input.placeholder = options.placeholder ?? "";
    }
    // 先显示再量尺寸：隐藏时量到的是 0，越界回收的判断会失效
    this.dom.classList.add("open");
    const { width, height } = this.dom.getBoundingClientRect();
    // 贴住鼠标位置，超出窗口就往回收，四周留 4px
    const left = Math.max(4, Math.min(x, window.innerWidth - width - 4));
    const top = Math.max(4, Math.min(y, window.innerHeight - height - 4));
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
