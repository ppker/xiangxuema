import html from "./Underline.html?raw";
import underlineSvg from "../icon/underline.svg?raw";
import CtrlBase from "../../CtrlBase";
import { toggleUnderline } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

class Underline extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector(".toolIcon")!.innerHTML = underlineSvg;
    this.dom.addEventListener("click", () => {
      toggleUnderline(EditorContent.editor);
    });
    Msg.on("editorState", (state) => {
      this.dom.classList.toggle("active", state.isUnderline === true);
    });
  }
}

export default new Underline();
