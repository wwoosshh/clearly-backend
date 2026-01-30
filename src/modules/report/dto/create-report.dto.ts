import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional, MaxLength } from 'class-validator';

export enum CreateReportTargetType {
  USER = 'USER',
  COMPANY = 'COMPANY',
  REVIEW = 'REVIEW',
}

export enum CreateReportReason {
  FRAUD = 'FRAUD',
  INAPPROPRIATE = 'INAPPROPRIATE',
  NO_SHOW = 'NO_SHOW',
  POOR_QUALITY = 'POOR_QUALITY',
  OTHER = 'OTHER',
}

export class CreateReportDto {
  @ApiProperty({ enum: CreateReportTargetType, description: '신고 대상 유형' })
  @IsEnum(CreateReportTargetType)
  targetType: CreateReportTargetType;

  @ApiProperty({ description: '신고 대상 ID' })
  @IsString()
  @IsNotEmpty()
  targetId: string;

  @ApiProperty({ enum: CreateReportReason, description: '신고 사유' })
  @IsEnum(CreateReportReason)
  reason: CreateReportReason;

  @ApiPropertyOptional({ description: '상세 설명' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
