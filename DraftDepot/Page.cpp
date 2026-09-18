#include "Env.h"
#include "Page.h"
#include "Window.h"
#include "WindowSite.h"
#include "Db.h"

#include <fstream>
#include <random>
#include <ctime>
#include <chrono>
#include <filesystem>

namespace
{
    /// 取消息里的 args 对象；没有 args、或它不是对象时返回空对象（后续 HasKey 一律 false）
    JsonObject messageArgs(const JsonObject& param)
    {
        if (param.HasKey(L"args") && param.GetNamedValue(L"args").ValueType() == JsonValueType::Object)
            return param.GetNamedObject(L"args");
        return JsonObject{};
    }

    /// 取 args 里的数字参数；缺失或类型不对时用 fallback
    sqlite3_int64 argNumber(const JsonObject& args, const wchar_t* key, sqlite3_int64 fallback)
    {
        if (!args.HasKey(key)) return fallback;
        auto value = args.GetNamedValue(key);
        return value.ValueType() == JsonValueType::Number
            ? static_cast<sqlite3_int64>(value.GetNumber())
            : fallback;
    }

    /// 取 args 里的字符串参数；缺失或类型不对时返回空串
    std::wstring argString(const JsonObject& args, const wchar_t* key)
    {
        if (!args.HasKey(key)) return {};
        auto value = args.GetNamedValue(key);
        return value.ValueType() == JsonValueType::String ? std::wstring(value.GetString()) : std::wstring{};
    }
}



Page::Page(Window* win, ComPtr<ICoreWebView2>& webview) :win{ win }, webview{ webview }
{
    webview->AddWebResourceRequestedFilter(L"https://app.localhost/*", COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
    auto resRequestedCB = Callback<ICoreWebView2WebResourceRequestedEventHandler>(this, &Page::onRequest);
    webview->add_WebResourceRequested(resRequestedCB.Get(), nullptr);

    auto msgReceivedCB = Callback<ICoreWebView2WebMessageReceivedEventHandler>(this, &Page::onMsgReceived);
    webview->add_WebMessageReceived(msgReceivedCB.Get(), nullptr);

    auto reqPermissionCB = Callback<ICoreWebView2PermissionRequestedEventHandler>(this, &Page::onRequestPermission);
    webview->add_PermissionRequested(reqPermissionCB.Get(), nullptr);

    ComPtr<ICoreWebView2_2> webview2;
    this->webview.As(&webview2);
    auto domLoadedCB = Callback<ICoreWebView2DOMContentLoadedEventHandler>(this, &Page::onDomLoaded);
    webview2->add_DOMContentLoaded(domLoadedCB.Get(), nullptr);

    auto closeWindowCB = Callback<ICoreWebView2WindowCloseRequestedEventHandler>(this, &Page::onCloseWindow);
    webview->add_WindowCloseRequested(closeWindowCB.Get(), nullptr);

	//webview->Navigate(L"https://app.localhost/index.html");
	webview->Navigate(L"http://localhost:5173");
}

Page::~Page()
{
}

void Page::emit(const JsonObject& eventData)
{
    std::wstring eventDataStr{ eventData.Stringify() };
    webview->PostWebMessageAsJson(eventDataStr.data());
}


HRESULT Page::onMsgReceived(ICoreWebView2* webview, ICoreWebView2WebMessageReceivedEventArgs* args)
{
    PWSTR jsonRaw;
    auto hr = args->get_WebMessageAsJson(&jsonRaw);
    if (FAILED(hr)) return S_OK;
    JsonObject param = JsonObject::Parse(jsonRaw);
    CoTaskMemFree(jsonRaw);
    auto method = param.GetNamedString(L"method");
    JsonObject result;
    result.SetNamedValue(L"id", JsonValue::CreateStringValue(param.GetNamedString(L"id")));
    if (method == L"showWindow") {
        win->show(param, result);
    }
    else if (method == L"hittest") {
        win->hittest(param, result);
    }
    else if (method == L"minimize") {
        win->minimize(param, result);
    }
    else if (method == L"maximize") {
        win->maximize(param, result);
    }
    else if (method == L"restore") {
        win->restore(param, result);
    }
    else if (method == L"selectImage") {
        handleSelectImage(args, result);
    }
    else if (method == L"getCategories") {
        // 返回数据放进名为 result 的字段，前端 Msg.resolve(msg.result) 才能取到
        JsonObject payload;
        payload.SetNamedValue(L"categories", Db::loadCategories());
        result.SetNamedValue(L"result", payload);
    }
    else if (method == L"getArticleTitles") {
        // 同上：只给标题，不带正文，也不分页。
        // args.categoryId 可选：不传（或不是数字）表示没有选中分类，加载全部
        JsonObject args = messageArgs(param);
        sqlite3_int64 categoryId = argNumber(args, L"categoryId", -1);
        JsonObject payload;
        payload.SetNamedValue(L"articles", Db::loadArticleTitles(categoryId));
        result.SetNamedValue(L"result", payload);
    }
    else if (method == L"addCategory") {
        // args: { name, parentId? }；parentId 省略或 null 表示建顶层分类。
        // 返回 { id }：前端拿它选中刚建好的分类
        JsonObject args = messageArgs(param);
        JsonObject payload;
        payload.SetNamedValue(L"id", JsonValue::CreateNumberValue(
            static_cast<double>(Db::addCategory(argString(args, L"name"), argNumber(args, L"parentId", -1)))));
        result.SetNamedValue(L"result", payload);
    }
    else if (method == L"renameCategory") {
        // args: { id, name }；返回 { ok }
        JsonObject args = messageArgs(param);
        JsonObject payload;
        payload.SetNamedValue(L"ok", JsonValue::CreateBooleanValue(
            Db::renameCategory(argNumber(args, L"id", -1), argString(args, L"name"))));
        result.SetNamedValue(L"result", payload);
    }
    else if (method == L"removeCategory") {
        // args: { id }；连子分类一起删，返回 { ok }
        JsonObject args = messageArgs(param);
        JsonObject payload;
        payload.SetNamedValue(L"ok", JsonValue::CreateBooleanValue(
            Db::removeCategory(argNumber(args, L"id", -1))));
        result.SetNamedValue(L"result", payload);
    }
    else if (method == L"openSite") {
        // args: { url, type }；前端点"发布到 xxx"按钮时触发，新开一个 site 窗口并 navigate 到 URL。
        // URL 与站点类型都由前端传入：type 标的是哪个平台（公众号 "WeiXin"、CSDN "CSDN" ...），
        // 由 WindowSite 持有，将来加平台只改前端，native 不用动。
        JsonObject args = messageArgs(param);
        std::wstring url = argString(args, L"url");
        if (!url.empty()) {
            WindowSite::create(url, argString(args, L"type"));
        }
    }
    else {
        // 未知方法回一个 error：前端 Msg.invoke 会 reject，而不是静默 resolve(undefined)。
        // 之前"原生侧改了却忘了重新编译 exe"就是被静默吞掉的，补上这条能直接暴露出来
        std::wstring message = L"unknown method: " + std::wstring(method.c_str());
        result.SetNamedValue(L"error", JsonValue::CreateStringValue(message));
    }
    auto resultStr = result.Stringify();
    webview->PostWebMessageAsJson(resultStr.data());
    return S_OK;
}

HRESULT Page::onCloseWindow(ICoreWebView2* sender, IUnknown* args)
{
    PostMessage(win->hwnd, WM_CLOSE, 0, 0);
    return S_OK;
}

HRESULT Page::onDomLoaded(ICoreWebView2* sender, ICoreWebView2DOMContentLoadedEventArgs* args)
{
    return S_OK;
}

HRESULT Page::onRequestPermission(ICoreWebView2* webview, ICoreWebView2PermissionRequestedEventArgs* args)
{
    args->put_State(COREWEBVIEW2_PERMISSION_STATE_ALLOW);
    return S_OK;
}


HRESULT Page::onRequest(ICoreWebView2* webview, ICoreWebView2WebResourceRequestedEventArgs* args)
{
    ComPtr<ICoreWebView2WebResourceRequest> request;
    args->get_Request(&request);
    LPWSTR rawUri = nullptr;
    request->get_Uri(&rawUri);
    std::wstring url(rawUri);
    CoTaskMemFree(rawUri);
    size_t queryPos = url.find(L'?');
    size_t end = (queryPos != std::wstring::npos) ? queryPos : url.length();
    std::wstring resName = url.substr(22, end - 22); //22是“https://app.localhost/”的长度
    HRSRC hRes = FindResource(NULL, resName.data(), RT_RCDATA);
    if (!hRes) {
        // 内嵌资源未命中时，回退到数据目录：读取 dataPath/<resName> 同名文件
        auto hr = serveFileFromDataPath(args, resName);
        // 文件也不存在时保持默认请求失败行为（不 put_Response，让上层按 404 处理）
        return hr == S_OK ? S_OK : hr;
    }
    HGLOBAL hData = LoadResource(NULL, hRes);
    if (!hData) return S_OK;
    void* pData = LockResource(hData);
    DWORD size = SizeofResource(NULL, hRes);
    ComPtr<IStream> stream = SHCreateMemStream((const BYTE*)pData, size);
    auto ct = getContentType(resName);
    ComPtr<ICoreWebView2WebResourceResponse> response;
    Env::getWebViewEnv()->CreateWebResourceResponse(stream.Get(), 200, L"OK", ct.data(), &response);
    args->put_Response(response.Get());
    return S_OK;
}

std::wstring Page::getContentType(const std::wstring& fileName)
{
    static const std::unordered_map<std::string, std::wstring> mimeTypes = {
        {".html", L"Content-Type: text/html"},
        {".htm",  L"Content-Type: text/html"},
        {".js",   L"Content-Type: application/javascript"},
        {".css",  L"Content-Type: text/css"},
        {".json", L"Content-Type: application/json"},
        {".png",  L"Content-Type: image/png"},
        {".jpg",  L"Content-Type: image/jpeg"},
        {".jpeg", L"Content-Type: image/jpeg"},
        {".gif",  L"Content-Type: image/gif"},
        {".svg",  L"Content-Type: image/svg+xml"},
        {".ico",  L"Content-Type: image/x-icon"},
        {".woff", L"Content-Type: font/woff"},
        {".woff2",L"Content-Type: font/woff2"},
        {".ttf",  L"Content-Type: font/ttf"},
        {".eot",  L"Content-Type: application/vnd.ms-fontobject"},
        {".txt",  L"Content-Type: text/plain"},
        {".wasm", L"Content-Type: application/wasm"},
        {".mp3",  L"Content-Type: audio/mpeg"},
        {".mp4",  L"Content-Type: video/mp4"}
    };
    std::filesystem::path path(fileName);
    auto ext = path.extension().string();
    std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
    auto it = mimeTypes.find(ext);
    if (it != mimeTypes.end()) {
        return it->second;
    }
    return L"Content-Type: application/octet-stream";
}

HRESULT Page::saveImageToDataPath(const std::wstring& srcPath, std::wstring& outSavedPath)
{
    auto dir = Env::getDataPath();
    std::error_code ec;
    std::filesystem::create_directories(dir, ec);
    if (ec) return E_FAIL;

    // 唯一文件名：img_<秒时间戳>_<随机数>，保留源文件扩展名
    auto ext = std::filesystem::path(srcPath).extension().wstring();
    static std::mt19937 rng{ static_cast<unsigned>(std::time(nullptr)) };
    unsigned long long ts = static_cast<unsigned long long>(std::chrono::system_clock::now().time_since_epoch().count());
    auto name = L"img_" + std::to_wstring(ts) + L"_" + std::to_wstring(rng()) + ext;
    auto dest = dir / name;

    std::filesystem::copy_file(srcPath, dest, std::filesystem::copy_options::overwrite_existing, ec);
    if (ec) return E_FAIL;

    outSavedPath = dest.wstring();
    return S_OK;
}

HRESULT Page::serveFileFromDataPath(ICoreWebView2WebResourceRequestedEventArgs* args, const std::wstring& resName)
{
    auto filePath = Env::getDataPath() / resName;
    std::error_code ec;
    auto sz = std::filesystem::file_size(filePath, ec);
    if (ec) return S_FALSE; // 文件不存在，交由调用方决定
    std::ifstream f(filePath, std::ios::binary);
    std::string bytes((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    if (bytes.empty()) return S_FALSE;
    ComPtr<IStream> stream = SHCreateMemStream((const BYTE*)bytes.data(), (UINT)bytes.size());
    auto ct = getContentType(resName);
    ComPtr<ICoreWebView2WebResourceResponse> response;
    Env::getWebViewEnv()->CreateWebResourceResponse(stream.Get(), 200, L"OK", ct.data(), &response);
    args->put_Response(response.Get());
    return S_OK;
}

HRESULT Page::handleSelectImage(ICoreWebView2WebMessageReceivedEventArgs* args, JsonObject& result)
{
    ComPtr<ICoreWebView2WebMessageReceivedEventArgs2> args2;
    if (FAILED(args->QueryInterface(IID_PPV_ARGS(&args2)))) return S_FALSE;

    ComPtr<ICoreWebView2ObjectCollectionView> objs;
    args2->get_AdditionalObjects(&objs);
    UINT32 count = 0;
    objs->get_Count(&count);
    if (count == 0) return S_FALSE;

    ComPtr<ICoreWebView2File> file;
    objs->GetValueAtIndex(0, &file);
    PWSTR rawPath = nullptr;
    file->get_Path(&rawPath);
    if (!rawPath) return S_FALSE;

    std::wstring srcPath(rawPath);
    CoTaskMemFree(rawPath);

    std::wstring savedPath;
    auto hr = saveImageToDataPath(srcPath, savedPath);
    if (SUCCEEDED(hr)) {
        result.SetNamedValue(L"result", JsonValue::CreateStringValue(L"https://app.localhost/" + std::filesystem::path(savedPath).filename().wstring()));
        return S_OK;
    }
    result.SetNamedValue(L"error", JsonValue::CreateStringValue(L"保存图片失败"));
    return S_FALSE;
}
