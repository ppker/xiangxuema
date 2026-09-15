import { createButton } from "../../ToolbarButton";
import { toggleBlockQuote } from "roosterjs-content-model-api";
import type { ContentModelFormatContainerFormat } from "roosterjs-content-model-types";
import quoteSvg from "../icon/quote.svg?raw";

/** 引用块样式（缩进 + 灰底 + 左侧框线 + 深灰文字，内联到 <blockquote>） */
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

export const quoteButton = createButton({
  icon: quoteSvg,
  title: "引用",
  onClick: (editor) => toggleBlockQuote(editor, QUOTE_FORMAT),
  isChecked: (state) => state.isBlockQuote === true,
});