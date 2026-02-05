import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsEnum,
  IsArray,
  ArrayMaxSize,
  Min,
  MaxLength,
} from 'class-validator';
import { CleaningType } from '@prisma/client';

export class CreateEstimateRequestDto {
  @ApiProperty({ description: '청소 유형', enum: CleaningType })
  @IsEnum(CleaningType, { message: '유효한 청소 유형을 선택해주세요.' })
  cleaningType: CleaningType;

  @ApiProperty({ description: '주소' })
  @IsString()
  @IsNotEmpty({ message: '주소를 입력해주세요.' })
  @MaxLength(300)
  address: string;

  @ApiPropertyOptional({ description: '상세 주소' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  detailAddress?: string;

  @ApiPropertyOptional({ description: '위도 (주소 자동완성에서 제공)' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: '경도 (주소 자동완성에서 제공)' })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: '면적 (평수)' })
  @IsOptional()
  @IsInt({ message: '면적은 정수여야 합니다.' })
  @Min(1, { message: '면적은 1 이상이어야 합니다.' })
  areaSize?: number;

  @ApiPropertyOptional({ description: '희망 날짜 (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  desiredDate?: string;

  @ApiPropertyOptional({ description: '희망 시간대' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  desiredTime?: string;

  @ApiProperty({ description: '상세 설명' })
  @IsString()
  @IsNotEmpty({ message: '상세 설명을 입력해주세요.' })
  message: string;

  @ApiPropertyOptional({ description: '희망 예산' })
  @IsOptional()
  @IsInt({ message: '예산은 정수여야 합니다.' })
  @Min(0)
  budget?: number;

  @ApiPropertyOptional({ description: '참고 이미지 URL 배열', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10, { message: '이미지는 최대 10개까지 첨부할 수 있습니다.' })
  images?: string[];

  @ApiPropertyOptional({
    description: '체크리스트 선택 항목 (key: boolean 형태)',
    example: { floor: true, window: true, bathroom: true, aircon: false },
  })
  @IsOptional()
  checklist?: Record<string, boolean>;
}
