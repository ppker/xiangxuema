#include "Util.h"

std::wstring Util::convertToWStr(const char* str)
{
    if (!str) return std::wstring();
    int count = MultiByteToWideChar(CP_UTF8, 0, str, -1, 0, 0);
    if (count == 0) return std::wstring();
    std::vector<wchar_t> buffer(count);
    MultiByteToWideChar(CP_UTF8, 0, str, -1, buffer.data(), count);
    return std::wstring(buffer.data(), buffer.size() - 1);
}
std::string Util::convertToStr(const std::wstring& wstr)
{
    if (wstr.empty()) return std::string();
    auto count = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.length(), nullptr, 0, nullptr, nullptr);
    if (count <= 0) return std::string();
    std::string str(count, 0);
    WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.length(), str.data(), count, nullptr, nullptr);
    return str;
}
std::tuple<void*, DWORD> Util::getRes(const std::wstring& name)
{
    HRSRC hRes = FindResource(NULL, name.data(), RT_RCDATA);
    if (!hRes) {
        return std::make_tuple(nullptr, 0);
    }
    HGLOBAL hData = LoadResource(NULL, hRes);
    if (!hData) {
        return std::make_tuple(nullptr, 0);
    }
    void* pData = LockResource(hData);
    DWORD size = SizeofResource(NULL, hRes);
    return std::make_tuple(pData, size);
}