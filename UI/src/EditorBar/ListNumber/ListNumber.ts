import html from "./ListNumber.html?raw";
import numberSvg from "../icon/listNumber.svg?raw";
import CtrlBase from "../../CtrlBase";
import { toggleNumbering } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

/**
 * 有序列表按钮（模块单例）。
 * 点击把当前段落切换为有序列表（已是则还原为正文）；光标所在段落处于有序列表时点亮。
 */
class ListNumber extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector(".toolIcon")!.innerHTML = numberSvg;
    // 关键：阻止 mousedown 默认行为，避免按钮抢走编辑器焦点/清掉文本选区。
    // roosterjs 的列表 toggle 按"当前选区"判定 on/off，选区一丢，第二次点击会被误判为"设置列表"而重复嵌套
    this.dom.addEventListener("mousedown", (e) => e.preventDefault());
    this.dom.addEventListener("click", () => {
      toggleNumbering(EditorContent.editor);
    });
    Msg.on("editorState", (state) => {
      this.dom.classList.toggle("active", state.isNumbering === true);
    });
  }
}

export default new ListNumber();
