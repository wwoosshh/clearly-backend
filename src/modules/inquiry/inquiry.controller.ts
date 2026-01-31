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
import { InquiryService } from './inquiry.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { AnswerInquiryDto } from './dto/answer-inquiry.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('문의')
@Controller('inquiries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InquiryController {
  constructor(private readonly inquiryService: InquiryService) {}

  // ─── 공개 ─────────────────────────────────────────────

  @Post()
  @Public()
  @ApiOperation({ summary: '문의 등록' })
  @ApiResponse({ status: 201, description: '문의 등록 성공' })
  async createInquiry(@Body() dto: CreateInquiryDto) {
    return this.inquiryService.createInquiry(dto);
  }

  // ─── 유저 ─────────────────────────────────────────────

  @Get('my')
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 문의 목록 조회' })
  @ApiResponse({ status: 200, description: '내 문의 목록 조회 성공' })
  async getMyInquiries(
    @CurrentUser('id') userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.inquiryService.getMyInquiries(userId, page, limit);
  }

  @Get('my/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 문의 상세 조회' })
  @ApiResponse({ status: 200, description: '내 문의 상세 조회 성공' })
  async getMyInquiryDetail(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.inquiryService.getMyInquiryDetail(userId, id);
  }

  // ─── 관리자 ───────────────────────────────────────────

  @Get('admin')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '관리자 문의 목록 조회' })
  @ApiResponse({ status: 200, description: '관리자 문의 목록 조회 성공' })
  async getAdminInquiries(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('status') status?: string,
  ) {
    return this.inquiryService.getAdminInquiries(page, limit, status);
  }

  @Get('admin/:id')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '관리자 문의 상세 조회' })
  @ApiResponse({ status: 200, description: '관리자 문의 상세 조회 성공' })
  async getAdminInquiryDetail(@Param('id') id: string) {
    return this.inquiryService.getAdminInquiryDetail(id);
  }

  @Patch('admin/:id/answer')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '문의 답변 작성' })
  @ApiResponse({ status: 200, description: '문의 답변 작성 성공' })
  async answerInquiry(
    @Param('id') id: string,
    @Body() dto: AnswerInquiryDto,
  ) {
    return this.inquiryService.answerInquiry(id, dto);
  }

  @Patch('admin/:id/close')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '문의 종료' })
  @ApiResponse({ status: 200, description: '문의 종료 성공' })
  async closeInquiry(@Param('id') id: string) {
    return this.inquiryService.closeInquiry(id);
  }
}
