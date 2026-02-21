import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, MatchingStatus, CancelledBy, CleaningType } from '@prisma/client';
import {
  NOTIFICATION_EVENTS,
  NotificationEvent,
} from '../notification/notification.events';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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
        cleaningType: data.cleaningType as CleaningType,
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
          select: {
            id: true,
            businessName: true,
            user: { select: { id: true, name: true } },
          },
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
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 10;

    const where: Prisma.MatchingWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.status) where.status = filters.status as MatchingStatus;

    const [matchings, total] = await Promise.all([
      this.prisma.matching.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, phone: true } },
          company: {
            select: {
              id: true,
              businessName: true,
              user: { select: { id: true, name: true } },
            },
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

  /** 업체: 서비스 완료 보고 (완료 사진 업로드) */
  async reportCompletion(userId: string, matchingId: string, images: string[]) {
    const matching = await this.prisma.matching.findUnique({
      where: { id: matchingId },
      include: { company: { select: { userId: true } } },
    });

    if (!matching) {
      throw new NotFoundException('매칭 정보를 찾을 수 없습니다.');
    }
    if (matching.company?.userId !== userId) {
      throw new ForbiddenException(
        '해당 매칭의 업체만 완료 보고할 수 있습니다.',
      );
    }
    if (matching.status !== 'ACCEPTED') {
      throw new BadRequestException(
        '수락 상태의 매칭만 완료 보고할 수 있습니다.',
      );
    }
    if (!images || images.length === 0) {
      throw new BadRequestException('완료 사진을 1장 이상 업로드해주세요.');
    }

    const updated = await this.prisma.matching.update({
      where: { id: matchingId },
      data: {
        completionImages: images,
        completionReportedAt: new Date(),
      },
    });

    this.logger.log(
      `서비스 완료 보고: matchingId=${matchingId}, images=${images.length}장`,
    );

    // 사용자에게 완료 확인 요청 알림
    this.eventEmitter.emit(
      NOTIFICATION_EVENTS.COMPLETION_REPORTED,
      new NotificationEvent(
        matching.userId,
        'COMPLETION_REPORTED',
        '서비스 완료 확인 요청',
        '업체가 서비스 완료를 보고했습니다. 확인해주세요.',
        { matchingId },
      ),
    );

    return updated;
  }

  /** 사용자: 서비스 완료 확인 */
  async confirmCompletion(userId: string, matchingId: string) {
    const matching = await this.prisma.matching.findUnique({
      where: { id: matchingId },
      include: { company: { select: { userId: true } } },
    });

    if (!matching) {
      throw new NotFoundException('매칭 정보를 찾을 수 없습니다.');
    }
    if (matching.userId !== userId) {
      throw new ForbiddenException('본인의 매칭만 완료 확인할 수 있습니다.');
    }
    if (matching.status !== 'ACCEPTED') {
      throw new BadRequestException(
        '수락 상태의 매칭만 완료 확인할 수 있습니다.',
      );
    }

    const updated = await this.prisma.matching.update({
      where: { id: matchingId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `서비스 완료 확인: matchingId=${matchingId}, userId=${userId}`,
    );

    // 업체에게 완료 알림
    if (matching.company) {
      this.eventEmitter.emit(
        NOTIFICATION_EVENTS.MATCHING_COMPLETED,
        new NotificationEvent(
          matching.company.userId,
          'MATCHING_COMPLETED',
          '거래가 완료되었습니다',
          '고객이 서비스 완료를 확인했습니다. 리뷰를 기다려주세요.',
          { matchingId },
        ),
      );
    }

    return updated;
  }

  /** 매칭 취소 (사용자 또는 업체) */
  async cancelMatching(
    userId: string,
    userRole: string,
    matchingId: string,
    reason: string,
  ) {
    const matching = await this.prisma.matching.findUnique({
      where: { id: matchingId },
      include: { company: { select: { userId: true, businessName: true } } },
    });

    if (!matching) {
      throw new NotFoundException('매칭 정보를 찾을 수 없습니다.');
    }

    // 권한 확인
    const isUser = matching.userId === userId;
    const isCompany = matching.company?.userId === userId;
    if (!isUser && !isCompany) {
      throw new ForbiddenException('해당 매칭의 당사자만 취소할 수 있습니다.');
    }

    if (matching.status === 'COMPLETED' || matching.status === 'CANCELLED') {
      throw new BadRequestException('이미 완료되었거나 취소된 매칭입니다.');
    }

    const cancelledBy: CancelledBy = isUser ? CancelledBy.USER : CancelledBy.COMPANY;

    const updated = await this.prisma.matching.update({
      where: { id: matchingId },
      data: {
        status: 'CANCELLED',
        cancelledBy,
        rejectionReason: reason,
      },
    });

    this.logger.log(
      `매칭 취소: matchingId=${matchingId}, cancelledBy=${cancelledBy}, reason=${reason}`,
    );

    // 상대방에게 취소 알림
    const notifyUserId = isUser ? matching.company?.userId : matching.userId;

    if (notifyUserId) {
      this.eventEmitter.emit(
        NOTIFICATION_EVENTS.MATCHING_CANCELLED,
        new NotificationEvent(
          notifyUserId,
          'MATCHING_CANCELLED',
          '매칭이 취소되었습니다',
          `${isUser ? '고객' : '업체'}이(가) 매칭을 취소했습니다. 사유: ${reason}`,
          { matchingId, cancelledBy, reason },
        ),
      );
    }

    return updated;
  }
}
