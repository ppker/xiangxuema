import { createButton } from "../ToolbarButton";
import {
  adjustLinkSelection,
  insertImage,
  removeLink,
  toggleBlockQuote,
  toggleBold,
  toggleBullet,
  toggleItalic,
  toggleNumbering,
  toggleStrikethrough,
  toggleSubscript,
  toggleSuperscript,
  toggleUnderline,
} from "roosterjs-content-model-api";
import { redo, undo } from "roosterjs-content-model-core";
import type { ContentModelFormatContainerFormat, IEditor } from "roosterjs-content-model-types";
import boldSvg from "./icon/bold.svg?raw";
import imageSvg from "./icon/image.svg?raw";
import italicSvg from "./icon/italic.svg?raw";
import underlineSvg from "./icon/underline.svg?raw";
import strikethroughSvg from "./icon/strikethrough.svg?raw";
import subscriptSvg from "./icon/subscript.svg?raw";
import superscriptSvg from "./icon/superscript.svg?raw";
import listBulletSvg from "./icon/listBullet.svg?raw";
import listNumberSvg from "./icon/listNumber.svg?raw";
import quoteSvg from "./icon/quote.svg?raw";
import linkRemoveSvg from "./icon/linkRemove.svg?raw";
import undoSvg from "./icon/undo.svg?raw";
import redoSvg from "./icon/redo.svg?raw";

/**
 * 无弹层的工具栏按钮（声明式）。
 * 每个按钮只声明“图标 + 提示 + 命令 + 点亮/禁用条件”，交互由 createButton 统一处理；
 * 带下拉或弹层的控件（Heading/FontFamily/FontSize/Align/LineHeight/Link/TextColor/BackgroundColor）仍各自成组件。
 */

/** 引用块样式（缩进 + 灰底 + 左侧框线 + 深灰文字，内联到 <blockquote>） */
const QUOTE_FORMAT: ContentModelFormatContainerFormat = {
  borderLeft: "3px solid #999999",
  backgroundColor: "#f0f0f0",
  textColor: "#555555",
  marginTop: "1em",
  marginBottom: "1em",
  marginLeft: "2em",
  marginRight: "0",
  paddingTop: "8px",
  paddingBottom: "8px",
  paddingLeft: "12px",
  paddingRight: "12px",
};

export const undoButton = createButton({
  icon: undoSvg,
  title: "撤销 (Ctrl+Z)",
  onClick: undo,
  isDisabled: (state) => !state.canUndo,
});

export const redoButton = createButton({
  icon: redoSvg,
  title: "重做 (Ctrl+Y)",
  onClick: redo,
  isDisabled: (state) => !state.canRedo,
});

export const boldButton = createButton({
  icon: boldSvg,
  title: "加粗 (Ctrl+B)",
  onClick: toggleBold,
  isChecked: (state) => state.isBold === true,
});

export const italicButton = createButton({
  icon: italicSvg,
  title: "斜体 (Ctrl+I)",
  onClick: toggleItalic,
  isChecked: (state) => state.isItalic === true,
});

export const underlineButton = createButton({
  icon: underlineSvg,
  title: "下划线 (Ctrl+U)",
  onClick: toggleUnderline,
  isChecked: (state) => state.isUnderline === true,
});

export const strikethroughButton = createButton({
  icon: strikethroughSvg,
  title: "删除线",
  onClick: toggleStrikethrough,
  isChecked: (state) => state.isStrikeThrough === true,
});

export const subscriptButton = createButton({
  icon: subscriptSvg,
  title: "下标",
  onClick: toggleSubscript,
  isChecked: (state) => state.isSubscript === true,
});

export const superscriptButton = createButton({
  icon: superscriptSvg,
  title: "上标",
  onClick: toggleSuperscript,
  isChecked: (state) => state.isSuperscript === true,
});

export const quoteButton = createButton({
  icon: quoteSvg,
  title: "引用",
  onClick: (editor) => toggleBlockQuote(editor, QUOTE_FORMAT),
  isChecked: (state) => state.isBlockQuote === true,
});

export const listBulletButton = createButton({
  icon: listBulletSvg,
  title: "无序列表",
  onClick: toggleBullet,
  isChecked: (state) => state.isBullet === true,
});

export const listNumberButton = createButton({
  icon: listNumberSvg,
  title: "有序列表",
  onClick: toggleNumbering,
  isChecked: (state) => state.isNumbering === true,
});

export const linkRemoveButton = createButton({
  icon: linkRemoveSvg,
  title: "移除链接",
  onClick: (editor) => {
    // 光标折叠在链接内时先把选区扩到整条链接，removeLink 才能整条移除
    adjustLinkSelection(editor);
    removeLink(editor);
  },
  // 原生 canUnlink：光标/选区命中链接时为 true（折叠光标在链接内同样成立），语义等同“在链接内”
  isChecked: (state) => state.canUnlink === true,
  isDisabled: (state) => state.canUnlink !== true,
});

/**
 * 与官方 insertImageButton 同款：临时创建一个隐藏的 file input 唤起系统文件选择器，
 * 选中后逐个交给 insertImage(editor, file)。
 * input 在 click() 后立刻从 DOM 移除，但 change 监听由闭包持有，选完文件仍会触发。
 */
function insertImageFromFile(editor: IEditor): void {
  const doc = editor.getDocument();
  const input = doc.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  doc.body.appendChild(input);
  input.addEventListener("change", () => {
    for (const file of input.files ?? []) {
      insertImage(editor, file);
    }
  });
  input.click();
  doc.body.removeChild(input);
}

export const imageButton = createButton({
  icon: imageSvg,
  title: "插入图片",
  onClick: insertImageFromFile,
});
