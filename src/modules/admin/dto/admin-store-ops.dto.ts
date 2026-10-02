import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  reservations_status,
  store_status_status,
  stores_business_type,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  emptyToUndefined,
  optionalBoolean,
  optionalNumber,
} from '../../../common/transformers/legacy-input.transformer';
import {
  ReservationListResponseDto,
  ReservationResponseDto,
} from '../../reservations/dto/reservation.dto';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Query ----------

export class AdminDateRangeQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-01',
    description: 'KST 일자(YYYY-MM-DD). 기본값은 to − 29일.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @Matches(DATE_PATTERN, { message: 'from은 YYYY-MM-DD 형식이어야 합니다.' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-30',
    description: 'KST 일자(YYYY-MM-DD). 기본값은 오늘.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @Matches(DATE_PATTERN, { message: 'to는 YYYY-MM-DD 형식이어야 합니다.' })
  to?: string;
}

export enum AdminStoreSortBy {
  ReservationRevenue = 'reservationRevenue',
  PaymentRevenue = 'paymentRevenue',
  ReservationCount = 'reservationCount',
  NoShowCount = 'noShowCount',
  NoShowRate = 'noShowRate',
  CancellationRate = 'cancellationRate',
  CompletionRate = 'completionRate',
  BusinessName = 'businessName',
  CreatedAt = 'createdAt',
}

export enum AdminSortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

export class AdminStoreListQueryDto extends AdminDateRangeQueryDto {
  @ApiPropertyOptional({
    description: 'business_name 부분일치',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description: 'true → 설정 완료 매장만, false → 미완료(NULL 포함)만',
  })
  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  hasCompletedSetup?: boolean;

  @ApiPropertyOptional({
    enum: AdminStoreSortBy,
    default: AdminStoreSortBy.ReservationRevenue,
  })
  @IsOptional()
  @IsEnum(AdminStoreSortBy)
  sortBy: AdminStoreSortBy = AdminStoreSortBy.ReservationRevenue;

  @ApiPropertyOptional({ enum: AdminSortOrder, default: AdminSortOrder.Desc })
  @IsOptional()
  @IsEnum(AdminSortOrder)
  sortOrder: AdminSortOrder = AdminSortOrder.Desc;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export enum AdminTimeseriesGranularity {
  Day = 'day',
  Week = 'week',
  Month = 'month',
}

/** 4.3(매장별)·4.5(플랫폼) 추이 공용 쿼리. */
export class AdminStoreTimeseriesQueryDto extends AdminDateRangeQueryDto {
  @ApiPropertyOptional({
    enum: AdminTimeseriesGranularity,
    default: AdminTimeseriesGranularity.Day,
    description: 'week는 월요일 시작(KST)',
  })
  @IsOptional()
  @IsEnum(AdminTimeseriesGranularity)
  granularity: AdminTimeseriesGranularity = AdminTimeseriesGranularity.Day;
}

export class AdminStoreReservationsQueryDto extends AdminDateRangeQueryDto {
  @ApiPropertyOptional({ enum: reservations_status })
  @IsOptional()
  @IsEnum(reservations_status)
  status?: reservations_status;

  @ApiPropertyOptional({
    description: '고객명·전화번호 부분일치 또는 예약 id 일치',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

// ---------- Response ----------

export class AdminDateRangeDto {
  @ApiProperty({ example: '2026-09-01' })
  from: string;

  @ApiProperty({ example: '2026-09-30' })
  to: string;
}

export class StoreOpsMetricsDto {
  @ApiProperty({
    description: '예약 기준 매출(원). payment_status=paid 행의 total_amount 합',
  })
  reservationRevenue: number;

  @ApiProperty({ description: 'PG 결제 기준 총매출(원). paid_at 기준' })
  paymentRevenue: number;

  @ApiProperty({ description: 'PG 환불·취소액(원). canceled_at 기준' })
  refundedAmount: number;

  @ApiProperty({ description: 'paymentRevenue 집계 대상 결제 건수' })
  paymentCount: number;

  @ApiProperty({ description: '예약 그룹 수(대표 행 기준)' })
  reservationCount: number;

  @ApiProperty({ description: 'pending + pending_approval' })
  pendingCount: number;

  @ApiProperty({ description: 'confirmed + in_progress' })
  activeCount: number;

  @ApiProperty()
  completedCount: number;

  @ApiProperty()
  cancelledCount: number;

  @ApiProperty()
  rejectedCount: number;

  @ApiProperty()
  noShowCount: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'noShow / (completed + noShow) × 100, 소수 1자리. 분모 0 → null',
  })
  noShowRate: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'completed / reservationCount × 100. 분모 0 → null',
  })
  completionRate: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      '(cancelled + rejected) / reservationCount × 100. 분모 0 → null',
  })
  cancellationRate: number | null;
}

export class AdminStoreListItemDto {
  @ApiProperty()
  storeId: string;

  @ApiProperty()
  businessName: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional({ enum: stores_business_type, nullable: true })
  businessType: stores_business_type | null;

  @ApiProperty({ description: 'NULL은 false로 노출' })
  hasCompletedSetup: boolean;

  @ApiProperty({
    enum: store_status_status,
    description: 'store_status 최신 행. 없으면 closed',
  })
  storeStatus: store_status_status;

  @ApiPropertyOptional({ nullable: true })
  createdAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  lastLoginAt: Date | null;

  @ApiProperty({ type: StoreOpsMetricsDto })
  metrics: StoreOpsMetricsDto;
}

export class AdminLocaleBreakdownDto {
  @ApiProperty({
    example: 'en',
    description: 'reservations.locale 저장값 그대로',
  })
  locale: string;

  @ApiProperty({ description: '그룹 단위 예약 건수' })
  reservationCount: number;
}

export class AdminStoreListMetaDto {
  @ApiProperty({ type: AdminDateRangeDto })
  range: AdminDateRangeDto;

  @ApiProperty({
    type: StoreOpsMetricsDto,
    description: '필터 적용 후 전체 매장 합계(현재 페이지 합이 아님)',
  })
  totals: StoreOpsMetricsDto;

  @ApiProperty({ description: '기간 내 reservationCount ≥ 1인 매장 수' })
  activeStoreCount: number;

  @ApiProperty({
    type: [AdminLocaleBreakdownDto],
    description: 'reservationCount desc, locale asc. 예약 없으면 []',
  })
  localeBreakdown: AdminLocaleBreakdownDto[];
}

export class AdminStoreListResponseDto {
  @ApiProperty({ type: [AdminStoreListItemDto] })
  items: AdminStoreListItemDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty({ description: '필터 적용 후 매장 수(데이터 유무 무관)' })
  total: number;

  @ApiProperty({ type: AdminStoreListMetaDto })
  meta: AdminStoreListMetaDto;
}

export class AdminStoreSummaryStoreDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  businessName: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional({ enum: stores_business_type, nullable: true })
  businessType: stores_business_type | null;

  @ApiPropertyOptional({ nullable: true })
  businessNumber: string | null;

  @ApiPropertyOptional({ nullable: true })
  representativeName: string | null;

  @ApiPropertyOptional({ nullable: true })
  address: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: '점주 개인 번호(관리자 화면)',
  })
  phoneNumber: string | null;

  @ApiPropertyOptional({ nullable: true })
  storePhoneNumber: string | null;

  @ApiProperty()
  hasCompletedSetup: boolean;

  @ApiProperty({ enum: store_status_status })
  storeStatus: store_status_status;

  @ApiPropertyOptional({ nullable: true })
  createdAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  lastLoginAt: Date | null;
}

export class AdminStoreSummaryResponseDto {
  @ApiProperty({ type: AdminStoreSummaryStoreDto })
  store: AdminStoreSummaryStoreDto;

  @ApiProperty({ type: AdminDateRangeDto })
  range: AdminDateRangeDto;

  @ApiProperty({ type: StoreOpsMetricsDto })
  metrics: StoreOpsMetricsDto;
}

export class AdminTimeseriesBucketDto {
  @ApiProperty({
    example: '2026-09-01',
    description:
      'day: YYYY-MM-DD, week: 해당 주 월요일 YYYY-MM-DD, month: YYYY-MM',
  })
  date: string;

  @ApiProperty()
  reservationRevenue: number;

  @ApiProperty()
  paymentRevenue: number;

  @ApiProperty()
  refundedAmount: number;

  @ApiProperty()
  reservationCount: number;

  @ApiProperty()
  completedCount: number;

  @ApiProperty()
  cancelledCount: number;

  @ApiProperty()
  rejectedCount: number;

  @ApiProperty()
  noShowCount: number;
}

export class AdminPlatformTimeseriesResponseDto {
  @ApiProperty({ enum: AdminTimeseriesGranularity })
  granularity: AdminTimeseriesGranularity;

  @ApiProperty({ type: AdminDateRangeDto })
  range: AdminDateRangeDto;

  @ApiProperty({ type: [AdminTimeseriesBucketDto] })
  buckets: AdminTimeseriesBucketDto[];
}

export class AdminStoreTimeseriesResponseDto extends AdminPlatformTimeseriesResponseDto {
  @ApiProperty()
  storeId: string;
}

/** 4.4 응답은 점주 예약 목록과 동일 형태를 그대로 쓴다. */
export { ReservationListResponseDto, ReservationResponseDto };
