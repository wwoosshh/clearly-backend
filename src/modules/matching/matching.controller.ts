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
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('매칭')
@Controller('matchings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Post('requests')
  @ApiOperation({ summary: '매칭 요청 생성' })
  @ApiResponse({ status: 201, description: '매칭 요청 생성 성공' })
  async createRequest(
    @CurrentUser('id') userId: string,
    @Body() createRequestDto: any,
  ) {
    return this.matchingService.createRequest(userId, createRequestDto);
  }

  @Get('requests')
  @ApiOperation({ summary: '매칭 요청 목록 조회' })
  @ApiResponse({ status: 200, description: '매칭 요청 목록 조회 성공' })
  async findRequests(
    @CurrentUser('id') userId: string,
    @CurrentUser() user: any,
    @Query() filters: any,
  ) {
    // 역할에 따라 필터 자동 적용
    if (user.role === 'USER') {
      filters.userId = userId;
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
}
