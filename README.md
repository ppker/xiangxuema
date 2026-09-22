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

- 微信公众号
- 知乎
- CSDN 
- 开源中国
- 博客园 
- 掘金 
- 51CTO 
- InfoQ 

图片不在本地预处理的链路里：注入脚本在对方编辑页里向本程序要一次图片目录句柄（只读），把正文引用的图逐张传它的图床后替换地址。传过的图按「文件 + 站点」记在库里，下次发布直接复用，不给对方图床堆重复副本。

## 运行环境

- Windows 10/11 x64
- WebView2 运行时 ≥ 115.0.1901.177（缺失或过旧时程序会弹窗引导下载）

## 数据都在哪

```text
%APPDATA%\DraftDepot\
├─ db.db      全部数据（SQLite）
├─ images\    正文引用的图片文件
└─ ...        WebView2 的用户数据目录也在这里
```

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
