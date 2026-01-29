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
import { CompanyService } from './company.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('업체')
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '업체 등록' })
  @ApiResponse({ status: 201, description: '업체 등록 성공' })
  async create(@Body() createCompanyDto: any) {
    return this.companyService.create(createCompanyDto);
  }

  @Get()
  @ApiOperation({ summary: '업체 목록 조회' })
  @ApiResponse({ status: 200, description: '업체 목록 조회 성공' })
  async findAll(@Query('page') page: number = 1, @Query('limit') limit: number = 10) {
    return this.companyService.findAll(page, limit);
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
  async update(@Param('id') id: string, @Body() updateCompanyDto: any) {
    return this.companyService.update(id, updateCompanyDto);
  }
}
