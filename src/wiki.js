import { getCurrentUser, jsonResp } from './utils.js';

export async function handleWiki(request, env, url, ctx) {
  const method = request.method;
  
  // 1. 获取文件
  if (url.pathname === '/api/wiki/get' && method === 'GET') {
    const currentUser = await getCurrentUser(request, env);
    if (!currentUser || currentUser.role === 'user') return jsonResp({ error: "权限不足" }, 403);
    
    let filePath = url.searchParams.get('path');
    if (!filePath) return jsonResp({ error: "缺少路径参数" }, 400);
    if (!filePath.endsWith('.md')) filePath += '.md';
    
    try {
      const fetchUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/content/${filePath}`;
      const getRes = await fetch(fetchUrl, {
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' }
      });
      
      if (!getRes.ok) {
        if (getRes.status === 404) return jsonResp({ error: "文件不存在（新建词条）" }, 404);
        const errText = await getRes.text();
        return jsonResp({ error: `GitHub 拒绝访问 (${getRes.status}): ${errText}` }, getRes.status);
      }
      
      const fileData = await getRes.json();
      const content = decodeURIComponent(escape(atob(fileData.content.replace(/\s/g, ''))));
      return jsonResp({ content, path: filePath });
    } catch (e) {
      return jsonResp({ error: "拉取异常: " + e.message }, 500);
    }
  }
  
  // 2. 保存文件
  if (url.pathname === '/api/wiki/save' && method === 'POST') {
    const currentUser = await getCurrentUser(request, env);
    if (!currentUser) return jsonResp({ error: "请先登录" }, 401);
    if (currentUser.role === 'user') return jsonResp({ error: "权限不足，仅编者及以上可编辑" }, 403);
    
    try {
      const { path, content } = await request.json();
      if (!path || content === undefined) return jsonResp({ error: "路径或内容不能为空" }, 400);
      
      let safePath = path.startsWith('content/') ? path : `content/${path}`;
      if (!safePath.endsWith('.md')) safePath += '.md';
      const encodedContent = btoa(unescape(encodeURIComponent(content)));
      
      let sha = null;
      const getRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${safePath}`, {
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' }
      });
      
      if (getRes.ok) {
        const fileData = await getRes.json();
        sha = fileData.sha;
      }
      
      const putRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${safePath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Cloudflare-Worker'
        },
        body: JSON.stringify({
          message: `Wiki Update: ${safePath} by ${currentUser.name}`,
          content: encodedContent,
          sha: sha || undefined
        })
      });
      
      if (!putRes.ok) {
        const errText = await putRes.text();
        return jsonResp({ error: "GitHub 推送失败: " + errText }, 500);
      }
      
      // 记录历史数据（直接使用 Date.now() 写入毫秒时间戳，方便前端统一处理）
      try {
        await env.DB.prepare(`
          INSERT INTO wiki_history (path, editor_id, editor_name, summary, created_at) 
          VALUES (?, ?, ?, ?, ?)
        `).bind(safePath, currentUser.id, currentUser.name, "更新词条", Date.now()).run();
      } catch (dbErr) {
        console.error("写入历史记录失败:", dbErr);
      }
      
      if (env.PAGES_DEPLOY_HOOK) ctx.waitUntil(fetch(env.PAGES_DEPLOY_HOOK, { method: 'POST' }));
      
      return jsonResp({ success: true, message: "已提交至 GitHub，正在重新构建页面..." });
    } catch (e) {
      return jsonResp({ error: "保存失败: " + e.message }, 500);
    }
  }
  
  // 3. 获取分类列表
  if (url.pathname === '/api/wiki/categories' && method === 'GET') {
    const currentUser = await getCurrentUser(request, env);
    if (!currentUser || currentUser.role === 'user') return jsonResp({ error: "权限不足" }, 403);
    
    try {
      const getRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/content`, {
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' }
      });
      
      if (!getRes.ok) return jsonResp({ categories: [] });
      const files = await getRes.json();
      const categories = files.filter(f => f.type === 'dir').map(f => f.name);
      return jsonResp({ categories });
    } catch (e) {
      return jsonResp({ categories: [] });
    }
  }
  
  // 4. 新建分类
  if (url.pathname === '/api/wiki/new-category' && method === 'POST') {
    const currentUser = await getCurrentUser(request, env);
    if (!currentUser || !['admin', 'root'].includes(currentUser.role)) {
      return jsonResp({ error: "权限不足，仅管理员可新建分类" }, 403);
    }
    
    try {
      const { categoryName } = await request.json();
      if (!categoryName) return jsonResp({ error: "分类名不能为空" }, 400);
      
      const safePath = `content/${categoryName}/index.md`;
      const encodedContent = btoa("");
      
      const putRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${safePath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Cloudflare-Worker'
        },
        body: JSON.stringify({
          message: `Create category: ${categoryName} by ${currentUser.name}`,
          content: encodedContent
        })
      });
      
      if (!putRes.ok) {
        const errText = await putRes.text();
        return jsonResp({ error: "GitHub 创建失败: " + errText }, 500);
      }
      
      // 记录创建分类的历史
      try {
        await env.DB.prepare(`
          INSERT INTO wiki_history (path, editor_id, editor_name, summary, created_at) 
          VALUES (?, ?, ?, ?, ?)
        `).bind(safePath, currentUser.id, currentUser.name, "新建分类", Date.now()).run();
      } catch (dbErr) {
        console.error("写入历史记录失败:", dbErr);
      }
      
      if (env.PAGES_DEPLOY_HOOK) ctx.waitUntil(fetch(env.PAGES_DEPLOY_HOOK, { method: 'POST' }));
      
      return jsonResp({ success: true });
    } catch (e) {
      return jsonResp({ error: "创建分类失败: " + e.message }, 500);
    }
  }
  
  return null;
}