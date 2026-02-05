import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompanyDto {
  @ApiProperty({ description: '상호명', example: '클리어리 청소' })
  @IsString({ message: '상호명은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '상호명은 필수 입력 항목입니다.' })
  @MaxLength(100, { message: '상호명은 최대 100자까지 가능합니다.' })
  businessName: string;

  @ApiProperty({ description: '사업자등록번호', example: '123-45-67890' })
  @IsString({ message: '사업자등록번호는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '사업자등록번호는 필수 입력 항목입니다.' })
  @MaxLength(20, { message: '사업자등록번호는 최대 20자까지 가능합니다.' })
  businessNumber: string;

  @ApiProperty({ description: '대표자명', example: '김대표' })
  @IsString({ message: '대표자명은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '대표자명은 필수 입력 항목입니다.' })
  @MaxLength(50, { message: '대표자명은 최대 50자까지 가능합니다.' })
  representative: string;

  @ApiPropertyOptional({
    description: '주소',
    example: '서울특별시 강남구 역삼동',
  })
  @IsString({ message: '주소는 문자열이어야 합니다.' })
  @IsOptional()
  @MaxLength(300, { message: '주소는 최대 300자까지 가능합니다.' })
  address?: string;

  @ApiPropertyOptional({ description: '상세주소', example: '101호' })
  @IsString({ message: '상세주소는 문자열이어야 합니다.' })
  @IsOptional()
  @MaxLength(200, { message: '상세주소는 최대 200자까지 가능합니다.' })
  detailAddress?: string;

  @ApiPropertyOptional({ description: '업체 설명' })
  @IsString({ message: '설명은 문자열이어야 합니다.' })
  @IsOptional()
  description?: string;
}
