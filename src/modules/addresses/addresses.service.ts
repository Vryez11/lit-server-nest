import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AddressGeocodeQueryDto,
  AddressGeocodeResponseDto,
  AddressSearchItemDto,
  AddressSearchQueryDto,
  AddressSearchResponseDto,
} from './dto/address-search.dto';

const KAKAO_ADDRESS_SEARCH_URL =
  'https://dapi.kakao.com/v2/local/search/address.json';

@Injectable()
export class AddressesService {
  private readonly logger = new Logger(AddressesService.name);

  constructor(private readonly configService: ConfigService) {}

  private get restApiKey(): string {
    return this.configService.getOrThrow<string>('KAKAO_REST_API_KEY');
  }

  private get authHeader(): Record<string, string> {
    return { Authorization: `KakaoAK ${this.restApiKey}` };
  }

  async search(dto: AddressSearchQueryDto): Promise<AddressSearchResponseDto> {
    const size = dto.size ?? 10;
    const page = dto.page ?? 1;

    const params = new URLSearchParams({
      query: dto.query,
      page: String(page),
      size: String(size),
      analyze_type: 'similar',
    });

    const url = `${KAKAO_ADDRESS_SEARCH_URL}?${params.toString()}`;
    let json: KakaoAddressSearchResponse;

    try {
      const res = await fetch(url, { headers: this.authHeader });
      if (!res.ok) {
        this.logger.error(
          `Kakao address search HTTP ${res.status}: ${await res.text()}`,
        );
        throw new InternalServerErrorException(
          '주소 검색 API 호출에 실패했습니다.',
        );
      }
      json = (await res.json()) as KakaoAddressSearchResponse;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error(`Kakao address search network error: ${String(error)}`);
      throw new InternalServerErrorException(
        '주소 검색 서버와 통신할 수 없습니다.',
      );
    }

    const items: AddressSearchItemDto[] = json.documents.map((doc, idx) => ({
      id: `${page}_${idx}`,
      roadAddress: doc.road_address?.address_name ?? doc.address_name,
      jibunAddress: doc.address?.address_name ?? doc.address_name,
      zipcode: doc.road_address?.zone_no ?? null,
      buildingName: doc.road_address?.building_name?.trim() || null,
      longitude: parseFloat(doc.x),
      latitude: parseFloat(doc.y),
    }));

    return {
      items,
      total: json.meta.total_count,
      page,
      size,
    };
  }

  async geocode(
    dto: AddressGeocodeQueryDto,
  ): Promise<AddressGeocodeResponseDto> {
    const params = new URLSearchParams({
      query: dto.address,
      size: '1',
      analyze_type: 'exact',
    });

    const url = `${KAKAO_ADDRESS_SEARCH_URL}?${params.toString()}`;
    let json: KakaoAddressSearchResponse;

    try {
      const res = await fetch(url, { headers: this.authHeader });
      if (!res.ok) {
        this.logger.error(
          `Kakao geocode HTTP ${res.status}: ${await res.text()}`,
        );
        throw new InternalServerErrorException(
          '지오코더 API 호출에 실패했습니다.',
        );
      }
      json = (await res.json()) as KakaoAddressSearchResponse;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error(`Kakao geocode network error: ${String(error)}`);
      throw new InternalServerErrorException(
        '지오코더 서버와 통신할 수 없습니다.',
      );
    }

    const first = json.documents[0];
    if (!first) {
      throw new InternalServerErrorException(
        '입력한 주소의 좌표를 찾을 수 없습니다.',
      );
    }

    return {
      address: dto.address,
      longitude: parseFloat(first.x),
      latitude: parseFloat(first.y),
    };
  }
}

// Kakao Local API 응답 타입 (모듈 내부 전용)
type KakaoAddressSearchResponse = {
  meta: {
    total_count: number;
    pageable_count: number;
    is_end: boolean;
  };
  documents: Array<{
    address_name: string;
    address_type: 'REGION' | 'ROAD' | 'REGION_ADDR' | 'ROAD_ADDR';
    x: string;
    y: string;
    address: {
      address_name: string;
      region_1depth_name: string;
      region_2depth_name: string;
      region_3depth_name: string;
      mountain_yn: string;
      main_address_no: string;
      sub_address_no: string;
    } | null;
    road_address: {
      address_name: string;
      region_1depth_name: string;
      region_2depth_name: string;
      region_3depth_name: string;
      road_name: string;
      underground_yn: string;
      main_building_no: string;
      sub_building_no: string;
      building_name: string;
      zone_no: string;
    } | null;
  }>;
};
