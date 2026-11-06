import { io } from 'socket.io-client';

const JOIN_ERRORS = {
  full: '방이 가득 찼습니다.',
  started: '이미 게임이 시작된 방입니다.',
  not_found: '방이 닫혔거나 존재하지 않습니다.',
  invalid_room: '올바르지 않은 방입니다.',
  unauthorized: '로그인 또는 게스트 입장이 필요합니다.',
};

export function joinErrorMessage(code) {
  return JOIN_ERRORS[code] ?? '방에 입장하지 못했습니다.';
}

// One player's live connection to one game room. The server decides who this
// is from the login/guest cookie; the client only names the room.
//
// handlers: onPlayerJoined(player), onPlayerLeft(id), onPlayerMoved(move),
//           onHost({hostId,hostNickname}), onStarted(room), onClosed(),
//           onReplaced(), onDisconnected(), onPlayState({kind,key}), onCleared({room,byNickname})
// Returns { ready, sendMove, start, leave, disconnect }; `ready` resolves with
// the join ack ({ you, room, players, positions, play }) or rejects with an Error
// whose .code is the server's reason ('full', 'started', 'not_found', ...).
export function connectToRoom(roomId, handlers = {}) {
  // Same origin as the page, so the cookie rides along. Default transports:
  // starts on long-polling and upgrades to a websocket, so it still works on
  // networks that block websockets. No auto-reconnect: a dropped connection
  // means the server already removed us from the room.
  const socket = io({ path: '/socket.io', reconnection: false });

  const ready = new Promise((resolve, reject) => {
    const fail = (code) => reject(Object.assign(new Error(joinErrorMessage(code)), { code }));
    socket.on('connect_error', (error) => fail(error.message));
    socket.on('connect', () => {
      socket.emit('room:join', { roomId }, (ack) => (ack?.ok ? resolve(ack) : fail(ack?.error)));
    });
  });

  socket.on('player:joined', ({ player }) => handlers.onPlayerJoined?.(player));
  socket.on('player:left', ({ id }) => handlers.onPlayerLeft?.(id));
  socket.on('player:moved', (move) => handlers.onPlayerMoved?.(move));
  socket.on('room:host', (host) => handlers.onHost?.(host));
  socket.on('room:started', ({ room }) => handlers.onStarted?.(room));
  socket.on('play:state', (change) => handlers.onPlayState?.(change));
  socket.on('room:cleared', (cleared) => handlers.onCleared?.(cleared));
  socket.on('room:closed', () => handlers.onClosed?.());
  socket.on('room:replaced', () => handlers.onReplaced?.());
  socket.on('disconnect', () => handlers.onDisconnected?.());

  return {
    ready,
    sendMove: (state) => socket.volatile.emit('player:move', state),
    // Reached the exit: the whole room clears (the server announces it to everyone).
    clear: () => new Promise((resolve) => socket.emit('room:clear', null, resolve)),
    // kind: 'button' | 'door'
    playAction: (kind, key) => socket.emit('play:action', { kind, key }),
    fetchPositions: () => new Promise((resolve) => socket.emit('room:positions', null, (ack) => resolve(ack?.positions ?? {}))),
    start: () => new Promise((resolve) => socket.emit('room:start', null, resolve)),
    leave: () => new Promise((resolve) => socket.emit('room:leave', null, resolve)),
    disconnect: () => socket.disconnect(),
  };
}
