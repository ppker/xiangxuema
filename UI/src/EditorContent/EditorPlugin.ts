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
        // getFormatState 已含 isBlockQuote 等结构/引用信息，仅缺链接地址，用 detectLinkState 附加
        Msg.emit("editorState", {
          ...getFormatState(this.editor),
          ...detectLinkState(this.editor),
        });
    }
  }
}
