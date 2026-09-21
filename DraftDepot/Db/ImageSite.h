#pragma once
#include "Db.h"
#include <string>

/**
 * 图片在对方图床上的地址：image 一对多的“多”端，一张图发到几个站点就有几条记录。
 *
 * 正文里的图存在本地 images 目录，发布时才由站点脚本传对方图床（见 JS/Msg.js）。传出来的地址
 * 记在这里，下次发布前先查一次：命中就直接用，省一趟上传，对方图床也不堆重复副本。
 *
 * 缓存键是"图片文件名 + 站点名"：文件名（img_xxx.png）在存图时一次性生成、之后从不改写，
 * 所以同一个文件名必然是同一份内容，不存在"同名不同内容"的误命中；站点名与 site 表的 name、
 * site 窗口的 type 是同一套（"WeiXin" / "ZhiHu" / ...），由 native 自己填，不交给脚本传。
 */
class ImageSite
{
public:
	/// 查这张图在本站点传过没有：传过返回它的图床地址，没传过（或没记过）返回空串
	static std::wstring urlOf(const std::wstring& imageName, const std::wstring& siteName);
	/// 记下地址：同一张图同一站点只留一条，重复传覆盖成新地址（表上 (image_name, site_name) 唯一）。
	/// url 给空串就不写：那是上传失败，写了下次会拿着空地址当命中
	static void save(const std::wstring& imageName, const std::wstring& siteName, const std::wstring& url);
};
