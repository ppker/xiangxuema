import alignCenterSvg from "./icon/align-center.svg?raw";
import alignJustifySvg from "./icon/align-justify.svg?raw";
import alignLeftSvg from "./icon/align-left.svg?raw";
import alignRightSvg from "./icon/align-right.svg?raw";
import DropBox, { type DropBoxOption } from "./Ctrl/DropBox";

/** 对齐方式选项：左/居中/右/两端为段落水平对齐，垂直居中对齐表格单元格内容 */
const ALIGN_OPTIONS: DropBoxOption[] = [
  { value: "left", label: "左对齐", svg: alignLeftSvg },
  { value: "center", label: "居中对齐", svg: alignCenterSvg },
  { value: "right", label: "右对齐", svg: alignRightSvg },
  { value: "justify", label: "两端对齐", svg: alignJustifySvg },
];

const DEFAULT_ALIGN = "left";

export default function AlignSelect() {
  return <DropBox title="对齐方式" options={ALIGN_OPTIONS} value={DEFAULT_ALIGN} />;
}
