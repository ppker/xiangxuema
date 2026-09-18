#pragma once
#include "Db.h"
#include <string>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h> // 提供 IVector::Append 的定义，避免 C3779

using namespace winrt::Windows::Data::Json;

/**
 * 文章的数据访问：标题列表的读取（不查正文），外加测试数据写入。
 * 与 Category 平级，直接对外提供服务；数据库连接统一从 Db::get() 取，本类不持有连接。
 */
class Article
{
public:
	/// 读取文章标题（不查正文），按 id 升序
	/// 每项：{ "id": <int>, "title": <string>, "categoryId": <int|null>, "updatedAt": "YYYY-MM-DD HH:MM:SS" }
	/// categoryId < 0 表示不过滤；否则连子分类一起算（选中父分类也能看到其下文章）
	static JsonArray loadTitles(sqlite3_int64 categoryId = -1);
	/// 写入文章测试数据（仅当文章表为空时）；按分类名字关联，库里没有的分类直接跳过
	static void seed();
};
