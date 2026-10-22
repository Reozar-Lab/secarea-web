export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    async function getCurrentUser(request, env) {
      const cookieHeader = request.headers.get('Cookie');
      if (!cookieHeader) return null;
      const match = cookieHeader.match(/session=([^;]+)/);
      if (!match) return null;
      return await env.DB.prepare(`
          SELECT u.id, u.name, u.email, u.role, u.is_banned 
          FROM sessions s JOIN users u ON s.user_id = u.id 
          WHERE s.token = ? AND s.expires_at > ?
      `).bind(match[1], Date.now()).first() || null;
    }

    if (url.pathname === '/api/auth/send-code' && method === 'POST') {
      try {
        const { email } = await request.json();
        if (!email) return new Response("邮箱不能为空", { status: 400 });
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await env.DB.prepare("DELETE FROM otp_codes WHERE email = ?").bind(email).run();
        await env.DB.prepare("INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)").bind(email, otp, Date.now() + 600000).run();
        
        await new Promise(resolve => setTimeout(resolve, 1000)); // 防封延迟
        const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          body: JSON.stringify({ service_id: env.EMAILJS_SERVICE_ID, template_id: env.EMAILJS_TEMPLATE_ID, user_id: env.EMAILJS_PUBLIC_KEY, template_params: { to_email: email, otp } })
        });
        if (!res.ok) throw new Error('邮件发送失败');
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      } catch (error) { return new Response(JSON.stringify({ error: error.message }), { status: 500 }); }
    }

    if (url.pathname === '/api/auth/register' && method === 'POST') {
      try {
        const { name, email, password, otp } = await request.json();
        const record = await env.DB.prepare("SELECT * FROM otp_codes WHERE email = ? AND code = ?").bind(email, otp).first();
        if (!record || record.expires_at < Date.now()) return new Response(JSON.stringify({ error: "验证码错误或已过期" }), { status: 400 });
        const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (existingUser) return new Response(JSON.stringify({ error: "该邮箱已被注册" }), { status: 400 });

        const salt = env.BETTER_AUTH_SECRET;
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password + salt));
        const hashedPassword = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        await env.DB.prepare("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, 'user')").bind(crypto.randomUUID(), name, email, hashedPassword).run();
        await env.DB.prepare("DELETE FROM otp_codes WHERE email = ?").bind(email).run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      } catch (error) { return new Response(JSON.stringify({ error: "注册失败" }), { status: 500 }); }
    }

    if (url.pathname === '/api/auth/login' && method === 'POST') {
      try {
        const { email, password } = await request.json();
        const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
        if (!user) return new Response(JSON.stringify({ error: "邮箱或密码错误" }), { status: 401 });

        const salt = env.BETTER_AUTH_SECRET;
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password + salt));
        const hashedPassword = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        if (hashedPassword !== user.password) return new Response(JSON.stringify({ error: "邮箱或密码错误" }), { status: 401 });

        const sessionToken = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").bind(sessionToken, user.id, Date.now() + 2592000000).run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000` } });
      } catch (error) { return new Response(JSON.stringify({ error: "登录失败" }), { status: 500 }); }
    }

    if (url.pathname === '/api/auth/reset-password' && method === 'POST') {
      try {
        const { email, otp, newPassword } = await request.json();
        const record = await env.DB.prepare("SELECT * FROM otp_codes WHERE email = ? AND code = ?").bind(email, otp).first();
        if (!record || record.expires_at < Date.now()) return new Response(JSON.stringify({ error: "验证码错误或已过期" }), { status: 400 });
        const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (!user) return new Response(JSON.stringify({ error: "该邮箱未注册" }), { status: 404 });

        const salt = env.BETTER_AUTH_SECRET;
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(newPassword + salt));
        const hashedPassword = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        await env.DB.prepare("UPDATE users SET password = ? WHERE id = ?").bind(hashedPassword, user.id).run();
        await env.DB.prepare("DELETE FROM otp_codes WHERE email = ?").bind(email).run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      } catch (error) { return new Response(JSON.stringify({ error: "重置失败" }), { status: 500 }); }
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
      const user = await getCurrentUser(request, env);
      return new Response(JSON.stringify({ user }), { headers: { "Content-Type": "application/json" } });
    }

    // ================= 账号安全接口 =================
    if (url.pathname === '/api/auth/change-password' && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return new Response(JSON.stringify({ error: "未登录" }), { status: 401 });
      const { oldPassword, newPassword } = await request.json();
      const user = await env.DB.prepare("SELECT password FROM users WHERE id = ?").bind(currentUser.id).first();
      const salt = env.BETTER_AUTH_SECRET;
      const hashOld = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(oldPassword + salt)))).map(b => b.toString(16).padStart(2, '0')).join('');
      if (hashOld !== user.password) return new Response(JSON.stringify({ error: "原密码错误" }), { status: 400 });
      const hashNew = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(newPassword + salt)))).map(b => b.toString(16).padStart(2, '0')).join('');
      await env.DB.prepare("UPDATE users SET password = ? WHERE id = ?").bind(hashNew, currentUser.id).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === '/api/auth/change-email' && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return new Response(JSON.stringify({ error: "未登录" }), { status: 401 });
      const { newEmail, otp } = await request.json();
      const record = await env.DB.prepare("SELECT * FROM otp_codes WHERE email = ? AND code = ?").bind(newEmail, otp).first();
      if (!record || record.expires_at < Date.now()) return new Response(JSON.stringify({ error: "验证码错误" }), { status: 400 });
      const exist = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(newEmail).first();
      if (exist) return new Response(JSON.stringify({ error: "该邮箱已被占用" }), { status: 400 });
      await env.DB.prepare("UPDATE users SET email = ? WHERE id = ?").bind(newEmail, currentUser.id).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === '/api/auth/delete-account' && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return new Response(JSON.stringify({ error: "未登录" }), { status: 401 });
      await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(currentUser.id).run();
      await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(currentUser.id).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": "session=; Path=/; Max-Age=0" } });
    }

    // ================= 管理员接口 =================
    if (url.pathname === '/api/admin/users' && method === 'GET') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser || (currentUser.role !== 'root' && currentUser.role !== 'admin')) {
        return new Response(JSON.stringify({ error: "权限不足" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
      const { results } = await env.DB.prepare("SELECT id, name, email, role, is_banned FROM users ORDER BY created_at DESC").all();
      return new Response(JSON.stringify({ users: results }), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === '/api/admin/update-user' && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser || (currentUser.role !== 'root' && currentUser.role !== 'admin')) {
        return new Response(JSON.stringify({ error: "权限不足" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
      
      const { targetUserId, newRole, newBanStatus } = await request.json();
      
      if (targetUserId === currentUser.id) return new Response(JSON.stringify({ error: "你不能修改自己的状态" }), { status: 400 });

      const targetUser = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(targetUserId).first();
      if (!targetUser) return new Response(JSON.stringify({ error: "用户不存在" }), { status: 404 });

      // Admin 权限限制
      if (currentUser.role === 'admin') {
          if (targetUser.role === 'root' || targetUser.role === 'admin') return new Response(JSON.stringify({ error: "你无权修改同级或最高权限者" }), { status: 403 });
          if (newRole === 'root' || newRole === 'admin') return new Response(JSON.stringify({ error: "管理员只能任命编者" }), { status: 403 });
      }

      // Root 权限限制
      if (currentUser.role === 'root') {
          if (targetUser.role === 'root') return new Response(JSON.stringify({ error: "不能修改同为 Root 的权限" }), { status: 403 });
      }

      if (newRole) await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(newRole, targetUserId).run();
      if (newBanStatus !== undefined && newBanStatus !== null) await env.DB.prepare("UPDATE users SET is_banned = ? WHERE id = ?").bind(newBanStatus, targetUserId).run();

      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    return env.ASSETS.fetch(request);
  }
};