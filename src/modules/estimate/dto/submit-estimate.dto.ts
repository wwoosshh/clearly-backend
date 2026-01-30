import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';

export class SubmitEstimateDto {
  @ApiProperty({ description: '견적 가격' })
  @IsInt({ message: '가격은 정수여야 합니다.' })
  @Min(1, { message: '가격은 1원 이상이어야 합니다.' })
  price: number;

  @ApiPropertyOptional({ description: '메시지' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ description: '예상 소요시간' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  estimatedDuration?: string;

  @ApiPropertyOptional({ description: '가능 날짜 (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  availableDate?: string;
}
