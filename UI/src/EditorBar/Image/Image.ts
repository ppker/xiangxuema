import { createButton } from "../../ToolbarButton";
import { insertImage } from "roosterjs-content-model-api";
import type { IEditor } from "roosterjs-content-model-types";
import imageSvg from "../icon/image.svg?raw";

/**
 * 与官方 insertImageButton 同款：临时创建一个隐藏的 file input 唤起系统文件选择器，
 * 选中后逐个交给 saveImage 交由原生拷入数据目录，拿到可访问 URL 后再插入编辑器。
 * input 在 click() 后立刻从 DOM 移除，但 change 监听由闭包持有，选完文件仍会触发。
 */
function insertImageFromFile(editor: IEditor): void {
  const doc = editor.getDocument();
  const input = doc.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  doc.body.appendChild(input);
  input.addEventListener("change", async () => {
    for (const file of input.files ?? []) {
      const url = await saveImage(file);
      if (url) {
        insertImage(editor, url);
      }
    }
  });
  input.click();
  doc.body.removeChild(input);
}

/**
 * 把选中的 File 对象经 WebView2 附加对象机制交给原生：原生取到文件真实本地路径后，
 * 拷入数据目录并返回可访问的 https://app.localhost/<唯一名> URL，供 insertImage 引用。
 * 与 msg.ts 的 invoke 同构：以唯一 id 关联请求与回包。
 */
function saveImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(8).substring(2);
    const msg = { id, method: "selectImage" };
    const handler = (e: MessageEvent) => {
      const data = e.data;
      if (data && data.id === id) {
        // @ts-ignore
        window.chrome.webview.removeEventListener("message", handler);
        data.error ? reject(data.error) : resolve(data.result);
      }
    };
    // @ts-ignore
    window.chrome.webview.addEventListener("message", handler);
    // @ts-ignore
    window.chrome.webview.postMessageWithAdditionalObjects(msg, [file]);
  });
}

export const imageButton = createButton({
  icon: imageSvg,
  title: "插入图片",
  onClick: insertImageFromFile,
});