#include "Site.h"

JsonObject Site::load(const std::wstring& name)
{
    JsonObject obj;
    sqlite3* conn = Db::get();
    if (!conn || name.empty()) return obj;

    static const char* sql = "SELECT param_key, param_val FROM site WHERE name = ?1;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(conn, sql, -1, &stmt, nullptr) != SQLITE_OK) return obj;
    sqlite3_bind_text16(stmt, 1, name.c_str(), -1, SQLITE_TRANSIENT);

    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        // 键为 NULL（建表时 NOT NULL，理论上不该出现）或空串的行跳过，不进 JSON
        if (sqlite3_column_type(stmt, 0) == SQLITE_NULL) continue;
        std::wstring key = static_cast<const wchar_t*>(sqlite3_column_text16(stmt, 0));
        if (key.empty()) continue;

        if (sqlite3_column_type(stmt, 1) == SQLITE_NULL)
            obj.SetNamedValue(key, JsonValue::CreateNullValue());
        else
            obj.SetNamedValue(key, JsonValue::CreateStringValue(
                std::wstring(static_cast<const wchar_t*>(sqlite3_column_text16(stmt, 1)))));
    }
    sqlite3_finalize(stmt);
    return obj;
}

bool Site::set(const std::wstring& name, const std::wstring& key, const std::wstring& value)
{
    sqlite3* conn = Db::get();
    if (!conn || name.empty() || key.empty()) return false;

    // 同一个站点的同一个参数只留一条：冲突时直接把旧值改成新值（token 之类会反复刷新）
    static const char* sql = "INSERT INTO site (name, param_key, param_val) VALUES (?1, ?2, ?3) ON CONFLICT (name, param_key) DO UPDATE SET param_val = excluded.param_val;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(conn, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;
    sqlite3_bind_text16(stmt, 1, name.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text16(stmt, 2, key.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text16(stmt, 3, value.c_str(), -1, SQLITE_TRANSIENT);
    bool ok = (sqlite3_step(stmt) == SQLITE_DONE);
    sqlite3_finalize(stmt);
    return ok;
}

