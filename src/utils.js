export async function getCurrentUser(request, env) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/session=([^;]+)/);
  if (!match) return null;
  
  const session = await env.DB.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.is_banned, u.bio 
      FROM sessions s JOIN users u ON s.user_id = u.id 
      WHERE s.token = ? AND s.expires_at > ?
  `).bind(match[1], Date.now()).first();
  
  return session || null;
}

export const jsonResp = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "Content-Type": "application/json" }
});

// 新增：统一鉴权拦截器
export async function verifyAuth(request, env, allowedRoles = []) {
  const user = await getCurrentUser(request, env);
  
  if (!user) {
    return { error: "请先登录", status: 401 };
  }
  
  if (user.is_banned === 1) {
    return { error: "账号已被封禁，无法执行此操作", status: 403 };
  }
  
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return { error: "权限不足", status: 403 };
  }
  
  return { user };
}