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
import { MatchingService } from './matching.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

interface CreateMatchingRequestDto {
  companyId?: string;
  cleaningType: string;
  address: string;
  detailAddress?: string;
  areaSize?: number;
  desiredDate?: string;
  desiredTime?: string;
  message?: string;
  estimatedPrice?: number;
}

interface MatchingQueryFilters {
  userId?: string;
  companyId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

@ApiTags('매칭')
@Controller('matchings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MatchingController {
  constructor(
    private readonly matchingService: MatchingService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('requests')
  @ApiOperation({ summary: '매칭 요청 생성' })
  @ApiResponse({ status: 201, description: '매칭 요청 생성 성공' })
  async createRequest(
    @CurrentUser('id') userId: string,
    @Body() createRequestDto: CreateMatchingRequestDto,
  ) {
    return this.matchingService.createRequest(userId, createRequestDto);
  }

  @Get('requests')
  @ApiOperation({ summary: '매칭 요청 목록 조회' })
  @ApiResponse({ status: 200, description: '매칭 요청 목록 조회 성공' })
  async findRequests(
    @CurrentUser('id') userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: MatchingQueryFilters,
  ) {
    if (user.role === 'USER') {
      filters.userId = userId;
    } else if (user.role === 'COMPANY') {
      const company = await this.prisma.company.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (company) {
        filters.companyId = company.id;
      }
    }
    return this.matchingService.findRequests(filters);
  }

  @Get('requests/:id')
  @ApiOperation({ summary: '매칭 요청 상세 조회' })
  @ApiResponse({ status: 200, description: '매칭 요청 상세 조회 성공' })
  async findRequestById(@Param('id') id: string) {
    return this.matchingService.findRequestById(id);
  }

  @Patch('requests/:id/status')
  @ApiOperation({ summary: '매칭 상태 변경' })
  @ApiResponse({ status: 200, description: '매칭 상태 변경 성공' })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.matchingService.updateStatus(id, body.status);
  }

  @Post('requests/:id/report-completion')
  @UseGuards(RolesGuard)
  @Roles('COMPANY')
  @ApiOperation({ summary: '서비스 완료 보고 (업체)' })
  @ApiResponse({ status: 200, description: '완료 보고 성공' })
  async reportCompletion(
    @CurrentUser('id') userId: string,
    @Param('id') matchingId: string,
    @Body() body: { images: string[] },
  ) {
    return this.matchingService.reportCompletion(
      userId,
      matchingId,
      body.images,
    );
  }

  @Patch('requests/:id/confirm-completion')
  @UseGuards(RolesGuard)
  @Roles('USER')
  @ApiOperation({ summary: '서비스 완료 확인 (사용자)' })
  @ApiResponse({ status: 200, description: '완료 확인 성공' })
  async confirmCompletion(
    @CurrentUser('id') userId: string,
    @Param('id') matchingId: string,
  ) {
    return this.matchingService.confirmCompletion(userId, matchingId);
  }

  @Patch('requests/:id/cancel')
  @ApiOperation({ summary: '매칭 취소' })
  @ApiResponse({ status: 200, description: '취소 성공' })
  async cancelMatching(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') matchingId: string,
    @Body() body: { reason: string },
  ) {
    return this.matchingService.cancelMatching(
      user.id,
      user.role,
      matchingId,
      body.reason,
    );
  }
}
