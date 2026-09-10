import Msg from "../Msg";
import { getFormatState } from "roosterjs-content-model-api";
import type { ContentModelFormatState, IEditor, PluginEvent } from "roosterjs-content-model-types";

export default class EditorPlugin implements EditorPlugin {
  private editor!: IEditor;
  private lastState: ContentModelFormatState | null = null;
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
      case "selectionChanged":
        this.emitState();
    }
  }

  /**
   * 广播工具栏状态，与官方 createRibbonPlugin 完全同款：
   * 数据源只有 getFormatState(editor)，键数量 + 逐键比较，状态没变化就不广播，
   * 避免每次按键都让所有按钮重算。官方也不在 formatState 之外附加任何选区信息。
   */
  private emitState(): void {
    const next: ContentModelFormatState = getFormatState(this.editor);
    const prev = this.lastState;
    if (prev) {
      const keys = Object.keys(next) as (keyof ContentModelFormatState)[];
      const unchanged =
        keys.length === Object.keys(prev).length &&
        keys.every((key) => Object.is(next[key], prev[key]));
      if (unchanged) {
        return;
      }
    }
    this.lastState = next;
    Msg.emit("editorState", next);
  }
}
