import DropBox, { type DropBoxOption } from "./Ctrl/DropBox";

const DEFAULT_FONT = "微软雅黑";

const FONT_NAMES = [
  "Arial",
  "Arial Black",
  "Calibri",
  "Cambria",
  "Comic Sans MS",
  "Consolas",
  "Courier New",
  "Georgia",
  "Helvetica",
  "Impact",
  "Segoe UI",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
  "微软雅黑",
  "宋体",
  "黑体",
  "楷体",
  "仿宋",
];

// 多词字体名加引号，保证 font-family 正确解析；同时用作下拉里字体效果预览
const FONT_OPTIONS: DropBoxOption[] = FONT_NAMES.map((name) => ({
  value: name,
  label: name,
  font: `"${name}", sans-serif`,
}));

export default function FontFamilySelect() {
  return <DropBox title="字体" options={FONT_OPTIONS} value={DEFAULT_FONT} />;
}
