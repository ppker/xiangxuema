#pragma once
#include "Env.h"

class WindowSite;

/**
 * site 窗口的 webview 页面层（与 Page 类平行，不继承）。
 *   - 不劫持本地资源（不注册 WebResourceRequested filter），让 webview 走网络正常加载；
 *   - 注册 WebMessageReceived 处理 site 页面 JS 调 native（minimize / maximize / restore）；
 *   - 注册 WindowCloseRequested 转发 WM_CLOSE 关窗；
 *   - 暴露 emit() 让 native 能 PostWebMessage 推事件给 site 页面 JS。
 * 不做主动脚本注入：将来如需自动填字段，由调用方 emit 事件给 site 页面 JS 自行处理。
 */
class PageSite
{
public:
	PageSite(WindowSite* win, ComPtr<ICoreWebView2>& webview, const std::wstring& url);
	~PageSite();
	void emit(const JsonObject& eventData);
private:
	HRESULT onMsgReceived(ICoreWebView2* webview, ICoreWebView2WebMessageReceivedEventArgs* args);
	HRESULT onCloseWindow(ICoreWebView2* sender, IUnknown* args);
private:
	WindowSite* win;
	ComPtr<ICoreWebView2> webview;
	std::wstring url;
};