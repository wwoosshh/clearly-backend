import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 채팅방 생성 (채팅상담 직접 클릭 시) */
  async createRoom(userId: string, companyId: string) {
    // 이미 존재하는 채팅방 확인
    const existing = await this.prisma.chatRoom.findFirst({
      where: {
        userId,
        companyId,
        isActive: true,
      },
      include: {
        company: { include: { user: true } },
        messages: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });

    if (existing) return existing;

    // 채팅방 생성
    const chatRoom = await this.prisma.chatRoom.create({
      data: {
        userId,
        companyId,
      },
      include: {
        company: { include: { user: true } },
        user: true,
      },
    });

    // 시스템 메시지 생성
    await this.prisma.chatMessage.create({
      data: {
        roomId: chatRoom.id,
        senderId: userId,
        content: '채팅 상담이 시작되었습니다.',
        messageType: 'SYSTEM',
      },
    });

    this.logger.log(
      `채팅방 생성: roomId=${chatRoom.id}, userId=${userId}, companyId=${companyId}`,
    );

    return chatRoom;
  }

  /** 메시지 전송 */
  async sendMessage(
    roomId: string,
    senderId: string,
    content: string,
    messageType: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM' = 'TEXT',
    fileUrl?: string,
  ) {
    // 채팅방 존재 및 권한 확인
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: { company: true },
    });

    if (!room) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }

    if (room.userId !== senderId && room.company.userId !== senderId) {
      throw new ForbiddenException('이 채팅방에 메시지를 보낼 수 없습니다.');
    }

    // 양측 거래취소 시 시스템 메시지만 허용
    if (
      room.userDeclined &&
      room.companyDeclined &&
      messageType !== 'SYSTEM'
    ) {
      throw new BadRequestException(
        '거래가 취소된 채팅방에서는 메시지를 보낼 수 없습니다.',
      );
    }

    // 메시지 생성 + 채팅방 마지막 메시지 업데이트
    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: {
          roomId,
          senderId,
          content,
          messageType,
          fileUrl,
        },
        include: {
          sender: {
            select: { id: true, name: true, profileImage: true },
          },
        },
      }),
      this.prisma.chatRoom.update({
        where: { id: roomId },
        data: {
          lastMessage: content,
          lastSentAt: new Date(),
        },
      }),
    ]);

    return message;
  }

  /** 채팅방 메시지 목록 조회 */
  async getMessages(roomId: string, userId: string, page = 1, limit = 50) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: { company: true },
    });

    if (!room) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }

    if (room.userId !== userId && room.company.userId !== userId) {
      throw new ForbiddenException('이 채팅방에 접근할 수 없습니다.');
    }

    const [messages, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { roomId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sender: {
            select: { id: true, name: true, profileImage: true },
          },
        },
      }),
      this.prisma.chatMessage.count({ where: { roomId } }),
    ]);

    return {
      data: messages.reverse(),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** 사용자 채팅방 목록 조회 */
  async getUserRooms(userId: string) {
    // 사용자가 일반 유저인지 업체 유저인지 확인
    const company = await this.prisma.company.findUnique({
      where: { userId },
    });

    const whereClause = company
      ? { companyId: company.id }
      : { userId };

    const rooms = await this.prisma.chatRoom.findMany({
      where: {
        ...whereClause,
        isActive: true,
      },
      orderBy: { lastSentAt: { sort: 'desc', nulls: 'last' } },
      include: {
        user: {
          select: { id: true, name: true, profileImage: true },
        },
        company: {
          select: {
            id: true,
            businessName: true,
            user: {
              select: { id: true, name: true, profileImage: true },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // 안 읽은 메시지 수 계산
    const roomsWithUnread = await Promise.all(
      rooms.map(async (room) => {
        const unreadCount = await this.prisma.chatMessage.count({
          where: {
            roomId: room.id,
            isRead: false,
            senderId: { not: userId },
            // 업체 유저인 경우 company의 userId로 필터링
            ...(company
              ? { senderId: { not: company.userId } }
              : {}),
          },
        });
        return { ...room, unreadCount };
      }),
    );

    return roomsWithUnread;
  }

  /** 메시지 읽음 처리 */
  async markAsRead(roomId: string, userId: string) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: { company: true },
    });

    if (!room) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }

    // 내가 보내지 않은 메시지만 읽음 처리
    const result = await this.prisma.chatMessage.updateMany({
      where: {
        roomId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true },
    });

    return { count: result.count };
  }

  /** 거래완료 처리 */
  async completeTransaction(roomId: string, userId: string) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: { company: true, matching: true },
    });

    if (!room) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }

    // 일반 유저만 거래완료 가능
    if (room.userId !== userId) {
      throw new ForbiddenException('고객만 거래완료를 할 수 있습니다.');
    }

    if (!room.matching) {
      throw new BadRequestException('매칭 정보가 없는 채팅방입니다.');
    }

    if (room.matching.status === 'COMPLETED') {
      throw new BadRequestException('이미 거래가 완료된 건입니다.');
    }

    if (room.matching.status !== 'ACCEPTED') {
      throw new BadRequestException('수락된 매칭만 거래완료 처리할 수 있습니다.');
    }

    // 매칭 상태를 COMPLETED로 변경
    const matching = await this.prisma.matching.update({
      where: { id: room.matching.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // 시스템 메시지
    await this.sendMessage(
      roomId,
      userId,
      '거래가 완료되었습니다. 리뷰를 작성해주세요.',
      'SYSTEM',
    );

    this.logger.log(
      `거래완료: roomId=${roomId}, matchingId=${matching.id}`,
    );

    return {
      matchingId: matching.id,
      companyId: room.companyId,
      completed: true,
    };
  }

  /** 거래안함 처리 */
  async declineRoom(roomId: string, userId: string) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: { company: true },
    });

    if (!room) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }

    const isUser = room.userId === userId;
    const isCompanyUser = room.company.userId === userId;

    if (!isUser && !isCompanyUser) {
      throw new ForbiddenException('이 채팅방에 접근할 수 없습니다.');
    }

    const updateData: any = {};
    if (isUser) updateData.userDeclined = true;
    if (isCompanyUser) updateData.companyDeclined = true;

    const updated = await this.prisma.chatRoom.update({
      where: { id: roomId },
      data: updateData,
    });

    // 양쪽 다 거래안함 시 환불 요청 상태로 변경
    if (updated.userDeclined && updated.companyDeclined) {
      await this.prisma.chatRoom.update({
        where: { id: roomId },
        data: { refundStatus: 'REQUESTED' },
      });

      // 시스템 메시지
      await this.sendMessage(
        roomId,
        userId,
        '양쪽 모두 거래 취소를 요청하여 환불 절차가 진행됩니다.',
        'SYSTEM',
      );

      return { ...updated, refundStatus: 'REQUESTED', bothDeclined: true };
    }

    // 시스템 메시지
    const who = isUser ? '고객' : '업체';
    await this.sendMessage(
      roomId,
      userId,
      `${who}님이 거래 취소를 요청했습니다.`,
      'SYSTEM',
    );

    return { ...updated, bothDeclined: false };
  }
}
