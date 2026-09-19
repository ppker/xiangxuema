import "./EditorContent.scss";
import html from "./EditorContent.html?raw";
import CtrlBase from "../CtrlBase";
import { Editor, createModelFromHtml, exportContent } from "roosterjs-content-model-core";
import { EditPlugin, HyperlinkPlugin, ImageEditPlugin, PastePlugin, ShortcutPlugin, WatermarkPlugin } from "roosterjs";
import EditorPlugin from "./EditorPlugin";
import ImagePlugin from "./ImagePlugin";

class EditorContent extends CtrlBase {
  editor: Editor | null = null;
  private imagePlugin = new ImagePlugin();

  constructor() {
    super(html);
  }

  override ready(): void {
    this.editor = new Editor(this.dom as HTMLDivElement, {
      plugins: [
        new WatermarkPlugin("请输入文章内容…"),
        // 官方 createEditor 默认三件套：Paste 负责粘贴清理，Edit 负责 Backspace/Delete/Tab/Enter
        // 的 Content Model 编辑（引用内空行回车跳出即由其中的 deleteEmptyQuote 提供）
        new PastePlugin(),
        new EditPlugin(),
        // 对标官方 demo：hover 显示链接地址、Ctrl+Click 打开链接、输入文本与 url 一致时同步 href
        new HyperlinkPlugin(),
        // 对标官方 demo：点击图片出现拖拽手柄，可拉伸缩放。
        // 官方默认 onSelectState 为 resize + rotate，这里按需求只保留缩放（不旋转）
        new ImageEditPlugin({ disableRotate: true }),
        // 对标官方 demo：Ctrl+B/I/U、Ctrl+Z/Y、Ctrl+Shift+7/8 等快捷键
        new ShortcutPlugin(),
        // 粘贴/拖放进来的内联图片（base64）落盘换持久 URL
        this.imagePlugin,
        new EditorPlugin(),
      ],
      // 不设 defaultSegmentFormat：默认字体/字号/颜色交给 #editorContent 的 CSS（见 EditorContent.scss）。
      // 设了它反而有害——roosterjs 的 FormatPlugin 会在每次输入时把默认格式刷成段落上的内联 style，
      // 于是每段都挂着同一串 style，还会盖掉 CSS 里的颜色；只有用户手动改过的样式才该写进 HTML
    });
  }

  /** 当前正文的 HTML：入库就是取它 */
  get content(): string {
    return exportContent(this.editor);
  }

  /**
   * 把 HTML 写进编辑器（打开某篇文章时回填正文）。
   * roosterjs 没有 setContentModel，只能借 formatContentModel：在回调里把模型的内容块整体换掉，
   * 返回 true 表示模型已改动、需要写回 DOM。skipDOMSelection 是不给它安插选区（没人在这时候打字）。
   */
  setContent(html: string): void {
    this.editor.formatContentModel(
      (model) => {
        model.blocks = createModelFromHtml(html).blocks;
        return true;
      },
      { apiName: "setContent", skipDOMSelection: true },
    );
  }
}

export default new EditorContent();
