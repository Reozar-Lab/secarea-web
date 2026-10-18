export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // API 接口预留
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/health') {
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("API Not Found", { status: 404 });
    }

    // 其他请求全部走静态资源（HTML/CSS/图片）
    return env.ASSETS.fetch(request);
  },
};
