import html from "./ListBullet.html?raw";
import bulletSvg from "../icon/listBullet.svg?raw";
import CtrlBase from "../../CtrlBase";
import { toggleBullet } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

/**
 * 无序列表按钮（模块单例）。
 * 点击把当前段落切换为无序列表（已是则还原为正文）；光标所在段落处于无序列表时点亮。
 */
class ListBullet extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector(".toolIcon")!.innerHTML = bulletSvg;
    // 关键：阻止 mousedown 默认行为，避免按钮抢走编辑器焦点/清掉文本选区。
    // roosterjs 的列表 toggle 按"当前选区"判定 on/off，选区一丢，第二次点击会被误判为"设置列表"而重复嵌套
    this.dom.addEventListener("mousedown", (e) => e.preventDefault());
    this.dom.addEventListener("click", () => {
      toggleBullet(EditorContent.editor);
    });
    Msg.on("editorState", (state) => {
      this.dom.classList.toggle("active", state.isBullet === true);
    });
  }
}

export default new ListBullet();
