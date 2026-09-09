import { ChangeSource } from "roosterjs-content-model-dom";
import type { IEditor, PluginEvent } from "roosterjs-content-model-types";

/**
 * “引用内回车跳出”键盘插件（模块由 EditorContent 实例化）。
 * 语义（与需求对齐）：
 * - 光标在引用(<blockquote>)内的空行上按 Enter：
 *   - 若该空行在引用块中间（前后都还有引用内容）→ 把引用从该处拆成两段，
 *     空行成为两段引用之间的普通段落（仿 Word）；
 *   - 若该空行是引用块的最后一行 → 空行移出引用，成为普通段落；
 *   - 若移除后原引用变空 → 整段引用随之删除。
 * - 其余情况（非空行、Shift/Ctrl/Alt+Enter 等）不拦截，交给浏览器默认行为。
 * 说明：roosterjs 每次格式写回都会以 DOM 重渲染，且缓存插件带 MutationObserver，
 * 因此这里直接在 DOM 上完成结构调整，配合 takeSnapshot + contentChanged 维持撤销与状态广播。
 */
export default class QuoteKeyboardPlugin {
  private editor: IEditor | null = null;

  getName(): string {
    return "QuoteKeyboard";
  }

  initialize(editor: IEditor): void {
    this.editor = editor;
  }

  dispose(): void {
    this.editor = null;
  }

  onPluginEvent(event: PluginEvent): void {
    if (event.eventType === "keyDown") {
      this.handleEnterKeyDown(event.rawEvent);
    }
  }

  private handleEnterKeyDown(rawEvent: KeyboardEvent): void {
    if (
      rawEvent.key !== "Enter" ||
      rawEvent.shiftKey ||
      rawEvent.altKey ||
      rawEvent.ctrlKey ||
      rawEvent.metaKey
    ) {
      return;
    }
    const editor = this.editor;
    if (!editor) {
      return;
    }
    const selection = editor.getDOMSelection();
    if (!selection || selection.type !== "range" || !selection.range.collapsed) {
      return;
    }
    const range = selection.range;
    const node = range.startContainer;
    const startElement =
      node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
    if (!startElement) {
      return;
    }
    const quote = startElement.closest("blockquote");
    if (!quote) {
      return;
    }
    const line = getQuoteChildLine(startElement, quote);
    if (!line || line === quote || !isEmptyElement(line)) {
      return;
    }

    // 命中：引用内空行 + Enter，接管本次回车
    rawEvent.preventDefault();
    editor.focus();
    // 记录回车前的可撤销快照（keypress 已被 preventDefault，undo 插件不再代为打点）
    editor.takeSnapshot();
    moveEmptyLineOutOfQuote(line, quote);
    placeCaretAtStartOfLine(line, editor);
    editor.triggerEvent("contentChanged", {
      source: ChangeSource.Keyboard,
      formatApiName: "QuoteKeyboardPlugin.Enter",
    });
  }
}

/**
 * 找到“直接挂在引用容器下”的行元素（段落 div 等）。
 * 光标所在节点可能深埋在 span/b 等内联元素里，向上爬直到父级就是 <blockquote>。
 */
function getQuoteChildLine(
  element: Element,
  quote: Element
): HTMLElement | null {
  let current: Element | null = element;
  while (current && current.parentElement && current.parentElement !== quote) {
    current = current.parentElement;
  }
  return current && current !== quote ? (current as HTMLElement) : null;
}

/**
 * 判断元素内是否没有任何可见内容（仅允许空文本与 <br>）。
 */
function isEmptyElement(element: HTMLElement): boolean {
  if (element.childNodes.length === 0) {
    return true;
  }
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (((child as Text).textContent ?? "").trim() !== "") {
        return false;
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const childElement = child as HTMLElement;
      const tag = childElement.tagName;
      if (tag === "BR") {
        continue;
      }
      if (
        tag === "IMG" ||
        tag === "IFRAME" ||
        tag === "VIDEO" ||
        tag === "AUDIO" ||
        tag === "OBJECT" ||
        tag === "TABLE"
      ) {
        return false;
      }
      if (!isEmptyElement(childElement)) {
        return false;
      }
    } else if (child.nodeType !== Node.COMMENT_NODE) {
      // 其它不可预期节点类型，视为有内容，不触发跳出
      return false;
    }
  }
  return true;
}

/**
 * 把引用的空行移出引用容器：
 * - 空行后仍有引用内容：克隆引用格式生成新的引用容器装下剩余内容，
 *   空行放在新旧两个引用之间（拆引用）；
 * - 空行后没有内容：直接移到引用之后；
 * 若原引用因此变空则一并移除。
 */
function moveEmptyLineOutOfQuote(line: HTMLElement, quote: HTMLElement): void {
  const parent = quote.parentElement;
  if (!parent) {
    return;
  }
  const tail: Node[] = [];
  let sibling: Node | null = line.nextSibling;
  while (sibling) {
    tail.push(sibling);
    sibling = sibling.nextSibling;
  }
  if (tail.length > 0) {
    // 引用中段：剩余内容进入克隆格式的新引用
    const newQuote = quote.cloneNode(false) as HTMLElement;
    for (const node of tail) {
      newQuote.appendChild(node);
    }
    parent.insertBefore(newQuote, quote.nextSibling);
    parent.insertBefore(line, newQuote);
  } else {
    // 引用末尾：空行直接移出引用
    parent.insertBefore(line, quote.nextSibling);
  }
  if (isEmptyElement(quote)) {
    quote.remove();
  }
}

/** 把光标放到行元素的起始处（空段中） */
function placeCaretAtStartOfLine(line: HTMLElement, editor: IEditor): void {
  const document = editor.getDocument();
  const range = document.createRange();
  range.setStart(line, 0);
  range.collapse(true);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
