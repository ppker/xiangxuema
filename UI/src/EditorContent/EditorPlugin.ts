import Msg from "../Msg";
import { getFormatState } from "roosterjs-content-model-api";
import type { IEditor, PluginEvent } from "roosterjs-content-model-types";
export default class EditorPlugin implements EditorPlugin {
  private editor!: IEditor;
  getName(): string {
    return "EditorState";
  }

  initialize(editor: IEditor): void {
    this.editor = editor;
  }

  dispose(): void {}

  onPluginEvent(event: PluginEvent): void {
    switch (event.eventType) {
      case "editorReady":
      case "keyUp":
      case "mouseUp":
      case "input":
      case "compositionEnd":
      case "contentChanged":
        Msg.emit("editorState", getFormatState(this.editor));
    }
  }
}
