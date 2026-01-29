import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // TODO: 알림 생성
  async create(userId: string, type: string, data: any) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 사용자 알림 목록 조회
  async findByUser(userId: string, page: number, limit: number) {
    // TODO: 구현 예정
    return [];
  }

  // TODO: 알림 읽음 처리
  async markAsRead(id: string, userId: string) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 전체 알림 읽음 처리
  async markAllAsRead(userId: string) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 푸시 알림 전송
  async sendPushNotification(userId: string, title: string, body: string) {
    // TODO: 구현 예정
    return null;
  }
}
