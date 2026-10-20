const API_BASE = '/api/auth';

const API = {
  async sendCode(email) {
    const res = await fetch(`${API_BASE}/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return await res.json();
  },

  async register(name, email, password, otp) {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, otp })
    });
    return await res.json();
  },

  async login(email, password) {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return await res.json();
  },

  async getMe() {
    const res = await fetch(`${API_BASE}/me`);
    return await res.json();
  }
};