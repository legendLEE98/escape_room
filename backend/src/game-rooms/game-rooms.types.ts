// What a map looks like on a room card — copied from the released map when the
// room is created, so the card still reads right if the map is later unshared.
export interface RoomMapSnapshot {
  code: string;
  // The release the room plays — pinned at creation so a republish mid-game
  // can't change the map under people.
  releaseId: string;
  title: string;
  difficulty: number;
  minUser: number;
  maxUser: number;
  mapDesc: string | null;
  ownerNickname: string;
  version: number;
}

export type RoomStatus = 'waiting' | 'playing' | 'cleared';

export interface PlayerInfo {
  id: string;
  nickname: string;
  kind: 'user' | 'guest';
  joinedAt: number;
}

export interface RoomView {
  id: string;
  title: string;
  map: RoomMapSnapshot;
  maxUser: number;
  currentUser: number;
  status: RoomStatus;
  hostId: string;
  hostNickname: string;
  createdAt: number;
  // When the game started / was cleared (epoch ms), once they have.
  startedAt: number | null;
  clearedAt: number | null;
}

export interface Identity {
  id: string;
  nickname: string;
  kind: 'user' | 'guest';
}

// A player's latest position in the waiting room. Relayed as-is to everyone
// else in the room; the server only sanity-checks it.
export interface MoveState {
  x: number;
  z: number;
  ry: number;
  moving: boolean;
  // Saved id of the map room the player is in (absent in the waiting room).
  room?: string;
}

export type PlayKind = 'button' | 'door';

// What has been pressed/unlocked so far in a running game.
export interface PlaySnapshot {
  pressed: string[];
  unlocked: string[];
}
