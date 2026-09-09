import html from "./Redo.html?raw";
import CtrlBase from "../../CtrlBase";
import { redo } from "roosterjs-content-model-core";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

class Redo extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.addEventListener("click", () => {
      redo(EditorContent.editor);
    });
    Msg.on("editorState", (state) => {
      (this.dom as HTMLButtonElement).disabled = !state.canRedo;
    });
  }
}

export default new Redo();
