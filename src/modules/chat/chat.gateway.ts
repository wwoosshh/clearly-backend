import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly chatService: ChatService) {}

  afterInit() {
    this.logger.log('채팅 웹소켓 게이트웨이 초기화 완료');
  }

  handleConnection(client: Socket) {
    this.logger.log(`클라이언트 연결: ${client.id}`);
    // TODO: JWT 토큰 검증 및 사용자 인증
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`클라이언트 연결 해제: ${client.id}`);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string,
  ) {
    client.join(roomId);
    this.logger.log(`클라이언트 ${client.id}가 방 ${roomId}에 입장`);
    // TODO: 구현 예정
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string,
  ) {
    client.leave(roomId);
    this.logger.log(`클라이언트 ${client.id}가 방 ${roomId}에서 퇴장`);
    // TODO: 구현 예정
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; content: string },
  ) {
    // TODO: 메시지 저장 및 브로드캐스트 구현 예정
    this.server.to(payload.roomId).emit('newMessage', {
      roomId: payload.roomId,
      content: payload.content,
      senderId: client.id,
      timestamp: new Date().toISOString(),
    });
  }
}
