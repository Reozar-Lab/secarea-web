const API_BASE = '/api/auth';

// 动态创建 Toast 容器
const toastContainer = document.createElement('div');
toastContainer.id = 'toast-container';
toastContainer.className = 'fixed top-16 left-1/2 transform -translate-x-1/2 z-[10000] flex flex-col gap-2 pointer-events-none w-[90%] max-w-sm';
document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(toastContainer);
});

// 全局提示函数
function showToast(message, type = 'info') {
    if (!document.getElementById('toast-container')) {
        document.body.appendChild(toastContainer);
    }
    
    const borderColor = type === 'error' ? 'border-red-500' : (type === 'success' ? 'border-[#f5d78d]' : 'border-gray-500');
    const textColor = type === 'error' ? 'text-red-400' : (type === 'success' ? 'text-[#f5d78d]' : 'text-white');
    
    const toast = document.createElement('div');
    toast.className = `bg-[#1a1a1a]/95 backdrop-blur-md px-6 py-4 rounded-xl shadow-2xl border ${borderColor} text-sm font-sans tracking-widest transition-all duration-300 opacity-0 translate-y-[-10px] pointer-events-auto text-center ${textColor}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // 入场动画
    setTimeout(() => toast.classList.remove('opacity-0', 'translate-y-[-10px]'), 10);

    // 3秒后消失
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-[-10px]');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

const API = {
  async sendCode(email) {
    try {
      const res = await fetch(`${API_BASE}/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (data.error) showToast(data.error, 'error');
      else showToast('验证码已发送至您的邮箱', 'success');
      return data;
    } catch (e) {
      showToast("网络请求失败", "error");
      throw e;
    }
  },

  async register(name, email, password, otp) {
    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, otp })
      });
      const data = await res.json();
      if (data.error) showToast(data.error, 'error');
      else {
          // 注册成功后记录闪存消息，跳转后提示
          sessionStorage.setItem('flash_message', '档案建立成功，请登录');
          showToast('档案建立成功', 'success');
      }
      return data;
    } catch (e) {
      showToast("网络请求失败", "error");
      throw e;
    }
  },

  async login(email, password) {
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.error) {
        showToast("邮箱或密码错误", "error");
      } else {
        // 登录成功，记录闪存消息，跳转后首页会展示
        sessionStorage.setItem('flash_message', '身份验证通过，欢迎进入内界');
      }
      return data;
    } catch (e) {
      showToast("网络请求失败", "error");
      throw e;
    }
  },

  async getMe() {
    const res = await fetch(`${API_BASE}/me`);
    return await res.json();
  },

  async logout() {
    const res = await fetch(`${API_BASE}/logout`, {
      method: 'POST'
    });
    return await res.json();
  }
};