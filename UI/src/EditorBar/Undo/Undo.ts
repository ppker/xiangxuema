import html from "./Undo.html?raw";
import CtrlBase from "../../CtrlBase";
import { undo } from "roosterjs-content-model-core";
import EditorContent from "../../EditorContent/EditorContent";

class Undo extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.addEventListener("click", () => {
      undo(EditorContent.editor);
    });
  }
}

export default new Undo();
