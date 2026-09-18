#pragma once
#include "Db.h"
#include <string>
#include <winrt/Windows.Data.Json.h>

using namespace winrt::Windows::Data::Json;

/**
 * 站点配置的数据访问：按"站点名 + 参数键"存一个值，
 * 例如微信后台的登录凭证：name = "WeiXin"，param_key = "token"，param_val = "996767730"。
 * 与 Category / Article 平级，直接对外提供服务；数据库连接统一从 Db::get() 取，本类不持有连接。
 */
class Site
{
public:
	/// 取某个站点的全部参数，组装成 { "<param_key>": "<param_val>" }；
	/// site 窗口创建时按窗口 type 调它，一次把该站点的配置读进内存
	static JsonObject load(const std::wstring& name);
	/// 设置参数值：已存在就覆盖（表上 (name, param_key) 唯一，走 UPSERT），不存在则插入
	static bool set(const std::wstring& name, const std::wstring& key, const std::wstring& value);
};
