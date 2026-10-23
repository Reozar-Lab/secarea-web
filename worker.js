export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    // 辅助函数：获取当前请求的用户信息
    async function getCurrentUser(request, env) {
      const cookieHeader = request.headers.get('Cookie');
      if (!cookieHeader) return null;
      const match = cookieHeader.match(/session=([^;]+)/);
      if (!match) return null;
      const session = await env.DB.prepare(`
          SELECT u.id, u.name, u.email, u.role, u.is_banned 
          FROM sessions s JOIN users u ON s.user_id = u.id 
          WHERE s.token = ? AND s.expires_at > ?
      `).bind(match[1], Date.now()).first();
      return session || null;
    }
    
    const jsonResp = (obj, status = 200) => new Response(JSON.stringify(obj), {
      status, headers: { "Content-Type": "application/json" }
    });

    // ================= 1. 认证模块 =================
    if (url.pathname === '/api/auth/send-code' && method === 'POST') {
      try {
        const { email } = await request.json();
        if (!email) return jsonResp({ error: "邮箱不能为空" }, 400);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await env.DB.prepare("DELETE FROM otp_codes WHERE email = ?").bind(email).run();
        await env.DB.prepare("INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)").bind(email, otp, Date.now() + 10*60*1000).run();
        await new Promise(r => setTimeout(r, 1000)); 
        const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          body: JSON.stringify({ service_id: env.EMAILJS_SERVICE_ID, template_id: env.EMAILJS_TEMPLATE_ID, user_id: env.EMAILJS_PUBLIC_KEY, template_params: { to_email: email, otp: otp } })
        });
        if (!res.ok) throw new Error('邮件发送失败');
        return jsonResp({ success: true });
      } catch (error) { return jsonResp({ error: error.message }, 500); }
    }

    if (url.pathname === '/api/auth/register' && method === 'POST') {
      try {
        const { name, email, password, otp } = await request.json();
        const record = await env.DB.prepare("SELECT * FROM otp_codes WHERE email = ? AND code = ?").bind(email, otp).first();
        if (!record || record.expires_at < Date.now()) return jsonResp({ error: "验证码错误" }, 400);
        const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (existingUser) return jsonResp({ error: "邮箱已注册" }, 400);

        const msgBuffer = new TextEncoder().encode(password + env.BETTER_AUTH_SECRET);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashedPassword = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        await env.DB.prepare("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, 'user')").bind(crypto.randomUUID(), name, email, hashedPassword).run();
        await env.DB.prepare("DELETE FROM otp_codes WHERE email = ?").bind(email).run();
        return jsonResp({ success: true });
      } catch (error) { return jsonResp({ error: "注册失败" }, 500); }
    }

    if (url.pathname === '/api/auth/login' && method === 'POST') {
      try {
        const { email, password } = await request.json();
        const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
        if (!user) return jsonResp({ error: "邮箱或密码错误" }, 401);

        const msgBuffer = new TextEncoder().encode(password + env.BETTER_AUTH_SECRET);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashedPassword = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        if (hashedPassword !== user.password) return jsonResp({ error: "邮箱或密码错误" }, 401);

        const sessionToken = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").bind(sessionToken, user.id, Date.now() + 30*24*60*60*1000).run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${30*24*60*60}` } });
      } catch (error) { return jsonResp({ error: "登录失败" }, 500); }
    }

    if (url.pathname === '/api/auth/logout' && method === 'POST') {
      const cookieHeader = request.headers.get('Cookie');
      if (cookieHeader) {
        const match = cookieHeader.match(/session=([^;]+)/);
        if (match) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(match[1]).run();
      }
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": "session=; Path=/; Max-Age=0" } });
    }

    if (url.pathname === '/api/auth/me' && method === 'GET') {
      return jsonResp({ user: await getCurrentUser(request, env) });
    }

    // ================= 2. 管理模块 =================
    if (url.pathname === '/api/admin/users' && method === 'GET') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser || (currentUser.role !== 'root' && currentUser.role !== 'admin')) return jsonResp({ error: "权限不足" }, 403);
      const { results } = await env.DB.prepare("SELECT id, name, email, role, is_banned FROM users ORDER BY created_at DESC").all();
      return jsonResp({ users: results });
    }

    // ================= 3. 发现（Forum）核心 API =================
    
    // 3.1 获取信息流（游标分页）
    if (url.pathname === '/api/forum/posts' && method === 'GET') {
      const currentUser = await getCurrentUser(request, env);
      const tab = url.searchParams.get('tab') || 'discover';
      const cursor = url.searchParams.get('cursor'); // created_at 的毫秒时间戳
      const limit = parseInt(url.searchParams.get('limit')) || 20;

      try {
        let sql = `
          SELECT p.*, u.name as author_name, u.role as author_role 
          FROM posts p 
          JOIN users u ON p.author_id = u.id 
          WHERE p.is_deleted = 0
        `;
        const bindings = [];

        if (tab === 'following' && currentUser) {
          sql += ` AND p.author_id IN (SELECT following_id FROM follows WHERE follower_id = ?)`;
          bindings.push(currentUser.id);
        }

        if (cursor) {
          sql += ` AND p.created_at < ?`;
          bindings.push(parseInt(cursor));
        }

        sql += ` ORDER BY p.created_at DESC LIMIT ?`;
        bindings.push(limit + 1); // 多查一条用来判断有没有下一页

        const { results } = await env.DB.prepare(sql).bind(...bindings).all();
        
        let posts = results;
        let nextCursor = null;
        if (posts.length > limit) {
          posts.pop(); // 移除多查的那条
          nextCursor = posts[posts.length - 1].created_at;
        }

        // 如果当前有用户登录，补充 likedByMe 和 favoritedByMe 状态
        if (currentUser && posts.length > 0) {
          const postIds = posts.map(p => `'${p.id}'`).join(',');
          const likes = await env.DB.prepare(`SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${postIds})`).bind(currentUser.id).all();
          const favs = await env.DB.prepare(`SELECT post_id FROM favorites WHERE user_id = ? AND post_id IN (${postIds})`).bind(currentUser.id).all();
          
          const likedSet = new Set(likes.results.map(r => r.post_id));
          const favedSet = new Set(favs.results.map(r => r.post_id));
          
          posts.forEach(p => {
            p.likedByMe = likedSet.has(p.id);
            p.favoritedByMe = favedSet.has(p.id);
          });
        }

        return jsonResp({ posts, nextCursor });
      } catch (e) { return jsonResp({ error: e.message }, 500); }
    }

    // 3.2 发布帖子
    if (url.pathname === '/api/forum/posts' && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return jsonResp({ error: "请先登录" }, 401);
      if (currentUser.is_banned === 1) return jsonResp({ error: "账号已被封禁" }, 403);

      try {
        const { content, imageUrl, category, tags } = await request.json();
        if (!content) return jsonResp({ error: "内容不能为空" }, 400);

        const postId = crypto.randomUUID();
        const now = Date.now();
        const tagsStr = tags && tags.length ? tags.join(',') : null;
        // 预览截取前 200 字
        const preview = content.length > 200 ? content.substring(0, 200) : content;

        await env.DB.prepare(`
          INSERT INTO posts (id, author_id, content, preview, image_url, category, tags, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(postId, currentUser.id, content, preview, imageUrl, category || 'discussion', tagsStr, now, now).run();

        return jsonResp({ success: true, postId });
      } catch (e) { return jsonResp({ error: e.message }, 500); }
    }

    // 3.3 删除帖子（软删）
    if (url.pathname.startsWith('/api/forum/posts/') && method === 'DELETE') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return jsonResp({ error: "请先登录" }, 401);
      
      const postId = url.pathname.split('/')[4];
      const post = await env.DB.prepare("SELECT author_id FROM posts WHERE id = ?").bind(postId).first();
      if (!post) return jsonResp({ error: "帖子不存在" }, 404);

      const isOwner = post.author_id === currentUser.id;
      const isAdmin = currentUser.role === 'admin' || currentUser.role === 'root';
      if (!isOwner && !isAdmin) return jsonResp({ error: "无权删除" }, 403);

      await env.DB.prepare("UPDATE posts SET is_deleted = 1, deleted_by = ? WHERE id = ?").bind(currentUser.id, postId).run();
      return jsonResp({ success: true });
    }

    // 3.4 点赞 / 取消点赞
    if (url.pathname.match(/^\/api\/forum\/posts\/[^/]+\/like$/) && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return jsonResp({ error: "请先登录" }, 401);
      
      const postId = url.pathname.split('/')[4];
      const existing = await env.DB.prepare("SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?").bind(currentUser.id, postId).first();

      if (existing) {
        await env.DB.prepare("DELETE FROM likes WHERE user_id = ? AND post_id = ?").bind(currentUser.id, postId).run();
        await env.DB.prepare("UPDATE posts SET likes_count = likes_count - 1 WHERE id = ?").bind(postId).run();
        return jsonResp({ success: true, liked: false });
      } else {
        await env.DB.prepare("INSERT INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)").bind(currentUser.id, postId, Date.now()).run();
        await env.DB.prepare("UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?").bind(postId).run();
        return jsonResp({ success: true, liked: true });
      }
    }

    // 3.5 收藏 / 取消收藏
    if (url.pathname.match(/^\/api\/forum\/posts\/[^/]+\/favorite$/) && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return jsonResp({ error: "请先登录" }, 401);
      
      const postId = url.pathname.split('/')[4];
      const existing = await env.DB.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND post_id = ?").bind(currentUser.id, postId).first();

      if (existing) {
        await env.DB.prepare("DELETE FROM favorites WHERE user_id = ? AND post_id = ?").bind(currentUser.id, postId).run();
        await env.DB.prepare("UPDATE posts SET favorites_count = favorites_count - 1 WHERE id = ?").bind(postId).run();
        return jsonResp({ success: true, favorited: false });
      } else {
        await env.DB.prepare("INSERT INTO favorites (user_id, post_id, created_at) VALUES (?, ?, ?)").bind(currentUser.id, postId, Date.now()).run();
        await env.DB.prepare("UPDATE posts SET favorites_count = favorites_count + 1 WHERE id = ?").bind(postId).run();
        return jsonResp({ success: true, favorited: true });
      }
    }

    // 漏掉的接口先兜底
    if (url.pathname.startsWith('/api/forum/')) {
      return jsonResp({ error: "接口尚未实现" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};