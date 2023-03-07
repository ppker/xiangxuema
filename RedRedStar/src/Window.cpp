#include "../include/RRS/App.h"
#include "../include/RRS/Window.h"
#include "../include/RRS/Element.h"

namespace RRS 
{
	Window::Window()
	{
		
	}
	Window::~Window()
	{
	}
	bool Window::Load() 
	{
		auto flag = createNativeWindow();
		if (!flag) return flag; //todo error
		initSurface();
		OnLoad();
		EmitEvent(EventType::Loaded);
		SetDirty(false); //��һ�β���Ҫ�ػ棬��Ϊ����ϵͳ���Զ��ػ�
		App::Get()->AddWindow(this);
		paintLoopThreadResult = std::async(&Window::paintLoopThread, this);
		return true;
	}
	void Window::AddChild(std::shared_ptr<Element> child)
	{
		child->OwnerWindow = this;
		Children.push_back(child);
		//todo ��Ӧ���õݹ飬Ӧ�øĳɼ򵥵�ѭ������ֹջ���
		std::function<void(Element* ele)> func = [this,&func](Element* ele) {
			ele->OwnerWindow = this;
			for (auto& c : ele->Children)
			{
				func(c.get());
			}
		};
		for (auto& c : child->Children)
		{
			func(c.get());
		}
	}
	void Window::Close()
	{
		auto flag = OnClose();
		if (flag) {
			DestroyWindow(Hwnd);
			disposeSurfaceResource();
			Hwnd = nullptr;
			paintLoopThreadResult.wait();
			App::Get()->RemoveWindow(this);
			OnClosed();
			EmitEvent(EventType::WindowClosed);
		}
	}
	void Window::paintLoopThread()
	{
		while (Hwnd)
		{
			std::this_thread::sleep_for(std::chrono::milliseconds(18)); //60֡���ң�Ҳ��һ��ÿ֡��ˢ��
			if (GetDirty())
			{
				InvalidateRect(Hwnd, nullptr, false);
				SetDirty(false);
			}
		}
	}
	void Window::Show() 
	{
		ShowWindow(Hwnd, SW_SHOW);
		EmitEvent(EventType::Show);
	}
	void Window::Hide() 
	{
		//todo
		EmitEvent(EventType::Hide);
	}
}