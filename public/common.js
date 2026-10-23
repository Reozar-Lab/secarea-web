const API_BASE = '/api/auth';

const toastContainer = document.createElement('div');
toastContainer.id = 'toast-container';
toastContainer.className = 'fixed top-16 left-1/2 transform -translate-x-1/2 z-[10000] flex flex-col gap-2 pointer-events-none w-[90%] max-w-sm';
document.addEventListener('DOMContentLoaded', () => { document.body.appendChild(toastContainer); });

function showToast(message, type = 'info') {
    if (!document.getElementById('toast-container')) document.body.appendChild(toastContainer);
    const borderColor = type === 'error' ? 'border-red-500' : (type === 'success' ? 'border-[#f5d78d]' : 'border-gray-500');
    const textColor = type === 'error' ? 'text-red-400' : (type === 'success' ? 'text-[#f5d78d]' : 'text-white');
    const toast = document.createElement('div');
    toast.className = `bg-[#1a1a1a]/95 backdrop-blur-md px-6 py-4 rounded-xl shadow-2xl border ${borderColor} text-sm font-sans tracking-widest transition-all duration-300 opacity-0 translate-y-[-10px] pointer-events-auto text-center ${textColor}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.remove('opacity-0', 'translate-y-[-10px]'), 10);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-[-10px]');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

const API = {
  // ================= 认证模块 =================
  async sendCode(email) {
    try {
      const res = await fetch(`${API_BASE}/send-code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (data.error) showToast(data.error, 'error'); else showToast('验证码已发送至您的邮箱', 'success');
      return data;
    } catch (e) { showToast("网络请求失败", "error"); throw e; }
  },

  async register(name, email, password, otp) {
    try {
      const res = await fetch(`${API_BASE}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password, otp }) });
      const data = await res.json();
      if (data.error) showToast(data.error, 'error');
      else { sessionStorage.setItem('flash_message', '档案建立成功，请登录'); showToast('档案建立成功', 'success'); }
      return data;
    } catch (e) { showToast("网络请求失败", "error"); throw e; }
  },

  async login(email, password) {
    try {
      const res = await fetch(`${API_BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (data.error) showToast(data.error, "error");
      else sessionStorage.setItem('flash_message', '身份验证通过，欢迎进入内界');
      return data;
    } catch (e) { showToast("网络请求失败", "error"); throw e; }
  },

  async resetPassword(email, otp, newPassword) {
    try {
      const res = await fetch(`${API_BASE}/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, otp, newPassword }) });
      const data = await res.json();
      if (data.error) showToast(data.error, 'error');
      else showToast('密码重置成功，请重新登录', 'success');
      return data;
    } catch (e) { showToast("网络请求失败", "error"); throw e; }
  },

  async getMe() {
    const res = await fetch(`${API_BASE}/me`);
    return await res.json();
  },

  async logout() {
    const res = await fetch(`${API_BASE}/logout`, { method: 'POST' });
    return await res.json();
  },

  // ================= 账号安全模块 =================
  async changePassword(oldPassword, newPassword) {
    const res = await fetch(`${API_BASE}/change-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPassword, newPassword }) });
    return await res.json();
  },

  async changeEmail(newEmail, otp) {
    const res = await fetch(`${API_BASE}/change-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newEmail, otp }) });
    return await res.json();
  },

  async deleteAccount() {
    const res = await fetch(`${API_BASE}/delete-account`, { method: 'POST' });
    return await res.json();
  },

  // ================= 管理员模块 =================
  async getUsers() {
    const res = await fetch(`/api/admin/users`);
    return await res.json();
  },

  async updateUser(targetUserId, newRole, newBanStatus) {
    const res = await fetch(`/api/admin/update-user`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId, newRole, newBanStatus })
    });
    return await res.json();
  },

  // 举报管理
  async getReports() {
    const res = await fetch(`/api/admin/reports`);
    return await res.json();
  },

  async dismissReports(postId) {
    const res = await fetch(`/api/admin/reports/dismiss`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId })
    });
    return await res.json();
  },

  async adminDeletePost(postId) {
    const res = await fetch(`/api/admin/reports/delete-post`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId })
    });
    return await res.json();
  },

  async updateSetting(key, value) {
    const res = await fetch(`/api/admin/settings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
    return await res.json();
  },

  // ================= 用户主页模块 =================
  async getUserProfile(targetId) {
    try {
      const res = await fetch(`/api/users/${targetId}/public`);
      return await res.json();
    } catch (e) { return { error: '网络错误' }; }
  },

  async toggleFollow(targetId) {
    try {
      const res = await fetch(`/api/users/${targetId}/follow`, { method: 'POST' });
      return await res.json();
    } catch (e) { return { error: '网络错误' }; }
  },

  async updateProfile(name, bio) {
    try {
      const res = await fetch('/api/users/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, bio })
      });
      const data = await res.json();
      if (data.error) showToast(data.error, 'error');
      else showToast('资料修改成功', 'success');
      return data;
    } catch (e) { return { error: '网络错误' }; }
  },

  // ================= 发现（Forum）模块 =================
  async getPosts(cursor = null, tab = 'discover', limit = 20, authorId = null) {
    try {
      let url = `/api/forum/posts?tab=${tab}&limit=${limit}`;
      if (cursor) url += `&cursor=${cursor}`;
      if (authorId) url += `&author_id=${authorId}`;
      const res = await fetch(url);
      if (!res.ok) return { posts: [], nextCursor: null };
      return await res.json();
    } catch (e) { return { posts: [], nextCursor: null }; }
  },

  async createPost(content, imageUrl = null, category = 'discussion', tags = []) {
    try {
      const res = await fetch('/api/forum/posts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, imageUrl, category, tags })
      });
      const data = await res.json();
      if (data.error) showToast(data.error, 'error');
      return data;
    } catch (e) { showToast('网络错误', 'error'); return { error: '网络错误' }; }
  },

  async toggleLike(postId) {
    try {
      const res = await fetch(`/api/forum/posts/${postId}/like`, { method: 'POST' });
      return await res.json();
    } catch (e) { return { error: '网络错误' }; }
  },

  async toggleFavorite(postId) {
    try {
      const res = await fetch(`/api/forum/posts/${postId}/favorite`, { method: 'POST' });
      return await res.json();
    } catch (e) { return { error: '网络错误' }; }
  },

  async deletePost(postId) {
    try {
      const res = await fetch(`/api/forum/posts/${postId}`, { method: 'DELETE' });
      return await res.json();
    } catch (e) { return { error: '网络错误' }; }
  },

  async getPostDetail(postId) {
    try {
      const res = await fetch(`/api/forum/posts/${postId}`);
      return await res.json();
    } catch (e) { return { error: '网络错误' }; }
  },

  async addComment(postId, content) {
    try {
      const res = await fetch(`/api/forum/posts/${postId}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (data.error) showToast(data.error, 'error');
      return data;
    } catch (e) { return { error: '网络错误' }; }
  },

  async deleteComment(commentId) {
    try {
      const res = await fetch(`/api/forum/comments/${commentId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) showToast(data.error, 'error');
      return data;
    } catch (e) { return { error: '网络错误' }; }
  },

  async reportPost(postId, reason, detail = '') {
    try {
      const res = await fetch(`/api/forum/posts/${postId}/report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, detail })
      });
      const data = await res.json();
      if (data.error) showToast(data.error, 'error');
      else showToast('举报已提交，感谢您的反馈', 'success');
      return data;
    } catch (e) { return { error: '网络错误' }; }
  },

  async getContributions(userId) {
    try {
      const res = await fetch(`/api/users/${userId}/contributions`);
      if (!res.ok) return { contributions: [] };
      return await res.json();
    } catch (e) { return { contributions: [] }; }
  }
};