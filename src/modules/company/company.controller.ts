import {
  Controller,
  Get,
  Post,
  Patch,
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
import { UpdateCompanyDto } from './dto/update-company.dto';
import { SearchCompanyDto } from './dto/search-company.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('업체')
@Controller('companies')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly companyMetricsService: CompanyMetricsService,
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
