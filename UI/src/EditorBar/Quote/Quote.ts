import { createButton } from "../../ToolbarButton";
import { toggleBlockQuote } from "roosterjs-content-model-api";
import type { ContentModelFormatContainerFormat } from "roosterjs-content-model-types";
import quoteSvg from "../icon/quote.svg?raw";

/**
 * 引用的格式：一律留空。
 * 引用长什么样（灰底 + 左侧框线 + 缩进 + 深灰文字）在 EditorContent.scss 里，
 * 作为 #editorContent blockquote 的默认样式，不写成内联 style——
 * 否则每段引用在入库的 HTML 里都挂着同一串重复 style，以后改样子还得回头洗数据。
 *
 * 这些 undefined 必须显式写：toggleBlockQuote 自带一套默认格式（margin 1em/40px、
 * padding-left 10px…），传 undefined 才能把它覆盖成"没有值"，
 * 而 rooster 的格式 applier 只在有值时才往元素上写，于是生成的就是一个干净的 <blockquote>。
 * 别写成空字符串：margin 处理器会把 '' 落成 0。
 */
const QUOTE_FORMAT: ContentModelFormatContainerFormat = {
  marginTop: undefined,
  marginBottom: undefined,
  marginLeft: undefined,
  marginRight: undefined,
  paddingTop: undefined,
  paddingRight: undefined,
  paddingBottom: undefined,
  paddingLeft: undefined,
  borderLeft: undefined,
  backgroundColor: undefined,
  textColor: undefined,
};

export const quoteButton = createButton({
  icon: quoteSvg,
  title: "引用",
  onClick: (editor) => toggleBlockQuote(editor, QUOTE_FORMAT),
  isChecked: (state) => state.isBlockQuote === true,
});
