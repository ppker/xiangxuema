#pragma once
#include <Windows.h>
#include <vector>
#include <string>

class Util
{
public:
	static std::wstring convertToWStr(const char* str);
	static std::string convertToStr(const std::wstring& wstr);
};

