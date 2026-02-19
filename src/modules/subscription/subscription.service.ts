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

const TIER_PRIORITY: Record<string, number> = { BASIC: 1, PRO: 2, PREMIUM: 3 };

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

  /** 구독 생성 (applySubscription 로직) */
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

    // 현재 ACTIVE 구독 조회 (최대 1개)
    const activeSub = await this.prisma.companySubscription.findFirst({
      where: {
        companyId,
        status: 'ACTIVE',
        currentPeriodEnd: { gte: new Date() },
      },
      include: { plan: true },
    });

    let result: any;

    if (!activeSub) {
      // ACTIVE 구독 없음 → 신규 생성
      result = await this.activateNewSubscription(companyId, plan, company.userId);
    } else {
      const currentTierPriority = TIER_PRIORITY[activeSub.plan.tier] ?? 0;
      const newTierPriority = TIER_PRIORITY[plan.tier] ?? 0;

      if (activeSub.plan.tier === plan.tier) {
        // 같은 등급 → 기간 합산
        result = await this.extendExistingSubscription(activeSub, plan, company.userId);
      } else if (newTierPriority > currentTierPriority) {
        // 상위 등급 → 업그레이드
        result = await this.upgradeSubscription(companyId, activeSub, plan, company.userId);
      } else {
        // 하위 등급 → 다운그레이드
        result = await this.downgradeSubscription(companyId, activeSub, plan, company.userId);
      }
    }

    // 캐시 무효화
    await this.redis.del(`subscription:active:${companyId}`);

    return result;
  }

  /** 신규 구독 활성화 */
  private async activateNewSubscription(
    companyId: string,
    plan: any,
    userId: string,
  ) {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + plan.durationMonths);

    const subscription = await this.prisma.companySubscription.create({
      data: {
        companyId,
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: endDate,
        isTrial: false,
      },
      include: { plan: true },
    });

    this.eventEmitter.emit(
      NOTIFICATION_EVENTS.SUBSCRIPTION_CREATED,
      new NotificationEvent(
        userId,
        'SUBSCRIPTION_CREATED',
        '구독이 시작되었습니다',
        `${plan.name} 구독이 활성화되었습니다. (${plan.durationMonths}개월)`,
        { subscriptionId: subscription.id, planName: plan.name },
      ),
    );

    return subscription;
  }

  /** 같은 등급 기간 합산 */
  private async extendExistingSubscription(
    activeSub: any,
    newPlan: any,
    userId: string,
  ) {
    const newEnd = new Date(activeSub.currentPeriodEnd);
    newEnd.setMonth(newEnd.getMonth() + newPlan.durationMonths);

    const updated = await this.prisma.companySubscription.update({
      where: { id: activeSub.id },
      data: {
        currentPeriodEnd: newEnd,
        isTrial: false,
      },
      include: { plan: true },
    });

    this.eventEmitter.emit(
      NOTIFICATION_EVENTS.SUBSCRIPTION_CREATED,
      new NotificationEvent(
        userId,
        'SUBSCRIPTION_CREATED',
        '구독이 연장되었습니다',
        `${newPlan.name} 구독이 ${newPlan.durationMonths}개월 연장되었습니다.`,
        { subscriptionId: updated.id, planName: newPlan.name },
      ),
    );

    return updated;
  }

  /** 업그레이드 (하위 → 상위) */
  private async upgradeSubscription(
    companyId: string,
    activeSub: any,
    newPlan: any,
    userId: string,
  ) {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + newPlan.durationMonths);

    const result = await this.prisma.$transaction(async (tx) => {
      // 기존 구독 일시정지
      await tx.companySubscription.update({
        where: { id: activeSub.id },
        data: {
          status: 'PAUSED',
          pausedAt: now,
        },
      });

      // 새 상위 구독 활성화
      const newSub = await tx.companySubscription.create({
        data: {
          companyId,
          planId: newPlan.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: endDate,
          isTrial: false,
        },
        include: { plan: true },
      });

      return newSub;
    });

    this.eventEmitter.emit(
      NOTIFICATION_EVENTS.SUBSCRIPTION_CREATED,
      new NotificationEvent(
        userId,
        'SUBSCRIPTION_CREATED',
        '구독이 업그레이드되었습니다',
        `${newPlan.name} 구독으로 업그레이드되었습니다. 기존 ${activeSub.plan.tier} 구독의 남은 기간은 보존됩니다.`,
        { subscriptionId: result.id, planName: newPlan.name },
      ),
    );

    return result;
  }

  /** 다운그레이드 (상위 → 하위) */
  private async downgradeSubscription(
    companyId: string,
    activeSub: any,
    newPlan: any,
    userId: string,
  ) {
    const now = new Date();
    // 임시 기간값 (활성화 시 재계산)
    const tempEnd = new Date(now);
    tempEnd.setMonth(tempEnd.getMonth() + newPlan.durationMonths);

    const queuedSub = await this.prisma.companySubscription.create({
      data: {
        companyId,
        planId: newPlan.id,
        status: 'QUEUED',
        currentPeriodStart: now,
        currentPeriodEnd: tempEnd,
        isTrial: false,
      },
      include: { plan: true },
    });

    this.eventEmitter.emit(
      NOTIFICATION_EVENTS.SUBSCRIPTION_CREATED,
      new NotificationEvent(
        userId,
        'SUBSCRIPTION_CREATED',
        '구독이 예약되었습니다',
        `${newPlan.name} 구독이 대기 중입니다. 현재 ${activeSub.plan.tier} 구독 만료 후 자동으로 활성화됩니다.`,
        { subscriptionId: queuedSub.id, planName: newPlan.name },
      ),
    );

    return queuedSub;
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

  /** 활성 구독 중 가장 높은 tier 반환 (getActiveSubscription의 alias) */
  async getHighestActiveSubscription(
    companyId: string,
  ): Promise<ActiveSubscriptionInfo | null> {
    return this.getActiveSubscription(companyId);
  }

  /** 구독 스택 조회 (ACTIVE + PAUSED + QUEUED) */
  async getSubscriptionStack(companyId: string) {
    return this.prisma.companySubscription.findMany({
      where: {
        companyId,
        status: { in: ['ACTIVE', 'PAUSED', 'QUEUED'] },
      },
      include: { plan: true },
      orderBy: { plan: { priorityWeight: 'desc' } },
    });
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

  /** 관리자 구독 개별 취소 (subscriptionId 기반) */
  async cancelSubscriptionById(subscriptionId: string) {
    const subscription = await this.prisma.companySubscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });
    if (!subscription) {
      throw new NotFoundException('구독을 찾을 수 없습니다.');
    }

    const { companyId, status } = subscription;

    if (status === 'ACTIVE') {
      // ACTIVE → CANCELLED + cancelledAt 설정, 후속 구독 재개/활성화
      await this.prisma.$transaction(async (tx) => {
        await tx.companySubscription.update({
          where: { id: subscriptionId },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });

        // PAUSED 재개 시도, 없으면 QUEUED 활성화
        const resumed = await this.resumeHighestPausedSubscription(tx, companyId);
        if (!resumed) {
          await this.activateHighestQueuedSubscription(tx, companyId);
        }
      });
    } else if (status === 'PAUSED') {
      // PAUSED → EXPIRED + pausedAt null
      await this.prisma.companySubscription.update({
        where: { id: subscriptionId },
        data: { status: 'EXPIRED', pausedAt: null },
      });
    } else if (status === 'QUEUED') {
      // QUEUED → EXPIRED
      await this.prisma.companySubscription.update({
        where: { id: subscriptionId },
        data: { status: 'EXPIRED' },
      });
    } else {
      throw new BadRequestException(
        `취소할 수 없는 상태입니다: ${status}`,
      );
    }

    await this.redis.del(`subscription:active:${companyId}`);

    return { message: '구독이 관리자에 의해 취소되었습니다.' };
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
    const subscription = await this.getActiveSubscription(companyId);
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

  /** 만료 구독 처리 + 자동 재개/활성화 (cron용) */
  async expireOverdueSubscriptions(): Promise<number> {
    const now = new Date();

    // 만료 대상 구독 조회
    const overdueSubscriptions = await this.prisma.companySubscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'CANCELLED'] },
        currentPeriodEnd: { lt: now },
      },
      include: {
        company: { select: { id: true, userId: true } },
      },
    });

    if (overdueSubscriptions.length === 0) return 0;

    // companyId별 그룹화
    const byCompany = new Map<string, typeof overdueSubscriptions>();
    for (const sub of overdueSubscriptions) {
      const group = byCompany.get(sub.companyId) || [];
      group.push(sub);
      byCompany.set(sub.companyId, group);
    }

    let totalExpired = 0;

    for (const [companyId, subs] of byCompany) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // a. 만료 대상 → EXPIRED
          const subIds = subs.map((s) => s.id);
          await tx.companySubscription.updateMany({
            where: { id: { in: subIds } },
            data: { status: 'EXPIRED' },
          });
          totalExpired += subIds.length;

          // b. PAUSED 중 가장 높은 등급 재개
          const resumed = await this.resumeHighestPausedSubscription(tx, companyId);

          // c. PAUSED 없으면 QUEUED 중 가장 높은 등급 활성화
          if (!resumed) {
            await this.activateHighestQueuedSubscription(tx, companyId);
          }
        });

        // 캐시 무효화
        await this.redis.del(`subscription:active:${companyId}`);

        // 만료 알림
        const userId = subs[0]?.company?.userId;
        if (userId) {
          this.eventEmitter.emit(
            NOTIFICATION_EVENTS.SUBSCRIPTION_EXPIRED,
            new NotificationEvent(
              userId,
              'SUBSCRIPTION_EXPIRED',
              '구독이 만료되었습니다',
              '구독이 만료되었습니다. 서비스 이용을 위해 구독을 갱신해주세요.',
              { companyId },
            ),
          );
        }
      } catch (error) {
        this.logger.error(`구독 만료 처리 실패: companyId=${companyId}`, error);
      }
    }

    if (totalExpired > 0) {
      this.logger.log(`${totalExpired}개 구독이 만료 처리되었습니다.`);
    }

    return totalExpired;
  }

  /** PAUSED 구독 재개 (가장 높은 등급) */
  private async resumeHighestPausedSubscription(
    tx: any,
    companyId: string,
  ): Promise<boolean> {
    const paused = await tx.companySubscription.findFirst({
      where: { companyId, status: 'PAUSED' },
      include: { plan: true },
      orderBy: { plan: { priorityWeight: 'desc' } },
    });

    if (!paused || !paused.pausedAt) return false;

    const remainingMs =
      paused.currentPeriodEnd.getTime() - paused.pausedAt.getTime();

    if (remainingMs <= 0) {
      await tx.companySubscription.update({
        where: { id: paused.id },
        data: { status: 'EXPIRED', pausedAt: null },
      });
      return false;
    }

    const now = new Date();
    const newEnd = new Date(now.getTime() + remainingMs);

    await tx.companySubscription.update({
      where: { id: paused.id },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: newEnd,
        pausedAt: null,
      },
    });

    this.logger.log(
      `PAUSED 구독 재개: companyId=${companyId}, tier=${paused.plan.tier}, 남은기간=${Math.ceil(remainingMs / 86400000)}일`,
    );

    return true;
  }

  /** QUEUED 구독 활성화 (가장 높은 등급) */
  private async activateHighestQueuedSubscription(
    tx: any,
    companyId: string,
  ): Promise<boolean> {
    const queued = await tx.companySubscription.findFirst({
      where: { companyId, status: 'QUEUED' },
      include: { plan: true },
      orderBy: { plan: { priorityWeight: 'desc' } },
    });

    if (!queued) return false;

    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + queued.plan.durationMonths);

    await tx.companySubscription.update({
      where: { id: queued.id },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: endDate,
      },
    });

    this.logger.log(
      `QUEUED 구독 활성화: companyId=${companyId}, tier=${queued.plan.tier}, ${queued.plan.durationMonths}개월`,
    );

    return true;
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
