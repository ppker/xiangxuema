#include "Env.h"
#include "PageSite.h"
#include "WindowSite.h"

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

	webview->Navigate(url.c_str());
}

PageSite::~PageSite()
{
	if (curIcon) DestroyIcon(curIcon);
}

void PageSite::emit(const JsonObject& eventData)
{
	std::wstring eventDataStr{ eventData.Stringify() };
	webview->PostWebMessageAsJson(eventDataStr.data());
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
	result.SetNamedValue(L"id", JsonValue::CreateStringValue(param.GetNamedString(L"id")));
	if (method == L"minimize") {
		win->minimize(param, result);
	}
	else if (method == L"maximize") {
		win->maximize(param, result);
	}
	else if (method == L"restore") {
		win->restore(param, result);
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