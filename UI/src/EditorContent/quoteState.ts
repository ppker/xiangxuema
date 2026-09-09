import type { IEditor } from "roosterjs-content-model-types";

export interface QuoteState {
  /** 光标或选区是否命中引用块(<blockquote>) */
  inQuote: boolean;
}

const EMPTY: QuoteState = { inQuote: false };

/** 节点所在的最近 <blockquote>（即引用容器），不在引用内则返回 null */
function quoteOfNode(node: Node): Element | null {
  const element =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  return element ? element.closest("blockquote") : null;
}

/**
 * 非折叠选区：找出被选区覆盖且位于 <blockquote> 内的文本节点。
 * 与 linkState 同理，不能依赖 cloneContents（部分包含的祖先不会被克隆出来）。
 */
function findQuoteInRange(range: Range): Element | null {
  const root = range.commonAncestorContainer;
  const startContainer = range.startContainer;
  if (startContainer.nodeType === Node.TEXT_NODE) {
    const quote = quoteOfNode(startContainer);
    if (quote) {
      return quote;
    }
  }
  if (root.nodeType === Node.TEXT_NODE) {
    return quoteOfNode(root);
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return null;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  if (startContainer.nodeType === Node.TEXT_NODE) {
    walker.currentNode = startContainer;
  }
  let node: Node | null = walker.nextNode();
  while (node) {
    if (range.intersectsNode(node)) {
      const quote = quoteOfNode(node);
      if (quote) {
        return quote;
      }
    }
    node = walker.nextNode();
  }
  return null;
}

/**
 * 从编辑器当前 DOM 选区探测引用上下文（roosterjs 的 getFormatState 不含引用信息）。
 * - 折叠光标：看光标所在文本/元素是否在 <blockquote> 内
 * - 拖拽选区：找首个被选区覆盖且位于 <blockquote> 内的文本节点
 */
export function detectQuoteState(editor: IEditor): QuoteState {
  const selection = editor.getDOMSelection();
  if (!selection || selection.type !== "range") {
    return EMPTY;
  }
  const range = selection.range;
  const quote = range.collapsed
    ? quoteOfNode(range.startContainer)
    : findQuoteInRange(range);
  return { inQuote: !!quote };
}
