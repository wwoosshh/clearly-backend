import { IsArray, IsString, ArrayMaxSize } from 'class-validator';

export class UpdateCustomerTagsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags: string[];
}
