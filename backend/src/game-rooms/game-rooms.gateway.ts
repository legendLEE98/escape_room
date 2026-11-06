import { HttpException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { parseCookie } from 'cookie';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { AUTH_COOKIE } from '../auth/auth.controller';
import { GameRoomsService } from './game-rooms.service';
import type { Identity, MoveState } from './game-rooms.types';

// 게임방의 실시간 처리 담당. 클라이언트는 로그인/게스트 쿠키로 연결하고
// (그래서 신원은 항상 서버가 확인한 값이며, 클라이언트가 주장한 값이 아니다)
// 방 하나에 입장한 뒤 아래 이벤트를 주고받는다:
//
//   클라이언트 -> 서버  room:join {roomId}   (응답: 방, 참가자, 위치)
//                      player:move {x,z,ry,moving}
//                      room:start             (방장만)
//                      room:clear             (탈출구에 도달함)
//                      room:positions         (응답: 모두의 위치)
//                      play:action {kind,key} (버튼을 누름 / 문을 풂)
//                      room:leave
//   서버 -> 클라이언트  player:joined {player}   player:left {id}
//                      player:moved {id,x,z,ry,moving}
//                      room:host {hostId,hostNickname}
//                      play:state {kind,key}
//                      room:cleared {room,byNickname}
//                      room:started {room}   room:closed   room:replaced

interface SocketData {
  identity: Identity;
  roomId?: string;
  moveWindowStart: number;
  moveCount: number;
}
type GameSocket = Socket<any, any, any, SocketData>;

const socketRoom = (roomId: string) => `room:${roomId}`;
const WORLD_LIMIT = 100; // 맵 안의 어떤 위치도 원점에서 이만큼 멀지는 않다
const MAX_MOVES_PER_SECOND = 40;

@WebSocketGateway({ path: '/socket.io' })
export class GameRoomsGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() private server!: Server;

  // 방마다 모든 사람의 마지막 위치. 늦게 들어온 사람도 이미 있는 사람들이
  // 어디 있는지 바로 볼 수 있게 한다. 메모리에만 있어서 소켓이 사라지면 같이 사라진다.
  private readonly positions = new Map<string, Map<string, MoveState>>();
  // 한 사람은 한 방에 소켓을 하나만 가진다 (새로고침이나 두 번째 탭이 이전 연결을 대체한다).
  private readonly playerSockets = new Map<string, GameSocket>();

  constructor(
    private readonly auth: AuthService,
    private readonly rooms: GameRoomsService,
  ) {}

  afterInit(server: Server) {
    server.use(async (socket, next) => {
      const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
      const payload = await this.auth.verifyToken(cookies[AUTH_COOKIE]);
      if (!payload) return next(new Error('unauthorized'));
      socket.data.identity = {
        id: payload.sub,
        nickname: payload.nickname,
        kind: payload.kind,
      } satisfies Identity;
      socket.data.moveWindowStart = 0;
      socket.data.moveCount = 0;
      next();
    });
  }

  async handleDisconnect(client: GameSocket) {
    await this.leaveRoom(client);
  }

  @SubscribeMessage('room:join')
  async onJoin(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { roomId?: unknown },
  ) {
    const roomId = typeof body?.roomId === 'string' ? body.roomId : '';
    if (!roomId) return { ok: false, error: 'invalid_room' };

    const identity = client.data.identity;
    if (client.data.roomId && client.data.roomId !== roomId)
      await this.leaveRoom(client);

    const result = await this.rooms.join(roomId, identity);
    if (result !== 'ok') return { ok: false, error: result };

    const key = `${roomId}:${identity.id}`;
    const previous = this.playerSockets.get(key);
    if (previous && previous.id !== client.id) {
      previous.data.roomId = undefined; // 이 소켓의 끊김이 '방 나가기'로 처리되면 안 된다
      previous.emit('room:replaced');
      previous.disconnect(true);
    }
    this.playerSockets.set(key, client);
    client.data.roomId = roomId;
    await client.join(socketRoom(roomId));

    const [room, players] = await Promise.all([
      this.rooms.getOrThrow(roomId),
      this.rooms.players(roomId),
    ]);
    const self = players.find((player) => player.id === identity.id);
    client.to(socketRoom(roomId)).emit('player:joined', { player: self });

    return {
      ok: true,
      you: identity,
      room,
      players,
      positions: Object.fromEntries(this.positions.get(roomId) ?? []),
      play: await this.rooms.playSnapshot(roomId),
    };
  }

  @SubscribeMessage('player:move')
  onMove(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: Partial<MoveState>,
  ) {
    const roomId = client.data.roomId;
    if (!roomId) return;

    // 폭주하는 요청은 방 전체에 중계하지 않고 버린다.
    const now = Date.now();
    if (now - client.data.moveWindowStart > 1000) {
      client.data.moveWindowStart = now;
      client.data.moveCount = 0;
    }
    client.data.moveCount += 1;
    if (client.data.moveCount > MAX_MOVES_PER_SECOND) return;

    const { x, z, ry, moving, room } = body ?? {};
    if (
      ![x, z, ry].every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      )
    )
      return;
    const state: MoveState = {
      x: Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, x as number)),
      z: Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, z as number)),
      ry: ry as number,
      moving: Boolean(moving),
      ...(typeof room === 'string' && room.length <= 64 ? { room } : {}),
    };

    let roomPositions = this.positions.get(roomId);
    if (!roomPositions) this.positions.set(roomId, (roomPositions = new Map()));
    roomPositions.set(client.data.identity.id, state);

    // volatile: 위치 업데이트 하나쯤 못 받아도 괜찮다. 다음 것이 덮어쓴다.
    client
      .to(socketRoom(roomId))
      .volatile.emit('player:moved', { id: client.data.identity.id, ...state });
  }

  @SubscribeMessage('room:start')
  async onStart(@ConnectedSocket() client: GameSocket) {
    const roomId = client.data.roomId;
    if (!roomId) return { ok: false, error: '방에 입장해 있지 않습니다.' };
    try {
      const room = await this.rooms.start(roomId, client.data.identity.id);
      // 대기실에서 서 있던 위치는 맵에서는 의미가 없다.
      this.positions.delete(roomId);
      this.server.to(socketRoom(roomId)).emit('room:started', { room });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof HttpException
            ? error.message
            : '게임을 시작하지 못했습니다.',
      };
    }
  }

  // 누군가 열린 탈출구에 도달했다: 방 전체가 클리어된다.
  @SubscribeMessage('room:clear')
  async onClear(@ConnectedSocket() client: GameSocket) {
    const roomId = client.data.roomId;
    if (!roomId) return { ok: false, error: '방에 입장해 있지 않습니다.' };
    try {
      const room = await this.rooms.clear(roomId, client.data.identity.id);
      this.server.to(socketRoom(roomId)).emit('room:cleared', {
        room,
        byNickname: client.data.identity.nickname,
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof HttpException
            ? error.message
            : '클리어를 처리하지 못했습니다.',
      };
    }
  }

  @SubscribeMessage('room:positions')
  onPositions(@ConnectedSocket() client: GameSocket) {
    const roomId = client.data.roomId;
    if (!roomId) return { ok: false, positions: {} };
    return {
      ok: true,
      positions: Object.fromEntries(this.positions.get(roomId) ?? []),
    };
  }

  @SubscribeMessage('play:action')
  async onPlayAction(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { kind?: unknown; key?: unknown },
  ) {
    const roomId = client.data.roomId;
    if (!roomId) return { ok: false };
    const isNew = await this.rooms.playAction(roomId, body?.kind, body?.key);
    if (isNew)
      client
        .to(socketRoom(roomId))
        .emit('play:state', { kind: body.kind, key: body.key });
    return { ok: true };
  }

  @SubscribeMessage('room:leave')
  async onLeave(@ConnectedSocket() client: GameSocket) {
    await this.leaveRoom(client);
    return { ok: true };
  }

  // 방장이 REST로 방을 닫았다: 방에 있는 모두에게 알리고 연결을 떼어 낸다.
  async notifyClosed(roomId: string) {
    const sockets = await this.server.in(socketRoom(roomId)).fetchSockets();
    this.server.to(socketRoom(roomId)).emit('room:closed');
    for (const remote of sockets) {
      const socket = this.playerSockets.get(
        `${roomId}:${remote.data.identity.id}`,
      );
      if (socket) {
        socket.data.roomId = undefined;
        this.playerSockets.delete(`${roomId}:${remote.data.identity.id}`);
      }
      remote.leave(socketRoom(roomId));
    }
    this.positions.delete(roomId);
  }

  private async leaveRoom(client: GameSocket) {
    const roomId = client.data.roomId;
    if (!roomId) return;
    client.data.roomId = undefined;

    const playerId = client.data.identity.id;
    const key = `${roomId}:${playerId}`;
    if (this.playerSockets.get(key) === client) this.playerSockets.delete(key);
    client.leave(socketRoom(roomId));
    this.positions.get(roomId)?.delete(playerId);

    const { empty, newHost } = await this.rooms.leave(roomId, playerId);
    this.server.to(socketRoom(roomId)).emit('player:left', { id: playerId });
    if (newHost) {
      this.server.to(socketRoom(roomId)).emit('room:host', {
        hostId: newHost.id,
        hostNickname: newHost.nickname,
      });
    }
    if (empty) this.positions.delete(roomId);
  }
}
