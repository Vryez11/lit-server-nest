import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AuthThrottlerGuard } from '../auth/guards/auth-throttler.guard';
import {
  AdminDateRangeQueryDto,
  AdminPlatformTimeseriesResponseDto,
  AdminStoreListQueryDto,
  AdminStoreListResponseDto,
  AdminStoreReservationsQueryDto,
  AdminStoreSummaryResponseDto,
  AdminStoreTimeseriesQueryDto,
  AdminStoreTimeseriesResponseDto,
  ReservationListResponseDto,
} from './dto/admin-store-ops.dto';
import { AdminStoreMetricsService } from './services/admin-store-metrics.service';
import { AdminStoreReservationsService } from './services/admin-store-reservations.service';
import { AdminStoreTimeseriesService } from './services/admin-store-timeseries.service';

/**
 * F-018 관리자 매장 운영 현황. 정적 경로 `timeseries`(플랫폼 추이)는 `:storeId/*`
 * 라우트보다 먼저 선언한다 — 이후 `GET :storeId`가 생겨도 `timeseries`가 storeId로
 * 잡히지 않게 하는 정적 경로 우선 원칙(store-operations.md §4).
 */
@ApiTags('Admin Stores')
@ApiBearerAuth()
@UseGuards(AuthThrottlerGuard, AdminAuthGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('api/admin/stores')
export class AdminStoresController {
  constructor(
    private readonly metricsService: AdminStoreMetricsService,
    private readonly timeseriesService: AdminStoreTimeseriesService,
    private readonly reservationsService: AdminStoreReservationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: '매장별 운영 지표 목록(기간·정렬·페이지).' })
  @ApiOkResponse({ type: AdminStoreListResponseDto })
  listStores(@Query() query: AdminStoreListQueryDto) {
    return this.metricsService.listStores(query);
  }

  @Get('timeseries')
  @ApiOperation({ summary: '플랫폼 전체 매장 합계의 일/주/월 추이.' })
  @ApiOkResponse({ type: AdminPlatformTimeseriesResponseDto })
  getPlatformTimeseries(@Query() query: AdminStoreTimeseriesQueryDto) {
    return this.timeseriesService.getPlatformTimeseries(query);
  }

  @Get(':storeId/summary')
  @ApiOperation({ summary: '매장 정보와 기간 운영 지표 요약.' })
  @ApiOkResponse({ type: AdminStoreSummaryResponseDto })
  getStoreSummary(
    @Param('storeId') storeId: string,
    @Query() query: AdminDateRangeQueryDto,
  ) {
    return this.metricsService.getStoreSummary(storeId, query);
  }

  @Get(':storeId/timeseries')
  @ApiOperation({ summary: '매장의 일/주/월 추이.' })
  @ApiOkResponse({ type: AdminStoreTimeseriesResponseDto })
  getStoreTimeseries(
    @Param('storeId') storeId: string,
    @Query() query: AdminStoreTimeseriesQueryDto,
  ) {
    return this.timeseriesService.getStoreTimeseries(storeId, query);
  }

  @Get(':storeId/reservations')
  @ApiOperation({ summary: '매장 예약 목록(관리자, no_show 포함 상태 필터).' })
  @ApiOkResponse({ type: ReservationListResponseDto })
  listStoreReservations(
    @Param('storeId') storeId: string,
    @Query() query: AdminStoreReservationsQueryDto,
  ) {
    return this.reservationsService.listStoreReservations(storeId, query);
  }
}
