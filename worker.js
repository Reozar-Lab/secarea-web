import { Hono } from 'https://esm.sh/hono@4.1.7';
import { betterAuth } from 'https://esm.sh/better-auth@0.3.5';
import { emailOTP } from 'https://esm.sh/better-auth@0.3.5/plugins';

const app = new Hono();

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
                    if (!res.ok) throw new Error('邮件发送失败');
                }
            })
        ]
    });
    return auth.handler(c.req.raw);
});

// 仅作为静态资源匹配失败时的最终兜底
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;