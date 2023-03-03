#pragma once
#include "CommonType.h"
#include "Color.h"
#include "Layout.h"
#include "EventListener.h"
class SkCanvas;
namespace RRS {
	class Window;
	class Element:public Layout,public EventListener
	{
	public:
		Element();
		~Element();
		virtual void Paint(SkCanvas* canvas) = 0;
		/// <summary>
		/// show the element
		/// </summary>
		void Show();
		/// <summary>
		/// show the element
		/// </summary>
		void Hide();
		virtual void SetIsMouseEnter(int x, int y);
		virtual void CalculatePosition();
		bool GetIsMouseEnter();
		/// <summary>
		/// ����Ԫ�ر���ӵ���Ԫ���ڣ��ٰѸ�Ԫ����ӵ������ڣ���ʱ��Ԫ�ص�ownerWindowΪ��
		/// ����ͨ����Ԫ�ص�GetOwnerWindow������ȡownerWindowʱ����������ĸ�Ԫ�أ�ֱ���ҵ�ownerWindowΪֹ
		/// ��ȡ����Ԫ�ص�ownerWindow�����ָ��ᱻ�����������´ξͲ�����ִ�б���������
		/// </summary>
		/// <returns></returns>
		Window* GetOwnerWindow();
		Element* GetParentElement();
		virtual void EmitClickEvent();
		void SetParentElement(Element* element);
	protected:
	private:
		friend Window;
		bool isMouseEnter = false;
		Window* ownerWindow;
		Element* parentElement;
	};
}