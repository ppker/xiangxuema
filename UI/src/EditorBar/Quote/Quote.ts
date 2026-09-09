import html from "./Quote.html?raw";
import quoteSvg from "../icon/quote.svg?raw";
import CtrlBase from "../../CtrlBase";
import { toggleBlockQuote } from "roosterjs-content-model-api";
import type { ContentModelFormatContainerFormat } from "roosterjs-content-model-types";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

/**
 * 引用（块引用）按钮（模块单例）。
 * 交互语义：
 * - 折叠光标 / 选中普通文本 → 点击把光标所在行/选中段落包成引用
 * - 光标或选区在引用内 → 点击移除引用（roosterjs toggleBlockQuote 默认行为：
 *   混选“引用+普通”时整块合并为引用）
 * 引用样式：缩进 + 灰底 + 左侧深灰框线 + 深灰文字（内联到 <blockquote>）。
 */
const QUOTE_FORMAT: ContentModelFormatContainerFormat = {
  borderLeft: "3px solid #999999",
  backgroundColor: "#f0f0f0",
  textColor: "#555555",
  marginTop: "1em",
  marginBottom: "1em",
  marginLeft: "2em",
  marginRight: "0",
  paddingTop: "8px",
  paddingBottom: "8px",
  paddingLeft: "12px",
  paddingRight: "12px",
};

class Quote extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector(".toolIcon")!.innerHTML = quoteSvg;
    // 阻止 mousedown 默认行为，避免按钮抢走编辑器焦点/清掉选区
    this.dom.addEventListener("mousedown", (e) => e.preventDefault());
    this.dom.addEventListener("click", () => {
      toggleBlockQuote(EditorContent.editor, QUOTE_FORMAT);
    });
    // roosterjs 原生 isBlockQuote：光标所在段落/选区全部处于引用块时点亮
    Msg.on("editorState", (state) => {
      this.dom.classList.toggle("active", state.isBlockQuote === true);
    });
  }
}

export default new Quote();
