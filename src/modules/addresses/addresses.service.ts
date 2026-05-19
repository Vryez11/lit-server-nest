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

const VWORLD_SEARCH_URL = 'https://api.vworld.kr/req/search';
const VWORLD_GEOCODER_URL = 'https://api.vworld.kr/req/address';

@Injectable()
export class AddressesService {
  private readonly logger = new Logger(AddressesService.name);

  // ─────────────────────────────────────────────────────────────────────────
  // VWorld API 인증키 (env.VWORLD_API_KEY)
  //   - 인증키 하나로 검색·지오코더·역지오코더 등 모든 VWorld API 호출 가능
  //   - 키 발급: https://www.vworld.kr → 오픈API → 인증키 발급
  //   - 일 호출 한도: 40,000건/인증키 (개발용은 더 적음)
  // ─────────────────────────────────────────────────────────────────────────
  constructor(private readonly configService: ConfigService) {}

  private get apiKey(): string {
    return this.configService.getOrThrow<string>('VWORLD_API_KEY');
  }

  async search(dto: AddressSearchQueryDto): Promise<AddressSearchResponseDto> {
    const key = this.apiKey;
    const size = dto.size ?? 10;
    const page = dto.page ?? 1;

    const params = new URLSearchParams({
      service: 'search',
      request: 'search',
      version: '2.0',
      crs: 'EPSG:4326',
      size: String(size),
      page: String(page),
      query: dto.query,
      type: 'address',
      category: dto.category ?? 'road',
      format: 'json',
      errorformat: 'json',
      key,
    });

    const url = `${VWORLD_SEARCH_URL}?${params.toString()}`;
    let json: VWorldSearchResponse;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.error(
          `VWorld search HTTP ${res.status}: ${await res.text()}`,
        );
        throw new InternalServerErrorException(
          '주소 검색 API 호출에 실패했습니다.',
        );
      }
      json = (await res.json()) as VWorldSearchResponse;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error(`VWorld search network error: ${String(error)}`);
      throw new InternalServerErrorException(
        '주소 검색 서버와 통신할 수 없습니다.',
      );
    }

    // NOT_FOUND는 정상 응답으로 처리 (검색 결과 0개)
    if (json.response.status === 'NOT_FOUND') {
      return { items: [], total: 0, page, size };
    }

    if (json.response.status === 'ERROR') {
      this.logger.error(
        `VWorld search returned ERROR: ${JSON.stringify(json.response)}`,
      );
      throw new InternalServerErrorException(
        '주소 검색 API에서 오류를 반환했습니다.',
      );
    }

    const items: AddressSearchItemDto[] = (
      json.response.result?.items ?? []
    ).map((item) => ({
      id: item.id,
      roadAddress: item.address.road ?? '',
      jibunAddress: item.address.parcel ?? '',
      zipcode: item.address.zipcode ?? null,
      buildingName: item.address.bldnm ?? null,
      longitude: parseFloat(item.point.x),
      latitude: parseFloat(item.point.y),
    }));

    const total = json.response.record?.total
      ? Number(json.response.record.total)
      : items.length;

    return { items, total, page, size };
  }

  async geocode(
    dto: AddressGeocodeQueryDto,
  ): Promise<AddressGeocodeResponseDto> {
    const key = this.apiKey;

    const params = new URLSearchParams({
      service: 'address',
      request: 'getCoord',
      version: '2.0',
      crs: 'EPSG:4326',
      address: dto.address,
      type: dto.type ?? 'ROAD',
      format: 'json',
      errorformat: 'json',
      key,
    });

    const url = `${VWORLD_GEOCODER_URL}?${params.toString()}`;
    let json: VWorldGeocodeResponse;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.error(
          `VWorld geocode HTTP ${res.status}: ${await res.text()}`,
        );
        throw new InternalServerErrorException(
          '지오코더 API 호출에 실패했습니다.',
        );
      }
      json = (await res.json()) as VWorldGeocodeResponse;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error(`VWorld geocode network error: ${String(error)}`);
      throw new InternalServerErrorException(
        '지오코더 서버와 통신할 수 없습니다.',
      );
    }

    if (json.response.status !== 'OK' || !json.response.result?.point) {
      this.logger.error(
        `VWorld geocode non-OK: ${JSON.stringify(json.response)}`,
      );
      throw new InternalServerErrorException(
        '입력한 주소의 좌표를 찾을 수 없습니다.',
      );
    }

    const { x, y } = json.response.result.point;
    return {
      address: dto.address,
      longitude: parseFloat(x),
      latitude: parseFloat(y),
    };
  }
}

// VWorld API 응답 타입 (모듈 내부 전용)
type VWorldSearchResponse = {
  response: {
    status: 'OK' | 'NOT_FOUND' | 'ERROR';
    record?: { total: string; current: string };
    page?: { total: string; current: string; size: string };
    result?: {
      crs?: string;
      type?: string;
      items: Array<{
        id: string;
        title?: string;
        category?: string;
        address: {
          zipcode?: string;
          road?: string;
          parcel?: string;
          bldnm?: string;
        };
        point: { x: string; y: string };
      }>;
    };
    error?: unknown;
  };
};

type VWorldGeocodeResponse = {
  response: {
    status: 'OK' | 'NOT_FOUND' | 'ERROR';
    result?: {
      crs?: string;
      point: { x: string; y: string };
    };
  };
};
