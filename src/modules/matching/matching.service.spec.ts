import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MatchingService } from './matching.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MatchingService', () => {
  let service: MatchingService;
  let prisma: any;
  let eventEmitter: any;

  const mockUser = {
    id: 'user-uuid-1',
    name: '테스트 유저',
    phone: '01012345678',
  };

  const mockCompany = {
    id: 'company-uuid-1',
    businessName: '테스트 업체',
    userId: 'company-user-uuid-1',
    user: { id: 'company-user-uuid-1', name: '업체 유저' },
  };

  const mockMatching = {
    id: 'matching-uuid-1',
    userId: 'user-uuid-1',
    companyId: 'company-uuid-1',
    cleaningType: 'MOVE_IN',
    address: '서울시 강남구 테헤란로 123',
    detailAddress: '101호',
    areaSize: 30,
    desiredDate: new Date('2026-03-01'),
    desiredTime: '10:00',
    message: '깨끗하게 해주세요',
    estimatedPrice: 200000,
    status: 'PENDING',
    completionImages: null,
    completionReportedAt: null,
    completedAt: null,
    cancelledBy: null,
    rejectionReason: null,
    createdAt: new Date(),
    user: mockUser,
    company: {
      id: 'company-uuid-1',
      businessName: '테스트 업체',
      user: { id: 'company-user-uuid-1', name: '업체 유저' },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingService,
        {
          provide: PrismaService,
          useValue: {
            matching: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
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

    service = module.get<MatchingService>(MatchingService);
    prisma = module.get(PrismaService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe('createRequest', () => {
    it('올바른 데이터로 매칭을 생성', async () => {
      prisma.matching.create.mockResolvedValue(mockMatching);

      const result = await service.createRequest('user-uuid-1', {
        companyId: 'company-uuid-1',
        cleaningType: 'MOVE_IN',
        address: '서울시 강남구 테헤란로 123',
        detailAddress: '101호',
        areaSize: 30,
        desiredDate: '2026-03-01',
        desiredTime: '10:00',
        message: '깨끗하게 해주세요',
        estimatedPrice: 200000,
      });

      expect(result).toEqual(mockMatching);
      expect(prisma.matching.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-uuid-1',
            companyId: 'company-uuid-1',
            cleaningType: 'MOVE_IN',
            address: '서울시 강남구 테헤란로 123',
          }),
        }),
      );
    });
  });

  describe('findRequests', () => {
    it('페이지네이션된 매칭 목록을 반환', async () => {
      prisma.matching.findMany.mockResolvedValue([mockMatching]);
      prisma.matching.count.mockResolvedValue(1);

      const result = await service.findRequests({
        userId: 'user-uuid-1',
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('findRequestById', () => {
    it('매칭 상세 정보를 반환', async () => {
      prisma.matching.findUnique.mockResolvedValue({
        ...mockMatching,
        chatRoom: null,
        estimate: null,
      });

      const result = await service.findRequestById('matching-uuid-1');

      expect(result.id).toBe('matching-uuid-1');
      expect(prisma.matching.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'matching-uuid-1' },
        }),
      );
    });

    it('존재하지 않는 매칭이면 NotFoundException', async () => {
      prisma.matching.findUnique.mockResolvedValue(null);

      await expect(
        service.findRequestById('nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('매칭 상태를 올바르게 변경', async () => {
      prisma.matching.findUnique.mockResolvedValue(mockMatching);
      prisma.matching.update.mockResolvedValue({
        ...mockMatching,
        status: 'ACCEPTED',
      });

      const result = await service.updateStatus('matching-uuid-1', 'ACCEPTED');

      expect(result.status).toBe('ACCEPTED');
      expect(prisma.matching.update).toHaveBeenCalledWith({
        where: { id: 'matching-uuid-1' },
        data: expect.objectContaining({
          status: 'ACCEPTED',
        }),
      });
    });

    it('COMPLETED 상태로 변경 시 completedAt 설정', async () => {
      prisma.matching.findUnique.mockResolvedValue(mockMatching);
      prisma.matching.update.mockResolvedValue({
        ...mockMatching,
        status: 'COMPLETED',
        completedAt: new Date(),
      });

      await service.updateStatus('matching-uuid-1', 'COMPLETED');

      expect(prisma.matching.update).toHaveBeenCalledWith({
        where: { id: 'matching-uuid-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          completedAt: expect.any(Date),
        }),
      });
    });

    it('존재하지 않는 매칭이면 NotFoundException', async () => {
      prisma.matching.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('nonexistent-id', 'ACCEPTED'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelMatching', () => {
    it('사용자가 매칭을 취소하면 CANCELLED + cancelledBy USER 설정', async () => {
      prisma.matching.findUnique.mockResolvedValue({
        ...mockMatching,
        status: 'PENDING',
        company: { userId: 'company-user-uuid-1', businessName: '테스트 업체' },
      });
      prisma.matching.update.mockResolvedValue({
        ...mockMatching,
        status: 'CANCELLED',
        cancelledBy: 'USER',
        rejectionReason: '일정 변경',
      });

      const result = await service.cancelMatching(
        'user-uuid-1',
        'USER',
        'matching-uuid-1',
        '일정 변경',
      );

      expect(result.status).toBe('CANCELLED');
      expect(prisma.matching.update).toHaveBeenCalledWith({
        where: { id: 'matching-uuid-1' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledBy: 'USER',
          rejectionReason: '일정 변경',
        }),
      });
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it('권한이 없는 사용자면 ForbiddenException', async () => {
      prisma.matching.findUnique.mockResolvedValue({
        ...mockMatching,
        company: { userId: 'company-user-uuid-1', businessName: '테스트 업체' },
      });

      await expect(
        service.cancelMatching(
          'unauthorized-user-uuid',
          'USER',
          'matching-uuid-1',
          '취소 사유',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('이미 완료된 매칭이면 BadRequestException', async () => {
      prisma.matching.findUnique.mockResolvedValue({
        ...mockMatching,
        status: 'COMPLETED',
        company: { userId: 'company-user-uuid-1', businessName: '테스트 업체' },
      });

      await expect(
        service.cancelMatching(
          'user-uuid-1',
          'USER',
          'matching-uuid-1',
          '취소 사유',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reportCompletion', () => {
    it('완료 사진을 저장하고 알림을 발송', async () => {
      const acceptedMatching = {
        ...mockMatching,
        status: 'ACCEPTED',
        company: { userId: 'company-user-uuid-1' },
      };
      prisma.matching.findUnique.mockResolvedValue(acceptedMatching);
      prisma.matching.update.mockResolvedValue({
        ...acceptedMatching,
        completionImages: ['img1.jpg', 'img2.jpg'],
        completionReportedAt: new Date(),
      });

      const result = await service.reportCompletion(
        'company-user-uuid-1',
        'matching-uuid-1',
        ['img1.jpg', 'img2.jpg'],
      );

      expect(result.completionImages).toEqual(['img1.jpg', 'img2.jpg']);
      expect(prisma.matching.update).toHaveBeenCalledWith({
        where: { id: 'matching-uuid-1' },
        data: expect.objectContaining({
          completionImages: ['img1.jpg', 'img2.jpg'],
          completionReportedAt: expect.any(Date),
        }),
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.matching.completionReported',
        expect.objectContaining({
          userId: 'user-uuid-1',
          type: 'COMPLETION_REPORTED',
        }),
      );
    });

    it('업체 유저가 아니면 ForbiddenException', async () => {
      prisma.matching.findUnique.mockResolvedValue({
        ...mockMatching,
        status: 'ACCEPTED',
        company: { userId: 'company-user-uuid-1' },
      });

      await expect(
        service.reportCompletion('unauthorized-user', 'matching-uuid-1', ['img.jpg']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ACCEPTED 상태가 아니면 BadRequestException', async () => {
      prisma.matching.findUnique.mockResolvedValue({
        ...mockMatching,
        status: 'PENDING',
        company: { userId: 'company-user-uuid-1' },
      });

      await expect(
        service.reportCompletion('company-user-uuid-1', 'matching-uuid-1', ['img.jpg']),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirmCompletion', () => {
    it('COMPLETED 상태로 변경하고 알림을 발송', async () => {
      const acceptedMatching = {
        ...mockMatching,
        status: 'ACCEPTED',
        company: { userId: 'company-user-uuid-1' },
      };
      prisma.matching.findUnique.mockResolvedValue(acceptedMatching);
      prisma.matching.update.mockResolvedValue({
        ...acceptedMatching,
        status: 'COMPLETED',
        completedAt: new Date(),
      });

      const result = await service.confirmCompletion('user-uuid-1', 'matching-uuid-1');

      expect(result.status).toBe('COMPLETED');
      expect(prisma.matching.update).toHaveBeenCalledWith({
        where: { id: 'matching-uuid-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          completedAt: expect.any(Date),
        }),
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.matching.completed',
        expect.objectContaining({
          userId: 'company-user-uuid-1',
          type: 'MATCHING_COMPLETED',
        }),
      );
    });

    it('본인의 매칭이 아니면 ForbiddenException', async () => {
      prisma.matching.findUnique.mockResolvedValue({
        ...mockMatching,
        status: 'ACCEPTED',
        company: { userId: 'company-user-uuid-1' },
      });

      await expect(
        service.confirmCompletion('unauthorized-user', 'matching-uuid-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ACCEPTED 상태가 아니면 BadRequestException', async () => {
      prisma.matching.findUnique.mockResolvedValue({
        ...mockMatching,
        status: 'PENDING',
        company: { userId: 'company-user-uuid-1' },
      });

      await expect(
        service.confirmCompletion('user-uuid-1', 'matching-uuid-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
