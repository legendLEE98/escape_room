const MAPS_KEY = 'escape-room-maps-v1';

function readMaps() {
  try {
    const raw = JSON.parse(localStorage.getItem(MAPS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeMaps(maps) {
  localStorage.setItem(MAPS_KEY, JSON.stringify(maps));
}

function seedDefaultMap() {
  const maps = readMaps();
  if (maps.length > 0) return maps;
  const now = Date.now();
  const seeded = [
    {
      id: 'default',
      title: '테스트 맵',
      difficulty: 3,
      minUser: 1,
      maxUser: 4,
      createdAt: now,
      updatedAt: now,
    },
  ];
  writeMaps(seeded);
  return seeded;
}

export function listMaps() {
  return seedDefaultMap();
}

export function getMap(id) {
  return listMaps().find((map) => map.id === id) || null;
}

export function createMap() {
  const maps = listMaps();
  const now = Date.now();
  const map = {
    id: crypto.randomUUID(),
    title: '새 맵',
    difficulty: 3,
    minUser: 1,
    maxUser: 4,
    createdAt: now,
    updatedAt: now,
  };
  writeMaps([...maps, map]);
  return map;
}

export function updateMapMeta(id, patch) {
  const maps = listMaps().map((map) =>
    map.id === id ? { ...map, ...patch, updatedAt: Date.now() } : map,
  );
  writeMaps(maps);
  return maps.find((map) => map.id === id);
}
