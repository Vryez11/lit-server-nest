import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class AddressSearchQueryDto {
  @ApiProperty({ example: '서울시청', description: '검색어' })
  @IsString()
  @MinLength(1)
  query!: string;

  @ApiPropertyOptional({
    example: 10,
    default: 10,
    minimum: 1,
    maximum: 30,
    description: '한 페이지에 반환할 결과 개수',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  size?: number;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    minimum: 1,
    description: '페이지 번호 (1부터 시작)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    enum: ['road', 'parcel'],
    default: 'road',
    description: '주소 종류 (road=도로명, parcel=지번)',
  })
  @IsOptional()
  @IsIn(['road', 'parcel'])
  category?: 'road' | 'parcel';
}

export class AddressSearchItemDto {
  @ApiProperty({ description: 'VWorld 내부 식별자' })
  id!: string;

  @ApiProperty({
    example: '서울특별시 중구 세종대로 110',
    description: '도로명 주소',
  })
  roadAddress!: string;

  @ApiProperty({
    example: '서울특별시 중구 태평로1가 31',
    description: '지번 주소',
  })
  jibunAddress!: string;

  @ApiProperty({ example: '04524', nullable: true, description: '우편번호' })
  zipcode!: string | null;

  @ApiProperty({
    example: '서울특별시청',
    nullable: true,
    description: '건물명',
  })
  buildingName!: string | null;

  @ApiProperty({ example: 126.9779451, description: '경도 (longitude)' })
  longitude!: number;

  @ApiProperty({ example: 37.5663174, description: '위도 (latitude)' })
  latitude!: number;
}

export class AddressSearchResponseDto {
  @ApiProperty({ type: [AddressSearchItemDto] })
  items!: AddressSearchItemDto[];

  @ApiProperty({ example: 1, description: '총 결과 개수' })
  total!: number;

  @ApiProperty({ example: 1, description: '현재 페이지' })
  page!: number;

  @ApiProperty({ example: 10, description: '페이지 크기' })
  size!: number;
}

export class AddressGeocodeQueryDto {
  @ApiProperty({
    example: '서울특별시 중구 세종대로 110',
    description: '좌표로 변환할 주소 (도로명 또는 지번)',
  })
  @IsString()
  @MinLength(1)
  address!: string;

  @ApiPropertyOptional({
    enum: ['ROAD', 'PARCEL'],
    default: 'ROAD',
    description: '주소 종류 (ROAD=도로명, PARCEL=지번)',
  })
  @IsOptional()
  @IsIn(['ROAD', 'PARCEL'])
  type?: 'ROAD' | 'PARCEL';
}

export class AddressGeocodeResponseDto {
  @ApiProperty({ example: '서울특별시 중구 세종대로 110' })
  address!: string;

  @ApiProperty({ example: 126.9779451 })
  longitude!: number;

  @ApiProperty({ example: 37.5663174 })
  latitude!: number;
}
