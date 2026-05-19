import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AddressesService } from './addresses.service';
import {
  AddressGeocodeQueryDto,
  AddressGeocodeResponseDto,
  AddressSearchQueryDto,
  AddressSearchResponseDto,
} from './dto/address-search.dto';

@ApiTags('External - Addresses')
@Controller('api/external/address')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get('search')
  @ApiOperation({
    summary: '주소/장소를 검색합니다 (자동완성용).',
    description:
      'VWorld Search API를 호출하여 주소 검색 결과 + 좌표를 한 번에 반환합니다. 회원가입 등 인증 전에도 호출 가능합니다.',
  })
  @ApiOkResponse({ type: AddressSearchResponseDto })
  search(@Query() query: AddressSearchQueryDto) {
    return this.addressesService.search(query);
  }

  @Get('geocode')
  @ApiOperation({
    summary: '주소를 좌표(위경도)로 변환합니다.',
    description:
      'VWorld Geocoder API를 호출하여 완전한 주소 문자열을 좌표로 변환합니다. 검색 API 결과에 좌표가 이미 포함되어 있으므로, 보통은 검색 API만으로 충분합니다.',
  })
  @ApiOkResponse({ type: AddressGeocodeResponseDto })
  geocode(@Query() query: AddressGeocodeQueryDto) {
    return this.addressesService.geocode(query);
  }
}
