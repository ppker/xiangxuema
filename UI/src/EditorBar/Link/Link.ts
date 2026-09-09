import html from "./Link.html?raw";
import linkSvg from "../icon/link.svg?raw";
import CtrlBase from "../../CtrlBase";
import { adjustLinkSelection, insertLink } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";
import { detectLinkState } from "../../EditorContent/linkState";
import type { LinkState } from "../../EditorContent/linkState";

/**
 * 插入/编辑链接按钮（模块单例）。
 * 状态机（与需求澄清一致）：
 * - 有选中文本（普通或含链接）或光标在链接文本内 → 可点
 * - 光标/选区命中链接时高亮(active)，且弹窗预填当前链接地址
 * 点击后在光标/选区上套链接：有选中文本则套到选中的文本；光标在链接内无选区则更新该链接地址。
 */
class Link extends CtrlBase {
  private popup: HTMLDivElement | null = null;
  private lastState: LinkState = { hasTextSelection: false, inLink: false, linkUrl: "" };
  private input: HTMLInputElement | null = null;

  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector(".toolIcon")!.innerHTML = linkSvg;
    // 阻止 mousedown 默认行为，避免按钮抢走编辑器焦点/清掉选区
    this.dom.addEventListener("mousedown", (e) => e.preventDefault());
    this.dom.addEventListener("click", () => (this.popup ? this.close() : this.open()));
    Msg.on("editorState", (state) => {
      this.lastState = {
        hasTextSelection: state.hasTextSelection === true,
        inLink: state.inLink === true,
        linkUrl: typeof state.linkUrl === "string" ? state.linkUrl : "",
      };
      const linkable = this.lastState.hasTextSelection || this.lastState.inLink;
      (this.dom as HTMLButtonElement).disabled = !linkable;
      this.dom.classList.toggle("active", this.lastState.inLink);
    });
  }

  private open(): void {
    const editor = EditorContent.editor;
    if (!editor) {
      return;
    }
    // 展开时以编辑器实时状态为准，预填已有链接地址（打开即选中方便直接改写）
    const state = detectLinkState(editor);
    if (!state.hasTextSelection && !state.inLink) {
      return;
    }
    const popup = document.createElement("div");
    popup.className = "linkDialog";
    popup.innerHTML = `
      <div class="linkDialogLabel">链接地址</div>
      <input class="linkDialogInput" type="text" spellcheck="false" placeholder="https://www.example.com" />
      <div class="linkDialogBtns">
        <button type="button" class="linkDialogBtn">取消</button>
        <button type="button" class="linkDialogBtn linkDialogBtnPrimary">确定</button>
      </div>`;
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
    this.input = popup.querySelector(".linkDialogInput")!;
    this.input.value = state.linkUrl || "";
    this.placePopup(popup);
    document.addEventListener("mousedown", this.onDocMouseDown);
    window.addEventListener("blur", this.close);
    document.body.appendChild(popup);
    this.popup = popup;
    this.input.focus();
    this.input.select();
  }

  private placePopup(popup: HTMLDivElement): void {
    const rect = this.dom!.getBoundingClientRect();
    const below = rect.bottom + 4;
    const popupHeight = 92; // 弹窗大致高度，定位用
    popup.style.left = `${rect.left}px`;
    popup.style.top =
      below + popupHeight > window.innerHeight ? `${rect.top - popupHeight - 4}px` : `${below}px`;
  }

  private confirm(): void {
    const editor = EditorContent.editor;
    const value = this.input?.value.trim() ?? "";
    if (!editor || !value) {
      // 空地址视为取消
      this.close();
      return;
    }
    // 恢复编辑器焦点（会还原失焦前选区）
    editor.focus();
    // 若光标在链接内无选区，先把选区扩展到整条链接，insertLink 才能“更新”该链接而非插入新词；
    // 有文本选区时本调用不会改动选区
    adjustLinkSelection(editor);
    insertLink(editor, value, undefined, undefined, "_blank");
    this.close();
  }

  private close(): void {
    this.popup?.remove();
    this.popup = null;
    this.input = null;
    document.removeEventListener("mousedown", this.onDocMouseDown);
    window.removeEventListener("blur", this.close);
  }

  /** 仅在展开期间绑定，因此触发时弹层必然存在 */
  private onDocMouseDown = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!this.dom!.contains(target) && !this.popup!.contains(target)) {
      this.close();
    }
  };
}

export default new Link();
