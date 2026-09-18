// 站点脚本（JS/*.js）共用的 IPC 客户端，注入时挂在 window.DDMsg 上。
// 与主页面 UI/src/Msg.ts 是同一套协议：{ id, method, args } 发出去，native 回 { id, result | error }。
// 由 PageSite::injectSiteScript 拼在站点脚本前面，所以站点脚本里直接用 DDMsg.invoke 即可。
(function () {
  const cache = new Map(); // id → { resolve, reject }；事件名 → 监听者数组，与主页面一致共用一张表

  function emit(eventName, data) {
    const listeners = cache.get(eventName);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      listener(data);
    }
  }

  function onMessage(event) {
    const msg = event.data;
    if (msg.id && cache.has(msg.id)) {
      const item = cache.get(msg.id);
      if (msg.error) {
        item.reject(msg.error);
      } else {
        item.resolve(msg.result);
      }
      cache.delete(msg.id);
    } else if (msg.eventName) {
      emit(msg.eventName, msg);
    }
  }

  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener("message", onMessage);
  }

  function invoke(method, args) {
    return new Promise(function (resolve, reject) {
      const id = Math.random().toString(8).substring(2);
      cache.set(id, { resolve: resolve, reject: reject });
      if (!window.chrome || !window.chrome.webview) {
        return;
      }
      window.chrome.webview.postMessage({ id: id, method: method, args: args });
    });
  }

  function on(eventName, listener) {
    const arr = cache.get(eventName);
    if (arr) {
      arr.push(listener);
    } else {
      cache.set(eventName, [listener]);
    }
  }

  function off(eventName, listener) {
    const arr = cache.get(eventName);
    if (!arr) return;
    cache.set(
      eventName,
      arr.filter(function (item) {
        return item !== listener;
      }),
    );
  }

  function once(eventName, listener) {
    const onceListener = function (arg) {
      listener(arg);
      off(eventName, onceListener);
    };
    on(eventName, onceListener);
  }

  window.DDMsg = { invoke: invoke, on: on, off: off, once: once, emit: emit };
})();
