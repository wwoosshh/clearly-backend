import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SuspendCompanyDto {
  @ApiProperty({
    description: '정지 사유',
    example: '서비스 이용 약관을 위반하였습니다.',
  })
  @IsString({ message: '정지 사유는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '정지 사유는 필수 입력 항목입니다.' })
  reason: string;
}
