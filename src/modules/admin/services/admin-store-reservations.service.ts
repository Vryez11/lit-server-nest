import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { getKstDateRange } from '../../dashboard/utils/kst-date-range.util';
import { ADMIN_DEFAULT_RANGE_DAYS, notImplemented } from '../admin.constants';
import {
  AdminStoreReservationsQueryDto,
  ReservationListResponseDto,
} from '../dto/admin-store-ops.dto';
import { AdminStoreService } from './admin-store.service';

/**
 * 4.4 매장 예약 목록(관리자) (store-operations.md §7.5). PR-5에서 본문을 채운다.
 * from/to는 선택이며 하나라도 주어졌을 때만 created_at 범위를 적용한다.
 */
@Injectable()
export class AdminStoreReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminStoreService: AdminStoreService,
  ) {}

  async listStoreReservations(
    storeId: string,
    query: AdminStoreReservationsQueryDto,
  ): Promise<ReservationListResponseDto> {
    await this.adminStoreService.getStoreOrThrow(storeId);

    if (query.from !== undefined || query.to !== undefined) {
      getKstDateRange(query, ADMIN_DEFAULT_RANGE_DAYS);
    }

    throw notImplemented('GET /api/admin/stores/:storeId/reservations');
  }
}
