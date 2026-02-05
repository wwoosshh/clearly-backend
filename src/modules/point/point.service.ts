import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NOTIFICATION_EVENTS,
  NotificationEvent,
} from '../notification/notification.events';

@Injectable()
export class PointService {
  private readonly logger = new Logger(PointService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** 포인트 지갑 조회 (없으면 생성) */
  async getOrCreateWallet(companyId: string) {
    let wallet = await this.prisma.pointWallet.findUnique({
      where: { companyId },
    });

    if (!wallet) {
      wallet = await this.prisma.pointWallet.create({
        data: { companyId, balance: 0 },
      });
    }

    return wallet;
  }

  /** 잔액 조회 */
  async getBalance(companyId: string) {
    const wallet = await this.getOrCreateWallet(companyId);
    return { balance: wallet.balance };
  }

  /** 거래내역 조회 */
  async getTransactions(companyId: string, page = 1, limit = 20) {
    const wallet = await this.getOrCreateWallet(companyId);

    const [transactions, total] = await Promise.all([
      this.prisma.pointTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pointTransaction.count({
        where: { walletId: wallet.id },
      }),
    ]);

    return {
      data: transactions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** 포인트 충전 (관리자) */
  async chargePoints(companyId: string, amount: number, description?: string) {
    if (amount <= 0) {
      throw new BadRequestException('충전 금액은 0보다 커야 합니다.');
    }

    const wallet = await this.getOrCreateWallet(companyId);

    const [updatedWallet, transaction] = await this.prisma.$transaction([
      this.prisma.pointWallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      }),
      this.prisma.pointTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'CHARGE',
          amount,
          description: description || '포인트 충전',
        },
      }),
    ]);

    this.logger.log(
      `포인트 충전: companyId=${companyId}, amount=${amount}, newBalance=${updatedWallet.balance}`,
    );

    // 포인트 변동 알림
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { userId: true },
    });
    if (company) {
      this.eventEmitter.emit(
        NOTIFICATION_EVENTS.POINT_CHANGE,
        new NotificationEvent(
          company.userId,
          'POINT_CHANGE',
          '포인트가 충전되었습니다',
          `${amount.toLocaleString()}P가 충전되었습니다. 잔액: ${updatedWallet.balance.toLocaleString()}P`,
          { type: 'CHARGE', amount, balance: updatedWallet.balance },
        ),
      );
    }

    return { balance: updatedWallet.balance, transaction };
  }

  /** 포인트 사용 (견적 제출 시) */
  async usePoints(
    companyId: string,
    amount: number,
    description: string,
    relatedId?: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('사용 포인트는 0보다 커야 합니다.');
    }

    const wallet = await this.getOrCreateWallet(companyId);

    if (wallet.balance < amount) {
      throw new BadRequestException(
        `포인트가 부족합니다. 현재 잔액: ${wallet.balance}P, 필요: ${amount}P`,
      );
    }

    const [updatedWallet, transaction] = await this.prisma.$transaction([
      this.prisma.pointWallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      }),
      this.prisma.pointTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'USE',
          amount,
          description,
          relatedId,
        },
      }),
    ]);

    this.logger.log(
      `포인트 사용: companyId=${companyId}, amount=${amount}, newBalance=${updatedWallet.balance}`,
    );

    // 포인트 변동 알림
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { userId: true },
    });
    if (company) {
      this.eventEmitter.emit(
        NOTIFICATION_EVENTS.POINT_CHANGE,
        new NotificationEvent(
          company.userId,
          'POINT_CHANGE',
          '포인트가 사용되었습니다',
          `${amount.toLocaleString()}P가 사용되었습니다. 잔액: ${updatedWallet.balance.toLocaleString()}P`,
          { type: 'USE', amount, balance: updatedWallet.balance },
        ),
      );
    }

    return { balance: updatedWallet.balance, transaction };
  }

  /** 포인트 환불 */
  async refundPoints(
    companyId: string,
    amount: number,
    description: string,
    relatedId?: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('환불 금액은 0보다 커야 합니다.');
    }

    const wallet = await this.getOrCreateWallet(companyId);

    const [updatedWallet, transaction] = await this.prisma.$transaction([
      this.prisma.pointWallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      }),
      this.prisma.pointTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'REFUND',
          amount,
          description,
          relatedId,
        },
      }),
    ]);

    this.logger.log(
      `포인트 환불: companyId=${companyId}, amount=${amount}, newBalance=${updatedWallet.balance}`,
    );

    // 포인트 변동 알림
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { userId: true },
    });
    if (company) {
      this.eventEmitter.emit(
        NOTIFICATION_EVENTS.POINT_CHANGE,
        new NotificationEvent(
          company.userId,
          'POINT_CHANGE',
          '포인트가 환불되었습니다',
          `${amount.toLocaleString()}P가 환불되었습니다. 잔액: ${updatedWallet.balance.toLocaleString()}P`,
          { type: 'REFUND', amount, balance: updatedWallet.balance },
        ),
      );
    }

    return { balance: updatedWallet.balance, transaction };
  }
}
