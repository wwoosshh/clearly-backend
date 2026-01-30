import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 신고 생성 */
  async createReport(reporterId: string, dto: CreateReportDto) {
    // 자기 자신 신고 방지
    if (dto.targetType === 'USER' && dto.targetId === reporterId) {
      throw new BadRequestException('자기 자신을 신고할 수 없습니다.');
    }

    // COMPANY 신고 시, 본인 업체 신고 방지
    if (dto.targetType === 'COMPANY') {
      const myCompany = await this.prisma.company.findUnique({
        where: { userId: reporterId },
      });
      if (myCompany && myCompany.id === dto.targetId) {
        throw new BadRequestException('자기 자신의 업체를 신고할 수 없습니다.');
      }
    }

    // 대상 존재 여부 확인
    if (dto.targetType === 'USER') {
      const target = await this.prisma.user.findUnique({
        where: { id: dto.targetId },
      });
      if (!target) throw new NotFoundException('신고 대상 사용자를 찾을 수 없습니다.');
    } else if (dto.targetType === 'COMPANY') {
      const target = await this.prisma.company.findUnique({
        where: { id: dto.targetId },
      });
      if (!target) throw new NotFoundException('신고 대상 업체를 찾을 수 없습니다.');
    } else if (dto.targetType === 'REVIEW') {
      const target = await this.prisma.review.findUnique({
        where: { id: dto.targetId },
      });
      if (!target) throw new NotFoundException('신고 대상 리뷰를 찾을 수 없습니다.');
    }

    // 동일 대상 중복 신고 방지 (PENDING 상태인 것만)
    const existing = await this.prisma.report.findFirst({
      where: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        status: 'PENDING',
      },
    });
    if (existing) {
      throw new BadRequestException('이미 해당 대상에 대한 신고가 접수되어 있습니다.');
    }

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        description: dto.description,
      },
    });

    this.logger.log(
      `신고 생성: id=${report.id}, reporter=${reporterId}, target=${dto.targetType}:${dto.targetId}, reason=${dto.reason}`,
    );

    return report;
  }

  /** 내가 신고한 목록 */
  async getMyReports(userId: string, page = 1, limit = 10) {
    const where = { reporterId: userId };

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]);

    return {
      data: reports,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
