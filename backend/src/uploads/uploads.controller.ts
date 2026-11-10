import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UserAuthGuard } from '../auth/auth.guard';
import type { AuthedRequest } from '../auth/auth.guard';
import { RateLimiterService } from '../auth/rate-limiter.service';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
const UPLOAD_LIMIT = 30; // images per user per minute
const UPLOAD_WINDOW_SECONDS = 60;
const FILE_NAME = /^[0-9a-f-]{36}\.(png|jpg|webp)$/;
const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
} as const;

// The file's real type, read from its leading bytes. The Content-Type header is
// only what the client claims, so it is never trusted for what gets stored.
function sniffExtension(data: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    return 'png';
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return 'jpg';
  if (
    data.length > 12 &&
    data.subarray(0, 4).toString('latin1') === 'RIFF' &&
    data.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'webp';
  return null;
}

@Controller('uploads')
export class UploadsController {
  constructor(private readonly limiter: RateLimiterService) {}

  // Map authors only. The body is the raw image (main.ts parses image/* as a
  // Buffer, capped at 1MB). Responds with the URL to store on the object.
  @Post()
  @UseGuards(UserAuthGuard)
  async upload(@Req() req: AuthedRequest) {
    await this.limiter.hit(
      `upload:${req.auth.sub}`,
      UPLOAD_LIMIT,
      UPLOAD_WINDOW_SECONDS,
    );
    const body: unknown = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0)
      throw new BadRequestException('이미지 파일을 보내 주세요. (png, jpg, webp / 최대 1MB)');
    const ext = sniffExtension(body);
    if (!ext) throw new BadRequestException('png, jpg, webp 이미지만 올릴 수 있습니다.');

    const name = `${randomUUID()}.${ext}`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(join(UPLOAD_DIR, name), body);
    return { url: `/api/uploads/${name}` };
  }

  // Public: players (including guests) see these inside a shared map. The names
  // are random UUIDs and the pattern below keeps anything else off the disk path.
  @Get(':name')
  serve(@Param('name') name: string, @Res() res: Response) {
    const match = FILE_NAME.exec(name);
    if (!match) throw new NotFoundException();
    const ext = match[1] as keyof typeof MIME_BY_EXT;
    res.set({
      'Content-Type': MIME_BY_EXT[ext],
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.sendFile(name, { root: UPLOAD_DIR }, (error) => {
      if (error && !res.headersSent) res.status(404).end();
    });
  }
}
