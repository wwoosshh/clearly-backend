import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('채팅')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Post('rooms')
  @ApiOperation({ summary: '채팅방 생성' })
  @ApiResponse({ status: 201, description: '채팅방 생성 성공' })
  async createRoom(
    @CurrentUser('id') userId: string,
    @Body() body: { companyId: string },
  ) {
    return this.chatService.createRoom(userId, body.companyId);
  }

  @Get('rooms')
  @ApiOperation({ summary: '내 채팅방 목록' })
  @ApiResponse({ status: 200, description: '채팅방 목록 조회 성공' })
  async getUserRooms(@CurrentUser('id') userId: string) {
    return this.chatService.getUserRooms(userId);
  }

  @Get('rooms/:id')
  @ApiOperation({ summary: '채팅방 상세 조회' })
  @ApiResponse({ status: 200, description: '채팅방 상세 조회 성공' })
  async getRoomById(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.getRoomById(roomId, userId);
  }

  @Get('rooms/:id/messages')
  @ApiOperation({ summary: '메시지 목록 조회' })
  @ApiResponse({ status: 200, description: '메시지 목록 조회 성공' })
  async getMessages(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.chatService.getMessages(roomId, userId, page || 1, limit || 50);
  }

  @Post('rooms/:id/messages')
  @ApiOperation({ summary: '메시지 전송 (REST)' })
  @ApiResponse({ status: 201, description: '메시지 전송 성공' })
  async sendMessage(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { content: string; messageType?: string; fileUrl?: string },
  ) {
    return this.chatService.sendMessage(
      roomId,
      userId,
      body.content,
      (body.messageType as any) || 'TEXT',
      body.fileUrl,
    );
  }

  @Patch('rooms/:id/read')
  @ApiOperation({ summary: '읽음 처리' })
  @ApiResponse({ status: 200, description: '읽음 처리 성공' })
  async markAsRead(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.chatService.markAsRead(roomId, userId);

    // REST 호출 시에도 WebSocket으로 읽음 알림 전송
    if (result.count > 0) {
      this.chatGateway.server.to(roomId).emit('messageRead', {
        roomId,
        readBy: userId,
        count: result.count,
      });
    }

    return result;
  }

  @Patch('rooms/:id/complete')
  @ApiOperation({ summary: '거래완료' })
  @ApiResponse({ status: 200, description: '거래완료 처리 성공' })
  async completeTransaction(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.completeTransaction(roomId, userId);
  }

  @Patch('rooms/:id/decline')
  @ApiOperation({ summary: '거래안함' })
  @ApiResponse({ status: 200, description: '거래안함 처리 성공' })
  async declineRoom(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.declineRoom(roomId, userId);
  }
}
