import { handleAuth } from './src/auth.js';
import { handleForum } from './src/forum.js';
import { handleWiki } from './src/wiki.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 强制 HTTPS
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    
    // ================= API 路由分发 =================
    // 1. 认证与管理模块
    if (url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/admin/')) {
      const res = await handleAuth(request, env, url);
      if (res) return res;
    }
    
    // 2. 论坛、用户与公共统计模块 (加入了 /api/stats)
    if (url.pathname.startsWith('/api/forum/') || url.pathname.startsWith('/api/users/') || url.pathname === '/api/stats') {
      const res = await handleForum(request, env, url);
      if (res) return res;
    }
    
    // 3. Wiki 模块
    if (url.pathname.startsWith('/api/wiki/')) {
      const res = await handleWiki(request, env, url, ctx);
      if (res) return res;
    }
    
    // 处理未匹配到的 API (兜底)
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: "接口不存在" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    
    // ================= 静态资源路由重写 (页面搬家了) =================
    // 1. 如果访问根路径 /，默认去找 /index/index.html
    if (url.pathname === '/') {
      url.pathname = '/index/index.html';
    }
    // 2. 如果访问 /forum/ 这种目录，或者 /login/，自动映射到 /index/ 下的对应文件
    else if (
      url.pathname.startsWith('/login') ||
      url.pathname.startsWith('/register') ||
      url.pathname.startsWith('/profile') ||
      url.pathname.startsWith('/admin') ||
      url.pathname.startsWith('/forum') ||
      url.pathname.startsWith('/wiki')
    ) {
      // 如果用户没有具体到 .html 文件，比如 /forum/
      if (!url.pathname.includes('.')) {
        // 补上 index.html，并加上 /index 前缀
        const cleanPath = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname + '/index.html';
        url.pathname = '/index' + cleanPath;
      } else {
        // 如果带有具体页面比如 /forum/post/index.html
        url.pathname = '/index' + url.pathname;
      }
    }
    
    // 3. 交给 Cloudflare 静态资源引擎返回文件
    return env.ASSETS.fetch(new Request(url, request));
  }
};