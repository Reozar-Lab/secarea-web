import { getCurrentUser, verifyAuth, jsonResp } from './utils.js';

export async function handleWiki(request, env, url, ctx) {
  const method = request.method;
  
  // ==========================================
  // 1. 获取文件接口
  // ==========================================
  if (url.pathname === '/api/wiki/get' && method === 'GET') {
    const auth = await verifyAuth(request, env, ['editor', 'admin', 'root']);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    
    let filePath = url.searchParams.get('path');
    if (!filePath) return jsonResp({ error: "缺少路径参数" }, 400);
    
    filePath = filePath.trim().replace(/^\/+|\/+$/g, '');
    if (!filePath.endsWith('.md')) filePath += '.md';
    
    try {
      const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
      const fetchUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/content/${encodedPath}`;
      
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
  
  // ==========================================
  // 2. 保存文件接口
  // ==========================================
  if (url.pathname === '/api/wiki/save' && method === 'POST') {
    const auth = await verifyAuth(request, env, ['editor', 'admin', 'root']);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    const currentUser = auth.user;
    
    try {
      const { path, content } = await request.json();
      if (!path || content === undefined) return jsonResp({ error: "路径或内容不能为空" }, 400);
      
      let cleanPath = path.trim().replace(/^\/+|\/+$/g, '');
      let safePath = cleanPath.startsWith('content/') ? cleanPath : `content/${cleanPath}`;
      if (!safePath.endsWith('.md')) safePath += '.md';
      
      const encodedPath = safePath.split('/').map(encodeURIComponent).join('/');
      const encodedContent = btoa(unescape(encodeURIComponent(content)));
      
      const getUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodedPath}`;
      
      let sha = null;
      const getRes = await fetch(getUrl, {
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' }
      });
      
      if (getRes.ok) {
        const fileData = await getRes.json();
        sha = fileData.sha;
      }
      
      const putRes = await fetch(getUrl, {
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
      
      try {
        await env.DB.prepare(`
          INSERT INTO wiki_history (path, editor_id, editor_name, summary, created_at) 
          VALUES (?, ?, ?, ?, ?)
        `).bind(safePath, currentUser.id, currentUser.name, "更新词条", Date.now()).run();
        
        await env.DB.prepare(`
          INSERT INTO wiki_files (path) VALUES (?) ON CONFLICT(path) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        `).bind(safePath).run();
      } catch (dbErr) {
        console.error("写入数据库失败:", dbErr);
      }
      
      if (env.PAGES_DEPLOY_HOOK) ctx.waitUntil(fetch(env.PAGES_DEPLOY_HOOK, { method: 'POST' }));
      
      return jsonResp({ success: true, message: "已提交至 GitHub，正在重新构建页面..." });
    } catch (e) {
      return jsonResp({ error: "保存失败: " + e.message }, 500);
    }
  }
  
  // ==========================================
  // 3. 获取分类列表
  // ==========================================
  if (url.pathname === '/api/wiki/categories' && method === 'GET') {
    const auth = await verifyAuth(request, env, ['editor', 'admin', 'root']);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    
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
  
  // ==========================================
  // 4. 新建分类
  // ==========================================
  if (url.pathname === '/api/wiki/new-category' && method === 'POST') {
    const auth = await verifyAuth(request, env, ['admin', 'root']);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    const currentUser = auth.user;
    
    try {
      const { categoryName } = await request.json();
      if (!categoryName) return jsonResp({ error: "分类名不能为空" }, 400);
      
      const safePath = `content/${categoryName}/index.md`;
      const encodedPath = safePath.split('/').map(encodeURIComponent).join('/');
      const encodedContent = btoa("");
      
      const putRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodedPath}`, {
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
      
      try {
        await env.DB.prepare(`
          INSERT INTO wiki_history (path, editor_id, editor_name, summary, created_at) 
          VALUES (?, ?, ?, ?, ?)
        `).bind(safePath, currentUser.id, currentUser.name, "新建分类", Date.now()).run();
        
        await env.DB.prepare(`
          INSERT INTO wiki_files (path) VALUES (?) ON CONFLICT(path) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        `).bind(safePath).run();
      } catch (dbErr) {}
      
      if (env.PAGES_DEPLOY_HOOK) ctx.waitUntil(fetch(env.PAGES_DEPLOY_HOOK, { method: 'POST' }));
      
      return jsonResp({ success: true });
    } catch (e) {
      return jsonResp({ error: "创建分类失败: " + e.message }, 500);
    }
  }
  
  // ==========================================
  // 5. 获取全量词条列表 (用于全局搜索)
  // ==========================================
  if (url.pathname === '/api/wiki/all-files' && method === 'GET') {
    const auth = await verifyAuth(request, env, ['editor', 'admin', 'root']);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    
    try {
      const { results } = await env.DB.prepare("SELECT path FROM wiki_files").all();
      const files = results.map(r => r.path.replace(/^content\//, '').replace(/\.md$/, ''));
      return jsonResp({ files });
    } catch (e) {
      return jsonResp({ error: "获取列表失败" }, 500);
    }
  }
  
  return null;
}