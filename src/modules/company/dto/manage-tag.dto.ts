import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class ManageTagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;
}
