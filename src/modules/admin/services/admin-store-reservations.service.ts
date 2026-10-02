import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { getKstDateRange } from '../../dashboard/utils/kst-date-range.util';
import { toReservationResponse } from '../../reservations/mappers/reservation.mapper';
import { ADMIN_DEFAULT_RANGE_DAYS } from '../admin.constants';
import {
  AdminStoreReservationsQueryDto,
  ReservationListResponseDto,
} from '../dto/admin-store-ops.dto';
import { AdminStoreService } from './admin-store.service';

/**
 * 4.4 매장 예약 목록(관리자) (store-operations.md §7.5).
 *
 * 응답은 점주 예약 목록과 같은 형태(행 단위 N건 + groupId)이며, 기간 필터는
 * 지표 코호트와 같은 created_at 기준이라 "위 노쇼 N건 보기" 드릴다운이 맞아떨어진다.
 * ReservationQueryService는 모듈 밖으로 export되지 않으므로 Prisma를 직접 조회하고
 * 순수 매퍼만 재사용한다.
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

    const where = this.buildWhere(storeId, query);
    const [total, reservations] = await Promise.all([
      this.prisma.reservations.count({ where }),
      this.prisma.reservations.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      items: reservations.map(toReservationResponse),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  private buildWhere(
    storeId: string,
    query: AdminStoreReservationsQueryDto,
  ): Prisma.reservationsWhereInput {
    // from/to 중 하나라도 주어졌을 때만 범위를 적용한다(미지정 시 전체 기간).
    const range =
      query.from !== undefined || query.to !== undefined
        ? getKstDateRange(query, ADMIN_DEFAULT_RANGE_DAYS)
        : null;

    return {
      store_id: storeId,
      ...(query.status ? { status: query.status } : {}),
      ...(range
        ? { created_at: { gte: range.start, lt: range.endExclusive } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { customer_name: { contains: query.search } },
              { customer_phone: { contains: query.search } },
              { id: { equals: query.search } },
            ],
          }
        : {}),
    };
  }
}
