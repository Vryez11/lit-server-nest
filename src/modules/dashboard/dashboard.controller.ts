import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentStoreId } from '../auth/decorators/current-store.decorator';
import { StoreAuthGuard } from '../auth/guards/store-auth.guard';
import { DashboardDateRangeQueryDto } from './dto/dashboard-query.dto';
import {
  DashboardReservationsResponseDto,
  DashboardRevenueResponseDto,
  DashboardStoragesResponseDto,
  DashboardSummaryResponseDto,
} from './dto/dashboard-response.dto';
import { DashboardQueryService } from './services/dashboard-query.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(StoreAuthGuard)
@Controller('api/dashboard')
export class DashboardController {
  constructor(private readonly dashboardQueryService: DashboardQueryService) {}

  @Get('summary')
  @ApiOperation({ summary: '대시보드 요약 지표를 조회합니다.' })
  @ApiOkResponse({ type: DashboardSummaryResponseDto })
  getSummary(@CurrentStoreId() storeId: string) {
    return this.dashboardQueryService.getSummary(storeId);
  }

  @Get('revenue')
  @ApiOperation({ summary: '일자별 매출 지표를 조회합니다.' })
  @ApiOkResponse({ type: DashboardRevenueResponseDto })
  getRevenue(
    @CurrentStoreId() storeId: string,
    @Query() query: DashboardDateRangeQueryDto,
  ) {
    return this.dashboardQueryService.getRevenue(storeId, query);
  }

  @Get('reservations')
  @ApiOperation({ summary: '일자별 예약 지표를 조회합니다.' })
  @ApiOkResponse({ type: DashboardReservationsResponseDto })
  getReservations(
    @CurrentStoreId() storeId: string,
    @Query() query: DashboardDateRangeQueryDto,
  ) {
    return this.dashboardQueryService.getReservations(storeId, query);
  }

  @Get('storages')
  @ApiOperation({ summary: '보관함 운영 현황을 조회합니다.' })
  @ApiOkResponse({ type: DashboardStoragesResponseDto })
  getStorages(@CurrentStoreId() storeId: string) {
    return this.dashboardQueryService.getStorages(storeId);
  }
}
