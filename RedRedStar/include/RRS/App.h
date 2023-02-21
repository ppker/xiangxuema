#pragma once
#include <Windows.h>
namespace RRS {
	class App
	{
		public:
			App(const App&) = delete;
			App& operator=(const App&) = delete;
			/// <summary>
			/// ��ȡAppȫ��ʵ��
			/// </summary>
			/// <returns></returns>
			static App* Get();
			/// <summary>
			/// ��ʼ��App����
			/// </summary>
			static void Init(HINSTANCE hInstance);
			~App();
			static int Exec();
			HINSTANCE hInstance;
		private:
			App(HINSTANCE hInstance);
			inline static App* app{ nullptr };
	};
}