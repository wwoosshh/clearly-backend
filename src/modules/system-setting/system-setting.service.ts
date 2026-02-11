import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/cache/redis.service';

const SETTINGS_CACHE_KEY = 'system:settings';
const SETTINGS_TTL = 600; // 10분

const DEFAULT_SETTINGS: Record<string, { value: any; description: string }> = {
  estimate_point_cost: { value: 50, description: '견적 제출 포인트 비용' },
  welcome_point_amount: { value: 500, description: '신규 업체 환영 포인트' },
  max_concurrent_requests: { value: 3, description: '동시 견적요청 제한' },
  estimate_expiry_days: { value: 3, description: '견적 만료 일수' },
  request_expiry_days: { value: 7, description: '견적요청 만료 일수' },
  auto_complete_hours: { value: 48, description: '완료보고 자동확정 시간' },
  auto_refund_rate: { value: 50, description: '자동거절 환불율 (%)' },
  tier_certified_min_rating: { value: 3.5, description: '인증등급 최소 평점' },
  tier_certified_min_reviews: { value: 3, description: '인증등급 최소 리뷰' },
  tier_premium_min_rating: { value: 4.0, description: '프리미엄 최소 평점' },
  tier_premium_min_reviews: { value: 10, description: '프리미엄 최소 리뷰' },
  warning_cancellation_threshold: { value: 20, description: '경고 취소율 (%)' },
  suspend_cancellation_threshold: { value: 35, description: '정지 취소율 (%)' },
};

@Injectable()
export class SystemSettingService implements OnModuleInit {
  private readonly logger = new Logger(SystemSettingService.name);
  private cache = new Map<string, any>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    await this.seedDefaults();
    await this.loadAll();
  }

  async loadAll(): Promise<void> {
    const settings = await this.prisma.systemSetting.findMany();
    this.cache.clear();
    const redisMap: Record<string, any> = {};
    for (const s of settings) {
      try {
        const parsed = JSON.parse(s.value);
        this.cache.set(s.key, parsed);
        redisMap[s.key] = parsed;
      } catch {
        this.cache.set(s.key, s.value);
        redisMap[s.key] = s.value;
      }
    }
    // Redis에도 동기화
    await this.redis.set(SETTINGS_CACHE_KEY, redisMap, SETTINGS_TTL);
    this.logger.log(`시스템 설정 로드 완료: ${this.cache.size}개`);
  }

  get<T>(key: string, defaultValue: T): T {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }
    return defaultValue;
  }

  async set(key: string, value: any, description?: string): Promise<void> {
    const stringValue = JSON.stringify(value);
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: stringValue, ...(description ? { description } : {}) },
      create: { key, value: stringValue, description },
    });
    this.cache.set(key, value);
    // Redis 캐시 무효화 (다른 인스턴스에서도 재로드하도록)
    await this.redis.del(SETTINGS_CACHE_KEY);
  }

  async getAll(): Promise<Record<string, any>> {
    const settings = await this.prisma.systemSetting.findMany();
    const result: Record<string, any> = {};
    for (const s of settings) {
      try {
        result[s.key] = {
          value: JSON.parse(s.value),
          description: s.description,
          updatedAt: s.updatedAt,
        };
      } catch {
        result[s.key] = {
          value: s.value,
          description: s.description,
          updatedAt: s.updatedAt,
        };
      }
    }
    return result;
  }

  async seedDefaults(): Promise<void> {
    for (const [key, { value, description }] of Object.entries(
      DEFAULT_SETTINGS,
    )) {
      const existing = await this.prisma.systemSetting.findUnique({
        where: { key },
      });
      if (!existing) {
        await this.prisma.systemSetting.create({
          data: { key, value: JSON.stringify(value), description },
        });
        this.logger.log(`기본 설정 생성: ${key} = ${value}`);
      }
    }
  }
}
