#pragma once
#include "Env.h"

class PageSite;

/**
 * site 窗口：打开外部站点（微信公众号 / 知乎 / CSDN / ...）的容器。
 * 与主 Window 是平行类，不继承：
 *   - 窗口风格：WS_OVERLAPPEDWINDOW（自带标准标题栏、min/max/close、可拖动改大小），
 *     不像主窗口 WS_POPUP 自绘。
 *   - 业务：主 Page 承载产品功能，PageSite 只负责显示网页 + 暴露 IPC 桥。
 * 模块单例：在主 Page::onMsgReceived 收到 openSite IPC 时由 WindowSite::create(type) 创建，
 * 起始 URL 不再由前端传，由本类按 type + config 自己算（见 buildStartUrl）。
 * 生命周期：
 *   - 自有全局 map windowsSite 跟踪，区别于主窗口的 windows（site 窗口关闭不影响主进程退出）；
 *   - 关窗时 WebView2 自动清理 webview，PageSite 由 unique_ptr 持有。
 */
class WindowSite
{
public:
	WindowSite(const std::wstring& type, const std::wstring& articleTitle, const std::wstring& articleHtml);
	/// 同 Window：成员 page 是 unique_ptr<PageSite>，析构要实例化在 WindowSite.cpp
	~WindowSite();
	/**
	 * 建 site 窗口。
	 * articleTitle / articleHtml：发布那一刻的文章标题与正文 HTML（点按钮时从主编辑器带过来），
	 * 先存在窗口上，站点脚本进到对方编辑器后经 getArticle 取走；没做的平台传空串即可。
	 */
	static WindowSite* create(const std::wstring& type,
		const std::wstring& articleTitle = {}, const std::wstring& articleHtml = {});

	/// 关掉本窗口：站点脚本（如 CnBlogs.js）碰到"这一步没法往下走"时用。
	/// 只投一个 WM_CLOSE 就返回——真正的销毁走窗口消息（onDestroy 里摘注册表、析构对象），
	/// 调用方（PageSite 的消息回调）还站在自己的栈上，直接 DestroyWindow 等于把自己删了
	void close();
	/// args: { key, value }；站点脚本（如 WeiXin.js 抓到 token）回传参数，
	/// 与已加载的 config 比对，不同才写回 site 表并更新内存；返回 { ok, changed }
	void setParam(const JsonObject& params, JsonObject& result);
	/**
	 * 站点脚本（WeiXin.js 进到编辑器后）来取"待发布的文章"，返回 { title, html }。
	 * 取过一次就清空：脚本每个文档（含页面自身刷新、跳转）都跑一遍，留着会被反复灌进编辑器。
	 */
	void takeArticle(JsonObject& result);
public:
	HWND hwnd;
	/// 站点类型，由前端 openSite 的 args.type 传入（如公众号 "WeiXin"、CSDN "CSDN"）
	std::wstring type;
	/// 该站点的配置：建窗时按 type 去 site 表读一次（type 对应表的 name 列），
	/// 存成 { "<param_key>": "<param_val>" }，如 { "token": "996767730" }；
	/// 窗口内要取配置直接读这个对象，不用再查库
	JsonObject config;
	/// 待灌进对方编辑器的文章，见 takeArticle。取走即清空，所以两者同时为空 = 已经发过了
	std::wstring articleTitle;
	std::wstring articleHtml;
private:
	static LRESULT CALLBACK winMsg(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
	void createWin();
	HRESULT onCtrlReady(HRESULT result, ICoreWebView2Controller* ctrl);
	/// 按 type + config 算出起始 URL：微信有 token 就直接进新建图文的编辑页，没有就落首页去登录；
	/// 其他平台暂用各自的落地首页；没登记过的 type 返回空串
	std::wstring buildStartUrl();
	void onDestroy();
private:
	std::unique_ptr<PageSite> page;
	ComPtr<ICoreWebView2Controller> ctrl;
};