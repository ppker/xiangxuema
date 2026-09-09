import type { IEditor } from "roosterjs-content-model-types";

export interface LinkState {
  /** 是否有真实的文本选区（非折叠光标） */
  hasTextSelection: boolean;
  /** 光标或选区是否命中链接 */
  inLink: boolean;
  /** 命中链接时其地址（原样，含协议与否按编辑内容） */
  linkUrl: string;
}

const EMPTY: LinkState = { hasTextSelection: false, inLink: false, linkUrl: "" };

/** 文本节点所在的最近 <a href>，不在链接内则返回 null */
function anchorOfText(node: Node): HTMLAnchorElement | null {
  const parent = node.parentElement;
  return parent ? parent.closest("a[href]") : null;
}

/**
 * 非折叠选区：找出被选区覆盖且落在 <a> 内的文本节点。
 * 注意不能用 range.cloneContents()——克隆片段不会带上“部分包含”的 <a> 外壳，
 * 拖选整条/部分链接文字时会探测不到，因此这里逐个遍历选区共同祖先下的文本节点判断。
 */
function findAnchorInRange(range: Range): HTMLAnchorElement | null {
  let root: Node = range.commonAncestorContainer;
  // 选区起点处的文本节点大概率已命中（拖选链接通常从链接文字上开始）
  const startContainer = range.startContainer;
  if (startContainer.nodeType === Node.TEXT_NODE) {
    const anchor = anchorOfText(startContainer);
    if (anchor) {
      return anchor;
    }
  }
  if (root.nodeType === Node.TEXT_NODE) {
    return anchorOfText(root);
  }
  // 从选区起点之前一点的位置开始遍历，避免重复扫描起点之前的文本
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return null;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  // 起点已是文本时从起点之后开始查（起点本身已在上面命中检查过，避免重复扫前缀文本）
  if (startContainer.nodeType === Node.TEXT_NODE) {
    walker.currentNode = startContainer;
  }
  let node: Node | null = walker.nextNode();
  while (node) {
    if (range.intersectsNode(node)) {
      const anchor = anchorOfText(node);
      if (anchor) {
        return anchor;
      }
    }
    node = walker.nextNode();
  }
  return null;
}

/**
 * 从编辑器当前 DOM 选区探测链接上下文。
 * roosterjs 的 getFormatState 不提供链接信息，此处基于 selection Range 直接查 <a>：
 * - 折叠光标：看光标所在文本节点是否在 <a> 内
 * - 拖拽选区：找首个被选区覆盖且在 <a> 内的文本节点
 */
export function detectLinkState(editor: IEditor): LinkState {
  const selection = editor.getDOMSelection();
  if (!selection || selection.type !== "range") {
    return EMPTY;
  }
  const range = selection.range;
  const anchor = range.collapsed ? anchorOfText(range.startContainer) : findAnchorInRange(range);
  return {
    hasTextSelection: !range.collapsed,
    inLink: !!anchor,
    linkUrl: anchor ? (anchor.getAttribute("href") ?? "") : "",
  };
}
