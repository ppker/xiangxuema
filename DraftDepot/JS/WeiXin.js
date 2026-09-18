const CREATE_ARTICLE_URL =
    "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&token={token}&lang=zh_CN&timestamp={timestamp}";

const CHECK_INTERVAL = 800;

const timer = setInterval(() => {
    // 已经落在编辑页就别再跳：目标 URL 自身也带 token，不拦住会不停刷新页面
    if (location.href.includes("/cgi-bin/appmsg")) {
        clearInterval(timer);
        return;
    }
    const token = new URLSearchParams(location.search).get("token");
    if (!token) return;
    clearInterval(timer);
    location.href = CREATE_ARTICLE_URL
        .replace("{token}", token)
        .replace("{timestamp}", Date.now());
}, CHECK_INTERVAL);
