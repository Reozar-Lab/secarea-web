export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 强制 HTTPS
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    const method = request.method;

    // 辅助函数：获取当前请求的用户信息
    async function getCurrentUser(request, env) {
      const cookieHeader = request.headers.get('Cookie');
      if (!cookieHeader) return null;
      const match = cookieHeader.match(/session=([^;]+)/);
      if (!match) return null;
      const session = await env.DB.prepare(`
          SELECT u.id, u.name, u.email, u.role, u.is_banned, u.bio 
          FROM sessions s JOIN users u ON s.user_id = u.id 
          WHERE s.token = ? AND s.expires_at > ?
      `).bind(match[1], Date.now()).first();
      return session || null;
    }
    
    // 统一 JSON 返回辅助
    const jsonResp = (obj, status = 200) => new Response(JSON.stringify(obj), {
      status, headers: { "Content-Type": "application/json" }
    });

    // ================= 0. 文件上传 API (暂未启用) =================
    if (url.pathname === '/api/upload' && method === 'POST') {
      return jsonResp({ error: "图片上传功能正在维护中" }, 503);
    }

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

        if (!res.ok) {
          const errText = await res.text();
          return jsonResp({ error: `发信失败 (${res.status}): ${errText}` }, 500);
        }
        return jsonResp({ success: true });
      } catch (error) { return jsonResp({ error: "网络错误: " + error.message }, 500); }
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

        await env.DB.prepare("INSERT INTO users (id, name, email, password, role, created_at) VALUES (?, ?, ?, ?, 'user', ?)").bind(crypto.randomUUID(), name, email, hashedPassword, Date.now()).run();
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

    if (url.pathname === '/api/auth/reset-password' && method === 'POST') {
      try {
        const { email, otp, newPassword } = await request.json();
        const record = await env.DB.prepare("SELECT * FROM otp_codes WHERE email = ? AND code = ?").bind(email, otp).first();
        if (!record || record.expires_at < Date.now()) return jsonResp({ error: "验证码错误或已过期" }, 400);
        const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (!user) return jsonResp({ error: "该邮箱未注册" }, 404);

        const msgBuffer = new TextEncoder().encode(newPassword + env.BETTER_AUTH_SECRET);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashedPassword = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        await env.DB.prepare("UPDATE users SET password = ? WHERE id = ?").bind(hashedPassword, user.id).run();
        await env.DB.prepare("DELETE FROM otp_codes WHERE email = ?").bind(email).run();
        return jsonResp({ success: true });
      } catch (error) { return jsonResp({ error: "重置失败" }, 500); }
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
    
    if (url.pathname === '/api/admin/update-user' && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser || (currentUser.role !== 'root' && currentUser.role !== 'admin')) return jsonResp({ error: "权限不足" }, 403);
      const { targetUserId, newRole, newBanStatus } = await request.json();
      if (targetUserId === currentUser.id) return jsonResp({ error: "不能修改自己" }, 400);
      if (newRole) await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(newRole, targetUserId).run();
      if (newBanStatus !== undefined && newBanStatus !== null) await env.DB.prepare("UPDATE users SET is_banned = ? WHERE id = ?").bind(newBanStatus, targetUserId).run();
      return jsonResp({ success: true });
    }

    if (url.pathname === '/api/admin/reports' && method === 'GET') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser || (currentUser.role !== 'root' && currentUser.role !== 'admin')) return jsonResp({ error: "权限不足" }, 403);
      const settingRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'report_threshold'").first();
      const threshold = settingRow ? parseInt(settingRow.value) : 10;
      const { results: posts } = await env.DB.prepare(`
        SELECT p.id, p.content, p.preview, p.report_count, p.author_id, u.name as author_name
        FROM posts p JOIN users u ON p.author_id = u.id
        WHERE p.is_deleted = 0 AND p.report_count >= ?
        ORDER BY p.report_count DESC
      `).bind(threshold).all();
      return jsonResp({ posts, threshold });
    }

    if (url.pathname === '/api/admin/reports/dismiss' && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser || (currentUser.role !== 'root' && currentUser.role !== 'admin')) return jsonResp({ error: "权限不足" }, 403);
      const { postId } = await request.json();
      await env.DB.prepare("UPDATE reports SET status = 'dismissed' WHERE post_id = ? AND status = 'pending'").bind(postId).run();
      await env.DB.prepare("UPDATE posts SET report_count = 0 WHERE id = ?").bind(postId).run();
      return jsonResp({ success: true });
    }

    if (url.pathname === '/api/admin/reports/delete-post' && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser || (currentUser.role !== 'root' && currentUser.role !== 'admin')) return jsonResp({ error: "权限不足" }, 403);
      const { postId } = await request.json();
      await env.DB.prepare("UPDATE posts SET is_deleted = 1, deleted_by = ? WHERE id = ?").bind(currentUser.id, postId).run();
      await env.DB.prepare("UPDATE reports SET status = 'resolved', resolved_by = ? WHERE post_id = ? AND status = 'pending'").bind(currentUser.id, postId).run();
      return jsonResp({ success: true });
    }

    if (url.pathname === '/api/admin/settings' && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser || (currentUser.role !== 'root' && currentUser.role !== 'admin')) return jsonResp({ error: "权限不足" }, 403);
      const { key, value } = await request.json();
      await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, String(value)).run();
      return jsonResp({ success: true });
    }

    // ================= 3. 用户主页与信息更新 =================
    if (url.pathname === '/api/users/profile' && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return jsonResp({ error: "请先登录" }, 401);
      const { name, bio } = await request.json();
      if (!name) return jsonResp({ error: "用户名不能为空" }, 400);
      await env.DB.prepare("UPDATE users SET name = ?, bio = ? WHERE id = ?").bind(name, bio || '', currentUser.id).run();
      return jsonResp({ success: true });
    }

    if (url.pathname.match(/^\/api\/users\/[^/]+\/public$/) && method === 'GET') {
      const targetId = url.pathname.split('/')[3];
      const currentUser = await getCurrentUser(request, env);
      const user = await env.DB.prepare(`SELECT id, name, role, created_at, is_banned, bio FROM users WHERE id = ?`).bind(targetId).first();
      
      if (!user) return jsonResp({ error: "用户不存在" }, 404);
      if (user.is_banned === 1 && (!currentUser || currentUser.role === 'user')) return jsonResp({ error: "该账号已被封禁" }, 403);

      const stats = await env.DB.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM posts WHERE author_id = ? AND is_deleted = 0) as post_count,
          (SELECT COUNT(*) FROM favorites WHERE user_id = ?) as favorite_count,
          (SELECT COALESCE(SUM(likes_count), 0) FROM posts WHERE author_id = ? AND is_deleted = 0) as total_likes,
          (SELECT COUNT(*) FROM follows WHERE following_id = ?) as follower_count,
          (SELECT COUNT(*) FROM follows WHERE follower_id = ?) as following_count,
          0 as contribution_count
      `).bind(targetId, targetId, targetId, targetId, targetId).first();

      let isFollowing = false;
      if (currentUser && currentUser.id !== targetId) {
        const follow = await env.DB.prepare("SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?").bind(currentUser.id, targetId).first();
        isFollowing = !!follow;
      }
      return jsonResp({ user: { id: user.id, name: user.name, role: user.role, created_at: user.created_at, bio: user.bio || '', ...stats, isFollowing } });
    }

    if (url.pathname.match(/^\/api\/users\/[^/]+\/follow$/) && method === 'POST') {
      const targetId = url.pathname.split('/')[3];
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return jsonResp({ error: "请先登录" }, 401);
      if (currentUser.id === targetId) return jsonResp({ error: "不能关注自己" }, 400);
      const existing = await env.DB.prepare("SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?").bind(currentUser.id, targetId).first();
      if (existing) {
        await env.DB.prepare("DELETE FROM follows WHERE follower_id = ? AND following_id = ?").bind(currentUser.id, targetId).run();
        return jsonResp({ success: true, following: false });
      } else {
        await env.DB.prepare("INSERT INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)").bind(currentUser.id, targetId, Date.now()).run();
        return jsonResp({ success: true, following: true });
      }
    }

    if (url.pathname.match(/^\/api\/users\/[^/]+\/contributions$/) && method === 'GET') {
      return jsonResp({ contributions: [] });
    }

    // ================= 4. 发现（Forum）核心 API =================
    if (url.pathname === '/api/forum/posts' && method === 'GET') {
      const currentUser = await getCurrentUser(request, env);
      const tab = url.searchParams.get('tab') || 'discover';
      const cursor = url.searchParams.get('cursor'); 
      const authorId = url.searchParams.get('author_id');
      const limit = parseInt(url.searchParams.get('limit')) || 20;

      try {
        let sql = `SELECT p.*, u.name as author_name, u.role as author_role FROM posts p JOIN users u ON p.author_id = u.id WHERE p.is_deleted = 0`;
        const bindings = [];

        if (tab === 'following' && currentUser) {
          sql += ` AND p.author_id IN (SELECT following_id FROM follows WHERE follower_id = ?)`;
          bindings.push(currentUser.id);
        }
        
        if (tab === 'favorites' && currentUser) {
          sql = `SELECT p.*, u.name as author_name, u.role as author_role FROM posts p JOIN users u ON p.author_id = u.id JOIN favorites f ON p.id = f.post_id WHERE f.user_id = ? AND p.is_deleted = 0`;
          bindings.push(currentUser.id);
        }

        if (authorId) {
          sql += ` AND p.author_id = ?`;
          bindings.push(authorId);
        }
        if (cursor) {
          sql += ` AND p.created_at < ?`;
          bindings.push(parseInt(cursor));
        }
        sql += ` ORDER BY p.created_at DESC LIMIT ?`;
        bindings.push(limit + 1); 

        const { results } = await env.DB.prepare(sql).bind(...bindings).all();
        let posts = results;
        let nextCursor = null;
        if (posts.length > limit) {
          posts.pop(); 
          nextCursor = posts[posts.length - 1].created_at;
        }

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
        const preview = content.length > 200 ? content.substring(0, 200) : content;
        await env.DB.prepare(`INSERT INTO posts (id, author_id, content, preview, image_url, category, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(postId, currentUser.id, content, preview, imageUrl, category || 'discussion', tagsStr, now, now).run();
        return jsonResp({ success: true, postId });
      } catch (e) { return jsonResp({ error: e.message }, 500); }
    }

    if (url.pathname.match(/^\/api\/forum\/posts\/[^/]+$/) && method === 'PUT') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return jsonResp({ error: "请先登录" }, 401);
      const postId = url.pathname.split('/')[4];
      const post = await env.DB.prepare("SELECT author_id FROM posts WHERE id = ? AND is_deleted = 0").bind(postId).first();
      if (!post) return jsonResp({ error: "帖子不存在" }, 404);
      const isOwner = post.author_id === currentUser.id;
      const isAdmin = currentUser.role === 'admin' || currentUser.role === 'root';
      if (!isOwner && !isAdmin) return jsonResp({ error: "无权编辑此帖子" }, 403);
      try {
        const { content, imageUrl, category, tags } = await request.json();
        if (!content) return jsonResp({ error: "内容不能为空" }, 400);
        const tagsStr = tags && tags.length ? tags.join(',') : null;
        const preview = content.length > 200 ? content.substring(0, 200) : content;
        await env.DB.prepare(`UPDATE posts SET content = ?, preview = ?, image_url = ?, category = ?, tags = ?, updated_at = ? WHERE id = ?`).bind(content, preview, imageUrl, category || 'discussion', tagsStr, Date.now(), postId).run();
        return jsonResp({ success: true });
      } catch (e) { return jsonResp({ error: e.message }, 500); }
    }

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

    if (url.pathname.match(/^\/api\/forum\/posts\/[^/]+$/) && method === 'GET') {
      const postId = url.pathname.split('/')[4];
      const currentUser = await getCurrentUser(request, env);
      const post = await env.DB.prepare(`SELECT p.*, u.name as author_name, u.role as author_role FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ? AND p.is_deleted = 0`).bind(postId).first();
      if (!post) return jsonResp({ error: "帖子不存在或已删除" }, 404);
      if (currentUser) {
        const liked = await env.DB.prepare("SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?").bind(currentUser.id, postId).first();
        const faved = await env.DB.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND post_id = ?").bind(currentUser.id, postId).first();
        post.likedByMe = !!liked; post.favoritedByMe = !!faved;
      }
      const { results: comments } = await env.DB.prepare(`SELECT c.*, u.name as author_name, u.role as author_role FROM comments c JOIN users u ON c.author_id = u.id WHERE c.post_id = ? AND c.is_deleted = 0 ORDER BY c.created_at ASC`).bind(postId).all();
      return jsonResp({ post, comments });
    }

    if (url.pathname.match(/^\/api\/forum\/posts\/[^/]+\/comments$/) && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return jsonResp({ error: "请先登录" }, 401);
      if (currentUser.is_banned === 1) return jsonResp({ error: "账号已被封禁" }, 403);
      const postId = url.pathname.split('/')[4];
      const { content } = await request.json();
      if (!content) return jsonResp({ error: "评论不能为空" }, 400);
      const commentId = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO comments (id, post_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)`).bind(commentId, postId, currentUser.id, content, Date.now()).run();
      await env.DB.prepare("UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?").bind(postId).run();
      return jsonResp({ success: true, commentId });
    }

    if (url.pathname.match(/^\/api\/forum\/comments\/[^/]+$/) && method === 'DELETE') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return jsonResp({ error: "请先登录" }, 401);
      const commentId = url.pathname.split('/')[4];
      const comment = await env.DB.prepare("SELECT post_id, author_id FROM comments WHERE id = ? AND is_deleted = 0").bind(commentId).first();
      if (!comment) return jsonResp({ error: "评论不存在或已删除" }, 404);
      const isOwner = comment.author_id === currentUser.id;
      const isAdmin = currentUser.role === 'admin' || currentUser.role === 'root';
      const post = await env.DB.prepare("SELECT author_id FROM posts WHERE id = ?").bind(comment.post_id).first();
      const isPostOwner = post && post.author_id === currentUser.id;
      if (!isOwner && !isAdmin && !isPostOwner) return jsonResp({ error: "无权删除此评论" }, 403);
      await env.DB.prepare("UPDATE comments SET is_deleted = 1 WHERE id = ?").bind(commentId).run();
      await env.DB.prepare("UPDATE posts SET comments_count = comments_count - 1 WHERE id = ?").bind(comment.post_id).run();
      return jsonResp({ success: true });
    }

    if (url.pathname.match(/^\/api\/forum\/posts\/[^/]+\/report$/) && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return jsonResp({ error: "请先登录" }, 401);
      const postId = url.pathname.split('/')[4];
      const { reason, detail } = await request.json();
      try {
        await env.DB.prepare(`INSERT INTO reports (id, post_id, reporter_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), postId, currentUser.id, reason, detail || null, Date.now()).run();
        await env.DB.prepare("UPDATE posts SET report_count = report_count + 1 WHERE id = ?").bind(postId).run();
        return jsonResp({ success: true });
      } catch (e) {
        if (e.message.includes("UNIQUE")) return jsonResp({ error: "您已经举报过该帖子了，请勿重复举报" }, 400);
        return jsonResp({ error: "举报失败: " + e.message }, 500);
      }
    }

    if (url.pathname.match(/^\/api\/forum\/comments\/[^/]+\/report$/) && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return jsonResp({ error: "请先登录" }, 401);
      const commentId = url.pathname.split('/')[4];
      const { reason, detail } = await request.json();
      try {
        await env.DB.prepare(`INSERT INTO comment_reports (id, comment_id, reporter_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), commentId, currentUser.id, reason, detail || null, Date.now()).run();
        await env.DB.prepare("UPDATE comments SET report_count = report_count + 1 WHERE id = ?").bind(commentId).run();
        return jsonResp({ success: true });
      } catch (e) {
        if (e.message.includes("UNIQUE")) return jsonResp({ error: "您已经举报过该评论了，请勿重复举报" }, 400);
        return jsonResp({ error: "举报失败: " + e.message }, 500);
      }
    }

    // ================= 5. Wiki 在线编辑 API (预留) =================
    if (url.pathname === '/api/wiki/save' && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return jsonResp({ error: "请先登录" }, 401);
      
      if (currentUser.role === 'user') {
        return jsonResp({ error: "权限不足，仅编者及以上可编辑百科" }, 403);
      }

      try {
        const { filename, content } = await request.json();
        if (!filename || !content) return jsonResp({ error: "文件名或内容不能为空" }, 400);

        const safeFilename = filename.endsWith('.md') ? filename : `${filename}.md`;
        const encodedContent = btoa(unescape(encodeURIComponent(content)));

        let sha = null;
        const getRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/content/${safeFilename}`, {
          headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker' }
        });
        
        if (getRes.ok) {
          const fileData = await getRes.json();
          sha = fileData.sha;
        }

        const putRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/content/${safeFilename}`, {
          method: 'PUT',
          headers: { 
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 
            'Content-Type': 'application/json',
            'User-Agent': 'Cloudflare-Worker'
          },
          body: JSON.stringify({
            message: `Wiki Update: ${safeFilename}`,
            content: encodedContent,
            sha: sha || undefined 
          })
        });

        if (!putRes.ok) {
          const errText = await putRes.text();
          return jsonResp({ error: "GitHub 推送失败: " + errText }, 500);
        }

        if (env.PAGES_DEPLOY_HOOK) {
          ctx.waitUntil(fetch(env.PAGES_DEPLOY_HOOK, { method: 'POST' }));
        }

        return jsonResp({ success: true, message: "已提交至 GitHub，正在重新构建页面..." });

      } catch (e) {
        return jsonResp({ error: "保存失败: " + e.message }, 500);
      }
    }

    if (url.pathname.startsWith('/api/forum/')) {
      return jsonResp({ error: "接口尚未实现" }, 404);
    }

    // 兜底：返回主站的静态资源（包括 /wiki/index.html）
    return env.ASSETS.fetch(request);
  }
};