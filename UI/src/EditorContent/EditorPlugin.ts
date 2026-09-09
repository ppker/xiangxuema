import Msg from "../Msg";
import { getFormatState } from "roosterjs-content-model-api";
import type { IEditor, PluginEvent } from "roosterjs-content-model-types";
import { detectLinkState } from "./linkState";
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
        // getFormatState 不含链接信息，用 detectLinkState 附加 hasTextSelection/inLink/linkUrl
        Msg.emit("editorState", {
          ...getFormatState(this.editor),
          ...detectLinkState(this.editor),
        });
    }
  }
}
