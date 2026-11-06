import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt, randomUUID } from 'node:crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { PasswordService } from './password.service';
import { RateLimiterService } from './rate-limiter.service';
import type { AuthPayload } from './auth.types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NICKNAME_BASE_MAX = 24; // + "#" + 4-char tag must fit varchar(30)
const TAG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const TAG_RETRIES = 8;

const USER_TOKEN_TTL = '7d';
const GUEST_TOKEN_TTL = '12h';

const LOGIN_FAIL_LIMIT = 5; // per (ip, email)
const LOGIN_IP_FAIL_LIMIT = 30; // per ip
const LOGIN_WINDOW_SECONDS = 15 * 60;
const SIGNUP_LIMIT = 10; // per ip
const SIGNUP_WINDOW_SECONDS = 60 * 60;

const GENERIC_LOGIN_ERROR = '이메일 또는 비밀번호가 올바르지 않습니다.';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    private readonly limiter: RateLimiterService,
  ) {}

  // --- signup / login -----------------------------------------------------

  async signup(input: { email?: unknown; password?: unknown; nickname?: unknown }, ip: string) {
    await this.limiter.hit(`signup:${ip}`, SIGNUP_LIMIT, SIGNUP_WINDOW_SECONDS);

    const email = this.parseEmail(input.email);
    const password = this.parsePassword(input.password);
    const base = this.parseNicknameBase(input.nickname);
    const passwordHash = await this.passwords.hash(password);

    for (let attempt = 0; attempt < TAG_RETRIES; attempt += 1) {
      try {
        const user = await this.users.save(
          this.users.create({
            provider: 'local',
            provider_user_id: email,
            email,
            password_hash: passwordHash,
            nickname: `${base}#${this.randomTag()}`,
            last_login_at: new Date(),
          }),
        );
        return this.issueUserToken(user);
      } catch (error) {
        const constraint = this.uniqueViolationConstraint(error);
        if (!constraint) throw error;
        if (constraint.includes('nickname')) continue; // tag collided, roll a new one
        throw new ConflictException('이미 가입된 이메일입니다.');
      }
    }
    throw new ConflictException('닉네임 생성에 실패했습니다. 다시 시도해 주세요.');
  }

  async login(input: { email?: unknown; password?: unknown }, ip: string) {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!email || !password || password.length > 128) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    // Only failures are counted, and a blocked key is rejected before any
    // password work happens.
    const pairKey = `login:${ip}:${email}`;
    const ipKey = `login-ip:${ip}`;
    await this.limiter.assertBelow(pairKey, LOGIN_FAIL_LIMIT);
    await this.limiter.assertBelow(ipKey, LOGIN_IP_FAIL_LIMIT);

    const user = await this.users.findOne({ where: { provider: 'local', email } });
    const valid = user?.password_hash
      ? await this.passwords.verify(user.password_hash, password)
      : (await this.passwords.verifyAgainstDummy(password), false);

    if (!user || !valid) {
      await this.limiter.count(pairKey, LOGIN_WINDOW_SECONDS);
      await this.limiter.count(ipKey, LOGIN_WINDOW_SECONDS);
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    await this.limiter.reset(pairKey);
    await this.users.update(user.id, { last_login_at: new Date() });
    return this.issueUserToken(user);
  }

  // --- guests --------------------------------------------------------------

  async createGuest(input: { nickname?: unknown }) {
    const base = this.parseNicknameBase(input.nickname);
    // Guests don't get a users row, but must not be able to pass as a real
    // account, so the generated nickname is checked against users.nickname.
    for (let attempt = 0; attempt < TAG_RETRIES; attempt += 1) {
      const nickname = `${base}#${this.randomTag()}`;
      if (await this.users.exists({ where: { nickname } })) continue;
      const payload: AuthPayload = { sub: randomUUID(), kind: 'guest', nickname, role: 'guest' };
      const token = await this.jwt.signAsync(payload, { expiresIn: GUEST_TOKEN_TTL });
      return { token, maxAgeMs: 12 * 60 * 60 * 1000, user: this.publicGuest(payload) };
    }
    throw new ConflictException('닉네임 생성에 실패했습니다. 다시 시도해 주세요.');
  }

  // --- current identity ----------------------------------------------------

  async verifyToken(token: string | undefined): Promise<AuthPayload | null> {
    if (!token) return null;
    try {
      return await this.jwt.verifyAsync<AuthPayload>(token);
    } catch {
      return null;
    }
  }

  async describe(payload: AuthPayload | null) {
    if (!payload) return null;
    if (payload.kind === 'guest') return this.publicGuest(payload);
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user) return null; // account deleted since the token was issued
    return { id: user.id, kind: 'user' as const, nickname: user.nickname, email: user.email, role: user.role };
  }

  // --- helpers --------------------------------------------------------------

  private async issueUserToken(user: UserEntity) {
    const payload: AuthPayload = { sub: user.id, kind: 'user', nickname: user.nickname, role: user.role };
    const token = await this.jwt.signAsync(payload, { expiresIn: USER_TOKEN_TTL });
    return {
      token,
      maxAgeMs: 7 * 24 * 60 * 60 * 1000,
      user: { id: user.id, kind: 'user' as const, nickname: user.nickname, email: user.email, role: user.role },
    };
  }

  private publicGuest(payload: AuthPayload) {
    return { id: payload.sub, kind: 'guest' as const, nickname: payload.nickname, role: 'guest' as const };
  }

  private parseEmail(value: unknown) {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!EMAIL_PATTERN.test(email) || email.length > 255) {
      throw new BadRequestException('올바른 이메일 형식이 아닙니다.');
    }
    return email;
  }

  private parsePassword(value: unknown) {
    if (typeof value !== 'string' || value.length < 8) {
      throw new BadRequestException('비밀번호는 8자 이상이어야 합니다.');
    }
    // Upper bound keeps argon2 from being used as a CPU/memory amplifier.
    if (value.length > 128) throw new BadRequestException('비밀번호는 128자 이하여야 합니다.');
    return value;
  }

  private parseNicknameBase(value: unknown) {
    const base = typeof value === 'string' ? value.trim() : '';
    if (!base || base.length > NICKNAME_BASE_MAX) {
      throw new BadRequestException(`닉네임은 1~${NICKNAME_BASE_MAX}자여야 합니다.`);
    }
    // '#' is reserved for the generated tag; control chars would break display.
    if (base.includes('#') || /[\u0000-\u001f\u007f]/.test(base)) {
      throw new BadRequestException('닉네임에 사용할 수 없는 문자가 있습니다.');
    }
    return base;
  }

  private randomTag() {
    let tag = '';
    for (let i = 0; i < 4; i += 1) tag += TAG_ALPHABET[randomInt(TAG_ALPHABET.length)];
    return tag;
  }

  private uniqueViolationConstraint(error: unknown): string | null {
    if (!(error instanceof QueryFailedError)) return null;
    const driver = (error as QueryFailedError & { driverError?: { code?: string; constraint?: string } })
      .driverError;
    return driver?.code === '23505' ? (driver.constraint ?? '') : null;
  }
}
