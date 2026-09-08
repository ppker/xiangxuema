import html from "./Bold.html?raw";
import CtrlBase from "../../CtrlBase";
import { toggleBold } from "roosterjs-content-model-api";
import EditorContent from "../../EditorContent/EditorContent";

class Bold extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.addEventListener("click", () => {
      toggleBold(EditorContent.editor);
    });
  }
}

export default new Bold();
