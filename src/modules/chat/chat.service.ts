import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/cache/redis.service';
import {
  NOTIFICATION_EVENTS,
  NotificationEvent,
} from '../notification/notification.events';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly redis: RedisService,
  ) {}

  /** 채팅방 생성 (채팅상담 직접 클릭 시) */
  async createRoom(userId: string, companyId: string) {
    // 업체 계정은 채팅방을 생성할 수 없음 (업체→업체 채팅 방지)
    const requestingCompany = await this.prisma.company.findUnique({
      where: { userId },
    });
    if (requestingCompany) {
      throw new ForbiddenException(
        '업체 계정으로는 채팅 상담을 시작할 수 없습니다.',
      );
    }

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
        matching: { select: { status: true } },
      },
    });

    // 거래완료되었거나 양측 모두 거래취소된 채팅방은 재사용하지 않고 새로 생성
    if (
      existing &&
      existing.matching?.status !== 'COMPLETED' &&
      !(existing.userDeclined && existing.companyDeclined)
    ) {
      return existing;
    }

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

    // 업체 매칭 카운트 증가
    await this.prisma.company.update({
      where: { id: companyId },
      data: { totalMatchings: { increment: 1 } },
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
    if (room.userDeclined && room.companyDeclined && messageType !== 'SYSTEM') {
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

    // 채팅방 목록 캐시 무효화 (양쪽 유저)
    await this.redis.del(`chat:rooms:${senderId}`, `chat:rooms:${room.company.userId === senderId ? room.userId : room.company.userId}`);

    // 첫 번째 비시스템 메시지인 경우 상대방에게 알림
    if (messageType !== 'SYSTEM') {
      const previousMessages = await this.prisma.chatMessage.count({
        where: {
          roomId,
          senderId,
          messageType: { not: 'SYSTEM' },
        },
      });

      if (previousMessages === 1) {
        const recipientId =
          senderId === room.userId ? room.company.userId : room.userId;

        this.eventEmitter.emit(
          NOTIFICATION_EVENTS.NEW_MESSAGE_FIRST_REPLY,
          new NotificationEvent(
            recipientId,
            'NEW_MESSAGE',
            '새 메시지가 도착했습니다',
            content.length > 50 ? content.substring(0, 50) + '...' : content,
            { roomId },
          ),
        );

        // 업체 유저의 첫 응답 → 평균 응답시간 자동 계산
        if (senderId === room.company.userId) {
          this.updateCompanyResponseTime(
            room.companyId,
            senderId,
            room.createdAt,
          ).catch((err) => this.logger.error(`응답시간 업데이트 실패: ${err}`));
        }
      }
    }

    return message;
  }

  /** 채팅방 단건 조회 */
  async getRoomById(roomId: string, userId: string) {
    const company = await this.prisma.company.findUnique({
      where: { userId },
    });

    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
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
        matching: {
          select: {
            id: true,
            status: true,
            completionImages: true,
            completionReportedAt: true,
            completedAt: true,
            review: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }

    if (room.userId !== userId && room.company.user.id !== userId) {
      throw new ForbiddenException('이 채팅방에 접근할 수 없습니다.');
    }

    // 안 읽은 메시지 수 계산
    const unreadCount = await this.prisma.chatMessage.count({
      where: {
        roomId: room.id,
        isRead: false,
        senderId: { not: company ? company.userId : userId },
      },
    });

    return { ...room, unreadCount };
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
    const cacheKey = `chat:rooms:${userId}`;
    const cached = await this.redis.get<Record<string, unknown>[]>(cacheKey);
    if (cached) return cached;

    // 사용자가 일반 유저인지 업체 유저인지 확인
    const company = await this.prisma.company.findUnique({
      where: { userId },
    });

    const whereClause = company ? { companyId: company.id } : { userId };

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
        matching: {
          select: {
            id: true,
            status: true,
            completionImages: true,
            completionReportedAt: true,
            completedAt: true,
            review: {
              select: { id: true },
            },
          },
        },
      },
    });

    // 안 읽은 메시지 수 계산 (단일 groupBy 쿼리)
    const roomIds = rooms.map((r) => r.id);
    const unreadCounts =
      roomIds.length > 0
        ? await this.prisma.chatMessage.groupBy({
            by: ['roomId'],
            where: {
              roomId: { in: roomIds },
              isRead: false,
              senderId: { not: company ? company.userId : userId },
            },
            _count: { id: true },
          })
        : [];

    const unreadMap = new Map(
      unreadCounts.map((u) => [u.roomId, u._count.id]),
    );

    const result = rooms.map((room) => ({
      ...room,
      unreadCount: unreadMap.get(room.id) ?? 0,
    }));

    await this.redis.set(cacheKey, result, 30); // 30초 캐시
    return result;
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
      data: { isRead: true, readAt: new Date() },
    });

    await this.redis.del(`chat:rooms:${userId}`);

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
      throw new BadRequestException(
        '수락된 매칭만 거래완료 처리할 수 있습니다.',
      );
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

    this.logger.log(`거래완료: roomId=${roomId}, matchingId=${matching.id}`);

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

    const updateData: { userDeclined?: boolean; companyDeclined?: boolean } = {};
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

  /**
   * 업체 평균 응답시간 계산 및 업데이트
   * 채팅방 생성 시점 ~ 업체의 첫 응답 시점까지의 시간(분)을 기준으로 평균을 구함
   */
  private async updateCompanyResponseTime(
    companyId: string,
    companyUserId: string,
    roomCreatedAt: Date,
  ) {
    const responseMinutes = Math.round(
      (Date.now() - roomCreatedAt.getTime()) / (1000 * 60),
    );

    // 24시간 초과 응답은 통계에서 제외 (비정상 케이스)
    if (responseMinutes > 1440) return;

    // 이 업체가 응답한 총 채팅방 수 (현재 포함) - groupBy로 DB 레벨에서 집계
    const respondedRoomCounts = await this.prisma.chatMessage.groupBy({
      by: ['roomId'],
      where: {
        senderId: companyUserId,
        messageType: { not: 'SYSTEM' },
        room: { companyId },
      },
    });
    const totalResponses = respondedRoomCounts.length;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { responseTime: true },
    });

    let newResponseTime: number;
    if (totalResponses <= 1 || company?.responseTime == null) {
      newResponseTime = responseMinutes;
    } else {
      // 누적 평균: (기존평균 × (n-1) + 신규값) / n
      newResponseTime = Math.round(
        (company.responseTime * (totalResponses - 1) + responseMinutes) /
          totalResponses,
      );
    }

    await this.prisma.company.update({
      where: { id: companyId },
      data: { responseTime: newResponseTime },
    });

    this.logger.log(
      `업체 응답시간 업데이트: companyId=${companyId}, ${newResponseTime}분 (${totalResponses}건 평균)`,
    );
  }
}
