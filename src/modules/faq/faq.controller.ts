import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { FaqService } from './faq.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('FAQ')
@Controller('faq')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

  // ─── 공개 ─────────────────────────────────────────────

  @Get()
  @Public()
  @ApiOperation({ summary: '공개 FAQ 목록 조회' })
  @ApiResponse({ status: 200, description: 'FAQ 목록 조회 성공' })
  async getPublicFaqs(@Query('search') search?: string) {
    return this.faqService.getPublicFaqs(search);
  }

  // ─── 관리자 ───────────────────────────────────────────

  @Get('admin')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '관리자 FAQ 목록 조회' })
  @ApiResponse({ status: 200, description: '관리자 FAQ 목록 조회 성공' })
  async getAdminFaqs(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('category') category?: string,
  ) {
    return this.faqService.getAdminFaqs(page, limit, category);
  }

  @Post('admin')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'FAQ 생성' })
  @ApiResponse({ status: 201, description: 'FAQ 생성 성공' })
  async createFaq(@Body() dto: CreateFaqDto) {
    return this.faqService.createFaq(dto);
  }

  @Patch('admin/:id')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'FAQ 수정' })
  @ApiResponse({ status: 200, description: 'FAQ 수정 성공' })
  async updateFaq(@Param('id') id: string, @Body() dto: UpdateFaqDto) {
    return this.faqService.updateFaq(id, dto);
  }

  @Delete('admin/:id')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'FAQ 삭제' })
  @ApiResponse({ status: 200, description: 'FAQ 삭제 성공' })
  async deleteFaq(@Param('id') id: string) {
    return this.faqService.deleteFaq(id);
  }

  @Patch('admin/reorder')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'FAQ 정렬 순서 변경' })
  @ApiResponse({ status: 200, description: 'FAQ 정렬 순서 변경 성공' })
  async reorderFaqs(@Body() items: { id: string; sortOrder: number }[]) {
    return this.faqService.reorderFaqs(items);
  }
}
