import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  MinLength,
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

  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  comment!: string;

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
