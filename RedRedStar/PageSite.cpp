#include "Env.h"
#include "PageSite.h"
#include "WindowSite.h"

PageSite::PageSite(WindowSite* win, ComPtr<ICoreWebView2>& webview, const std::wstring& url)
	: win{ win }, webview{ webview }, url{ url }
{
	auto msgReceivedCB = Callback<ICoreWebView2WebMessageReceivedEventHandler>(this, &PageSite::onMsgReceived);
	webview->add_WebMessageReceived(msgReceivedCB.Get(), nullptr);

	auto closeWindowCB = Callback<ICoreWebView2WindowCloseRequestedEventHandler>(this, &PageSite::onCloseWindow);
	webview->add_WindowCloseRequested(closeWindowCB.Get(), nullptr);

	webview->Navigate(url.c_str());
}

PageSite::~PageSite()
{
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