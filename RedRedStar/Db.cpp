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
    return getInstance().open();
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