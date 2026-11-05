import { getCurrentUser, verifyAuth, jsonResp } from './utils.js';

export async function handleWiki(request, env, url, ctx) {
  const method = request.method;
  
  // ==========================================
  // 1. 获取文件接口
  // ==========================================
  if (url.pathname === '/api/wiki/get' && method === 'GET') {
    console.log("==========================================");
    console.log("【Wiki Get】收到拉取文件请求");
    
    const auth = await verifyAuth(request, env, ['editor', 'admin', 'root']);
    if (auth.error) {
      console.log("【Wiki Get】鉴权失败:", auth.error);
      return jsonResp({ error: auth.error }, auth.status);
    }
    
    let rawPath = url.searchParams.get('path');
    console.log("【Wiki Get】前端传过来的原始 Path:", rawPath);
    
    if (!rawPath) return jsonResp({ error: "缺少路径参数" }, 400);
    
    // 清理路径：去首尾空格、去首尾斜杠
    let filePath = rawPath.trim().replace(/^\/+|\/+$/g, '');
    if (!filePath.endsWith('.md')) filePath += '.md';
    
    console.log("【Wiki Get】清理后的 filePath:", filePath);
    
    try {
      // 核心：对路径的每一段进行独立编码
      const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
      
      // 拼接最终的 GitHub API URL
      const fetchUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/content/${encodedPath}`;
      console.log("【Wiki Get】最终请求的 GitHub URL:", fetchUrl);
      
      const getRes = await fetch(fetchUrl, {
        headers: {
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'User-Agent': 'Cloudflare-Worker'
        }
      });
      
      console.log("【Wiki Get】GitHub 响应状态码:", getRes.status);
      
      if (!getRes.ok) {
        if (getRes.status === 404) {
          console.log("【Wiki Get】文件不存在，返回 404");
          return jsonResp({ error: "文件不存在（新建词条）" }, 404);
        }
        
        const errText = await getRes.text();
        console.log("【Wiki Get】GitHub 报错详情:", errText);
        return jsonResp({ error: `GitHub 拒绝访问 (${getRes.status}): ${errText}` }, getRes.status);
      }
      
      const fileData = await getRes.json();
      console.log("【Wiki Get】成功获取文件，文件名:", fileData.name);
      
      const content = decodeURIComponent(escape(atob(fileData.content.replace(/\s/g, ''))));
      return jsonResp({ content, path: filePath });
    } catch (e) {
      console.log("【Wiki Get】请求异常:", e.message);
      return jsonResp({ error: "拉取异常: " + e.message }, 500);
    }
  }
  
  // ==========================================
  // 2. 保存文件接口
  // ==========================================
  if (url.pathname === '/api/wiki/save' && method === 'POST') {
    console.log("==========================================");
    console.log("【Wiki Save】收到保存文件请求");
    
    const auth = await verifyAuth(request, env, ['editor', 'admin', 'root']);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    const currentUser = auth.user;
    
    try {
      const { path, content } = await request.json();
      console.log("【Wiki Save】前端传过来的 Path:", path);
      
      if (!path || content === undefined) return jsonResp({ error: "路径或内容不能为空" }, 400);
      
      let cleanPath = path.trim().replace(/^\/+|\/+$/g, '');
      
      // 检查是否已经有 content/ 前缀
      let safePath = cleanPath.startsWith('content/') ? cleanPath : `content/${cleanPath}`;
      if (!safePath.endsWith('.md')) safePath += '.md';
      
      console.log("【Wiki Save】处理后要保存的完整 safePath:", safePath);
      
      // 分段编码
      const encodedPath = safePath.split('/').map(encodeURIComponent).join('/');
      const encodedContent = btoa(unescape(encodeURIComponent(content)));
      
      const getUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodedPath}`;
      console.log("【Wiki Save】检查旧文件的 URL:", getUrl);
      
      let sha = null;
      const getRes = await fetch(getUrl, {
        headers: {
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'User-Agent': 'Cloudflare-Worker'
        }
      });
      
      if (getRes.ok) {
        const fileData = await getRes.json();
        sha = fileData.sha;
        console.log("【Wiki Save】发现旧文件，获取到 SHA:", sha);
      } else {
        console.log("【Wiki Save】没找到旧文件，准备新建。状态码:", getRes.status);
      }
      
      console.log("【Wiki Save】准备发起 PUT 请求保存文件...");
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
        console.log("【Wiki Save】GitHub 保存失败，报错:", errText);
        return jsonResp({ error: "GitHub 推送失败: " + errText }, 500);
      }
      
      console.log("【Wiki Save】GitHub 保存成功！");
      
      try {
        await env.DB.prepare(`
          INSERT INTO wiki_history (path, editor_id, editor_name, summary, created_at) 
          VALUES (?, ?, ?, ?, ?)
        `).bind(safePath, currentUser.id, currentUser.name, "更新词条", Date.now()).run();
        
        await env.DB.prepare(`
          INSERT INTO wiki_files (path) VALUES (?) ON CONFLICT(path) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        `).bind(safePath).run();
        console.log("【Wiki Save】D1 数据库记录更新成功");
      } catch (dbErr) {
        console.log("【Wiki Save】D1 数据库记录失败:", dbErr.message);
      }
      
      if (env.PAGES_DEPLOY_HOOK) ctx.waitUntil(fetch(env.PAGES_DEPLOY_HOOK, { method: 'POST' }));
      
      return jsonResp({ success: true, message: "已提交至 GitHub，正在重新构建页面..." });
    } catch (e) {
      console.log("【Wiki Save】保存异常:", e.message);
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
  
  return null;
}