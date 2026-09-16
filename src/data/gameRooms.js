const GAME_ROOMS_KEY = 'escape-room-game-rooms-v1';

function readRooms() {
  try {
    const raw = JSON.parse(localStorage.getItem(GAME_ROOMS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeRooms(rooms) {
  localStorage.setItem(GAME_ROOMS_KEY, JSON.stringify(rooms));
}

export function listGameRooms() {
  return readRooms();
}

export function createGameRoom({ title, mapId, maxUser }) {
  const rooms = readRooms();
  const room = {
    id: crypto.randomUUID(),
    title: title.trim() || '이름 없는 방',
    mapId,
    maxUser,
    // No backend/session tracking yet — always starts at 1 (the host).
    currentUser: 1,
    status: 'waiting',
    createdAt: Date.now(),
  };
  writeRooms([...rooms, room]);
  return room;
}

export function deleteGameRoom(id) {
  writeRooms(readRooms().filter((room) => room.id !== id));
}
