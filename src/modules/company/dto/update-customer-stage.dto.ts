import { IsEnum } from 'class-validator';
import { PipelineStage } from '@prisma/client';

export class UpdateCustomerStageDto {
  @IsEnum(PipelineStage)
  stage: PipelineStage;
}
