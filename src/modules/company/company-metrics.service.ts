import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CompanyMetricsService {
  private readonly logger = new Logger(CompanyMetricsService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        conversionRate: metrics.conversionRate,
        cancellationRate: metrics.cancellationRate,
        repeatCustomerRate: metrics.repeatCustomerRate,
        disputeRate: metrics.disputeRate,
        metricsUpdatedAt: new Date(),
      },
    });

    return metrics;
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
