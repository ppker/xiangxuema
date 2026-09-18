#pragma once
#include "Db.h"
#include <string>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h> // 提供 IVector::Append 的定义，避免 C3779

using namespace winrt::Windows::Data::Json;

/**
 * 文章分类的数据访问：树形分类的读 / 增 / 改名 / 删（连子树一起删），外加测试数据写入。
 * 与 Article 平级，直接对外提供服务（Page 的 IPC 就调这里的静态方法）；
 * 数据库连接统一从 Db::get() 取，本类不持有连接。
 */
class Category
{
public:
	/// 读取全部分类，按 parent_id / sort_order / id 返回扁平数组
	/// 每项：{ "id": <int>, "parentId": <int|null>, "name": <string> }
	/// 顶层分类的 parentId 为 null。
	static JsonArray load();
	/// 新增分类：parentId < 0 表示顶层；sort_order 取同组最大值 +1，排在末尾
	/// 返回新分类的 id，失败返回 -1
	static sqlite3_int64 add(const std::wstring& name, sqlite3_int64 parentId);
	/// 改名；成功返回 true（id 不存在或名字为空返回 false）
	static bool rename(sqlite3_int64 id, const std::wstring& name);
	/// 删除分类，连同其全部子分类。
	/// 注意：连接上没开 PRAGMA foreign_keys，建表时写的 ON DELETE CASCADE 不会触发，
	/// 所以子树是在 SQL 里用递归 CTE 显式删的；分类下的文章不删，只把 category_id 置空。
	/// 成功（且确实删到了行）返回 true
	static bool remove(sqlite3_int64 id);
	/// 写入分类测试数据（仅当分类表为空时）
	static void seed();
};
