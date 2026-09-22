# DraftDepot（稿仓）

<p align="center">
  <img src="./Doc/logo.png" width="128" alt="DraftDepot">
</p>

一款 Windows 桌面端的本地写作与多平台发布工具：文章、分类、图片全部存在自己电脑上（SQLite，无账号、无云端），写完一键灌进各平台的写作页——代码块高亮自动适配，图片自动传对方图床。

## 特性

- **本地存储**：数据落在 `%APPDATA%\DraftDepot`，一个 SQLite 库 + 一个图片目录，备份就是拷文件夹
- **富文本编辑器**：基于 roosterjs content model，工具栏覆盖加粗/斜体/下划线/删除线、上下标、字体字号、前景背景色、标题、对齐、行高、有序无序列表、引用、行内代码、代码块、图片、链接、撤销重做
- **代码块高亮**：shiki 渲染，代码块自带语言标记，发布时换算成各平台认的形式
- **图片即贴即存**：粘贴或拖入的截图自动落盘到数据目录，正文里引用的是 WebView2 内部的虚拟地址；发布时由注入脚本传对方图床并替换地址
- **自动保存**：改动后 2 秒内入库，切换文章、新建前强制落盘，不怕串稿
- **分类与文章管理**：分类树支持多层嵌套，右键改名/删除；删分类时子分类一并删除、文章自动变成未分类
- **自绘主窗口**：`WS_POPUP` + 自绘边框与标题栏，视觉与系统主题解耦
- **单文件发行**：Release 构建把前端产物与站点注入脚本全部嵌进 exe 资源，一个 exe 独立运行

## 支持的发布平台

| 平台 | 灌入的正文形态 | 说明 |
| --- | --- | --- |
| 微信公众号 | HTML | 段落摊平成它自己的结构，代码高亮走 shiki 内联色 |
| 知乎 | HTML | 只给语义结构，样式一概不塞（它只认自己的） |
| CSDN | HTML | 与知乎同一套适配 |
| 开源中国 | Markdown | 整篇转 Markdown，代码块语言直接抄进围栏 |
| 博客园 | Markdown | 同上 |
| 掘金 | Markdown | 同上 |
| 51CTO | Markdown | 同上 |
| InfoQ | Markdown | 它是富文本编辑器，脚本把 Markdown 交给它的"导入 Markdown"，语言标识不丢 |

图片不在本地预处理的链路里：注入脚本在对方编辑页里向本程序要一次图片目录句柄（只读），把正文引用的图逐张传它的图床后替换地址。传过的图按「文件 + 站点」记在库里，下次发布直接复用，不给对方图床堆重复副本。

## 运行环境

- Windows 10/11 x64
- WebView2 运行时 ≥ 115.0.1901.177（缺失或过旧时程序会弹窗引导下载）

## 从源码构建

依赖：

- Visual Studio（v145 工具集，C++20 桌面开发；作者用 VS 2026 开发）
- Node.js ≥ 20.19（Vite 8 的要求）

步骤：

```text
1. 前端
   cd UI
   npm install
   npm run build      # 产物进 UI/dist，并自动重写 Resource.rc 里的资源清单

2. 原生
   打开 DraftDepot.slnx，选 Debug 或 Release、x64，编译运行
```

两种形态的区别：

- **Debug**：先在 `UI` 下跑 `npm run dev`（Vite 开发服务器，`http://localhost:5173`），exe 直接连它——改前端不用重编 exe
- **Release**：前端产物经 `UI/scripts/gen-dist-rc.mjs` 写进 `Resource.rc` 编入 exe，走内部虚拟域 `https://app.localhost` 应答，不依赖磁盘上的任何前端文件

## 架构一瞥

- **两套窗口各配一个页面层**：`Window` + `Page`（主窗口，承载编辑器），`WindowSite` + `PageSite`（站点窗口，加载第三方写作页 + 注入脚本），互不继承
- **IPC**：前端 `Msg.invoke(method, args)` 发 `{ method, args, id }` JSON 消息，native 侧 `Page::onMsgReceived` 分发后 `PostWebMessageAsJson` 回包，靠 id 对齐成 Promise；native 也会主动 `emit` 事件（如窗口最大化/还原）给前端同步状态
- **虚拟域**：`https://app.localhost/*` 的请求由 `Page::onRequest` 从 exe 资源或磁盘应答；`images/` 子路径映射数据目录里的图片文件
- **注入脚本**：`JS/*.js` 以 RCDATA 编进 exe，注入站点窗口。它们与 native 走同一套 IPC：取待发布文章、要图片目录句柄、读 HttpOnly cookie、回报站点参数（如微信 token）
- **数据库**：`category / article / image / image_site / site` 五张表，外键已开启——删文章级联清掉它的图片记录，删分类级联删子分类并给文章解绑

## 目录结构

```text
DraftDepot/
├─ DraftDepot/        原生侧（C++20 / Win32 / WebView2）
│  ├─ Db/             SQLite 访问层（category、article、image、image_site、site）
│  ├─ SQLite/         sqlite3 amalgamation 源码内嵌，无外部依赖
│  ├─ JS/             注入到各站点的脚本（Msg.js 是共用的 IPC 客户端）
│  ├─ Page*.cpp       WebView2 页面层：消息分发、资源应答、cookie、favicon
│  └─ Window*.cpp     窗口层：自绘主窗口 / 站点窗口
├─ UI/                前端（TypeScript + Vite + Sass）
│  ├─ public/         站点 logo、iconfont
│  ├─ scripts/        gen-dist-rc.mjs：构建后重写 Resource.rc 的资源清单
│  └─ src/            标题栏、分类树、文章列表、编辑器、状态栏、自绘边框
├─ Doc/               图标与文档素材
└─ packages/          NuGet 包（WebView2 SDK）
```

## 数据都在哪

```text
%APPDATA%\DraftDepot\
├─ db.db      全部数据（SQLite）
├─ images\    正文引用的图片文件
└─ ...        WebView2 的用户数据目录也在这里
```

## 加一个发布平台

1. `UI/src/EditorTitle/EditorTitle.ts`：往 `publishTargets` 加一条（`title` → 站点 `type`），需要特殊正文形态的话再往 `forSite` 登记一个转换函数
2. `UI/src/EditorTitle/EditorTitle.html`：加发布按钮，logo 放 `UI/public`（命名 `logo<Type>.png`）
3. `DraftDepot/WindowSite.cpp`：往 `siteHome` 加落地地址（有 token 直达编辑页的，像微信那样拼）
4. `DraftDepot/JS/<Type>.js`：写注入脚本——进到对方编辑器后经 `getArticle` 取文章灌入，图片按需上传
5. `DraftDepot/Resource.rc`：加一行 RCDATA 把脚本编进 exe

native 的消息分发不用动：未知 `type` 会落进统一的兜底路径。

## 赞助

<table>
  <tr>
    <td align="center">
      <img alt="支付宝赞助" src="./Doc/alipay.jpg" width="160" height="160">
      <p>支付宝赞助</p>
    </td>
    <td align="center">
      <img alt="微信赞助" src="./Doc/wechat.png" width="160" height="160">
      <p>微信赞助</p>
    </td>
    <td align="center">
      <img alt="作者微信" src="./Doc/author.jpg" width="160" height="160">
      <p>作者微信</p>
    </td>
    <td align="center">
      <img alt="公众号二维码" src="./Doc/gongzhonghao.jpg" width="160" height="160">
      <p>公众号：桌面软件</p>
    </td>
  </tr>
</table>
