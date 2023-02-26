#include "../include/RRS/EventListener.h"


namespace RRS {
	
	EventListener::EventListener()
	{
		
	}

	EventListener::~EventListener()
	{
	}
	//todo ��Щ����ͬ���¼���Ҫ��һ���첽�¼�����
	void EventListener::AddEventListener(EventType eventType, EventCallBack callBack) 
	{
		dispatcher[eventType].push_back(callBack);
	}
	void EventListener::EmitEvent(EventType eventType)
	{
		for (auto& cb : dispatcher[eventType])
		{
			cb(this);
		}
	}
}
