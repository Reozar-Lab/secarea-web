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

    // ================= 1. 发送验证码 =================
    if (url.pathname === '/api/auth/send-code' && method === 'POST') {
      try {
        const { email } = await request.json();
        if (!email) return new Response("邮箱不能为空", { status: 400 });
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 10 * 60 * 1000;
        
        await env.DB.prepare("DELETE FROM otp_codes WHERE email = ?").bind(email).run();
        await env.DB.prepare("INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)").bind(email, otp, expiresAt).run();

        // 使用 Resend API 发送邮件
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: 'C.E.C. 密保会 <onboarding@resend.dev>', // Resend 官方测试发件人
            to: [email],
            subject: '【匿境 Secarea】CEC 内部身份认证密文',
            html: `
              <div style="background-color: #f4f4f5; padding: 40px 10px; font-family: sans-serif;">
                  <div style="max-width: 500px; margin: 0 auto; background-color: #1a1a1a; border-radius: 16px; overflow: hidden; border: 1px solid #333;">
                      <div style="height: 4px; background: linear-gradient(90deg, #c89f5d, #f5d78d, #c89f5d);"></div>
                      <div style="padding: 40px 30px; text-align: center;">
                          <h1 style="color: #f5d78d; font-size: 24px; margin: 0 0 10px 0; letter-spacing: 4px;">C.E.C. | 匿境</h1>
                          <p style="color: #888; font-size: 12px; margin: 0 0 30px 0; letter-spacing: 2px;">SECAREA ACCESS TERMINAL</p>
                          <p style="color: #e5e5e5; font-size: 15px; text-align: left; line-height: 1.6; margin-bottom: 20px;">
                              尊敬的觉醒者/沉睡者：<br><br>
                              您正在尝试建立或访问匿境的档案。请使用以下安全密文完成身份验证：
                          </p>
                          <div style="background-color: #0a0a0a; border: 1px solid rgba(245,215,141,0.3); border-radius: 12px; padding: 20px; margin: 30px 0;">
                              <span style="color: #f5d78d; font-size: 36px; font-weight: bold; letter-spacing: 8px; font-family: monospace;">${otp}</span>
                          </div>
                          <p style="color: #666; font-size: 12px; text-align: left; line-height: 1.6;">
                              * 此密文将在 10 分钟后失效。<br>
                              * 如果这不是您本人的操作，请忽略此邮件。<br>
                              * 请勿向任何人泄露此密文。
                          </p>
                      </div>
                  </div>
              </div>
            `
          })
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error('Resend Error:', errText);
          throw new Error('邮件发送失败，请检查 Resend 配置');
        }

        return new Response(JSON.stringify({ success: true, message: "验证码已发送" }), { headers: { "Content-Type": "application/json" } });
      } catch (error) { 
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } }); 
      }
    }

    // ================= 2. 注册账号 =================
    if (url.pathname === '/api/auth/register' && method === 'POST') {
      try {
        const { name, email, password, otp } = await request.json();
        const record = await env.DB.prepare("SELECT * FROM otp_codes WHERE email = ? AND code = ?").bind(email, otp).first();
        if (!record || record.expires_at < Date.now()) return new Response(JSON.stringify({ error: "验证码错误或已过期" }), { status: 400, headers: { "Content-Type": "application/json" } });
        const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (existingUser) return new Response(JSON.stringify({ error: "该邮箱已被注册" }), { status: 400, headers: { "Content-Type": "application/json" } });

        const salt = env.BETTER_AUTH_SECRET;
        const msgBuffer = new TextEncoder().encode(password + salt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashedPassword = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        const userId = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)").bind(userId, name, email, hashedPassword).run();
        await env.DB.prepare("DELETE FROM otp_codes WHERE email = ?").bind(email).run();
        return new Response(JSON.stringify({ success: true, message: "注册成功" }), { headers: { "Content-Type": "application/json" } });
      } catch (error) { return new Response(JSON.stringify({ error: "注册失败" }), { status: 500, headers: { "Content-Type": "application/json" } }); }
    }

    // ================= 3. 登录 =================
    if (url.pathname === '/api/auth/login' && method === 'POST') {
      try {
        const { email, password } = await request.json();
        const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
        if (!user) return new Response(JSON.stringify({ error: "邮箱或密码错误" }), { status: 401, headers: { "Content-Type": "application/json" } });

        const salt = env.BETTER_AUTH_SECRET;
        const msgBuffer = new TextEncoder().encode(password + salt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashedPassword = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        if (hashedPassword !== user.password) return new Response(JSON.stringify({ error: "邮箱或密码错误" }), { status: 401, headers: { "Content-Type": "application/json" } });

        const sessionToken = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").bind(sessionToken, user.id, Date.now() + 30 * 24 * 60 * 60 * 1000).run();
        return new Response(JSON.stringify({ success: true, message: "登录成功" }), { headers: { "Content-Type": "application/json", "Set-Cookie": `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${30*24*60*60}` } });
      } catch (error) { return new Response(JSON.stringify({ error: "登录失败" }), { status: 500, headers: { "Content-Type": "application/json" } }); }
    }

    // ================= 3.5 忘记密码重置 =================
    if (url.pathname === '/api/auth/reset-password' && method === 'POST') {
      try {
        const { email, otp, newPassword } = await request.json();
        
        const record = await env.DB.prepare("SELECT * FROM otp_codes WHERE email = ? AND code = ?").bind(email, otp).first();
        if (!record || record.expires_at < Date.now()) return new Response(JSON.stringify({ error: "验证码错误或已过期" }), { status: 400, headers: { "Content-Type": "application/json" } });

        const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (!user) return new Response(JSON.stringify({ error: "该邮箱未注册" }), { status: 404, headers: { "Content-Type": "application/json" } });

        const salt = env.BETTER_AUTH_SECRET;
        const msgBuffer = new TextEncoder().encode(newPassword + salt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashedPassword = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        await env.DB.prepare("UPDATE users SET password = ? WHERE id = ?").bind(hashedPassword, user.id).run();
        await env.DB.prepare("DELETE FROM otp_codes WHERE email = ?").bind(email).run();

        return new Response(JSON.stringify({ success: true, message: "密码重置成功" }), { headers: { "Content-Type": "application/json" } });
      } catch (error) { return new Response(JSON.stringify({ error: "重置失败" }), { status: 500, headers: { "Content-Type": "application/json" } }); }
    }

    // ================= 4. 退出登录 =================
    if (url.pathname === '/api/auth/logout' && method === 'POST') {
      const cookieHeader = request.headers.get('Cookie');
      if (cookieHeader) {
        const match = cookieHeader.match(/session=([^;]+)/);
        if (match) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(match[1]).run();
      }
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": "session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" } });
    }

    // ================= 5. 获取当前用户 =================
    if (url.pathname === '/api/auth/me' && method === 'GET') {
      const user = await getCurrentUser(request, env);
      return new Response(JSON.stringify({ user: user }), { headers: { "Content-Type": "application/json" } });
    }

    // ================= 6. 账号安全：修改密码 =================
    if (url.pathname === '/api/auth/change-password' && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return new Response(JSON.stringify({ error: "未登录" }), { status: 401 });
      const { oldPassword, newPassword } = await request.json();
      const user = await env.DB.prepare("SELECT password FROM users WHERE id = ?").bind(currentUser.id).first();
      const salt = env.BETTER_AUTH_SECRET;
      const msgBufferOld = new TextEncoder().encode(oldPassword + salt);
      const hashBufferOld = await crypto.subtle.digest('SHA-256', msgBufferOld);
      const hashedOld = Array.from(new Uint8Array(hashBufferOld)).map(b => b.toString(16).padStart(2, '0')).join('');
      
      if (hashedOld !== user.password) return new Response(JSON.stringify({ error: "原密码错误" }), { status: 400 });
      
      const msgBufferNew = new TextEncoder().encode(newPassword + salt);
      const hashBufferNew = await crypto.subtle.digest('SHA-256', msgBufferNew);
      const hashedNew = Array.from(new Uint8Array(hashBufferNew)).map(b => b.toString(16).padStart(2, '0')).join('');
      await env.DB.prepare("UPDATE users SET password = ? WHERE id = ?").bind(hashedNew, currentUser.id).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    // ================= 7. 账号安全：修改邮箱 =================
    if (url.pathname === '/api/auth/change-email' && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return new Response(JSON.stringify({ error: "未登录" }), { status: 401 });
      const { newEmail, otp } = await request.json();
      const record = await env.DB.prepare("SELECT * FROM otp_codes WHERE email = ? AND code = ?").bind(newEmail, otp).first();
      if (!record || record.expires_at < Date.now()) return new Response(JSON.stringify({ error: "验证码错误或已过期" }), { status: 400 });
      const exist = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(newEmail).first();
      if (exist) return new Response(JSON.stringify({ error: "该邮箱已被占用" }), { status: 400 });
      await env.DB.prepare("UPDATE users SET email = ? WHERE id = ?").bind(newEmail, currentUser.id).run();
      await env.DB.prepare("DELETE FROM otp_codes WHERE email = ?").bind(newEmail).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    // ================= 8. 账号安全：注销账号 =================
    if (url.pathname === '/api/auth/delete-account' && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser) return new Response(JSON.stringify({ error: "未登录" }), { status: 401 });
      await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(currentUser.id).run();
      await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(currentUser.id).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": "session=; Path=/; Max-Age=0" } });
    }

    // ================= 9. 管理员接口：获取所有用户 =================
    if (url.pathname === '/api/admin/users' && method === 'GET') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser || (currentUser.role !== 'creator' && currentUser.role !== 'editor')) {
        return new Response(JSON.stringify({ error: "权限不足" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
      const { results } = await env.DB.prepare("SELECT id, name, email, role, is_banned FROM users ORDER BY created_at DESC").all();
      return new Response(JSON.stringify({ users: results }), { headers: { "Content-Type": "application/json" } });
    }

    // ================= 10. 管理员接口：修改用户状态 =================
    if (url.pathname === '/api/admin/update-user' && method === 'POST') {
      const currentUser = await getCurrentUser(request, env);
      if (!currentUser || (currentUser.role !== 'creator' && currentUser.role !== 'editor')) {
        return new Response(JSON.stringify({ error: "权限不足" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
      
      const { targetUserId, newRole, newBanStatus } = await request.json();
      
      // 1. 不能操作自己
      if (targetUserId === currentUser.id) {
          return new Response(JSON.stringify({ error: "你不能修改自己的状态" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      // 2. 获取目标用户
      const targetUser = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(targetUserId).first();
      if (!targetUser) return new Response(JSON.stringify({ error: "用户不存在" }), { status: 404 });

      // 3. 越级限制
      if (currentUser.role === 'creator' && targetUser.role === 'creator') {
          return new Response(JSON.stringify({ error: "不能修改同级 Creator 的权限" }), { status: 403 });
      }
      if (currentUser.role === 'editor' && (targetUser.role === 'creator' || targetUser.role === 'editor')) {
          return new Response(JSON.stringify({ error: "编者只能修改普通用户" }), { status: 403 });
      }

      // 4. 越级提升限制
      if (newRole === 'creator' && currentUser.role !== 'creator') {
          return new Response(JSON.stringify({ error: "只有 Creator 可以任命 Creator" }), { status: 403 });
      }

      if (newRole !== undefined && newRole !== null) {
          await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(newRole, targetUserId).run();
      }
      if (newBanStatus !== undefined && newBanStatus !== null) {
          await env.DB.prepare("UPDATE users SET is_banned = ? WHERE id = ?").bind(newBanStatus, targetUserId).run();
      }

      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    // ================= 兜底：静态页面 =================
    return env.ASSETS.fetch(request);
  }
};