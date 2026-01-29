import { IsOptional, IsString, IsNumber, IsEnum, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum SortBy {
  SCORE = 'score',
  RATING = 'rating',
  REVIEWS = 'reviews',
  MATCHINGS = 'matchings',
  PRICE_LOW = 'price_low',
  PRICE_HIGH = 'price_high',
}

export class SearchCompanyDto {
  @ApiPropertyOptional({ description: '검색 키워드 (업체명, 소개 검색)' })
  @IsString()
  @IsOptional()
  keyword?: string;

  @ApiPropertyOptional({ description: '전문분야 필터 (예: 이사청소)' })
  @IsString()
  @IsOptional()
  specialty?: string;

  @ApiPropertyOptional({ description: '지역 필터 (예: 서울 강남구)' })
  @IsString()
  @IsOptional()
  region?: string;

  @ApiPropertyOptional({ description: '주소 텍스트 (서버에서 좌표 변환)' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ description: '위도 (직접 좌표 전달 시)' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({ description: '경도 (직접 좌표 전달 시)' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({
    description: '정렬 기준',
    enum: SortBy,
    default: SortBy.SCORE,
  })
  @IsEnum(SortBy)
  @IsOptional()
  sortBy?: SortBy = SortBy.SCORE;

  @ApiPropertyOptional({ description: '페이지 번호', default: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: '페이지당 항목 수', default: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number = 10;

  @ApiPropertyOptional({
    description: '최대 검색 거리 (km)',
    default: 50,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  @IsOptional()
  maxDistance?: number = 50;
}
