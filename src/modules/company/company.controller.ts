import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CompanyService } from './company.service';
import { CompanyMetricsService } from './company-metrics.service';
import { CompanyCustomerService } from './company-customer.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { SearchCompanyDto } from './dto/search-company.dto';
import { GetCustomersDto } from './dto/get-customers.dto';
import { UpdateCustomerStageDto } from './dto/update-customer-stage.dto';
import { UpdateCustomerTagsDto } from './dto/update-customer-tags.dto';
import { BatchMessageDto } from './dto/batch-message.dto';
import { ManageTagDto } from './dto/manage-tag.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('업체')
@Controller('companies')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly companyMetricsService: CompanyMetricsService,
    private readonly companyCustomerService: CompanyCustomerService,
  ) {}

  @Get()
  @ApiOperation({ summary: '업체 목록 조회' })
  @ApiResponse({ status: 200, description: '업체 목록 조회 성공' })
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.companyService.findAll(page, limit);
  }

  @Get('search')
  @ApiOperation({ summary: '업체 검색 (거리 + 점수 기반 랭킹)' })
  @ApiResponse({ status: 200, description: '업체 검색 성공' })
  async search(@Query() searchDto: SearchCompanyDto) {
    return this.companyService.searchCompanies(searchDto);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 업체 정보 조회' })
  @ApiResponse({ status: 200, description: '내 업체 정보 조회 성공' })
  @ApiResponse({ status: 404, description: '등록된 업체 없음' })
  async getMyCompany(@CurrentUser('id') userId: string) {
    return this.companyService.getMyCompany(userId);
  }

  @Get('my/metrics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 업체 성과 지표 조회' })
  @ApiResponse({ status: 200, description: '성과 지표 조회 성공' })
  async getMyMetrics(@CurrentUser('id') userId: string) {
    const company = await this.companyService.getMyCompany(userId);
    return this.companyMetricsService.getCompanyMetrics(company.id);
  }

  @Get('my/tags')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '태그 프리셋 목록 조회' })
  async getMyTags(@CurrentUser('id') userId: string) {
    const company = await this.companyService.getMyCompany(userId);
    return this.companyCustomerService.getCompanyTags(company.id);
  }

  @Post('my/tags')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '태그 생성' })
  async createMyTag(
    @CurrentUser('id') userId: string,
    @Body() dto: ManageTagDto,
  ) {
    const company = await this.companyService.getMyCompany(userId);
    return this.companyCustomerService.createCompanyTag(
      company.id,
      dto.name,
      dto.color,
    );
  }

  @Delete('my/tags/:tagId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '태그 삭제' })
  async deleteMyTag(
    @CurrentUser('id') userId: string,
    @Param('tagId') tagId: string,
  ) {
    const company = await this.companyService.getMyCompany(userId);
    return this.companyCustomerService.deleteCompanyTag(company.id, tagId);
  }

  @Get('my/customers/pipeline')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '고객 파이프라인 (칸반) 뷰' })
  async getMyCustomersPipeline(
    @CurrentUser('id') userId: string,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
  ) {
    const company = await this.companyService.getMyCompany(userId);
    return this.companyCustomerService.getCustomersPipeline(
      company.id,
      search,
      tag,
    );
  }

  @Get('my/customers/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '고객 통계 대시보드' })
  async getMyCustomerStats(@CurrentUser('id') userId: string) {
    const company = await this.companyService.getMyCompany(userId);
    return this.companyCustomerService.getCustomerStats(company.id);
  }

  @Get('my/customers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 고객 목록 조회' })
  @ApiResponse({ status: 200, description: '고객 목록 조회 성공' })
  async getMyCustomers(
    @CurrentUser('id') userId: string,
    @Query() dto: GetCustomersDto,
  ) {
    const company = await this.companyService.getMyCompany(userId);
    return this.companyCustomerService.getCustomers(company.id, dto);
  }

  @Patch('my/customers/:userId/stage')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '고객 파이프라인 단계 변경' })
  async updateCustomerStage(
    @CurrentUser('id') currentUserId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateCustomerStageDto,
  ) {
    const company = await this.companyService.getMyCompany(currentUserId);
    return this.companyCustomerService.updateCustomerStage(
      company.id,
      targetUserId,
      dto.stage,
    );
  }

  @Patch('my/customers/:userId/tags')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '고객 태그 변경' })
  async updateCustomerTags(
    @CurrentUser('id') currentUserId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateCustomerTagsDto,
  ) {
    const company = await this.companyService.getMyCompany(currentUserId);
    return this.companyCustomerService.updateCustomerTags(
      company.id,
      targetUserId,
      dto.tags,
    );
  }

  @Post('my/customers/batch-message')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '고객 일괄 메시지 발송' })
  async sendBatchMessage(
    @CurrentUser('id') currentUserId: string,
    @Body() dto: BatchMessageDto,
  ) {
    const company = await this.companyService.getMyCompany(currentUserId);
    return this.companyCustomerService.sendBatchMessage(
      company.id,
      currentUserId,
      dto.userIds,
      dto.content,
    );
  }

  @Get('my/customers/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '고객 상세 조회' })
  @ApiResponse({ status: 200, description: '고객 상세 조회 성공' })
  async getCustomerDetail(
    @CurrentUser('id') currentUserId: string,
    @Param('userId') targetUserId: string,
  ) {
    const company = await this.companyService.getMyCompany(currentUserId);
    return this.companyCustomerService.getCustomerDetail(
      company.id,
      targetUserId,
    );
  }

  @Put('my/customers/:userId/memo')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '고객 메모 저장' })
  @ApiResponse({ status: 200, description: '고객 메모 저장 성공' })
  async upsertCustomerMemo(
    @CurrentUser('id') currentUserId: string,
    @Param('userId') targetUserId: string,
    @Body('content') content: string,
  ) {
    const company = await this.companyService.getMyCompany(currentUserId);
    return this.companyCustomerService.upsertMemo(
      company.id,
      targetUserId,
      content,
    );
  }

  @Get(':id/metrics')
  @ApiOperation({ summary: '업체 성과 지표 조회' })
  @ApiResponse({ status: 200, description: '성과 지표 조회 성공' })
  async getCompanyMetrics(@Param('id') id: string) {
    return this.companyMetricsService.getCompanyMetrics(id);
  }

  @Get(':id')
  @ApiOperation({ summary: '업체 상세 조회' })
  @ApiResponse({ status: 200, description: '업체 상세 조회 성공' })
  @ApiResponse({ status: 404, description: '업체를 찾을 수 없음' })
  async findById(@Param('id') id: string) {
    return this.companyService.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '업체 정보 수정' })
  @ApiResponse({ status: 200, description: '업체 정보 수정 성공' })
  async update(
    @Param('id') id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @CurrentUser('id') userId: string,
    @Req() req: any,
  ) {
    // class-transformer의 enableImplicitConversion이 Json 필드의
    // nested object를 빈 배열로 손상시키므로 raw body에서 원본 복원
    const raw = req.body;
    const jsonFields = ['portfolio', 'certificationDocs', 'faq'] as const;
    for (const field of jsonFields) {
      if (raw[field] !== undefined) {
        (updateCompanyDto as any)[field] = raw[field];
      }
    }

    return this.companyService.update(id, updateCompanyDto, userId);
  }
}
