import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException } from '@nestjs/common';
import { PointService } from './point.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PointService', () => {
  let service: PointService;
  let prisma: any;
  let eventEmitter: any;

  const mockWallet = {
    id: 'wallet-uuid-1',
    companyId: 'company-uuid-1',
    balance: 500,
  };

  const mockTransaction = {
    id: 'tx-uuid-1',
    walletId: 'wallet-uuid-1',
    type: 'CHARGE',
    amount: 500,
    description: '포인트 충전',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointService,
        {
          provide: PrismaService,
          useValue: {
            pointWallet: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            pointTransaction: {
              findMany: jest.fn(),
              count: jest.fn(),
              create: jest.fn(),
            },
            company: {
              findUnique: jest.fn(),
            },
            $transaction: jest.fn(),
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

    service = module.get<PointService>(PointService);
    prisma = module.get(PrismaService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe('getOrCreateWallet', () => {
    it('기존 지갑 반환', async () => {
      prisma.pointWallet.findUnique.mockResolvedValue(mockWallet);

      const result = await service.getOrCreateWallet('company-uuid-1');
      expect(result.balance).toBe(500);
    });

    it('지갑 없으면 새로 생성', async () => {
      prisma.pointWallet.findUnique.mockResolvedValue(null);
      prisma.pointWallet.create.mockResolvedValue({
        ...mockWallet,
        balance: 0,
      });

      const result = await service.getOrCreateWallet('company-uuid-1');
      expect(result.balance).toBe(0);
      expect(prisma.pointWallet.create).toHaveBeenCalled();
    });
  });

  describe('getBalance', () => {
    it('잔액 조회 성공', async () => {
      prisma.pointWallet.findUnique.mockResolvedValue(mockWallet);

      const result = await service.getBalance('company-uuid-1');
      expect(result.balance).toBe(500);
    });
  });

  describe('getTransactions', () => {
    it('거래내역 페이징 조회', async () => {
      prisma.pointWallet.findUnique.mockResolvedValue(mockWallet);
      prisma.pointTransaction.findMany.mockResolvedValue([mockTransaction]);
      prisma.pointTransaction.count.mockResolvedValue(1);

      const result = await service.getTransactions('company-uuid-1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('chargePoints', () => {
    it('포인트 충전 성공', async () => {
      prisma.pointWallet.findUnique.mockResolvedValue(mockWallet);
      prisma.$transaction.mockResolvedValue([
        { ...mockWallet, balance: 1000 },
        { ...mockTransaction, amount: 500 },
      ]);
      prisma.company.findUnique.mockResolvedValue({ userId: 'user-uuid-1' });

      const result = await service.chargePoints('company-uuid-1', 500, '충전');

      expect(result.balance).toBe(1000);
      expect(result.transaction).toBeDefined();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.point.change',
        expect.anything(),
      );
    });

    it('충전 금액 0 이하 시 BadRequestException', async () => {
      await expect(service.chargePoints('company-uuid-1', 0)).rejects.toThrow(
        BadRequestException,
      );

      await expect(
        service.chargePoints('company-uuid-1', -100),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('usePoints', () => {
    it('포인트 사용 성공', async () => {
      prisma.pointWallet.findUnique.mockResolvedValue(mockWallet);
      prisma.$transaction.mockResolvedValue([
        { ...mockWallet, balance: 450 },
        { ...mockTransaction, type: 'USE', amount: 50 },
      ]);
      prisma.company.findUnique.mockResolvedValue({ userId: 'user-uuid-1' });

      const result = await service.usePoints(
        'company-uuid-1',
        50,
        '견적 제출',
        'request-uuid-1',
      );

      expect(result.balance).toBe(450);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.point.change',
        expect.anything(),
      );
    });

    it('잔액 부족 시 BadRequestException', async () => {
      prisma.pointWallet.findUnique.mockResolvedValue({
        ...mockWallet,
        balance: 30,
      });

      await expect(
        service.usePoints('company-uuid-1', 50, '견적 제출'),
      ).rejects.toThrow(BadRequestException);
    });

    it('사용 금액 0 이하 시 BadRequestException', async () => {
      await expect(
        service.usePoints('company-uuid-1', 0, '견적 제출'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('refundPoints', () => {
    it('포인트 환불 성공', async () => {
      prisma.pointWallet.findUnique.mockResolvedValue(mockWallet);
      prisma.$transaction.mockResolvedValue([
        { ...mockWallet, balance: 525 },
        { ...mockTransaction, type: 'REFUND', amount: 25 },
      ]);
      prisma.company.findUnique.mockResolvedValue({ userId: 'user-uuid-1' });

      const result = await service.refundPoints(
        'company-uuid-1',
        25,
        '자동 거절 환불 (50%)',
        'estimate-uuid-1',
      );

      expect(result.balance).toBe(525);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.point.change',
        expect.anything(),
      );
    });

    it('환불 금액 0 이하 시 BadRequestException', async () => {
      await expect(
        service.refundPoints('company-uuid-1', 0, '환불'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
