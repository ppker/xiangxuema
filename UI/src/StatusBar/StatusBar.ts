import "./StatusBar.scss";
import html from "./StatusBar.html?raw";
import CtrlBase from "../CtrlBase";

class StatusBar extends CtrlBase {
  constructor() {
    super(html);
  }
}

export default new StatusBar();
