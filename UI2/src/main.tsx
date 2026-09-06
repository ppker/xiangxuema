import "./main.scss";
import "./scrollbarHover";
import TitleBar from "./TitleBar";
import ContentBox from "./ContentBox";
import StatusBar from "./StatusBar";
import WinBorder from "./WinBorder";

import msg from "./msg";

const app = document.querySelector<HTMLElement>("body")!;
app.append(<TitleBar />, <ContentBox />, <StatusBar />, <WinBorder />);
msg.emit("ready");
