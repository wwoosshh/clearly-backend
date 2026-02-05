import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemSettingService } from '../system-setting/system-setting.service';
import {
  NOTIFICATION_EVENTS,
  NotificationEvent,
} from '../notification/notification.events';
import { CompanyTier } from '@prisma/client';

@Injectable()
export class CompanyMetricsService {
  private readonly logger = new Logger(CompanyMetricsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async calculateMetrics(companyId: string) {
    const [
      totalEstimates,
      acceptedEstimates,
      totalMatchings,
      cancelledMatchings,
      allCustomerIds,
      totalReports,
    ] = await Promise.all([
      // 전체 제출 견적 수
      this.prisma.estimate.count({ where: { companyId } }),
      // 수락된 견적 수
      this.prisma.estimate.count({
        where: { companyId, status: 'ACCEPTED' },
      }),
      // 전체 매칭 수
      this.prisma.matching.count({ where: { companyId } }),
      // 취소된 매칭 수
      this.prisma.matching.count({
        where: { companyId, status: 'CANCELLED' },
      }),
      // 전체 고객 userId 목록
      this.prisma.matching.findMany({
        where: { companyId },
        select: { userId: true },
      }),
      // 업체 대상 신고 수
      this.prisma.report.count({
        where: { targetType: 'COMPANY', targetId: companyId },
      }),
    ]);

    // 견적전환율: 수락된 견적 / 전체 제출 견적 * 100
    const conversionRate =
      totalEstimates > 0 ? (acceptedEstimates / totalEstimates) * 100 : 0;

    // 취소율: 취소된 매칭 / 전체 매칭 * 100
    const cancellationRate =
      totalMatchings > 0 ? (cancelledMatchings / totalMatchings) * 100 : 0;

    // 재이용률: 2회 이상 매칭 고객 / 전체 고객 * 100
    const customerCounts = new Map<string, number>();
    for (const m of allCustomerIds) {
      customerCounts.set(m.userId, (customerCounts.get(m.userId) || 0) + 1);
    }
    const totalCustomers = customerCounts.size;
    const repeatCustomers = [...customerCounts.values()].filter(
      (c) => c >= 2,
    ).length;
    const repeatCustomerRate =
      totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;

    // 분쟁발생률: 업체 대상 신고 / 전체 매칭 * 100
    const disputeRate =
      totalMatchings > 0 ? (totalReports / totalMatchings) * 100 : 0;

    return {
      conversionRate: Math.round(conversionRate * 100) / 100,
      cancellationRate: Math.round(cancellationRate * 100) / 100,
      repeatCustomerRate: Math.round(repeatCustomerRate * 100) / 100,
      disputeRate: Math.round(disputeRate * 100) / 100,
    };
  }

  async updateCompanyMetrics(companyId: string) {
    const metrics = await this.calculateMetrics(companyId);
    const tier = await this.determineTier(companyId, metrics);

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        conversionRate: metrics.conversionRate,
        cancellationRate: metrics.cancellationRate,
        repeatCustomerRate: metrics.repeatCustomerRate,
        disputeRate: metrics.disputeRate,
        tier,
        metricsUpdatedAt: new Date(),
      },
    });

    return metrics;
  }

  async determineTier(
    companyId: string,
    metrics?: {
      conversionRate: number;
      cancellationRate: number;
      disputeRate: number;
    },
  ): Promise<CompanyTier> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        averageRating: true,
        totalReviews: true,
        totalMatchings: true,
        conversionRate: true,
        cancellationRate: true,
        disputeRate: true,
      },
    });

    if (!company) return 'STANDARD';

    const avgRating = Number(company.averageRating);
    const totalReviews = company.totalReviews;
    const totalMatchings = company.totalMatchings;
    const conversionRate = metrics
      ? metrics.conversionRate
      : Number(company.conversionRate ?? 0);
    const cancellationRate = metrics
      ? metrics.cancellationRate
      : Number(company.cancellationRate ?? 0);
    const disputeRate = metrics
      ? metrics.disputeRate
      : Number(company.disputeRate ?? 0);

    // PREMIUM 조건
    const premiumMinRating = this.settings.get('tier_premium_min_rating', 4.0);
    const premiumMinReviews = this.settings.get('tier_premium_min_reviews', 10);
    if (
      avgRating >= premiumMinRating &&
      totalReviews >= premiumMinReviews &&
      totalMatchings >= 20 &&
      conversionRate >= 50 &&
      cancellationRate < 8 &&
      disputeRate < 2
    ) {
      return 'PREMIUM';
    }

    // CERTIFIED 조건
    const certifiedMinRating = this.settings.get(
      'tier_certified_min_rating',
      3.5,
    );
    const certifiedMinReviews = this.settings.get(
      'tier_certified_min_reviews',
      3,
    );
    if (
      avgRating >= certifiedMinRating &&
      totalReviews >= certifiedMinReviews &&
      conversionRate >= 30 &&
      cancellationRate < 15 &&
      disputeRate < 5
    ) {
      return 'CERTIFIED';
    }

    return 'STANDARD';
  }

  async updateAllCompanyMetrics() {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    this.logger.log(`전체 업체 지표 업데이트 시작: ${companies.length}개 업체`);

    let success = 0;
    let fail = 0;

    for (const company of companies) {
      try {
        await this.updateCompanyMetrics(company.id);
        success++;
      } catch (error) {
        fail++;
        this.logger.error(
          `업체 지표 업데이트 실패: companyId=${company.id}, error=${error}`,
        );
      }
    }

    this.logger.log(
      `전체 업체 지표 업데이트 완료: 성공 ${success}건, 실패 ${fail}건`,
    );
  }

  /** 자동 경고/정지 조치 */
  async checkAndApplyAutoActions(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        userId: true,
        businessName: true,
        verificationStatus: true,
        totalMatchings: true,
        averageRating: true,
        cancellationRate: true,
        disputeRate: true,
      },
    });

    if (!company || company.totalMatchings < 5) return;
    if (company.verificationStatus !== 'APPROVED') return;

    const cancellationRate = Number(company.cancellationRate ?? 0);
    const disputeRate = Number(company.disputeRate ?? 0);
    const avgRating = Number(company.averageRating ?? 0);

    const suspendCancellation = this.settings.get(
      'suspend_cancellation_threshold',
      35,
    );
    const warningCancellation = this.settings.get(
      'warning_cancellation_threshold',
      20,
    );

    // 미해결 경고 수
    const unresolvedWarnings = await this.prisma.companyWarning.count({
      where: { companyId, isResolved: false },
    });

    // 정지 조건 확인
    if (
      cancellationRate > suspendCancellation ||
      disputeRate > 20 ||
      avgRating < 2.0 ||
      unresolvedWarnings >= 3
    ) {
      await this.prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id: companyId },
          data: {
            verificationStatus: 'SUSPENDED',
            rejectionReason: '성과 기준 미달로 자동 정지',
            isActive: false,
          },
        });
        await tx.user.update({
          where: { id: company.userId },
          data: { isActive: false },
        });
        await tx.companyWarning.create({
          data: {
            companyId,
            type: 'AUTO_SUSPENDED',
            message: `자동 정지: 취소율 ${cancellationRate.toFixed(1)}%, 분쟁율 ${disputeRate.toFixed(1)}%, 평점 ${avgRating.toFixed(1)}, 미해결 경고 ${unresolvedWarnings}건`,
          },
        });
      });

      this.eventEmitter.emit(
        NOTIFICATION_EVENTS.COMPANY_SUSPENDED,
        new NotificationEvent(
          company.userId,
          'COMPANY_SUSPENDED',
          '업체 계정이 정지되었습니다',
          '성과 기준 미달로 자동 정지되었습니다. 관리자에게 문의하세요.',
          { companyId },
        ),
      );

      this.logger.warn(`자동 정지: companyId=${companyId}, ${company.businessName}`);
      return;
    }

    // 경고 조건 확인
    const warningReasons: Array<{ type: 'HIGH_CANCELLATION' | 'HIGH_DISPUTE' | 'LOW_RATING'; message: string }> = [];

    if (cancellationRate > warningCancellation) {
      warningReasons.push({
        type: 'HIGH_CANCELLATION',
        message: `취소율 ${cancellationRate.toFixed(1)}%로 기준(${warningCancellation}%)을 초과했습니다.`,
      });
    }
    if (disputeRate > 10) {
      warningReasons.push({
        type: 'HIGH_DISPUTE',
        message: `분쟁율 ${disputeRate.toFixed(1)}%로 기준(10%)을 초과했습니다.`,
      });
    }
    if (avgRating < 2.5) {
      warningReasons.push({
        type: 'LOW_RATING',
        message: `평점 ${avgRating.toFixed(1)}로 기준(2.5)보다 낮습니다.`,
      });
    }

    for (const reason of warningReasons) {
      // 최근 7일 이내 동일 유형 경고 확인
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentWarning = await this.prisma.companyWarning.findFirst({
        where: {
          companyId,
          type: reason.type,
          createdAt: { gte: sevenDaysAgo },
        },
      });
      if (recentWarning) continue;

      await this.prisma.companyWarning.create({
        data: {
          companyId,
          type: reason.type,
          message: reason.message,
        },
      });

      this.eventEmitter.emit(
        NOTIFICATION_EVENTS.COMPANY_WARNING,
        new NotificationEvent(
          company.userId,
          'COMPANY_WARNING',
          '성과 경고 알림',
          reason.message,
          { companyId, warningType: reason.type },
        ),
      );

      this.logger.warn(
        `경고 발행: companyId=${companyId}, type=${reason.type}`,
      );
    }
  }

  /** 전체 업체 자동 조치 순회 */
  async applyAutoActionsAll(): Promise<void> {
    const companies = await this.prisma.company.findMany({
      where: {
        verificationStatus: 'APPROVED',
        totalMatchings: { gte: 5 },
      },
      select: { id: true },
    });

    this.logger.log(`자동 조치 대상 업체: ${companies.length}개`);

    let success = 0;
    let fail = 0;

    for (const company of companies) {
      try {
        await this.checkAndApplyAutoActions(company.id);
        success++;
      } catch (error) {
        fail++;
        this.logger.error(
          `자동 조치 실패: companyId=${company.id}, error=${error}`,
        );
      }
    }

    this.logger.log(
      `자동 조치 완료: 성공 ${success}건, 실패 ${fail}건`,
    );
  }

  async getCompanyMetrics(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        conversionRate: true,
        cancellationRate: true,
        repeatCustomerRate: true,
        disputeRate: true,
        metricsUpdatedAt: true,
      },
    });

    if (!company) {
      throw new NotFoundException('업체를 찾을 수 없습니다.');
    }

    // 24시간 초과 시 재계산
    const needsRecalc =
      !company.metricsUpdatedAt ||
      Date.now() - company.metricsUpdatedAt.getTime() > 24 * 60 * 60 * 1000;

    if (needsRecalc) {
      const metrics = await this.updateCompanyMetrics(companyId);
      return metrics;
    }

    return {
      conversionRate: Number(company.conversionRate) || 0,
      cancellationRate: Number(company.cancellationRate) || 0,
      repeatCustomerRate: Number(company.repeatCustomerRate) || 0,
      disputeRate: Number(company.disputeRate) || 0,
    };
  }
}
