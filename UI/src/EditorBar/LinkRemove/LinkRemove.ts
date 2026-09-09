import html from "./LinkRemove.html?raw";
import linkRemoveSvg from "../icon/linkRemove.svg?raw";
import CtrlBase from "../../CtrlBase";
import { adjustLinkSelection, removeLink } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

/**
 * 移除链接按钮（模块单例）。
 * 仅当光标/选区命中链接时可点（此时点亮）；点击移除整条命中的链接样式（保留文字）。
 */
class LinkRemove extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector(".toolIcon")!.innerHTML = linkRemoveSvg;
    // 阻止 mousedown 默认行为，避免按钮抢走编辑器焦点/清掉选区
    this.dom.addEventListener("mousedown", (e) => e.preventDefault());
    this.dom.addEventListener("click", () => {
      const editor = EditorContent.editor;
      if (!editor) {
        return;
      }
      // 光标折叠在链接内时先把选区扩到整条链接，removeLink 才能整条移除
      adjustLinkSelection(editor);
      removeLink(editor);
    });
    Msg.on("editorState", (state) => {
      const inLink = state.inLink === true;
      (this.dom as HTMLButtonElement).disabled = !inLink;
      this.dom.classList.toggle("active", inLink);
    });
  }
}

export default new LinkRemove();
