import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ description: '구글 인가 코드' })
  @IsString()
  @IsNotEmpty({ message: '인가 코드는 필수입니다.' })
  code: string;

  @ApiProperty({ description: '리다이렉트 URI (구글 콘솔에 등록된 URI와 동일해야 함)' })
  @IsString()
  @IsNotEmpty({ message: '리다이렉트 URI는 필수입니다.' })
  redirectUri: string;
}
