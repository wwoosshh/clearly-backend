import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PointService } from '../point/point.service';

@Injectable()
export class AdminCronService {
  private readonly logger = new Logger(AdminCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pointService: PointService,
  ) {}

  /**
   * 3일 이상 미응답 견적 자동 만료 + 포인트 환불
   * 매 시간 실행
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredEstimates() {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

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

    this.logger.log(
      `만료 견적 처리 시작: ${expiredEstimates.length}건 발견`,
    );

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
            '견적 미응답 자동 환불 (3일 초과)',
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
}
