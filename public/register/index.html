import { Hono } from 'https://esm.sh/hono@4.1.7';
import { betterAuth } from 'https://esm.sh/better-auth@0.3.5';
import { emailOTP } from 'https://esm.sh/better-auth@0.3.5/plugins';

const app = new Hono();

// 挂载 Better Auth 认证路由
app.on(['POST', 'GET'], '/api/auth/*', async (c) => {
  const auth = betterAuth({
    database: c.env.DB, // 绑定的 D1 数据库
    secret: "secarea_2026_super_secret_key_change_me", // ⚠️ 请换成你自己的随机字符串
    baseURL: "https://secarea.de5.net", // ⚠️ 换成你的线上域名或 workers.dev 域名
    basePath: "/api/auth",
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // 我们通过 OTP 验证，不使用传统的邮件链接
    },
    plugins: [
            emailOTP({
        async sendVerificationOTP({ email, otp }) {
          // 1. 组装 EmailJS 需要的数据
          const payload = {
            service_id: c.env.EMAILJS_SERVICE_ID,
            template_id: c.env.EMAILJS_TEMPLATE_ID,
            user_id: c.env.EMAILJS_PUBLIC_KEY,
            template_params: {
              to_email: email,
              otp: otp
            }
          };

          // 2. 发送请求给 EmailJS
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