import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OwnerActionItemDto {
  @ApiProperty() storageType!: string;
  @ApiProperty() bagCount!: number;
}

export class OwnerReservationSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ description: '마스킹된 고객명 (홍*동)' })
  customerName!: string;
  @ApiProperty({ type: [OwnerActionItemDto] }) items!: OwnerActionItemDto[];
  @ApiProperty() startTime!: Date;
  @ApiPropertyOptional() endTime!: Date | null;
  @ApiPropertyOptional() actualStartTime!: Date | null;
  @ApiPropertyOptional() actualEndTime!: Date | null;
  @ApiProperty({ description: 'start_time 경과 여부 — 노쇼 버튼 활성 조건' })
  canMarkNoShow!: boolean;
  @ApiProperty({ description: '예약 언어 (ko/en/ja/zh) — 고객 소통·메모 번역 힌트' })
  locale!: string;
  @ApiProperty({ type: [String], description: '고객이 첨부한 짐 사진 R2 URL (없으면 빈 배열)' })
  luggageImageUrls!: string[];
  @ApiPropertyOptional({ description: '고객이 남긴 짐 메모' })
  luggageCustomerMemo!: string | null;
  @ApiPropertyOptional({ description: '점주가 남긴 짐 확인 메모' })
  luggageOwnerMemo!: string | null;
}

export class OwnerActionResultDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty() updatedCount!: number;
}
