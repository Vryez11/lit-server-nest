import { ApiProperty } from '@nestjs/swagger';

export class DashboardReservationStatusCountsDto {
  @ApiProperty()
  pending!: number;

  @ApiProperty()
  pendingApproval!: number;

  @ApiProperty()
  confirmed!: number;

  @ApiProperty()
  rejected!: number;

  @ApiProperty()
  inProgress!: number;

  @ApiProperty()
  completed!: number;

  @ApiProperty()
  cancelled!: number;
}

export class DashboardStorageStatusCountsDto {
  @ApiProperty()
  available!: number;

  @ApiProperty()
  occupied!: number;

  @ApiProperty()
  maintenance!: number;
}

export class DashboardSummaryReservationsDto extends DashboardReservationStatusCountsDto {
  @ApiProperty()
  total!: number;
}

export class DashboardSummaryRevenueDto {
  @ApiProperty()
  totalRevenue!: number;

  @ApiProperty()
  paidPaymentCount!: number;
}

export class DashboardSummaryStoragesDto extends DashboardStorageStatusCountsDto {
  @ApiProperty()
  total!: number;
}

export class DashboardSummaryResponseDto {
  @ApiProperty({ example: '2026-04-26' })
  date!: string;

  @ApiProperty({ type: DashboardSummaryReservationsDto })
  reservations!: DashboardSummaryReservationsDto;

  @ApiProperty({ type: DashboardSummaryRevenueDto })
  revenue!: DashboardSummaryRevenueDto;

  @ApiProperty({ type: DashboardSummaryStoragesDto })
  storages!: DashboardSummaryStoragesDto;
}

export class DashboardRevenueDailyItemDto {
  @ApiProperty({ example: '2026-04-26' })
  date!: string;

  @ApiProperty()
  revenue!: number;

  @ApiProperty()
  paymentCount!: number;
}

export class DashboardRevenueResponseDto {
  @ApiProperty({ example: '2026-04-01' })
  from!: string;

  @ApiProperty({ example: '2026-04-26' })
  to!: string;

  @ApiProperty()
  totalRevenue!: number;

  @ApiProperty()
  paidPaymentCount!: number;

  @ApiProperty({ type: [DashboardRevenueDailyItemDto] })
  items!: DashboardRevenueDailyItemDto[];
}

export class DashboardReservationDailyItemDto extends DashboardReservationStatusCountsDto {
  @ApiProperty({ example: '2026-04-26' })
  date!: string;

  @ApiProperty()
  total!: number;
}

export class DashboardReservationsResponseDto {
  @ApiProperty({ example: '2026-04-01' })
  from!: string;

  @ApiProperty({ example: '2026-04-26' })
  to!: string;

  @ApiProperty()
  totalReservations!: number;

  @ApiProperty({ type: DashboardReservationStatusCountsDto })
  byStatus!: DashboardReservationStatusCountsDto;

  @ApiProperty({ type: [DashboardReservationDailyItemDto] })
  items!: DashboardReservationDailyItemDto[];
}

export class DashboardStorageTypeItemDto extends DashboardStorageStatusCountsDto {
  @ApiProperty({ example: 's' })
  type!: string;

  @ApiProperty()
  total!: number;
}

export class DashboardStoragesResponseDto {
  @ApiProperty()
  total!: number;

  @ApiProperty({ type: DashboardStorageStatusCountsDto })
  byStatus!: DashboardStorageStatusCountsDto;

  @ApiProperty({ type: [DashboardStorageTypeItemDto] })
  byType!: DashboardStorageTypeItemDto[];
}
