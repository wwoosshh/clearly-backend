import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface GeocodingResult {
  latitude: number;
  longitude: number;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async geocodeAddress(address: string): Promise<GeocodingResult | null> {
    const apiKey = this.configService.get<string>('KAKAO_REST_API_KEY');

    if (!apiKey) {
      this.logger.warn('KAKAO_REST_API_KEY가 설정되지 않았습니다.');
      return null;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          'https://dapi.kakao.com/v2/local/search/address.json',
          {
            params: { query: address },
            headers: { Authorization: `KakaoAK ${apiKey}` },
          },
        ),
      );

      const documents = response.data?.documents;

      if (!documents || documents.length === 0) {
        this.logger.warn(`주소 변환 실패: "${address}" - 결과 없음`);
        return null;
      }

      const { y, x } = documents[0];

      return {
        latitude: parseFloat(y),
        longitude: parseFloat(x),
      };
    } catch (error) {
      const status = error.response?.status;
      const data = error.response?.data;
      this.logger.error(
        `주소 변환 API 호출 실패: status=${status}, message=${error.message}, response=${JSON.stringify(data)}`,
      );
      return null;
    }
  }
}
