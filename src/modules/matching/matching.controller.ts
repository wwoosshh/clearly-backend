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
  async findRequests(@Query() filters: any) {
    return this.matchingService.findRequests(filters);
  }

  @Get('requests/:id')
  @ApiOperation({ summary: '매칭 요청 상세 조회' })
  @ApiResponse({ status: 200, description: '매칭 요청 상세 조회 성공' })
  async findRequestById(@Param('id') id: string) {
    return this.matchingService.findRequestById(id);
  }

  @Post('requests/:requestId/quotes')
  @ApiOperation({ summary: '견적 제출' })
  @ApiResponse({ status: 201, description: '견적 제출 성공' })
  async submitQuote(
    @CurrentUser('id') companyId: string,
    @Param('requestId') requestId: string,
    @Body() quoteDto: any,
  ) {
    return this.matchingService.submitQuote(companyId, requestId, quoteDto);
  }

  @Patch('quotes/:quoteId/accept')
  @ApiOperation({ summary: '견적 수락' })
  @ApiResponse({ status: 200, description: '견적 수락 성공' })
  async acceptQuote(
    @CurrentUser('id') userId: string,
    @Param('quoteId') quoteId: string,
  ) {
    return this.matchingService.acceptQuote(userId, quoteId);
  }
}
