import "./TitleBar.scss";
import html from "./TitleBar.html?raw";
import CtrlBase from "../CtrlBase";
import Msg from "../Msg";

class TitleBar extends CtrlBase {
  constructor() {
    super(html);
  }

  override ready(): void {
    this.dom.querySelector<HTMLElement>("#titleLabel").addEventListener("mousedown", () => Msg.invoke("hittest", { val: 2 }));
    this.dom.querySelector<HTMLElement>("#minimizeBtn").addEventListener("mousedown", this.onMinimize);
    this.dom.querySelector<HTMLElement>("#restoreBtn").addEventListener("mousedown", () => Msg.invoke("restore"));
    this.dom.querySelector<HTMLElement>("#maximizeBtn").addEventListener("mousedown", () => Msg.invoke("maximize"));
    this.dom.querySelector<HTMLElement>("#closeBtn").addEventListener("mousedown", () => window.close());
    Msg.on("maximize", () => this.syncMaximizeBtn(false));
    Msg.on("restore", () => this.syncMaximizeBtn(true));
  }

  private readonly onMinimize = async () => {
    const minimizeBtn = this.dom.querySelector<HTMLElement>("#minimizeBtn");
    if (!minimizeBtn) return;
    minimizeBtn.classList.add("suppressHover");
    try {
      await Msg.invoke("minimize");
    } finally {
      window.addEventListener("mousemove", () => minimizeBtn.classList.remove("suppressHover"), { once: true });
    }
  };

  private syncMaximizeBtn(restored: boolean): void {
    const restoreBtn = this.dom.querySelector<HTMLElement>("#restoreBtn");
    const maximizeBtn = this.dom.querySelector<HTMLElement>("#maximizeBtn");
    if (restoreBtn) restoreBtn.style.display = restored ? "none" : "flex";
    if (maximizeBtn) maximizeBtn.style.display = restored ? "flex" : "none";
  }
}

export default new TitleBar();
