import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { CompanyMetricsService } from '../company/company-metrics.service';
import { SystemSettingService } from '../system-setting/system-setting.service';
import { NOTIFICATION_EVENTS, NotificationEvent } from '../notification/notification.events';

@Injectable()
export class AdminCronService {
  private readonly logger = new Logger(AdminCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly companyMetricsService: CompanyMetricsService,
    private readonly settings: SystemSettingService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * 3일 이상 미응답 견적 자동 만료
   * 매 시간 실행
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredEstimates() {
    const expiryDays = this.settings.get('estimate_expiry_days', 3);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - expiryDays);

    const expiredEstimates = await this.prisma.estimate.findMany({
      where: {
        status: 'SUBMITTED',
        createdAt: { lt: threeDaysAgo },
      },
      include: {
        company: { select: { id: true, businessName: true } },
        estimateRequest: { select: { id: true } },
      },
    });

    if (expiredEstimates.length === 0) return;

    this.logger.log(`만료 견적 처리 시작: ${expiredEstimates.length}건 발견`);

    let successCount = 0;
    let failCount = 0;

    for (const estimate of expiredEstimates) {
      try {
        await this.prisma.estimate.update({
          where: { id: estimate.id },
          data: { status: 'REJECTED' },
        });

        successCount++;
        this.logger.log(
          `견적 만료 처리 완료: estimateId=${estimate.id}, companyId=${estimate.companyId}`,
        );
      } catch (error) {
        failCount++;
        this.logger.error(
          `견적 만료 처리 실패: estimateId=${estimate.id}, error=${error}`,
        );
      }
    }

    this.logger.log(
      `만료 견적 처리 완료: 성공 ${successCount}건, 실패 ${failCount}건`,
    );
  }

  /**
   * 7일 이상 OPEN 상태인 견적 요청 자동 만료
   * 매일 자정 실행
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredEstimateRequests() {
    const requestExpiryDays = this.settings.get('request_expiry_days', 7);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - requestExpiryDays);

    const expiredRequests = await this.prisma.estimateRequest.findMany({
      where: {
        status: 'OPEN',
        createdAt: { lt: cutoffDate },
      },
      select: {
        id: true,
        estimates: {
          where: { status: 'SUBMITTED' },
          select: { id: true, companyId: true },
        },
      },
    });

    if (expiredRequests.length === 0) return;

    // 견적요청 일괄 만료
    await this.prisma.estimateRequest.updateMany({
      where: { id: { in: expiredRequests.map((r) => r.id) } },
      data: { status: 'EXPIRED' },
    });

    // 하위 SUBMITTED 견적 일괄 거절
    const allEstimates = expiredRequests.flatMap((r) => r.estimates);
    if (allEstimates.length > 0) {
      await this.prisma.estimate.updateMany({
        where: { id: { in: allEstimates.map((e) => e.id) } },
        data: { status: 'REJECTED' },
      });

      this.logger.log(
        `견적 요청 자동 만료 처리: ${expiredRequests.length}건 (하위 견적 ${allEstimates.length}건 거절)`,
      );
    } else {
      this.logger.log(`견적 요청 자동 만료 처리: ${expiredRequests.length}건`);
    }
  }

  /**
   * 만료 구독 일괄 처리
   * 매일 자정 실행
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleSubscriptionExpiry() {
    const count = await this.subscriptionService.expireOverdueSubscriptions();
    if (count > 0) {
      this.logger.log(`구독 만료 처리: ${count}건`);
    }
  }

  /**
   * 만료 임박 구독 알림 (7일 내 만료)
   * 매일 오전 9시 실행
   */
  @Cron('0 9 * * *')
  async handleSubscriptionExpiryWarnings() {
    const warningDays = this.settings.get('subscription_expiry_warning_days', 7);
    const expiringSoon = await this.subscriptionService.findExpiringSoon(warningDays);

    for (const sub of expiringSoon) {
      const daysLeft = Math.ceil(
        (sub.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );

      this.eventEmitter.emit(
        NOTIFICATION_EVENTS.SUBSCRIPTION_EXPIRING,
        new NotificationEvent(
          sub.company.userId,
          'SUBSCRIPTION_EXPIRING',
          '구독 만료 예정',
          `${sub.plan.name} 구독이 ${daysLeft}일 후 만료됩니다. 갱신해주세요.`,
          { subscriptionId: sub.id, daysLeft },
        ),
      );
    }

    if (expiringSoon.length > 0) {
      this.logger.log(`구독 만료 임박 알림: ${expiringSoon.length}건`);
    }
  }

  /**
   * 만료된 RefreshToken 정리
   * 매일 새벽 2시 실행
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredTokens() {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    if (result.count > 0) {
      this.logger.log(`만료 토큰 정리: ${result.count}건 삭제`);
    }
  }

  /**
   * 업체 완료 보고 후 48시간 미확인 시 자동 완료 처리
   * 매일 새벽 1시 실행
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleAutoCompletion() {
    const autoCompleteHours = this.settings.get('auto_complete_hours', 48);
    const twoDaysAgo = new Date();
    twoDaysAgo.setTime(twoDaysAgo.getTime() - autoCompleteHours * 60 * 60 * 1000);

    const result = await this.prisma.matching.updateMany({
      where: {
        status: 'ACCEPTED',
        completionReportedAt: { not: null, lt: twoDaysAgo },
      },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    if (result.count > 0) {
      this.logger.log(`자동 완료 처리: ${result.count}건 (48시간 미확인)`);
    }
  }

  /**
   * 탈퇴 요청 후 7일 경과한 사용자 데이터 완전 삭제
   * 매일 새벽 3시 실행
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleDeactivatedUsers() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const usersToDelete = await this.prisma.user.findMany({
      where: {
        deactivatedAt: { not: null, lt: sevenDaysAgo },
        isActive: false,
      },
      include: {
        company: { select: { id: true } },
      },
    });

    if (usersToDelete.length === 0) return;

    this.logger.log(
      `탈퇴 유저 데이터 삭제 시작: ${usersToDelete.length}명 발견`,
    );

    let successCount = 0;
    let failCount = 0;

    for (const user of usersToDelete) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const companyId = user.company?.id;

          await tx.chatMessage.deleteMany({
            where: { senderId: user.id },
          });

          if (companyId) {
            const companyChatRooms = await tx.chatRoom.findMany({
              where: { companyId },
              select: { id: true },
            });
            if (companyChatRooms.length > 0) {
              await tx.chatMessage.deleteMany({
                where: { roomId: { in: companyChatRooms.map((r) => r.id) } },
              });
            }
            await tx.chatRoom.deleteMany({ where: { companyId } });
          }

          const userChatRooms = await tx.chatRoom.findMany({
            where: { userId: user.id },
            select: { id: true },
          });
          if (userChatRooms.length > 0) {
            await tx.chatMessage.deleteMany({
              where: { roomId: { in: userChatRooms.map((r) => r.id) } },
            });
          }
          await tx.chatRoom.deleteMany({ where: { userId: user.id } });

          await tx.review.deleteMany({ where: { userId: user.id } });
          if (companyId) {
            await tx.review.deleteMany({ where: { companyId } });
          }

          await tx.report.deleteMany({ where: { reporterId: user.id } });

          if (companyId) {
            await tx.matching.updateMany({
              where: { companyId },
              data: { estimateId: null },
            });

            await tx.estimate.deleteMany({ where: { companyId } });

            // Payment → CompanySubscription 삭제
            const subscriptions = await tx.companySubscription.findMany({
              where: { companyId },
              select: { id: true },
            });
            if (subscriptions.length > 0) {
              await tx.payment.deleteMany({
                where: {
                  subscriptionId: { in: subscriptions.map((s) => s.id) },
                },
              });
              await tx.companySubscription.deleteMany({
                where: { companyId },
              });
            }

            await tx.matching.deleteMany({ where: { companyId } });
          }

          const estimateRequests = await tx.estimateRequest.findMany({
            where: { userId: user.id },
            select: { id: true },
          });
          if (estimateRequests.length > 0) {
            const erIds = estimateRequests.map((er) => er.id);

            const estimates = await tx.estimate.findMany({
              where: { estimateRequestId: { in: erIds } },
              select: { id: true },
            });
            if (estimates.length > 0) {
              await tx.matching.updateMany({
                where: { estimateId: { in: estimates.map((e) => e.id) } },
                data: { estimateId: null },
              });
            }

            await tx.estimate.deleteMany({
              where: { estimateRequestId: { in: erIds } },
            });
          }

          await tx.estimateRequest.deleteMany({ where: { userId: user.id } });
          await tx.matching.deleteMany({ where: { userId: user.id } });
          await tx.user.delete({ where: { id: user.id } });
        });

        successCount++;
        this.logger.log(
          `탈퇴 유저 삭제 완료: userId=${user.id}, email=${user.email}`,
        );
      } catch (error) {
        failCount++;
        this.logger.error(
          `탈퇴 유저 삭제 실패: userId=${user.id}, error=${error}`,
        );
      }
    }

    this.logger.log(
      `탈퇴 유저 데이터 삭제 완료: 성공 ${successCount}건, 실패 ${failCount}건`,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleCompanyMetricsUpdate() {
    await this.companyMetricsService.updateAllCompanyMetrics();
  }

}
