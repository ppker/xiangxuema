#include "ImageSite.h"

std::wstring ImageSite::urlOf(const std::wstring& imageName, const std::wstring& siteName)
{
	sqlite3* conn = Db::get();
	if (!conn || imageName.empty() || siteName.empty()) return {};

	static const char* sql = "SELECT url FROM image_site WHERE image_name = ?1 AND site_name = ?2;";
	sqlite3_stmt* stmt = nullptr;
	if (sqlite3_prepare_v2(conn, sql, -1, &stmt, nullptr) != SQLITE_OK) return {};
	sqlite3_bind_text16(stmt, 1, imageName.c_str(), -1, SQLITE_TRANSIENT);
	sqlite3_bind_text16(stmt, 2, siteName.c_str(), -1, SQLITE_TRANSIENT);

	// (image_name, site_name) 唯一，最多命中一行：取到第一行就够
	std::wstring url;
	if (sqlite3_step(stmt) == SQLITE_ROW && sqlite3_column_type(stmt, 0) != SQLITE_NULL)
	{
		url = static_cast<const wchar_t*>(sqlite3_column_text16(stmt, 0));
	}
	sqlite3_finalize(stmt);
	return url;
}

void ImageSite::save(const std::wstring& imageName, const std::wstring& siteName, const std::wstring& url)
{
	sqlite3* conn = Db::get();
	if (!conn || imageName.empty() || siteName.empty() || url.empty()) return;

	// 一张图在一个站点只留一条：重发时可能又传了一次（比如站点那边把旧地址清了），地址以新的为准，
	// 连 created_at 一起刷新——这张表现在是"最后一次成功上传"，将来要按时间清理也用得上
	static const char* sql =
		"INSERT INTO image_site (image_name, site_name, url) VALUES (?1, ?2, ?3)"
		" ON CONFLICT (image_name, site_name) DO UPDATE SET url = excluded.url,"
		" created_at = datetime('now', 'localtime');";
	sqlite3_stmt* stmt = nullptr;
	if (sqlite3_prepare_v2(conn, sql, -1, &stmt, nullptr) != SQLITE_OK) return;
	sqlite3_bind_text16(stmt, 1, imageName.c_str(), -1, SQLITE_TRANSIENT);
	sqlite3_bind_text16(stmt, 2, siteName.c_str(), -1, SQLITE_TRANSIENT);
	sqlite3_bind_text16(stmt, 3, url.c_str(), -1, SQLITE_TRANSIENT);
	sqlite3_step(stmt);
	sqlite3_finalize(stmt);
}
