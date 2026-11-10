import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { UserAuthGuard } from '../auth/auth.guard';
import type { AuthedRequest } from '../auth/auth.guard';
import { RateLimiterService } from '../auth/rate-limiter.service';
import type { Request } from 'express';
import { SharedMapsService } from './shared-maps.service';

const LOOKUP_LIMIT = 60; // per ip per minute — keeps codes from being enumerated
const LOOKUP_WINDOW_SECONDS = 60;

// Public: anyone holding a code can look the map up, guests included.
@Controller('shared-maps')
export class SharedMapsController {
  constructor(
    private readonly shared: SharedMapsService,
    private readonly limiter: RateLimiterService,
  ) {}

  @Get()
  featured() {
    return this.shared.listFeatured();
  }

  @Get(':code')
  async summary(@Param('code') code: string, @Req() req: Request) {
    await this.limiter.hit(`shared-lookup:${req.ip}`, LOOKUP_LIMIT, LOOKUP_WINDOW_SECONDS);
    return this.shared.getSummary(code);
  }

  @Get(':code/layout')
  async layout(@Param('code') code: string, @Req() req: Request) {
    await this.limiter.hit(`shared-lookup:${req.ip}`, LOOKUP_LIMIT, LOOKUP_WINDOW_SECONDS);
    return this.shared.getLayout(code);
  }
}

// A logged-in user's "maps I've added" list.
@Controller('me/saved-maps')
@UseGuards(UserAuthGuard)
export class SavedMapsController {
  constructor(
    private readonly shared: SharedMapsService,
    private readonly limiter: RateLimiterService,
  ) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.shared.listSaved(req.auth.sub);
  }

  @Post()
  async add(@Req() req: AuthedRequest, @Body() body: { code?: unknown }) {
    await this.limiter.hit(`shared-lookup:${req.ip}`, LOOKUP_LIMIT, LOOKUP_WINDOW_SECONDS);
    return this.shared.addSaved(req.auth.sub, typeof body?.code === 'string' ? body.code : '');
  }

  @Delete(':code')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Param('code') code: string) {
    await this.shared.removeSaved(req.auth.sub, code);
  }
}
