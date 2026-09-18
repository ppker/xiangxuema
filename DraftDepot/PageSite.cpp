#include "Env.h"
#include "PageSite.h"
#include "WindowSite.h"
#include "Util.h"
#include <winrt/Windows.Foundation.Collections.h> // 提供 IMap::HasKey 的定义，避免 C3779

// gdiplus.h 自己不引入 windows.h，必须排在 Env.h 之后
#include <gdiplus.h>

PageSite::PageSite(WindowSite* win, ComPtr<ICoreWebView2>& webview, const std::wstring& url)
	: win{ win }, webview{ webview }, url{ url }
{
	auto msgReceivedCB = Callback<ICoreWebView2WebMessageReceivedEventHandler>(this, &PageSite::onMsgReceived);
	webview->add_WebMessageReceived(msgReceivedCB.Get(), nullptr);

	auto closeWindowCB = Callback<ICoreWebView2WindowCloseRequestedEventHandler>(this, &PageSite::onCloseWindow);
	webview->add_WindowCloseRequested(closeWindowCB.Get(), nullptr);

	auto titleChangedCB = Callback<ICoreWebView2DocumentTitleChangedEventHandler>(this, &PageSite::onTitleChange);
	webview->add_DocumentTitleChanged(titleChangedCB.Get(), nullptr);

	// FaviconChanged 在 ICoreWebView2_15 上，先 QueryInterface 出高版本接口再注册
	ComPtr<ICoreWebView2_15> webview15;
	webview.As(&webview15);
	auto faviconChangeCB = Callback<ICoreWebView2FaviconChangedEventHandler>(this, &PageSite::onFaviconChange);
	webview15->add_FaviconChanged(faviconChangeCB.Get(), nullptr);

	// 脚本要在首屏文档创建时就跑起来，所以先注册再导航
	injectSiteScript(webview);
	webview->Navigate(url.c_str());
}

PageSite::~PageSite()
{
	if (curIcon) DestroyIcon(curIcon);
}

HRESULT PageSite::onMsgReceived(ICoreWebView2* webview, ICoreWebView2WebMessageReceivedEventArgs* args)
{
	PWSTR jsonRaw;
	auto hr = args->get_WebMessageAsJson(&jsonRaw);
	if (FAILED(hr)) return S_OK;
	JsonObject param = JsonObject::Parse(jsonRaw);
	CoTaskMemFree(jsonRaw);
	auto method = param.GetNamedString(L"method");
	JsonObject result;
	// 站点脚本（如 WeiXin.js）直接 postMessage，未必带 id；没有就不回 id，免得 GetNamedString 抛异常
	if (param.HasKey(L"id")) {
		result.SetNamedValue(L"id", JsonValue::CreateStringValue(param.GetNamedString(L"id")));
	}
	if (method == L"minimize") {
		win->minimize();
	}
	else if (method == L"maximize") {
		win->maximize();
	}
	else if (method == L"restore") {
		win->restore();
	}
	else if (method == L"setParam") {
		// args: { key, value }；站点脚本回传站点参数（微信的 token），由 WindowSite 落库
		win->setParam(param, result);
	}
	else {
		// 未知方法回 error：与主 Page 行为对齐，避免前端 invoke 静默 resolve(undefined)
		std::wstring message = L"unknown method: " + std::wstring(method.c_str());
		result.SetNamedValue(L"error", JsonValue::CreateStringValue(message));
	}
	auto resultStr = result.Stringify();
	webview->PostWebMessageAsJson(resultStr.data());
	return S_OK;
}

HRESULT PageSite::onCloseWindow(ICoreWebView2* sender, IUnknown* args)
{
	PostMessage(win->hwnd, WM_CLOSE, 0, 0);
	return S_OK;
}

HRESULT PageSite::onTitleChange(ICoreWebView2* sender, IUnknown* args)
{
	PWSTR title;
	webview->get_DocumentTitle(&title);
	SetWindowText(win->hwnd, title);
	CoTaskMemFree(title);
	return S_OK;
}

void PageSite::injectSiteScript(ComPtr<ICoreWebView2>& webview)
{
	// 站点脚本按窗口 type 同名取资源（Resource.rc 里以 RCDATA 挂进来，type "WeiXin" → WeiXin.js）；
	// 没有对应资源的平台（type 为空，或还没写脚本）就不注入，site 窗口当普通浏览器用
	auto [siteData, siteSize] = Util::getRes(win->type + L".js");
	if (!siteData || siteSize == 0) return;

	// 拼在站点脚本前面的 Msg.js 提供 window.DDMsg：站点脚本直接用它跟 native 说话，
	// 不用各自再写一遍 postMessage / 回包配对
	auto [msgData, msgSize] = Util::getRes(L"Msg.js");
	std::string scriptUtf8;
	if (msgData && msgSize > 0) scriptUtf8.append(static_cast<const char*>(msgData), msgSize);
	// 换行 + 分号隔开两段：免得上一段末尾的行注释把下一段开头吞掉
	scriptUtf8 += "\n;\n";
	scriptUtf8.append(static_cast<const char*>(siteData), siteSize);

	// 脚本文档是 UTF-8，而 AddScriptToExecuteOnDocumentCreated 要 UTF-16
	auto script = Util::convertToWStr(scriptUtf8.c_str());
	// 注册后每次文档创建（含首屏、跳转、iframe）都会自动执行，无需关心返回值
	webview->AddScriptToExecuteOnDocumentCreated(script.c_str(), nullptr);
}

HRESULT PageSite::onFaviconChange(ICoreWebView2* sender, IUnknown* args)
{
	ComPtr<ICoreWebView2_15> webview15;
	webview.As(&webview15);
	// 要 PNG：ICO 只能由网页显式提供，PNG 覆盖面最广
	webview15->GetFavicon(COREWEBVIEW2_FAVICON_IMAGE_FORMAT_PNG,
		Callback<ICoreWebView2GetFaviconCompletedHandler>(
			[this](HRESULT errorCode, IStream* iconStream)
			{
				if (FAILED(errorCode)) return S_OK;
				Gdiplus::Bitmap iconBitmap(iconStream);
				HICON icon;
				auto status = iconBitmap.GetHICON(&icon);
				if (status != Gdiplus::Status::Ok) return S_OK;
				// ICON_SMALL 用于标题栏，ICON_BIG 用于任务栏与 Alt+Tab
				SendMessage(win->hwnd, WM_SETICON, ICON_SMALL, (LPARAM)icon);
				SendMessage(win->hwnd, WM_SETICON, ICON_BIG, (LPARAM)icon);
				if (curIcon) DestroyIcon(curIcon);
				curIcon = icon;
				return S_OK;
			}).Get());
	return S_OK;
}