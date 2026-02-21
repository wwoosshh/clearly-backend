import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/cache/redis.service';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: any;
  let eventEmitter: any;

  const mockCompany = {
    id: 'company-uuid-1',
    userId: 'company-user-uuid-1',
    businessName: '테스트청소업체',
    responseTime: 30,
  };

  const mockRoom = {
    id: 'room-uuid-1',
    userId: 'user-uuid-1',
    companyId: 'company-uuid-1',
    isActive: true,
    userDeclined: false,
    companyDeclined: false,
    lastMessage: null,
    lastSentAt: null,
    createdAt: new Date(),
    company: mockCompany,
    matching: null,
  };

  const mockMessage = {
    id: 'msg-uuid-1',
    roomId: 'room-uuid-1',
    senderId: 'user-uuid-1',
    content: '안녕하세요',
    messageType: 'TEXT',
    isRead: false,
    sender: { id: 'user-uuid-1', name: '테스트유저', profileImage: null },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: PrismaService,
          useValue: {
            chatRoom: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            chatMessage: {
              findMany: jest.fn(),
              count: jest.fn(),
              create: jest.fn(),
              updateMany: jest.fn(),
            },
            company: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            matching: {
              update: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    prisma = module.get(PrismaService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe('createRoom', () => {
    it('기존 채팅방이 있으면 반환', async () => {
      prisma.chatRoom.findFirst.mockResolvedValue(mockRoom);

      const result = await service.createRoom('user-uuid-1', 'company-uuid-1');
      expect(result.id).toBe('room-uuid-1');
      expect(prisma.chatRoom.create).not.toHaveBeenCalled();
    });

    it('채팅방 신규 생성 + 시스템 메시지', async () => {
      prisma.chatRoom.findFirst.mockResolvedValue(null);
      prisma.chatRoom.create.mockResolvedValue({
        ...mockRoom,
        user: { id: 'user-uuid-1', name: '테스트유저' },
      });
      prisma.chatMessage.create.mockResolvedValue({});

      const result = await service.createRoom('user-uuid-1', 'company-uuid-1');

      expect(result.id).toBe('room-uuid-1');
      expect(prisma.chatRoom.create).toHaveBeenCalled();
      expect(prisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            messageType: 'SYSTEM',
            content: '채팅 상담이 시작되었습니다.',
          }),
        }),
      );
    });
  });

  describe('sendMessage', () => {
    it('텍스트 메시지 전송 성공', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.$transaction.mockResolvedValue([mockMessage, {}]);
      prisma.chatMessage.count.mockResolvedValue(1);

      const result = await service.sendMessage(
        'room-uuid-1',
        'user-uuid-1',
        '안녕하세요',
      );

      expect(result.content).toBe('안녕하세요');
    });

    it('채팅방 없으면 NotFoundException', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue(null);

      await expect(
        service.sendMessage('unknown-id', 'user-uuid-1', '안녕하세요'),
      ).rejects.toThrow(NotFoundException);
    });

    it('참여자가 아니면 ForbiddenException', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue(mockRoom);

      await expect(
        service.sendMessage('room-uuid-1', 'stranger-uuid', '안녕하세요'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('양측 거래취소 상태에서 일반 메시지 전송 시 BadRequestException', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        userDeclined: true,
        companyDeclined: true,
      });

      await expect(
        service.sendMessage('room-uuid-1', 'user-uuid-1', '안녕하세요', 'TEXT'),
      ).rejects.toThrow(BadRequestException);
    });

    it('양측 거래취소 상태에서도 SYSTEM 메시지는 허용', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        userDeclined: true,
        companyDeclined: true,
      });
      prisma.$transaction.mockResolvedValue([
        { ...mockMessage, messageType: 'SYSTEM' },
        {},
      ]);
      prisma.chatMessage.count.mockResolvedValue(0);

      const result = await service.sendMessage(
        'room-uuid-1',
        'user-uuid-1',
        '시스템 메시지',
        'SYSTEM',
      );

      expect(result).toBeDefined();
    });

    it('첫 메시지일 때 상대방에게 알림 발송', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.$transaction.mockResolvedValue([mockMessage, {}]);
      prisma.chatMessage.count.mockResolvedValue(1); // 방금 보낸 1건 = 첫 메시지

      await service.sendMessage('room-uuid-1', 'user-uuid-1', '안녕하세요');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.message.firstReply',
        expect.anything(),
      );
    });
  });

  describe('getMessages', () => {
    it('메시지 목록 조회 성공', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.chatMessage.findMany.mockResolvedValue([mockMessage]);
      prisma.chatMessage.count.mockResolvedValue(1);

      const result = await service.getMessages('room-uuid-1', 'user-uuid-1');

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('채팅방 없으면 NotFoundException', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue(null);

      await expect(
        service.getMessages('unknown-id', 'user-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('참여자가 아니면 ForbiddenException', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue(mockRoom);

      await expect(
        service.getMessages('room-uuid-1', 'stranger-uuid'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('markAsRead', () => {
    it('읽음 처리 성공', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.chatMessage.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAsRead('room-uuid-1', 'user-uuid-1');
      expect(result.count).toBe(3);
    });

    it('채팅방 없으면 NotFoundException', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue(null);

      await expect(
        service.markAsRead('unknown-id', 'user-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('completeTransaction', () => {
    const roomWithMatching = {
      ...mockRoom,
      matching: { id: 'matching-uuid-1', status: 'ACCEPTED' },
    };

    it('거래완료 성공', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue(roomWithMatching);
      prisma.matching.update.mockResolvedValue({
        id: 'matching-uuid-1',
        status: 'COMPLETED',
      });
      // sendMessage 호출 시 필요한 모킹
      prisma.$transaction.mockResolvedValue([
        { ...mockMessage, messageType: 'SYSTEM' },
        {},
      ]);
      prisma.chatMessage.count.mockResolvedValue(0);

      const result = await service.completeTransaction(
        'room-uuid-1',
        'user-uuid-1',
      );

      expect(result.completed).toBe(true);
      expect(result.matchingId).toBe('matching-uuid-1');
    });

    it('업체 유저가 시도하면 ForbiddenException', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue(roomWithMatching);

      await expect(
        service.completeTransaction('room-uuid-1', 'company-user-uuid-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('매칭 없는 채팅방이면 BadRequestException', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        matching: null,
      });

      await expect(
        service.completeTransaction('room-uuid-1', 'user-uuid-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('이미 완료된 매칭이면 BadRequestException', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        matching: { id: 'matching-uuid-1', status: 'COMPLETED' },
      });

      await expect(
        service.completeTransaction('room-uuid-1', 'user-uuid-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('declineRoom', () => {
    it('유저가 거래안함 처리', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.chatRoom.update.mockResolvedValue({
        ...mockRoom,
        userDeclined: true,
      });
      // sendMessage 호출 모킹
      prisma.$transaction.mockResolvedValue([
        { ...mockMessage, messageType: 'SYSTEM' },
        {},
      ]);
      prisma.chatMessage.count.mockResolvedValue(0);

      const result = await service.declineRoom('room-uuid-1', 'user-uuid-1');

      expect(result.bothDeclined).toBe(false);
      expect(prisma.chatRoom.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userDeclined: true },
        }),
      );
    });

    it('양쪽 거래안함 → 환불 요청 상태', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        companyDeclined: true,
      });
      prisma.chatRoom.update
        .mockResolvedValueOnce({
          ...mockRoom,
          userDeclined: true,
          companyDeclined: true,
        })
        .mockResolvedValueOnce({
          ...mockRoom,
          userDeclined: true,
          companyDeclined: true,
          refundStatus: 'REQUESTED',
        });
      // sendMessage 호출 모킹
      prisma.$transaction.mockResolvedValue([
        { ...mockMessage, messageType: 'SYSTEM' },
        {},
      ]);
      prisma.chatMessage.count.mockResolvedValue(0);

      const result = await service.declineRoom('room-uuid-1', 'user-uuid-1');

      expect(result.bothDeclined).toBe(true);
    });

    it('참여자가 아니면 ForbiddenException', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue(mockRoom);

      await expect(
        service.declineRoom('room-uuid-1', 'stranger-uuid'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('채팅방 없으면 NotFoundException', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue(null);

      await expect(
        service.declineRoom('unknown-id', 'user-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
