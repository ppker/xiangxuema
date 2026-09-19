import { cssLengthToPx } from "../EditorBar/cssLength";

/**
 * 把正文 HTML 转成微信公众号编辑器自己的段落结构：
 *   <p style="font-size:14px;line-height:1.75"><span>文字</span><u><span>下划线</span></u></p>
 * 即：块级一律摊平成 p，p 里的每段文本都套一层 span，行内格式（u / s / b / em…）原样留着。
 * 只为"转移到微信"这一条链路服务：不进库，也不改编辑器里的内容。
 *
 * 这么转是为了绕开微信那条"行高小于字体大小，多行文本可能重叠"的提示：
 * 它按自己的 DOM 结构判版式，行高偏小（含它给的默认值）就弹。这里每段都显式定死字号与行高，
 * 行高用倍数（1.75）而不是 px，标题在微信里被放大时行高也跟着放大，不会重新跌破字号。
 */

/** 正文段落字号：定死，不跟着编辑器里的字号走 */
const FONT_SIZE = "14px";

/** 行高：倍数，明显大于字号 */
const LINE_HEIGHT = "1.75";

/** 段落间距：不给的话段与段会贴在一起 */
const PARAGRAPH_MARGIN = "0 0 16px";

/** 标题字号：沿用编辑器 #editorContent 里的级差（EditorContent.scss），免得落到微信的默认字号上 */
const HEADING_FONT_SIZE: Record<string, string> = {
  H1: "28px",
  H2: "24px",
  H3: "20px",
  H4: "18px",
  H5: "16px",
  H6: "15px",
};

/** 一律转成 p 的标签（编辑器里 roosterjs 出的是 div，微信认 p） */
const AS_P = new Set(["DIV", "P", "SECTION", "ARTICLE", "ADDRESS", "FIGURE", "FIGCAPTION", "BODY"]);

/** 保留原标签的块级容器：整体结构有意义（列表、引用、表格、代码块） */
const AS_CONTAINER = new Set(["UL", "OL", "BLOCKQUOTE", "PRE", "TABLE", "TBODY", "THEAD", "TR"]);

/** 保留原标签的块级单元：内容直接放行，不再往里套 p */
const AS_CELL = new Set(["LI", "TD", "TH"]);

/** 原样保留的元素：图片、换行、分割线，内容与属性都不动 */
const AS_IS = new Set(["IMG", "BR", "HR"]);

/** 所有块级标签：用来判断哪些节点不能塞进 p 里 */
const BLOCK_TAGS = new Set([...AS_P, ...AS_CONTAINER, ...AS_CELL, ...Object.keys(HEADING_FONT_SIZE)]);

function isBlock(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as HTMLElement).tagName);
}

/**
 * 行高折算成"相对字号的倍数"：无单位与 em 直接用，% 除以 100，px 除以该元素字号；
 * 没写行高 / normal 返回 NaN（按"没定死"处理）
 */
function lineHeightRatio(value: string, fontPx: number): number {
  const text = value.trim();
  const num = parseFloat(text);
  if (!text || text === "normal" || Number.isNaN(num)) {
    return NaN;
  }
  if (text.endsWith("px")) return num / fontPx;
  if (text.endsWith("%")) return num / 100;
  return num;
}

/** 元素字号（px）：没写 font-size 的按正文默认字号算 */
function fontSizePx(el: HTMLElement, fallback = 14): number {
  const px = cssLengthToPx(el.style.fontSize);
  return Number.isNaN(px) ? fallback : px;
}

/** 文本节点：套一层 span，微信的段落就是这么排的；缩进换行产生的纯空白丢掉 */
function convertText(node: Node): Node[] {
  const text = node.nodeValue ?? "";
  if (!text || (!/\S/.test(text) && !text.includes("\u00a0"))) {
    return [];
  }
  const span = document.createElement("span");
  span.textContent = text;
  return [span];
}

/** 行内元素：标签与样式（颜色 / 粗体 / 字号…）原样留着，只纠正它自己写小的行高 */
function convertInline(el: HTMLElement, children: Node[]): Node[] {
  const out = el.cloneNode(false) as HTMLElement;
  const ratio = lineHeightRatio(out.style.lineHeight, fontSizePx(out));
  if (!Number.isNaN(ratio) && ratio < Number(LINE_HEIGHT)) {
    out.style.lineHeight = LINE_HEIGHT;
  }
  children.forEach((child) => out.appendChild(child));
  return [out];
}

/** 段落（p 及转成 p 的那些）：定死字号与行高，行内内容留在段内，里头嵌套的块摊平成兄弟段落 */
function convertParagraph(el: HTMLElement, children: Node[]): Node[] {
  const tag = el.tagName;
  const block = document.createElement(AS_P.has(tag) ? "p" : tag.toLowerCase());
  // 原段落的对齐 / 缩进等样式带过去，字号与行高随后压上，保证行高一定大于字号
  const style = el.getAttribute("style");
  if (style) block.setAttribute("style", style);
  block.style.margin = PARAGRAPH_MARGIN;
  block.style.fontSize = HEADING_FONT_SIZE[tag] ?? FONT_SIZE;
  block.style.lineHeight = LINE_HEIGHT;

  const inline = children.filter((child) => !isBlock(child));
  const nested = children.filter(isBlock);
  // 空壳（比如只包了一个内层块）：不留空段落，直接把内层块提上来
  if (inline.length === 0 && nested.length > 0) {
    return nested;
  }
  inline.forEach((child) => block.appendChild(child));
  if (inline.length === 0) block.appendChild(document.createElement("br"));
  return [block, ...nested];
}

/** 容器（列表 / 引用 / 表格 / 代码块）：保留标签，子节点原样收下 */
function convertContainer(el: HTMLElement, children: Node[]): Node[] {
  const out = el.cloneNode(false) as HTMLElement;
  const ratio = lineHeightRatio(out.style.lineHeight, fontSizePx(out));
  if (!Number.isNaN(ratio) && ratio < Number(LINE_HEIGHT)) {
    out.style.lineHeight = LINE_HEIGHT;
  }
  for (const child of children) {
    // 列表里混进来的行内内容补个 li，免得 ul / ol 底下直接挂 span
    if ((out.tagName === "UL" || out.tagName === "OL") && !isBlock(child)) {
      const li = document.createElement("li");
      li.appendChild(child);
      out.appendChild(li);
    } else {
      out.appendChild(child);
    }
  }
  return [out];
}

/**
 * 递归转换：返回一组节点。
 * 块里套块的情况（div 里还有 div）会被摊平成兄弟节点，保证不会生成 p 套 p 这种微信认不出的结构
 */
function convert(node: Node): Node[] {
  if (node.nodeType === Node.TEXT_NODE) return convertText(node);
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const el = node as HTMLElement;
  const tag = el.tagName;
  if (AS_IS.has(tag)) return [el.cloneNode(false)];

  const children = Array.from(el.childNodes).flatMap(convert);
  if (AS_CELL.has(tag)) {
    const out = el.cloneNode(false) as HTMLElement;
    children.forEach((child) => out.appendChild(child));
    return [out];
  }
  if (AS_CONTAINER.has(tag)) return convertContainer(el, children);
  if (AS_P.has(tag) || HEADING_FONT_SIZE[tag]) return convertParagraph(el, children);
  return convertInline(el, children);
}

export default function forWeiXin(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = document.createElement("div");

  // 顶层没有被任何块包住的行内内容（span / 裸文本）补一个 p，别让它直接挂在外面
  let pending: Node[] = [];
  const flush = (): void => {
    if (pending.length === 0) return;
    const p = document.createElement("p");
    p.style.margin = PARAGRAPH_MARGIN;
    p.style.fontSize = FONT_SIZE;
    p.style.lineHeight = LINE_HEIGHT;
    pending.forEach((child) => p.appendChild(child));
    root.appendChild(p);
    pending = [];
  };
  for (const child of Array.from(doc.body.childNodes).flatMap(convert)) {
    if (isBlock(child)) {
      flush();
      root.appendChild(child);
    } else {
      pending.push(child);
    }
  }
  flush();

  return root.innerHTML;
}
