#pragma once
#include "Env.h"

class Page;
class Window
{
public:
	Window();
	~Window();
	static Window* create();
	void show(const JsonObject& params, JsonObject& result);
	void hittest(const JsonObject& params, JsonObject& result);
	void minimize(const JsonObject& params, JsonObject& result);
	void maximize(const JsonObject& params, JsonObject& result);
	void restore(const JsonObject& params, JsonObject& result);
public:
	HWND hwnd;
private:
	static LRESULT CALLBACK winMsg(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
	void createWin();
	HRESULT onCtrlReady(HRESULT result, ICoreWebView2Controller* ctrl);
	void onSize(WPARAM wParam, LPARAM lParam);
	void onDestroy();
	void onGetMinMaxInfo(MINMAXINFO* mmi);
	/** 默认窗口矩形：DEFAULT_WIDTH x DEFAULT_HEIGHT，摆在主显示器工作区正中。
	    建窗、"从最大化还原"都用它，两处的默认大小因此永远同步 */
	RECT defaultRect() const;
private:
	/// 默认窗口尺寸（含边框），改默认大小只动这里
	static constexpr int DEFAULT_WIDTH = 1600;
	static constexpr int DEFAULT_HEIGHT = 1200;
	std::unique_ptr<Page> page;
	ComPtr<ICoreWebView2Controller> ctrl;
	std::wstring url;
};

