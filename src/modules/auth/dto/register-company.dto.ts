import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RegisterCompanyDto {
  // 유저 정보
  @ApiProperty({ description: '이메일 주소', example: 'company@example.com' })
  @IsEmail({}, { message: '올바른 이메일 형식을 입력해주세요.' })
  @IsNotEmpty({ message: '이메일은 필수 입력 항목입니다.' })
  email: string;

  @ApiProperty({
    description: '비밀번호 (대소문자+숫자+특수문자 조합, 최소 8자)',
    example: 'Password123!',
  })
  @IsString({ message: '비밀번호는 문자열이어야 합니다.' })
  @MinLength(8, { message: '비밀번호는 최소 8자 이상이어야 합니다.' })
  @MaxLength(50, { message: '비밀번호는 최대 50자까지 가능합니다.' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      '비밀번호는 대문자, 소문자, 숫자, 특수문자(@$!%*?&)를 각각 1개 이상 포함해야 합니다.',
  })
  @IsNotEmpty({ message: '비밀번호는 필수 입력 항목입니다.' })
  password: string;

  @ApiProperty({ description: '담당자 이름', example: '김대표' })
  @IsString({ message: '이름은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '이름은 필수 입력 항목입니다.' })
  @MaxLength(30, { message: '이름은 최대 30자까지 가능합니다.' })
  name: string;

  @ApiProperty({ description: '전화번호', example: '010-1234-5678' })
  @IsString({ message: '전화번호는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '전화번호는 필수 입력 항목입니다.' })
  phone: string;

  // 업체 정보
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

  @ApiProperty({ description: '주소', example: '서울특별시 강남구 역삼동' })
  @IsString({ message: '주소는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '주소는 필수 입력 항목입니다.' })
  @MaxLength(300, { message: '주소는 최대 300자까지 가능합니다.' })
  address: string;

  @ApiPropertyOptional({ description: '상세주소', example: '101호' })
  @IsString({ message: '상세주소는 문자열이어야 합니다.' })
  @IsOptional()
  @MaxLength(200, { message: '상세주소는 최대 200자까지 가능합니다.' })
  detailAddress?: string;

  // 서비스 정보
  @ApiPropertyOptional({
    description: '전문분야',
    example: ['이사청소', '입주청소'],
  })
  @IsArray({ message: '전문분야는 배열이어야 합니다.' })
  @IsString({ each: true, message: '전문분야 항목은 문자열이어야 합니다.' })
  @IsOptional()
  specialties?: string[];

  @ApiPropertyOptional({
    description: '서비스 가능 지역',
    example: ['서울 강남구', '서울 서초구'],
  })
  @IsArray({ message: '서비스 지역은 배열이어야 합니다.' })
  @IsString({ each: true, message: '서비스 지역 항목은 문자열이어야 합니다.' })
  @IsOptional()
  serviceAreas?: string[];

  @ApiPropertyOptional({
    description: '업체 소개',
    example: '10년 경력의 전문 청소 업체입니다.',
  })
  @IsString({ message: '업체 소개는 문자열이어야 합니다.' })
  @IsOptional()
  @MaxLength(2000, { message: '업체 소개는 최대 2000자까지 가능합니다.' })
  description?: string;

  @ApiPropertyOptional({ description: '최소 가격 (원)', example: 100000 })
  @Type(() => Number)
  @IsNumber({}, { message: '최소 가격은 숫자여야 합니다.' })
  @Min(0, { message: '최소 가격은 0 이상이어야 합니다.' })
  @IsOptional()
  minPrice?: number;

  @ApiPropertyOptional({ description: '최대 가격 (원)', example: 500000 })
  @Type(() => Number)
  @IsNumber({}, { message: '최대 가격은 숫자여야 합니다.' })
  @Min(0, { message: '최대 가격은 0 이상이어야 합니다.' })
  @IsOptional()
  maxPrice?: number;
}
