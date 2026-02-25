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
import { BannerService } from './banner.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Banner')
@Controller('banners')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  // ─── 공개 ─────────────────────────────────────────────

  @Get()
  @Public()
  @ApiOperation({ summary: '공개 배너 목록 조회' })
  @ApiResponse({ status: 200, description: '배너 목록 조회 성공' })
  async getPublicBanners() {
    return this.bannerService.getPublicBanners();
  }

  // ─── 관리자 ───────────────────────────────────────────

  @Get('admin')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '관리자 배너 목록 조회' })
  @ApiResponse({ status: 200, description: '관리자 배너 목록 조회 성공' })
  async getAdminBanners(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
  ) {
    return this.bannerService.getAdminBanners(page, limit);
  }

  @Post('admin')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '배너 생성' })
  @ApiResponse({ status: 201, description: '배너 생성 성공' })
  async createBanner(@Body() dto: CreateBannerDto) {
    return this.bannerService.createBanner(dto);
  }

  @Patch('admin/reorder')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '배너 정렬 순서 변경' })
  @ApiResponse({ status: 200, description: '배너 정렬 순서 변경 성공' })
  async reorderBanners(@Body() items: { id: string; sortOrder: number }[]) {
    return this.bannerService.reorderBanners(items);
  }

  @Patch('admin/:id')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '배너 수정' })
  @ApiResponse({ status: 200, description: '배너 수정 성공' })
  async updateBanner(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    return this.bannerService.updateBanner(id, dto);
  }

  @Delete('admin/:id')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '배너 삭제' })
  @ApiResponse({ status: 200, description: '배너 삭제 성공' })
  async deleteBanner(@Param('id') id: string) {
    return this.bannerService.deleteBanner(id);
  }
}
