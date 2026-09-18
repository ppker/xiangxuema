#pragma once
#include "Env.h"

class PageSite;

/**
 * site 窗口：打开外部站点（微信公众号 / 知乎 / CSDN / ...）的容器。
 * 与主 Window 是平行类，不继承：
 *   - 窗口风格：WS_OVERLAPPEDWINDOW（自带标准标题栏、min/max/close、可拖动改大小），
 *     不像主窗口 WS_POPUP 自绘。
 *   - 业务：主 Page 承载产品功能，PageSite 只负责显示网页 + 暴露 IPC 桥。
 * 模块单例：在主 Page::onMsgReceived 收到 openSite IPC 时由 WindowSite::create(url) 创建。
 * 生命周期：
 *   - 自有全局 map windowsSite 跟踪，区别于主窗口的 windows（site 窗口关闭不影响主进程退出）；
 *   - 关窗时 WebView2 自动清理 webview，PageSite 由 unique_ptr 持有。
 */
class WindowSite
{
public:
	WindowSite(const std::wstring& url);
	~WindowSite();
	static WindowSite* create(const std::wstring& url);

	/** 给 PageSite::onMsgReceived 调用的窗口控制（site 页面 JS 可经 IPC 调用） */
	void minimize(const JsonObject& params, JsonObject& result);
	void maximize(const JsonObject& params, JsonObject& result);
	void restore(const JsonObject& params, JsonObject& result);
public:
	HWND hwnd;
	std::wstring url;
private:
	static LRESULT CALLBACK winMsg(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
	void createWin();
	HRESULT onCtrlReady(HRESULT result, ICoreWebView2Controller* ctrl);
	void onDestroy();
private:
	std::unique_ptr<PageSite> page;
	ComPtr<ICoreWebView2Controller> ctrl;
};