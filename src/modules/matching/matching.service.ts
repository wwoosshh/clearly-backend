import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // TODO: 매칭 요청 생성 (고객)
  async createRequest(userId: string, data: any) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 매칭 요청 목록 조회
  async findRequests(filters: any) {
    // TODO: 구현 예정
    return [];
  }

  // TODO: 매칭 요청 상세 조회
  async findRequestById(id: string) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 견적 제출 (업체)
  async submitQuote(companyId: string, requestId: string, data: any) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 견적 수락 (고객)
  async acceptQuote(userId: string, quoteId: string) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 매칭 상태 변경
  async updateStatus(id: string, status: string) {
    // TODO: 구현 예정
    return null;
  }
}
