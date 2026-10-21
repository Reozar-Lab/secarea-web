async getUsers() {
  const res = await fetch(`${API_BASE}/../admin/users`);
  return await res.json();
},

async updateUser(targetUserId, newRole, newBanStatus) {
  const res = await fetch(`${API_BASE}/../admin/update-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId, newRole, newBanStatus })
  });
  return await res.json();
}