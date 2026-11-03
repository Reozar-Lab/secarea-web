import { getCurrentUser, verifyAuth, jsonResp } from './utils.js';

export async function handleAuth(request, env, url) {
  const method = request.method;

  // ================= 认证模块 =================
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
      if (user.is_banned === 1) return jsonResp({ error: "该账号已被封禁" }, 403);

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

  // ================= 账号安全 (补全之前漏掉的接口) =================
  if (url.pathname === '/api/auth/change-password' && method === 'POST') {
    const auth = await verifyAuth(request, env);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    
    const { oldPassword, newPassword } = await request.json();
    const user = await env.DB.prepare("SELECT password FROM users WHERE id = ?").bind(auth.user.id).first();
    
    const msgBufferOld = new TextEncoder().encode(oldPassword + env.BETTER_AUTH_SECRET);
    const hashBufferOld = await crypto.subtle.digest('SHA-256', msgBufferOld);
    const hashedOld = Array.from(new Uint8Array(hashBufferOld)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    if (hashedOld !== user.password) return jsonResp({ error: "当前密码错误" }, 400);

    const msgBuffer = new TextEncoder().encode(newPassword + env.BETTER_AUTH_SECRET);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashedNew = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    await env.DB.prepare("UPDATE users SET password = ? WHERE id = ?").bind(hashedNew, auth.user.id).run();
    return jsonResp({ success: true });
  }

  if (url.pathname === '/api/auth/change-email' && method === 'POST') {
    const auth = await verifyAuth(request, env);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    
    const { newEmail, otp } = await request.json();
    const record = await env.DB.prepare("SELECT * FROM otp_codes WHERE email = ? AND code = ?").bind(newEmail, otp).first();
    if (!record || record.expires_at < Date.now()) return jsonResp({ error: "验证码错误" }, 400);
    
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(newEmail).first();
    if (existing) return jsonResp({ error: "该邮箱已被注册" }, 400);

    await env.DB.prepare("UPDATE users SET email = ? WHERE id = ?").bind(newEmail, auth.user.id).run();
    await env.DB.prepare("DELETE FROM otp_codes WHERE email = ?").bind(newEmail).run();
    return jsonResp({ success: true });
  }

  if (url.pathname === '/api/auth/delete-account' && method === 'POST') {
    const auth = await verifyAuth(request, env);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(auth.user.id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": "session=; Path=/; Max-Age=0" } });
  }

  // ================= 管理模块 (用 verifyAuth 拦截被封禁的 Admin) =================
  if (url.pathname === '/api/admin/users' && method === 'GET') {
    const auth = await verifyAuth(request, env, ['root', 'admin']);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    
    const { results } = await env.DB.prepare("SELECT id, name, email, role, is_banned FROM users ORDER BY created_at DESC").all();
    return jsonResp({ users: results });
  }
  
  if (url.pathname === '/api/admin/update-user' && method === 'POST') {
    const auth = await verifyAuth(request, env, ['root', 'admin']);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    const currentUser = auth.user;
    
    const { targetUserId, newRole, newBanStatus } = await request.json();
    if (targetUserId === currentUser.id) return jsonResp({ error: "不能修改自己" }, 400);
    if (newRole) await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(newRole, targetUserId).run();
    if (newBanStatus !== undefined && newBanStatus !== null) await env.DB.prepare("UPDATE users SET is_banned = ? WHERE id = ?").bind(newBanStatus, targetUserId).run();
    return jsonResp({ success: true });
  }

  if (url.pathname === '/api/admin/reports' && method === 'GET') {
    const auth = await verifyAuth(request, env, ['root', 'admin']);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    
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
    const auth = await verifyAuth(request, env, ['root', 'admin']);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    
    const { postId } = await request.json();
    await env.DB.prepare("UPDATE reports SET status = 'dismissed' WHERE post_id = ? AND status = 'pending'").bind(postId).run();
    await env.DB.prepare("UPDATE posts SET report_count = 0 WHERE id = ?").bind(postId).run();
    return jsonResp({ success: true });
  }

  if (url.pathname === '/api/admin/reports/delete-post' && method === 'POST') {
    const auth = await verifyAuth(request, env, ['root', 'admin']);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    
    const { postId } = await request.json();
    await env.DB.prepare("UPDATE posts SET is_deleted = 1, deleted_by = ? WHERE id = ?").bind(auth.user.id, postId).run();
    await env.DB.prepare("UPDATE reports SET status = 'resolved', resolved_by = ? WHERE post_id = ? AND status = 'pending'").bind(auth.user.id, postId).run();
    return jsonResp({ success: true });
  }

  if (url.pathname === '/api/admin/settings' && method === 'POST') {
    const auth = await verifyAuth(request, env, ['root', 'admin']);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    
    const { key, value } = await request.json();
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, String(value)).run();
    return jsonResp({ success: true });
  }

  return null;
}