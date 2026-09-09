import html from "./Subscript.html?raw";
import subscriptSvg from "../icon/subscript.svg?raw";
import CtrlBase from "../../CtrlBase";
import { toggleSubscript } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

class Subscript extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector(".toolIcon")!.innerHTML = subscriptSvg;
    this.dom.addEventListener("click", () => {
      toggleSubscript(EditorContent.editor);
    });
    Msg.on("editorState", (state) => {
      this.dom.classList.toggle("active", state.isSubscript === true);
    });
  }
}

export default new Subscript();
