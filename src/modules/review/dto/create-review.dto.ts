import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ description: '매칭 ID' })
  @IsString()
  @IsNotEmpty()
  matchingId: string;

  @ApiProperty({ description: '별점 (1~5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ description: '리뷰 내용' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;
}
