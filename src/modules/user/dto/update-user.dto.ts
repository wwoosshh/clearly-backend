import { IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: '이름', example: '홍길동' })
  @IsString({ message: '이름은 문자열이어야 합니다.' })
  @MaxLength(30, { message: '이름은 최대 30자까지 가능합니다.' })
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: '전화번호', example: '010-1234-5678' })
  @IsString({ message: '전화번호는 문자열이어야 합니다.' })
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: '프로필 이미지 URL' })
  @IsString({ message: '프로필 이미지 URL은 문자열이어야 합니다.' })
  @IsOptional()
  profileImage?: string;

  @ApiPropertyOptional({ description: '마케팅 수신 동의', example: false })
  @IsBoolean({ message: '마케팅 수신 동의는 boolean이어야 합니다.' })
  @IsOptional()
  agreeMarketing?: boolean;
}
