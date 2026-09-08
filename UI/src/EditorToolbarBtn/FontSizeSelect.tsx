import DropBox, { type DropBoxOption } from "./Ctrl/DropBox";

const DEFAULT_FONT_SIZE = "15pt";

const FONT_SIZES = [
  "9pt",
  "10pt",
  "11pt",
  "12pt",
  "14pt",
  "15pt",
  "16pt",
  "18pt",
  "20pt",
  "24pt",
  "28pt",
  "32pt",
  "36pt",
  "48pt",
  "60pt",
  "72pt",
];

const SIZE_OPTIONS: DropBoxOption[] = FONT_SIZES.map((size) => ({ value: size }));

export default function FontSizeSelect() {
  return <DropBox title="字号" options={SIZE_OPTIONS} value={DEFAULT_FONT_SIZE} />;
}
