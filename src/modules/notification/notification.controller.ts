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
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationService.findByUser(
      req.user.sub,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req: any) {
    const count = await this.notificationService.getUnreadCount(req.user.sub);
    return { unreadCount: count };
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Request() req: any) {
    return this.notificationService.markAsRead(id, req.user.sub);
  }

  @Patch('read-all')
  async markAllAsRead(@Request() req: any) {
    return this.notificationService.markAllAsRead(req.user.sub);
  }

  @Post('device-token')
  async registerDeviceToken(
    @Request() req: any,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.fcmService.registerToken(req.user.sub, dto.token, dto.platform);
  }

  @Delete('device-token')
  async unregisterDeviceToken(
    @Request() req: any,
    @Body() dto: UnregisterDeviceTokenDto,
  ) {
    return this.fcmService.unregisterToken(req.user.sub, dto.token);
  }
}
