import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

@ApiTags('구독')
@Controller('subscriptions')
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('plans')
  @ApiOperation({ summary: '구독 플랜 목록 조회 (Public)' })
  @ApiResponse({ status: 200, description: '플랜 목록 조회 성공' })
  async getPlans() {
    return this.subscriptionService.getPlans();
  }

  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY')
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 구독 상태 조회' })
  @ApiResponse({ status: 200, description: '구독 상태 조회 성공' })
  async getMySubscription(@CurrentUser() user: AuthenticatedUser) {
    const company = await this.getCompanyByUserId(user.id);
    return this.subscriptionService.getHighestActiveSubscription(company.id);
  }

  @Get('my/history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY')
  @ApiBearerAuth()
  @ApiOperation({ summary: '구독 이력 조회' })
  @ApiResponse({ status: 200, description: '구독 이력 조회 성공' })
  async getMyHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const company = await this.getCompanyByUserId(user.id);
    return this.subscriptionService.getSubscriptionHistory(
      company.id,
      page || 1,
      limit || 10,
    );
  }

  @Get('my/stack')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY')
  @ApiBearerAuth()
  @ApiOperation({ summary: '구독 스택 조회 (ACTIVE/PAUSED/QUEUED)' })
  @ApiResponse({ status: 200, description: '구독 스택 조회 성공' })
  async getMyStack(@CurrentUser() user: AuthenticatedUser) {
    const company = await this.getCompanyByUserId(user.id);
    return this.subscriptionService.getSubscriptionStack(company.id);
  }

  @Get('my/estimate-limit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY')
  @ApiBearerAuth()
  @ApiOperation({ summary: '오늘의 견적 한도 현황' })
  @ApiResponse({ status: 200, description: '견적 한도 조회 성공' })
  async getEstimateLimit(@CurrentUser() user: AuthenticatedUser) {
    const company = await this.getCompanyByUserId(user.id);
    return this.subscriptionService.canSubmitEstimate(company.id);
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY')
  @ApiBearerAuth()
  @ApiOperation({ summary: '구독 신청' })
  @ApiResponse({ status: 201, description: '구독 신청 성공' })
  async subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSubscriptionDto,
  ) {
    const company = await this.getCompanyByUserId(user.id);
    return this.subscriptionService.createSubscription(company.id, dto.planId);
  }

  @Delete('cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY')
  @ApiBearerAuth()
  @ApiOperation({ summary: '구독 해지' })
  @ApiResponse({ status: 200, description: '구독 해지 성공' })
  async cancel(@CurrentUser() user: AuthenticatedUser) {
    const company = await this.getCompanyByUserId(user.id);
    return this.subscriptionService.cancelSubscription(company.id);
  }

  private async getCompanyByUserId(userId: string) {
    const company = await this.prisma.company.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!company) {
      throw new NotFoundException('업체 정보를 찾을 수 없습니다.');
    }
    return company;
  }
}
