import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GeocodingService, AddressSuggestion } from './geocoding.service';
import { AddressSuggestionQueryDto } from './dto/address-suggestion.dto';

@ApiTags('주소')
@Controller('address')
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Get('suggestions')
  @ApiOperation({ summary: '주소 자동완성 추천' })
  @ApiResponse({ status: 200, description: '추천 주소 목록 반환' })
  async getSuggestions(
    @Query() dto: AddressSuggestionQueryDto,
  ): Promise<AddressSuggestion[]> {
    return this.geocodingService.searchAddressSuggestions(dto.query);
  }
}
