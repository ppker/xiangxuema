import "./EditorToolbar.scss";
import AlignSelect from "./EditorToolbarBtn/AlignSelect";
import BackgroundColorButton from "./EditorToolbarBtn/BackgroundColorButton";
import BoldButton from "./EditorToolbarBtn/BoldButton";
import BulletButton from "./EditorToolbarBtn/BulletButton";
import ClearFormatButton from "./EditorToolbarBtn/ClearFormatButton";
import CodeBlockButton from "./EditorToolbarBtn/CodeBlockButton";
import CodeButton from "./EditorToolbarBtn/CodeButton";
import FontFamilySelect from "./EditorToolbarBtn/FontFamilySelect";
import FontSizeSelect from "./EditorToolbarBtn/FontSizeSelect";
import ItalicButton from "./EditorToolbarBtn/ItalicButton";
import LinkButton from "./EditorToolbarBtn/LinkButton";
import NumberingButton from "./EditorToolbarBtn/NumberingButton";
import QuoteButton from "./EditorToolbarBtn/QuoteButton";
import RedoButton from "./EditorToolbarBtn/RedoButton";
import StrikethroughButton from "./EditorToolbarBtn/StrikethroughButton";
import SubscriptButton from "./EditorToolbarBtn/SubscriptButton";
import SuperscriptButton from "./EditorToolbarBtn/SuperscriptButton";
import TextColorButton from "./EditorToolbarBtn/TextColorButton";
import UnderlineButton from "./EditorToolbarBtn/UnderlineButton";
import UndoButton from "./EditorToolbarBtn/UndoButton";
import UnlinkButton from "./EditorToolbarBtn/UnlinkButton";

export default function EditorToolbar() {
  return (
    <div id="editorToolbar">
      <UndoButton />
      <RedoButton />
      <div class="toolDivider" />
      <FontFamilySelect />
      <FontSizeSelect />
      <BoldButton />
      <ItalicButton />
      <UnderlineButton />
      <StrikethroughButton />
      <TextColorButton />
      <BackgroundColorButton />
      <ClearFormatButton />
      <SubscriptButton />
      <SuperscriptButton />
      <div class="toolDivider" />
      <AlignSelect />
      <div class="toolDivider" />
      <BulletButton />
      <NumberingButton />
      <QuoteButton />
      <div class="toolDivider" />
      <CodeButton />
      <CodeBlockButton />
      <div class="toolDivider" />
      <LinkButton />
      <UnlinkButton />
      <div class="toolDivider" />
    </div>
  );
}
