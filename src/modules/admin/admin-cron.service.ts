import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PointService } from '../point/point.service';
import { CompanyMetricsService } from '../company/company-metrics.service';
import { SystemSettingService } from '../system-setting/system-setting.service';

@Injectable()
export class AdminCronService {
  private readonly logger = new Logger(AdminCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pointService: PointService,
    private readonly companyMetricsService: CompanyMetricsService,
    private readonly settings: SystemSettingService,
  ) {}

  /**
   * 3일 이상 미응답 견적 자동 만료 + 포인트 환불
   * 매 시간 실행
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredEstimates() {
    const expiryDays = this.settings.get('estimate_expiry_days', 3);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - expiryDays);

    // SUBMITTED 상태이고 3일 이상 경과한 견적 조회
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
        // 견적 상태를 REJECTED로 변경
        await this.prisma.estimate.update({
          where: { id: estimate.id },
          data: { status: 'REJECTED' },
        });

        // 포인트 환불
        if (estimate.pointsUsed > 0) {
          await this.pointService.refundPoints(
            estimate.companyId,
            estimate.pointsUsed,
            `견적 미응답 자동 환불 (${expiryDays}일 초과)`,
            estimate.id,
          );
        }

        successCount++;
        this.logger.log(
          `견적 만료 처리 완료: estimateId=${estimate.id}, companyId=${estimate.companyId}, refund=${estimate.pointsUsed}P`,
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
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - requestExpiryDays);

    const result = await this.prisma.estimateRequest.updateMany({
      where: {
        status: 'OPEN',
        createdAt: { lt: sevenDaysAgo },
      },
      data: { status: 'EXPIRED' },
    });

    if (result.count > 0) {
      this.logger.log(`견적 요청 자동 만료 처리: ${result.count}건`);
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

          // 1. ChatMessage 삭제 (유저가 보낸 메시지)
          await tx.chatMessage.deleteMany({
            where: { senderId: user.id },
          });

          // 2. 유저의 ChatRoom에 남은 메시지 삭제 후 ChatRoom 삭제
          if (companyId) {
            // 업체 채팅방의 메시지 삭제
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

          // 유저의 채팅방 메시지 삭제 후 채팅방 삭제
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

          // 3. Review 삭제
          await tx.review.deleteMany({ where: { userId: user.id } });
          if (companyId) {
            await tx.review.deleteMany({ where: { companyId } });
          }

          // 4. Report 삭제
          await tx.report.deleteMany({ where: { reporterId: user.id } });

          // 5. 업체 관련 데이터 삭제
          if (companyId) {
            // Matching.estimateId FK 해제
            await tx.matching.updateMany({
              where: { companyId },
              data: { estimateId: null },
            });

            // ChatRoom.estimateId FK는 이미 채팅방 삭제됨

            // Estimate 삭제
            await tx.estimate.deleteMany({ where: { companyId } });

            // PointTransaction → PointWallet 삭제
            const wallet = await tx.pointWallet.findUnique({
              where: { companyId },
            });
            if (wallet) {
              await tx.pointTransaction.deleteMany({
                where: { walletId: wallet.id },
              });
              await tx.pointWallet.delete({ where: { id: wallet.id } });
            }

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

            // Matching(companyId) 삭제
            await tx.matching.deleteMany({ where: { companyId } });
          }

          // 6. 유저의 EstimateRequest 내 Estimate FK 해제 후 삭제
          const estimateRequests = await tx.estimateRequest.findMany({
            where: { userId: user.id },
            select: { id: true },
          });
          if (estimateRequests.length > 0) {
            const erIds = estimateRequests.map((er) => er.id);

            // Matching.estimateId FK 해제 (이 견적요청에 연결된 견적들)
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

          // 7. EstimateRequest 삭제
          await tx.estimateRequest.deleteMany({ where: { userId: user.id } });

          // 8. Matching(userId) 삭제
          await tx.matching.deleteMany({ where: { userId: user.id } });

          // 9. User 삭제 (Cascade: Company, RefreshToken, Notification; SetNull: Inquiry)
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

  /**
   * 전체 업체 성과 지표 일괄 업데이트
   * 매일 새벽 4시 실행
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleCompanyMetricsUpdate() {
    await this.companyMetricsService.updateAllCompanyMetrics();
  }

  /**
   * 성과 기반 자동 경고/정지 조치
   * 매일 새벽 5시 실행 (4시 metrics 갱신 후)
   */
  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async handleAutoActions() {
    await this.companyMetricsService.applyAutoActionsAll();
  }
}
