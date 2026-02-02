import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  IsBoolean,
  ArrayMaxSize,
  MaxLength,
  IsEmail,
  IsUrl,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateCompanyDto {
  @ApiPropertyOptional({ description: '상호명', example: '클리어리 청소' })
  @IsString({ message: '상호명은 문자열이어야 합니다.' })
  @IsOptional()
  @MaxLength(100, { message: '상호명은 최대 100자까지 가능합니다.' })
  businessName?: string;

  @ApiPropertyOptional({ description: '대표자명', example: '김대표' })
  @IsString({ message: '대표자명은 문자열이어야 합니다.' })
  @IsOptional()
  @MaxLength(50, { message: '대표자명은 최대 50자까지 가능합니다.' })
  representative?: string;

  @ApiPropertyOptional({ description: '주소', example: '서울특별시 강남구 역삼동' })
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

  @ApiPropertyOptional({ description: '업체 프로필 이미지 URL 배열', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10, { message: '프로필 이미지는 최대 10개까지 등록할 수 있습니다.' })
  profileImages?: string[];

  @ApiPropertyOptional({ description: '서비스 지역', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceAreas?: string[];

  @ApiPropertyOptional({ description: '전문분야', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional({ description: '최소 가격' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: '최대 가격' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: '자격증 목록', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certificates?: string[];

  // ── 신규 필드 ──

  @ApiPropertyOptional({ description: '연락가능시간', example: '09:00 - 18:00' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactHours?: string;

  @ApiPropertyOptional({ description: '직원수' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  employeeCount?: number;

  @ApiPropertyOptional({ description: '업체 웹사이트 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  companyUrl?: string;

  @ApiPropertyOptional({ description: '경력 년수' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  experienceYears?: number;

  @ApiPropertyOptional({ description: '경력 상세' })
  @IsOptional()
  @IsString()
  experienceDescription?: string;

  @ApiPropertyOptional({ description: '학력' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  education?: string;

  @ApiPropertyOptional({ description: '서비스 상세설명' })
  @IsOptional()
  @IsString()
  serviceDetail?: string;

  @ApiPropertyOptional({ description: '포트폴리오 [{title, description, images}]' })
  @IsOptional()
  @IsArray()
  portfolio?: any[];

  @ApiPropertyOptional({ description: '자격증/서류 [{name, imageUrl}]' })
  @IsOptional()
  @IsArray()
  certificationDocs?: any[];

  @ApiPropertyOptional({ description: '사업자등록증 이미지 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  businessRegistration?: string;

  @ApiPropertyOptional({ description: '본인인증 여부' })
  @IsOptional()
  @IsBoolean()
  identityVerified?: boolean;

  @ApiPropertyOptional({ description: '결제수단 목록', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paymentMethods?: string[];

  @ApiPropertyOptional({ description: '이메일' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ description: '활동가능범위 (km)' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  serviceRange?: number;

  @ApiPropertyOptional({ description: '동영상 URL 목록', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  videos?: string[];

  @ApiPropertyOptional({ description: 'Q&A [{question, answer}]' })
  @IsOptional()
  @IsArray()
  faq?: any[];
}
