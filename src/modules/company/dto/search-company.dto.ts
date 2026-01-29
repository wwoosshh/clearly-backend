import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SearchCompanyDto {
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
