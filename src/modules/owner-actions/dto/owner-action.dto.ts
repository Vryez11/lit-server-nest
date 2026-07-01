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
}

export class OwnerActionResultDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty() updatedCount!: number;
}
