import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { AUTH_COOKIE } from './auth.controller';
import type { AuthPayload } from './auth.types';

export type AuthedRequest = Request & { auth: AuthPayload };

// Registered users only — guests are rejected. For routes that need an owner
// (map authoring); play routes simply don't use it.
@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.[
      AUTH_COOKIE
    ];
    const payload = await this.auth.verifyToken(token);
    if (!payload || payload.kind !== 'user') {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }
    req.auth = payload;
    return true;
  }
}

// Anyone with an identity — a registered user or a guest. For play-side
// routes (creating a game room), where logging in is optional.
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.[
      AUTH_COOKIE
    ];
    const payload = await this.auth.verifyToken(token);
    if (!payload)
      throw new UnauthorizedException(
        '먼저 게스트 입장 또는 로그인이 필요합니다.',
      );
    req.auth = payload;
    return true;
  }
}
