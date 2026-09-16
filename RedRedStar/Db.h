#pragma once
#include "SQLite/sqlite3.h"
#include <filesystem>
#include <memory>
#include <string>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h> // 提供 IVector::Append 的定义，避免 C3779

using namespace winrt::Windows::Data::Json;

/**
 * 应用数据库单例：持有到 db.db 的持久连接，负责启动时建库建表。
 * 建表使用 IF NOT EXISTS，因此重复启动安全（不重复建）。
 * 另提供分类的测试数据写入与查询。
 */
class Db
{
public:
	/// 打开数据目录下的 db.db；文件不存在则创建，并执行建表 SQL
	static bool init();
	/// 取数据库连接
	static sqlite3* get();
	/// 写入文章分类测试数据（仅当分类表为空时）
	static void seedCategories();
	/// 写入文章测试数据（仅当文章表为空时）；按分类名字关联，库里没有的分类直接跳过
	static void seedArticles();
	/// 读取全部分类，按 parent_id / sort_order / id 返回扁平数组
	/// 每项：{ "id": <int>, "parentId": <int|null>, "name": <string> }
	/// 顶层分类的 parentId 为 null。
	static JsonArray loadCategories();
	/// 读取文章标题（不查正文），按 id 升序
	/// 每项：{ "id": <int>, "title": <string>, "categoryId": <int|null>, "updatedAt": "YYYY-MM-DD HH:MM:SS" }
	/// categoryId < 0 表示不过滤；否则连子分类一起算（选中父分类也能看到其下文章）
	static JsonArray loadArticleTitles(sqlite3_int64 categoryId = -1);
	/// 最近一次失败的原因（sqlite 原文），供启动期提示使用；成功时为空
	static const std::wstring& lastError();
private:
	Db() = default;
	bool open();
	bool createSchema();
	static Db& getInstance();
private:
	sqlite3* conn = nullptr;
	bool ready = false;
	std::wstring lastErrorText;
};