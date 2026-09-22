#include "Category.h"

namespace
{
    /// 跑一条带一个 id 参数的 COUNT(*) 语句：查出来是计数，查不出来（prepare/step 失败）返回 -1。
    /// 不把失败当成 0：0 会让调用方把"没查清"当成"没有"，从而放行一次不可撤销的删除
    int countById(sqlite3* conn, const char* sql, sqlite3_int64 id)
    {
        sqlite3_stmt* stmt = nullptr;
        if (sqlite3_prepare_v2(conn, sql, -1, &stmt, nullptr) != SQLITE_OK) return -1;
        sqlite3_bind_int64(stmt, 1, id);
        int count = -1;
        if (sqlite3_step(stmt) == SQLITE_ROW) count = sqlite3_column_int(stmt, 0);
        sqlite3_finalize(stmt);
        return count;
    }
}

JsonArray Category::load()
{
    JsonArray arr;
    sqlite3* conn = Db::get();
    if (!conn) return arr;

    const char* sql =
        "SELECT id, name, parent_id FROM category "
        "ORDER BY COALESCE(parent_id, id), sort_order, id;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(conn, sql, -1, &stmt, nullptr) != SQLITE_OK)
        return arr;

    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        JsonObject node;
        node.SetNamedValue(L"id", JsonValue::CreateNumberValue(static_cast<double>(sqlite3_column_int64(stmt, 0))));
        // sqlite3_column_text16 以 UTF-16 返回，可直接构造成 wstring，避免手工转码
        node.SetNamedValue(L"name", JsonValue::CreateStringValue(
            std::wstring(static_cast<const wchar_t*>(sqlite3_column_text16(stmt, 1)))));

        if (sqlite3_column_type(stmt, 2) == SQLITE_NULL)
            node.SetNamedValue(L"parentId", JsonValue::CreateNullValue());
        else
            node.SetNamedValue(L"parentId", JsonValue::CreateNumberValue(static_cast<double>(sqlite3_column_int64(stmt, 2))));

        // 显式转成 IJsonValue 后再追加，避免 JsonObject→IJsonValue 隐式转换
        // 在 Append 模板体内触发的 C3779（返回 auto 的函数须先定义）
        arr.Append(static_cast<winrt::Windows::Data::Json::IJsonValue>(node));
    }
    sqlite3_finalize(stmt);
    return arr;
}

sqlite3_int64 Category::add(const std::wstring& name, sqlite3_int64 parentId)
{
    sqlite3* conn = Db::get();
    if (!conn || name.empty()) return -1;

    // sort_order 取同组最大值 +1，新分类排在这一组末尾；
    // parent_id 用 IS 而不是 = 比较，parentId 传 NULL 时才能正确匹配顶层那一组
    static const char* sql =
        "INSERT INTO category (name, parent_id, sort_order)"
        " VALUES (?1, ?2,"
        "         COALESCE((SELECT MAX(sort_order) + 1 FROM category WHERE parent_id IS ?2), 0));";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(conn, sql, -1, &stmt, nullptr) != SQLITE_OK) return -1;
    sqlite3_bind_text16(stmt, 1, name.c_str(), -1, SQLITE_TRANSIENT);
    if (parentId < 0)
        sqlite3_bind_null(stmt, 2);
    else
        sqlite3_bind_int64(stmt, 2, parentId);
    bool ok = (sqlite3_step(stmt) == SQLITE_DONE);
    sqlite3_finalize(stmt);
    return ok ? sqlite3_last_insert_rowid(conn) : -1;
}

bool Category::rename(sqlite3_int64 id, const std::wstring& name)
{
    sqlite3* conn = Db::get();
    if (!conn || id < 0 || name.empty()) return false;

    static const char* sql = "UPDATE category SET name = ?2 WHERE id = ?1;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(conn, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;
    sqlite3_bind_int64(stmt, 1, id);
    sqlite3_bind_text16(stmt, 2, name.c_str(), -1, SQLITE_TRANSIENT);
    // sqlite3_changes 用来区分"改到了"和"id 不存在"
    bool ok = (sqlite3_step(stmt) == SQLITE_DONE) && (sqlite3_changes(conn) > 0);
    sqlite3_finalize(stmt);
    return ok;
}

bool Category::remove(sqlite3_int64 id, std::wstring& reason)
{
    sqlite3* conn = Db::get();
    if (!conn || id < 0) return false;

    // 只删"空分类"：下面还挂着子分类或文章的，一律挡回来，原因写进 reason 由 UI 弹给用户。
    // 宁可多挡一道——删分类不可撤销，而"文章散成未分类"这种后果是用户看不见的

    // 1. 有子分类：删它会把整棵子树一起带走，让用户自己先把子树拆干净
    static const char* childSql = "SELECT COUNT(*) FROM category WHERE parent_id = ?1;";
    int children = countById(conn, childSql, id);
    if (children != 0) // >0 真有子分类；<0 没能查清，也按"不肯删"处理
    {
        reason = children > 0 ? std::wstring{ L"该分类下还有子分类，先删掉子分类再来" }
            : std::wstring{ L"没能确认这个分类下的子分类，先不删" };
        return false;
    }

    // 2. 整棵子树（含自己）下挂着文章：删完它们会变成未分类，等于悄悄打散了已有的归档。
    //    照"整棵子树"写而不是只查自己：哪天放开"带（空）子分类的树可以删"，这条检查不用改
    static const char* articleSql =
        "SELECT COUNT(*) FROM article WHERE category_id IN ("
        "  WITH RECURSIVE sub(id) AS (SELECT id FROM category WHERE id = ?1"
        "    UNION ALL SELECT c.id FROM category c JOIN sub s ON c.parent_id = s.id)"
        "  SELECT id FROM sub);";
    int articles = countById(conn, articleSql, id);
    if (articles != 0)
    {
        reason = articles > 0
            ? std::wstring{ L"该分类下还有 " } + std::to_wstring(articles) + L" 篇文章，先移走再删"
            : std::wstring{ L"没能确认这个分类下的文章，先不删" };
        return false;
    }

    // 走到这里：既没有子分类也没有文章，删它自己一行就够了
    static const char* delSql = "DELETE FROM category WHERE id = ?1;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(conn, delSql, -1, &stmt, nullptr) != SQLITE_OK) return false;
    sqlite3_bind_int64(stmt, 1, id);
    // sqlite3_changes 用来区分"删到了"和"id 根本不存在"（与 rename 同一套写法）
    bool ok = (sqlite3_step(stmt) == SQLITE_DONE) && (sqlite3_changes(conn) > 0);
    sqlite3_finalize(stmt);
    if (!ok && reason.empty()) reason = L"这个分类已经不存在了";
    return ok;
}

void Category::seed()
{
    sqlite3* conn = Db::get();
    if (!conn) return;

    // 仅在分类表为空时写入初始分类，避免每次启动都重插一遍
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(conn, "SELECT COUNT(*) FROM category;", -1, &stmt, nullptr) != SQLITE_OK)
        return;
    sqlite3_step(stmt);
    bool empty = (sqlite3_column_int(stmt, 0) == 0);
    sqlite3_finalize(stmt);
    if (!empty) return;

    auto insertOne = [&](const std::wstring& name, sqlite3_int64 parentId, int order) -> sqlite3_int64
    {
        static const char* insertSql =
            "INSERT INTO category (name, parent_id, sort_order) VALUES (?1, ?2, ?3);";
        sqlite3_stmt* ins = nullptr;
        if (sqlite3_prepare_v2(conn, insertSql, -1, &ins, nullptr) != SQLITE_OK) return -1;
        sqlite3_bind_text16(ins, 1, name.c_str(), -1, SQLITE_TRANSIENT);
        if (parentId < 0)
            sqlite3_bind_null(ins, 2);
        else
            sqlite3_bind_int64(ins, 2, parentId);
        sqlite3_bind_int(ins, 3, order);
        sqlite3_step(ins);
        sqlite3_finalize(ins);
        return sqlite3_last_insert_rowid(conn);
    };

    // 顶层两个技术类目，「开发」下再挂两个子节点：既够选，也保住一层层级供界面展开/收起验证
    insertOne(L"架构", -1, 0);
    sqlite3_int64 dev = insertOne(L"开发", -1, 1);
    insertOne(L"C++", dev, 0);
    insertOne(L"框架", dev, 1);
}
