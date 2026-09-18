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

    // 要删的是整棵子树。连接上没开 PRAGMA foreign_keys，
    // 建表时写的 ON DELETE CASCADE 不会生效，所以子孙得自己用递归 CTE 取出来
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

    // 仅在分类表为空时写入测试数据，避免重复启动重复种子
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

    // 顶层
    sqlite3_int64 work = insertOne(L"工作", -1, 0);
    sqlite3_int64 study = insertOne(L"学习", -1, 1);
    sqlite3_int64 life = insertOne(L"生活", -1, 2);

    // 工作：一个分支 + 两个叶节点，用来看“一组兄弟的竖线只拉在首尾两条横线之间”
    sqlite3_int64 workDoc = insertOne(L"项目文档", work, 0);
    insertOne(L"需求说明", workDoc, 0);
    insertOne(L"设计稿", workDoc, 1);
    insertOne(L"会议纪要", work, 1);
    insertOne(L"周报", work, 2);

    // 学习：五层深的直链（编程→语言→Rust→所有权/生命周期），外加分支和叶节点
    sqlite3_int64 coding = insertOne(L"编程", study, 0);
    sqlite3_int64 lang = insertOne(L"语言", coding, 0);
    sqlite3_int64 rust = insertOne(L"Rust", lang, 0);
    insertOne(L"所有权", rust, 0);
    insertOne(L"生命周期", rust, 1);
    insertOne(L"TypeScript", lang, 1);
    insertOne(L"工具链", coding, 1);
    sqlite3_int64 english = insertOne(L"英语", study, 1);
    insertOne(L"词汇", english, 0);
    insertOne(L"听力", english, 1);
    insertOne(L"数学", study, 2);

    // 生活：含一个“独苗”分支（只有一个子节点，竖线长度为零，不应该画出来）
    insertOne(L"饮食", life, 0);
    sqlite3_int64 travel = insertOne(L"旅行", life, 1);
    insertOne(L"国内", travel, 0);
    sqlite3_int64 abroad = insertOne(L"国外", travel, 1);
    insertOne(L"日本", abroad, 0);
    insertOne(L"冰岛", abroad, 1);
    sqlite3_int64 health = insertOne(L"健康", life, 2);
    insertOne(L"作息", health, 0);
}
