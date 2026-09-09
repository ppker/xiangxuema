import html from "./Strikethrough.html?raw";
import strikethroughSvg from "../icon/strikethrough.svg?raw";
import CtrlBase from "../../CtrlBase";
import { toggleStrikethrough } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

class Strikethrough extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector(".toolIcon")!.innerHTML = strikethroughSvg;
    this.dom.addEventListener("click", () => {
      toggleStrikethrough(EditorContent.editor);
    });
    Msg.on("editorState", (state) => {
      this.dom.classList.toggle("active", state.isStrikeThrough === true);
    });
  }
}

export default new Strikethrough();
