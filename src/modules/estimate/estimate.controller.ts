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
import { Throttle } from '@nestjs/throttler';
import { EstimateService } from './estimate.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SubscriptionGuard } from '../auth/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireSubscription } from '../../common/decorators/subscription.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateEstimateRequestDto } from './dto/create-estimate-request.dto';
import { SubmitEstimateDto } from './dto/submit-estimate.dto';
import {
  getChecklistTemplate,
  getAllChecklistTemplates,
} from './cleaning-checklist';

@ApiTags('견적')
@Controller('estimates')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EstimateController {
  constructor(private readonly estimateService: EstimateService) {}

  // ─── 정적 라우트 (동적 :id 보다 먼저 선언해야 함) ───

  @Get('price-estimate')
  @UseGuards()
  @ApiOperation({ summary: '예상 가격 범위 조회 (공개)' })
  @ApiResponse({ status: 200, description: '예상 가격 범위 조회 성공' })
  async getPriceEstimate(
    @Query('cleaningType') cleaningType: string,
    @Query('areaSize') areaSize?: number,
    @Query('address') address?: string,
  ) {
    return this.estimateService.getPriceEstimate(
      cleaningType,
      areaSize ? Number(areaSize) : undefined,
      address,
    );
  }

  @Get('checklist-templates')
  @ApiOperation({ summary: '청소 유형별 체크리스트 템플릿 전체 조회' })
  @ApiResponse({ status: 200, description: '체크리스트 템플릿 목록' })
  getChecklistTemplates() {
    return getAllChecklistTemplates();
  }

  @Get('checklist-templates/:cleaningType')
  @ApiOperation({ summary: '특정 청소 유형의 체크리스트 템플릿 조회' })
  @ApiResponse({ status: 200, description: '체크리스트 템플릿' })
  getChecklistTemplate(@Param('cleaningType') cleaningType: string) {
    const template = getChecklistTemplate(cleaningType);
    if (!template) {
      return { message: '해당 청소 유형의 체크리스트가 없습니다.' };
    }
    return template;
  }

  @Post('requests')
  @UseGuards(RolesGuard)
  @Roles('USER')
  @ApiOperation({ summary: '견적요청 생성' })
  @ApiResponse({ status: 201, description: '견적요청 생성 성공' })
  async createEstimateRequest(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateEstimateRequestDto,
  ) {
    return this.estimateService.createEstimateRequest(userId, dto);
  }

  @Get('requests')
  @UseGuards(SubscriptionGuard)
  @RequireSubscription('BASIC')
  @ApiOperation({ summary: '견적요청 목록' })
  @ApiResponse({ status: 200, description: '견적요청 목록 조회 성공' })
  async getEstimateRequests(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.estimateService.getEstimateRequests(
      user.id,
      user.role,
      page || 1,
      limit || 10,
    );
  }

  @Get('requests/:id/compare')
  @UseGuards(RolesGuard)
  @Roles('USER')
  @ApiOperation({ summary: '견적 비교 데이터 조회' })
  @ApiResponse({ status: 200, description: '견적 비교 데이터 조회 성공' })
  async getEstimatesForComparison(
    @CurrentUser('id') userId: string,
    @Param('id') requestId: string,
  ) {
    return this.estimateService.getEstimatesForComparison(requestId, userId);
  }

  @Get('requests/:id')
  @ApiOperation({ summary: '견적요청 상세' })
  @ApiResponse({ status: 200, description: '견적요청 상세 조회 성공' })
  async getEstimateRequestById(
    @CurrentUser() user: { id: string; role: string },
    @Param('id') id: string,
  ) {
    return this.estimateService.getEstimateRequestById(id, user.id, user.role);
  }

  @Post('requests/:id/submit')
  @Throttle({ default: { ttl: 3600000, limit: 10 } })
  @UseGuards(RolesGuard, SubscriptionGuard)
  @Roles('COMPANY')
  @RequireSubscription('BASIC')
  @ApiOperation({ summary: '견적 제출' })
  @ApiResponse({ status: 201, description: '견적 제출 성공' })
  async submitEstimate(
    @CurrentUser('id') userId: string,
    @Param('id') estimateRequestId: string,
    @Body() dto: SubmitEstimateDto,
  ) {
    return this.estimateService.submitEstimate(userId, estimateRequestId, dto);
  }

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles('USER')
  @ApiOperation({ summary: '내가 받은 견적 목록' })
  @ApiResponse({ status: 200, description: '견적 목록 조회 성공' })
  async getMyEstimates(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.estimateService.getMyEstimates(userId, page || 1, limit || 10);
  }

  @Get('company-estimates')
  @UseGuards(RolesGuard, SubscriptionGuard)
  @Roles('COMPANY')
  @RequireSubscription('BASIC')
  @ApiOperation({ summary: '업체가 제출한 견적 목록' })
  @ApiResponse({ status: 200, description: '제출 견적 목록 조회 성공' })
  async getCompanyEstimates(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.estimateService.getCompanyEstimates(
      userId,
      page || 1,
      limit || 10,
    );
  }

  // ─── 동적 :id 라우트 (정적 라우트 뒤에 선언) ───

  @Get(':id')
  @ApiOperation({ summary: '견적 단건 조회' })
  @ApiResponse({ status: 200, description: '견적 상세 조회 성공' })
  async getEstimateById(
    @CurrentUser('id') userId: string,
    @Param('id') estimateId: string,
  ) {
    return this.estimateService.getEstimateById(estimateId, userId);
  }

  @Patch(':id/accept')
  @UseGuards(RolesGuard)
  @Roles('USER')
  @ApiOperation({ summary: '견적 수락' })
  @ApiResponse({ status: 200, description: '견적 수락 성공' })
  async acceptEstimate(
    @CurrentUser('id') userId: string,
    @Param('id') estimateId: string,
  ) {
    return this.estimateService.acceptEstimate(userId, estimateId);
  }

  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles('USER')
  @ApiOperation({ summary: '견적 거부' })
  @ApiResponse({ status: 200, description: '견적 거부 성공' })
  async rejectEstimate(
    @CurrentUser('id') userId: string,
    @Param('id') estimateId: string,
  ) {
    return this.estimateService.rejectEstimate(userId, estimateId);
  }
}
