import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly prisma: PrismaService) {}

  // TODO: 사용자 프로필 조회
  async findById(id: string) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 사용자 프로필 수정
  async update(id: string, updateData: any) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 사용자 목록 조회 (관리자용)
  async findAll(page: number, limit: number) {
    // TODO: 구현 예정
    return [];
  }

  // TODO: 사용자 비활성화
  async deactivate(id: string) {
    // TODO: 구현 예정
    return null;
  }
}
