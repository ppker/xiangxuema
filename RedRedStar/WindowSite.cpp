#include "Env.h"
#include "WindowSite.h"
#include "PageSite.h"

/// site 窗口的全局注册表。关 site 窗口不影响主进程；主进程退出由主 Window::onDestroy 触发。
std::unordered_map<HWND, std::unique_ptr<WindowSite>> windowsSite;

WindowSite::WindowSite(const std::wstring& url) : url{ url }
{
}

WindowSite::~WindowSite()
{
}

WindowSite* WindowSite::create(const std::wstring& url)
{
	auto win = std::make_unique<WindowSite>(url);
	win->createWin();
	auto result = win.get();
	windowsSite.insert({ win->hwnd, std::move(win) });
	return result;
}

LRESULT WindowSite::winMsg(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
	auto self = reinterpret_cast<WindowSite*>(GetWindowLongPtr(hwnd, GWLP_USERDATA));
	if (!self) return DefWindowProc(hwnd, msg, wParam, lParam);
	if (msg == WM_SIZE) {
		if (self->ctrl) {
			RECT bounds;
			GetClientRect(hwnd, &bounds);
			self->ctrl->put_Bounds(bounds);
		}
	}
	else if (msg == WM_DESTROY) {
		self->onDestroy();
	}
	return DefWindowProc(hwnd, msg, wParam, lParam);
}

void WindowSite::createWin()
{
	WNDCLASSEXW wcex;
	wcex.cbSize = sizeof(WNDCLASSEX);
	wcex.style = CS_HREDRAW | CS_VREDRAW;
	wcex.lpfnWndProc = &WindowSite::winMsg;
	wcex.cbClsExtra = 0;
	wcex.cbWndExtra = 0;
	wcex.hInstance = GetModuleHandle(nullptr);
	wcex.hIcon = LoadIcon(wcex.hInstance, (LPCTSTR)IDI_WINLOGO);
	wcex.hIconSm = LoadIcon(wcex.hInstance, (LPCTSTR)IDI_WINLOGO);
	wcex.hCursor = LoadCursor(nullptr, IDC_ARROW);
	wcex.hbrBackground = (HBRUSH)COLOR_WINDOW;
	wcex.lpszMenuName = nullptr;
	wcex.lpszClassName = L"RedRedStarSite";
	RegisterClassEx(&wcex);
	// 位置 (350,350) 错开主窗口的 (200,300)；1200x800 与主窗口一致；WS_OVERLAPPEDWINDOW 自带
	// 标准标题栏、最小化/最大化/关闭按钮、可拖动改大小，所以不再像主窗口那样自绘/扩展 DWM 边框。
	// 标题先用 url 兜底，网页加载完成后由 PageSite::onTitleChange 换成 document.title
	hwnd = CreateWindowEx(0, wcex.lpszClassName, url.c_str(), WS_OVERLAPPEDWINDOW,
		350, 350, 1200, 800, nullptr, nullptr, wcex.hInstance, nullptr);
	SetWindowLongPtr(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(this));
	// 打开即最大化：site 窗口是给发布平台用的，需要尽可能大的可视区，省得用户再去点最大化按钮
	ShowWindow(hwnd, SW_SHOWMAXIMIZED);
	auto wvEnv = Env::getWebViewEnv();
	auto ctrlReadyCB = Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(this, &WindowSite::onCtrlReady);
	wvEnv->CreateCoreWebView2Controller(hwnd, ctrlReadyCB.Get());
}

void WindowSite::minimize(const JsonObject& params, JsonObject& result)
{
	ShowWindow(hwnd, SW_MINIMIZE);
}

void WindowSite::maximize(const JsonObject& params, JsonObject& result)
{
	ShowWindow(hwnd, SW_MAXIMIZE);
}

void WindowSite::restore(const JsonObject& params, JsonObject& result)
{
	ShowWindow(hwnd, SW_RESTORE);
}

HRESULT WindowSite::onCtrlReady(HRESULT result, ICoreWebView2Controller* ctrl)
{
	this->ctrl = ctrl;
	ComPtr<ICoreWebView2> webview;
	ctrl->get_CoreWebView2(&webview);
	RECT bounds;
	GetClientRect(hwnd, &bounds);
	ctrl->put_Bounds(bounds);
	page = std::make_unique<PageSite>(this, webview, url);
	return S_OK;
}

void WindowSite::onDestroy()
{
	windowsSite.erase(hwnd);
	// 不触发 PostQuitMessage：site 窗口关闭不影响主进程，主进程退出由主 Window::onDestroy 触发
}