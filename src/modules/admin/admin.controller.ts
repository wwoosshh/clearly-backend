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
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('관리자')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: '대시보드 통계 조회' })
  @ApiResponse({ status: 200, description: '대시보드 통계 조회 성공' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('users')
  @ApiOperation({ summary: '사용자 목록 조회' })
  @ApiResponse({ status: 200, description: '사용자 목록 조회 성공' })
  async getUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query() filters: any,
  ) {
    return this.adminService.getUsers(page, limit, filters);
  }

  @Patch('companies/:companyId/approve')
  @ApiOperation({ summary: '업체 승인' })
  @ApiResponse({ status: 200, description: '업체 승인 성공' })
  async approveCompany(@Param('companyId') companyId: string) {
    return this.adminService.approveCompany(companyId, true);
  }

  @Patch('companies/:companyId/reject')
  @ApiOperation({ summary: '업체 반려' })
  @ApiResponse({ status: 200, description: '업체 반려 성공' })
  async rejectCompany(@Param('companyId') companyId: string) {
    return this.adminService.approveCompany(companyId, false);
  }

  @Get('reports')
  @ApiOperation({ summary: '신고 목록 조회' })
  @ApiResponse({ status: 200, description: '신고 목록 조회 성공' })
  async getReports(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.adminService.getReports(page, limit);
  }

  @Get('settings')
  @ApiOperation({ summary: '시스템 설정 조회' })
  @ApiResponse({ status: 200, description: '시스템 설정 조회 성공' })
  async getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings')
  @ApiOperation({ summary: '시스템 설정 수정' })
  @ApiResponse({ status: 200, description: '시스템 설정 수정 성공' })
  async updateSettings(@Body() settingsDto: any) {
    return this.adminService.updateSettings(settingsDto);
  }
}
