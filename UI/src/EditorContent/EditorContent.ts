import "./EditorContent.scss";
import html from "./EditorContent.html?raw";
import CtrlBase from "../CtrlBase";
import { Editor } from "roosterjs-content-model-core";
import { WatermarkPlugin } from "roosterjs";

/**
 * 富文本编辑区（模块单例）。
 * 根元素 #editorContent 由 ArticleEditor 挂到工具栏之后；
 * 当前为占位，后续富文本编辑器在此填充。
 */
class EditorContent extends CtrlBase {
  editor: Editor | null = null;
  constructor() {
    super(html);
  }
  override ready(): void {
    this.editor = new Editor(this.dom as HTMLDivElement, {
      plugins: [new WatermarkPlugin("请输入文章内容…")],
      defaultSegmentFormat: {
        fontFamily: "微软雅黑",
        fontSize: "15px",
      },
    });
  }
}

export default new EditorContent();
