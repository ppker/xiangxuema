import { isCodeLang } from "../CodeHighlight";

/**
 * 把正文 HTML 转成 CSDN 编辑器认的那一版（只为"发布到 CSDN"这条链路服务，不进库、不改编辑器内容）：
 *   1. 代码块只标语言（<code class="language-typescript">），**不着色**：我们塞的 shiki 内联色
 *      是给微信那种"只吃内联 style"的编辑器用的，CSDN 按自己的类名/插件重新着色，留不住；
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

/**
 * 代码块标语言：正文里存的是 <pre><code data-lang="typescript">纯文本</code></pre>，
 * data-lang 是我们自己的标记，CSDN 不认；它按 language-* 这个（Prism 的）类名认语言，补一个上去。
 * data-lang 随后去掉：这里输出的是给 CSDN 的 HTML，留着我们的自定义属性没有用处。
 * 认不出语言的代码块原样留着（它会当成没标语言的代码块）。
 */
function markCodeLanguages(root: HTMLElement): void {
  for (const codeEl of Array.from(root.querySelectorAll<HTMLElement>("code[data-lang]"))) {
    const lang = codeEl.dataset.lang;
    if (!isCodeLang(lang)) continue;
    codeEl.classList.add("language-" + lang);
    codeEl.removeAttribute("data-lang");
  }
}

export default async function forCSDN(html: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = document.createElement("div");
  for (const child of Array.from(doc.body.childNodes)) {
    root.appendChild(document.importNode(child, true));
  }
  // 图片由站点脚本上传，见文件头说明；这里只收拾结构：段落 div 换 p、给代码块标语言
  divsToP(root);
  markCodeLanguages(root);
  return root.innerHTML;
}
