// public/common.js

// 统一配置 API 基础路径（以后如果改路径，只改这里）
const API_BASE = '/api/auth';

const API = {
  // 发送验证码
  async sendCode(email) {
    const res = await fetch(`${API_BASE}/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return await res.json();
  },

  // 注册
  async register(name, email, password, otp) {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, otp })
    });
    return await res.json();
  },

  // 登录
  async login(email, password) {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return await res.json();
  },

  // 获取当前登录用户信息
  async getMe() {
    const res = await fetch(`${API_BASE}/me`);
    return await res.json();
  }
};