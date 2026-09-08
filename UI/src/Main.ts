import "./Main.scss";
import TitleBar from "./TitleBar/TitleBar";
import ContentBox from "./ContentBox/ContentBox";
import StatusBar from "./StatusBar/StatusBar";

const body = document.querySelector<HTMLElement>("body")!;

TitleBar.appendTo(body);
ContentBox.appendTo(body);
StatusBar.appendTo(body);
