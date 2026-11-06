import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { REDIS } from '../redis/redis.module';
import { RateLimiterService } from '../auth/rate-limiter.service';
import { SharedMapsService } from '../maps/shared-maps.service';
import type {
  Identity,
  PlayerInfo,
  PlayKind,
  PlaySnapshot,
  RoomMapSnapshot,
  RoomStatus,
  RoomView,
} from './game-rooms.types';

const ROOM_INDEX = 'gamerooms';
const roomKey = (id: string) => `gameroom:${id}`;
const playersKey = (id: string) => `gameroom:${id}:players`;
const playKey = (id: string, kind: PlayKind) =>
  `gameroom:${id}:${kind === 'button' ? 'pressed' : 'unlocked'}`;
const MAX_PLAY_KEY_LENGTH = 100;
const MAX_PLAY_KEYS = 500; // per kind; a map has nowhere near this many buttons/doors

const MAX_TITLE_LENGTH = 40;
const MAX_LISTED_ROOMS = 200;
// A room is created over HTTP and joined over the socket a moment later; if
// nobody ever joins it just expires.
const UNJOINED_ROOM_TTL_SECONDS = 120;
// Everyone left: keep the room briefly so a page refresh can come straight back.
const EMPTY_ROOM_TTL_SECONDS = 30;
const CREATE_LIMIT = 5; // rooms per identity per minute
const CREATE_WINDOW_SECONDS = 60;

// Atomically: refuse unknown/started/full rooms, otherwise add the player.
// A player who is already in the room (refresh, second tab) always gets back in.
const JOIN_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 'not_found' end
local isMember = redis.call('HEXISTS', KEYS[2], ARGV[1])
if isMember == 0 then
  if redis.call('HGET', KEYS[1], 'status') ~= 'waiting' then return 'started' end
  if redis.call('HLEN', KEYS[2]) >= tonumber(redis.call('HGET', KEYS[1], 'maxUser')) then return 'full' end
end
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
redis.call('PERSIST', KEYS[1])
redis.call('PERSIST', KEYS[2])
return 'ok'
`;

export type JoinResult = 'ok' | 'not_found' | 'started' | 'full';

@Injectable()
export class GameRoomsService implements OnModuleInit {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly limiter: RateLimiterService,
    private readonly sharedMaps: SharedMapsService,
  ) {}

  // Rooms only mean something while their players' sockets are connected.
  // After a restart every socket is gone, so whatever is left is stale.
  async onModuleInit() {
    const stream = this.redis.scanStream({ match: 'gameroom:*', count: 100 });
    const keys: string[] = [];
    for await (const batch of stream) keys.push(...(batch as string[]));
    if (keys.length) await this.redis.del(...keys);
    await this.redis.del(ROOM_INDEX);
  }

  async create(
    identity: Identity,
    input: { title?: unknown; mapCode?: unknown; maxUser?: unknown },
  ) {
    await this.limiter.hit(
      `room-create:${identity.id}`,
      CREATE_LIMIT,
      CREATE_WINDOW_SECONDS,
    );

    if (typeof input.mapCode !== 'string')
      throw new BadRequestException('맵을 선택해 주세요.');
    // The server reads the map itself (and refuses unshared codes) rather than
    // trusting whatever the client says about it.
    const summary = await this.sharedMaps.getSummary(input.mapCode);
    const map: RoomMapSnapshot = {
      code: summary.code,
      releaseId: summary.releaseId,
      title: summary.title,
      difficulty: summary.difficulty,
      minUser: summary.minUser,
      maxUser: summary.maxUser,
      mapDesc: summary.mapDesc,
      ownerNickname: summary.ownerNickname,
      version: summary.version,
    };

    const title =
      (typeof input.title === 'string' ? input.title.trim() : '').slice(
        0,
        MAX_TITLE_LENGTH,
      ) || `${map.title} 방`;
    const requested = Number(input.maxUser);
    const maxUser = Number.isFinite(requested)
      ? Math.min(map.maxUser, Math.max(map.minUser, Math.round(requested)))
      : map.maxUser;

    const id = randomUUID();
    const createdAt = Date.now();
    await this.redis
      .multi()
      .hset(roomKey(id), {
        id,
        title,
        map: JSON.stringify(map),
        maxUser: String(maxUser),
        status: 'waiting',
        hostId: identity.id,
        hostNickname: identity.nickname,
        createdAt: String(createdAt),
      })
      .expire(roomKey(id), UNJOINED_ROOM_TTL_SECONDS)
      .zadd(ROOM_INDEX, createdAt, id)
      .exec();

    return this.getOrThrow(id);
  }

  async get(id: string): Promise<RoomView | null> {
    const raw = await this.redis.hgetall(roomKey(id));
    if (!raw.id) return null;
    return this.toView(raw, await this.redis.hlen(playersKey(id)));
  }

  async getOrThrow(id: string) {
    const room = await this.get(id);
    if (!room)
      throw new NotFoundException('존재하지 않거나 이미 닫힌 방입니다.');
    return room;
  }

  // Rooms with nobody in them (just created, or everyone left) aren't listed.
  async list(query?: string): Promise<RoomView[]> {
    const ids = await this.redis.zrevrange(ROOM_INDEX, 0, MAX_LISTED_ROOMS - 1);
    const needle = query?.trim().toLowerCase();
    const views: RoomView[] = [];
    const gone: string[] = [];

    for (const id of ids) {
      const room = await this.get(id);
      if (!room) {
        gone.push(id); // expired — drop it from the index
        continue;
      }
      if (room.currentUser === 0) continue;
      if (needle && !room.title.toLowerCase().includes(needle)) continue;
      views.push(room);
    }
    if (gone.length) await this.redis.zrem(ROOM_INDEX, ...gone);
    return views;
  }

  async players(roomId: string): Promise<PlayerInfo[]> {
    const raw = await this.redis.hgetall(playersKey(roomId));
    return Object.values(raw)
      .map((json) => JSON.parse(json) as PlayerInfo)
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }

  async join(roomId: string, identity: Identity): Promise<JoinResult> {
    const player: PlayerInfo = {
      id: identity.id,
      nickname: identity.nickname,
      kind: identity.kind,
      joinedAt: Date.now(),
    };
    const existing = await this.redis.hget(playersKey(roomId), identity.id);
    // Keep the original join time on a rejoin so turn order doesn't change.
    if (existing)
      player.joinedAt = (JSON.parse(existing) as PlayerInfo).joinedAt;

    const result = (await this.redis.eval(
      JOIN_SCRIPT,
      2,
      roomKey(roomId),
      playersKey(roomId),
      identity.id,
      JSON.stringify(player),
    )) as JoinResult;

    if (result === 'ok') {
      await this.redis.persist(playKey(roomId, 'button'));
      await this.redis.persist(playKey(roomId, 'door'));
      await this.ensureHost(roomId);
    }
    return result;
  }

  // Removes a player. Returns who is host afterwards if that changed, and
  // whether the room is now empty.
  async leave(roomId: string, playerId: string) {
    const removed = await this.redis.hdel(playersKey(roomId), playerId);
    if (!removed)
      return {
        empty: false,
        newHost: null as { id: string; nickname: string } | null,
      };

    const remaining = await this.redis.hlen(playersKey(roomId));
    if (remaining === 0) {
      await this.redis
        .multi()
        .expire(roomKey(roomId), EMPTY_ROOM_TTL_SECONDS)
        .expire(playKey(roomId, 'button'), EMPTY_ROOM_TTL_SECONDS)
        .expire(playKey(roomId, 'door'), EMPTY_ROOM_TTL_SECONDS)
        .exec();
      return { empty: true, newHost: null };
    }

    const room = await this.get(roomId);
    if (room && room.hostId === playerId) {
      return { empty: false, newHost: await this.promoteHost(roomId) };
    }
    return { empty: false, newHost: null };
  }

  // Only the host starts the game; a room can only start once.
  async start(roomId: string, playerId: string) {
    const room = await this.getOrThrow(roomId);
    if (room.hostId !== playerId)
      throw new ForbiddenException('방장만 게임을 시작할 수 있습니다.');
    if (room.status !== 'waiting')
      throw new BadRequestException('이미 시작된 방입니다.');
    await this.redis.hset(roomKey(roomId), {
      status: 'playing' satisfies RoomStatus,
      startedAt: String(Date.now()),
    });
    return this.getOrThrow(roomId);
  }

  // Someone reached the exit: the whole room clears, once.
  async clear(roomId: string, playerId: string) {
    const room = await this.getOrThrow(roomId);
    if (!(await this.redis.hexists(playersKey(roomId), playerId)))
      throw new ForbiddenException('방에 입장해 있지 않습니다.');
    if (room.status !== 'playing')
      throw new BadRequestException('진행 중인 게임이 아닙니다.');
    await this.redis.hset(roomKey(roomId), {
      status: 'cleared' satisfies RoomStatus,
      clearedAt: String(Date.now()),
    });
    return this.getOrThrow(roomId);
  }

  // The layout of the release this room pinned — only for people in the room,
  // and only once it has started (the lobby doesn't need it, and it contains
  // door codes).
  async layout(roomId: string, playerId: string) {
    const room = await this.getOrThrow(roomId);
    if (!(await this.redis.hexists(playersKey(roomId), playerId)))
      throw new ForbiddenException('방에 입장해 있지 않습니다.');
    if (room.status === 'waiting')
      throw new BadRequestException('아직 시작되지 않은 방입니다.');
    return this.sharedMaps.getLayoutByRelease(room.map.releaseId);
  }

  async playSnapshot(roomId: string): Promise<PlaySnapshot> {
    const [pressed, unlocked] = await Promise.all([
      this.redis.smembers(playKey(roomId, 'button')),
      this.redis.smembers(playKey(roomId, 'door')),
    ]);
    return { pressed, unlocked };
  }

  // Records a pressed button / unlocked door. Returns true when it is news
  // (so only the first player to do it is broadcast).
  async playAction(
    roomId: string,
    kind: unknown,
    key: unknown,
  ): Promise<boolean> {
    if (kind !== 'button' && kind !== 'door') return false;
    if (typeof key !== 'string' || !key || key.length > MAX_PLAY_KEY_LENGTH)
      return false;
    const room = await this.get(roomId);
    if (!room || room.status !== 'playing') return false;
    const setKey = playKey(roomId, kind);
    if ((await this.redis.scard(setKey)) >= MAX_PLAY_KEYS) return false;
    return (await this.redis.sadd(setKey, key)) === 1;
  }

  async close(roomId: string, playerId: string) {
    const room = await this.getOrThrow(roomId);
    if (room.hostId !== playerId)
      throw new ForbiddenException('방장만 방을 닫을 수 있습니다.');
    await this.redis
      .multi()
      .del(
        roomKey(roomId),
        playersKey(roomId),
        playKey(roomId, 'button'),
        playKey(roomId, 'door'),
      )
      .zrem(ROOM_INDEX, roomId)
      .exec();
  }

  // If the creator isn't in the room (never joined, or left), the longest-
  // waiting player takes over.
  private async ensureHost(roomId: string) {
    const room = await this.get(roomId);
    if (!room) return;
    const hostPresent = await this.redis.hexists(
      playersKey(roomId),
      room.hostId,
    );
    if (!hostPresent) await this.promoteHost(roomId);
  }

  private async promoteHost(roomId: string) {
    const [next] = await this.players(roomId);
    if (!next) return null;
    await this.redis.hset(roomKey(roomId), {
      hostId: next.id,
      hostNickname: next.nickname,
    });
    return { id: next.id, nickname: next.nickname };
  }

  private toView(raw: Record<string, string>, currentUser: number): RoomView {
    return {
      id: raw.id,
      title: raw.title,
      map: JSON.parse(raw.map) as RoomMapSnapshot,
      maxUser: Number(raw.maxUser),
      currentUser,
      status: raw.status as RoomStatus,
      hostId: raw.hostId,
      hostNickname: raw.hostNickname,
      createdAt: Number(raw.createdAt),
      startedAt: raw.startedAt ? Number(raw.startedAt) : null,
      clearedAt: raw.clearedAt ? Number(raw.clearedAt) : null,
    };
  }
}
