import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/cache/redis.service';
import { SubscriptionTier, SubscriptionStatus } from '@prisma/client';
import {
  ActiveSubscriptionInfo,
  EstimateLimitInfo,
  GroupedPlans,
} from './types/subscription.types';
import { NOTIFICATION_EVENTS, NotificationEvent } from '../notification/notification.events';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** 활성 플랜 목록 조회 (tier별 그룹화) */
  async getPlans(): Promise<GroupedPlans> {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    });

    const grouped: GroupedPlans = { BASIC: [], PRO: [], PREMIUM: [] };
    for (const plan of plans) {
      const info = {
        id: plan.id,
        name: plan.name,
        tier: plan.tier,
        durationMonths: plan.durationMonths,
        price: plan.price,
        dailyEstimateLimit: plan.dailyEstimateLimit,
        priorityWeight: Number(plan.priorityWeight),
        features: plan.features,
      };
      grouped[plan.tier].push(info);
    }

    return grouped;
  }

  /** 구독 생성 */
  async createSubscription(
    companyId: string,
    planId: string,
  ): Promise<any> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('업체를 찾을 수 없습니다.');

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan || !plan.isActive) {
      throw new BadRequestException('유효하지 않은 구독 플랜입니다.');
    }

    // Pro/Premium은 Basic 활성 구독이 필요
    if (plan.tier !== 'BASIC') {
      const activeBasic = await this.prisma.companySubscription.findFirst({
        where: {
          companyId,
          status: 'ACTIVE',
          plan: { tier: 'BASIC' },
        },
        include: { plan: true },
      });
      if (!activeBasic) {
        throw new BadRequestException(
          'Pro/Premium 구독은 Basic 구독이 활성 상태여야 합니다.',
        );
      }
    }

    // 같은 tier의 활성 구독이 있는지 확인
    const existingActive = await this.prisma.companySubscription.findFirst({
      where: {
        companyId,
        status: 'ACTIVE',
        plan: { tier: plan.tier },
      },
    });
    if (existingActive) {
      throw new BadRequestException(
        `이미 활성화된 ${plan.tier} 구독이 있습니다.`,
      );
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + plan.durationMonths);

    const subscription = await this.prisma.companySubscription.create({
      data: {
        companyId,
        planId,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: endDate,
        isTrial: false,
      },
      include: { plan: true },
    });

    // 캐시 무효화
    await this.redis.del(`subscription:active:${companyId}`);

    // 알림
    this.eventEmitter.emit(
      NOTIFICATION_EVENTS.SUBSCRIPTION_CREATED,
      new NotificationEvent(
        company.userId,
        'SUBSCRIPTION_CREATED',
        '구독이 시작되었습니다',
        `${plan.name} 구독이 활성화되었습니다. (${plan.durationMonths}개월)`,
        { subscriptionId: subscription.id, planName: plan.name },
      ),
    );

    return subscription;
  }

  /** 3개월 무료 Basic 구독 생성 (업체 승인 시 호출) */
  async createFreeTrial(companyId: string): Promise<any> {
    const basicPlan = await this.prisma.subscriptionPlan.findFirst({
      where: { tier: 'BASIC', durationMonths: 3, isActive: true },
    });
    if (!basicPlan) {
      this.logger.warn('3개월 Basic 플랜을 찾을 수 없습니다.');
      return null;
    }

    // 이미 구독이 있는지 확인
    const existing = await this.prisma.companySubscription.findFirst({
      where: { companyId },
    });
    if (existing) return existing;

    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 3);

    const subscription = await this.prisma.companySubscription.create({
      data: {
        companyId,
        planId: basicPlan.id,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: endDate,
        isTrial: true,
      },
      include: { plan: true },
    });

    await this.redis.del(`subscription:active:${companyId}`);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (company) {
      this.eventEmitter.emit(
        NOTIFICATION_EVENTS.SUBSCRIPTION_CREATED,
        new NotificationEvent(
          company.userId,
          'SUBSCRIPTION_CREATED',
          '무료 체험이 시작되었습니다',
          'Basic 3개월 무료 체험이 활성화되었습니다.',
          { subscriptionId: subscription.id, isTrial: true },
        ),
      );
    }

    return subscription;
  }

  /** 활성 구독 조회 (5분 Redis 캐시) */
  async getActiveSubscription(
    companyId: string,
  ): Promise<ActiveSubscriptionInfo | null> {
    const cacheKey = `subscription:active:${companyId}`;
    const cached = await this.redis.get<ActiveSubscriptionInfo>(cacheKey);
    if (cached) return cached;

    const subscription = await this.prisma.companySubscription.findFirst({
      where: {
        companyId,
        status: 'ACTIVE',
        currentPeriodEnd: { gte: new Date() },
      },
      include: { plan: true },
      orderBy: { plan: { priorityWeight: 'desc' } },
    });

    if (!subscription) return null;

    const info: ActiveSubscriptionInfo = {
      id: subscription.id,
      companyId: subscription.companyId,
      tier: subscription.plan.tier,
      status: subscription.status,
      planName: subscription.plan.name,
      dailyEstimateLimit: subscription.plan.dailyEstimateLimit,
      priorityWeight: Number(subscription.plan.priorityWeight),
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      isTrial: subscription.isTrial,
      cancelledAt: subscription.cancelledAt,
    };

    await this.redis.set(cacheKey, info, 300);
    return info;
  }

  /** 활성 구독 중 가장 높은 tier 반환 */
  async getHighestActiveSubscription(
    companyId: string,
  ): Promise<ActiveSubscriptionInfo | null> {
    const cacheKey = `subscription:active:${companyId}`;
    const cached = await this.redis.get<ActiveSubscriptionInfo>(cacheKey);
    if (cached) return cached;

    const subscriptions = await this.prisma.companySubscription.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
        currentPeriodEnd: { gte: new Date() },
      },
      include: { plan: true },
      orderBy: { plan: { priorityWeight: 'desc' } },
    });

    if (subscriptions.length === 0) return null;

    // 가장 높은 tier 구독 반환
    const best = subscriptions[0];
    // dailyEstimateLimit은 가장 높은 것 사용
    const maxLimit = Math.max(
      ...subscriptions.map((s) => s.plan.dailyEstimateLimit),
    );

    const info: ActiveSubscriptionInfo = {
      id: best.id,
      companyId: best.companyId,
      tier: best.plan.tier,
      status: best.status,
      planName: best.plan.name,
      dailyEstimateLimit: maxLimit,
      priorityWeight: Number(best.plan.priorityWeight),
      currentPeriodStart: best.currentPeriodStart,
      currentPeriodEnd: best.currentPeriodEnd,
      isTrial: best.isTrial,
      cancelledAt: best.cancelledAt,
    };

    await this.redis.set(cacheKey, info, 300);
    return info;
  }

  /** 구독 이력 조회 */
  async getSubscriptionHistory(
    companyId: string,
    page: number,
    limit: number,
  ) {
    const [data, total] = await Promise.all([
      this.prisma.companySubscription.findMany({
        where: { companyId },
        include: { plan: true, payments: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.companySubscription.count({ where: { companyId } }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** 구독 해지 (기간 만료 시 종료) */
  async cancelSubscription(companyId: string) {
    const active = await this.prisma.companySubscription.findFirst({
      where: { companyId, status: 'ACTIVE' },
      include: { plan: true },
      orderBy: { plan: { priorityWeight: 'desc' } },
    });

    if (!active) {
      throw new BadRequestException('활성화된 구독이 없습니다.');
    }

    await this.prisma.companySubscription.update({
      where: { id: active.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    await this.redis.del(`subscription:active:${companyId}`);

    return { message: '구독이 해지되었습니다. 남은 기간까지 이용 가능합니다.' };
  }

  /** 관리자 구독 연장 */
  async extendSubscription(subscriptionId: string, months: number) {
    const subscription = await this.prisma.companySubscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!subscription) {
      throw new NotFoundException('구독을 찾을 수 없습니다.');
    }

    const newEnd = new Date(subscription.currentPeriodEnd);
    newEnd.setMonth(newEnd.getMonth() + months);

    const updated = await this.prisma.companySubscription.update({
      where: { id: subscriptionId },
      data: {
        currentPeriodEnd: newEnd,
        status: 'ACTIVE',
      },
      include: { plan: true },
    });

    await this.redis.del(`subscription:active:${subscription.companyId}`);
    return updated;
  }

  /** 일일 견적 한도 확인 */
  async canSubmitEstimate(companyId: string): Promise<EstimateLimitInfo> {
    const subscription = await this.getHighestActiveSubscription(companyId);
    if (!subscription) {
      return { used: 0, limit: 0, remaining: 0, resetAt: '' };
    }

    const today = this.getKSTDateString();
    const redisKey = `estimate:daily:${companyId}:${today}`;
    const used = (await this.redis.get<number>(redisKey)) || 0;
    const limit = subscription.dailyEstimateLimit;

    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      resetAt: this.getKSTMidnightISO(),
    };
  }

  /** 견적 제출 카운터 증가 */
  async incrementEstimateCount(companyId: string): Promise<void> {
    const today = this.getKSTDateString();
    const redisKey = `estimate:daily:${companyId}:${today}`;
    const current = (await this.redis.get<number>(redisKey)) || 0;

    // KST 자정까지 남은 초 계산
    const ttl = this.getSecondsUntilKSTMidnight();
    await this.redis.set(redisKey, current + 1, ttl);
  }

  /** 만료 구독 일괄 처리 (cron용) */
  async expireOverdueSubscriptions(): Promise<number> {
    const result = await this.prisma.companySubscription.updateMany({
      where: {
        status: { in: ['ACTIVE', 'CANCELLED'] },
        currentPeriodEnd: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    if (result.count > 0) {
      this.logger.log(`${result.count}개 구독이 만료 처리되었습니다.`);

      // 만료된 구독의 캐시 무효화
      const expired = await this.prisma.companySubscription.findMany({
        where: { status: 'EXPIRED' },
        select: { companyId: true, company: { select: { userId: true } } },
        distinct: ['companyId'],
      });

      for (const sub of expired) {
        await this.redis.del(`subscription:active:${sub.companyId}`);
        this.eventEmitter.emit(
          NOTIFICATION_EVENTS.SUBSCRIPTION_EXPIRED,
          new NotificationEvent(
            sub.company.userId,
            'SUBSCRIPTION_EXPIRED',
            '구독이 만료되었습니다',
            '구독이 만료되었습니다. 서비스 이용을 위해 구독을 갱신해주세요.',
            { companyId: sub.companyId },
          ),
        );
      }
    }

    return result.count;
  }

  /** 만료 임박 구독 조회 (cron용) */
  async findExpiringSoon(withinDays: number) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + withinDays);

    return this.prisma.companySubscription.findMany({
      where: {
        status: 'ACTIVE',
        currentPeriodEnd: {
          gte: new Date(),
          lte: futureDate,
        },
      },
      include: {
        plan: true,
        company: { select: { id: true, userId: true, businessName: true } },
      },
    });
  }

  /** 결제 기록 (관리자 확인용) */
  async recordPayment(
    subscriptionId: string,
    amount: number,
    method?: string,
  ) {
    return this.prisma.payment.create({
      data: {
        subscriptionId,
        amount,
        paymentMethod: method || 'MANUAL',
        status: 'COMPLETED',
      },
    });
  }

  // ── 유틸리티 메서드 ──

  /** KST 날짜 문자열 (YYYY-MM-DD) */
  private getKSTDateString(): string {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().split('T')[0];
  }

  /** KST 자정 ISO 문자열 */
  private getKSTMidnightISO(): string {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const tomorrow = new Date(kst);
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    // KST 자정 = UTC 15:00 (전날)
    const utcMidnight = new Date(tomorrow.getTime() - 9 * 60 * 60 * 1000);
    return utcMidnight.toISOString();
  }

  /** KST 자정까지 남은 초 */
  private getSecondsUntilKSTMidnight(): number {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const tomorrow = new Date(kst);
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const utcMidnight = new Date(tomorrow.getTime() - 9 * 60 * 60 * 1000);
    return Math.max(1, Math.floor((utcMidnight.getTime() - now.getTime()) / 1000));
  }
}
