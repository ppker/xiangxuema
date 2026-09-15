#pragma once
#include "SQLite/sqlite3.h"
#include <filesystem>
#include <memory>

/**
 * 应用数据库单例：持有到 db.db 的持久连接，负责启动时建库建表。
 * 建表使用 IF NOT EXISTS，因此重复启动安全（不重复建）。
 */
class Db
{
public:
	/// 打开数据目录下的 db.db；文件不存在则创建，并执行建表 SQL
	static bool init();
	/// 取数据库连接
	static sqlite3* get();
private:
	Db() = default;
	bool open();
	bool createSchema();
	static Db& getInstance();
private:
	sqlite3* conn = nullptr;
	bool ready = false;
};