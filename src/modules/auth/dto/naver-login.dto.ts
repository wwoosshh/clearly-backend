import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class NaverLoginDto {
  @ApiProperty({ description: '네이버 인가 코드' })
  @IsString()
  @IsNotEmpty({ message: '인가 코드는 필수입니다.' })
  code: string;

  @ApiProperty({ description: '네이버 state 값 (CSRF 방지)' })
  @IsString()
  @IsNotEmpty({ message: 'state 값은 필수입니다.' })
  state: string;
}
