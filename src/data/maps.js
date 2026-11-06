const API_BASE = '/api/maps';

// Backend rows are snake_case (map_info columns); the screens work with
// camelCase, so convert once here at the boundary.
function fromRow(row) {
  return {
    id: row.id,
    title: row.title,
    difficulty: row.difficulty,
    minUser: row.min_user,
    maxUser: row.max_user,
    mapDesc: row.map_desc,
    deploy: row.deploy,
    shareCode: row.share_code,
    releaseVersion: row.release_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function request(path = '', options) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Keep the server's own explanation (e.g. why a deploy was refused).
    const error = new Error(data.message || `Maps API ${response.status}: ${path || '/'}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function listMaps() {
  const rows = await request();
  return rows.map(fromRow);
}

export async function getMap(id) {
  return fromRow(await request(`/${id}`));
}

export async function createMap() {
  const row = await request('', {
    method: 'POST',
    body: JSON.stringify({ title: '새 맵', difficulty: 3, minUser: 1, maxUser: 4 }),
  });
  return fromRow(row);
}

export async function updateMapMeta(id, patch) {
  const row = await request(`/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return fromRow(row);
}

export async function deleteMap(id) {
  await request(`/${id}`, { method: 'DELETE' });
}

// Snapshots the saved working copy and shares it by code.
export async function deployMap(id) {
  return request(`/${id}/deploy`, { method: 'POST' });
}

export async function undeployMap(id) {
  await request(`/${id}/deploy`, { method: 'DELETE' });
}
