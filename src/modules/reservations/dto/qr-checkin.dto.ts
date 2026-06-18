import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  reservations_requested_storage_type,
  reservations_status,
} from '@prisma/client';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class QrCheckinDto {
  @ApiProperty({ description: '예약 QR 코드 토큰 (qr_code 필드값)' })
  @IsString()
  @MaxLength(500)
  token!: string;

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[] = [];
}

export class QrCheckoutDto {
  @ApiProperty({ description: '예약 QR 코드 토큰 (qr_code 필드값)' })
  @IsString()
  @MaxLength(500)
  token!: string;
}

export class QrCheckinResponseDto {
  @ApiProperty()
  reservationId!: string;

  @ApiProperty({ enum: reservations_status })
  status!: reservations_status;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  customerPhone!: string;

  @ApiProperty()
  bagCount!: number;

  @ApiPropertyOptional({ enum: reservations_requested_storage_type })
  storageType?: reservations_requested_storage_type | null;

  @ApiPropertyOptional()
  storageNumber?: string | null;

  @ApiPropertyOptional()
  startTime?: Date;

  @ApiPropertyOptional()
  endTime?: Date | null;

  @ApiProperty({ description: '체크인 시 발급된 쿠폰 수' })
  issuedCouponCount!: number;
}

export class QrCheckoutResponseDto {
  @ApiProperty()
  reservationId!: string;

  @ApiProperty({ enum: reservations_status })
  status!: reservations_status;

  @ApiProperty({ description: '미사용 쿠폰이 있으면 true' })
  hasUnusedCoupon!: boolean;
}
