import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  COMPANY = 'COMPANY',
  ADMIN = 'ADMIN',
}

export class RegisterDto {
  @ApiProperty({ description: '이메일 주소', example: 'user@example.com' })
  @IsEmail({}, { message: '올바른 이메일 형식을 입력해주세요.' })
  @IsNotEmpty({ message: '이메일은 필수 입력 항목입니다.' })
  email: string;

  @ApiProperty({ description: '비밀번호 (최소 8자)', example: 'password123!' })
  @IsString({ message: '비밀번호는 문자열이어야 합니다.' })
  @MinLength(8, { message: '비밀번호는 최소 8자 이상이어야 합니다.' })
  @MaxLength(50, { message: '비밀번호는 최대 50자까지 가능합니다.' })
  @IsNotEmpty({ message: '비밀번호는 필수 입력 항목입니다.' })
  password: string;

  @ApiProperty({ description: '이름', example: '홍길동' })
  @IsString({ message: '이름은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '이름은 필수 입력 항목입니다.' })
  @MaxLength(30, { message: '이름은 최대 30자까지 가능합니다.' })
  name: string;

  @ApiProperty({ description: '전화번호', example: '010-1234-5678' })
  @IsString({ message: '전화번호는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '전화번호는 필수 입력 항목입니다.' })
  phone: string;

  @ApiPropertyOptional({
    description: '사용자 역할',
    enum: UserRole,
    default: UserRole.CUSTOMER,
  })
  @IsEnum(UserRole, { message: '올바른 사용자 역할을 선택해주세요.' })
  @IsOptional()
  role?: UserRole;
}
