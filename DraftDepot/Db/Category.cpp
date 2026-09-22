#include "Category.h"

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

bool Category::remove(sqlite3_int64 id)
{
    sqlite3* conn = Db::get();
    if (!conn || id < 0) return false;

    // 要删的是整棵子树。子孙本来可以靠 parent_id 上的 ON DELETE CASCADE 顺着删掉
    // （连接在 Db::open 里开了外键），这里仍显式用递归 CTE 取出来：
    // 一是删完后能用 sqlite3_changes 判断这个 id 到底存不存在，
    // 二是"先解绑文章、再删树"这两步的顺序写死在同一个事务里，不去依赖级联的执行时机
    const std::string subtree =
        "(WITH RECURSIVE sub(id) AS ("
        "  SELECT id FROM category WHERE id = " + std::to_string(id) +
        "  UNION ALL"
        "  SELECT c.id FROM category c JOIN sub s ON c.parent_id = s.id"
        ") SELECT id FROM sub)";

    // 文章不跟着删：按 schema 里 ON DELETE SET NULL 的意图，只解除关联。
    // 两条语句包在一个事务里，避免"文章解绑了但分类没删掉"这种半截状态。
    // id 是本地整数，拼进 SQL 没有注入问题，这样能一次 sqlite3_exec 跑完。
    const std::string sql =
        "BEGIN;"
        "UPDATE article SET category_id = NULL WHERE category_id IN " + subtree + ";"
        "DELETE FROM category WHERE id IN " + subtree + ";"
        "COMMIT;";

    if (sqlite3_exec(conn, sql.c_str(), nullptr, nullptr, nullptr) != SQLITE_OK)
    {
        sqlite3_exec(conn, "ROLLBACK;", nullptr, nullptr, nullptr); // 别留着半截事务
        return false;
    }
    // 最后一条语句是 DELETE：影响 0 行说明这个 id 根本不存在
    return sqlite3_changes(conn) > 0;
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
