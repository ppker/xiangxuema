#pragma once
#include <Windows.h>
#include <vector>
#include <string>
#include <tuple>
#include "SQLite/sqlite3.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h> // 提供 IMap::HasKey / IVector::Append 的定义，避免 C3779

using namespace winrt::Windows::Data::Json;

class Util
{
public:
	static std::wstring convertToWStr(const char* str);
	static std::string convertToStr(const std::wstring& wstr);
	static std::tuple<void*, DWORD> getRes(const std::wstring& name);
	/// 取 IPC 消息里的 args 对象；没有 args、或它不是对象时返回空对象（后续 HasKey 一律 false）
	static JsonObject msgArgs(const JsonObject& param);
	/// 取 args 里的字符串参数；缺失或类型不对时返回空串
	static std::wstring argString(const JsonObject& args, const wchar_t* key);
	/// 取 args 里的数字参数；缺失或类型不对时用 fallback
	static sqlite3_int64 argNumber(const JsonObject& args, const wchar_t* key, sqlite3_int64 fallback);
};
