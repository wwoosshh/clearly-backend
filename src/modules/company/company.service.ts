import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(private readonly prisma: PrismaService) {}

  // TODO: 업체 등록
  async create(data: any) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 업체 상세 조회
  async findById(id: string) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 업체 목록 조회
  async findAll(page: number, limit: number) {
    // TODO: 구현 예정
    return [];
  }

  // TODO: 업체 정보 수정
  async update(id: string, data: any) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 업체 승인/반려 (관리자)
  async updateApprovalStatus(id: string, status: string) {
    // TODO: 구현 예정
    return null;
  }
}
