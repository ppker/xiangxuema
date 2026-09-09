import html from "./Bold.html?raw";
import boldSvg from "../icon/bold.svg?raw";
import CtrlBase from "../../CtrlBase";
import { toggleBold } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

class Bold extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector(".toolIcon")!.innerHTML = boldSvg;
    this.dom.addEventListener("click", () => {
      toggleBold(EditorContent.editor);
    });
    Msg.on("editorState", (state) => {
      this.dom.classList.toggle("active", state.isBold === true);
    });
  }
}

export default new Bold();
