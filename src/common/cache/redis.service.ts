import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis 연결 오류: ${err.message}`);
    });

    this.client.connect().catch((err) => {
      this.logger.warn(`Redis 연결 실패 (캐시 비활성화 상태로 계속): ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => {});
  }

  private isConnected(): boolean {
    return this.client?.status === 'ready';
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected()) return null;
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.isConnected()) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // 캐시 실패는 무시
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.isConnected() || keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch {
      // 캐시 삭제 실패는 무시
    }
  }

  /** 원자적 증가 (INCR) — 카운터 용도 */
  async incr(key: string, ttlSeconds?: number): Promise<number> {
    if (!this.isConnected()) return 0;
    try {
      const value = await this.client.incr(key);
      // 첫 증가 시(값이 1) TTL 설정
      if (value === 1 && ttlSeconds) {
        await this.client.expire(key, ttlSeconds);
      }
      return value;
    } catch {
      return 0;
    }
  }

  /** Set에 멤버 추가 (SADD) */
  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.isConnected() || members.length === 0) return 0;
    try {
      return await this.client.sadd(key, ...members);
    } catch {
      return 0;
    }
  }

  /** Set에서 멤버 제거 (SREM) */
  async srem(key: string, ...members: string[]): Promise<number> {
    if (!this.isConnected() || members.length === 0) return 0;
    try {
      return await this.client.srem(key, ...members);
    } catch {
      return 0;
    }
  }

  /** Set 멤버 조회 (SMEMBERS) */
  async smembers(key: string): Promise<string[]> {
    if (!this.isConnected()) return [];
    try {
      return await this.client.smembers(key);
    } catch {
      return [];
    }
  }

  /** 키에 TTL 설정 (EXPIRE) */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (!this.isConnected()) return;
    try {
      await this.client.expire(key, ttlSeconds);
    } catch {
      // 무시
    }
  }

  async delPattern(pattern: string): Promise<void> {
    if (!this.isConnected()) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch {
      // 패턴 삭제 실패는 무시
    }
  }
}
