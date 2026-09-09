import html from "./Italic.html?raw";
import italicSvg from "../icon/italic.svg?raw";
import CtrlBase from "../../CtrlBase";
import { toggleItalic } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

class Italic extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector(".toolIcon")!.innerHTML = italicSvg;
    this.dom.addEventListener("click", () => {
      toggleItalic(EditorContent.editor);
    });
    Msg.on("editorState", (state) => {
      this.dom.classList.toggle("active", state.isItalic === true);
    });
  }
}

export default new Italic();
