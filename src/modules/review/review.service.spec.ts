import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReviewService } from './review.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/cache/redis.service';

describe('ReviewService', () => {
  let service: ReviewService;
  let prisma: any;
  let redis: any;
  let eventEmitter: any;

  const mockUser = {
    id: 'user-uuid-1',
    name: '테스트 유저',
  };

  const mockCompany = {
    id: 'company-uuid-1',
    businessName: '테스트 업체',
    userId: 'company-user-uuid-1',
    averageRating: 4.0,
    totalReviews: 10,
  };

  const mockMatching = {
    id: 'matching-uuid-1',
    userId: 'user-uuid-1',
    companyId: 'company-uuid-1',
    status: 'COMPLETED',
    cleaningType: 'MOVE_IN',
    address: '서울시 강남구',
    estimatedPrice: 200000,
    review: null,
  };

  const mockReview = {
    id: 'review-uuid-1',
    matchingId: 'matching-uuid-1',
    userId: 'user-uuid-1',
    companyId: 'company-uuid-1',
    rating: 5,
    qualityRating: 5,
    priceRating: 4,
    punctualityRating: 5,
    kindnessRating: 5,
    content: '아주 깨끗하게 해주셨습니다.',
    images: [],
    companyReply: null,
    companyRepliedAt: null,
    isVisible: true,
    helpfulCount: 0,
    createdAt: new Date(),
    user: mockUser,
    company: { id: 'company-uuid-1', businessName: '테스트 업체' },
    matching: {
      id: 'matching-uuid-1',
      cleaningType: 'MOVE_IN',
      address: '서울시 강남구',
      estimatedPrice: 200000,
    },
  };

  let mockTx: any;

  beforeEach(async () => {
    mockTx = {
      review: {
        create: jest.fn(),
      },
      company: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewService,
        {
          provide: PrismaService,
          useValue: {
            matching: {
              findUnique: jest.fn(),
            },
            review: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
            },
            company: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
            delPattern: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ReviewService>(ReviewService);
    prisma = module.get(PrismaService);
    redis = module.get(RedisService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe('create', () => {
    it('리뷰를 생성하고 업체 평점을 갱신', async () => {
      prisma.matching.findUnique.mockResolvedValue(mockMatching);

      // $transaction mock: 콜백 함수를 받아 mockTx로 실행
      mockTx.review.create.mockResolvedValue(mockReview);
      mockTx.company.findUnique.mockResolvedValue({
        averageRating: 4.0,
        totalReviews: 10,
      });
      mockTx.company.update.mockResolvedValue({});
      prisma.$transaction.mockImplementation(async (cb: Function) => cb(mockTx));

      prisma.company.findUnique.mockResolvedValue({
        userId: 'company-user-uuid-1',
        id: 'company-uuid-1',
      });

      const result = await service.create('user-uuid-1', {
        matchingId: 'matching-uuid-1',
        rating: 5,
        qualityRating: 5,
        priceRating: 4,
        punctualityRating: 5,
        kindnessRating: 5,
        content: '아주 깨끗하게 해주셨습니다.',
        images: [],
      });

      expect(result).toEqual(mockReview);
      expect(mockTx.review.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            matchingId: 'matching-uuid-1',
            userId: 'user-uuid-1',
            companyId: 'company-uuid-1',
            rating: 5,
          }),
        }),
      );
      expect(mockTx.company.update).toHaveBeenCalled();
      expect(redis.delPattern).toHaveBeenCalledWith('review:company:company-uuid-1:*');
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it('완료되지 않은 매칭이면 BadRequestException', async () => {
      prisma.matching.findUnique.mockResolvedValue({
        ...mockMatching,
        status: 'ACCEPTED',
      });

      await expect(
        service.create('user-uuid-1', {
          matchingId: 'matching-uuid-1',
          rating: 5,
          content: '좋았습니다.',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('본인의 매칭이 아니면 ForbiddenException', async () => {
      prisma.matching.findUnique.mockResolvedValue({
        ...mockMatching,
        userId: 'other-user-uuid',
      });

      await expect(
        service.create('user-uuid-1', {
          matchingId: 'matching-uuid-1',
          rating: 5,
          content: '좋았습니다.',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('이미 리뷰를 작성한 매칭이면 BadRequestException', async () => {
      prisma.matching.findUnique.mockResolvedValue({
        ...mockMatching,
        review: { id: 'existing-review-uuid' },
      });

      await expect(
        service.create('user-uuid-1', {
          matchingId: 'matching-uuid-1',
          rating: 5,
          content: '좋았습니다.',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('매칭을 찾을 수 없으면 NotFoundException', async () => {
      prisma.matching.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-uuid-1', {
          matchingId: 'nonexistent-matching',
          rating: 5,
          content: '좋았습니다.',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByCompany', () => {
    it('페이지네이션된 리뷰 목록을 반환', async () => {
      redis.get.mockResolvedValue(null);
      prisma.review.findMany.mockResolvedValue([mockReview]);
      prisma.review.count.mockResolvedValue(1);

      const result = await service.findByCompany('company-uuid-1', 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(1);
      expect(redis.set).toHaveBeenCalled();
    });

    it('캐시된 데이터가 있으면 캐시에서 반환', async () => {
      const cachedResult = {
        data: [mockReview],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      redis.get.mockResolvedValue(cachedResult);

      const result = await service.findByCompany('company-uuid-1', 1, 10);

      expect(result).toEqual(cachedResult);
      expect(prisma.review.findMany).not.toHaveBeenCalled();
    });
  });

  describe('addCompanyReply', () => {
    it('업체 답글을 추가하고 타임스탬프를 설정', async () => {
      prisma.review.findUnique.mockResolvedValue({
        ...mockReview,
        companyReply: null,
        company: { userId: 'company-user-uuid-1' },
      });
      prisma.review.update.mockResolvedValue({
        ...mockReview,
        companyReply: '감사합니다!',
        companyRepliedAt: new Date(),
      });

      const result = await service.addCompanyReply(
        'review-uuid-1',
        'company-user-uuid-1',
        '감사합니다!',
      );

      expect(result.companyReply).toBe('감사합니다!');
      expect(result.companyRepliedAt).toBeDefined();
      expect(prisma.review.update).toHaveBeenCalledWith({
        where: { id: 'review-uuid-1' },
        data: expect.objectContaining({
          companyReply: '감사합니다!',
          companyRepliedAt: expect.any(Date),
        }),
      });
      expect(redis.delPattern).toHaveBeenCalledWith('review:company:company-uuid-1:*');
    });

    it('업체 소유자가 아니면 ForbiddenException', async () => {
      prisma.review.findUnique.mockResolvedValue({
        ...mockReview,
        companyReply: null,
        company: { userId: 'company-user-uuid-1' },
      });

      await expect(
        service.addCompanyReply('review-uuid-1', 'unauthorized-user', '답글'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('이미 답글이 있으면 BadRequestException', async () => {
      prisma.review.findUnique.mockResolvedValue({
        ...mockReview,
        companyReply: '기존 답글',
        company: { userId: 'company-user-uuid-1' },
      });

      await expect(
        service.addCompanyReply('review-uuid-1', 'company-user-uuid-1', '새 답글'),
      ).rejects.toThrow(BadRequestException);
    });

    it('리뷰를 찾을 수 없으면 NotFoundException', async () => {
      prisma.review.findUnique.mockResolvedValue(null);

      await expect(
        service.addCompanyReply('nonexistent-review', 'company-user-uuid-1', '답글'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
