import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { getKstDateRange } from '../../dashboard/utils/kst-date-range.util';
import { ADMIN_DEFAULT_RANGE_DAYS, notImplemented } from '../admin.constants';
import {
  AdminDateRangeQueryDto,
  AdminStoreListQueryDto,
  AdminStoreListResponseDto,
  AdminStoreSummaryResponseDto,
} from '../dto/admin-store-ops.dto';
import { AdminStoreService } from './admin-store.service';

/**
 * 4.1 목록 · 4.2 요약 (store-operations.md §7.2). PR-3에서 본문을 채운다.
 * 뼈대 단계에서도 기간 검증(400)과 매장 존재 확인(404)은 실제로 동작한다.
 */
@Injectable()
export class AdminStoreMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminStoreService: AdminStoreService,
  ) {}

  listStores(
    query: AdminStoreListQueryDto,
  ): Promise<AdminStoreListResponseDto> {
    getKstDateRange(query, ADMIN_DEFAULT_RANGE_DAYS);

    throw notImplemented('GET /api/admin/stores');
  }

  async getStoreSummary(
    storeId: string,
    query: AdminDateRangeQueryDto,
  ): Promise<AdminStoreSummaryResponseDto> {
    await this.adminStoreService.getStoreOrThrow(storeId);
    getKstDateRange(query, ADMIN_DEFAULT_RANGE_DAYS);

    throw notImplemented('GET /api/admin/stores/:storeId/summary');
  }
}
