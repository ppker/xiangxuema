#pragma once
#include "Env.h"

class WindowSite;

/**
 * site 窗口的 webview 页面层（与 Page 类平行，不继承）。
 *   - 不劫持本地资源（不注册 WebResourceRequested filter），让 webview 走网络正常加载；
 *   - 注册 WebMessageReceived 处理 site 页面 JS 调 native（minimize / maximize / restore）；
 *   - 注册 WindowCloseRequested 转发 WM_CLOSE 关窗；
 *   - 注册 DocumentTitleChanged / FaviconChanged，把网页标题与 favicon 同步到窗口标题栏与图标。
 * 不做主动脚本注入：站点脚本只填site 页面用到的那部分。
 */
class PageSite
{
public:
	PageSite(WindowSite* win, ComPtr<ICoreWebView2>& webview, const std::wstring& url);
	~PageSite();
private:
	HRESULT onMsgReceived(ICoreWebView2* webview, ICoreWebView2WebMessageReceivedEventArgs* args);
	HRESULT onCloseWindow(ICoreWebView2* sender, IUnknown* args);
	HRESULT onTitleChange(ICoreWebView2* sender, IUnknown* args);
	HRESULT onFaviconChange(ICoreWebView2* sender, IUnknown* args);
	/// 注入站点脚本：把 Msg.js（DDMsg 这个 IPC 客户端）与按窗口 type 取到的同名脚本
	/// （type "WeiXin" → WeiXin.js）拼在一起注册；必须在 Navigate 之前调，否则首屏文档赶不上
	void injectSiteScript(ComPtr<ICoreWebView2>& webview);
	/// args: 无；站点脚本（如 ZhiHu.js）往对方图床传正文里的图之前，向 native 要图片目录的句柄，
	/// 拿到目录后自己 getFileHandle 取文件，不用再为每张图往返一次。
	/// 只能由 native 给：脚本跑在网页上下文里，碰不到本机文件系统，光有路径也造不出 File 对象。
	/// 与主窗口的 Page::handleGetImageDir 是同一个目录，但只给 READ——站点只传图，不写图
	void handleGetImageDir(JsonObject& result);
private:
	WindowSite* win;
	ComPtr<ICoreWebView2> webview;
	std::wstring url;
	HICON curIcon{};
};