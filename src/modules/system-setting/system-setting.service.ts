import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/cache/redis.service';

const SETTINGS_CACHE_KEY = 'system:settings';
const SETTINGS_TTL = 600; // 10분

const DEFAULT_SETTINGS: Record<string, { value: any; description: string }> = {
  max_concurrent_requests: { value: 3, description: '동시 견적요청 제한' },
  estimate_expiry_days: { value: 3, description: '견적 만료 일수' },
  request_expiry_days: { value: 7, description: '견적요청 만료 일수' },
  auto_complete_hours: { value: 48, description: '완료보고 자동확정 시간' },
  free_trial_months: { value: 3, description: '무료 체험 기간 (개월)' },
  subscription_expiry_warning_days: { value: 7, description: '구독 만료 알림 일수' },
  basic_daily_estimate_limit: { value: 3, description: 'Basic 일일 견적 한도' },
  pro_daily_estimate_limit: { value: 10, description: 'Pro 일일 견적 한도' },
  premium_daily_estimate_limit: { value: 50, description: 'Premium 일일 견적 한도' },
  payment_bank_name: { value: '', description: '입금 은행명' },
  payment_bank_account: { value: '', description: '입금 계좌번호' },
  payment_account_holder: { value: '', description: '예금주' },
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
