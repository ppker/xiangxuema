import "./EditorContent.scss";
import html from "./EditorContent.html?raw";
import CtrlBase from "../CtrlBase";
import { Editor } from "roosterjs-content-model-core";
import {
  EditPlugin,
  HyperlinkPlugin,
  ImageEditPlugin,
  PastePlugin,
  ShortcutPlugin,
  WatermarkPlugin,
} from "roosterjs";
import EditorPlugin from "./EditorPlugin";

class EditorContent extends CtrlBase {
  editor: Editor | null = null;

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
        new EditorPlugin(),
      ],
      defaultSegmentFormat: {
        fontFamily: "微软雅黑",
        fontSize: "15px",
      },
    });
  }
}

export default new EditorContent();
