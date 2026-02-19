import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSubscriptionDto {
  @ApiProperty({ description: '구독할 플랜 ID' })
  @IsString()
  @IsNotEmpty()
  planId: string;
}
