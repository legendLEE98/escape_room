import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

export const AUTH_COOKIE = 'et_token';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  async signup(@Body() body: Record<string, unknown>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.signup(body ?? {}, req.ip ?? 'unknown');
    this.setCookie(res, result.token, result.maxAgeMs);
    return { user: result.user };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: Record<string, unknown>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(body ?? {}, req.ip ?? 'unknown');
    this.setCookie(res, result.token, result.maxAgeMs);
    return { user: result.user };
  }

  // Play without an account: a signed, short-lived token and nothing in the DB.
  // A logged-in user keeps their own session instead of being downgraded.
  @Post('guest')
  @HttpCode(200)
  async guest(@Body() body: Record<string, unknown>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const existing = await this.auth.describe(
      await this.auth.verifyToken((req.cookies as Record<string, string> | undefined)?.[AUTH_COOKIE]),
    );
    if (existing?.kind === 'user') return { user: existing };

    const result = await this.auth.createGuest(body ?? {});
    this.setCookie(res, result.token, result.maxAgeMs);
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE, this.cookieOptions());
  }

  // 200 with user: null (rather than 401) when nobody is logged in, so the
  // frontend can call it on every page load without console errors.
  @Get('me')
  async me(@Req() req: Request) {
    const payload = await this.auth.verifyToken((req.cookies as Record<string, string> | undefined)?.[AUTH_COOKIE]);
    return { user: await this.auth.describe(payload) };
  }

  private setCookie(res: Response, token: string, maxAgeMs: number) {
    res.cookie(AUTH_COOKIE, token, { ...this.cookieOptions(), maxAge: maxAgeMs });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    };
  }
}
