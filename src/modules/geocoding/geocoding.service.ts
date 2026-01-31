import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface GeocodingResult {
  latitude: number;
  longitude: number;
}

export interface AddressSuggestion {
  address: string;
  roadAddress: string;
  jibunAddress: string;
  placeName?: string;
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

  async searchAddressSuggestions(
    query: string,
  ): Promise<AddressSuggestion[]> {
    const apiKey = this.configService.get<string>('KAKAO_REST_API_KEY');

    if (!apiKey) {
      this.logger.warn('KAKAO_REST_API_KEY가 설정되지 않았습니다.');
      return [];
    }

    const headers = { Authorization: `KakaoAK ${apiKey}` };
    const suggestions: AddressSuggestion[] = [];
    const seenKeys = new Set<string>();

    try {
      // 1) 카카오 주소검색 API
      const addressResponse = await firstValueFrom(
        this.httpService.get(
          'https://dapi.kakao.com/v2/local/search/address.json',
          {
            params: { query, size: 5 },
            headers,
          },
        ),
      );

      const addressDocs = addressResponse.data?.documents ?? [];
      for (const doc of addressDocs) {
        const key = `${doc.y},${doc.x}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        suggestions.push({
          address: doc.address_name || '',
          roadAddress: doc.road_address?.address_name || '',
          jibunAddress: doc.address?.address_name || doc.address_name || '',
          latitude: parseFloat(doc.y),
          longitude: parseFloat(doc.x),
        });
      }

      // 2) 결과 3개 미만 시 카카오 키워드검색 API 보조 호출
      if (suggestions.length < 3) {
        const keywordResponse = await firstValueFrom(
          this.httpService.get(
            'https://dapi.kakao.com/v2/local/search/keyword.json',
            {
              params: { query, size: 5 },
              headers,
            },
          ),
        );

        const keywordDocs = keywordResponse.data?.documents ?? [];
        for (const doc of keywordDocs) {
          const key = `${doc.y},${doc.x}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          suggestions.push({
            address: doc.address_name || '',
            roadAddress: doc.road_address_name || '',
            jibunAddress: doc.address_name || '',
            placeName: doc.place_name || undefined,
            latitude: parseFloat(doc.y),
            longitude: parseFloat(doc.x),
          });
        }
      }
    } catch (error) {
      const status = error.response?.status;
      this.logger.error(
        `주소 추천 API 호출 실패: status=${status}, message=${error.message}`,
      );
    }

    return suggestions.slice(0, 7);
  }
}
