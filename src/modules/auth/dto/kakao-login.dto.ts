import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class KakaoLoginDto {
  @ApiProperty({ description: '카카오 인가 코드' })
  @IsString()
  @IsNotEmpty({ message: '인가 코드는 필수입니다.' })
  code: string;

  @ApiProperty({ description: '리다이렉트 URI (카카오 앱에 등록된 URI와 동일해야 함)' })
  @IsString()
  @IsNotEmpty({ message: '리다이렉트 URI는 필수입니다.' })
  redirectUri: string;
}
