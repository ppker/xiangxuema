#pragma once
#include "Db.h"
#include <string>

/**
 * 文章引用的图片：article 一对多的“多”端，一篇正文里用到几个图片文件就有几条记录。
 *
 * 记录的维护不靠前端上报，而由 Article 每次入库时按正文里实际出现的图片同步一次：
 * 正文里删掉图片，只是这条记录标成 is_delete = 1，磁盘上的文件一律不动
 * ——将来要清理磁盘，照这张表来就行（不再被引用的文件才轮得到删）。
 */
class Image
{
public:
	/// 按正文同步某篇文章的图片记录：
	///   正文里出现的路径 → 库里没有就插入（is_delete = 0），已有则把 is_delete 复位成 0
	///     （撤回来、或删了又粘回来的图靠这一步复原）；
	///   库里有、正文里没有的 → is_delete 置 1。
	/// 整个同步在一个事务里，中途出错不会把记录标得半对半错。
	static void syncFromContent(sqlite3_int64 articleId, const std::wstring& contentHtml);
	/// 把指向 from 的记录一律改成指向 to：图片被拖成新尺寸后，正文里引用的是新生成的那一份
	/// （img_x.png → img_x@600x400.png），而入库要等之后那一次保存，库里那行还写着旧的。
	/// 调用方（Page::handleResizeImage）靠这一步把记录拨到新文件上，才好判断旧文件还有没有人用。
	/// 别的文章里若也引用了 from，会被一并改过去——那只是记录层面，它们下次入库时按正文自愈
	static void renameReferences(const std::wstring& from, const std::wstring& to);
};
