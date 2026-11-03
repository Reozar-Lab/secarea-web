import { getCurrentUser, jsonResp } from './utils.js';

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

  // ================= 管理模块 =================
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

  // 如果没有任何匹配，返回 null，让主入口去往下找
  return null;
}
