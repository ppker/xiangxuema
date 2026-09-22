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
	/// 删除分类，但只删"空分类"：下面还挂着子分类、或挂文章的，一律不删，
	/// 并通过 reason 带一句给人看的原因（由 UI 弹出来），空串表示没挡住。
	/// 两种挡法各有各的讲究：
	///   - 有子分类：删一个会带走整棵子树，让用户自己先把子树拆干净；
	///   - 子树下挂着文章：删完它们会散成未分类，等于悄悄打散了用户已有的归档，先让他自己挪走。
	/// 确认是空的之后只删它自己一行（子分类既已确认没有，ON DELETE CASCADE 也就没有活干）。
	/// 成功（且确实删到了行）返回 true；id 不存在时返回 false 并给出原因
	static bool remove(sqlite3_int64 id, std::wstring& reason);
	/// 写入分类测试数据（仅当分类表为空时）
	static void seed();
};
