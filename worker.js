import { Hono } from 'npm:hono@4.1.7';
import { betterAuth } from 'npm:better-auth@0.3.5';
import { emailOTP } from 'npm:better-auth@0.3.5/plugins';

const app = new Hono();

// 挂载认证 API
app.on(['POST', 'GET'], '/api/auth/*', async (c) => {
    const auth = betterAuth({
        database: c.env.DB,
        secret: c.env.BETTER_AUTH_SECRET,
        baseURL: c.env.BASE_URL,
        basePath: "/api/auth",
        emailAndPassword: { enabled: true, requireEmailVerification: false },
        plugins: [
            emailOTP({
                async sendVerificationOTP({ email, otp }) {
                    // 调用 EmailJS 发送真实邮件
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
                        console.error('EmailJS 发送失败:', await res.text());
                        throw new Error('邮件发送失败');
                    }
                }
            })
        ]
    });
    return auth.handler(c.req.raw);
});

// 静态页面兜底
app.get('*', (c) => {
    return c.env.ASSETS.fetch(c.req.raw);
});

export default app;