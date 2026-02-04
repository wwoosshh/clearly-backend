import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ description: '매칭 ID' })
  @IsString()
  @IsNotEmpty()
  matchingId: string;

  @ApiProperty({ description: '종합 별점 (1~5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ description: '청소 품질 (1~5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  qualityRating?: number;

  @ApiPropertyOptional({ description: '가격 만족도 (1~5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priceRating?: number;

  @ApiPropertyOptional({ description: '시간 준수 (1~5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  punctualityRating?: number;

  @ApiPropertyOptional({ description: '친절도 (1~5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  kindnessRating?: number;

  @ApiPropertyOptional({ description: '리뷰 내용' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional({ description: '리뷰 이미지 URL 배열', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5, { message: '이미지는 최대 5개까지 첨부할 수 있습니다.' })
  images?: string[];
}
