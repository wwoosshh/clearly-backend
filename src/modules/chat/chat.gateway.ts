import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { ConnectionManager } from '../../common/websocket/connection-manager';

@WebSocketGateway({
  cors: {
    origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
      const allowed = process.env.FRONTEND_URL?.split(',').map((u) => u.trim()) || [];
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  },
  namespace: '/chat',
  pingTimeout: 30000,
  pingInterval: 25000,
  connectTimeout: 10000,
  maxHttpBufferSize: 1e6, // 1MB
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly connectionManager = new ConnectionManager('chat');
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('채팅 웹소켓 게이트웨이 초기화 완료');

    this.cleanupInterval = setInterval(() => {
      this.connectionManager.cleanupStaleConnections(this.server);
    }, 60000);
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`인증 토큰 없음: ${client.id}`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow('JWT_ACCESS_SECRET'),
      });

      (client as any).userId = payload.sub;

      this.connectionManager.addConnection(payload.sub, client.id, this.server);

      this.logger.log(
        `클라이언트 연결: ${client.id}, userId: ${payload.sub}, 총 연결: ${this.connectionManager.getTotalConnections()}`,
      );
    } catch {
      this.logger.warn(`JWT 검증 실패: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectionManager.removeConnection(client.id);
    this.logger.log(`클라이언트 연결 해제: ${client.id}`);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string,
  ) {
    client.join(roomId);
    this.logger.log(`클라이언트 ${client.id}가 방 ${roomId}에 입장`);
    return { event: 'joinedRoom', data: { roomId } };
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string,
  ) {
    client.leave(roomId);
    this.logger.log(`클라이언트 ${client.id}가 방 ${roomId}에서 퇴장`);
    return { event: 'leftRoom', data: { roomId } };
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      roomId: string;
      content: string;
      messageType?: string;
      fileUrl?: string;
    },
  ) {
    const userId = (client as any).userId;
    if (!userId) {
      throw new WsException('인증되지 않은 사용자입니다.');
    }

    try {
      const message = await this.chatService.sendMessage(
        payload.roomId,
        userId,
        payload.content,
        (payload.messageType as any) || 'TEXT',
        payload.fileUrl,
      );

      // 해당 방에 있는 모든 클라이언트에게 전송
      this.server.to(payload.roomId).emit('newMessage', message);

      return { event: 'messageSent', data: message };
    } catch (error) {
      throw new WsException(
        error instanceof Error ? error.message : '메시지 전송에 실패했습니다.',
      );
    }
  }

  @SubscribeMessage('markRead')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string,
  ) {
    const userId = (client as any).userId;
    if (!userId) return;

    const result = await this.chatService.markAsRead(roomId, userId);

    // 상대방에게 읽음 알림
    this.server.to(roomId).emit('messageRead', {
      roomId,
      readBy: userId,
      count: result.count,
    });

    return { event: 'markedRead', data: result };
  }
}
