import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateGuestReviewDto {
  @ApiProperty() @IsString() @MaxLength(255) reservationId!: string;

  @ApiProperty({ description: '예약 조회 토큰 (알림 링크에 포함)' })
  @IsString()
  @MaxLength(255)
  token!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  // 텍스트 리뷰는 선택 — 별점만으로 제출 가능 (2026-07-03, 외국인 이탈 방지).
  // 미입력 시 landing이 필드를 생략하고 DB에는 ''로 저장한다.
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional({ type: [String], description: 'R2 공개 URL, 최대 3장' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsUrl({}, { each: true })
  photoUrls?: string[];
}

export class GuestReviewResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() rating!: number;
  @ApiProperty() comment!: string;
  @ApiProperty({ type: [String] }) photoUrls!: string[];
}
