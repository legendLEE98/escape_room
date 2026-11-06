// Game rooms live on the server (Redis) so everyone sees the same list. Only
// browsing is open to everyone; creating one needs an identity (login or guest).
async function request(path, options) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `요청에 실패했습니다. (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export function listGameRooms(query = '') {
  return request(`/api/game-rooms?q=${encodeURIComponent(query.trim())}`);
}

// { title, mapCode, maxUser } -> the new room. The server reads the map by its
// share code itself; the client only says which one.
export function createGameRoom(input) {
  return request('/api/game-rooms', { method: 'POST', body: JSON.stringify(input) });
}

export function closeGameRoom(id) {
  return request(`/api/game-rooms/${id}`, { method: 'DELETE' });
}

// The pinned layout of a started room (members only).
export function getRoomLayout(id) {
  return request(`/api/game-rooms/${id}/layout`);
}
