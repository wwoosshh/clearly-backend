import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationService } from './notification.service';
import { FcmService } from './fcm.service';
import {
  RegisterDeviceTokenDto,
  UnregisterDeviceTokenDto,
} from './dto/register-device-token.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly fcmService: FcmService,
  ) {}

  @Get()
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationService.findByUser(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser('id') userId: string) {
    const count = await this.notificationService.getUnreadCount(userId);
    return { unreadCount: count };
  }

  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.notificationService.markAsRead(id, userId);
  }

  @Patch('read-all')
  async markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationService.markAllAsRead(userId);
  }

  @Post('device-token')
  async registerDeviceToken(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.fcmService.registerToken(userId, dto.token, dto.platform);
  }

  @Delete('device-token')
  async unregisterDeviceToken(
    @CurrentUser('id') userId: string,
    @Body() dto: UnregisterDeviceTokenDto,
  ) {
    return this.fcmService.unregisterToken(userId, dto.token);
  }
}
