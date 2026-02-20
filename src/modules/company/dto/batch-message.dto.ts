import { IsArray, IsString, IsNotEmpty, ArrayMinSize } from 'class-validator';

export class BatchMessageDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  userIds: string[];

  @IsString()
  @IsNotEmpty()
  content: string;
}
