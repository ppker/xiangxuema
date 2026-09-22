# DraftDepot（稿仓）

<p align="center">
  <img src="./Doc/logo.png" width="128" alt="DraftDepot">
</p>

一款 Windows 桌面端多平台文章编辑与发布工具：本地优先，文章一键灌入各平台，代码块高亮自动适配，图片自动传对方图床。

## 特性

- 本地存储：数据目录 `%APPDATA%\DraftDepot`
- 富文本编辑器：基于 [roosterjs](https://github.com/microsoft/roosterjs)
- 代码块高亮：基于 [shiki](https://github.com/shikijs/shiki) 代码着色
- 图片即贴即存：粘贴或拖入的图像自动落盘到数据目录
- 自动保存：改动后 2 秒内入库
- 分类与文章管理：分类树支持多层嵌套，右键改名/删除；
- 单文件发行：一个 exe 独立运行，仅 3 MB

## 支持的发布平台

- 微信公众号
- 知乎
- CSDN 
- 开源中国
- 博客园 
- 掘金 
- 51CTO 
- InfoQ 

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
