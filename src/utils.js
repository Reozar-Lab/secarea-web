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