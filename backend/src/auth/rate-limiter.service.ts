import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

// Fixed-window counters in Redis.
@Injectable()
export class RateLimiterService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  // Counts one event and throws 429 if that pushes the key over `limit`.
  async hit(key: string, limit: number, windowSeconds: number) {
    const count = await this.count(key, windowSeconds);
    if (count > limit) await this.throwBlocked(key);
  }

  // Counts one event without judging it.
  async count(key: string, windowSeconds: number) {
    const redisKey = `ratelimit:${key}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) await this.redis.expire(redisKey, windowSeconds);
    return count;
  }

  // Throws 429 when the key has already reached `limit`, without counting.
  async assertBelow(key: string, limit: number) {
    const count = Number((await this.redis.get(`ratelimit:${key}`)) ?? 0);
    if (count >= limit) await this.throwBlocked(key);
  }

  reset(key: string) {
    return this.redis.del(`ratelimit:${key}`);
  }

  private async throwBlocked(key: string): Promise<never> {
    const retryAfter = Math.max(await this.redis.ttl(`ratelimit:${key}`), 1);
    throw new HttpException(
      { message: '시도 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.', retryAfterSeconds: retryAfter },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
