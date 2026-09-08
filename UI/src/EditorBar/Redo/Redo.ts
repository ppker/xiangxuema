import html from "./Redo.html?raw";
import CtrlBase from "../../CtrlBase";
import { redo } from "roosterjs-content-model-core";
import EditorContent from "../../EditorContent/EditorContent";

class Redo extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.addEventListener("click", () => {
      redo(EditorContent.editor);
    });
  }
}

export default new Redo();
