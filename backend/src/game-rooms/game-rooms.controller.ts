import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IdentityGuard } from '../auth/auth.guard';
import type { AuthedRequest } from '../auth/auth.guard';
import { GameRoomsService } from './game-rooms.service';
import { GameRoomsGateway } from './game-rooms.gateway';
import type { Identity } from './game-rooms.types';

const identityOf = (req: AuthedRequest): Identity => ({
  id: req.auth.sub,
  nickname: req.auth.nickname,
  kind: req.auth.kind,
});

@Controller('game-rooms')
export class GameRoomsController {
  constructor(
    private readonly rooms: GameRoomsService,
    private readonly gateway: GameRoomsGateway,
  ) {}

  // Browsing rooms needs no identity — guests can look around.
  @Get()
  list(@Query('q') q?: string) {
    return this.rooms.list(q);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const room = await this.rooms.get(id);
    if (!room)
      throw new NotFoundException('존재하지 않거나 이미 닫힌 방입니다.');
    return room;
  }

  @Get(':id/layout')
  @UseGuards(IdentityGuard)
  layout(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.rooms.layout(id, req.auth.sub);
  }

  // 방 만들기 로직
  // Making a room does: it needs to know who the host is.
  @Post()
  @UseGuards(IdentityGuard)
  create(
    @Req() req: AuthedRequest,
    @Body() body: { title?: unknown; mapCode?: unknown; maxUser?: unknown },
  ) {
    return this.rooms.create(identityOf(req), body ?? {});
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(IdentityGuard)
  async close(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.rooms.close(id, req.auth.sub);
    await this.gateway.notifyClosed(id);
  }
}
