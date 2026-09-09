import html from "./Undo.html?raw";
import CtrlBase from "../../CtrlBase";
import { undo } from "roosterjs-content-model-core";
import EditorContent from "../../EditorContent/EditorContent";
import Msg from "../../Msg";

class Undo extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.addEventListener("click", () => {
      undo(EditorContent.editor);
    });
    Msg.on("editorState", (state) => {
      (this.dom as HTMLButtonElement).disabled = !state.canUndo;
    });
  }
}

export default new Undo();
