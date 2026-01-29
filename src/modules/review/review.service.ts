import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  // TODO: 리뷰 작성
  async create(userId: string, data: any) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 리뷰 조회 (업체별)
  async findByCompany(companyId: string, page: number, limit: number) {
    // TODO: 구현 예정
    return [];
  }

  // TODO: 리뷰 상세 조회
  async findById(id: string) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 리뷰 수정
  async update(id: string, userId: string, data: any) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 리뷰 삭제
  async remove(id: string, userId: string) {
    // TODO: 구현 예정
    return null;
  }
}
