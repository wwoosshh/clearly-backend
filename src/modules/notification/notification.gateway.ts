import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConnectionManager } from '../../common/websocket/connection-manager';

@WebSocketGateway({
  cors: {
    origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
      const allowed = process.env.FRONTEND_URL?.split(',').map((u) => u.trim()) || [];
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // 모바일 앱은 origin이 없을 수 있음
      }
    },
    credentials: true,
  },
  namespace: '/notification',
  pingTimeout: 30000,
  pingInterval: 25000,
  connectTimeout: 10000,
})
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private readonly connectionManager = new ConnectionManager('notification');
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('알림 웹소켓 게이트웨이 초기화 완료');

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
        secret: this.configService.get('JWT_ACCESS_SECRET'),
      });

      (client as any).userId = payload.sub;

      this.connectionManager.addConnection(payload.sub, client.id, this.server);

      this.logger.log(
        `알림 클라이언트 연결: ${client.id}, userId: ${payload.sub}, 총 연결: ${this.connectionManager.getTotalConnections()}`,
      );
    } catch {
      this.logger.warn(`JWT 검증 실패: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectionManager.removeConnection(client.id);
    this.logger.log(`알림 클라이언트 연결 해제: ${client.id}`);
  }

  sendToUser(userId: string, event: string, data: any) {
    const socketIds = this.connectionManager.getSocketIds(userId);
    if (socketIds.length > 0) {
      for (const socketId of socketIds) {
        this.server.to(socketId).emit(event, data);
      }
      this.logger.log(
        `알림 전송: userId=${userId}, event=${event}, sockets=${socketIds.length}`,
      );
    }
  }
}
