import "./StatusBar.scss";
import html from "./StatusBar.html?raw";
import CtrlBase from "../CtrlBase";

class StatusBar extends CtrlBase {
  constructor() {
    super(html);
  }
  setText(text: string): void {
    const messageEl = document.querySelector<HTMLElement>("#statusMessage")!;
    messageEl.textContent = text;
  }
}

export default new StatusBar();
