import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/cache/redis.service';
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
    private readonly redis: RedisService,
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
      throw new ForbiddenException(
        '본인의 매칭에 대해서만 리뷰를 작성할 수 있습니다.',
      );
    }

    if (matching.status !== 'COMPLETED') {
      throw new BadRequestException(
        '완료된 거래에 대해서만 리뷰를 작성할 수 있습니다.',
      );
    }

    if (matching.review) {
      throw new BadRequestException('이미 리뷰를 작성한 거래입니다.');
    }

    if (!matching.companyId) {
      throw new BadRequestException('업체 정보가 없는 매칭입니다.');
    }
    const companyId = matching.companyId;

    // 리뷰 생성 + 업체 평점 갱신을 트랜잭션으로 묶어 Race Condition 방지
    const review = await this.prisma.$transaction(async (tx) => {
      const createdReview = await tx.review.create({
        data: {
          matchingId: dto.matchingId,
          userId,
          companyId,
          rating: dto.rating,
          qualityRating: dto.qualityRating,
          priceRating: dto.priceRating,
          punctualityRating: dto.punctualityRating,
          kindnessRating: dto.kindnessRating,
          content: dto.content,
          images: dto.images,
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

      // 업체 평균 평점 및 리뷰 수 원자적 갱신
      const companyData = await tx.company.findUnique({
        where: { id: companyId },
        select: { averageRating: true, totalReviews: true },
      });
      const oldAvg = Number(companyData?.averageRating ?? 0);
      const oldCount = companyData?.totalReviews ?? 0;
      const newCount = oldCount + 1;
      const newAvg = parseFloat(
        ((oldAvg * oldCount + dto.rating) / newCount).toFixed(2),
      );

      await tx.company.update({
        where: { id: companyId },
        data: { averageRating: newAvg, totalReviews: newCount },
      });

      return createdReview;
    });

    // 리뷰 캐시 무효화
    await this.redis.delPattern(`review:company:${companyId}:*`);

    this.logger.log(
      `리뷰 작성: id=${review.id}, matchingId=${dto.matchingId}, rating=${dto.rating}`,
    );

    // 업체에게 새 리뷰 알림
    const companyWithUser = await this.prisma.company.findUnique({
      where: { id: companyId },
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
          {
            reviewId: review.id,
            companyId: companyWithUser.id,
            rating: dto.rating,
          },
        ),
      );
    }

    return review;
  }

  /** 업체 리뷰 목록 */
  async findByCompany(companyId: string, page = 1, limit = 10) {
    const cacheKey = `review:company:${companyId}:p${page}:l${limit}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

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

    const result = {
      data: reviews,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };

    await this.redis.set(cacheKey, result, 600); // 10분 캐시
    return result;
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
  async update(
    id: string,
    userId: string,
    data: { rating?: number; content?: string },
  ) {
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

    await this.redis.delPattern(`review:company:${review.companyId}:*`);

    // 평점 갱신 (증분 계산)
    if (data.rating !== undefined && data.rating !== review.rating) {
      const companyData = await this.prisma.company.findUnique({
        where: { id: review.companyId },
        select: { averageRating: true, totalReviews: true },
      });
      const oldAvg = Number(companyData?.averageRating ?? 0);
      const count = companyData?.totalReviews ?? 0;
      if (count > 0) {
        const newAvg = parseFloat(
          ((oldAvg * count - review.rating + data.rating) / count).toFixed(2),
        );
        await this.prisma.company.update({
          where: { id: review.companyId },
          data: { averageRating: newAvg },
        });
      }
    }

    return updated;
  }

  /** 업체 답글 작성 */
  async addCompanyReply(reviewId: string, userId: string, reply: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: { company: { select: { userId: true } } },
    });

    if (!review) {
      throw new NotFoundException('리뷰를 찾을 수 없습니다.');
    }

    if (review.company.userId !== userId) {
      throw new ForbiddenException(
        '본인 업체의 리뷰에만 답글을 작성할 수 있습니다.',
      );
    }

    if (review.companyReply) {
      throw new BadRequestException('이미 답글이 작성된 리뷰입니다.');
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        companyReply: reply,
        companyRepliedAt: new Date(),
      },
    });

    await this.redis.delPattern(`review:company:${review.companyId}:*`);
    return updated;
  }

  /** 도움이 됐어요 투표 */
  async markHelpful(reviewId: string, userId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('리뷰를 찾을 수 없습니다.');
    }

    // Redis 기반 중복 투표 방지
    const voteKey = `review:helpful:${reviewId}:${userId}`;
    const alreadyVoted = await this.redis.get(voteKey);
    if (alreadyVoted) {
      throw new ConflictException('이미 투표한 리뷰입니다.');
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { helpfulCount: { increment: 1 } },
    });

    // 투표 기록 저장 (30일 TTL)
    await this.redis.set(voteKey, '1', 60 * 60 * 24 * 30);
    await this.redis.delPattern(`review:company:${review.companyId}:*`);
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

    await this.redis.delPattern(`review:company:${review.companyId}:*`);

    // 평점 갱신 (증분 계산)
    const companyData = await this.prisma.company.findUnique({
      where: { id: review.companyId },
      select: { averageRating: true, totalReviews: true },
    });
    const oldCount = companyData?.totalReviews ?? 0;
    const newCount = oldCount - 1;
    const newAvg =
      newCount > 0
        ? parseFloat(
            (
              (Number(companyData?.averageRating ?? 0) * oldCount -
                review.rating) /
              newCount
            ).toFixed(2),
          )
        : 0;
    await this.prisma.company.update({
      where: { id: review.companyId },
      data: { averageRating: newAvg, totalReviews: newCount },
    });

    return { deleted: true };
  }
}
