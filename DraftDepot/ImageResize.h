#pragma once
#include <string>

/**
 * 图像缩放：把一张图按给定的宽高另存一份，原图不动（用户把图缩小之后还能再放大回去，
 * 放大是基于原图重新生成的，所以不会因为"拿上一张缩略图去放大"而失真）。
 *
 * 用 Windows 自带的 WIC（Windows Imaging Component）：不引第三方库，系统认得的常见格式
 * （png / jpeg / bmp / tiff）既能解也能存；解不开或存不了的（动图 gif、svg、webp 之类）
 * 一律失败，调用方按老逻辑走——正文里继续引用原图，不做任何处理。
 */
class ImageResize
{
public:
	/**
	 * @param src / dst 源图、目标图的完整路径；目标格式按 dst 的扩展名定（不认识的扩展名直接失败）
	 * @return 成功 true；任何一步不成（格式不支持、读写出错）都 false。
	 *         失败时可能留下一个半截文件，由调用方删掉
	 */
	static bool resize(const std::wstring& src, const std::wstring& dst, int width, int height);
};
