import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingStatus } from '@prisma/client';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 매칭 생성 (채팅 상담 직접 시작 시) */
  async createRequest(
    userId: string,
    data: {
      companyId?: string;
      cleaningType: string;
      address: string;
      detailAddress?: string;
      areaSize?: number;
      desiredDate?: string;
      desiredTime?: string;
      message?: string;
      estimatedPrice?: number;
    },
  ) {
    const matching = await this.prisma.matching.create({
      data: {
        userId,
        companyId: data.companyId,
        cleaningType: data.cleaningType as any,
        address: data.address,
        detailAddress: data.detailAddress,
        areaSize: data.areaSize,
        desiredDate: data.desiredDate ? new Date(data.desiredDate) : undefined,
        desiredTime: data.desiredTime,
        message: data.message,
        estimatedPrice: data.estimatedPrice,
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        company: {
          select: { id: true, businessName: true, user: { select: { id: true, name: true } } },
        },
      },
    });

    this.logger.log(`매칭 생성: id=${matching.id}, userId=${userId}`);
    return matching;
  }

  /** 매칭 목록 조회 */
  async findRequests(filters: {
    userId?: string;
    companyId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 10;

    const where: any = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.status) where.status = filters.status;

    const [matchings, total] = await Promise.all([
      this.prisma.matching.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, phone: true } },
          company: {
            select: { id: true, businessName: true, user: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.matching.count({ where }),
    ]);

    return {
      data: matchings,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** 매칭 상세 조회 */
  async findRequestById(id: string) {
    const matching = await this.prisma.matching.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        company: {
          select: {
            id: true,
            businessName: true,
            address: true,
            user: { select: { id: true, name: true } },
          },
        },
        chatRoom: true,
        estimate: true,
      },
    });

    if (!matching) {
      throw new NotFoundException('매칭 정보를 찾을 수 없습니다.');
    }

    return matching;
  }

  /** 매칭 상태 변경 */
  async updateStatus(id: string, status: string) {
    const matching = await this.prisma.matching.findUnique({ where: { id } });
    if (!matching) {
      throw new NotFoundException('매칭 정보를 찾을 수 없습니다.');
    }

    return this.prisma.matching.update({
      where: { id },
      data: {
        status: status as MatchingStatus,
        ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}),
      },
    });
  }
}
