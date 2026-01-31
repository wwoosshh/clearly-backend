import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import {
  NOTIFICATION_EVENTS,
  NotificationEvent,
} from '../notification/notification.events';

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** 리뷰 작성 */
  async create(userId: string, dto: CreateReviewDto) {
    const matching = await this.prisma.matching.findUnique({
      where: { id: dto.matchingId },
      include: { review: true },
    });

    if (!matching) {
      throw new NotFoundException('매칭 정보를 찾을 수 없습니다.');
    }

    if (matching.userId !== userId) {
      throw new ForbiddenException('본인의 매칭에 대해서만 리뷰를 작성할 수 있습니다.');
    }

    if (matching.status !== 'COMPLETED') {
      throw new BadRequestException('완료된 거래에 대해서만 리뷰를 작성할 수 있습니다.');
    }

    if (matching.review) {
      throw new BadRequestException('이미 리뷰를 작성한 거래입니다.');
    }

    if (!matching.companyId) {
      throw new BadRequestException('업체 정보가 없는 매칭입니다.');
    }

    const review = await this.prisma.review.create({
      data: {
        matchingId: dto.matchingId,
        userId,
        companyId: matching.companyId,
        rating: dto.rating,
        content: dto.content,
      },
      include: {
        user: { select: { id: true, name: true } },
        company: { select: { id: true, businessName: true } },
        matching: {
          select: {
            id: true,
            cleaningType: true,
            address: true,
            estimatedPrice: true,
          },
        },
      },
    });

    // 업체 평균 평점 및 리뷰 수 갱신
    const stats = await this.prisma.review.aggregate({
      where: { companyId: matching.companyId, isVisible: true },
      _avg: { rating: true },
      _count: true,
    });

    await this.prisma.company.update({
      where: { id: matching.companyId },
      data: {
        averageRating: stats._avg.rating
          ? parseFloat(stats._avg.rating.toFixed(2))
          : 0,
        totalReviews: stats._count,
      },
    });

    this.logger.log(
      `리뷰 작성: id=${review.id}, matchingId=${dto.matchingId}, rating=${dto.rating}`,
    );

    // 업체에게 새 리뷰 알림
    const companyWithUser = await this.prisma.company.findUnique({
      where: { id: matching.companyId! },
      select: { userId: true, id: true },
    });
    if (companyWithUser) {
      this.eventEmitter.emit(
        NOTIFICATION_EVENTS.NEW_REVIEW,
        new NotificationEvent(
          companyWithUser.userId,
          'NEW_REVIEW',
          '새로운 리뷰가 등록되었습니다',
          `${dto.rating}점 리뷰가 등록되었습니다.`,
          { reviewId: review.id, companyId: companyWithUser.id, rating: dto.rating },
        ),
      );
    }

    return review;
  }

  /** 업체 리뷰 목록 */
  async findByCompany(companyId: string, page = 1, limit = 10) {
    const where = { companyId, isVisible: true };

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true } },
          matching: {
            select: {
              id: true,
              cleaningType: true,
              address: true,
              estimatedPrice: true,
              completedAt: true,
            },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      data: reviews,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** 리뷰 상세 */
  async findById(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true } },
        company: { select: { id: true, businessName: true } },
        matching: {
          select: {
            id: true,
            cleaningType: true,
            address: true,
            estimatedPrice: true,
            completedAt: true,
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('리뷰를 찾을 수 없습니다.');
    }

    return review;
  }

  /** 내 리뷰 목록 (역할에 따라 작성한 리뷰 또는 받은 리뷰) */
  async findMyReviews(userId: string, page = 1, limit = 10) {
    // 업체 계정이면 받은 리뷰를, 일반 유저면 작성한 리뷰를 반환
    const company = await this.prisma.company.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (company) {
      return this.findReceivedReviews(company.id, page, limit);
    }

    return this.findByUser(userId, page, limit);
  }

  /** 내가 작성한 리뷰 목록 (일반 유저용) */
  async findByUser(userId: string, page = 1, limit = 10) {
    const where = { userId };

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          company: { select: { id: true, businessName: true } },
          matching: {
            select: {
              id: true,
              cleaningType: true,
              address: true,
              completedAt: true,
            },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      data: reviews,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** 업체가 받은 리뷰 목록 (업체 유저용) */
  async findReceivedReviews(companyId: string, page = 1, limit = 10) {
    const where = { companyId, isVisible: true };

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true } },
          matching: {
            select: {
              id: true,
              cleaningType: true,
              address: true,
              completedAt: true,
            },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      data: reviews,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** 리뷰 수정 */
  async update(id: string, userId: string, data: { rating?: number; content?: string }) {
    const review = await this.prisma.review.findUnique({ where: { id } });

    if (!review) {
      throw new NotFoundException('리뷰를 찾을 수 없습니다.');
    }

    if (review.userId !== userId) {
      throw new ForbiddenException('본인의 리뷰만 수정할 수 있습니다.');
    }

    const updated = await this.prisma.review.update({
      where: { id },
      data: {
        ...(data.rating !== undefined ? { rating: data.rating } : {}),
        ...(data.content !== undefined ? { content: data.content } : {}),
      },
    });

    // 평점 갱신
    if (data.rating !== undefined) {
      const stats = await this.prisma.review.aggregate({
        where: { companyId: review.companyId, isVisible: true },
        _avg: { rating: true },
        _count: true,
      });
      await this.prisma.company.update({
        where: { id: review.companyId },
        data: {
          averageRating: stats._avg.rating
            ? parseFloat(stats._avg.rating.toFixed(2))
            : 0,
          totalReviews: stats._count,
        },
      });
    }

    return updated;
  }

  /** 리뷰 삭제 */
  async remove(id: string, userId: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });

    if (!review) {
      throw new NotFoundException('리뷰를 찾을 수 없습니다.');
    }

    if (review.userId !== userId) {
      throw new ForbiddenException('본인의 리뷰만 삭제할 수 있습니다.');
    }

    await this.prisma.review.delete({ where: { id } });

    // 평점 갱신
    const stats = await this.prisma.review.aggregate({
      where: { companyId: review.companyId, isVisible: true },
      _avg: { rating: true },
      _count: true,
    });
    await this.prisma.company.update({
      where: { id: review.companyId },
      data: {
        averageRating: stats._avg.rating
          ? parseFloat(stats._avg.rating.toFixed(2))
          : 0,
        totalReviews: stats._count,
      },
    });

    return { deleted: true };
  }
}
