import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PointService } from './point.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('포인트')
@Controller('points')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PointController {
  constructor(
    private readonly pointService: PointService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('balance')
  @UseGuards(RolesGuard)
  @Roles('COMPANY')
  @ApiOperation({ summary: '포인트 잔액 조회' })
  @ApiResponse({ status: 200, description: '잔액 조회 성공' })
  async getBalance(@CurrentUser() user: any) {
    const company = await this.prisma.company.findUnique({
      where: { userId: user.id },
    });
    if (!company) throw new NotFoundException('업체 정보를 찾을 수 없습니다.');
    return this.pointService.getBalance(company.id);
  }

  @Get('transactions')
  @UseGuards(RolesGuard)
  @Roles('COMPANY')
  @ApiOperation({ summary: '포인트 거래내역 조회' })
  @ApiResponse({ status: 200, description: '거래내역 조회 성공' })
  async getTransactions(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const company = await this.prisma.company.findUnique({
      where: { userId: user.id },
    });
    if (!company) throw new NotFoundException('업체 정보를 찾을 수 없습니다.');
    return this.pointService.getTransactions(
      company.id,
      page || 1,
      limit || 20,
    );
  }
}

@ApiTags('관리자 - 포인트')
@Controller('admin/points')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminPointController {
  constructor(private readonly pointService: PointService) {}

  @Post('charge')
  @ApiOperation({ summary: '관리자 포인트 충전' })
  @ApiResponse({ status: 201, description: '포인트 충전 성공' })
  async chargePoints(
    @Body() body: { companyId: string; amount: number; description?: string },
  ) {
    return this.pointService.chargePoints(
      body.companyId,
      body.amount,
      body.description,
    );
  }
}
