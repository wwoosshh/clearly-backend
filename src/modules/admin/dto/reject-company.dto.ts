import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectCompanyDto {
  @ApiProperty({ description: '반려 사유', example: '사업자등록증 확인이 불가합니다.' })
  @IsString({ message: '반려 사유는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '반려 사유는 필수 입력 항목입니다.' })
  rejectionReason: string;
}
