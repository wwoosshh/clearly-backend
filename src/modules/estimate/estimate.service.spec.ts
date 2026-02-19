import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EstimateService } from './estimate.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { ChatService } from '../chat/chat.service';

describe('EstimateService', () => {
  let service: EstimateService;
  let prisma: any;
  let subscriptionService: any;
  let chatService: any;
  let eventEmitter: any;

  const mockCompany = {
    id: 'company-uuid-1',
    userId: 'company-user-uuid-1',
    businessName: '테스트청소업체',
    isActive: true,
    verificationStatus: 'APPROVED',
  };

  const mockEstimateRequest = {
    id: 'request-uuid-1',
    userId: 'user-uuid-1',
    cleaningType: 'MOVE_IN',
    address: '서울특별시 강남구 테스트로 123',
    detailAddress: '101동 202호',
    areaSize: 30,
    desiredDate: new Date('2026-03-01'),
    desiredTime: '오전',
    message: '이사청소 부탁드립니다',
    budget: 300000,
    images: [],
    status: 'OPEN',
    maxEstimates: 5,
  };

  const mockEstimate = {
    id: 'estimate-uuid-1',
    estimateRequestId: 'request-uuid-1',
    companyId: 'company-uuid-1',
    price: 250000,
    message: '깔끔하게 해드리겠습니다',
    estimatedDuration: '3시간',
    status: 'SUBMITTED',
    estimateRequest: mockEstimateRequest,
    company: mockCompany,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EstimateService,
        {
          provide: PrismaService,
          useValue: {
            estimateRequest: {
              count: jest.fn(),
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            estimate: {
              count: jest.fn(),
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            company: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            matching: {
              create: jest.fn(),
            },
            chatRoom: {
              create: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: SubscriptionService,
          useValue: {
            canSubmitEstimate: jest.fn().mockResolvedValue({
              canSubmit: true,
              used: 0,
              limit: 3,
              remaining: 3,
            }),
            incrementEstimateCount: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ChatService,
          useValue: {
            sendMessage: jest.fn().mockResolvedValue(undefined),
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

    service = module.get<EstimateService>(EstimateService);
    prisma = module.get(PrismaService);
    subscriptionService = module.get(SubscriptionService);
    chatService = module.get(ChatService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe('createEstimateRequest', () => {
    const dto = {
      cleaningType: 'MOVE_IN' as any,
      address: '서울특별시 강남구 테스트로 123',
      detailAddress: '101동 202호',
      areaSize: 30,
      desiredDate: '2026-03-01',
      desiredTime: '오전',
      message: '이사청소 부탁드립니다',
      budget: 300000,
    };

    it('견적요청 생성 성공', async () => {
      prisma.estimateRequest.count.mockResolvedValue(0);
      prisma.estimateRequest.findFirst.mockResolvedValue(null);
      prisma.estimateRequest.create.mockResolvedValue({
        ...mockEstimateRequest,
        user: { id: 'user-uuid-1', name: '테스트유저' },
      });
      prisma.company.findMany.mockResolvedValue([]);

      const result = await service.createEstimateRequest('user-uuid-1', dto);

      expect(result.id).toBe(mockEstimateRequest.id);
      expect(result.cleaningType).toBe('MOVE_IN');
      expect(prisma.estimateRequest.create).toHaveBeenCalled();
    });

    it('동시 활성 요청 3건 초과 시 BadRequestException', async () => {
      prisma.estimateRequest.count.mockResolvedValue(3);

      await expect(
        service.createEstimateRequest('user-uuid-1', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('7일 이내 동일 주소+유형 중복 시 BadRequestException', async () => {
      prisma.estimateRequest.count.mockResolvedValue(0);
      prisma.estimateRequest.findFirst.mockResolvedValue(mockEstimateRequest);

      await expect(
        service.createEstimateRequest('user-uuid-1', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('매칭 업체가 있으면 알림 발송', async () => {
      prisma.estimateRequest.count.mockResolvedValue(0);
      prisma.estimateRequest.findFirst.mockResolvedValue(null);
      prisma.estimateRequest.create.mockResolvedValue({
        ...mockEstimateRequest,
        user: { id: 'user-uuid-1', name: '테스트유저' },
      });
      prisma.company.findMany.mockResolvedValue([
        {
          userId: 'company-user-1',
          serviceAreas: ['강남'],
          specialties: ['MOVE_IN'],
          address: '서울 강남구',
        },
      ]);

      await service.createEstimateRequest('user-uuid-1', dto);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.estimate.newRequest',
        expect.anything(),
      );
    });
  });

  describe('submitEstimate', () => {
    const dto = {
      price: 250000,
      message: '깔끔하게 해드리겠습니다',
      estimatedDuration: '3시간',
    };

    it('견적 제출 성공 (일일 한도 확인)', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      prisma.estimateRequest.findUnique.mockResolvedValue(mockEstimateRequest);
      prisma.estimate.findFirst.mockResolvedValue(null);
      prisma.estimate.count.mockResolvedValue(0);
      prisma.estimate.create.mockResolvedValue({
        ...mockEstimate,
        estimateRequest: {
          id: mockEstimateRequest.id,
          cleaningType: 'MOVE_IN',
          address: '서울특별시 강남구 테스트로 123',
          userId: 'user-uuid-1',
        },
      });

      const result = await service.submitEstimate(
        mockCompany.userId,
        mockEstimateRequest.id,
        dto,
      );

      expect(result.price).toBe(250000);
      expect(subscriptionService.canSubmitEstimate).toHaveBeenCalledWith(
        mockCompany.id,
      );
      expect(subscriptionService.incrementEstimateCount).toHaveBeenCalledWith(
        mockCompany.id,
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.estimate.submitted',
        expect.anything(),
      );
    });

    it('일일 한도 초과 시 BadRequestException', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      prisma.estimateRequest.findUnique.mockResolvedValue(mockEstimateRequest);
      prisma.estimate.findFirst.mockResolvedValue(null);
      prisma.estimate.count.mockResolvedValue(0);
      subscriptionService.canSubmitEstimate.mockResolvedValue({
        canSubmit: false,
        used: 3,
        limit: 3,
        remaining: 0,
      });

      await expect(
        service.submitEstimate(mockCompany.userId, mockEstimateRequest.id, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('업체 정보 없으면 NotFoundException', async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(
        service.submitEstimate('unknown-user', mockEstimateRequest.id, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('견적요청 없으면 NotFoundException', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      prisma.estimateRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.submitEstimate(mockCompany.userId, 'unknown-id', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('마감된 견적요청 시 BadRequestException', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      prisma.estimateRequest.findUnique.mockResolvedValue({
        ...mockEstimateRequest,
        status: 'CLOSED',
      });

      await expect(
        service.submitEstimate(mockCompany.userId, mockEstimateRequest.id, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('이미 제출한 견적 시 BadRequestException', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      prisma.estimateRequest.findUnique.mockResolvedValue(mockEstimateRequest);
      prisma.estimate.findFirst.mockResolvedValue(mockEstimate);

      await expect(
        service.submitEstimate(mockCompany.userId, mockEstimateRequest.id, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('최대 견적 수 초과 시 BadRequestException', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      prisma.estimateRequest.findUnique.mockResolvedValue(mockEstimateRequest);
      prisma.estimate.findFirst.mockResolvedValue(null);
      prisma.estimate.count.mockResolvedValue(5);

      await expect(
        service.submitEstimate(mockCompany.userId, mockEstimateRequest.id, dto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('acceptEstimate', () => {
    it('견적 수락 성공 (매칭+채팅방 생성)', async () => {
      prisma.estimate.findUnique.mockResolvedValue(mockEstimate);

      const txMock = {
        estimate: {
          update: jest
            .fn()
            .mockResolvedValue({ ...mockEstimate, status: 'ACCEPTED' }),
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn(),
        },
        estimateRequest: {
          update: jest
            .fn()
            .mockResolvedValue({ ...mockEstimateRequest, status: 'CLOSED' }),
        },
        matching: {
          create: jest.fn().mockResolvedValue({ id: 'matching-uuid-1' }),
        },
        chatRoom: {
          create: jest.fn().mockResolvedValue({ id: 'chatroom-uuid-1' }),
        },
      };

      prisma.$transaction.mockImplementation(async (fn: any) => fn(txMock));

      const result = await service.acceptEstimate(
        'user-uuid-1',
        mockEstimate.id,
      );

      expect(result.matching.id).toBe('matching-uuid-1');
      expect(result.chatRoom.id).toBe('chatroom-uuid-1');
      expect(chatService.sendMessage).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.estimate.accepted',
        expect.anything(),
      );
    });

    it('다른 견적 자동 거절', async () => {
      prisma.estimate.findUnique.mockResolvedValue(mockEstimate);

      const otherEstimates = [
        { id: 'est-2', companyId: 'comp-2' },
        { id: 'est-3', companyId: 'comp-3' },
      ];

      const txMock = {
        estimate: {
          update: jest
            .fn()
            .mockResolvedValue({ ...mockEstimate, status: 'ACCEPTED' }),
          findMany: jest.fn().mockResolvedValue(otherEstimates),
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        estimateRequest: {
          update: jest
            .fn()
            .mockResolvedValue({ ...mockEstimateRequest, status: 'CLOSED' }),
        },
        matching: {
          create: jest.fn().mockResolvedValue({ id: 'matching-uuid-1' }),
        },
        chatRoom: {
          create: jest.fn().mockResolvedValue({ id: 'chatroom-uuid-1' }),
        },
      };

      prisma.$transaction.mockImplementation(async (fn: any) => fn(txMock));

      await service.acceptEstimate('user-uuid-1', mockEstimate.id);

      expect(txMock.estimate.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['est-2', 'est-3'] } },
        data: { status: 'REJECTED' },
      });
    });

    it('견적 없으면 NotFoundException', async () => {
      prisma.estimate.findUnique.mockResolvedValue(null);

      await expect(
        service.acceptEstimate('user-uuid-1', 'unknown-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('본인 견적요청이 아닌 경우 ForbiddenException', async () => {
      prisma.estimate.findUnique.mockResolvedValue(mockEstimate);

      await expect(
        service.acceptEstimate('other-user', mockEstimate.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('이미 처리된 견적 시 BadRequestException', async () => {
      prisma.estimate.findUnique.mockResolvedValue({
        ...mockEstimate,
        status: 'ACCEPTED',
      });

      await expect(
        service.acceptEstimate('user-uuid-1', mockEstimate.id),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectEstimate', () => {
    it('견적 거부 성공', async () => {
      prisma.estimate.findUnique.mockResolvedValue({
        ...mockEstimate,
        company: {
          id: mockCompany.id,
          userId: mockCompany.userId,
          businessName: mockCompany.businessName,
        },
      });
      prisma.estimate.update.mockResolvedValue({
        ...mockEstimate,
        status: 'REJECTED',
      });

      const result = await service.rejectEstimate(
        'user-uuid-1',
        mockEstimate.id,
      );

      expect(result.status).toBe('REJECTED');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.estimate.rejected',
        expect.anything(),
      );
    });

    it('견적 없으면 NotFoundException', async () => {
      prisma.estimate.findUnique.mockResolvedValue(null);

      await expect(
        service.rejectEstimate('user-uuid-1', 'unknown-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('본인 견적요청이 아닌 경우 ForbiddenException', async () => {
      prisma.estimate.findUnique.mockResolvedValue({
        ...mockEstimate,
        company: {
          id: mockCompany.id,
          userId: mockCompany.userId,
          businessName: mockCompany.businessName,
        },
      });

      await expect(
        service.rejectEstimate('other-user', mockEstimate.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('이미 처리된 견적 시 BadRequestException', async () => {
      prisma.estimate.findUnique.mockResolvedValue({
        ...mockEstimate,
        status: 'ACCEPTED',
        company: {
          id: mockCompany.id,
          userId: mockCompany.userId,
          businessName: mockCompany.businessName,
        },
      });

      await expect(
        service.rejectEstimate('user-uuid-1', mockEstimate.id),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getEstimateRequests', () => {
    it('USER는 본인 요청만 조회', async () => {
      prisma.estimateRequest.findMany.mockResolvedValue([mockEstimateRequest]);
      prisma.estimateRequest.count.mockResolvedValue(1);

      const result = await service.getEstimateRequests('user-uuid-1', 'USER');

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(prisma.estimateRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-uuid-1' },
        }),
      );
    });

    it('COMPANY는 OPEN 요청 전체 조회', async () => {
      prisma.estimateRequest.findMany.mockResolvedValue([mockEstimateRequest]);
      prisma.estimateRequest.count.mockResolvedValue(1);

      const result = await service.getEstimateRequests(
        'company-user-uuid-1',
        'COMPANY',
      );

      expect(prisma.estimateRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'OPEN' },
        }),
      );
    });
  });

  describe('getEstimateRequestById', () => {
    it('견적요청 상세 조회 성공', async () => {
      prisma.estimateRequest.findUnique.mockResolvedValue({
        ...mockEstimateRequest,
        user: { id: 'user-uuid-1', name: '테스트유저', phone: '01012345678' },
        estimates: [],
      });

      const result = await service.getEstimateRequestById(
        mockEstimateRequest.id,
      );
      expect(result.id).toBe(mockEstimateRequest.id);
    });

    it('존재하지 않으면 NotFoundException', async () => {
      prisma.estimateRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.getEstimateRequestById('unknown-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCompanyEstimates', () => {
    it('업체 견적 목록 조회 성공', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      prisma.estimate.findMany.mockResolvedValue([mockEstimate]);
      prisma.estimate.count.mockResolvedValue(1);

      const result = await service.getCompanyEstimates(mockCompany.userId);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('업체 정보 없으면 NotFoundException', async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(service.getCompanyEstimates('unknown-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
