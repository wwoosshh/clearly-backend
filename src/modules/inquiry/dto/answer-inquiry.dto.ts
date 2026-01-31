import { IsString, IsNotEmpty } from 'class-validator';

export class AnswerInquiryDto {
  @IsString()
  @IsNotEmpty({ message: '답변 내용은 필수입니다.' })
  adminAnswer: string;
}
