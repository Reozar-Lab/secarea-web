export default {
  async fetch(request, env, ctx) {
    // 纯静态托管，任何请求都交给 Cloudflare 去找对应的 HTML
    return env.ASSETS.fetch(request);
  }
};