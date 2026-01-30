import { IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ResolveReportStatus {
  REVIEWED = 'REVIEWED',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

export enum ReportActionType {
  SUSPEND_USER = 'SUSPEND_USER',
  SUSPEND_COMPANY = 'SUSPEND_COMPANY',
  HIDE_REVIEW = 'HIDE_REVIEW',
}

export class ResolveReportDto {
  @ApiProperty({
    description: '처리 상태',
    enum: ResolveReportStatus,
    example: 'RESOLVED',
  })
  @IsEnum(ResolveReportStatus, {
    message: '상태는 REVIEWED, RESOLVED, DISMISSED 중 하나여야 합니다.',
  })
  @IsNotEmpty({ message: '처리 상태는 필수 입력 항목입니다.' })
  status: ResolveReportStatus;

  @ApiProperty({
    description: '관리자 메모',
    example: '확인 결과 약관 위반으로 판단하여 조치하였습니다.',
  })
  @IsString({ message: '관리자 메모는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '관리자 메모는 필수 입력 항목입니다.' })
  adminNote: string;

  @ApiPropertyOptional({
    description: '조치 유형',
    enum: ReportActionType,
    example: 'SUSPEND_USER',
  })
  @IsOptional()
  @IsEnum(ReportActionType, {
    message:
      '조치 유형은 SUSPEND_USER, SUSPEND_COMPANY, HIDE_REVIEW 중 하나여야 합니다.',
  })
  actionType?: ReportActionType;
}
