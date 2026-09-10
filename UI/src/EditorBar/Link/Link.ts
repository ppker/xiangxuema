import html from "./Link.html?raw";
import linkSvg from "../icon/link.svg?raw";
import CtrlBase from "../../CtrlBase";
import { adjustLinkSelection, insertLink } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

/**
 * 插入/编辑链接按钮（模块单例），与官方 insertLinkButton 对齐。
 *
 * 官方这个按钮没有任何可点性门禁（不定义 isDisabled / isChecked），永远可点：
 * “当前有没有选中文本”完全交给点击后的 adjustLinkSelection(editor) 处理 ——
 * 光标折叠时它会自动扩选一个词，光标/选区在链接里时扩成整条链接。
 * 因此这里也不做任何选区探测，只用原生 canUnlink 做按钮高亮。
 *
 * 弹窗与官方 showInputDialog 的两个输入项一致：
 * - 链接地址（URL）：initValue = adjustLinkSelection 返回的第 2 项（已有链接地址）
 * - 显示文本（Display as）：initValue = 返回的第 1 项（选中文本 / 链接文本）
 * 并复刻官方的联动：地址被修改、且显示文本未被单独改过（仍等于改动前的地址）时，显示文本跟随地址。
 */
class Link extends CtrlBase {
  private popup: HTMLDivElement | null = null;
  private urlInput: HTMLInputElement | null = null;
  private displayInput: HTMLInputElement | null = null;
  /** 弹窗打开时的初始值，用于判断用户是否真的改过（与官方提交条件一致） */
  private initUrl = "";
  private initDisplayText = "";

  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector(".toolIcon")!.innerHTML = linkSvg;
    // 阻止 mousedown 默认行为，避免按钮抢走编辑器焦点/清掉选区
    this.dom.addEventListener("mousedown", (e) => e.preventDefault());
    this.dom.addEventListener("click", () => (this.popup ? this.close() : this.open()));
    // 与官方一致：按钮始终可点，只按原生 canUnlink 决定是否高亮
    Msg.on("editorState", (state) => {
      this.dom.classList.toggle("active", state.canUnlink === true);
    });
  }

  private open(): void {
    const editor = EditorContent.editor;
    // 与官方 insertLinkButton 一致：先 adjustLinkSelection，一次拿到选中文本与已有链接地址；
    // 光标折叠在链接内时它会把选区扩成整条链接，insertLink 才能“更新”该链接而不是插入新词
    const [displayText, url] = adjustLinkSelection(editor);
    this.initUrl = url ?? "";
    this.initDisplayText = displayText;

    const popup = document.createElement("div");
    popup.className = "linkDialog";
    popup.innerHTML = `
      <div class="linkDialogField">
        <div class="linkDialogLabel">链接地址</div>
        <input class="linkDialogInput linkDialogUrl" type="text" spellcheck="false" placeholder="https://www.example.com" />
      </div>
      <div class="linkDialogField">
        <div class="linkDialogLabel">显示文本</div>
        <input class="linkDialogInput linkDialogDisplay" type="text" spellcheck="false" placeholder="链接显示的文字" />
      </div>
      <div class="linkDialogBtns">
        <button type="button" class="linkDialogBtn">取消</button>
        <button type="button" class="linkDialogBtn linkDialogBtnPrimary">确定</button>
      </div>`;

    const urlInput = popup.querySelector<HTMLInputElement>(".linkDialogUrl")!;
    const displayInput = popup.querySelector<HTMLInputElement>(".linkDialogDisplay")!;
    this.urlInput = urlInput;
    this.displayInput = displayInput;
    urlInput.value = this.initUrl;
    displayInput.value = this.initDisplayText;

    // 与官方 showInputDialog 的 onItemChange 同款联动：改地址时，若显示文本未被单独改过
    // （仍等于改动前的地址），则显示文本跟随新地址
    let lastUrl = this.initUrl;
    urlInput.addEventListener("input", () => {
      if (displayInput.value === lastUrl) {
        displayInput.value = urlInput.value;
      }
      lastUrl = urlInput.value;
    });

    popup.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button.linkDialogBtn");
      if (!btn) {
        return;
      }
      if (btn.classList.contains("linkDialogBtnPrimary")) {
        this.confirm();
      } else {
        this.close();
      }
    });
    popup.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.confirm();
      } else if (e.key === "Escape") {
        this.close();
      }
    });

    this.placePopup(popup);
    document.addEventListener("mousedown", this.onDocMouseDown);
    window.addEventListener("blur", this.close);
    document.body.appendChild(popup);
    this.popup = popup;
    // 与官方一致：默认聚焦地址栏
    urlInput.focus();
    urlInput.select();
  }

  private placePopup(popup: HTMLDivElement): void {
    const rect = this.dom!.getBoundingClientRect();
    const below = rect.bottom + 4;
    const popupHeight = 168; // 弹窗大致高度（两个字段 + 按钮），定位用
    popup.style.left = `${rect.left}px`;
    popup.style.top =
      below + popupHeight > window.innerHeight ? `${rect.top - popupHeight - 4}px` : `${below}px`;
  }

  private confirm(): void {
    const url = this.urlInput?.value.trim() ?? "";
    const displayText = this.displayInput?.value ?? "";
    // 与官方提交条件一致：地址为空，或用户什么都没改 → 不执行，直接关闭
    if (!url || (url === this.initUrl && displayText === this.initDisplayText)) {
      this.close();
      return;
    }
    const editor = EditorContent.editor;
    // 恢复编辑器焦点（会还原失焦前选区，即 open() 中 adjustLinkSelection 的结果）
    editor.focus();
    // 官方调用形态：insertLink(editor, link, anchorTitle, displayText)，不指定 target
    insertLink(editor, url, url, displayText);
    this.close();
  }

  private close = (): void => {
    this.popup?.remove();
    this.popup = null;
    this.urlInput = null;
    this.displayInput = null;
    document.removeEventListener("mousedown", this.onDocMouseDown);
    window.removeEventListener("blur", this.close);
  };

  /** 仅在展开期间绑定，因此触发时弹层必然存在 */
  private onDocMouseDown = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!this.dom!.contains(target) && !this.popup!.contains(target)) {
      this.close();
    }
  };
}

export default new Link();
