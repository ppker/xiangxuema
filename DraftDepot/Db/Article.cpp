#include "Article.h"

JsonArray Article::loadTitles(sqlite3_int64 categoryId)
{
    JsonArray arr;
    sqlite3* conn = Db::get();
    if (!conn) return arr;

    // 只取标题（外加 id、分类 id 和更新时间），不查 content
    // 按修改时间倒序：刚更新的排在列表最上面。同一秒里写过的多篇（updated_at 只到秒）
    // 用 id 倒序兜住，保证后来的一定更靠前
    static const char* sqlAll =
        "SELECT id, title, category_id, updated_at FROM article ORDER BY updated_at DESC, id DESC;";
    // 按分类过滤时连子分类一起算：递归取出该分类及其所有后代，
    // 这样选中父分类（如“工作”）也能看到“项目文档”下的文章
    static const char* sqlByCategory =
        "WITH RECURSIVE sub(id) AS ("
        "  SELECT id FROM category WHERE id = ?1"
        "  UNION ALL"
        "  SELECT c.id FROM category c JOIN sub s ON c.parent_id = s.id"
        ")"
        "SELECT id, title, category_id, updated_at FROM article"
        " WHERE category_id IN (SELECT id FROM sub)"
        " ORDER BY updated_at DESC, id DESC;";

    sqlite3_stmt* stmt = nullptr;
    if (categoryId < 0)
    {
        if (sqlite3_prepare_v2(conn, sqlAll, -1, &stmt, nullptr) != SQLITE_OK)
            return arr;
    }
    else
    {
        if (sqlite3_prepare_v2(conn, sqlByCategory, -1, &stmt, nullptr) != SQLITE_OK)
            return arr;
        sqlite3_bind_int64(stmt, 1, categoryId);
    }

    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        JsonObject node;
        node.SetNamedValue(L"id", JsonValue::CreateNumberValue(static_cast<double>(sqlite3_column_int64(stmt, 0))));
        node.SetNamedValue(L"title", JsonValue::CreateStringValue(
            std::wstring(static_cast<const wchar_t*>(sqlite3_column_text16(stmt, 1)))));

        if (sqlite3_column_type(stmt, 2) == SQLITE_NULL)
            node.SetNamedValue(L"categoryId", JsonValue::CreateNullValue());
        else
            node.SetNamedValue(L"categoryId", JsonValue::CreateNumberValue(static_cast<double>(sqlite3_column_int64(stmt, 2))));

        // updated_at 是 datetime('now','localtime') 写下的 "YYYY-MM-DD HH:MM:SS"
        node.SetNamedValue(L"updatedAt", JsonValue::CreateStringValue(
            std::wstring(static_cast<const wchar_t*>(sqlite3_column_text16(stmt, 3)))));

        arr.Append(static_cast<winrt::Windows::Data::Json::IJsonValue>(node));
    }
    sqlite3_finalize(stmt);
    return arr;
}

JsonObject Article::loadArticle(sqlite3_int64 id)
{
    JsonObject obj;
    sqlite3* conn = Db::get();
    if (!conn) return obj;

    static const char* sql =
        "SELECT title, content, category_id, updated_at FROM article WHERE id = ?1;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(conn, sql, -1, &stmt, nullptr) != SQLITE_OK) return obj;
    sqlite3_bind_int64(stmt, 1, id);

    if (sqlite3_step(stmt) == SQLITE_ROW)
    {
        obj.SetNamedValue(L"id", JsonValue::CreateNumberValue(static_cast<double>(id)));
        obj.SetNamedValue(L"title", JsonValue::CreateStringValue(
            std::wstring(static_cast<const wchar_t*>(sqlite3_column_text16(stmt, 0)))));
        obj.SetNamedValue(L"content", JsonValue::CreateStringValue(
            std::wstring(static_cast<const wchar_t*>(sqlite3_column_text16(stmt, 1)))));

        if (sqlite3_column_type(stmt, 2) == SQLITE_NULL)
            obj.SetNamedValue(L"categoryId", JsonValue::CreateNullValue());
        else
            obj.SetNamedValue(L"categoryId", JsonValue::CreateNumberValue(static_cast<double>(sqlite3_column_int64(stmt, 2))));

        obj.SetNamedValue(L"updatedAt", JsonValue::CreateStringValue(
            std::wstring(static_cast<const wchar_t*>(sqlite3_column_text16(stmt, 3)))));
    }
    sqlite3_finalize(stmt);
    return obj;
}

sqlite3_int64 Article::addArticle(const std::wstring& title, const std::wstring& content, sqlite3_int64 categoryId)
{
    sqlite3* conn = Db::get();
    if (!conn) return -1;

    static const char* sql =
        "INSERT INTO article (title, content, category_id, updated_at)"
        " VALUES (?1, ?2, ?3, datetime('now', 'localtime'));";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(conn, sql, -1, &stmt, nullptr) != SQLITE_OK) return -1;

    sqlite3_bind_text16(stmt, 1, title.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text16(stmt, 2, content.c_str(), -1, SQLITE_TRANSIENT);
    // 未分类（categoryId < 0）写 NULL：article.category_id 允许为空，列表读到的是 null 而不是 0
    if (categoryId < 0) sqlite3_bind_null(stmt, 3);
    else sqlite3_bind_int64(stmt, 3, categoryId);

    sqlite3_int64 id = -1;
    if (sqlite3_step(stmt) == SQLITE_DONE) id = sqlite3_last_insert_rowid(conn);
    sqlite3_finalize(stmt);
    return id;
}

bool Article::updateArticle(sqlite3_int64 id, const std::wstring& title, const std::wstring& content)
{
    sqlite3* conn = Db::get();
    if (!conn) return false;

    static const char* sql =
        "UPDATE article SET title = ?2, content = ?3,"
        " updated_at = datetime('now', 'localtime') WHERE id = ?1;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(conn, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

    sqlite3_bind_int64(stmt, 1, id);
    sqlite3_bind_text16(stmt, 2, title.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text16(stmt, 3, content.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return sqlite3_changes(conn) > 0;
}

void Article::seed()
{
    sqlite3* conn = Db::get();
    if (!conn) return;

    // 与分类种子各自独立判断：分类可能早就在库里了，这里照样能把文章补上
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(conn, "SELECT COUNT(*) FROM article;", -1, &stmt, nullptr) != SQLITE_OK)
        return;
    sqlite3_step(stmt);
    bool empty = (sqlite3_column_int(stmt, 0) == 0);
    sqlite3_finalize(stmt);
    if (!empty) return;

    // 按名字找分类 id：分类的自增值取决于建库顺序，写死 id 在已有库上会错位；
    // 找不到就返回 -1，这条文章跳过（例如库里只有旧分类数据时，"周报" 就不存在）
    auto findCategory = [&](const std::wstring& name) -> sqlite3_int64
    {
        sqlite3_stmt* sel = nullptr;
        if (sqlite3_prepare_v2(conn, "SELECT id FROM category WHERE name = ?1 LIMIT 1;", -1, &sel, nullptr) != SQLITE_OK)
            return -1;
        sqlite3_bind_text16(sel, 1, name.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_int64 id = (sqlite3_step(sel) == SQLITE_ROW) ? sqlite3_column_int64(sel, 0) : -1;
        sqlite3_finalize(sel);
        return id;
    };

    // 正文先留空：这一版只加载标题，不读正文。
    // updated_at 用 age（相对当前的 SQLite 时间修饰符）生成，
    // 好让列表里"今 / 昨 / 月-日 / 年-月-日"四种显示都有样本
    auto insertOne = [&](const std::wstring& title, const std::wstring& categoryName, const std::wstring& age)
    {
        sqlite3_int64 categoryId = findCategory(categoryName);
        if (categoryId < 0) return;
        static const char* insertSql =
            "INSERT INTO article (title, content, category_id, updated_at)"
            " VALUES (?1, '', ?2, datetime('now', 'localtime', ?3));";
        sqlite3_stmt* ins = nullptr;
        if (sqlite3_prepare_v2(conn, insertSql, -1, &ins, nullptr) != SQLITE_OK) return;
        sqlite3_bind_text16(ins, 1, title.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int64(ins, 2, categoryId);
        sqlite3_bind_text16(ins, 3, age.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(ins);
        sqlite3_finalize(ins);
    };

    // 按分类铺一批标题，覆盖多个层级（顶层分类下也直接挂几篇）
    insertOne(L"DraftDepot 项目说明", L"项目文档", L"0 minutes");     // 今
    insertOne(L"WebView2 与原生通信踩坑", L"项目文档", L"-2 hours");  // 今
    insertOne(L"2026-09 第 2 周例会", L"会议纪要", L"-1 day");        // 昨
    insertOne(L"本周进展与下周计划", L"周报", L"-1 day");              // 昨
    insertOne(L"SQLite 在 Windows 上的编码问题", L"编程", L"-3 days"); // 月-日
    insertOne(L"进程间通信方案对比", L"编程", L"-11 days");            // 月-日
    insertOne(L"词根记忆法笔记", L"词汇", L"-40 days");                // 月-日
    insertOne(L"精听训练计划", L"听力", L"-70 days");                  // 月-日
    insertOne(L"川西环线行程", L"旅行", L"-1 year");                   // 年-月-日
    insertOne(L"冰岛自驾路线", L"国外", L"-1 year");                   // 年-月-日
    insertOne(L"轻食备餐清单", L"饮食", L"-2 years");                  // 年-月-日
    insertOne(L"作息调整记录", L"作息", L"-3 years");                  // 年-月-日
}
