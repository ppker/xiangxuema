#include "Db.h"
#include "Env.h"

#include <cstring>

namespace
{
    /// sqlite3 的文本错误信息是 UTF-8，转成宽字符便于直接塞进 MessageBox
    std::wstring utf8ToWide(const char* text)
    {
        if (!text || !*text) return {};
        int len = MultiByteToWideChar(CP_UTF8, 0, text, -1, nullptr, 0);
        if (len <= 0) return {};
        std::wstring wide(static_cast<size_t>(len), L'\0');
        MultiByteToWideChar(CP_UTF8, 0, text, -1, wide.data(), len);
        wide.resize(static_cast<size_t>(len - 1)); // 去掉终止符
        return wide;
    }
}

Db& Db::getInstance()
{
    static Db instance;
    return instance;
}

bool Db::init()
{
    if (!getInstance().open()) return false;
    Db::seedCategories();
    Db::seedArticles();
    return true;
}

sqlite3* Db::get()
{
    return getInstance().conn;
}

const std::wstring& Db::lastError()
{
    return getInstance().lastErrorText;
}

bool Db::open()
{
    if (ready) return true;

    // 数据目录由 Env::initDataPath 负责创建；db.db 不存在时 sqlite3 会自动创建文件
    auto dbPath = Env::getDataPath() / L"db.db";
    // sqlite3 按 UTF-8 解析路径，这里显式转 UTF-8：既避免 path::string() 的 ANSI 转换
    // 在中文用户名下打不开库，也不用 sqlite3_open16 —— 后者会顺手执行
    // PRAGMA encoding='UTF-16'，把新库的默认编码从 UTF-8 改成 UTF-16le
    auto u8Path = dbPath.u8string();
    auto rc = sqlite3_open(reinterpret_cast<const char*>(u8Path.c_str()), &conn);
    if (rc != SQLITE_OK)
    {
        lastErrorText = conn ? static_cast<const wchar_t*>(sqlite3_errmsg16(conn))
                             : L"无法打开数据库文件";
        if (conn) sqlite3_close(conn);
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
            lastErrorText = utf8ToWide(errMsg);
            if (lastErrorText.empty()) lastErrorText = L"建表失败";
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

void Db::seedArticles()
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

JsonArray Db::loadArticleTitles(sqlite3_int64 categoryId)
{
    JsonArray arr;
    sqlite3* conn = Db::get();
    if (!conn) return arr;

    // 只取标题（外加 id、分类 id 和更新时间），不查 content
    static const char* sqlAll =
        "SELECT id, title, category_id, updated_at FROM article ORDER BY id;";
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
        " ORDER BY id;";

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

sqlite3_int64 Db::addCategory(const std::wstring& name, sqlite3_int64 parentId)
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

bool Db::renameCategory(sqlite3_int64 id, const std::wstring& name)
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

bool Db::removeCategory(sqlite3_int64 id)
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