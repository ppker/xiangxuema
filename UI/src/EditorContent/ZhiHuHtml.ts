import { isCodeLang } from "../CodeHighlight";

/**
 * 把正文 HTML 转成知乎编辑器认的那一版（只为"发布到知乎"这条链路服务，不进库、不改编辑器内容）：
 *   1. 代码块只标语言（<code class="language-typescript">），**不着色**：知乎的 Draft.js 会把
 *      <pre> 收成它自己的代码块、只取纯文本，随后用它的 Prism 重新着色——我们自己塞的 shiki
 *      内联色与底色都会被它剥掉，白做（见文件末尾的说明）；
 *   2. 图片**原样保留** https://app.localhost/images/<文件名>：站点脚本（JS/ZhiHu.js）在编辑页里
 *      向 native 要一次图片目录句柄，按文件名取出文件传上图床后再替换 src；
 *   3. 其余结构原样保留：知乎自己认 p / h2 / ul / blockquote，不像微信那样要摊平成它的段落结构。
 *      自定义 class 与 style 它一概不留，所以这里也不做任何样式加工——做了也留不住。
 */

/**
 * 代码块标语言：正文里存的是 <pre><code data-lang="typescript">纯文本</code></pre>，
 * data-lang 是我们自己的标记，知乎不认；它按 Prism 的类名认语言，所以补一个 language-* 上去。
 * data-lang 随后去掉：这里输出的是给知乎的 HTML，留着我们的自定义属性没有用处。
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

export default async function forZhiHu(html: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = document.createElement("div");
  for (const child of Array.from(doc.body.childNodes)) {
    root.appendChild(document.importNode(child, true));
  }
  // 结构样式一概不动（知乎自己会收拾），只给代码块标语言；图片由站点脚本上传，见文件头说明
  markCodeLanguages(root);
  return root.innerHTML;
}

// 为什么这里不着色、也不给任何样式：
// 知乎的编辑器是 Draft.js（受控组件），粘贴过来的 HTML 先过它自己的处理器——<pre> 被收成它的
// 代码块 block，只留下纯文本，随后由它的 Prism 重新着色、用它自己的样式渲染。实测（编辑页里
// 粘进去再看 DOM）留下的 span 是它的 prism-token，我们塞进去的 shiki 内联色与 pre 的底色一个
// 不剩。提交时服务端还会再清洗一遍，编辑期侥幸留在 DOM 上的样式同样留不到最终页面。
// 结论：知乎这条链路能带过去的只有"它的语义结构"（p / h2 / blockquote / ul / b / 代码块…），
// 没有自定义 CSS。着色与排版交给它，我们只负责把语言标对。
// 微信那条链路正好相反：它不吃 class 只吃内联 style，所以 WeiXinHtml 里 shiki 的内联色必须留着。
