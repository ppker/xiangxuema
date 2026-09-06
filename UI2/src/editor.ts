import { Editor as RoosterEditor } from "roosterjs-content-model-core";
import { WatermarkPlugin } from "roosterjs";
class Editor {
  private editor?: RoosterEditor;
  init(host: HTMLDivElement) {
    this.editor?.dispose(); // 稳妥起见，重复 init 先销毁旧的
    this.editor = new RoosterEditor(host, {
      plugins: [new WatermarkPlugin("请输入文章内容…")],
      defaultSegmentFormat: { fontFamily: "微软雅黑", fontSize: "15px" },
    });
  }
}

export default new Editor();
