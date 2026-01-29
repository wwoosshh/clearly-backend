import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly prisma: PrismaService) {}

  // TODO: 채팅방 생성
  async createRoom(userIds: string[]) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 메시지 전송
  async sendMessage(roomId: string, userId: string, content: string) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 채팅방 메시지 목록 조회
  async getMessages(roomId: string, page: number, limit: number) {
    // TODO: 구현 예정
    return [];
  }

  // TODO: 사용자 채팅방 목록 조회
  async getUserRooms(userId: string) {
    // TODO: 구현 예정
    return [];
  }

  // TODO: 메시지 읽음 처리
  async markAsRead(roomId: string, userId: string) {
    // TODO: 구현 예정
    return null;
  }
}
