import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/notification',
})
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private userSocketMap = new Map<string, string[]>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('알림 웹소켓 게이트웨이 초기화 완료');
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
        secret: this.configService.get('JWT_ACCESS_SECRET'),
      });

      (client as any).userId = payload.sub;

      const sockets = this.userSocketMap.get(payload.sub) || [];
      sockets.push(client.id);
      this.userSocketMap.set(payload.sub, sockets);

      this.logger.log(
        `알림 클라이언트 연결: ${client.id}, userId: ${payload.sub}`,
      );
    } catch {
      this.logger.warn(`JWT 검증 실패: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client as any).userId;
    if (userId) {
      const sockets = this.userSocketMap.get(userId) || [];
      const filtered = sockets.filter((id) => id !== client.id);
      if (filtered.length > 0) {
        this.userSocketMap.set(userId, filtered);
      } else {
        this.userSocketMap.delete(userId);
      }
    }
    this.logger.log(`알림 클라이언트 연결 해제: ${client.id}`);
  }

  sendToUser(userId: string, event: string, data: any) {
    const socketIds = this.userSocketMap.get(userId);
    if (socketIds && socketIds.length > 0) {
      for (const socketId of socketIds) {
        this.server.to(socketId).emit(event, data);
      }
      this.logger.log(
        `알림 전송: userId=${userId}, event=${event}, sockets=${socketIds.length}`,
      );
    }
  }
}
