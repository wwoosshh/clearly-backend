import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('구독')
@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('plans')
  @ApiOperation({ summary: '구독 플랜 목록 조회' })
  @ApiResponse({ status: 200, description: '플랜 목록 조회 성공' })
  async getPlans() {
    return this.subscriptionService.getPlans();
  }

  @Post(':planId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '구독 신청' })
  @ApiResponse({ status: 201, description: '구독 신청 성공' })
  async subscribe(
    @CurrentUser('id') companyId: string,
    @Param('planId') planId: string,
  ) {
    return this.subscriptionService.subscribe(companyId, planId);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '구독 상태 조회' })
  @ApiResponse({ status: 200, description: '구독 상태 조회 성공' })
  async getStatus(@CurrentUser('id') companyId: string) {
    return this.subscriptionService.getSubscriptionStatus(companyId);
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '구독 해지' })
  @ApiResponse({ status: 200, description: '구독 해지 성공' })
  async cancel(@CurrentUser('id') companyId: string) {
    return this.subscriptionService.cancel(companyId);
  }
}
