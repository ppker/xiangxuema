import { highlightCode, isCodeLang, CODE_LANGS, type CodeLangId } from "../CodeHighlight";

/**
 * 把正文 HTML 转成 CSDN 编辑器认的那一版（只为"发布到 CSDN"这条链路服务，不进库、不改编辑器内容）：
 *   1. 代码块整个换成 CSDN 编辑器自己的 codesnippet 组件（CKEditor 的 codeSnippet widget，
 *      见 buildCodeSnippet）——外层得套 widget 的 wrapper：wrapper 上的 data-cke-filter="off" 让
 *      这一整段跳过 CKEditor 的 ACF 过滤，少了它，data-widget 与 data-cke-widget-data 会被
 *      过滤掉，代码块就退化成"没标语言的普通 pre"。语言写在组件 data 里（显示名，如 TypeScript），
 *      只给 <code> 补 language-* 类名没用——那是给 Prism 的，它不认；
 *   2. 图片**原样保留** https://app.localhost/images/<文件名>：站点脚本（JS/CSDN.js）在编辑页里
 *      向 native 要一次图片目录句柄，按文件名取出文件传上图床后再替换 src。
 *      （试过在这里就地转成 base64 内联，CSDN 不认——它的服务端不收内联图，存下来就没了）
 *   3. 段落 div 换成 p：编辑器（roosterjs）出的段落是 <div>，CSDN 按 <p> 排版，div 它只当普通盒子，
 *      段落间距这些都不对（见 divsToP）；其余结构原样保留，h2 / ul / blockquote 它自己认。
 */

/**
 * 块级标签：div 的直接子元素里只要出现这些，它就是个容器而不是段落，不换成 p
 * ——比如包着 ul / pre / 表格的那个 div，换成 p 会把结构压坏
 */
const BLOCK_TAGS = new Set([
  "DIV", "P", "SECTION", "ARTICLE", "ADDRESS", "FIGURE", "FIGCAPTION", "HEADER", "FOOTER",
  "ASIDE", "MAIN", "NAV", "UL", "OL", "LI", "DL", "DT", "DD", "PRE", "TABLE", "THEAD",
  "TBODY", "TR", "TD", "TH", "BLOCKQUOTE", "HR", "H1", "H2", "H3", "H4", "H5", "H6",
]);

/**
 * 段落 div → p：只换"直接子元素全是行内内容"的 div（也就是真正的段落，里面是 span / b / img / 裸文本）。
 * 属性（style / class）与子节点原样搬到 p 上，段上带的样式不会掉。
 */
function divsToP(root: HTMLElement): void {
  for (const div of Array.from(root.querySelectorAll("div"))) {
    if (Array.from(div.children).some((child) => BLOCK_TAGS.has(child.tagName))) continue;
    const p = document.createElement("p");
    for (const attr of Array.from(div.attributes)) p.setAttribute(attr.name, attr.value);
    while (div.firstChild) p.appendChild(div.firstChild);
    div.replaceWith(p);
  }
}

/** 语言 id → CSDN 用的显示名（typescript → TypeScript）：组件 data 里的 lang 认这个 */
function langName(id: CodeLangId): string {
  return CODE_LANGS.find((item) => item.id === id)?.name ?? id;
}

/** shiki 着色产物里 <code> 的内容：一行一个 <span class="line">，token 带内联 color */
function shikiCodeHtml(code: string, lang: CodeLangId): string {
  const parsed = new DOMParser().parseFromString(highlightCode(code, lang), "text/html");
  return parsed.body.querySelector("code")?.innerHTML ?? "";
}

/**
 * 代码块 → CSDN 编辑器自己的 codesnippet 组件，形状照"在它编辑器里选完语言"生成的那份 HTML 来：
 *
 *   <div data-cke-widget-wrapper="1" data-cke-filter="off" class="cke_widget_wrapper …">
 *     <pre data-cke-widget-data="%7B%22code%22%3A…%7D" data-cke-widget-upcasted="1"
 *          data-cke-widget-keep-attr="0" data-widget="codeSnippet" class="cke_widget_element">
 *       <code class="language-typescript hljs language-TypeScript">…</code>
 *     </pre>
 *   </div>
 *
 * - 外层 wrapper 是组件的壳，**必须有**：壳上的 data-cke-filter="off" 是给 CKEditor 的 ACF 看的
 *   ——它决定了这一段（含 data-widget 与 data-cke-widget-data）不过滤。没有壳，这两个属性在
 *   setData 时就被洗掉了，编辑器只看到一个普通 pre，语言也就没了。
 * - data-cke-widget-data 是 URL 编码的 JSON：{ code: 原始代码, classes: null, lang: 显示名 }。
 *   语言活在这里：组件建起来时按 code + lang 走自己的高亮器，下拉框也显示这个 lang。
 * - 它自己那份里还有 widget-id、拖拽把手（一个 base64 gif 的 img）、cke_widget_selected 这些，
 *   都是组件初始化时自己补的，不写；<code> 里的着色按 data 重刷一遍也行，这里先带一份 shiki 的
 *   内联色兜底（壳不过滤，inline style 留得住），保证哪怕它没重刷也还是有颜色的代码块。
 */
function buildCodeSnippet(code: string, lang: CodeLangId): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "cke_widget_wrapper cke_widget_block cke_widget_codeSnippet";
  wrapper.dataset.ckeWidgetWrapper = "1";     // 标明这是组件的壳，组件初始化时直接复用
  wrapper.dataset.ckeFilter = "off";          // 让这一段躲过 ACF 过滤：整件事的关键
  wrapper.dataset.ckeDisplayName = "代码段";
  wrapper.setAttribute("contenteditable", "false");
  wrapper.setAttribute("tabindex", "-1");
  wrapper.setAttribute("role", "region");
  wrapper.setAttribute("aria-label", "代码段 小部件");

  const pre = document.createElement("pre");
  pre.className = "cke_widget_element";
  pre.dataset.widget = "codeSnippet";
  pre.dataset.ckeWidgetUpcasted = "1";
  pre.dataset.ckeWidgetKeepAttr = "0";
  pre.dataset.ckeWidgetData = encodeURIComponent(
    JSON.stringify({ code: code, classes: null, lang: langName(lang) }),
  );

  const codeEl = document.createElement("code");
  codeEl.className = `language-${lang} hljs language-${langName(lang)}`;
  const html = shikiCodeHtml(code, lang);
  if (html) codeEl.innerHTML = html;
  else codeEl.textContent = code;
  pre.appendChild(codeEl);

  wrapper.appendChild(pre);
  return wrapper;
}

/**
 * 代码块换组件：正文里存的是 <pre><code data-lang="typescript">纯文本</code></pre>，
 * data-lang 是我们自己的标记，CSDN 不认，所以整块（连同外面的 pre）换成它的 codesnippet 组件，
 * 语言随组件的 data 一起带过去。
 * 认不出语言的代码块原样留着（它会当成没标语言的代码块）。
 */
function toCodeSnippets(root: HTMLElement): void {
  for (const codeEl of Array.from(root.querySelectorAll<HTMLElement>("code[data-lang]"))) {
    const lang = codeEl.dataset.lang;
    if (!isCodeLang(lang)) continue;
    (codeEl.closest("pre") ?? codeEl).replaceWith(buildCodeSnippet(codeEl.textContent ?? "", lang));
  }
}

export default async function forCSDN(html: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = document.createElement("div");
  for (const child of Array.from(doc.body.childNodes)) {
    root.appendChild(document.importNode(child, true));
  }
  // 图片由站点脚本上传，见文件头说明；这里只收拾结构：段落 div 换 p、代码块换成它的 codesnippet 组件
  divsToP(root);
  toCodeSnippets(root);
  return root.innerHTML;
}
