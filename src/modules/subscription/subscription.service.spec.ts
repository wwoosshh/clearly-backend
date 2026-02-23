import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SubscriptionService } from './subscription.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/cache/redis.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let prisma: any;
  let redis: any;
  let eventEmitter: any;

  const mockPlan = {
    id: 'plan-uuid-1',
    name: 'Basic 3개월',
    tier: 'BASIC',
    durationMonths: 3,
    price: 30000,
    dailyEstimateLimit: 5,
    priorityWeight: 1.0,
    sortOrder: 1,
    isActive: true,
    features: ['기본 기능'],
  };

  const mockCompany = {
    id: 'company-uuid-1',
    userId: 'user-uuid-1',
    businessName: '테스트 업체',
  };

  const mockSubscription = {
    id: 'sub-uuid-1',
    companyId: 'company-uuid-1',
    planId: 'plan-uuid-1',
    status: 'ACTIVE',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    isTrial: false,
    cancelledAt: null,
    plan: mockPlan,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        {
          provide: PrismaService,
          useValue: {
            subscriptionPlan: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
            },
            companySubscription: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
            company: {
              findUnique: jest.fn(),
            },
            payment: {
              create: jest.fn(),
            },
            $transaction: jest.fn(),
            $queryRawUnsafe: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
            incr: jest.fn().mockResolvedValue(1),
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

    service = module.get<SubscriptionService>(SubscriptionService);
    prisma = module.get(PrismaService);
    redis = module.get(RedisService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe('getPlans', () => {
    it('활성 플랜 목록을 sortOrder 순으로 반환', async () => {
      const plans = [
        { ...mockPlan, tier: 'BASIC', sortOrder: 1 },
        { ...mockPlan, id: 'plan-2', tier: 'PRO', name: 'Pro 3개월', sortOrder: 2 },
        { ...mockPlan, id: 'plan-3', tier: 'PREMIUM', name: 'Premium 3개월', sortOrder: 3 },
      ];
      prisma.subscriptionPlan.findMany.mockResolvedValue(plans);

      const result = await service.getPlans();

      expect(result.BASIC).toHaveLength(1);
      expect(result.PRO).toHaveLength(1);
      expect(result.PREMIUM).toHaveLength(1);
      expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
      });
    });
  });

  describe('getActiveSubscription', () => {
    it('활성 구독 정보를 반환 (캐시 미스)', async () => {
      redis.get.mockResolvedValue(null);
      prisma.companySubscription.findFirst.mockResolvedValue(mockSubscription);

      const result = await service.getActiveSubscription('company-uuid-1');

      expect(result).toBeDefined();
      expect(result!.tier).toBe('BASIC');
      expect(result!.companyId).toBe('company-uuid-1');
      expect(redis.set).toHaveBeenCalled();
    });

    it('캐시된 데이터가 있으면 캐시에서 반환', async () => {
      const cachedInfo = {
        id: 'sub-uuid-1',
        companyId: 'company-uuid-1',
        tier: 'BASIC',
        status: 'ACTIVE',
        planName: 'Basic 3개월',
        dailyEstimateLimit: 5,
        priorityWeight: 1.0,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        isTrial: false,
        cancelledAt: null,
      };
      redis.get.mockResolvedValue(cachedInfo);

      const result = await service.getActiveSubscription('company-uuid-1');

      expect(result).toEqual(cachedInfo);
      expect(prisma.companySubscription.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('createSubscription', () => {
    it('신규 구독을 올바른 날짜로 생성', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockPlan);
      prisma.companySubscription.findFirst.mockResolvedValue(null);
      prisma.companySubscription.create.mockResolvedValue(mockSubscription);

      const result = await service.createSubscription('company-uuid-1', 'plan-uuid-1');

      expect(result).toEqual(mockSubscription);
      expect(prisma.companySubscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-uuid-1',
            planId: 'plan-uuid-1',
            status: 'ACTIVE',
            isTrial: false,
          }),
          include: { plan: true },
        }),
      );
      expect(redis.del).toHaveBeenCalledWith('subscription:active:company-uuid-1');
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it('업체를 찾을 수 없으면 NotFoundException', async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(
        service.createSubscription('nonexistent-company', 'plan-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('유효하지 않은 플랜이면 BadRequestException', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(null);

      await expect(
        service.createSubscription('company-uuid-1', 'invalid-plan'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelSubscription', () => {
    it('활성 구독 상태를 CANCELLED로 변경', async () => {
      prisma.companySubscription.findFirst.mockResolvedValue(mockSubscription);
      prisma.companySubscription.update.mockResolvedValue({
        ...mockSubscription,
        status: 'CANCELLED',
        cancelledAt: new Date(),
      });

      const result = await service.cancelSubscription('company-uuid-1');

      expect(result.message).toBe('구독이 해지되었습니다. 남은 기간까지 이용 가능합니다.');
      expect(prisma.companySubscription.update).toHaveBeenCalledWith({
        where: { id: mockSubscription.id },
        data: expect.objectContaining({
          status: 'CANCELLED',
        }),
      });
      expect(redis.del).toHaveBeenCalledWith('subscription:active:company-uuid-1');
    });

    it('활성 구독이 없으면 BadRequestException', async () => {
      prisma.companySubscription.findFirst.mockResolvedValue(null);

      await expect(
        service.cancelSubscription('company-uuid-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('canSubmitEstimate', () => {
    it('남은 견적 횟수를 올바르게 반환', async () => {
      // getActiveSubscription을 내부에서 호출하므로 Redis 캐시에서 반환되도록 설정
      redis.get
        .mockResolvedValueOnce({
          id: 'sub-uuid-1',
          companyId: 'company-uuid-1',
          tier: 'BASIC',
          status: 'ACTIVE',
          planName: 'Basic 3개월',
          dailyEstimateLimit: 5,
          priorityWeight: 1.0,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          isTrial: false,
          cancelledAt: null,
        })
        .mockResolvedValueOnce(2); // daily count

      const result = await service.canSubmitEstimate('company-uuid-1');

      expect(result.limit).toBe(5);
      expect(result.used).toBe(2);
      expect(result.remaining).toBe(3);
    });

    it('구독이 없으면 한도 0 반환', async () => {
      redis.get.mockResolvedValueOnce(null); // 캐시 미스
      prisma.companySubscription.findFirst.mockResolvedValue(null); // DB에도 없음

      const result = await service.canSubmitEstimate('company-uuid-1');

      expect(result.limit).toBe(0);
      expect(result.used).toBe(0);
      expect(result.remaining).toBe(0);
    });
  });
});
