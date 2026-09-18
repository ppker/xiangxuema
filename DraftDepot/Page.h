#pragma once
#include "Env.h"

class Window;
class Page
{
public:
	Page(Window* win, ComPtr<ICoreWebView2>& webview);
	~Page();
	void emit(const JsonObject& eventData);
private:
	HRESULT onRequest(ICoreWebView2* webview, ICoreWebView2WebResourceRequestedEventArgs* args);
	HRESULT onMsgReceived(ICoreWebView2* webview, ICoreWebView2WebMessageReceivedEventArgs* args);
	HRESULT onDomLoaded(ICoreWebView2* sender, ICoreWebView2DOMContentLoadedEventArgs* args);
	HRESULT onRequestPermission(ICoreWebView2* webview, ICoreWebView2PermissionRequestedEventArgs* args);
	HRESULT onCloseWindow(ICoreWebView2* sender, IUnknown* args);
	std::wstring getContentType(const std::wstring& fileName);
	HRESULT saveImageToDataPath(const std::wstring& srcPath, std::wstring& outSavedPath);
	HRESULT serveFileFromDataPath(ICoreWebView2WebResourceRequestedEventArgs* args, const std::wstring& resName);
	HRESULT handleSelectImage(ICoreWebView2WebMessageReceivedEventArgs* args, JsonObject& result);
private:
	Window* win;
	ComPtr<ICoreWebView2> webview;
};

