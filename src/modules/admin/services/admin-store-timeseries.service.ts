import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { getKstDateRange } from '../../dashboard/utils/kst-date-range.util';
import { ADMIN_DEFAULT_RANGE_DAYS, notImplemented } from '../admin.constants';
import {
  AdminPlatformTimeseriesResponseDto,
  AdminStoreTimeseriesQueryDto,
  AdminStoreTimeseriesResponseDto,
} from '../dto/admin-store-ops.dto';
import { AdminStoreService } from './admin-store.service';

/**
 * 4.3 매장별 추이 · 4.5 플랫폼 전체 추이 (store-operations.md §7.4).
 * PR-4에서 본문을 채운다. 두 엔드포인트는 storeId 유무만 다른 같은 버킷 로직을 쓴다.
 */
@Injectable()
export class AdminStoreTimeseriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminStoreService: AdminStoreService,
  ) {}

  async getStoreTimeseries(
    storeId: string,
    query: AdminStoreTimeseriesQueryDto,
  ): Promise<AdminStoreTimeseriesResponseDto> {
    await this.adminStoreService.getStoreOrThrow(storeId);
    getKstDateRange(query, ADMIN_DEFAULT_RANGE_DAYS);

    throw notImplemented('GET /api/admin/stores/:storeId/timeseries');
  }

  getPlatformTimeseries(
    query: AdminStoreTimeseriesQueryDto,
  ): Promise<AdminPlatformTimeseriesResponseDto> {
    getKstDateRange(query, ADMIN_DEFAULT_RANGE_DAYS);

    throw notImplemented('GET /api/admin/stores/timeseries');
  }
}
