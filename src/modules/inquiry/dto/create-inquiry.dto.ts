import {
  IsString,
  IsNotEmpty,
  IsEmail,
  MaxLength,
  IsOptional,
} from 'class-validator';

export class CreateInquiryDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  @IsNotEmpty({ message: '이름은 필수입니다.' })
  @MaxLength(50)
  name: string;

  @IsEmail({}, { message: '올바른 이메일 형식을 입력해주세요.' })
  @IsNotEmpty({ message: '이메일은 필수입니다.' })
  @MaxLength(255)
  email: string;

  @IsString()
  @IsNotEmpty({ message: '문의 유형은 필수입니다.' })
  @MaxLength(50)
  category: string;

  @IsString()
  @IsNotEmpty({ message: '제목은 필수입니다.' })
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty({ message: '내용은 필수입니다.' })
  content: string;
}
