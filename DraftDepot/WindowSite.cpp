#include "Env.h"
#include "WindowSite.h"
#include "PageSite.h"
#include "Util.h"
#include "Db/Site.h"

#include <chrono>

namespace
{
	/// 各平台的落地首页：没有可用 token（或该平台还没做"直奔编辑页"）时打开这里，让用户自己登录
	const std::unordered_map<std::wstring, std::wstring> siteHome = {
		{ L"WeiXin", L"https://mp.weixin.qq.com/" },
		{ L"CSDN",   L"https://mp.csdn.net/" },
	};

	/// 与 JS 的 Date.now() 同口径：Unix 纪元起的毫秒数，URL 里的 timestamp 要 13 位
	std::wstring nowMillis()
	{
		auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
			std::chrono::system_clock::now().time_since_epoch()).count();
		return std::to_wstring(ms);
	}

}

/// site 窗口的全局注册表。关 site 窗口不影响主进程；主进程退出由主 Window::onDestroy 触发。
std::unordered_map<HWND, std::unique_ptr<WindowSite>> windowsSite;

WindowSite::WindowSite(const std::wstring& type)
	: type{ type }, config{ Site::load(type) }
{
	// 建窗即加载站点配置：Db 在 Env::init 阶段就已就绪，这里拿到的必然是可用连接。
	// 没配过任何参数的站点（或 type 为空）拿到的是空 JsonObject，按"没有配置"处理
}

WindowSite::~WindowSite()
{
}

WindowSite* WindowSite::create(const std::wstring& type)
{
	auto win = std::make_unique<WindowSite>(type);
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
	wcex.lpszClassName = L"DraftDepotSite";
	RegisterClassEx(&wcex);
	// 位置 (350,350) 错开主窗口的 (200,300)；1200x800 与主窗口一致；WS_OVERLAPPEDWINDOW 自带
	// 标准标题栏、最小化/最大化/关闭按钮、可拖动改大小，所以不再像主窗口那样自绘/扩展 DWM 边框。
	// 标题先用站点类型兜底，网页加载完成后由 PageSite::onTitleChange 换成 document.title
	auto title = type.empty() ? std::wstring{ L"DraftDepot" } : type;
	hwnd = CreateWindowEx(0, wcex.lpszClassName, title.c_str(), WS_OVERLAPPEDWINDOW,
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

void WindowSite::setParam(const JsonObject& params, JsonObject& result)
{
	JsonObject args = Util::msgArgs(params);
	std::wstring key = Util::argString(args, L"key");
	std::wstring value = Util::argString(args, L"value");

	bool ok = false;
	bool changed = false;
	if (!type.empty() && !key.empty())
	{
		// 先跟内存里已加载的 config 比：一样就不动数据库（脚本每 800ms 轮一次，别反复写盘）
		std::wstring old = config.HasKey(key) ? std::wstring{ config.GetNamedString(key) } : std::wstring{};
		if (old != value)
		{
			changed = Site::set(type, key, value);
			if (changed) config.SetNamedValue(key, JsonValue::CreateStringValue(value));
		}
		ok = true;
	}
	result.SetNamedValue(L"ok", JsonValue::CreateBooleanValue(ok));
	result.SetNamedValue(L"changed", JsonValue::CreateBooleanValue(changed));
}

HRESULT WindowSite::onCtrlReady(HRESULT result, ICoreWebView2Controller* ctrl)
{
	this->ctrl = ctrl;
	ComPtr<ICoreWebView2> webview;
	ctrl->get_CoreWebView2(&webview);
	RECT bounds;
	GetClientRect(hwnd, &bounds);
	ctrl->put_Bounds(bounds);
	// 站点脚本由 PageSite 注入（它要在自己 Navigate 之前注册，才能赶上首屏文档）
	page = std::make_unique<PageSite>(this, webview, buildStartUrl());
	return S_OK;
}

std::wstring WindowSite::buildStartUrl()
{
	if (type == L"WeiXin")
	{
		// 库里有 token 就直奔"新建图文"的编辑页；timestamp 用当前毫秒，避免拿到缓存页
		if (config.HasKey(L"token"))
		{
			std::wstring token{ config.GetNamedString(L"token") };
			if (!token.empty())
				return std::wstring{ L"https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2" }
					+ L"&action=edit&isNew=1&type=77&createType=0&token=" + token
					+ L"&lang=zh_CN&timestamp=" + nowMillis();
		}
		// 没 token（或 token 是空串）：只能开首页让用户登录，登录后由注入脚本把新 token 带回来
		return siteHome.at(L"WeiXin");
	}

	// 其他平台：先落到各自首页；没登记过的 type 返回空串（PageSite 不会导航）
	auto it = siteHome.find(type);
	return it == siteHome.end() ? std::wstring{} : it->second;
}


void WindowSite::onDestroy()
{
	windowsSite.erase(hwnd);
	// 不触发 PostQuitMessage：site 窗口关闭不影响主进程，主进程退出由主 Window::onDestroy 触发
}