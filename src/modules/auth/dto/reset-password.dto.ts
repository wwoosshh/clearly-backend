import {
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: '비밀번호 재설정 토큰' })
  @IsString({ message: '토큰은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '토큰은 필수 입력 항목입니다.' })
  token: string;

  @ApiProperty({
    description: '새 비밀번호 (대소문자+숫자+특수문자 조합, 최소 8자)',
    example: 'NewPassword123!',
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
}
