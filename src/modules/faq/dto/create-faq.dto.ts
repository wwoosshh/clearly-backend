import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsInt,
  IsBoolean,
} from 'class-validator';

export class CreateFaqDto {
  @IsString()
  @IsNotEmpty({ message: '카테고리는 필수입니다.' })
  @MaxLength(50)
  category: string;

  @IsString()
  @IsNotEmpty({ message: '질문은 필수입니다.' })
  @MaxLength(500)
  question: string;

  @IsString()
  @IsNotEmpty({ message: '답변은 필수입니다.' })
  answer: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}
