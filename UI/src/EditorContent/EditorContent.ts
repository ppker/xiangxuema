import "./EditorContent.scss";
import html from "./EditorContent.html?raw";
import CtrlBase from "../CtrlBase";
import { Editor } from "roosterjs-content-model-core";
import { WatermarkPlugin } from "roosterjs";
import EditorPlugin from "./EditorPlugin";
import QuoteKeyboardPlugin from "./QuoteKeyboardPlugin";

class EditorContent extends CtrlBase {
  editor: Editor | null = null;

  constructor() {
    super(html);
  }

  override ready(): void {
    this.editor = new Editor(this.dom as HTMLDivElement, {
      plugins: [
        new WatermarkPlugin("请输入文章内容…"),
        new EditorPlugin(),
        new QuoteKeyboardPlugin(),
      ],
      defaultSegmentFormat: {
        fontFamily: "微软雅黑",
        fontSize: "15px",
      },
    });
  }
}

export default new EditorContent();
