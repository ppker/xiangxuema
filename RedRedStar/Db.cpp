#include "Db.h"
#include "Env.h"

#include <cstring>

Db& Db::getInstance()
{
    static Db instance;
    return instance;
}

bool Db::init()
{
    if (!getInstance().open()) return false;
    Db::seedCategories();
    return true;
}

sqlite3* Db::get()
{
    return getInstance().conn;
}

bool Db::open()
{
    if (ready) return true;

    // 数据目录由 Env 已保证存在；db.db 不存在时 sqlite3_open 会自动创建
    auto dbPath = Env::getDataPath() / L"db.db";
    if (sqlite3_open(dbPath.string().c_str(), &conn) != SQLITE_OK)
    {
        sqlite3_close(conn);
        conn = nullptr;
        return false;
    }

    if (!createSchema())
    {
        sqlite3_close(conn);
        conn = nullptr;
        return false;
    }

    ready = true;
    return true;
}

bool Db::createSchema()
{
    static const char* schemaSql[] = {
        // ========== 文章分类（一对多的“一”端，支持多级树形） ==========
        // parent_id 为 NULL 表示顶层分类；同层用 sort_order 排序；ANCESTORS 便于物化路径查询
        "CREATE TABLE IF NOT EXISTS category ("
        "  id          INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  name        TEXT    NOT NULL,"
        "  parent_id   INTEGER,"
        "  sort_order  INTEGER NOT NULL DEFAULT 0,"
        "  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),"
        "  FOREIGN KEY (parent_id) REFERENCES category(id) ON DELETE CASCADE"
        ");",

        // ========== 文章内容（一对多的“多”端） ==========
        "CREATE TABLE IF NOT EXISTS article ("
        "  id          INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  title       TEXT    NOT NULL,"
        "  content     TEXT    NOT NULL DEFAULT '',"
        "  category_id INTEGER,"
        "  status      INTEGER NOT NULL DEFAULT 0,"
        "  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),"
        "  updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),"
        "  FOREIGN KEY (category_id) REFERENCES category(id) ON DELETE SET NULL"
        ");",

        // ========== 文章标签（多对多的一端） ==========
        // name 唯一，避免重复标签
        "CREATE TABLE IF NOT EXISTS tag ("
        "  id   INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  name TEXT NOT NULL UNIQUE,"
        "  color TEXT"
        ");",

        // ========== 标签↔文章 多对多关联表 ==========
        "CREATE TABLE IF NOT EXISTS article_tag ("
        "  article_id INTEGER NOT NULL,"
        "  tag_id     INTEGER NOT NULL,"
        "  PRIMARY KEY (article_id, tag_id),"
        "  FOREIGN KEY (article_id) REFERENCES article(id) ON DELETE CASCADE,"
        "  FOREIGN KEY (tag_id)     REFERENCES tag(id) ON DELETE CASCADE"
        ");",

        // ========== 系统设置（键值对） ==========
        "CREATE TABLE IF NOT EXISTS setting ("
        "  key        TEXT PRIMARY KEY,"
        "  value      TEXT,"
        "  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))"
        ");",

        // ========== 索引 ==========
        "CREATE INDEX IF NOT EXISTS idx_category_parent ON category(parent_id);",
        "CREATE INDEX IF NOT EXISTS idx_article_category ON article(category_id);",
        "CREATE INDEX IF NOT EXISTS idx_article_created ON article(created_at);",
        "CREATE INDEX IF NOT EXISTS idx_article_tag_tag ON article_tag(tag_id);",
    };

    for (const char* sql : schemaSql)
    {
        char* errMsg = nullptr;
        if (sqlite3_exec(conn, sql, nullptr, nullptr, &errMsg) != SQLITE_OK)
        {
            sqlite3_free(errMsg);
            return false;
        }
    }
    return true;
}

void Db::seedCategories()
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
    // 工作 的子项
    insertOne(L"项目文档", work, 0);
    insertOne(L"会议纪要", work, 1);
    // 学习 的子项：编程是叶子；英语有子项
    insertOne(L"编程", study, 0);
    sqlite3_int64 english = insertOne(L"英语", study, 1);
    // 英语的子项
    insertOne(L"词汇", english, 0);
    insertOne(L"听力", english, 1);
    // 生活 的子项
    insertOne(L"饮食", life, 0);
    insertOne(L"旅行", life, 1);
}

JsonArray Db::loadCategories()
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