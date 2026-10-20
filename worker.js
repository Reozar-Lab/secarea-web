export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    // ================= 1. 发送邮箱验证码 =================
    if (url.pathname === '/api/auth/send-code' && method === 'POST') {
      try {
        const { email } = await request.json();
        if (!email) return new Response("邮箱不能为空", { status: 400 });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 10 * 60 * 1000;

        await env.DB.prepare("DELETE FROM otp_codes WHERE email = ?").bind(email).run();
        await env.DB.prepare("INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)")
          .bind(email, otp, expiresAt).run();

        const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: env.EMAILJS_SERVICE_ID,
            template_id: env.EMAILJS_TEMPLATE_ID,
            user_id: env.EMAILJS_PUBLIC_KEY,
            template_params: { to_email: email, otp: otp }
          })
        });

        if (!res.ok) throw new Error(await res.text());

        return new Response(JSON.stringify({ success: true, message: "验证码已发送" }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // ================= 2. 注册账号 =================
    if (url.pathname === '/api/auth/register' && method === 'POST') {
      try {
        const { name, email, password, otp } = await request.json();

        const record = await env.DB.prepare("SELECT * FROM otp_codes WHERE email = ? AND code = ?").bind(email, otp).first();
        if (!record || record.expires_at < Date.now()) {
          return new Response(JSON.stringify({ error: "验证码错误或已过期" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (existingUser) {
          return new Response(JSON.stringify({ error: "该邮箱已被注册" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        const salt = env.BETTER_AUTH_SECRET;
        const msgBuffer = new TextEncoder().encode(password + salt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashedPassword = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const userId = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)")
          .bind(userId, name, email, hashedPassword).run();

        await env.DB.prepare("DELETE FROM otp_codes WHERE email = ?").bind(email).run();

        return new Response(JSON.stringify({ success: true, message: "注册成功" }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: "注册失败，请稍后重试" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // ================= 3. 登录账号 =================
    if (url.pathname === '/api/auth/login' && method === 'POST') {
      try {
        const { email, password } = await request.json();

        const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
        if (!user) {
          return new Response(JSON.stringify({ error: "邮箱或密码错误" }), { status: 401, headers: { "Content-Type": "application/json" } });
        }

        const salt = env.BETTER_AUTH_SECRET;
        const msgBuffer = new TextEncoder().encode(password + salt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashedPassword = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (hashedPassword !== user.password) {
          return new Response(JSON.stringify({ error: "邮箱或密码错误" }), { status: 401, headers: { "Content-Type": "application/json" } });
        }

        const sessionToken = crypto.randomUUID();
        const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
        await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
          .bind(sessionToken, user.id, expiresAt).run();

        return new Response(JSON.stringify({ success: true, message: "登录成功" }), {
          headers: { 
            "Content-Type": "application/json",
            "Set-Cookie": `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${30*24*60*60}`
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: "登录失败" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // ================= 4. 退出登录 (新增) =================
    if (url.pathname === '/api/auth/logout' && method === 'POST') {
      try {
        const cookieHeader = request.headers.get('Cookie');
        if (cookieHeader) {
          const match = cookieHeader.match(/session=([^;]+)/);
          if (match) {
            const sessionToken = match[1];
            await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(sessionToken).run();
          }
        }
        
        return new Response(JSON.stringify({ success: true, message: "退出成功" }), {
          headers: { 
            "Content-Type": "application/json",
            "Set-Cookie": "session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: "退出失败" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // ================= 5. 检查当前登录状态 =================
    if (url.pathname === '/api/auth/me' && method === 'GET') {
      const cookieHeader = request.headers.get('Cookie');
      if (!cookieHeader) return new Response(JSON.stringify({ user: null }), { headers: { "Content-Type": "application/json" } });
      
      const match = cookieHeader.match(/session=([^;]+)/);
      if (!match) return new Response(JSON.stringify({ user: null }), { headers: { "Content-Type": "application/json" } });
      
      const sessionToken = match[1];
      const session = await env.DB.prepare("SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ?")
        .bind(sessionToken, Date.now()).first();

      return new Response(JSON.stringify({ user: session || null }), { headers: { "Content-Type": "application/json" } });
    }

    // ================= 兜底：静态页面 =================
    return env.ASSETS.fetch(request);
  }
};