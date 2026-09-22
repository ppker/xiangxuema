// 把前端构建产物（UI/dist）写成一份资源清单，给 exe 用。
//
// 为什么要生成：产物文件名带内容 hash（dist/assets/index-DWbN91t4.js），每次构建都可能变，
// 手写在 Resource.rc 里一次就得改一次。所以这里扫一遍 dist，生成 DraftDepot/dist.rc，
// 由 Resource.rc 把它 include 进来——资源名就是 URL 里的路径（assets/xxx.js），
// Page::onRequest 拿 URL 路径去 FindResource，两边对得上（见 DraftDepot/Page.cpp）。
//
// 跑法：npm run build 会自动带上它（见 package.json）；也可以在编译 exe 前单独跑一次。

import { readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const uiDir = fileURLToPath(new URL("..", import.meta.url)); // 本脚本在 UI/scripts 下
const distDir = join(uiDir, "dist");
const outFile = fileURLToPath(new URL("../../DraftDepot/dist.rc", import.meta.url));

/** 只嵌这些：.map 是源码映射，exe 里用不上，白占体积 */
const INCLUDED = /\.(html|js|mjs|css|json|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|wasm)$/i;

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

let body = "; 自动生成，别手改：由 UI/scripts/gen-dist-rc.mjs 从 UI/dist 生成\n";

if (!existsSync(distDir) || !existsSync(join(distDir, "index.html"))) {
  // 还没构建过：给一份空清单，好让 exe 在 Debug（走 vite 开发服务器）下也能编译
  body += "; UI/dist 还没有，先给一份空清单。跑 npm run build 后会重新生成\n";
  console.warn("[gen-dist-rc] 没有找到 UI/dist/index.html，生成了空清单：" + outFile);
} else {
  const files = walk(distDir).filter((f) => INCLUDED.test(f)).sort();
  for (const file of files) {
    // 资源名 = 相对 dist 的路径（正斜杠），与 URL 里 https://app.localhost/ 后面那一截一致
    const name = relative(distDir, file).split("\\").join("/");
    // 文件路径相对 DraftDepot 目录（rc.exe 在那里编译 Resource.rc）。
    // 反斜杠在 rc 里是转义符（\a 会被吃掉），所以要写成双反斜杠
    const path = relative(fileURLToPath(new URL("../../DraftDepot", import.meta.url)), file)
      .split("\\")
      .join("\\\\");
    body += `"${name}" RCDATA "${path}"\n`;
  }
  console.log(`[gen-dist-rc] ${files.length} 个文件 → ${outFile}`);
}

writeFileSync(outFile, body);
