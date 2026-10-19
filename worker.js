import { Hono } from 'hono';
import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';

const app = new Hono();

// 认证 API 路由
app.on(['POST', 'GET'], '/api/auth/*', async (c) => {
    const auth = betterAuth({
        database: c.env.DB,
        secret: c.env.BETTER_AUTH_SECRET || "secarea_fallback_secret_key_123456",
        baseURL: c.env.BASE_URL || "http://localhost:8787",
        basePath: "/api/auth",
        emailAndPassword: { enabled: true, requireEmailVerification: false },
        plugins: [
            emailOTP({
                async sendVerificationOTP({ email, otp }) {
                    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            service_id: c.env.EMAILJS_SERVICE_ID,
                            template_id: c.env.EMAILJS_TEMPLATE_ID,
                            user_id: c.env.EMAILJS_PUBLIC_KEY,
                            template_params: { to_email: email, otp: otp }
                        })
                    });
                    if (!res.ok) {
                        console.error('EmailJS error:', await res.text());
                        throw new Error('邮件发送失败');
                    }
                }
            })
        ]
    });
    return auth.handler(c.req.raw);
});

// 静态资源兜底
app.get('*', (c) => {
    if (!c.env.ASSETS) {
        return c.text("【部署警告】Cloudflare 未检测到静态资源目录，请检查 public 文件夹及 wrangler.toml 配置。", 500);
    }
    return c.env.ASSETS.fetch(c.req.raw);
});

export default app;