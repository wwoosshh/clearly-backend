import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // TODO: 구독 플랜 목록 조회
  async getPlans() {
    // TODO: 구현 예정
    return [];
  }

  // TODO: 구독 신청
  async subscribe(companyId: string, planId: string) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 구독 상태 조회
  async getSubscriptionStatus(companyId: string) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 구독 해지
  async cancel(companyId: string) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 결제 처리
  async processPayment(companyId: string, paymentData: any) {
    // TODO: 구현 예정
    return null;
  }
}
