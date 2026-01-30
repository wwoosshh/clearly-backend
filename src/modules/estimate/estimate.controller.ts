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
import { EstimateService } from './estimate.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateEstimateRequestDto } from './dto/create-estimate-request.dto';
import { SubmitEstimateDto } from './dto/submit-estimate.dto';

@ApiTags('견적')
@Controller('estimates')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EstimateController {
  constructor(private readonly estimateService: EstimateService) {}

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

  @Get('requests/:id')
  @ApiOperation({ summary: '견적요청 상세' })
  @ApiResponse({ status: 200, description: '견적요청 상세 조회 성공' })
  async getEstimateRequestById(@Param('id') id: string) {
    return this.estimateService.getEstimateRequestById(id);
  }

  @Post('requests/:id/submit')
  @UseGuards(RolesGuard)
  @Roles('COMPANY')
  @ApiOperation({ summary: '견적 제출 (포인트 차감)' })
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

  @Get('company-estimates')
  @UseGuards(RolesGuard)
  @Roles('COMPANY')
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
}
