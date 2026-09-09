import html from "./Superscript.html?raw";
import superscriptSvg from "../icon/superscript.svg?raw";
import CtrlBase from "../../CtrlBase";
import { toggleSuperscript } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

class Superscript extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector(".toolIcon")!.innerHTML = superscriptSvg;
    this.dom.addEventListener("click", () => {
      toggleSuperscript(EditorContent.editor);
    });
    Msg.on("editorState", (state) => {
      this.dom.classList.toggle("active", state.isSuperscript === true);
    });
  }
}

export default new Superscript();
