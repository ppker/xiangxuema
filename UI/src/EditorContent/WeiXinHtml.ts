import { cssLengthToPx } from "../EditorBar/cssLength";
import { highlightCode, isCodeLang, type CodeLangId } from "../CodeHighlight";

/**
 * 把正文 HTML 转成微信公众号编辑器自己的段落结构：
 *   <p style="font-size:14px;line-height:1.75"><span>文字</span><u><span>下划线</span></u></p>
 * 即：块级一律摊平成 p，p 里的每段文本都套一层 span，行内格式（u / s / b / em…）原样留着。
 * 图片 src 原样留着 https://app.localhost/images/<文件名>：那是本程序 WebView2 的虚拟映射，
 * 微信的服务器取不到，由站点脚本（JS/WeiXin.js）在编辑页里传它的图床后再换地址。
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

/** 清掉外边距：微信自己的段落间距够用，p 上带 margin 会跟它的排版打架。
 *  长写法（margin-top 之类）也一起清，免得只清了简写留下残余 */
function clearMargin(el: HTMLElement): void {
  for (const prop of ["margin", "margin-top", "margin-right", "margin-bottom", "margin-left"]) {
    el.style.removeProperty(prop);
  }
}

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
  clearMargin(block); // 原段落样式里带来的 margin 也一并去掉
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
  // 引用的结构样式（border-left / padding / 缩进）整条去掉，用微信自己的：
  // 它自带左侧竖线，我们那套叠上去会打架。只补一个底色——不写的话引用会跟正文糊在一起
  if (out.tagName === "BLOCKQUOTE") {
    out.removeAttribute("style");
    out.style.background = "#f6f6f6";
  }
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

/**
 * 代码块转成微信自己的 code-snippet 结构——照它编辑器里"粘贴一段代码"生成的 HTML 来的：
 *
 *   <pre class="code-snippet code-snippet_nowrap" data-lang="ts">
 *     <code><span leaf="">…这一行…</span></code>   ← 一行一个 code
 *     …
 *   </pre>
 *
 * 这么转是为了解决长行被折断：我们自己怎么调 white-space 都没用（实测它会被改写成 pre-wrap，
 * 保留缩进但允许折行，于是内容总是先折行填满、永远不会溢出，overflow-x 也就白给）。
 * 而 code-snippet_nowrap 是它自己的类，"不折行"由它自己的样式表保证。
 *
 * 着色仍然带内联 color（shiki 那份）：class 要靠它那边的样式表，内联是最稳的。
 * 字号 12px 与行高 1.6 写在每个 code 上（pre 不带任何样式）。
 */
function buildWeiXinCodeBlock(code: string, lang: CodeLangId): HTMLElement {
  const parsed = new DOMParser().parseFromString(highlightCode(code, lang), "text/html");
  const shikiPre = parsed.body.firstElementChild;

  const pre = document.createElement("pre");
  // 容器一律不带内联样式：底色、内边距、滚动条这些交给它自己的 code-snippet 样式表，
  // 我们自己写的反而会盖掉它的规则。只保留类名（_nowrap 就是靠它的样式表做到不折行的）
  pre.className = "code-snippet code-snippet_nowrap";
  pre.dataset.lang = lang;

  // shiki 的每一行（<span class="line">）搬成一个 <code>，与它自己的结构一致
  for (const line of Array.from((shikiPre ?? parsed.body).querySelectorAll(".line"))) {
    const lineEl = document.createElement("code");
    // 一行一块：它的样式表里 pre > code 本来就是块级，写上更稳
    lineEl.style.display = "block";
    // 空行也要撑出一行的高度，否则几行空行会挤成一条
    lineEl.style.minHeight = "1.6em";
    // 字号与行高写在每行上：pre 上不给样式，这两条必须落在 code 上才有效
    lineEl.style.fontSize = "12px";
    lineEl.style.lineHeight = "1.6";
    const leaf = document.createElement("span");
    leaf.setAttribute("leaf", "");
    leaf.innerHTML = line.innerHTML; // 带 shiki 内联颜色的 token
    lineEl.appendChild(leaf);
    pre.appendChild(lineEl);
  }
  return pre;
}

/**
 * 给代码块着色：正文里存的是 <pre><code data-lang="ts">纯文本</code></pre>（干净、可编辑），
 * 这里换成微信自己的 code-snippet 结构（着色用 shiki 的内联 color）。
 * 认不出语言的代码块原样留着。
 */
function highlightCodeBlocks(root: HTMLElement): void {
  for (const codeEl of Array.from(root.querySelectorAll<HTMLElement>("code[data-lang]"))) {
    const lang = codeEl.dataset.lang;
    if (!isCodeLang(lang)) continue;
    (codeEl.closest("pre") ?? codeEl).replaceWith(buildWeiXinCodeBlock(codeEl.textContent ?? "", lang));
  }
}

export default function forWeiXin(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = document.createElement("div");

  // 顶层没有被任何块包住的行内内容（span / 裸文本）补一个 p，别让它直接挂在外面
  let pending: Node[] = [];
  const flush = (): void => {
    if (pending.length === 0) return;
    const p = document.createElement("p");
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

  // 结构收拾完再给代码块补料：这时节点已经是最终进微信的那些，改它们才是改到点子上。
  // 图片不动：src 原样留着，由站点脚本传图床（见文件头说明）
  highlightCodeBlocks(root);
  return root.innerHTML;
}
