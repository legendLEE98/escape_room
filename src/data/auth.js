const API_BASE = '/api/auth';

// Surfaces the backend's own message (e.g. "이미 가입된 이메일입니다.") so the
// form can show it as-is.
async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
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

export async function fetchCurrentUser() {
  const data = await request('/me');
  return data.user;
}

export async function signup({ email, password, nickname }) {
  return (await request('/signup', { method: 'POST', body: { email, password, nickname } })).user;
}

export async function login({ email, password }) {
  return (await request('/login', { method: 'POST', body: { email, password } })).user;
}

export async function logout() {
  await request('/logout', { method: 'POST' });
}

export async function createGuest(nickname) {
  return (await request('/guest', { method: 'POST', body: { nickname } })).user;
}

// Who is playing: the logged-in user, an existing guest session, or — if
// neither — a freshly issued guest. Reusing /me first matters because the
// server issues a new guest identity on every /guest call.
export async function resolvePlayerIdentity(defaultGuestName = '손님') {
  const current = await fetchCurrentUser().catch(() => null);
  return current ?? createGuest(defaultGuestName);
}
