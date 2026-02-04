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
import { ReviewService } from './review.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateReviewDto } from './dto/create-review.dto';

@ApiTags('리뷰')
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '리뷰 작성' })
  @ApiResponse({ status: 201, description: '리뷰 작성 성공' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewService.create(userId, dto);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 리뷰 목록 조회 (유저: 작성한 리뷰, 업체: 받은 리뷰)' })
  @ApiResponse({ status: 200, description: '내 리뷰 목록 조회 성공' })
  async findMyReviews(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reviewService.findMyReviews(userId, page || 1, limit || 10);
  }

  @Get('company/:companyId')
  @ApiOperation({ summary: '업체 리뷰 목록 조회' })
  @ApiResponse({ status: 200, description: '리뷰 목록 조회 성공' })
  async findByCompany(
    @Param('companyId') companyId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reviewService.findByCompany(companyId, page || 1, limit || 10);
  }

  @Get(':id')
  @ApiOperation({ summary: '리뷰 상세 조회' })
  @ApiResponse({ status: 200, description: '리뷰 상세 조회 성공' })
  async findById(@Param('id') id: string) {
    return this.reviewService.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '리뷰 수정' })
  @ApiResponse({ status: 200, description: '리뷰 수정 성공' })
  async update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { rating?: number; content?: string },
  ) {
    return this.reviewService.update(id, userId, body);
  }

  @Post(':id/reply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '업체 리뷰 답글 작성' })
  @ApiResponse({ status: 200, description: '답글 작성 성공' })
  async addCompanyReply(
    @Param('id') reviewId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { reply: string },
  ) {
    return this.reviewService.addCompanyReply(reviewId, userId, body.reply);
  }

  @Post(':id/helpful')
  @ApiOperation({ summary: '도움이 됐어요 투표' })
  @ApiResponse({ status: 200, description: '투표 성공' })
  async markHelpful(@Param('id') reviewId: string) {
    return this.reviewService.markHelpful(reviewId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '리뷰 삭제' })
  @ApiResponse({ status: 200, description: '리뷰 삭제 성공' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reviewService.remove(id, userId);
  }
}
