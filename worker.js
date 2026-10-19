import { Hono } from 'https://esm.sh/hono@4.1.7';
import { betterAuth } from 'https://esm.sh/better-auth@0.3.5';
import { emailOTP } from 'https://esm.sh/better-auth@0.3.5/plugins';

const app = new Hono();

// 挂载 Better Auth 认证路由
app.on(['POST', 'GET'], '/api/auth/*', async (c) => {
    const auth = betterAuth({
        database: c.env.DB, 
        // ⚠️ 在环境变量配置 BETTER_AUTH_SECRET
        secret: c.env.BETTER_AUTH_SECRET || "secarea_fallback_secret_key_123456", 
        // ⚠️ 在环境变量配置 BASE_URL (比如 https://secarea.de5.net)
        baseURL: c.env.BASE_URL || "http://localhost:8787", 
        basePath: "/api/auth",
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: false, 
        },
        plugins: [
            emailOTP({
                async sendVerificationOTP({ email, otp }) {
                    const payload = {
                        service_id: c.env.EMAILJS_SERVICE_ID,
                        template_id: c.env.EMAILJS_TEMPLATE_ID,
                        user_id: c.env.EMAILJS_PUBLIC_KEY,
                        template_params: {
                            to_email: email,
                            otp: otp
                        }
                    };

                    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    });

                    if (!res.ok) {
                        console.error('EmailJS 报错:', await res.text());
                        throw new Error('邮件发送失败，请检查 EmailJS 配置');
                    }
                }
            })
        ]
    });
    
    return auth.handler(c.req.raw);
});

// 静态资源兜底
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;