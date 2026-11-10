// "Recently played maps" — kept in this browser's localStorage, for guests and
// logged-in users alike. Only the share codes are stored; titles and the rest
// are looked up again on load, so a map that was later unshared or deleted
// shows up as unavailable instead of going stale.
const RECENT_CODES_KEY = 'escape-room-recent-map-codes-v1';
const MAX_RECENT = 12;

export function normalizeCode(code) {
  return code.trim().toUpperCase();
}

function readCodes() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_CODES_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeCodes(codes) {
  try {
    localStorage.setItem(RECENT_CODES_KEY, JSON.stringify(codes));
  } catch {
    // storage unavailable (private mode / full) — the list just won't persist
  }
}

// Throws with the server's message when the code is unknown or not shared.
export async function lookupSharedMap(code) {
  const response = await fetch(`/api/shared-maps/${encodeURIComponent(normalizeCode(code))}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `요청에 실패했습니다. (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

// Official maps (e.g. the tutorial), the same for everyone.
export async function listFeaturedMaps() {
  const response = await fetch('/api/shared-maps');
  if (!response.ok) throw new Error(`요청에 실패했습니다. (${response.status})`);
  return response.json();
}

export async function listRecentMaps() {
  return Promise.all(
    readCodes().map((code) =>
      lookupSharedMap(code)
        .then((summary) => ({ ...summary, available: true }))
        .catch(() => ({ code, title: '사용할 수 없는 맵', available: false })),
    ),
  );
}

// Moves the code to the front (most recent first).
export function recordRecentMap(code) {
  const normalized = normalizeCode(code);
  writeCodes([normalized, ...readCodes().filter((saved) => saved !== normalized)].slice(0, MAX_RECENT));
}

export async function addRecentMapByCode(rawCode) {
  const summary = await lookupSharedMap(rawCode);
  recordRecentMap(summary.code);
  return { ...summary, available: true };
}

export function removeRecentMap(code) {
  const normalized = normalizeCode(code);
  writeCodes(readCodes().filter((saved) => saved !== normalized));
}
