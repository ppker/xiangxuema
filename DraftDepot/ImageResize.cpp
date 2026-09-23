#include "ImageResize.h"

#include <Windows.h>
#include <wincodec.h>
#include <wrl.h>
#include <cwctype>

// WIC 的工厂与编码器都在 windowscodecs 里（系统自带，不额外带 dll）
#pragma comment(lib, "windowscodecs.lib")

using namespace Microsoft::WRL;

namespace
{
	/** 目标容器按扩展名定：只认这几个；认不出（gif / svg / webp …）就返回 false，交给调用方按老逻辑走 */
	bool containerOf(const std::wstring& dst, GUID& container)
	{
		auto dot = dst.rfind(L'.');
		if (dot == std::wstring::npos) return false;
		std::wstring ext = dst.substr(dot);
		for (auto& c : ext) c = static_cast<wchar_t>(towlower(c));
		if (ext == L".png") container = GUID_ContainerFormatPng;
		else if (ext == L".jpg" || ext == L".jpeg") container = GUID_ContainerFormatJpeg;
		else if (ext == L".bmp") container = GUID_ContainerFormatBmp;
		else if (ext == L".tif" || ext == L".tiff") container = GUID_ContainerFormatTiff;
		else return false;
		return true;
	}
}

bool ImageResize::resize(const std::wstring& src, const std::wstring& dst, int width, int height)
{
	if (width <= 0 || height <= 0) return false;
	GUID container{};
	if (!containerOf(dst, container)) return false;

	ComPtr<IWICImagingFactory> factory;
	if (FAILED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER,
		IID_PPV_ARGS(&factory)))) return false;

	// 解码：动图之类解不开的（或压根不是图）到这一步就 false 了
	ComPtr<IWICBitmapDecoder> decoder;
	if (FAILED(factory->CreateDecoderFromFilename(src.c_str(), nullptr, GENERIC_READ,
		WICDecodeMetadataCacheOnDemand, &decoder))) return false;
	ComPtr<IWICBitmapFrameDecode> frame;
	if (FAILED(decoder->GetFrame(0, &frame))) return false;

	ComPtr<IWICBitmapScaler> scaler;
	if (FAILED(factory->CreateBitmapScaler(&scaler))) return false;
	// Fant：缩小时质量最好（WIC 里相当于高质量重采样），代价是慢一点，一次拖拽只调一回，值
	if (FAILED(scaler->Initialize(frame.Get(), width, height, WICBitmapInterpolationModeFant))) return false;

	ComPtr<IWICStream> stream;
	if (FAILED(factory->CreateStream(&stream))) return false;
	if (FAILED(stream->InitializeFromFilename(dst.c_str(), GENERIC_WRITE))) return false;

	ComPtr<IWICBitmapEncoder> encoder;
	if (FAILED(factory->CreateEncoder(container, nullptr, &encoder))) return false;
	if (FAILED(encoder->Initialize(stream.Get(), WICBitmapEncoderNoCache))) return false;
	ComPtr<IWICBitmapFrameEncode> outFrame;
	ComPtr<IPropertyBag2> options; // 不用调编码参数，给个空包让 CreateNewFrame 有地方写
	if (FAILED(encoder->CreateNewFrame(&outFrame, &options))) return false;
	if (FAILED(outFrame->Initialize(options.Get()))) return false;
	if (FAILED(outFrame->SetSize(width, height))) return false;
	// JPEG 存不了带 alpha 的格式，所以定一个目标像素格式让 WriteSource 自己转：
	// JPEG → 24bppBGR（去掉 alpha），其余 → 32bppBGRA。转不了的格式这一步会失败
	WICPixelFormatGUID target = IsEqualGUID(container, GUID_ContainerFormatJpeg)
		? GUID_WICPixelFormat24bppBGR : GUID_WICPixelFormat32bppBGRA;
	if (FAILED(outFrame->SetPixelFormat(&target))) return false;
	if (FAILED(outFrame->WriteSource(scaler.Get(), nullptr))) return false;
	if (FAILED(outFrame->Commit())) return false;
	if (FAILED(encoder->Commit())) return false;
	return true;
}
