import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddressSuggestionQueryDto {
  @ApiProperty({ description: '검색할 주소 키워드', example: '부천시' })
  @IsString()
  @MinLength(2, { message: '검색어는 최소 2글자 이상이어야 합니다.' })
  query: string;
}
