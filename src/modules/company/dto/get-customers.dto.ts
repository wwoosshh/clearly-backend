import { IsOptional, IsEnum, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { PipelineStage } from '@prisma/client';

export enum CustomerSegment {
  ALL = 'all',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  REPEAT = 'repeat',
  CHAT_ONLY = 'chat_only',
}

export enum CustomerSort {
  RECENT = 'recent',
  FREQUENCY = 'frequency',
  REVENUE = 'revenue',
}

export class GetCustomersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CustomerSegment)
  segment?: CustomerSegment = CustomerSegment.ALL;

  @IsOptional()
  @IsEnum(CustomerSort)
  sort?: CustomerSort = CustomerSort.RECENT;

  @IsOptional()
  @IsEnum(PipelineStage)
  stage?: PipelineStage;

  @IsOptional()
  @IsString()
  tag?: string;
}
