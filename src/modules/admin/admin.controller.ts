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
import { AdminService } from './admin.service';
import { RejectCompanyDto } from './dto/reject-company.dto';
import { SuspendCompanyDto } from './dto/suspend-company.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

interface UserFilters { search?: string; role?: string; isActive?: string; }
interface ChatRoomFilters { search?: string; isActive?: string; refundStatus?: string; }
interface ReportFilters { status?: string; targetType?: string; }
interface ReviewFilters { isVisible?: string; minRating?: string; maxRating?: string; }
interface EstimateRequestFilters { status?: string; cleaningType?: string; }
interface MatchingFilters { status?: string; }
interface SubscriptionFilters { status?: string; tier?: string; search?: string; }

@ApiTags('관리자')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── 대시보드 ───────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: '대시보드 통계 조회' })
  @ApiResponse({ status: 200, description: '대시보드 통계 조회 성공' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  // ─── 사용자 관리 ────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: '사용자 목록 조회' })
  @ApiResponse({ status: 200, description: '사용자 목록 조회 성공' })
  async getUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query() filters: UserFilters,
  ) {
    return this.adminService.getUsers(page, limit, filters);
  }

  @Get('users/:userId')
  @ApiOperation({ summary: '사용자 상세 조회' })
  @ApiResponse({ status: 200, description: '사용자 상세 조회 성공' })
  async getUserDetail(@Param('userId') userId: string) {
    return this.adminService.getUserDetail(userId);
  }

  @Patch('users/:userId/toggle-active')
  @ApiOperation({ summary: '사용자 활성/비활성 토글' })
  @ApiResponse({ status: 200, description: '사용자 상태 변경 성공' })
  async toggleUserActive(@Param('userId') userId: string) {
    return this.adminService.toggleUserActive(userId);
  }

  // ─── 업체 관리 ──────────────────────────────────────────

  @Get('companies')
  @ApiOperation({ summary: '업체 목록 조회' })
  @ApiResponse({ status: 200, description: '업체 목록 조회 성공' })
  async getCompanies(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('status') status?: string,
  ) {
    return this.adminService.getCompanies(page, limit, status);
  }

  @Get('companies/:companyId')
  @ApiOperation({ summary: '업체 상세 조회' })
  @ApiResponse({ status: 200, description: '업체 상세 조회 성공' })
  async getCompanyDetail(@Param('companyId') companyId: string) {
    return this.adminService.getCompanyDetail(companyId);
  }

  @Patch('companies/:companyId/approve')
  @ApiOperation({ summary: '업체 승인' })
  @ApiResponse({ status: 200, description: '업체 승인 성공' })
  async approveCompany(@Param('companyId') companyId: string) {
    return this.adminService.approveCompany(companyId);
  }

  @Patch('companies/:companyId/reject')
  @ApiOperation({ summary: '업체 반려' })
  @ApiResponse({ status: 200, description: '업체 반려 성공' })
  async rejectCompany(
    @Param('companyId') companyId: string,
    @Body() rejectCompanyDto: RejectCompanyDto,
  ) {
    return this.adminService.rejectCompany(
      companyId,
      rejectCompanyDto.rejectionReason,
    );
  }

  @Patch('companies/:companyId/suspend')
  @ApiOperation({ summary: '업체 정지' })
  @ApiResponse({ status: 200, description: '업체 정지 성공' })
  async suspendCompany(
    @Param('companyId') companyId: string,
    @Body() suspendCompanyDto: SuspendCompanyDto,
  ) {
    return this.adminService.suspendCompany(
      companyId,
      suspendCompanyDto.reason,
    );
  }

  @Patch('companies/:companyId/reactivate')
  @ApiOperation({ summary: '업체 정지 해제' })
  @ApiResponse({ status: 200, description: '업체 정지 해제 성공' })
  async reactivateCompany(@Param('companyId') companyId: string) {
    return this.adminService.reactivateCompany(companyId);
  }

  // ─── 채팅 모니터링 ─────────────────────────────────────

  @Get('chat-rooms')
  @ApiOperation({ summary: '채팅방 목록 조회' })
  @ApiResponse({ status: 200, description: '채팅방 목록 조회 성공' })
  async getChatRooms(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query() filters: ChatRoomFilters,
  ) {
    return this.adminService.getChatRooms(page, limit, filters);
  }

  @Get('chat-rooms/:roomId')
  @ApiOperation({ summary: '채팅방 상세 조회' })
  @ApiResponse({ status: 200, description: '채팅방 상세 조회 성공' })
  async getChatRoomDetail(@Param('roomId') roomId: string) {
    return this.adminService.getChatRoomDetail(roomId);
  }

  @Get('chat-rooms/:roomId/messages')
  @ApiOperation({ summary: '채팅방 메시지 목록 조회' })
  @ApiResponse({ status: 200, description: '채팅방 메시지 목록 조회 성공' })
  async getChatRoomMessages(
    @Param('roomId') roomId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
  ) {
    return this.adminService.getChatRoomMessages(roomId, page, limit);
  }

  // ─── 신고 관리 ──────────────────────────────────────────

  @Get('reports')
  @ApiOperation({ summary: '신고 목록 조회' })
  @ApiResponse({ status: 200, description: '신고 목록 조회 성공' })
  async getReports(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query() filters: ReportFilters,
  ) {
    return this.adminService.getReports(page, limit, filters);
  }

  @Get('reports/:reportId')
  @ApiOperation({ summary: '신고 상세 조회' })
  @ApiResponse({ status: 200, description: '신고 상세 조회 성공' })
  async getReportDetail(@Param('reportId') reportId: string) {
    return this.adminService.getReportDetail(reportId);
  }

  @Patch('reports/:reportId/resolve')
  @ApiOperation({ summary: '신고 처리' })
  @ApiResponse({ status: 200, description: '신고 처리 성공' })
  async resolveReport(
    @Param('reportId') reportId: string,
    @Body() resolveReportDto: ResolveReportDto,
  ) {
    return this.adminService.resolveReport(reportId, resolveReportDto);
  }

  // ─── 리뷰 관리 ──────────────────────────────────────────

  @Get('reviews')
  @ApiOperation({ summary: '리뷰 목록 조회' })
  @ApiResponse({ status: 200, description: '리뷰 목록 조회 성공' })
  async getReviews(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query() filters: ReviewFilters,
  ) {
    return this.adminService.getReviews(page, limit, filters);
  }

  @Patch('reviews/:reviewId/toggle-visibility')
  @ApiOperation({ summary: '리뷰 표시/숨김 토글' })
  @ApiResponse({ status: 200, description: '리뷰 상태 변경 성공' })
  async toggleReviewVisibility(@Param('reviewId') reviewId: string) {
    return this.adminService.toggleReviewVisibility(reviewId);
  }

  // ─── 견적요청 모니터링 ──────────────────────────────────

  @Get('estimate-requests')
  @ApiOperation({ summary: '견적요청 목록 조회' })
  @ApiResponse({ status: 200, description: '견적요청 목록 조회 성공' })
  async getEstimateRequests(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query() filters: EstimateRequestFilters,
  ) {
    return this.adminService.getEstimateRequests(page, limit, filters);
  }

  // ─── 매칭 모니터링 ─────────────────────────────────────

  @Get('matchings')
  @ApiOperation({ summary: '매칭 목록 조회' })
  @ApiResponse({ status: 200, description: '매칭 목록 조회 성공' })
  async getMatchings(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query() filters: MatchingFilters,
  ) {
    return this.adminService.getMatchings(page, limit, filters);
  }

  // ─── 구독 관리 ───────────────────────────────────────────

  @Get('subscriptions')
  @ApiOperation({ summary: '전체 구독 목록 조회' })
  @ApiResponse({ status: 200, description: '구독 목록 조회 성공' })
  async getSubscriptions(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query() filters: SubscriptionFilters,
  ) {
    return this.adminService.getSubscriptions(page, limit, filters);
  }

  @Get('subscriptions/stats')
  @ApiOperation({ summary: '구독 통계 조회' })
  @ApiResponse({ status: 200, description: '구독 통계 조회 성공' })
  async getSubscriptionStats() {
    return this.adminService.getSubscriptionStats();
  }

  @Patch('companies/:companyId/subscription')
  @ApiOperation({ summary: '업체 구독 변경' })
  @ApiResponse({ status: 200, description: '구독 변경 성공' })
  async changeCompanySubscription(
    @Param('companyId') companyId: string,
    @Body() body: { planId: string; isTrial?: boolean },
  ) {
    return this.adminService.changeCompanySubscription(
      companyId,
      body.planId,
      body.isTrial,
    );
  }

  @Post('companies/:companyId/subscription/extend')
  @ApiOperation({ summary: '구독 연장' })
  @ApiResponse({ status: 200, description: '구독 연장 성공' })
  async extendCompanySubscription(
    @Param('companyId') companyId: string,
    @Body() body: { months: number },
  ) {
    return this.adminService.extendCompanySubscription(companyId, body.months);
  }

  @Post('companies/:companyId/subscription/trial')
  @ApiOperation({ summary: '무료 체험 수동 부여' })
  @ApiResponse({ status: 200, description: '무료 체험 부여 성공' })
  async grantFreeTrial(@Param('companyId') companyId: string) {
    return this.adminService.grantFreeTrial(companyId);
  }

  @Delete('subscriptions/:subscriptionId')
  @ApiOperation({ summary: '구독 개별 취소 (관리자)' })
  @ApiResponse({ status: 200, description: '구독 취소 성공' })
  async cancelSubscription(
    @Param('subscriptionId') subscriptionId: string,
  ) {
    return this.adminService.cancelCompanySubscription(subscriptionId);
  }

  @Get('subscription-plans')
  @ApiOperation({ summary: '구독 플랜 목록 (관리자)' })
  @ApiResponse({ status: 200, description: '플랜 목록 조회 성공' })
  async getSubscriptionPlans() {
    return this.adminService.getSubscriptionPlans();
  }

  @Patch('subscription-plans/:planId')
  @ApiOperation({ summary: '구독 플랜 수정' })
  @ApiResponse({ status: 200, description: '플랜 수정 성공' })
  async updateSubscriptionPlan(
    @Param('planId') planId: string,
    @Body() body: { price?: number; dailyEstimateLimit?: number; isActive?: boolean },
  ) {
    return this.adminService.updateSubscriptionPlan(planId, body);
  }

  // ─── 설정 ──────────────────────────────────────────────

  @Get('settings')
  @ApiOperation({ summary: '시스템 설정 조회' })
  @ApiResponse({ status: 200, description: '시스템 설정 조회 성공' })
  async getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings')
  @ApiOperation({ summary: '시스템 설정 수정' })
  @ApiResponse({ status: 200, description: '시스템 설정 수정 성공' })
  async updateSettings(@Body() settingsDto: Record<string, unknown>) {
    return this.adminService.updateSettings(settingsDto);
  }
}
